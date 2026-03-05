/**
 * Inline feedback UI and forget command logic.
 * Implements VL-05 (forget) and VL-06 (inline feedback) from PRD.
 */

import { createInterface } from 'node:readline';
import chalk from 'chalk';
import type { Result } from '../types/index.js';
import type { KeywordIndex, Patterns } from '../types/index.js';
import { ok, err, logger, toInternal } from '../utils/index.js';
import { readTaskHistory, writeTaskHistory, readKeywordIndex, writeKeywordIndex, readPatterns, writePatterns, readProjectMap } from '../store/index.js';
import { drawBox, formatTokenCount, formatPercentage } from './formatters.js';
import type { InlineFeedbackWithDescription, FeedbackResult, ForgetResult, TaskSummary, DetailedFeedback, ModelCorrection, CorrectionContext } from './types.js';

const MODULE = 'feedback';
const FEEDBACK_TIMEOUT_MS = 10_000;

const EMOJI_TERMINALS = new Set([
  'iTerm.app',
  'iTerm2',
  'vscode',
  'WezTerm',
  'Hyper',
  'Alacritty',
]);

// ─── Emoji Detection ──────────────────────────────────────────

/**
 * Detect whether the current terminal supports emoji rendering.
 */
export function supportsEmoji(): boolean {
  // Windows Terminal
  if (process.env.WT_SESSION) return true;

  // Known modern terminals
  const termProgram = process.env.TERM_PROGRAM ?? '';
  if (EMOJI_TERMINALS.has(termProgram)) return true;

  // macOS Terminal.app supports emoji
  if (termProgram === 'Apple_Terminal') return true;

  // Linux: most modern terminals support emoji, but we can't be certain
  // Default to false for safety
  return false;
}

// ─── Inline Feedback Prompt ───────────────────────────────────

/**
 * Format a task completion summary line for display above the feedback prompt.
 */
function formatTaskSummary(summary: TaskSummary): string {
  const accuracy = summary.actualCount > 0
    ? `${summary.predictedCount}/${summary.actualCount} files`
    : 'N/A';
  const lines = [
    `  ${chalk.dim('Task:')}   ${summary.description}`,
    `  ${chalk.dim('Files:')}  ${accuracy}  ${chalk.dim('Model:')} ${summary.modelUsed}  ${chalk.dim('Tokens:')} ${formatTokenCount(summary.tokensConsumed)}`,
  ];
  return drawBox('Task Complete', lines, { width: 72 });
}

/**
 * Read a single keypress from stdin (raw mode).
 * Returns the key character, or null on timeout/error.
 */
function readKeypress(timeoutMs: number): Promise<string | null> {
  return new Promise((resolve) => {
    // Non-interactive mode: skip feedback
    if (!process.stdin.isTTY) {
      resolve(null);
      return;
    }

    let resolved = false;
    const cleanup = (): void => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      process.stdin.removeListener('data', onData);
      if (process.stdin.isRaw !== undefined) {
        try { process.stdin.setRawMode(false); } catch { /* ignore */ }
      }
      process.stdin.pause();
    };

    const timer = setTimeout(() => {
      cleanup();
      resolve(null);
    }, timeoutMs);

    const onData = (buf: Buffer): void => {
      cleanup();
      const key = buf.toString('utf8').trim();
      resolve(key.length > 0 ? key[0] : null);
    };

    try {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.once('data', onData);
    } catch {
      cleanup();
      resolve(null);
    }
  });
}

/**
 * Read a single line of text input from stdin.
 */
function readLine(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Show the quick-reason submenu for bad feedback.
 */
export async function showQuickReasonMenu(): Promise<FeedbackResult> {
  console.log(chalk.yellow('  [1] Missed files  [2] Wrong files predicted  [3] Wrong model  [4] Describe...'));
  const key = await readKeypress(FEEDBACK_TIMEOUT_MS);

  if (key === null || key === '\x1b' || key === '\r' || key === '\n') {
    return null;
  }

  switch (key) {
    case '1':
      return { source: 'inline', rating: 'bad', quickReason: 'missed-files' };
    case '2':
      return { source: 'inline', rating: 'bad', quickReason: 'wrong-files' };
    case '3':
      return { source: 'inline', rating: 'bad', quickReason: 'wrong-model' };
    case '4': {
      const details = await readLine('  Describe: ');
      if (!details) return null;
      return { source: 'inline', rating: 'bad', details } as InlineFeedbackWithDescription;
    }
    default:
      return null;
  }
}

/**
 * Show the inline feedback prompt after task completion.
 * Non-blocking: auto-skips after 10 seconds or on Enter.
 */
export async function showInlineFeedback(taskSummary: TaskSummary): Promise<FeedbackResult> {
  // Non-interactive mode: skip
  if (!process.stdin.isTTY) return null;

  // Show task summary
  console.log(formatTaskSummary(taskSummary));

  // Show prompt (emoji or text fallback)
  const isEmoji = supportsEmoji();
  const promptText = isEmoji
    ? '  [👍 Good]  [👎 Bad]  [→ Skip]  '
    : '  [G]ood  [B]ad  [S]kip  ';
  process.stdout.write(chalk.bold(promptText));

  const key = await readKeypress(FEEDBACK_TIMEOUT_MS);

  // Clear prompt line
  console.log();

  if (key === null || key === '\r' || key === '\n') {
    return null; // Skip / timeout
  }

  const lower = key.toLowerCase();

  // Good
  if (lower === 'g' || key === '1') {
    return { source: 'inline', rating: 'good' };
  }

  // Bad — expand submenu
  if (lower === 'b' || key === '2') {
    return showQuickReasonMenu();
  }

  // Skip (explicit or any other key)
  return null;
}

// ─── Feedback Persistence ─────────────────────────────────────

/**
 * Record feedback in the task history entry.
 */
export function recordFeedback(projectRoot: string, taskId: string, feedback: FeedbackResult): Result<void> {
  const historyResult = readTaskHistory(projectRoot);
  if (!historyResult.ok) return err(`Failed to read task history: ${historyResult.error}`);

  const history = historyResult.value;
  const task = history.tasks.find((t) => t.id === taskId);

  if (!task) {
    logger.warn(MODULE, `Task not found in history: ${taskId}`);
    return err('Task not found');
  }

  // Set feedback field: FeedbackResult maps directly to the store's TaskFeedback | null
  task.feedback = feedback as typeof task.feedback;

  return writeTaskHistory(projectRoot, history);
}

// ─── Forget Command ───────────────────────────────────────────

/**
 * Remove a file from prediction knowledge (keyword index, co-occurrences, type affinities).
 * Does NOT modify the project map — file remains discoverable by scanner.
 */
export function forgetFile(projectRoot: string, filePath: string): Result<ForgetResult> {
  const normalizedPath = toInternal(filePath);

  // ─── Keyword Index cleanup ───────────────────────────────
  const indexResult = readKeywordIndex(projectRoot);
  if (!indexResult.ok) return err(`Failed to read keyword index: ${indexResult.error}`);

  const index: KeywordIndex = indexResult.value;
  let keywordsCleared = 0;

  // Check if file exists in the store at all
  const hasFileInIndex = normalizedPath in index.fileToKeywords;

  // Remove from keywordToFiles
  for (const keyword of Object.keys(index.keywordToFiles)) {
    const files = index.keywordToFiles[keyword];
    const idx = files.indexOf(normalizedPath);
    if (idx !== -1) {
      files.splice(idx, 1);
      keywordsCleared++;
      // Remove empty arrays
      if (files.length === 0) {
        delete index.keywordToFiles[keyword];
      }
    }
  }

  // Remove from fileToKeywords
  if (hasFileInIndex) {
    delete index.fileToKeywords[normalizedPath];
  }

  // ─── Patterns cleanup ────────────────────────────────────
  const patternsResult = readPatterns(projectRoot);
  if (!patternsResult.ok) return err(`Failed to read patterns: ${patternsResult.error}`);

  const patterns: Patterns = patternsResult.value;
  let coOccurrencesAffected = 0;
  let affinitiesZeroed = 0;

  // Check if file exists in patterns at all
  const hasFileInPatterns = patterns.coOccurrences.some(
    (co) => co.files[0] === normalizedPath || co.files[1] === normalizedPath,
  ) || Object.values(patterns.typeAffinities).some(
    (ta) => ta.files.includes(normalizedPath) || (ta.fileWeights && normalizedPath in ta.fileWeights),
  );

  // If file not found in any store data, report not found
  if (!hasFileInIndex && !hasFileInPatterns) {
    return err(`File not found in knowledge store: ${filePath}`);
  }

  // Zero confidence on co-occurrence entries containing the file
  for (const co of patterns.coOccurrences) {
    if (co.files[0] === normalizedPath || co.files[1] === normalizedPath) {
      co.confidence = 0;
      coOccurrencesAffected++;
    }
  }

  // Zero weight in typeAffinities
  for (const affinity of Object.values(patterns.typeAffinities)) {
    if (affinity.fileWeights && normalizedPath in affinity.fileWeights) {
      affinity.fileWeights[normalizedPath].weight = 0;
      affinitiesZeroed++;
    }
  }

  // ─── Write back ──────────────────────────────────────────
  const writeIndexResult = writeKeywordIndex(projectRoot, index);
  if (!writeIndexResult.ok) return err(`Failed to write keyword index: ${writeIndexResult.error}`);

  const writePatternsResult = writePatterns(projectRoot, patterns);
  if (!writePatternsResult.ok) return err(`Failed to write patterns: ${writePatternsResult.error}`);

  return ok({
    filePath: normalizedPath,
    keywordsCleared,
    coOccurrencesAffected,
    affinitiesZeroed,
  });
}

// ─── Correction Constants ────────────────────────────────────

const WEIGHT_BOOST_AMOUNT = 0.2;
const WEIGHT_DECAY_AMOUNT = 0.2;

// ─── Correction Context Loading (Task 2) ─────────────────────

/**
 * Load correction context for a specific task or the most recent task.
 */
export function loadCorrectionContext(projectRoot: string, taskId?: string): Result<CorrectionContext> {
  const historyResult = readTaskHistory(projectRoot);
  if (!historyResult.ok) return err(`Failed to read task history: ${historyResult.error}`);

  const history = historyResult.value;

  if (history.tasks.length === 0) {
    return err('No recent task to correct. Run a task first.');
  }

  let task;
  if (taskId) {
    task = history.tasks.find((t) => t.id === taskId);
    if (!task) return err(`Task not found: ${taskId}`);
  } else {
    // Most recent task (last in array)
    task = history.tasks[history.tasks.length - 1];
  }

  const predicted = task.prediction.predictedFiles;
  const actual = task.prediction.actualFiles;

  return ok({
    taskId: task.id,
    description: task.taskText,
    predictedFiles: predicted,
    actualFiles: actual,
    precision: task.prediction.precision,
    recall: task.prediction.recall,
    modelUsed: task.routing.model,
    existingFeedback: task.feedback as FeedbackResult,
  });
}

// ─── Correction Context Display (Task 3) ─────────────────────

/**
 * Display the correction context in a formatted box.
 */
export function displayCorrectionContext(ctx: CorrectionContext): void {
  const actualSet = new Set(ctx.actualFiles);
  const predictedSet = new Set(ctx.predictedFiles);

  const correctCount = ctx.predictedFiles.filter((f) => actualSet.has(f)).length;
  const totalPredicted = ctx.predictedFiles.length;

  const lines: string[] = [
    `  ${chalk.dim('Task:')}  ${ctx.description}`,
    `  ${chalk.dim('ID:')}    ${ctx.taskId}`,
    '',
    `  ${chalk.dim('Prediction:')} ${correctCount}/${totalPredicted} correct (precision: ${formatPercentage(ctx.precision)}, recall: ${formatPercentage(ctx.recall)})`,
    `  ${chalk.dim('Model:')} ${ctx.modelUsed}`,
    '',
    `  ${chalk.dim('Predicted files:')}`,
  ];

  for (const file of ctx.predictedFiles) {
    const icon = actualSet.has(file) ? chalk.green('✓') : chalk.red('✗');
    lines.push(`    ${icon} ${file}`);
  }

  // Show missed files (in actual but not predicted)
  const missed = ctx.actualFiles.filter((f) => !predictedSet.has(f));
  if (missed.length > 0) {
    lines.push('');
    lines.push(`  ${chalk.dim('Missed files:')}`);
    for (const file of missed) {
      lines.push(`    ${chalk.yellow('○')} ${file}`);
    }
  }

  console.log(drawBox('Correction Context', lines, { width: 78 }));
}

// ─── Correction Menu (Task 4) ────────────────────────────────

/**
 * Show the correction option menu and return selected option numbers.
 */
export async function showCorrectionMenu(): Promise<number[]> {
  console.log(chalk.bold('\n  What was wrong?\n'));
  console.log('  [1] Missed file(s)');
  console.log('  [2] Wrong file(s) predicted');
  console.log('  [3] Wrong model (too weak/strong)');
  console.log('  [4] Everything off');
  console.log('  [5] Describe in your own words');
  console.log();

  const input = await readLine('  Select option(s) (e.g., 1 or 1,3): ');
  const parts = input.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => n >= 1 && n <= 5);

  if (parts.length === 0) {
    return [];
  }

  return [...new Set(parts)];
}

// ─── Tab-Complete File Path Input (Task 5) ───────────────────

/**
 * Create a completer function for readline that matches against a file list.
 */
function createFileCompleter(files: string[]): (line: string) => [string[], string] {
  return (line: string): [string[], string] => {
    const parts = line.split(',');
    const current = parts[parts.length - 1].trim();
    const hits = files.filter((f) => f.startsWith(current));
    return [hits.length ? hits : files.slice(0, 20), current];
  };
}

/**
 * Prompt for file paths with tab-completion support.
 */
export async function promptFilePaths(prompt: string, suggestions: string[], projectRoot: string): Promise<string[]> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      completer: createFileCompleter(suggestions),
    });

    rl.question(`  ${prompt} `, (answer) => {
      rl.close();
      if (!answer.trim()) {
        resolve([]);
        return;
      }

      const paths = answer.split(',').map((p) => toInternal(p.trim())).filter((p) => p.length > 0);

      // Validate against project map (warn only)
      const mapResult = readProjectMap(projectRoot);
      if (mapResult.ok) {
        const knownFiles = new Set(Object.keys(mapResult.value.files));
        for (const p of paths) {
          if (!knownFiles.has(p)) {
            console.log(chalk.yellow(`  ⚠ File not in project map: ${p} (accepted anyway)`));
          }
        }
      }

      resolve(paths);
    });
  });
}

// ─── Model Correction Input (Task 6) ─────────────────────────

/**
 * Prompt for model correction details.
 */
export async function promptModelCorrection(currentModel: string): Promise<ModelCorrection> {
  console.log(`  ${chalk.dim('Current model:')} ${currentModel}`);
  const dirInput = await readLine('  Was the model too [w]eak or too [s]trong? ');
  const direction: 'too-weak' | 'too-strong' = dirInput.toLowerCase().startsWith('s') ? 'too-strong' : 'too-weak';

  const sugInput = await readLine('  Suggested model? [haiku/sonnet/opus] (Enter to skip): ');
  const suggested = (['haiku', 'sonnet', 'opus'] as const).find((m) => sugInput.toLowerCase() === m);

  return { direction, suggested };
}

// ─── Free-Text Description Input (Task 7) ────────────────────

/**
 * Prompt for a free-text description.
 */
export async function promptDescription(): Promise<string> {
  const text = await readLine('  Describe what went wrong: ');
  return text.trim();
}

// ─── Immediate Weight Correction (Task 9) ────────────────────

/**
 * Apply immediate weight corrections based on detailed feedback.
 */
export function applyDetailedCorrection(feedback: DetailedFeedback, context: CorrectionContext, projectRoot: string): Result<void> {
  const patternsResult = readPatterns(projectRoot);
  if (!patternsResult.ok) return err(`Failed to read patterns: ${patternsResult.error}`);

  const patterns = patternsResult.value;
  let changed = false;

  // Determine the task type from context (look up in history)
  const historyResult = readTaskHistory(projectRoot);
  const taskType = historyResult.ok
    ? historyResult.value.tasks.find((t) => t.id === context.taskId)?.classification.taskType ?? 'unknown'
    : 'unknown';

  // Boost missed files
  if (feedback.missedFiles && feedback.missedFiles.length > 0) {
    for (const file of feedback.missedFiles) {
      const normalized = toInternal(file);
      // Find or create affinity for this task type
      if (!patterns.typeAffinities[taskType]) {
        patterns.typeAffinities[taskType] = {
          taskType,
          files: [],
          confidence: 0.5,
          fileWeights: {},
        };
      }
      const affinity = patterns.typeAffinities[taskType];
      if (!affinity.fileWeights) affinity.fileWeights = {};

      const current = affinity.fileWeights[normalized]?.weight ?? 0.3;
      const newWeight = Math.min(current + WEIGHT_BOOST_AMOUNT, 1.0);
      affinity.fileWeights[normalized] = {
        weight: newWeight,
        occurrences: (affinity.fileWeights[normalized]?.occurrences ?? 0) + 1,
      };
      if (!affinity.files.includes(normalized)) {
        affinity.files.push(normalized);
      }
      changed = true;
      logger.debug(MODULE, `Boosted ${normalized} for ${taskType}: ${current.toFixed(2)} -> ${newWeight.toFixed(2)}`);
    }
  }

  // Decay wrong files
  if (feedback.wrongFiles && feedback.wrongFiles.length > 0) {
    for (const file of feedback.wrongFiles) {
      const normalized = toInternal(file);
      const affinity = patterns.typeAffinities[taskType];
      if (affinity?.fileWeights && normalized in affinity.fileWeights) {
        const current = affinity.fileWeights[normalized].weight;
        const newWeight = Math.max(current - WEIGHT_DECAY_AMOUNT, 0.0);
        affinity.fileWeights[normalized].weight = newWeight;
        changed = true;
        logger.debug(MODULE, `Decayed ${normalized} for ${taskType}: ${current.toFixed(2)} -> ${newWeight.toFixed(2)}`);
      }
    }
  }

  if (changed) {
    const writeResult = writePatterns(projectRoot, patterns);
    if (!writeResult.ok) return err(`Failed to write patterns: ${writeResult.error}`);
  }

  // Model correction: mark the task's routing as unsuccessful
  if (feedback.modelCorrection) {
    const histResult = readTaskHistory(projectRoot);
    if (histResult.ok) {
      const task = histResult.value.tasks.find((t) => t.id === context.taskId);
      if (task) {
        task.routing.reason = `manual-correction: ${feedback.modelCorrection.direction}${feedback.modelCorrection.suggested ? ` (suggested: ${feedback.modelCorrection.suggested})` : ''}`;
        writeTaskHistory(projectRoot, histResult.value);
        logger.debug(MODULE, `Updated routing for ${context.taskId}: ${task.routing.reason}`);
      }
    }
  }

  return ok(undefined);
}

// ─── Main Correct Command Flow (Task 8) ──────────────────────

/**
 * Run the `co correct` interactive correction flow.
 */
export async function runCorrectCommand(projectRoot: string, taskId?: string): Promise<void> {
  // Non-interactive check
  if (!process.stdin.isTTY) {
    console.log('Correction mode requires an interactive terminal.');
    return;
  }

  // Step 1: Load correction context
  const ctxResult = loadCorrectionContext(projectRoot, taskId);
  if (!ctxResult.ok) {
    console.log(ctxResult.error);
    return;
  }
  const ctx = ctxResult.value;

  // Step 2: Check for existing feedback (AC11)
  if (ctx.existingFeedback) {
    console.log(chalk.yellow('\n  This task already has feedback:'));
    console.log(`  ${JSON.stringify(ctx.existingFeedback, null, 2)}`);
    const answer = await readLine('  Replace? [y/N] ');
    if (answer.toLowerCase() !== 'y') {
      return;
    }
  }

  // Step 3: Display context
  displayCorrectionContext(ctx);

  // Step 4: Show correction menu
  const options = await showCorrectionMenu();
  if (options.length === 0) {
    console.log('  No option selected. Exiting.');
    return;
  }

  // Step 5: Collect details based on selected options
  let missedFiles: string[] | undefined;
  let wrongFiles: string[] | undefined;
  let modelCorrection: ModelCorrection | undefined;
  let details: string | undefined;

  // Get project map files for tab-complete suggestions
  const mapResult = readProjectMap(projectRoot);
  const projectMapFiles = mapResult.ok ? Object.keys(mapResult.value.files) : [];

  for (const opt of options) {
    switch (opt) {
      case 1: {
        const files = await promptFilePaths('Which files were missed? (tab-complete available)', projectMapFiles, projectRoot);
        if (files.length > 0) missedFiles = files;
        break;
      }
      case 2: {
        const files = await promptFilePaths('Which predicted files were wrong?', ctx.predictedFiles, projectRoot);
        if (files.length > 0) wrongFiles = files;
        break;
      }
      case 3:
        modelCorrection = await promptModelCorrection(ctx.modelUsed);
        break;
      case 4: {
        const desc = await promptDescription();
        if (desc) details = `Everything was off: ${desc}`;
        break;
      }
      case 5: {
        const desc = await promptDescription();
        if (desc) details = desc;
        break;
      }
    }
  }

  // Step 6: Assemble DetailedFeedback
  const feedback: DetailedFeedback = {
    source: 'cli-correct',
    rating: 'bad',
    ...(details !== undefined && { details }),
    ...(missedFiles !== undefined && { missedFiles }),
    ...(wrongFiles !== undefined && { wrongFiles }),
    ...(modelCorrection !== undefined && { modelCorrection }),
  };

  // Step 7: Persist feedback
  const recordResult = recordFeedback(projectRoot, ctx.taskId, feedback);
  if (!recordResult.ok) {
    console.error(chalk.red(`  Failed to record feedback: ${recordResult.error}`));
    return;
  }

  // Step 8: Apply immediate weight corrections
  const correctionResult = applyDetailedCorrection(feedback, ctx, projectRoot);
  if (!correctionResult.ok) {
    logger.warn(MODULE, `Weight correction failed: ${correctionResult.error}`);
  }

  // Step 9: Show confirmation
  const applied: string[] = [];
  if (missedFiles) applied.push(`${missedFiles.length} missed file(s) boosted`);
  if (wrongFiles) applied.push(`${wrongFiles.length} wrong file(s) decayed`);
  if (modelCorrection) applied.push(`model correction: ${modelCorrection.direction}`);
  if (details) applied.push('description recorded');

  console.log(chalk.green(`\n  ✓ Feedback recorded.`) + (applied.length > 0 ? ` ${applied.join(', ')}` : ''));
}
