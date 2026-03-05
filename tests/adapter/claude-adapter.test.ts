import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Mock child_process at the module level for ESM compatibility
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    execSync: vi.fn(),
    spawn: vi.fn(),
  };
});

import { execSync } from 'node:child_process';
import {
  detectClaudeCode,
  resetClaudeCodeCache,
  executeTaskFailOpen,
} from '../../src/adapter/claude-adapter.js';
import {
  generateClaudeMd,
  writeClaudeMd,
  restoreClaudeMd,
  estimateTokens,
} from '../../src/adapter/claude-adapter.js';
import { FALLBACK_EXIT_CODE, CLAUDE_MD_BACKUP } from '../../src/adapter/types.js';
import type { PipelineContext } from '../../src/types/index.js';
import { TaskType, Complexity } from '../../src/types/index.js';

const mockExecSync = vi.mocked(execSync);

let tempDir: string;

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'adapter-test-'));
}

function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function makeContext(workingDir: string): PipelineContext {
  return {
    taskText: 'Fix the login bug',
    workingDir,
    isDryRun: false,
    results: {},
    startedAt: Date.now(),
    classification: {
      type: TaskType.BugFix,
      domain: 'auth',
      complexity: Complexity.Simple,
      confidence: 0.8,
    },
    prediction: {
      predictions: [
        { filePath: 'src/auth/login.ts', score: 0.9, signals: [] },
        { filePath: 'src/auth/login.test.ts', score: 0.6, signals: [] },
      ],
      totalCandidates: 10,
      threshold: 0.6,
      durationMs: 5,
    },
    compression: {
      optimizedPrompt: 'Fix the login bug (optimized)',
      originalLength: 20,
      compressedLength: 30,
      contextInjected: true,
      predictedFilesIncluded: 2,
      conventionsIncluded: 0,
      durationMs: 2,
    },
  };
}

describe('detectClaudeCode', () => {
  beforeEach(() => {
    resetClaudeCodeCache();
    vi.clearAllMocks();
  });

  it('returns error when Claude Code is not installed (AC4)', () => {
    mockExecSync.mockImplementation(() => {
      throw new Error('command not found');
    });

    const result = detectClaudeCode();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Claude Code CLI not found');
      expect(result.error).toContain('npm install');
    }
  });

  it('caches the detection result', () => {
    mockExecSync.mockImplementation(() => {
      throw new Error('not found');
    });

    detectClaudeCode();
    detectClaudeCode();

    // execSync should only be called once (cached after first call)
    expect(mockExecSync).toHaveBeenCalledTimes(1);
  });

  it('returns success when Claude Code is available (AC4)', () => {
    mockExecSync.mockImplementation((cmd: string) => {
      if (typeof cmd === 'string' && cmd === 'claude --version') return '1.0.0\n';
      if (typeof cmd === 'string' && (cmd.includes('where') || cmd.includes('which')))
        return '/usr/local/bin/claude\n';
      return '';
    });

    const result = detectClaudeCode();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.isAvailable).toBe(true);
      expect(result.value.version).toContain('1.0.0');
    }
  });
});

describe('generateClaudeMd', () => {
  it('generates markdown with focus files from predictions (AC1)', () => {
    const ctx = makeContext('/tmp/test');
    const content = generateClaudeMd(ctx);

    expect(content).toContain('# Claude Optimizer Context');
    expect(content).toContain('## Focus Files');
    expect(content).toContain('src/auth/login.ts');
    expect(content).toContain('high confidence');
    expect(content).toContain('src/auth/login.test.ts');
    expect(content).toContain('medium confidence');
  });

  it('generates markdown with task context from classification', () => {
    const ctx = makeContext('/tmp/test');
    const content = generateClaudeMd(ctx);

    expect(content).toContain('## Task Context');
    expect(content).toContain('BugFix');
    expect(content).toContain('auth');
    expect(content).toContain('Simple');
  });

  it('handles missing prediction gracefully', () => {
    const ctx = makeContext('/tmp/test');
    delete ctx.prediction;
    const content = generateClaudeMd(ctx);

    expect(content).toContain('# Claude Optimizer Context');
    expect(content).not.toContain('## Focus Files');
  });

  it('handles missing classification gracefully', () => {
    const ctx = makeContext('/tmp/test');
    delete ctx.classification;
    const content = generateClaudeMd(ctx);

    expect(content).not.toContain('## Task Context');
  });
});

describe('writeClaudeMd / restoreClaudeMd', () => {
  beforeEach(() => {
    tempDir = createTempDir();
  });
  afterEach(() => {
    cleanup(tempDir);
  });

  it('writes CLAUDE.md when none exists', () => {
    const hasBackup = writeClaudeMd(tempDir, '# Optimized');

    expect(hasBackup).toBe(false);
    expect(fs.readFileSync(path.join(tempDir, 'CLAUDE.md'), 'utf-8')).toBe('# Optimized');
  });

  it('backs up existing CLAUDE.md before writing (AC1)', () => {
    fs.writeFileSync(path.join(tempDir, 'CLAUDE.md'), '# Original');

    const hasBackup = writeClaudeMd(tempDir, '# Optimized');

    expect(hasBackup).toBe(true);
    expect(fs.readFileSync(path.join(tempDir, 'CLAUDE.md'), 'utf-8')).toBe('# Optimized');
    expect(fs.readFileSync(path.join(tempDir, CLAUDE_MD_BACKUP), 'utf-8')).toBe('# Original');
  });

  it('restores original CLAUDE.md from backup', () => {
    fs.writeFileSync(path.join(tempDir, 'CLAUDE.md'), '# Original');
    writeClaudeMd(tempDir, '# Optimized');

    restoreClaudeMd(tempDir);

    expect(fs.readFileSync(path.join(tempDir, 'CLAUDE.md'), 'utf-8')).toBe('# Original');
    expect(fs.existsSync(path.join(tempDir, CLAUDE_MD_BACKUP))).toBe(false);
  });

  it('removes CLAUDE.md if no backup existed', () => {
    writeClaudeMd(tempDir, '# Optimized');

    restoreClaudeMd(tempDir);

    expect(fs.existsSync(path.join(tempDir, 'CLAUDE.md'))).toBe(false);
  });

  it('handles existing backup from interrupted run', () => {
    fs.writeFileSync(path.join(tempDir, 'CLAUDE.md'), '# Current');
    fs.writeFileSync(path.join(tempDir, CLAUDE_MD_BACKUP), '# Stale backup');

    const hasBackup = writeClaudeMd(tempDir, '# Optimized');

    expect(hasBackup).toBe(true);
    expect(fs.readFileSync(path.join(tempDir, CLAUDE_MD_BACKUP), 'utf-8')).toBe('# Current');
  });
});

describe('estimateTokens', () => {
  it('estimates ~4 chars per token (AC2)', () => {
    const estimate = estimateTokens(100, 400);
    expect(estimate).toBe(125);
  });

  it('rounds up partial tokens', () => {
    const estimate = estimateTokens(10, 1);
    expect(estimate).toBe(3);
  });

  it('handles zero length', () => {
    const estimate = estimateTokens(0, 0);
    expect(estimate).toBe(0);
  });
});

describe('FALLBACK_EXIT_CODE', () => {
  it('is 10 (AC3)', () => {
    expect(FALLBACK_EXIT_CODE).toBe(10);
  });
});

describe('executeTaskFailOpen — fail-open behavior (AC3)', () => {
  beforeEach(() => {
    tempDir = createTempDir();
    resetClaudeCodeCache();
    vi.clearAllMocks();
  });
  afterEach(() => {
    cleanup(tempDir);
  });

  it('returns fallback AdapterResult with correct structure when CLI unavailable', async () => {
    mockExecSync.mockImplementation(() => {
      throw new Error('not found');
    });

    const ctx = makeContext(tempDir);
    const result = await executeTaskFailOpen(ctx);

    // Verify complete AdapterResult structure
    expect(result).toHaveProperty('output');
    expect(result).toHaveProperty('filesUsed');
    expect(result).toHaveProperty('exitCode');
    expect(result).toHaveProperty('tokenEstimate');
    expect(result).toHaveProperty('isFallback');
    expect(result).toHaveProperty('durationMs');

    // Verify fallback values
    expect(result.isFallback).toBe(true);
    expect(result.exitCode).toBe(FALLBACK_EXIT_CODE);
    expect(result.output).toBe('');
    expect(result.filesUsed).toEqual([]);
  });

  it('logs errors on failure', async () => {
    mockExecSync.mockImplementation(() => {
      throw new Error('not found');
    });

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const ctx = makeContext(tempDir);
    await executeTaskFailOpen(ctx);

    expect(stderrSpy).toHaveBeenCalled();
    stderrSpy.mockRestore();
  });

  it('never throws — always returns AdapterResult', async () => {
    mockExecSync.mockImplementation(() => {
      throw new Error('catastrophic failure');
    });

    const ctx = makeContext(tempDir);
    // This should NOT throw
    const result = await executeTaskFailOpen(ctx);

    expect(result).toBeDefined();
    expect(result.isFallback).toBe(true);
  });
});
