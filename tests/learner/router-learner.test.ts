import { describe, it, expect } from 'vitest';
import { updateModelPerformance, selectLearnedModel, MIN_OBSERVATIONS } from '../../src/learner/router-learner.js';
import type { Metrics } from '../../src/types/index.js';

function makeMetrics(): Metrics {
  return {
    schemaVersion: '1.0.0',
    overall: { totalTasks: 0, totalSessions: 0, avgPrecision: 0, avgRecall: 0, totalTokensConsumed: 0, totalTokensSaved: 0, savingsRate: 0 },
    perDomain: {},
    windows: [],
    predictionTrend: [],
  };
}

describe('updateModelPerformance', () => {
  it('initializes modelPerformance if not present', () => {
    const metrics = makeMetrics();
    updateModelPerformance(metrics, 'sonnet', 'BugFix', 'Medium', true, 500);

    expect(metrics.modelPerformance).toBeDefined();
    expect(metrics.modelPerformance!['sonnet:BugFix:Medium']).toEqual({
      successes: 1,
      failures: 0,
      totalTasks: 1,
      avgTokenCost: 500,
    });
  });

  it('accumulates successes and failures', () => {
    const metrics = makeMetrics();
    updateModelPerformance(metrics, 'sonnet', 'BugFix', 'Medium', true, 500);
    updateModelPerformance(metrics, 'sonnet', 'BugFix', 'Medium', false, 600);
    updateModelPerformance(metrics, 'sonnet', 'BugFix', 'Medium', true, 400);

    const perf = metrics.modelPerformance!['sonnet:BugFix:Medium'];
    expect(perf.successes).toBe(2);
    expect(perf.failures).toBe(1);
    expect(perf.totalTasks).toBe(3);
    expect(perf.avgTokenCost).toBe(500); // (500+600+400)/3 = 500
  });

  it('tracks different model×type×complexity combinations separately', () => {
    const metrics = makeMetrics();
    updateModelPerformance(metrics, 'haiku', 'BugFix', 'Simple', true, 100);
    updateModelPerformance(metrics, 'sonnet', 'BugFix', 'Simple', true, 300);

    expect(metrics.modelPerformance!['haiku:BugFix:Simple'].totalTasks).toBe(1);
    expect(metrics.modelPerformance!['sonnet:BugFix:Simple'].totalTasks).toBe(1);
  });
});

describe('selectLearnedModel', () => {
  it('returns null with no performance data', () => {
    const metrics = makeMetrics();
    expect(selectLearnedModel(metrics, 'BugFix', 'Medium')).toBeNull();
  });

  it('returns null with insufficient observations', () => {
    const metrics = makeMetrics();
    // Add fewer than MIN_OBSERVATIONS
    for (let i = 0; i < MIN_OBSERVATIONS - 1; i++) {
      updateModelPerformance(metrics, 'sonnet', 'BugFix', 'Medium', true, 500);
    }

    expect(selectLearnedModel(metrics, 'BugFix', 'Medium')).toBeNull();
  });

  it('selects cheaper model when both succeed equally', () => {
    const metrics = makeMetrics();

    // Both succeed 100%, but haiku is 3x cheaper
    for (let i = 0; i < MIN_OBSERVATIONS; i++) {
      updateModelPerformance(metrics, 'haiku', 'BugFix', 'Simple', true, 100);
      updateModelPerformance(metrics, 'sonnet', 'BugFix', 'Simple', true, 300);
    }

    const result = selectLearnedModel(metrics, 'BugFix', 'Simple');
    expect(result).toBe('haiku');
  });

  it('selects more expensive model when it succeeds significantly more', () => {
    const metrics = makeMetrics();

    // Haiku fails often, sonnet succeeds
    for (let i = 0; i < MIN_OBSERVATIONS; i++) {
      updateModelPerformance(metrics, 'haiku', 'Feature', 'Complex', false, 100);
      updateModelPerformance(metrics, 'sonnet', 'Feature', 'Complex', true, 300);
    }

    const result = selectLearnedModel(metrics, 'Feature', 'Complex');
    expect(result).toBe('sonnet');
  });

  it('allows de-escalation from sonnet to haiku', () => {
    const metrics = makeMetrics();

    // Haiku succeeds consistently for simple tasks
    for (let i = 0; i < MIN_OBSERVATIONS; i++) {
      updateModelPerformance(metrics, 'haiku', 'Docs', 'Simple', true, 50);
      updateModelPerformance(metrics, 'sonnet', 'Docs', 'Simple', true, 300);
    }

    const result = selectLearnedModel(metrics, 'Docs', 'Simple');
    expect(result).toBe('haiku'); // De-escalated due to cost advantage
  });
});
