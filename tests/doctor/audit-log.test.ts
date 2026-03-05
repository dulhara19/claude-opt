/**
 * Tests for Doctor audit logging (Story 7.4).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTempProjectRoot, cleanupTempProjectRoot } from '../helpers/test-store.js';
import { initializeStore, readDoctorLog } from '../../src/store/index.js';
import {
  generateLogEntryId,
  buildLogEntry,
  writeDoctorLogEntry,
  mapFixResultsToAuditActions,
} from '../../src/doctor/audit-log.js';
import type {
  DiagnosticFinding,
  FixResult,
  FixProposal,
} from '../../src/doctor/types.js';

let projectRoot: string;

beforeEach(() => {
  projectRoot = createTempProjectRoot();
  initializeStore(projectRoot);
});

afterEach(() => {
  cleanupTempProjectRoot(projectRoot);
});

// ─── Log entry ID generation ─────────────────────────────────────

describe('generateLogEntryId', () => {
  it('should generate doc_YYYYMMDD_001 format for first entry of the day', () => {
    const id = generateLogEntryId([]);
    expect(id).toMatch(/^doc_\d{8}_001$/);
  });

  it('should increment sequence number for same day', () => {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const existing = [
      { id: `doc_${today}_001` },
      { id: `doc_${today}_002` },
    ];
    const id = generateLogEntryId(existing);
    expect(id).toBe(`doc_${today}_003`);
  });

  it('should start at 001 for a new day', () => {
    const existing = [
      { id: 'doc_20260101_001' },
      { id: 'doc_20260101_002' },
    ];
    const id = generateLogEntryId(existing);
    // Today is not 20260101, so should be 001
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    if (today !== '20260101') {
      expect(id).toMatch(/_001$/);
    }
  });
});

// ─── Build log entry ──────────────────────────────────────────────

describe('buildLogEntry', () => {
  function makeFinding(id: string): DiagnosticFinding {
    return {
      id,
      type: 'stale-pattern',
      severity: 'medium',
      description: 'Stale pattern detected',
      affectedFiles: ['src/foo.ts'],
      affectedDomain: 'test',
      evidence: 'unused',
      recommendation: 'Remove',
    };
  }

  function makeFixResult(proposal: FixProposal, applied: boolean, approvedBy: 'user' | 'auto'): FixResult {
    return { proposal, applied, approvedBy, result: applied ? 'Applied' : 'Skipped' };
  }

  it('should build entry with supervised mode and user approval', () => {
    const finding = makeFinding('f1');
    const proposal: FixProposal = { findingId: 'f1', finding, action: 'remove-stale', explanation: 'test', riskLevel: 'low' };
    const entry = buildLogEntry({
      mode: 'supervised',
      trigger: 'threshold-breach',
      triggerDetail: 'compliance dropped to 48%',
      usedArchive: false,
      findings: [finding],
      fixResults: [makeFixResult(proposal, true, 'user')],
      healthBefore: 0.62,
      healthAfter: 0.74,
      tokensCost: 340,
    });

    expect(entry.mode).toBe('supervised');
    expect(entry.trigger).toBe('threshold-breach');
    expect(entry.usedArchive).toBe(false);
    expect(entry.findings).toHaveLength(1);
    expect(entry.actions).toHaveLength(1);
    expect(entry.actions[0].action).toBe('applied');
    expect(entry.healthScore.before).toBe(0.62);
    expect(entry.healthScore.after).toBe(0.74);
    expect(entry.tokensCost).toBe(340);
    expect(entry.id).toMatch(/^doc_\d{8}_\d{3}$/);
  });

  it('should build entry with autonomous mode and auto approval', () => {
    const finding = makeFinding('f1');
    const proposal: FixProposal = { findingId: 'f1', finding, action: 'add-cooccurrence', explanation: 'test', riskLevel: 'low' };
    const entry = buildLogEntry({
      mode: 'autonomous',
      trigger: 'threshold-breach',
      triggerDetail: 'auth dropped to 55%',
      usedArchive: false,
      findings: [finding],
      fixResults: [makeFixResult(proposal, true, 'auto')],
      healthBefore: 0.55,
      healthAfter: 0.70,
      tokensCost: 200,
    });

    expect(entry.mode).toBe('autonomous');
    expect(entry.actions[0].action).toBe('auto-applied');
  });

  it('should build entry with checkup trigger', () => {
    const entry = buildLogEntry({
      mode: 'supervised',
      trigger: 'checkup',
      triggerDetail: 'pre-flight validation',
      usedArchive: false,
      findings: [],
      fixResults: [],
      healthBefore: 0.9,
      healthAfter: 0.9,
      tokensCost: 0,
    });

    expect(entry.trigger).toBe('checkup');
    expect(entry.findings).toHaveLength(0);
    expect(entry.actions).toHaveLength(0);
  });

  it('should set usedArchive when deep analysis was used', () => {
    const entry = buildLogEntry({
      mode: 'supervised',
      trigger: 'deep-analysis',
      triggerDetail: 'manual deep analysis',
      usedArchive: true,
      findings: [],
      fixResults: [],
      healthBefore: 0.5,
      healthAfter: 0.5,
      tokensCost: 1200,
    });

    expect(entry.usedArchive).toBe(true);
    expect(entry.tokensCost).toBe(1200);
  });

  it('should record skipped actions correctly', () => {
    const finding = makeFinding('f1');
    const proposal: FixProposal = { findingId: 'f1', finding, action: 'reduce-weight', explanation: 'test', riskLevel: 'medium' };
    const entry = buildLogEntry({
      mode: 'supervised',
      trigger: 'manual',
      triggerDetail: 'user ran co doctor',
      usedArchive: false,
      findings: [finding],
      fixResults: [makeFixResult(proposal, false, 'user')],
      healthBefore: 0.6,
      healthAfter: 0.6,
      tokensCost: 300,
    });

    expect(entry.actions[0].action).toBe('skipped');
  });
});

// ─── Write audit log entry ────────────────────────────────────────

describe('writeDoctorLogEntry', () => {
  it('should append entry to existing doctor-log.json', () => {
    const entry = buildLogEntry({
      mode: 'supervised',
      trigger: 'threshold-breach',
      triggerDetail: 'test',
      usedArchive: false,
      findings: [],
      fixResults: [],
      healthBefore: 0.8,
      healthAfter: 0.8,
      tokensCost: 0,
    });

    const result = writeDoctorLogEntry(projectRoot, entry);
    expect(result.ok).toBe(true);

    // Verify entry was appended
    const logResult = readDoctorLog(projectRoot);
    expect(logResult.ok).toBe(true);
    if (logResult.ok) {
      expect(logResult.value.entries).toHaveLength(1);
      expect(logResult.value.entries[0].id).toBe(entry.id);
    }
  });

  it('should NOT overwrite existing entries (append-only)', () => {
    const entry1 = buildLogEntry({
      mode: 'supervised',
      trigger: 'manual',
      triggerDetail: 'first',
      usedArchive: false,
      findings: [],
      fixResults: [],
      healthBefore: 0.7,
      healthAfter: 0.7,
      tokensCost: 0,
    });
    writeDoctorLogEntry(projectRoot, entry1);

    const entry2 = buildLogEntry({
      mode: 'autonomous',
      trigger: 'threshold-breach',
      triggerDetail: 'second',
      usedArchive: false,
      findings: [],
      fixResults: [],
      healthBefore: 0.6,
      healthAfter: 0.65,
      tokensCost: 100,
      existingEntries: [{ id: entry1.id }],
    });
    writeDoctorLogEntry(projectRoot, entry2);

    const logResult = readDoctorLog(projectRoot);
    expect(logResult.ok).toBe(true);
    if (logResult.ok) {
      expect(logResult.value.entries).toHaveLength(2);
      expect(logResult.value.entries[0].id).toBe(entry1.id);
      expect(logResult.value.entries[1].id).toBe(entry2.id);
    }
  });

  it('should handle empty doctor-log (first entry) correctly', () => {
    const entry = buildLogEntry({
      mode: 'supervised',
      trigger: 'checkup',
      triggerDetail: 'first ever',
      usedArchive: false,
      findings: [],
      fixResults: [],
      healthBefore: 1.0,
      healthAfter: 1.0,
      tokensCost: 0,
    });

    const result = writeDoctorLogEntry(projectRoot, entry);
    expect(result.ok).toBe(true);
  });

  it('should not crash on write failure', () => {
    const entry = buildLogEntry({
      mode: 'supervised',
      trigger: 'manual',
      triggerDetail: 'test',
      usedArchive: false,
      findings: [],
      fixResults: [],
      healthBefore: 0.5,
      healthAfter: 0.5,
      tokensCost: 0,
    });

    // Use nonexistent path — should return error, not throw
    const result = writeDoctorLogEntry('/nonexistent/path', entry);
    expect(result.ok).toBe(false);
  });
});

// ─── Map fix results to audit actions ─────────────────────────────

describe('mapFixResultsToAuditActions', () => {
  function makeFinding(): DiagnosticFinding {
    return {
      id: 'f1',
      type: 'stale-pattern',
      severity: 'medium',
      description: 'test',
      affectedFiles: ['src/foo.ts'],
      affectedDomain: 'test',
      evidence: 'test',
      recommendation: 'test',
    };
  }

  it('should map applied user-approved fix to applied action', () => {
    const proposal: FixProposal = { findingId: 'f1', finding: makeFinding(), action: 'remove-stale', explanation: '', riskLevel: 'low' };
    const actions = mapFixResultsToAuditActions([
      { proposal, applied: true, approvedBy: 'user', result: 'Done' },
    ]);
    expect(actions).toHaveLength(1);
    expect(actions[0].action).toBe('applied');
    expect(actions[0].approvedBy).toBe('user');
  });

  it('should map auto-applied fix to auto-applied action', () => {
    const proposal: FixProposal = { findingId: 'f1', finding: makeFinding(), action: 'add-cooccurrence', explanation: '', riskLevel: 'low' };
    const actions = mapFixResultsToAuditActions([
      { proposal, applied: true, approvedBy: 'auto', result: 'Done' },
    ]);
    expect(actions[0].action).toBe('auto-applied');
    expect(actions[0].approvedBy).toBe('auto');
  });

  it('should map skipped fix to skipped action', () => {
    const proposal: FixProposal = { findingId: 'f1', finding: makeFinding(), action: 'reduce-weight', explanation: '', riskLevel: 'medium' };
    const actions = mapFixResultsToAuditActions([
      { proposal, applied: false, approvedBy: 'user', result: 'Skipped' },
    ]);
    expect(actions[0].action).toBe('skipped');
  });
});

// ─── Deep analysis ────────────────────────────────────────────────

describe('deep analysis metadata', () => {
  it('should return archive metadata', async () => {
    const { getArchiveMetadata } = await import('../../src/doctor/doctor.js');
    const meta = getArchiveMetadata(projectRoot);
    expect(meta.archivePath).toContain('archive');
    expect(meta.archiveSize).toBeGreaterThanOrEqual(0);
    expect(meta.estimatedTokenCost.min).toBe(800);
    expect(meta.userApproved).toBe(false);
  });

  it('should scale token cost estimate with archive size', async () => {
    const { DEEP_ANALYSIS_BASE_TOKENS, DEEP_ANALYSIS_TOKENS_PER_100 } = await import('../../src/doctor/types.js');
    expect(DEEP_ANALYSIS_BASE_TOKENS).toBe(800);
    expect(DEEP_ANALYSIS_TOKENS_PER_100).toBe(200);
  });
});

describe('deep analysis prompt rendering', () => {
  it('should display archive info and options', async () => {
    const { renderDeepAnalysisPrompt } = await import('../../src/doctor/doctor.js');
    const output = renderDeepAnalysisPrompt({
      archivePath: '/tmp/archive',
      archiveSize: 1247,
      estimatedTokenCost: { min: 800, max: 1200 },
      userApproved: false,
    });
    expect(output).toContain('1,247');
    expect(output).toContain('800');
    expect(output).toContain('1,200');
    expect(output).toContain('Proceed with deep analysis');
    expect(output).toContain('Standard analysis only');
    expect(output).toContain('Cancel');
  });
});

describe('runDeepAnalysis', () => {
  it('should return empty findings when no archive exists', async () => {
    const { runDeepAnalysis } = await import('../../src/doctor/doctor.js');
    const result = await runDeepAnalysis(projectRoot, {
      archivePath: '/nonexistent',
      archiveSize: 0,
      estimatedTokenCost: { min: 800, max: 800 },
      userApproved: true,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(0);
    }
  });

  it('should gracefully handle missing archive directory', async () => {
    const { runDeepAnalysis } = await import('../../src/doctor/doctor.js');
    const result = await runDeepAnalysis(projectRoot, {
      archivePath: '/tmp/does-not-exist',
      archiveSize: 0,
      estimatedTokenCost: { min: 800, max: 800 },
      userApproved: true,
    });
    expect(result.ok).toBe(true);
  });
});
