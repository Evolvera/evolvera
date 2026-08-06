# TILL-DO: plastic-observer-transport-budget

## Authority / baseline gate — PASS
- User contract is authoritative; target files are the declared maximum write set.
- Repository HEAD is `a5383ea551b5e20f1867b0bab16fffd8d7079d81`.
- Target status is clean; no unexplained target overlap or dirty target snapshot is present.
- Proven root cause is `runBoundedRole` slicing structured observer JSON via `boundedText(input.prompt, ROLE_PROMPT_CAP)`.

## Contract / scope gate — PASS
- Preserve 160,000-token observer ceiling, atomic tool exchanges, source order/coverage, retry/persistence/lifecycle behavior, and existing hard diagnostics.
- Change only runner prompt normalization/cap verdict, observer exact request construction/fit surface and output-first ordering, optional cycle fit predicate, scheduler wiring, and focused smoke assertions.
- Do not touch unrelated dirty files, providers/network/live sessions, settings/schema/dependencies, malformed/orphan handling, or observation content acceptance semantics.
- No new module is required: runner owns normalization/cap, observer builds the request, cycles remains worker-agnostic, scheduler binds the predicate and execution input.

## Validation / resources gate — PASS
- Required smoke commands are in-process fake-runtime/module-loading tests only: `NO_STATEFUL_RESOURCES` (no provider, network, app/server, database, queue/cache/object store, credentials, or live session).
- Focused validation: transport-integrity, chunking, worker-contract, workers smoke tests; then all 21 `extensions/test/plastic-memory-*.smoke.mjs` and `git diff --check`.
- No Pi/Luna/provider/network/app/server/E2E/live-session command will be run.

## Recovery / stop gate — PASS
- Target files are clean at the verified diagnostic head; git history plus selective checkpoint is the rollback boundary, so no pre-edit source snapshot is required.
- Stop on target overlap, mutable/runtime-only fit inputs, missing normalization reuse, unsafe/stateful validation, or two failed validations without a new hypothesis.
- Before completion, review diff for accidental exports, duplicated cap arithmetic, retained prompt truncation on execution path, weakened tests, and unrelated churn.
