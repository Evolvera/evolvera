# Flow — Parallel Execution Protocol

Load this reference **before** proposing, claiming, launching, resuming, handing off, or cleaning up more than one concurrent Flow issue. The main `SKILL.md` remains authoritative for Project, issue, PR, review, merge, and approval gates. This reference adds concurrency isolation; it does not weaken those gates.

## 1. What can and cannot be known

Flow reconciles five evidence planes:

1. GitHub Project Status;
2. issue state, assignee, machine-readable Flow claim comments, and PRs;
3. current remote branches and SHAs;
4. local worktrees on this machine;
5. rebuildable `.pi/flow/` cache and current PI runtime knowledge.

A local worktree proves only that a checkout exists. It does **not** prove that a process or agent is alive. A worktree on another machine is not locally discoverable. Cross-machine coordination therefore depends on the remote branch plus the issue claim marker and GitHub state. Missing, duplicate, stale-looking, or contradictory evidence is an anomaly; never auto-reclaim based on age alone.

No protocol can make separate GitHub and git mutations one transaction. Flow obtains exclusivity by creating the deterministic remote issue branch through the GitHub refs API, which fails if that ref already exists, and then verifies every remaining postcondition. Partial claims stay visible and are reconciled; they are never erased silently.

## 2. Executor identity and capacity

Every concurrent worker gets a unique, stable identifier for the life of its issue. Merely inspecting or recommending work does not create one. The orchestrator creates it automatically when claiming a **new** issue unless an approved ID already exists:

```bash
FLOW_EXECUTOR_ID=${FLOW_EXECUTOR_ID:-"pi-$(date -u +%Y%m%dT%H%M%SZ)-$(openssl rand -hex 3)"}
export FLOW_EXECUTOR_ID
```

If `openssl` is unavailable, generate an equivalently random 6-hex suffix with an available local primitive; never pause merely to ask the user to name the executor.

Rules:

- allowed form: `[A-Za-z0-9._-]{1,40}`;
- assign explicitly in the claim record; do not derive identity only from GitHub login, PID, chat title, or worktree path;
- one `FLOW_EXECUTOR_ID` owns at most one active issue unless the user explicitly approves a different WIP policy;
- one issue has exactly one executor, one deterministic remote branch, and one local worktree on a given machine;
- the orchestrator records the approved wave capacity and never launches more active workers than that capacity or the PI runtime limit;
- a new chat never adopts an existing executor ID merely because it can see the claim; changing/resuming ownership requires a GitHub-visible handoff or other explicit ownership evidence plus full reconciliation before edits resume.

For a solo run, use a stable value such as `primary`. For a parallel wave, generated IDs are preferred; bounded aliases such as `pi-01`, `pi-02` are also valid when the orchestrator controls the whole wave. Identity is operational metadata, not a person name.

## 3. Full local worktree inventory

Run from the canonical repository root during every full re-entry, before admitting a parallel wave, before a new claim, after a worker failure/handoff, and before cleanup:

```bash
ROOT=$(git rev-parse --show-toplevel)
git -C "$ROOT" worktree list --porcelain
```

For **every** returned worktree path, collect without mutating it:

```bash
git -C "$WORKTREE_PATH" rev-parse --show-toplevel
git -C "$WORKTREE_PATH" branch --show-current
git -C "$WORKTREE_PATH" rev-parse HEAD
git -C "$WORKTREE_PATH" status --short
git -C "$WORKTREE_PATH" remote get-url origin
git -C "$WORKTREE_PATH" rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null || true
```

Also inspect administrative state:

```bash
git -C "$ROOT" worktree list --porcelain
# `locked` and `prunable` lines are evidence; never prune/remove as discovery.
```

Build an in-memory table:

| Worktree | Branch | HEAD | Upstream | Dirty | Linked issue | Executor | Classification |
|---|---|---|---|---|---|---|---|
| canonical/root | main | SHA | origin/main | no | — | — | canonical |
| generated local path | flow/#12-work | SHA | origin/flow/#12-work | yes/no | #12 | pi-01 | active/ambiguous/orphan/stale-candidate |

Do not publish absolute local worktree paths to GitHub. In reports, use a non-sensitive basename or `<local-worktree>` unless the user needs the path locally.

Classifications:

- `canonical`: primary checkout; never a parallel worker workspace;
- `active`: issue, claim marker, branch, assignee/status, worktree, and executor agree;
- `reserved-remote`: remote claim exists but no local worktree on this machine; may be another machine;
- `legacy-claim`: pre-protocol issue has coherent status/assignee/branch or PR but no v1 marker; it remains occupied and ineligible for a new claim until explicitly reconciled;
- `partial-claim`: only some claim postconditions exist;
- `ambiguous`: duplicate branch/worktree/claim/executor or contradictory ownership;
- `orphan`: worktree or branch cannot be linked to a current issue/PR/approved convention;
- `stale-candidate`: completed/closed work appears left behind; age alone is insufficient to remove it;
- `canonical-dirty` / `worker-dirty`: uncommitted state that must remain owned and untouched.

Never run `git worktree prune`, `git worktree remove`, `git clean`, stash, reset, checkout, branch deletion, or file edits while inventorying.

## 4. Remote claim marker

A concurrent claim comment must contain a machine-readable marker and a human summary:

```text
<!-- pi-flow-claim:v1 issue=<N> executor=<FLOW_EXECUTOR_ID> branch=<BRANCH> base=<DEFAULT_SHA> -->
Flow claim: executor `<FLOW_EXECUTOR_ID>` reserved `<BRANCH>` from `<DEFAULT>@<DEFAULT_SHA>`.
```

A handoff or release must be a new GitHub-visible event that names the previous and next executor (or completed state), branch, and verified SHA. Never infer release from silence, elapsed time, missing local worktree, or a dead chat. Do not put secrets, hostnames, absolute paths, tokens, or process IDs in claim comments.

The active owner is the unique executor whose marker agrees with the unique remote branch and current issue/PR state. Multiple unreconciled markers, multiple branches, or disagreement with assignee/status is `ambiguous` and blocks work.

## 5. Parallel admission gate

A candidate may enter a parallel wave only when **all** conditions pass:

- user authorized parallel execution and maximum active capacity;
- Project Status is `Ready` and issue passes Definition of Ready;
- DAG dependencies and `dependencyGate` are satisfied remotely;
- no assignee, claim marker, branch, PR, or worktree already claims the issue;
- `FLOW_EXECUTOR_ID` is unique and has no active WIP;
- candidate has a grounded anticipated write scope and validation scope;
- candidate does not collide with any active/admitted node;
- a dedicated worktree path outside the canonical checkout is available;
- repository root and all existing worktrees have been inventoried;
- canonical dirty files are identified and excluded from every worker ownership set.

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
- one issue changes a contract another issue reads, even if files are disjoint.

Path-disjoint is necessary but not sufficient. If evidence cannot establish independence, serialize. Risk increases evidence and validation; it does not justify speculative locks or architecture.

Before launch, emit one matrix:

| Issue | Executor | Branch | Worktree | Write scope | Shared/exclusive resources | Validation resources | Decision |
|---|---|---|---|---|---|---|---|

Only rows marked `ADMIT` may launch. A wave is immutable after launch except to stop/block workers; new work waits for the next reconciliation.

## 6. Exclusive claim and worktree creation

The orchestrator performs claims **serially**, even when implementation will run in parallel.

For each admitted issue, immediately re-read its Project item, issue, claims, PRs, remote branch, and local worktrees. Then reserve the deterministic remote branch atomically through GitHub's create-ref endpoint:

```bash
REPO_NWO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
DEFAULT=$(gh repo view --json defaultBranchRef -q .defaultBranchRef.name)
git fetch --prune origin
DEFAULT_SHA=$(git rev-parse "origin/$DEFAULT")
# Stable by issue number so concurrent chats compute the same exclusive ref even if the title changes.
BRANCH="flow/#<N>-work"

# Must return creation success. HTTP 422/already exists loses the race: stop and reconcile.
gh api --method POST "repos/$REPO_NWO/git/refs" \
  -f ref="refs/heads/$BRANCH" \
  -f sha="$DEFAULT_SHA"
```

After successful remote reservation:

```bash
git fetch origin "refs/heads/$BRANCH:refs/remotes/origin/$BRANCH"
# Stop if a local branch/worktree with this branch already exists.
if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  echo "local branch already exists; reconcile before continuing" >&2
  exit 1
fi

git worktree add --track -b "$BRANCH" "$WORKTREE_PATH" "origin/$BRANCH"
```

`WORKTREE_PATH` must be a new, orchestrator-owned path outside the canonical checkout and outside any other repository. Quote it. Never place one worktree inside another.

Then, in this order:

1. apply unique assignee when GitHub identity distinguishes ownership;
2. add the claim marker comment and capture its URL/ID when available;
3. set Project Status and mirrored label to `In progress`;
4. re-read Project item, issue, comments, PRs, remote branch SHA, and full worktree inventory;
5. verify executor, branch, base SHA, status, worktree branch/HEAD/upstream, and uniqueness;
6. only then launch the worker.

If any postcondition fails, stop that row. Do not delete its remote branch or worktree as rollback. Record `partial-claim`, reconcile, and complete only missing non-conflicting steps when ownership remains unique.

## 7. Worker handoff contract

Each worker receives a self-contained assignment containing:

- exact issue URL/number and acceptance criteria;
- unique `FLOW_EXECUTOR_ID`;
- exact absolute worktree path it may use;
- exact branch and verified starting SHA;
- owned write scope and explicit forbidden paths;
- shared/exclusive resources it must not use concurrently;
- validation commands and whether they are concurrency-safe;
- rule: never touch the canonical checkout or another worktree;
- rule: no checkout, worktree creation/removal, branch switch, force push, reset, clean, stash, merge, rebase, Project/issue/PR mutation, or scope expansion;
- stop conditions: ownership mismatch, unexpected dirty files, upstream movement, non-fast-forward, dependency/hazard discovery, or required file outside scope.

The orchestrator owns claims, GitHub transitions, integration, and cleanup. A worker may edit and run approved tests only inside its assigned worktree. Commit/push authority must be stated explicitly; absence means the worker does neither.

## 8. Monitoring an active wave

Before accepting each worker result and before every push:

```bash
git -C "$WORKTREE_PATH" branch --show-current
git -C "$WORKTREE_PATH" status --short
git -C "$WORKTREE_PATH" rev-parse HEAD
git ls-remote --heads origin "refs/heads/$BRANCH"
```

Re-read the issue claim/status and PR. Stop the affected row when:

- worktree branch changed or detached unexpectedly;
- files outside the ownership set changed;
- remote branch moved from an unexpected actor/session;
- another branch/PR/claim appeared for the issue;
- the worker discovers a dependency or shared-resource collision;
- canonical checkout or another worktree was modified;
- validation requires an unapproved shared mutable resource.

Stopping one row does not authorize changing another row's scope. Recompute the wave only after all still-running workers reach safe checkpoints.

## 9. Integration, PRs, and merge order

Parallel implementation does not imply parallel merge.

For each completed row:

1. inspect its actual worktree diff and status;
2. run required validation in that worktree using isolated resources;
3. create the selective commit if authorized;
4. compare remote SHA immediately before normal push; never force;
5. verify pushed SHA and update GitHub-visible progress;
6. obtain the normal independent validator PASS on the final head;
7. open/reconcile the PR and move to `In review` under the main skill rules.

Choose a deterministic merge order. After **each** merge:

- fetch the new default branch in the canonical repository;
- re-evaluate every remaining PR against the new default;
- rerun affected integration/regression checks when the merged change intersects behavior, contracts, generators, or validation resources;
- block rather than auto-rebase/auto-merge when drift, conflict, or invalidated evidence appears.

A PR prepared against an older default is not automatically safe because its own CI was green before another parallel PR merged.

## 10. Cleanup and recovery

Cleanup is allowed only after merge/done is remotely verified, the worktree is clean, no process is known to use it, and its HEAD matches the expected delivered history:

```bash
git -C "$WORKTREE_PATH" status --short   # must be empty
git -C "$WORKTREE_PATH" rev-parse HEAD
git worktree remove "$WORKTREE_PATH"
git branch -d "$BRANCH"
```

Never use `--force`, delete a remote branch silently, remove a dirty worktree, or prune as a substitute for reconciliation. A locked/prunable/stale-candidate worktree is reported with path basename, branch, SHA, dirty state, issue, and claim evidence; cleanup or takeover requires explicit ownership evidence and any destructive authorization required by the main skill.

## 11. Required parallel resume report

```md
## Flow parallel resume — OWNER/REPO
- Verified at: <UTC>
- Approved capacity: <N>; active/admitted: <N>/<N>
- Project/board authority: <owner/number>
- Canonical checkout: branch@SHA; clean|dirty (owned paths summarized)

| Issue | Executor | Project | Claim | Remote branch@SHA | Local worktree | Dirty | PR | Hazards | Action |
|---|---|---|---|---|---|---|---|---|---|
| #12 | pi-01 | In progress | unique | flow/#12-work@... | present | no | none | auth exclusive | continue |

- Unclaimed executable nodes: ...
- Ambiguous/partial/orphan/stale-candidate evidence: ...
- Next safe wave or serialized action: ...
```

Report `worker active` only when the current orchestrator directly knows that runtime state. Otherwise say `claim active` or `worktree present`; do not equate either with a live process.
