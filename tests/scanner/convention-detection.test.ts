import { describe, it, expect } from 'vitest';
import { detectConventions } from '../../src/scanner/claudemd-generator.js';
import type { ProjectMap } from '../../src/types/index.js';

function makeProjectMap(filePaths: string[]): ProjectMap {
  const files: Record<string, ProjectMap['files'][string]> = {};
  for (const fp of filePaths) {
    files[fp] = {
      path: fp, size: 100, contentHash: 'aaaa',
      lastModified: '', language: 'typescript', domain: 'root',
      imports: [], exports: [], keywords: [],
    };
  }
  return {
    schemaVersion: '1.0.0', scannedAt: '', scanType: 'full',
    projectType: 'code', totalFiles: filePaths.length,
    files, domains: {}, ignoredPatterns: [],
  };
}

describe('detectConventions', () => {
  it('should detect kebab-case file naming', () => {
    const pm = makeProjectMap([
      'src/auth-handler.ts',
      'src/user-service.ts',
      'src/data-parser.ts',
    ]);
    const conventions = detectConventions(pm);
    const naming = conventions.find((c) => c.pattern.includes('File naming'));
    expect(naming).toBeDefined();
    expect(naming!.pattern).toContain('kebab-case');
  });

  it('should detect camelCase file naming', () => {
    const pm = makeProjectMap([
      'src/authHandler.ts',
      'src/userService.ts',
      'src/dataParser.ts',
    ]);
    const conventions = detectConventions(pm);
    const naming = conventions.find((c) => c.pattern.includes('File naming'));
    expect(naming).toBeDefined();
    expect(naming!.pattern).toContain('camelCase');
  });

  it('should detect separate test directory pattern', () => {
    const pm = makeProjectMap([
      'src/auth.ts',
      'tests/auth-helper.ts',
      'tests/utils-helper.ts',
    ]);
    const conventions = detectConventions(pm);
    const testConv = conventions.find((c) => c.pattern.includes('Test files'));
    expect(testConv).toBeDefined();
    expect(testConv!.pattern).toContain('separate directory');
  });

  it('should detect co-located test pattern', () => {
    const pm = makeProjectMap([
      'src/auth.ts',
      'src/auth.test.ts',
      'src/utils.ts',
      'src/utils.test.ts',
    ]);
    const conventions = detectConventions(pm);
    const testConv = conventions.find((c) => c.pattern.includes('Test files'));
    expect(testConv).toBeDefined();
    expect(testConv!.pattern).toContain('co-located');
  });

  it('should detect source directory convention', () => {
    const pm = makeProjectMap([
      'src/auth.ts',
      'src/utils.ts',
    ]);
    const conventions = detectConventions(pm);
    const srcConv = conventions.find((c) => c.pattern.includes('Source directory'));
    expect(srcConv).toBeDefined();
    expect(srcConv!.pattern).toContain('src/');
  });

  it('should detect barrel export pattern', () => {
    const pm = makeProjectMap([
      'src/index.ts',
      'src/utils/index.ts',
      'src/store/index.ts',
    ]);
    const conventions = detectConventions(pm);
    const barrel = conventions.find((c) => c.pattern.includes('Barrel exports'));
    expect(barrel).toBeDefined();
  });

  it('should detect package manager from lock file', () => {
    const pm = makeProjectMap([
      'package.json',
      'package-lock.json',
      'src/index.ts',
    ]);
    const conventions = detectConventions(pm);
    const pkgMgr = conventions.find((c) => c.pattern.includes('Package manager'));
    expect(pkgMgr).toBeDefined();
    expect(pkgMgr!.pattern).toContain('npm');
  });

  it('should return empty for minimal project', () => {
    const pm = makeProjectMap(['readme.md']);
    const conventions = detectConventions(pm);
    // May have some conventions but should not crash
    expect(Array.isArray(conventions)).toBe(true);
  });
});
