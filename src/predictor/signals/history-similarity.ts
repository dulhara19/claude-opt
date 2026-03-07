/**
 * History Similarity Signal — scores files by keyword overlap with past tasks' actual files.
 *
 * Improvements:
 * - H1: Stemming via shared stem() function
 * - H2: Synonym expansion for common dev terms
 * - H3: Task action stopwords filtered out
 * - K1: TF-IDF weighting (rare keywords count more)
 * - H4: Recency decay on past tasks (30-day half-life)
 * - H5: Negative history signal (dampen files predicted but never used)
 * - K2: Bigram extraction for multi-word concepts
 */

import type { TaskHistory, KeywordIndex } from '../../types/index.js';
import type { SignalScore } from '../types.js';
import { SignalSource } from '../types.js';
import { stem, TASK_ACTION_STOPWORDS } from '../../utils/index.js';

/** Half-life in days for task recency decay. */
const TASK_RECENCY_HALF_LIFE = 30;

/**
 * H2: Synonym groups for common development terms.
 * Each group contains words that should match each other during keyword comparison.
 */
const SYNONYM_GROUPS: string[][] = [
  ['auth', 'authentication', 'login', 'signin', 'signon'],
  ['bug', 'issue', 'defect', 'problem'],
  ['error', 'exception', 'failure', 'crash'],
  ['test', 'spec', 'testing'],
  ['refactor', 'restructure', 'cleanup', 'reorganize'],
  ['config', 'configuration', 'settings', 'options', 'prefs'],
  ['database', 'datastore'],
  ['api', 'endpoint', 'route'],
  ['component', 'widget', 'element'],
  ['deploy', 'deployment', 'release', 'publish'],
  ['docs', 'documentation', 'readme'],
  ['style', 'css', 'styling', 'theme'],
  ['perf', 'performance', 'optimization', 'speed'],
  ['security', 'vulnerability', 'permissions'],
  ['validate', 'validation', 'validator'],
  ['migrate', 'migration'],
  ['middleware', 'interceptor'],
  ['cache', 'caching', 'memoize'],
];

// Build reverse lookup: word → set of synonyms (excluding itself)
const SYNONYM_MAP = new Map<string, Set<string>>();
for (const group of SYNONYM_GROUPS) {
  for (const word of group) {
    const synonyms = SYNONYM_MAP.get(word) ?? new Set<string>();
    for (const other of group) {
      if (other !== word) synonyms.add(other);
    }
    SYNONYM_MAP.set(word, synonyms);
  }
}

/**
 * H2: Expand a keyword with its synonyms.
 * Returns the original keyword plus any synonyms from the synonym map.
 */
export function expandSynonyms(keyword: string): string[] {
  const synonyms = SYNONYM_MAP.get(keyword);
  if (!synonyms) return [keyword];
  return [keyword, ...synonyms];
}

/**
 * Extract keywords from a text prompt.
 * Applies: lowercase split, length filter, stemming (H1), stopword removal (H3),
 * synonym expansion (H2), bigram extraction (K2).
 * Returns deduplicated keyword list (raw + stemmed + synonym + bigram forms).
 */
export function extractKeywords(text: string): string[] {
  const raw = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);

  const keywords: string[] = [];
  const nonStopwords: string[] = []; // Track non-stopword sequence for bigrams

  for (const word of raw) {
    // H3: Skip task-action stopwords
    if (TASK_ACTION_STOPWORDS.has(word)) continue;

    keywords.push(word);
    nonStopwords.push(word);

    // H1: Add stemmed form if different
    const stemmed = stem(word);
    if (stemmed !== word && stemmed.length > 2) {
      keywords.push(stemmed);
    }

    // H2: Add synonyms
    const synonyms = SYNONYM_MAP.get(word);
    if (synonyms) {
      for (const syn of synonyms) {
        if (!TASK_ACTION_STOPWORDS.has(syn)) {
          keywords.push(syn);
        }
      }
    }
    // Also check stemmed form for synonyms
    if (stemmed !== word) {
      const stemmedSynonyms = SYNONYM_MAP.get(stemmed);
      if (stemmedSynonyms) {
        for (const syn of stemmedSynonyms) {
          if (!TASK_ACTION_STOPWORDS.has(syn)) {
            keywords.push(syn);
          }
        }
      }
    }
  }

  // K2: Extract bigrams from adjacent non-stopword pairs
  for (let i = 0; i < nonStopwords.length - 1; i++) {
    const bigram = `${nonStopwords[i]}_${nonStopwords[i + 1]}`;
    keywords.push(bigram);
  }

  return [...new Set(keywords)];
}

/** H5: Minimum similar tasks before applying negative dampening. */
const NEGATIVE_MIN_TASKS = 3;
/** H5: Dampening factor for files predicted but never used in similar tasks. */
const NEGATIVE_DAMPENING = 0.5;

/**
 * H5: Apply negative dampening to files that were repeatedly predicted
 * but never actually used in similar past tasks.
 *
 * If a file appears in predictedFiles but NOT in actualFiles for 3+ similar tasks,
 * its score is multiplied by 0.5.
 */
export function applyNegativeDampening(
  scores: Map<string, SignalScore>,
  taskKeywords: string[],
  history: TaskHistory | undefined,
): Map<string, SignalScore> {
  if (!history || history.tasks.length < NEGATIVE_MIN_TASKS) return scores;

  const taskKeywordSet = new Set(taskKeywords);

  // Count per-file: how many similar tasks predicted it vs how many it was actually used
  const fileFalsePositives = new Map<string, { predicted: number; actual: number }>();

  for (const entry of history.tasks) {
    const pastKeywords = extractKeywords(entry.taskText);
    const overlap = pastKeywords.filter((k) => taskKeywordSet.has(k));
    if (overlap.length === 0) continue; // Not a similar task

    const actualSet = new Set(entry.prediction.actualFiles);

    for (const file of entry.prediction.predictedFiles) {
      const existing = fileFalsePositives.get(file) ?? { predicted: 0, actual: 0 };
      existing.predicted += 1;
      if (actualSet.has(file)) {
        existing.actual += 1;
      }
      fileFalsePositives.set(file, existing);
    }
  }

  // Dampen files that were predicted 3+ times in similar tasks but never actually used
  const dampened = new Map<string, SignalScore>();
  for (const [filePath, score] of scores) {
    const stats = fileFalsePositives.get(filePath);
    if (stats && stats.predicted >= NEGATIVE_MIN_TASKS && stats.actual === 0) {
      dampened.set(filePath, {
        ...score,
        score: score.score * NEGATIVE_DAMPENING,
        reason: `${score.reason} (dampened: predicted ${stats.predicted}× but never used)`,
      });
    } else {
      dampened.set(filePath, score);
    }
  }

  return dampened;
}

/**
 * Compute IDF weight for a keyword (K1).
 * idf = log(totalFiles / filesContainingKeyword)
 * Returns 1.0 if no index available (neutral weight).
 */
function computeIdf(keyword: string, index: KeywordIndex | undefined): number {
  if (!index) return 1.0;

  const totalFiles = Object.keys(index.fileToKeywords).length;
  if (totalFiles === 0) return 1.0;

  const files = index.keywordToFiles[keyword];
  const docFreq = files ? files.length : 0;
  if (docFreq === 0) return 1.0;

  return Math.log(totalFiles / docFreq);
}

/**
 * Compute time-based decay factor for a past task (H4).
 * decay = exp(-daysSinceTask / HALF_LIFE)
 */
function computeRecencyDecay(taskTimestamp: string): number {
  const taskDate = new Date(taskTimestamp).getTime();
  if (isNaN(taskDate)) return 1.0;

  const daysSince = (Date.now() - taskDate) / (1000 * 60 * 60 * 24);
  if (daysSince < 0) return 1.0;

  return Math.exp(-daysSince / TASK_RECENCY_HALF_LIFE);
}

/**
 * Score candidate files based on similarity to past tasks' actual file lists.
 * Returns a map of filePath → SignalScore.
 *
 * Applies:
 * - K1: IDF weighting on keyword overlap (rare keywords count more)
 * - H4: Recency decay on past task age (30-day half-life)
 *
 * On cold start (no history), returns an empty map.
 */
export function scoreHistorySimilarity(
  taskKeywords: string[],
  history: TaskHistory | undefined,
  keywordIndex?: KeywordIndex,
): Map<string, SignalScore> {
  const scores = new Map<string, SignalScore>();

  if (!history || history.tasks.length === 0) return scores;

  const taskKeywordSet = new Set(taskKeywords);

  // Pre-compute IDF for all current task keywords (K1)
  const keywordIdfs = new Map<string, number>();
  for (const kw of taskKeywords) {
    keywordIdfs.set(kw, computeIdf(kw, keywordIndex));
  }

  const fileCounts = new Map<string, { totalWeight: number; matchCount: number }>();

  for (const entry of history.tasks) {
    const pastKeywords = extractKeywords(entry.taskText);
    const overlap = pastKeywords.filter((k) => taskKeywordSet.has(k));
    if (overlap.length === 0) continue;

    // K1: IDF-weighted overlap — rare keyword matches count more
    let idfWeightedOverlap = 0;
    let totalIdf = 0;
    for (const kw of taskKeywords) {
      const idf = keywordIdfs.get(kw) ?? 1.0;
      totalIdf += idf;
      if (overlap.includes(kw)) {
        idfWeightedOverlap += idf;
      }
    }
    const overlapRatio = totalIdf > 0 ? idfWeightedOverlap / totalIdf : 0;

    // H4: Apply recency decay based on task age
    const recencyDecay = computeRecencyDecay(entry.timestamp);
    const decayedWeight = overlapRatio * recencyDecay;

    if (decayedWeight < 0.01) continue;

    for (const file of entry.prediction.actualFiles) {
      const existing = fileCounts.get(file) ?? { totalWeight: 0, matchCount: 0 };
      existing.totalWeight += decayedWeight;
      existing.matchCount += 1;
      fileCounts.set(file, existing);
    }
  }

  // Normalize scores to 0-1 range
  let maxWeight = 0;
  for (const { totalWeight } of fileCounts.values()) {
    if (totalWeight > maxWeight) maxWeight = totalWeight;
  }

  if (maxWeight === 0) return scores;

  for (const [filePath, { totalWeight, matchCount }] of fileCounts) {
    const normalizedScore = totalWeight / maxWeight;
    scores.set(filePath, {
      source: SignalSource.HistorySimilarity,
      score: normalizedScore,
      weight: 0,
      reason: `Appeared in ${matchCount} similar past task(s)`,
    });
  }

  // H5: Apply negative dampening for files predicted but never used
  return applyNegativeDampening(scores, taskKeywords, history);
}
