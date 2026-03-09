/**
 * MCP shared helpers — context builders and formatters.
 */

import type { PipelineContext } from '../types/index.js';

/**
 * Resolve the project root from environment or cwd.
 */
export function resolveProjectRoot(): string {
  return process.env.PROJECT_ROOT || process.cwd();
}

/**
 * Build a minimal PipelineContext for MCP tool usage.
 * Always dry-run — MCP tools never execute side effects on Claude Code.
 */
export function buildContext(task: string, projectRoot: string): PipelineContext {
  return {
    taskText: task,
    workingDir: projectRoot,
    isDryRun: true,
    results: {},
    startedAt: Date.now(),
  };
}

/**
 * Strip ANSI escape codes from a string for clean MCP output.
 */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
}

/**
 * Format data for MCP text response.
 * Strips ANSI codes and converts objects to readable JSON.
 */
export function formatForMcp(data: unknown): string {
  if (typeof data === 'string') {
    return stripAnsi(data);
  }
  return JSON.stringify(data, null, 2);
}
