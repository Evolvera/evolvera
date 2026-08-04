# TILL-DO: task_02_terminal_boundary

## Authority / baseline — PASS
- Authority: Task 02 repair request and `/Users/j.henrique/.pi/agent/.pi/plans/20260803_194012Z_plastic_memory/TASKS/task_02_builder.md`.
- Baseline inspected: `cycles.ts`, `bootstrap.ts`, smoke fixture, and Pi compaction/session evidence.
- Current defect confirmed: both cycle snapshot selection and bootstrap marker accept any assistant, including `toolCall` / `stopReason: "toolUse"` assistants.

## Contract / scope — PASS
- Modify only existing authorized paths: `extensions/plastic-memory/session/cycles.ts`, `extensions/plastic-memory/session/bootstrap.ts`, and `extensions/test/plastic-memory-session.smoke.mjs`.
- Preserve legacy, retry, coverage, retention, IDs, and existing behavior except terminal-boundary safety. No host/private mutation, types/ledger/retention/config/plan changes, dependencies, or commits.
- Terminal assistant must reject `toolCall` content parts and represented tool-use stop state; tool results are never boundaries. Later terminal assistant spans include the complete tool pair.

## Validation / resources — PASS
- Required commands are provider-free smoke and whitespace check only.
- Stateful resource receipt: `NO_STATEFUL_RESOURCES`; no host/session/settings/model/provider/database/filesystem state is started or mutated by the required validation.
- Static focused diff review will verify only the three authorized paths and preservation assertions.

## Recovery / stop gates — PASS
- Byte-for-byte pre-edit snapshots created for all three untracked targets under `.pi/recovery/task_02_terminal_boundary/before/`.
- Stop if safe boundary semantics require host/private mutation or nonlocal paths, or if tool-pair preservation cannot be proven locally.
- Do not commit.
