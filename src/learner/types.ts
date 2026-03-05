import type { FilePrediction } from '../predictor/types.js';
import type { ClassificationResult } from '../types/index.js';

/**
 * Full learning outcome captured after task execution.
 */
export interface LearningOutcome {
  taskId: string;
  timestamp: string;
  sessionId: string;
  description: string;
  classification: ClassificationResult;
  prediction: {
    predictedFiles: FilePrediction[];
    actualFiles: string[];
    precision: number;
    recall: number;
  };
  routing: {
    selectedModel: string;
    rationale: string;
    success: boolean;
  };
  tokens: {
    consumed: number;
    estimatedUnoptimized: number;
    saved: number;
  };
  feedback: null;
}

/**
 * Accuracy metrics comparing predicted vs actual files.
 */
export interface AccuracyMetrics {
  precision: number;
  recall: number;
  truePositives: string[];
  falsePositives: string[];
  falseNegatives: string[];
}

/**
 * Weight update record for signal tuning (Story 3.3).
 */
export interface WeightUpdate {
  file: string;
  previousWeight: number;
  newWeight: number;
  reason: string;
  evidence: string;
}

/**
 * The full task-history entry shape matching the store schema.
 * Maps to TaskEntry in store types.
 */
export interface OutcomeCapture {
  id: string;
  timestamp: string;
  taskText: string;
  classification: {
    taskType: string;
    complexity: string;
    confidence: number;
  };
  prediction: {
    predictedFiles: string[];
    actualFiles: string[];
    precision: number;
    recall: number;
  };
  routing: {
    model: string;
    reason: string;
  };
  tokens: {
    consumed: number;
    budgeted: number;
    saved: number;
  };
  feedback: null;
}

/** Maximum capture time in milliseconds (performance budget). */
export const MAX_CAPTURE_TIME_MS = 500;

/** Estimated unoptimized token multiplier (rough heuristic). */
export const UNOPTIMIZED_MULTIPLIER = 2.5;

// ─── Pattern Detection Types (Story 3.2) ──────────────────────

import type { CoOccurrence, Convention } from '../types/index.js';

/**
 * Type affinity map: taskType -> filePath -> { weight, occurrences }
 */
export interface TypeAffinities {
  [taskType: string]: {
    [filePath: string]: {
      weight: number;
      occurrences: number;
    };
  };
}

/**
 * Result of running the pattern detection pipeline.
 */
export interface PatternDetectionResult {
  newCoOccurrences: CoOccurrence[];
  updatedCoOccurrences: CoOccurrence[];
  newAffinities: TypeAffinities;
  newConventions: Convention[];
  updatedConventions: Convention[];
}

// ─── Pattern Detection Constants ───────────────────────────────

/** Minimum co-occurrences to create a pattern. */
export const CO_OCCURRENCE_THRESHOLD = 5;

/** Minimum occurrences for type-file affinity. */
export const AFFINITY_MIN_OCCURRENCES = 3;

/** Minimum weight for affinity creation. */
export const AFFINITY_MIN_WEIGHT = 0.3;

/** Minimum tasks for convention detection. */
export const CONVENTION_MIN_EVIDENCE = 5;

/** Minimum confidence for convention creation. */
export const CONVENTION_MIN_CONFIDENCE = 0.7;

/** Initial weight for learner-discovered edges. */
export const LEARNER_EDGE_INITIAL_WEIGHT = 0.3;

/** Weight increment per additional co-occurrence. */
export const LEARNER_EDGE_INCREMENT = 0.1;

/** Cap for learner-discovered edge weights. */
export const LEARNER_EDGE_MAX_WEIGHT = 0.9;

/** Number of recent tasks to analyze for patterns. */
export const RECENT_HISTORY_WINDOW = 50;

// ─── Weight Correction Types (Story 3.3) ──────────────────────

/**
 * Individual weight correction applied to a file's prediction weight.
 */
export interface WeightCorrection {
  file: string;
  previousWeight: number;
  newWeight: number;
  delta: number;
  reason: 'boost' | 'decay' | 'stale';
  predictionConfidence: number;
  taskId: string;
}

/**
 * Entry flagged as stale (not seen in recent sessions).
 */
export interface StaleEntry {
  file: string;
  lastSeen: string;
  sessionsSinceLastSeen: number;
  currentDecayFactor: number;
  isFullyStale: boolean;
}

/**
 * Result of running the weight correction pipeline.
 */
export interface WeightCorrectionResult {
  corrections: WeightCorrection[];
  staleEntries: StaleEntry[];
  boostCount: number;
  decayCount: number;
  staleCount: number;
  patternsUpdated: boolean;
  graphUpdated: boolean;
}

// ─── Weight Correction Constants ───────────────────────────────

/** Base boost magnitude for correct predictions. */
export const BOOST_FACTOR = 0.1;

/** Base decay magnitude for incorrect predictions (asymmetric — smaller than boost). */
export const DECAY_FACTOR = 0.05;

/** Minimum weight (never zero from auto-decay). */
export const WEIGHT_FLOOR = 0.05;

/** Maximum weight after boost. */
export const WEIGHT_CEILING = 1.0;

/** Sessions without seeing a file/pattern before stale decay starts. */
export const STALE_THRESHOLD_SESSIONS = 10;

/** Multiplicative decay per session past threshold. */
export const STALE_DECAY_RATE = 0.85;

/** Below this weight, entry is flagged as fully stale. */
export const FULLY_STALE_WEIGHT = 0.05;
