/**
 * Dry-run pipeline execution — runs analysis stages without executing.
 * Implements AC5, AC6: full analysis display with zero side effects.
 */

import chalk from 'chalk';
import type { PipelineContext, ClassificationResult, ProjectMap, KeywordIndex } from '../types/index.js';
import type { PredictionResult } from '../predictor/index.js';
import { withFailOpen, logger, CONFIDENCE_THRESHOLD } from '../utils/index.js';
import { classifyTask, DEFAULT_CLASSIFICATION } from '../analyzer/index.js';
import { predictFiles } from '../predictor/index.js';
import { selectModel, DEFAULT_ROUTING } from '../router/index.js';
import { compressPrompt, DEFAULT_COMPRESSION } from '../compressor/index.js';
import { readProjectMap, readKeywordIndex } from '../store/index.js';
import type { DryRunResult, DryRunFilePrediction } from './types.js';
import { drawBox } from './formatters.js';

const MODULE = 'dry-run';
const HIGH_CONFIDENCE_THRESHOLD = 0.7;

/** Default prediction result for fail-open fallback. */
const DEFAULT_PREDICTION: PredictionResult = {
  predictions: [],
  totalCandidates: 0,
  threshold: CONFIDENCE_THRESHOLD,
  durationMs: 0,
};

/**
 * Execute the dry-run pipeline — all analysis stages, zero side effects.
 * No subprocess spawn, no store writes, no token tracking.
 */
export function executeDryRun(userPrompt: string, workingDir: string): DryRunResult {
  // Create a pipeline context for reusing pipeline stage functions
  let ctx: PipelineContext = {
    taskText: userPrompt,
    workingDir,
    isDryRun: true,
    results: {},
    startedAt: Date.now(),
  };

  // Stage 1: Analyze (sync, fail-open)
  ctx = withFailOpen(
    () => {
      const projectMapResult = readProjectMap(ctx.workingDir);
      const keywordIndexResult = readKeywordIndex(ctx.workingDir);
      const projectMap: ProjectMap | undefined = projectMapResult.ok ? projectMapResult.value : undefined;
      const keywordIndex: KeywordIndex | undefined = keywordIndexResult.ok ? keywordIndexResult.value : undefined;
      const classification: ClassificationResult = classifyTask(ctx.taskText, projectMap, keywordIndex);
      return { ...ctx, classification };
    },
    { ...ctx, classification: { ...DEFAULT_CLASSIFICATION } },
    MODULE,
  );

  // Stage 2: Predict (sync, fail-open)
  ctx = withFailOpen(() => {
    const prediction = predictFiles(ctx);
    return { ...ctx, prediction };
  }, { ...ctx, prediction: DEFAULT_PREDICTION }, MODULE);

  // Stage 3: Route (sync, fail-open)
  ctx = withFailOpen(() => {
    const routing = selectModel(ctx);
    return { ...ctx, routing };
  }, { ...ctx, routing: DEFAULT_ROUTING }, MODULE);

  // Stage 4: Compress (sync, fail-open)
  ctx = withFailOpen(() => {
    const compression = compressPrompt(ctx);
    return { ...ctx, compression };
  }, {
    ...ctx,
    compression: {
      ...DEFAULT_COMPRESSION,
      optimizedPrompt: ctx.taskText,
      originalLength: ctx.taskText.length,
      compressedLength: ctx.taskText.length,
    },
  }, MODULE);

  // STOP HERE — no adapter, no learner, no tracker

  // Extract results into display structure
  const predictedFiles: DryRunFilePrediction[] = (ctx.prediction?.predictions ?? [])
    .map((p) => ({ path: p.filePath, confidence: p.score }))
    .sort((a, b) => b.confidence - a.confidence);

  const originalLength = ctx.compression?.originalLength ?? userPrompt.length;
  const compressedLength = ctx.compression?.compressedLength ?? userPrompt.length;
  const compressionReduction = originalLength > 0
    ? Math.round(((originalLength - compressedLength) / originalLength) * 100)
    : 0;

  // Rough token estimate: ~4 chars per token
  const estimatedTokenCost = Math.round(compressedLength / 4);
  const estimatedRawCost = Math.round(originalLength / 4);

  return {
    taskType: ctx.classification?.type ?? 'unknown',
    domain: ctx.classification?.domain ?? 'unknown',
    complexity: ctx.classification?.complexity ?? 'unknown',
    confidence: ctx.classification?.confidence ?? 0,
    model: ctx.routing?.model ?? 'unknown',
    routingReason: ctx.routing?.rationale ?? '',
    predictedFiles,
    compressionReduction,
    estimatedTokenCost,
    estimatedRawCost,
  };
}

/**
 * Render the dry-run result display.
 */
export function renderDryRun(result: DryRunResult): string {
  const lines: string[] = [];

  // Classification line
  lines.push(` Type: ${result.taskType}  Domain: ${result.domain}  Complexity: ${result.complexity}`);

  // Routing line
  lines.push(` Would route to: ${chalk.bold(result.model)}`);

  // Predicted files
  lines.push(` Predicted files (${result.predictedFiles.length}):`);
  for (const file of result.predictedFiles) {
    const icon = file.confidence >= HIGH_CONFIDENCE_THRESHOLD ? '\u2726' : '\u25cb';
    lines.push(`   ${icon} ${file.path.padEnd(35)} conf: ${file.confidence.toFixed(2)}`);
  }

  // Compression estimate
  lines.push(` Prompt compression: est. ${result.compressionReduction}% reduction`);
  lines.push(` Est. token cost: ~${result.estimatedTokenCost.toLocaleString('en-US')} (vs ~${result.estimatedRawCost.toLocaleString('en-US')} raw)`);

  return drawBox('Dry Run (no tokens spent)', lines);
}

/**
 * Run the dry-run and output to stdout.
 */
export async function runDryRunCommand(userPrompt: string, workingDir: string): Promise<void> {
  logger.info(MODULE, `Dry-run analysis for: "${userPrompt.slice(0, 80)}"`);
  const result = executeDryRun(userPrompt, workingDir);
  console.log(renderDryRun(result));
}
