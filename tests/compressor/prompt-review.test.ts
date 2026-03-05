import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatPromptDisplay,
  reviewPrompt,
  detectEditor,
} from '../../src/compressor/prompt-review.js';
import { ReviewAction } from '../../src/compressor/types.js';
import type { ReviewResult } from '../../src/compressor/types.js';
import type { PipelineContext } from '../../src/types/index.js';
import { ModelTier } from '../../src/router/types.js';

function makeContext(overrides: Partial<PipelineContext> = {}): PipelineContext {
  return {
    taskText: 'fix the dropdown z-index bug in UserMenu component',
    workingDir: '/test',
    isDryRun: false,
    results: {},
    startedAt: Date.now(),
    ...overrides,
  };
}

function makeFullContext(): PipelineContext {
  return makeContext({
    routing: {
      model: ModelTier.Haiku,
      rationale: 'simple bugfix, 4/4 similar success',
      confidence: 0.92,
      overrideApplied: false,
      durationMs: 3,
    },
    prediction: {
      predictions: [
        { filePath: 'src/components/UserMenu.tsx', score: 0.92, signals: [] },
        { filePath: 'src/styles/dropdown.css', score: 0.78, signals: [] },
        { filePath: 'src/components/UserMenu.test.tsx', score: 0.65, signals: [] },
      ],
      totalCandidates: 50,
      threshold: 0.3,
      durationMs: 12,
    },
    compression: {
      optimizedPrompt: '## Task\nfix dropdown z-index bug in UserMenu\n\n## Relevant Files\nsrc/components/UserMenu.tsx (0.92)\nsrc/styles/dropdown.css (0.78)',
      originalLength: 52,
      compressedLength: 38,
      sections: [
        { type: 'userRequest', content: 'fix dropdown z-index bug in UserMenu', source: 'filler-removal' },
        { type: 'fileContext', content: 'src/components/UserMenu.tsx (0.92)\nsrc/styles/dropdown.css (0.78)', source: 'file-predictor' },
        { type: 'conventions', content: '- Components use PascalCase\n- CSS modules for styling', source: 'patterns-store' },
      ],
      stats: { fillerWordsRemoved: 3, filesInjected: 2, patternsInjected: 1, compressionRatio: 0.73 },
      durationMs: 5,
    },
  });
}

describe('formatPromptDisplay', () => {
  it('includes the header "Optimized Prompt Review"', () => {
    const ctx = makeFullContext();
    const output = formatPromptDisplay(ctx, false);
    expect(output).toContain('Optimized Prompt Review');
  });

  it('displays the original prompt', () => {
    const ctx = makeFullContext();
    const output = formatPromptDisplay(ctx, false);
    expect(output).toContain('Original:');
    expect(output).toContain('fix the dropdown z-index bug');
  });

  it('displays compressed request from user section', () => {
    const ctx = makeFullContext();
    const output = formatPromptDisplay(ctx, false);
    expect(output).toContain('Compressed:');
    expect(output).toContain('fix dropdown z-index bug in UserMenu');
  });

  it('displays predicted files with percentage confidence', () => {
    const ctx = makeFullContext();
    const output = formatPromptDisplay(ctx, false);
    expect(output).toContain('Predicted Files (3)');
    expect(output).toContain('92%');
    expect(output).toContain('src/components/UserMenu.tsx');
    expect(output).toContain('78%');
    expect(output).toContain('src/styles/dropdown.css');
    expect(output).toContain('65%');
  });

  it('displays model name and routing rationale', () => {
    const ctx = makeFullContext();
    const output = formatPromptDisplay(ctx, false);
    expect(output).toContain('Model: Haiku');
    expect(output).toContain('simple bugfix');
  });

  it('displays conventions section', () => {
    const ctx = makeFullContext();
    const output = formatPromptDisplay(ctx, false);
    expect(output).toContain('Conventions:');
    expect(output).toContain('Components use PascalCase');
  });

  it('displays action prompt with send/edit/cancel options', () => {
    const ctx = makeFullContext();
    const output = formatPromptDisplay(ctx, false);
    expect(output).toContain('Send');
    expect(output).toContain('Edit');
    expect(output).toContain('Cancel');
  });

  it('displays dry-run mode indicator instead of action prompt', () => {
    const ctx = makeFullContext();
    const output = formatPromptDisplay(ctx, true);
    expect(output).toContain('dry-run');
    expect(output).not.toContain('[Enter] Send');
  });

  it('uses box-drawing characters', () => {
    const ctx = makeFullContext();
    const output = formatPromptDisplay(ctx, false);
    expect(output).toContain('┌');
    expect(output).toContain('┘');
    expect(output).toContain('│');
    expect(output).toContain('─');
  });

  it('handles minimal context (no prediction, no routing, no compression)', () => {
    const ctx = makeContext();
    const output = formatPromptDisplay(ctx, false);
    expect(output).toContain('Optimized Prompt Review');
    expect(output).toContain('Original:');
    expect(output).toContain('fix the dropdown z-index bug');
    // Should not crash
    expect(output).toContain('Send');
  });

  it('displays prediction summary with top confidence', () => {
    const ctx = makeFullContext();
    const output = formatPromptDisplay(ctx, false);
    expect(output).toContain('3 files predicted');
    expect(output).toContain('top confidence: 92%');
  });
});

describe('ReviewAction enum', () => {
  it('has Send, Edit, and Cancel values', () => {
    expect(ReviewAction.Send).toBe('send');
    expect(ReviewAction.Edit).toBe('edit');
    expect(ReviewAction.Cancel).toBe('cancel');
  });
});

describe('ReviewResult types', () => {
  it('Cancel result has empty finalPrompt', () => {
    const result: ReviewResult = {
      action: ReviewAction.Cancel,
      finalPrompt: '',
      wasEdited: false,
    };
    expect(result.finalPrompt).toBe('');
    expect(result.action).toBe(ReviewAction.Cancel);
  });

  it('Send result has the optimized prompt unchanged', () => {
    const prompt = 'fix the bug';
    const result: ReviewResult = {
      action: ReviewAction.Send,
      finalPrompt: prompt,
      wasEdited: false,
    };
    expect(result.finalPrompt).toBe(prompt);
    expect(result.wasEdited).toBe(false);
  });

  it('Edit result has a modified prompt', () => {
    const result: ReviewResult = {
      action: ReviewAction.Edit,
      finalPrompt: 'modified prompt',
      wasEdited: true,
    };
    expect(result.action).toBe(ReviewAction.Edit);
    expect(result.wasEdited).toBe(true);
    expect(result.finalPrompt).toBe('modified prompt');
  });
});

describe('detectEditor', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns $EDITOR if set', () => {
    process.env['EDITOR'] = 'nano';
    expect(detectEditor()).toBe('nano');
  });

  it('returns vi on non-Windows without $EDITOR', () => {
    delete process.env['EDITOR'];
    if (process.platform !== 'win32') {
      expect(detectEditor()).toBe('vi');
    }
  });

  it('returns notepad on Windows without $EDITOR', () => {
    delete process.env['EDITOR'];
    if (process.platform === 'win32') {
      expect(detectEditor()).toBe('notepad');
    }
  });
});

describe('reviewPrompt', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
  });

  it('returns Send with optimized prompt in dry-run mode', async () => {
    const ctx = makeFullContext();
    ctx.isDryRun = true;

    const result = await reviewPrompt(ctx);

    expect(result.action).toBe(ReviewAction.Send);
    expect(result.finalPrompt).toBe(ctx.compression!.optimizedPrompt);
    expect(result.wasEdited).toBe(false);
  });

  it('displays formatted output in dry-run mode', async () => {
    const ctx = makeFullContext();
    ctx.isDryRun = true;

    await reviewPrompt(ctx);

    const output = stdoutSpy.mock.calls.map(c => c[0]).join('');
    expect(output).toContain('Optimized Prompt Review');
    expect(output).toContain('dry-run');
  });

  it('falls back to taskText when no compression result', async () => {
    const ctx = makeContext({ isDryRun: true });

    const result = await reviewPrompt(ctx);

    expect(result.finalPrompt).toBe(ctx.taskText);
  });
});
