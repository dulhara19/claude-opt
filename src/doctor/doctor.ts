/**
 * Diagnostic engine for knowledge store health analysis (Story 7.2).
 * Detects stale patterns, missing co-occurrences, and bad predictions.
 */

import chalk from 'chalk';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import type { Result, TaskHistory, Patterns, Metrics } from '../types/index.js';
import { ok, err, withFailOpen, logger } from '../utils/index.js';
import {
  readTaskHistory,
  readPatterns,
  readMetrics,
  resolveStorePath,
  readJSON,
} from '../store/index.js';
import { executeRaw } from '../adapter/index.js';
import type {
  DiagnosticOptions,
  DiagnosticReport,
  DiagnosticHealthScore,
  DiagnosticFinding,
  Recommendation,
  DiagnosticContext,
  FindingSeverity,
  DeepAnalysisOptions,
} from './types.js';
import {
  MIN_TASKS_FOR_PATTERN_DETECTION,
  MIN_TASKS_FOR_STALENESS,
  DEFAULT_STALENESS_WINDOW,
  STALENESS_WEIGHT_THRESHOLD,
  COOCCURRENCE_MIN_RATIO,
  MIN_PREDICTIONS_FOR_BAD,
  BAD_PREDICTION_HIT_THRESHOLD,
  SEVERITY_DEDUCTIONS,
  DEEP_ANALYSIS_BASE_TOKENS,
  DEEP_ANALYSIS_TOKENS_PER_100,
} from './types.js';

const MODULE = 'doctor:diagnostics';

// ─── Stale pattern detection (Task 2) ────────────────────────────

/**
 * Detect patterns with high weight that are no longer appearing in recent tasks.
 */
export function detectStalePatterns(
  patterns: Patterns,
  taskHistory: TaskHistory,
  _metrics: Metrics,
): DiagnosticFinding[] {
  const findings: DiagnosticFinding[] = [];
  const tasks = taskHistory.tasks;
  const recentTasks = tasks.slice(-DEFAULT_STALENESS_WINDOW);
  const isSparseData = tasks.length < MIN_TASKS_FOR_STALENESS;

  // Collect all files referenced in recent tasks
  const recentFiles = new Set<string>();
  for (const task of recentTasks) {
    for (const file of task.prediction.actualFiles) {
      recentFiles.add(file);
    }
    for (const file of task.prediction.predictedFiles) {
      recentFiles.add(file);
    }
  }

  // Check type affinities for stale patterns
  let index = 0;
  for (const [taskType, affinity] of Object.entries(patterns.typeAffinities)) {
    if (affinity.confidence <= STALENESS_WEIGHT_THRESHOLD) continue;

    for (const file of affinity.files) {
      if (!recentFiles.has(file)) {
        // Determine severity based on how long it's been missing
        const lastSeenIdx = findLastTaskWithFile(tasks, file);
        const tasksSinceLastSeen = lastSeenIdx === -1 ? tasks.length : tasks.length - 1 - lastSeenIdx;
        const severity: FindingSeverity = tasksSinceLastSeen >= 10 ? 'critical' : 'medium';

        const description = `Pattern for "${taskType}" references "${file}" but it hasn't appeared in recent tasks`;
        const evidence = `weight ${affinity.confidence.toFixed(2)}, unused in last ${recentTasks.length} tasks` +
          (lastSeenIdx >= 0 ? `, last seen in task ${tasks[lastSeenIdx].id}` : ', never seen in history');

        const finding: DiagnosticFinding = {
          id: `f_stale_${String(index).padStart(3, '0')}`,
          type: 'stale-pattern',
          severity,
          description: isSparseData
            ? `${description} (limited data — accuracy may improve with more tasks)`
            : description,
          affectedFiles: [file],
          affectedDomain: getDomainForFile(file, taskHistory),
          evidence,
          recommendation: tasksSinceLastSeen >= 10
            ? 'Remove from active predictions'
            : 'Reduce weight',
        };
        findings.push(finding);
        index++;
      }
    }
  }

  return findings;
}

// ─── Missing co-occurrence detection (Task 3) ────────────────────

/**
 * Detect file pairs that consistently appear together but lack a formal pattern.
 */
export function detectMissingCooccurrences(
  taskHistory: TaskHistory,
  patterns: Patterns,
): DiagnosticFinding[] {
  const findings: DiagnosticFinding[] = [];
  const tasks = taskHistory.tasks;

  if (tasks.length < MIN_TASKS_FOR_PATTERN_DETECTION) {
    return findings; // Insufficient data
  }

  // Count file pair co-occurrences
  const pairCounts = new Map<string, number>();
  const fileCounts = new Map<string, number>();

  for (const task of tasks) {
    const files = [...new Set(task.prediction.actualFiles)];
    for (const file of files) {
      fileCounts.set(file, (fileCounts.get(file) ?? 0) + 1);
    }
    for (let i = 0; i < files.length; i++) {
      for (let j = i + 1; j < files.length; j++) {
        const key = makePairKey(files[i], files[j]);
        pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
      }
    }
  }

  // Build set of existing co-occurrence patterns for fast lookup
  const existingPatterns = new Set<string>();
  for (const cooc of patterns.coOccurrences) {
    existingPatterns.add(makePairKey(cooc.files[0], cooc.files[1]));
  }

  let index = 0;
  for (const [key, count] of pairCounts) {
    const ratio = count / tasks.length;
    if (ratio >= COOCCURRENCE_MIN_RATIO && !existingPatterns.has(key)) {
      const [fileA, fileB] = key.split('|||');
      findings.push({
        id: `f_cooccur_${String(index).padStart(3, '0')}`,
        type: 'missing-cooccurrence',
        severity: 'low',
        description: `Files "${fileA}" and "${fileB}" frequently appear together but have no formal co-occurrence pattern`,
        affectedFiles: [fileA, fileB],
        affectedDomain: getDomainForFile(fileA, taskHistory),
        evidence: `files appeared together in ${count}/${tasks.length} tasks (${Math.round(ratio * 100)}%)`,
        recommendation: `Add co-occurrence pattern (confidence: ${ratio.toFixed(2)})`,
      });
      index++;
    }
  }

  return findings;
}

// ─── Bad prediction detection (Task 4) ───────────────────────────

/**
 * Detect files that are consistently predicted but rarely used.
 */
export function detectBadPredictions(
  taskHistory: TaskHistory,
  _metrics: Metrics,
): DiagnosticFinding[] {
  const findings: DiagnosticFinding[] = [];
  const tasks = taskHistory.tasks;

  // Count predictions and actual usage per file
  const predictions = new Map<string, number>();
  const actualUse = new Map<string, number>();

  for (const task of tasks) {
    for (const file of task.prediction.predictedFiles) {
      predictions.set(file, (predictions.get(file) ?? 0) + 1);
    }
    for (const file of task.prediction.actualFiles) {
      actualUse.set(file, (actualUse.get(file) ?? 0) + 1);
    }
  }

  let index = 0;
  for (const [file, predCount] of predictions) {
    if (predCount < MIN_PREDICTIONS_FOR_BAD) {
      // Limited data, check if we should note it
      if (predCount >= 2) {
        const used = actualUse.get(file) ?? 0;
        const hitRate = used / predCount;
        if (hitRate < BAD_PREDICTION_HIT_THRESHOLD) {
          findings.push({
            id: `f_badpred_${String(index).padStart(3, '0')}`,
            type: 'bad-prediction',
            severity: 'low',
            description: `File "${file}" is predicted but rarely used (limited data — accuracy may improve with more tasks)`,
            affectedFiles: [file],
            affectedDomain: getDomainForFile(file, taskHistory),
            evidence: `predicted in ${predCount} tasks, used in ${used} (${Math.round(hitRate * 100)}% hit rate)`,
            recommendation: 'Monitor — limited data',
          });
          index++;
        }
      }
      continue;
    }

    const used = actualUse.get(file) ?? 0;
    const hitRate = used / predCount;

    if (hitRate < BAD_PREDICTION_HIT_THRESHOLD) {
      findings.push({
        id: `f_badpred_${String(index).padStart(3, '0')}`,
        type: 'bad-prediction',
        severity: 'medium',
        description: `File "${file}" is consistently predicted but rarely used`,
        affectedFiles: [file],
        affectedDomain: getDomainForFile(file, taskHistory),
        evidence: `predicted in ${predCount} tasks, used in ${used} (${Math.round(hitRate * 100)}% hit rate)`,
        recommendation: hitRate === 0 ? 'Remove from patterns' : 'Reduce prediction weight',
      });
      index++;
    }
  }

  return findings;
}

// ─── Health score calculation (Task 5) ───────────────────────────

/**
 * Calculate health score from findings and metrics.
 */
export function calculateHealthScore(
  findings: DiagnosticFinding[],
  metrics: Metrics,
  _taskHistory: TaskHistory,
): DiagnosticHealthScore {
  // Start at 1.0
  let overall = 1.0;

  for (const finding of findings) {
    overall -= SEVERITY_DEDUCTIONS[finding.severity] ?? 0;
  }

  overall = Math.max(0, Math.min(1.0, overall));

  // If no findings, base score on metrics accuracy
  if (findings.length === 0 && metrics.overall.totalTasks > 0) {
    const accuracyAvg = (metrics.overall.avgPrecision + metrics.overall.avgRecall) / 2;
    overall = Math.max(0, Math.min(1.0, accuracyAvg));
  }

  // Per-domain scores from metrics
  const perDomain: Record<string, number> = {};
  for (const [domain, dm] of Object.entries(metrics.perDomain)) {
    const domainAccuracy = (dm.avgPrecision + dm.avgRecall) / 2;
    perDomain[domain] = Math.max(0, Math.min(1.0, domainAccuracy));
  }

  return { overall, perDomain };
}

// ─── Diagnostic prompt builder (Task 6) ──────────────────────────

/**
 * Build a focused diagnostic prompt for Haiku model.
 * Stays under 300 tokens to leave room for response within 500-token budget.
 */
export function buildDiagnosticPrompt(
  findings: DiagnosticFinding[],
  context: DiagnosticContext,
): string {
  const summaryFindings = findings.slice(0, 5).map((f) => ({
    type: f.type,
    severity: f.severity,
    desc: f.description.slice(0, 80),
  }));

  return `You are a diagnostic agent analyzing knowledge store health.
Model: haiku
Stats: ${context.totalTasks} tasks, ${context.domainCount} domains, ${context.patternCount} patterns
Accuracy: precision=${context.recentAccuracy.precision.toFixed(2)}, recall=${context.recentAccuracy.recall.toFixed(2)}
Findings: ${JSON.stringify(summaryFindings)}
Provide: refined recommendations, priority ordering, any patterns missed.
Keep response under 200 tokens.`;
}

/**
 * Run diagnostic inference via adapter targeting Haiku model.
 * Falls back to empty result on failure.
 */
export async function runDiagnosticInference(
  prompt: string,
  projectRoot: string,
): Promise<Result<string>> {
  try {
    const result = await executeRaw(prompt, projectRoot);
    return ok(result.output);
  } catch (error) {
    logger.warn(MODULE, 'Diagnostic inference failed, falling back to local-only analysis', error);
    return err('Diagnostic inference unavailable');
  }
}

// ─── Diagnostic engine orchestrator (Task 7) ─────────────────────

/**
 * Run full diagnostic analysis on the knowledge store.
 */
export async function runDiagnostics(
  projectRoot: string,
  options: DiagnosticOptions = {},
): Promise<Result<DiagnosticReport>> {
  return withFailOpen(
    async () => {
      logger.debug(MODULE, `Running diagnostics (domain=${options.domain ?? 'all'}, reportOnly=${options.reportOnly ?? false})`);

      // Load required data
      const taskHistoryResult = readTaskHistory(projectRoot);
      if (!taskHistoryResult.ok) return err<DiagnosticReport>(`Cannot read task history: ${taskHistoryResult.error}`);

      const patternsResult = readPatterns(projectRoot);
      if (!patternsResult.ok) return err<DiagnosticReport>(`Cannot read patterns: ${patternsResult.error}`);

      const metricsResult = readMetrics(projectRoot);
      if (!metricsResult.ok) return err<DiagnosticReport>(`Cannot read metrics: ${metricsResult.error}`);

      let taskHistory = taskHistoryResult.value;
      let patterns = patternsResult.value;
      const metrics = metricsResult.value;

      // Domain filtering
      if (options.domain) {
        taskHistory = filterTaskHistoryByDomain(taskHistory, options.domain);
        patterns = filterPatternsByDomain(patterns, options.domain);
      }

      // Run all three detectors
      const staleFindings = detectStalePatterns(patterns, taskHistory, metrics);
      const cooccurrenceFindings = detectMissingCooccurrences(taskHistory, patterns);
      const badPredictionFindings = detectBadPredictions(taskHistory, metrics);

      // Combine and sort by severity
      const allFindings = [...staleFindings, ...cooccurrenceFindings, ...badPredictionFindings];
      allFindings.sort((a, b) => severityOrder(a.severity) - severityOrder(b.severity));

      // Calculate health score
      const healthScore = calculateHealthScore(allFindings, metrics, taskHistory);

      // Build recommendations
      const recommendations: Recommendation[] = allFindings.map((f) => ({
        findingId: f.id,
        action: f.recommendation,
        riskLevel: f.severity === 'critical' ? 'high' : f.severity === 'medium' ? 'medium' : 'low',
        description: f.recommendation,
      }));

      let tokensCost = 0;

      // AI-enhanced analysis (unless report-only)
      if (!options.reportOnly && allFindings.length > 0) {
        const context: DiagnosticContext = {
          totalTasks: taskHistory.tasks.length,
          recentAccuracy: {
            precision: metrics.overall.avgPrecision,
            recall: metrics.overall.avgRecall,
          },
          domainCount: Object.keys(metrics.perDomain).length,
          patternCount: patterns.coOccurrences.length + Object.keys(patterns.typeAffinities).length,
        };

        const prompt = buildDiagnosticPrompt(allFindings, context);
        const inferenceResult = await runDiagnosticInference(prompt, projectRoot);

        if (inferenceResult.ok) {
          // Estimate token cost from prompt + response
          tokensCost = Math.ceil((prompt.length + inferenceResult.value.length) / 4);
        }
      }

      const report: DiagnosticReport = {
        healthScore,
        findings: allFindings,
        recommendations,
        tokensCost,
        timestamp: new Date().toISOString(),
        domain: options.domain,
      };

      return ok(report);
    },
    Promise.resolve(ok<DiagnosticReport>({
      healthScore: { overall: 0, perDomain: {} },
      findings: [],
      recommendations: [],
      tokensCost: 0,
      timestamp: new Date().toISOString(),
      domain: options.domain,
    })),
    MODULE,
  ) as Promise<Result<DiagnosticReport>>;
}

// ─── Report rendering (Task 8) ──────────────────────────────────

/**
 * Render diagnostic report as styled terminal output.
 */
export function renderDiagnosticReport(report: DiagnosticReport, reportOnly: boolean = false): string {
  const lines: string[] = [];
  const scorePercent = Math.round(report.healthScore.overall * 100);

  // Box header
  lines.push('');
  lines.push(chalk.bold('\u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510'));
  lines.push(chalk.bold('\u2502  Doctor — Knowledge Store Diagnostics     \u2502'));
  lines.push(chalk.bold('\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518'));
  lines.push('');

  // Health score bar
  const filled = Math.round(scorePercent / 10);
  const empty = 10 - filled;
  const scoreBar = chalk.green('#'.repeat(filled)) + chalk.gray('.'.repeat(empty));
  const scoreColor = scorePercent >= 80 ? chalk.green : scorePercent >= 50 ? chalk.yellow : chalk.red;
  lines.push(`  Health Score: ${scoreColor(`${scorePercent}%`)} [${scoreBar}]`);

  if (report.domain) {
    lines.push(chalk.dim(`  Domain: ${report.domain}`));
  }
  lines.push('');

  // Per-domain breakdown
  const domains = Object.entries(report.healthScore.perDomain);
  if (domains.length > 0) {
    lines.push(chalk.bold('  Per-domain health:'));
    for (const [domain, score] of domains) {
      const dPercent = Math.round(score * 100);
      const dColor = dPercent >= 80 ? chalk.green : dPercent >= 50 ? chalk.yellow : chalk.red;
      lines.push(`    ${domain}: ${dColor(`${dPercent}%`)}`);
    }
    lines.push('');
  }

  // Findings
  if (report.findings.length === 0) {
    lines.push(chalk.green(`  Knowledge store health: ${scorePercent}/100 — No issues found`));
    lines.push('');
  } else {
    lines.push(chalk.bold(`  Findings (${report.findings.length}):`));
    for (const finding of report.findings) {
      const icon = severityIcon(finding.severity);
      lines.push(`    ${icon} [${finding.type}] ${finding.description}`);
      lines.push(chalk.dim(`      Evidence: ${finding.evidence}`));
      lines.push(chalk.dim(`      Fix: ${finding.recommendation}`));
    }
    lines.push('');
  }

  // Token cost
  if (report.tokensCost > 0) {
    lines.push(`  Cost: ${report.tokensCost} tokens (Haiku)`);
  } else {
    lines.push(`  Cost: 0 tokens (local analysis only)`);
  }
  lines.push('');

  // Fix options (unless report-only)
  if (!reportOnly && report.findings.length > 0) {
    lines.push(chalk.bold('  Actions:'));
    lines.push('    [1] Apply all recommended fixes');
    lines.push('    [2] Review one by one');
    lines.push('    [3] Skip');
    lines.push('');
  }

  return lines.join('\n');
}

// ─── Helpers ─────────────────────────────────────────────────────

function findLastTaskWithFile(tasks: TaskHistory['tasks'], file: string): number {
  for (let i = tasks.length - 1; i >= 0; i--) {
    const task = tasks[i];
    if (task.prediction.actualFiles.includes(file) || task.prediction.predictedFiles.includes(file)) {
      return i;
    }
  }
  return -1;
}

function getDomainForFile(file: string, taskHistory: TaskHistory): string {
  // Infer domain from task history classifications
  for (const task of taskHistory.tasks) {
    if (task.prediction.actualFiles.includes(file) || task.prediction.predictedFiles.includes(file)) {
      return task.classification.taskType;
    }
  }
  return 'unknown';
}

function makePairKey(a: string, b: string): string {
  return a < b ? `${a}|||${b}` : `${b}|||${a}`;
}

function severityOrder(severity: FindingSeverity): number {
  switch (severity) {
    case 'critical': return 0;
    case 'medium': return 1;
    case 'low': return 2;
    case 'info': return 3;
    default: return 4;
  }
}

function severityIcon(severity: FindingSeverity): string {
  switch (severity) {
    case 'critical': return chalk.red('\u2717');
    case 'medium': return chalk.yellow('\u26A0');
    case 'low': return chalk.yellow('\u26A0');
    case 'info': return chalk.blue('\u2139');
    default: return ' ';
  }
}

function filterTaskHistoryByDomain(taskHistory: TaskHistory, domain: string): TaskHistory {
  return {
    ...taskHistory,
    tasks: taskHistory.tasks.filter((t) =>
      t.classification.taskType.toLowerCase().includes(domain.toLowerCase()),
    ),
    count: taskHistory.tasks.filter((t) =>
      t.classification.taskType.toLowerCase().includes(domain.toLowerCase()),
    ).length,
  };
}

function filterPatternsByDomain(patterns: Patterns, domain: string): Patterns {
  const filteredAffinities: Record<string, typeof patterns.typeAffinities[string]> = {};
  for (const [key, val] of Object.entries(patterns.typeAffinities)) {
    if (key.toLowerCase().includes(domain.toLowerCase())) {
      filteredAffinities[key] = val;
    }
  }

  return {
    ...patterns,
    typeAffinities: filteredAffinities,
  };
}

// ─── Deep analysis (Story 7.4) ──────────────────────────────────

/**
 * Calculate archive metadata for deep analysis cost estimation.
 */
export function getArchiveMetadata(projectRoot: string): DeepAnalysisOptions {
  const archivePath = path.join(resolveStorePath(projectRoot), 'archive');
  let archiveSize = 0;

  try {
    const files = readdirSync(archivePath).filter((f) => f.startsWith('task-history-'));
    for (const file of files) {
      const filePath = path.join(archivePath, file);
      try {
        const stats = statSync(filePath);
        archiveSize += stats.size;
      } catch {
        // Skip files that can't be stat'd
      }
    }

    // Estimate task count from file size (~500 bytes per task entry average)
    const estimatedTasks = Math.max(0, Math.round(archiveSize / 500));
    const minTokens = DEEP_ANALYSIS_BASE_TOKENS;
    const maxTokens = DEEP_ANALYSIS_BASE_TOKENS + Math.ceil(estimatedTasks / 100) * DEEP_ANALYSIS_TOKENS_PER_100;

    return {
      archivePath,
      archiveSize: estimatedTasks,
      estimatedTokenCost: { min: minTokens, max: maxTokens },
      userApproved: false,
    };
  } catch {
    return {
      archivePath,
      archiveSize: 0,
      estimatedTokenCost: { min: DEEP_ANALYSIS_BASE_TOKENS, max: DEEP_ANALYSIS_BASE_TOKENS },
      userApproved: false,
    };
  }
}

/**
 * Render deep analysis prompt showing archive info and cost estimate.
 */
export function renderDeepAnalysisPrompt(options: DeepAnalysisOptions): string {
  const lines: string[] = [];
  lines.push('');
  lines.push(chalk.bold('Warning: Deep analysis reads archived task history.'));
  lines.push(`  Archive: ${options.archiveSize.toLocaleString()} tasks`);
  lines.push(`  Estimated cost: ~${options.estimatedTokenCost.min.toLocaleString()}-${options.estimatedTokenCost.max.toLocaleString()} tokens`);
  lines.push('');
  lines.push('  [1] Proceed with deep analysis');
  lines.push('  [2] Standard analysis only');
  lines.push('  [3] Cancel');
  lines.push('');
  return lines.join('\n');
}

/**
 * Prompt user for deep analysis approval.
 */
export async function promptDeepAnalysisApproval(): Promise<'proceed' | 'standard' | 'cancel'> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise<'proceed' | 'standard' | 'cancel'>((resolve) => {
    rl.question('Choose [1/2/3]: ', (answer) => {
      rl.close();
      const trimmed = answer.trim();
      if (trimmed === '1') resolve('proceed');
      else if (trimmed === '2') resolve('standard');
      else resolve('cancel');
    });
  });
}

/**
 * Run deep analysis by reading archived task history and extending diagnostics.
 */
export async function runDeepAnalysis(
  projectRoot: string,
  options: DeepAnalysisOptions,
): Promise<Result<DiagnosticFinding[]>> {
  try {
    const archivePath = options.archivePath;
    let archivedTasks: TaskHistory['tasks'] = [];

    try {
      const files = readdirSync(archivePath).filter((f) => f.startsWith('task-history-'));
      for (const file of files) {
        const filePath = path.join(archivePath, file);
        const result = readJSON<TaskHistory['tasks']>(filePath);
        if (result.ok) {
          archivedTasks = archivedTasks.concat(result.value);
        }
      }
    } catch {
      return ok([]); // No archive available — graceful fallback
    }

    if (archivedTasks.length === 0) {
      return ok([]);
    }

    // Read current patterns for comparison
    const patternsResult = readPatterns(projectRoot);
    const metricsResult = readMetrics(projectRoot);
    if (!patternsResult.ok || !metricsResult.ok) {
      return ok([]); // Graceful fallback
    }

    // Build extended task history with archived data
    const currentHistory = readTaskHistory(projectRoot);
    const allTasks = currentHistory.ok
      ? [...archivedTasks, ...currentHistory.value.tasks]
      : archivedTasks;

    const extendedHistory: TaskHistory = {
      schemaVersion: '1.0.0',
      cap: allTasks.length,
      count: allTasks.length,
      oldestArchive: null,
      tasks: allTasks,
    };

    // Run detectors on extended history
    const staleFindings = detectStalePatterns(patternsResult.value, extendedHistory, metricsResult.value);
    const cooccurrenceFindings = detectMissingCooccurrences(extendedHistory, patternsResult.value);
    const badPredictionFindings = detectBadPredictions(extendedHistory, metricsResult.value);

    const allFindings = [...staleFindings, ...cooccurrenceFindings, ...badPredictionFindings];

    // Tag deep analysis findings
    const deepFindings = allFindings.map((f) => ({
      ...f,
      id: f.id.replace(/^f_/, 'f_deep_'),
      evidence: `[deep analysis] ${f.evidence}`,
    }));

    return ok(deepFindings);
  } catch (error) {
    logger.error(MODULE, 'Deep analysis failed', error);
    return err(`Deep analysis failed: ${String(error)}`);
  }
}
