import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Result, ProjectMap, DependencyGraph, DependencyEdge, AdjacencyEntry } from '../types/index.js';
import { ok, err, toOS, logger } from '../utils/index.js';
import { writeDependencyGraph, readDependencyGraph } from '../store/index.js';
import { getParserForFile } from './parsers/index.js';

const VERSION = '1.0.0';

export function buildDependencyGraph(
  projectRoot: string,
  projectMap: ProjectMap,
): Result<DependencyGraph> {
  const edges: DependencyEdge[] = [];
  const adjacency: Record<string, AdjacencyEntry> = {};

  const ensureEntry = (filePath: string): AdjacencyEntry => {
    if (!adjacency[filePath]) {
      adjacency[filePath] = { imports: [], importedBy: [] };
    }
    return adjacency[filePath];
  };

  let parsedCount = 0;

  for (const [filePath] of Object.entries(projectMap.files)) {
    const parser = getParserForFile(filePath);
    if (!parser) continue;

    let content: string;
    try {
      content = readFileSync(path.join(toOS(projectRoot), filePath), 'utf-8');
    } catch {
      logger.debug('dependency-graph', `Could not read file: ${filePath}`);
      continue;
    }

    const imports = parser.parseImports(filePath, content, projectRoot);
    parsedCount++;

    for (const imp of imports) {
      if (imp.isExternal || !imp.resolved) continue;

      // Map 'require' to 'import' type for the graph edge
      const edgeType = imp.type === 'require' ? 'import' : imp.type;

      edges.push({
        source: filePath,
        target: imp.resolved,
        type: edgeType,
      });

      const sourceEntry = ensureEntry(filePath);
      const targetEntry = ensureEntry(imp.resolved);

      if (!sourceEntry.imports.includes(imp.resolved)) {
        sourceEntry.imports.push(imp.resolved);
      }
      if (!targetEntry.importedBy.includes(filePath)) {
        targetEntry.importedBy.push(filePath);
      }
    }
  }

  const graph: DependencyGraph = {
    schemaVersion: VERSION,
    updatedAt: new Date().toISOString(),
    edges,
    adjacency,
  };

  const writeResult = writeDependencyGraph(projectRoot, graph);
  if (!writeResult.ok) {
    logger.error('dependency-graph', 'Failed to write dependency graph', writeResult.error);
    return err(writeResult.error);
  }

  logger.info('dependency-graph', `Built graph: ${edges.length} edges from ${parsedCount} files`);
  return ok(graph);
}

export function updateDependencyGraph(
  projectRoot: string,
  changedFiles: string[],
  deletedFiles: string[],
  projectMap: ProjectMap,
): Result<DependencyGraph> {
  const existingResult = readDependencyGraph(projectRoot);
  if (!existingResult.ok) {
    // No existing graph — do full build
    return buildDependencyGraph(projectRoot, projectMap);
  }

  const existing = existingResult.value;
  const affectedSet = new Set([...changedFiles, ...deletedFiles]);

  // Remove edges where affected files are source or target
  const edges = existing.edges.filter(
    (e) => !affectedSet.has(e.source) && !affectedSet.has(e.target),
  );

  // Remove affected files from adjacency
  const adjacency: Record<string, AdjacencyEntry> = {};
  for (const [filePath, entry] of Object.entries(existing.adjacency)) {
    if (affectedSet.has(filePath)) continue;
    adjacency[filePath] = {
      imports: entry.imports.filter((f) => !affectedSet.has(f)),
      importedBy: entry.importedBy.filter((f) => !affectedSet.has(f)),
    };
  }

  const ensureEntry = (filePath: string): AdjacencyEntry => {
    if (!adjacency[filePath]) {
      adjacency[filePath] = { imports: [], importedBy: [] };
    }
    return adjacency[filePath];
  };

  // Re-parse changed/new files
  for (const filePath of changedFiles) {
    const parser = getParserForFile(filePath);
    if (!parser) continue;

    let content: string;
    try {
      content = readFileSync(path.join(toOS(projectRoot), filePath), 'utf-8');
    } catch {
      continue;
    }

    const imports = parser.parseImports(filePath, content, projectRoot);

    for (const imp of imports) {
      if (imp.isExternal || !imp.resolved) continue;

      const edgeType = imp.type === 'require' ? 'import' : imp.type;
      edges.push({ source: filePath, target: imp.resolved, type: edgeType });

      const sourceEntry = ensureEntry(filePath);
      const targetEntry = ensureEntry(imp.resolved);

      if (!sourceEntry.imports.includes(imp.resolved)) {
        sourceEntry.imports.push(imp.resolved);
      }
      if (!targetEntry.importedBy.includes(filePath)) {
        targetEntry.importedBy.push(filePath);
      }
    }
  }

  const graph: DependencyGraph = {
    schemaVersion: VERSION,
    updatedAt: new Date().toISOString(),
    edges,
    adjacency,
  };

  const writeResult = writeDependencyGraph(projectRoot, graph);
  if (!writeResult.ok) {
    logger.error('dependency-graph', 'Failed to write dependency graph', writeResult.error);
    return err(writeResult.error);
  }

  logger.info('dependency-graph', `Updated graph: ${edges.length} edges (${changedFiles.length} changed, ${deletedFiles.length} deleted)`);
  return ok(graph);
}
