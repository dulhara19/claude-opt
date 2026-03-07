import { TaskType, Complexity } from '../types/index.js';

/**
 * Keyword entry with weight for scoring.
 */
export interface KeywordEntry {
  keyword: string;
  weight: number;
}

/**
 * Map of task types to their keyword entries.
 */
export type TaskTypeKeywords = Record<string, KeywordEntry[]>;

/**
 * Keyword maps for task type classification (AD-09: Weighted Keyword Scoring).
 * Exact match keywords get higher weight; partial/contextual get lower.
 */
export const TASK_TYPE_KEYWORDS: TaskTypeKeywords = {
  [TaskType.BugFix]: [
    { keyword: 'fix', weight: 1.0 },
    { keyword: 'bug', weight: 1.0 },
    { keyword: 'broken', weight: 0.9 },
    { keyword: 'error', weight: 0.8 },
    { keyword: 'crash', weight: 0.9 },
    { keyword: 'issue', weight: 0.6 },
    { keyword: 'wrong', weight: 0.7 },
    { keyword: 'fail', weight: 0.8 },
    { keyword: 'failing', weight: 0.8 },
    { keyword: 'debug', weight: 0.7 },
    { keyword: 'patch', weight: 0.7 },
  ],
  [TaskType.Feature]: [
    { keyword: 'add', weight: 1.0 },
    { keyword: 'create', weight: 1.0 },
    { keyword: 'implement', weight: 1.0 },
    { keyword: 'new', weight: 0.7 },
    { keyword: 'build', weight: 0.9 },
    { keyword: 'introduce', weight: 0.8 },
    { keyword: 'develop', weight: 0.7 },
    { keyword: 'enable', weight: 0.6 },
  ],
  [TaskType.Refactor]: [
    { keyword: 'refactor', weight: 1.0 },
    { keyword: 'restructure', weight: 0.9 },
    { keyword: 'clean', weight: 0.7 },
    { keyword: 'reorganize', weight: 0.9 },
    { keyword: 'simplify', weight: 0.8 },
    { keyword: 'extract', weight: 0.8 },
    { keyword: 'rename', weight: 0.7 },
    { keyword: 'move', weight: 0.5 },
  ],
  [TaskType.Research]: [
    { keyword: 'explain', weight: 1.0 },
    { keyword: 'how', weight: 0.6 },
    { keyword: 'why', weight: 0.6 },
    { keyword: 'understand', weight: 0.9 },
    { keyword: 'investigate', weight: 0.9 },
    { keyword: 'explore', weight: 0.7 },
    { keyword: 'analyze', weight: 0.7 },
    { keyword: 'research', weight: 1.0 },
  ],
  [TaskType.Learning]: [
    { keyword: 'learn', weight: 1.0 },
    { keyword: 'study', weight: 0.9 },
    { keyword: 'tutorial', weight: 0.9 },
    { keyword: 'teach', weight: 0.8 },
    { keyword: 'guide', weight: 0.6 },
  ],
  [TaskType.Documentation]: [
    { keyword: 'document', weight: 1.0 },
    { keyword: 'readme', weight: 0.9 },
    { keyword: 'docs', weight: 0.9 },
    { keyword: 'describe', weight: 0.6 },
    { keyword: 'jsdoc', weight: 0.8 },
    { keyword: 'comment', weight: 0.5 },
  ],
  [TaskType.Writing]: [
    { keyword: 'write', weight: 0.8 },
    { keyword: 'draft', weight: 0.9 },
    { keyword: 'chapter', weight: 1.0 },
    { keyword: 'thesis', weight: 1.0 },
    { keyword: 'essay', weight: 1.0 },
    { keyword: 'literature', weight: 0.9 },
    { keyword: 'review', weight: 0.5 },
  ],
  [TaskType.Exploration]: [
    { keyword: 'try', weight: 0.5 },
    { keyword: 'experiment', weight: 0.9 },
    { keyword: 'prototype', weight: 0.9 },
    { keyword: 'spike', weight: 0.8 },
    { keyword: 'poc', weight: 0.8 },
  ],
  [TaskType.Test]: [
    { keyword: 'test', weight: 1.0 },
    { keyword: 'spec', weight: 0.9 },
    { keyword: 'coverage', weight: 0.8 },
    { keyword: 'assert', weight: 0.7 },
    { keyword: 'mock', weight: 0.7 },
    { keyword: 'stub', weight: 0.6 },
    { keyword: 'e2e', weight: 0.9 },
    { keyword: 'unit', weight: 0.7 },
    { keyword: 'integration', weight: 0.6 },
  ],
  [TaskType.Config]: [
    { keyword: 'config', weight: 1.0 },
    { keyword: 'configure', weight: 1.0 },
    { keyword: 'setup', weight: 0.8 },
    { keyword: 'install', weight: 0.7 },
    { keyword: 'env', weight: 0.7 },
    { keyword: 'environment', weight: 0.7 },
    { keyword: 'eslint', weight: 0.8 },
    { keyword: 'tsconfig', weight: 0.8 },
    { keyword: 'webpack', weight: 0.8 },
    { keyword: 'vite', weight: 0.8 },
    { keyword: 'dependency', weight: 0.6 },
    { keyword: 'package', weight: 0.5 },
  ],
  [TaskType.Docs]: [
    { keyword: 'changelog', weight: 0.9 },
    { keyword: 'api-doc', weight: 0.9 },
    { keyword: 'swagger', weight: 0.8 },
    { keyword: 'openapi', weight: 0.8 },
    { keyword: 'typedoc', weight: 0.8 },
    { keyword: 'storybook', weight: 0.7 },
  ],
};

/**
 * Keywords that signal complexity level.
 */
export const COMPLEXITY_SIGNALS = {
  simple: [
    { keyword: 'simple', weight: 1.0 },
    { keyword: 'small', weight: 0.8 },
    { keyword: 'quick', weight: 0.8 },
    { keyword: 'minor', weight: 0.7 },
    { keyword: 'tiny', weight: 0.9 },
    { keyword: 'trivial', weight: 0.9 },
    { keyword: 'typo', weight: 1.0 },
    { keyword: 'basic', weight: 0.7 },
    { keyword: 'straightforward', weight: 0.8 },
    { keyword: 'minimal', weight: 0.7 },
    { keyword: 'one', weight: 0.3 },
    { keyword: 'single', weight: 0.5 },
    { keyword: 'tweak', weight: 0.8 },
  ],
  complex: [
    { keyword: 'complex', weight: 1.0 },
    { keyword: 'large', weight: 0.7 },
    { keyword: 'overhaul', weight: 0.9 },
    { keyword: 'rewrite', weight: 0.9 },
    { keyword: 'migration', weight: 0.8 },
    { keyword: 'architecture', weight: 0.8 },
    { keyword: 'entire', weight: 0.6 },
    { keyword: 'all', weight: 0.4 },
    { keyword: 'system', weight: 0.5 },
    { keyword: 'multiple', weight: 0.6 },
    { keyword: 'extensive', weight: 0.8 },
    { keyword: 'comprehensive', weight: 0.7 },
    { keyword: 'redesign', weight: 0.9 },
    { keyword: 'across', weight: 0.5 },
    { keyword: 'everything', weight: 0.5 },
    { keyword: 'full', weight: 0.4 },
    { keyword: 'major', weight: 0.7 },
    { keyword: 'complete', weight: 0.5 },
  ],
} as const;

/**
 * Research/learning task types that default to simple complexity.
 */
export const SIMPLE_DEFAULT_TYPES = new Set<string>([
  TaskType.Research,
  TaskType.Learning,
  TaskType.Exploration,
]);

/**
 * Default classification returned when analyzer fails or no keywords match.
 */
export const DEFAULT_CLASSIFICATION = {
  type: TaskType.Unknown,
  domain: 'general',
  complexity: Complexity.Medium,
  confidence: 0,
} as const;
