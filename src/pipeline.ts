import type { PipelineContext, ClassificationResult, StoreCache, ProjectMap, KeywordIndex } from './types/index.js';
import type { PredictionResult } from './predictor/index.js';
import { withFailOpen, logger, CONFIDENCE_THRESHOLD } from './utils/index.js';
import { classifyTask, DEFAULT_CLASSIFICATION } from './analyzer/index.js';
import { predictFiles } from './predictor/index.js';
import { selectModel, DEFAULT_ROUTING } from './router/index.js';
import { compressPrompt, DEFAULT_COMPRESSION, reviewPrompt, ReviewAction } from './compressor/index.js';
import type { ReviewResult } from './compressor/index.js';
import { readProjectMap, readKeywordIndex, readConfig, readMetrics, readTaskHistory, readPatterns, readDependencyGraph } from './store/index.js';
import { showInlineFeedback, recordFeedback } from './visibility/index.js';
import { captureOutcome } from './learner/index.js';
import type { TaskSummary } from './visibility/index.js';
import { executeTaskFailOpen } from './adapter/index.js';
import { getActiveWindow, getWindowStatus, createWindow, trackUsage } from './tracker/index.js';
import type { WindowEntry, TrackingResult } from './tracker/types.js';
import { checkBudget, promptBudgetWarning } from './tracker/budget-warnings.js';
import { checkThresholds, runSupervised } from './doctor/supervised.js';
import { runAutonomous } from './doctor/autonomous.js';
import { DOCTOR_ACCURACY_THRESHOLD } from './utils/index.js';

const MODULE = 'pipeline';

/**
 * Load all store files once into a StoreCache.
 * Each read is fail-open — missing files result in undefined cache entries.
 */
function loadStoreCache(workingDir: string): StoreCache {
  const configResult = readConfig(workingDir);
  const projectMapResult = readProjectMap(workingDir);
  const dependencyGraphResult = readDependencyGraph(workingDir);
  const taskHistoryResult = readTaskHistory(workingDir);
  const patternsResult = readPatterns(workingDir);
  const metricsResult = readMetrics(workingDir);
  const keywordIndexResult = readKeywordIndex(workingDir);

  return {
    config: configResult.ok ? configResult.value : undefined,
    projectMap: projectMapResult.ok ? projectMapResult.value : undefined,
    dependencyGraph: dependencyGraphResult.ok ? dependencyGraphResult.value : undefined,
    taskHistory: taskHistoryResult.ok ? taskHistoryResult.value : undefined,
    patterns: patternsResult.ok ? patternsResult.value : undefined,
    metrics: metricsResult.ok ? metricsResult.value : undefined,
    keywordIndex: keywordIndexResult.ok ? keywordIndexResult.value : undefined,
  };
}

/**
 * Create an initial PipelineContext from a user prompt.
 */
function createContext(userPrompt: string, workingDir: string, isDryRun: boolean): PipelineContext {
  const storeCache = loadStoreCache(workingDir);

  return {
    taskText: userPrompt,
    workingDir,
    isDryRun,
    results: {},
    startedAt: Date.now(),
    storeCache,
  };
}

/**
 * Pipeline stage: Analyze task (classify type, domain, complexity).
 * Synchronous — keyword matching + learned pattern lookup.
 */
function analyzeStage(ctx: PipelineContext): PipelineContext {
  const cache = ctx.storeCache;

  const classification: ClassificationResult = classifyTask(
    ctx.taskText,
    cache?.projectMap,
    cache?.keywordIndex,
    cache?.patterns,
    cache?.metrics,
  );

  return { ...ctx, classification };
}

/** Default prediction result for fail-open fallback. */
const DEFAULT_PREDICTION: PredictionResult = {
  predictions: [],
  totalCandidates: 0,
  threshold: CONFIDENCE_THRESHOLD,
  durationMs: 0,
};

/**
 * Pipeline stage: Predict relevant files.
 */
function predictStage(ctx: PipelineContext): PipelineContext {
  const prediction = predictFiles(ctx);
  return { ...ctx, prediction };
}

/**
 * Pipeline stage: Route to optimal model based on task classification.
 */
function routeStage(ctx: PipelineContext): PipelineContext {
  const routing = selectModel(ctx);
  return { ...ctx, routing };
}

/**
 * Pipeline stage: Compress prompt and inject context.
 */
function compressStage(ctx: PipelineContext): PipelineContext {
  const compression = compressPrompt(ctx);
  return { ...ctx, compression };
}

/**
 * Pipeline stage: Prompt review UI (Story 2.5).
 * NOT wrapped with withFailOpen() — user interaction failures should abort.
 * Returns the ReviewResult alongside the context for the caller to handle cancel.
 */
async function reviewStage(ctx: PipelineContext): Promise<{ ctx: PipelineContext; review: ReviewResult }> {
  const review = await reviewPrompt(ctx);
  // If edited, update the compression's optimized prompt in context
  if (review.action === ReviewAction.Edit && review.wasEdited && ctx.compression) {
    ctx = {
      ...ctx,
      compression: {
        ...ctx.compression,
        optimizedPrompt: review.finalPrompt,
      },
    };
  }
  return { ctx, review };
}

/**
 * Pipeline stage: Claude Code adapter (Story 2.6).
 * Spawns Claude Code subprocess with optimized prompt and CLAUDE.md injection.
 * Uses fail-open: falls back to raw execution if optimization fails.
 */
async function adaptStage(ctx: PipelineContext): Promise<PipelineContext> {
  logger.info(MODULE, 'Executing Claude Code adapter stage');
  const adapterResult = await executeTaskFailOpen(ctx);
  return { ...ctx, adapterResult };
}

/**
 * Run the full optimization pipeline for a user task.
 *
 * Stages execute sequentially: Analyze → Predict → Route → Compress → Review → Adapt
 * Each pre-adapter stage is wrapped with withFailOpen() for graceful degradation.
 * The adapter stage is async (subprocess spawn).
 *
 * @param userPrompt - The user's task description
 * @param workingDir - Project root directory
 * @param isDryRun - If true, skip the adapter stage
 */
export async function runPipeline(
  userPrompt: string,
  workingDir: string,
  isDryRun = false,
): Promise<PipelineContext> {
  const startTime = performance.now();
  logger.info(MODULE, `Starting pipeline for: "${userPrompt.slice(0, 80)}${userPrompt.length > 80 ? '...' : ''}"`);

  let ctx = createContext(userPrompt, workingDir, isDryRun);

  // Stage 1: Analyze (sync, fail-open)
  ctx = withFailOpen(
    () => analyzeStage(ctx),
    { ...ctx, classification: { ...DEFAULT_CLASSIFICATION } },
    MODULE,
  );

  // Stage 2: Predict (sync, fail-open)
  ctx = withFailOpen(() => predictStage(ctx), { ...ctx, prediction: DEFAULT_PREDICTION }, MODULE);

  // Stage 3: Route (sync, fail-open)
  ctx = withFailOpen(() => routeStage(ctx), { ...ctx, routing: DEFAULT_ROUTING }, MODULE);

  // Stage 4: Compress (sync, fail-open)
  ctx = withFailOpen(
    () => compressStage(ctx),
    { ...ctx, compression: { ...DEFAULT_COMPRESSION, optimizedPrompt: ctx.taskText, originalLength: ctx.taskText.length, compressedLength: ctx.taskText.length } },
    MODULE,
  );

  // Stage 5: Budget check (fail-open — warning failure never blocks task)
  const budgetCheckResult = withFailOpen(
    () => {
      const cfg = ctx.storeCache?.config;
      const metrics = ctx.storeCache?.metrics;
      if (!cfg || !metrics) return null;

      const windows = (metrics.windows as unknown as WindowEntry[]) ?? [];
      let activeWindow = getActiveWindow(windows);
      if (!activeWindow) {
        activeWindow = createWindow(windows, cfg.windowDurationMs, cfg.tokenBudget);
      }
      const ws = getWindowStatus(activeWindow);
      return checkBudget(ws, cfg.budgetWarnings);
    },
    null,
    MODULE,
  );

  if (budgetCheckResult) {
    if (budgetCheckResult.level === 'exhausted' || budgetCheckResult.level === 'blocking') {
      try {
        const budgetResult = await promptBudgetWarning(budgetCheckResult);
        if (!budgetResult.shouldProceed) {
          logger.info(MODULE, `Pipeline aborted: user chose "${budgetResult.userChoice}" at budget warning`);
          return ctx;
        }
      } catch (error) {
        logger.error(MODULE, 'Budget prompt failed, proceeding (fail-open)', error);
      }
    } else if (budgetCheckResult.level === 'inline') {
      try {
        await promptBudgetWarning(budgetCheckResult);
      } catch {
        // Inline display failure is non-fatal
      }
    }
  }

  // Stage 6: Review (async, NOT fail-open — user interaction failures abort)
  try {
    const { ctx: reviewedCtx, review } = await reviewStage(ctx);
    ctx = reviewedCtx;

    // If cancelled, abort pipeline immediately — no tokens consumed
    // RV13: cancelledByUser flag preserved on context for learning pipeline
    if (review.action === ReviewAction.Cancel) {
      logger.info(MODULE, 'Pipeline aborted: user cancelled at review stage');
      const elapsed = performance.now() - startTime;
      logger.info(MODULE, `Pipeline cancelled after ${elapsed.toFixed(0)}ms`);
      return { ...ctx, results: { ...ctx.results, cancelledByUser: true } };
    }
  } catch (error) {
    logger.error(MODULE, 'Review stage failed', error);
    // Review failure is fatal — abort pipeline
    return ctx;
  }

  // Stage 7: Adapt (async) — only if not dry-run
  if (!isDryRun) {
    try {
      ctx = await adaptStage(ctx);
    } catch (error) {
      logger.error(MODULE, 'Adapter stage failed', error);
      // Adapter failure is non-fatal — return context without adapter result
    }
  }

  // Stage 8: Track token usage (sync, fail-open)
  let trackingResult: TrackingResult | undefined;
  if (!isDryRun && ctx.adapterResult) {
    const tracked = withFailOpen(
      () => {
        const tokensUsed = ctx.adapterResult?.tokenEstimate ?? 0;
        if (tokensUsed === 0) return undefined;

        const taskId = `t_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}_${Date.now() % 1000}`;
        const domain = ctx.classification?.domain ?? 'unknown';
        const predictionConfidence = ctx.classification?.confidence ?? 0;
        const compressionRatio = ctx.compression
          ? 1 - ctx.compression.compressedLength / ctx.compression.originalLength
          : 0;

        const result = trackUsage({
          taskId,
          tokensUsed,
          domain,
          predictionConfidence,
          compressionRatio,
          projectRoot: ctx.workingDir,
        });

        if (result.ok) return result.value;
        return undefined;
      },
      undefined,
      MODULE,
    );

    if (tracked) {
      trackingResult = tracked;
      const u = tracked.usage;
      const s = tracked.sessionStats;
      logger.info(MODULE, [
        `Tokens: ${u.tokensUsed.toLocaleString()} used`,
        `${u.estimatedUnoptimized.toLocaleString()} estimated without opt`,
        `${u.savings.toLocaleString()} saved (${(tracked.usage.savings / Math.max(u.estimatedUnoptimized, 1) * 100).toFixed(0)}%)`,
      ].join(' | '));
      logger.info(MODULE, `Session total: ${s.tokensConsumed.toLocaleString()} consumed, ${s.tokensSaved.toLocaleString()} saved across ${s.tasksCompleted} task(s)`);
    }
  }

  // Stage 9: Capture outcome for learning (sync, fail-open)
  if (!isDryRun && ctx.adapterResult) {
    withFailOpen(
      () => {
        captureOutcome(ctx);
        logger.debug(MODULE, 'Outcome captured — learner updated history, metrics, keywords, graph, patterns, weights');
      },
      undefined,
      MODULE,
    );
  }

  // Stage 10: Inline feedback (async, fail-open — feedback failure never blocks pipeline)
  if (!isDryRun && ctx.adapterResult) {
    withFailOpen(
      () => {
        const taskSummary: TaskSummary = {
          taskId: `task-${Date.now()}`,
          description: ctx.taskText.slice(0, 80),
          predictedCount: ctx.prediction?.predictions.length ?? 0,
          actualCount: ctx.adapterResult?.filesUsed?.length ?? 0,
          modelUsed: ctx.routing?.model ?? 'unknown',
          tokensConsumed: ctx.adapterResult?.tokenEstimate ?? 0,
        };

        // Fire-and-forget async feedback — wrapped in fail-open
        showInlineFeedback(taskSummary).then((feedback) => {
          if (feedback !== undefined) {
            // Find the latest task in history to record feedback against
            const historyResult = readTaskHistory(ctx.workingDir);
            if (historyResult.ok && historyResult.value.tasks.length > 0) {
              const latestTask = historyResult.value.tasks[historyResult.value.tasks.length - 1];
              recordFeedback(ctx.workingDir, latestTask.id, feedback);
            }
          }
        }).catch((feedbackErr) => {
          logger.error(MODULE, 'Feedback capture failed', feedbackErr);
        });
      },
      undefined,
      MODULE,
    );
  }

  // Stage 11: Doctor threshold check (supervised/autonomous mode, fail-open)
  // Runs after feedback/learner captures outcome — zero token cost for the check itself
  if (!isDryRun) {
    withFailOpen(
      () => {
        const cfg = ctx.storeCache?.config;
        const metrics = ctx.storeCache?.metrics;
        if (!cfg || !metrics) return;

        const mode = cfg.doctorMode;
        if (mode !== 'supervised' && mode !== 'autonomous') return;

        const alerts = checkThresholds(metrics, cfg.doctorThreshold ?? DOCTOR_ACCURACY_THRESHOLD);
        if (alerts.length > 0) {
          if (mode === 'supervised') {
            runSupervised(alerts, ctx.workingDir).catch((doctorErr) => {
              logger.error(MODULE, 'Doctor supervised mode failed', doctorErr);
            });
          } else {
            runAutonomous(alerts, ctx.workingDir).catch((doctorErr) => {
              logger.error(MODULE, 'Doctor autonomous mode failed', doctorErr);
            });
          }
        }
      },
      undefined,
      MODULE,
    );
  }

  const elapsed = performance.now() - startTime;
  logger.info(MODULE, `Pipeline completed in ${elapsed.toFixed(0)}ms`);

  return ctx;
}
