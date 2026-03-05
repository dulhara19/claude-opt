import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gatherKnowledgeData, renderKnowledge, listAvailableDomains } from '../../src/visibility/knowledge.js';
import type { KnowledgeDisplayData } from '../../src/visibility/types.js';

// ─── Mock store ─────────────────────────────────────────────────

vi.mock('../../src/store/index.js', () => ({
  readProjectMap: vi.fn(),
  readPatterns: vi.fn(),
  readTaskHistory: vi.fn(),
  readMetrics: vi.fn(),
}));

import { readProjectMap, readPatterns, readTaskHistory, readMetrics } from '../../src/store/index.js';

const mockReadProjectMap = vi.mocked(readProjectMap);
const mockReadPatterns = vi.mocked(readPatterns);
const mockReadTaskHistory = vi.mocked(readTaskHistory);
const mockReadMetrics = vi.mocked(readMetrics);

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

// ─── Test data ──────────────────────────────────────────────────

function makeProjectMap() {
  return {
    schemaVersion: '1.0.0',
    scannedAt: '2026-03-05T10:00:00Z',
    scanType: 'full',
    projectType: 'typescript',
    totalFiles: 10,
    files: {
      'src/auth/login.ts': { path: 'src/auth/login.ts', size: 500, contentHash: 'abc', lastModified: '2026-03-05', language: 'typescript', domain: 'auth', imports: [], exports: [], keywords: ['auth', 'login'] },
      'src/auth/session.ts': { path: 'src/auth/session.ts', size: 300, contentHash: 'def', lastModified: '2026-03-05', language: 'typescript', domain: 'auth', imports: [], exports: [], keywords: ['auth', 'session'] },
      'src/utils/helper.ts': { path: 'src/utils/helper.ts', size: 200, contentHash: 'ghi', lastModified: '2026-03-05', language: 'typescript', domain: 'utils', imports: [], exports: [], keywords: ['utils'] },
    },
    domains: {
      auth: ['src/auth/login.ts', 'src/auth/session.ts'],
      utils: ['src/utils/helper.ts'],
    },
    ignoredPatterns: [],
  };
}

function makePatterns() {
  return {
    schemaVersion: '1.0.0',
    coOccurrences: [
      { files: ['src/auth/login.ts', 'src/auth/session.ts'] as [string, string], count: 5, confidence: 0.89 },
    ],
    typeAffinities: {},
    conventions: [
      { pattern: 'confidence-float', description: 'confidence is a 0-1 float', examples: [] },
    ],
  };
}

function makeTaskHistory() {
  return {
    schemaVersion: '1.0.0',
    cap: 500,
    count: 5,
    oldestArchive: null,
    tasks: [
      {
        id: 'task_001', timestamp: '2026-03-05T10:00:00Z', taskText: 'fix auth',
        classification: { taskType: 'BugFix', complexity: 'Medium', confidence: 0.8 },
        prediction: { predictedFiles: ['src/auth/login.ts'], actualFiles: ['src/auth/login.ts'], precision: 0.85, recall: 0.80 },
        routing: { model: 'haiku', reason: 'simple fix' },
        tokens: { consumed: 500, budgeted: 1000, saved: 500 },
        feedback: null,
      },
      {
        id: 'task_002', timestamp: '2026-03-05T11:00:00Z', taskText: 'add session',
        classification: { taskType: 'Feature', complexity: 'Medium', confidence: 0.75 },
        prediction: { predictedFiles: ['src/auth/session.ts'], actualFiles: ['src/auth/session.ts'], precision: 0.90, recall: 0.85 },
        routing: { model: 'sonnet', reason: 'medium feature' },
        tokens: { consumed: 800, budgeted: 1500, saved: 700 },
        feedback: null,
      },
    ],
  };
}

function makeMetrics() {
  return {
    schemaVersion: '1.0.0',
    overall: { totalTasks: 5, totalSessions: 2, avgPrecision: 0.85, avgRecall: 0.80, totalTokensConsumed: 3000, totalTokensSaved: 2000, savingsRate: 0.4 },
    perDomain: {
      auth: { totalTasks: 3, avgPrecision: 0.87, avgRecall: 0.82, totalTokensConsumed: 2000, totalTokensSaved: 1500 },
      utils: { totalTasks: 2, avgPrecision: 0.80, avgRecall: 0.75, totalTokensConsumed: 1000, totalTokensSaved: 500 },
    },
    windows: [],
    predictionTrend: [],
  };
}

// ─── gatherKnowledgeData ────────────────────────────────────────

describe('gatherKnowledgeData', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns domain data when domain exists in project map', () => {
    mockReadProjectMap.mockReturnValue({ ok: true, value: makeProjectMap() });
    mockReadPatterns.mockReturnValue({ ok: true, value: makePatterns() });
    mockReadTaskHistory.mockReturnValue({ ok: true, value: makeTaskHistory() });
    mockReadMetrics.mockReturnValue({ ok: true, value: makeMetrics() });

    const result = gatherKnowledgeData('/test', 'auth');
    expect(result.isDomainFound).toBe(true);
    expect(result.domain).toBe('auth');
    expect(result.files).toBeDefined();
    expect(result.files!.length).toBe(2);
    expect(result.patterns).toBeDefined();
    expect(result.patterns!.length).toBe(1);
    expect(result.conventions).toBeDefined();
    expect(result.health).toBeDefined();
    expect(result.health!.dots).toBeGreaterThanOrEqual(1);
    expect(result.health!.dots).toBeLessThanOrEqual(5);
  });

  it('returns isDomainFound=false for nonexistent domain', () => {
    mockReadProjectMap.mockReturnValue({ ok: true, value: makeProjectMap() });
    mockReadPatterns.mockReturnValue({ ok: true, value: makePatterns() });
    mockReadTaskHistory.mockReturnValue({ ok: true, value: makeTaskHistory() });
    mockReadMetrics.mockReturnValue({ ok: true, value: makeMetrics() });

    const result = gatherKnowledgeData('/test', 'nonexistent');
    expect(result.isDomainFound).toBe(false);
    expect(result.availableDomains).toBeDefined();
    expect(result.availableDomains!.length).toBeGreaterThan(0);
  });

  it('sorts files by weight descending', () => {
    mockReadProjectMap.mockReturnValue({ ok: true, value: makeProjectMap() });
    mockReadPatterns.mockReturnValue({ ok: false, error: 'not found' });
    mockReadTaskHistory.mockReturnValue({ ok: true, value: makeTaskHistory() });
    mockReadMetrics.mockReturnValue({ ok: false, error: 'not found' });

    const result = gatherKnowledgeData('/test', 'auth');
    expect(result.isDomainFound).toBe(true);
    if (result.files && result.files.length > 1) {
      expect(result.files[0].weight).toBeGreaterThanOrEqual(result.files[1].weight);
    }
  });
});

// ─── listAvailableDomains ───────────────────────────────────────

describe('listAvailableDomains', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists domains from project map and metrics', () => {
    mockReadProjectMap.mockReturnValue({ ok: true, value: makeProjectMap() });
    mockReadMetrics.mockReturnValue({ ok: true, value: makeMetrics() });

    const result = listAvailableDomains('/test');
    expect(result.length).toBeGreaterThan(0);
    expect(result.some((d) => d.name === 'auth')).toBe(true);
  });

  it('returns empty when no data available', () => {
    mockReadProjectMap.mockReturnValue({ ok: false, error: 'not found' });
    mockReadMetrics.mockReturnValue({ ok: false, error: 'not found' });

    const result = listAvailableDomains('/test');
    expect(result).toEqual([]);
  });
});

// ─── renderKnowledge ────────────────────────────────────────────

describe('renderKnowledge', () => {
  it('renders domain-not-found with available domains', () => {
    const data: KnowledgeDisplayData = {
      isDomainFound: false,
      domain: 'nonexistent',
      availableDomains: [
        { name: 'auth', taskCount: 5, accuracy: 0.85 },
        { name: 'utils', taskCount: 3, accuracy: 0.80 },
      ],
    };
    const result = renderKnowledge(data);
    const stripped = stripAnsi(result);
    expect(stripped).toContain('not found');
    expect(stripped).toContain('auth');
    expect(stripped).toContain('utils');
  });

  it('renders full knowledge display', () => {
    const data: KnowledgeDisplayData = {
      isDomainFound: true,
      domain: 'auth',
      files: [
        { path: 'src/auth/login.ts', weight: 0.92, timesSeen: 12 },
        { path: 'src/auth/session.ts', weight: 0.65, timesSeen: 7 },
      ],
      patterns: [
        { files: ['login.ts', 'session.ts'], confidence: 0.89 },
      ],
      conventions: ['confidence is a 0-1 float'],
      precision: 0.89,
      recall: 0.81,
      taskCount: 12,
      health: { score: 0.8, dots: 4, label: 'Very Good' },
    };
    const result = renderKnowledge(data);
    const stripped = stripAnsi(result);
    expect(stripped).toContain('Knowledge: auth');
    expect(stripped).toContain('Files (2)');
    expect(stripped).toContain('login.ts');
    expect(stripped).toContain('0.92');
    expect(stripped).toContain('Patterns (1)');
    expect(stripped).toContain('co-occur');
    expect(stripped).toContain('Conventions');
    expect(stripped).toContain('confidence is a 0-1 float');
    expect(stripped).toContain('89% precision');
    expect(stripped).toContain('81% recall');
    expect(stripped).toContain('Very Good');
  });

  it('renders files-only when option set', () => {
    const data: KnowledgeDisplayData = {
      isDomainFound: true,
      domain: 'auth',
      files: [{ path: 'src/auth/login.ts', weight: 0.92, timesSeen: 12 }],
      patterns: [{ files: ['login.ts', 'session.ts'], confidence: 0.89 }],
      conventions: ['test convention'],
      precision: 0.89,
      recall: 0.81,
      taskCount: 12,
      health: { score: 0.8, dots: 4, label: 'Very Good' },
    };
    const result = renderKnowledge(data, { filesOnly: true });
    const stripped = stripAnsi(result);
    expect(stripped).toContain('Files');
    expect(stripped).not.toContain('Patterns');
    expect(stripped).not.toContain('Conventions');
  });

  it('renders patterns-only when option set', () => {
    const data: KnowledgeDisplayData = {
      isDomainFound: true,
      domain: 'auth',
      files: [{ path: 'src/auth/login.ts', weight: 0.92, timesSeen: 12 }],
      patterns: [{ files: ['login.ts', 'session.ts'], confidence: 0.89 }],
      conventions: ['test convention'],
      precision: 0.89,
      recall: 0.81,
      taskCount: 12,
      health: { score: 0.8, dots: 4, label: 'Very Good' },
    };
    const result = renderKnowledge(data, { patternsOnly: true });
    const stripped = stripAnsi(result);
    expect(stripped).not.toContain('Files');
    expect(stripped).toContain('Patterns');
  });
});
