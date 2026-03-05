import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { detectProjectStack, loadStarterPack, applyStarterPack } from '../../src/scanner/starter-packs.js';
import { createTempProjectRoot, cleanupTempProjectRoot } from '../helpers/test-store.js';
import { ensureStoreDir, readPatterns } from '../../src/store/index.js';
import type { ProjectMap } from '../../src/types/index.js';

function makeProjectMap(filePaths: string[], overrides?: Partial<ProjectMap>): ProjectMap {
  const files: Record<string, ProjectMap['files'][string]> = {};
  for (const fp of filePaths) {
    files[fp] = {
      path: fp, size: 100, contentHash: 'aaaa',
      lastModified: '', language: null, domain: 'root',
      imports: [], exports: [], keywords: [],
    };
  }
  return {
    schemaVersion: '1.0.0', scannedAt: '', scanType: 'full',
    projectType: 'code', totalFiles: filePaths.length,
    files, domains: {}, ignoredPatterns: [],
    ...overrides,
  };
}

describe('detectProjectStack', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = createTempProjectRoot();
  });

  afterEach(() => {
    cleanupTempProjectRoot(projectRoot);
  });

  it('should detect typescript-node project', () => {
    writeFileSync(path.join(projectRoot, 'package.json'), '{}');
    writeFileSync(path.join(projectRoot, 'tsconfig.json'), '{}');

    const pm = makeProjectMap(['package.json', 'tsconfig.json', 'src/index.ts', 'src/utils.ts']);
    expect(detectProjectStack(projectRoot, pm)).toBe('typescript-node');
  });

  it('should detect react project', () => {
    writeFileSync(
      path.join(projectRoot, 'package.json'),
      JSON.stringify({ dependencies: { react: '^18.0.0' } }),
    );
    mkdirSync(path.join(projectRoot, 'src'), { recursive: true });

    const pm = makeProjectMap(['package.json', 'src/App.tsx', 'src/index.tsx']);
    expect(detectProjectStack(projectRoot, pm)).toBe('react');
  });

  it('should detect python project', () => {
    writeFileSync(path.join(projectRoot, 'requirements.txt'), 'flask==2.0');

    const pm = makeProjectMap(['requirements.txt', 'app.py', 'utils.py']);
    expect(detectProjectStack(projectRoot, pm)).toBe('python');
  });

  it('should detect research-markdown project', () => {
    const pm = makeProjectMap([
      'chapter-1.md', 'chapter-2.md', 'chapter-3.md',
      'references.md', 'appendix.md', 'README.md',
    ]);
    expect(detectProjectStack(projectRoot, pm)).toBe('research-markdown');
  });

  it('should return null for unrecognized project', () => {
    const pm = makeProjectMap(['data.csv', 'output.txt', 'config.ini']);
    expect(detectProjectStack(projectRoot, pm)).toBeNull();
  });

  it('should prioritize react over typescript-node', () => {
    writeFileSync(
      path.join(projectRoot, 'package.json'),
      JSON.stringify({ dependencies: { react: '^18.0.0' } }),
    );
    writeFileSync(path.join(projectRoot, 'tsconfig.json'), '{}');

    const pm = makeProjectMap(['package.json', 'tsconfig.json', 'src/App.tsx', 'src/utils.ts']);
    expect(detectProjectStack(projectRoot, pm)).toBe('react');
  });
});

describe('loadStarterPack', () => {
  it('should load typescript-node starter pack', () => {
    const result = loadStarterPack('typescript-node');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe('typescript-node');
    expect(result.value.patterns.coOccurrences.length).toBeGreaterThan(0);
    expect(result.value.patterns.conventions.length).toBeGreaterThan(0);
  });

  it('should load python starter pack', () => {
    const result = loadStarterPack('python');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe('python');
  });

  it('should load research-markdown starter pack', () => {
    const result = loadStarterPack('research-markdown');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe('research-markdown');
  });

  it('should return err for missing pack', () => {
    const result = loadStarterPack('nonexistent');
    expect(result.ok).toBe(false);
  });

  it('should handle extends inheritance (react extends typescript-node)', () => {
    const result = loadStarterPack('react');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe('react');
    // Should have parent's co-occurrences + child's
    expect(result.value.patterns.coOccurrences.length).toBeGreaterThan(2);
    // Should have parent's conventions + child's
    expect(result.value.patterns.conventions.length).toBeGreaterThan(2);
    // Should merge keyFiles
    expect(result.value.keyFiles).toContain('package.json');
    expect(result.value.keyFiles).toContain('src/App.tsx');
  });
});

describe('applyStarterPack', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = createTempProjectRoot();
    ensureStoreDir(projectRoot);
  });

  afterEach(() => {
    cleanupTempProjectRoot(projectRoot);
  });

  it('should seed patterns.json with co-occurrences and conventions', () => {
    const packResult = loadStarterPack('typescript-node');
    expect(packResult.ok).toBe(true);
    if (!packResult.ok) return;

    const result = applyStarterPack(projectRoot, packResult.value);
    expect(result.ok).toBe(true);

    const patternsResult = readPatterns(projectRoot);
    expect(patternsResult.ok).toBe(true);
    if (!patternsResult.ok) return;

    expect(patternsResult.value.coOccurrences.length).toBeGreaterThan(0);
    expect(patternsResult.value.conventions.length).toBeGreaterThan(0);
  });

  it('should seed type affinities from starter pack', () => {
    const packResult = loadStarterPack('typescript-node');
    expect(packResult.ok).toBe(true);
    if (!packResult.ok) return;

    applyStarterPack(projectRoot, packResult.value);

    const patternsResult = readPatterns(projectRoot);
    expect(patternsResult.ok).toBe(true);
    if (!patternsResult.ok) return;

    expect(patternsResult.value.typeAffinities).toBeDefined();
  });
});
