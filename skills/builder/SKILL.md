---
name: builder
description: Use the builder agent to implement focused code changes. Builder runs on a fast delegated model — split work into small, atomic tasks and parallelize when files are disjoint. Can be invoked directly by the main model or from planner-generated task files.
---

# Builder Skill — Focused Code Execution

Builder is a fast delegated implementation agent. It is cheaper and faster than the main model, but less good at inferring hidden context. Use it when the task is small, bounded, and verifiable.

## Goal

Delegate implementation without overloading the main model, while preserving quality through narrow scope and explicit validation.

Success means:
- the requested change is implemented;
- only intended files are changed;
- existing project patterns are followed;
- relevant validation is run or a clear blocker is reported;
- the result includes what changed, validation result, and any unresolved risk.

## When to Use Builder

Use builder for:
- one focused fix, component, endpoint, test, or refactor;
- 1–2 files with one concern;
- planner-generated task files;
- mechanical changes with clear target behavior.

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
3. Run tasks in the same parallel group concurrently only if files do not overlap.
4. Run dependent groups serially.
5. After each builder, read the handover/status artifact if produced and update orchestration state.

Example:

```ts
Agent({
  subagent_type: "builder",
  run_in_background: true,
  description: "Task 01 navbar",
  prompt: "Implement task from /ABSOLUTE/PATH/.pi/plans/TASKS/task_01_builder.md. Follow its scope and verification exactly."
})
```

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
- Do not change public API except [allowed change]
- Do not touch files outside TARGET FILES unless blocked and reported

VALIDATION
Run:
- [targeted test/typecheck/lint/build command]
If validation cannot run, explain why and provide the next best check.

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
- [ ] Validation command/check is included.
- [ ] Task is small enough for a delegated model.

If more than two boxes are missing, do more prep or implement directly.

## Result Handling

After builder finishes:
- inspect actual diff, not just its summary;
- run or review validation results;
- if builder returns empty/no-op, retry once with a smaller prompt or switch model;
- if it fails twice, stop delegating and diagnose before continuing.

## Examples

### Single-file fix

```ts
Agent({
  subagent_type: "builder",
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
Agent({ subagent_type: "builder", run_in_background: true, description: "Email validator", prompt: "...TARGET FILES: src/validators/email.ts..." })
Agent({ subagent_type: "builder", run_in_background: true, description: "Phone validator", prompt: "...TARGET FILES: src/validators/phone.ts..." })
```

## Anti-Patterns

| Anti-pattern | Better |
|---|---|
| "Fix auth" | Define exact failing behavior, files, and validation |
| One builder for UI + API + DB | Split by concern and dependencies |
| No validation command | Include targeted test or explain why none exists |
| Broad refactor request | Use planner first |
| Trusting builder summary only | Check diff and diagnostics |
