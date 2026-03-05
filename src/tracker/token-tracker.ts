/**
 * Token Tracker — per-task, per-session, per-window tracking with savings estimation.
 * Must complete in <10ms (NFR TT-10).
 */

import type { Result, Metrics, DomainMetrics } from '../types/index.js';
import { ok, logger } from '../utils/index.js';
import { readMetrics, writeMetrics, readConfig, createDefaultMetrics } from '../store/index.js';
import type {
  TokenUsage,
  WindowStatus,
  WindowEntry,
  SessionStats,
  TrackingResult,
  SavingsEstimate,
  TrackUsageInput,
} from './types.js';

const MODULE = 'tracker';

// ─── Session state (in-memory, reset per process) ──────────────

let currentSession: SessionStats = {
  sessionId: `s_${Date.now()}`,
  startedAt: new Date().toISOString(),
  tasksCompleted: 0,
  tokensConsumed: 0,
  tokensSaved: 0,
};

/**
 * Reset session state (for testing).
 */
export function resetSession(): void {
  currentSession = {
    sessionId: `s_${Date.now()}`,
    startedAt: new Date().toISOString(),
    tasksCompleted: 0,
    tokensConsumed: 0,
    tokensSaved: 0,
  };
}

// ─── Savings Estimation ────────────────────────────────────────

/**
 * Estimate token savings.
 * Formula: estimatedUnoptimized = tokensUsed / (1 - compressionRatio * predictionConfidence)
 * If no optimization occurred, estimatedUnoptimized = tokensUsed (no savings).
 */
export function estimateSavings(
  tokensUsed: number,
  predictionConfidence: number,
  compressionRatio: number,
): SavingsEstimate {
  const optimizationFactor = compressionRatio * predictionConfidence;

  let estimatedUnoptimized: number;
  if (optimizationFactor <= 0 || optimizationFactor >= 1) {
    estimatedUnoptimized = tokensUsed;
  } else {
    estimatedUnoptimized = tokensUsed / (1 - optimizationFactor);
  }

  const saved = estimatedUnoptimized - tokensUsed;
  const savingsRate = estimatedUnoptimized > 0 ? saved / estimatedUnoptimized : 0;

  return {
    estimatedUnoptimized: Math.round(estimatedUnoptimized),
    actual: tokensUsed,
    saved: Math.round(saved),
    savingsRate: Math.round(savingsRate * 1000) / 1000,
  };
}

// ─── Window Management ─────────────────────────────────────────

/**
 * Generate a window ID in format w_YYYYMMDD_NN.
 */
function generateWindowId(existingWindows: WindowEntry[]): string {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const todayPrefix = `w_${dateStr}_`;
  const todayCount = existingWindows.filter((w) => w.id.startsWith(todayPrefix)).length;
  return `${todayPrefix}${String(todayCount + 1).padStart(2, '0')}`;
}

/**
 * Check if a window has expired.
 */
export function isWindowExpired(window: WindowEntry): boolean {
  return Date.now() > new Date(window.expiresAt).getTime();
}

/**
 * Find the current active (non-expired) window.
 */
export function getActiveWindow(windows: WindowEntry[]): WindowEntry | null {
  for (let i = windows.length - 1; i >= 0; i--) {
    if (!isWindowExpired(windows[i])) {
      return windows[i];
    }
  }
  return null;
}

/**
 * Create a new window entry.
 */
export function createWindow(
  existingWindows: WindowEntry[],
  windowDurationMs: number,
  tokenBudget: number,
): WindowEntry {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + windowDurationMs);
  return {
    id: generateWindowId(existingWindows),
    startedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    windowDurationMs,
    tokensConsumed: 0,
    budget: tokenBudget,
    remaining: tokenBudget,
    tasksCompleted: 0,
    timeRemainingMs: windowDurationMs,
    estimatedResetAt: expiresAt.toISOString(),
  };
}

/**
 * Compute a WindowStatus snapshot from a window entry.
 */
export function getWindowStatus(window: WindowEntry): WindowStatus {
  const now = Date.now();
  const expiresAtMs = new Date(window.expiresAt).getTime();
  const isExpired = now > expiresAtMs;
  const timeRemainingMs = isExpired ? 0 : expiresAtMs - now;
  const remaining = isExpired ? 0 : Math.max(0, window.budget - window.tokensConsumed);
  const percentUsed = window.budget > 0 ? window.tokensConsumed / window.budget : 0;

  return {
    windowId: window.id,
    startedAt: window.startedAt,
    expiresAt: window.expiresAt,
    tokensConsumed: window.tokensConsumed,
    budget: window.budget,
    remaining,
    percentUsed: Math.round(percentUsed * 1000) / 1000,
    tasksCompleted: window.tasksCompleted,
    timeRemainingMs,
    isExpired,
    estimatedResetAt: window.expiresAt,
  };
}

// ─── Domain Aggregation ────────────────────────────────────────

function updateDomainStats(
  perDomain: Record<string, DomainMetrics>,
  domain: string,
  tokensUsed: number,
  tokensSaved: number,
): void {
  const existing = perDomain[domain] ?? {
    totalTasks: 0,
    avgPrecision: 0,
    avgRecall: 0,
    totalTokensConsumed: 0,
    totalTokensSaved: 0,
  };

  existing.totalTasks += 1;
  existing.totalTokensConsumed += tokensUsed;
  existing.totalTokensSaved += tokensSaved;
  perDomain[domain] = existing;
}

// ─── Core: trackUsage ──────────────────────────────────────────

/**
 * Record token usage for a completed task.
 * Updates metrics.json with per-task, per-session, per-window, and per-domain data.
 * Must complete in <10ms overhead.
 */
export function trackUsage(input: TrackUsageInput): Result<TrackingResult> {
  const startTime = performance.now();

  // Read current metrics (or create default if missing)
  const metricsResult = readMetrics(input.projectRoot);
  let metrics: Metrics;
  if (!metricsResult.ok) {
    logger.debug(MODULE, 'No metrics found, using defaults');
    metrics = createDefaultMetrics();
  } else {
    metrics = metricsResult.ok ? metricsResult.value : createDefaultMetrics();
  }

  // Read config for budget/window settings
  const configResult = readConfig(input.projectRoot);
  const tokenBudget = configResult.ok ? configResult.value.tokenBudget : 44000;
  const windowDurationMs = configResult.ok ? configResult.value.windowDurationMs : 18_000_000;

  // Calculate savings
  const savings = estimateSavings(input.tokensUsed, input.predictionConfidence, input.compressionRatio);

  // Create per-task usage record
  const usage: TokenUsage = {
    taskId: input.taskId,
    tokensUsed: input.tokensUsed,
    estimatedUnoptimized: savings.estimatedUnoptimized,
    savings: savings.saved,
    domain: input.domain,
    timestamp: new Date().toISOString(),
  };

  // Update window
  const windows = (metrics.windows as unknown as WindowEntry[]) ?? [];
  let activeWindow = getActiveWindow(windows);
  if (!activeWindow) {
    activeWindow = createWindow(windows, windowDurationMs, tokenBudget);
    windows.push(activeWindow);
  }
  activeWindow.tokensConsumed += input.tokensUsed;
  activeWindow.remaining = Math.max(0, activeWindow.budget - activeWindow.tokensConsumed);
  activeWindow.tasksCompleted += 1;
  const expiresAtMs = new Date(activeWindow.expiresAt).getTime();
  activeWindow.timeRemainingMs = Math.max(0, expiresAtMs - Date.now());

  // Update overall metrics
  metrics.overall.totalTasks += 1;
  metrics.overall.totalTokensConsumed += input.tokensUsed;
  metrics.overall.totalTokensSaved += savings.saved;
  metrics.overall.savingsRate =
    metrics.overall.totalTokensConsumed + metrics.overall.totalTokensSaved > 0
      ? metrics.overall.totalTokensSaved / (metrics.overall.totalTokensConsumed + metrics.overall.totalTokensSaved)
      : 0;

  // Update per-domain
  updateDomainStats(metrics.perDomain, input.domain, input.tokensUsed, savings.saved);

  // Replace windows in metrics (cast back to store format)
  metrics.windows = windows as unknown as typeof metrics.windows;

  // Persist
  const writeResult = writeMetrics(input.projectRoot, metrics);
  if (!writeResult.ok) {
    logger.warn(MODULE, `Failed to write metrics: ${writeResult.error}`);
  }

  // Update session stats
  currentSession.tasksCompleted += 1;
  currentSession.tokensConsumed += input.tokensUsed;
  currentSession.tokensSaved += savings.saved;

  const windowStatus = getWindowStatus(activeWindow);

  const elapsed = performance.now() - startTime;
  if (elapsed > 10) {
    logger.warn(MODULE, `trackUsage exceeded 10ms budget: ${elapsed.toFixed(1)}ms`);
  } else {
    logger.debug(MODULE, `trackUsage completed in ${elapsed.toFixed(1)}ms`);
  }

  return ok({
    usage,
    windowStatus,
    sessionStats: { ...currentSession },
  });
}
