# TILL-DO: task09_nonce_repair

- Authority/baseline: PASS — user repair contract and Task 09 targets read; only coordinator and integration smoke are source targets.
- Contract/scope: PASS — replace static internal compaction instructions with exact UUID-bound live intent encoding; preserve manual/native fallback and synchronous one-use latch.
- Validation/resources: PASS — requested smokes use in-memory/temp-only harnesses; user provides `NO_STATEFUL_RESOURCES`; scoped diff check required.
- Recovery/stop: PASS — no source snapshot required; targets are untracked task files and no destructive transformation is planned. Stop if hook does not expose exact customInstructions or native fallback cannot be preserved.
