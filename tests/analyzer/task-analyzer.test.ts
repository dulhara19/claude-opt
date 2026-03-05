import { describe, it, expect } from 'vitest';
import { classifyTask } from '../../src/analyzer/index.js';
import { TaskType, Complexity } from '../../src/types/index.js';
import type { ProjectMap } from '../../src/types/index.js';

describe('classifyTask', () => {
  describe('bugfix classification', () => {
    it('classifies "fix" keyword as BugFix', () => {
      const result = classifyTask('fix the dropdown z-index bug in UserMenu');
      expect(result.type).toBe(TaskType.BugFix);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1.0);
    });

    it('classifies "bug" keyword as BugFix', () => {
      const result = classifyTask('there is a bug in the login page');
      expect(result.type).toBe(TaskType.BugFix);
    });

    it('classifies "error" keyword as BugFix', () => {
      const result = classifyTask('error occurs when submitting the form');
      expect(result.type).toBe(TaskType.BugFix);
    });

    it('classifies "broken" keyword as BugFix', () => {
      const result = classifyTask('the sidebar is broken on mobile');
      expect(result.type).toBe(TaskType.BugFix);
    });

    it('classifies "crash" keyword as BugFix', () => {
      const result = classifyTask('app crash on startup');
      expect(result.type).toBe(TaskType.BugFix);
    });
  });

  describe('feature classification', () => {
    it('classifies "add" keyword as Feature', () => {
      const result = classifyTask('add dark mode to settings panel');
      expect(result.type).toBe(TaskType.Feature);
    });

    it('classifies "create" keyword as Feature', () => {
      const result = classifyTask('create a new user registration page');
      expect(result.type).toBe(TaskType.Feature);
    });

    it('classifies "implement" keyword as Feature', () => {
      const result = classifyTask('implement search functionality');
      expect(result.type).toBe(TaskType.Feature);
    });

    it('classifies "build" keyword as Feature', () => {
      const result = classifyTask('build a notification system');
      expect(result.type).toBe(TaskType.Feature);
    });
  });

  describe('refactor classification', () => {
    it('classifies "refactor" keyword as Refactor', () => {
      const result = classifyTask('refactor the authentication module');
      expect(result.type).toBe(TaskType.Refactor);
    });

    it('classifies "restructure" keyword as Refactor', () => {
      const result = classifyTask('restructure the project directory');
      expect(result.type).toBe(TaskType.Refactor);
    });

    it('classifies "simplify" keyword as Refactor', () => {
      const result = classifyTask('simplify the state management logic');
      expect(result.type).toBe(TaskType.Refactor);
    });
  });

  describe('research/learning classification', () => {
    it('classifies "explain" keyword as Research', () => {
      const result = classifyTask('explain how the auth middleware works');
      expect(result.type).toBe(TaskType.Research);
    });

    it('classifies "research" keyword as Research', () => {
      const result = classifyTask('research best practices for caching');
      expect(result.type).toBe(TaskType.Research);
    });

    it('classifies "learn" keyword as Learning', () => {
      const result = classifyTask('learn about React hooks');
      expect(result.type).toBe(TaskType.Learning);
    });

    it('classifies "study" keyword as Learning', () => {
      const result = classifyTask('study the existing API patterns');
      expect(result.type).toBe(TaskType.Learning);
    });

    it('defaults research tasks to simple complexity', () => {
      const result = classifyTask('explain how the auth middleware works');
      expect(result.complexity).toBe(Complexity.Simple);
    });

    it('defaults learning tasks to simple complexity', () => {
      const result = classifyTask('learn about React hooks');
      expect(result.complexity).toBe(Complexity.Simple);
    });
  });

  describe('non-code task classification', () => {
    it('classifies "chapter" keyword as Writing', () => {
      const result = classifyTask('restructure chapter 3 of the thesis');
      expect(result.type).toBe(TaskType.Writing);
    });

    it('classifies "thesis" keyword as Writing', () => {
      const result = classifyTask('review the thesis introduction');
      expect(result.type).toBe(TaskType.Writing);
    });

    it('classifies "essay" keyword as Writing', () => {
      const result = classifyTask('draft an essay on machine learning');
      expect(result.type).toBe(TaskType.Writing);
    });

    it('classifies "document" keyword as Documentation', () => {
      const result = classifyTask('document the API endpoints');
      expect(result.type).toBe(TaskType.Documentation);
    });

    it('classifies "readme" keyword as Documentation', () => {
      const result = classifyTask('update the readme file');
      expect(result.type).toBe(TaskType.Documentation);
    });
  });

  describe('unknown classification', () => {
    it('returns Unknown for no matching keywords', () => {
      const result = classifyTask('xyzzy plugh abracadabra');
      expect(result.type).toBe(TaskType.Unknown);
      expect(result.confidence).toBe(0);
    });

    it('returns Unknown for empty prompt', () => {
      const result = classifyTask('');
      expect(result.type).toBe(TaskType.Unknown);
      expect(result.confidence).toBe(0);
    });

    it('returns general domain for unknown prompts', () => {
      const result = classifyTask('xyzzy plugh abracadabra');
      expect(result.domain).toBe('general');
    });
  });

  describe('confidence scoring', () => {
    it('produces confidence between 0 and 1', () => {
      const result = classifyTask('fix the bug in the login component');
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1.0);
    });

    it('higher confidence when multiple keywords for same type', () => {
      const singleKeyword = classifyTask('fix the login page');
      const multiKeyword = classifyTask('fix the bug error crash in login');
      expect(multiKeyword.confidence).toBeGreaterThanOrEqual(singleKeyword.confidence);
    });
  });

  describe('complexity classification', () => {
    it('classifies "simple fix" as Simple', () => {
      const result = classifyTask('simple fix for the typo');
      expect(result.complexity).toBe(Complexity.Simple);
    });

    it('classifies "complex rewrite" as Complex', () => {
      const result = classifyTask('complex rewrite of the entire system');
      expect(result.complexity).toBe(Complexity.Complex);
    });

    it('defaults to Medium when no clear signal', () => {
      const result = classifyTask('add a button to the page');
      expect(result.complexity).toBe(Complexity.Medium);
    });

    it('classifies "typo" as Simple', () => {
      const result = classifyTask('fix typo in the readme');
      expect(result.complexity).toBe(Complexity.Simple);
    });
  });

  describe('domain classification', () => {
    const mockProjectMap: ProjectMap = {
      schemaVersion: '1',
      scannedAt: new Date().toISOString(),
      scanType: 'full',
      projectType: 'code',
      totalFiles: 3,
      files: {},
      domains: {
        auth: ['src/auth/login.ts', 'src/auth/middleware.ts'],
        ui: ['src/components/Button.tsx', 'src/components/Modal.tsx'],
      },
      ignoredPatterns: [],
    };

    it('maps domain from project map', () => {
      const result = classifyTask('fix the auth middleware', mockProjectMap);
      expect(result.domain).toBe('auth');
    });

    it('returns general when no project map provided', () => {
      const result = classifyTask('fix the auth middleware');
      expect(result.domain).toBe('general');
    });

    it('returns general when no domain match', () => {
      const result = classifyTask('fix something random', mockProjectMap);
      expect(result.domain).toBe('general');
    });
  });

  describe('performance', () => {
    it('completes classification in under 100ms', () => {
      const start = performance.now();
      for (let i = 0; i < 100; i++) {
        classifyTask('fix the complex authentication bug in the login middleware system');
      }
      const elapsed = (performance.now() - start) / 100;
      expect(elapsed).toBeLessThan(100);
    });
  });

  describe('ClassificationResult structure', () => {
    it('returns all required fields', () => {
      const result = classifyTask('add a new feature');
      expect(result).toHaveProperty('type');
      expect(result).toHaveProperty('domain');
      expect(result).toHaveProperty('complexity');
      expect(result).toHaveProperty('confidence');
    });
  });
});
