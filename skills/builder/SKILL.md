---
name: builder
description: Use the builder agent to implement focused code changes. Builder runs on a fast delegated model — split work into small, atomic tasks and parallelize when files are disjoint. Can be invoked directly by you or from planner-generated task files.
---

# Builder Skill — Focused Code Execution

Builder is a delegated implementation agent. Use either the default Kimi `builder` or GPT-5.3 Codex Spark `builder-highspeed` based on task fit. Both need small, bounded, verifiable prompts.

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
| `builder-highspeed` | Codex Spark sweet spot: single-file edits, rapid prototypes, utility generation, function signature swaps, module-local renames, CSS tweaks, React component adjustments, layout experiments with existing design constraints, backend/tooling/infra/tests/algorithms/math/physics/mechanical edits | broad ambiguous tasks, multi-file architecture, security/auth/payment ambiguity, unsupported factual/domain claims, final visual polish or brand/design decisions |
| `builder` | lower hallucination risk matters; task needs more caution; existing workflow expects Kimi behavior; task has multiple files or subtle integration risk | large latency-sensitive batches |

Treat `builder-highspeed` as a draft-speed executor: much faster, but less capable, shorter-context, and more hallucination-prone than Kimi/Codex-style senior agents. Its failure mode is fast, plausible-looking wrong output. Default to it only when the task is explicit, bounded, and easy to verify — ideally a single-file or module-local edit. Use `builder` when correctness risk outweighs speed.

## When to Use Builder

Use builder for:
- one focused fix, component, endpoint, test, or refactor;
- 1–2 files with one concern;
- planner-generated task files;
- mechanical changes with clear target behavior.

For `builder-highspeed`, prefer even smaller slices:
- one file or one module-local concern;
- explicit target behavior;
- obvious validation;
- under ~6 logical implementation steps;
- no large context retention or exhaustive workflow;
- no need for aesthetic/product judgment.

### Spark Risk Guardrails

When using `builder-highspeed`, prompts must include tighter steering because Spark drifts sooner and hallucinates routine details more often:

- **Verify symbols before use**: instruct it to grep/read existing APIs, package names, endpoints, function parameters, imports, and config keys before relying on them.
- **No phantom dependencies**: do not let it add packages unless the task explicitly asks for a new dependency or existing manifests prove the package is already used.
- **Short workflows only**: avoid if the task needs 6–8+ ordered steps, broad repo context, or stateful checklist execution.
- **Simple outputs**: avoid requiring complex structured output from Spark unless absolutely necessary; use concise reports.
- **Switch to Kimi**: use `builder` for multi-file integration, auth/payment/security, subtle behavior, migrations, broad refactors, or anything where a wrong-looking-right answer is expensive.

Do not use builder when:
- one small `edit` block would solve it faster;
- scope is unclear and needs investigation first;
- architecture decisions are still open;
- the task spans many unrelated concerns.

If unclear, pre-plan or scout first.

## Planner-Driven Mode

Use when `.pi/plans/` exists.

1. Read `.pi/plans/SCHEDULE.md`.
2. Select tasks with dependencies satisfied.
3. Before spawning a builder, ensure the task prompt requires pre-edit recovery snapshots for every MODIFY file.
4. Run tasks in the same parallel group concurrently only if files do not overlap and selective checkpoint commits remain safe.
5. Run dependent groups serially.
6. After each builder, read the handover/status artifact, inspect the actual focused diff, and verify validation.
7. If the task is COMPLETE and verified, create a checkpoint commit immediately with selective staging for only that task's target files plus its `.pi/build`/`.pi/recovery` artifacts. Record the commit hash in `SCHEDULE.md`.
8. If diff review shows accidental deletion, broad rewrite, weakened tests, or unrelated churn, do not commit; restore from the task's recovery snapshot or block for manual recovery.

Example:

```ts
Agent({
  subagent_type: "builder-highspeed",
  run_in_background: true,
  description: "Task 01 CSS tweak",
  prompt: "Implement task from /ABSOLUTE/PATH/.pi/plans/TASKS/task_01_builder-highspeed.md. Follow its scope and verification exactly."
})
```

Planner-generated schedules may mix `builder-highspeed` and `builder`. Always use the `Agent` value in `SCHEDULE.md` and the task file frontmatter/header. The schedule must also define checkpoint expectations; default is one selective commit per verified task.

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

Run builders in parallel when:
- files are disjoint;
- tasks have no dependency relationship;
- each task has clear target files and validation.

Run serially when:
- tasks touch the same file;
- task B depends on task A;
- a shared type/API contract may change;
- validation from one task determines the next.

## Prompt Quality Checklist

Before spawning builder, verify:

- [ ] Outcome is one clear sentence.
- [ ] Success criteria are concrete.
- [ ] Files to read are listed.
- [ ] Target files are listed.
- [ ] Constraints/out-of-scope are explicit.
- [ ] Preservation constraints are explicit: what must not be removed/rewritten.
- [ ] Pre-edit recovery snapshots are required for every MODIFY file.
- [ ] Validation command/check is included.
- [ ] Diff review is required before COMPLETE.
- [ ] Checkpoint commit expectation is clear for planner-driven tasks.
- [ ] Task is small enough for a delegated model.
- [ ] If using `builder-highspeed`, task is single-file/module-local, under ~6 logical steps, and every API/package/symbol can be verified.

If more than two boxes are missing, do more prep or implement directly.

## Result Handling

After builder finishes:
- inspect actual diff, not just its summary;
- check for accidental deletions, broad rewrites, weakened tests, removed handlers, or unrelated formatting churn;
- verify `.pi/recovery/{task_id}/before/...` snapshots exist for modified existing files;
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
| Spark asked to execute a long checklist | Split into small tasks or use `builder` |
| Spark allowed to infer APIs/packages | Require grep/package verification before implementation |
| Trusting builder summary only | Check diff and diagnostics |
