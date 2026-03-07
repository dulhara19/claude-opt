/**
 * Graph Traversal Signal — scores files by adjacency to keyword-matched files in the dependency graph.
 *
 * Improvements:
 * - G1: 2-hop traversal with decay (1-hop=1.0, 2-hop=0.5)
 * - G3: Bidirectional weight asymmetry (importers weighted 0.7 vs imports 1.0)
 * - G4: Seed file deduplication — accepts skipFiles to avoid double-scoring with keyword lookup
 * - G2: Edge-type weighting (reference/link edges weighted lower than import edges)
 */

import type { DependencyGraph, KeywordIndex } from '../../types/index.js';
import type { SignalScore } from '../types.js';
import { SignalSource } from '../types.js';

/** G3: Weight for "imports" edges (dependencies — upstream). */
const IMPORT_EDGE_WEIGHT = 1.0;
/** G3: Weight for "importedBy" edges (importers — downstream). */
const IMPORTED_BY_EDGE_WEIGHT = 0.7;
/** G2: Weight multiplier by edge type. */
const EDGE_TYPE_WEIGHTS: Record<string, number> = {
  import: 1.0,       // Direct value import — highest relevance
  require: 1.0,      // CommonJS require — same as import
  reference: 0.3,    // Type-only reference or weak link
  link: 0.5,         // Document links (markdown, etc.)
};
/** G1: Score decay for 2-hop neighbors (relative to 1-hop). */
const TWO_HOP_DECAY = 0.5;
/** G1: Maximum 2-hop neighbors to prevent blowup on large graphs. */
const MAX_2HOP_NEIGHBORS = 50;

/**
 * Build a lookup of edge types: "source→target" → edge type weight.
 * Used by G2 to apply different weights based on how files are connected.
 */
function buildEdgeTypeLookup(graph: DependencyGraph): Map<string, number> {
  const lookup = new Map<string, number>();
  for (const edge of graph.edges) {
    const key = `${edge.source}→${edge.target}`;
    const typeWeight = EDGE_TYPE_WEIGHTS[edge.type] ?? 1.0;
    // If multiple edges between same pair, use the highest weight
    const existing = lookup.get(key) ?? 0;
    if (typeWeight > existing) {
      lookup.set(key, typeWeight);
    }
  }
  return lookup;
}

/**
 * Get weighted neighbors for a file from the dependency graph.
 * G2: Edge type weights are applied from the edge type lookup.
 * G3: Directional asymmetry (imports=1.0, importedBy=0.7).
 * Returns array of [neighborPath, edgeWeight] tuples.
 */
function getWeightedNeighbors(
  filePath: string,
  graph: DependencyGraph,
  edgeTypeLookup: Map<string, number>,
): Array<[string, number]> {
  const adjacency = graph.adjacency[filePath];
  if (!adjacency) return [];

  const neighbors: Array<[string, number]> = [];
  for (const dep of adjacency.imports) {
    // G2: Apply edge type weight
    const edgeKey = `${filePath}→${dep}`;
    const typeWeight = edgeTypeLookup.get(edgeKey) ?? 1.0;
    neighbors.push([dep, IMPORT_EDGE_WEIGHT * typeWeight]);
  }
  for (const importer of adjacency.importedBy) {
    // G2: Apply edge type weight (reverse direction)
    const edgeKey = `${importer}→${filePath}`;
    const typeWeight = edgeTypeLookup.get(edgeKey) ?? 1.0;
    neighbors.push([importer, IMPORTED_BY_EDGE_WEIGHT * typeWeight]);
  }
  return neighbors;
}

/**
 * Score candidate files based on 1-hop and 2-hop neighbors in the dependency graph.
 * Seed files are those matched by keywords in the keyword index.
 *
 * G1: 2-hop traversal — neighbors of neighbors are discovered with 0.5 decay.
 * G3: importedBy edges weighted 0.7 vs imports at 1.0.
 * G4: skipFiles parameter allows the orchestrator to exclude files already
 *      scored by keyword lookup, so graph traversal focuses on neighbor discovery.
 *
 * @param taskKeywords - Keywords extracted from the task prompt
 * @param graph - Dependency graph from store cache
 * @param index - Keyword index from store cache
 * @param skipFiles - Files to exclude from seed scoring (G4: already scored by keyword lookup)
 */
export function scoreGraphTraversal(
  taskKeywords: string[],
  graph: DependencyGraph | undefined,
  index: KeywordIndex | undefined,
  skipFiles?: Set<string>,
): Map<string, SignalScore> {
  const scores = new Map<string, SignalScore>();

  if (!graph || !index) return scores;

  // Find seed files: files that match task keywords
  const seedFiles = new Set<string>();
  for (const keyword of taskKeywords) {
    const files = index.keywordToFiles[keyword];
    if (files) {
      for (const f of files) seedFiles.add(f);
    }
  }

  if (seedFiles.size === 0) return scores;

  // G2: Build edge type lookup for type-based weighting
  const edgeTypeLookup = buildEdgeTypeLookup(graph);

  // Accumulate weighted scores for neighbors
  const neighborScores = new Map<string, { weightedCount: number; seeds: string[]; hop: number }>();

  // 1-hop traversal from seed files
  const oneHopFiles = new Set<string>();

  for (const seed of seedFiles) {
    const neighbors = getWeightedNeighbors(seed, graph, edgeTypeLookup);

    for (const [neighbor, edgeWeight] of neighbors) {
      if (seedFiles.has(neighbor)) continue;

      oneHopFiles.add(neighbor);
      const existing = neighborScores.get(neighbor) ?? { weightedCount: 0, seeds: [], hop: 1 };
      existing.weightedCount += edgeWeight;
      existing.seeds.push(seed);
      neighborScores.set(neighbor, existing);
    }
  }

  // G1: 2-hop traversal from 1-hop neighbors
  let twoHopCount = 0;
  for (const oneHopFile of oneHopFiles) {
    if (twoHopCount >= MAX_2HOP_NEIGHBORS) break;

    const neighbors = getWeightedNeighbors(oneHopFile, graph, edgeTypeLookup);

    for (const [neighbor, edgeWeight] of neighbors) {
      if (twoHopCount >= MAX_2HOP_NEIGHBORS) break;

      // Skip seeds and 1-hop files (already scored)
      if (seedFiles.has(neighbor) || oneHopFiles.has(neighbor)) continue;

      // Apply 2-hop decay
      const decayedWeight = edgeWeight * TWO_HOP_DECAY;

      const existing = neighborScores.get(neighbor) ?? { weightedCount: 0, seeds: [], hop: 2 };
      existing.weightedCount += decayedWeight;
      if (!existing.seeds.includes(oneHopFile)) {
        existing.seeds.push(oneHopFile);
      }
      existing.hop = 2; // Mark as 2-hop
      neighborScores.set(neighbor, existing);
      twoHopCount++;
    }
  }

  // Normalize scores by max weighted count
  let maxScore = 0;
  for (const { weightedCount } of neighborScores.values()) {
    if (weightedCount > maxScore) maxScore = weightedCount;
  }

  if (maxScore === 0) return scores;

  for (const [filePath, { weightedCount, seeds, hop }] of neighborScores) {
    const normalizedScore = weightedCount / maxScore;
    const uniqueSeeds = [...new Set(seeds)];
    const hopLabel = hop === 2 ? ' (2-hop)' : '';
    scores.set(filePath, {
      source: SignalSource.GraphTraversal,
      score: normalizedScore,
      weight: 0,
      reason: `Neighbor of ${uniqueSeeds.length} file(s)${hopLabel}: ${uniqueSeeds.slice(0, 3).join(', ')}${uniqueSeeds.length > 3 ? '...' : ''}`,
    });
  }

  // G4: Only score seed files if they're NOT in the skipFiles set
  for (const seed of seedFiles) {
    if (skipFiles?.has(seed)) continue;
    scores.set(seed, {
      source: SignalSource.GraphTraversal,
      score: 1.0,
      weight: 0,
      reason: 'Direct keyword match in dependency graph',
    });
  }

  return scores;
}
