# Story 6.1: Inline Feedback & Forget Command

Status: done
Epic: 6 - User Feedback & Manual Correction
Story: 6.1
Date: 2026-03-04
Complexity: Medium
Estimated Scope: Inline post-task feedback UI, quick-reason expansion, forget command, feedback persistence to task history

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want to quickly signal whether a task went well and remove bad files from predictions,
So that the system learns faster from my corrections with minimal effort.

## Acceptance Criteria (BDD)

### AC1: Inline Feedback Prompt Display
**Given** a task has completed successfully
**When** the inline feedback prompt appears
**Then** it shows: `[G]ood [B]ad [S]kip` (with emoji variant `[👍 Good] [👎 Bad] [→ Skip]` on supported terminals)
**And** the prompt is non-blocking — user can skip with Enter or the Skip option
**And** a one-line task summary is shown above the prompt: task description, prediction accuracy, model used, tokens consumed

### AC2: Bad Feedback Expansion
**Given** the user selects Bad
**When** the feedback expands
**Then** quick options are shown: `[1] Missed files [2] Wrong files predicted [3] Wrong model [4] Describe...`
**And** selecting options 1-3 records the quick reason immediately
**And** selecting option 4 prompts for a free-text description (single line)
**And** the selected feedback type and any details are stored in the task history entry's `feedback` field

### AC3: Good and Skip Feedback
**Given** the user selects Good or Skip
**When** feedback is recorded
**Then** Good stores `{ source: "inline", rating: "good" }` in the task history entry's `feedback` field
**And** Skip stores `null` in the task history entry's `feedback` field (no feedback signal)
**And** feedback capture completes near-instantly with no perceptible delay to the user

### AC4: Feedback Consumed by Learner
**Given** inline feedback has been recorded for a task
**When** the Knowledge Learner processes the task outcome
**Then** Good feedback reinforces current prediction weights positively
**And** Bad feedback with `quickReason: "missed-files"` signals the learner to boost missed file weights
**And** Bad feedback with `quickReason: "wrong-files"` signals the learner to decay incorrectly predicted file weights
**And** Bad feedback with `quickReason: "wrong-model"` signals the learner to adjust model routing history
**And** Skip (null) applies no feedback signal — learner uses only predicted-vs-actual comparison

### AC5: Forget Command Execution
**Given** a developer runs `co forget src/old-middleware.ts`
**When** the forget command executes
**Then** the specified file is removed from `keywordToFiles` mappings in keyword-index.json
**And** the file's entry is removed from `fileToKeywords` in keyword-index.json
**And** any co-occurrence patterns in patterns.json containing the file have their confidence zeroed
**And** the file's weight is zeroed in `typeAffinities` entries in patterns.json
**And** confirmation is shown with details: keywords cleared count, co-occurrence patterns affected count, weight zeroed
**And** the file still exists in the project map (only prediction weight is affected)

### AC6: Forget Command Edge Cases
**Given** a developer runs `co forget <file>` with a file not in the knowledge store
**When** the command checks the store
**Then** a message is shown: "File not found in knowledge store: <file>"
**And** the command exits gracefully with no changes

**Given** a developer wants to undo a forget
**When** they run `co scan`
**Then** the file is re-indexed if it still exists in the project, restoring its keyword mappings and prediction eligibility

### AC7: Emoji Fallback
**Given** a terminal that does not support emoji rendering
**When** the inline feedback prompt appears
**Then** it falls back to `[G]ood [B]ad [S]kip` text-only format
**And** all functionality remains identical regardless of rendering mode

## Tasks / Subtasks

- [x] Task 1: Define feedback types in `src/visibility/types.ts` (AC: #2, #3)
  - [x] Define `InlineFeedback` type: `{ source: "inline"; rating: "good" | "bad"; quickReason?: QuickReason }`
  - [x] Define `QuickReason` type: `"missed-files" | "wrong-files" | "wrong-model"`
  - [x] Define `InlineFeedbackWithDescription` type extending `InlineFeedback` with `details: string`
  - [x] Define `FeedbackResult` union type: `InlineFeedback | InlineFeedbackWithDescription | null`
  - [x] Ensure types align with task-history.json `feedback` field schema from PRD
- [x] Task 2: Implement emoji detection utility (AC: #7)
  - [x] Add `supportsEmoji(): boolean` helper in `src/visibility/feedback.ts` or `src/utils/terminal.ts`
  - [x] Detection strategy: check `process.env.TERM_PROGRAM`, `process.env.WT_SESSION` (Windows Terminal), and platform heuristics
  - [x] Return `true` for modern terminals (iTerm2, Windows Terminal, most Linux terminals), `false` for basic terminals
  - [x] Write test: `tests/visibility/feedback.test.ts` — mock environment variables for both emoji and non-emoji terminals
- [x] Task 3: Implement inline feedback prompt in `src/visibility/feedback.ts` (AC: #1, #2, #3, #7)
  - [x] Create `showInlineFeedback(taskSummary: TaskSummary): Promise<FeedbackResult>` function
  - [x] Render task completion summary line using `formatters.ts` box-drawing: description, prediction accuracy (e.g., "4/5 files"), model name, token count
  - [x] Render feedback prompt: emoji or text fallback based on `supportsEmoji()`
  - [x] Implement keyboard input handling using Node.js `readline` or raw stdin for single-keypress capture
  - [x] On "G" / "g" / "1" → return `{ source: "inline", rating: "good" }`
  - [x] On "B" / "b" / "2" → expand to quick-reason submenu
  - [x] On "S" / "s" / Enter / "3" → return `null`
  - [x] Implement timeout: if no input after 10 seconds, auto-skip (return `null`)
  - [x] Write tests: mock stdin, verify each input path returns correct feedback object
- [x] Task 4: Implement bad feedback expansion submenu (AC: #2)
  - [x] Create `showQuickReasonMenu(): Promise<FeedbackResult>` internal function
  - [x] Render: `[1] Missed files [2] Wrong files predicted [3] Wrong model [4] Describe...`
  - [x] On "1" → return `{ source: "inline", rating: "bad", quickReason: "missed-files" }`
  - [x] On "2" → return `{ source: "inline", rating: "bad", quickReason: "wrong-files" }`
  - [x] On "3" → return `{ source: "inline", rating: "bad", quickReason: "wrong-model" }`
  - [x] On "4" → prompt for single-line text input, return `{ source: "inline", rating: "bad", details: userText }`
  - [x] On Enter / Escape → return `null` (cancel back to skip)
  - [x] Write tests: mock stdin for each option, verify correct feedback objects
- [x] Task 5: Persist feedback to task history (AC: #3)
  - [x] Create `recordFeedback(taskId: string, feedback: FeedbackResult): Result<void>` function
  - [x] Read current task history via `store/` module (`readTaskHistory()`)
  - [x] Find the task entry by `taskId` and set its `feedback` field
  - [x] Write back via `store/` module (`writeTaskHistory()`) using atomic write
  - [x] Handle edge case: task not found in history → log warning, return `err("Task not found")`
  - [x] Write tests: verify feedback is persisted correctly for good, bad (each quick reason), and skip (null)
- [x] Task 6: Integrate feedback into pipeline post-task flow (AC: #1, #4)
  - [x] In the pipeline orchestrator (post-adapter, pre-learner), call `showInlineFeedback()` with task summary
  - [x] Pass the returned `FeedbackResult` to `recordFeedback()` to persist in task history
  - [x] Pass feedback to the learner's `captureOutcome()` so it can apply feedback-aware weight adjustments
  - [x] Ensure feedback step is wrapped with `withFailOpen()` — if feedback capture fails, pipeline continues
  - [x] Verify feedback is non-blocking: if user skips, pipeline proceeds immediately
- [x] Task 7: Implement `co forget` command in `src/visibility/feedback.ts` (AC: #5, #6)
  - [x] Register `forget` subcommand in Commander.js with `<file>` required argument
  - [x] Implement `forgetFile(filePath: string): Result<ForgetResult>` function
  - [x] Normalize input file path using `utils/paths.ts` `toInternal()` for POSIX consistency
  - [x] Read keyword-index.json via store: remove file from all `keywordToFiles` arrays, remove file's `fileToKeywords` entry
  - [x] Count keywords cleared for confirmation message
  - [x] Read patterns.json via store: find co-occurrence entries containing the file, zero their `confidence` field
  - [x] Count co-occurrence patterns affected for confirmation message
  - [x] Read patterns.json `typeAffinities`: zero the file's weight in all task-type affinity maps
  - [x] Write back keyword-index.json and patterns.json via store (atomic writes)
  - [x] Do NOT modify project-map.json — file remains in project map
  - [x] Display confirmation using `formatters.ts`:
    ```
    Removed from predictions:
      - Cleared from keyword index (N keywords)
      - Removed from M co-occurrence pattern(s)
      - Zeroed weight in task history
      - Will not be predicted unless re-discovered

    Undo? Run: co scan (re-indexes if file still exists)
    ```
  - [x] Handle file not found: check if file exists in any store data; if not, show "File not found in knowledge store: <file>"
  - [x] Write tests: verify keyword index cleanup, co-occurrence zeroing, type affinity zeroing, confirmation output
- [x] Task 8: Implement `ForgetResult` type and expose from barrel export (AC: #5)
  - [x] Define `ForgetResult` in `src/visibility/types.ts`: `{ filePath: string; keywordsCleared: number; coOccurrencesAffected: number; affinitiesZeroed: number }`
  - [x] Export `forgetFile`, `showInlineFeedback`, `recordFeedback` from `src/visibility/index.ts`
  - [x] Export feedback types from `src/visibility/index.ts`
- [x] Task 9: Wire up `co forget` command in CLI entry point (AC: #5)
  - [x] In `src/index.ts`, register the `forget` command with Commander: `.command('forget <file>').description('Remove file from predictions')`
  - [x] Call `forgetFile()` with the file argument
  - [x] Handle Result: on success, display confirmation; on error, display error message and exit with code 1
- [x] Task 10: Define `TaskSummary` type for feedback display (AC: #1)
  - [x] Define in `src/visibility/types.ts`: `{ taskId: string; description: string; predictedCount: number; actualCount: number; modelUsed: string; tokensConsumed: number }`
  - [x] This type is constructed from `PipelineContext` after adapter execution
- [x] Task 11: Write integration tests (AC: #1-#6)
  - [x] Create `tests/visibility/feedback.test.ts`
  - [x] Test: full inline feedback flow — good, bad with each quick reason, bad with description, skip
  - [x] Test: feedback persistence to task history via mock store
  - [x] Test: forget command — full keyword/pattern/affinity cleanup
  - [x] Test: forget command — file not found edge case
  - [x] Test: emoji fallback rendering
  - [x] Test: timeout auto-skip behavior

## Dev Notes

### Architecture Decisions to Follow

| Decision | Requirement | Source |
|---|---|---|
| AD-03 | Store Module with Typed Accessors — all JSON I/O through store/ | [Source: architecture.md#Core Architectural Decisions] |
| AD-04 | `withFailOpen(stageFn, fallback)` wrapper — feedback must not crash pipeline | [Source: architecture.md#Core Architectural Decisions] |
| AD-05 | POSIX internal paths — forget command must normalize input paths | [Source: architecture.md#Core Architectural Decisions] |
| AD-07 | Chalk + String Templates — no TUI framework for prompt rendering | [Source: architecture.md#Core Architectural Decisions] |

### Critical Design: Feedback is Non-Blocking

The inline feedback prompt must NEVER block the pipeline or delay the user. Key design rules:

1. **Auto-skip timeout:** If no user input within 10 seconds, treat as Skip (null).
2. **Single keypress capture:** Use raw stdin mode for instant response — no Enter key required for G/B/S options.
3. **Pipeline wrapping:** The entire feedback step is wrapped with `withFailOpen()`. If stdin fails, readline crashes, or any error occurs, the pipeline continues with `null` feedback.
4. **Non-interactive mode:** If stdin is not a TTY (e.g., piped input, CI), skip feedback entirely and return `null`.

### Feedback JSON Schema

The `feedback` field on a task-history entry supports these formats (from PRD):

```typescript
// Good feedback (inline)
{ source: "inline", rating: "good" }

// Bad feedback with quick reason (inline)
{ source: "inline", rating: "bad", quickReason: "missed-files" }
{ source: "inline", rating: "bad", quickReason: "wrong-files" }
{ source: "inline", rating: "bad", quickReason: "wrong-model" }

// Bad feedback with description (inline, option 4)
{ source: "inline", rating: "bad", details: "missed styles.css" }

// Skipped — no feedback
null
```

The `source` field distinguishes inline feedback from detailed `co correct` feedback (Story 6.2 uses `source: "cli-correct"`).

### Forget Command: What Gets Modified

The `co forget <file>` command touches THREE store files but NOT the project map:

| Store File | What Changes | How |
|---|---|---|
| keyword-index.json | File removed from `keywordToFiles` arrays; file's `fileToKeywords` entry deleted | Read, filter, write back |
| patterns.json `coOccurrences` | Co-occurrence entries containing the file get `confidence` set to 0.0 | Read, find matching entries, zero confidence, write back |
| patterns.json `typeAffinities` | File's weight zeroed in all task-type affinity maps | Read, find file entries, set weight to 0, write back |
| project-map.json | **NOT modified** — file remains discoverable by scanner | No changes |

**Undo mechanism:** Running `co scan` re-indexes the project. If the forgotten file still exists on disk, the scanner will re-discover it, re-extract keywords, and restore its presence in the keyword index. Co-occurrence patterns will rebuild naturally as tasks reference the file again.

### Emoji Handling (OQ-06 Resolution)

Terminal emoji support varies. The implementation must:

1. **Default to text:** `[G]ood [B]ad [S]kip` as the safe default.
2. **Detect emoji support:** Check for modern terminal indicators (`TERM_PROGRAM=iTerm.app`, `WT_SESSION` for Windows Terminal, `TERM_PROGRAM=vscode` for VS Code terminal).
3. **Emoji variant:** `[👍 Good] [👎 Bad] [→ Skip]` only when emoji support is confirmed.
4. **Input handling is identical:** Whether emoji or text is displayed, the same keypress handling applies (G/B/S or 1/2/3).

### Naming Conventions (MUST FOLLOW)

| Element | Convention | Example |
|---|---|---|
| Source files | kebab-case.ts | `feedback.ts`, `formatters.ts` |
| Test files | kebab-case.test.ts | `tests/visibility/feedback.test.ts` |
| Functions | camelCase | `showInlineFeedback()`, `forgetFile()`, `recordFeedback()` |
| Variables | camelCase | `feedbackResult`, `keywordsCleared`, `quickReason` |
| Types/Interfaces | PascalCase | `InlineFeedback`, `FeedbackResult`, `ForgetResult`, `TaskSummary` |
| Constants | UPPER_SNAKE_CASE | `FEEDBACK_TIMEOUT_MS`, `EMOJI_TERMINALS` |
| Booleans | is/has/should prefix | `isEmojiSupported`, `hasRecentTask` |
| JSON fields | camelCase | `quickReason`, `missedFiles`, `source` |

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

**Confidence Scores:** Always 0.0-1.0 float in data, convert to percentage only for display.

**Null vs Undefined:** JSON uses `null` (feedback: null for skip), TypeScript uses `undefined` for optional params.

[Source: architecture.md#Format Patterns]

### Import Rules (MUST FOLLOW)

- `src/visibility/feedback.ts` imports from `../store/index.js` for store read/write operations
- `src/visibility/feedback.ts` imports from `../utils/index.js` for paths, logger, errors
- `src/visibility/feedback.ts` imports from `./types.js` for feedback types
- `src/visibility/feedback.ts` imports from `./formatters.js` for box-drawing and display helpers
- Never import from another module's internal files — only through barrel `index.ts`
- `visibility/` modules read from store but never write directly — EXCEPTION: `forgetFile()` writes to keyword-index.json and patterns.json because it is a user-initiated mutation command, not a pipeline read. This write goes through the store module's typed write accessors.

[Source: architecture.md#Import Rules]

### Project Structure (Files Created/Modified by This Story)

```
claude-opt/
├── src/
│   ├── index.ts                    # MODIFIED — register `forget` command
│   ├── pipeline.ts                 # MODIFIED — integrate inline feedback post-adapter
│   └── visibility/
│       ├── index.ts                # MODIFIED — export new functions and types
│       ├── types.ts                # MODIFIED — add feedback and forget types
│       ├── feedback.ts             # CREATED — inline feedback UI + forget command logic
│       └── formatters.ts           # MODIFIED — add feedback box rendering helpers
├── tests/
│   └── visibility/
│       └── feedback.test.ts        # CREATED — full test suite for feedback + forget
```

### Dependencies on Other Stories

| Dependency | Story | What's Needed |
|---|---|---|
| Store module with typed accessors | Story 1.2 | `readTaskHistory()`, `writeTaskHistory()`, `readKeywordIndex()`, `writeKeywordIndex()`, `readPatterns()`, `writePatterns()` |
| Pipeline orchestrator | Story 2.1 | Post-adapter hook point to insert feedback step |
| Knowledge Learner | Story 3.x | `captureOutcome()` must accept optional `FeedbackResult` parameter |
| Visibility formatters | Story 5.x | `formatters.ts` box-drawing utilities |
| Project Scanner | Story 1.4/1.5 | `co scan` as the undo mechanism for `co forget` |

### What This Story Does NOT Create

- `co correct` detailed feedback mode — that is Story 6.2
- Learner weight adjustment logic based on feedback signals — that is Epic 3 (learner consumes feedback)
- Feedback frequency reduction after 20+ consistent sessions (PR-02 mitigation) — that is a Growth feature
- Feedback analytics or visualization — covered by VL-09 in Epic 5

### References

- [Source: architecture.md#Complete Project Directory Structure] — visibility module location and file layout
- [Source: architecture.md#Core Architectural Decisions] — AD-03, AD-04, AD-05, AD-07
- [Source: architecture.md#Implementation Patterns & Consistency Rules] — naming, structure, format patterns
- [Source: architecture.md#Architectural Boundaries] — visibility boundary (read-only except user-mutation commands)
- [Source: architecture.md#Data Flow Through Structure] — feedback.ts placement in pipeline flow
- [Source: prd.md#VL-05] — `co forget <file>` requirement
- [Source: prd.md#VL-06] — Inline post-task feedback requirement
- [Source: prd.md#Inline Feedback Flow] — Feedback flow diagram with JSON formats
- [Source: prd.md#CLI Mockups — co forget] — Forget command output mockup
- [Source: prd.md#task-history.json] — Feedback field schema definition
- [Source: prd.md#keyword-index.json] — Keyword index schema (affected by forget)
- [Source: prd.md#patterns.json] — Patterns schema (affected by forget)
- [Source: prd.md#OQ-06] — Emoji support open question and resolution approach
- [Source: epics.md#Story 6.1] — Original story definition and acceptance criteria

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
None — clean implementation, no blocking issues encountered.

### Completion Notes List
- Defined all feedback types (InlineFeedback, QuickReason, InlineFeedbackWithDescription, FeedbackResult, ForgetResult, TaskSummary) in src/visibility/types.ts
- Updated store TaskFeedback type in src/types/store.ts to align with PRD feedback schema (source/rating/quickReason/details instead of type/details/timestamp)
- Implemented supportsEmoji() utility with detection for Windows Terminal, iTerm2, VS Code, Apple Terminal, WezTerm, Hyper, Alacritty
- Created showInlineFeedback() with raw stdin single-keypress capture, 10s timeout auto-skip, TTY detection for non-interactive skip
- Created showQuickReasonMenu() with options 1-4 including free-text description input
- Implemented recordFeedback() with store read/write through typed accessors
- Implemented forgetFile() cleaning keyword-index.json (keywordToFiles + fileToKeywords) and patterns.json (coOccurrences confidence zeroing + typeAffinities weight zeroing) without touching project-map.json
- Integrated feedback into pipeline as Stage 8 (post-adapter) wrapped with withFailOpen() — fire-and-forget async
- Wired up `co forget <file>` command in CLI with proper error handling and confirmation output
- Exported all new functions and types through barrel exports
- 24 new tests covering types, emoji detection, feedback persistence, and forget command logic

### Change Log
- 2026-03-05: Implemented Story 6.1 — Inline Feedback & Forget Command (all 11 tasks)
- 2026-03-05: Code review passed — all ESLint errors fixed, all tests passing, build clean

### File List
- src/visibility/types.ts (MODIFIED — added feedback and forget types)
- src/visibility/feedback.ts (CREATED — inline feedback UI + forget command logic)
- src/visibility/index.ts (MODIFIED — exported new functions and types)
- src/types/store.ts (MODIFIED — updated TaskFeedback to match PRD schema)
- src/index.ts (MODIFIED — wired up `co forget` command with proper implementation)
- src/pipeline.ts (MODIFIED — integrated feedback as Stage 8 post-adapter)
- tests/visibility/feedback.test.ts (CREATED — 24 tests for feedback + forget)
