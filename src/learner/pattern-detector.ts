/**
 * Pattern detector module — detects co-occurrence patterns, task-type-to-file affinities,
 * and conventions from task history. (Story 3.2)
 */

import type { TaskEntry, Patterns, CoOccurrence, Convention, ProjectMap } from '../types/index.js';
import { toInternal } from '../utils/index.js';
import type { PatternDetectionResult, TypeAffinities, ConventionDetector } from './types.js';
import {
  CO_OCCURRENCE_THRESHOLD,
  AFFINITY_MIN_OCCURRENCES,
  AFFINITY_MIN_WEIGHT,
  CONVENTION_MIN_EVIDENCE,
  CONVENTION_MIN_CONFIDENCE,
  RECENT_HISTORY_WINDOW,
  MAX_COOCCURRENCE_FILES,
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
    const allFiles = task.prediction.actualFiles.map(toInternal);
    // L17: Skip tasks with too many files (bulk operations) and cap pair computation
    if (allFiles.length > MAX_COOCCURRENCE_FILES * 2) continue;
    const files = allFiles.slice(0, MAX_COOCCURRENCE_FILES);
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

// ─── Convention Detection (L18: Pluggable Detectors) ──────────

/**
 * L18: Registry of pluggable convention detectors.
 * Each detector looks for a specific pattern in task file history.
 */
const CONVENTION_DETECTORS: ConventionDetector[] = [
  // Original 3 detectors (refactored)
  {
    id: 'test-colocation',
    pattern: 'Test files co-located with source files',
    detect(tasks) {
      let count = 0;
      const examples: string[] = [];
      for (const task of tasks) {
        const files = task.prediction.actualFiles.map(toInternal);
        const hasTestAndSource = files.some((f) => /\.test\.|\.spec\.|__tests__/.test(f)) &&
          files.some((f) => !/\.test\.|\.spec\.|__tests__/.test(f));
        if (hasTestAndSource) {
          count++;
          const testFile = files.find((f) => /\.test\.|\.spec\.|__tests__/.test(f));
          if (testFile && examples.length < 5) examples.push(testFile);
        }
      }
      return count >= CONVENTION_MIN_EVIDENCE ? { evidence: count, examples } : null;
    },
  },
  {
    id: 'ts-js-source',
    pattern: 'TypeScript/JavaScript source files used consistently',
    detect(tasks) {
      let count = 0;
      const examples: string[] = [];
      for (const task of tasks) {
        const files = task.prediction.actualFiles.map(toInternal);
        if (files.some((f) => /\.(js|ts)$/.test(f))) {
          count++;
          const jsFile = files.find((f) => /\.(js|ts)$/.test(f));
          if (jsFile && examples.length < 5) examples.push(jsFile);
        }
      }
      if (count < CONVENTION_MIN_EVIDENCE) return null;
      const confidence = count / tasks.length;
      return confidence >= CONVENTION_MIN_CONFIDENCE ? { evidence: count, examples } : null;
    },
  },
  {
    id: 'barrel-exports',
    pattern: 'Barrel index files used for module exports',
    detect(tasks) {
      let count = 0;
      const examples: string[] = [];
      for (const task of tasks) {
        const files = task.prediction.actualFiles.map(toInternal);
        if (files.some((f) => /\/index\.(ts|js)$/.test(f))) {
          count++;
          const indexFile = files.find((f) => /\/index\.(ts|js)$/.test(f));
          if (indexFile && examples.length < 5) examples.push(indexFile);
        }
      }
      if (count < CONVENTION_MIN_EVIDENCE) return null;
      const confidence = count / tasks.length;
      return confidence >= CONVENTION_MIN_CONFIDENCE ? { evidence: count, examples } : null;
    },
  },
  // L18: New detectors
  {
    id: 'css-component-pairing',
    pattern: 'Style files paired with component files',
    detect(tasks) {
      let count = 0;
      const examples: string[] = [];
      for (const task of tasks) {
        const files = task.prediction.actualFiles.map(toInternal);
        const hasStyle = files.some((f) => /\.(css|scss|less|styled)\b/.test(f));
        const hasComponent = files.some((f) => /\.(tsx|jsx|vue|svelte)$/.test(f));
        if (hasStyle && hasComponent) {
          count++;
          const styleFile = files.find((f) => /\.(css|scss|less|styled)\b/.test(f));
          if (styleFile && examples.length < 5) examples.push(styleFile);
        }
      }
      return count >= CONVENTION_MIN_EVIDENCE ? { evidence: count, examples } : null;
    },
  },
  {
    id: 'migration-model-pairing',
    pattern: 'Migration files paired with model changes',
    detect(tasks) {
      let count = 0;
      const examples: string[] = [];
      for (const task of tasks) {
        const files = task.prediction.actualFiles.map(toInternal);
        const hasMigration = files.some((f) => /migrat/i.test(f));
        const hasModel = files.some((f) => /model|schema|entity/i.test(f));
        if (hasMigration && hasModel) {
          count++;
          const migFile = files.find((f) => /migrat/i.test(f));
          if (migFile && examples.length < 5) examples.push(migFile);
        }
      }
      return count >= CONVENTION_MIN_EVIDENCE ? { evidence: count, examples } : null;
    },
  },
  {
    id: 'config-feature-pairing',
    pattern: 'Config files paired with feature changes',
    detect(tasks) {
      let count = 0;
      const examples: string[] = [];
      for (const task of tasks) {
        const files = task.prediction.actualFiles.map(toInternal);
        const hasConfig = files.some((f) => /config|\.env|settings/i.test(f));
        const hasFeature = files.some((f) => !/config|\.env|settings/i.test(f) && /\.(ts|js|py|go|rs)$/.test(f));
        if (hasConfig && hasFeature) {
          count++;
          const configFile = files.find((f) => /config|\.env|settings/i.test(f));
          if (configFile && examples.length < 5) examples.push(configFile);
        }
      }
      if (count < CONVENTION_MIN_EVIDENCE) return null;
      const confidence = count / tasks.length;
      return confidence >= CONVENTION_MIN_CONFIDENCE ? { evidence: count, examples } : null;
    },
  },
  {
    id: 'middleware-hook-pairing',
    pattern: 'Middleware/hook files paired with route handlers',
    detect(tasks) {
      let count = 0;
      const examples: string[] = [];
      for (const task of tasks) {
        const files = task.prediction.actualFiles.map(toInternal);
        const hasMiddleware = files.some((f) => /middleware|hook|interceptor|guard/i.test(f));
        const hasHandler = files.some((f) => /route|controller|handler|endpoint|api/i.test(f));
        if (hasMiddleware && hasHandler) {
          count++;
          const mwFile = files.find((f) => /middleware|hook|interceptor|guard/i.test(f));
          if (mwFile && examples.length < 5) examples.push(mwFile);
        }
      }
      return count >= CONVENTION_MIN_EVIDENCE ? { evidence: count, examples } : null;
    },
  },
];

/**
 * Detect recurring conventions from task history (L18: pluggable detector registry).
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

  // Run all pluggable detectors
  const candidates: Array<{ pattern: string; evidence: number; examples: string[] }> = [];

  for (const detector of CONVENTION_DETECTORS) {
    const result = detector.detect(recentTasks);
    if (result) {
      candidates.push({
        pattern: detector.pattern,
        evidence: result.evidence,
        examples: result.examples,
      });
    }
  }

  // Process convention candidates
  const existingPatterns = new Set(currentPatterns.conventions.map((c) => c.pattern));
  const existingIds = currentPatterns.conventions.map((c) => c.id ?? '');

  for (const candidate of candidates) {
    const confidence = candidate.evidence / totalTasks;
    if (confidence < CONVENTION_MIN_CONFIDENCE) continue;

    const isExisting = existingPatterns.has(candidate.pattern);

    if (isExisting) {
      const existing = currentPatterns.conventions.find((c) => c.pattern === candidate.pattern);
      if (existing) {
        existing.confidence = confidence;
        existing.evidenceCount = candidate.evidence;
        existing.examples = candidate.examples;
        updatedConventions.push(existing);
      }
    } else {
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
 * Validate pattern file paths against projectMap (L19).
 * Removes co-occurrences where either file doesn't exist and
 * removes affinity entries for missing files.
 */
function pruneDeletedFiles(patterns: Patterns, projectMap: ProjectMap): number {
  let pruned = 0;
  const validFiles = new Set(Object.keys(projectMap.files));

  // Prune co-occurrences referencing deleted files
  const validCoOccs = patterns.coOccurrences.filter((coOcc) => {
    const [fileA, fileB] = coOcc.files;
    if (!validFiles.has(fileA) || !validFiles.has(fileB)) {
      pruned++;
      return false;
    }
    return true;
  });
  patterns.coOccurrences = validCoOccs;

  // Prune type affinity entries for deleted files
  for (const [, affinity] of Object.entries(patterns.typeAffinities)) {
    if (!affinity.fileWeights) continue;
    for (const filePath of Object.keys(affinity.fileWeights)) {
      if (!validFiles.has(filePath)) {
        delete affinity.fileWeights[filePath];
        pruned++;
      }
    }
    affinity.files = Object.keys(affinity.fileWeights);
  }

  return pruned;
}

/**
 * Run all pattern detection passes on recent task history.
 * Mutates currentPatterns in place and returns a summary of changes.
 * L19: Optionally validates file paths against projectMap.
 */
export function detectPatterns(
  taskHistory: TaskEntry[],
  currentPatterns: Patterns,
  projectMap?: ProjectMap,
): PatternDetectionResult {
  // L19: Prune patterns referencing deleted files
  if (projectMap) {
    pruneDeletedFiles(currentPatterns, projectMap);
  }

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
