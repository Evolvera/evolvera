# TODO: task_02_terminal_boundary

## Phase 1 — Inspect and baseline
- Status: complete
- Authorized files/symbols: `cycles.ts` terminal snapshot predicate; `bootstrap.ts` completed marker; smoke fixtures.
- Material prerequisite: Task 02 contract and Pi cut/turn evidence read.
- Exit evidence: assistant-only predicates found in both files; host evidence confirms `content.type === "toolCall"` and `stopReason: "toolUse"`; snapshots recorded.

## Phase 2 — Implement shared terminal-boundary predicate
- Status: complete
- Authorized files/symbols: `cycles.ts:isTerminalAssistantEntry`, `bootstrap.ts:lastAssistantId`.
- Material prerequisite: reuse one exported predicate so snapshot and bootstrap have identical semantics.
- Local exit evidence: exported `isTerminalAssistantEntry` rejects `content.type === "toolCall"` and `stopReason`/`stop_reason === "toolUse"`; bootstrap reuses it; no nonlocal changes.

## Phase 3 — Add focused provider-free fixtures
- Status: complete
- Authorized files/symbols: `plastic-memory-session.smoke.mjs` cycle/bootstrap fixtures.
- Material prerequisite: Phase 2 predicate exists.
- Local exit evidence: smoke fixtures prove negative trailing pair yields empty span/no bootstrap bound and later terminal yields one span containing user, tool call, result, and terminal; existing 7m/100k/retry/coverage/retention assertions retained.

## Phase 4 — Validate and review
- Status: complete
- Authorized files/symbols: all three target files (read/diff only).
- Material prerequisite: Phases 2–3 complete.
- Local exit evidence: `node extensions/test/plastic-memory-session.smoke.mjs` PASS; `git diff --check -- extensions/plastic-memory/session extensions/test/plastic-memory-session.smoke.mjs` PASS; focused snapshot diff contains only the terminal predicate, shared bootstrap use, and explicit fixtures.

## Execution receipt
- Completed phase: 4
- Current phase: none
- Next phase: none
- Changed files: `extensions/plastic-memory/session/cycles.ts`, `extensions/plastic-memory/session/bootstrap.ts`, `extensions/test/plastic-memory-session.smoke.mjs`
