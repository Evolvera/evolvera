# Single QA Capability with CORE and FULL Levels

**Generated**: 2026-07-24 22:05:41Z  
**Complexity**: Medium-high  
**Estimated tasks**: 3 (2 writing, 1 review-only validator)  
**Risk**: High — the change rewrites a global safety/evidence contract whose mistakes could overstate acceptance or touch preserved state

## Outcome

Keep the global skill command/name `testing`, but make it the single entry point for one dedicated `qa` subagent with exactly two adaptive levels:

- **CORE** proves only a declared bounded backend/core scope: unit and focused integration behavior, contracts, invariants, boundaries/errors, and conditional property/differential/mutation techniques with explicit oracles.
- **FULL** proves every required complete acceptance surface that can be safely exercised across a real headless browser/UI, frontend, API, auth/session, persistence, async/integration seams, logs, and state. DOM simulation/component tests remain CORE evidence; a FULL browser claim requires a real browser runtime. BrowserContext isolation covers browser storage, not backend resources.

All delegated QA evidence remains bound to an exact head SHA and uses only `PASS | BLOCKED | UNVERIFIED`. Static/mechanical work may still close by direct deterministic evidence without QA.

## Material Decisions

### PRESERVE

- `skills/testing/SKILL.md` remains the sole skill entry point named `testing`.
- SHA-bound post-build evidence, producer/QA independence, acceptance matrices, `PRESERVE | CHANGE | REMOVE`, validator separation, selective commits, and the rule against testing-only task/SCHEDULE ceremony remain intact.
- The complete stateful-resource gate remains fail-closed: fixed/pre-existing/shared resources are never disposable merely because they are local, test-named, containerized, transactional, or backed up. Suspected mutation stops execution; no retry, restoration, or reseed is allowed; protected-resource postchecks remain mandatory.
- First-failure evidence, preserved oracles, and coverage-as-diagnostic-only remain intact. A retry pass is labeled flaky and cannot become clean PASS.
- Direct deterministic closure remains outside the two QA levels; it is not a third QA level.

### CHANGE

- Material QA routes to `Agent(subagent_type="qa")`, not a builder testing mode.
- Every QA receipt names `CORE` or `FULL` and the exact exercised scope. CORE PASS is deliberately non-product-wide. FULL PASS requires safe evidence for every required acceptance surface; unavailable or unsafe surfaces produce UNVERIFIED unless a concrete observed mismatch supports BLOCKED.
- The QA agent uses `openai-codex/gpt-5.6-sol`, `thinking: high`, an isolated lean prompt, explicit action/tool boundaries, and concise evidence receipts without visible chain-of-thought.
- FULL may enter an explicitly authorized harness-construction phase. That phase has an exact test-only write set, cannot change production behavior or hide dependency/network spend, cannot certify its own output, and ends at a separate checkpoint. A fresh `qa` session performs read-only QA against the new SHA.
- A dependency-free Node inventory utility statically identifies candidate QA/test/browser/resource surfaces without importing or executing target code and without claiming resource safety.

### REMOVE

- `POST-BUILD TEST MODE`, the builder testing invocation mode, and all live global instructions that route local QA through fresh `builder` or testing through `builder-heavy`.
- Any implication that a DOM simulator, mocked browser/API, or browser context proves FULL integrated behavior or backend resource isolation.

## Scope

### In scope

- New `agents/qa.md`.
- Redesign of `skills/testing/` with two level-specific references, one invocation template, a static inventory script, and deterministic smoke tests.
- Narrow route/contract edits in `SYSTEM.md`, its exact mirror, the builder agent, and the builder/planner/agent-guide skills.
- Five representative prompt-evaluation scenario groups after the implementation checkpoint: CORE, safe FULL classification, unsafe FULL, mocked browser, and FULL harness-build/fresh-run separation.
- One independent validator gate for state safety, level overclaim, browser/mock semantics, and harness self-certification.

### Out of scope

- A `qa-harness` skill, any second QA agent, or any third QA level.
- CRM/Portal or other production-project QA implementation.
- Deploy, SSH, live hosts, provider/network operations, or external-environment smoke.
- Universal coverage, mutation, or test-count thresholds.
- New PI harness runtime dependencies, package/lockfile edits, or speculative framework generators.
- Project-memory architecture, patch-note, trust, backup/config-copy, or unrelated dirty-file changes.

## Evidence and Affected-Artifact Closure

**KNOWN**:

- `skills/testing/SKILL.md` is currently the only file in the testing skill and routes fresh builders through `POST-BUILD TEST MODE`.
- `agents/builder.md` implements that mode.
- Focused live-markdown searches for `POST-BUILD`, fresh builder testing, delegated testing, and post-build closure identify the executor-selection closure as `SYSTEM.md`, `config/SYSTEM.md`, `agents/builder.md`, `skills/testing/SKILL.md`, `skills/builder/SKILL.md`, and `skills/planner/SKILL.md`. `skills/agent-guide/SKILL.md` has no old testing route but is the established global agent-routing guide and therefore needs the new `qa` route.
- `agents/validator.md` consumes generic SHA-bound producer/post-build evidence but does not select the test executor or define the QA level, so its existing contract remains valid without modification.
- Custom agents are filename-discovered from `agents/*.md`; no registry or manifest is needed. Existing agent conventions support explicit model/thinking/display identity and isolated `lifecycle`, `prompt_mode`, `inherit_context`, `extensions`, and `skills` fields.
- Existing Node skill tooling uses dependency-free `.mjs` scripts and `scripts/test/*.smoke.mjs` tests.

**INFERRED**:

- One coherent routing/prompt commit is safer than splitting the semantic transition: splitting the skill, agent, and global routes would leave a checkpoint with contradictory or dual QA behavior.
- The static inventory utility has an independent, valid checkpoint boundary and can be implemented first, then referenced by the coherent QA transition.

**UNKNOWN**: none that blocks planning. Runtime availability of a real browser, credentials, startup/auth/seed contracts, and disposable resources remains project-specific by design; the QA contract must report those surfaces UNVERIFIED rather than guess.

## Repository-State Baseline and Ownership

- Project root: `/Users/j.henrique/.pi/agent`
- Branch: `main`
- Supplied pre-work HEAD: `9305bd7a6e43430a37e2e92051c127488d1f7824`
- The tree already contains unrelated dirty/untracked work. Before each edit, the orchestrator records `git status --porcelain=v1 --untracked-files=all`; every pre-existing entry is an immutable exclusion, and execution stops if one overlaps a task write set.
- Specifically excluded are `.pi/memory/_summary.md`, `docs/patch-notes/2026-07-09.html`, project-memory architecture files, existing `.pi/build/`, local architecture memory, historical plans/recovery directories, backups/config copies, trust files, and every other pre-existing status entry.
- Plan files under this PLAN_DIR are uncommitted orchestration artifacts and must not enter implementation commits.
- No active implementation checkpoint exists at plan generation. The orchestrator records each writing task hash and the validator verdict only in `SCHEDULE.md`.

## Shared-File Hazards

| File | Lines | Hazard and preservation markers | Mitigation |
|---|---:|---|---|
| `skills/testing/SKILL.md` | 179 | Global safety/evidence authority; preserve exact verdict set, fail-closed resource policy, protected postcheck, incident stop, direct static closure, validator separation, and no QA task ceremony | Byte-for-byte recovery snapshot; section-anchored edits; contract smoke and independent validator |
| `agents/builder.md` | 58 | Shared implementation executor; removing testing mode must not weaken implementation workflow, state safety, write boundaries, or final status contract | Snapshot; remove only invocation-mode/testing condition anchors; focused diff |
| `skills/builder/SKILL.md` | 303 | Shared implementation routing and state-safety guide | Snapshot; patch the post-build closure route only; preserve all builder tiers and execution rules |
| `skills/planner/SKILL.md` | 205 | Shared planning/execution contract | Snapshot; patch the post-build QA executor sentence only; preserve plan-proof and no-testing-task rules |
| `skills/agent-guide/SKILL.md` | 260 | Mandatory subagent routing guide | Snapshot; add a bounded QA route/tier and adjust pipeline/checklist without rewriting other agent tiers |
| `SYSTEM.md` | 116 | Global system behavior and safety contract | Snapshot; narrow route/closure edits only; preserve stateful-resource and observability sections |
| `config/SYSTEM.md` | 116 | Must remain byte-identical to `SYSTEM.md` | Snapshot; mirror the same narrow edits; `cmp -s` is mandatory |

Recovery root for the shared semantic transition: `.pi/recovery/20260724_220541Z_single_qa_two_levels_task_02/before/`. No pre-existing recovery path may be altered or staged.

## Scenarios and Failure Behavior

1. **CORE backend checkpoint**: QA derives focused scenarios from contract plus base/head test diff, proves only safe bounded resources, reports `Level: CORE`, and cannot imply FULL/product-wide acceptance.
2. **FULL user journey**: QA requires a real browser for browser claims and records rendered UI/console, API, auth/session, persistence, async/integration, log, and state observations required by the acceptance matrix. DOM simulation and mocks are labeled, not promoted.
3. **Unsafe resource discovery**: a fixed `*_test` database, shared Redis/bucket/queue, destructive seed/reset, unknown env fallback, or pre-existing resource blocks execution. QA preserves a precise receipt and returns UNVERIFIED; it never creates a fake PASS.
4. **Authorized FULL harness**: the build phase writes only the exact approved test-only files, stops for a selective checkpoint, and cannot certify that SHA. Missing startup/auth/seed/resource contracts or required real credentials stays UNVERIFIED. A fresh QA session owns final read-only evidence.
5. **Failure/retry**: first failure evidence is retained. A later pass is flaky; BLOCKED is used for a concrete reproducible acceptance mismatch, while UNVERIFIED is used when the flaky run leaves required proof insufficient. Neither becomes clean PASS.
6. **Static/mechanical change**: direct deterministic evidence may close the outcome without invoking QA; this does not create a third level.

## Risks and Mitigations

- **State policy accidentally weakened** — preserve exact safety markers, statically assert them, and gate the final SHA with an independent validator.
- **CORE overstates FULL/product confidence** — require level-qualified headers, exact exercised scope, explicit non-implication language, and a CORE prompt eval.
- **Mocks/jsdom/browser context misclassified** — put browser semantics in the FULL reference and require the validator to reject mock-as-integrated or context-as-backend-isolation language.
- **Harness self-certifies or edits production** — default QA is read-only; build mode requires explicit authorization/write set, ends at a new checkpoint, and forces a fresh session.
- **Inventory output becomes a safety oracle or leaks values** — output only deterministic paths and predefined marker labels, never env values/snippets; state that inventory candidates are not `DISPOSABLE_VERIFIED` proof.
- **Dual/stale QA routing remains** — one task owns every semantic routing surface; a scoped markdown grep must return no obsolete builder-testing route.
- **Global shared-file churn or unrelated dirty inclusion** — recovery snapshots, section anchors, focused diffs, selective staging, and pre-existing status exclusions.
- **Prompt prose looks correct but behaves incorrectly** — run five scenario groups (six fresh QA sessions because harness construction and final run are separate) before validator review.

## Implementation Order

1. Build and smoke-test the standalone read-only QA surface inventory utility using committed static fixtures and no mutable resource.
2. In one coherent checkpoint, add the `qa` agent, redesign the `testing` skill and references/template, remove builder testing mode, update every live route, preserve SYSTEM mirrors, and add deterministic contract smoke coverage.
3. Against the exact second checkpoint, the orchestrator runs the five isolated prompt-evaluation groups with command execution forbidden and records concise receipts. Then the independent validator reviews the full base-to-head change and those receipts.

No tasks are parallelized: the semantic skill must reference a present, tested inventory utility, and the validator must inspect the complete final checkpoint.

## Validation Strategy

### Producer checks

All local Node/grep/cmp/diff checks are classified `NO_STATEFUL_RESOURCES`: they read committed fixtures or source text, write no repository/application state, start no app, browser, database, cache, queue, bucket, or network client, and execute no target-project code.

- `node skills/testing/scripts/test/inventory-qa-surfaces.smoke.mjs`
- `node skills/testing/scripts/test/qa-contract.smoke.mjs`
- Run the PI `pi_validate_skill` tool successfully for `skills/testing`, `skills/builder`, `skills/planner`, and `skills/agent-guide`.
- Prove agent discovery/frontmatter by successfully launching fresh `Agent(subagent_type="qa")` sessions; verify visible identity ends `GPT-5.6 Sol · high`.
- Scoped live-markdown grep over `SYSTEM.md`, `config/SYSTEM.md`, `agents/*.md`, and `skills/**/*.md` must find no `POST-BUILD TEST MODE` or fresh-builder/builder-heavy testing route.
- `cmp -s SYSTEM.md config/SYSTEM.md`
- `git diff --check`
- Focused diff/status review against the recorded pre-task status; only task-owned files may be staged.

### Prompt/agent evaluation gate

After the semantic checkpoint and before validator review, use fresh `qa` sessions for five synthetic, command-forbidden, SHA-bound scenario groups. These are prompt classification/evidence-contract evaluations, not claims that a production app was tested:

1. CORE backend-only acceptance: selects CORE and scopes any PASS to declared CORE evidence.
2. Safe FULL acceptance: selects FULL, distinguishes real browser from simulation, and demands UI/API/log/state evidence rather than accepting producer claims.
3. Unsafe FULL acceptance: fixed/shared/destructive/unknown resources cause no execution and UNVERIFIED with the missing proof.
4. Mocked browser acceptance: labels jsdom/component/mocked API evidence as CORE/partial and leaves FULL integrated browser acceptance UNVERIFIED.
5. Authorized harness boundary: one fresh session describes/writes only the approved test-only harness and stops for a new SHA; a second fresh session binds to that new SHA, remains read-only, and alone may issue the final QA verdict.

Each receipt must show level, target SHA, exercised/not-exercised acceptance, resource classification/postcheck, exact verdict, and evidence gaps without visible chain-of-thought. Missing or contradictory receipts block the validator.

### Independent gate

The review-only validator returns PASS only if the exact final SHA preserves state safety and oracles, has exactly one QA agent/two levels, cannot overclaim CORE/FULL or mocks, enforces fresh-session harness certification, passes deterministic validation, and excludes unrelated dirty files. BLOCKED pauses completion and returns bounded findings to the producer for repair and revalidation.
