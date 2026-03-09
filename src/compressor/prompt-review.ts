/**
 * Prompt Review UI — interactive review with send/edit/cancel controls (Story 2.5).
 * Displays the optimized prompt with formatted sections and awaits user action.
 */

import chalk from 'chalk';
import { spawn } from 'node:child_process';
import { writeFileSync, readFileSync, unlinkSync, mkdtempSync, rmdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createInterface } from 'node:readline';
import type { PipelineContext } from '../types/index.js';
import { ReviewAction } from './types.js';
import type { ReviewResult } from './types.js';
import { logger } from '../utils/index.js';

const MODULE = 'prompt-review';

const BOX_TOP_LEFT = '┌';
const BOX_TOP_RIGHT = '┐';
const BOX_BOTTOM_LEFT = '└';
const BOX_BOTTOM_RIGHT = '┘';
const BOX_HORIZONTAL = '─';
const BOX_VERTICAL = '│';
const BOX_TEE_LEFT = '├';
const BOX_TEE_RIGHT = '┤';

/** RV1: Min/max clamp for adaptive box width. */
const BOX_WIDTH_MIN = 40;
const BOX_WIDTH_MAX = 120;
const BOX_WIDTH_DEFAULT = 80;

/** RV8: Idle timeout in ms before re-prompting. */
const IDLE_TIMEOUT_MS = 60_000;

/** RV8: Number of idle timeouts before auto-cancel. */
const MAX_IDLE_TIMEOUTS = 3;

/** RV11: Maximum edit cycles before forcing a decision. */
const MAX_EDIT_CYCLES = 3;

/** RV6: Maximum diff lines to display. */
const MAX_DIFF_LINES = 10;

/** RV1: Compute adaptive box width from terminal columns. */
export function getBoxWidth(): number {
  const cols = process.stdout.columns || BOX_WIDTH_DEFAULT;
  return Math.min(Math.max(cols - 4, BOX_WIDTH_MIN), BOX_WIDTH_MAX);
}

/** RV5: Max display lines for truncated sections. */
const MAX_SECTION_LINES = 5;

function horizontalLine(left: string, right: string, width: number): string {
  return left + BOX_HORIZONTAL.repeat(width - 2) + right;
}

function boxLine(text: string, width: number): string {
  const stripped = stripAnsi(text);
  const padding = Math.max(0, width - 4 - stripped.length);
  return `${BOX_VERTICAL}  ${text}${' '.repeat(padding)}${BOX_VERTICAL}`;
}

function emptyBoxLine(width: number): string {
  return `${BOX_VERTICAL}${' '.repeat(width - 2)}${BOX_VERTICAL}`;
}

/** Strip ANSI escape codes for length calculation. */
function stripAnsi(str: string): string {
  return str.replace(/\x1B\[[0-9;]*m/g, '');
}

/** RV4: Estimate token count for a string using simple chars/3.5 approximation. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

/**
 * RV5: Render a truncated section with "... and N more lines" indicator.
 */
function renderTruncatedLines(
  allLines: string[],
  maxLines: number,
  width: number,
  lines: string[],
): void {
  const displayed = allLines.slice(0, maxLines);
  for (const line of displayed) {
    lines.push(boxLine(chalk.dim(`  ${line.trim()}`), width));
  }
  if (allLines.length > maxLines) {
    lines.push(boxLine(chalk.dim(`  ... and ${allLines.length - maxLines} more lines`), width));
  }
}

/**
 * RV6: Compute a simple line-level diff between two strings.
 * Returns an array of { type: 'add' | 'remove' | 'same', line: string }.
 */
export function computeSimpleDiff(
  before: string,
  after: string,
): Array<{ type: 'add' | 'remove' | 'same'; line: string }> {
  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');
  const diff: Array<{ type: 'add' | 'remove' | 'same'; line: string }> = [];

  const maxLen = Math.max(beforeLines.length, afterLines.length);
  for (let i = 0; i < maxLen; i++) {
    const bLine = i < beforeLines.length ? beforeLines[i] : undefined;
    const aLine = i < afterLines.length ? afterLines[i] : undefined;

    if (bLine === aLine) {
      diff.push({ type: 'same', line: bLine! });
    } else {
      if (bLine !== undefined) {
        diff.push({ type: 'remove', line: bLine });
      }
      if (aLine !== undefined) {
        diff.push({ type: 'add', line: aLine });
      }
    }
  }

  return diff;
}

/**
 * RV6: Format and display a compact diff after editing.
 * Shows removed lines in red, added lines in green. Caps at MAX_DIFF_LINES.
 */
export function formatDiffDisplay(before: string, after: string): string {
  if (before === after) {
    return chalk.dim('  No changes made.');
  }

  const diff = computeSimpleDiff(before, after);
  const changedLines = diff.filter(d => d.type !== 'same');

  if (changedLines.length === 0) {
    return chalk.dim('  No changes made.');
  }

  const lines: string[] = [chalk.bold.white('  Changes:')];
  const displayed = changedLines.slice(0, MAX_DIFF_LINES);

  for (const entry of displayed) {
    const truncated = entry.line.length > 60 ? entry.line.slice(0, 57) + '...' : entry.line;
    if (entry.type === 'remove') {
      lines.push(chalk.red(`  - ${truncated}`));
    } else {
      lines.push(chalk.green(`  + ${truncated}`));
    }
  }

  if (changedLines.length > MAX_DIFF_LINES) {
    lines.push(chalk.dim(`  ... and ${changedLines.length - MAX_DIFF_LINES} more changes`));
  }

  return lines.join('\n');
}

/**
 * Format the prompt review display with box-drawing characters and Chalk styling.
 */
export function formatPromptDisplay(ctx: PipelineContext, isDryRun: boolean): string {
  const width = getBoxWidth();
  const lines: string[] = [];

  // Header
  lines.push(horizontalLine(BOX_TOP_LEFT, BOX_TOP_RIGHT, width));
  lines.push(boxLine(chalk.bold.cyan('Optimized Prompt Review'), width));

  // Model and routing info
  if (ctx.routing) {
    const modelName = ctx.routing.model.charAt(0).toUpperCase() + ctx.routing.model.slice(1);
    lines.push(boxLine(chalk.dim(`Model: ${modelName} — ${ctx.routing.rationale}`), width));
  }

  lines.push(horizontalLine(BOX_TEE_LEFT, BOX_TEE_RIGHT, width));

  // Section 1: Original Prompt
  lines.push(boxLine(chalk.bold.white('Original:'), width));
  const originalLines = wrapText(ctx.taskText, width - 6);
  for (const line of originalLines) {
    lines.push(boxLine(chalk.dim(`  ${line}`), width));
  }
  lines.push(emptyBoxLine(width));

  // Section 2: Compressed Request
  if (ctx.compression) {
    const userSection = ctx.compression.sections.find(s => s.type === 'userRequest');
    if (userSection) {
      lines.push(boxLine(chalk.bold.white('Compressed:'), width));
      const compressedLines = wrapText(userSection.content, width - 6);
      for (const line of compressedLines) {
        lines.push(boxLine(chalk.dim(`  ${line}`), width));
      }
    }

    // RV2: Compression stats
    const stats = ctx.compression.stats;
    const statParts: string[] = [];
    if (stats.fillerWordsRemoved > 0) {
      statParts.push(`${stats.fillerWordsRemoved} fillers removed`);
    }
    if (stats.filesInjected > 0) {
      statParts.push(`${stats.filesInjected} files injected`);
    }
    if (stats.patternsInjected > 0) {
      statParts.push(`${stats.patternsInjected} conventions`);
    }
    if (stats.compressionRatio > 0 && stats.compressionRatio < 1) {
      statParts.push(`${Math.round(stats.compressionRatio * 100)}% ratio`);
    }
    // RV4: Token estimate for the full assembled prompt
    const tokenEst = estimateTokens(ctx.compression.optimizedPrompt);
    statParts.push(`~${tokenEst} tokens`);

    if (statParts.length > 0) {
      lines.push(boxLine(chalk.dim(`  ${statParts.join(' · ')}`), width));
    }
  }

  lines.push(horizontalLine(BOX_TEE_LEFT, BOX_TEE_RIGHT, width));

  // Section 3: Predicted Files — RV3: merged top confidence into header
  if (ctx.prediction && ctx.prediction.predictions.length > 0) {
    const preds = ctx.prediction.predictions;
    const topConf = Math.round(preds[0].score * 100);
    lines.push(boxLine(chalk.bold.white(`Predicted Files (${preds.length}, top: ${topConf}%):`), width));
    for (const pred of preds.slice(0, 10)) {
      const pct = Math.round(pred.score * 100);
      lines.push(boxLine(`  ${chalk.yellow(`${pct}%`)} ${pred.filePath}`, width));
    }
    if (preds.length > 10) {
      lines.push(boxLine(chalk.dim(`  ... and ${preds.length - 10} more`), width));
    }
    lines.push(horizontalLine(BOX_TEE_LEFT, BOX_TEE_RIGHT, width));
  }

  // Section 4: Conventions — RV5: truncation indicator
  if (ctx.compression) {
    const conventions = ctx.compression.sections.find(s => s.type === 'conventions');
    if (conventions && conventions.content.trim()) {
      lines.push(boxLine(chalk.bold.white('Conventions:'), width));
      const convLines = conventions.content.trim().split('\n');
      renderTruncatedLines(convLines, MAX_SECTION_LINES, width, lines);
      lines.push(horizontalLine(BOX_TEE_LEFT, BOX_TEE_RIGHT, width));
    }
  }

  // Section 5: Domain Context — RV5: truncation indicator
  if (ctx.compression) {
    const domain = ctx.compression.sections.find(s => s.type === 'domainContext');
    if (domain && domain.content.trim()) {
      lines.push(boxLine(chalk.bold.white('Domain Context:'), width));
      const domainLines = domain.content.trim().split('\n');
      renderTruncatedLines(domainLines, MAX_SECTION_LINES, width, lines);
      lines.push(horizontalLine(BOX_TEE_LEFT, BOX_TEE_RIGHT, width));
    }
  }

  // RV3: Removed redundant prediction summary (was duplicating file count + top confidence)

  // Action prompt
  if (isDryRun) {
    lines.push(boxLine(chalk.dim('(dry-run mode — display only)'), width));
  } else {
    lines.push(boxLine(`${chalk.green('[Enter]')} Send  ${chalk.dim('|')}  ${chalk.yellow('[e]')} Edit  ${chalk.dim('|')}  ${chalk.red('[c]')} Cancel`, width));
  }
  lines.push(horizontalLine(BOX_BOTTOM_LEFT, BOX_BOTTOM_RIGHT, width));

  return lines.join('\n');
}

/**
 * RV11: Format a compact re-review display showing the edited prompt.
 * Includes revert option (RV12).
 */
function formatReReviewDisplay(editedPrompt: string, editCycle: number): string {
  const width = getBoxWidth();
  const lines: string[] = [];

  lines.push(horizontalLine(BOX_TOP_LEFT, BOX_TOP_RIGHT, width));
  lines.push(boxLine(chalk.bold.cyan(`Edited Prompt (edit ${editCycle}/${MAX_EDIT_CYCLES})`), width));
  lines.push(horizontalLine(BOX_TEE_LEFT, BOX_TEE_RIGHT, width));

  const promptLines = wrapText(editedPrompt, width - 6);
  for (const line of promptLines.slice(0, 10)) {
    lines.push(boxLine(chalk.dim(`  ${line}`), width));
  }
  if (promptLines.length > 10) {
    lines.push(boxLine(chalk.dim(`  ... and ${promptLines.length - 10} more lines`), width));
  }

  lines.push(horizontalLine(BOX_TEE_LEFT, BOX_TEE_RIGHT, width));
  // RV12: Include [r] Revert option
  lines.push(boxLine(
    `${chalk.green('[Enter]')} Send  ${chalk.dim('|')}  ${chalk.yellow('[e]')} Re-edit  ${chalk.dim('|')}  ${chalk.blue('[r]')} Revert  ${chalk.dim('|')}  ${chalk.red('[c]')} Cancel`,
    width,
  ));
  lines.push(horizontalLine(BOX_BOTTOM_LEFT, BOX_BOTTOM_RIGHT, width));

  return lines.join('\n');
}

/** Wrap text to fit within a given width. */
function wrapText(text: string, maxWidth: number): string[] {
  if (text.length <= maxWidth) return [text];
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (current.length + word.length + 1 > maxWidth && current.length > 0) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * RV7+RV8: Read a single keypress from stdin in raw mode.
 * Ignores unrecognized keys. Supports idle timeout with re-prompt.
 * @param validKeys - Set of additional valid single-char keys beyond Enter/Ctrl+C
 * @param timeoutMs - Idle timeout in ms (0 = no timeout)
 */
export async function readKeypress(
  validKeys: Set<string> = new Set(['e', 'E', 'c', 'C']),
  timeoutMs = 0,
): Promise<ReviewAction | 'timeout'> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    let timer: ReturnType<typeof setTimeout> | undefined;

    if (stdin.isTTY) {
      stdin.setRawMode(true);
    }
    stdin.resume();

    // RV8: Set idle timeout if requested
    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        cleanup();
        resolve('timeout');
      }, timeoutMs);
    }

    const onData = (data: Buffer): void => {
      const key = data.toString();

      // Ctrl+C
      if (key === '\x03') {
        cleanup();
        resolve(ReviewAction.Cancel);
        return;
      }
      // Enter
      if (key === '\r' || key === '\n') {
        cleanup();
        resolve(ReviewAction.Send);
        return;
      }
      // e/E for edit
      if (key === 'e' || key === 'E') {
        if (validKeys.has(key)) {
          cleanup();
          resolve(ReviewAction.Edit);
          return;
        }
      }
      // c/C for cancel
      if (key === 'c' || key === 'C') {
        if (validKeys.has(key)) {
          cleanup();
          resolve(ReviewAction.Cancel);
          return;
        }
      }
      // RV12: r/R for revert (only when in valid keys)
      if (key === 'r' || key === 'R') {
        if (validKeys.has(key)) {
          cleanup();
          resolve('revert' as unknown as ReviewAction);
          return;
        }
      }
      // RV7: Unrecognized key — ignore and keep listening
    };

    function cleanup(): void {
      if (timer) clearTimeout(timer);
      stdin.removeListener('data', onData);
      if (stdin.isTTY) {
        stdin.setRawMode(wasRaw ?? false);
      }
      stdin.pause();
    }

    stdin.on('data', onData);
  });
}

/**
 * Detect the user's preferred editor.
 */
export function detectEditor(): string {
  const envEditor = process.env['EDITOR'];
  if (envEditor) return envEditor;

  if (process.platform === 'win32') return 'notepad';
  return 'vi';
}

/**
 * RV9+RV10: Open the prompt in the user's $EDITOR for editing.
 * Returns the edited content. Cleans up temp directory. Validates non-empty result.
 */
export async function editInEditor(content: string): Promise<string> {
  const tempDir = mkdtempSync(join(tmpdir(), 'claude-opt-'));
  const tempFile = join(tempDir, 'prompt-review.txt');

  writeFileSync(tempFile, content, 'utf-8');

  const editor = detectEditor();
  logger.debug(MODULE, `Opening editor: ${editor} ${tempFile}`);

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(editor, [tempFile], { stdio: 'inherit', shell: true });
      child.on('close', (code) => {
        if (code === 0 || code === null) {
          resolve();
        } else {
          reject(new Error(`Editor exited with code ${code}`));
        }
      });
      child.on('error', (err) => {
        reject(new Error(`Failed to launch editor: ${err.message}`));
      });
    });

    const edited = readFileSync(tempFile, 'utf-8');

    // RV10: Validate non-empty edit
    if (!edited.trim()) {
      logger.warn(MODULE, 'Empty edit detected — using original prompt');
      return content;
    }

    return edited;
  } finally {
    // RV9: Clean up both temp file and temp directory
    try {
      unlinkSync(tempFile);
    } catch {
      // Best-effort
    }
    try {
      rmdirSync(tempDir);
    } catch {
      // Best-effort — directory may not be empty or already gone
    }
  }
}

/**
 * Inline terminal editing fallback when no $EDITOR is available.
 * Prompts user to type a replacement prompt.
 */
export async function editInline(currentPrompt: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  process.stdout.write(chalk.dim('\nCurrent prompt:\n'));
  process.stdout.write(currentPrompt + '\n\n');
  process.stdout.write(chalk.yellow('Type replacement prompt (press Enter to confirm):\n'));

  return new Promise((resolve) => {
    rl.question('> ', (answer) => {
      rl.close();
      resolve(answer.trim() || currentPrompt);
    });
  });
}

/**
 * Perform an edit operation: try editor first, fall back to inline.
 * Returns the edited prompt (or original if empty).
 */
async function performEdit(currentPrompt: string): Promise<string> {
  let editedPrompt: string;
  try {
    editedPrompt = await editInEditor(currentPrompt);
  } catch {
    logger.warn(MODULE, 'Editor failed, falling back to inline edit');
    editedPrompt = await editInline(currentPrompt);
  }

  // RV10: Final validation — empty edit falls back
  if (!editedPrompt.trim()) {
    logger.warn(MODULE, 'Empty edit — using original prompt');
    return currentPrompt;
  }

  return editedPrompt;
}

/**
 * RV8: Read keypress with idle timeout support.
 * Re-displays action hint on timeout. Auto-cancels after MAX_IDLE_TIMEOUTS.
 */
async function readKeypressWithTimeout(
  validKeys: Set<string> = new Set(['e', 'E', 'c', 'C']),
): Promise<ReviewAction | 'revert'> {
  let idleCount = 0;

  while (idleCount < MAX_IDLE_TIMEOUTS) {
    const result = await readKeypress(validKeys, IDLE_TIMEOUT_MS);

    if (result === 'timeout') {
      idleCount++;
      if (idleCount >= MAX_IDLE_TIMEOUTS) {
        process.stdout.write(chalk.red(`\nIdle timeout (${MAX_IDLE_TIMEOUTS}×${IDLE_TIMEOUT_MS / 1000}s) — auto-cancelling.\n`));
        return ReviewAction.Cancel;
      }
      // Re-display action hint
      const hasRevert = validKeys.has('r');
      if (hasRevert) {
        process.stdout.write(chalk.dim(`\n  [Enter] Send | [e] Re-edit | [r] Revert | [c] Cancel\n`));
      } else {
        process.stdout.write(chalk.dim(`\n  [Enter] Send | [e] Edit | [c] Cancel\n`));
      }
      continue;
    }

    return result as ReviewAction | 'revert';
  }

  return ReviewAction.Cancel;
}

/**
 * Main review function — displays the formatted prompt and waits for user action.
 * Returns a ReviewResult indicating what the user chose.
 *
 * This is the pipeline-facing entry point.
 */
export async function reviewPrompt(ctx: PipelineContext): Promise<ReviewResult> {
  const optimizedPrompt = ctx.compression?.optimizedPrompt ?? ctx.taskText;

  // Display the formatted review
  const display = formatPromptDisplay(ctx, ctx.isDryRun);
  process.stdout.write(display + '\n');

  // In dry-run mode, show display only and return Send with the prompt
  if (ctx.isDryRun) {
    logger.info(MODULE, 'Dry-run mode: skipping action prompt');
    return {
      action: ReviewAction.Send,
      finalPrompt: optimizedPrompt,
      wasEdited: false,
    };
  }

  // Non-interactive terminal (e.g., piped, CI) — default to Send
  if (!process.stdin.isTTY) {
    logger.info(MODULE, 'Non-interactive terminal: auto-sending prompt');
    return {
      action: ReviewAction.Send,
      finalPrompt: optimizedPrompt,
      wasEdited: false,
    };
  }

  // RV8: Read user action with idle timeout
  const action = await readKeypressWithTimeout();

  switch (action) {
    case ReviewAction.Send: {
      process.stdout.write(chalk.green('\n✓ Sending prompt...\n'));
      return {
        action: ReviewAction.Send,
        finalPrompt: optimizedPrompt,
        wasEdited: false,
      };
    }

    case ReviewAction.Edit: {
      process.stdout.write(chalk.yellow('\nOpening editor...\n'));
      let editedPrompt = await performEdit(optimizedPrompt);

      // RV6: Show diff after edit
      const diffDisplay = formatDiffDisplay(optimizedPrompt, editedPrompt);
      process.stdout.write('\n' + diffDisplay + '\n');

      // RV11: Re-review loop after edit (up to MAX_EDIT_CYCLES)
      let editCycle = 1;
      while (editCycle < MAX_EDIT_CYCLES) {
        // Show re-review display with revert option (RV12)
        const reReview = formatReReviewDisplay(editedPrompt, editCycle);
        process.stdout.write('\n' + reReview + '\n');

        // RV12: Include r/R in valid keys for revert
        const reAction = await readKeypressWithTimeout(new Set(['e', 'E', 'c', 'C', 'r', 'R']));

        if (reAction === ReviewAction.Send) {
          process.stdout.write(chalk.green('\n✓ Sending edited prompt...\n'));
          return {
            action: ReviewAction.Edit,
            finalPrompt: editedPrompt,
            wasEdited: editedPrompt !== optimizedPrompt,
          };
        }

        if (reAction === ReviewAction.Cancel) {
          process.stdout.write(chalk.red('\nTask cancelled.\n'));
          return {
            action: ReviewAction.Cancel,
            finalPrompt: '',
            wasEdited: false,
            cancelledByUser: true,
          };
        }

        // RV12: Revert to original optimized prompt
        if (reAction === 'revert') {
          process.stdout.write(chalk.blue('\n↩ Reverted to original optimized prompt.\n'));
          editedPrompt = optimizedPrompt;
          // Show the main review display again
          const mainDisplay = formatPromptDisplay(ctx, false);
          process.stdout.write(mainDisplay + '\n');

          const mainAction = await readKeypressWithTimeout();
          if (mainAction === ReviewAction.Send) {
            process.stdout.write(chalk.green('\n✓ Sending prompt...\n'));
            return {
              action: ReviewAction.Send,
              finalPrompt: optimizedPrompt,
              wasEdited: false,
            };
          }
          if (mainAction === ReviewAction.Cancel) {
            process.stdout.write(chalk.red('\nTask cancelled.\n'));
            return { action: ReviewAction.Cancel, finalPrompt: '', wasEdited: false, cancelledByUser: true };
          }
          if (mainAction === ReviewAction.Edit) {
            // Continue to next edit cycle
            process.stdout.write(chalk.yellow('\nOpening editor...\n'));
            editedPrompt = await performEdit(optimizedPrompt);
            const newDiff = formatDiffDisplay(optimizedPrompt, editedPrompt);
            process.stdout.write('\n' + newDiff + '\n');
            editCycle++;
            continue;
          }
        }

        // Re-edit
        if (reAction === ReviewAction.Edit) {
          process.stdout.write(chalk.yellow('\nOpening editor...\n'));
          const previousPrompt = editedPrompt;
          editedPrompt = await performEdit(editedPrompt);
          const newDiff = formatDiffDisplay(previousPrompt, editedPrompt);
          process.stdout.write('\n' + newDiff + '\n');
          editCycle++;
          continue;
        }
      }

      // Max edit cycles reached — send the last edited version
      process.stdout.write(chalk.dim(`\nMax edit cycles (${MAX_EDIT_CYCLES}) reached — sending prompt.\n`));
      return {
        action: ReviewAction.Edit,
        finalPrompt: editedPrompt,
        wasEdited: editedPrompt !== optimizedPrompt,
      };
    }

    case ReviewAction.Cancel: {
      process.stdout.write(chalk.red('\nTask cancelled.\n'));
      // RV13: Signal cancellation for learning pipeline
      return {
        action: ReviewAction.Cancel,
        finalPrompt: '',
        wasEdited: false,
        cancelledByUser: true,
      };
    }

    default:
      // Should not reach here, but handle gracefully
      return {
        action: ReviewAction.Send,
        finalPrompt: optimizedPrompt,
        wasEdited: false,
      };
  }
}
