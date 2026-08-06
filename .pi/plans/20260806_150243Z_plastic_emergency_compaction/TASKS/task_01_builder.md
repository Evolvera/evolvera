# Task 01: Add candidate-aware worker execution without changing normal Luna behavior

**Agent**: builder  
**Why**: Emergency phases need exact model selection, auth, timeout, and immutable retry support below the semantic parsers.  
**Goal**: Worker calls can be pinned to Luna, Sonnet 5, or a distinct visible model, while every existing normal caller retains its current Luna-only behavior.

## Read

- `extensions/plastic-memory/workers/runner.ts` — current Luna resolution, timeout, transport normalization, and diagnostics.
- `extensions/plastic-memory/runtime/runner-runtime.ts` — Pi registry/`complete` adapter currently reselects Luna.
- `extensions/plastic-memory/workers/observer.ts` — strict source-citation parser and runner call.
- `extensions/plastic-memory/workers/reflector.ts` — strict observation-citation parser and runner call.
- `extensions/plastic-memory/workers/compactor.ts` — portable compactor prompt and response boundary.
- `extensions/test/plastic-memory-workers.smoke.mjs` — current four-role Luna and runtime-adapter oracle.
- `extensions/test/plastic-memory-worker-contract.smoke.mjs` — strict semantic prompt/parser oracle.
- `extensions/test/plastic-memory-transport-integrity.smoke.mjs` — transport normalization and scrubbing oracle.
- `/Users/j.henrique/npm-global/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts` — read-only evidence for `ctx.model` provider/id/model shape.

## Change

- `extensions/plastic-memory/workers/runner.ts` — MODIFY — add an explicit model-target execution mode and emergency candidate construction: Luna, duplicate Luna retry, Sonnet 5, then a distinct valid visible model; allow a caller-supplied shorter remaining-time deadline without changing default role limits.
- `extensions/plastic-memory/runtime/runner-runtime.ts` — MODIFY — invoke the exact authenticated model supplied in runner config instead of hardcoding Luna inside the adapter.
- `extensions/plastic-memory/workers/observer.ts` — MODIFY — accept an optional exact model target/deadline and otherwise preserve the existing call contract.
- `extensions/plastic-memory/workers/reflector.ts` — MODIFY — accept the same optional execution target without changing empty-observation semantics.
- `extensions/plastic-memory/workers/compactor.ts` — MODIFY — expose/reuse one candidate-level compactor request/response path so emergency orchestration can reject invalid semantic output before advancing models; preserve normal `runCompactor`.
- `extensions/test/plastic-memory-model-fallback.smoke.mjs` — CREATE — deterministic registry/adapter/candidate-order coverage without network access.

## Proof

- **Semantic delta and anchors**: `runner.ts` currently resolves only `LUNA_PROVIDER/LUNA_MODEL`; `runner-runtime.ts` ignores `config.model` and finds Luna again. The three semantic workers all call that boundary.
- **Coverage receipt**: searched `extensions/plastic-memory/**/*.ts` for `runBoundedRole(` and runner/runtime imports. **AFFECTED**: `runner.ts`, `runner-runtime.ts`, `observer.ts`, `reflector.ts`, and `compactor.ts`. **UNAFFECTED**: `promoter.ts` remains on the default Luna path; `scheduler.ts` still owns normal retry/queue behavior; config, render, pending, and coordinator need no model-transport edits in this checkpoint. No unresolved local candidate remains.
- **Closure**: model identity → registry lookup/auth → exact model in adapter → unchanged normalized prompt/parser is owned here. Scheduler retry policy, semantic IDs, persistence, and coordinator state are unaffected. `ROLE_CONFIGS` and promoter behavior remain sufficient without edits.
- **Checkpoint**: after this task alone, no production caller opts into fallback. Existing worker behavior must therefore be byte/trace compatible, while the new smoke proves arbitrary exact targets and candidate ordering.
- **Acceptance path**: CHANGE is observed through an exact adapter call trace and immutable prompt captures. PRESERVE is observed by existing workers/contract/transport smokes, including one default Luna call, scrubbing, prompt caps, and stale aborts. Oracles compare explicit provider/id/model objects and captured prompt bytes rather than runner-returned labels.
- **Counterexample pass**: if the adapter still calls `find(LUNA_PROVIDER, LUNA_MODEL)`, a Sonnet/current-model test fails even if diagnostics claim fallback; if duplicate removal collapses the Luna retry, the exact call sequence fails.

## Contract

- Default worker execution remains one Luna attempt with `ROLE_CONFIGS[role]`; the scheduler still owns normal observer/reflector retry.
- Explicit execution resolves/authenticates the requested provider/id, validates its context window, and passes that exact model to the runtime.
- Candidate construction intentionally preserves the first two duplicate Luna entries, always includes Sonnet 5 once, and includes `ctx.model` only when provider/id are usable and differ from both.
- Prompt normalization occurs once; retries receive byte-equivalent prompt/system input and the same `inputTokens` value.
- Candidate failure diagnostics are fixed/scrubbed and never contain response payloads, credentials, PII, session IDs, citations, or arbitrary model output.

## Acceptance

- [ ] Default observer/reflector/compactor/promoter resolution and all `ROLE_CONFIGS` values remain Luna medium with the existing limits.
- [ ] Exact Luna, Sonnet 5, and distinct visible-model targets resolve their own model/auth and reach `complete` as the identical selected model object.
- [ ] Candidate order is Luna → Luna → `anthropic/claude-sonnet-5` → distinct visible model; success stops the sequence and an equal/invalid visible model is omitted.
- [ ] Timeout/abort of one explicit candidate returns a bounded failure that permits the caller to advance; caller-provided deadline cannot extend the existing role maximum.
- [ ] Every captured retry prompt is byte-equivalent and structured JSON parsing, strict response bounds, and prose scrubbing remain unchanged.
- [ ] Existing workers, worker-contract, and transport-integrity smokes pass without loosened assertions.

## Constraints

- Reuse the existing registry/auth and `complete` adapter; add no provider SDK or dependency.
- Keep model identity separate from semantic identity; models never own IDs, citations, cuts, pending state, or acknowledgement.
- Preserve the intentional no-cache worker execution and existing max output bound.

## NOT TO DO

- Do not switch the visible Pi session model, call the visible agent loop, or mutate `ctx.model`.
- Do not apply the fallback chain to normal scheduler calls or `project-promoter` in this checkpoint.
- Do not log raw model responses, prompts, auth values, dynamic session/citation IDs, or unsanitized errors.
- Do not alter config/settings, role prompt JSON contracts, schemas, dependency files, or files outside the declared write set.
- Do not use permissive `Proxy` registries or catch-all token/model maps in tests.
- Return `BLOCKED` if Pi’s registry/auth adapter cannot execute an exact supplied model without changing the visible session.

## Validation

- `node extensions/test/plastic-memory-model-fallback.smoke.mjs` — exact order, duplicate Luna retry, visible-model dedupe, immutable prompt, timeout, and adapter model identity pass.
- `node extensions/test/plastic-memory-workers.smoke.mjs` — normal four-role Luna behavior and adapter contract pass.
- `node extensions/test/plastic-memory-worker-contract.smoke.mjs` — strict portable semantic contracts pass.
- `node extensions/test/plastic-memory-transport-integrity.smoke.mjs` — transport normalization, scrubbing, and caps pass.

## Stop If

- The current Pi registry cannot resolve/authenticate `anthropic/claude-sonnet-5` or an exact `ctx.model` through the same provider-neutral adapter shape; report the missing API rather than hardcoding credentials or a provider client.
- Preserving default Luna behavior would require changing scheduler retry semantics.

## Checkpoint

- Recovery snapshot: required — snapshot the five existing owned source files under `.pi/build/recovery/task_01/` before editing; exclude it from the product commit.
- Commit scope: only `extensions/plastic-memory/workers/runner.ts`, `extensions/plastic-memory/runtime/runner-runtime.ts`, `extensions/plastic-memory/workers/observer.ts`, `extensions/plastic-memory/workers/reflector.ts`, `extensions/plastic-memory/workers/compactor.ts`, and `extensions/test/plastic-memory-model-fallback.smoke.mjs`.
