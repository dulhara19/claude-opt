import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import { buildDependencyGraph } from '../../src/scanner/dependency-graph.js';
import { createTempProjectRoot, cleanupTempProjectRoot } from '../helpers/test-store.js';
import { ensureStoreDir } from '../../src/store/index.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { ProjectMap } from '../../src/types/index.js';

describe('buildDependencyGraph', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = createTempProjectRoot();
    ensureStoreDir(projectRoot);

    // Create source files in the temp project
    mkdirSync(path.join(projectRoot, 'src'), { recursive: true });

    writeFileSync(
      path.join(projectRoot, 'src', 'index.ts'),
      `import { helper } from './utils';\nimport express from 'express';\n`,
    );
    writeFileSync(
      path.join(projectRoot, 'src', 'utils.ts'),
      `export function helper() { return 42; }\n`,
    );
  });

  afterEach(() => {
    cleanupTempProjectRoot(projectRoot);
  });

  function makeProjectMap(files: Record<string, { path: string }>): ProjectMap {
    const entries: Record<string, ProjectMap['files'][string]> = {};
    for (const [key, val] of Object.entries(files)) {
      entries[key] = {
        path: val.path,
        size: 100,
        contentHash: 'abcd1234',
        lastModified: new Date().toISOString(),
        language: 'typescript',
        domain: 'src',
        imports: [],
        exports: [],
        keywords: [],
      };
    }
    return {
      schemaVersion: '1.0.0',
      scannedAt: new Date().toISOString(),
      scanType: 'full',
      projectType: 'code',
      totalFiles: Object.keys(entries).length,
      files: entries,
      domains: {},
      ignoredPatterns: [],
    };
  }

  it('should build edges from internal imports', () => {
    const pm = makeProjectMap({
      'src/index.ts': { path: 'src/index.ts' },
      'src/utils.ts': { path: 'src/utils.ts' },
    });
    const result = buildDependencyGraph(projectRoot, pm);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Should have edge from index.ts -> utils.ts
    const edge = result.value.edges.find(
      (e) => e.source === 'src/index.ts' && e.target === 'src/utils.ts',
    );
    expect(edge).toBeDefined();
    expect(edge!.type).toBe('import');
  });

  it('should exclude external imports from graph edges', () => {
    const pm = makeProjectMap({
      'src/index.ts': { path: 'src/index.ts' },
      'src/utils.ts': { path: 'src/utils.ts' },
    });
    const result = buildDependencyGraph(projectRoot, pm);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // 'express' should NOT appear as a target
    const expressEdge = result.value.edges.find((e) => e.target.includes('express'));
    expect(expressEdge).toBeUndefined();
  });

  it('should build adjacency lists with imports and importedBy', () => {
    const pm = makeProjectMap({
      'src/index.ts': { path: 'src/index.ts' },
      'src/utils.ts': { path: 'src/utils.ts' },
    });
    const result = buildDependencyGraph(projectRoot, pm);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // index.ts imports utils.ts
    expect(result.value.adjacency['src/index.ts']?.imports).toContain('src/utils.ts');
    // utils.ts is imported by index.ts
    expect(result.value.adjacency['src/utils.ts']?.importedBy).toContain('src/index.ts');
  });

  it('should handle files with no parser gracefully', () => {
    writeFileSync(path.join(projectRoot, 'data.csv'), 'a,b,c\n1,2,3\n');
    const pm = makeProjectMap({
      'data.csv': { path: 'data.csv' },
      'src/index.ts': { path: 'src/index.ts' },
      'src/utils.ts': { path: 'src/utils.ts' },
    });
    const result = buildDependencyGraph(projectRoot, pm);
    expect(result.ok).toBe(true);
  });

  it('should set correct edge types for link-type imports', () => {
    // Create markdown files
    writeFileSync(
      path.join(projectRoot, 'chapter-1.md'),
      `# Intro\nSee [Chapter 2](chapter-2.md) for details.\n`,
    );
    writeFileSync(path.join(projectRoot, 'chapter-2.md'), `# Methods\n`);

    const pm = makeProjectMap({
      'chapter-1.md': { path: 'chapter-1.md' },
      'chapter-2.md': { path: 'chapter-2.md' },
    });
    // Override language for md files
    pm.files['chapter-1.md'].language = null;
    pm.files['chapter-2.md'].language = null;

    const result = buildDependencyGraph(projectRoot, pm);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const linkEdge = result.value.edges.find((e) => e.source === 'chapter-1.md');
    expect(linkEdge).toBeDefined();
    expect(linkEdge!.type).toBe('link');
  });

  it('should produce a valid DependencyGraph with schemaVersion and updatedAt', () => {
    const pm = makeProjectMap({
      'src/index.ts': { path: 'src/index.ts' },
    });
    const result = buildDependencyGraph(projectRoot, pm);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.schemaVersion).toBe('1.0.0');
    expect(result.value.updatedAt).toBeTruthy();
  });
});
