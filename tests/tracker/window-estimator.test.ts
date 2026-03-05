import { describe, it, expect } from 'vitest';
import type { WindowStatus } from '../../src/tracker/types.js';
import {
  estimateWindowTime,
  formatTimeRemaining,
  formatResetTime,
} from '../../src/tracker/window-estimator.js';

// ─── Test Helpers ──────────────────────────────────────────────

function makeWindowStatus(overrides: Partial<WindowStatus> = {}): WindowStatus {
  return {
    windowId: 'w_20260305_01',
    startedAt: new Date().toISOString(),
    expiresAt: overrides.expiresAt ?? new Date(Date.now() + 3_600_000).toISOString(),
    tokensConsumed: overrides.tokensConsumed ?? 18200,
    budget: overrides.budget ?? 44000,
    remaining: overrides.remaining ?? 25800,
    percentUsed: overrides.percentUsed ?? 0.414,
    tasksCompleted: overrides.tasksCompleted ?? 14,
    timeRemainingMs: overrides.timeRemainingMs ?? 3_600_000,
    isExpired: overrides.isExpired ?? false,
    estimatedResetAt: overrides.expiresAt ?? new Date(Date.now() + 3_600_000).toISOString(),
  };
}

// ─── formatTimeRemaining ───────────────────────────────────────

describe('formatTimeRemaining', () => {
  it('formats hours and minutes', () => {
    expect(formatTimeRemaining(7_920_000)).toBe('2h 12m'); // 2h 12m
  });

  it('formats hours only when no remaining minutes', () => {
    expect(formatTimeRemaining(3_600_000)).toBe('1h'); // exactly 1h
  });

  it('formats minutes only for 1-60 minutes', () => {
    expect(formatTimeRemaining(2_820_000)).toBe('47 minutes');
  });

  it('formats singular minute', () => {
    expect(formatTimeRemaining(60_000)).toBe('1 minute');
  });

  it('formats seconds for < 1 minute', () => {
    expect(formatTimeRemaining(45_000)).toBe('45 seconds');
  });

  it('formats singular second', () => {
    expect(formatTimeRemaining(1_000)).toBe('1 second');
  });

  it('returns "now" for 0', () => {
    expect(formatTimeRemaining(0)).toBe('now');
  });

  it('returns "now" for negative values', () => {
    expect(formatTimeRemaining(-5000)).toBe('now');
  });
});

// ─── formatResetTime ───────────────────────────────────────────

describe('formatResetTime', () => {
  it('converts ISO timestamp to local time', () => {
    // Create a specific time and test formatting
    const date = new Date(2026, 2, 5, 14, 0, 0); // March 5, 2026 14:00
    const result = formatResetTime(date.toISOString());
    expect(result).toBe('at 14:00');
  });

  it('pads single-digit hours and minutes', () => {
    const date = new Date(2026, 2, 5, 9, 5, 0); // 09:05
    const result = formatResetTime(date.toISOString());
    expect(result).toBe('at 09:05');
  });
});

// ─── estimateWindowTime ────────────────────────────────────────

describe('estimateWindowTime', () => {
  it('returns time remaining for active window', () => {
    const futureExpiry = new Date(Date.now() + 7_920_000).toISOString(); // 2h 12m from now
    const ws = makeWindowStatus({ expiresAt: futureExpiry });
    const estimate = estimateWindowTime(ws);

    expect(estimate.isExpired).toBe(false);
    expect(estimate.timeRemainingMs).toBeGreaterThan(0);
    expect(estimate.timeRemainingMs).toBeLessThanOrEqual(7_920_000);
    expect(estimate.humanReadable).toMatch(/2h 1[12]m/); // approximate due to test execution time
    expect(estimate.resetAt).toBe(futureExpiry);
  });

  it('returns expired for past window', () => {
    const pastExpiry = new Date(Date.now() - 60_000).toISOString(); // 1 minute ago
    const ws = makeWindowStatus({ expiresAt: pastExpiry });
    const estimate = estimateWindowTime(ws);

    expect(estimate.isExpired).toBe(true);
    expect(estimate.timeRemainingMs).toBe(0);
    expect(estimate.humanReadable).toBe('now');
  });

  it('returns expired for exactly now', () => {
    const nowExpiry = new Date(Date.now()).toISOString();
    const ws = makeWindowStatus({ expiresAt: nowExpiry });
    const estimate = estimateWindowTime(ws);

    expect(estimate.isExpired).toBe(true);
    expect(estimate.timeRemainingMs).toBe(0);
    expect(estimate.humanReadable).toBe('now');
  });

  it('handles far future window', () => {
    const farFuture = new Date(Date.now() + 18_000_000).toISOString(); // 5 hours
    const ws = makeWindowStatus({ expiresAt: farFuture });
    const estimate = estimateWindowTime(ws);

    expect(estimate.isExpired).toBe(false);
    // ~5 hours, could be "5h" or "4h 59m" depending on timing
    expect(estimate.humanReadable).toMatch(/[45]h/);
  });
});
