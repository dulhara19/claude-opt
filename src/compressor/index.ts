/**
 * Prompt Compressor module — public API.
 * Optimizes prompts with filler removal and context injection.
 */

export { compressPrompt, DEFAULT_COMPRESSION } from './prompt-compressor.js';
export { reviewPrompt, formatPromptDisplay, readKeypress, detectEditor, editInEditor, editInline } from './prompt-review.js';
export { ReviewAction } from './types.js';
export type { CompressionResult, CompressionStats, PromptSection, PromptTemplate, ReviewResult } from './types.js';
