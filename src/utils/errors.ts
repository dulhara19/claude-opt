import type { Result } from '../types/index.js';
import { logger } from './logger.js';

/**
 * Create a success Result.
 */
export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

/**
 * Create an error Result.
 */
export function err<T>(error: string): Result<T> {
  return { ok: false, error };
}

/**
 * Fail-open wrapper: catches any thrown error, logs it, and returns the fallback value.
 * Ensures the pipeline continues execution without crashing.
 */
export function withFailOpen<T>(fn: () => T, fallback: T, module: string): T {
  try {
    return fn();
  } catch (error) {
    logger.error(module, 'Stage failed, falling back', error);
    return fallback;
  }
}
