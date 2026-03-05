/**
 * Keyword Lookup Signal — scores files by direct keyword-to-file index matches.
 */

import type { KeywordIndex } from '../../types/index.js';
import type { SignalScore } from '../types.js';
import { SignalSource } from '../types.js';
import { readKeywordIndex } from '../../store/index.js';

/**
 * Score candidate files by number of keyword matches in the keyword index.
 * This signal is always available (keyword index is built by the scanner).
 *
 * Returns a map of filePath → SignalScore.
 */
export function scoreKeywordLookup(
  taskKeywords: string[],
  projectRoot: string,
): Map<string, SignalScore> {
  const scores = new Map<string, SignalScore>();

  const indexResult = readKeywordIndex(projectRoot);
  if (!indexResult.ok) return scores;

  const index: KeywordIndex = indexResult.value;

  // Count how many task keywords match each file
  const fileCounts = new Map<string, { count: number; matchedKeywords: string[] }>();

  for (const keyword of taskKeywords) {
    const files = index.keywordToFiles[keyword];
    if (!files) continue;

    for (const file of files) {
      const existing = fileCounts.get(file) ?? { count: 0, matchedKeywords: [] };
      existing.count += 1;
      existing.matchedKeywords.push(keyword);
      fileCounts.set(file, existing);
    }
  }

  // Normalize scores by max match count
  let maxCount = 0;
  for (const { count } of fileCounts.values()) {
    if (count > maxCount) maxCount = count;
  }

  if (maxCount === 0) return scores;

  for (const [filePath, { count, matchedKeywords }] of fileCounts) {
    const normalizedScore = count / maxCount;
    scores.set(filePath, {
      source: SignalSource.KeywordLookup,
      score: normalizedScore,
      weight: 0,
      reason: `Matched ${count} keyword(s): ${matchedKeywords.slice(0, 5).join(', ')}${matchedKeywords.length > 5 ? '...' : ''}`,
    });
  }

  return scores;
}
