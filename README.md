<p align="center">
  <img src="claude-opt-banner.PNG" alt="claude-opt banner" width="100%" />
</p>

# claude-opt

**Intelligent token optimizer for [Claude Code](https://docs.anthropic.com/en/docs/claude-code).** Reduces context window usage through smart file prediction, prompt compression, and adaptive learning — so you get better results while spending fewer tokens.

Claude Code is powerful, but it can burn through tokens fast — especially on large codebases. Every prompt sends file contents, dependency context, and instructions that eat into your context window. **claude-opt** sits between you and Claude Code, learning your project's patterns to predict exactly which files are needed, compressing prompts intelligently, and routing tasks to the cheapest model that can handle them.

The result: **fewer tokens spent, more accurate predictions, and longer productive sessions** before hitting context limits.

---

## Why claude-opt?

**The problem:** Claude Code reads and sends entire files to the model, even when only a fraction is relevant. On a 500-file TypeScript project, a simple "fix the login bug" might send 15 files when only 3 matter. That's wasted tokens and wasted money.

**What claude-opt does:**
- Predicts which 3-5 files actually matter for your task using 7 different signals
- Compresses prompts by stripping filler words and redundant patterns
- Routes simple tasks to Haiku instead of Opus (15x cheaper)
- Learns from every task outcome to get more accurate over time
- Warns you before you blow your token budget

**Real impact:** After ~20 tasks, claude-opt typically achieves 70-85% prediction accuracy, reducing unnecessary file context by 40-60%.

---

## Features

### Core Pipeline (11 stages)

| Stage | What it does |
|-------|-------------|
| **Analyze** | Classifies your task — type (feature, bugfix, refactor...), domain, complexity (1-5) |
| **Predict** | Scores every file using 7 signals, returns top candidates above confidence threshold |
| **Route** | Picks the cheapest Claude model that can handle the task (Haiku/Sonnet/Opus) |
| **Compress** | Strips filler words, injects only relevant file context, respects token budget |
| **Budget Check** | Warns if you're approaching token limits (inline, awareness, or blocking level) |
| **Review** | Shows optimized prompt for approval — edit, cancel, or proceed |
| **Adapt** | Executes via Claude Code with the optimized context |
| **Track** | Records token usage, savings, per-model and per-type stats |
| **Learn** | Updates signal weights, co-occurrence patterns, keyword index from outcomes |
| **Feedback** | Optional inline feedback to fine-tune predictions |
| **Doctor** | Self-healing diagnostics — detects stale patterns, declining accuracy, thin domains |

Every stage except Review and Adapt is **fail-open** — errors degrade gracefully, never blocking your work.

### 7 Prediction Signals

| Signal | What it scores | How |
|--------|---------------|-----|
| **HistorySimilarity** | Files used in similar past tasks | TF-IDF keyword matching with 30-day recency decay |
| **GraphTraversal** | Files connected in the dependency graph | 2-hop traversal with decay (1-hop=1.0, 2-hop=0.5) |
| **KeywordLookup** | Files containing task keywords | IDF-weighted — rare keywords score higher |
| **CooccurrenceBoost** | Files that always appear together | Learned from past task outcomes |
| **TypeAffinity** | Files associated with this task type | Learned per-type file associations |
| **GitContext** | Recently changed files in git | Exponential decay from HEAD (0.8^distance) |
| **FileRecency** | Recently modified files | exp(-days / 14-day half-life) |

Signal weights **adapt automatically** per-domain as claude-opt learns your project. Cold-start defaults emphasize keyword and graph signals until enough history accumulates.

### Adaptive Learning

claude-opt doesn't just follow static rules — it gets smarter with use:

- **Signal weights** adjust per-domain based on which signals produce true/false positives
- **Confidence thresholds** optimize per-task-type using F1 scoring
- **Model routing** learns which model tier succeeds for each task type via Bayesian scoring
- **Co-occurrence patterns** automatically discover files that always change together
- **Convention detection** identifies your project's naming patterns, directory structure, and tooling

### Doctor & Diagnostics

A self-healing system that monitors knowledge store health:

- **Pre-flight checkup** — Validates store files, schema versions, config integrity
- **Diagnostic engine** — Detects stale patterns, declining accuracy, cross-domain dependencies, thin domains
- **Supervised mode** — Proposes fixes with confidence scores, you approve/reject
- **Autonomous mode** — Auto-applies low-risk fixes, logs everything for audit
- **Temporal decay** — Staleness scoring with exponential decay, not binary thresholds
- **Alert cooldown** — Won't nag you about the same issue within 24h or 10 tasks

---

## Two Ways to Use

### 1. CLI Tool (standalone)

Run `co` from your terminal. claude-opt classifies your task, predicts files, and shows you the optimization before executing.

```bash
co "add user authentication to the login page"
```

### 2. Claude Code Plugin (MCP + Hook)

claude-opt runs invisibly inside Claude Code, augmenting every prompt automatically.

```bash
co setup    # one-time: wires MCP server + hook into Claude Code
```

After setup, Claude Code gains:
- **Automatic context injection** — Every prompt gets augmented with predicted files and task classification via the UserPromptSubmit hook
- **8 MCP tools** — Claude can call `co_classify`, `co_predict`, `co_suggest_model`, `co_compress`, `co_stats`, `co_scan`, `co_feedback`, and `co_doctor` during conversation

Both modes share the same learning data, so using the CLI trains the plugin and vice versa.

---

## Installation

```bash
npm install -g claude-opt
```

Requires **Node.js >= 20** and **Claude Code** installed.

This makes two commands available: `claude-opt` and `co` (shorthand).

## Quick Start

```bash
# 1. Initialize in your project
cd your-project
co init

# 2. (Optional) Wire into Claude Code for automatic optimization
co setup

# 3. Run a task
co "refactor the database connection pooling"

# 4. Check how it's learning
co stats

# 5. Run diagnostics
co doctor --checkup
```

### First Run

`co init` scans your project and:
- Builds a file map with content-type detection
- Parses imports to create a dependency graph
- Extracts keywords with semantic indexing (splits camelCase, snake_case)
- Detects your stack and loads a matching starter pack
- Generates a CLAUDE.md with project structure and conventions

---

## Commands

| Command | Description |
|---------|-------------|
| `co <task>` | Run the full optimization pipeline for a task |
| `co init` | Initialize claude-opt in the current project |
| `co setup` | Wire MCP server + hook into Claude Code (`--no-mcp`, `--no-hooks`) |
| `co scan` | Re-scan project files (`--full` for full rescan) |
| `co stats` | View prediction accuracy, token savings, and model usage |
| `co budget` | View token budget status, burn rate, and projections |
| `co knowledge` | Inspect signals, weights, patterns, and conventions |
| `co doctor` | Run diagnostics (`--checkup`, `--domain <name>`, `--deep`, `--report-only`) |
| `co config` | View and edit configuration |
| `co correct` | Provide detailed feedback on a prediction (`--task <id>`) |
| `co forget <file>` | Remove a file from future predictions |
| `co mcp-server` | Start the MCP server (used internally by Claude Code) |

### Global Flags

| Flag | Description |
|------|-------------|
| `--verbose` | Enable debug-level output |
| `--quiet` | Suppress info-level output |
| `--dry-run` | Preview changes without executing |
| `--version` | Display version |
| `--help` | Display help |

---

## Configuration

```bash
co config                          # View all settings
co config token-budget 60000       # Token budget per session (default: 44,000)
co config window-duration 8        # Budget window in hours (default: 5)
co config budget-warn-inline 0.7   # Inline warning threshold (0.0-1.0)
co config budget-warn-blocking 0.9 # Blocking warning threshold (0.0-1.0)
co config doctor-mode autonomous   # Doctor mode: supervised | autonomous
```

---

## MCP Tools Reference

When integrated via `co setup`, Claude Code can use these tools:

| Tool | Description |
|------|-------------|
| `co_classify` | Classify task by type, domain, and complexity |
| `co_predict` | Predict relevant files for a task description |
| `co_suggest_model` | Get recommended model tier based on task complexity |
| `co_compress` | Full pipeline: classify, predict, route, compress prompt |
| `co_stats` | Fetch optimizer statistics and accuracy metrics |
| `co_scan` | Trigger project rescan |
| `co_feedback` | Report task outcome to improve future predictions |
| `co_doctor` | Run health diagnostics or pre-flight checkup |

---

## How Learning Works

### Cold Start (tasks 1-5)
No history data yet. Predictions rely on **keyword lookup**, **dependency graph**, and **git context**. Starter packs provide initial co-occurrence patterns for common stacks.

### Warming Up (tasks 5-20)
Signal weights begin adapting. Co-occurrence patterns emerge. Type affinities form. Confidence thresholds start optimizing per task type.

### Mature (20+ tasks)
Full adaptive system active:
- Per-domain signal weights (e.g., "for auth tasks, HistorySimilarity matters most")
- Learned model routing with cost-aware Bayesian scoring
- F1-optimized confidence thresholds per task type
- Convention detection refines keyword extraction
- Doctor runs diagnostics and auto-fixes stale patterns

### What Gets Stored

All learning data lives in `.claude-opt/` inside your project:

```
.claude-opt/
  project-map.json      # File inventory with content types and sizes
  dependency-graph.json  # Import/require relationships
  keyword-index.json     # Searchable keyword-to-file index
  task-history.json      # Past task outcomes for learning
  metrics.json           # Accuracy stats, signal weights, model performance
  patterns.json          # Co-occurrence patterns, type affinities, conventions
  config.json            # User configuration
  doctor-log.json        # Diagnostic history and audit trail
```

Add `.claude-opt/` to your `.gitignore` — this is per-developer learning data.

---

## Starter Packs

Pre-built knowledge packs bootstrap predictions for new projects:

| Pack | Auto-detected when |
|------|--------------------|
| **typescript-node** | `tsconfig.json` present |
| **react** | `react` in dependencies |
| **python** | `*.py` files or `requirements.txt` |
| **research-markdown** | Mostly `.md` files, no code framework detected |

Packs include common co-occurrence patterns (e.g., "component file usually changes with its test file and CSS module") and project conventions.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Claude Code                       │
│                                                     │
│  ┌─────────────────┐     ┌──────────────────────┐  │
│  │ UserPromptSubmit │     │    MCP Server         │  │
│  │ Hook (auto)      │     │    (8 tools)          │  │
│  └────────┬─────────┘     └──────────┬───────────┘  │
└───────────┼──────────────────────────┼──────────────┘
            │                          │
            ▼                          ▼
┌─────────────────────────────────────────────────────┐
│                  claude-opt Pipeline                 │
│                                                     │
│  Analyze → Predict → Route → Compress → Budget →    │
│  Review → Adapt → Track → Learn → Feedback → Doctor │
│                                                     │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────┐  │
│  │  7 Signals   │  │  Learner     │  │  Doctor   │  │
│  │  (scoring)   │  │  (adaptive)  │  │  (health) │  │
│  └─────────────┘  └──────────────┘  └───────────┘  │
└─────────────────────────┬───────────────────────────┘
                          │
                          ▼
                  .claude-opt/ (store)
```

---

## Development

```bash
git clone https://github.com/dulhara19/claude-opt.git
cd claude-opt
npm install
npm run build
npm test          # 973 tests across 53 files
npm run typecheck
npm run lint
```

### Tech Stack

- **TypeScript** (strict mode, ESM) with Node.js >= 20
- **Commander.js** — CLI framework
- **Chalk** — Terminal styling
- **Zod** — Schema validation
- **MCP SDK** — Model Context Protocol server
- **tsup** — Build tooling (esbuild-powered, 2 entry points)
- **Vitest** — Testing framework (973 tests)

### Project Structure

```
src/
  analyzer/       # Task classification (type, domain, complexity)
  predictor/      # 7 prediction signals + file scoring
  router/         # Model selection (Haiku/Sonnet/Opus)
  compressor/     # Prompt compression + context injection
  visibility/     # Review UI + feedback system
  adapter/        # Claude Code subprocess execution
  tracker/        # Token usage tracking + budget management
  learner/        # Adaptive learning (weights, thresholds, patterns)
  doctor/         # Diagnostics, supervised/autonomous healing
  scanner/        # Project scanning + dependency parsing
  store/          # JSON file I/O + schema validation
  hooks/          # UserPromptSubmit hook
  mcp/            # MCP server + 8 tools
  types/          # Shared type definitions
  utils/          # Logger, errors, paths
  pipeline.ts     # 11-stage pipeline orchestrator
  index.ts        # CLI entry point
```

---

## License

[MIT](LICENSE)
