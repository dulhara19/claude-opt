# Claude Token Optimizer — Complete Knowledge Document

## For PM Agent Reference (BMAD Framework)

> This document captures the full problem space, solution design, architecture, algorithms, and implementation plan for a **Token Optimization System** for Claude Code users. It is intended as the primary reference for a PM agent to generate a comprehensive PRD.

---

## 1. Problem Statement

### The Core Problem

Claude Pro users have a **token limit (~44k tokens per 5-hour window)**. When using Claude Code on large or evolving projects, this budget gets consumed rapidly — often before meaningful work is completed.

### Why Tokens Get Wasted

| Waste Source | Description | Typical Cost |
|---|---|---|
| **Repeated exploration** | Claude re-discovers the same project structure every session | 2,000–8,000 tokens/session |
| **Reading irrelevant files** | Claude reads files unrelated to the current task | 500–3,000 tokens/session |
| **Vague prompts** | Ambiguous user prompts cause broad, expensive searches | 1,000–5,000 tokens/session |
| **Wrong model selection** | Using Opus for simple tasks that Haiku could handle | 2x–5x token overconsumption |
| **Context accumulation** | Old, irrelevant conversation history carried across turns | Compounds every turn |
| **Trial and error** | Claude discovers project patterns by failing first | 500–2,000 tokens/session |
| **No persistent knowledge** | Lessons learned in one session are lost in the next | Full re-exploration cost each session |

### The Impact

- Users hit their 44k limit mid-task and must wait 5 hours
- Large projects become increasingly expensive as they grow
- Users avoid using Claude Code for exploration-heavy tasks
- No visibility into what's consuming tokens or how to reduce it

### Who Is Affected

- **Claude Pro users** on the $20/month plan (primary audience)
- Users working on **medium-to-large codebases** (10k+ lines of code)
- Users who use Claude Code **daily** across multiple sessions
- Teams sharing token budgets across projects

---

## 2. Solution Overview

### What We're Building

A **local CLI middleware/wrapper** that sits between the user and Claude Code. It intercepts every task, optimizes it using accumulated knowledge, and learns from every session to get smarter over time.

### The Name

**Claude Token Optimizer** (working name — `claude-opt`)

### How It Works (High Level)

```
User → "fix login bug" → Claude Token Optimizer → Optimized prompt → Claude Code → Response
                              ↑                                            │
                              └────────── learns from result ──────────────┘
```

### Key Principle

> **"Exploration is renting knowledge. Saving to CLAUDE.md is owning it. The optimizer automates the ownership."**

Every time Claude learns something by exploring, that knowledge is captured and reused. Over time, exploration drops to near zero, and every token goes toward actual work.

---

## 3. System Architecture

### Component Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                      CLAUDE TOKEN OPTIMIZER                        │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│  │   ANALYZER    │  │  PREDICTOR   │  │   ROUTER     │             │
│  │              │  │              │  │              │             │
│  │ Classifies   │→│ Predicts     │→│ Picks best   │             │
│  │ the task     │  │ needed files │  │ model        │             │
│  └──────────────┘  └──────────────┘  └──────────────┘             │
│          ↓                ↓                ↓                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│  │  COMPRESSOR  │  │   LEARNER    │  │   TRACKER    │             │
│  │              │  │              │  │              │             │
│  │ Minimizes    │  │ Saves new    │  │ Tracks token │             │
│  │ the prompt   │  │ knowledge    │  │ budgets      │             │
│  └──────────────┘  └──────────────┘  └──────────────┘             │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    KNOWLEDGE STORE                           │   │
│  │                                                             │   │
│  │  project_map.json       — file structure + descriptions     │   │
│  │  dependency_graph.json  — import/export relationships       │   │
│  │  task_history.json      — all past tasks + files + tokens   │   │
│  │  patterns.json          — discovered conventions/rules      │   │
│  │  token_usage.json       — cost analytics per task type      │   │
│  │  prediction_weights.json — ML weights for file prediction   │   │
│  │  CLAUDE.md              — auto-generated project context    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
         │                                          ▲
         ▼                                          │
┌──────────────────┐                    ┌──────────────────┐
│   Claude Code    │───── response ────→│  Post-Processor  │
│   (any model)    │                    │  (extracts       │
│                  │                    │   knowledge)     │
└──────────────────┘                    └──────────────────┘
```

### Data Flow — Complete Lifecycle

```
1. USER INPUT
   └→ "add email verification to signup"

2. ANALYZER (local, 0 tokens)
   ├→ Type: feature
   ├→ Domain: auth + email
   ├→ Keywords: [email, verification, signup]
   └→ Complexity: medium

3. PREDICTOR (local, 0 tokens)
   ├→ Queries task_history.json for similar past tasks
   ├→ Queries dependency_graph.json for file relationships
   ├→ Queries patterns.json for relevant conventions
   └→ Output: [signup.ts, sender.ts, templates.ts, routes/auth.ts, token.ts, user.ts]

4. ROUTER (local, 0 tokens)
   ├→ Complexity: medium → selects Sonnet
   ├→ Budget estimate: ~2,500 tokens (based on usage history)
   └→ Max files: 6

5. COMPRESSOR (local, 0 tokens)
   ├→ Strips filler words from prompt
   ├→ Injects predicted file paths
   ├→ Injects relevant patterns
   ├→ Injects CLAUDE.md context
   └→ Output: optimized prompt (~40% smaller)

6. CLAUDE CODE (tokens consumed here)
   ├→ Receives optimized prompt
   ├→ Reads only predicted files (no exploration)
   └→ Implements the feature

7. LEARNER (local, 0 tokens)
   ├→ Records task + files actually used
   ├→ Compares predicted vs actual files (updates accuracy)
   ├→ Extracts new patterns from session
   ├→ Updates dependency graph
   ├→ Updates CLAUDE.md if needed
   └→ Logs token usage for analytics
```

---

## 4. Detailed Module Specifications

### 4.1 Task Analyzer

**Purpose:** Classify incoming tasks by type, domain, complexity, and extract keywords — all locally with zero token cost.

**Classification Categories:**

```
Task Types:
  - bugfix        → fixing broken functionality
  - feature       → adding new functionality
  - refactor      → restructuring existing code
  - testing       → writing or fixing tests
  - docs          → documentation changes
  - formatting    → code style/formatting
  - config        → configuration changes
  - debug         → investigating issues
  - architecture  → design/structural decisions

Complexity Levels:
  - low           → single file, simple change (use Haiku)
  - medium        → 2-6 files, moderate logic (use Sonnet)
  - high          → 6+ files, complex logic/architecture (use Opus)
```

**Algorithm:**

```python
def analyze_task(prompt, knowledge_store):
    task = {}

    # 1. Type detection via keyword matching
    type_keywords = {
        "bugfix": ["fix", "bug", "broken", "error", "crash", "issue", "wrong", "fail"],
        "feature": ["add", "create", "new", "implement", "build", "introduce"],
        "refactor": ["refactor", "clean", "reorganize", "restructure", "simplify"],
        "testing": ["test", "spec", "coverage", "assert", "mock"],
        "docs": ["document", "readme", "comment", "explain", "jsdoc"],
        "config": ["config", "env", "setup", "install", "dependency"],
        "debug": ["debug", "investigate", "why", "trace", "log", "profile"],
    }
    task["type"] = match_type(prompt, type_keywords)

    # 2. Domain detection via project map
    domain_map = knowledge_store.get("project_map", {}).get("domains", {})
    task["domain"] = match_domain(prompt, domain_map)

    # 3. Keyword extraction
    task["keywords"] = extract_keywords(prompt, stop_words=COMMON_STOP_WORDS)

    # 4. Complexity estimation
    #    Based on: number of domains touched, keyword spread, historical data
    similar_tasks = find_similar_tasks(prompt, knowledge_store["task_history"])
    if similar_tasks:
        avg_files = mean([t["files_count"] for t in similar_tasks])
        task["complexity"] = "low" if avg_files <= 2 else "medium" if avg_files <= 6 else "high"
    else:
        task["complexity"] = estimate_from_prompt(prompt)  # fallback heuristic

    return task
```

### 4.2 File Predictor

**Purpose:** Predict exactly which files Claude will need, so it doesn't waste tokens discovering them.

**Data Sources:**

1. **Task History** — "What files did similar past tasks use?"
2. **Dependency Graph** — "What files are connected to the predicted files?"
3. **Project Map** — "What files match the task's keywords/domain?"
4. **Pattern Knowledge** — "What conventions apply?" (e.g., "auth features always need middleware")

**Algorithm:**

```python
def predict_files(task, knowledge_store):
    candidates = {}  # file_path → relevance_score

    # --- Layer 1: Task History Matching ---
    similar_tasks = find_similar_tasks(task, knowledge_store["task_history"])
    for similar in similar_tasks:
        for file in similar["files_used"]:
            candidates[file] = candidates.get(file, 0) + similar["similarity_score"] * 10

    # --- Layer 2: Keyword → File Mapping ---
    keyword_index = knowledge_store["project_map"].get("keyword_index", {})
    for keyword in task["keywords"]:
        for file in keyword_index.get(keyword, []):
            candidates[file] = candidates.get(file, 0) + 15

    # --- Layer 3: Dependency Expansion ---
    dep_graph = knowledge_store["dependency_graph"]
    primary_files = [f for f, score in candidates.items() if score > 20]
    for file in primary_files:
        for imported in dep_graph.get(file, {}).get("imports", []):
            candidates[imported] = candidates.get(imported, 0) + 8
        if task["type"] == "feature":
            for importer in dep_graph.get(file, {}).get("imported_by", []):
                candidates[importer] = candidates.get(importer, 0) + 5

    # --- Layer 4: Pattern Boosting ---
    patterns = knowledge_store["patterns"]
    for pattern in patterns:
        if is_relevant(pattern, task):
            for file in pattern.get("associated_files", []):
                candidates[file] = candidates.get(file, 0) + pattern["confidence"] * 12

    # --- Layer 5: Recency and Frequency Boost ---
    for file in candidates:
        candidates[file] += recency_score(file) * 3      # recently modified = more relevant
        candidates[file] += frequency_score(file) * 2     # frequently used = more relevant

    # --- Budget-Aware Cutoff ---
    max_files = get_file_budget(task["complexity"])  # low=2, medium=6, high=10
    sorted_files = sorted(candidates.items(), key=lambda x: -x[1])

    return [f[0] for f in sorted_files[:max_files]]
```

**Similarity Matching Algorithm:**

```python
def find_similar_tasks(new_task, history):
    """Find past tasks most similar to the new one using weighted scoring."""
    scored = []

    for past in history:
        score = 0

        # Keyword overlap (most important signal)
        common = set(new_task["keywords"]) & set(past["keywords"])
        score += len(common) * 15

        # Same domain
        if new_task["domain"] == past["domain"]:
            score += 25
        elif new_task["domain"] in past.get("related_domains", []):
            score += 10

        # Same task type
        if new_task["type"] == past["type"]:
            score += 15

        # TF-IDF text similarity (for more nuanced matching)
        score += tfidf_similarity(new_task["raw_prompt"], past["raw_prompt"]) * 30

        past["similarity_score"] = score
        scored.append(past)

    return sorted(scored, key=lambda x: -x["similarity_score"])[:5]
```

### 4.3 Model Router

**Purpose:** Select the cheapest Claude model that can handle the task.

**Routing Logic:**

```python
MODEL_COSTS = {
    "haiku": 1,     # cheapest, fast, good for simple tasks
    "sonnet": 3,    # balanced
    "opus": 10      # most capable, most expensive
}

def select_model(task, knowledge_store):
    # Rule-based routing with history-informed overrides

    # 1. Always Opus for architecture/design
    if task["type"] in ["architecture", "debug"]:
        return "opus"

    # 2. Always Haiku for trivial tasks
    if task["type"] in ["formatting", "docs", "config"]:
        return "haiku"
    if task["complexity"] == "low":
        return "haiku"

    # 3. Check history — did similar tasks succeed with cheaper models?
    similar = find_similar_tasks(task, knowledge_store["task_history"])
    for past in similar:
        if past.get("success") and past.get("model") == "sonnet":
            return "sonnet"  # similar task worked with Sonnet
        if past.get("success") and past.get("model") == "haiku":
            return "haiku"   # similar task worked with Haiku

    # 4. Default based on complexity
    if task["complexity"] == "medium":
        return "sonnet"
    if task["complexity"] == "high":
        return "opus"

    return "sonnet"  # safe default
```

### 4.4 Prompt Compressor

**Purpose:** Minimize token count of the prompt sent to Claude while preserving all necessary information.

**Techniques:**

1. **Filler removal** — Strip conversational words ("hey", "can you", "please", "take a look at")
2. **File pre-injection** — Include predicted file paths so Claude doesn't search
3. **Pattern injection** — Include relevant conventions so Claude doesn't discover by trial/error
4. **Context injection** — Include relevant CLAUDE.md sections
5. **Instruction densification** — Rewrite verbose instructions into concise directives

**Algorithm:**

```python
def compress_prompt(original, task, predicted_files, knowledge_store):
    sections = []

    # 1. Task type header
    sections.append(f"{task['type'].upper()}: {remove_filler(original)}")

    # 2. File targets
    file_descriptions = knowledge_store["project_map"].get("file_descriptions", {})
    file_lines = []
    for f in predicted_files:
        desc = file_descriptions.get(f, "")
        file_lines.append(f"- {f}" + (f" ({desc})" if desc else ""))
    sections.append("## Files:\n" + "\n".join(file_lines))

    # 3. Relevant patterns
    relevant_patterns = get_relevant_patterns(task, knowledge_store["patterns"])
    if relevant_patterns:
        sections.append("## Patterns:\n" + "\n".join(f"- {p}" for p in relevant_patterns))

    # 4. Relevant CLAUDE.md context
    context = get_domain_context(task["domain"], knowledge_store["claude_md"])
    if context:
        sections.append(f"## Context:\n{context}")

    # 5. Token budget hint
    budget = get_budget_estimate(task, knowledge_store["token_usage"])
    sections.append(f"## Budget: ~{budget} tokens. Be concise.")

    return "\n\n".join(sections)

FILLER_WORDS = [
    "hey", "hi", "hello", "please", "can you", "could you",
    "take a look at", "I need you to", "I want you to",
    "would you mind", "it would be great if",
    "basically", "essentially", "actually", "just"
]

def remove_filler(text):
    result = text
    for filler in FILLER_WORDS:
        result = re.sub(rf'\b{filler}\b', '', result, flags=re.IGNORECASE)
    return re.sub(r'\s+', ' ', result).strip()
```

### 4.5 Knowledge Learner (Post-Session)

**Purpose:** After every Claude Code session, extract new knowledge and update the knowledge store. This is the most critical module — it's what makes the system get smarter over time.

**What It Captures:**

```python
def post_session_learn(session_data, knowledge_store):
    # ─── 1. Record Task History ───
    task_record = {
        "timestamp": now(),
        "raw_prompt": session_data["original_prompt"],
        "type": session_data["task"]["type"],
        "domain": session_data["task"]["domain"],
        "keywords": session_data["task"]["keywords"],
        "complexity": session_data["task"]["complexity"],
        "model": session_data["model_used"],
        "files_predicted": session_data["predicted_files"],
        "files_actual": session_data["files_actually_read"],
        "tokens_used": session_data["total_tokens"],
        "success": session_data["task_completed"],
    }
    knowledge_store["task_history"].append(task_record)

    # ─── 2. Update Prediction Accuracy ───
    predicted = set(session_data["predicted_files"])
    actual = set(session_data["files_actually_read"])

    precision = len(predicted & actual) / len(predicted) if predicted else 0
    recall = len(predicted & actual) / len(actual) if actual else 0

    # Files we missed — learn about them
    missed_files = actual - predicted
    for file in missed_files:
        # Boost this file's relevance for similar future tasks
        update_keyword_index(file, session_data["task"]["keywords"])
        update_domain_mapping(file, session_data["task"]["domain"])

    # Files we over-predicted — reduce their scores
    over_predicted = predicted - actual
    for file in over_predicted:
        reduce_relevance_score(file, session_data["task"])

    # ─── 3. Update Dependency Graph ───
    for file in session_data["files_actually_read"]:
        imports = parse_imports(file)  # statically parse the file
        knowledge_store["dependency_graph"][file] = {
            "imports": imports,
            "imported_by": find_importers(file, knowledge_store)
        }

    # ─── 4. Extract New Patterns ───
    # Look for repeated behaviors across recent tasks
    recent = knowledge_store["task_history"][-20:]
    new_patterns = detect_patterns(recent)
    for pattern in new_patterns:
        if pattern not in knowledge_store["patterns"]:
            knowledge_store["patterns"].append(pattern)
        else:
            # Increase confidence of existing pattern
            existing = find_pattern(pattern, knowledge_store["patterns"])
            existing["confidence"] = min(1.0, existing["confidence"] + 0.05)
            existing["evidence_count"] += 1

    # ─── 5. Update Token Usage Stats ───
    usage_key = f"{session_data['task']['type']}+{session_data['task']['domain']}"
    if usage_key not in knowledge_store["token_usage"]:
        knowledge_store["token_usage"][usage_key] = {"samples": []}
    knowledge_store["token_usage"][usage_key]["samples"].append(session_data["total_tokens"])
    # Recompute avg/min/max
    samples = knowledge_store["token_usage"][usage_key]["samples"]
    knowledge_store["token_usage"][usage_key].update({
        "avg": mean(samples),
        "min": min(samples),
        "max": max(samples)
    })

    # ─── 6. Auto-Update CLAUDE.md ───
    if session_data.get("new_discoveries"):
        append_to_claude_md(session_data["new_discoveries"])

    # ─── 7. Save Everything ───
    knowledge_store.save()
```

**Pattern Detection Algorithm:**

```python
def detect_patterns(recent_tasks):
    """Detect recurring patterns from recent task history."""
    patterns = []

    # Pattern: Files that always appear together
    file_cooccurrence = defaultdict(int)
    for task in recent_tasks:
        files = task["files_actual"]
        for pair in combinations(files, 2):
            file_cooccurrence[frozenset(pair)] += 1

    for pair, count in file_cooccurrence.items():
        if count >= 3:  # appeared together 3+ times
            f1, f2 = list(pair)
            patterns.append({
                "type": "file_cooccurrence",
                "observation": f"{f1} and {f2} are usually modified together",
                "associated_files": [f1, f2],
                "confidence": min(1.0, count / 10),
                "evidence_count": count
            })

    # Pattern: Task types that always need certain files
    type_file_map = defaultdict(lambda: defaultdict(int))
    for task in recent_tasks:
        for file in task["files_actual"]:
            type_file_map[task["type"]][file] += 1

    for task_type, files in type_file_map.items():
        type_count = sum(1 for t in recent_tasks if t["type"] == task_type)
        for file, count in files.items():
            if count / type_count > 0.7:  # file appears in 70%+ of this task type
                patterns.append({
                    "type": "type_file_affinity",
                    "observation": f"{task_type} tasks usually need {file}",
                    "associated_files": [file],
                    "task_type": task_type,
                    "confidence": count / type_count,
                    "evidence_count": count
                })

    return patterns
```

### 4.6 Token Usage Tracker & Budget Manager

**Purpose:** Track actual token consumption, set budgets, warn before hitting limits, and provide analytics.

```python
class TokenBudgetManager:
    WINDOW_LIMIT = 44000       # Claude Pro 5-hour window
    WINDOW_DURATION = 5 * 60   # minutes

    def __init__(self, knowledge_store):
        self.store = knowledge_store
        self.current_window_usage = 0
        self.window_start = None

    def estimate_task_cost(self, task):
        """Predict how many tokens this task will use."""
        key = f"{task['type']}+{task['domain']}"
        if key in self.store["token_usage"]:
            return self.store["token_usage"][key]["avg"]

        # Fallback: estimate by complexity
        complexity_estimates = {
            "low": 800,
            "medium": 2500,
            "high": 5000
        }
        return complexity_estimates.get(task["complexity"], 2500)

    def check_budget(self, task):
        """Check if we can afford this task in the current window."""
        estimated_cost = self.estimate_task_cost(task)
        remaining = self.WINDOW_LIMIT - self.current_window_usage

        if estimated_cost > remaining:
            return {
                "can_proceed": False,
                "estimated_cost": estimated_cost,
                "remaining": remaining,
                "suggestion": self._suggest_alternative(task, remaining)
            }

        return {
            "can_proceed": True,
            "estimated_cost": estimated_cost,
            "remaining_after": remaining - estimated_cost
        }

    def _suggest_alternative(self, task, remaining):
        """Suggest a cheaper alternative when budget is tight."""
        suggestions = []

        # Suggest cheaper model
        if task.get("model") in ["opus", "sonnet"]:
            suggestions.append("Try with Haiku to save tokens")

        # Suggest splitting the task
        if task["complexity"] == "high":
            suggestions.append("Break this into smaller sub-tasks")

        # Suggest waiting
        time_remaining = self._time_until_window_reset()
        suggestions.append(f"Window resets in {time_remaining} minutes")

        return suggestions

    def record_usage(self, tokens_used):
        """Record token usage for current window."""
        self.current_window_usage += tokens_used

    def get_analytics(self):
        """Return token usage analytics."""
        history = self.store["token_usage"]
        return {
            "current_window": {
                "used": self.current_window_usage,
                "remaining": self.WINDOW_LIMIT - self.current_window_usage,
                "percentage": round(self.current_window_usage / self.WINDOW_LIMIT * 100, 1)
            },
            "by_task_type": {
                k: v["avg"] for k, v in history.items()
            },
            "most_expensive": sorted(
                history.items(),
                key=lambda x: x[1]["avg"],
                reverse=True
            )[:5],
            "total_saved_by_optimization": self._calculate_savings()
        }
```

---

## 5. Knowledge Store Schema

### 5.1 project_map.json

```json
{
  "name": "my-project",
  "root": "/path/to/project",
  "generated_at": "2026-03-04T10:00:00Z",
  "domains": {
    "auth": {
      "keywords": ["login", "signup", "session", "jwt", "token", "password", "401", "403"],
      "files": ["src/auth/login.ts", "src/auth/signup.ts", "src/auth/session.ts"],
      "description": "Authentication and authorization"
    },
    "email": {
      "keywords": ["email", "smtp", "notification", "template", "send"],
      "files": ["src/email/sender.ts", "src/email/templates.ts"],
      "description": "Email sending and templates"
    }
  },
  "file_descriptions": {
    "src/auth/login.ts": "Handles /api/login endpoint, validates credentials, issues JWT",
    "src/auth/session.ts": "Session creation, validation, and token refresh"
  },
  "keyword_index": {
    "login": ["src/auth/login.ts", "src/routes/auth.ts"],
    "401": ["src/auth/login.ts", "src/middleware/auth.ts"],
    "email": ["src/email/sender.ts", "src/email/templates.ts"]
  }
}
```

### 5.2 dependency_graph.json

```json
{
  "src/auth/login.ts": {
    "imports": ["src/db/models/user.ts", "src/auth/session.ts", "src/config.ts"],
    "imported_by": ["src/routes/auth.ts"],
    "last_updated": "2026-03-04T10:00:00Z"
  },
  "src/email/sender.ts": {
    "imports": ["src/email/templates.ts", "src/config.ts"],
    "imported_by": ["src/auth/signup.ts", "src/auth/reset.ts"],
    "last_updated": "2026-03-04T10:00:00Z"
  }
}
```

### 5.3 task_history.json

```json
[
  {
    "id": "task_001",
    "timestamp": "2026-03-03T14:00:00Z",
    "raw_prompt": "fix the login bug where users get 401 after password reset",
    "optimized_prompt": "BUGFIX: 401 after password reset...",
    "type": "bugfix",
    "domain": "auth",
    "keywords": ["login", "401", "password", "reset"],
    "complexity": "medium",
    "model": "sonnet",
    "files_predicted": ["src/auth/login.ts", "src/auth/reset.ts", "src/middleware/auth.ts"],
    "files_actual": ["src/auth/login.ts", "src/auth/reset.ts", "src/auth/session.ts"],
    "prediction_accuracy": { "precision": 0.67, "recall": 0.67 },
    "tokens_used": 1800,
    "tokens_saved_estimate": 2400,
    "success": true,
    "duration_seconds": 45
  }
]
```

### 5.4 patterns.json

```json
[
  {
    "id": "pattern_001",
    "type": "file_cooccurrence",
    "observation": "login.ts and session.ts are usually modified together",
    "associated_files": ["src/auth/login.ts", "src/auth/session.ts"],
    "confidence": 0.85,
    "evidence_count": 8,
    "first_seen": "2026-02-15T10:00:00Z",
    "last_seen": "2026-03-03T14:00:00Z"
  },
  {
    "id": "pattern_002",
    "type": "type_file_affinity",
    "observation": "Feature tasks in auth domain always need routes/auth.ts",
    "associated_files": ["src/routes/auth.ts"],
    "task_type": "feature",
    "domain": "auth",
    "confidence": 0.92,
    "evidence_count": 12,
    "first_seen": "2026-02-10T10:00:00Z",
    "last_seen": "2026-03-04T09:00:00Z"
  },
  {
    "id": "pattern_003",
    "type": "convention",
    "observation": "Email features always need a new template in src/email/templates/",
    "associated_files": ["src/email/templates.ts"],
    "domain": "email",
    "confidence": 0.80,
    "evidence_count": 4,
    "first_seen": "2026-02-20T10:00:00Z",
    "last_seen": "2026-03-01T16:00:00Z"
  }
]
```

### 5.5 token_usage.json

```json
{
  "bugfix+auth": {
    "samples": [1800, 1500, 2200, 1400, 1900],
    "avg": 1760,
    "min": 1400,
    "max": 2200
  },
  "feature+auth": {
    "samples": [2500, 3200, 2100, 2800],
    "avg": 2650,
    "min": 2100,
    "max": 3200
  },
  "feature+email": {
    "samples": [2400, 2800, 3500],
    "avg": 2900,
    "min": 2400,
    "max": 3500
  }
}
```

### 5.6 prediction_weights.json

```json
{
  "keyword_match_weight": 15,
  "domain_match_weight": 25,
  "type_match_weight": 15,
  "tfidf_weight": 30,
  "dependency_import_weight": 8,
  "dependency_importer_weight": 5,
  "pattern_boost_weight": 12,
  "recency_weight": 3,
  "frequency_weight": 2,
  "learning_rate": 0.05,
  "last_updated": "2026-03-04T10:00:00Z",
  "total_predictions": 487,
  "avg_precision": 0.82,
  "avg_recall": 0.78
}
```

---

## 6. CLI Interface Design

### Usage

```bash
# Basic usage — wraps Claude Code
claude-opt "fix the login bug"

# With explicit model override
claude-opt --model opus "redesign the auth system"

# Dry run — show what optimizer would do without calling Claude
claude-opt --dry-run "add email verification"

# Analytics dashboard
claude-opt stats

# Regenerate project map
claude-opt scan

# Show remaining budget in current window
claude-opt budget

# Initialize optimizer for a new project
claude-opt init

# Show what knowledge exists for a domain
claude-opt knowledge auth

# Force re-learn from recent session
claude-opt learn --last-session
```

### Output Examples

```bash
$ claude-opt "add email verification to signup"

┌──────────────────────────────────────────────────┐
│ 🔍 Task Analysis                                 │
│   Type: feature | Domain: auth+email             │
│   Complexity: medium | Model: sonnet             │
│                                                  │
│ 📁 Predicted Files (6):                          │
│   src/auth/signup.ts          (score: 95)        │
│   src/email/sender.ts         (score: 88)        │
│   src/email/templates.ts      (score: 82)        │
│   src/routes/auth.ts          (score: 78)        │
│   src/auth/token.ts           (score: 65)        │
│   src/db/models/user.ts       (score: 60)        │
│                                                  │
│ 💡 Applied Patterns (3):                         │
│   - Email features need template in templates/   │
│   - Auth features need route in routes/auth.ts   │
│   - Email uses SMTP config from .env             │
│                                                  │
│ 💰 Budget:                                       │
│   Estimated cost: ~2,500 tokens                  │
│   Window remaining: 31,200 / 44,000              │
│   Tokens saved by optimization: ~3,800           │
│                                                  │
│ Sending optimized prompt to Claude Code...       │
└──────────────────────────────────────────────────┘
```

```bash
$ claude-opt stats

┌──────────────────────────────────────────────────┐
│ 📊 Token Optimizer Analytics                     │
│                                                  │
│ Current Window:                                  │
│   Used: 12,800 / 44,000 (29.1%)                 │
│   Remaining: 31,200 tokens                       │
│   ████████░░░░░░░░░░░░░░░░░░░░ 29%              │
│                                                  │
│ Lifetime Stats:                                  │
│   Total sessions: 487                            │
│   Total tokens used: 892,400                     │
│   Estimated tokens saved: 1,245,600              │
│   Optimization ratio: 58.3% savings              │
│                                                  │
│ Prediction Accuracy:                             │
│   File precision: 82%                            │
│   File recall: 78%                               │
│   Model routing accuracy: 91%                    │
│                                                  │
│ Top Token Consumers:                             │
│   1. feature+auth    avg: 2,650 tokens           │
│   2. feature+email   avg: 2,900 tokens           │
│   3. bugfix+api      avg: 1,900 tokens           │
│   4. refactor+db     avg: 3,400 tokens           │
│   5. bugfix+auth     avg: 1,760 tokens           │
│                                                  │
│ Knowledge Store:                                 │
│   Tasks recorded: 487                            │
│   Patterns discovered: 34                        │
│   Files mapped: 156                              │
│   Dependency edges: 423                          │
└──────────────────────────────────────────────────┘
```

```bash
$ claude-opt budget

┌──────────────────────────────────────────────────┐
│ 💰 Token Budget                                  │
│                                                  │
│ Window: 12,800 / 44,000 used                     │
│ ████████░░░░░░░░░░░░░░░░░░░░ 29%                │
│                                                  │
│ Resets in: 3h 42m                                │
│                                                  │
│ Can afford:                                      │
│   ~12 simple tasks (Haiku, ~800 tokens each)     │
│   ~7 medium tasks (Sonnet, ~2,500 tokens each)   │
│   ~3 complex tasks (Opus, ~5,000 tokens each)    │
│                                                  │
│ Tip: You have 2 pending tasks. Batch them to     │
│ reuse file context and save ~1,500 tokens.       │
└──────────────────────────────────────────────────┘
```

---

## 7. Knowledge Feedback Loop — How It Gets Smarter

### The Learning Cycle

```
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│ Session  │────→│ Record  │────→│ Analyze │────→│ Improve │
│ Complete │     │ Results │     │ Accuracy│     │ Weights │
└─────────┘     └─────────┘     └─────────┘     └─────────┘
     ↑                                                │
     │                                                │
     └────────────────────────────────────────────────┘
                    Next Session Uses
                    Improved Predictions
```

### Concrete Example of Learning Over Time

```
Session 1 (no knowledge):
  Task: "fix login bug"
  Predicted files: [] (no history)
  Actual files Claude read: [login.ts, session.ts, middleware/auth.ts]
  → LEARNS: "login" tasks need these 3 files
  → LEARNS: login.ts imports session.ts
  → SAVES to task_history

Session 5 (some knowledge):
  Task: "add 2FA to login"
  Predicted files: [login.ts, session.ts, middleware/auth.ts]  (from Session 1)
  Actual files Claude read: [login.ts, session.ts, middleware/auth.ts, user.ts, config.ts]
  → LEARNS: auth features also need user.ts and config.ts (missed 2 files)
  → UPDATES prediction weights to include user.ts for auth tasks
  → Prediction accuracy: 60% → feeds back into weights

Session 15 (good knowledge):
  Task: "fix session expiry bug"
  Predicted files: [login.ts, session.ts, middleware/auth.ts, user.ts, config.ts]
  Actual files Claude read: [session.ts, middleware/auth.ts, config.ts]
  → LEARNS: bugfix tasks need fewer files than features (over-predicted)
  → UPDATES: reduce file count for bugfix+auth complexity
  → Prediction accuracy: 60% (over-predicted, but no files missed)

Session 50 (rich knowledge):
  Task: "add OAuth login"
  Predicted files: [login.ts, session.ts, middleware/auth.ts, user.ts, config.ts, routes/auth.ts]
  Actual files Claude read: [login.ts, session.ts, middleware/auth.ts, user.ts, config.ts, routes/auth.ts]
  → PERFECT PREDICTION: 100% precision, 100% recall
  → Claude read 0 unnecessary files
  → Token cost: near minimum possible
```

### Self-Correcting Weights

```python
def update_weights_after_session(prediction_result, weights):
    """Adjust prediction weights based on accuracy."""
    lr = weights["learning_rate"]  # e.g., 0.05

    # If we missed files that came from keyword matching
    if prediction_result["missed_keyword_files"] > 0:
        weights["keyword_match_weight"] += lr * 5

    # If we over-predicted from dependency expansion
    if prediction_result["over_predicted_deps"] > 0:
        weights["dependency_import_weight"] -= lr * 3

    # If pattern-boosted files were correct
    if prediction_result["pattern_accuracy"] > 0.8:
        weights["pattern_boost_weight"] += lr * 2

    # Ensure weights stay in reasonable bounds
    for key in weights:
        if isinstance(weights[key], (int, float)) and key.endswith("_weight"):
            weights[key] = max(1, min(50, weights[key]))

    weights["last_updated"] = now()
    return weights
```

---

## 8. Auto-Generation Scripts

### Project Scanner (Initial Setup)

```bash
#!/bin/bash
# claude-opt-scan.sh — Generates initial project map and dependency graph

PROJECT_ROOT=$(pwd)
OUTPUT_DIR="$PROJECT_ROOT/.claude-opt"
mkdir -p "$OUTPUT_DIR"

echo "Scanning project..."

# 1. Generate file structure
echo '{"files": [' > "$OUTPUT_DIR/project_map.json"
find . -type f \( -name "*.ts" -o -name "*.js" -o -name "*.py" -o -name "*.go" \) \
  -not -path "*/node_modules/*" \
  -not -path "*/dist/*" \
  -not -path "*/.git/*" \
  | while read -r file; do
    echo "  \"$file\","
  done >> "$OUTPUT_DIR/project_map.json"
echo ']}' >> "$OUTPUT_DIR/project_map.json"

# 2. Generate dependency graph (TypeScript/JavaScript)
echo '{}' > "$OUTPUT_DIR/dependency_graph.json"
find . -type f \( -name "*.ts" -o -name "*.js" \) \
  -not -path "*/node_modules/*" \
  | while read -r file; do
    imports=$(grep -oP "from ['\"]\..*?['\"]" "$file" | sed "s/from ['\"]//;s/['\"]//")
    echo "$file: $imports"
  done > "$OUTPUT_DIR/raw_imports.txt"

# 3. Generate keyword index
echo '{}' > "$OUTPUT_DIR/keyword_index.json"
find . -type f \( -name "*.ts" -o -name "*.js" \) \
  -not -path "*/node_modules/*" \
  | while read -r file; do
    # Extract function names, class names, exports
    grep -oP "(?:export\s+)?(?:function|class|const|interface)\s+\K\w+" "$file"
  done | sort | uniq -c | sort -rn > "$OUTPUT_DIR/keywords.txt"

# 4. Generate CLAUDE.md
echo "# Project Context (Auto-Generated)" > CLAUDE.md
echo "" >> CLAUDE.md
echo "## Stack" >> CLAUDE.md
if [ -f "package.json" ]; then
  node -e "const p=require('./package.json');console.log(Object.keys(p.dependencies||{}).join(', '))" >> CLAUDE.md
fi
echo "" >> CLAUDE.md
echo "## Structure" >> CLAUDE.md
find . -type f \( -name "*.ts" -o -name "*.js" \) \
  -not -path "*/node_modules/*" \
  -not -path "*/dist/*" \
  | head -30 >> CLAUDE.md
echo "" >> CLAUDE.md
echo "## Key Exports" >> CLAUDE.md
grep -r "export function\|export class" --include="*.ts" --include="*.js" src/ 2>/dev/null \
  | sed 's/{.*//g' | head -30 >> CLAUDE.md

echo "Scan complete. Files saved to $OUTPUT_DIR/"
```

---

## 9. Implementation Plan

### Phase 1: Foundation (MVP)
- [ ] Project scaffolding (Node.js/TypeScript CLI tool)
- [ ] Knowledge store (JSON file-based storage)
- [ ] Project scanner (auto-generates project_map.json)
- [ ] Basic task analyzer (keyword-based classification)
- [ ] Basic CLAUDE.md auto-generator
- [ ] CLI wrapper for Claude Code (`claude-opt "task"`)

### Phase 2: Intelligence
- [ ] File predictor (task history matching + dependency graph)
- [ ] Model router (complexity-based model selection)
- [ ] Prompt compressor (filler removal + file injection)
- [ ] Post-session learner (records task history)
- [ ] Token usage tracker

### Phase 3: Learning Loop
- [ ] Similarity matching (TF-IDF for task comparison)
- [ ] Pattern detection (file cooccurrence, type-file affinity)
- [ ] Self-correcting prediction weights
- [ ] Accuracy tracking and feedback loop
- [ ] Dynamic .claudeignore generation

### Phase 4: Analytics & UX
- [ ] Token budget manager with window tracking
- [ ] Analytics dashboard (CLI-based)
- [ ] Dry-run mode (show optimization without executing)
- [ ] Budget warnings and suggestions
- [ ] Knowledge exploration commands

### Phase 5: Advanced Features
- [ ] Multi-project support (separate knowledge per project)
- [ ] Team knowledge sharing (export/import knowledge stores)
- [ ] Git hook integration (auto-update on commits)
- [ ] VS Code extension
- [ ] Natural language knowledge queries ("what do I know about auth?")
- [ ] Predictive task batching ("these 3 tasks share files, batch them")

---

## 10. Success Metrics

| Metric | Target | How Measured |
|---|---|---|
| Token reduction per session | 40-60% | Compare predicted vs baseline token cost |
| File prediction precision | >80% | Predicted files / actually needed files |
| File prediction recall | >75% | Actually needed files / predicted files |
| Model routing accuracy | >85% | Cheapest model that succeeds / total tasks |
| User sessions before hitting limit | 2x increase | Sessions per 5-hour window |
| Knowledge accumulation | Growing per session | New patterns + task history entries |
| Time to first useful prediction | <5 sessions | When precision exceeds 50% |

---

## 11. Technical Decisions to Make

These need PM/architect input:

1. **Language:** TypeScript (Node.js) vs Python for the CLI tool?
2. **Storage:** JSON files vs SQLite for knowledge store?
3. **Claude Code integration:** CLI wrapper vs Claude Code hook/extension?
4. **Token counting:** Estimate tokens locally (tiktoken) or track via API response?
5. **Session capture:** How to capture Claude Code's file reads and outputs for learning?
6. **Multi-language support:** Start with TypeScript projects only, or support Python/Go/etc. from day 1?
7. **Distribution:** npm package, standalone binary, or both?
8. **Privacy:** Knowledge stays local only, or optional cloud sync for teams?

---

## 12. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Claude Code API changes break integration | High | Abstract integration layer, version pinning |
| Knowledge store grows too large | Medium | Prune old task history, compress patterns |
| Inaccurate predictions waste tokens | Medium | Confidence thresholds, fallback to exploration |
| User doesn't run scan/init | High | Auto-detect and prompt, zero-config defaults |
| Different projects have different patterns | Medium | Per-project knowledge isolation |
| Token counting inaccuracy | Low | Conservative estimates, safety margins |

---

## 13. Competitive Landscape

No direct competitors exist for this specific problem. Adjacent tools:

- **Cursor** — Has some AI context management but no token optimization
- **Continue.dev** — Open-source AI assistant, no token budgeting
- **Aider** — CLI AI coding tool, no optimization layer
- **Claude Code native** — Has CLAUDE.md and .claudeignore but no automated optimization

**This would be the first tool specifically designed to optimize AI coding assistant token consumption through accumulated project knowledge.**

---

*Document version: 1.0*
*Created: 2026-03-04*
*Purpose: Reference for PM Agent (BMAD Framework) to generate PRD*
