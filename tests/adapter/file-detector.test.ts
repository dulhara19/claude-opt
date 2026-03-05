import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { captureTimestamps, detectModifiedFiles, parseFilePaths, detectFilesUsed } from '../../src/adapter/file-detector.js';

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
    const futureTime = new Date(stat.mtimeMs + 2000);
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
    fs.utimesSync(bPath, new Date(stat.mtimeMs + 2000), new Date(stat.mtimeMs + 2000));

    const result = detectFilesUsed(before, '', tempDir);

    expect(result).toEqual([...result].sort());
  });
});
