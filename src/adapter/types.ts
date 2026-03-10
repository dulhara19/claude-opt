/**
 * Result from Claude Code adapter execution.
 */
export interface AdapterResult {
  /** Claude Code's response output */
  output: string;
  /** Detected files Claude read/modified (POSIX paths) */
  filesUsed: string[];
  /** Claude Code's exit code (10 = fallback) */
  exitCode: number;
  /** Estimated tokens consumed */
  tokenEstimate: number;
  /** Whether fallback execution was used */
  isFallback: boolean;
  /** Total execution duration in milliseconds */
  durationMs: number;
  /** AD4: Whether output was truncated due to size cap */
  truncated?: boolean;
  /** AD13: Categorized error reason when execution fails */
  errorReason?: 'timeout' | 'cli_not_found' | 'rate_limit' | 'subprocess_error' | 'unknown';
}

/**
 * Options for spawning Claude Code subprocess.
 */
export interface SpawnOptions {
  /** The prompt to send to Claude Code */
  prompt: string;
  /** Working directory for subprocess */
  cwd: string;
  /** Model tier to use (optional, from router) */
  model?: string;
  /** Path to CLAUDE.md file (optional override) */
  claudeMdPath?: string;
  /** Subprocess timeout in milliseconds */
  timeout?: number;
}

/**
 * Information about the installed Claude Code CLI.
 */
export interface ClaudeCodeInfo {
  /** Claude Code version string */
  version: string;
  /** Path to claude binary */
  path: string;
  /** Whether Claude Code is available */
  isAvailable: boolean;
}

/**
 * File timestamp for before/after comparison.
 */
export interface FileTimestamp {
  /** File path (relative to project root) */
  filePath: string;
  /** Last modification time in ms since epoch */
  modifiedAt: number;
}

/** Exit code indicating optimizer fallback mode was used */
export const FALLBACK_EXIT_CODE = 10;

/** Backup filename for original CLAUDE.md */
export const CLAUDE_MD_BACKUP = '.claude-opt-backup-CLAUDE.md';

/** AD2: Model tier → full model ID mapping. */
export const MODEL_ID_MAP: Record<string, string> = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-6',
};

/** AD3: Default subprocess timeout in ms (5 minutes). */
export const DEFAULT_SUBPROCESS_TIMEOUT = 300_000;

/** AD4: Maximum output size in bytes (1MB). */
export const MAX_OUTPUT_SIZE = 1_048_576;

/** AD12: Timestamp tolerance in ms for low-resolution filesystems. */
export const TIMESTAMP_TOLERANCE_MS = 2000;
