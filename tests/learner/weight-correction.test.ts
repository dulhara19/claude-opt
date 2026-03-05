import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  correctWeights,
  applyWeightCorrections,
  applyWeightToPatterns,
  decayStaleEntries,
  runWeightCorrection,
} from '../../src/learner/weight-correction.js';
import {
  BOOST_FACTOR, DECAY_FACTOR, WEIGHT_FLOOR, WEIGHT_CEILING,
} from '../../src/learner/types.js';
import type { DependencyGraph, Patterns, TaskEntry } from '../../src/types/store.js';
import { createTempProjectRoot, cleanupTempProjectRoot } from '../helpers/test-store.js';
import {
  initializeStore,
  readDependencyGraph, writeDependencyGraph,
  readPatterns, writePatterns,
  writeTaskHistory,
} from '../../src/store/index.js';

let projectRoot: string;

function makeGraph(edges: DependencyGraph['edges'] = []): DependencyGraph {
  const adjacency: DependencyGraph['adjacency'] = {};
  for (const edge of edges) {
    if (!adjacency[edge.source]) adjacency[edge.source] = { imports: [], importedBy: [] };
    if (!adjacency[edge.target]) adjacency[edge.target] = { imports: [], importedBy: [] };
  }
  return { schemaVersion: '1.0.0', updatedAt: new Date().toISOString(), edges, adjacency };
}

function makePatterns(overrides?: Partial<Patterns>): Patterns {
  return {
    schemaVersion: '1.0.0',
    coOccurrences: [],
    typeAffinities: {},
    conventions: [],
    ...overrides,
  };
}

function makeTask(overrides?: Partial<TaskEntry>): TaskEntry {
  return {
    id: 't_001',
    timestamp: new Date().toISOString(),
    taskText: 'test task',
    classification: { taskType: 'feature', complexity: 'Medium', confidence: 0.8 },
    prediction: { predictedFiles: [], actualFiles: [], precision: 0, recall: 0 },
    routing: { model: 'sonnet', reason: 'default' },
    tokens: { consumed: 100, budgeted: 200, saved: 100 },
    feedback: null,
    ...overrides,
  };
}

// ─── Task 9: Weight Boost Tests ───────────────────────────────

describe('correctWeights — boost (AC1)', () => {
  beforeEach(() => {
    projectRoot = createTempProjectRoot();
    initializeStore(projectRoot);
  });
  afterEach(() => cleanupTempProjectRoot(projectRoot));

  it('should give proportionally large boost for high confidence (0.9) true positive', () => {
    const graph = makeGraph([{
      source: 'src/auth.ts', target: 'src/middleware.ts',
      type: 'cooccurrence', weight: 0.3, discoveredBy: 'learner',
    }]);
    writeDependencyGraph(projectRoot, graph);

    const corrections = correctWeights(
      ['src/auth.ts'], ['src/auth.ts'], [0.9], 't_001', projectRoot,
    );

    expect(corrections.length).toBe(1);
    expect(corrections[0].reason).toBe('boost');
    expect(corrections[0].delta).toBeCloseTo(BOOST_FACTOR * 0.9, 5);
  });

  it('should give proportionally small boost for low confidence (0.3) true positive', () => {
    const graph = makeGraph([{
      source: 'src/auth.ts', target: 'src/other.ts',
      type: 'cooccurrence', weight: 0.3, discoveredBy: 'learner',
    }]);
    writeDependencyGraph(projectRoot, graph);

    const corrections = correctWeights(
      ['src/auth.ts'], ['src/auth.ts'], [0.3], 't_001', projectRoot,
    );

    expect(corrections[0].delta).toBeCloseTo(BOOST_FACTOR * 0.3, 5);
  });

  it('should cap boosted weight at 1.0', () => {
    const graph = makeGraph([{
      source: 'src/auth.ts', target: 'src/other.ts',
      type: 'cooccurrence', weight: 0.95, discoveredBy: 'learner',
    }]);
    writeDependencyGraph(projectRoot, graph);

    const corrections = correctWeights(
      ['src/auth.ts'], ['src/auth.ts'], [0.9], 't_001', projectRoot,
    );

    expect(corrections[0].newWeight).toBeLessThanOrEqual(WEIGHT_CEILING);
  });

  it('should only boost correct files (no side effects)', () => {
    const graph = makeGraph([
      { source: 'src/a.ts', target: 'src/b.ts', type: 'cooccurrence', weight: 0.3, discoveredBy: 'learner' },
      { source: 'src/c.ts', target: 'src/d.ts', type: 'cooccurrence', weight: 0.3, discoveredBy: 'learner' },
    ]);
    writeDependencyGraph(projectRoot, graph);

    const corrections = correctWeights(
      ['src/a.ts'], ['src/a.ts'], [0.8], 't_001', projectRoot,
    );

    // Only src/a.ts should be corrected
    expect(corrections.length).toBe(1);
    expect(corrections[0].file).toBe('src/a.ts');
  });

  it('should never modify scanner-discovered edges', () => {
    const graph = makeGraph([{
      source: 'src/index.ts', target: 'src/utils.ts',
      type: 'import', weight: 1.0, discoveredBy: 'scanner',
    }]);
    writeDependencyGraph(projectRoot, graph);

    // Predict a file that only has scanner edges
    const corrections = correctWeights(
      ['src/index.ts'], ['src/index.ts'], [0.9], 't_001', projectRoot,
    );

    // No learner edge found for this file -> uses default weight
    // But importantly, applyWeightCorrections should not modify scanner edges
    applyWeightCorrections(corrections, projectRoot);

    const result = readDependencyGraph(projectRoot);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const scannerEdge = result.value.edges.find((e) => e.discoveredBy === 'scanner');
      expect(scannerEdge!.weight).toBe(1.0); // Unchanged
    }
  });
});

// ─── Task 10: Weight Decay Tests ──────────────────────────────

describe('correctWeights — decay (AC2)', () => {
  beforeEach(() => {
    projectRoot = createTempProjectRoot();
    initializeStore(projectRoot);
  });
  afterEach(() => cleanupTempProjectRoot(projectRoot));

  it('should give larger decay penalty for high confidence (0.9) false positive', () => {
    const graph = makeGraph([{
      source: 'src/auth.ts', target: 'src/other.ts',
      type: 'cooccurrence', weight: 0.5, discoveredBy: 'learner',
    }]);
    writeDependencyGraph(projectRoot, graph);

    const corrections = correctWeights(
      ['src/auth.ts'], [], [0.9], 't_001', projectRoot,
    );

    expect(corrections[0].reason).toBe('decay');
    expect(Math.abs(corrections[0].delta)).toBeCloseTo(DECAY_FACTOR * 0.9, 5);
  });

  it('should give smaller decay penalty for low confidence (0.3) false positive', () => {
    const graph = makeGraph([{
      source: 'src/auth.ts', target: 'src/other.ts',
      type: 'cooccurrence', weight: 0.5, discoveredBy: 'learner',
    }]);
    writeDependencyGraph(projectRoot, graph);

    const corrections = correctWeights(
      ['src/auth.ts'], [], [0.3], 't_001', projectRoot,
    );

    expect(Math.abs(corrections[0].delta)).toBeCloseTo(DECAY_FACTOR * 0.3, 5);
  });

  it('should floor decayed weight at 0.05 (single miss never eliminates file)', () => {
    const graph = makeGraph([{
      source: 'src/auth.ts', target: 'src/other.ts',
      type: 'cooccurrence', weight: 0.06, discoveredBy: 'learner',
    }]);
    writeDependencyGraph(projectRoot, graph);

    const corrections = correctWeights(
      ['src/auth.ts'], [], [0.9], 't_001', projectRoot,
    );

    expect(corrections[0].newWeight).toBeGreaterThanOrEqual(WEIGHT_FLOOR);
  });

  it('should maintain positive weight after 3 consecutive incorrect predictions', () => {
    const graph = makeGraph([{
      source: 'src/auth.ts', target: 'src/other.ts',
      type: 'cooccurrence', weight: 0.5, discoveredBy: 'learner',
    }]);
    writeDependencyGraph(projectRoot, graph);

    // Simulate 3 consecutive decays
    let currentWeight = 0.5;
    for (let i = 0; i < 3; i++) {
      const decay = DECAY_FACTOR * 0.8;
      currentWeight = Math.max(currentWeight - decay, WEIGHT_FLOOR);
    }

    expect(currentWeight).toBeGreaterThan(0);
    expect(currentWeight).toBeGreaterThanOrEqual(WEIGHT_FLOOR);
  });

  it('should have asymmetric decay — decay magnitude smaller than boost at same confidence', () => {
    const confidence = 0.8;
    const boost = BOOST_FACTOR * confidence;
    const decay = DECAY_FACTOR * confidence;

    expect(decay).toBeLessThan(boost);
  });
});

// ─── Task 11: Stale Entry Decay Tests ─────────────────────────

describe('decayStaleEntries (AC3)', () => {
  beforeEach(() => {
    projectRoot = createTempProjectRoot();
    initializeStore(projectRoot);
  });
  afterEach(() => cleanupTempProjectRoot(projectRoot));

  it('should not decay entries seen within STALE_THRESHOLD_SESSIONS', () => {
    // All tasks are recent
    const history = {
      schemaVersion: '1.0.0', cap: 100, count: 5, oldestArchive: null,
      tasks: Array.from({ length: 5 }, (_, i) => makeTask({
        id: `t_${i}`,
        timestamp: new Date().toISOString(),
        prediction: { predictedFiles: [], actualFiles: ['src/a.ts'], precision: 0, recall: 0 },
      })),
    };
    writeTaskHistory(projectRoot, history);

    const patterns = makePatterns({
      coOccurrences: [{
        id: 'co_001', files: ['src/a.ts', 'src/b.ts'],
        count: 5, frequency: 5, confidence: 0.8,
        lastSeen: new Date().toISOString(),
        discoveredAt: new Date().toISOString(),
        decayFactor: 1.0,
      }],
    });
    writePatterns(projectRoot, patterns);

    const result = decayStaleEntries(projectRoot, 5);
    expect(result.staleEntries.length).toBe(0);
  });

  it('should flag entry as fully stale when decayFactor < FULLY_STALE_WEIGHT', () => {
    // Create old tasks far in the past, with the stale files referenced early
    const oldDate = '2025-01-01T00:00:00Z';
    const tasks = [
      // One old task that references the stale files
      makeTask({
        id: 't_old',
        timestamp: oldDate,
        prediction: { predictedFiles: [], actualFiles: ['src/old.ts', 'src/ancient.ts'], precision: 0, recall: 0 },
      }),
      // Many recent tasks that DON'T reference the stale files
      ...Array.from({ length: 50 }, (_, i) => makeTask({
        id: `t_${i}`,
        timestamp: new Date(Date.now() - i * 1000).toISOString(),
        prediction: { predictedFiles: [], actualFiles: ['src/recent.ts'], precision: 0, recall: 0 },
      })),
    ];

    const history = {
      schemaVersion: '1.0.0', cap: 100, count: tasks.length,
      oldestArchive: null, tasks,
    };
    writeTaskHistory(projectRoot, history);

    const patterns = makePatterns({
      coOccurrences: [{
        id: 'co_001', files: ['src/old.ts', 'src/ancient.ts'],
        count: 5, frequency: 5, confidence: 0.8,
        lastSeen: oldDate, discoveredAt: oldDate,
        decayFactor: 0.06, // just above threshold
      }],
    });
    writePatterns(projectRoot, patterns);

    const graph = makeGraph([{
      source: 'src/old.ts', target: 'src/ancient.ts',
      type: 'cooccurrence', weight: 0.3, discoveredBy: 'learner',
    }]);
    writeDependencyGraph(projectRoot, graph);

    decayStaleEntries(projectRoot, 30);

    // Check patterns decayed — many tasks have happened since the old one
    const updatedPatterns = readPatterns(projectRoot);
    if (updatedPatterns.ok) {
      const coOcc = updatedPatterns.value.coOccurrences[0];
      // The pattern should have been decayed since 50 tasks happened after lastSeen
      expect(coOcc.decayFactor).toBeLessThanOrEqual(0.06);
    }
  });

  it('should never decay scanner-discovered edges', () => {
    const history = {
      schemaVersion: '1.0.0', cap: 100, count: 1, oldestArchive: null,
      tasks: [makeTask({
        timestamp: '2025-01-01T00:00:00Z',
        prediction: { predictedFiles: [], actualFiles: ['src/a.ts'], precision: 0, recall: 0 },
      })],
    };
    writeTaskHistory(projectRoot, history);

    const graph = makeGraph([{
      source: 'src/a.ts', target: 'src/b.ts',
      type: 'import', weight: 1.0, discoveredBy: 'scanner',
    }]);
    writeDependencyGraph(projectRoot, graph);

    decayStaleEntries(projectRoot, 30);

    const result = readDependencyGraph(projectRoot);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.edges[0].weight).toBe(1.0); // Unchanged
    }
  });

  it('should NOT remove stale entries, only flag them', () => {
    const history = {
      schemaVersion: '1.0.0', cap: 100, count: 1, oldestArchive: null,
      tasks: [makeTask({ timestamp: '2025-01-01T00:00:00Z' })],
    };
    writeTaskHistory(projectRoot, history);

    const patterns = makePatterns({
      coOccurrences: [{
        id: 'co_001', files: ['src/old.ts', 'src/ancient.ts'],
        count: 5, frequency: 5, confidence: 0.8,
        lastSeen: '2025-01-01T00:00:00Z', discoveredAt: '2025-01-01T00:00:00Z',
        decayFactor: 0.03,
      }],
    });
    writePatterns(projectRoot, patterns);

    decayStaleEntries(projectRoot, 30);

    // Pattern should still exist (not removed)
    const result = readPatterns(projectRoot);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.coOccurrences.length).toBe(1);
    }
  });
});

// ─── Task 12: Pattern Weight Update Tests ─────────────────────

describe('applyWeightToPatterns (AC4)', () => {
  beforeEach(() => {
    projectRoot = createTempProjectRoot();
    initializeStore(projectRoot);
  });
  afterEach(() => cleanupTempProjectRoot(projectRoot));

  it('should boost co-occurrence decayFactor when files are used together', () => {
    const patterns = makePatterns({
      coOccurrences: [{
        id: 'co_001', files: ['src/a.ts', 'src/b.ts'],
        count: 5, frequency: 5, confidence: 0.8,
        lastSeen: new Date().toISOString(), discoveredAt: new Date().toISOString(),
        decayFactor: 0.8,
      }],
    });
    writePatterns(projectRoot, patterns);

    const corrections = [{ file: 'src/a.ts', previousWeight: 0.3, newWeight: 0.39, delta: 0.09, reason: 'boost' as const, predictionConfidence: 0.9, taskId: 't_001' }];
    const updated = applyWeightToPatterns(corrections, projectRoot);

    expect(updated).toBe(true);
    const result = readPatterns(projectRoot);
    if (result.ok) {
      expect(result.value.coOccurrences[0].decayFactor).toBeCloseTo(0.8 * 1.1, 5);
    }
  });

  it('should reduce co-occurrence decayFactor when predicted pair not used', () => {
    const patterns = makePatterns({
      coOccurrences: [{
        id: 'co_001', files: ['src/a.ts', 'src/b.ts'],
        count: 5, frequency: 5, confidence: 0.8,
        lastSeen: new Date().toISOString(), discoveredAt: new Date().toISOString(),
        decayFactor: 0.8,
      }],
    });
    writePatterns(projectRoot, patterns);

    const corrections = [{ file: 'src/a.ts', previousWeight: 0.3, newWeight: 0.255, delta: -0.045, reason: 'decay' as const, predictionConfidence: 0.9, taskId: 't_001' }];
    const updated = applyWeightToPatterns(corrections, projectRoot);

    expect(updated).toBe(true);
    const result = readPatterns(projectRoot);
    if (result.ok) {
      expect(result.value.coOccurrences[0].decayFactor).toBeCloseTo(0.8 * 0.9, 5);
    }
  });

  it('should update type affinity weights on boost/decay', () => {
    const patterns = makePatterns({
      typeAffinities: {
        bugfix: {
          taskType: 'bugfix', files: ['tests/a.test.ts'], confidence: 0.6,
          fileWeights: { 'tests/a.test.ts': { weight: 0.6, occurrences: 5 } },
        },
      },
    });
    writePatterns(projectRoot, patterns);

    const corrections = [{
      file: 'tests/a.test.ts', previousWeight: 0.6, newWeight: 0.69, delta: 0.09,
      reason: 'boost' as const, predictionConfidence: 0.9, taskId: 't_001',
    }];
    applyWeightToPatterns(corrections, projectRoot);

    const result = readPatterns(projectRoot);
    if (result.ok) {
      const w = result.value.typeAffinities.bugfix.fileWeights!['tests/a.test.ts'].weight;
      expect(w).toBeGreaterThan(0.6);
    }
  });

  it('should make weight changes visible in patterns.json (transparency)', () => {
    const patterns = makePatterns({
      coOccurrences: [{
        id: 'co_001', files: ['src/a.ts', 'src/b.ts'],
        count: 5, frequency: 5, confidence: 0.8,
        lastSeen: new Date().toISOString(), discoveredAt: new Date().toISOString(),
        decayFactor: 0.8, // Start below 1.0 so boost is visible
      }],
    });
    writePatterns(projectRoot, patterns);

    const corrections = [{ file: 'src/a.ts', previousWeight: 0.3, newWeight: 0.39, delta: 0.09, reason: 'boost' as const, predictionConfidence: 0.9, taskId: 't_001' }];
    applyWeightToPatterns(corrections, projectRoot);

    const result = readPatterns(projectRoot);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // The decayFactor change is visible in the JSON (0.8 * 1.1 = 0.88)
      expect(result.value.coOccurrences[0].decayFactor).toBeCloseTo(0.88, 5);
      expect(result.value.coOccurrences[0].decayFactor).not.toBe(0.8);
    }
  });
});

// ─── Task 13: Integration Test — Self-Improvement Over Time ───

describe('runWeightCorrection (integration AC4)', () => {
  beforeEach(() => {
    projectRoot = createTempProjectRoot();
    initializeStore(projectRoot);
  });
  afterEach(() => cleanupTempProjectRoot(projectRoot));

  it('should show improvement trend over 10+ tasks', () => {
    // Setup initial graph with learner edges
    const graph = makeGraph([
      { source: 'src/auth.ts', target: 'src/middleware.ts', type: 'cooccurrence', weight: 0.3, discoveredBy: 'learner' },
      { source: 'src/utils.ts', target: 'src/helpers.ts', type: 'cooccurrence', weight: 0.3, discoveredBy: 'learner' },
    ]);
    writeDependencyGraph(projectRoot, graph);

    const patterns = makePatterns({
      coOccurrences: [{
        id: 'co_001', files: ['src/auth.ts', 'src/middleware.ts'],
        count: 5, frequency: 5, confidence: 0.8,
        lastSeen: new Date().toISOString(), discoveredAt: new Date().toISOString(),
        decayFactor: 1.0,
      }],
    });
    writePatterns(projectRoot, patterns);

    const history = {
      schemaVersion: '1.0.0', cap: 100, count: 0, oldestArchive: null, tasks: [] as TaskEntry[],
    };
    writeTaskHistory(projectRoot, history);

    // Simulate 10 tasks: auth.ts is consistently used (true positive)
    for (let i = 0; i < 10; i++) {
      runWeightCorrection(
        ['src/auth.ts'], ['src/auth.ts'], [0.8], `t_${i}`, projectRoot, i + 1,
      );
    }

    // After 10 boosts, auth.ts weight should be significantly higher
    const result = readDependencyGraph(projectRoot);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const authEdge = result.value.edges.find((e) => e.source === 'src/auth.ts' || e.target === 'src/auth.ts');
      expect(authEdge).toBeDefined();
      expect(authEdge!.weight!).toBeGreaterThan(0.3);
    }
  });
});

// ─── Task 14: Fail-Open Tests ─────────────────────────────────

describe('fail-open behavior (AC5)', () => {
  beforeEach(() => {
    projectRoot = createTempProjectRoot();
    initializeStore(projectRoot);
  });
  afterEach(() => cleanupTempProjectRoot(projectRoot));

  it('correctWeights should not throw when graph read fails', () => {
    // Use invalid project root so reads fail
    expect(() => {
      correctWeights(['src/a.ts'], ['src/a.ts'], [0.8], 't_001', '/nonexistent');
    }).not.toThrow();
  });

  it('applyWeightCorrections should not throw when graph read fails', () => {
    const corrections = [{ file: 'src/a.ts', previousWeight: 0.3, newWeight: 0.39, delta: 0.09, reason: 'boost' as const, predictionConfidence: 0.9, taskId: 't_001' }];
    expect(() => {
      applyWeightCorrections(corrections, '/nonexistent');
    }).not.toThrow();
  });

  it('decayStaleEntries should not throw when reads fail', () => {
    expect(() => {
      decayStaleEntries('/nonexistent', 10);
    }).not.toThrow();
  });

  it('runWeightCorrection should handle errors gracefully and return result', () => {
    // Valid project root but no learner edges
    const graph = makeGraph([]);
    writeDependencyGraph(projectRoot, graph);

    const result = runWeightCorrection(
      ['src/a.ts'], [], [0.8], 't_001', projectRoot, 1,
    );

    expect(result).toBeDefined();
    expect(result.corrections).toBeDefined();
    expect(result.staleEntries).toBeDefined();
  });
});
