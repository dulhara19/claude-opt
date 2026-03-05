/**
 * Graph Traversal Signal — scores files by adjacency to keyword-matched files in the dependency graph.
 */

import type { DependencyGraph, KeywordIndex } from '../../types/index.js';
import type { SignalScore } from '../types.js';
import { SignalSource } from '../types.js';
import { readDependencyGraph, readKeywordIndex } from '../../store/index.js';

/**
 * Score candidate files based on 1-hop neighbors in the dependency graph.
 * Seed files are those matched by keywords in the keyword index.
 *
 * Returns a map of filePath → SignalScore.
 */
export function scoreGraphTraversal(
  taskKeywords: string[],
  projectRoot: string,
): Map<string, SignalScore> {
  const scores = new Map<string, SignalScore>();

  const graphResult = readDependencyGraph(projectRoot);
  if (!graphResult.ok) return scores;

  const indexResult = readKeywordIndex(projectRoot);
  if (!indexResult.ok) return scores;

  const graph: DependencyGraph = graphResult.value;
  const index: KeywordIndex = indexResult.value;

  // Find seed files: files that match task keywords
  const seedFiles = new Set<string>();
  for (const keyword of taskKeywords) {
    const files = index.keywordToFiles[keyword];
    if (files) {
      for (const f of files) seedFiles.add(f);
    }
  }

  if (seedFiles.size === 0) return scores;

  // Traverse 1-hop neighbors from seed files
  const neighborCounts = new Map<string, { count: number; seeds: string[] }>();

  for (const seed of seedFiles) {
    const adjacency = graph.adjacency[seed];
    if (!adjacency) continue;

    // Combine imports and importedBy as neighbors
    const neighbors = [...adjacency.imports, ...adjacency.importedBy];

    for (const neighbor of neighbors) {
      // Don't score seed files themselves — they'll be scored by keyword lookup
      if (seedFiles.has(neighbor)) continue;

      const existing = neighborCounts.get(neighbor) ?? { count: 0, seeds: [] };
      existing.count += 1;
      existing.seeds.push(seed);
      neighborCounts.set(neighbor, existing);
    }
  }

  // Normalize scores by max neighbor count
  let maxCount = 0;
  for (const { count } of neighborCounts.values()) {
    if (count > maxCount) maxCount = count;
  }

  if (maxCount === 0) return scores;

  for (const [filePath, { count, seeds }] of neighborCounts) {
    const normalizedScore = count / maxCount;
    const uniqueSeeds = [...new Set(seeds)];
    scores.set(filePath, {
      source: SignalSource.GraphTraversal,
      score: normalizedScore,
      weight: 0,
      reason: `Neighbor of ${uniqueSeeds.length} seed file(s): ${uniqueSeeds.slice(0, 3).join(', ')}${uniqueSeeds.length > 3 ? '...' : ''}`,
    });
  }

  // Also give seed files a score (they're directly matched)
  for (const seed of seedFiles) {
    scores.set(seed, {
      source: SignalSource.GraphTraversal,
      score: 1.0,
      weight: 0,
      reason: 'Direct keyword match in dependency graph',
    });
  }

  return scores;
}
