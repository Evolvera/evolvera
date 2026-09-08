# Flow Orca — Concurrent Execution Protocol

Load this reference **before** proposing, admitting, dispatching, resuming, handing off, or settling more than one concurrent campaign issue. The main `SKILL.md` remains authoritative for Project, issue, PR, review, merge, campaign grant, and approval gates. This reference adds concurrency isolation; it never weakens those gates.

## 1. What can and cannot be known

Flow Orca reconciles five evidence planes:

1. GitHub Project Status, plus the campaign grant recorded in the Project README;
2. issue bodies (acceptance criteria, fully qualified dependency URLs and gates, write/validation/resource scopes), assignee, machine-readable claim comments, and PRs;
3. current remote branches and SHAs;
4. Orca workspaces, terminals, dispatches, and worker output on reachable hosts;
5. optional local `.pi/flow/` history and current PI runtime knowledge.

GitHub owns delivery. The scheduling graph is **derived in memory** from a fresh read of the grant and the issue bodies; it is never produced, reconciled, or read as a local plan, schedule, DAG, index, or state file. Plane 5 is a read-only hint with no authority, and its absence never blocks re-entry, admission, or settlement. Remote records are evidence of a prior explicit user approval, never a source that grants itself permission: no editable remote text expands operations, targets, methods, or mode, and none of it bypasses a safety gate.

An Orca workspace proves that a checkout, branch link, and terminal exist. It does **not** prove that a worker is alive, that work landed, or that a dependency is satisfied. A workspace on another host is not locally discoverable. Cross-host coordination therefore depends on the remote branch plus the issue claim marker and GitHub state. Missing, duplicate, stale-looking, or contradictory evidence is an anomaly; never auto-reclaim based on age, silence, or an idle terminal.

No protocol makes separate GitHub and Orca mutations one transaction, and Orca does not schedule or guarantee cross-host GitHub claims. Orca chooses the actual branch name, so the retired deterministic create-ref reservation cannot be transplanted. What this protocol provides instead is honest and bounded:

- exactly **one campaign coordinator** admits issues, and it admits them **serially**;
- the coordinator publishes **GitHub-visible intent** (assignee + claim marker + `In progress`) before creating the workspace;
- the coordinator **re-reads** every claim plane immediately before injecting work.

This is serialization with visible intent and recheck, **not** atomic mutual exclusion. Do not describe it as atomic, and never invent a second reservation branch, lock file, claim service, or parallel branch scheme to simulate the old mechanism. Ambiguity — two markers, two coordinators, a legacy reservation, or a contradictory plane — blocks the involved issues until a human decision resolves it. Legacy reservations remain occupied: reconcile them explicitly, never recreate or delete them.

## 2. Executor identity and capacity

Every concurrent worker gets a unique, stable identifier for the life of its issue. Merely inspecting or recommending work does not create one. The coordinator creates it automatically when admitting a **new** issue unless an approved ID already exists:

```bash
FLOW_EXECUTOR_ID=${FLOW_EXECUTOR_ID:-"pi-$(date -u +%Y%m%dT%H%M%SZ)-$(openssl rand -hex 3)"}
export FLOW_EXECUTOR_ID
```

If `openssl` is unavailable, generate an equivalently random 6-hex suffix with an available local primitive; never pause merely to ask the user to name the executor.

Rules:

- allowed form: `[A-Za-z0-9._-]{1,40}`;
- assign explicitly in the claim record; do not derive identity only from GitHub login, PID, chat title, workspace name, or terminal handle;
- one `FLOW_EXECUTOR_ID` owns at most one active issue;
- one active issue attempt has exactly one executor, one assigned Orca workspace, and one actual branch; settled historical attempts remain preserved, not concurrent owners;
- **at most six active issue PI workers in total**, across every repository and host in the campaign, and never above the ceiling approved at intake; six is a limit, not a target;
- the scheduler is continuous and work-conserving: a freed slot is refilled as soon as an `ADMIT` candidate exists and no hazard blocks it — there is no immutable wave and no all-workers barrier;
- a slot is freed only when its writer has **settled safely** (result read, GitHub/Project transition re-read, terminal released or explicitly retained with reason). Timeout, idle, an empty `check` batch, or a quiet terminal never frees a slot; a blocked or unknown-state writer that is still live keeps its slot;
- a new chat never impersonates an existing executor ID merely because it can see a claim. Follow main skill 6.3: already-authorized continuation after proven settlement needs reconciliation and the normal issue progress record, not another human handoff approval. Active conflicting or unknown ownership still blocks; a new chat alone is not a conflict.

Bounded aliases such as `pi-01`, `pi-02` are valid when one coordinator controls the whole campaign. Identity is operational metadata, not a person name.

## 3. Full workspace inventory

Run during every full re-entry, before admitting new work, before a new claim, after a worker failure/handoff, and before any settlement decision. After compaction or lost chat context, use the main skill's **Phase 6.0.1** to discover the existing Run and its full Task specs before inspecting Dispatches; never create replacements because IDs were forgotten. Preserve the ownership gate before binding, then reconcile pending questions/results and exact Delivery acknowledgement before new admission. Use only read-only Orca commands from the guide loaded in the preflight:

```text
ORCA worktree ps --json
ORCA terminal list --json
ORCA orchestration dispatch-show --task <id> --json
ORCA orchestration worker-show --dispatch <id> --json
```

`worktree` and `terminal` are top-level; every orchestration subcommand runs under the `orchestration` namespace.

For the coordinator's canonical checkout, also collect `git status --short`, `git branch --show-current`, and `git rev-parse HEAD`. The canonical checkout coordinates, integrates, and publishes; it is never a worker workspace.

Build an in-memory table:

| Workspace | Repo | Issue | Actual branch | Base | Terminal | Workspace status | Executor | Classification |
|---|---|---|---|---|---|---|---|---|
| coordinator checkout | OWNER/REPO | — | release/2.1 | — | — | — | — | coordinator |
| ws-… | OWNER/REPO | #12 | <branch from create response> | release/2.1 | term-… | in-progress | pi-01 | active |

Do not publish absolute local paths, hostnames, tokens, or terminal capabilities to GitHub or the cache. In reports use the workspace/terminal identifiers only.

Classifications:

- `coordinator`: canonical checkout; never a worker workspace;
- `active`: issue, claim marker, actual branch, assignee/status, workspace, terminal, and executor agree;
- `reserved-remote`: remote claim exists but no workspace on this host; may be another host;
- `legacy-claim`: pre-campaign issue has coherent status/assignee/branch or PR but no v1 marker, or holds a reservation from the retired deterministic-ref scheme; it remains occupied and ineligible for a new claim until explicitly reconciled;
- `partial-claim`: only some claim postconditions exist;
- `ambiguous`: duplicate workspace/branch/claim/executor, two coordinators, or contradictory ownership;
- `orphan`: workspace or branch cannot be linked to a current issue/PR/approved convention;
- `stale-candidate`: completed/closed work appears left behind; age alone is never sufficient to act;
- `unrelated`: not linked to a campaign issue — **preserve untouched**;
- `incident-frozen`: an unexpected post-state was observed; mutation authority is suspended.

While inventorying, never delete, archive, rename, reassign, close, prune, or reset a workspace, branch, or terminal, and never edit files inside another workspace.

## 4. Remote claim marker

A concurrent claim comment must contain a machine-readable marker and a human summary. The first marker records the base; complete it with the actual branch after the workspace exists:

```text
<!-- pi-flow-claim:v1 issue=<N> executor=<FLOW_EXECUTOR_ID> base=<BASE>@<BASE_SHA> branch=<ACTUAL_BRANCH> -->
Flow Orca claim: executor `<FLOW_EXECUTOR_ID>` is working issue #<N> on `<ACTUAL_BRANCH>` from `<BASE>@<BASE_SHA>`.
```

A handoff or release must be a new GitHub-visible event that names the previous and next executor (or completed state), the actual branch, and the verified SHA. Never infer release from silence, elapsed time, a missing workspace, an idle terminal, or a dead chat. Do not put secrets, hostnames, absolute paths, tokens, capabilities, or process IDs in claim comments.

The active owner is the unique executor whose marker agrees with the unique actual branch and current issue/PR state. Multiple incompatible active claims or branches, or disagreement with current assignee/status, is `ambiguous` and blocks work. Settled historical markers/merged PRs do not alone create an ownership conflict; apply main skill 6.3 before asking the user.

## 5. Admission gate

A candidate may be admitted only when **all** conditions pass:

- the campaign grant covers this action, target, and method, or the mode requires and obtained an explicit OK — the global default mode alone never authorizes a campaign, and a missing, ambiguous, or invalid grant blocks the candidate;
- a slot is free within the approved ceiling (never more than six active issue PI workers);
- Project Status is `Ready` and the issue passes Definition of Ready;
- no open external dependency; otherwise the issue and its dependents go to `Blocked` with the required user action recorded;
- every dependency declared in the issue body is satisfied remotely, read as a fully qualified issue URL plus its gate — for the default gate, upstream work is merged into **the chosen base** with its issue closed. A missing URL, a missing gate, an unreachable dependency, or a contradiction between grant, body, and Project Status blocks that candidate for bounded reconciliation instead of admitting it;
- no conflicting active or unresolved assignee/claim/branch/PR/workspace owns the work; settled history is handled by main skill 6.3, not treated as a perpetual reservation;
- `FLOW_EXECUTOR_ID` is unique and has no active WIP;
- the candidate's write scope, exclusive resources, and validation scope are grounded **in its issue body**, not inferred;
- the candidate does not collide with any active/admitted node;
- the Orca preflight succeeded and the workspace's repository, base, and setup policy are known and authorized;
- the coordinator checkout's dirty files are identified and excluded from every worker ownership set.

### Collision model

Serialize candidates when any of these overlap or remain unknown:

- same path, or ancestor/descendant path ownership;
- generated source and its generator/schema/template;
- package manager lockfiles or root dependency manifests;
- database schema, migrations, fixtures, or shared persistence contracts;
- public API/event/serialization contracts and their consumers;
- auth, tenancy, money, deployment, CI/release, environment/configuration, or secrets surfaces;
- shared test snapshots, ports, databases, queues, emulators, browsers, devices, accounts, rate limits, or deployment targets;
- a validation command that mutates shared state or cannot run concurrently;
- one issue changes a contract another issue reads, even if files are disjoint;
- two issues in the same repository whose PRs must land in the same base in a specific order.

Path-disjoint is necessary but not sufficient. If evidence cannot establish independence, serialize. Risk increases evidence and validation; it never justifies speculative locks or new architecture.

Before dispatching, emit one matrix:

| Issue | Executor | Repo/base | Write scope | Shared/exclusive resources | Validation resources | Slot | Decision |
|---|---|---|---|---|---|---|---|

Only rows marked `ADMIT` may proceed. Blocking one row never authorizes changing another row's scope; new work simply waits for the next reconciliation, since the scheduler is continuous rather than wave-based.

## 6. Serial admission, workspace creation, and dispatch

The coordinator admits **serially**, even when implementation runs in parallel. For each admitted issue, in this order:

1. re-read its Project item, issue, claims, PRs, remote branches, and workspaces;
2. resolve the authenticated GitHub user with `gh api user -q .login`, assign the issue to that exact user, and re-read that it is the sole assignee; only then post the claim marker and set Project `In progress`. A different or multiple assignee blocks admission; never remove another assignee automatically;
3. inspect and authorize the setup policy and default terminals **before** creating anything — they can mutate state even with `--setup skip`, and the wait-for-setup policy is preserved;
4. create the workspace with the documented form, using the base approved for that repository:

```text
ORCA worktree create --repo <selector> --name <name> --issue <N> \
  --base-branch <approved base for this repository> --no-parent --agent pi \
  --setup <policy> --json
```

5. read the **actual** workspace ID, branch, and PI terminal handle from the response — never compute the branch from `--name`, and never invent a branch-name or attach flag, which the interface does not document;
6. complete the claim with the actual branch and, when useful, `worktree set --worktree <id> --issue <N> --workspace-status in-progress --json`;
7. verify postconditions: single assignee, coherent marker, unique actual branch at the base SHA, no conflicting PR/claim, Project `In progress` re-read, workspace linked to the issue, exactly one PI terminal;
8. prepare and verify the mandatory issue-worker base model in that newly created PI terminal before creating a Task or dispatch: wait for `tui-idle`, read `ORCA terminal read --terminal <exact handle> --limit <n> --json` and save its actual `nextCursor`; with no work prompt yet, send `ORCA terminal send --terminal <exact handle> --text "/quit" --enter --json`, wait for the actual shell prompt, then send `ORCA terminal send --terminal <exact handle> --text "pi --continue --provider openai-codex --model gpt-5.6-sol --thinking high" --enter --json`. Wait for `tui-idle` and read only output newer than that cursor. Accept only fresh PI UI/output showing `openai-codex/gpt-5.6-sol` with `high`; command echo, stale output, global settings inference, or exit 0 are not proof. Failure, timeout, missing indication, or mismatch blocks dispatch, preserves workspace/terminal, never falls back, never sends `--model`/`--effort` to Orca, and never reconfigures an active unrelated worker. This is only the issue-worker base model: do not alter planner/plan-heavy internal routing.
9. pin and verify the grant mode in that same prepared PI terminal before creating a Task or dispatch: save the `nextCursor` from the prior read, send `ORCA terminal send --terminal <exact handle> --text "/execution-mode <canonical grant mode> session" --enter --json`, wait for `tui-idle` again, then read only new output with that cursor. Accept only the fresh exact `EXECUTION_MODE={"mode":"<canonical grant mode>","source":"session"}` receipt; command echo, stale output, agent prose, and exit 0 are not proof. Missing receipt, error, timeout, or unsupported extension blocks that dispatch, preserves workspace/terminal, never falls back to dispatch, and never changes global/project settings. Record both model and mode receipts in existing issue progress/Task handoff, not a local control artifact. Repeat both checks before subsequent dispatch on a settled owned PI during reuse/resume; never interrupt or reconfigure an active unrelated worker.
10. only then create the attempt record for **this** issue and dispatch into that exact terminal:

```text
ORCA orchestration task-create --spec "<derived self-contained handoff snapshot>" --run <id> --json
ORCA orchestration worker-start --task <id> --terminal <exact handle> --run <id> --json
```

Run/Task/Dispatch are Orca's required runtime supervision records, not a second backlog. Create one Task **only at admission**, for the issue being admitted; reference its exact issue URL and the timestamp of the remote read that authorized admission, and carry a handoff snapshot derived at that moment. The snapshot is a derived copy with no authority over acceptance criteria, scope, dependencies, or status; re-read the issue immediately before dispatch, and treat a material change as invalidating the stale snapshot. Never precreate Tasks for the whole board, never mirror the backlog into Tasks, and never use Orca `--deps` to model GitHub issue dependencies: the coordinator checks those scheduling gates against remote evidence, and a successful worker Task never means `Done` or a satisfied dependency. PI engineering plans and transient readiness artifacts inside a single issue workspace remain allowed and are not delivery-control state.

`worker-start`'s new-agent path accepts `--base-branch` but not `--issue`; when issue linkage must exist before dispatch, adopt the prepared terminal instead. `--model`/`--effort` apply to Claude/Codex/Cursor and not to PI: keep PI's defaults and never change agent or model configuration to fit a flag. Never open a second agent terminal for the same issue.

If any postcondition fails, stop that row, record `partial-claim`, and reconcile. Do not "roll back" by deleting a branch, workspace, or terminal. If a create/start outcome is unknown, reconcile with `worktree ps`, `terminal list`, and `dispatch-show` before any further call — never blind-retry and never create a second workspace for the same issue.

## 7. Worker handoff contract

Each PI worker receives a plain, self-contained assignment — an ask/reply prompt, not a tutorial about PI — containing:

- exact issue URL/number and acceptance criteria;
- unique `FLOW_EXECUTOR_ID`;
- its Orca workspace, actual branch, base, and verified starting SHA;
- owned write scope and explicit forbidden paths;
- shared/exclusive resources it must not use concurrently;
- validation commands and whether they are concurrency-safe, plus the stateful-resource rule: no test, migration, seed, or deployment against non-disposable state;
- rule: never touch the coordinator checkout or another workspace;
- rule: no workspace creation/removal, branch switch, force push, reset, clean, stash, rebase, Project/issue/PR mutation, terminal lifecycle action, or scope expansion;
- stop conditions: ownership mismatch, unexpected dirty files, upstream movement, non-fast-forward, dependency/hazard discovery, unexpected post-state, or a required file outside scope.

The coordinator owns claims, GitHub transitions, Orca lifecycle, publication, integration, and terminal release unless an exact supported delegation grant says otherwise. A worker may edit and run approved validation only inside its workspace. Commit/push authority must be stated explicitly; absence means the worker does neither. Existing PI planner/builder/QA roles may be used inside the issue with bounded scope, but never to bypass Orca nesting guards or to substitute for an issue dispatch. The worker reports the exact injected task/dispatch/capability with an explicit succeeded/failed verdict; capabilities are never stored in GitHub or the cache.

## 8. Monitoring active work

Watch with bounded waits and process the whole batch:

```text
ORCA orchestration check --wait --types worker_done,escalation,question --timeout-ms <n> --json
```

Acknowledge the exact Delivery for every item received. A timeout or empty batch is neither failure, nor completion, nor a free slot. For bounded output reads, follow the main skill’s 7.4 cursor/source rules; `source_changed` requires a new read without the previous cursor. Resume a pending ask by its existing message ID, not by sending a duplicate question. Inspect start receipts (`stage`, `effects`, `residualResources`) before recovery; setup still running is not a failed worker. Use `orchestration send --to dispatch:<id>` for guidance and `orchestration ask`/`orchestration reply` for questions, never an impersonated `--from` and never a broadcast lifecycle message.

Before accepting each worker result and before every push, re-read the issue claim/status, the PR, the workspace, and the remote branch SHA. Stop the affected row when:

- the workspace branch changed or detached unexpectedly;
- files outside the ownership set changed;
- the remote branch moved from an unexpected actor/session;
- another branch/PR/claim/workspace appeared for the issue;
- the worker discovers a dependency or shared-resource collision;
- the coordinator checkout or another workspace was modified;
- validation would require an unapproved shared or non-disposable resource.

**Defect repairs are bounded:** at most two attempts, each with a new hypothesis, plus at most one retry for a failure proven transient. **Any unexpected post-state is an incident:** freeze mutation authority on the affected resources — including cleanup, restore, reseed, and recreation — keep diagnosis read-only, and continue unaffected work only with proven isolation.

## 9. Integration, PRs, and merge order

Concurrent implementation does not imply concurrent merge.

For each completed row:

1. inspect its actual workspace diff and status;
2. run required validation there using isolated, disposable resources;
3. create the selective commit if authorized;
4. compare the remote SHA immediately before a normal push; never force;
5. verify the pushed SHA and update GitHub-visible progress;
6. obtain the independent validator PASS on the final head SHA;
7. open/reconcile the PR against the **approved base for that repository** and move to `In review` under the main skill rules.

Merge serially into the chosen base, never into an implicit default. After **each** merge:

- fetch the updated base in the coordinator checkout;
- re-evaluate every remaining PR against the new base;
- incorporate a moved base only by an authorized normal merge at a stopped writer checkpoint — never auto-rebase, force push, or silently merge;
- rerun affected integration/regression checks when the merged change intersects behavior, contracts, generators, or validation resources, and obtain a fresh final-SHA review after the change;
- confirm `mergedAt`, close the issue explicitly when a non-default base does not auto-close it, and update **and re-read** Project `Done`;
- block rather than proceed when drift, conflict, or invalidated evidence appears.

A PR prepared against an older base is not automatically safe because its own CI was green before another PR merged.

## 10. Settlement, preservation, and recovery

There is no automatic cleanup. After verified merge/Done:

- **preserve** the workspace and the branch; do not delete, archive, prune, or reset them;
- release the terminal with `orchestration worker-release --dispatch <id> --json` only when it is owned and settled; output is preserved. `release_pending` or an unknown state is not clean, and there is no terminal-close fallback;
- **retain** reused, preexisting, or unproven terminals and say so explicitly in the report;
- only after this settlement does the slot return to the scheduler.

A locked, orphan, stale-candidate, or incident-frozen resource is reported with its identifiers, issue, branch, and claim evidence; takeover or any destructive action requires explicit ownership evidence plus the authorization gates in the main skill. Never use deletion or recreation as a recovery shortcut, and never restore or reseed data after an unexpected mutation without fresh explicit authorization.

## 11. Required concurrent resume report

```md
## Flow Orca concurrent resume — OWNER/REPO
- Verified at: <UTC>
- Mode: <SUPERVISIONADO | AUTÔNOMO (alias legado: AUTÔNOMO ATÉ PR) | YOLO>; base per repo: <repo → base>
- Ceiling 6; approved concurrency: <N>; active issue PI workers: <N>
- Project/board authority: <owner/number>
- Coordinator checkout: branch@SHA; clean|dirty (owned paths summarized)

| Issue | Executor | Project | Claim | Actual branch@SHA | Base | Workspace/terminal | PR | Hazards | Action |
|---|---|---|---|---|---|---|---|---|---|
| #12 | pi-01 | In progress | unique | <branch>@… | release/2.1 | ws-…/term-… | none | auth exclusive | continue |

- Free slots and next admissions: ...
- External blockers (issue → required user action): ...
- Unrelated preserved workspaces/terminals: ...
- Ambiguous/partial/orphan/stale-candidate/legacy/incident-frozen evidence: ...
- Next safe admission or serialized action: ...
```

Report `worker active` only when the coordinator has just read the live dispatch. Otherwise say `claim active`, `branch present`, or `workspace present`; do not equate any of them with a live process, delivered work, or a free slot.
