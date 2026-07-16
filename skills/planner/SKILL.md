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

### Pre-Plan Evidence Gate

Before any full planner or plan-heavy ensemble, build a concise evidence package and a reconciled planning contract. Planner must design from grounded system understanding and user intent, not perform broad first-pass discovery or decide unresolved product semantics.

For nontrivial/unfamiliar repositories, orient before deep retrieval: inspect bounded file/source structure without opening implementation bodies, identify product roots and likely domain/test/config/docs surfaces, and record only candidate areas—not behavior conclusions. Use that map to choose scouting proportionally:

- Exact paths, contracts, consumers, and validation already known from current evidence: use focused direct reads; no ceremonial scout.
- Normal multi-file or multi-layer feature: use one bounded `scout` mission covering the coherent flow.
- Large/cross-cutting repository with separable domains: launch 2–8 parallel `scout-highspeed` micro-scouts for independent slices such as entry points/call flow, schema/state, consumers/wiring, and tests/runners/config. Use one normal `scout` afterward only when end-to-end synthesis or contradiction resolution remains necessary.
- One stateful flow whose semantics cross API, database, retries, webhooks, and tests: prefer one normal `scout`; splitting would lose coherence.

The evidence package must cover, with exact paths/symbols and stated searched scope:

- current entry points, product boundaries, existing capabilities, and end-to-end behavior;
- relevant architecture, schemas/data/state contracts, and compatibility constraints;
- consumers, manifests, registries, runners, bootstraps, fixtures, deploy closure, and rollback surfaces;
- existing tests/harnesses plus what their commands actually discover and prove;
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
[reconciled direct/scout findings labeled KNOWN/INFERRED/UNKNOWN: exact files/symbols, architecture/data contracts, consumers/wiring, tests/runners/harness behavior, current behavior, searched scope, contradictions, and bounded gaps]

CURRENT STATE
[branch/status/dirty ownership only when it affects target work]

CONSTRAINTS
[task-specific compatibility, preservation, security, rollout]

VALIDATION
[focused commands/checks]

STOP IF
[material unknowns or unsafe boundaries]
```

Do not inventory all `.pi/plans/`, dump the repository, paste raw scout transcripts, or copy generic process text. Include a prior plan only when the approved goal explicitly continues or recovers that named plan. The planner may verify supplied evidence with focused reads, but broad architecture/schema/consumer/test-harness discovery belongs before launch. If the reconciled contract or pre-plan evidence is materially absent, contradictory, or leaves planner to classify existing behavior as preserve/remove, planner must return `BLOCKED` instead of rediscovering the system or choosing product semantics.

Expected output:

```text
<PLAN_DIR>/
  PLAN_FULL.md
  SCHEDULE.md
  TASKS/task_NN_<agent>.md
```

## 4. Plan-Heavy Ensemble

When the user explicitly requests planner-heavy—or independent strategies from GPT and Fable are expected to materially improve a complex plan—load the `plan-heavy` skill and follow it directly.

Plan-heavy is not a separate harness. It uses the normal planner's repository-root, plan-directory, artifact, task, execution, testing, and validator conventions. Its only differences are:

1. the orchestrator writes one concise `HANDOFF.md`;
2. `plan-briefer` and `plan-briefer-fable` produce independent briefs in parallel;
3. `planner-heavy` reads the handoff plus both briefs and writes the normal plan ecosystem at xhigh reasoning.

An explicit user request for planner-heavy is sufficient. Do not replace it with the normal planner based on an admission gate, and do not create custom validation/envelope machinery.

## 5. Plan Quality Contract

A good plan reduces builder complexity without expanding scope:

- Any task count is acceptable when every task has one coherent responsibility.
- Every writing task maps to exactly one selective commit: one outcome, exact write set, validation result, and rollback/recovery boundary.
- Split at real implementation, write-set, checkpoint, rollback, or validation boundaries—not to repeat hazards, matrices, or process prose.
- Optimize for critical path: group only independent, disjoint SoC slices in parallel; serialize shared contracts/external effects; do not manufacture parallelism.
- `PLAN_FULL.md` owns rationale; `SCHEDULE.md` owns dependencies; task files own execution contracts.
- **Builder-startability gate:** before accepting the plan, inspect every task as if a fresh builder were about to make its first edit. All correctness-critical decisions, exact target/write files, schema/API/state contracts, patch boundaries, and preservation rules must already be grounded in the reconciled planning contract. A builder may choose local implementation details, but must not need to invent architecture, name durable schema objects, reinterpret user intent, classify an existing capability as removable, rediscover missing consumers, or broaden scope.
- **Write-set/validation closure:** every new or changed artifact must be wired into every required manifest, registry, runner, bootstrap, fixture, migration harness, lint inventory, or deploy closure. Trace each validation command backward: if it needs registration/config/harness changes, those files belong to an owning task or must be verified as already sufficient. A command that cannot exercise the task's new behavior is not validation.
- Local repository facts such as paths, symbols, existing schema shapes, counts, registries, and harness behavior are not acceptable `TO VERIFY` items when they are greppable before planning. Runtime/provider/environment facts may remain `TO VERIFY` only with a bounded evidence step before dependent mutation.
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
- On `BLOCKED`, distinguish implementation defect from contract conflict. Only an already-authorized implementation defect returns to a repair builder. If the finding implies removing/degrading an existing capability, changing its preservation oracle, or choosing between plausible product meanings, pause execution and re-ground the reconciled contract; ask the user only when evidence cannot resolve intent.
- Inspect actual diffs and validation evidence; never trust summaries alone.

## Stop Rules

Stop and re-ground when target ownership, required evidence, validation, or rollback cannot be established; when the plan expands approved scope; when a planner produces orchestration bookkeeping as tasks; when a builder cannot start safely because the task omitted a correctness-critical decision, target, consumer, registry, runner, harness, or executable validation path; or when validation is `BLOCKED`. A builder discovering such an omission is evidence that the plan failed its builder-startability gate—not permission for the builder to design the missing contract or silently expand its write set. Do not repair a bad plan by adding bureaucracy—re-ground the missing evidence and correct the plan's actual contract.
