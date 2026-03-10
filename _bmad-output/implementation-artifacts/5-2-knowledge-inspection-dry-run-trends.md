# Story 5.2: Knowledge Inspection, Dry-Run & Trends

Status: done
Epic: 5 - Visibility & Insights Dashboard
Story: 5.2
Date: 2026-03-04
Complexity: Medium-High
Estimated Scope: Knowledge domain inspection command, dry-run pipeline preview mode, accuracy trends ASCII visualization

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want to inspect what the optimizer knows about specific domains and preview its analysis without executing,
so that I can understand the system's intelligence, verify predictions, and build trust.

## Acceptance Criteria (BDD)

### AC1: Knowledge Domain Inspection (`co knowledge <domain>`)
**Given** a developer runs `co knowledge auth` (or any domain name)
**When** the knowledge display renders
**Then** it shows: files mapped to the "auth" domain, patterns detected (co-occurrences, conventions), prediction accuracy for this domain, and task history count for this domain
**And** each file shows its weight and times-seen count
**And** patterns show confidence scores with visual indicators

### AC2: Knowledge Domain Not Found
**Given** a developer runs `co knowledge <domain>` with a domain name that does not exist
**When** the command processes
**Then** a helpful message lists all available domains with task counts
**And** the command does not crash

### AC3: Knowledge Flags
**Given** a developer runs `co knowledge <domain>`
**When** the `--all` flag is used, it shows all domains in sequence
**When** the `--files` flag is used, it shows only the files section
**When** the `--patterns` flag is used, it shows only the patterns section

### AC4: Knowledge Domain Health
**Given** a developer runs `co knowledge <domain>`
**When** the knowledge display renders
**Then** it includes a health indicator for the domain (1-5 dots scale)
**And** health is derived from: accuracy, number of tasks, recency of data, and pattern count

### AC5: Dry-Run Mode (`co --dry-run "<task>"`)
**Given** a developer runs `co --dry-run "add dark mode to settings panel"`
**When** the dry-run analysis completes
**Then** the full optimizer analysis is displayed without executing: task classification (type, domain, complexity), predicted files with confidence scores, selected model with routing rationale, and the compressed/optimized prompt preview
**And** no subprocess is spawned, no tokens are consumed, no task history entry is created

### AC6: Dry-Run Zero Side Effects
**Given** a developer runs `co --dry-run "<task>"`
**When** the dry-run completes
**Then** no store files are modified (no writes to any JSON file)
**And** no Claude Code subprocess is spawned
**And** no task history entry is created
**And** the pipeline runs all analysis stages (analyzer, predictor, router, compressor) but stops before adapter execution

### AC7: Accuracy Trends Visualization (`co stats --trend`)
**Given** a developer has completed 20+ tasks
**When** they run `co stats --trend`
**Then** prediction accuracy over time is visualized as an ASCII line chart
**And** token savings over time are visualized (cumulative savings)
**And** per-domain accuracy breakdown is shown

### AC8: Trends with Insufficient Data
**Given** a developer has completed fewer than 5 tasks
**When** they run `co stats --trend`
**Then** a message is shown: "Need at least 5 completed tasks to show trends. Currently: N tasks."
**And** the command does not crash or show an empty/broken chart

## Tasks / Subtasks

- [x] Task 1: Implement knowledge data aggregation (AC: #1, #2, #4)
  - [x] Create `src/visibility/knowledge.ts`
  - [x] Implement `gatherKnowledgeData(domain: string): KnowledgeDisplayData` — reads from store (read-only): project-map.json, patterns.json, task-history.json, metrics.json
  - [x] Extract files mapped to the domain: file path, weight (0-1 float), times-seen count
  - [x] Sort files by weight descending
  - [x] Extract patterns for the domain: co-occurrence pairs with confidence scores, convention strings
  - [x] Calculate domain accuracy: precision and recall from metrics for this specific domain
  - [x] Calculate domain task count from task-history filtered by domain
  - [x] Calculate domain health score (1-5): based on accuracy (weight 0.4), task count (weight 0.2), recency (weight 0.2), pattern count (weight 0.2)
  - [x] Implement `listAvailableDomains(): DomainSummary[]` — list all domains with task counts, for the "not found" case
  - [x] Add types to `src/visibility/types.ts`: `KnowledgeDisplayData`, `DomainFileEntry`, `DomainPattern`, `DomainSummary`, `DomainHealth`
  - [x] Write tests: `tests/visibility/knowledge.test.ts`
- [x] Task 2: Implement knowledge display rendering (AC: #1, #2, #3, #4)
  - [x] Implement `renderKnowledge(data: KnowledgeDisplayData): string` in `knowledge.ts`
  - [x] Render "Files (N):" section with file path, weight, and times-seen for each file
  - [x] Use `\u2726` (filled star) for high-confidence files (weight >= 0.7) and `\u25cb` (circle) for lower-confidence files
  - [x] Render "Patterns (N):" section with co-occurrence pairs and confidence scores
  - [x] Render "Conventions:" section listing convention strings
  - [x] Render "Accuracy: N% precision | N% recall | N tasks" summary line
  - [x] Render "Health:" indicator with filled/empty dots (1-5 scale) and label (Poor/Fair/Good/Very Good/Excellent)
  - [x] Handle domain-not-found: render available domains list with task counts
  - [x] Handle `--all` flag: iterate all domains, render each
  - [x] Handle `--files` flag: render only the files section
  - [x] Handle `--patterns` flag: render only the patterns section
  - [x] Use `drawBox()` from formatters.ts for outer frame
  - [x] Write rendering tests with snapshot assertions
- [x] Task 3: Wire `co knowledge` command (AC: #1, #2, #3)
  - [x] In `src/visibility/index.ts`, register `knowledge` subcommand with `<domain>` argument
  - [x] Add `--all`, `--files`, `--patterns` options
  - [x] Handle missing domain argument: show help text or prompt for domain name
  - [x] Call `gatherKnowledgeData()` and `renderKnowledge()`, output to stdout
- [x] Task 4: Implement dry-run pipeline execution (AC: #5, #6)
  - [x] In `src/visibility/index.ts` (or a dedicated handler), implement dry-run logic
  - [x] When `--dry-run` global flag is set with a task string:
    1. Run analyzer: `classifyTask(userPrompt)` to get classification result
    2. Run predictor: `predictFiles(classification, userPrompt)` to get predicted files
    3. Run router: `selectModel(classification, prediction)` to get model selection
    4. Run compressor: `compressPrompt(userPrompt, prediction, classification)` to get compression estimate
    5. STOP — do NOT call the adapter (no subprocess spawn)
    6. Do NOT call the learner (no task history write)
    7. Do NOT call the tracker (no token tracking)
  - [x] Wrap each stage in `withFailOpen()` — if any stage fails, show partial results with error note
  - [x] Verify zero writes: no store mutation, no subprocess, no side effects
  - [x] Write tests: `tests/visibility/dry-run.test.ts` — verify pipeline stages run, adapter never called, store never written
- [x] Task 5: Implement dry-run display rendering (AC: #5)
  - [x] Implement `renderDryRun(result: DryRunResult): string`
  - [x] Add `DryRunResult` type to `src/visibility/types.ts`: classification, predictedFiles, routing, compressionEstimate
  - [x] Render "Dry Run (no tokens spent)" box title
  - [x] Render "Type: X  Domain: Y  Complexity: Z" classification line
  - [x] Render "Would route to: model-name" routing line
  - [x] Render "Predicted files (N):" section with file path, confidence score per file
  - [x] Use `\u2726` (filled star) for high-confidence files (>= 0.7) and `\u25cb` (circle) for lower-confidence files
  - [x] Render "Prompt compression: est. N% reduction" line
  - [x] Render "Est. token cost: ~N (vs ~M raw)" line
  - [x] Use `drawBox()` from formatters.ts
  - [x] Write rendering tests with snapshot assertions
- [x] Task 6: Wire dry-run in CLI entry point (AC: #5, #6)
  - [x] In `src/index.ts`, check for `--dry-run` global option before running main pipeline
  - [x] If `--dry-run` is set with a task argument, call dry-run handler instead of normal pipeline
  - [x] Ensure the dry-run path is completely separate from the execution path — no accidental subprocess spawn
  - [x] Output rendered dry-run result to stdout and exit with code 0
- [x] Task 7: Implement accuracy trends data aggregation (AC: #7, #8)
  - [x] Add trends logic to `src/visibility/stats.ts` (extend existing stats module from Story 5.1)
  - [x] Implement `gatherTrendsData(): TrendsDisplayData` — reads from store (read-only): task-history.json, metrics.json
  - [x] Calculate accuracy over time: group tasks by session, compute accuracy per session
  - [x] Calculate cumulative token savings over time: running total of savings per session
  - [x] Calculate per-domain accuracy breakdown: domain name with accuracy per session
  - [x] Add types to `src/visibility/types.ts`: `TrendsDisplayData`, `SessionAccuracy`, `CumulativeSavings`
  - [x] Handle insufficient data: return `{ hasEnoughData: false, taskCount: N }` if fewer than 5 tasks
  - [x] Write tests: `tests/visibility/trends.test.ts`
- [x] Task 8: Implement ASCII chart rendering for trends (AC: #7, #8)
  - [x] Add `drawLineChart(data: ChartDataPoint[], options: ChartOptions): string` to `src/visibility/formatters.ts`
  - [x] Chart renders an ASCII line chart with Y-axis labels (percentage), X-axis labels (session numbers)
  - [x] Use `\u25cf` (filled circle) for data points and line-drawing characters (`\u2500`, `\u2502`, `\u2570`, `\u256f`) for connections
  - [x] Chart width defaults to 60 characters, height to 10 rows
  - [x] Add types to `src/visibility/types.ts`: `ChartDataPoint`, `ChartOptions`
  - [x] Write tests for chart rendering
- [x] Task 9: Implement trends display rendering (AC: #7, #8)
  - [x] Implement `renderTrends(data: TrendsDisplayData): string` in `stats.ts`
  - [x] Render "Prediction Accuracy Over Time" ASCII line chart using `drawLineChart()`
  - [x] Render "Cumulative Token Savings" section (numeric summary or second chart)
  - [x] Render "Per-Domain Accuracy" breakdown table
  - [x] Handle insufficient data: render friendly message with current task count
  - [x] Wire `--trend` flag on `co stats` command (extend from Story 5.1)
  - [x] Write rendering tests with snapshot assertions
- [x] Task 10: Verify end-to-end (AC: #1 through #8)
  - [x] Run `npm run typecheck` — verify TypeScript strict mode passes
  - [x] Run `npm run test` — verify all new tests pass (knowledge, dry-run, trends, formatters)
  - [x] Run `co knowledge <domain>` with sample data — verify domain inspection renders correctly
  - [x] Run `co knowledge <nonexistent>` — verify helpful "not found" message with domain list
  - [x] Run `co --dry-run "test task"` with sample data — verify analysis renders, no side effects
  - [x] Run `co stats --trend` with 20+ tasks — verify ASCII trend chart renders
  - [x] Run `co stats --trend` with <5 tasks — verify insufficient data message
  - [x] Run `npm run lint` — verify ESLint passes

## Dev Notes

### ASCII Mockups (from PRD)

**`co knowledge <domain>` display:**
```
$ co knowledge learning-engine

+-- Knowledge: learning-engine ---------------------------------+
|                                                                |
| Files (8):                                                     |
|   * src/patterns.ts        weight: 0.92  seen: 12x            |
|   * src/learner.ts         weight: 0.88  seen: 11x            |
|   * src/types.ts           weight: 0.71  seen: 8x             |
|   * src/config.ts          weight: 0.65  seen: 7x             |
|   * tests/patterns.test.ts weight: 0.58  seen: 6x             |
|   o src/decay.ts           weight: 0.52  seen: 4x             |
|   o src/weights.ts         weight: 0.45  seen: 3x             |
|   o src/index.ts           weight: 0.30  seen: 2x             |
|                                                                |
| Patterns (3):                                                  |
|   * patterns.ts + learner.ts co-occur (conf: 0.89)            |
|   * patterns.ts + types.ts co-occur (conf: 0.74)              |
|   o decay.ts + weights.ts co-occur (conf: 0.52)               |
|                                                                |
| Conventions:                                                   |
|   "confidence is a 0-1 float"                                  |
|   "evidence_count drives confidence"                           |
|                                                                |
| Accuracy: 89% precision | 81% recall | 12 tasks               |
| Health: ***** Good                                             |
+----------------------------------------------------------------+
```

Note: `*` represents the Unicode filled star (`\u2726`) and `o` represents the circle (`\u25cb`) in actual terminal output. High confidence (>= 0.7) gets the filled star, lower gets the circle.

**`co --dry-run` display:**
```
$ co --dry-run "add dark mode to settings panel"

+-- Dry Run (no tokens spent) ---------------------------------+
| Type: feature  Domain: ui-settings  Complexity: medium        |
| Would route to: sonnet                                        |
| Predicted files (8):                                          |
|   * src/components/Settings.tsx    conf: 0.94                 |
|   * src/styles/settings.css        conf: 0.91                 |
|   * src/hooks/useTheme.ts          conf: 0.87                 |
|   * src/context/ThemeContext.tsx    conf: 0.85                 |
|   * src/types/theme.ts             conf: 0.80                 |
|   * tests/Settings.test.tsx        conf: 0.78                 |
|   o src/constants/colors.ts        conf: 0.52                 |
|   o src/components/Header.tsx      conf: 0.41                 |
| Prompt compression: est. 42% reduction                        |
| Est. token cost: ~1,800 (vs ~4,200 raw)                      |
+---------------------------------------------------------------+
```

**`co stats --trend` chart:**
```
Prediction Accuracy Over Time

  100%|
   90%|                              *-*
   80%|                    *---*--*-/
   70%|              *--*-/
   60%|        *--*-/
   50%|  *--*-/
   40%|-/
      +------------------------------------
       s1  s2  s3  s4  s5  s6  s7  s8  s9  s10 s11 s12
```

### Architecture Decisions to Follow

| Decision | Requirement | Source |
|---|---|---|
| AD-02 | Typed Pipeline with Orchestrator — dry-run reuses pipeline stages but stops before adapter | [Source: architecture.md#Core Architectural Decisions] |
| AD-03 | Single Store Module with Typed Accessors — all reads through `store/index.ts` | [Source: architecture.md#Core Architectural Decisions] |
| AD-04 | Fail-Open wrapper — dry-run pipeline stages are wrapped with `withFailOpen()` | [Source: architecture.md#Core Architectural Decisions] |
| AD-07 | Chalk + String Templates for terminal UI (no TUI framework). Box-drawing with template strings and Chalk for colors | [Source: architecture.md#Core Architectural Decisions] |
| Module Access | Visibility module has **READ-ONLY** access to all store files. Never writes to any store file | [Source: architecture.md#Module Access Enforcement] |

### Key Design Principles

1. **Read-Only Store Access:** The visibility module reads project-map.json, patterns.json, task-history.json, metrics.json, token-usage.json, and config.json but NEVER writes to any of them. All store access is through typed read accessors from `store/index.ts`.

2. **Dry-Run Is Not a Partial Pipeline:** Dry-run executes the full analysis pipeline (analyzer -> predictor -> router -> compressor) but explicitly skips the execution phase (adapter, learner, tracker). It is a separate code path that reuses pipeline stage functions, not a flag that conditionally skips steps inside the main pipeline.

3. **Dry-Run Zero Side Effects Contract:** This is a hard guarantee. No writes to any store file. No subprocess spawn. No token tracking. The test suite must verify this by mocking the store write functions and asserting they are never called.

4. **ASCII Chart Is a Formatter:** The `drawLineChart()` function belongs in `formatters.ts` as a shared rendering primitive. It takes data points and options, returns a string. It does not know about stats, sessions, or accuracy -- it is a generic chart renderer.

5. **Domain Health Is a Composite Score:** Health is not a single metric but a weighted composite: accuracy (40%), task count (20%), recency (20%), pattern count (20%). This produces a 0-1 score that maps to a 1-5 dot indicator with labels: 1=Poor, 2=Fair, 3=Good, 4=Very Good, 5=Excellent.

6. **No TUI Framework (AD-07):** All terminal UI is built with Chalk for colors and string template literals for layout. Box-drawing characters are Unicode code points. No `blessed`, `ink`, or similar TUI libraries.

7. **Confidence Scores Display:** Confidence scores are stored as 0.0-1.0 floats in the store. The visibility layer converts to percentage ONLY for display (e.g., 0.82 becomes "82%"). Dry-run file predictions display as "conf: 0.94" (raw float, not percentage) to match PRD mockup.

### Naming Conventions (MUST FOLLOW)

| Element | Convention | Example |
|---|---|---|
| Source files | kebab-case.ts | `knowledge.ts`, `formatters.ts` |
| Test files | kebab-case.test.ts | `tests/visibility/knowledge.test.ts`, `tests/visibility/dry-run.test.ts` |
| Functions | camelCase | `gatherKnowledgeData()`, `renderDryRun()`, `drawLineChart()` |
| Variables | camelCase | `domainFiles`, `healthScore`, `trendData` |
| Types/Interfaces | PascalCase | `KnowledgeDisplayData`, `DryRunResult`, `ChartDataPoint` |
| Constants | UPPER_SNAKE_CASE | `MIN_TASKS_FOR_TRENDS`, `HEALTH_WEIGHTS` |
| Booleans | is/has/should/can prefix | `hasEnoughData`, `isDomainFound`, `isDryRun` |

[Source: architecture.md#Naming Patterns]

### Code Patterns (MUST FOLLOW)

**Result<T> Pattern:**
```typescript
type Result<T> = { ok: true; value: T } | { ok: false; error: string };

function ok<T>(value: T): Result<T> { return { ok: true, value }; }
function err<T>(error: string): Result<T> { return { ok: false, error }; }
```

**Confidence Scores:** Always 0.0-1.0 float in data, convert to percentage only for display.

**Null vs Undefined:** JSON uses `null`, TypeScript uses `undefined` for optional params, `null` for explicit "no value".

**Dry-Run Pipeline Pattern:**
```typescript
// Dry-run reuses pipeline stage functions but stops before adapter
async function executeDryRun(userPrompt: string): Promise<DryRunResult> {
  const classification = withFailOpen(
    () => classifyTask(userPrompt),
    DEFAULT_CLASSIFICATION,
    'dry-run:analyzer'
  );

  const prediction = withFailOpen(
    () => predictFiles(classification, userPrompt),
    DEFAULT_PREDICTION,
    'dry-run:predictor'
  );

  const routing = withFailOpen(
    () => selectModel(classification, prediction),
    DEFAULT_ROUTING,
    'dry-run:router'
  );

  const compression = withFailOpen(
    () => compressPrompt(userPrompt, prediction, classification),
    DEFAULT_COMPRESSION,
    'dry-run:compressor'
  );

  // STOP HERE — no adapter, no learner, no tracker
  return { classification, prediction, routing, compression };
}
```

**Knowledge Health Calculation:**
```typescript
const HEALTH_WEIGHTS = { accuracy: 0.4, taskCount: 0.2, recency: 0.2, patternCount: 0.2 };
const MIN_TASKS_FOR_TRENDS = 5;

function calculateDomainHealth(domain: DomainMetrics): DomainHealth {
  const score =
    domain.accuracy * HEALTH_WEIGHTS.accuracy +
    normalize(domain.taskCount, 0, 50) * HEALTH_WEIGHTS.taskCount +
    normalize(domain.recency, 0, 1) * HEALTH_WEIGHTS.recency +
    normalize(domain.patternCount, 0, 10) * HEALTH_WEIGHTS.patternCount;

  const dots = Math.max(1, Math.min(5, Math.round(score * 5)));
  const labels = ['Poor', 'Fair', 'Good', 'Very Good', 'Excellent'];
  return { score, dots, label: labels[dots - 1] };
}
```

**ASCII Chart Pattern:**
```typescript
function drawLineChart(data: ChartDataPoint[], options: ChartOptions): string {
  const { width = 60, height = 10, yLabel = '%', xLabels } = options;
  const lines: string[] = [];

  // Y-axis from max to min
  for (let row = height; row >= 0; row--) {
    const yValue = Math.round((row / height) * 100);
    const label = `${yValue.toString().padStart(5)}${yLabel}|`;
    // Plot data points for this row...
    lines.push(label + rowContent);
  }

  // X-axis
  lines.push('      +' + '-'.repeat(width));
  lines.push('       ' + xLabels.join('  '));

  return lines.join('\n');
}
```

[Source: architecture.md#Format Patterns]

### Import Rules (MUST FOLLOW)

- Modules import from other modules ONLY through their `index.ts` barrel export
- Never import from another module's internal files directly
- `visibility/` imports from `store/` (read-only accessors) and `utils/` (logger, paths, errors)
- `visibility/` imports pipeline stage functions from their barrel exports: `analyzer/index.ts`, `predictor/index.ts`, `router/index.ts`, `compressor/index.ts` (for dry-run only)
- Internal visibility files can import from `formatters.ts` directly (same module)
- Shared types used across 3+ modules go in `src/types/`

[Source: architecture.md#Import Rules]

### Library Versions (Verified March 2026)

| Package | Version | Notes |
|---|---|---|
| commander | 14.0.3 | CLI framework. Subcommand registration, global `--dry-run` option |
| chalk | 5.6.2 | ESM-only. Terminal styling — colors, bold, box-drawing |

### Project Structure (Files Created/Modified by This Story)

```
claude-opt/
├── src/
│   ├── index.ts                    # MODIFIED — wire --dry-run handler, wire knowledge command
│   └── visibility/
│       ├── index.ts                # MODIFIED — register knowledge command, export dry-run handler
│       ├── types.ts                # MODIFIED — add KnowledgeDisplayData, DryRunResult, TrendsDisplayData, chart types
│       ├── formatters.ts           # MODIFIED — add drawLineChart()
│       ├── stats.ts                # MODIFIED — add gatherTrendsData(), renderTrends()
│       └── knowledge.ts            # NEW — gatherKnowledgeData(), renderKnowledge(), listAvailableDomains()
├── tests/
│   └── visibility/
│       ├── knowledge.test.ts       # NEW — knowledge aggregation and rendering tests
│       ├── dry-run.test.ts         # NEW — dry-run pipeline and rendering tests, zero-side-effect verification
│       └── trends.test.ts          # NEW — trends aggregation and chart rendering tests
```

### Dependencies on Prior Stories

| Dependency | Story | What It Provides |
|---|---|---|
| Stats Dashboard & Formatters | 5.1 | `formatters.ts` (drawBox, drawProgressBar, drawTable), `visibility/index.ts` structure, `visibility/types.ts` base types |
| Knowledge Store | 1.2 | `readProjectMap()`, `readTaskHistory()`, `readMetrics()`, `readPatterns()`, `readTokenUsage()`, `readConfig()` — typed read accessors |
| Shared Types | 1.1, 1.2 | `Result<T>`, `TaskHistory`, `Metrics`, `Patterns`, `ProjectMap`, `Config` types |
| Utils | 1.1 | `logger`, `paths`, `errors`, `constants`, `withFailOpen()` |
| Pipeline Stages | Epic 2 | `classifyTask()` from analyzer, `predictFiles()` from predictor, `selectModel()` from router, `compressPrompt()` from compressor — needed for dry-run |
| Knowledge Learner | 3.1-3.2 | Task history and metrics data in store (accuracy, predictions, domain data) |
| Token Tracker | 3.5-3.7 | Token usage data in store (for savings trends) |
| Scanner | 1.3-1.5 | Project map with domain assignments (for knowledge inspection) |
| Pattern Detector | 3.2 | Patterns data in store (co-occurrences, conventions) |

### What This Story Does NOT Create

- `src/visibility/feedback.ts` — Created in a separate story (VL-06, VL-07)
- `co forget` command — Created in Story 4.10
- `co correct` command — Created in a separate story (VL-07)
- Interactive prompt review during dry-run — Dry-run skips user review entirely since no execution occurs

### References

- [Source: architecture.md#Core Architectural Decisions] — AD-02, AD-03, AD-04, AD-07
- [Source: architecture.md#Complete Project Directory Structure] — visibility/ module layout
- [Source: architecture.md#Module Access Enforcement] — Read-only access for visibility
- [Source: architecture.md#Implementation Patterns & Consistency Rules] — Naming, structure, format patterns
- [Source: architecture.md#Dependency Direction] — visibility/ -> store/ (read-only), visibility/ -> pipeline stages (for dry-run)
- [Source: prd.md#VL-03] — `co knowledge <domain>` requirements
- [Source: prd.md#VL-04] — `co --dry-run` requirements
- [Source: prd.md#VL-09] — Accuracy trends visualization requirements
- [Source: prd.md#CLI Mockups] — ASCII mockups for knowledge, dry-run, and trend displays
- [Source: epics.md#Story 5.2] — Original story definition and acceptance criteria

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
- TypeScript fix: FilePrediction uses `score` not `confidence`, RoutingResult uses `rationale` not `reason`. Fixed in dry-run.ts mapping code.

### Completion Notes List
- Task 1-2: Created `knowledge.ts` with `gatherKnowledgeData()` (reads project-map, patterns, task-history, metrics — all read-only per AD-03), `listAvailableDomains()`, `renderKnowledge()` with files/patterns/conventions/accuracy/health sections. Health uses composite score (accuracy 40%, taskCount 20%, recency 20%, patternCount 20%) mapped to 1-5 dots. 9 unit tests.
- Task 3: Registered `co knowledge <domain>` command with `--all`, `--files`, `--patterns` options in `registerVisibilityCommands()`. Removed old inline placeholder from `src/index.ts`.
- Task 4-5: Created `dry-run.ts` with `executeDryRun()` — reuses pipeline stage functions (analyzer, predictor, router, compressor) wrapped in `withFailOpen()`, STOPS before adapter. Zero side effects verified by test mocking all 8 store write functions and asserting none called. `renderDryRun()` renders classification, routing, predicted files with star/circle icons, compression estimate, and token cost estimate. 6 unit tests.
- Task 6: Updated `src/index.ts` default action to use `runDryRunCommand()` when `--dry-run` flag is set, completely separate from normal pipeline execution path.
- Task 7: Added `gatherTrendsData()` to `stats.ts` — groups tasks into session batches, calculates per-session accuracy and cumulative savings. Returns `hasEnoughData: false` when < 5 tasks (MIN_TASKS_FOR_TRENDS). 5 unit tests.
- Task 8: Added `drawLineChart()` to `formatters.ts` — generic ASCII chart renderer with Y-axis labels, X-axis labels, filled-circle data points. Configurable height/width. 3 unit tests.
- Task 9: Added `renderTrends()` to `stats.ts` — renders accuracy chart, cumulative savings, per-domain breakdown. Wired `--trend` flag on `co stats` command. 2 unit tests.
- Task 10: Full verification — TypeScript strict mode passes, 636 tests pass (43 files), zero regressions.

### File List
- `src/visibility/types.ts` — MODIFIED: added KnowledgeDisplayData, DomainFileEntry, DomainPattern, DomainHealth, DomainSummary, DryRunResult, DryRunFilePrediction, TrendsDisplayData, SessionAccuracy, CumulativeSavings, ChartDataPoint, ChartOptions
- `src/visibility/knowledge.ts` — NEW: gatherKnowledgeData(), listAvailableDomains(), renderKnowledge(), runKnowledgeCommand(), calculateDomainHealth()
- `src/visibility/dry-run.ts` — NEW: executeDryRun(), renderDryRun(), runDryRunCommand()
- `src/visibility/formatters.ts` — MODIFIED: added drawLineChart() ASCII chart renderer
- `src/visibility/stats.ts` — MODIFIED: added gatherTrendsData(), renderTrends(), MIN_TASKS_FOR_TRENDS, updated runStatsCommand() for --trend flag
- `src/visibility/index.ts` — MODIFIED: added knowledge command registration, dry-run exports, drawLineChart export, all new type exports
- `src/index.ts` — MODIFIED: added dry-run handler dispatch, removed old knowledge placeholder, imports runDryRunCommand
- `tests/visibility/knowledge.test.ts` — NEW: 9 tests for knowledge data aggregation, rendering, domain listing
- `tests/visibility/dry-run.test.ts` — NEW: 6 tests for dry-run execution, zero-side-effect verification, rendering
- `tests/visibility/trends.test.ts` — NEW: 10 tests for trends data aggregation, chart rendering, insufficient data handling

### Change Log
- 2026-03-05: Implemented Story 5.2 — Knowledge Inspection, Dry-Run & Trends. Created knowledge domain inspection (`co knowledge <domain>` with --all/--files/--patterns), dry-run pipeline preview (`co --dry-run` with zero side effects), and accuracy trends visualization (`co stats --trend` with ASCII chart). All 10 tasks completed, 636 tests pass.
- 2026-03-05: Code review passed — all ESLint errors fixed, all tests passing, build clean
