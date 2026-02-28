/**
 * Token Tracker — per-task, per-session, per-window tracking with savings estimation.
 * Must complete in <10ms (NFR TT-10).
 */

import type { Result, Metrics, DomainMetrics, UsageHistoryEntry, ModelTokenStats } from '../types/index.js';
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
import { MAX_USAGE_HISTORY, MAX_RETAINED_WINDOWS } from './types.js';

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
 * Formula: estimatedUnoptimized = tokensUsed / (1 - compressionRatio * predictionConfidence * predictionAccuracy)
 * When predictionAccuracy is unavailable, falls back to compressionRatio * predictionConfidence (TK4).
 * If no optimization occurred, estimatedUnoptimized = tokensUsed (no savings).
 */
export function estimateSavings(
  tokensUsed: number,
  predictionConfidence: number,
  compressionRatio: number,
  predictionAccuracy?: number,
): SavingsEstimate {
  const accuracyFactor = predictionAccuracy != null ? predictionAccuracy : 1;
  const optimizationFactor = compressionRatio * predictionConfidence * accuracyFactor;

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

// ─── Window Pruning (TK3) ──────────────────────────────────────

/**
 * Prune expired windows, keeping the active window + last MAX_RETAINED_WINDOWS expired ones.
 */
export function pruneExpiredWindows(windows: WindowEntry[]): WindowEntry[] {
  const active: WindowEntry[] = [];
  const expired: WindowEntry[] = [];

  for (const w of windows) {
    if (isWindowExpired(w)) {
      expired.push(w);
    } else {
      active.push(w);
    }
  }

  // Keep only the most recent expired windows
  const retainedExpired = expired.length > MAX_RETAINED_WINDOWS
    ? expired.slice(expired.length - MAX_RETAINED_WINDOWS)
    : expired;

  return [...retainedExpired, ...active];
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

// ─── Per-Model Aggregation (TK6) ──────────────────────────────

function updateModelStats(
  perModel: Record<string, ModelTokenStats>,
  modelTier: string,
  tokensUsed: number,
  tokensSaved: number,
): void {
  const existing = perModel[modelTier] ?? {
    totalTasks: 0,
    totalTokensConsumed: 0,
    totalTokensSaved: 0,
  };

  existing.totalTasks += 1;
  existing.totalTokensConsumed += tokensUsed;
  existing.totalTokensSaved += tokensSaved;
  perModel[modelTier] = existing;
}

// ─── Core: trackUsage ──────────────────────────────────────────

/**
 * Record token usage for a completed task.
 * Updates metrics.json with per-task, per-session, per-window, per-domain, and per-model data.
 * Must complete in <10ms overhead.
 */
export function trackUsage(input: TrackUsageInput): Result<TrackingResult> {
  const startTime = performance.now();

  // TK1: Use StoreCache when available, fall back to disk reads
  const cache = input.storeCache;

  // TK5: Simplified metrics read (fixed redundant check)
  const metrics: Metrics = cache?.metrics
    ?? (readMetrics(input.projectRoot).ok ? (readMetrics(input.projectRoot) as { ok: true; value: Metrics }).value : createDefaultMetrics());

  // Read config for budget/window settings (TK1: prefer cache)
  const config = cache?.config;
  const tokenBudget = config?.tokenBudget ?? 44000;
  const windowDurationMs = config?.windowDurationMs ?? 18_000_000;

  // TK4: Calculate savings with optional prediction accuracy
  const savings = estimateSavings(input.tokensUsed, input.predictionConfidence, input.compressionRatio, input.predictionAccuracy);

  // Create per-task usage record
  const usage: TokenUsage = {
    taskId: input.taskId,
    tokensUsed: input.tokensUsed,
    estimatedUnoptimized: savings.estimatedUnoptimized,
    savings: savings.saved,
    domain: input.domain,
    timestamp: new Date().toISOString(),
  };

  // TK3: Prune expired windows before operating
  let windows = pruneExpiredWindows((metrics.windows as unknown as WindowEntry[]) ?? []);

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

  // TK6: Update per-model stats
  if (input.modelTier) {
    if (!metrics.perModel) metrics.perModel = {};
    updateModelStats(metrics.perModel, input.modelTier, input.tokensUsed, savings.saved);
  }

  // TK2: Append to usage history (FIFO, capped)
  if (!metrics.recentUsage) metrics.recentUsage = [];
  const historyEntry: UsageHistoryEntry = {
    taskId: input.taskId,
    tokensUsed: input.tokensUsed,
    savings: savings.saved,
    domain: input.domain,
    modelTier: input.modelTier,
    timestamp: usage.timestamp,
  };
  metrics.recentUsage.push(historyEntry);
  if (metrics.recentUsage.length > MAX_USAGE_HISTORY) {
    metrics.recentUsage = metrics.recentUsage.slice(metrics.recentUsage.length - MAX_USAGE_HISTORY);
  }

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

  // TK12: Update per-type session breakdown
  if (input.taskType) {
    if (!currentSession.perType) currentSession.perType = {};
    const typeStats = currentSession.perType[input.taskType] ?? { tasks: 0, tokensConsumed: 0, tokensSaved: 0 };
    typeStats.tasks += 1;
    typeStats.tokensConsumed += input.tokensUsed;
    typeStats.tokensSaved += savings.saved;
    currentSession.perType[input.taskType] = typeStats;
  }

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
