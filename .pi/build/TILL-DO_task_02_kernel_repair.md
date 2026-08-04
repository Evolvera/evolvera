# TILL-DO task_02_kernel_repair

- Authority/baseline: PASS — user repair contract and committed Task 02 plan read; authorized source write set is ledger.ts and plastic-memory-session.smoke.mjs only. Existing targets are tracked and currently clean.
- Contract/scope: PASS — preserve historical-gap exclusion, branch-local ordering/fail-closed behavior, and all existing cycle/retry/terminal/retention coverage; add descendants after the bootstrap active boundary plus focused smoke cases.
- Validation/resources: PASS — requested smoke commands are provider-free/synthetic with `NO_STATEFUL_RESOURCES`; workers smoke is required regression coverage; diff check is static.
- Recovery/stop: PASS — shared/preservation-critical targets will receive byte-for-byte pre-edit snapshots; stop if branch/bootstrap data cannot distinguish valid descendants from historical/fork entries, or if required scope expands beyond the two authorized files.

Status: all gates PASS; proceed with snapshot, TODO phases, narrow implementation, validation, and focused diff review.
