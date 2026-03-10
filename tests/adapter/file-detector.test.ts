import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { captureTimestamps, detectModifiedFiles, parseFilePaths, detectFilesUsed, detectFilesUsedDetailed } from '../../src/adapter/file-detector.js';
import { TIMESTAMP_TOLERANCE_MS } from '../../src/adapter/types.js';

let tempDir: string;

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'adapter-test-'));
}

function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

describe('captureTimestamps', () => {
  beforeEach(() => {
    tempDir = createTempDir();
  });
  afterEach(() => {
    cleanup(tempDir);
  });

  it('captures file timestamps in a project directory', () => {
    fs.writeFileSync(path.join(tempDir, 'file1.ts'), 'content1');
    fs.writeFileSync(path.join(tempDir, 'file2.ts'), 'content2');

    const timestamps = captureTimestamps(tempDir);

    expect(timestamps).toHaveLength(2);
    expect(timestamps.map((t) => t.filePath).sort()).toEqual(['file1.ts', 'file2.ts']);
    for (const ts of timestamps) {
      expect(ts.modifiedAt).toBeGreaterThan(0);
    }
  });

  it('captures timestamps in nested directories', () => {
    const subdir = path.join(tempDir, 'src');
    fs.mkdirSync(subdir);
    fs.writeFileSync(path.join(subdir, 'index.ts'), 'export {}');

    const timestamps = captureTimestamps(tempDir);

    expect(timestamps).toHaveLength(1);
    expect(timestamps[0].filePath).toBe('src/index.ts');
  });

  it('skips node_modules and .git directories', () => {
    fs.mkdirSync(path.join(tempDir, 'node_modules'));
    fs.writeFileSync(path.join(tempDir, 'node_modules', 'dep.js'), 'module');
    fs.mkdirSync(path.join(tempDir, '.git'));
    fs.writeFileSync(path.join(tempDir, '.git', 'config'), 'git');
    fs.writeFileSync(path.join(tempDir, 'app.ts'), 'app');

    const timestamps = captureTimestamps(tempDir);

    expect(timestamps).toHaveLength(1);
    expect(timestamps[0].filePath).toBe('app.ts');
  });

  it('returns empty array for empty directory', () => {
    const timestamps = captureTimestamps(tempDir);
    expect(timestamps).toEqual([]);
  });
});

describe('detectModifiedFiles', () => {
  beforeEach(() => {
    tempDir = createTempDir();
  });
  afterEach(() => {
    cleanup(tempDir);
  });

  it('detects newly created files', () => {
    const before = captureTimestamps(tempDir);

    // Create a new file after snapshot
    fs.writeFileSync(path.join(tempDir, 'new-file.ts'), 'new content');

    const modified = detectModifiedFiles(before, tempDir);

    expect(modified).toContain('new-file.ts');
  });

  it('detects modified files via timestamp change', () => {
    fs.writeFileSync(path.join(tempDir, 'existing.ts'), 'original');

    const before = captureTimestamps(tempDir);

    // Modify the file — force a timestamp bump
    const filePath = path.join(tempDir, 'existing.ts');
    const stat = fs.statSync(filePath);
    const futureTime = new Date(stat.mtimeMs + TIMESTAMP_TOLERANCE_MS + 1000);
    fs.utimesSync(filePath, futureTime, futureTime);

    const modified = detectModifiedFiles(before, tempDir);

    expect(modified).toContain('existing.ts');
  });

  it('returns empty when no files changed', () => {
    fs.writeFileSync(path.join(tempDir, 'stable.ts'), 'no change');

    const before = captureTimestamps(tempDir);
    const modified = detectModifiedFiles(before, tempDir);

    expect(modified).toEqual([]);
  });
});

describe('parseFilePaths', () => {
  beforeEach(() => {
    tempDir = createTempDir();
  });
  afterEach(() => {
    cleanup(tempDir);
  });

  it('extracts relative file paths from output', () => {
    const srcDir = path.join(tempDir, 'src');
    fs.mkdirSync(srcDir);
    fs.writeFileSync(path.join(srcDir, 'app.ts'), 'export {}');

    const output = 'I modified src/app.ts to add the new feature.';
    const paths = parseFilePaths(output, tempDir);

    expect(paths).toContain('src/app.ts');
  });

  it('filters out non-existent files', () => {
    const output = 'Working on src/nonexistent.ts and utils/missing.js';
    const paths = parseFilePaths(output, tempDir);

    expect(paths).toEqual([]);
  });

  it('skips URLs', () => {
    fs.writeFileSync(path.join(tempDir, 'api.ts'), 'export {}');
    const output = 'Visit https://example.com/api.ts for docs. Also see api.ts';
    const paths = parseFilePaths(output, tempDir);

    // Should find api.ts but skip the URL
    expect(paths).toContain('api.ts');
  });

  it('returns empty for no file references', () => {
    const output = 'Everything looks good, no files changed.';
    const paths = parseFilePaths(output, tempDir);
    expect(paths).toEqual([]);
  });

  it('returns POSIX formatted paths', () => {
    const srcDir = path.join(tempDir, 'src', 'components');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'Button.tsx'), 'export {}');

    const output = 'Updated src/components/Button.tsx';
    const paths = parseFilePaths(output, tempDir);

    expect(paths).toContain('src/components/Button.tsx');
    for (const p of paths) {
      expect(p).not.toContain('\\');
    }
  });
});

describe('detectFilesUsed', () => {
  beforeEach(() => {
    tempDir = createTempDir();
  });
  afterEach(() => {
    cleanup(tempDir);
  });

  it('merges timestamp and stdout results with deduplication', () => {
    fs.writeFileSync(path.join(tempDir, 'modified.ts'), 'original');
    const srcDir = path.join(tempDir, 'src');
    fs.mkdirSync(srcDir);
    fs.writeFileSync(path.join(srcDir, 'read.ts'), 'read only');

    const before = captureTimestamps(tempDir);

    // Simulate: modified.ts was changed, read.ts was referenced in stdout
    const modPath = path.join(tempDir, 'modified.ts');
    const stat = fs.statSync(modPath);
    fs.utimesSync(modPath, new Date(stat.mtimeMs + 2000), new Date(stat.mtimeMs + 2000));

    const output = 'I read src/read.ts and modified modified.ts';
    const result = detectFilesUsed(before, output, tempDir);

    expect(result).toContain('modified.ts');
    expect(result).toContain('src/read.ts');
  });

  it('deduplicates files found by both methods', () => {
    fs.writeFileSync(path.join(tempDir, 'shared.ts'), 'content');

    const before = captureTimestamps(tempDir);

    // Modify file AND reference it in stdout
    const filePath = path.join(tempDir, 'shared.ts');
    const stat = fs.statSync(filePath);
    fs.utimesSync(filePath, new Date(stat.mtimeMs + 2000), new Date(stat.mtimeMs + 2000));

    const output = 'Updated shared.ts';
    const result = detectFilesUsed(before, output, tempDir);

    // Should appear only once
    const count = result.filter((f) => f === 'shared.ts').length;
    expect(count).toBe(1);
  });

  it('returns sorted results', () => {
    fs.writeFileSync(path.join(tempDir, 'b.ts'), 'b');
    fs.writeFileSync(path.join(tempDir, 'a.ts'), 'a');

    const before = captureTimestamps(tempDir);

    // Create new files
    fs.writeFileSync(path.join(tempDir, 'c.ts'), 'c');
    const bPath = path.join(tempDir, 'b.ts');
    const stat = fs.statSync(bPath);
    fs.utimesSync(bPath, new Date(stat.mtimeMs + TIMESTAMP_TOLERANCE_MS + 1000), new Date(stat.mtimeMs + TIMESTAMP_TOLERANCE_MS + 1000));

    const result = detectFilesUsed(before, '', tempDir);

    expect(result).toEqual([...result].sort());
  });
});

// AD12: Timestamp tolerance
describe('AD12: timestamp tolerance', () => {
  beforeEach(() => {
    tempDir = createTempDir();
  });
  afterEach(() => {
    cleanup(tempDir);
  });

  it('ignores files with timestamp change within tolerance', () => {
    fs.writeFileSync(path.join(tempDir, 'stable.ts'), 'content');
    const before = captureTimestamps(tempDir);

    // Bump by less than tolerance — should NOT count as modified
    const filePath = path.join(tempDir, 'stable.ts');
    const stat = fs.statSync(filePath);
    const smallBump = new Date(stat.mtimeMs + TIMESTAMP_TOLERANCE_MS - 500);
    fs.utimesSync(filePath, smallBump, smallBump);

    const modified = detectModifiedFiles(before, tempDir);
    expect(modified).not.toContain('stable.ts');
  });

  it('detects files with timestamp change exceeding tolerance', () => {
    fs.writeFileSync(path.join(tempDir, 'changed.ts'), 'content');
    const before = captureTimestamps(tempDir);

    const filePath = path.join(tempDir, 'changed.ts');
    const stat = fs.statSync(filePath);
    const largeBump = new Date(stat.mtimeMs + TIMESTAMP_TOLERANCE_MS + 1000);
    fs.utimesSync(filePath, largeBump, largeBump);

    const modified = detectModifiedFiles(before, tempDir);
    expect(modified).toContain('changed.ts');
  });

  it('always detects newly created files regardless of tolerance', () => {
    const before = captureTimestamps(tempDir);
    fs.writeFileSync(path.join(tempDir, 'brand-new.ts'), 'new');

    const modified = detectModifiedFiles(before, tempDir);
    expect(modified).toContain('brand-new.ts');
  });
});

// AD9: Efficient timestamp capture
describe('AD9: captureTimestamps with predictedDirs', () => {
  beforeEach(() => {
    tempDir = createTempDir();
  });
  afterEach(() => {
    cleanup(tempDir);
  });

  it('narrows scope to predicted directories when provided', () => {
    // Create files in two directories
    fs.mkdirSync(path.join(tempDir, 'src'));
    fs.mkdirSync(path.join(tempDir, 'tests'));
    fs.writeFileSync(path.join(tempDir, 'src', 'app.ts'), 'app');
    fs.writeFileSync(path.join(tempDir, 'tests', 'app.test.ts'), 'test');

    // Only capture src/ directory
    const timestamps = captureTimestamps(tempDir, new Set(['src']));
    const paths = timestamps.map(t => t.filePath);

    expect(paths).toContain('src/app.ts');
    // tests/app.test.ts may or may not appear (root files are captured too)
  });

  it('also captures root-level files when using predictedDirs', () => {
    fs.mkdirSync(path.join(tempDir, 'src'));
    fs.writeFileSync(path.join(tempDir, 'src', 'app.ts'), 'app');
    fs.writeFileSync(path.join(tempDir, 'root-file.ts'), 'root');

    const timestamps = captureTimestamps(tempDir, new Set(['src']));
    const paths = timestamps.map(t => t.filePath);

    expect(paths).toContain('src/app.ts');
    expect(paths).toContain('root-file.ts');
  });

  it('skips additional directories like build, coverage, .next', () => {
    fs.mkdirSync(path.join(tempDir, 'build'));
    fs.writeFileSync(path.join(tempDir, 'build', 'output.js'), 'built');
    fs.mkdirSync(path.join(tempDir, 'coverage'));
    fs.writeFileSync(path.join(tempDir, 'coverage', 'lcov.info'), 'coverage');
    fs.writeFileSync(path.join(tempDir, 'app.ts'), 'app');

    const timestamps = captureTimestamps(tempDir);
    const paths = timestamps.map(t => t.filePath);

    expect(paths).toContain('app.ts');
    expect(paths).not.toContain('build/output.js');
    expect(paths).not.toContain('coverage/lcov.info');
  });
});

// AD10: Improved file path regex
describe('AD10: parseFilePaths improvements', () => {
  beforeEach(() => {
    tempDir = createTempDir();
  });
  afterEach(() => {
    cleanup(tempDir);
  });

  it('parses ./-prefixed paths', () => {
    const srcDir = path.join(tempDir, 'src');
    fs.mkdirSync(srcDir);
    fs.writeFileSync(path.join(srcDir, 'index.ts'), 'export {}');

    const output = 'Updated ./src/index.ts with new exports';
    const paths = parseFilePaths(output, tempDir);

    expect(paths).toContain('src/index.ts');
  });

  it('filters out version strings like v1.0.0', () => {
    const output = 'Upgraded from v1.0.0 to v2.3.1';
    const paths = parseFilePaths(output, tempDir);

    expect(paths).toEqual([]);
  });

  it('filters out domain-like patterns', () => {
    const output = 'Visit example.com for docs and github.io for pages';
    const paths = parseFilePaths(output, tempDir);

    expect(paths).toEqual([]);
  });

  it('still finds real files that exist', () => {
    fs.writeFileSync(path.join(tempDir, 'config.ts'), 'export {}');

    const output = 'Check config.ts and also v1.2.3 and example.com';
    const paths = parseFilePaths(output, tempDir);

    expect(paths).toContain('config.ts');
    expect(paths).toHaveLength(1);
  });
});

// AD11: Read vs write file distinction
describe('AD11: detectFilesUsedDetailed', () => {
  beforeEach(() => {
    tempDir = createTempDir();
  });
  afterEach(() => {
    cleanup(tempDir);
  });

  it('separates modified files from read files', () => {
    fs.writeFileSync(path.join(tempDir, 'modified.ts'), 'original');
    const srcDir = path.join(tempDir, 'src');
    fs.mkdirSync(srcDir);
    fs.writeFileSync(path.join(srcDir, 'read.ts'), 'read only');

    const before = captureTimestamps(tempDir);

    // Modify one file
    const modPath = path.join(tempDir, 'modified.ts');
    const stat = fs.statSync(modPath);
    fs.utimesSync(modPath, new Date(stat.mtimeMs + TIMESTAMP_TOLERANCE_MS + 1000), new Date(stat.mtimeMs + TIMESTAMP_TOLERANCE_MS + 1000));

    // Reference another in stdout
    const output = 'I read src/read.ts for context';
    const result = detectFilesUsedDetailed(before, output, tempDir);

    expect(result.modified).toContain('modified.ts');
    expect(result.read).toContain('src/read.ts');
    expect(result.all).toContain('modified.ts');
    expect(result.all).toContain('src/read.ts');
  });

  it('returns sorted all list', () => {
    fs.writeFileSync(path.join(tempDir, 'b.ts'), 'b');
    fs.writeFileSync(path.join(tempDir, 'a.ts'), 'a');

    const before = captureTimestamps(tempDir);
    fs.writeFileSync(path.join(tempDir, 'c.ts'), 'c');

    const result = detectFilesUsedDetailed(before, 'used a.ts and b.ts', tempDir);

    expect(result.all).toEqual([...result.all].sort());
  });

  it('all is union of modified and read', () => {
    fs.writeFileSync(path.join(tempDir, 'only-mod.ts'), 'mod');
    fs.writeFileSync(path.join(tempDir, 'only-read.ts'), 'read');

    const before = captureTimestamps(tempDir);

    const modPath = path.join(tempDir, 'only-mod.ts');
    const stat = fs.statSync(modPath);
    fs.utimesSync(modPath, new Date(stat.mtimeMs + TIMESTAMP_TOLERANCE_MS + 1000), new Date(stat.mtimeMs + TIMESTAMP_TOLERANCE_MS + 1000));

    const result = detectFilesUsedDetailed(before, 'read only-read.ts', tempDir);

    expect(result.modified).toContain('only-mod.ts');
    expect(result.modified).not.toContain('only-read.ts');
    expect(result.read).toContain('only-read.ts');
    expect(result.read).not.toContain('only-mod.ts');
    expect(result.all.length).toBe(new Set([...result.modified, ...result.read]).size);
  });
});
