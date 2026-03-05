/**
 * Knowledge domain inspection — renders `co knowledge <domain>` output.
 * Implements AC1-AC4: domain file inspection, patterns, accuracy, and health indicator.
 */

import chalk from 'chalk';
import { readProjectMap, readPatterns, readTaskHistory, readMetrics } from '../store/index.js';
import type {
  KnowledgeDisplayData,
  DomainFileEntry,
  DomainPattern,
  DomainHealth,
  DomainSummary,
} from './types.js';
import { drawBox, formatPercentage } from './formatters.js';

const HEALTH_WEIGHTS = { accuracy: 0.4, taskCount: 0.2, recency: 0.2, patternCount: 0.2 };
const HIGH_CONFIDENCE_THRESHOLD = 0.7;

/**
 * Gather knowledge data for a specific domain.
 */
export function gatherKnowledgeData(projectRoot: string, domain: string): KnowledgeDisplayData {
  const projectMapResult = readProjectMap(projectRoot);
  const patternsResult = readPatterns(projectRoot);
  const taskHistoryResult = readTaskHistory(projectRoot);
  const metricsResult = readMetrics(projectRoot);

  // Build domain-to-files mapping from project map
  const domainFiles: DomainFileEntry[] = [];
  if (projectMapResult.ok) {
    const pm = projectMapResult.value;
    const domainFilePaths = pm.domains[domain] ?? [];
    for (const filePath of domainFilePaths) {
      const fileEntry = pm.files[filePath];
      if (fileEntry) {
        domainFiles.push({
          path: filePath,
          weight: 0.5, // default weight, refined below
          timesSeen: 0,
        });
      }
    }
  }

  // If domain not found in project map, check task history for domain references
  if (domainFiles.length === 0 && taskHistoryResult.ok) {
    const tasks = taskHistoryResult.value.tasks.filter(
      (t) => t.classification?.taskType?.toLowerCase() === domain.toLowerCase()
        || t.prediction?.predictedFiles?.some((f) => f.toLowerCase().includes(domain.toLowerCase())),
    );
    if (tasks.length === 0) {
      // Domain not found at all
      return {
        isDomainFound: false,
        domain,
        availableDomains: listAvailableDomains(projectRoot),
      };
    }

    // Build files from task history
    const fileCounts: Record<string, number> = {};
    for (const task of tasks) {
      for (const file of task.prediction?.predictedFiles ?? []) {
        fileCounts[file] = (fileCounts[file] ?? 0) + 1;
      }
    }
    const maxCount = Math.max(...Object.values(fileCounts), 1);
    for (const [path, count] of Object.entries(fileCounts)) {
      domainFiles.push({ path, weight: count / maxCount, timesSeen: count });
    }
  }

  // Enrich files with task history counts if available
  if (taskHistoryResult.ok && domainFiles.length > 0) {
    const tasks = taskHistoryResult.value.tasks;
    for (const df of domainFiles) {
      if (df.timesSeen === 0) {
        df.timesSeen = tasks.filter(
          (t) => t.prediction?.predictedFiles?.includes(df.path) || t.prediction?.actualFiles?.includes(df.path),
        ).length;
      }
    }
    // Recalculate weights from times-seen
    const maxSeen = Math.max(...domainFiles.map((f) => f.timesSeen), 1);
    for (const df of domainFiles) {
      if (df.weight === 0.5 && df.timesSeen > 0) {
        df.weight = Math.round((df.timesSeen / maxSeen) * 100) / 100;
      }
    }
  }

  // Sort files by weight descending
  domainFiles.sort((a, b) => b.weight - a.weight);

  // Extract patterns for domain
  const domainPatterns: DomainPattern[] = [];
  const conventions: string[] = [];
  if (patternsResult.ok) {
    const patterns = patternsResult.value;
    // Co-occurrences involving domain files
    const domainPaths = new Set(domainFiles.map((f) => f.path));
    for (const coOcc of patterns.coOccurrences) {
      if (domainPaths.has(coOcc.files[0]) || domainPaths.has(coOcc.files[1])) {
        domainPatterns.push({
          files: coOcc.files,
          confidence: coOcc.confidence,
        });
      }
    }
    domainPatterns.sort((a, b) => b.confidence - a.confidence);

    // Conventions
    for (const conv of patterns.conventions) {
      conventions.push(conv.description || conv.pattern);
    }
  }

  // Calculate domain accuracy
  let precision = 0;
  let recall = 0;
  let domainTaskCount = 0;
  if (metricsResult.ok && metricsResult.value.perDomain[domain]) {
    const dm = metricsResult.value.perDomain[domain];
    precision = dm.avgPrecision;
    recall = dm.avgRecall;
    domainTaskCount = dm.totalTasks;
  } else if (taskHistoryResult.ok) {
    // Calculate from task history
    const domainPaths = new Set(domainFiles.map((f) => f.path));
    const domainTasks = taskHistoryResult.value.tasks.filter(
      (t) => t.prediction?.predictedFiles?.some((f) => domainPaths.has(f)),
    );
    domainTaskCount = domainTasks.length;
    if (domainTasks.length > 0) {
      let totalPrec = 0;
      let totalRec = 0;
      for (const t of domainTasks) {
        totalPrec += t.prediction?.precision ?? 0;
        totalRec += t.prediction?.recall ?? 0;
      }
      precision = totalPrec / domainTasks.length;
      recall = totalRec / domainTasks.length;
    }
  }

  // Calculate health score
  const health = calculateDomainHealth(precision, domainTaskCount, taskHistoryResult.ok ? taskHistoryResult.value.tasks : [], domainPatterns.length);

  return {
    isDomainFound: true,
    domain,
    files: domainFiles,
    patterns: domainPatterns,
    conventions,
    precision,
    recall,
    taskCount: domainTaskCount,
    health,
  };
}

/**
 * List all available domains with task counts.
 */
export function listAvailableDomains(projectRoot: string): DomainSummary[] {
  const domains: DomainSummary[] = [];

  const projectMapResult = readProjectMap(projectRoot);
  const metricsResult = readMetrics(projectRoot);

  // From project map domains
  if (projectMapResult.ok) {
    for (const [name, files] of Object.entries(projectMapResult.value.domains)) {
      domains.push({ name, taskCount: files.length, accuracy: 0 });
    }
  }

  // Enrich with metrics
  if (metricsResult.ok) {
    for (const [name, dm] of Object.entries(metricsResult.value.perDomain)) {
      const existing = domains.find((d) => d.name === name);
      if (existing) {
        existing.taskCount = dm.totalTasks;
        existing.accuracy = dm.avgPrecision;
      } else {
        domains.push({ name, taskCount: dm.totalTasks, accuracy: dm.avgPrecision });
      }
    }
  }

  domains.sort((a, b) => b.taskCount - a.taskCount);
  return domains;
}

/**
 * Render the knowledge display for a domain.
 */
export function renderKnowledge(
  data: KnowledgeDisplayData,
  options?: { filesOnly?: boolean; patternsOnly?: boolean },
): string {
  if (!data.isDomainFound) {
    const lines: string[] = [
      ` Domain "${data.domain}" not found.`,
      '',
      ' Available domains:',
    ];
    if (data.availableDomains && data.availableDomains.length > 0) {
      for (const d of data.availableDomains) {
        lines.push(`   ${d.name.padEnd(25)} ${d.taskCount} tasks`);
      }
    } else {
      lines.push('   (none — run some tasks first)');
    }
    return drawBox(`Knowledge: ${data.domain}`, lines);
  }

  const lines: string[] = [];

  // Files section
  if (!options?.patternsOnly) {
    lines.push(chalk.bold(` Files (${data.files?.length ?? 0}):`));
    for (const file of data.files ?? []) {
      const icon = file.weight >= HIGH_CONFIDENCE_THRESHOLD ? '\u2726' : '\u25cb';
      const weightStr = file.weight.toFixed(2);
      lines.push(`   ${icon} ${file.path.padEnd(25)} weight: ${weightStr}  seen: ${file.timesSeen}x`);
    }
    lines.push('');
  }

  // Patterns section
  if (!options?.filesOnly) {
    if ((data.patterns?.length ?? 0) > 0) {
      lines.push(chalk.bold(` Patterns (${data.patterns!.length}):`));
      for (const p of data.patterns!) {
        const icon = p.confidence >= HIGH_CONFIDENCE_THRESHOLD ? '\u2726' : '\u25cb';
        const shortA = shortenPath(p.files[0]);
        const shortB = shortenPath(p.files[1]);
        lines.push(`   ${icon} ${shortA} + ${shortB} co-occur (conf: ${p.confidence.toFixed(2)})`);
      }
      lines.push('');
    }

    if ((data.conventions?.length ?? 0) > 0) {
      lines.push(chalk.bold(' Conventions:'));
      for (const c of data.conventions!) {
        lines.push(`   "${c}"`);
      }
      lines.push('');
    }
  }

  // Accuracy line
  lines.push(` Accuracy: ${formatPercentage(data.precision ?? 0)} precision | ${formatPercentage(data.recall ?? 0)} recall | ${data.taskCount ?? 0} tasks`);

  // Health indicator
  if (data.health) {
    const filled = '\u25cf'.repeat(data.health.dots);
    const empty = '\u25cb'.repeat(5 - data.health.dots);
    lines.push(` Health: ${filled}${empty} ${data.health.label}`);
  }

  return drawBox(`Knowledge: ${data.domain}`, lines);
}

/**
 * Run the `co knowledge` command.
 */
export async function runKnowledgeCommand(
  projectRoot: string,
  domain: string,
  options?: { all?: boolean; files?: boolean; patterns?: boolean },
): Promise<void> {
  if (options?.all) {
    const domains = listAvailableDomains(projectRoot);
    if (domains.length === 0) {
      console.log('No domains found. Run some tasks first.');
      return;
    }
    for (const d of domains) {
      const data = gatherKnowledgeData(projectRoot, d.name);
      console.log(renderKnowledge(data));
      console.log('');
    }
    return;
  }

  const data = gatherKnowledgeData(projectRoot, domain);
  console.log(renderKnowledge(data, { filesOnly: options?.files, patternsOnly: options?.patterns }));
}

/**
 * Calculate domain health as a composite score.
 */
function calculateDomainHealth(
  accuracy: number,
  taskCount: number,
  allTasks: { timestamp: string }[],
  patternCount: number,
): DomainHealth {
  const recency = calculateRecency(allTasks);
  const score =
    accuracy * HEALTH_WEIGHTS.accuracy +
    normalize(taskCount, 0, 50) * HEALTH_WEIGHTS.taskCount +
    recency * HEALTH_WEIGHTS.recency +
    normalize(patternCount, 0, 10) * HEALTH_WEIGHTS.patternCount;

  const dots = Math.max(1, Math.min(5, Math.round(score * 5)));
  const labels = ['Poor', 'Fair', 'Good', 'Very Good', 'Excellent'];
  return { score, dots, label: labels[dots - 1] };
}

/**
 * Normalize a value to 0-1 range.
 */
function normalize(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

/**
 * Calculate recency score (0-1) based on most recent task timestamp.
 */
function calculateRecency(tasks: { timestamp: string }[]): number {
  if (tasks.length === 0) return 0;
  const now = Date.now();
  const mostRecent = Math.max(...tasks.map((t) => new Date(t.timestamp).getTime()));
  const ageMs = now - mostRecent;
  const dayMs = 86_400_000;
  // Within 1 day = 1.0, decays over 30 days
  return Math.max(0, 1 - ageMs / (30 * dayMs));
}

/**
 * Shorten a file path to just the filename.
 */
function shortenPath(filePath: string): string {
  const parts = filePath.split('/');
  return parts[parts.length - 1];
}
