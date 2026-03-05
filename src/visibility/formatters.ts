/**
 * Shared terminal formatters for visibility commands.
 * Implements AD-07: Chalk + String Templates for terminal UI (no TUI framework).
 */

import chalk from 'chalk';
import type { BoxOptions, TableColumn, TableRow, ChartDataPoint, ChartOptions } from './types.js';

const DEFAULT_BOX_WIDTH = 64;
const BAR_FULL_CHAR = '\u2588';
const BAR_EMPTY_CHAR = '\u2591';

/**
 * Draw a Unicode box with title and content lines.
 */
export function drawBox(title: string, lines: string[], options?: BoxOptions): string {
  const width = options?.width ?? DEFAULT_BOX_WIDTH;
  const innerWidth = width - 2;
  const titleStr = ` ${title} `;
  const dashesAfterTitle = Math.max(0, innerWidth - titleStr.length - 1);

  const top = `\u250c\u2500${chalk.bold.cyan(titleStr)}${'\u2500'.repeat(dashesAfterTitle)}\u2510`;
  const bottom = `\u2514${'\u2500'.repeat(innerWidth)}\u2518`;
  const emptyLine = `\u2502${' '.repeat(innerWidth)}\u2502`;

  const paddedLines = lines.map((line) => {
    const stripped = stripAnsi(line);
    const pad = Math.max(0, innerWidth - stripped.length);
    return `\u2502${line}${' '.repeat(pad)}\u2502`;
  });

  return [top, emptyLine, ...paddedLines, emptyLine, bottom].join('\n');
}

/**
 * Draw a visual progress bar.
 */
export function drawProgressBar(value: number, max: number, width?: number): string {
  const barWidth = width ?? 20;
  const ratio = max > 0 ? Math.min(value / max, 1) : 0;
  const filledCount = Math.round(ratio * barWidth);
  const emptyCount = barWidth - filledCount;

  const filled = BAR_FULL_CHAR.repeat(filledCount);
  const empty = BAR_EMPTY_CHAR.repeat(emptyCount);
  const pct = `${Math.round(ratio * 100)}%`;

  return `${filled}${empty} ${pct}`;
}

/**
 * Draw a column-aligned table with header separator.
 */
export function drawTable(columns: TableColumn[], rows: TableRow[]): string {
  const header = columns
    .map((col) => {
      const label = col.label;
      return col.align === 'right' ? label.padStart(col.width) : label.padEnd(col.width);
    })
    .join('  ');

  const separator = columns.map((col) => '\u2500'.repeat(col.width)).join('  ');

  const dataRows = rows.map((row) =>
    columns
      .map((col) => {
        const val = String(row[col.label] ?? '');
        return col.align === 'right' ? val.padStart(col.width) : val.padEnd(col.width);
      })
      .join('  '),
  );

  return [header, separator, ...dataRows].join('\n');
}

/**
 * Format a token count with locale formatting.
 */
export function formatTokenCount(tokens: number): string {
  return `${tokens.toLocaleString('en-US')} tokens`;
}

/**
 * Convert a 0-1 float to display percentage.
 */
export function formatPercentage(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/**
 * Convert milliseconds to human-readable time remaining.
 */
export function formatTimeRemaining(ms: number): string {
  if (ms <= 0) return '0m';
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

/**
 * Color a value green/yellow/red based on thresholds.
 * For "higher is better" metrics: value >= good → green, >= warn → yellow, else red.
 */
export function colorByThreshold(value: number, thresholds: { good: number; warn: number }): string {
  const display = typeof value === 'number' && value <= 1 ? formatPercentage(value) : String(value);
  if (value >= thresholds.good) return chalk.green(display);
  if (value >= thresholds.warn) return chalk.yellow(display);
  return chalk.red(display);
}

/**
 * Draw an ASCII line chart with Y-axis labels and X-axis labels.
 */
export function drawLineChart(data: ChartDataPoint[], options?: ChartOptions): string {
  const width = options?.width ?? 60;
  const height = options?.height ?? 10;
  const yLabel = options?.yLabel ?? '%';

  if (data.length === 0) return '';

  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const minValue = 0;
  const range = maxValue - minValue;

  const lines: string[] = [];

  // Calculate the column width per data point
  const colWidth = Math.max(2, Math.floor(width / Math.max(data.length, 1)));

  // Y-axis from top to bottom
  for (let row = height; row >= 0; row--) {
    const yValue = Math.round((row / height) * maxValue);
    const label = `${yValue.toString().padStart(5)}${yLabel}|`;

    let rowContent = '';
    for (let i = 0; i < data.length; i++) {
      const dataRow = range > 0 ? Math.round(((data[i].value - minValue) / range) * height) : 0;
      if (dataRow === row) {
        rowContent += '\u25cf'; // filled circle for data point
      } else if (dataRow > row && i > 0) {
        const prevRow = range > 0 ? Math.round(((data[i - 1].value - minValue) / range) * height) : 0;
        if (prevRow < row) {
          rowContent += '/';
        } else {
          rowContent += ' ';
        }
      } else if (dataRow < row && i > 0) {
        const prevRow = range > 0 ? Math.round(((data[i - 1].value - minValue) / range) * height) : 0;
        if (prevRow > row) {
          rowContent += '\\';
        } else {
          rowContent += ' ';
        }
      } else if (i > 0) {
        const prevRow = range > 0 ? Math.round(((data[i - 1].value - minValue) / range) * height) : 0;
        if (prevRow === row && dataRow === row) {
          rowContent += '-';
        } else {
          rowContent += ' ';
        }
      } else {
        rowContent += ' ';
      }
      // Padding between columns
      rowContent += ' '.repeat(Math.max(0, colWidth - 1));
    }

    lines.push(label + rowContent);
  }

  // X-axis
  lines.push('      +' + '\u2500'.repeat(Math.min(width, data.length * colWidth)));

  // X-axis labels
  const xLabels = options?.xLabels ?? data.map((d) => d.label);
  const labelLine = '       ' + xLabels.map((l) => l.padEnd(colWidth)).join('');
  lines.push(labelLine);

  return lines.join('\n');
}

/**
 * Strip ANSI escape codes from a string for width calculation.
 */
function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}
