# TILL-DO: plastic-memory-worker-contract

## Authority / baseline — PASS
- Authority: user task; exact write set is observer.ts, reflector.ts, and new worker-contract smoke test.
- Baseline: both workers currently emit underspecified JSON prompt `output` contracts; validators remain untouched and exact behavior is preserved.
- Existing target files are clean in git status; no pre-edit snapshot required.

## Contract / scope — PASS
- Change only prompt construction in observer and reflector; preserve exports, validators, limits, roles, ids, digests, scheduling, and record shapes.
- Prompts must include literal flat `expectedCoverageManifest`, exact item schemas, empty-array guidance, and JSON-only response guidance.
- New deterministic smoke test must exercise prompt parsing plus real worker validation for observer and reflector.

## Validation / resources — PASS
- Offline smoke tests are local deterministic Node/jiti tests with stub runtime; no stateful resources.
- Required live observer oracle uses existing `/tmp/pm-obs/harness.mjs`, reads `/tmp/pm-live/sessions/*.jsonl`, writes only `/tmp/pm-obs/`, and authorizes exactly one provider API call for observer; never run `pi` or print credentials.
- Full existing smoke loop is required; no database/server/shared-state resources are reachable.

## Recovery / stop gates — PASS
- Source mutation is limited to the declared three files; operational artifacts are under `.pi/build/`.
- Stop blocked if validator changes, out-of-scope edits, reflector schema contradiction, unsafe stateful resource, or model failure to satisfy the explicit contract occurs.
- Review exact diff and preserve byte-identical validator behavior before reporting completion.
