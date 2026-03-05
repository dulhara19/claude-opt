/**
 * Store-internal types for file paths and write options.
 */

/** Options for atomic write operations. */
export interface WriteOptions {
  indent?: number;
}

/** Store file metadata. */
export interface StoreFileInfo {
  fileName: string;
  filePath: string;
  exists: boolean;
}

/** Migration function signature. */
export type MigrationFn = (projectRoot: string) => import('../types/index.js').Result<void>;
