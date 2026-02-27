/**
 * Adaptive Signal Weight Learning (#4).
 * Tracks per-signal accuracy and updates weights via EMA.
 *
 * After each task, credits/debits signals based on whether the files
 * they predicted turned out to be actually used. Weights are updated
 * using an exponential moving average of per-signal precision.
 */

import type { Metrics, SignalAccuracy, KeywordIndex, DependencyGraph, Patterns } from '../types/index.js';
import type { FilePrediction, SignalWeights } from '../predictor/types.js';
import { SignalSource, DEFAULT_SIGNAL_WEIGHTS } from '../predictor/types.js';
import { toInternal, logger } from '../utils/index.js';
import { ACCURACY_DECAY, SINGLE_SIGNAL_EMA } from './types.js';

const MODULE = 'learner:signal-weights';

/** EMA smoothing factor — how fast weights adapt. */
const EMA_ALPHA = 0.1;

/** Minimum weight floor — no signal goes below this. */
const MIN_WEIGHT = 0.05;

/** Map from SignalSource enum to SignalWeights key. */
const SIGNAL_KEY_MAP: Record<string, keyof SignalWeights> = {
  [SignalSource.HistorySimilarity]: 'history',
  [SignalSource.GraphTraversal]: 'graph',
  [SignalSource.KeywordLookup]: 'keyword',
  [SignalSource.CooccurrenceBoost]: 'cooccurrence',
  [SignalSource.TypeAffinity]: 'typeAffinity',
  [SignalSource.GitContext]: 'gitContext',
  [SignalSource.FileRecency]: 'fileRecency',
};

/**
 * Update per-signal accuracy counts based on prediction results vs actual files.
 * A signal gets a true positive if it predicted a file that was actually used.
 * A signal gets a false positive if it predicted a file that was NOT used.
 */
export function updateSignalAccuracy(
  metrics: Metrics,
  predictions: FilePrediction[],
  actualFiles: Set<string>,
): void {
  if (!metrics.signalAccuracy) {
    metrics.signalAccuracy = {};
  }

  for (const pred of predictions) {
    const isActual = actualFiles.has(pred.filePath);

    for (const signal of pred.signals) {
      const source = signal.source;
      if (!metrics.signalAccuracy[source]) {
        metrics.signalAccuracy[source] = { truePositives: 0, falsePositives: 0, totalPredictions: 0 };
      }
      const acc = metrics.signalAccuracy[source];
      // L8: Apply temporal decay before adding new observation
      acc.truePositives = acc.truePositives * ACCURACY_DECAY + (isActual ? 1 : 0);
      acc.falsePositives = acc.falsePositives * ACCURACY_DECAY + (isActual ? 0 : 1);
      acc.totalPredictions = acc.truePositives + acc.falsePositives;
    }
  }
}

/**
 * Track missed opportunities for signals that had data for false negative files (L7).
 * For each false negative, checks which signals could have scored it.
 */
export function trackMissedOpportunities(
  metrics: Metrics,
  falseNegatives: string[],
  taskType: string,
  keywordIndex: KeywordIndex,
  graph: DependencyGraph,
  patterns: Patterns,
): void {
  if (falseNegatives.length === 0) return;
  if (!metrics.signalAccuracy) metrics.signalAccuracy = {};

  for (const rawFile of falseNegatives) {
    const file = toInternal(rawFile);

    // KeywordLookup: file exists in keyword index
    if (keywordIndex.fileToKeywords[file]?.length) {
      incrementMissed(metrics.signalAccuracy, SignalSource.KeywordLookup);
    }
    // GraphTraversal: file has adjacency entries
    if (graph.adjacency[file]) {
      incrementMissed(metrics.signalAccuracy, SignalSource.GraphTraversal);
    }
    // TypeAffinity: file is in affinity for this task type
    if (patterns.typeAffinities[taskType]?.fileWeights?.[file]) {
      incrementMissed(metrics.signalAccuracy, SignalSource.TypeAffinity);
    }
    // CooccurrenceBoost: file appears in a co-occurrence pattern
    if (patterns.coOccurrences.some((co) => co.files[0] === file || co.files[1] === file)) {
      incrementMissed(metrics.signalAccuracy, SignalSource.CooccurrenceBoost);
    }
  }
}

function incrementMissed(accuracy: Record<string, SignalAccuracy>, source: SignalSource): void {
  if (!accuracy[source]) {
    accuracy[source] = { truePositives: 0, falsePositives: 0, totalPredictions: 0 };
  }
  accuracy[source].missedOpportunities = (accuracy[source].missedOpportunities ?? 0) + 1;
}

/**
 * Compute adjusted precision that factors in missed opportunities (L7).
 * adjustedPrecision = TP / (TP + FP + 0.5 × missedOpportunities)
 */
function adjustedPrecision(acc: SignalAccuracy): number {
  const missed = acc.missedOpportunities ?? 0;
  const denominator = acc.truePositives + acc.falsePositives + 0.5 * missed;
  return denominator > 0 ? acc.truePositives / denominator : 0;
}

/**
 * Compute new learned signal weights using EMA of per-signal precision.
 * L7: Uses adjusted precision (factors in missed opportunities).
 * L9: Single-signal learning with conservative EMA rate.
 * All weights are normalized to sum to 1.0, with a minimum floor.
 */
export function updateLearnedWeights(metrics: Metrics): void {
  const accuracy = metrics.signalAccuracy;
  if (!accuracy) return;

  // Compute precision for each signal (L7: adjusted precision)
  const precisions: Record<string, number> = {};
  let totalPrecision = 0;

  for (const [source, acc] of Object.entries(accuracy)) {
    // Need minimum observations before learning
    if (acc.totalPredictions < 10) continue;
    const precision = adjustedPrecision(acc);
    precisions[source] = precision;
    totalPrecision += precision;
  }

  const signalCount = Object.keys(precisions).length;

  // L9: Single-signal learning — conservative adjustment when only 1 signal qualifies
  if (signalCount === 1 && totalPrecision > 0) {
    const [source, precision] = Object.entries(precisions)[0];

    const currentWeights: Record<string, number> = metrics.learnedSignalWeights
      ? { ...metrics.learnedSignalWeights }
      : {};

    // Fill defaults
    for (const [src, key] of Object.entries(SIGNAL_KEY_MAP)) {
      if (!(src in currentWeights)) {
        currentWeights[src] = DEFAULT_SIGNAL_WEIGHTS[key];
      }
    }

    // Conservative single-signal update (half EMA rate)
    const current = currentWeights[source] ?? 0.15;
    const target = Math.max(precision, MIN_WEIGHT);
    const updated = SINGLE_SIGNAL_EMA * target + (1 - SINGLE_SIGNAL_EMA) * current;
    currentWeights[source] = Math.max(updated, MIN_WEIGHT);

    // Normalize
    const totalWeight = Object.values(currentWeights).reduce((a, b) => a + b, 0);
    if (totalWeight > 0) {
      for (const key of Object.keys(currentWeights)) {
        currentWeights[key] = currentWeights[key] / totalWeight;
      }
    }

    metrics.learnedSignalWeights = currentWeights;
    logger.debug(MODULE, `Single-signal update for ${source}: ${updated.toFixed(3)}`);
    return;
  }

  // Need at least 2 signals with enough data for full learning
  if (signalCount < 2 || totalPrecision === 0) return;

  // Get current weights (learned or default)
  const currentWeights: Record<string, number> = metrics.learnedSignalWeights
    ? { ...metrics.learnedSignalWeights }
    : {};

  // Fill defaults for missing entries
  for (const [source, key] of Object.entries(SIGNAL_KEY_MAP)) {
    if (!(source in currentWeights)) {
      currentWeights[source] = DEFAULT_SIGNAL_WEIGHTS[key];
    }
  }

  // EMA update for signals with enough data
  for (const [source, precision] of Object.entries(precisions)) {
    const target = precision / totalPrecision; // Normalized target weight
    const current = currentWeights[source] ?? DEFAULT_SIGNAL_WEIGHTS[SIGNAL_KEY_MAP[source] ?? 'keyword'] ?? 0.15;
    const updated = EMA_ALPHA * target + (1 - EMA_ALPHA) * current;
    currentWeights[source] = Math.max(updated, MIN_WEIGHT);
  }

  // Normalize so weights sum to 1.0
  const totalWeight = Object.values(currentWeights).reduce((a, b) => a + b, 0);
  if (totalWeight > 0) {
    for (const key of Object.keys(currentWeights)) {
      currentWeights[key] = currentWeights[key] / totalWeight;
    }
  }

  metrics.learnedSignalWeights = currentWeights;

  logger.debug(MODULE, `Updated signal weights: ${Object.entries(currentWeights).map(([k, v]) => `${k}=${v.toFixed(3)}`).join(', ')}`);
}

/** Minimum tasks for a domain before using per-domain weights (#9). */
const MIN_DOMAIN_TASKS = 15;

/**
 * Update per-domain signal accuracy counts (#9).
 */
export function updateDomainSignalAccuracy(
  metrics: Metrics,
  predictions: FilePrediction[],
  actualFiles: Set<string>,
  domain: string,
): void {
  if (!domain || domain === 'unknown') return;
  if (!metrics.domainSignalAccuracy) {
    metrics.domainSignalAccuracy = {};
  }

  for (const pred of predictions) {
    const isActual = actualFiles.has(pred.filePath);

    for (const signal of pred.signals) {
      const key = `${domain}:${signal.source}`;
      if (!metrics.domainSignalAccuracy[key]) {
        metrics.domainSignalAccuracy[key] = { truePositives: 0, falsePositives: 0, totalPredictions: 0 };
      }
      const acc = metrics.domainSignalAccuracy[key];
      // L8: Apply temporal decay before adding new observation
      acc.truePositives = acc.truePositives * ACCURACY_DECAY + (isActual ? 1 : 0);
      acc.falsePositives = acc.falsePositives * ACCURACY_DECAY + (isActual ? 0 : 1);
      acc.totalPredictions = acc.truePositives + acc.falsePositives;
    }
  }
}

/**
 * Compute per-domain learned weights using EMA (#9).
 * Only learns when a domain has MIN_DOMAIN_TASKS+ observations per signal.
 */
export function updateDomainLearnedWeights(metrics: Metrics, domain: string): void {
  if (!domain || domain === 'unknown') return;
  if (!metrics.domainSignalAccuracy) return;

  const precisions: Record<string, number> = {};
  let totalPrecision = 0;

  for (const [key, acc] of Object.entries(metrics.domainSignalAccuracy)) {
    if (!key.startsWith(`${domain}:`)) continue;
    if (acc.totalPredictions < MIN_DOMAIN_TASKS) continue;
    const source = key.slice(domain.length + 1);
    // L7: Use adjusted precision
    const precision = adjustedPrecision(acc);
    precisions[source] = precision;
    totalPrecision += precision;
  }

  const signalCount = Object.keys(precisions).length;

  // L9: Single-signal domain learning
  if (signalCount === 1 && totalPrecision > 0) {
    if (!metrics.domainSignalWeights) metrics.domainSignalWeights = {};

    const [source, precision] = Object.entries(precisions)[0];
    const currentWeights: Record<string, number> = metrics.domainSignalWeights[domain]
      ? { ...metrics.domainSignalWeights[domain] }
      : metrics.learnedSignalWeights
        ? { ...metrics.learnedSignalWeights }
        : {};

    for (const [src, key] of Object.entries(SIGNAL_KEY_MAP)) {
      if (!(src in currentWeights)) currentWeights[src] = DEFAULT_SIGNAL_WEIGHTS[key];
    }

    const current = currentWeights[source] ?? 0.15;
    const target = Math.max(precision, MIN_WEIGHT);
    const updated = SINGLE_SIGNAL_EMA * target + (1 - SINGLE_SIGNAL_EMA) * current;
    currentWeights[source] = Math.max(updated, MIN_WEIGHT);

    const totalWeight = Object.values(currentWeights).reduce((a, b) => a + b, 0);
    if (totalWeight > 0) {
      for (const k of Object.keys(currentWeights)) currentWeights[k] = currentWeights[k] / totalWeight;
    }

    metrics.domainSignalWeights[domain] = currentWeights;
    logger.debug(MODULE, `Single-signal domain update for ${domain}:${source}`);
    return;
  }

  if (signalCount < 2 || totalPrecision === 0) return;

  if (!metrics.domainSignalWeights) {
    metrics.domainSignalWeights = {};
  }

  const currentWeights: Record<string, number> = metrics.domainSignalWeights[domain]
    ? { ...metrics.domainSignalWeights[domain] }
    : metrics.learnedSignalWeights
      ? { ...metrics.learnedSignalWeights }
      : {};

  // Fill defaults
  for (const [source, key] of Object.entries(SIGNAL_KEY_MAP)) {
    if (!(source in currentWeights)) {
      currentWeights[source] = DEFAULT_SIGNAL_WEIGHTS[key];
    }
  }

  // EMA update
  for (const [source, precision] of Object.entries(precisions)) {
    const target = precision / totalPrecision;
    const current = currentWeights[source] ?? 0.15;
    const updated = EMA_ALPHA * target + (1 - EMA_ALPHA) * current;
    currentWeights[source] = Math.max(updated, MIN_WEIGHT);
  }

  // Normalize
  const totalWeight = Object.values(currentWeights).reduce((a, b) => a + b, 0);
  if (totalWeight > 0) {
    for (const key of Object.keys(currentWeights)) {
      currentWeights[key] = currentWeights[key] / totalWeight;
    }
  }

  metrics.domainSignalWeights[domain] = currentWeights;
  logger.debug(MODULE, `Updated domain weights for ${domain}: ${Object.entries(currentWeights).map(([k, v]) => `${k}=${v.toFixed(3)}`).join(', ')}`);
}

/**
 * Resolve signal weights with domain fallback chain:
 * per-domain learned → global learned → static defaults.
 * Returns a SignalWeights object for use in the predictor.
 */
export function resolveSignalWeights(
  learnedWeights: Record<string, number> | undefined,
  domainWeights?: Record<string, Record<string, number>>,
  domain?: string,
): SignalWeights | null {
  // Try per-domain weights first
  if (domain && domainWeights?.[domain] && Object.keys(domainWeights[domain]).length > 0) {
    const weights: SignalWeights = { ...DEFAULT_SIGNAL_WEIGHTS };
    for (const [source, weight] of Object.entries(domainWeights[domain])) {
      const key = SIGNAL_KEY_MAP[source];
      if (key) weights[key] = weight;
    }
    return weights;
  }

  // Fall back to global learned weights
  if (!learnedWeights || Object.keys(learnedWeights).length === 0) return null;

  const weights: SignalWeights = { ...DEFAULT_SIGNAL_WEIGHTS };
  for (const [source, weight] of Object.entries(learnedWeights)) {
    const key = SIGNAL_KEY_MAP[source];
    if (key) weights[key] = weight;
  }
  return weights;
}
