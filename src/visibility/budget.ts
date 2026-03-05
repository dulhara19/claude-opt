/**
 * Budget display command — renders `co budget` output.
 * Implements AC4: budget status display with progress bar, runway, and session breakdown.
 */

import chalk from 'chalk';
import type { WindowStatus } from '../tracker/types.js';
import type { Metrics } from '../types/index.js';
import { readMetrics, readConfig } from '../store/index.js';
import {
  getActiveWindow,
  getWindowStatus,
  createWindow,
} from '../tracker/index.js';
import type { WindowEntry } from '../tracker/types.js';
import { estimateWindowTime, formatResetTime } from '../tracker/window-estimator.js';
import { estimateRemainingTasks, formatNumber, renderProgressBar } from '../tracker/budget-warnings.js';

/**
 * Run the `co budget` command — display token budget status.
 */
export async function runBudgetCommand(projectRoot: string): Promise<void> {
  const configResult = readConfig(projectRoot);
  if (!configResult.ok) {
    console.error(chalk.red('Error: Could not read config. Run `co init` first.'));
    return;
  }
  const config = configResult.value;

  const metricsResult = readMetrics(projectRoot);
  let windowStatus: WindowStatus;
  let metrics: Metrics | null = null;

  if (metricsResult.ok) {
    metrics = metricsResult.value;
    const windows = (metrics.windows as unknown as WindowEntry[]) ?? [];
    let activeWindow = getActiveWindow(windows);
    if (!activeWindow) {
      activeWindow = createWindow(windows, config.windowDurationMs, config.tokenBudget);
    }
    windowStatus = getWindowStatus(activeWindow);
  } else {
    // No metrics yet — show empty budget
    windowStatus = {
      windowId: 'none',
      startedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + config.windowDurationMs).toISOString(),
      tokensConsumed: 0,
      budget: config.tokenBudget,
      remaining: config.tokenBudget,
      percentUsed: 0,
      tasksCompleted: 0,
      timeRemainingMs: config.windowDurationMs,
      isExpired: false,
      estimatedResetAt: new Date(Date.now() + config.windowDurationMs).toISOString(),
    };
  }

  const estimate = estimateWindowTime(windowStatus);
  const avgTokensPerTask = windowStatus.tasksCompleted > 0
    ? windowStatus.tokensConsumed / windowStatus.tasksCompleted
    : 0;
  const estTasksRemaining = estimateRemainingTasks(windowStatus.remaining, avgTokensPerTask);

  console.log(renderBudgetDisplay(windowStatus, estimate, estTasksRemaining, metrics));
}

/**
 * Render the full budget display box.
 */
export function renderBudgetDisplay(
  ws: WindowStatus,
  estimate: { humanReadable: string },
  estTasksRemaining: number,
  metrics: Metrics | null,
): string {
  const startTime = formatTimeOnly(ws.startedAt);
  const endTime = formatTimeOnly(ws.expiresAt);
  const resetStr = formatResetTime(ws.expiresAt);
  const progressBar = renderProgressBar(ws.percentUsed, 30);
  const percentStr = `${Math.round(ws.percentUsed * 100)}%`;

  const lines: string[] = [
    chalk.cyan('┌─ Token Budget ──────────────────────────────────────┐'),
    chalk.cyan('│') + '                                                      ' + chalk.cyan('│'),
    chalk.cyan('│') + ` Window: ${startTime} — ${endTime} (${estimate.humanReadable} remaining)` + padTo(56, ` Window: ${startTime} — ${endTime} (${estimate.humanReadable} remaining)`) + chalk.cyan('│'),
    chalk.cyan('│') + '                                                      ' + chalk.cyan('│'),
    chalk.cyan('│') + ` ${progressBar}  ${percentStr} used` + padTo(56, ` ${progressBar}  ${percentStr} used`) + chalk.cyan('│'),
    chalk.cyan('│') + ` ${formatNumber(ws.tokensConsumed)} / ${formatNumber(ws.budget)} tokens` + padTo(56, ` ${formatNumber(ws.tokensConsumed)} / ${formatNumber(ws.budget)} tokens`) + chalk.cyan('│'),
    chalk.cyan('│') + '                                                      ' + chalk.cyan('│'),
    chalk.cyan('│') + ` Remaining: ${formatNumber(ws.remaining)} tokens` + padTo(56, ` Remaining: ${formatNumber(ws.remaining)} tokens`) + chalk.cyan('│'),
  ];

  if (ws.tasksCompleted > 0) {
    const estRange = estTasksRemaining > 0
      ? `~${estTasksRemaining}-${estTasksRemaining + Math.ceil(estTasksRemaining * 0.5)} (based on avg usage)`
      : '0';
    const estLine = ` Est. tasks remaining: ${estRange}`;
    lines.push(chalk.cyan('│') + estLine + padTo(56, estLine) + chalk.cyan('│'));
  }

  const resetLine = ` Window resets ${resetStr} (${estimate.humanReadable} from now)`;
  lines.push(chalk.cyan('│') + resetLine + padTo(56, resetLine) + chalk.cyan('│'));
  lines.push(chalk.cyan('│') + '                                                      ' + chalk.cyan('│'));

  // Session breakdown if metrics available
  if (metrics && metrics.perDomain && Object.keys(metrics.perDomain).length > 0) {
    lines.push(chalk.cyan('│') + ' Session breakdown:                                    ' + chalk.cyan('│'));
    for (const [domain, domainMetrics] of Object.entries(metrics.perDomain)) {
      const tokens = domainMetrics.totalTokensConsumed;
      const barWidth = Math.max(1, Math.round((tokens / ws.budget) * 20));
      const bar = '░'.repeat(barWidth);
      const domainLine = `   ${domain}: ${formatNumber(tokens)}t  ${bar}`;
      lines.push(chalk.cyan('│') + domainLine + padTo(56, domainLine) + chalk.cyan('│'));
    }
    lines.push(chalk.cyan('│') + '                                                      ' + chalk.cyan('│'));
  }

  lines.push(chalk.cyan('└──────────────────────────────────────────────────────┘'));
  return lines.join('\n');
}

/**
 * Format ISO timestamp to HH:MM.
 */
function formatTimeOnly(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/**
 * Calculate padding to fill a box line to target width.
 */
function padTo(targetWidth: number, content: string): string {
  const gap = targetWidth - content.length;
  return gap > 0 ? ' '.repeat(gap) : '';
}
