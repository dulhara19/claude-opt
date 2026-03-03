/**
 * Doctor module public API — barrel export.
 */

// Story 7.1: Pre-flight checkup
export {
  runCheckup,
  checkStoreDirectory,
  checkJsonFiles,
  checkProjectMap,
  checkDependencyGraph,
  checkKeywordIndex,
  checkStarterPack,
  checkConfig,
  checkSchemaVersionFile,
  calculateReadinessScore,
  applyCheckupFixes,
  renderCheckupReport,
  renderFixSummary,
  handleCheckupInteraction,
} from './checkup.js';

// All doctor types
export type {
  CheckStatus,
  CheckSeverity,
  CheckItem,
  CheckupIssue,
  CheckupFix,
  CheckupResult,
  DoctorMode,
  FindingType,
  FindingSeverity,
  DoctorLogEntry,
  DoctorFinding,
  DoctorLogAction,
} from './types.js';

export {
  CHECKUP_CRITICAL_DEDUCTION,
  CHECKUP_WARNING_DEDUCTION,
} from './types.js';

// Story 7.2: Diagnostic engine
export {
  runDiagnostics,
  detectStalePatterns,
  detectMissingCooccurrences,
  detectBadPredictions,
  detectDecliningAccuracy,
  detectCrossDomainDependencies,
  detectThinDomains,
  calculateHealthScore,
  buildDiagnosticPrompt,
  runDiagnosticInference,
  renderDiagnosticReport,
} from './doctor.js';

export type {
  DiagnosticOptions,
  DiagnosticReport,
  DiagnosticHealthScore,
  DiagnosticFinding,
  Recommendation,
  DiagnosticContext,
} from './types.js';

export {
  MIN_TASKS_FOR_PATTERN_DETECTION,
  MIN_TASKS_FOR_STALENESS,
  DEFAULT_STALENESS_WINDOW,
  STALENESS_WEIGHT_THRESHOLD,
  STALENESS_DECAY_BASE,
  COOCCURRENCE_MIN_RATIO,
  MIN_PREDICTIONS_FOR_BAD,
  BAD_PREDICTION_HIT_THRESHOLD,
  SEVERITY_DEDUCTIONS,
  CROSS_DOMAIN_MIN_RATIO,
  DECLINING_ACCURACY_DROP,
  TREND_WINDOW_SIZE,
} from './types.js';

// Story 7.3: Supervised mode
export {
  checkThresholds,
  computeF1,
  filterCooledDownAlerts,
  createCooldown,
  runSupervised,
  generateFixProposals,
  calculateProposalConfidence,
  verifyFixes,
  createOverridesFromFixes,
  isOverrideActive,
  getActiveOverrides,
  applyAddCooccurrence,
  applyRemoveStale,
  applyReduceWeight,
  applyFix,
  renderThresholdAlert,
  renderFixProposal,
  runSupervisedFixFlow,
  promptAlertChoice,
  promptFixApproval,
} from './supervised.js';

export type {
  ThresholdAlert,
  AlertChoice,
  FixAction,
  FixProposal,
  FixResult,
  SupervisedSession,
} from './types.js';

export { MIN_TASKS_FOR_THRESHOLD } from './types.js';

// Story 7.4: Autonomous mode & audit logging
export {
  runAutonomous,
  renderAutonomousNotification,
} from './autonomous.js';

export {
  runDeepAnalysis,
  getArchiveMetadata,
  renderDeepAnalysisPrompt,
  promptDeepAnalysisApproval,
} from './doctor.js';

export {
  writeDoctorLogEntry,
  buildLogEntry,
  generateLogEntryId,
  mapFixResultsToAuditActions,
  getLastRunTimestamps,
  summarizeDoctorHistory,
} from './audit-log.js';

export type {
  AutonomousConfig,
  AutonomousResult,
  DeepAnalysisOptions,
  DoctorTrigger,
  AuditAction,
  DomainCooldown,
  DoctorOverride,
  DoctorHistorySummary,
} from './types.js';

export {
  AUTO_APPLY_RISK_LEVELS,
  DEFAULT_COOLDOWN_TASKS,
  DEFAULT_COOLDOWN_MS,
  DEFAULT_OVERRIDE_GRACE_PERIOD,
  MAX_DOCTOR_LOG_ENTRIES,
  DEEP_ANALYSIS_BASE_TOKENS,
  DEEP_ANALYSIS_TOKENS_PER_100,
} from './types.js';
