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
| User explicitly requests the plan-heavy ensemble, or two independent strategy briefs plus xhigh planning materially improve a complex plan | **Plan-heavy ensemble** — load the `plan-heavy` skill |

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

### Pre-Plan Evidence Gate

Before any full planner or plan-heavy ensemble, build a concise evidence package and a reconciled planning contract. Planner must design from grounded system understanding and user intent, not perform broad first-pass discovery or decide unresolved product semantics.

For nontrivial/unfamiliar repositories, orient before deep retrieval: inspect bounded file/source structure without opening implementation bodies, identify product roots and likely domain/test/config/docs surfaces, and record only candidate areas—not behavior conclusions. Use that map to choose scouting proportionally:

- Exact paths, semantic relationships, affected-artifact closure, and validation already known from current evidence: use focused direct reads; no ceremonial scout.
- Normal multi-file or multi-layer feature: use one bounded `scout` mission covering the coherent flow.
- Large/cross-cutting repository with separable domains: launch one parallel scoped `scout` mission per observed independent slice, such as entry flow, state/structure relationships, affected-artifact closure, and validation/execution boundaries. Use one synthesis `scout` afterward only when end-to-end synthesis or contradiction resolution remains necessary.
- One stateful flow whose semantics cross API, database, retries, webhooks, and tests: prefer one normal `scout`; splitting would lose coherence.

The evidence package must cover, with exact paths/symbols and stated searched scope:

- current entry points, product boundaries, existing capabilities, and end-to-end behavior;
- relevant architecture and behavior/data/configuration/state/structure relationships;
- for each intended outcome, the semantic unit being changed and a coverage receipt for its affected-artifact closure: semantic anchors, searched relationship paths/scope, discovered candidates, evidence-backed `AFFECTED | UNAFFECTED` dispositions, and unresolved candidates. Derive relationship paths from repository evidence rather than a fixed artifact list; any greppable unresolved candidate keeps closure `UNKNOWN`;
- existing validation surfaces plus what their commands actually discover, configure, execute, and prove; for any stateful command, resolve runner/env/setup/teardown and identify DB/schema, directories, buckets, queues, caches, indexes, devices and external services, including destructive hooks and whether each is provably run-owned disposable;
- repository/branch/dirty ownership relevant to the write set;
- external or runtime facts still unresolved, clearly separated from greppable local facts.

Label conclusions `KNOWN` when directly evidenced, `INFERRED` when evidence supports but does not prove semantics, and `UNKNOWN` when unresolved. Scout evidence is input, not automatic truth; spot-check scope-critical claims and preserve contradictions.

Then create one reconciled planning contract:

- approved outcome and user-visible success;
- existing capabilities affected by the work;
- explicit `PRESERVE | CHANGE | REMOVE` classification only where the request/evidence supports it;
- in-scope/out-of-scope boundaries and meanings of material ambiguous terms;
- acceptance journeys that prove both the requested outcome and affected preservation;
- unresolved conflicts/gaps and their owner.

If user wording and repository behavior conflict materially, or a term can plausibly include both an existing capability and a future/blocked capability, stop and ask the smallest decision question before planner. Do not let planner choose that product meaning.

Stop scouting when these planning decisions are supported. Do not dump raw scout output into the planner; reconcile findings into the contract and short evidence package. If either is incomplete enough that the planner would need broad rediscovery or infer what existing capability may be removed, do not launch it yet.

Search source roots/tracked files; exclude generated artifacts and historical plans unless explicitly relevant.

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

RECONCILED PLANNING CONTRACT
[approved outcome; existing affected capabilities; PRESERVE/CHANGE/REMOVE decisions; in/out scope; material term meanings; acceptance journeys; unresolved conflicts and owner]

PRE-PLAN EVIDENCE
[reconciled direct/scout findings labeled KNOWN/INFERRED/UNKNOWN: exact files/symbols, current behavior, relevant behavior/data/configuration/state/structure relationships, semantic units being changed, evidenced affected-artifact closure, validation behavior, searched scope, contradictions, and bounded gaps]

CURRENT STATE
[branch/status/dirty ownership only when it affects target work]

CONSTRAINTS
[task-specific compatibility, preservation, security, rollout]

VALIDATION
[focused commands/checks]

STOP IF
[material unknowns or unsafe boundaries]
```

Do not inventory all `.pi/plans/`, dump the repository, paste raw scout transcripts, or copy generic process text. Include a prior plan only when the approved goal explicitly continues or recovers that named plan. The planner may verify supplied evidence with focused reads, but broad first-pass system, impact, dependency, or validation-infrastructure discovery belongs before launch. If the reconciled contract or pre-plan evidence is materially absent, contradictory, or leaves planner to classify existing behavior as preserve/remove, planner must return `BLOCKED` instead of rediscovering the system or choosing product semantics.

Expected output:

```text
<PLAN_DIR>/
  PLAN_FULL.md
  SCHEDULE.md
  TASKS/task_NN_<agent>.md
```

Each writing task contains a proportional `Proof` section with its semantic delta, closure evidence, checkpoint validity, and acceptance path. Review-only validator tasks omit it.

## 4. Plan-Heavy Ensemble

When the user explicitly requests the plan-heavy ensemble—or independently prompted strategy briefs are expected to materially improve a complex plan—load the `plan-heavy` skill and follow it directly.

Plan-heavy is not a separate harness or planner agent. It uses the normal planner's repository-root, plan-directory, artifact, task, execution, testing, and validator conventions. Its only differences are:

1. the orchestrator writes one concise `HANDOFF.md`;
2. `plan-briefer`, `plan-briefer-fable`, and `plan-briefer-gpt55` produce independent briefs in parallel;
3. a fresh `planner` session—launched with the `anthropic/claude-fable-5` xhigh model override—reads the handoff plus all briefs, reconciles them, and writes the normal plan ecosystem.

An explicit user request for the plan-heavy ensemble is sufficient. Do not downgrade it to a single unbriefed planner run based on an admission gate, and do not create custom validation/envelope machinery.

## 5. Plan Quality Contract

A good plan reduces builder complexity without expanding scope:

- Any task count is acceptable when every task has one coherent responsibility.
- Every writing task maps to exactly one selective commit: one outcome, exact write set, validation result, and rollback/recovery boundary.
- Split at real implementation, write-set, checkpoint, rollback, or validation boundaries—not to repeat hazards, matrices, or process prose.
- Optimize for critical path: group only independent, disjoint SoC slices in parallel; serialize shared contracts/external effects; do not manufacture parallelism.
- `PLAN_FULL.md` owns rationale; `SCHEDULE.md` owns dependencies; task files own execution contracts.
- **Plan-proof gate:** build a provisional decomposition, then prove each writing checkpoint with a compact receipt rather than private chain-of-thought. The receipt states: (1) semantic delta and evidence anchors; (2) coverage scope/relationship paths, discovered candidates, and evidence-backed `AFFECTED | UNAFFECTED` dispositions; (3) affected artifact ownership or evidence that no change is needed; (4) the deterministic gate replayed against the exact repository state after that task alone; and (5) the path from exact write set to requested and preserved observable results, mapping every affected existing journey to `PRESERVE | CHANGE |` explicitly authorized `REMOVE` with a non-self-fulfilling oracle. Relationship paths derive from repository evidence, never a fixed category checklist. A greppable unresolved candidate is `UNKNOWN`, not closure.
- **Counterexample gate:** before acceptance, try to refute each task with one affected relationship, preserved journey, acceptance path, or validity boundary that needs an undeclared artifact or later restoration. If found, combine ownership, resequence through an evidenced compatible state, or return `BLOCKED`. A builder must not need to invent durable design, reinterpret user intent, discover omitted impact, or broaden scope before its first edit. A validation command that can pass while skipping the changed surface is not proof.
- **Internal Execution Order:** add `## Internal Execution Order` only when one writing task spans dependent semantic regions and explicit order materially reduces context switching, contradictory edits, repeated discovery, or restart cost; omit it for simple/local/homogeneous work, and never activate it from file count. Derive compact repository-evidenced phases, each with bounded outcome, primary authorized files/symbols, material prerequisite, and local exit evidence; assign each changed target one primary phase where practical. The task must state that the builder—not the planner—creates and fills `.pi/build/TILL-DO_<task-id>.md` before TODO or source mutation, recording evidence-backed `PASS | BLOCKED` authority/baseline, contract/scope, validation/resources, and recovery/stop gates. Only all `PASS` permits `.pi/build/TODO_<task-id>.md` mirrored from the phases; a blocked gate means `BLOCKED`, no source mutation, and no TODO. These transient files are not tasks, IDs, DAG nodes, commits, checkpoints, issues, claims, branches, worktrees, Flow/GitHub state, validity boundaries, or parallel authorization, and stay out of the selective product commit unless explicitly tracked. The order never weakens scope closure, resource safety, acceptance, stop rules, or final validation.
- **Minimum-solution gate:** begin from existing behavior and plan only the delta required by the reconciled contract. Every proposed task, table, service, state, abstraction, dependency, flag, migration, gate, or operational step must trace to one acceptance criterion or unavoidable verified invariant. If removing it still satisfies contract and validation, remove it. High risk normally increases evidence/validation, not architecture.
- **Evidence compression:** exhaustive discovery may produce many facts and risks; assign only implementation-relevant ones. Do not turn each finding into code, a task, a state, a validator, or future-proofing. Task briefs state correctness-critical contracts and leave ordinary local implementation to builders instead of becoming implementation encyclopedias.
- Local repository facts such as paths, symbols, existing schema shapes, counts, registries, and harness behavior are not acceptable `TO VERIFY` items when they are greppable before planning. Runtime/provider/environment facts may remain `TO VERIFY` only with a bounded evidence step before dependent mutation.
- **Observability-first validation:** every behavior-changing task names evidence from the running system, not only compile checks. For auth/payment/data, migrations, integrations, async/webhooks, and user-visible frontend, the task's validation contract must include executing the affected journey/endpoint and inspecting the observed response, log, persisted state, or rendered page/console. Type/lint/build alone is acceptable only for genuinely static/mechanical tasks; when runtime observation is unavailable, the task must require reporting that gap as unverified rather than complete.
- **Migration naming:** any task that creates a migration must cite the repository's migration tool/config plus multiple existing filenames and state the evidenced prefix, timestamp timezone/precision, separator, casing, suffix, extension, and ordering convention. Prefer the official generator and require a fresh unique monotonic name. A hardcoded/reused timestamp such as `202607241402`, a guessed convention, historical migration rename/reorder, conflicting evidence, or filename collision is not builder-startable.
- **Stateful-resource safety:** runtime evidence never authorizes using user/dev/shared/staging/production state. Every task with tests, app startup, E2E, migration/seed/reset, fuzz/load/security, or stateful build hooks must include a builder-startable `STATEFUL RESOURCE PROOF`: resolved command/config/setup/teardown; `NO_STATEFUL_RESOURCES` or each resource `DISPOSABLE_VERIFIED`; unique run-owned DB/schema/namespace/temp root; synthetic data; scoped credentials/egress; no fallback; destructive-hook and teardown boundaries; protected-resource postcheck. `localhost`, `.env.test`, `NODE_ENV=test`, a `test` name, Docker, transactions, or backup are not proof. Missing/`UNKNOWN` isolation makes runtime validation explicitly `UNVERIFIED`; the plan must not instruct a builder to discover safety after starting the command.
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
- routine locally-decidable work (clear anchor, established pattern, exact validation) → `builder-light`;
- complex procedural/integration, any host/external operation, or exceptional formal/numerical/scientific work with an explicit oracle → `builder-heavy`;
- local semantic/declarative model with a clear oracle, routine design-system UI, or visual/UI work → design tier.

A server/config file containing rules is not enough to select a design tier. Host, SSH, deploy, network, Plesk, nginx, ACME, CI, reload, rollback, provider, or other external operations always route to `builder-heavy`.

Add a linked `validator` task only when a specific producer has a named credible high-consequence escape risk. Do not add validators for inventory, docs, static prompt/config/policy edits with deterministic acceptance, mechanical work, file importance, or every builder. Validator gates are review-only by default and return `PASS | BLOCKED`.

## 7. Execute the Plan

Before builders, read `SCHEDULE.md` and task contracts once; ask for user review only when implementation scope, cost, or risk is not already approved. Treat the plan as one executable contract. If a task is materially incomplete, apply the failed-plan stop rule below before any builder resumes; never ground or improve tasks with a planner between execution steps.

- Run dependencies serially.
- Run safe independent groups in concurrent waves according to the builder skill.
- Create recovery snapshots only when the task/schedule requires them: shared, large, preservation-critical, dirty-overlap, or destructive targets; clean tracked files rely on the selective checkpoint commit.
- Before each writing task, inspect its `Proof` against the actual task file and schedule. Reject execution if an acceptance path or deterministic gate depends on an undeclared artifact, unresolved relationship, or later restoration.
- After each verified writing task, create exactly one selective commit and record its hash.
- After the relevant task or coherent builder wave is checkpointed, ensure proportionate outcome evidence against that exact head: producer proof may close static/mechanical work; run an obvious deterministic integration check directly only after proving its complete stateful resource set is `NO_STATEFUL_RESOURCES` or all `DISPOSABLE_VERIFIED`; when independent scenario selection, edge/error coverage, integration, browser, or runtime observation materially improves confidence, load `testing`, select exactly `CORE` or `FULL`, and launch one fresh dedicated `qa` session. Do not add QA-only task files or SCHEDULE rows. Unsafe runtime evidence remains `UNVERIFIED`; never point tests at existing local/dev data to satisfy a gate.
- A dependent task starts only after its writing dependency is checkpointed, any materially required post-build proof is satisfied, and any linked validator records `PASS`. Validator review complements rather than replaces behavioral testing.
- On `BLOCKED`, distinguish implementation defect from contract conflict. Only an already-authorized implementation defect returns to a repair builder. If the finding implies removing/degrading an existing capability, changing its preservation oracle, or choosing between plausible product meanings, pause execution and re-ground the reconciled contract; ask the user only when evidence cannot resolve intent.
- Inspect actual diffs and validation evidence; never trust summaries alone.

## Stop Rules

Stop and re-ground when ownership, affected-artifact closure, required evidence, validation, or rollback cannot be established; scope expands; orchestration bookkeeping becomes tasks; a task omits a correctness-critical decision, artifact, dependency relationship, or executable validation path; or validation is `BLOCKED`. Such an omission means the plan failed: stop active builders, inspect remaining tasks for the same defect, and repair or regenerate the ecosystem once. Never let a builder invent the missing invariant, expand its write set, patch only the blocked task, or trigger a planner between downstream tasks.
