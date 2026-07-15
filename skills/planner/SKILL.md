---
name: planner
description: Use for any planning request or when deciding whether planning is needed. Chooses pre-plan/direct execution, normal planner by default, or rare plan-heavy escalation.
---

# Planner Skill — Choose, Plan, Execute

Use this skill first whenever the user asks for a plan, architecture, decomposition, implementation strategy, or when the orchestrator is unsure whether planning is necessary. The skill decides the lightest path; loading it does not imply launching a planner.

## 1. Choose the Path First

| Situation | Path |
|---|---|
| User wants a quick plan or the change is already obvious and bounded | **Pre-plan only**: give a concise approach; do not launch an agent |
| One bounded implementation concern with known targets | **Direct/focused delegation** using the builder skill |
| Several bounded asks in one message, with grounded disjoint write sets and a short dependency order | **Focused multi-builder orchestration** — make a private mental schedule; no planner artifacts |
| Multiple concerns with architecture decisions, unclear sequencing, shared ownership, or long-horizon coordination | **Normal planner** — default full-plan route |
| Exceptional preservation/recovery or subtle invariant risk passes the gate below | **`/plan-heavy`** — rare escalation |

### Commit Forecast (speed heuristic)

Before selecting a route, mentally forecast the smallest coherent selective commits: each has one outcome, write set, validation result, and rollback boundary. This is not a task quota or user-facing ceremony.

- **1 commit:** direct tools or one focused builder.
- **2–5 clear commits:** load the builder skill; use focused delegation and parallelize only disjoint SoC slices when the coordination overhead is lower than serial execution.
- **More than ~5 commits:** normal planner is preferred, because it can create the dependency graph once and reduce wall-clock time through safe parallel groups.

Override the count when warranted: use planner earlier for difficult coordination, shared contracts, architecture, uncertain sequencing, or high rework risk; stay direct when several edits are mechanically one coherent commit. Importance alone does not require planning. High-impact but bounded deploy, staging, SSH, security, nginx/Plesk, ACME, CI, provider, reload, or rollback work normally uses a concise pre-plan or normal planner, then `builder-heavy` plus selective validation.

### Bundled-request decision

A user can send several asks at once without needing plan artifacts. Before choosing the normal planner, privately inventory each requested outcome, likely target/write set, prerequisite evidence, validation resource, and rollback boundary. Make a mental schedule: same wave only for disjoint write sets with non-conflicting validation/resources; later waves for dependencies, shared files/contracts, external effects, and anything whose discovery determines another unit. Use focused multi-builder orchestration when this schedule is short, grounded, and easy to revise. Do not show a task graph unless it changes a user decision. Use the normal planner when the mental schedule would be speculative or hard to coordinate safely.

## 2. Lightweight Planning Intake

Establish only what changes the decision:

- approved outcome and concrete success criteria;
- in-scope and out-of-scope boundaries;
- relevant repository evidence and likely targets;
- material compatibility, security, data, rollout, or preservation constraints;
- validation that proves completion;
- blockers that require asking instead of guessing.

Ask only when missing information materially changes correctness, risk, cost, or scope **and** cannot be resolved from repository evidence (code, config, tests, git history, docs). If the user already approved an equivalent scope, do not add another approval ceremony merely to launch the planner.

For an unfamiliar codebase, load `agent-guide` + `scout` and gather bounded evidence first. Search source roots/tracked files; exclude generated artifacts and historical plans unless explicitly relevant.

## 3. Normal Planner — Default Full-Plan Route

Use `Agent(subagent_type="planner")` when a full plan ecosystem is useful. Before launch, resolve the repository that owns the requested change—normally with `git -C <known-project-path> rev-parse --show-toplevel`—and create a unique logical output path:

```text
<PROJECT_ROOT>/.pi/plans/<UTC_YYYYMMDD_HHMMSSZ>_<short_goal_slug>/
```

Pass both absolute paths to the planner. Never let a subagent choose its output repository from its inherited cwd. If the current cwd is the global PI harness but the requested change belongs to another project, planning under `~/.pi/agent/.pi/plans/` is incorrect. Reuse an existing plan directory only when explicitly continuing that named plan.

Give the planner a compact, outcome-first handoff:

```text
PROJECT_ROOT
[absolute repository root that owns the change]

PLAN_DIR
[absolute unique directory under PROJECT_ROOT/.pi/plans/]

GOAL / SUCCESS
[approved outcome and observable completion]

SCOPE
[in / out]

EVIDENCE
[only relevant files, symbols, scout findings, current behavior]

CURRENT STATE
[branch/status/dirty ownership only when it affects target work]

CONSTRAINTS
[task-specific compatibility, preservation, security, rollout]

VALIDATION
[focused commands/checks]

STOP IF
[material unknowns or unsafe boundaries]
```

Do not inventory all `.pi/plans/`, dump the repository, or copy generic process text. Include a prior plan only when the approved goal explicitly continues or recovers that named plan. The planner may inspect focused repository evidence, but it must stop when targets, boundaries, validation, and material unknowns are grounded.

Expected output:

```text
<PLAN_DIR>/
  PLAN_FULL.md
  SCHEDULE.md
  TASKS/task_NN_<agent>.md
```

## 4. `/plan-heavy` — Exceptional Admission Gate

Use `/plan-heavy` only when a full plan is already justified, its independent strategy work is expected to improve both long-horizon quality **and** elapsed delivery time, **and** normal planner output is insufficient because at least one is true:

1. Target files contain overlapping pre-existing user changes or partially executed checkpoints that require preservation/recovery reconciliation.
2. The work is recovering a failed multi-task delivery where shared-file ownership, checkpoint history, or rollback state is ambiguous.
3. Correctness depends on a subtle formal, numerical, scientific, round-trip/merge, or adversarial invariant where independent strategy briefs materially reduce error risk.

The qualifying condition must dominate plan-wide coordination. One bounded sensitive subcomponent—auth/payment, exactly-once behavior, migration, PHI, or a difficult UI state machine—does not escalate an otherwise clean delivery; isolate it in a normal-planner task with proportionate testing/validator evidence. The goal saying “heavy” is not itself a qualifying reason.

State the qualifying reason before invoking it. These do **not** qualify by themselves:

- an existing `.pi/plans/` directory;
- a dirty tree unrelated to target files;
- many files or many tasks;
- a large/shared file with clear ownership;
- staging, deploy, SSH, security, Plesk/nginx, ACME, CI, provider, reload, or rollback;
- the task being important or high consequence.

When admitted, use the deterministic `/plan-heavy` flow and its generated prompts. `plan_heavy_handoff` requires the same absolute `projectRoot` contract as the normal planner (resolve with `git -C <path> rev-parse --show-toplevel`); it never derives the repository from the session cwd, and all generated prompts use absolute paths. Historical plans remain excluded unless the goal names one. If `plan_heavy_validate` returns `BLOCKED`, end that attempt and report the bounded findings; do not resume or loop the planner.

## 5. Plan Quality Contract

A good plan reduces builder complexity without expanding scope:

- Any task count is acceptable when every task has one coherent responsibility.
- Every writing task maps to exactly one selective commit: one outcome, exact write set, validation result, and rollback/recovery boundary.
- Split at real implementation, write-set, checkpoint, rollback, or validation boundaries—not to repeat hazards, matrices, or process prose.
- Optimize for critical path: group only independent, disjoint SoC slices in parallel; serialize shared contracts/external effects; do not manufacture parallelism.
- `PLAN_FULL.md` owns rationale; `SCHEDULE.md` owns dependencies; task files own execution contracts.
- **Observability-first validation:** every behavior-changing task names evidence from the running system, not only compile checks. For auth/payment/data, migrations, integrations, async/webhooks, and user-visible frontend, the task's validation contract must include executing the affected journey/endpoint and inspecting the observed response, log, persisted state, or rendered page/console. Type/lint/build alone is acceptable only for genuinely static/mechanical tasks; when runtime observation is unavailable, the task must require reporting that gap as unverified rather than complete.
- PR creation, merge, CI waiting, board/Flow reconciliation, and branch cleanup remain orchestrator steps, not builder tasks.
- Historical plans, adjacent risks, and optional improvements never expand approved scope.

Apply engineering principles as decisions, not boilerplate:

- SoC/SRP: one coherent responsibility per task/module.
- DRY/Rule of Three: reuse existing helpers; no new abstraction before three proven repetitions or an architectural requirement.
- KISS/YAGNI: smallest readable in-scope solution; no speculative dependency, API, flag, migration, extension point, cleanup, or future-proofing.
- DYC: document only non-obvious decisions, invariants, failure/rollback behavior, or operations.
- TDD where practical: targeted regression/characterization test before behavior changes, or the closest focused validation with its limitation.

## 6. Routing and Validation

Load the builder skill; it is authoritative for tier selection. Defaults:

- normal procedural work → `builder`;
- routine locally-decidable work (clear anchor, established pattern, exact validation) → `builder-light`; routine design-system UI → `builder-light-design`;
- complex procedural/integration or any host/external operation → `builder-heavy`;
- local semantic/declarative model with a clear oracle or visual/UI work → Fable design tier;
- exceptional formal/numerical/scientific work with an explicit oracle → `builder-ultra`.

A server/config file containing rules is not enough to select Fable. Host, SSH, deploy, network, Plesk, nginx, ACME, CI, reload, rollback, provider, or other external operations always route to `builder-heavy`.

Add a linked `validator` task only when a specific producer has a credible high-consequence escape risk. Do not add blanket validators for inventory, docs, mechanical work, or every builder. Validator gates are review-only by default and return `PASS | BLOCKED`.

## 7. Execute the Plan

Before builders, read `SCHEDULE.md` and task contracts; ask for user review only when implementation scope, cost, or risk is not already approved.

- Run dependencies serially.
- Run safe independent groups in concurrent waves according to the builder skill.
- Create recovery snapshots before modifying existing files.
- After each verified writing task, create exactly one selective commit and record its hash.
- After the relevant task or coherent builder wave is checkpointed, ensure proportionate outcome evidence against that exact head: producer proof may close static/mechanical work; run an obvious deterministic integration check directly; load the `testing` skill and use a fresh `builder` in `POST-BUILD TEST MODE` only when independent scenario selection, edge/error coverage, integration, or runtime observation materially improves confidence. Do not add testing-only task files or SCHEDULE rows.
- A dependent task starts only after its writing dependency is checkpointed, any materially required post-build proof is satisfied, and any linked validator records `PASS`. Validator review complements rather than replaces behavioral testing.
- Inspect actual diffs and validation evidence; never trust summaries alone.

## Stop Rules

Stop and re-ground when target ownership, required evidence, validation, or rollback cannot be established; when the plan expands approved scope; when a planner produces orchestration bookkeeping as tasks; or when validation is `BLOCKED`. Do not repair a bad plan by adding bureaucracy—correct the smallest violated contract or choose a lighter path.
