# TILL-DO task_07

## Authority / baseline — PASS
- Authority: `.pi/plans/20260803_194012Z_plastic_memory/TASKS/task_07_builder.md` and `SCHEDULE.md`; dependencies Task 02 `fb50863`, Task 04 `16462c7`, Task 05 `57711ce` are complete.
- Baseline read: config, session cycle/ledger/bootstrap/types, bounded project context, compaction engine/render/extract/pending, OM observer/reflector/trigger precedents, Pi 0.83.0 registry/auth/abort APIs.
- Targets are new worker/test files; no recovery snapshot required.

## Contract / scope — PASS
- Create exactly five worker modules (`runner`, `observer`, `reflector`, `compactor`, `promoter`) and one scheduler plus the named worker smoke.
- Preserve existing session/bootstrap/cycle, project context, compaction engine, visible model, hooks, publication, and provider boundaries; no hooks/coordinator/context/settings/docs/plans changes.
- Four roles independently resolve only `openai-codex/gpt-5.6-luna`, medium, configured 8/4/60s; deterministic identity/coverage remains scheduler-owned.

## Validation / resources — PASS
- Validation commands are the exact Task 07 smoke plus existing session/compaction smokes and scoped `git diff --check`.
- All fixtures will use injected fake registry/auth/agent loop/model context; no auth files, provider/network, project/session settings, database, or shared state.
- Runtime proof is provider-free and in-memory (`NO_STATEFUL_RESOURCES`).

## Recovery / stop gates — PASS
- New files have no live state and are recoverable by selective deletion; no source snapshot required.
- Stop if Luna model/context/auth cannot resolve without visible selection, injectable timeout/abort cannot be proven, 100k cannot fit one bounded request, or implementation needs multipart/out-of-scope files.
- No source mutation occurs before all gates pass.
