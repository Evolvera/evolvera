---
name: code-audit
description: Adaptive, user-gated, maximum-depth code audit in an isolated OS-temp mirror. Derives system-specific scout missions, proves candidates before publication, verifies the origin stayed unchanged, and emits one self-contained HTML report.
---

# Code Audit

Run a read-only audit with low false-positive tolerance. Read [references/perspective-catalog.md](references/perspective-catalog.md) and [references/evidence-contract.md](references/evidence-contract.md) before synthesizing missions. This workflow audits; it never fixes.

## Non-negotiable target boundary

The origin is read-only. Never create a file, directory, branch, stash, worktree, commit, report, cache, log, build output, coverage output, or `.pi/audits` there. Never install packages, generate/format code, build, test, or execute project code against the origin. Ban all target-side `git branch|switch|checkout|stash|worktree|add|commit|reset|clean` operations. Initial origin access is limited to canonicalization, read-only inventory, hashing, Git metadata/status/diff hashing, and copying selected regular files. After snapshot, agent prompts receive only the mirror path—never the origin. The integrity verifier alone may re-read the origin path stored in the baseline manifest.

All analysis artifacts remain under an independent mode-0700 run root created by `scripts/prepare-audit-workspace.mjs` in Node `os.tmpdir()` with prefix `pi-code-audit-`. It creates `mirror/`, `proof/`, `evidence/`, `findings/`, `logs/`, `cache/`, and `report/`, omits `.git`, never follows symlinks, and is never automatically cleaned. The canonical mirror is read-only evidence; every dynamic proof uses a separate `<run-root>/proof/<EVD-ID>/workspace` copy so test/install side effects cannot alter the analysis snapshot. The only final deliverable is `<run-root>/code-audit-report.html`; other receipts remain temporary evidence. Never write an audit artifact into the target or the PI harness repository.

## State machine

Use exactly these states and advance only in order:

`INTAKE -> TEMP_SNAPSHOT -> ORIENTATION -> MISSION_SYNTHESIS -> USER_APPROVAL -> SCOUT_WAVES -> TRIAGE -> APPROVED_PROOF -> ADJUDICATION -> SOURCE_INTEGRITY -> HTML_REPORT -> REPORT_VALIDATION -> COMPLETE`

- **INTAKE:** establish canonical target, objective, users/stakes, mode (`focused|deep|maximum`), whether Git-unignored untracked files are intentionally included, and any supplied contract. Stop on target/root ambiguity.
- **TEMP_SNAPSHOT:** run `node <skill>/scripts/prepare-audit-workspace.mjs [--include-untracked] <target>` only. Parse its JSON result. Confirm source and mirror membership hashes match. A Git target must be its repository root. Never remove this run automatically.
- **ORIENTATION:** inspect only the mirror with read-only tools. Identify actual entry points, trust boundaries, data/state, lifecycle, concurrency, interfaces, languages/frameworks, tests, deployment/config evidence, and failure consequences. No Agent call and no project command yet.
- **MISSION_SYNTHESIS:** derive system-specific perspectives; the catalog is candidate prompts, not a checklist. Dedupe overlap. Record omission rationale for every applicable high-impact family not selected.
- **USER_APPROVAL:** print the literal proposal below and stop. Accept only the exact token `APPROVE CODE AUDIT <RUN_ID>` in a later user message. Any change to target, mission, count, command, network, credential use, or execution route invalidates approval; create a fresh run ID/proposal. Approval never implies retries or extra agents.
- **SCOUT_WAVES:** run only approved missions, in approved waves, against mirror paths. Reconcile and persist each wave before launching the next.
- **TRIAGE:** maintain the candidate ledger and apply `OBSERVATION`, `CANDIDATE`, `PROVEN`, `DISPROVEN`, `UNVERIFIED` conservatively.
- **APPROVED_PROOF:** execute only literal pre-approved proof commands in verified confinement. An unavailable/failed proof yields UNVERIFIED, not a defect.
- **ADJUDICATION:** use only pre-approved validator calls. Consensus is not proof.
- **SOURCE_INTEGRITY:** run `node <skill>/scripts/verify-source-unchanged.mjs <run-root>/baseline-manifest.json`. Any mismatch is `INTEGRITY_FAILURE`; do not attribute it to the audit or to concurrent work.
- **HTML_REPORT:** after integrity, render the template to exactly `<run-root>/code-audit-report.html`. No other deliverable. Remove every placeholder and embed the complete machine-readable ledger.
- **REPORT_VALIDATION:** run `node <skill>/scripts/validate-audit-report.mjs <run-root>/code-audit-report.html`. Repair only the report in the run root, never source. If validation cannot pass, stop.
- **COMPLETE:** return the report path, integrity status, proven/unverified/disproven counts, retention notice, and limitations. “No proven defects” does not mean defect-free.

## Snapshot and inventory

By default, prepare copies tracked regular files from `git ls-files`; `--include-untracked` additionally selects Git-unignored untracked files and records that choice. Tracked or selected symlinks are recorded and skipped, never followed. Non-Git targets use a conservative recursive regular-file inventory with explicit standard exclusions. Filesystem root and the current user's home root are rejected.

The baseline manifest records SHA-256 membership/content, source root, Git head/branch/status/diff/staged-diff hashes, inventory mode, exclusions, skipped symlinks/non-regular/missing entries, all temp paths, and timestamps. Verification repeats the same selected inventory. PASS requires exact selected membership/content and Git head/branch/status/diff equality. A mirror mutation must not alter the origin and does not itself fail source integrity.

## Mission derivation and ceilings

Modes are ceilings, never quotas:

| Mode | Logical missions | Waves |
|---|---:|---:|
| focused | <= 8 | 1 |
| deep | <= 32 | <= 4 |
| maximum | <= 100 | <= `ceil(100 / runtime maxConcurrent)` |

Read the current runtime concurrency setting; never edit it. This repository currently caps concurrency at 8, so maximum means at most 8 simultaneous Agent calls and at most 13 waves—not 100 simultaneous calls. Use fewer missions when evidence warrants fewer. One mission equals one perspective/shard. Every mission must state: ID, one question, why material, exact mirror scope, evidence required, route (`scout-highspeed`, `scout`, or pre-approved `validator` only where applicable), and stop conditions. Use highspeed only for narrow retrieval. Use normal scout for coherent semantic perspectives or broad state. Do not split merely to fill capacity.

## Literal approval proposal

Before any Agent fan-out or project command, print this fully populated block and stop:

```text
CODE AUDIT RUN PROPOSAL
RUN_ID: <run id>
CANONICAL_TARGET: <origin; shown to user only, never agents>
TEMP_ROOT: <run root>
MIRROR: <mirror path>
SNAPSHOT: <inventory mode; include-untracked true|false; membership SHA-256; file count>
SOURCE_SET: <selected tracked/untracked or conservative regular files>
EXCLUSIONS: <exact exclusions and skipped symlink summary>
OBJECTIVE: <objective>
MODE: focused|deep|maximum (ceiling: <missions>; waves: <waves>)
RUNTIME_MAX_CONCURRENT: <observed value; not modified>
MISSIONS:
01. <ID> | <route> | <question> | materiality=<why> | scope=<exact mirror paths> | evidence=<required> | stop=<conditions>
...
AGENT_COUNTS: highspeed=<n>; normal=<n>; validator=<n>
WAVE_SCHEDULE: wave 1=[IDs, <= runtime cap]; ...
MODEL_AND_TURN_EXPOSURE: <agent type -> configured model/thinking/max turns; total approved calls and maximum turns>
MONEY: UNKNOWN
PROOF_COMMANDS:
01. literal=<full argv/command> | cwd=<proof workspace/sandbox path> | timeout=<seconds> | env=<full audit env overrides> | network=<DENIED or exact approved hosts> | confinement=<verified backend and target-not-mounted statement>
... or NONE (static analysis only)
DEPENDENCY_AND_PROJECT_EXECUTION: <none, or exact frozen-lockfile installation/project code/tests inside a named proof workspace; lifecycle scripts explicitly allowed|denied>
SOURCE_TO_PROVIDER_DISCLOSURE: <which mirror scopes may be sent to each configured model/provider; origin path is not sent>
NETWORK_AND_CREDENTIALS: network=DENIED by default, otherwise exact approved hosts for the named proof only; credentials=NONE
HTML_REPORT: <run-root>/code-audit-report.html
RETENTION: run is retained in OS temp until the user manually removes it; no automatic cleanup
APPROVAL_TOKEN: APPROVE CODE AUDIT <RUN_ID>
```

If money data is unavailable, it must say `UNKNOWN`; do not estimate. Include every proof command literally—not a pattern or script family. Disclose all project/dependency execution even when local. Any requested addition returns to USER_APPROVAL with a new run ID. No implicit retries, replacement scouts, continuation calls after PARTIAL, adjudicators, commands, network, or credentials.

## Command environment and confinement

For every approved command, set paths beneath the run root at minimum:

```text
HOME=<run-root>/cache/home
TMPDIR=<run-root>/cache/tmp
TMP=<run-root>/cache/tmp
TEMP=<run-root>/cache/tmp
XDG_CACHE_HOME=<run-root>/cache/xdg
XDG_CONFIG_HOME=<run-root>/cache/config
XDG_DATA_HOME=<run-root>/cache/data
npm_config_cache=<run-root>/cache/npm
YARN_CACHE_FOLDER=<run-root>/cache/yarn
PNPM_HOME=<run-root>/cache/pnpm-home
PNPM_STORE_DIR=<run-root>/cache/pnpm-store
PIP_CACHE_DIR=<run-root>/cache/pip
CARGO_HOME=<run-root>/cache/cargo-home
CARGO_TARGET_DIR=<run-root>/cache/cargo-target
GOCACHE=<run-root>/cache/go-build
GOMODCACHE=<run-root>/cache/go-mod
COVERAGE_FILE=<run-root>/evidence/.coverage
NYC_OUTPUT=<run-root>/evidence/nyc
NODE_REPL_HISTORY=<run-root>/logs/node-repl-history
```

Create these locations only below the run root. Redirect tool-specific logs, coverage and output explicitly; do not rely on defaults. Environment redirection is **not a security sandbox**. Dynamic project code/tests may run only in a verified container/process sandbox that receives a disposable per-evidence proof workspace copied from the temp mirror, never the mirror itself and never the origin, carries no credentials, and constrains writes to the run root. The proposal must identify the backend and literal invocation. Network is denied by default. A frozen-lockfile dependency install may use only exact pre-approved hosts, commands, lifecycle-script policy, and proof workspace; any change requires a new approval token. If no verified confinement backend exists, allow static scout analysis only; dynamic candidates remain UNVERIFIED. If an approved dynamic proof requires unavailable confinement, stop—never silently downgrade or execute it directly.

No external operation, production/staging/database mutation, credential, live-service access, or live exploit is allowed. Security proof must be safe and non-destructive. Package installation or network outside the exact approved confined proof is forbidden.

## Wave and evidence protocol

Launch each independent wave in one parent message with multiple `Agent` calls, `run_in_background: true`, never exceeding runtime concurrency. Each prompt is self-contained: objective, mission ID/question/materiality, exact mirror-only scope, evidence required, evidence-state vocabulary, no origin path, no command execution, no writes, and stop conditions. Scouts are read-only by capability and return text; the orchestrator saves returned text under `<run-root>/findings/<mission-id>.md`. Reconcile all completed results and candidate ledger changes before the next wave. A PARTIAL result does not authorize a retry or continuation; stop if another call is needed.

A defect is publishable only as PROVEN and includes exact mirror-relative evidence, authoritative contract/invariant, reachability/preconditions, smallest non-destructive falsifying check, actual versus expected, reproducibility or deterministic proof, impact, counterevidence, confidence, and evidence hashes. Severity and confidence are separate. Do not expose secrets or sensitive payloads. Validator adjudication is allowed only when listed in the approved mission/count schedule, and a validator cannot substitute consensus for proof. Never use a mutation-capable builder tester for proof.

## Report contract

Copy the sanitized grammar of [templates/audit-report.html](templates/audit-report.html): dark self-contained document, hero badges, sticky navigation, cards, matrices, limitations, responsive and print layout. Preserve this fixed section ID order:

`run-integrity`, `executive-summary`, `system-objective`, `audit-scope`, `perspectives`, `proven-defects`, `unverified-candidates`, `disproven-candidates`, `evidence-ledger`, `coverage-gaps`, `run-manifest`, `limitations`.

Write visible prose in the user's language while keeping fixed section IDs, finding/evidence IDs, and the machine schema stable. Use concise language, semantic landmarks, visible focus, sufficient contrast, compact empty states, severity/confidence chips, finding cards, and an evidence table. Inline CSS only; no executable/external JavaScript, styles, assets, or remote links. Embed one `<script type="application/json" id="audit-data">` matching the validator schema. The template keeps placeholders inside JSON strings only so the template itself parses; when rendering, replace the entire `audit-data` payload with escaped `JSON.stringify` output so counts are numbers and arrays contain the complete ledger. Only PROVEN entries belong in `defects` and visible proven counts; UNVERIFIED and DISPROVEN remain separate. An integrity failure must be prominent and cannot claim COMPLETE/PASS.

Always state: no absolute certainty or exhaustive guarantee; hashes cover selected content only; the mirror differs from production; ignored/generated/secret/environment data may be excluded; static analysis can miss runtime behavior; and even 100 missions do not prove absence of bugs.

## Hard stops

Stop without silent downgrade for: missing exact approval; target/root ambiguity; more than 100 logical missions; source/mirror hash mismatch; target membership/head/status/diff change; unavailable confinement for approved dynamic proof; unapproved command/network/credential; scope expansion; scout PARTIAL needing another call; conflicting expected contract; insufficient evidence; provider/resource limit; or report validation failure. Preserve the run root and report the smallest next user decision. Never weaken temp isolation, proof requirements, approval token, mission/concurrency ceilings, source-integrity checks, or report schema.