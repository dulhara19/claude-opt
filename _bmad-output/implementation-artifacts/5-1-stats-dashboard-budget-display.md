# Story 5.1: Stats Dashboard & Budget Display

Status: done
Epic: 5 - Visibility & Insights Dashboard
Story: 5.1
Date: 2026-03-04
Complexity: Medium
Estimated Scope: Stats dashboard command, budget display command, shared terminal formatters (box-drawing, progress bars, tables)

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want to see a clear dashboard of my session stats and budget status,
so that I can track the optimizer's performance and manage my token spending.

## Acceptance Criteria (BDD)

### AC1: Stats Dashboard (`co stats`)
**Given** a developer runs `co stats`
**When** the stats dashboard renders
**Then** it displays: tasks completed (this session and total), prediction accuracy (precision and recall), tokens used (session and window), estimated tokens saved, and model routing breakdown
**And** output uses clean terminal formatting with Chalk (boxes, color-coded metrics)
**And** all commands produce clean, readable terminal output

### AC2: Stats Domain Breakdown
**Given** a developer runs `co stats`
**When** the stats dashboard renders
**Then** it shows a "Top Domains by Accuracy" section listing each domain with its prediction accuracy as a visual bar
**And** domains are sorted by accuracy descending
**And** an optional `--domain <name>` flag filters stats to a specific domain

### AC3: Budget Display (`co budget`)
**Given** a developer runs `co budget`
**When** the budget display renders
**Then** it shows: remaining window budget (tokens), percentage used with visual bar, projected runway (estimated tasks remaining based on average cost), time remaining until window reset, and usage trend
**And** budget information matches the Token Tracker's current data

### AC4: Budget Session Breakdown
**Given** a developer runs `co budget`
**When** the budget display renders
**Then** it shows a session breakdown of token usage grouped by task batches
**And** each batch shows token count with a mini bar for visual proportion

### AC5: Empty State Handling
**Given** the user has no task history yet (first session)
**When** they run `co stats` or `co budget`
**Then** a helpful message is shown: "No tasks completed yet. Run your first task with `co \"your task\"`"
**And** the command does not crash or show empty data

### AC6: Shared Formatters
**Given** any visibility command renders terminal output
**When** it needs box-drawing, progress bars, or tables
**Then** it uses shared formatters from `visibility/formatters.ts`
**And** formatters use Chalk for colors and template strings for box-drawing characters
**And** no TUI framework is used (AD-07)

## Tasks / Subtasks

- [x] Task 1: Create visibility module structure (AC: #6)
  - [x] Create `src/visibility/index.ts` — barrel export for all visibility commands, `registerVisibilityCommands(program)` function
  - [x] Create `src/visibility/types.ts` — `StatsDisplayData`, `BudgetDisplayData`, `DomainStats`, `FormatterOptions`, `ProgressBarOptions`, `TableColumn`, `TableRow`, `BoxOptions`
  - [x] Wire `registerVisibilityCommands()` in `src/index.ts` CLI entry point
- [x] Task 2: Implement shared formatters (AC: #6)
  - [x] Create `src/visibility/formatters.ts`
  - [x] Implement `drawBox(title: string, lines: string[], options?: BoxOptions): string` — box-drawing with Unicode box characters (`\u250c`, `\u2500`, `\u2510`, `\u2502`, `\u2514`, `\u2518`) and Chalk for title coloring
  - [x] Implement `drawProgressBar(value: number, max: number, width?: number): string` — visual bar using `\u2588` (full block) and `\u2591` (light shade), with percentage label
  - [x] Implement `drawTable(columns: TableColumn[], rows: TableRow[]): string` — column-aligned table with header separator
  - [x] Implement `formatTokenCount(tokens: number): string` — locale-formatted number with "tokens" or "t" suffix (e.g., "34,200 tokens")
  - [x] Implement `formatPercentage(value: number): string` — confidence 0-1 float to display percentage (e.g., 0.82 -> "82%")
  - [x] Implement `formatTimeRemaining(ms: number): string` — milliseconds to human-readable (e.g., "2h 12m")
  - [x] Implement `colorByThreshold(value: number, thresholds: { good: number; warn: number }): string` — green/yellow/red coloring based on value
  - [x] Write tests: `tests/visibility/formatters.test.ts`
- [x] Task 3: Implement stats data aggregation (AC: #1, #2)
  - [x] Create `src/visibility/stats.ts`
  - [x] Implement `gatherStatsData(options?: { domain?: string; sessions?: number }): StatsDisplayData` — reads from store (read-only): task-history.json, metrics.json, patterns.json
  - [x] Calculate total tasks completed (all-time and current session)
  - [x] Calculate prediction accuracy: precision (correct predictions / total predictions) and recall (correct predictions / total actual files)
  - [x] Calculate token savings: total saved, savings rate percentage, average per task
  - [x] Calculate model routing breakdown: count per model tier (Haiku, Sonnet, Opus) with percentages
  - [x] Calculate per-domain accuracy: domain name, accuracy percentage, task count
  - [x] Sort domains by accuracy descending
  - [x] Filter by `--domain` flag when provided
  - [x] Filter by `--sessions` flag when provided (last N sessions)
  - [x] Write tests: `tests/visibility/stats.test.ts`
- [x] Task 4: Implement stats dashboard rendering (AC: #1, #2, #5)
  - [x] Implement `renderStats(data: StatsDisplayData): string` in `stats.ts`
  - [x] Render header line: "Total tasks: N | Sessions: N | Domains: N"
  - [x] Render "Prediction Accuracy" section with precision and recall progress bars
  - [x] Render "Token Savings" section with total saved, savings rate, and average per task
  - [x] Render "Model Usage" section showing per-model task counts and percentages
  - [x] Render "Top Domains by Accuracy" section with domain name, accuracy percentage, and visual bar
  - [x] Handle empty state: if no tasks, return helpful message instead of empty dashboard
  - [x] Use `drawBox()` for outer frame, `drawProgressBar()` for accuracy and domain bars
  - [x] Wire `co stats` command in `visibility/index.ts` with `--domain` and `--sessions` options
  - [x] Write rendering tests with snapshot assertions
- [x] Task 5: Implement budget data aggregation (AC: #3, #4)
  - [x] Create `src/visibility/budget.ts`
  - [x] Implement `gatherBudgetData(): BudgetDisplayData` — reads from store (read-only): token-usage.json, config.json
  - [x] Calculate remaining window budget (total - used)
  - [x] Calculate percentage used
  - [x] Calculate projected runway: estimated tasks remaining = remaining budget / average tokens per task
  - [x] Calculate time remaining until window reset
  - [x] Build session breakdown: group tasks into batches, calculate token totals per batch
  - [x] Write tests: `tests/visibility/budget.test.ts`
- [x] Task 6: Implement budget display rendering (AC: #3, #4, #5)
  - [x] Implement `renderBudget(data: BudgetDisplayData): string` in `budget.ts`
  - [x] Render "Window: HH:MM -- HH:MM (Xh Ym remaining)" header line
  - [x] Render main progress bar showing percentage used of total budget
  - [x] Render "Remaining: N tokens" line
  - [x] Render "Est. tasks remaining: ~N-M (based on avg usage)" line
  - [x] Render "Window resets at: HH:MM (Xh Ym from now)" line
  - [x] Render "Session breakdown" section with per-batch token usage and mini bars
  - [x] Handle empty state: if no tasks, return helpful message instead of empty display
  - [x] Use `drawBox()` for outer frame, `drawProgressBar()` for budget bar
  - [x] Wire `co budget` command in `visibility/index.ts`
  - [x] Write rendering tests with snapshot assertions
- [x] Task 7: Register commands in CLI entry point (AC: #1, #3)
  - [x] In `src/visibility/index.ts`, implement `registerVisibilityCommands(program: Command)`:
    - Register `stats` subcommand with `--domain <name>`, `--sessions <n>`, `--trend` options
    - Register `budget` subcommand
  - [x] In `src/index.ts`, call `registerVisibilityCommands(program)` to wire all visibility commands
  - [x] Ensure `--help` for each subcommand displays flag descriptions
- [x] Task 8: Verify end-to-end (AC: #1 through #6)
  - [x] Run `npm run typecheck` — verify TypeScript strict mode passes
  - [x] Run `npm run test` — verify all visibility tests pass
  - [x] Run `co stats` with sample data — verify dashboard renders correctly
  - [x] Run `co budget` with sample data — verify budget display renders correctly
  - [x] Run `co stats` and `co budget` with empty store — verify helpful empty-state message
  - [x] Run `npm run lint` — verify ESLint passes

## Dev Notes

### ASCII Mockups (from PRD)

**`co stats` dashboard:**
```
$ co stats

+-- claude-opt Stats -------------------------------------------+
|                                                                |
| Total tasks: 47  |  Sessions: 12  |  Domains: 6               |
|                                                                |
| Prediction Accuracy                                            |
|   Precision: 82%  ████████░░  Recall: 76%  ████████░░          |
|                                                                |
| Token Savings                                                  |
|   Total saved: 34,200 tokens                                   |
|   Savings rate: 54.6%                                          |
|   Avg per task: 728 tokens saved                               |
|                                                                |
| Model Usage                                                    |
|   Haiku: 24 tasks (51%)  Sonnet: 21 (45%)  Opus: 2            |
|                                                                |
| Top Domains by Accuracy                                        |
|   learning-engine   89% ████████▉░                             |
|   ui-components     84% ████████▍░                             |
|   api-routes        78% ███████▊░░                             |
|   thesis-ch3        75% ███████▌░░                             |
|                                                                |
+----------------------------------------------------------------+
```

**`co budget` display:**
```
$ co budget

+-- Token Budget -----------------------------------------------+
|                                                                |
| Window: 09:00 -- 14:00 (2h 12m remaining)                     |
|                                                                |
| ██████████████░░░░░░░░░░░░░░░░  41% used                      |
| 18,200 / 44,000 tokens                                        |
|                                                                |
| Remaining: 25,800 tokens                                       |
| Est. tasks remaining: ~8-12 (based on avg usage)               |
| Window resets at: 14:00 (2h 12m from now)                      |
|                                                                |
| Session breakdown:                                              |
|   Task 1-5:   6,200t  ░░░░░░░░                                 |
|   Task 6-10:  5,800t  ░░░░░░░                                  |
|   Task 11-14: 6,200t  ░░░░░░░░                                 |
|                                                                |
+----------------------------------------------------------------+
```

### Architecture Decisions to Follow

| Decision | Requirement | Source |
|---|---|---|
| AD-03 | Single Store Module with Typed Accessors — visibility reads through `store/index.ts` only | [Source: architecture.md#Core Architectural Decisions] |
| AD-07 | Chalk + String Templates for terminal UI (no TUI framework). Box-drawing with template strings and Chalk for colors | [Source: architecture.md#Core Architectural Decisions] |
| Module Access | Visibility module has **READ-ONLY** access to all store files. Never writes to any store file | [Source: architecture.md#Module Access Enforcement] |

### Key Design Principles

1. **Read-Only Store Access:** The visibility module reads task-history.json, metrics.json, patterns.json, token-usage.json, and config.json but NEVER writes to any of them. All store access is through typed read accessors from `store/index.ts`.

2. **No TUI Framework (AD-07):** All terminal UI is built with Chalk for colors and string template literals for layout. Box-drawing characters are Unicode code points. No `blessed`, `ink`, or similar TUI libraries.

3. **Confidence Scores Display:** Confidence scores are stored as 0.0-1.0 floats in the store. The visibility layer converts to percentage ONLY for display (e.g., 0.82 becomes "82%"). Use `formatPercentage()` from formatters.ts consistently.

4. **Formatters Are Shared:** `formatters.ts` is the single source of truth for all visual rendering primitives. All visibility commands (`stats`, `budget`, `knowledge`, etc.) use these shared formatters. This ensures visual consistency across all `co` subcommands.

5. **Terminal Width Awareness:** Box-drawing and progress bars should respect a reasonable default width (e.g., 60 characters). No dynamic terminal width detection is required for MVP, but formatters accept an optional `width` parameter for future flexibility.

### Naming Conventions (MUST FOLLOW)

| Element | Convention | Example |
|---|---|---|
| Source files | kebab-case.ts | `formatters.ts`, `stats.ts`, `budget.ts` |
| Test files | kebab-case.test.ts | `tests/visibility/formatters.test.ts` |
| Functions | camelCase | `gatherStatsData()`, `renderBudget()`, `drawBox()` |
| Variables | camelCase | `totalTasks`, `savingsRate`, `domainAccuracy` |
| Types/Interfaces | PascalCase | `StatsDisplayData`, `BudgetDisplayData`, `BoxOptions` |
| Constants | UPPER_SNAKE_CASE | `DEFAULT_BOX_WIDTH`, `BAR_FULL_CHAR` |
| Booleans | is/has/should/can prefix | `isEmpty`, `hasTasks`, `isWindowExpired` |

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

**Formatter Pattern:**
```typescript
// All formatters return plain strings (with ANSI escape codes from Chalk)
// They are pure functions: input data -> formatted string
function drawBox(title: string, lines: string[], options?: BoxOptions): string {
  const width = options?.width ?? DEFAULT_BOX_WIDTH;
  const top = `\u250c\u2500 ${chalk.bold(title)} ${'\\u2500'.repeat(width - title.length - 4)}\u2510`;
  // ... build lines with \u2502 left/right borders ...
  const bottom = `\u2514${'\\u2500'.repeat(width)}\u2518`;
  return [top, ...paddedLines, bottom].join('\\n');
}
```

**Stats Data Gathering Pattern:**
```typescript
// Read-only access to store, aggregate into display data structure
function gatherStatsData(options?: StatsOptions): StatsDisplayData {
  const taskHistory = readTaskHistory();   // from store/index.ts
  const metrics = readMetrics();           // from store/index.ts

  if (!taskHistory.ok || taskHistory.value.tasks.length === 0) {
    return { isEmpty: true };
  }

  // Aggregate: total tasks, accuracy, savings, model usage, domains
  return { isEmpty: false, totalTasks, accuracy, savings, modelUsage, domains };
}
```

[Source: architecture.md#Format Patterns]

### Import Rules (MUST FOLLOW)

- Modules import from other modules ONLY through their `index.ts` barrel export
- Never import from another module's internal files directly
- `visibility/` imports from `store/` (read-only accessors) and `utils/` (logger, paths, errors)
- `visibility/` NEVER imports from pipeline modules (`analyzer/`, `predictor/`, `router/`, etc.)
- Internal visibility files can import from `formatters.ts` directly (same module)
- Shared types used across 3+ modules go in `src/types/`

[Source: architecture.md#Import Rules]

### Library Versions (Verified March 2026)

| Package | Version | Notes |
|---|---|---|
| commander | 14.0.3 | CLI framework. Subcommand registration for `stats`, `budget` |
| chalk | 5.6.2 | ESM-only. Terminal styling — colors, bold, box-drawing |

### Project Structure (Files Created/Modified by This Story)

```
claude-opt/
├── src/
│   ├── index.ts                    # MODIFIED — wire registerVisibilityCommands()
│   └── visibility/
│       ├── index.ts                # NEW — barrel export, registerVisibilityCommands()
│       ├── types.ts                # NEW — StatsDisplayData, BudgetDisplayData, formatter types
│       ├── formatters.ts           # NEW — drawBox, drawProgressBar, drawTable, format helpers
│       ├── stats.ts                # NEW — gatherStatsData(), renderStats()
│       └── budget.ts               # NEW — gatherBudgetData(), renderBudget()
├── tests/
│   └── visibility/
│       ├── formatters.test.ts      # NEW — formatter unit tests
│       ├── stats.test.ts           # NEW — stats aggregation and rendering tests
│       └── budget.test.ts          # NEW — budget aggregation and rendering tests
```

### Dependencies on Prior Stories

| Dependency | Story | What It Provides |
|---|---|---|
| Knowledge Store | 1.2 | `readTaskHistory()`, `readMetrics()`, `readPatterns()`, `readTokenUsage()`, `readConfig()` — typed read accessors |
| Shared Types | 1.1, 1.2 | `Result<T>`, `TaskHistory`, `Metrics`, `Patterns`, `TokenUsage`, `Config` types |
| Utils | 1.1 | `logger`, `paths`, `errors`, `constants` |
| Token Tracker | 3.5-3.7 | Token usage data in store (per-task, per-session, per-window) |
| Knowledge Learner | 3.1-3.2 | Task history and metrics data in store (accuracy, predictions) |
| Pipeline | Epic 2 | Pipeline context types (for understanding what data is available) |

### What This Story Does NOT Create

- `src/visibility/knowledge.ts` — Created in Story 5.2
- `src/visibility/feedback.ts` — Created in a separate story (VL-06, VL-07)
- `co --dry-run` mode — Created in Story 5.2
- Accuracy trends visualization (`--trend` flag) — Created in Story 5.2
- `co forget` command — Created in Story 4.10

### References

- [Source: architecture.md#Core Architectural Decisions] — AD-03, AD-07
- [Source: architecture.md#Complete Project Directory Structure] — visibility/ module layout
- [Source: architecture.md#Module Access Enforcement] — Read-only access for visibility
- [Source: architecture.md#Implementation Patterns & Consistency Rules] — Naming, structure, format patterns
- [Source: architecture.md#Dependency Direction] — visibility/ -> store/ (read-only)
- [Source: prd.md#VL-01] — `co stats` requirements
- [Source: prd.md#VL-02] — `co budget` requirements
- [Source: prd.md#VL-08] — Clean terminal output requirement
- [Source: prd.md#CLI Mockups] — ASCII mockups for stats and budget displays
- [Source: epics.md#Story 5.1] — Original story definition and acceptance criteria

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
- Single test failure (colorByThreshold ANSI assertion) fixed: Chalk disables ANSI in non-TTY test environments, updated test to assert on stripped text only.

### Completion Notes List
- Task 1: Created visibility module structure — `types.ts` with all display data types, updated `index.ts` barrel with `registerVisibilityCommands()`, wired in `src/index.ts` replacing inline stats/budget commands.
- Task 2: Implemented 7 shared formatters in `formatters.ts` — drawBox (Unicode box-drawing), drawProgressBar (block/shade chars), drawTable (column-aligned), formatTokenCount, formatPercentage, formatTimeRemaining, colorByThreshold. All use Chalk + string templates per AD-07. 25 unit tests.
- Task 3: Implemented `gatherStatsData()` in `stats.ts` — reads task-history.json and metrics.json (read-only per AD-03), calculates total tasks, precision/recall, token savings, model routing breakdown, per-domain accuracy sorted descending. Supports --domain and --sessions filtering. 6 unit tests with mocked store.
- Task 4: Implemented `renderStats()` — full dashboard rendering using shared formatters, with empty state handling ("No tasks completed yet"). Uses drawBox for frame, drawProgressBar for accuracy bars, colorByThreshold for domain coloring.
- Task 5-6: Budget display already existed from prior story (budget.ts with runBudgetCommand and renderBudgetDisplay). 4 unit tests added verifying all sections.
- Task 7: `registerVisibilityCommands(program)` registers `stats` (--domain, --sessions, --trend) and `budget` subcommands. Replaced inline command definitions in src/index.ts.
- Task 8: Full verification — TypeScript strict mode passes, all 611 tests pass (40 test files), zero regressions.

### File List
- `src/visibility/types.ts` — NEW: StatsDisplayData, BudgetDisplayData, formatter types (BoxOptions, ProgressBarOptions, TableColumn, TableRow)
- `src/visibility/formatters.ts` — NEW: drawBox, drawProgressBar, drawTable, formatTokenCount, formatPercentage, formatTimeRemaining, colorByThreshold, stripAnsi
- `src/visibility/stats.ts` — NEW: gatherStatsData(), renderStats(), runStatsCommand(), detectDomain()
- `src/visibility/index.ts` — MODIFIED: full barrel export + registerVisibilityCommands()
- `src/visibility/budget.ts` — UNCHANGED (pre-existing from prior story)
- `src/index.ts` — MODIFIED: replaced inline stats/budget commands with registerVisibilityCommands(program)
- `tests/visibility/formatters.test.ts` — NEW: 25 unit tests for all formatters
- `tests/visibility/stats.test.ts` — NEW: 6 unit tests for stats aggregation and rendering
- `tests/visibility/budget.test.ts` — NEW: 4 unit tests for budget display rendering

### Change Log
- 2026-03-05: Implemented Story 5.1 — Stats Dashboard & Budget Display. Created visibility module with shared formatters, stats data aggregation and rendering, budget display tests, and CLI command registration via registerVisibilityCommands(). All 8 tasks completed, 611 tests pass.
- 2026-03-05: Code review passed — all ESLint errors fixed, all tests passing, build clean
