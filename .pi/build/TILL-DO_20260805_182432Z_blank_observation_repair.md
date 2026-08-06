# TILL-DO — 20260805_182432Z_blank_observation_repair

## Authority / baseline gate — PASS
- Authority: approved post-live repair contract in the task; exact target files are observer.ts and the two named worker smoke tests.
- Baseline: Task 01/02 behavior is present at committed baseline `37f8d2e`; this repair began from the preserved prior repair diff plus the three pre-edit snapshots, so the targets were intentionally already dirty.
- Preservation: scheduler.ts is read-only; chunking/retry, strict citation/relevance/timestamp/shape validation, scrub safety, and zero-observation closure remain preserved.

## Contract / scope gate — PASS
- Change: enforce record/content type, timestamp type, relevance enum, and nonempty/subset citations before scrub/normalization; discard only candidates that are scrub-empty after valid structure/citation checks, preserving `empty-valid` for all valid discarded candidates.
- Prompt: explicitly instruct omission of placeholders/blank observations and `[]` when no durable non-empty fact exists.
- Exact source write set: `extensions/plastic-memory/workers/observer.ts`, `extensions/test/plastic-memory-worker-contract.smoke.mjs`, `extensions/test/plastic-memory-workers.smoke.mjs`.
- Out of scope: scheduler.ts, dependencies, settings/schema/retry design, live Pi/providers, credentials, broad refactor, and unrelated dirty/untracked files.

## Validation / resources gate — PASS
- Declared validation uses in-process stubs/fake runtimes only: `NO_STATEFUL_RESOURCES`.
- No network/provider/database/server/user session/credential files; do not run live Pi.
- Required checks: named worker-contract and workers smokes, transport-integrity, chunking, session, all plastic-memory smokes, and `git diff --check`.

## Recovery / stop gate — PASS
- Run-owned pre-edit snapshots created under `.pi/recovery/20260805_182432Z_blank_observation_repair/before/` for all three target files.
- Recovery evidence: preserve the three before snapshots; updated repair patch and SHA are `.pi/recovery/20260805_182432Z_blank_observation_repair/repair.patch` and `.pi/recovery/20260805_182432Z_blank_observation_repair/repair.patch.sha256`.
- Stop if blank candidates cannot be discarded without weakening strict validation, if scope expands, or if any validation indicates raw candidate content/identity/PII leakage.
- Builder must not stage or commit.
