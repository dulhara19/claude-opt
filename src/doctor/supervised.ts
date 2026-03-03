/**
 * Supervised Doctor mode — threshold detection, fix proposals, and user-approved fixes (Story 7.3).
 */

import chalk from 'chalk';
import { createInterface } from 'node:readline';
import type { Result, Metrics } from '../types/index.js';
import { ok, err, logger } from '../utils/index.js';
import { DOCTOR_ACCURACY_THRESHOLD } from '../utils/index.js';
import {
  readPatterns,
  writePatterns,
} from '../store/index.js';
import { runDiagnostics } from './doctor.js';
import type {
  ThresholdAlert,
  AlertChoice,
  FixAction,
  FixProposal,
  FixResult,
  SupervisedSession,
  DiagnosticFinding,
  DomainCooldown,
  DoctorOverride,
} from './types.js';
import { MIN_TASKS_FOR_THRESHOLD, DEFAULT_COOLDOWN_TASKS, DEFAULT_COOLDOWN_MS, DEFAULT_OVERRIDE_GRACE_PERIOD } from './types.js';

const MODULE = 'doctor:supervised';

// ─── Task 2: Threshold detection ──────────────────────────────────

/**
 * Check per-domain prediction accuracy against the threshold.
 * D2: Uses F1 score (harmonic mean of precision and recall) instead of precision-only.
 * Returns alerts for domains that have breached the threshold.
 * Skips domains with fewer than MIN_TASKS_FOR_THRESHOLD tasks.
 */
export function checkThresholds(
  metrics: Metrics,
  threshold: number = DOCTOR_ACCURACY_THRESHOLD,
): ThresholdAlert[] {
  const alerts: ThresholdAlert[] = [];
  const now = new Date().toISOString();

  for (const [domain, dm] of Object.entries(metrics.perDomain)) {
    if (dm.totalTasks < MIN_TASKS_FOR_THRESHOLD) {
      continue;
    }

    // D2: F1 score instead of precision-only
    const f1 = computeF1(dm.avgPrecision, dm.avgRecall);

    if (f1 < threshold) {
      alerts.push({
        domain,
        currentAccuracy: f1,
        threshold,
        timestamp: now,
        currentPrecision: dm.avgPrecision,
        currentRecall: dm.avgRecall,
      });
    }
  }

  return alerts;
}

/**
 * Compute F1 score (harmonic mean of precision and recall).
 * Returns 0 if both precision and recall are 0.
 */
export function computeF1(precision: number, recall: number): number {
  const sum = precision + recall;
  if (sum === 0) return 0;
  return (2 * precision * recall) / sum;
}

// ─── Task 3: Alert rendering and interaction ──────────────────────

/**
 * Render a threshold alert in box-drawing UI style matching the PRD mockup.
 */
export function renderThresholdAlert(alert: ThresholdAlert): string {
  const accuracyPercent = Math.round(alert.currentAccuracy * 100);
  const thresholdPercent = Math.round(alert.threshold * 100);

  const lines: string[] = [];
  lines.push('');
  lines.push(chalk.bold('+-- Doctor Alert ----------------------------------------+'));
  lines.push(chalk.bold('|                                                         |'));
  lines.push(chalk.bold(`| Prediction accuracy in "${alert.domain}" domain dropped      |`));
  lines.push(chalk.bold(`| to ${accuracyPercent}% (threshold: ${thresholdPercent}%).                                |`));
  lines.push(chalk.bold('|                                                         |'));
  lines.push(chalk.bold('| [1] Let Doctor diagnose                                 |'));
  lines.push(chalk.bold('| [2] I\'ll handle it manually                             |'));
  lines.push(chalk.bold('| [3] Dismiss                                             |'));
  lines.push(chalk.bold('+---------------------------------------------------------+'));
  lines.push('');

  return lines.join('\n');
}

/**
 * Prompt the user for their choice after seeing a threshold alert.
 */
export async function promptAlertChoice(): Promise<AlertChoice> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise<AlertChoice>((resolve) => {
    rl.question('Choose [1/2/3]: ', (answer) => {
      rl.close();
      const trimmed = answer.trim();
      if (trimmed === '1') resolve('diagnose');
      else if (trimmed === '2') resolve('manual');
      else resolve('dismiss');
    });
  });
}

// ─── D9: Alert cooldown / fatigue prevention ─────────────────────

/**
 * Filter alerts through cooldown state (D9).
 * Suppresses alerts for domains that were recently dismissed or fixed.
 */
export function filterCooledDownAlerts(
  alerts: ThresholdAlert[],
  cooldowns: DomainCooldown[],
  currentTaskCount: number,
): ThresholdAlert[] {
  const now = Date.now();
  return alerts.filter((alert) => {
    const cooldown = cooldowns.find((c) => c.domain === alert.domain);
    if (!cooldown) return true; // No cooldown — allow alert

    // Check time-based cooldown
    const cooldownUntil = new Date(cooldown.cooldownUntil).getTime();
    if (now < cooldownUntil) return false; // Still in time cooldown

    // Check task-count cooldown
    const tasksSinceDismissal = currentTaskCount - cooldown.taskCountAtDismissal;
    if (tasksSinceDismissal < DEFAULT_COOLDOWN_TASKS) return false; // Not enough tasks since

    return true; // Cooldown expired — allow alert
  });
}

/**
 * Create a cooldown entry for a dismissed domain (D9).
 */
export function createCooldown(
  domain: string,
  currentTaskCount: number,
): DomainCooldown {
  const now = new Date();
  return {
    domain,
    dismissedAt: now.toISOString(),
    cooldownUntil: new Date(now.getTime() + DEFAULT_COOLDOWN_MS).toISOString(),
    taskCountAtDismissal: currentTaskCount,
  };
}

// ─── Task 4: Fix proposal generation ──────────────────────────────

/**
 * Generate fix proposals from diagnostic findings.
 * Informational findings (thin-domain, declining-accuracy, cross-domain, info severity) do not get proposals.
 * D7: Proposals are scored by confidence and sorted descending.
 */
export function generateFixProposals(findings: DiagnosticFinding[]): FixProposal[] {
  const proposals: FixProposal[] = [];

  for (const finding of findings) {
    let action: FixAction | undefined;
    let riskLevel: 'low' | 'medium' | 'high';
    let explanation: string;

    switch (finding.type) {
      case 'stale-pattern':
        action = 'remove-stale';
        riskLevel = 'low';
        explanation = `Pattern has not appeared in recent tasks. Evidence: ${finding.evidence}. Setting weight to 0.0 (soft delete preserves history).`;
        break;

      case 'missing-cooccurrence':
        action = 'add-cooccurrence';
        riskLevel = 'low';
        explanation = `Files frequently appear together but lack a formal pattern. Evidence: ${finding.evidence}. Adding co-occurrence will improve prediction accuracy.`;
        break;

      case 'bad-prediction':
        action = 'reduce-weight';
        riskLevel = 'medium';
        explanation = `File is consistently predicted but rarely used. Evidence: ${finding.evidence}. Reducing weight proportionally to severity.`;
        break;

      case 'thin-domain':
      case 'declining-accuracy':
      case 'cross-domain-dependency':
      default:
        // Informational — no automated fix
        continue;
    }

    // D7: Calculate confidence score
    const confidence = calculateProposalConfidence(finding);

    proposals.push({
      findingId: finding.id,
      finding,
      action,
      explanation,
      riskLevel,
      confidence,
    });
  }

  // D7: Sort by confidence descending — highest-impact fixes first
  proposals.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));

  return proposals;
}

/**
 * Calculate a confidence score (0-1) for a fix proposal (D7).
 * Based on: severity weight × evidence strength × finding type weight.
 */
export function calculateProposalConfidence(finding: DiagnosticFinding): number {
  // Severity weight
  const severityWeights: Record<string, number> = {
    critical: 1.0,
    medium: 0.7,
    low: 0.4,
    info: 0.1,
  };
  const severityW = severityWeights[finding.severity] ?? 0.5;

  // Evidence strength — extract numeric values from evidence string
  let evidenceW = 0.5; // default
  const percentMatch = finding.evidence.match(/(\d+)%/);
  if (percentMatch) {
    const pct = parseInt(percentMatch[1], 10);
    evidenceW = Math.min(1.0, pct / 100);
  }
  // For stale patterns, use decay score if present
  const decayMatch = finding.evidence.match(/decay ([\d.]+)/);
  if (decayMatch) {
    evidenceW = Math.min(1.0, parseFloat(decayMatch[1]));
  }

  // Type weight — bad predictions are more impactful to fix
  const typeWeights: Record<string, number> = {
    'stale-pattern': 0.8,
    'missing-cooccurrence': 0.6,
    'bad-prediction': 0.9,
  };
  const typeW = typeWeights[finding.type] ?? 0.5;

  return Math.min(1.0, severityW * evidenceW * typeW + (1 - severityW) * typeW * 0.3);
}

// ─── Task 5: Fix proposal rendering and approval ──────────────────

/**
 * Render a single fix proposal for user review.
 */
export function renderFixProposal(proposal: FixProposal, index: number, total: number): string {
  const finding = proposal.finding;
  const riskColor = proposal.riskLevel === 'high' ? chalk.red : proposal.riskLevel === 'medium' ? chalk.yellow : chalk.green;

  const lines: string[] = [];
  lines.push('');
  lines.push(chalk.bold(`--- Fix ${index}/${total} ---`));
  lines.push(`  Type:     ${finding.type}`);
  lines.push(`  Severity: ${finding.severity}`);
  lines.push(`  Files:    ${finding.affectedFiles.join(', ')}`);
  lines.push(`  Action:   ${proposal.action}`);
  lines.push(`  Risk:     ${riskColor(proposal.riskLevel)}`);
  lines.push('');
  lines.push(`  ${proposal.explanation}`);
  lines.push('');
  lines.push('  [A] Apply  [S] Skip  [AA] Apply All remaining');
  lines.push('');

  return lines.join('\n');
}

/**
 * Prompt user for fix approval.
 */
export async function promptFixApproval(): Promise<'apply' | 'skip' | 'apply-all'> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise<'apply' | 'skip' | 'apply-all'>((resolve) => {
    rl.question('Choose [A/S/AA]: ', (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      if (trimmed === 'a' || trimmed === 'apply') resolve('apply');
      else if (trimmed === 'aa' || trimmed === 'apply all') resolve('apply-all');
      else resolve('skip');
    });
  });
}

/**
 * Run the supervised fix flow: iterate through proposals, prompt for each.
 */
export async function runSupervisedFixFlow(
  proposals: FixProposal[],
  projectRoot: string,
): Promise<FixResult[]> {
  const results: FixResult[] = [];
  let applyAll = false;

  for (let i = 0; i < proposals.length; i++) {
    const proposal = proposals[i];

    if (!applyAll) {
      console.log(renderFixProposal(proposal, i + 1, proposals.length));
      const choice = await promptFixApproval();

      if (choice === 'skip') {
        results.push({
          proposal,
          applied: false,
          approvedBy: 'user',
          result: 'Skipped by user',
        });
        continue;
      }

      if (choice === 'apply-all') {
        applyAll = true;
      }
    }

    // Apply the fix
    const fixResult = applyFix(proposal, projectRoot);
    if (fixResult.ok) {
      results.push(fixResult.value);
    } else {
      results.push({
        proposal,
        applied: false,
        approvedBy: applyAll ? 'auto' : 'user',
        result: `Fix failed: ${fixResult.error}`,
      });
    }
  }

  return results;
}

// ─── Task 6: Apply add co-occurrence ──────────────────────────────

/**
 * Add a missing co-occurrence pattern to patterns.json.
 */
export function applyAddCooccurrence(
  proposal: FixProposal,
  projectRoot: string,
): Result<FixResult> {
  try {
    const patternsResult = readPatterns(projectRoot);
    if (!patternsResult.ok) return err(`Cannot read patterns: ${patternsResult.error}`);

    const patterns = patternsResult.value;
    const files = proposal.finding.affectedFiles;

    if (files.length < 2) {
      return err('Co-occurrence requires at least 2 files');
    }

    // Extract confidence from evidence string (e.g., "80%") or use default
    let confidence = 0.8;
    const percentMatch = proposal.finding.evidence.match(/(\d+)%/);
    if (percentMatch) {
      confidence = parseInt(percentMatch[1], 10) / 100;
    }

    const newCooccurrence = {
      files: [files[0], files[1]] as [string, string],
      count: 1,
      confidence,
      lastSeen: new Date().toISOString(),
      discoveredAt: new Date().toISOString(),
    };

    patterns.coOccurrences.push(newCooccurrence);

    const writeResult = writePatterns(projectRoot, patterns);
    if (!writeResult.ok) return err(`Cannot write patterns: ${writeResult.error}`);

    return ok({
      proposal,
      applied: true,
      approvedBy: 'user' as const,
      result: `Added co-occurrence pattern for ${files[0]} ↔ ${files[1]} (confidence: ${confidence.toFixed(2)})`,
      before: null,
      after: newCooccurrence,
    });
  } catch (error) {
    return err(`Failed to add co-occurrence: ${String(error)}`);
  }
}

// ─── Task 7: Apply remove stale ───────────────────────────────────

/**
 * Graduated weight reduction for stale patterns (D8).
 * First reduction: halve the weight. Second reduction (already <=0.25): set to 0.0.
 * This gives patterns a "second chance" before full removal.
 */
export function applyRemoveStale(
  proposal: FixProposal,
  projectRoot: string,
): Result<FixResult> {
  try {
    const patternsResult = readPatterns(projectRoot);
    if (!patternsResult.ok) return err(`Cannot read patterns: ${patternsResult.error}`);

    const patterns = patternsResult.value;
    const affectedDomain = proposal.finding.affectedDomain;
    const affinity = patterns.typeAffinities[affectedDomain];

    if (!affinity) {
      return err(`Type affinity not found for domain: ${affectedDomain}`);
    }

    const originalWeight = affinity.confidence;

    // D8: Graduated reduction — halve first, then zero on second occurrence
    let newWeight: number;
    if (originalWeight <= 0.25) {
      // Already reduced previously — full removal
      newWeight = 0.0;
    } else {
      // First reduction — halve the weight
      newWeight = Math.round(originalWeight * 0.5 * 100) / 100;
    }

    affinity.confidence = newWeight;

    const writeResult = writePatterns(projectRoot, patterns);
    if (!writeResult.ok) return err(`Cannot write patterns: ${writeResult.error}`);

    const action = newWeight === 0 ? 'removed' : 'halved';
    return ok({
      proposal,
      applied: true,
      approvedBy: 'user' as const,
      result: `${action === 'removed' ? 'Removed' : 'Halved'} weight for ${affectedDomain} pattern from ${originalWeight.toFixed(2)} to ${newWeight.toFixed(2)}`,
      before: originalWeight,
      after: newWeight,
    });
  } catch (error) {
    return err(`Failed to remove stale pattern: ${String(error)}`);
  }
}

// ─── Task 8: Apply reduce weight ──────────────────────────────────

/**
 * Reduce prediction weight proportionally based on hit rate.
 * 0% hit rate → reduce to 0.0; 10% hit rate → reduce by 50%; etc.
 */
export function applyReduceWeight(
  proposal: FixProposal,
  projectRoot: string,
): Result<FixResult> {
  try {
    const patternsResult = readPatterns(projectRoot);
    if (!patternsResult.ok) return err(`Cannot read patterns: ${patternsResult.error}`);

    const patterns = patternsResult.value;
    const affectedDomain = proposal.finding.affectedDomain;
    const affectedFile = proposal.finding.affectedFiles[0];
    const affinity = patterns.typeAffinities[affectedDomain];

    if (!affinity) {
      return err(`Type affinity not found for domain: ${affectedDomain}`);
    }

    // Extract hit rate from evidence string
    let hitRate = 0;
    const hitRateMatch = proposal.finding.evidence.match(/(\d+)% hit rate/);
    if (hitRateMatch) {
      hitRate = parseInt(hitRateMatch[1], 10) / 100;
    }

    // Calculate reduction: if hit rate is 0%, reduce to 0.0; if 10%, reduce by 50%
    const reductionFactor = hitRate === 0 ? 0 : Math.max(0.1, hitRate * 5);

    // Try to reduce file-level weight first (if fileWeights exists)
    if (affinity.fileWeights && affinity.fileWeights[affectedFile]) {
      const originalWeight = affinity.fileWeights[affectedFile].weight;
      const newWeight = originalWeight * reductionFactor;
      affinity.fileWeights[affectedFile].weight = Math.round(newWeight * 100) / 100;

      const writeResult = writePatterns(projectRoot, patterns);
      if (!writeResult.ok) return err(`Cannot write patterns: ${writeResult.error}`);

      return ok({
        proposal,
        applied: true,
        approvedBy: 'user' as const,
        result: `Reduced weight for ${affectedFile} from ${originalWeight.toFixed(2)} to ${affinity.fileWeights[affectedFile].weight.toFixed(2)}`,
        before: originalWeight,
        after: affinity.fileWeights[affectedFile].weight,
      });
    }

    // Fallback: reduce overall affinity confidence
    const originalWeight = affinity.confidence;
    affinity.confidence = Math.round(originalWeight * reductionFactor * 100) / 100;

    const writeResult = writePatterns(projectRoot, patterns);
    if (!writeResult.ok) return err(`Cannot write patterns: ${writeResult.error}`);

    return ok({
      proposal,
      applied: true,
      approvedBy: 'user' as const,
      result: `Reduced confidence for ${affectedDomain} from ${originalWeight.toFixed(2)} to ${affinity.confidence.toFixed(2)}`,
      before: originalWeight,
      after: affinity.confidence,
    });
  } catch (error) {
    return err(`Failed to reduce weight: ${String(error)}`);
  }
}

// ─── Task 9: Fix dispatcher ──────────────────────────────────────

/**
 * Route a fix proposal to the correct application function.
 */
export function applyFix(
  proposal: FixProposal,
  projectRoot: string,
): Result<FixResult> {
  try {
    switch (proposal.action) {
      case 'add-cooccurrence':
        return applyAddCooccurrence(proposal, projectRoot);

      case 'remove-stale':
        return applyRemoveStale(proposal, projectRoot);

      case 'reduce-weight':
        return applyReduceWeight(proposal, projectRoot);

      case 'custom':
        return ok({
          proposal,
          applied: false,
          approvedBy: 'user',
          result: 'Custom fixes not supported in automated mode',
        });

      default:
        return ok({
          proposal,
          applied: false,
          approvedBy: 'user',
          result: `Unknown fix action: ${proposal.action}`,
        });
    }
  } catch (error) {
    return err(`Fix application failed: ${String(error)}`);
  }
}

// ─── D6: Fix verification ──────────────────────────────────────────

/**
 * Verify whether applied fixes actually improved health score (D6).
 * Re-runs calculateHealthScore after fixes and marks each result as effective/ineffective.
 */
export function verifyFixes(
  fixResults: FixResult[],
  healthBefore: number,
  healthAfter: number,
): FixResult[] {
  const improved = healthAfter > healthBefore;
  const unchanged = healthAfter === healthBefore;

  return fixResults.map((fr) => {
    if (!fr.applied) {
      return { ...fr, verified: 'unverified' as const };
    }
    if (improved) {
      return { ...fr, verified: 'effective' as const };
    }
    if (unchanged) {
      return { ...fr, verified: 'ineffective' as const };
    }
    // Health got worse — definitely ineffective
    return { ...fr, verified: 'ineffective' as const };
  });
}

// ─── Task 10: Supervised mode orchestrator ────────────────────────

/**
 * Main supervised mode entry point.
 * For each alert: render UI, prompt for choice, optionally run diagnostics and fixes.
 */
export async function runSupervised(
  alerts: ThresholdAlert[],
  projectRoot: string,
): Promise<SupervisedSession[]> {
  const sessions: SupervisedSession[] = [];

  for (const alert of alerts) {
    console.log(renderThresholdAlert(alert));
    const choice = await promptAlertChoice();

    if (choice === 'manual') {
      console.log(chalk.dim('  You can run `co doctor` anytime to diagnose issues.'));
      sessions.push({ alert, choice, fixes: [] });
      continue;
    }

    if (choice === 'dismiss') {
      sessions.push({ alert, choice, fixes: [] });
      continue;
    }

    // choice === 'diagnose'
    logger.info(MODULE, `Running diagnostics for domain: ${alert.domain}`);
    const reportResult = await runDiagnostics(projectRoot, {
      domain: alert.domain,
    });

    if (!reportResult.ok) {
      logger.error(MODULE, `Diagnostics failed: ${reportResult.error}`);
      sessions.push({ alert, choice, fixes: [] });
      continue;
    }

    const report = reportResult.value;
    const proposals = generateFixProposals(report.findings);

    if (proposals.length === 0) {
      console.log(chalk.green('  No actionable fixes found.'));
      sessions.push({ alert, choice, report, fixes: [] });
      continue;
    }

    const fixes = await runSupervisedFixFlow(proposals, projectRoot);
    sessions.push({ alert, choice, report, fixes });
  }

  return sessions;
}

// ─── D12: Doctor-to-Learner override tracking ────────────────────

/**
 * Create doctor override entries from applied fixes (D12).
 * These override entries tell the learner to respect doctor fixes
 * for a grace period before re-learning.
 */
export function createOverridesFromFixes(
  fixResults: FixResult[],
  currentTaskCount: number,
): DoctorOverride[] {
  const overrides: DoctorOverride[] = [];

  for (const fr of fixResults) {
    if (!fr.applied) continue;

    const domain = fr.proposal.finding.affectedDomain;
    const field = fr.proposal.action === 'remove-stale'
      ? `typeAffinities.${domain}.confidence`
      : fr.proposal.action === 'add-cooccurrence'
        ? `coOccurrences.${fr.proposal.finding.affectedFiles.join('↔')}`
        : `typeAffinities.${domain}.confidence`;

    overrides.push({
      domain,
      field,
      value: typeof fr.after === 'number' ? fr.after : 0,
      appliedAt: new Date().toISOString(),
      gracePeriodTasks: DEFAULT_OVERRIDE_GRACE_PERIOD,
      taskCountAtApplication: currentTaskCount,
    });
  }

  return overrides;
}

/**
 * Check whether a doctor override is still active (D12).
 */
export function isOverrideActive(
  override: DoctorOverride,
  currentTaskCount: number,
): boolean {
  return (currentTaskCount - override.taskCountAtApplication) < override.gracePeriodTasks;
}

/**
 * Filter overrides to only active ones (D12).
 */
export function getActiveOverrides(
  overrides: DoctorOverride[],
  currentTaskCount: number,
): DoctorOverride[] {
  return overrides.filter((o) => isOverrideActive(o, currentTaskCount));
}
