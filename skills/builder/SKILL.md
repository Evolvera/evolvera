---
name: builder
description: Use the builder agent to implement focused code changes. Builder runs on a fast delegated model — split work into small, atomic tasks and parallelize when files are disjoint. Can be invoked directly by you or from planner-generated task files.
---

# Builder Skill — Focused Code Execution

Builder is a delegated implementation family. Use `builder-highspeed`, `builder`, `builder-design`, `builder-heavy`, `builder-ultra`, or `builder-heavy-design` based on task fit. All builders need bounded, verifiable prompts with explicit preservation and validation.

## Goal

Delegate implementation without overloading yourself, while preserving quality through narrow scope and explicit validation.

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
| `builder-highspeed` | Highspeed sweet spot: single-file/module-local mechanical edits, rapid non-visual prototypes, utilities, backend/tooling/infra/tests/algorithms/math/physics/mechanical edits | broad ambiguous tasks, multi-file architecture, security/auth/payment ambiguity, unsupported factual/domain claims, frontend/UI implementation beyond tiny exact tweaks, final visual polish or brand/design decisions |
| `builder` | Normal-risk procedural implementation: bounded API/tooling/tests, module/cache/lifecycle behavior, serialization surfaces, deterministic control flow, and structured integration. Evidence collection is acceptable. | relation/rule/declarative semantic modeling, visual judgment, complex long tasks, shared-file hazards, subtle formal/numerical correctness, or evidence adjudication |
| `builder-design` | Direct normal-complexity Fable tier: frontend/UI work plus bounded state/relation behavior, policy/rule composition, selector semantics, and reversible structural conversions with a clear oracle. | procedural API/streaming/lifecycle/serialization integration, high-risk operational correctness, formal/numerical work, advanced visual craft, or vague scope |
| `builder-heavy` | Complex procedural correctness/integration: API/SDK behavior, streaming, serialization surfaces, module/cache/daemon lifecycle, migrations, cross-service behavior, auth/payment, shared files, non-visual frontend state/data integration, and high-consequence evidence adjudication. | tasks dominated by relation/rule/declarative semantics, visual quality, formal/numerical exceptional work, tiny edits, or vague scope |
| `builder-ultra` | Bounded exceptional non-frontend correctness work with concrete targets, a stated invariant/acceptance oracle, and evidence of exceptional difficulty: formal proofs/invariants, numerical stability/error bounds, difficult physics/math/science, round-trip/diff/merge semantics, adversarial counterexamples, or a reproducible `builder-heavy` failure. | vague or unfamiliar scope, generic retries, ordinary integration, broad architecture, routine algorithms, and all frontend/design work |
| `builder-heavy-design` | Direct Fable/high tier for exceptional visual work or complex semantic/declarative tasks: state/relation models, policy/selector composition, grammar/template reconstruction, and structure-preserving transformations. | procedural API/streaming/lifecycle/serialization integration, auth/payment, migrations, formal/numerical/scientific work, tiny edits, vague scope, or normal tasks fitting `builder-design` |

Treat `builder-highspeed` as a draft-speed executor. For non-frontend work, GPT is the default; choose Fable only for a local semantic/declarative model with a clear oracle, not merely uncertainty, novelty, or config syntax. Choose the normal/heavy family by **problem shape**, not by frontend/backend labels alone. Use `builder`/`builder-heavy` for procedural execution and integration: APIs, streaming, serialization surfaces, module/cache/daemon lifecycle, migrations, cross-service behavior, auth/payment, deterministic control flow, and frontend data-flow hazards. Host, SSH, deploy, network, Plesk, nginx, ACME, CI, reload, rollback, provider, and other external operations always route to `builder-heavy`, even when configuration grammar is involved. Use `builder-design`/`builder-heavy-design` directly when the dominant challenge is visual judgment or local semantic/declarative modeling: state and relation graphs, policy/rule or selector composition, grammar/template reconstruction, and structure-preserving conversions. Pick low vs high Fable by normal vs complex scope; no prior GPT failure is required. Use `builder-ultra` only for bounded non-frontend formal/numerical/scientific or compound-invariant work with an explicit oracle.

**Route by consequence, not only by mutation risk.** A read-only / single-file / "just a doc or JSON" task is still high-risk when its OUTPUT is a decision, verdict, classification, evidence index, feasibility stop-gate, or source-of-truth artifact other tasks depend on — a wrong judgment there propagates silently because downstream gates (tests, lint, anti-cheat, type/build) catch fabrication/churn in code, not a wrong conclusion in a doc. Use `builder-heavy` (plus review) for those, and for adjudicating conflicting evidence. `builder` may COLLECT evidence but should not be the one to ADJUDICATE verdicts; split collection from adjudication if one task does both.

### Shape-Based Routing

For implementation tasks whose primary work is frontend quality, route to `builder-design` by default:
- React/Vue/Svelte components, JSX/TSX structure, Tailwind/CSS styling, layout, responsive behavior, accessibility states, ordinary animations, design-system application, and applying most `website-polisher` fixes.
- Use `builder-highspeed` only for tiny, exact, mechanical UI edits such as a known class/token/text swap in one file.
- Use `builder-heavy-design` when the task requires exceptional design execution: premium website craft, advanced motion, CSS/SVG/Canvas/3D-feeling scenes, immersive sections, distinctive art direction, or when `builder-design` produced acceptable code but not a visually top-tier result.
- Use `builder-heavy` when the frontend task's dominant risk is procedural: shared-file hazards, API/streaming integration, cross-cutting state/data persistence, auth/payment/security behavior, migrations, or preservation-critical files.
- Use general `builder` only when frontend work is incidental and does not require design judgment.

For non-visual work, Fable is a valid direct route:
- use `builder-design` for bounded normal-complexity state/relation semantics, policy/rule composition, selectors, or reversible structural conversions;
- use `builder-heavy-design` for complex grammar/template reconstruction, state/relation systems, policy/selector engines, or structure-preserving declarative transformations;
- prefer `builder`/`builder-heavy` when success depends on procedural execution across APIs, streams, caches, daemons, lifecycle transitions, serialization surfaces, services, or security boundaries;
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

For `builder-highspeed`, prefer even smaller slices:
- one file or one module-local concern;
- explicit target behavior;
- obvious validation;
- under ~6 logical implementation steps;
- no large context retention or exhaustive workflow;
- no need for aesthetic/product judgment.

### Highspeed Risk Guardrails

When using `builder-highspeed`, prompts must include tighter steering because it drifts sooner and hallucinates routine details more often:

- **Verify symbols before use**: instruct it to grep/read existing APIs, package names, endpoints, function parameters, imports, and config keys before relying on them.
- **No phantom dependencies**: do not let it add packages unless the task explicitly asks for a new dependency or existing manifests prove the package is already used.
- **Short workflows only**: avoid if the task needs 6–8+ ordered steps, broad repo context, or stateful checklist execution.
- **Simple outputs**: avoid requiring complex structured output from it unless absolutely necessary; use concise reports.
- **Switch away from highspeed**: use `builder` for normal procedural implementation; `builder-design` for normal visual or semantic/declarative work; `builder-heavy` for complex operational integration, APIs, streams, lifecycle, serialization, migrations, auth/payment, or shared-file hazards; `builder-heavy-design` for exceptional visuals or complex relation/rule/grammar/structure semantics; and `builder-ultra` only when the formal/numerical/scientific invariant-oracle gate is met.

Do not use builder when:
- one small `edit` block would solve it faster;
- scope is unclear and needs investigation first;
- architecture decisions are still open;
- the task spans many unrelated concerns.

If unclear, pre-plan or scout first.

## Planner-Driven Mode

Use when `.pi/plans/` exists.

1. Read `.pi/plans/SCHEDULE.md` and use its `Agent` and dependency columns as the execution authority.
2. Select tasks with dependencies satisfied: writing dependencies need checkpoint hashes; review-only validator dependencies need a recorded `PASS`.
3. Require pre-edit recovery snapshots only where the schedule/task marks them: shared/large/preservation-critical files, dirty-file overlap, or destructive transformations. Clean tracked files rely on the selective checkpoint commit as the rollback boundary.
4. For `/plan-heavy` builder tasks, generate an execution envelope first: `/plan-heavy envelope <plan-dir> <task-id>`. Pass both the task file and envelope path/content to the builder; the envelope is authoritative for runtime repo state, dirty-file exclusions, patch boundaries, snapshot directory, and checkpoint policy.
5. Run tasks in the same parallel group concurrently only when full write sets, recovery/build artifacts, validation resources, and external effects are disjoint. Prefer small groups (2–4); parallelism is an optimization, never a requirement.
6. Run dependent groups serially. A linked `validator` task runs only after its producer builder checkpoint; downstream work waits for `PASS`.
7. After each builder, read the handover/status artifact, inspect the actual focused diff, and verify validation.
8. If a writing task is COMPLETE and verified, create a checkpoint commit immediately with selective staging for only that task's target files plus its `.pi/build`/`.pi/recovery` artifacts. Record the commit hash in `SCHEDULE.md`.
9. For a review-only validator task, invoke `validator` with the exact producer checkpoint, changed surface, risk hypothesis, and task validation contract. Record `PASS | BLOCKED` in the schedule/log; do not create an empty commit. `BLOCKED` pauses dependents, returns findings for bounded builder repair, and reruns the same gate.
10. If diff review shows accidental deletion, broad rewrite, weakened tests, or unrelated churn, do not commit; restore from the task's recovery snapshot or block for manual recovery.

Example:

```ts
Agent({
  subagent_type: "builder-highspeed",
  run_in_background: true,
  description: "Task 01 CSS tweak",
  prompt: "Implement task from /ABSOLUTE/PATH/.pi/plans/TASKS/task_01_builder-highspeed.md. Follow its scope and verification exactly."
})
```

Planner-generated schedules may mix `builder-highspeed`, `builder`, `builder-design`, `builder-heavy`, `builder-ultra`, `builder-heavy-design`, and selective `validator` gates. Always use the `Agent` value in `SCHEDULE.md` and the task file header. Writing tasks use one selective checkpoint commit by default; review-only validator tasks use a recorded verdict and no empty commit. For `/plan-heavy`, do not run a builder until its execution envelope exists.

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
- Preserve existing code/behavior except the explicitly requested change
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
Also review focused diff for accidental deletions or broad rewrites and verify recovery snapshots exist for MODIFY files.
If validation cannot run, explain why and provide the next best check.

CHECKPOINT
After successful validation, orchestrator will commit only TARGET FILES plus relevant `.pi/build`/`.pi/recovery` artifacts for this task.

STOP RULES
- Stop and report BLOCKED if required files are missing, tests cannot be run for environment reasons, or the requested change conflicts with existing behavior.
- Do not expand scope to adjacent improvements.
```

## Parallelization

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
- [ ] Preservation constraints are explicit: what must not be removed/rewritten.
- [ ] Engineering constraints are explicit: SoC boundary, DYC needs, DRY/Rule-of-Three decision, KISS/YAGNI limits, and TDD/test-first expectation.
- [ ] Pre-edit recovery snapshots are required where the task marks them (shared/large/preservation-critical, dirty overlap, destructive transforms).
- [ ] Validation command/check is included.
- [ ] Diff review is required before COMPLETE.
- [ ] Checkpoint commit expectation is clear for planner-driven tasks.
- [ ] Task is small enough for a delegated model.
- [ ] If using `builder-highspeed`, task is single-file/module-local, under ~6 logical steps, every API/package/symbol can be verified, and any frontend change is a tiny exact mechanical tweak.
- [ ] If using `builder-design`, task is bounded and either has concrete visual criteria or a clear normal-complexity semantic/declarative oracle (state/relation, policy/rule, selector, reversible structure).
- [ ] If using `builder-heavy`, task is bounded and dominated by procedural/operational correctness: API/streaming/lifecycle/serialization, migration, cross-service, security, shared-file, or frontend data-flow integration.
- [ ] Use `builder-ultra` only when **all** are true: (1) task is bounded and non-frontend; (2) target files plus invariant/acceptance oracle are known; (3) it has either intrinsic exceptional formal/numerical/scientific/round-trip/adversarial complexity **or** a reproducible grounded `builder-heavy` failure. If only (1–2) hold, use `builder-heavy`; if targets or oracle are unknown, scout/planner first; visual work uses the design tiers.
- [ ] If using `builder-heavy-design`, task is bounded and either exceptionally design-sensitive with grounded visual criteria or complex semantic/declarative work with a clear state/relation/rule/grammar/structure oracle.

If more than two boxes are missing, do more prep or implement directly.

## Result Handling

After builder finishes:
- inspect actual diff, not just its summary;
- check for accidental deletions, broad rewrites, weakened tests, removed handlers, premature abstractions, speculative YAGNI additions, noisy comments, or unrelated formatting churn;
- verify `.pi/recovery/{task_id}/before/...` snapshots exist where the task required them;
- for `/plan-heavy`, verify the builder followed the execution envelope patch boundaries and preservation markers;
- run or review validation results;
- commit verified task output immediately with selective staging only; never include unrelated dirty files;
- if builder returns empty/no-op, retry once with a smaller prompt or switch model;
- if it fails twice or caused destructive churn, stop delegating and diagnose before continuing.

## Examples

### Single-file fix

```ts
Agent({
  subagent_type: "builder-highspeed",
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
Agent({ subagent_type: "builder-highspeed", run_in_background: true, description: "Email validator", prompt: "...TARGET FILES: src/validators/email.ts..." })
Agent({ subagent_type: "builder-highspeed", run_in_background: true, description: "Phone validator", prompt: "...TARGET FILES: src/validators/phone.ts..." })
```

## Anti-Patterns

| Anti-pattern | Better |
|---|---|
| "Fix auth" | Define exact failing behavior, files, and validation |
| One builder for UI + API + DB | Split by concern and dependencies |
| No validation command | Include targeted test or explain why none exists |
| Broad refactor request | Use planner first |
| `builder-highspeed` asked to execute a long checklist | Split into small tasks, use `builder`, or use `builder-heavy` when the task is bounded but subtle |
| `builder-highspeed` allowed to infer APIs/packages | Require grep/package verification before implementation |
| Trusting builder summary only | Check diff and diagnostics |
