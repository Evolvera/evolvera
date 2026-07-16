---
name: plan-heavy
description: Lightweight ensemble planning workflow. Use when the user explicitly asks for planner-heavy or when the planner skill decides two independent strategy briefs plus an xhigh final planner will materially improve a complex plan. Adds only two parallel briefers before planner-heavy; uses the same artifacts and execution flow as the normal planner, with no custom harness, validator, envelope, or extension.
---

# Plan Heavy — Two Briefs, Then XHigh Planner

Plan-heavy is the normal planner workflow with one deliberate upgrade: two different model families independently brief the problem before `planner-heavy` writes the final plan at xhigh reasoning.

```text
orchestrator handoff
  → plan-briefer + plan-briefer-fable (parallel)
  → planner-heavy (reads both directly)
  → normal PLAN_FULL / SCHEDULE / TASKS
  → normal builder/testing/validator execution
```

No custom command, tool, schema validator, execution envelope, or separate harness exists. Do not add one.

## 0. Ground Evidence Before the Ensemble

Complete the planner skill's Pre-Plan Evidence Gate before writing `HANDOFF.md`. Exact small surfaces may use direct reads. Normal coherent work usually uses one bounded scout. Large/cross-cutting systems use proportional parallel micro-scouts for independent domains and a normal scout only when end-to-end synthesis or contradiction resolution remains necessary.

Do not spend two strategy briefs and an xhigh planner on first-pass repository discovery. Reconcile scout/direct findings into exact paths/symbols, architecture/schema/state contracts, consumers/wiring, tests/runners/harness behavior, repository state, and bounded external gaps. If those facts are still broad unknowns, continue scouting; do not launch the briefers.

## 1. Establish the Plan Directory

Resolve the repository root from evidence, normally:

```bash
git -C <known-project-path> rev-parse --show-toplevel
```

Create a unique absolute directory:

```text
<PROJECT_ROOT>/.pi/plans/<UTC_YYYYMMDD_HHMMSSZ>_<short_goal_slug>/
```

Never derive the target repository from the orchestrator's unrelated cwd. Reuse a plan directory only when explicitly continuing that exact attempt.

## 2. Write One Simple Handoff

The orchestrator writes `<PLAN_DIR>/HANDOFF.md` directly. Keep it outcome-first and concise:

```markdown
# Planning Handoff

## Goal and Success
[approved outcome and observable completion]

## Scope
[in / out]

## Required Inputs
[absolute paths to strategy/design/content artifacts, when any]

## Pre-Plan Evidence
[reconciled direct/scout findings: exact files/symbols, architecture/schema/state contracts, consumers/wiring, tests/runners/harness behavior, current behavior, searched scope, contradictions, and bounded gaps]

## Repository State
[project root, branch, head, focused status/dirty ownership]

## Constraints
[security, compatibility, preservation, rollback, external-operation limits]

## Validation
[commands, runtime journeys, observable evidence]

## Stop If
[material unknowns that cannot be safely marked TO VERIFY]
```

Do not dump repository inventories, raw scout transcripts, historical plans, generic principles, or irrelevant harness metadata. Existing design/content artifacts remain inputs; copy or reference them explicitly rather than regenerating them.

## 3. Launch Both Briefers in Parallel

Launch both agents in one message with `run_in_background: true`:

- `plan-briefer` → writes `<PLAN_DIR>/BRIEFS/brief_gpt.md`
- `plan-briefer-fable` → writes `<PLAN_DIR>/BRIEFS/brief_fable.md`

Each prompt must be self-contained and include:

- absolute `PROJECT_ROOT`, `PLAN_DIR`, and `HANDOFF.md` path;
- exact output path for that briefer;
- instruction to read required design/content artifacts named in the handoff;
- one independent strategy brief only: logic, decomposition approach, sequencing, risks, routing intuition, and validation;
- no task files, DAG, implementation, or edits outside its one output file;
- repository evidence wins; unresolved facts become `TO VERIFY`.

The briefs should disagree honestly when their model-specific judgment differs. Do not ask them to converge.

## 4. Launch Planner Heavy

After both brief files exist, launch `planner-heavy` with a self-contained prompt containing:

- approved outcome;
- absolute `PROJECT_ROOT` and `PLAN_DIR`;
- absolute paths to `HANDOFF.md`, `brief_gpt.md`, and `brief_fable.md`;
- absolute paths to required strategy/design/content artifacts;
- instruction to read both briefs directly, reconcile disagreements against repository evidence, and write only:

```text
<PLAN_DIR>/PLAN_FULL.md
<PLAN_DIR>/SCHEDULE.md
<PLAN_DIR>/TASKS/task_NN_<agent>.md
```

Use normal planner semantics: fewest coherent tasks, one selective commit per writing task, exact write sets, disjoint parallel groups, focused validation, and selective validator gates only for named escape risks. `builder-heavy` remains reserved for host/external operations or exceptional live multi-runtime coordination.

If one brief is missing or empty, stop and report the failed briefer instead of silently degrading the explicitly requested ensemble.

## 5. Orchestrator Review and Execution

Review the generated artifacts exactly as with the normal planner:

- objective and scope match approval;
- tasks have one agent, exact write set, acceptance, validation, and rollback boundary;
- shared files are serialized;
- parallel groups are genuinely disjoint;
- no speculative tasks, delivery ceremony, or validator-per-risk inflation;
- runtime observation is required where behavior demands it.

If the plan is materially malformed, end that attempt and report the smallest findings. Do not create a custom repair/validation loop.

Then execute through the normal builder skill and outcome lifecycle:

```text
build → proportionate test evidence → selective validator/review → authorized ship
```

No plan-heavy-specific builder preparation exists.
