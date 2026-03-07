import chalk from 'chalk';

export enum LogLevel {
  Debug = 0,
  Info = 1,
  Warn = 2,
  Error = 3,
}

let currentLevel: LogLevel = LogLevel.Info;
let logOutput: NodeJS.WritableStream = process.stdout;

/**
 * Redirect debug/info log output to a different stream.
 * Used by MCP server to keep stdout clean for protocol messages.
 */
export function setLogOutput(stream: NodeJS.WritableStream): void {
  logOutput = stream;
}

/**
 * Set the global log level.
 * - `--verbose` → LogLevel.Debug
 * - `--quiet` → LogLevel.Warn (suppresses info)
 * - default → LogLevel.Info
 */
export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

function formatMessage(level: string, module: string, message: string, error?: unknown): string {
  let line = `${level} [${module}] ${message}`;
  if (error instanceof Error) {
    line += ` — ${error.message}`;
  } else if (error !== undefined) {
    line += ` — ${String(error)}`;
  }
  return line + '\n';
}

export const logger = {
  debug(module: string, message: string, error?: unknown): void {
    if (currentLevel <= LogLevel.Debug) {
      logOutput.write(formatMessage(chalk.gray('DEBUG'), module, message, error));
    }
  },

  info(module: string, message: string, error?: unknown): void {
    if (currentLevel <= LogLevel.Info) {
      logOutput.write(formatMessage(chalk.blue('INFO'), module, message, error));
    }
  },

  warn(module: string, message: string, error?: unknown): void {
    if (currentLevel <= LogLevel.Warn) {
      process.stderr.write(formatMessage(chalk.yellow('WARN'), module, message, error));
    }
  },

  error(module: string, message: string, error?: unknown): void {
    // Errors always logged regardless of verbosity
    process.stderr.write(formatMessage(chalk.red('ERROR'), module, message, error));
  },
};
