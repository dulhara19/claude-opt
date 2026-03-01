import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  InlineFeedback,
  QuickReason,
  InlineFeedbackWithDescription,
  FeedbackResult,
  ForgetResult,
  TaskSummary,
} from '../../src/visibility/types.js';
import { supportsEmoji, recordFeedback, forgetFile, validateFeedback, adaptiveWeightAmount, aggregateFeedback, boostCoOccurrenceFromFeedback, DEFAULT_FEEDBACK_TIMEOUT_MS } from '../../src/visibility/feedback.js';

// ─── Shared mock for store module ───────────────────────────────

const storeMock = vi.hoisted(() => ({
  readTaskHistory: vi.fn(),
  writeTaskHistory: vi.fn(),
  readKeywordIndex: vi.fn(),
  writeKeywordIndex: vi.fn(),
  readPatterns: vi.fn(),
  writePatterns: vi.fn(),
  readMetrics: vi.fn(),
  writeMetrics: vi.fn(),
}));

vi.mock('../../src/store/index.js', () => storeMock);

// ─── Task 1: Type definitions ────────────────────────────────────

describe('Feedback types', () => {
  it('InlineFeedback represents good feedback', () => {
    const feedback: InlineFeedback = { source: 'inline', rating: 'good' };
    expect(feedback.source).toBe('inline');
    expect(feedback.rating).toBe('good');
  });

  it('InlineFeedback represents bad feedback with quick reason', () => {
    const feedback: InlineFeedback = { source: 'inline', rating: 'bad', quickReason: 'missed-files' };
    expect(feedback.quickReason).toBe('missed-files');
  });

  it('QuickReason covers all options', () => {
    const reasons: QuickReason[] = ['missed-files', 'wrong-files', 'wrong-model'];
    expect(reasons).toHaveLength(3);
  });

  it('InlineFeedbackWithDescription extends InlineFeedback with details', () => {
    const feedback: InlineFeedbackWithDescription = {
      source: 'inline',
      rating: 'bad',
      details: 'missed styles.css',
    };
    expect(feedback.details).toBe('missed styles.css');
  });

  it('FeedbackResult can be null for skip', () => {
    const result: FeedbackResult = null;
    expect(result).toBeNull();
  });

  it('ForgetResult has expected shape', () => {
    const result: ForgetResult = {
      filePath: 'src/old.ts',
      keywordsCleared: 5,
      coOccurrencesAffected: 3,
      affinitiesZeroed: 2,
    };
    expect(result.filePath).toBe('src/old.ts');
    expect(result.keywordsCleared).toBe(5);
  });

  it('TaskSummary has expected shape', () => {
    const summary: TaskSummary = {
      taskId: 'task-1',
      description: 'Fix bug',
      predictedCount: 4,
      actualCount: 5,
      modelUsed: 'sonnet',
      tokensConsumed: 1500,
    };
    expect(summary.taskId).toBe('task-1');
    expect(summary.predictedCount).toBe(4);
  });
});

// ─── Task 2: Emoji detection ────────────────────────────────────

describe('supportsEmoji', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns true for Windows Terminal (WT_SESSION)', () => {
    process.env.WT_SESSION = 'some-session-id';
    expect(supportsEmoji()).toBe(true);
  });

  it('returns true for iTerm2', () => {
    delete process.env.WT_SESSION;
    process.env.TERM_PROGRAM = 'iTerm.app';
    expect(supportsEmoji()).toBe(true);
  });

  it('returns true for VS Code terminal', () => {
    delete process.env.WT_SESSION;
    process.env.TERM_PROGRAM = 'vscode';
    expect(supportsEmoji()).toBe(true);
  });

  it('returns true for Apple Terminal', () => {
    delete process.env.WT_SESSION;
    process.env.TERM_PROGRAM = 'Apple_Terminal';
    expect(supportsEmoji()).toBe(true);
  });

  it('returns false for unknown terminals', () => {
    delete process.env.WT_SESSION;
    process.env.TERM_PROGRAM = 'unknown-terminal';
    expect(supportsEmoji()).toBe(false);
  });

  it('returns false when no terminal info available', () => {
    delete process.env.WT_SESSION;
    delete process.env.TERM_PROGRAM;
    expect(supportsEmoji()).toBe(false);
  });
});

// ─── Task 5: Feedback persistence ───────────────────────────────

describe('recordFeedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('records good feedback for existing task', () => {
    const history = {
      schemaVersion: '1.0.0',
      cap: 500,
      count: 1,
      oldestArchive: null,
      tasks: [
        { id: 'task-1', timestamp: '', taskText: '', classification: { taskType: 'feature', complexity: 'medium', confidence: 0.8 }, prediction: { predictedFiles: [], actualFiles: [], precision: 0, recall: 0 }, routing: { model: 'sonnet', reason: '' }, tokens: { consumed: 0, budgeted: 0, saved: 0 }, feedback: null },
      ],
    };
    storeMock.readTaskHistory.mockReturnValue({ ok: true, value: history });
    storeMock.writeTaskHistory.mockReturnValue({ ok: true, value: undefined });

    const result = recordFeedback('/proj', 'task-1', { source: 'inline', rating: 'good' });
    expect(result.ok).toBe(true);
    expect(history.tasks[0].feedback).toEqual({ source: 'inline', rating: 'good' });
    expect(storeMock.writeTaskHistory).toHaveBeenCalledOnce();
  });

  it('records bad feedback with quick reason', () => {
    const history = {
      schemaVersion: '1.0.0',
      cap: 500,
      count: 1,
      oldestArchive: null,
      tasks: [
        { id: 'task-2', timestamp: '', taskText: '', classification: { taskType: 'bugfix', complexity: 'low', confidence: 0.9 }, prediction: { predictedFiles: [], actualFiles: [], precision: 0, recall: 0 }, routing: { model: 'haiku', reason: '' }, tokens: { consumed: 0, budgeted: 0, saved: 0 }, feedback: null },
      ],
    };
    storeMock.readTaskHistory.mockReturnValue({ ok: true, value: history });
    storeMock.writeTaskHistory.mockReturnValue({ ok: true, value: undefined });

    const result = recordFeedback('/proj', 'task-2', { source: 'inline', rating: 'bad', quickReason: 'missed-files' });
    expect(result.ok).toBe(true);
    expect(history.tasks[0].feedback).toEqual({ source: 'inline', rating: 'bad', quickReason: 'missed-files' });
  });

  it('records null for skip feedback', () => {
    const history = {
      schemaVersion: '1.0.0',
      cap: 500,
      count: 1,
      oldestArchive: null,
      tasks: [
        { id: 'task-3', timestamp: '', taskText: '', classification: { taskType: 'feature', complexity: 'high', confidence: 0.7 }, prediction: { predictedFiles: [], actualFiles: [], precision: 0, recall: 0 }, routing: { model: 'opus', reason: '' }, tokens: { consumed: 0, budgeted: 0, saved: 0 }, feedback: null },
      ],
    };
    storeMock.readTaskHistory.mockReturnValue({ ok: true, value: history });
    storeMock.writeTaskHistory.mockReturnValue({ ok: true, value: undefined });

    const result = recordFeedback('/proj', 'task-3', null);
    expect(result.ok).toBe(true);
    expect(history.tasks[0].feedback).toBeNull();
  });

  it('returns error when task not found', () => {
    const history = {
      schemaVersion: '1.0.0',
      cap: 500,
      count: 0,
      oldestArchive: null,
      tasks: [],
    };
    storeMock.readTaskHistory.mockReturnValue({ ok: true, value: history });

    const result = recordFeedback('/proj', 'nonexistent', { source: 'inline', rating: 'good' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('Task not found');
  });

  it('returns error when task history unreadable', () => {
    storeMock.readTaskHistory.mockReturnValue({ ok: false, error: 'File not found' });

    const result = recordFeedback('/proj', 'task-1', null);
    expect(result.ok).toBe(false);
  });
});

// ─── Task 7: Forget command ─────────────────────────────────────

describe('forgetFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('removes file from keyword index and patterns', () => {
    const keywordIndex = {
      schemaVersion: '1.0.0',
      updatedAt: '',
      keywordToFiles: {
        auth: ['src/auth.ts', 'src/middleware.ts'],
        middleware: ['src/middleware.ts'],
        login: ['src/login.ts'],
      },
      fileToKeywords: {
        'src/auth.ts': ['auth'],
        'src/middleware.ts': ['auth', 'middleware'],
        'src/login.ts': ['login'],
      },
    };

    const patterns = {
      schemaVersion: '1.0.0',
      coOccurrences: [
        { files: ['src/auth.ts', 'src/middleware.ts'] as [string, string], count: 5, confidence: 0.8 },
        { files: ['src/login.ts', 'src/auth.ts'] as [string, string], count: 3, confidence: 0.6 },
      ],
      typeAffinities: {
        feature: {
          taskType: 'feature',
          files: ['src/middleware.ts'],
          confidence: 0.7,
          fileWeights: { 'src/middleware.ts': { weight: 0.9, occurrences: 4 } },
        },
      },
      conventions: [],
    };

    storeMock.readKeywordIndex.mockReturnValue({ ok: true, value: keywordIndex });
    storeMock.writeKeywordIndex.mockReturnValue({ ok: true, value: undefined });
    storeMock.readPatterns.mockReturnValue({ ok: true, value: patterns });
    storeMock.writePatterns.mockReturnValue({ ok: true, value: undefined });

    const result = forgetFile('/proj', 'src/middleware.ts');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.keywordsCleared).toBe(2);
    expect(result.value.coOccurrencesAffected).toBe(1);
    expect(result.value.affinitiesZeroed).toBe(1);

    // Verify keyword index was cleaned
    expect(keywordIndex.keywordToFiles.auth).toEqual(['src/auth.ts']);
    expect(keywordIndex.keywordToFiles.middleware).toBeUndefined();
    expect(keywordIndex.fileToKeywords['src/middleware.ts']).toBeUndefined();

    // FB6: Verify co-occurrence entries removed (not just zeroed)
    expect(patterns.coOccurrences).toHaveLength(1); // only the one without middleware
    expect(patterns.coOccurrences[0].confidence).toBe(0.6); // login+auth pair intact

    // FB6: Verify type affinity file entry removed (not just zeroed)
    expect(patterns.typeAffinities.feature.fileWeights!['src/middleware.ts']).toBeUndefined();
    expect(patterns.typeAffinities.feature.files).not.toContain('src/middleware.ts');

    // Verify writes called
    expect(storeMock.writeKeywordIndex).toHaveBeenCalledOnce();
    expect(storeMock.writePatterns).toHaveBeenCalledOnce();
  });

  it('returns error for file not in knowledge store', () => {
    const keywordIndex = {
      schemaVersion: '1.0.0',
      updatedAt: '',
      keywordToFiles: {},
      fileToKeywords: {},
    };

    const patterns = {
      schemaVersion: '1.0.0',
      coOccurrences: [],
      typeAffinities: {},
      conventions: [],
    };

    storeMock.readKeywordIndex.mockReturnValue({ ok: true, value: keywordIndex });
    storeMock.readPatterns.mockReturnValue({ ok: true, value: patterns });

    const result = forgetFile('/proj', 'src/nonexistent.ts');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('File not found in knowledge store');
  });

  it('handles file only in co-occurrences (not in keyword index)', () => {
    const keywordIndex = {
      schemaVersion: '1.0.0',
      updatedAt: '',
      keywordToFiles: {},
      fileToKeywords: {},
    };

    const patterns = {
      schemaVersion: '1.0.0',
      coOccurrences: [
        { files: ['src/a.ts', 'src/orphan.ts'] as [string, string], count: 2, confidence: 0.5 },
      ],
      typeAffinities: {},
      conventions: [],
    };

    storeMock.readKeywordIndex.mockReturnValue({ ok: true, value: keywordIndex });
    storeMock.writeKeywordIndex.mockReturnValue({ ok: true, value: undefined });
    storeMock.readPatterns.mockReturnValue({ ok: true, value: patterns });
    storeMock.writePatterns.mockReturnValue({ ok: true, value: undefined });

    const result = forgetFile('/proj', 'src/orphan.ts');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.keywordsCleared).toBe(0);
    expect(result.value.coOccurrencesAffected).toBe(1);
    // FB6: Co-occurrence entry is removed entirely
    expect(patterns.coOccurrences).toHaveLength(0);
  });

  it('normalizes Windows paths to POSIX', () => {
    const keywordIndex = {
      schemaVersion: '1.0.0',
      updatedAt: '',
      keywordToFiles: {
        test: ['src/test.ts'],
      },
      fileToKeywords: {
        'src/test.ts': ['test'],
      },
    };

    const patterns = {
      schemaVersion: '1.0.0',
      coOccurrences: [],
      typeAffinities: {},
      conventions: [],
    };

    storeMock.readKeywordIndex.mockReturnValue({ ok: true, value: keywordIndex });
    storeMock.writeKeywordIndex.mockReturnValue({ ok: true, value: undefined });
    storeMock.readPatterns.mockReturnValue({ ok: true, value: patterns });
    storeMock.writePatterns.mockReturnValue({ ok: true, value: undefined });

    const result = forgetFile('/proj', 'src\\test.ts');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.filePath).toBe('src/test.ts');
    expect(result.value.keywordsCleared).toBe(1);
  });

  it('returns error when keyword index unreadable', () => {
    storeMock.readKeywordIndex.mockReturnValue({ ok: false, error: 'Corrupt' });

    const result = forgetFile('/proj', 'src/file.ts');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('Failed to read keyword index');
  });

  it('returns error when patterns unreadable', () => {
    const keywordIndex = {
      schemaVersion: '1.0.0',
      updatedAt: '',
      keywordToFiles: {},
      fileToKeywords: { 'src/file.ts': ['test'] },
    };

    storeMock.readKeywordIndex.mockReturnValue({ ok: true, value: keywordIndex });
    storeMock.readPatterns.mockReturnValue({ ok: false, error: 'Corrupt' });

    const result = forgetFile('/proj', 'src/file.ts');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('Failed to read patterns');
  });
});

// ─── FB1: Configurable Timeout ──────────────────────────────────

describe('DEFAULT_FEEDBACK_TIMEOUT_MS (FB1)', () => {
  it('exports a default timeout value', () => {
    expect(DEFAULT_FEEDBACK_TIMEOUT_MS).toBe(10_000);
  });
});

// ─── FB2: Feedback Validation ────────────────────────────────────

describe('validateFeedback (FB2)', () => {
  it('accepts null (skip)', () => {
    expect(validateFeedback(null)).toBeNull();
  });

  it('accepts valid good feedback', () => {
    expect(validateFeedback({ source: 'inline', rating: 'good' })).toBeNull();
  });

  it('accepts valid bad feedback with reason', () => {
    expect(validateFeedback({ source: 'inline', rating: 'bad', quickReason: 'missed-files' })).toBeNull();
  });

  it('accepts valid partial feedback (FB10)', () => {
    expect(validateFeedback({ source: 'inline', rating: 'partial' })).toBeNull();
  });

  it('rejects feedback with empty missedFiles array', () => {
    const result = validateFeedback({ source: 'cli-correct', rating: 'bad', missedFiles: [] });
    expect(result).toContain('missedFiles must not be an empty array');
  });

  it('rejects feedback with empty wrongFiles array', () => {
    const result = validateFeedback({ source: 'cli-correct', rating: 'bad', wrongFiles: [] });
    expect(result).toContain('wrongFiles must not be an empty array');
  });
});

// ─── FB3: Task ID Continuity ─────────────────────────────────────

describe('recordFeedback with expectedTaskId (FB3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('succeeds when expectedTaskId matches', () => {
    const history = {
      schemaVersion: '1.0.0', cap: 500, count: 1, oldestArchive: null,
      tasks: [{ id: 'task-1', timestamp: '', taskText: '', classification: { taskType: 'feature', complexity: 'medium', confidence: 0.8 }, prediction: { predictedFiles: [], actualFiles: [], precision: 0, recall: 0 }, routing: { model: 'sonnet', reason: '' }, tokens: { consumed: 0, budgeted: 0, saved: 0 }, feedback: null }],
    };
    storeMock.readTaskHistory.mockReturnValue({ ok: true, value: history });
    storeMock.writeTaskHistory.mockReturnValue({ ok: true, value: undefined });

    const result = recordFeedback('/proj', 'task-1', { source: 'inline', rating: 'good' }, 'task-1');
    expect(result.ok).toBe(true);
  });

  it('fails when expectedTaskId does not match', () => {
    const history = {
      schemaVersion: '1.0.0', cap: 500, count: 1, oldestArchive: null,
      tasks: [{ id: 'task-1', timestamp: '', taskText: '', classification: { taskType: 'feature', complexity: 'medium', confidence: 0.8 }, prediction: { predictedFiles: [], actualFiles: [], precision: 0, recall: 0 }, routing: { model: 'sonnet', reason: '' }, tokens: { consumed: 0, budgeted: 0, saved: 0 }, feedback: null }],
    };
    storeMock.readTaskHistory.mockReturnValue({ ok: true, value: history });

    const result = recordFeedback('/proj', 'task-1', { source: 'inline', rating: 'good' }, 'task-99');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('Task ID mismatch');
  });
});

// ─── FB4: Improved Terminal Detection ────────────────────────────

describe('supportsEmoji Linux detection (FB4)', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns true for GNOME Terminal', () => {
    delete process.env.WT_SESSION;
    process.env.TERM_PROGRAM = 'gnome-terminal';
    expect(supportsEmoji()).toBe(true);
  });

  it('returns true for kitty', () => {
    delete process.env.WT_SESSION;
    process.env.TERM_PROGRAM = 'kitty';
    expect(supportsEmoji()).toBe(true);
  });

  it('returns true for COLORTERM=truecolor', () => {
    delete process.env.WT_SESSION;
    process.env.TERM_PROGRAM = 'unknown';
    process.env.COLORTERM = 'truecolor';
    expect(supportsEmoji()).toBe(true);
  });

  it('returns true for COLORTERM=24bit', () => {
    delete process.env.WT_SESSION;
    process.env.TERM_PROGRAM = 'unknown';
    process.env.COLORTERM = '24bit';
    expect(supportsEmoji()).toBe(true);
  });
});

// ─── FB5: Adaptive Weight Amount ─────────────────────────────────

describe('adaptiveWeightAmount (FB5)', () => {
  it('returns base amount at 50% confidence', () => {
    // confidence = (0.5+0.5)/2 = 0.5, scale = 0.5 + 1.0*0.5 = 1.0
    expect(adaptiveWeightAmount(0.2, 0.5, 0.5)).toBeCloseTo(0.2, 5);
  });

  it('returns reduced amount at 0% confidence', () => {
    // confidence = 0, scale = 0.5
    expect(adaptiveWeightAmount(0.2, 0, 0)).toBeCloseTo(0.1, 5);
  });

  it('returns increased amount at 100% confidence', () => {
    // confidence = 1.0, scale = 1.5
    expect(adaptiveWeightAmount(0.2, 1.0, 1.0)).toBeCloseTo(0.3, 5);
  });

  it('scales proportionally to precision+recall average', () => {
    const low = adaptiveWeightAmount(0.2, 0.2, 0.2);
    const high = adaptiveWeightAmount(0.2, 0.8, 0.8);
    expect(high).toBeGreaterThan(low);
  });
});

// ─── FB7: Feedback Analytics ─────────────────────────────────────

describe('aggregateFeedback (FB7)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('aggregates feedback counts correctly', () => {
    const history = {
      schemaVersion: '1.0.0', cap: 500, count: 4, oldestArchive: null,
      tasks: [
        { id: 't1', timestamp: new Date().toISOString(), taskText: '', classification: { taskType: 'feature', complexity: 'medium', confidence: 0.8 }, prediction: { predictedFiles: [], actualFiles: [], precision: 0, recall: 0 }, routing: { model: 'sonnet', reason: '' }, tokens: { consumed: 0, budgeted: 0, saved: 0 }, feedback: { source: 'inline', rating: 'good' } },
        { id: 't2', timestamp: new Date().toISOString(), taskText: '', classification: { taskType: 'feature', complexity: 'medium', confidence: 0.8 }, prediction: { predictedFiles: [], actualFiles: [], precision: 0, recall: 0 }, routing: { model: 'sonnet', reason: '' }, tokens: { consumed: 0, budgeted: 0, saved: 0 }, feedback: { source: 'inline', rating: 'bad', quickReason: 'missed-files' } },
        { id: 't3', timestamp: new Date().toISOString(), taskText: '', classification: { taskType: 'feature', complexity: 'medium', confidence: 0.8 }, prediction: { predictedFiles: [], actualFiles: [], precision: 0, recall: 0 }, routing: { model: 'sonnet', reason: '' }, tokens: { consumed: 0, budgeted: 0, saved: 0 }, feedback: { source: 'inline', rating: 'partial' } },
        { id: 't4', timestamp: new Date().toISOString(), taskText: '', classification: { taskType: 'feature', complexity: 'medium', confidence: 0.8 }, prediction: { predictedFiles: [], actualFiles: [], precision: 0, recall: 0 }, routing: { model: 'sonnet', reason: '' }, tokens: { consumed: 0, budgeted: 0, saved: 0 }, feedback: null },
      ],
    };
    storeMock.readTaskHistory.mockReturnValue({ ok: true, value: history });

    const result = aggregateFeedback('/proj');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.good).toBe(1);
    expect(result.value.bad).toBe(1);
    expect(result.value.partial).toBe(1);
    expect(result.value.skipped).toBe(1);
    expect(result.value.totalFeedbacks).toBe(3);
    expect(result.value.reasonBreakdown['missed-files']).toBe(1);
    expect(result.value.satisfactionRate).toBeGreaterThan(0);
    expect(result.value.satisfactionRate).toBeLessThan(1);
  });

  it('returns 0 satisfaction rate when no feedback', () => {
    const history = {
      schemaVersion: '1.0.0', cap: 500, count: 1, oldestArchive: null,
      tasks: [
        { id: 't1', timestamp: new Date().toISOString(), taskText: '', classification: { taskType: 'feature', complexity: 'medium', confidence: 0.8 }, prediction: { predictedFiles: [], actualFiles: [], precision: 0, recall: 0 }, routing: { model: 'sonnet', reason: '' }, tokens: { consumed: 0, budgeted: 0, saved: 0 }, feedback: null },
      ],
    };
    storeMock.readTaskHistory.mockReturnValue({ ok: true, value: history });

    const result = aggregateFeedback('/proj');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.satisfactionRate).toBe(0);
  });

  it('tracks model corrections (FB8)', () => {
    const history = {
      schemaVersion: '1.0.0', cap: 500, count: 2, oldestArchive: null,
      tasks: [
        { id: 't1', timestamp: new Date().toISOString(), taskText: '', classification: { taskType: 'feature', complexity: 'medium', confidence: 0.8 }, prediction: { predictedFiles: [], actualFiles: [], precision: 0, recall: 0 }, routing: { model: 'sonnet', reason: '' }, tokens: { consumed: 0, budgeted: 0, saved: 0 }, feedback: { source: 'cli-correct', rating: 'bad', modelCorrection: { direction: 'too-weak', suggested: 'opus' } } },
        { id: 't2', timestamp: new Date().toISOString(), taskText: '', classification: { taskType: 'feature', complexity: 'medium', confidence: 0.8 }, prediction: { predictedFiles: [], actualFiles: [], precision: 0, recall: 0 }, routing: { model: 'opus', reason: '' }, tokens: { consumed: 0, budgeted: 0, saved: 0 }, feedback: { source: 'cli-correct', rating: 'bad', modelCorrection: { direction: 'too-strong' } } },
      ],
    };
    storeMock.readTaskHistory.mockReturnValue({ ok: true, value: history });

    const result = aggregateFeedback('/proj');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.modelCorrections.tooWeak).toBe(1);
    expect(result.value.modelCorrections.tooStrong).toBe(1);
  });
});

// ─── FB9: Co-occurrence from Feedback ────────────────────────────

describe('boostCoOccurrenceFromFeedback (FB9)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates new co-occurrence pairs', () => {
    const patterns = {
      schemaVersion: '1.0.0',
      coOccurrences: [] as Array<{ files: [string, string]; count: number; confidence: number }>,
      typeAffinities: {},
      conventions: [],
    };
    storeMock.readPatterns.mockReturnValue({ ok: true, value: patterns });
    storeMock.writePatterns.mockReturnValue({ ok: true, value: undefined });

    const result = boostCoOccurrenceFromFeedback('/proj', ['src/missed.ts'], ['src/predicted.ts']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe(1);
    expect(patterns.coOccurrences).toHaveLength(1);
    expect(patterns.coOccurrences[0].confidence).toBe(0.3);
  });

  it('boosts existing co-occurrence pairs', () => {
    const patterns = {
      schemaVersion: '1.0.0',
      coOccurrences: [
        { files: ['src/missed.ts', 'src/predicted.ts'] as [string, string], count: 3, confidence: 0.5 },
      ],
      typeAffinities: {},
      conventions: [],
    };
    storeMock.readPatterns.mockReturnValue({ ok: true, value: patterns });
    storeMock.writePatterns.mockReturnValue({ ok: true, value: undefined });

    const result = boostCoOccurrenceFromFeedback('/proj', ['src/missed.ts'], ['src/predicted.ts']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(patterns.coOccurrences[0].count).toBe(4);
    expect(patterns.coOccurrences[0].confidence).toBe(0.6);
  });

  it('skips identical file pairs', () => {
    const patterns = {
      schemaVersion: '1.0.0',
      coOccurrences: [] as Array<{ files: [string, string]; count: number; confidence: number }>,
      typeAffinities: {},
      conventions: [],
    };
    storeMock.readPatterns.mockReturnValue({ ok: true, value: patterns });

    const result = boostCoOccurrenceFromFeedback('/proj', ['src/a.ts'], ['src/a.ts']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe(0);
  });
});
