import { describe, it, expect } from 'vitest';
import { renderBudgetDisplay } from '../../src/visibility/budget.js';
import type { WindowStatus } from '../../src/tracker/types.js';
import type { Metrics } from '../../src/types/index.js';

// ─── stripAnsi helper ───────────────────────────────────────────

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

// ─── Test Helpers ───────────────────────────────────────────────

function makeWindowStatus(overrides: Partial<WindowStatus> = {}): WindowStatus {
  const budget = overrides.budget ?? 44000;
  const tokensConsumed = overrides.tokensConsumed ?? 18200;
  const remaining = budget - tokensConsumed;
  const percentUsed = budget > 0 ? tokensConsumed / budget : 0;

  return {
    windowId: 'w_test',
    startedAt: overrides.startedAt ?? '2026-03-05T09:00:00Z',
    expiresAt: overrides.expiresAt ?? '2026-03-05T14:00:00Z',
    tokensConsumed,
    budget,
    remaining,
    percentUsed,
    tasksCompleted: overrides.tasksCompleted ?? 14,
    timeRemainingMs: overrides.timeRemainingMs ?? 7_920_000, // 2h 12m
    isExpired: overrides.isExpired ?? false,
    estimatedResetAt: overrides.expiresAt ?? '2026-03-05T14:00:00Z',
  };
}

function makeMetrics(): Metrics {
  return {
    schemaVersion: '1.0.0',
    overall: {
      totalTasks: 14,
      totalSessions: 1,
      avgPrecision: 0.82,
      avgRecall: 0.76,
      totalTokensConsumed: 18200,
      totalTokensSaved: 10000,
      savingsRate: 0.35,
    },
    perDomain: {
      'api-routes': {
        totalTasks: 5,
        avgPrecision: 0.85,
        avgRecall: 0.80,
        totalTokensConsumed: 6200,
        totalTokensSaved: 3000,
      },
      'ui-components': {
        totalTasks: 5,
        avgPrecision: 0.78,
        avgRecall: 0.72,
        totalTokensConsumed: 5800,
        totalTokensSaved: 3500,
      },
      'utils': {
        totalTasks: 4,
        avgPrecision: 0.90,
        avgRecall: 0.85,
        totalTokensConsumed: 6200,
        totalTokensSaved: 3500,
      },
    },
    windows: [],
    predictionTrend: [],
  };
}

// ─── renderBudgetDisplay ────────────────────────────────────────

describe('renderBudgetDisplay', () => {
  it('renders budget display with all sections', () => {
    const ws = makeWindowStatus();
    const estimate = { humanReadable: '2h 12m' };
    const estTasks = 8;
    const metrics = makeMetrics();

    const result = renderBudgetDisplay(ws, estimate, estTasks, metrics);
    const stripped = stripAnsi(result);

    expect(stripped).toContain('Token Budget');
    expect(stripped).toContain('Window');
    expect(stripped).toContain('2h 12m remaining');
    expect(stripped).toContain('used');
    expect(stripped).toContain('Remaining');
    expect(stripped).toContain('Est. tasks remaining');
    expect(stripped).toContain('Window resets');
  });

  it('renders session breakdown when metrics have domain data', () => {
    const ws = makeWindowStatus();
    const estimate = { humanReadable: '2h 12m' };
    const metrics = makeMetrics();

    const result = renderBudgetDisplay(ws, estimate, 8, metrics);
    const stripped = stripAnsi(result);

    expect(stripped).toContain('Session breakdown');
    expect(stripped).toContain('api-routes');
    expect(stripped).toContain('ui-components');
    expect(stripped).toContain('utils');
  });

  it('renders without session breakdown when no metrics', () => {
    const ws = makeWindowStatus({ tasksCompleted: 0, tokensConsumed: 0 });
    const estimate = { humanReadable: '5h' };

    const result = renderBudgetDisplay(ws, estimate, 0, null);
    const stripped = stripAnsi(result);

    expect(stripped).toContain('Token Budget');
    expect(stripped).not.toContain('Session breakdown');
  });

  it('omits estimated tasks when no tasks completed', () => {
    const ws = makeWindowStatus({ tasksCompleted: 0, tokensConsumed: 0 });
    const estimate = { humanReadable: '5h' };

    const result = renderBudgetDisplay(ws, estimate, 0, null);
    const stripped = stripAnsi(result);

    expect(stripped).not.toContain('Est. tasks remaining');
  });
});
