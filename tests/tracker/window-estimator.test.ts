import { describe, it, expect } from 'vitest';
import type { WindowStatus } from '../../src/tracker/types.js';
import {
  estimateWindowTime,
  projectBudgetExhaustion,
  formatTimeRemaining,
  formatResetTime,
  detectBurnTrend,
  compareBurnRateToHistory,
} from '../../src/tracker/window-estimator.js';
import type { UsageHistoryEntry } from '../../src/types/index.js';
import type { WindowEntry } from '../../src/tracker/types.js';

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

  it('includes burn projection when tokens consumed (TK11)', () => {
    const startedAt = new Date(Date.now() - 1_800_000).toISOString(); // 30 min ago
    const expiresAt = new Date(Date.now() + 3_600_000).toISOString(); // 1h from now
    const ws = makeWindowStatus({
      expiresAt,
      tokensConsumed: 20000,
      budget: 44000,
      remaining: 24000,
    });
    ws.startedAt = startedAt;

    const estimate = estimateWindowTime(ws);
    expect(estimate.projectedExhaustionMs).toBeDefined();
    expect(estimate.projectedExhaustionMs!).toBeGreaterThan(0);
    expect(estimate.projectedExhaustionReadable).toBeDefined();
  });

  it('omits projection when no tokens consumed (TK11)', () => {
    const ws = makeWindowStatus({ tokensConsumed: 0, remaining: 44000 });
    const estimate = estimateWindowTime(ws);
    expect(estimate.projectedExhaustionMs).toBeUndefined();
  });
});

// ─── TK11: projectBudgetExhaustion ─────────────────────────────

describe('projectBudgetExhaustion (TK11)', () => {
  it('projects exhaustion based on burn rate', () => {
    const ws = makeWindowStatus({
      tokensConsumed: 10000,
      budget: 44000,
      remaining: 34000,
    });
    // Set startedAt to 30 min ago
    ws.startedAt = new Date(Date.now() - 1_800_000).toISOString();

    const projection = projectBudgetExhaustion(ws);
    expect(projection).toBeDefined();
    // 10000 tokens in 30 min → ~333 tokens/min → 34000/333 ≈ 102 min → ~6.1M ms
    expect(projection!).toBeGreaterThan(1_000_000);
  });

  it('returns undefined when no tokens consumed', () => {
    const ws = makeWindowStatus({ tokensConsumed: 0 });
    expect(projectBudgetExhaustion(ws)).toBeUndefined();
  });

  it('returns undefined when no remaining budget', () => {
    const ws = makeWindowStatus({ tokensConsumed: 44000, remaining: 0 });
    expect(projectBudgetExhaustion(ws)).toBeUndefined();
  });

  it('caps projection at window expiry', () => {
    const ws = makeWindowStatus({
      tokensConsumed: 100,
      budget: 44000,
      remaining: 43900,
    });
    // Very low burn rate — would project far beyond window expiry
    ws.startedAt = new Date(Date.now() - 1_800_000).toISOString();
    // Window expires in 1 hour
    ws.expiresAt = new Date(Date.now() + 3_600_000).toISOString();

    const projection = projectBudgetExhaustion(ws);
    expect(projection).toBeDefined();
    // Should be capped at ~1 hour (3.6M ms)
    expect(projection!).toBeLessThanOrEqual(3_700_000);
  });
});

// ─── BC4: Burn Rate Trend Detection ────────────────────────────

describe('detectBurnTrend (BC4)', () => {
  const windowStart = new Date(Date.now() - 3_600_000).toISOString();

  function makeEntry(tokensUsed: number, minutesAgo: number): UsageHistoryEntry {
    return {
      taskId: `t_${minutesAgo}`,
      tokensUsed,
      savings: 0,
      domain: 'general',
      timestamp: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
    };
  }

  it('detects accelerating burn rate', () => {
    // First half: small tasks, second half: large tasks
    const entries = [
      makeEntry(100, 50), makeEntry(100, 45),  // first half: avg 100
      makeEntry(200, 20), makeEntry(200, 10),   // second half: avg 200 (2x = accelerating)
    ];
    expect(detectBurnTrend(entries, windowStart)).toBe('accelerating');
  });

  it('detects decelerating burn rate', () => {
    const entries = [
      makeEntry(300, 50), makeEntry(300, 45),  // first half: avg 300
      makeEntry(100, 20), makeEntry(100, 10),   // second half: avg 100 (0.33x = decelerating)
    ];
    expect(detectBurnTrend(entries, windowStart)).toBe('decelerating');
  });

  it('returns stable when burn rate is consistent', () => {
    const entries = [
      makeEntry(200, 50), makeEntry(200, 45),
      makeEntry(210, 20), makeEntry(190, 10),   // ~same average
    ];
    expect(detectBurnTrend(entries, windowStart)).toBe('stable');
  });

  it('returns stable with fewer than 4 entries', () => {
    const entries = [
      makeEntry(100, 50), makeEntry(500, 10),
    ];
    expect(detectBurnTrend(entries, windowStart)).toBe('stable');
  });

  it('filters entries to current window only', () => {
    const recentWindowStart = new Date(Date.now() - 600_000).toISOString(); // 10 min ago
    const entries = [
      makeEntry(500, 30), // outside window
      makeEntry(500, 25), // outside window
      makeEntry(100, 8), makeEntry(100, 6),
      makeEntry(100, 4), makeEntry(100, 2),
    ];
    // Only 4 entries within the 10-min window, all ~100 → stable
    expect(detectBurnTrend(entries, recentWindowStart)).toBe('stable');
  });

  it('estimateWindowTime includes burnTrend when enough data', () => {
    const ws = makeWindowStatus({
      tokensConsumed: 20000,
      budget: 44000,
      remaining: 24000,
    });
    ws.startedAt = new Date(Date.now() - 1_800_000).toISOString();

    const entries = [
      makeEntry(100, 25), makeEntry(100, 20),
      makeEntry(300, 10), makeEntry(300, 5),
    ];
    const estimate = estimateWindowTime(ws, entries);
    expect(estimate.burnTrend).toBe('accelerating');
  });
});

// ─── BC11: Historical Burn Rate Comparison ─────────────────────

describe('compareBurnRateToHistory (BC11)', () => {
  function makePastWindow(tokensConsumed: number, durationHours: number): WindowEntry {
    const startedAt = new Date(Date.now() - (durationHours + 1) * 3_600_000).toISOString();
    const expiresAt = new Date(Date.parse(startedAt) + durationHours * 3_600_000).toISOString();
    return {
      id: `w_past_${Math.random().toString(36).slice(2, 6)}`,
      startedAt,
      expiresAt,
      windowDurationMs: durationHours * 3_600_000,
      tokensConsumed,
      budget: 44000,
      remaining: 44000 - tokensConsumed,
      tasksCompleted: 10,
      timeRemainingMs: 0,
      estimatedResetAt: expiresAt,
    };
  }

  it('returns >1 when burning faster than historical average', () => {
    // Current: 30000 tokens in 1 hour → 30000 tokens/hour
    const ws = makeWindowStatus({
      tokensConsumed: 30000,
      budget: 44000,
      remaining: 14000,
    });
    ws.startedAt = new Date(Date.now() - 3_600_000).toISOString();

    // Past: 10000 tokens per 5-hour window → 2000 tokens/hour each
    const pastWindows = [
      makePastWindow(10000, 5),
      makePastWindow(10000, 5),
    ];

    const ratio = compareBurnRateToHistory(ws, pastWindows);
    expect(ratio).toBeDefined();
    expect(ratio!).toBeGreaterThan(1);
  });

  it('returns <1 when burning slower than historical average', () => {
    // Current: 1000 tokens in 5 hours → 200 tokens/hour
    const ws = makeWindowStatus({
      tokensConsumed: 1000,
      budget: 44000,
      remaining: 43000,
    });
    ws.startedAt = new Date(Date.now() - 5 * 3_600_000).toISOString();

    // Past: 20000 tokens per 5-hour window → 4000 tokens/hour each
    const pastWindows = [
      makePastWindow(20000, 5),
      makePastWindow(20000, 5),
    ];

    const ratio = compareBurnRateToHistory(ws, pastWindows);
    expect(ratio).toBeDefined();
    expect(ratio!).toBeLessThan(1);
  });

  it('returns undefined with fewer than 2 past windows', () => {
    const ws = makeWindowStatus({ tokensConsumed: 10000 });
    ws.startedAt = new Date(Date.now() - 3_600_000).toISOString();

    expect(compareBurnRateToHistory(ws, [makePastWindow(5000, 5)])).toBeUndefined();
    expect(compareBurnRateToHistory(ws, [])).toBeUndefined();
  });

  it('returns undefined when no tokens consumed', () => {
    const ws = makeWindowStatus({ tokensConsumed: 0 });
    const pastWindows = [makePastWindow(10000, 5), makePastWindow(10000, 5)];
    expect(compareBurnRateToHistory(ws, pastWindows)).toBeUndefined();
  });
});
