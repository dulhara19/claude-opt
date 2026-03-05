import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import { buildKeywordIndex, extractFileNameKeywords } from '../../src/scanner/keyword-extractor.js';
import { createTempProjectRoot, cleanupTempProjectRoot } from '../helpers/test-store.js';
import { ensureStoreDir } from '../../src/store/index.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { ProjectMap } from '../../src/types/index.js';

describe('extractFileNameKeywords', () => {
  it('should split kebab-case file names', () => {
    const keywords = extractFileNameKeywords('src/dependency-graph.ts');
    expect(keywords).toContain('dependency');
    expect(keywords).toContain('graph');
  });

  it('should split camelCase file names', () => {
    const keywords = extractFileNameKeywords('src/keywordExtractor.ts');
    expect(keywords).toContain('keyword');
    expect(keywords).toContain('extractor');
  });

  it('should filter out single-character words', () => {
    const keywords = extractFileNameKeywords('src/a-b.ts');
    expect(keywords).toHaveLength(0);
  });

  it('should filter out noise words', () => {
    const keywords = extractFileNameKeywords('src/index.ts');
    expect(keywords).not.toContain('index');
  });
});

describe('buildKeywordIndex', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = createTempProjectRoot();
    ensureStoreDir(projectRoot);

    mkdirSync(path.join(projectRoot, 'src'), { recursive: true });
    writeFileSync(
      path.join(projectRoot, 'src', 'auth-handler.ts'),
      `export function handleLogin() {}\nexport class AuthService {}\n`,
    );
    writeFileSync(
      path.join(projectRoot, 'src', 'utils.ts'),
      `export function formatDate() {}\n`,
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

  it('should extract keywords from file names and content', () => {
    const pm = makeProjectMap({
      'src/auth-handler.ts': { path: 'src/auth-handler.ts' },
    });
    const result = buildKeywordIndex(projectRoot, pm);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // From file name: auth, handler
    expect(result.value.keywordToFiles['auth']).toContain('src/auth-handler.ts');
    expect(result.value.keywordToFiles['handler']).toContain('src/auth-handler.ts');
    // From content: handlelogin, authservice
    expect(result.value.keywordToFiles['handlelogin']).toContain('src/auth-handler.ts');
    expect(result.value.keywordToFiles['authservice']).toContain('src/auth-handler.ts');
  });

  it('should build bidirectional index', () => {
    const pm = makeProjectMap({
      'src/auth-handler.ts': { path: 'src/auth-handler.ts' },
      'src/utils.ts': { path: 'src/utils.ts' },
    });
    const result = buildKeywordIndex(projectRoot, pm);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // keywordToFiles: keyword -> files
    expect(result.value.keywordToFiles['auth']).toContain('src/auth-handler.ts');
    // fileToKeywords: file -> keywords
    expect(result.value.fileToKeywords['src/auth-handler.ts']).toContain('auth');
    expect(result.value.fileToKeywords['src/utils.ts']).toContain('utils');
  });

  it('should normalize keywords to lowercase', () => {
    const pm = makeProjectMap({
      'src/auth-handler.ts': { path: 'src/auth-handler.ts' },
    });
    const result = buildKeywordIndex(projectRoot, pm);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // All keywords should be lowercase
    for (const kw of Object.keys(result.value.keywordToFiles)) {
      expect(kw).toBe(kw.toLowerCase());
    }
  });

  it('should filter out noise words', () => {
    writeFileSync(
      path.join(projectRoot, 'src', 'index.ts'),
      `export function main() {}\n`,
    );
    const pm = makeProjectMap({
      'src/index.ts': { path: 'src/index.ts' },
    });
    const result = buildKeywordIndex(projectRoot, pm);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // 'index' is a noise word
    expect(result.value.keywordToFiles['index']).toBeUndefined();
  });

  it('should not duplicate file entries in keyword lists', () => {
    const pm = makeProjectMap({
      'src/utils.ts': { path: 'src/utils.ts' },
    });
    const result = buildKeywordIndex(projectRoot, pm);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    for (const files of Object.values(result.value.keywordToFiles)) {
      const unique = new Set(files);
      expect(unique.size).toBe(files.length);
    }
  });

  it('should produce a valid KeywordIndex with schemaVersion and updatedAt', () => {
    const pm = makeProjectMap({
      'src/utils.ts': { path: 'src/utils.ts' },
    });
    const result = buildKeywordIndex(projectRoot, pm);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.schemaVersion).toBe('1.0.0');
    expect(result.value.updatedAt).toBeTruthy();
  });
});
