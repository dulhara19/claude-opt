import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { scoreGraphTraversal } from '../../../src/predictor/signals/graph-traversal.js';
import { createTempProjectRoot, cleanupTempProjectRoot } from '../../helpers/test-store.js';
import {
  initializeStore,
  writeDependencyGraph,
  writeKeywordIndex,
} from '../../../src/store/index.js';
import { createDefaultDependencyGraph, createDefaultKeywordIndex } from '../../../src/store/defaults.js';

describe('scoreGraphTraversal', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = createTempProjectRoot();
    initializeStore(projectRoot);
  });

  afterEach(() => {
    cleanupTempProjectRoot(projectRoot);
  });

  it('returns empty map when no graph exists', () => {
    const scores = scoreGraphTraversal(['auth', 'login'], projectRoot);
    expect(scores.size).toBe(0);
  });

  it('returns empty map when store is inaccessible', () => {
    const scores = scoreGraphTraversal(['auth'], '/nonexistent/path');
    expect(scores.size).toBe(0);
  });

  it('returns empty map when no keyword index exists', () => {
    const graph = createDefaultDependencyGraph();
    graph.adjacency = {
      'src/auth/login.ts': { imports: ['src/models/user.ts'], importedBy: [] },
    };
    writeDependencyGraph(projectRoot, graph);

    const scores = scoreGraphTraversal(['auth'], projectRoot);
    expect(scores.size).toBe(0);
  });

  it('scores 1-hop neighbors of seed files', () => {
    const keywordIndex = createDefaultKeywordIndex();
    keywordIndex.keywordToFiles = {
      auth: ['src/auth/login.ts'],
    };
    keywordIndex.fileToKeywords = {
      'src/auth/login.ts': ['auth'],
    };
    writeKeywordIndex(projectRoot, keywordIndex);

    const graph = createDefaultDependencyGraph();
    graph.adjacency = {
      'src/auth/login.ts': {
        imports: ['src/models/user.ts'],
        importedBy: ['src/pages/login-page.ts'],
      },
      'src/models/user.ts': {
        imports: [],
        importedBy: ['src/auth/login.ts'],
      },
      'src/pages/login-page.ts': {
        imports: ['src/auth/login.ts'],
        importedBy: [],
      },
    };
    writeDependencyGraph(projectRoot, graph);

    const scores = scoreGraphTraversal(['auth'], projectRoot);
    // Seed file (login.ts) should be scored
    expect(scores.has('src/auth/login.ts')).toBe(true);
    // Neighbors should be scored
    expect(scores.has('src/models/user.ts')).toBe(true);
    expect(scores.has('src/pages/login-page.ts')).toBe(true);
  });

  it('gives seed files a score of 1.0', () => {
    const keywordIndex = createDefaultKeywordIndex();
    keywordIndex.keywordToFiles = { auth: ['src/auth/login.ts'] };
    keywordIndex.fileToKeywords = { 'src/auth/login.ts': ['auth'] };
    writeKeywordIndex(projectRoot, keywordIndex);

    const graph = createDefaultDependencyGraph();
    graph.adjacency = {
      'src/auth/login.ts': {
        imports: ['src/models/user.ts'],
        importedBy: [],
      },
    };
    writeDependencyGraph(projectRoot, graph);

    const scores = scoreGraphTraversal(['auth'], projectRoot);
    const seedScore = scores.get('src/auth/login.ts');
    expect(seedScore).toBeDefined();
    expect(seedScore!.score).toBe(1.0);
  });

  it('normalizes neighbor scores to 0.0-1.0', () => {
    const keywordIndex = createDefaultKeywordIndex();
    keywordIndex.keywordToFiles = { auth: ['src/auth/login.ts'] };
    keywordIndex.fileToKeywords = { 'src/auth/login.ts': ['auth'] };
    writeKeywordIndex(projectRoot, keywordIndex);

    const graph = createDefaultDependencyGraph();
    graph.adjacency = {
      'src/auth/login.ts': {
        imports: ['src/models/user.ts', 'src/utils/crypto.ts'],
        importedBy: [],
      },
    };
    writeDependencyGraph(projectRoot, graph);

    const scores = scoreGraphTraversal(['auth'], projectRoot);
    for (const score of scores.values()) {
      expect(score.score).toBeGreaterThanOrEqual(0);
      expect(score.score).toBeLessThanOrEqual(1);
    }
  });

  it('returns empty map when no keywords match any files', () => {
    const keywordIndex = createDefaultKeywordIndex();
    keywordIndex.keywordToFiles = { database: ['src/db/connection.ts'] };
    keywordIndex.fileToKeywords = { 'src/db/connection.ts': ['database'] };
    writeKeywordIndex(projectRoot, keywordIndex);

    const graph = createDefaultDependencyGraph();
    graph.adjacency = {
      'src/db/connection.ts': { imports: [], importedBy: [] },
    };
    writeDependencyGraph(projectRoot, graph);

    const scores = scoreGraphTraversal(['auth', 'login'], projectRoot);
    // No keyword matches → only empty map (no seed files found)
    // Actually, scoreGraphTraversal returns seed file scores too
    expect(scores.size).toBe(0);
  });

  it('sets signal source correctly', () => {
    const keywordIndex = createDefaultKeywordIndex();
    keywordIndex.keywordToFiles = { auth: ['src/auth/login.ts'] };
    keywordIndex.fileToKeywords = { 'src/auth/login.ts': ['auth'] };
    writeKeywordIndex(projectRoot, keywordIndex);

    const graph = createDefaultDependencyGraph();
    graph.adjacency = {
      'src/auth/login.ts': { imports: [], importedBy: [] },
    };
    writeDependencyGraph(projectRoot, graph);

    const scores = scoreGraphTraversal(['auth'], projectRoot);
    for (const score of scores.values()) {
      expect(score.source).toBe('GraphTraversal');
    }
  });
});
