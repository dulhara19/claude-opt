import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { PipelineContext, Result } from '../types/index.js';
import { ok, err, logger } from '../utils/index.js';
import type { AdapterResult, SpawnOptions, ClaudeCodeInfo } from './types.js';
import { FALLBACK_EXIT_CODE, CLAUDE_MD_BACKUP } from './types.js';
import { captureTimestamps, detectFilesUsed } from './file-detector.js';

const MODULE = 'adapter';

/** Cached CLI detection result */
let cachedClaudeCode: Result<ClaudeCodeInfo> | null = null;

/**
 * Detect Claude Code CLI availability and version.
 * Caches the result for the session.
 */
export function detectClaudeCode(): Result<ClaudeCodeInfo> {
  if (cachedClaudeCode) return cachedClaudeCode;

  try {
    const output = execSync('claude --version', { encoding: 'utf-8', timeout: 5000 }).trim();
    const version = output.replace(/^[^\d]*/, '').trim() || output;

    // Find the actual path
    let claudePath = 'claude';
    try {
      const whichCmd = process.platform === 'win32' ? 'where claude' : 'which claude';
      claudePath = execSync(whichCmd, { encoding: 'utf-8', timeout: 3000 }).trim().split('\n')[0];
    } catch {
      // Use default 'claude' if we can't find the path
    }

    cachedClaudeCode = ok({ version, path: claudePath, isAvailable: true });
  } catch {
    cachedClaudeCode = err(
      'Claude Code CLI not found. Install it with: npm install -g @anthropic-ai/claude-code',
    );
  }

  return cachedClaudeCode;
}

/**
 * Reset cached CLI detection (for testing).
 */
export function resetClaudeCodeCache(): void {
  cachedClaudeCode = null;
}

/**
 * Generate an optimized CLAUDE.md content from pipeline context.
 */
export function generateClaudeMd(ctx: PipelineContext): string {
  const lines: string[] = ['# Claude Optimizer Context', ''];

  // Focus Files from prediction
  if (ctx.prediction && ctx.prediction.predictions.length > 0) {
    lines.push('## Focus Files');
    lines.push('The following files are predicted to be relevant to this task:');
    for (const pred of ctx.prediction.predictions) {
      const confidence = pred.score >= 0.8 ? 'high' : pred.score >= 0.5 ? 'medium' : 'low';
      lines.push(`- ${pred.filePath} (${confidence} confidence)`);
    }
    lines.push('');
  }

  // Domain Context from classification
  if (ctx.classification) {
    lines.push('## Task Context');
    lines.push(`- Task type: ${ctx.classification.type}`);
    lines.push(`- Domain: ${ctx.classification.domain}`);
    lines.push(`- Complexity: ${ctx.classification.complexity}`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Backup existing CLAUDE.md and write optimized version.
 * Returns true if a backup was created.
 */
export function writeClaudeMd(projectRoot: string, content: string): boolean {
  const claudeMdPath = path.join(projectRoot, 'CLAUDE.md');
  const backupPath = path.join(projectRoot, CLAUDE_MD_BACKUP);
  let hasBackup = false;

  // Backup existing CLAUDE.md
  if (fs.existsSync(claudeMdPath)) {
    // Handle edge case: backup already exists from interrupted run
    if (fs.existsSync(backupPath)) {
      fs.unlinkSync(backupPath);
    }
    fs.renameSync(claudeMdPath, backupPath);
    hasBackup = true;
  }

  fs.writeFileSync(claudeMdPath, content, 'utf-8');
  return hasBackup;
}

/**
 * Restore original CLAUDE.md from backup.
 */
export function restoreClaudeMd(projectRoot: string): void {
  const claudeMdPath = path.join(projectRoot, 'CLAUDE.md');
  const backupPath = path.join(projectRoot, CLAUDE_MD_BACKUP);

  // Remove the optimized CLAUDE.md
  if (fs.existsSync(claudeMdPath)) {
    fs.unlinkSync(claudeMdPath);
  }

  // Restore backup if it exists
  if (fs.existsSync(backupPath)) {
    fs.renameSync(backupPath, claudeMdPath);
  }
}

/**
 * Estimate tokens consumed from output text.
 * Uses ~4 characters per token heuristic.
 */
export function estimateTokens(promptLength: number, outputLength: number): number {
  return Math.ceil((promptLength + outputLength) / 4);
}

/**
 * Spawn Claude Code as a subprocess and capture output.
 */
export function spawnClaudeCode(options: SpawnOptions): Promise<AdapterResult> {
  const startTime = performance.now();
  const args = ['-p', options.prompt];

  if (options.model) {
    args.push('--model', options.model);
  }

  return new Promise<AdapterResult>((resolve, reject) => {
    const child = spawn('claude', args, {
      cwd: options.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (options.timeout) {
      timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
      }, options.timeout);
    }

    child.on('error', (error) => {
      if (timer) clearTimeout(timer);
      reject(error);
    });

    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      const durationMs = performance.now() - startTime;

      if (timedOut) {
        reject(new Error(`Claude Code subprocess timed out after ${options.timeout}ms`));
        return;
      }

      if (stderr && code !== 0) {
        logger.warn(MODULE, `Claude Code stderr: ${stderr.slice(0, 200)}`);
      }

      resolve({
        output: stdout,
        filesUsed: [], // Populated later by file detection
        exitCode: code ?? 1,
        tokenEstimate: estimateTokens(options.prompt.length, stdout.length),
        isFallback: false,
        durationMs,
      });
    });
  });
}

/**
 * Execute a task through Claude Code with full optimization (CLAUDE.md injection, file detection).
 * This is the main adapter entry point called by the pipeline.
 */
export async function executeTask(ctx: PipelineContext): Promise<AdapterResult> {
  const projectRoot = ctx.workingDir;

  // Step 1: Detect Claude Code CLI
  const cliResult = detectClaudeCode();
  if (!cliResult.ok) {
    throw new Error(cliResult.error);
  }

  // Step 2: Capture file timestamps before execution
  const beforeTimestamps = captureTimestamps(projectRoot);

  // Step 3: Generate and write optimized CLAUDE.md
  const claudeMdContent = generateClaudeMd(ctx);
  writeClaudeMd(projectRoot, claudeMdContent);

  try {
    // Step 4: Get the final prompt (from compression/review)
    const prompt = ctx.compression?.optimizedPrompt ?? ctx.taskText;
    const model = ctx.routing?.model;

    // Step 5: Spawn Claude Code subprocess
    const result = await spawnClaudeCode({
      prompt,
      cwd: projectRoot,
      model,
    });

    // Step 6: Restore original CLAUDE.md
    restoreClaudeMd(projectRoot);

    // Step 7: Detect files used (timestamps + stdout parsing)
    const filesUsed = detectFilesUsed(beforeTimestamps, result.output, projectRoot);

    // Step 8: Return complete AdapterResult
    return {
      ...result,
      filesUsed,
    };
  } catch (error) {
    // Always restore CLAUDE.md, even on failure
    restoreClaudeMd(projectRoot);
    throw error;
  }
}

/**
 * Execute raw Claude Code without optimization (fallback mode).
 * No CLAUDE.md injection, no model override.
 */
export async function executeRaw(prompt: string, projectRoot: string): Promise<AdapterResult> {
  const startTime = performance.now();
  const beforeTimestamps = captureTimestamps(projectRoot);

  const result = await spawnClaudeCode({
    prompt,
    cwd: projectRoot,
  });

  const filesUsed = detectFilesUsed(beforeTimestamps, result.output, projectRoot);
  const durationMs = performance.now() - startTime;

  return {
    ...result,
    filesUsed,
    isFallback: true,
    exitCode: FALLBACK_EXIT_CODE,
    durationMs,
  };
}

/**
 * Execute task with fail-open behavior.
 * If optimized execution fails, falls back to raw execution.
 * If raw also fails, returns an error AdapterResult (never throws).
 */
export async function executeTaskFailOpen(ctx: PipelineContext): Promise<AdapterResult> {
  try {
    return await executeTask(ctx);
  } catch (error) {
    logger.error(MODULE, 'Optimized execution failed, falling back to raw', error);
    try {
      return await executeRaw(ctx.taskText, ctx.workingDir);
    } catch (rawError) {
      logger.error(MODULE, 'Raw execution also failed', rawError);
      return {
        output: '',
        filesUsed: [],
        exitCode: FALLBACK_EXIT_CODE,
        tokenEstimate: 0,
        isFallback: true,
        durationMs: 0,
      };
    }
  }
}
