import type { PipelineContext, DependencyGraph, DependencyEdge, TaskEntry, Metrics, KeywordIndex, AdjacencyEntry } from '../types/index.js';
import { toInternal, logger } from '../utils/index.js';
import {
  readTaskHistory, writeTaskHistory, readMetrics, writeMetrics,
  readKeywordIndex, writeKeywordIndex, readDependencyGraph, writeDependencyGraph,
  readPatterns, writePatterns,
} from '../store/index.js';
import type { AccuracyMetrics, OutcomeCapture } from './types.js';
import {
  MAX_CAPTURE_TIME_MS, UNOPTIMIZED_MULTIPLIER,
  LEARNER_EDGE_INITIAL_WEIGHT, LEARNER_EDGE_INCREMENT, LEARNER_EDGE_MAX_WEIGHT,
} from './types.js';
import { detectPatterns } from './pattern-detector.js';
import { runWeightCorrection } from './weight-correction.js';

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

/**
 * Update the dependency graph with co-occurrence edges discovered from actual file usage.
 * New edges get type "cooccurrence" with a lower initial weight than import edges.
 * Existing co-occurrence edges have their weight incremented.
 * Import edges are never modified.
 */
export function updateDependencyGraph(projectRoot: string, actualFiles: string[]): void {
  if (actualFiles.length < 2) return;

  const normalizedFiles = actualFiles.map(toInternal);
  const readResult = readDependencyGraph(projectRoot);
  if (!readResult.ok) {
    logger.warn(MODULE, `Failed to read dependency graph: ${readResult.error}`);
    return;
  }

  const graph: DependencyGraph = readResult.value;

  // Build a lookup of existing edges by pair key
  const edgeIndex = new Map<string, DependencyEdge>();
  for (const edge of graph.edges) {
    const key = filePairKey(edge.source, edge.target);
    // Only index the first edge per pair (import takes precedence)
    if (!edgeIndex.has(key)) {
      edgeIndex.set(key, edge);
    }
  }

  let changed = false;

  // Check each pair of actual files
  for (let i = 0; i < normalizedFiles.length; i++) {
    for (let j = i + 1; j < normalizedFiles.length; j++) {
      const fileA = normalizedFiles[i];
      const fileB = normalizedFiles[j];
      const key = filePairKey(fileA, fileB);

      const existing = edgeIndex.get(key);

      if (!existing) {
        // No edge exists — add a new co-occurrence edge
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

        // Update adjacency lists (bidirectional for co-occurrence)
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
        // Existing co-occurrence edge — increment weight
        const currentWeight = existing.weight ?? LEARNER_EDGE_INITIAL_WEIGHT;
        const newWeight = incrementEdgeWeight(currentWeight);
        if (newWeight !== currentWeight) {
          existing.weight = newWeight;
          changed = true;
        }
      }
      // Import edges are NOT modified
    }
  }

  if (changed) {
    graph.updatedAt = new Date().toISOString();
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

/**
 * Update aggregated metrics in metrics.json.
 */
export function updateMetrics(
  projectRoot: string,
  accuracy: AccuracyMetrics,
  domain: string,
  tokensConsumed: number,
  tokensSaved: number,
): void {
  const readResult = readMetrics(projectRoot);
  let metrics: Metrics;

  if (readResult.ok) {
    metrics = readResult.value;
  } else {
    // Initialize default metrics if read fails
    metrics = {
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

  const writeResult = writeMetrics(projectRoot, metrics);
  if (!writeResult.ok) {
    logger.warn(MODULE, `Failed to write metrics: ${writeResult.error}`);
  }
}

/** Common/stop words to filter from keyword extraction. */
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'it', 'this', 'that', 'be', 'as',
  'are', 'was', 'were', 'been', 'have', 'has', 'had', 'do', 'does', 'did',
  'will', 'would', 'could', 'should', 'may', 'might', 'can', 'not', 'no',
  'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'she', 'they',
  'add', 'fix', 'update', 'change', 'make', 'get', 'set', 'use', 'new',
]);

/**
 * Extract keywords from task description text.
 */
export function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s,.:;!?()[\]{}"'`/\\]+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

/**
 * Update keyword-index.json with new keyword-to-file mappings from discovered files.
 */
export function updateKeywordIndex(
  projectRoot: string,
  taskDescription: string,
  falseNegatives: string[],
): void {
  if (falseNegatives.length === 0) return;

  const readResult = readKeywordIndex(projectRoot);
  let index: KeywordIndex;

  if (readResult.ok) {
    index = readResult.value;
  } else {
    index = {
      schemaVersion: '1.0.0',
      updatedAt: new Date().toISOString(),
      keywordToFiles: {},
      fileToKeywords: {},
    };
  }

  const keywords = extractKeywords(taskDescription);
  if (keywords.length === 0) return;

  for (const file of falseNegatives) {
    const normalizedFile = toInternal(file);

    for (const keyword of keywords) {
      // keyword → files mapping
      if (!index.keywordToFiles[keyword]) {
        index.keywordToFiles[keyword] = [];
      }
      if (!index.keywordToFiles[keyword].includes(normalizedFile)) {
        index.keywordToFiles[keyword].push(normalizedFile);
      }

      // file → keywords mapping
      if (!index.fileToKeywords[normalizedFile]) {
        index.fileToKeywords[normalizedFile] = [];
      }
      if (!index.fileToKeywords[normalizedFile].includes(keyword)) {
        index.fileToKeywords[normalizedFile].push(keyword);
      }
    }
  }

  index.updatedAt = new Date().toISOString();
  const writeResult = writeKeywordIndex(projectRoot, index);
  if (!writeResult.ok) {
    logger.warn(MODULE, `Failed to write keyword index: ${writeResult.error}`);
  }
}

/**
 * Build an OutcomeCapture entry from pipeline context.
 */
function buildOutcomeCapture(ctx: PipelineContext, accuracy: AccuracyMetrics): OutcomeCapture {
  const predictedFilePaths = ctx.prediction?.predictions.map((p) => toInternal(p.filePath)) ?? [];
  const actualFiles = ctx.adapterResult?.filesUsed.map(toInternal) ?? [];
  const tokensConsumed = ctx.adapterResult?.tokenEstimate ?? 0;
  const estimatedUnoptimized = Math.ceil(tokensConsumed * UNOPTIMIZED_MULTIPLIER);

  return {
    id: generateTaskId(),
    timestamp: new Date().toISOString(),
    taskText: ctx.taskText,
    classification: {
      taskType: ctx.classification?.type ?? 'Unknown',
      complexity: ctx.classification?.complexity ?? 'Medium',
      confidence: ctx.classification?.confidence ?? 0,
    },
    prediction: {
      predictedFiles: predictedFilePaths,
      actualFiles,
      precision: accuracy.precision,
      recall: accuracy.recall,
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
  };
}

/**
 * Capture post-task outcome: compare predicted vs actual, update history, metrics, and keyword index.
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

    // Build task history entry
    const entry = buildOutcomeCapture(ctx, accuracy);

    // Append to task history
    const historyResult = readTaskHistory(projectRoot);
    if (historyResult.ok) {
      const history = historyResult.value;
      history.tasks.push(entry as TaskEntry);
      history.count = history.tasks.length;
      const writeResult = writeTaskHistory(projectRoot, history);
      if (!writeResult.ok) {
        logger.warn(MODULE, `Failed to write task history: ${writeResult.error}`);
      }
    } else {
      logger.warn(MODULE, `Failed to read task history: ${historyResult.error}`);
    }

    // Update aggregated metrics
    const domain = ctx.classification?.domain ?? 'general';
    updateMetrics(projectRoot, accuracy, domain, entry.tokens.consumed, entry.tokens.saved);

    // Update keyword index with discovered files
    updateKeywordIndex(projectRoot, ctx.taskText, accuracy.falseNegatives);

    // Update dependency graph with co-occurrence edges (Story 3.2)
    try {
      updateDependencyGraph(projectRoot, actualFiles);
    } catch (error) {
      logger.warn(MODULE, 'Dependency graph update failed (fail-open)', error);
    }

    // Run pattern detection (Story 3.2)
    try {
      const historyForPatterns = readTaskHistory(projectRoot);
      const patternsResult = readPatterns(projectRoot);
      if (historyForPatterns.ok && patternsResult.ok) {
        const result = detectPatterns(historyForPatterns.value.tasks, patternsResult.value);
        if (
          result.newCoOccurrences.length > 0 ||
          result.updatedCoOccurrences.length > 0 ||
          result.newConventions.length > 0 ||
          result.updatedConventions.length > 0 ||
          Object.keys(result.newAffinities).length > 0
        ) {
          const writeResult = writePatterns(projectRoot, patternsResult.value);
          if (!writeResult.ok) {
            logger.warn(MODULE, `Failed to write patterns: ${writeResult.error}`);
          } else {
            logger.debug(MODULE, `Pattern detection: ${result.newCoOccurrences.length} new co-occurrences, ${Object.keys(result.newAffinities).length} affinity types, ${result.newConventions.length} new conventions`);
          }
        }
      }
    } catch (error) {
      logger.warn(MODULE, 'Pattern detection failed (fail-open)', error);
    }

    // Run weight corrections (Story 3.3)
    try {
      const predictionConfidences = ctx.prediction?.predictions.map((p) => p.score) ?? [];
      const metricsResult = readMetrics(projectRoot);
      const sessionCount = metricsResult.ok ? metricsResult.value.overall.totalSessions : 1;
      runWeightCorrection(
        predictedFiles,
        actualFiles,
        predictionConfidences,
        entry.id,
        projectRoot,
        sessionCount,
      );
    } catch (error) {
      logger.warn(MODULE, 'Weight correction failed (fail-open)', error);
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
