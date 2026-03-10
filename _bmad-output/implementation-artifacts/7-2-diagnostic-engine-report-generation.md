# Story 7.2: Diagnostic Engine & Report Generation

Status: done
Epic: 7 - Doctor Agent & Automated Recovery
Story: 7.2
Date: 2026-03-04
Complexity: High
Estimated Scope: AI-powered diagnostic engine analyzing knowledge store health with Haiku model integration and structured report generation

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want the Doctor to analyze my knowledge store and identify specific problems,
so that I understand why predictions might be degrading and what can be fixed.

## Acceptance Criteria (BDD)

### AC1: Knowledge Store Diagnostic Analysis
**Given** a developer runs `co doctor`
**When** the diagnostic engine analyzes the knowledge store
**Then** it checks for: stale patterns (high historical frequency but absent in recent sessions), missing co-occurrence patterns (files that consistently appear together but have no formal pattern), and bad predictions (files consistently predicted but not used)
**And** each finding includes: finding type, affected files/patterns, evidence (data that led to the finding), and a recommended fix

### AC2: Diagnostic Report Generation
**Given** the diagnostic engine completes analysis
**When** the report is generated
**Then** it includes: overall health score (0-100), per-domain health breakdown, list of findings sorted by severity, and recommended actions for each finding
**And** the report is displayed using Chalk box-drawing terminal UI

### AC3: Healthy Knowledge Store Report
**Given** the knowledge store is healthy with no issues
**When** the diagnostic report is generated
**Then** a positive health report is shown: "Knowledge store health: 95/100 — No issues found"
**And** per-domain scores are displayed
**And** token cost is reported

### AC4: Sparse Data Handling
**Given** the knowledge store has sparse data (e.g., <10 tasks)
**When** the diagnostic engine runs
**Then** it accounts for limited data and doesn't over-diagnose
**And** findings note "limited data — accuracy may improve with more tasks"
**And** the health score is not penalized for having few tasks

### AC5: Haiku Model Token Cost
**Given** the diagnostic engine sends inference to Claude Code
**When** diagnostic analysis runs
**Then** all diagnostic inference is sent requesting Haiku model to minimize token cost
**And** a typical Doctor session costs <500 tokens
**And** the token cost is reported in the diagnostic report

### AC6: Domain-Focused Diagnostics
**Given** a developer runs `co doctor --domain <name>`
**When** the diagnostic engine runs
**Then** analysis is focused on the specified domain only
**And** findings and health score are scoped to that domain
**And** token cost is reduced compared to full analysis

### AC7: Report-Only Mode
**Given** a developer runs `co doctor --report-only`
**When** the diagnostic report is generated
**Then** findings are shown without proposing fixes or prompting for action
**And** the report is display-only with no interactive prompts

## Tasks / Subtasks

- [x] Task 1: Define diagnostic engine types (AC: #1, #2)
  - [x]In `src/doctor/types.ts`, add diagnostic-specific types (building on types defined in Story 7.1)
  - [x]Define `DiagnosticReport` interface: `{ healthScore: HealthScore; findings: Finding[]; recommendations: Recommendation[]; tokensCost: number; timestamp: string; domain?: string }`
  - [x]Define `HealthScore` interface: `{ overall: number; perDomain: Record<string, number> }` — scores 0.0–1.0
  - [x]Define `Finding` interface: `{ id: string; type: FindingType; severity: FindingSeverity; description: string; affectedFiles: string[]; affectedDomain: string; evidence: string; recommendation: string }`
  - [x]Define `Recommendation` interface: `{ findingId: string; action: string; riskLevel: 'low' | 'medium' | 'high'; description: string }`
  - [x]Define `DiagnosticOptions` interface: `{ domain?: string; reportOnly?: boolean; deep?: boolean }`

- [x] Task 2: Implement stale pattern detection (AC: #1, #4)
  - [x]In `src/doctor/doctor.ts`, implement `detectStalePatterns(patterns, taskHistory, metrics): Finding[]`
  - [x]Identify patterns with high historical weight (>0.5) but unused in last N tasks (configurable, default 5)
  - [x]For each stale pattern: create Finding with type `'stale-pattern'`, severity based on staleness duration
  - [x]Evidence: "weight X.XX, unused in last N tasks, last seen in task T"
  - [x]Recommendation: "Remove from active predictions" or "Reduce weight"
  - [x]If task history has <10 entries, mark finding as "limited data — accuracy may improve with more tasks"

- [x] Task 3: Implement missing co-occurrence detection (AC: #1, #4)
  - [x]Implement `detectMissingCooccurrences(taskHistory, patterns): Finding[]`
  - [x]Analyze task history for file pairs that appear together in 80%+ of tasks but have no formal co-occurrence pattern
  - [x]For each missing pattern: create Finding with type `'missing-cooccurrence'`, severity `'low'`
  - [x]Evidence: "files A and B appeared together in X/Y tasks (Z%)"
  - [x]Recommendation: "Add co-occurrence pattern (confidence: 0.XX)"
  - [x]Skip detection if fewer than 5 tasks in history (insufficient data for pattern detection)

- [x] Task 4: Implement bad prediction detection (AC: #1, #4)
  - [x]Implement `detectBadPredictions(taskHistory, metrics): Finding[]`
  - [x]Identify files that are consistently predicted but never or rarely used (predicted in 3+ tasks, used in <20% of those)
  - [x]For each bad prediction: create Finding with type `'bad-prediction'`, severity `'medium'`
  - [x]Evidence: "predicted in X tasks, used in Y (Z% hit rate)"
  - [x]Recommendation: "Reduce prediction weight" or "Remove from patterns"
  - [x]Account for sparse data: if fewer than 5 predictions for a file, mark as "limited data"

- [x] Task 5: Implement health score calculation (AC: #2, #3)
  - [x]Implement `calculateHealthScore(findings: Finding[], metrics, taskHistory): HealthScore`
  - [x]Overall score: start at 1.0, deduct based on finding severity (critical: -0.15, medium: -0.10, low: -0.05, info: 0)
  - [x]Per-domain score: calculate from domain-specific metrics (prediction accuracy per domain from metrics.json)
  - [x]Floor at 0.0, cap at 1.0
  - [x]If no findings, overall score based on metrics data (precision, recall averages)
  - [x]Display as 0-100 percentage in UI (multiply by 100, round)

- [x] Task 6: Implement Haiku diagnostic prompt (AC: #5)
  - [x]Implement `buildDiagnosticPrompt(findings: Finding[], context: DiagnosticContext): string`
  - [x]Craft a focused prompt that sends: summary of findings, affected patterns, recent accuracy metrics
  - [x]Keep prompt under 300 tokens to leave room for response within 500-token budget
  - [x]Include instruction to request Haiku model: model routing hint in prompt
  - [x]Implement `runDiagnosticInference(prompt: string): Promise<Result<string>>` — calls adapter with diagnostic prompt targeting Haiku
  - [x]Parse Haiku response to extract additional insights and refine recommendations
  - [x]If adapter call fails, fall back to local-only analysis (no AI enhancement, still produces report)

- [x] Task 7: Implement diagnostic engine orchestrator (AC: #1, #2, #6)
  - [x]Implement `runDiagnostics(options: DiagnosticOptions): Promise<Result<DiagnosticReport>>`
  - [x]Load required data from store: patterns, task-history, metrics, dependency-graph
  - [x]If `options.domain` is set, filter data to specified domain before analysis
  - [x]Run all three detectors: stale patterns, missing co-occurrences, bad predictions
  - [x]Calculate health score
  - [x]If not `reportOnly`, call Haiku for AI-enhanced analysis
  - [x]Assemble DiagnosticReport with all findings sorted by severity (critical first)
  - [x]Wrap entire function in `withFailOpen` — on failure, return minimal report with error message

- [x] Task 8: Implement diagnostic report rendering (AC: #2, #3)
  - [x]Implement `renderDiagnosticReport(report: DiagnosticReport): string` using Chalk + box-drawing
  - [x]Render health score bar: `Health Score: 62% [######....] (was 68% last check)`
  - [x]Render findings list with severity icons: critical (X), medium (warning triangle), low (warning), info (i)
  - [x]For each finding: type, description, evidence, recommended fix
  - [x]Render per-domain health breakdown
  - [x]Render token cost: `Cost: 340 tokens (Haiku)`
  - [x]Render fix options (unless `--report-only`): [1] Apply all / [2] Review one by one / [3] Skip
  - [x]Match the PRD CLI mockup layout for standard diagnostic output

- [x] Task 9: Register `co doctor` CLI command enhancements (AC: #6, #7)
  - [x]Update `doctor` command in `src/index.ts` to handle default (no flags) = run diagnostics
  - [x]Add `--domain <name>` flag — pass to `runDiagnostics({ domain: name })`
  - [x]Add `--report-only` flag — pass to `runDiagnostics({ reportOnly: true })`
  - [x]Add `--deep` flag placeholder (implemented in Story 7.4)
  - [x]When diagnostics complete and not `--report-only`: display report, prompt for fix application (delegated to Story 7.3 for actual fix application)

- [x] Task 10: Update doctor module barrel export (AC: #1)
  - [x]Update `src/doctor/index.ts` to export `runDiagnostics` from `doctor.ts`
  - [x]Export all new types: `DiagnosticReport`, `HealthScore`, `Finding`, `Recommendation`, `DiagnosticOptions`

- [x] Task 11: Write unit tests (AC: #1–#7)
  - [x]Create `tests/doctor/doctor.test.ts`
  - [x]Test: stale pattern detection — pattern with high weight + unused in recent tasks → finding created
  - [x]Test: stale pattern detection — pattern recently used → no finding
  - [x]Test: missing co-occurrence detection — files appearing together 80%+ → finding created
  - [x]Test: missing co-occurrence detection — existing formal pattern → no finding
  - [x]Test: bad prediction detection — file predicted 5 times, used 0 → finding created
  - [x]Test: bad prediction detection — file with good hit rate → no finding
  - [x]Test: health score calculation — no findings + good metrics → high score
  - [x]Test: health score calculation — multiple findings → score deducted correctly
  - [x]Test: sparse data handling — fewer than 10 tasks → "limited data" notes added, no over-diagnosis
  - [x]Test: domain-focused diagnostics — only domain-relevant findings returned
  - [x]Test: report-only mode — no fix prompts in output
  - [x]Test: Haiku prompt stays under 300 tokens
  - [x]Test: adapter failure falls back to local-only report
  - [x]Mock adapter and store for all tests

- [x] Task 12: Verify end-to-end (AC: #1–#7)
  - [x]Run `npm run build` — verify clean build with zero errors
  - [x]Run `npm run test` — verify all new tests pass
  - [x]Run `npm run typecheck` — verify TypeScript strict mode passes
  - [x]Manually test: `co doctor` on a project with known issues
  - [x]Manually test: `co doctor --domain auth` for domain-focused analysis
  - [x]Manually test: `co doctor --report-only` for display-only mode

## Dev Notes

### Architecture Decisions to Follow

| Decision | Requirement | Source |
|---|---|---|
| AD-03 | All file I/O through `store/` module — never direct filesystem access | [Source: architecture.md#Core Architectural Decisions] |
| AD-04 | `withFailOpen(stageFn, fallback)` wrapper for error boundaries | [Source: architecture.md#Core Architectural Decisions] |
| AD-05 | POSIX internal paths, platform-native I/O via `utils/paths.ts` | [Source: architecture.md#Core Architectural Decisions] |
| AD-06 | TypeScript Type Guards for validation (no Zod/Ajv) | [Source: architecture.md#Core Architectural Decisions] |
| AD-07 | Chalk + String Templates for terminal UI (no TUI framework) | [Source: architecture.md#Core Architectural Decisions] |
| AD-08 | Doctor uses same adapter as regular tasks with diagnostic prompt targeting Haiku model | [Source: architecture.md#Core Architectural Decisions] |

### Haiku Model Integration (AD-08)

The Doctor uses the **same Claude Code subprocess adapter** as regular tasks. The diagnostic prompt explicitly requests Haiku model for cost minimization. The prompt is crafted to stay within the 500-token budget:

```typescript
// Diagnostic prompt structure (simplified)
const diagnosticPrompt = `
You are a diagnostic agent analyzing knowledge store health.
Model: haiku
Findings: ${JSON.stringify(summaryFindings)}
Recent accuracy: ${JSON.stringify(recentMetrics)}
Provide: refined recommendations, priority ordering, any patterns missed.
Keep response under 200 tokens.
`;
```

The adapter call is wrapped in `withFailOpen` — if Claude Code is unavailable or errors, the diagnostic report is still generated from local analysis alone (just without AI-enhanced recommendations).

### Detection Algorithm Details

**Stale Pattern Detection:**
- Read `patterns.json` for all active patterns with their weights
- Read `task-history.json` for recent tasks (last 5-10)
- A pattern is "stale" if: weight > 0.5 AND file not referenced in any of the last N tasks
- Severity scales with staleness: unused 5 tasks = medium, unused 10+ = critical

**Missing Co-occurrence Detection:**
- Iterate through `task-history.json` and count file pair appearances
- For each pair appearing together in 80%+ of tasks: check if formal pattern exists in `patterns.json`
- If no formal pattern: create finding with the co-occurrence statistics as evidence

**Bad Prediction Detection:**
- Read `metrics.json` for per-file prediction accuracy
- A prediction is "bad" if: predicted in 3+ tasks AND actual usage < 20% of predictions
- Severity: medium for consistent misses, low for occasional misses

### Health Score Algorithm

```
Overall = 1.0
For each finding:
  if severity == 'critical': overall -= 0.15
  if severity == 'medium':   overall -= 0.10
  if severity == 'low':      overall -= 0.05
  if severity == 'info':     overall -= 0.00
overall = Math.max(0, Math.min(1.0, overall))

Per-domain scores from metrics.json prediction accuracy data
```

### Store Access Pattern

Doctor module reads: task-history, patterns, metrics, dep-graph. Writes: patterns, metrics, doctor-log (writes happen in Story 7.3 when fixes are applied; this story only reads for diagnostics).

```typescript
import { readTaskHistory, readPatterns, readMetrics,
         readDependencyGraph, readDoctorLog } from '../store/index.js';
import { executeTask } from '../adapter/index.js';  // For Haiku diagnostic calls
```

### Naming Conventions (MUST FOLLOW)

| Element | Convention | Example |
|---|---|---|
| Source files | kebab-case.ts | `doctor.ts`, `checkup.ts` |
| Test files | kebab-case.test.ts | `tests/doctor/doctor.test.ts` |
| Functions | camelCase | `runDiagnostics()`, `detectStalePatterns()` |
| Variables | camelCase | `diagnosticReport`, `healthScore` |
| Types/Interfaces | PascalCase | `DiagnosticReport`, `Finding` |
| Constants | UPPER_SNAKE_CASE | `STALENESS_THRESHOLD`, `COOCCURRENCE_MIN_RATIO` |
| Booleans | is/has/should/can prefix | `isStale`, `hasCooccurrence` |
| JSON fields | camelCase | `healthScore`, `affectedDomain` |
| IDs | Prefixed with entity abbreviation | `doc_20260304_001` (doctor entry) |

[Source: architecture.md#Naming Patterns]

### Code Patterns (MUST FOLLOW)

**Result<T> Pattern:**
```typescript
type Result<T> = { ok: true; value: T } | { ok: false; error: string };
```

**Finding IDs:** Follow the convention `f_<findingType>_<index>`, e.g., `f_stale_001`, `f_cooccur_002`.

**Confidence Scores:** Always 0.0-1.0 float in data, convert to percentage only for display.

[Source: architecture.md#Format Patterns]

### Import Rules (MUST FOLLOW)

- Modules import from other modules ONLY through their `index.ts` barrel export
- Never import from another module's internal files directly
- Doctor module imports: `store/index.ts` (data access), `adapter/index.ts` (Haiku calls), `utils/index.ts` (paths, logger, constants, errors)

[Source: architecture.md#Import Rules]

### Dependencies

- **Story 7.1:** Doctor module scaffold, types.ts, index.ts barrel — must be complete
- **Epic 1 (Stories 1.1, 1.2):** Store module, utils, types, constants
- **Epic 2 (Story 2.1):** Adapter module for Haiku diagnostic calls
- **Epic 3 (Story 3.1):** Metrics data that diagnostics analyze

### What This Story Does NOT Create

- Fix application logic — Story 7.3 handles user-approved fix application
- Supervised mode threshold alerts — Story 7.3
- Autonomous mode auto-fix — Story 7.4
- Deep analysis with archived history — Story 7.4
- Audit logging — Story 7.4

### References

- [Source: architecture.md#Complete Project Directory Structure] — Doctor module file layout
- [Source: architecture.md#Core Architectural Decisions] — AD-03 through AD-08
- [Source: architecture.md#Implementation Patterns & Consistency Rules] — Naming, structure, format patterns
- [Source: architecture.md#Project Structure & Boundaries] — Module boundaries and dependency direction
- [Source: prd.md#Domain 8: Doctor Agent] — DR-01, DR-02, DR-03, DR-04, DR-05, DR-10, DR-11
- [Source: prd.md#doctor-log.json] — Doctor log schema
- [Source: prd.md#co doctor CLI mockups] — Standard diagnostic UI mockup
- [Source: prd.md#Module Access Matrix] — Doctor read/write permissions
- [Source: epics.md#Story 7.2] — Original story definition and acceptance criteria

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
None — clean implementation with no blocking issues.

### Completion Notes List
- Implemented all 12 tasks for Story 7.2 Diagnostic Engine & Report Generation
- Created `src/doctor/doctor.ts` with full diagnostic engine: stale pattern detection, missing co-occurrence detection, bad prediction detection, health score calculation, Haiku diagnostic prompt, orchestrator, and report rendering
- Updated `src/doctor/types.ts` with DiagnosticReport, DiagnosticHealthScore, DiagnosticFinding, Recommendation, DiagnosticOptions, DiagnosticContext interfaces and all diagnostic constants
- Updated `src/doctor/index.ts` barrel export to replace placeholder with real implementation
- Updated `src/index.ts` CLI to add --domain, --report-only, --deep flags, and default diagnostics when no --checkup flag
- All detection algorithms follow spec: staleness checks weight > 0.5 + unused in last N tasks, co-occurrence detects 80%+ pairs without formal pattern, bad predictions detect files predicted 3+ times with <20% hit rate
- Health score: starts at 1.0, deducts per severity (critical: -0.15, medium: -0.10, low: -0.05), floors at 0, caps at 1.0
- Sparse data handling: <10 tasks adds "limited data" notes, <5 tasks skips co-occurrence detection
- Haiku prompt stays under 300 tokens; adapter failure falls back to local-only analysis via withFailOpen
- 24 unit tests covering all acceptance criteria, all pass
- Full regression suite: 708 tests pass across 46 files, zero regressions
- TypeScript strict mode passes, build succeeds

### File List
- `src/doctor/types.ts` — Modified: added DiagnosticOptions, DiagnosticHealthScore, DiagnosticFinding, Recommendation, DiagnosticReport, DiagnosticContext interfaces and diagnostic constants
- `src/doctor/doctor.ts` — New: diagnostic engine with detectStalePatterns, detectMissingCooccurrences, detectBadPredictions, calculateHealthScore, buildDiagnosticPrompt, runDiagnosticInference, runDiagnostics, renderDiagnosticReport
- `src/doctor/index.ts` — Modified: replaced runDiagnostics placeholder with real exports from doctor.ts, added type exports
- `src/index.ts` — Modified: added --domain, --report-only, --deep flags to doctor command, default runs diagnostics
- `tests/doctor/doctor.test.ts` — New: 24 unit tests covering all ACs

### Change Log
- 2026-03-05: Implemented Story 7.2 — Diagnostic Engine & Report Generation. Full diagnostic analysis with stale pattern detection, missing co-occurrence detection, bad prediction detection, health scoring, Haiku model integration, and Chalk-based report rendering. CLI updated with --domain, --report-only, --deep flags.
- 2026-03-05: Code review passed — all ESLint errors fixed, all tests passing, build clean
