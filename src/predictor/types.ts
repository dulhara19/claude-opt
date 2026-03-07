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
  TypeAffinity = 'TypeAffinity',
  GitContext = 'GitContext',
  FileRecency = 'FileRecency',
  ExplicitMention = 'ExplicitMention',
  TestFilePairing = 'TestFilePairing',
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
  typeAffinity: number;
  gitContext: number;
  fileRecency: number;
}

/** Default signal weights (7 signals). */
export const DEFAULT_SIGNAL_WEIGHTS: SignalWeights = {
  history: 0.25,
  graph: 0.15,
  keyword: 0.15,
  cooccurrence: 0.10,
  typeAffinity: 0.10,
  gitContext: 0.15,
  fileRecency: 0.10,
};

/** Cold-start signal weights (no history available). */
export const COLD_START_SIGNAL_WEIGHTS: SignalWeights = {
  history: 0.0,
  graph: 0.25,
  keyword: 0.35,
  cooccurrence: 0.15,
  typeAffinity: 0.0,
  gitContext: 0.15,
  fileRecency: 0.10,
};

/** Minimum number of task history entries before using history signal at full weight. */
export const COLD_START_THRESHOLD = 5;

/** Early exit threshold — skip remaining signals if top score exceeds this. */
export const EARLY_EXIT_THRESHOLD = 0.9;

/** E2: Maximum number of predictions to return (prevents pathological blowup). */
export const MAX_PREDICTIONS = 30;

/** Regex to detect explicit file paths in prompts (E4). */
export const FILE_PATH_REGEX = /(?:^|\s)((?:[\w.-]+\/)+[\w.-]+\.\w+)/g;

/** Test file patterns for auto-pairing (E5). */
export const TEST_FILE_PATTERNS = [
  { suffix: '.test.ts', source: '.ts' },
  { suffix: '.test.tsx', source: '.tsx' },
  { suffix: '.test.js', source: '.js' },
  { suffix: '.spec.ts', source: '.ts' },
  { suffix: '.spec.tsx', source: '.tsx' },
  { suffix: '.spec.js', source: '.js' },
];

/** Score multiplier for auto-paired test files (E5). */
export const TEST_PAIR_SCORE_FACTOR = 0.8;

/** Interface for individual signal implementations. */
export interface Signal {
  source: SignalSource;
  score(taskKeywords: string[], projectRoot: string): Map<string, SignalScore>;
}
