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
    /** Domain classification (L2). */
    domain: string;
  };
  prediction: {
    predictedFiles: string[];
    actualFiles: string[];
    precision: number;
    recall: number;
    /** Per-file confidence scores, parallel to predictedFiles (L3). */
    predictedScores: number[];
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
  /** Session number when this task was captured (L22). */
  sessionId?: number;
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

/** Max files per task for co-occurrence pair computation (L17). */
export const MAX_COOCCURRENCE_FILES = 15;

/** Prune keyword index every N tasks (L5). */
export const KEYWORD_PRUNE_INTERVAL = 50;

/** Temporal decay factor for signal accuracy counters per update (L8). ~50% after 138 tasks. */
export const ACCURACY_DECAY = 0.995;

/** Conservative EMA rate for single-signal learning (L9). Half of normal EMA_ALPHA. */
export const SINGLE_SIGNAL_EMA = 0.05;

/** Minimum tasks per domain:type compound key for per-domain thresholds (L12). */
export const MIN_TASKS_PER_DOMAIN_TYPE = 15;

/** Recency half-life in days for threshold task weighting (L11). */
export const RECENCY_HALF_LIFE_DAYS = 60;

/** Minimum tasks before learning empirical multiplier (L4). */
export const MIN_MULTIPLIER_TASKS = 20;

/** Floor for empirical multiplier (L4). */
export const MIN_MULTIPLIER = 1.5;

/** Baseline window — first N tasks used as unoptimized reference (L4). */
export const BASELINE_TASK_WINDOW = 5;

/** Duration blend weight in cost-adjusted score (L14). 0.3 = 30% duration, 70% token cost. */
export const DURATION_COST_BLEND = 0.3;

// ─── Convention Detector Interface (L18) ──────────────────────

import type { TaskEntry } from '../types/index.js';

/**
 * Pluggable convention detector interface (L18).
 * Each detector looks for a specific pattern in task history.
 */
export interface ConventionDetector {
  id: string;
  pattern: string;
  detect(tasks: TaskEntry[]): { evidence: number; examples: string[] } | null;
}

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
