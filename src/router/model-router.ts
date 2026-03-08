/**
 * Model Router — selects the cheapest Claude model that can handle the task.
 * Uses classification + complexity to pick a default, then checks history for overrides.
 */

import type { PipelineContext, TaskHistory } from '../types/index.js';
import { TaskType, Complexity } from '../types/index.js';
import type { RoutingResult } from './types.js';
import {
  ModelTier,
  ESCALATION_MAP,
  DOUBLE_ESCALATION_MAP,
  DE_ESCALATION_MAP,
  FAILURE_RATE_THRESHOLD,
  HIGH_FAILURE_THRESHOLD,
  HIGH_FAILURE_MIN_TASKS,
  FILE_COUNT_ESCALATION_THRESHOLD,
  LOW_PREDICTION_THRESHOLD,
  LOW_PREDICTION_MIN_FILES,
  FAILURE_RECENCY_HALF_LIFE,
  POSITIVE_RATINGS,
  DE_ESCALATION_SUCCESS_THRESHOLD,
  DE_ESCALATION_MIN_TASKS,
} from './types.js';
import type { TaskFeedback } from '../types/index.js';
import { logger } from '../utils/index.js';
import { selectLearnedModel } from '../learner/router-learner.js';

const MODULE = 'router';

/**
 * Default routing rules: task type + complexity → model tier.
 * Key format: "TaskType:Complexity"
 */
const DEFAULT_ROUTING_RULES: Record<string, ModelTier> = {
  // BugFix
  [`${TaskType.BugFix}:${Complexity.Simple}`]: ModelTier.Haiku,
  [`${TaskType.BugFix}:${Complexity.Low}`]: ModelTier.Haiku,
  [`${TaskType.BugFix}:${Complexity.Medium}`]: ModelTier.Sonnet,
  [`${TaskType.BugFix}:${Complexity.High}`]: ModelTier.Sonnet,
  [`${TaskType.BugFix}:${Complexity.Complex}`]: ModelTier.Sonnet,

  // Feature
  [`${TaskType.Feature}:${Complexity.Simple}`]: ModelTier.Haiku,
  [`${TaskType.Feature}:${Complexity.Low}`]: ModelTier.Haiku,
  [`${TaskType.Feature}:${Complexity.Medium}`]: ModelTier.Sonnet,
  [`${TaskType.Feature}:${Complexity.High}`]: ModelTier.Sonnet,
  [`${TaskType.Feature}:${Complexity.Complex}`]: ModelTier.Opus,

  // Refactor
  [`${TaskType.Refactor}:${Complexity.Simple}`]: ModelTier.Sonnet,
  [`${TaskType.Refactor}:${Complexity.Low}`]: ModelTier.Sonnet,
  [`${TaskType.Refactor}:${Complexity.Medium}`]: ModelTier.Sonnet,
  [`${TaskType.Refactor}:${Complexity.High}`]: ModelTier.Sonnet,
  [`${TaskType.Refactor}:${Complexity.Complex}`]: ModelTier.Opus,

  // Research
  [`${TaskType.Research}:${Complexity.Simple}`]: ModelTier.Haiku,
  [`${TaskType.Research}:${Complexity.Low}`]: ModelTier.Haiku,
  [`${TaskType.Research}:${Complexity.Medium}`]: ModelTier.Haiku,
  [`${TaskType.Research}:${Complexity.High}`]: ModelTier.Sonnet,
  [`${TaskType.Research}:${Complexity.Complex}`]: ModelTier.Sonnet,

  // Learning
  [`${TaskType.Learning}:${Complexity.Simple}`]: ModelTier.Haiku,
  [`${TaskType.Learning}:${Complexity.Low}`]: ModelTier.Haiku,
  [`${TaskType.Learning}:${Complexity.Medium}`]: ModelTier.Haiku,
  [`${TaskType.Learning}:${Complexity.High}`]: ModelTier.Sonnet,
  [`${TaskType.Learning}:${Complexity.Complex}`]: ModelTier.Sonnet,

  // Documentation
  [`${TaskType.Documentation}:${Complexity.Simple}`]: ModelTier.Haiku,
  [`${TaskType.Documentation}:${Complexity.Low}`]: ModelTier.Haiku,
  [`${TaskType.Documentation}:${Complexity.Medium}`]: ModelTier.Haiku,
  [`${TaskType.Documentation}:${Complexity.High}`]: ModelTier.Sonnet,
  [`${TaskType.Documentation}:${Complexity.Complex}`]: ModelTier.Sonnet,

  // Docs (alias)
  [`${TaskType.Docs}:${Complexity.Simple}`]: ModelTier.Haiku,
  [`${TaskType.Docs}:${Complexity.Low}`]: ModelTier.Haiku,
  [`${TaskType.Docs}:${Complexity.Medium}`]: ModelTier.Haiku,
  [`${TaskType.Docs}:${Complexity.High}`]: ModelTier.Sonnet,
  [`${TaskType.Docs}:${Complexity.Complex}`]: ModelTier.Sonnet,

  // Writing
  [`${TaskType.Writing}:${Complexity.Simple}`]: ModelTier.Haiku,
  [`${TaskType.Writing}:${Complexity.Low}`]: ModelTier.Haiku,
  [`${TaskType.Writing}:${Complexity.Medium}`]: ModelTier.Sonnet,
  [`${TaskType.Writing}:${Complexity.High}`]: ModelTier.Sonnet,
  [`${TaskType.Writing}:${Complexity.Complex}`]: ModelTier.Sonnet,

  // Test
  [`${TaskType.Test}:${Complexity.Simple}`]: ModelTier.Haiku,
  [`${TaskType.Test}:${Complexity.Low}`]: ModelTier.Haiku,
  [`${TaskType.Test}:${Complexity.Medium}`]: ModelTier.Sonnet,
  [`${TaskType.Test}:${Complexity.High}`]: ModelTier.Sonnet,
  [`${TaskType.Test}:${Complexity.Complex}`]: ModelTier.Opus,

  // Config
  [`${TaskType.Config}:${Complexity.Simple}`]: ModelTier.Haiku,
  [`${TaskType.Config}:${Complexity.Low}`]: ModelTier.Haiku,
  [`${TaskType.Config}:${Complexity.Medium}`]: ModelTier.Sonnet,
  [`${TaskType.Config}:${Complexity.High}`]: ModelTier.Sonnet,
  [`${TaskType.Config}:${Complexity.Complex}`]: ModelTier.Sonnet,

  // Exploration
  [`${TaskType.Exploration}:${Complexity.Simple}`]: ModelTier.Haiku,
  [`${TaskType.Exploration}:${Complexity.Low}`]: ModelTier.Haiku,
  [`${TaskType.Exploration}:${Complexity.Medium}`]: ModelTier.Haiku,
  [`${TaskType.Exploration}:${Complexity.High}`]: ModelTier.Sonnet,
  [`${TaskType.Exploration}:${Complexity.Complex}`]: ModelTier.Sonnet,
};

/** Fallback model for unknown type+complexity combinations. */
const FALLBACK_MODEL = ModelTier.Sonnet;

/** Default routing result for fail-open fallback when router fails entirely. */
export const DEFAULT_ROUTING: RoutingResult = {
  model: ModelTier.Sonnet,
  rationale: 'Default routing — classification unavailable',
  confidence: 0,
  overrideApplied: false,
  durationMs: 0,
};

/**
 * Look up the default model for a task type + complexity.
 */
function lookupDefaultModel(taskType: TaskType, complexity: Complexity): ModelTier {
  const key = `${taskType}:${complexity}`;
  return DEFAULT_ROUTING_RULES[key] ?? FALLBACK_MODEL;
}

/**
 * Escalate to the next model tier up.
 * Opus is the ceiling — cannot escalate beyond.
 */
export function escalate(currentModel: ModelTier): ModelTier {
  return ESCALATION_MAP[currentModel];
}

/**
 * R2: Check if feedback indicates a negative experience.
 * Positive/neutral feedback does NOT count as failure.
 */
function isNegativeFeedback(feedback: TaskFeedback): boolean {
  if (POSITIVE_RATINGS.has(feedback.rating)) return false;
  // Explicit negative signals
  if (feedback.wrongFiles && feedback.wrongFiles.length > 0) return true;
  if (feedback.modelCorrection) return true;
  // Non-positive rating or legacy data without rating — treat as negative
  return true;
}

/**
 * R9: Compute time-based decay for failure weighting.
 * decay = exp(-daysSince / HALF_LIFE)
 */
function computeFailureDecay(taskTimestamp: string): number {
  const taskDate = new Date(taskTimestamp).getTime();
  if (isNaN(taskDate)) return 1.0;
  const daysSince = (Date.now() - taskDate) / (1000 * 60 * 60 * 24);
  if (daysSince < 0) return 1.0;
  return Math.exp(-daysSince / FAILURE_RECENCY_HALF_LIFE);
}

/**
 * Check historical task data for failure patterns on the default model.
 * Returns weighted failure rate for the given task type + domain + model.
 *
 * R1: Filters by domain first, falls back to domain-agnostic if insufficient data.
 * R2: Only counts negative feedback as failure (not positive/neutral).
 * R9: Applies recency decay — old failures count less.
 */
function checkHistoricalFailures(
  history: TaskHistory | undefined,
  taskType: string,
  domain: string,
  model: ModelTier,
): { failureRate: number; totalTasks: number; failedTasks: number } {
  if (!history) return { failureRate: 0, totalTasks: 0, failedTasks: 0 };

  // R1: Try domain-specific match first
  let matchingTasks = history.tasks.filter(
    (t) =>
      t.classification.taskType === taskType &&
      t.routing.model === model &&
      t.classification.domain === domain,
  );

  // R1: Fall back to domain-agnostic if insufficient domain-specific data
  if (matchingTasks.length < 2) {
    matchingTasks = history.tasks.filter(
      (t) =>
        t.classification.taskType === taskType &&
        t.routing.model === model,
    );
  }

  if (matchingTasks.length === 0) return { failureRate: 0, totalTasks: 0, failedTasks: 0 };

  // R9: Compute weighted failure rate with recency decay
  let totalWeight = 0;
  let failureWeight = 0;

  for (const t of matchingTasks) {
    const decay = computeFailureDecay(t.timestamp);
    totalWeight += decay;

    // R2: Only count negative feedback as failure (not any feedback)
    const hasNegativeFeedback = t.feedback !== null && isNegativeFeedback(t.feedback);
    const hasLowPrecision = t.prediction.precision < 0.3;

    if (hasNegativeFeedback || hasLowPrecision) {
      failureWeight += decay;
    }
  }

  if (totalWeight === 0) return { failureRate: 0, totalTasks: 0, failedTasks: 0 };

  const failureRate = failureWeight / totalWeight;
  // Return approximate counts for rationale building
  const failedTasks = Math.round(failureRate * matchingTasks.length);
  return { failureRate, totalTasks: matchingTasks.length, failedTasks };
}

/**
 * R3: Check if the current model can be de-escalated based on high success rate.
 * If the default model succeeds > 80% on 5+ tasks, check if the tier below
 * also has acceptable performance data. Returns the de-escalated model or null.
 */
function checkHistoricalDeEscalation(
  history: TaskHistory | undefined,
  taskType: string,
  domain: string,
  model: ModelTier,
): ModelTier | null {
  if (!history || model === ModelTier.Haiku) return null; // Can't go below Haiku

  // Check success rate for the current model
  const matchingTasks = history.tasks.filter(
    (t) =>
      t.classification.taskType === taskType &&
      t.routing.model === model,
  );

  if (matchingTasks.length < DE_ESCALATION_MIN_TASKS) return null;

  // Compute success rate (inverse of failure — tasks with no negative feedback and good precision)
  let successCount = 0;
  for (const t of matchingTasks) {
    const hasNegativeFeedback = t.feedback !== null && isNegativeFeedback(t.feedback);
    const hasLowPrecision = t.prediction.precision < 0.3;
    if (!hasNegativeFeedback && !hasLowPrecision) {
      successCount++;
    }
  }

  const successRate = successCount / matchingTasks.length;
  if (successRate < DE_ESCALATION_SUCCESS_THRESHOLD) return null;

  // Current model has high success → check if tier below has some evidence of working
  const lowerModel = DE_ESCALATION_MAP[model];
  if (lowerModel === model) return null; // Already at floor

  const lowerTasks = history.tasks.filter(
    (t) =>
      t.classification.taskType === taskType &&
      t.routing.model === lowerModel,
  );

  // If the lower tier has 3+ tasks with > 70% success, de-escalate
  if (lowerTasks.length >= 3) {
    let lowerSuccess = 0;
    for (const t of lowerTasks) {
      const hasNegativeFeedback = t.feedback !== null && isNegativeFeedback(t.feedback);
      const hasLowPrecision = t.prediction.precision < 0.3;
      if (!hasNegativeFeedback && !hasLowPrecision) {
        lowerSuccess++;
      }
    }
    if (lowerSuccess / lowerTasks.length > 0.7) {
      logger.debug(
        MODULE,
        `R3 de-escalation: ${model} → ${lowerModel} (${model} success ${(successRate * 100).toFixed(0)}%, ${lowerModel} success ${((lowerSuccess / lowerTasks.length) * 100).toFixed(0)}%)`,
      );
      return lowerModel;
    }
  }

  // Even without lower tier data, if current tier succeeds > 95% on 10+ tasks,
  // tentatively suggest the lower tier (exploratory de-escalation)
  if (matchingTasks.length >= 10 && successRate > 0.95) {
    logger.debug(
      MODULE,
      `R3 exploratory de-escalation: ${model} → ${lowerModel} (${model} success ${(successRate * 100).toFixed(0)}% on ${matchingTasks.length} tasks)`,
    );
    return lowerModel;
  }

  return null;
}

/**
 * Build a human-readable rationale string for the routing decision.
 */
function buildRationale(
  model: ModelTier,
  taskType: string,
  complexity: string,
  isOverridden: boolean,
  historyInfo?: { totalTasks: number; failedTasks: number; originalModel: ModelTier; reason?: string },
): string {
  const modelName = model.charAt(0).toUpperCase() + model.slice(1);
  const typeLabel = taskType.toLowerCase();
  const complexityLabel = complexity.toLowerCase();

  if (isOverridden && historyInfo) {
    const origName = historyInfo.originalModel.charAt(0).toUpperCase() + historyInfo.originalModel.slice(1);
    // R5/R11: Custom reason override (file count, prediction confidence)
    if (historyInfo.reason) {
      return `Routing to ${modelName}: ${complexityLabel} ${typeLabel}, escalated from ${origName} — ${historyInfo.reason}`;
    }
    if (historyInfo.totalTasks === 0) {
      // Learned model override (no failure data)
      return `Routing to ${modelName}: ${complexityLabel} ${typeLabel}, learned from historical performance (was ${origName})`;
    }
    return `Routing to ${modelName}: ${complexityLabel} ${typeLabel}, but ${origName} failed on ${historyInfo.failedTasks}/${historyInfo.totalTasks} similar tasks — escalating`;
  }

  return `Routing to ${modelName}: ${complexityLabel} ${typeLabel}`;
}

/**
 * Select the best model for the current task.
 * Reads classification from PipelineContext, checks history for overrides.
 *
 * @param ctx - Pipeline context with classification result
 * @returns RoutingResult with model, rationale, confidence, and timing
 */
export function selectModel(ctx: PipelineContext): RoutingResult {
  const startTime = performance.now();

  // If no classification, use safe default
  if (!ctx.classification) {
    const durationMs = performance.now() - startTime;
    return {
      model: FALLBACK_MODEL,
      rationale: 'Routing to Sonnet: classification unavailable — using safe default',
      confidence: 0,
      overrideApplied: false,
      durationMs,
    };
  }

  const { type: taskType, domain, complexity, confidence: classificationConfidence } = ctx.classification;

  // Look up default model
  const defaultModel = lookupDefaultModel(taskType, complexity);

  // Check learned model performance first (#7) — can de-escalate or escalate
  const metrics = ctx.storeCache?.metrics;
  // R8: Pass config so learned model can use configurable cost multipliers
  const config = ctx.storeCache?.config;
  const learnedModel = metrics ? selectLearnedModel(metrics, taskType, complexity, config) : null;

  let selectedModel = defaultModel;
  let isOverridden = false;

  let overrideSource: 'learned' | 'failure' | 'deescalation' | 'fileCount' | 'predictionConfidence' | undefined;
  let historyTotalTasks = 0;
  let historyFailedTasks = 0;
  let learnedObservations = 0;

  if (learnedModel && learnedModel !== defaultModel) {
    selectedModel = learnedModel as ModelTier;
    isOverridden = true;
    overrideSource = 'learned';
    // Track observation count for confidence scoring (R4)
    const perfKey = `${learnedModel}:${taskType}:${complexity}`;
    learnedObservations = metrics?.modelPerformance?.[perfKey]?.totalTasks ?? 0;
    logger.debug(
      MODULE,
      `Learned override: ${defaultModel} → ${selectedModel} (Bayesian performance data)`,
    );
  } else {
    // Fall back to historical failure check for escalation
    const { failureRate, totalTasks, failedTasks } = checkHistoricalFailures(
      ctx.storeCache?.taskHistory,
      taskType,
      domain,
      defaultModel,
    );
    historyTotalTasks = totalTasks;
    historyFailedTasks = failedTasks;

    // R10: Multi-tier escalation — very high failure rate jumps 2 tiers
    if (totalTasks >= HIGH_FAILURE_MIN_TASKS && failureRate > HIGH_FAILURE_THRESHOLD) {
      selectedModel = DOUBLE_ESCALATION_MAP[defaultModel];
      isOverridden = true;
      overrideSource = 'failure';
      logger.debug(
        MODULE,
        `Double escalation: ${defaultModel} → ${selectedModel} (failure rate ${(failureRate * 100).toFixed(0)}% on ${totalTasks} tasks)`,
      );
    } else if (totalTasks >= 2 && failureRate > FAILURE_RATE_THRESHOLD) {
      // Standard single-tier escalation
      selectedModel = escalate(defaultModel);
      isOverridden = true;
      overrideSource = 'failure';
      logger.debug(
        MODULE,
        `Override: ${defaultModel} → ${selectedModel} (failure rate ${(failureRate * 100).toFixed(0)}% on ${totalTasks} tasks)`,
      );
    }
  }

  // R3: Historical de-escalation — if not already overridden, check if we can use a cheaper model
  if (!isOverridden && selectedModel !== ModelTier.Haiku) {
    const deEscalated = checkHistoricalDeEscalation(
      ctx.storeCache?.taskHistory,
      taskType,
      domain,
      selectedModel,
    );
    if (deEscalated && deEscalated !== selectedModel) {
      const prevModel = selectedModel;
      selectedModel = deEscalated;
      isOverridden = true;
      overrideSource = 'deescalation';
      logger.debug(
        MODULE,
        `De-escalation: ${prevModel} → ${selectedModel} (high historical success rate)`,
      );
    }
  }

  // R5: File count escalation — many predicted files implies cross-cutting change
  if (!isOverridden && ctx.prediction && selectedModel !== ModelTier.Opus) {
    const fileCount = ctx.prediction.predictions.length;
    if (fileCount > FILE_COUNT_ESCALATION_THRESHOLD) {
      const prevModel = selectedModel;
      selectedModel = escalate(selectedModel);
      isOverridden = true;
      overrideSource = 'fileCount';
      logger.debug(
        MODULE,
        `File count escalation: ${prevModel} → ${selectedModel} (${fileCount} predicted files)`,
      );
    }
  }

  // R11: Prediction confidence factor — low confidence predictions need stronger model
  if (!isOverridden && ctx.prediction && selectedModel !== ModelTier.Opus) {
    const predictions = ctx.prediction.predictions;
    if (predictions.length >= LOW_PREDICTION_MIN_FILES) {
      const avgScore = predictions.reduce((sum, p) => sum + p.score, 0) / predictions.length;
      if (avgScore < LOW_PREDICTION_THRESHOLD) {
        const prevModel = selectedModel;
        selectedModel = escalate(selectedModel);
        isOverridden = true;
        overrideSource = 'predictionConfidence';
        logger.debug(
          MODULE,
          `Prediction confidence escalation: ${prevModel} → ${selectedModel} (avg score ${avgScore.toFixed(2)})`,
        );
      }
    }
  }

  const rationale = buildRationale(
    selectedModel,
    taskType,
    complexity,
    isOverridden,
    overrideSource === 'failure'
      ? { totalTasks: historyTotalTasks, failedTasks: historyFailedTasks, originalModel: defaultModel }
      : overrideSource === 'deescalation'
        ? { totalTasks: 0, failedTasks: 0, originalModel: defaultModel, reason: 'high success rate — de-escalating to save cost' }
        : overrideSource === 'fileCount'
          ? { totalTasks: 0, failedTasks: 0, originalModel: defaultModel, reason: `${ctx.prediction!.predictions.length} predicted files` }
          : overrideSource === 'predictionConfidence'
            ? { totalTasks: 0, failedTasks: 0, originalModel: defaultModel, reason: 'low prediction confidence' }
            : isOverridden
              ? { totalTasks: 0, failedTasks: 0, originalModel: defaultModel }
              : undefined,
  );

  // R4: Multi-factor confidence scoring
  let routingConfidence = classificationConfidence;
  if (historyTotalTasks >= 2) routingConfidence += 0.1;
  if (learnedObservations >= 10) routingConfidence += 0.1;
  // R1: Domain-specific data bonus
  if (ctx.storeCache?.taskHistory) {
    const domainTasks = ctx.storeCache.taskHistory.tasks.filter(
      (t) => t.classification.taskType === taskType && t.classification.domain === domain,
    );
    if (domainTasks.length >= 2) routingConfidence += 0.05;
  }
  routingConfidence = Math.min(routingConfidence, 1.0);

  const durationMs = performance.now() - startTime;

  if (durationMs > 50) {
    logger.warn(MODULE, `Routing exceeded 50ms budget: ${durationMs.toFixed(0)}ms`);
  }

  logger.debug(MODULE, `${rationale} (${durationMs.toFixed(1)}ms)`);

  return {
    model: selectedModel,
    rationale,
    confidence: routingConfidence,
    overrideApplied: isOverridden,
    durationMs,
  };
}
