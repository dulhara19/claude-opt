/**
 * Store module public API — typed read/write accessors for all store files.
 */

import type {
  Result,
  Config,
  ProjectMap,
  DependencyGraph,
  TaskHistory,
  Patterns,
  Metrics,
  KeywordIndex,
  DoctorLog,
} from '../types/index.js';
import { ok, err, STORE_FILES } from '../utils/index.js';
import { resolveFilePath, readJSON, atomicWrite, readText, atomicWriteText } from './store.js';
import {
  isConfig,
  isProjectMap,
  isDependencyGraph,
  isTaskHistory,
  isPatterns,
  isMetrics,
  isKeywordIndex,
  isDoctorLog,
} from './validators.js';

// ─── Read-only accessors (available to all modules) ────────────

export function readConfig(projectRoot: string): Result<Config> {
  const filePath = resolveFilePath(projectRoot, STORE_FILES.config);
  const raw = readJSON<unknown>(filePath);
  if (!raw.ok) return raw;
  if (!isConfig(raw.value)) return err('Invalid config.json format');
  return ok(raw.value);
}

export function readProjectMap(projectRoot: string): Result<ProjectMap> {
  const filePath = resolveFilePath(projectRoot, STORE_FILES.projectMap);
  const raw = readJSON<unknown>(filePath);
  if (!raw.ok) return raw;
  if (!isProjectMap(raw.value)) return err('Invalid project-map.json format');
  return ok(raw.value);
}

export function readDependencyGraph(projectRoot: string): Result<DependencyGraph> {
  const filePath = resolveFilePath(projectRoot, STORE_FILES.dependencyGraph);
  const raw = readJSON<unknown>(filePath);
  if (!raw.ok) return raw;
  if (!isDependencyGraph(raw.value)) return err('Invalid dependency-graph.json format');
  return ok(raw.value);
}

export function readTaskHistory(projectRoot: string): Result<TaskHistory> {
  const filePath = resolveFilePath(projectRoot, STORE_FILES.taskHistory);
  const raw = readJSON<unknown>(filePath);
  if (!raw.ok) return raw;
  if (!isTaskHistory(raw.value)) return err('Invalid task-history.json format');
  return ok(raw.value);
}

export function readPatterns(projectRoot: string): Result<Patterns> {
  const filePath = resolveFilePath(projectRoot, STORE_FILES.patterns);
  const raw = readJSON<unknown>(filePath);
  if (!raw.ok) return raw;
  if (!isPatterns(raw.value)) return err('Invalid patterns.json format');
  return ok(raw.value);
}

export function readMetrics(projectRoot: string): Result<Metrics> {
  const filePath = resolveFilePath(projectRoot, STORE_FILES.metrics);
  const raw = readJSON<unknown>(filePath);
  if (!raw.ok) return raw;
  if (!isMetrics(raw.value)) return err('Invalid metrics.json format');
  return ok(raw.value);
}

export function readKeywordIndex(projectRoot: string): Result<KeywordIndex> {
  const filePath = resolveFilePath(projectRoot, STORE_FILES.keywordIndex);
  const raw = readJSON<unknown>(filePath);
  if (!raw.ok) return raw;
  if (!isKeywordIndex(raw.value)) return err('Invalid keyword-index.json format');
  return ok(raw.value);
}

export function readDoctorLog(projectRoot: string): Result<DoctorLog> {
  const filePath = resolveFilePath(projectRoot, STORE_FILES.doctorLog);
  const raw = readJSON<unknown>(filePath);
  if (!raw.ok) return raw;
  if (!isDoctorLog(raw.value)) return err('Invalid doctor-log.json format');
  return ok(raw.value);
}

export function readSchemaVersion(projectRoot: string): Result<string> {
  const filePath = resolveFilePath(projectRoot, '.schema-version');
  return readText(filePath);
}

// ─── Write accessors (restricted to learner, tracker, doctor, scanner) ─

export function writeConfig(projectRoot: string, data: Config): Result<void> {
  if (!isConfig(data)) return err('Invalid Config data');
  return atomicWrite(resolveFilePath(projectRoot, STORE_FILES.config), data);
}

export function writeProjectMap(projectRoot: string, data: ProjectMap): Result<void> {
  if (!isProjectMap(data)) return err('Invalid ProjectMap data');
  return atomicWrite(resolveFilePath(projectRoot, STORE_FILES.projectMap), data);
}

export function writeDependencyGraph(projectRoot: string, data: DependencyGraph): Result<void> {
  if (!isDependencyGraph(data)) return err('Invalid DependencyGraph data');
  return atomicWrite(resolveFilePath(projectRoot, STORE_FILES.dependencyGraph), data);
}

export function writeTaskHistory(projectRoot: string, data: TaskHistory): Result<void> {
  if (!isTaskHistory(data)) return err('Invalid TaskHistory data');
  return atomicWrite(resolveFilePath(projectRoot, STORE_FILES.taskHistory), data);
}

export function writePatterns(projectRoot: string, data: Patterns): Result<void> {
  if (!isPatterns(data)) return err('Invalid Patterns data');
  return atomicWrite(resolveFilePath(projectRoot, STORE_FILES.patterns), data);
}

export function writeMetrics(projectRoot: string, data: Metrics): Result<void> {
  if (!isMetrics(data)) return err('Invalid Metrics data');
  return atomicWrite(resolveFilePath(projectRoot, STORE_FILES.metrics), data);
}

export function writeKeywordIndex(projectRoot: string, data: KeywordIndex): Result<void> {
  if (!isKeywordIndex(data)) return err('Invalid KeywordIndex data');
  return atomicWrite(resolveFilePath(projectRoot, STORE_FILES.keywordIndex), data);
}

export function writeDoctorLog(projectRoot: string, data: DoctorLog): Result<void> {
  if (!isDoctorLog(data)) return err('Invalid DoctorLog data');
  return atomicWrite(resolveFilePath(projectRoot, STORE_FILES.doctorLog), data);
}

export function writeSchemaVersion(projectRoot: string, version: string): Result<void> {
  return atomicWriteText(resolveFilePath(projectRoot, '.schema-version'), version);
}

// ─── Module access enforcement types ───────────────────────────

export interface StoreReader {
  readConfig: (projectRoot: string) => Result<Config>;
  readProjectMap: (projectRoot: string) => Result<ProjectMap>;
  readDependencyGraph: (projectRoot: string) => Result<DependencyGraph>;
  readTaskHistory: (projectRoot: string) => Result<TaskHistory>;
  readPatterns: (projectRoot: string) => Result<Patterns>;
  readMetrics: (projectRoot: string) => Result<Metrics>;
  readKeywordIndex: (projectRoot: string) => Result<KeywordIndex>;
  readDoctorLog: (projectRoot: string) => Result<DoctorLog>;
}

export interface StoreWriter extends StoreReader {
  writeConfig: (projectRoot: string, data: Config) => Result<void>;
  writeProjectMap: (projectRoot: string, data: ProjectMap) => Result<void>;
  writeDependencyGraph: (projectRoot: string, data: DependencyGraph) => Result<void>;
  writeTaskHistory: (projectRoot: string, data: TaskHistory) => Result<void>;
  writePatterns: (projectRoot: string, data: Patterns) => Result<void>;
  writeMetrics: (projectRoot: string, data: Metrics) => Result<void>;
  writeKeywordIndex: (projectRoot: string, data: KeywordIndex) => Result<void>;
  writeDoctorLog: (projectRoot: string, data: DoctorLog) => Result<void>;
}

// ─── Re-exports ────────────────────────────────────────────────

export { initializeStore, ensureStoreDir, resolveStorePath, resolveFilePath, archiveOldTasks, readJSON } from './store.js';
export { checkSchemaVersion, runMigrations } from './migration.js';
export {
  isConfig,
  isProjectMap,
  isDependencyGraph,
  isTaskHistory,
  isPatterns,
  isMetrics,
  isKeywordIndex,
  isDoctorLog,
} from './validators.js';
export {
  createDefaultConfig,
  createDefaultProjectMap,
  createDefaultDependencyGraph,
  createDefaultTaskHistory,
  createDefaultPatterns,
  createDefaultMetrics,
  createDefaultKeywordIndex,
  createDefaultDoctorLog,
} from './defaults.js';
