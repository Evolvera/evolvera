# Task 05: Deliver the guarded Pi 0.83.0 threshold-cancel patch

**Agent**: builder  
**Why**: Pi 0.83.0 returns before its existing queued-message continuation check when an extension cancels threshold compaction, and the extension API cannot continue the agent safely.  
**Goal**: Both installers run an idempotent version/anchor-hash-guarded patcher that changes only threshold cancellation continuity, proven entirely in a disposable fixture.

## Read

- `install.sh` — npm install ordering, `SCRIPT_DIR`, version override, and fail-fast behavior.
- `install.ps1` — Windows npm install ordering, script root, version override, and `$LASTEXITCODE` handling.
- `README.md` — baseline/version, installer behavior, compatibility, troubleshooting, and rollback sections.
- `/Users/j.henrique/npm-global/lib/node_modules/@earendil-works/pi-coding-agent/package.json` — READ ONLY evidence for exact package name/version; never modify or invoke the patcher on this root.
- `/Users/j.henrique/npm-global/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js` — READ ONLY evidence for the exact cancellation and successful queued-message anchors; never modify it.
- `scripts/test/install-wsl-keybindings.smoke.mjs` — established dependency-free Node/temp-fixture test style.

## Change

- `scripts/patch-pi-083-threshold-cancel.mjs` — CREATE — locate the npm global root portably by default and accept an explicit package-root only for fixture testing; verify exact package name/version, target path, exactly one known unpatched or patched anchor, and hardcoded SHA-256 anchor digest; replace only the cancellation return with `reason === "threshold" ? this.agent.hasQueuedMessages() : false`; write atomically, preserve mode, verify output, support idempotent success, and refuse every divergent state without writing.
- `scripts/test/patch-pi-083-threshold-cancel.smoke.mjs` — CREATE — build one unique run-owned OS temp package/file fixture and prove patch-once/idempotency, wrong package/version/hash, zero/multiple anchors, no-write refusals, threshold queued-state return, and unchanged overflow/manual/success controls.
- `install.sh` — MODIFY — invoke the repository patcher immediately after successful global npm installation and before declaring Pi installed; propagate incompatibility as installer failure.
- `install.ps1` — MODIFY — perform the same fail-closed invocation/order with PowerShell 5.1-compatible syntax and explicit exit-code handling.
- `README.md` — MODIFY — document exact 0.83.0 compatibility, why the one-line threshold patch exists, refusal behavior, fixture verification, live-application consequence, and rollback by reinstalling the exact package without running the harness patcher.

## Proof

- **Semantic delta and anchors**: installed 0.83.0 `_runAutoCompaction(reason, willRetry)` currently emits aborted `compaction_end` and returns `false` inside `if (extensionResult?.cancel)`; its successful non-retry path already returns `this.agent.hasQueuedMessages()`. `_runAutoCompaction` is used for threshold/overflow; manual compaction is a separate path.
- **Coverage receipt**: searched both installers' package install/version handling, repository `scripts/` conventions, README install/rollback guidance, installed package identity, the cancellation branch, successful auto return, and `_handlePostAgentRun` continuation evidence from the handoff. **AFFECTED**: the new patcher/smoke, both installer insertion points, and README compatibility/rollback text. **UNAFFECTED**: Plastic extension source, manual compact path, successful auto-compaction body, overflow failure behavior, package version/default, and other globally installed packages.
- **Closure**: exact 0.83.0 cancellation defect → one anchor replacement; package/file discovery and drift safety → patcher; cross-platform persistent delivery → installers; semantic/refusal/idempotency proof → temp smoke; user compatibility/rollback → README.
- **Checkpoint**: repository scripts and fixture semantics are complete without changing global npm state. Installer text calls the same tested patcher and fails before harness asset activation on an incompatible baseline.
- **Acceptance path**: synthetic 0.83.0 package → patcher package/version/hash/cardinality gate → atomic one-line replacement → imported/evaluated fixture behavior. Assertions compare full pre/post file bytes outside the anchor and explicit threshold/overflow/manual/success returns.
- **Counterexample pass**: matching a short `return false` could patch another branch or a future release. The patcher must hash the full exact cancellation anchor, require one occurrence, verify the exact patched anchor, and reject package/version drift.

## Acceptance

- [ ] Exact `@earendil-works/pi-coding-agent@0.83.0` unpatched fixture patches once; a second run is idempotent and changes no bytes.
- [ ] Wrong package name/version, wrong anchor hash, zero anchors, multiple anchors, mixed patched/unpatched anchors, or missing target refuses nonzero with byte-identical input.
- [ ] The replacement is confined to the extension-cancellation branch and returns queued-message state only when `reason === "threshold"`.
- [ ] Overflow cancellation remains `false`; manual fixture behavior and successful auto-compaction queued-message continuation remain byte/behavior unchanged.
- [ ] Both installers invoke the patcher immediately after npm install, propagate failure, and retain the 0.83.0 default and final settings activation order.
- [ ] The smoke uses only its unique temporary root and performs no npm install, network call, credential access, or read/write to the real global package.
- [ ] README states exact compatibility, refusal, consequential live application, verification, and rollback without claiming that the installed host was patched.

## Constraints

- Use only Node built-ins; no dependency or package-lock change.
- The test-only explicit package-root must be unambiguous and must never be used by installers.
- Error output may contain fixed package/version/path labels but no file payload, credentials, session data, or dynamic user content.
- Preserve file mode and write through a same-directory temporary file plus rename only after every guard passes.

## NOT TO DO

- Do not execute either installer, run npm, apply/check the patcher against the real global package, edit any file outside the repository, use network/provider state, or restart/reload Pi.
- Do not patch unknown versions/content, use a fuzzy regex, add a host fork, invent/append a continuation message, change overflow retry, touch manual/success paths, or create a generic patch framework.
- Do not change the package default/version override semantics except to fail closed when the selected install is incompatible with the required patch.
- Return `BLOCKED` if the exact anchor cannot isolate threshold from overflow/manual/success or if safe idempotent no-write refusal cannot be proven in the fixture.

## Validation

- `node scripts/test/patch-pi-083-threshold-cancel.smoke.mjs` — all semantic, hash/cardinality, no-write, installer-wiring, and temp-root assertions pass.
- `bash -n install.sh` — POSIX installer syntax is valid without executing it.
- `git diff --check -- scripts/patch-pi-083-threshold-cancel.mjs scripts/test/patch-pi-083-threshold-cancel.smoke.mjs install.sh install.ps1 README.md` — no whitespace errors.
- If `pwsh` is available, parse `install.ps1` without executing it; otherwise report that parser surface as `TO VERIFY`, not as a passed Windows runtime check.

## Stop If

- Patcher testing would resolve or write the actual npm global root, or a fixture cannot execute the exact patched branch semantics.
- Installer ordering would permit harness activation after a refused host baseline.

## Checkpoint

- Recovery snapshot: required for both consequential installers and the shared README before editing.
- Commit scope: `scripts/patch-pi-083-threshold-cancel.mjs`, `scripts/test/patch-pi-083-threshold-cancel.smoke.mjs`, `install.sh`, `install.ps1`, `README.md`.
