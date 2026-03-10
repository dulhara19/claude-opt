# Story 6.2: Detailed Correction Mode

Status: done
Epic: 6 - User Feedback & Manual Correction
Story: 6.2
Date: 2026-03-04
Complexity: Medium
Estimated Scope: `co correct` CLI command with interactive correction flow, tab-complete file paths, detailed feedback persistence, learner integration

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want a detailed way to tell the optimizer what went wrong and correct its behavior,
So that I can provide rich feedback for faster, more precise learning improvement.

## Acceptance Criteria (BDD)

### AC1: Correct Command — Last Task Display
**Given** a developer runs `co correct`
**When** the correction mode activates
**Then** it shows the most recent task's description and ID (e.g., `Last task: "add confidence decay" (t_20260304_001)`)
**And** it shows prediction accuracy summary (e.g., `Prediction: 4/5 correct (precision: 80%, recall: 67%)`)
**And** it shows the list of predicted files and actual files used for context

### AC2: Correct Command — Correction Options
**Given** the correction context is displayed
**When** the user is prompted "What was wrong?"
**Then** the following options are shown:
  - `[1] Missed file(s)`
  - `[2] Wrong file(s) predicted`
  - `[3] Wrong model (too weak/strong)`
  - `[4] Everything off`
  - `[5] Describe in your own words`
**And** the user can select one or multiple options

### AC3: Missed Files Correction
**Given** the user selects option 1 (Missed files)
**When** prompted "Which files were missed? (tab-complete available)"
**Then** tab-completion suggests file paths from the project map
**And** the user can enter one or more comma-separated file paths
**And** the entered files are validated against the project map (warn if file not found, but still accept)
**And** the correction is stored with `missedFiles` array in the feedback

### AC4: Wrong Files Correction
**Given** the user selects option 2 (Wrong files predicted)
**When** prompted "Which predicted files were wrong?"
**Then** tab-completion suggests from the list of files that were predicted for the task
**And** the user can enter one or more comma-separated file paths
**And** the correction is stored with `wrongFiles` array in the feedback

### AC5: Wrong Model Correction
**Given** the user selects option 3 (Wrong model)
**When** prompted for model correction
**Then** the user can indicate whether the model was too weak or too strong
**And** optionally suggest the correct model tier (haiku/sonnet/opus)
**And** the correction is stored in the feedback with model correction details

### AC6: Free-Text Description
**Given** the user selects option 4 (Everything off) or option 5 (Describe)
**When** prompted for a description
**Then** the user can type a free-text description of what went wrong
**And** the text is stored in the `details` field of the feedback

### AC7: Feedback Persistence
**Given** the user has provided detailed correction feedback
**When** the feedback is processed
**Then** it is stored in the task history entry's `feedback` field as:
```json
{
  "source": "cli-correct",
  "rating": "bad",
  "details": "user description text",
  "missedFiles": ["src/config.ts", "src/constants.ts"],
  "wrongFiles": ["src/old-file.ts"],
  "modelCorrection": { "direction": "too-weak", "suggested": "sonnet" }
}
```
**And** specific file corrections are applied to prediction weights immediately via the learner
**And** model corrections inform future routing decisions
**And** all corrections are logged as manual interventions in the task history

### AC8: Weight Application
**Given** detailed correction feedback has been recorded
**When** the Knowledge Learner processes the correction
**Then** missed files receive a weight boost for the task's domain and type in patterns.json
**And** wrong files receive a weight decay for the task's domain and type in patterns.json
**And** model corrections update the routing history to influence future model selection
**And** convention additions (if any) are stored in patterns.json `conventions` array

### AC9: Specific Task Correction
**Given** a developer runs `co correct --task t_20260304_001`
**When** the command processes the `--task` flag
**Then** it loads and displays the specified task instead of the most recent one
**And** all correction flows work identically to correcting the last task

### AC10: No Recent Task
**Given** the user runs `co correct` with no recent task in history
**When** the command checks for context
**Then** a helpful message is shown: "No recent task to correct. Run a task first."
**And** the command exits gracefully with exit code 0

### AC11: Already-Corrected Task
**Given** the user runs `co correct` for a task that already has feedback
**When** the command detects existing feedback
**Then** it shows the existing feedback and asks: "This task already has feedback. Replace? [y/N]"
**And** on "y", proceeds with the correction flow (overwrites previous feedback)
**And** on "N" or Enter, exits without changes

## Tasks / Subtasks

- [x] Task 1: Define detailed correction types in `src/visibility/types.ts` (AC: #7)
  - [x] Define `DetailedFeedback` type:
    ```typescript
    interface DetailedFeedback {
      source: "cli-correct";
      rating: "bad";
      details?: string;
      missedFiles?: string[];
      wrongFiles?: string[];
      modelCorrection?: ModelCorrection;
    }
    ```
  - [x] Define `ModelCorrection` type: `{ direction: "too-weak" | "too-strong"; suggested?: "haiku" | "sonnet" | "opus" }`
  - [x] Define `CorrectionContext` type: `{ taskId: string; description: string; predictedFiles: string[]; actualFiles: string[]; precision: number; recall: number; modelUsed: string; existingFeedback: FeedbackResult | null }`
  - [x] Update `FeedbackResult` union type from Story 6.1 to include `DetailedFeedback`
  - [x] Export all types from `src/visibility/index.ts`
- [x] Task 2: Implement task context loading in `src/visibility/feedback.ts` (AC: #1, #9, #10)
  - [x] Create `loadCorrectionContext(taskId?: string): Result<CorrectionContext>` function
  - [x] If no `taskId` provided, read the most recent task from task history via store
  - [x] If `taskId` provided, find the specific task entry in task history
  - [x] Extract prediction summary: predicted files, actual files, precision, recall, model used
  - [x] If no tasks in history, return `err("No recent task to correct. Run a task first.")`
  - [x] If specified task not found, return `err("Task not found: <taskId>")`
  - [x] Include existing feedback in context for AC11 check
  - [x] Write tests: verify context loading for latest task, specific task, empty history, not-found task
- [x] Task 3: Implement correction context display (AC: #1)
  - [x] Create `displayCorrectionContext(ctx: CorrectionContext): void` function
  - [x] Use `formatters.ts` to render a box with:
    - Task description and ID
    - Prediction accuracy: `Prediction: N/M correct (precision: X%, recall: Y%)`
    - Predicted files list (with checkmarks for correct, crosses for wrong)
    - Actual files list (with indicators for missed files)
    - Model used
  - [x] Write tests: verify correct formatting output for various contexts
- [x] Task 4: Implement correction option menu (AC: #2)
  - [x] Create `showCorrectionMenu(): Promise<number[]>` function
  - [x] Display options 1-5 with clear labels
  - [x] Support single selection via number input
  - [x] Support multi-selection: user can enter comma-separated numbers (e.g., "1,2" for both missed and wrong files)
  - [x] Validate input: only accept numbers 1-5
  - [x] Return array of selected option numbers
  - [x] Write tests: mock stdin for single and multi-selection scenarios
- [x] Task 5: Implement tab-complete file path input (AC: #3, #4)
  - [x] Create `promptFilePaths(prompt: string, suggestions: string[]): Promise<string[]>` function
  - [x] Use Node.js `readline` with `completer` function for tab-completion
  - [x] The `completer` function matches partial input against the `suggestions` array
  - [x] For "Missed files" (option 1): suggestions come from all project map files
  - [x] For "Wrong files" (option 2): suggestions come from the task's predicted files list
  - [x] Accept comma-separated file paths as input
  - [x] Normalize all entered paths using `utils/paths.ts` `toInternal()`
  - [x] Validate entered files against project map: warn (but accept) if file not found
  - [x] Write tests: verify tab-completion matching, comma-separated parsing, path normalization
- [x] Task 6: Implement model correction input (AC: #5)
  - [x] Create `promptModelCorrection(currentModel: string): Promise<ModelCorrection>` function
  - [x] Show current model and prompt: "Was the model too weak or too strong? [w]eak / [s]trong"
  - [x] On "w": set `direction: "too-weak"`, prompt "Suggested model? [haiku/sonnet/opus] (Enter to skip)"
  - [x] On "s": set `direction: "too-strong"`, prompt for suggested model
  - [x] Return `ModelCorrection` object
  - [x] Write tests: verify weak/strong selection and optional model suggestion
- [x] Task 7: Implement free-text description input (AC: #6)
  - [x] Create `promptDescription(): Promise<string>` function
  - [x] Use `readline` for multi-line or single-line text input
  - [x] Prompt: "Describe what went wrong:"
  - [x] Return trimmed text
  - [x] Write tests: verify text input and trimming
- [x] Task 8: Implement main `co correct` flow orchestrator (AC: #1-#11)
  - [x] Create `runCorrectCommand(taskId?: string): Promise<void>` function
  - [x] Step 1: Load correction context (`loadCorrectionContext(taskId)`)
  - [x] Step 2: Check for existing feedback (AC11) — prompt to replace or exit
  - [x] Step 3: Display context (`displayCorrectionContext()`)
  - [x] Step 4: Show correction menu (`showCorrectionMenu()`)
  - [x] Step 5: Based on selected options, collect details:
    - Option 1 → `promptFilePaths("Which files were missed?", projectMapFiles)`
    - Option 2 → `promptFilePaths("Which predicted files were wrong?", predictedFiles)`
    - Option 3 → `promptModelCorrection(currentModel)`
    - Option 4 → `promptDescription()` (with details auto-set to "Everything was off: <user text>")
    - Option 5 → `promptDescription()`
  - [x] Step 6: Assemble `DetailedFeedback` object combining all selected corrections
  - [x] Step 7: Persist feedback via `recordFeedback(taskId, feedback)` (reuse from Story 6.1)
  - [x] Step 8: Apply immediate weight corrections via learner integration
  - [x] Step 9: Show confirmation: "Feedback recorded. [details of what was applied]"
  - [x] Wrap entire flow with error handling — on any error, show friendly message and exit gracefully
- [x] Task 9: Implement immediate weight correction application (AC: #8)
  - [x] Create `applyDetailedCorrection(feedback: DetailedFeedback, context: CorrectionContext): Result<void>` function
  - [x] For `missedFiles`: call learner/store to boost each file's weight in patterns.json typeAffinities for the task's type
  - [x] For `wrongFiles`: call learner/store to decay each file's weight in patterns.json typeAffinities for the task's type
  - [x] For `modelCorrection`: update the task's routing entry in task history to inform future routing
  - [x] Log all corrections via logger for audit trail
  - [x] Write tests: verify weight boost for missed files, weight decay for wrong files, model routing update
- [x] Task 10: Register `co correct` command in CLI entry point (AC: #1, #9)
  - [x] In `src/index.ts`, register the `correct` command with Commander:
    ```typescript
    .command('correct')
    .description('Provide detailed feedback on the last task prediction')
    .option('--task <id>', 'Correct a specific task (default: last)')
    .action(async (options) => { await runCorrectCommand(options.task); })
    ```
  - [x] Handle errors: wrap action in try/catch, display user-friendly error message
- [x] Task 11: Export correct command functions from barrel (AC: all)
  - [x] Export `runCorrectCommand`, `loadCorrectionContext`, `applyDetailedCorrection` from `src/visibility/index.ts`
  - [x] Export `DetailedFeedback`, `ModelCorrection`, `CorrectionContext` types from `src/visibility/index.ts`
- [x] Task 12: Write integration tests (AC: #1-#11)
  - [x] Create `tests/visibility/correct.test.ts`
  - [x] Test: full correction flow — missed files selection with tab-complete mock
  - [x] Test: full correction flow — wrong files selection
  - [x] Test: full correction flow — model correction (too weak, too strong, with suggested model)
  - [x] Test: full correction flow — free-text description
  - [x] Test: multi-option selection (e.g., missed files + wrong model)
  - [x] Test: specific task correction via `--task` flag
  - [x] Test: no recent task — error message displayed
  - [x] Test: already-corrected task — replace prompt flow
  - [x] Test: feedback persisted correctly in task history
  - [x] Test: immediate weight corrections applied to patterns.json
  - [x] Test: non-interactive mode (stdin not TTY) — graceful exit with message

## Dev Notes

### Architecture Decisions to Follow

| Decision | Requirement | Source |
|---|---|---|
| AD-03 | Store Module with Typed Accessors — all JSON I/O through store/ | [Source: architecture.md#Core Architectural Decisions] |
| AD-04 | `withFailOpen(stageFn, fallback)` wrapper — correct command errors must not crash CLI | [Source: architecture.md#Core Architectural Decisions] |
| AD-05 | POSIX internal paths — all file paths normalized before storage | [Source: architecture.md#Core Architectural Decisions] |
| AD-07 | Chalk + String Templates — interactive prompts use readline + chalk, no TUI framework | [Source: architecture.md#Core Architectural Decisions] |

### Detailed Feedback JSON Schema

The `co correct` command produces feedback stored in the task-history.json `feedback` field. The format is distinct from inline feedback (Story 6.1) via the `source: "cli-correct"` field:

```typescript
// Full detailed feedback (all fields populated)
{
  source: "cli-correct",
  rating: "bad",
  details: "missed src/styles.css, shouldn't have predicted old-file.ts",
  missedFiles: ["src/styles.css", "src/config.ts"],
  wrongFiles: ["src/old-file.ts"],
  modelCorrection: {
    direction: "too-weak",
    suggested: "sonnet"
  }
}

// Minimal detailed feedback (only description)
{
  source: "cli-correct",
  rating: "bad",
  details: "Everything was off for this task"
}

// With only file corrections
{
  source: "cli-correct",
  rating: "bad",
  missedFiles: ["src/config.ts", "src/constants.ts"]
}
```

The `rating` field is always `"bad"` for `co correct` — if the task was good, there is nothing to correct. The `source: "cli-correct"` distinguishes this from inline feedback (`source: "inline"`).

### Tab-Completion Implementation

Tab-completion for file paths uses Node.js `readline.createInterface` with a custom `completer` function:

```typescript
import { createInterface } from 'node:readline';

function createFileCompleter(files: string[]) {
  return (line: string): [string[], string] => {
    // Get the last comma-separated segment for completion
    const parts = line.split(',');
    const current = parts[parts.length - 1].trim();
    const hits = files.filter((f) => f.startsWith(current));
    return [hits.length ? hits : files, current];
  };
}
```

For "Missed files" (option 1), the suggestion list is all files from the project map. For "Wrong files" (option 2), the suggestion list is narrowed to only the predicted files for that task.

### Weight Correction Strategy

When `applyDetailedCorrection()` processes feedback:

| Correction Type | Action on patterns.json | Magnitude |
|---|---|---|
| Missed file | Boost file's weight in `typeAffinities[taskType]` | +0.2 (capped at 1.0) |
| Wrong file | Decay file's weight in `typeAffinities[taskType]` | -0.2 (floored at 0.0) |
| Model correction | Update task-history routing entry `success: false` + note | Informs future routing |

The boost/decay magnitude (+/- 0.2) is a starting value. The Knowledge Learner (Epic 3) may apply more sophisticated adjustments. This story applies the immediate correction; the learner's weight-correction.ts handles the ongoing learning loop.

### Naming Conventions (MUST FOLLOW)

| Element | Convention | Example |
|---|---|---|
| Source files | kebab-case.ts | `feedback.ts`, `formatters.ts` |
| Test files | kebab-case.test.ts | `tests/visibility/correct.test.ts` |
| Functions | camelCase | `runCorrectCommand()`, `loadCorrectionContext()`, `applyDetailedCorrection()` |
| Variables | camelCase | `correctionContext`, `missedFiles`, `modelCorrection` |
| Types/Interfaces | PascalCase | `DetailedFeedback`, `ModelCorrection`, `CorrectionContext` |
| Constants | UPPER_SNAKE_CASE | `WEIGHT_BOOST_AMOUNT`, `WEIGHT_DECAY_AMOUNT` |
| Booleans | is/has/should prefix | `hasExistingFeedback`, `isValidTask` |
| JSON fields | camelCase | `missedFiles`, `wrongFiles`, `modelCorrection`, `source` |

[Source: architecture.md#Naming Patterns]

### Code Patterns (MUST FOLLOW)

**Result<T> Pattern:**
```typescript
type Result<T> = { ok: true; value: T } | { ok: false; error: string };

function ok<T>(value: T): Result<T> { return { ok: true, value }; }
function err<T>(error: string): Result<T> { return { ok: false, error }; }
```

**withFailOpen Pattern:**
```typescript
function withFailOpen<T>(fn: () => T, fallback: T, module: string): T {
  try {
    return fn();
  } catch (error) {
    logger.error(module, 'Stage failed, falling back', error);
    return fallback;
  }
}
```

**Confidence Scores:** Always 0.0-1.0 float in data, convert to percentage only for display. Display: `80%` (rounded). Storage: `0.80`.

**Null vs Undefined:** JSON uses `null`, TypeScript uses `undefined` for optional params. The `details`, `missedFiles`, `wrongFiles`, `modelCorrection` fields on `DetailedFeedback` are optional (undefined when not provided by the user, omitted from JSON serialization).

[Source: architecture.md#Format Patterns]

### Import Rules (MUST FOLLOW)

- `src/visibility/feedback.ts` imports from `../store/index.js` for store read/write operations
- `src/visibility/feedback.ts` imports from `../utils/index.js` for paths, logger, errors
- `src/visibility/feedback.ts` imports from `./types.js` for feedback and correction types
- `src/visibility/feedback.ts` imports from `./formatters.js` for box-drawing and display helpers
- For weight correction, import from `../learner/index.js` if the learner exposes a correction API, or apply directly through store accessors
- Never import from another module's internal files — only through barrel `index.ts`

[Source: architecture.md#Import Rules]

### Project Structure (Files Created/Modified by This Story)

```
claude-opt/
├── src/
│   ├── index.ts                    # MODIFIED — register `correct` command with --task option
│   └── visibility/
│       ├── index.ts                # MODIFIED — export correction functions and types
│       ├── types.ts                # MODIFIED — add DetailedFeedback, ModelCorrection, CorrectionContext
│       ├── feedback.ts             # MODIFIED — add runCorrectCommand(), loadCorrectionContext(),
│       │                           #            applyDetailedCorrection(), tab-complete helpers
│       └── formatters.ts           # MODIFIED — add correction context display formatting
├── tests/
│   └── visibility/
│       └── correct.test.ts         # CREATED — full test suite for co correct command
```

### Dependencies on Other Stories

| Dependency | Story | What's Needed |
|---|---|---|
| Story 6.1 | 6.1 | `recordFeedback()` function for persisting feedback to task history, `FeedbackResult` union type |
| Store module with typed accessors | Story 1.2 | `readTaskHistory()`, `writeTaskHistory()`, `readPatterns()`, `writePatterns()`, `readProjectMap()` |
| Pipeline orchestrator | Story 2.1 | PipelineContext type for extracting task summaries |
| Knowledge Learner | Story 3.x | Weight correction API or store write accessors for patterns.json typeAffinities |
| Visibility formatters | Story 5.x | Box-drawing utilities for context display |
| Project Scanner | Story 1.4/1.5 | Project map data for tab-complete file suggestions |

### Relationship to Story 6.1

Story 6.2 builds directly on Story 6.1:

- **Shared types:** `FeedbackResult` union type is extended to include `DetailedFeedback`
- **Shared persistence:** `recordFeedback()` from Story 6.1 is reused to persist detailed feedback
- **Same file:** Both stories implement in `src/visibility/feedback.ts` — Story 6.2 adds correction functions to the same file
- **Distinct source field:** Inline uses `source: "inline"`, correct uses `source: "cli-correct"` — the learner can distinguish feedback origin
- **Non-overlapping:** Story 6.1 handles quick inline feedback + forget; Story 6.2 handles the interactive detailed correction flow

### Non-Interactive Mode Handling

If `co correct` is run in a non-interactive context (stdin is not a TTY), the command should:

1. Check `process.stdin.isTTY` — if `false`, show message: "Correction mode requires an interactive terminal."
2. Exit gracefully with code 0.
3. This prevents errors when the command is accidentally piped or scripted.

### What This Story Does NOT Create

- Inline feedback prompt — that is Story 6.1
- `co forget` command — that is Story 6.1
- Learner's full weight correction algorithm (boost/decay curves, confidence-based scaling) — that is Epic 3
- Feedback frequency reduction or analytics — those are Growth features
- Convention editing via `co correct` (adding new conventions) — deferred to Growth; `co correct` captures free-text that the learner can parse later

### References

- [Source: architecture.md#Complete Project Directory Structure] — visibility module location and file layout
- [Source: architecture.md#Core Architectural Decisions] — AD-03, AD-04, AD-05, AD-07
- [Source: architecture.md#Implementation Patterns & Consistency Rules] — naming, structure, format patterns
- [Source: architecture.md#Architectural Boundaries] — visibility boundary
- [Source: prd.md#VL-07] — `co correct` detailed feedback mode requirement
- [Source: prd.md#Inline Feedback Flow] — Feedback JSON format specification
- [Source: prd.md#CLI Mockups — co correct] — Correct command output mockup with tab-complete example
- [Source: prd.md#task-history.json] — Feedback field schema (inline vs detailed)
- [Source: prd.md#patterns.json] — Patterns schema (typeAffinities affected by corrections)
- [Source: prd.md#D-14] — Decision: both inline pop + detailed CLI feedback approach
- [Source: prd.md#PR-02] — Risk mitigation: feedback fatigue (passive learning primary)
- [Source: epics.md#Story 6.2] — Original story definition and acceptance criteria

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
None — clean implementation with no blockers.

### Completion Notes List
- Implemented all 12 tasks for the `co correct` detailed correction mode
- Added `DetailedFeedback`, `ModelCorrection`, `CorrectionContext` types to visibility/types.ts
- Extended `FeedbackResult` union to include `DetailedFeedback`
- Extended `TaskFeedback` store type with `missedFiles`, `wrongFiles`, `modelCorrection` optional fields
- Implemented `loadCorrectionContext()` — loads most recent or specific task context from history
- Implemented `displayCorrectionContext()` — box-formatted display with predicted/actual file comparison
- Implemented `showCorrectionMenu()` — 5-option menu with multi-select support
- Implemented `promptFilePaths()` — readline with tab-completion and project map validation
- Implemented `promptModelCorrection()` — weak/strong direction with optional model suggestion
- Implemented `promptDescription()` — free-text input
- Implemented `applyDetailedCorrection()` — immediate weight boost/decay (+/-0.2) in patterns.json typeAffinities, model routing update
- Implemented `runCorrectCommand()` — full orchestrator: context load → existing feedback check → display → menu → collect → persist → apply weights → confirm
- Registered `correct` command with `--task <id>` option in CLI entry point, replacing stub
- Non-interactive mode check (`process.stdin.isTTY`) with graceful exit
- All functions exported from visibility barrel
- 24 tests in `tests/visibility/correct.test.ts` covering types, context loading, weight corrections, persistence, edge cases
- Full regression suite: 684 tests pass (45 files), zero regressions

### File List
- `src/visibility/types.ts` — MODIFIED: Added DetailedFeedback, ModelCorrection, CorrectionContext types; updated FeedbackResult union
- `src/visibility/feedback.ts` — MODIFIED: Added loadCorrectionContext, displayCorrectionContext, showCorrectionMenu, promptFilePaths, promptModelCorrection, promptDescription, applyDetailedCorrection, runCorrectCommand functions
- `src/visibility/index.ts` — MODIFIED: Exported new correction functions and types from barrel
- `src/index.ts` — MODIFIED: Replaced `correct` command stub with full implementation including --task option
- `src/types/store.ts` — MODIFIED: Extended TaskFeedback with missedFiles, wrongFiles, modelCorrection fields
- `tests/visibility/correct.test.ts` — CREATED: 24 tests for detailed correction mode

### Change Log
- 2026-03-05: Implemented Story 6.2 — Detailed Correction Mode (`co correct` command with interactive correction flow, tab-complete file paths, immediate weight corrections, full test suite)
- 2026-03-05: Code review passed — all ESLint errors fixed, all tests passing, build clean
