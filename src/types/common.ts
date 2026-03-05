/**
 * Classification of task types for the optimizer pipeline.
 */
export enum TaskType {
  Feature = 'Feature',
  BugFix = 'BugFix',
  Refactor = 'Refactor',
  Docs = 'Docs',
  Test = 'Test',
  Config = 'Config',
  Research = 'Research',
  Learning = 'Learning',
  Documentation = 'Documentation',
  Writing = 'Writing',
  Exploration = 'Exploration',
  Unknown = 'Unknown',
}

/**
 * Task complexity levels.
 */
export enum Complexity {
  Simple = 'Simple',
  Low = 'Low',
  Medium = 'Medium',
  High = 'High',
  Complex = 'Complex',
}

/**
 * Confidence score — always 0.0–1.0 float internally.
 * Convert to percentage only for display.
 */
export type ConfidenceScore = number;
