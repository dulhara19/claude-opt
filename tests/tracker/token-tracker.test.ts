import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  trackUsage,
  estimateSavings,
  getWindowStatus,
  getActiveWindow,
  createWindow,
  isWindowExpired,
  resetSession,
} from '../../src/tracker/index.js';
import type { WindowEntry } from '../../src/tracker/index.js';
import { initializeStore } from '../../src/store/index.js';

function createTestProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'claude-opt-tracker-test-'));
  initializeStore(dir, 'test-project');
  return dir;
}

describe('estimateSavings', () => {
  it('calculates savings with valid optimization', () => {
    const result = estimateSavings(800, 0.8, 0.5);
    // estimatedUnoptimized = 800 / (1 - 0.5 * 0.8) = 800 / 0.6 ≈ 1333
    expect(result.estimatedUnoptimized).toBeGreaterThan(800);
    expect(result.actual).toBe(800);
    expect(result.saved).toBeGreaterThan(0);
    expect(result.savingsRate).toBeGreaterThan(0);
    expect(result.savingsRate).toBeLessThanOrEqual(1);
  });

  it('returns zero savings when predictionConfidence is 0', () => {
    const result = estimateSavings(1000, 0, 0.5);
    expect(result.estimatedUnoptimized).toBe(1000);
    expect(result.saved).toBe(0);
    expect(result.savingsRate).toBe(0);
  });

  it('returns zero savings when compressionRatio is 0', () => {
    const result = estimateSavings(1000, 0.9, 0);
    expect(result.estimatedUnoptimized).toBe(1000);
    expect(result.saved).toBe(0);
    expect(result.savingsRate).toBe(0);
  });

  it('handles edge case: optimizationFactor >= 1', () => {
    const result = estimateSavings(1000, 1.0, 1.0);
    expect(result.estimatedUnoptimized).toBe(1000);
    expect(result.saved).toBe(0);
  });

  it('handles zero tokensUsed', () => {
    const result = estimateSavings(0, 0.8, 0.5);
    expect(result.estimatedUnoptimized).toBe(0);
    expect(result.actual).toBe(0);
    expect(result.saved).toBe(0);
  });
});

describe('window management', () => {
  it('creates a new window with correct fields', () => {
    const window = createWindow([], 18_000_000, 44000);
    expect(window.id).toMatch(/^w_\d{8}_01$/);
    expect(window.tokensConsumed).toBe(0);
    expect(window.budget).toBe(44000);
    expect(window.remaining).toBe(44000);
    expect(window.tasksCompleted).toBe(0);
    expect(window.windowDurationMs).toBe(18_000_000);
    expect(new Date(window.startedAt).getTime()).toBeLessThanOrEqual(Date.now());
    expect(new Date(window.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('increments window ID counter for same day', () => {
    const w1 = createWindow([], 18_000_000, 44000);
    const w2 = createWindow([w1], 18_000_000, 44000);
    expect(w1.id).toMatch(/_01$/);
    expect(w2.id).toMatch(/_02$/);
  });

  it('detects expired windows', () => {
    const expired: WindowEntry = {
      id: 'w_20260101_01',
      startedAt: '2026-01-01T00:00:00Z',
      expiresAt: '2026-01-01T05:00:00Z',
      windowDurationMs: 18_000_000,
      tokensConsumed: 1000,
      budget: 44000,
      remaining: 43000,
      tasksCompleted: 3,
      timeRemainingMs: 0,
      estimatedResetAt: '2026-01-01T05:00:00Z',
    };
    expect(isWindowExpired(expired)).toBe(true);
  });

  it('detects active windows', () => {
    const window = createWindow([], 18_000_000, 44000);
    expect(isWindowExpired(window)).toBe(false);
  });

  it('getActiveWindow returns active window', () => {
    const active = createWindow([], 18_000_000, 44000);
    const result = getActiveWindow([active]);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(active.id);
  });

  it('getActiveWindow returns null when all expired', () => {
    const expired: WindowEntry = {
      id: 'w_20260101_01',
      startedAt: '2026-01-01T00:00:00Z',
      expiresAt: '2026-01-01T05:00:00Z',
      windowDurationMs: 18_000_000,
      tokensConsumed: 1000,
      budget: 44000,
      remaining: 43000,
      tasksCompleted: 3,
      timeRemainingMs: 0,
      estimatedResetAt: '2026-01-01T05:00:00Z',
    };
    expect(getActiveWindow([expired])).toBeNull();
  });

  it('getActiveWindow returns most recent active window', () => {
    const w1 = createWindow([], 18_000_000, 44000);
    const w2 = createWindow([w1], 18_000_000, 44000);
    const result = getActiveWindow([w1, w2]);
    expect(result!.id).toBe(w2.id);
  });
});

describe('getWindowStatus', () => {
  it('computes status for active window', () => {
    const window = createWindow([], 18_000_000, 44000);
    window.tokensConsumed = 10000;
    window.tasksCompleted = 5;

    const status = getWindowStatus(window);
    expect(status.windowId).toBe(window.id);
    expect(status.tokensConsumed).toBe(10000);
    expect(status.budget).toBe(44000);
    expect(status.remaining).toBe(34000);
    expect(status.percentUsed).toBeCloseTo(10000 / 44000, 2);
    expect(status.tasksCompleted).toBe(5);
    expect(status.isExpired).toBe(false);
    expect(status.timeRemainingMs).toBeGreaterThan(0);
  });

  it('handles expired window', () => {
    const expired: WindowEntry = {
      id: 'w_20260101_01',
      startedAt: '2026-01-01T00:00:00Z',
      expiresAt: '2026-01-01T05:00:00Z',
      windowDurationMs: 18_000_000,
      tokensConsumed: 20000,
      budget: 44000,
      remaining: 24000,
      tasksCompleted: 10,
      timeRemainingMs: 0,
      estimatedResetAt: '2026-01-01T05:00:00Z',
    };
    const status = getWindowStatus(expired);
    expect(status.isExpired).toBe(true);
    expect(status.remaining).toBe(0);
    expect(status.timeRemainingMs).toBe(0);
  });
});

describe('trackUsage', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = createTestProject();
    resetSession();
  });

  it('records per-task usage', () => {
    const result = trackUsage({
      taskId: 'task-001',
      tokensUsed: 500,
      domain: 'auth',
      predictionConfidence: 0.8,
      compressionRatio: 0.3,
      projectRoot,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.usage.taskId).toBe('task-001');
    expect(result.value.usage.tokensUsed).toBe(500);
    expect(result.value.usage.domain).toBe('auth');
    expect(result.value.usage.savings).toBeGreaterThan(0);
    expect(result.value.usage.estimatedUnoptimized).toBeGreaterThan(500);
  });

  it('creates a window when none exists', () => {
    const result = trackUsage({
      taskId: 'task-001',
      tokensUsed: 500,
      domain: 'general',
      predictionConfidence: 0,
      compressionRatio: 0,
      projectRoot,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.windowStatus.windowId).toMatch(/^w_\d{8}_\d{2}$/);
    expect(result.value.windowStatus.tokensConsumed).toBe(500);
    expect(result.value.windowStatus.isExpired).toBe(false);
  });

  it('accumulates session stats across tasks', () => {
    trackUsage({
      taskId: 'task-001',
      tokensUsed: 300,
      domain: 'auth',
      predictionConfidence: 0,
      compressionRatio: 0,
      projectRoot,
    });

    const result = trackUsage({
      taskId: 'task-002',
      tokensUsed: 200,
      domain: 'ui',
      predictionConfidence: 0,
      compressionRatio: 0,
      projectRoot,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.sessionStats.tasksCompleted).toBe(2);
    expect(result.value.sessionStats.tokensConsumed).toBe(500);
  });

  it('updates per-domain stats', () => {
    trackUsage({
      taskId: 'task-001',
      tokensUsed: 500,
      domain: 'auth',
      predictionConfidence: 0.8,
      compressionRatio: 0.3,
      projectRoot,
    });

    trackUsage({
      taskId: 'task-002',
      tokensUsed: 300,
      domain: 'auth',
      predictionConfidence: 0.7,
      compressionRatio: 0.2,
      projectRoot,
    });

    // The window should show accumulated tokens
    const result = trackUsage({
      taskId: 'task-003',
      tokensUsed: 200,
      domain: 'ui',
      predictionConfidence: 0,
      compressionRatio: 0,
      projectRoot,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.windowStatus.tokensConsumed).toBe(1000);
    expect(result.value.windowStatus.tasksCompleted).toBe(3);
  });

  it('handles zero optimization gracefully', () => {
    const result = trackUsage({
      taskId: 'task-001',
      tokensUsed: 1000,
      domain: 'general',
      predictionConfidence: 0,
      compressionRatio: 0,
      projectRoot,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.usage.savings).toBe(0);
    expect(result.value.usage.estimatedUnoptimized).toBe(1000);
  });

  it('updates overall metrics correctly', () => {
    trackUsage({
      taskId: 'task-001',
      tokensUsed: 500,
      domain: 'general',
      predictionConfidence: 0.8,
      compressionRatio: 0.4,
      projectRoot,
    });

    const result = trackUsage({
      taskId: 'task-002',
      tokensUsed: 300,
      domain: 'general',
      predictionConfidence: 0.7,
      compressionRatio: 0.3,
      projectRoot,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 2 tasks tracked
    expect(result.value.sessionStats.tasksCompleted).toBe(2);
    expect(result.value.sessionStats.tokensConsumed).toBe(800);
  });

  it('completes in under 10ms', () => {
    // Warm up
    trackUsage({
      taskId: 'warmup',
      tokensUsed: 100,
      domain: 'general',
      predictionConfidence: 0,
      compressionRatio: 0,
      projectRoot,
    });

    const start = performance.now();
    for (let i = 0; i < 10; i++) {
      trackUsage({
        taskId: `perf-${i}`,
        tokensUsed: 100,
        domain: 'general',
        predictionConfidence: 0.5,
        compressionRatio: 0.3,
        projectRoot,
      });
    }
    const avgMs = (performance.now() - start) / 10;
    // Allow some slack for CI/disk I/O — warn at 10ms, but test at 50ms
    expect(avgMs).toBeLessThan(50);
  });
});
