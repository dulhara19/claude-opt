/**
 * UserPromptSubmit hook — augments user prompts with file prediction context.
 * Reads hook event JSON from stdin, outputs context JSON to stdout.
 * Cannot modify the prompt — injects predictions as additionalContext.
 * Fail-open: on any error, exits silently (allows prompt to proceed).
 */

import { classifyTask } from '../analyzer/index.js';
import { predictFiles } from '../predictor/index.js';
import { readProjectMap, readKeywordIndex, readPatterns, readMetrics, readDependencyGraph, readTaskHistory } from '../store/index.js';
import type { PipelineContext, StoreCache } from '../types/index.js';

interface HookInput {
  session_id: string;
  hook_event_name: string;
  prompt: string;
  cwd?: string;
}

const PREDICTION_SCORE_THRESHOLD = 0.6;
const MAX_PREDICTIONS_IN_HINT = 5;
const MAX_CONVENTIONS_IN_HINT = 3;
const MAX_CONTEXT_CHARS = 500;

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

async function main(): Promise<void> {
  let input: HookInput;

  try {
    const raw = await readStdin();
    input = JSON.parse(raw) as HookInput;
  } catch {
    process.exit(0);
    return;
  }

  try {
    const projectRoot = input.cwd || process.env.PROJECT_ROOT || process.cwd();
    const prompt = input.prompt;

    if (!prompt) {
      process.exit(0);
      return;
    }

    // Load project data into cache (shared across classify + predict)
    const projectMapResult = readProjectMap(projectRoot);
    const keywordIndexResult = readKeywordIndex(projectRoot);
    const patternsResult = readPatterns(projectRoot);
    const metricsResult = readMetrics(projectRoot);
    const depGraphResult = readDependencyGraph(projectRoot);
    const taskHistoryResult = readTaskHistory(projectRoot);

    const storeCache: StoreCache = {
      projectMap: projectMapResult.ok ? projectMapResult.value : undefined,
      keywordIndex: keywordIndexResult.ok ? keywordIndexResult.value : undefined,
      patterns: patternsResult.ok ? patternsResult.value : undefined,
      metrics: metricsResult.ok ? metricsResult.value : undefined,
      dependencyGraph: depGraphResult.ok ? depGraphResult.value : undefined,
      taskHistory: taskHistoryResult.ok ? taskHistoryResult.value : undefined,
    };

    // Classify the task
    const classification = classifyTask(
      prompt,
      storeCache.projectMap,
      storeCache.keywordIndex,
      storeCache.patterns,
      storeCache.metrics,
    );

    // Build context for prediction (with cache)
    const ctx: PipelineContext = {
      taskText: prompt,
      workingDir: projectRoot,
      isDryRun: true,
      results: {},
      startedAt: Date.now(),
      storeCache,
      classification,
    };

    // Predict files
    const prediction = predictFiles(ctx);

    // Filter by threshold and limit
    const topPredictions = prediction.predictions
      .filter((p) => p.score >= PREDICTION_SCORE_THRESHOLD)
      .slice(0, MAX_PREDICTIONS_IN_HINT);

    if (topPredictions.length === 0) {
      process.exit(0);
      return;
    }

    // Build richer context (#5)
    const parts: string[] = [];

    // Domain + task type context
    parts.push(`Task: ${classification.type} (${classification.complexity}) in ${classification.domain}`);

    // Files with top 2 signal reasons
    const fileEntries = topPredictions.map((p) => {
      const topSignals = p.signals
        .sort((a, b) => b.score * b.weight - a.score * a.weight)
        .slice(0, 2)
        .map((s) => s.source)
        .join('+');
      return `${p.filePath} (${Math.round(p.score * 100)}%,${topSignals})`;
    });
    parts.push(`Files: ${fileEntries.join(', ')}`);

    // Up to 3 conventions
    const conventions = storeCache.patterns?.conventions ?? [];
    if (conventions.length > 0) {
      const topConventions = conventions
        .slice(0, MAX_CONVENTIONS_IN_HINT)
        .map((c) => c.description);
      parts.push(`Conv: ${topConventions.join('; ')}`);
    }

    // Join and cap at MAX_CONTEXT_CHARS
    let context = `[claude-opt] ${parts.join(' | ')}`;
    if (context.length > MAX_CONTEXT_CHARS) {
      context = context.slice(0, MAX_CONTEXT_CHARS - 3) + '...';
    }

    const output = {
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: context,
      },
    };
    process.stdout.write(JSON.stringify(output));
  } catch {
    process.exit(0);
  }
}

main().catch(() => {
  process.exit(0);
});
