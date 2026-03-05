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
