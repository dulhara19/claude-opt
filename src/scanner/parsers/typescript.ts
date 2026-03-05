import { existsSync } from 'node:fs';
import path from 'node:path';
import { toInternal, toOS } from '../../utils/index.js';
import type { ImportParser, ParsedImport } from './index.js';

const IMPORT_EXPORT_RE = /(?:import|export)\s+(?:.*?\s+from\s+)?['"]([^'"]+)['"]/g;
const DYNAMIC_IMPORT_RE = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const REQUIRE_RE = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

const EXPORT_KEYWORD_RE = /export\s+(?:default\s+)?(?:function|class|interface|type|const|let|var|enum)\s+(\w+)/g;

const TS_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js', '/index.jsx'];

function resolveImport(importPath: string, sourceFile: string, projectRoot: string): string | null {
  if (!importPath.startsWith('.')) return null;

  const sourceDir = path.dirname(path.join(toOS(projectRoot), sourceFile));
  const basePath = path.resolve(sourceDir, importPath);
  const relativePath = toInternal(path.relative(toOS(projectRoot), basePath));

  // Try exact path first (already has extension)
  if (existsSync(path.join(toOS(projectRoot), relativePath))) {
    return relativePath;
  }

  // Try extensions
  for (const ext of TS_EXTENSIONS) {
    const candidate = relativePath + ext;
    if (existsSync(path.join(toOS(projectRoot), candidate))) {
      return candidate;
    }
  }

  return null;
}

export class TypeScriptParser implements ImportParser {
  extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

  parseImports(filePath: string, content: string, projectRoot: string): ParsedImport[] {
    const imports: ParsedImport[] = [];
    const seen = new Set<string>();

    const addImport = (raw: string, type: ParsedImport['type']) => {
      if (seen.has(raw)) return;
      seen.add(raw);

      const isExternal = !raw.startsWith('.');
      const resolved = isExternal ? null : resolveImport(raw, filePath, projectRoot);

      imports.push({ raw, resolved, isExternal, type });
    };

    // ES import/export
    for (const match of content.matchAll(IMPORT_EXPORT_RE)) {
      addImport(match[1], 'import');
    }

    // Dynamic import
    for (const match of content.matchAll(DYNAMIC_IMPORT_RE)) {
      addImport(match[1], 'import');
    }

    // CommonJS require
    for (const match of content.matchAll(REQUIRE_RE)) {
      addImport(match[1], 'require');
    }

    return imports;
  }

  extractKeywords(filePath: string, content: string): string[] {
    const keywords: string[] = [];

    for (const match of content.matchAll(EXPORT_KEYWORD_RE)) {
      keywords.push(match[1].toLowerCase());
    }

    return keywords;
  }
}
