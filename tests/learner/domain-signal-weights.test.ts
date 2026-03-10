import { describe, it, expect } from 'vitest';
import { updateDomainSignalAccuracy, updateDomainLearnedWeights, resolveSignalWeights } from '../../src/learner/signal-weight-learner.js';
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

function makePrediction(filePath: string, source: SignalSource): FilePrediction {
  return {
    filePath,
    score: 0.8,
    signals: [{ source, score: 0.8, weight: 0.2, reason: 'test' }],
  };
}

describe('updateDomainSignalAccuracy', () => {
  it('tracks accuracy per domain:signal key', () => {
    const metrics = makeMetrics();
    const actual = new Set(['src/a.ts']);

    updateDomainSignalAccuracy(metrics, [makePrediction('src/a.ts', SignalSource.KeywordLookup)], actual, 'auth');

    expect(metrics.domainSignalAccuracy).toBeDefined();
    expect(metrics.domainSignalAccuracy!['auth:KeywordLookup'].truePositives).toBe(1);
  });

  it('skips unknown domain', () => {
    const metrics = makeMetrics();
    updateDomainSignalAccuracy(metrics, [makePrediction('src/a.ts', SignalSource.KeywordLookup)], new Set(['src/a.ts']), 'unknown');
    expect(metrics.domainSignalAccuracy).toBeUndefined();
  });

  it('tracks different domains separately', () => {
    const metrics = makeMetrics();
    const actual = new Set(['src/a.ts']);

    updateDomainSignalAccuracy(metrics, [makePrediction('src/a.ts', SignalSource.KeywordLookup)], actual, 'auth');
    updateDomainSignalAccuracy(metrics, [makePrediction('src/b.ts', SignalSource.KeywordLookup)], new Set(), 'payments');

    expect(metrics.domainSignalAccuracy!['auth:KeywordLookup'].truePositives).toBe(1);
    expect(metrics.domainSignalAccuracy!['payments:KeywordLookup'].falsePositives).toBe(1);
  });
});

describe('updateDomainLearnedWeights', () => {
  it('does not learn with insufficient data', () => {
    const metrics = makeMetrics({
      domainSignalAccuracy: {
        'auth:KeywordLookup': { truePositives: 5, falsePositives: 2, totalPredictions: 7 },
      },
    });

    updateDomainLearnedWeights(metrics, 'auth');
    expect(metrics.domainSignalWeights).toBeUndefined();
  });

  it('learns domain weights with enough data', () => {
    const metrics = makeMetrics({
      domainSignalAccuracy: {
        'auth:KeywordLookup': { truePositives: 12, falsePositives: 3, totalPredictions: 15 },
        'auth:GraphTraversal': { truePositives: 8, falsePositives: 7, totalPredictions: 15 },
      },
    });

    updateDomainLearnedWeights(metrics, 'auth');

    expect(metrics.domainSignalWeights).toBeDefined();
    expect(metrics.domainSignalWeights!['auth']).toBeDefined();
    // KeywordLookup has higher precision, should get higher weight
    expect(metrics.domainSignalWeights!['auth'][SignalSource.KeywordLookup]).toBeGreaterThan(
      metrics.domainSignalWeights!['auth'][SignalSource.GraphTraversal],
    );
  });
});

describe('resolveSignalWeights with domain fallback', () => {
  it('uses domain weights when available', () => {
    const domainWeights = {
      auth: { [SignalSource.KeywordLookup]: 0.5, [SignalSource.GraphTraversal]: 0.3 },
    };

    const weights = resolveSignalWeights(undefined, domainWeights, 'auth');
    expect(weights).not.toBeNull();
    expect(weights!.keyword).toBe(0.5);
  });

  it('falls back to global learned when domain has no weights', () => {
    const globalWeights = { [SignalSource.KeywordLookup]: 0.4 };

    const weights = resolveSignalWeights(globalWeights, {}, 'auth');
    expect(weights).not.toBeNull();
    expect(weights!.keyword).toBe(0.4);
  });

  it('falls back to null when nothing is learned', () => {
    expect(resolveSignalWeights(undefined, {}, 'auth')).toBeNull();
  });
});
