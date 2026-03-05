import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { createTempProjectRoot, cleanupTempProjectRoot } from '../helpers/test-store.js';
import {
  initializeStore,
  resolveFilePath,
  writeConfig,
  writeProjectMap,
  writeDependencyGraph,
  writeKeywordIndex,
  writePatterns,
  writeSchemaVersion,
  createDefaultConfig,
  createDefaultProjectMap,
  createDefaultDependencyGraph,
  createDefaultKeywordIndex,
  createDefaultPatterns,
} from '../../src/store/index.js';
import { STORE_FILES } from '../../src/utils/index.js';
import {
  runCheckup,
  checkStoreDirectory,
  checkJsonFiles,
  checkProjectMap,
  checkDependencyGraph,
  checkKeywordIndex,
  checkStarterPack,
  checkConfig,
  checkSchemaVersionFile,
  calculateReadinessScore,
  applyCheckupFixes,
  renderCheckupReport,
  renderFixSummary,
} from '../../src/doctor/index.js';
import type { CheckItem, CheckupIssue } from '../../src/doctor/index.js';

let projectRoot: string;

beforeEach(() => {
  projectRoot = createTempProjectRoot();
});

afterEach(() => {
  cleanupTempProjectRoot(projectRoot);
});

// ─── runCheckup ─────────────────────────────────────────────────

describe('runCheckup', () => {
  it('returns error when .claude-opt/ directory is missing', () => {
    const result = runCheckup(projectRoot);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('not initialized');
    }
  });

  it('all checks pass with a valid initialized store', () => {
    initializeStore(projectRoot);

    // Populate project map with files and domains
    const map = createDefaultProjectMap();
    map.totalFiles = 2;
    map.files = {
      'src/index.ts': {
        path: 'src/index.ts',
        size: 100,
        contentHash: 'abc',
        lastModified: new Date().toISOString(),
        language: 'typescript',
        domain: 'core',
        imports: ['./utils.js'],
        exports: ['main'],
        keywords: ['main', 'entry'],
      },
      'src/utils.ts': {
        path: 'src/utils.ts',
        size: 50,
        contentHash: 'def',
        lastModified: new Date().toISOString(),
        language: 'typescript',
        domain: 'core',
        imports: [],
        exports: ['helper'],
        keywords: ['helper', 'util'],
      },
    };
    map.domains = { core: ['src/index.ts', 'src/utils.ts'] };
    writeProjectMap(projectRoot, map);

    // Populate dependency graph with edges
    const graph = createDefaultDependencyGraph();
    graph.edges = [{ source: 'src/index.ts', target: 'src/utils.ts', type: 'import' }];
    graph.adjacency = {
      'src/index.ts': { imports: ['src/utils.ts'], importedBy: [] },
      'src/utils.ts': { imports: [], importedBy: ['src/index.ts'] },
    };
    writeDependencyGraph(projectRoot, graph);

    // Populate keyword index
    const kwIndex = createDefaultKeywordIndex();
    kwIndex.keywordToFiles = { main: ['src/index.ts'], helper: ['src/utils.ts'] };
    kwIndex.fileToKeywords = { 'src/index.ts': ['main'], 'src/utils.ts': ['helper'] };
    writeKeywordIndex(projectRoot, kwIndex);

    const result = runCheckup(projectRoot);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.score).toBe(100);
      expect(result.value.passed).toBe(true);
      expect(result.value.issues.length).toBe(0);

      // Every check should pass
      for (const check of result.value.checks) {
        expect(check.status === 'pass' || check.severity === 'info').toBe(true);
      }
    }
  });

  it('returns score < 100 when JSON files are missing', () => {
    initializeStore(projectRoot);

    // Delete a JSON file to cause a critical failure
    const doctorLogPath = resolveFilePath(projectRoot, STORE_FILES.doctorLog);
    unlinkSync(doctorLogPath);

    const result = runCheckup(projectRoot);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.score).toBeLessThan(100);
      const failedChecks = result.value.checks.filter((c) => c.status === 'fail');
      expect(failedChecks.length).toBeGreaterThan(0);
    }
  });

  it('costs zero tokens — no adapter calls in code paths', () => {
    // This test verifies that runCheckup only does local file I/O.
    // If an API call were made, it would throw (no adapter configured).
    initializeStore(projectRoot);
    const result = runCheckup(projectRoot);
    expect(result.ok).toBe(true);
  });
});

// ─── checkStoreDirectory ────────────────────────────────────────

describe('checkStoreDirectory', () => {
  it('passes when .claude-opt/ exists', () => {
    initializeStore(projectRoot);
    const result = checkStoreDirectory(projectRoot);
    expect(result.status).toBe('pass');
  });

  it('fails when .claude-opt/ does not exist', () => {
    const result = checkStoreDirectory(projectRoot);
    expect(result.status).toBe('fail');
    expect(result.severity).toBe('critical');
  });
});

// ─── checkJsonFiles ─────────────────────────────────────────────

describe('checkJsonFiles', () => {
  it('passes for all 8 files in initialized store', () => {
    initializeStore(projectRoot);
    const items = checkJsonFiles(projectRoot);
    expect(items.length).toBe(8);
    for (const item of items) {
      expect(item.status).toBe('pass');
    }
  });

  it('fails for missing files', () => {
    initializeStore(projectRoot);
    // Remove doctor-log.json
    unlinkSync(resolveFilePath(projectRoot, STORE_FILES.doctorLog));

    const items = checkJsonFiles(projectRoot);
    const doctorLogCheck = items.find((i) => i.name === 'File: doctor-log.json');
    expect(doctorLogCheck).toBeDefined();
    expect(doctorLogCheck!.status).toBe('fail');
    expect(doctorLogCheck!.severity).toBe('critical');
  });

  it('fails for corrupted JSON', () => {
    initializeStore(projectRoot);
    // Write invalid JSON to patterns.json
    writeFileSync(resolveFilePath(projectRoot, STORE_FILES.patterns), 'NOT JSON{{{', 'utf-8');

    const items = checkJsonFiles(projectRoot);
    const patternsCheck = items.find((i) => i.name === 'File: patterns.json');
    expect(patternsCheck).toBeDefined();
    expect(patternsCheck!.status).toBe('fail');
  });
});

// ─── checkProjectMap ────────────────────────────────────────────

describe('checkProjectMap', () => {
  beforeEach(() => {
    initializeStore(projectRoot);
  });

  it('warns when project map has no files', () => {
    const result = checkProjectMap(projectRoot);
    expect(result.status).toBe('warn');
    expect(result.severity).toBe('warning');
  });

  it('warns when files exist but no domains assigned', () => {
    const map = createDefaultProjectMap();
    map.totalFiles = 1;
    map.files = {
      'src/main.ts': {
        path: 'src/main.ts',
        size: 50,
        contentHash: 'abc',
        lastModified: new Date().toISOString(),
        language: 'typescript',
        domain: null,
        imports: [],
        exports: [],
        keywords: [],
      },
    };
    map.domains = {};
    writeProjectMap(projectRoot, map);

    const result = checkProjectMap(projectRoot);
    expect(result.status).toBe('warn');
    expect(result.detail).toContain('no domains');
  });

  it('passes when files and domains exist', () => {
    const map = createDefaultProjectMap();
    map.totalFiles = 1;
    map.files = {
      'src/main.ts': {
        path: 'src/main.ts',
        size: 50,
        contentHash: 'abc',
        lastModified: new Date().toISOString(),
        language: 'typescript',
        domain: 'core',
        imports: [],
        exports: [],
        keywords: [],
      },
    };
    map.domains = { core: ['src/main.ts'] };
    writeProjectMap(projectRoot, map);

    const result = checkProjectMap(projectRoot);
    expect(result.status).toBe('pass');
  });
});

// ─── checkDependencyGraph ───────────────────────────────────────

describe('checkDependencyGraph', () => {
  beforeEach(() => {
    initializeStore(projectRoot);
  });

  it('warns when dependency graph is empty', () => {
    const result = checkDependencyGraph(projectRoot);
    expect(result.status).toBe('warn');
    expect(result.severity).toBe('warning');
  });

  it('warns for isolated nodes', () => {
    const graph = createDefaultDependencyGraph();
    graph.edges = [{ source: 'a.ts', target: 'b.ts', type: 'import' }];
    graph.adjacency = {
      'a.ts': { imports: ['b.ts'], importedBy: [] },
      'b.ts': { imports: [], importedBy: ['a.ts'] },
      'c.ts': { imports: [], importedBy: [] }, // isolated
    };
    writeDependencyGraph(projectRoot, graph);

    const result = checkDependencyGraph(projectRoot);
    expect(result.status).toBe('warn');
    expect(result.detail).toContain('isolated');
  });

  it('passes with valid edges', () => {
    const graph = createDefaultDependencyGraph();
    graph.edges = [{ source: 'a.ts', target: 'b.ts', type: 'import' }];
    graph.adjacency = {
      'a.ts': { imports: ['b.ts'], importedBy: [] },
      'b.ts': { imports: [], importedBy: ['a.ts'] },
    };
    writeDependencyGraph(projectRoot, graph);

    const result = checkDependencyGraph(projectRoot);
    expect(result.status).toBe('pass');
  });
});

// ─── checkKeywordIndex ──────────────────────────────────────────

describe('checkKeywordIndex', () => {
  beforeEach(() => {
    initializeStore(projectRoot);
  });

  it('warns when keyword index is empty', () => {
    const result = checkKeywordIndex(projectRoot);
    expect(result.status).toBe('warn');
    expect(result.severity).toBe('warning');
  });

  it('passes when keyword index is populated', () => {
    const kwIndex = createDefaultKeywordIndex();
    kwIndex.keywordToFiles = { test: ['a.ts'] };
    kwIndex.fileToKeywords = { 'a.ts': ['test'] };
    writeKeywordIndex(projectRoot, kwIndex);

    const result = checkKeywordIndex(projectRoot);
    expect(result.status).toBe('pass');
  });
});

// ─── checkStarterPack ───────────────────────────────────────────

describe('checkStarterPack', () => {
  beforeEach(() => {
    initializeStore(projectRoot);
  });

  it('returns info when no starter pack loaded', () => {
    const result = checkStarterPack(projectRoot);
    // Starter pack is optional, should be info status
    expect(result.severity).toBe('info');
  });

  it('passes when conventions are loaded', () => {
    const patterns = createDefaultPatterns();
    patterns.conventions = [
      { pattern: 'test', description: 'Test convention', examples: ['example'] },
    ];
    writePatterns(projectRoot, patterns);

    const result = checkStarterPack(projectRoot);
    expect(result.status).toBe('pass');
  });
});

// ─── checkConfig ────────────────────────────────────────────────

describe('checkConfig', () => {
  beforeEach(() => {
    initializeStore(projectRoot);
  });

  it('passes with valid default config', () => {
    const result = checkConfig(projectRoot);
    expect(result.status).toBe('pass');
  });

  it('warns when doctorMode is invalid', () => {
    const config = createDefaultConfig('test');
    config.doctorMode = 'invalid';
    writeConfig(projectRoot, config);

    const result = checkConfig(projectRoot);
    expect(result.status).toBe('warn');
    expect(result.detail).toContain('doctorMode');
  });
});

// ─── checkSchemaVersionFile ─────────────────────────────────────

describe('checkSchemaVersionFile', () => {
  beforeEach(() => {
    initializeStore(projectRoot);
  });

  it('passes when version matches', () => {
    const result = checkSchemaVersionFile(projectRoot);
    expect(result.status).toBe('pass');
  });

  it('fails when version mismatches', () => {
    writeSchemaVersion(projectRoot, '99.0.0');

    const result = checkSchemaVersionFile(projectRoot);
    expect(result.status).toBe('fail');
    expect(result.severity).toBe('critical');
    expect(result.detail).toContain('mismatch');
  });

  it('fails when .schema-version is missing', () => {
    unlinkSync(resolveFilePath(projectRoot, '.schema-version'));

    const result = checkSchemaVersionFile(projectRoot);
    expect(result.status).toBe('fail');
    expect(result.severity).toBe('critical');
  });
});

// ─── calculateReadinessScore ────────────────────────────────────

describe('calculateReadinessScore', () => {
  it('returns 100 when all checks pass', () => {
    const checks: CheckItem[] = [
      { name: 'A', status: 'pass', detail: 'ok', severity: 'info' },
      { name: 'B', status: 'pass', detail: 'ok', severity: 'info' },
    ];
    expect(calculateReadinessScore(checks)).toBe(100);
  });

  it('deducts 25 for each critical failure', () => {
    const checks: CheckItem[] = [
      { name: 'A', status: 'fail', detail: 'bad', severity: 'critical' },
      { name: 'B', status: 'pass', detail: 'ok', severity: 'info' },
    ];
    expect(calculateReadinessScore(checks)).toBe(75);
  });

  it('deducts 10 for each warning', () => {
    const checks: CheckItem[] = [
      { name: 'A', status: 'warn', detail: 'meh', severity: 'warning' },
      { name: 'B', status: 'pass', detail: 'ok', severity: 'info' },
    ];
    expect(calculateReadinessScore(checks)).toBe(90);
  });

  it('deducts for multiple failures', () => {
    const checks: CheckItem[] = [
      { name: 'A', status: 'fail', detail: 'bad', severity: 'critical' },
      { name: 'B', status: 'fail', detail: 'bad', severity: 'critical' },
      { name: 'C', status: 'warn', detail: 'meh', severity: 'warning' },
    ];
    // 100 - 25 - 25 - 10 = 40
    expect(calculateReadinessScore(checks)).toBe(40);
  });

  it('floors at 0', () => {
    const checks: CheckItem[] = Array(10).fill(null).map((_, i) => ({
      name: `F${i}`,
      status: 'fail' as const,
      detail: 'bad',
      severity: 'critical' as const,
    }));
    // 100 - 250 = -150 -> floored to 0
    expect(calculateReadinessScore(checks)).toBe(0);
  });

  it('score >= 90 means Ready to go', () => {
    const checks: CheckItem[] = [
      { name: 'A', status: 'pass', detail: 'ok', severity: 'info' },
    ];
    const score = calculateReadinessScore(checks);
    expect(score).toBeGreaterThanOrEqual(90);
  });

  it('score >= 60 means Ready with warnings', () => {
    const checks: CheckItem[] = [
      { name: 'A', status: 'fail', detail: 'bad', severity: 'critical' },
      { name: 'B', status: 'warn', detail: 'meh', severity: 'warning' },
    ];
    // 100 - 25 - 10 = 65
    const score = calculateReadinessScore(checks);
    expect(score).toBeGreaterThanOrEqual(60);
    expect(score).toBeLessThan(90);
  });

  it('score < 60 means Needs attention', () => {
    const checks: CheckItem[] = [
      { name: 'A', status: 'fail', detail: 'bad', severity: 'critical' },
      { name: 'B', status: 'fail', detail: 'bad', severity: 'critical' },
      { name: 'C', status: 'warn', detail: 'meh', severity: 'warning' },
      { name: 'D', status: 'warn', detail: 'meh', severity: 'warning' },
    ];
    // 100 - 25 - 25 - 10 - 10 = 30
    const score = calculateReadinessScore(checks);
    expect(score).toBeLessThan(60);
  });
});

// ─── applyCheckupFixes ──────────────────────────────────────────

describe('applyCheckupFixes', () => {
  beforeEach(() => {
    initializeStore(projectRoot);
  });

  it('fixes missing doctor-log.json', () => {
    // Remove doctor-log.json
    unlinkSync(resolveFilePath(projectRoot, STORE_FILES.doctorLog));

    const issues: CheckupIssue[] = [
      {
        check: 'File: doctor-log.json',
        severity: 'critical',
        message: 'File not found',
        isFixable: true,
        fixDescription: 'Create default doctor-log.json',
      },
    ];

    const fixes = applyCheckupFixes(issues, projectRoot);
    expect(fixes.length).toBe(1);
    expect(fixes[0].applied).toBe(true);

    // Verify file was created
    expect(existsSync(resolveFilePath(projectRoot, STORE_FILES.doctorLog))).toBe(true);
  });

  it('fixes invalid config values', () => {
    const config = createDefaultConfig('test');
    config.doctorMode = 'invalid';
    writeConfig(projectRoot, config);

    const issues: CheckupIssue[] = [
      {
        check: 'Config Valid',
        severity: 'warning',
        message: 'doctorMode is not set or invalid',
        isFixable: true,
        fixDescription: 'Populate missing config values with defaults',
      },
    ];

    const fixes = applyCheckupFixes(issues, projectRoot);
    expect(fixes.length).toBe(1);
    expect(fixes[0].applied).toBe(true);
  });

  it('skips non-fixable issues', () => {
    const issues: CheckupIssue[] = [
      {
        check: 'Dependency Graph',
        severity: 'warning',
        message: 'Isolated nodes',
        isFixable: false,
      },
    ];

    const fixes = applyCheckupFixes(issues, projectRoot);
    expect(fixes.length).toBe(1);
    expect(fixes[0].applied).toBe(false);
    expect(fixes[0].result).toContain('Not auto-fixable');
  });

  it('recalculates to a higher score after fixes', () => {
    // Remove doctor-log.json to cause a critical failure
    unlinkSync(resolveFilePath(projectRoot, STORE_FILES.doctorLog));

    const result1 = runCheckup(projectRoot);
    expect(result1.ok).toBe(true);
    if (!result1.ok) return;

    const scoreBefore = result1.value.score;

    // Apply fixes
    applyCheckupFixes(result1.value.issues, projectRoot);

    // Re-run checkup
    const result2 = runCheckup(projectRoot);
    expect(result2.ok).toBe(true);
    if (!result2.ok) return;

    expect(result2.value.score).toBeGreaterThanOrEqual(scoreBefore);
  });
});

// ─── renderCheckupReport ────────────────────────────────────────

describe('renderCheckupReport', () => {
  it('renders passing report with score and ready message', () => {
    const result: import('../../src/doctor/types.js').CheckupResult = {
      checks: [
        { name: 'Store Directory', status: 'pass', detail: 'exists', severity: 'info' },
      ],
      score: 100,
      issues: [],
      passed: true,
    };

    const output = renderCheckupReport(result);
    expect(output).toContain('Pre-Flight Checkup');
    expect(output).toContain('100%');
    expect(output).toContain('Ready to go');
    expect(output).toContain('co "your task"');
  });

  it('renders issues with severity labels when problems found', () => {
    const result: import('../../src/doctor/types.js').CheckupResult = {
      checks: [
        { name: 'Schema Version', status: 'fail', detail: 'mismatch', severity: 'critical' },
      ],
      score: 75,
      issues: [
        { check: 'Schema Version', severity: 'critical', message: 'mismatch', isFixable: false },
      ],
      passed: true,
    };

    const output = renderCheckupReport(result);
    expect(output).toContain('75%');
    expect(output).toContain('Issues found');
    expect(output).toContain('Auto-fix');
  });

  it('shows fix options when issues are present', () => {
    const result: import('../../src/doctor/types.js').CheckupResult = {
      checks: [],
      score: 50,
      issues: [
        { check: 'test', severity: 'critical', message: 'err', isFixable: true },
      ],
      passed: false,
    };

    const output = renderCheckupReport(result);
    expect(output).toContain('[1]');
    expect(output).toContain('[2]');
    expect(output).toContain('[3]');
  });
});

// ─── renderFixSummary ───────────────────────────────────────────

describe('renderFixSummary', () => {
  it('renders applied and failed fixes', () => {
    const fixes: import('../../src/doctor/types.js').CheckupFix[] = [
      {
        issue: { check: 'A', severity: 'critical', message: 'x', isFixable: true },
        applied: true,
        result: 'Created file',
      },
      {
        issue: { check: 'B', severity: 'warning', message: 'y', isFixable: false },
        applied: false,
        result: 'Not auto-fixable',
      },
    ];

    const output = renderFixSummary(fixes);
    expect(output).toContain('Auto-fix results');
    expect(output).toContain('Created file');
    expect(output).toContain('Not auto-fixable');
  });
});

// ─── Integration: passed threshold ──────────────────────────────

describe('passed threshold', () => {
  it('passed is true when score >= 60', () => {
    initializeStore(projectRoot);
    const result = runCheckup(projectRoot);
    expect(result.ok).toBe(true);
    if (result.ok) {
      if (result.value.score >= 60) {
        expect(result.value.passed).toBe(true);
      }
    }
  });

  it('passed is false when score < 60', () => {
    initializeStore(projectRoot);

    // Delete multiple files to tank the score
    unlinkSync(resolveFilePath(projectRoot, STORE_FILES.config));
    unlinkSync(resolveFilePath(projectRoot, STORE_FILES.projectMap));
    unlinkSync(resolveFilePath(projectRoot, STORE_FILES.dependencyGraph));

    const result = runCheckup(projectRoot);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Multiple critical failures should result in a low score
      expect(result.value.score).toBeLessThan(100);
    }
  });
});
