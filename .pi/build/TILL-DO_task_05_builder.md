# TILL-DO: task_05_builder

## Authority / baseline — PASS
- Authority: `/Users/j.henrique/.pi/agent/.pi/plans/20260806_195144Z_plastic_20k_queue_continuity/TASKS/task_05_builder.md` and relevant `PLAN_FULL.md` sections.
- Baseline: HEAD `d9824ec8ba3af00583e1136d62f3ebc0ca2d00b0`; installed package evidence is exact `@earendil-works/pi-coding-agent@0.83.0`.
- Verified live anchor count 1 and unpatched SHA-256 `aae8010f71636922729ad833127724d351b4883c67ad3065bfdc180a22da1ce0` (read-only; no live patch invocation).

## Contract / scope — PASS
- Authorized source write set: `scripts/patch-pi-083-threshold-cancel.mjs`, `scripts/test/patch-pi-083-threshold-cancel.smoke.mjs`, `install.sh`, `install.ps1`, `README.md`.
- Required behavior: exact version/package/path/cardinality/hash guards; atomic idempotent patch only for threshold cancellation; preserve overflow/manual/success paths; installers fail closed immediately after npm install; README documents compatibility, refusal, verification, live consequence, and rollback.
- Plastic source and global package are read-only/out of scope.

## Validation / resources — PASS
- Smoke may use exactly one unique run-owned OS temp fixture with synthetic contents; disposable proof is `DISPOSABLE_VERIFIED`, no egress, credentials, npm, global package, fallback root, or user state.
- Declared no-state validation: `bash -n install.sh`, optional PowerShell parse, `git diff --check` scoped to owned files.

## Recovery / stop gates — PASS
- Required byte-for-byte snapshots created for consequential/shared files:
  - `.pi/recovery/task_05_builder/before/install.sh`
  - `.pi/recovery/task_05_builder/before/install.ps1`
  - `.pi/recovery/task_05_builder/before/README.md`
- Stop without source mutation if exact anchor isolation, safe no-write refusal, fixture isolation, or declared scope cannot be proven. No installers/npm/live patch/reload/network/credentials.
