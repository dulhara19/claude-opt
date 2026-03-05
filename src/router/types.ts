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

/** Failure rate threshold for triggering historical override. */
export const FAILURE_RATE_THRESHOLD = 0.4;

/** Escalation chain: current tier → next tier up. */
export const ESCALATION_MAP: Record<ModelTier, ModelTier> = {
  [ModelTier.Haiku]: ModelTier.Sonnet,
  [ModelTier.Sonnet]: ModelTier.Opus,
  [ModelTier.Opus]: ModelTier.Opus, // Ceiling — cannot escalate beyond Opus
};
