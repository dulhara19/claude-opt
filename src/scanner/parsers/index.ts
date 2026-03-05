import path from 'node:path';
import { TypeScriptParser } from './typescript.js';
import { MarkdownParser } from './markdown.js';
import { PythonParser } from './python.js';

export interface ParsedImport {
  raw: string;
  resolved: string | null;
  isExternal: boolean;
  type: 'import' | 'require' | 'reference' | 'link';
}

export interface ImportParser {
  extensions: string[];
  parseImports(filePath: string, content: string, projectRoot: string): ParsedImport[];
  extractKeywords(filePath: string, content: string): string[];
}

const parserRegistry = new Map<string, ImportParser>();

export function registerParser(parser: ImportParser): void {
  for (const ext of parser.extensions) {
    parserRegistry.set(ext, parser);
  }
}

export function getParserForFile(filePath: string): ImportParser | null {
  const ext = path.extname(filePath).toLowerCase();
  return parserRegistry.get(ext) ?? null;
}

// Register built-in parsers
registerParser(new TypeScriptParser());
registerParser(new MarkdownParser());
registerParser(new PythonParser());
