/**
 * Visibility module types — display data structures for stats and budget commands.
 */

// ─── Formatter Types ────────────────────────────────────────────

export interface BoxOptions {
  width?: number;
  borderColor?: string;
}

export interface ProgressBarOptions {
  width?: number;
  fullChar?: string;
  emptyChar?: string;
}

export interface TableColumn {
  label: string;
  width: number;
  align?: 'left' | 'right';
}

export interface TableRow {
  [key: string]: string | number;
}

// ─── Stats Display Types ────────────────────────────────────────

export interface DomainStatsEntry {
  name: string;
  accuracy: number;
  taskCount: number;
}

export interface ModelUsageEntry {
  model: string;
  taskCount: number;
  percentage: number;
}

export interface StatsDisplayData {
  isEmpty: boolean;
  totalTasks?: number;
  totalSessions?: number;
  totalDomains?: number;
  precision?: number;
  recall?: number;
  totalTokensSaved?: number;
  savingsRate?: number;
  avgSavingsPerTask?: number;
  modelUsage?: ModelUsageEntry[];
  domains?: DomainStatsEntry[];
}

// ─── Knowledge Display Types ────────────────────────────────────

export interface DomainFileEntry {
  path: string;
  weight: number;
  timesSeen: number;
}

export interface DomainPattern {
  files: [string, string];
  confidence: number;
}

export interface DomainHealth {
  score: number;
  dots: number;
  label: string;
}

export interface DomainSummary {
  name: string;
  taskCount: number;
  accuracy: number;
}

export interface KnowledgeDisplayData {
  isDomainFound: boolean;
  domain?: string;
  files?: DomainFileEntry[];
  patterns?: DomainPattern[];
  conventions?: string[];
  precision?: number;
  recall?: number;
  taskCount?: number;
  health?: DomainHealth;
  availableDomains?: DomainSummary[];
}

// ─── Dry-Run Display Types ──────────────────────────────────────

export interface DryRunFilePrediction {
  path: string;
  confidence: number;
}

export interface DryRunResult {
  taskType: string;
  domain: string;
  complexity: string;
  confidence: number;
  model: string;
  routingReason: string;
  predictedFiles: DryRunFilePrediction[];
  compressionReduction: number;
  estimatedTokenCost: number;
  estimatedRawCost: number;
}

// ─── Trends Display Types ───────────────────────────────────────

export interface SessionAccuracy {
  sessionLabel: string;
  precision: number;
  recall: number;
  taskCount: number;
}

export interface CumulativeSavings {
  sessionLabel: string;
  totalSaved: number;
}

export interface TrendsDisplayData {
  hasEnoughData: boolean;
  taskCount: number;
  sessionAccuracies?: SessionAccuracy[];
  cumulativeSavings?: CumulativeSavings[];
  domainBreakdown?: DomainStatsEntry[];
}

// ─── Chart Types ────────────────────────────────────────────────

export interface ChartDataPoint {
  label: string;
  value: number;
}

export interface ChartOptions {
  width?: number;
  height?: number;
  yLabel?: string;
  xLabels?: string[];
}

// ─── Feedback Types ────────────────────────────────────────────

export type QuickReason = 'missed-files' | 'wrong-files' | 'wrong-model';

export interface InlineFeedback {
  source: 'inline';
  /** FB10: 'partial' for mostly-correct results. */
  rating: 'good' | 'bad' | 'partial';
  quickReason?: QuickReason;
}

export interface InlineFeedbackWithDescription {
  source: 'inline';
  rating: 'bad';
  details: string;
}

export interface ModelCorrection {
  direction: 'too-weak' | 'too-strong';
  suggested?: 'haiku' | 'sonnet' | 'opus';
}

export interface DetailedFeedback {
  source: 'cli-correct';
  rating: 'bad';
  details?: string;
  missedFiles?: string[];
  wrongFiles?: string[];
  modelCorrection?: ModelCorrection;
}

export interface CorrectionContext {
  taskId: string;
  description: string;
  predictedFiles: string[];
  actualFiles: string[];
  precision: number;
  recall: number;
  modelUsed: string;
  existingFeedback: FeedbackResult | null;
}

export type FeedbackResult = InlineFeedback | InlineFeedbackWithDescription | DetailedFeedback | null;

/** Aggregated feedback analytics (FB7). */
export interface FeedbackAnalytics {
  totalFeedbacks: number;
  good: number;
  bad: number;
  partial: number;
  skipped: number;
  /** Breakdown of bad feedback by quickReason. */
  reasonBreakdown: Record<string, number>;
  /** Top files that were reported as missed. */
  topMissedFiles: Array<{ file: string; count: number }>;
  /** Model correction trend. */
  modelCorrections: { tooWeak: number; tooStrong: number };
  /** Good-to-bad ratio (higher is better). */
  satisfactionRate: number;
}

export interface ForgetResult {
  filePath: string;
  keywordsCleared: number;
  coOccurrencesAffected: number;
  affinitiesZeroed: number;
}

export interface TaskSummary {
  taskId: string;
  description: string;
  predictedCount: number;
  actualCount: number;
  modelUsed: string;
  tokensConsumed: number;
}

// ─── Budget Display Types ───────────────────────────────────────

export interface SessionBatchEntry {
  label: string;
  tokenCount: number;
}

export interface BudgetDisplayData {
  isEmpty: boolean;
  windowStart?: string;
  windowEnd?: string;
  timeRemaining?: string;
  tokensConsumed?: number;
  tokensBudget?: number;
  tokensRemaining?: number;
  percentUsed?: number;
  estimatedTasksRemaining?: number;
  estimatedTasksRangeHigh?: number;
  windowResetsAt?: string;
  windowResetHumanReadable?: string;
  sessionBreakdown?: SessionBatchEntry[];
}
