---
stepsCompleted: ['step-01-validate-prerequisites', 'step-02-design-epics', 'step-03-create-stories', 'step-04-final-validation']
inputDocuments: ['prd.md', 'architecture.md']
---

# claude_optimizer - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for claude_optimizer, decomposing the requirements from the PRD and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

**Domain 1: Project Scanner (SC)**
- FR-SC-01: Scan code projects by parsing imports (JS/TS initially, extensible parser architecture)
- FR-SC-02: Scan non-code projects — parse markdown structure, document hierarchy, heading trees, reference/link relationships
- FR-SC-03: Generate project map: file tree with metadata (type, size, last modified, domain classification)
- FR-SC-04: Generate dependency graph: directed edges between files based on imports, references, and links
- FR-SC-05: Auto-generate/update CLAUDE.md with discovered project conventions
- FR-SC-06: Support incremental re-scanning — skip unchanged files, only process deltas
- FR-SC-07: Auto-detect project type (code vs research/docs vs mixed) and adjust scanning strategy
- FR-SC-08: Starter knowledge packs: detect project stack and seed knowledge store with common patterns for that stack
- FR-SC-09: Ship built-in starter packs for common stacks: TypeScript/Node, React, Python, Markdown/Research
- FR-SC-11: Respect `.gitignore` and `.claudeignore` patterns

**Domain 2: Task Analyzer (TA)**
- FR-TA-01: Classify task type: feature, bugfix, refactor, research, documentation, learning/concept, exploration
- FR-TA-02: Classify task domain: map to project domains based on file clustering and keyword matching
- FR-TA-03: Classify task complexity: simple, medium, complex — based on keyword signals, historical data, and predicted file count
- FR-TA-04: Recognize non-code task types: literature review, writing, thesis structuring, concept exploration
- FR-TA-05: Output structured classification object: `{ type, domain, complexity, confidence }`

**Domain 3: File Predictor (FP)**
- FR-FP-01: Predict relevant files from task description using multiple weighted signals
- FR-FP-02: Signal sources: task history similarity, dependency graph traversal, keyword-to-file index, pattern co-occurrence boosting
- FR-FP-03: Output ranked file list with per-file confidence scores (0-1)
- FR-FP-04: Track prediction precision and recall per task, per domain, and overall
- FR-FP-05: Graceful degradation: when confidence is low, predict fewer files rather than bad files. Never make a session worse than raw Claude
- FR-FP-06: Support both code files and document files (markdown, text, reference lists)

**Domain 4: Model Router (MR)**
- FR-MR-01: Select cheapest model capable of handling the task: Haiku → Sonnet → Opus escalation
- FR-MR-02: Route based on: task complexity + task type + historical model success/failure
- FR-MR-03: Research/learning/documentation tasks default to Haiku unless history shows failure
- FR-MR-04: Override routing when historical data shows a cheaper model failed on similar tasks
- FR-MR-05: Expose routing decision and rationale to the user (transparency)

**Domain 5: Prompt Compressor (PC)**
- FR-PC-01: Remove filler words, redundant phrasing, and unnecessary context from user prompts
- FR-PC-02: Pre-inject predicted file contents or summaries relevant to the task
- FR-PC-03: Inject known patterns and conventions from the knowledge store
- FR-PC-04: Inject domain-specific context (e.g., "Chapter 3 uses APA formatting")
- FR-PC-05: Prompt review & edit: Show the generated systematic prompt to the user before sending
- FR-PC-06: Prompt edit mode: inline editing or open in user's `$EDITOR`

**Domain 6: Knowledge Learner (KL)**
- FR-KL-01: Capture task outcomes after each session: files actually used, model used, success/failure signal
- FR-KL-02: Compare predicted files vs actually-used files and update accuracy metrics
- FR-KL-03: Update dependency graph with newly discovered file relationships
- FR-KL-04: Detect patterns: file co-occurrence, task-type-to-file affinity, convention patterns
- FR-KL-05: Update and store new conventions discovered during session
- FR-KL-06: Self-correcting weights: boost accurate predictions, decay inaccurate ones automatically (Tier 1 recovery)
- FR-KL-07: Stale entry decay: reduce weight of files/patterns not seen in recent sessions

**Domain 7: Token Tracker (TT)**
- FR-TT-01: Track tokens consumed per individual task
- FR-TT-02: Track tokens consumed per session (aggregate)
- FR-TT-03: Track tokens consumed per 5-hour window against configurable budget (default: 44,000 tokens)
- FR-TT-04: Estimate tokens saved vs unoptimized baseline
- FR-TT-05: Tiered budget warnings: inline warning at 75% usage, blocking prompt at 90%
- FR-TT-06: Display remaining budget on demand (`claude-opt budget`)
- FR-TT-07: Token budget is user-configurable to accommodate plan changes or different Anthropic tiers
- FR-TT-08: Window time estimation: track and display time remaining until next window reset
- FR-TT-09: Window duration configurable (default: 5 hours) via `claude-opt config window-duration`

**Domain 8: Doctor Agent (DR)**
- FR-DR-01: Analyze knowledge store health on demand via `claude-opt doctor`
- FR-DR-02: Identify stale patterns: high historical frequency but absent in recent sessions
- FR-DR-03: Identify missing co-occurrence patterns that exist in data but haven't been formalized
- FR-DR-04: Identify bad predictions: files consistently predicted but not used
- FR-DR-05: Generate diagnostic report with specific findings and recommended fixes
- FR-DR-06: Propose fixes with explanations — user approves before application (Supervised mode)
- FR-DR-07: Two operating modes configurable: Supervised (default) and Autonomous (opt-in)
- FR-DR-08: Threshold detection: monitor prediction accuracy per domain; alert/trigger when below 60%
- FR-DR-09: In Supervised mode, present user with clear options: "Let Doctor diagnose", "I'll handle it manually", or "Dismiss"
- FR-DR-10: Run all diagnostic inference on Haiku to minimize token cost
- FR-DR-11: Report knowledge store health score: overall + per-domain breakdown
- FR-DR-12: Audit log: every Doctor action logged to `.claude-opt/doctor-log.json`
- FR-DR-13: Deep analysis mode: analyze archived task history for deeper pattern discovery
- FR-DR-14: Pre-flight checkup mode (`co doctor --checkup`): verify all knowledge store files are valid, project map completeness, etc. Zero token cost
- FR-DR-15: Pre-flight checkup reports issues with severity and offers: auto-fix / continue anyway / fix manually

**Domain 9: Visibility Layer (VL)**
- FR-VL-01: `claude-opt stats` — session stats, accuracy metrics, savings estimates, tasks completed
- FR-VL-02: `claude-opt budget` — remaining window budget, projected runway, usage visualization
- FR-VL-03: `claude-opt knowledge <domain>` — domain-specific knowledge inspection
- FR-VL-04: `claude-opt --dry-run "<task>"` — show full optimizer analysis without executing
- FR-VL-05: `claude-opt forget <file>` — remove specific file from knowledge store predictions
- FR-VL-06: Inline post-task feedback: `[Good] [Bad] [Skip]` with expand-on-bad quick options
- FR-VL-07: `claude-opt correct` — detailed feedback mode for power users
- FR-VL-09: Accuracy trends and token savings visualized over time

**Domain 10: Knowledge Store (KS)**
- FR-KS-01: JSON file-based storage — no external database dependencies
- FR-KS-02: Per-project isolation: each project gets its own `.claude-opt/` directory
- FR-KS-03: Store task history with outcomes (files used, model, success, tokens)
- FR-KS-04: Store dependency graph (directed file relationships)
- FR-KS-05: Store pattern library (co-occurrences, affinities, conventions)
- FR-KS-06: Store prediction accuracy metrics (per-task, per-domain, overall)
- FR-KS-07: Human-readable JSON format — power users can inspect and edit directly
- FR-KS-08: Task history capping: keep last 500 tasks active, older archived
- FR-KS-09: Archive files are read-only during normal operation

### NonFunctional Requirements

**Domain-Specific NFRs:**
- NFR-SC-10: Complete scan in <10 seconds for projects up to 500 files
- NFR-TA-06: Classification completes in <100ms
- NFR-FP-07: Prediction completes in <200ms
- NFR-FP-08: Cold start: exceed 50% precision within 5 sessions
- NFR-MR-06: Routing decision in <50ms
- NFR-PC-07: Compression completes in <100ms
- NFR-PC-08: Never alter the semantic meaning of the user's request
- NFR-KL-08: Learning capture completes in <500ms post-session
- NFR-TT-10: Tracking overhead <10ms per task
- NFR-DR-16: Typical doctor session costs <500 tokens. Pre-flight checkup costs zero tokens
- NFR-VL-08: All commands produce clean, readable terminal output with visualization support
- NFR-KS-10: All reads/writes on active files complete in <50ms

**Cross-Cutting NFRs:**
- NFR-01: Total optimizer overhead per task <500ms (all local processing before Claude call)
- NFR-02: Privacy — All data stored locally, zero cloud dependency, no telemetry
- NFR-03: Graceful failure — Optimizer failure never blocks Claude Code; falls back to raw mode transparently
- NFR-04: Platform support — macOS, Linux, Windows
- NFR-05: Zero-config — Works out of the box with sensible defaults, no mandatory config beyond `init`
- NFR-06: Extensibility — Parser architecture supports adding new language parsers via clean interface
- NFR-07: Install footprint — Minimal npm dependencies (<15 production), no native binaries required

### Additional Requirements

**From Architecture — Starter Template:**
- Custom scaffold selected (no existing starter template). Project initialization using this scaffold should be the first implementation story
- Initialization command: `npm init -y`, then install commander + chalk as production deps, typescript + tsup + vitest + eslint + prettier + tsx as dev deps
- ESM internally (`"type": "module"` in package.json), tsup builds to CJS for global install compatibility
- Both `claude-opt` and `co` CLI aliases in package.json `bin` field

**From Architecture — Critical Decisions (AD-01 to AD-10):**
- AD-01: Hybrid Adapter Pattern — Subprocess Spawn + CLAUDE.md Injection for Claude Code integration
- AD-02: Typed Pipeline with Orchestrator — each stage implements `(input: StageInput) => StageOutput`
- AD-03: Single Store Module with Typed Accessors — atomic writes (write to .tmp, rename), typed read/write functions per file
- AD-04: Higher-Order Function `withFailOpen(stageFn, fallback)` wrapper for every pipeline stage
- AD-05: POSIX Internal, Platform-Native I/O — single `utils/paths.ts` for all path normalization
- AD-06: TypeScript Type Guards for JSON schema validation (no external validator like Zod/Ajv)
- AD-07: Chalk + String Templates for terminal UI rendering (no TUI frameworks)
- AD-08: Doctor Agent uses same subprocess adapter, spawns Claude Code with diagnostic prompt requesting Haiku
- AD-09: Weighted Keyword Scoring algorithm for task classification
- AD-10: Multi-Signal Weighted Scoring algorithm for file prediction (4 signal sources combined)

**From Architecture — Cross-Cutting Patterns:**
- Error handling hierarchy: Result<T> within modules → withFailOpen() at pipeline level → try/catch at CLI level
- Synchronous pipeline with async only for Claude Code subprocess execution
- Config loaded once at startup into immutable object, passed via dependency injection
- Structured logging via `utils/logger.ts` with debug/info/warn/error levels
- Schema versioning with sequential non-destructive migrations
- Module boundary enforcement: import only through barrel `index.ts` exports
- Only 2 production dependencies (commander, chalk)
- PipelineContext accumulates results through each stage
- Performance budget allocation: Analyzer 100ms + Predictor 200ms + Router 50ms + Compressor 100ms + overhead 50ms = 500ms

**From Architecture — Implementation Sequence:**
1. AD-05 (Paths) → Foundation for everything
2. AD-03 (Store) → Knowledge Store I/O depends on paths
3. AD-04 (Fail-Open) → Wrapper needed before any module
4. AD-02 (Pipeline) → Orchestrator structure
5. AD-01 (Adapter) → Claude Code integration
6. AD-06 (Validation) → Store reads need validation
7. AD-09 (Classification) → First pipeline stage
8. AD-10 (Prediction) → Second pipeline stage
9. AD-07 (Terminal UI) → Display layer
10. AD-08 (Doctor) → Recovery system

### FR Coverage Map

FR-SC-01: Epic 1 - Scan code projects by parsing imports
FR-SC-02: Epic 1 - Scan non-code projects (markdown, docs)
FR-SC-03: Epic 1 - Generate project map with metadata
FR-SC-04: Epic 1 - Generate dependency graph
FR-SC-05: Epic 1 - Auto-generate/update CLAUDE.md
FR-SC-06: Epic 1 - Incremental re-scanning
FR-SC-07: Epic 1 - Auto-detect project type
FR-SC-08: Epic 1 - Starter knowledge packs
FR-SC-09: Epic 1 - Built-in starter packs for common stacks
FR-SC-11: Epic 1 - Respect .gitignore and .claudeignore
FR-KS-01: Epic 1 - JSON file-based storage
FR-KS-02: Epic 1 - Per-project isolation
FR-KS-03: Epic 1 - Store task history with outcomes
FR-KS-04: Epic 1 - Store dependency graph
FR-KS-05: Epic 1 - Store pattern library
FR-KS-06: Epic 1 - Store prediction accuracy metrics
FR-KS-07: Epic 1 - Human-readable JSON format
FR-KS-08: Epic 1 - Task history capping (500 active)
FR-KS-09: Epic 1 - Archive files read-only
FR-TA-01: Epic 2 - Classify task type
FR-TA-02: Epic 2 - Classify task domain
FR-TA-03: Epic 2 - Classify task complexity
FR-TA-04: Epic 2 - Recognize non-code task types
FR-TA-05: Epic 2 - Output structured classification object
FR-FP-01: Epic 2 - Predict relevant files from task description
FR-FP-02: Epic 2 - Multi-signal sources (history, graph, keywords, co-occurrence)
FR-FP-03: Epic 2 - Output ranked file list with confidence scores
FR-FP-04: Epic 2 - Track prediction precision and recall
FR-FP-05: Epic 2 - Graceful degradation on low confidence
FR-FP-06: Epic 2 - Support code and document files
FR-MR-01: Epic 2 - Select cheapest capable model
FR-MR-02: Epic 2 - Route based on complexity, type, and history
FR-MR-03: Epic 2 - Research/docs default to Haiku
FR-MR-04: Epic 2 - Override routing on historical failure
FR-MR-05: Epic 2 - Expose routing decision to user
FR-PC-01: Epic 2 - Remove filler words and redundancy
FR-PC-02: Epic 2 - Pre-inject predicted file contents
FR-PC-03: Epic 2 - Inject known patterns and conventions
FR-PC-04: Epic 2 - Inject domain-specific context
FR-PC-05: Epic 2 - Prompt review & edit before sending
FR-PC-06: Epic 2 - Prompt edit mode (inline or $EDITOR)
FR-KL-01: Epic 3 - Capture task outcomes after each session
FR-KL-02: Epic 3 - Compare predicted vs actual files, update metrics
FR-KL-03: Epic 3 - Update dependency graph with new relationships
FR-KL-04: Epic 3 - Detect patterns (co-occurrence, affinity, conventions)
FR-KL-05: Epic 3 - Update and store new conventions
FR-KL-06: Epic 3 - Self-correcting weights (Tier 1 recovery)
FR-KL-07: Epic 3 - Stale entry decay
FR-TT-01: Epic 4 - Track tokens per task
FR-TT-02: Epic 4 - Track tokens per session
FR-TT-03: Epic 4 - Track tokens per 5-hour window
FR-TT-04: Epic 4 - Estimate tokens saved vs baseline
FR-TT-05: Epic 4 - Tiered budget warnings (75%, 90%)
FR-TT-06: Epic 4 - Display remaining budget on demand
FR-TT-07: Epic 4 - User-configurable token budget
FR-TT-08: Epic 4 - Window time estimation
FR-TT-09: Epic 4 - Configurable window duration
FR-VL-01: Epic 5 - Stats dashboard
FR-VL-02: Epic 5 - Budget display with visualization
FR-VL-03: Epic 5 - Knowledge domain inspection
FR-VL-04: Epic 5 - Dry-run mode
FR-VL-09: Epic 5 - Accuracy trends visualization
FR-VL-05: Epic 6 - Forget file command
FR-VL-06: Epic 6 - Inline post-task feedback
FR-VL-07: Epic 6 - Detailed correction mode
FR-DR-01: Epic 7 - Analyze knowledge store health
FR-DR-02: Epic 7 - Identify stale patterns
FR-DR-03: Epic 7 - Identify missing co-occurrence patterns
FR-DR-04: Epic 7 - Identify bad predictions
FR-DR-05: Epic 7 - Generate diagnostic report
FR-DR-06: Epic 7 - Propose fixes with user approval
FR-DR-07: Epic 7 - Supervised and Autonomous modes
FR-DR-08: Epic 7 - Threshold detection per domain
FR-DR-09: Epic 7 - Supervised mode user options
FR-DR-10: Epic 7 - Run diagnostics on Haiku
FR-DR-11: Epic 7 - Health score (overall + per-domain)
FR-DR-12: Epic 7 - Audit log
FR-DR-13: Epic 7 - Deep analysis mode
FR-DR-14: Epic 7 - Pre-flight checkup mode
FR-DR-15: Epic 7 - Checkup severity reporting and fix options

## Epic List

### Epic 1: Project Initialization & Scanning
Users install claude-opt, run `co init`, and get a fully scanned project with baseline intelligence from starter packs — ready for smart sessions from day one. Includes project scaffold, shared utilities, Knowledge Store I/O layer, and the full Scanner with parser extensibility and starter packs.
**FRs covered:** FR-SC-01, FR-SC-02, FR-SC-03, FR-SC-04, FR-SC-05, FR-SC-06, FR-SC-07, FR-SC-08, FR-SC-09, FR-SC-11, FR-KS-01, FR-KS-02, FR-KS-03, FR-KS-04, FR-KS-05, FR-KS-06, FR-KS-07, FR-KS-08, FR-KS-09

### Epic 2: Smart Task Execution Pipeline
Users run `co "fix the bug in auth"` and the optimizer analyzes the task, predicts relevant files, selects the cheapest capable model, compresses the prompt with context, shows it for review, and executes via Claude Code. Includes the pipeline orchestrator, all 4 processing stages (Analyzer → Predictor → Router → Compressor), the prompt review/edit UI, and the Claude Code subprocess adapter.
**FRs covered:** FR-TA-01, FR-TA-02, FR-TA-03, FR-TA-04, FR-TA-05, FR-FP-01, FR-FP-02, FR-FP-03, FR-FP-04, FR-FP-05, FR-FP-06, FR-MR-01, FR-MR-02, FR-MR-03, FR-MR-04, FR-MR-05, FR-PC-01, FR-PC-02, FR-PC-03, FR-PC-04, FR-PC-05, FR-PC-06

### Epic 3: Learning & Self-Improvement
After each task, the system captures what happened — which files were actually used, what predictions were correct — and automatically improves. Each session starts smarter than the last. Completes the learning feedback loop with post-session capture, prediction accuracy tracking, dependency graph updates, pattern detection, self-correcting weights, and stale entry decay.
**FRs covered:** FR-KL-01, FR-KL-02, FR-KL-03, FR-KL-04, FR-KL-05, FR-KL-06, FR-KL-07

### Epic 4: Token Budget & Window Management
Users see exactly how many tokens each task costs, how much they've saved vs raw Claude, and how much budget remains in their 5-hour window — with warnings before running out. Per-task, per-session, and per-window tracking with configurable budget and window duration.
**FRs covered:** FR-TT-01, FR-TT-02, FR-TT-03, FR-TT-04, FR-TT-05, FR-TT-06, FR-TT-07, FR-TT-08, FR-TT-09

### Epic 5: Visibility & Insights Dashboard
Users inspect what the system knows via `co stats`, `co budget`, `co knowledge <domain>`, and `co --dry-run`. Full transparency into predictions, accuracy, and savings trends. Trust-building for skeptical users.
**FRs covered:** FR-VL-01, FR-VL-02, FR-VL-03, FR-VL-04, FR-VL-09

### Epic 6: User Feedback & Manual Correction
Users tell the system when it's wrong — inline quick feedback after each task, `co forget <file>` to remove bad predictions, and `co correct` for detailed corrections. Delivers Tier 3 (manual) recovery with low-friction feedback flow.
**FRs covered:** FR-VL-05, FR-VL-06, FR-VL-07

### Epic 7: Doctor Agent & Automated Recovery
When predictions degrade, users run `co doctor` and an AI diagnostic agent analyzes the knowledge store, finds stale patterns, missing co-occurrences, and bad predictions — proposing fixes for approval. Pre-flight `co doctor --checkup` validates setup. Supervised (default) and Autonomous (opt-in) modes with full audit logging.
**FRs covered:** FR-DR-01, FR-DR-02, FR-DR-03, FR-DR-04, FR-DR-05, FR-DR-06, FR-DR-07, FR-DR-08, FR-DR-09, FR-DR-10, FR-DR-11, FR-DR-12, FR-DR-13, FR-DR-14, FR-DR-15

---

## Epic 1: Project Initialization & Scanning

Users install claude-opt, run `co init`, and get a fully scanned project with baseline intelligence from starter packs — ready for smart sessions from day one. Includes project scaffold, shared utilities, Knowledge Store I/O layer, and the full Scanner with parser extensibility and starter packs.

### Story 1.1: Project Scaffold & Core Utilities

As a developer,
I want to install claude-opt globally via npm and have a working CLI skeleton with shared utilities,
So that the tool is available on my system as the foundation for all optimizer features.

**Acceptance Criteria:**

**Given** a developer runs `npm install -g claude-opt`
**When** the installation completes
**Then** both `claude-opt` and `co` commands are available globally
**And** `co --version` displays the current package version
**And** `co --help` displays available commands and usage

**Given** the project source code
**When** building with `npm run build` (tsup)
**Then** a CJS bundle is produced in `dist/` with source maps and type declarations
**And** TypeScript strict mode passes with zero errors

**Given** any module in the codebase
**When** it needs cross-platform file path handling
**Then** `utils/paths.ts` provides `toInternal(osPath)` and `toOS(posixPath)` functions
**And** all internal data structures store POSIX-format paths

**Given** any pipeline stage function
**When** it is wrapped with `withFailOpen(stageFn, fallback)` from `utils/errors.ts`
**Then** any thrown error is caught, logged via `utils/logger.ts`, and the fallback value is returned
**And** the pipeline continues execution without crashing

**Given** the shared types directory `src/types/`
**When** imported by any module
**Then** it exports `PipelineContext`, `Result<T>`, `TaskType`, `Complexity`, and common type definitions
**And** `Result<T>` follows the pattern `{ ok: true; value: T } | { ok: false; error: string }`

**Given** the logger utility
**When** used by any module
**Then** it supports `debug`, `info`, `warn`, `error` levels with structured output
**And** `--verbose` flag enables debug-level output
**And** `--quiet` flag suppresses info-level output
**And** errors are always logged regardless of verbosity

### Story 1.2: Knowledge Store I/O Layer

As a developer,
I want project knowledge persisted in human-readable JSON files with reliable atomic writes,
So that the optimizer remembers data between sessions and I can inspect or edit the store directly.

**Acceptance Criteria:**

**Given** a project with claude-opt initialized
**When** the store module initializes
**Then** a `.claude-opt/` directory is created in the project root
**And** it contains separate JSON files: config.json, project-map.json, dependency-graph.json, task-history.json, patterns.json, metrics.json, keyword-index.json, doctor-log.json, and .schema-version

**Given** any module calls a store write function (e.g., `writeTaskHistory(data)`)
**When** the write executes
**Then** data is written to a `.tmp` file first, then atomically renamed to the target file
**And** the JSON is formatted with 2-space indentation for human readability
**And** the write completes in <50ms

**Given** any module calls a store read function (e.g., `readProjectMap()`)
**When** the read executes
**Then** the JSON file is parsed and validated using a type guard (e.g., `isProjectMap()`)
**And** if validation fails, a `Result` with `ok: false` is returned (fail-open, no throw)
**And** the read completes in <50ms

**Given** the task-history.json file has reached 500 entries
**When** a new task entry is added
**Then** the oldest entries beyond 500 are moved to `.claude-opt/archive/task-history-{date}.json`
**And** archive files are read-only during normal operation

**Given** the `.schema-version` file shows an older version than the installed package
**When** the store module initializes
**Then** sequential non-destructive migrations run (adding fields with defaults, never removing)
**And** `.schema-version` is updated to the current version
**And** no knowledge data is lost during migration

**Given** different modules access the store
**When** pipeline stages (analyzer, predictor, router, compressor) call store functions
**Then** only read-only accessors are available to them
**And** write accessors are only available to learner, tracker, doctor, and scanner modules

**Given** a project's `.claude-opt/` directory
**When** a different project initializes claude-opt
**Then** it gets its own separate `.claude-opt/` directory with isolated data

### Story 1.3: Project Scanner & File Map Generation

As a developer,
I want to scan my project and generate a complete file map with metadata,
So that the optimizer knows what files exist in my project and can classify them by type and domain.

**Acceptance Criteria:**

**Given** a developer runs `co init` on a code project (e.g., TypeScript/Node)
**When** the scanner processes the project directory
**Then** a project-map.json is generated containing every non-ignored file
**And** each file entry includes: relative path (POSIX format), file type, size in bytes, last modified timestamp, and domain classification

**Given** a developer runs `co init` on a non-code project (e.g., markdown research files)
**When** the scanner processes the project directory
**Then** markdown files, text files, and document files are included in the project map
**And** the project is classified as "research/docs" type

**Given** a project with mixed code and documentation
**When** the scanner auto-detects the project type
**Then** it correctly classifies the project as "code", "research/docs", or "mixed"
**And** the scanning strategy adjusts accordingly (import parsing for code, heading parsing for docs)

**Given** a project with a `.gitignore` file listing `node_modules/` and `dist/`
**When** the scanner runs
**Then** files matching `.gitignore` patterns are excluded from the project map
**And** files matching `.claudeignore` patterns (if the file exists) are also excluded

**Given** a project with up to 500 files
**When** a cold scan runs
**Then** the scan completes in <10 seconds
**And** the project-map.json is written to `.claude-opt/` via the store module

### Story 1.4: Import Parsers & Dependency Graph

As a developer,
I want the optimizer to understand file relationships through import analysis and keyword extraction,
So that it can predict related files and traverse the dependency graph when I describe a task.

**Acceptance Criteria:**

**Given** a TypeScript/JavaScript project
**When** the import parser processes source files
**Then** all `import` and `require` statements are parsed
**And** resolved to relative file paths within the project
**And** external package imports are identified but not included in the dependency graph

**Given** a markdown-heavy project (research, thesis, documentation)
**When** the markdown parser processes `.md` files
**Then** heading structure (H1, H2+) is extracted
**And** internal links (`[text](path)`) and reference-style links are parsed
**And** cross-document references are identified as dependency edges

**Given** a new language parser needs to be added (e.g., Python)
**When** a contributor implements the `ImportParser` interface
**Then** they only need to create one file in `src/scanner/parsers/`
**And** register it in the parser registry
**And** the scanner automatically uses it for matching file extensions

**Given** parsed imports from all files
**When** the dependency graph builder runs
**Then** a directed graph is created with edges from importing file to imported file
**And** the graph is stored as adjacency lists in dependency-graph.json via the store module

**Given** the keyword extractor runs on project files
**When** processing file content and file names
**Then** meaningful keywords are extracted (identifiers, function names, class names, heading text)
**And** a bidirectional keyword-to-file index is stored in keyword-index.json via the store module

### Story 1.5: CLAUDE.md Generation & Incremental Scanning

As a developer,
I want the optimizer to auto-generate a CLAUDE.md with discovered conventions and support fast re-scans,
So that Claude Code starts each session with project context and I don't wait for full re-scans after small changes.

**Acceptance Criteria:**

**Given** a project has been scanned
**When** the CLAUDE.md generator runs
**Then** a CLAUDE.md file is created (or updated) in the project root
**And** it includes: project structure summary, detected conventions (naming, patterns), key file locations, and domain organization
**And** existing manual content in CLAUDE.md is preserved (optimizer appends to a marked section)

**Given** a previously scanned project where 3 files have changed
**When** `co scan` (or implicit re-scan) runs
**Then** only the 3 changed files are re-processed (detected via content hashing)
**And** unchanged files are skipped entirely
**And** the project map, dependency graph, and keyword index are updated incrementally

**Given** a project with 500 files where 5 files changed
**When** incremental re-scan runs
**Then** the scan completes in <2 seconds
**And** the project map reflects the current state of all files

**Given** a file has been deleted from the project
**When** incremental re-scan runs
**Then** the file is removed from the project map, dependency graph, and keyword index
**And** no orphan references remain in the knowledge store

### Story 1.6: Starter Knowledge Packs & Init Command

As a developer,
I want to run `co init` and get baseline intelligence for my project stack from day one,
So that file predictions are useful from my very first optimized session without waiting for learning.

**Acceptance Criteria:**

**Given** a developer runs `co init` on a TypeScript/Node project
**When** the starter pack detector analyzes the project (package.json, file extensions, structure)
**Then** the project stack is identified as "typescript-node"
**And** the typescript-node.json starter pack is loaded into the knowledge store
**And** common patterns are seeded (e.g., test files co-located, package.json always relevant, src/ structure)

**Given** a developer runs `co init` on a React project
**When** the starter pack detector finds React dependencies and component files
**Then** the react.json starter pack is loaded
**And** React-specific patterns are seeded (component/test/style co-occurrence, hooks patterns)

**Given** a developer runs `co init` on a markdown-heavy research project
**When** the starter pack detector finds primarily .md files with heading structure
**Then** the research-markdown.json starter pack is loaded
**And** document patterns are seeded (chapter structure, reference co-occurrence)

**Given** built-in starter packs exist for TypeScript/Node, React, Python, and Research/Markdown
**When** a project doesn't match any built-in pack
**Then** initialization proceeds without a starter pack
**And** the optimizer falls back to learning from scratch (graceful degradation)

**Given** a developer runs `co init` for the first time
**When** the full initialization flow executes
**Then** the sequence is: create `.claude-opt/` → scan project → build file map → parse imports → build dependency graph → extract keywords → detect stack → load starter pack → generate CLAUDE.md
**And** the user sees progress output for each stage
**And** the final output shows: files scanned, dependency edges found, starter pack loaded (if any), and "Ready! Run `co doctor --checkup` to verify setup"

**Given** `co init` has already been run on a project
**When** the developer runs `co init` again
**Then** the user is prompted: "Project already initialized. Re-scan? [Y/n]"
**And** if yes, an incremental re-scan runs (not a full reset)
**And** existing knowledge store data (task history, patterns, metrics) is preserved

---

## Epic 2: Smart Task Execution Pipeline

Users run `co "fix the bug in auth"` and the optimizer analyzes the task, predicts relevant files, selects the cheapest capable model, compresses the prompt with context, shows it for review, and executes via Claude Code. Includes the pipeline orchestrator, all 4 processing stages (Analyzer → Predictor → Router → Compressor), the prompt review/edit UI, and the Claude Code subprocess adapter.

### Story 2.1: Pipeline Orchestrator & Task Analyzer

As a developer,
I want to run `co "my task"` and have it automatically classified by type, domain, and complexity,
So that the optimizer can make intelligent decisions about file predictions and model routing.

**Acceptance Criteria:**

**Given** a developer runs `co "fix the dropdown z-index bug in UserMenu"`
**When** the pipeline orchestrator starts
**Then** it initializes a PipelineContext with the user's prompt
**And** calls each pipeline stage sequentially: Analyzer → Predictor → Router → Compressor → [Review] → Adapter
**And** each stage is wrapped with `withFailOpen()` so a failure in any stage falls through gracefully

**Given** a task prompt containing bug-related keywords ("fix", "bug", "broken", "error")
**When** the Task Analyzer classifies the task
**Then** the task type is classified as `bugfix`
**And** the output is a structured `ClassificationResult`: `{ type, domain, complexity, confidence }`
**And** classification completes in <100ms

**Given** a task prompt like "add dark mode to settings panel"
**When** the Task Analyzer classifies the task
**Then** the task type is classified as `feature`
**And** the domain is mapped to the relevant project domain based on keyword matching against the project map

**Given** a task prompt like "explain how the auth middleware works"
**When** the Task Analyzer classifies the task
**Then** the task type is classified as `research` or `learning`
**And** complexity is classified as `simple` (research tasks default lower)

**Given** a non-code task prompt like "restructure chapter 3 of the thesis"
**When** the Task Analyzer classifies the task
**Then** the task type is classified as `documentation` or `writing`
**And** non-code task types are recognized correctly (literature review, writing, thesis structuring, concept exploration)

**Given** the Task Analyzer fails with an unexpected error
**When** `withFailOpen()` catches the error
**Then** a default classification is returned (`{ type: 'unknown', domain: 'general', complexity: 'medium', confidence: 0 }`)
**And** the pipeline continues to the next stage
**And** the error is logged for Doctor analysis

### Story 2.2: File Predictor — Multi-Signal Scoring

As a developer,
I want the optimizer to predict which files are relevant to my task,
So that Claude starts with the right context and doesn't waste tokens exploring.

**Acceptance Criteria:**

**Given** a classified task and the project's knowledge store
**When** the File Predictor runs
**Then** it combines 4 signal sources with configurable weights:
**And** (1) Task history similarity — keyword overlap with past tasks' actual files
**And** (2) Dependency graph traversal — files connected to keyword-matched files
**And** (3) Keyword index lookup — direct keyword→file mapping
**And** (4) Pattern co-occurrence boosting — if file A predicted, boost co-occurring file B
**And** prediction completes in <200ms

**Given** the File Predictor produces results
**When** scoring is complete
**Then** each candidate file has a composite confidence score between 0.0 and 1.0
**And** files are returned as a ranked list sorted by confidence (highest first)
**And** files below the confidence threshold are excluded from the prediction

**Given** the optimizer is on session 1 (cold start) with no task history
**When** the File Predictor runs
**Then** it relies on keyword index, dependency graph, and starter pack patterns
**And** still produces reasonable predictions (>50% precision target within 5 sessions)

**Given** prediction confidence is low (all candidates below threshold)
**When** the File Predictor applies graceful degradation
**Then** it predicts fewer files (or none) rather than including bad predictions
**And** the session is never made worse than raw Claude Code without the optimizer

**Given** a task involving both code files and document files
**When** the File Predictor runs
**Then** both code files (.ts, .js, etc.) and document files (.md, .txt) are considered
**And** the prediction is not biased toward one file type

**Given** the File Predictor tracks accuracy
**When** a prediction is made
**Then** the predicted file list is stored for later comparison with actually-used files
**And** precision and recall metrics are tracked per task, per domain, and overall

### Story 2.3: Model Router

As a developer,
I want the optimizer to automatically select the cheapest Claude model that can handle my task,
So that I save tokens on simple tasks and only use expensive models when necessary.

**Acceptance Criteria:**

**Given** a task classified as `bugfix` with complexity `simple`
**When** the Model Router selects a model
**Then** it routes to Haiku (cheapest model)
**And** the routing decision and rationale are included in the RoutingResult
**And** the routing decision completes in <50ms

**Given** a task classified as `feature` with complexity `complex`
**When** the Model Router selects a model
**Then** it routes to Sonnet or Opus based on complexity signals
**And** the escalation path is Haiku → Sonnet → Opus

**Given** a task classified as `research`, `learning`, or `documentation`
**When** the Model Router selects a model
**Then** it defaults to Haiku unless historical data shows Haiku failed on similar tasks

**Given** historical data shows Haiku failed on a similar task type+domain combination
**When** the Model Router evaluates routing
**Then** it overrides the default and escalates to Sonnet
**And** the override reason is logged in the RoutingResult for transparency

**Given** the Model Router produces a result
**When** displayed to the user
**Then** the selected model name and the rationale are shown (e.g., "Routing to Haiku: simple bugfix, Haiku succeeded on 4/4 similar tasks")

### Story 2.4: Prompt Compressor & Context Injection

As a developer,
I want my prompt optimized with relevant context injected automatically,
So that Claude receives a concise, information-rich prompt that minimizes wasted tokens.

**Acceptance Criteria:**

**Given** a user prompt with filler words and redundant phrasing
**When** the Prompt Compressor processes the prompt
**Then** filler words and unnecessary context are removed
**And** the semantic meaning of the user's request is never altered
**And** compression completes in <100ms

**Given** the File Predictor identified 5 relevant files
**When** the Prompt Compressor builds the optimized prompt
**Then** predicted file contents or summaries are pre-injected into the prompt context
**And** files are prioritized by prediction confidence score

**Given** the knowledge store contains patterns and conventions (e.g., "test files use .test.ts suffix", "components use PascalCase")
**When** the Prompt Compressor builds the optimized prompt
**Then** relevant patterns and conventions are injected into the prompt context

**Given** the knowledge store contains domain-specific context (e.g., "Chapter 3 uses APA formatting", "auth module uses JWT tokens")
**When** the task domain matches stored context
**Then** domain-specific context is injected into the prompt

**Given** the Prompt Compressor produces an optimized prompt
**When** the prompt is assembled
**Then** it includes: compressed user request + predicted file context + conventions + domain context
**And** the total prompt is structured for maximum Claude comprehension

### Story 2.5: Prompt Review UI & Edit Mode

As a developer,
I want to see the optimized prompt before it's sent to Claude and optionally edit it,
So that I always know exactly what's being sent and can make adjustments when needed.

**Acceptance Criteria:**

**Given** the Prompt Compressor has generated an optimized prompt
**When** the prompt review step activates
**Then** the full optimized prompt is displayed in the terminal with clear formatting
**And** the display shows: original prompt, injected context, predicted files, selected model, and routing rationale

**Given** the prompt is displayed for review
**When** the user presses Enter (or equivalent confirmation)
**Then** the prompt is sent to Claude Code as-is
**And** execution proceeds to the Adapter stage

**Given** the prompt is displayed for review
**When** the user selects [e] edit
**Then** the prompt opens for inline editing in the terminal or in the user's `$EDITOR`
**And** the edited prompt replaces the generated one for this task only
**And** the edit does not affect future prompt generation

**Given** the prompt is displayed for review
**When** the user selects [c] cancel
**Then** the task is aborted without sending anything to Claude Code
**And** no tokens are consumed
**And** no task history entry is created

### Story 2.6: Claude Code Adapter & Task Execution

As a developer,
I want the optimizer to execute my task through Claude Code and detect which files were used,
So that the learning loop has accurate data about what actually happened during the session.

**Acceptance Criteria:**

**Given** the user has approved the optimized prompt
**When** the Adapter executes the task
**Then** it generates an optimized CLAUDE.md with predicted files and conventions
**And** spawns Claude Code as a subprocess: `child_process.spawn('claude', [optimizedPrompt], { cwd: projectRoot })`
**And** captures stdout and stderr from the subprocess

**Given** Claude Code completes execution
**When** the Adapter processes the result
**Then** it returns an `AdapterResult`: `{ output, filesUsed, exitCode, tokenEstimate }`
**And** `filesUsed` is detected via a hybrid approach: file modification timestamps before/after execution + parsing file path references from stdout

**Given** the Claude Code subprocess fails or crashes
**When** the Adapter encounters an error
**Then** it falls back to raw Claude Code execution (no optimization applied)
**And** returns a fallback AdapterResult with a special exit code (e.g., 10) indicating fallback mode
**And** the error is logged for Doctor analysis
**And** the user's task still completes — the optimizer never blocks work

**Given** the Adapter needs to detect the installed Claude Code version
**When** it initializes
**Then** it checks for Claude Code CLI availability and version
**And** handles CLI interface differences gracefully between versions
**And** if Claude Code is not installed, shows a clear error message and exits

---

## Epic 3: Learning & Self-Improvement

After each task, the system captures what happened — which files were actually used, what predictions were correct — and automatically improves. Each session starts smarter than the last. Completes the learning feedback loop with post-session capture, prediction accuracy tracking, dependency graph updates, pattern detection, self-correcting weights, and stale entry decay.

### Story 3.1: Post-Task Outcome Capture & Accuracy Tracking

As a developer,
I want the optimizer to capture what actually happened after each task and compare it to predictions,
So that the system builds accurate learning data and tracks how well it's performing.

**Acceptance Criteria:**

**Given** a task has completed through the Claude Code Adapter
**When** the Knowledge Learner captures the outcome
**Then** it records: files actually used (from AdapterResult.filesUsed), model used, task classification, success/failure signal, and token estimate
**And** the outcome is appended to task-history.json via the store module
**And** capture completes in <500ms

**Given** the File Predictor predicted files [A, B, C] and Claude actually used files [B, C, D]
**When** the accuracy comparison runs
**Then** precision is calculated: 2/3 = 66.7% (predicted files that were actually needed)
**And** recall is calculated: 2/3 = 66.7% (needed files that were correctly predicted)
**And** per-task metrics are stored in the task history entry

**Given** multiple tasks have been completed
**When** accuracy metrics are aggregated
**Then** metrics are tracked at three levels: per-task, per-domain, and overall
**And** metrics.json is updated with the latest aggregated accuracy data
**And** domain-specific accuracy allows targeted improvement analysis

**Given** the Learner encounters an error during capture
**When** `withFailOpen()` catches the error
**Then** the task still completes successfully — learning failure never blocks the user
**And** the error is logged for later Doctor analysis

### Story 3.2: Dependency Graph Updates & Pattern Detection

As a developer,
I want the optimizer to discover new file relationships and patterns from each task,
So that predictions improve through real usage data, not just static analysis.

**Acceptance Criteria:**

**Given** Claude used files [B, C, D] during a task but the dependency graph had no edge between C and D
**When** the Learner updates the dependency graph
**Then** a new edge is added between C and D (discovered co-usage relationship)
**And** dependency-graph.json is updated via the store module
**And** the new edge has a lower initial weight than statically-discovered edges (import-based)

**Given** files [auth.ts, middleware.ts] appear together in 5+ task outcomes
**When** the pattern detector runs
**Then** a co-occurrence pattern is detected and stored in patterns.json
**And** the pattern includes: file pair, occurrence count, and confidence score
**And** the File Predictor can use this pattern for co-occurrence boosting in future tasks

**Given** tasks of type `bugfix` consistently use files in the `tests/` directory
**When** the pattern detector analyzes task-type-to-file affinity
**Then** a type-file affinity pattern is detected (bugfix → test files)
**And** future bugfix tasks will have test files boosted in predictions

**Given** Claude consistently follows a convention (e.g., "imports use .js extension", "components use default exports")
**When** the Learner detects recurring conventions across tasks
**Then** new conventions are stored in the patterns.json conventions section
**And** the Prompt Compressor can inject these conventions in future sessions

### Story 3.3: Self-Correcting Weights & Stale Decay

As a developer,
I want prediction weights to automatically adjust based on accuracy feedback,
So that the system self-corrects without requiring manual intervention.

**Acceptance Criteria:**

**Given** a file was predicted with high confidence and was actually used
**When** the weight correction runs after the task
**Then** the file's prediction weight is boosted (positive reinforcement)
**And** the boost magnitude is proportional to the prediction confidence

**Given** a file was predicted with high confidence but was NOT used
**When** the weight correction runs after the task
**Then** the file's prediction weight is decayed (negative reinforcement)
**And** the decay is gradual — a single miss doesn't eliminate a file from predictions

**Given** a file/pattern appeared frequently in historical tasks but hasn't appeared in the last N sessions
**When** the stale entry decay runs
**Then** its weight is gradually reduced over time
**And** files not seen in recent sessions become less likely to be predicted
**And** fully stale entries (weight near zero) are flagged for potential Doctor analysis

**Given** the self-correcting weight system operates
**When** a user runs 10+ tasks over multiple sessions
**Then** prediction precision measurably improves over time
**And** the weight adjustments are transparent — stored in patterns.json with evidence counts

---

## Epic 4: Token Budget & Window Management

Users see exactly how many tokens each task costs, how much they've saved vs raw Claude, and how much budget remains in their 5-hour window — with warnings before running out. Per-task, per-session, and per-window tracking with configurable budget and window duration.

### Story 4.1: Token Usage Tracking & Savings Estimation

As a developer,
I want to know how many tokens each task costs and how much the optimizer is saving me,
So that I can make informed decisions about my token budget and see the optimizer's value.

**Acceptance Criteria:**

**Given** a task completes through the pipeline
**When** the Token Tracker records usage
**Then** it stores the token estimate for that individual task in the task history
**And** tracking overhead is <10ms per task

**Given** multiple tasks have been run in the current session
**When** the Token Tracker aggregates session usage
**Then** total tokens consumed across all tasks in the session are calculated
**And** the session total is stored in metrics.json

**Given** the user is on a 5-hour window budget (default: 44,000 tokens)
**When** the Token Tracker updates the window total
**Then** tokens consumed across all sessions within the current 5-hour window are tracked
**And** the window start time is recorded for reset calculation

**Given** a task completed with optimization (predicted files, compressed prompt)
**When** the Token Tracker estimates savings
**Then** it calculates estimated unoptimized cost (what it would have cost without the optimizer)
**And** the savings estimate is: unoptimized_estimate - actual_tokens_used
**And** both values are stored for dashboard display

### Story 4.2: Budget Warnings, Window Estimation & Configuration

As a developer,
I want warnings when I'm approaching my token budget and the ability to configure my limits,
So that I never unexpectedly hit the token wall and can adapt settings to my plan.

**Acceptance Criteria:**

**Given** the user has consumed 75% of their window budget (33,000 of 44,000 default)
**When** a new task is about to be sent
**Then** an inline warning is displayed: "⚠ 75% budget used — 11,000 tokens remaining"
**And** the task proceeds without interruption

**Given** the user has consumed 90% of their window budget (39,600 of 44,000 default)
**When** a new task is about to be sent
**Then** a blocking prompt is displayed: "You're at 90% budget. Continue? [Y/n]"
**And** the task only proceeds if the user confirms
**And** warning thresholds (75%, 90%) are configurable

**Given** the user runs `co budget`
**When** the command displays budget status
**Then** it shows: tokens used, tokens remaining, percentage used, projected runway (estimated tasks remaining)
**And** it shows time remaining until the next window reset

**Given** the user wants to change the token budget
**When** they run `co config budget 60000`
**Then** the budget is updated in config.json
**And** all future window tracking uses the new budget value

**Given** the user wants to change the window duration
**When** they run `co config window-duration 3h` (or equivalent)
**Then** the window duration is updated in config.json (default: 5 hours / 18,000,000ms)
**And** window reset calculations use the new duration

**Given** the current 5-hour window has expired
**When** the Token Tracker checks window status
**Then** the window budget resets to full
**And** the new window start time is recorded

---

## Epic 5: Visibility & Insights Dashboard

Users inspect what the system knows via `co stats`, `co budget`, `co knowledge <domain>`, and `co --dry-run`. Full transparency into predictions, accuracy, and savings trends. Trust-building for skeptical users.

### Story 5.1: Stats Dashboard & Budget Display

As a developer,
I want to see a clear dashboard of my session stats and budget status,
So that I can track the optimizer's performance and manage my token spending.

**Acceptance Criteria:**

**Given** a developer runs `co stats`
**When** the stats dashboard renders
**Then** it displays: tasks completed (this session and total), prediction accuracy (precision and recall), tokens used (session and window), estimated tokens saved, and model routing breakdown
**And** output uses clean terminal formatting with Chalk (boxes, color-coded metrics)
**And** all commands produce clean, readable terminal output

**Given** a developer runs `co budget`
**When** the budget display renders
**Then** it shows: remaining window budget (tokens), percentage used with visual bar, projected runway (estimated tasks remaining based on average cost), time remaining until window reset, and usage trend
**And** budget information matches the Token Tracker's current data

**Given** the user has no task history yet (first session)
**When** they run `co stats` or `co budget`
**Then** a helpful message is shown: "No tasks completed yet. Run your first task with `co \"your task\"`"
**And** the command does not crash or show empty data

### Story 5.2: Knowledge Inspection, Dry-Run & Trends

As a developer,
I want to inspect what the optimizer knows about specific domains and preview its analysis without executing,
So that I can understand the system's intelligence, verify predictions, and build trust.

**Acceptance Criteria:**

**Given** a developer runs `co knowledge auth` (or any domain name)
**When** the knowledge display renders
**Then** it shows: files mapped to the "auth" domain, patterns detected (co-occurrences, conventions), prediction accuracy for this domain, and task history count for this domain
**And** if the domain doesn't exist, a helpful message lists available domains

**Given** a developer runs `co --dry-run "add dark mode to settings panel"`
**When** the dry-run analysis completes
**Then** the full optimizer analysis is displayed without executing: task classification (type, domain, complexity), predicted files with confidence scores, selected model with routing rationale, and the compressed/optimized prompt
**And** no subprocess is spawned, no tokens are consumed, no task history entry is created

**Given** a developer has completed 20+ tasks
**When** they run `co stats --trends` (or accuracy trends are shown in stats)
**Then** prediction accuracy over time is visualized (improving trend line)
**And** token savings over time are visualized (cumulative savings)
**And** per-domain accuracy breakdown is shown

---

## Epic 6: User Feedback & Manual Correction

Users tell the system when it's wrong — inline quick feedback after each task, `co forget <file>` to remove bad predictions, and `co correct` for detailed corrections. Delivers Tier 3 (manual) recovery with low-friction feedback flow.

### Story 6.1: Inline Feedback & Forget Command

As a developer,
I want to quickly signal whether a task went well and remove bad files from predictions,
So that the system learns faster from my corrections with minimal effort.

**Acceptance Criteria:**

**Given** a task has completed successfully
**When** the inline feedback prompt appears
**Then** it shows: `[👍 Good] [👎 Bad] [→ Skip]`
**And** the prompt is non-blocking — user can skip with Enter or the Skip option

**Given** the user selects 👎 Bad
**When** the feedback expands
**Then** quick options are shown: `[1] Missed files [2] Wrong files predicted [3] Wrong model [4] Describe...`
**And** the selected feedback type and any details are stored in the task history entry
**And** the feedback is used by the Knowledge Learner to adjust weights

**Given** the user selects 👍 Good or → Skip
**When** feedback is recorded
**Then** Good reinforces current predictions positively
**And** Skip records no feedback signal (neutral)
**And** feedback capture is near-instant with no delay to the user

**Given** a developer runs `co forget src/old-middleware.ts`
**When** the forget command executes
**Then** the specified file is removed from prediction consideration in the knowledge store
**And** its weight is zeroed in patterns.json
**And** confirmation is shown: "Removed src/old-middleware.ts from predictions"
**And** the file still exists in the project map (only prediction weight is affected)

### Story 6.2: Detailed Correction Mode

As a developer,
I want a detailed way to tell the optimizer what went wrong and correct its behavior,
So that I can provide rich feedback for faster, more precise learning improvement.

**Acceptance Criteria:**

**Given** a developer runs `co correct`
**When** the correction mode activates
**Then** it shows the most recent task's predictions and outcome
**And** prompts for detailed feedback: "What went wrong?"
**And** allows the user to: describe the issue in free text, flag specific files that should/shouldn't have been predicted, correct the model choice, and add missing conventions

**Given** the user provides detailed correction feedback
**When** the feedback is processed
**Then** specific file corrections are applied to prediction weights immediately
**And** model corrections inform future routing decisions
**And** convention additions are stored in patterns.json
**And** all corrections are logged as manual interventions in the task history

**Given** the user runs `co correct` with no recent task
**When** the command checks for context
**Then** a helpful message is shown: "No recent task to correct. Run a task first."

---

## Epic 7: Doctor Agent & Automated Recovery

When predictions degrade, users run `co doctor` and an AI diagnostic agent analyzes the knowledge store, finds stale patterns, missing co-occurrences, and bad predictions — proposing fixes for approval. Pre-flight `co doctor --checkup` validates setup. Supervised (default) and Autonomous (opt-in) modes with full audit logging.

### Story 7.1: Pre-Flight Checkup

As a developer,
I want to verify my optimizer setup is healthy after initialization,
So that I can catch configuration issues before running my first optimized task.

**Acceptance Criteria:**

**Given** a developer runs `co doctor --checkup` after `co init`
**When** the checkup runs
**Then** it validates: all knowledge store JSON files exist and are valid, project map is populated and complete, dependency graph has edges (for code projects), keyword index is populated, starter pack was loaded (if applicable), config.json has valid settings, and .schema-version matches installed version
**And** the checkup costs zero tokens (all validation is local)

**Given** the checkup finds issues
**When** results are displayed
**Then** each issue has a severity level (critical, warning, info)
**And** for each issue, options are presented: [auto-fix] / [continue anyway] / [fix manually]
**And** critical issues recommend fixing before first task

**Given** the checkup finds no issues
**When** results are displayed
**Then** a readiness score is shown (e.g., "Setup health: 100% — Ready to go!")
**And** the user is directed: "Run your first task with `co \"your task\"`"

**Given** `co doctor --checkup` is run on a project without `co init`
**When** the checkup detects missing `.claude-opt/` directory
**Then** a clear message is shown: "Project not initialized. Run `co init` first."

### Story 7.2: Diagnostic Engine & Report Generation

As a developer,
I want the Doctor to analyze my knowledge store and identify specific problems,
So that I understand why predictions might be degrading and what can be fixed.

**Acceptance Criteria:**

**Given** a developer runs `co doctor`
**When** the diagnostic engine analyzes the knowledge store
**Then** it checks for: stale patterns (high historical frequency but absent in recent sessions), missing co-occurrence patterns (files that consistently appear together but have no formal pattern), and bad predictions (files consistently predicted but never used)
**And** each finding includes: finding type, affected files/patterns, evidence (data that led to the finding), and a recommended fix

**Given** the diagnostic engine completes analysis
**When** the report is generated
**Then** it includes: overall health score (0-100), per-domain health breakdown, list of findings sorted by severity, and recommended actions for each finding

**Given** the knowledge store is healthy with no issues
**When** the diagnostic report is generated
**Then** a positive health report is shown: "Knowledge store health: 95/100 — No issues found"
**And** per-domain scores are displayed

**Given** the knowledge store has sparse data (e.g., <10 tasks)
**When** the diagnostic engine runs
**Then** it accounts for limited data and doesn't over-diagnose
**And** findings note "limited data — accuracy may improve with more tasks"

### Story 7.3: Supervised Mode & Fix Application

As a developer,
I want the Doctor to alert me when predictions degrade and propose fixes for my approval,
So that knowledge store repairs happen with my oversight and consent.

**Acceptance Criteria:**

**Given** Doctor is in Supervised mode (default)
**When** prediction accuracy drops below the threshold (default: 60%) for any domain
**Then** the user is alerted: "⚠ Prediction accuracy for [domain] dropped to [X]%. Run `co doctor` to diagnose?"
**And** the alert waits for user acknowledgement before proceeding

**Given** the user chooses "Let Doctor diagnose" from the alert
**When** diagnostics run
**Then** the diagnostic engine runs and generates a report
**And** for each finding, the Doctor proposes a specific fix with an explanation
**And** the user must approve each fix before it is applied: "[Apply] [Skip] [Apply All]"

**Given** the Doctor proposes to add a missing co-occurrence pattern
**When** the user approves the fix
**Then** the pattern is added to patterns.json with the Doctor's evidence
**And** prediction accuracy should improve for related tasks

**Given** Doctor diagnostics run
**When** they interact with Claude Code
**Then** all diagnostic inference is sent requesting Haiku model to minimize token cost
**And** a typical Doctor session costs <500 tokens

**Given** the user chooses "Handle manually" or "Dismiss"
**When** the alert is acknowledged
**Then** the Doctor does not run diagnostics
**And** the user is reminded they can run `co doctor` anytime

### Story 7.4: Autonomous Mode, Deep Analysis & Audit Logging

As a developer,
I want an opt-in autonomous Doctor mode and full audit trail of all Doctor actions,
So that routine fixes happen automatically while I maintain visibility and control.

**Acceptance Criteria:**

**Given** the user configures Doctor to Autonomous mode via `co config doctor-mode autonomous`
**When** prediction accuracy drops below the threshold for any domain
**Then** the Doctor automatically runs diagnostics without waiting for user acknowledgement
**And** low-risk fixes are auto-applied (e.g., adding co-occurrence patterns, removing stale entries)
**And** medium/high-risk fixes still require user approval even in autonomous mode

**Given** the Doctor (in either mode) determines diagnosis is severe or insufficient recent data
**When** it needs deeper analysis
**Then** it asks the user for permission to analyze archived task history: "Need to analyze archived history for deeper patterns. Proceed? This may use more tokens."
**And** deep analysis only runs with explicit user permission
**And** the user is warned about potential additional token cost

**Given** the Doctor takes any action (finding, diagnosis, fix applied, fix skipped)
**When** the action occurs
**Then** it is logged to `.claude-opt/doctor-log.json` with: finding details, action taken, timestamp, mode (supervised/autonomous), and whether the fix was auto-applied or user-approved
**And** the audit log is append-only and never truncated

**Given** the user wants to review Doctor history
**When** they inspect `.claude-opt/doctor-log.json`
**Then** the log is human-readable JSON with clear entries
**And** full transparency into every Doctor action is maintained
