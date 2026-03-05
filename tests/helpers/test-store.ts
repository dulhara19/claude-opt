/**
 * Test helper for creating temporary store directories.
 */

import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * Create a temporary directory for store tests.
 * Returns the path to the temp project root.
 */
export function createTempProjectRoot(): string {
  const tmpDir = path.join(os.tmpdir(), `claude-opt-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(tmpDir, { recursive: true });
  return tmpDir;
}

/**
 * Clean up a temporary project root directory.
 */
export function cleanupTempProjectRoot(projectRoot: string): void {
  try {
    rmSync(projectRoot, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors in tests
  }
}
