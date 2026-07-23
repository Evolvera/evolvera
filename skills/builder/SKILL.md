---
name: builder
description: Use the builder agent to implement focused code changes. Builder runs on a fast delegated model — split work into small, atomic tasks and parallelize when files are disjoint. Can be invoked directly by you or from planner-generated task files.
---

# Builder Skill — Focused Code Execution

Builder is a delegated implementation family. Use `builder-light`, `builder-light-design`, `builder`, `builder-design`, `builder-heavy`, `builder-ultra`, or `builder-heavy-design` based on task fit. All builders need bounded, verifiable prompts with explicit preservation and validation.

## Goal

Delegate implementation without overloading yourself, while preserving quality through narrow scope and explicit validation.

## Commit Scope

Normally, one writing builder call maps to one selective commit: a cohesive SoC outcome with its write set and validation. The orchestrator commits after verification. Split or use planner only when real ownership, validation, rollback, or dependency boundaries make that clearer; review-only validators do not commit.

Success means:
- the requested change is implemented;
- only intended files are changed;
- existing project patterns are followed;
- existing behavior/code is preserved except for explicitly requested changes;
- relevant validation is run or a clear blocker is reported;
- the builder reviewed its focused diff for accidental deletions/broad rewrites;
- the result includes what changed, validation result, and any unresolved risk.

## Agent Choice

| Agent | Use When | Avoid When |
|---|---|---|
| `builder-light` | Routine bounded work whose correctness is **locally decidable** — the task plus visible code fully determine the change (clear anchor, established pattern, exact validation): mechanical/multi-spot edits, utilities, tests, tooling, pattern-following endpoints, config, reproduced bug fixes. Multi-file is fine for one concern with a bounded write set. | anything whose correctness depends on implicit cross-module contracts, subtle state/lifecycle/concurrency, serialization compatibility, or ambiguity — there a plausible-but-wrong result passes shallow validation; security/auth/payment without an explicit contract; UI beyond exact token/class/text swaps |
| `builder-light-design` | Routine UI within an established design system: components from existing patterns, styling/spacing/copy changes, straightforward responsive/accessibility fixes, polish items with concrete specs. | new visual direction, novel components without a pattern, complex interaction/motion, semantic/declarative modeling, brand decisions, Home Preview tasks |
| `builder` | **Default for ~90% of bounded local implementation**: code, APIs, tests, tooling, config, auth/payment behavior, migrations, shared files, and multi-file changes with clear acceptance. | relation/rule/declarative semantic modeling, visual judgment, or explicitly external/exceptional runtime work |
| `builder-design` | Direct normal-complexity design tier: frontend/UI work plus bounded state/relation behavior, policy/rule composition, selector semantics, and reversible structural conversions with a clear oracle. | procedural API/streaming/lifecycle/serialization integration, high-risk operational correctness, formal/numerical work, advanced visual craft, or vague scope |
| `builder-heavy` | Exceptional operational work: host/SSH/deploy/network/provider/reload/rollback, or evidenced coordination across multiple live runtime/service/lifecycle boundaries. | ordinary local code, auth/payment, migrations, config, shared files, multi-file changes, broad planning, or vague scope |
| `builder-ultra` | Bounded exceptional non-frontend correctness work with concrete targets, a stated invariant/acceptance oracle, and evidence of exceptional difficulty: formal proofs/invariants, numerical stability/error bounds, difficult physics/math/science, round-trip/diff/merge semantics, adversarial counterexamples, or a reproducible `builder-heavy` failure. | vague or unfamiliar scope, generic retries, ordinary integration, broad architecture, routine algorithms, and all frontend/design work |
| `builder-heavy-design` | Direct exceptional design tier for visual work or complex semantic/declarative tasks: state/relation models, policy/selector composition, grammar/template reconstruction, and structure-preserving transformations. | procedural API/streaming/lifecycle/serialization integration, auth/payment, migrations, formal/numerical/scientific work, tiny edits, vague scope, or normal tasks fitting `builder-design` |

Route light tiers by error profile, not size: they cover most routine work correctly but err precisely where `builder`/`builder-heavy` would not — implicit contracts, subtle semantics, ambiguity. The routing question is “is the correct change fully determined by the task plus visible code?”. For non-frontend work needing non-local reasoning, `builder` is the default. Choose a design tier only for a local semantic/declarative model with a clear oracle. Select `builder-heavy` only for explicit external operations or evidenced exceptional multi-runtime integration; never because a task is backend, risky, auth/payment, migration, config, shared, or multi-file. Use design tiers when visual judgment or local semantic/declarative modeling dominates. Use `builder-ultra` only for bounded non-frontend formal/numerical/scientific or compound-invariant work with an explicit oracle.

A decision, verdict, classification, evidence index, or source-of-truth artifact needs separate `validator` review only for a named consequential escape risk. Static locally-decidable changes close with producer proof plus orchestrator diff review; file authority or importance alone selects neither `validator` nor `builder-heavy`.

### Shape-Based Routing

For implementation tasks whose primary work is frontend quality, route to `builder-design` by default:
- React/Vue/Svelte components, JSX/TSX structure, Tailwind/CSS styling, layout, responsive behavior, accessibility states, ordinary animations, design-system application, and applying most `website-polisher` fixes.
- Use `builder-light-design` for routine design-system edits with concrete specs; `builder-light` only for tiny, exact, mechanical UI edits such as a known class/token/text swap.
- Use `builder-heavy-design` when the task requires exceptional design execution: premium website craft, advanced motion, CSS/SVG/Canvas/3D-feeling scenes, immersive sections, distinctive art direction, or when `builder-design` produced acceptable code but not a visually top-tier result.
- Use `builder-heavy` for frontend only when the task explicitly performs an external operation or coordinates exceptional live runtime boundaries.
- Use general `builder` only when frontend work is incidental and does not require design judgment.

For non-visual work, a design tier is a valid direct route:
- use `builder-design` for bounded normal-complexity state/relation semantics, policy/rule composition, selectors, or reversible structural conversions;
- use `builder-heavy-design` for complex grammar/template reconstruction, state/relation systems, policy/selector engines, or structure-preserving declarative transformations;
- prefer `builder` for bounded local procedural work; select `builder-heavy` only for explicit external execution or exceptional live multi-runtime coordination;
- prefer `builder-ultra` when the core obligation is formal proof, numerical stability/error bounds, physics/math/science, or compound invariants rather than domain semantics.

## When to Use Builder

Use a builder for:
- one focused fix, component, endpoint, test, or refactor;
- planner-generated task files;
- mechanical changes with clear target behavior;
- `builder-design` tasks that are bounded and either visual/UI-led or normal-complexity semantic/declarative work;
- `builder-heavy` tasks that are bounded and procedurally complex/integration-sensitive enough to need stronger reasoning;
- `builder-ultra` tasks that are bounded, non-frontend, invariant/oracle-driven, and demonstrably exceptional beyond heavy;
- `builder-heavy-design` tasks that are bounded and either exceptionally visual or complex semantic/declarative work.

For light tiers (`builder-light`, `builder-light-design`), the slice must be locally decidable:
- explicit target behavior with a clear anchor or established pattern;
- obvious, exact validation;
- no reliance on implicit contracts, subtle semantics, or judgment.

### Light-Tier Risk Guardrails

Light tiers fail differently from strong tiers: a plausible-but-wrong implementation that passes shallow validation. Prompts must include:

- **Verify symbols before use**: instruct them to grep/read existing APIs, package names, endpoints, function parameters, imports, and config keys before relying on them.
- **No phantom dependencies**: do not let them add packages unless the task explicitly asks for a new dependency or existing manifests prove the package is already used.
- **Name the pattern**: point at the concrete file/component that defines “correct” for this change.
- **Escalate instead of guessing**: they must return `BLOCKED: use builder` / `BLOCKED: use builder-design` when the task turns out to need non-local reasoning or design judgment.
- **Switch away from light**: use `builder` for normal local implementation needing non-local reasoning; `builder-design` for visual judgment or semantic/declarative work; `builder-heavy` only for external operations or exceptional live integration; `builder-heavy-design` for exceptional visuals or complex relation/rule/grammar/structure semantics; and `builder-ultra` only when the formal/numerical/scientific invariant-oracle gate is met.

Do not use builder when:
- one small `edit` block would solve it faster;
- scope is unclear and needs investigation first;
- architecture decisions are still open;
- the task spans many unrelated concerns.

If unclear, pre-plan or scout first.

## Planner-Driven Mode

Use only when the current task explicitly names an active `PLAN_DIR`/task file. Historical or unrelated `.pi/plans/` directories never force planner-driven execution.

1. Read `.pi/plans/SCHEDULE.md` and use its `Agent` and dependency columns as the execution authority.
2. Select tasks with dependencies satisfied: writing dependencies need checkpoint hashes; review-only validator dependencies need a recorded `PASS`.
3. Require pre-edit recovery snapshots only where the schedule/task marks them: shared/large/preservation-critical files, dirty-file overlap, or destructive transformations. Clean tracked files rely on the selective checkpoint commit as the rollback boundary.
4. Run tasks in the same parallel group concurrently only when full write sets, recovery/build artifacts, validation resources, and external effects are disjoint. Prefer small groups (2–4); parallelism is an optimization, never a requirement.
5. Run dependent groups serially. A linked `validator` task runs only after its producer builder checkpoint; downstream work waits for `PASS`.
6. After each builder, read the handover/status artifact, inspect the actual focused diff, and verify validation.
7. If a writing task is COMPLETE and verified, create a checkpoint commit immediately with selective staging for only that task's target files plus its `.pi/build`/`.pi/recovery` artifacts. Record the commit hash in `SCHEDULE.md`.
8. For a review-only validator task, invoke `validator` with the exact producer checkpoint, changed surface, risk hypothesis, reconciled planning contract, and task validation contract. Record `PASS | BLOCKED` in the schedule/log; do not create an empty commit. `BLOCKED` pauses dependents. If the finding reveals a contract/semantic conflict or repair would remove/degrade an existing capability, return to orchestrator re-grounding/user decision—not a repair builder. Only an already-authorized bounded implementation defect returns to a builder, then reruns the same gate.
9. If diff review shows accidental deletion, broad rewrite, weakened tests, changed characterization oracle, removed handler/journey, or unrelated churn, do not commit; restore from the task's recovery snapshot or block for manual recovery.

Example:

```ts
Agent({
  subagent_type: "builder-light",
  run_in_background: true,
  description: "Task 01 CSS tweak",
  prompt: "Implement task from /ABSOLUTE/PATH/.pi/plans/TASKS/task_01_builder-light.md. Follow its scope and verification exactly."
})
```

Planner-generated schedules may mix `builder-light`, `builder-light-design`, `builder`, `builder-design`, `builder-heavy`, `builder-ultra`, `builder-heavy-design`, and selective `validator` gates. Always use the `Agent` value in `SCHEDULE.md` and the task file header. Writing tasks use one selective checkpoint commit by default; review-only validator tasks use a recorded verdict and no empty commit. Normal and planner-heavy plans execute through this same flow.

## Direct Mode Prompt

Use outcome-first prompts. Describe the destination, constraints, available context, and validation. Do not paste large file contents; tell builder which files to read.

Template:

```text
GOAL
[One sentence: desired outcome.]

SUCCESS CRITERIA
- [Concrete condition 1]
- [Concrete condition 2]

READ FIRST
- path/to/file.ts — why it matters
- path/to/file.test.ts — existing expectations

TARGET FILES
- path/to/file.ts — MODIFY: [what to change]
- path/to/file.test.ts — MODIFY/CREATE: [test expectation]

CONSTRAINTS
- Follow existing patterns in [file/dir]
- Preserve existing code/behavior except capabilities explicitly classified CHANGE or REMOVE in the reconciled contract
- Never rewrite characterization/regression expectations to make removal or degradation pass unless that behavior change is explicitly approved
- Use targeted edits for existing files; do not overwrite whole files
- Verify any API/package/symbol/endpoint/parameter before using it; do not invent missing dependencies or functions
- Do not change public API except [allowed change]
- Keep concerns separated; do not mix unrelated cleanup/refactors/docs/config with this task
- Reuse existing helpers before adding new ones; do not create a new abstraction before the third proven repetition unless existing architecture clearly requires it
- Keep the solution simple/readable; avoid speculative flags, dependencies, APIs, or extension points
- Add/update comments or docs only for non-obvious invariants, tricky logic, failure behavior, or operational usage
- For behavior changes, prefer a failing/targeted test first or identify the existing test that covers the behavior
- Do not touch files outside TARGET FILES unless blocked and reported

VALIDATION
Run:
- [targeted test/typecheck/lint/build command]
Also review focused diff for accidental deletions or broad rewrites and verify any recovery snapshots required by the task exist.
If validation cannot run, explain why and provide the next best check.

CHECKPOINT
After successful validation, orchestrator will commit only TARGET FILES plus relevant `.pi/build`/`.pi/recovery` artifacts for this task.

STOP RULES
- Stop and report BLOCKED if required files are missing, tests cannot be run for environment reasons, or the requested change conflicts with existing behavior.
- If task/gate semantics would remove or degrade an observed existing capability not explicitly classified CHANGE/REMOVE, report `BLOCKED: CONTRACT_CONFLICT`; do not edit production code or redefine tests.
- Do not expand scope to adjacent improvements.
```

## Stateful Validation Safety

Before the orchestrator or any builder runs a test, app/server start, E2E flow, migration, seed, reset, fuzz/load/security check, or build hook that may touch state:

1. resolve the literal command and inspect package/task indirection, runner config, env precedence, global setup/teardown, fixtures, migrations/seeds, and cleanup;
2. enumerate every reachable DB/schema, directory, bucket, queue/topic, cache namespace, search index, emulator/device store, and external service;
3. classify the command `NO_STATEFUL_RESOURCES` or every resource `DISPOSABLE_VERIFIED | NONDISPOSABLE | UNKNOWN`;
4. run only when every resource is uniquely created/owned by the run, synthetic/empty by contract, scoped against fallback, and teardown cannot escape its namespace.

`localhost`, local/dev, `.env.test`, `NODE_ENV=test`, a `test` name, Docker, transactions, mocks with fallback, and backups are not proof. Never let cleanup/reset/truncate/drop/delete/migrations touch a resource that predates the run or contains user/dev/shared/staging/production data. If proof is missing, use static validation and report `UNVERIFIED`/`BLOCKED`; observability does not override data safety. If mutation is suspected, stop immediately and do not retry, restore, reseed, or recreate data without explicit authorization.

Every delegated prompt containing a potentially stateful command must include `STATEFUL RESOURCE PROOF`: resolved command; setup/teardown files inspected; sanitized resource identities; run-ownership evidence; destructive hooks; protected-resource boundary; egress/credentials; teardown; and required postcheck. The receiving agent must independently verify it before execution.

## Parallelization

Before focused delegation, forecast coherent selective commits: each has one outcome, write set, validation result, and rollback boundary. One goes direct; 2–5 clear units may use focused builders; more than ~5, or uncertain ownership/dependencies, is a strong signal to return to the planner skill so it can optimize the critical path once. This is a heuristic, not a cap.

For focused delegation, default to one builder. Parallelize independent implementation slices by SoC—component/module, API endpoint, test suite, configuration surface—only when it genuinely reduces scope per builder and write sets are provably disjoint. Typical safe groups are 2–4; launch a later group only when remaining tasks were blocked on a dependency, not to fill slots.

Run builders in parallel only when:
- full write sets are disjoint, including registries, manifests, lockfiles, generated/recovery/build artifacts, and shared configuration;
- tasks have no dependency or shared API/schema/contract transition;
- validation commands, ports, databases, fixtures, caches, and external targets cannot interfere;
- each task has exact targets, independent recovery/commit scope, and validation.

Run serially when:
- any source, registry, config, lockfile, migration, shared type/API contract, validation resource, or external environment overlaps;
- task B depends on task A or its validator `PASS`;
- deployment, provider, network, staging/production, reload, rollback, or another external side effect is involved;
- validation from one task determines the next.

Do not parallelize merely to fill slots. Prefer a smaller number of coherent, independently verifiable builders over overlapping work; use isolated worktrees when parallel branches require them.

## Prompt Quality Checklist

Before spawning builder, verify:

- [ ] Outcome is one clear sentence.
- [ ] Success criteria are concrete.
- [ ] Files to read are listed.
- [ ] Target files are listed.
- [ ] Constraints/out-of-scope are explicit.
- [ ] Preservation constraints are explicit: affected existing capabilities are classified PRESERVE/CHANGE/REMOVE, and no test oracle may be rewritten to conceal an unapproved regression.
- [ ] Engineering constraints are explicit: SoC boundary, DYC needs, DRY/Rule-of-Three decision, KISS/YAGNI limits, and TDD/test-first expectation.
- [ ] Pre-edit recovery snapshots are required where the task marks them (shared/large/preservation-critical, dirty overlap, destructive transforms).
- [ ] Validation command/check is included.
- [ ] Every potentially stateful validation has `STATEFUL RESOURCE PROOF`; `UNKNOWN` or pre-existing data means the command will not run.
- [ ] Diff review is required before COMPLETE.
- [ ] Checkpoint commit expectation is clear for planner-driven tasks.
- [ ] Task is small enough for a delegated model.
- [ ] If using `builder-light`, the correct change is fully determined by the task plus visible code (anchor, pattern, exact validation), every API/package/symbol can be verified, and any frontend change is a tiny exact mechanical tweak. If using `builder-light-design`, the design system already answers the design questions.
- [ ] If using `builder-design`, task is bounded and either has concrete visual criteria or a clear normal-complexity semantic/declarative oracle (state/relation, policy/rule, selector, reversible structure).
- [ ] If using `builder-heavy`, task is bounded and dominated by procedural/operational correctness: API/streaming/lifecycle/serialization, migration, cross-service, security, shared-file, or frontend data-flow integration.
- [ ] Use `builder-ultra` only when **all** are true: (1) task is bounded and non-frontend; (2) target files plus invariant/acceptance oracle are known; (3) it has either intrinsic exceptional formal/numerical/scientific/round-trip/adversarial complexity **or** a reproducible grounded `builder-heavy` failure. If only (1–2) hold, use `builder-heavy`; if targets or oracle are unknown, scout/planner first; visual work uses the design tiers.
- [ ] If using `builder-heavy-design`, task is bounded and either exceptionally design-sensitive with grounded visual criteria or complex semantic/declarative work with a clear state/relation/rule/grammar/structure oracle.

If more than two boxes are missing, do more prep or implement directly.

## Result Handling

After a producer builder finishes:
- treat `COMPLETE` as ready for integration/testing, not automatic closure of the user's outcome;
- inspect actual diff, not just its summary;
- check for accidental deletions, broad rewrites, weakened tests, removed handlers, premature abstractions, speculative YAGNI additions, noisy comments, or unrelated formatting churn;
- verify `.pi/recovery/{task_id}/before/...` snapshots exist where the task required them;
- run or review producer validation results;
- commit verified task output immediately with selective staging only; never include unrelated dirty files;
- decide proportionately whether producer evidence closes the outcome: without a PR, static/mechanical work with deterministic proof plus orchestrator diff review is closed—do not add tester or validator merely because the file is a system prompt, agent, skill, config, policy, or source of truth; run an obvious deterministic integration check directly only after the stateful-resource gate proves it safe; use `POST-BUILD TEST MODE` only when independent edge/error, integration, or runtime proof materially improves confidence; a validator runs only for an already-linked named escape risk or final PR gate;
- if builder returns empty/no-op, retry once with a smaller prompt or switch model;
- if it fails twice or caused destructive churn, stop delegating and diagnose before continuing.

## Examples

### Single-file fix

```ts
Agent({
  subagent_type: "builder-light",
  description: "Fix null parser",
  prompt: `
GOAL
Fix null handling in parser user-name formatting.

SUCCESS CRITERIA
- null/undefined user name returns empty string
- existing parser tests pass

READ FIRST
- src/utils/parser.ts
- src/utils/parser.test.ts

TARGET FILES
- src/utils/parser.ts — MODIFY null handling only
- src/utils/parser.test.ts — MODIFY/ADD focused test if missing

VALIDATION
Run: npm test -- src/utils/parser.test.ts

STOP RULES
Do not refactor unrelated parser code.
`
})
```

### Two independent tasks

```ts
Agent({ subagent_type: "builder-light", run_in_background: true, description: "Email validator", prompt: "...TARGET FILES: src/validators/email.ts..." })
Agent({ subagent_type: "builder-light", run_in_background: true, description: "Phone validator", prompt: "...TARGET FILES: src/validators/phone.ts..." })
```

## Anti-Patterns

| Anti-pattern | Better |
|---|---|
| "Fix auth" | Define exact failing behavior, files, and validation |
| One builder for UI + API + DB | Split by concern and dependencies |
| No validation command | Include targeted test or explain why none exists |
| Broad refactor request | Use planner first |
| Subtle state/lifecycle/compat work routed to `builder-light` | Route by decidability, not size: use `builder`, or `builder-heavy` when the task is bounded but operationally complex |
| A light tier allowed to infer APIs/packages/contracts | Require grep/package verification before implementation |
| Trusting builder summary only | Check diff and diagnostics |
