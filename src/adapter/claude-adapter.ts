import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { PipelineContext, Result } from '../types/index.js';
import { ok, err, logger } from '../utils/index.js';
import type { AdapterResult, SpawnOptions, ClaudeCodeInfo } from './types.js';
import {
  FALLBACK_EXIT_CODE,
  CLAUDE_MD_BACKUP,
  MODEL_ID_MAP,
  DEFAULT_SUBPROCESS_TIMEOUT,
  MAX_OUTPUT_SIZE,
} from './types.js';
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

/** AD1: Max total length for CLAUDE.md content to avoid bloating. */
const MAX_CLAUDEMD_LENGTH = 4000;

/**
 * AD1: Generate an optimized CLAUDE.md content from pipeline context.
 * Includes focus files with signal reasons, conventions, and domain context.
 */
export function generateClaudeMd(ctx: PipelineContext): string {
  const lines: string[] = ['# Claude Optimizer Context', ''];

  // Focus Files from prediction — AD1: include signal reasons for high-confidence
  if (ctx.prediction && ctx.prediction.predictions.length > 0) {
    lines.push('## Focus Files');
    lines.push('The following files are predicted to be relevant to this task:');
    for (const pred of ctx.prediction.predictions) {
      const confidence = pred.score >= 0.8 ? 'high' : pred.score >= 0.5 ? 'medium' : 'low';
      let line = `- ${pred.filePath} (${confidence} confidence)`;
      // AD1: Add top signal reasons for high-confidence files
      if (pred.score >= 0.8 && pred.signals && pred.signals.length > 0) {
        const reasons = pred.signals.slice(0, 2).map(s => s.source ?? s.signal ?? String(s)).join(', ');
        if (reasons) {
          line += ` — ${reasons}`;
        }
      }
      lines.push(line);
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

  // AD1: Conventions from compression sections
  if (ctx.compression?.sections) {
    const conventions = ctx.compression.sections.find(s => s.type === 'conventions');
    if (conventions && conventions.content.trim()) {
      lines.push('## Conventions');
      const convLines = conventions.content.trim().split('\n').slice(0, 10);
      lines.push(...convLines);
      lines.push('');
    }
  }

  // AD1: Domain context from compression sections
  if (ctx.compression?.sections) {
    const domainCtx = ctx.compression.sections.find(s => s.type === 'domainContext');
    if (domainCtx && domainCtx.content.trim()) {
      lines.push('## Domain Context');
      const domainLines = domainCtx.content.trim().split('\n').slice(0, 10);
      lines.push(...domainLines);
      lines.push('');
    }
  }

  let content = lines.join('\n');

  // AD1: Cap total length to avoid bloating
  if (content.length > MAX_CLAUDEMD_LENGTH) {
    content = content.slice(0, MAX_CLAUDEMD_LENGTH) + '\n\n<!-- truncated -->\n';
  }

  return content;
}

/**
 * AD2: Resolve model tier name to full Claude model ID.
 * Falls back to tier name if no mapping exists (forward-compatible).
 */
export function resolveModelId(tierOrId: string, config?: { modelIds?: Record<string, string> }): string {
  // Check user config first
  if (config?.modelIds?.[tierOrId]) {
    return config.modelIds[tierOrId];
  }
  // Fall back to built-in map
  return MODEL_ID_MAP[tierOrId] ?? tierOrId;
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
 * AD5: Recover from a previous interrupted run.
 * If a stale backup exists, restore it before proceeding.
 */
function recoverStaleBackup(projectRoot: string): void {
  const backupPath = path.join(projectRoot, CLAUDE_MD_BACKUP);
  if (fs.existsSync(backupPath)) {
    logger.warn(MODULE, 'Detected stale CLAUDE.md backup from interrupted run — restoring');
    restoreClaudeMd(projectRoot);
  }
}

/** Per-content-type token multipliers (chars per token). */
const TOKEN_MULTIPLIERS: Record<string, number> = {
  code: 3.5,
  markdown: 4.5,
  config: 3.0,
  default: 4.0,
};

/** Fixed overhead tokens for injection context (CLAUDE.md, system prompt). */
const INJECTION_OVERHEAD_TOKENS = 150;

/**
 * Detect content type heuristically from text.
 */
function detectContentType(text: string): 'code' | 'markdown' | 'config' | 'default' {
  const sample = text.slice(0, 500);
  if (/^[{[\s]*"/.test(sample) || /^\w+\s*[:=]/.test(sample)) return 'config';
  if (/^#{1,6}\s|^\*\*|^\-\s/.test(sample)) return 'markdown';
  if (/(?:function|class|import|export|const|let|var|def|if|for|while)\s/.test(sample)) return 'code';
  return 'default';
}

/**
 * AD7: Estimate tokens consumed from prompt and output text.
 * Uses content-type-aware multipliers for better accuracy.
 * Optionally includes injected content (CLAUDE.md) in the estimate.
 */
export function estimateTokens(
  promptLength: number,
  outputLength: number,
  promptText?: string,
  outputText?: string,
  injectedContentLength = 0,
): number {
  const promptType = promptText ? detectContentType(promptText) : 'default';
  const outputType = outputText ? detectContentType(outputText) : 'code';

  const promptTokens = Math.ceil(promptLength / TOKEN_MULTIPLIERS[promptType]);
  const outputTokens = Math.ceil(outputLength / TOKEN_MULTIPLIERS[outputType]);
  const injectedTokens = Math.ceil(injectedContentLength / TOKEN_MULTIPLIERS.markdown);

  return promptTokens + outputTokens + injectedTokens + INJECTION_OVERHEAD_TOKENS;
}

/**
 * AD13: Categorize an error into a reason string.
 */
function categorizeError(error: unknown): AdapterResult['errorReason'] {
  if (!(error instanceof Error)) return 'unknown';
  const msg = error.message.toLowerCase();
  if (msg.includes('timed out') || msg.includes('timeout')) return 'timeout';
  if (msg.includes('not found') || msg.includes('cli not found')) return 'cli_not_found';
  if (msg.includes('rate limit') || msg.includes('429')) return 'rate_limit';
  if (msg.includes('spawn') || msg.includes('exited with code') || msg.includes('subprocess')) return 'subprocess_error';
  return 'unknown';
}

/**
 * AD3+AD4: Spawn Claude Code as a subprocess and capture output.
 * Applies default timeout and output size cap.
 */
export function spawnClaudeCode(options: SpawnOptions): Promise<AdapterResult> {
  const startTime = performance.now();
  const args = ['-p', options.prompt];

  // AD2: Resolve model tier to full model ID
  if (options.model) {
    const resolvedModel = resolveModelId(options.model);
    args.push('--model', resolvedModel);
  }

  // AD3: Apply default timeout if none specified
  const timeout = options.timeout ?? DEFAULT_SUBPROCESS_TIMEOUT;

  return new Promise<AdapterResult>((resolve, reject) => {
    const child = spawn('claude', args, {
      cwd: options.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
    });

    let stdout = '';
    let stderr = '';
    let truncated = false;

    child.stdout.on('data', (data: Buffer) => {
      // AD4: Cap output size
      if (truncated) return;
      const chunk = data.toString();
      if (stdout.length + chunk.length > MAX_OUTPUT_SIZE) {
        stdout += chunk.slice(0, MAX_OUTPUT_SIZE - stdout.length);
        truncated = true;
        logger.warn(MODULE, `Output size exceeded ${MAX_OUTPUT_SIZE} bytes — truncating`);
      } else {
        stdout += chunk;
      }
    });

    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeout);

    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      const durationMs = performance.now() - startTime;

      if (timedOut) {
        reject(new Error(`Claude Code subprocess timed out after ${timeout}ms`));
        return;
      }

      if (stderr && code !== 0) {
        logger.warn(MODULE, `Claude Code stderr: ${stderr.slice(0, 200)}`);
      }

      resolve({
        output: stdout,
        filesUsed: [], // Populated later by file detection
        exitCode: code ?? 1,
        tokenEstimate: estimateTokens(options.prompt.length, stdout.length, options.prompt, stdout),
        isFallback: false,
        durationMs,
        truncated: truncated || undefined,
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

  // AD5: Recover from any previous interrupted run
  recoverStaleBackup(projectRoot);

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

    // AD7: Re-estimate tokens including CLAUDE.md content
    const tokenEstimate = estimateTokens(
      prompt.length,
      result.output.length,
      prompt,
      result.output,
      claudeMdContent.length,
    );

    // Step 8: Return complete AdapterResult
    return {
      ...result,
      filesUsed,
      tokenEstimate,
    };
  } catch (error) {
    // Always restore CLAUDE.md, even on failure
    restoreClaudeMd(projectRoot);
    throw error;
  }
}

/**
 * AD8: Execute raw Claude Code without optimization (fallback mode).
 * No CLAUDE.md injection, no model override. Preserves real exit code.
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
    // AD8: Keep real exit code from subprocess (don't override with FALLBACK_EXIT_CODE)
    durationMs,
  };
}

/** AD6: Delay in ms before retrying a transient failure. */
const RETRY_DELAY_MS = 2000;

/** AD6: Patterns indicating a transient/retriable error. */
const RETRIABLE_PATTERNS = [
  'timed out', 'timeout', 'rate limit', '429', '500', '503',
  'econnreset', 'econnrefused', 'epipe', 'network',
];

/**
 * AD6: Check if an error is retriable (transient).
 */
function isRetriableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return RETRIABLE_PATTERNS.some(p => msg.includes(p));
}

/**
 * AD6+AD13: Execute task with fail-open behavior.
 * If optimized execution fails with a transient error, retries once after delay.
 * Then falls back to raw execution.
 * If raw also fails, returns an error AdapterResult with errorReason (never throws).
 */
export async function executeTaskFailOpen(ctx: PipelineContext): Promise<AdapterResult> {
  try {
    return await executeTask(ctx);
  } catch (error) {
    const errorReason = categorizeError(error);

    // AD6: Retry once on transient failures
    if (isRetriableError(error)) {
      logger.warn(MODULE, `Transient error (${errorReason}), retrying in ${RETRY_DELAY_MS}ms...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      try {
        return await executeTask(ctx);
      } catch (retryError) {
        logger.error(MODULE, 'Retry also failed, falling back to raw', retryError);
      }
    } else {
      logger.error(MODULE, 'Optimized execution failed, falling back to raw', error);
    }

    try {
      const rawResult = await executeRaw(ctx.taskText, ctx.workingDir);
      return { ...rawResult, errorReason };
    } catch (rawError) {
      logger.error(MODULE, 'Raw execution also failed', rawError);
      return {
        output: '',
        filesUsed: [],
        exitCode: FALLBACK_EXIT_CODE,
        tokenEstimate: 0,
        isFallback: true,
        durationMs: 0,
        errorReason: categorizeError(rawError),
      };
    }
  }
}
