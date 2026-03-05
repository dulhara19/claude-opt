/**
 * Types for the File Predictor module (Story 2.2).
 * Multi-signal file prediction with confidence scoring.
 */

/** Signal source identifiers for file prediction. */
export enum SignalSource {
  HistorySimilarity = 'HistorySimilarity',
  GraphTraversal = 'GraphTraversal',
  KeywordLookup = 'KeywordLookup',
  CooccurrenceBoost = 'CooccurrenceBoost',
}

/** A single signal's contribution to a file's score. */
export interface SignalScore {
  source: SignalSource;
  score: number;
  weight: number;
  reason: string;
}

/** A predicted file with its composite score and signal breakdown. */
export interface FilePrediction {
  filePath: string;
  score: number;
  signals: SignalScore[];
}

/** Full prediction result from the File Predictor. */
export interface PredictionResult {
  predictions: FilePrediction[];
  totalCandidates: number;
  threshold: number;
  durationMs: number;
}

/** Configurable weights for each signal source. */
export interface SignalWeights {
  history: number;
  graph: number;
  keyword: number;
  cooccurrence: number;
}

/** Default signal weights. */
export const DEFAULT_SIGNAL_WEIGHTS: SignalWeights = {
  history: 0.35,
  graph: 0.25,
  keyword: 0.25,
  cooccurrence: 0.15,
};

/** Cold-start signal weights (no history available). */
export const COLD_START_SIGNAL_WEIGHTS: SignalWeights = {
  history: 0.0,
  graph: 0.35,
  keyword: 0.45,
  cooccurrence: 0.20,
};

/** Minimum number of task history entries before using history signal at full weight. */
export const COLD_START_THRESHOLD = 5;

/** Interface for individual signal implementations. */
export interface Signal {
  source: SignalSource;
  score(taskKeywords: string[], projectRoot: string): Map<string, SignalScore>;
}
