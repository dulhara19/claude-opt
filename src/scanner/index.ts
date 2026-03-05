export { scanProject, detectProjectType, detectFileType, classifyDomain, detectChanges } from './scanner.js';
export { loadIgnorePatterns, shouldIgnore } from './ignore.js';
export { buildDependencyGraph, updateDependencyGraph } from './dependency-graph.js';
export { buildKeywordIndex, updateKeywordIndex, extractFileNameKeywords } from './keyword-extractor.js';
export { generateClaudeMd, detectConventions } from './claudemd-generator.js';
export { getParserForFile, registerParser } from './parsers/index.js';
export type { ImportParser, ParsedImport } from './parsers/index.js';
export { detectProjectStack, loadStarterPack, applyStarterPack } from './starter-packs.js';
export type { ScanOptions, ScanResult, FileCategory, FileTypeInfo, IgnorePatterns, FileChanges, StarterPack } from './types.js';
