/**
 * Signal 7: File Recency — scores files based on how recently they were modified.
 * Uses the lastModified timestamp from ProjectMap FileEntry.
 * Score: exp(-daysSinceModification / HALF_LIFE_DAYS)
 */

import type { ProjectMap } from '../../types/index.js';
import type { SignalScore } from '../types.js';
import { SignalSource } from '../types.js';

/** Half-life in days — files modified 14 days ago score ~0.37. */
const HALF_LIFE_DAYS = 14;

/**
 * Score files based on modification recency from the project map.
 * Returns empty map if no project map is available.
 */
export function scoreFileRecency(
  projectMap: ProjectMap | undefined,
): Map<string, SignalScore> {
  const scores = new Map<string, SignalScore>();

  if (!projectMap) return scores;

  const now = Date.now();

  for (const [filePath, entry] of Object.entries(projectMap.files)) {
    if (!entry.lastModified) continue;

    const modifiedAt = new Date(entry.lastModified).getTime();
    if (isNaN(modifiedAt)) continue;

    const daysSince = (now - modifiedAt) / (1000 * 60 * 60 * 24);
    const recencyScore = Math.exp(-daysSince / HALF_LIFE_DAYS);

    // Only include files with meaningful recency (modified in last ~2 months)
    if (recencyScore < 0.05) continue;

    scores.set(filePath, {
      source: SignalSource.FileRecency,
      score: recencyScore,
      weight: 0, // Applied by orchestrator
      reason: `Modified ${daysSince < 1 ? 'today' : `${Math.round(daysSince)}d ago`}`,
    });
  }

  return scores;
}
