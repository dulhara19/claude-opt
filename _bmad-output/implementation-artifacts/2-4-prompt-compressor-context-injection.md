# Story 2.4: Prompt Compressor & Context Injection

Status: done
Epic: 2 - Smart Task Execution Pipeline
Story: 2.4
Date: 2026-03-04
Complexity: Medium
Estimated Scope: Prompt optimization engine with filler removal, file context pre-injection, and pattern/convention injection

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want my prompt optimized with relevant context injected automatically,
so that Claude receives a concise, information-rich prompt that minimizes wasted tokens.

## Acceptance Criteria (BDD)

### AC1: Filler Word Removal
**Given** a user prompt with filler words and redundant phrasing
**When** the Prompt Compressor processes the prompt
**Then** filler words and unnecessary context are removed
**And** the semantic meaning of the user's request is never altered
**And** compression completes in <100ms

### AC2: Predicted File Context Injection
**Given** the File Predictor identified 5 relevant files
**When** the Prompt Compressor builds the optimized prompt
**Then** predicted file contents or summaries are pre-injected into the prompt context
**And** files are prioritized by prediction confidence score

### AC3: Pattern and Convention Injection
**Given** the knowledge store contains patterns and conventions (e.g., "test files use .test.ts suffix", "components use PascalCase")
**When** the Prompt Compressor builds the optimized prompt
**Then** relevant patterns and conventions are injected into the prompt context

### AC4: Domain-Specific Context Injection
**Given** the knowledge store contains domain-specific context (e.g., "Chapter 3 uses APA formatting", "auth module uses JWT tokens")
**When** the task domain matches stored context
**Then** domain-specific context is injected into the prompt

### AC5: Structured Prompt Assembly
**Given** the Prompt Compressor produces an optimized prompt
**When** the prompt is assembled
**Then** it includes: compressed user request + predicted file context + conventions + domain context
**And** the total prompt is structured for maximum Claude comprehension

## Tasks / Subtasks

- [x] Task 1: Create compressor module structure (AC: #1, #5)
  - [x] Create `src/compressor/` directory
  - [x] Create `src/compressor/index.ts` barrel export: `compressPrompt`, `CompressionResult` type
  - [x] Create `src/compressor/types.ts` with `CompressionResult`, `PromptTemplate`, `PromptSection`, `CompressionStats`
  - [x] Create `src/compressor/prompt-compressor.ts` — core compression and injection logic
- [x] Task 2: Define compression types (AC: #1, #5)
  - [x] `CompressionResult`: `{ optimizedPrompt: string; originalLength: number; compressedLength: number; sections: PromptSection[]; durationMs: number }`
  - [x] `PromptSection`: `{ type: 'userRequest' | 'fileContext' | 'conventions' | 'domainContext'; content: string; source: string }`
  - [x] `CompressionStats`: `{ fillerWordsRemoved: number; filesInjected: number; patternsInjected: number; compressionRatio: number }`
  - [x] `PromptTemplate`: structured template for assembling the final prompt
- [x] Task 3: Implement filler word removal (AC: #1)
  - [x] Define `FILLER_WORDS` list: common filler words and phrases ("please", "can you", "I want you to", "basically", "just", "actually", "I think", "maybe", "could you", "would you mind")
  - [x] Define `REDUNDANT_PATTERNS` list: regex patterns for redundant phrasing
  - [x] Implement `removeFiller(prompt: string): string` — strip fillers while preserving semantic meaning
  - [x] Preserve technical terms, file names, and code references during filler removal
  - [x] Never alter the core intent of the user's request
- [x] Task 4: Implement predicted file context injection (AC: #2)
  - [x] Accept `PredictionResult` from PipelineContext (from predictor stage)
  - [x] For each predicted file (sorted by confidence), build a context section
  - [x] Include file path and a summary of the file's role/contents
  - [x] Prioritize higher-confidence files — they appear first in the prompt context
  - [x] Limit total injected file context to prevent prompt bloat (configurable max files)
- [x] Task 5: Implement pattern and convention injection (AC: #3)
  - [x] Read patterns from store (read-only): `readPatterns()`
  - [x] Filter patterns relevant to the current task type and predicted files
  - [x] Format patterns as concise instructions: "Convention: test files use .test.ts suffix"
  - [x] Inject into prompt context section
- [x] Task 6: Implement domain-specific context injection (AC: #4)
  - [x] Read project map from store (read-only): `readProjectMap()`
  - [x] Match task domain (from `ClassificationResult`) against stored domain contexts
  - [x] Extract relevant domain-specific notes and conventions
  - [x] Inject into prompt context section
- [x] Task 7: Implement structured prompt assembly (AC: #5)
  - [x] Define `PROMPT_TEMPLATE` structure with ordered sections:
    1. Compressed user request (always first)
    2. Predicted file context (ordered by confidence)
    3. Project conventions and patterns
    4. Domain-specific context
  - [x] Implement `assemblePrompt(sections: PromptSection[]): string` — combine all sections with clear delimiters
  - [x] Use clear section headers for Claude comprehension: "## Task", "## Relevant Files", "## Project Conventions", "## Domain Context"
  - [x] Return the fully assembled `CompressionResult`
- [x] Task 8: Implement `compressPrompt()` main function (AC: #1, #2, #3, #4, #5)
  - [x] Accept `PipelineContext` with classification, prediction as input
  - [x] Call filler removal on user prompt
  - [x] Call file context injection with prediction results
  - [x] Call pattern injection with store data
  - [x] Call domain context injection with classification domain
  - [x] Call structured prompt assembly to combine all sections
  - [x] Record timing and compression statistics
  - [x] Return `CompressionResult`
- [x] Task 9: Enforce performance budget (AC: #1)
  - [x] Add timing instrumentation around `compressPrompt()` execution
  - [x] Log a warning if compression exceeds 100ms budget
  - [x] Filler removal is string processing — should be fast
  - [x] File context injection reads from store — should be pre-loaded
- [x] Task 10: Define fail-open default compression (AC: #1)
  - [x] Define `DEFAULT_COMPRESSION` constant: returns the original prompt unchanged with empty sections
  - [x] Export for use by pipeline orchestrator's `withFailOpen()` wrapper
  - [x] If compressor fails, the original user prompt is sent to Claude Code unchanged
- [x] Task 11: Write unit tests for prompt compressor (AC: #1, #2, #3, #4, #5)
  - [x] Create `tests/compressor/prompt-compressor.test.ts`
  - [x] Test filler removal: verify fillers stripped, semantic meaning preserved
  - [x] Test filler removal does not strip technical terms or code references
  - [x] Test file context injection: verify predicted files appear in output, sorted by confidence
  - [x] Test pattern injection: verify relevant patterns appear in output
  - [x] Test domain context injection: verify domain-specific content appears when domain matches
  - [x] Test structured assembly: verify section ordering and delimiters
  - [x] Test compression stats: verify ratio and counts are accurate
  - [x] Test fail-open: verify original prompt returned when compressor fails
  - [x] Test performance: verify compression completes in <100ms

## Dev Notes

### Architecture Decisions to Follow

| Decision | Requirement | Source |
|---|---|---|
| AD-02 | Typed Pipeline with Orchestrator — Prompt Compressor is pipeline stage 4, receives PipelineContext with classification, prediction, and routing | [Source: architecture.md#Core Architectural Decisions] |
| AD-04 | `withFailOpen(stageFn, fallback)` wrapper — compressor failure returns original prompt unchanged, pipeline continues | [Source: architecture.md#Core Architectural Decisions] |
| AD-03 | Single Store Module — compressor reads from store (read-only) for patterns, project map, conventions | [Source: architecture.md#Core Architectural Decisions] |
| AD-07 | Chalk + String Templates — compressor output may include formatting for review display (Story 2.5) | [Source: architecture.md#Core Architectural Decisions] |

### Naming Conventions (MUST FOLLOW)

| Element | Convention | Example |
|---|---|---|
| Source files | kebab-case.ts | `prompt-compressor.ts` |
| Test files | kebab-case.test.ts | `tests/compressor/prompt-compressor.test.ts` |
| Functions | camelCase | `compressPrompt()`, `removeFiller()`, `assemblePrompt()` |
| Variables | camelCase | `optimizedPrompt`, `compressedLength`, `fillerWordsRemoved` |
| Types/Interfaces | PascalCase | `CompressionResult`, `PromptTemplate`, `PromptSection` |
| Constants | UPPER_SNAKE_CASE | `FILLER_WORDS`, `PROMPT_TEMPLATE`, `DEFAULT_COMPRESSION` |
| Booleans | is/has/should/can prefix | `isCompressed`, `hasDomainContext`, `shouldInjectFiles` |
| JSON fields | camelCase | `optimizedPrompt`, `compressionRatio` |
| Directories | kebab-case | `src/compressor/` |

[Source: architecture.md#Naming Patterns]

### Code Patterns (MUST FOLLOW)

**Result<T> Pattern:**
```typescript
type Result<T> = { ok: true; value: T } | { ok: false; error: string };
```

**withFailOpen Pattern:**
```typescript
const compress = withFailOpen(
  (ctx: PipelineContext) => compressor.compressPrompt(ctx),
  { optimizedPrompt: ctx.userPrompt, originalLength: ctx.userPrompt.length, compressedLength: ctx.userPrompt.length, sections: [], durationMs: 0 }
);
```

**PipelineContext — Compressor reads classification + prediction + routing, writes compression:**
```typescript
interface PipelineContext {
  userPrompt: string;
  classification?: ClassificationResult;  // Read by compressor (domain)
  prediction?: PredictionResult;          // Read by compressor (file context)
  routing?: RoutingResult;                // Read by compressor (model info)
  compression?: CompressionResult;        // Written by compressor
  adapterResult?: AdapterResult;
}
```

**Confidence Scores:** Always 0.0-1.0 float in data, convert to percentage only for display.

[Source: architecture.md#Format Patterns]

### Import Rules (MUST FOLLOW)

- Modules import from other modules ONLY through their `index.ts` barrel export
- Never import from another module's internal files directly
- Compressor imports `ClassificationResult` from `../analyzer/index.js`
- Compressor imports `PredictionResult` from `../predictor/index.js`
- Compressor imports `RoutingResult` from `../router/index.js`
- Compressor reads from `store/` (read-only): `readPatterns()`, `readProjectMap()`
- `utils/` and `store/` are leaf dependencies

[Source: architecture.md#Import Rules]

### Project Structure Notes

This story creates the fourth pipeline stage module (compression logic only; review UI is Story 2.5):

```
src/
├── compressor/                    # Prompt Compressor module (NEW)
│   ├── index.ts                   # Public: compressPrompt(), CompressionResult
│   ├── types.ts                   # CompressionResult, PromptTemplate, PromptSection
│   └── prompt-compressor.ts       # Filler removal, context injection, prompt building
tests/
├── compressor/
│   └── prompt-compressor.test.ts  # Compressor tests (NEW)
```

Note: `prompt-review.ts` is created in Story 2.5 and added to the same `src/compressor/` directory.

### Dependencies on Previous Stories

- **Story 1.1** (Project Scaffold & Core Utilities): Provides `utils/errors.ts` (`withFailOpen`, `Result<T>`), `utils/logger.ts`, `utils/constants.ts`, `src/types/` (`PipelineContext`)
- **Story 1.2** (Knowledge Store): Provides `store/` module with `readPatterns()`, `readProjectMap()` — all read-only accessors
- **Story 2.1** (Pipeline Orchestrator & Task Analyzer): Provides `ClassificationResult` from analyzer and pipeline orchestrator
- **Story 2.2** (File Predictor): Provides `PredictionResult` with predicted files and confidence scores
- **Story 2.3** (Model Router): Provides `RoutingResult` with selected model info

### Prompt Assembly Order

The final optimized prompt follows this structure:

```
## Task
[Compressed user request — filler removed, meaning preserved]

## Relevant Files
[Predicted files ordered by confidence, with summaries]
- src/components/UserMenu.tsx (confidence: 0.92) — React component for user dropdown menu
- src/styles/dropdown.css (confidence: 0.78) — Dropdown styling rules

## Project Conventions
[Matching patterns from knowledge store]
- Components use PascalCase naming
- Test files use .test.ts suffix
- CSS modules for component styling

## Domain Context
[Domain-specific context matching the classified domain]
- UI components follow atomic design pattern
- Z-index layering defined in variables.css
```

### Performance Budget

- Prompt Compressor total: <100ms
- Filler removal: ~10ms (string processing)
- File context injection: ~30ms (store reads + formatting)
- Pattern injection: ~20ms (store reads + filtering)
- Domain context injection: ~20ms (store reads + matching)
- Assembly: ~10ms (string concatenation)

### References

- [Source: architecture.md#Core Architectural Decisions] — AD-02, AD-03, AD-04, AD-07
- [Source: architecture.md#Implementation Patterns & Consistency Rules] — All naming, structure, format patterns
- [Source: architecture.md#Complete Project Directory Structure] — compressor/ placement
- [Source: architecture.md#API & Communication Patterns] — PipelineContext data flow
- [Source: epics.md#Story 2.4] — Original story definition and acceptance criteria

## Change Log

- 2026-03-04: Implemented Prompt Compressor module (Story 2.4) — all 11 tasks completed. Created compressor module with filler removal, file context injection, pattern/convention injection, domain context injection, structured prompt assembly, performance instrumentation, and fail-open fallback. Integrated into pipeline orchestrator as stage 4. Updated CompressionResult from placeholder to real type. 30 new tests, 410 total tests passing.
- 2026-03-05: Code review passed — all ESLint errors fixed, all tests passing, build clean

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- No issues encountered during implementation.

### Completion Notes List

- Created `src/compressor/types.ts` with `CompressionResult`, `PromptSection`, `CompressionStats`, `PromptTemplate` types
- Created `src/compressor/prompt-compressor.ts` with core logic: `removeFiller()`, `buildFileContext()`, `buildConventionContext()`, `buildDomainContext()`, `assemblePrompt()`, `compressPrompt()`
- Created `src/compressor/index.ts` barrel export
- Updated `src/types/pipeline.ts` to use real `CompressionResult` from compressor module (replaced placeholder)
- Updated `src/pipeline.ts` to integrate compressor stage with `withFailOpen()` wrapper and `DEFAULT_COMPRESSION` fallback
- Updated `tests/pipeline/pipeline.test.ts` to expect compression result (was previously stub assertion)
- Created 30 unit tests covering all acceptance criteria: filler removal, file context injection, convention injection, domain context injection, structured assembly, compression stats, fail-open behavior, and performance (<100ms)
- All 410 tests pass across 29 test files — zero regressions

### File List

- `src/compressor/types.ts` (NEW) — CompressionResult, PromptSection, CompressionStats, PromptTemplate types
- `src/compressor/prompt-compressor.ts` (NEW) — Core compression and context injection logic
- `src/compressor/index.ts` (NEW) — Barrel export for compressor module
- `src/types/pipeline.ts` (MODIFIED) — Updated CompressionResult from placeholder to real type import
- `src/pipeline.ts` (MODIFIED) — Integrated compressor stage 4 with fail-open wrapper
- `tests/compressor/prompt-compressor.test.ts` (NEW) — 30 unit tests for prompt compressor
- `tests/pipeline/pipeline.test.ts` (MODIFIED) — Updated assertion for compression stage (no longer stub)
