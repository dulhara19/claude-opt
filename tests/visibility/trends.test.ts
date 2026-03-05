import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gatherTrendsData, renderTrends } from '../../src/visibility/stats.js';
import { drawLineChart } from '../../src/visibility/formatters.js';
import type { TrendsDisplayData } from '../../src/visibility/types.js';

// ─── Mock store ─────────────────────────────────────────────────

vi.mock('../../src/store/index.js', () => ({
  readTaskHistory: vi.fn(),
  readMetrics: vi.fn(),
  readPatterns: vi.fn(),
}));

import { readTaskHistory, readMetrics } from '../../src/store/index.js';

const mockReadTaskHistory = vi.mocked(readTaskHistory);
const mockReadMetrics = vi.mocked(readMetrics);

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

function makeTasks(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `task_${String(i).padStart(3, '0')}`,
    timestamp: `2026-03-${String(1 + Math.floor(i / 5)).padStart(2, '0')}T${String(10 + (i % 5)).padStart(2, '0')}:00:00Z`,
    taskText: `task ${i}`,
    classification: { taskType: 'Feature', complexity: 'Medium', confidence: 0.8 },
    prediction: {
      predictedFiles: [`src/mod${i % 3}/file${i}.ts`],
      actualFiles: [`src/mod${i % 3}/file${i}.ts`],
      precision: 0.5 + (i / count) * 0.4,
      recall: 0.45 + (i / count) * 0.35,
    },
    routing: { model: i % 2 === 0 ? 'haiku' : 'sonnet', reason: 'test' },
    tokens: { consumed: 500 + i * 10, budgeted: 1000, saved: 300 + i * 5 },
    feedback: null,
  }));
}

// ─── gatherTrendsData ───────────────────────────────────────────

describe('gatherTrendsData', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns hasEnoughData=false when fewer than 5 tasks', () => {
    mockReadTaskHistory.mockReturnValue({
      ok: true,
      value: { schemaVersion: '1.0.0', cap: 500, count: 3, oldestArchive: null, tasks: makeTasks(3) },
    });
    mockReadMetrics.mockReturnValue({ ok: false, error: 'not found' });

    const result = gatherTrendsData('/test');
    expect(result.hasEnoughData).toBe(false);
    expect(result.taskCount).toBe(3);
  });

  it('returns hasEnoughData=false when task history not available', () => {
    mockReadTaskHistory.mockReturnValue({ ok: false, error: 'not found' });
    mockReadMetrics.mockReturnValue({ ok: false, error: 'not found' });

    const result = gatherTrendsData('/test');
    expect(result.hasEnoughData).toBe(false);
    expect(result.taskCount).toBe(0);
  });

  it('returns trends data with 20+ tasks', () => {
    mockReadTaskHistory.mockReturnValue({
      ok: true,
      value: { schemaVersion: '1.0.0', cap: 500, count: 25, oldestArchive: null, tasks: makeTasks(25) },
    });
    mockReadMetrics.mockReturnValue({ ok: false, error: 'not found' });

    const result = gatherTrendsData('/test');
    expect(result.hasEnoughData).toBe(true);
    expect(result.taskCount).toBe(25);
    expect(result.sessionAccuracies).toBeDefined();
    expect(result.sessionAccuracies!.length).toBeGreaterThan(0);
    expect(result.cumulativeSavings).toBeDefined();
    expect(result.cumulativeSavings!.length).toBeGreaterThan(0);
    expect(result.domainBreakdown).toBeDefined();
  });

  it('session accuracies show improving precision', () => {
    mockReadTaskHistory.mockReturnValue({
      ok: true,
      value: { schemaVersion: '1.0.0', cap: 500, count: 20, oldestArchive: null, tasks: makeTasks(20) },
    });
    mockReadMetrics.mockReturnValue({ ok: false, error: 'not found' });

    const result = gatherTrendsData('/test');
    expect(result.hasEnoughData).toBe(true);
    const accuracies = result.sessionAccuracies!;
    // Later sessions should have higher precision (our test data is designed this way)
    if (accuracies.length > 1) {
      expect(accuracies[accuracies.length - 1].precision).toBeGreaterThan(accuracies[0].precision);
    }
  });

  it('cumulative savings increase over time', () => {
    mockReadTaskHistory.mockReturnValue({
      ok: true,
      value: { schemaVersion: '1.0.0', cap: 500, count: 15, oldestArchive: null, tasks: makeTasks(15) },
    });
    mockReadMetrics.mockReturnValue({ ok: false, error: 'not found' });

    const result = gatherTrendsData('/test');
    expect(result.hasEnoughData).toBe(true);
    const savings = result.cumulativeSavings!;
    for (let i = 1; i < savings.length; i++) {
      expect(savings[i].totalSaved).toBeGreaterThanOrEqual(savings[i - 1].totalSaved);
    }
  });
});

// ─── renderTrends ───────────────────────────────────────────────

describe('renderTrends', () => {
  it('renders insufficient data message', () => {
    const data: TrendsDisplayData = { hasEnoughData: false, taskCount: 3 };
    const result = renderTrends(data);
    const stripped = stripAnsi(result);
    expect(stripped).toContain('Need at least 5 completed tasks');
    expect(stripped).toContain('Currently: 3 tasks');
  });

  it('renders trends display with chart and breakdown', () => {
    const data: TrendsDisplayData = {
      hasEnoughData: true,
      taskCount: 25,
      sessionAccuracies: [
        { sessionLabel: 's1', precision: 0.5, recall: 0.45, taskCount: 5 },
        { sessionLabel: 's2', precision: 0.6, recall: 0.55, taskCount: 5 },
        { sessionLabel: 's3', precision: 0.7, recall: 0.65, taskCount: 5 },
        { sessionLabel: 's4', precision: 0.8, recall: 0.75, taskCount: 5 },
        { sessionLabel: 's5', precision: 0.85, recall: 0.80, taskCount: 5 },
      ],
      cumulativeSavings: [
        { sessionLabel: 's1', totalSaved: 1500 },
        { sessionLabel: 's2', totalSaved: 3200 },
        { sessionLabel: 's3', totalSaved: 5100 },
        { sessionLabel: 's4', totalSaved: 7200 },
        { sessionLabel: 's5', totalSaved: 9500 },
      ],
      domainBreakdown: [
        { name: 'auth', accuracy: 0.85, taskCount: 10 },
        { name: 'api', accuracy: 0.78, taskCount: 8 },
      ],
    };

    const result = renderTrends(data);
    const stripped = stripAnsi(result);
    expect(stripped).toContain('Accuracy Trends');
    expect(stripped).toContain('Prediction Accuracy Over Time');
    expect(stripped).toContain('Cumulative Token Savings');
    expect(stripped).toContain('9,500');
    expect(stripped).toContain('Per-Domain Accuracy');
    expect(stripped).toContain('auth');
    expect(stripped).toContain('api');
  });
});

// ─── drawLineChart ──────────────────────────────────────────────

describe('drawLineChart', () => {
  it('renders a chart with data points', () => {
    const data = [
      { label: 's1', value: 50 },
      { label: 's2', value: 60 },
      { label: 's3', value: 70 },
      { label: 's4', value: 80 },
      { label: 's5', value: 90 },
    ];
    const result = drawLineChart(data, { height: 5, yLabel: '%' });
    expect(result).toContain('%|');
    expect(result).toContain('\u25cf'); // data point
    expect(result).toContain('s1');
    expect(result).toContain('s5');
  });

  it('returns empty string for empty data', () => {
    expect(drawLineChart([], { height: 5 })).toBe('');
  });

  it('handles single data point', () => {
    const result = drawLineChart([{ label: 's1', value: 50 }], { height: 5 });
    expect(result).toContain('\u25cf');
    expect(result).toContain('s1');
  });
});
