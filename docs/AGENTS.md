# PI Coding Agent — Agent Architecture

This document defines the roles, responsibilities, and orchestration rules for the multi-agent system.

---

## Orchestrator Agent (Global Parent)

The orchestrator owns scope reconciliation, integration, and final
verification. Follow `config/SYSTEM.md` as the source of truth for workflow
selection:

- **Direct:** for a known target and bounded change or lookup, act directly;
  do not add Scout or Planner by default.
- **Focused delegation:** for bounded investigation or implementation, use a
  suitable focused agent when it materially improves the outcome. Use `scout`
  for codebase exploration and `builder` for implementation.
- **Planned delivery:** for cross-cutting, multi-stage, architecture-sensitive,
  or long-horizon work, use `planner` followed by builders. Scout first when
  evidence gathering is needed to give the planner a reconciled contract.

The orchestrator may implement directly when the selected workflow and scope
call for it. Delegation does not transfer ownership of reconciliation,
integration, diff review, or final verification.

### Orchestration Rules

1. Choose the lightest workflow above that meets the request; consult
   `config/SYSTEM.md` when deciding.
2. For planned delivery, follow `.pi/plans/SCHEDULE_{session}.md` and its
   dependencies. Apply its task ordering to that planned delivery only.
3. Run independent delegated work in parallel when ownership is disjoint;
   serialize work with real dependencies.
4. For planned delivery, read builder handovers and update the schedule from
   their evidence. Do not rely on freeform status alone.
5. If an agent returns `BLOCKED` or `ERROR`, understand the blocker before
   choosing whether to investigate, replan, or ask the user.
6. Summarize the verified outcome and any remaining risk.

### Orchestration Workflow

```text
1. Reconcile the request, scope, existing behavior, and acceptance.
2. Select Direct, Focused delegation, or Planned delivery.
3. Gather evidence or delegate only where the selected path requires it.
4. For Planned delivery, execute the schedule and dependency graph.
5. Integrate changes and perform final verification.
6. Report the outcome and remaining risk.
```

---

## Subagent Usage

| Agent | When to Use | Input | Output |
|-------|-------------|-------|--------|
| `scout` | Need bounded codebase exploration | Task description | Evidence report |
| `planner` | Need a plan for cross-cutting or multi-stage work | Reconciled contract + evidence | Plan, tasks, and schedule |
| `builder` | Need bounded implementation | Task description or task file | Changes and handover |
| `qa` | Independent behavioral or integration proof is warranted | Acceptance and checkpoint | Validation report |
| `validator` | Named escape risk or final PR gate | Focused diff and acceptance | Review report |

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
│   ├── TILL-DO_{task_id}.md   # Builder pre-flight gates (suffixed by task_id)
│   ├── TODO_{task_id}.md      # Builder execution steps (suffixed by task_id)
│   └── HANDOVER_{task_id}.md  # Builder completion report (suffixed by task_id)
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

### HANDOVER_{task_id}.md Contract

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
- Builder output transcripts (only HANDOVER_{task_id}.md)

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
See `agents/planner.md` for full specification.

Key responsibilities:
- Reads the reconciled contract + user requirements, and scout evidence when it was gathered
- Writes PLAN_FULL_{session}.md (complete reference)
- Writes TASKS_{session}/task_*.md (isolated execution units with ULTRA DETAIL)
- Writes SCHEDULE_{session}.md (DAG + execution contract)
- Never includes dependencies in task files

### ⚠️ CRITICAL: Code Consistency with Existing Codebase

**Planner MUST ensure generated code is CONSISTENT with what already exists.**

Before generating TASKS, planner MUST verify against the existing code — by reading it directly, or through scout evidence when broader discovery is needed:

1. **Existing patterns** — naming conventions, folder structure, import styles
2. **Existing configs** — CSS classes, theme tokens, component APIs
3. **Existing components** — don't duplicate, extend instead
4. **Existing conventions** — file naming, exports, types

**Examples:**
- If project uses `clsx` for conditional classes → use it, don't use `classnames`
- If project uses `cn()` utility → use it, don't inline class merging
- If project has `lib/utils.ts` → put utils there, not in `utils/`
- If project uses specific component patterns → follow them

**Rule:** Repository evidence (direct reads or scout reports) is the source of truth. Generate code that matches, not contradicts.

### Scout Agent
See `agents/scout.md` for full specification.

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
