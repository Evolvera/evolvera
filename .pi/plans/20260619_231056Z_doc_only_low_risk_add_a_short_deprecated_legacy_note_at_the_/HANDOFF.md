# Planner Heavy Handoff

Generated: 2026-06-19T23:10:56.750Z
Plan Directory: `.pi/plans/20260619_231056Z_doc_only_low_risk_add_a_short_deprecated_legacy_note_at_the_`

<approved_goal>
Doc-only, low-risk: Add a short "Deprecated / Legacy" note at the very top of the BODY (immediately after the closing frontmatter `---`, before the first heading) of each of the 7 legacy phase agents: agents/deep-research-explorer.md, agents/deep-research-methodical.md, agents/deep-research-critical.md, agents/deep-research-creative.md, agents/deep-research-skeptical.md, agents/deep-research-auditor.md, agents/deep-research-finalizer.md. The note must state that the multi-agent deep research pipeline has been superseded by the single-agent Deep Search Master (agents/deep-search-master.md). HARD CONSTRAINTS: do NOT modify any YAML frontmatter, do NOT modify agents/deep-search-master.md, do NOT touch any other files, do NOT change existing body content other than inserting the note.
</approved_goal>

<repo_state>
- CWD: `/Users/j.henrique/.pi/agent`
- Branch: main
- Recent commits:
```text
97e670d feat: expose plan-heavy harness as agent tools
f435d26 chore: simplify deep search master agent
652996d chore: codify engineering principles in planning
f7dc374 chore: add plan-heavy execution envelopes
84afff1 chore: add plan-heavy harness
```
- Git status:
```text
CLEAN
```
</repo_state>

<dirty_files>
- Plan-owned dirty files: TO CLASSIFY BY ORCHESTRATOR/PLANNER
- Pre-existing dirty files NOT owned by this plan: TO CLASSIFY BEFORE COMMIT
- Unknown/dangerous dirty files:
  - None
</dirty_files>

<active_plan_state>
Existing plan files found:
```text
NONE
```
Completed tasks + checkpoint commits: TO VERIFY FROM EXISTING SCHEDULES IF CONTINUING WORK
Blocked/error tasks: TO VERIFY FROM EXISTING SCHEDULES IF CONTINUING WORK
Files touched by prior tasks: TO VERIFY FROM EXISTING SCHEDULES IF CONTINUING WORK
</active_plan_state>

<shared_file_hazards>
- None detected by harness. Planner should still verify target-file hazards from task context.
</shared_file_hazards>

<preservation_constraints>
- For every existing file that builders modify, create recovery snapshot before edit.
- For every large/shared file, identify markers/symbols/tests/helpers that must survive before editing.
- Do not include pre-existing dirty files in task commits unless explicitly owned by the plan.
</preservation_constraints>

<validation_and_checkpointing>
- Every MODIFY task requires recovery snapshot under `.pi/recovery/{task_id}/before/...`.
- Every task requires focused diff review before COMPLETE.
- Every verified task should be committed separately with selective staging only.
- SCHEDULE.md must record Recovery Snapshot and Checkpoint Commit per task.
</validation_and_checkpointing>

<stop_rules>
- Block if dirty-file ownership is ambiguous for files a task must touch.
- Block if a task would modify a large/shared file without preservation markers.
- Block if safe validation cannot be defined for a correctness-sensitive change.
- Route high-risk bounded tasks to builder-heavy.
</stop_rules>
