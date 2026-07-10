---
name: planner
description: Use the planner agent to create detailed implementation plans for complex multi-file features, bug fixes, or refactors. Do a lightweight pre-plan before activating planner so scope, success criteria, constraints, and validation are clear.
---

# Planner Skill — Implementation Plan Generator

> **⏱️ PLANNER IS EXPENSIVE BUT LEVERAGED**: The planner agent runs for **minutes** on a heavy model. Use it deliberately for complex/long-horizon work where one high-quality plan can save wall-clock time and cost by splitting execution across smaller, faster, cheaper builders. A wrong or vague prompt still wastes time and money, so do a lightweight pre-plan first — clarify outcome, success criteria, constraints, and validation before activating planner.

## Workflow: Pre-Plan → Review → Plan → Execute

For quick/simple planning requests, the **pre-plan is the plan**: write the concise Pre-Plan Summary directly for the user and stop there unless they explicitly ask for a full planner-generated plan ecosystem. Lightweight planning lives in this skill's pre-plan phase.

```
User Request
    │
    ▼
┌─────────────┐
│  PRE-PLAN   │ ← YOU do this. Fast, cheap, no agent.
│  (2-5 min)  │   Ask clarifying questions. Map scope. Decide path.
└──────┬──────┘
       │
       ├── Simple? (single file, <20 lines, no architecture) ──→ Direct builder
       │
       └── Complex/long-horizon? (multi-file, architecture, many tasks) ──→ Continue
              │
              ▼
       ┌─────────────┐
       │ USER REVIEW │ ← Show pre-plan summary. Ask: "Correct? Missing anything?"
       │  (1 min)    │   Get explicit approval before proceeding.
       └──────┬──────┘
              │ Approved?
         ┌────┴────┐
         │   YES   │  NO → Revise pre-plan, ask more questions
         ▼
    ┌─────────────┐
    │   PLANNER   │ ← NOW activate planner agent with crystal-clear prompt
    │  (minutes)  │   Include pre-plan summary + all context
    └──────┬──────┘
           │
           ▼
    ┌─────────────┐
    │ USER REVIEW │ ← Show PLAN_FULL.md summary. Ask: "Approve this plan?"
    │  (1 min)    │   Get explicit approval before spawning builders.
    └──────┬──────┘
           │ Approved?
      ┌────┴────┐
      │  YES    │  NO → Revise plan with planner or adjust manually
      ▼
   ┌────────────┐
   │  BUILDERS  │ ← Execute tasks from SCHEDULE.md
   └────────────┘
```

---

## Phase 1: PRE-PLAN (You Do This — No Agent)

### Goal
Understand the user's request deeply enough to either:
1. **Serve as the final lightweight plan** when the user wants a quick plan/pre-plan only
2. **Execute directly** (simple → builder or direct implementation)
3. **Feed an outcome-first prompt to the planner** (complex/long-horizon → planner agent)

When the user asks for a simple plan, quick fix plan, or "pre-plano", do not launch a planner agent by default. Produce the Pre-Plan Summary as the deliverable, mark `Path` as `Pre-plan only`, and ask whether they want to proceed to execution or upgrade to a full planner-generated plan.

Planner → Builders is the preferred path when a task is complex, spans many files, contains many subtasks, or can be parallelized. The planner spends heavier reasoning once to create `PLAN_FULL.md`, `SCHEDULE.md`, and atomic `TASKS/`; then smaller/faster/cheaper builders execute independent tasks in parallel while you orchestrate and verify.

Use `/plan-heavy` instead of direct planner activation when risk is high: dirty working tree, existing `.pi/plans`, shared/large files, preservation-critical tasks, math/science/algorithm correctness, long composed workflows, or recovery after a builder failure. `/plan-heavy` runs a 5-phase ensemble: (1) `plan_heavy_handoff` collects repo state into `HANDOFF.md` + `BRIEFS/` prompts; (2) immediately launch `plan-briefer` (GPT-5.6 Sol high) and `plan-briefer-fable` (Claude Fable 5 high) in parallel to write independent single-file strategy briefs; (3) `plan-brief-merger` (GPT-5.6 Terra high) reconciles them into `BRIEFS/brief_merged.md`; (4) `planner-heavy` (GPT-5.6 Sol xhigh) consumes the handoff + merged brief and writes `PLAN_FULL.md`/`SCHEDULE.md`/`TASKS/`; (5) `plan_heavy_validate` gates the plan and `plan_heavy_envelope` briefs each builder. Do not stop after handoff creation; the handoff is only phase 1 setup. If the Fable launch fails, stop and report the launch error instead of silently substituting another briefer. The ensemble merge happens at the prose/strategy level (safe), never at the DAG/task level; `planner-heavy` stays authoritative and grounds every concrete detail in the repo.

The pre-plan should define the destination, not over-prescribe every step. Capture: target outcome, success criteria, constraints, available context/evidence, validation, and stop conditions. Then build a Planner Handoff Pack so the planner sees the real operational state, not just the desired feature. Let the planner choose an efficient implementation path from that grounded handoff.


### Planner Handoff Pack (Mandatory Before Planner)

Before calling `Agent(subagent_type="planner")`, create a handoff with delimited sections. This is the planner's source of truth for operational state.

```markdown
<approved_goal>
[User-approved goal, scope, out-of-scope, success criteria]
</approved_goal>

<repo_state>
- Branch: [git branch]
- Recent commits: [last 3-5 hashes/messages]
- Git status: [verbatim `git status --short`]
- Dirty files owned by this plan: [files]
- Pre-existing dirty files NOT owned by this plan: [files that must not be staged/committed]
</repo_state>

<active_plan_state>
- Existing `.pi/plans` path: [if any]
- Completed tasks + checkpoint commits: [task -> commit]
- Blocked/error tasks: [task -> reason]
- Files touched by prior tasks: [file -> tasks]
</active_plan_state>

<shared_file_hazards>
[List any large/shared files, repeated target files, generated files, or test corpus files. Include current line counts and known markers that must survive.]
</shared_file_hazards>

<preservation_constraints>
- Markers/symbols/tests that must still exist after each task
- Public APIs/exports/contracts that must not change
- Files/directories builders must not touch
</preservation_constraints>

<validation_and_checkpointing>
- Validation commands/checks
- Recovery snapshot requirement for MODIFY files
- Selective checkpoint commit policy per verified task
</validation_and_checkpointing>

<stop_rules>
[When planner/builders must block instead of guessing]
</stop_rules>
```

Minimum commands to gather the pack when in a git repo:

```bash
git branch --show-current
git log --oneline -5
git status --short
find .pi/plans -maxdepth 3 -type f 2>/dev/null | sort
```

If the repo has dirty state, explicitly classify it before planner: plan-owned, pre-existing, unknown, or dangerous/shared. Unknown dirty files are hazards, not context to silently ignore.

### Pre-Plan Checklist

Before activating ANY agent, answer these:

| Question | Why It Matters |
|----------|----------------|
| **What exactly** should change? | Vague requests = bad plans. "Fix auth" ❌ → "JWT expiry should be 1h not 24h" ✅ |
| **Which files** are involved? | Even a guess helps. "Probably src/auth/" is better than nothing. |
| **What's the current behavior?** | Planner needs to know the starting point. |
| **What's the desired behavior?** | The "after" state must be crystal clear. |
| **Any constraints?** | Backward compat? Feature flag? DB migration? |
| **How to verify it works?** | Test plan, manual steps, expected output. |
| **What does success mean?** | Concrete acceptance criteria; what must be true before calling it done. |
| **What constraints matter?** | Policy, compatibility, performance, security, UX, migration, rollout. |
| **What evidence/context is available?** | Scout reports, files read, logs, docs, user constraints. |
| **When should we stop or ask?** | Stop when core request can be solved; ask only for missing info that materially changes the plan. |
| **What could go wrong?** | Edge cases, breaking changes, rollback needs. |

### Pre-Plan Output Format

Write a brief summary (5-15 lines) to show the user:

```markdown
## Pre-Plan Summary

**Goal**: [One sentence — what we're doing]
**Scope**: [In scope] / [Out of scope]
**Affected Areas**: [Files/modules likely touched]
**Success Criteria**: [Concrete done conditions / acceptance checks]
**Constraints**: [Compatibility, security, performance, UX, rollout, etc.]
**Available Context**: [Files/scout results/logs/docs already known]
**Approach**: [High-level strategy, not a rigid step list]
**Validation**: [Commands/checks/manual verification]
**Stop / Ask Rules**: [When to proceed, stop, or ask for missing info]
**Complexity**: [Low | Medium | High | Critical]
**Path**: [Direct execution | Planner → Builders]
**Open Questions**: [Only questions that materially affect the plan]
```

### Decision: Direct vs Planner

| If... | Then... |
|-------|---------|
| User asks for a quick/simple plan, quick fix plan, or pre-plano | **Pre-plan only** — The Pre-Plan Summary is the final plan unless the user asks to upgrade |
| Single file, <20 lines, no architecture impact | **Direct** — Use `read`/`edit` yourself or spawn builder directly |
| 2-5 files, straightforward changes, clear scope | **Direct** — Spawn builder with a detailed prompt |
| >5 files, architecture decisions, unclear scope, multiple scenarios | **Planner** — Do full pre-plan, get user approval, then activate planner |
| Long-horizon task, many related subtasks, or parallelizable backlog | **Planner → Builders** — Planner creates the schedule; builders execute independent tasks |
| Refactor, new feature, cross-cutting concern | **Planner** — Default unless the user asks for a quick direct patch |

---

## Phase 2: USER REVIEW

Show a concise pre-plan review before activating planner unless the user has already approved an equivalent scope explicitly in the current conversation. Ask only questions that materially affect the plan.

```
Here's what I understood:

**Goal**: Add OAuth 2.0 login with Google and GitHub
**Scope**: Backend API + frontend login buttons. NOT account linking.
**Files**: src/auth/, src/api/oauth.ts, src/components/Login.tsx
**Approach**: Add OAuth callback endpoints, create user if new, generate JWT
**Complexity**: Medium

❓ Is this correct? Anything missing or wrong?
```

Wait for explicit approval when scope, architecture, cost, or risk is non-trivial. "Looks good" / "Yes" / "Go ahead" counts as approval; silence does not.

---

## Phase 3: ACTIVATE PLANNER (Only After Approval)

### When to Use Planner Agent

Activate `Agent(subagent_type="planner")` ONLY when:
- Pre-plan is approved by user
- Complexity is Medium+ or involves multiple files
- Architecture decisions are needed
- You need the full plan ecosystem (PLAN_FULL.md + TASKS/ + SCHEDULE.md)

### How to Invoke

```
Agent({
  subagent_type: "planner",
  description: "Plan [brief title]",
  prompt: `PLANNER HANDOFF PACK (user-approved / current repo state):

[Paste the full delimited Planner Handoff Pack here]

SCOUT / EVIDENCE REPORTS:
[Scout results if available]

Generate a complete plan ecosystem in .pi/plans/. Keep PLAN_FULL authoritative, SCHEDULE compact, and each TASK file execution-focused. Preserve only task-relevant hazards/constraints in TASKS; do not repeat the whole handoff. Do not include TODO/TILL-DO templates or generic engineering boilerplate because builders/execution envelopes already own that process.`,
})
```

**The prompt MUST include:**
- ✅ The full Planner Handoff Pack with approved goal/scope
- ✅ Current repo state: branch, recent commits, verbatim `git status --short`
- ✅ Dirty-file classification: plan-owned vs pre-existing vs unknown/dangerous
- ✅ Existing plan/task state if continuing work: completed/blocked tasks and checkpoint commits
- ✅ Shared-file hazards: repeated target files, large test files, current line counts, preservation markers
- ✅ Outcome and success criteria
- ✅ Constraints and out-of-scope boundaries
- ✅ Available context/evidence: scout results, files read, logs, docs
- ✅ Any user clarifications
- ✅ Tech stack / constraints
- ✅ Validation commands/checks
- ✅ Recovery snapshot and checkpoint commit policy
- ✅ Stop conditions and missing-evidence behavior
- ✅ Task routing instructions: choose `builder-highspeed`, `builder`, `builder-design`, `builder-heavy`, `builder-ultra`, or `builder-heavy-design` for implementation; add a linked `validator` successor only for selected high-consequence/high-complexity tasks whose defects could escape builder checks.

### Planner Output

Planner generates:

```
.pi/plans/
├── PLAN_FULL.md          # Complete reference
├── SCHEDULE.md           # DAG + execution rules + Agent column
└── TASKS/
    ├── task_01_builder-highspeed.md  # highspeed sweet spot task
    ├── task_02_builder.md            # normal-risk general task
    ├── task_03_builder-design.md     # normal visual or semantic/declarative task
    ├── task_04_builder-heavy.md      # correctness-sensitive task
    ├── task_05_builder-ultra.md      # exceptional invariant/oracle-driven correctness task
    ├── task_06_builder-heavy-design.md # exceptional visual or complex semantic/declarative task
    ├── task_07_validator.md          # selective gate for one sensitive builder task
    └── ...
```

Planner must use the Builder Skill routing. For non-frontend tasks, GPT is the default; Fable requires an explicit positive semantic/declarative signal:
- `builder-highspeed`: single-file/module-local mechanical edits and explicit backend/tooling/tests/algorithm tasks. Frontend only for tiny exact token/class/text swaps.
- `builder`: normal-risk general implementation, bounded backend/tooling/tests, structured edits, non-design-led integration, and evidence collection.
- `builder-design`: normal Fable tier for components/layout/accessibility and bounded state/relation, policy/rule, selector, or reversible structural semantics.
- `builder-heavy`: complex procedural correctness/integration: API/SDK, streaming, serialization, module/cache/daemon lifecycle, migrations, cross-service behavior, auth/payment, shared files, frontend data flow, or evidence adjudication.
- `builder-ultra`: bounded non-frontend work only when concrete targets, a stated invariant/acceptance oracle, and exceptional-complexity evidence exist: formal proofs/invariants, numerical stability/error bounds, difficult physics/math/science, round-trip/diff/merge semantics, adversarial counterexamples, or reproducible heavy failure. Never select it for vague/unknown scope or a generic retry.
- `builder-heavy-design`: direct Fable/high tier for premium visual craft or complex grammar/template, state/relation, policy/selector, and declarative structure-preservation tasks.

For `builder-highspeed`, keep tasks under ~6 logical steps with explicit verification targets. For `builder-design`, provide grounded visual criteria or a clear normal-complexity semantic/declarative oracle. For `builder-heavy`, state the procedural/operational integration consequence. For `builder-ultra`, state the formal/numerical/scientific invariant/oracle and escalation evidence. For `builder-heavy-design`, provide either exceptional visual criteria or the complex state/relation/rule/grammar/structure semantics that make Fable/high the direct fit. Choose by problem shape, not frontend/backend labels; `SCHEDULE.md` must list the same agent.

### Selective Validator Tasks

The planner may route a task to `validator` only as an independent quality gate after a specific builder task. Add one when the producer changes auth/authorization, payments, secrets/privacy, destructive or irreversible data migration, public API compatibility, concurrency/idempotency, subtle algorithm/math behavior, critical cross-service integration, or broad/high-complexity user-visible behavior with meaningful regression risk. Treat `builder-heavy` as a reason to assess the need, not as an automatic validator requirement.

Do not add validator tasks for every builder, mechanical edits, docs-only changes, or low-risk work already covered by decisive focused checks. For each justified gate:
- create `TASKS/task_NN_validator.md` with `**Agent**: validator`;
- put the exact producer builder task in its `SCHEDULE.md` dependencies; downstream tasks that trust the change depend on the validator task;
- scope the brief to the producer checkpoint, exact changed files/behavior, risk hypothesis, required tests/diagnostics, and evidence for `PASS | BLOCKED`;
- default to review-only with `Files Touched: none`, `Recovery Snapshot: not required`, and `Checkpoint Commit: not required (quality gate)`;
- if `BLOCKED`, pause dependents, send findings back for a bounded builder repair, checkpoint that repair, and rerun the same validator task.

Only authorize validator-written tests or review artifacts when explicitly useful; then declare those files and use normal recovery/checkpoint rules. Do not pre-create speculative repair tasks.

### Compact Task Contract

Planner task files are execution briefs, not duplicated process docs:
- simple/create-only/evidence-doc: 25–60 lines;
- normal implementation: 40–90 lines;
- concrete contract/shared-file complexity: up to 140 lines when justified.

Required core: Agent/Why/Goal, Change, 3–7 Acceptance checks, Validation, Checkpoint. Add Read, Constraints, Stop If, or one detail section only when they materially change execution. For a validator task, `Change` states review-only/no production edits and the other sections define the exact checkpoint scope and verdict evidence. Omit TODO/TILL-DO templates, generic principle paragraphs, repeated context, dependency prose, and `N/A` fields. Builders generate lifecycle artifacts themselves; `/plan-heavy envelope` carries detailed recovery/checkpoint state. Add at most one optional detail section when it materially changes execution.

Every builder task, regardless of tier, must tell the builder what not to remove: existing public API, exports, handlers, tests, styles, auth/error paths, logging, or data flow that must be preserved. Include focused diff review as a success criterion so builders catch accidental deletions before reporting COMPLETE.

`SCHEDULE.md` must include recovery/checkpoint controls: a recovery snapshot requirement for tasks that modify existing files and a `Checkpoint Commit` column. The orchestrator should create one selective commit after each verified writing task, containing only that task's intended files and `.pi/build`/`.pi/recovery` artifacts. Review-only validator tasks complete by recording `PASS`; they do not create empty commits. Tasks that touch the same large shared file must run serially with checkpoint commits between them, not in parallel.

Implementation plans MUST include:
- requirements and where each is addressed
- named resources, files, APIs, or systems involved
- state transitions or data flow where relevant
- preservation constraints for existing behavior/API/tests/styles
- engineering constraints: SoC boundary, DYC needs, DRY/Rule-of-Three decision, KISS/YAGNI limits, and TDD/test-first expectation
- patch boundaries and forbidden edits for every MODIFY task
- preservation marker commands/greps for every shared or existing file
- recovery snapshot requirements for every MODIFY file
- validation commands or checks
- focused diff review requirements
- per-task checkpoint commit expectations
- failure behavior
- privacy and security considerations
- open questions that materially affect implementation

---

## Phase 4: PLAN REVIEW (Mandatory Before Builders)

After planner finishes, **review with user BEFORE spawning builders**:

```
Plan generated. Here's the summary:

**Tasks**: 5 tasks across 3 parallel groups
**Estimated files touched**: 8 files
**Critical path**: Group 1 (Auth setup) → Group 2 (UI + API) → Group 3 (Tests)
**Risks**: DB migration needed, breaking change to login API

❓ Approve this plan? I can also adjust specific tasks if needed.
```

**Wait for approval.** Only then execute agents per `SCHEDULE.md`. Generate an execution envelope before each `/plan-heavy` builder task and pass both the task file and envelope to the builder. After a sensitive builder checkpoint, run its linked validator task before any dependent work; `PASS` unlocks the DAG, while `BLOCKED` requires repair and revalidation. Commit each verified writing task separately with selective staging and record the commit hash; do not create empty commits for review-only gates.

---

## Anti-Patterns

| ❌ Wrong | ✅ Right |
|----------|----------|
| User says "fix auth" → immediately spawn planner | Ask: "What specifically about auth? Login error? Token expiry? Password reset?" |
| Planner returns plan → immediately spawn builders | Show plan summary, get user approval first |
| Running multiple builders on the same shared file | Serialize them and checkpoint-commit after each task |
| One task mixes evidence extraction, JSON artifacts, source edits, tests, and docs | Split by artifact class and validation boundary |
| One task updates several canonical data artifacts plus source/API in one commit | One task per artifact; the source/API edit is its own task |
| Two new-file tasks marked "disjoint" but both edit a shared registry (`mod.rs`, barrel `index.ts`, route table) | Centralize registrations in one wiring task, or serialize the new-file tasks — never parallel |
| Parallel "Safety" line lists only payload files | List the FULL file set per task (payload + registry/config) and assert disjointness over all of it |
| Builder allowed to run `cargo fmt`/`prettier --write .` | Patch boundary forbids repo-wide formatters; format only changed lines |
| Task lacks allowed edit anchors / forbidden edits | Add Patch Boundaries before spawning builder |
| Planner creates abstraction task for first/second duplicated pattern | Keep local duplication or require Rule-of-Three / architecture justification |
| Behavior-changing task has no test/validation expectation | Add TDD or closest-validation gate |
| Builder receives only task.md for a high-risk `/plan-heavy` task | Generate and pass an Execution Envelope first |
| Run planner without scout context | Send scouts first if codebase is unfamiliar |
| Run planner without repo-state handoff | Build the Planner Handoff Pack with git status, dirty-file classification, hazards, and checkpoints |
| Treat dirty working tree as implicit context | Classify dirty files explicitly; exclude pre-existing dirty files from task commits |
| Vague planner prompt: "plan auth fix" | Specific prompt: "JWT refresh fails after 1h. Need sliding refresh. Affecting src/auth/session.ts" |
| Skip user review when scope is uncertain or costly | A short review catches misalignment early |

---

## Summary

| Phase | Who | Cost | User Review? |
|-------|-----|------|--------------|
| **Pre-Plan** | You | Cheap / seconds | Show summary, ask approval |
| **Plan** | Planner agent | Expensive / minutes | Show plan summary, ask approval |
| **Execute** | Scheduled builders plus selective `validator` gates | Medium | Execute approved DAG, checkpoint writing tasks, and require `PASS` from linked sensitive gates |

**Rule: Review with the user at the points where approval affects cost, scope, or risk — usually after pre-plan and after the generated plan.**
