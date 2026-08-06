# TILL-DO plastic-memory-reflector-prompt

- Authority/baseline: PASS — user contract names the exact write set and preservation rules; target and smoke test were read; both targets were dirty/untracked, so byte-preserving snapshots were created.
- Contract/scope: PASS — modify only reflector prompt text and extend the existing reflector smoke assertions; preserve all validators, scheduler behavior, ids, limits, records, and other files.
- Validation/resources: PASS — live proof is authorized for at most 4 provider calls, with session input read-only and harness output only under `/tmp/pm-obs/`; smoke loop is local and has no stateful resources.
- Recovery/stop: PASS — snapshots exist under `.pi/recovery/plastic-memory-reflector-prompt/before/`; stop if live output cannot satisfy the contract, cause is outside reflector prompt, or scope expands.
