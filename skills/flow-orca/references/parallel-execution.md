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

Every concurrent worker gets a unique, stable identifier for the life of its issue. Merely inspecting or recommending work does not create one. The coordinator derives a fresh one **per new issue** at admission; it never carries the coordinator shell's previous `FLOW_EXECUTOR_ID` into the next row. Reuse an ID only for that exact owned, already-existing issue, taken from its own claim marker:

```bash
export FLOW_EXECUTOR_ID="pi-$(date -u +%Y%m%dT%H%M%SZ)-$(openssl rand -hex 3)"
```

If `openssl` is unavailable, generate an equivalently random 6-hex suffix with an available local primitive; never pause merely to ask the user to name the executor.

Rules:

- allowed form: `[A-Za-z0-9._-]{1,40}`;
- assign explicitly in the claim record; do not derive identity only from GitHub login, PID, chat title, workspace name, or terminal handle;
- one `FLOW_EXECUTOR_ID` owns at most one active issue;
- one issue has exactly one executor, one Orca workspace, and one actual branch;
- **at most six active issue PI workers in total**, across every repository and host in the campaign, and never above the ceiling approved at intake; six is a limit, not a target — a hard ceiling, not a group size: within it there is no arbitrary 2–4 group/batch cap, and admission stays work-conserving;
- the scheduler is continuous and work-conserving: a freed slot is refilled as soon as an `ADMIT` candidate exists and no hazard blocks it — there is no immutable wave and no all-workers barrier;
- a slot is freed only when its writer has **settled safely** (result read, GitHub/Project transition re-read, terminal released or explicitly retained with reason). Timeout, idle, an empty `check` batch, or a quiet terminal never frees a slot; a blocked or unknown-state writer that is still live keeps its slot;
- a new chat never adopts an existing executor ID merely because it can see the claim; changing/resuming ownership requires a GitHub-visible handoff or other explicit ownership evidence plus full reconciliation before edits resume.

Bounded aliases such as `pi-01`, `pi-02` are valid when one coordinator controls the whole campaign. Identity is operational metadata, not a person name.

## 3. Full workspace inventory

Run during every full re-entry, before admitting new work, before a new claim, after a worker failure/handoff, and before any settlement decision. Inside one uninterrupted coordinator session, a **same-session campaign delta refresh** may replace the full baseline for the next admission, only under the preconditions below. After compaction or lost chat context, use the main skill's **Phase 6.0.1** to discover the existing Run and its full Task specs before inspecting Dispatches; never create replacements because IDs were forgotten. Preserve the ownership gate before binding, then reconcile pending questions/results and exact Delivery acknowledgement before new admission. Use only read-only Orca commands from the guide loaded in the preflight:

```text
ORCA worktree ps --json
ORCA terminal list --json
ORCA orchestration dispatch-show --task <id> --json
ORCA orchestration worker-show --dispatch <id> --json
```

`worktree` and `terminal` are top-level; every orchestration subcommand runs under the `orchestration` namespace.

For the coordinator's canonical checkout, also collect `git status --short`, `git branch --show-current`, and `git rev-parse HEAD`. The canonical checkout coordinates, integrates, and publishes; it is never a worker workspace.

**Same-session delta refresh (preconditions, all required):** a full baseline reconciliation already completed in this session; no compaction, lost context, new chat, handoff, or anomaly since; same grant, repositories, bases, and coordinator. Each admission still needs current campaign-wide occupancy evidence — Project statuses (truncation-checked), every active claim and PR, remote branch inventory with SHAs, and reachable Orca workers — and must re-read changed rows, the candidate's current body and claims, its transitive dependency gates, and every active WIP contract for collision. A known contract may be reused only after comparing the identity and body from the current remote read (a batched query is allowed) with the baseline; `updated_at` alone never proves unchanged content. Unknown or new rows reconcile. Closed-issue histories and unrelated modules need not be re-read per candidate. A new unexplained branch/claim/conflict or an incomplete inventory falls back to full re-entry; compaction, new chat, handoff, or anomaly always requires the full one.

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

The active owner is the unique executor whose marker agrees with the unique actual branch and current issue/PR state. Multiple unreconciled markers, multiple branches, or disagreement with assignee/status is `ambiguous` and blocks work.

## 5. Admission gate

A candidate may be admitted only when **all** conditions pass:

- the campaign grant covers this action, target, and method, or the mode requires and obtained an explicit OK — the global default mode alone never authorizes a campaign, and a missing, ambiguous, or invalid grant blocks the candidate;
- a slot is free within the approved ceiling (never more than six active issue PI workers);
- Project Status is `Ready` and the issue passes Definition of Ready;
- no open external dependency; otherwise the issue and its dependents go to `Blocked` with the required user action recorded;
- every dependency declared in the issue body is satisfied remotely, read as a fully qualified issue URL plus its gate — for the default gate, upstream work is merged into **the chosen base** with its issue closed. A missing URL, a missing gate, an unreachable dependency, or a contradiction between grant, body, and Project Status blocks that candidate for bounded reconciliation instead of admitting it;
- no assignee, claim marker, branch, PR, or workspace already claims the issue;
- `FLOW_EXECUTOR_ID` is unique and has no active WIP;
- occupancy evidence is current for this admission (a full re-entry or a valid same-session delta from section 3, never carried over from an earlier admission);
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

This is the **single detailed dispatch protocol**; the main skill's 7.2 keeps only compact stages and the GitHub claim example and requires loading this section even for one issue. The coordinator admits **serially**, even when implementation runs in parallel. Prepare the candidates together from the current section 5 matrix, then finish one row's dispatch before creating the next independent ready row; do not wait for the first worker to complete. A blocked row may let unaffected ready rows proceed only under the existing safety/isolation gates. Creation, preparation, and dispatch are one uninterrupted bounded unit: once a PI is open, the coordinator's next actions are that row's steps below, or an explicit block that preserves the row — no unrelated scouting, board reanalysis, opening another PI, or a user-facing "progress" reply as the end of the turn while the row is unassigned and actionable. A previously opened, still-unassigned PI of this campaign is finished first; reuse it only after exact ownership proof (issue, repository, actual branch, base, claim, no dispatch) and never duplicate it or interrupt an active or unrelated PI.

For each admitted issue, in this order:

1. **Finish the bounded handoff in memory** before creating anything: issue acceptance criteria, scope, resources, validation, NOT TO DO, and grant. Pass its text inline to `task-create --spec`, never just a file path. Do not create `.md` files solely to transport prompts/handoffs or mirror issue bodies, in the coordinator checkout or a worker workspace. After the create only the runtime-derived identity fields (workspace ID, actual branch, terminal handle, SHA) are added. No Task is created before this point;
2. re-read its Project item, issue, claims, PRs, remote branches, and workspaces;
3. derive a fresh `FLOW_EXECUTOR_ID` for this new issue (section 2), resolve the authenticated GitHub user with `gh api user -q .login`, assign the issue to that exact user, and re-read that it is the sole assignee; only then post the claim marker and set Project `In progress`. A different or multiple assignee blocks admission; never remove another assignee automatically;
4. **Resolve the campaign parent for this repository/host before create.** Use fresh Orca workspace evidence to identify the existing coordinator/campaign context and the verified parent of its sibling issue workers; copy its full selector (`worktree:<repoId>::<path>` or `folder:<id>`), never guess from a name or Git branch. Reuse that same parent for subsequent issues. For a new campaign, the verified coordinator context is the parent; do not create a new grouping workspace. In a multi-repo/host campaign, resolve the corresponding existing context separately; a foreign, missing, or ambiguous parent blocks this admission, never substitutes the caller cwd. Never use `active`/`current` to select the parent, and never use `--no-parent` for a campaign worker: independent-handoff defaults do not apply here. Sidebar lineage does not choose the Git base; always keep the approved `--base-branch`. Inspect and authorize the setup policy and default terminals **before** creating anything — they can mutate state even with `--setup skip`, and the wait-for-setup policy is preserved;
5. create the workspace with the documented form, using the base approved for that repository (no work prompt until the claim, model, and mode gates pass):

```text
ORCA worktree create --repo <selector> --name <name> --issue <N> \
  --base-branch <approved base for this repository> --parent-worktree <verified campaign parent> --agent pi \
  --setup <policy> --json
```

6. read the **actual** workspace ID, branch, and PI terminal handle from the response — never compute the branch from `--name`, and never invent a branch-name or attach flag, which the interface does not document. For the handle prefer `agentTerminalHandle`, with `startupTerminal.handle` as compatibility; if it is missing or stale, resolve it with `ORCA terminal list --worktree <exact workspace> --json`, confirming agent and ownership, and use only the confirmed handle — never send to both, and never open another terminal to recover a lost handle;
7. **Verify lineage before any Task or work injection.** Read the child and parent with the live guide's `worktree show` (or documented folder-context equivalent). The child's `parentWorktreeId` must equal the verified parent identity, and the parent's `childWorktreeIds` must contain the actual new child ID; use the documented equivalent fields for a folder parent, never infer success from a create receipt alone. Missing lineage evidence or a parent mismatch blocks dispatch for that row. Preserve the existing workspace, branch, terminal and WIP; no delete/recreate, duplicate worker, automatic reparent, private metadata edit, or fallback to top-level. Complete the claim with the actual branch and, when useful, `worktree set --worktree <id> --issue <N> --workspace-status in-progress --json`, then verify the remaining postconditions: single assignee, coherent marker, unique actual branch at the base SHA, no conflicting PR/claim, Project `In progress` re-read, workspace linked to the issue, exactly one PI terminal;
8. **Prepare and verify the issue-worker base model** in that PI terminal before creating a Task or dispatch. Wait for `tui-idle` with `ORCA terminal wait --terminal <exact handle> --for tui-idle --timeout-ms <n> --json`, read the fresh initial UI with `ORCA terminal read --terminal <exact handle> --limit <n> --json`, and save its actual `nextCursor`.
   - If that fresh UI already shows `openai-codex/gpt-6.1-sol` with `medium`, skip `/quit` and the restart.
   - If the indication is missing from the first read, one bounded fresh verification read is allowed; never infer the model from command echo, stale output, global settings, or exit 0.
   - On mismatch, or if the model cannot be established, and only when this is a newly created or settled owned PI with **no task injected**: send `ORCA terminal send --terminal <exact handle> --text "/quit" --enter --json`, prove the actual shell prompt, send `ORCA terminal send --terminal <exact handle> --text "pi --continue --provider openai-codex --model gpt-6.1-sol --thinking medium" --enter --json`, wait for `tui-idle`, and read only output newer than the saved cursor. Accept only fresh PI UI/output showing `openai-codex/gpt-6.1-sol` with `medium`.
   - Failure, timeout, missing indication, or mismatch blocks dispatch and preserves workspace/terminal; never fall back, never send `--model`/`--effort` to Orca, and never reconfigure an active or unrelated PI. This is only the issue-worker base model: do not alter planner/plan-heavy internal routing;
9. **Always pin and verify the grant mode** in that same PI terminal before creating a Task or dispatch, whether or not the model restart was skipped: save the `nextCursor` from the prior read, send `ORCA terminal send --terminal <exact handle> --text "/execution-mode <canonical grant mode> session" --enter --json`, wait for `tui-idle` again, then read only new output with that cursor. Accept only the fresh exact `EXECUTION_MODE={"mode":"<canonical grant mode>","source":"session"}` receipt; command echo, stale output, agent prose, and exit 0 are not proof. Missing receipt, error, timeout, or unsupported extension blocks that dispatch, preserves workspace/terminal, never falls back to dispatch, and never changes global/project settings. Record both model and mode receipts in existing issue progress/Task handoff, not a local control artifact. Repeat both checks before subsequent dispatch on a settled owned PI during reuse/resume; never interrupt or reconfigure an active unrelated worker;
Before Task creation, require the Goal extension in this prepared PI: send `ORCA terminal send --terminal <exact handle> --text "/goal status" --enter --json`, wait for `tui-idle`, and read fresh output using the saved cursor. A fresh worker must show `No goal is currently set.`; on reuse, inspect `/goal status` and reconcile an unfinished goal before any new dispatch — never clear or replace another goal automatically. Missing command/status proof blocks this row before injecting a Task.

10. **Dispatch once, then activate `/goal` immediately for that exact assignment.** Re-read the issue, create the attempt record for **this** issue, and adopt its terminal. The inline spec must include this activation gate: **before Goal is active for this Task, acknowledge and wait only — no engineering, no `worker_done`, and no blocking `ask` for activation**. Do not put `/goal` inside `--spec`: Orca adds its lifecycle preamble, so that text is not a top-level PI command.

```text
ORCA orchestration task-create --spec "<derived self-contained handoff snapshot, including the Goal activation gate>" --run <id> --json
ORCA orchestration worker-start --task <id> --terminal <exact handle> --run <id> --json
```

Read the real Task/Dispatch IDs and successful start receipt, then send the following native command to the same terminal, **before creating another PI or waiting for the worker to finish**:

```text
ORCA terminal send --terminal <exact handle> --text "/goal Complete the existing Task <task-id>, Dispatch <dispatch-id>, for <issue URL> within its injected scope and grant. Continue the same assignment; do not restart completed steps or create another dispatch. Verify its acceptance and validation, report worker_done exactly once, then call goal_complete with the current goal_id as your final tool." --enter --json
```

This command activates continuation of the already-injected Task; it is not a second work dispatch or a failure fallback. PI extension commands execute while streaming, and Goal queues its kickoff as a follow-up: do not wait for `tui-idle` before sending the activation command. Keep the objective concise and within the installed Goal limit (4,000 characters in `@narumitw/pi-goal` 0.43.0); the full handoff stays inline in the Orca Task, not in a prompt file. Bare `/goal` opens the manager and does not activate a goal.

11. **Verify the dispatch and Goal** with `orchestration dispatch-show`, `orchestration worker-show`, and bounded fresh terminal/worker reads: the real Task/Dispatch identity and the ready/injection/live proof must be read before reporting `worker active`. Require fresh `Goal started:` output for the exact objective and its current `goal_id` in the Goal kickoff; command echo or `/goal` appearing inside Task text is not proof. Until verified, report `dispatch prepared; Goal unverified`, keep the slot occupied, and block engineering — no ordinary-prompt fallback. A `worker-start` error or unknown result freezes lifecycle mutation: read the receipt's `stage`, `effects`, and `residualResources`, then reconcile the existing workspace, terminal, and dispatch (`worktree ps`, `terminal list`, `dispatch-show`) **before** any further lifecycle call. No blind retry, no new workspace, no direct-prompt or alternative-dispatch fallback, no lowered gates; this protocol does not assert a cause for any past start failure.

Run/Task/Dispatch are Orca's required runtime supervision records, not a second backlog. Create one Task **only at admission**, for the issue being admitted; reference its exact issue URL and the timestamp of the remote read that authorized admission, and carry a handoff snapshot derived at that moment. The snapshot is a derived copy with no authority over acceptance criteria, scope, dependencies, or status; treat a material change at the pre-dispatch re-read as invalidating the stale snapshot. Never precreate Tasks for the whole board, never mirror the backlog into Tasks, and never use Orca `--deps` to model GitHub issue dependencies: the coordinator checks those scheduling gates against remote evidence, and a successful worker Task never means `Done` or a satisfied dependency. PI engineering plans and transient readiness artifacts inside a single issue workspace remain allowed and are not delivery-control state.

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
- stop conditions: ownership mismatch, unexpected dirty files, upstream movement, non-fast-forward, dependency/hazard discovery, unexpected post-state, or a required file outside scope;
- Goal activation gate and completion boundary: do no engineering until the exact Task's Goal is active. On verified success, report `worker_done` exactly once, then call `goal_complete` with the current `goal_id` as the final tool, because it terminates the turn. The Task must explicitly allow this sole post-`worker_done` action as native Goal finalization — no engineering, second lifecycle report, polling, or other Orca call after settlement. Goal covers only this worker's authorized deliverable, not coordinator-owned PR/merge/deploy. Neither Goal completion nor `worker_done` proves GitHub `Done`; Goal never widens authority or bypasses an incident/resource gate.

The coordinator owns claims, GitHub transitions, Orca lifecycle, publication, integration, and terminal release unless an exact supported delegation grant says otherwise. A worker may edit and run approved validation only inside its workspace. Commit/push authority must be stated explicitly; absence means the worker does neither. Existing PI planner/builder/QA roles may be used inside the issue with bounded scope, but never to bypass Orca nesting guards or to substitute for an issue dispatch. The worker reports the exact injected task/dispatch/capability with an explicit succeeded/failed verdict; capabilities are never stored in GitHub or the cache.

## 8. Monitoring active work

Completion is **event-driven**; Orca already owns delivery — no new extension, service, file, or monitor. For the installed version verified from source, a message that arrives with no matching waiter makes Orca inject `You have <N> orchestration messages. Run \`orca orchestration check --run <id>\`.` into the exact coordinator PI that owns the Run's mailbox, only when its live PTY is idle, then submit Enter after rechecking the same leaf/PTY/mailbox/idle. Events during a busy turn stay unread and are redelivered on the next idle transition. An outstanding Delivery suppresses another pointer, and an active `check --wait` reserves its types and suppresses the push. The proof is bounded to that version, not every Orca/PI deployment, and a send receipt `ok: true` proves only that mail was queued, never that the coordinator resumed.

Preflight and re-entry therefore bind or reconcile the campaign Run to the exact coordinator PI and verify fresh live idle/status capability. Each worker sends the existing `worker_done` exactly once to its Dispatch's Run — no `--to`, no `--from`, no duplicate direct-terminal message. The automatic pointer is a wakeup **only**; it is neither `worker_done` nor GitHub `Done`. On wake:

```text
ORCA orchestration check --run <verified run-id> --json
ORCA orchestration check --run <verified run-id> --ack <delivery-id> --json
```

1. Run the first command once, **without** `--wait`, and process the whole FIFO Delivery. Validate Run, Task, Dispatch, and issue IDs plus the explicit succeeded/failed verdict; unexpected, duplicate, or unmatched messages are reconciled, never accepted or used to release anything.
2. Answer questions through their existing message ID; resume a pending ask by that ID, never a duplicate question.
3. Resolve lifecycle and Goal settlement **before** acknowledging. The wake arrives immediately on `worker_done` and can precede the worker's final `goal_complete`, so `worker_done` never proves Goal. One completion-driven, bounded settlement verification per such event is allowed — `ORCA terminal wait --terminal <exact handle> --for tui-idle --timeout-ms <n> --json`, then an exact-cursor `ORCA orchestration worker-read --dispatch <id> --json` / Goal status read — and is not a monitoring loop. Release a successful Goal worker only after you observe its matching `Goal complete` result and settled terminal with no pending continuation. If settlement is still unproven: do not release; keep the slot and terminal; record an explicit retention (`settlement pending` plus Run/Task/Dispatch/Delivery IDs) so re-entry or the next wake can replay and re-verify it once; and report the pending settlement truthfully. No timer, repeated wait, or observation loop.
4. Acknowledge the exact Delivery with the second command once the **whole** FIFO batch is processed and every release/retention decision is resolved; a recorded retention counts as resolved, so an unproven Goal never freezes the entire inbox indefinitely. The ack never frees a slot and never implies Goal completion.
5. Drain further returned bounded batches only while messages are actually pending — never on a timer. Then the coordinator may go idle or end its turn while workers keep running; Orca wakes it.

A timeout, empty `check`, or idle terminal is neither failure, nor completion, nor a free slot. Do not sleep, poll, or repeatedly read terminals merely to observe. The manual form is a fallback only on explicit user request or when runtime push is genuinely unavailable or unverified for this Run, including a lost wake confirmed by the user's report plus runtime/transcript evidence of queued reports without a wake (report the capability gap once and arm it rather than ending supervised work; never silently substitute active monitoring). Choose the waiter from the actual launch/report contract. Task/Dispatch workers:

```text
ORCA orchestration check --wait --types worker_done,escalation,question --timeout-ms <n> --json
```

Existing `PI_REPORT_RUN` children that send status/handoff without Task/Dispatch would be excluded by that filter; for them use the verified Run unfiltered and never fabricate `worker_done` or retroactive IDs:

```text
ORCA orchestration check --run <verified run-id> --wait --timeout-ms <n> --json
```

Process the whole FIFO batch and acknowledge the exact Delivery only after your decisions. Rearm after a timeout checkpoint while known workers remain pending; a timeout is not worker failure. No timer, sleep loop, polling, repeated terminal reads, or new watchdog/service/extension. Status/handoff reports are report evidence only, never lifecycle settlement, release authority, GitHub `Done`, merge authorization, or runtime success. A prompt called “handoff” where the coordinator expects results, integration, or continuation is supervision (new issue workers use Task/Dispatch); only a genuine standalone full transfer ends after proven delivery with no monitoring. Missing support, status, or Run binding means automatic wake is **unverified**, not worker failure; use the existing inbox (`check --peek`, main skill 6.0.1) for safe re-entry diagnostics. For bounded output reads, follow the main skill’s 7.4 cursor/source rules; `source_changed` requires a new read without the previous cursor. Resume a pending ask by its existing message ID, not by sending a duplicate question. Inspect start receipts (`stage`, `effects`, `residualResources`) before recovery; setup still running is not a failed worker. Use `orchestration send --to dispatch:<id>` for guidance and `orchestration ask`/`orchestration reply` for questions, never an impersonated `--from` and never a broadcast lifecycle message.

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

After verified merge/`Done`, first settle the lifecycle:

- release the terminal with `orchestration worker-release --dispatch <id> --json` only when it is owned and settled. `release_pending` or an unknown state is not clean, and there is no terminal-close fallback. Its retained output is **not** a recovery copy once the worktree is removed;
- **retain** reused, preexisting, or unproven terminals and say so explicitly in the report;
- the Goal is finalized, with no continuation, pending ask, Delivery, or reuse;
- only after this settlement does the slot return to the scheduler. A worktree kept because cleanup is unauthorized or unproven does not hold an otherwise settled worker's slot.

**Conditional cleanup of the issue worktree.** Only the exact campaign-created, disposable **issue** worktree may be removed, with one target per call and no `--force` or `--run-hooks`:

```text
ORCA worktree rm --worktree <exact selector> --json
```

1. **Authority.** Generic deliver/YOLO/mutable grants do not authorize destructive cleanup. Needed: a narrowly scoped cleanup operation with approval provenance in the existing Campaign grant that the **user** approved (an old grant is never silently expanded), or a fresh explicit user request for that exact cleanup, made after the effects are known and still matching action, target, method, and evidence (a file, document, `SYSTEM.md` paragraph, or old campaign record is evidence only and never self-authorizes; without a user grant or fresh request, keep the worktree). Present the exact effect manifest, independent recovery, method semantics, and approval provenance after the evidence is known. Non-disposable or ambiguous effects stay blocked pending explicit confirmation; use an independent read-only manifest review when alias/cascade risk merits it. This is policy, not a review or deletion by itself.
2. **Fresh identity proof.** Owner, repository, host, canonical path, worktree ID, Git registration, branch, PR with the exact pushed SHA, approved base, `mergedAt`, closed issue, and Project `Done`. Stale, orphan, reused, preexisting, folder-root, unproven, or non-disposable worktrees are never auto-removed.
3. **Classify all contents.** No tracked-dirty, untracked, or ignored user data, no unique unpushed work, and no historical refs/reflogs or unreferenced saved work that is not fully published or independently recoverable. Git status does not include ignored data by default — clean is never proof. Run-owned disposable generated caches/transient artifacts may be discarded only with provenance and exact whole-removal authority covering them. Do not pre-clean with `git clean` or raw `rm`.
4. **Prove nothing else is affected.** Aliases, symlinks/hardlinks, shared linked paths, children, nested worktrees, running processes, setup terminals, default tabs, and controller namespaces. Anything unknown blocks only this cleanup.
5. **Recovery outside the removed namespace first.** The removal stops all PTYs in the target, deletes the directory, Git registration, workspace metadata **and terminal history**, unlinks configured shared paths, may clean push-target Git remote config, and attempts **local** branch deletion (a preexisting or not-proven-merged branch can come back as `preservedBranch`). It never deletes the remote branch, PR, or issue. Preserve needed result/validation/review/commit evidence beforehand — e.g. a sanitized existing issue/PR result plus a published commit recoverable on the verified remote; the merged base alone is not enough for a squashed branch head. External user data is never sacrificed because its bytes were copied. A backup in the same worktree/controller is not rollback.
6. **Post-check.** The exact ID, path, and Git registration are absent; the returned local-branch state matches the receipt; protected other resources, the remote, base, and recovery evidence are unchanged. Record the removal — or the retention and its reason — in the existing issue comment.
7. **Without authority or proof**, retain the worktree with a named reason.

A failed or ambiguous removal/post-state is an **incident**: read-only freeze; no retry, raw `git worktree`/`rm`/prune, terminal close, or force-delete-branch workaround. Cleanup is never a recovery method, and the preserve/delete boundary above governs it.

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
