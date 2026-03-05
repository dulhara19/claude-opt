import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, writeFileSync as fsWriteFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { createTempProjectRoot, cleanupTempProjectRoot } from '../helpers/test-store.js';
import {
  ensureStoreDir,
  initializeStore,
  resolveStorePath,
  resolveFilePath,
  archiveOldTasks,
  readConfig,
  writeConfig,
  readSchemaVersion,
  createDefaultConfig,
  createDefaultTaskHistory,
} from '../../src/store/index.js';
import { atomicWrite, readJSON } from '../../src/store/store.js';
import { STORE_DIR, STORE_FILES } from '../../src/utils/index.js';

let projectRoot: string;

beforeEach(() => {
  projectRoot = createTempProjectRoot();
});

afterEach(() => {
  cleanupTempProjectRoot(projectRoot);
});

describe('ensureStoreDir', () => {
  it('creates .claude-opt/ and archive/ directories', () => {
    const result = ensureStoreDir(projectRoot);
    expect(result.ok).toBe(true);
    expect(existsSync(path.join(projectRoot, STORE_DIR))).toBe(true);
    expect(existsSync(path.join(projectRoot, STORE_DIR, 'archive'))).toBe(true);
  });
});

describe('atomicWrite', () => {
  it('writes valid JSON with 2-space indent', () => {
    ensureStoreDir(projectRoot);
    const filePath = resolveFilePath(projectRoot, 'test.json');
    const data = { hello: 'world', nested: { a: 1 } };
    const result = atomicWrite(filePath, data);
    expect(result.ok).toBe(true);

    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('  "hello": "world"');
    expect(JSON.parse(content)).toEqual(data);
  });

  it('creates .tmp file then renames (atomic)', () => {
    ensureStoreDir(projectRoot);
    const filePath = resolveFilePath(projectRoot, 'atomic.json');
    const result = atomicWrite(filePath, { test: true });
    expect(result.ok).toBe(true);
    // .tmp should not exist after successful write
    expect(existsSync(filePath + '.tmp')).toBe(false);
    expect(existsSync(filePath)).toBe(true);
  });
});

describe('readJSON', () => {
  it('returns ok Result for valid JSON', () => {
    ensureStoreDir(projectRoot);
    const filePath = resolveFilePath(projectRoot, 'valid.json');
    atomicWrite(filePath, { key: 'value' });
    const result = readJSON<{ key: string }>(filePath);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.key).toBe('value');
    }
  });

  it('returns err Result for missing file', () => {
    const result = readJSON(resolveFilePath(projectRoot, 'missing.json'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('File not found');
    }
  });

  it('returns err Result for invalid JSON', () => {
    ensureStoreDir(projectRoot);
    const filePath = resolveFilePath(projectRoot, 'bad.json');
    fsWriteFileSync(filePath, 'not json {{{', 'utf-8');
    const result = readJSON(filePath);
    expect(result.ok).toBe(false);
  });
});

describe('initializeStore', () => {
  it('creates all 9 files + .schema-version', () => {
    const result = initializeStore(projectRoot);
    expect(result.ok).toBe(true);

    const storeFiles = [
      ...Object.values(STORE_FILES),
      '.schema-version',
    ];

    for (const file of storeFiles) {
      const filePath = resolveFilePath(projectRoot, file);
      expect(existsSync(filePath), `Expected ${file} to exist`).toBe(true);
    }
  });
});

describe('per-project isolation', () => {
  it('creates separate stores for different projects', () => {
    const project2 = createTempProjectRoot();
    try {
      initializeStore(projectRoot);
      initializeStore(project2);

      const config1 = readConfig(projectRoot);
      const config2 = readConfig(project2);

      expect(config1.ok).toBe(true);
      expect(config2.ok).toBe(true);

      if (config1.ok && config2.ok) {
        expect(config1.value.projectName).not.toBe(config2.value.projectName);
      }
    } finally {
      cleanupTempProjectRoot(project2);
    }
  });
});

describe('typed accessors', () => {
  beforeEach(() => {
    initializeStore(projectRoot);
  });

  it('readConfig returns valid Config', () => {
    const result = readConfig(projectRoot);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.schemaVersion).toBe('1.0.0');
      expect(result.value.tokenBudget).toBe(44000);
    }
  });

  it('writeConfig then readConfig round-trips', () => {
    const config = createDefaultConfig('roundtrip-test');
    config.tokenBudget = 99999;
    const writeResult = writeConfig(projectRoot, config);
    expect(writeResult.ok).toBe(true);

    const readResult = readConfig(projectRoot);
    expect(readResult.ok).toBe(true);
    if (readResult.ok) {
      expect(readResult.value.tokenBudget).toBe(99999);
    }
  });

  it('readSchemaVersion returns version string', () => {
    const result = readSchemaVersion(projectRoot);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe('1.0.0');
    }
  });
});

describe('archiveOldTasks', () => {
  beforeEach(() => {
    initializeStore(projectRoot);
  });

  it('does nothing when under cap', () => {
    const history = createDefaultTaskHistory();
    history.tasks = [{ id: '1', timestamp: '', taskText: 'test', classification: { taskType: 'Feature', complexity: 'Low', confidence: 0.5 }, prediction: { predictedFiles: [], actualFiles: [], precision: 0, recall: 0 }, routing: { model: 'sonnet', reason: '' }, tokens: { consumed: 0, budgeted: 0, saved: 0 }, feedback: null }];
    history.count = 1;

    const result = archiveOldTasks(projectRoot, history);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tasks.length).toBe(1);
    }
  });

  it('archives excess entries when over cap', () => {
    const history = createDefaultTaskHistory();
    history.cap = 500;
    // Create 502 entries
    for (let i = 0; i < 502; i++) {
      history.tasks.push({
        id: `task-${i}`,
        timestamp: new Date(Date.now() + i * 1000).toISOString(),
        taskText: `task ${i}`,
        classification: { taskType: 'Feature', complexity: 'Low', confidence: 0.5 },
        prediction: { predictedFiles: [], actualFiles: [], precision: 0, recall: 0 },
        routing: { model: 'sonnet', reason: '' },
        tokens: { consumed: 100, budgeted: 44000, saved: 0 },
        feedback: null,
      });
    }
    history.count = 502;

    const result = archiveOldTasks(projectRoot, history);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tasks.length).toBe(500);
      expect(result.value.count).toBe(500);
      expect(result.value.oldestArchive).toBeTruthy();
    }

    // Archive file should exist
    const archiveDir = path.join(resolveStorePath(projectRoot), 'archive');
    const files = readdirSync(archiveDir);
    const archiveFiles = files.filter((f) => f.startsWith('task-history-'));
    expect(archiveFiles.length).toBeGreaterThan(0);
  });
});

describe('performance', () => {
  it('read/write cycle completes in <50ms', () => {
    initializeStore(projectRoot);
    const start = performance.now();
    const config = readConfig(projectRoot);
    if (config.ok) {
      writeConfig(projectRoot, config.value);
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
  });
});
