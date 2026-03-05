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

/** Session-level aggregate stats. */
export interface SessionStats {
  sessionId: string;
  startedAt: string;
  tasksCompleted: number;
  tokensConsumed: number;
  tokensSaved: number;
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

/** Budget warning severity level. */
export type BudgetWarningLevel = 'none' | 'inline' | 'blocking' | 'exhausted';

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
}

/** Result of a budget check including user choice for blocking prompts. */
export interface BudgetCheckResult {
  warning: BudgetWarning;
  shouldProceed: boolean;
  userChoice?: 'continue' | 'wait' | 'cancel';
}

/** Window time estimation result. */
export interface WindowEstimate {
  timeRemainingMs: number;
  resetAt: string;
  humanReadable: string;
  isExpired: boolean;
}

/** Input to trackUsage(). */
export interface TrackUsageInput {
  taskId: string;
  tokensUsed: number;
  domain: string;
  predictionConfidence: number;
  compressionRatio: number;
  projectRoot: string;
}
