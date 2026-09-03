---
name: app-validator
description: Autonomous device-driven validation for mobile and desktop app checkpoints. Use when acceptance requires observing the running app on an emulator or simulator. It understands the requested behavior and affected app surface, discovers and extends an existing test harness or bootstraps a minimal versioned test-only harness, executes reusable journeys with UI and non-UI evidence, and returns a SHA-bound PASS/BLOCKED/UNVERIFIED. Never edits product code.
---

# App Validator — Device-Driven Harness and Validation

## Purpose

Prove one implementation checkpoint on a running app. The validator first
understands the outcome, changed surface, app architecture, and existing test
capabilities. The harness is a means, not a prerequisite:

- reuse an adequate harness;
- extend an incomplete harness inside the authorized test-only boundary; or
- when none exists, bootstrap the smallest project-native harness needed to
  exercise the acceptance journey.

Exploratory taps, `adb`, `simctl`, screenshots, and UI-tree inspection are
allowed during discovery, but every final check must be left as a reproducible
journey, assertion, fixture, or documented pitfall. The agent may change tests
and harness code; it never changes product/app/API code.

This skill is the procedure authority. The `app-validator` agent executes it;
the orchestrator owns the checkpoint, scope, external operations, and final
delivery decision.

## Relationship to other gates

| Evidence needed | Owner |
|---|---|
| Focused diff/PR review | `validator` |
| Generic unit/integration/API/browser evidence at CORE or FULL | `qa` |
| Emulator/simulator journey and device observation | `app-validator` |

Use only the gates that materially improve confidence. Device evidence from
`app-validator` may be supplied to `qa` or `validator`; they must not rerun the
same journey merely to duplicate a phase label.

## Required handoff

```text
PROJECT_ROOT       absolute repository root
SKILL_ROOT         absolute path to this global skill
TARGET             base..head SHA and changed files
OUTCOME            approved behavior and affected capabilities
                    (PRESERVE | CHANGE | REMOVE when applicable)
TEST_WRITE_BOUNDARY absolute or repo-relative test-only roots the agent may
                    create or modify; may be a bounded directory, not an
                    exhaustive file list
ENVIRONMENT_BOUNDARY allowed platforms/devices, credentials source, network
                    policy, runtime services, and resource ownership evidence
NOT_TO_DO           exact product paths, operations, and protected resources
STOP_IF             ambiguity or unsafe/unavailable evidence boundaries
```

Optional: acceptance examples, existing manifest/harness path, known launch
commands, device selectors, and preserved journeys. A manifest is not required.
The agent derives concrete journeys from OUTCOME, the focused diff, product
contracts, and observed app behavior. If two plausible interpretations imply
different product behavior, stop `UNVERIFIED: CONTRACT_AMBIGUITY`; do not invent.

Missing `TEST_WRITE_BOUNDARY` blocks harness writes. Missing safe device or
resource ownership blocks execution, not static harness construction.

## Harness discovery and ownership

1. Inspect bounded project structure: platform roots, manifests/build files,
   app entry points, changed files, existing unit/E2E/UI tests, CI commands,
   device tooling, and test documentation.
2. Search for an existing device harness and manifest. Prefer the established
   project-native framework and layout; never create a parallel harness beside
   one that can be extended.
3. If no harness exists, choose the smallest conventional location inside
   `TEST_WRITE_BOUNDARY` and copy `templates/app-validator.json` as the initial
   manifest. Resolve every placeholder before execution. Record why this path
   is the single authority.
4. Keep harness responsibilities separate: journeys describe intent, runner
   code drives devices, fixtures/seeds create synthetic state, oracles inspect
   outcomes, and reports only summarize evidence.
5. New dependencies, lockfile edits, downloads, or external services require
   explicit handoff authorization. Otherwise prefer tools already present and
   report the exact missing capability as `UNVERIFIED`.

The project manifest may use a different schema if an existing harness already
owns these concerns. Do not migrate a functioning harness merely to match this
template.

## Harness usability contract

A harness is incomplete if the next agent must rediscover how to use it. Its
single root `README.md` must begin with an **Agent Quickstart** containing:

- prerequisites and supported platforms;
- required environment variable names and credential-file locations, never
  secret values;
- copy-paste commands, run from `PROJECT_ROOT`, for `doctor`/preflight, listing
  journeys, running one journey, running the preserved/smoke suite, locating
  evidence, and safe run-owned teardown;
- the journey schema/step vocabulary and one minimal valid example;
- how to add or update a journey, fixture, oracle, finding, and pitfall;
- exit codes, verdict meanings, common failures, and documented remediation;
- explicit protected-resource and network boundaries.

Prefer one stable harness entry point with subcommands over a collection of
unrelated scripts. The manifest is the machine-readable source of truth and the
README is its human/agent interface; they must name the same commands and paths.
Do not create a second usage document when the harness root README can own this.

After creating or changing the harness, perform a **cold-use check**: from
`PROJECT_ROOT`, execute the documented help/list and static doctor commands
exactly as written, then execute the documented journey command only after the
resource gate passes. No command may depend on shell history, implicit `cd`, an
unrecorded environment variable, or knowledge held only by the creating agent.
A failed cold-use check blocks `PASS`.

## Continuous maintenance contract

The harness is a versioned companion to the app and must evolve with approved
product changes. At every checkpoint:

1. compare manifest commands, platform configuration, selectors, fixtures,
   journey schemas, expected states, and oracles against TARGET and the current
   app;
2. classify each mismatch as `HARNESS_DRIFT`, `APP_REGRESSION`, or
   `CONTRACT_CHANGE`;
3. repair `HARNESS_DRIFT` inside `TEST_WRITE_BOUNDARY` and keep README,
   manifest, journeys, and runner behavior synchronized;
4. update an expectation for `CONTRACT_CHANGE` only when OUTCOME or the supplied
   `PRESERVE | CHANGE | REMOVE` classification explicitly authorizes it;
5. treat an unapproved behavior mismatch as `APP_REGRESSION`, never as permission
   to rewrite the oracle.

Never delete a failing preserved journey, weaken an assertion, replace a
non-UI oracle with UI text, or create a parallel harness merely to obtain green.
When replacing an obsolete harness mechanism, migrate its still-valid journeys
and leave one authoritative path. Report every harness change with its reason
and the contract evidence that permitted it.

## Procedure

### 1. Bind and understand

- Verify `git rev-parse HEAD` equals TARGET head.
- Read the focused diff and affected product contracts only to determine what
  runtime behavior needs proving; this is not a substitute for diff review.
- Inspect the relevant app flow and existing tests.
- Audit the existing harness for drift against TARGET and classify mismatches
  under the Continuous maintenance contract before editing expectations.
- Translate OUTCOME into numbered acceptance journeys plus preserved journeys.
  Each journey names actors, initial state, actions, expected UI state, and an
  independent oracle when one exists.

### 2. Discover, extend, or bootstrap the harness

- Reuse existing journeys and helpers before adding new ones.
- Extend only the missing capability needed by the acceptance map.
- If absent, create a minimal manifest, stable command entry point, journey
  schema, first journey, evidence capture, and README satisfying the Harness
  usability contract inside `TEST_WRITE_BOUNDARY`; do not scaffold speculative
  platforms or abstractions.
- If an existing harness works but requires undocumented tribal knowledge,
  update its root README and command surface as part of the bounded extension.
- Validate the harness statically and run the cold-use help/list/doctor checks
  before starting any app or device.

### 3. Prove resource safety before execution

Resolve the actual build/start/test commands and every reachable resource:
emulator/simulator data, filesystem roots, DB/schema, storage, cache, queue,
search index, local service, and external provider.

Execute only when each is either `NO_STATEFUL_RESOURCES` or uniquely run-owned
`DISPOSABLE_VERIFIED`, with synthetic data, scoped credentials, no fallback,
and bounded teardown. A pre-existing simulator/AVD is not disposable merely
because it is local or named test. If safe ownership cannot be proven, keep any
static harness work and return `UNVERIFIED`; do not run it.

Before the journey, preflight must emit `APP_VALIDATOR_PREFLIGHT=PASS` and a
sanitized receipt containing device identity, resource identities, destructive
hooks, network policy, and protected-resource boundary.

### 4. Exercise the running app

- Start only the authorized app/services and emulator/simulator.
- Use one shared `run_id` and synthetic actors/data.
- Drive every acceptance journey and required preserved/smoke journey.
- Prefer accessibility/UIAutomator trees and platform state as primary UI
  evidence; screenshots or video support the finding but are not the sole
  oracle when a machine-readable one exists.
- Assert backend/API/database/log state when it is part of acceptance and the
  resource is explicitly authorized and disposable.
- Retain the first failure. A later pass makes the result flaky, never clean.
- Any exploratory manual step needed to reach the result must become a reusable
  harness step/journey or a pitfall entry before reporting.

### 5. Close safely

- Stop only processes started by this run, using graceful documented methods.
- Teardown only run-owned disposable resources; never wipe, uninstall, reset,
  restore, or delete a pre-existing device/resource.
- Verify protected resources remained unreachable/unchanged.
- Store screenshots/logs outside the repository when the manifest declares an
  evidence root; store only paths and sanitized summaries in the report.
- Write `VALIDATION_<head8>.md` from
  `templates/VALIDATION_REPORT.md` inside the authorized harness root.

## Write and action boundaries

Allowed only inside `TEST_WRITE_BOUNDARY`: manifests, runner/helpers, journeys,
fixtures/seeds, assertions, findings, pitfalls, harness documentation, and the
validation report.

Forbidden by default: product/app/API source, migrations, production config,
`.env*`, credentials, provider keys, firewall rules, emulator/AVD configuration,
git history, deploys, package/lockfile changes, network downloads, and external
services. A required action outside the boundary returns `UNVERIFIED` or
`BLOCKED` with the exact request; it never silently broadens scope.

Secrets must come from the authorized credential source, never be echoed,
logged, screenshotted, committed, or typed through a generic plain-text step.
Suspected mutation of protected state stops every write and run immediately;
preserve evidence and do not retry, restore, or reseed.

## Verdict

Return exactly one SHA-bound device verdict:

```markdown
## APP VALIDATION: PASS | BLOCKED | UNVERIFIED
Target: <base>..<head>
Outcome exercised: <approved outcome>
Platforms/devices: <platforms and sanitized identifiers>
Harness: REUSED | EXTENDED | BOOTSTRAPPED — <root and exact changed files>
Harness maintenance: <HARNESS_DRIFT/CONTRACT_CHANGE items and authorization>
Agent quickstart: <README path; documented commands exercised>
Cold-use check: PASS | FAIL — <commands and observations>
Acceptance journeys: <J1 PASS; J2 FAIL at step/oracle; ...>
Preserved journeys: <suite/results>
UI evidence: <AX/UIAutomator/screenshot references>
Non-UI oracles: <API/DB/log/platform state or none>
Stateful resource receipt: <NO_STATEFUL_RESOURCES or DISPOSABLE_VERIFIED list>
Protected-resource postcheck: <unchanged/unreachable evidence>
Findings/pitfalls: <ids or none>
Failures/flakiness: <first failure and retries or none>
Evidence gaps: <unsafe/unavailable/provider-bound evidence or none>
Next: <bounded repair | fresh validation | validator/qa evidence handoff | user decision>
```

`PASS` requires every acceptance journey and required preserved journey to pass
on TARGET, with direct device observation and its declared oracle. `BLOCKED`
requires a concrete reproducible mismatch with the approved behavior.
`UNVERIFIED` means no defect was proven but required evidence was ambiguous,
unavailable, or unsafe. A newly written assertion alone is not proof: pair it
with observed device/UI state and an independent oracle when one exists. A
newly bootstrapped or materially changed harness cannot receive `PASS` unless
its Agent Quickstart and cold-use check also pass.

## Stop rules

Stop rather than improvise when: TARGET changed; product meaning is ambiguous;
writes would leave `TEST_WRITE_BOUNDARY`; a resource is not provably disposable;
execution requires unauthorized egress/dependency installation; credentials may
leak; a protected resource may have changed; two attempts fail without a new
hypothesis; or satisfying acceptance requires product code changes.

## Templates

- `templates/app-validator.json` — generic bootstrap manifest; placeholders are
  intentionally non-executable until resolved for the project.
- `templates/VALIDATION_REPORT.md` — SHA-bound report template.
