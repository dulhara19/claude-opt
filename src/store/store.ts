/**
 * Core store I/O — atomic writes, JSON reads, store initialization.
 */

import { mkdirSync, writeFileSync, readFileSync, renameSync, existsSync } from 'node:fs';
import path from 'node:path';
import type { Result, TaskHistory } from '../types/index.js';
import { ok, err, toOS, STORE_DIR, STORE_FILES, SCHEMA_VERSION, MAX_HISTORY_CAP, logger } from '../utils/index.js';
import { createDefaultConfig, createDefaultProjectMap, createDefaultDependencyGraph, createDefaultTaskHistory, createDefaultPatterns, createDefaultMetrics, createDefaultKeywordIndex, createDefaultDoctorLog } from './defaults.js';

/**
 * Resolve the store directory path for a project.
 */
export function resolveStorePath(projectRoot: string): string {
  return path.join(toOS(projectRoot), STORE_DIR);
}

/**
 * Resolve the full path to a specific store file.
 */
export function resolveFilePath(projectRoot: string, fileName: string): string {
  return path.join(resolveStorePath(projectRoot), fileName);
}

/**
 * Ensure the store directory and archive subdirectory exist.
 */
export function ensureStoreDir(projectRoot: string): Result<void> {
  try {
    const storePath = resolveStorePath(projectRoot);
    mkdirSync(storePath, { recursive: true });
    mkdirSync(path.join(storePath, 'archive'), { recursive: true });
    return ok(undefined);
  } catch (error) {
    return err(`Failed to create store directory: ${String(error)}`);
  }
}

/**
 * Atomic write: write to .tmp file then rename.
 * JSON is formatted with 2-space indentation for human readability.
 */
export function atomicWrite(filePath: string, data: unknown): Result<void> {
  try {
    const json = JSON.stringify(data, null, 2) + '\n';
    const tmpPath = filePath + '.tmp';
    writeFileSync(tmpPath, json, 'utf-8');
    renameSync(tmpPath, filePath);
    return ok(undefined);
  } catch (error) {
    return err(`Failed to write ${filePath}: ${String(error)}`);
  }
}

/**
 * Read and parse a JSON file.
 */
export function readJSON<T>(filePath: string): Result<T> {
  try {
    if (!existsSync(filePath)) {
      return err(`File not found: ${filePath}`);
    }
    const raw = readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw) as T;
    return ok(data);
  } catch (error) {
    return err(`Failed to read ${filePath}: ${String(error)}`);
  }
}

/**
 * Write a plain text file atomically.
 */
export function atomicWriteText(filePath: string, content: string): Result<void> {
  try {
    const tmpPath = filePath + '.tmp';
    writeFileSync(tmpPath, content, 'utf-8');
    renameSync(tmpPath, filePath);
    return ok(undefined);
  } catch (error) {
    return err(`Failed to write ${filePath}: ${String(error)}`);
  }
}

/**
 * Read a plain text file.
 */
export function readText(filePath: string): Result<string> {
  try {
    if (!existsSync(filePath)) {
      return err(`File not found: ${filePath}`);
    }
    return ok(readFileSync(filePath, 'utf-8').trim());
  } catch (error) {
    return err(`Failed to read ${filePath}: ${String(error)}`);
  }
}

/**
 * Initialize a new store: create directory, write all default files and .schema-version.
 */
export function initializeStore(projectRoot: string): Result<void> {
  const dirResult = ensureStoreDir(projectRoot);
  if (!dirResult.ok) return dirResult;

  const projectName = path.basename(toOS(projectRoot));

  const defaults: [string, unknown][] = [
    [STORE_FILES.config, createDefaultConfig(projectName)],
    [STORE_FILES.projectMap, createDefaultProjectMap()],
    [STORE_FILES.dependencyGraph, createDefaultDependencyGraph()],
    [STORE_FILES.taskHistory, createDefaultTaskHistory()],
    [STORE_FILES.patterns, createDefaultPatterns()],
    [STORE_FILES.metrics, createDefaultMetrics()],
    [STORE_FILES.keywordIndex, createDefaultKeywordIndex()],
    [STORE_FILES.doctorLog, createDefaultDoctorLog()],
  ];

  for (const [fileName, data] of defaults) {
    const filePath = resolveFilePath(projectRoot, fileName);
    const writeResult = atomicWrite(filePath, data);
    if (!writeResult.ok) {
      logger.error('store', `Failed to write default ${fileName}`, writeResult.error);
      return writeResult;
    }
  }

  // Write .schema-version as plain text (semver format)
  const versionPath = resolveFilePath(projectRoot, '.schema-version');
  const versionResult = atomicWriteText(versionPath, SCHEMA_VERSION + '.0.0');
  if (!versionResult.ok) return versionResult;

  logger.info('store', `Initialized store at ${resolveStorePath(projectRoot)}`);
  return ok(undefined);
}

/**
 * Archive old task history entries when cap is exceeded.
 * Moves oldest entries beyond MAX_HISTORY_CAP to archive/task-history-{YYYY-MM-DD}.json.
 */
export function archiveOldTasks(projectRoot: string, history: TaskHistory): Result<TaskHistory> {
  if (history.tasks.length <= MAX_HISTORY_CAP) {
    return ok(history);
  }

  const excess = history.tasks.length - MAX_HISTORY_CAP;
  const toArchive = history.tasks.slice(0, excess);
  const remaining = history.tasks.slice(excess);

  const dateStr = new Date().toISOString().slice(0, 10);
  const archivePath = path.join(
    resolveStorePath(projectRoot),
    'archive',
    `task-history-${dateStr}.json`,
  );

  const archiveResult = atomicWrite(archivePath, toArchive);
  if (!archiveResult.ok) return archiveResult;

  const updated: TaskHistory = {
    ...history,
    tasks: remaining,
    count: remaining.length,
    oldestArchive: history.oldestArchive ?? dateStr,
  };

  return ok(updated);
}
