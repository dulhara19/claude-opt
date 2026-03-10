import { describe, it, expect } from 'vitest';
import { updateLearnedThresholds } from '../../src/learner/threshold-learner.js';
import type { Metrics, TaskHistory } from '../../src/types/index.js';

function makeMetrics(): Metrics {
  return {
    schemaVersion: '1.0.0',
    overall: { totalTasks: 0, totalSessions: 0, avgPrecision: 0, avgRecall: 0, totalTokensConsumed: 0, totalTokensSaved: 0, savingsRate: 0 },
    perDomain: {},
    windows: [],
    predictionTrend: [],
  };
}

function makeTask(taskType: string, predictedFiles: string[], actualFiles: string[]) {
  return {
    id: `t_${Date.now()}`,
    timestamp: new Date().toISOString(),
    taskText: 'test task',
    classification: { taskType, complexity: 'Medium', confidence: 0.8 },
    prediction: { predictedFiles, actualFiles, precision: 0, recall: 0 },
    routing: { model: 'sonnet', reason: 'default' },
    tokens: { consumed: 100, budgeted: 200, saved: 100 },
    feedback: null,
  };
}

function makeHistory(tasks: ReturnType<typeof makeTask>[]): TaskHistory {
  return {
    schemaVersion: '1.0.0',
    cap: 200,
    count: tasks.length,
    oldestArchive: null,
    tasks,
  };
}

describe('updateLearnedThresholds', () => {
  it('does not learn with fewer than 10 tasks per type', () => {
    const metrics = makeMetrics();
    const history = makeHistory([
      makeTask('BugFix', ['a.ts'], ['a.ts']),
      makeTask('BugFix', ['b.ts'], ['b.ts']),
    ]);

    updateLearnedThresholds(metrics, history);

    expect(metrics.learnedThresholds).toEqual({});
  });

  it('learns a threshold for types with 10+ tasks', () => {
    const metrics = makeMetrics();
    const tasks = Array.from({ length: 12 }, (_, i) =>
      makeTask('BugFix', [`src/f${i}.ts`, `src/extra${i}.ts`], [`src/f${i}.ts`]),
    );
    const history = makeHistory(tasks);

    updateLearnedThresholds(metrics, history);

    expect(metrics.learnedThresholds).toBeDefined();
    expect(metrics.learnedThresholds!['BugFix']).toBeDefined();
    expect(metrics.learnedThresholds!['BugFix']).toBeGreaterThanOrEqual(0.25);
    expect(metrics.learnedThresholds!['BugFix']).toBeLessThanOrEqual(0.80);
  });

  it('learns different thresholds per task type', () => {
    const metrics = makeMetrics();
    const tasks = [
      // BugFix: high precision (predicted == actual)
      ...Array.from({ length: 12 }, (_, i) =>
        makeTask('BugFix', [`src/bug${i}.ts`], [`src/bug${i}.ts`]),
      ),
      // Feature: lower precision (many false positives)
      ...Array.from({ length: 12 }, (_, i) =>
        makeTask('Feature', [`src/feat${i}.ts`, `src/wrong${i}.ts`, `src/extra${i}.ts`], [`src/feat${i}.ts`]),
      ),
    ];
    const history = makeHistory(tasks);

    updateLearnedThresholds(metrics, history);

    expect(metrics.learnedThresholds!['BugFix']).toBeDefined();
    expect(metrics.learnedThresholds!['Feature']).toBeDefined();
  });
});
