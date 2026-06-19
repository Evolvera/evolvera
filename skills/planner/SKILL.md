---
name: planner
description: Use the planner agent to create detailed implementation plans for complex multi-file features, bug fixes, or refactors. Do a lightweight pre-plan before activating planner so scope, success criteria, constraints, and validation are clear.
---

# Planner Skill — Implementation Plan Generator

> **⏱️ PLANNER IS EXPENSIVE BUT LEVERAGED**: The planner agent runs for **minutes** on a heavy model. Use it deliberately for complex/long-horizon work where one high-quality plan can save wall-clock time and cost by splitting execution across smaller, faster, cheaper builders. A wrong or vague prompt still wastes time and money, so do a lightweight pre-plan first — clarify outcome, success criteria, constraints, and validation before activating planner.

## Workflow: Pre-Plan → Review → Plan → Execute

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
1. **Execute directly** (simple → builder or direct implementation)
2. **Feed an outcome-first prompt to the planner** (complex/long-horizon → planner agent)

Planner → Builders is the preferred path when a task is complex, spans many files, contains many subtasks, or can be parallelized. The planner spends heavier reasoning once to create `PLAN_FULL.md`, `SCHEDULE.md`, and atomic `TASKS/`; then smaller/faster/cheaper builders execute independent tasks in parallel while you orchestrate and verify.

The pre-plan should define the destination, not over-prescribe every step. Capture: target outcome, success criteria, constraints, available context/evidence, validation, and stop conditions. Then let the planner choose an efficient implementation path.

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
  prompt: "PRE-PLAN SUMMARY (user-approved):\n\n[Copy the approved pre-plan here]\n\nADDITIONAL CONTEXT:\n[Scout results if available]\n[User clarifications]\n[Tech stack details]\n\nGenerate a complete plan ecosystem in .pi/plans/"
})
```

**The prompt MUST include:**
- ✅ The approved pre-plan summary
- ✅ Outcome and success criteria
- ✅ Constraints and out-of-scope boundaries
- ✅ Available context/evidence: scout results, files read, logs, docs
- ✅ Any user clarifications
- ✅ Tech stack / constraints
- ✅ Validation commands/checks
- ✅ Stop conditions and missing-evidence behavior
- ✅ Builder routing instructions from `/skill:builder`: planner must choose `builder-highspeed` vs `builder` per task, write the chosen agent in `SCHEDULE.md`, and name task files accordingly (`task_01_builder-highspeed.md` or `task_02_builder.md`).

### Planner Output

Planner generates:

```
.pi/plans/
├── PLAN_FULL.md          # Complete reference
├── SCHEDULE.md           # DAG + execution rules + Agent column
└── TASKS/
    ├── task_01_builder-highspeed.md  # Spark sweet spot task
    ├── task_02_builder.md            # cautious Kimi task
    └── ...
```

Planner must use the Builder Skill routing:
- `builder-highspeed`: single-file edits, module-local changes, rapid prototypes, utility generation, function signature swaps, module-local renames, CSS tweaks, React component adjustments, layout experiments with existing constraints, explicit backend/tooling/tests/algorithm/math/physics tasks.
- `builder`: lower hallucination risk, multi-file integration, subtle behavior changes, long or exhaustive checklists, structured/stateful workflows, sensitive auth/payment/security code, final visual polish, brand/design decisions, ambiguous tasks.

For `builder-highspeed`, the planner must keep the task under ~6 logical implementation steps and list explicit symbol/API/package/endpoint verification targets so Spark cannot invent routine details. Each task file must include `**Agent**`, `**Why This Agent**`, `**Preservation Contract**`, and for Spark tasks `**Spark Budget**`. `SCHEDULE.md` must list the same agent so the orchestrator can spawn the correct subagent.

Every builder task, Kimi or Spark, must tell the builder what not to remove: existing public API, exports, handlers, tests, styles, auth/error paths, logging, or data flow that must be preserved. Include focused diff review as a success criterion so builders catch accidental deletions before reporting COMPLETE.

`SCHEDULE.md` must include recovery/checkpoint controls: a recovery snapshot requirement for tasks that modify existing files and a `Checkpoint Commit` column. The orchestrator should create one selective commit after each verified task, containing only that task's intended files and `.pi/build`/`.pi/recovery` artifacts. Tasks that touch the same large shared file must run serially with checkpoint commits between them, not in parallel.

Implementation plans MUST include:
- requirements and where each is addressed
- named resources, files, APIs, or systems involved
- state transitions or data flow where relevant
- preservation constraints for existing behavior/API/tests/styles
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

**Wait for approval.** Only then spawn builders per SCHEDULE.md. During execution, commit each verified task separately with selective staging and record the commit hash in the schedule before starting dependent tasks.

---

## Anti-Patterns

| ❌ Wrong | ✅ Right |
|----------|----------|
| User says "fix auth" → immediately spawn planner | Ask: "What specifically about auth? Login error? Token expiry? Password reset?" |
| Planner returns plan → immediately spawn builders | Show plan summary, get user approval first |
| Running multiple builders on the same shared file | Serialize them and checkpoint-commit after each task |
| Run planner without scout context | Send scouts first if codebase is unfamiliar |
| Vague planner prompt: "plan auth fix" | Specific prompt: "JWT refresh fails after 1h. Need sliding refresh. Affecting src/auth/session.ts" |
| Skip user review when scope is uncertain or costly | A short review catches misalignment early |

---

## Summary

| Phase | Who | Cost | User Review? |
|-------|-----|------|--------------|
| **Pre-Plan** | You | Cheap / seconds | Show summary, ask approval |
| **Plan** | Planner agent | Expensive / minutes | Show plan summary, ask approval |
| **Execute** | Builder agents (`builder-highspeed` or `builder` per SCHEDULE) | Medium | Execute approved plan, verify diff, commit each task checkpoint |

**Rule: Review with the user at the points where approval affects cost, scope, or risk — usually after pre-plan and after the generated plan.**
