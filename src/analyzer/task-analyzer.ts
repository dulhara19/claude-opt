import { TaskType, Complexity } from '../types/index.js';
import type { ClassificationResult, ProjectMap, KeywordIndex, Patterns, Metrics } from '../types/index.js';
import { logger, stem } from '../utils/index.js';
import {
  TASK_TYPE_KEYWORDS,
  COMPLEXITY_SIGNALS,
  SIMPLE_DEFAULT_TYPES,
  DEFAULT_CLASSIFICATION,
} from './types.js';

const MODULE = 'analyzer';

// ─── Tokenization (Fix #3) ───────────────────────────────────
// stem() is now imported from shared utils/stemmer.ts

/**
 * Tokenize a prompt into normalized lowercase words with stemming and camelCase splitting.
 */
function tokenize(prompt: string): string[] {
  const raw = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0);

  const tokens: string[] = [];
  for (const word of raw) {
    tokens.push(word);
    const stemmed = stem(word);
    if (stemmed !== word) {
      tokens.push(stemmed);
    }
  }

  // Deduplicate while preserving order
  return [...new Set(tokens)];
}

/**
 * Split camelCase and PascalCase identifiers into tokens.
 */
export function splitCamelCase(text: string): string[] {
  return text
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

// ─── Task Type Scoring ────────────────────────────────────────

/**
 * Score each task type using weighted keyword matching (AD-09).
 * Fix #1: Also incorporates learned type affinities from patterns.
 */
function scoreTaskTypes(
  tokens: string[],
  patterns?: Patterns,
  metrics?: Metrics,
): Map<string, number> {
  const scores = new Map<string, number>();

  // Static keyword scoring
  for (const [taskType, keywords] of Object.entries(TASK_TYPE_KEYWORDS)) {
    let score = 0;
    for (const { keyword, weight } of keywords) {
      for (const token of tokens) {
        if (token === keyword) {
          score += weight;
        }
      }
    }
    if (score > 0) {
      scores.set(taskType, score);
    }
  }

  // Fix #1: Boost from learned type affinities
  // If patterns show a task type consistently uses certain files,
  // and the prompt mentions tokens related to those files, boost that type
  if (patterns?.typeAffinities) {
    for (const [taskType, affinity] of Object.entries(patterns.typeAffinities)) {
      if (!affinity.fileWeights) continue;

      let affinityBoost = 0;
      for (const filePath of Object.keys(affinity.fileWeights)) {
        const fileTokens = filePath.toLowerCase().split(/[-_./\\]+/);
        for (const token of tokens) {
          if (fileTokens.includes(token)) {
            affinityBoost += 0.3; // Learned affinity signal
          }
        }
      }

      if (affinityBoost > 0) {
        // Scale by the affinity's confidence
        const scaled = affinityBoost * (affinity.confidence ?? 0.5);
        scores.set(taskType, (scores.get(taskType) ?? 0) + scaled);
      }
    }
  }

  // Fix #6: Calibrate using historical accuracy from metrics
  if (metrics?.perDomain) {
    for (const [taskType, score] of scores) {
      // If this type has historically low precision, discount its score slightly
      const domainMetrics = metrics.perDomain[taskType.toLowerCase()];
      if (domainMetrics && domainMetrics.totalTasks >= 5) {
        const historicalAccuracy = domainMetrics.avgPrecision ?? 0;
        // Nudge scores: well-calibrated types get a slight boost, poor ones get a slight penalty
        const calibrationFactor = 0.8 + (historicalAccuracy * 0.4); // Range: 0.8 to 1.2
        scores.set(taskType, score * calibrationFactor);
      }
    }
  }

  return scores;
}

// ─── Type Classification ─────────────────────────────────────

/**
 * Classify task type from token scores.
 * Fix #6: Confidence now incorporates absolute score and historical accuracy.
 */
function classifyType(
  scores: Map<string, number>,
  metrics?: Metrics,
): { type: TaskType; confidence: number } {
  if (scores.size === 0) {
    return { type: TaskType.Unknown, confidence: 0 };
  }

  let bestType = TaskType.Unknown as string;
  let bestScore = 0;
  let secondBestScore = 0;
  let totalScore = 0;

  for (const [type, score] of scores) {
    totalScore += score;
    if (score > bestScore) {
      secondBestScore = bestScore;
      bestScore = score;
      bestType = type;
    } else if (score > secondBestScore) {
      secondBestScore = score;
    }
  }

  // Fix #6: Better confidence calculation
  // Relative confidence: how dominant is the top type vs others
  const relativeConfidence = totalScore > 0 ? bestScore / totalScore : 0;

  // Separation confidence: how far ahead is the top type from the runner-up
  const separationConfidence = bestScore > 0
    ? (bestScore - secondBestScore) / bestScore
    : 0;

  // Absolute confidence: is the score strong enough on its own?
  // A single keyword match (score ~1.0) should cap at ~0.7, not 1.0
  const absoluteConfidence = Math.min(bestScore / 2.0, 1.0);

  // Blend: 40% relative, 30% separation, 30% absolute
  let confidence = (relativeConfidence * 0.4) + (separationConfidence * 0.3) + (absoluteConfidence * 0.3);

  // Fix #6: Historical calibration — if this type has been accurate, boost confidence
  if (metrics?.perDomain) {
    const domainMetrics = metrics.perDomain[bestType.toLowerCase()];
    if (domainMetrics && domainMetrics.totalTasks >= 5) {
      const historicalAccuracy = domainMetrics.avgPrecision ?? 0;
      // Blend in 20% from historical accuracy
      confidence = confidence * 0.8 + historicalAccuracy * 0.2;
    }
  }

  return {
    type: bestType as TaskType,
    confidence: Math.min(Math.max(confidence, 0), 1.0),
  };
}

// ─── Domain Classification ───────────────────────────────────

/**
 * Classify domain by matching prompt keywords against project map domains.
 * Fix #1: Also uses learned patterns for domain boosting.
 */
function classifyDomain(
  tokens: string[],
  projectMap?: ProjectMap,
  keywordIndex?: KeywordIndex,
  patterns?: Patterns,
): string {
  if (!projectMap || !projectMap.domains) {
    return 'general';
  }

  const domainScores = new Map<string, number>();

  // Match tokens against domain names and their file paths
  for (const [domain, files] of Object.entries(projectMap.domains)) {
    let score = 0;
    const domainTokens = domain.toLowerCase().split(/[-_/\s]+/);

    for (const token of tokens) {
      // Match against domain name tokens
      for (const dt of domainTokens) {
        if (dt === token) {
          score += 2.0;
        }
      }
      // Match against files in the domain
      for (const file of files) {
        const fileTokens = file.toLowerCase().split(/[-_./\\]+/);
        for (const ft of fileTokens) {
          if (ft === token) {
            score += 0.5;
          }
        }
      }
    }

    if (score > 0) {
      domainScores.set(domain, score);
    }
  }

  // Use keyword index if available
  if (keywordIndex?.keywordToFiles) {
    for (const token of tokens) {
      const files = keywordIndex.keywordToFiles[token];
      if (files) {
        for (const file of files) {
          for (const [domain, domainFiles] of Object.entries(projectMap.domains)) {
            if (domainFiles.includes(file)) {
              domainScores.set(domain, (domainScores.get(domain) ?? 0) + 0.3);
            }
          }
        }
      }
    }
  }

  // Fix #1: Boost from co-occurrence patterns — if learned patterns show
  // files in a domain frequently co-occur, boost that domain
  if (patterns?.coOccurrences) {
    for (const coOcc of patterns.coOccurrences) {
      if (coOcc.confidence < 0.5) continue;
      for (const file of coOcc.files) {
        for (const [domain, domainFiles] of Object.entries(projectMap.domains)) {
          if (domainFiles.includes(file)) {
            // Check if any token matches the other file in the co-occurrence
            const otherFile = coOcc.files.find(f => f !== file);
            if (otherFile) {
              const otherTokens = otherFile.toLowerCase().split(/[-_./\\]+/);
              for (const token of tokens) {
                if (otherTokens.includes(token)) {
                  domainScores.set(domain, (domainScores.get(domain) ?? 0) + coOcc.confidence * 0.5);
                }
              }
            }
          }
        }
      }
    }
  }

  if (domainScores.size === 0) {
    return 'general';
  }

  let bestDomain = 'general';
  let bestScore = 0;
  for (const [domain, score] of domainScores) {
    if (score > bestScore) {
      bestScore = score;
      bestDomain = domain;
    }
  }

  return bestDomain;
}

// ─── Complexity Classification ───────────────────────────────

/**
 * Classify complexity using keyword signals + structural signals.
 * Fix #5: Enhanced with prompt length, domain count, and multi-domain detection.
 */
function classifyComplexity(
  tokens: string[],
  taskType: TaskType,
  promptLength: number,
  domainScores?: Map<string, number>,
): Complexity {
  let simpleScore = 0;
  let complexScore = 0;

  // Keyword-based signals
  for (const { keyword, weight } of COMPLEXITY_SIGNALS.simple) {
    for (const token of tokens) {
      if (token === keyword) {
        simpleScore += weight;
      }
    }
  }

  for (const { keyword, weight } of COMPLEXITY_SIGNALS.complex) {
    for (const token of tokens) {
      if (token === keyword) {
        complexScore += weight;
      }
    }
  }

  // Fix #5: Prompt length signal
  // Very short prompts are likely simple; very long ones are likely complex
  if (promptLength < 30) {
    simpleScore += 0.3;
  } else if (promptLength > 200) {
    complexScore += 0.5;
  } else if (promptLength > 100) {
    complexScore += 0.2;
  }

  // Fix #5: Multi-domain signal — if prompt matches 3+ domains, it's complex
  if (domainScores && domainScores.size >= 3) {
    complexScore += 0.6;
  } else if (domainScores && domainScores.size === 2) {
    complexScore += 0.2;
  }

  // Fix #5: Token count signal — many distinct concepts = complex
  if (tokens.length > 20) {
    complexScore += 0.3;
  }

  // Research/learning tasks default to simple
  if (SIMPLE_DEFAULT_TYPES.has(taskType) && complexScore === 0) {
    return Complexity.Simple;
  }

  // Use 5-level scale instead of 3
  const diff = complexScore - simpleScore;

  if (diff <= -1.0) return Complexity.Simple;
  if (diff <= -0.3) return Complexity.Low;
  if (diff < 0.3) return Complexity.Medium;
  if (diff < 1.0) return Complexity.High;
  return Complexity.Complex;
}

// ─── Main Entry Point ────────────────────────────────────────

/**
 * Classify a task prompt by type, domain, and complexity.
 * Synchronous — pure keyword matching + learned pattern lookup, no network I/O.
 * Must complete in <100ms (AD-09 performance budget).
 *
 * Fix #1: Now accepts patterns and metrics for learner feedback loop.
 * Fix #3: Tokenization includes stemming and camelCase splitting.
 * Fix #5: Complexity uses prompt length, domain count, token count.
 * Fix #6: Confidence calibrated with historical accuracy.
 */
export function classifyTask(
  userPrompt: string,
  projectMap?: ProjectMap,
  keywordIndex?: KeywordIndex,
  patterns?: Patterns,
  metrics?: Metrics,
): ClassificationResult {
  const startTime = performance.now();

  const tokens = tokenize(userPrompt);

  if (tokens.length === 0) {
    logger.debug(MODULE, 'Empty prompt, returning default classification');
    return { ...DEFAULT_CLASSIFICATION };
  }

  // Score and classify task type (Fix #1: uses patterns + metrics)
  const typeScores = scoreTaskTypes(tokens, patterns, metrics);
  const { type, confidence } = classifyType(typeScores, metrics);

  // Classify domain (Fix #1: uses patterns for co-occurrence boosting)
  // Capture domain scores for complexity analysis
  const domainScoresForComplexity = new Map<string, number>();
  const domain = classifyDomainWithScores(tokens, projectMap, keywordIndex, patterns, domainScoresForComplexity);

  // Classify complexity (Fix #5: uses prompt length + domain count)
  const complexity = classifyComplexity(tokens, type, userPrompt.length, domainScoresForComplexity);

  const elapsed = performance.now() - startTime;
  if (elapsed > 100) {
    logger.warn(MODULE, `Classification exceeded 100ms budget: ${elapsed.toFixed(1)}ms`);
  } else {
    logger.debug(MODULE, `Classification completed in ${elapsed.toFixed(1)}ms`);
  }

  logger.debug(
    MODULE,
    `Classified: type=${type}, domain=${domain}, complexity=${complexity}, confidence=${confidence.toFixed(2)}`,
  );

  return { type, domain, complexity, confidence };
}

/**
 * Internal: classifyDomain that also populates a domainScores map for complexity analysis.
 */
function classifyDomainWithScores(
  tokens: string[],
  projectMap: ProjectMap | undefined,
  keywordIndex: KeywordIndex | undefined,
  patterns: Patterns | undefined,
  outScores: Map<string, number>,
): string {
  if (!projectMap || !projectMap.domains) {
    return 'general';
  }

  // Match tokens against domain names and their file paths
  for (const [domain, files] of Object.entries(projectMap.domains)) {
    let score = 0;
    const domainTokens = domain.toLowerCase().split(/[-_/\s]+/);

    for (const token of tokens) {
      for (const dt of domainTokens) {
        if (dt === token) {
          score += 2.0;
        }
      }
      for (const file of files) {
        const fileTokens = file.toLowerCase().split(/[-_./\\]+/);
        for (const ft of fileTokens) {
          if (ft === token) {
            score += 0.5;
          }
        }
      }
    }

    if (score > 0) {
      outScores.set(domain, score);
    }
  }

  // Keyword index lookup
  if (keywordIndex?.keywordToFiles) {
    for (const token of tokens) {
      const files = keywordIndex.keywordToFiles[token];
      if (files) {
        for (const file of files) {
          for (const [domain, domainFiles] of Object.entries(projectMap.domains)) {
            if (domainFiles.includes(file)) {
              outScores.set(domain, (outScores.get(domain) ?? 0) + 0.3);
            }
          }
        }
      }
    }
  }

  // Fix #1: Co-occurrence pattern boosting
  if (patterns?.coOccurrences) {
    for (const coOcc of patterns.coOccurrences) {
      if (coOcc.confidence < 0.5) continue;
      for (const file of coOcc.files) {
        for (const [domain, domainFiles] of Object.entries(projectMap.domains)) {
          if (domainFiles.includes(file)) {
            const otherFile = coOcc.files.find(f => f !== file);
            if (otherFile) {
              const otherTokens = otherFile.toLowerCase().split(/[-_./\\]+/);
              for (const token of tokens) {
                if (otherTokens.includes(token)) {
                  outScores.set(domain, (outScores.get(domain) ?? 0) + coOcc.confidence * 0.5);
                }
              }
            }
          }
        }
      }
    }
  }

  if (outScores.size === 0) {
    return 'general';
  }

  let bestDomain = 'general';
  let bestScore = 0;
  for (const [domain, score] of outScores) {
    if (score > bestScore) {
      bestScore = score;
      bestDomain = domain;
    }
  }

  return bestDomain;
}
