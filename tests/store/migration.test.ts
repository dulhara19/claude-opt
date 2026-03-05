import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { createTempProjectRoot, cleanupTempProjectRoot } from '../helpers/test-store.js';
import {
  initializeStore,
  checkSchemaVersion,
  runMigrations,
  readSchemaVersion,
  writeSchemaVersion,
  readConfig,
} from '../../src/store/index.js';

let projectRoot: string;

beforeEach(() => {
  projectRoot = createTempProjectRoot();
  initializeStore(projectRoot);
});

afterEach(() => {
  cleanupTempProjectRoot(projectRoot);
});

describe('checkSchemaVersion', () => {
  it('reports no migration needed for current version', () => {
    const result = checkSchemaVersion(projectRoot);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.needsMigration).toBe(false);
      expect(result.value.current).toBe(result.value.expected);
    }
  });

  it('detects version mismatch', () => {
    writeSchemaVersion(projectRoot, '0.9.0');
    const result = checkSchemaVersion(projectRoot);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.needsMigration).toBe(true);
      expect(result.value.current).toBe('0.9.0');
    }
  });

  it('handles missing .schema-version file', () => {
    const versionPath = path.join(projectRoot, '.claude-opt', '.schema-version');
    if (existsSync(versionPath)) unlinkSync(versionPath);

    const result = checkSchemaVersion(projectRoot);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.needsMigration).toBe(true);
      expect(result.value.current).toBe('0.0.0');
    }
  });
});

describe('runMigrations', () => {
  it('updates .schema-version after running', () => {
    writeSchemaVersion(projectRoot, '0.9.0');
    const result = runMigrations(projectRoot, '0.9.0', '1.0.0');
    expect(result.ok).toBe(true);

    const version = readSchemaVersion(projectRoot);
    expect(version.ok).toBe(true);
    if (version.ok) {
      expect(version.value).toBe('1.0.0');
    }
  });

  it('is non-destructive (no data lost)', () => {
    const beforeResult = readConfig(projectRoot);
    expect(beforeResult.ok).toBe(true);

    writeSchemaVersion(projectRoot, '0.9.0');
    runMigrations(projectRoot, '0.9.0', '1.0.0');

    const afterResult = readConfig(projectRoot);
    expect(afterResult.ok).toBe(true);
    if (beforeResult.ok && afterResult.ok) {
      expect(afterResult.value.projectName).toBe(beforeResult.value.projectName);
    }
  });
});
