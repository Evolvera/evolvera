# TODO Task 02

## Phase 1 — Semantic trust boundary
- Status: complete
- Authorized files/symbols: `observer.ts`, `reflector.ts`, worker-contract smoke, transport-integrity smoke.
- Prerequisite: current citation/ID/privacy behavior characterized.
- Local exit evidence: `node extensions/test/plastic-memory-worker-contract.smoke.mjs` PASS; `node extensions/test/plastic-memory-transport-integrity.smoke.mjs` PASS; no runner changes.

## Phase 2 — Safe oversized partition
- Status: complete (acceptance repair)
- Authorized files/symbols: `cycles.ts:partitionEntries`, chunking smoke atomic-group regression.
- Prerequisite: original Task 02 target bytes verified and current ten-file repair snapshot captured under `repair_before/`.
- Local exit evidence: chunking smoke PASS; 170k agentic span partitions into multiple <=160k chunks with exact ordered coverage and tool-pair integrity; malformed multi-call/orphan spans fail before worker calls; oversized exchange retains fixed reason.

## Phase 2b — Final ordinary-prefix/tool-exchange kernel correction
- Status: complete
- Authorized files/symbols: `cycles.ts:partitionEntries`, `plastic-memory-chunking.smoke.mjs` regression only.
- Prerequisite: current ten-file bytes captured under `repair_before_2/`; prior recovery remains untouched.
- Local exit evidence: 95k ordinary group and 70k valid tool exchange remain separate atomic groups because their 165k combination exceeds the bound; each chunk is <=160k, ordered union is exact, call/result co-locate, and terminal-complete scheduler fixture closes once.

## Phase 3 — Aggregation and retry orchestration
- Status: complete
- Authorized files/symbols: `scheduler.ts`, workers smoke.
- Prerequisite: semantic result and chunk contracts stable.
- Local exit evidence: `node extensions/test/plastic-memory-workers.smoke.mjs` PASS; ordered coverage, append-once/reflection-once/close-once, observer and reflector retries, stale/fail-twice gates.

## Phase 4 — Shared adapters and integrated review
- Status: complete
- Authorized files/symbols: stride smoke, integration smoke, all ten targets.
- Prerequisite: phases 1–3 complete.
- Local exit evidence: stride/integration and all-Plastic loop PASS; scoped diff/check PASS; final receipt, patch, patch SHA, and target hashes written under `.pi/recovery/20260805_182432Z_plastic_memory_seamless_retention/task_02/`.

Completed phases: 1–4 and 2b
Current phase: none
Next phase: orchestrator receipt/checkpoint review; builder work complete
Changed files: `extensions/plastic-memory/session/cycles.ts`, `extensions/test/plastic-memory-chunking.smoke.mjs` (repair-2 delta); all other Task 02 target changes preserved
Validation: focused Task 02 six-smoke set PASS; session smoke PASS; all 21 Plastic smokes PASS; scoped diff check PASS; repair-2 receipt/patch/target hashes refreshed
