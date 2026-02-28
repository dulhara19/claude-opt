/**
 * Budget warning system — checks token budget usage and renders warning displays.
 * Implements AC1 (inline 75%), AC2 (blocking 90%), AC3 (exhausted 100%).
 */

import { createInterface } from 'node:readline';
import chalk from 'chalk';
import type { WindowStatus } from './types.js';
import type { BudgetWarning, BudgetWarningLevel, BudgetCheckResult } from './types.js';
import { formatTimeRemaining, formatResetTime } from './window-estimator.js';

// ─── Constants ──────────────────────────────────────────────────

const MIN_BOX_WIDTH = 40;
const MAX_BOX_WIDTH = 120;
const DEFAULT_BOX_WIDTH = 56;

// ─── Box Width (TK7) ───────────────────────────────────────────

/**
 * Calculate dynamic box inner width based on content and terminal.
 * Clamps between MIN_BOX_WIDTH and MAX_BOX_WIDTH.
 */
function calculateBoxWidth(contentLines: string[]): number {
  const termWidth = typeof process !== 'undefined' && process.stdout?.columns
    ? process.stdout.columns - 4  // leave room for box borders
    : DEFAULT_BOX_WIDTH;

  const maxContentWidth = contentLines.reduce((max, line) => Math.max(max, stripAnsi(line).length), 0);
  const needed = Math.max(maxContentWidth + 2, DEFAULT_BOX_WIDTH); // +2 for padding

  return Math.min(Math.max(needed, MIN_BOX_WIDTH), MAX_BOX_WIDTH, termWidth);
}

/**
 * Strip ANSI escape codes for length measurement.
 */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

// ─── Budget Check ──────────────────────────────────────────────

/**
 * Optional context passed to checkBudget for richer warnings.
 */
export interface BudgetCheckOptions {
  /** Per-type token averages for TK10-aware remaining task estimation (BC1). */
  perTypeAvg?: Record<string, { avg: number; count: number }>;
  /** Current task type for per-type estimation (BC1). */
  taskType?: string;
  /** Total tokens saved this window for savings context (BC5). */
  tokensSavedThisWindow?: number;
  /** Per-domain token consumption this window for domain summary (BC10). */
  domainConsumption?: Record<string, number>;
}

/**
 * Check budget usage and return appropriate warning level.
 * Accepts optional BudgetCheckOptions for richer warnings (BC1, BC5).
 */
export function checkBudget(
  windowStatus: WindowStatus,
  config: { inline: number; blocking: number; awareness?: number },
  options?: BudgetCheckOptions,
): BudgetWarning {
  const { percentUsed, tokensConsumed, budget, remaining, timeRemainingMs, expiresAt } = windowStatus;

  const awarenessThreshold = config.awareness ?? 0.50;

  let level: BudgetWarningLevel;
  if (percentUsed >= 1.0) {
    level = 'exhausted';
  } else if (percentUsed >= config.blocking) {
    level = 'blocking';
  } else if (percentUsed >= config.inline) {
    level = 'inline';
  } else if (percentUsed >= awarenessThreshold) {
    level = 'awareness';
  } else {
    level = 'none';
  }

  const avgTokensPerTask = windowStatus.tasksCompleted > 0
    ? tokensConsumed / windowStatus.tasksCompleted
    : 0;
  // BC1: Pass per-type averages through for more accurate estimation
  const estimatedTasksRemaining = estimateRemainingTasks(
    remaining, avgTokensPerTask,
    options?.perTypeAvg, options?.taskType,
  );

  // BC2: Compute burn rate projection
  const burnRateTokensPerMin = computeBurnRate(windowStatus);
  const projectedExhaustionMs = burnRateTokensPerMin > 0
    ? Math.round((remaining / burnRateTokensPerMin) * 60_000)
    : undefined;

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
    // BC2: Burn rate fields
    burnRateTokensPerMin,
    projectedExhaustionMs,
    // BC5: Savings context
    tokensSaved: options?.tokensSavedThisWindow,
    // BC10: Domain consumption breakdown
    domainBreakdown: options?.domainConsumption && tokensConsumed > 0
      ? computeDomainBreakdown(options.domainConsumption, tokensConsumed)
      : undefined,
  };

  warning.message = formatWarningMessage(warning);
  return warning;
}

/**
 * Compute per-domain consumption as percentage of total (BC10).
 * Returns top domains sorted by share descending.
 */
function computeDomainBreakdown(
  domainConsumption: Record<string, number>,
  totalConsumed: number,
): Record<string, number> {
  const breakdown: Record<string, number> = {};
  for (const [domain, tokens] of Object.entries(domainConsumption)) {
    breakdown[domain] = Math.round((tokens / totalConsumed) * 100);
  }
  return breakdown;
}

/**
 * Compute tokens per minute burn rate from window status (BC2).
 */
function computeBurnRate(windowStatus: WindowStatus): number {
  if (windowStatus.tokensConsumed <= 0) return 0;
  const startedAtMs = Date.parse(windowStatus.startedAt);
  const elapsedMs = Date.now() - startedAtMs;
  if (elapsedMs <= 0) return 0;
  return (windowStatus.tokensConsumed / elapsedMs) * 60_000;
}

/**
 * Estimate remaining tasks based on average token usage per task (TK10).
 * When perTypeAvg is provided and taskType is known with 5+ samples, uses type-specific average.
 */
export function estimateRemainingTasks(
  remaining: number,
  avgTokensPerTask: number,
  perTypeAvg?: Record<string, { avg: number; count: number }>,
  taskType?: string,
): number {
  // TK10: Use per-type average when available with sufficient data
  if (perTypeAvg && taskType && perTypeAvg[taskType] && perTypeAvg[taskType].count >= 5) {
    const typeAvg = perTypeAvg[taskType].avg;
    if (typeAvg > 0) return Math.floor(remaining / typeAvg);
  }

  if (avgTokensPerTask <= 0) return 0;
  return Math.floor(remaining / avgTokensPerTask);
}

/**
 * Format a projected exhaustion suffix (BC9).
 */
function formatProjectionSuffix(warning: BudgetWarning): string {
  if (warning.projectedExhaustionMs != null && warning.projectedExhaustionMs > 0) {
    return ` | Projected exhaustion: ${formatTimeRemaining(warning.projectedExhaustionMs)}`;
  }
  return '';
}

/**
 * Format a savings context suffix (BC5).
 */
function formatSavingsSuffix(warning: BudgetWarning): string {
  if (warning.tokensSaved != null && warning.tokensSaved > 0) {
    return ` (saved ~${formatNumber(warning.tokensSaved)} tokens)`;
  }
  return '';
}

/**
 * Format a warning message string based on warning level.
 */
export function formatWarningMessage(warning: BudgetWarning): string {
  switch (warning.level) {
    case 'awareness':
      return `Budget: ${formatPercent(warning.percentUsed)} used (${formatNumber(warning.tokensConsumed)} / ${formatNumber(warning.budget)})${formatSavingsSuffix(warning)}`;
    case 'inline':
      return `Budget: ${formatNumber(warning.tokensConsumed)} / ${formatNumber(warning.budget)} (${formatPercent(warning.percentUsed)}) | ${formatTimeRemaining(warning.timeRemainingMs)} remaining${formatProjectionSuffix(warning)}${formatSavingsSuffix(warning)}`;
    case 'blocking':
      return `You've used ${formatPercent(warning.percentUsed)} of your token budget. ${formatNumber(warning.tokensConsumed)} / ${formatNumber(warning.budget)} tokens consumed. Remaining: ~${formatNumber(warning.remaining)} tokens (~${warning.estimatedTasksRemaining} simple tasks)${formatProjectionSuffix(warning)}${formatSavingsSuffix(warning)}`;
    case 'exhausted':
      return `Token budget fully consumed for this window. ${formatNumber(warning.tokensConsumed)} / ${formatNumber(warning.budget)} tokens used.${formatSavingsSuffix(warning)}`;
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

    case 'awareness':
      console.log(renderAwarenessWarning(warning));
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

/** Default timeout for blocking prompt in ms (BC6). */
export const PROMPT_TIMEOUT_MS = 30_000;

/**
 * Read a single line of user input from stdin.
 * Times out after PROMPT_TIMEOUT_MS and auto-continues (BC6, BC12).
 */
function readUserChoice(timeoutMs: number = PROMPT_TIMEOUT_MS): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    let resolved = false;

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        console.log('\n(Timeout — auto-continuing)');
        rl.close();
        resolve('1'); // BC12: auto-continue on timeout
      }
    }, timeoutMs);

    rl.question('Choose [1/2/3]: ', (answer) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        rl.close();
        resolve(answer.trim());
      }
    });
  });
}

// ─── Warning Renderers ─────────────────────────────────────────

/**
 * Render awareness warning (dim, compact status line) (BC3).
 */
export function renderAwarenessWarning(warning: BudgetWarning): string {
  const bar = colorProgressBar(warning.percentUsed, 15);
  const savingsStr = warning.tokensSaved && warning.tokensSaved > 0
    ? ` | saved ~${formatNumber(warning.tokensSaved)}`
    : '';
  return chalk.dim(`${bar} ${formatPercent(warning.percentUsed)} budget used (${formatNumber(warning.remaining)} remaining)${savingsStr}`);
}

/**
 * Render inline warning (yellow, single-line) with progress bar (TK8).
 * Includes projected exhaustion time (BC9).
 */
export function renderInlineWarning(warning: BudgetWarning): string {
  const timeStr = formatTimeRemaining(warning.timeRemainingMs);
  const bar = colorProgressBar(warning.percentUsed, 20);
  const projStr = warning.projectedExhaustionMs != null && warning.projectedExhaustionMs > 0
    ? ` | exhausts in ~${formatTimeRemaining(warning.projectedExhaustionMs)}`
    : '';
  const line1 = `⚠ ${bar} Budget: ${formatNumber(warning.tokensConsumed)} / ${formatNumber(warning.budget)} (${formatPercent(warning.percentUsed)}) | ${timeStr} remaining${projStr}`;
  const line2 = '  Consider: use --dry-run to preview before executing';
  return chalk.yellow(line1) + '\n' + chalk.yellow(line2);
}

/**
 * Render blocking warning (red border box with options).
 * Uses dynamic box width (TK7) and includes progress bar (TK8).
 */
export function renderBlockingWarning(warning: BudgetWarning): string {
  const timeStr = formatTimeRemaining(warning.timeRemainingMs);
  const resetStr = formatResetTime(warning.resetAt);
  const estTasks = warning.estimatedTasksRemaining;

  // BC9: Projected exhaustion line
  const projLine = warning.projectedExhaustionMs != null && warning.projectedExhaustionMs > 0
    ? `At current rate, budget exhausts in ~${formatTimeRemaining(warning.projectedExhaustionMs)}`
    : null;
  // BC5: Savings context line
  const savingsLine = warning.tokensSaved != null && warning.tokensSaved > 0
    ? `Optimization has saved ~${formatNumber(warning.tokensSaved)} tokens this window`
    : null;

  // Build content lines first to calculate width
  const contentLines = [
    `You've used ${formatPercent(warning.percentUsed)} of your token budget.`,
    `${formatNumber(warning.tokensConsumed)} / ${formatNumber(warning.budget)} tokens consumed.`,
    `Remaining: ~${formatNumber(warning.remaining)} tokens (~${estTasks} simple tasks)`,
    `Window resets in: ${timeStr} (${resetStr})`,
    ...(projLine ? [projLine] : []),
    ...(savingsLine ? [savingsLine] : []),
    ...formatDomainBreakdownLines(warning),
    ...getRecoverySuggestions(warning),
    '[1] Continue anyway',
    `[2] Wait for reset (${timeStr})`,
    '[3] Cancel this task',
  ];

  const innerWidth = calculateBoxWidth(contentLines);
  const bar = colorProgressBar(warning.percentUsed, Math.min(innerWidth - 4, 30));

  const lines = [
    chalk.red('┌─ ⚠ Budget Warning ' + '─'.repeat(Math.max(0, innerWidth - 20)) + '┐'),
    chalk.red('│') + pad(innerWidth) + chalk.red('│'),
    chalk.red('│') + ` ${bar}` + pad(innerWidth - stripAnsi(bar).length - 1) + chalk.red('│'),
    chalk.red('│') + pad(innerWidth) + chalk.red('│'),
    ...contentLines.map(line => chalk.red('│') + ` ${line}` + pad(innerWidth - line.length - 1) + chalk.red('│')),
    chalk.red('│') + pad(innerWidth) + chalk.red('│'),
    chalk.red('└' + '─'.repeat(innerWidth) + '┘'),
  ];
  return lines.join('\n');
}

/**
 * Render exhausted warning (red box, no options).
 * Uses dynamic box width (TK7).
 */
export function renderExhaustedWarning(warning: BudgetWarning): string {
  const timeStr = formatTimeRemaining(warning.timeRemainingMs);
  const resetStr = formatResetTime(warning.resetAt);

  const contentLines = [
    'Token budget fully consumed for this window.',
    `${formatNumber(warning.tokensConsumed)} / ${formatNumber(warning.budget)} tokens used.`,
    `Next window opens in: ${timeStr} (${resetStr})`,
    'Tip: Use this time to review stats and plan next',
    'tasks with co --dry-run',
  ];

  const innerWidth = calculateBoxWidth(contentLines);

  const lines = [
    chalk.red('┌─ ⛔ Budget Exhausted ' + '─'.repeat(Math.max(0, innerWidth - 22)) + '┐'),
    chalk.red('│') + pad(innerWidth) + chalk.red('│'),
    ...contentLines.map(line => chalk.red('│') + ` ${line}` + pad(innerWidth - line.length - 1) + chalk.red('│')),
    chalk.red('│') + pad(innerWidth) + chalk.red('│'),
    chalk.red('└' + '─'.repeat(innerWidth) + '┘'),
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
 * Render a color-coded progress bar (TK8).
 * Green (<75%), yellow (75-90%), red (>90%).
 */
export function colorProgressBar(percentUsed: number, width: number): string {
  const bar = renderProgressBar(percentUsed, width);
  if (percentUsed >= 0.9) return chalk.red(bar);
  if (percentUsed >= 0.75) return chalk.yellow(bar);
  return chalk.green(bar);
}

/**
 * Format domain breakdown as a single summary line for the blocking box (BC10).
 */
function formatDomainBreakdownLines(warning: BudgetWarning): string[] {
  if (!warning.domainBreakdown) return [];
  const entries = Object.entries(warning.domainBreakdown)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4); // top 4 domains
  if (entries.length === 0) return [];
  const parts = entries.map(([d, pct]) => `${d}: ${pct}%`);
  return [`Usage by domain: ${parts.join(', ')}`];
}

/**
 * Generate recovery suggestions based on warning context (BC7).
 * Returns up to 2 actionable suggestions for the blocking warning box.
 */
export function getRecoverySuggestions(warning: BudgetWarning): string[] {
  const suggestions: string[] = [];
  if (warning.remaining <= 0) return suggestions;

  // Suggest dry-run for moderate budget pressure
  if (warning.percentUsed >= 0.90 && warning.percentUsed < 1.0) {
    suggestions.push('Tip: Use --dry-run to preview without consuming tokens');
  }

  // Suggest compression when remaining is tight
  if (warning.estimatedTasksRemaining <= 3 && warning.estimatedTasksRemaining > 0) {
    suggestions.push('Tip: Focus on smaller, targeted prompts to stretch remaining budget');
  }

  return suggestions.slice(0, 2);
}

/**
 * Estimate remaining tasks using per-type token average when available (BC8).
 * Wraps estimateRemainingTasks with type-specific projection.
 */
export function estimateRemainingTasksForType(
  remaining: number,
  globalAvg: number,
  perTypeAvg?: Record<string, { avg: number; count: number }>,
  taskType?: string,
): { estimate: number; source: 'perType' | 'global' } {
  if (perTypeAvg && taskType && perTypeAvg[taskType] && perTypeAvg[taskType].count >= 5) {
    const typeAvg = perTypeAvg[taskType].avg;
    if (typeAvg > 0) return { estimate: Math.floor(remaining / typeAvg), source: 'perType' };
  }
  if (globalAvg <= 0) return { estimate: 0, source: 'global' };
  return { estimate: Math.floor(remaining / globalAvg), source: 'global' };
}

/**
 * Create padding spaces to fill a box-drawing line.
 */
function pad(n: number): string {
  return n > 0 ? ' '.repeat(n) : '';
}
