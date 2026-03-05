/**
 * Tests for supervised Doctor mode (Story 7.3).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTempProjectRoot, cleanupTempProjectRoot } from '../helpers/test-store.js';
import { initializeStore } from '../../src/store/index.js';
import type {
  ThresholdAlert,
  FixProposal,
  FixResult,
  SupervisedSession,
  DiagnosticFinding,
} from '../../src/doctor/types.js';
import { MIN_TASKS_FOR_THRESHOLD } from '../../src/doctor/types.js';
import {
  checkThresholds,
  generateFixProposals,
  applyAddCooccurrence,
  applyRemoveStale,
  applyReduceWeight,
  applyFix,
} from '../../src/doctor/supervised.js';
import { readPatterns, writePatterns } from '../../src/store/index.js';
import type { Metrics } from '../../src/types/index.js';
import { DOCTOR_ACCURACY_THRESHOLD } from '../../src/utils/constants.js';

let projectRoot: string;

beforeEach(() => {
  projectRoot = createTempProjectRoot();
  initializeStore(projectRoot);
});

afterEach(() => {
  cleanupTempProjectRoot(projectRoot);
});

// ─── Task 1: Type definitions compile-time check ────────────────

describe('Supervised mode types', () => {
  it('should construct a ThresholdAlert', () => {
    const alert: ThresholdAlert = {
      domain: 'compliance',
      currentAccuracy: 0.48,
      threshold: 0.6,
      timestamp: new Date().toISOString(),
    };
    expect(alert.domain).toBe('compliance');
    expect(alert.currentAccuracy).toBe(0.48);
  });

  it('should construct a FixProposal', () => {
    const finding: DiagnosticFinding = {
      id: 'f_stale_001',
      type: 'stale-pattern',
      severity: 'medium',
      description: 'Stale pattern',
      affectedFiles: ['src/foo.ts'],
      affectedDomain: 'test',
      evidence: 'unused',
      recommendation: 'Remove',
    };
    const proposal: FixProposal = {
      findingId: finding.id,
      finding,
      action: 'remove-stale',
      explanation: 'Pattern is stale',
      riskLevel: 'low',
    };
    expect(proposal.action).toBe('remove-stale');
  });

  it('should construct a FixResult', () => {
    const result: FixResult = {
      proposal: {
        findingId: 'f1',
        finding: {} as DiagnosticFinding,
        action: 'add-cooccurrence',
        explanation: 'test',
        riskLevel: 'low',
      },
      applied: true,
      approvedBy: 'user',
      result: 'Pattern added',
      before: null,
      after: { files: ['a.ts', 'b.ts'], confidence: 0.9 },
    };
    expect(result.applied).toBe(true);
    expect(result.approvedBy).toBe('user');
  });

  it('should construct a SupervisedSession', () => {
    const session: SupervisedSession = {
      alert: { domain: 'test', currentAccuracy: 0.5, threshold: 0.6, timestamp: '' },
      choice: 'diagnose',
      fixes: [],
    };
    expect(session.choice).toBe('diagnose');
  });

  it('should have MIN_TASKS_FOR_THRESHOLD = 3', () => {
    expect(MIN_TASKS_FOR_THRESHOLD).toBe(3);
  });
});

// ─── Task 2: Threshold detection ────────────────────────────────

describe('checkThresholds', () => {
  function makeMetrics(domains: Record<string, { totalTasks: number; avgPrecision: number }>): Metrics {
    const perDomain: Record<string, Metrics['perDomain'][string]> = {};
    for (const [domain, data] of Object.entries(domains)) {
      perDomain[domain] = {
        totalTasks: data.totalTasks,
        avgPrecision: data.avgPrecision,
        avgRecall: 0.8,
        totalTokensConsumed: 1000,
        totalTokensSaved: 200,
      };
    }
    return {
      schemaVersion: '1',
      overall: { totalTasks: 10, totalSessions: 5, avgPrecision: 0.7, avgRecall: 0.8, totalTokensConsumed: 5000, totalTokensSaved: 1000, savingsRate: 0.2 },
      perDomain,
      windows: [],
      predictionTrend: [],
    };
  }

  it('should create alert when domain accuracy is below threshold', () => {
    const metrics = makeMetrics({ compliance: { totalTasks: 5, avgPrecision: 0.48 } });
    const alerts = checkThresholds(metrics, DOCTOR_ACCURACY_THRESHOLD);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].domain).toBe('compliance');
    expect(alerts[0].currentAccuracy).toBe(0.48);
    expect(alerts[0].threshold).toBe(DOCTOR_ACCURACY_THRESHOLD);
  });

  it('should NOT alert when domain accuracy is above threshold', () => {
    const metrics = makeMetrics({ compliance: { totalTasks: 5, avgPrecision: 0.72 } });
    const alerts = checkThresholds(metrics, DOCTOR_ACCURACY_THRESHOLD);
    expect(alerts).toHaveLength(0);
  });

  it('should skip domains with fewer than 3 tasks', () => {
    const metrics = makeMetrics({ compliance: { totalTasks: 2, avgPrecision: 0.1 } });
    const alerts = checkThresholds(metrics, DOCTOR_ACCURACY_THRESHOLD);
    expect(alerts).toHaveLength(0);
  });

  it('should alert for multiple breached domains', () => {
    const metrics = makeMetrics({
      compliance: { totalTasks: 5, avgPrecision: 0.4 },
      auth: { totalTasks: 4, avgPrecision: 0.3 },
      api: { totalTasks: 10, avgPrecision: 0.9 },
    });
    const alerts = checkThresholds(metrics, DOCTOR_ACCURACY_THRESHOLD);
    expect(alerts).toHaveLength(2);
    const domains = alerts.map((a) => a.domain);
    expect(domains).toContain('compliance');
    expect(domains).toContain('auth');
  });

  it('should NOT alert when accuracy equals threshold exactly', () => {
    const metrics = makeMetrics({ compliance: { totalTasks: 5, avgPrecision: 0.6 } });
    const alerts = checkThresholds(metrics, DOCTOR_ACCURACY_THRESHOLD);
    expect(alerts).toHaveLength(0);
  });
});

// ─── Task 4: Fix proposal generation ────────────────────────────

describe('generateFixProposals', () => {
  function makeFinding(overrides: Partial<DiagnosticFinding>): DiagnosticFinding {
    return {
      id: 'f_001',
      type: 'stale-pattern',
      severity: 'medium',
      description: 'test finding',
      affectedFiles: ['src/foo.ts'],
      affectedDomain: 'test',
      evidence: 'test evidence',
      recommendation: 'Fix it',
      ...overrides,
    };
  }

  it('should propose remove-stale for stale-pattern findings', () => {
    const findings = [makeFinding({ type: 'stale-pattern', severity: 'medium' })];
    const proposals = generateFixProposals(findings);
    expect(proposals).toHaveLength(1);
    expect(proposals[0].action).toBe('remove-stale');
    expect(proposals[0].riskLevel).toBe('low');
  });

  it('should propose add-cooccurrence for missing-cooccurrence findings', () => {
    const findings = [makeFinding({ type: 'missing-cooccurrence', severity: 'low' })];
    const proposals = generateFixProposals(findings);
    expect(proposals).toHaveLength(1);
    expect(proposals[0].action).toBe('add-cooccurrence');
    expect(proposals[0].riskLevel).toBe('low');
  });

  it('should propose reduce-weight for bad-prediction findings', () => {
    const findings = [makeFinding({ type: 'bad-prediction', severity: 'medium' })];
    const proposals = generateFixProposals(findings);
    expect(proposals).toHaveLength(1);
    expect(proposals[0].action).toBe('reduce-weight');
    expect(proposals[0].riskLevel).toBe('medium');
  });

  it('should NOT generate proposals for thin-domain/info findings', () => {
    const findings = [makeFinding({ type: 'thin-domain', severity: 'info' })];
    const proposals = generateFixProposals(findings);
    expect(proposals).toHaveLength(0);
  });

  it('should generate proposals for multiple findings', () => {
    const findings = [
      makeFinding({ id: 'f1', type: 'stale-pattern' }),
      makeFinding({ id: 'f2', type: 'missing-cooccurrence' }),
      makeFinding({ id: 'f3', type: 'bad-prediction' }),
      makeFinding({ id: 'f4', type: 'thin-domain', severity: 'info' }),
    ];
    const proposals = generateFixProposals(findings);
    expect(proposals).toHaveLength(3);
  });
});

// ─── Task 6: Apply add co-occurrence ────────────────────────────

describe('applyAddCooccurrence', () => {
  it('should add a co-occurrence pattern to patterns.json', () => {
    const finding: DiagnosticFinding = {
      id: 'f_cooccur_001',
      type: 'missing-cooccurrence',
      severity: 'low',
      description: 'Files appear together',
      affectedFiles: ['src/auth.ts', 'src/auth.test.ts'],
      affectedDomain: 'auth',
      evidence: 'files appeared together in 8/10 tasks (80%)',
      recommendation: 'Add co-occurrence pattern',
    };
    const proposal: FixProposal = {
      findingId: finding.id,
      finding,
      action: 'add-cooccurrence',
      explanation: 'Files frequently co-occur',
      riskLevel: 'low',
    };

    const result = applyAddCooccurrence(proposal, projectRoot);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.applied).toBe(true);
      expect(result.value.before).toBeNull();
      expect(result.value.after).toBeDefined();
    }

    // Verify pattern was actually added to store
    const patternsResult = readPatterns(projectRoot);
    expect(patternsResult.ok).toBe(true);
    if (patternsResult.ok) {
      const cooc = patternsResult.value.coOccurrences.find(
        (c) => c.files.includes('src/auth.ts') && c.files.includes('src/auth.test.ts'),
      );
      expect(cooc).toBeDefined();
      expect(cooc!.confidence).toBeGreaterThan(0);
    }
  });
});

// ─── Task 7: Apply remove stale ──────────────────────────────────

describe('applyRemoveStale', () => {
  it('should set stale pattern weight to 0.0', () => {
    // Seed a pattern with weight > 0
    const patternsResult = readPatterns(projectRoot);
    expect(patternsResult.ok).toBe(true);
    const patterns = patternsResult.value;
    patterns.typeAffinities['Feature'] = {
      taskType: 'Feature',
      files: ['src/stale.ts'],
      confidence: 0.85,
    };
    writePatterns(projectRoot, patterns);

    const finding: DiagnosticFinding = {
      id: 'f_stale_001',
      type: 'stale-pattern',
      severity: 'medium',
      description: 'Stale pattern for Feature → src/stale.ts',
      affectedFiles: ['src/stale.ts'],
      affectedDomain: 'Feature',
      evidence: 'weight 0.85, unused in last 5 tasks',
      recommendation: 'Remove from active predictions',
    };
    const proposal: FixProposal = {
      findingId: finding.id,
      finding,
      action: 'remove-stale',
      explanation: 'Pattern is stale',
      riskLevel: 'low',
    };

    const result = applyRemoveStale(proposal, projectRoot);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.applied).toBe(true);
      expect(result.value.before).toBe(0.85);
      expect(result.value.after).toBe(0.0);
    }

    // Verify pattern weight was set to 0.0
    const updatedPatterns = readPatterns(projectRoot);
    expect(updatedPatterns.ok).toBe(true);
    if (updatedPatterns.ok) {
      expect(updatedPatterns.value.typeAffinities['Feature'].confidence).toBe(0.0);
    }
  });
});

// ─── Task 8: Apply reduce weight ─────────────────────────────────

describe('applyReduceWeight', () => {
  it('should reduce weight proportionally based on hit rate', () => {
    // Seed patterns with a type affinity that has fileWeights
    const patternsResult = readPatterns(projectRoot);
    expect(patternsResult.ok).toBe(true);
    const patterns = patternsResult.value;
    patterns.typeAffinities['BugFix'] = {
      taskType: 'BugFix',
      files: ['src/bad.ts'],
      confidence: 0.9,
      fileWeights: {
        'src/bad.ts': { weight: 0.8, occurrences: 5 },
      },
    };
    writePatterns(projectRoot, patterns);

    const finding: DiagnosticFinding = {
      id: 'f_badpred_001',
      type: 'bad-prediction',
      severity: 'medium',
      description: 'File src/bad.ts consistently predicted but rarely used',
      affectedFiles: ['src/bad.ts'],
      affectedDomain: 'BugFix',
      evidence: 'predicted in 5 tasks, used in 0 (0% hit rate)',
      recommendation: 'Reduce prediction weight',
    };
    const proposal: FixProposal = {
      findingId: finding.id,
      finding,
      action: 'reduce-weight',
      explanation: 'Bad prediction pattern',
      riskLevel: 'medium',
    };

    const result = applyReduceWeight(proposal, projectRoot);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.applied).toBe(true);
      expect(result.value.before).toBe(0.8);
      expect(typeof result.value.after).toBe('number');
      expect(result.value.after as number).toBeLessThan(0.8);
    }
  });
});

// ─── Task 9: Fix dispatcher ──────────────────────────────────────

describe('applyFix', () => {
  it('should route add-cooccurrence to correct handler', () => {
    const finding: DiagnosticFinding = {
      id: 'f_cooccur_001',
      type: 'missing-cooccurrence',
      severity: 'low',
      description: 'Missing co-occurrence',
      affectedFiles: ['src/a.ts', 'src/b.ts'],
      affectedDomain: 'test',
      evidence: 'test',
      recommendation: 'Add pattern',
    };
    const proposal: FixProposal = {
      findingId: finding.id,
      finding,
      action: 'add-cooccurrence',
      explanation: 'test',
      riskLevel: 'low',
    };
    const result = applyFix(proposal, projectRoot);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.applied).toBe(true);
  });

  it('should return error for custom fix action', () => {
    const proposal: FixProposal = {
      findingId: 'f1',
      finding: {} as DiagnosticFinding,
      action: 'custom',
      explanation: 'test',
      riskLevel: 'high',
    };
    const result = applyFix(proposal, projectRoot);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.applied).toBe(false);
  });

  it('should handle store write failure gracefully', () => {
    // Use a non-existent projectRoot to trigger write failure
    const result = applyFix(
      {
        findingId: 'f1',
        finding: {
          id: 'f1',
          type: 'stale-pattern',
          severity: 'medium',
          description: 'test',
          affectedFiles: ['src/foo.ts'],
          affectedDomain: 'test',
          evidence: 'test',
          recommendation: 'test',
        } as DiagnosticFinding,
        action: 'remove-stale',
        explanation: 'test',
        riskLevel: 'low',
      },
      '/nonexistent/path',
    );
    expect(result.ok).toBe(false);
  });
});

// ─── Task 3: Alert rendering ─────────────────────────────────────

describe('renderThresholdAlert', () => {
  it('should render a box-drawing style alert', async () => {
    const { renderThresholdAlert } = await import('../../src/doctor/supervised.js');
    const alert: ThresholdAlert = {
      domain: 'compliance',
      currentAccuracy: 0.48,
      threshold: 0.6,
      timestamp: new Date().toISOString(),
    };
    const output = renderThresholdAlert(alert);
    expect(output).toContain('Doctor Alert');
    expect(output).toContain('compliance');
    expect(output).toContain('48%');
    expect(output).toContain('60%');
    expect(output).toContain('Let Doctor diagnose');
    expect(output).toContain('handle it manually');
    expect(output).toContain('Dismiss');
  });
});

// ─── Task 5: Fix proposal rendering ──────────────────────────────

describe('renderFixProposal', () => {
  it('should render a fix proposal with options', async () => {
    const { renderFixProposal } = await import('../../src/doctor/supervised.js');
    const finding: DiagnosticFinding = {
      id: 'f_stale_001',
      type: 'stale-pattern',
      severity: 'medium',
      description: 'Stale pattern detected',
      affectedFiles: ['src/foo.ts'],
      affectedDomain: 'test',
      evidence: 'unused in last 5 tasks',
      recommendation: 'Remove',
    };
    const proposal: FixProposal = {
      findingId: finding.id,
      finding,
      action: 'remove-stale',
      explanation: 'Pattern is stale and should be removed',
      riskLevel: 'low',
    };
    const output = renderFixProposal(proposal, 1, 3);
    expect(output).toContain('Fix 1/3');
    expect(output).toContain('stale-pattern');
    expect(output).toContain('Apply');
    expect(output).toContain('Skip');
    expect(output).toContain('Apply All');
  });
});

// ─── Dismiss choice ──────────────────────────────────────────────

describe('dismiss and manual handling', () => {
  it('should return empty fixes for dismiss choice', () => {
    const session: SupervisedSession = {
      alert: { domain: 'test', currentAccuracy: 0.4, threshold: 0.6, timestamp: '' },
      choice: 'dismiss',
      fixes: [],
    };
    expect(session.fixes).toHaveLength(0);
    expect(session.report).toBeUndefined();
  });

  it('should return empty fixes for manual choice', () => {
    const session: SupervisedSession = {
      alert: { domain: 'test', currentAccuracy: 0.4, threshold: 0.6, timestamp: '' },
      choice: 'manual',
      fixes: [],
    };
    expect(session.fixes).toHaveLength(0);
  });
});
