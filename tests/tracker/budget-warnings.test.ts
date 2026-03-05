import { describe, it, expect } from 'vitest';
import type { WindowStatus } from '../../src/tracker/types.js';
import {
  checkBudget,
  estimateRemainingTasks,
  formatWarningMessage,
  renderInlineWarning,
  renderBlockingWarning,
  renderExhaustedWarning,
  formatNumber,
  formatPercent,
  renderProgressBar,
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

  it('returns "none" for 50% usage', () => {
    const ws = makeWindowStatus({ tokensConsumed: 22000 });
    const warning = checkBudget(ws, DEFAULT_THRESHOLDS);
    expect(warning.level).toBe('none');
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
