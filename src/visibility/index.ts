/**
 * Visibility module barrel export — stats dashboard, budget display, knowledge inspection,
 * dry-run handler, and shared formatters.
 */

import type { Command } from 'commander';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { STORE_DIR } from '../utils/index.js';
import { runBudgetCommand } from './budget.js';
import { runStatsCommand } from './stats.js';
import { runKnowledgeCommand } from './knowledge.js';

export { runBudgetCommand, renderBudgetDisplay } from './budget.js';
export { runStatsCommand, gatherTrendsData, renderTrends } from './stats.js';
export { runKnowledgeCommand, gatherKnowledgeData, renderKnowledge, listAvailableDomains } from './knowledge.js';
export { executeDryRun, renderDryRun, runDryRunCommand } from './dry-run.js';
export {
  showInlineFeedback, showQuickReasonMenu, recordFeedback, forgetFile, supportsEmoji,
  loadCorrectionContext, displayCorrectionContext, showCorrectionMenu,
  promptFilePaths, promptModelCorrection, promptDescription,
  applyDetailedCorrection, runCorrectCommand,
} from './feedback.js';
export {
  drawBox,
  drawProgressBar,
  drawTable,
  drawLineChart,
  formatTokenCount,
  formatPercentage,
  formatTimeRemaining,
  colorByThreshold,
} from './formatters.js';
export type {
  StatsDisplayData,
  BudgetDisplayData,
  KnowledgeDisplayData,
  DryRunResult,
  TrendsDisplayData,
  DomainStatsEntry,
  ModelUsageEntry,
  SessionBatchEntry,
  DomainFileEntry,
  DomainPattern,
  DomainHealth,
  DomainSummary,
  ChartDataPoint,
  ChartOptions,
  BoxOptions,
  ProgressBarOptions,
  TableColumn,
  TableRow,
  InlineFeedback,
  InlineFeedbackWithDescription,
  DetailedFeedback,
  ModelCorrection,
  CorrectionContext,
  QuickReason,
  FeedbackResult,
  ForgetResult,
  TaskSummary,
} from './types.js';

/**
 * Register all visibility subcommands on the CLI program.
 */
export function registerVisibilityCommands(program: Command): void {
  program
    .command('stats')
    .description('Show token usage statistics and dashboard')
    .option('--domain <name>', 'Filter stats to a specific domain')
    .option('--sessions <n>', 'Show stats for last N sessions', parseInt)
    .option('--trend', 'Show accuracy trend over time')
    .action(async (options: { domain?: string; sessions?: number; trend?: boolean }) => {
      const projectRoot = process.cwd();
      const storePath = path.join(projectRoot, STORE_DIR);
      if (!existsSync(storePath)) {
        console.error('Project not initialized. Run `co init` first.');
        process.exit(1);
      }
      await runStatsCommand(projectRoot, options);
    });

  program
    .command('budget')
    .description('Display token budget status')
    .action(async () => {
      const projectRoot = process.cwd();
      const storePath = path.join(projectRoot, STORE_DIR);
      if (!existsSync(storePath)) {
        console.error('Project not initialized. Run `co init` first.');
        process.exit(1);
      }
      await runBudgetCommand(projectRoot);
    });

  program
    .command('knowledge')
    .description('Inspect knowledge for a specific domain')
    .argument('[domain]', 'Domain name to inspect')
    .option('--all', 'Show all domains in sequence')
    .option('--files', 'Show only the files section')
    .option('--patterns', 'Show only the patterns section')
    .action(async (domain: string | undefined, options: { all?: boolean; files?: boolean; patterns?: boolean }) => {
      const projectRoot = process.cwd();
      const storePath = path.join(projectRoot, STORE_DIR);
      if (!existsSync(storePath)) {
        console.error('Project not initialized. Run `co init` first.');
        process.exit(1);
      }

      if (!domain && !options.all) {
        console.error('Usage: co knowledge <domain> [--all] [--files] [--patterns]');
        console.error('Run `co knowledge --all` to see all domains.');
        process.exit(1);
      }

      await runKnowledgeCommand(projectRoot, domain ?? '', options);
    });
}
