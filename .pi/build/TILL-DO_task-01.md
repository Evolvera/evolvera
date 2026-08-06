# TILL-DO task-01

## Authority / baseline gate — PASS
- Authority: approved plan schedule and `/Users/j.henrique/.pi/agent/.pi/plans/20260805_182432Z_plastic_memory_seamless_retention/TASKS/task_01_builder.md`; Task 01 is dependency-free and owns exactly eight Change targets.
- Baseline inspected: all named targets read; `engine.ts`, `coordinator.ts`, `compactor.ts`, and `plastic-memory-integration.smoke.mjs` are pre-existing dirty; `plastic-memory-acknowledge.smoke.mjs`, `plastic-memory-apply-cut.smoke.mjs`, and `plastic-memory-stride.smoke.mjs` are pre-existing untracked; `plastic-memory-compaction.smoke.mjs` was clean. No target content is to be replaced wholesale.
- Resume integrity: current eight-target bytes match the supplied partial patch (`git apply --reverse --check --directory=extensions` PASS); unexplained target drift is absent.
- Existing target baseline hashes captured before source mutation (see recovery directory and command receipt): engine `962ebb2ae7e3192819d57230b71c7b3f20361ab4978b8ff1d5d0c5dc6023e359`; coordinator `403713704707e2bd084ec333a2219b82f919614c6e77ebd944f942b4e2fdad5d`; compactor `0e67bc447afd53cfe2508176e6a39b8cb6a48b04e45c53ec8f9fe64a15da30d8`; compaction smoke `f001221eb2dad0c2d435897821f9e049867567773a5df0c054c1329747d82ffc`; stride smoke `58be8dde524c445847d2d6aa9d3ae73ed0d00164d127ff89647f4bc6f0346c0b`; apply smoke `de6e34f02b02856115eee94913a0980b586681808bdb6291b85be1ad5c3bc5bd`; acknowledge smoke `e149517ca7cc3efd1ef641220843bd8e8984093f4f8ae311774c6947994b6b22`; integration smoke `9d7eb1105f1131a47756880d25f157451bec541ebc7e31cb4a497be6b7070d52`.

## Contract / scope gate — PASS (reopened revised Task 01)
- Preserve the supplied partial delta and prior dirty repairs; repair only the exact eight Change targets. Add public-budget whole-cycle emergency retention, Plastic ownership independent of host advisory ordering, exact benign host-deferral retention, and actual native/unmatched boundary rebase/bootstrap.
- Preserve terminal/tool-use, source digest/ancestry, safe user cut, TTL, nonce/native fallback guards, projection, host-default behavior, `pending.ts`, `render.ts`, `scheduler.ts`, `cycles.ts`, settings/config, installed host files, and Task 02 worker retry/model behavior. No scope expansion.

## Validation / resources gate — PASS
- Read public host API evidence: nullable `ctx.getContextUsage()`, `ctx.isIdle()`, `ctx.hasPendingMessages()`, and `ctx.compact()`; no private host changes permitted.
- Declared validation is six Node smoke commands plus scoped `git diff --check`. Synthetic compaction/stride/apply/ack/session smokes use fake in-process callbacks and no provider/network/database/session state: `NO_STATEFUL_RESOURCES`.
- Integration smoke's only filesystem state is a unique `mkdtemp` OS-temp sandbox removed by the test; it is run-owned disposable with no fallback and will be rechecked immediately before execution as `DISPOSABLE_VERIFIED`. No real pi/provider calls or credentials.

## Recovery / stop gate — PASS (resume receipt)
- Supplied partial SHA-256 recomputed as `3cff8e488b2d9e9cccbd0c874fc2b69885c939e25518f175a1a18a78dbea4bfd`; reverse application against current files passes with `--directory=extensions`; current target hashes are recorded in `resume_before/`.
- Byte-for-byte current-target snapshots created at `.pi/recovery/20260805_182432Z_plastic_memory_seamless_retention/task_01/resume_before/<relative-path>`; original `before/` and partial patch remain untouched.
- Public root `estimateTokens` export, `ExtensionContext.getSystemPrompt/getContextUsage`, and lifecycle `fromExtension/session_compact` evidence verified. Declared synthetic smokes have `NO_STATEFUL_RESOURCES`; integration/host disposable sandbox proof is pending immediately before execution. Stop without mutation for private imports, schema/settings/write-set expansion, provider/credential/network access, or unproven state isolation. Builder will not stage or commit.

## Repair/resume gate — PASS
- Authority: user-directed repair to the same revised Task 01 and exact eight product targets; Task 02, staging, commits, Pi/provider execution, and credentials remain out of scope.
- Baseline: all eight current targets were byte-for-byte snapshotted under `task_01/repair_before/`; the supplied partial patch SHA remains `3cff8e488b2d9e9cccbd0c874fc2b69885c939e25518f175a1a18a78dbea4bfd`. The historical reverse-check command in the prior receipt used a stale partial-state assumption and is not reapplied to the already-completed revised delta; no target drift exists after the new snapshot.
- Contract: scan retained counts 4→0; preserve C6, safeCutEntry, acknowledged-prefix non-resend, one rolling summary, and fail closed for an unrepresentable zero-raw cut or an unfitting one-cycle suffix. Tests must prove 4→2 and impossible one-cycle fit.
- Validation/resources: seven declared Task 01 Node smokes are synthetic or run-owned disposable fake-host fixtures; no Pi/provider/network/credentials. Integration/host resource proof will be rechecked immediately before execution.
- Recovery/stop: original `before/`, `resume_before/`, and `task-01.delta.patch` remain immutable; final receipt/patch/SHA are additive or explicitly updated final artifacts. Stop for unsafe zero cut, schema/host/write-set expansion, stateful fallback, or any target drift.
