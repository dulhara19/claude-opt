/**
 * Pattern detector module — detects co-occurrence patterns, task-type-to-file affinities,
 * and conventions from task history. (Story 3.2)
 */

import type { TaskEntry, Patterns, CoOccurrence, Convention } from '../types/index.js';
import { toInternal } from '../utils/index.js';
import type { PatternDetectionResult, TypeAffinities } from './types.js';
import {
  CO_OCCURRENCE_THRESHOLD,
  AFFINITY_MIN_OCCURRENCES,
  AFFINITY_MIN_WEIGHT,
  CONVENTION_MIN_EVIDENCE,
  CONVENTION_MIN_CONFIDENCE,
  RECENT_HISTORY_WINDOW,
} from './types.js';

/**
 * Build a canonical key for a file pair (sorted alphabetically).
 */
function filePairKey(fileA: string, fileB: string): string {
  const sorted = [fileA, fileB].sort();
  return `${sorted[0]}::${sorted[1]}`;
}

/**
 * Get the next sequence number for a given ID prefix in existing items.
 */
function nextSequenceId(prefix: string, existingIds: string[]): string {
  let max = 0;
  for (const id of existingIds) {
    if (id.startsWith(`${prefix}_`)) {
      const num = parseInt(id.slice(prefix.length + 1), 10);
      if (!isNaN(num) && num > max) max = num;
    }
  }
  return `${prefix}_${String(max + 1).padStart(3, '0')}`;
}

// ─── Co-Occurrence Detection ──────────────────────────────────

/**
 * Detect co-occurrence patterns from recent task history.
 * A co-occurrence pattern is created when two files appear together in 5+ tasks.
 */
export function detectCoOccurrences(
  recentTasks: TaskEntry[],
  currentPatterns: Patterns,
): { newCoOccurrences: CoOccurrence[]; updatedCoOccurrences: CoOccurrence[] } {
  const newCoOccurrences: CoOccurrence[] = [];
  const updatedCoOccurrences: CoOccurrence[] = [];

  // Build file-pair frequency map
  const pairFrequency = new Map<string, { fileA: string; fileB: string; count: number }>();

  for (const task of recentTasks) {
    const files = task.prediction.actualFiles.map(toInternal);
    for (let i = 0; i < files.length; i++) {
      for (let j = i + 1; j < files.length; j++) {
        const sorted = [files[i], files[j]].sort();
        const key = filePairKey(sorted[0], sorted[1]);
        const entry = pairFrequency.get(key);
        if (entry) {
          entry.count++;
        } else {
          pairFrequency.set(key, { fileA: sorted[0], fileB: sorted[1], count: 1 });
        }
      }
    }
  }

  // Build existing co-occurrence lookup
  const existingCoOccMap = new Map<string, CoOccurrence>();
  for (const coOcc of currentPatterns.coOccurrences) {
    const key = filePairKey(coOcc.files[0], coOcc.files[1]);
    existingCoOccMap.set(key, coOcc);
  }

  const existingIds = currentPatterns.coOccurrences.map((c) => c.id ?? '');
  const now = new Date().toISOString();
  const totalTasks = recentTasks.length;

  for (const [key, { fileA, fileB, count }] of pairFrequency) {
    if (count < CO_OCCURRENCE_THRESHOLD) continue;

    const confidence = Math.min(count / totalTasks, 1.0);
    const existing = existingCoOccMap.get(key);

    if (existing) {
      // Update existing
      existing.count = count;
      existing.frequency = count;
      existing.confidence = confidence;
      existing.lastSeen = now;
      updatedCoOccurrences.push(existing);
    } else {
      // Create new
      const id = nextSequenceId('co', existingIds);
      existingIds.push(id);
      const sorted = [fileA, fileB].sort() as [string, string];
      const newPattern: CoOccurrence = {
        id,
        files: sorted,
        count,
        frequency: count,
        confidence,
        lastSeen: now,
        discoveredAt: now,
        decayFactor: 1.0,
      };
      currentPatterns.coOccurrences.push(newPattern);
      newCoOccurrences.push(newPattern);
    }
  }

  return { newCoOccurrences, updatedCoOccurrences };
}

// ─── Task-Type-to-File Affinity Detection ─────────────────────

/**
 * Detect task-type-to-file affinities: which files are consistently used by which task types.
 */
export function detectTypeAffinities(
  recentTasks: TaskEntry[],
  currentPatterns: Patterns,
): TypeAffinities {
  const newAffinities: TypeAffinities = {};

  // Group tasks by type
  const tasksByType = new Map<string, TaskEntry[]>();
  for (const task of recentTasks) {
    const taskType = task.classification.taskType;
    if (!taskType) continue;
    const group = tasksByType.get(taskType);
    if (group) {
      group.push(task);
    } else {
      tasksByType.set(taskType, [task]);
    }
  }

  // For each task type, count file occurrences
  for (const [taskType, tasks] of tasksByType) {
    const fileOccurrences = new Map<string, number>();
    for (const task of tasks) {
      const files = task.prediction.actualFiles.map(toInternal);
      for (const file of files) {
        fileOccurrences.set(file, (fileOccurrences.get(file) ?? 0) + 1);
      }
    }

    const totalTasksOfType = tasks.length;
    const qualifyingFiles: Record<string, { weight: number; occurrences: number }> = {};

    for (const [filePath, occurrences] of fileOccurrences) {
      const weight = occurrences / totalTasksOfType;
      if (occurrences >= AFFINITY_MIN_OCCURRENCES && weight >= AFFINITY_MIN_WEIGHT) {
        qualifyingFiles[filePath] = { weight, occurrences };
      }
    }

    if (Object.keys(qualifyingFiles).length > 0) {
      newAffinities[taskType] = qualifyingFiles;

      // Merge into patterns store
      if (!currentPatterns.typeAffinities[taskType]) {
        currentPatterns.typeAffinities[taskType] = {
          taskType,
          files: [],
          confidence: 0,
          fileWeights: {},
        };
      }
      const affinity = currentPatterns.typeAffinities[taskType];
      affinity.fileWeights = { ...affinity.fileWeights, ...qualifyingFiles };
      affinity.files = Object.keys(affinity.fileWeights);
      // Recalculate average confidence
      const weights = Object.values(affinity.fileWeights);
      affinity.confidence = weights.length > 0
        ? weights.reduce((sum, w) => sum + w.weight, 0) / weights.length
        : 0;
    }
  }

  return newAffinities;
}

// ─── Convention Detection ─────────────────────────────────────

/**
 * Detect recurring conventions from task history.
 * Looks for test co-location patterns, import patterns, and naming conventions.
 */
export function detectConventions(
  recentTasks: TaskEntry[],
  currentPatterns: Patterns,
): { newConventions: Convention[]; updatedConventions: Convention[] } {
  const newConventions: Convention[] = [];
  const updatedConventions: Convention[] = [];
  const totalTasks = recentTasks.length;

  if (totalTasks < CONVENTION_MIN_EVIDENCE) {
    return { newConventions, updatedConventions };
  }

  // Convention detectors
  const conventionCandidates: Array<{
    pattern: string;
    evidence: number;
    examples: string[];
  }> = [];

  // Detect test co-location pattern
  let testCoLocationCount = 0;
  const testCoLocationExamples: string[] = [];
  for (const task of recentTasks) {
    const files = task.prediction.actualFiles.map(toInternal);
    const hasTestAndSource = files.some((f) => /\.test\.|\.spec\.|__tests__/.test(f)) &&
      files.some((f) => !/\.test\.|\.spec\.|__tests__/.test(f));
    if (hasTestAndSource) {
      testCoLocationCount++;
      const testFile = files.find((f) => /\.test\.|\.spec\.|__tests__/.test(f));
      if (testFile && testCoLocationExamples.length < 5) {
        testCoLocationExamples.push(testFile);
      }
    }
  }
  if (testCoLocationCount >= CONVENTION_MIN_EVIDENCE) {
    conventionCandidates.push({
      pattern: 'Test files co-located with source files',
      evidence: testCoLocationCount,
      examples: testCoLocationExamples,
    });
  }

  // Detect .js extension in imports pattern
  let jsExtensionCount = 0;
  const jsExtensionExamples: string[] = [];
  for (const task of recentTasks) {
    const files = task.prediction.actualFiles.map(toInternal);
    const hasJsFiles = files.some((f) => /\.(js|ts)$/.test(f));
    if (hasJsFiles) {
      jsExtensionCount++;
      const jsFile = files.find((f) => /\.(js|ts)$/.test(f));
      if (jsFile && jsExtensionExamples.length < 5) {
        jsExtensionExamples.push(jsFile);
      }
    }
  }
  // Only detect if consistently present
  if (jsExtensionCount >= CONVENTION_MIN_EVIDENCE) {
    const confidence = jsExtensionCount / totalTasks;
    if (confidence >= CONVENTION_MIN_CONFIDENCE) {
      conventionCandidates.push({
        pattern: 'TypeScript/JavaScript source files used consistently',
        evidence: jsExtensionCount,
        examples: jsExtensionExamples,
      });
    }
  }

  // Detect index barrel pattern
  let barrelPatternCount = 0;
  const barrelExamples: string[] = [];
  for (const task of recentTasks) {
    const files = task.prediction.actualFiles.map(toInternal);
    const hasIndex = files.some((f) => /\/index\.(ts|js)$/.test(f));
    if (hasIndex) {
      barrelPatternCount++;
      const indexFile = files.find((f) => /\/index\.(ts|js)$/.test(f));
      if (indexFile && barrelExamples.length < 5) {
        barrelExamples.push(indexFile);
      }
    }
  }
  if (barrelPatternCount >= CONVENTION_MIN_EVIDENCE) {
    const confidence = barrelPatternCount / totalTasks;
    if (confidence >= CONVENTION_MIN_CONFIDENCE) {
      conventionCandidates.push({
        pattern: 'Barrel index files used for module exports',
        evidence: barrelPatternCount,
        examples: barrelExamples,
      });
    }
  }

  // Process convention candidates
  const existingPatterns = new Set(currentPatterns.conventions.map((c) => c.pattern));
  const existingIds = currentPatterns.conventions.map((c) => c.id ?? '');

  for (const candidate of conventionCandidates) {
    const confidence = candidate.evidence / totalTasks;
    if (confidence < CONVENTION_MIN_CONFIDENCE) continue;

    // Check for duplicate by pattern similarity
    const isExisting = existingPatterns.has(candidate.pattern);

    if (isExisting) {
      // Update existing convention
      const existing = currentPatterns.conventions.find((c) => c.pattern === candidate.pattern);
      if (existing) {
        existing.confidence = confidence;
        existing.evidenceCount = candidate.evidence;
        existing.examples = candidate.examples;
        updatedConventions.push(existing);
      }
    } else {
      // Create new convention
      const id = nextSequenceId('conv', existingIds);
      existingIds.push(id);
      const newConv: Convention = {
        id,
        pattern: candidate.pattern,
        description: candidate.pattern,
        confidence,
        evidenceCount: candidate.evidence,
        examples: candidate.examples,
      };
      currentPatterns.conventions.push(newConv);
      newConventions.push(newConv);
    }
  }

  return { newConventions, updatedConventions };
}

// ─── Main Detection Entry Point ───────────────────────────────

/**
 * Run all pattern detection passes on recent task history.
 * Mutates currentPatterns in place and returns a summary of changes.
 */
export function detectPatterns(
  taskHistory: TaskEntry[],
  currentPatterns: Patterns,
): PatternDetectionResult {
  // Take the most recent N tasks
  const recentTasks = taskHistory.slice(-RECENT_HISTORY_WINDOW);

  if (recentTasks.length === 0) {
    return {
      newCoOccurrences: [],
      updatedCoOccurrences: [],
      newAffinities: {},
      newConventions: [],
      updatedConventions: [],
    };
  }

  // Pass 1: Co-occurrence detection
  const { newCoOccurrences, updatedCoOccurrences } = detectCoOccurrences(recentTasks, currentPatterns);

  // Pass 2: Task-type-to-file affinity detection
  const newAffinities = detectTypeAffinities(recentTasks, currentPatterns);

  // Pass 3: Convention detection
  const { newConventions, updatedConventions } = detectConventions(recentTasks, currentPatterns);

  return {
    newCoOccurrences,
    updatedCoOccurrences,
    newAffinities,
    newConventions,
    updatedConventions,
  };
}
