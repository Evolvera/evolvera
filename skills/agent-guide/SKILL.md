---
name: agent-guide
description: Mandatory pre-flight skill. Load BEFORE using scout, planner, builder, or qa. Contains the complete playbook for delegating work to subagents correctly. Do not use subagents without reading this first.
---

# Agent Guide — How to Use Subagents

> **LOAD THIS SKILL FIRST** before using `scout`, `planner`, `builder`, or `qa`.
> Using subagents without these instructions causes context overload, poor results, and wasted tokens.

## Runtime Identity

Every custom agent must declare explicit `model:` and `thinking:` frontmatter. Its `display_name` must end with `· <Model Label> · <thinking>` so the initial Agent launch line visibly identifies the effective model and reasoning effort. Keep all three synchronized when changing routing. Agents using `model: inherit` display `inherit` plus their explicit effort.

## Economic Mindset

`scout` and `builder` run on delegated models. There are now two speed tiers:

| Tier | Agents | Model | Best For | Avoid |
|---|---|---|---|---|
| Default | `scout`, `builder` | Standard general tier | **default for ~90% of bounded local work**: code, APIs, tests, config, auth/payment behavior, migrations, shared files, and multi-file changes with clear acceptance | relation/rule/declarative semantic modeling, visual judgment, or an explicitly external/exceptional runtime operation |
| Design | `builder-design` | Normal design tier (Claude Opus 5 medium) | frontend/UI implementation plus bounded normal-complexity state/relation, policy/rule, selector, and reversible structural semantics | procedural API/streaming/lifecycle integration, correctness-heavy operational work, formal/numerical work, advanced visual spectacle |
| Light | `builder-light` | Routine general tier (GPT-5.6 Luna medium) | routine bounded work whose correctness is locally decidable: clear anchor, established pattern, exact validation — mechanical/multi-spot edits, utilities, tests, tooling, pattern-following endpoints, config, reproduced bug fixes | anything whose correctness depends on implicit cross-module contracts, subtle state/lifecycle/concurrency, serialization compatibility, or ambiguity — there a plausible-but-wrong result passes shallow validation; UI beyond exact token/class/text swaps |
| Heavy | `builder-heavy` | Exceptional operational/correctness tier (GPT-5.6 Terra xhigh) | host/SSH/deploy/network/provider/reload/rollback work, concrete coordination across multiple live runtime/service/lifecycle boundaries, or bounded non-frontend work with a stated invariant/oracle and demonstrated exceptional formal/numerical/scientific difficulty | ordinary local code, auth/payment, migration, config, shared files, multi-file changes, broad planning, or vague scope |
| Heavy Design | `builder-heavy-design` | Exceptional design tier (Claude Opus 5 high) | exceptional visual work or direct complex semantic/declarative work: state/relation models, policy/selector composition, grammar/template reconstruction, and structure-preserving transformations | procedural API/streaming/lifecycle/serialization integration, auth/payment, migrations, formal/numerical/scientific work, tiny edits, or vague scope |
| QA | `qa` | Dedicated evidence tier (GPT-5.6 Sol high) | fresh SHA-bound post-build behavioral evidence at exactly `CORE` or `FULL`; default source-read-only | implementation/repair, direct static closure, live/external operations, or a third QA level |

**Implication:** The more you **break down** a question into small, parallel sub-tasks, the better your results:
- **Lower total token cost** — many tiny scouts/builders cost less than one giant monolithic run
- **Faster wall-clock time** — independent agents run in parallel
- **Higher per-agent quality** — each agent gets a crisp, bounded question it can actually answer well
- **Easier to verify** — small outputs/diffs are simpler to audit and merge

**Commit-forecast rule of thumb:** Before focused implementation, estimate coherent selective commits (one outcome/write set/validation/rollback each). One goes direct; 2–5 clear units can use focused builders; more than ~5 is a strong planner signal because it can optimize dependencies and safe SoC parallelism once instead of discovering them serially. This is a heuristic, not a cap: coordination uncertainty, shared contracts, or architecture can justify planner earlier; mechanically related edits can stay one commit.

**Bundled-request fast path:** Multiple requests in one user message are not a planner trigger. Internally list each outcome, likely target/write set, dependency, validation resource, and rollback boundary. Build a small mental DAG: launch units with disjoint write sets and non-conflicting validation resources together; run dependent/shared-file/external-effect units in later waves. If that schedule is grounded and bounded, use focused multi-builder orchestration without plan artifacts. Escalate only when the schedule cannot be trusted because of architectural uncertainty, substantial coupling, unclear ownership, or long-horizon coordination. Keep this decomposition private unless the user needs it to make a scope decision.

**Long-horizon rule of thumb:** When planner is selected, it spends the expensive reasoning once, writes `SCHEDULE.md` and atomic task files, and you run only genuinely independent builders in parallel. The desired outcome is lower elapsed delivery time and less rework—not a larger task graph.

## Orchestrator Change-Contract Gate

Before any mutation—direct orchestrator edit/command, delegated builder, planner-driven execution, repair, migration, config, or external operation—the orchestrator owns reconciliation. Scouts collect evidence; planners decompose; builders execute; validators review. None may decide readiness or unresolved product meaning for the orchestrator.

Use the smallest sufficient contract:

- exact trivial/known change: the user request plus focused repository read may be an implicit contract; no artifact or scout ceremony;
- nontrivial/unfamiliar/cross-cutting/ambiguous change: orient from bounded structure, gather proportional direct/scout evidence, then state outcome, affected capabilities, `PRESERVE | CHANGE | REMOVE` boundary, scope, acceptance, and conflicts before writing/delegating;
- evidence reveals two behavior-changing interpretations: stop and ask the smallest user decision before mutation.

Evidence depth and solution complexity are separate. Let scouts gather enough evidence for the real system, including exhaustive coverage when the mission requires it. Orchestrator must reconcile that evidence into a compact contract; planner/builders must not convert every discovered risk, module, or possibility into a task or mechanism. More context should reduce guessing, not enlarge approved implementation.

## Handoff Standard (all delegations)

A subagent starts with zero context: it has not seen the conversation, the user's intent, or your prior findings. Whatever you omit, it will guess—and confident guesses are how subagents "fazem besteira". Every delegated prompt, for any agent type, must carry the orchestrator's reconciled contract at proportional detail and contain:

1. **Outcome + why** — what done looks like and the purpose behind it, plus affected existing capabilities and their `PRESERVE | CHANGE | REMOVE` boundary when behavior can change.
2. **Exact inputs** — absolute paths, symbols, line ranges, artifacts to READ first; include decisions/evidence already established in the conversation that the agent needs. When `.pi/memory/` holds a lesson about this exact surface or operation (deploy sequence, known bug, prior failure), quote that specific entry—heavy/highspeed/ultra tiers, validator, and planners receive no automatic memory injection, and the full summary is noise.
3. **Exact write set** — files it may CREATE/MODIFY; everything else is untouchable by default. For nontrivial semantic changes, derive it from a compact coverage receipt—semantic anchors, searched relationship paths/scope, discovered candidates and their evidence-backed disposition—not from a confident completeness label.
4. **Scope fence** — what is explicitly out of scope: no adjacent improvements, no dependency additions, no formatting churn, no touching plans/config/registries unless named.
5. **Conventions** — patterns/helpers/tokens to follow, with a file to imitate when one exists.
6. **Acceptance + validation** — observable criteria and exact commands; for behavior changes, the runtime evidence expected, not just compile checks. For any command that may start application code or touch a database/schema, filesystem, bucket, queue/topic, cache, search index, emulator/device state, or external service, include `STATEFUL RESOURCE PROOF`: resolved command/config/hooks, sanitized identities, `NO_STATEFUL_RESOURCES` or all-`DISPOSABLE_VERIFIED`, unique run ownership, synthetic data, no fallback, destructive-hook confinement, egress/credentials, teardown, and protected-resource postcheck. `localhost`, `.env.test`, `NODE_ENV=test`, Docker, a `test` name, transactions, or backup are not proof; absent/unknown proof means do not execute.
7. **Stop rules** — when to return BLOCKED instead of improvising: missing files, failed assumptions, conflicting evidence, required scope expansion, or unproven stateful-resource isolation. On suspected mutation, stop; never retry/restore/reseed without explicit authorization.
8. **Consequential operations** — include the Consequential Action Gate and an exact action manifest for any operation that can destroy, irreversibly mutate, or make `NONDISPOSABLE` state unreachable. The manifest names the action, target, method, semantic identity/blast-radius evidence, effect semantics, irreversibility, recovery artifact/independence, and approval boundary. Require fresh confirmation after evidence, one irreversible effect per tool call, failure freeze, and read-only incident diagnosis; never let a delegated agent infer cleanup authority or use delete/unregister as move/transfer. Require a fresh read-only review of the exact manifest when it can catch alias/cascade risk.

Before launching, reread the prompt as if you were the subagent: can you execute it without asking anything and without inventing anything? If not, fix the prompt or gather evidence first. Terse command-style prompts produce shallow, generic work; a paragraph of grounded context is cheaper than one wrong diff.

**Builder internal order and resume:** A prompt containing `## Internal Execution Order` must require the builder, before any source edit, to fill `.pi/build/TILL-DO_<task-id>.md` with concise evidence and `PASS | BLOCKED` verdicts for authority/baseline, contract/scope, validation/resources, and recovery/stop. Only all `PASS` permits `.pi/build/TODO_<task-id>.md`, mirrored from the phases; any blocked gate ends `BLOCKED` with no source mutation and no TODO. The builder updates phase outcome, authorized targets, prerequisite, exit evidence, status, completed/current/next phase, and changed files at coherent boundaries; resume verifies these against repo/diff evidence and continues from the first incomplete phase. Without explicit internal order or another lifecycle requirement, simple tasks create neither artifact. TILL-DO/TODO are transient task-local execution state, not tasks, IDs, DAG nodes, commits, checkpoints, validity boundaries, Flow/GitHub state, or parallel authorization, and stay out of the selective product commit unless explicitly tracked. Newly exposed undeclared scope remains `BLOCKED` before mutation.

**Scout rule of thumb:** If a scout prompt feels like it is asking for "understand everything about X", first decide whether decomposition preserves quality. If yes, split it into independent scoped `scout` missions and run them in parallel. If splitting would lose cross-file coherence, use one coherent `scout`. While scouts run, keep doing useful direct inspection instead of waiting idly.

---

## scout — Investigation & Evidence Gathering

**What it does:**  
Read-only exploration. It reads files, greps, finds patterns, maps dependencies, analyzes logs, and returns a structured evidence report. It NEVER modifies code.

**When to use:**
- You don't fully understand the system, bug, or feature
- You need root cause analysis
- You need to trace data flow, function calls, or module relationships
- The user mentions errors, logs, or symptoms without clear source
- Manual exploration keeps expanding without answering the question — delegate to scout (known targets stay direct)

**How to use:**
```
Agent({
  subagent_type: "scout",
  description: "Investigate auth bug",
  prompt: "Find why JWT validation fails for admin users. Check src/auth/, src/middleware/, and any recent commits. Return exact file paths, line numbers, and the root cause."
})
```

**Rules:**
- Keep each scout on one coherent mission; split genuinely independent angles into parallel scoped scouts and synthesize the evidence yourself.
- Use one coherent `scout` when exhaustive coverage, contradiction resolution, or large-context coherence matters; fragmented independent reports can miss cross-file contradictions.
- Do not use scouts for frontend design critique or visual polish; use website/design agents instead.
- Give scout a **clear question**, not vague tasks.
- Tell it **where to look** (directories, file patterns).
- Ask for **exact file paths and line numbers**.
- **Prefer many small parallel scouts over one big scout.** If your question has multiple independent angles (e.g. "How does auth work?" + "How does billing work?"), launch separate scouts in parallel instead of cramming everything into one prompt.
- **Do useful parent work while scouts run**: read high-signal files, grep exact symbols, inspect tests/config/logs, and build hypotheses to validate against scout reports.

---

## planner — Architecture & Task Breakdown

**What it does:**  
Creates detailed implementation plans. It analyzes requirements, designs architecture, splits work into atomic tasks, and generates `PLAN_FULL.md` + `SCHEDULE.md` + `TASKS/`.

**When to use:**
- Real coordination complexity: multiple dependent concerns, unclear sequencing, or shared ownership — not mere file count
- You need architecture decisions or new patterns
- Scope is unclear — you don't know all files involved
- User asks for a new feature without implementation details
- Long-horizon work is ahead: many related tasks, phased delivery, or parallelizable implementation work

**How to use:**
```
# Step 1: Orient before deciding what to investigate
For nontrivial/unfamiliar systems, inspect bounded file/source structure first.
Map product roots and likely domain/test/config/docs surfaces without inferring behavior.

# Step 2: Gather proportional evidence
Known exact surface: focused direct reads.
Normal multi-layer work: one bounded scout.
Large separable system: parallel scoped scouts, then reconcile.
Coherent end-to-end flow: one normal scout, not fragmented micro-reports.
Label findings KNOWN / INFERRED / UNKNOWN.

# Step 3: Reconcile one planning contract
User outcome + existing capabilities + PRESERVE/CHANGE/REMOVE + scope
+ material term meanings + acceptance journeys + unresolved conflicts.
Ask only when a conflict changes product behavior.

# Step 4: Run planner only after contract and evidence are closed enough
# that planner need not rediscover architecture or choose product semantics.
Agent({
  subagent_type: "planner",
  description: "Plan payment integration",
  prompt: "PROJECT_ROOT: /absolute/project/root\nPLAN_DIR: /absolute/project/root/.pi/plans/20260710_120000Z_stripe_checkout\nCreate the approved Stripe checkout plan: single payment, no subscriptions, webhook confirmation. Read relevant code under PROJECT_ROOT/src/payments/. Write only inside PLAN_DIR."
})

# Step 3: Read generated files
read({ path: ".pi/plans/SCHEDULE.md" })
read({ path: ".pi/plans/PLAN_FULL.md" })
```

**Rules:**
- Do a lightweight pre-plan before planner — get user approval when scope/cost/risk is non-trivial.
- For every full planner run, gather enough direct/scout evidence that the planner receives exact paths/symbols, architecture/data contracts, existing capabilities, semantic relationships, validation behavior, and bounded unknowns. Any claim that affected-artifact coverage is complete must carry semantic anchors, searched relationship paths/scope, discovered candidates, evidence-backed dispositions, and unresolved candidates. Familiarity, names, and a scout `COMPLETE` label alone are not evidence.
- For nontrivial/unfamiliar systems, structure comes first: inspect bounded roots/file families before deep reads so scout missions follow the repository rather than assumptions.
- Scale scouting to the system: no ceremonial scout for an already grounded exact surface; one coherent scout for normal work; parallel micro-scouts for genuinely independent domains in a large repository; normal scout synthesis when cross-domain contradictions or one end-to-end state model matter.
- Reconcile reports into a concise contract and evidence package. Classify claims `KNOWN | INFERRED | UNKNOWN`; classify affected capabilities `PRESERVE | CHANGE | REMOVE` only when user intent/evidence supports it. Never paste raw transcripts or ask planner to “understand the repository.”
- If two plausible interpretations would preserve versus disable different behavior, stop and ask the user before planner. If broad discovery or product-semantic choice remains, pre-plan is not complete.
- Planner is **expensive** — don't run it for trivial tasks
- Read `SCHEDULE.md` and `TASKS/` before spawning agents. Reject the ecosystem if a task's acceptance or deterministic gate needs an undeclared artifact, unresolved relationship, or later task to restore validity; require an evidenced compatible transition or one coherent checkpoint.
- Builders own focused validation. Add a separate `validator` task only when one named high-consequence defect could credibly escape builder checks and must gate dependents; do not add it after every builder or duplicate the final PR review

---

## builder — Focused Execution

**What it does:**  
Implements one coherent bounded change. File count does not define complexity; contract and coupling do.

**When to use:**
- Focused change with one coherent outcome and bounded write set
- Planner already generated `TASKS/` files
- Change is mechanical and well-scoped

**How to use:**
```
# Direct mode (no planner)
Agent({
  subagent_type: "builder-light",
  description: "Fix null check",
  prompt: "In src/utils/parser.ts line 47, add null check. Read the file first. Then: change `return user.name.toUpperCase()` to `return user?.name?.toUpperCase() ?? ''`. Run tests to verify."
})

# Planner-driven mode
Agent({
  subagent_type: "builder",
  description: "Task 01: Create Navbar",
  prompt: "Implement task from /ABSOLUTE/PATH/.pi/plans/TASKS/task_01_builder.md"
})
```

**Rules:**
- Route `builder-light` by error profile, not size: it handles most routine work correctly, but it errs precisely where `builder`/`builder-heavy` would not — implicit contracts, subtle semantics, ambiguity. A plausible-but-wrong light result passes shallow validation, so the routing question is “is the correct change fully determined by the task plus visible code?”, not “is this small?”.
- For non-frontend work, default to `builder`. Use `builder-heavy` only for an explicit host/external operation or concrete multi-runtime integration that a normal builder cannot safely own. Auth/payment, migration, config, shared files, multiple files, and a high-risk label do not select heavy by themselves. Select a design tier only for a local semantic/declarative model with a clear oracle—not merely because the task is unusual or configuration contains rules.
- Use `builder` for normal-risk procedural implementation: bounded API/tooling/tests, module/cache/lifecycle behavior, serialization surfaces, deterministic control flow, and structured integration. Its relative weakness is relation/rule/declarative semantic modeling; route that shape to design tiers only when that shape is actually present.
- Use `builder-design` for normal frontend/UI coding quality and also as a direct first choice for bounded normal-complexity state/relation behavior, policy/rule composition, selector semantics, or reversible structural conversion with a clear oracle.
- Use `builder-light` for routine locally-decidable work: mechanical/multi-spot edits, utilities, tests, tooling, pattern-following endpoints, config, reproduced bug fixes. Multi-file is fine when it is one concern with a bounded write set. For frontend, only exact token/class/text swaps.
- Route routine design-system UI to `builder-design`; `builder-light` handles only exact token/class/text swaps.
- Give light tiers explicit anchors: target files, the pattern to follow, exact validation, and required symbol/API/package/endpoint checks before implementation.
- Use `builder-heavy-design` directly for exceptional visual work or complex tasks dominated by state/relation semantics, policy/selector composition, grammar/template reconstruction, or declarative structure preservation. It does not require a prior GPT failure.
- Use `builder-heavy` for host/external execution, evidenced coordination across multiple live runtime/service/lifecycle boundaries, or bounded non-frontend work with concrete targets, a stated invariant/validation oracle, and demonstrated exceptional formal/numerical/scientific difficulty. Do not select it merely because code is backend, risky, multi-file, auth/payment, migration, config, API, or shared; vague scope or a generic retry goes to scout/planner.
- For frontend work, route visual hierarchy/layout/motion/accessibility to design tiers; use `builder` for bounded local data/API/auth behavior; reserve `builder-heavy` for an external operation or exceptional live integration boundary. For non-visual work, choose by problem shape rather than filename: declarative relation/rule/structure → design tier; normal local procedural work → `builder`.
- A decision, verdict, classification, evidence index, feasibility stop-gate, or source-of-truth artifact needs separate `validator` review only when one named consequential ambiguity or escape risk could survive producer proof. For a static locally-decidable artifact, focused orchestrator diff review closes it. Authority or importance alone selects neither `validator` nor `builder-heavy`; `builder` may collect evidence.
- Avoid `builder-light` for vague requests, new visual direction, final polish judgment, or brand/design decisions; use website pipeline, `builder-design`, or `builder-heavy-design`. Use `builder-heavy` for frontend only with a concrete non-visual correctness/integration hazard.
- Delegated builders still need explicit instructions: files to **READ**, **TARGET FILES**, patterns to follow, and how to **VERIFY**.
- Split into atomic tasks. Never stuff multiple concerns into one builder.
- Parallelize when files are disjoint.

---

## qa — Dedicated Post-Build Evidence

Use `qa` only through the `testing` skill when independent behavioral evidence materially improves confidence. Direct deterministic closure stays outside QA. Select exactly `CORE` for a declared bounded claim or `FULL` when all acceptance-required runtime surfaces must be safely exercised; a real browser is required for browser claims. Launch one fresh `qa` session against the exact checkpoint with the self-contained handoff template. Default QA is source-read-only and returns only SHA-/level-/scope-bound `PASS | BLOCKED | UNVERIFIED`.

An explicitly authorized FULL harness-construction phase may write only an exact test-only set, stops for a new checkpoint, and cannot certify itself. A fresh read-only `qa` session on the new SHA owns the verdict. Never create QA-only task/SCHEDULE ceremony, route QA through a builder, treat mocks/jsdom as FULL browser evidence, or execute against fixed/shared/unknown resources.

---

## Pipeline Order

```
[direct/scout pre-plan evidence] → [planner if needed] → builder → focused validation
                                                          ├→ qa CORE/FULL only when materially required
                                                          └→ validator only for a named gate or one final PR review
```

1. **scout** only when bounded evidence is missing.
2. **planner** only when the planner skill selects it; normal planner is the default full-plan route.
3. **builder tier** executes and validates its bounded task.
4. **qa** runs at CORE or FULL only when materially required after the producer checkpoint; direct static closure skips it.
5. **validator** is exceptional during implementation, plus one independent bounded review for a final PR head SHA.

For a selected planner gate, the schedule edge is authoritative: `builder checkpoint → validator PASS → dependent task`. Do not add a validator merely because a task changed config, touched staging, or is important. A `PASS` covering the complete final PR diff at its exact head SHA satisfies the PR review gate; never launch a duplicate review for that SHA.

**Skip rules:**
- Trivial (<20 lines, 1 file) → do it yourself with `edit`
- Small focused change → `builder-light` when locally decidable; `builder` for normal procedural code; `builder-design` for visual judgment, routine design-system UI, or semantic/declarative work; `builder-heavy` for complex operational integration or exceptional non-frontend formal/numerical/scientific risk with an explicit oracle; `builder-heavy-design` for exceptional visuals or complex relation/rule/grammar/structure semantics
- Critical (auth, payment) → appropriate builder tier with focused tests; add a validator gate only for a named escape risk that must block dependents — the single final PR review covers the rest
- Low-risk/mechanical/docs-only task → no separate validator task unless evidence shows a specific escape risk

---

## Common Mistakes

| Mistake | Why It's Wrong | What To Do Instead |
|---------|---------------|-------------------|
| Using builder without reading files first | Small model has no context | Tell builder exactly which files to read |
| Running planner for trivial fixes | Wastes tokens and time | Use `edit` or direct builder |
| Treating a scout verdict as coverage proof | `COMPLETE` can answer a bounded mission while leaving semantic relationships unresolved | Require a coverage receipt with anchors, searched relationship paths/scope, candidate dispositions, and explicit gaps |
| Not doing evidence-grounded pre-plan before planner | Planner guesses architecture/write sets, misses affected artifacts/validation wiring, and produces bad tasks | Use proportional scouts/direct reads, reconcile evidence, then run planner |
| Stuffing 5 files into one builder | Context overload, poor quality | Split into 2-3 parallel builders |
| Letting a light tier infer APIs/packages/contracts | Produces plausible-but-wrong results that pass shallow validation | Require grep/package/symbol verification or route to `builder` |
| Routing subtle state/lifecycle/compat work to `builder-light` | It errs exactly where `builder` would not | Route by decidability, not size |
| Skipping scout when planner evidence is incomplete | You miss dependencies, schemas, consumers, runners, and side effects even in a familiar repository | Scout proportionally before planner; familiarity alone is not evidence |
| Splitting when coherence is required | Independent reports can miss contradictions | Use one coherent `scout` for synthesis |
| Asking one scout a broad multi-part question | The agent misses nuance and burns tokens | Split into focused parallel scouts when separable; otherwise use one coherent `scout` |

---

## Quick Checklist Before Delegating

- [ ] Did I load this skill? (`/skill:agent-guide`)
- [ ] Is the task well-scoped? If not → scout or pre-plan
- [ ] Do I know which files are involved? If not → scout
- [ ] Real coordination complexity (dependencies, architecture, sequencing)? If yes → planner skill
- [ ] Bounded and well-defined? If yes → direct tools or one builder
- [ ] Did I scope each scout to one coherent mission and parallelize only independent angles?
- [ ] Did I tell the builder what to read, patterns to follow, and how to verify?
- [ ] If material post-build QA is needed, did I load `testing`, select exactly CORE or FULL, and hand one fresh `qa` session the exact SHA/scope/acceptance/resources?
- [ ] For every potentially stateful command, did I prove run-owned disposable resources and forbid execution on `UNKNOWN`/pre-existing/user/dev/shared/staging/production state?
