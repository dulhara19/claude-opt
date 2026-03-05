/**
 * Weight correction module — self-correcting signal weights and stale decay.
 * Boosts accurate predictions, decays inaccurate ones, and flags stale entries. (Story 3.3)
 */

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
 * Classify predicted files and compute weight corrections (boost/decay).
 *
 * - True positives (predicted and used): boosted proportional to confidence
 * - False positives (predicted but not used): decayed proportional to confidence
 * - False negatives (used but not predicted): no weight correction here
 */
export function correctWeights(
  predictedFiles: string[],
  actualFiles: string[],
  confidences: number[],
  taskId: string,
  projectRoot: string,
): WeightCorrection[] {
  const corrections: WeightCorrection[] = [];

  const normalizedPredicted = predictedFiles.map(toInternal);
  const normalizedActual = new Set(actualFiles.map(toInternal));
  const confidenceMap = buildConfidenceMap(predictedFiles, confidences);

  // Read current dependency graph to get existing weights
  const graphResult = readDependencyGraph(projectRoot);
  if (!graphResult.ok) {
    logger.warn(MODULE, `Cannot read dependency graph for weight correction: ${graphResult.error}`);
    return corrections;
  }
  const graph = graphResult.value;

  // Build file -> edge weight lookup for learner edges
  const fileWeightMap = new Map<string, { edge: typeof graph.edges[0]; weight: number }>();
  for (const edge of graph.edges) {
    if (edge.discoveredBy === 'learner') {
      const w = edge.weight ?? LEARNER_EDGE_INITIAL_WEIGHT;
      // Index by both source and target
      if (!fileWeightMap.has(edge.source)) {
        fileWeightMap.set(edge.source, { edge, weight: w });
      }
      if (!fileWeightMap.has(edge.target)) {
        fileWeightMap.set(edge.target, { edge, weight: w });
      }
    }
  }

  for (const file of normalizedPredicted) {
    const confidence = confidenceMap.get(file) ?? 0.5;
    const existing = fileWeightMap.get(file);
    const currentWeight = existing?.weight ?? LEARNER_EDGE_INITIAL_WEIGHT;

    if (normalizedActual.has(file)) {
      // True positive — boost
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
      // False positive — decay
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

// ─── Apply Weight Corrections to Dependency Graph ─────────────

/**
 * Apply weight corrections to learner-discovered edges in the dependency graph.
 * Scanner-discovered edges are never modified.
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
 * Apply weight corrections to patterns.json:
 * - Co-occurrence decayFactor adjusted for boost/decay
 * - Type affinity weights updated directly
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
  let changed = false;

  const correctionMap = new Map<string, WeightCorrection>();
  for (const c of corrections) {
    correctionMap.set(c.file, c);
  }

  // Adjust co-occurrence decayFactor
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

  // Adjust type affinity weights
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
    // Recalculate average confidence
    const weights = Object.values(affinity.fileWeights);
    if (weights.length > 0) {
      affinity.confidence = weights.reduce((sum, w) => sum + w.weight, 0) / weights.length;
    }
  }

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
 * Decay stale entries (files/patterns not seen in recent sessions).
 * Entries that drop below FULLY_STALE_WEIGHT are flagged for Doctor analysis.
 * Stale entries are never removed — only flagged.
 */
export function decayStaleEntries(
  projectRoot: string,
  currentSessionCount: number,
): { staleEntries: StaleEntry[]; patternsUpdated: boolean; graphUpdated: boolean } {
  const staleEntries: StaleEntry[] = [];
  let patternsUpdated = false;
  let graphUpdated = false;

  // Build lastSeenMap from task history
  const historyResult = readTaskHistory(projectRoot);
  if (!historyResult.ok) {
    logger.warn(MODULE, `Cannot read history for stale decay: ${historyResult.error}`);
    return { staleEntries, patternsUpdated, graphUpdated };
  }

  const tasks = historyResult.value.tasks;
  const lastSeenMap = new Map<string, string>(); // file -> most recent timestamp

  for (const task of tasks) {
    for (const file of task.prediction.actualFiles) {
      const normalized = toInternal(file);
      const existing = lastSeenMap.get(normalized);
      if (!existing || task.timestamp > existing) {
        lastSeenMap.set(normalized, task.timestamp);
      }
    }
  }

  // Approximate session count per file from task spacing
  // Use total task count as a proxy for session progression
  const totalTasks = tasks.length;

  // Decay co-occurrence patterns
  const patternsResult = readPatterns(projectRoot);
  if (patternsResult.ok) {
    const patterns = patternsResult.value;
    let patternsChanged = false;

    for (const coOcc of patterns.coOccurrences) {
      const [fileA, fileB] = coOcc.files;
      const lastSeenA = lastSeenMap.get(fileA);
      const lastSeenB = lastSeenMap.get(fileB);
      const lastSeen = lastSeenA && lastSeenB
        ? (lastSeenA > lastSeenB ? lastSeenA : lastSeenB)
        : lastSeenA ?? lastSeenB;

      if (!lastSeen) continue;

      // Approximate sessions since last seen
      const tasksSinceSeen = tasks.filter((t) => t.timestamp > lastSeen).length;
      const sessionsSince = Math.floor(tasksSinceSeen / 3) + (totalTasks > 0 && !lastSeenA && !lastSeenB ? currentSessionCount : 0);

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

        patternsChanged = true;
      }
    }

    // Decay type affinity weights
    for (const [, affinity] of Object.entries(patterns.typeAffinities)) {
      if (!affinity.fileWeights) continue;
      for (const [filePath, entry] of Object.entries(affinity.fileWeights)) {
        const lastSeen = lastSeenMap.get(filePath);
        if (!lastSeen) continue;

        const tasksSinceSeen = tasks.filter((t) => t.timestamp > lastSeen).length;
        const sessionsSince = Math.floor(tasksSinceSeen / 3);

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
            patternsChanged = true;
          }
        }
      }
    }

    if (patternsChanged) {
      const writeResult = writePatterns(projectRoot, patterns);
      patternsUpdated = writeResult.ok;
      if (!writeResult.ok) {
        logger.warn(MODULE, `Failed to write stale-decayed patterns: ${writeResult.error}`);
      }
    }
  }

  // Decay learner-discovered edges in dependency graph
  const graphResult = readDependencyGraph(projectRoot);
  if (graphResult.ok) {
    const graph = graphResult.value;
    let graphChanged = false;

    for (const edge of graph.edges) {
      if (edge.discoveredBy !== 'learner') continue;

      const lastSeenSource = lastSeenMap.get(edge.source);
      const lastSeenTarget = lastSeenMap.get(edge.target);
      const lastSeen = lastSeenSource && lastSeenTarget
        ? (lastSeenSource > lastSeenTarget ? lastSeenSource : lastSeenTarget)
        : lastSeenSource ?? lastSeenTarget;

      if (!lastSeen) continue;

      const tasksSinceSeen = tasks.filter((t) => t.timestamp > lastSeen).length;
      const sessionsSince = Math.floor(tasksSinceSeen / 3);

      if (sessionsSince > STALE_THRESHOLD_SESSIONS) {
        const sessionsOverThreshold = sessionsSince - STALE_THRESHOLD_SESSIONS;
        const currentWeight = edge.weight ?? LEARNER_EDGE_INITIAL_WEIGHT;
        const newWeight = Math.max(currentWeight * Math.pow(STALE_DECAY_RATE, sessionsOverThreshold), WEIGHT_FLOOR);

        if (newWeight !== currentWeight) {
          edge.weight = newWeight;
          graphChanged = true;
        }
      }
    }

    if (graphChanged) {
      graph.updatedAt = new Date().toISOString();
      const writeResult = writeDependencyGraph(projectRoot, graph);
      graphUpdated = writeResult.ok;
      if (!writeResult.ok) {
        logger.warn(MODULE, `Failed to write stale-decayed graph: ${writeResult.error}`);
      }
    }
  }

  // Log stale flagging
  const fullyStale = staleEntries.filter((e) => e.isFullyStale);
  if (fullyStale.length > 0) {
    logger.info(MODULE, `Flagged ${fullyStale.length} stale entries for Doctor analysis`);
  }

  return { staleEntries, patternsUpdated, graphUpdated };
}

// ─── Full Weight Correction Pipeline ──────────────────────────

/**
 * Run the full weight correction pipeline:
 * 1. Compute boost/decay corrections
 * 2. Apply to dependency graph
 * 3. Apply to patterns.json
 * 4. Decay stale entries
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
