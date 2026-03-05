/**
 * Types for the Prompt Compressor module (Story 2.4).
 * Prompt optimization with filler removal, file context injection,
 * pattern/convention injection, and domain-specific context injection.
 */

/** A section within the assembled prompt. */
export interface PromptSection {
  type: 'userRequest' | 'fileContext' | 'conventions' | 'domainContext';
  content: string;
  source: string;
}

/** Statistics about the compression operation. */
export interface CompressionStats {
  fillerWordsRemoved: number;
  filesInjected: number;
  patternsInjected: number;
  compressionRatio: number;
}

/** Full result from the Prompt Compressor pipeline stage. */
export interface CompressionResult {
  optimizedPrompt: string;
  originalLength: number;
  compressedLength: number;
  sections: PromptSection[];
  stats: CompressionStats;
  durationMs: number;
}

/** Structured template for assembling the final prompt. */
export interface PromptTemplate {
  sectionOrder: PromptSection['type'][];
  sectionHeaders: Record<PromptSection['type'], string>;
}

/** Actions available during prompt review (Story 2.5). */
export enum ReviewAction {
  Send = 'send',
  Edit = 'edit',
  Cancel = 'cancel',
}

/** Result from the prompt review step (Story 2.5). */
export interface ReviewResult {
  action: ReviewAction;
  finalPrompt: string;
  wasEdited: boolean;
}
