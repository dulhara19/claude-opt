import { existsSync } from 'node:fs';
import path from 'node:path';
import { toInternal, toOS } from '../../utils/index.js';
import type { ImportParser, ParsedImport } from './index.js';

const IMPORT_RE = /^import\s+(\S+)/gm;
const FROM_IMPORT_RE = /^from\s+(\S+)\s+import/gm;
const DEF_CLASS_RE = /(?:def|class)\s+(\w+)/g;

const PY_EXTENSIONS = ['.py', '//__init__.py'];

function resolveRelativeImport(
  importPath: string,
  sourceFile: string,
  projectRoot: string,
): string | null {
  // Python relative imports use dots: from . import x, from ..utils import y
  if (!importPath.startsWith('.')) return null;

  // Count leading dots for relative depth
  let dots = 0;
  while (dots < importPath.length && importPath[dots] === '.') dots++;

  const modulePart = importPath.slice(dots).replace(/\./g, '/');
  const sourceDir = path.dirname(path.join(toOS(projectRoot), sourceFile));

  // Go up (dots - 1) levels from source directory
  let baseDir = sourceDir;
  for (let i = 1; i < dots; i++) {
    baseDir = path.dirname(baseDir);
  }

  const basePath = modulePart
    ? path.resolve(baseDir, modulePart)
    : baseDir;
  const relativePath = toInternal(path.relative(toOS(projectRoot), basePath));

  // Try as .py file
  for (const ext of PY_EXTENSIONS) {
    const candidate = relativePath + ext;
    if (existsSync(path.join(toOS(projectRoot), candidate))) {
      return candidate;
    }
  }

  // Try exact path (directory with __init__.py)
  const initPath = relativePath + '/__init__.py';
  if (existsSync(path.join(toOS(projectRoot), initPath))) {
    return initPath;
  }

  return null;
}

export class PythonParser implements ImportParser {
  extensions = ['.py'];

  parseImports(filePath: string, content: string, projectRoot: string): ParsedImport[] {
    const imports: ParsedImport[] = [];
    const seen = new Set<string>();

    const addImport = (raw: string) => {
      if (seen.has(raw)) return;
      seen.add(raw);

      const isRelative = raw.startsWith('.');
      const resolved = isRelative ? resolveRelativeImport(raw, filePath, projectRoot) : null;

      imports.push({
        raw,
        resolved,
        isExternal: !isRelative,
        type: 'import',
      });
    };

    // import module
    for (const match of content.matchAll(IMPORT_RE)) {
      addImport(match[1]);
    }

    // from module import ...
    for (const match of content.matchAll(FROM_IMPORT_RE)) {
      addImport(match[1]);
    }

    return imports;
  }

  extractKeywords(filePath: string, content: string): string[] {
    const keywords: string[] = [];

    for (const match of content.matchAll(DEF_CLASS_RE)) {
      const name = match[1];
      keywords.push(name.toLowerCase());
      // Split snake_case and camelCase into component words
      const parts = name
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .toLowerCase()
        .split(/[\s_]+/)
        .filter((w) => w.length > 2);
      for (const part of parts) {
        if (part !== name.toLowerCase()) {
          keywords.push(part);
        }
      }
    }

    return keywords;
  }
}
