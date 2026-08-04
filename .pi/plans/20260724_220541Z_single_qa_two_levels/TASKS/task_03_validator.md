# Task 03: Validate QA safety, level honesty, and harness separation

**Agent**: validator  
**Why**: A plausible prompt can pass structural smoke yet still weaken state safety, overstate CORE/FULL evidence, misclassify browser mocks, or let a harness builder certify itself.  
**Goal**: Return PASS only when the exact producer checkpoint and live prompt-eval receipts enforce the approved single-agent/two-level QA contract without unrelated changes.

## Read

- Producer base-to-head diff from `9305bd7a6e43430a37e2e92051c127488d1f7824` through the exact checkpoint hash recorded in the schedule — complete review target
- `skills/testing/SKILL.md` — global selection, safety, verdict, repair, and orchestration contract
- `agents/qa.md` — model identity, tool/action boundaries, level behavior, and evidence output
- `skills/testing/references/core-qa.md` — CORE evidence scope and conditional techniques
- `skills/testing/references/full-qa.md` — browser/full-stack/resource/harness rules
- `skills/testing/templates/qa-handoff.md` — self-contained invocation fields and harness authorization boundary
- `skills/testing/scripts/inventory-qa-surfaces.mjs` and both `skills/testing/scripts/test/*.smoke.mjs` — static safety and deterministic contract evidence
- `agents/builder.md`, `skills/builder/SKILL.md`, `skills/planner/SKILL.md`, `skills/agent-guide/SKILL.md`, `SYSTEM.md`, and `config/SYSTEM.md` — executor-route closure and preservation surfaces
- Five scenario-group receipts supplied by the orchestrator (six fresh `qa` sessions because harness build and fresh-run certification are separate) — behavior-level prompt evidence bound to the producer checkpoint
- Producer validation output for both Node smokes, four `pi_validate_skill` runs, agent discovery, route grep, SYSTEM comparison, diff check, focused status review, and recovery snapshot verification

## Change

- Files Touched: none — review the named checkpoint and evidence without production, test, plan, memory, schedule, recovery, or git-history edits

## Acceptance

- [ ] The changed surface contains one `testing` skill and exactly one discoverable `qa` agent with GPT-5.6 Sol high identity; no builder testing mode, old marker, second QA skill/agent, or third level remains.
- [ ] CORE PASS is explicitly limited to declared CORE acceptance, FULL PASS requires every required safely exercised surface, and direct static closure is outside QA rather than a level.
- [ ] Fixed/pre-existing/shared/unknown resources, destructive fallback, missing setup/auth/seed/credential proof, or suspected mutation can never produce execution or PASS; protected-resource postcheck and no retry/restore/reseed rules remain intact.
- [ ] DOM simulation/component tests and mocks are labeled CORE/partial evidence; FULL browser evidence requires a real browser, and BrowserContext is never treated as backend resource isolation.
- [ ] Authorized harness construction has an exact test-only write set, no hidden dependency/network spend or production edits, a separate checkpoint/new SHA, and a different fresh read-only QA session for the final verdict.
- [ ] First failure, flaky retry classification, preserved oracles, SHA/level/scope-qualified receipts, exact `PASS | BLOCKED | UNVERIFIED`, producer independence, validator separation, selective commits, and no QA task/SCHEDULE ceremony are all preserved.
- [ ] Deterministic validation and all five prompt-evaluation groups support these findings; SYSTEM mirrors match and unrelated pre-existing dirty/untracked files are absent from the checkpoint.

## Constraints

- Review only the supplied base/head, exact changed files, directly affected contracts, and supplied evidence. Do not broaden into unrelated agents, projects, historical plans, live environments, or external research.
- Do not execute any app, browser, test suite, seed/reset, migration, network call, or command with stateful/unknown resources. The permitted focused checks below are `NO_STATEFUL_RESOURCES` and read source/committed fixtures only.
- Do not accept static keyword presence as sufficient when the surrounding prompt permits an escape risk. Conversely, do not block on style or hypothetical issues outside the approved contract.
- On BLOCKED, identify the exact file/section, violated invariant, and smallest bounded producer repair; pause completion and require the same gate to rerun against the repaired SHA.

## Validation

- `node skills/testing/scripts/test/inventory-qa-surfaces.smoke.mjs` — expected PASS; script remains non-executing, sanitized, and non-authoritative
- `node skills/testing/scripts/test/qa-contract.smoke.mjs` — expected PASS; structural/scenario contract is internally consistent
- `cmp -s SYSTEM.md config/SYSTEM.md` — expected exit 0
- `rg -n --glob '*.md' 'POST-BUILD TEST MODE|Post-build testing mode|fresh `builder` testing session|fresh builder tester|builder-heavy testing session' SYSTEM.md config/SYSTEM.md agents skills` — expected no live matches
- `git diff --check 9305bd7a6e43430a37e2e92051c127488d1f7824..<producer-checkpoint>` — expected no whitespace errors in the reviewed range
- Inspect each prompt-eval receipt — expected level/target/scope/resource/postcheck/verdict/gap fields and the case-specific barrier; missing, self-contradictory, self-certifying, or overclaiming evidence is BLOCKED
- Verdict: `PASS` only when every acceptance item is supported; otherwise `BLOCKED` with exact bounded findings

## Stop If

- The producer checkpoint hash, complete focused diff, required validation outputs, or any prompt-eval receipt is missing or bound to a different SHA.
- A command would require stateful-resource inference, app/browser startup, provider/network access, or mutation; review existing evidence instead and return BLOCKED if required acceptance cannot be evaluated.

## Checkpoint

- Recovery snapshot: not required; review-only quality gate.
- Checkpoint Commit: not required (quality gate); record only `PASS | BLOCKED` in the schedule/orchestrator log and never create an empty commit.
