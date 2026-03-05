/**
 * Type guard validators for store files.
 * Guards are lenient — check shape, not every nested field (fail-open philosophy).
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

function isObject(data: unknown): data is Record<string, unknown> {
  return typeof data === 'object' && data !== null && !Array.isArray(data);
}

export function isConfig(data: unknown): data is Config {
  if (!isObject(data)) return false;
  return (
    typeof data.schemaVersion === 'string' &&
    typeof data.projectName === 'string' &&
    typeof data.tokenBudget === 'number' &&
    typeof data.windowDurationMs === 'number' &&
    isObject(data.budgetWarnings) &&
    typeof data.createdAt === 'string'
  );
}

export function isProjectMap(data: unknown): data is ProjectMap {
  if (!isObject(data)) return false;
  return (
    typeof data.schemaVersion === 'string' &&
    typeof data.totalFiles === 'number' &&
    isObject(data.files) &&
    isObject(data.domains)
  );
}

export function isDependencyGraph(data: unknown): data is DependencyGraph {
  if (!isObject(data)) return false;
  return (
    typeof data.schemaVersion === 'string' &&
    Array.isArray(data.edges) &&
    isObject(data.adjacency)
  );
}

export function isTaskHistory(data: unknown): data is TaskHistory {
  if (!isObject(data)) return false;
  return (
    typeof data.schemaVersion === 'string' &&
    typeof data.cap === 'number' &&
    typeof data.count === 'number' &&
    Array.isArray(data.tasks)
  );
}

export function isPatterns(data: unknown): data is Patterns {
  if (!isObject(data)) return false;
  return (
    typeof data.schemaVersion === 'string' &&
    Array.isArray(data.coOccurrences) &&
    isObject(data.typeAffinities) &&
    Array.isArray(data.conventions)
  );
}

export function isMetrics(data: unknown): data is Metrics {
  if (!isObject(data)) return false;
  return (
    typeof data.schemaVersion === 'string' &&
    isObject(data.overall) &&
    isObject(data.perDomain) &&
    Array.isArray(data.windows)
  );
}

export function isKeywordIndex(data: unknown): data is KeywordIndex {
  if (!isObject(data)) return false;
  return (
    typeof data.schemaVersion === 'string' &&
    isObject(data.keywordToFiles) &&
    isObject(data.fileToKeywords)
  );
}

export function isDoctorLog(data: unknown): data is DoctorLog {
  if (!isObject(data)) return false;
  return (
    typeof data.schemaVersion === 'string' &&
    Array.isArray(data.entries)
  );
}
