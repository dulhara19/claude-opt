/**
 * Doctor module types — shared across Stories 7.1–7.4.
 */

// ─── Checkup types (Story 7.1) ─────────────────────────────────

/** Status of a single check item. */
export type CheckStatus = 'pass' | 'fail' | 'warn';

/** Severity level for checkup issues. */
export type CheckSeverity = 'critical' | 'warning' | 'info';

/** A single check item in the checkup report. */
export interface CheckItem {
  name: string;
  status: CheckStatus;
  detail: string;
  severity: CheckSeverity;
}

/** An issue found during checkup. */
export interface CheckupIssue {
  check: string;
  severity: CheckSeverity;
  message: string;
  isFixable: boolean;
  fixDescription?: string;
}

/** Result of applying a fix to a checkup issue. */
export interface CheckupFix {
  issue: CheckupIssue;
  applied: boolean;
  result: string;
}

/** Full result of a checkup run. */
export interface CheckupResult {
  checks: CheckItem[];
  score: number;
  issues: CheckupIssue[];
  passed: boolean;
}

// ─── Score deduction constants ──────────────────────────────────

/** Points deducted per critical failure. */
export const CHECKUP_CRITICAL_DEDUCTION = 25;

/** Points deducted per warning. */
export const CHECKUP_WARNING_DEDUCTION = 10;

// ─── Doctor shared types (Stories 7.2–7.4) ──────────────────────

/** Doctor operating mode. */
export type DoctorMode = 'supervised' | 'autonomous';

/** Types of findings the doctor can detect. */
export type FindingType =
  | 'stale-pattern'
  | 'missing-cooccurrence'
  | 'bad-prediction'
  | 'thin-domain';

/** Severity levels for doctor findings. */
export type FindingSeverity = 'critical' | 'medium' | 'low' | 'info';

/** A single doctor log entry matching doctor-log.json schema. */
export interface DoctorLogEntry {
  id: string;
  timestamp: string;
  mode: DoctorMode;
  trigger: string;
  triggerDetail: string;
  usedArchive: boolean;
  findings: DoctorFinding[];
  actions: DoctorLogAction[];
  healthScore: { before: number; after: number };
  tokensCost: number;
}

/** A finding recorded in a doctor log entry. */
export interface DoctorFinding {
  type: FindingType;
  severity: FindingSeverity;
  message: string;
  file: string | null;
}

/** An action recorded in a doctor log entry. */
export interface DoctorLogAction {
  action: string;
  target: string;
  result: string;
}

// ─── Diagnostic types (Story 7.2) ────────────────────────────────

/** Options for running diagnostics. */
export interface DiagnosticOptions {
  domain?: string;
  reportOnly?: boolean;
  deep?: boolean;
}

/** Health score with overall and per-domain breakdown. */
export interface DiagnosticHealthScore {
  overall: number;
  perDomain: Record<string, number>;
}

/** A single diagnostic finding. */
export interface DiagnosticFinding {
  id: string;
  type: FindingType;
  severity: FindingSeverity;
  description: string;
  affectedFiles: string[];
  affectedDomain: string;
  evidence: string;
  recommendation: string;
}

/** A recommended action for a finding. */
export interface Recommendation {
  findingId: string;
  action: string;
  riskLevel: 'low' | 'medium' | 'high';
  description: string;
}

/** Full diagnostic report. */
export interface DiagnosticReport {
  healthScore: DiagnosticHealthScore;
  findings: DiagnosticFinding[];
  recommendations: Recommendation[];
  tokensCost: number;
  timestamp: string;
  domain?: string;
}

/** Context passed to the diagnostic prompt builder. */
export interface DiagnosticContext {
  totalTasks: number;
  recentAccuracy: { precision: number; recall: number };
  domainCount: number;
  patternCount: number;
}

// ─── Diagnostic constants ────────────────────────────────────────

/** Minimum tasks before pattern detection is meaningful. */
export const MIN_TASKS_FOR_PATTERN_DETECTION = 5;

/** Minimum tasks before stale pattern flags are reliable. */
export const MIN_TASKS_FOR_STALENESS = 10;

/** Default number of recent tasks to check for staleness. */
export const DEFAULT_STALENESS_WINDOW = 5;

/** Weight threshold above which a pattern is considered significant. */
export const STALENESS_WEIGHT_THRESHOLD = 0.5;

/** Minimum co-occurrence ratio to flag as missing pattern. */
export const COOCCURRENCE_MIN_RATIO = 0.8;

/** Minimum predictions before a file can be flagged as bad prediction. */
export const MIN_PREDICTIONS_FOR_BAD = 3;

/** Hit rate below which a prediction is considered bad. */
export const BAD_PREDICTION_HIT_THRESHOLD = 0.2;

/** Score deductions per finding severity. */
export const SEVERITY_DEDUCTIONS: Record<FindingSeverity, number> = {
  critical: 0.15,
  medium: 0.10,
  low: 0.05,
  info: 0,
};

// ─── Supervised mode types (Story 7.3) ─────────────────────────

/** Threshold breach alert for a single domain. */
export interface ThresholdAlert {
  domain: string;
  currentAccuracy: number;
  threshold: number;
  timestamp: string;
}

/** User choice after seeing a threshold alert. */
export type AlertChoice = 'diagnose' | 'manual' | 'dismiss';

/** Types of fixes the Doctor can apply. */
export type FixAction = 'add-cooccurrence' | 'remove-stale' | 'reduce-weight' | 'custom';

/** A proposed fix for a diagnostic finding. */
export interface FixProposal {
  findingId: string;
  finding: DiagnosticFinding;
  action: FixAction;
  explanation: string;
  riskLevel: 'low' | 'medium' | 'high';
}

/** Result of applying (or skipping) a fix. */
export interface FixResult {
  proposal: FixProposal;
  applied: boolean;
  approvedBy: 'user' | 'auto';
  result: string;
  before?: unknown;
  after?: unknown;
}

/** A complete supervised mode session for one alert. */
export interface SupervisedSession {
  alert: ThresholdAlert;
  choice: AlertChoice;
  report?: DiagnosticReport;
  fixes: FixResult[];
}

/** Minimum tasks per domain before threshold checking is meaningful. */
export const MIN_TASKS_FOR_THRESHOLD = 3;

// ─── Autonomous mode types (Story 7.4) ─────────────────────────

/** Configuration for autonomous Doctor behavior. */
export interface AutonomousConfig {
  enabled: boolean;
  autoApplyRiskLevels: ('low')[];
  requireApprovalRiskLevels: ('medium' | 'high')[];
}

/** Result of an autonomous Doctor session. */
export interface AutonomousResult {
  autoApplied: FixResult[];
  pendingApproval: FixProposal[];
  userApproved: FixResult[];
  notifications: string[];
}

/** Options for deep analysis mode. */
export interface DeepAnalysisOptions {
  archivePath: string;
  archiveSize: number;
  estimatedTokenCost: { min: number; max: number };
  userApproved: boolean;
}

/** Trigger types for Doctor sessions. */
export type DoctorTrigger = 'threshold-breach' | 'manual' | 'checkup' | 'deep-analysis';

/** An action recorded in the audit log. */
export interface AuditAction {
  finding: string;
  action: 'applied' | 'skipped' | 'auto-applied' | 'failed';
  approvedBy: 'user' | 'auto' | 'n/a';
  result: string;
}

/** Risk levels that autonomous mode auto-applies. */
export const AUTO_APPLY_RISK_LEVELS: readonly string[] = ['low'];

/** Deep analysis base token cost. */
export const DEEP_ANALYSIS_BASE_TOKENS = 800;

/** Deep analysis token cost per 100 archived tasks. */
export const DEEP_ANALYSIS_TOKENS_PER_100 = 200;
