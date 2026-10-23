#!/usr/bin/env node
// Fixed-expectation contract oracle for the Flow Orca cutover.
// Pure file reads and assertions: NO_STATEFUL_RESOURCES. It starts no server,
// runs no target code, touches no network/GitHub/Orca, and writes nothing.
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

const SKILL = "skills/flow-orca/SKILL.md";
const REFERENCE = "skills/flow-orca/references/parallel-execution.md";
const SYSTEM = "SYSTEM.md";
const SYSTEM_MIRROR = "config/SYSTEM.md";
const EXECUTION_MODE = "extensions/execution-mode.ts";
const MEMORY_SKILL = "skills/project-memory/SKILL.md";
const PLANNER_SMOKE = "skills/planner/scripts/test/internal-execution-order.smoke.mjs";
const README = "docs/setup.md";
const INSTALL_SH = "install.sh";
const INSTALL_PS1 = "install.ps1";
const ARCH_JSON = ".pi/memory/architecture.json";
const ARCH_HTML = ".pi/memory/architecture.html";

const files = [
  SKILL, REFERENCE, SYSTEM, SYSTEM_MIRROR, EXECUTION_MODE, MEMORY_SKILL,
  PLANNER_SMOKE, README, INSTALL_SH, INSTALL_PS1, ARCH_JSON, ARCH_HTML,
];
const text = new Map(
  await Promise.all(files.map(async (path) => [path, await readFile(resolve(root, path), "utf8")])),
);

let checks = 0;
const has = (path, pattern, message) => {
  checks += 1;
  assert.match(text.get(path), pattern, `${path}: ${message}`);
};
const lacks = (path, pattern, message) => {
  checks += 1;
  assert.doesNotMatch(text.get(path), pattern, `${path}: ${message}`);
};
const equal = (actual, expected, message) => {
  checks += 1;
  assert.deepEqual(actual, expected, message);
};

// ── 1. Single identity, schema, and retired path ────────────────────────────
has(SKILL, /^---\nname: flow-orca\ndescription: "/, "frontmatter must declare the quoted flow-orca identity");
has(SKILL, /^description: "[^"\n]*Orca[^"\n]*"$/m, "description must state the Orca execution model on one quoted line");
has(SKILL, /^# Flow Orca —/m, "skill must carry the Flow Orca title");

checks += 1;
await assert.rejects(
  access(resolve(root, "skills/flow")),
  "retired skills/flow directory must not exist",
);
for (const path of [SKILL, REFERENCE]) {
  checks += 1;
  await access(resolve(root, path));
}

const retiredRoute = /\/skill:flow(?!-orca)/;
const retiredPath = /skills\/flow(?!-orca)/;
for (const path of [SKILL, REFERENCE, SYSTEM, SYSTEM_MIRROR, MEMORY_SKILL, PLANNER_SMOKE, README, ARCH_JSON]) {
  lacks(path, retiredRoute, "must not route to the retired /skill:flow command");
}
for (const path of [SKILL, REFERENCE, SYSTEM, SYSTEM_MIRROR, MEMORY_SKILL, PLANNER_SMOKE, ARCH_JSON]) {
  lacks(path, retiredPath, "must not reference the retired skills/flow path");
}
// README may name only the installed legacy runtime directory being moved aside.
for (const match of text.get(README).matchAll(/[^\s`]*skills[/\\]flow(?!-orca)/g)) {
  checks += 1;
  assert.match(
    match[0],
    /agent[/\\]skills[/\\]flow$/,
    `README.md: retired skill path must appear only as the installed runtime directory, found "${match[0]}"`,
  );
}
// `.pi/flow` campaign data is preserved as optional history, not a retired route.
has(SKILL, /\.pi\/flow\/<project-slug>\//, "campaign cache namespace .pi/flow must be preserved");
has(MEMORY_SKILL, /\.pi\/flow\//, "project memory must keep the .pi/flow namespace");

// ── 1b. GitHub owns delivery; no local delivery-control state ───────────────
has(SKILL, /GitHub Project README/, "the campaign grant must live in the GitHub Project README");
has(SKILL, /## Campaign grant/, "the grant must be a delimited README section");
has(SKILL, /preserve all existing README text/, "unrelated README text must be preserved");
has(SKILL, /reread the README after writing/, "the grant write must be proven by reread");
has(SKILL, /evidence of a prior explicit user approval, never a self-authorizing source/, "the remote grant is approval evidence, never self-granting authority");
has(SKILL, /approval provenance/, "the grant must record approval provenance");
has(SKILL, /\*\*does not expand\*\* operations/, "editable remote text must not expand operations");
has(SKILL, /fully qualified URLs/, "issue dependencies must use fully qualified URLs");
has(SKILL, /DAG is \*\*derived in memory\*\*/, "the DAG must be derived in memory from GitHub");
has(SKILL, /optional, read-only history\/cache with no authority/, ".pi/flow must be optional, read-only, and authority-free");
has(SKILL, /its absence never blocks re-entry/, "a missing cache must never block re-entry");
has(SKILL, /Do not create a control issue/, "no control issue or parallel backlog");
has(REFERENCE, /GitHub owns delivery/, "reference must state GitHub delivery authority");
has(REFERENCE, /never produced, reconciled, or read as a local plan, schedule, DAG, index, or state file/, "reference must forbid local delivery-control files");
has(REFERENCE, /never a source that grants itself permission/, "reference must reject self-granting remote text");

// No mandatory local delivery-control artifact may be prescribed as an
// executable instruction. Historical prose about the retired files is allowed;
// a required write/read/reconcile instruction is not.
const mandatoryLocalPlan =
  /(?:materializar|grave|escreva|atualize|crie|reconcilie|leia)[^.\n]{0,120}`?(?:PLAN\.md|SCHEDULE\.md|DAG\.json|INDEX\.md|STATE\.md)`?/i;
for (const path of [SKILL, REFERENCE]) {
  lacks(path, mandatoryLocalPlan, "must not require producing or reconciling a local delivery plan/schedule/DAG/index/state file");
  lacks(path, /(?:atualiz(?:ar|e)|updat(?:e|ing))\s+(?:(?:os?|the|local)\s+)?caches?\b/i, "transition and continue paths must not prescribe local cache updates");
}
// The retired local templates must be gone, not merely contradicted.
lacks(SKILL, /\.pi\/flow\/<project-slug>\/(?:PERMISSIONS|PROJECT_MAP)\.md/, "access and discovery reports must not write into read-only campaign history");
lacks(SKILL, /^# Flow Plan —/m, "the local PLAN.md template must be removed");
lacks(SKILL, /^# Flow Schedule —/m, "the local SCHEDULE.md template must be removed");
lacks(SKILL, /^# Flow Project Index —/m, "the local INDEX.md template must be removed");
lacks(SKILL, /"schemaVersion": 1,\n\s*"planRevision"/, "the local DAG.json template must be removed");

// ── 1c. Orca runtime records are attempts, not issues ───────────────────────
has(SKILL, /Run\/Task\/Dispatch are runtime supervision, not delivery/, "Orca records must be distinguished from delivery");
has(SKILL, /attempt record/, "a Task must be an attempt record");
has(SKILL, /exact issue URL/, "a Task must reference the exact issue URL");
has(SKILL, /remote-read timestamp/, "a Task must reference the remote read timestamp");
has(SKILL, /derived, self-contained handoff snapshot/, "a Task must carry a derived self-contained handoff snapshot");
has(SKILL, /reread the issue immediately before dispatch/, "the issue must be reread before dispatch");
has(SKILL, /do \*\*not\*\* pre-create Tasks for the entire board/, "whole-board Task precreation must be forbidden");
has(SKILL, /do \*\*not\*\* use Orca `--deps` to model dependencies between GitHub issues/, "Orca --deps must not model GitHub dependencies");
has(REFERENCE, /never use Orca `--deps` to model GitHub issue dependencies/, "reference must forbid Orca --deps for GitHub dependencies");
has(REFERENCE, /Create one Task \*\*only at admission\*\*/, "reference must bound Task creation to admission");
for (const path of [SKILL, REFERENCE]) {
  lacks(path, /orchestration task-create[^\n`]*--deps\b/, "executable Task examples must not create a second dependency graph");
}
has(REFERENCE, /PI engineering plans and transient readiness artifacts inside a single issue workspace remain allowed/, "in-workspace PI plans must stay allowed");

// ── 1c.1. Central coordinator resumes persisted Orca state ──────────────────
has(SKILL, /### 6\.0\.1 Resume the Run and persisted messages/, "resume must discover the existing Run before dispatch inspection");
has(SKILL, /ORCA orchestration run-list --json/, "resume must enumerate Runs without creating one");
has(SKILL, /ORCA orchestration run-show --id <run-id> --json/, "resume must inspect exact Run identity");
has(SKILL, /ORCA orchestration task-list --run <run-id> --json/, "resume must recover full Task specs and their issue references");
has(SKILL, /Project URL, approved repositories\/bases, and issue URLs/, "Run selection must reconcile campaign identity against GitHub");
has(SKILL, /similar title, age, or idle terminal proves neither identity nor ownership/, "Run selection must not infer ownership from labels or age");
has(SKILL, /Do not use `run-create` to recover lost context/, "lost context must not create a duplicate Run");
has(SKILL, /A missing, inaccessible, or ambiguous Run with existing WIP blocks/, "missing or ambiguous runtime state must block affected admission");
has(SKILL, /use `run-use` only after proving ownership or explicit handoff/, "binding must retain ownership authorization gates");
has(SKILL, /ORCA orchestration check --peek --json/, "pending delivery inspection must be non-consuming");
has(SKILL, /pending questions, escalations, and results before admitting new work/, "pending work must be reconciled before new admission");
has(SKILL, /before acknowledging the exact Delivery/, "settlement and reply handling must precede acknowledgement");
has(SKILL, /After compaction or loss of context, use full re-entry/, "compacted coordinator must revalidate rather than trust its summary");
has(REFERENCE, /Phase 6\.0\.1/, "concurrent inventory must reuse the authoritative Run-resume procedure");

// ── 1d. Orchestration commands carry their namespace ────────────────────────
// Only executable command forms are checked: a bare subcommand inside a fenced
// block or an `ORCA <subcommand>` invocation. Prose that merely names a
// subcommand (or forbids one) is intentionally not matched.
const ORCH = "run-create|run-list|run-show|run-use|task-create|task-list|worker-start|dispatch-show|worker-show|worker-read|check|send|ask|reply|worker-release";
for (const path of [SKILL, REFERENCE]) {
  lacks(path, new RegExp(String.raw`ORCA\s+(?:${ORCH})\b`), "ORCA invocations must use the orchestration namespace");
  lacks(path, new RegExp(String.raw`^\s*(?:orca\s+)?(?:${ORCH})\s+--`, "m"), "executable orchestration examples must name the orchestration namespace");
}
has(SKILL, /`ORCA orchestration <subcommand>`/, "skill must state the orchestration namespace rule");
has(REFERENCE, /every orchestration subcommand runs under the `orchestration` namespace/, "reference must state the orchestration namespace rule");
for (const [path, pattern] of [
  [SKILL, /orchestration worker-start --task <id> --terminal <exact handle> --run <id> --json/],
  [SKILL, /orchestration check --wait --types worker_done,escalation,question --timeout-ms/],
  [SKILL, /orchestration worker-release --dispatch <id> --json/],
  [REFERENCE, /ORCA orchestration worker-start --task <id> --terminal <exact handle> --run <id> --json/],
  [REFERENCE, /ORCA orchestration check --wait --types worker_done,escalation,question --timeout-ms <n> --json/],
]) has(path, pattern, "namespaced orchestration form must be exact");
// `worktree` and `terminal` stay top-level.
has(SKILL, /`worktree ps --json`/, "worktree stays a top-level command");
has(REFERENCE, /^ORCA worktree ps --json$/m, "worktree stays a top-level command");
lacks(REFERENCE, /ORCA orchestration worktree|ORCA orchestration terminal/, "worktree/terminal must not be namespaced");

// ── 2. Active routes and mirrors ────────────────────────────────────────────
equal(text.get(SYSTEM), text.get(SYSTEM_MIRROR), "SYSTEM.md and config/SYSTEM.md must remain byte-identical");
has(SYSTEM, /\*\*GitHub issues, Project\/Kanban[^\n]*load `flow-orca` automatically/, "SYSTEM must route issue/board delivery to flow-orca");
has(SYSTEM, /branch-per-issue delivery, coordinated PI issue workers in Orca worktrees:\*\* load `flow-orca` automatically/, "SYSTEM skill routing table must automatically route campaign coordination to flow-orca");
has(SYSTEM, /campaign grant/i, "SYSTEM must define the campaign-grant interpretation");
has(SYSTEM, /YOLO/, "SYSTEM must state that the widest campaign mode is not a safety bypass");
// Global non-campaign safety must survive the edit.
has(SYSTEM, /Consequential Action Gate/, "SYSTEM must preserve the consequential action gate");
has(SYSTEM, /Stateful test-resource gate/, "SYSTEM must preserve the stateful test-resource gate");
has(SYSTEM, /Ask before destructive or irreversible action/, "SYSTEM must preserve the destructive-action approval rule");
has(MEMORY_SKILL, /flow-orca/, "project memory must route Flow delivery to flow-orca");
has(PLANNER_SMOKE, /"skills\/flow-orca\/SKILL\.md"/, "planner bridge smoke must read the flow-orca skill");

// ── 3. Internal Execution Order bridge ──────────────────────────────────────
has(SKILL, /## Internal Execution Order bridge/, "skill must keep the internal-order bridge");
has(SKILL, /TILL-DO_<task-id>\.md[\s\S]{0,120}TODO_<task-id>\.md/, "bridge must name both lifecycle artifacts");
has(SKILL, /only inside the issue's Orca workspace — never in the coordinator's canonical checkout/, "artifacts live only in the issue Orca workspace, never the canonical checkout");
has(SKILL, /never convert them into Flow\/GitHub\/Orca state/, "artifacts must not become Flow/GitHub/Orca state");
has(SKILL, /A blocked TILL-DO does not create TODO or permit source mutation/, "a blocked TILL-DO must prevent TODO and source mutation");

// ── 4. Campaign intake: three modes and per-repository base ─────────────────
has(SKILL, /SUPERVISIONADO/, "mode SUPERVISIONADO must exist");
has(SKILL, /\*\*AUTÔNOMO\*\*/, "canonical mode AUTÔNOMO must exist");
has(SKILL, /\bYOLO\b/, "mode YOLO must exist");
// The runtime extension owns selection/defaults/behavior; SYSTEM retains only permanent authority and safety.
has(EXECUTION_MODE, /registerCommand\("execution-mode"/, "runtime must own the execution-mode command");
has(EXECUTION_MODE, /before_agent_start/, "runtime must inject the active mode before each agent loop");
has(EXECUTION_MODE, /appendEntry\(SESSION_ENTRY_TYPE/, "session mode must use a durable custom entry");
has(SYSTEM, /`extensions\/execution-mode\.ts` owns mode selection, persistence, defaults, and active behavior/, "SYSTEM must point to one runtime owner");
has(EXECUTION_MODE, /return \{ mode: "autonomous", source: "default" \}/, "runtime must own the autonomous default");
lacks(SYSTEM, /- \*\*SUPERVISIONADO\*\*:/, "SYSTEM must not duplicate runtime-owned per-mode behavior");
has(SKILL, /AUTÔNOMO default/, "intake must consume the global default mode");
has(SKILL, /do not ask a separate mode-selection question/, "intake must not re-ask a separate mode question");
lacks(SKILL, /- \[ \] Modo da campanha:/, "cold start must not present the defaulted mode as missing");
lacks(SKILL, /Base por repositório e modo da campanha \| escolha explícita/, "cold start must distinguish explicit base selection from resolved mode");
has(SKILL, /The default mode \*\*does not authorize the campaign by itself\*\*/, "the default mode must never authorize a campaign by itself");
has(SKILL, /legacy alias\*\* for `AUTÔNOMO`/, "AUTÔNOMO ATÉ PR must remain an accepted legacy alias");
has(SKILL, /AUTÔNOMO ATÉ PR/, "the legacy alias literal must remain documented");
has(SKILL, /Existing valid grants remain as they are/, "existing valid grants must be preserved without migration");
has(SKILL, /the default mode never fills in a missing, ambiguous, or invalid grant/, "a missing grant must never be filled by the default mode");
has(REFERENCE, /AUTÔNOMO \(legacy alias: AUTÔNOMO ATÉ PR\)/, "reference report must use the canonical mode plus its legacy alias");
has(REFERENCE, /the global default mode alone never authorizes a campaign/, "reference admission must reject default-mode campaign authorization");
has(SKILL, /\*\*SUPERVISIONADO\*\*[^|]*\|[^|]*\|[^|]*Each issue start, each commit, each push, and each PR individually/i, "SUPERVISIONADO must gate start, commit, push, and PR individually");
has(SKILL, /YOLO is an \*\*approval scope\*\*, not a runtime flag or safety bypass/, "YOLO must be scope, never a safety bypass");
has(SKILL, /YOLO[\s\S]{0,400}independent review of the final head SHA/, "YOLO merge requires an independent final-SHA review");
has(SKILL, /deployment\/migration operations \*\*named and approved separately\*\*/, "deploy/migration authority must be separately named and approved");
has(SKILL, /base branch chosen for each repository/i, "intake must record the base branch per repository");
has(SKILL, /Never assume `main`\/default/, "the default branch must never be assumed");
has(SKILL, /do not repeat the same question while scope, target, method, and evidence remain unchanged/, "an unchanged grant must not be re-asked");

// ── 5. Verified Orca interface ──────────────────────────────────────────────
has(SKILL, /ORCA_CLI_COMMAND[\s\S]{0,200}ORCA_DEV_REPO_ROOT[\s\S]{0,120}orca-ide/, "executable resolution order must be documented");
has(SKILL, /skills get orca-cli[\s\S]{0,80}skills get orchestration/, "both live guides must be loaded each session");
has(SKILL, /with no fallback/, "guide loading must be fail-closed with no fallback");
has(SKILL, /orca status --json|`ORCA status --json`/i, "readiness must be confirmed with status --json");
has(SKILL, /worktree create --repo <selector> --name <name> --issue <N> --base-branch <repository base> --parent-worktree <verified campaign parent> --agent pi --setup <policy> --json/, "campaign worktree creation must bind its verified parent explicitly");
has(SKILL, /\*\*There is no\*\* documented branch-name or attach-to-existing-branch flag: do not invent one/, "invented branch/attach flags must be forbidden");
has(SKILL, /`--parent-worktree` controls sidebar lineage, not the Git base/, "parent lineage must not be confused with the Git base");
has(REFERENCE, /--base-branch <approved base for this repository> --parent-worktree <verified campaign parent> --agent pi/, "the single dispatch protocol creates campaign children");
has(REFERENCE, /parentWorktreeId[\s\S]{0,350}childWorktreeIds/, "both child and parent lineage must be verified before dispatch");
has(REFERENCE, /never use `--no-parent` for a campaign worker/, "independent-handoff defaults must not detach campaign workers");
has(REFERENCE, /never use `active`\/`current`/i, "UI selection must not choose the campaign parent");
has(REFERENCE, /parent mismatch[\s\S]{0,200}blocks dispatch/, "a lineage mismatch must prevent work injection");
for (const file of [SKILL, REFERENCE]) {
  lacks(file, /(?:→ `worktree create|ORCA worktree create|\| `worktree create)[^\n]*--no-parent/, "campaign create examples cannot detach workers");
  lacks(file, /^\s*--base-branch[^\n]*--no-parent/m, "multiline campaign create examples cannot detach workers");
}
for (const file of [SYSTEM, SYSTEM_MIRROR]) {
  has(file, /Related work must be a child of its verified coordinator\/campaign context/, "related Orca handoffs stay children");
  has(file, /`--no-parent` is only for explicitly independent work/, "independent handoff policy must not leak into related work");
}
has(SKILL, /Read the workspace ID, \*\*real branch\*\*, and terminal handle from the response; never derive the branch from `--name`/, "identity must come from the actual create response");
has(SKILL, /Inspect and authorize setup policy and default terminals \*\*before\*\* create/, "setup/default terminals must be authorized before create");
has(SKILL, /even with `--setup skip`/, "setup skip must not be assumed side-effect free");
has(SKILL, /worker-start --task <id> --terminal <exact handle> --run <id> --json/, "dispatch must adopt the exact prepared terminal");
has(SKILL, /`worker-start` accepts `--base-branch`, but \*\*not\*\* `--issue`/, "worker-start must not be given --issue");
has(REFERENCE, /Prepare and verify the issue-worker base model\*\* in that PI terminal before creating a Task or dispatch/, "reference must verify the base model before dispatch");
has(REFERENCE, /pi --continue --provider [a-z-]+ --model [\w.-]+ --thinking (?:low|medium|high|xhigh)/, "issue workers restart to the configured model only through the reference protocol");
lacks(SKILL, /pi --continue --provider openai-codex/, "the main skill must not carry a second restart command protocol");
has(SKILL, /`[a-z-]+\/[\w.-]+` (?:com|with) `(?:low|medium|high|xhigh)`/, "main skill must state the prepared child PI model and effort");
has(REFERENCE, /never send `--model`\/`--effort` to Orca/, "model flags remain forbidden on Orca");
has(SKILL, /never pass them to Orca/, "main skill must keep model flags off Orca");
has(SKILL, /gh api user -q \.login/, "admission must resolve the authenticated GitHub user");
has(SKILL, /gh issue edit <N> --add-assignee "\$EXECUTOR"/, "admission must assign the logged-in user");
has(SKILL, /FLOW_ASSIGNEE_MISMATCH/, "admission must prove the assignee before progressing");
has(SKILL, /never remove another assignee automatically/, "admission must not remove an existing owner");
has(REFERENCE, /assign the issue to that exact user, and re-read that it is the sole assignee/, "reference must require verified logged-user assignment");
has(REFERENCE, /\*\*Always pin and verify the grant mode\*\* in that same PI terminal/, "new PI workers must always pin the grant mode before dispatch");
has(REFERENCE, /terminal wait --terminal <exact handle> --for tui-idle --timeout-ms/, "mode pin must wait for tui-idle");
has(REFERENCE, /terminal read --terminal <exact handle> --limit <n> --json/, "initial read must not invent a cursor");
has(REFERENCE, /save its actual `nextCursor`/, "model/mode proof must retain the returned cursor");
has(REFERENCE, /EXECUTION_MODE=.*canonical grant mode.*source.*session/, "dispatch requires the exact session receipt");
has(SKILL, /EXECUTION_MODE=.*canonical grant mode.*source.*session/, "main skill must require the exact session receipt before the Task");
has(REFERENCE, /command echo, stale output, agent prose, and exit 0 are not proof/, "stale output and exit status must not prove the pin");
has(REFERENCE, /never falls back to dispatch, and never changes global\/project settings/, "pin failure must block without fallback or global mutation");
has(REFERENCE, /ORCA terminal send --terminal <exact handle> --text [^\n]*pi --continue --provider [a-z-]+ --model [\w.-]+ --thinking (?:low|medium|high|xhigh)[^\n]*--enter --json/, "reference must start issue workers with the configured model");
for (const file of [SKILL, REFERENCE]) {
  lacks(file, /gpt-6\.1-sol` (?:com|with) `high`|gpt-6\.1-sol --thinking high/, "child PI defaults must not retain Sol/high");
}
for (const file of [SYSTEM, SYSTEM_MIRROR]) {
  has(file, /Child PI sessions default to `[a-z-]+\/[\w.-]+`[^`]{0,60}with `(?:low|medium|high|xhigh)` thinking/, "direct child PI handoffs must default to Sol/medium");
  has(file, /PI_REPORT_RUN=<run-id> pi --provider [a-z-]+ --model [\w.-]+ --thinking (?:low|medium|high|xhigh)/, "direct child PI launch must pin Sol/medium explicitly");
  has(file, /Internal planner\/builder\/QA model routing remains unchanged/, "outer child PI defaults must not override specialists");
}
has(REFERENCE, /do not alter planner\/plan-heavy internal routing/, "reference must preserve planner routing");
has(REFERENCE, /ORCA terminal send --terminal <exact handle> --text [^\n]*execution-mode <canonical grant mode> session[^\n]*--enter --json/, "reference must use the native mode pin command");
has(REFERENCE, /Repeat both checks before subsequent dispatch on a settled owned PI/, "reuse/resume must reverify model and session pin");
has(SKILL, /`--model`\/`--effort` apply to Claude\/Codex\/Cursor and \*\*not\*\* to PI/, "PI model/effort flags must stay off Orca");
has(SKILL, /worktree set --worktree <exact id> --issue <N> --workspace-status <id> --comment \.\.\. --json/, "workspace metadata command must be exact");
has(SKILL, /`Blocked` is \*\*not\*\* a known Orca status[\s\S]{0,200}add a blocker comment/, "Blocked must not be invented as an Orca status");
has(SKILL, /check --wait --types worker_done,escalation,question --timeout-ms/, "bounded waiting must use the documented check form");
has(SKILL, /process the \*\*entire\*\* FIFO batch[\s\S]*acknowledge the exact Delivery/, "the whole FIFO batch must be processed and acked");
has(SKILL, /worker-release/, "terminal release must be documented");
has(SKILL, /`release_pending`\/unknown is not clean and does not free a slot/, "release_pending must not count as settled");
has(SKILL, /An unknown `worktree create`\/`worker-start` result requires \*\*reconciliation\*\*/, "unknown outcomes must reconcile, never blind-retry");
has(SKILL, /Never blindly retry or create a second workspace\/terminal for the same issue/, "no blind retry or duplicate workspace");
has(SKILL, /run-create --objective|orchestration run-create/, "the campaign Run must use the documented command");
has(SKILL, /`completed` is an attempt outcome, never proof of merge/, "task completion must not imply dependency satisfaction");

// Native Orca operational context; no extra delivery state or live commands.
has(SKILL, /ORCA skills get --help/, "guide detail lookup must follow installed CLI support");
has(SKILL, /ORCA skills get orchestration --full/, "full native guide remains available for detail");
has(REFERENCE, /`agentTerminalHandle`, with `startupTerminal.handle` as compatibility/, "handle lookup must use the native response fields");
has(REFERENCE, /never send to both/, "stale handle recovery must not dual-send");
has(SKILL, /`source_changed` appears, reread without the old cursor/, "changed output source must reset the read cursor");
has(SKILL, /orchestration ask --resume <message_id> --timeout-ms <n> --json/, "pending asks must resume by existing identity");
has(SKILL, /read `stage`, `effects`, and `residualResources`/, "partial starts must inspect native effect receipts");
has(REFERENCE, /`stage`, `effects`, and `residualResources`/, "reference must inspect native effect receipts");
has(REFERENCE, /Resume a pending ask by its existing message ID/, "concurrent monitoring must avoid duplicate questions");

// ── 6. Single-coordinator admission and scheduling ──────────────────────────
has(SKILL, /coordinator admits \*\*serially\*\*/, "admission must be serial under one coordinator");
has(SKILL, /offer neither a single transaction nor an atomic cross-machine claim/, "no false atomicity claim");
has(REFERENCE, /This is serialization with visible intent and recheck, \*\*not\*\* atomic mutual exclusion/, "reference must reject false atomicity");
has(REFERENCE, /never invent a second reservation branch, lock file, claim service, or parallel branch scheme/, "no second reservation mechanism");
has(REFERENCE, /Legacy reservations remain occupied/, "legacy reservations must remain occupied and reconciled");
has(SKILL, /\*\*Global ceiling: twelve simultaneous issue PI workers\*\*/, "the ceiling of six issue PI workers must be stated");
has(REFERENCE, /\*\*at most twelve active issue PI workers in total\*\*/, "reference must state the global twelve-worker ceiling");
has(SKILL, /simultaneous PI limit \(`≤ 12`\)/, "campaign intake must use the twelve-worker ceiling");
lacks(SKILL, /limite de PIs simultâneos \(`≤ 6`\)/, "campaign intake must not keep the retired six-worker limit");
has(REFERENCE, /twelve is a limit, not a target/, "the ceiling must not be treated as demand");
has(SKILL, /work-conserving/, "the scheduler must be work-conserving");
has(SKILL, /There is no immutable wave/, "no immutable wave barrier");
has(SKILL, /Timeout, idle, silence, empty `check`, or quiet terminal do \*\*not\*\* free a slot/, "idle/timeout must never free a slot");
has(SKILL, /A blocked or unknown-state writer that is still alive \*\*keeps\*\* its slot/, "live blocked/unknown writers keep their slot");
has(SKILL, /One writer per issue and per workspace/, "one writer per issue workspace");
has(SKILL, /Do not nest campaigns inside workers/, "no campaign nesting inside workers");
has(REFERENCE, /never to bypass Orca nesting guards or to substitute for an issue dispatch/, "internal PI roles must not replace issue dispatch");

// ── 6b. Admission-to-dispatch efficiency ────────────────────────────────────
// Intake is separate from approved execution.
has(SKILL, /\*\*Scope of this phase:\*\* this is \*intake\*[^\n]*not a prerequisite for every already-contracted issue/, "Phase 1 module scouting must be intake, not per contracted issue");
has(SKILL, /missing DoR\/scope still blocks dispatch — never delegate vague discovery to the agent/, "missing DoR must still block dispatch");
has(SKILL, /implementation discovery within an already-established issue scope belongs to the assigned PI/, "implementation discovery inside an established scope belongs to the assigned PI");
has(SKILL, /Approved continuation uses Phase 6\/7, not a new scout\/proposal\/intake cycle/i, "approved continue must not restart intake");
// Same-session delta: positive preconditions and mandatory fallbacks.
has(SKILL, /\*\*Campaign delta \(same uninterrupted session, different candidate\):\*\* only when \*\*all\*\* preconditions hold: full re-entry \(baseline\) has already completed in this session; there has been no compaction, context loss, new chat, handoff, or anomaly since then; the grant, repository\/repositories, base\/base branches, and coordinator are unchanged/, "delta refresh must require every precondition");
has(SKILL, /Project item Status[^\n]*all active claims and PRs[^\n]*remote branches with SHAs[^\n]*reachable Orca workers/, "each delta admission needs current campaign-wide occupancy evidence");
has(SKILL, /contract for \*\*every\*\* active WIP for collisions/, "delta must recheck every active WIP contract");
has(SKILL, /comparing its identity and body from the current remote read[^\n]*baseline; `updated_at` alone does not prove identical content\. Reconcile new or unknown rows/, "contract reuse requires a current body comparison, never a timestamp alone");
has(REFERENCE, /identity and body from the current remote read[^\n]*baseline; `updated_at` alone never proves unchanged content/, "reference must require current body comparison before reuse");
has(SKILL, /It is not required to reread closed-issue history or every module/, "delta must not reread closed histories or all modules");
has(SKILL, /A new unexplained branch\/claim\/conflict, or incomplete inventory[^\n]*returns to full re-entry/, "new conflicts or incomplete inventory must fall back to full re-entry");
has(SKILL, /Compaction, new chat, handoff, and anomaly require full re-entry — never delta/, "compaction/new chat/handoff/anomaly must always be full");
lacks(SKILL, /Re-entry de campanha nunca usa fast path/, "the unconditional full-reentry-per-candidate wording must be gone");
lacks(SKILL, /Rodar \*\*re-entry completo\*\* \(Phase 6\): fetch\/prune/, "Phase 9 must not prescribe unconditional full re-entry");
lacks(SKILL, /^1\. Confirmar repo\/Project, executar re-entry completo e preflight Orca$/m, "Quick start B must not prescribe unconditional full re-entry");
has(SKILL, /Quick start|## Quick start/, "quick start must remain");
has(SKILL, /For an already-approved campaign: go directly to Phases 6\/7 without repeating scouting, proposal, or intake/, "opening route must distinguish approved execution from intake");
has(SKILL, /a new chat never uses delta or the single-issue fast path/, "cold-start quick start must not offer the same-session shortcut");
has(SKILL, /campaign delta from 6\.0 in the same uninterrupted session with baseline/, "Quick start B must use the 6.0 selector");
has(REFERENCE, /\*\*Same-session delta refresh \(preconditions, all required\):\*\* a full baseline reconciliation already completed in this session; no compaction, lost context, new chat, handoff, or anomaly since; same grant, repositories, bases, and coordinator/, "reference section 3 must carry the delta preconditions");
has(REFERENCE, /compaction, new chat, handoff, or anomaly always requires the full one/, "reference must keep full re-entry mandatory after interruption");
has(REFERENCE, /A new unexplained branch\/claim\/conflict or an incomplete inventory falls back to full re-entry/, "reference must fall back on new conflict/incomplete inventory");
has(REFERENCE, /occupancy evidence is current for this admission/, "admission gate must require current occupancy evidence");
// One detailed dispatch protocol, owned by reference section 6.
has(SKILL, /\*\*Single detailed protocol: `references\/parallel-execution\.md`, section 6\.\*\* Load it before any admission\/dispatch, even for one issue/, "main 7.2 must link the single detailed protocol even for one issue");
has(SKILL, /section 6 of `references\/parallel-execution\.md` is required/, "Phase 7 intro must require reference section 6 for any dispatch");
has(REFERENCE, /single detailed dispatch protocol/, "reference section 6 must own the detailed protocol");
lacks(SKILL, /terminal wait --terminal|terminal read --terminal|terminal send --terminal/, "the main skill must not duplicate terminal commands");
lacks(SKILL, /^\d+\. \*\*(?:Prepare e verifique|Fixe e verifique)/m, "the main skill must not keep the long numbered model/mode steps");
// Unique executor per new issue; claim proof must be able to read EXECUTOR.
has(SKILL, /export EXECUTOR=\$\(gh api user -q \.login\)/, "EXECUTOR must be exported so jq env.EXECUTOR works");
has(SKILL, /export FLOW_EXECUTOR_ID="pi-\$\(date -u/, "claim example must derive a fresh executor ID");
lacks(SKILL, /FLOW_EXECUTOR_ID:-/, "the main skill must not carry a prior executor ID into the next issue");
lacks(REFERENCE, /FLOW_EXECUTOR_ID:-/, "the reference must not carry a prior executor ID into the next issue");
has(REFERENCE, /derives a fresh one \*\*per new issue\*\*[^\n]*never carries the coordinator shell's previous `FLOW_EXECUTOR_ID`/, "executor derivation must be per new issue");
has(REFERENCE, /Reuse an ID only for that exact owned, already-existing issue/, "executor reuse must be limited to the exact owned issue");
// Handoff in memory, no early Task, uninterrupted unit, no idle-before-next-create.
has(REFERENCE, /\*\*Finish the bounded handoff in memory\*\* before creating anything[^\n]*NOT TO DO[^\n]*grant[^\n]*No Task is created before this point/, "handoff must be finished in memory before workspace creation");
has(SKILL, /\*\*In-memory handoff first\.\*\*[^\n]*NOT TO DO[^\n]*Do not pre-create a Task/, "main skill must keep the compact handoff-first stage");
has(REFERENCE, /one uninterrupted bounded unit: once a PI is open[^\n]*no unrelated scouting, board reanalysis, opening another PI, or a user-facing "progress" reply as the end of the turn while the row is unassigned and actionable/, "an opened PI must be dispatched or explicitly blocked before anything else");
has(SKILL, /no unrelated scouting, no board re-analysis, no opening another PI, and no “progress” response as the end of the turn/, "main skill must forbid idling an unassigned PI");
has(REFERENCE, /finish one row's dispatch before creating the next independent ready row; do not wait for the first worker to complete/, "serial admission with parallel implementation must not wait for completion");
has(REFERENCE, /A blocked row may let unaffected ready rows proceed only under the existing safety\/isolation gates/, "a blocked row must not freeze safe independent rows");
has(REFERENCE, /reuse it only after exact ownership proof[^\n]*never duplicate it or interrupt an active or unrelated PI/, "reuse of an unassigned PI requires exact ownership proof");
has(SKILL, /\*\*Coordinator action priority:\*\* \(1\) handle pending questions\/results[^\n]*\(2\) first finish an open PI that is still unassigned[^\n]*\(3\) dispatch safe independent candidates[^\n]*\(4\) only then do limited, punctual observation/, "action priorities must be explicit and ordered");
has(SKILL, /No fixed polling timer or new mechanism/, "priorities must not add a polling timer");
// Model: skip restart when the fresh UI already proves it; restart only for an uninjected owned PI.
has(REFERENCE, /If that fresh UI already shows `[a-z-]+\/[\w.-]+` with `(?:low|medium|high|xhigh)`, skip `\/quit` and the restart/, "an already-correct fresh model must skip the restart");
has(REFERENCE, /one bounded fresh verification read is allowed; never infer the model from command echo, stale output, global settings, or exit 0/, "missing indication allows only a fresh verification read");
has(REFERENCE, /only when this is a newly created or settled owned PI with \*\*no task injected\*\*/, "restart must be limited to an uninjected owned PI");
// Mode pin is mandatory even when the model restart was skipped.
has(REFERENCE, /whether or not the model restart was skipped/, "mode pin must remain mandatory when the restart is skipped");
// worker-start proof and unknown-start freeze.
has(REFERENCE, /the real Task\/Dispatch identity and the ready\/injection\/live proof must be read before reporting `worker active`/, "worker active needs real dispatch proof");
has(REFERENCE, /error or unknown result freezes lifecycle mutation[^\n]*reconcile the existing workspace, terminal, and dispatch[^\n]*\*\*before\*\* any further lifecycle call/, "unknown start must freeze lifecycle mutation until reconciled");
has(REFERENCE, /No blind retry, no new workspace, no direct-prompt or alternative-dispatch fallback, no lowered gates/, "unknown start must not retry, duplicate, fall back, or lower gates");
has(REFERENCE, /does not assert a cause for any past start failure/, "the protocol must not claim a cause for the earlier failure");
has(SKILL, /\*\*A failed or unknown `worker-start` result\*\* freezes the lifecycle[^\n]*before\*\* any new mutation — no blind retry, no new workspace, no direct-prompt fallback, and no lowering of gates/, "main skill must keep the unknown-start freeze");
lacks(SKILL, /orchestration dispatch\b[^\n]*--inject|worker-start[^\n]*--inject/, "no second active dispatch mechanism");
lacks(REFERENCE, /orchestration dispatch\b[^\n]*--inject|worker-start[^\n]*--inject/, "no second active dispatch mechanism");
// Anti-patterns are captured explicitly.
has(SKILL, /Leaving a PI open and unassigned while doing repeated scouting/, "anti-pattern: unassigned PI left idle");
has(SKILL, /Inheriting `FLOW_EXECUTOR_ID` from the shell for the next issue/, "anti-pattern: inherited executor ID");
has(SKILL, /Restarting the PI when fresh UI already proves/, "anti-pattern: needless model restart");

// ── 6c. Goal activation and file-free prompt delivery ──────────────────────
has(SKILL, /inline text prepared in memory, never just a file path/, "Task handoff must be inline text, not a prompt-file pointer");
has(SKILL, /Do not create `\.md` files solely to carry prompts\/handoffs/, "main skill must forbid transport-only Markdown files");
has(REFERENCE, /Do not create `\.md` files solely to transport prompts\/handoffs or mirror issue bodies/, "reference must forbid prompt/issue-body file mirrors");
has(REFERENCE, /Pass its text inline to `task-create --spec`, never just a file path/, "dispatch must receive its self-contained spec inline");
lacks(SKILL, /\.pi\/flow\/<project-slug>\/BACKLOG\.md|Scouts por módulo → `PROJECT_MAP\.md`/, "intake must not prescribe local backlog/map files");
has(SKILL, /evidence-based map presented in chat, no local file/, "intake map must stay in chat");
has(REFERENCE, /PI engineering plans and transient readiness artifacts inside a single issue workspace remain allowed/, "real in-issue engineering artifacts must remain supported");
has(REFERENCE, /before Goal is active for this Task, acknowledge and wait only — no engineering, no `worker_done`, and no blocking `ask` for activation/, "initial dispatch must wait safely for its Goal activation");
has(REFERENCE, /Do not put `\/goal` inside `--spec`: Orca adds its lifecycle preamble/, "a slash command embedded in a Task must not count as goal activation");
has(REFERENCE, /ORCA terminal send --terminal <exact handle> --text "\/goal Complete the existing Task <task-id>, Dispatch <dispatch-id>/, "Goal activation must be an actual command in the exact owned terminal");
has(REFERENCE, /before creating another PI or waiting for the worker to finish/, "Goal activation must be immediate rather than delayed to completion");
has(REFERENCE, /not a second work dispatch or a failure fallback/, "Goal continuation must not create another Task/Dispatch route");
has(REFERENCE, /do not wait for `tui-idle` before sending the activation command/, "Goal activation must not wait for injected work to finish");
has(REFERENCE, /4,000 characters in `@narumitw\/pi-goal` 0\.43\.0/, "goal objective must respect its real runtime limit without a prompt file");
has(REFERENCE, /Bare `\/goal` opens the manager and does not activate a goal/, "bare goal must not be used for unattended activation");
has(REFERENCE, /inspect `\/goal status` and reconcile an unfinished goal before any new dispatch — never clear or replace another goal automatically/, "goal reuse must preserve unrelated unfinished state");
has(REFERENCE, /Require fresh `Goal started:` output for the exact objective and its current `goal_id`/, "activation needs a fresh receipt and matching goal identity");
has(REFERENCE, /dispatch prepared; Goal unverified/, "an unverified Goal must not be reported as a fully active worker");
has(REFERENCE, /keep the slot occupied, and block engineering — no ordinary-prompt fallback/, "goal failure must preserve occupancy and prevent ungated execution");
has(SKILL, /sends `worker_done` once and calls `goal_complete` with the current `goal_id` as the final tool/, "lifecycle result must precede the terminating Goal tool");
has(REFERENCE, /report `worker_done` exactly once, then call `goal_complete` with the current `goal_id` as the final tool/, "Goal completion must not prevent the single lifecycle report");
has(REFERENCE, /Task must explicitly allow this sole post-`worker_done` action as native Goal finalization — no engineering, second lifecycle report, polling, or other Orca call after settlement/, "Task must narrowly authorize only final Goal bookkeeping after worker_done");
has(REFERENCE, /Before Task creation, require the Goal extension[^\n]*No goal is currently set\./, "Goal availability and fresh-session state must be proven before Task injection");
has(REFERENCE, /observe its matching `Goal complete` result and settled terminal with no pending continuation/, "terminal release must not race Goal completion");
has(REFERENCE, /Neither Goal completion nor `worker_done` proves GitHub `Done`/, "Goal success must not bypass GitHub completion gates");
has(SKILL, /`\/goal` covers only that worker's authorized delivery, excluding the coordinator's PR\/merge\/deployment/, "Goal must stop at the worker's authorized deliverable");

// ── 7. Project status contract ──────────────────────────────────────────────
has(SKILL, /`Backlog`, `Ready`, `In progress`, `In review`, `Blocked`, `Done`/, "the six Project statuses must be exact");
has(SKILL, /`Blocked` is \*\*additive\*\*/, "Blocked must be additive on an existing board");
has(SKILL, /Update \*\*and reread\*\* the Project at every transition/, "status must be updated and reread at each transition");
has(SKILL, /move the card to `Blocked`, reread the status, and skip the issue \*\*and its dependents\*\*/, "external blockers must move to Blocked, be reread, and skip dependents");
has(SKILL, /recheck when the user reports the resolution/i, "blocked work must be rechecked on user resolution, not polled");

// ── 8. Done postconditions ──────────────────────────────────────────────────
has(SKILL, /`Done` postconditions, all required: `mergedAt != null`/, "Done requires a real mergedAt");
has(SKILL, /`baseRefName` matches the approved base/, "Done requires the approved base");
has(SKILL, /issue \*\*closed\*\* — when the base is not the default and GitHub does not close it automatically, explicitly close it/, "non-default-base merges require an explicit issue close");
has(SKILL, /Project `Done` \*\*updated and reread\*\*/, "Done requires an updated and reread Project status");
has(SKILL, /These are never `Done`: `worker_done`, green exit, task `completed`, open PR, PR closed with `mergedAt=null`, deployment\/migration required by ACs still incomplete/, "false Done signals must be enumerated");
has(SKILL, /Integration is \*\*serial per repository\*\*, always on the chosen base, never an implicit `main`/, "integration must be serial into the chosen base");
has(SKILL, /incorporate it only by an authorized normal merge/, "a moved base is incorporated only by authorized normal merge");
has(SKILL, /Never force-push, automatically rebase/, "no force push or automatic rebase");

// ── 9. Incident, repair, and preservation ───────────────────────────────────
has(SKILL, /at most two attempts, each with a new hypothesis; at most one retry when failure is proven transient/, "repairs are two attempts plus one proven transient retry");
has(SKILL, /freezes affected resources[\s\S]{0,200}no restore, reseed, cleanup, retry, or recreation without fresh explicit authorization/, "incidents must freeze mutation, including cleanup and restore");
has(SKILL, /Conditional cleanup of the issue worktree/, "post-merge cleanup must be conditional, not blanket-preserved");
lacks(SKILL, /não existe deleção, arquivamento ou cleanup automático|Não há limpeza automática/, "blanket no-cleanup rules must be removed");
lacks(REFERENCE, /There is no automatic cleanup|preserve\*\* the workspace and the branch/, "reference must drop the blanket preserve rule");
has(SKILL, /unrelated to the campaign\*\* remain untouched/, "unrelated workspaces/terminals must be preserved");
has(SKILL, /Only with exact proof of issue, repository, real branch, base, PR, and owner/, "reuse requires exact ownership proof");
has(REFERENCE, /never restore or reseed data after an unexpected mutation without fresh explicit authorization/, "no unauthorized restore/reseed");
has(REFERENCE, /no test, migration, seed, or deployment against non-disposable state/, "workers must not touch non-disposable state");

// ── 9b. Event-driven completion and conditional cleanup (fixed policy gates) ─
// Automatic routing and exclusions across skill, SYSTEM, mirror, and README.
has(SKILL, /\*\*Trigger automatically, without requiring `\/skill:flow-orca`/, "skill must self-route automatically");
has(SKILL, /\*\*Do not trigger for\*\* simple worktree\/terminal creation, a complete unsupervised handoff/, "skill must exclude simple worktree and unsupervised handoff");
for (const path of [SYSTEM, SYSTEM_MIRROR]) {
  has(path, /load `flow-orca` automatically before campaign coordination, even when the user never names the skill/, "automatic flow-orca routing");
  has(path, /Simple worktree creation, unsupervised full handoff, standalone explanation, and ordered operations on finished artifacts stay outside this campaign route/, "flow-orca routing exclusions");
}
// Unsupervised worktree handoff: full prompt is ordinary text, /goal stays short, delivery is proven by fresh output.
for (const path of [SYSTEM, SYSTEM_MIRROR]) {
  has(path, /Send the full instructions as one ordinary prompt; never put them in `\/goal`/, "handoff body must not go into /goal");
  has(path, /`\/goal <objective>` accepts at most 4,000 characters/, "goal objective limit must be explicit");
  has(path, /`accepted: true`\) proves only that keystrokes were written/, "terminal send receipt is not delivery proof");
  has(path, /`Goal objective is too long` or an idle prompt means nothing was delivered/, "rejected goal must be detected and resent");
}
// Handoff start: no ack-and-stop phase; goal sent immediately; one bounded concurrent delivery check.
for (const path of [SYSTEM, SYSTEM_MIRROR]) {
  has(path, /the handoff prompt tells the agent to start now, and in the same command, without waiting for `tui-idle`, send a concise `\/goal`/, "goal follows handoff immediately");
  has(path, /Never ask the agent to acknowledge and stop/, "no ack-and-stop handoff");
  has(path, /never `sleep` or wait on terminals one after another/, "bounded concurrent delivery check");
}
// Report-back: full handoffs launch PI workers bound to the coordinator's Run.
for (const path of [SYSTEM, SYSTEM_MIRROR]) {
  has(path, /prefix the launch with that id, e\.g\. `PI_REPORT_RUN=<run-id> pi --provider [a-z-]+ --model [\w.-]+ --thinking (?:low|medium|high|xhigh)`/, "worker launch must pin the configured child model and effort");
  has(path, /types one line `\[child <worktree>\] goal finished\|blocked/, "worker report is typed into the coordinator terminal");
}
// Proportion: reuse proven head evidence, ask gates up front, don't repair Orca bookkeeping.
for (const path of [SYSTEM, SYSTEM_MIRROR]) {
  has(path, /never a re-run of its suites or a new QA or review of the same head/, "integration reuses proven head evidence");
  has(path, /Ask it in the first reply that identifies the gate/, "gate question asked up front");
  has(path, /Never inspect live or production systems to avoid asking/, "no production probing instead of asking");
  has(path, /a stale or rejected Orca record gets at most one note/, "Orca bookkeeping is not delivery work");
}
// Outcome anchoring: intermediate work never replaces the requested outcome.
for (const path of [SYSTEM, SYSTEM_MIRROR]) {
  has(path, /\*\*Stay anchored to the final outcome:\*\* the deliverable is the outcome the user asked for, not the work that leads to it/, "outcome, not means, is the deliverable");
  has(path, /work that only perfects a means is drift/, "drift is named");
  has(path, /A constraint that blocks one path is a reason to find a path that fits, not to stop/, "a blocked path is not a stop");
  has(path, /never present preparation as progress/, "result questions get the result");
  has(path, /Re-anchor on the final outcome after every compaction, handoff, or added instruction/, "re-anchor after compaction and handoff");
  lacks(path, /Measurements deliver numbers/, "no task-specific measurement rule");
}
// Proportional testing: tests serve the outcome and never become the work.
for (const path of [SYSTEM, SYSTEM_MIRROR]) {
  has(path, /\*\*Tests serve the outcome:\*\*/, "tests are a means");
  has(path, /Once that check passes, stop testing and deliver/, "stop testing once the change is proven");
  has(path, /An unrelated pre-existing failure is reported, not fixed or chased/, "unrelated failures are not chased");
  lacks(path, /\*\*TDD where practical:\*\*/, "no test-first mandate");
}
has(SKILL, /Tests are a means: once behavior is proven, stop testing and deliver/, "flow-orca stops testing once proven");
lacks(SKILL, /Regressão cumulativa é obrigatória/, "no cumulative-regression mandate");
lacks(SKILL, /suíte padrão relevante do repositório/, "no default full-suite checkbox");
// Engineering judgment is the agent's; "blocked" is reserved for the user's authority or external action.
for (const path of [SYSTEM, SYSTEM_MIRROR]) {
  has(path, /Engineering and architecture choices[^\n]*are yours by default: settle them with KISS, DRY, YAGNI/, "engineering choices default to the agent");
  has(path, /bring one to them when your judgment says their input would genuinely help/, "agent may surface an engineering decision when useful");
  has(path, /"Blocked" means waiting on the user \([^)]*\) or an external party, with the exact ask/, "blocked is reserved");
  has(path, /listed with its next action and started in the same turn, never labeled blocked or a user decision/, "own work starts now");
}
// Commit discipline in the standard prompt.
for (const path of [SYSTEM, SYSTEM_MIRROR]) {
  has(path, /\*\*Commit constantly, in a standard format:\*\*/, "standard mode commits constantly");
  has(path, /Conventional Commits form, `type\(scope\): imperative summary`/, "standard commit message format");
}
// Whole-list reporting: a gate on one item never hides or stalls the rest.
for (const path of [SYSTEM, SYSTEM_MIRROR]) has(path, /covers every open item on the list, not only the ones touched last/, "status covers every open item");
// Handoff silence: coordinator does not shadow a worker's in-progress work.
for (const path of [SYSTEM, SYSTEM_MIRROR]) {
  has(path, /the handoff itself is the deliverable, so close that item and end the turn/, "full handoff closes the coordinator item");
  has(path, /do not review, bug-hunt, test, prepare validation resources for, or send messages to the worker/, "no shadow work on a handed-off worker");
  has(path, /a full ownership handoff to another agent session transfers the outcome/, "post-build closure exempts full handoff");
}
has(SKILL, /Active worker WIP belongs to that worker until `worker_done`, a question, or escalation/, "coordinator must not shadow an active worker");
// Child settlement: a report or user notice triggers triage of every child; merge asks once unless already authorized.
for (const path of [SYSTEM, SYSTEM_MIRROR]) {
  has(path, /Act on that work again only when the user asks or the worker reports, through that Run, that it finished, is blocked, or stopped; then settle it as the next bullet says/, "direct handoff must point to child settlement");
  has(path, /\*\*Settling child PIs you launched \(direct handoff or `flow-orca`\):\*\* a worker report through its Run, or the user saying children finished, stopped, or are idle, orders you to settle every child of this coordinator now; it is never a question/, "report or user notice triggers settlement of every child");
  has(path, /`COMPLETE`[^\n]*`INCOMPLETE`[^\n]*`BLOCKED`/, "children are classified complete, incomplete, or blocked");
  has(path, /merge without asking only if the user already authorized these merges in this conversation or the approved campaign grant covers merge \(a saved execution mode, YOLO included, does not\)/, "merge needs an existing explicit authorization");
  has(path, /otherwise ask one consolidated yes\/no for every ready PR/, "merge approval is one batched question");
  has(path, /reconcile it now without asking, sending the exact remaining work back to that same worker terminal/, "incomplete children are reconciled through the same worker");
  has(path, /tell the user the exact blocker and what unblocks it/, "blocked children are reported to the user");
  has(path, /A blocker or pending question on one child never stops settling, reconciling, or merging the others; report every child in one message/, "one blocker never stalls the other children");
}
has(SKILL, /\*\*Close out each worker \(required triage\)\.\*\* An Orca wake, worker report, or user statement that workers have finished, stopped, or are idle is the instruction to close out \*\*all\*\* campaign workers now, never a question about what to do/, "campaign settlement trigger");
has(SKILL, /\*\*complete\*\*[^\n]*\*\*incomplete without a blocker\*\*[^\n]*\*\*blocked\*\*/, "campaign workers are triaged into three outcomes");
has(SKILL, /ask \*\*one\*\* consolidated question covering all ready PRs/, "campaign merge approval is one batched question");
has(SKILL, /return the exact remaining work to the \*\*same\*\* PI and workspace/, "incomplete campaign work goes back to the same worker");
has(SKILL, /A worker's blocker, question, or pending approval never stops closing out, reconciling, merging, or admitting the others/, "one campaign blocker never stalls the others");
has(SKILL, /When merge approval is missing, prepare all ready PRs and ask one consolidated question \(7\.4\); explicit authorization for those merges already given in this conversation remains valid and is not asked for again/, "7.6 merge approval reuses earlier explicit authorization");
has(README, /PI should load it automatically for issue\/board campaigns and coordination of PI issue workers in Orca worktrees; there is no need to name it/, "README must document automatic routing");
has(README, /Simple worktree creation, unsupervised handoff, and standalone explanations remain outside this workflow/, "README must document routing exclusions");
// Notification: Orca-owned pointer wake, one non-waiting check, ack after settlement, manual wait only as fallback.
has(SKILL, /Event-driven completion, no polling/, "event-driven completion must be the default");
has(SKILL, /pointer is \*\*only a wake-up\*\*, never `worker_done` or GitHub `Done`/, "pointer is wakeup only");
has(SKILL, /ORCA orchestration check --run <verified run-id> --json`\s+without `--wait`/, "wake must run one check without --wait");
has(SKILL, /ORCA orchestration check --run <verified run-id> --ack <delivery-id> --json/, "exact Delivery ack must name the verified Run");
has(SKILL, /resolve lifecycle\/Goal[^\n]*\*\*before\*\* ack/, "settlement must precede ack");
has(SKILL, /validating the Run, Task, Dispatch, issue, and explicit verdict/, "result attribution must be validated");
has(SKILL, /`worker_done` never proves Goal; \*\*one\*\* punctual settlement check[^\n]*is not continuous monitoring/, "wake before goal_complete allows only one bounded settlement verification");
has(SKILL, /If settlement is unproven: do not release, keep the slot and terminal, record explicit retention/, "unproven settlement must retain slot and terminal");
has(SKILL, /recorded retention counts as resolved[^\n]*does not freeze the entire inbox[^\n]*ack never frees a slot or proves Goal/, "ack must not freeze the inbox nor free a slot");
has(REFERENCE, /wake arrives immediately on `worker_done` and can precede the worker's final `goal_complete`, so `worker_done` never proves Goal/, "reference wake may precede goal_complete");
has(REFERENCE, /ORCA terminal wait --terminal <exact handle> --for tui-idle --timeout-ms <n> --json`, then an exact-cursor `ORCA orchestration worker-read --dispatch <id> --json`[^\n]*not a monitoring loop/, "reference bounded settlement verification");
has(REFERENCE, /If settlement is still unproven: do not release; keep the slot and terminal; record an explicit retention/, "reference unproven settlement retains");
has(REFERENCE, /a recorded retention counts as resolved, so an unproven Goal never freezes the entire inbox indefinitely/, "reference retention allows ack");
has(SKILL, /unexpected, duplicate, or unmatched worker\/message ID is not accepted or released/, "duplicate or unmatched messages must not release anything");
has(SKILL, /drain additional bounded batches only while messages are actually pending — never on a timer/, "extra batches only while pending");
has(SKILL, /No sleep, wait loops, polling, or repeated terminal reads merely to observe/, "no sleep/poll loops");
lacks(SKILL, /Sem sleep, loops de espera, `check --wait` repetido/, "blanket repeated-wait ban is replaced by the conditional rolling fallback");
// Lost-wake correction: queued != woken; conditional native rolling long-poll; unfiltered for untracked status/handoff.
for (const path of [SYSTEM, SYSTEM_MIRROR]) {
  lacks(path, /which wakes you/, "no unconditional wake promise");
}
has(SKILL, /send receipt `ok: true` proves only that the message was queued, never that the coordinator resumed/, "skill: queued is not a wake");
has(SKILL, /\*\*Explicit manual fallback\.\*\*[\s\S]{0,200}only on explicit user request or when runtime push is genuinely unavailable or unverified[\s\S]{0,200}confirmed missed wake/, "skill: fallback is conditional on unavailable/unverified push or confirmed lost wake");
has(SKILL, /`check --run <verified run-id> --wait --timeout-ms <n> --json` without `--types`[^\n]*PI_REPORT_RUN[^\n]*without Task\/Dispatch/, "skill: unfiltered waiter for untracked PI_REPORT_RUN children");
has(SKILL, /re-arm native `check --wait` after a timeout[^\n]*while known workers remain pending/, "skill: rolling rearm after timeout");
has(SKILL, /Status\/handoff is report evidence only[^\n]*never lifecycle settlement, release, GitHub `Done`, merge authorization, or runtime success/, "skill: status/handoff is not settlement");
has(SKILL, /do not fabricate `worker_done` or retroactive IDs/, "skill: no fabricated worker_done");
has(SKILL, /A prompt called “handoff”[^\n]*is supervision[^\n]*Task\/Dispatch/, "skill: supervised handoff routes through Task/Dispatch");
has(SKILL, /only a genuine complete transfer ends after proven delivery/, "skill: genuine full transfer needs no monitoring");
has(SKILL, /ending supervised work by telling the user to come back/, "skill anti-pattern: no abandon on unverified wake");
has(REFERENCE, /`ok: true` proves only that mail was queued, never that the coordinator resumed/, "reference: queued is not a wake");
has(REFERENCE, /fallback only on explicit user request or when runtime push is genuinely unavailable or unverified for this Run, including a lost wake confirmed/, "reference: conditional fallback");
has(REFERENCE, /^ORCA orchestration check --run <verified run-id> --wait --timeout-ms <n> --json$/m, "reference: unfiltered rolling waiter");
has(REFERENCE, /Rearm after a timeout checkpoint while known workers remain pending/, "reference: rolling rearm");
has(REFERENCE, /Status\/handoff reports are report evidence only/, "reference: status/handoff is evidence only");
has(REFERENCE, /Do not sleep, poll, or repeatedly read terminals merely to observe/, "reference: no polling");
lacks(REFERENCE, /Do not sleep, loop, repeat waits, or repeatedly read terminals merely to observe/, "reference: blanket repeated-wait ban replaced");
has(SKILL, /\*\*Explicit manual fallback\.\*\*[\s\S]{0,200}only on explicit user request or when runtime push is genuinely unavailable/, "manual wait is an explicit fallback only");
has(SKILL, /automatic wake is unverified, not worker failure/, "unverified wake must not be worker failure");
has(SKILL, /no `--to`, no `--from`, no duplicate direct terminal message/, "worker_done must be sent once to the Run");
has(SKILL, /exact coordinator PI/, "Run must bind to the exact coordinator PI");
has(REFERENCE, /Completion is \*\*event-driven\*\*; Orca already owns delivery — no new extension, service, file, or monitor/, "reference must keep event delivery with Orca");
has(REFERENCE, /^ORCA orchestration check --run <verified run-id> --json$/m, "reference non-waiting check");
has(REFERENCE, /^ORCA orchestration check --run <verified run-id> --ack <delivery-id> --json$/m, "reference exact ack");
has(REFERENCE, /Resolve lifecycle and Goal settlement \*\*before\*\* acknowledging/, "reference settlement before ack");
has(REFERENCE, /pointer is a wakeup \*\*only\*\*; it is neither `worker_done` nor GitHub `Done`/, "reference pointer is wakeup only");
has(REFERENCE, /fallback only on explicit user request or when runtime push is genuinely unavailable/, "reference manual wait is fallback only");
// Cleanup: authority, proof, content classification, recovery, exact command, incident freeze.
has(SKILL, /ORCA worktree rm --worktree <exact selector> --json`, without `--force`\/`--run-hooks`/, "cleanup must use the exact supported command without force/hooks");
has(REFERENCE, /^ORCA worktree rm --worktree <exact selector> --json$/m, "reference cleanup command");
lacks(SKILL, /^\s*(?:ORCA\s+)?worktree rm\b[^\n]*--(?:force|run-hooks)/m, "no executable cleanup form may use force or hooks");
has(SKILL, /neither YOLO, nor “ship it,” nor a generic mutable grant authorizes it/, "generic grants must not authorize cleanup");
has(SKILL, /old grants are never silently expanded/, "old grants must not be silently expanded");
has(SKILL, /explicit user request for that exact cleanup/, "explicit exact user request suffices");
has(SKILL, /Classify \*\*all\*\* contents — including ignored files, history\/refs\/reflogs, or saved unpublished work/, "cleanup must classify ignored data, history, refs and unpublished work");
has(SKILL, /No pre-cleanup with `git clean`\/`rm`/, "no pre-clean");
has(SKILL, /`worker-release` alone does not preserve evidence after `worktree rm`/, "worker-release alone must not be treated as recovery");
has(SKILL, /does not by itself hold the slot/, "retained worktree must not hold a settled slot");
has(SKILL, /Failure or ambiguous post-state is an incident/, "failed removal is an incident");
for (const pattern of [
  /Generic deliver\/YOLO\/mutable grants do not authorize destructive cleanup/,
  /Git registration, branch, PR with the exact pushed SHA, approved base, `mergedAt`, closed issue, and Project `Done`/,
  /no historical refs\/reflogs or unreferenced saved work that is not fully published/,
  /clean is never proof/,
  /Do not pre-clean with `git clean` or raw `rm`/,
  /Aliases, symlinks\/hardlinks, shared linked paths, children, nested worktrees, running processes, setup terminals, default tabs, and controller namespaces/i,
  /deletes the directory, Git registration, workspace metadata \*\*and terminal history\*\*/,
  /never deletes the remote branch, PR, or issue/,
  /`preservedBranch`/,
  /Its retained output is \*\*not\*\* a recovery copy once the worktree is removed/,
  /merged base alone is not enough for a squashed branch head/,
  /A backup in the same worktree\/controller is not rollback/,
  /exact ID, path, and Git registration are absent/,
  /read-only freeze; no retry, raw `git worktree`\/`rm`\/prune, terminal close, or force-delete-branch workaround/,
  /Stale, orphan, reused, preexisting, folder-root, unproven, or non-disposable worktrees are never auto-removed/,
  /does not hold an otherwise settled worker's slot/,
]) has(REFERENCE, pattern, `cleanup contract missing: ${pattern.source.slice(0, 60)}`);
has(README, /removes the disposable issue worktree only when specific authority and identity, content, and recovery gates are proven; otherwise it retains it with a reason/, "README must state conditional cleanup");

// ── 10. Preserved delivery capabilities ─────────────────────────────────────
for (const [pattern, message] of [
  [/## Phase 2 — Normalize the backlog/, "backlog normalization and dedup"],
  [/Discover open Projects linked/, "Project discovery"],
  [/sub_issues/, "native epics and sub-issues"],
  [/priority:p0/, "priority labels"],
  [/effort:xl/, "effort labels"],
  [/Do not break what already works; avoid test spirals/, "proportional regression"],
  [/## Phase 6 — Re-entry/, "autonomous re-entry"],
  [/independent review/, "independent issue/PR validation"],
  [/In-memory reconciliation table/, "reconciliation table derived at read time"],
  [/Derived DAG rules/, "adaptive derived DAG"],
]) has(SKILL, pattern, `preserved capability missing: ${message}`);

// ── 11. Installer guards precede any mutation ───────────────────────────────
const sh = text.get(INSTALL_SH);
const shGuard = sh.indexOf('skills/flow-orca');
const shMutation = sh.indexOf('npm install');
checks += 1;
assert.ok(shGuard > -1 && shMutation > -1 && shGuard < shMutation, "install.sh: Flow Orca guard must precede npm install");
has(INSTALL_SH, /\$PI_DIR\/skills\/flow"/, "install.sh guard must inspect the installed legacy skill");
const ps1 = text.get(INSTALL_PS1);
const psGuard = ps1.indexOf('skills\\flow-orca');
const psMutation = ps1.indexOf('npm install');
checks += 1;
assert.ok(psGuard > -1 && psMutation > -1 && psGuard < psMutation, "install.ps1: Flow Orca guard must precede npm install");

// ── 12. User-facing documentation ───────────────────────────────────────────
has(README, /\/skill:flow-orca/, "README must document the flow-orca command");
has(README, /SUPERVISIONADO[\s\S]{0,400}AUTÔNOMO ATÉ PR[\s\S]{0,400}YOLO/, "README must list the three campaign modes");
has(README, /### Authorization Modes/, "README must document the general authorization modes");
has(README, /`SYSTEM\.md`/, "README must point at the canonical global contract");
has(README, /`AUTÔNOMO` \(\*\*default\*\*\)/, "README must state the global default mode");
has(README, /per repository/, "README must state the per-repository base choice");
has(README, /ceiling of \*\*twelve\*\* simultaneous PI issue workers/, "README must state the twelve-worker ceiling");
has(README, /`Blocked`/, "README must mention the Blocked Project status");
has(README, /`mergedAt`/, "README must state the merged-evidence Done rule");
has(README, /verified \*\*statically\*\*|verificação estática|estaticamente|não é certificação de campanha live|nenhuma campanha live/i, "README must keep the static-only caveat");

// ── 13. Bounded architecture evidence ───────────────────────────────────────
const architecture = JSON.parse(text.get(ARCH_JSON));
const byId = (list, id) => list.find((item) => item.id === id);
const skillLines = text.get(SKILL).split("\n").length;

for (const id of ["flow-issue-delivery", "flow-reentry-claim"]) {
  checks += 1;
  assert.ok(byId(architecture.components, id), `architecture must keep stable component ${id}`);
}
checks += 1;
assert.ok(byId(architecture.flows, "flow-issue-delivery-flow"), "architecture must keep the Flow delivery flow");

const orca = byId(architecture.components, "orca-runtime");
checks += 1;
assert.ok(orca, "architecture must add the orca-runtime component");
equal(orca.kind, "external", "orca-runtime must be an external component");

const usesOrca = byId(architecture.relationships, "flow-uses-orca");
checks += 1;
assert.ok(usesOrca, "architecture must add the flow-uses-orca relationship");
equal(usesOrca.fromId, "flow-issue-delivery", "flow-uses-orca must originate at flow-issue-delivery");
equal(usesOrca.toId, "orca-runtime", "flow-uses-orca must target orca-runtime");

for (const id of ["flow-contract", "flow-artifacts"]) {
  const evidence = byId(architecture.evidence, id);
  checks += 1;
  assert.ok(evidence, `architecture must keep stable evidence ${id}`);
  equal(evidence.path, SKILL, `${id} must point at the renamed skill`);
  checks += 1;
  assert.ok(
    Number.isInteger(evidence.startLine) && evidence.startLine >= 1 &&
    Number.isInteger(evidence.endLine) && evidence.endLine >= evidence.startLine &&
    evidence.endLine <= skillLines,
    `${id} line range must exist inside ${SKILL} (${skillLines} lines)`,
  );
}

// ── 14. Generated view matches the validated JSON ───────────────────────────
const html = text.get(ARCH_HTML);
const payloads = [...html.matchAll(/<script\b[^>]*\btype=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi)];
checks += 1;
assert.equal(payloads.length, 1, "architecture.html must embed exactly one application/json payload");
equal(JSON.parse(payloads[0][1]), architecture, "architecture.html payload must equal architecture.json");

console.log(`flow-orca contract smoke: PASS (${checks} fixed assertions over ${files.length} files)`);
