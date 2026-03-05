/**
 * Pre-flight checkup validation engine (Story 7.1).
 * All checks are local — zero token cost.
 */

import chalk from 'chalk';
import type { Result } from '../types/index.js';
import { ok, err, withFailOpen, logger, SCHEMA_VERSION, STORE_FILES, DEFAULT_BUDGET, DEFAULT_WINDOW_DURATION } from '../utils/index.js';
import {
  readConfig,
  readProjectMap,
  readDependencyGraph,
  readTaskHistory,
  readPatterns,
  readMetrics,
  readKeywordIndex,
  readDoctorLog,
  readSchemaVersion,
  writeConfig,
  writeDoctorLog,
  resolveStorePath,
  createDefaultConfig,
  createDefaultDoctorLog,
} from '../store/index.js';
import type {
  CheckItem,
  CheckupResult,
  CheckupIssue,
  CheckupFix,
} from './types.js';
import {
  CHECKUP_CRITICAL_DEDUCTION,
  CHECKUP_WARNING_DEDUCTION,
} from './types.js';

import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline';

const MODULE = 'doctor:checkup';

// ─── Main entry ─────────────────────────────────────────────────

/**
 * Run the full pre-flight checkup for a project.
 * Returns a CheckupResult with individual check items, score, and issues.
 */
export function runCheckup(projectRoot: string): Result<CheckupResult> {
  logger.debug(MODULE, `Running checkup for ${projectRoot}`);

  // First check if store directory exists
  const storeCheck = checkStoreDirectory(projectRoot);
  if (storeCheck.status === 'fail') {
    return err('Project not initialized. Run `co init` first.');
  }

  const checks: CheckItem[] = [storeCheck];

  // Run all individual checks with fail-open wrappers
  const jsonChecks = withFailOpen(
    () => checkJsonFiles(projectRoot),
    [makeFailItem('JSON Files', 'Unexpected error during JSON validation')],
    MODULE,
  );
  checks.push(...jsonChecks);

  checks.push(
    withFailOpen(
      () => checkProjectMap(projectRoot),
      makeFailItem('Project Map', 'Unexpected error checking project map'),
      MODULE,
    ),
  );

  checks.push(
    withFailOpen(
      () => checkDependencyGraph(projectRoot),
      makeFailItem('Dependency Graph', 'Unexpected error checking dependency graph'),
      MODULE,
    ),
  );

  checks.push(
    withFailOpen(
      () => checkKeywordIndex(projectRoot),
      makeFailItem('Keyword Index', 'Unexpected error checking keyword index'),
      MODULE,
    ),
  );

  checks.push(
    withFailOpen(
      () => checkStarterPack(projectRoot),
      makeFailItem('Starter Pack', 'Unexpected error checking starter pack'),
      MODULE,
    ),
  );

  checks.push(
    withFailOpen(
      () => checkConfig(projectRoot),
      makeFailItem('Config', 'Unexpected error checking config'),
      MODULE,
    ),
  );

  checks.push(
    withFailOpen(
      () => checkSchemaVersionFile(projectRoot),
      makeFailItem('Schema Version', 'Unexpected error checking schema version'),
      MODULE,
    ),
  );

  const score = calculateReadinessScore(checks);
  const issues = extractIssues(checks);
  const passed = score >= 60;

  return ok({ checks, score, issues, passed });
}

// ─── Individual checks ──────────────────────────────────────────

/**
 * Check that the .claude-opt/ directory exists.
 */
export function checkStoreDirectory(projectRoot: string): CheckItem {
  const storePath = resolveStorePath(projectRoot);
  if (existsSync(storePath)) {
    return {
      name: 'Store Directory',
      status: 'pass',
      detail: `.claude-opt/ directory exists`,
      severity: 'info',
    };
  }
  return {
    name: 'Store Directory',
    status: 'fail',
    detail: `.claude-opt/ directory not found — run \`co init\` first`,
    severity: 'critical',
  };
}

/**
 * Validate all 8 JSON store files exist and parse without error.
 */
export function checkJsonFiles(projectRoot: string): CheckItem[] {
  const items: CheckItem[] = [];
  const fileChecks: [string, (root: string) => Result<unknown>][] = [
    [STORE_FILES.config, readConfig],
    [STORE_FILES.projectMap, readProjectMap],
    [STORE_FILES.dependencyGraph, readDependencyGraph],
    [STORE_FILES.taskHistory, readTaskHistory],
    [STORE_FILES.patterns, readPatterns],
    [STORE_FILES.metrics, readMetrics],
    [STORE_FILES.keywordIndex, readKeywordIndex],
    [STORE_FILES.doctorLog, readDoctorLog],
  ];

  for (const [fileName, reader] of fileChecks) {
    const result = reader(projectRoot);
    if (result.ok) {
      items.push({
        name: `File: ${fileName}`,
        status: 'pass',
        detail: `${fileName} is valid JSON`,
        severity: 'info',
      });
    } else {
      items.push({
        name: `File: ${fileName}`,
        status: 'fail',
        detail: result.error,
        severity: 'critical',
      });
    }
  }

  return items;
}

/**
 * Verify project map is populated (has files, has domains).
 */
export function checkProjectMap(projectRoot: string): CheckItem {
  const result = readProjectMap(projectRoot);
  if (!result.ok) {
    return {
      name: 'Project Map Populated',
      status: 'fail',
      detail: 'Could not read project-map.json',
      severity: 'critical',
    };
  }

  const map = result.value;
  const fileCount = Object.keys(map.files).length;
  const domainCount = Object.keys(map.domains).length;

  if (fileCount === 0) {
    return {
      name: 'Project Map Populated',
      status: 'warn',
      detail: 'Project map has no files — scanner may not have run',
      severity: 'warning',
    };
  }

  if (domainCount === 0) {
    return {
      name: 'Project Map Populated',
      status: 'warn',
      detail: `Project map has ${fileCount} files but no domains assigned`,
      severity: 'warning',
    };
  }

  return {
    name: 'Project Map Populated',
    status: 'pass',
    detail: `${fileCount} files, ${domainCount} domains`,
    severity: 'info',
  };
}

/**
 * Verify dependency graph has edges (for code projects).
 */
export function checkDependencyGraph(projectRoot: string): CheckItem {
  const result = readDependencyGraph(projectRoot);
  if (!result.ok) {
    return {
      name: 'Dependency Graph',
      status: 'fail',
      detail: 'Could not read dependency-graph.json',
      severity: 'critical',
    };
  }

  const graph = result.value;
  const edgeCount = graph.edges.length;
  const nodeCount = Object.keys(graph.adjacency).length;

  if (edgeCount === 0 && nodeCount === 0) {
    return {
      name: 'Dependency Graph',
      status: 'warn',
      detail: 'Dependency graph is empty — scanner may not have run',
      severity: 'warning',
    };
  }

  // Check for isolated nodes (nodes with no imports and no importedBy)
  let isolatedNodes = 0;
  for (const [, entry] of Object.entries(graph.adjacency)) {
    if (entry.imports.length === 0 && entry.importedBy.length === 0) {
      isolatedNodes++;
    }
  }

  if (isolatedNodes > 0 && edgeCount > 0) {
    return {
      name: 'Dependency Graph',
      status: 'warn',
      detail: `${edgeCount} edges, ${isolatedNodes} isolated node(s)`,
      severity: 'warning',
    };
  }

  if (edgeCount === 0 && nodeCount > 0) {
    return {
      name: 'Dependency Graph',
      status: 'warn',
      detail: `${nodeCount} nodes but 0 edges — may be a non-code project`,
      severity: 'warning',
    };
  }

  return {
    name: 'Dependency Graph',
    status: 'pass',
    detail: `${edgeCount} edges, ${nodeCount} nodes`,
    severity: 'info',
  };
}

/**
 * Verify keyword index is populated.
 */
export function checkKeywordIndex(projectRoot: string): CheckItem {
  const result = readKeywordIndex(projectRoot);
  if (!result.ok) {
    return {
      name: 'Keyword Index',
      status: 'fail',
      detail: 'Could not read keyword-index.json',
      severity: 'critical',
    };
  }

  const index = result.value;
  const keywordCount = Object.keys(index.keywordToFiles).length;

  if (keywordCount === 0) {
    return {
      name: 'Keyword Index',
      status: 'warn',
      detail: 'Keyword index is empty — scanner may not have run',
      severity: 'warning',
    };
  }

  return {
    name: 'Keyword Index',
    status: 'pass',
    detail: `${keywordCount} keywords indexed`,
    severity: 'info',
  };
}

/**
 * Verify starter pack was loaded (if applicable).
 * Currently checks config for a starterPack field or patterns for conventions.
 */
export function checkStarterPack(projectRoot: string): CheckItem {
  const configResult = readConfig(projectRoot);
  if (!configResult.ok) {
    return {
      name: 'Starter Pack',
      status: 'warn',
      detail: 'Could not read config to check starter pack status',
      severity: 'warning',
    };
  }

  // Check if patterns have conventions loaded (sign of starter pack)
  const patternsResult = readPatterns(projectRoot);
  if (patternsResult.ok && patternsResult.value.conventions.length > 0) {
    return {
      name: 'Starter Pack',
      status: 'pass',
      detail: `${patternsResult.value.conventions.length} conventions loaded`,
      severity: 'info',
    };
  }

  return {
    name: 'Starter Pack',
    status: 'pass',
    detail: 'No starter pack loaded — optional, conventions will be learned over time',
    severity: 'info',
  };
}

/**
 * Verify config.json has valid required fields.
 */
export function checkConfig(projectRoot: string): CheckItem {
  const result = readConfig(projectRoot);
  if (!result.ok) {
    return {
      name: 'Config Valid',
      status: 'fail',
      detail: 'Could not read config.json',
      severity: 'critical',
    };
  }

  const config = result.value;
  const issues: string[] = [];

  if (typeof config.tokenBudget !== 'number' || config.tokenBudget <= 0) {
    issues.push('tokenBudget is invalid');
  }
  if (typeof config.windowDurationMs !== 'number' || config.windowDurationMs <= 0) {
    issues.push('windowDurationMs is invalid');
  }
  if (!config.doctorMode || (config.doctorMode !== 'supervised' && config.doctorMode !== 'autonomous')) {
    issues.push('doctorMode is not set or invalid');
  }

  if (issues.length > 0) {
    return {
      name: 'Config Valid',
      status: 'warn',
      detail: `Config issues: ${issues.join(', ')}`,
      severity: 'warning',
    };
  }

  return {
    name: 'Config Valid',
    status: 'pass',
    detail: `Budget: ${config.tokenBudget}, Window: ${config.windowDurationMs}ms, Doctor: ${config.doctorMode}`,
    severity: 'info',
  };
}

/**
 * Verify .schema-version matches the installed SCHEMA_VERSION.
 */
export function checkSchemaVersionFile(projectRoot: string): CheckItem {
  const result = readSchemaVersion(projectRoot);
  if (!result.ok) {
    return {
      name: 'Schema Version',
      status: 'fail',
      detail: '.schema-version file not found',
      severity: 'critical',
    };
  }

  const expected = SCHEMA_VERSION + '.0.0';
  const actual = result.value.trim();

  if (actual !== expected) {
    return {
      name: 'Schema Version',
      status: 'fail',
      detail: `Schema version mismatch: found "${actual}", expected "${expected}"`,
      severity: 'critical',
    };
  }

  return {
    name: 'Schema Version',
    status: 'pass',
    detail: `Schema version ${actual} matches installed version`,
    severity: 'info',
  };
}

// ─── Score calculation ──────────────────────────────────────────

/**
 * Calculate readiness score from 0–100.
 * Critical failures deduct 25 points each.
 * Warnings deduct 10 points each.
 * Info items deduct 0 points.
 */
export function calculateReadinessScore(checks: CheckItem[]): number {
  let score = 100;

  for (const check of checks) {
    if (check.status === 'fail' && check.severity === 'critical') {
      score -= CHECKUP_CRITICAL_DEDUCTION;
    } else if (check.status === 'warn' && check.severity === 'warning') {
      score -= CHECKUP_WARNING_DEDUCTION;
    } else if (check.status === 'fail' && check.severity === 'warning') {
      score -= CHECKUP_WARNING_DEDUCTION;
    }
  }

  return Math.max(0, Math.min(100, score));
}

// ─── Issue extraction ───────────────────────────────────────────

/**
 * Extract issues from check items that are not passing.
 */
function extractIssues(checks: CheckItem[]): CheckupIssue[] {
  const issues: CheckupIssue[] = [];

  for (const check of checks) {
    if (check.status === 'pass') {
      continue;
    }

    const isFixable = determineIfFixable(check);
    issues.push({
      check: check.name,
      severity: check.severity,
      message: check.detail,
      isFixable,
      fixDescription: isFixable ? getFixDescription(check) : undefined,
    });
  }

  return issues;
}

/**
 * Determine whether a check issue can be auto-fixed.
 */
function determineIfFixable(check: CheckItem): boolean {
  if (check.name === 'File: doctor-log.json' && check.status === 'fail') return true;
  if (check.name === 'Config Valid' && check.status === 'warn') return true;
  return false;
}

/**
 * Get a human-readable description of what the auto-fix will do.
 */
function getFixDescription(check: CheckItem): string {
  if (check.name === 'File: doctor-log.json') return 'Create default doctor-log.json';
  if (check.name === 'Config Valid') return 'Populate missing config values with defaults';
  return 'Unknown fix';
}

// ─── Auto-fix engine ────────────────────────────────────────────

/**
 * Apply fixes for fixable issues.
 * Each fix writes through the store module with atomic writes.
 */
export function applyCheckupFixes(issues: CheckupIssue[], projectRoot: string): CheckupFix[] {
  const fixes: CheckupFix[] = [];

  for (const issue of issues) {
    if (!issue.isFixable) {
      fixes.push({ issue, applied: false, result: 'Not auto-fixable' });
      continue;
    }

    const fix = withFailOpen(
      () => applyFix(issue, projectRoot),
      { issue, applied: false, result: 'Fix threw an unexpected error' },
      MODULE,
    );
    fixes.push(fix);
  }

  return fixes;
}

/**
 * Apply a single fix for a checkup issue.
 */
function applyFix(issue: CheckupIssue, projectRoot: string): CheckupFix {
  if (issue.check === 'File: doctor-log.json') {
    const defaultLog = createDefaultDoctorLog();
    const result = writeDoctorLog(projectRoot, defaultLog);
    if (result.ok) {
      return { issue, applied: true, result: 'Created default doctor-log.json' };
    }
    return { issue, applied: false, result: `Failed to create doctor-log.json: ${result.error}` };
  }

  if (issue.check === 'Config Valid') {
    const configResult = readConfig(projectRoot);
    if (!configResult.ok) {
      // Config doesn't exist, create default
      const defaultConfig = createDefaultConfig('project');
      const result = writeConfig(projectRoot, defaultConfig);
      if (result.ok) {
        return { issue, applied: true, result: 'Created default config.json' };
      }
      return { issue, applied: false, result: `Failed: ${result.error}` };
    }

    // Config exists but has invalid values — fix them
    const config = { ...configResult.value };
    if (typeof config.tokenBudget !== 'number' || config.tokenBudget <= 0) {
      config.tokenBudget = DEFAULT_BUDGET;
    }
    if (typeof config.windowDurationMs !== 'number' || config.windowDurationMs <= 0) {
      config.windowDurationMs = DEFAULT_WINDOW_DURATION;
    }
    if (!config.doctorMode || (config.doctorMode !== 'supervised' && config.doctorMode !== 'autonomous')) {
      config.doctorMode = 'supervised';
    }
    config.updatedAt = new Date().toISOString();

    const result = writeConfig(projectRoot, config);
    if (result.ok) {
      return { issue, applied: true, result: 'Updated config with valid defaults' };
    }
    return { issue, applied: false, result: `Failed: ${result.error}` };
  }

  return { issue, applied: false, result: 'No fix handler for this issue' };
}

// ─── CLI output rendering ───────────────────────────────────────

/**
 * Render the checkup report as a styled terminal string.
 */
export function renderCheckupReport(result: CheckupResult): string {
  const lines: string[] = [];
  const PASS = chalk.green('\u2713');
  const WARN = chalk.yellow('\u26A0');
  const FAIL = chalk.red('\u2717');

  lines.push('');
  lines.push(chalk.bold('\u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510'));
  lines.push(chalk.bold('\u2502  Pre-Flight Checkup                      \u2502'));
  lines.push(chalk.bold('\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518'));
  lines.push('');

  // Individual checks
  for (const check of result.checks) {
    let icon: string;
    if (check.status === 'pass') icon = PASS;
    else if (check.status === 'warn') icon = WARN;
    else icon = FAIL;

    lines.push(`  ${icon} ${check.name}: ${check.detail}`);
  }

  lines.push('');

  // Readiness score
  const scoreBar = renderScoreBar(result.score);
  lines.push(`  Setup health: ${result.score}% ${scoreBar}`);

  if (result.score >= 90) {
    lines.push(chalk.green('  Ready to go!'));
  } else if (result.score >= 60) {
    lines.push(chalk.yellow('  Ready with warnings'));
  } else {
    lines.push(chalk.red('  Needs attention'));
  }

  lines.push('');

  // Issues
  if (result.issues.length > 0) {
    lines.push(chalk.bold('  Issues found:'));
    for (const issue of result.issues) {
      let color: (s: string) => string;
      if (issue.severity === 'critical') color = chalk.red;
      else if (issue.severity === 'warning') color = chalk.yellow;
      else color = chalk.blue;

      const fixTag = issue.isFixable ? chalk.gray(' [fixable]') : '';
      lines.push(`    ${color(`[${issue.severity}]`)} ${issue.message}${fixTag}`);
    }
    lines.push('');
    lines.push('  Options:');
    lines.push('    [1] Auto-fix what I can');
    lines.push('    [2] Continue anyway');
    lines.push('    [3] I\'ll fix manually');
    lines.push('');
  } else {
    lines.push(`  Run your first task with ${chalk.cyan('`co "your task"`')}`);
    lines.push(chalk.gray('  Tip: Prediction accuracy improves over the first 5-10 sessions'));
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Render the score as filled/empty circles.
 */
function renderScoreBar(score: number): string {
  const filled = Math.round(score / 10);
  const empty = 10 - filled;
  return chalk.green('\u25CF'.repeat(filled)) + chalk.gray('\u25CB'.repeat(empty));
}

/**
 * Render the post-fix summary.
 */
export function renderFixSummary(fixes: CheckupFix[]): string {
  const lines: string[] = [];
  lines.push('');
  lines.push(chalk.bold('  Auto-fix results:'));

  for (const fix of fixes) {
    if (fix.applied) {
      lines.push(`    ${chalk.green('\u2713')} ${fix.result}`);
    } else {
      lines.push(`    ${chalk.red('\u2717')} ${fix.issue.check}: ${fix.result}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

// ─── User interaction ───────────────────────────────────────────

/**
 * Handle the checkup user interaction flow.
 * Prompts the user for a choice when issues are found.
 */
export async function handleCheckupInteraction(
  result: CheckupResult,
  projectRoot: string,
): Promise<void> {
  // Display the report
  process.stdout.write(renderCheckupReport(result));

  if (result.issues.length === 0) {
    // No issues — nothing to prompt
    return;
  }

  // Prompt for choice
  const choice = await promptUser('Choose an option [1/2/3]: ');

  if (choice === '1') {
    // Auto-fix
    const fixes = applyCheckupFixes(result.issues, projectRoot);
    process.stdout.write(renderFixSummary(fixes));

    // Recalculate score
    const recheck = runCheckup(projectRoot);
    if (recheck.ok) {
      process.stdout.write(`  Recalculated health: ${recheck.value.score}%\n\n`);
    }
  } else if (choice === '2') {
    process.stdout.write(chalk.yellow('\n  Continuing with issues. Some features may not work correctly.\n\n'));
  } else {
    // Choice 3 or any other input — manual fix
    process.stdout.write(chalk.bold('\n  Manual fix instructions:\n'));
    for (const issue of result.issues) {
      process.stdout.write(`    - ${issue.check}: ${issue.message}\n`);
    }
    process.stdout.write('\n');
  }
}

/**
 * Prompt user for input using Node.js readline.
 */
function promptUser(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(question, (answer: string) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// ─── Helpers ────────────────────────────────────────────────────

/**
 * Create a fail CheckItem for error fallbacks.
 */
function makeFailItem(name: string, detail: string): CheckItem {
  return { name, status: 'fail', detail, severity: 'critical' };
}
