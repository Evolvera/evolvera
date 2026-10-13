# Task11 — first native PASS of principal RPC matrix (2026-10-08)
Run kAo2Y7: NATURAL_EXIT_ZERO_NATIVE_PRINCIPAL_MATRIX_OBSERVED, 240.093s, exit 0, success-only teardown executed by harness.
Receipt task_11-model-idempotent-native-20261008T144012682538Z-receipt.json sha 5e2f1afde0b7a9aeb1194ee3d857af9c495b9c296b6c28015036933f9e93000e; first observation sha 0d5891825f7356b0cf9853485b3b7ec61da3c8ac4ac7d00f431dadf3d6b35dd1.
Certified (native SDK, synthetic users/provider): principal/pending/concurrent/refusal/success/three-users/selected-auth/fresh-session/relaunch-failure/explicit-recovery/two-terminal. Synthetic readiness matrix covered by helpers.
NOT certified: real SUB/Plastic root composition, exact nextTurn consumed-batch eligibility, interactive Windows TTY. Durability (fsync) untestable under Node Permission Model.
Fix chain since e761 (each gated independently, one run each):
- harness: "constants" builtin admitted (SDK graceful-fs);
- diagnostics (stdout tail, deny location, ERR_ACCESS_DENIED location);
- child exact-root recursive mkdir no-op;
- fsync no-op on owned fd (Node Permission Model disables fsync);
- fixture setModel only when the model differs.
- PRODUCT BUG FIXED: scripts/users/launcher.mjs read assertOwnedSession(...).existing (field is `exists`), so explicit origin recovery always refused.
Final harness ea2f09aefc25d8e1036cdfeb647fb1e573fcd6c78f2c1862699c5c0f6cfd01db; launcher fb60965f945e268c8634da689239975fcdfed56437475155eff93456406257ca.
Failed runs XjDbcb, nViBnQ, 8JZ8zJ, eSjGHb, gqmaSZ, wZsLwu, 7q6pJX are preserved and OFFLIMITS.
Task11 remains PARTIAL. Tasks12–15 are pending. /usuario is inactive, with no commit or merge.
