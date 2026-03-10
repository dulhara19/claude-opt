# Story 2.1: Pipeline Orchestrator & Task Analyzer

Status: done
Epic: 2 - Smart Task Execution Pipeline
Story: 2.1
Date: 2026-03-04
Complexity: Large
Estimated Scope: Pipeline orchestrator that runs all stages sequentially, plus keyword-based task classification engine

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want to run `co "my task"` and have it automatically classified by type, domain, and complexity,
so that the optimizer can make intelligent decisions about file predictions and model routing.

## Acceptance Criteria (BDD)

### AC1: Pipeline Orchestrator Initialization
**Given** a developer runs `co "fix the dropdown z-index bug in UserMenu"`
**When** the pipeline orchestrator starts
**Then** it initializes a PipelineContext with the user's prompt
**And** calls each pipeline stage sequentially: Analyzer -> Predictor -> Router -> Compressor -> [Review] -> Adapter
**And** each stage is wrapped with `withFailOpen()` so a failure in any stage falls through gracefully

### AC2: Bugfix Task Classification
**Given** a task prompt containing bug-related keywords ("fix", "bug", "broken", "error")
**When** the Task Analyzer classifies the task
**Then** the task type is classified as `bugfix`
**And** the output is a structured `ClassificationResult`: `{ type, domain, complexity, confidence }`
**And** classification completes in <100ms

### AC3: Feature Task Classification
**Given** a task prompt like "add dark mode to settings panel"
**When** the Task Analyzer classifies the task
**Then** the task type is classified as `feature`
**And** the domain is mapped to the relevant project domain based on keyword matching against the project map

### AC4: Research/Learning Task Classification
**Given** a task prompt like "explain how the auth middleware works"
**When** the Task Analyzer classifies the task
**Then** the task type is classified as `research` or `learning`
**And** complexity is classified as `simple` (research tasks default lower)

### AC5: Non-Code Task Classification
**Given** a non-code task prompt like "restructure chapter 3 of the thesis"
**When** the Task Analyzer classifies the task
**Then** the task type is classified as `documentation` or `writing`
**And** non-code task types are recognized correctly (literature review, writing, thesis structuring, concept exploration)

### AC6: Fail-Open on Analyzer Error
**Given** the Task Analyzer fails with an unexpected error
**When** `withFailOpen()` catches the error
**Then** a default classification is returned (`{ type: 'unknown', domain: 'general', complexity: 'medium', confidence: 0 }`)
**And** the pipeline continues to the next stage
**And** the error is logged for Doctor analysis

## Tasks / Subtasks

- [ ] Task 1: Create pipeline orchestrator module (AC: #1)
  - [ ] Create `src/pipeline.ts` — the central orchestrator
  - [ ] Implement `runPipeline(userPrompt: string): Promise<PipelineContext>` function
  - [ ] Initialize `PipelineContext` with the user's prompt string
  - [ ] Call each pipeline stage sequentially: analyze -> predict -> route -> compress -> review -> adapt
  - [ ] Wrap each stage invocation with `withFailOpen()` from `utils/errors.ts`
  - [ ] Pass accumulated `PipelineContext` to each stage, merging returned results
  - [ ] Return the fully populated `PipelineContext` after all stages complete
  - [ ] Handle the async nature of the adapter stage (subprocess) while keeping pre-adapter stages sync
- [ ] Task 2: Define pipeline stage interfaces (AC: #1)
  - [ ] Define `PipelineStage<TInput, TOutput>` type in `src/types/pipeline.ts` (if not already defined)
  - [ ] Ensure each stage function signature follows `(ctx: PipelineContext) => PipelineContext` pattern
  - [ ] Define default fallback values for each stage to use with `withFailOpen()`
- [ ] Task 3: Create analyzer module structure (AC: #2, #3, #4, #5)
  - [ ] Create `src/analyzer/` directory
  - [ ] Create `src/analyzer/index.ts` barrel export: `classifyTask`, `ClassificationResult` type
  - [ ] Create `src/analyzer/types.ts` with `ClassificationResult`, keyword map types, `TaskTypeKeywords`
  - [ ] Create `src/analyzer/task-analyzer.ts` — core classification logic
- [ ] Task 4: Implement keyword maps for task type classification (AC: #2, #3, #4, #5)
  - [ ] Define `TASK_TYPE_KEYWORDS` map: `{ bugfix: ["fix", "bug", "broken", "error", "crash", "issue", "wrong", "fail"], feature: ["add", "create", "implement", "new", "build", "introduce"], refactor: ["refactor", "restructure", "clean", "reorganize", "simplify", "extract"], research: ["explain", "how", "why", "understand", "investigate", "explore"], learning: ["learn", "study", "what is", "teach", "tutorial"], documentation: ["document", "readme", "docs", "write up", "describe"], writing: ["write", "draft", "chapter", "thesis", "essay", "literature review"] }`
  - [ ] Define `COMPLEXITY_SIGNALS` map for simple/medium/complex classification
  - [ ] Define weights per keyword category (exact match higher, partial match lower)
- [ ] Task 5: Implement `classifyTask()` function (AC: #2, #3, #4, #5)
  - [ ] Accept `userPrompt: string` and optional project map context
  - [ ] Tokenize the prompt into normalized lowercase keywords
  - [ ] Score each task type using weighted keyword matching against `TASK_TYPE_KEYWORDS`
  - [ ] Select the task type with the highest score as the classification
  - [ ] Calculate confidence as the ratio of best score to total score (0.0-1.0)
  - [ ] If no keywords match, return `type: 'unknown'` with `confidence: 0`
- [ ] Task 6: Implement domain classification (AC: #3)
  - [ ] Read the project map from the store (read-only) to get domain keyword mappings
  - [ ] Match prompt keywords against domain keywords from the project map
  - [ ] Return the best-matching domain name, or `'general'` if no match
- [ ] Task 7: Implement complexity classification (AC: #2, #4)
  - [ ] Use keyword signals: "simple fix" -> simple, "complex refactor" -> complex
  - [ ] Use file count prediction signals if available (more files = higher complexity)
  - [ ] Research tasks default to `simple` complexity
  - [ ] Default to `medium` if no clear signal
- [ ] Task 8: Enforce performance budget (AC: #2)
  - [ ] Add timing instrumentation around `classifyTask()` execution
  - [ ] Log a warning if classification exceeds 100ms budget
  - [ ] Ensure keyword matching uses O(n*m) at worst (n=prompt tokens, m=keyword entries) — no heavy computation
- [ ] Task 9: Implement fail-open default classification (AC: #6)
  - [ ] Define `DEFAULT_CLASSIFICATION` constant: `{ type: 'unknown', domain: 'general', complexity: 'medium', confidence: 0 }`
  - [ ] Export from analyzer module for use by pipeline orchestrator's `withFailOpen()` wrapper
  - [ ] Ensure errors are logged via `utils/logger.ts` before fallback
- [ ] Task 10: Wire CLI entry point to pipeline (AC: #1)
  - [ ] Update `src/index.ts` default command handler to call `runPipeline()` with the user's task prompt
  - [ ] Pass `--verbose` and `--quiet` flags through to the pipeline context
  - [ ] Handle pipeline result (display output or errors)
- [ ] Task 11: Write unit tests for task analyzer (AC: #2, #3, #4, #5, #6)
  - [ ] Create `tests/analyzer/task-analyzer.test.ts`
  - [ ] Test bugfix classification: prompts with "fix", "bug", "error" keywords
  - [ ] Test feature classification: prompts with "add", "create", "implement" keywords
  - [ ] Test research/learning classification: prompts with "explain", "how" keywords
  - [ ] Test non-code classification: prompts with "chapter", "thesis", "write" keywords
  - [ ] Test unknown classification: prompts with no matching keywords
  - [ ] Test confidence scoring: verify scores are 0.0-1.0 range
  - [ ] Test performance: verify classification completes in <100ms
- [ ] Task 12: Write unit tests for pipeline orchestrator (AC: #1, #6)
  - [ ] Create `tests/pipeline.test.ts`
  - [ ] Test that PipelineContext is initialized with user prompt
  - [ ] Test that stages are called sequentially
  - [ ] Test fail-open: mock a stage throwing an error, verify pipeline continues
  - [ ] Test that default classification is used when analyzer fails
  - [ ] Test that errors are logged when stages fail

## Dev Notes

### Architecture Decisions to Follow

| Decision | Requirement | Source |
|---|---|---|
| AD-02 | Typed Pipeline with Orchestrator — `PipelineContext` accumulates results from each stage | [Source: architecture.md#Core Architectural Decisions] |
| AD-04 | `withFailOpen(stageFn, fallback)` wrapper for every pipeline stage | [Source: architecture.md#Core Architectural Decisions] |
| AD-09 | Weighted Keyword Scoring — keyword maps for task types, score = hit count x weight, <100ms | [Source: architecture.md#Core Architectural Decisions] |

### Naming Conventions (MUST FOLLOW)

| Element | Convention | Example |
|---|---|---|
| Source files | kebab-case.ts | `task-analyzer.ts`, `pipeline.ts` |
| Test files | kebab-case.test.ts | `tests/analyzer/task-analyzer.test.ts` |
| Functions | camelCase | `classifyTask()`, `runPipeline()` |
| Variables | camelCase | `taskType`, `confidenceScore` |
| Types/Interfaces | PascalCase | `ClassificationResult`, `PipelineContext` |
| Constants | UPPER_SNAKE_CASE | `TASK_TYPE_KEYWORDS`, `DEFAULT_CLASSIFICATION` |
| Enums | PascalCase + PascalCase members | `TaskType.Bugfix`, `Complexity.Medium` |
| Booleans | is/has/should/can prefix | `isResearch`, `hasKeywordMatch` |
| JSON fields | camelCase | `taskType`, `confidenceScore` |
| Directories | kebab-case | `src/analyzer/` |

[Source: architecture.md#Naming Patterns]

### Code Patterns (MUST FOLLOW)

**Result<T> Pattern:**
```typescript
type Result<T> = { ok: true; value: T } | { ok: false; error: string };
```

**withFailOpen Pattern:**
```typescript
const classify = withFailOpen(
  (ctx: PipelineContext) => analyzer.classifyTask(ctx.userPrompt),
  DEFAULT_CLASSIFICATION
);
```

**PipelineContext Pattern:**
```typescript
interface PipelineContext {
  userPrompt: string;
  classification?: ClassificationResult;
  prediction?: PredictionResult;
  routing?: RoutingResult;
  compression?: CompressionResult;
  adapterResult?: AdapterResult;
}
```

**ClassificationResult:**
```typescript
interface ClassificationResult {
  type: TaskType;
  domain: string;
  complexity: Complexity;
  confidence: number;  // 0.0 - 1.0
}
```

**Confidence Scores:** Always 0.0-1.0 float in data, convert to percentage only for display.

[Source: architecture.md#Format Patterns]

### Import Rules (MUST FOLLOW)

- Modules import from other modules ONLY through their `index.ts` barrel export
- Never import from another module's internal files directly
- Shared types used across 3+ modules go in `src/types/`
- `utils/` and `store/` are leaf dependencies — never import pipeline modules
- Analyzer reads from `store/` (read-only) for project map and keyword index

[Source: architecture.md#Import Rules]

### Project Structure Notes

This story creates the pipeline orchestrator and the first pipeline stage module:

```
src/
├── pipeline.ts                 # Pipeline orchestrator (NEW)
├── analyzer/                   # Task Analyzer module (NEW)
│   ├── index.ts                # Public: classifyTask(), ClassificationResult
│   ├── types.ts                # ClassificationResult, TaskTypeKeywords, keyword maps
│   └── task-analyzer.ts        # Keyword scoring, type/domain/complexity classification
tests/
├── pipeline.test.ts            # Pipeline orchestrator tests (NEW)
├── analyzer/
│   └── task-analyzer.test.ts   # Task analyzer tests (NEW)
```

### Dependencies on Previous Stories

- **Story 1.1** (Project Scaffold & Core Utilities): Provides `utils/errors.ts` (`withFailOpen`, `Result<T>`), `utils/logger.ts`, `utils/constants.ts`, `src/types/` (`PipelineContext`, `TaskType`, `Complexity` enums), and CLI entry point (`src/index.ts` with Commander.js)
- **Story 1.2** (Knowledge Store): Provides `store/` module with `readProjectMap()` and `readKeywordIndex()` for domain classification

### Async/Sync Considerations

- `classifyTask()` is **synchronous** — keyword matching is pure computation, no I/O
- `runPipeline()` is **async** because the adapter stage (Story 2.6) spawns a subprocess
- Pre-adapter stages (analyzer, predictor, router, compressor) are all sync
- Pipeline orchestrator uses `await` for the adapter stage only

### Performance Budget

| Stage | Budget | This Story |
|---|---|---|
| Task Analyzer | <100ms | Yes |
| File Predictor | <200ms | Story 2.2 |
| Model Router | <50ms | Story 2.3 |
| Prompt Compressor | <100ms | Story 2.4 |
| Total pre-Claude overhead | <500ms | Pipeline orchestrator enforces |

### References

- [Source: architecture.md#Core Architectural Decisions] — AD-02, AD-04, AD-09
- [Source: architecture.md#Implementation Patterns & Consistency Rules] — All naming, structure, format patterns
- [Source: architecture.md#API & Communication Patterns] — PipelineContext, pipeline data flow
- [Source: architecture.md#Process Patterns] — Error handling hierarchy, withFailOpen levels
- [Source: architecture.md#Complete Project Directory Structure] — analyzer/ and pipeline.ts placement
- [Source: epics.md#Story 2.1] — Original story definition and acceptance criteria

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
N/A

### Completion Notes List
- Pipeline orchestrator implemented in `src/pipeline.ts` with sequential stage execution
- Task Analyzer implemented in `src/analyzer/` with weighted keyword scoring (AD-09)
- All pipeline stages wrapped with `withFailOpen()` for fail-open behavior (AD-04)
- PipelineContext extended with classification, prediction, routing, compression, and adapter result fields
- TaskType enum extended with Research, Learning, Documentation, Writing, Exploration
- Complexity enum extended with Simple, Complex
- CLI wired: `co "task description"` runs the pipeline
- Placeholder stubs for future stages (predictor, router, compressor, adapter)
- 46 tests passing (37 analyzer + 9 pipeline)
- Classification completes in <1ms (well under 100ms budget)

### File List
- `src/analyzer/types.ts` — NEW: keyword maps, constants, type definitions
- `src/analyzer/task-analyzer.ts` — NEW: classifyTask() with weighted keyword scoring
- `src/analyzer/index.ts` — NEW: barrel exports
- `src/pipeline.ts` — NEW: pipeline orchestrator with runPipeline()
- `src/types/common.ts` — MODIFIED: added TaskType and Complexity enum values
- `src/types/pipeline.ts` — MODIFIED: added ClassificationResult and stage result types to PipelineContext
- `src/types/index.ts` — MODIFIED: re-exported new types
- `src/index.ts` — MODIFIED: wired default command to pipeline
- `tests/analyzer/task-analyzer.test.ts` — NEW: 37 tests
- `tests/pipeline/pipeline.test.ts` — NEW: 9 tests
