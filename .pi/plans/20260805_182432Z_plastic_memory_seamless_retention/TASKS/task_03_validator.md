# Task 03: Validate lossless cuts, fallback, chunking, and retry

**Agent**: validator  
**Why**: Unit-level success can still hide an unsafe physical cut, stale fallback state, partial chunk closure, duplicate record, or changed-source retry.  
**Goal**: Record `PASS` only when the serialized producer checkpoints independently prove every high-consequence retention, application, worker, citation, and privacy barrier.

## Read

- Producer checkpoint hashes, selective diffs, and both `FINAL_DELTA_RECEIPT.md` files — distinguish owned deltas from preserved dirty/untracked content
- `.pi/recovery/20260805_182432Z_plastic_memory_seamless_retention/task_01/task-01.delta.patch` and reported SHA-256 — confirm the original partial delta was preserved and incorporated, not reverted or falsely checkpointed
- `extensions/plastic-memory/compaction/engine.ts` — normal/emergency whole-cycle selection, request/state/cut alignment, acknowledgement
- `extensions/plastic-memory/runtime/coordinator.ts` — public budget inputs, advisory-cut ownership, benign refusal, hook recheck, fallback rebase, acknowledgement state
- `extensions/plastic-memory/workers/compactor.ts` — variable/emergency eligible contract
- `extensions/plastic-memory/session/cycles.ts` — ordinary snapshot identity, safe oversized partition, attempt 0/1, exact full-span close
- `extensions/plastic-memory/workers/observer.ts` and `reflector.ts` — semantic-only parser, code-owned IDs/records, exact citation allow-lists
- `extensions/plastic-memory/workers/scheduler.ts` — immutable source/chunks, aggregate append order, immediate retry, stale checks, one closure/compactor handoff
- `extensions/plastic-memory/workers/runner.ts`, `compaction/render.ts`, `compaction/pending.ts`, `session/bootstrap.ts`, and `compaction/projection.ts` — preserved boundaries; read only
- Every changed smoke file named in the producer receipts — fixed oracles must not derive expected cuts/chunks/attempts from production output

## Change

- Review the named producer checkpoints and changed surface only; no production/test/config/doc edits. **Files Touched: none.**

## Acceptance

- [ ] `PASS` evidence shows C6 → request C1/C2 + cut C3 and delayed unacknowledged C8 → request C1..C4 + cut C5, with acknowledged-prefix behavior and every incomplete-suffix entry retained.
- [ ] `PASS` evidence shows normal four-raw retention, a fixed emergency that folds only whole oldest retained cycle(s) into the same request/cumulative state, and an impossible/unknown fit that returns/cancels without native boundary violation or split tool exchange.
- [ ] `PASS` evidence shows a valid Plastic pending overrides later host advice and consumes once; <=20k/unknown makes zero calls; exact `Nothing to compact` preserves pending and retries only on a later settled edge without warning/hot loop.
- [ ] `PASS` evidence shows only matching Plastic acknowledgement promotes state, while an actual native/unmatched/non-Plastic append becomes a fresh bootstrap boundary with stale pending/prior/old-generation recall state invalidated and one current summary observable.
- [ ] `PASS` evidence shows model output contains only semantic observations/reflections/citations, code owns all IDs/binding/span/records, and invalid source/support citations plus secret/PII fixtures still fail safely.
- [ ] `PASS` evidence shows a >160k first completed span produces deterministic ≤160k ordered chunks, never separates tool calls/results, persists no partial coverage, reflects once, and closes exactly one full-span cycle; an indivisible over-budget group fails with the fixed safe reason and no oversized call.
- [ ] `PASS` evidence shows observer and reflector independently retry at most once immediately against byte-equivalent phase input with attempt outcomes 0/1, append observations once, stop after a second failure, and do not retry stale work.
- [ ] Focused diffs preserve digest/ancestry/user cut/TTL/nonce/projection/transport/160k-per-call markers, original dirty hunks, and recovery artifacts; no private host import, dependency/config/schema change, broad rewrite, weakened oracle, installed-host edit, or unrelated staging is present.

## Constraints

- Review-only. Do not edit, create repair tests, stage, commit, run Pi/live PTY, invoke providers, inspect credentials, or access non-run-owned mutable state.
- Runtime observations must use fixed fake registries/models and deterministic branch/token fixtures. A changed test may not compute its expected cut, chunk coverage, attempt count, or survivors from production output.
- On `BLOCKED`, pause downstream campaigns and return bounded findings to the responsible producer. Rerun this same gate only after a selective repair checkpoint.

## Validation

- `for test in plastic-memory-compaction plastic-memory-stride plastic-memory-apply-cut plastic-memory-acknowledge plastic-memory-worker-contract plastic-memory-workers plastic-memory-transport-integrity plastic-memory-chunking plastic-memory-integration plastic-memory-session plastic-memory-host; do node "extensions/test/${test}.smoke.mjs" || exit 1; done` — one bounded critical suite; expected signal is every named PASS banner with fixed request/cut/chunk/call/record observations and no provider/network use
- `git diff --check -- extensions/plastic-memory/compaction/engine.ts extensions/plastic-memory/runtime/coordinator.ts extensions/plastic-memory/workers/compactor.ts extensions/plastic-memory/session/cycles.ts extensions/plastic-memory/workers/observer.ts extensions/plastic-memory/workers/reflector.ts extensions/plastic-memory/workers/scheduler.ts extensions/test/plastic-memory-compaction.smoke.mjs extensions/test/plastic-memory-stride.smoke.mjs extensions/test/plastic-memory-apply-cut.smoke.mjs extensions/test/plastic-memory-acknowledge.smoke.mjs extensions/test/plastic-memory-integration.smoke.mjs extensions/test/plastic-memory-worker-contract.smoke.mjs extensions/test/plastic-memory-workers.smoke.mjs extensions/test/plastic-memory-transport-integrity.smoke.mjs extensions/test/plastic-memory-chunking.smoke.mjs` — no whitespace damage across the reviewed surface
- Focused receipt/hash/diff inspection — original partial SHA, resume snapshots, two final patch SHAs, exact selective checkpoint hashes, shared-test baseline bridge, no undeclared files, and no lost preservation marker

**STATEFUL RESOURCE PROOF**: pure branch/worker smokes are independently confirmed `NO_STATEFUL_RESOURCES`. Integration/host commands run only if their unique OS-temp roots, fake models, bounded teardown, and absence of provider/network/credential/user/shared paths are independently `DISPOSABLE_VERIFIED`; otherwise verdict is `BLOCKED` for missing runtime evidence.

## Stop If

- A writing checkpoint hash or final receipt is missing, the original partial patch was overwritten, or the reviewed delta cannot be separated from pre-existing dirty/untracked content.
- Any fixed oracle was weakened, expected values are production-derived, a chunk/cut can split a tool exchange/incomplete turn, or a later task/campaign is needed to restore deterministic validity.
- Any command can invoke a provider/Pi live runtime, read credentials, or mutate non-run-owned state.

## Checkpoint

- Recovery snapshot: not required (review-only).
- Checkpoint Commit: not required (quality gate). Record exactly `PASS` or `BLOCKED`; never create an empty commit.
