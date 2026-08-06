# TODO Task 04

## Phase 1 — Baseline and API mapping
- Status: complete
- Authorized files/symbols: emergency selection; engine finalization; worker and overlay APIs.
- Prerequisite: TILL-DO all PASS and recovery snapshots verified.
- Exit evidence: target implementations and compatible worker/renderer/pending contracts read.

## Phase 2 — Emergency semantic orchestration
- Status: complete
- Authorized files/symbols: `compaction/emergency.ts` pipeline exports and helpers.
- Prerequisite: immutable selected unit/chunks and candidate runner APIs.
- Exit evidence: immutable selected unit/chunks, exact candidate order, whole-phase retry, abort/deadline, strict worker parsers, and transient failure/success result implemented.

## Phase 3 — Emergency verified finalization
- Status: complete
- Authorized files/symbols: `compaction/engine.ts` emergency-only finalizer.
- Prerequisite: Phase 2 result contract.
- Exit evidence: emergency-only render/bind finalizer verifies source/cut/state identities, uses overlay index, creates no cycle record, and does not stage pending.

## Phase 4 — Deterministic pipeline smoke
- Status: complete
- Authorized files/symbols: `extensions/test/plastic-memory-emergency-pipeline.smoke.mjs`.
- Prerequisite: phases 2–3 complete.
- Exit evidence: pipeline smoke passes fallback traces, immutable prompts, citations, summary/index, pending binding, cancellation, and no persistence.

## Phase 5 — Validation and focused diff review
- Status: complete
- Authorized files: declared task files only plus transient `.pi/build` artifacts.
- Prerequisite: smoke exists and source changes are complete.
- Exit evidence: task smoke, full Plastic smokes, diff check, and focused diff review.

Completed: Phases 1–5
Current: complete
Next: none
Changed files: `extensions/plastic-memory/compaction/emergency.ts`, `extensions/plastic-memory/compaction/engine.ts`, `extensions/test/plastic-memory-emergency-pipeline.smoke.mjs`
