# Builder-heavy handover — flow-resume-hardening

Status: COMPLETE

## Changed files
- `skills/flow/SKILL.md`
- `skills/project-memory/SKILL.md`

## Outcome
- Added GitHub-first source precedence and mandatory remote-first re-entry.
- Added rebuildable `.pi/flow/<repo-slug>/STATE.md` and unified `ISSUES.md` schemas.
- Added deterministic claim, anomaly reconciliation, transition postconditions/recovery, PR/done verification, builder worktree transfer rules, cache update points, and resume report.
- Clarified in project-memory that `.pi/flow` owns Flow cache and GitHub overrides all local memory.

## Recovery
- `.pi/recovery/flow-resume-hardening/before/`
- Original manifest: flow 803 lines / `3344988a93cf089ad765476fb65600f7e3615ae0c2cd69415afeab7064b8ca86`; project-memory 258 lines / `61a4feaf0ea2c607cb3f646d388027749f6eb0c470e4ed28ec6b3505c7206471`.

## Validation
- `git diff --check -- skills/flow/SKILL.md skills/project-memory/SKILL.md` — PASS.
- `pi_validate_skill` for both skill directories — VALID.
- Frontmatter compared byte-for-byte for first four lines against snapshots — unchanged.
- Preservation markers passed: explicit OK gates, scouts by module, review gate, priority/effort, DoR, agent-guide, review approvals.
- Focused snapshot diffs reviewed; no force push, destructive reset, automatic merge, or remote branch deletion command introduced.
- Numstat: Flow `+184/-93`; project-memory `+3/-0`. Current line counts: Flow 894; project-memory 261.

## Side effects
- No GitHub action was performed.
- No mutating git command was performed.

## Unresolved risks
- None identified. Runtime Project field updates remain repository-specific and intentionally require configured Project metadata.
