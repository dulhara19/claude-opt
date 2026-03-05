import { existsSync } from 'node:fs';
import path from 'node:path';
import { toInternal, toOS } from '../../utils/index.js';
import type { ImportParser, ParsedImport } from './index.js';

const HEADING_RE = /^(#{1,6})\s+(.+)$/gm;
const INLINE_LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/g;
const REFERENCE_LINK_RE = /^\[([^\]]+)\]:\s*(\S+)/gm;
const BOLD_RE = /\*\*([^*]+)\*\*/g;

const EXTERNAL_URL_RE = /^https?:\/\//;

function resolveLink(linkPath: string, sourceFile: string, projectRoot: string): string | null {
  if (EXTERNAL_URL_RE.test(linkPath)) return null;

  // Strip anchor fragments
  const cleanPath = linkPath.split('#')[0];
  if (!cleanPath) return null;

  const sourceDir = path.dirname(path.join(toOS(projectRoot), sourceFile));
  const basePath = path.resolve(sourceDir, cleanPath);
  const relativePath = toInternal(path.relative(toOS(projectRoot), basePath));

  if (existsSync(path.join(toOS(projectRoot), relativePath))) {
    return relativePath;
  }

  return null;
}

export class MarkdownParser implements ImportParser {
  extensions = ['.md', '.mdx'];

  parseImports(filePath: string, content: string, projectRoot: string): ParsedImport[] {
    const imports: ParsedImport[] = [];
    const seen = new Set<string>();

    const addLink = (raw: string, type: ParsedImport['type']) => {
      if (seen.has(raw)) return;
      if (EXTERNAL_URL_RE.test(raw)) return;
      seen.add(raw);

      const resolved = resolveLink(raw, filePath, projectRoot);
      imports.push({ raw, resolved, isExternal: false, type });
    };

    // Inline links
    for (const match of content.matchAll(INLINE_LINK_RE)) {
      addLink(match[2], 'link');
    }

    // Reference-style links
    for (const match of content.matchAll(REFERENCE_LINK_RE)) {
      addLink(match[2], 'reference');
    }

    return imports;
  }

  extractKeywords(filePath: string, content: string): string[] {
    const keywords: string[] = [];
    const seen = new Set<string>();

    const addKeyword = (word: string) => {
      const normalized = word.toLowerCase().trim();
      if (normalized && !seen.has(normalized)) {
        seen.add(normalized);
        keywords.push(normalized);
      }
    };

    // Extract from headings
    for (const match of content.matchAll(HEADING_RE)) {
      const headingText = match[2].trim();
      // Split heading into words and add significant ones
      for (const word of headingText.split(/\s+/)) {
        const clean = word.replace(/[^a-zA-Z0-9-_]/g, '');
        if (clean.length > 2) {
          addKeyword(clean);
        }
      }
    }

    // Extract from bold text
    for (const match of content.matchAll(BOLD_RE)) {
      const boldText = match[1].trim();
      for (const word of boldText.split(/\s+/)) {
        const clean = word.replace(/[^a-zA-Z0-9-_]/g, '');
        if (clean.length > 2) {
          addKeyword(clean);
        }
      }
    }

    return keywords;
  }
}
