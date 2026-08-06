# Task 04: Build the bounded emergency semantic pipeline and verified pending result

**Agent**: builder  
**Why**: The pure selector, candidate-aware workers, and transient index must be joined into one fail-closed semantic preparation unit before the host hook can use them.  
**Goal**: Given one selected immutable emergency window, run observer, reflector, and compactor through the exact fallback chain and return only a fully verified cumulative compaction, pending, and existing semantic records.

## Read

- `extensions/plastic-memory/compaction/emergency.ts` — selected window/transient unit contract and safe cut.
- `extensions/plastic-memory/compaction/engine.ts` — normal render/pending binding and acknowledgement invariants.
- `extensions/plastic-memory/compaction/extract.ts` — transient source facts adapter.
- `extensions/plastic-memory/workers/runner.ts` — exact candidate resolution/deadline mode.
- `extensions/plastic-memory/workers/observer.ts` — strict source-citation parser and pinned execution seam.
- `extensions/plastic-memory/workers/reflector.ts` — strict observation-citation parser and pinned execution seam.
- `extensions/plastic-memory/workers/compactor.ts` — portable prompt, candidate response validation, and normal compactor.
- `extensions/plastic-memory/session/cycles.ts` — immutable chunk partition and atomicity.
- `extensions/plastic-memory/session/render-summary.ts` — transient overlay index.
- `extensions/plastic-memory/compaction/render.ts` — code-owned cumulative state/details and verification.

## Change

- `extensions/plastic-memory/compaction/emergency.ts` — MODIFY — add abortable phase orchestration over the selected snapshot/chunks, exact candidate sequence, aggregate observer results, reflector, compactor, and typed success/failure result.
- `extensions/plastic-memory/compaction/engine.ts` — MODIFY — add an emergency-only finalizer that accepts verified transient facts/model response/index and constructs the existing cumulative render, cut digest, and pending identity without entering normal eligibility or creating a cycle record.
- `extensions/test/plastic-memory-emergency-pipeline.smoke.mjs` — CREATE — deterministic end-to-end semantic/fallback/deadline/no-persistence coverage.

## Proof

- **Semantic delta and anchors**: normal `runCompactor` first selects a six/four window and `prepareSemanticCompaction` then renders/binds pending. Emergency already has a verified cut, so only the render/bind portion is reusable. Existing observer/reflector parsers own code IDs/citations, and existing partitioning owns chunk atomicity.
- **Coverage receipt**: searched compaction render/pending construction, all semantic worker entry points, snapshot partition call sites, and summary-render call sites. **AFFECTED**: `emergency.ts`, the emergency finalization seam in `engine.ts`, and the new pipeline smoke. **UNAFFECTED**: `extract.ts`, runner/worker files, `cycles.ts`, `render-summary.ts`, `render.ts`, and `pending.ts` provide completed compatible APIs and require no edits here; scheduler/normal compactor remain separate. No local bridge candidate is unresolved.
- **Closure**: selected transient unit → immutable chunks → per-phase candidate attempts → strict outputs → overlay index → verified render/pending is owned here. The coordinator remains the sole side-effect owner; acknowledgement and generation state are unchanged at this checkpoint.
- **Checkpoint**: the exported pipeline is side-effect free with respect to the host. Success returns complete artifacts; every failure returns no pending/records. Normal engine and detached scheduler paths still pass their existing tests.
- **Acceptance path**: model traces prove CHANGE order and immutable phase inputs; rendered summary/details/pending are checked by existing engine verifiers. PRESERVE strict citations, code IDs, atomic chunking, scrubbing, and six/four behavior are exercised through existing tests. Oracles independently inspect custom record types and call payloads.
- **Counterexample pass**: accepting blank compactor output would expose the renderer’s deterministic fallback and fails the required non-empty semantic-summary assertion; appending during this function fails because the fixture provides no append API; retrying only the failed observer chunk fails the full candidate manifest trace.

## Contract

- Capture the selected source entries, partition, prior cumulative state, project snapshot, active memory IDs, and rendered index inputs once.
- For each observer candidate, process the entire ordered chunk list pinned to that model. On any chunk failure, discard that candidate’s observations and rerun the identical full list on the next candidate.
- Reflector and compactor each use the same Luna → Luna → Sonnet 5 → distinct visible-model sequence. Semantic parser/render rejection advances the candidate just like transport failure.
- Reflector keeps existing empty-observation behavior; compactor must still run and must return a non-empty validated summary. The emergency path may not use `Verified cumulative structured state.` or any other model-free prose as content.
- Use one caller-provided abort signal and a whole-pipeline deadline no greater than the existing 60,000 ms role maximum. Exhaustion returns a fixed scrubbed failure.
- Success returns only existing observation/reflection records (when non-empty), `RenderedCompaction`, and `PendingCompaction`; it returns no attempted/closed-cycle record and performs no append/stage itself.

## Acceptance

- [ ] Observer, reflector, and compactor each attempt Luna, Luna, Sonnet 5, then a distinct usable visible model until valid semantic success, with no extra call after success.
- [ ] Every retry for a phase receives immutable prompt/source/chunk/prior-state input; a later observer-chunk failure discards the whole candidate aggregate.
- [ ] Observer/reflection output uses code-owned `pm:o:`/`pm:r:` IDs and rejects every out-of-span/out-of-observation citation before compactor work continues.
- [ ] The verified summary includes the existing session index and `memory_recall` guidance, has cumulative Plastic details, and passes `verifyRenderedCompaction`.
- [ ] Blank/unstructured/identity-tampered compactor output advances fallback; complete exhaustion or deadline returns failure with no pending or returned records.
- [ ] Success returns only existing observation/reflection record types and a pending bound to the exact selected cut/prefix; no fake attempted/closed cycle exists.
- [ ] Normal compaction, worker-contract, chunking, transport, and summary tests remain green.

## Constraints

- Reuse the exact worker prompts/parsers and `renderVerifiedCompaction`; do not clone or weaken schemas for non-Luna models.
- Keep every diagnostic fixed/scrubbed and free of raw payload, PII, secrets, prompts, citations, or dynamic IDs.
- Keep project snapshot and prior state bounded by their existing validators.

## NOT TO DO

- Do not append to Pi, mutate the pending store, consume a pending, call `ctx.compact`, or rebase a generation.
- Do not create a deterministic/model-free emergency summary or accept blank compactor prose.
- Do not mix model outputs within one observer candidate, reuse partial observations after candidate failure, or regenerate selection/cut between attempts.
- Do not persist `plastic.cycle.attempted` or `plastic.cycle.closed` for the transient unit.
- Do not alter normal scheduler retry/queue behavior, config, schemas, dependencies, or files outside the write set.
- Return `BLOCKED` if existing strict renderer/pending invariants cannot represent the selected safe cut without weakening identity checks.

## Validation

- `node extensions/test/plastic-memory-emergency-pipeline.smoke.mjs` — full phase order, immutable chunks, semantic rejection fallback, deadline, IDs, summary, pending, and no-persistence assertions pass.
- `node extensions/test/plastic-memory-model-fallback.smoke.mjs` — exact candidate transport remains valid.
- `node extensions/test/plastic-memory-emergency-selection.smoke.mjs` — selected cut/cap remains valid.
- `node extensions/test/plastic-memory-emergency-summary.smoke.mjs` — transient index remains bounded.
- `for name in compaction worker-contract chunking transport-integrity; do node "extensions/test/plastic-memory-$name.smoke.mjs" || exit 1; done` — existing strict behavior passes in every named regression file.

## Stop If

- A non-Luna candidate requires a different prompt/schema or bypass of strict citations/state verification.
- The whole phase cannot be aborted through the supplied signal/deadline, or a timed-out attempt prevents deterministic cancellation.

## Checkpoint

- Recovery snapshot: required — snapshot `extensions/plastic-memory/compaction/emergency.ts` and `extensions/plastic-memory/compaction/engine.ts` under `.pi/build/recovery/task_04/` before editing; exclude it from the product commit.
- Commit scope: only `extensions/plastic-memory/compaction/emergency.ts`, `extensions/plastic-memory/compaction/engine.ts`, and `extensions/test/plastic-memory-emergency-pipeline.smoke.mjs`.
