---
name: agent-guide
description: Mandatory pre-flight skill. Load BEFORE using scout, planner, or builder. Contains the complete playbook for delegating work to subagents correctly. Do not use subagents without reading this first.
---

# Agent Guide — How to Use Subagents

> **LOAD THIS SKILL FIRST** before using `scout`, `planner`, or `builder`.  
> Using subagents without these instructions causes context overload, poor results, and wasted tokens.

## Economic Mindset

`scout` and `builder` run on **small, fast models** that are roughly **100× cheaper and 100× faster** than the main model. The trade-off is that they are **less intelligent** and have narrower context windows.

**Implication:** The more you **break down** a question into small, parallel sub-tasks, the better your results:
- **Lower total token cost** — many tiny scouts cost far less than one giant investigation
- **Faster wall-clock time** — scouts run in parallel
- **Higher per-scout quality** — each scout gets a crisp, bounded question it can actually answer well
- **Easier to verify** — small outputs are simpler to audit and merge

**Rule of thumb:** If a scout prompt feels like it is asking for "understand everything about X", split it into 2–5 narrower scouts and run them in parallel. While they run, the main model should keep doing useful direct inspection instead of waiting idly.

---

## scout — Investigation & Evidence Gathering

**What it does:**  
Read-only exploration. It reads files, greps, finds patterns, maps dependencies, analyzes logs, and returns a structured evidence report. It NEVER modifies code.

**When to use:**
- You don't fully understand the system, bug, or feature
- You need root cause analysis
- You need to trace data flow, function calls, or module relationships
- The user mentions errors, logs, or symptoms without clear source
- You're about to read more than 2 files manually — delegate to scout

**How to use:**
```
Agent({
  subagent_type: "scout",
  description: "Investigate auth bug",
  prompt: "Find why JWT validation fails for admin users. Check src/auth/, src/middleware/, and any recent commits. Return exact file paths, line numbers, and the root cause."
})
```

**Rules:**
- Give scout a **clear question**, not vague tasks
- Tell it **where to look** (directories, file patterns)
- Ask for **exact file paths and line numbers**
- It returns a checkpoint file — read it before proceeding
- **Prefer many small parallel scouts over one big scout.** If your question has multiple independent angles (e.g. "How does auth work?" + "How does billing work?"), launch separate scouts in parallel instead of cramming everything into one prompt.
- **Do useful parent work while scouts run**: read high-signal files, grep exact symbols, inspect tests/config/logs, and build hypotheses to validate against scout reports.

---

## planner — Architecture & Task Breakdown

**What it does:**  
Creates detailed implementation plans. It analyzes requirements, designs architecture, splits work into atomic tasks, and generates `PLAN_FULL.md` + `SCHEDULE.md` + `TASKS/`.

**When to use:**
- Task touches >3 files or spans multiple concerns
- You need architecture decisions or new patterns
- Scope is unclear — you don't know all files involved
- User asks for a new feature without implementation details

**How to use:**
```
# Step 1: Pre-plan (you do this, not the planner)
Summarize the user's request. Ask clarifying questions. Confirm scope.

# Step 2: Run planner (after user approves scope)
Agent({
  subagent_type: "planner",
  description: "Plan payment integration",
  prompt: "Create implementation plan for Stripe checkout. User confirmed: single payment, no subscriptions, webhook for confirmation. Read existing code in src/payments/ first."
})

# Step 3: Read generated files
read({ path: ".pi/plans/SCHEDULE.md" })
read({ path: ".pi/plans/PLAN_FULL.md" })
```

**Rules:**
- Do a lightweight pre-plan before planner — get user approval when scope/cost/risk is non-trivial
- Planner is **expensive** — don't run it for trivial tasks
- Read `SCHEDULE.md` and `TASKS/` before spawning builders

---

## builder — Focused Execution

**What it does:**  
Implements atomic code changes. Runs on a small, fast model. Good for 1-2 files, single concern.

**When to use:**
- Focused change (1-2 files, one concern)
- Planner already generated `TASKS/` files
- Change is mechanical and well-scoped

**How to use:**
```
# Direct mode (no planner)
Agent({
  subagent_type: "builder",
  description: "Fix null check",
  prompt: "In src/utils/parser.ts line 47, add null check. Read the file first. Then: change `return user.name.toUpperCase()` to `return user?.name?.toUpperCase() ?? ''`. Run tests to verify."
})

# Planner-driven mode
Agent({
  subagent_type: "builder",
  description: "Task 01: Create Navbar",
  prompt: "Implement task from /ABSOLUTE/PATH/.pi/plans/TASKS/task_01_builder.md"
})
```

**Rules:**
- Builder uses a **SMALL model** — be extremely explicit
- It is fast/cheap but less capable than the main model; keep each task tiny and unambiguous
- Tell it: which files to **READ**, what **PATTERNS** to follow, how to **VERIFY**
- Split into atomic tasks. Never stuff multiple concerns into one builder
- Parallelize when files are disjoint

---

## Pipeline Order

```
scout → planner → builder → validator
```

1. **scout** first if you don't understand the code
2. **planner** next if architecture is needed (after your pre-plan + user approval)
3. **builder** to execute planned tasks
4. **validator** after builder for high-impact or >10 files changed

**Skip rules:**
- Trivial (<20 lines, 1 file) → do it yourself with `edit`
- Small focused change → direct builder (skip scout/planner)
- Critical (auth, payment) → builder + validator

---

## Common Mistakes

| Mistake | Why It's Wrong | What To Do Instead |
|---------|---------------|-------------------|
| Using builder without reading files first | Small model has no context | Tell builder exactly which files to read |
| Running planner for trivial fixes | Wastes tokens and time | Use `edit` or direct builder |
| Not doing pre-plan before planner | Planner guesses scope, produces bad plans | You pre-plan, user approves, then run planner |
| Stuffing 5 files into one builder | Context overload, poor quality | Split into 2-3 parallel builders |
| Skipping scout on unfamiliar code | You miss dependencies and side effects | Always scout first on unfamiliar code |
| Asking one scout a broad multi-part question | Small model misses nuance and burns tokens | Split into 2–5 parallel scouts, one angle each |

---

## Quick Checklist Before Delegating

- [ ] Did I load this skill? (`/skill:agent-guide`)
- [ ] Is the task well-scoped? If not → scout or pre-plan
- [ ] Do I know which files are involved? If not → scout
- [ ] Is this >3 files or architectural? If yes → planner (after pre-plan)
- [ ] Is this 1-2 files, well-defined? If yes → builder
- [ ] Did I tell the builder what to read, patterns to follow, and how to verify?
