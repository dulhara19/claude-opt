import type { PredictionResult as _PredictionResult } from '../predictor/types.js';
import type { RoutingResult as _RoutingResult } from '../router/types.js';
import type { CompressionResult as _CompressionResult } from '../compressor/types.js';

/**
 * Result type for operations that can fail.
 * Follows the pattern: { ok: true; value: T } | { ok: false; error: string }
 */
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Pipeline context accumulates results across pipeline stages.
 */
export interface PipelineContext {
  /** The original task/prompt text */
  taskText: string;
  /** Working directory for the task */
  workingDir: string;
  /** Whether this is a dry-run execution */
  isDryRun: boolean;
  /** Accumulated results from each pipeline stage */
  results: Record<string, unknown>;
  /** Timestamp when pipeline started */
  startedAt: number;
  /** Classification result from the Task Analyzer */
  classification?: ClassificationResult;
  /** Prediction result from the File Predictor (Story 2.2) */
  prediction?: PredictionResult;
  /** Routing result from the Model Router (Story 2.3) */
  routing?: RoutingResult;
  /** Compression result from the Prompt Compressor (Story 2.4) */
  compression?: CompressionResult;
  /** Adapter result from the Claude Code Adapter (Story 2.6) */
  adapterResult?: AdapterResult;
}

/** Result from Task Analyzer (Story 2.1) */
export interface ClassificationResult {
  type: import('./common.js').TaskType;
  domain: string;
  complexity: import('./common.js').Complexity;
  confidence: import('./common.js').ConfidenceScore;
}

/** Result from File Predictor (Story 2.2) */
export type PredictionResult = _PredictionResult;

/** Result from Model Router (Story 2.3) */
export type RoutingResult = _RoutingResult;

/** Result from Prompt Compressor (Story 2.4) */
export type CompressionResult = _CompressionResult;

/** Result from Claude Code Adapter (Story 2.6) */
export type AdapterResult = import('../adapter/types.js').AdapterResult;
