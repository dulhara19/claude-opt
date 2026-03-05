/**
 * Default data factories for each store file.
 */

import type {
  Config,
  ProjectMap,
  DependencyGraph,
  TaskHistory,
  Patterns,
  Metrics,
  KeywordIndex,
  DoctorLog,
} from '../types/index.js';
import { SCHEMA_VERSION, DEFAULT_BUDGET, DEFAULT_WINDOW_DURATION, DOCTOR_ACCURACY_THRESHOLD, MAX_HISTORY_CAP } from '../utils/index.js';

const VERSION = String(SCHEMA_VERSION) + '.0.0';

function nowISO(): string {
  return new Date().toISOString();
}

export function createDefaultConfig(projectName: string): Config {
  const now = nowISO();
  return {
    schemaVersion: VERSION,
    projectName,
    projectType: 'code',
    tokenBudget: DEFAULT_BUDGET,
    windowDurationMs: DEFAULT_WINDOW_DURATION,
    budgetWarnings: { inline: 0.75, blocking: 0.90 },
    doctorMode: 'supervised',
    doctorThreshold: DOCTOR_ACCURACY_THRESHOLD,
    taskHistoryCap: MAX_HISTORY_CAP,
    createdAt: now,
    updatedAt: now,
  };
}

export function createDefaultProjectMap(): ProjectMap {
  return {
    schemaVersion: VERSION,
    scannedAt: nowISO(),
    scanType: 'full',
    projectType: 'code',
    totalFiles: 0,
    files: {},
    domains: {},
    ignoredPatterns: [],
  };
}

export function createDefaultDependencyGraph(): DependencyGraph {
  return {
    schemaVersion: VERSION,
    updatedAt: nowISO(),
    edges: [],
    adjacency: {},
  };
}

export function createDefaultTaskHistory(): TaskHistory {
  return {
    schemaVersion: VERSION,
    cap: MAX_HISTORY_CAP,
    count: 0,
    oldestArchive: null,
    tasks: [],
  };
}

export function createDefaultPatterns(): Patterns {
  return {
    schemaVersion: VERSION,
    coOccurrences: [],
    typeAffinities: {},
    conventions: [],
  };
}

export function createDefaultMetrics(): Metrics {
  return {
    schemaVersion: VERSION,
    overall: {
      totalTasks: 0,
      totalSessions: 0,
      avgPrecision: 0,
      avgRecall: 0,
      totalTokensConsumed: 0,
      totalTokensSaved: 0,
      savingsRate: 0,
    },
    perDomain: {},
    windows: [],
    predictionTrend: [],
  };
}

export function createDefaultKeywordIndex(): KeywordIndex {
  return {
    schemaVersion: VERSION,
    updatedAt: nowISO(),
    keywordToFiles: {},
    fileToKeywords: {},
  };
}

export function createDefaultDoctorLog(): DoctorLog {
  return {
    schemaVersion: VERSION,
    entries: [],
  };
}
