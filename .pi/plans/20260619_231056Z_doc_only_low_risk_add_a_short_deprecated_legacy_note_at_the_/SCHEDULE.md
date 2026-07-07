# SCHEDULE — Deprecated/Legacy note on 7 legacy Deep Research v2 phase agents

Plan dir: `.pi/plans/20260619_231056Z_doc_only_low_risk_add_a_short_deprecated_legacy_note_at_the_`
Baseline: branch `main`, git status **CLEAN**, CWD `/Users/j.henrique/.pi/agent`.

## Task Table

| ID | Task File | Agent | Status | Dependencies | Parallel Group | Files Touched | Recovery Snapshot | Checkpoint Commit | Validation |
|----|-----------|-------|--------|--------------|----------------|---------------|-------------------|-------------------|------------|
| 01 | `TASKS/task_01_builder-highspeed.md` | builder-highspeed | DONE | none | P1 | `agents/deep-research-explorer.md`, `agents/deep-research-methodical.md`, `agents/deep-research-critical.md`, `agents/deep-research-creative.md`, `agents/deep-research-skeptical.md` | `.pi/recovery/01/before/` (5 files) | `baec6bc` | numstat `2 0` ×5; frontmatter (1–13) byte-identical; note ×1; `## Role` preserved |
| 02 | `TASKS/task_02_builder-highspeed.md` | builder-highspeed | DONE | none | P1 | `agents/deep-research-auditor.md`, `agents/deep-research-finalizer.md` | `.pi/recovery/02/before/` (2 files) | `396d93d` | numstat `2 0` ×2; frontmatter (1–13) byte-identical; note ×1; `You are the **...**` paragraph preserved; anchor = 2nd `---` |

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
| 2026-06-19T23:19Z | 01 | COMMITTED | builder-highspeed | yes (.pi/recovery/01/before/, 5 files) | baec6bc | PASS (numstat 2 0 ×5; frontmatter byte-identical; note ×1; ## Role@17) | selective stage of 5 files only; .pi/ excluded |
| 2026-06-19T23:20Z | 02 | COMMITTED | builder-highspeed | yes (.pi/recovery/02/before/, 2 files) | 396d93d | PASS (numstat 2 0 ×2; frontmatter byte-identical; note ×1; paragraph@17; finalizer ---count 10→10) | selective stage of 2 files only; .pi/ excluded |
