import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  compressPrompt,
  removeFiller,
  buildFileContext,
  buildConventionContext,
  buildDomainContext,
  assemblePrompt,
  DEFAULT_COMPRESSION,
} from '../../src/compressor/prompt-compressor.js';
import type { PromptSection } from '../../src/compressor/types.js';
import type { PipelineContext } from '../../src/types/index.js';
import { TaskType, Complexity } from '../../src/types/index.js';
import { createTempProjectRoot, cleanupTempProjectRoot } from '../helpers/test-store.js';
import {
  initializeStore,
  writePatterns,
  writeProjectMap,
} from '../../src/store/index.js';
import {
  createDefaultPatterns,
  createDefaultProjectMap,
} from '../../src/store/defaults.js';

function makeContext(
  taskText: string,
  workingDir: string,
  overrides: Partial<PipelineContext> = {},
): PipelineContext {
  return {
    taskText,
    workingDir,
    isDryRun: true,
    results: {},
    startedAt: Date.now(),
    ...overrides,
  };
}

describe('removeFiller', () => {
  it('strips common filler words from a prompt', () => {
    const input = 'Please can you just fix the bug in the auth module';
    const { cleaned, removedCount } = removeFiller(input);
    expect(cleaned).not.toContain('Please');
    expect(cleaned).not.toMatch(/\bjust\b/i);
    expect(cleaned).not.toMatch(/\bcan you\b/i);
    expect(removedCount).toBeGreaterThan(0);
  });

  it('preserves semantic meaning of the request', () => {
    const input = 'Fix the authentication bug in src/auth.ts';
    const { cleaned } = removeFiller(input);
    expect(cleaned).toContain('Fix');
    expect(cleaned).toContain('authentication bug');
    expect(cleaned).toContain('src/auth.ts');
  });

  it('does not strip technical terms or code references', () => {
    const input = 'Update the `actually_valid_function` in src/utils.ts';
    const { cleaned } = removeFiller(input);
    expect(cleaned).toContain('`actually_valid_function`');
    expect(cleaned).toContain('src/utils.ts');
  });

  it('handles prompts with no filler words', () => {
    const input = 'Refactor the database connection pool';
    const { cleaned, removedCount } = removeFiller(input);
    expect(cleaned).toBe(input);
    expect(removedCount).toBe(0);
  });

  it('cleans up extra whitespace after removals', () => {
    const input = 'Can you   please   fix this';
    const { cleaned } = removeFiller(input);
    expect(cleaned).not.toMatch(/\s{2,}/);
  });

  it('strips redundant phrase patterns', () => {
    const input = 'I want you to refactor the module and could you add tests';
    const { cleaned } = removeFiller(input);
    expect(cleaned).not.toMatch(/I want you to/i);
    expect(cleaned).not.toMatch(/could you/i);
    expect(cleaned).toContain('refactor');
    expect(cleaned).toContain('add tests');
  });
});

describe('buildFileContext', () => {
  it('returns null when no predictions provided', () => {
    const result = buildFileContext([]);
    expect(result).toBeNull();
  });

  it('builds file context sorted by confidence', () => {
    const predictions = [
      { filePath: 'src/low.ts', score: 0.3, signals: [] },
      { filePath: 'src/high.ts', score: 0.95, signals: [] },
      { filePath: 'src/mid.ts', score: 0.7, signals: [] },
    ];
    const result = buildFileContext(predictions);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('fileContext');
    expect(result!.content).toContain('src/high.ts');
    expect(result!.content).toContain('src/mid.ts');
    expect(result!.content).toContain('src/low.ts');
    // High confidence should appear before low confidence
    const highIdx = result!.content.indexOf('src/high.ts');
    const lowIdx = result!.content.indexOf('src/low.ts');
    expect(highIdx).toBeLessThan(lowIdx);
  });

  it('limits injected files to max 10', () => {
    const predictions = Array.from({ length: 15 }, (_, i) => ({
      filePath: `src/file-${i}.ts`,
      score: 0.9 - i * 0.05,
      signals: [],
    }));
    const result = buildFileContext(predictions);
    expect(result).not.toBeNull();
    const lines = result!.content.split('\n');
    expect(lines.length).toBeLessThanOrEqual(10);
  });

  it('includes confidence score in output', () => {
    const predictions = [
      { filePath: 'src/auth.ts', score: 0.92, signals: [] },
    ];
    const result = buildFileContext(predictions);
    expect(result!.content).toContain('0.92');
  });
});

describe('buildConventionContext', () => {
  it('returns null when no conventions exist', () => {
    const patterns = createDefaultPatterns();
    patterns.conventions = [];
    const result = buildConventionContext(patterns, 'auth', []);
    expect(result).toBeNull();
  });

  it('includes matching conventions', () => {
    const patterns = createDefaultPatterns();
    patterns.conventions = [
      { pattern: '.test.ts', description: 'Test files use .test.ts suffix', examples: ['auth.test.ts'] },
      { pattern: 'PascalCase', description: 'Components use PascalCase naming', examples: ['UserMenu.tsx'] },
    ];
    const result = buildConventionContext(patterns, undefined, ['src/auth.test.ts']);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('conventions');
    expect(result!.content).toContain('Test files use .test.ts suffix');
  });

  it('filters conventions relevant to domain', () => {
    const patterns = createDefaultPatterns();
    patterns.conventions = [
      { pattern: 'auth', description: 'Auth module uses JWT tokens', examples: [] },
      { pattern: 'ui', description: 'UI components follow atomic design', examples: [] },
    ];
    const result = buildConventionContext(patterns, 'auth', []);
    expect(result).not.toBeNull();
    expect(result!.content).toContain('Auth module uses JWT tokens');
  });
});

describe('buildDomainContext', () => {
  it('returns null when no domain provided', () => {
    const projectMap = createDefaultProjectMap();
    const result = buildDomainContext(projectMap, undefined);
    expect(result).toBeNull();
  });

  it('returns null when domain has no files', () => {
    const projectMap = createDefaultProjectMap();
    projectMap.domains = { auth: [] };
    const result = buildDomainContext(projectMap, 'auth');
    expect(result).toBeNull();
  });

  it('returns domain context when domain files exist', () => {
    const projectMap = createDefaultProjectMap();
    projectMap.domains = { auth: ['src/auth.ts', 'src/jwt.ts'] };
    projectMap.files = {
      'src/auth.ts': {
        path: 'src/auth.ts',
        size: 1000,
        contentHash: 'abc',
        lastModified: new Date().toISOString(),
        language: 'typescript',
        domain: 'auth',
        imports: [],
        exports: [],
        keywords: ['auth', 'jwt'],
      },
      'src/jwt.ts': {
        path: 'src/jwt.ts',
        size: 500,
        contentHash: 'def',
        lastModified: new Date().toISOString(),
        language: 'typescript',
        domain: 'auth',
        imports: [],
        exports: [],
        keywords: ['jwt'],
      },
    };
    const result = buildDomainContext(projectMap, 'auth');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('domainContext');
    expect(result!.content).toContain('src/auth.ts');
  });
});

describe('assemblePrompt', () => {
  it('assembles sections in the correct order', () => {
    const sections: PromptSection[] = [
      { type: 'domainContext', content: 'domain info', source: 'project-map' },
      { type: 'userRequest', content: 'fix the bug', source: 'user-input' },
      { type: 'fileContext', content: 'file info', source: 'file-predictor' },
    ];
    const result = assemblePrompt(sections);
    const taskIdx = result.indexOf('## Task');
    const filesIdx = result.indexOf('## Relevant Files');
    const domainIdx = result.indexOf('## Domain Context');
    expect(taskIdx).toBeLessThan(filesIdx);
    expect(filesIdx).toBeLessThan(domainIdx);
  });

  it('includes section headers', () => {
    const sections: PromptSection[] = [
      { type: 'userRequest', content: 'do something', source: 'user-input' },
    ];
    const result = assemblePrompt(sections);
    expect(result).toContain('## Task');
    expect(result).toContain('do something');
  });

  it('skips sections with empty content', () => {
    const sections: PromptSection[] = [
      { type: 'userRequest', content: 'fix it', source: 'user-input' },
      { type: 'conventions', content: '  ', source: 'patterns-store' },
    ];
    const result = assemblePrompt(sections);
    expect(result).not.toContain('## Project Conventions');
  });

  it('returns empty string when no sections provided', () => {
    const result = assemblePrompt([]);
    expect(result).toBe('');
  });
});

describe('compressPrompt', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = createTempProjectRoot();
    initializeStore(projectRoot);
  });

  afterEach(() => {
    cleanupTempProjectRoot(projectRoot);
  });

  it('returns a complete CompressionResult', () => {
    const ctx = makeContext('Please fix the auth bug', projectRoot);
    const result = compressPrompt(ctx);

    expect(result).toHaveProperty('optimizedPrompt');
    expect(result).toHaveProperty('originalLength');
    expect(result).toHaveProperty('compressedLength');
    expect(result).toHaveProperty('sections');
    expect(result).toHaveProperty('stats');
    expect(result).toHaveProperty('durationMs');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('removes filler words and records stats', () => {
    const ctx = makeContext('Can you please just fix the authentication bug', projectRoot);
    const result = compressPrompt(ctx);

    expect(result.optimizedPrompt).not.toMatch(/\bplease\b/i);
    expect(result.optimizedPrompt).toContain('fix');
    expect(result.optimizedPrompt).toContain('authentication bug');
    expect(result.stats.fillerWordsRemoved).toBeGreaterThan(0);
  });

  it('injects predicted file context when predictions exist', () => {
    const ctx = makeContext('fix the bug', projectRoot, {
      prediction: {
        predictions: [
          { filePath: 'src/auth.ts', score: 0.92, signals: [] },
          { filePath: 'src/utils.ts', score: 0.75, signals: [] },
        ],
        totalCandidates: 10,
        threshold: 0.3,
        durationMs: 5,
      },
    });
    const result = compressPrompt(ctx);

    expect(result.optimizedPrompt).toContain('## Relevant Files');
    expect(result.optimizedPrompt).toContain('src/auth.ts');
    expect(result.optimizedPrompt).toContain('src/utils.ts');
    expect(result.stats.filesInjected).toBe(2);
  });

  it('injects conventions when patterns exist in store', () => {
    const patterns = createDefaultPatterns();
    patterns.conventions = [
      { pattern: '.test.ts', description: 'Test files use .test.ts suffix', examples: [] },
    ];
    writePatterns(projectRoot, patterns);

    const ctx = makeContext('add tests for auth', projectRoot);
    const result = compressPrompt(ctx);

    expect(result.optimizedPrompt).toContain('## Project Conventions');
    expect(result.optimizedPrompt).toContain('Test files use .test.ts suffix');
  });

  it('injects domain context when domain matches', () => {
    const projectMap = createDefaultProjectMap();
    projectMap.domains = { auth: ['src/auth.ts'] };
    projectMap.files = {
      'src/auth.ts': {
        path: 'src/auth.ts',
        size: 1000,
        contentHash: 'abc',
        lastModified: new Date().toISOString(),
        language: 'typescript',
        domain: 'auth',
        imports: [],
        exports: [],
        keywords: ['auth'],
      },
    };
    writeProjectMap(projectRoot, projectMap);

    const ctx = makeContext('fix auth bug', projectRoot, {
      classification: {
        type: TaskType.BugFix,
        domain: 'auth',
        complexity: Complexity.Simple,
        confidence: 0.8,
      },
    });
    const result = compressPrompt(ctx);

    expect(result.optimizedPrompt).toContain('## Domain Context');
    expect(result.optimizedPrompt).toContain('src/auth.ts');
  });

  it('records compression ratio in stats', () => {
    const ctx = makeContext('Can you please basically just actually fix the simple bug', projectRoot);
    const result = compressPrompt(ctx);

    expect(result.stats.compressionRatio).toBeGreaterThan(0);
    expect(result.originalLength).toBeGreaterThan(0);
    expect(result.compressedLength).toBeGreaterThan(0);
  });

  it('completes compression in under 100ms', () => {
    const ctx = makeContext('Fix the authentication module error handling', projectRoot, {
      prediction: {
        predictions: [
          { filePath: 'src/auth.ts', score: 0.9, signals: [] },
          { filePath: 'src/error-handler.ts', score: 0.7, signals: [] },
        ],
        totalCandidates: 50,
        threshold: 0.3,
        durationMs: 10,
      },
      classification: {
        type: TaskType.BugFix,
        domain: 'auth',
        complexity: Complexity.Medium,
        confidence: 0.85,
      },
    });
    const result = compressPrompt(ctx);
    expect(result.durationMs).toBeLessThan(100);
  });

  it('works with no prediction or classification (minimal context)', () => {
    const ctx = makeContext('fix the bug', projectRoot);
    const result = compressPrompt(ctx);

    expect(result.optimizedPrompt).toContain('## Task');
    expect(result.optimizedPrompt).toContain('fix the bug');
    expect(result.sections.length).toBeGreaterThanOrEqual(1);
  });
});

describe('DEFAULT_COMPRESSION', () => {
  it('returns empty prompt with zero stats', () => {
    expect(DEFAULT_COMPRESSION.optimizedPrompt).toBe('');
    expect(DEFAULT_COMPRESSION.originalLength).toBe(0);
    expect(DEFAULT_COMPRESSION.compressedLength).toBe(0);
    expect(DEFAULT_COMPRESSION.sections).toEqual([]);
    expect(DEFAULT_COMPRESSION.stats.fillerWordsRemoved).toBe(0);
    expect(DEFAULT_COMPRESSION.stats.filesInjected).toBe(0);
    expect(DEFAULT_COMPRESSION.stats.patternsInjected).toBe(0);
    expect(DEFAULT_COMPRESSION.stats.compressionRatio).toBe(1);
    expect(DEFAULT_COMPRESSION.durationMs).toBe(0);
  });
});

describe('fail-open behavior', () => {
  it('original prompt preserved when compressor receives no store data', () => {
    const ctx = makeContext('fix the simple bug', '/nonexistent/path');
    const result = compressPrompt(ctx);

    // Even without store data, the user request section is always present
    expect(result.optimizedPrompt).toContain('fix the simple bug');
    expect(result.sections.length).toBeGreaterThanOrEqual(1);
    expect(result.sections[0].type).toBe('userRequest');
  });
});
