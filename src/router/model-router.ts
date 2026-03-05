/**
 * Model Router — selects the cheapest Claude model that can handle the task.
 * Uses classification + complexity to pick a default, then checks history for overrides.
 */

import type { PipelineContext, TaskHistory } from '../types/index.js';
import { TaskType, Complexity } from '../types/index.js';
import type { RoutingResult } from './types.js';
import { ModelTier, ESCALATION_MAP, FAILURE_RATE_THRESHOLD } from './types.js';
import { logger } from '../utils/index.js';
import { readTaskHistory } from '../store/index.js';

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
 * Check historical task data for failure patterns on the default model.
 * Returns failure rate (0.0-1.0) for the given task type + domain + model combination.
 */
function checkHistoricalFailures(
  projectRoot: string,
  taskType: string,
  domain: string,
  model: ModelTier,
): { failureRate: number; totalTasks: number; failedTasks: number } {
  const historyResult = readTaskHistory(projectRoot);
  if (!historyResult.ok) return { failureRate: 0, totalTasks: 0, failedTasks: 0 };

  const history: TaskHistory = historyResult.value;

  // Filter tasks matching this type + domain + model
  const matchingTasks = history.tasks.filter(
    (t) =>
      t.classification.taskType === taskType &&
      t.routing.model === model,
  );

  if (matchingTasks.length === 0) return { failureRate: 0, totalTasks: 0, failedTasks: 0 };

  // A task is considered a "failure" if it has negative feedback or very low precision
  const failedTasks = matchingTasks.filter(
    (t) =>
      t.feedback !== null ||
      t.prediction.precision < 0.3,
  );

  const failureRate = failedTasks.length / matchingTasks.length;
  return { failureRate, totalTasks: matchingTasks.length, failedTasks: failedTasks.length };
}

/**
 * Build a human-readable rationale string for the routing decision.
 */
function buildRationale(
  model: ModelTier,
  taskType: string,
  complexity: string,
  isOverridden: boolean,
  historyInfo?: { totalTasks: number; failedTasks: number; originalModel: ModelTier },
): string {
  const modelName = model.charAt(0).toUpperCase() + model.slice(1);
  const typeLabel = taskType.toLowerCase();
  const complexityLabel = complexity.toLowerCase();

  if (isOverridden && historyInfo) {
    const origName = historyInfo.originalModel.charAt(0).toUpperCase() + historyInfo.originalModel.slice(1);
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

  // Check historical failures for the default model
  const { failureRate, totalTasks, failedTasks } = checkHistoricalFailures(
    ctx.workingDir,
    taskType,
    domain,
    defaultModel,
  );

  let selectedModel = defaultModel;
  let isOverridden = false;

  // If failure rate exceeds threshold, escalate
  if (totalTasks >= 2 && failureRate > FAILURE_RATE_THRESHOLD) {
    selectedModel = escalate(defaultModel);
    isOverridden = true;
    logger.debug(
      MODULE,
      `Override: ${defaultModel} → ${selectedModel} (failure rate ${(failureRate * 100).toFixed(0)}% on ${totalTasks} tasks)`,
    );
  }

  const rationale = buildRationale(
    selectedModel,
    taskType,
    complexity,
    isOverridden,
    isOverridden ? { totalTasks, failedTasks, originalModel: defaultModel } : undefined,
  );

  // Confidence is based on classification confidence and history availability
  const routingConfidence = totalTasks > 0
    ? Math.min(classificationConfidence + 0.1, 1.0)
    : classificationConfidence;

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
