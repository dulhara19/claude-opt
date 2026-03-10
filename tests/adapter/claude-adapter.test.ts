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
import {
  FALLBACK_EXIT_CODE,
  CLAUDE_MD_BACKUP,
  MODEL_ID_MAP,
  DEFAULT_SUBPROCESS_TIMEOUT,
  MAX_OUTPUT_SIZE,
} from '../../src/adapter/types.js';
import { resolveModelId } from '../../src/adapter/claude-adapter.js';
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

  it('AD1: includes conventions from compression sections', () => {
    const ctx = makeContext('/tmp/test');
    ctx.compression = {
      ...ctx.compression!,
      sections: [
        { type: 'userRequest', content: 'fix bug', source: 'test' },
        { type: 'conventions', content: '- Use camelCase\n- Prefer const', source: 'patterns' },
      ],
    };
    const content = generateClaudeMd(ctx);

    expect(content).toContain('## Conventions');
    expect(content).toContain('Use camelCase');
    expect(content).toContain('Prefer const');
  });

  it('AD1: includes domain context from compression sections', () => {
    const ctx = makeContext('/tmp/test');
    ctx.compression = {
      ...ctx.compression!,
      sections: [
        { type: 'userRequest', content: 'fix bug', source: 'test' },
        { type: 'domainContext', content: '- auth: src/auth/login.ts (1.2KB)', source: 'domain' },
      ],
    };
    const content = generateClaudeMd(ctx);

    expect(content).toContain('## Domain Context');
    expect(content).toContain('auth: src/auth/login.ts');
  });

  it('AD1: includes signal reasons for high-confidence files', () => {
    const ctx = makeContext('/tmp/test');
    ctx.prediction = {
      ...ctx.prediction!,
      predictions: [
        { filePath: 'src/auth/login.ts', score: 0.9, signals: [{ signal: 'history', source: 'history-similarity', weight: 0.3, score: 0.9 }, { signal: 'graph', source: 'graph-traversal', weight: 0.2, score: 0.8 }] },
      ],
    };
    const content = generateClaudeMd(ctx);

    expect(content).toContain('history-similarity');
  });

  it('AD1: truncates CLAUDE.md when exceeding max length', () => {
    const ctx = makeContext('/tmp/test');
    // Create very long conventions
    ctx.compression = {
      ...ctx.compression!,
      sections: [
        { type: 'userRequest', content: 'fix bug', source: 'test' },
        { type: 'conventions', content: 'x'.repeat(5000), source: 'test' },
      ],
    };
    const content = generateClaudeMd(ctx);

    expect(content.length).toBeLessThan(4200); // MAX_CLAUDEMD_LENGTH + truncation marker
    expect(content).toContain('truncated');
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
  it('estimates tokens with content-type-aware multipliers and overhead (AC2)', () => {
    // With no text provided, uses 'default' (4.0) for prompt and 'code' (3.5) for output
    // plus 150 overhead tokens
    const estimate = estimateTokens(100, 400);
    // prompt: ceil(100/4.0) = 25, output: ceil(400/3.5) = 115, overhead: 150 => 290
    expect(estimate).toBe(25 + 115 + 150);
  });

  it('rounds up partial tokens', () => {
    const estimate = estimateTokens(10, 1);
    // prompt: ceil(10/4.0) = 3, output: ceil(1/3.5) = 1, overhead: 150 => 154
    expect(estimate).toBe(3 + 1 + 150);
  });

  it('handles zero length (returns only overhead)', () => {
    const estimate = estimateTokens(0, 0);
    // prompt: 0, output: 0, overhead: 150
    expect(estimate).toBe(150);
  });

  it('uses content-type detection when text is provided', () => {
    const codeText = 'function hello() { return 42; }';
    const estimate = estimateTokens(codeText.length, 0, codeText);
    // code multiplier is 3.5 for prompt, 0 output, plus 150 overhead
    expect(estimate).toBe(Math.ceil(codeText.length / 3.5) + 0 + 150);
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

  it('AD13: includes errorReason on failure', async () => {
    mockExecSync.mockImplementation(() => {
      throw new Error('Claude Code CLI not found');
    });

    const ctx = makeContext(tempDir);
    const result = await executeTaskFailOpen(ctx);

    expect(result.errorReason).toBeDefined();
    expect(result.isFallback).toBe(true);
  });
});

// AD2: Model ID mapping
describe('resolveModelId', () => {
  it('AD2: maps tier names to full model IDs', () => {
    expect(resolveModelId('haiku')).toBe('claude-haiku-4-5-20251001');
    expect(resolveModelId('sonnet')).toBe('claude-sonnet-4-6');
    expect(resolveModelId('opus')).toBe('claude-opus-4-6');
  });

  it('AD2: passes through unknown model IDs unchanged', () => {
    expect(resolveModelId('claude-custom-model')).toBe('claude-custom-model');
  });

  it('AD2: prefers config.modelIds over built-in map', () => {
    const config = { modelIds: { haiku: 'claude-haiku-custom' } };
    expect(resolveModelId('haiku', config)).toBe('claude-haiku-custom');
  });

  it('AD2: falls back to built-in map when config has no override', () => {
    const config = { modelIds: {} };
    expect(resolveModelId('sonnet', config)).toBe('claude-sonnet-4-6');
  });
});

// AD3: Default subprocess timeout
describe('DEFAULT_SUBPROCESS_TIMEOUT', () => {
  it('AD3: is 5 minutes (300000ms)', () => {
    expect(DEFAULT_SUBPROCESS_TIMEOUT).toBe(300_000);
  });
});

// AD4: Output size cap
describe('MAX_OUTPUT_SIZE', () => {
  it('AD4: is 1MB (1048576 bytes)', () => {
    expect(MAX_OUTPUT_SIZE).toBe(1_048_576);
  });
});

// AD5: Crash recovery
describe('AD5: stale backup recovery', () => {
  beforeEach(() => {
    tempDir = createTempDir();
  });
  afterEach(() => {
    cleanup(tempDir);
  });

  it('restores stale backup from interrupted run on next write', () => {
    // Simulate interrupted run: backup exists with original content
    fs.writeFileSync(path.join(tempDir, CLAUDE_MD_BACKUP), '# Real Original');
    fs.writeFileSync(path.join(tempDir, 'CLAUDE.md'), '# Stale Optimized');

    // restoreClaudeMd should fix this
    restoreClaudeMd(tempDir);

    expect(fs.readFileSync(path.join(tempDir, 'CLAUDE.md'), 'utf-8')).toBe('# Real Original');
    expect(fs.existsSync(path.join(tempDir, CLAUDE_MD_BACKUP))).toBe(false);
  });
});

// AD7: Token estimate with CLAUDE.md
describe('estimateTokens with injected content', () => {
  it('AD7: includes injected content length in estimate', () => {
    const baseEstimate = estimateTokens(100, 400);
    const withInjection = estimateTokens(100, 400, undefined, undefined, 500);
    // Injected: ceil(500/4.5) = 112 extra tokens
    expect(withInjection).toBeGreaterThan(baseEstimate);
    expect(withInjection - baseEstimate).toBe(Math.ceil(500 / 4.5));
  });

  it('AD7: zero injected content adds no extra tokens', () => {
    const base = estimateTokens(100, 400);
    const withZero = estimateTokens(100, 400, undefined, undefined, 0);
    expect(withZero).toBe(base);
  });
});

// AD2: MODEL_ID_MAP
describe('MODEL_ID_MAP', () => {
  it('AD2: contains all three tiers', () => {
    expect(MODEL_ID_MAP).toHaveProperty('haiku');
    expect(MODEL_ID_MAP).toHaveProperty('sonnet');
    expect(MODEL_ID_MAP).toHaveProperty('opus');
  });
});
