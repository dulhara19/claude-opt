import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { scoreKeywordLookup } from '../../../src/predictor/signals/keyword-lookup.js';
import { createTempProjectRoot, cleanupTempProjectRoot } from '../../helpers/test-store.js';
import { initializeStore, writeKeywordIndex } from '../../../src/store/index.js';
import { createDefaultKeywordIndex } from '../../../src/store/defaults.js';

describe('scoreKeywordLookup', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = createTempProjectRoot();
    initializeStore(projectRoot);
  });

  afterEach(() => {
    cleanupTempProjectRoot(projectRoot);
  });

  it('returns empty map when no keyword index exists', () => {
    const scores = scoreKeywordLookup(['auth'], '/nonexistent/path');
    expect(scores.size).toBe(0);
  });

  it('returns empty map when no keywords match', () => {
    const index = createDefaultKeywordIndex();
    index.keywordToFiles = { database: ['src/db/connection.ts'] };
    index.fileToKeywords = { 'src/db/connection.ts': ['database'] };
    writeKeywordIndex(projectRoot, index);

    const scores = scoreKeywordLookup(['auth', 'login'], projectRoot);
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
    writeKeywordIndex(projectRoot, index);

    const scores = scoreKeywordLookup(['auth', 'login'], projectRoot);
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
    writeKeywordIndex(projectRoot, index);

    const scores = scoreKeywordLookup(['auth', 'login', 'user'], projectRoot);
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
    writeKeywordIndex(projectRoot, index);

    const scores = scoreKeywordLookup(['auth', 'login', 'register'], projectRoot);
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
    writeKeywordIndex(projectRoot, index);

    const scores = scoreKeywordLookup(['auth', 'login'], projectRoot);
    const loginScore = scores.get('src/auth/login.ts');
    expect(loginScore).toBeDefined();
    expect(loginScore!.reason).toContain('auth');
    expect(loginScore!.reason).toContain('login');
  });

  it('sets signal source correctly', () => {
    const index = createDefaultKeywordIndex();
    index.keywordToFiles = { auth: ['src/auth/login.ts'] };
    index.fileToKeywords = { 'src/auth/login.ts': ['auth'] };
    writeKeywordIndex(projectRoot, index);

    const scores = scoreKeywordLookup(['auth'], projectRoot);
    for (const score of scores.values()) {
      expect(score.source).toBe('KeywordLookup');
    }
  });
});
