/**
 * Schema migration runner — sequential, non-destructive migrations.
 */

import type { Result } from '../types/index.js';
import { ok, err, SCHEMA_VERSION, logger } from '../utils/index.js';
import { resolveFilePath, readText, atomicWriteText } from './store.js';
import type { MigrationFn } from './types.js';

const CURRENT_VERSION = String(SCHEMA_VERSION) + '.0.0';

/**
 * Migration registry: maps "fromVersion" to the migration that upgrades it.
 * Migrations run sequentially: 1.0.0 -> 1.1.0 -> 1.2.0 etc.
 * For v1.0.0 (initial), no migrations are needed — just infrastructure.
 */
const migrations = new Map<string, { toVersion: string; migrate: MigrationFn }>();

// Future migrations would be registered here, e.g.:
// migrations.set('1.0.0', {
//   toVersion: '1.1.0',
//   migrate: (projectRoot) => { /* add new fields with defaults */ return ok(undefined); }
// });

/**
 * Check the current schema version against the expected version.
 */
export function checkSchemaVersion(
  projectRoot: string,
): Result<{ current: string; expected: string; needsMigration: boolean }> {
  const versionPath = resolveFilePath(projectRoot, '.schema-version');
  const readResult = readText(versionPath);

  if (!readResult.ok) {
    return ok({ current: '0.0.0', expected: CURRENT_VERSION, needsMigration: true });
  }

  const current = readResult.value;
  return ok({
    current,
    expected: CURRENT_VERSION,
    needsMigration: current !== CURRENT_VERSION,
  });
}

/**
 * Run sequential migrations from fromVersion to toVersion.
 * Each migration is non-destructive: adds fields with defaults, never removes fields.
 */
export function runMigrations(
  projectRoot: string,
  fromVersion: string,
  toVersion: string,
): Result<void> {
  let currentVersion = fromVersion;

  while (currentVersion !== toVersion) {
    const migration = migrations.get(currentVersion);
    if (!migration) {
      // No migration path from this version — jump to target
      logger.info('migration', `No migration from ${currentVersion}, setting to ${toVersion}`);
      break;
    }

    logger.info('migration', `Migrating ${currentVersion} → ${migration.toVersion}`);
    const result = migration.migrate(projectRoot);
    if (!result.ok) {
      return err(`Migration ${currentVersion} → ${migration.toVersion} failed: ${result.error}`);
    }
    currentVersion = migration.toVersion;
  }

  // Update .schema-version file
  const versionPath = resolveFilePath(projectRoot, '.schema-version');
  const writeResult = atomicWriteText(versionPath, toVersion);
  if (!writeResult.ok) return writeResult;

  logger.info('migration', `Schema version updated to ${toVersion}`);
  return ok(undefined);
}
