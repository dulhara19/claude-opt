/**
 * Prompt Compressor — core compression and context injection logic.
 * Pipeline stage 4: receives PipelineContext with classification, prediction, routing.
 * Produces an optimized prompt with filler removed and relevant context injected.
 */

import type { PipelineContext } from '../types/index.js';
import type { CompressionResult, CompressionStats, PromptSection, PromptTemplate } from './types.js';
import type { FilePrediction } from '../predictor/types.js';
import type { Patterns, ProjectMap, Convention } from '../types/index.js';
import { readPatterns, readProjectMap } from '../store/index.js';
import { logger } from '../utils/index.js';

const MODULE = 'compressor';

// ─── Filler Words & Redundant Patterns ─────────────────────────

/** Common filler words and phrases to strip from prompts. */
export const FILLER_WORDS: string[] = [
  'please',
  'basically',
  'just',
  'actually',
  'I think',
  'maybe',
  'really',
  'very',
  'sort of',
  'kind of',
  'you know',
  'like',
  'honestly',
  'literally',
];

/** Regex-based phrases to strip (case-insensitive). */
export const REDUNDANT_PATTERNS: RegExp[] = [
  /\bcan you\b/gi,
  /\bcould you\b/gi,
  /\bwould you mind\b/gi,
  /\bI want you to\b/gi,
  /\bI need you to\b/gi,
  /\bI'd like you to\b/gi,
  /\bgo ahead and\b/gi,
  /\bif you could\b/gi,
  /\bif you don't mind\b/gi,
  /\bdo me a favor and\b/gi,
];

// ─── Prompt Template ───────────────────────────────────────────

/** Structured template defining section order and headers. */
export const PROMPT_TEMPLATE: PromptTemplate = {
  sectionOrder: ['userRequest', 'fileContext', 'conventions', 'domainContext'],
  sectionHeaders: {
    userRequest: '## Task',
    fileContext: '## Relevant Files',
    conventions: '## Project Conventions',
    domainContext: '## Domain Context',
  },
};

/** Default compression result: returns the original prompt unchanged. */
export const DEFAULT_COMPRESSION: CompressionResult = {
  optimizedPrompt: '',
  originalLength: 0,
  compressedLength: 0,
  sections: [],
  stats: {
    fillerWordsRemoved: 0,
    filesInjected: 0,
    patternsInjected: 0,
    compressionRatio: 1,
  },
  durationMs: 0,
};

// ─── Filler Removal ────────────────────────────────────────────

/**
 * Remove filler words and redundant phrases while preserving semantic meaning.
 * Protects technical terms, file names, and code references.
 */
export function removeFiller(prompt: string): { cleaned: string; removedCount: number } {
  let cleaned = prompt;
  let removedCount = 0;

  // Apply redundant regex patterns first (longer phrases)
  for (const pattern of REDUNDANT_PATTERNS) {
    const before = cleaned;
    cleaned = cleaned.replace(pattern, '');
    if (cleaned !== before) removedCount++;
  }

  // Apply single filler words (word-boundary aware, case-insensitive)
  // Protect content inside backticks, quotes, and file paths
  for (const filler of FILLER_WORDS) {
    const escaped = filler.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Match filler word at word boundaries, but not inside backtick code spans or file paths
    const regex = new RegExp(`(?<!\`[^\`]*)\\b${escaped}\\b(?![^\`]*\`)`, 'gi');
    const before = cleaned;
    cleaned = cleaned.replace(regex, '');
    if (cleaned !== before) removedCount++;
  }

  // Clean up extra whitespace resulting from removals
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();

  return { cleaned, removedCount };
}

// ─── File Context Injection ────────────────────────────────────

/** Maximum number of predicted files to inject into prompt context. */
const MAX_INJECTED_FILES = 10;

/**
 * Build file context sections from predicted files, sorted by confidence.
 */
export function buildFileContext(predictions: FilePrediction[]): PromptSection | null {
  if (predictions.length === 0) return null;

  // Already sorted by score from predictor, but ensure order
  const sorted = [...predictions].sort((a, b) => b.score - a.score);
  const topFiles = sorted.slice(0, MAX_INJECTED_FILES);

  const lines = topFiles.map(
    (p) => `- ${p.filePath} (confidence: ${p.score.toFixed(2)})`,
  );

  return {
    type: 'fileContext',
    content: lines.join('\n'),
    source: 'file-predictor',
  };
}

// ─── Pattern & Convention Injection ────────────────────────────

/**
 * Filter and format relevant conventions from the patterns store.
 */
export function buildConventionContext(
  patterns: Patterns,
  taskDomain: string | undefined,
  predictedFiles: string[],
): PromptSection | null {
  const conventions: Convention[] = patterns.conventions;
  if (conventions.length === 0) return null;

  // Filter conventions relevant to predicted files or the task domain
  const relevant = conventions.filter((conv) => {
    // Include if pattern matches any predicted file path
    const matchesFile = predictedFiles.some((fp) =>
      fp.toLowerCase().includes(conv.pattern.toLowerCase()),
    );
    // Include if pattern matches domain
    const matchesDomain = taskDomain
      ? conv.description.toLowerCase().includes(taskDomain.toLowerCase())
      : false;
    // If no filters match, include general conventions
    return matchesFile || matchesDomain || isGeneralConvention(conv);
  });

  if (relevant.length === 0) return null;

  const lines = relevant.map((conv) => `- ${conv.description}`);

  return {
    type: 'conventions',
    content: lines.join('\n'),
    source: 'patterns-store',
  };
}

/** Check if a convention is general (not domain/file-specific). */
function isGeneralConvention(conv: Convention): boolean {
  // Conventions with broad patterns or naming rules are general
  const generalPatterns = ['.ts', '.js', '.test.', 'Case', 'naming', 'style', 'format'];
  return generalPatterns.some(
    (gp) =>
      conv.pattern.toLowerCase().includes(gp.toLowerCase()) ||
      conv.description.toLowerCase().includes(gp.toLowerCase()),
  );
}

// ─── Domain-Specific Context Injection ─────────────────────────

/**
 * Extract domain-specific context from the project map based on task classification.
 */
export function buildDomainContext(
  projectMap: ProjectMap,
  taskDomain: string | undefined,
): PromptSection | null {
  if (!taskDomain) return null;

  const domainFiles = projectMap.domains[taskDomain];
  if (!domainFiles || domainFiles.length === 0) return null;

  // Extract domain-specific notes from file entries
  const domainNotes: string[] = [];
  for (const filePath of domainFiles.slice(0, 5)) {
    const entry = projectMap.files[filePath];
    if (entry && entry.domain) {
      domainNotes.push(`- ${filePath}: domain=${entry.domain}`);
    }
  }

  if (domainNotes.length === 0) return null;

  return {
    type: 'domainContext',
    content: domainNotes.join('\n'),
    source: 'project-map',
  };
}

// ─── Structured Prompt Assembly ────────────────────────────────

/**
 * Assemble all sections into a structured prompt with clear delimiters.
 */
export function assemblePrompt(sections: PromptSection[]): string {
  const parts: string[] = [];

  for (const type of PROMPT_TEMPLATE.sectionOrder) {
    const section = sections.find((s) => s.type === type);
    if (section && section.content.trim()) {
      const header = PROMPT_TEMPLATE.sectionHeaders[type];
      parts.push(`${header}\n${section.content}`);
    }
  }

  return parts.join('\n\n');
}

// ─── Main Compression Function ─────────────────────────────────

/**
 * Compress and optimize a prompt with context injection.
 * Reads from PipelineContext (classification, prediction) and store (patterns, project map).
 *
 * @param ctx - PipelineContext with classification and prediction results
 * @returns CompressionResult with optimized prompt, sections, and stats
 */
export function compressPrompt(ctx: PipelineContext): CompressionResult {
  const start = performance.now();
  const originalLength = ctx.taskText.length;

  // 1. Remove filler words from user prompt
  const { cleaned: compressedRequest, removedCount } = removeFiller(ctx.taskText);

  const sections: PromptSection[] = [];

  // User request section (always present)
  sections.push({
    type: 'userRequest',
    content: compressedRequest,
    source: 'user-input',
  });

  let filesInjected = 0;
  let patternsInjected = 0;

  // 2. File context injection from prediction results
  if (ctx.prediction && ctx.prediction.predictions.length > 0) {
    const fileSection = buildFileContext(ctx.prediction.predictions);
    if (fileSection) {
      sections.push(fileSection);
      filesInjected = Math.min(ctx.prediction.predictions.length, MAX_INJECTED_FILES);
    }
  }

  // 3. Pattern and convention injection from store
  const patternsResult = readPatterns(ctx.workingDir);
  if (patternsResult.ok) {
    const predictedFiles = ctx.prediction
      ? ctx.prediction.predictions.map((p) => p.filePath)
      : [];
    const taskDomain = ctx.classification?.domain;
    const convSection = buildConventionContext(patternsResult.value, taskDomain, predictedFiles);
    if (convSection) {
      sections.push(convSection);
      patternsInjected = patternsResult.value.conventions.length;
    }
  }

  // 4. Domain-specific context injection
  const projectMapResult = readProjectMap(ctx.workingDir);
  if (projectMapResult.ok) {
    const taskDomain = ctx.classification?.domain;
    const domainSection = buildDomainContext(projectMapResult.value, taskDomain);
    if (domainSection) {
      sections.push(domainSection);
    }
  }

  // 5. Assemble the optimized prompt
  const optimizedPrompt = assemblePrompt(sections);
  const compressedLength = optimizedPrompt.length;

  const durationMs = performance.now() - start;

  // Log warning if exceeding performance budget
  if (durationMs > 100) {
    logger.warn(MODULE, `Compression exceeded 100ms budget: ${durationMs.toFixed(0)}ms`);
  }

  const stats: CompressionStats = {
    fillerWordsRemoved: removedCount,
    filesInjected,
    patternsInjected,
    compressionRatio: originalLength > 0 ? compressedLength / originalLength : 1,
  };

  return {
    optimizedPrompt,
    originalLength,
    compressedLength,
    sections,
    stats,
    durationMs,
  };
}
