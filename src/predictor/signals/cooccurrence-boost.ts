/**
 * Co-occurrence Boost Signal — boosts scores for files that co-occur with already-predicted files.
 */

import type { Patterns } from '../../types/index.js';
import type { SignalScore } from '../types.js';
import { SignalSource } from '../types.js';
import { readPatterns } from '../../store/index.js';

/**
 * Boost scores for files that co-occur with files already predicted by other signals.
 * This signal runs after the other 3 signals to apply boosting.
 *
 * @param predictedFiles - Set of file paths already predicted by other signals
 * @param projectRoot - Project root for store access
 * @returns Map of filePath → SignalScore for co-occurring files
 */
export function scoreCooccurrenceBoost(
  predictedFiles: Set<string>,
  projectRoot: string,
): Map<string, SignalScore> {
  const scores = new Map<string, SignalScore>();

  const patternsResult = readPatterns(projectRoot);
  if (!patternsResult.ok) return scores;

  const patterns: Patterns = patternsResult.value;
  if (patterns.coOccurrences.length === 0) return scores;

  // For each co-occurrence pair, if one file is predicted, boost the other
  const boostCounts = new Map<string, { totalConfidence: number; sources: string[] }>();

  for (const coOcc of patterns.coOccurrences) {
    const [fileA, fileB] = coOcc.files;

    if (predictedFiles.has(fileA) && !predictedFiles.has(fileB)) {
      const existing = boostCounts.get(fileB) ?? { totalConfidence: 0, sources: [] };
      existing.totalConfidence += coOcc.confidence;
      existing.sources.push(fileA);
      boostCounts.set(fileB, existing);
    }

    if (predictedFiles.has(fileB) && !predictedFiles.has(fileA)) {
      const existing = boostCounts.get(fileA) ?? { totalConfidence: 0, sources: [] };
      existing.totalConfidence += coOcc.confidence;
      existing.sources.push(fileB);
      boostCounts.set(fileA, existing);
    }
  }

  // Normalize scores
  let maxConfidence = 0;
  for (const { totalConfidence } of boostCounts.values()) {
    if (totalConfidence > maxConfidence) maxConfidence = totalConfidence;
  }

  if (maxConfidence === 0) return scores;

  for (const [filePath, { totalConfidence, sources }] of boostCounts) {
    const normalizedScore = Math.min(totalConfidence / maxConfidence, 1.0);
    const uniqueSources = [...new Set(sources)];
    scores.set(filePath, {
      source: SignalSource.CooccurrenceBoost,
      score: normalizedScore,
      weight: 0,
      reason: `Co-occurs with ${uniqueSources.length} predicted file(s): ${uniqueSources.slice(0, 3).join(', ')}${uniqueSources.length > 3 ? '...' : ''}`,
    });
  }

  return scores;
}
