/**
 * Model Router module — public API.
 * Selects the cheapest Claude model that can handle the task.
 */

export { selectModel } from './model-router.js';
export type { RoutingResult, RoutingRule } from './types.js';
export { ModelTier } from './types.js';

/** Default routing result for fail-open fallback. */
export { DEFAULT_ROUTING } from './model-router.js';
