import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  extractKeywords,
  scoreHistorySimilarity,
} from '../../../src/predictor/signals/history-similarity.js';
import { createTempProjectRoot, cleanupTempProjectRoot } from '../../helpers/test-store.js';
import { initializeStore, writeTaskHistory } from '../../../src/store/index.js';
import { createDefaultTaskHistory } from '../../../src/store/defaults.js';

describe('extractKeywords', () => {
  it('extracts lowercase keywords from text', () => {
    const keywords = extractKeywords('Fix the Login Bug');
    expect(keywords).toContain('fix');
    expect(keywords).toContain('the');
    expect(keywords).toContain('login');
    expect(keywords).toContain('bug');
  });

  it('filters out short words (<=2 chars)', () => {
    const keywords = extractKeywords('a to fix it ok');
    expect(keywords).not.toContain('a');
    expect(keywords).not.toContain('to');
    expect(keywords).not.toContain('it');
    expect(keywords).not.toContain('ok');
    expect(keywords).toContain('fix');
  });

  it('splits on non-alphanumeric characters', () => {
    const keywords = extractKeywords('auth-login.user_name');
    expect(keywords).toContain('auth');
    expect(keywords).toContain('login');
    expect(keywords).toContain('user');
    expect(keywords).toContain('name');
  });

  it('returns empty array for empty string', () => {
    expect(extractKeywords('')).toHaveLength(0);
  });
});

describe('scoreHistorySimilarity', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = createTempProjectRoot();
    initializeStore(projectRoot);
  });

  afterEach(() => {
    cleanupTempProjectRoot(projectRoot);
  });

  it('returns empty map when no task history exists', () => {
    const scores = scoreHistorySimilarity(['auth', 'login'], projectRoot);
    expect(scores.size).toBe(0);
  });

  it('returns empty map when store is inaccessible', () => {
    const scores = scoreHistorySimilarity(['auth'], '/nonexistent/path');
    expect(scores.size).toBe(0);
  });

  it('scores files from similar past tasks', () => {
    const history = createDefaultTaskHistory();
    history.tasks = [
      {
        id: 'task-1',
        timestamp: new Date().toISOString(),
        taskText: 'fix the auth login validation',
        classification: { taskType: 'BugFix', complexity: 'Medium', confidence: 0.8 },
        prediction: {
          predictedFiles: ['src/auth/login.ts'],
          actualFiles: ['src/auth/login.ts', 'src/auth/validators.ts'],
          precision: 0.5,
          recall: 1.0,
        },
        routing: { model: 'opus', reason: 'complex' },
        tokens: { consumed: 1000, budgeted: 5000, saved: 0 },
        feedback: null,
      },
    ];
    history.count = 1;
    writeTaskHistory(projectRoot, history);

    const scores = scoreHistorySimilarity(['auth', 'login'], projectRoot);
    expect(scores.size).toBeGreaterThan(0);
    expect(scores.has('src/auth/login.ts')).toBe(true);
    expect(scores.has('src/auth/validators.ts')).toBe(true);
  });

  it('normalizes scores to 0.0-1.0 range', () => {
    const history = createDefaultTaskHistory();
    history.tasks = [
      {
        id: 'task-1',
        timestamp: new Date().toISOString(),
        taskText: 'fix the auth login validation',
        classification: { taskType: 'BugFix', complexity: 'Medium', confidence: 0.8 },
        prediction: {
          predictedFiles: [],
          actualFiles: ['src/auth/login.ts', 'src/models/user.ts'],
          precision: 0,
          recall: 0,
        },
        routing: { model: 'opus', reason: 'complex' },
        tokens: { consumed: 1000, budgeted: 5000, saved: 0 },
        feedback: null,
      },
    ];
    history.count = 1;
    writeTaskHistory(projectRoot, history);

    const scores = scoreHistorySimilarity(['auth', 'login'], projectRoot);
    for (const score of scores.values()) {
      expect(score.score).toBeGreaterThanOrEqual(0);
      expect(score.score).toBeLessThanOrEqual(1);
    }
  });

  it('returns empty map when no keywords overlap', () => {
    const history = createDefaultTaskHistory();
    history.tasks = [
      {
        id: 'task-1',
        timestamp: new Date().toISOString(),
        taskText: 'update the database schema',
        classification: { taskType: 'Feature', complexity: 'High', confidence: 0.8 },
        prediction: {
          predictedFiles: [],
          actualFiles: ['src/db/schema.ts'],
          precision: 0,
          recall: 0,
        },
        routing: { model: 'opus', reason: 'complex' },
        tokens: { consumed: 1000, budgeted: 5000, saved: 0 },
        feedback: null,
      },
    ];
    history.count = 1;
    writeTaskHistory(projectRoot, history);

    const scores = scoreHistorySimilarity(['auth', 'login'], projectRoot);
    expect(scores.size).toBe(0);
  });

  it('sets signal source correctly', () => {
    const history = createDefaultTaskHistory();
    history.tasks = [
      {
        id: 'task-1',
        timestamp: new Date().toISOString(),
        taskText: 'fix the auth login bug',
        classification: { taskType: 'BugFix', complexity: 'Medium', confidence: 0.8 },
        prediction: {
          predictedFiles: [],
          actualFiles: ['src/auth/login.ts'],
          precision: 0,
          recall: 0,
        },
        routing: { model: 'opus', reason: 'complex' },
        tokens: { consumed: 1000, budgeted: 5000, saved: 0 },
        feedback: null,
      },
    ];
    history.count = 1;
    writeTaskHistory(projectRoot, history);

    const scores = scoreHistorySimilarity(['auth', 'login'], projectRoot);
    for (const score of scores.values()) {
      expect(score.source).toBe('HistorySimilarity');
    }
  });
});
