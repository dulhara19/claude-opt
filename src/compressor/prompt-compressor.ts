/**
 * Prompt Compressor — core compression and context injection logic.
 * Pipeline stage 4: receives PipelineContext with classification, prediction, routing.
 * Produces an optimized prompt with filler removed and relevant context injected.
 *
 * Improvements:
 * - F1: Accurate filler removal count (counts actual instances, not patterns)
 * - F4: Expanded filler/pattern lists
 * - CC2: Convention relevance ranking + MAX_CONVENTIONS cap
 * - CC3: Smarter isGeneralConvention (uses confidence/evidenceCount)
 * - CC4: Fix patternsInjected count (actual filtered count)
 * - DC1: Rich domain context output (language, exports, keywords)
 * - DC3: Deduplicate domain files already in file context
 * - A2: Cross-section file deduplication
 * - A3: Task-type-aware section ordering
 */

import type { PipelineContext } from '../types/index.js';
import type { CompressionResult, CompressionStats, PromptSection, PromptTemplate } from './types.js';
import type { FilePrediction } from '../predictor/types.js';
import type { Patterns, ProjectMap, Convention } from '../types/index.js';
import { TaskType } from '../types/index.js';
import { logger } from '../utils/index.js';

const MODULE = 'compressor';

// ─── Filler Words & Redundant Patterns ─────────────────────────

/**
 * F4: Expanded filler words and phrases to strip from prompts.
 * Includes common developer prompt fillers beyond the original 14.
 */
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
  // F4: Additional fillers
  'um',
  'well',
  'so',
  'right',
  'okay',
  'sure',
  'obviously',
  'clearly',
  'simply',
  'essentially',
  'pretty much',
  'I guess',
  'I suppose',
  'I believe',
  'I feel like',
  'in my opinion',
];

/**
 * F4: Expanded regex-based phrases to strip (case-insensitive).
 */
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
  // F4: Additional redundant phrases
  /\bwhat I mean is\b/gi,
  /\bthe thing is\b/gi,
  /\bas you can see\b/gi,
  /\bfor me\b/gi,
  /\bif possible\b/gi,
  /\bwhen you get a chance\b/gi,
  /\bit would be great if\b/gi,
];

// ─── Prompt Template ───────────────────────────────────────────

/** Default section headers for assembled prompt. */
export const SECTION_HEADERS: Record<PromptSection['type'], string> = {
  userRequest: '## Task',
  fileContext: '## Relevant Files',
  conventions: '## Project Conventions',
  domainContext: '## Domain Context',
};

/** Default section order (used for most task types). */
const DEFAULT_SECTION_ORDER: PromptSection['type'][] = ['userRequest', 'fileContext', 'conventions', 'domainContext'];

/**
 * A3: Task-type-aware section ordering.
 * Convention-heavy tasks (Config, Docs, Documentation) put conventions before files.
 * Research/Learning tasks put domain context earlier for orientation.
 */
const TASK_TYPE_SECTION_ORDER: Partial<Record<string, PromptSection['type'][]>> = {
  [TaskType.Config]: ['userRequest', 'conventions', 'fileContext', 'domainContext'],
  [TaskType.Docs]: ['userRequest', 'conventions', 'fileContext', 'domainContext'],
  [TaskType.Documentation]: ['userRequest', 'conventions', 'fileContext', 'domainContext'],
  [TaskType.Research]: ['userRequest', 'domainContext', 'fileContext', 'conventions'],
  [TaskType.Learning]: ['userRequest', 'domainContext', 'fileContext', 'conventions'],
  [TaskType.Exploration]: ['userRequest', 'domainContext', 'fileContext', 'conventions'],
};

/** Get section order for a task type. Falls back to default order. */
function getSectionOrder(taskType?: string): PromptSection['type'][] {
  if (taskType && TASK_TYPE_SECTION_ORDER[taskType]) {
    return TASK_TYPE_SECTION_ORDER[taskType]!;
  }
  return DEFAULT_SECTION_ORDER;
}

/** Structured template defining section order and headers. */
export const PROMPT_TEMPLATE: PromptTemplate = {
  sectionOrder: DEFAULT_SECTION_ORDER,
  sectionHeaders: SECTION_HEADERS,
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
 * F2: Extract protected spans (backtick code, double-quoted, single-quoted strings).
 * Replaces them with placeholders, returns a restore function.
 */
function protectQuotedContent(text: string): { stripped: string; restore: (s: string) => string } {
  const placeholders: Array<{ placeholder: string; original: string }> = [];
  let idx = 0;

  // Match backtick spans, double-quoted strings, and single-quoted strings
  const stripped = text.replace(/`[^`]*`|"[^"]*"|'[^']*'/g, (match) => {
    const placeholder = `__PROTECTED_${idx++}__`;
    placeholders.push({ placeholder, original: match });
    return placeholder;
  });

  const restore = (s: string): string => {
    let result = s;
    for (const { placeholder, original } of placeholders) {
      result = result.replace(placeholder, original);
    }
    return result;
  };

  return { stripped, restore };
}

/**
 * F3: Context-aware filler words that need special handling.
 * "just" is only removed when used as a filler (before verbs), not when it means "only".
 */
const CONTEXT_AWARE_FILLERS: Record<string, RegExp> = {
  // F3: "just" before common action words = filler; "just failed" = semantic
  'just': /\bjust\s+(?:fix|add|update|create|remove|delete|change|modify|make|do|try|run|check|put|set|get|go|let|tell|show|write|move|give|take|open|close|start|stop|send|find|look|help|use|need|want)\b/gi,
};

/**
 * Remove filler words and redundant phrases while preserving semantic meaning.
 * Protects technical terms, file names, and code references.
 *
 * F1: Counts actual instances removed (not just pattern matches).
 * F2: Protects content inside backticks, double quotes, and single quotes.
 * F3: Context-aware "just" removal (only filler usage, not semantic "only").
 */
export function removeFiller(prompt: string): { cleaned: string; removedCount: number } {
  // F2: Protect quoted/backtick content before processing
  const { stripped, restore } = protectQuotedContent(prompt);
  let cleaned = stripped;
  let removedCount = 0;

  // Apply redundant regex patterns first (longer phrases)
  for (const pattern of REDUNDANT_PATTERNS) {
    // F1: Count actual instances via matchAll before replacing
    const matches = [...cleaned.matchAll(pattern)];
    if (matches.length > 0) {
      removedCount += matches.length;
      cleaned = cleaned.replace(pattern, '');
    }
  }

  // Apply single filler words (word-boundary aware, case-insensitive)
  for (const filler of FILLER_WORDS) {
    // F3: Use context-aware regex for special fillers like "just"
    if (CONTEXT_AWARE_FILLERS[filler.toLowerCase()]) {
      const contextRegex = CONTEXT_AWARE_FILLERS[filler.toLowerCase()];
      // Reset lastIndex for global regex
      contextRegex.lastIndex = 0;
      const matches = [...cleaned.matchAll(contextRegex)];
      if (matches.length > 0) {
        removedCount += matches.length;
        // Remove only "just" from "just fix" → "fix" (keep the verb)
        contextRegex.lastIndex = 0;
        cleaned = cleaned.replace(contextRegex, (match) => match.replace(/\bjust\s+/i, ''));
      }
      continue;
    }

    const escaped = filler.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
    // F1: Count actual instances
    const matches = [...cleaned.matchAll(regex)];
    if (matches.length > 0) {
      removedCount += matches.length;
      cleaned = cleaned.replace(regex, '');
    }
  }

  // Clean up extra whitespace resulting from removals
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();

  // F2: Restore protected content
  cleaned = restore(cleaned);

  return { cleaned, removedCount };
}

// ─── File Context Injection ────────────────────────────────────

/** Maximum injection token budget for file context (#8). */
const MAX_INJECTION_TOKENS = 2000;

/** FC3: Token estimation ratios by content type. */
const CHARS_PER_TOKEN_CODE = 3.2;
const CHARS_PER_TOKEN_PROSE = 4.5;
const CHARS_PER_TOKEN_MIXED = 3.8;

/** High-confidence threshold — files above this get a purpose summary. */
const HIGH_CONFIDENCE_THRESHOLD = 0.8;

/**
 * FC3: Smarter token estimation based on content type.
 * Code-heavy content (paths, braces, dots) uses lower ratio.
 * Plain prose uses higher ratio.
 */
function estimateLineTokens(text: string): number {
  // Count code-like characters
  const codeChars = (text.match(/[/\\.{}()\[\]:;=<>]/g) || []).length;
  const codeRatio = text.length > 0 ? codeChars / text.length : 0;

  let charsPerToken: number;
  if (codeRatio > 0.15) {
    charsPerToken = CHARS_PER_TOKEN_CODE;
  } else if (codeRatio < 0.05) {
    charsPerToken = CHARS_PER_TOKEN_PROSE;
  } else {
    charsPerToken = CHARS_PER_TOKEN_MIXED;
  }

  return Math.ceil(text.length / charsPerToken);
}

/**
 * FC2: Group file path by parent directory.
 */
function getParentDir(filePath: string): string {
  const lastSlash = filePath.lastIndexOf('/');
  return lastSlash > 0 ? filePath.substring(0, lastSlash) : '.';
}

/**
 * Build file context sections using token-budget-aware injection.
 * Fills budget by prediction score (highest first).
 *
 * FC1: High-confidence files include metadata (language, size) from projectMap.
 * FC2: Files are grouped by parent directory for structural clarity.
 *
 * @param predictions - Ranked file predictions
 * @param projectMap - Optional project map for file metadata (FC1)
 */
export function buildFileContext(
  predictions: FilePrediction[],
  projectMap?: ProjectMap,
): PromptSection | null {
  if (predictions.length === 0) return null;

  const sorted = [...predictions].sort((a, b) => b.score - a.score);

  // FC2: Group predictions by parent directory while maintaining score order
  const dirGroups = new Map<string, FilePrediction[]>();
  for (const p of sorted) {
    const dir = getParentDir(p.filePath);
    const group = dirGroups.get(dir) ?? [];
    group.push(p);
    dirGroups.set(dir, group);
  }

  const lines: string[] = [];
  let tokensUsed = 0;

  // FC2: If multiple directories, show grouped format; otherwise flat
  const useGrouping = dirGroups.size > 1 && sorted.length > 4;

  if (useGrouping) {
    // Sort directories by their best file's score
    const sortedDirs = [...dirGroups.entries()].sort(
      (a, b) => b[1][0].score - a[1][0].score,
    );

    for (const [dir, files] of sortedDirs) {
      const dirHeader = `**${dir}/** (${files.length} file${files.length > 1 ? 's' : ''})`;
      const headerTokens = estimateLineTokens(dirHeader);
      if (tokensUsed + headerTokens > MAX_INJECTION_TOKENS) break;

      lines.push(dirHeader);
      tokensUsed += headerTokens;

      for (const p of files) {
        const line = formatFileLine(p, projectMap, '  ');
        const lineTokens = estimateLineTokens(line);
        if (tokensUsed + lineTokens > MAX_INJECTION_TOKENS) break;
        lines.push(line);
        tokensUsed += lineTokens;
      }
    }
  } else {
    // Flat list for small result sets
    for (const p of sorted) {
      const line = formatFileLine(p, projectMap, '');
      const lineTokens = estimateLineTokens(line);
      if (tokensUsed + lineTokens > MAX_INJECTION_TOKENS) break;
      lines.push(line);
      tokensUsed += lineTokens;
    }
  }

  if (lines.length === 0) return null;

  return {
    type: 'fileContext',
    content: lines.join('\n'),
    source: 'file-predictor',
  };
}

/**
 * FC1: Format a single file prediction line with optional metadata.
 */
function formatFileLine(p: FilePrediction, projectMap?: ProjectMap, indent: string = ''): string {
  let line: string;

  if (p.score >= HIGH_CONFIDENCE_THRESHOLD && p.signals.length > 0) {
    const topReasons = p.signals
      .sort((a, b) => b.score * b.weight - a.score * a.weight)
      .slice(0, 2)
      .map((s) => s.reason)
      .join('; ');

    // FC1: Include file metadata for high-confidence files
    const meta = getFileMetadata(p.filePath, projectMap);
    const metaStr = meta ? ` [${meta}]` : '';
    line = `${indent}- ${p.filePath} (confidence: ${p.score.toFixed(2)})${metaStr} — ${topReasons}`;
  } else {
    line = `${indent}- ${p.filePath} (confidence: ${p.score.toFixed(2)})`;
  }

  return line;
}

/**
 * FC1: Extract compact metadata string for a file from the project map.
 * Returns e.g. "TypeScript, medium" or null if no map.
 */
function getFileMetadata(filePath: string, projectMap?: ProjectMap): string | null {
  if (!projectMap) return null;
  const entry = projectMap.files[filePath];
  if (!entry) return null;

  const parts: string[] = [];
  if (entry.language) parts.push(entry.language);
  if (entry.size) parts.push(formatSize(entry.size));
  return parts.length > 0 ? parts.join(', ') : null;
}

// ─── Pattern & Convention Injection ────────────────────────────

/** CC2: Maximum conventions to inject. */
const MAX_CONVENTIONS = 10;

/** CC2: Relevance scores for convention ranking. */
const RELEVANCE_FILE_MATCH = 3;
const RELEVANCE_DOMAIN_MATCH = 2;
const RELEVANCE_GENERAL = 1;

/**
 * CC1: Precise convention pattern matching.
 * Handles glob-like patterns (*.ts, *.test.ts) as extension matches.
 * Handles path prefixes (src/auth) as path containment.
 * Falls back to word-boundary matching for plain keywords.
 */
function matchConventionPattern(pattern: string, filePath: string): boolean {
  const lowerPattern = pattern.toLowerCase();
  const lowerPath = filePath.toLowerCase();

  // Extension pattern: *.ts, .test.ts, .spec.js
  if (lowerPattern.startsWith('*.') || lowerPattern.startsWith('.')) {
    const ext = lowerPattern.startsWith('*.') ? lowerPattern.slice(1) : lowerPattern;
    return lowerPath.endsWith(ext);
  }

  // Path prefix pattern: contains /
  if (lowerPattern.includes('/')) {
    return lowerPath.includes(lowerPattern);
  }

  // Keyword pattern: use word-boundary matching instead of substring
  // "Case" should not match "showcase.ts"
  const escaped = lowerPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const wordBoundary = new RegExp(`\\b${escaped}\\b`, 'i');
  return wordBoundary.test(lowerPath);
}

/**
 * Filter, rank, and format relevant conventions from the patterns store.
 *
 * CC2: Ranked by relevance (file match > domain match > general) with MAX_CONVENTIONS cap.
 * CC3: Uses confidence/evidenceCount for general convention detection.
 */
export function buildConventionContext(
  patterns: Patterns,
  taskDomain: string | undefined,
  predictedFiles: string[],
): PromptSection | null {
  const conventions: Convention[] = patterns.conventions;
  if (conventions.length === 0) return null;

  // Score and filter conventions
  const scored: Array<{ conv: Convention; relevance: number }> = [];

  for (const conv of conventions) {
    let relevance = 0;

    // CC1: Precise pattern matching — glob-like for extension/path patterns
    const matchesFile = predictedFiles.some((fp) =>
      matchConventionPattern(conv.pattern, fp),
    );
    if (matchesFile) relevance += RELEVANCE_FILE_MATCH;

    // Medium: matches task domain
    const matchesDomain = taskDomain
      ? conv.description.toLowerCase().includes(taskDomain.toLowerCase())
      : false;
    if (matchesDomain) relevance += RELEVANCE_DOMAIN_MATCH;

    // Low: general convention
    if (relevance === 0 && isGeneralConvention(conv)) {
      relevance += RELEVANCE_GENERAL;
    }

    if (relevance > 0) {
      // CC2: Boost by confidence if available
      const confidenceBoost = conv.confidence ? conv.confidence * 0.5 : 0;
      scored.push({ conv, relevance: relevance + confidenceBoost });
    }
  }

  if (scored.length === 0) return null;

  // CC2: Sort by relevance descending, cap at MAX_CONVENTIONS
  scored.sort((a, b) => b.relevance - a.relevance);
  const topConventions = scored.slice(0, MAX_CONVENTIONS);

  const lines = topConventions.map((s) => `- ${s.conv.description}`);

  return {
    type: 'conventions',
    content: lines.join('\n'),
    source: 'patterns-store',
  };
}

/**
 * CC3: Check if a convention is general (project-wide, not domain-specific).
 * Uses confidence/evidenceCount when available; falls back to pattern heuristic.
 */
function isGeneralConvention(conv: Convention): boolean {
  // CC3: High evidence count = widely observed = likely general
  if (conv.evidenceCount !== undefined && conv.evidenceCount > 5) return true;

  // CC3: High confidence with broad pattern = general
  if (conv.confidence !== undefined && conv.confidence > 0.8) {
    // Check if pattern is broad (not domain-specific)
    const domainKeywords = ['auth', 'api', 'database', 'ui', 'admin', 'payment'];
    const isDomainSpecific = domainKeywords.some((dk) =>
      conv.pattern.toLowerCase().includes(dk) ||
      conv.description.toLowerCase().includes(dk),
    );
    if (!isDomainSpecific) return true;
  }

  // Fallback: conventions with broad patterns or naming rules
  const generalPatterns = ['.ts', '.js', '.test.', 'Case', 'naming', 'style', 'format', 'import', 'export', 'lint'];
  return generalPatterns.some(
    (gp) =>
      conv.pattern.toLowerCase().includes(gp.toLowerCase()) ||
      conv.description.toLowerCase().includes(gp.toLowerCase()),
  );
}

// ─── Domain-Specific Context Injection ─────────────────────────

/** Maximum domain files to include. */
const MAX_DOMAIN_FILES = 8;

/**
 * Format file size into a human-readable category.
 */
function formatSize(bytes: number): string {
  if (bytes < 500) return 'small';
  if (bytes < 5000) return 'medium';
  return 'large';
}

/**
 * DC2: Compute a relevance score for a domain file for prioritized selection.
 * Files with more imports (widely used) and larger size (entry points) rank higher.
 */
function domainFileRelevance(filePath: string, projectMap: ProjectMap, predictedFilePaths?: Set<string>): number {
  const entry = projectMap.files[filePath];
  if (!entry) return 0;

  let score = 0;

  // Files also in predictions get a boost (cross-signal validation)
  if (predictedFilePaths?.has(filePath)) score += 5;

  // More imports = more connected = more important
  if (entry.imports) score += Math.min(entry.imports.length, 5);

  // Larger files tend to be more central
  if (entry.size > 5000) score += 2;
  else if (entry.size > 1000) score += 1;

  // Files with exports are APIs/entry points
  if (entry.exports && entry.exports.length > 0) score += 1;

  return score;
}

/**
 * DC4: Detect secondary domains from predicted files.
 * Returns domain names that appear in predictions but differ from primary domain.
 */
function detectSecondaryDomains(
  projectMap: ProjectMap,
  primaryDomain: string,
  predictedFilePaths: Set<string>,
): string[] {
  const domainCounts = new Map<string, number>();

  for (const fp of predictedFilePaths) {
    const entry = projectMap.files[fp];
    if (entry?.domain && entry.domain !== primaryDomain) {
      domainCounts.set(entry.domain, (domainCounts.get(entry.domain) ?? 0) + 1);
    }
  }

  // Return domains with 2+ predicted files, sorted by count
  return [...domainCounts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([domain]) => domain);
}

/**
 * Extract domain-specific context from the project map based on task classification.
 *
 * DC1: Rich output with language, size, top exports, and keywords.
 * DC2: Files prioritized by relevance (imports, size, prediction overlap).
 * DC3: Skips files already in the predicted file set (avoids duplication with file context).
 * DC4: Includes secondary domains detected from predicted files.
 *
 * @param projectMap - Project map with file entries
 * @param taskDomain - Classified task domain
 * @param predictedFilePaths - A2/DC3: Files already shown in file context (skip these)
 */
export function buildDomainContext(
  projectMap: ProjectMap,
  taskDomain: string | undefined,
  predictedFilePaths?: Set<string>,
): PromptSection | null {
  if (!taskDomain) return null;

  const allDomainNotes: string[] = [];

  // Process primary domain
  const primaryNotes = buildSingleDomainNotes(projectMap, taskDomain, predictedFilePaths);
  if (primaryNotes.length > 0) {
    allDomainNotes.push(...primaryNotes);
  }

  // DC4: Process secondary domains from predicted files
  if (predictedFilePaths && predictedFilePaths.size > 0) {
    const secondaryDomains = detectSecondaryDomains(projectMap, taskDomain, predictedFilePaths);
    for (const secDomain of secondaryDomains.slice(0, 2)) { // Max 2 secondary domains
      const secNotes = buildSingleDomainNotes(projectMap, secDomain, predictedFilePaths, 3); // Fewer files for secondary
      if (secNotes.length > 0) {
        allDomainNotes.push(`[${secDomain}]`);
        allDomainNotes.push(...secNotes);
      }
    }
  }

  if (allDomainNotes.length === 0) return null;

  return {
    type: 'domainContext',
    content: allDomainNotes.join('\n'),
    source: 'project-map',
  };
}

/**
 * Build domain notes for a single domain.
 * DC1: Rich format. DC2: Prioritized. DC3: Deduplicated.
 */
function buildSingleDomainNotes(
  projectMap: ProjectMap,
  domain: string,
  predictedFilePaths?: Set<string>,
  maxFiles: number = MAX_DOMAIN_FILES,
): string[] {
  const domainFiles = projectMap.domains[domain];
  if (!domainFiles || domainFiles.length === 0) return [];

  // DC3: Filter out files already in predicted file context
  const candidateFiles = predictedFilePaths
    ? domainFiles.filter((fp) => !predictedFilePaths.has(fp))
    : domainFiles;

  if (candidateFiles.length === 0) return [];

  // DC2: Sort by relevance (most important domain files first)
  const sorted = [...candidateFiles].sort(
    (a, b) => domainFileRelevance(b, projectMap, predictedFilePaths) - domainFileRelevance(a, projectMap, predictedFilePaths),
  );

  // DC1: Build rich domain context notes
  const domainNotes: string[] = [];
  for (const filePath of sorted.slice(0, maxFiles)) {
    const entry = projectMap.files[filePath];
    if (!entry) continue;

    const parts: string[] = [`- ${filePath}`];
    const meta: string[] = [];

    if (entry.language) meta.push(entry.language);
    if (entry.size) meta.push(formatSize(entry.size));

    if (meta.length > 0) parts.push(`(${meta.join(', ')})`);

    const details: string[] = [];
    if (entry.exports && entry.exports.length > 0) {
      details.push(`exports: ${entry.exports.slice(0, 3).join(', ')}${entry.exports.length > 3 ? '...' : ''}`);
    }
    if (entry.keywords && entry.keywords.length > 0) {
      details.push(`keywords: ${entry.keywords.slice(0, 3).join(', ')}${entry.keywords.length > 3 ? '...' : ''}`);
    }

    if (details.length > 0) parts.push(`— ${details.join('; ')}`);

    domainNotes.push(parts.join(' '));
  }

  return domainNotes;
}

// ─── Structured Prompt Assembly ────────────────────────────────

/**
 * Assemble all sections into a structured prompt with clear delimiters.
 *
 * A3: Section order varies by task type. Convention-heavy tasks
 * (Config, Docs) put conventions before files. Research/Learning
 * tasks put domain context earlier.
 */
export function assemblePrompt(sections: PromptSection[], taskType?: string): string {
  const parts: string[] = [];
  const sectionOrder = getSectionOrder(taskType);

  for (const type of sectionOrder) {
    const section = sections.find((s) => s.type === type);
    if (section && section.content.trim()) {
      const header = SECTION_HEADERS[type];
      parts.push(`${header}\n${section.content}`);
    }
  }

  return parts.join('\n\n');
}

// ─── Token Budget Enforcement ─────────────────────────────────

/** A1: Maximum total injection tokens across all non-user sections. */
const MAX_TOTAL_INJECTION_TOKENS = 3000;

/**
 * A1: Section trim priority — lowest priority sections are trimmed first.
 * userRequest is never trimmed. Priority varies by task type (via section order).
 */
const SECTION_TRIM_PRIORITY: Record<PromptSection['type'], number> = {
  userRequest: 100, // Never trim
  fileContext: 3,   // Highest priority injection
  conventions: 2,   // Medium priority
  domainContext: 1,  // Lowest priority — trimmed first
};

/**
 * A1: Enforce total token budget across all injection sections.
 * If total exceeds MAX_TOTAL_INJECTION_TOKENS, trims lowest-priority sections first.
 * Modifies sections array in place.
 */
function enforceTokenBudget(sections: PromptSection[], taskType?: string): void {
  // Calculate total injection tokens (exclude userRequest)
  let totalTokens = 0;
  const injectionSections = sections.filter((s) => s.type !== 'userRequest');

  for (const section of injectionSections) {
    totalTokens += estimateLineTokens(section.content);
  }

  if (totalTokens <= MAX_TOTAL_INJECTION_TOKENS) return; // Within budget

  // Sort by trim priority (lowest first — these get trimmed)
  const sortedByPriority = [...injectionSections].sort(
    (a, b) => SECTION_TRIM_PRIORITY[a.type] - SECTION_TRIM_PRIORITY[b.type],
  );

  let excess = totalTokens - MAX_TOTAL_INJECTION_TOKENS;

  for (const section of sortedByPriority) {
    if (excess <= 0) break;

    const sectionTokens = estimateLineTokens(section.content);

    if (sectionTokens <= excess) {
      // Remove entire section
      const idx = sections.indexOf(section);
      if (idx !== -1) {
        sections.splice(idx, 1);
        excess -= sectionTokens;
        logger.debug(MODULE, `A1: Trimmed entire ${section.type} section (${sectionTokens} tokens)`);
      }
    } else {
      // Trim lines from the end of this section
      const lines = section.content.split('\n');
      while (excess > 0 && lines.length > 1) {
        const removedLine = lines.pop()!;
        excess -= estimateLineTokens(removedLine);
      }
      section.content = lines.join('\n');
      logger.debug(MODULE, `A1: Trimmed ${section.type} section to fit budget`);
    }
  }
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

  // A2: Track all file paths mentioned in file context for cross-section deduplication
  const mentionedFiles = new Set<string>();

  // 2. File context injection from prediction results (token-budget-aware)
  // FC1: Pass projectMap for file metadata enrichment
  if (ctx.prediction && ctx.prediction.predictions.length > 0) {
    const fileSection = buildFileContext(ctx.prediction.predictions, ctx.storeCache?.projectMap);
    if (fileSection) {
      sections.push(fileSection);
      filesInjected = fileSection.content.split('\n').length;
      // A2: Track all files mentioned in file context
      for (const p of ctx.prediction.predictions) {
        mentionedFiles.add(p.filePath);
      }
    }
  }

  // 3. Pattern and convention injection from cache
  const patterns = ctx.storeCache?.patterns;
  if (patterns) {
    const predictedFiles = ctx.prediction
      ? ctx.prediction.predictions.map((p) => p.filePath)
      : [];
    const taskDomain = ctx.classification?.domain;
    const convSection = buildConventionContext(patterns, taskDomain, predictedFiles);
    if (convSection) {
      sections.push(convSection);
      // CC4: Count actual filtered conventions, not total
      patternsInjected = convSection.content.split('\n').length;
    }
  }

  // 4. Domain-specific context injection
  const projectMap = ctx.storeCache?.projectMap;
  if (projectMap) {
    const taskDomain = ctx.classification?.domain;
    // DC3/A2: Pass mentioned files so domain context skips duplicates
    const domainSection = buildDomainContext(projectMap, taskDomain, mentionedFiles);
    if (domainSection) {
      sections.push(domainSection);
    }
  }

  // A1: Enforce total injection token budget — trim low-priority sections if needed
  enforceTokenBudget(sections, ctx.classification?.type);

  // 5. Assemble the optimized prompt (A3: task-type-aware section ordering)
  const optimizedPrompt = assemblePrompt(sections, ctx.classification?.type);
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
