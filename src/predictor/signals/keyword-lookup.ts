/**
 * Keyword Lookup Signal — scores files by direct keyword-to-file index matches.
 *
 * Improvements:
 * - K1: TF-IDF weighting (rare keywords contribute more to score)
 */

import type { KeywordIndex } from '../../types/index.js';
import type { SignalScore } from '../types.js';
import { SignalSource } from '../types.js';

/**
 * Score candidate files by IDF-weighted keyword matches in the keyword index.
 * Rare keywords (appearing in few files) contribute more than common keywords.
 *
 * Returns a map of filePath → SignalScore.
 */
export function scoreKeywordLookup(
  taskKeywords: string[],
  index: KeywordIndex | undefined,
): Map<string, SignalScore> {
  const scores = new Map<string, SignalScore>();

  if (!index) return scores;

  const totalFiles = Object.keys(index.fileToKeywords).length;

  // K1: Pre-compute IDF for each keyword
  const keywordIdfs = new Map<string, number>();
  for (const keyword of taskKeywords) {
    const files = index.keywordToFiles[keyword];
    if (!files || files.length === 0) continue;
    const idf = totalFiles > 0 ? Math.log(totalFiles / files.length) : 1.0;
    keywordIdfs.set(keyword, Math.max(idf, 0.1)); // Floor at 0.1 to avoid zero weights
  }

  // Count IDF-weighted keyword matches per file
  const fileScores = new Map<string, { idfScore: number; count: number; matchedKeywords: string[] }>();

  for (const keyword of taskKeywords) {
    const files = index.keywordToFiles[keyword];
    if (!files) continue;

    const idf = keywordIdfs.get(keyword) ?? 1.0;

    for (const file of files) {
      const existing = fileScores.get(file) ?? { idfScore: 0, count: 0, matchedKeywords: [] };
      existing.idfScore += idf;
      existing.count += 1;
      existing.matchedKeywords.push(keyword);
      fileScores.set(file, existing);
    }
  }

  // Normalize scores by max IDF score
  let maxScore = 0;
  for (const { idfScore } of fileScores.values()) {
    if (idfScore > maxScore) maxScore = idfScore;
  }

  if (maxScore === 0) return scores;

  for (const [filePath, { idfScore, count, matchedKeywords }] of fileScores) {
    const normalizedScore = idfScore / maxScore;
    scores.set(filePath, {
      source: SignalSource.KeywordLookup,
      score: normalizedScore,
      weight: 0,
      reason: `Matched ${count} keyword(s): ${matchedKeywords.slice(0, 5).join(', ')}${matchedKeywords.length > 5 ? '...' : ''}`,
    });
  }

  return scores;
}
