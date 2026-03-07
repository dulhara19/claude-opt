/**
 * Confidence scoring — score normalization and threshold filtering.
 *
 * Improvements:
 * - C1: Signal coverage penalty (files scored by few signals get penalized)
 * - E3: Cross-signal percentile normalization (preserves relative signal strength)
 */

import type { FilePrediction, SignalScore } from './types.js';
import { CONFIDENCE_THRESHOLD } from '../utils/index.js';

/**
 * Minimum number of signals for full score.
 * Files with fewer signals get penalized: composite × min(1.0, signalCount / MIN_SIGNAL_COVERAGE).
 */
const MIN_SIGNAL_COVERAGE = 2;

/**
 * E3: Normalize scores within a signal map using percentile ranking.
 * Instead of each signal normalizing by its own max (which hides signal quality),
 * this ranks all files by raw score within the signal and maps to 0–1 by percentile.
 *
 * A signal with 10 files: rank 1 → 1.0, rank 5 → 0.56, rank 10 → 0.1
 * Formula: percentile = (totalFiles - rank + 1) / totalFiles
 *
 * This preserves relative ordering but makes cross-signal comparison fairer:
 * a weak signal's top file gets the same 1.0 as a strong signal's top file,
 * but a weak signal's #5 file won't unfairly beat a strong signal's #2 file.
 */
export function normalizeByPercentile(
  signalScores: Map<string, SignalScore>,
): Map<string, SignalScore> {
  if (signalScores.size === 0) return signalScores;
  if (signalScores.size === 1) {
    // Single file — give it score 1.0
    const [[filePath, score]] = signalScores;
    return new Map([[filePath, { ...score, score: 1.0 }]]);
  }

  // Sort by raw score descending
  const entries = [...signalScores.entries()].sort((a, b) => b[1].score - a[1].score);
  const total = entries.length;

  const normalized = new Map<string, SignalScore>();
  for (let i = 0; i < entries.length; i++) {
    const [filePath, score] = entries[i];
    const percentile = (total - i) / total;
    normalized.set(filePath, { ...score, score: percentile });
  }

  return normalized;
}

/**
 * Compute the composite score for a file from its signal scores and weights.
 *
 * Formula: compositeScore = (sum(signal.score * signal.weight) / sum(weights)) × coverageFactor
 *
 * C1: Coverage factor penalizes files scored by only 1 signal.
 * A file with 1 signal gets 50% penalty, 2+ signals get full score.
 * This prevents single-signal flukes from dominating multi-signal consensus.
 *
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

  const rawScore = weightedSum / totalWeight;

  // C1: Signal coverage penalty
  const coverageFactor = Math.min(1.0, signals.length / MIN_SIGNAL_COVERAGE);
  const adjustedScore = rawScore * coverageFactor;

  return Math.min(Math.max(adjustedScore, 0), 1);
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
