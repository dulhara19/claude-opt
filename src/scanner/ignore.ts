import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import ignore from 'ignore';
import { toOS } from '../utils/index.js';
import type { IgnorePatterns } from './types.js';

const DEFAULT_IGNORE_PATTERNS = [
  'node_modules/',
  '.git/',
  '.claude-opt/',
  '.env',
  '.env.*',
  '*.secret',
  '*.key',
];

/**
 * Load ignore patterns from .gitignore, .claudeignore, and defaults.
 */
export function loadIgnorePatterns(projectRoot: string): IgnorePatterns {
  const root = toOS(projectRoot);
  const allPatterns: string[] = [...DEFAULT_IGNORE_PATTERNS];

  const gitignorePath = path.join(root, '.gitignore');
  if (existsSync(gitignorePath)) {
    const lines = readFileSync(gitignorePath, 'utf-8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
    allPatterns.push(...lines);
  }

  const claudeignorePath = path.join(root, '.claudeignore');
  if (existsSync(claudeignorePath)) {
    const lines = readFileSync(claudeignorePath, 'utf-8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
    allPatterns.push(...lines);
  }

  return { allPatterns };
}

/**
 * Check if a relative path should be ignored based on loaded patterns.
 */
export function shouldIgnore(relativePath: string, patterns: IgnorePatterns): boolean {
  const ig = ignore().add(patterns.allPatterns);
  return ig.ignores(relativePath);
}
