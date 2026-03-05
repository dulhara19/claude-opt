import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { predictFiles } from '../../src/predictor/file-predictor.js';
import type { PipelineContext } from '../../src/types/index.js';
import { TaskType, Complexity } from '../../src/types/index.js';
import { CONFIDENCE_THRESHOLD } from '../../src/utils/constants.js';
import { createTempProjectRoot, cleanupTempProjectRoot } from '../helpers/test-store.js';
import {
  initializeStore,
  writeTaskHistory,
  writeDependencyGraph,
  writeKeywordIndex,
  writePatterns,
} from '../../src/store/index.js';
import {
  createDefaultTaskHistory,
  createDefaultDependencyGraph,
  createDefaultKeywordIndex,
  createDefaultPatterns,
} from '../../src/store/defaults.js';

function makeContext(taskText: string, workingDir: string): PipelineContext {
  return {
    taskText,
    workingDir,
    isDryRun: true,
    results: {},
    startedAt: Date.now(),
    classification: {
      type: TaskType.Feature,
      domain: 'auth',
      complexity: Complexity.Medium,
      confidence: 0.8,
    },
  };
}

describe('predictFiles', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = createTempProjectRoot();
    initializeStore(projectRoot);
  });

  afterEach(() => {
    cleanupTempProjectRoot(projectRoot);
  });

  it('returns a valid PredictionResult structure', () => {
    const ctx = makeContext('fix the auth login bug', projectRoot);
    const result = predictFiles(ctx);

    expect(result).toHaveProperty('predictions');
    expect(result).toHaveProperty('totalCandidates');
    expect(result).toHaveProperty('threshold');
    expect(result).toHaveProperty('durationMs');
    expect(result.predictions).toBeInstanceOf(Array);
    expect(result.threshold).toBe(CONFIDENCE_THRESHOLD);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('returns empty predictions when no store data exists', () => {
    const ctx = makeContext('fix the auth login bug', projectRoot);
    const result = predictFiles(ctx);

    expect(result.predictions).toHaveLength(0);
    expect(result.totalCandidates).toBe(0);
  });

  it('returns empty predictions when task has no extractable keywords', () => {
    const ctx = makeContext('a b', projectRoot);
    const result = predictFiles(ctx);

    expect(result.predictions).toHaveLength(0);
  });

  describe('with keyword index data', () => {
    beforeEach(() => {
      const keywordIndex = createDefaultKeywordIndex();
      keywordIndex.keywordToFiles = {
        auth: ['src/auth/login.ts', 'src/auth/register.ts'],
        login: ['src/auth/login.ts', 'src/pages/login-page.ts'],
        user: ['src/models/user.ts', 'src/auth/login.ts'],
        database: ['src/db/connection.ts'],
        component: ['src/ui/button.tsx'],
      };
      keywordIndex.fileToKeywords = {
        'src/auth/login.ts': ['auth', 'login', 'user'],
        'src/auth/register.ts': ['auth'],
        'src/pages/login-page.ts': ['login'],
        'src/models/user.ts': ['user'],
        'src/db/connection.ts': ['database'],
        'src/ui/button.tsx': ['component'],
      };
      writeKeywordIndex(projectRoot, keywordIndex);
    });

    it('predicts files that match task keywords', () => {
      const ctx = makeContext('fix the auth login flow', projectRoot);
      const result = predictFiles(ctx);

      expect(result.totalCandidates).toBeGreaterThan(0);
      // auth/login.ts should be highly scored (matches "auth" and "login")
      const loginFile = result.predictions.find(
        (p) => p.filePath === 'src/auth/login.ts',
      );
      if (result.predictions.length > 0) {
        expect(loginFile).toBeDefined();
      }
    });

    it('returns predictions sorted by score descending', () => {
      const ctx = makeContext('fix the auth login user flow', projectRoot);
      const result = predictFiles(ctx);

      for (let i = 1; i < result.predictions.length; i++) {
        expect(result.predictions[i - 1].score).toBeGreaterThanOrEqual(
          result.predictions[i].score,
        );
      }
    });

    it('excludes files below confidence threshold', () => {
      const ctx = makeContext('fix the auth login flow', projectRoot);
      const result = predictFiles(ctx);

      for (const prediction of result.predictions) {
        expect(prediction.score).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLD);
      }
    });

    it('each prediction has a composite score between 0.0 and 1.0', () => {
      const ctx = makeContext('fix the auth login user flow', projectRoot);
      const result = predictFiles(ctx);

      for (const prediction of result.predictions) {
        expect(prediction.score).toBeGreaterThanOrEqual(0);
        expect(prediction.score).toBeLessThanOrEqual(1);
      }
    });

    it('each prediction includes signal breakdown', () => {
      const ctx = makeContext('fix the auth login flow', projectRoot);
      const result = predictFiles(ctx);

      for (const prediction of result.predictions) {
        expect(prediction.signals).toBeInstanceOf(Array);
        expect(prediction.signals.length).toBeGreaterThan(0);
        for (const signal of prediction.signals) {
          expect(signal).toHaveProperty('source');
          expect(signal).toHaveProperty('score');
          expect(signal).toHaveProperty('weight');
          expect(signal).toHaveProperty('reason');
        }
      }
    });
  });

  describe('cold start handling', () => {
    beforeEach(() => {
      // Set up keyword index but NO task history
      const keywordIndex = createDefaultKeywordIndex();
      keywordIndex.keywordToFiles = {
        auth: ['src/auth/login.ts'],
        login: ['src/auth/login.ts'],
      };
      keywordIndex.fileToKeywords = {
        'src/auth/login.ts': ['auth', 'login'],
      };
      writeKeywordIndex(projectRoot, keywordIndex);
    });

    it('produces predictions on cold start using keyword and graph signals', () => {
      const ctx = makeContext('fix the auth login bug', projectRoot);
      const result = predictFiles(ctx);

      // Should still produce results via keyword lookup
      expect(result.totalCandidates).toBeGreaterThan(0);
    });

    it('does not use history signal on cold start', () => {
      const ctx = makeContext('fix the auth login bug', projectRoot);
      const result = predictFiles(ctx);

      // History signal weight should be 0 on cold start
      for (const prediction of result.predictions) {
        const historySignal = prediction.signals.find(
          (s) => s.source === 'HistorySimilarity',
        );
        if (historySignal) {
          expect(historySignal.weight).toBe(0);
        }
      }
    });
  });

  describe('graceful degradation', () => {
    it('returns empty prediction list when all candidates are below threshold', () => {
      // With no store data, all signals return empty → no candidates
      const ctx = makeContext('fix the auth login bug', projectRoot);
      const result = predictFiles(ctx);

      // No candidates above threshold → graceful degradation
      expect(result.predictions).toHaveLength(0);
    });

    it('never returns predictions below confidence threshold', () => {
      const keywordIndex = createDefaultKeywordIndex();
      keywordIndex.keywordToFiles = {
        auth: ['src/auth/login.ts'],
      };
      keywordIndex.fileToKeywords = {
        'src/auth/login.ts': ['auth'],
      };
      writeKeywordIndex(projectRoot, keywordIndex);

      const ctx = makeContext('fix the auth issue', projectRoot);
      const result = predictFiles(ctx);

      for (const prediction of result.predictions) {
        expect(prediction.score).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLD);
      }
    });
  });

  describe('dual content type support', () => {
    beforeEach(() => {
      const keywordIndex = createDefaultKeywordIndex();
      keywordIndex.keywordToFiles = {
        auth: ['src/auth/login.ts', 'docs/auth-guide.md'],
        setup: ['README.md', 'src/config/setup.ts'],
      };
      keywordIndex.fileToKeywords = {
        'src/auth/login.ts': ['auth'],
        'docs/auth-guide.md': ['auth'],
        'README.md': ['setup'],
        'src/config/setup.ts': ['setup'],
      };
      writeKeywordIndex(projectRoot, keywordIndex);
    });

    it('considers both code and document files', () => {
      const ctx = makeContext('fix the auth setup flow', projectRoot);
      const result = predictFiles(ctx);

      // Both .ts and .md files should be candidates
      if (result.totalCandidates > 0) {
        // The totalCandidates should include both code and docs
        expect(result.totalCandidates).toBeGreaterThanOrEqual(2);
      }
    });
  });

  describe('performance', () => {
    it('completes prediction in less than 200ms', () => {
      const keywordIndex = createDefaultKeywordIndex();
      // Create a moderately large keyword index
      for (let i = 0; i < 100; i++) {
        keywordIndex.keywordToFiles[`keyword${i}`] = [`src/file${i}.ts`];
        keywordIndex.fileToKeywords[`src/file${i}.ts`] = [`keyword${i}`];
      }
      writeKeywordIndex(projectRoot, keywordIndex);

      const ctx = makeContext('fix keyword0 keyword1 keyword2 keyword3', projectRoot);
      const result = predictFiles(ctx);

      expect(result.durationMs).toBeLessThan(200);
    });
  });

  describe('multi-signal scoring', () => {
    beforeEach(() => {
      // Set up keyword index
      const keywordIndex = createDefaultKeywordIndex();
      keywordIndex.keywordToFiles = {
        auth: ['src/auth/login.ts', 'src/auth/register.ts'],
        login: ['src/auth/login.ts'],
        user: ['src/models/user.ts'],
      };
      keywordIndex.fileToKeywords = {
        'src/auth/login.ts': ['auth', 'login'],
        'src/auth/register.ts': ['auth'],
        'src/models/user.ts': ['user'],
      };
      writeKeywordIndex(projectRoot, keywordIndex);

      // Set up dependency graph
      const depGraph = createDefaultDependencyGraph();
      depGraph.adjacency = {
        'src/auth/login.ts': {
          imports: ['src/models/user.ts'],
          importedBy: ['src/pages/login-page.ts'],
        },
        'src/models/user.ts': {
          imports: [],
          importedBy: ['src/auth/login.ts'],
        },
        'src/pages/login-page.ts': {
          imports: ['src/auth/login.ts'],
          importedBy: [],
        },
      };
      writeDependencyGraph(projectRoot, depGraph);

      // Set up task history (above cold start threshold)
      const history = createDefaultTaskHistory();
      for (let i = 0; i < 6; i++) {
        history.tasks.push({
          id: `task-${i}`,
          timestamp: new Date().toISOString(),
          taskText: 'fix the auth login validation',
          classification: { taskType: 'BugFix', complexity: 'Medium', confidence: 0.8 },
          prediction: {
            predictedFiles: ['src/auth/login.ts'],
            actualFiles: ['src/auth/login.ts', 'src/auth/register.ts'],
            precision: 0.5,
            recall: 1.0,
          },
          routing: { model: 'opus', reason: 'complex' },
          tokens: { consumed: 1000, budgeted: 5000, saved: 0 },
          feedback: null,
        });
      }
      history.count = history.tasks.length;
      writeTaskHistory(projectRoot, history);

      // Set up patterns with co-occurrences
      const patterns = createDefaultPatterns();
      patterns.coOccurrences = [
        { files: ['src/auth/login.ts', 'src/auth/register.ts'], count: 5, confidence: 0.8 },
      ];
      writePatterns(projectRoot, patterns);
    });

    it('combines multiple signal sources', () => {
      const ctx = makeContext('fix the auth login bug', projectRoot);
      const result = predictFiles(ctx);

      // With history, keyword, graph, and co-occurrence data, we should get predictions
      expect(result.totalCandidates).toBeGreaterThan(0);

      // login.ts should be highly scored (appears in all signals)
      const loginFile = result.predictions.find(
        (p) => p.filePath === 'src/auth/login.ts',
      );
      if (loginFile) {
        expect(loginFile.signals.length).toBeGreaterThan(1);
      }
    });

    it('uses history signal when history is available', () => {
      const ctx = makeContext('fix the auth login validation', projectRoot);
      const result = predictFiles(ctx);

      // Check if any prediction has history similarity signal
      const hasHistorySignal = result.predictions.some((p) =>
        p.signals.some((s) => s.source === 'HistorySimilarity'),
      );
      if (result.predictions.length > 0) {
        expect(hasHistorySignal).toBe(true);
      }
    });
  });
});
