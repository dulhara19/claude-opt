/**
 * Confidence scoring — score normalization and threshold filtering.
 */

import type { FilePrediction, SignalScore } from './types.js';
import { CONFIDENCE_THRESHOLD } from '../utils/index.js';

/**
 * Compute the composite score for a file from its signal scores and weights.
 * Formula: compositeScore = sum(signal.score * signal.weight) / sum(weights)
 * Result is clamped to 0.0–1.0.
 */
export function computeCompositeScore(
  signals: SignalScore[],
): number {
  if (signals.length === 0) return 0;

  let weightedSum = 0;
  let totalWeight = 0;

  for (const signal of signals) {
    weightedSum += signal.score * signal.weight;
    totalWeight += signal.weight;
  }

  if (totalWeight === 0) return 0;

  return Math.min(Math.max(weightedSum / totalWeight, 0), 1);
}

/**
 * Filter predictions by confidence threshold.
 * Returns only files above the threshold, sorted by score descending.
 * Implements graceful degradation: returns empty array if all below threshold.
 */
export function filterByThreshold(
  predictions: FilePrediction[],
  threshold: number = CONFIDENCE_THRESHOLD,
): FilePrediction[] {
  return predictions
    .filter((p) => p.score >= threshold)
    .sort((a, b) => b.score - a.score);
}
