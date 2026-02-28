import { describe, it, expect } from 'vitest';
import type { WindowStatus } from '../../src/tracker/types.js';
import {
  checkBudget,
  estimateRemainingTasks,
  formatWarningMessage,
  renderInlineWarning,
  renderBlockingWarning,
  renderExhaustedWarning,
  renderAwarenessWarning,
  formatNumber,
  formatPercent,
  renderProgressBar,
  colorProgressBar,
  getRecoverySuggestions,
  estimateRemainingTasksForType,
} from '../../src/tracker/budget-warnings.js';

// ─── Test Helpers ──────────────────────────────────────────────

function makeWindowStatus(overrides: Partial<WindowStatus> = {}): WindowStatus {
  const budget = overrides.budget ?? 44000;
  const tokensConsumed = overrides.tokensConsumed ?? 0;
  const remaining = budget - tokensConsumed;
  const percentUsed = budget > 0 ? tokensConsumed / budget : 0;
  const expiresAt = overrides.expiresAt ?? new Date(Date.now() + 3_600_000).toISOString();

  return {
    windowId: 'w_20260305_01',
    startedAt: new Date().toISOString(),
    expiresAt,
    tokensConsumed,
    budget,
    remaining,
    percentUsed: Math.round(percentUsed * 1000) / 1000,
    tasksCompleted: overrides.tasksCompleted ?? 10,
    timeRemainingMs: overrides.timeRemainingMs ?? 3_600_000,
    isExpired: overrides.isExpired ?? false,
    estimatedResetAt: expiresAt,
  };
}

const DEFAULT_THRESHOLDS = { inline: 0.75, blocking: 0.90 };

// ─── checkBudget ───────────────────────────────────────────────

describe('checkBudget', () => {
  it('returns "none" for 0% usage', () => {
    const ws = makeWindowStatus({ tokensConsumed: 0 });
    const warning = checkBudget(ws, DEFAULT_THRESHOLDS);
    expect(warning.level).toBe('none');
    expect(warning.message).toBe('');
  });

  it('returns "awareness" for 50% usage (BC3)', () => {
    const ws = makeWindowStatus({ tokensConsumed: 22000 });
    const warning = checkBudget(ws, DEFAULT_THRESHOLDS);
    expect(warning.level).toBe('awareness');
  });

  it('returns "none" for 40% usage (below awareness threshold)', () => {
    const ws = makeWindowStatus({ tokensConsumed: 17600 });
    const warning = checkBudget(ws, DEFAULT_THRESHOLDS);
    expect(warning.level).toBe('none');
  });

  it('respects custom awareness threshold (BC3)', () => {
    const ws = makeWindowStatus({ tokensConsumed: 26400 }); // 60%
    const warning = checkBudget(ws, { ...DEFAULT_THRESHOLDS, awareness: 0.65 });
    expect(warning.level).toBe('none'); // 60% < 65% awareness
    const warning2 = checkBudget(ws, { ...DEFAULT_THRESHOLDS, awareness: 0.55 });
    expect(warning2.level).toBe('awareness'); // 60% >= 55% awareness
  });

  it('returns "inline" at exactly 75% usage', () => {
    const ws = makeWindowStatus({ tokensConsumed: 33000 });
    const warning = checkBudget(ws, DEFAULT_THRESHOLDS);
    expect(warning.level).toBe('inline');
    expect(warning.message).toContain('Budget:');
    expect(warning.message).toContain('remaining');
  });

  it('returns "blocking" at exactly 90% usage', () => {
    const ws = makeWindowStatus({ tokensConsumed: 39600 });
    const warning = checkBudget(ws, DEFAULT_THRESHOLDS);
    expect(warning.level).toBe('blocking');
    expect(warning.message).toContain('token budget');
  });

  it('returns "exhausted" at 100% usage', () => {
    const ws = makeWindowStatus({ tokensConsumed: 44000 });
    const warning = checkBudget(ws, DEFAULT_THRESHOLDS);
    expect(warning.level).toBe('exhausted');
    expect(warning.message).toContain('fully consumed');
  });

  it('returns "exhausted" when over 100% usage', () => {
    const ws = makeWindowStatus({ tokensConsumed: 50000, budget: 44000 });
    // percentUsed will be > 1.0
    ws.percentUsed = 50000 / 44000;
    const warning = checkBudget(ws, DEFAULT_THRESHOLDS);
    expect(warning.level).toBe('exhausted');
  });

  it('uses custom thresholds', () => {
    const ws = makeWindowStatus({ tokensConsumed: 35200 }); // 80%
    const customThresholds = { inline: 0.80, blocking: 0.95 };
    const warning = checkBudget(ws, customThresholds);
    expect(warning.level).toBe('inline');
  });

  it('calculates estimatedTasksRemaining', () => {
    const ws = makeWindowStatus({ tokensConsumed: 33000, tasksCompleted: 10 });
    const warning = checkBudget(ws, DEFAULT_THRESHOLDS);
    // avg = 33000/10 = 3300 tokens/task, remaining = 11000, estimated = 3
    expect(warning.estimatedTasksRemaining).toBe(3);
  });

  it('handles zero tasks completed (no average)', () => {
    const ws = makeWindowStatus({ tokensConsumed: 33000, tasksCompleted: 0 });
    const warning = checkBudget(ws, DEFAULT_THRESHOLDS);
    expect(warning.estimatedTasksRemaining).toBe(0);
  });
});

// ─── estimateRemainingTasks ────────────────────────────────────

describe('estimateRemainingTasks', () => {
  it('calculates correctly with positive values', () => {
    expect(estimateRemainingTasks(11000, 3300)).toBe(3);
  });

  it('returns 0 when avgTokensPerTask is 0', () => {
    expect(estimateRemainingTasks(11000, 0)).toBe(0);
  });

  it('returns 0 when remaining is 0', () => {
    expect(estimateRemainingTasks(0, 3300)).toBe(0);
  });

  it('returns 0 when avgTokensPerTask is negative', () => {
    expect(estimateRemainingTasks(11000, -100)).toBe(0);
  });

  // TK10: Per-type average
  it('uses per-type average when available with 5+ samples (TK10)', () => {
    const perTypeAvg = {
      BugFix: { avg: 2000, count: 10 },
      Exploration: { avg: 15000, count: 8 },
    };
    // Should use BugFix avg (2000) instead of global avg (3300)
    expect(estimateRemainingTasks(11000, 3300, perTypeAvg, 'BugFix')).toBe(5);
  });

  it('falls back to global average when type has < 5 samples (TK10)', () => {
    const perTypeAvg = {
      BugFix: { avg: 2000, count: 3 },
    };
    // Should use global avg (3300) since BugFix has only 3 samples
    expect(estimateRemainingTasks(11000, 3300, perTypeAvg, 'BugFix')).toBe(3);
  });

  it('falls back to global average when type is unknown (TK10)', () => {
    const perTypeAvg = {
      BugFix: { avg: 2000, count: 10 },
    };
    expect(estimateRemainingTasks(11000, 3300, perTypeAvg, 'Unknown')).toBe(3);
  });
});

// ─── formatWarningMessage ──────────────────────────────────────

describe('formatWarningMessage', () => {
  it('returns empty string for none level', () => {
    const warning = checkBudget(makeWindowStatus(), DEFAULT_THRESHOLDS);
    expect(formatWarningMessage(warning)).toBe('');
  });

  it('formats inline message with budget fraction and time', () => {
    const warning = checkBudget(
      makeWindowStatus({ tokensConsumed: 33000, timeRemainingMs: 3_780_000 }),
      DEFAULT_THRESHOLDS,
    );
    const msg = formatWarningMessage(warning);
    expect(msg).toContain('Budget:');
    expect(msg).toContain('33,000');
    expect(msg).toContain('44,000');
    expect(msg).toContain('remaining');
  });

  it('formats blocking message with full details', () => {
    const warning = checkBudget(
      makeWindowStatus({ tokensConsumed: 39600 }),
      DEFAULT_THRESHOLDS,
    );
    const msg = formatWarningMessage(warning);
    expect(msg).toContain('token budget');
    expect(msg).toContain('consumed');
  });

  it('formats exhausted message', () => {
    const warning = checkBudget(
      makeWindowStatus({ tokensConsumed: 44000 }),
      DEFAULT_THRESHOLDS,
    );
    const msg = formatWarningMessage(warning);
    expect(msg).toContain('fully consumed');
  });
});

// ─── Rendering ─────────────────────────────────────────────────

describe('renderInlineWarning', () => {
  it('includes budget fraction and suggestion', () => {
    const warning = checkBudget(
      makeWindowStatus({ tokensConsumed: 33000 }),
      DEFAULT_THRESHOLDS,
    );
    const output = renderInlineWarning(warning);
    expect(output).toContain('Budget:');
    expect(output).toContain('--dry-run');
  });
});

describe('renderBlockingWarning', () => {
  it('renders box with options', () => {
    const warning = checkBudget(
      makeWindowStatus({ tokensConsumed: 39600 }),
      DEFAULT_THRESHOLDS,
    );
    const output = renderBlockingWarning(warning);
    expect(output).toContain('Budget Warning');
    expect(output).toContain('[1] Continue anyway');
    expect(output).toContain('[2] Wait for reset');
    expect(output).toContain('[3] Cancel this task');
  });
});

describe('renderExhaustedWarning', () => {
  it('renders exhausted box with tip', () => {
    const warning = checkBudget(
      makeWindowStatus({ tokensConsumed: 44000 }),
      DEFAULT_THRESHOLDS,
    );
    const output = renderExhaustedWarning(warning);
    expect(output).toContain('Budget Exhausted');
    expect(output).toContain('co --dry-run');
  });
});

// ─── Formatting Helpers ────────────────────────────────────────

describe('formatNumber', () => {
  it('formats with commas', () => {
    expect(formatNumber(44000)).toBe('44,000');
    expect(formatNumber(1000000)).toBe('1,000,000');
    expect(formatNumber(0)).toBe('0');
  });
});

describe('formatPercent', () => {
  it('converts ratio to percentage string', () => {
    expect(formatPercent(0.75)).toBe('75%');
    expect(formatPercent(0.9)).toBe('90%');
    expect(formatPercent(1.0)).toBe('100%');
    expect(formatPercent(0)).toBe('0%');
  });
});

describe('renderProgressBar', () => {
  it('renders filled and empty blocks', () => {
    const bar = renderProgressBar(0.5, 10);
    expect(bar).toBe('█████░░░░░');
  });

  it('renders fully filled', () => {
    const bar = renderProgressBar(1.0, 10);
    expect(bar).toBe('██████████');
  });

  it('renders fully empty', () => {
    const bar = renderProgressBar(0, 10);
    expect(bar).toBe('░░░░░░░░░░');
  });
});

// ─── TK8: Color Progress Bar ────────────────────────────────────

describe('colorProgressBar (TK8)', () => {
  it('returns colored bar string', () => {
    const bar = colorProgressBar(0.5, 10);
    // Should contain the bar characters (green for <75%)
    expect(bar).toContain('█████');
  });

  it('returns a bar for high usage', () => {
    const bar = colorProgressBar(0.95, 10);
    // Should have red coloring for >90%
    expect(bar).toBeTruthy();
    expect(bar.length).toBeGreaterThan(0);
  });
});

// ─── TK7: Dynamic Box Width ────────────────────────────────────

describe('dynamic box width (TK7)', () => {
  it('renders blocking warning without broken layout for large numbers', () => {
    const ws = makeWindowStatus({
      tokensConsumed: 999999,
      budget: 1000000,
      tasksCompleted: 100,
    });
    ws.percentUsed = 999999 / 1000000;
    ws.remaining = 1;
    const warning = checkBudget(ws, DEFAULT_THRESHOLDS);
    const output = renderBlockingWarning(warning);

    // Should not have negative padding (broken layout)
    expect(output).not.toContain('undefined');
    expect(output).toContain('Budget Warning');
    expect(output).toContain('[1] Continue anyway');
  });

  it('renders exhausted warning without broken layout for large numbers', () => {
    const ws = makeWindowStatus({
      tokensConsumed: 1500000,
      budget: 1000000,
    });
    ws.percentUsed = 1500000 / 1000000;
    const warning = checkBudget(ws, DEFAULT_THRESHOLDS);
    const output = renderExhaustedWarning(warning);

    expect(output).not.toContain('undefined');
    expect(output).toContain('Budget Exhausted');
  });

  it('inline warning includes progress bar (TK8)', () => {
    const warning = checkBudget(
      makeWindowStatus({ tokensConsumed: 33000 }),
      DEFAULT_THRESHOLDS,
    );
    const output = renderInlineWarning(warning);
    // Should contain bar characters
    expect(output).toContain('█');
    expect(output).toContain('░');
  });

  it('blocking warning includes progress bar (TK8)', () => {
    const warning = checkBudget(
      makeWindowStatus({ tokensConsumed: 39600 }),
      DEFAULT_THRESHOLDS,
    );
    const output = renderBlockingWarning(warning);
    expect(output).toContain('█');
  });
});

// ─── BC1: checkBudget passes perTypeAvg ────────────────────────

describe('checkBudget with perTypeAvg (BC1)', () => {
  it('uses per-type average for task estimation when available', () => {
    const ws = makeWindowStatus({ tokensConsumed: 33000, tasksCompleted: 10 });
    const perTypeAvg = { BugFix: { avg: 2000, count: 10 } };
    const warning = checkBudget(ws, DEFAULT_THRESHOLDS, {
      perTypeAvg,
      taskType: 'BugFix',
    });
    // avg from perType = 2000, remaining = 11000, estimated = 5
    expect(warning.estimatedTasksRemaining).toBe(5);
  });

  it('falls back to global avg when no perTypeAvg', () => {
    const ws = makeWindowStatus({ tokensConsumed: 33000, tasksCompleted: 10 });
    const warning = checkBudget(ws, DEFAULT_THRESHOLDS);
    // avg = 33000/10 = 3300, remaining = 11000, estimated = 3
    expect(warning.estimatedTasksRemaining).toBe(3);
  });
});

// ─── BC2: Burn rate projection ──────────────────────────────────

describe('checkBudget burn rate (BC2)', () => {
  it('includes burnRateTokensPerMin when tokens consumed', () => {
    const ws = makeWindowStatus({ tokensConsumed: 20000, tasksCompleted: 5 });
    // Set startedAt to 30 minutes ago for measurable burn rate
    ws.startedAt = new Date(Date.now() - 1_800_000).toISOString();
    const warning = checkBudget(ws, DEFAULT_THRESHOLDS);
    expect(warning.burnRateTokensPerMin).toBeDefined();
    expect(warning.burnRateTokensPerMin!).toBeGreaterThan(0);
    // ~20000 / 30 min = ~667 tokens/min
    expect(warning.burnRateTokensPerMin!).toBeCloseTo(667, -1);
  });

  it('includes projectedExhaustionMs', () => {
    const ws = makeWindowStatus({ tokensConsumed: 20000, tasksCompleted: 5 });
    ws.startedAt = new Date(Date.now() - 1_800_000).toISOString();
    const warning = checkBudget(ws, DEFAULT_THRESHOLDS);
    expect(warning.projectedExhaustionMs).toBeDefined();
    expect(warning.projectedExhaustionMs!).toBeGreaterThan(0);
  });

  it('returns 0 burnRate when no tokens consumed', () => {
    const ws = makeWindowStatus({ tokensConsumed: 0 });
    const warning = checkBudget(ws, DEFAULT_THRESHOLDS);
    expect(warning.burnRateTokensPerMin).toBe(0);
    expect(warning.projectedExhaustionMs).toBeUndefined();
  });
});

// ─── BC3: Awareness warning renderer ───────────────────────────

describe('renderAwarenessWarning (BC3)', () => {
  it('renders compact dim status line', () => {
    const ws = makeWindowStatus({ tokensConsumed: 22000 });
    const warning = checkBudget(ws, DEFAULT_THRESHOLDS);
    const output = renderAwarenessWarning(warning);
    expect(output).toContain('50%');
    expect(output).toContain('remaining');
  });

  it('includes savings when provided (BC5)', () => {
    const ws = makeWindowStatus({ tokensConsumed: 22000 });
    const warning = checkBudget(ws, DEFAULT_THRESHOLDS, { tokensSavedThisWindow: 5000 });
    const output = renderAwarenessWarning(warning);
    expect(output).toContain('saved');
    expect(output).toContain('5,000');
  });
});

// ─── BC5: Savings context in warnings ──────────────────────────

describe('savings context in warnings (BC5)', () => {
  it('includes savings in inline message', () => {
    const ws = makeWindowStatus({ tokensConsumed: 33000 });
    const warning = checkBudget(ws, DEFAULT_THRESHOLDS, { tokensSavedThisWindow: 8000 });
    expect(warning.message).toContain('saved ~8,000 tokens');
  });

  it('includes savings in blocking message', () => {
    const ws = makeWindowStatus({ tokensConsumed: 39600 });
    const warning = checkBudget(ws, DEFAULT_THRESHOLDS, { tokensSavedThisWindow: 12000 });
    expect(warning.message).toContain('saved ~12,000 tokens');
  });

  it('omits savings when none', () => {
    const ws = makeWindowStatus({ tokensConsumed: 33000 });
    const warning = checkBudget(ws, DEFAULT_THRESHOLDS);
    expect(warning.message).not.toContain('saved');
  });
});

// ─── BC9: Projection in warnings ───────────────────────────────

describe('projected exhaustion in warnings (BC9)', () => {
  it('includes projection in inline message', () => {
    const ws = makeWindowStatus({ tokensConsumed: 33000, tasksCompleted: 10 });
    ws.startedAt = new Date(Date.now() - 1_800_000).toISOString();
    const warning = checkBudget(ws, DEFAULT_THRESHOLDS);
    expect(warning.message).toContain('Projected exhaustion');
  });

  it('includes projection in blocking render', () => {
    const ws = makeWindowStatus({ tokensConsumed: 39600, tasksCompleted: 10 });
    ws.startedAt = new Date(Date.now() - 1_800_000).toISOString();
    const warning = checkBudget(ws, DEFAULT_THRESHOLDS);
    const output = renderBlockingWarning(warning);
    expect(output).toContain('current rate');
  });
});

// ─── BC7: Recovery Suggestions ─────────────────────────────────

describe('getRecoverySuggestions (BC7)', () => {
  it('suggests dry-run at 90%+ usage', () => {
    const ws = makeWindowStatus({ tokensConsumed: 39600, tasksCompleted: 10 });
    const warning = checkBudget(ws, DEFAULT_THRESHOLDS);
    const suggestions = getRecoverySuggestions(warning);
    expect(suggestions.some(s => s.includes('--dry-run'))).toBe(true);
  });

  it('suggests focused prompts when few tasks remain', () => {
    const ws = makeWindowStatus({ tokensConsumed: 39600, tasksCompleted: 3 });
    // avg = 39600/3 = 13200, remaining = 4400, estimated = 0
    const warning = checkBudget(ws, DEFAULT_THRESHOLDS);
    // estimatedTasksRemaining may be 0 here, no suggestion since <=0
    // Let's use a case where 1-3 remain
    const ws2 = makeWindowStatus({ tokensConsumed: 33000, tasksCompleted: 10 });
    const warning2 = checkBudget(ws2, DEFAULT_THRESHOLDS);
    // avg = 3300, remaining = 11000, estimated = 3
    expect(warning2.estimatedTasksRemaining).toBe(3);
    const suggestions2 = getRecoverySuggestions(warning2);
    expect(suggestions2.some(s => s.includes('targeted prompts'))).toBe(true);
  });

  it('returns empty array when remaining is 0', () => {
    const ws = makeWindowStatus({ tokensConsumed: 44000 });
    const warning = checkBudget(ws, DEFAULT_THRESHOLDS);
    const suggestions = getRecoverySuggestions(warning);
    expect(suggestions).toHaveLength(0);
  });

  it('limits to 2 suggestions max', () => {
    const ws = makeWindowStatus({ tokensConsumed: 39600, tasksCompleted: 10 });
    const warning = checkBudget(ws, DEFAULT_THRESHOLDS);
    const suggestions = getRecoverySuggestions(warning);
    expect(suggestions.length).toBeLessThanOrEqual(2);
  });
});

// ─── BC8: Per-Type Task Estimation ─────────────────────────────

describe('estimateRemainingTasksForType (BC8)', () => {
  it('uses per-type average when sufficient data', () => {
    const result = estimateRemainingTasksForType(
      10000, 3000,
      { BugFix: { avg: 2000, count: 10 } },
      'BugFix',
    );
    expect(result.estimate).toBe(5);
    expect(result.source).toBe('perType');
  });

  it('falls back to global when type has insufficient data', () => {
    const result = estimateRemainingTasksForType(
      10000, 3000,
      { BugFix: { avg: 2000, count: 3 } },
      'BugFix',
    );
    expect(result.estimate).toBe(3);
    expect(result.source).toBe('global');
  });

  it('falls back to global when no perTypeAvg', () => {
    const result = estimateRemainingTasksForType(10000, 3000);
    expect(result.estimate).toBe(3);
    expect(result.source).toBe('global');
  });

  it('returns 0 when global avg is 0', () => {
    const result = estimateRemainingTasksForType(10000, 0);
    expect(result.estimate).toBe(0);
    expect(result.source).toBe('global');
  });
});

// ─── BC10: Per-Domain Budget Breakdown ─────────────────────────

describe('domain breakdown in warnings (BC10)', () => {
  it('includes domain breakdown in blocking render', () => {
    const ws = makeWindowStatus({ tokensConsumed: 39600, tasksCompleted: 10 });
    const warning = checkBudget(ws, DEFAULT_THRESHOLDS, {
      domainConsumption: { auth: 20000, ui: 15000, general: 4600 },
    });
    expect(warning.domainBreakdown).toBeDefined();
    expect(warning.domainBreakdown!['auth']).toBeGreaterThan(40);
    const output = renderBlockingWarning(warning);
    expect(output).toContain('Usage by domain');
    expect(output).toContain('auth');
  });

  it('omits domain breakdown when no data', () => {
    const ws = makeWindowStatus({ tokensConsumed: 39600 });
    const warning = checkBudget(ws, DEFAULT_THRESHOLDS);
    expect(warning.domainBreakdown).toBeUndefined();
  });

  it('sorts domains by share descending', () => {
    const ws = makeWindowStatus({ tokensConsumed: 39600 });
    const warning = checkBudget(ws, DEFAULT_THRESHOLDS, {
      domainConsumption: { small: 1000, large: 30000, medium: 8600 },
    });
    const output = renderBlockingWarning(warning);
    // "large" should appear before "medium" and "small"
    const idx1 = output.indexOf('large');
    const idx2 = output.indexOf('medium');
    expect(idx1).toBeLessThan(idx2);
  });
});
