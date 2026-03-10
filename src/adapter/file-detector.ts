import fs from 'node:fs';
import path from 'node:path';
import { toInternal } from '../utils/index.js';
import { logger } from '../utils/index.js';
import type { FileTimestamp } from './types.js';
import { TIMESTAMP_TOLERANCE_MS } from './types.js';

const MODULE = 'file-detector';

/** AD9: Maximum files to timestamp before falling back to narrow scope. */
const MAX_TIMESTAMP_FILES = 10_000;

/** AD9: Additional directories to skip during timestamp capture. */
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', '.claude-opt',
  'build', 'coverage', '.next', '.cache', 'vendor', '.turbo', '.parcel-cache',
]);

/** AD10: Known false-positive patterns to exclude from path parsing. */
const FALSE_POSITIVE_PATTERNS = [
  /^v\d+\.\d+/,              // version strings: v1.0.0, v2.3.1
  /\.(com|org|io|net|dev|app|co)$/i,  // domain-like: example.com, github.io
  /^node\.js$/i,             // "node.js" as text (not a file)
  /^next\.js$/i,             // "next.js" as text
  /^vue\.js$/i,              // "vue.js" as text
  /^react\.js$/i,            // framework name references
];

/**
 * AD11: Detailed file detection result separating read from modified files.
 */
export interface FileDetectionResult {
  /** Files detected as modified via timestamp comparison */
  modified: string[];
  /** Files referenced in stdout (likely read by Claude) */
  read: string[];
  /** Union of modified + read, deduplicated and sorted */
  all: string[];
}

/**
 * Capture file modification timestamps for all files in a project directory.
 * AD9: Caps at MAX_TIMESTAMP_FILES. If exceeded and predictedDirs provided,
 * narrows scope to those directories only.
 */
export function captureTimestamps(
  projectRoot: string,
  predictedDirs?: Set<string>,
): FileTimestamp[] {
  const timestamps: FileTimestamp[] = [];

  if (predictedDirs && predictedDirs.size > 0) {
    // AD9: Narrow scope — only walk predicted directories
    for (const dir of predictedDirs) {
      const fullDir = path.join(projectRoot, dir);
      if (fs.existsSync(fullDir)) {
        walkDir(fullDir, projectRoot, timestamps, MAX_TIMESTAMP_FILES);
      }
    }
    // Also capture root-level files (not recursive)
    captureRootFiles(projectRoot, timestamps);
  } else {
    walkDir(projectRoot, projectRoot, timestamps, MAX_TIMESTAMP_FILES);
  }

  if (timestamps.length >= MAX_TIMESTAMP_FILES) {
    logger.warn(MODULE, `Timestamp capture capped at ${MAX_TIMESTAMP_FILES} files — consider using predictedDirs for narrower scope`);
  }

  return timestamps;
}

/**
 * AD9: Capture only root-level files (no recursion).
 */
function captureRootFiles(projectRoot: string, out: FileTimestamp[]): void {
  try {
    const entries = fs.readdirSync(projectRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile()) {
        try {
          const fullPath = path.join(projectRoot, entry.name);
          const stat = fs.statSync(fullPath);
          out.push({ filePath: toInternal(entry.name), modifiedAt: stat.mtimeMs });
        } catch {
          // Skip
        }
      }
    }
  } catch {
    // Skip
  }
}

/**
 * AD9: Recursively walk a directory and capture file modification timestamps.
 * Skips known non-project directories. Respects file count cap.
 */
function walkDir(dir: string, projectRoot: string, out: FileTimestamp[], cap: number): void {
  if (out.length >= cap) return;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (out.length >= cap) return;

    const name = entry.name;
    if (SKIP_DIRS.has(name)) {
      continue;
    }
    const fullPath = path.join(dir, name);
    if (entry.isDirectory()) {
      walkDir(fullPath, projectRoot, out, cap);
    } else if (entry.isFile()) {
      try {
        const stat = fs.statSync(fullPath);
        const relative = path.relative(projectRoot, fullPath);
        out.push({ filePath: toInternal(relative), modifiedAt: stat.mtimeMs });
      } catch {
        // Skip files we can't stat
      }
    }
  }
}

/**
 * Compare timestamps before and after execution to detect modified files.
 * Returns POSIX-formatted paths of files that were created or modified.
 */
export function detectModifiedFiles(
  before: FileTimestamp[],
  projectRoot: string,
  predictedDirs?: Set<string>,
): string[] {
  const beforeMap = new Map<string, number>();
  for (const ts of before) {
    beforeMap.set(ts.filePath, ts.modifiedAt);
  }

  const after = captureTimestamps(projectRoot, predictedDirs);
  const modified: string[] = [];

  for (const ts of after) {
    const prevTime = beforeMap.get(ts.filePath);
    if (prevTime === undefined) {
      // New file — always count as modified
      modified.push(ts.filePath);
    } else if (ts.modifiedAt > prevTime + TIMESTAMP_TOLERANCE_MS) {
      // AD12: Only count as modified if timestamp exceeds tolerance
      modified.push(ts.filePath);
    }
  }

  return modified;
}

/**
 * AD10: Check if a candidate path is a known false positive.
 */
function isFalsePositive(candidate: string): boolean {
  const basename = candidate.split('/').pop() ?? candidate;
  return FALSE_POSITIVE_PATTERNS.some(p => p.test(basename));
}

/**
 * AD10: Parse file path references from Claude Code's stdout output.
 * Improved regex handling: supports ./-prefixed paths, @scoped packages,
 * and filters known false positives.
 */
export function parseFilePaths(output: string, projectRoot: string): string[] {
  const found = new Set<string>();
  const normalizedRoot = toInternal(path.resolve(projectRoot));

  // Primary regex: standard paths starting with a letter
  const pathRegex = /(?:^|[\s"'`([\]])([a-zA-Z][\w./\\-]*\.[a-zA-Z]{1,10})/gm;
  // AD10: Secondary regex for ./-prefixed paths
  const dotSlashRegex = /(?:^|[\s"'`([\]])(\.\/[\w./\\-]+\.[a-zA-Z]{1,10})/gm;
  // AD10: Tertiary regex for @scoped packages (e.g., @scope/package/file.ts)
  const scopedRegex = /(?:^|[\s"'`([\]])(@[\w-]+\/[\w./\\-]+\.[a-zA-Z]{1,10})/gm;

  const allRegexes = [pathRegex, dotSlashRegex, scopedRegex];

  for (const regex of allRegexes) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(output)) !== null) {
      let candidate = match[1];
      if (!candidate) continue;

      // Normalize to POSIX
      candidate = toInternal(candidate);

      // Strip leading ./ for consistency
      if (candidate.startsWith('./')) {
        candidate = candidate.slice(2);
      }

      // Skip URLs and common non-file patterns
      if (candidate.includes('://') || candidate.startsWith('http')) {
        continue;
      }

      // AD10: Skip known false positives
      if (isFalsePositive(candidate)) {
        continue;
      }

      // Handle absolute paths within project
      if (candidate.startsWith(normalizedRoot)) {
        const relative = candidate.slice(normalizedRoot.length + 1);
        if (relative) {
          const fullPath = path.join(projectRoot, path.normalize(relative));
          if (existsSync(fullPath)) {
            found.add(relative);
          }
        }
        continue;
      }

      // Handle @ scoped paths — strip the @scope/ prefix for file lookup
      if (candidate.startsWith('@')) {
        // Try as-is first (might be in node_modules or a workspace)
        const fullPath = path.join(projectRoot, path.normalize(candidate));
        if (existsSync(fullPath)) {
          found.add(candidate);
        }
        continue;
      }

      // Handle relative paths
      const fullPath = path.join(projectRoot, path.normalize(candidate));
      if (existsSync(fullPath)) {
        found.add(candidate);
      }
    }
  }

  return [...found];
}

function existsSync(p: string): boolean {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * AD11: Combine timestamp comparison and stdout parsing for comprehensive file detection.
 * Returns a FileDetectionResult with separate read/modified/all lists.
 * Also returns flat string[] via .all for backward compatibility.
 */
export function detectFilesUsed(
  beforeTimestamps: FileTimestamp[],
  output: string,
  projectRoot: string,
  predictedDirs?: Set<string>,
): string[] {
  const fromTimestamps = detectModifiedFiles(beforeTimestamps, projectRoot, predictedDirs);
  const fromStdout = parseFilePaths(output, projectRoot);

  const combined = new Set<string>([...fromTimestamps, ...fromStdout]);
  return [...combined].sort();
}

/**
 * AD11: Enhanced file detection returning detailed result with read/modified distinction.
 */
export function detectFilesUsedDetailed(
  beforeTimestamps: FileTimestamp[],
  output: string,
  projectRoot: string,
  predictedDirs?: Set<string>,
): FileDetectionResult {
  const modified = detectModifiedFiles(beforeTimestamps, projectRoot, predictedDirs);
  const read = parseFilePaths(output, projectRoot);

  const combined = new Set<string>([...modified, ...read]);
  return {
    modified,
    read,
    all: [...combined].sort(),
  };
}
