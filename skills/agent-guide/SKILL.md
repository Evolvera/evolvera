---
name: agent-guide
description: Mandatory pre-flight skill. Load BEFORE using scout, planner, or builder. Contains the complete playbook for delegating work to subagents correctly. Do not use subagents without reading this first.
---

# Agent Guide — How to Use Subagents

> **LOAD THIS SKILL FIRST** before using `scout`, `planner`, or `builder`.  
> Using subagents without these instructions causes context overload, poor results, and wasted tokens.

## Runtime Identity

Every custom agent must declare explicit `model:` and `thinking:` frontmatter. Its `display_name` must end with `· <Model Label> · <thinking>` so the initial Agent launch line visibly identifies the effective model and reasoning effort. Keep all three synchronized when changing routing. Agents using `model: inherit` display `inherit` plus their explicit effort.

## Economic Mindset

`scout` and `builder` run on delegated models. There are now two speed tiers:

| Tier | Agents | Model | Best For | Avoid |
|---|---|---|---|---|
| Default | `scout`, `builder` | Standard general tier | explicit, bounded, normal-risk procedural implementation: API/tooling/tests, module/cache/lifecycle behavior, serialization surfaces, deterministic control flow, and structured integration | relation/rule/declarative semantic modeling, complex long tasks, shared-file hazards, subtle math/science correctness, visual judgment |
| Design | `builder-design` | Normal Fable tier | frontend/UI implementation plus bounded normal-complexity state/relation, policy/rule, selector, and reversible structural semantics | procedural API/streaming/lifecycle integration, correctness-heavy operational work, formal/numerical work, advanced visual spectacle |
| Highspeed | `scout-highspeed`, `builder-highspeed` | Draft-speed tier | very fast bounded retrieval/execution, single-file mechanical edits, rapid non-visual prototypes, backend/tooling/tests, mechanical changes | frontend/UI implementation beyond tiny exact token/class/text swaps, broad ambiguous tasks, 6–8+ step workflows, exhaustive/stateful checklists, large-context tasks, final visual polish, brand/design decisions, factual claims without sources |
| Heavy | `builder-heavy` | Procedural correctness/integration tier | complex API/SDK, streaming, serialization, module/cache/daemon lifecycle, migrations, cross-service behavior, auth/payment, shared files, and non-visual frontend state/data integration | tasks dominated by relation/rule/declarative semantics, visual quality, tiny mechanical edits, broad planning, or vague scope |
| Ultra | `builder-ultra` | Exceptional non-frontend correctness tier | bounded tasks with a stated invariant/oracle and demonstrated exceptional difficulty: formal reasoning, numerical stability/error bounds, difficult physics/math/science, round-trip/diff/merge semantics, adversarial counterexamples, or grounded failure after heavy | vague/unfamiliar scope, generic retry, ordinary integration, broad architecture, routine algorithms, or any frontend/design work |
| Heavy Design | `builder-heavy-design` | Fable/high implementation tier | exceptional visual work or direct complex semantic/declarative work: state/relation models, policy/selector composition, grammar/template reconstruction, and structure-preserving transformations | procedural API/streaming/lifecycle/serialization integration, auth/payment, migrations, formal/numerical/scientific work, tiny edits, or vague scope |

**Implication:** The more you **break down** a question into small, parallel sub-tasks, the better your results:
- **Lower total token cost** — many tiny scouts/builders cost less than one giant monolithic run
- **Faster wall-clock time** — independent agents run in parallel
- **Higher per-agent quality** — each agent gets a crisp, bounded question it can actually answer well
- **Easier to verify** — small outputs/diffs are simpler to audit and merge

**Long-horizon rule of thumb:** When you see complex work ahead — many files, many tasks, architecture decisions, unclear sequencing, or a backlog that can be split — Planner → Builders is usually the way to go. Planner spends the expensive reasoning once, writes `SCHEDULE.md` and atomic task files, and you run smaller/faster/cheaper builders in parallel. You should orchestrate, verify, and synthesize instead of doing every implementation step yourself.

**Scout rule of thumb:** If a scout prompt feels like it is asking for "understand everything about X", first decide whether decomposition preserves quality. If yes, split it into 2–8 `scout-highspeed` micro-scouts and run them in parallel. If splitting would lose cross-file coherence, use normal `scout`. For broad work, prefer mixed mode: highspeed for inventory/grep shards, normal scout for synthesis. While scouts run, keep doing useful direct inspection instead of waiting idly.

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
  subagent_type: "scout-highspeed",
  description: "Investigate auth bug",
  prompt: "Find why JWT validation fails for admin users. Check src/auth/, src/middleware/, and any recent commits. Return exact file paths, line numbers, and the root cause."
})
```

**Rules:**
- Use `scout-highspeed` for micro-scouts: narrow file discovery, symbol grep, test/config inventory, one local dependency slice, algorithms/backend/infra/math-heavy code understanding with tight scope.
- Do not give `scout-highspeed` broad prompts like "map tests corpus", "map coverage", "inventory all methods", or "scan entire repo". Split those into 2–8 parallel micro-scouts first, or use normal `scout`.
- Use `scout` when lower hallucination risk, exhaustive coverage, large-context coherence, or existing scout checkpoint artifacts matter more than speed.
- Use mixed mode when useful: highspeed scouts for evidence shards, normal scout for synthesis/contradiction resolution.
- Do not use highspeed scouts for frontend design critique or visual polish; use website/design agents instead.
- Give scout a **clear question**, not vague tasks.
- For highspeed scouts, include explicit budget: <=2 tool-call rounds, <=8 tool uses, read <=3 files, return PARTIAL with next splits if broad.
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
# Step 1: Pre-plan (you do this, not the planner)
Summarize the user's request. Ask clarifying questions. Confirm scope.

# Step 2: Run planner (after user approves scope)
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
- Do a lightweight pre-plan before planner — get user approval when scope/cost/risk is non-trivial
- Planner is **expensive** — don't run it for trivial tasks
- Read `SCHEDULE.md` and `TASKS/` before spawning agents
- Builders own focused validation. Add a separate `validator` task only when one named high-consequence defect could credibly escape builder checks and must gate dependents; do not add it after every builder or duplicate the final PR review

---

## builder — Focused Execution

**What it does:**  
Implements atomic code changes. Runs on a small, fast model. Good for 1-2 files, single concern.

**When to use:**
- Focused change (1-2 files, one concern)
- Planner already generated `TASKS/` files
- Change is mechanical and well-scoped

**How to use:**
```
# Direct mode (no planner)
Agent({
  subagent_type: "builder-highspeed",
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
- Treat `builder-highspeed` as draft-speed execution: very fast, less capable, shorter-context, and more hallucination-prone than the standard tier. Fast hallucinations can look correct.
- For non-frontend work, GPT is the default: use `builder` for normal complexity and `builder-heavy` for complex procedural/integration risk. Select a Fable tier only for a local semantic/declarative model with a clear oracle—not merely because the task is unusual or configuration contains rules. Host, SSH, deploy, network, Plesk, nginx, ACME, CI, reload, rollback, provider, and other external operations always use `builder-heavy`.
- Use `builder` for normal-risk procedural implementation: bounded API/tooling/tests, module/cache/lifecycle behavior, serialization surfaces, deterministic control flow, and structured integration. Its relative weakness is relation/rule/declarative semantic modeling; route that shape to Fable tiers only when that shape is actually present.
- Use `builder-design` for normal frontend/UI coding quality and also as a direct first choice for bounded normal-complexity state/relation behavior, policy/rule composition, selector semantics, or reversible structural conversion with a clear oracle.
- Use `builder-highspeed` for single-file/module-local mechanical edits, rapid non-visual prototypes, utility generation, tests, backend/tooling/infra, algorithms, physics/math, and mechanical refactors. For frontend, use it only for tiny exact token/class/text swaps.
- Give `builder-highspeed` tighter steering: target files, <=~6 logical steps, exact validation, and required symbol/API/package/endpoint checks before implementation.
- Use `builder-heavy-design` directly for exceptional visual work or complex tasks dominated by state/relation semantics, policy/selector composition, grammar/template reconstruction, or declarative structure preservation. It does not require a prior GPT failure.
- Use `builder-heavy` for complex procedural correctness/integration: API/SDK, streaming, serialization, module/cache/daemon lifecycle, migrations, cross-service behavior, auth/payment, large shared files, or non-visual frontend state/data integration. Do not select it merely because a semantic/declarative task is non-visual.
- Escalate to `builder-ultra` only for bounded non-frontend work with concrete targets, a stated invariant/validation oracle, and demonstrated exceptional difficulty: formal proof obligations, numerical stability/error bounds, difficult physics/math/science, round-trip/diff/merge semantics, adversarial counterexamples, or a reproducible heavy failure. Vague scope, unfamiliarity, or a generic retry must go to scout/planner, not ultra.
- For frontend work, route visual hierarchy/layout/motion/accessibility to Fable tiers; route procedural API, auth, payment, streaming, concurrency, persistence, or data-integrity hazards to `builder-heavy`. For non-visual work, choose by problem shape rather than filename: declarative relation/rule/structure → Fable; operational execution/integration → GPT. Do not use `builder-ultra` for frontend.
- Route by consequence, not only by mutation risk. A read-only / single-file / doc-or-JSON task is still high-risk when its output is a decision, verdict, classification, evidence index, feasibility stop-gate, or source-of-truth artifact other tasks depend on — downstream gates catch fabrication/churn in code, not a wrong judgment in a doc. Route those to `builder-heavy` (plus review). `builder` may COLLECT evidence but not ADJUDICATE verdicts.
- Avoid `builder-highspeed` for real frontend implementation, final frontend polish, brand/design decisions, or vague UI requests; use website pipeline, `builder-design`, or `builder-heavy-design`. Use `builder-heavy` for frontend only with a concrete non-visual correctness/integration hazard.
- Delegated builders still need explicit instructions: files to **READ**, **TARGET FILES**, patterns to follow, and how to **VERIFY**.
- Split into atomic tasks. Never stuff multiple concerns into one builder.
- Parallelize when files are disjoint.

---

## Pipeline Order

```
[scout if needed] → [planner if needed] → builder → focused validation
                                                └→ validator only for a named gate or one final PR review
```

1. **scout** only when bounded evidence is missing.
2. **planner** only when the planner skill selects it; normal planner is the default full-plan route.
3. **builder tier** executes and validates its bounded task.
4. **validator** is exceptional during implementation, plus one independent bounded review for a final PR head SHA.

For a selected planner gate, the schedule edge is authoritative: `builder checkpoint → validator PASS → dependent task`. Do not add a validator merely because a task changed config, touched staging, or is important. A `PASS` covering the complete final PR diff at its exact head SHA satisfies the PR review gate; never launch a duplicate review for that SHA.

**Skip rules:**
- Trivial (<20 lines, 1 file) → do it yourself with `edit`
- Small focused change → `builder-highspeed` when mechanical; `builder` for normal procedural code; `builder-design` for normal visual or semantic/declarative work; `builder-heavy` for complex operational integration; `builder-heavy-design` for exceptional visuals or complex relation/rule/grammar/structure semantics; `builder-ultra` only with an explicit oracle and exceptional non-frontend formal/numerical/scientific risk
- Critical (auth, payment) → appropriate builder tier with focused tests; add a validator gate only for a named escape risk that must block dependents — the single final PR review covers the rest
- Low-risk/mechanical/docs-only task → no separate validator task unless evidence shows a specific escape risk

---

## Common Mistakes

| Mistake | Why It's Wrong | What To Do Instead |
|---------|---------------|-------------------|
| Using builder without reading files first | Small model has no context | Tell builder exactly which files to read |
| Running planner for trivial fixes | Wastes tokens and time | Use `edit` or direct builder |
| Not doing pre-plan before planner | Planner guesses scope, produces bad plans | You pre-plan, user approves, then run planner |
| Stuffing 5 files into one builder | Context overload, poor quality | Split into 2-3 parallel builders |
| Letting `builder-highspeed` infer APIs/packages | Produces plausible hallucinations | Require grep/package/symbol verification or use `builder` |
| Using `builder-highspeed` for long checklists | Context drift after several steps | Split tasks or route to `builder` |
| Skipping scout on unfamiliar code | You miss dependencies and side effects | Always scout first on unfamiliar code |
| Asking one highspeed scout a broad corpus/coverage question | It burns context, hits turn limits, or returns shallow partials | Split into 2–8 parallel micro-scouts or use normal `scout` |
| Splitting when coherence is required | Independent reports can miss contradictions | Use normal `scout`, or mixed mode with `scout` synthesis |
| Asking one scout a broad multi-part question | Small model misses nuance and burns tokens | Split into focused scouts when separable; otherwise use normal `scout` |

---

## Quick Checklist Before Delegating

- [ ] Did I load this skill? (`/skill:agent-guide`)
- [ ] Is the task well-scoped? If not → scout or pre-plan
- [ ] Do I know which files are involved? If not → scout
- [ ] Real coordination complexity (dependencies, architecture, sequencing)? If yes → planner skill
- [ ] Bounded and well-defined? If yes → direct tools or one builder
- [ ] Did I choose default vs highspeed based on task fit?
- [ ] Did I tell the builder what to read, patterns to follow, and how to verify?
