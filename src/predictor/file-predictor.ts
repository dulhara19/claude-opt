/**
 * File Predictor — multi-signal scoring orchestration.
 * Combines 7+ signal sources to predict which files are relevant to a task.
 *
 * Improvements:
 * - E1: File existence validation (drop files not in projectMap)
 * - E2: Max prediction cap (MAX_PREDICTIONS = 30)
 * - E4: Explicit file path detection from prompt
 * - E5: Auto-pair test files with source files
 * - C2: Keyword-filtered git context (halve git-only scores)
 * - Updated history signal call to pass keywordIndex for TF-IDF
 */

import type { PipelineContext, StoreCache, TaskHistory, Metrics, ProjectMap } from '../types/index.js';
import type { PredictionResult, FilePrediction, SignalScore, SignalWeights } from './types.js';
import {
  DEFAULT_SIGNAL_WEIGHTS,
  COLD_START_SIGNAL_WEIGHTS,
  COLD_START_THRESHOLD,
  EARLY_EXIT_THRESHOLD,
  MAX_PREDICTIONS,
  FILE_PATH_REGEX,
  TEST_FILE_PATTERNS,
  TEST_PAIR_SCORE_FACTOR,
  SignalSource,
} from './types.js';
import { CONFIDENCE_THRESHOLD, logger } from '../utils/index.js';
import { extractKeywords, scoreHistorySimilarity, applyNegativeDampening } from './signals/history-similarity.js';
import { scoreGraphTraversal } from './signals/graph-traversal.js';
import { scoreKeywordLookup } from './signals/keyword-lookup.js';
import { scoreCooccurrenceBoost } from './signals/cooccurrence-boost.js';
import { scoreTypeAffinity } from './signals/type-affinity.js';
import { scoreGitContext } from './signals/git-context.js';
import { scoreFileRecency } from './signals/file-recency.js';
import { computeCompositeScore, filterByThreshold, normalizeByPercentile } from './confidence.js';
import { resolveSignalWeights } from '../learner/signal-weight-learner.js';

const MODULE = 'predictor';

/**
 * Determine if this is a cold start (insufficient task history).
 */
function isColdStart(history: TaskHistory | undefined): boolean {
  if (!history) return true;
  return history.tasks.length < COLD_START_THRESHOLD;
}

/**
 * Get the appropriate signal weights.
 * Priority: per-domain learned → global learned → static defaults.
 * Falls back to cold-start weights if insufficient history.
 */
function getSignalWeights(history: TaskHistory | undefined, metrics: Metrics | undefined, domain?: string): SignalWeights {
  if (isColdStart(history)) return COLD_START_SIGNAL_WEIGHTS;

  const learned = resolveSignalWeights(
    metrics?.learnedSignalWeights,
    metrics?.domainSignalWeights,
    domain,
  );
  if (learned) return learned;

  return DEFAULT_SIGNAL_WEIGHTS;
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
  const fileSignals = new Map<string, SignalScore[]>();

  for (const signalMap of signalMaps) {
    for (const [filePath, score] of signalMap) {
      const existing = fileSignals.get(filePath) ?? [];
      existing.push(score);
      fileSignals.set(filePath, existing);
    }
  }

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
 * Check if early exit conditions are met after primary signals.
 */
function checkEarlyExit(
  signalMaps: Map<string, SignalScore>[],
): boolean {
  const merged = mergeSignals(signalMaps);
  if (merged.length === 0) return false;

  const topScore = Math.max(...merged.map((p) => p.score));
  return topScore > EARLY_EXIT_THRESHOLD;
}

/**
 * E4: Detect explicit file paths mentioned in the prompt.
 * Returns a Map of filePath → SignalScore with score 1.0 for each.
 */
function detectExplicitPaths(
  taskText: string,
  projectMap: ProjectMap | undefined,
): Map<string, SignalScore> {
  const scores = new Map<string, SignalScore>();
  if (!projectMap) return scores;

  // Reset regex state
  FILE_PATH_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = FILE_PATH_REGEX.exec(taskText)) !== null) {
    const path = match[1];
    // Validate against projectMap
    if (projectMap.files[path]) {
      scores.set(path, {
        source: SignalSource.ExplicitMention,
        score: 1.0,
        weight: 1.0, // Explicit mentions bypass normal weighting
        reason: 'Explicitly mentioned in prompt',
      });
    }
  }

  return scores;
}

/**
 * E5: Auto-pair test files with predicted source files (and vice versa).
 * For each predicted file, check if a matching test/source counterpart exists.
 */
function pairTestFiles(
  predictions: FilePrediction[],
  projectMap: ProjectMap | undefined,
): Map<string, SignalScore> {
  const paired = new Map<string, SignalScore>();
  if (!projectMap) return paired;

  const predictedPaths = new Set(predictions.map((p) => p.filePath));
  const allFiles = new Set(Object.keys(projectMap.files));

  for (const pred of predictions) {
    const fp = pred.filePath;
    const pairedScore = pred.score * TEST_PAIR_SCORE_FACTOR;

    // Source → test file pairing
    for (const pattern of TEST_FILE_PATTERNS) {
      if (fp.endsWith(pattern.source) && !fp.includes('.test.') && !fp.includes('.spec.')) {
        // Try same directory: src/auth.ts → src/auth.test.ts
        const testPath = fp.replace(new RegExp(`\\${pattern.source}$`), pattern.suffix);
        if (allFiles.has(testPath) && !predictedPaths.has(testPath) && !paired.has(testPath)) {
          paired.set(testPath, {
            source: SignalSource.TestFilePairing,
            score: pairedScore,
            weight: 1.0,
            reason: `Test file for ${fp}`,
          });
        }

        // Try tests/ directory: src/auth.ts → tests/auth.test.ts
        const fileName = fp.split('/').pop()!;
        const testFileName = fileName.replace(new RegExp(`\\${pattern.source}$`), pattern.suffix);
        const testDirPath = `tests/${testFileName}`;
        if (allFiles.has(testDirPath) && !predictedPaths.has(testDirPath) && !paired.has(testDirPath)) {
          paired.set(testDirPath, {
            source: SignalSource.TestFilePairing,
            score: pairedScore,
            weight: 1.0,
            reason: `Test file for ${fp}`,
          });
        }
      }
    }

    // Test → source file pairing (reverse)
    for (const pattern of TEST_FILE_PATTERNS) {
      if (fp.endsWith(pattern.suffix)) {
        const sourcePath = fp.replace(new RegExp(`\\${pattern.suffix}$`), pattern.source);
        if (allFiles.has(sourcePath) && !predictedPaths.has(sourcePath) && !paired.has(sourcePath)) {
          paired.set(sourcePath, {
            source: SignalSource.TestFilePairing,
            score: pairedScore,
            weight: 1.0,
            reason: `Source file for ${fp}`,
          });
        }
      }
    }
  }

  return paired;
}

/**
 * E1: Filter out predictions for files that don't exist in the project map.
 */
function filterExistingFiles(
  predictions: FilePrediction[],
  projectMap: ProjectMap | undefined,
): FilePrediction[] {
  if (!projectMap) return predictions; // Can't validate — return all
  return predictions.filter((p) => projectMap.files[p.filePath] !== undefined);
}

/**
 * C2: Halve git-only scores — files scored only by GitContext with no other signal overlap.
 */
function applyGitContextFilter(
  gitScores: Map<string, SignalScore>,
  otherSignalMaps: Map<string, SignalScore>[],
): Map<string, SignalScore> {
  // Collect all files scored by non-git signals
  const nonGitFiles = new Set<string>();
  for (const map of otherSignalMaps) {
    for (const filePath of map.keys()) {
      nonGitFiles.add(filePath);
    }
  }

  const filtered = new Map<string, SignalScore>();
  for (const [filePath, score] of gitScores) {
    if (nonGitFiles.has(filePath)) {
      // Has other signal support — keep full score
      filtered.set(filePath, score);
    } else {
      // Git-only — halve the score
      filtered.set(filePath, {
        ...score,
        score: score.score * 0.5,
        reason: `${score.reason} (git-only, dampened)`,
      });
    }
  }

  return filtered;
}

/**
 * Predict which files are relevant to the current task.
 * Combines 7+ signal sources with configurable weights.
 *
 * @param ctx - Pipeline context with taskText and workingDir
 * @returns PredictionResult with ranked, filtered predictions
 */
export function predictFiles(ctx: PipelineContext): PredictionResult {
  const startTime = performance.now();
  const cache = ctx.storeCache;

  // Extract keywords from the task prompt (H1: stemmed, H3: stopwords filtered)
  const taskKeywords = extractKeywords(ctx.taskText);

  if (taskKeywords.length === 0) {
    // E4: Even with no keywords, check for explicit file paths
    const explicitPaths = detectExplicitPaths(ctx.taskText, cache?.projectMap);
    if (explicitPaths.size > 0) {
      const predictions: FilePrediction[] = [];
      for (const [filePath, signal] of explicitPaths) {
        predictions.push({ filePath, score: signal.score, signals: [signal] });
      }
      return {
        predictions,
        totalCandidates: predictions.length,
        threshold: CONFIDENCE_THRESHOLD,
        durationMs: performance.now() - startTime,
      };
    }

    logger.debug(MODULE, 'No keywords extracted from task prompt');
    return {
      predictions: [],
      totalCandidates: 0,
      threshold: CONFIDENCE_THRESHOLD,
      durationMs: performance.now() - startTime,
    };
  }

  // Determine signal weights
  const weights = getSignalWeights(cache?.taskHistory, cache?.metrics, ctx.classification?.domain);

  // E4: Detect explicit file paths in prompt
  const explicitPaths = detectExplicitPaths(ctx.taskText, cache?.projectMap);

  // Run signals 1-3 (independent, using cached store data)
  // E3: Each signal's raw scores are percentile-normalized before weight application
  const historyScores = applyWeight(
    normalizeByPercentile(scoreHistorySimilarity(taskKeywords, cache?.taskHistory, cache?.keywordIndex)),
    weights.history,
  );

  // Run keyword lookup first to get its matched files for G4 deduplication
  const rawKeywordScores = scoreKeywordLookup(taskKeywords, cache?.keywordIndex);
  const keywordScores = applyWeight(normalizeByPercentile(rawKeywordScores), weights.keyword);

  // G4: Pass keyword-matched files as skipFiles so graph traversal doesn't double-score seeds
  const keywordMatchedFiles = new Set(rawKeywordScores.keys());
  const graphScores = applyWeight(
    normalizeByPercentile(scoreGraphTraversal(taskKeywords, cache?.dependencyGraph, cache?.keywordIndex, keywordMatchedFiles)),
    weights.graph,
  );

  // Signal 6: Git context (independent, uses projectRoot for git commands)
  const rawGitScores = scoreGitContext(ctx.workingDir);

  // Signal 7: File recency (independent, uses cached project map)
  const recencyScores = applyWeight(
    normalizeByPercentile(scoreFileRecency(cache?.projectMap)),
    weights.fileRecency,
  );

  // C2: Filter git scores — halve git-only files that have no other signal support
  const filteredGitScores = applyGitContextFilter(
    rawGitScores,
    [historyScores, graphScores, keywordScores],
  );
  const gitScores = applyWeight(normalizeByPercentile(filteredGitScores), weights.gitContext);

  // Early exit check
  const primarySignals = [historyScores, graphScores, keywordScores, gitScores, recencyScores];
  const earlyExit = checkEarlyExit(primarySignals);

  let cooccurrenceScores = new Map<string, SignalScore>();
  let typeAffinityScores = new Map<string, SignalScore>();

  if (!earlyExit) {
    const predictedFiles = new Set<string>();
    for (const map of primarySignals) {
      for (const filePath of map.keys()) {
        predictedFiles.add(filePath);
      }
    }

    cooccurrenceScores = applyWeight(
      scoreCooccurrenceBoost(predictedFiles, cache?.patterns),
      weights.cooccurrence,
    );

    typeAffinityScores = applyWeight(
      scoreTypeAffinity(ctx.classification?.type, cache?.patterns),
      weights.typeAffinity,
    );
  } else {
    logger.debug(MODULE, 'Early exit: skipping co-occurrence and type affinity signals');
  }

  // Merge all signals (including explicit paths)
  const allPredictions = mergeSignals(
    [...primarySignals, cooccurrenceScores, typeAffinityScores, explicitPaths],
  );

  // E1: Filter out files that don't exist in the project map
  const existingPredictions = filterExistingFiles(allPredictions, cache?.projectMap);

  const totalCandidates = existingPredictions.length;

  // Use learned threshold for this task type, or fall back to static default
  const taskType = ctx.classification?.type;
  const learnedThreshold = taskType && cache?.metrics?.learnedThresholds?.[taskType];
  const threshold = learnedThreshold ?? CONFIDENCE_THRESHOLD;

  // Filter by confidence threshold
  let filtered = filterByThreshold(existingPredictions, threshold);

  // E5: Auto-pair test files with predicted source files
  const testPairScores = pairTestFiles(filtered, cache?.projectMap);
  if (testPairScores.size > 0) {
    // Add paired files and re-filter
    const pairedPredictions: FilePrediction[] = [];
    for (const [filePath, signal] of testPairScores) {
      pairedPredictions.push({ filePath, score: signal.score, signals: [signal] });
    }
    // Only include paired files that meet the threshold
    const validPairs = pairedPredictions.filter((p) => p.score >= threshold);
    filtered = [...filtered, ...validPairs];
    // Re-sort by score
    filtered.sort((a, b) => b.score - a.score);
  }

  // E2: Cap at MAX_PREDICTIONS
  if (filtered.length > MAX_PREDICTIONS) {
    filtered = filtered.slice(0, MAX_PREDICTIONS);
  }

  const durationMs = performance.now() - startTime;

  if (durationMs > 200) {
    logger.warn(MODULE, `Prediction exceeded 200ms budget: ${durationMs.toFixed(0)}ms`);
  }

  logger.debug(
    MODULE,
    `Predicted ${filtered.length}/${totalCandidates} files in ${durationMs.toFixed(0)}ms${earlyExit ? ' (early exit)' : ''}`,
  );

  return {
    predictions: filtered,
    totalCandidates,
    threshold,
    durationMs,
  };
}
