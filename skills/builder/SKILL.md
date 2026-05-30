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

### Direct Builder Prompt Template (⚠️ CRITICAL — Model is Small)

> **The builder runs on a small, fast model (e.g. minimax/M2.7). It does NOT infer context. It does NOT "figure things out". It executes exactly what you tell it. Be explicit. Be verbose. Be pedantic.**

**Your prompt must include ALL of these sections:**

```
MISSION:
[One sentence — what to do. Be atomic: ONE component, ONE endpoint, ONE fix.]

CONTEXT (READ-ONLY — do NOT modify these):
[Provide the EXACT content of any file the builder needs to read to understand the task.
 For modelos pequenos: paste the relevant function, the type definitions, the existing tests.
 If the file is >100 lines, paste ONLY the relevant section with line numbers.]

Example:
--- FILE: src/utils/validators.ts (lines 1-30) ---
export function isEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
--- END FILE ---

TARGET FILES (ONLY these may be modified):
- `path/to/file.ts` — [CREATE | MODIFY | DELETE]
  REASON: [Why this file? What is its role?]
  EXACT CHANGE: [Describe the change in words AND provide the code diff.]
  
  Use this format for each change:
  OLD:
  ```
  [paste the exact lines to be replaced]
  ```
  NEW:
  ```
  [paste the exact replacement lines]
  ```

- `path/to/other.ts` — [MODIFY]
  REASON: [...]
  EXACT CHANGE:
  OLD:
  ```
  [...]
  ```
  NEW:
  ```
  [...]
  ```

PATTERNS TO FOLLOW (mandatory):
[Describe naming conventions, import styles, error handling patterns, or any project-specific rules.]
- Use `snake_case` for file names.
- Import `logger` from `@/lib/logger`, not console.log.
- All new functions must have JSDoc.
- etc.

VERIFICATION STEPS (execute these in order):
1. [Step 1: e.g. "Run `grep -n 'functionName' src/file.ts` to confirm the change exists"]
2. [Step 2: e.g. "Run `npm test -- file.test.ts` and confirm 0 failures"]
3. [Step 3: e.g. "Check that no TypeScript errors exist with `npx tsc --noEmit`"]

DO NOT — ABSOLUTE FORBIDDEN:
❌ Do NOT modify any file not listed in TARGET FILES.
❌ Do NOT reformat, lint, or refactor unrelated code.
❌ Do NOT add new dependencies without explicit permission.
❌ Do NOT change function signatures of existing public APIs unless instructed.
❌ Do NOT leave TODO comments or placeholder code.
❌ Do NOT skip the VERIFICATION STEPS.

OUT OF SCOPE (ignore completely):
[List anything the builder might be tempted to touch but shouldn't]
- Do NOT update documentation in /docs/
- Do NOT add tests unless explicitly asked
- Do NOT change the database schema
```

### Prompt Quality Checklist (Before Sending to Builder)

| Check | Question | If NO → Fix before sending |
|-------|----------|---------------------------|
| ✅ Atomic | Does the mission fit in one sentence? | Split into smaller tasks |
| ✅ Context | Did I paste the relevant file contents? | Read the file and paste the section |
| ✅ Exact | Are old/new code blocks provided? | Find the exact string with `grep -n` |
| ✅ Bounded | Are target files explicitly listed? | Add a FILES section |
| ✅ Patterns | Did I specify naming/import conventions? | Add a PATTERNS section |
| ✅ Verifiable | Are there 2-3 concrete verification steps? | Add verification commands |
| ✅ Scoped | Is there a DO NOT / OUT OF SCOPE section? | Add one |

**If any checkbox is missing, the builder will likely fail or produce incorrect code.**

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
