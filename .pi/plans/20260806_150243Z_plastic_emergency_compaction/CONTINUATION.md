# Continuation — Plastic Emergency Compaction Ownership

**Status:** implementation and independent deterministic review complete at `d9824ec8ba3af00583e1136d62f3ebc0ca2d00b0`; live provider/host proof remains unverified.

## Delivered checkpoints

- `588ffcd` — model target runner: Luna → retry Luna → `anthropic/claude-sonnet-5` → distinct visible `ctx.model`.
- `d2867e2` — pure transient emergency selector; <=60% removable public context budget; preserve two newest closed cycles/open turn when representable.
- `d937a92` — bounded, scrubbed transient summary index overlay.
- `a7c4c56` — semantic emergency observer/reflector/compactor pipeline, strict validation, immutable fallback inputs, no fake cycle persistence.
- `c612987` — scheduler exclusive lease/abort-settle barrier and deferred reschedule.
- `d9824ec` — awaited `session_before_compact`, normal pending priority, inline emergency preparation/cancel, acknowledgement-before-rebase/bootstrap, and branch-local older-generation exact recall.

## Deterministic evidence

- Full `extensions/test/plastic-memory-*.smoke.mjs` suite: **27/27 PASS** at `d9824ec`.
- `git diff --check 1b14f5e..d9824ec`: PASS.
- Independent read-only validator: **PASS** against `1b14f5e..d9824ec`; it verified the Pi host awaits `session_before_compact`, appends the returned compaction, then awaits `session_compact`.

## Important preserved/changed behavior

- **Before → Now:** an enabled ordinary hook without a usable Plastic pending could return `undefined` and permit Pi native content. It now returns a verified Plastic compaction or `{ cancel: true }`; model exhaustion, timeout, stale branch, unsafe cut, and structural impossibility cancel and preserve raw context.
- Normal six-closed-cycle / retain-four policy remains normal-path policy. Emergency is transient and does not append `plastic.cycle.closed`.
- Emergency generation changes only after a host compaction match, a valid `plastic.compaction.applied` append, and visibility verification.

## Unverified live evidence

Do not state live success yet. The disposable campaign harness is `python3 /tmp/pm-apply.lVzCzO/drive.py /tmp/pm-<id>`; it invokes real `openai-codex/gpt-5.6-luna` calls using existing credentials. Its local session/log directory is disposable, but provider usage/billing/history is not a disposable uniquely-owned test resource. It therefore requires explicit user authorization under the stateful/external-resource gate.

Once authorized, run only a newly-created `/tmp/pm-<id>/sessions` harness and observe:
1. manual `/compact` under >20k host-prepared context but <6 closed cycles;
2. auto/overflow hook near the actual model context limit;
3. real provider fallback behavior if safe and intentionally induced;
4. raw tail/cut, `plastic.compaction.applied`, rebase/bootstrap, and next-cycle closure in the resulting disposable JSONL/TUI log.

Never use an existing user session directory, never run cleanup against a preexisting directory, and do not claim live provider/UX verification from the deterministic smokes.
