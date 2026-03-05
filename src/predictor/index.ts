/**
 * File Predictor module — public API.
 * Predicts which files are relevant to a given task.
 */

export { predictFiles } from './file-predictor.js';
export type { PredictionResult, FilePrediction, SignalScore, SignalWeights } from './types.js';
export { SignalSource, DEFAULT_SIGNAL_WEIGHTS } from './types.js';
