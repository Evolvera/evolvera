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
| Existing plan has one localized, evidence-grounded defect | **Direct artifact repair** — edit only the named plan/task/schedule files; do not launch or resume a planner |
| Several bounded asks in one message, with grounded disjoint write sets and a short dependency order | **Focused multi-builder orchestration** — make a private mental schedule; no planner artifacts |
| Multiple concerns with architecture decisions, unclear sequencing, shared ownership, or long-horizon coordination | **Normal planner** — default full-plan route |
| User explicitly requests planner-heavy, or two independent strategy briefs plus xhigh planning materially improve a complex plan | **Plan-heavy ensemble** — load the `plan-heavy` skill |

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

## 3. Existing-Plan Repair Fast Path

When an existing plan has a localized defect and the exact correction is already grounded, repair it directly. Examples: one task has vague schema names, a wrong builder route, an incomplete write set, a missing validation command, one incorrect schedule edge, or a format violation.

- Read the affected plan artifact plus only the exact source/config evidence needed to state the correction.
- Edit the smallest named artifact set directly; keep unaffected tasks, DAG edges, rationale, and approved scope unchanged.
- Run focused plan consistency checks after the edit.
- Do not launch or resume `planner` or `planner-heavy` merely because the file being edited is a plan artifact.

Use a planner again only when the correction changes architecture, task decomposition/DAG, ownership/write-set boundaries across multiple tasks, approved scope, or unresolved sequencing. If the correction cannot be stated precisely from evidence, stop and gather that evidence; do not ask a planner to rediscover the repository under a vague “repair plan” goal.

## 4. Normal Planner — Default Full-Plan Route

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

## 5. Plan-Heavy Ensemble

When the user explicitly requests planner-heavy—or independent strategies from GPT and Fable are expected to materially improve a complex plan—load the `plan-heavy` skill and follow it directly.

Plan-heavy is not a separate harness. It uses the normal planner's repository-root, plan-directory, artifact, task, execution, testing, and validator conventions. Its only differences are:

1. the orchestrator writes one concise `HANDOFF.md`;
2. `plan-briefer` and `plan-briefer-fable` produce independent briefs in parallel;
3. `planner-heavy` reads the handoff plus both briefs and writes the normal plan ecosystem at xhigh reasoning.

An explicit user request for planner-heavy is sufficient. Do not replace it with the normal planner based on an admission gate, and do not create custom validation/envelope machinery.

## 6. Plan Quality Contract

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

## 7. Routing and Validation

Load the builder skill; it is authoritative for tier selection. Defaults:

- normal procedural work → `builder`;
- routine locally-decidable work (clear anchor, established pattern, exact validation) → `builder-light`; routine design-system UI → `builder-light-design`;
- complex procedural/integration or any host/external operation → `builder-heavy`;
- local semantic/declarative model with a clear oracle or visual/UI work → Fable design tier;
- exceptional formal/numerical/scientific work with an explicit oracle → `builder-ultra`.

A server/config file containing rules is not enough to select Fable. Host, SSH, deploy, network, Plesk, nginx, ACME, CI, reload, rollback, provider, or other external operations always route to `builder-heavy`.

Add a linked `validator` task only when a specific producer has a credible high-consequence escape risk. Do not add blanket validators for inventory, docs, mechanical work, or every builder. Validator gates are review-only by default and return `PASS | BLOCKED`.

## 8. Execute the Plan

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
