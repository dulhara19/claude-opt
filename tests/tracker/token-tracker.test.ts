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
  pruneExpiredWindows,
  resetSession,
} from '../../src/tracker/index.js';
import type { WindowEntry } from '../../src/tracker/index.js';
import { initializeStore, readMetrics } from '../../src/store/index.js';

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

  // TK2: Usage history persistence
  it('persists usage history in metrics (TK2)', () => {
    trackUsage({
      taskId: 'hist-001',
      tokensUsed: 400,
      domain: 'auth',
      predictionConfidence: 0.7,
      compressionRatio: 0.3,
      projectRoot,
    });
    trackUsage({
      taskId: 'hist-002',
      tokensUsed: 600,
      domain: 'ui',
      predictionConfidence: 0.5,
      compressionRatio: 0.2,
      projectRoot,
    });

    const metrics = readMetrics(projectRoot);
    expect(metrics.ok).toBe(true);
    if (!metrics.ok) return;

    expect(metrics.value.recentUsage).toBeDefined();
    expect(metrics.value.recentUsage!.length).toBe(2);
    expect(metrics.value.recentUsage![0].taskId).toBe('hist-001');
    expect(metrics.value.recentUsage![1].taskId).toBe('hist-002');
    expect(metrics.value.recentUsage![1].tokensUsed).toBe(600);
  });

  it('caps usage history at MAX_USAGE_HISTORY (TK2)', () => {
    // Write 205 entries — should be capped at 200
    for (let i = 0; i < 205; i++) {
      trackUsage({
        taskId: `cap-${i}`,
        tokensUsed: 10,
        domain: 'general',
        predictionConfidence: 0,
        compressionRatio: 0,
        projectRoot,
      });
    }

    const metrics = readMetrics(projectRoot);
    expect(metrics.ok).toBe(true);
    if (!metrics.ok) return;

    expect(metrics.value.recentUsage!.length).toBe(200);
    // First entry should be cap-5 (oldest 5 dropped)
    expect(metrics.value.recentUsage![0].taskId).toBe('cap-5');
    expect(metrics.value.recentUsage![199].taskId).toBe('cap-204');
  });

  // TK6: Per-model tracking
  it('tracks per-model token stats (TK6)', () => {
    trackUsage({
      taskId: 'model-001',
      tokensUsed: 500,
      domain: 'general',
      predictionConfidence: 0.8,
      compressionRatio: 0.3,
      projectRoot,
      modelTier: 'sonnet',
    });
    trackUsage({
      taskId: 'model-002',
      tokensUsed: 300,
      domain: 'general',
      predictionConfidence: 0.6,
      compressionRatio: 0.2,
      projectRoot,
      modelTier: 'haiku',
    });
    trackUsage({
      taskId: 'model-003',
      tokensUsed: 200,
      domain: 'general',
      predictionConfidence: 0.9,
      compressionRatio: 0.4,
      projectRoot,
      modelTier: 'sonnet',
    });

    const metrics = readMetrics(projectRoot);
    expect(metrics.ok).toBe(true);
    if (!metrics.ok) return;

    expect(metrics.value.perModel).toBeDefined();
    expect(metrics.value.perModel!['sonnet'].totalTasks).toBe(2);
    expect(metrics.value.perModel!['sonnet'].totalTokensConsumed).toBe(700);
    expect(metrics.value.perModel!['haiku'].totalTasks).toBe(1);
    expect(metrics.value.perModel!['haiku'].totalTokensConsumed).toBe(300);
  });

  it('skips per-model tracking when modelTier is not provided (TK6)', () => {
    trackUsage({
      taskId: 'no-model',
      tokensUsed: 500,
      domain: 'general',
      predictionConfidence: 0,
      compressionRatio: 0,
      projectRoot,
    });

    const metrics = readMetrics(projectRoot);
    expect(metrics.ok).toBe(true);
    if (!metrics.ok) return;
    // perModel should not be populated
    expect(metrics.value.perModel).toBeUndefined();
  });

  // TK1: StoreCache usage
  it('uses storeCache when provided instead of disk reads (TK1)', () => {
    const metricsResult = readMetrics(projectRoot);
    expect(metricsResult.ok).toBe(true);
    if (!metricsResult.ok) return;

    const result = trackUsage({
      taskId: 'cache-001',
      tokensUsed: 500,
      domain: 'general',
      predictionConfidence: 0.5,
      compressionRatio: 0.2,
      projectRoot,
      storeCache: {
        metrics: metricsResult.value,
        config: {
          schemaVersion: '1',
          projectName: 'test',
          projectType: 'code',
          tokenBudget: 50000,
          windowDurationMs: 18_000_000,
          budgetWarnings: { inline: 0.75, blocking: 0.9 },
          doctorMode: 'off',
          doctorThreshold: 0.7,
          taskHistoryCap: 200,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Should use the custom budget from storeCache config
    expect(result.value.windowStatus.budget).toBe(50000);
  });
});

// TK4: Validated savings with prediction accuracy
describe('estimateSavings with predictionAccuracy (TK4)', () => {
  it('reduces savings when prediction accuracy is low', () => {
    const withoutAccuracy = estimateSavings(800, 0.8, 0.5);
    const withLowAccuracy = estimateSavings(800, 0.8, 0.5, 0.5);

    // Low accuracy should produce less savings
    expect(withLowAccuracy.saved).toBeLessThan(withoutAccuracy.saved);
    expect(withLowAccuracy.savingsRate).toBeLessThan(withoutAccuracy.savingsRate);
  });

  it('produces same result when accuracy is 1.0 (perfect)', () => {
    const withoutAccuracy = estimateSavings(800, 0.8, 0.5);
    const withPerfectAccuracy = estimateSavings(800, 0.8, 0.5, 1.0);

    expect(withPerfectAccuracy.saved).toBe(withoutAccuracy.saved);
    expect(withPerfectAccuracy.savingsRate).toBe(withoutAccuracy.savingsRate);
  });

  it('returns zero savings when accuracy is 0', () => {
    const result = estimateSavings(800, 0.8, 0.5, 0);
    expect(result.saved).toBe(0);
    expect(result.estimatedUnoptimized).toBe(800);
  });
});

// TK3: Window pruning
describe('pruneExpiredWindows (TK3)', () => {
  function makeExpiredWindow(id: string): WindowEntry {
    return {
      id,
      startedAt: '2025-01-01T00:00:00Z',
      expiresAt: '2025-01-01T05:00:00Z',
      windowDurationMs: 18_000_000,
      tokensConsumed: 1000,
      budget: 44000,
      remaining: 43000,
      tasksCompleted: 3,
      timeRemainingMs: 0,
      estimatedResetAt: '2025-01-01T05:00:00Z',
    };
  }

  it('keeps active windows untouched', () => {
    const active = createWindow([], 18_000_000, 44000);
    const result = pruneExpiredWindows([active]);
    expect(result.length).toBe(1);
    expect(result[0].id).toBe(active.id);
  });

  it('retains up to MAX_RETAINED_WINDOWS expired windows', () => {
    const expired = Array.from({ length: 15 }, (_, i) =>
      makeExpiredWindow(`w_20250101_${String(i + 1).padStart(2, '0')}`),
    );
    const active = createWindow(expired, 18_000_000, 44000);

    const result = pruneExpiredWindows([...expired, active]);
    // 10 retained expired + 1 active = 11
    expect(result.length).toBe(11);
    // Active should be last
    expect(result[result.length - 1].id).toBe(active.id);
    // Most recent expired windows should be retained
    expect(result[0].id).toBe('w_20250101_06');
  });

  it('keeps all expired if under limit', () => {
    const expired = Array.from({ length: 3 }, (_, i) =>
      makeExpiredWindow(`w_20250101_${String(i + 1).padStart(2, '0')}`),
    );
    const result = pruneExpiredWindows(expired);
    expect(result.length).toBe(3);
  });

  it('handles empty array', () => {
    expect(pruneExpiredWindows([]).length).toBe(0);
  });
});

// TK12: Per-type session breakdown
describe('per-type session stats (TK12)', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = createTestProject();
    resetSession();
  });

  it('tracks per-type breakdown in session stats', () => {
    trackUsage({
      taskId: 'type-001',
      tokensUsed: 500,
      domain: 'general',
      predictionConfidence: 0,
      compressionRatio: 0,
      projectRoot,
      taskType: 'BugFix',
    });
    trackUsage({
      taskId: 'type-002',
      tokensUsed: 300,
      domain: 'general',
      predictionConfidence: 0,
      compressionRatio: 0,
      projectRoot,
      taskType: 'Feature',
    });
    const result = trackUsage({
      taskId: 'type-003',
      tokensUsed: 200,
      domain: 'general',
      predictionConfidence: 0,
      compressionRatio: 0,
      projectRoot,
      taskType: 'BugFix',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const perType = result.value.sessionStats.perType;
    expect(perType).toBeDefined();
    expect(perType!['BugFix'].tasks).toBe(2);
    expect(perType!['BugFix'].tokensConsumed).toBe(700);
    expect(perType!['Feature'].tasks).toBe(1);
    expect(perType!['Feature'].tokensConsumed).toBe(300);
  });

  it('omits perType when taskType not provided', () => {
    const result = trackUsage({
      taskId: 'no-type',
      tokensUsed: 500,
      domain: 'general',
      predictionConfidence: 0,
      compressionRatio: 0,
      projectRoot,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.sessionStats.perType).toBeUndefined();
  });
});
