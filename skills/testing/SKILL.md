---
name: testing
description: Post-build testing gate for PI delivery. Use after implementation and before validator/review to choose the lightest reliable proof: direct deterministic checks, a fresh builder session in POST-BUILD TEST MODE for local/adversarial/runtime verification, or builder-heavy for authorized external-host testing. Produces SHA-bound PASS/BLOCKED/UNVERIFIED evidence without adding a tester agent or changing planner task schemas.
---

# Testing Skill — Post-Build Evidence Gate

Use this skill when a completed implementation still needs material behavioral, integration, edge/error, or runtime proof before closure or review. Do not invoke it merely because a builder ran: static/mechanical work may already be closed by focused deterministic evidence. Testing is a delivery responsibility, not an agent identity; use the lightest executor that can prove the approved behavior.

## Core Invariant

The producer builder proves its implementation locally. When the outcome or failure modes warrant additional independence, the post-build gate proves the approved behavior on the resulting checkpoint. A builder `COMPLETE` closes its unit, while the orchestrator decides proportionately whether that evidence closes the user's outcome.

Bind every gate to one exact final head SHA. If the head changes, prior test evidence is stale and the affected gate must run again.

## Stateful Test-Resource Gate — Before Any Runtime Command

Tests are application code and may truncate tables, reset schemas, run migrations/seeds, delete files, drain queues, overwrite buckets, clear caches, or call third parties. `read-only tester` describes source edits; it does **not** make a command non-mutating.

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

## Choose the Lightest Gate

### 1. Direct orchestrator gate

Use direct commands when all are true:

- the exact deterministic command is already known and its script/config indirection has been resolved;
- no scenario design, integration judgment, browser/runtime journey, or external host is needed;
- it is proven `NO_STATEFUL_RESOURCES`, or every reachable resource is `DISPOSABLE_VERIFIED`;
- the result is locally observable and unambiguous.

Typical examples: targeted unit test, typecheck for a type-only change, parser/config validation, docs link check, or a known build command. Do not launch an agent merely to execute one obvious command.

### 2. Fresh `builder` testing session

Use a fresh `builder` session when proving the result requires choosing meaningful cases, checking edge/error paths, integrating outputs from multiple tasks, or observing a local endpoint/runtime/browser journey. The same builder type may test, but never reuse the producer's agent session: fresh context reduces self-confirmation.

The tester is read-only by default: it may inspect code/diff and run non-destructive commands, but must not fix production code, edit tests/config, commit, push, deploy, or broaden scope. Missing regression coverage becomes a concrete gap or repair task; it is not silently authored during the gate.

### 3. `builder-heavy` testing session

Use `builder-heavy` only when the gate itself requires an authorized external operation: SSH, live host/service, GPU/runtime process, deploy/reload, provider/network interaction, or rollback/smoke on an external environment. Quote only relevant project-memory lessons in the handoff. Testing importance or risk alone does not select heavy.

## Testing Prompt Contract

A delegated testing prompt must be self-contained and begin with the exact marker `POST-BUILD TEST MODE`. Include:

```text
POST-BUILD TEST MODE

OUTCOME TO PROVE
[Approved user-visible/system behavior, not the producer's implementation story.]

TARGET
- Repository: [absolute project root]
- Base SHA: [pre-change SHA]
- Final head SHA: [checkpoint under test]
- Changed files: [exact list]

RECONCILED CONTRACT
- [approved outcome and affected existing capabilities classified PRESERVE/CHANGE/REMOVE]

ACCEPTANCE MATRIX
- [requested observable condition → required evidence]
- [affected preserved journey → regression/runtime evidence]

READ FIRST
- [directly affected source/contracts/tests]

PRODUCER EVIDENCE
- [commands/results already reported; evidence only, not truth]

TEST RESOURCES / CONSTRAINTS
- [approved commands, local endpoint/browser/runtime, fixtures, ports, environment]
- [forbidden data/environments/actions]

STATEFUL RESOURCE PROOF
- Command resolution: [literal command plus package/task indirection]
- Runner/setup/teardown inspected: [exact files]
- Classification: NO_STATEFUL_RESOURCES | resource-by-resource DISPOSABLE_VERIFIED
- Resources: [type + sanitized identity + unique run ownership evidence]
- Destructive hooks: [none or exact hooks confined to owned resource]
- Protected boundary: [dev/user/shared/staging/production resources proven unreachable]
- Egress/credentials: [none or exact test-only scope]
- Teardown: [owned namespace only]
- Do not edit source, tests, config, plans, memory, or git history.
- Do not trust the producer summary; derive checks from acceptance and repository contracts.
- Prefer the smallest checks that can falsify the implementation.

REQUIRED COVERAGE
- happy path;
- directly affected error/boundary path;
- named regression or integration seam;
- runtime observation when acceptance requires it.

STOP RULES
- Do not repair failures.
- Do not invent unavailable routes, hosts, credentials, fixtures, or expected behavior.
- Return UNVERIFIED when required evidence is genuinely unavailable.
```

Choose `subagent_type: "builder"` for local testing. Use `builder-heavy` only under the external-operation rule above.

## Tester Behavior

The testing session must:

1. Verify it is inspecting the requested head SHA and changed surface.
2. Derive scenarios from the reconciled contract, acceptance matrix, pre-change behavior, and visible public/repository contracts—not from how the producer says the code works.
3. Inspect enough focused code/tests and the base-to-head test diff to identify meaningful happy, boundary/error, integration, and preservation cases. A changed test that merely expects removed behavior is not proof that removal was authorized.
4. Before every runtime command, verify the supplied stateful-resource receipt against the actual command/config. If absent, stale, `UNKNOWN`, `NONDISPOSABLE`, or contradicted by fallback/destructive hooks, do not execute; return `UNVERIFIED` with the exact missing proof.
5. Run bounded checks only inside the verified disposable boundary. Prefer tests that could actually falsify the change; do not rerun broad suites for ceremony.
6. For sensitive/complex or user-visible behavior, execute the affected journey only when its complete client/server state path is disposable, then inspect the actual response, logs, persisted state, rendered page, or browser console as applicable.
7. Remain source-read-only. On test failure preserve reproduction evidence and stop; on suspected data mutation stop all mutating commands and invoke the incident rule above.
8. Report one SHA-bound verdict:

```markdown
## TEST VERDICT: PASS | BLOCKED | UNVERIFIED
Target: <base>..<final head SHA>
Acceptance exercised: <matrix items>
Checks: <commands/journeys and observed results>
Stateful resource receipt: <NO_STATEFUL_RESOURCES or sanitized DISPOSABLE_VERIFIED evidence>
Protected-resource postcheck: <unchanged/unreachable evidence>
Failures: <none or exact reproducible mismatch>
Evidence gaps: <none or exact unavailable requirement>
Next: <validator | bounded repair | user/environment decision>
```

- `PASS`: required acceptance was exercised with sufficient evidence.
- `BLOCKED`: a concrete reproducible mismatch exists; return it to a bounded repair builder.
- `UNVERIFIED`: no defect is proven, but required evidence could not be obtained. Never convert this to PASS.

## Repair Loop

On `BLOCKED`:

1. The orchestrator first classifies the finding. An implementation defect already covered by the reconciled contract may go to a repair builder with exact reproduction and bounded write set. A conflict between gate/task wording and observed existing capability goes back to contract reconciliation and, when intent cannot be evidenced, the user.
2. Never authorize a repair builder to remove/degrade a capability or rewrite preservation tests merely to satisfy a gate unless the contract explicitly classifies that behavior `CHANGE` or `REMOVE`.
3. Commit an authorized verified repair selectively, producing a new head SHA.
4. Rerun the affected test gate against the new SHA.
5. After two failed gates without a new hypothesis, stop and re-ground; do not loop automatically.

A contract/acceptance defect goes back to planning rather than implementation. The tester never repairs while testing.

## Validator and Ship Ordering

When a separate test gate is materially warranted, the order is:

```text
producer checkpoint → post-build test gate → validator/review → ready to ship
```

Otherwise focused producer/direct evidence may flow straight to the applicable review or closure. The validator reviews the exact evidenced head and receives the acceptance matrix plus relevant test evidence. It checks the focused diff, contracts, and adequacy of evidence; it does not replace the test gate or rerun broad passing suites.

Merge/deploy still requires explicit authorization. When shipping includes deployment, perform the approved deploy, post-deploy smoke, and rollback procedure separately; a pre-merge local PASS is not production proof.

## Proportionality Rules

- Static/mechanical/docs-only changes usually use a direct gate and no delegated tester.
- One integrated gate may cover a coherent builder wave; do not create one testing session per file/task when the same acceptance journey covers them together.
- Use a fresh builder tester for behavior, boundaries, cross-task integration, or runtime observation—not as blanket ceremony.
- A linked validator remains selective for named escape risk; every PR still receives one final independent validator review under the global contract.
- Do not create new task files, SCHEDULE rows, commits, or lifecycle artifacts solely to represent the testing gate. Record the verdict in the existing execution log/report or PR evidence.
