/**
 * Token Tracker types — per-task, per-session, per-window tracking.
 */

/** Per-task token usage record. */
export interface TokenUsage {
  taskId: string;
  tokensUsed: number;
  estimatedUnoptimized: number;
  savings: number;
  domain: string;
  timestamp: string;
}

/** Snapshot of a sliding window's status. */
export interface WindowStatus {
  windowId: string;
  startedAt: string;
  expiresAt: string;
  tokensConsumed: number;
  budget: number;
  remaining: number;
  percentUsed: number;
  tasksCompleted: number;
  timeRemainingMs: number;
  isExpired: boolean;
  estimatedResetAt: string;
}

/** Per-task-type token breakdown (TK12). */
export interface TaskTypeStats {
  tasks: number;
  tokensConsumed: number;
  tokensSaved: number;
}

/** Session-level aggregate stats. */
export interface SessionStats {
  sessionId: string;
  startedAt: string;
  tasksCompleted: number;
  tokensConsumed: number;
  tokensSaved: number;
  /** Per-task-type breakdown (TK12). */
  perType?: Record<string, TaskTypeStats>;
}

/** Return type from trackUsage(). */
export interface TrackingResult {
  usage: TokenUsage;
  windowStatus: WindowStatus;
  sessionStats: SessionStats;
}

/** Savings estimation breakdown. */
export interface SavingsEstimate {
  estimatedUnoptimized: number;
  actual: number;
  saved: number;
  savingsRate: number;
}

/** Extended window entry for metrics.json windows array. */
export interface WindowEntry {
  id: string;
  startedAt: string;
  expiresAt: string;
  windowDurationMs: number;
  tokensConsumed: number;
  budget: number;
  remaining: number;
  tasksCompleted: number;
  timeRemainingMs: number;
  estimatedResetAt: string;
}

/** Budget warning severity level. BC3 adds 'awareness' level. */
export type BudgetWarningLevel = 'none' | 'awareness' | 'inline' | 'blocking' | 'exhausted';

/** Budget warning details returned by checkBudget(). */
export interface BudgetWarning {
  level: BudgetWarningLevel;
  percentUsed: number;
  tokensConsumed: number;
  budget: number;
  remaining: number;
  estimatedTasksRemaining: number;
  timeRemainingMs: number;
  resetAt: string;
  message: string;
  /** Tokens per minute burn rate (BC2). */
  burnRateTokensPerMin?: number;
  /** Projected ms until budget exhaustion at current burn rate (BC2). */
  projectedExhaustionMs?: number;
  /** Total tokens saved this window for context (BC5). */
  tokensSaved?: number;
  /** Per-domain consumption breakdown as percentages (BC10). */
  domainBreakdown?: Record<string, number>;
}

/** Result of a budget check including user choice for blocking prompts. */
export interface BudgetCheckResult {
  warning: BudgetWarning;
  shouldProceed: boolean;
  userChoice?: 'continue' | 'wait' | 'cancel';
}

/** Burn rate trend direction (BC4). */
export type BurnTrend = 'accelerating' | 'stable' | 'decelerating';

/** Window time estimation result. */
export interface WindowEstimate {
  timeRemainingMs: number;
  resetAt: string;
  humanReadable: string;
  isExpired: boolean;
  /** Projected ms until budget exhaustion at current burn rate (TK11). Undefined if no consumption yet. */
  projectedExhaustionMs?: number;
  /** Human-readable projected exhaustion time (TK11). */
  projectedExhaustionReadable?: string;
  /** Whether burn rate is accelerating, stable, or decelerating (BC4). */
  burnTrend?: BurnTrend;
  /** Ratio of current burn rate to historical average (BC11). >1 = faster than usual. */
  burnRateVsHistorical?: number;
}

/** Input to trackUsage(). */
export interface TrackUsageInput {
  taskId: string;
  tokensUsed: number;
  domain: string;
  predictionConfidence: number;
  compressionRatio: number;
  projectRoot: string;
  /** Optional prediction accuracy (0-1) from learner feedback for validated savings (TK4). */
  predictionAccuracy?: number;
  /** Optional model tier used for per-model tracking (TK6). */
  modelTier?: string;
  /** Optional task type for per-type session breakdown (TK12 prep). */
  taskType?: string;
  /** Optional StoreCache to avoid redundant disk reads (TK1). */
  storeCache?: import('../types/pipeline.js').StoreCache;
}

/** Maximum number of recent usage records retained in metrics (TK2). */
export const MAX_USAGE_HISTORY = 200;

/** Maximum number of expired windows retained for historical reference (TK3). */
export const MAX_RETAINED_WINDOWS = 10;
