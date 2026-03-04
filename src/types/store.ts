/**
 * Store type schemas for all JSON data files.
 * Matches the JSON schemas defined in architecture.md and prd.md.
 */

// ─── config.json ───────────────────────────────────────────────

export interface BudgetWarnings {
  inline: number;
  blocking: number;
  /** Awareness threshold for early budget notification (BC3). Default 0.50. */
  awareness?: number;
}

export interface Config {
  schemaVersion: string;
  projectName: string;
  projectType: string;
  tokenBudget: number;
  windowDurationMs: number;
  budgetWarnings: BudgetWarnings;
  doctorMode: string;
  doctorThreshold: number;
  taskHistoryCap: number;
  createdAt: string;
  updatedAt: string;
}

// ─── project-map.json ──────────────────────────────────────────

export interface FileEntry {
  path: string;
  size: number;
  contentHash: string;
  lastModified: string;
  language: string | null;
  domain: string | null;
  imports: string[];
  exports: string[];
  keywords: string[];
}

export interface ProjectMap {
  schemaVersion: string;
  scannedAt: string;
  scanType: string;
  projectType: string;
  totalFiles: number;
  files: Record<string, FileEntry>;
  domains: Record<string, string[]>;
  ignoredPatterns: string[];
}

// ─── dependency-graph.json ─────────────────────────────────────

export interface DependencyEdge {
  source: string;
  target: string;
  type: string;
  weight?: number;
  discoveredBy?: string;
}

export interface AdjacencyEntry {
  imports: string[];
  importedBy: string[];
}

export interface DependencyGraph {
  schemaVersion: string;
  updatedAt: string;
  edges: DependencyEdge[];
  adjacency: Record<string, AdjacencyEntry>;
}

// ─── task-history.json ─────────────────────────────────────────

export interface TaskClassification {
  taskType: string;
  complexity: string;
  confidence: number;
  /** Domain classification (L2). */
  domain?: string;
}

export interface TaskPrediction {
  predictedFiles: string[];
  actualFiles: string[];
  precision: number;
  recall: number;
  /** Per-file confidence scores, parallel to predictedFiles (L3). */
  predictedScores?: number[];
}

export interface TaskRouting {
  model: string;
  reason: string;
}

export interface TaskTokens {
  consumed: number;
  budgeted: number;
  saved: number;
}

export interface TaskFeedback {
  source: string;
  rating: string;
  quickReason?: string;
  details?: string;
  missedFiles?: string[];
  wrongFiles?: string[];
  modelCorrection?: { direction: string; suggested?: string };
}

export interface TaskEntry {
  id: string;
  timestamp: string;
  taskText: string;
  classification: TaskClassification;
  prediction: TaskPrediction;
  routing: TaskRouting;
  tokens: TaskTokens;
  feedback: TaskFeedback | null;
  /** Session number when this task was captured (L22). */
  sessionId?: number;
}

export interface TaskHistory {
  schemaVersion: string;
  cap: number;
  count: number;
  oldestArchive: string | null;
  tasks: TaskEntry[];
}

// ─── patterns.json ─────────────────────────────────────────────

export interface CoOccurrence {
  id?: string;
  files: [string, string];
  count: number;
  frequency?: number;
  confidence: number;
  lastSeen?: string;
  discoveredAt?: string;
  decayFactor?: number;
}

export interface TypeAffinityEntry {
  weight: number;
  occurrences: number;
}

export interface TypeAffinity {
  taskType: string;
  files: string[];
  confidence: number;
  /** Per-file affinity weights (Story 3.2+) */
  fileWeights?: Record<string, TypeAffinityEntry>;
}

export interface Convention {
  id?: string;
  pattern: string;
  description: string;
  confidence?: number;
  evidenceCount?: number;
  examples: string[];
}

export interface Patterns {
  schemaVersion: string;
  coOccurrences: CoOccurrence[];
  typeAffinities: Record<string, TypeAffinity>;
  conventions: Convention[];
}

// ─── metrics.json ──────────────────────────────────────────────

export interface DomainMetrics {
  totalTasks: number;
  avgPrecision: number;
  avgRecall: number;
  totalTokensConsumed: number;
  totalTokensSaved: number;
}

export interface TokenWindow {
  windowStart: string;
  windowEnd: string;
  tokensConsumed: number;
  tokensBudgeted: number;
}

export interface PredictionTrendPoint {
  date: string;
  precision: number;
  recall: number;
  sampleSize: number;
}

export interface OverallMetrics {
  totalTasks: number;
  totalSessions: number;
  avgPrecision: number;
  avgRecall: number;
  totalTokensConsumed: number;
  totalTokensSaved: number;
  savingsRate: number;
}

/** Per-signal accuracy tracking for adaptive weight learning (#4). */
export interface SignalAccuracy {
  truePositives: number;
  falsePositives: number;
  totalPredictions: number;
  /** Missed opportunities — false negatives where this signal had data (L7). */
  missedOpportunities?: number;
}

/** Per-model performance tracking for router learning (#7). */
export interface ModelPerformance {
  /** Weighted successes — continuous score sum (L13). */
  successes: number;
  failures: number;
  totalTasks: number;
  avgTokenCost: number;
  /** Average execution duration in milliseconds (L14). */
  avgDurationMs?: number;
}

/** Per-model token tracking (TK6). */
export interface ModelTokenStats {
  totalTasks: number;
  totalTokensConsumed: number;
  totalTokensSaved: number;
}

/** Lightweight per-task usage record for history (TK2). */
export interface UsageHistoryEntry {
  taskId: string;
  tokensUsed: number;
  savings: number;
  domain: string;
  modelTier?: string;
  timestamp: string;
}

export interface Metrics {
  schemaVersion: string;
  overall: OverallMetrics;
  perDomain: Record<string, DomainMetrics>;
  windows: TokenWindow[];
  predictionTrend: PredictionTrendPoint[];
  /** Learned signal weights from adaptive weight tuning (#4). */
  learnedSignalWeights?: Record<string, number>;
  /** Per-signal accuracy tracking (#4). */
  signalAccuracy?: Record<string, SignalAccuracy>;
  /** Per-domain signal accuracy tracking (#9). Key: "domain:signalSource". */
  domainSignalAccuracy?: Record<string, SignalAccuracy>;
  /** Per-domain learned signal weights (#9). Key: domain name. */
  domainSignalWeights?: Record<string, Record<string, number>>;
  /** Learned confidence thresholds per task type (#6). */
  learnedThresholds?: Record<string, number>;
  /** Model performance per model×taskType×complexity key (#7). */
  modelPerformance?: Record<string, ModelPerformance>;
  /** Recent per-task usage history, FIFO capped at MAX_USAGE_HISTORY (TK2). */
  recentUsage?: UsageHistoryEntry[];
  /** Per-model token tracking (TK6). */
  perModel?: Record<string, ModelTokenStats>;
  /** Learned unoptimized multiplier from empirical data (L4). */
  empiricalMultiplier?: number;
}

// ─── keyword-index.json ────────────────────────────────────────

export interface KeywordIndex {
  schemaVersion: string;
  updatedAt: string;
  keywordToFiles: Record<string, string[]>;
  fileToKeywords: Record<string, string[]>;
}

// ─── doctor-log.json ───────────────────────────────────────────

export interface Finding {
  type: string;
  severity: string;
  message: string;
  file: string | null;
}

export interface DoctorAction {
  action: string;
  target: string;
  result: string;
}

export interface HealthScore {
  overall: number;
  accuracy: number;
  staleness: number;
  coverage: number;
}

export interface DoctorEntry {
  id: string;
  timestamp: string;
  mode: string;
  findings: Finding[];
  actions: DoctorAction[];
  healthScore: HealthScore;
}

export interface DoctorLog {
  schemaVersion: string;
  entries: DoctorEntry[];
}

// ─── Union type of all store files ─────────────────────────────

export type StoreFile =
  | Config
  | ProjectMap
  | DependencyGraph
  | TaskHistory
  | Patterns
  | Metrics
  | KeywordIndex
  | DoctorLog;
