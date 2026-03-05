/**
 * File Predictor — multi-signal scoring orchestration.
 * Combines 4 signal sources to predict which files are relevant to a task.
 */

import type { PipelineContext, TaskHistory } from '../types/index.js';
import type { PredictionResult, FilePrediction, SignalScore, SignalWeights } from './types.js';
import {
  DEFAULT_SIGNAL_WEIGHTS,
  COLD_START_SIGNAL_WEIGHTS,
  COLD_START_THRESHOLD,
} from './types.js';
import { CONFIDENCE_THRESHOLD, logger } from '../utils/index.js';
import { readTaskHistory } from '../store/index.js';
import { extractKeywords, scoreHistorySimilarity } from './signals/history-similarity.js';
import { scoreGraphTraversal } from './signals/graph-traversal.js';
import { scoreKeywordLookup } from './signals/keyword-lookup.js';
import { scoreCooccurrenceBoost } from './signals/cooccurrence-boost.js';
import { computeCompositeScore, filterByThreshold } from './confidence.js';

const MODULE = 'predictor';

/**
 * Determine if this is a cold start (insufficient task history).
 */
function isColdStart(projectRoot: string): boolean {
  const historyResult = readTaskHistory(projectRoot);
  if (!historyResult.ok) return true;
  const history: TaskHistory = historyResult.value;
  return history.tasks.length < COLD_START_THRESHOLD;
}

/**
 * Get the appropriate signal weights based on cold start status.
 */
function getSignalWeights(projectRoot: string): SignalWeights {
  return isColdStart(projectRoot) ? COLD_START_SIGNAL_WEIGHTS : DEFAULT_SIGNAL_WEIGHTS;
}

/**
 * Apply weights to signal scores from a single signal source.
 */
function applyWeight(
  signalScores: Map<string, SignalScore>,
  weight: number,
): Map<string, SignalScore> {
  const weighted = new Map<string, SignalScore>();
  for (const [filePath, score] of signalScores) {
    weighted.set(filePath, { ...score, weight });
  }
  return weighted;
}

/**
 * Merge signal scores from all sources into per-file FilePrediction entries.
 */
function mergeSignals(
  signalMaps: Map<string, SignalScore>[],
): FilePrediction[] {
  // Collect all signals per file
  const fileSignals = new Map<string, SignalScore[]>();

  for (const signalMap of signalMaps) {
    for (const [filePath, score] of signalMap) {
      const existing = fileSignals.get(filePath) ?? [];
      existing.push(score);
      fileSignals.set(filePath, existing);
    }
  }

  // Compute composite scores
  const predictions: FilePrediction[] = [];

  for (const [filePath, signals] of fileSignals) {
    const compositeScore = computeCompositeScore(signals);
    predictions.push({
      filePath,
      score: compositeScore,
      signals,
    });
  }

  return predictions;
}

/**
 * Predict which files are relevant to the current task.
 * Combines 4 signal sources with configurable weights.
 *
 * @param ctx - Pipeline context with taskText and workingDir
 * @returns PredictionResult with ranked, filtered predictions
 */
export function predictFiles(ctx: PipelineContext): PredictionResult {
  const startTime = performance.now();
  const projectRoot = ctx.workingDir;

  // Extract keywords from the task prompt
  const taskKeywords = extractKeywords(ctx.taskText);

  if (taskKeywords.length === 0) {
    logger.debug(MODULE, 'No keywords extracted from task prompt');
    return {
      predictions: [],
      totalCandidates: 0,
      threshold: CONFIDENCE_THRESHOLD,
      durationMs: performance.now() - startTime,
    };
  }

  // Determine signal weights (cold start vs normal)
  const weights = getSignalWeights(projectRoot);

  // Run signals 1-3 (independent)
  const historyScores = applyWeight(
    scoreHistorySimilarity(taskKeywords, projectRoot),
    weights.history,
  );
  const graphScores = applyWeight(
    scoreGraphTraversal(taskKeywords, projectRoot),
    weights.graph,
  );
  const keywordScores = applyWeight(
    scoreKeywordLookup(taskKeywords, projectRoot),
    weights.keyword,
  );

  // Collect files predicted by signals 1-3 for co-occurrence boosting
  const predictedFiles = new Set<string>();
  for (const map of [historyScores, graphScores, keywordScores]) {
    for (const filePath of map.keys()) {
      predictedFiles.add(filePath);
    }
  }

  // Run signal 4 (depends on signals 1-3)
  const cooccurrenceScores = applyWeight(
    scoreCooccurrenceBoost(predictedFiles, projectRoot),
    weights.cooccurrence,
  );

  // Merge all signals into per-file predictions
  const allPredictions = mergeSignals(
    [historyScores, graphScores, keywordScores, cooccurrenceScores],
  );

  const totalCandidates = allPredictions.length;

  // Filter by confidence threshold (graceful degradation)
  const filtered = filterByThreshold(allPredictions, CONFIDENCE_THRESHOLD);

  const durationMs = performance.now() - startTime;

  if (durationMs > 200) {
    logger.warn(MODULE, `Prediction exceeded 200ms budget: ${durationMs.toFixed(0)}ms`);
  }

  logger.debug(
    MODULE,
    `Predicted ${filtered.length}/${totalCandidates} files in ${durationMs.toFixed(0)}ms`,
  );

  return {
    predictions: filtered,
    totalCandidates,
    threshold: CONFIDENCE_THRESHOLD,
    durationMs,
  };
}
