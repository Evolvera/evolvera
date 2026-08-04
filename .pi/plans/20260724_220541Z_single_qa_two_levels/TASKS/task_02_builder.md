# Task 02: Route one two-level testing skill through one QA agent

**Agent**: builder-heavy-design  
**Why**: The agent prompt, level semantics, global routes, and builder-mode removal form one non-local contract that must become valid in a single checkpoint.  
**Goal**: `testing` adaptively delegates material QA to one discoverable GPT-5.6 Sol `qa` agent at CORE or FULL, with fail-closed state safety, honest browser/harness evidence, lean references, and no live builder testing mode.

## Read

- `skills/testing/SKILL.md` — current SHA-bound evidence, safety, verdict, repair, and no-ceremony invariants
- `skills/testing/scripts/inventory-qa-surfaces.mjs` — stable static inventory CLI to expose from the skill without treating it as proof
- `agents/builder.md` — obsolete testing mode plus implementation behavior that must be preserved
- `agents/validator.md` — isolated agent/frontmatter convention and validator-separation contract; consume only, do not modify
- `agents/builder-ultra.md` — `openai-codex/gpt-5.6-sol` high identity/frontmatter example
- `skills/builder/SKILL.md` — post-build closure route at the `Result Handling` section
- `skills/planner/SKILL.md` — post-build route at `Execute the Plan`
- `skills/agent-guide/SKILL.md` — custom-agent identity, routing table, pipeline, and checklist anchors
- `SYSTEM.md` and `config/SYSTEM.md` — mirrored global route, safety, observability, and closure contracts
- `skills/pi-tool-expert/SKILL.md` and `skills/pi-tool-expert/references/validation-checklist.md` — skill/frontmatter validation conventions

## Change

- `agents/qa.md` — CREATE — the sole dedicated QA subagent, GPT-5.6 Sol high
- `agents/builder.md` — MODIFY — remove the builder testing invocation mode and its workflow condition only
- `skills/testing/SKILL.md` — MODIFY — redesign one skill around adaptive CORE/FULL selection and `qa` delegation
- `skills/testing/references/core-qa.md` — CREATE — conditional CORE techniques/oracle guidance
- `skills/testing/references/full-qa.md` — CREATE — conditional real-browser/full-stack and authorized harness guidance
- `skills/testing/references/research.md` — CREATE — concise prompt-runtime and QA evidence memo with current official/primary sources, applicability, caveats, and evaluated design decisions
- `skills/testing/templates/qa-handoff.md` — CREATE — concise SHA/level/acceptance/resource/harness invocation template
- `skills/testing/scripts/test/qa-contract.smoke.mjs` — CREATE — deterministic structural and scenario-contract smoke
- `skills/builder/SKILL.md` — MODIFY — route materially required post-build QA to `qa` and remove the old marker
- `skills/planner/SKILL.md` — MODIFY — route materially required post-build QA to `qa` while preserving no QA task/SCHEDULE ceremony
- `skills/agent-guide/SKILL.md` — MODIFY — expose the dedicated QA tier, invocation boundary, and pipeline placement
- `SYSTEM.md` — MODIFY — replace the builder testing route and align post-build closure wording
- `config/SYSTEM.md` — MODIFY — byte-identical mirror of the same SYSTEM changes

## Proof

- **Semantic delta and anchors**: current executor selection is anchored by `skills/testing/SKILL.md` lines 50–65/118, `agents/builder.md` lines 15–19/37, `SYSTEM.md` lines 53/108 and its mirror, `skills/planner/SKILL.md` line 198, and `skills/builder/SKILL.md` line 249. The delta replaces that one builder mode with one `qa` identity and qualifies evidence as CORE or FULL.
- **Closure**: focused searches over live `SYSTEM.md`, `config/SYSTEM.md`, `agents/*.md`, and `skills/**/*.md` for `POST-BUILD`, fresh-builder testing, delegated testing, and post-build closure found six stale-route files as AFFECTED: both SYSTEM mirrors, `agents/builder.md`, `skills/testing/SKILL.md`, `skills/builder/SKILL.md`, and `skills/planner/SKILL.md`. `skills/agent-guide/SKILL.md` is the seventh modified existing file and is AFFECTED through the established new-agent routing relationship. The level details, invocation contract, and deterministic checks are owned by the new reference/template/smoke files. The inventory CLI is already sufficient and only needs a skill reference. `agents/validator.md` is UNAFFECTED because it consumes generic SHA-bound evidence and does not select executors or define levels; all other live agents/skills are UNAFFECTED because the scoped searches found no QA executor route. Filename auto-discovery means no registry is missing.
- **Checkpoint**: after this task, every referenced file exists, one `qa` agent is discoverable, no live old mode remains, all modified skills validate, both smoke tests pass, and both SYSTEM files compare byte-for-byte. No later writing task is needed to restore validity.
- **Acceptance path**: `testing` selection → self-contained handoff → fresh `qa` level execution → exact SHA/level/scope/resource/UI/API/log/state receipt → `PASS | BLOCKED | UNVERIFIED` → validator/repair decision. PRESERVE: direct static closure, state gates, first failure/oracles, selective commits, validator separation, no QA task rows. CHANGE: CORE/FULL and one QA executor. REMOVE: builder testing mode and stale routes.
- **Counterexample pass**: a third “direct” QA level, jsdom counted as FULL browser, BrowserContext counted as backend isolation, fixed/shared resources treated as disposable, harness-builder self-certification, or one stale builder route would escape a prose-only rewrite. Exact level language, route grep, scenario smoke, fresh-session harness rule, and independent review close those counterexamples; no undeclared registry or later repair is required.

## Acceptance

- [ ] Exactly one new `qa` agent is discoverable with `model: openai-codex/gpt-5.6-sol`, `thinking: high`, matching `display_name`, a lean isolated prompt, explicit read-only/default versus authorized-harness tools/actions, and no visible chain-of-thought requirement.
- [ ] `testing` has exactly CORE and FULL: CORE proves only declared bounded scope; FULL requires every required safely exercised acceptance surface and a real browser for browser claims; direct static closure is outside QA, not a third level.
- [ ] Every QA receipt is SHA- and level-qualified and uses only `PASS | BLOCKED | UNVERIFIED`; unsafe/unavailable required evidence stays UNVERIFIED, while a concrete reproducible mismatch may be BLOCKED.
- [ ] The complete existing stateful-resource fail-closed policy, protected-resource postcheck, suspected-mutation stop/no-restore rule, first-failure/flaky rule, preserved-oracle rule, producer independence, validator separation, selective commits, and no QA task/SCHEDULE ceremony remain enforceable.
- [ ] FULL distinguishes DOM simulation, browser mocks, real browser execution, browser-context isolation, backend resource isolation, and UI/API/auth/session/persistence/async/log/state evidence without universal thresholds or framework prescriptions.
- [ ] Explicit FULL harness construction is test-only, exact-write-set, dependency/network-transparent, separate-checkpoint, non-self-certifying, and followed by a fresh read-only `qa` session against the new SHA.
- [ ] The inventory CLI, two conditional references, research/runtime memo, handoff template, global routes, builder-mode removal, SYSTEM mirror, and deterministic smoke all agree on this contract with no unrelated edits or dependencies.

## Constraints

- Preserve the skill name/command `testing`; do not create a `qa` skill, `qa-harness` skill, second QA agent, third level, registry, package, lockfile, extension, or production-project harness.
- Default QA is source-read-only. Give `qa` write/edit capability only so an explicitly authorized FULL harness phase can use the exact approved test-only write set; all other writes, commits, production edits, plans/memory edits, deploy/network operations, and repairs are forbidden.
- The harness phase must stop after handing exact changed files and evidence to the orchestrator for a selective new checkpoint. The same session never issues the final QA verdict.
- Keep state-safety rules in the always-loaded agent/skill core; load `core-qa.md` or `full-qa.md` only for the selected level. Keep ordinary technique detail out of `agents/qa.md`. The research memo is provenance/evaluation evidence, not mandatory runtime context.
- Do not expose raw chain-of-thought. Require concise decisions, commands, observations, resource receipts, failures, and gaps.
- Do not rewrite shared files wholesale, run repo-wide formatting/codemods, or touch any path outside `Change` and the named recovery root.
- Before editing, compare current status with the supplied baseline. Stop if a target is already dirty/untracked; every pre-existing unrelated entry remains excluded.

## Patch Anchors

- `skills/testing/SKILL.md`: edit by the existing frontmatter, `Core Invariant`, stateful-resource gate, gate selection, prompt/tester behavior, verdict, repair, ordering, and proportionality headings. Preserve safety/verdict/repair/no-ceremony substance while replacing executor and level semantics.
- `agents/builder.md`: remove `## Invocation Modes`, the `Post-build testing mode` paragraph, and the testing-mode condition in Workflow step 1; preserve the implementation operating/quality/workflow/result contract.
- `skills/builder/SKILL.md`: narrow patch at `## Result Handling` line 249; preserve all builder-tier routing and state safety.
- `skills/planner/SKILL.md`: narrow patch at `## 7. Execute the Plan` line 198; preserve direct closure, resource proof, checkpoint order, and the rule against testing-only tasks.
- `skills/agent-guide/SKILL.md`: update frontmatter/pre-flight wording, add one QA row and concise QA routing section, then align `Pipeline Order` and `Quick Checklist`; preserve every existing implementation/scout/planner tier.
- `SYSTEM.md` and `config/SYSTEM.md`: make identical narrow edits at `Skills and Delegation` line 53 and `Post-build closure` line 108 only; preserve lines 100–106 state safety/observability exactly in meaning.
- New `agents/qa.md`: follow validator-style isolation fields and Sol identity examples; tools are `read, grep, find, ls, bash, write, edit`, with prompt-enforced default read-only and explicit harness-only writes.

## Validation

- `node skills/testing/scripts/test/inventory-qa-surfaces.smoke.mjs` — `NO_STATEFUL_RESOURCES`; expected PASS and proves the referenced utility still has its static safety contract
- `node skills/testing/scripts/test/qa-contract.smoke.mjs` — `NO_STATEFUL_RESOURCES`; expected PASS for frontmatter identity, exactly two levels, verdict/safety/browser/harness markers, reference/template presence, mirror equality, and table-driven CORE/safe-FULL/unsafe-FULL/mock/harness scenario contracts
- PI `pi_validate_skill` tool on `/Users/j.henrique/.pi/agent/skills/testing`, `/Users/j.henrique/.pi/agent/skills/builder`, `/Users/j.henrique/.pi/agent/skills/planner`, and `/Users/j.henrique/.pi/agent/skills/agent-guide` — each returns PASS
- `cmp -s SYSTEM.md config/SYSTEM.md` — exit 0
- `rg -n --glob '*.md' 'POST-BUILD TEST MODE|Post-build testing mode|fresh `builder` testing session|fresh builder tester|builder-heavy testing session' SYSTEM.md config/SYSTEM.md agents skills` — no live matches
- `git diff --check` — no whitespace errors
- Focused base-to-head diff and pre/post status review — only declared paths changed; shared-file preservation markers and recovery snapshots remain intact; no unrelated dirty path is staged

## Stop If

- The result needs two QA skills/agents, a third QA level, a builder testing compatibility mode, a registry, new dependency, external operation, or production-project change.
- Any wording permits fixed/pre-existing/shared/unknown resources, destructive seed/reset fallback, mock-as-FULL, browser-context-as-backend-isolation, CORE-as-product-wide PASS, or harness self-certification.
- `pi_validate_skill`, agent discovery, both smoke tests, exact route grep, or SYSTEM comparison cannot pass without weakening a preserved invariant.
- Any target overlaps pre-existing dirty/untracked work or safe snapshots cannot be created.

## Checkpoint

- Recovery snapshot: required before edits at `.pi/recovery/20260724_220541Z_single_qa_two_levels_task_02/before/`, preserving byte-for-byte `agents/builder.md`, `skills/testing/SKILL.md`, `skills/builder/SKILL.md`, `skills/planner/SKILL.md`, `skills/agent-guide/SKILL.md`, `SYSTEM.md`, and `config/SYSTEM.md`. Do not alter any pre-existing recovery entry.
- Commit scope: exactly the thirteen `Change` paths. Keep the named recovery root as a task-owned rollback artifact and never stage another recovery path; stage it only if the repository's existing recovery policy tracks it, otherwise leave it out of the selective source checkpoint.
