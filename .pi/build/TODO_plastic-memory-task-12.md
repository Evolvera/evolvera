# TODO: plastic-memory-task-12

## Phase 1 — Baseline and contract
- Status: complete
- Authorized files/symbols: three dirty targets and recovery snapshots.
- Prerequisite: supplied Task 12 contract.
- Exit evidence: baseline hashes/diffs captured; snapshots exact; all TILL-DO gates PASS.

## Phase 2 — Source config cutover
- Status: complete
- Authorized files/symbols: `config/settings.json` packages, `observational-memory`, and `plastic-memory` namespace.
- Prerequisite: Phase 1 complete.
- Local exit evidence: JSON parses; smoke asserts exact four role/default blocks, budgets, and OM absence.

## Phase 3 — Installer staging order and ownership
- Status: complete
- Authorized files/symbols: config-copy, extension/resource staging, package anchors, final activation write in `install.sh` and `install.ps1`.
- Prerequisite: Phase 2 config contract.
- Local exit evidence: smoke proves recursive tree, flat bridge, no OM commands, final settings ordering, self-root guards, and Kimi/package anchors.

## Phase 4 — Disposable smoke validation
- Status: complete
- Authorized files/symbols: create `extensions/test/plastic-memory-install.smoke.mjs`.
- Prerequisite: Phases 2–3 complete.
- Local exit evidence: `node extensions/test/plastic-memory-install.smoke.mjs` PASS with temp/fake external staging, forced fault preservation, source==destination safety, ownership/resource checks, and static PowerShell parity.

## Phase 5 — Focused review and final validation
- Status: complete
- Authorized files/symbols: changed targets only; no additional product files.
- Prerequisite: Phase 4 complete.
- Local exit evidence: requested smoke, `bash -n`, grep, and diff-check commands PASS; recovery hashes and dirty anchors PASS; focused diff contains only contracted config/installer/test changes; no target files are staged. Windows execution remains UNVERIFIED.

Completed phase: Phases 1–5
Current phase: complete
Next phase: none
Changed files: `config/settings.json`, `install.sh`, `install.ps1`, `extensions/test/plastic-memory-install.smoke.mjs`, `.pi/recovery/plastic-memory-task-12/before/*`, `.pi/build/TILL-DO_plastic-memory-task-12.md`, `.pi/build/TODO_plastic-memory-task-12.md`
