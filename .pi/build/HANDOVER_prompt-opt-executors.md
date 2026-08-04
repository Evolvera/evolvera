# Builder Handover — prompt-opt-executors

**Status**: COMPLETE
**Task**: Optimize active-model prompt bodies for core executor/scout agents and set scout `max_turns` to 25.

## Files Changed
- `agents/builder.md` — shortened GPT-5.6 outcome-first executor body; preserved mandatory lifecycle artifacts, recovery, diff review, routing, safety, and statuses.
- `agents/builder-heavy.md` — consolidated GPT-5.6 correctness/integration body; preserved shared-file safeguards, validation, recovery, handover, routing, and statuses.
- `agents/builder-highspeed.md` — action-first Codex Spark body with narrow discovery/step budgets and immediate verification; preserved recovery, artifacts, safety, routing, and statuses.
- `agents/scout.md` — shortened GPT-5.6 evidence-first read-only body and added exactly one `max_turns: 25` key.
- `agents/scout-highspeed.md` — action-first Codex Spark micro-scout body with two-round/eight-use/three-file limits; preserved read-only and report contracts.

## Validation
- `git diff --check -- agents/builder.md agents/builder-heavy.md agents/builder-highspeed.md agents/scout.md agents/scout-highspeed.md` — PASS.
- Byte comparison of frontmatter against recovery snapshots — PASS for all files; only `agents/scout.md` differs, by the appended `max_turns: 25` key.
- `grep -c '^max_turns: 25$' agents/scout.md` — `1`.
- Focused no-index diffs against recovery snapshots reviewed — no frontmatter churn beyond scout, no unrelated target-file changes, and required recovery/diff/read-only/status contracts retained.
- Home-agent status inspected only; no Home file was modified by this task. Existing Home-file worktree changes predated this task.

## Recovery Snapshots
- `.pi/recovery/prompt-opt-executors/before/agents/builder.md` — 257 lines, SHA-256 `ba0196e620f78063156feb5cc1f0c29c39990ec7e73f2b3ee01e0d1bbaa3aece`
- `.pi/recovery/prompt-opt-executors/before/agents/builder-heavy.md` — 134 lines, SHA-256 `0c1f44607729e21379d09ae146a24f3ba3f32e7a759afe89ec9d852f18776582`
- `.pi/recovery/prompt-opt-executors/before/agents/builder-highspeed.md` — 143 lines, SHA-256 `98bbd6e46a2e900e1e01fc731d1915db8c0b039d9dbfe1369b7b1a8e231c0b9e`
- `.pi/recovery/prompt-opt-executors/before/agents/scout.md` — 140 lines, SHA-256 `5f377abc963db0f7b9cf6516cb6cf44635be0454a8b873c9d02474d6fa583216`
- `.pi/recovery/prompt-opt-executors/before/agents/scout-highspeed.md` — 118 lines, SHA-256 `0953fef1c75fc2d107d427b8d5790ab8c3b48067cef56ff435d87807c774b1a1`

## Risks / Deviations
None. `scout-highspeed` retains its existing `max_turns: 18` because all non-scout frontmatter was required to remain byte-for-byte unchanged.
