import { describe, it, expect } from 'vitest';
import { toInternal, toOS, normalizePath } from '../../src/utils/paths.js';
import path from 'node:path';

describe('toInternal', () => {
  it('converts Windows backslashes to POSIX forward slashes', () => {
    expect(toInternal('C:\\Users\\dev\\project')).toBe('C:/Users/dev/project');
  });

  it('leaves POSIX paths unchanged', () => {
    expect(toInternal('/home/dev/project')).toBe('/home/dev/project');
  });

  it('handles mixed separators', () => {
    expect(toInternal('src\\utils/paths.ts')).toBe('src/utils/paths.ts');
  });

  it('handles empty string', () => {
    expect(toInternal('')).toBe('');
  });

  it('handles paths with spaces', () => {
    expect(toInternal('C:\\Program Files\\my project')).toBe('C:/Program Files/my project');
  });
});

describe('toOS', () => {
  it('converts POSIX path to platform-native separator', () => {
    const result = toOS('src/utils/paths.ts');
    expect(result).toBe(path.join('src', 'utils', 'paths.ts'));
  });

  it('handles empty string', () => {
    expect(toOS('')).toBe('');
  });

  it('handles single segment', () => {
    expect(toOS('file.ts')).toBe('file.ts');
  });
});

describe('normalizePath', () => {
  it('resolves and normalizes a path', () => {
    const result = normalizePath('src/../src/utils/paths.ts');
    expect(result).toContain('src/utils/paths.ts');
  });

  it('removes trailing slashes', () => {
    const result = normalizePath('src/utils/');
    expect(result).not.toMatch(/\/$/);
  });

  it('returns POSIX format', () => {
    const result = normalizePath('src/utils');
    expect(result).not.toContain('\\');
  });
});
