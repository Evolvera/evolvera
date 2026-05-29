---
name: builder
description: Use the builder agent to implement focused code changes. Builder runs on a fast, efficient model — always split work into small, atomic tasks and parallelize when possible. Can be invoked directly by the main model OR from planner-generated task files.
---

# Builder Skill — Isolated Task Executor

> **⚡ BUILDER IS FAST & FOCUSED**: Builder runs on a **small, fast model** (minimax/M2.7). It is efficient for atomic code changes. **Always split work into small tasks** — stuffing multiple concerns into one builder causes context overload and poor results. **Parallelize when possible.**

## Two Modes of Operation

| Mode | When | Input |
|------|------|-------|
| **Planner-Driven** | Planner generated `.pi/plans/` ecosystem | Task file from `TASKS/task_*.md` + follow `SCHEDULE.md` |
| **Direct** | Skipped planner — you (main model) handle planning | Custom prompt with specific files and changes |

---

## Mode 1: Planner-Driven (Full Plan Ecosystem)

Use when planner already generated `PLAN_FULL.md` + `SCHEDULE.md` + `TASKS/`.

### Step 1: Read SCHEDULE.md

```
read({ path: ".pi/plans/SCHEDULE.md" })
```

Find tasks with `Status=pending` and all `Dependencies` satisfied.

### Step 2: Group by Parallel Group

| Parallel Group | Execution |
|----------------|-----------|
| Same group (e.g., `group_1`) | **Concurrent** — spawn all with `run_in_background: true` |
| Different groups | **Serial** — wait for previous group to finish |
| `none` (no group) | **Serial** — respect dependency chain |

### Step 3: Spawn Builders

```
// Parallel group example: tasks 01, 02, 03 in group_1
Agent({ subagent_type: "builder", run_in_background: true, description: "Task 01: Create Navbar", prompt: "Implement task from /ABSOLUTE/PATH/.pi/plans/TASKS/task_01_builder.md" })
Agent({ subagent_type: "builder", run_in_background: true, description: "Task 02: Create Footer", prompt: "Implement task from /ABSOLUTE/PATH/.pi/plans/TASKS/task_02_builder.md" })
Agent({ subagent_type: "builder", run_in_background: true, description: "Task 03: Add icons", prompt: "Implement task from /ABSOLUTE/PATH/.pi/plans/TASKS/task_03_builder.md" })

// Wait for ALL
get_subagent_result({ agent_id: "id1", wait: true })
get_subagent_result({ agent_id: "id2", wait: true })
get_subagent_result({ agent_id: "id3", wait: true })
```

### Step 4: Read Handover Files

```
read({ path: ".pi/build/HANDOVER_01.md" })
read({ path: ".pi/build/HANDOVER_02.md" })
read({ path: ".pi/build/HANDOVER_03.md" })
```

### Step 5: Update SCHEDULE.md + Proceed

| Handover Status | Action |
|-----------------|--------|
| `COMPLETE` | Mark task `complete` in SCHEDULE.md, proceed to next group |
| `PARTIAL` | Spawn continuation builder with same task file |
| `BLOCKED` | Investigate — check if prerequisite changed, or replan |
| `ERROR` | Read error details — fix or replan |

---

## Mode 2: Direct (No Planner — You Control Everything)

Use when the change is small enough that a full plan ecosystem is overkill.

### When to Use Direct Mode

| Situation | Example |
|-----------|---------|
| Single file change | "Change JWT expiry from 24h to 1h" |
| 2 files, same concern | "Add prop to component + update its test" |
| Quick fix | "Fix null check in parse function" |
| Small refactor | "Extract duplicate logic into helper" |

### When to NOT Use Direct Mode

- ❌ Touching >3 files with different concerns
- ❌ Architecture changes or new patterns
- ❌ Unclear scope — you don't know all files involved
- ❌ Breaking changes that need rollback planning

> **If in doubt → do a pre-plan first (see planner skill).**

### How to Invoke Direct Builders

**CRITICAL: Always split into small, atomic tasks.**

```
// ❌ BAD — too much context, multiple concerns
Agent({
  subagent_type: "builder",
  description: "Fix everything",
  prompt: "Fix auth, update UI, add tests, and update docs"
})

// ✅ GOOD — small, focused tasks
Agent({ subagent_type: "builder", run_in_background: true, description: "Fix auth expiry", prompt: "In src/auth/session.ts, change expiresIn from '24h' to '1h'. Verify with existing tests." })
Agent({ subagent_type: "builder", run_in_background: true, description: "Update login UI", prompt: "In src/components/Login.tsx, add a 'Remember me' checkbox. Pass value to login API." })

// Collect results
get_subagent_result({ agent_id: "...", wait: true })
```

### Task Size Guidelines

| Metric | Good Task | Bad Task |
|--------|-----------|----------|
| **Files touched** | 1-2 files, same concern | 5+ files, mixed concerns |
| **Lines changed** | <100 lines total | 500+ lines |
| **Conceptual scope** | One component / one endpoint / one fix | "Refactor auth + UI + API" |
| **Tool calls** | <15 tool calls | >30 tool calls |
| **Description** | Fits in 3-5 words | Needs a paragraph |

**Rule of thumb**: If you can't describe the task in 5 words, it's too big. Split it.

### Direct Builder Prompt Template

```
MISSION: [One sentence — what to do]

FILES:
- `path/to/file.ts` — [CREATE | MODIFY | DELETE] — [specific change]
- `path/to/other.ts` — [MODIFY] — [specific change]

DETAILS:
[Exact changes needed]
[Line numbers if known]
[Expected behavior after change]

VERIFICATION:
[How to confirm it works]
[Tests to run, if any]

DO NOT:
[What NOT to change]
[Out of scope]
```

---

## Parallel vs Serial Execution

### ALWAYS Parallel When:
- Tasks touch **disjoint files** (no overlap)
- Tasks have **no dependencies** between them
- Tasks are in the **same Parallel Group** (planner mode)

```
// Launch all at once
Agent({ subagent_type: "builder", run_in_background: true, ... }) // task A
Agent({ subagent_type: "builder", run_in_background: true, ... }) // task B
Agent({ subagent_type: "builder", run_in_background: true, ... }) // task C

// Wait for all
get_subagent_result({ agent_id: "A", wait: true })
get_subagent_result({ agent_id: "B", wait: true })
get_subagent_result({ agent_id: "C", wait: true })
```

### ALWAYS Serial When:
- Task B **depends on** Task A's output
- Tasks touch **the same file** (risk of conflict)
- Tasks are in **different Parallel Groups**
- Task B needs Task A to be committed first

```
// Task A first
Agent({ subagent_type: "builder", ... }) // task A
get_subagent_result({ agent_id: "A", wait: true })

// Then Task B
Agent({ subagent_type: "builder", ... }) // task B
get_subagent_result({ agent_id: "B", wait: true })
```

---

## Builder Behavior Rules

Builder agents follow these rules:

1. **CONTEXT ISOLATION** — Receives ONLY its task file or your direct prompt
2. **NO PLANNING** — Does NOT re-plan or re-architect
3. **NO OPINIONS** — Does NOT add improvements not specified
4. **ATOMIC EXECUTION** — Complete fully OR report PARTIAL with checkpoint
5. **STRICT SCOPE** — Only modifies files listed in task/prompt
6. **TILL-DO FIRST** — Validates gates before ANY file mutation

---

## Decision Tree

```
User Request (or planner task ready)
    │
    ├── Is it trivial? (<20 lines, 1 file) ──→ You do it directly (read/edit)
    │
    ├── Is it small but needs agent? (1-2 files, one concern) ──→ Direct builder
    │       │
    │       ├── Split into atomic tasks
    │       ├── Parallelize if files are disjoint
    │       └── Collect results
    │
    └── Is it complex? (multi-file, architecture, unknowns) ──→ Planner mode
            │
            ├── Read SCHEDULE.md
            ├── Identify ready tasks
            ├── Group by Parallel Group
            ├── Spawn builders (parallel within group, serial across groups)
            ├── Read HANDOVER files
            └── Update SCHEDULE.md
```

---

## Examples

### Example 1: Direct — Single file fix
```
Agent({
  subagent_type: "builder",
  description: "Fix null check",
  prompt: "In src/utils/parser.ts:47, add null check before accessing user.name. Current: `return user.name.toUpperCase()`. Fix: `return user?.name?.toUpperCase() ?? ''`. Run tests in src/utils/parser.test.ts to verify."
})
```

### Example 2: Direct — Two parallel tasks
```
// Both touch different files — safe to parallelize
Agent({ subagent_type: "builder", run_in_background: true, description: "Add email validation", prompt: "In src/validators/user.ts, add isEmail() function using regex. Export it." })
Agent({ subagent_type: "builder", run_in_background: true, description: "Add phone validation", prompt: "In src/validators/user.ts, add isPhone() function. Export it." })

get_subagent_result({ agent_id: "...", wait: true })
get_subagent_result({ agent_id: "...", wait: true })
```

### Example 3: Planner-driven — Parallel group
```
// SCHEDULE.md says tasks 01, 02 are in group_1 with no deps
Agent({ subagent_type: "builder", run_in_background: true, description: "Task 01: Create Navbar", prompt: "Implement task from /home/juan/project/.pi/plans/TASKS/task_01_builder.md" })
Agent({ subagent_type: "builder", run_in_background: true, description: "Task 02: Create Footer", prompt: "Implement task from /home/juan/project/.pi/plans/TASKS/task_02_builder.md" })

get_subagent_result({ agent_id: "id1", wait: true })
get_subagent_result({ agent_id: "id2", wait: true })

read({ path: ".pi/build/HANDOVER_01.md" })
read({ path: ".pi/build/HANDOVER_02.md" })
```

### Example 4: Planner-driven — Serial chain
```
// Task 03 depends on 01 and 02
// First run group_1 (above), then:

Agent({ subagent_type: "builder", description: "Task 03: Integrate layout", prompt: "Implement task from /home/juan/project/.pi/plans/TASKS/task_03_builder.md" })
get_subagent_result({ agent_id: "id3", wait: true })
read({ path: ".pi/build/HANDOVER_03.md" })
```

---

## Summary

| Aspect | Direct Mode | Planner-Driven Mode |
|--------|-------------|---------------------|
| **Input** | Your custom prompt | Task file from planner |
| **Planning** | You (main model) | Planner agent |
| **Scheduling** | You decide parallel/serial | Follow `SCHEDULE.md` |
| **Best for** | Small, focused changes | Complex, multi-step features |
| **Max task size** | 1-2 files, <100 lines | Follow planner's task split |
| **Parallelize?** | Yes, when files disjoint | Yes, per `Parallel Group` |

**Golden rule**: Builder = focused execution. Split big work. Parallelize small pieces.
