import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gatherStatsData, renderStats } from '../../src/visibility/stats.js';
import type { StatsDisplayData } from '../../src/visibility/types.js';

// ─── Mock store ─────────────────────────────────────────────────

vi.mock('../../src/store/index.js', () => ({
  readTaskHistory: vi.fn(),
  readMetrics: vi.fn(),
  readPatterns: vi.fn(),
}));

import { readTaskHistory, readMetrics, readPatterns } from '../../src/store/index.js';

const mockReadTaskHistory = vi.mocked(readTaskHistory);
const mockReadMetrics = vi.mocked(readMetrics);
const mockReadPatterns = vi.mocked(readPatterns);

// ─── stripAnsi helper ───────────────────────────────────────────

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

// ─── Test Helpers ───────────────────────────────────────────────

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: overrides.id ?? 'task_001',
    timestamp: '2026-03-05T10:00:00Z',
    taskText: 'test task',
    classification: {
      taskType: (overrides.taskType as string) ?? 'Feature',
      complexity: 'Medium',
      confidence: 0.8,
    },
    prediction: {
      predictedFiles: (overrides.predictedFiles as string[]) ?? ['src/utils/index.ts'],
      actualFiles: ['src/utils/index.ts'],
      precision: (overrides.precision as number) ?? 0.82,
      recall: (overrides.recall as number) ?? 0.76,
    },
    routing: {
      model: (overrides.model as string) ?? 'haiku',
      reason: 'low complexity',
    },
    tokens: {
      consumed: (overrides.consumed as number) ?? 500,
      budgeted: 1000,
      saved: (overrides.saved as number) ?? 500,
    },
    feedback: null,
  };
}

function makeMetrics() {
  return {
    schemaVersion: '1.0.0',
    overall: {
      totalTasks: 10,
      totalSessions: 3,
      avgPrecision: 0.82,
      avgRecall: 0.76,
      totalTokensConsumed: 5000,
      totalTokensSaved: 3400,
      savingsRate: 0.405,
    },
    perDomain: {},
    windows: [],
    predictionTrend: [],
  };
}

// ─── gatherStatsData ────────────────────────────────────────────

describe('gatherStatsData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns isEmpty when task history is empty', () => {
    mockReadTaskHistory.mockReturnValue({
      ok: true,
      value: { schemaVersion: '1.0.0', cap: 500, count: 0, oldestArchive: null, tasks: [] },
    });
    mockReadMetrics.mockReturnValue({ ok: false, error: 'not found' });
    mockReadPatterns.mockReturnValue({ ok: false, error: 'not found' });

    const result = gatherStatsData('/test');
    expect(result.isEmpty).toBe(true);
  });

  it('returns isEmpty when task history read fails', () => {
    mockReadTaskHistory.mockReturnValue({ ok: false, error: 'not found' });
    mockReadMetrics.mockReturnValue({ ok: false, error: 'not found' });

    const result = gatherStatsData('/test');
    expect(result.isEmpty).toBe(true);
  });

  it('calculates stats from task history', () => {
    mockReadTaskHistory.mockReturnValue({
      ok: true,
      value: {
        schemaVersion: '1.0.0',
        cap: 500,
        count: 3,
        oldestArchive: null,
        tasks: [
          makeTask({ id: 'task_001', precision: 0.8, recall: 0.7, consumed: 500, saved: 500, model: 'haiku' }),
          makeTask({ id: 'task_002', precision: 0.9, recall: 0.85, consumed: 600, saved: 400, model: 'sonnet' }),
          makeTask({ id: 'task_003', precision: 0.76, recall: 0.72, consumed: 400, saved: 600, model: 'haiku' }),
        ],
      },
    });
    mockReadMetrics.mockReturnValue({ ok: true, value: makeMetrics() });
    mockReadPatterns.mockReturnValue({ ok: false, error: 'not found' });

    const result = gatherStatsData('/test');
    expect(result.isEmpty).toBe(false);
    expect(result.totalTasks).toBe(3);
    expect(result.precision).toBeCloseTo(0.82, 1);
    expect(result.recall).toBeCloseTo(0.757, 1);
    expect(result.totalTokensSaved).toBe(1500);
    expect(result.modelUsage).toBeDefined();
    expect(result.modelUsage!.length).toBe(2);
    expect(result.domains).toBeDefined();
    expect(result.domains!.length).toBeGreaterThan(0);
  });

  it('filters by domain when option provided', () => {
    mockReadTaskHistory.mockReturnValue({
      ok: true,
      value: {
        schemaVersion: '1.0.0',
        cap: 500,
        count: 2,
        oldestArchive: null,
        tasks: [
          makeTask({ id: 'task_001', taskType: 'Feature', predictedFiles: ['src/api/routes.ts'] }),
          makeTask({ id: 'task_002', taskType: 'BugFix', predictedFiles: ['src/utils/helper.ts'] }),
        ],
      },
    });
    mockReadMetrics.mockReturnValue({ ok: false, error: 'not found' });

    const result = gatherStatsData('/test', { domain: 'api' });
    // Should filter to tasks with 'api' in file paths
    expect(result.isEmpty).toBe(false);
    expect(result.totalTasks).toBe(1);
  });
});

// ─── renderStats ────────────────────────────────────────────────

describe('renderStats', () => {
  it('renders empty state message when no data', () => {
    const result = renderStats({ isEmpty: true });
    const stripped = stripAnsi(result);
    expect(stripped).toContain('No tasks completed yet');
    expect(stripped).toContain('co "your task"');
  });

  it('renders full dashboard with stats data', () => {
    const data: StatsDisplayData = {
      isEmpty: false,
      totalTasks: 47,
      totalSessions: 12,
      totalDomains: 6,
      precision: 0.82,
      recall: 0.76,
      totalTokensSaved: 34200,
      savingsRate: 0.546,
      avgSavingsPerTask: 728,
      modelUsage: [
        { model: 'Haiku', taskCount: 24, percentage: 0.51 },
        { model: 'Sonnet', taskCount: 21, percentage: 0.45 },
        { model: 'Opus', taskCount: 2, percentage: 0.04 },
      ],
      domains: [
        { name: 'learning-engine', accuracy: 0.89, taskCount: 10 },
        { name: 'ui-components', accuracy: 0.84, taskCount: 8 },
        { name: 'api-routes', accuracy: 0.78, taskCount: 15 },
        { name: 'thesis-ch3', accuracy: 0.75, taskCount: 5 },
      ],
    };

    const result = renderStats(data);
    const stripped = stripAnsi(result);

    expect(stripped).toContain('claude-opt Stats');
    expect(stripped).toContain('Total tasks: 47');
    expect(stripped).toContain('Sessions: 12');
    expect(stripped).toContain('Domains: 6');
    expect(stripped).toContain('Prediction Accuracy');
    expect(stripped).toContain('82%');
    expect(stripped).toContain('76%');
    expect(stripped).toContain('Token Savings');
    expect(stripped).toContain('34,200 tokens');
    expect(stripped).toContain('55%'); // 54.6% rounds to 55%
    expect(stripped).toContain('728 tokens saved');
    expect(stripped).toContain('Model Usage');
    expect(stripped).toContain('Haiku');
    expect(stripped).toContain('Sonnet');
    expect(stripped).toContain('Top Domains by Accuracy');
    expect(stripped).toContain('learning-engine');
    expect(stripped).toContain('api-routes');
  });
});
