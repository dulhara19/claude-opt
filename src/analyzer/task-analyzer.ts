import { TaskType, Complexity } from '../types/index.js';
import type { ClassificationResult, ProjectMap, KeywordIndex } from '../types/index.js';
import { logger } from '../utils/index.js';
import {
  TASK_TYPE_KEYWORDS,
  COMPLEXITY_SIGNALS,
  SIMPLE_DEFAULT_TYPES,
  DEFAULT_CLASSIFICATION,
} from './types.js';

const MODULE = 'analyzer';

/**
 * Tokenize a prompt into normalized lowercase words.
 */
function tokenize(prompt: string): string[] {
  return prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

/**
 * Score each task type using weighted keyword matching (AD-09).
 * Returns a map of task type to cumulative score.
 */
function scoreTaskTypes(tokens: string[]): Map<string, number> {
  const scores = new Map<string, number>();

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

  return scores;
}

/**
 * Classify task type from token scores.
 * Returns the type with the highest score, or Unknown if no matches.
 */
function classifyType(scores: Map<string, number>): { type: TaskType; confidence: number } {
  if (scores.size === 0) {
    return { type: TaskType.Unknown, confidence: 0 };
  }

  let bestType = TaskType.Unknown as string;
  let bestScore = 0;
  let totalScore = 0;

  for (const [type, score] of scores) {
    totalScore += score;
    if (score > bestScore) {
      bestScore = score;
      bestType = type;
    }
  }

  const confidence = totalScore > 0 ? bestScore / totalScore : 0;
  return {
    type: bestType as TaskType,
    confidence: Math.min(confidence, 1.0),
  };
}

/**
 * Classify domain by matching prompt keywords against project map domains.
 */
function classifyDomain(
  tokens: string[],
  projectMap?: ProjectMap,
  keywordIndex?: KeywordIndex,
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

  // Also use keyword index if available
  if (keywordIndex?.keywordToFiles) {
    for (const token of tokens) {
      const files = keywordIndex.keywordToFiles[token];
      if (files) {
        for (const file of files) {
          // Find which domain this file belongs to
          for (const [domain, domainFiles] of Object.entries(projectMap.domains)) {
            if (domainFiles.includes(file)) {
              domainScores.set(domain, (domainScores.get(domain) ?? 0) + 0.3);
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

/**
 * Classify complexity using keyword signals.
 * Research/learning tasks default to Simple.
 */
function classifyComplexity(tokens: string[], taskType: TaskType): Complexity {
  let simpleScore = 0;
  let complexScore = 0;

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

  // Research/learning tasks default to simple
  if (SIMPLE_DEFAULT_TYPES.has(taskType) && complexScore === 0) {
    return Complexity.Simple;
  }

  if (simpleScore > complexScore && simpleScore > 0) {
    return Complexity.Simple;
  }
  if (complexScore > simpleScore && complexScore > 0) {
    return Complexity.Complex;
  }

  return Complexity.Medium;
}

/**
 * Classify a task prompt by type, domain, and complexity.
 * Synchronous — pure keyword matching computation, no I/O.
 * Must complete in <100ms (AD-09 performance budget).
 */
export function classifyTask(
  userPrompt: string,
  projectMap?: ProjectMap,
  keywordIndex?: KeywordIndex,
): ClassificationResult {
  const startTime = performance.now();

  const tokens = tokenize(userPrompt);

  if (tokens.length === 0) {
    logger.debug(MODULE, 'Empty prompt, returning default classification');
    return { ...DEFAULT_CLASSIFICATION };
  }

  // Score and classify task type
  const typeScores = scoreTaskTypes(tokens);
  const { type, confidence } = classifyType(typeScores);

  // Classify domain
  const domain = classifyDomain(tokens, projectMap, keywordIndex);

  // Classify complexity
  const complexity = classifyComplexity(tokens, type);

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
