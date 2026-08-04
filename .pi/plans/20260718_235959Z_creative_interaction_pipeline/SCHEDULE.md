# Schedule — Designer-First Creative Interaction Pipeline

**Plan path**: `/Users/j.henrique/.pi/agent/.pi/plans/20260718_235959Z_creative_interaction_pipeline`  
**Generated**: 2026-07-22  
**Status**: planning

| ID | Task File | Agent | Depends | Write Set | Validation | Recovery | Status |
|---|---|---|---|---|---|---|---|
| 01 | `TASKS/task_01_builder-design.md` | `builder-design` | — | `skills/creative-toolkit/SKILL.md`; `skills/creative-toolkit/tool-index.json`; `skills/creative-toolkit/profiles/native-web-platform.md`; `skills/creative-toolkit/profiles/motion-react.md`; `skills/creative-toolkit/profiles/view-transitions-api.md`; `skills/creative-toolkit/profiles/gsap-scrolltrigger.md`; `skills/creative-toolkit/profiles/threejs-webgl.md`; `skills/creative-catalog/SKILL.md`; `skills/website-stack/SKILL.md` | Skill validation; JSON/profile closure; current Motion wording; recursive-copy simulation; environment discovery; focused diff/status | — | COMPLETE — `47178f4938b28a4981780768c15ef39120aa464a` |
| 02 | `TASKS/task_02_builder.md` | `builder` | 01 | `SYSTEM.md`; `config/SYSTEM.md`; `agents/website-creative.md`; `agents/website-designer.md`; `agents/website-home-designer.md`; `agents/website-home-planner.md`; `agents/seo-content-writer.md`; `agents/website-polisher.md`; `skills/website-pipeline/SKILL.md`; `skills/website-home-preview/SKILL.md`; `skills/design-catalog/SKILL.md`; recovery mirrors of those files under `.pi/recovery/creative-interaction-pipeline-task-02/before/` | Skill validation; paired-system `cmp`; stage/authority/consumer assertions; stale-order and guardrail grep; focused diff/status | Required | COMPLETE — `2e6149e040b1846746cf93f2741996834aea95e2` |

A task starts only when all dependencies are complete. For Task 02, the orchestrator must also record Task 01’s selective checkpoint hash. After each writing task passes validation and focused diff review, create one selective checkpoint commit containing only its owned source files and any tracked named recovery artifacts; record the hash here. Completion requires both writing checkpoints. No validator gate is added because these static prompt/skill changes have deterministic structural acceptance and no high-consequence runtime escape risk.

**Parallel groups**: none. The critical path is `01 → 02`; stage-order and authority edits are intentionally serialized behind the toolkit contract they reference.
