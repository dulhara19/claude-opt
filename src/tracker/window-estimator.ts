/**
 * Window time estimation — calculates remaining time, formats durations and reset times.
 * Implements AC8 (window time estimation) and AC9 (window auto-reset detection).
 */

import type { WindowStatus, BurnTrend, WindowEntry } from './types.js';
import type { WindowEstimate } from './types.js';
import type { UsageHistoryEntry } from '../types/index.js';

/**
 * Estimate window time remaining and expiry status.
 * Includes rate-based burn projection (TK11) and burn trend (BC4).
 * @param recentUsage - Optional usage history for burn trend detection (BC4).
 */
export function estimateWindowTime(
  windowStatus: WindowStatus,
  recentUsage?: UsageHistoryEntry[],
): WindowEstimate {
  const timeRemainingMs = Math.max(0, Date.parse(windowStatus.expiresAt) - Date.now());
  const isExpired = timeRemainingMs <= 0;

  const result: WindowEstimate = {
    timeRemainingMs,
    resetAt: windowStatus.expiresAt,
    humanReadable: formatTimeRemaining(timeRemainingMs),
    isExpired,
  };

  // TK11: Rate-based burn projection
  const projection = projectBudgetExhaustion(windowStatus);
  if (projection != null) {
    result.projectedExhaustionMs = projection;
    result.projectedExhaustionReadable = formatTimeRemaining(projection);
  }

  // BC4: Burn rate trend
  if (recentUsage && recentUsage.length >= 4) {
    result.burnTrend = detectBurnTrend(recentUsage, windowStatus.startedAt);
  }

  return result;
}

/**
 * Project when budget will exhaust based on current consumption rate (TK11).
 * Returns ms until budget exhaustion, or undefined if no consumption data.
 * Returns the lesser of: projected exhaustion time or window expiry time.
 */
export function projectBudgetExhaustion(windowStatus: WindowStatus): number | undefined {
  if (windowStatus.tokensConsumed <= 0 || windowStatus.remaining <= 0) return undefined;

  const now = Date.now();
  const startedAtMs = Date.parse(windowStatus.startedAt);
  const elapsedMs = now - startedAtMs;

  if (elapsedMs <= 0) return undefined;

  // Tokens per millisecond burn rate
  const tokensPerMs = windowStatus.tokensConsumed / elapsedMs;
  if (tokensPerMs <= 0) return undefined;

  // Projected ms until remaining tokens are consumed
  const msUntilExhausted = windowStatus.remaining / tokensPerMs;

  // Return the lesser of: projected exhaustion or window expiry
  const expiresAtMs = Date.parse(windowStatus.expiresAt);
  const windowRemainingMs = Math.max(0, expiresAtMs - now);

  return Math.round(Math.min(msUntilExhausted, windowRemainingMs));
}

/**
 * Convert milliseconds to human-readable duration.
 * - Hours and minutes for > 60 minutes: "2h 12m"
 * - Minutes only for 1-60 minutes: "47 minutes"
 * - Seconds for < 1 minute: "45 seconds"
 * - "now" for 0 or negative
 */
export function formatTimeRemaining(ms: number): string {
  if (ms <= 0) return 'now';

  const totalSeconds = Math.floor(ms / 1000);
  const totalMinutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  if (totalMinutes >= 1) {
    return totalMinutes === 1 ? '1 minute' : `${totalMinutes} minutes`;
  }

  return totalSeconds === 1 ? '1 second' : `${totalSeconds} seconds`;
}

/**
 * Convert ISO timestamp to local time display: "at HH:MM".
 */
export function formatResetTime(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  const hours = String(date.getHours()).padStart(2, '0');
  const mins = String(date.getMinutes()).padStart(2, '0');
  return `at ${hours}:${mins}`;
}

/**
 * Compare current window burn rate against historical windows (BC11).
 * Returns ratio: >1 means burning faster than usual, <1 means slower.
 * Requires at least 2 past windows with consumption data.
 */
export function compareBurnRateToHistory(
  currentStatus: WindowStatus,
  pastWindows: WindowEntry[],
): number | undefined {
  if (currentStatus.tokensConsumed <= 0) return undefined;

  const now = Date.now();
  const currentStartMs = Date.parse(currentStatus.startedAt);
  const currentElapsedMs = now - currentStartMs;
  if (currentElapsedMs <= 0) return undefined;

  const currentRate = currentStatus.tokensConsumed / currentElapsedMs; // tokens/ms

  // Calculate average burn rate from past completed windows
  const pastRates: number[] = [];
  for (const w of pastWindows) {
    if (w.tokensConsumed <= 0) continue;
    const startMs = Date.parse(w.startedAt);
    const endMs = Date.parse(w.expiresAt);
    const durationMs = endMs - startMs;
    if (durationMs <= 0) continue;
    pastRates.push(w.tokensConsumed / durationMs);
  }

  if (pastRates.length < 2) return undefined;

  const avgHistoricalRate = pastRates.reduce((s, r) => s + r, 0) / pastRates.length;
  if (avgHistoricalRate <= 0) return undefined;

  return Math.round((currentRate / avgHistoricalRate) * 100) / 100;
}

/**
 * Detect burn rate trend by comparing first-half vs second-half token consumption (BC4).
 * Requires at least 4 usage entries within the window period.
 * Returns 'accelerating' if second half burns >20% faster, 'decelerating' if >20% slower.
 */
export function detectBurnTrend(recentUsage: UsageHistoryEntry[], windowStartedAt: string): BurnTrend {
  const windowStart = Date.parse(windowStartedAt);
  // Filter to entries within this window
  const windowEntries = recentUsage.filter(e => Date.parse(e.timestamp) >= windowStart);

  if (windowEntries.length < 4) return 'stable';

  const midpoint = Math.floor(windowEntries.length / 2);
  const firstHalf = windowEntries.slice(0, midpoint);
  const secondHalf = windowEntries.slice(midpoint);

  const firstTotal = firstHalf.reduce((sum, e) => sum + e.tokensUsed, 0);
  const secondTotal = secondHalf.reduce((sum, e) => sum + e.tokensUsed, 0);

  // Normalize by count to get per-task average
  const firstAvg = firstTotal / firstHalf.length;
  const secondAvg = secondTotal / secondHalf.length;

  if (firstAvg <= 0) return 'stable';

  const ratio = secondAvg / firstAvg;
  if (ratio > 1.2) return 'accelerating';
  if (ratio < 0.8) return 'decelerating';
  return 'stable';
}
