/** Schema version for store files. Bump on breaking changes. */
export const SCHEMA_VERSION = 1;

/** Default token budget per task (tokens). */
export const DEFAULT_BUDGET = 44000;

/** Maximum number of task history entries to retain. */
export const MAX_HISTORY_CAP = 500;

/** Default sliding window duration in milliseconds (5 hours). */
export const DEFAULT_WINDOW_DURATION = 18_000_000;

/** Minimum confidence score to act on a prediction. */
export const CONFIDENCE_THRESHOLD = 0.6;

/** Accuracy threshold for doctor diagnostics. */
export const DOCTOR_ACCURACY_THRESHOLD = 0.6;

/** Directory name for per-project store data. */
export const STORE_DIR = '.claude-opt';

/** Store file names. */
export const STORE_FILES = {
  projectMap: 'project-map.json',
  taskHistory: 'task-history.json',
  patterns: 'patterns.json',
  metrics: 'metrics.json',
  dependencyGraph: 'dependency-graph.json',
  keywordIndex: 'keyword-index.json',
  config: 'config.json',
  doctorLog: 'doctor-log.json',
} as const;
