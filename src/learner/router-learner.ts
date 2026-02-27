/**
 * Router Learning (#7).
 * Tracks model performance per model x taskType x complexity combination.
 * Uses Bayesian success rate with cost penalty to recommend optimal models.
 * Allows de-escalation (e.g., Sonnet -> Haiku) when cheaper model proves effective.
 *
 * L13: Continuous success score (replaces binary isSuccess).
 * L14: Tracks wall-clock duration, factors into cost-adjusted score.
 * L16: Flexible cost baseline — uses cheapest model with data, not hardcoded Haiku.
 */

import type { Metrics, ModelPerformance, Config } from '../types/index.js';
import { logger } from '../utils/index.js';
import { DURATION_COST_BLEND } from './types.js';

const MODULE = 'learner:router';

/** Minimum observations before overriding static routing. */
export const MIN_OBSERVATIONS = 5;

/** R6: Minimum observations for single-model inference. */
const SINGLE_MODEL_MIN_OBS = 5;
/** R6: Success rate above which we infer the tier below might work. */
const INFER_DOWN_THRESHOLD = 0.9;
/** R6: Success rate below which we infer the tier above is needed. */
const INFER_UP_THRESHOLD = 0.6;

/** Minimum observations for a model to serve as cost baseline (L16). */
const BASELINE_MIN_OBS = 3;

/** Default cost multipliers per model tier (relative to Haiku). */
const DEFAULT_COST_MULTIPLIERS: Record<string, number> = {
  haiku: 1,
  sonnet: 3,
  opus: 15,
};

/** R8: Resolve cost multipliers — use config overrides if available, else defaults. */
function getCostMultipliers(config?: Config): Record<string, number> {
  const configMultipliers = (config as Record<string, unknown>)?.costMultipliers as Record<string, number> | undefined;
  if (configMultipliers && typeof configMultipliers === 'object') {
    return { ...DEFAULT_COST_MULTIPLIERS, ...configMultipliers };
  }
  return DEFAULT_COST_MULTIPLIERS;
}

/** Model tier ordering for inference. */
const MODEL_TIERS = ['haiku', 'sonnet', 'opus'] as const;
const TIER_BELOW: Record<string, string | null> = { haiku: null, sonnet: 'haiku', opus: 'sonnet' };
const TIER_ABOVE: Record<string, string | null> = { haiku: 'sonnet', sonnet: 'opus', opus: null };

/**
 * Build a composite key for model performance lookup.
 */
function perfKey(model: string, taskType: string, complexity: string): string {
  return `${model}:${taskType}:${complexity}`;
}

/**
 * Update model performance tracking after a task completes.
 *
 * L13: Accepts continuous successScore [0,1] instead of binary isSuccess.
 * L14: Optionally tracks wall-clock duration.
 */
export function updateModelPerformance(
  metrics: Metrics,
  model: string,
  taskType: string,
  complexity: string,
  successScore: number,
  tokenCost: number,
  durationMs?: number,
): void {
  if (!metrics.modelPerformance) {
    metrics.modelPerformance = {};
  }

  const key = perfKey(model, taskType, complexity);

  if (!metrics.modelPerformance[key]) {
    metrics.modelPerformance[key] = {
      successes: 0,
      failures: 0,
      totalTasks: 0,
      avgTokenCost: 0,
    };
  }

  const perf = metrics.modelPerformance[key];
  perf.totalTasks++;

  // L13: Weighted success accumulation (continuous score)
  perf.successes += successScore;
  perf.failures += (1 - successScore);

  // Running average of token cost
  perf.avgTokenCost = perf.avgTokenCost + (tokenCost - perf.avgTokenCost) / perf.totalTasks;

  // L14: Track average duration
  if (durationMs != null && durationMs > 0) {
    perf.avgDurationMs = (perf.avgDurationMs ?? 0) + (durationMs - (perf.avgDurationMs ?? 0)) / perf.totalTasks;
  }

  logger.debug(MODULE, `${key}: ${perf.successes.toFixed(1)}/${perf.totalTasks} success, avg cost ${perf.avgTokenCost.toFixed(0)}`);
}

/**
 * Bayesian success rate with Laplace smoothing.
 * (successes + 1) / (total + 2)
 * L13: Works with continuous weighted successes.
 */
function bayesianSuccessRate(perf: ModelPerformance): number {
  return (perf.successes + 1) / (perf.totalTasks + 2);
}

/**
 * L16: Find the cheapest model with sufficient data as cost baseline.
 * Iterates MODEL_TIERS in order (cheapest first).
 * Falls back to null if no model qualifies.
 */
function findCostBaseline(
  allPerf: Record<string, ModelPerformance>,
  taskType: string,
  complexity: string,
): { model: string; perf: ModelPerformance } | null {
  for (const model of MODEL_TIERS) {
    const key = perfKey(model, taskType, complexity);
    const perf = allPerf[key];
    if (perf && perf.totalTasks >= BASELINE_MIN_OBS && perf.avgTokenCost > 0) {
      return { model, perf };
    }
  }
  return null;
}

/**
 * Compute cost-adjusted score for a model.
 * Higher is better: successRate / effectiveCost
 *
 * R7: Blends fixed cost multiplier with observed relative token cost.
 * R8: Uses configurable cost multipliers.
 * L14: Factors in duration when available.
 * L16: Uses cheapest available model as baseline (not hardcoded Haiku).
 */
function costAdjustedScore(
  perf: ModelPerformance,
  model: string,
  allPerf?: Record<string, ModelPerformance>,
  taskType?: string,
  complexity?: string,
  config?: Config,
): number {
  const successRate = bayesianSuccessRate(perf);
  const costMultipliers = getCostMultipliers(config);
  const fixedMult = costMultipliers[model] ?? 3;

  // L16: Find cheapest baseline with sufficient data (not hardcoded Haiku)
  if (allPerf && taskType && complexity) {
    const baseline = findCostBaseline(allPerf, taskType, complexity);

    if (baseline && baseline.perf.avgTokenCost > 0 && perf.avgTokenCost > 0) {
      const observedRelativeCost = perf.avgTokenCost / baseline.perf.avgTokenCost;
      // Blend 50/50: fixed multiplier + observed relative cost
      let effectiveCost = 0.5 * fixedMult + 0.5 * observedRelativeCost;

      // L14: Blend in duration cost if both models have duration data
      if (perf.avgDurationMs && baseline.perf.avgDurationMs && baseline.perf.avgDurationMs > 0) {
        const relativeDuration = perf.avgDurationMs / baseline.perf.avgDurationMs;
        effectiveCost = (1 - DURATION_COST_BLEND) * effectiveCost + DURATION_COST_BLEND * relativeDuration;
      }

      return successRate / Math.max(effectiveCost, 0.1);
    }
  }

  return successRate / fixedMult;
}

/**
 * Select the best model for a task type + complexity based on learned performance.
 *
 * Multi-candidate path: When multiple models have MIN_OBSERVATIONS, selects the
 * model with the best cost-adjusted Bayesian score.
 *
 * R6: Single-model inference — when only one model has enough data:
 *   - If success rate > 90%, tentatively recommend the tier below (cost saving)
 *   - If success rate < 60%, recommend the tier above (capability needed)
 *   - Otherwise, stick with the observed model
 *
 * R7: Uses actual token cost data blended with fixed multipliers.
 * R8: Uses configurable cost multipliers from config.
 * L14: Factors in execution duration.
 * L16: Uses flexible cost baseline.
 *
 * @param config - Optional config for R8 cost multiplier overrides
 */
export function selectLearnedModel(
  metrics: Metrics,
  taskType: string,
  complexity: string,
  config?: Config,
): string | null {
  if (!metrics.modelPerformance) return null;

  const candidates: Array<{ model: string; score: number; perf: ModelPerformance }> = [];

  for (const model of MODEL_TIERS) {
    const key = perfKey(model, taskType, complexity);
    const perf = metrics.modelPerformance[key];
    if (!perf || perf.totalTasks < MIN_OBSERVATIONS) continue;

    candidates.push({
      model,
      score: costAdjustedScore(perf, model, metrics.modelPerformance, taskType, complexity, config),
      perf,
    });
  }

  // R6: Single-model inference — infer from one model's performance
  if (candidates.length === 0) {
    for (const model of MODEL_TIERS) {
      const key = perfKey(model, taskType, complexity);
      const perf = metrics.modelPerformance?.[key];
      if (!perf || perf.totalTasks < SINGLE_MODEL_MIN_OBS) continue;

      const successRate = bayesianSuccessRate(perf);

      if (successRate > INFER_DOWN_THRESHOLD) {
        const below = TIER_BELOW[model];
        if (below) {
          logger.debug(MODULE, `R6 infer down: ${model} succeeds ${(successRate * 100).toFixed(0)}% -> suggesting ${below}`);
          return below;
        }
      }

      if (successRate < INFER_UP_THRESHOLD) {
        const above = TIER_ABOVE[model];
        if (above) {
          logger.debug(MODULE, `R6 infer up: ${model} succeeds ${(successRate * 100).toFixed(0)}% -> suggesting ${above}`);
          return above;
        }
      }

      return model;
    }

    return null;
  }

  // Multi-candidate: sort by cost-adjusted score descending
  candidates.sort((a, b) => b.score - a.score);

  const best = candidates[0];
  logger.debug(
    MODULE,
    `Learned model for ${taskType}:${complexity}: ${best.model} (score=${best.score.toFixed(3)}, ${best.perf.successes.toFixed(1)}/${best.perf.totalTasks} success)`,
  );

  return best.model;
}
