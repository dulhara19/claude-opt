import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { scoreCooccurrenceBoost } from '../../../src/predictor/signals/cooccurrence-boost.js';
import { createTempProjectRoot, cleanupTempProjectRoot } from '../../helpers/test-store.js';
import { initializeStore, writePatterns } from '../../../src/store/index.js';
import { createDefaultPatterns } from '../../../src/store/defaults.js';

describe('scoreCooccurrenceBoost', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = createTempProjectRoot();
    initializeStore(projectRoot);
  });

  afterEach(() => {
    cleanupTempProjectRoot(projectRoot);
  });

  it('returns empty map when no patterns exist', () => {
    const scores = scoreCooccurrenceBoost(
      new Set(['src/auth/login.ts']),
      '/nonexistent/path',
    );
    expect(scores.size).toBe(0);
  });

  it('returns empty map when no co-occurrences exist', () => {
    const patterns = createDefaultPatterns();
    writePatterns(projectRoot, patterns);

    const scores = scoreCooccurrenceBoost(
      new Set(['src/auth/login.ts']),
      projectRoot,
    );
    expect(scores.size).toBe(0);
  });

  it('boosts co-occurring files when one is predicted', () => {
    const patterns = createDefaultPatterns();
    patterns.coOccurrences = [
      { files: ['src/auth/login.ts', 'src/auth/login.test.ts'], count: 10, confidence: 0.9 },
    ];
    writePatterns(projectRoot, patterns);

    const predicted = new Set(['src/auth/login.ts']);
    const scores = scoreCooccurrenceBoost(predicted, projectRoot);

    expect(scores.has('src/auth/login.test.ts')).toBe(true);
  });

  it('does not boost files that are already predicted', () => {
    const patterns = createDefaultPatterns();
    patterns.coOccurrences = [
      { files: ['src/auth/login.ts', 'src/auth/login.test.ts'], count: 10, confidence: 0.9 },
    ];
    writePatterns(projectRoot, patterns);

    const predicted = new Set(['src/auth/login.ts', 'src/auth/login.test.ts']);
    const scores = scoreCooccurrenceBoost(predicted, projectRoot);

    // Both are already predicted, no new files to boost
    expect(scores.size).toBe(0);
  });

  it('boosts in both directions of the pair', () => {
    const patterns = createDefaultPatterns();
    patterns.coOccurrences = [
      { files: ['src/auth/login.ts', 'src/auth/register.ts'], count: 5, confidence: 0.7 },
    ];
    writePatterns(projectRoot, patterns);

    // Predict register.ts → should boost login.ts
    const predicted = new Set(['src/auth/register.ts']);
    const scores = scoreCooccurrenceBoost(predicted, projectRoot);

    expect(scores.has('src/auth/login.ts')).toBe(true);
  });

  it('normalizes scores to 0.0-1.0 range', () => {
    const patterns = createDefaultPatterns();
    patterns.coOccurrences = [
      { files: ['src/a.ts', 'src/b.ts'], count: 10, confidence: 0.9 },
      { files: ['src/a.ts', 'src/c.ts'], count: 3, confidence: 0.3 },
    ];
    writePatterns(projectRoot, patterns);

    const predicted = new Set(['src/a.ts']);
    const scores = scoreCooccurrenceBoost(predicted, projectRoot);

    for (const score of scores.values()) {
      expect(score.score).toBeGreaterThanOrEqual(0);
      expect(score.score).toBeLessThanOrEqual(1);
    }
  });

  it('returns empty map when predicted files set is empty', () => {
    const patterns = createDefaultPatterns();
    patterns.coOccurrences = [
      { files: ['src/a.ts', 'src/b.ts'], count: 10, confidence: 0.9 },
    ];
    writePatterns(projectRoot, patterns);

    const scores = scoreCooccurrenceBoost(new Set(), projectRoot);
    expect(scores.size).toBe(0);
  });

  it('sets signal source correctly', () => {
    const patterns = createDefaultPatterns();
    patterns.coOccurrences = [
      { files: ['src/a.ts', 'src/b.ts'], count: 10, confidence: 0.9 },
    ];
    writePatterns(projectRoot, patterns);

    const predicted = new Set(['src/a.ts']);
    const scores = scoreCooccurrenceBoost(predicted, projectRoot);

    for (const score of scores.values()) {
      expect(score.source).toBe('CooccurrenceBoost');
    }
  });
});
