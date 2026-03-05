import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeDryRun, renderDryRun } from '../../src/visibility/dry-run.js';
import type { DryRunResult } from '../../src/visibility/types.js';

// ─── Mock all store write functions ─────────────────────────────

vi.mock('../../src/store/index.js', () => ({
  readProjectMap: vi.fn().mockReturnValue({ ok: false, error: 'not found' }),
  readKeywordIndex: vi.fn().mockReturnValue({ ok: false, error: 'not found' }),
  readTaskHistory: vi.fn().mockReturnValue({ ok: false, error: 'not found' }),
  readMetrics: vi.fn().mockReturnValue({ ok: false, error: 'not found' }),
  readConfig: vi.fn().mockReturnValue({ ok: false, error: 'not found' }),
  readPatterns: vi.fn().mockReturnValue({ ok: false, error: 'not found' }),
  readDependencyGraph: vi.fn().mockReturnValue({ ok: false, error: 'not found' }),
  // Write functions should NEVER be called
  writeTaskHistory: vi.fn(),
  writeMetrics: vi.fn(),
  writeConfig: vi.fn(),
  writePatterns: vi.fn(),
  writeProjectMap: vi.fn(),
  writeDependencyGraph: vi.fn(),
  writeKeywordIndex: vi.fn(),
  writeDoctorLog: vi.fn(),
}));

import {
  writeTaskHistory,
  writeMetrics,
  writeConfig,
  writePatterns,
  writeProjectMap,
  writeDependencyGraph,
  writeKeywordIndex,
  writeDoctorLog,
} from '../../src/store/index.js';

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

// ─── executeDryRun ──────────────────────────────────────────────

describe('executeDryRun', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a DryRunResult with classification and prediction', () => {
    const result = executeDryRun('add dark mode to settings', '/test');

    expect(result).toBeDefined();
    expect(result.taskType).toBeDefined();
    expect(result.domain).toBeDefined();
    expect(result.complexity).toBeDefined();
    expect(result.model).toBeDefined();
    expect(result.predictedFiles).toBeDefined();
    expect(Array.isArray(result.predictedFiles)).toBe(true);
    expect(typeof result.compressionReduction).toBe('number');
    expect(typeof result.estimatedTokenCost).toBe('number');
    expect(typeof result.estimatedRawCost).toBe('number');
  });

  it('NEVER writes to any store file (zero side effects)', () => {
    executeDryRun('fix the bug in auth module', '/test');

    expect(writeTaskHistory).not.toHaveBeenCalled();
    expect(writeMetrics).not.toHaveBeenCalled();
    expect(writeConfig).not.toHaveBeenCalled();
    expect(writePatterns).not.toHaveBeenCalled();
    expect(writeProjectMap).not.toHaveBeenCalled();
    expect(writeDependencyGraph).not.toHaveBeenCalled();
    expect(writeKeywordIndex).not.toHaveBeenCalled();
    expect(writeDoctorLog).not.toHaveBeenCalled();
  });

  it('handles gracefully when store is empty', () => {
    const result = executeDryRun('implement user login', '/empty-project');

    // Should not throw; should return reasonable defaults
    expect(result).toBeDefined();
    expect(result.taskType).toBeDefined();
    expect(result.model).toBeDefined();
  });
});

// ─── renderDryRun ───────────────────────────────────────────────

describe('renderDryRun', () => {
  it('renders dry-run display with all sections', () => {
    const result: DryRunResult = {
      taskType: 'Feature',
      domain: 'ui-settings',
      complexity: 'Medium',
      confidence: 0.85,
      model: 'sonnet',
      routingReason: 'medium feature task',
      predictedFiles: [
        { path: 'src/components/Settings.tsx', confidence: 0.94 },
        { path: 'src/styles/settings.css', confidence: 0.91 },
        { path: 'src/constants/colors.ts', confidence: 0.52 },
      ],
      compressionReduction: 42,
      estimatedTokenCost: 1800,
      estimatedRawCost: 4200,
    };

    const output = renderDryRun(result);
    const stripped = stripAnsi(output);

    expect(stripped).toContain('Dry Run (no tokens spent)');
    expect(stripped).toContain('Feature');
    expect(stripped).toContain('ui-settings');
    expect(stripped).toContain('Medium');
    expect(stripped).toContain('sonnet');
    expect(stripped).toContain('Predicted files (3)');
    expect(stripped).toContain('Settings.tsx');
    expect(stripped).toContain('0.94');
    expect(stripped).toContain('0.52');
    expect(stripped).toContain('42% reduction');
    expect(stripped).toContain('1,800');
    expect(stripped).toContain('4,200');
  });

  it('uses star icon for high confidence and circle for low', () => {
    const result: DryRunResult = {
      taskType: 'Feature',
      domain: 'test',
      complexity: 'Low',
      confidence: 0.9,
      model: 'haiku',
      routingReason: '',
      predictedFiles: [
        { path: 'high.ts', confidence: 0.9 },
        { path: 'low.ts', confidence: 0.3 },
      ],
      compressionReduction: 10,
      estimatedTokenCost: 500,
      estimatedRawCost: 600,
    };

    const output = renderDryRun(result);
    // \u2726 = filled star for high confidence, \u25cb = circle for low
    expect(output).toContain('\u2726');
    expect(output).toContain('\u25cb');
  });

  it('renders empty predicted files gracefully', () => {
    const result: DryRunResult = {
      taskType: 'Research',
      domain: 'unknown',
      complexity: 'Low',
      confidence: 0.5,
      model: 'haiku',
      routingReason: '',
      predictedFiles: [],
      compressionReduction: 0,
      estimatedTokenCost: 100,
      estimatedRawCost: 100,
    };

    const output = renderDryRun(result);
    const stripped = stripAnsi(output);
    expect(stripped).toContain('Predicted files (0)');
  });
});
