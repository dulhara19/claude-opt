/**
 * Budget warning system — checks token budget usage and renders warning displays.
 * Implements AC1 (inline 75%), AC2 (blocking 90%), AC3 (exhausted 100%).
 */

import { createInterface } from 'node:readline';
import chalk from 'chalk';
import type { WindowStatus } from './types.js';
import type { BudgetWarning, BudgetWarningLevel, BudgetCheckResult } from './types.js';
import { formatTimeRemaining, formatResetTime } from './window-estimator.js';

// ─── Budget Check ──────────────────────────────────────────────

/**
 * Check budget usage and return appropriate warning level.
 */
export function checkBudget(
  windowStatus: WindowStatus,
  config: { inline: number; blocking: number },
): BudgetWarning {
  const { percentUsed, tokensConsumed, budget, remaining, timeRemainingMs, expiresAt } = windowStatus;

  let level: BudgetWarningLevel;
  if (percentUsed >= 1.0) {
    level = 'exhausted';
  } else if (percentUsed >= config.blocking) {
    level = 'blocking';
  } else if (percentUsed >= config.inline) {
    level = 'inline';
  } else {
    level = 'none';
  }

  const avgTokensPerTask = windowStatus.tasksCompleted > 0
    ? tokensConsumed / windowStatus.tasksCompleted
    : 0;
  const estimatedTasksRemaining = estimateRemainingTasks(remaining, avgTokensPerTask);

  const warning: BudgetWarning = {
    level,
    percentUsed,
    tokensConsumed,
    budget,
    remaining,
    estimatedTasksRemaining,
    timeRemainingMs,
    resetAt: expiresAt,
    message: '',
  };

  warning.message = formatWarningMessage(warning);
  return warning;
}

/**
 * Estimate remaining tasks based on average token usage per task.
 */
export function estimateRemainingTasks(remaining: number, avgTokensPerTask: number): number {
  if (avgTokensPerTask <= 0) return 0;
  return Math.floor(remaining / avgTokensPerTask);
}

/**
 * Format a warning message string based on warning level.
 */
export function formatWarningMessage(warning: BudgetWarning): string {
  switch (warning.level) {
    case 'inline':
      return `Budget: ${formatNumber(warning.tokensConsumed)} / ${formatNumber(warning.budget)} (${formatPercent(warning.percentUsed)}) | ${formatTimeRemaining(warning.timeRemainingMs)} remaining`;
    case 'blocking':
      return `You've used ${formatPercent(warning.percentUsed)} of your token budget. ${formatNumber(warning.tokensConsumed)} / ${formatNumber(warning.budget)} tokens consumed. Remaining: ~${formatNumber(warning.remaining)} tokens (~${warning.estimatedTasksRemaining} simple tasks)`;
    case 'exhausted':
      return `Token budget fully consumed for this window. ${formatNumber(warning.tokensConsumed)} / ${formatNumber(warning.budget)} tokens used.`;
    case 'none':
      return '';
  }
}

// ─── Blocking Prompt Interaction ───────────────────────────────

/**
 * Display budget warning and prompt user for action if blocking.
 */
export async function promptBudgetWarning(warning: BudgetWarning): Promise<BudgetCheckResult> {
  const result: BudgetCheckResult = { warning, shouldProceed: true };

  switch (warning.level) {
    case 'none':
      return result;

    case 'inline':
      console.log(renderInlineWarning(warning));
      return result;

    case 'blocking': {
      console.log(renderBlockingWarning(warning));
      const choice = await readUserChoice();
      if (choice === '1') {
        return { warning, shouldProceed: true, userChoice: 'continue' };
      } else if (choice === '2') {
        return { warning, shouldProceed: false, userChoice: 'wait' };
      } else {
        return { warning, shouldProceed: false, userChoice: 'cancel' };
      }
    }

    case 'exhausted':
      console.log(renderExhaustedWarning(warning));
      return { warning, shouldProceed: false, userChoice: 'wait' };
  }
}

/**
 * Read a single line of user input from stdin.
 */
function readUserChoice(): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question('Choose [1/2/3]: ', (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// ─── Warning Renderers ─────────────────────────────────────────

/**
 * Render inline warning (yellow, single-line).
 */
export function renderInlineWarning(warning: BudgetWarning): string {
  const timeStr = formatTimeRemaining(warning.timeRemainingMs);
  const line1 = `⚠ Budget: ${formatNumber(warning.tokensConsumed)} / ${formatNumber(warning.budget)} (${formatPercent(warning.percentUsed)}) | ${timeStr} remaining`;
  const line2 = '  Consider: use --dry-run to preview before executing';
  return chalk.yellow(line1) + '\n' + chalk.yellow(line2);
}

/**
 * Render blocking warning (red border box with options).
 */
export function renderBlockingWarning(warning: BudgetWarning): string {
  const timeStr = formatTimeRemaining(warning.timeRemainingMs);
  const resetStr = formatResetTime(warning.resetAt);
  const estTasks = warning.estimatedTasksRemaining;

  const lines = [
    chalk.red('┌─ ⚠ Budget Warning ──────────────────────────────────┐'),
    chalk.red('│') + '                                                      ' + chalk.red('│'),
    chalk.red('│') + ` You've used ${formatPercent(warning.percentUsed)} of your token budget.` + pad(56 - 21 - formatPercent(warning.percentUsed).length) + chalk.red('│'),
    chalk.red('│') + ` ${formatNumber(warning.tokensConsumed)} / ${formatNumber(warning.budget)} tokens consumed.` + pad(56 - 2 - formatNumber(warning.tokensConsumed).length - 3 - formatNumber(warning.budget).length - 18) + chalk.red('│'),
    chalk.red('│') + ` Remaining: ~${formatNumber(warning.remaining)} tokens (~${estTasks} simple tasks)` + pad(56 - 14 - formatNumber(warning.remaining).length - 10 - String(estTasks).length - 14) + chalk.red('│'),
    chalk.red('│') + '                                                      ' + chalk.red('│'),
    chalk.red('│') + ` Window resets in: ${timeStr} (${resetStr})` + pad(56 - 19 - timeStr.length - 2 - resetStr.length - 1) + chalk.red('│'),
    chalk.red('│') + '                                                      ' + chalk.red('│'),
    chalk.red('│') + ' [1] Continue anyway                                   ' + chalk.red('│'),
    chalk.red('│') + ` [2] Wait for reset (${timeStr})` + pad(56 - 22 - timeStr.length - 1) + chalk.red('│'),
    chalk.red('│') + ' [3] Cancel this task                                  ' + chalk.red('│'),
    chalk.red('└──────────────────────────────────────────────────────┘'),
  ];
  return lines.join('\n');
}

/**
 * Render exhausted warning (red box, no options).
 */
export function renderExhaustedWarning(warning: BudgetWarning): string {
  const timeStr = formatTimeRemaining(warning.timeRemainingMs);
  const resetStr = formatResetTime(warning.resetAt);

  const lines = [
    chalk.red('┌─ ⛔ Budget Exhausted ────────────────────────────────┐'),
    chalk.red('│') + '                                                      ' + chalk.red('│'),
    chalk.red('│') + ' Token budget fully consumed for this window.          ' + chalk.red('│'),
    chalk.red('│') + ` ${formatNumber(warning.tokensConsumed)} / ${formatNumber(warning.budget)} tokens used.` + pad(56 - 2 - formatNumber(warning.tokensConsumed).length - 3 - formatNumber(warning.budget).length - 13) + chalk.red('│'),
    chalk.red('│') + '                                                      ' + chalk.red('│'),
    chalk.red('│') + ` Next window opens in: ${timeStr} (${resetStr})` + pad(56 - 23 - timeStr.length - 2 - resetStr.length - 1) + chalk.red('│'),
    chalk.red('│') + '                                                      ' + chalk.red('│'),
    chalk.red('│') + ' Tip: Use this time to review stats and plan next      ' + chalk.red('│'),
    chalk.red('│') + ' tasks with co --dry-run                               ' + chalk.red('│'),
    chalk.red('└──────────────────────────────────────────────────────┘'),
  ];
  return lines.join('\n');
}

// ─── Formatting Helpers ────────────────────────────────────────

/**
 * Format a number with locale-aware comma separators.
 */
export function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

/**
 * Format a 0.0-1.0 float as a percentage string.
 */
export function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

/**
 * Render a progress bar with filled/empty block characters.
 */
export function renderProgressBar(percentUsed: number, width: number): string {
  const filled = Math.round(percentUsed * width);
  const empty = width - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

/**
 * Create padding spaces to fill a box-drawing line.
 */
function pad(n: number): string {
  return n > 0 ? ' '.repeat(n) : '';
}
