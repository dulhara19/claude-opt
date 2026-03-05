import path from 'node:path';

/**
 * Convert an OS-native path to internal POSIX format.
 * All internal data structures store POSIX-format paths.
 */
export function toInternal(osPath: string): string {
  if (!osPath) return '';
  return osPath.replace(/\\/g, '/');
}

/**
 * Convert a POSIX path to the platform-native format.
 */
export function toOS(posixPath: string): string {
  if (!posixPath) return '';
  return posixPath.split('/').join(path.sep);
}

/**
 * Resolve and normalize a path, returning POSIX format.
 */
export function normalizePath(p: string): string {
  const resolved = path.resolve(p);
  return toInternal(resolved);
}
