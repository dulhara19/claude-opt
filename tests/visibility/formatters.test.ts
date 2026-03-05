import { describe, it, expect } from 'vitest';
import {
  drawBox,
  drawProgressBar,
  drawTable,
  formatTokenCount,
  formatPercentage,
  formatTimeRemaining,
  colorByThreshold,
} from '../../src/visibility/formatters.js';

// ─── stripAnsi helper for tests ─────────────────────────────────

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

// ─── drawBox ────────────────────────────────────────────────────

describe('drawBox', () => {
  it('draws a box with title and content lines', () => {
    const result = drawBox('Test Box', ['  Hello', '  World']);
    const stripped = stripAnsi(result);
    expect(stripped).toContain('Test Box');
    expect(stripped).toContain('Hello');
    expect(stripped).toContain('World');
    expect(stripped).toContain('\u250c'); // top-left corner
    expect(stripped).toContain('\u2510'); // top-right corner
    expect(stripped).toContain('\u2514'); // bottom-left corner
    expect(stripped).toContain('\u2518'); // bottom-right corner
  });

  it('respects custom width', () => {
    const result = drawBox('Title', ['Line'], { width: 40 });
    const lines = stripAnsi(result).split('\n');
    // Bottom line should be 40 chars wide
    const bottomLine = lines[lines.length - 1];
    expect(bottomLine.length).toBe(40);
  });

  it('handles empty content lines', () => {
    const result = drawBox('Empty', []);
    const stripped = stripAnsi(result);
    expect(stripped).toContain('Empty');
    expect(stripped).toContain('\u250c');
    expect(stripped).toContain('\u2518');
  });
});

// ─── drawProgressBar ────────────────────────────────────────────

describe('drawProgressBar', () => {
  it('shows 0% for zero value', () => {
    const result = drawProgressBar(0, 100, 10);
    expect(result).toContain('0%');
    expect(result).toContain('\u2591'); // empty char
    expect(result).not.toMatch(/\u2588/); // no full char
  });

  it('shows 100% for full value', () => {
    const result = drawProgressBar(100, 100, 10);
    expect(result).toContain('100%');
    expect(result).toContain('\u2588'); // full char
  });

  it('shows 50% for half value', () => {
    const result = drawProgressBar(50, 100, 10);
    expect(result).toContain('50%');
  });

  it('caps at 100% for values exceeding max', () => {
    const result = drawProgressBar(200, 100, 10);
    expect(result).toContain('100%');
  });

  it('handles zero max gracefully', () => {
    const result = drawProgressBar(50, 0, 10);
    expect(result).toContain('0%');
  });

  it('uses default width when not specified', () => {
    const result = drawProgressBar(50, 100);
    expect(result).toContain('50%');
  });
});

// ─── drawTable ──────────────────────────────────────────────────

describe('drawTable', () => {
  it('draws a header and rows', () => {
    const columns = [
      { label: 'Name', width: 10 },
      { label: 'Score', width: 6, align: 'right' as const },
    ];
    const rows = [
      { Name: 'Alice', Score: 95 },
      { Name: 'Bob', Score: 87 },
    ];
    const result = drawTable(columns, rows);
    expect(result).toContain('Name');
    expect(result).toContain('Score');
    expect(result).toContain('Alice');
    expect(result).toContain('Bob');
    expect(result).toContain('95');
    expect(result).toContain('87');
    expect(result).toContain('\u2500'); // separator
  });

  it('handles empty rows', () => {
    const columns = [{ label: 'Col', width: 5 }];
    const result = drawTable(columns, []);
    const lines = result.split('\n');
    expect(lines.length).toBe(2); // header + separator, no data rows
  });
});

// ─── formatTokenCount ───────────────────────────────────────────

describe('formatTokenCount', () => {
  it('formats small numbers', () => {
    expect(formatTokenCount(0)).toBe('0 tokens');
    expect(formatTokenCount(100)).toBe('100 tokens');
  });

  it('formats large numbers with locale separators', () => {
    const result = formatTokenCount(34200);
    expect(result).toBe('34,200 tokens');
  });

  it('formats very large numbers', () => {
    const result = formatTokenCount(1234567);
    expect(result).toBe('1,234,567 tokens');
  });
});

// ─── formatPercentage ───────────────────────────────────────────

describe('formatPercentage', () => {
  it('converts 0.0 to 0%', () => {
    expect(formatPercentage(0)).toBe('0%');
  });

  it('converts 1.0 to 100%', () => {
    expect(formatPercentage(1.0)).toBe('100%');
  });

  it('converts 0.82 to 82%', () => {
    expect(formatPercentage(0.82)).toBe('82%');
  });

  it('rounds to nearest integer', () => {
    expect(formatPercentage(0.756)).toBe('76%');
  });
});

// ─── formatTimeRemaining ────────────────────────────────────────

describe('formatTimeRemaining', () => {
  it('formats hours and minutes', () => {
    expect(formatTimeRemaining(2 * 3_600_000 + 12 * 60_000)).toBe('2h 12m');
  });

  it('formats hours only', () => {
    expect(formatTimeRemaining(3 * 3_600_000)).toBe('3h');
  });

  it('formats minutes only', () => {
    expect(formatTimeRemaining(45 * 60_000)).toBe('45m');
  });

  it('returns 0m for zero or negative', () => {
    expect(formatTimeRemaining(0)).toBe('0m');
    expect(formatTimeRemaining(-1000)).toBe('0m');
  });
});

// ─── colorByThreshold ───────────────────────────────────────────

describe('colorByThreshold', () => {
  it('applies green for values >= good threshold', () => {
    const result = colorByThreshold(0.9, { good: 0.8, warn: 0.6 });
    const stripped = stripAnsi(result);
    expect(stripped).toBe('90%');
  });

  it('applies yellow for values >= warn but < good', () => {
    const result = colorByThreshold(0.7, { good: 0.8, warn: 0.6 });
    const stripped = stripAnsi(result);
    expect(stripped).toBe('70%');
  });

  it('applies red for values below warn', () => {
    const result = colorByThreshold(0.3, { good: 0.8, warn: 0.6 });
    const stripped = stripAnsi(result);
    expect(stripped).toBe('30%');
  });
});
