---
name: plan-heavy
description: Lightweight ensemble planning workflow. Use when the user explicitly asks for the plan-heavy ensemble or when the planner skill decides two independent strategy briefs plus an xhigh final planner will materially improve a complex plan. Adds only two parallel briefers before a fresh normal planner synthesis; uses the same artifacts and execution flow as normal planning, with no custom harness, validator, envelope, or agent.
---

# Plan Heavy — Two Briefs, Then XHigh Planner

Plan-heavy is the normal planner workflow with one deliberate upgrade: two isolated briefer sessions independently analyze the problem before a fresh `planner` session reconciles them and writes the final plan at xhigh reasoning.

```text
orchestrator handoff
  → plan-briefer + plan-briefer-fable (parallel)
  → fresh planner xhigh synthesis (reads both directly)
  → normal PLAN_FULL / SCHEDULE / TASKS
  → normal builder/testing/validator execution
```

No custom command, tool, schema validator, execution envelope, or separate harness exists. Do not add one.

## 0. Ground Evidence Before the Ensemble

Complete the planner skill's Pre-Plan Evidence Gate before writing `HANDOFF.md`. Exact small surfaces may use direct reads. Normal coherent work usually uses one bounded scout. Large/cross-cutting systems use proportional parallel micro-scouts for independent domains and a normal scout only when end-to-end synthesis or contradiction resolution remains necessary.

Do not spend two strategy briefs and an xhigh planner on first-pass repository discovery. For nontrivial/unfamiliar systems, inspect bounded file/source structure first, then choose scouts from observed product/domain boundaries. Reconcile findings as `KNOWN | INFERRED | UNKNOWN` into exact paths/symbols, existing capabilities, current behavior, relevant behavior/data/configuration/state/structure relationships, semantic units being changed, validation behavior, repository state, and bounded external gaps. Any complete affected-artifact closure claim must carry semantic anchors, searched relationship paths/scope, discovered candidates, evidence-backed `AFFECTED | UNAFFECTED` dispositions, and unresolved candidates; relationship paths derive from repository evidence rather than a fixed category list. Convert this into one contract stating user outcome, affected capabilities classified `PRESERVE | CHANGE | REMOVE`, scope, material term meanings, acceptance journeys, and unresolved conflicts. If a greppable candidate, broad unknown, or preserve/remove semantic conflict remains, continue discovery or ask the user; do not launch the briefers.

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

## Reconciled Planning Contract
[approved outcome; affected existing capabilities; PRESERVE/CHANGE/REMOVE decisions; in/out scope; material term meanings; acceptance journeys; unresolved conflicts and owner]

## Required Inputs
[absolute paths to strategy/design/content artifacts, when any]

## Pre-Plan Evidence
[reconciled direct/scout findings labeled KNOWN/INFERRED/UNKNOWN: exact files/symbols, existing capabilities, current behavior, relevant behavior/data/configuration/state/structure relationships, semantic units being changed, evidenced affected-artifact closure, validation behavior, searched scope, contradictions, and bounded gaps]

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

The briefs should disagree honestly when their independently derived judgment differs. Do not ask them to converge.

## 4. Launch the Final Planner

After both brief files exist, launch a fresh `planner` session—never resume a prior planner—with the exact 3-word description `Plan-heavy final synthesis` so the plan-heavy watchdog remains scoped to this ensemble. Give it a self-contained prompt containing:

- explicit identification that this is plan-heavy synthesis;
- approved outcome;
- absolute `PROJECT_ROOT` and `PLAN_DIR`;
- absolute paths to `HANDOFF.md`, `brief_gpt.md`, and `brief_fable.md`;
- absolute paths to required strategy/design/content artifacts;
- instruction to read the handoff and both briefs first, reconcile disagreements against repository evidence, and write only:

```text
<PLAN_DIR>/PLAN_FULL.md
<PLAN_DIR>/SCHEDULE.md
<PLAN_DIR>/TASKS/task_NN_<agent>.md
```

Use normal planner semantics: fewest coherent tasks, one selective commit per writing task, exact write sets, disjoint parallel groups, focused validation, and selective validator gates only for named escape risks. Add `## Internal Execution Order` only when one writing task spans dependent semantic regions and explicit order materially reduces context switching, contradictory edits, repeated discovery, or restart cost; omit it for simple/local/homogeneous work; file count alone never activates it. Derive compact repository-evidenced phases with bounded outcome, primary authorized files/symbols, material prerequisite, and local exit evidence. The task must require the builder—not the planner—to fill `.pi/build/TILL-DO_<task-id>.md` before TODO or source mutation with evidence-backed `PASS | BLOCKED` authority/baseline, contract/scope, validation/resources, and recovery/stop gates. Only all `PASS` permits `.pi/build/TODO_<task-id>.md` mirrored from those phases; any blocked gate returns `BLOCKED` with no source mutation or TODO. These transient artifacts are not tasks, IDs, DAG nodes, issues, claims, branches, worktrees, Flow/GitHub state, commits, checkpoints, validity boundaries, or parallel authorization and stay out of the selective product commit unless explicitly tracked. Existing scope, closure, resource safety, acceptance, stop, and validation rules remain controlling. `builder-heavy` remains reserved for host/external operations or exceptional live multi-runtime coordination.

If one brief is missing or empty, stop and report the failed briefer instead of silently degrading the explicitly requested ensemble.

## 5. Orchestrator Review and Execution

Review the generated artifacts exactly as with the normal planner:

- objective and scope match approval;
- tasks have one agent, exact write set derived from evidenced affected-artifact closure, acceptance, validation, and rollback boundary;
- every writing task has a proportional proof receipt covering semantic delta, closure evidence, exact post-task checkpoint validity, and acceptance path, including affected `PRESERVE | CHANGE | REMOVE` journeys with non-self-fulfilling oracles;
- one counterexample pass found no affected relation, preserved journey, acceptance path, or validity boundary requiring an undeclared artifact or later restoration;
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
