import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Result, ProjectMap, KeywordIndex } from '../types/index.js';
import { ok, err, toOS, logger } from '../utils/index.js';
import { writeKeywordIndex, readKeywordIndex } from '../store/index.js';
import { getParserForFile } from './parsers/index.js';

const VERSION = '1.0.0';

/** Common noise words to exclude from keyword index. */
const NOISE_WORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had',
  'her', 'was', 'one', 'our', 'out', 'has', 'its', 'let', 'say', 'she',
  'too', 'use', 'from', 'this', 'that', 'with', 'have', 'will', 'each',
  'make', 'like', 'just', 'over', 'such', 'take', 'than', 'them', 'very',
  'some', 'into', 'also', 'what', 'when', 'which', 'been', 'more', 'only',
  'then', 'they', 'were', 'import', 'export', 'default', 'return', 'const',
  'function', 'class', 'interface', 'type', 'index', 'test', 'spec',
  'module', 'require', 'true', 'false', 'null', 'undefined', 'void',
  'string', 'number', 'boolean', 'object', 'array',
]);

/** Split camelCase/PascalCase into individual words. */
function splitCamelCase(name: string): string[] {
  return name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .split(/[\s_\-.]+/)
    .filter((w) => w.length > 0);
}

/** Extract keywords from a file name. */
export function extractFileNameKeywords(filePath: string): string[] {
  const baseName = path.basename(filePath, path.extname(filePath));
  const parts = splitCamelCase(baseName);
  return parts.filter((p) => p.length > 1 && !NOISE_WORDS.has(p));
}

/** Check if a keyword is valid (not noise, not too short, not numbers-only). */
function isValidKeyword(keyword: string): boolean {
  if (keyword.length <= 1) return false;
  if (NOISE_WORDS.has(keyword)) return false;
  if (/^\d+$/.test(keyword)) return false;
  return true;
}

export function buildKeywordIndex(
  projectRoot: string,
  projectMap: ProjectMap,
): Result<KeywordIndex> {
  const keywordToFiles: Record<string, string[]> = {};
  const fileToKeywords: Record<string, string[]> = {};

  const addKeyword = (keyword: string, filePath: string) => {
    const normalized = keyword.toLowerCase().trim();
    if (!isValidKeyword(normalized)) return;

    if (!keywordToFiles[normalized]) keywordToFiles[normalized] = [];
    if (!keywordToFiles[normalized].includes(filePath)) {
      keywordToFiles[normalized].push(filePath);
    }

    if (!fileToKeywords[filePath]) fileToKeywords[filePath] = [];
    if (!fileToKeywords[filePath].includes(normalized)) {
      fileToKeywords[filePath].push(normalized);
    }
  };

  for (const [filePath] of Object.entries(projectMap.files)) {
    // Keywords from file name
    const nameKeywords = extractFileNameKeywords(filePath);
    for (const kw of nameKeywords) {
      addKeyword(kw, filePath);
    }

    // Keywords from content via parser
    const parser = getParserForFile(filePath);
    if (!parser) continue;

    let content: string;
    try {
      content = readFileSync(path.join(toOS(projectRoot), filePath), 'utf-8');
    } catch {
      continue;
    }

    const contentKeywords = parser.extractKeywords(filePath, content);
    for (const kw of contentKeywords) {
      addKeyword(kw, filePath);
    }
  }

  const index: KeywordIndex = {
    schemaVersion: VERSION,
    updatedAt: new Date().toISOString(),
    keywordToFiles,
    fileToKeywords,
  };

  const writeResult = writeKeywordIndex(projectRoot, index);
  if (!writeResult.ok) {
    logger.error('keyword-extractor', 'Failed to write keyword index', writeResult.error);
    return err(writeResult.error);
  }

  const totalKeywords = Object.keys(keywordToFiles).length;
  logger.info('keyword-extractor', `Built index: ${totalKeywords} keywords from ${Object.keys(fileToKeywords).length} files`);
  return ok(index);
}

export function updateKeywordIndex(
  projectRoot: string,
  changedFiles: string[],
  deletedFiles: string[],
  projectMap: ProjectMap,
): Result<KeywordIndex> {
  const existingResult = readKeywordIndex(projectRoot);
  if (!existingResult.ok) {
    // No existing index — do full build
    return buildKeywordIndex(projectRoot, projectMap);
  }

  const existing = existingResult.value;
  const keywordToFiles = { ...existing.keywordToFiles };
  const fileToKeywords = { ...existing.fileToKeywords };
  const affectedFiles = new Set([...changedFiles, ...deletedFiles]);

  // Remove affected files from both maps
  for (const filePath of affectedFiles) {
    // Remove from fileToKeywords
    const oldKeywords = fileToKeywords[filePath];
    delete fileToKeywords[filePath];

    // Remove file from keywordToFiles entries
    if (oldKeywords) {
      for (const kw of oldKeywords) {
        if (keywordToFiles[kw]) {
          keywordToFiles[kw] = keywordToFiles[kw].filter((f) => f !== filePath);
          if (keywordToFiles[kw].length === 0) {
            delete keywordToFiles[kw];
          }
        }
      }
    }
  }

  // Re-index changed files (not deleted ones)
  const addKeyword = (keyword: string, filePath: string) => {
    const normalized = keyword.toLowerCase().trim();
    if (!isValidKeyword(normalized)) return;

    if (!keywordToFiles[normalized]) keywordToFiles[normalized] = [];
    if (!keywordToFiles[normalized].includes(filePath)) {
      keywordToFiles[normalized].push(filePath);
    }

    if (!fileToKeywords[filePath]) fileToKeywords[filePath] = [];
    if (!fileToKeywords[filePath].includes(normalized)) {
      fileToKeywords[filePath].push(normalized);
    }
  };

  for (const filePath of changedFiles) {
    // Keywords from file name
    const nameKeywords = extractFileNameKeywords(filePath);
    for (const kw of nameKeywords) {
      addKeyword(kw, filePath);
    }

    // Keywords from content
    const parser = getParserForFile(filePath);
    if (!parser) continue;

    let content: string;
    try {
      content = readFileSync(path.join(toOS(projectRoot), filePath), 'utf-8');
    } catch {
      continue;
    }

    const contentKeywords = parser.extractKeywords(filePath, content);
    for (const kw of contentKeywords) {
      addKeyword(kw, filePath);
    }
  }

  const index: KeywordIndex = {
    schemaVersion: VERSION,
    updatedAt: new Date().toISOString(),
    keywordToFiles,
    fileToKeywords,
  };

  const writeResult = writeKeywordIndex(projectRoot, index);
  if (!writeResult.ok) {
    logger.error('keyword-extractor', 'Failed to write keyword index', writeResult.error);
    return err(writeResult.error);
  }

  logger.info('keyword-extractor', `Updated index: ${Object.keys(keywordToFiles).length} keywords (${changedFiles.length} changed, ${deletedFiles.length} deleted)`);
  return ok(index);
}
