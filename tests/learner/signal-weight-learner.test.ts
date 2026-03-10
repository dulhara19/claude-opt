import { describe, it, expect } from 'vitest';
import { updateSignalAccuracy, updateLearnedWeights, resolveSignalWeights } from '../../src/learner/signal-weight-learner.js';
import { SignalSource, DEFAULT_SIGNAL_WEIGHTS } from '../../src/predictor/types.js';
import type { Metrics } from '../../src/types/index.js';
import type { FilePrediction } from '../../src/predictor/types.js';

function makeMetrics(overrides?: Partial<Metrics>): Metrics {
  return {
    schemaVersion: '1.0.0',
    overall: { totalTasks: 0, totalSessions: 0, avgPrecision: 0, avgRecall: 0, totalTokensConsumed: 0, totalTokensSaved: 0, savingsRate: 0 },
    perDomain: {},
    windows: [],
    predictionTrend: [],
    ...overrides,
  };
}

function makePrediction(filePath: string, signals: Array<{ source: SignalSource }>): FilePrediction {
  return {
    filePath,
    score: 0.8,
    signals: signals.map((s) => ({ source: s.source, score: 0.8, weight: 0.2, reason: 'test' })),
  };
}

describe('updateSignalAccuracy', () => {
  it('initializes signalAccuracy if not present', () => {
    const metrics = makeMetrics();
    const predictions = [makePrediction('src/a.ts', [{ source: SignalSource.KeywordLookup }])];
    const actualFiles = new Set(['src/a.ts']);

    updateSignalAccuracy(metrics, predictions, actualFiles);

    expect(metrics.signalAccuracy).toBeDefined();
    expect(metrics.signalAccuracy![SignalSource.KeywordLookup]).toEqual({
      truePositives: 1,
      falsePositives: 0,
      totalPredictions: 1,
    });
  });

  it('tracks false positives for files not actually used', () => {
    const metrics = makeMetrics();
    const predictions = [makePrediction('src/wrong.ts', [{ source: SignalSource.GraphTraversal }])];
    const actualFiles = new Set<string>();

    updateSignalAccuracy(metrics, predictions, actualFiles);

    expect(metrics.signalAccuracy![SignalSource.GraphTraversal].falsePositives).toBe(1);
    expect(metrics.signalAccuracy![SignalSource.GraphTraversal].truePositives).toBe(0);
  });

  it('accumulates across multiple calls', () => {
    const metrics = makeMetrics();
    const actual = new Set(['src/a.ts']);

    updateSignalAccuracy(metrics, [makePrediction('src/a.ts', [{ source: SignalSource.KeywordLookup }])], actual);
    updateSignalAccuracy(metrics, [makePrediction('src/b.ts', [{ source: SignalSource.KeywordLookup }])], actual);

    expect(metrics.signalAccuracy![SignalSource.KeywordLookup].totalPredictions).toBe(2);
    expect(metrics.signalAccuracy![SignalSource.KeywordLookup].truePositives).toBe(1);
    expect(metrics.signalAccuracy![SignalSource.KeywordLookup].falsePositives).toBe(1);
  });
});

describe('updateLearnedWeights', () => {
  it('does nothing with insufficient data', () => {
    const metrics = makeMetrics({
      signalAccuracy: {
        [SignalSource.KeywordLookup]: { truePositives: 3, falsePositives: 1, totalPredictions: 4 },
      },
    });

    updateLearnedWeights(metrics);
    expect(metrics.learnedSignalWeights).toBeUndefined();
  });

  it('learns weights when enough signal data is available', () => {
    const metrics = makeMetrics({
      signalAccuracy: {
        [SignalSource.KeywordLookup]: { truePositives: 8, falsePositives: 2, totalPredictions: 10 },
        [SignalSource.GraphTraversal]: { truePositives: 5, falsePositives: 5, totalPredictions: 10 },
      },
    });

    updateLearnedWeights(metrics);

    expect(metrics.learnedSignalWeights).toBeDefined();
    // KeywordLookup has higher precision (0.8 vs 0.5), should get higher weight
    expect(metrics.learnedSignalWeights![SignalSource.KeywordLookup]).toBeGreaterThan(
      metrics.learnedSignalWeights![SignalSource.GraphTraversal],
    );
  });

  it('enforces minimum weight floor', () => {
    const metrics = makeMetrics({
      signalAccuracy: {
        [SignalSource.KeywordLookup]: { truePositives: 10, falsePositives: 0, totalPredictions: 10 },
        [SignalSource.GraphTraversal]: { truePositives: 0, falsePositives: 10, totalPredictions: 10 },
      },
    });

    updateLearnedWeights(metrics);

    // Even the worst signal should have at least the floor
    for (const weight of Object.values(metrics.learnedSignalWeights!)) {
      expect(weight).toBeGreaterThanOrEqual(0.04); // slightly below 0.05 due to normalization
    }
  });

  it('normalizes weights to sum to ~1.0', () => {
    const metrics = makeMetrics({
      signalAccuracy: {
        [SignalSource.KeywordLookup]: { truePositives: 8, falsePositives: 2, totalPredictions: 10 },
        [SignalSource.GraphTraversal]: { truePositives: 6, falsePositives: 4, totalPredictions: 10 },
        [SignalSource.HistorySimilarity]: { truePositives: 7, falsePositives: 3, totalPredictions: 10 },
      },
    });

    updateLearnedWeights(metrics);

    const sum = Object.values(metrics.learnedSignalWeights!).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 1);
  });
});

describe('resolveSignalWeights', () => {
  it('returns null when no learned weights', () => {
    expect(resolveSignalWeights(undefined)).toBeNull();
    expect(resolveSignalWeights({})).toBeNull();
  });

  it('maps signal source names to SignalWeights keys', () => {
    const learned = {
      [SignalSource.KeywordLookup]: 0.3,
      [SignalSource.GraphTraversal]: 0.2,
    };

    const weights = resolveSignalWeights(learned);
    expect(weights).not.toBeNull();
    expect(weights!.keyword).toBe(0.3);
    expect(weights!.graph).toBe(0.2);
  });

  it('uses defaults for signals not in learned weights', () => {
    const learned = {
      [SignalSource.KeywordLookup]: 0.5,
    };

    const weights = resolveSignalWeights(learned);
    expect(weights!.history).toBe(DEFAULT_SIGNAL_WEIGHTS.history);
  });
});
