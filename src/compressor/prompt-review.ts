/**
 * Prompt Review UI — interactive review with send/edit/cancel controls (Story 2.5).
 * Displays the optimized prompt with formatted sections and awaits user action.
 */

import chalk from 'chalk';
import { spawn } from 'node:child_process';
import { writeFileSync, readFileSync, unlinkSync, mkdtempSync } from 'node:fs';
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

const BOX_WIDTH = 60;

function horizontalLine(left: string, right: string): string {
  return left + BOX_HORIZONTAL.repeat(BOX_WIDTH - 2) + right;
}

function boxLine(text: string): string {
  const stripped = stripAnsi(text);
  const padding = Math.max(0, BOX_WIDTH - 4 - stripped.length);
  return `${BOX_VERTICAL}  ${text}${' '.repeat(padding)}${BOX_VERTICAL}`;
}

function emptyBoxLine(): string {
  return `${BOX_VERTICAL}${' '.repeat(BOX_WIDTH - 2)}${BOX_VERTICAL}`;
}

/** Strip ANSI escape codes for length calculation. */
function stripAnsi(str: string): string {
  return str.replace(/\x1B\[[0-9;]*m/g, '');
}

/**
 * Format the prompt review display with box-drawing characters and Chalk styling.
 */
export function formatPromptDisplay(ctx: PipelineContext, isDryRun: boolean): string {
  const lines: string[] = [];

  // Header
  lines.push(horizontalLine(BOX_TOP_LEFT, BOX_TOP_RIGHT));
  lines.push(boxLine(chalk.bold.cyan('Optimized Prompt Review')));

  // Model and routing info
  if (ctx.routing) {
    const modelName = ctx.routing.model.charAt(0).toUpperCase() + ctx.routing.model.slice(1);
    lines.push(boxLine(chalk.dim(`Model: ${modelName} — ${ctx.routing.rationale}`)));
  }

  lines.push(horizontalLine(BOX_TEE_LEFT, BOX_TEE_RIGHT));

  // Section 1: Original Prompt
  lines.push(boxLine(chalk.bold.white('Original:')));
  const originalLines = wrapText(ctx.taskText, BOX_WIDTH - 6);
  for (const line of originalLines) {
    lines.push(boxLine(chalk.dim(`  ${line}`)));
  }
  lines.push(emptyBoxLine());

  // Section 2: Compressed Request
  if (ctx.compression) {
    const userSection = ctx.compression.sections.find(s => s.type === 'userRequest');
    if (userSection) {
      lines.push(boxLine(chalk.bold.white('Compressed:')));
      const compressedLines = wrapText(userSection.content, BOX_WIDTH - 6);
      for (const line of compressedLines) {
        lines.push(boxLine(chalk.dim(`  ${line}`)));
      }
    }
  }

  lines.push(horizontalLine(BOX_TEE_LEFT, BOX_TEE_RIGHT));

  // Section 3: Predicted Files
  if (ctx.prediction && ctx.prediction.predictions.length > 0) {
    const preds = ctx.prediction.predictions;
    lines.push(boxLine(chalk.bold.white(`Predicted Files (${preds.length}):`)));
    for (const pred of preds.slice(0, 10)) {
      const pct = Math.round(pred.score * 100);
      lines.push(boxLine(`  ${chalk.yellow(`${pct}%`)} ${pred.filePath}`));
    }
    if (preds.length > 10) {
      lines.push(boxLine(chalk.dim(`  ... and ${preds.length - 10} more`)));
    }
    lines.push(horizontalLine(BOX_TEE_LEFT, BOX_TEE_RIGHT));
  }

  // Section 4: Conventions
  if (ctx.compression) {
    const conventions = ctx.compression.sections.find(s => s.type === 'conventions');
    if (conventions && conventions.content.trim()) {
      lines.push(boxLine(chalk.bold.white('Conventions:')));
      const convLines = conventions.content.trim().split('\n').slice(0, 5);
      for (const line of convLines) {
        lines.push(boxLine(chalk.dim(`  ${line.trim()}`)));
      }
      lines.push(horizontalLine(BOX_TEE_LEFT, BOX_TEE_RIGHT));
    }
  }

  // Section 5: Domain Context
  if (ctx.compression) {
    const domain = ctx.compression.sections.find(s => s.type === 'domainContext');
    if (domain && domain.content.trim()) {
      lines.push(boxLine(chalk.bold.white('Domain Context:')));
      const domainLines = domain.content.trim().split('\n').slice(0, 5);
      for (const line of domainLines) {
        lines.push(boxLine(chalk.dim(`  ${line.trim()}`)));
      }
      lines.push(horizontalLine(BOX_TEE_LEFT, BOX_TEE_RIGHT));
    }
  }

  // Prediction summary
  if (ctx.prediction && ctx.prediction.predictions.length > 0) {
    const topConf = Math.round(ctx.prediction.predictions[0].score * 100);
    lines.push(boxLine(chalk.dim(`${ctx.prediction.predictions.length} files predicted (top confidence: ${topConf}%)`)));
    lines.push(horizontalLine(BOX_TEE_LEFT, BOX_TEE_RIGHT));
  }

  // Action prompt
  if (isDryRun) {
    lines.push(boxLine(chalk.dim('(dry-run mode — display only)')));
  } else {
    lines.push(boxLine(`${chalk.green('[Enter]')} Send  ${chalk.dim('|')}  ${chalk.yellow('[e]')} Edit  ${chalk.dim('|')}  ${chalk.red('[c]')} Cancel`));
  }
  lines.push(horizontalLine(BOX_BOTTOM_LEFT, BOX_BOTTOM_RIGHT));

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
 * Read a single keypress from stdin in raw mode.
 * Returns the ReviewAction corresponding to the key pressed.
 */
export async function readKeypress(): Promise<ReviewAction> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;

    if (stdin.isTTY) {
      stdin.setRawMode(true);
    }
    stdin.resume();

    const onData = (data: Buffer): void => {
      const key = data.toString();
      stdin.removeListener('data', onData);

      if (stdin.isTTY) {
        stdin.setRawMode(wasRaw ?? false);
      }
      stdin.pause();

      // Ctrl+C
      if (key === '\x03') {
        resolve(ReviewAction.Cancel);
        return;
      }
      // Enter
      if (key === '\r' || key === '\n') {
        resolve(ReviewAction.Send);
        return;
      }
      // e/E for edit
      if (key === 'e' || key === 'E') {
        resolve(ReviewAction.Edit);
        return;
      }
      // c/C for cancel
      if (key === 'c' || key === 'C') {
        resolve(ReviewAction.Cancel);
        return;
      }
      // Unrecognized key — treat as send (Enter-like) for safety
      resolve(ReviewAction.Send);
    };

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
 * Open the prompt in the user's $EDITOR for editing.
 * Returns the edited content.
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
    return edited;
  } finally {
    try {
      unlinkSync(tempFile);
    } catch {
      // Temp file cleanup is best-effort
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

  // Read user action
  const action = await readKeypress();

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
      let editedPrompt: string;
      try {
        editedPrompt = await editInEditor(optimizedPrompt);
      } catch {
        logger.warn(MODULE, 'Editor failed, falling back to inline edit');
        editedPrompt = await editInline(optimizedPrompt);
      }

      return {
        action: ReviewAction.Edit,
        finalPrompt: editedPrompt,
        wasEdited: editedPrompt !== optimizedPrompt,
      };
    }

    case ReviewAction.Cancel: {
      process.stdout.write(chalk.red('\nTask cancelled.\n'));
      return {
        action: ReviewAction.Cancel,
        finalPrompt: '',
        wasEdited: false,
      };
    }
  }
}
