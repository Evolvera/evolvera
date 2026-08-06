# TODO: task_05_builder

## Phase 1 — Guarded patcher
- Status: `complete`
- Authorized files/symbols: `scripts/patch-pi-083-threshold-cancel.mjs`; exact package metadata, `dist/core/agent-session.js` cancellation anchor.
- Material prerequisite: TILL-DO gates PASS; anchor SHA and patched SHA recorded.
- Exit evidence: patcher resolves npm global `node_modules` to the exact scoped package directory by default, preserves explicit fixture root, and retains exact guards, atomic mode-preserving write, idempotency, and verification.

## Phase 2 — Disposable smoke
- Status: `complete`
- Authorized files/symbols: `scripts/test/patch-pi-083-threshold-cancel.smoke.mjs`; one unique temp fixture.
- Material prerequisite: Phase 1 patcher contract.
- Exit evidence: semantic patch/idempotency/refusal/cardinality/hash/control-path, injected default-root resolution, and installer wiring assertions pass without global access.

## Phase 3 — Installer wiring
- Status: `complete`
- Authorized files/symbols: `install.sh`, `install.ps1`; post-npm-install insertion only.
- Material prerequisite: patcher CLI contract and fail-closed ordering.
- Exit evidence: both invoke repository patcher immediately after successful npm install and before activation; exit failures propagate; defaults unchanged.

## Phase 4 — Documentation
- Status: `complete`
- Authorized files/symbols: `README.md`; compatibility/install/verification/rollback sections only.
- Material prerequisite: implemented patcher and installer behavior.
- Exit evidence: README states exact compatibility, refusal, fixture verification, live application consequence, and rollback.

## Phase 5 — Validation and diff review
- Status: `complete`
- Outcome: repaired disposable patch smoke, Node syntax checks, `bash -n`, and scoped whitespace checks passed; PowerShell parse remains `TO VERIFY` because `pwsh` is unavailable.
- Authorized files: all five owned source files for scoped validation only.
- Material prerequisite: phases 1–4 complete.
- Exit evidence: smoke, `bash -n`, optional PowerShell parse, and scoped `git diff --check`; no out-of-scope changes.

Completed: Phases 1–5; all runnable declared validation passed.
Current: complete
Next: none; orchestrator may review/commit the exact checkpoint
Changed files: `scripts/patch-pi-083-threshold-cancel.mjs`, `scripts/test/patch-pi-083-threshold-cancel.smoke.mjs`, `install.sh`, `install.ps1`, `README.md`
