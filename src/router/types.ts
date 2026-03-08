/**
 * Types for the Model Router module (Story 2.3).
 * Complexity-based model selection with historical override.
 */

/** Available Claude model tiers, ordered by capability and cost. */
export enum ModelTier {
  Haiku = 'haiku',
  Sonnet = 'sonnet',
  Opus = 'opus',
}

/** Result of the model routing decision. */
export interface RoutingResult {
  model: ModelTier;
  rationale: string;
  confidence: number;
  overrideApplied: boolean;
  durationMs: number;
}

/** A routing rule mapping task type + complexity to a default model. */
export interface RoutingRule {
  taskType: string;
  complexity: string;
  defaultModel: ModelTier;
}

/** Failure rate threshold for triggering single-tier escalation. */
export const FAILURE_RATE_THRESHOLD = 0.4;

/** R10: High failure rate threshold for multi-tier escalation (Haiku → Opus). */
export const HIGH_FAILURE_THRESHOLD = 0.7;

/** R10: Minimum tasks required for multi-tier escalation. */
export const HIGH_FAILURE_MIN_TASKS = 3;

/** R5: File count above which the model is escalated one tier. */
export const FILE_COUNT_ESCALATION_THRESHOLD = 15;

/** R11: Average prediction score below which a stronger model is preferred. */
export const LOW_PREDICTION_THRESHOLD = 0.3;

/** R11: Minimum predicted files before prediction confidence factor applies. */
export const LOW_PREDICTION_MIN_FILES = 5;

/** R9: Half-life in days for failure recency decay. */
export const FAILURE_RECENCY_HALF_LIFE = 30;

/** R2: Positive feedback ratings that should NOT count as failures. */
export const POSITIVE_RATINGS = new Set(['positive', 'good', 'helpful', 'correct']);

/** Escalation chain: current tier → next tier up. */
export const ESCALATION_MAP: Record<ModelTier, ModelTier> = {
  [ModelTier.Haiku]: ModelTier.Sonnet,
  [ModelTier.Sonnet]: ModelTier.Opus,
  [ModelTier.Opus]: ModelTier.Opus, // Ceiling — cannot escalate beyond Opus
};

/** R10: Double escalation chain: current tier → two tiers up. */
export const DOUBLE_ESCALATION_MAP: Record<ModelTier, ModelTier> = {
  [ModelTier.Haiku]: ModelTier.Opus,
  [ModelTier.Sonnet]: ModelTier.Opus,
  [ModelTier.Opus]: ModelTier.Opus,
};

/** R3: De-escalation chain: current tier → one tier down. */
export const DE_ESCALATION_MAP: Record<ModelTier, ModelTier> = {
  [ModelTier.Haiku]: ModelTier.Haiku, // Floor — cannot de-escalate below Haiku
  [ModelTier.Sonnet]: ModelTier.Haiku,
  [ModelTier.Opus]: ModelTier.Sonnet,
};

/** R3: Success rate threshold for de-escalation consideration. */
export const DE_ESCALATION_SUCCESS_THRESHOLD = 0.8;

/** R3: Minimum tasks before de-escalation is considered. */
export const DE_ESCALATION_MIN_TASKS = 5;
