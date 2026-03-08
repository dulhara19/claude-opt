import { describe, it, expect } from 'vitest';
import { selectModel, escalate, DEFAULT_ROUTING } from '../../src/router/model-router.js';
import { ModelTier } from '../../src/router/types.js';
import type { PipelineContext, StoreCache } from '../../src/types/index.js';
import { TaskType, Complexity } from '../../src/types/index.js';
import { createDefaultTaskHistory } from '../../src/store/defaults.js';

function makeContext(
  taskType: TaskType,
  complexity: Complexity,
  domain: string,
  storeCache?: StoreCache,
): PipelineContext {
  return {
    taskText: 'test task',
    workingDir: '/tmp/test',
    isDryRun: true,
    results: {},
    startedAt: Date.now(),
    storeCache,
    classification: {
      type: taskType,
      domain,
      complexity,
      confidence: 0.8,
    },
  };
}

describe('selectModel', () => {
  describe('default routing rules', () => {
    it('routes simple bugfix to Haiku (AC1)', () => {
      const ctx = makeContext(TaskType.BugFix, Complexity.Simple, 'auth');
      const result = selectModel(ctx);
      expect(result.model).toBe(ModelTier.Haiku);
      expect(result.overrideApplied).toBe(false);
    });

    it('routes medium bugfix to Sonnet', () => {
      const ctx = makeContext(TaskType.BugFix, Complexity.Medium, 'auth');
      const result = selectModel(ctx);
      expect(result.model).toBe(ModelTier.Sonnet);
    });

    it('routes complex feature to Opus (AC2)', () => {
      const ctx = makeContext(TaskType.Feature, Complexity.Complex, 'ui');
      const result = selectModel(ctx);
      expect(result.model).toBe(ModelTier.Opus);
    });

    it('routes simple feature to Haiku', () => {
      const ctx = makeContext(TaskType.Feature, Complexity.Simple, 'ui');
      const result = selectModel(ctx);
      expect(result.model).toBe(ModelTier.Haiku);
    });

    it('routes complex refactor to Opus', () => {
      const ctx = makeContext(TaskType.Refactor, Complexity.Complex, 'core');
      const result = selectModel(ctx);
      expect(result.model).toBe(ModelTier.Opus);
    });

    it('routes research to Haiku by default (AC3)', () => {
      const ctx = makeContext(TaskType.Research, Complexity.Simple, 'general');
      const result = selectModel(ctx);
      expect(result.model).toBe(ModelTier.Haiku);
    });

    it('routes learning to Haiku by default (AC3)', () => {
      const ctx = makeContext(TaskType.Learning, Complexity.Medium, 'general');
      const result = selectModel(ctx);
      expect(result.model).toBe(ModelTier.Haiku);
    });

    it('routes documentation to Haiku by default (AC3)', () => {
      const ctx = makeContext(TaskType.Documentation, Complexity.Simple, 'docs');
      const result = selectModel(ctx);
      expect(result.model).toBe(ModelTier.Haiku);
    });

    it('routes unknown type to Sonnet (safe default)', () => {
      const ctx = makeContext(TaskType.Unknown, Complexity.Medium, 'general');
      const result = selectModel(ctx);
      expect(result.model).toBe(ModelTier.Sonnet);
    });
  });

  describe('historical failure override (AC4)', () => {
    it('escalates when default model has high failure rate', () => {
      const history = createDefaultTaskHistory();
      // Add tasks where Haiku "failed" (has feedback indicating issues)
      // R10: 3 tasks at 100% failure → multi-tier escalation (Haiku→Opus)
      for (let i = 0; i < 3; i++) {
        history.tasks.push({
          id: `task-${i}`,
          timestamp: new Date().toISOString(),
          taskText: 'fix the auth bug',
          classification: { taskType: 'BugFix', complexity: 'Simple', confidence: 0.8 },
          prediction: { predictedFiles: [], actualFiles: [], precision: 0.1, recall: 0.1 },
          routing: { model: 'haiku', reason: 'simple bugfix' },
          tokens: { consumed: 1000, budgeted: 5000, saved: 0 },
          feedback: { type: 'correction', details: 'wrong fix', timestamp: new Date().toISOString() },
        });
      }
      history.count = history.tasks.length;

      const ctx = makeContext(TaskType.BugFix, Complexity.Simple, 'auth', { taskHistory: history });
      const result = selectModel(ctx);

      // R10: 100% failure rate on 3+ tasks → double escalation to Opus
      expect(result.model).toBe(ModelTier.Opus);
      expect(result.overrideApplied).toBe(true);
      expect(result.rationale).toContain('escalating');
    });

    it('single-tier escalates when failure rate is moderate (40-70%)', () => {
      const history = createDefaultTaskHistory();
      // 3 failed + 3 successful = 50% failure rate → single escalation
      for (let i = 0; i < 3; i++) {
        history.tasks.push({
          id: `fail-${i}`,
          timestamp: new Date().toISOString(),
          taskText: 'fix the auth bug',
          classification: { taskType: 'BugFix', complexity: 'Simple', confidence: 0.8 },
          prediction: { predictedFiles: [], actualFiles: [], precision: 0.1, recall: 0.1 },
          routing: { model: 'haiku', reason: 'simple bugfix' },
          tokens: { consumed: 1000, budgeted: 5000, saved: 0 },
          feedback: { rating: 'negative', source: 'user', details: 'wrong fix' },
        });
      }
      for (let i = 0; i < 3; i++) {
        history.tasks.push({
          id: `pass-${i}`,
          timestamp: new Date().toISOString(),
          taskText: 'fix the auth bug',
          classification: { taskType: 'BugFix', complexity: 'Simple', confidence: 0.8 },
          prediction: { predictedFiles: ['src/auth.ts'], actualFiles: ['src/auth.ts'], precision: 0.9, recall: 0.9 },
          routing: { model: 'haiku', reason: 'simple bugfix' },
          tokens: { consumed: 1000, budgeted: 5000, saved: 0 },
          feedback: null,
        });
      }
      history.count = history.tasks.length;

      const ctx = makeContext(TaskType.BugFix, Complexity.Simple, 'auth', { taskHistory: history });
      const result = selectModel(ctx);

      // 50% failure → single-tier escalation (Haiku→Sonnet)
      expect(result.model).toBe(ModelTier.Sonnet);
      expect(result.overrideApplied).toBe(true);
    });

    it('does not override when failure rate is below threshold', () => {
      const history = createDefaultTaskHistory();
      // Add mostly successful Haiku tasks
      for (let i = 0; i < 5; i++) {
        history.tasks.push({
          id: `task-${i}`,
          timestamp: new Date().toISOString(),
          taskText: 'fix the auth bug',
          classification: { taskType: 'BugFix', complexity: 'Simple', confidence: 0.8 },
          prediction: { predictedFiles: ['src/auth.ts'], actualFiles: ['src/auth.ts'], precision: 0.9, recall: 0.9 },
          routing: { model: 'haiku', reason: 'simple bugfix' },
          tokens: { consumed: 1000, budgeted: 5000, saved: 0 },
          feedback: null,
        });
      }
      history.count = history.tasks.length;

      const ctx = makeContext(TaskType.BugFix, Complexity.Simple, 'auth', { taskHistory: history });
      const result = selectModel(ctx);

      expect(result.model).toBe(ModelTier.Haiku);
      expect(result.overrideApplied).toBe(false);
    });

    it('does not override with fewer than 2 historical tasks', () => {
      const history = createDefaultTaskHistory();
      history.tasks.push({
        id: 'task-1',
        timestamp: new Date().toISOString(),
        taskText: 'fix the auth bug',
        classification: { taskType: 'BugFix', complexity: 'Simple', confidence: 0.8 },
        prediction: { predictedFiles: [], actualFiles: [], precision: 0, recall: 0 },
        routing: { model: 'haiku', reason: 'simple bugfix' },
        tokens: { consumed: 1000, budgeted: 5000, saved: 0 },
        feedback: { type: 'correction', details: 'wrong', timestamp: new Date().toISOString() },
      });
      history.count = 1;

      const ctx = makeContext(TaskType.BugFix, Complexity.Simple, 'auth', { taskHistory: history });
      const result = selectModel(ctx);

      // Only 1 task -- not enough to trigger override
      expect(result.model).toBe(ModelTier.Haiku);
      expect(result.overrideApplied).toBe(false);
    });
  });

  describe('routing transparency (AC5)', () => {
    it('includes model name in rationale', () => {
      const ctx = makeContext(TaskType.BugFix, Complexity.Simple, 'auth');
      const result = selectModel(ctx);
      expect(result.rationale).toContain('Haiku');
    });

    it('includes task type in rationale', () => {
      const ctx = makeContext(TaskType.BugFix, Complexity.Simple, 'auth');
      const result = selectModel(ctx);
      expect(result.rationale.toLowerCase()).toContain('bugfix');
    });

    it('includes complexity in rationale', () => {
      const ctx = makeContext(TaskType.Feature, Complexity.Complex, 'ui');
      const result = selectModel(ctx);
      expect(result.rationale.toLowerCase()).toContain('complex');
    });

    it('includes override reason when escalating', () => {
      const history = createDefaultTaskHistory();
      for (let i = 0; i < 3; i++) {
        history.tasks.push({
          id: `task-${i}`,
          timestamp: new Date().toISOString(),
          taskText: 'fix bug',
          classification: { taskType: 'BugFix', complexity: 'Simple', confidence: 0.8 },
          prediction: { predictedFiles: [], actualFiles: [], precision: 0.1, recall: 0.1 },
          routing: { model: 'haiku', reason: 'simple bugfix' },
          tokens: { consumed: 1000, budgeted: 5000, saved: 0 },
          feedback: { type: 'correction', details: 'wrong', timestamp: new Date().toISOString() },
        });
      }
      history.count = history.tasks.length;

      const ctx = makeContext(TaskType.BugFix, Complexity.Simple, 'auth', { taskHistory: history });
      const result = selectModel(ctx);

      expect(result.rationale).toContain('failed');
      expect(result.rationale).toContain('escalating');
    });
  });

  describe('fail-open default', () => {
    it('returns Sonnet when classification is missing', () => {
      const ctx: PipelineContext = {
        taskText: 'do something',
        workingDir: '/tmp/test',
        isDryRun: true,
        results: {},
        startedAt: Date.now(),
      };
      const result = selectModel(ctx);
      expect(result.model).toBe(ModelTier.Sonnet);
      expect(result.confidence).toBe(0);
    });

    it('DEFAULT_ROUTING constant uses Sonnet', () => {
      expect(DEFAULT_ROUTING.model).toBe(ModelTier.Sonnet);
      expect(DEFAULT_ROUTING.confidence).toBe(0);
      expect(DEFAULT_ROUTING.overrideApplied).toBe(false);
    });
  });

  describe('result structure', () => {
    it('returns a complete RoutingResult', () => {
      const ctx = makeContext(TaskType.Feature, Complexity.Medium, 'ui');
      const result = selectModel(ctx);

      expect(result).toHaveProperty('model');
      expect(result).toHaveProperty('rationale');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('overrideApplied');
      expect(result).toHaveProperty('durationMs');
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('performance (AC1)', () => {
    it('completes routing in less than 50ms', () => {
      const ctx = makeContext(TaskType.BugFix, Complexity.Simple, 'auth');
      const result = selectModel(ctx);
      expect(result.durationMs).toBeLessThan(50);
    });
  });
});

describe('escalate', () => {
  it('escalates Haiku to Sonnet', () => {
    expect(escalate(ModelTier.Haiku)).toBe(ModelTier.Sonnet);
  });

  it('escalates Sonnet to Opus', () => {
    expect(escalate(ModelTier.Sonnet)).toBe(ModelTier.Opus);
  });

  it('Opus is the ceiling -- stays at Opus', () => {
    expect(escalate(ModelTier.Opus)).toBe(ModelTier.Opus);
  });
});
