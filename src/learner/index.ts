export { captureOutcome, compareAccuracy, updateMetrics, updateKeywordIndex, extractKeywords, resetSession, updateDependencyGraph } from './knowledge-learner.js';
export type { LearningOutcome, AccuracyMetrics, WeightUpdate, OutcomeCapture, PatternDetectionResult, TypeAffinities, WeightCorrection, StaleEntry, WeightCorrectionResult } from './types.js';
export {
  MAX_CAPTURE_TIME_MS,
  CO_OCCURRENCE_THRESHOLD, AFFINITY_MIN_OCCURRENCES, AFFINITY_MIN_WEIGHT,
  CONVENTION_MIN_EVIDENCE, CONVENTION_MIN_CONFIDENCE,
  LEARNER_EDGE_INITIAL_WEIGHT, LEARNER_EDGE_INCREMENT, LEARNER_EDGE_MAX_WEIGHT,
  RECENT_HISTORY_WINDOW,
  BOOST_FACTOR, DECAY_FACTOR, WEIGHT_FLOOR, WEIGHT_CEILING,
  STALE_THRESHOLD_SESSIONS, STALE_DECAY_RATE, FULLY_STALE_WEIGHT,
} from './types.js';
export { detectPatterns, detectCoOccurrences, detectTypeAffinities, detectConventions } from './pattern-detector.js';
export { correctWeights, applyWeightCorrections, applyWeightToPatterns, decayStaleEntries, runWeightCorrection } from './weight-correction.js';
