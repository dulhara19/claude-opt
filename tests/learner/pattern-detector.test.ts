import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  detectPatterns,
  detectCoOccurrences,
  detectTypeAffinities,
  detectConventions,
} from '../../src/learner/pattern-detector.js';
import { updateDependencyGraph } from '../../src/learner/knowledge-learner.js';
import {
  CO_OCCURRENCE_THRESHOLD,
  LEARNER_EDGE_INITIAL_WEIGHT,
  LEARNER_EDGE_INCREMENT,
  LEARNER_EDGE_MAX_WEIGHT,
} from '../../src/learner/types.js';
import type { TaskEntry, Patterns, DependencyGraph } from '../../src/types/store.js';
import { createTempProjectRoot, cleanupTempProjectRoot } from '../helpers/test-store.js';
import {
  initializeStore,
  readDependencyGraph,
  writeDependencyGraph,
} from '../../src/store/index.js';

let projectRoot: string;

function makeTaskEntry(overrides?: Partial<TaskEntry>): TaskEntry {
  return {
    id: 't_20260304_001',
    timestamp: new Date().toISOString(),
    taskText: 'test task',
    classification: {
      taskType: 'feature',
      complexity: 'Medium',
      confidence: 0.8,
    },
    prediction: {
      predictedFiles: [],
      actualFiles: [],
      precision: 0,
      recall: 0,
    },
    routing: { model: 'sonnet', reason: 'default' },
    tokens: { consumed: 100, budgeted: 200, saved: 100 },
    feedback: null,
    ...overrides,
  };
}

function makeDefaultPatterns(): Patterns {
  return {
    schemaVersion: '1.0.0',
    coOccurrences: [],
    typeAffinities: {},
    conventions: [],
  };
}

function makeDefaultGraph(): DependencyGraph {
  return {
    schemaVersion: '1.0.0',
    updatedAt: new Date().toISOString(),
    edges: [],
    adjacency: {},
  };
}

// ─── Task 8: Dependency Graph Update Tests ────────────────────

describe('updateDependencyGraph', () => {
  beforeEach(() => {
    projectRoot = createTempProjectRoot();
    initializeStore(projectRoot);
  });

  afterEach(() => {
    cleanupTempProjectRoot(projectRoot);
  });

  it('should add new co-occurrence edge when no edge exists between files', () => {
    const graph = makeDefaultGraph();
    writeDependencyGraph(projectRoot, graph);

    updateDependencyGraph(projectRoot, ['src/auth.ts', 'src/middleware.ts']);

    const result = readDependencyGraph(projectRoot);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const edges = result.value.edges;
    expect(edges.length).toBe(1);
    expect(edges[0].source).toBe('src/auth.ts');
    expect(edges[0].target).toBe('src/middleware.ts');
  });

  it('should set type "cooccurrence", weight 0.3, discoveredBy "learner" on new edges', () => {
    const graph = makeDefaultGraph();
    writeDependencyGraph(projectRoot, graph);

    updateDependencyGraph(projectRoot, ['src/a.ts', 'src/b.ts']);

    const result = readDependencyGraph(projectRoot);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const edge = result.value.edges[0];
    expect(edge.type).toBe('cooccurrence');
    expect(edge.weight).toBe(LEARNER_EDGE_INITIAL_WEIGHT);
    expect(edge.discoveredBy).toBe('learner');
  });

  it('should increment existing co-occurrence edge weight by 0.1', () => {
    const graph = makeDefaultGraph();
    graph.edges.push({
      source: 'src/a.ts',
      target: 'src/b.ts',
      type: 'cooccurrence',
      weight: LEARNER_EDGE_INITIAL_WEIGHT,
      discoveredBy: 'learner',
    });
    graph.adjacency['src/a.ts'] = { imports: ['src/b.ts'], importedBy: ['src/b.ts'] };
    graph.adjacency['src/b.ts'] = { imports: ['src/a.ts'], importedBy: ['src/a.ts'] };
    writeDependencyGraph(projectRoot, graph);

    updateDependencyGraph(projectRoot, ['src/a.ts', 'src/b.ts']);

    const result = readDependencyGraph(projectRoot);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.edges[0].weight).toBe(LEARNER_EDGE_INITIAL_WEIGHT + LEARNER_EDGE_INCREMENT);
  });

  it('should cap co-occurrence edge weight at 0.9', () => {
    const graph = makeDefaultGraph();
    graph.edges.push({
      source: 'src/a.ts',
      target: 'src/b.ts',
      type: 'cooccurrence',
      weight: 0.85,
      discoveredBy: 'learner',
    });
    graph.adjacency['src/a.ts'] = { imports: ['src/b.ts'], importedBy: ['src/b.ts'] };
    graph.adjacency['src/b.ts'] = { imports: ['src/a.ts'], importedBy: ['src/a.ts'] };
    writeDependencyGraph(projectRoot, graph);

    updateDependencyGraph(projectRoot, ['src/a.ts', 'src/b.ts']);

    const result = readDependencyGraph(projectRoot);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.edges[0].weight).toBe(LEARNER_EDGE_MAX_WEIGHT);
  });

  it('should NOT modify existing import edges', () => {
    const graph = makeDefaultGraph();
    graph.edges.push({
      source: 'src/index.ts',
      target: 'src/utils.ts',
      type: 'import',
      weight: 1.0,
      discoveredBy: 'scanner',
    });
    graph.adjacency['src/index.ts'] = { imports: ['src/utils.ts'], importedBy: [] };
    graph.adjacency['src/utils.ts'] = { imports: [], importedBy: ['src/index.ts'] };
    writeDependencyGraph(projectRoot, graph);

    updateDependencyGraph(projectRoot, ['src/index.ts', 'src/utils.ts']);

    const result = readDependencyGraph(projectRoot);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const importEdge = result.value.edges.find((e) => e.type === 'import');
    expect(importEdge).toBeDefined();
    expect(importEdge!.weight).toBe(1.0);
    expect(importEdge!.discoveredBy).toBe('scanner');
    // No new edges added since import edge already exists for this pair
    expect(result.value.edges.length).toBe(1);
  });

  it('should update adjacency lists correctly for both directions', () => {
    const graph = makeDefaultGraph();
    writeDependencyGraph(projectRoot, graph);

    updateDependencyGraph(projectRoot, ['src/auth.ts', 'src/middleware.ts']);

    const result = readDependencyGraph(projectRoot);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const adj = result.value.adjacency;
    expect(adj['src/auth.ts'].imports).toContain('src/middleware.ts');
    expect(adj['src/auth.ts'].importedBy).toContain('src/middleware.ts');
    expect(adj['src/middleware.ts'].imports).toContain('src/auth.ts');
    expect(adj['src/middleware.ts'].importedBy).toContain('src/auth.ts');
  });

  it('should normalize file paths to POSIX before storing', () => {
    const graph = makeDefaultGraph();
    writeDependencyGraph(projectRoot, graph);

    updateDependencyGraph(projectRoot, ['src\\auth.ts', 'src\\middleware.ts']);

    const result = readDependencyGraph(projectRoot);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const edge = result.value.edges[0];
    expect(edge.source).toBe('src/auth.ts');
    expect(edge.target).toBe('src/middleware.ts');
    expect(edge.source).not.toContain('\\');
    expect(edge.target).not.toContain('\\');
  });
});

// ─── Task 9: Co-Occurrence Detection Tests ────────────────────

describe('detectCoOccurrences', () => {
  it('should not create pattern with fewer than 5 co-occurrences', () => {
    const tasks = Array.from({ length: 4 }, (_, i) =>
      makeTaskEntry({
        id: `t_${i}`,
        prediction: {
          predictedFiles: [],
          actualFiles: ['src/a.ts', 'src/b.ts'],
          precision: 0,
          recall: 0,
        },
      }),
    );
    const patterns = makeDefaultPatterns();
    const result = detectCoOccurrences(tasks, patterns);
    expect(result.newCoOccurrences.length).toBe(0);
  });

  it('should create pattern at exactly 5 co-occurrences with correct fields', () => {
    const tasks = Array.from({ length: CO_OCCURRENCE_THRESHOLD }, (_, i) =>
      makeTaskEntry({
        id: `t_${i}`,
        prediction: {
          predictedFiles: [],
          actualFiles: ['src/a.ts', 'src/b.ts'],
          precision: 0,
          recall: 0,
        },
      }),
    );
    const patterns = makeDefaultPatterns();
    const result = detectCoOccurrences(tasks, patterns);

    expect(result.newCoOccurrences.length).toBe(1);
    const coOcc = result.newCoOccurrences[0];
    expect(coOcc.files).toEqual(['src/a.ts', 'src/b.ts']);
    expect(coOcc.frequency).toBe(CO_OCCURRENCE_THRESHOLD);
    expect(coOcc.count).toBe(CO_OCCURRENCE_THRESHOLD);
    expect(coOcc.decayFactor).toBe(1.0);
    expect(coOcc.discoveredAt).toBeDefined();
    expect(coOcc.lastSeen).toBeDefined();
  });

  it('should calculate confidence correctly (frequency / totalTasks)', () => {
    const tasks = Array.from({ length: 10 }, (_, i) =>
      makeTaskEntry({
        id: `t_${i}`,
        prediction: {
          predictedFiles: [],
          actualFiles: i < 5 ? ['src/a.ts', 'src/b.ts'] : ['src/c.ts'],
          precision: 0,
          recall: 0,
        },
      }),
    );
    const patterns = makeDefaultPatterns();
    const result = detectCoOccurrences(tasks, patterns);

    expect(result.newCoOccurrences.length).toBe(1);
    expect(result.newCoOccurrences[0].confidence).toBe(5 / 10);
  });

  it('should update existing pattern with new frequency and lastSeen', () => {
    const patterns = makeDefaultPatterns();
    patterns.coOccurrences.push({
      id: 'co_001',
      files: ['src/a.ts', 'src/b.ts'],
      count: 5,
      frequency: 5,
      confidence: 0.5,
      lastSeen: '2026-01-01T00:00:00Z',
      discoveredAt: '2025-12-01T00:00:00Z',
      decayFactor: 1.0,
    });

    const tasks = Array.from({ length: 10 }, (_, i) =>
      makeTaskEntry({
        id: `t_${i}`,
        prediction: {
          predictedFiles: [],
          actualFiles: ['src/a.ts', 'src/b.ts'],
          precision: 0,
          recall: 0,
        },
      }),
    );

    const result = detectCoOccurrences(tasks, patterns);
    expect(result.updatedCoOccurrences.length).toBe(1);
    expect(result.updatedCoOccurrences[0].frequency).toBe(10);
    expect(result.updatedCoOccurrences[0].lastSeen).not.toBe('2026-01-01T00:00:00Z');
  });

  it('should sort file pair alphabetically in pattern entry', () => {
    const tasks = Array.from({ length: CO_OCCURRENCE_THRESHOLD }, (_, i) =>
      makeTaskEntry({
        id: `t_${i}`,
        prediction: {
          predictedFiles: [],
          actualFiles: ['src/z.ts', 'src/a.ts'],
          precision: 0,
          recall: 0,
        },
      }),
    );
    const patterns = makeDefaultPatterns();
    const result = detectCoOccurrences(tasks, patterns);

    expect(result.newCoOccurrences[0].files[0]).toBe('src/a.ts');
    expect(result.newCoOccurrences[0].files[1]).toBe('src/z.ts');
  });

  it('should initialize decayFactor to 1.0 for new patterns', () => {
    const tasks = Array.from({ length: CO_OCCURRENCE_THRESHOLD }, (_, i) =>
      makeTaskEntry({
        id: `t_${i}`,
        prediction: {
          predictedFiles: [],
          actualFiles: ['src/a.ts', 'src/b.ts'],
          precision: 0,
          recall: 0,
        },
      }),
    );
    const patterns = makeDefaultPatterns();
    const result = detectCoOccurrences(tasks, patterns);
    expect(result.newCoOccurrences[0].decayFactor).toBe(1.0);
  });

  it('should use co_{sequence} format for pattern IDs', () => {
    const tasks = Array.from({ length: CO_OCCURRENCE_THRESHOLD }, (_, i) =>
      makeTaskEntry({
        id: `t_${i}`,
        prediction: {
          predictedFiles: [],
          actualFiles: ['src/a.ts', 'src/b.ts'],
          precision: 0,
          recall: 0,
        },
      }),
    );
    const patterns = makeDefaultPatterns();
    const result = detectCoOccurrences(tasks, patterns);
    expect(result.newCoOccurrences[0].id).toMatch(/^co_\d{3}$/);
  });
});

// ─── Task 10: Task-Type Affinity Detection Tests ──────────────

describe('detectTypeAffinities', () => {
  it('should detect bugfix tasks using test files creating bugfix->test affinity', () => {
    const tasks = Array.from({ length: 5 }, (_, i) =>
      makeTaskEntry({
        id: `t_${i}`,
        classification: { taskType: 'bugfix', complexity: 'Medium', confidence: 0.8 },
        prediction: {
          predictedFiles: [],
          actualFiles: ['src/utils.ts', 'tests/utils.test.ts'],
          precision: 0,
          recall: 0,
        },
      }),
    );
    const patterns = makeDefaultPatterns();
    const result = detectTypeAffinities(tasks, patterns);

    expect(result).toHaveProperty('bugfix');
    expect(result.bugfix).toHaveProperty('tests/utils.test.ts');
    expect(result.bugfix['tests/utils.test.ts'].occurrences).toBe(5);
  });

  it('should calculate affinity weight correctly (occurrences / total tasks of type)', () => {
    const tasks = [
      ...Array.from({ length: 3 }, (_, i) =>
        makeTaskEntry({
          id: `t_${i}`,
          classification: { taskType: 'bugfix', complexity: 'Medium', confidence: 0.8 },
          prediction: {
            predictedFiles: [],
            actualFiles: ['tests/a.test.ts'],
            precision: 0,
            recall: 0,
          },
        }),
      ),
      makeTaskEntry({
        id: 't_extra',
        classification: { taskType: 'bugfix', complexity: 'Medium', confidence: 0.8 },
        prediction: {
          predictedFiles: [],
          actualFiles: ['src/other.ts'],
          precision: 0,
          recall: 0,
        },
      }),
    ];
    const patterns = makeDefaultPatterns();
    const result = detectTypeAffinities(tasks, patterns);

    expect(result.bugfix['tests/a.test.ts'].weight).toBe(3 / 4);
  });

  it('should not create affinity below threshold (< 3 occurrences or weight < 0.3)', () => {
    const tasks = [
      ...Array.from({ length: 2 }, (_, i) =>
        makeTaskEntry({
          id: `t_${i}`,
          classification: { taskType: 'bugfix', complexity: 'Medium', confidence: 0.8 },
          prediction: {
            predictedFiles: [],
            actualFiles: ['tests/rare.test.ts'],
            precision: 0,
            recall: 0,
          },
        }),
      ),
      ...Array.from({ length: 8 }, (_, i) =>
        makeTaskEntry({
          id: `t_extra_${i}`,
          classification: { taskType: 'bugfix', complexity: 'Medium', confidence: 0.8 },
          prediction: {
            predictedFiles: [],
            actualFiles: ['src/other.ts'],
            precision: 0,
            recall: 0,
          },
        }),
      ),
    ];
    const patterns = makeDefaultPatterns();
    const result = detectTypeAffinities(tasks, patterns);

    // rare.test.ts only appears 2 times (below 3), so no affinity
    expect(result.bugfix?.['tests/rare.test.ts']).toBeUndefined();
  });

  it('should track multiple task types independently', () => {
    const tasks = [
      ...Array.from({ length: 4 }, (_, i) =>
        makeTaskEntry({
          id: `t_bug_${i}`,
          classification: { taskType: 'bugfix', complexity: 'Medium', confidence: 0.8 },
          prediction: {
            predictedFiles: [],
            actualFiles: ['tests/a.test.ts'],
            precision: 0,
            recall: 0,
          },
        }),
      ),
      ...Array.from({ length: 4 }, (_, i) =>
        makeTaskEntry({
          id: `t_feat_${i}`,
          classification: { taskType: 'feature', complexity: 'Medium', confidence: 0.8 },
          prediction: {
            predictedFiles: [],
            actualFiles: ['src/components/app.ts'],
            precision: 0,
            recall: 0,
          },
        }),
      ),
    ];
    const patterns = makeDefaultPatterns();
    const result = detectTypeAffinities(tasks, patterns);

    expect(result).toHaveProperty('bugfix');
    expect(result).toHaveProperty('feature');
    expect(result.bugfix).toHaveProperty('tests/a.test.ts');
    expect(result.feature).toHaveProperty('src/components/app.ts');
  });

  it('should update existing affinities with recalculated weights', () => {
    const patterns = makeDefaultPatterns();
    patterns.typeAffinities['bugfix'] = {
      taskType: 'bugfix',
      files: ['tests/old.test.ts'],
      confidence: 0.5,
      fileWeights: { 'tests/old.test.ts': { weight: 0.5, occurrences: 3 } },
    };

    const tasks = Array.from({ length: 4 }, (_, i) =>
      makeTaskEntry({
        id: `t_${i}`,
        classification: { taskType: 'bugfix', complexity: 'Medium', confidence: 0.8 },
        prediction: {
          predictedFiles: [],
          actualFiles: ['tests/new.test.ts'],
          precision: 0,
          recall: 0,
        },
      }),
    );

    detectTypeAffinities(tasks, patterns);

    // Existing affinity should have the new file merged in
    expect(patterns.typeAffinities['bugfix'].fileWeights).toHaveProperty('tests/new.test.ts');
  });
});

// ─── Task 11: Convention Detection Tests ──────────────────────

describe('detectConventions', () => {
  it('should detect recurring test co-location pattern as convention', () => {
    const tasks = Array.from({ length: 10 }, (_, i) =>
      makeTaskEntry({
        id: `t_${i}`,
        prediction: {
          predictedFiles: [],
          actualFiles: ['src/utils.ts', 'src/utils.test.ts'],
          precision: 0,
          recall: 0,
        },
      }),
    );
    const patterns = makeDefaultPatterns();
    const result = detectConventions(tasks, patterns);

    expect(result.newConventions.length).toBeGreaterThan(0);
    const testConv = result.newConventions.find((c) => c.pattern.includes('Test files'));
    expect(testConv).toBeDefined();
  });

  it('should not create convention below threshold (< 5 tasks or confidence < 0.7)', () => {
    // Only 3 tasks — below CONVENTION_MIN_EVIDENCE
    const tasks = Array.from({ length: 3 }, (_, i) =>
      makeTaskEntry({
        id: `t_${i}`,
        prediction: {
          predictedFiles: [],
          actualFiles: ['src/utils.ts', 'src/utils.test.ts'],
          precision: 0,
          recall: 0,
        },
      }),
    );
    const patterns = makeDefaultPatterns();
    const result = detectConventions(tasks, patterns);
    expect(result.newConventions.length).toBe(0);
  });

  it('should include examples array in convention', () => {
    const tasks = Array.from({ length: 10 }, (_, i) =>
      makeTaskEntry({
        id: `t_${i}`,
        prediction: {
          predictedFiles: [],
          actualFiles: [`src/mod${i}.ts`, `src/mod${i}.test.ts`],
          precision: 0,
          recall: 0,
        },
      }),
    );
    const patterns = makeDefaultPatterns();
    const result = detectConventions(tasks, patterns);

    const testConv = result.newConventions.find((c) => c.pattern.includes('Test files'));
    expect(testConv).toBeDefined();
    expect(testConv!.examples.length).toBeGreaterThan(0);
  });

  it('should not create duplicate conventions (pattern similarity check)', () => {
    const patterns = makeDefaultPatterns();
    patterns.conventions.push({
      id: 'conv_001',
      pattern: 'Test files co-located with source files',
      description: 'Test files co-located with source files',
      confidence: 0.8,
      evidenceCount: 8,
      examples: ['src/a.test.ts'],
    });

    const tasks = Array.from({ length: 10 }, (_, i) =>
      makeTaskEntry({
        id: `t_${i}`,
        prediction: {
          predictedFiles: [],
          actualFiles: ['src/utils.ts', 'src/utils.test.ts'],
          precision: 0,
          recall: 0,
        },
      }),
    );

    const result = detectConventions(tasks, patterns);

    // Should update existing, not create new
    expect(result.newConventions.filter((c) => c.pattern.includes('Test files'))).toHaveLength(0);
    expect(result.updatedConventions.length).toBeGreaterThan(0);
  });

  it('should use conv_{sequence} format for convention IDs', () => {
    const tasks = Array.from({ length: 10 }, (_, i) =>
      makeTaskEntry({
        id: `t_${i}`,
        prediction: {
          predictedFiles: [],
          actualFiles: ['src/utils.ts', 'src/utils.test.ts'],
          precision: 0,
          recall: 0,
        },
      }),
    );
    const patterns = makeDefaultPatterns();
    const result = detectConventions(tasks, patterns);

    for (const conv of result.newConventions) {
      expect(conv.id).toMatch(/^conv_\d{3}$/);
    }
  });
});

// ─── Task 12: Integration Test ────────────────────────────────

describe('detectPatterns (full integration)', () => {
  beforeEach(() => {
    projectRoot = createTempProjectRoot();
    initializeStore(projectRoot);
  });

  afterEach(() => {
    cleanupTempProjectRoot(projectRoot);
  });

  it('should run full detection flow with multi-type task history', () => {
    // Build task history with 12 entries spanning multiple task types
    const tasks: TaskEntry[] = [
      // 6 bugfix tasks using auth + middleware
      ...Array.from({ length: 6 }, (_, i) =>
        makeTaskEntry({
          id: `t_bug_${i}`,
          classification: { taskType: 'bugfix', complexity: 'Medium', confidence: 0.8 },
          prediction: {
            predictedFiles: [],
            actualFiles: ['src/auth.ts', 'src/middleware.ts', 'tests/auth.test.ts'],
            precision: 0,
            recall: 0,
          },
        }),
      ),
      // 6 feature tasks using components
      ...Array.from({ length: 6 }, (_, i) =>
        makeTaskEntry({
          id: `t_feat_${i}`,
          classification: { taskType: 'feature', complexity: 'Medium', confidence: 0.8 },
          prediction: {
            predictedFiles: [],
            actualFiles: ['src/components/app.ts', 'src/components/app.test.ts'],
            precision: 0,
            recall: 0,
          },
        }),
      ),
    ];

    const patterns = makeDefaultPatterns();
    const result = detectPatterns(tasks, patterns);

    // Should have co-occurrence patterns (auth+middleware appear 6 times together)
    expect(result.newCoOccurrences.length).toBeGreaterThan(0);

    // Should have type affinities
    expect(Object.keys(result.newAffinities).length).toBeGreaterThan(0);

    // Verify patterns.json was mutated
    expect(patterns.coOccurrences.length).toBeGreaterThan(0);
  });

  it('should handle dependency graph updates with discovered edges', () => {
    const graph = makeDefaultGraph();
    writeDependencyGraph(projectRoot, graph);

    updateDependencyGraph(projectRoot, ['src/auth.ts', 'src/middleware.ts', 'src/utils.ts']);

    const result = readDependencyGraph(projectRoot);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // 3 files = 3 pairs: auth-middleware, auth-utils, middleware-utils
    expect(result.value.edges.length).toBe(3);
    for (const edge of result.value.edges) {
      expect(edge.type).toBe('cooccurrence');
      expect(edge.weight).toBe(LEARNER_EDGE_INITIAL_WEIGHT);
      expect(edge.discoveredBy).toBe('learner');
    }
  });

  it('should handle fail-open: error in pattern detection does not throw', () => {
    // Empty task history should not throw
    const patterns = makeDefaultPatterns();
    expect(() => detectPatterns([], patterns)).not.toThrow();

    const result = detectPatterns([], patterns);
    expect(result.newCoOccurrences).toEqual([]);
    expect(result.newAffinities).toEqual({});
    expect(result.newConventions).toEqual([]);
  });

  it('should complete within performance budget', () => {
    // Build larger task history
    const tasks = Array.from({ length: 50 }, (_, i) =>
      makeTaskEntry({
        id: `t_${i}`,
        classification: { taskType: i % 3 === 0 ? 'bugfix' : 'feature', complexity: 'Medium', confidence: 0.8 },
        prediction: {
          predictedFiles: [],
          actualFiles: [`src/file${i % 5}.ts`, `src/file${(i + 1) % 5}.ts`, `tests/file${i % 5}.test.ts`],
          precision: 0,
          recall: 0,
        },
      }),
    );

    const patterns = makeDefaultPatterns();
    const start = performance.now();
    detectPatterns(tasks, patterns);
    const elapsed = performance.now() - start;

    // Pattern detection budget: <300ms
    expect(elapsed).toBeLessThan(300);
  });
});
