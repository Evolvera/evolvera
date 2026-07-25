# TILL-DO — <task-id>

Readiness must be complete before creating `.pi/build/TODO_<task-id>.md` or mutating source. Record concise inspectable evidence, not private reasoning. Every gate must be `PASS`; any `BLOCKED` verdict ends execution with no source mutation and no TODO.

## 1. Authority / baseline — `PASS | BLOCKED`

- Exact task and authority: [task path/envelope and relevant contract]
- Owning repository/worktree: [resolved root and worktree/ownership evidence]
- Base/current SHA and status: [SHA; scoped status]
- Dependencies/checkpoints: [verdict and evidence]
- Pre-existing dirty exclusions: [paths that must remain untouched]
- Evidence: [reads/commands/results]

## 2. Contract / scope — `PASS | BLOCKED`

- Required outcome and acceptance: [concise contract]
- Authorized CREATE: [exact paths or none]
- Authorized MODIFY: [exact paths or none]
- READ-ONLY: [exact paths or none]
- Primary phase assignment: [target → ordered phase, where practical]
- Relationship/closure verdict: [no unresolved greppable relationship or undeclared required artifact]
- Evidence: [reads/searches/results]

## 3. Validation / resources — `PASS | BLOCKED`

- Exact validation commands: [commands]
- Resolved execution: [entrypoints, config, hooks, fixtures, fallbacks, teardown, credentials/egress where applicable]
- Resource verdict: `NO_STATEFUL_RESOURCES | DISPOSABLE_VERIFIED | BLOCKED`
- Resource evidence: [identities, isolation/ownership, fallback and teardown evidence, or why no stateful resources exist]

## 4. Recovery / stop — `PASS | BLOCKED`

- Recovery root/snapshots: [required paths and availability, or not required with reason]
- Approval/destructive boundaries: [known limits]
- Stop conditions/blockers: [none, or exact blocker]
- Evidence: [reads/commands/results]

## Readiness verdict

- Authority / baseline: `PASS | BLOCKED`
- Contract / scope: `PASS | BLOCKED`
- Validation / resources: `PASS | BLOCKED`
- Recovery / stop: `PASS | BLOCKED`
- Overall: `PASS | BLOCKED`
- Next action: [create TODO from ordered phases, or return BLOCKED without source mutation]
