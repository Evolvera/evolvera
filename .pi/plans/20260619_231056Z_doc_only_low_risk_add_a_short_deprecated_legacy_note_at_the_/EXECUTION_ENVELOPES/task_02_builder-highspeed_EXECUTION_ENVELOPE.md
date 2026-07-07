# Execution Envelope — task_02_builder-highspeed

Generated: 2026-06-19T23:17:46.701Z
Plan Directory: `.pi/plans/20260619_231056Z_doc_only_low_risk_add_a_short_deprecated_legacy_note_at_the_`
Task File: `.pi/plans/20260619_231056Z_doc_only_low_risk_add_a_short_deprecated_legacy_note_at_the_/TASKS/task_02_builder-highspeed.md`

## Runtime Repo State
- Branch: main
- Recent commits:
```text
97e670d feat: expose plan-heavy harness as agent tools
f435d26 chore: simplify deep search master agent
652996d chore: codify engineering principles in planning
f7dc374 chore: add plan-heavy execution envelopes
84afff1 chore: add plan-heavy harness
```
- Git status before task:
```text
M extensions/plan-heavy.ts
?? .pi/
```

## Task Target Files
- TO VERIFY: no target files parsed from task

## Current Target File Line Counts
- None / new files only / not found

## Recovery Snapshot Directory
`.pi/recovery/task_02_builder-highspeed/before`

## Patch Boundaries From Task
- Allowed paths: ONLY `agents/deep-research-auditor.md` and `agents/deep-research-finalizer.md`.
- Per file: exactly **+2 lines, 0 deletions** (`git diff --numstat` → `2  0  <file>`).
- No edits anywhere in lines 1–13. No edits to any later body `---` rule (finalizer).

## Preservation Markers From Task
TO VERIFY: task missing Preservation Markers; builder must block or request repair before editing.

## Dirty File Rules
- Stage/commit only files listed in this task plus relevant `.pi/build` and `.pi/recovery` artifacts.
- Do not stage pre-existing dirty files from the status block unless the task explicitly owns them.
- If a target file has pre-existing unrelated dirty hunks, use anchored edits and selective staging.

## Validation / Checkpoint Rules
- Run the task validation from the task file.
- Run preservation marker commands before and after editing.
- Review focused diff for target files only.
- If complete, orchestrator creates one selective checkpoint commit and records it in SCHEDULE.md.

## Handoff Excerpt
```markdown
# Planner Heavy Handoff

Generated: 2026-06-19T23:10:56.750Z
Plan Directory: `.pi/plans/20260619_231056Z_doc_only_low_risk_add_a_short_deprecated_legacy_note_at_the_`

<approved_goal>
Doc-only, low-risk: Add a short "Deprecated / Legacy" note at the very top of the BODY (immediately after the closing frontmatter `---`, before the first heading) of each of the 7 legacy phase agents: agents/deep-research-explorer.md, agents/deep-research-methodical.md, agents/deep-research-critical.md, agents/deep-research-creative.md, agents/deep-research-skeptical.md, agents/deep-research-auditor.md, agents/deep-research-finalizer.md. The note must state that the multi-agent deep research pipeline has been superseded by the single-agent Deep Search Master (agents/deep-search-master.md). HARD CONSTRAINTS: do NOT modify any YAML frontmatter, do NOT modify agents/deep-search-master.md, do NOT touch any other files, do NOT change existing body content other than inserting the note.
</approved_goal>

<repo_state>
- CWD: `/Users/j.henrique/.pi/agent`
- Branch: main
- Recent commits:
```text
97e670d feat: expose plan-heavy harness as agent tools
f435d26 chore: simplify deep search master agent
652996d chore: codify engineering principles in planning
f7dc374 chore: add plan-heavy execution envelopes
84afff1 chore: add plan-heavy harness
```
- Git status:
```text
CLEAN
```
</repo_state>

<dirty_files>
- Plan-owned dirty files: TO CLASSIFY BY ORCHESTRATOR/PLANNER
- Pre-existing dirty files NOT owned by this plan: TO CLASSIFY BEFORE COMMIT
- Unknown/dangerous dirty files:
  - None
</dirty_files>

<active_plan_state>
Existing plan files found:
```text
NONE
```
Completed tasks + checkpoint commits: TO VERIFY FROM EXISTING SCHEDULES IF CONTINUING WORK
Blocked/error tasks: TO VERIFY FROM EXISTING SCHEDULES IF CONTINUING WORK
Files touched by prior tasks: TO VERIFY FROM EXISTING SCHEDULES IF CONTINUING WORK
</active_plan_state>

<shared_file_hazards>
- None detected by harness. Planner should still verify target-file hazards from task context.
</shared_file_hazards>

<preservation_constraints>
- For every existing file that builders modify, create recovery snapshot before edit.
- For every large/shared file, identify markers/symbols/tests/helpers that must survive before editing.
- Do not include pre-existing dirty files in task commits unless explicitly owned by the plan.
</preservation_constraints>

<validation_and_checkpointing>
- Every MODIFY task requires recovery snapshot under `.pi/recovery/{task_id}/before/...`.
- Every task requires focused diff review before COMPLETE.
- Every verified task should be committed separately with selective staging only.
- SCHEDULE.md must record Recovery Snapshot and Checkpoint Commit per task.
</validation_and_checkpointing>

<stop_rules>
- Block if dirty-file ownership is ambiguous for files a task must touch.
- Block if a task would modify a large/shared file without preservation markers.
- Block if safe validation cannot be defined for a correctness-sensitive change.
- Route high-risk bounded tasks to builder-heavy.
</stop_rules>

```

## Schedule Excerpt
```markdown
# SCHEDULE — Deprecated/Legacy note on 7 legacy Deep Research v2 phase agents

Plan dir: `.pi/plans/20260619_231056Z_doc_only_low_risk_add_a_short_deprecated_legacy_note_at_the_`
Baseline: branch `main`, git status **CLEAN**, CWD `/Users/j.henrique/.pi/agent`.

## Task Table

| ID | Task File | Agent | Status | Dependencies | Parallel Group | Files Touched | Recovery Snapshot | Checkpoint Commit | Validation |
|----|-----------|-------|--------|--------------|----------------|---------------|-------------------|-------------------|------------|
| 01 | `TASKS/task_01_builder-highspeed.md` | builder-highspeed | PENDING | none | P1 | `agents/deep-research-explorer.md`, `agents/deep-research-methodical.md`, `agents/deep-research-critical.md`, `agents/deep-research-creative.md`, `agents/deep-research-skeptical.md` | `.pi/recovery/01/before/` (5 files) | `<pending>` | numstat `2 0` ×5; frontmatter (1–13) byte-identical; note ×1; `## Role` preserved |
| 02 | `TASKS/task_02_builder-highspeed.md` | builder-highspeed | PENDING | none | P1 | `agents/deep-research-auditor.md`, `agents/deep-research-finalizer.md` | `.pi/recovery/02/before/` (2 files) | `<pending>` | numstat `2 0` ×2; frontmatter (1–13) byte-identical; note ×1; `You are the **...**` paragraph preserved; anchor = 2nd `---` |

## Execution DAG

```
(baseline: main, CLEAN)
        │
        ├──> Task 01  (5 files, "## Role" group)        ┐
        │                                                ├─ parallel-capable (disjoint files)
        └──> Task 02  (2 files, paragraph group)        ┘
                 │
                 └──> plan_heavy_validate <plan-dir>
```

- No inter-task dependencies: Task 01 and Task 02 touch **disjoint** files (no shared-file hazard).
- Parallel Group **P1**: both tasks may execute in parallel.
- **Commit serialization:** even though execution is parallel, checkpoint **commits** are applied
  one at a time by the orchestrator (selective staging) to avoid git-index races.

## Checkpoint Commit Policy

- One checkpoint commit per task, **after** that task's validation passes.
- **Selective staging only:** `git add` the explicit task file paths — never `git add -A`/`git add .`.
  Repo is CLEAN, so no pre-existing dirty files to exclude; selective staging still enforced.
- Recovery snapshots under `.pi/recovery/{task_id}/before/...` are working artifacts and are **NOT**
  part of the task commit (do not stage `.pi/recovery/`).
- Suggested commit messages:
  - Task 01: `docs: add deprecated/legacy note to 5 Deep Research v2 explorer-class agents`
  - Task 02: `docs: add deprecated/legacy note to Deep Research v2 auditor & finalizer agents`
- Record the resulting commit hash back into the **Checkpoint Commit** column above and in the log.
- Rollback unit = a single task: `git checkout <task files>` (pre-commit) or `git revert <hash>` (post-commit).

## Execution Log

| Timestamp (UTC) | Task | Event | Agent | Snapshot Created | Checkpoint Hash | Validation Result | Notes |
|-----------------|------|-------|-------|------------------|-----------------|-------------------|-------|
| _pending_ | 01 | — | builder-highspeed | — | — | — | — |
| _pending_ | 02 | — | builder-highspeed | — | — | — | — |

```
