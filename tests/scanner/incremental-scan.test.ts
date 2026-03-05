import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { scanProject } from '../../src/scanner/scanner.js';
import { detectChanges } from '../../src/scanner/scanner.js';
import { createTempProjectRoot, cleanupTempProjectRoot } from '../helpers/test-store.js';
import type { ProjectMap, FileEntry } from '../../src/types/index.js';

function createSampleProject(root: string) {
  mkdirSync(path.join(root, 'src'), { recursive: true });
  writeFileSync(path.join(root, 'src', 'index.ts'), `import { add } from './utils';\nexport function main() {}\n`);
  writeFileSync(path.join(root, 'src', 'utils.ts'), `export function add(a: number, b: number) { return a + b; }\n`);
  writeFileSync(path.join(root, 'readme.md'), `# Test Project\n`);
}

describe('detectChanges', () => {
  it('should detect changed files by content hash', () => {
    const existingMap: ProjectMap = {
      schemaVersion: '1.0.0',
      scannedAt: '',
      scanType: 'full',
      projectType: 'code',
      totalFiles: 1,
      files: {
        'src/index.ts': {
          path: 'src/index.ts', size: 10, contentHash: 'aaaaaaaa',
          lastModified: '', language: 'typescript', domain: 'root',
          imports: [], exports: [], keywords: [],
        },
      },
      domains: {},
      ignoredPatterns: [],
    };

    const currentFiles = new Map<string, FileEntry>();
    currentFiles.set('src/index.ts', {
      path: 'src/index.ts', size: 20, contentHash: 'bbbbbbbb',
      lastModified: '', language: 'typescript', domain: 'root',
      imports: [], exports: [], keywords: [],
    });

    const changes = detectChanges(existingMap, currentFiles);
    expect(changes.changed).toContain('src/index.ts');
    expect(changes.unchanged).toHaveLength(0);
  });

  it('should detect new files', () => {
    const existingMap: ProjectMap = {
      schemaVersion: '1.0.0', scannedAt: '', scanType: 'full',
      projectType: 'code', totalFiles: 0, files: {}, domains: {}, ignoredPatterns: [],
    };

    const currentFiles = new Map<string, FileEntry>();
    currentFiles.set('src/new.ts', {
      path: 'src/new.ts', size: 10, contentHash: 'cccccccc',
      lastModified: '', language: 'typescript', domain: 'root',
      imports: [], exports: [], keywords: [],
    });

    const changes = detectChanges(existingMap, currentFiles);
    expect(changes.added).toContain('src/new.ts');
  });

  it('should detect deleted files', () => {
    const existingMap: ProjectMap = {
      schemaVersion: '1.0.0', scannedAt: '', scanType: 'full',
      projectType: 'code', totalFiles: 1,
      files: {
        'src/old.ts': {
          path: 'src/old.ts', size: 10, contentHash: 'dddddddd',
          lastModified: '', language: 'typescript', domain: 'root',
          imports: [], exports: [], keywords: [],
        },
      },
      domains: {},
      ignoredPatterns: [],
    };

    const currentFiles = new Map<string, FileEntry>();
    const changes = detectChanges(existingMap, currentFiles);
    expect(changes.deleted).toContain('src/old.ts');
  });

  it('should identify unchanged files', () => {
    const hash = 'eeeeeeee';
    const existingMap: ProjectMap = {
      schemaVersion: '1.0.0', scannedAt: '', scanType: 'full',
      projectType: 'code', totalFiles: 1,
      files: {
        'src/same.ts': {
          path: 'src/same.ts', size: 10, contentHash: hash,
          lastModified: '', language: 'typescript', domain: 'root',
          imports: [], exports: [], keywords: [],
        },
      },
      domains: {},
      ignoredPatterns: [],
    };

    const currentFiles = new Map<string, FileEntry>();
    currentFiles.set('src/same.ts', {
      path: 'src/same.ts', size: 10, contentHash: hash,
      lastModified: '', language: 'typescript', domain: 'root',
      imports: [], exports: [], keywords: [],
    });

    const changes = detectChanges(existingMap, currentFiles);
    expect(changes.unchanged).toContain('src/same.ts');
    expect(changes.changed).toHaveLength(0);
  });
});

describe('incremental scan integration', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = createTempProjectRoot();
    createSampleProject(projectRoot);
  });

  afterEach(() => {
    cleanupTempProjectRoot(projectRoot);
  });

  it('should perform full scan first, then incremental', () => {
    // Full scan
    const fullResult = scanProject({ projectRoot, scanType: 'full' });
    expect(fullResult.ok).toBe(true);
    if (!fullResult.ok) return;
    expect(fullResult.value.filesScanned).toBe(3);

    // No changes — incremental should detect all unchanged
    const incResult = scanProject({ projectRoot, scanType: 'incremental' });
    expect(incResult.ok).toBe(true);
    if (!incResult.ok) return;
    expect(incResult.value.filesUnchanged).toBe(3);
    expect(incResult.value.filesChanged).toBe(0);
    expect(incResult.value.filesNew).toBe(0);
    expect(incResult.value.filesDeleted).toBe(0);
  });

  it('should detect changed files after modification', () => {
    const fullResult = scanProject({ projectRoot, scanType: 'full' });
    expect(fullResult.ok).toBe(true);

    // Modify a file
    writeFileSync(
      path.join(projectRoot, 'src', 'utils.ts'),
      `export function add(a: number, b: number) { return a + b; }\nexport function subtract(a: number, b: number) { return a - b; }\n`,
    );

    const incResult = scanProject({ projectRoot, scanType: 'incremental' });
    expect(incResult.ok).toBe(true);
    if (!incResult.ok) return;
    expect(incResult.value.filesChanged).toBe(1);
    expect(incResult.value.filesUnchanged).toBe(2);
  });

  it('should detect new files', () => {
    const fullResult = scanProject({ projectRoot, scanType: 'full' });
    expect(fullResult.ok).toBe(true);

    // Add a new file
    writeFileSync(path.join(projectRoot, 'src', 'new-module.ts'), `export const x = 1;\n`);

    const incResult = scanProject({ projectRoot, scanType: 'incremental' });
    expect(incResult.ok).toBe(true);
    if (!incResult.ok) return;
    expect(incResult.value.filesNew).toBe(1);
    expect(incResult.value.projectMap.files['src/new-module.ts']).toBeDefined();
  });

  it('should detect deleted files and remove from project map', () => {
    const fullResult = scanProject({ projectRoot, scanType: 'full' });
    expect(fullResult.ok).toBe(true);

    // Delete a file
    unlinkSync(path.join(projectRoot, 'readme.md'));

    const incResult = scanProject({ projectRoot, scanType: 'incremental' });
    expect(incResult.ok).toBe(true);
    if (!incResult.ok) return;
    expect(incResult.value.filesDeleted).toBe(1);
    expect(incResult.value.projectMap.files['readme.md']).toBeUndefined();
  });

  it('should fall back to full scan when no existing project map', () => {
    // No full scan first — should still work
    const result = scanProject({ projectRoot, scanType: 'incremental' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.filesScanned).toBe(3);
  });

  it('should update dependency graph incrementally', () => {
    const fullResult = scanProject({ projectRoot, scanType: 'full' });
    expect(fullResult.ok).toBe(true);
    if (!fullResult.ok) return;
    expect(fullResult.value.dependencyEdges).toBeGreaterThan(0);

    // Modify to remove the import
    writeFileSync(path.join(projectRoot, 'src', 'index.ts'), `export function main() {}\n`);

    const incResult = scanProject({ projectRoot, scanType: 'incremental' });
    expect(incResult.ok).toBe(true);
    if (!incResult.ok) return;
    // Edge from index.ts -> utils.ts should be gone
    expect(incResult.value.dependencyEdges).toBe(0);
  });

  it('should update keyword index incrementally', () => {
    const fullResult = scanProject({ projectRoot, scanType: 'full' });
    expect(fullResult.ok).toBe(true);

    // Add file with new keywords
    writeFileSync(
      path.join(projectRoot, 'src', 'auth.ts'),
      `export function handleLogin() {}\nexport class AuthService {}\n`,
    );

    const incResult = scanProject({ projectRoot, scanType: 'incremental' });
    expect(incResult.ok).toBe(true);
    if (!incResult.ok) return;
    expect(incResult.value.keywordsExtracted).toBeGreaterThan(0);
  });
});
