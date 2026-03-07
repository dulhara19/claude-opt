/**
 * Signal 5: Type Affinity — boosts files that are historically associated
 * with the classified task type. Uses patterns.json typeAffinities data
 * populated by the learner module.
 */

import type { Patterns } from '../../types/index.js';
import type { SignalScore } from '../types.js';
import { SignalSource } from '../types.js';
import { logger } from '../../utils/index.js';

const MODULE = 'predictor:type-affinity';

/**
 * Score files based on their learned affinity to the given task type.
 * Returns empty map if no patterns exist or task type has no affinities.
 */
export function scoreTypeAffinity(
  taskType: string | undefined,
  patterns: Patterns | undefined,
): Map<string, SignalScore> {
  const scores = new Map<string, SignalScore>();

  if (!taskType || taskType === 'Unknown') {
    return scores;
  }

  if (!patterns) {
    return scores;
  }

  const affinity = patterns.typeAffinities[taskType];

  if (!affinity?.fileWeights) {
    return scores;
  }

  for (const [filePath, entry] of Object.entries(affinity.fileWeights)) {
    if (entry.weight < 0.1) continue; // Skip very low affinity

    scores.set(filePath, {
      source: SignalSource.TypeAffinity,
      score: entry.weight,
      weight: 1.0, // Will be scaled by signal weight in orchestrator
      reason: `type-affinity: ${taskType} (${entry.occurrences} occurrences, weight ${entry.weight.toFixed(2)})`,
    });
  }

  logger.debug(MODULE, `Type affinity for ${taskType}: ${scores.size} files`);

  return scores;
}
