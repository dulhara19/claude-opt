---
stepsCompleted: ['step-01-init', 'step-02-discovery', 'step-02b-vision', 'step-02c-executive-summary', 'step-03-success', 'step-04-user-journeys', 'step-05-domain-requirements', 'step-06-technical-constraints', 'step-07-data-model', 'step-08-cli-interface', 'step-09-risk-analysis', 'step-10-implementation-phasing', 'step-11-open-questions']
inputDocuments: ['claude-token-optimizer-knowledge.md']
workflowType: 'prd'
documentCounts:
  briefs: 0
  research: 0
  brainstorming: 0
  projectDocs: 0
  knowledge: 1
classification:
  projectType: cli_tool
  domain: developer_tools_ai_productivity
  complexity: medium
  projectContext: greenfield
---

# Product Requirements Document - claude_optimizer

**Author:** Dulhara
**Date:** 2026-03-04

## Executive Summary

Claude Code users on the Pro plan ($20/month) operate within a ~44,000 token budget per 5-hour window. Every new session starts with zero project context — Claude re-discovers file structures, re-reads irrelevant files, and re-learns conventions it already found in previous sessions. This session amnesia wastes 30-60% of available tokens on exploration rather than productive work. The problem compounds as projects grow: more files, more complexity, more wasted tokens rediscovering what's already known.

**Claude Token Optimizer** (`claude-opt`) is an open-source CLI middleware that sits between the user and Claude Code. It captures what Claude learns in every session — which files were used, what patterns were discovered, what conventions apply — and injects that knowledge into the next session automatically. The system uses local-only task analysis, file prediction, model routing, and prompt compression to minimize token consumption with zero cloud dependency.

The core principle: **exploration is renting knowledge; the optimizer automates ownership.** Over time, the system gets smarter — file prediction accuracy improves, model routing gets cheaper, and token waste approaches zero. The bigger your project grows, the *less* each task costs.

Target users are Claude Pro subscribers — students, indie developers, researchers, and bootstrapped builders who can't afford unlimited plans and need every token to count. This includes non-developers: PhD students, academic researchers, and knowledge workers who use Claude for literature review, document structuring, and concept exploration — they hit the same session amnesia problem.

### What Makes This Special

This is the first tool that creates a **learning feedback loop** for Claude Code. No existing tool — Cursor, Continue.dev, Aider, or Claude Code's native CLAUDE.md — automates the cycle of discover → capture → reuse → improve. The optimizer doesn't just save tokens on a single session; it compounds savings across every session that follows. The inverse scaling property — project complexity up, token cost down — is the core differentiator that no alternative delivers.

The underlying insight: token waste is not a budgeting problem. It's a **knowledge persistence problem**. Solve session amnesia, and the token savings follow automatically.

## Project Classification

- **Project Type:** CLI Tool — npm-installable global package wrapping Claude Code
- **Domain:** Developer Tools / AI Productivity
- **Complexity:** Medium — ML-lite learning loop with local-only computation, file-based knowledge store, no cloud/auth/multi-user concerns
- **Project Context:** Greenfield — new open-source project built from scratch

## Success Criteria

### User Success

- **"Aha" moment within 5-10 sessions:** User observes measurably fewer tokens consumed on tasks similar to ones they've done before. The system's file predictions visibly improve and the user *feels* sessions starting smarter.
- **Full visibility into system intelligence:** Users can inspect knowledge gained, prediction accuracy, pattern discoveries, and token savings at any time. The system is a glass box, not a black box — users trust it because they can see it learning.
- **Inverse scaling experience:** As project complexity grows, per-task token cost decreases. Users who've been using the tool for 50+ sessions should see near-minimum token costs on routine task types.
- **Zero-friction onboarding:** `npm install -g claude-opt && claude-opt init && claude-opt "first task"` — three commands to value. No configuration walls.

### Business Success (Open Source)

- **GitHub stars:** 500+ within 3 months, 2,000+ within 6 months of launch
- **npm installs:** 1,000+ monthly installs within 3 months
- **Active contributors:** 5+ external contributors submitting PRs within 6 months
- **Community signal:** Issues, discussions, and feature requests indicating real daily usage — not just drive-by stars
- **Ecosystem recognition:** Featured in Claude Code community discussions, developer newsletters, or Anthropic community channels

### Technical Success

- **Token reduction per session:** 40-60% compared to raw Claude Code usage on equivalent tasks
- **File prediction precision:** >80% (predicted files that were actually needed)
- **File prediction recall:** >75% (needed files that were correctly predicted)
- **Model routing accuracy:** >85% (cheapest model that successfully completes the task)
- **Cold start to useful prediction:** <5 sessions to exceed 50% prediction precision
- **Zero regressions:** Optimizer never makes a session *worse* than raw Claude Code — if confidence is low, fall back gracefully

### Measurable Outcomes

| Metric | Target | Measurement Method |
|---|---|---|
| Token savings per session | 40-60% reduction | Compare optimized vs estimated unoptimized cost |
| Sessions per 5-hour window | 2x increase over baseline | Track sessions completed within token budget |
| File prediction accuracy | >80% precision, >75% recall | Compare predicted vs actually-used files |
| Time to "aha" moment | 5-10 sessions | Track when prediction accuracy first exceeds 70% |
| Knowledge growth rate | Positive per session | Track new patterns, task history entries, dependency edges |
| System overhead | <500ms per task | Measure local processing time before Claude call |

## User Journeys

### Journey 1: Dulhara — The Builder-Explorer (Primary Developer User)

**Who:** Undergraduate CS student, builds projects daily with Claude Code on the Pro plan. Equal parts coder, researcher, and experimenter. Every project starts as a question that becomes an idea that becomes code.

**Opening Scene:** Dulhara opens his terminal at 9 AM with a fresh idea — he wants to add a learning feedback loop to his optimizer project. He vaguely remembers the file structure but doesn't recall which module handles pattern detection. Without claude-opt, his first 3 prompts would burn ~3,000 tokens just on Claude re-reading files, re-discovering the module layout, and figuring out conventions.

**Rising Action:** He types `claude-opt "add confidence decay to pattern detection"`. The optimizer kicks in instantly:
- Classifies: feature, domain: learning-engine, complexity: medium
- Predicts 5 files from history — including patterns.json and learner.ts which it learned from 12 prior sessions
- Injects known conventions: "pattern confidence is a 0-1 float, evidence_count drives confidence"
- Routes to Sonnet (similar features succeeded on Sonnet before)
- Shows the full analysis in the terminal before sending

Mid-session, he wants to explore a concept: "explain exponential decay vs linear decay for confidence scores." The optimizer recognizes this as a research/learning prompt — routes to Haiku, skips file prediction entirely, saves tokens.

Later he says "document the confidence decay approach in architecture.md." Optimizer classifies as docs, routes to Haiku, pre-injects the file location.

**Climax:** At end of day, Dulhara runs `claude-opt stats` and sees: 14 tasks completed, 18,200 tokens used, estimated 31,400 tokens saved. He's at 41% of his window budget with the whole evening ahead. Last week he'd have hit the limit by 3 PM.

**Resolution:** He runs `claude-opt knowledge learning-engine` and sees the system has mapped 8 files in the learning domain, discovered 3 co-occurrence patterns, and has 89% prediction accuracy for this domain. The project is more complex than last week, but each session costs less.

**Capabilities revealed:** Task classification, file prediction, model routing, prompt compression, knowledge inspection, stats dashboard, multi-task-type handling (code + research + docs)

---

### Journey 2: Amara — The Academic Researcher (Primary Research User)

**Who:** Marine science PhD student. Uses Claude Pro to analyze research papers, draft literature reviews, structure thesis chapters, and explore complex concepts like ocean acidification models. Not a developer — uses Claude through the CLI because a labmate showed her how.

**Opening Scene:** Amara opens Claude Code to work on Chapter 3 of her thesis — a literature review on coral bleaching biomarkers. She's been building this chapter across 15+ sessions. Every time she starts a new session, Claude forgets which papers she's already analyzed, which arguments she's structured, and what her advisor's feedback was. She spends the first 10 minutes re-explaining context. That's 4,000+ tokens gone before any real work starts.

**Rising Action:** Her labmate installs claude-opt for her. She runs `claude-opt init` and it scans her project — markdown files, literature notes, chapter drafts, reference lists. First session, it doesn't know much. But by session 5, she types `claude-opt "add the new Smith et al. 2025 findings to the biomarker section"` and the optimizer:
- Knows her thesis structure (chapter-3.md, references.md, lit-notes/)
- Predicts she'll need chapter-3.md, her biomarker notes, and the references file
- Injects context: "Chapter 3 uses APA formatting, advisor prefers critical analysis over summary"
- Routes to Sonnet (literature integration is medium complexity)

**Climax:** After 10 sessions, Amara notices she can do a full 2-hour writing session without hitting the token wall. She used to get cut off after 45 minutes. She runs `claude-opt budget` and sees she has 28,000 tokens remaining — enough for two more deep sessions today.

**Resolution:** She tells her biochemistry friend about it. "It remembers everything about my thesis. I don't have to re-explain my chapter structure every single time." Her friend installs it that night.

**Capabilities revealed:** Non-code project support (markdown, documents, research), knowledge persistence across sessions, budget visibility, word-of-mouth growth, zero-config value for non-developers

---

### Journey 3: Marcus — The Skeptical Evaluator (First-Time User)

**Who:** Senior frontend developer. Sees claude-opt trending on Hacker News. Uses Claude Code daily but is skeptical of "optimizer" tools — he's seen too many that add overhead without real savings.

**Opening Scene:** Marcus reads the README. Claims of 40-60% token savings sound too good. He runs `npm install -g claude-opt` and `claude-opt init` on his React project (180+ components, 400+ files). The scan takes 8 seconds and generates a project map. "Okay, let's see."

**Rising Action:** First task: `claude-opt "fix the dropdown z-index bug in UserMenu"`. The optimizer shows its analysis — predicts files, suggests Haiku (simple bugfix). But it's session 1, so predictions are rough. It finds the right component but misses the shared styles file. Marcus notices: prediction precision 60%, recall 75%. "Not great, but it's learning."

Sessions 2 through 5, he watches the stats. Prediction accuracy climbs: 65%, 71%, 74%, 79%. He runs `claude-opt --dry-run "add dark mode to settings panel"` and sees the optimizer would predict 8 files — 6 of which are exactly right. He's starting to believe.

**Climax:** Session 8. He runs a complex refactor: `claude-opt "migrate UserProfile from class component to hooks"`. The optimizer predicts every file perfectly — the component, the tests, the connected container, the type definitions, the storybook file. Zero wasted exploration. Token cost: 1,800. He checks what this would have cost raw: estimated 4,200. "Okay. I'm keeping this."

**Resolution:** He stars the repo, tweets about it, and opens an issue requesting TypeScript type exports for the knowledge store API.

**Capabilities revealed:** Dry-run mode, progressive accuracy improvement, transparent predictions, skeptic-to-advocate pipeline, community engagement trigger

---

### Journey 4: Priya — The Power User & Diagnostician

**Who:** Full-stack developer who runs a small consultancy. Uses Claude Code across 5 client projects. Obsessed with efficiency — tracks everything.

**Opening Scene:** Priya has been using claude-opt for 3 weeks. She notices that predictions for her e-commerce project are great (92% precision) but her new healthcare API project is stuck at 55%. She wants to know why and fix it.

**Rising Action:** She runs `claude-opt knowledge api --project healthcare-api` and sees the knowledge store: only 8 tasks recorded, sparse dependency graph, no patterns detected yet. She runs `claude-opt stats --project healthcare-api` and sees the per-domain breakdown — the "auth" domain has decent predictions, but "compliance" domain predictions are poor.

**Three-Tier Recovery in Action:**

- **Tier 1 (Self-Correction):** The optimizer's self-correcting weights have been adjusting, but with only 8 tasks there isn't enough history for meaningful self-correction.
- **Tier 2 (Doctor Agent):** Priya runs `claude-opt doctor`. The Doctor Agent analyzes the knowledge store, examines prediction logs, and diagnoses: "Compliance domain has insufficient training data (3 tasks). HIPAA compliance files consistently co-occur with audit logging files but this pattern is not yet detected. Recommended: The Doctor auto-adds the co-occurrence pattern and flags old-auth-middleware.ts as likely stale (not referenced in last 6 tasks despite high historical frequency)." Priya approves the fixes. Prediction accuracy jumps to 72% immediately.
- **Tier 3 (Manual):** For deeper control, she opens `.claude-opt/patterns.json` directly, removes the stale file entry manually, and verifies the Doctor's co-occurrence pattern looks correct. Predictions improve further to 78%.

**Climax:** After 5 more focused sessions, the Doctor Agent runs a background check and reports: "Healthcare API project health: prediction accuracy 86%, no stale patterns detected, knowledge store growing normally." The system healed itself with a nudge from the Doctor and a precision touch from Priya.

**Resolution:** She writes a blog post: "How I trained claude-opt to understand my healthcare project in 5 sessions." Contributes a PR adding a `claude-opt forget <file>` command.

**Capabilities revealed:** Multi-project support, Doctor Agent diagnostics, three-tier recovery (auto → AI doctor → manual), per-domain diagnostics, manual knowledge store inspection/editing, user-driven correction, knowledge store transparency, community contribution pipeline

---

### Journey 5: Dev — The Open Source Contributor

**Who:** Backend developer who uses Claude Code for Go projects. Finds claude-opt on GitHub and notices it only parses TypeScript/JavaScript imports for the dependency graph.

**Opening Scene:** Dev installs claude-opt for his Go monorepo. The project scan works, but the dependency graph is empty — the import parser doesn't support Go's import syntax.

**Rising Action:** He reads the architecture docs, finds the parser module is cleanly separated. He forks the repo, writes a Go import parser following the existing TypeScript parser as a template. The pattern is clear — parse imports, return file paths.

**Climax:** He submits a PR. The maintainer (Dulhara) reviews it, suggests a small change to handle Go module paths, and merges it. The Go community now has first-class support.

**Resolution:** Two more contributors follow — one adds Python support, another adds Rust. The tool becomes language-agnostic through community contribution, not through one developer trying to support every language.

**Capabilities revealed:** Plugin/extensible architecture, clear contribution path, language-agnostic design potential, community growth through contribution

---

### Journey Requirements Summary

| Capability | Journeys That Need It |
|---|---|
| Task classification (type, domain, complexity) | All journeys |
| File prediction with accuracy tracking | Dulhara, Marcus, Priya |
| Model routing (Haiku/Sonnet/Opus) | Dulhara, Amara |
| Prompt compression & context injection | Dulhara, Amara |
| Knowledge persistence across sessions | All journeys |
| `claude-opt stats` dashboard | Dulhara, Marcus, Priya |
| `claude-opt budget` window tracking | Dulhara, Amara |
| `claude-opt knowledge <domain>` inspection | Dulhara, Priya |
| `claude-opt --dry-run` mode | Marcus |
| Non-code project support (markdown, docs) | Amara |
| Multi-project isolation | Priya |
| Three-tier recovery (self-correct → Doctor Agent → manual) | All journeys |
| `claude-opt doctor` diagnostic agent | Priya, Marcus |
| Manual knowledge correction (`forget`, edit store) | Priya |
| User feedback ("that was wrong") | Priya, Marcus |
| Transparent prediction display | Marcus (trust-building) |
| Extensible parser architecture | Dev |
| Progressive accuracy visibility | Marcus (skeptic conversion) |
| Self-correcting weights | All journeys (background) |
| Zero-config onboarding | Marcus, Amara |

## Domain Requirements

### Domain 1: Project Scanner (`claude-opt init` / `claude-opt scan`)

| ID | Requirement | Type |
|---|---|---|
| SC-01 | Scan code projects by parsing imports (JS/TS initially, extensible parser architecture) | Functional |
| SC-02 | Scan non-code projects — parse markdown structure, document hierarchy, heading trees, reference/link relationships | Functional |
| SC-03 | Generate project map: file tree with metadata (type, size, last modified, domain classification) | Functional |
| SC-04 | Generate dependency graph: directed edges between files based on imports, references, and links | Functional |
| SC-05 | Auto-generate/update CLAUDE.md with discovered project conventions | Functional |
| SC-06 | Support incremental re-scanning — skip unchanged files, only process deltas | Functional |
| SC-07 | Auto-detect project type (code vs research/docs vs mixed) and adjust scanning strategy | Functional |
| SC-08 | **Starter knowledge packs:** On first scan, detect project stack (TypeScript, Python, React, markdown-heavy, etc.) and seed the knowledge store with common patterns for that stack (e.g., test files co-located, package.json always relevant, README patterns). Provides baseline intelligence from session 1 | Functional |
| SC-09 | Ship built-in starter packs for common stacks: TypeScript/Node, React, Python, Markdown/Research. Community can contribute additional packs | Functional |
| SC-10 | Complete scan in <10 seconds for projects up to 500 files | Non-functional |
| SC-11 | Respect `.gitignore` and `.claudeignore` patterns | Functional |

### Domain 2: Task Analyzer

| ID | Requirement | Type |
|---|---|---|
| TA-01 | Classify task type: feature, bugfix, refactor, research, documentation, learning/concept, exploration | Functional |
| TA-02 | Classify task domain: map to project domains based on file clustering and keyword matching | Functional |
| TA-03 | Classify task complexity: simple, medium, complex — based on keyword signals, historical data, and predicted file count | Functional |
| TA-04 | Recognize non-code task types: literature review, writing, thesis structuring, concept exploration | Functional |
| TA-05 | Output structured classification object: `{ type, domain, complexity, confidence }` | Functional |
| TA-06 | Classification completes in <100ms | Non-functional |

### Domain 3: File Predictor

| ID | Requirement | Type |
|---|---|---|
| FP-01 | Predict relevant files from task description using multiple weighted signals | Functional |
| FP-02 | Signal sources: task history similarity, dependency graph traversal, keyword-to-file index, pattern co-occurrence boosting | Functional |
| FP-03 | Output ranked file list with per-file confidence scores (0-1) | Functional |
| FP-04 | Track prediction precision and recall per task, per domain, and overall | Functional |
| FP-05 | Graceful degradation: when confidence is low, predict fewer files rather than bad files. Never make a session worse than raw Claude | Functional |
| FP-06 | Support both code files and document files (markdown, text, reference lists) | Functional |
| FP-07 | Prediction completes in <200ms | Non-functional |
| FP-08 | Cold start: exceed 50% precision within 5 sessions | Non-functional |

### Domain 4: Model Router

| ID | Requirement | Type |
|---|---|---|
| MR-01 | Select cheapest model capable of handling the task: Haiku → Sonnet → Opus escalation | Functional |
| MR-02 | Route based on: task complexity + task type + historical model success/failure | Functional |
| MR-03 | Research/learning/documentation tasks default to Haiku unless history shows failure | Functional |
| MR-04 | Override routing when historical data shows a cheaper model failed on similar tasks | Functional |
| MR-05 | Expose routing decision and rationale to the user (transparency) | Functional |
| MR-06 | Routing decision in <50ms | Non-functional |

### Domain 5: Prompt Compressor

| ID | Requirement | Type |
|---|---|---|
| PC-01 | Remove filler words, redundant phrasing, and unnecessary context from user prompts | Functional |
| PC-02 | Pre-inject predicted file contents or summaries relevant to the task | Functional |
| PC-03 | Inject known patterns and conventions from the knowledge store | Functional |
| PC-04 | Inject domain-specific context (e.g., "Chapter 3 uses APA formatting") | Functional |
| PC-05 | **Prompt review & edit:** Show the generated systematic prompt to the user before sending. User can send as-is, edit the prompt, or cancel. Ensures user always knows exactly what's being sent to Claude | Functional |
| PC-06 | Prompt edit mode: inline editing or open in user's `$EDITOR`. Edited prompt replaces the generated one for that task only (does not override future generation) | Functional |
| PC-07 | Compression completes in <100ms | Non-functional |
| PC-08 | Never alter the semantic meaning of the user's request | Non-functional |

### Domain 6: Knowledge Learner

| ID | Requirement | Type |
|---|---|---|
| KL-01 | Capture task outcomes after each session: files actually used, model used, success/failure signal | Functional |
| KL-02 | Compare predicted files vs actually-used files and update accuracy metrics | Functional |
| KL-03 | Update dependency graph with newly discovered file relationships | Functional |
| KL-04 | Detect patterns: file co-occurrence, task-type-to-file affinity, convention patterns | Functional |
| KL-05 | Update and store new conventions discovered during session | Functional |
| KL-06 | Self-correcting weights: boost accurate predictions, decay inaccurate ones automatically (Tier 1 recovery) | Functional |
| KL-07 | Stale entry decay: reduce weight of files/patterns not seen in recent sessions | Functional |
| KL-08 | Learning capture completes in <500ms post-session | Non-functional |

### Domain 7: Token Tracker

| ID | Requirement | Type |
|---|---|---|
| TT-01 | Track tokens consumed per individual task | Functional |
| TT-02 | Track tokens consumed per session (aggregate) | Functional |
| TT-03 | Track tokens consumed per 5-hour window against configurable budget (default: 44,000 tokens) | Functional |
| TT-04 | Estimate tokens saved vs unoptimized baseline (what it would have cost without optimizer) | Functional |
| TT-05 | **Tiered budget warnings:** Inline warning at 75% usage, blocking prompt at 90% ("You're at 90% budget. Continue? [Y/n]"). Thresholds configurable | Functional |
| TT-06 | Display remaining budget on demand (`claude-opt budget`) | Functional |
| TT-07 | Token budget is user-configurable to accommodate plan changes or different Anthropic tiers | Functional |
| TT-08 | **Window time estimation:** Track and display time remaining until next window reset. Based on 5-hour sliding window (configurable). Show estimated wait time when budget is exhausted or near-exhausted | Functional |
| TT-09 | Window duration configurable (default: 5 hours / 18,000,000ms) via `claude-opt config window-duration` | Functional |
| TT-10 | Tracking overhead <10ms per task | Non-functional |

### Domain 8: Doctor Agent (`claude-opt doctor`)

| ID | Requirement | Type |
|---|---|---|
| DR-01 | Analyze knowledge store health on demand via `claude-opt doctor` | Functional |
| DR-02 | Identify stale patterns: high historical frequency but absent in recent sessions | Functional |
| DR-03 | Identify missing co-occurrence patterns that exist in data but haven't been formalized | Functional |
| DR-04 | Identify bad predictions: files consistently predicted but not used | Functional |
| DR-05 | Generate diagnostic report with specific findings and recommended fixes | Functional |
| DR-06 | Propose fixes with explanations — user approves before application (Supervised mode) | Functional |
| DR-07 | **Two operating modes** configurable via `claude-opt config doctor-mode supervised\|autonomous`: | Functional |
|  | — **Supervised (default):** When prediction accuracy drops below threshold, Doctor *alerts* the user and waits for acknowledgement before running diagnostics. User can choose to let Doctor diagnose or handle it manually | |
|  | — **Autonomous (opt-in):** Doctor detects threshold breach, runs diagnostics automatically, applies low-risk fixes, and logs all actions. Medium/high-risk fixes still require user approval even in autonomous mode | |
| DR-08 | Threshold detection: monitor prediction accuracy per domain; alert/trigger when accuracy drops below 60% (configurable) | Functional |
| DR-09 | In Supervised mode, present user with clear options: "Let Doctor diagnose", "I'll handle it manually", or "Dismiss" | Functional |
| DR-10 | Run all diagnostic inference on Haiku to minimize token cost | Functional |
| DR-11 | Report knowledge store health score: overall + per-domain breakdown | Functional |
| DR-12 | Audit log: every Doctor action logged to `.claude-opt/doctor-log.json` — findings, fixes applied, timestamps, mode used. Full transparency | Functional |
| DR-13 | **Deep analysis mode:** When diagnosis is severe or insufficient data in recent history, Doctor asks user for permission to analyze archived task history for deeper pattern discovery | Functional |
| DR-14 | **Pre-flight checkup mode (`co doctor --checkup`):** Verify all knowledge store files are valid, project map completeness, dependency graph connectivity, starter pack loaded, config correct. Reports readiness score. Designed to run after `co init` before first task. Zero token cost (local validation only) | Functional |
| DR-15 | Pre-flight checkup reports issues with severity and offers: auto-fix / continue anyway / fix manually | Functional |
| DR-16 | Typical doctor session costs <500 tokens (deep analysis with archives may cost more — user warned before proceeding). Pre-flight checkup costs zero tokens | Non-functional |

### Domain 9: Visibility Layer (CLI Commands)

| ID | Requirement | Type |
|---|---|---|
| VL-01 | `claude-opt stats` — session stats, accuracy metrics, savings estimates, tasks completed | Functional |
| VL-02 | `claude-opt budget` — remaining window budget, projected runway, usage visualization | Functional |
| VL-03 | `claude-opt knowledge <domain>` — domain-specific knowledge: files mapped, patterns found, accuracy per domain | Functional |
| VL-04 | `claude-opt --dry-run "<task>"` — show full optimizer analysis without executing (predictions, routing, compression) | Functional |
| VL-05 | `claude-opt forget <file>` — remove specific file from knowledge store predictions | Functional |
| VL-06 | **Inline post-task feedback (Claude Code style):** After each task, show a brief prompt — `[👍 Good] [👎 Bad] [→ Skip]`. If 👎, expand to quick options: `[1] Missed files [2] Wrong files predicted [3] Wrong model [4] Describe...`. Minimal friction, one-click signal | Functional |
| VL-07 | `claude-opt correct` — detailed feedback mode for power users. Describe what went wrong, flag specific files, correct model choices. Rich input for faster learning | Functional |
| VL-08 | All commands produce clean, readable terminal output with visualization support | Non-functional |
| VL-09 | Accuracy trends and token savings visualized over time | Functional |

### Domain 10: Knowledge Store (Persistence Layer)

| ID | Requirement | Type |
|---|---|---|
| KS-01 | JSON file-based storage — no external database dependencies | Functional |
| KS-02 | Per-project isolation: each project gets its own `.claude-opt/` directory | Functional |
| KS-03 | Store task history with outcomes (files used, model, success, tokens) | Functional |
| KS-04 | Store dependency graph (directed file relationships) | Functional |
| KS-05 | Store pattern library (co-occurrences, affinities, conventions) | Functional |
| KS-06 | Store prediction accuracy metrics (per-task, per-domain, overall) | Functional |
| KS-07 | Human-readable JSON format — power users can inspect and edit directly | Functional |
| KS-08 | **Task history capping:** Keep last 500 tasks in active `task-history.json`. Older tasks archived to `.claude-opt/archive/task-history-{date}.json`. Active file stays fast; archived history available for Doctor deep analysis on request | Functional |
| KS-09 | Archive files are read-only during normal operation. Only Doctor Agent accesses archives, and only with explicit user permission | Functional |
| KS-10 | All reads/writes on active files complete in <50ms | Non-functional |

> **Note — Deferred to v1.1:** Knowledge store backup & corruption recovery (backup before mutations, rollback on failure). Documented here for implementation in the next version post-MVP.

### Cross-Cutting Non-Functional Requirements

| ID | Requirement | Target |
|---|---|---|
| NF-01 | Total optimizer overhead per task | <500ms (all local processing before Claude call) |
| NF-02 | Privacy | All data stored locally, zero cloud dependency, no telemetry |
| NF-03 | Graceful failure | Optimizer failure never blocks Claude Code — falls back to raw mode transparently |
| NF-04 | Platform support | macOS, Linux, Windows |
| NF-05 | Zero-config | Works out of the box with sensible defaults, no mandatory config beyond `init` |
| NF-06 | Extensibility | Parser architecture supports adding new language parsers via clean interface |
| NF-07 | Install footprint | Minimal npm dependencies, no native binaries required |

### Requirements Count Summary

| Domain | Functional | Non-Functional | Total |
|---|---|---|---|
| Project Scanner | 9 | 1 | 10 |
| Task Analyzer | 5 | 1 | 6 |
| File Predictor | 6 | 2 | 8 |
| Model Router | 5 | 1 | 6 |
| Prompt Compressor | 6 | 2 | 8 |
| Knowledge Learner | 7 | 1 | 8 |
| Token Tracker | 9 | 1 | 10 |
| Doctor Agent | 15 | 1 | 16 |
| Visibility Layer | 8 | 1 | 9 |
| Knowledge Store | 9 | 1 | 10 |
| Cross-Cutting | — | 7 | 7 |
| **Total** | **79** | **19** | **98** |

## Product Scope

### MVP (v1.0) — The Full Learning Loop

The MVP ships the complete loop: scan → analyze → predict → compress → execute → learn. All six core modules working end-to-end, even if algorithms start simple and improve over time.

**Included in MVP:**
- `claude-opt init` / `claude-opt scan` — project scanner generating project map + dependency graph + CLAUDE.md. Supports both code projects (import parsing) and non-code projects (markdown structure, document hierarchy, reference tracking). Includes **starter knowledge packs** for common stacks (TypeScript, React, Python, Research/Markdown) so first session has baseline intelligence
- **Task Analyzer** — keyword-based classification (type, domain, complexity). Recognizes both development tasks (code, refactor, debug) and knowledge tasks (research, writing, documentation, literature review)
- **File Predictor** — task history matching + dependency graph + keyword index + pattern boosting
- **Model Router** — complexity-based model selection with history-informed overrides
- **Prompt Compressor** — filler removal, file pre-injection, pattern injection, context injection. Generates systematic optimized prompts shown to user for **review and optional editing** before sending to Claude
- **Knowledge Learner** — post-session capture of task history, prediction accuracy, dependency updates, pattern detection
- **Token Tracker** — usage tracking per session and per 5-hour window with budget warnings. Token budget is configurable (default: 44,000) to accommodate future Anthropic plan changes
- **Visibility layer** — `claude-opt stats`, `claude-opt budget`, `claude-opt knowledge <domain>`, `claude-opt --dry-run`
- **Three-tier recovery system:**
  - *Tier 1 — Self-correcting weights:* prediction weights adjust automatically based on accuracy feedback, stale entries decay over time
  - *Tier 2 — Doctor Agent (`claude-opt doctor`):* AI-powered diagnostic agent that analyzes the knowledge store, identifies stale patterns, bad predictions, missing co-occurrences, and proposes/applies fixes. Runs on Haiku to minimize token cost. Two modes: **Supervised** (default) — alerts user when threshold breached, waits for acknowledgement before diagnosing; **Autonomous** (opt-in) — runs diagnostics automatically on threshold breach. All actions logged to audit trail
  - *Tier 3 — Manual correction:* `claude-opt forget <file>`, `claude-opt correct`, direct knowledge store editing for power users who want full control
- **Non-code project support** — markdown structure parsing, document hierarchy awareness, reference/citation tracking for research workflows
- **Three-step onboarding flow:**
  1. `co init` — configure, scan, seed starter pack, scaffold knowledge store
  2. `co doctor --checkup` — user-summoned pre-flight validation (zero token cost)
  3. `co "first task"` — user starts with confidence and baseline intelligence
- JSON file-based knowledge store (per-project isolation)

### Growth Features (Post-MVP / v1.1+)

- Knowledge store backup & corruption recovery — backup before mutations, rollback on failure
- TF-IDF similarity matching for more nuanced task comparison
- Advanced pattern detection (file co-occurrence, type-file affinity, convention discovery)
- Dynamic `.claudeignore` generation
- Analytics dashboard with historical trends and per-domain breakdowns
- Predictive task batching ("these 3 tasks share files — batch them")
- Multi-project support with separate knowledge stores
- Team knowledge sharing (export/import knowledge stores)

### Vision (Future)

- Git hook integration (auto-update knowledge on commits)
- VS Code extension
- Natural language knowledge queries ("what do I know about auth?")
- Community knowledge templates (starter knowledge packs for common stacks like Next.js, Express, Django)
- Plugin system for custom analyzers and predictors

## Technical Constraints & Architecture Boundaries

### Technology Stack

| Layer | Choice | Rationale |
|---|---|---|
| Runtime | Node.js (≥18 LTS) | Same ecosystem as Claude Code. Zero friction for users and contributors |
| Language | TypeScript (strict mode) | Type safety for complex data flows. Expected by modern CLI tool contributors |
| Package Manager | npm | Maximum reach. `npm install -g claude-opt` install path. No alternative lock-in |
| Distribution | npm registry (global CLI) | Standard distribution. `npx claude-opt` for try-before-install |
| Storage | JSON files on local filesystem | Zero external dependencies. `.claude-opt/` directory per project |
| Testing | Vitest | TypeScript-native, fast, built-in coverage. Near-identical Jest API for contributor familiarity |
| CLI Framework | Commander.js | Lightweight, zero dependencies, sufficient for ~8 subcommands. No framework overkill |

### Integration Constraints

| Constraint | Detail |
|---|---|
| Claude Code Interface | Must wrap Claude Code CLI — intercepts prompts before they reach Claude and captures outputs after. Middleware, not a replacement |
| No API Key Required | Uses the user's existing Claude Code authentication. Zero additional auth setup |
| No Cloud Dependency | All processing (classification, prediction, compression, learning) runs locally. No telemetry, no remote calls |
| No Native Binaries | Pure JavaScript/TypeScript. No node-gyp, no Rust FFI, no C++ addons. Clean `npm install -g` on any platform |
| Claude Code Version Compatibility | Handle CLI interface changes gracefully. Version detection + fallback behavior |

### Platform Constraints

| Constraint | Target |
|---|---|
| Operating Systems | macOS, Linux, Windows (all three from MVP) |
| Node.js Versions | 18.x LTS, 20.x LTS, 22.x+ |
| Shell Environments | bash, zsh, PowerShell, cmd.exe |
| File System | Handle path differences (/ vs \\), case-sensitive vs case-insensitive filesystems |

### Performance Boundaries

| Boundary | Hard Limit | Rationale |
|---|---|---|
| Total pre-Claude overhead | <500ms | User must not feel the optimizer |
| Project scan (cold) | <10s for 500 files | First-run scan must not cause abandonment |
| Project scan (incremental) | <2s | Re-scans after file changes near-instant |
| Knowledge store read | <50ms | Every task starts with a read. Must be invisible |
| Knowledge store write | <50ms | Post-task learning must not block terminal |
| Memory footprint | <100MB RSS | Lightweight background assistant, not an IDE |

### Security & Privacy Constraints

| Constraint | Detail |
|---|---|
| Local-only data | All knowledge store data stays on the user's machine. No exceptions |
| No telemetry | No usage analytics, crash reporting, or phone-home behavior |
| No secrets in knowledge store | Scanner skips `.env`, credential files, secrets. Knowledge store never contains API keys, passwords, or tokens |
| Filesystem permissions | Only read/write within project directory and `~/.claude-opt/` for global config |

### Architecture Hard Rules

| Rule | Rationale |
|---|---|
| Modular pipeline | Each domain is an independent module with clean interfaces. No god-objects |
| Parser extensibility | Language parsers implement a common interface. Adding a language = adding one file |
| Fail-open design | If any module fails, system falls back to raw Claude Code. Optimizer never blocks work |
| Stateless between tasks | Each task reads from knowledge store, processes, writes back. No long-running daemon |
| Human-readable storage | Knowledge store JSON formatted for power users to inspect and edit manually |
| Backward-compatible schema | Knowledge store schema versioned. Upgrades auto-migrate. Users never lose knowledge data on update |

### Doctor Agent Constraints

| Constraint | Detail |
|---|---|
| Token budget | Runs on Haiku. Typical session <500 tokens. Must not become a significant token consumer |
| Scope limitation | Only analyzes knowledge store and prediction logs. Never modifies project files or touches anything outside `.claude-opt/` |
| Supervised mode (default) | Alerts user on threshold breach, waits for acknowledgement. User chooses: let Doctor diagnose, handle manually, or dismiss |
| Autonomous mode (opt-in) | Runs diagnostics automatically. Low-risk fixes auto-applied. Medium/high-risk fixes still require user approval |
| Auditability | Every action logged to `.claude-opt/doctor-log.json` — findings, fixes, timestamps, mode. Full audit trail |

### Dependency Constraints

| Constraint | Detail |
|---|---|
| Minimal dependencies | Target <15 production dependencies |
| No framework lock-in | No Express, Fastify, or heavy frameworks. CLI tool, not a server |
| No ML libraries | All algorithms (keyword matching, co-occurrence, future TF-IDF) implemented from scratch or with minimal utilities. No TensorFlow, PyTorch, ONNX |

## Data Model & Knowledge Store Schema

### Directory Structure

```
.claude-opt/
├── config.json              # User configuration & preferences
├── project-map.json         # File tree with metadata & domain classification
├── dependency-graph.json    # Directed file relationships
├── task-history.json        # Recent tasks (capped at 500, older archived)
├── patterns.json            # Co-occurrences, type affinities, conventions
├── metrics.json             # Aggregated accuracy, token usage, trends
├── keyword-index.json       # Bidirectional keyword ↔ file mappings
├── doctor-log.json          # Doctor Agent audit trail
├── .schema-version          # Schema version for migration tracking
└── archive/                 # Archived task history
    └── task-history-{date}.json
```

**Design rationale — separate files because:**
- Each module reads/writes only what it needs (no contention)
- Smaller files = faster reads (<50ms target)
- Human-readable (Priya can open `patterns.json` without wading through task history)
- Incremental updates (learner only rewrites files it touched)

### Schema Definitions

#### config.json

```json
{
  "schemaVersion": "1.0.0",
  "projectName": "claude_optimizer",
  "projectType": "code | research | mixed",
  "tokenBudget": 44000,
  "windowDurationMs": 18000000,
  "budgetWarnings": {
    "inline": 0.75,
    "blocking": 0.90
  },
  "doctorMode": "supervised | autonomous",
  "doctorThreshold": 0.60,
  "taskHistoryCap": 500,
  "createdAt": "2026-03-04T09:00:00Z",
  "updatedAt": "2026-03-04T14:30:00Z"
}
```

#### project-map.json

```json
{
  "schemaVersion": "1.0.0",
  "scannedAt": "2026-03-04T09:00:05Z",
  "scanType": "full | incremental",
  "projectType": "code | research | mixed",
  "totalFiles": 142,
  "files": {
    "src/analyzer.ts": {
      "type": "typescript",
      "category": "code | markdown | document | config | test | asset",
      "size": 2340,
      "lastModified": "2026-03-04T08:45:00Z",
      "domain": "analysis",
      "keywords": ["classify", "task", "complexity"],
      "contentHash": "a3f2b8c1"
    },
    "docs/chapter-3.md": {
      "type": "markdown",
      "category": "document",
      "size": 18400,
      "lastModified": "2026-03-03T16:20:00Z",
      "domain": "thesis-ch3",
      "keywords": ["biomarker", "coral", "bleaching", "APA"],
      "headings": ["Introduction", "Biomarker Categories", "Recent Findings"],
      "contentHash": "d7e9f0a2"
    }
  },
  "domains": {
    "analysis": {
      "files": ["src/analyzer.ts", "src/classifier.ts"],
      "keywords": ["classify", "analyze", "task"],
      "fileCount": 2
    }
  },
  "ignoredPatterns": ["node_modules/**", ".env", "*.secret"]
}
```

> Note: `headings` field populated for markdown/document files — this is how the scanner understands non-code structure (Amara's thesis chapters).

#### dependency-graph.json

```json
{
  "schemaVersion": "1.0.0",
  "updatedAt": "2026-03-04T14:30:00Z",
  "edges": [
    {
      "source": "src/index.ts",
      "target": "src/analyzer.ts",
      "type": "import | reference | link | cooccurrence",
      "weight": 1.0,
      "discoveredBy": "scanner | learner"
    }
  ],
  "adjacency": {
    "src/index.ts": {
      "out": ["src/analyzer.ts", "src/router.ts"],
      "in": []
    },
    "src/analyzer.ts": {
      "out": ["src/classifier.ts"],
      "in": ["src/index.ts"]
    }
  }
}
```

> `adjacency` is a precomputed lookup so the File Predictor can traverse the graph in <200ms without walking all edges.

#### task-history.json

```json
{
  "schemaVersion": "1.0.0",
  "cap": 500,
  "count": 47,
  "oldestArchive": "2026-02-15",
  "tasks": [
    {
      "id": "t_20260304_001",
      "timestamp": "2026-03-04T09:15:00Z",
      "sessionId": "s_20260304_01",
      "description": "add confidence decay to pattern detection",
      "classification": {
        "type": "feature",
        "domain": "learning-engine",
        "complexity": "medium",
        "confidence": 0.85
      },
      "prediction": {
        "predictedFiles": [
          { "file": "src/patterns.ts", "confidence": 0.92 },
          { "file": "src/learner.ts", "confidence": 0.88 }
        ],
        "actualFiles": ["src/patterns.ts", "src/learner.ts", "src/config.ts"],
        "precision": 1.0,
        "recall": 0.67
      },
      "routing": {
        "selectedModel": "sonnet",
        "rationale": "medium complexity feature, historical sonnet success",
        "success": true
      },
      "tokens": {
        "consumed": 1200,
        "estimatedUnoptimized": 2800,
        "saved": 1600
      },
      "feedback": null
    }
  ]
}
```

> **Feedback field** supports two input paths:
> - **Inline pop (low friction):** `{ "source": "inline", "rating": "bad", "quickReason": "missed-files" }`
> - **Detailed (`claude-opt correct`):** `{ "source": "cli-correct", "rating": "bad", "details": "missed src/styles.css, shouldn't have predicted old-file.ts", "missedFiles": ["src/styles.css"], "wrongFiles": ["src/old-file.ts"] }`
> - **Good feedback:** `{ "source": "inline", "rating": "good" }`
> - **Skipped:** `null` (no feedback given)

#### patterns.json

```json
{
  "schemaVersion": "1.0.0",
  "coOccurrences": [
    {
      "id": "co_001",
      "files": ["src/auth.ts", "src/middleware.ts"],
      "frequency": 8,
      "confidence": 0.82,
      "lastSeen": "2026-03-04T14:00:00Z",
      "discoveredAt": "2026-03-01T10:00:00Z",
      "decayFactor": 1.0
    }
  ],
  "typeAffinities": {
    "bugfix": {
      "src/utils.ts": { "weight": 0.6, "occurrences": 5 },
      "tests/utils.test.ts": { "weight": 0.8, "occurrences": 7 }
    }
  },
  "conventions": [
    {
      "id": "conv_001",
      "pattern": "Test files co-located in __tests__/ subdirectory",
      "confidence": 0.92,
      "evidenceCount": 12,
      "examples": ["src/__tests__/analyzer.test.ts"]
    }
  ]
}
```

> `decayFactor` drives Tier 1 self-correction. Learner reduces it for patterns not seen recently. At 0 the pattern is effectively dead — Doctor handles cleanup.

#### metrics.json

```json
{
  "schemaVersion": "1.0.0",
  "overall": {
    "totalTasks": 47,
    "totalSessions": 12,
    "avgPrecision": 0.82,
    "avgRecall": 0.76,
    "totalTokensConsumed": 28400,
    "totalTokensSaved": 34200,
    "savingsRate": 0.546
  },
  "perDomain": {
    "learning-engine": {
      "tasks": 12,
      "precision": 0.89,
      "recall": 0.81,
      "tokensConsumed": 8200,
      "tokensSaved": 11400
    }
  },
  "windows": [
    {
      "id": "w_20260304_01",
      "startedAt": "2026-03-04T09:00:00Z",
      "expiresAt": "2026-03-04T14:00:00Z",
      "windowDurationMs": 18000000,
      "tokensConsumed": 18200,
      "budget": 44000,
      "remaining": 25800,
      "tasksCompleted": 14,
      "timeRemainingMs": 7920000,
      "estimatedResetAt": "2026-03-04T14:00:00Z"
    }
  ],
  "predictionTrend": [
    { "session": 1, "precision": 0.45, "recall": 0.40, "timestamp": "2026-03-01T09:00:00Z" },
    { "session": 5, "precision": 0.72, "recall": 0.68, "timestamp": "2026-03-02T09:00:00Z" },
    { "session": 12, "precision": 0.84, "recall": 0.79, "timestamp": "2026-03-04T14:00:00Z" }
  ]
}
```

> `predictionTrend` powers Marcus's skeptic-to-believer arc and `claude-opt stats` visualizations.

#### keyword-index.json

```json
{
  "schemaVersion": "1.0.0",
  "updatedAt": "2026-03-04T14:30:00Z",
  "keywordToFiles": {
    "auth": ["src/auth.ts", "src/middleware.ts", "tests/auth.test.ts"],
    "biomarker": ["docs/chapter-3.md", "docs/lit-notes/biomarkers.md"],
    "confidence": ["src/patterns.ts", "src/learner.ts"]
  },
  "fileToKeywords": {
    "src/auth.ts": ["auth", "login", "token", "session"],
    "docs/chapter-3.md": ["biomarker", "coral", "bleaching", "APA"]
  }
}
```

> Bidirectional: Analyzer goes keyword→files (prediction), Scanner goes file→keywords (indexing). Both O(1) hash lookups.

#### doctor-log.json

```json
{
  "schemaVersion": "1.0.0",
  "entries": [
    {
      "id": "doc_20260304_001",
      "timestamp": "2026-03-04T13:00:00Z",
      "mode": "supervised",
      "trigger": "threshold-breach",
      "triggerDetail": "compliance domain precision dropped to 0.48",
      "usedArchive": false,
      "findings": [
        {
          "type": "stale-pattern",
          "severity": "medium",
          "description": "old-auth-middleware.ts has weight 0.8 but unused in last 6 tasks",
          "affectedDomain": "auth",
          "recommendation": "Remove from active predictions"
        }
      ],
      "actions": [
        {
          "finding": "stale-pattern: old-auth-middleware.ts",
          "action": "applied",
          "approvedBy": "user",
          "result": "Weight reduced from 0.8 to 0.0"
        }
      ],
      "healthScore": {
        "before": { "overall": 0.62, "compliance": 0.48 },
        "after": { "overall": 0.74, "compliance": 0.72 }
      },
      "tokensCost": 340
    }
  ]
}
```

> `usedArchive` flag tracks when Doctor accessed archived history for deep analysis.

#### .schema-version

```
1.0.0
```

> On startup, system reads this, compares to installed version's expected schema, runs sequential non-destructive migrations if needed (1.0.0 → 1.1.0 → 1.2.0).

### Module Access Matrix

| Module | Reads | Writes |
|---|---|---|
| Scanner | config | project-map, dependency-graph, keyword-index |
| Analyzer | project-map, keyword-index, task-history | — |
| Predictor | task-history, dependency-graph, keyword-index, patterns, metrics | — |
| Router | task-history, metrics | — |
| Compressor | project-map, patterns, keyword-index | — |
| Learner | task-history (latest), project-map | task-history, dependency-graph, patterns, metrics, keyword-index |
| Tracker | config, metrics | metrics |
| Doctor | task-history, patterns, metrics, dep-graph, archive/* (with permission) | patterns, metrics, doctor-log |
| Visibility | All files (read-only) | — |
| Config CLI | config | config |

> **Only 3 modules write** (Learner, Tracker, Doctor) plus Scanner on init/rescan. Minimizes write contention and corruption risk.

### Inline Feedback Flow

```
┌──────────────────────────────────────────────────────────┐
│  ✓ Task complete | Predicted 4/5 files | Sonnet | 1,200t │
│  [👍 Good]  [👎 Bad]  [→ Skip]                           │
└──────────────────────────────────────────────────────────┘
         │                    │
         ▼                    ▼
    feedback:            ┌─────────────────────────────┐
    { rating: "good" }   │ What went wrong?             │
                         │ [1] Missed important files   │
                         │ [2] Predicted wrong files    │
                         │ [3] Wrong model selected     │
                         │ [4] Describe...              │
                         └─────────────────────────────┘
                                      │
                              feedback: { rating: "bad",
                                quickReason: "missed-files" }
                                      │
                              or if [4] selected:
                              feedback: { rating: "bad",
                                details: "missed styles.css" }
```

### Data Flow Per Task (Complete)

```
User prompt
    │
    ▼
[Analyzer] ─── reads: project-map, keyword-index, task-history ──► classification
    │
    ▼
[Predictor] ── reads: task-history, dep-graph, keyword-index, patterns, metrics ──► predicted files
    │
    ▼
[Router] ───── reads: task-history, metrics ──► model selection
    │
    ▼
[Compressor] ─ reads: project-map, patterns, keyword-index ──► generated prompt
    │
    ▼
[Prompt Review] ── user sees generated prompt ──► [Enter] send | [e] edit | [c] cancel
    │
    ▼
  Claude Code (executes with final prompt + predicted files + selected model)
    │
    ▼
[Inline Feedback] ── [👍] [👎] [→] ──► feedback captured
    │
    ▼
[Learner] ──── writes: task-history, dep-graph, patterns, metrics, keyword-index ──► knowledge updated
    │
    ▼
[Tracker] ──── writes: metrics ──► token usage logged
    │
    ▼
[Doctor Check] ─ reads: metrics ──► alert if threshold breached
```

## CLI Interface Design

### Binary & Alias

```
claude-opt <command> [options]    # Full name
co <command> [options]            # Short alias (installed alongside)
```

### Global Flags

| Flag | Short | Description |
|---|---|---|
| `--verbose` | `-v` | Show detailed internal processing |
| `--quiet` | `-q` | Suppress non-essential output |
| `--json` | | Output in JSON format (for scripting/piping) |
| `--help` | `-h` | Show help for any command |
| `--version` | | Show installed version |
| `--no-color` | | Disable colored terminal output |

### Commands

#### `co init [path]` — Initialize Project

| Argument/Flag | Description | Default |
|---|---|---|
| `[path]` | Project directory | Current directory |
| `--type` | Force type: `code`, `research`, `mixed` | Auto-detected |
| `--budget <tokens>` | Set token budget | 44000 |
| `--window-duration <hours>` | Set sliding window duration | 5 |
| `--doctor-mode <mode>` | `supervised` or `autonomous` | supervised |

```
$ co init

⏳ Configuring...
✓ Project type: mixed (code + documents)
✓ Token budget: 44,000 | Window: 5h

⏳ Scanning project...
✓ 142 files indexed (87 code, 43 documents, 12 config)
✓ 218 dependency edges mapped
✓ 14 domains identified
✓ 1,247 keywords indexed

⏳ Seeding knowledge...
✓ Starter pack applied: TypeScript + React
✓ 24 common patterns pre-loaded
✓ CLAUDE.md updated with discovered conventions

✓ Knowledge store ready: .claude-opt/

Next: Run co doctor --checkup to verify setup before your first task.
```

#### `co scan` — Re-scan Project

| Flag | Description | Default |
|---|---|---|
| `--full` | Force full rescan | Incremental |

```
$ co scan
⏳ Incremental scan...
✓ 3 files changed, 1 new, 0 deleted
✓ 4 dependency edges updated
✓ 2 keywords added
Done in 0.8s
```

#### `co "<task>"` — Execute Optimized Task (Core Command)

| Flag | Description |
|---|---|
| `--dry-run` | Show analysis without executing. Zero tokens |
| `--model <model>` | Override model: haiku, sonnet, opus |
| `--no-predict` | Skip file prediction |
| `--no-compress` | Skip prompt compression |

**Normal execution:**
```
$ co "add confidence decay to pattern detection"

┌─ Task Analysis ─────────────────────────────────────┐
│ Type: feature  Domain: learning-engine  Complexity: medium │
│ Model: sonnet (historical success: 92%)             │
│ Predicted files (5):                                │
│   ✦ src/patterns.ts         confidence: 0.92        │
│   ✦ src/learner.ts          confidence: 0.88        │
│   ✦ src/types.ts            confidence: 0.71        │
│   ○ src/config.ts           confidence: 0.45        │
│   ○ tests/patterns.test.ts  confidence: 0.42        │
│ ✦ = high confidence  ○ = moderate                   │
└─────────────────────────────────────────────────────┘

┌─ Generated Prompt (340 → 210 tokens, 38% reduction) ┐
│                                                      │
│ Context: TypeScript project, learning-engine domain.  │
│ Files: src/patterns.ts (pattern storage with          │
│ confidence 0-1 floats), src/learner.ts (learning      │
│ loop), src/types.ts (shared types).                   │
│ Convention: evidence_count drives confidence.          │
│                                                      │
│ Task: Add confidence decay to pattern detection.      │
│ Implement exponential decay on pattern confidence     │
│ scores based on time since last seen.                 │
│                                                      │
├──────────────────────────────────────────────────────┤
│ [Enter] Send as-is  [e] Edit prompt  [c] Cancel      │
└──────────────────────────────────────────────────────┘

⏳ Executing via Claude Code (sonnet)...

[Claude Code output appears here naturally]

┌─ Result ─────────────────────────────────────────────┐
│ ✓ Tokens: 1,200 used | est. 2,800 without optimizer │
│ ✓ Saved: ~1,600 tokens (57%)                        │
│ ✓ Prediction: 4/5 correct (precision: 80%)          │
│ Window: 18,200 / 44,000 (41%) | 2h 12m remaining    │
├──────────────────────────────────────────────────────┤
│ [👍 Good]  [👎 Bad]  [→ Skip]                        │
└──────────────────────────────────────────────────────┘
```

**75% budget warning (inline):**
```
┌─ Result ─────────────────────────────────────────────┐
│ ✓ Tokens: 1,400 used | Saved: ~1,200 (46%)          │
│ ⚠ Budget: 33,400 / 44,000 (76%) | 1h 03m remaining  │
│   Consider: use --dry-run to preview before executing │
├──────────────────────────────────────────────────────┤
│ [👍 Good]  [👎 Bad]  [→ Skip]                        │
└──────────────────────────────────────────────────────┘
```

**90% budget warning (blocking):**
```
┌─ ⚠ Budget Warning ──────────────────────────────────┐
│                                                      │
│ You've used 90% of your token budget.                │
│ 39,800 / 44,000 tokens consumed.                     │
│ Remaining: ~4,200 tokens (~1-2 simple tasks)         │
│                                                      │
│ Window resets in: 47 minutes (at 14:00)              │
│                                                      │
│ [1] Continue anyway                                   │
│ [2] Wait for reset (47m)                              │
│ [3] Cancel this task                                  │
└──────────────────────────────────────────────────────┘
```

**Budget exhausted:**
```
┌─ ⛔ Budget Exhausted ────────────────────────────────┐
│                                                      │
│ Token budget fully consumed for this window.          │
│ 44,000 / 44,000 tokens used.                         │
│                                                      │
│ Next window opens in: 1h 23m (at 15:23)              │
│                                                      │
│ Tip: Use this time to review stats and plan next      │
│ tasks with co --dry-run                               │
└──────────────────────────────────────────────────────┘
```

**Dry-run:**
```
$ co --dry-run "add dark mode to settings panel"

┌─ Dry Run (no tokens spent) ─────────────────────────┐
│ Type: feature  Domain: ui-settings  Complexity: medium │
│ Would route to: sonnet                               │
│ Predicted files (8):                                 │
│   ✦ src/components/Settings.tsx    conf: 0.94        │
│   ✦ src/styles/settings.css        conf: 0.91        │
│   ✦ src/hooks/useTheme.ts          conf: 0.87        │
│   ✦ src/context/ThemeContext.tsx    conf: 0.85        │
│   ✦ src/types/theme.ts             conf: 0.80        │
│   ✦ tests/Settings.test.tsx        conf: 0.78        │
│   ○ src/constants/colors.ts        conf: 0.52        │
│   ○ src/components/Header.tsx      conf: 0.41        │
│ Prompt compression: est. 42% reduction               │
│ Est. token cost: ~1,800 (vs ~4,200 raw)              │
└──────────────────────────────────────────────────────┘
```

#### `co stats` — Performance Dashboard

| Flag | Description |
|---|---|
| `--domain <name>` | Filter to specific domain |
| `--sessions <n>` | Last N sessions (default: all) |
| `--trend` | Show accuracy trend over time |

```
$ co stats

┌─ claude-opt Stats ──────────────────────────────────┐
│                                                      │
│ Total tasks: 47  |  Sessions: 12  |  Domains: 6     │
│                                                      │
│ Prediction Accuracy                                  │
│   Precision: 82%  ████████░░  Recall: 76%  ████████░░│
│                                                      │
│ Token Savings                                        │
│   Total saved: 34,200 tokens                         │
│   Savings rate: 54.6%                                │
│   Avg per task: 728 tokens saved                     │
│                                                      │
│ Model Usage                                          │
│   Haiku: 24 tasks (51%)  Sonnet: 21 (45%)  Opus: 2  │
│                                                      │
│ Top Domains by Accuracy                              │
│   learning-engine   89% ████████▉░                   │
│   ui-components     84% ████████▍░                   │
│   api-routes        78% ███████▊░░                   │
│   thesis-ch3        75% ███████▌░░                   │
│                                                      │
└──────────────────────────────────────────────────────┘
```

**With `--trend`:**
```
Prediction Accuracy Over Time

  100%│
   90%│                              ●─●
   80%│                    ●───●──●─╯
   70%│              ●──●─╯
   60%│        ●──●─╯
   50%│  ●──●─╯
   40%│─╯
      └────────────────────────────────
       s1  s2  s3  s4  s5  s6  s7  s8  s9  s10 s11 s12
```

#### `co budget` — Token Window Status

```
$ co budget

┌─ Token Budget ──────────────────────────────────────┐
│                                                      │
│ Window: 09:00 — 14:00 (2h 12m remaining)             │
│                                                      │
│ ██████████████░░░░░░░░░░░░░░░░  41% used             │
│ 18,200 / 44,000 tokens                               │
│                                                      │
│ Remaining: 25,800 tokens                             │
│ Est. tasks remaining: ~8-12 (based on avg usage)     │
│ Window resets at: 14:00 (2h 12m from now)            │
│                                                      │
│ Session breakdown:                                    │
│   Task 1-5:   6,200t  ░░░░░░░░                       │
│   Task 6-10:  5,800t  ░░░░░░░                        │
│   Task 11-14: 6,200t  ░░░░░░░░                       │
│                                                      │
└──────────────────────────────────────────────────────┘
```

#### `co knowledge <domain>` — Inspect Domain Knowledge

| Flag | Description |
|---|---|
| `--all` | Show all domains |
| `--files` | File list only |
| `--patterns` | Patterns only |

```
$ co knowledge learning-engine

┌─ Knowledge: learning-engine ────────────────────────┐
│                                                      │
│ Files (8):                                           │
│   src/patterns.ts        weight: 0.92  seen: 12x    │
│   src/learner.ts         weight: 0.88  seen: 11x    │
│   src/types.ts           weight: 0.71  seen: 8x     │
│   src/config.ts          weight: 0.65  seen: 7x     │
│   tests/patterns.test.ts weight: 0.58  seen: 6x     │
│   src/decay.ts           weight: 0.52  seen: 4x     │
│   src/weights.ts         weight: 0.45  seen: 3x     │
│   src/index.ts           weight: 0.30  seen: 2x     │
│                                                      │
│ Patterns (3):                                        │
│   ✦ patterns.ts + learner.ts co-occur (conf: 0.89)  │
│   ✦ patterns.ts + types.ts co-occur (conf: 0.74)    │
│   ○ decay.ts + weights.ts co-occur (conf: 0.52)     │
│                                                      │
│ Conventions:                                         │
│   "confidence is a 0-1 float"                        │
│   "evidence_count drives confidence"                 │
│                                                      │
│ Accuracy: 89% precision | 81% recall | 12 tasks     │
│ Health: ●●●●○ Good                                   │
└──────────────────────────────────────────────────────┘
```

#### `co doctor` — Run Diagnostics

| Flag | Description |
|---|---|
| `--domain <name>` | Focus on specific domain |
| `--deep` | Analyze archived history (asks permission, warns about cost) |
| `--checkup` | Pre-flight validation — verify setup is correct before first use. Zero token cost |
| `--report-only` | Show findings without proposing fixes |

**Pre-flight checkup (run after init):**
```
$ co doctor --checkup

⏳ Running pre-flight check...

┌─ Pre-Flight Checkup ───────────────────────────────┐
│                                                      │
│ ✓ Knowledge store        All 8 files valid           │
│ ✓ Project map            142 files, 14 domains       │
│ ✓ Dependency graph       218 edges, fully connected   │
│ ✓ Keyword index          1,247 keywords mapped        │
│ ✓ Starter pack           TypeScript + React loaded    │
│ ✓ Config                 Budget: 44k, Window: 5h     │
│ ✓ Doctor mode            Supervised (default)         │
│                                                      │
│ Readiness: ●●●●● Ready to go!                       │
│                                                      │
│ Tip: Your first few sessions will have ~50-60%       │
│ prediction accuracy. This improves to 80%+ by        │
│ session 5-10 as the system learns your patterns.     │
│                                                      │
└──────────────────────────────────────────────────────┘

You're all set! Run: co "your first task"
```

**Pre-flight with issues:**
```
$ co doctor --checkup

⏳ Running pre-flight check...

┌─ Pre-Flight Checkup ───────────────────────────────┐
│                                                      │
│ ✓ Knowledge store        All 8 files valid           │
│ ✓ Project map            142 files, 14 domains       │
│ ⚠ Dependency graph       218 edges, 3 isolated nodes │
│ ✓ Keyword index          1,247 keywords mapped        │
│ ✓ Starter pack           TypeScript + React loaded    │
│ ⚠ Config                 Window duration unset        │
│ ✓ Doctor mode            Supervised (default)         │
│                                                      │
│ Readiness: ●●●○○ Needs attention (2 issues)          │
│                                                      │
│ Issues:                                               │
│  ⚠ 3 files have no dependency connections            │
│  ⚠ Window duration defaulted — confirm matches plan  │
│                                                      │
│ [1] Auto-fix what I can                               │
│ [2] Continue anyway (issues are minor)                │
│ [3] I'll fix manually                                 │
└──────────────────────────────────────────────────────┘
```

**Standard diagnostic:**
```
$ co doctor

⏳ Analyzing knowledge store health...

┌─ Doctor Report ─────────────────────────────────────┐
│                                                      │
│ Health Score: 62% ██████▏░░░ (was 68% last check)    │
│                                                      │
│ Findings (3):                                        │
│                                                      │
│  ⚠ MEDIUM: Stale pattern detected                    │
│    old-auth-middleware.ts — weight 0.8, unused 6 tasks│
│    → Fix: Remove from active predictions             │
│                                                      │
│  ⚠ LOW: Missing co-occurrence                        │
│    hipaa-compliance.ts + audit-logger.ts (4/5 tasks) │
│    → Fix: Add pattern (confidence: 0.80)             │
│                                                      │
│  ℹ INFO: Thin domain                                 │
│    compliance has only 3 tasks. Need ~8+ for reliable │
│    predictions. → No fix needed.                     │
│                                                      │
│ Cost: 340 tokens (Haiku)                             │
├──────────────────────────────────────────────────────┤
│ Apply fixes?                                          │
│  [1] Apply all (2 fixes)                              │
│  [2] Review one by one                                │
│  [3] Skip — I'll handle manually                     │
└──────────────────────────────────────────────────────┘
```

**Deep analysis prompt:**
```
$ co doctor --deep

⚠ Deep analysis reads archived task history.
  Archive: 1,247 tasks (2026-01-15 to 2026-02-28)
  Estimated cost: ~800-1,200 tokens

  [1] Proceed with deep analysis
  [2] Standard analysis only
  [3] Cancel
```

**Supervised mode auto-trigger alert:**
```
┌─ ⚠ Doctor Alert ────────────────────────────────────┐
│                                                      │
│ Prediction accuracy in "compliance" domain dropped   │
│ to 48% (threshold: 60%).                             │
│                                                      │
│ [1] Let Doctor diagnose                               │
│ [2] I'll handle it manually                           │
│ [3] Dismiss                                           │
└──────────────────────────────────────────────────────┘
```

#### `co forget <file>` — Remove File from Predictions

```
$ co forget src/old-auth-middleware.ts

✓ Removed from predictions:
  - Cleared from keyword index (3 keywords)
  - Removed from 1 co-occurrence pattern
  - Zeroed weight in task history
  - Will not be predicted unless re-discovered

Undo? Run: co scan (re-indexes if file still exists)
```

#### `co correct` — Detailed Prediction Feedback

| Flag | Description |
|---|---|
| `--task <id>` | Correct a specific task (default: last) |

```
$ co correct

Last task: "add confidence decay" (t_20260304_001)
Prediction: 4/5 correct (precision: 80%, recall: 67%)

What was wrong?
  [1] Missed file(s)
  [2] Wrong file(s) predicted
  [3] Wrong model (too weak/strong)
  [4] Everything off
  [5] Describe in your own words
> 1

Which files were missed? (tab-complete available)
> src/config.ts, src/constants.ts

✓ Feedback recorded. These files boosted for similar tasks.
```

#### `co config [key] [value]` — View/Update Settings

| Key | Values | Default |
|---|---|---|
| `token-budget` | Positive integer | 44000 |
| `window-duration` | Hours (decimal) | 5 |
| `doctor-mode` | `supervised`, `autonomous` | supervised |
| `doctor-threshold` | 0.0 - 1.0 | 0.60 |
| `budget-warn-inline` | 0.0 - 1.0 | 0.75 |
| `budget-warn-blocking` | 0.0 - 1.0 | 0.90 |
| `task-history-cap` | Positive integer | 500 |

```
$ co config

┌─ Configuration ─────────────────────────────────────┐
│ token-budget:        44,000                          │
│ window-duration:     5h                              │
│ doctor-mode:         supervised                      │
│ doctor-threshold:    0.60                            │
│ budget-warn-inline:  75%                             │
│ budget-warn-blocking: 90%                            │
│ task-history-cap:    500                             │
│ project-type:        mixed (auto-detected)           │
└──────────────────────────────────────────────────────┘

$ co config window-duration 4
✓ window-duration updated: 5h → 4h
```

### Exit Codes

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | General error (invalid command, missing args) |
| 2 | Knowledge store not initialized (run `co init`) |
| 3 | Claude Code execution failed (pass-through) |
| 4 | Doctor Agent error |
| 10 | Fallback mode — optimizer failed, task sent raw to Claude Code |

> Exit code 10 = fail-open design activated. Task still executed, but unoptimized. Logged for Doctor analysis.

### Command Summary

| Command | Purpose | Tokens |
|---|---|---|
| `co init` | Initialize project | None |
| `co scan` | Re-scan files | None |
| `co "<task>"` | Execute optimized task | Yes |
| `co --dry-run "<task>"` | Preview analysis | None |
| `co stats` | Performance dashboard | None |
| `co budget` | Token window status + time remaining | None |
| `co knowledge <domain>` | Inspect domain knowledge | None |
| `co doctor` | Run diagnostics | ~340-500t |
| `co doctor --checkup` | Pre-flight setup validation | None |
| `co doctor --deep` | Deep analysis with archive | ~800-1200t |
| `co forget <file>` | Remove file from predictions | None |
| `co correct` | Detailed prediction feedback | None |
| `co config` | View/update settings | None |

## Risk Analysis & Mitigations

### Technical Risks

| ID | Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|---|
| TR-01 | **Claude Code CLI interface changes** — Anthropic updates CLI, breaking middleware | High | High | **Adapter pattern.** Interface isolated behind adapter module. Version detection warns on unsupported versions. Fail-open: pass-through to raw Claude Code. Community can submit adapter PRs quickly |
| TR-02 | **Token counting inaccuracy** — Estimates off by 10-20% without direct API access | Medium | High | **Conservative estimation + calibration.** Use tiktoken-equivalent. Track actual vs estimated, auto-calibrate multiplier. Show estimates as ranges. Budget warnings trigger slightly early as safety margin |
| TR-03 | **Cold start frustration** — First sessions have low accuracy, users expect instant value | High | High | **Starter knowledge packs + learning progress UX.** Seed common patterns on init. During first 5 sessions show: "Session 2/5 — building knowledge (precision: 58%, improving)". Set expectations upfront |
| TR-04 | **Knowledge store corruption** — Power failure or bugs corrupt JSON files | High | Medium | **Atomic writes.** Write to temp file, then rename (atomic on all OS). If JSON parse fails, fall back to empty state (fail-open). v1.1: full backup + rollback |
| TR-05 | **Large project performance** — 1000+ file projects exceed performance targets | Medium | Medium | **Tiered scanning.** Lazy-load file content, cap keyword index depth, aggressive content hash skipping. Log: "Large project detected — first scan may take longer" |
| TR-06 | **Cross-platform path handling** — Windows backslashes, case sensitivity, symlinks | Medium | High | **Normalized paths from day one.** All internal paths POSIX format. Normalize on input, denormalize on output. Dedicated path utility with cross-platform CI tests |
| TR-07 | **Doctor Agent token drain** — Doctor consumes too many tokens | Medium | Low | **Hard cap.** 500t standard, 1,200t deep. Auto-trigger limited to once per session. Show Doctor cost in stats |
| TR-08 | **Sliding window timing drift** — Actual window behavior differs from assumption | Medium | Medium | **User-observed calibration.** Configurable 5h default. Track rate limit errors to auto-detect actual boundaries. "Estimated" label on timing. Manual window start via `co config window-start now` |
| TR-09 | **Prompt compression semantic loss** — Compression changes user intent | High | Medium | **Conservative rules + preview.** Remove only known filler. Never remove nouns/verbs/domain terms. Always show prompt for review with edit option. `--no-compress` escape hatch. Track compression-vs-success correlation |

### Product Risks

| ID | Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|---|
| PR-01 | **Non-developer intimidation** — Researchers find CLI too technical | High | Medium | **"Labmate install" workflow.** Guided first-run, "For Researchers" quick-start in README, zero jargon in research mode. Future: VS Code extension |
| PR-02 | **Feedback fatigue** — Users ignore inline prompts, starving learning system | Medium | High | **Passive learning primary.** System learns from predicted vs actual files regardless of feedback. Inline feedback is bonus signal. Reduce prompt frequency after 20+ consistent sessions |
| PR-03 | **Prediction errors eroding trust** — Bad early predictions make users distrust all predictions | High | Medium | **Transparency as trust.** Confidence scores on every prediction. Low confidence marked clearly. Show improvement: "Precision: 65% up from 52% last session" |
| PR-04 | **Configuration overload** — Too many options overwhelm non-power users | Medium | Low | **Progressive disclosure.** Sensible defaults, zero required config. Advanced settings only via `co config`. Group as "Essential" vs "Advanced" |
| PR-05 | **Optimizer overhead perceived as slowdown** — 200-500ms delay feels like friction | Medium | Medium | **Async pre-processing.** Start analysis while Claude Code launches. Show analysis box during wait time. Display timing: "Analysis: 180ms, Claude: 2.4s" |

### Business & Ecosystem Risks

| ID | Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|---|
| BR-01 | **Anthropic changes Pro plan** — Token limits increase, reducing optimization value | High | Medium | **Value beyond tokens.** Position on session intelligence and time savings. Even unlimited tokens can't fix session amnesia — the tool saves *time*, not just tokens. Reframe messaging if limits change |
| BR-02 | **Claude Code adds native optimization** — Anthropic builds session persistence | Medium | **Low** | **Anthropic's business model incentivizes token consumption, not savings.** They're unlikely to build what reduces their revenue. If they add basic persistence, the optimizer's intelligent prediction, model routing, and Doctor still add unique value. Monitor roadmap, pivot early if overlap detected |
| BR-03 | **Single maintainer bottleneck** — Project stalls during Dulhara's unavailability | Medium | High | **Early co-maintainer recruitment.** 1-2 co-maintainers from early contributors. Document everything. GitHub Actions for automated releases. Project maintainable without Dulhara for weeks |
| BR-04 | **Low contributor engagement** — External contributors don't materialize | Medium | Medium | **Contribution-friendly design.** One-file-per-language parser interface. "Good first issue" labels. Clear CONTRIBUTING.md. Consider bounties for high-value contributions |
| BR-05 | **Competitor tool emerges** — Another tool solves same problem differently | Medium | Medium | **Speed and community.** Ship MVP fast, build community early. First tool with users and contributors usually wins. Focus on developer experience and word-of-mouth |

### Risk Priority Matrix

```
                    LIKELIHOOD
            Low         Medium        High
         ┌───────────┬───────────┬───────────┐
  High   │ TR-04     │ TR-03     │ TR-01     │
         │           │ TR-09     │ TR-06     │
SEVERITY │           │ PR-01     │           │
         │           │ PR-03     │           │
         │           │ BR-01     │           │
         ├───────────┼───────────┼───────────┤
  Medium │ PR-04     │ TR-05     │ TR-02     │
         │ TR-07     │ TR-08     │ PR-02     │
         │           │ PR-05     │ BR-03     │
         │           │ BR-02     │           │
         │           │ BR-04     │           │
         │           │ BR-05     │           │
         └───────────┴───────────┴───────────┘
```

### Top 5 Risks That Could Kill the Project

1. **TR-03: Cold start frustration** — Users abandon before value is proven. *Mitigated by: starter packs + learning progress UX*
2. **TR-01: Claude Code CLI changes** — Breaks tool entirely. *Mitigated by: adapter pattern + fail-open + fast community patches*
3. **BR-01: Pro plan changes** — Weakens value prop. *Mitigated by: position on time savings, not just tokens*
4. **PR-03: Trust erosion** — Users disable core feature. *Mitigated by: transparency, confidence scores, prompt review/edit*
5. **BR-03: Single maintainer** — Project stalls. *Mitigated by: early co-maintainer recruitment, full documentation*

> **Note:** BR-02 (Claude Code native optimization) downgraded from Critical/Medium to Medium/Low. Anthropic's business model incentivizes token consumption — building a token optimizer would cannibalize their own revenue. The risk exists but is structurally unlikely.

## Implementation Phasing — 1-Week Intensive Sprint

**Build approach:** Continuous development with Claude Code. Solo developer (Dulhara) who designed every requirement and knows the system end-to-end. Compressed from 10-week standard timeline to 1-week intensive sprint.

### Day 1: Foundation & Skeleton

**Goal:** `co init` → `co doctor --checkup` works end-to-end

| Order | Task | Requirements |
|---|---|---|
| 1.1 | CLI skeleton — Commander.js, `co` alias, global flags, help, version | — |
| 1.2 | Knowledge Store — all 9 JSON file schemas, read/write utilities, atomic writes, schema version | KS-01 to KS-07, KS-10 |
| 1.3 | Config system — `co config` view/update with all defaults | Config |
| 1.4 | Path normalization utility — POSIX internal, cross-platform I/O | NF-04 |
| 1.5 | Project Scanner — `co init`, `co scan`, project-map, dep-graph, keyword-index, .gitignore/.claudeignore | SC-01 to SC-07, SC-10, SC-11 |
| 1.6 | Starter Knowledge Packs — TypeScript/Node, React, Python, Research/Markdown | SC-08, SC-09 |
| 1.7 | Doctor checkup — `co doctor --checkup` pre-flight validation | DR-14, DR-15 |

**End-of-day gate:**
```bash
co init && co doctor --checkup && co config   # All three work
```

### Day 2: Analysis Pipeline

**Goal:** `co "task"` runs with full analysis, prompt review, and Claude Code execution

| Order | Task | Requirements |
|---|---|---|
| 2.1 | Task Analyzer — keyword classification (type, domain, complexity) for code + research | TA-01 to TA-06 |
| 2.2 | File Predictor — multi-signal prediction, confidence scores, graceful degradation | FP-01 to FP-08 |
| 2.3 | Model Router — Haiku/Sonnet/Opus selection with rationale | MR-01 to MR-06 |
| 2.4 | Prompt Compressor — filler removal, context injection, systematic prompt generation | PC-01 to PC-04, PC-07, PC-08 |
| 2.5 | Prompt Review/Edit — `[Enter] Send / [e] Edit / [c] Cancel` | PC-05, PC-06 |
| 2.6 | Claude Code adapter — intercept, pass-through, capture output, fail-open fallback | NF-03 |
| 2.7 | `co --dry-run` mode | VL-04 |
| 2.8 | Task analysis display box (terminal UI) | VL-08 partial |

**End-of-day gate:**
```bash
co "fix the bug"                # Full pipeline end-to-end
co --dry-run "add feature"      # Analysis without execution
```

### Day 3: Learning Loop & Feedback

**Goal:** System captures outcomes and improves. Feedback flows in.

| Order | Task | Requirements |
|---|---|---|
| 3.1 | Knowledge Learner — post-task capture: predicted vs actual, model success, tokens | KL-01 to KL-05, KL-08 |
| 3.2 | Self-correcting weights — boost/decay based on accuracy, stale entry decay (Tier 1) | KL-06, KL-07 |
| 3.3 | Inline feedback — `[👍] [👎] [→ Skip]` with quick-reason expansion | VL-06 |
| 3.4 | `co correct` — detailed feedback with file-level corrections | VL-07 |
| 3.5 | Token Tracker — per-task, per-session, per-window, savings estimation | TT-01 to TT-04, TT-10 |
| 3.6 | Budget warnings — inline at 75%, blocking at 90% with countdown | TT-05 |
| 3.7 | Window time estimation — remaining time, reset countdown, configurable duration | TT-06 to TT-09 |

**End-of-day gate:**
```bash
# Run 3+ tasks, verify:
# - Prediction accuracy tracked
# - Inline feedback works
# - Budget display shows time remaining
# - 75%/90% warnings trigger correctly
```

### Day 4: Doctor Agent & Recovery

**Goal:** Three-tier recovery system fully operational

| Order | Task | Requirements |
|---|---|---|
| 4.1 | Doctor diagnostic engine — stale patterns, missing co-occurrences, bad predictions | DR-01 to DR-05 |
| 4.2 | Supervised mode — propose fixes, user approval, three-option prompt | DR-06, DR-09 |
| 4.3 | Autonomous mode — auto-apply low-risk, ask for medium/high-risk | DR-07 |
| 4.4 | Threshold detection & alerts — per-domain monitoring, 60% trigger | DR-08 |
| 4.5 | Doctor audit log — all actions to doctor-log.json | DR-12 |
| 4.6 | Deep analysis with archives — permission flow, archived history access | DR-13 |
| 4.7 | Haiku routing + token cap enforcement | DR-10, DR-16 |
| 4.8 | Health score reporting — overall + per-domain | DR-11 |
| 4.9 | Task history capping & archiving — cap at 500, overflow to archive/ | KS-08, KS-09 |
| 4.10 | `co forget <file>` | VL-05 |

**End-of-day gate:**
```bash
co doctor                       # Full diagnostic report
co doctor --deep                # Archive access flow
co forget src/old-file.ts       # File removed
co config doctor-mode autonomous  # Mode switch works
```

### Day 5: Visibility & Stats

**Goal:** All visibility commands working with visualizations

| Order | Task | Requirements |
|---|---|---|
| 5.1 | `co stats` — full dashboard: accuracy, savings, model usage, domain breakdown | VL-01 |
| 5.2 | `co stats --trend` — accuracy trend graph (ASCII visualization) | VL-09 |
| 5.3 | `co budget` — window status, time remaining, session breakdown | VL-02 |
| 5.4 | `co knowledge <domain>` — files, patterns, conventions, health per domain | VL-03 |

**End-of-day gate:**
```bash
co stats                        # Dashboard renders
co stats --trend                # Trend graph shows
co budget                       # Time estimation correct
co knowledge learning-engine    # Domain inspection works
```

### Day 6: Hardening & Cross-Platform

**Goal:** Bulletproof. Every edge case handled.

| Order | Task | Requirements |
|---|---|---|
| 6.1 | Cross-platform testing — Windows, macOS, Linux path handling | NF-04 |
| 6.2 | Performance benchmarks — scan <10s, prediction <200ms, overhead <500ms | NF-01, SC-10 |
| 6.3 | Fail-open hardening — every module tested for graceful failure | NF-03 |
| 6.4 | Schema migration system — version detection, sequential migration | Schema versioning |
| 6.5 | Error handling polish — meaningful messages, exit codes, edge cases | Exit codes |
| 6.6 | Dependency audit — confirm <15 production deps, no native binaries | NF-07 |
| 6.7 | End-to-end integration tests — full learning loop across 10+ simulated sessions | All NFRs |

**End-of-day gate:**
```bash
# Full test suite green
# Performance benchmarks met
# Clean install on fresh machine works
# Fail-open verified (corrupt knowledge store → graceful fallback)
```

### Day 7: Documentation & Release

**Goal:** Ship it.

| Order | Task | Requirements |
|---|---|---|
| 7.1 | README.md — project overview, install, quick-start (developer + researcher sections), screenshots | — |
| 7.2 | CONTRIBUTING.md — parser interface guide, PR template, code standards | NF-06 |
| 7.3 | Architecture docs — module diagram, data flow, knowledge store schema reference | — |
| 7.4 | npm package configuration — package.json, global install, `co` alias, `npx` support | NF-07 |
| 7.5 | GitHub repo setup — issues templates, labels ("good first issue"), CI/CD | — |
| 7.6 | Final smoke test — fresh install → init → checkup → 3 tasks → stats → doctor | Full loop |
| 7.7 | Publish to npm | — |

**End-of-day gate:**
```bash
npx claude-opt init             # Works on fresh machine
co doctor --checkup             # All green
co "first task"                 # Full pipeline
co stats                        # Shows real data
# README looks good, CONTRIBUTING is clear, npm published
```

### Sprint Summary

| Day | Focus | Requirements Covered |
|---|---|---|
| Day 1 | Foundation & Skeleton | ~28 |
| Day 2 | Analysis Pipeline | ~30 |
| Day 3 | Learning & Feedback | ~22 |
| Day 4 | Doctor & Diagnostics | ~14 |
| Day 5 | Visibility & Stats | ~4 + polish |
| Day 6 | Hardening & Testing | All NFRs |
| Day 7 | Docs & Release | Ship |

### Critical Path (Must Not Slip)

```
Day 1: Knowledge Store + Scanner ──► Day 2: Analyzer + Predictor ──► Day 3: Learner
```

If Day 1 slips, everything shifts. The core learning loop (Days 1-3) is the product's heartbeat.

### Parallel Opportunities

While Claude Code builds a module, you can:
- Write starter pack content (research patterns, React conventions)
- Draft README sections
- Design test scenarios
- Review and refine generated code

## Open Questions & Decisions Log

### Resolved Decisions

Every major decision made during PRD creation, documented for future reference.

| # | Decision | Options Considered | Choice | Rationale | Step |
|---|---|---|---|---|---|
| D-01 | Target audience | Developers only vs developers + researchers | **Developers + researchers** | Dulhara's sister (marine science PhD) and her friend (biochemistry MSc) are real users who hit session amnesia doing literature review and thesis work. Same problem, different domain | Step 4 |
| D-02 | Manual correction (forget, edit store) | MVP vs Growth | **MVP** | Power users like Priya need control from day one. Without correction tools, bad predictions compound | Step 4 |
| D-03 | Non-code project support | MVP vs Growth | **MVP** | Researchers are first-class users. Scanner must understand markdown structure, not just code imports | Step 4 |
| D-04 | Doctor Agent | MVP vs Growth | **MVP** | Three-tier recovery (self-correct → doctor → manual) is a core differentiator. Without the Doctor, only power users can fix problems | Step 4 |
| D-05 | Doctor Agent operating modes | Auto-only vs user-summoned only vs both | **Both with toggle** | Supervised (default): alerts user, waits for acknowledgement. Autonomous (opt-in): runs automatically. Respects user autonomy while offering convenience | Step 5 |
| D-06 | Doctor threshold | 50% vs 60% vs 70% | **60% (configurable)** | Low enough to catch real problems, high enough to not trigger during cold start. User can adjust | Step 5 |
| D-07 | Token budget | Hardcoded vs configurable | **Configurable (default: 44,000)** | Anthropic may change limits. Different plans may have different budgets | Step 5 |
| D-08 | Knowledge store backup | MVP vs Growth | **Deferred to v1.1** | Documented for next version. MVP uses atomic writes for basic safety | Step 5 |
| D-09 | CLI Framework | Commander.js vs yargs | **Commander.js** | Lighter, zero dependencies, sufficient for ~8 subcommands | Step 6 |
| D-10 | Testing framework | Vitest vs Jest | **Vitest** | TypeScript-native, 2-5x faster, built-in coverage. Near-identical Jest API | Step 6 |
| D-11 | Schema versioning | MVP vs Growth | **MVP** | Users must never lose knowledge on upgrade. Auto-migration is essential for trust | Step 6 |
| D-12 | Doctor audit log | MVP vs Growth | **MVP** | Transparency builds trust. Every Doctor action logged for inspection | Step 6 |
| D-13 | Task history | Unbounded vs capped | **Capped at 500 + archive** | Active file stays fast (<50ms reads). Doctor can request archive access for deep analysis with user permission | Step 7 |
| D-14 | User feedback approach | Passive-only vs active-only vs both | **Both: inline pop + detailed CLI** | Inline `[👍][👎][→]` like Claude Code style for low friction. `co correct` for detailed corrections. System learns from actual file usage regardless | Step 7 |
| D-15 | CLI alias | `co` vs `copt` vs none | **`co`** | Short, fast for daily drivers. Installed alongside `claude-opt` | Step 8 |
| D-16 | Budget warning style | Inline only vs blocking only vs tiered | **Tiered: inline at 75%, blocking at 90%** | 75% is informational. 90% is consequential — user needs to make a choice | Step 8 |
| D-17 | Window duration | Hardcoded 5h vs configurable | **Configurable (default: 5h)** | Claude's sliding window may change. Users on different plans may have different windows | Step 8 |
| D-18 | BR-02 risk level (Anthropic builds optimizer) | Critical vs Medium vs Low | **Medium/Low** | Anthropic's business model incentivizes token consumption. Building a token optimizer would cannibalize revenue. Structurally unlikely | Step 9 |
| D-19 | Starter knowledge packs | MVP vs Growth | **MVP** | First session must have baseline intelligence. Mitigates cold start frustration (TR-03, the #1 risk) | Step 9 |
| D-20 | Prompt review/edit before sending | Show-only vs show+edit | **Show + edit** | User sees generated prompt, can adjust before sending. Builds trust, catches errors, gives control | Step 9 |
| D-21 | Onboarding checkup | Auto-run after init vs user-summoned | **User-summoned** | `co init` recommends checkup, user chooses to run `co doctor --checkup`. Introduces Doctor in positive context. Respects user autonomy | Step 9 |
| D-22 | Implementation timeline | 10-week standard vs compressed | **7-day intensive sprint** | Solo developer who designed every requirement. Claude Code assisted. Continuous development | Step 10 |

### Open Questions (To Resolve During Implementation)

| # | Question | Context | When to Decide |
|---|---|---|---|
| OQ-01 | **Exact Claude Code CLI intercept mechanism** — How does the optimizer actually wrap Claude Code? Subprocess spawning? stdin/stdout piping? Hook into Claude Code's internals? | This is the most critical technical unknown. The adapter pattern is designed but the actual integration mechanism needs prototyping | Day 2 (Pipeline build) |
| OQ-02 | **Token counting accuracy method** — tiktoken? Claude's tokenizer? Approximation with calibration? | Need to evaluate available tokenization libraries for Node.js and test accuracy against actual Claude consumption | Day 3 (Tracker build) |
| OQ-03 | **How to detect "actual files used" post-session** — How does the Learner know which files Claude actually read/modified? Parse Claude Code output? File modification timestamps? | This is the feedback signal for learning. Without accurate detection, prediction accuracy tracking breaks | Day 3 (Learner build) |
| OQ-04 | **Markdown structure parsing depth** — How deep to parse headings, links, references? Just H1/H2? Full heading tree? Cross-file link resolution? | Affects Amara's research workflow quality. Start simple (H1/H2 + links), expand if needed | Day 1 (Scanner build) |
| OQ-05 | **Starter pack content specifics** — What exact patterns/conventions to include in each pack? | Need to compile real-world patterns from TypeScript, React, Python, Research projects. Can crowdsource post-launch | Day 1 (Starter packs) |
| OQ-06 | **Inline feedback UI in terminal** — How to render `[👍][👎][→]` in a way that works across all terminal emulators? Emoji support varies | May need fallback to `[G]ood / [B]ad / [S]kip` for terminals without emoji support | Day 3 (Feedback build) |
| OQ-07 | **`co` alias installation** — How to reliably create the `co` alias on global npm install across platforms? Symlink? Separate bin entry? | npm `bin` field supports multiple entries. Test on Windows, macOS, Linux | Day 1 (CLI skeleton) |
| OQ-08 | **Doctor Agent prompt design** — What exact prompt to send to Haiku for knowledge store analysis? How to keep it under 500 tokens? | Need to craft a focused diagnostic prompt that fits within the token cap while covering all finding types | Day 4 (Doctor build) |
| OQ-09 | **Sliding window detection** — Can we detect when Claude actually rate-limits the user to calibrate window timing? | May need to parse Claude Code error output for rate limit signals. Improves TT-08 accuracy | Day 3 (Tracker) or post-MVP |
| OQ-10 | **Prompt edit UX in terminal** — `[e] Edit` should open $EDITOR or inline edit? How to handle terminals without $EDITOR set? | Fallback to inline edit (re-type prompt). $EDITOR preferred for longer prompts | Day 2 (Prompt Review) |

### Deferred to v1.1+ (Documented)

Items explicitly deferred from MVP with rationale:

| Item | Rationale | Priority for v1.1 |
|---|---|---|
| Knowledge store backup & corruption recovery | Atomic writes provide basic safety. Full backup/rollback adds complexity | High |
| TF-IDF similarity matching | Keyword matching sufficient for MVP. TF-IDF improves precision for similar tasks | Medium |
| Advanced pattern detection | Basic co-occurrence in MVP. Type-file affinity and convention discovery need more data | Medium |
| Dynamic `.claudeignore` generation | Nice to have. Users can manually create .claudeignore | Low |
| Analytics dashboard with historical trends | `co stats --trend` covers basic needs. Rich dashboard is Growth | Medium |
| Predictive task batching | Requires pattern data from many sessions. Post-MVP optimization | Low |
| Multi-project support | Per-project isolation exists. Cross-project management is Growth | High |
| Team knowledge sharing | Export/import knowledge stores for teams. Post-MVP community feature | Medium |
| Git hook integration | Auto-update knowledge on commits. Convenience, not core | Low |
| VS Code extension | Eliminates CLI for non-developers. High impact but separate project | High |
| Natural language knowledge queries | "What do I know about auth?" Nice UX. Post-MVP | Low |
| Community knowledge templates | Starter packs for common stacks. Community-driven post-launch | Medium |
| Plugin system for custom analyzers | Extensible parser covers languages. Full plugin system is overengineering for MVP | Low |

---

## PRD Complete

**Document:** Product Requirements Document — claude_optimizer (`claude-opt` / `co`)
**Author:** Dulhara
**Date:** 2026-03-04
**Status:** Complete — All 11 steps locked

### Final Numbers

| Metric | Count |
|---|---|
| Requirements (Functional) | 79 |
| Requirements (Non-Functional) | 19 |
| **Total Requirements** | **98** |
| User Journeys | 5 |
| Domains | 10 |
| CLI Commands | 12 |
| Knowledge Store Files | 9 |
| Risks Identified | 14 |
| Decisions Made | 22 |
| Open Questions | 10 |
| Deferred Items | 13 |
| Implementation Phases | 7 days |
