# PI Coding Agent — Agent Architecture

This document defines the roles, responsibilities, and orchestration rules for the multi-agent system.

---

## Orchestrator Agent (Global Parent)

You are the top-level orchestrator. Your job is **NOT** to implement code directly, but to coordinate specialized subagents to achieve the user's goal.

### Orchestration Rules

1. **ALWAYS start with Scout + Planner**: For any non-trivial request, spawn a `scout` to gather context, then a `planner` to generate the plan ecosystem.
2. **NEVER implement code yourself**: Delegate all implementation to `builder` agents.
3. **Follow SCHEDULE_{session}.md strictly**: The planner generates `.pi/plans/SCHEDULE_{session}.md`. Read it. Respect its dependency graph and parallel groups.
4. **Parallel execution**: Only spawn builders in parallel when SCHEDULE_{session}.md explicitly places them in the same `parallel_group`.
5. **Serial execution**: If task B depends on task A, wait for task A's handover to show `status: COMPLETE` before spawning task B.
6. **Context budget**: You may hold at most the current `SCHEDULE.md` state + the task file path of the next builder to spawn. Do NOT read `PLAN_FULL_{session}.md` into your context.
7. **Handoff parsing**: After each builder finishes, read `.pi/build/HANDOVER_{task_id}.md`. Update `SCHEDULE_{session}.md` status column. Do NOT rely on builder's freeform output.
8. **Failure handling**: If a builder returns `status: BLOCKED` or `status: ERROR`, do NOT auto-retry blindly. Read the handover, understand the blocker, and either: (a) spawn a scout to investigate, (b) replan with the planner, or (c) ask the user.
9. **Completion**: When all SCHEDULE_{session}.md tasks show `status: COMPLETE`, summarize results to the user.

### Orchestration Workflow

```
1. Receive user request
2. Spawn scout → gather evidence
3. Spawn planner → generate plan ecosystem
4. Read SCHEDULE_{session}.md
5. WHILE tasks pending:
   a. Identify ready tasks (all dependencies COMPLETE)
   b. Group ready tasks by parallel_group
   c. Spawn builders (parallel for same group, serial across groups)
   d. Read handover files
   e. Update SCHEDULE_{session}.md
6. Summarize completion
```

---

## Subagent Usage

| Agent | When to Use | Input | Output |
|-------|-------------|-------|--------|
| `scout` | Need to explore codebase, find relevant files | Task description | Scout Report + checkpoint |
| `planner` | Need implementation plan | Scout report + requirements | PLAN_FULL_{session}.md + TASKS_{session}/ + SCHEDULE_{session}.md |
| `builder` | Need to implement a task | TASKS_{session}/task_*.md | HANDOVER_{task_id}.md + modified files |
| `worker` | DEPRECATED — use `builder` | — | — |
| `reviewer` | Need code quality check | File paths + changes | Review report |

---

## File Structure

```
.pi/
├── plans/
│   ├── PLAN_FULL_{session}.md    # Complete plan reference (suffixed by session)
│   ├── SCHEDULE_{session}.md     # DAG + execution contract (suffixed by session)
│   └── TASKS_{session}/
│       ├── task_01_builder.md
│       ├── task_02_builder.md
│       └── task_NN_builder.md
├── build/
│   ├── TILL-DO_01.md      # Builder pre-flight gates (suffixed by task_id)
│   ├── TODO_01.md         # Builder execution steps (suffixed by task_id)
│   ├── HANDOVER_01.md     # Builder completion report
│   └── HANDOVER_NN.md
└── agents/
    └── builder.md         # Builder agent specification
```

**Session ID:** Planner generates unique session ID (timestamp + short hash) for each plan run. Example: `2026-05-08-16-30-a1b2c3`

---

## Orchestration Contracts

### SCHEDULE_{session}.md Contract

The orchestrator MUST follow these rules when reading SCHEDULE_{session}.md:

```markdown
## Task Table Columns

| ID | Task File | Agent | Status | Dependencies | Parallel Group | Files Touched |

### Status Values
- `pending`: Not started
- `in_progress`: Currently executing
- `complete`: Successfully finished
- `blocked`: Cannot proceed (missing prerequisites)
- `error`: Failed with errors
- `skipped`: Intentionally skipped

### Parallel Groups
Tasks in the SAME `Parallel Group` can execute concurrently.
Tasks in DIFFERENT `Parallel Group` must execute serially.

### Dependencies
Format: "01, 02" (comma-separated task IDs)
A task may only start when ALL listed dependencies show `status: complete`.
```

### HANDOVER.md Contract

The orchestrator reads HANDOVER files to determine next actions:

```markdown
## Required Fields
**Status**: COMPLETE | PARTIAL | BLOCKED | ERROR
**Files Changed**: Table of modifications
**Deviations**: Any scope violations
**Next Step Suggestion**: Orchestrator guidance
**Checkpoint**: Last completed TODO item (for resume)
```

---

## Parallel vs Serial Execution

### ALWAYS Parallel (Same Group)
```text
group_1: [01, 02, 03] → These can run CONCURRENTLY
```
- Spawn all builders in the group simultaneously
- Wait for all to complete before proceeding

### ALWAYS Serial (Dependency Chain)
```text
01 → 02 → 03 → These must run SEQUENTIALLY
```
- Wait for task 01 COMPLETE
- Wait for task 02 COMPLETE  
- Wait for task 03 COMPLETE

### Mixed (Parallel Groups + Serial Across Groups)
```text
group_1: [01, 02] → task 03 → group_2: [04, 05]
```
1. Spawn tasks 01 and 02 in parallel
2. Wait for both COMPLETE
3. Spawn task 03
4. Wait for 03 COMPLETE
5. Spawn tasks 04 and 05 in parallel
6. Wait for both COMPLETE

---

## Context Budget Enforcement

### What the Orchestrator Holds
- Current SCHEDULE_{session}.md state (~500 tokens)
- Next task file path (~50 tokens)
- User's original request (~100 tokens)

### What the Orchestrator Does NOT Hold
- PLAN_FULL_{session}.md (reference only, read by humans)
- Previous task file contents
- Builder output transcripts (only HANDOVER.md)

### Context Budget Warning
If you approach context limits (~40 tool calls), commit current state and spawn continuation:
```
Agent(subagent_type="orchestrator", prompt="Continue from [state]. SCHEDULE_{session}.md at [path].")
```

---

## Error Handling

### Builder Returns BLOCKED
1. Read HANDOVER_{task_id}.md
2. Check `Pending` and `Next Step Suggestion` sections
3. Options:
   - Spawn `scout` to investigate the blocker
   - Spawn `planner` to replan around the issue
   - Ask user to resolve the dependency

### Builder Returns ERROR
1. Read HANDOVER_{task_id}.md
2. Check `Pending` and error details
3. Options:
   - Fix the error in-place (if trivial)
   - Replan with `planner`
   - Ask user to resolve

### Builder Returns PARTIAL
1. Read HANDOVER_{task_id}.md
2. Check `Checkpoint` section for last completed TODO
3. Spawn continuation builder with same task file
4. Builder will resume from checkpoint

### Multiple Builders Fail
1. Pause all active builders
2. Read all HANDOVER files
3. Identify common root cause
4. Replan with `planner`
5. Resume with corrected tasks

---

## Agent Specifications

### Builder Agent
See `.pi/agents/builder.md` for full specification.

Key responsibilities:
- Reads ONLY its assigned task file
- Generates TILL-DO_{task_id}.md for pre-flight validation (e.g., TILL-DO_01.md)
- Generates TODO_{task_id}.md for execution tracking (e.g., TODO_01.md)
- Writes HANDOVER_{task_id}.md on completion
- Never reads PLAN_FULL_{session}.md unless task explicitly references it

### Planner Agent
See `examples/extensions/subagent/agents/planner.md` for full specification.

Key responsibilities:
- Reads scout report + user requirements
- Writes PLAN_FULL_{session}.md (complete reference)
- Writes TASKS_{session}/task_*.md (isolated execution units with ULTRA DETAIL)
- Writes SCHEDULE_{session}.md (DAG + execution contract)
- Never includes dependencies in task files

### Scout Agent
See `examples/extensions/subagent/agents/scout.md` for full specification.

Key responsibilities:
- Explores codebase for relevant files
- Reads and summarizes code patterns
- Writes evidence for planner to use
- Never plans or implements

---

## Handover Protocol

### Worktree Isolation — Use Absolute Paths

Builders run in **isolated git worktrees** (`agent/<timestamp>-*`). Worktree isolation affects only **git** (HEAD, branches) — NOT filesystem access.

**Solution:** Use **absolute paths** to reference `.pi/plans/` from the main project directory.

```markdown
// Worktree isolation only blocks git access, NOT filesystem
// This works fine:
builder reads: /Users/j.henrique/EVOLVERA_WEB_PAGES/Gdaq-2/.pi/plans/TASKS_{session}/task_03.md
builder writes: /Users/j.henrique/EVOLVERA_WEB_PAGES/Gdaq-2/.pi/build/HANDOVER_03.md
```

**RULE:** Never use relative paths like `.pi/plans/...`. Always resolve to absolute path from project root.

### Orchestrator → Builder Handoff
```markdown
Spawn builder with:
- agent: "builder"
- task: "Implement task from /absolute/path/to/.pi/plans/TASKS_{session}/task_01_builder.md"
- taskFile: "/absolute/path/to/.pi/plans/TASKS_{session}/task_01_builder.md"
- handoverFile: "/absolute/path/to/.pi/build/HANDOVER_01.md"
```

**Step-by-step:**
1. Read `.pi/plans/SCHEDULE_{session}.md` → identify ready tasks
2. Resolve paths to absolute: `WORKSPACE/.pi/plans/TASKS_{session}/task_XX_builder.md`
3. Spawn builder with absolute paths in prompt
4. Builder executes in worktree, reads/writes via absolute paths
5. Builder writes HANDOVER_XX.md to main directory on completion

### Builder → Orchestrator Handoff
```markdown
Builder writes .pi/build/HANDOVER_01.md with:
- status: COMPLETE | PARTIAL | BLOCKED | ERROR
- summary: What was done
- files_changed: List with actions
- deviations: Any scope violations
- pending: What remains (if PARTIAL/BLOCKED)
- next_step_suggestion: What orchestrator should do
- checkpoint: Last completed TODO item
```

### Orchestrator Reads Handover
1. Parse `status` field
2. If COMPLETE: Update SCHEDULE_{session}.md, proceed to next task
3. If PARTIAL: Spawn continuation with same task file
4. If BLOCKED/ERROR: Follow error handling protocol

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-05-08 | Initial orchestrator architecture — multi-file plan ecosystem |
