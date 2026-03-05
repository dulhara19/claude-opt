/**
 * Autonomous Doctor mode — auto-applies low-risk fixes, prompts for medium/high (Story 7.4).
 */

import chalk from 'chalk';
import { logger } from '../utils/index.js';
import { runDiagnostics } from './doctor.js';
import {
  generateFixProposals,
  applyFix,
  renderFixProposal,
  promptFixApproval,
} from './supervised.js';
import type {
  ThresholdAlert,
  AutonomousResult,
  FixProposal,
} from './types.js';
import { AUTO_APPLY_RISK_LEVELS } from './types.js';

const MODULE = 'doctor:autonomous';

/**
 * Run autonomous Doctor mode for threshold alerts.
 * Low-risk fixes are auto-applied; medium/high-risk require user approval.
 */
export async function runAutonomous(
  alerts: ThresholdAlert[],
  projectRoot: string,
): Promise<AutonomousResult> {
  const result: AutonomousResult = {
    autoApplied: [],
    pendingApproval: [],
    userApproved: [],
    notifications: [],
  };

  for (const alert of alerts) {
    logger.info(MODULE, `Auto-diagnosing domain: ${alert.domain} (accuracy: ${(alert.currentAccuracy * 100).toFixed(0)}%)`);

    const reportResult = await runDiagnostics(projectRoot, {
      domain: alert.domain,
    });

    if (!reportResult.ok) {
      logger.error(MODULE, `Diagnostics failed for ${alert.domain}: ${reportResult.error}`);
      continue;
    }

    const report = reportResult.value;
    const proposals = generateFixProposals(report.findings);

    if (proposals.length === 0) {
      result.notifications.push(`No actionable fixes for ${alert.domain}.`);
      continue;
    }

    // Partition by risk level
    const lowRisk: FixProposal[] = [];
    const needsApproval: FixProposal[] = [];

    for (const proposal of proposals) {
      if (AUTO_APPLY_RISK_LEVELS.includes(proposal.riskLevel)) {
        lowRisk.push(proposal);
      } else {
        needsApproval.push(proposal);
      }
    }

    // Auto-apply low-risk fixes
    for (const proposal of lowRisk) {
      const fixResult = applyFix(proposal, projectRoot);
      if (fixResult.ok) {
        const fr = { ...fixResult.value, approvedBy: 'auto' as const };
        result.autoApplied.push(fr);
      } else {
        result.autoApplied.push({
          proposal,
          applied: false,
          approvedBy: 'auto',
          result: `Fix failed: ${fixResult.error}`,
        });
      }
    }

    // Prompt user for medium/high-risk fixes
    for (let i = 0; i < needsApproval.length; i++) {
      const proposal = needsApproval[i];
      result.pendingApproval.push(proposal);

      console.log(renderFixProposal(proposal, i + 1, needsApproval.length));
      const choice = await promptFixApproval();

      if (choice === 'apply' || choice === 'apply-all') {
        const fixResult = applyFix(proposal, projectRoot);
        if (fixResult.ok) {
          result.userApproved.push(fixResult.value);
        } else {
          result.userApproved.push({
            proposal,
            applied: false,
            approvedBy: 'user',
            result: `Fix failed: ${fixResult.error}`,
          });
        }

        // Apply all remaining if user chose apply-all
        if (choice === 'apply-all') {
          for (let j = i + 1; j < needsApproval.length; j++) {
            const p = needsApproval[j];
            const fr = applyFix(p, projectRoot);
            if (fr.ok) {
              result.userApproved.push(fr.value);
            } else {
              result.userApproved.push({
                proposal: p,
                applied: false,
                approvedBy: 'user',
                result: `Fix failed: ${fr.error}`,
              });
            }
          }
          break;
        }
      }
      // skip — do nothing, proposal stays in pendingApproval
    }
  }

  // Show notification
  const notification = renderAutonomousNotification(result);
  if (notification) {
    console.log(notification);
  }

  return result;
}

/**
 * Render a post-action notification summarizing autonomous Doctor actions.
 */
export function renderAutonomousNotification(result: AutonomousResult): string {
  const autoCount = result.autoApplied.filter((f) => f.applied).length;
  const approvalCount = result.pendingApproval.length;

  if (autoCount === 0 && approvalCount === 0) {
    return '';
  }

  const lines: string[] = [];
  lines.push('');

  if (autoCount > 0) {
    lines.push(chalk.green(`  Doctor auto-applied ${autoCount} low-risk fix${autoCount === 1 ? '' : 'es'}.`));
    for (const fix of result.autoApplied.filter((f) => f.applied)) {
      lines.push(chalk.dim(`    - ${fix.proposal.action}: ${fix.proposal.finding.affectedFiles.join(', ')}`));
    }
  }

  if (approvalCount > 0) {
    lines.push(chalk.yellow(`  ${approvalCount} fix${approvalCount === 1 ? '' : 'es'} require${approvalCount === 1 ? 's' : ''} approval.`));
  }

  lines.push(chalk.dim('  Run `co doctor --log` to review full details.'));
  lines.push('');

  return lines.join('\n');
}
