# TILL-DO: plastic-memory-task-12

## Authority / baseline — PASS
- Authority: Task 12 contract and acceptance in `.pi/plans/20260803_194012Z_plastic_memory/TASKS/task_12_builder.md`.
- Targets: `config/settings.json`, `install.sh`, `install.ps1`; create focused smoke test.
- Pre-edit hashes captured and match supplied baseline:
  - `config/settings.json`: `7735598ae2491cfa5e8219bd2b21fd2c64f318560f6fb6a317f2f2621e0f2561`
  - `install.sh`: `5f0fcd6ffaabc74cfbe6f91889eea77a9cd02c515f3a6b09269a92e8050d6d96`
  - `install.ps1`: `0d18a263d253e4d0c3252d6f3e2efe3956f873806dcb7853ee3f95e5756ba883`
- Exact snapshots: `.pi/recovery/plastic-memory-task-12/before/`.
- Existing unrelated dirty hunk anchors are identified and must remain byte-identical.

## Contract / scope — PASS
- Remove only configured OM package/namespace from source settings; add exact enabled plastic-memory config with four Luna-medium roles and config.ts defaults.
- Defer activating settings copy until after all resources/extensions are staged.
- Stage flat extensions plus recursive `extensions/plastic-memory/`; preserve unrelated packages/providers, including Windows Kimi; omit all OM install/remove/delete operations.
- Guard self-root staging from all self-copy/delete operations; no root active `settings.json` or runtime mutation.
- Write only authorized product files plus required transient build/recovery/test artifacts; no dependencies, manifests, cleanup, or formatting churn.

## Validation / resources — PASS
- Validation commands are static or run-owned disposable fixtures only: `node extensions/test/plastic-memory-install.smoke.mjs`, `bash -n install.sh`, focused grep/diff checks.
- Smoke fixture will use unique `mkdtempSync` source/destination/HOME roots, synthetic settings/resources, fake node/npm/pi/cp commands, and teardown only those roots.
- No real installer against real HOME, pi/npm package/reload/migration/provider/session/memory operation, network, or active runtime mutation.
- Stateful receipt: `DISPOSABLE_VERIFIED` for smoke-created temp roots; `NO_STATEFUL_RESOURCES` for syntax/grep/diff checks. Real Windows execution remains UNVERIFIED.

## Recovery / stop gates — PASS
- Recovery boundary is the exact pre-edit snapshots and baseline hashes above.
- Stop if snapshots cannot be verified, dirty hunks cannot remain exact/separable, self-root safety or complete-tree-before-settings order cannot be proven, or validation would touch non-disposable state.
- No source mutation occurred before these gates were recorded.
