---
name: testing
description: Post-build QA evidence gate for PI delivery. Use after implementation when material behavioral, integration, edge/error, browser, or runtime proof requires the dedicated qa agent. Select exactly CORE or FULL and produce SHA-, level-, and scope-bound PASS/BLOCKED/UNVERIFIED evidence. Direct deterministic closure remains outside QA.
---

# Testing Skill — Two-Level QA Evidence Gate

Use this skill when a completed implementation still needs material independent behavioral, integration, edge/error, browser, or runtime proof before closure or review. Exactly one dedicated agent, `qa`, executes delegated QA at exactly one level: `CORE` or `FULL`. Direct deterministic closure is outside QA, not a third level.

## Core Invariant

The producer proves its implementation locally. The orchestrator closes static/mechanical work directly when deterministic evidence is sufficient. When independent QA materially improves confidence, it selects one level, creates a self-contained handoff from `templates/qa-handoff.md`, and launches a fresh `qa` session against one exact checkpoint.

Bind every QA receipt to the exact final head SHA, selected level, and declared claim scope. If the head changes, prior evidence is stale and affected QA must run again. `CORE PASS` is bounded to its declared CORE scope and never means product-wide or full-stack PASS. `FULL PASS` requires every acceptance-required surface to be safely exercised; browser claims require a real browser.

## Stateful Test-Resource Gate — Before Any Runtime Command

Tests are application code and may truncate tables, reset schemas, run migrations/seeds, delete files, drain queues, overwrite buckets, clear caches, or call third parties. Source-read-only QA describes edits; it does **not** make a command non-mutating.

Before any test, app/server start, E2E journey, migration, seed, reset, fuzz/load/security check, or build lifecycle hook that may touch state, the orchestrator must resolve and inspect:

1. the literal command after package/task indirection;
2. test runner config, global setup/teardown, fixtures, hooks, app startup, env-file precedence, migrations/seeds, and cleanup code;
3. every reachable database/schema, filesystem root, bucket/object store, queue/topic, cache namespace, search index, emulator/device store, and external API;
4. destructive operations such as `truncate`, broad `delete`, `drop`, reset/clean, migration rollback/fresh, recursive removal, queue purge, or provider side effects.

Classify the command `NO_STATEFUL_RESOURCES` or each resource:

- `DISPOSABLE_VERIFIED`: created uniquely for this run, synthetic/empty by contract, scoped credentials, no fallback to another endpoint, and teardown can affect only the run-owned namespace;
- `NONDISPOSABLE`: predates the run or contains user, development, shared, staging, production, or otherwise preserved state;
- `UNKNOWN`: identity, env resolution, ownership, contents, reachability, or cleanup boundary is not proven.

Only `NO_STATEFUL_RESOURCES` or an all-`DISPOSABLE_VERIFIED` resource set may execute. `localhost`, a local developer service, `.env.test`, `NODE_ENV=test`, a database name containing `test`, Docker, transactions, mocks with network fallback, and backups are **not** proof. Never run destructive tests against a resource that predates the run. Create a disposable clone/container/namespace instead; if that cannot be done within approved scope, return `UNVERIFIED` without executing the command. Safety overrides the runtime-observation requirement.

Record a sanitized receipt before execution: command resolution, config/hook files inspected, resource type and non-secret identity, ownership creation evidence, destructive hooks, synthetic data source, egress policy, and teardown boundary. After execution, verify protected resources were unreachable/unchanged and cleanup affected only run-owned resources. If unexpected mutation is suspected, stop immediately; preserve exact evidence and do not retry, continue, restore, reseed, or recreate user data without explicit authorization.

## Select Direct Closure or One QA Level

### Direct closure — outside QA

Use direct orchestrator commands when the exact deterministic command and indirection are known, no scenario/runtime judgment is needed, the resource gate is satisfied, and the result is unambiguous. Typical examples are parser/config validation, docs checks, typecheck for a type-only change, or an already-known focused unit command. This is closure without QA and is not a level.

The static inventory utility may expose candidates without executing target code:

```text
node skills/testing/scripts/inventory-qa-surfaces.mjs <target-directory>
```

Its `static-read-only` output is discovery only. It never proves command safety, disposability, coverage, or PASS.

### CORE

Select `CORE` when independent scenario selection is useful but the claim can remain explicitly bounded: focused behavior, boundary/error, contract, component, or preservation evidence. Load `references/core-qa.md` only. Simulation and mocks may contribute only when labeled partial/CORE evidence. CORE never claims the product, full stack, deployment, or real-browser behavior passed.

### FULL

Select `FULL` when acceptance materially requires every named integrated runtime surface, such as a real browser, API/auth/session, persistence, async processing, logs, or state transitions. Load `references/full-qa.md` only. A required browser claim needs a real browser; jsdom/component simulation and mocked critical paths are partial evidence. BrowserContext isolates browser state, not backend resources.

If any required FULL surface is unsafe or unavailable, keep the selected level and return `UNVERIFIED`; never downgrade the claim after seeing the gap. External/live operations are outside default QA and remain forbidden unless separately and explicitly authorized by the user and system policy.

## QA Handoff Contract

Use `templates/qa-handoff.md`. The handoff must state outcome, exact repository/base/head, selected `CORE | FULL` level, declared claim scope, reconciled `PRESERVE | CHANGE | REMOVE` contract, acceptance-to-evidence matrix, changed files and focused reads, producer evidence as leads, exact command/resource boundary, browser requirement, and harness phase if explicitly authorized.

Launch only `subagent_type: "qa"`. There is no builder testing compatibility mode, second QA identity, or third level.

## QA Behavior and Verdict

The fresh `qa` session must:

1. Verify the requested head SHA and changed surface.
2. Load this skill plus only the selected level reference.
3. Derive meaningful happy, boundary/error, integration, and preservation cases from acceptance, pre-change behavior, and repository contracts—not producer narrative.
4. Inspect focused source/tests and base-to-head test changes. Changed tests or snapshots do not authorize capability removal or oracle weakening.
5. Independently verify the stateful-resource receipt before every runtime command. Missing, stale, `UNKNOWN`, `NONDISPOSABLE`, fixed/shared/pre-existing, fallback-ambiguous, or contradicted proof means no execution and `UNVERIFIED` for required evidence.
6. Run only bounded falsifiable checks inside the verified boundary. Preserve the first failure; pass-after-retry is flaky and cannot become clean `PASS`. Coverage is diagnostic, never a universal threshold.
7. Observe actual response, browser, logs, persistence, async result, and state only where required by the selected level and safe boundary. A real browser is mandatory for browser claims.
8. Remain source-read-only and never repair while testing. On suspected mutation, stop and apply the incident rule above.
9. Return exactly one receipt:

```markdown
## QA VERDICT: PASS | BLOCKED | UNVERIFIED
Target: <base>..<final head SHA>
Level: CORE | FULL
Declared scope: <bounded claim>
Acceptance exercised: <matrix items and evidence>
Checks: <commands/journeys and first observations>
Stateful resource receipt: <NO_STATEFUL_RESOURCES or sanitized DISPOSABLE_VERIFIED evidence>
Protected-resource postcheck: <unchanged/unreachable evidence>
Browser evidence: <real browser | simulated/mocked partial evidence | not required>
Failures: <none or exact reproducible mismatch; first failure and retry history retained>
Evidence gaps: <none or exact unavailable/unsafe requirement>
Next: <validator | bounded repair | fresh QA after harness checkpoint | user/environment decision>
```

- `PASS`: all acceptance required by the selected level and declared scope was safely exercised. A `CORE PASS` remains bounded to CORE scope.
- `BLOCKED`: a concrete reproducible mismatch exists; return it for classification and possible bounded repair.
- `UNVERIFIED`: no defect is proven, but required evidence was unavailable or unsafe. Never convert this, a mock, or simulation into PASS.

## FULL Harness Construction Exception

Harness construction is an internal FULL phase only. It requires explicit project authorization, an exact test-only write set, transparent dependency/network permissions, and a new selective checkpoint. The harness-building `qa` session may write only that set, must not alter product code or bless behavior by rewriting tests, and stops after reporting exact changed files and static evidence. It cannot run/certify its own harness or issue a final verdict. A new fresh source-read-only `qa` session bound to the new SHA owns final execution and `PASS | BLOCKED | UNVERIFIED`. See `references/full-qa.md`.

## Repair Loop

On `BLOCKED`:

1. The orchestrator first classifies the finding. An implementation defect already covered by the reconciled contract may go to a repair builder with exact reproduction and bounded write set. A conflict between gate/task wording and observed existing capability goes back to contract reconciliation and, when intent cannot be evidenced, the user.
2. Never authorize a repair builder to remove/degrade a capability or rewrite preservation tests merely to satisfy a gate unless the contract explicitly classifies that behavior `CHANGE` or `REMOVE`.
3. Commit an authorized verified repair selectively, producing a new head SHA.
4. Rerun the affected test gate against the new SHA.
5. After two failed gates without a new hypothesis, stop and re-ground; do not loop automatically.

A contract/acceptance defect goes back to planning rather than implementation. The `qa` session never repairs while testing.

## Validator and Ship Ordering

When a separate test gate is materially warranted, the order is:

```text
producer checkpoint → selected CORE/FULL QA gate → validator/review → ready to ship
```

Otherwise focused producer/direct evidence may flow straight to the applicable review or closure. The validator reviews the exact evidenced head and receives the acceptance matrix plus relevant QA evidence. It checks the focused diff, contracts, and adequacy of evidence; it does not replace materially required QA or rerun broad passing suites.

Merge/deploy still requires explicit authorization. When shipping includes deployment, perform the approved deploy, post-deploy smoke, and rollback procedure separately; a pre-merge local PASS is not production proof.

## Proportionality Rules

- Static/mechanical/docs-only changes usually use direct closure and no delegated QA.
- One QA gate may cover a coherent builder wave; do not create one session per file/task when the same acceptance journey covers them together.
- Use a fresh `qa` session at CORE or FULL only when independent behavior, boundaries, cross-task integration, browser, or runtime observation materially improves confidence.
- A linked validator remains selective for named escape risk; every PR still receives one final independent validator review under the global contract.
- Do not create new task files, SCHEDULE rows, commits, or lifecycle artifacts solely to represent QA. Record the verdict in the existing execution log/report or PR evidence.
