---
name: testing
description: Post-build testing gate for PI delivery. Use after implementation and before validator/review to choose the lightest reliable proof: direct deterministic checks, a fresh builder session in POST-BUILD TEST MODE for local/adversarial/runtime verification, or builder-heavy for authorized external-host testing. Produces SHA-bound PASS/BLOCKED/UNVERIFIED evidence without adding a tester agent or changing planner task schemas.
---

# Testing Skill — Post-Build Evidence Gate

Use this skill after a producer builder checkpoint and before any linked validator or final PR review. Testing is a delivery gate, not an agent identity: use the lightest executor that can prove the approved behavior.

## Core Invariant

The producer builder proves its implementation locally. The post-build gate independently proves the approved outcome on the resulting checkpoint. A builder `COMPLETE` is therefore ready for testing/integration, not automatic completion of the user's outcome.

Bind every gate to one exact final head SHA. If the head changes, prior test evidence is stale and the affected gate must run again.

## Choose the Lightest Gate

### 1. Direct orchestrator gate

Use direct commands when all are true:

- the exact deterministic command is already known;
- no scenario design, integration judgment, browser/runtime journey, or external host is needed;
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

ACCEPTANCE MATRIX
- [observable condition → required evidence]

READ FIRST
- [directly affected source/contracts/tests]

PRODUCER EVIDENCE
- [commands/results already reported; evidence only, not truth]

TEST RESOURCES / CONSTRAINTS
- [approved commands, local endpoint/browser/runtime, fixtures, ports, environment]
- [forbidden data/environments/actions]
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
2. Derive scenarios from the acceptance matrix and visible public/repository contracts—not from how the producer says the code works.
3. Inspect enough focused code/tests to identify meaningful happy, boundary/error, and integration cases.
4. Run bounded, non-destructive checks. Prefer tests that could actually falsify the change; do not rerun broad suites for ceremony.
5. For sensitive/complex or user-visible behavior, execute the affected journey and inspect the actual response, logs, persisted state, rendered page, or browser console as applicable.
6. Remain read-only. On failure, preserve exact reproduction evidence and stop.
7. Report one SHA-bound verdict:

```markdown
## TEST VERDICT: PASS | BLOCKED | UNVERIFIED
Target: <base>..<final head SHA>
Acceptance exercised: <matrix items>
Checks: <commands/journeys and observed results>
Failures: <none or exact reproducible mismatch>
Evidence gaps: <none or exact unavailable requirement>
Next: <validator | bounded repair | user/environment decision>
```

- `PASS`: required acceptance was exercised with sufficient evidence.
- `BLOCKED`: a concrete reproducible mismatch exists; return it to a bounded repair builder.
- `UNVERIFIED`: no defect is proven, but required evidence could not be obtained. Never convert this to PASS.

## Repair Loop

On `BLOCKED`:

1. The orchestrator diagnoses the finding and gives a repair builder the exact reproduction and bounded write set.
2. Commit the verified repair selectively, producing a new head SHA.
3. Rerun the affected test gate against the new SHA.
4. After two failed gates without a new hypothesis, stop and re-ground; do not loop automatically.

A contract/acceptance defect goes back to planning rather than implementation. The tester never repairs while testing.

## Validator and Ship Ordering

The normal order is:

```text
producer checkpoint → post-build test gate → validator/review → ready to ship
```

The validator reviews the exact tested head and receives the acceptance matrix plus test evidence. It checks the focused diff, contracts, and adequacy of evidence; it does not replace the test gate or rerun broad passing suites.

Merge/deploy still requires explicit authorization. When shipping includes deployment, perform the approved deploy, post-deploy smoke, and rollback procedure separately; a pre-merge local PASS is not production proof.

## Proportionality Rules

- Static/mechanical/docs-only changes usually use a direct gate and no delegated tester.
- One integrated gate may cover a coherent builder wave; do not create one testing session per file/task when the same acceptance journey covers them together.
- Use a fresh builder tester for behavior, boundaries, cross-task integration, or runtime observation—not as blanket ceremony.
- A linked validator remains selective for named escape risk; every PR still receives one final independent validator review under the global contract.
- Do not create new task files, SCHEDULE rows, commits, or lifecycle artifacts solely to represent the testing gate. Record the verdict in the existing execution log/report or PR evidence.
