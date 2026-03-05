import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import { rmSync } from 'node:fs';
import { scanProject, detectProjectType, detectFileType, classifyDomain } from '../../src/scanner/index.js';
import type { FileEntry } from '../../src/types/index.js';

const sampleProjectRoot = path.resolve(__dirname, '../fixtures/sample-project');
const researchProjectRoot = path.resolve(__dirname, '../fixtures/research-project');

function cleanupStore(root: string) {
  try {
    rmSync(path.join(root, '.claude-opt'), { recursive: true, force: true });
  } catch {
    // ignore
  }
}

beforeEach(() => {
  cleanupStore(sampleProjectRoot);
  cleanupStore(researchProjectRoot);
});

afterEach(() => {
  cleanupStore(sampleProjectRoot);
  cleanupStore(researchProjectRoot);
});

describe('scanProject', () => {
  it('scans a code project and produces valid result', () => {
    const result = scanProject({ projectRoot: sampleProjectRoot, scanType: 'full' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.projectType).toBe('code');
    expect(result.value.filesScanned).toBeGreaterThan(0);
    expect(result.value.scanDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('file entries have all required fields', () => {
    const result = scanProject({ projectRoot: sampleProjectRoot, scanType: 'full' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const files = result.value.projectMap.files;
    for (const [filePath, entry] of Object.entries(files)) {
      expect(entry.path).toBe(filePath);
      expect(typeof entry.size).toBe('number');
      expect(typeof entry.lastModified).toBe('string');
      expect(typeof entry.contentHash).toBe('string');
      expect(entry.contentHash.length).toBe(8);
    }
  });

  it('stores paths in POSIX format', () => {
    const result = scanProject({ projectRoot: sampleProjectRoot, scanType: 'full' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    for (const filePath of Object.keys(result.value.projectMap.files)) {
      expect(filePath).not.toContain('\\');
    }
  });

  it('excludes node_modules files', () => {
    const result = scanProject({ projectRoot: sampleProjectRoot, scanType: 'full' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const files = Object.keys(result.value.projectMap.files);
    const nodeModulesFiles = files.filter((f) => f.includes('node_modules'));
    expect(nodeModulesFiles.length).toBe(0);
  });

  it('includes source and doc files', () => {
    const result = scanProject({ projectRoot: sampleProjectRoot, scanType: 'full' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const files = Object.keys(result.value.projectMap.files);
    expect(files).toContain('src/index.ts');
    expect(files).toContain('src/utils.ts');
    expect(files).toContain('docs/readme.md');
  });

  it('scans a research project correctly', () => {
    const result = scanProject({ projectRoot: researchProjectRoot, scanType: 'full' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.projectType).toBe('research');
    const files = Object.keys(result.value.projectMap.files);
    expect(files).toContain('chapter-1.md');
    expect(files).toContain('references/paper-1.md');
  });

  it('builds domain map', () => {
    const result = scanProject({ projectRoot: sampleProjectRoot, scanType: 'full' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const domains = result.value.projectMap.domains;
    expect(domains).toBeDefined();
    expect(Object.keys(domains).length).toBeGreaterThan(0);
  });

  it('completes scan in <10 seconds', () => {
    const result = scanProject({ projectRoot: sampleProjectRoot, scanType: 'full' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.scanDurationMs).toBeLessThan(10000);
  });
});

describe('detectProjectType', () => {
  it('detects code project', () => {
    const files = new Map<string, FileEntry>();
    files.set('src/index.ts', { path: 'src/index.ts', size: 100, contentHash: 'abc', lastModified: '', language: 'typescript', domain: null, imports: [], exports: [], keywords: [] });
    files.set('src/utils.ts', { path: 'src/utils.ts', size: 100, contentHash: 'def', lastModified: '', language: 'typescript', domain: null, imports: [], exports: [], keywords: [] });

    const result = detectProjectType(sampleProjectRoot, files);
    expect(result).toBe('code');
  });

  it('detects research project', () => {
    const files = new Map<string, FileEntry>();
    files.set('ch1.md', { path: 'ch1.md', size: 100, contentHash: 'abc', lastModified: '', language: null, domain: null, imports: [], exports: [], keywords: [] });
    files.set('ch2.md', { path: 'ch2.md', size: 100, contentHash: 'def', lastModified: '', language: null, domain: null, imports: [], exports: [], keywords: [] });
    files.set('notes.txt', { path: 'notes.txt', size: 50, contentHash: 'ghi', lastModified: '', language: null, domain: null, imports: [], exports: [], keywords: [] });

    const result = detectProjectType(researchProjectRoot, files);
    expect(result).toBe('research');
  });
});

describe('detectFileType', () => {
  it('detects TypeScript files', () => {
    expect(detectFileType('src/index.ts')).toEqual({ type: 'typescript', category: 'code' });
  });

  it('detects test files', () => {
    const result = detectFileType('tests/utils.test.ts');
    expect(result.category).toBe('test');
  });

  it('detects markdown files', () => {
    expect(detectFileType('docs/readme.md')).toEqual({ type: 'markdown', category: 'markdown' });
  });

  it('detects config files', () => {
    expect(detectFileType('package.json')).toEqual({ type: 'json', category: 'config' });
  });

  it('handles unknown extensions', () => {
    const result = detectFileType('file.xyz');
    expect(result.type).toBe('unknown');
  });
});

describe('classifyDomain', () => {
  it('classifies root-level files', () => {
    expect(classifyDomain('package.json', 'code')).toBe('root');
  });

  it('classifies src subdirectories', () => {
    expect(classifyDomain('src/utils/paths.ts', 'code')).toBe('utils');
  });

  it('classifies test files', () => {
    expect(classifyDomain('tests/utils/paths.test.ts', 'code')).toBe('utils');
  });

  it('classifies docs directory', () => {
    expect(classifyDomain('docs/readme.md', 'code')).toBe('docs');
  });
});
