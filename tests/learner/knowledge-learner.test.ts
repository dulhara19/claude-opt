import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  compareAccuracy,
  captureOutcome,
  updateMetrics,
  updateKeywordIndex,
  extractKeywords,
  resetSession,
} from '../../src/learner/knowledge-learner.js';
import { MAX_CAPTURE_TIME_MS } from '../../src/learner/types.js';
import type { PipelineContext } from '../../src/types/index.js';
import { TaskType, Complexity } from '../../src/types/index.js';
import { ModelTier } from '../../src/router/types.js';
import { createTempProjectRoot, cleanupTempProjectRoot } from '../helpers/test-store.js';
import { initializeStore, readTaskHistory, readMetrics, readKeywordIndex } from '../../src/store/index.js';

let projectRoot: string;

function makeContext(overrides?: Partial<PipelineContext>): PipelineContext {
  return {
    taskText: 'add confidence decay to pattern detection',
    workingDir: projectRoot,
    isDryRun: false,
    results: {},
    startedAt: Date.now(),
    classification: {
      type: TaskType.Feature,
      domain: 'learning-engine',
      complexity: Complexity.Medium,
      confidence: 0.85,
    },
    prediction: {
      predictions: [
        { filePath: 'src/patterns.ts', score: 0.92, signals: [] },
        { filePath: 'src/learner.ts', score: 0.88, signals: [] },
      ],
      totalCandidates: 10,
      threshold: 0.6,
      durationMs: 5,
    },
    routing: {
      model: ModelTier.Sonnet,
      rationale: 'medium complexity feature',
      confidence: 0.8,
      overrideApplied: false,
      durationMs: 1,
    },
    adapterResult: {
      output: 'Done.',
      filesUsed: ['src/patterns.ts', 'src/learner.ts', 'src/config.ts'],
      exitCode: 0,
      tokenEstimate: 1200,
      isFallback: false,
      durationMs: 5000,
    },
    ...overrides,
  };
}

// ─── compareAccuracy (AC2) ──────────────────────────────────────────

describe('compareAccuracy', () => {
  it('perfect prediction — precision 1.0, recall 1.0', () => {
    const result = compareAccuracy(['src/a.ts', 'src/b.ts'], ['src/a.ts', 'src/b.ts']);
    expect(result.precision).toBe(1.0);
    expect(result.recall).toBe(1.0);
    expect(result.truePositives).toEqual(['src/a.ts', 'src/b.ts']);
    expect(result.falsePositives).toEqual([]);
    expect(result.falseNegatives).toEqual([]);
  });

  it('partial overlap — precision ~0.67, recall ~0.67', () => {
    const result = compareAccuracy(['src/a.ts', 'src/b.ts', 'src/c.ts'], ['src/b.ts', 'src/c.ts', 'src/d.ts']);
    expect(result.precision).toBeCloseTo(2 / 3, 5);
    expect(result.recall).toBeCloseTo(2 / 3, 5);
    expect(result.truePositives).toEqual(['src/b.ts', 'src/c.ts']);
    expect(result.falsePositives).toEqual(['src/a.ts']);
    expect(result.falseNegatives).toEqual(['src/d.ts']);
  });

  it('no overlap — precision 0.0, recall 0.0', () => {
    const result = compareAccuracy(['src/a.ts', 'src/b.ts'], ['src/c.ts', 'src/d.ts']);
    expect(result.precision).toBe(0);
    expect(result.recall).toBe(0);
    expect(result.falsePositives).toEqual(['src/a.ts', 'src/b.ts']);
    expect(result.falseNegatives).toEqual(['src/c.ts', 'src/d.ts']);
  });

  it('empty prediction — precision 0.0, recall 0.0', () => {
    const result = compareAccuracy([], ['src/a.ts', 'src/b.ts']);
    expect(result.precision).toBe(0);
    expect(result.recall).toBe(0);
    expect(result.falseNegatives).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('empty actual — precision 0.0, recall 0.0', () => {
    const result = compareAccuracy(['src/a.ts', 'src/b.ts'], []);
    expect(result.precision).toBe(0);
    expect(result.recall).toBe(0);
    expect(result.falsePositives).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('normalizes paths before comparison (Windows backslash vs POSIX)', () => {
    const result = compareAccuracy(['src\\a.ts', 'src\\b.ts'], ['src/a.ts', 'src/b.ts']);
    expect(result.precision).toBe(1.0);
    expect(result.recall).toBe(1.0);
  });
});

// ─── updateMetrics (AC3) ────────────────────────────────────────────

describe('updateMetrics', () => {
  beforeEach(() => {
    projectRoot = createTempProjectRoot();
    initializeStore(projectRoot);
  });
  afterEach(() => {
    cleanupTempProjectRoot(projectRoot);
  });

  it('first task creates initial metrics with correct overall values', () => {
    const accuracy = { precision: 0.8, recall: 0.7, truePositives: ['a.ts'], falsePositives: [], falseNegatives: ['b.ts'] };
    updateMetrics(projectRoot, accuracy, 'auth', 1000, 500);

    const result = readMetrics(projectRoot);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.overall.totalTasks).toBe(1);
    expect(result.value.overall.avgPrecision).toBe(0.8);
    expect(result.value.overall.avgRecall).toBe(0.7);
    expect(result.value.overall.totalTokensConsumed).toBe(1000);
    expect(result.value.overall.totalTokensSaved).toBe(500);
    expect(result.value.overall.savingsRate).toBeCloseTo(500 / 1500, 5);
  });

  it('second task updates running averages correctly', () => {
    const acc1 = { precision: 0.8, recall: 0.6, truePositives: [], falsePositives: [], falseNegatives: [] };
    const acc2 = { precision: 0.6, recall: 0.8, truePositives: [], falsePositives: [], falseNegatives: [] };

    updateMetrics(projectRoot, acc1, 'auth', 1000, 500);
    updateMetrics(projectRoot, acc2, 'auth', 800, 400);

    const result = readMetrics(projectRoot);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.overall.totalTasks).toBe(2);
    expect(result.value.overall.avgPrecision).toBeCloseTo(0.7, 5);
    expect(result.value.overall.avgRecall).toBeCloseTo(0.7, 5);
  });

  it('domain-specific metrics are tracked separately', () => {
    const acc1 = { precision: 0.9, recall: 0.8, truePositives: [], falsePositives: [], falseNegatives: [] };
    const acc2 = { precision: 0.5, recall: 0.4, truePositives: [], falsePositives: [], falseNegatives: [] };

    updateMetrics(projectRoot, acc1, 'auth', 1000, 500);
    updateMetrics(projectRoot, acc2, 'ui', 800, 200);

    const result = readMetrics(projectRoot);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.perDomain['auth'].totalTasks).toBe(1);
    expect(result.value.perDomain['auth'].avgPrecision).toBe(0.9);
    expect(result.value.perDomain['ui'].totalTasks).toBe(1);
    expect(result.value.perDomain['ui'].avgPrecision).toBe(0.5);
  });

  it('multiple domains maintain independent precision/recall', () => {
    const acc = { precision: 0.7, recall: 0.6, truePositives: [], falsePositives: [], falseNegatives: [] };

    updateMetrics(projectRoot, acc, 'auth', 500, 200);
    updateMetrics(projectRoot, acc, 'auth', 500, 200);
    updateMetrics(projectRoot, acc, 'ui', 500, 200);

    const result = readMetrics(projectRoot);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.perDomain['auth'].totalTasks).toBe(2);
    expect(result.value.perDomain['ui'].totalTasks).toBe(1);
    expect(result.value.overall.totalTasks).toBe(3);
  });

  it('savings rate calculated correctly from consumed + saved', () => {
    const acc = { precision: 1, recall: 1, truePositives: [], falsePositives: [], falseNegatives: [] };
    updateMetrics(projectRoot, acc, 'auth', 600, 400);

    const result = readMetrics(projectRoot);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // savingsRate = 400 / (600 + 400) = 0.4
    expect(result.value.overall.savingsRate).toBeCloseTo(0.4, 5);
  });
});

// ─── updateKeywordIndex (AC4) ───────────────────────────────────────

describe('updateKeywordIndex', () => {
  beforeEach(() => {
    projectRoot = createTempProjectRoot();
    initializeStore(projectRoot);
  });
  afterEach(() => {
    cleanupTempProjectRoot(projectRoot);
  });

  it('new file discovery adds keyword-to-file and file-to-keyword mappings', () => {
    updateKeywordIndex(projectRoot, 'implement authentication middleware', ['src/auth/middleware.ts']);

    const result = readKeywordIndex(projectRoot);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // L6: extractKeywords now stems — "authentication" → "authenticate"
    expect(result.value.keywordToFiles['authenticate']).toContain('src/auth/middleware.ts');
    expect(result.value.keywordToFiles['middleware']).toContain('src/auth/middleware.ts');
    expect(result.value.fileToKeywords['src/auth/middleware.ts']).toContain('authenticate');
  });

  it('existing keyword entries are extended (not replaced)', () => {
    updateKeywordIndex(projectRoot, 'implement authentication', ['src/auth.ts']);
    updateKeywordIndex(projectRoot, 'implement authentication', ['src/login.ts']);

    const result = readKeywordIndex(projectRoot);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // L6: "authentication" → stemmed to "authenticate"
    expect(result.value.keywordToFiles['authenticate']).toContain('src/auth.ts');
    expect(result.value.keywordToFiles['authenticate']).toContain('src/login.ts');
  });

  it('duplicate mappings are not added', () => {
    updateKeywordIndex(projectRoot, 'implement authentication', ['src/auth.ts']);
    updateKeywordIndex(projectRoot, 'implement authentication', ['src/auth.ts']);

    const result = readKeywordIndex(projectRoot);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // L6: "authentication" → stemmed to "authenticate"
    const count = result.value.keywordToFiles['authenticate'].filter((f: string) => f === 'src/auth.ts').length;
    expect(count).toBe(1);
  });

  it('common/stop words and task-action words are filtered, with stemming applied', () => {
    const keywords = extractKeywords('the quick fix for a simple bug');
    expect(keywords).not.toContain('the');
    expect(keywords).not.toContain('for');
    expect(keywords).not.toContain('fix'); // L6: task-action stopword
    expect(keywords).toContain('quick');
    expect(keywords).toContain('simple');
    expect(keywords).toContain('bug');
  });
});

// ─── captureOutcome end-to-end (AC1, AC5) ───────────────────────────

describe('captureOutcome', () => {
  beforeEach(() => {
    projectRoot = createTempProjectRoot();
    initializeStore(projectRoot);
    resetSession();
  });
  afterEach(() => {
    cleanupTempProjectRoot(projectRoot);
  });

  it('full capture flow — task history entry written correctly (AC1)', () => {
    const ctx = makeContext();
    captureOutcome(ctx);

    const result = readTaskHistory(projectRoot);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.tasks).toHaveLength(1);
    const entry = result.value.tasks[0];
    expect(entry.id).toMatch(/^t_\d{8}_\d{3}$/);
    expect(entry.taskText).toBe('add confidence decay to pattern detection');
    expect(entry.classification.taskType).toBe('Feature');
    expect(entry.classification.domain).toBe('learning-engine'); // L2: domain persisted
    expect(entry.prediction.precision).toBeCloseTo(2 / 2, 5); // 2 predicted, 2 actually used
    expect(entry.prediction.predictedScores).toEqual([0.92, 0.88]); // L3: scores stored
    expect(entry.routing.model).toBe('sonnet');
    expect(entry.tokens.consumed).toBe(1200);
    expect(entry.feedback).toBeNull();
  });

  it('capture completes in <500ms with representative data (AC1)', () => {
    const ctx = makeContext();
    const start = performance.now();
    captureOutcome(ctx);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(MAX_CAPTURE_TIME_MS);
  });

  it('capture failure does not throw — returns gracefully with error logged (AC5)', () => {
    // Use a nonexistent directory to trigger store errors
    const ctx = makeContext({ workingDir: '/nonexistent/path/does/not/exist' });

    // Should NOT throw
    expect(() => captureOutcome(ctx)).not.toThrow();
  });

  it('task ID format matches t_YYYYMMDD_seq pattern', () => {
    const ctx = makeContext();
    captureOutcome(ctx);

    const result = readTaskHistory(projectRoot);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.tasks[0].id).toMatch(/^t_\d{8}_\d{3}$/);
  });

  it('all file paths stored as POSIX in the task history entry', () => {
    const ctx = makeContext({
      adapterResult: {
        output: 'Done.',
        filesUsed: ['src\\utils\\paths.ts', 'src/index.ts'],
        exitCode: 0,
        tokenEstimate: 500,
        isFallback: false,
        durationMs: 1000,
      },
    });
    captureOutcome(ctx);

    const result = readTaskHistory(projectRoot);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    for (const file of result.value.tasks[0].prediction.actualFiles) {
      expect(file).not.toContain('\\');
    }
  });
});

// ─── Integration test (AC1, AC2, AC3, AC4) ──────────────────────────

describe('learning capture integration', () => {
  beforeEach(() => {
    projectRoot = createTempProjectRoot();
    initializeStore(projectRoot);
    resetSession();
  });
  afterEach(() => {
    cleanupTempProjectRoot(projectRoot);
  });

  it('3 task captures produce correct history, metrics, and keyword index', () => {
    // Task 1: perfect prediction
    captureOutcome(makeContext({
      taskText: 'fix authentication bug',
      classification: { type: TaskType.BugFix, domain: 'auth', complexity: Complexity.Simple, confidence: 0.9 },
      prediction: {
        predictions: [
          { filePath: 'src/auth.ts', score: 0.9, signals: [] },
        ],
        totalCandidates: 5,
        threshold: 0.6,
        durationMs: 2,
      },
      adapterResult: {
        output: 'Fixed.',
        filesUsed: ['src/auth.ts'],
        exitCode: 0,
        tokenEstimate: 800,
        isFallback: false,
        durationMs: 2000,
      },
    }));

    // Task 2: partial overlap (discovers new file)
    captureOutcome(makeContext({
      taskText: 'refactor database queries',
      classification: { type: TaskType.Refactor, domain: 'data', complexity: Complexity.Medium, confidence: 0.8 },
      prediction: {
        predictions: [
          { filePath: 'src/db.ts', score: 0.85, signals: [] },
        ],
        totalCandidates: 8,
        threshold: 0.6,
        durationMs: 3,
      },
      adapterResult: {
        output: 'Refactored.',
        filesUsed: ['src/db.ts', 'src/queries.ts'],
        exitCode: 0,
        tokenEstimate: 1500,
        isFallback: false,
        durationMs: 4000,
      },
    }));

    // Task 3: no overlap
    captureOutcome(makeContext({
      taskText: 'add logging middleware',
      classification: { type: TaskType.Feature, domain: 'auth', complexity: Complexity.Simple, confidence: 0.7 },
      prediction: {
        predictions: [
          { filePath: 'src/routes.ts', score: 0.75, signals: [] },
        ],
        totalCandidates: 6,
        threshold: 0.6,
        durationMs: 2,
      },
      adapterResult: {
        output: 'Added.',
        filesUsed: ['src/middleware.ts'],
        exitCode: 0,
        tokenEstimate: 600,
        isFallback: false,
        durationMs: 1500,
      },
    }));

    // Verify task history
    const historyResult = readTaskHistory(projectRoot);
    expect(historyResult.ok).toBe(true);
    if (!historyResult.ok) return;
    expect(historyResult.value.tasks).toHaveLength(3);
    expect(historyResult.value.count).toBe(3);

    // Verify metrics
    const metricsResult = readMetrics(projectRoot);
    expect(metricsResult.ok).toBe(true);
    if (!metricsResult.ok) return;
    expect(metricsResult.value.overall.totalTasks).toBe(3);
    expect(metricsResult.value.overall.avgPrecision).toBeGreaterThan(0);
    expect(metricsResult.value.perDomain['auth']).toBeDefined();
    expect(metricsResult.value.perDomain['data']).toBeDefined();
    expect(metricsResult.value.perDomain['auth'].totalTasks).toBe(2);
    expect(metricsResult.value.perDomain['data'].totalTasks).toBe(1);

    // Verify keyword index (from false negatives: src/queries.ts and src/middleware.ts)
    const indexResult = readKeywordIndex(projectRoot);
    expect(indexResult.ok).toBe(true);
    if (!indexResult.ok) return;
    // L6: "database" → stem → "databas" or "database"; "queries" → "query"; keywords from task 2 and 3
    // At least some keyword entries should exist from false negatives
    const allKeywords = Object.keys(indexResult.value.keywordToFiles);
    expect(allKeywords.length).toBeGreaterThan(0);
  });
});
