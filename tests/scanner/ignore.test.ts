import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { loadIgnorePatterns, shouldIgnore } from '../../src/scanner/index.js';

const fixtureRoot = path.resolve(__dirname, '../fixtures/sample-project');

describe('loadIgnorePatterns', () => {
  it('loads .gitignore patterns from project root', () => {
    const patterns = loadIgnorePatterns(fixtureRoot);
    expect(patterns.allPatterns).toContain('node_modules/');
    expect(patterns.allPatterns).toContain('dist/');
    expect(patterns.allPatterns).toContain('*.log');
  });

  it('includes default ignore patterns', () => {
    const patterns = loadIgnorePatterns(fixtureRoot);
    expect(patterns.allPatterns).toContain('.git/');
    expect(patterns.allPatterns).toContain('.claude-opt/');
    expect(patterns.allPatterns).toContain('.env');
    expect(patterns.allPatterns).toContain('*.secret');
    expect(patterns.allPatterns).toContain('*.key');
  });

  it('handles missing .gitignore gracefully', () => {
    const patterns = loadIgnorePatterns(path.resolve(__dirname, '../fixtures/research-project'));
    // Should still have default patterns
    expect(patterns.allPatterns.length).toBeGreaterThan(0);
    expect(patterns.allPatterns).toContain('node_modules/');
  });
});

describe('shouldIgnore', () => {
  it('ignores node_modules/', () => {
    const patterns = loadIgnorePatterns(fixtureRoot);
    expect(shouldIgnore('node_modules/fake-dep/index.js', patterns)).toBe(true);
  });

  it('ignores .git/', () => {
    const patterns = loadIgnorePatterns(fixtureRoot);
    expect(shouldIgnore('.git/config', patterns)).toBe(true);
  });

  it('ignores .claude-opt/', () => {
    const patterns = loadIgnorePatterns(fixtureRoot);
    expect(shouldIgnore('.claude-opt/config.json', patterns)).toBe(true);
  });

  it('ignores .env files', () => {
    const patterns = loadIgnorePatterns(fixtureRoot);
    expect(shouldIgnore('.env', patterns)).toBe(true);
  });

  it('ignores *.secret files', () => {
    const patterns = loadIgnorePatterns(fixtureRoot);
    expect(shouldIgnore('api.secret', patterns)).toBe(true);
  });

  it('ignores dist/ from .gitignore', () => {
    const patterns = loadIgnorePatterns(fixtureRoot);
    expect(shouldIgnore('dist/index.js', patterns)).toBe(true);
  });

  it('ignores *.log from .gitignore', () => {
    const patterns = loadIgnorePatterns(fixtureRoot);
    expect(shouldIgnore('error.log', patterns)).toBe(true);
  });

  it('does not ignore source files', () => {
    const patterns = loadIgnorePatterns(fixtureRoot);
    expect(shouldIgnore('src/index.ts', patterns)).toBe(false);
  });

  it('does not ignore test files', () => {
    const patterns = loadIgnorePatterns(fixtureRoot);
    expect(shouldIgnore('tests/utils.test.ts', patterns)).toBe(false);
  });
});
