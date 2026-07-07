Use `.pi/plans/20260619_231056Z_doc_only_low_risk_add_a_short_deprecated_legacy_note_at_the_/HANDOFF.md` as source of truth.

Write the plan ecosystem into `.pi/plans/20260619_231056Z_doc_only_low_risk_add_a_short_deprecated_legacy_note_at_the_`:
- PLAN_FULL.md
- SCHEDULE.md
- TASKS/task_NN_<agent>.md

Preserve repo-state hazards, dirty-file exclusions, recovery requirements, and checkpoint commit policy from HANDOFF.md. Route high-risk bounded tasks to builder-heavy. After writing files, respond with the plan dir and next command: /plan-heavy validate .pi/plans/20260619_231056Z_doc_only_low_risk_add_a_short_deprecated_legacy_note_at_the_.