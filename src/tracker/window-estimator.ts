/**
 * Window time estimation — calculates remaining time, formats durations and reset times.
 * Implements AC8 (window time estimation) and AC9 (window auto-reset detection).
 */

import type { WindowStatus } from './types.js';
import type { WindowEstimate } from './types.js';

/**
 * Estimate window time remaining and expiry status.
 */
export function estimateWindowTime(windowStatus: WindowStatus): WindowEstimate {
  const timeRemainingMs = Math.max(0, Date.parse(windowStatus.expiresAt) - Date.now());
  const isExpired = timeRemainingMs <= 0;

  return {
    timeRemainingMs,
    resetAt: windowStatus.expiresAt,
    humanReadable: formatTimeRemaining(timeRemainingMs),
    isExpired,
  };
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
