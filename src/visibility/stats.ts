/**
 * Stats dashboard command — renders `co stats` output.
 * Implements AC1, AC2: stats dashboard with prediction accuracy, token savings, model usage, and domain breakdown.
 */

import chalk from 'chalk';
import { readTaskHistory, readMetrics } from '../store/index.js';
import type { StatsDisplayData, DomainStatsEntry, ModelUsageEntry, TrendsDisplayData, SessionAccuracy, CumulativeSavings, ChartDataPoint } from './types.js';
import { drawBox, drawProgressBar, drawLineChart, formatTokenCount, formatPercentage, colorByThreshold } from './formatters.js';

const EMPTY_STATE_MESSAGE = 'No tasks completed yet. Run your first task with `co "your task"`';

/**
 * Gather stats data from the store (read-only).
 */
export function gatherStatsData(
  projectRoot: string,
  options?: { domain?: string; sessions?: number },
): StatsDisplayData {
  const taskHistoryResult = readTaskHistory(projectRoot);
  const metricsResult = readMetrics(projectRoot);

  if (!taskHistoryResult.ok || taskHistoryResult.value.tasks.length === 0) {
    return { isEmpty: true };
  }

  const taskHistory = taskHistoryResult.value;
  let tasks = taskHistory.tasks;

  // Filter by domain if specified
  if (options?.domain) {
    tasks = tasks.filter(
      (t) => t.classification?.taskType?.toLowerCase() === options.domain?.toLowerCase()
        || t.prediction?.predictedFiles?.some((f) => f.toLowerCase().includes(options.domain!.toLowerCase())),
    );
    if (tasks.length === 0) {
      return { isEmpty: true };
    }
  }

  // Calculate total tasks
  const totalTasks = tasks.length;

  // Calculate prediction accuracy
  let totalPrecision = 0;
  let totalRecall = 0;
  let predictionCount = 0;
  for (const task of tasks) {
    if (task.prediction) {
      totalPrecision += task.prediction.precision;
      totalRecall += task.prediction.recall;
      predictionCount++;
    }
  }
  const precision = predictionCount > 0 ? totalPrecision / predictionCount : 0;
  const recall = predictionCount > 0 ? totalRecall / predictionCount : 0;

  // Calculate token savings
  let totalTokensSaved = 0;
  let totalTokensConsumed = 0;
  for (const task of tasks) {
    if (task.tokens) {
      totalTokensSaved += task.tokens.saved;
      totalTokensConsumed += task.tokens.consumed;
    }
  }
  const totalTokensTotal = totalTokensConsumed + totalTokensSaved;
  const savingsRate = totalTokensTotal > 0 ? totalTokensSaved / totalTokensTotal : 0;
  const avgSavingsPerTask = totalTasks > 0 ? Math.round(totalTokensSaved / totalTasks) : 0;

  // Calculate model routing breakdown
  const modelCounts: Record<string, number> = {};
  for (const task of tasks) {
    if (task.routing?.model) {
      const model = task.routing.model;
      modelCounts[model] = (modelCounts[model] ?? 0) + 1;
    }
  }
  const modelUsage: ModelUsageEntry[] = Object.entries(modelCounts)
    .map(([model, taskCount]) => ({
      model,
      taskCount,
      percentage: totalTasks > 0 ? taskCount / totalTasks : 0,
    }))
    .sort((a, b) => b.taskCount - a.taskCount);

  // Calculate per-domain accuracy
  const domainMap: Record<string, { totalPrecision: number; count: number }> = {};
  for (const task of tasks) {
    const domain = detectDomain(task);
    if (!domainMap[domain]) {
      domainMap[domain] = { totalPrecision: 0, count: 0 };
    }
    domainMap[domain].count++;
    if (task.prediction) {
      domainMap[domain].totalPrecision += task.prediction.precision;
    }
  }

  const domains: DomainStatsEntry[] = Object.entries(domainMap)
    .map(([name, data]) => ({
      name,
      accuracy: data.count > 0 ? data.totalPrecision / data.count : 0,
      taskCount: data.count,
    }))
    .sort((a, b) => b.accuracy - a.accuracy);

  // Get session count from metrics if available
  let totalSessions = 1;
  if (metricsResult.ok) {
    totalSessions = metricsResult.value.overall.totalSessions || 1;
  }

  return {
    isEmpty: false,
    totalTasks,
    totalSessions,
    totalDomains: domains.length,
    precision,
    recall,
    totalTokensSaved,
    savingsRate,
    avgSavingsPerTask,
    modelUsage,
    domains,
  };
}

/**
 * Render the stats dashboard as a formatted string.
 */
export function renderStats(data: StatsDisplayData): string {
  if (data.isEmpty) {
    return drawBox('claude-opt Stats', [` ${EMPTY_STATE_MESSAGE}`]);
  }

  const lines: string[] = [];

  // Header line
  lines.push(` Total tasks: ${data.totalTasks}  |  Sessions: ${data.totalSessions}  |  Domains: ${data.totalDomains}`);
  lines.push('');

  // Prediction Accuracy
  lines.push(chalk.bold(' Prediction Accuracy'));
  const precBar = drawProgressBar(data.precision ?? 0, 1, 10);
  const recBar = drawProgressBar(data.recall ?? 0, 1, 10);
  lines.push(`   Precision: ${formatPercentage(data.precision ?? 0)}  ${precBar}  Recall: ${formatPercentage(data.recall ?? 0)}  ${recBar}`);
  lines.push('');

  // Token Savings
  lines.push(chalk.bold(' Token Savings'));
  lines.push(`   Total saved: ${formatTokenCount(data.totalTokensSaved ?? 0)}`);
  lines.push(`   Savings rate: ${formatPercentage(data.savingsRate ?? 0)}`);
  lines.push(`   Avg per task: ${(data.avgSavingsPerTask ?? 0).toLocaleString('en-US')} tokens saved`);
  lines.push('');

  // Model Usage
  if (data.modelUsage && data.modelUsage.length > 0) {
    lines.push(chalk.bold(' Model Usage'));
    const modelParts = data.modelUsage.map(
      (m) => `${m.model}: ${m.taskCount} tasks (${formatPercentage(m.percentage)})`,
    );
    lines.push(`   ${modelParts.join('  ')}`);
    lines.push('');
  }

  // Top Domains by Accuracy
  if (data.domains && data.domains.length > 0) {
    lines.push(chalk.bold(' Top Domains by Accuracy'));
    for (const domain of data.domains) {
      const bar = drawProgressBar(domain.accuracy, 1, 10);
      const coloredAccuracy = colorByThreshold(domain.accuracy, { good: 0.8, warn: 0.6 });
      lines.push(`   ${domain.name.padEnd(20)} ${coloredAccuracy} ${bar}`);
    }
  }

  return drawBox('claude-opt Stats', lines);
}

const MIN_TASKS_FOR_TRENDS = 5;

/**
 * Run the `co stats` command.
 */
export async function runStatsCommand(
  projectRoot: string,
  options?: { domain?: string; sessions?: number; trend?: boolean },
): Promise<void> {
  if (options?.trend) {
    const trendsData = gatherTrendsData(projectRoot);
    console.log(renderTrends(trendsData));
    return;
  }

  const data = gatherStatsData(projectRoot, options);
  console.log(renderStats(data));
}

/**
 * Gather trends data for accuracy-over-time visualization.
 */
export function gatherTrendsData(projectRoot: string): TrendsDisplayData {
  const taskHistoryResult = readTaskHistory(projectRoot);

  if (!taskHistoryResult.ok || taskHistoryResult.value.tasks.length < MIN_TASKS_FOR_TRENDS) {
    return {
      hasEnoughData: false,
      taskCount: taskHistoryResult.ok ? taskHistoryResult.value.tasks.length : 0,
    };
  }

  const tasks = taskHistoryResult.value.tasks;

  // Group tasks into sessions (batches of ~5 tasks)
  const batchSize = Math.max(3, Math.ceil(tasks.length / 12));
  const sessionAccuracies: SessionAccuracy[] = [];
  const cumulativeSavings: CumulativeSavings[] = [];
  let runningTotalSaved = 0;

  for (let i = 0; i < tasks.length; i += batchSize) {
    const batch = tasks.slice(i, i + batchSize);
    const sessionNum = Math.floor(i / batchSize) + 1;
    const label = `s${sessionNum}`;

    let totalPrec = 0;
    let totalRec = 0;
    let batchSaved = 0;
    for (const t of batch) {
      totalPrec += t.prediction?.precision ?? 0;
      totalRec += t.prediction?.recall ?? 0;
      batchSaved += t.tokens?.saved ?? 0;
    }

    sessionAccuracies.push({
      sessionLabel: label,
      precision: batch.length > 0 ? totalPrec / batch.length : 0,
      recall: batch.length > 0 ? totalRec / batch.length : 0,
      taskCount: batch.length,
    });

    runningTotalSaved += batchSaved;
    cumulativeSavings.push({
      sessionLabel: label,
      totalSaved: runningTotalSaved,
    });
  }

  // Per-domain breakdown
  const domainMap: Record<string, { totalPrecision: number; count: number }> = {};
  for (const task of tasks) {
    const domain = detectDomain(task);
    if (!domainMap[domain]) {
      domainMap[domain] = { totalPrecision: 0, count: 0 };
    }
    domainMap[domain].count++;
    domainMap[domain].totalPrecision += task.prediction?.precision ?? 0;
  }

  const domainBreakdown: DomainStatsEntry[] = Object.entries(domainMap)
    .map(([name, data]) => ({
      name,
      accuracy: data.count > 0 ? data.totalPrecision / data.count : 0,
      taskCount: data.count,
    }))
    .sort((a, b) => b.accuracy - a.accuracy);

  return {
    hasEnoughData: true,
    taskCount: tasks.length,
    sessionAccuracies,
    cumulativeSavings,
    domainBreakdown,
  };
}

/**
 * Render the trends visualization.
 */
export function renderTrends(data: TrendsDisplayData): string {
  if (!data.hasEnoughData) {
    return drawBox('Accuracy Trends', [
      ` Need at least ${MIN_TASKS_FOR_TRENDS} completed tasks to show trends. Currently: ${data.taskCount} tasks.`,
    ]);
  }

  const lines: string[] = [];

  // Accuracy over time chart
  if (data.sessionAccuracies && data.sessionAccuracies.length > 0) {
    lines.push(chalk.bold(' Prediction Accuracy Over Time'));
    lines.push('');
    const chartData: ChartDataPoint[] = data.sessionAccuracies.map((s) => ({
      label: s.sessionLabel,
      value: s.precision * 100,
    }));
    lines.push(drawLineChart(chartData, {
      height: 8,
      yLabel: '%',
      xLabels: chartData.map((d) => d.label),
    }));
    lines.push('');
  }

  // Cumulative savings
  if (data.cumulativeSavings && data.cumulativeSavings.length > 0) {
    const total = data.cumulativeSavings[data.cumulativeSavings.length - 1].totalSaved;
    lines.push(chalk.bold(' Cumulative Token Savings'));
    lines.push(`   Total saved: ${formatTokenCount(total)}`);
    const perSession = data.cumulativeSavings.map(
      (s) => `   ${s.sessionLabel}: ${s.totalSaved.toLocaleString('en-US')}t`,
    );
    for (const line of perSession) {
      lines.push(line);
    }
    lines.push('');
  }

  // Per-domain breakdown
  if (data.domainBreakdown && data.domainBreakdown.length > 0) {
    lines.push(chalk.bold(' Per-Domain Accuracy'));
    for (const d of data.domainBreakdown) {
      const bar = drawProgressBar(d.accuracy, 1, 10);
      lines.push(`   ${d.name.padEnd(20)} ${formatPercentage(d.accuracy)} ${bar}  (${d.taskCount} tasks)`);
    }
  }

  return drawBox('Accuracy Trends', lines);
}

/**
 * Detect domain from a task entry (uses classification or file paths).
 */
function detectDomain(task: { classification?: { taskType?: string }; prediction?: { predictedFiles?: string[] } }): string {
  // Try to extract domain from file paths
  if (task.prediction?.predictedFiles && task.prediction.predictedFiles.length > 0) {
    const firstFile = task.prediction.predictedFiles[0];
    const parts = firstFile.split('/');
    if (parts.length > 1) {
      return parts[parts.length - 2] || 'unknown';
    }
  }
  return task.classification?.taskType?.toLowerCase() || 'unknown';
}
