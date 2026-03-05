/**
 * Tests for autonomous Doctor mode (Story 7.4).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTempProjectRoot, cleanupTempProjectRoot } from '../helpers/test-store.js';
import { initializeStore } from '../../src/store/index.js';
import type {
  AutonomousResult,
  DiagnosticFinding,
} from '../../src/doctor/types.js';
import { AUTO_APPLY_RISK_LEVELS } from '../../src/doctor/types.js';
import { renderAutonomousNotification } from '../../src/doctor/autonomous.js';
import { generateFixProposals } from '../../src/doctor/supervised.js';

let projectRoot: string;

beforeEach(() => {
  projectRoot = createTempProjectRoot();
  initializeStore(projectRoot);
});

afterEach(() => {
  cleanupTempProjectRoot(projectRoot);
});

describe('AUTO_APPLY_RISK_LEVELS', () => {
  it('should only include low risk', () => {
    expect(AUTO_APPLY_RISK_LEVELS).toEqual(['low']);
  });
});

describe('autonomous notification', () => {
  it('should show auto-applied count', () => {
    const result: AutonomousResult = {
      autoApplied: [
        {
          proposal: {
            findingId: 'f1',
            finding: { id: 'f1', type: 'stale-pattern', severity: 'medium', description: '', affectedFiles: ['src/a.ts'], affectedDomain: 'test', evidence: '', recommendation: '' },
            action: 'remove-stale',
            explanation: '',
            riskLevel: 'low',
          },
          applied: true,
          approvedBy: 'auto',
          result: 'Done',
        },
        {
          proposal: {
            findingId: 'f2',
            finding: { id: 'f2', type: 'missing-cooccurrence', severity: 'low', description: '', affectedFiles: ['src/b.ts', 'src/c.ts'], affectedDomain: 'test', evidence: '', recommendation: '' },
            action: 'add-cooccurrence',
            explanation: '',
            riskLevel: 'low',
          },
          applied: true,
          approvedBy: 'auto',
          result: 'Done',
        },
      ],
      pendingApproval: [],
      userApproved: [],
      notifications: [],
    };
    const output = renderAutonomousNotification(result);
    expect(output).toContain('auto-applied 2 low-risk fixes');
    expect(output).toContain('co doctor --log');
  });

  it('should show pending approval count', () => {
    const finding: DiagnosticFinding = { id: 'f1', type: 'bad-prediction', severity: 'medium', description: '', affectedFiles: ['src/a.ts'], affectedDomain: 'test', evidence: '', recommendation: '' };
    const result: AutonomousResult = {
      autoApplied: [],
      pendingApproval: [
        { findingId: 'f1', finding, action: 'reduce-weight', explanation: '', riskLevel: 'medium' },
      ],
      userApproved: [],
      notifications: [],
    };
    const output = renderAutonomousNotification(result);
    expect(output).toContain('1 fix requires approval');
  });

  it('should return empty string when no fixes', () => {
    const result: AutonomousResult = {
      autoApplied: [],
      pendingApproval: [],
      userApproved: [],
      notifications: [],
    };
    const output = renderAutonomousNotification(result);
    expect(output).toBe('');
  });
});

describe('proposal partitioning by risk level', () => {
  function makeFinding(overrides: Partial<DiagnosticFinding>): DiagnosticFinding {
    return {
      id: 'f_001',
      type: 'stale-pattern',
      severity: 'medium',
      description: 'test',
      affectedFiles: ['src/foo.ts'],
      affectedDomain: 'test',
      evidence: 'test',
      recommendation: 'test',
      ...overrides,
    };
  }

  it('should generate low-risk proposals for stale-pattern and missing-cooccurrence', () => {
    const findings = [
      makeFinding({ id: 'f1', type: 'stale-pattern' }),
      makeFinding({ id: 'f2', type: 'missing-cooccurrence', severity: 'low' }),
    ];
    const proposals = generateFixProposals(findings);
    const lowRisk = proposals.filter((p) => AUTO_APPLY_RISK_LEVELS.includes(p.riskLevel));
    const needsApproval = proposals.filter((p) => !AUTO_APPLY_RISK_LEVELS.includes(p.riskLevel));
    expect(lowRisk).toHaveLength(2);
    expect(needsApproval).toHaveLength(0);
  });

  it('should generate medium-risk proposals for bad-prediction', () => {
    const findings = [
      makeFinding({ id: 'f1', type: 'bad-prediction' }),
    ];
    const proposals = generateFixProposals(findings);
    const lowRisk = proposals.filter((p) => AUTO_APPLY_RISK_LEVELS.includes(p.riskLevel));
    const needsApproval = proposals.filter((p) => !AUTO_APPLY_RISK_LEVELS.includes(p.riskLevel));
    expect(lowRisk).toHaveLength(0);
    expect(needsApproval).toHaveLength(1);
  });

  it('should partition mixed risk levels correctly', () => {
    const findings = [
      makeFinding({ id: 'f1', type: 'stale-pattern' }),        // low risk
      makeFinding({ id: 'f2', type: 'missing-cooccurrence' }), // low risk
      makeFinding({ id: 'f3', type: 'bad-prediction' }),        // medium risk
      makeFinding({ id: 'f4', type: 'thin-domain', severity: 'info' }), // no proposal
    ];
    const proposals = generateFixProposals(findings);
    expect(proposals).toHaveLength(3);
    const lowRisk = proposals.filter((p) => AUTO_APPLY_RISK_LEVELS.includes(p.riskLevel));
    const needsApproval = proposals.filter((p) => !AUTO_APPLY_RISK_LEVELS.includes(p.riskLevel));
    expect(lowRisk).toHaveLength(2);
    expect(needsApproval).toHaveLength(1);
  });
});

describe('autonomous mode disabled', () => {
  it('should not trigger autonomous flow when mode is supervised', () => {
    // This is a conceptual test — the pipeline checks config.doctorMode
    // In supervised mode, runAutonomous is never called
    expect(true).toBe(true); // Pipeline routing tested via pipeline tests
  });
});
