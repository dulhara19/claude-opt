/**
 * Weight correction module — self-correcting signal weights and stale decay.
 * Boosts accurate predictions, decays inaccurate ones, and flags stale entries. (Story 3.3)
 *
 * L1: Added in-place variants that operate on pre-loaded objects.
 * L21: Stale decay skips files that received boost/decay in the same run.
 */

import type { DependencyGraph, Patterns, TaskEntry } from '../types/index.js';
import { toInternal, logger } from '../utils/index.js';
import {
  readDependencyGraph, writeDependencyGraph,
  readPatterns, writePatterns,
  readTaskHistory,
} from '../store/index.js';
import type { WeightCorrection, StaleEntry, WeightCorrectionResult } from './types.js';
import {
  BOOST_FACTOR, DECAY_FACTOR, WEIGHT_FLOOR, WEIGHT_CEILING,
  STALE_THRESHOLD_SESSIONS, STALE_DECAY_RATE, FULLY_STALE_WEIGHT,
  LEARNER_EDGE_INITIAL_WEIGHT,
} from './types.js';

const MODULE = 'weight-correction';

// ─── Weight Correction (Boost/Decay) ──────────────────────────

/**
 * Build a map of predicted file -> confidence score from the prediction context.
 */
function buildConfidenceMap(
  predictedFiles: string[],
  confidences: number[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (let i = 0; i < predictedFiles.length; i++) {
    const file = toInternal(predictedFiles[i]);
    map.set(file, confidences[i] ?? 0.5);
  }
  return map;
}

/**
 * Compute weight corrections from a pre-loaded graph (L1 in-place variant).
 */
export function correctWeightsFromGraph(
  predictedFiles: string[],
  actualFiles: string[],
  confidences: number[],
  taskId: string,
  graph: DependencyGraph,
): WeightCorrection[] {
  const corrections: WeightCorrection[] = [];
  const normalizedPredicted = predictedFiles.map(toInternal);
  const normalizedActual = new Set(actualFiles.map(toInternal));
  const confidenceMap = buildConfidenceMap(predictedFiles, confidences);

  // Build file -> edge weight lookup for learner edges
  const fileWeightMap = new Map<string, { weight: number }>();
  for (const edge of graph.edges) {
    if (edge.discoveredBy === 'learner') {
      const w = edge.weight ?? LEARNER_EDGE_INITIAL_WEIGHT;
      if (!fileWeightMap.has(edge.source)) fileWeightMap.set(edge.source, { weight: w });
      if (!fileWeightMap.has(edge.target)) fileWeightMap.set(edge.target, { weight: w });
    }
  }

  for (const file of normalizedPredicted) {
    const confidence = confidenceMap.get(file) ?? 0.5;
    const existing = fileWeightMap.get(file);
    const currentWeight = existing?.weight ?? LEARNER_EDGE_INITIAL_WEIGHT;

    if (normalizedActual.has(file)) {
      const boost = BOOST_FACTOR * confidence;
      const newWeight = Math.min(currentWeight + boost, WEIGHT_CEILING);
      const delta = newWeight - currentWeight;
      if (delta > 0) {
        corrections.push({
          file, previousWeight: currentWeight, newWeight, delta,
          reason: 'boost', predictionConfidence: confidence, taskId,
        });
      }
    } else {
      const decay = DECAY_FACTOR * confidence;
      const newWeight = Math.max(currentWeight - decay, WEIGHT_FLOOR);
      const delta = newWeight - currentWeight;
      if (delta < 0) {
        corrections.push({
          file, previousWeight: currentWeight, newWeight, delta,
          reason: 'decay', predictionConfidence: confidence, taskId,
        });
      }
    }
  }

  return corrections;
}

/**
 * Classify predicted files and compute weight corrections (boost/decay).
 * Disk-based version (backward compat for tests).
 */
export function correctWeights(
  predictedFiles: string[],
  actualFiles: string[],
  confidences: number[],
  taskId: string,
  projectRoot: string,
): WeightCorrection[] {
  const graphResult = readDependencyGraph(projectRoot);
  if (!graphResult.ok) {
    logger.warn(MODULE, `Cannot read dependency graph for weight correction: ${graphResult.error}`);
    return [];
  }
  return correctWeightsFromGraph(predictedFiles, actualFiles, confidences, taskId, graphResult.value);
}

// ─── Apply Weight Corrections to Dependency Graph ─────────────

/**
 * Apply weight corrections in-place to a graph object (L1).
 */
export function applyWeightCorrectionsInPlace(
  corrections: WeightCorrection[],
  graph: DependencyGraph,
): boolean {
  if (corrections.length === 0) return false;
  let changed = false;

  for (const correction of corrections) {
    for (const edge of graph.edges) {
      if (edge.discoveredBy !== 'learner') continue;
      if (edge.source === correction.file || edge.target === correction.file) {
        edge.weight = correction.newWeight;
        changed = true;
        logger.debug(MODULE, `${correction.reason} ${correction.file}: ${correction.previousWeight.toFixed(3)} -> ${correction.newWeight.toFixed(3)}`);
      }
    }
  }

  if (changed) {
    graph.updatedAt = new Date().toISOString();
  }

  return changed;
}

/**
 * Apply weight corrections to dependency graph (disk-based, backward compat).
 */
export function applyWeightCorrections(
  corrections: WeightCorrection[],
  projectRoot: string,
): boolean {
  if (corrections.length === 0) return false;

  const graphResult = readDependencyGraph(projectRoot);
  if (!graphResult.ok) {
    logger.warn(MODULE, `Cannot read graph for corrections: ${graphResult.error}`);
    return false;
  }
  const graph = graphResult.value;
  const changed = applyWeightCorrectionsInPlace(corrections, graph);

  if (changed) {
    const writeResult = writeDependencyGraph(projectRoot, graph);
    if (!writeResult.ok) {
      logger.warn(MODULE, `Failed to write corrected graph: ${writeResult.error}`);
      return false;
    }
  }

  return changed;
}

// ─── Apply Weight Corrections to Patterns ─────────────────────

/**
 * Apply weight corrections in-place to patterns object (L1).
 */
export function applyWeightToPatternsInPlace(
  corrections: WeightCorrection[],
  patterns: Patterns,
): boolean {
  if (corrections.length === 0) return false;
  let changed = false;

  const correctionMap = new Map<string, WeightCorrection>();
  for (const c of corrections) {
    correctionMap.set(c.file, c);
  }

  for (const coOcc of patterns.coOccurrences) {
    const [fileA, fileB] = coOcc.files;
    const corrA = correctionMap.get(fileA);
    const corrB = correctionMap.get(fileB);
    const correction = corrA ?? corrB;

    if (correction) {
      const currentDecay = coOcc.decayFactor ?? 1.0;
      if (correction.reason === 'boost') {
        coOcc.decayFactor = Math.min(currentDecay * 1.1, 1.0);
      } else if (correction.reason === 'decay') {
        coOcc.decayFactor = Math.max(currentDecay * 0.9, 0.0);
      }
      changed = true;
    }
  }

  for (const [, affinity] of Object.entries(patterns.typeAffinities)) {
    if (!affinity.fileWeights) continue;
    for (const [filePath, entry] of Object.entries(affinity.fileWeights)) {
      const correction = correctionMap.get(filePath);
      if (correction) {
        if (correction.reason === 'boost') {
          entry.weight = Math.min(entry.weight + BOOST_FACTOR * correction.predictionConfidence, WEIGHT_CEILING);
        } else if (correction.reason === 'decay') {
          entry.weight = Math.max(entry.weight - DECAY_FACTOR * correction.predictionConfidence, WEIGHT_FLOOR);
        }
        changed = true;
      }
    }
    const weights = Object.values(affinity.fileWeights);
    if (weights.length > 0) {
      affinity.confidence = weights.reduce((sum, w) => sum + w.weight, 0) / weights.length;
    }
  }

  return changed;
}

/**
 * Apply weight corrections to patterns (disk-based, backward compat).
 */
export function applyWeightToPatterns(
  corrections: WeightCorrection[],
  projectRoot: string,
): boolean {
  if (corrections.length === 0) return false;

  const patternsResult = readPatterns(projectRoot);
  if (!patternsResult.ok) {
    logger.warn(MODULE, `Cannot read patterns for corrections: ${patternsResult.error}`);
    return false;
  }
  const patterns = patternsResult.value;
  const changed = applyWeightToPatternsInPlace(corrections, patterns);

  if (changed) {
    const writeResult = writePatterns(projectRoot, patterns);
    if (!writeResult.ok) {
      logger.warn(MODULE, `Failed to write corrected patterns: ${writeResult.error}`);
      return false;
    }
  }

  return changed;
}

// ─── Stale Entry Decay ────────────────────────────────────────

/**
 * Build lastSeenMap from task history tasks.
 * L22: Also tracks the sessionId of when each file was last seen.
 */
function buildLastSeenMap(tasks: TaskEntry[]): { lastSeen: Map<string, string>; lastSessionId: Map<string, number> } {
  const lastSeen = new Map<string, string>();
  const lastSessionId = new Map<string, number>();
  for (const task of tasks) {
    for (const file of task.prediction.actualFiles) {
      const normalized = toInternal(file);
      const existing = lastSeen.get(normalized);
      if (!existing || task.timestamp > existing) {
        lastSeen.set(normalized, task.timestamp);
        if (task.sessionId != null) {
          lastSessionId.set(normalized, task.sessionId);
        }
      }
    }
  }
  return { lastSeen, lastSessionId };
}

/**
 * Count distinct sessions since a file was last seen (L22).
 * Falls back to taskCount/3 heuristic when session IDs are unavailable.
 */
function countSessionsSince(
  tasks: TaskEntry[],
  lastSeenTimestamp: string,
  lastSeenSessionId: number | undefined,
): number {
  const tasksSince = tasks.filter((t) => t.timestamp > lastSeenTimestamp);

  // L22: Use session IDs when available
  if (lastSeenSessionId != null) {
    const sessionIds = new Set<number>();
    for (const t of tasksSince) {
      if (t.sessionId != null && t.sessionId > lastSeenSessionId) {
        sessionIds.add(t.sessionId);
      }
    }
    if (sessionIds.size > 0) return sessionIds.size;
  }

  // Fallback: approximate sessions from task count
  return Math.floor(tasksSince.length / 3);
}

/**
 * Decay stale entries in-place on graph and patterns (L1 + L21).
 * L21: skipFiles are excluded from stale decay (they received corrections this run).
 */
export function decayStaleEntriesInPlace(
  tasks: TaskEntry[],
  patterns: Patterns,
  graph: DependencyGraph,
  currentSessionCount: number,
  skipFiles?: Set<string>,
): { staleEntries: StaleEntry[]; patternsUpdated: boolean; graphUpdated: boolean } {
  const staleEntries: StaleEntry[] = [];
  let patternsUpdated = false;
  let graphUpdated = false;

  const { lastSeen: lastSeenMap, lastSessionId: lastSessionIdMap } = buildLastSeenMap(tasks);

  // Decay co-occurrence patterns
  for (const coOcc of patterns.coOccurrences) {
    const [fileA, fileB] = coOcc.files;

    // L21: Skip if either file received a correction this run
    if (skipFiles && (skipFiles.has(fileA) || skipFiles.has(fileB))) continue;

    const lastSeenA = lastSeenMap.get(fileA);
    const lastSeenB = lastSeenMap.get(fileB);
    const lastSeen = lastSeenA && lastSeenB
      ? (lastSeenA > lastSeenB ? lastSeenA : lastSeenB)
      : lastSeenA ?? lastSeenB;

    if (!lastSeen) continue;

    // L22: Use session-based counting
    const lastSessionA = lastSessionIdMap.get(fileA);
    const lastSessionB = lastSessionIdMap.get(fileB);
    const lastSession = lastSessionA != null && lastSessionB != null
      ? Math.max(lastSessionA, lastSessionB)
      : lastSessionA ?? lastSessionB;
    const sessionsSince = countSessionsSince(tasks, lastSeen, lastSession);

    if (sessionsSince > STALE_THRESHOLD_SESSIONS) {
      const sessionsOverThreshold = sessionsSince - STALE_THRESHOLD_SESSIONS;
      const currentDecay = coOcc.decayFactor ?? 1.0;
      const newDecay = currentDecay * Math.pow(STALE_DECAY_RATE, sessionsOverThreshold);
      coOcc.decayFactor = newDecay;
      const isFullyStale = newDecay < FULLY_STALE_WEIGHT;

      staleEntries.push({
        file: `${fileA}::${fileB}`,
        lastSeen,
        sessionsSinceLastSeen: sessionsSince,
        currentDecayFactor: newDecay,
        isFullyStale,
      });

      patternsUpdated = true;
    }
  }

  // Decay type affinity weights
  for (const [, affinity] of Object.entries(patterns.typeAffinities)) {
    if (!affinity.fileWeights) continue;
    for (const [filePath, entry] of Object.entries(affinity.fileWeights)) {
      // L21: Skip if this file received a correction this run
      if (skipFiles && skipFiles.has(filePath)) continue;

      const lastSeen = lastSeenMap.get(filePath);
      if (!lastSeen) continue;

      // L22: Use session-based counting
      const lastSession = lastSessionIdMap.get(filePath);
      const sessionsSince = countSessionsSince(tasks, lastSeen, lastSession);

      if (sessionsSince > STALE_THRESHOLD_SESSIONS) {
        const sessionsOverThreshold = sessionsSince - STALE_THRESHOLD_SESSIONS;
        const newWeight = entry.weight * Math.pow(STALE_DECAY_RATE, sessionsOverThreshold);
        const isFullyStale = newWeight < FULLY_STALE_WEIGHT;

        if (newWeight !== entry.weight) {
          staleEntries.push({
            file: filePath,
            lastSeen,
            sessionsSinceLastSeen: sessionsSince,
            currentDecayFactor: newWeight,
            isFullyStale,
          });
          entry.weight = Math.max(newWeight, WEIGHT_FLOOR);
          patternsUpdated = true;
        }
      }
    }
  }

  // Decay learner-discovered edges in dependency graph
  for (const edge of graph.edges) {
    if (edge.discoveredBy !== 'learner') continue;

    // L21: Skip if either file received a correction this run
    if (skipFiles && (skipFiles.has(edge.source) || skipFiles.has(edge.target))) continue;

    const lastSeenSource = lastSeenMap.get(edge.source);
    const lastSeenTarget = lastSeenMap.get(edge.target);
    const lastSeen = lastSeenSource && lastSeenTarget
      ? (lastSeenSource > lastSeenTarget ? lastSeenSource : lastSeenTarget)
      : lastSeenSource ?? lastSeenTarget;

    if (!lastSeen) continue;

    // L22: Use session-based counting
    const lastSessionSource = lastSessionIdMap.get(edge.source);
    const lastSessionTarget = lastSessionIdMap.get(edge.target);
    const lastSession = lastSessionSource != null && lastSessionTarget != null
      ? Math.max(lastSessionSource, lastSessionTarget)
      : lastSessionSource ?? lastSessionTarget;
    const sessionsSince = countSessionsSince(tasks, lastSeen, lastSession);

    if (sessionsSince > STALE_THRESHOLD_SESSIONS) {
      const sessionsOverThreshold = sessionsSince - STALE_THRESHOLD_SESSIONS;
      const currentWeight = edge.weight ?? LEARNER_EDGE_INITIAL_WEIGHT;
      const newWeight = Math.max(currentWeight * Math.pow(STALE_DECAY_RATE, sessionsOverThreshold), WEIGHT_FLOOR);

      if (newWeight !== currentWeight) {
        edge.weight = newWeight;
        graphUpdated = true;
      }
    }
  }

  if (graphUpdated) {
    graph.updatedAt = new Date().toISOString();
  }

  const fullyStale = staleEntries.filter((e) => e.isFullyStale);
  if (fullyStale.length > 0) {
    logger.info(MODULE, `Flagged ${fullyStale.length} stale entries for Doctor analysis`);
  }

  return { staleEntries, patternsUpdated, graphUpdated };
}

/**
 * Decay stale entries (disk-based, backward compat).
 */
export function decayStaleEntries(
  projectRoot: string,
  currentSessionCount: number,
): { staleEntries: StaleEntry[]; patternsUpdated: boolean; graphUpdated: boolean } {
  const historyResult = readTaskHistory(projectRoot);
  if (!historyResult.ok) {
    logger.warn(MODULE, `Cannot read history for stale decay: ${historyResult.error}`);
    return { staleEntries: [], patternsUpdated: false, graphUpdated: false };
  }

  const patternsResult = readPatterns(projectRoot);
  if (!patternsResult.ok) {
    return { staleEntries: [], patternsUpdated: false, graphUpdated: false };
  }

  const graphResult = readDependencyGraph(projectRoot);
  if (!graphResult.ok) {
    return { staleEntries: [], patternsUpdated: false, graphUpdated: false };
  }

  const result = decayStaleEntriesInPlace(
    historyResult.value.tasks, patternsResult.value, graphResult.value, currentSessionCount,
  );

  if (result.patternsUpdated) {
    const writeResult = writePatterns(projectRoot, patternsResult.value);
    if (!writeResult.ok) {
      logger.warn(MODULE, `Failed to write stale-decayed patterns: ${writeResult.error}`);
      result.patternsUpdated = false;
    }
  }

  if (result.graphUpdated) {
    const writeResult = writeDependencyGraph(projectRoot, graphResult.value);
    if (!writeResult.ok) {
      logger.warn(MODULE, `Failed to write stale-decayed graph: ${writeResult.error}`);
      result.graphUpdated = false;
    }
  }

  return result;
}

// ─── Full Weight Correction Pipeline ──────────────────────────

/**
 * In-place weight correction pipeline (L1 + L21).
 * Operates on pre-loaded graph and patterns objects.
 * L21: Files that received boost/decay are excluded from stale decay.
 */
export function runWeightCorrectionInPlace(
  predictedFiles: string[],
  actualFiles: string[],
  confidences: number[],
  taskId: string,
  graph: DependencyGraph,
  patterns: Patterns,
  tasks: TaskEntry[],
  currentSessionCount: number,
): WeightCorrectionResult {
  // Step 1: Compute corrections from graph
  const corrections = correctWeightsFromGraph(predictedFiles, actualFiles, confidences, taskId, graph);

  const boostCount = corrections.filter((c) => c.reason === 'boost').length;
  const decayCount = corrections.filter((c) => c.reason === 'decay').length;

  // Step 2: Apply to graph in-place
  const graphUpdatedFromCorrections = applyWeightCorrectionsInPlace(corrections, graph);

  // Step 3: Apply to patterns in-place
  const patternsUpdatedFromCorrections = applyWeightToPatternsInPlace(corrections, patterns);

  // Step 4: Stale decay in-place (L21: skip corrected files)
  const correctedFiles = new Set(corrections.map((c) => c.file));
  const staleResult = decayStaleEntriesInPlace(
    tasks, patterns, graph, currentSessionCount, correctedFiles,
  );

  logger.debug(MODULE, `Weight corrections: ${boostCount} boosts, ${decayCount} decays, ${staleResult.staleEntries.length} stale`);

  return {
    corrections,
    staleEntries: staleResult.staleEntries,
    boostCount,
    decayCount,
    staleCount: staleResult.staleEntries.length,
    patternsUpdated: patternsUpdatedFromCorrections || staleResult.patternsUpdated,
    graphUpdated: graphUpdatedFromCorrections || staleResult.graphUpdated,
  };
}

/**
 * Run the full weight correction pipeline (disk-based, backward compat).
 */
export function runWeightCorrection(
  predictedFiles: string[],
  actualFiles: string[],
  confidences: number[],
  taskId: string,
  projectRoot: string,
  currentSessionCount: number,
): WeightCorrectionResult {
  // Step 1: Compute corrections
  const corrections = correctWeights(predictedFiles, actualFiles, confidences, taskId, projectRoot);

  const boostCount = corrections.filter((c) => c.reason === 'boost').length;
  const decayCount = corrections.filter((c) => c.reason === 'decay').length;

  // Step 2: Apply to dependency graph
  const graphUpdatedFromCorrections = applyWeightCorrections(corrections, projectRoot);

  // Step 3: Apply to patterns
  const patternsUpdatedFromCorrections = applyWeightToPatterns(corrections, projectRoot);

  // Step 4: Stale decay
  const staleResult = decayStaleEntries(projectRoot, currentSessionCount);

  logger.debug(MODULE, `Weight corrections: ${boostCount} boosts, ${decayCount} decays, ${staleResult.staleEntries.length} stale`);

  return {
    corrections,
    staleEntries: staleResult.staleEntries,
    boostCount,
    decayCount,
    staleCount: staleResult.staleEntries.length,
    patternsUpdated: patternsUpdatedFromCorrections || staleResult.patternsUpdated,
    graphUpdated: graphUpdatedFromCorrections || staleResult.graphUpdated,
  };
}
