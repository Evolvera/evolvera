# QA Handoff

```text
QA EVIDENCE RUN

OUTCOME TO PROVE
[Approved observable behavior and why it matters.]

TARGET
- Repository: [absolute root]
- Testing skill root: [absolute `$PI_CODING_AGENT_DIR/skills/testing` path]
- Selected reference: [absolute `references/core-qa.md` or `references/full-qa.md` path matching Level]
- Base SHA: [base]
- Final head SHA: [checkpoint under test]
- Level: CORE | FULL
- Declared claim scope: [bounded CORE scope or complete FULL acceptance surfaces]
- Changed files: [exact list]

RECONCILED CONTRACT
- PRESERVE: [existing capabilities]
- CHANGE: [approved changes]
- REMOVE: [explicitly authorized removals]

ACCEPTANCE MATRIX
- [observable condition → required evidence/surface]
- [affected error/boundary and preservation seam → evidence]

READ FIRST
- [absolute testing skill root]/SKILL.md — global QA policy; never substitute a project-local skill
- [absolute selected-reference path from TARGET]
- [direct source/contracts/tests]

PRODUCER EVIDENCE
[Commands/results as leads, not truth.]

COMMAND AND RESOURCE BOUNDARY
- Approved commands/journeys: [exact or none]
- Command resolution/config/hooks inspected: [exact files]
- Classification: NO_STATEFUL_RESOURCES | resource-by-resource DISPOSABLE_VERIFIED | UNKNOWN
- Resources: [sanitized identity + unique run ownership evidence]
- Destructive hooks/fallback: [none or exact run-owned confinement]
- Protected boundary: [user/dev/shared/staging/production unreachable]
- Egress/credentials: [none or exact test-only scope]
- Teardown and postcheck: [run-owned only + protected resources unchanged]
- Browser requirement: [real browser required | no browser claim]

HARNESS AUTHORIZATION
- Phase: none | BUILD_ONLY | FRESH_READ_ONLY_RUN
- Exact test-only write set (BUILD_ONLY only): [paths]
- Dependency/network authorization: [none or exact]
- Checkpoint/new-SHA requirement: [exact]

ACTION BOUNDARY
Default source-read-only. No repair, product/test rewriting to bless behavior, plans/memory/git mutation, commit/push/deploy, or external/live operations. BUILD_ONLY stops after handing changed files/evidence to the orchestrator; it cannot issue a verdict. A fresh read-only qa session on the new SHA owns certification.

STOP RULES
Unsafe, fixed, pre-existing, shared, unknown, or fallback-ambiguous resources: do not execute; return UNVERIFIED. Retain first failure; retry-pass is flaky, not clean PASS. Suspected mutation: stop, preserve evidence, no retry/restore/reseed. Do not invent missing scope, routes, data, credentials, or expected behavior.

OUTPUT
- Normal or `FRESH_READ_ONLY_RUN`: exactly `PASS | BLOCKED | UNVERIFIED`, bound to SHA, selected level, and declared scope, using the receipt in the testing skill.
- `BUILD_ONLY`: no QA verdict. Return `QA HARNESS BUILD RESULT: COMPLETE | BLOCKED`, exact changed files/static evidence, and `Next: selective checkpoint then fresh read-only qa session`.
```
