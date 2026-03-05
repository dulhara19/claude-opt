import fs from 'node:fs';
import path from 'node:path';
import { toInternal } from '../utils/index.js';
import type { FileTimestamp } from './types.js';

/**
 * Capture file modification timestamps for all files in a project directory.
 * Used before execution to detect which files change.
 */
export function captureTimestamps(projectRoot: string): FileTimestamp[] {
  const timestamps: FileTimestamp[] = [];
  walkDir(projectRoot, projectRoot, timestamps);
  return timestamps;
}

/**
 * Recursively walk a directory and capture file modification timestamps.
 * Skips node_modules, .git, dist, and hidden directories.
 */
function walkDir(dir: string, projectRoot: string, out: FileTimestamp[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const name = entry.name;
    if (name === 'node_modules' || name === '.git' || name === 'dist' || name === '.claude-opt') {
      continue;
    }
    const fullPath = path.join(dir, name);
    if (entry.isDirectory()) {
      walkDir(fullPath, projectRoot, out);
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
export function detectModifiedFiles(before: FileTimestamp[], projectRoot: string): string[] {
  const beforeMap = new Map<string, number>();
  for (const ts of before) {
    beforeMap.set(ts.filePath, ts.modifiedAt);
  }

  const after = captureTimestamps(projectRoot);
  const modified: string[] = [];

  for (const ts of after) {
    const prevTime = beforeMap.get(ts.filePath);
    if (prevTime === undefined || ts.modifiedAt > prevTime) {
      modified.push(ts.filePath);
    }
  }

  return modified;
}

/**
 * Parse file path references from Claude Code's stdout output.
 * Detects both relative (src/foo/bar.ts) and absolute paths within the project.
 */
export function parseFilePaths(output: string, projectRoot: string): string[] {
  const found = new Set<string>();
  const normalizedRoot = toInternal(path.resolve(projectRoot));

  // Match file paths: word chars, slashes, dots, hyphens — ending with a file extension
  const pathRegex = /(?:^|[\s"'`([\]])([a-zA-Z][\w./\\-]*\.[a-zA-Z]{1,10})/gm;
  let match: RegExpExecArray | null;

  while ((match = pathRegex.exec(output)) !== null) {
    let candidate = match[1];
    if (!candidate) continue;

    // Normalize to POSIX
    candidate = toInternal(candidate);

    // Skip URLs and common non-file patterns
    if (candidate.includes('://') || candidate.startsWith('http') || candidate.includes('@')) {
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

    // Handle relative paths
    const fullPath = path.join(projectRoot, path.normalize(candidate));
    if (existsSync(fullPath)) {
      found.add(candidate);
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
 * Combine timestamp comparison and stdout parsing for comprehensive file detection.
 * Returns deduplicated list of files in POSIX format.
 */
export function detectFilesUsed(
  beforeTimestamps: FileTimestamp[],
  output: string,
  projectRoot: string,
): string[] {
  const fromTimestamps = detectModifiedFiles(beforeTimestamps, projectRoot);
  const fromStdout = parseFilePaths(output, projectRoot);

  const combined = new Set<string>([...fromTimestamps, ...fromStdout]);
  return [...combined].sort();
}
