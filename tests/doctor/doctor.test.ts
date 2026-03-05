import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTempProjectRoot, cleanupTempProjectRoot } from '../helpers/test-store.js';
import {
  initializeStore,
  writeTaskHistory,
  writePatterns,
  writeMetrics,
  createDefaultTaskHistory,
  createDefaultPatterns,
  createDefaultMetrics,
} from '../../src/store/index.js';
import {
  detectStalePatterns,
  detectMissingCooccurrences,
  detectBadPredictions,
  calculateHealthScore,
  buildDiagnosticPrompt,
  renderDiagnosticReport,
  runDiagnostics,
} from '../../src/doctor/index.js';
import type {
  DiagnosticFinding,
  DiagnosticReport,
} from '../../src/doctor/index.js';
import type { TaskHistory, Patterns, Metrics, TaskEntry } from '../../src/types/index.js';

let projectRoot: string;

beforeEach(() => {
  projectRoot = createTempProjectRoot();
});

afterEach(() => {
  cleanupTempProjectRoot(projectRoot);
});

// ─── Test data factories ─────────────────────────────────────────

function makeTask(overrides: Partial<TaskEntry> = {}): TaskEntry {
  return {
    id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    taskText: 'test task',
    classification: {
      taskType: 'feature',
      complexity: 'medium',
      confidence: 0.8,
    },
    prediction: {
      predictedFiles: [],
      actualFiles: [],
      precision: 0.8,
      recall: 0.7,
    },
    routing: { model: 'sonnet', reason: 'default' },
    tokens: { consumed: 100, budgeted: 500, saved: 400 },
    feedback: null,
    ...overrides,
  };
}

function makeTaskHistory(tasks: TaskEntry[]): TaskHistory {
  const base = createDefaultTaskHistory();
  return { ...base, tasks, count: tasks.length };
}

function makePatterns(overrides: Partial<Patterns> = {}): Patterns {
  const base = createDefaultPatterns();
  return { ...base, ...overrides };
}

function makeMetrics(overrides: Partial<Metrics> = {}): Metrics {
  const base = createDefaultMetrics();
  return { ...base, ...overrides };
}

// ─── detectStalePatterns ────────────────────────────────────────

describe('detectStalePatterns', () => {
  it('creates finding when pattern has high weight but file unused in recent tasks', () => {
    const patterns = makePatterns({
      typeAffinities: {
        feature: {
          taskType: 'feature',
          files: ['src/old-module.ts'],
          confidence: 0.8,
        },
      },
    });

    const tasks = Array.from({ length: 6 }, (_, i) =>
      makeTask({
        id: `task_${i}`,
        prediction: {
          predictedFiles: ['src/other.ts'],
          actualFiles: ['src/other.ts'],
          precision: 1,
          recall: 1,
        },
      }),
    );
    const taskHistory = makeTaskHistory(tasks);
    const metrics = makeMetrics();

    const findings = detectStalePatterns(patterns, taskHistory, metrics);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].type).toBe('stale-pattern');
    expect(findings[0].affectedFiles).toContain('src/old-module.ts');
    expect(findings[0].evidence).toContain('weight');
    expect(findings[0].evidence).toContain('unused');
  });

  it('creates no finding when pattern file is used in recent tasks', () => {
    const patterns = makePatterns({
      typeAffinities: {
        feature: {
          taskType: 'feature',
          files: ['src/active.ts'],
          confidence: 0.8,
        },
      },
    });

    const tasks = Array.from({ length: 6 }, (_, i) =>
      makeTask({
        id: `task_${i}`,
        prediction: {
          predictedFiles: ['src/active.ts'],
          actualFiles: ['src/active.ts'],
          precision: 1,
          recall: 1,
        },
      }),
    );
    const taskHistory = makeTaskHistory(tasks);
    const metrics = makeMetrics();

    const findings = detectStalePatterns(patterns, taskHistory, metrics);
    expect(findings.length).toBe(0);
  });

  it('adds "limited data" note when fewer than 10 tasks', () => {
    const patterns = makePatterns({
      typeAffinities: {
        feature: {
          taskType: 'feature',
          files: ['src/stale.ts'],
          confidence: 0.9,
        },
      },
    });

    const tasks = Array.from({ length: 3 }, (_, i) =>
      makeTask({
        id: `task_${i}`,
        prediction: {
          predictedFiles: ['src/other.ts'],
          actualFiles: ['src/other.ts'],
          precision: 1,
          recall: 1,
        },
      }),
    );
    const taskHistory = makeTaskHistory(tasks);
    const metrics = makeMetrics();

    const findings = detectStalePatterns(patterns, taskHistory, metrics);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].description).toContain('limited data');
  });
});

// ─── detectMissingCooccurrences ─────────────────────────────────

describe('detectMissingCooccurrences', () => {
  it('creates finding when files appear together 80%+ but no formal pattern', () => {
    const tasks = Array.from({ length: 10 }, (_, i) =>
      makeTask({
        id: `task_${i}`,
        prediction: {
          predictedFiles: [],
          actualFiles: ['src/a.ts', 'src/b.ts'],
          precision: 1,
          recall: 1,
        },
      }),
    );
    const taskHistory = makeTaskHistory(tasks);
    const patterns = makePatterns({ coOccurrences: [] });

    const findings = detectMissingCooccurrences(taskHistory, patterns);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].type).toBe('missing-cooccurrence');
    expect(findings[0].affectedFiles).toContain('src/a.ts');
    expect(findings[0].affectedFiles).toContain('src/b.ts');
    expect(findings[0].evidence).toContain('100%');
  });

  it('creates no finding when formal pattern exists', () => {
    const tasks = Array.from({ length: 10 }, (_, i) =>
      makeTask({
        id: `task_${i}`,
        prediction: {
          predictedFiles: [],
          actualFiles: ['src/a.ts', 'src/b.ts'],
          precision: 1,
          recall: 1,
        },
      }),
    );
    const taskHistory = makeTaskHistory(tasks);
    const patterns = makePatterns({
      coOccurrences: [
        { files: ['src/a.ts', 'src/b.ts'], count: 10, confidence: 0.9 },
      ],
    });

    const findings = detectMissingCooccurrences(taskHistory, patterns);
    expect(findings.length).toBe(0);
  });

  it('skips detection if fewer than 5 tasks', () => {
    const tasks = Array.from({ length: 3 }, (_, i) =>
      makeTask({
        id: `task_${i}`,
        prediction: {
          predictedFiles: [],
          actualFiles: ['src/a.ts', 'src/b.ts'],
          precision: 1,
          recall: 1,
        },
      }),
    );
    const taskHistory = makeTaskHistory(tasks);
    const patterns = makePatterns({ coOccurrences: [] });

    const findings = detectMissingCooccurrences(taskHistory, patterns);
    expect(findings.length).toBe(0);
  });
});

// ─── detectBadPredictions ───────────────────────────────────────

describe('detectBadPredictions', () => {
  it('creates finding when file predicted 5 times but used 0', () => {
    const tasks = Array.from({ length: 5 }, (_, i) =>
      makeTask({
        id: `task_${i}`,
        prediction: {
          predictedFiles: ['src/never-used.ts'],
          actualFiles: ['src/other.ts'],
          precision: 0,
          recall: 0,
        },
      }),
    );
    const taskHistory = makeTaskHistory(tasks);
    const metrics = makeMetrics();

    const findings = detectBadPredictions(taskHistory, metrics);
    expect(findings.length).toBeGreaterThan(0);
    const finding = findings.find((f) => f.affectedFiles.includes('src/never-used.ts'));
    expect(finding).toBeDefined();
    expect(finding!.type).toBe('bad-prediction');
    expect(finding!.severity).toBe('medium');
    expect(finding!.evidence).toContain('0%');
  });

  it('creates no finding when file has good hit rate', () => {
    const tasks = Array.from({ length: 5 }, (_, i) =>
      makeTask({
        id: `task_${i}`,
        prediction: {
          predictedFiles: ['src/good.ts'],
          actualFiles: ['src/good.ts'],
          precision: 1,
          recall: 1,
        },
      }),
    );
    const taskHistory = makeTaskHistory(tasks);
    const metrics = makeMetrics();

    const findings = detectBadPredictions(taskHistory, metrics);
    const goodFinding = findings.find((f) => f.affectedFiles.includes('src/good.ts'));
    expect(goodFinding).toBeUndefined();
  });

  it('marks as limited data when fewer than 3 predictions', () => {
    const tasks = [
      makeTask({
        id: 'task_0',
        prediction: {
          predictedFiles: ['src/few.ts'],
          actualFiles: ['src/other.ts'],
          precision: 0,
          recall: 0,
        },
      }),
      makeTask({
        id: 'task_1',
        prediction: {
          predictedFiles: ['src/few.ts'],
          actualFiles: ['src/other.ts'],
          precision: 0,
          recall: 0,
        },
      }),
    ];
    const taskHistory = makeTaskHistory(tasks);
    const metrics = makeMetrics();

    const findings = detectBadPredictions(taskHistory, metrics);
    const fewFinding = findings.find((f) => f.affectedFiles.includes('src/few.ts'));
    if (fewFinding) {
      expect(fewFinding.description).toContain('limited data');
    }
  });
});

// ─── calculateHealthScore ───────────────────────────────────────

describe('calculateHealthScore', () => {
  it('returns high score when no findings and good metrics', () => {
    const metrics = makeMetrics({
      overall: {
        totalTasks: 10,
        totalSessions: 5,
        avgPrecision: 0.9,
        avgRecall: 0.85,
        totalTokensConsumed: 5000,
        totalTokensSaved: 3000,
        savingsRate: 0.6,
      },
    });
    const taskHistory = makeTaskHistory([]);

    const score = calculateHealthScore([], metrics, taskHistory);
    expect(score.overall).toBeGreaterThanOrEqual(0.8);
  });

  it('deducts correctly for multiple findings', () => {
    const findings: DiagnosticFinding[] = [
      {
        id: 'f_stale_000',
        type: 'stale-pattern',
        severity: 'critical',
        description: 'test',
        affectedFiles: [],
        affectedDomain: 'test',
        evidence: 'test',
        recommendation: 'test',
      },
      {
        id: 'f_badpred_000',
        type: 'bad-prediction',
        severity: 'medium',
        description: 'test',
        affectedFiles: [],
        affectedDomain: 'test',
        evidence: 'test',
        recommendation: 'test',
      },
      {
        id: 'f_cooccur_000',
        type: 'missing-cooccurrence',
        severity: 'low',
        description: 'test',
        affectedFiles: [],
        affectedDomain: 'test',
        evidence: 'test',
        recommendation: 'test',
      },
    ];

    const metrics = makeMetrics();
    const taskHistory = makeTaskHistory([]);

    const score = calculateHealthScore(findings, metrics, taskHistory);
    // 1.0 - 0.15 - 0.10 - 0.05 = 0.70
    expect(score.overall).toBeCloseTo(0.70, 2);
  });

  it('floors at 0', () => {
    const findings: DiagnosticFinding[] = Array.from({ length: 10 }, (_, i) => ({
      id: `f_stale_${String(i).padStart(3, '0')}`,
      type: 'stale-pattern' as const,
      severity: 'critical' as const,
      description: 'test',
      affectedFiles: [],
      affectedDomain: 'test',
      evidence: 'test',
      recommendation: 'test',
    }));

    const metrics = makeMetrics();
    const taskHistory = makeTaskHistory([]);

    const score = calculateHealthScore(findings, metrics, taskHistory);
    expect(score.overall).toBe(0);
  });

  it('caps at 1.0', () => {
    const metrics = makeMetrics();
    const taskHistory = makeTaskHistory([]);

    const score = calculateHealthScore([], metrics, taskHistory);
    expect(score.overall).toBeLessThanOrEqual(1.0);
  });

  it('includes per-domain scores from metrics', () => {
    const metrics = makeMetrics({
      perDomain: {
        auth: {
          totalTasks: 5,
          avgPrecision: 0.9,
          avgRecall: 0.8,
          totalTokensConsumed: 1000,
          totalTokensSaved: 500,
        },
        ui: {
          totalTasks: 3,
          avgPrecision: 0.6,
          avgRecall: 0.5,
          totalTokensConsumed: 800,
          totalTokensSaved: 200,
        },
      },
    });
    const taskHistory = makeTaskHistory([]);

    const score = calculateHealthScore([], metrics, taskHistory);
    expect(score.perDomain['auth']).toBeCloseTo(0.85, 2);
    expect(score.perDomain['ui']).toBeCloseTo(0.55, 2);
  });
});

// ─── Sparse data handling ────────────────────────────────────────

describe('sparse data handling', () => {
  it('does not over-diagnose with fewer than 10 tasks', () => {
    const patterns = makePatterns({
      typeAffinities: {
        feature: {
          taskType: 'feature',
          files: ['src/maybe-stale.ts'],
          confidence: 0.9,
        },
      },
    });

    const tasks = Array.from({ length: 3 }, (_, i) =>
      makeTask({
        id: `task_${i}`,
        prediction: {
          predictedFiles: ['src/other.ts'],
          actualFiles: ['src/other.ts'],
          precision: 1,
          recall: 1,
        },
      }),
    );
    const taskHistory = makeTaskHistory(tasks);
    const metrics = makeMetrics();

    const staleFindings = detectStalePatterns(patterns, taskHistory, metrics);
    // Should find stale patterns but mark as limited data
    for (const finding of staleFindings) {
      expect(finding.description).toContain('limited data');
    }

    // Co-occurrence detection should be skipped
    const coocFindings = detectMissingCooccurrences(taskHistory, patterns);
    expect(coocFindings.length).toBe(0);
  });
});

// ─── Domain-focused diagnostics ─────────────────────────────────

describe('domain-focused diagnostics', () => {
  it('only returns domain-relevant findings', async () => {
    initializeStore(projectRoot);

    const tasks = Array.from({ length: 6 }, (_, i) =>
      makeTask({
        id: `task_${i}`,
        classification: {
          taskType: i < 3 ? 'auth' : 'ui',
          complexity: 'medium',
          confidence: 0.8,
        },
        prediction: {
          predictedFiles: ['src/other.ts'],
          actualFiles: ['src/other.ts'],
          precision: 1,
          recall: 1,
        },
      }),
    );
    const taskHistory = makeTaskHistory(tasks);
    writeTaskHistory(projectRoot, taskHistory);

    const patterns = makePatterns({
      typeAffinities: {
        auth: {
          taskType: 'auth',
          files: ['src/stale-auth.ts'],
          confidence: 0.9,
        },
        ui: {
          taskType: 'ui',
          files: ['src/stale-ui.ts'],
          confidence: 0.9,
        },
      },
    });
    writePatterns(projectRoot, patterns);

    const metrics = makeMetrics();
    writeMetrics(projectRoot, metrics);

    // Mock adapter to avoid real calls
    vi.mock('../../src/adapter/index.js', () => ({
      executeRaw: vi.fn().mockRejectedValue(new Error('mock')),
      executeTask: vi.fn().mockRejectedValue(new Error('mock')),
      executeTaskFailOpen: vi.fn().mockRejectedValue(new Error('mock')),
      detectClaudeCode: vi.fn().mockReturnValue({ ok: false, error: 'mock' }),
      resetClaudeCodeCache: vi.fn(),
    }));

    const result = await runDiagnostics(projectRoot, { domain: 'auth' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Should only have auth-related findings
      for (const finding of result.value.findings) {
        // The stale-ui.ts finding should not appear since we filtered to auth domain
        expect(finding.affectedFiles).not.toContain('src/stale-ui.ts');
      }
    }

    vi.restoreAllMocks();
  });
});

// ─── Report rendering ───────────────────────────────────────────

describe('renderDiagnosticReport', () => {
  it('shows health score and no-issues message for healthy store', () => {
    const report: DiagnosticReport = {
      healthScore: { overall: 0.95, perDomain: { core: 0.9 } },
      findings: [],
      recommendations: [],
      tokensCost: 0,
      timestamp: new Date().toISOString(),
    };

    const output = renderDiagnosticReport(report);
    expect(output).toContain('95%');
    expect(output).toContain('No issues found');
    expect(output).toContain('Doctor');
  });

  it('shows findings with severity icons', () => {
    const report: DiagnosticReport = {
      healthScore: { overall: 0.62, perDomain: {} },
      findings: [
        {
          id: 'f_stale_000',
          type: 'stale-pattern',
          severity: 'critical',
          description: 'Stale pattern detected',
          affectedFiles: ['src/old.ts'],
          affectedDomain: 'core',
          evidence: 'weight 0.80, unused in last 5 tasks',
          recommendation: 'Remove from active predictions',
        },
      ],
      recommendations: [],
      tokensCost: 340,
      timestamp: new Date().toISOString(),
    };

    const output = renderDiagnosticReport(report);
    expect(output).toContain('62%');
    expect(output).toContain('stale-pattern');
    expect(output).toContain('Stale pattern detected');
    expect(output).toContain('340 tokens');
  });

  it('report-only mode shows no fix prompts', () => {
    const report: DiagnosticReport = {
      healthScore: { overall: 0.5, perDomain: {} },
      findings: [
        {
          id: 'f_stale_000',
          type: 'stale-pattern',
          severity: 'medium',
          description: 'test',
          affectedFiles: [],
          affectedDomain: 'test',
          evidence: 'test',
          recommendation: 'test',
        },
      ],
      recommendations: [],
      tokensCost: 0,
      timestamp: new Date().toISOString(),
    };

    const output = renderDiagnosticReport(report, true);
    expect(output).not.toContain('Apply all');
    expect(output).not.toContain('[1]');
  });

  it('shows fix options when not report-only and findings exist', () => {
    const report: DiagnosticReport = {
      healthScore: { overall: 0.5, perDomain: {} },
      findings: [
        {
          id: 'f_stale_000',
          type: 'stale-pattern',
          severity: 'medium',
          description: 'test',
          affectedFiles: [],
          affectedDomain: 'test',
          evidence: 'test',
          recommendation: 'test',
        },
      ],
      recommendations: [],
      tokensCost: 0,
      timestamp: new Date().toISOString(),
    };

    const output = renderDiagnosticReport(report, false);
    expect(output).toContain('[1]');
    expect(output).toContain('[2]');
    expect(output).toContain('[3]');
  });

  it('shows per-domain breakdown', () => {
    const report: DiagnosticReport = {
      healthScore: { overall: 0.8, perDomain: { auth: 0.9, ui: 0.6 } },
      findings: [],
      recommendations: [],
      tokensCost: 0,
      timestamp: new Date().toISOString(),
    };

    const output = renderDiagnosticReport(report);
    expect(output).toContain('auth');
    expect(output).toContain('90%');
    expect(output).toContain('ui');
    expect(output).toContain('60%');
  });

  it('shows token cost with Haiku label', () => {
    const report: DiagnosticReport = {
      healthScore: { overall: 0.8, perDomain: {} },
      findings: [],
      recommendations: [],
      tokensCost: 250,
      timestamp: new Date().toISOString(),
    };

    const output = renderDiagnosticReport(report);
    expect(output).toContain('250 tokens (Haiku)');
  });
});

// ─── buildDiagnosticPrompt ──────────────────────────────────────

describe('buildDiagnosticPrompt', () => {
  it('stays under 300 tokens', () => {
    const findings: DiagnosticFinding[] = Array.from({ length: 5 }, (_, i) => ({
      id: `f_stale_${String(i).padStart(3, '0')}`,
      type: 'stale-pattern' as const,
      severity: 'medium' as const,
      description: 'Some stale pattern finding with moderate description length',
      affectedFiles: [`src/file${i}.ts`],
      affectedDomain: 'core',
      evidence: 'weight 0.80, unused in last 5 tasks',
      recommendation: 'Reduce weight',
    }));

    const context = {
      totalTasks: 50,
      recentAccuracy: { precision: 0.8, recall: 0.7 },
      domainCount: 5,
      patternCount: 15,
    };

    const prompt = buildDiagnosticPrompt(findings, context);
    // ~4 chars per token, 300 tokens = 1200 chars
    expect(prompt.length).toBeLessThan(1200);
  });
});

// ─── Adapter failure fallback ───────────────────────────────────

describe('adapter failure fallback', () => {
  it('produces report even when adapter fails', async () => {
    initializeStore(projectRoot);

    const taskHistory = makeTaskHistory([
      makeTask({
        id: 'task_0',
        prediction: {
          predictedFiles: ['src/a.ts'],
          actualFiles: ['src/a.ts'],
          precision: 1,
          recall: 1,
        },
      }),
    ]);
    writeTaskHistory(projectRoot, taskHistory);

    const patterns = makePatterns();
    writePatterns(projectRoot, patterns);

    const metrics = makeMetrics();
    writeMetrics(projectRoot, metrics);

    // Mock adapter to throw
    vi.mock('../../src/adapter/index.js', () => ({
      executeRaw: vi.fn().mockRejectedValue(new Error('Claude Code unavailable')),
      executeTask: vi.fn().mockRejectedValue(new Error('mock')),
      executeTaskFailOpen: vi.fn().mockRejectedValue(new Error('mock')),
      detectClaudeCode: vi.fn().mockReturnValue({ ok: false, error: 'mock' }),
      resetClaudeCodeCache: vi.fn(),
    }));

    const result = await runDiagnostics(projectRoot);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Report should still be generated (local-only analysis)
      expect(result.value.timestamp).toBeDefined();
      expect(result.value.healthScore).toBeDefined();
    }

    vi.restoreAllMocks();
  });
});
