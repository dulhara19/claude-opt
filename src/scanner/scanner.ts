import { readdirSync, statSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import type { Result, ProjectMap, FileEntry } from '../types/index.js';
import { ok, err, toInternal, toOS, logger, withFailOpen } from '../utils/index.js';
import { writeProjectMap, ensureStoreDir, readProjectMap } from '../store/index.js';
import { loadIgnorePatterns, shouldIgnore } from './ignore.js';
import { buildDependencyGraph, updateDependencyGraph } from './dependency-graph.js';
import { buildKeywordIndex, updateKeywordIndex } from './keyword-extractor.js';
import type { ScanOptions, ScanResult, FileCategory, FileTypeInfo, FileChanges } from './types.js';

// ─── File type detection ───────────────────────────────────────

const FILE_TYPE_MAP: Record<string, FileTypeInfo> = {
  '.ts': { type: 'typescript', category: 'code' },
  '.tsx': { type: 'typescript', category: 'code' },
  '.js': { type: 'javascript', category: 'code' },
  '.jsx': { type: 'javascript', category: 'code' },
  '.mjs': { type: 'javascript', category: 'code' },
  '.cjs': { type: 'javascript', category: 'code' },
  '.py': { type: 'python', category: 'code' },
  '.md': { type: 'markdown', category: 'markdown' },
  '.mdx': { type: 'markdown', category: 'markdown' },
  '.json': { type: 'json', category: 'config' },
  '.yml': { type: 'yaml', category: 'config' },
  '.yaml': { type: 'yaml', category: 'config' },
  '.css': { type: 'stylesheet', category: 'code' },
  '.scss': { type: 'stylesheet', category: 'code' },
  '.less': { type: 'stylesheet', category: 'code' },
  '.html': { type: 'html', category: 'document' },
  '.htm': { type: 'html', category: 'document' },
  '.png': { type: 'image', category: 'asset' },
  '.jpg': { type: 'image', category: 'asset' },
  '.jpeg': { type: 'image', category: 'asset' },
  '.svg': { type: 'image', category: 'asset' },
  '.gif': { type: 'image', category: 'asset' },
  '.txt': { type: 'text', category: 'document' },
  '.rst': { type: 'text', category: 'document' },
};

const TEST_PATTERNS = ['.test.', '.spec.', '__tests__/'];

export function detectFileType(filePath: string): FileTypeInfo {
  const ext = path.extname(filePath).toLowerCase();
  const base = FILE_TYPE_MAP[ext] ?? { type: 'unknown', category: 'asset' as FileCategory };

  // Override category to 'test' for test files
  const isTest = TEST_PATTERNS.some((p) => filePath.includes(p));
  if (isTest && (base.category === 'code' || base.category === 'config')) {
    return { type: base.type, category: 'test' };
  }

  return base;
}

// ─── Content hash ──────────────────────────────────────────────

function computeContentHash(absolutePath: string): string {
  try {
    const content = readFileSync(absolutePath);
    return createHash('sha256').update(content).digest('hex').slice(0, 8);
  } catch {
    return '00000000';
  }
}

// ─── Project type auto-detection ───────────────────────────────

const CODE_INDICATORS = ['package.json', 'tsconfig.json', 'setup.py', 'Cargo.toml', 'go.mod', 'pom.xml', 'build.gradle'];

export function detectProjectType(
  projectRoot: string,
  files: Map<string, FileEntry>,
): 'code' | 'research' | 'mixed' {
  const root = toOS(projectRoot);

  // Check for code project indicators
  const hasCodeIndicator = CODE_INDICATORS.some((f) => {
    try {
      return statSync(path.join(root, f)).isFile();
    } catch {
      return false;
    }
  });

  if (hasCodeIndicator) {
    // Still check ratio for mixed
    let codeCount = 0;
    let docCount = 0;
    for (const [, entry] of files) {
      const info = detectFileType(entry.path);
      if (info.category === 'code' || info.category === 'test') codeCount++;
      if (info.category === 'markdown' || info.category === 'document') docCount++;
    }
    const total = codeCount + docCount;
    if (total > 0 && docCount / total > 0.7) return 'mixed';
    return 'code';
  }

  // Count file categories
  let codeCount = 0;
  let docCount = 0;
  for (const [, entry] of files) {
    const info = detectFileType(entry.path);
    if (info.category === 'code' || info.category === 'test') codeCount++;
    if (info.category === 'markdown' || info.category === 'document') docCount++;
  }

  const total = codeCount + docCount;
  if (total === 0) return 'mixed';
  if (codeCount / total > 0.7) return 'code';
  if (docCount / total > 0.7) return 'research';
  return 'mixed';
}

// ─── Domain classification ─────────────────────────────────────

export function classifyDomain(relativePath: string, _projectType: string): string {
  const parts = relativePath.split('/');
  if (parts.length <= 1) return 'root';

  const topDir = parts[0];
  if (topDir === 'tests' || topDir === 'test' || topDir === '__tests__') {
    return parts.length > 2 ? parts[1] : 'tests';
  }
  if (topDir === 'src' && parts.length > 2) {
    return parts[1];
  }
  return topDir;
}

function buildDomainMap(files: Map<string, FileEntry>, projectType: string): Record<string, string[]> {
  const domains: Record<string, string[]> = {};
  for (const [relativePath] of files) {
    const domain = classifyDomain(relativePath, projectType);
    if (!domains[domain]) domains[domain] = [];
    domains[domain].push(relativePath);
  }
  return domains;
}

// ─── Directory walker ──────────────────────────────────────────

function walkDirectory(
  projectRoot: string,
  relativeTo: string,
  patterns: ReturnType<typeof loadIgnorePatterns>,
  files: Map<string, FileEntry>,
  skipped: { count: number },
): void {
  const absoluteDir = relativeTo
    ? path.join(toOS(projectRoot), relativeTo)
    : toOS(projectRoot);

  let entries;
  try {
    entries = readdirSync(absoluteDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const relPath = relativeTo ? `${relativeTo}/${entry.name}` : entry.name;

    if (shouldIgnore(relPath, patterns)) {
      skipped.count++;
      continue;
    }

    if (entry.isDirectory()) {
      // Also check directory with trailing slash
      if (shouldIgnore(relPath + '/', patterns)) {
        skipped.count++;
        continue;
      }
      walkDirectory(projectRoot, relPath, patterns, files, skipped);
    } else if (entry.isFile()) {
      const absolutePath = path.join(absoluteDir, entry.name);
      try {
        const stats = statSync(absolutePath);
        const fileType = detectFileType(relPath);
        const posixPath = toInternal(relPath);

        const fileEntry: FileEntry = {
          path: posixPath,
          size: stats.size,
          contentHash: computeContentHash(absolutePath),
          lastModified: stats.mtime.toISOString(),
          language: fileType.category === 'code' || fileType.category === 'test' ? fileType.type : null,
          domain: null, // filled in later
          imports: [],  // filled in by Story 1.4 parsers
          exports: [],  // filled in by Story 1.4 parsers
          keywords: [], // filled in by Story 1.4 keyword extractor
        };

        files.set(posixPath, fileEntry);
      } catch {
        skipped.count++;
      }
    }
  }
}

// ─── Change detection ─────────────────────────────────────────

export function detectChanges(
  existingMap: ProjectMap,
  currentFiles: Map<string, FileEntry>,
): FileChanges {
  const changed: string[] = [];
  const added: string[] = [];
  const deleted: string[] = [];
  const unchanged: string[] = [];

  for (const [filePath, entry] of currentFiles) {
    const existing = existingMap.files[filePath];
    if (!existing) {
      added.push(filePath);
    } else if (existing.contentHash !== entry.contentHash) {
      changed.push(filePath);
    } else {
      unchanged.push(filePath);
    }
  }

  for (const filePath of Object.keys(existingMap.files)) {
    if (!currentFiles.has(filePath)) {
      deleted.push(filePath);
    }
  }

  return { changed, added, deleted, unchanged };
}

// ─── Incremental scan ─────────────────────────────────────────

function incrementalScan(options: ScanOptions): Result<ScanResult> {
  const startTime = Date.now();

  const dirResult = ensureStoreDir(options.projectRoot);
  if (!dirResult.ok) return dirResult;

  // Read existing project map
  const existingResult = readProjectMap(options.projectRoot);
  if (!existingResult.ok) {
    // No existing map — fall back to full scan
    logger.info('scanner', 'No existing project map found, falling back to full scan');
    return fullScan(options);
  }
  const existingMap = existingResult.value;

  // Walk current directory tree
  const ignorePatterns = loadIgnorePatterns(options.projectRoot);
  const currentFiles = new Map<string, FileEntry>();
  const skipped = { count: 0 };
  walkDirectory(options.projectRoot, '', ignorePatterns, currentFiles, skipped);

  // Detect changes
  const changes = detectChanges(existingMap, currentFiles);
  const affectedFiles = [...changes.changed, ...changes.added];

  // Build updated files map: start with existing, remove deleted, update changed/new
  const updatedFiles: Record<string, FileEntry> = { ...existingMap.files };
  for (const file of changes.deleted) {
    delete updatedFiles[file];
  }
  for (const file of affectedFiles) {
    const entry = currentFiles.get(file);
    if (entry) updatedFiles[file] = entry;
  }

  // For unchanged files, keep existing entries (no re-processing)
  const projectType = options.projectType ?? detectProjectType(
    options.projectRoot,
    new Map(Object.entries(updatedFiles)),
  );

  // Fill in domain classification for updated files
  for (const file of affectedFiles) {
    const entry = updatedFiles[file];
    if (entry) entry.domain = classifyDomain(file, projectType);
  }

  // Rebuild domain map
  const allFiles = new Map(Object.entries(updatedFiles));
  const domains = buildDomainMap(allFiles, projectType);

  const projectMap: ProjectMap = {
    schemaVersion: '1.0.0',
    scannedAt: new Date().toISOString(),
    scanType: 'incremental',
    projectType,
    totalFiles: Object.keys(updatedFiles).length,
    files: updatedFiles,
    domains,
    ignoredPatterns: ignorePatterns.allPatterns,
  };

  const writeResult = writeProjectMap(options.projectRoot, projectMap);
  if (!writeResult.ok) {
    logger.error('scanner', 'Failed to write project map', writeResult.error);
    return err(writeResult.error);
  }

  // Incremental dependency graph update (fail-open)
  const graphResult = withFailOpen(
    () => updateDependencyGraph(options.projectRoot, affectedFiles, changes.deleted, projectMap),
    { ok: true, value: { schemaVersion: '1.0.0', updatedAt: '', edges: [], adjacency: {} } },
    'dependency-graph',
  );
  const dependencyEdges = graphResult.ok ? graphResult.value.edges.length : 0;

  // Incremental keyword index update (fail-open)
  const indexResult = withFailOpen(
    () => updateKeywordIndex(options.projectRoot, affectedFiles, changes.deleted, projectMap),
    { ok: true, value: { schemaVersion: '1.0.0', updatedAt: '', keywordToFiles: {}, fileToKeywords: {} } },
    'keyword-extractor',
  );
  const keywordsExtracted = indexResult.ok
    ? Object.keys(indexResult.value.keywordToFiles).length
    : 0;

  const scanDurationMs = Date.now() - startTime;
  logger.info(
    'scanner',
    `Incremental scan: ${affectedFiles.length} changed, ${changes.deleted.length} deleted, ${changes.unchanged.length} unchanged in ${scanDurationMs}ms`,
  );

  return ok({
    projectMap,
    projectType,
    filesScanned: currentFiles.size,
    filesSkipped: skipped.count,
    filesChanged: changes.changed.length,
    filesNew: changes.added.length,
    filesDeleted: changes.deleted.length,
    filesUnchanged: changes.unchanged.length,
    dependencyEdges,
    keywordsExtracted,
    scanDurationMs,
  });
}

// ─── Core scanner ──────────────────────────────────────────────

function fullScan(options: ScanOptions): Result<ScanResult> {
  const startTime = Date.now();

  // Ensure store dir exists
  const dirResult = ensureStoreDir(options.projectRoot);
  if (!dirResult.ok) return dirResult;

  // Load ignore patterns
  const ignorePatterns = loadIgnorePatterns(options.projectRoot);

  // Walk directory tree
  const files = new Map<string, FileEntry>();
  const skipped = { count: 0 };
  walkDirectory(options.projectRoot, '', ignorePatterns, files, skipped);

  // Detect project type
  const projectType = options.projectType ?? detectProjectType(options.projectRoot, files);

  // Fill in domain classification
  const domains = buildDomainMap(files, projectType);
  for (const [filePath, entry] of files) {
    entry.domain = classifyDomain(filePath, projectType);
  }

  // Build project map
  const projectMap: ProjectMap = {
    schemaVersion: '1.0.0',
    scannedAt: new Date().toISOString(),
    scanType: options.scanType,
    projectType,
    totalFiles: files.size,
    files: Object.fromEntries(files),
    domains,
    ignoredPatterns: ignorePatterns.allPatterns,
  };

  // Write via store module
  const writeResult = writeProjectMap(options.projectRoot, projectMap);
  if (!writeResult.ok) {
    logger.error('scanner', 'Failed to write project map', writeResult.error);
    return err(writeResult.error);
  }

  // Build dependency graph (fail-open)
  const graphResult = withFailOpen(
    () => buildDependencyGraph(options.projectRoot, projectMap),
    { ok: true, value: { schemaVersion: '1.0.0', updatedAt: '', edges: [], adjacency: {} } },
    'dependency-graph',
  );
  const dependencyEdges = graphResult.ok ? graphResult.value.edges.length : 0;

  // Build keyword index (fail-open)
  const indexResult = withFailOpen(
    () => buildKeywordIndex(options.projectRoot, projectMap),
    { ok: true, value: { schemaVersion: '1.0.0', updatedAt: '', keywordToFiles: {}, fileToKeywords: {} } },
    'keyword-extractor',
  );
  const keywordsExtracted = indexResult.ok
    ? Object.keys(indexResult.value.keywordToFiles).length
    : 0;

  const scanDurationMs = Date.now() - startTime;
  logger.info('scanner', `Scanned ${files.size} files in ${scanDurationMs}ms (${skipped.count} skipped)`);

  return ok({
    projectMap,
    projectType,
    filesScanned: files.size,
    filesSkipped: skipped.count,
    filesChanged: 0,
    filesNew: files.size,
    filesDeleted: 0,
    filesUnchanged: 0,
    dependencyEdges,
    keywordsExtracted,
    scanDurationMs,
  });
}

export function scanProject(options: ScanOptions): Result<ScanResult> {
  if (options.scanType === 'incremental') {
    return incrementalScan(options);
  }
  return fullScan(options);
}
