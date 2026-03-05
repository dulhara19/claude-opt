import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { scanProject } from '../../src/scanner/scanner.js';
import { createTempProjectRoot, cleanupTempProjectRoot } from '../helpers/test-store.js';
import { initializeStore, ensureStoreDir, resolveStorePath, readProjectMap, readDependencyGraph, readKeywordIndex, readPatterns, readTaskHistory, readMetrics } from '../../src/store/index.js';
import { detectProjectStack, loadStarterPack, applyStarterPack } from '../../src/scanner/starter-packs.js';
import { generateClaudeMd } from '../../src/scanner/claudemd-generator.js';

function createTsProject(root: string) {
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'test', dependencies: {} }));
  writeFileSync(path.join(root, 'tsconfig.json'), '{}');
  mkdirSync(path.join(root, 'src'), { recursive: true });
  writeFileSync(path.join(root, 'src', 'index.ts'), `import { utils } from './utils';\nexport function main() {}\n`);
  writeFileSync(path.join(root, 'src', 'utils.ts'), `export function utils() { return 42; }\n`);
}

describe('init flow integration', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = createTempProjectRoot();
    createTsProject(projectRoot);
  });

  afterEach(() => {
    cleanupTempProjectRoot(projectRoot);
  });

  it('should create all store files on full init', () => {
    ensureStoreDir(projectRoot);
    initializeStore(projectRoot);

    const storePath = resolveStorePath(projectRoot);
    expect(existsSync(storePath)).toBe(true);
    expect(existsSync(path.join(storePath, 'config.json'))).toBe(true);
    expect(existsSync(path.join(storePath, 'project-map.json'))).toBe(true);
    expect(existsSync(path.join(storePath, 'task-history.json'))).toBe(true);
    expect(existsSync(path.join(storePath, 'patterns.json'))).toBe(true);
    expect(existsSync(path.join(storePath, 'metrics.json'))).toBe(true);
  });

  it('should produce valid project-map.json after scan', () => {
    ensureStoreDir(projectRoot);
    initializeStore(projectRoot);

    const scanResult = scanProject({ projectRoot, scanType: 'full' });
    expect(scanResult.ok).toBe(true);

    const pmResult = readProjectMap(projectRoot);
    expect(pmResult.ok).toBe(true);
    if (!pmResult.ok) return;
    expect(pmResult.value.totalFiles).toBeGreaterThan(0);
    expect(pmResult.value.files['src/index.ts']).toBeDefined();
  });

  it('should produce valid dependency-graph.json after scan', () => {
    ensureStoreDir(projectRoot);
    initializeStore(projectRoot);

    scanProject({ projectRoot, scanType: 'full' });

    const graphResult = readDependencyGraph(projectRoot);
    expect(graphResult.ok).toBe(true);
    if (!graphResult.ok) return;
    expect(graphResult.value.edges.length).toBeGreaterThan(0);
  });

  it('should produce valid keyword-index.json after scan', () => {
    ensureStoreDir(projectRoot);
    initializeStore(projectRoot);

    scanProject({ projectRoot, scanType: 'full' });

    const indexResult = readKeywordIndex(projectRoot);
    expect(indexResult.ok).toBe(true);
    if (!indexResult.ok) return;
    expect(Object.keys(indexResult.value.keywordToFiles).length).toBeGreaterThan(0);
  });

  it('should generate CLAUDE.md after init', () => {
    ensureStoreDir(projectRoot);
    initializeStore(projectRoot);

    const scanResult = scanProject({ projectRoot, scanType: 'full' });
    expect(scanResult.ok).toBe(true);
    if (!scanResult.ok) return;

    const graphResult = readDependencyGraph(projectRoot);
    const depGraph = graphResult.ok
      ? graphResult.value
      : { schemaVersion: '1.0.0', updatedAt: '', edges: [], adjacency: {} };

    generateClaudeMd(projectRoot, scanResult.value.projectMap, depGraph);

    const claudeMdPath = path.join(projectRoot, 'CLAUDE.md');
    expect(existsSync(claudeMdPath)).toBe(true);
    const content = readFileSync(claudeMdPath, 'utf-8');
    expect(content).toContain('claude-opt:start');
  });

  it('should detect typescript-node and load starter pack', () => {
    ensureStoreDir(projectRoot);
    initializeStore(projectRoot);

    const scanResult = scanProject({ projectRoot, scanType: 'full' });
    expect(scanResult.ok).toBe(true);
    if (!scanResult.ok) return;

    const stack = detectProjectStack(projectRoot, scanResult.value.projectMap);
    expect(stack).toBe('typescript-node');

    const packResult = loadStarterPack(stack!);
    expect(packResult.ok).toBe(true);
    if (!packResult.ok) return;

    applyStarterPack(projectRoot, packResult.value);

    const patternsResult = readPatterns(projectRoot);
    expect(patternsResult.ok).toBe(true);
    if (!patternsResult.ok) return;
    expect(patternsResult.value.conventions.length).toBeGreaterThan(0);
  });

  it('should preserve task history on re-init (incremental scan)', () => {
    ensureStoreDir(projectRoot);
    initializeStore(projectRoot);

    // Do full scan first
    scanProject({ projectRoot, scanType: 'full' });

    // Verify task history exists
    const historyBefore = readTaskHistory(projectRoot);
    expect(historyBefore.ok).toBe(true);

    // Do incremental scan (re-init)
    const incResult = scanProject({ projectRoot, scanType: 'incremental' });
    expect(incResult.ok).toBe(true);

    // Task history should still be intact
    const historyAfter = readTaskHistory(projectRoot);
    expect(historyAfter.ok).toBe(true);
  });

  it('should preserve metrics on re-init (incremental scan)', () => {
    ensureStoreDir(projectRoot);
    initializeStore(projectRoot);

    scanProject({ projectRoot, scanType: 'full' });

    const metricsBefore = readMetrics(projectRoot);
    expect(metricsBefore.ok).toBe(true);

    scanProject({ projectRoot, scanType: 'incremental' });

    const metricsAfter = readMetrics(projectRoot);
    expect(metricsAfter.ok).toBe(true);
  });

  it('should run incremental scan on re-init (not full reset)', () => {
    ensureStoreDir(projectRoot);
    initializeStore(projectRoot);

    scanProject({ projectRoot, scanType: 'full' });

    // Incremental scan should detect no changes
    const incResult = scanProject({ projectRoot, scanType: 'incremental' });
    expect(incResult.ok).toBe(true);
    if (!incResult.ok) return;
    expect(incResult.value.filesChanged).toBe(0);
    expect(incResult.value.filesUnchanged).toBeGreaterThan(0);
  });
});
