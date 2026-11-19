---
name: app-validator
description: Orchestrates reliable mobile/desktop device validation after implementation. It aligns with the user on PARTIAL versus COMPLETE scope, uses scout to understand the app and user-story coverage, uses builder to create or maintain one documented versioned test harness, then launches the independent read-only app-validator agent to exercise the running app on an emulator/simulator and return a SHA-bound PASS/BLOCKED/UNVERIFIED. Use when device observation is required; the validator never edits product or harness code.
---

# App Validator — Orchestrated Device Validation

## Purpose

Produce trustworthy emulator/simulator evidence without making one agent both
write and certify its own tests. This skill is the orchestration authority. It
coordinates existing specialist roles:

- the **orchestrator** confirms scope, owns checkpoints, and authorizes and
  bounds every external/device action;
- **scout** understands the app, user stories, affected journeys, harness, and
  resource boundaries;
- **builder** creates or maintains test-only harness code and documentation;
- **app-validator** independently executes only the expressly delegated,
  documented run-owned commands and observes the device;
- generic **qa** or **validator** may consume the resulting evidence when their
  separate scope is needed, but must not duplicate the same device journey.

The harness is a maintained, versioned companion to the app. The validator is
not its author.

## First decision: PARTIAL or COMPLETE

Determine the requested coverage before discovery or device work:

| Mode | Meaning |
|---|---|
| `PARTIAL` | Prove one change/user story plus materially affected and required preserved journeys. Update the coverage map only for discovered impact. |
| `COMPLETE` | Inventory every app root and evidenced user-facing capability in scope, close or declare every material coverage gap, and run the complete known device suite. |

If the user explicitly names the mode, use it. If a bounded issue/change is the
clear target, `PARTIAL` is a valid explicit inference stated before execution.
If “validate the app”, “cover everything”, or cost/scope is ambiguous, ask the
user to choose `PARTIAL` or `COMPLETE` and explain the difference in one short
question. Never silently call a partial run complete.

“User history” means evidenced user stories, acceptance criteria, product docs,
routes/screens, existing journeys/tests, and the approved conversation outcome.
Do not dump the entire conversation into subagents: reconcile relevant history
into the handoff. Undocumented business behavior remains a coverage `GAP`, not
an invented requirement.

## Role boundaries

| Role | May inspect | May write repo | May run device | Verdict |
|---|---|---|---|---|
| Scout | app/docs/tests/harness/config | no | no | evidence report only |
| Builder | scoped app context + test surfaces | exact test-only write set | only local static/fixture checks authorized by its task; never final certification | implementation COMPLETE/BLOCKED |
| App Validator | target contract + harness + focused app context | **no** | yes, after resource proof | APP VALIDATION PASS/BLOCKED/UNVERIFIED |

The app-validator agent never repairs product code, harness code, journeys,
selectors, fixtures, docs, or oracles. A harness gap goes back to builder; a
product mismatch goes to the product repair owner. Any change requires a fresh
validator session against the new checkpoint.

## Orchestration workflow

Load `agent-guide` before launching scout or builder. Follow its capacity,
handoff, write-set, resource, and stop rules rather than duplicating them here.

### 1. Reconcile the validation contract

Record:

```text
MODE                 PARTIAL | COMPLETE
PROJECT_ROOT         absolute repository root
TARGET               base..head SHA and changed files
OUTCOME              approved behavior/user stories
CAPABILITIES         PRESERVE | CHANGE | REMOVE where applicable
PLATFORMS             android | ios | desktop and required actors/devices
KNOWN_CONSTRAINTS     credentials, network, providers, runtime services
DONE                  exact journeys/evidence required for the selected mode
```

A device test is not authorized merely because the mode is known. Resource
ownership is proved separately before execution.

### 2. Scout the app and harness

Use a bounded scout when the app/harness is not already fully grounded;
`COMPLETE` always requires repository-wide app-surface reconnaissance, sharded
only at real platform/product boundaries under `agent-guide` rules.

The scout reports exact evidence for:

- app/platform roots, build and launch entry points;
- evidenced user stories, actors, screens/routes, navigation/deep links,
  permissions, happy/error/recovery states, offline/realtime/provider behavior;
- existing unit, integration, UI/E2E tests and device tooling;
- existing harness authority, manifest, commands, journeys, fixtures, oracles,
  documentation, CI use, and drift;
- coverage candidates classified `COVERED | PARTIAL | GAP | PROVIDER_BOUND`;
- every stateful resource and destructive/setup/teardown hook reachable by
  build, app, emulator/simulator, runner, and services;
- smallest test-only write boundary and whether the existing harness can be
  extended or the canonical fallback is required.

Scout never creates the harness or decides product semantics. The orchestrator
reconciles its report into an exact builder contract and resolves material
ambiguity with the user.

### 3. Decide whether builder work exists

- Existing harness covers the selected contract, is current, and its documented
  command surface works → skip builder and proceed to independent validation.
- Harness missing, incomplete, stale, undocumented, or lacking required
  journeys/oracles → launch builder with one exact test-only write boundary.
- Required product behavior itself is missing → do not hide it in harness work;
  route a separate product builder only when authorized.

The builder must:

1. reuse and converge the existing harness rather than add a parallel one;
2. bootstrap the canonical fallback only when no maintainable harness exists;
3. create/update manifest, runner/adapters, journeys, fixtures, oracles,
   `COVERAGE.md`, findings schema/pitfalls, and root `README.md` only as required;
4. classify maintenance as `HARNESS_DRIFT` or authorized `CONTRACT_CHANGE`;
5. never delete a failing preserved journey, weaken an assertion, replace an
   independent oracle with app-rendered UI text, or alter expected behavior
   merely to make the run green;
6. statically validate the harness and execute its documented help/list/doctor
   interface against disposable fixtures, but not issue the final app verdict;
7. report exact changed files and commands for orchestrator checkpoint review.

Builder static, interface, dry-run, and exit-zero checks certify authorship
readiness only; they never certify runtime behavior on a device. Static or
dry-run success, a zero exit code, or a screenshot alone can never produce
`PASS`.

After harness changes, the orchestrator reviews the focused diff and binds the
result to an exact checkpoint before app-validator runs. The validation TARGET
head must therefore include the harness maintenance commit, and any harness or
product repair requires a new head plus a fresh validator session. The builder
never certifies its own harness.

### 4. Launch independent app-validator

Give a fresh `app-validator` agent this self-contained handoff:

```text
MODE                   PARTIAL | COMPLETE
PROJECT_ROOT           absolute repository root
SKILL_ROOT             absolute global app-validator skill root
TARGET                 exact base..head SHA; changed files
OUTCOME                approved behavior and capability classifications
ACCEPTANCE              numbered journeys and preserved suite
HARNESS_ROOT           absolute path
MANIFEST               absolute manifest path
COVERAGE_MAP           absolute COVERAGE.md path
DOCUMENTED_COMMANDS    help, doctor, list, coverage, run, smoke/full, evidence,
                       teardown exactly as builder verified
ENVIRONMENT            platform/device selectors and app/service commands
RESOURCE_RECEIPT       sanitized ownership, destructive hooks, no-fallback,
                       credentials/egress, teardown, protected resources
EVIDENCE_ROOT          unique run-owned external path
NOT_TO_DO              repo writes, product/harness repair, unsafe operations
STOP_IF                ambiguity, drift, unknown resource, mutation, missing oracle
```

The validator verifies TARGET, reads the harness Agent Quickstart, executes its
documented interface, proves resources, drives the app, observes UI/platform
state and independent non-UI oracles, and returns exactly one verdict. It may
use ad-hoc device commands only to diagnose a failure; needing an undocumented
step is `UNVERIFIED: HARNESS_GAP`, not permission to edit the harness.

### 5. Route the result

- `PASS` → retain report/evidence and continue only to a distinct required
  generic QA/PR review; do not rerun the device journey.
- `BLOCKED: APP_MISMATCH` → hand the reproducible finding to the product repair
  owner, then validate a new checkpoint with a fresh app-validator.
- `UNVERIFIED: HARNESS_GAP` → hand the exact gap to builder, checkpoint the
  harness repair, then launch a fresh app-validator.
- `UNVERIFIED: ENVIRONMENT|RESOURCE|PROVIDER_BOUND` → stop for the named user or
  environment action; do not weaken acceptance.
- First failure remains evidence. A later pass is flaky unless a concrete fix
  explains the delta.

Two unsuccessful repair/validation cycles without a new hypothesis require
re-grounding, not another blind retry.

## Harness standard

### Existing harness wins

Extend established project-native `e2e/`, `ui-tests/`, `integration_test/`, or
similar authority when it can own the requirement. Do not migrate it merely to
match this template and do not create a second active harness.

### Canonical fallback

Only when no maintainable device harness exists, builder creates:

```text
qa/app-validator/
├── app-validator.json
├── README.md
├── COVERAGE.md
├── bin/
│   └── app-validator.mjs
├── lib/
│   ├── runner.mjs
│   ├── device.mjs
│   ├── evidence.mjs
│   └── oracles/
├── journeys/
│   ├── schema.json
│   ├── acceptance/
│   ├── preserved/
│   └── smoke/
├── fixtures/
├── findings/
│   ├── schema.json
│   └── F-NNN.json
└── PITFALLS.md
```

Node is already a PI prerequisite, so this fallback uses dependency-free ESM
unless an existing project-native runtime is demonstrably simpler.

The stable interface, run from `PROJECT_ROOT`, is:

```bash
node qa/app-validator/bin/app-validator.mjs help
node qa/app-validator/bin/app-validator.mjs doctor  # preflight; must emit APP_VALIDATOR_PREFLIGHT=PASS
node qa/app-validator/bin/app-validator.mjs list
node qa/app-validator/bin/app-validator.mjs coverage
node qa/app-validator/bin/app-validator.mjs run <journey> --run-id <id>
node qa/app-validator/bin/app-validator.mjs smoke --run-id <id>
node qa/app-validator/bin/app-validator.mjs full --run-id <id>
node qa/app-validator/bin/app-validator.mjs evidence --run-id <id>
node qa/app-validator/bin/app-validator.mjs teardown --run-id <id>
```

Do not create unused platform adapters or abstractions. Journeys describe
intent; runner/adapters drive devices; fixtures create synthetic state; oracles
inspect outcomes; evidence code captures results.

### Frictionless Agent Quickstart

The harness-root `README.md` starts with **Agent Quickstart** and contains:

- prerequisites, platforms, and required environment variable names;
- copy-paste commands above, with exit codes and expected output;
- journey vocabulary/schema and one minimal example;
- how builder adds/updates journeys, fixtures, oracles, findings, and pitfalls;
- common failures and documented remediation;
- credentials, network, protected-resource, evidence, and teardown boundaries.

Manifest is machine-readable authority; README is its human/agent interface.
They must agree. Builder cold-uses only the static/interface surface from
`PROJECT_ROOT` in a fresh shell using declared inputs: no hidden shell history,
undeclared inherited exports, implicit working directory, undeclared prepared
process/session, or irreplaceable ephemeral scratch. This checks authorship, not
runtime behavior. A cold start that legitimately requires a declared service,
device, build, or reconstructible scratch remains subject to the stateful safety
gate and fresh-validator proof rather than a documentation check.

### Live-use hardening

Keep these declarative in the manifest/README; they are recurring real-run
failure modes, not new phases:

- **Runtime scratch** — distinguish durable sources/cache/evidence from
  reconstructible ephemeral runtime scratch, and place native/runtime state
  only on a filesystem whose semantics (locking, permissions, case, symlink,
  exec) the runtime supports; unsupported semantics may hang or corrupt state
  instead of failing.
- **Architecture compatibility** — host, device/image, app artifact, and tool
  binaries must share a compatible architecture/ABI; mismatch is an environment
  gap, not a product defect.
- **Tool provenance** — pin tool/artifact versions with a recorded digest, and
  after any copy or install re-verify platform signature/trust; copied signed
  tooling frequently loses integrity or trust attributes.
- **Network policy** — the effective policy is deny or an explicit allowlist
  with no silent fallback route.
- **Clock and processes** — record original clock/timezone/process state and
  restore validator-owned mutations in a `finally` path; the postcheck verifies
  cleanup or the declared keep-alive state for orchestrator-owned processes.
- **Supervised services and host cost** — a long-lived run-owned service,
  emulator/simulator, VM, or tunnel must declare an owner, a health check, and a
  bounded lifetime, and must terminate itself when its required root, mount,
  parent, or health check disappears. Losing a mounted/removable/network root
  under a running process can revoke its descriptors and leave it spinning at
  full CPU for hours: the endpoint stops answering, `SIGTERM` may be ignored,
  and the host silently overheats and drains battery. Detect this as a wedged
  service (root absent or health failing while the process is alive), never as
  normal idle background load.
- **Evidence permissions** — create the evidence tree with directories `0700`
  and files `0600` recursively at creation time, not by later fix-up.
- **Secret input** — enter credentials only through the declared secret-input
  primitive that exercises the real framework change/commit semantics of the
  input, never echoing, logging, or screenshotting the value; setting a native
  or accessibility value directly may not trigger app callbacks or state.
- **Multiple actors** — when acceptance needs more than one participant,
  declare explicit actor→device/process identity, require distinct devices per
  actor group, reject duplicate identifiers, prove simultaneous liveness,
  check routing/addressing consistency, capture per-actor evidence, and tear
  down each actor gracefully.

### Coverage and maintenance

Journey inventory, per-journey results, and any totals must be derived
dynamically from the journeys actually discovered and from the manifest-declared
authoritative runner result (`result.json` in the canonical fallback, or the
existing project-native equivalent). Never hardcode journey counts and never
reconstruct results by manual arithmetic in a report; a report that disagrees
with the authoritative runner result is an evidence gap.

`COVERAGE.md` maps each evidenced capability/user story to actors, platforms,
journeys, oracles, and status:

- `COVERED` — executable evidence exists;
- `PARTIAL` — some required path/state/oracle is missing;
- `GAP` — no safe executable coverage yet;
- `PROVIDER_BOUND` — required evidence depends on unavailable external behavior.

Every product checkpoint may change the map. Scout identifies drift; builder
updates authorized harness artifacts; validator checks the resulting checkpoint.
A whole-app claim is allowed only in `COMPLETE` mode when every material app
surface was inventoried, no material `PARTIAL/GAP/PROVIDER_BOUND` remains, and
`full` passed on TARGET. Otherwise the verdict states the exact bounded scope.

Large evidence is never committed. Store it under
`$APP_VALIDATOR_EVIDENCE_ROOT/<run_id>/`, with directories mode 0700 and files
mode 0600:

```text
screenshots/
ui-tree/
logs/
result.json
VALIDATION_<head8>.md
```

Credentials remain outside Git through `APP_VALIDATOR_CREDENTIALS_FILE` mode
0600. The versioned repo contains only sanitized paths/schemas, journeys, and
maintenance documentation written by builder.

## Stateful safety gate

Before app/device execution, independently resolve all commands and reachable
emulator/simulator data, filesystem roots, DB/schema, storage, cache, queue,
search index, service, and provider. Execute only `NO_STATEFUL_RESOURCES` or
when every resource is uniquely run-owned `DISPOSABLE_VERIFIED`, synthetic,
scoped, fallback-free, and teardown-bounded.

A local/test name, pre-existing simulator/AVD, Docker, transaction, or backup is
not proof. Unknown means `UNVERIFIED`; never run. Confirm the effective network
policy is deny or an explicit allowlist with no fallback, that device/actor
identities are reachable and distinct when acceptance requires it, and that any
validator-owned clock or long-lived process mutation has a restoring `finally`
path. Preflight must emit
`APP_VALIDATOR_PREFLIGHT=PASS` with sanitized device/resource identities,
destructive hooks, network policy, and protected boundary. Teardown touches
only run-owned resources using documented graceful methods, and the postcheck
confirms clock/timezone restoration, the declared cleanup/keep-alive process
state, and recursive evidence permissions. No orphaned run-owned service,
emulator/simulator, VM, tunnel, or watchdog may be left behind: every one is
stopped, or explicitly declared as an owner-kept resource with its health and
cost accounted for. A wedged service that ignores graceful stop is an incident;
escalate only with the exact evidence (required root absent, health failing,
no open handles on that root) and explicit authorization. Suspected protected
mutation freezes all writes/runs; preserve evidence and do not retry, reset,
restore, or reseed.

## Validator verdict

The app-validator agent returns the structure in
`templates/VALIDATION_REPORT.md` as its response and optional external evidence
report, never as a repository edit. It uses exactly one SHA-bound verdict:

- `PASS` — cold-use and preflight passed; every resource and teardown boundary
  was verified safe; all selected acceptance and preserved journeys passed with
  direct device observation and declared oracles; the protected-resource
  postcheck passed; and no harness or required-evidence gap remains;
- `BLOCKED` — a concrete reproducible app mismatch exists;
- `UNVERIFIED` — no app defect was proven because harness, environment,
  resource, provider, contract, or evidence was insufficient/unsafe.

A newly written test, screenshot alone, retry success, or partial coverage never
becomes an unqualified PASS.

## Templates

- `templates/app-validator.json` — builder bootstrap manifest for the canonical
  fallback; every placeholder must be resolved before device execution.
- `templates/VALIDATION_REPORT.md` — read-only app-validator response/evidence
  format.
