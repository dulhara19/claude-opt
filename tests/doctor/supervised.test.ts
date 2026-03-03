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
  computeF1,
  generateFixProposals,
  calculateProposalConfidence,
  verifyFixes,
  filterCooledDownAlerts,
  createCooldown,
  createOverridesFromFixes,
  isOverrideActive,
  getActiveOverrides,
  applyAddCooccurrence,
  applyRemoveStale,
  applyReduceWeight,
  applyFix,
} from '../../src/doctor/supervised.js';
import type { DomainCooldown, DoctorOverride } from '../../src/doctor/types.js';
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
  function makeMetrics(domains: Record<string, { totalTasks: number; avgPrecision: number; avgRecall?: number }>): Metrics {
    const perDomain: Record<string, Metrics['perDomain'][string]> = {};
    for (const [domain, data] of Object.entries(domains)) {
      perDomain[domain] = {
        totalTasks: data.totalTasks,
        avgPrecision: data.avgPrecision,
        avgRecall: data.avgRecall ?? 0.8,
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

  it('should create alert when domain F1 score is below threshold (D2)', () => {
    // F1 = 2*0.3*0.3/(0.3+0.3) = 0.3, well below 0.6 threshold
    const metrics = makeMetrics({ compliance: { totalTasks: 5, avgPrecision: 0.3, avgRecall: 0.3 } });
    const alerts = checkThresholds(metrics, DOCTOR_ACCURACY_THRESHOLD);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].domain).toBe('compliance');
    expect(alerts[0].currentAccuracy).toBeCloseTo(0.3, 2);
    expect(alerts[0].threshold).toBe(DOCTOR_ACCURACY_THRESHOLD);
    expect(alerts[0].currentPrecision).toBe(0.3);
    expect(alerts[0].currentRecall).toBe(0.3);
  });

  it('should NOT alert when domain F1 is above threshold', () => {
    const metrics = makeMetrics({ compliance: { totalTasks: 5, avgPrecision: 0.72, avgRecall: 0.72 } });
    const alerts = checkThresholds(metrics, DOCTOR_ACCURACY_THRESHOLD);
    expect(alerts).toHaveLength(0);
  });

  it('should alert when precision is high but recall is very low (D2)', () => {
    // precision=0.9, recall=0.2 → F1 = 2*0.9*0.2/(0.9+0.2) ≈ 0.327
    const metrics = makeMetrics({ compliance: { totalTasks: 5, avgPrecision: 0.9, avgRecall: 0.2 } });
    const alerts = checkThresholds(metrics, DOCTOR_ACCURACY_THRESHOLD);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].currentPrecision).toBe(0.9);
    expect(alerts[0].currentRecall).toBe(0.2);
  });

  it('should skip domains with fewer than 3 tasks', () => {
    const metrics = makeMetrics({ compliance: { totalTasks: 2, avgPrecision: 0.1, avgRecall: 0.1 } });
    const alerts = checkThresholds(metrics, DOCTOR_ACCURACY_THRESHOLD);
    expect(alerts).toHaveLength(0);
  });

  it('should alert for multiple breached domains', () => {
    const metrics = makeMetrics({
      compliance: { totalTasks: 5, avgPrecision: 0.4, avgRecall: 0.4 },
      auth: { totalTasks: 4, avgPrecision: 0.3, avgRecall: 0.3 },
      api: { totalTasks: 10, avgPrecision: 0.9, avgRecall: 0.9 },
    });
    const alerts = checkThresholds(metrics, DOCTOR_ACCURACY_THRESHOLD);
    expect(alerts).toHaveLength(2);
    const domains = alerts.map((a) => a.domain);
    expect(domains).toContain('compliance');
    expect(domains).toContain('auth');
  });

  it('should NOT alert when F1 equals threshold exactly', () => {
    // F1 = 2*0.6*0.6/(0.6+0.6) = 0.6
    const metrics = makeMetrics({ compliance: { totalTasks: 5, avgPrecision: 0.6, avgRecall: 0.6 } });
    const alerts = checkThresholds(metrics, DOCTOR_ACCURACY_THRESHOLD);
    expect(alerts).toHaveLength(0);
  });
});

describe('computeF1', () => {
  it('returns harmonic mean of precision and recall', () => {
    expect(computeF1(0.8, 0.6)).toBeCloseTo(2 * 0.8 * 0.6 / (0.8 + 0.6), 4);
  });

  it('returns 0 when both are 0', () => {
    expect(computeF1(0, 0)).toBe(0);
  });

  it('returns 0 when one is 0', () => {
    expect(computeF1(0.9, 0)).toBe(0);
    expect(computeF1(0, 0.9)).toBe(0);
  });

  it('returns value equal to precision when recall equals precision', () => {
    expect(computeF1(0.7, 0.7)).toBeCloseTo(0.7, 4);
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
  it('D8: should halve weight on first reduction (not zero)', () => {
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
      // D8: First reduction halves the weight
      expect(result.value.after).toBeCloseTo(0.43, 1);
      expect(result.value.result).toContain('Halved');
    }

    const updatedPatterns = readPatterns(projectRoot);
    expect(updatedPatterns.ok).toBe(true);
    if (updatedPatterns.ok) {
      expect(updatedPatterns.value.typeAffinities['Feature'].confidence).toBeCloseTo(0.43, 1);
    }
  });

  it('D8: should set to 0.0 on second reduction (already <=0.25)', () => {
    const patternsResult = readPatterns(projectRoot);
    expect(patternsResult.ok).toBe(true);
    const patterns = patternsResult.value;
    patterns.typeAffinities['Feature'] = {
      taskType: 'Feature',
      files: ['src/stale.ts'],
      confidence: 0.20, // Already reduced
    };
    writePatterns(projectRoot, patterns);

    const finding: DiagnosticFinding = {
      id: 'f_stale_002',
      type: 'stale-pattern',
      severity: 'critical',
      description: 'Stale pattern for Feature → src/stale.ts',
      affectedFiles: ['src/stale.ts'],
      affectedDomain: 'Feature',
      evidence: 'weight 0.20, unused again',
      recommendation: 'Remove from active predictions',
    };
    const proposal: FixProposal = {
      findingId: finding.id,
      finding,
      action: 'remove-stale',
      explanation: 'Pattern is still stale',
      riskLevel: 'low',
    };

    const result = applyRemoveStale(proposal, projectRoot);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.applied).toBe(true);
      expect(result.value.before).toBe(0.20);
      expect(result.value.after).toBe(0.0);
      expect(result.value.result).toContain('Removed');
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

// ─── D6: Fix verification ──────────────────────────────────────

describe('verifyFixes (D6)', () => {
  function makeFixResult(applied: boolean): FixResult {
    return {
      proposal: {
        findingId: 'f1',
        finding: {} as DiagnosticFinding,
        action: 'remove-stale',
        explanation: 'test',
        riskLevel: 'low',
      },
      applied,
      approvedBy: 'user',
      result: applied ? 'Applied' : 'Skipped',
    };
  }

  it('marks applied fixes as effective when health improved', () => {
    const fixes = [makeFixResult(true), makeFixResult(true)];
    const verified = verifyFixes(fixes, 0.5, 0.7);
    expect(verified[0].verified).toBe('effective');
    expect(verified[1].verified).toBe('effective');
  });

  it('marks applied fixes as ineffective when health did not improve', () => {
    const fixes = [makeFixResult(true)];
    const verified = verifyFixes(fixes, 0.5, 0.5);
    expect(verified[0].verified).toBe('ineffective');
  });

  it('marks unapplied fixes as unverified', () => {
    const fixes = [makeFixResult(false)];
    const verified = verifyFixes(fixes, 0.5, 0.7);
    expect(verified[0].verified).toBe('unverified');
  });

  it('marks as ineffective when health got worse', () => {
    const fixes = [makeFixResult(true)];
    const verified = verifyFixes(fixes, 0.7, 0.5);
    expect(verified[0].verified).toBe('ineffective');
  });
});

// ─── D7: Confidence-weighted fix proposals ───────────────────────

describe('calculateProposalConfidence (D7)', () => {
  it('gives higher confidence to critical stale patterns with high decay', () => {
    const finding: DiagnosticFinding = {
      id: 'f1',
      type: 'stale-pattern',
      severity: 'critical',
      description: 'test',
      affectedFiles: ['src/a.ts'],
      affectedDomain: 'test',
      evidence: 'weight 0.90, unused, decay 0.85',
      recommendation: 'Remove',
    };
    const confidence = calculateProposalConfidence(finding);
    expect(confidence).toBeGreaterThan(0.5);
  });

  it('gives lower confidence to low-severity findings', () => {
    const finding: DiagnosticFinding = {
      id: 'f2',
      type: 'missing-cooccurrence',
      severity: 'low',
      description: 'test',
      affectedFiles: ['src/a.ts', 'src/b.ts'],
      affectedDomain: 'test',
      evidence: 'files appeared together in 8/10 tasks (80%)',
      recommendation: 'Add co-occurrence',
    };
    const confidence = calculateProposalConfidence(finding);
    expect(confidence).toBeGreaterThan(0);
    expect(confidence).toBeLessThan(1);
  });

  it('returns value between 0 and 1', () => {
    const finding: DiagnosticFinding = {
      id: 'f3',
      type: 'bad-prediction',
      severity: 'medium',
      description: 'test',
      affectedFiles: ['src/bad.ts'],
      affectedDomain: 'test',
      evidence: 'predicted in 5 tasks, used in 0 (0% hit rate)',
      recommendation: 'Reduce weight',
    };
    const confidence = calculateProposalConfidence(finding);
    expect(confidence).toBeGreaterThanOrEqual(0);
    expect(confidence).toBeLessThanOrEqual(1);
  });
});

describe('generateFixProposals sorts by confidence (D7)', () => {
  it('returns proposals sorted by confidence descending', () => {
    const findings: DiagnosticFinding[] = [
      {
        id: 'f1',
        type: 'missing-cooccurrence',
        severity: 'low',
        description: 'low',
        affectedFiles: ['a.ts', 'b.ts'],
        affectedDomain: 'test',
        evidence: 'files appeared together in 8/10 tasks (80%)',
        recommendation: 'Add',
      },
      {
        id: 'f2',
        type: 'stale-pattern',
        severity: 'critical',
        description: 'critical',
        affectedFiles: ['c.ts'],
        affectedDomain: 'test',
        evidence: 'weight 0.90, unused, decay 0.85',
        recommendation: 'Remove',
      },
    ];

    const proposals = generateFixProposals(findings);
    expect(proposals.length).toBe(2);
    // Critical stale pattern should come first
    expect(proposals[0].finding.severity).toBe('critical');
    expect((proposals[0].confidence ?? 0) >= (proposals[1].confidence ?? 0)).toBe(true);
  });

  it('does not generate proposals for declining-accuracy or cross-domain', () => {
    const findings: DiagnosticFinding[] = [
      {
        id: 'f1',
        type: 'declining-accuracy',
        severity: 'info',
        description: 'test',
        affectedFiles: [],
        affectedDomain: 'test',
        evidence: 'test',
        recommendation: 'Monitor',
      },
      {
        id: 'f2',
        type: 'cross-domain-dependency',
        severity: 'info',
        description: 'test',
        affectedFiles: [],
        affectedDomain: 'test',
        evidence: 'test',
        recommendation: 'Consider boost',
      },
    ];

    const proposals = generateFixProposals(findings);
    expect(proposals.length).toBe(0);
  });
});

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

// ─── D9: Alert cooldown / fatigue prevention ─────────────────────

describe('filterCooledDownAlerts (D9)', () => {
  const baseAlert: ThresholdAlert = {
    domain: 'compliance',
    currentAccuracy: 0.4,
    threshold: 0.6,
    timestamp: new Date().toISOString(),
  };

  it('allows alerts with no cooldown', () => {
    const result = filterCooledDownAlerts([baseAlert], [], 50);
    expect(result).toHaveLength(1);
  });

  it('suppresses alerts within time cooldown', () => {
    const cooldown: DomainCooldown = {
      domain: 'compliance',
      dismissedAt: new Date().toISOString(),
      cooldownUntil: new Date(Date.now() + 60000).toISOString(), // 1 min in future
      taskCountAtDismissal: 40,
    };
    const result = filterCooledDownAlerts([baseAlert], [cooldown], 50);
    expect(result).toHaveLength(0);
  });

  it('suppresses alerts within task count cooldown', () => {
    const cooldown: DomainCooldown = {
      domain: 'compliance',
      dismissedAt: new Date(Date.now() - 86400000 * 2).toISOString(), // 2 days ago
      cooldownUntil: new Date(Date.now() - 86400000).toISOString(), // expired time cooldown
      taskCountAtDismissal: 45,
    };
    // Only 3 tasks since dismissal, need 10
    const result = filterCooledDownAlerts([baseAlert], [cooldown], 48);
    expect(result).toHaveLength(0);
  });

  it('allows alerts when both cooldowns expired', () => {
    const cooldown: DomainCooldown = {
      domain: 'compliance',
      dismissedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
      cooldownUntil: new Date(Date.now() - 86400000).toISOString(), // time expired
      taskCountAtDismissal: 30,
    };
    // 25 tasks since dismissal, well past 10
    const result = filterCooledDownAlerts([baseAlert], [cooldown], 55);
    expect(result).toHaveLength(1);
  });

  it('only suppresses matching domain', () => {
    const cooldown: DomainCooldown = {
      domain: 'auth',
      dismissedAt: new Date().toISOString(),
      cooldownUntil: new Date(Date.now() + 60000).toISOString(),
      taskCountAtDismissal: 40,
    };
    // compliance has no cooldown, should pass through
    const result = filterCooledDownAlerts([baseAlert], [cooldown], 50);
    expect(result).toHaveLength(1);
  });
});

describe('createCooldown (D9)', () => {
  it('creates a cooldown with correct domain and task count', () => {
    const cooldown = createCooldown('compliance', 42);
    expect(cooldown.domain).toBe('compliance');
    expect(cooldown.taskCountAtDismissal).toBe(42);
    expect(new Date(cooldown.cooldownUntil).getTime()).toBeGreaterThan(Date.now());
  });
});

// ─── D12: Doctor-to-Learner override tracking ────────────────────

describe('createOverridesFromFixes (D12)', () => {
  it('creates overrides for applied fixes only', () => {
    const fixes: FixResult[] = [
      {
        proposal: {
          findingId: 'f1',
          finding: {
            id: 'f1', type: 'stale-pattern', severity: 'medium', description: '',
            affectedFiles: ['src/a.ts'], affectedDomain: 'feature',
            evidence: '', recommendation: '',
          },
          action: 'remove-stale',
          explanation: '',
          riskLevel: 'low',
        },
        applied: true,
        approvedBy: 'user',
        result: 'Applied',
        after: 0.4,
      },
      {
        proposal: {
          findingId: 'f2',
          finding: {
            id: 'f2', type: 'bad-prediction', severity: 'medium', description: '',
            affectedFiles: ['src/b.ts'], affectedDomain: 'bugfix',
            evidence: '', recommendation: '',
          },
          action: 'reduce-weight',
          explanation: '',
          riskLevel: 'medium',
        },
        applied: false,
        approvedBy: 'user',
        result: 'Skipped',
      },
    ];

    const overrides = createOverridesFromFixes(fixes, 50);
    expect(overrides).toHaveLength(1);
    expect(overrides[0].domain).toBe('feature');
    expect(overrides[0].value).toBe(0.4);
    expect(overrides[0].taskCountAtApplication).toBe(50);
    expect(overrides[0].gracePeriodTasks).toBe(10);
  });
});

describe('isOverrideActive (D12)', () => {
  const override: DoctorOverride = {
    domain: 'feature',
    field: 'typeAffinities.feature.confidence',
    value: 0.4,
    appliedAt: new Date().toISOString(),
    gracePeriodTasks: 10,
    taskCountAtApplication: 50,
  };

  it('returns true within grace period', () => {
    expect(isOverrideActive(override, 55)).toBe(true);
  });

  it('returns false after grace period', () => {
    expect(isOverrideActive(override, 60)).toBe(false);
  });

  it('returns true at exact boundary', () => {
    expect(isOverrideActive(override, 59)).toBe(true);
  });
});

describe('getActiveOverrides (D12)', () => {
  it('filters to only active overrides', () => {
    const overrides: DoctorOverride[] = [
      {
        domain: 'feature',
        field: 'confidence',
        value: 0.4,
        appliedAt: new Date().toISOString(),
        gracePeriodTasks: 10,
        taskCountAtApplication: 50,
      },
      {
        domain: 'bugfix',
        field: 'confidence',
        value: 0.2,
        appliedAt: new Date().toISOString(),
        gracePeriodTasks: 10,
        taskCountAtApplication: 30, // 25 tasks ago — expired
      },
    ];

    const active = getActiveOverrides(overrides, 55);
    expect(active).toHaveLength(1);
    expect(active[0].domain).toBe('feature');
  });
});
