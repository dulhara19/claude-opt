import { describe, it, expect } from 'vitest';
import { ok, err, withFailOpen } from '../../src/utils/errors.js';
import type { Result } from '../../src/types/index.js';

describe('ok', () => {
  it('creates a success result', () => {
    const result: Result<number> = ok(42);
    expect(result).toEqual({ ok: true, value: 42 });
  });

  it('works with string values', () => {
    const result = ok('hello');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe('hello');
    }
  });
});

describe('err', () => {
  it('creates an error result', () => {
    const result: Result<number> = err('something failed');
    expect(result).toEqual({ ok: false, error: 'something failed' });
  });
});

describe('withFailOpen', () => {
  it('returns the function result on success', () => {
    const result = withFailOpen(() => 42, 0, 'test');
    expect(result).toBe(42);
  });

  it('returns fallback on error and does not throw', () => {
    const result = withFailOpen(
      () => {
        throw new Error('boom');
      },
      99,
      'test',
    );
    expect(result).toBe(99);
  });

  it('works with async-like patterns (sync wrapper)', () => {
    const result = withFailOpen(() => 'success', 'fallback', 'test');
    expect(result).toBe('success');
  });

  it('returns fallback for non-Error throws', () => {
    const result = withFailOpen(
      () => {
        throw 'string error';
      },
      'default',
      'test',
    );
    expect(result).toBe('default');
  });
});
