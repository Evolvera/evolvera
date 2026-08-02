---
name: plan-heavy
description: Lightweight ensemble planning workflow. Use when the user explicitly asks for the plan-heavy ensemble or when the planner skill decides independent strategy briefs plus a GPT-5.6 Sol max final planner will materially improve a complex plan. Adds only three parallel briefers before a fresh normal planner synthesis; uses the same artifacts and execution flow as normal planning, with no custom harness, validator, envelope, or agent.
---

# Plan Heavy — Three Briefs, Then Sol Max Planner

Plan-heavy is the normal planner workflow with one deliberate upgrade: three isolated briefer sessions independently analyze the problem before a fresh `planner` session—using the same `agents/planner.md` prompt with an `openai-codex/gpt-5.6-sol` max-effort model override—reconciles them and writes the final plan.

```text
orchestrator handoff
  → plan-briefer + plan-briefer-fable + plan-briefer-gpt55 (parallel)
  → fresh planner synthesis on GPT-5.6 Sol max (reads all briefs directly)
  → normal PLAN_FULL / SCHEDULE / TASKS
  → normal builder/testing/validator execution
```

No custom command, tool, schema validator, execution envelope, or separate harness exists. Do not add one.

## 0. Ground Evidence Before the Ensemble

Complete the planner skill's Pre-Plan Evidence Gate before writing `HANDOFF.md`. Exact small surfaces may use direct reads. Normal coherent work usually uses one bounded scout. After bounded structure orientation exposes two or more independent evidence questions, create a Scout Fan-out Map and launch every ready 2–4 scoped scout in one concurrent wave; each shard needs a question, semantic boundary, source scope/explicit overlap, handoff, and stop condition. Reconcile the resulting Seam Synthesis before the briefers. Keep one normal scout when an end-to-end state model, exhaustive closure, or contradiction resolution needs shared context; fan-out shards are evidence only, never tasks or parallel authorization.

Do not spend three strategy briefs and a max-effort planner on first-pass repository discovery. For nontrivial/unfamiliar systems, inspect bounded file/source structure first, then choose scouts from observed product/domain boundaries. Reconcile findings as `KNOWN | INFERRED | UNKNOWN` into exact paths/symbols, existing capabilities, current behavior, relevant behavior/data/configuration/state/structure relationships, semantic units being changed, validation behavior, repository state, and bounded external gaps. Any complete affected-artifact closure claim must carry semantic anchors, searched relationship paths/scope, discovered candidates, evidence-backed `AFFECTED | UNAFFECTED` dispositions, and unresolved candidates; relationship paths derive from repository evidence rather than a fixed category list. Convert this into one contract stating user outcome, affected capabilities classified `PRESERVE | CHANGE | REMOVE`, scope, material term meanings, acceptance journeys, and unresolved conflicts. If a greppable candidate, broad unknown, or preserve/remove semantic conflict remains, continue discovery or ask the user; do not launch the briefers.

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
[reconciled direct/scout findings labeled KNOWN/INFERRED/UNKNOWN: exact files/symbols, existing capabilities, current behavior, relevant behavior/data/configuration/state/structure relationships, semantic units being changed, evidenced affected-artifact closure, validation behavior, searched scope, contradictions, and bounded gaps; include the Scout Fan-out Map and Seam Synthesis when multiple scouts ran]

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

## 3. Launch the Briefers in Parallel

Launch all three agents in one message with `run_in_background: true`:

- `plan-briefer` → writes `<PLAN_DIR>/BRIEFS/brief_gpt.md`
- `plan-briefer-fable` → writes `<PLAN_DIR>/BRIEFS/brief_fable.md`
- `plan-briefer-gpt55` → writes `<PLAN_DIR>/BRIEFS/brief_gpt55.md`

Each prompt must be self-contained and include:

- absolute `PROJECT_ROOT`, `PLAN_DIR`, and `HANDOFF.md` path;
- exact output path for that briefer;
- instruction to read required design/content artifacts named in the handoff;
- one independent strategy brief only: logic, decomposition approach, sequencing, risks, routing intuition, and validation;
- no task files, DAG, implementation, or edits outside its one output file;
- repository evidence wins; unresolved facts become `TO VERIFY`.

The briefs should disagree honestly when their independently derived judgment differs. Do not ask them to converge.

## 4. Launch the Final Planner

After all three brief files exist, launch a fresh `planner` session—never resume a prior planner—with the exact 3-word description `Plan-heavy final synthesis` so the plan-heavy watchdog remains scoped to this ensemble, using the unchanged prompt from `agents/planner.md` with the model override `model: "openai-codex/gpt-5.6-sol"` plus `thinking: "max"` in the Agent call. The normal planner agent stays on its default model and `xhigh` effort for every non-ensemble plan.

GPT-5.6 Sol prompt rules for this launch (per OpenAI first-party guidance): keep the delegated prompt lean and outcome-first; provide the domain context, hard constraints, approval boundaries, success criteria, and required evidence without prescribing ordinary intermediate reasoning; require progress and completion claims to be grounded in actual tool results; and never ask it to echo, transcribe, or explain hidden reasoning — decisions recorded in `PLAN_FULL.md` are work product, not reasoning extraction.

Give it a self-contained prompt containing:

- explicit identification that this is plan-heavy synthesis;
- approved outcome and why it matters;
- absolute `PROJECT_ROOT` and `PLAN_DIR`;
- absolute paths to `HANDOFF.md`, `brief_gpt.md`, `brief_fable.md`, and `brief_gpt55.md`;
- absolute paths to required strategy/design/content artifacts;
- instruction to read the handoff and all briefs first, reconcile disagreements against repository evidence, and write only:

```text
<PLAN_DIR>/PLAN_FULL.md
<PLAN_DIR>/SCHEDULE.md
<PLAN_DIR>/TASKS/task_NN_<agent>.md
```

Use normal planner semantics: fewest coherent tasks, one selective commit per writing task, exact write sets, disjoint parallel groups, focused validation, and selective validator gates only for named escape risks. Apply the planner's Wide-Task Parallelization Gate before accepting an atomic task or using internal phases: more than 20 declared changed paths or three or more semantic regions requires compatibility-seam analysis and a grounded Wide-Task Receipt, not automatic splitting; missing or generic evidence is `BLOCKED: WIDE_TASK_DECOMPOSITION_UNPROVEN`. Add `## Internal Execution Order` only when one writing task spans dependent semantic regions and explicit order materially reduces context switching, contradictory edits, repeated discovery, or restart cost; omit it for simple/local/homogeneous work; file count alone never activates it. Derive compact repository-evidenced phases with bounded outcome, primary authorized files/symbols, material prerequisite, and local exit evidence. The task must require the builder—not the planner—to fill `.pi/build/TILL-DO_<task-id>.md` before TODO or source mutation with evidence-backed `PASS | BLOCKED` authority/baseline, contract/scope, validation/resources, and recovery/stop gates. Only all `PASS` permits `.pi/build/TODO_<task-id>.md` mirrored from those phases; any blocked gate returns `BLOCKED` with no source mutation or TODO. These transient artifacts are not tasks, IDs, DAG nodes, issues, claims, branches, worktrees, Flow/GitHub state, commits, checkpoints, validity boundaries, or parallel authorization and stay out of the selective product commit unless explicitly tracked. Existing scope, closure, resource safety, acceptance, stop, and validation rules remain controlling. `builder-heavy` remains reserved for host/external operations or exceptional live multi-runtime coordination.

If any brief is missing or empty, stop and report the failed briefer instead of silently degrading the explicitly requested ensemble.

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
