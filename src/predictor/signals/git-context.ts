/**
 * Signal 6: Git Context — scores files based on recent git activity.
 * Files recently changed in git history are more likely relevant to current work.
 * Uses exponential decay: HEAD~0=1.0, HEAD~1=0.8, HEAD~2=0.64, etc.
 *
 * Improvements:
 * - P1: Session caching with 60-second TTL (avoids repeated execSync calls)
 */

import { execSync } from 'node:child_process';
import type { SignalScore } from '../types.js';
import { SignalSource } from '../types.js';
import { logger } from '../../utils/index.js';

const MODULE = 'predictor:git-context';

/** Decay factor per commit distance from HEAD. */
const DECAY_FACTOR = 0.8;
/** Maximum number of recent commits to inspect. */
const MAX_COMMITS = 20;
/** Timeout for git commands (ms). */
const GIT_TIMEOUT = 3000;
/** P1: Cache TTL in milliseconds (60 seconds). */
const CACHE_TTL_MS = 60_000;

// P1: Module-level cache for git context results
let gitCache: {
  projectRoot: string;
  data: Map<string, SignalScore>;
  timestamp: number;
} | null = null;

/**
 * Clear the git context cache. Useful for testing or session boundaries.
 */
export function clearGitCache(): void {
  gitCache = null;
}

/**
 * Score files based on recent git activity.
 * Fail-open: returns empty map if not a git repo or git commands fail.
 *
 * P1: Results are cached for 60 seconds per projectRoot to avoid
 * repeated execSync calls within the same session.
 */
export function scoreGitContext(
  projectRoot: string,
): Map<string, SignalScore> {
  // P1: Return cached result if fresh
  if (
    gitCache &&
    gitCache.projectRoot === projectRoot &&
    Date.now() - gitCache.timestamp < CACHE_TTL_MS
  ) {
    logger.debug(MODULE, `Git context: returning cached result (${gitCache.data.size} files)`);
    return gitCache.data;
  }

  const scores = new Map<string, SignalScore>();

  try {
    // Get files changed in recent commits, one commit per section
    const output = execSync(
      `git log --name-only --format="" -n ${MAX_COMMITS}`,
      {
        cwd: projectRoot,
        encoding: 'utf-8',
        timeout: GIT_TIMEOUT,
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );

    if (!output.trim()) {
      gitCache = { projectRoot, data: scores, timestamp: Date.now() };
      return scores;
    }

    // Parse into file → commit distance, tracking commit boundaries via blank lines
    const fileDistances = new Map<string, number>();
    let commitIndex = 0;

    for (const line of output.split('\n')) {
      const trimmed = line.trim();
      if (trimmed === '') {
        commitIndex++;
        continue;
      }
      // Keep the closest (smallest) distance
      if (!fileDistances.has(trimmed)) {
        fileDistances.set(trimmed, commitIndex);
      }
    }

    // Also include uncommitted changes (staged + unstaged) at distance 0
    try {
      const diffOutput = execSync('git diff --name-only HEAD', {
        cwd: projectRoot,
        encoding: 'utf-8',
        timeout: GIT_TIMEOUT,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      for (const line of diffOutput.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !fileDistances.has(trimmed)) {
          fileDistances.set(trimmed, 0);
        }
      }
    } catch {
      // Ignore — uncommitted diff is bonus info
    }

    if (fileDistances.size === 0) {
      gitCache = { projectRoot, data: scores, timestamp: Date.now() };
      return scores;
    }

    // Apply exponential decay scoring
    for (const [filePath, distance] of fileDistances) {
      const decayScore = Math.pow(DECAY_FACTOR, distance);

      scores.set(filePath, {
        source: SignalSource.GitContext,
        score: decayScore,
        weight: 0,
        reason: `Recently changed (${distance === 0 ? 'uncommitted' : `${distance} commit(s) ago`})`,
      });
    }

    logger.debug(MODULE, `Git context: ${scores.size} files from ${commitIndex} commits`);
  } catch {
    // Fail-open: not a git repo, git not installed, or timeout
    logger.debug(MODULE, 'Git context unavailable (not a git repo or git error)');
  }

  // P1: Cache the result
  gitCache = { projectRoot, data: scores, timestamp: Date.now() };

  return scores;
}
