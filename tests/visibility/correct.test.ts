import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  DetailedFeedback,
  ModelCorrection,
  CorrectionContext,
  FeedbackResult,
} from '../../src/visibility/types.js';
import {
  loadCorrectionContext,
  applyDetailedCorrection,
  recordFeedback,
} from '../../src/visibility/feedback.js';

// ─── Shared mock for store module ───────────────────────────────

const storeMock = vi.hoisted(() => ({
  readTaskHistory: vi.fn(),
  writeTaskHistory: vi.fn(),
  readKeywordIndex: vi.fn(),
  writeKeywordIndex: vi.fn(),
  readPatterns: vi.fn(),
  writePatterns: vi.fn(),
  readProjectMap: vi.fn(),
  readMetrics: vi.fn(),
  writeMetrics: vi.fn(),
}));

vi.mock('../../src/store/index.js', () => storeMock);

// ─── Helpers ────────────────────────────────────────────────────

function makeHistory(tasks: Array<{
  id: string;
  taskText?: string;
  predictedFiles?: string[];
  actualFiles?: string[];
  precision?: number;
  recall?: number;
  model?: string;
  taskType?: string;
  feedback?: unknown;
}>) {
  return {
    schemaVersion: '1.0.0',
    cap: 500,
    count: tasks.length,
    oldestArchive: null,
    tasks: tasks.map((t) => ({
      id: t.id,
      timestamp: new Date().toISOString(),
      taskText: t.taskText ?? 'test task',
      classification: { taskType: t.taskType ?? 'feature', complexity: 'medium', confidence: 0.8 },
      prediction: {
        predictedFiles: t.predictedFiles ?? ['src/a.ts', 'src/b.ts'],
        actualFiles: t.actualFiles ?? ['src/a.ts', 'src/c.ts'],
        precision: t.precision ?? 0.5,
        recall: t.recall ?? 0.5,
      },
      routing: { model: t.model ?? 'sonnet', reason: 'default' },
      tokens: { consumed: 1000, budgeted: 2000, saved: 500 },
      feedback: t.feedback ?? null,
    })),
  };
}

function makePatterns(typeAffinities?: Record<string, unknown>) {
  return {
    schemaVersion: '1.0.0',
    coOccurrences: [],
    typeAffinities: typeAffinities ?? {},
    conventions: [],
  };
}

// ─── Type definition tests ──────────────────────────────────────

describe('Detailed correction types', () => {
  it('DetailedFeedback has expected shape with all fields', () => {
    const feedback: DetailedFeedback = {
      source: 'cli-correct',
      rating: 'bad',
      details: 'missed important files',
      missedFiles: ['src/config.ts', 'src/constants.ts'],
      wrongFiles: ['src/old-file.ts'],
      modelCorrection: { direction: 'too-weak', suggested: 'sonnet' },
    };
    expect(feedback.source).toBe('cli-correct');
    expect(feedback.rating).toBe('bad');
    expect(feedback.missedFiles).toHaveLength(2);
    expect(feedback.wrongFiles).toHaveLength(1);
    expect(feedback.modelCorrection?.direction).toBe('too-weak');
  });

  it('DetailedFeedback works with minimal fields', () => {
    const feedback: DetailedFeedback = {
      source: 'cli-correct',
      rating: 'bad',
      details: 'Everything was off for this task',
    };
    expect(feedback.source).toBe('cli-correct');
    expect(feedback.missedFiles).toBeUndefined();
    expect(feedback.wrongFiles).toBeUndefined();
    expect(feedback.modelCorrection).toBeUndefined();
  });

  it('DetailedFeedback works with only file corrections', () => {
    const feedback: DetailedFeedback = {
      source: 'cli-correct',
      rating: 'bad',
      missedFiles: ['src/config.ts'],
    };
    expect(feedback.details).toBeUndefined();
    expect(feedback.missedFiles).toEqual(['src/config.ts']);
  });

  it('ModelCorrection has direction and optional suggested', () => {
    const mc1: ModelCorrection = { direction: 'too-weak', suggested: 'opus' };
    const mc2: ModelCorrection = { direction: 'too-strong' };
    expect(mc1.suggested).toBe('opus');
    expect(mc2.suggested).toBeUndefined();
  });

  it('CorrectionContext has expected shape', () => {
    const ctx: CorrectionContext = {
      taskId: 't_001',
      description: 'add feature',
      predictedFiles: ['src/a.ts'],
      actualFiles: ['src/a.ts', 'src/b.ts'],
      precision: 1.0,
      recall: 0.5,
      modelUsed: 'sonnet',
      existingFeedback: null,
    };
    expect(ctx.taskId).toBe('t_001');
    expect(ctx.existingFeedback).toBeNull();
  });

  it('FeedbackResult union includes DetailedFeedback', () => {
    const result: FeedbackResult = {
      source: 'cli-correct',
      rating: 'bad',
      missedFiles: ['src/x.ts'],
    };
    expect(result).not.toBeNull();
    if (result && result.source === 'cli-correct') {
      expect(result.missedFiles).toEqual(['src/x.ts']);
    }
  });
});

// ─── loadCorrectionContext tests ─────────────────────────────────

describe('loadCorrectionContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads context for the most recent task', () => {
    const history = makeHistory([
      { id: 't_001', taskText: 'first task' },
      { id: 't_002', taskText: 'add confidence decay', predictedFiles: ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts'], actualFiles: ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/e.ts', 'src/f.ts'], precision: 0.75, recall: 0.6 },
    ]);
    storeMock.readTaskHistory.mockReturnValue({ ok: true, value: history });

    const result = loadCorrectionContext('/proj');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.taskId).toBe('t_002');
    expect(result.value.description).toBe('add confidence decay');
    expect(result.value.precision).toBe(0.75);
    expect(result.value.recall).toBe(0.6);
    expect(result.value.predictedFiles).toHaveLength(4);
    expect(result.value.actualFiles).toHaveLength(5);
  });

  it('loads context for a specific task by ID', () => {
    const history = makeHistory([
      { id: 't_001', taskText: 'first task', model: 'haiku' },
      { id: 't_002', taskText: 'second task' },
    ]);
    storeMock.readTaskHistory.mockReturnValue({ ok: true, value: history });

    const result = loadCorrectionContext('/proj', 't_001');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.taskId).toBe('t_001');
    expect(result.value.modelUsed).toBe('haiku');
  });

  it('returns error when no tasks in history', () => {
    storeMock.readTaskHistory.mockReturnValue({ ok: true, value: makeHistory([]) });

    const result = loadCorrectionContext('/proj');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('No recent task to correct. Run a task first.');
  });

  it('returns error when specified task not found', () => {
    storeMock.readTaskHistory.mockReturnValue({ ok: true, value: makeHistory([{ id: 't_001' }]) });

    const result = loadCorrectionContext('/proj', 't_999');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('Task not found: t_999');
  });

  it('returns error when task history is unreadable', () => {
    storeMock.readTaskHistory.mockReturnValue({ ok: false, error: 'File not found' });

    const result = loadCorrectionContext('/proj');
    expect(result.ok).toBe(false);
  });

  it('includes existing feedback in context', () => {
    const existingFeedback = { source: 'inline', rating: 'bad', quickReason: 'missed-files' };
    const history = makeHistory([{ id: 't_001', feedback: existingFeedback }]);
    storeMock.readTaskHistory.mockReturnValue({ ok: true, value: history });

    const result = loadCorrectionContext('/proj', 't_001');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.existingFeedback).toEqual(existingFeedback);
  });
});

// ─── applyDetailedCorrection tests ──────────────────────────────

describe('applyDetailedCorrection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const baseContext: CorrectionContext = {
    taskId: 't_001',
    description: 'test task',
    predictedFiles: ['src/a.ts', 'src/b.ts'],
    actualFiles: ['src/a.ts', 'src/c.ts'],
    precision: 0.5,
    recall: 0.5,
    modelUsed: 'sonnet',
    existingFeedback: null,
  };

  it('boosts missed files in patterns.json typeAffinities', () => {
    const patterns = makePatterns({
      feature: {
        taskType: 'feature',
        files: ['src/existing.ts'],
        confidence: 0.5,
        fileWeights: { 'src/existing.ts': { weight: 0.5, occurrences: 2 } },
      },
    });
    const history = makeHistory([{ id: 't_001', taskType: 'feature' }]);
    storeMock.readPatterns.mockReturnValue({ ok: true, value: patterns });
    storeMock.writePatterns.mockReturnValue({ ok: true, value: undefined });
    storeMock.readTaskHistory.mockReturnValue({ ok: true, value: history });

    const feedback: DetailedFeedback = {
      source: 'cli-correct',
      rating: 'bad',
      missedFiles: ['src/config.ts'],
    };

    const result = applyDetailedCorrection(feedback, baseContext, '/proj');
    expect(result.ok).toBe(true);

    // Verify the file was boosted
    const affinity = patterns.typeAffinities.feature;
    expect(affinity.fileWeights!['src/config.ts'].weight).toBe(0.5); // 0.3 (default) + 0.2
    expect(affinity.fileWeights!['src/config.ts'].occurrences).toBe(1);
    expect(affinity.files).toContain('src/config.ts');
    // FB9: writePatterns called twice — once for weight correction, once for co-occurrence boost
    expect(storeMock.writePatterns).toHaveBeenCalled();
  });

  it('decays wrong files in patterns.json typeAffinities', () => {
    const patterns = makePatterns({
      feature: {
        taskType: 'feature',
        files: ['src/old-file.ts'],
        confidence: 0.5,
        fileWeights: { 'src/old-file.ts': { weight: 0.8, occurrences: 5 } },
      },
    });
    const history = makeHistory([{ id: 't_001', taskType: 'feature' }]);
    storeMock.readPatterns.mockReturnValue({ ok: true, value: patterns });
    storeMock.writePatterns.mockReturnValue({ ok: true, value: undefined });
    storeMock.readTaskHistory.mockReturnValue({ ok: true, value: history });

    const feedback: DetailedFeedback = {
      source: 'cli-correct',
      rating: 'bad',
      wrongFiles: ['src/old-file.ts'],
    };

    const result = applyDetailedCorrection(feedback, baseContext, '/proj');
    expect(result.ok).toBe(true);

    expect(patterns.typeAffinities.feature.fileWeights!['src/old-file.ts'].weight).toBeCloseTo(0.6, 10); // 0.8 - 0.2
    expect(storeMock.writePatterns).toHaveBeenCalledOnce();
  });

  it('does not decay below 0.0', () => {
    const patterns = makePatterns({
      feature: {
        taskType: 'feature',
        files: ['src/low.ts'],
        confidence: 0.5,
        fileWeights: { 'src/low.ts': { weight: 0.1, occurrences: 1 } },
      },
    });
    const history = makeHistory([{ id: 't_001', taskType: 'feature' }]);
    storeMock.readPatterns.mockReturnValue({ ok: true, value: patterns });
    storeMock.writePatterns.mockReturnValue({ ok: true, value: undefined });
    storeMock.readTaskHistory.mockReturnValue({ ok: true, value: history });

    const feedback: DetailedFeedback = {
      source: 'cli-correct',
      rating: 'bad',
      wrongFiles: ['src/low.ts'],
    };

    const result = applyDetailedCorrection(feedback, baseContext, '/proj');
    expect(result.ok).toBe(true);
    expect(patterns.typeAffinities.feature.fileWeights!['src/low.ts'].weight).toBe(0.0);
  });

  it('does not boost above 1.0', () => {
    const patterns = makePatterns({
      feature: {
        taskType: 'feature',
        files: ['src/high.ts'],
        confidence: 0.5,
        fileWeights: { 'src/high.ts': { weight: 0.95, occurrences: 10 } },
      },
    });
    const history = makeHistory([{ id: 't_001', taskType: 'feature' }]);
    storeMock.readPatterns.mockReturnValue({ ok: true, value: patterns });
    storeMock.writePatterns.mockReturnValue({ ok: true, value: undefined });
    storeMock.readTaskHistory.mockReturnValue({ ok: true, value: history });

    const feedback: DetailedFeedback = {
      source: 'cli-correct',
      rating: 'bad',
      missedFiles: ['src/high.ts'],
    };

    const result = applyDetailedCorrection(feedback, baseContext, '/proj');
    expect(result.ok).toBe(true);
    expect(patterns.typeAffinities.feature.fileWeights!['src/high.ts'].weight).toBe(1.0);
  });

  it('updates model routing for model correction', () => {
    const patterns = makePatterns();
    const history = makeHistory([{ id: 't_001', taskType: 'feature' }]);
    storeMock.readPatterns.mockReturnValue({ ok: true, value: patterns });
    storeMock.writePatterns.mockReturnValue({ ok: true, value: undefined });
    storeMock.readTaskHistory.mockReturnValue({ ok: true, value: history });
    storeMock.writeTaskHistory.mockReturnValue({ ok: true, value: undefined });
    // FB8: Metrics mock for model correction integration
    storeMock.readMetrics.mockReturnValue({ ok: true, value: { overall: {}, modelPerformance: {} } });
    storeMock.writeMetrics.mockReturnValue({ ok: true, value: undefined });

    const feedback: DetailedFeedback = {
      source: 'cli-correct',
      rating: 'bad',
      modelCorrection: { direction: 'too-weak', suggested: 'opus' },
    };

    const result = applyDetailedCorrection(feedback, baseContext, '/proj');
    expect(result.ok).toBe(true);

    // Verify routing was updated
    expect(history.tasks[0].routing.reason).toContain('manual-correction');
    expect(history.tasks[0].routing.reason).toContain('too-weak');
    expect(history.tasks[0].routing.reason).toContain('opus');
    expect(storeMock.writeTaskHistory).toHaveBeenCalled();
  });

  it('creates new type affinity when none exists for task type', () => {
    const patterns = makePatterns({});
    const history = makeHistory([{ id: 't_001', taskType: 'bugfix' }]);
    storeMock.readPatterns.mockReturnValue({ ok: true, value: patterns });
    storeMock.writePatterns.mockReturnValue({ ok: true, value: undefined });
    storeMock.readTaskHistory.mockReturnValue({ ok: true, value: history });

    const feedback: DetailedFeedback = {
      source: 'cli-correct',
      rating: 'bad',
      missedFiles: ['src/new.ts'],
    };

    const result = applyDetailedCorrection(feedback, baseContext, '/proj');
    expect(result.ok).toBe(true);

    expect(patterns.typeAffinities.bugfix).toBeDefined();
    expect(patterns.typeAffinities.bugfix.fileWeights!['src/new.ts'].weight).toBe(0.5); // 0.3 + 0.2
    expect(patterns.typeAffinities.bugfix.files).toContain('src/new.ts');
  });

  it('returns error when patterns unreadable', () => {
    storeMock.readPatterns.mockReturnValue({ ok: false, error: 'Corrupt' });

    const feedback: DetailedFeedback = {
      source: 'cli-correct',
      rating: 'bad',
      missedFiles: ['src/x.ts'],
    };

    const result = applyDetailedCorrection(feedback, baseContext, '/proj');
    expect(result.ok).toBe(false);
  });
});

// ─── recordFeedback with DetailedFeedback tests ─────────────────

describe('recordFeedback with DetailedFeedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('persists detailed feedback with all fields', () => {
    const history = makeHistory([{ id: 't_001' }]);
    storeMock.readTaskHistory.mockReturnValue({ ok: true, value: history });
    storeMock.writeTaskHistory.mockReturnValue({ ok: true, value: undefined });

    const feedback: DetailedFeedback = {
      source: 'cli-correct',
      rating: 'bad',
      details: 'missed critical files',
      missedFiles: ['src/config.ts'],
      wrongFiles: ['src/old.ts'],
      modelCorrection: { direction: 'too-weak', suggested: 'sonnet' },
    };

    const result = recordFeedback('/proj', 't_001', feedback);
    expect(result.ok).toBe(true);
    expect(history.tasks[0].feedback).toEqual(feedback);
    expect(storeMock.writeTaskHistory).toHaveBeenCalledOnce();
  });

  it('replaces existing feedback when recording new correction', () => {
    const history = makeHistory([{ id: 't_001', feedback: { source: 'inline', rating: 'good' } }]);
    storeMock.readTaskHistory.mockReturnValue({ ok: true, value: history });
    storeMock.writeTaskHistory.mockReturnValue({ ok: true, value: undefined });

    const feedback: DetailedFeedback = {
      source: 'cli-correct',
      rating: 'bad',
      missedFiles: ['src/new.ts'],
    };

    const result = recordFeedback('/proj', 't_001', feedback);
    expect(result.ok).toBe(true);
    expect(history.tasks[0].feedback?.source).toBe('cli-correct');
  });
});

// ─── Multi-option and edge case tests ───────────────────────────

describe('Correction edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles combined missed files + wrong files + model correction', () => {
    const patterns = makePatterns({
      feature: {
        taskType: 'feature',
        files: ['src/wrong.ts'],
        confidence: 0.5,
        fileWeights: { 'src/wrong.ts': { weight: 0.7, occurrences: 3 } },
      },
    });
    const history = makeHistory([{ id: 't_001', taskType: 'feature' }]);
    storeMock.readPatterns.mockReturnValue({ ok: true, value: patterns });
    storeMock.writePatterns.mockReturnValue({ ok: true, value: undefined });
    storeMock.readTaskHistory.mockReturnValue({ ok: true, value: history });
    storeMock.writeTaskHistory.mockReturnValue({ ok: true, value: undefined });
    storeMock.readMetrics.mockReturnValue({ ok: true, value: { overall: {}, modelPerformance: {} } });
    storeMock.writeMetrics.mockReturnValue({ ok: true, value: undefined });

    const feedback: DetailedFeedback = {
      source: 'cli-correct',
      rating: 'bad',
      missedFiles: ['src/missed.ts'],
      wrongFiles: ['src/wrong.ts'],
      modelCorrection: { direction: 'too-strong', suggested: 'haiku' },
    };

    const ctx: CorrectionContext = {
      taskId: 't_001',
      description: 'test',
      predictedFiles: ['src/wrong.ts'],
      actualFiles: ['src/missed.ts'],
      precision: 0,
      recall: 0,
      modelUsed: 'opus',
      existingFeedback: null,
    };

    const result = applyDetailedCorrection(feedback, ctx, '/proj');
    expect(result.ok).toBe(true);

    // FB5: Adaptive weights with precision=0, recall=0 → scale=0.5 → boost=0.1, decay=0.1
    // Missed file boosted: 0.3 + 0.1 = 0.4
    expect(patterns.typeAffinities.feature.fileWeights!['src/missed.ts'].weight).toBeCloseTo(0.4, 2);
    // Wrong file decayed: 0.7 - 0.1 = 0.6
    expect(patterns.typeAffinities.feature.fileWeights!['src/wrong.ts'].weight).toBeCloseTo(0.6, 2);
    // Routing updated
    expect(history.tasks[0].routing.reason).toContain('too-strong');
  });

  it('handles feedback with only description (no file corrections)', () => {
    const patterns = makePatterns();
    const history = makeHistory([{ id: 't_001' }]);
    storeMock.readPatterns.mockReturnValue({ ok: true, value: patterns });
    storeMock.readTaskHistory.mockReturnValue({ ok: true, value: history });

    const feedback: DetailedFeedback = {
      source: 'cli-correct',
      rating: 'bad',
      details: 'Everything was off',
    };

    const ctx: CorrectionContext = {
      taskId: 't_001',
      description: 'test',
      predictedFiles: [],
      actualFiles: [],
      precision: 0,
      recall: 0,
      modelUsed: 'sonnet',
      existingFeedback: null,
    };

    const result = applyDetailedCorrection(feedback, ctx, '/proj');
    expect(result.ok).toBe(true);
    // No writes to patterns since no file corrections
    expect(storeMock.writePatterns).not.toHaveBeenCalled();
  });

  it('normalizes Windows paths in missed files', () => {
    const patterns = makePatterns();
    const history = makeHistory([{ id: 't_001', taskType: 'feature' }]);
    storeMock.readPatterns.mockReturnValue({ ok: true, value: patterns });
    storeMock.writePatterns.mockReturnValue({ ok: true, value: undefined });
    storeMock.readTaskHistory.mockReturnValue({ ok: true, value: history });

    const feedback: DetailedFeedback = {
      source: 'cli-correct',
      rating: 'bad',
      missedFiles: ['src\\config.ts'],
    };

    const ctx: CorrectionContext = {
      taskId: 't_001',
      description: 'test',
      predictedFiles: [],
      actualFiles: [],
      precision: 0,
      recall: 0,
      modelUsed: 'sonnet',
      existingFeedback: null,
    };

    const result = applyDetailedCorrection(feedback, ctx, '/proj');
    expect(result.ok).toBe(true);

    // Path should be normalized to POSIX
    expect(patterns.typeAffinities.feature.fileWeights!['src/config.ts']).toBeDefined();
  });
});
