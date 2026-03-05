/**
 * History Similarity Signal — scores files by keyword overlap with past tasks' actual files.
 */

import type { TaskHistory } from '../../types/index.js';
import type { SignalScore } from '../types.js';
import { SignalSource } from '../types.js';
import { readTaskHistory } from '../../store/index.js';

/**
 * Extract keywords from a text prompt by splitting on non-alphanumeric chars
 * and normalizing to lowercase.
 */
export function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);
}

/**
 * Score candidate files based on similarity to past tasks' actual file lists.
 * Returns a map of filePath → SignalScore.
 *
 * On cold start (no history), returns an empty map.
 */
export function scoreHistorySimilarity(
  taskKeywords: string[],
  projectRoot: string,
): Map<string, SignalScore> {
  const scores = new Map<string, SignalScore>();

  const historyResult = readTaskHistory(projectRoot);
  if (!historyResult.ok) return scores;

  const history: TaskHistory = historyResult.value;
  if (history.tasks.length === 0) return scores;

  const taskKeywordSet = new Set(taskKeywords);

  // For each past task, compute keyword overlap, then credit that task's actual files
  const fileCounts = new Map<string, { totalWeight: number; matchCount: number }>();

  for (const entry of history.tasks) {
    const pastKeywords = extractKeywords(entry.taskText);
    const overlap = pastKeywords.filter((k) => taskKeywordSet.has(k));
    if (overlap.length === 0) continue;

    // Overlap ratio as weight for this past task
    const overlapRatio = overlap.length / Math.max(taskKeywordSet.size, 1);

    for (const file of entry.prediction.actualFiles) {
      const existing = fileCounts.get(file) ?? { totalWeight: 0, matchCount: 0 };
      existing.totalWeight += overlapRatio;
      existing.matchCount += 1;
      fileCounts.set(file, existing);
    }
  }

  // Normalize scores to 0-1 range
  let maxWeight = 0;
  for (const { totalWeight } of fileCounts.values()) {
    if (totalWeight > maxWeight) maxWeight = totalWeight;
  }

  if (maxWeight === 0) return scores;

  for (const [filePath, { totalWeight, matchCount }] of fileCounts) {
    const normalizedScore = totalWeight / maxWeight;
    scores.set(filePath, {
      source: SignalSource.HistorySimilarity,
      score: normalizedScore,
      weight: 0, // Weight applied by orchestrator
      reason: `Appeared in ${matchCount} similar past task(s)`,
    });
  }

  return scores;
}
