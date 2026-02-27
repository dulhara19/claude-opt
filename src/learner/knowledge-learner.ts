import type { PipelineContext, DependencyGraph, DependencyEdge, TaskEntry, Metrics, KeywordIndex, AdjacencyEntry, TaskHistory, Patterns, ProjectMap } from '../types/index.js';
import { toInternal, logger, stem, TASK_ACTION_STOPWORDS } from '../utils/index.js';
import {
  readTaskHistory, writeTaskHistory, readMetrics, writeMetrics,
  readKeywordIndex, writeKeywordIndex, readDependencyGraph, writeDependencyGraph,
  readPatterns, writePatterns,
} from '../store/index.js';
import type { AccuracyMetrics, OutcomeCapture } from './types.js';
import {
  MAX_CAPTURE_TIME_MS, UNOPTIMIZED_MULTIPLIER,
  LEARNER_EDGE_INITIAL_WEIGHT, LEARNER_EDGE_INCREMENT, LEARNER_EDGE_MAX_WEIGHT,
  KEYWORD_PRUNE_INTERVAL,
  MIN_MULTIPLIER_TASKS, MIN_MULTIPLIER, BASELINE_TASK_WINDOW,
} from './types.js';
import { detectPatterns } from './pattern-detector.js';
import { runWeightCorrectionInPlace } from './weight-correction.js';
import { updateSignalAccuracy, updateLearnedWeights, updateDomainSignalAccuracy, updateDomainLearnedWeights, trackMissedOpportunities } from './signal-weight-learner.js';
import { updateLearnedThresholds } from './threshold-learner.js';
import { updateModelPerformance } from './router-learner.js';

const MODULE = 'learner';

/** Sequence counter for task IDs within a session. */
let taskSequence = 0;

/**
 * Generate a task ID in format: t_YYYYMMDD_NNN
 */
function generateTaskId(): string {
  taskSequence++;
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `t_${date}_${String(taskSequence).padStart(3, '0')}`;
}

/**
 * Reset session state (for testing).
 */
export function resetSession(): void {
  taskSequence = 0;
}

/**
 * Build a canonical key for a file pair (sorted alphabetically).
 */
function filePairKey(fileA: string, fileB: string): string {
  const sorted = [fileA, fileB].sort();
  return `${sorted[0]}::${sorted[1]}`;
}

/**
 * Increment edge weight for learner-discovered co-occurrence edges,
 * capped at LEARNER_EDGE_MAX_WEIGHT.
 */
function incrementEdgeWeight(currentWeight: number): number {
  return Math.min(currentWeight + LEARNER_EDGE_INCREMENT, LEARNER_EDGE_MAX_WEIGHT);
}

// ─── In-Place Mutation Functions (L1) ────────────────────────

/**
 * Update the dependency graph in-place with co-occurrence edges (L1).
 * Mutates `graph` directly. Returns true if any changes were made.
 */
export function applyDependencyGraphUpdate(graph: DependencyGraph, actualFiles: string[]): boolean {
  if (actualFiles.length < 2) return false;

  const normalizedFiles = actualFiles.map(toInternal);

  // Build a lookup of existing edges by pair key
  const edgeIndex = new Map<string, DependencyEdge>();
  for (const edge of graph.edges) {
    const key = filePairKey(edge.source, edge.target);
    if (!edgeIndex.has(key)) {
      edgeIndex.set(key, edge);
    }
  }

  let changed = false;

  for (let i = 0; i < normalizedFiles.length; i++) {
    for (let j = i + 1; j < normalizedFiles.length; j++) {
      const fileA = normalizedFiles[i];
      const fileB = normalizedFiles[j];
      const key = filePairKey(fileA, fileB);

      const existing = edgeIndex.get(key);

      if (!existing) {
        const sorted = [fileA, fileB].sort();
        const newEdge: DependencyEdge = {
          source: sorted[0],
          target: sorted[1],
          type: 'cooccurrence',
          weight: LEARNER_EDGE_INITIAL_WEIGHT,
          discoveredBy: 'learner',
        };
        graph.edges.push(newEdge);
        edgeIndex.set(key, newEdge);

        if (!graph.adjacency[sorted[0]]) {
          graph.adjacency[sorted[0]] = { imports: [], importedBy: [] };
        }
        if (!graph.adjacency[sorted[1]]) {
          graph.adjacency[sorted[1]] = { imports: [], importedBy: [] };
        }
        const adjA: AdjacencyEntry = graph.adjacency[sorted[0]];
        const adjB: AdjacencyEntry = graph.adjacency[sorted[1]];
        if (!adjA.imports.includes(sorted[1])) adjA.imports.push(sorted[1]);
        if (!adjA.importedBy.includes(sorted[1])) adjA.importedBy.push(sorted[1]);
        if (!adjB.imports.includes(sorted[0])) adjB.imports.push(sorted[0]);
        if (!adjB.importedBy.includes(sorted[0])) adjB.importedBy.push(sorted[0]);

        changed = true;
      } else if (existing.type === 'cooccurrence' && existing.discoveredBy === 'learner') {
        const currentWeight = existing.weight ?? LEARNER_EDGE_INITIAL_WEIGHT;
        const newWeight = incrementEdgeWeight(currentWeight);
        if (newWeight !== currentWeight) {
          existing.weight = newWeight;
          changed = true;
        }
      }
    }
  }

  if (changed) {
    graph.updatedAt = new Date().toISOString();
  }

  return changed;
}

/**
 * Disk-based wrapper for updateDependencyGraph (backward compat).
 */
export function updateDependencyGraph(projectRoot: string, actualFiles: string[]): void {
  if (actualFiles.length < 2) return;

  const readResult = readDependencyGraph(projectRoot);
  if (!readResult.ok) {
    logger.warn(MODULE, `Failed to read dependency graph: ${readResult.error}`);
    return;
  }

  const graph = readResult.value;
  const changed = applyDependencyGraphUpdate(graph, actualFiles);

  if (changed) {
    const writeResult = writeDependencyGraph(projectRoot, graph);
    if (!writeResult.ok) {
      logger.warn(MODULE, `Failed to write dependency graph: ${writeResult.error}`);
    }
  }
}

/**
 * Compare predicted files vs actual files to compute accuracy metrics.
 */
export function compareAccuracy(predictedFiles: string[], actualFiles: string[]): AccuracyMetrics {
  const normalizedPredicted = predictedFiles.map(toInternal);
  const normalizedActual = actualFiles.map(toInternal);

  const predictedSet = new Set(normalizedPredicted);
  const actualSet = new Set(normalizedActual);

  const truePositives = normalizedPredicted.filter((f) => actualSet.has(f));
  const falsePositives = normalizedPredicted.filter((f) => !actualSet.has(f));
  const falseNegatives = normalizedActual.filter((f) => !predictedSet.has(f));

  const precision = normalizedPredicted.length > 0 ? truePositives.length / normalizedPredicted.length : 0;
  const recall = normalizedActual.length > 0 ? truePositives.length / normalizedActual.length : 0;

  return { precision, recall, truePositives, falsePositives, falseNegatives };
}

/**
 * Incremental running average calculation.
 */
function updateRunningAverage(oldAvg: number, newValue: number, newCount: number): number {
  return oldAvg + (newValue - oldAvg) / newCount;
}

/** Default empty metrics for initialization. */
function createDefaultMetrics(): Metrics {
  return {
    schemaVersion: '1.0.0',
    overall: {
      totalTasks: 0,
      totalSessions: 0,
      avgPrecision: 0,
      avgRecall: 0,
      totalTokensConsumed: 0,
      totalTokensSaved: 0,
      savingsRate: 0,
    },
    perDomain: {},
    windows: [],
    predictionTrend: [],
  };
}

/**
 * Update aggregated metrics in-place (L1).
 * Mutates `metrics` directly without disk I/O.
 */
export function applyMetricsUpdate(
  metrics: Metrics,
  accuracy: AccuracyMetrics,
  domain: string,
  tokensConsumed: number,
  tokensSaved: number,
): void {
  // Update overall
  const newCount = metrics.overall.totalTasks + 1;
  metrics.overall.avgPrecision = updateRunningAverage(metrics.overall.avgPrecision, accuracy.precision, newCount);
  metrics.overall.avgRecall = updateRunningAverage(metrics.overall.avgRecall, accuracy.recall, newCount);
  metrics.overall.totalTasks = newCount;
  metrics.overall.totalTokensConsumed += tokensConsumed;
  metrics.overall.totalTokensSaved += tokensSaved;

  const totalTokens = metrics.overall.totalTokensConsumed + metrics.overall.totalTokensSaved;
  metrics.overall.savingsRate = totalTokens > 0 ? metrics.overall.totalTokensSaved / totalTokens : 0;

  // Update per-domain
  if (!metrics.perDomain[domain]) {
    metrics.perDomain[domain] = {
      totalTasks: 0,
      avgPrecision: 0,
      avgRecall: 0,
      totalTokensConsumed: 0,
      totalTokensSaved: 0,
    };
  }
  const domainEntry = metrics.perDomain[domain];
  const domainNewCount = domainEntry.totalTasks + 1;
  domainEntry.avgPrecision = updateRunningAverage(domainEntry.avgPrecision, accuracy.precision, domainNewCount);
  domainEntry.avgRecall = updateRunningAverage(domainEntry.avgRecall, accuracy.recall, domainNewCount);
  domainEntry.totalTasks = domainNewCount;
  domainEntry.totalTokensConsumed += tokensConsumed;
  domainEntry.totalTokensSaved += tokensSaved;
}

/**
 * Disk-based wrapper for updateMetrics (backward compat).
 */
export function updateMetrics(
  projectRoot: string,
  accuracy: AccuracyMetrics,
  domain: string,
  tokensConsumed: number,
  tokensSaved: number,
): void {
  const readResult = readMetrics(projectRoot);
  const metrics = readResult.ok ? readResult.value : createDefaultMetrics();
  applyMetricsUpdate(metrics, accuracy, domain, tokensConsumed, tokensSaved);
  const writeResult = writeMetrics(projectRoot, metrics);
  if (!writeResult.ok) {
    logger.warn(MODULE, `Failed to write metrics: ${writeResult.error}`);
  }
}

/** Common/stop words to filter from keyword extraction (L6: enhanced with stemming). */
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'it', 'this', 'that', 'be', 'as',
  'are', 'was', 'were', 'been', 'have', 'has', 'had', 'do', 'does', 'did',
  'will', 'would', 'could', 'should', 'may', 'might', 'can', 'not', 'no',
  'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'she', 'they',
]);

/**
 * Extract keywords from task description text (L6: shared stemming with predictor).
 * Applies stemming and task-action stopword filtering for consistency
 * with the predictor's keyword extraction.
 */
export function extractKeywords(text: string): string[] {
  const words = text
    .toLowerCase()
    .split(/[\s,.:;!?()[\]{}"'`/\\]+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w) && !TASK_ACTION_STOPWORDS.has(w));

  // Apply stemming for consistency with predictor (L6)
  const stemmed = new Set<string>();
  for (const word of words) {
    stemmed.add(stem(word));
  }

  return [...stemmed];
}

/**
 * Update keyword index in-place (L1).
 * Mutates `index` directly without disk I/O.
 */
export function applyKeywordIndexUpdate(
  index: KeywordIndex,
  taskDescription: string,
  falseNegatives: string[],
): void {
  if (falseNegatives.length === 0) return;

  const keywords = extractKeywords(taskDescription);
  if (keywords.length === 0) return;

  for (const file of falseNegatives) {
    const normalizedFile = toInternal(file);

    for (const keyword of keywords) {
      if (!index.keywordToFiles[keyword]) {
        index.keywordToFiles[keyword] = [];
      }
      if (!index.keywordToFiles[keyword].includes(normalizedFile)) {
        index.keywordToFiles[keyword].push(normalizedFile);
      }

      if (!index.fileToKeywords[normalizedFile]) {
        index.fileToKeywords[normalizedFile] = [];
      }
      if (!index.fileToKeywords[normalizedFile].includes(keyword)) {
        index.fileToKeywords[normalizedFile].push(keyword);
      }
    }
  }

  index.updatedAt = new Date().toISOString();
}

/**
 * Disk-based wrapper for updateKeywordIndex (backward compat).
 */
export function updateKeywordIndex(
  projectRoot: string,
  taskDescription: string,
  falseNegatives: string[],
): void {
  if (falseNegatives.length === 0) return;

  const readResult = readKeywordIndex(projectRoot);
  const index: KeywordIndex = readResult.ok ? readResult.value : {
    schemaVersion: '1.0.0',
    updatedAt: new Date().toISOString(),
    keywordToFiles: {},
    fileToKeywords: {},
  };

  applyKeywordIndexUpdate(index, taskDescription, falseNegatives);

  const writeResult = writeKeywordIndex(projectRoot, index);
  if (!writeResult.ok) {
    logger.warn(MODULE, `Failed to write keyword index: ${writeResult.error}`);
  }
}

/**
 * Prune keyword index entries pointing to files that no longer exist in projectMap (L5).
 * Mutates `index` in-place.
 */
export function pruneKeywordIndex(index: KeywordIndex, projectMap: ProjectMap): number {
  let pruned = 0;
  const validFiles = new Set(Object.keys(projectMap.files));

  // Prune fileToKeywords entries for missing files
  for (const filePath of Object.keys(index.fileToKeywords)) {
    if (!validFiles.has(filePath)) {
      delete index.fileToKeywords[filePath];
      pruned++;
    }
  }

  // Prune file references from keywordToFiles
  for (const keyword of Object.keys(index.keywordToFiles)) {
    const files = index.keywordToFiles[keyword];
    const filtered = files.filter((f) => validFiles.has(f));
    if (filtered.length === 0) {
      delete index.keywordToFiles[keyword];
    } else if (filtered.length < files.length) {
      index.keywordToFiles[keyword] = filtered;
    }
  }

  if (pruned > 0) {
    index.updatedAt = new Date().toISOString();
    logger.debug(MODULE, `Pruned ${pruned} stale file entries from keyword index`);
  }

  return pruned;
}

/**
 * Build an OutcomeCapture entry from pipeline context (L2: domain, L3: scores).
 */
function buildOutcomeCapture(ctx: PipelineContext, accuracy: AccuracyMetrics): OutcomeCapture {
  const predictions = ctx.prediction?.predictions ?? [];
  const predictedFilePaths = predictions.map((p) => toInternal(p.filePath));
  const predictedScores = predictions.map((p) => p.score);
  const actualFiles = ctx.adapterResult?.filesUsed.map(toInternal) ?? [];
  const tokensConsumed = ctx.adapterResult?.tokenEstimate ?? 0;
  // L4: Use empirical multiplier if learned, else static default
  const multiplier = ctx.storeCache?.metrics?.empiricalMultiplier ?? UNOPTIMIZED_MULTIPLIER;
  const estimatedUnoptimized = Math.ceil(tokensConsumed * multiplier);

  return {
    id: generateTaskId(),
    timestamp: new Date().toISOString(),
    taskText: ctx.taskText,
    classification: {
      taskType: ctx.classification?.type ?? 'Unknown',
      complexity: ctx.classification?.complexity ?? 'Medium',
      confidence: ctx.classification?.confidence ?? 0,
      domain: ctx.classification?.domain ?? 'general',
    },
    prediction: {
      predictedFiles: predictedFilePaths,
      actualFiles,
      precision: accuracy.precision,
      recall: accuracy.recall,
      predictedScores,
    },
    routing: {
      model: ctx.routing?.model ?? 'sonnet',
      reason: ctx.routing?.rationale ?? 'default',
    },
    tokens: {
      consumed: tokensConsumed,
      budgeted: estimatedUnoptimized,
      saved: Math.max(0, estimatedUnoptimized - tokensConsumed),
    },
    feedback: null,
    // L22: sessionId is set after metrics are loaded (needs totalSessions)
  };
}

/**
 * Capture post-task outcome (L1: single read/write cycle).
 *
 * Loads all 5 store files once, runs all learning sub-modules on in-memory objects,
 * then writes each file once. Eliminates redundant disk I/O from the original
 * implementation (was: up to 13 reads, 5 writes → now: 5 reads, 5 writes).
 *
 * Wrapped with fail-open — errors are logged but never block the user.
 */
export function captureOutcome(ctx: PipelineContext): void {
  const startTime = performance.now();

  try {
    const projectRoot = ctx.workingDir;

    // Extract predicted and actual file lists
    const predictedFiles = ctx.prediction?.predictions.map((p) => p.filePath) ?? [];
    const actualFiles = ctx.adapterResult?.filesUsed ?? [];

    // Compare accuracy
    const accuracy = compareAccuracy(predictedFiles, actualFiles);

    // Build task history entry (L2: includes domain, L3: includes scores)
    const entry = buildOutcomeCapture(ctx, accuracy);

    // ─── L1: Load all stores once ───────────────────────────
    const historyResult = readTaskHistory(projectRoot);
    const metricsResult = readMetrics(projectRoot);
    const keywordResult = readKeywordIndex(projectRoot);
    const graphResult = readDependencyGraph(projectRoot);
    const patternsResult = readPatterns(projectRoot);

    const history: TaskHistory | null = historyResult.ok ? historyResult.value : null;
    const metrics: Metrics = metricsResult.ok ? metricsResult.value : createDefaultMetrics();
    const keywordIndex: KeywordIndex = keywordResult.ok ? keywordResult.value : {
      schemaVersion: '1.0.0', updatedAt: new Date().toISOString(),
      keywordToFiles: {}, fileToKeywords: {},
    };
    const graph: DependencyGraph | null = graphResult.ok ? graphResult.value : null;
    const patterns: Patterns | null = patternsResult.ok ? patternsResult.value : null;

    // L22: Set sessionId from metrics (now that metrics are loaded)
    entry.sessionId = metrics.overall.totalSessions;

    // Track what changed for selective writes
    let historyChanged = false;
    let metricsChanged = false;
    let keywordIndexChanged = false;
    let graphChanged = false;
    let patternsChanged = false;

    // ─── Step 1: Append to task history ─────────────────────
    if (history) {
      history.tasks.push(entry as TaskEntry);
      history.count = history.tasks.length;
      historyChanged = true;
    } else {
      logger.warn(MODULE, `Failed to read task history: ${historyResult.ok ? '' : historyResult.error}`);
    }

    // ─── Step 2: Update aggregated metrics (in-place) ───────
    const domain = ctx.classification?.domain ?? 'general';
    applyMetricsUpdate(metrics, accuracy, domain, entry.tokens.consumed, entry.tokens.saved);
    metricsChanged = true;

    // ─── Step 3: Update keyword index (in-place) ────────────
    applyKeywordIndexUpdate(keywordIndex, ctx.taskText, accuracy.falseNegatives);
    if (accuracy.falseNegatives.length > 0) {
      keywordIndexChanged = true;
    }

    // ─── Step 3b: Prune keyword index periodically (L5) ─────
    const projectMap = ctx.storeCache?.projectMap;
    if (projectMap && metrics.overall.totalTasks % KEYWORD_PRUNE_INTERVAL === 0) {
      const pruned = pruneKeywordIndex(keywordIndex, projectMap);
      if (pruned > 0) keywordIndexChanged = true;
    }

    // ─── Step 4: Update dependency graph (in-place) ─────────
    if (graph) {
      try {
        if (applyDependencyGraphUpdate(graph, actualFiles)) {
          graphChanged = true;
        }
      } catch (error) {
        logger.warn(MODULE, 'Dependency graph update failed (fail-open)', error);
      }
    }

    // ─── Step 5: Pattern detection (in-place) ───────────────
    if (history && patterns) {
      try {
        const result = detectPatterns(history.tasks, patterns, projectMap);
        if (
          result.newCoOccurrences.length > 0 ||
          result.updatedCoOccurrences.length > 0 ||
          result.newConventions.length > 0 ||
          result.updatedConventions.length > 0 ||
          Object.keys(result.newAffinities).length > 0
        ) {
          patternsChanged = true;
          logger.debug(MODULE, `Pattern detection: ${result.newCoOccurrences.length} new co-occurrences, ${Object.keys(result.newAffinities).length} affinity types, ${result.newConventions.length} new conventions`);
        }
      } catch (error) {
        logger.warn(MODULE, 'Pattern detection failed (fail-open)', error);
      }
    }

    // ─── Step 6: Adaptive learning (all operate on metrics in-place) ─
    try {
      const actualFileSet = new Set(actualFiles.map(toInternal));
      const predictions = ctx.prediction?.predictions ?? [];

      // #4: Signal accuracy and learned weights
      updateSignalAccuracy(metrics, predictions, actualFileSet);
      updateLearnedWeights(metrics);

      // L7: Track missed opportunities for false negatives
      if (accuracy.falseNegatives.length > 0 && graph && patterns) {
        const taskType = ctx.classification?.type ?? 'Unknown';
        trackMissedOpportunities(metrics, accuracy.falseNegatives, taskType, keywordIndex, graph, patterns);
      }

      // #9: Per-domain signal accuracy and weights
      const taskDomain = ctx.classification?.domain ?? 'unknown';
      updateDomainSignalAccuracy(metrics, predictions, actualFileSet, taskDomain);
      updateDomainLearnedWeights(metrics, taskDomain);

      // #6: Learned confidence thresholds
      if (history) {
        updateLearnedThresholds(metrics, history);
      }

      // #7 + L13 + L14 + L15: Model performance tracking with composite success score
      const taskType = ctx.classification?.type ?? 'Unknown';
      const complexity = ctx.classification?.complexity ?? 'Medium';
      const model = ctx.routing?.model ?? 'sonnet';

      // L13: Continuous success score (0-1) instead of binary
      // L15: Multi-factor composite: precision×0.4 + recall×0.2 + feedback×0.3 + tokenEff×0.1
      const feedbackScore = 0.5; // neutral default (no feedback available during capture)
      const tokenEfficiency = entry.tokens.budgeted > 0
        ? 1 - Math.min(entry.tokens.consumed / entry.tokens.budgeted, 1)
        : 0.5;
      const successScore = Math.min(Math.max(
        accuracy.precision * 0.4 +
        accuracy.recall * 0.2 +
        feedbackScore * 0.3 +
        tokenEfficiency * 0.1,
        0), 1);

      const tokenCost = entry.tokens.consumed;
      // L14: Pass duration from adapter result
      const durationMs = ctx.adapterResult?.durationMs;
      updateModelPerformance(metrics, model, taskType, complexity, successScore, tokenCost, durationMs);

      metricsChanged = true;
    } catch (error) {
      logger.warn(MODULE, 'Adaptive learning failed (fail-open)', error);
    }

    // ─── Step 6b: Learn empirical multiplier (L4) ─────────────────
    if (history && metrics.overall.totalTasks >= MIN_MULTIPLIER_TASKS) {
      try {
        const allTasks = history.tasks;
        // Baseline: average tokens per task from first N tasks (before optimization warms up)
        const baselineTasks = allTasks.slice(0, BASELINE_TASK_WINDOW);
        const recentTasks = allTasks.slice(-BASELINE_TASK_WINDOW);

        if (baselineTasks.length >= BASELINE_TASK_WINDOW && recentTasks.length >= BASELINE_TASK_WINDOW) {
          const baselineAvg = baselineTasks.reduce((s, t) => s + t.tokens.consumed, 0) / baselineTasks.length;
          const recentAvg = recentTasks.reduce((s, t) => s + t.tokens.consumed, 0) / recentTasks.length;

          if (recentAvg > 0) {
            const empirical = Math.max(baselineAvg / recentAvg, MIN_MULTIPLIER);
            metrics.empiricalMultiplier = empirical;
            logger.debug(MODULE, `L4: Empirical multiplier = ${empirical.toFixed(2)} (baseline=${baselineAvg.toFixed(0)}, recent=${recentAvg.toFixed(0)})`);
          }
        }
      } catch (error) {
        logger.warn(MODULE, 'Empirical multiplier computation failed (fail-open)', error);
      }
    }

    // ─── Step 7: Weight corrections (in-place on graph + patterns) ──
    if (graph && patterns) {
      try {
        const predictionConfidences = ctx.prediction?.predictions.map((p) => p.score) ?? [];
        const sessionCount = metrics.overall.totalSessions;
        const historyTasks = history?.tasks ?? [];

        const wcResult = runWeightCorrectionInPlace(
          predictedFiles, actualFiles, predictionConfidences,
          entry.id, graph, patterns, historyTasks, sessionCount,
        );

        if (wcResult.graphUpdated) graphChanged = true;
        if (wcResult.patternsUpdated) patternsChanged = true;
      } catch (error) {
        logger.warn(MODULE, 'Weight correction failed (fail-open)', error);
      }
    }

    // ─── L1: Write all stores once ──────────────────────────
    if (historyChanged && history) {
      const writeResult = writeTaskHistory(projectRoot, history);
      if (!writeResult.ok) logger.warn(MODULE, `Failed to write task history: ${writeResult.error}`);
    }

    if (metricsChanged) {
      const writeResult = writeMetrics(projectRoot, metrics);
      if (!writeResult.ok) logger.warn(MODULE, `Failed to write metrics: ${writeResult.error}`);
    }

    if (keywordIndexChanged) {
      const writeResult = writeKeywordIndex(projectRoot, keywordIndex);
      if (!writeResult.ok) logger.warn(MODULE, `Failed to write keyword index: ${writeResult.error}`);
    }

    if (graphChanged && graph) {
      const writeResult = writeDependencyGraph(projectRoot, graph);
      if (!writeResult.ok) logger.warn(MODULE, `Failed to write dependency graph: ${writeResult.error}`);
    }

    if (patternsChanged && patterns) {
      const writeResult = writePatterns(projectRoot, patterns);
      if (!writeResult.ok) logger.warn(MODULE, `Failed to write patterns: ${writeResult.error}`);
    }

    const elapsed = performance.now() - startTime;
    if (elapsed > MAX_CAPTURE_TIME_MS) {
      logger.warn(MODULE, `Capture took ${elapsed.toFixed(0)}ms — exceeds ${MAX_CAPTURE_TIME_MS}ms budget`);
    } else {
      logger.debug(MODULE, `Capture completed in ${elapsed.toFixed(0)}ms`);
    }
  } catch (error) {
    logger.error(MODULE, 'Capture failed (fail-open — task not blocked)', error);
  }
}
