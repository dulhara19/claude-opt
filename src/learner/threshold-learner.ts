/**
 * Adaptive Confidence Threshold Learning (#6).
 * After sufficient tasks per type, simulates thresholds to find the one
 * that maximizes F1 score. Different task types naturally converge to
 * different thresholds (e.g., BugFix->higher precision, Exploration->higher recall).
 *
 * L10: Uses real prediction scores when available (falls back to 0.8/0.3 for legacy).
 * L11: Recency-weighted task contributions (exp decay with 60-day half-life).
 * L12: Per-domain confidence thresholds (domain:type compound keys).
 */

import type { Metrics, TaskHistory, TaskEntry } from '../types/index.js';
import { logger } from '../utils/index.js';
import { MIN_TASKS_PER_DOMAIN_TYPE, RECENCY_HALF_LIFE_DAYS } from './types.js';

const MODULE = 'learner:thresholds';

/** Minimum tasks per type before learning a threshold. */
const MIN_TASKS_PER_TYPE = 10;

/** Candidate thresholds to evaluate. */
const CANDIDATE_THRESHOLDS = [0.25, 0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80];

/**
 * Compute F1 score from precision and recall.
 */
function f1Score(precision: number, recall: number): number {
  if (precision + recall === 0) return 0;
  return 2 * (precision * recall) / (precision + recall);
}

/**
 * Compute recency weight for a task based on its timestamp (L11).
 * weight = exp(-daysSince / RECENCY_HALF_LIFE_DAYS)
 */
function recencyWeight(taskTimestamp: string, now: number): number {
  const taskTime = new Date(taskTimestamp).getTime();
  const daysSince = (now - taskTime) / (1000 * 60 * 60 * 24);
  if (daysSince <= 0) return 1.0;
  return Math.exp(-daysSince / RECENCY_HALF_LIFE_DAYS);
}

/**
 * Build simulation data from a task entry (L10: use real scores when available).
 */
function buildSimData(task: TaskEntry): {
  predictedFiles: string[];
  actualFiles: string[];
  scores: number[];
  timestamp: string;
} {
  const predicted = task.prediction.predictedFiles;
  const actual = task.prediction.actualFiles;

  // L10: Use real prediction scores when available
  let scores: number[];
  if (task.prediction.predictedScores && task.prediction.predictedScores.length === predicted.length) {
    scores = task.prediction.predictedScores;
  } else {
    // Legacy fallback: approximate scores
    const actualSet = new Set(actual);
    scores = predicted.map((f) => actualSet.has(f) ? 0.8 : 0.3);
  }

  return { predictedFiles: predicted, actualFiles: actual, scores, timestamp: task.timestamp };
}

/**
 * Simulate a threshold against historical task data (L11: recency-weighted).
 * Returns the precision, recall, and F1 that threshold would have achieved.
 */
function simulateThreshold(
  tasks: Array<{ predictedFiles: string[]; actualFiles: string[]; scores: number[]; timestamp: string }>,
  threshold: number,
  now: number,
): { precision: number; recall: number; f1: number } {
  let totalTP = 0;
  let totalFP = 0;
  let totalFN = 0;

  for (const task of tasks) {
    // L11: Weight each task's contribution by recency
    const weight = recencyWeight(task.timestamp, now);

    const actualSet = new Set(task.actualFiles);
    const kept = task.predictedFiles.filter((_, i) => task.scores[i] >= threshold);
    const keptSet = new Set(kept);

    const tp = kept.filter((f) => actualSet.has(f)).length;
    const fp = kept.filter((f) => !actualSet.has(f)).length;
    const fn = task.actualFiles.filter((f) => !keptSet.has(f)).length;

    totalTP += tp * weight;
    totalFP += fp * weight;
    totalFN += fn * weight;
  }

  const precision = totalTP + totalFP > 0 ? totalTP / (totalTP + totalFP) : 0;
  const recall = totalTP + totalFN > 0 ? totalTP / (totalTP + totalFN) : 0;

  return { precision, recall, f1: f1Score(precision, recall) };
}

/**
 * Find optimal threshold from candidates for a set of tasks.
 */
function findOptimalThreshold(
  tasks: Array<{ predictedFiles: string[]; actualFiles: string[]; scores: number[]; timestamp: string }>,
  now: number,
): { threshold: number; f1: number } {
  let bestThreshold = 0.35;
  let bestF1 = 0;

  for (const threshold of CANDIDATE_THRESHOLDS) {
    const result = simulateThreshold(tasks, threshold, now);
    if (result.f1 > bestF1) {
      bestF1 = result.f1;
      bestThreshold = threshold;
    }
  }

  return { threshold: bestThreshold, f1: bestF1 };
}

/**
 * Update learned confidence thresholds per task type and per domain:type (L12).
 * For each type with enough history, finds the threshold that maximizes F1.
 *
 * L10: Uses real prediction scores when available.
 * L11: Applies recency weighting to task contributions.
 * L12: Learns domain:type compound thresholds with 15+ tasks, in addition to per-type.
 */
export function updateLearnedThresholds(
  metrics: Metrics,
  history: TaskHistory,
): void {
  if (!metrics.learnedThresholds) {
    metrics.learnedThresholds = {};
  }

  const now = Date.now();

  // Group tasks by type and by domain:type (L12)
  const tasksByType = new Map<string, Array<ReturnType<typeof buildSimData>>>();
  const tasksByDomainType = new Map<string, Array<ReturnType<typeof buildSimData>>>();

  for (const task of history.tasks) {
    const type = task.classification.taskType;
    const simData = buildSimData(task);

    // Per-type grouping
    if (!tasksByType.has(type)) tasksByType.set(type, []);
    tasksByType.get(type)!.push(simData);

    // L12: Per-domain:type grouping
    const domain = task.classification.domain;
    if (domain && domain !== 'general' && domain !== 'unknown') {
      const compoundKey = `${domain}:${type}`;
      if (!tasksByDomainType.has(compoundKey)) tasksByDomainType.set(compoundKey, []);
      tasksByDomainType.get(compoundKey)!.push(simData);
    }
  }

  // Per-type threshold learning
  for (const [taskType, tasks] of tasksByType) {
    if (tasks.length < MIN_TASKS_PER_TYPE) continue;

    const { threshold, f1 } = findOptimalThreshold(tasks, now);
    metrics.learnedThresholds[taskType] = threshold;
    logger.debug(MODULE, `Learned threshold for ${taskType}: ${threshold} (F1=${f1.toFixed(3)}, ${tasks.length} tasks)`);
  }

  // L12: Per-domain:type threshold learning
  for (const [compoundKey, tasks] of tasksByDomainType) {
    if (tasks.length < MIN_TASKS_PER_DOMAIN_TYPE) continue;

    const { threshold, f1 } = findOptimalThreshold(tasks, now);
    metrics.learnedThresholds[compoundKey] = threshold;
    logger.debug(MODULE, `Learned domain threshold for ${compoundKey}: ${threshold} (F1=${f1.toFixed(3)}, ${tasks.length} tasks)`);
  }
}
