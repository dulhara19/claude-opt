/**
 * Shared stemmer and keyword utilities for analyzer + predictor.
 */

/**
 * Simple suffix-stripping stemmer for common English verb/noun forms.
 * Reused by both the task analyzer and the file predictor signals.
 */
export function stem(word: string): string {
  if (word.length <= 3) return word;

  // Order matters — check longest suffixes first
  if (word.endsWith('ying')) return word.slice(0, -4) + 'y';
  if (word.endsWith('ling') && word.length > 5) return word.slice(0, -4) + 'le';
  if (word.endsWith('ting') && word.length > 5) {
    const base = word.slice(0, -4);
    if (base.length >= 3) return base + 'e';
    return base;
  }
  if (word.endsWith('ning') && word.length > 5) return word.slice(0, -4) + 'n';
  if (word.endsWith('zing') && word.length > 5) return word.slice(0, -4) + 'ze';
  if (word.endsWith('sing') && word.length > 5) return word.slice(0, -4) + 'se';
  if (word.endsWith('ing') && word.length > 5) return word.slice(0, -3);
  if (word.endsWith('tion')) return word.slice(0, -4) + 'te';
  if (word.endsWith('ment') && word.length > 6) return word.slice(0, -4);
  if (word.endsWith('ness') && word.length > 6) return word.slice(0, -4);
  if (word.endsWith('ies') && word.length > 4) return word.slice(0, -3) + 'y';
  if (word.endsWith('ied') && word.length > 4) return word.slice(0, -3) + 'y';
  if (word.endsWith('ized') && word.length > 5) return word.slice(0, -1);
  if (word.endsWith('ised') && word.length > 5) return word.slice(0, -1);
  if (word.endsWith('ated') && word.length > 5) return word.slice(0, -1);
  if (word.endsWith('ting') && word.length > 4) return word.slice(0, -3);
  if (word.endsWith('ed') && word.length > 4) {
    const base = word.slice(0, -2);
    if (base.endsWith('e')) return base;
    return base;
  }
  if (word.endsWith('es') && word.length > 4) return word.slice(0, -2);
  if (word.endsWith('er') && word.length > 4) return word.slice(0, -2);
  if (word.endsWith('ly') && word.length > 4) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss') && word.length > 3) return word.slice(0, -1);

  return word;
}

/**
 * Task-action stopwords — verbs that appear in almost every prompt.
 * These add noise to keyword matching (every bugfix has "fix", every feature has "add").
 */
export const TASK_ACTION_STOPWORDS = new Set([
  'fix', 'add', 'update', 'create', 'remove', 'delete', 'change', 'modify',
  'implement', 'make', 'set', 'get', 'use', 'move', 'write', 'check', 'run',
  'build', 'need', 'want', 'help', 'please', 'the', 'this', 'that', 'with',
  'for', 'from', 'into', 'should', 'could', 'would', 'will', 'can',
]);
