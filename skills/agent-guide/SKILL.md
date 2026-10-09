---
name: agent-guide
description: Mandatory pre-flight skill. Load BEFORE using scout, bug-hunt, planner, builder, or qa. Contains the complete playbook for delegating work to subagents correctly. Do not use subagents without reading this first.
---

# Agent Guide — How to Use Subagents

> **LOAD THIS SKILL FIRST** before using `scout`, `planner`, `builder`, or `qa`.
> Using subagents without these instructions causes context overload, poor results, and wasted tokens.

## Runtime Identity

Every custom agent must declare explicit `model:` and `thinking:` frontmatter. Its `display_name` must end with `· <Model Label> · <thinking>` so the initial Agent launch line visibly identifies the effective model and reasoning effort. Keep all three synchronized when changing routing. Agents using `model: inherit` display `inherit` plus their explicit effort.

## Economic Mindset

`scout` and builders run on delegated models. Route by task shape, model capability, and reasoning effort—not by file count:

| Tier | Agents | Model | Best For | Avoid |
|---|---|---|---|---|
| Default | `scout`, `builder` | Standard general tier (GPT-6 Luna high for builder) | **default for normal bounded development**: code, APIs, tests, config, auth/payment behavior, migrations, shared files, and multi-file changes with clear acceptance | relation/rule/declarative semantic modeling, visual judgment, or exceptional runtime coordination |
| Design | `builder-design` | Normal design tier (Claude Sonnet 5.5 high) | frontend/UI implementation plus bounded normal-complexity state/relation, policy/rule, selector, and reversible structural semantics | procedural API/streaming/lifecycle integration, correctness-heavy operational work, formal/numerical work, advanced visual spectacle |
| Light | `builder-light` | Routine deterministic tier (GPT-5.3 Codex Spark medium) | cheap execution after the task is already narrowed: mechanical/multi-spot edits, small utilities, focused tests, tooling, exact pattern-following config/docs, local reproduced bug fixes | implicit cross-module contracts, broad code search, subtle state/lifecycle/concurrency, serialization compatibility, auth/data-flow judgment, or ambiguity — there a plausible-but-wrong result passes shallow validation; UI beyond exact token/class/text swaps |
| Heavy | `builder-heavy` | Exceptional local-integration/correctness tier (GPT-6.1 Sol medium) | concrete exceptional local runtime/service/lifecycle coordination, or bounded non-frontend work with a stated invariant/oracle and demonstrated exceptional formal/numerical/scientific difficulty. Host/SSH/deploy/network/provider/reload/rollback stay with the orchestrator unless the user explicitly requests a subagent. | ordinary local code, auth/payment, migration, config, shared files, multi-file changes, broad planning, or vague scope |
| Heavy Design | `builder-heavy-design` | Exceptional design tier (Claude Opus 5.5 high) | exceptional visual work or direct complex semantic/declarative work: state/relation models, policy/selector composition, grammar/template reconstruction, and structure-preserving transformations | procedural API/streaming/lifecycle/serialization integration, auth/payment, migrations, formal/numerical/scientific work, tiny edits, or vague scope |
| QA | `qa` | Dedicated evidence tier (GPT-6.1 Sol medium) | fresh SHA-bound post-build behavioral evidence at exactly `CORE` or `FULL`; default source-read-only | implementation/repair, direct static closure, live/external operations, or a third QA level |

**Implication:** When a question has proven independent boundaries, breaking it into small, parallel sub-tasks improves results:
- **Lower total token cost** — many tiny scouts/builders cost less than one giant monolithic run
- **Faster wall-clock time** — independent agents run in parallel
- **Higher per-agent quality** — each agent gets a crisp, bounded question it can actually answer well
- **Easier to verify** — small outputs/diffs are simpler to audit and merge

**Builder workload admission:** every builder call, on any tier including `builder-heavy` and `builder-heavy-design`, carries at most two complex fronts, and two only when they are tightly coupled inside one coherent outcome with bounded validation; one is preferred. A complex front is an independently changing behavioral contract, state/lifecycle model, algorithm, or semantic transformation needing its own correctness reasoning; tests, docs, generated outputs, and mechanical propagation of the same settled contract follow their owning front. `agents/planner.md` is canonical. A stronger model, a Wide-Task Receipt, or internal phases never waive it, and path count is not cognitive load. Reject an over-limit assignment before delegation: split at evidenced valid checkpoints or stop `BLOCKED: BUILDER_COMPLEXITY_LIMIT`; never invent an arbitrary split, flag, or adapter to pass, and never let a builder grow into a new front.

**Commit-forecast rule of thumb:** Before implementation, estimate coherent outcomes, write sets, dependencies, validation resources, and rollback boundaries. Use the forecast to route work, not to prefer direct execution: one coherent nontrivial outcome normally uses one suitable builder; any number of independent clear units can use focused builders, launching every ready disjoint unit together and filling all available safe worker capacity. More than ~5 is a strong planner signal because it can optimize dependencies and safe SoC parallelism once instead of discovering them serially; that is a planning heuristic, never a worker/group-size cap or reason to serialize ready tasks. This heuristic counts coherent outcomes/tasks rather than complex fronts: coordination uncertainty, shared contracts, or architecture can justify planner earlier; mechanically related edits can stay one outcome. Truly trivial exact work may stay direct; a known target or one commit alone does not bypass a suitable worker.

**Bundled-request fast path:** At intake, including follow-up asks, privately identify outcomes, write sets, dependencies, validation resources, and rollback boundaries. Launch every independent, ready unit with disjoint write sets and non-conflicting validation resources together in one wave, filling all available safe capacity without an arbitrary 2–4 or other group cap. As slots free, promptly launch the next ready independent units; do useful work on other fronts rather than waiting or polling. Serialize only dependent work or work with overlapping writes/contracts or conflicting/unknown validation resources. If the schedule is grounded and bounded, use focused delegation without plan artifacts; escalate only when architectural uncertainty, substantial coupling, unclear ownership, or long-horizon coordination makes it unreliable. Do not complete all work yourself and treat delegation as optional afterward. Keep this decomposition private unless the user needs it to make a scope decision.

**Long-horizon rule of thumb:** When planner is selected, it spends the expensive reasoning once, writes `SCHEDULE.md` and atomic task files, and you launch every independent ready builder in the schedule up to all available safe capacity together; do not use an arbitrary group-size cap. Refill freed slots promptly, serializing only actual dependencies, shared contracts/write sets, or conflicting validation resources. The desired outcome is lower elapsed delivery time and less rework—not a larger task graph.

**Front ownership and coordinator responsiveness:** Delegate command preparation/read-only analysis and progress follow-up to suitable existing agents when that keeps the coordinator responsive. Assign an existing agent as front lead only when it reduces elapsed time or coordination; the lead may track, review, and correct work inside the reconciled scope/write set, then report results or exact blockers immediately through the handoff's approved completion channel. Escalate material unknowns, authority boundaries, and concrete blockers to the coordinator; never widen scope or take over external operations. The coordinator retains cross-front integration and external operations under their existing gates. A separate manager layer is optional, never mandatory for each trivial command; use existing agents, not a new framework or agent.

## Orchestrator Change-Contract Gate

Before any mutation—direct orchestrator edit/command, delegated builder, planner-driven execution, repair, migration, config, or external operation—the orchestrator owns reconciliation. Scouts collect evidence; planners decompose; builders execute; validators review. None may decide readiness or unresolved product meaning for the orchestrator.

Use the smallest sufficient contract:

- exact trivial/known change: the user request plus focused repository read may be an implicit contract; no artifact or scout ceremony;
- nontrivial/unfamiliar/cross-cutting/ambiguous change: orient from bounded structure, gather proportional direct/scout evidence, then state outcome, affected capabilities, `PRESERVE | CHANGE | REMOVE` boundary, scope, acceptance, and conflicts before writing/delegating;
- evidence reveals two behavior-changing interpretations: stop and ask the smallest user decision before mutation.

Evidence depth and solution complexity are separate. Let scouts gather enough evidence for the real system, including exhaustive coverage when the mission requires it. Orchestrator must reconcile that evidence into a compact contract; planner/builders must not convert every discovered risk, module, or possibility into a task or mechanism. More context should reduce guessing, not enlarge approved implementation.

## Orca worktree sessions

When work is assigned to a git worktree that is (or is being made) visible in Orca, run the worker as a PI session in a terminal of that same worktree, not as a background Agent-tool subagent. Use one agent terminal per worktree per assigned role; multiple role terminals are allowed only when the workflow assigns multiple roles. Launch via `orca terminal create --worktree <selector> --title "<role>" --command "pi --model <provider/id> --thinking <level>"`, then wait for `tui-idle` and send a prompt pointing to a self-contained task file; for a newly created worktree, use its startup terminal instead. Keep the handoff and report in files and read the report plus `orca terminal read`. Background subagents remain appropriate for work not tied to a visible worktree, such as main-checkout scouts or research.

## Handoff Standard (all delegations)

A subagent starts with zero context: it has not seen the conversation, the user's intent, or your prior findings. Whatever you omit, it will guess—and confident guesses are how subagents "fazem besteira". Every delegated prompt, for any agent type, must carry the orchestrator's reconciled contract at proportional detail and contain:

1. **Outcome + why** — what done looks like and the purpose behind it, plus affected existing capabilities and their `PRESERVE | CHANGE | REMOVE` boundary when behavior can change.
2. **Exact inputs** — absolute paths, symbols, line ranges, artifacts to READ first; include decisions/evidence already established in the conversation that the agent needs. When `.pi/memory/` holds a lesson about this exact surface or operation (deploy sequence, known bug, prior failure), quote that specific entry—heavy/highspeed/ultra tiers, validator, and planners receive no automatic memory injection, and the full summary is noise.
3. **Exact write set** — files it may CREATE/MODIFY; everything else is untouchable by default. For nontrivial semantic changes, derive it from a compact coverage receipt—semantic anchors, searched relationship paths/scope, discovered candidates and their evidence-backed disposition—not from a confident completeness label.
4. **`NOT TO DO` scope fence** — include a concrete `## NOT TO DO` section naming prohibited files/systems/operations, preserved capabilities, unsafe validation/actions, and the exact `BLOCKED` boundary. Derive it from the reconciled contract; generic repetition is not sufficient. No adjacent improvements, dependency additions, formatting churn, or plans/config/registries unless named.
5. **Conventions** — patterns/helpers/tokens to follow, with a file to imitate when one exists.
6. **Acceptance + validation** — observable criteria and exact commands, with CPU-heavy work (tests, builds, checks, codegen, processing) at full available parallelism: about 80% of logical CPUs with ~20% left free, one budget split across concurrent runs, each worker on isolated resources and serial where isolation is unproven, timeouts raised in a run-owned config before any test is weakened; include the project's recorded fast command from project memory (`setup.md`) when one exists, and tell the builder to verify the suite is parallel-ready once, then record the verified command there rather than rechecking each run; for behavior changes, the runtime evidence expected, not just compile checks. For any command that may start application code or touch a database/schema, filesystem, bucket, queue/topic, cache, search index, emulator/device state, or external service, include `STATEFUL RESOURCE PROOF`: resolved command/config/hooks, sanitized identities, `NO_STATEFUL_RESOURCES` or all-`DISPOSABLE_VERIFIED`, unique run ownership, synthetic data, no fallback, destructive-hook confinement, egress/credentials, teardown, and protected-resource postcheck. `localhost`, `.env.test`, `NODE_ENV=test`, Docker, a `test` name, transactions, or backup are not proof; absent/unknown proof means do not execute.
7. **Stop rules** — when to return BLOCKED instead of improvising: missing files, failed assumptions, conflicting evidence, required scope expansion, or unproven stateful-resource isolation. On suspected mutation, stop; never retry/restore/reseed without explicit authorization.
8. **Authorization boundary** — state the resolved authorization mode (`SUPERVISIONADO | AUTÔNOMO | YOLO`, default `AUTÔNOMO`), the already-approved stages/actions it covers for this task, and the exact boundary where the agent must stop and return to the orchestrator. Inside that boundary the agent works to completion without re-asking for the same scoped authority while action, target, method, limits, and evidence are unchanged; it may never widen or self-upgrade the grant, and any authority beyond the boundary returns `BLOCKED`. The orchestrator alone requests human decisions and performs host/external operations unless the user explicitly asked for a subagent. Resolve the mode from the runtime owner `extensions/execution-mode.ts` and its verified `EXECUTION_MODE={"mode":"…","source":"…"}` receipt, not chat memory or model recall. Actual PI workers spawned by Orca must load this extension; a custom agent with `extensions: false` cannot receive the hook and must retain the bounded handoff mode/scope without a false runtime claim.
9. **Consequential operations** — include the Consequential Action Gate and an exact action manifest for any operation that can destroy, irreversibly mutate, or make `NONDISPOSABLE` state unreachable. The manifest names the action, target, method, semantic identity/blast-radius evidence, effect semantics, irreversibility, recovery artifact/independence, and approval boundary. Require fresh confirmation after evidence, one irreversible effect per tool call, failure freeze, and read-only incident diagnosis; never let a delegated agent infer cleanup authority or use delete/unregister as move/transfer. Require a fresh read-only review of the exact manifest when it can catch alias/cascade risk.
10. **Immediate coordinator update + forward progress** — every handoff names its workflow-approved completion/report channel. Send the result or exact blocker to the coordinator immediately when it is known; do not hold it until other workers or the entire wave finish. During authorized active work, recheck open blockers at meaningful progress checkpoints and on new evidence, confirm they still apply, and update their current reason/evidence in the existing todo. Resolve them yourself when safe and in scope; once unblocked, update the todo and dispatch ready work immediately. Do not busy-poll or wait on blocked work while another independent front can advance. A completion notification is evidence of a result, never approval to expand scope or cross an authorization boundary. Do not idle while safe useful work or the next in-scope checkpoint is ready. Resolve routine, reversible implementation details yourself; do not ask the user for routine details. Escalate only a material unresolved decision, authority boundary, or concrete blocker to the coordinator, and continue unaffected independent work. Never create a cron/autonomous monitor, cross credential/approval boundaries, run against `UNKNOWN` stateful resources, override an `INCIDENT` freeze, or repeat a failed attempt without a new evidence-backed hypothesis. If the approved channel is unavailable, report that blocker through the current task/session completion path; do not invent another host/provider operation.
11. **Personal-use artifact handoff (when applicable)** — name the canonical project artifact and the intended personal-use copy in the handoff. The delivery target is the real Desktop resolved by the OS known-folder mechanism, not a guessed or hard-coded path. Preserve the canonical project file and copy it; use a clear collision-free name and never overwrite an existing Desktop file. Verify the delivered copy against its source with a hash or suitable decode/content check, and return the full path. Keep personal files, secrets, and PII out of Git. For future audio production when separately authorized, prefer a natural, high-quality Portuguese voice through an already available and authorized API, not robotic local voices such as Maria Desktop. This preference itself authorizes no API calls, new provider, purchase, key/credential, or TTS spend. Budgets and authorization are action-specific; benchmarking limits do not transfer to TTS or purchase authority. Do not regenerate previously delivered audio merely because the voice preference changed; regenerate only when explicitly requested. If Desktop resolution, naming without collision, or verification cannot be established safely, preserve the canonical artifact and immediately report the exact blocker; do not move/delete the source or invent another destination.

Before launching, reread the prompt as if you were the subagent: can you execute it without asking anything and without inventing anything? If not, fix the prompt or gather evidence first. Terse command-style prompts produce shallow, generic work; a paragraph of grounded context is cheaper than one wrong diff.

**Builder internal order and resume:** A prompt containing `## Internal Execution Order` must require the builder, before any source edit, to fill `.pi/build/TILL-DO_<task-id>.md` with concise evidence and `PASS | BLOCKED` verdicts for authority/baseline, contract/scope, validation/resources, and recovery/stop. Only all `PASS` permits `.pi/build/TODO_<task-id>.md`, mirrored from the phases; any blocked gate ends `BLOCKED` with no source mutation and no TODO. The builder updates phase outcome, authorized targets, prerequisite, exit evidence, status, completed/current/next phase, and changed files at coherent boundaries; resume verifies these against repo/diff evidence and continues from the first incomplete phase. Without explicit internal order or another lifecycle requirement, simple tasks create neither artifact. TILL-DO/TODO are transient task-local execution state, not tasks, IDs, DAG nodes, commits, checkpoints, validity boundaries, Flow/GitHub state, or parallel authorization, and stay out of the selective product commit unless explicitly tracked. Newly exposed undeclared scope remains `BLOCKED` before mutation.

**Scout capacity and breadth rule:** After bounded structural orientation, if two or more candidate evidence questions can advance planning, inventory every product/client/runtime root and write a compact `Scout Fan-out Map` before launch. Per candidate, record decision question, primary semantic boundary, source scope/explicit overlap, required handoff, stop condition, and `ADMIT | DEFER | MERGE | SYNTHESIS` disposition; also record configured background capacity, active agents, and free slots. A candidate spanning three or more independent semantic regions triggers a shard-breadth audit, not automatic splitting: split only at a repository-supported seam or record the causal coupling. Launch all ready `ADMIT` shards in one message, filling all configured free capacity that is safe and useful, with `run_in_background: true`; never impose an arbitrary group cap or leave a free slot while an independent candidate is ready. As slots free, dispatch the next ready shard without waiting for unrelated work. Source folders, file count, and generic test-only lookup do not make a shard; tests follow the production concern unless runner/resource safety is the independent question. A root excluded as inactive/legacy needs evidence or remains `UNKNOWN`. A shard is evidence routing, not a task, write-set proof, or parallel authorization. A cross-root purpose/behavior reconciliation is `SYNTHESIS`, not an initial shard. When one causal state model, exhaustive closure, or contradiction needs shared context, keep one coherent scout instead. After a wave, reconcile bridge anchors, shared/serial surfaces, validation/resource facts, candidate dispositions, contradictions, and gaps before planner; use a synthesis scout only if direct reconciliation cannot resolve them. While scouts run, keep doing useful direct inspection instead of waiting idly.

---

## scout — Investigation & Evidence Gathering

**What it does:**  
Read-only exploration. It reads files, greps, finds patterns, maps dependencies, analyzes logs, and returns a structured evidence report. It NEVER modifies code.

**When to use:**
- You don't fully understand the system, bug, or feature
- You need root cause analysis
- You need to trace data flow, function calls, or module relationships
- The user mentions errors, logs, or symptoms without clear source
- Manual exploration keeps expanding without answering the question — delegate to scout. A known target permits direct reading/editing, but nontrivial evidence gathering still routes to a suitable scout when delegation improves elapsed time or evidence quality.

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
- **Use a mapped capacity-filling wave, not an arbitrary swarm.** When orientation finds independent questions, inventory roots, classify candidates `ADMIT | DEFER | MERGE | SYNTHESIS`, and launch every ready `ADMIT` scout up to all free configured background capacity that is safe and useful; launch no arbitrary 2–4 group, and do not leave a free slot while an independent candidate is ready. Refill capacity as slots free. Audit a candidate spanning 3+ independent regions; a named causal coupling may keep it coherent, otherwise split at an evidenced seam. If one question depends on another's result, mark it `DEFER` or `SYNTHESIS` rather than occupying a first-wave slot.
- **Do useful parent work while scouts run**: read high-signal files, grep exact symbols, inspect tests/config/logs, and build hypotheses to validate against scout reports.

---

## bug-hunt — Bug Discovery

Read-only defect finder on GPT-6.1 Sol medium. Where `scout` explains how a system works, `bug-hunt` looks for where it is wrong. Every finding comes back with `path:line` causal-chain evidence, a refutation attempt, `CONFIRMED | LIKELY | SUSPECT` confidence, severity, reproduction steps, and a fix direction. It never edits code or runs project code; it returns the exact reproduction for you to run under the stateful-resource gate.

**When to use:**
- **Hinted:** a symptom, error, log, failing or flaky test, user report, or suspect commit range whose root cause is unknown. Pass the raw evidence verbatim; the hunter confirms or refutes the hint.
- **Unhinted:** pre-merge or pre-release sweeps, auditing an unfamiliar or risky module, after an incident, or after a fix to look for sibling bugs with the same pattern.

**When not to use:** the cause is already known (fix it directly or with a builder); you need to understand behavior rather than find defects (`scout`); a final PR gate (`validator`); runtime proof (`testing` → `qa`); a formal audit report (`code-audit`).

**Default to a parallel wave.** After bounded orientation, split the hunt into independent shards and launch all ready shards together in one message with `run_in_background: true`, filling all available safe capacity without an arbitrary group cap; refill slots as they free:
- **By region:** one shard per independent subsystem or layer, such as client, API, domain/data, jobs/async, auth, or config/infra.
- **By lens:** across one coherent but large region, one shard per lens group: logic and data, state and concurrency, contracts and error handling, security, performance.
- **Hinted:** one coherent shard traces the symptom end to end. Run parallel shards only for alternative-cause layers that do not depend on its result; never fragment one causal chain.

Declare each shard in its prompt:

```
Agent({
  subagent_type: "bug-hunt",
  description: "Bug hunt: API layer",
  run_in_background: true,
  prompt: "BUG HUNT SHARD api — Mode: UNHINTED. Outcome: find real defects before release. Scope: /abs/repo/apps/api/src (routes, services). Overlap: shared types in packages/shared/src/types.ts are read-only context; other shards cover the client and jobs. Context: <known contracts, recent commits, constraints>. Stop at COMPLETE coverage of the scope or PARTIAL with the next retrieval."
})
```

For a hinted hunt, include the verbatim error/log/stack, the reproduction steps and environment when known, what was already ruled out, and the suspect commit range.

**After the wave:** deduplicate findings across shards and follow up on cross-boundary leads, using a synthesis hunt only when the leads conflict. Verify each `CONFIRMED`/`LIKELY` finding you intend to fix by reproducing it, either directly or through `qa`, before fixing. Never fix a `SUSPECT` finding without new evidence. Fixes then follow the normal builder route, with a failing test first when practical.

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
Independent evidence questions after orientation: inventory roots, create a Scout Fan-out Map, classify candidates, launch all ready `ADMIT` scouts up to free configured capacity, then reconcile seams.
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
- Do a lightweight pre-plan before planner — get user approval when scope/cost/risk is non-trivial, but do not re-ask when the same scope, target, method, and evidence are already approved.
- For every full planner run, gather enough direct/scout evidence that the planner receives exact paths/symbols, architecture/data contracts, existing capabilities, semantic relationships, validation behavior, and bounded unknowns. Any claim that affected-artifact coverage is complete must carry semantic anchors, searched relationship paths/scope, discovered candidates, evidence-backed dispositions, and unresolved candidates. Familiarity, names, and a scout `COMPLETE` label alone are not evidence.
- For nontrivial/unfamiliar systems, structure comes first: inspect bounded roots/file families before deep reads so scout missions follow the repository rather than assumptions.
- Scale scouting to the system: no ceremonial scout for an already grounded exact surface; one coherent scout for normal work; after orientation, inventory all roots, audit broad candidates, and launch the largest `ADMIT` wave that fits free configured background capacity; normal scout synthesis only when direct seam reconciliation leaves cross-domain contradictions or one end-to-end state model unresolved.
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
- Route `builder-light` by determinism, not size: it is Spark medium and should execute tasks whose correct edit is fully determined by the task plus visible code. If the task requires broad search, implicit contracts, subtle semantics, or judgment, use `builder` instead; a plausible-but-wrong light result can pass shallow validation.
- For non-frontend work, default to `builder` once normal code understanding is needed. Use `builder-heavy` only for concrete exceptional local multi-runtime integration that normal builder cannot safely own or exceptional invariant/oracle-driven correctness. The orchestrator performs host/external operations unless the user explicitly requests a subagent. Auth/payment, migration, config, shared files, multiple files, and a high-risk label do not select heavy by themselves. Select a design tier only for a local semantic/declarative model with a clear oracle—not merely because the task is unusual or configuration contains rules.
- Use `builder` for normal-risk procedural implementation: bounded API/tooling/tests, module/cache/lifecycle behavior, serialization surfaces, deterministic control flow, and structured integration. Its relative weakness is relation/rule/declarative semantic modeling; route that shape to design tiers only when that shape is actually present.
- Use `builder-design` for normal frontend/UI coding quality and also as a direct first choice for bounded normal-complexity state/relation behavior, policy/rule composition, selector semantics, or reversible structural conversion with a clear oracle.
- Use `builder-light` for deterministic local work: mechanical/multi-spot edits, small utilities, focused tests, tooling, exact pattern-following config/docs, and reproduced local bug fixes. Multi-file is fine only when it is one mechanical concern with a bounded write set. For frontend, only exact token/class/text swaps.
- Route routine design-system UI to `builder-design`; `builder-light` handles only exact token/class/text swaps.
- Give light tiers explicit anchors: target files, the pattern to follow, exact validation, and required symbol/API/package/endpoint checks before implementation.
- Use `builder-heavy-design` directly for exceptional visual work or complex tasks dominated by state/relation semantics, policy/selector composition, grammar/template reconstruction, or declarative structure preservation. It does not require a prior GPT failure.
- Use `builder-heavy` for evidenced exceptional local runtime/service/lifecycle coordination or bounded non-frontend work with concrete targets, a stated invariant/validation oracle, and demonstrated exceptional formal/numerical/scientific difficulty. The orchestrator performs host/external execution unless the user explicitly requests a subagent. Do not select it merely because code is backend, risky, multi-file, auth/payment, migration, config, API, or shared; vague scope or a generic retry goes to scout/planner.
- For frontend work, route visual hierarchy/layout/motion/accessibility to design tiers; use `builder` for bounded local data/API/auth behavior; reserve `builder-heavy` for exceptional local integration boundaries. The orchestrator performs external operations unless the user explicitly requests a subagent. For non-visual work, choose by problem shape rather than filename: declarative relation/rule/structure → design tier; normal local procedural work → `builder`.
- A decision, verdict, classification, evidence index, feasibility stop-gate, or source-of-truth artifact needs separate `validator` review only when one named consequential ambiguity or escape risk could survive producer proof. For a static locally-decidable artifact, focused orchestrator diff review closes it. Authority or importance alone selects neither `validator` nor `builder-heavy`; `builder` may collect evidence.
- Avoid `builder-light` for vague requests, new visual direction, final polish judgment, or brand/design decisions; use website pipeline, `builder-design`, or `builder-heavy-design`. Use `builder-heavy` for frontend only with a concrete non-visual correctness/integration hazard.
- Delegated builders still need explicit instructions: files to **READ**, **TARGET FILES**, patterns to follow, and how to **VERIFY**.
- Split into atomic tasks. Never stuff multiple concerns into one builder.
- Parallelize only when write sets, contracts, dependencies, and validation resources are independent.

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
- Truly trivial, exact local step (for example a one-line mechanical edit) → do it yourself with `edit`; line count alone does not make nontrivial work direct
- Bounded nontrivial change → route to the suitable builder by default: `builder-light` only when deterministic and locally decidable; `builder` for normal procedural code and ordinary contracts; `builder-design` for visual judgment, routine design-system UI, or semantic/declarative work; `builder-heavy` for complex operational integration or exceptional non-frontend formal/numerical/scientific risk with an explicit oracle; `builder-heavy-design` for exceptional visuals or complex relation/rule/grammar/structure semantics. A known target or one coherent commit alone is not a reason to bypass a suitable worker.
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
| Stuffing independent concerns into one builder | Context overload, poor quality | Split at independent contract, write-set, and validation boundaries; keep one coherent change together even across many files |
| Letting Spark light infer APIs/packages/contracts | Produces plausible-but-wrong results that pass shallow validation | Require exact grep/package/symbol verification or route to `builder` |
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
- [ ] Did I scope each scout to one coherent mission and, for a parallel wave, record root inventory, `ADMIT | DEFER | MERGE | SYNTHESIS` dispositions, semantic boundaries, source overlaps, handoffs, stops, and configured/active/free background capacity?
- [ ] Did I tell the builder what to read, patterns to follow, how to verify, and the concrete `NOT TO DO` boundaries?
- [ ] If material post-build QA is needed, did I load `testing`, select exactly CORE or FULL, and hand one fresh `qa` session the exact SHA/scope/acceptance/resources?
- [ ] For every potentially stateful command, did I prove run-owned disposable resources and forbid execution on `UNKNOWN`/pre-existing/user/dev/shared/staging/production state?
