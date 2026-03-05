import { Command } from 'commander';
import { createRequire } from 'node:module';
import { createInterface } from 'node:readline';
import { existsSync } from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { runCheckup, handleCheckupInteraction, runDiagnostics, renderDiagnosticReport } from './doctor/index.js';
import { STORE_DIR, setLogLevel, LogLevel, logger } from './utils/index.js';
import { runPipeline } from './pipeline.js';
import { initializeStore, ensureStoreDir, resolveStorePath, readDependencyGraph, readConfig, writeConfig } from './store/index.js';
import { scanProject, generateClaudeMd } from './scanner/index.js';
import { detectProjectStack, loadStarterPack, applyStarterPack } from './scanner/starter-packs.js';
import { registerVisibilityCommands, runDryRunCommand, forgetFile, runCorrectCommand } from './visibility/index.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version: string };

// ─── Helpers ──────────────────────────────────────────────────

function logStep(step: number, total: number, message: string): void {
  process.stdout.write(chalk.dim(`[${step}/${total}]`) + ' ' + message);
}

function logStepResult(result: string): void {
  console.log('  ' + chalk.green(result));
}

async function promptReinit(): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question('Project already initialized. Re-scan? [Y/n] ', (answer) => {
      rl.close();
      resolve(answer.toLowerCase() !== 'n');
    });
  });
}

// ─── Init command ─────────────────────────────────────────────

async function runInit(projectRoot: string, options: { force?: boolean }): Promise<void> {
  const storePath = resolveStorePath(projectRoot);
  const isInitialized = existsSync(storePath);

  if (isInitialized && !options.force) {
    const rescan = await promptReinit();
    if (!rescan) {
      console.log('No changes made.');
      return;
    }
    return runScan(projectRoot, { full: false });
  }

  console.log(chalk.bold('Initializing claude-opt...\n'));

  // Step 1: Create store
  logStep(1, 7, 'Creating knowledge store...');
  ensureStoreDir(projectRoot);
  if (!isInitialized) {
    initializeStore(projectRoot);
  }
  logStepResult('done');

  // Step 2: Scan files (includes dependency graph + keywords)
  logStep(2, 7, 'Scanning project files...');
  const scanResult = scanProject({ projectRoot, scanType: 'full' });
  if (!scanResult.ok) {
    console.log('\n' + chalk.red('Error: ' + scanResult.error));
    process.exit(1);
  }
  logStepResult(`${scanResult.value.filesScanned} files found`);

  // Step 3: Dependency graph (already done as part of scan)
  logStep(3, 7, 'Building dependency graph...');
  logStepResult(`${scanResult.value.dependencyEdges} edges discovered`);

  // Step 4: Keywords (already done as part of scan)
  logStep(4, 7, 'Extracting keywords...');
  logStepResult(`${scanResult.value.keywordsExtracted} keywords indexed`);

  // Step 5: Detect stack
  logStep(5, 7, 'Detecting project stack...');
  const stackName = detectProjectStack(projectRoot, scanResult.value.projectMap);
  if (stackName) {
    logStepResult(stackName);

    // Step 6: Load starter pack
    logStep(6, 7, 'Loading starter pack...');
    const packResult = loadStarterPack(stackName);
    if (packResult.ok) {
      applyStarterPack(projectRoot, packResult.value);
      logStepResult(`${stackName}.json loaded`);
    } else {
      logStepResult('skipped (pack not found)');
    }
  } else {
    logStepResult('no match (learning from scratch)');
    logStep(6, 7, 'Loading starter pack...');
    logStepResult('skipped');
  }

  // Step 7: Generate CLAUDE.md
  logStep(7, 7, 'Generating CLAUDE.md...');
  const graphResult = readDependencyGraph(projectRoot);
  const depGraph = graphResult.ok
    ? graphResult.value
    : { schemaVersion: '1.0.0', updatedAt: '', edges: [], adjacency: {} };
  generateClaudeMd(projectRoot, scanResult.value.projectMap, depGraph);
  logStepResult('done');

  console.log(
    '\n' + chalk.green.bold('Ready!') + ' Run `co doctor --checkup` to verify setup.',
  );
}

// ─── Scan command ─────────────────────────────────────────────

async function runScan(
  projectRoot: string,
  options: { full?: boolean },
): Promise<void> {
  const storePath = resolveStorePath(projectRoot);
  if (!existsSync(storePath)) {
    console.error('Project not initialized. Run `co init` first.');
    process.exit(1);
  }

  const scanType = options.full ? 'full' : 'incremental';
  console.log(chalk.bold(`Running ${scanType} scan...\n`));

  logStep(1, 3, 'Scanning project files...');
  const scanResult = scanProject({ projectRoot, scanType });
  if (!scanResult.ok) {
    console.log('\n' + chalk.red('Error: ' + scanResult.error));
    process.exit(1);
  }
  const r = scanResult.value;
  if (scanType === 'incremental') {
    logStepResult(
      `${r.filesChanged} changed, ${r.filesNew} new, ${r.filesDeleted} deleted, ${r.filesUnchanged} unchanged`,
    );
  } else {
    logStepResult(`${r.filesScanned} files found`);
  }

  logStep(2, 3, 'Dependency graph + keywords...');
  logStepResult(`${r.dependencyEdges} edges, ${r.keywordsExtracted} keywords`);

  logStep(3, 3, 'Updating CLAUDE.md...');
  const graphResult = readDependencyGraph(projectRoot);
  const depGraph = graphResult.ok
    ? graphResult.value
    : { schemaVersion: '1.0.0', updatedAt: '', edges: [], adjacency: {} };
  generateClaudeMd(projectRoot, r.projectMap, depGraph);
  logStepResult('done');

  console.log('\n' + chalk.green('Scan complete.'));
}

// ─── CLI setup ────────────────────────────────────────────────

const program = new Command();

program
  .name('claude-opt')
  .description('Claude Code Token Optimizer — intelligent context management')
  .version(pkg.version)
  .option('--verbose', 'Enable debug-level output')
  .option('--quiet', 'Suppress info-level output')
  .option('--dry-run', 'Preview changes without writing');

// Default command: run the pipeline with a task prompt
program
  .argument('[task...]', 'Task description to optimize')
  .action(async (taskWords: string[], options: { verbose?: boolean; quiet?: boolean; dryRun?: boolean }) => {
    if (taskWords.length === 0) {
      program.help();
      return;
    }

    if (options.verbose) setLogLevel(LogLevel.Debug);
    if (options.quiet) setLogLevel(LogLevel.Warn);

    const taskText = taskWords.join(' ');
    const workingDir = process.cwd();

    // Dry-run: use visibility dry-run handler (zero side effects)
    if (options.dryRun) {
      try {
        await runDryRunCommand(taskText, workingDir);
      } catch (error) {
        logger.error('cli', 'Dry-run failed', error);
        process.exitCode = 1;
      }
      return;
    }

    try {
      const ctx = await runPipeline(taskText, workingDir, false);
      if (ctx.classification) {
        logger.info('cli', `Type: ${ctx.classification.type} | Domain: ${ctx.classification.domain} | Complexity: ${ctx.classification.complexity} | Confidence: ${(ctx.classification.confidence * 100).toFixed(0)}%`);
      }
    } catch (error) {
      logger.error('cli', 'Pipeline failed', error);
      process.exitCode = 1;
    }
  });

program
  .command('init')
  .description('Initialize claude-opt in the current project')
  .option('--force', 'Force full re-initialization')
  .action(async (options: { force?: boolean }) => {
    await runInit(process.cwd(), options);
  });

program
  .command('scan')
  .description('Re-scan project files')
  .option('--full', 'Run a full scan instead of incremental')
  .action(async (options: { full?: boolean }) => {
    await runScan(process.cwd(), options);
  });

// Register visibility commands (stats, budget, knowledge)
registerVisibilityCommands(program);

program
  .command('doctor')
  .description('Run diagnostics and health checks')
  .option('--checkup', 'Run pre-flight checkup to verify setup health')
  .option('--domain <name>', 'Focus diagnostics on a specific domain')
  .option('--report-only', 'Display diagnostic report without proposing fixes')
  .option('--deep', 'Run deep analysis with archived history (Story 7.4)')
  .action(async (options: { checkup?: boolean; domain?: string; reportOnly?: boolean; deep?: boolean }) => {
    const projectRoot = process.cwd();
    const storePath = path.join(projectRoot, STORE_DIR);

    if (!existsSync(storePath)) {
      console.error('Project not initialized. Run `co init` first.');
      process.exit(1);
    }

    if (options.checkup) {
      const result = runCheckup(projectRoot);
      if (!result.ok) {
        console.error(result.error);
        process.exit(1);
      }

      await handleCheckupInteraction(result.value, projectRoot);
    } else {
      // Default: run diagnostics
      const result = await runDiagnostics(projectRoot, {
        domain: options.domain,
        reportOnly: options.reportOnly,
        deep: options.deep,
      });

      if (!result.ok) {
        console.error(chalk.red(`Diagnostic error: ${result.error}`));
        process.exit(1);
      }

      process.stdout.write(renderDiagnosticReport(result.value, options.reportOnly));
    }
  });

program
  .command('config')
  .description('View and edit configuration')
  .argument('[key]', 'Configuration key to set')
  .argument('[value]', 'New value for the key')
  .action((key?: string, value?: string) => {
    const projectRoot = process.cwd();
    const storePath = path.join(projectRoot, STORE_DIR);
    if (!existsSync(storePath)) {
      console.error('Project not initialized. Run `co init` first.');
      process.exit(1);
    }

    const configResult = readConfig(projectRoot);
    if (!configResult.ok) {
      console.error(chalk.red('Error: Could not read config.json'));
      process.exit(1);
    }
    const config = configResult.value;

    // No args: show current config
    if (!key) {
      console.log(chalk.bold('Current configuration:'));
      console.log(`  token-budget:        ${config.tokenBudget.toLocaleString('en-US')}`);
      console.log(`  window-duration:     ${config.windowDurationMs / 3_600_000}h`);
      console.log(`  budget-warn-inline:  ${config.budgetWarnings.inline}`);
      console.log(`  budget-warn-blocking: ${config.budgetWarnings.blocking}`);
      console.log(`  doctor-mode:         ${config.doctorMode}`);
      return;
    }

    if (!value) {
      console.error(chalk.red(`Error: Please provide a value for "${key}"`));
      process.exit(1);
    }

    switch (key) {
      case 'token-budget': {
        const num = parseInt(value, 10);
        if (isNaN(num) || num <= 0) {
          console.error(chalk.red('Error: token-budget must be a positive integer'));
          process.exit(1);
        }
        const oldVal = config.tokenBudget;
        config.tokenBudget = num;
        config.updatedAt = new Date().toISOString();
        const writeResult = writeConfig(projectRoot, config);
        if (!writeResult.ok) { console.error(chalk.red(`Error: ${writeResult.error}`)); process.exit(1); }
        console.log(chalk.green(`token-budget updated: ${oldVal.toLocaleString('en-US')} -> ${num.toLocaleString('en-US')}`));
        break;
      }
      case 'window-duration': {
        const hours = parseFloat(value);
        if (isNaN(hours) || hours <= 0) {
          console.error(chalk.red('Error: window-duration must be a positive number (hours)'));
          process.exit(1);
        }
        const oldMs = config.windowDurationMs;
        config.windowDurationMs = Math.round(hours * 3_600_000);
        config.updatedAt = new Date().toISOString();
        const writeResult = writeConfig(projectRoot, config);
        if (!writeResult.ok) { console.error(chalk.red(`Error: ${writeResult.error}`)); process.exit(1); }
        console.log(chalk.green(`window-duration updated: ${oldMs / 3_600_000}h -> ${hours}h`));
        break;
      }
      case 'budget-warn-inline': {
        const threshold = parseFloat(value);
        if (isNaN(threshold) || threshold < 0 || threshold > 1) {
          console.error(chalk.red('Error: budget-warn-inline must be between 0.0 and 1.0'));
          process.exit(1);
        }
        if (threshold >= config.budgetWarnings.blocking) {
          console.error(chalk.red(`Error: budget-warn-inline must be less than budget-warn-blocking (currently ${config.budgetWarnings.blocking})`));
          process.exit(1);
        }
        const oldVal = config.budgetWarnings.inline;
        config.budgetWarnings.inline = threshold;
        config.updatedAt = new Date().toISOString();
        const writeResult = writeConfig(projectRoot, config);
        if (!writeResult.ok) { console.error(chalk.red(`Error: ${writeResult.error}`)); process.exit(1); }
        console.log(chalk.green(`budget-warn-inline updated: ${oldVal} -> ${threshold}`));
        break;
      }
      case 'budget-warn-blocking': {
        const threshold = parseFloat(value);
        if (isNaN(threshold) || threshold < 0 || threshold > 1) {
          console.error(chalk.red('Error: budget-warn-blocking must be between 0.0 and 1.0'));
          process.exit(1);
        }
        if (threshold <= config.budgetWarnings.inline) {
          console.error(chalk.red(`Error: budget-warn-blocking must be greater than budget-warn-inline (currently ${config.budgetWarnings.inline})`));
          process.exit(1);
        }
        const oldVal = config.budgetWarnings.blocking;
        config.budgetWarnings.blocking = threshold;
        config.updatedAt = new Date().toISOString();
        const writeResult = writeConfig(projectRoot, config);
        if (!writeResult.ok) { console.error(chalk.red(`Error: ${writeResult.error}`)); process.exit(1); }
        console.log(chalk.green(`budget-warn-blocking updated: ${oldVal} -> ${threshold}`));
        break;
      }
      case 'doctor-mode': {
        if (value !== 'supervised' && value !== 'autonomous') {
          console.error(chalk.red('Error: doctor-mode must be "supervised" or "autonomous"'));
          process.exit(1);
        }
        const oldMode = config.doctorMode;
        config.doctorMode = value;
        config.updatedAt = new Date().toISOString();
        const writeResult = writeConfig(projectRoot, config);
        if (!writeResult.ok) { console.error(chalk.red(`Error: ${writeResult.error}`)); process.exit(1); }
        console.log(chalk.green(`doctor-mode updated: ${oldMode} -> ${value}`));
        if (value === 'autonomous') {
          console.log(chalk.yellow('  Doctor will auto-apply low-risk fixes when accuracy drops.'));
          console.log(chalk.yellow('  Medium/high-risk fixes still require approval.'));
        }
        break;
      }
      default:
        console.error(chalk.red(`Error: Unknown config key "${key}". Valid keys: token-budget, window-duration, budget-warn-inline, budget-warn-blocking, doctor-mode`));
        process.exit(1);
    }
  });

program
  .command('correct')
  .description('Provide detailed feedback on the last task prediction')
  .option('--task <id>', 'Correct a specific task (default: last)')
  .action(async (options: { task?: string }) => {
    const projectRoot = process.cwd();
    const storePath = path.join(projectRoot, STORE_DIR);
    if (!existsSync(storePath)) {
      console.error('Project not initialized. Run `co init` first.');
      process.exit(1);
    }
    try {
      await runCorrectCommand(projectRoot, options.task);
    } catch (error) {
      logger.error('cli', 'Correction failed', error);
      console.error(chalk.red('An error occurred during correction. See --verbose for details.'));
      process.exitCode = 1;
    }
  });

program
  .command('forget')
  .description('Remove file from predictions')
  .argument('<file>', 'File path to forget')
  .action((file: string) => {
    const projectRoot = process.cwd();
    const storePath = path.join(projectRoot, STORE_DIR);
    if (!existsSync(storePath)) {
      console.error('Project not initialized. Run `co init` first.');
      process.exit(1);
    }

    const result = forgetFile(projectRoot, file);
    if (!result.ok) {
      console.error(chalk.red(result.error));
      process.exit(1);
    }

    const r = result.value;
    console.log(chalk.bold('\nRemoved from predictions:'));
    console.log(`  - Cleared from keyword index (${r.keywordsCleared} keywords)`);
    console.log(`  - Removed from ${r.coOccurrencesAffected} co-occurrence pattern(s)`);
    console.log(`  - Zeroed weight in ${r.affinitiesZeroed} type affinity map(s)`);
    console.log(`  - Will not be predicted unless re-discovered`);
    console.log(chalk.dim('\nUndo? Run: co scan (re-indexes if file still exists)'));
  });

program.parse();
