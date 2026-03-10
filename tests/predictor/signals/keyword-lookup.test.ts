import { describe, it, expect } from 'vitest';
import { scoreKeywordLookup } from '../../../src/predictor/signals/keyword-lookup.js';
import { createDefaultKeywordIndex } from '../../../src/store/defaults.js';

describe('scoreKeywordLookup', () => {
  it('returns empty map when no keyword index exists', () => {
    const scores = scoreKeywordLookup(['auth'], undefined);
    expect(scores.size).toBe(0);
  });

  it('returns empty map when no keywords match', () => {
    const index = createDefaultKeywordIndex();
    index.keywordToFiles = { database: ['src/db/connection.ts'] };
    index.fileToKeywords = { 'src/db/connection.ts': ['database'] };

    const scores = scoreKeywordLookup(['auth', 'login'], index);
    expect(scores.size).toBe(0);
  });

  it('scores files by number of keyword matches', () => {
    const index = createDefaultKeywordIndex();
    index.keywordToFiles = {
      auth: ['src/auth/login.ts', 'src/auth/register.ts'],
      login: ['src/auth/login.ts'],
    };
    index.fileToKeywords = {
      'src/auth/login.ts': ['auth', 'login'],
      'src/auth/register.ts': ['auth'],
    };

    const scores = scoreKeywordLookup(['auth', 'login'], index);
    expect(scores.size).toBe(2);

    // login.ts matches both keywords, register.ts matches one
    const loginScore = scores.get('src/auth/login.ts');
    const registerScore = scores.get('src/auth/register.ts');
    expect(loginScore).toBeDefined();
    expect(registerScore).toBeDefined();
    expect(loginScore!.score).toBeGreaterThan(registerScore!.score);
  });

  it('gives highest score of 1.0 to file with most matches', () => {
    const index = createDefaultKeywordIndex();
    index.keywordToFiles = {
      auth: ['src/auth/login.ts'],
      login: ['src/auth/login.ts'],
      user: ['src/auth/login.ts'],
    };
    index.fileToKeywords = {
      'src/auth/login.ts': ['auth', 'login', 'user'],
    };

    const scores = scoreKeywordLookup(['auth', 'login', 'user'], index);
    const loginScore = scores.get('src/auth/login.ts');
    expect(loginScore).toBeDefined();
    expect(loginScore!.score).toBe(1.0);
  });

  it('normalizes scores to 0.0-1.0 range', () => {
    const index = createDefaultKeywordIndex();
    index.keywordToFiles = {
      auth: ['src/auth/login.ts', 'src/auth/register.ts'],
      login: ['src/auth/login.ts'],
      register: ['src/auth/register.ts'],
    };
    index.fileToKeywords = {
      'src/auth/login.ts': ['auth', 'login'],
      'src/auth/register.ts': ['auth', 'register'],
    };

    const scores = scoreKeywordLookup(['auth', 'login', 'register'], index);
    for (const score of scores.values()) {
      expect(score.score).toBeGreaterThanOrEqual(0);
      expect(score.score).toBeLessThanOrEqual(1);
    }
  });

  it('includes matched keywords in reason', () => {
    const index = createDefaultKeywordIndex();
    index.keywordToFiles = {
      auth: ['src/auth/login.ts'],
      login: ['src/auth/login.ts'],
    };
    index.fileToKeywords = {
      'src/auth/login.ts': ['auth', 'login'],
    };

    const scores = scoreKeywordLookup(['auth', 'login'], index);
    const loginScore = scores.get('src/auth/login.ts');
    expect(loginScore).toBeDefined();
    expect(loginScore!.reason).toContain('auth');
    expect(loginScore!.reason).toContain('login');
  });

  it('sets signal source correctly', () => {
    const index = createDefaultKeywordIndex();
    index.keywordToFiles = { auth: ['src/auth/login.ts'] };
    index.fileToKeywords = { 'src/auth/login.ts': ['auth'] };

    const scores = scoreKeywordLookup(['auth'], index);
    for (const score of scores.values()) {
      expect(score.source).toBe('KeywordLookup');
    }
  });
});
