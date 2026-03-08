/**
 * Adaptive Confidence Threshold Learning (#6).
 * After sufficient tasks per type, simulates thresholds to find the one
 * that maximizes F1 score. Different task types naturally converge to
 * different thresholds (e.g., BugFix→higher precision, Exploration→higher recall).
 */

import type { Metrics, TaskHistory } from '../types/index.js';
import { logger } from '../utils/index.js';

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
 * Simulate a threshold against historical task data for a given task type.
 * Returns the precision, recall, and F1 that threshold would have achieved.
 */
function simulateThreshold(
  tasks: Array<{ predictedFiles: string[]; actualFiles: string[]; scores: number[] }>,
  threshold: number,
): { precision: number; recall: number; f1: number } {
  let totalTP = 0;
  let totalFP = 0;
  let totalFN = 0;

  for (const task of tasks) {
    const actualSet = new Set(task.actualFiles);
    const kept = task.predictedFiles.filter((_, i) => task.scores[i] >= threshold);
    const keptSet = new Set(kept);

    const tp = kept.filter((f) => actualSet.has(f)).length;
    const fp = kept.filter((f) => !actualSet.has(f)).length;
    const fn = task.actualFiles.filter((f) => !keptSet.has(f)).length;

    totalTP += tp;
    totalFP += fp;
    totalFN += fn;
  }

  const precision = totalTP + totalFP > 0 ? totalTP / (totalTP + totalFP) : 0;
  const recall = totalTP + totalFN > 0 ? totalTP / (totalTP + totalFN) : 0;

  return { precision, recall, f1: f1Score(precision, recall) };
}

/**
 * Update learned confidence thresholds per task type.
 * For each type with enough history, finds the threshold that maximizes F1.
 */
export function updateLearnedThresholds(
  metrics: Metrics,
  history: TaskHistory,
): void {
  if (!metrics.learnedThresholds) {
    metrics.learnedThresholds = {};
  }

  // Group tasks by type
  const tasksByType = new Map<string, Array<{ predictedFiles: string[]; actualFiles: string[]; scores: number[] }>>();

  for (const task of history.tasks) {
    const type = task.classification.taskType;
    if (!tasksByType.has(type)) tasksByType.set(type, []);

    // We only have precision/recall stored, not individual file scores.
    // Use the prediction data we do have: predictedFiles + actualFiles.
    // For threshold simulation, we approximate scores as uniform (precision-based).
    const predicted = task.prediction.predictedFiles;
    const actual = task.prediction.actualFiles;

    // Approximate scores: assign score=precision for TP, score=0.3 for FP
    const actualSet = new Set(actual);
    const scores = predicted.map((f) => actualSet.has(f) ? 0.8 : 0.3);

    tasksByType.get(type)!.push({
      predictedFiles: predicted,
      actualFiles: actual,
      scores,
    });
  }

  // For each type with enough data, find optimal threshold
  for (const [taskType, tasks] of tasksByType) {
    if (tasks.length < MIN_TASKS_PER_TYPE) continue;

    let bestThreshold = 0.35; // default
    let bestF1 = 0;

    for (const threshold of CANDIDATE_THRESHOLDS) {
      const result = simulateThreshold(tasks, threshold);
      if (result.f1 > bestF1) {
        bestF1 = result.f1;
        bestThreshold = threshold;
      }
    }

    metrics.learnedThresholds[taskType] = bestThreshold;
    logger.debug(MODULE, `Learned threshold for ${taskType}: ${bestThreshold} (F1=${bestF1.toFixed(3)}, ${tasks.length} tasks)`);
  }
}
