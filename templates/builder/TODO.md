# TODO — <task-id>

Mirror the task's `## Internal Execution Order` without adding scope. Create only after every TILL-DO gate is `PASS`. Update at coherent phase boundaries.

## Phase {phase-id}: {phase-name}

- Outcome: [bounded phase outcome]
- Primary authorized files/symbols: [exact targets]
- Material prerequisite: [evidence/dependency, or none]
- Local exit evidence: [observable check/result]
- Status: `pending | in_progress | complete | blocked`
- Changed files: [exact paths, or none]
- Notes/blocker: [concise factual state, if needed]

[Repeat the phase block for each ordered phase in the task.]

## Execution state / resume source

- Completed phase(s): [exact phase IDs/names, or none]
- Current phase: [exact phase ID/name, or none]
- Next phase: [exact phase ID/name, or none]
- Changed files across task: [exact paths, or none]
- Validation/evidence passed: [checks/results]
- Validation/evidence pending: [checks/results]
- Recovery root/snapshots: [paths or not required]
- Blocker/risk: [none or concise details]
- Overall status: `pending | in_progress | complete | blocked`

On resume, verify this file against repository status and focused diff evidence, then continue from the first incomplete phase. TILL-DO/TODO remain transient execution state and are excluded from the selective product commit unless explicitly tracked.
