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
has(SKILL, /README do GitHub Project/, "the campaign grant must live in the GitHub Project README");
has(SKILL, /## Campaign grant/, "the grant must be a delimited README section");
has(SKILL, /preserve integralmente o texto já existente do README/, "unrelated README text must be preserved");
has(SKILL, /releia o README depois de escrever/, "the grant write must be proven by reread");
has(SKILL, /evidência de uma aprovação explícita anterior do usuário, nunca uma fonte que se autoriza sozinha/, "the remote grant is approval evidence, never self-granting authority");
has(SKILL, /proveniência da aprovação/, "the grant must record approval provenance");
has(SKILL, /\*\*não amplia\*\* operações/, "editable remote text must not expand operations");
has(SKILL, /URLs totalmente qualificadas/, "issue dependencies must use fully qualified URLs");
has(SKILL, /derivado em memória|derivada em memória|derivar o DAG em memória/, "the DAG must be derived in memory from GitHub");
has(SKILL, /histórico\/cache opcional e somente-leitura, sem autoridade nenhuma/, ".pi/flow must be optional, read-only, and authority-free");
has(SKILL, /ausência nunca bloqueia re-entry/, "a missing cache must never block re-entry");
has(SKILL, /Não crie issue de controle/, "no control issue or parallel backlog");
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
has(SKILL, /Run\/Task\/Dispatch são supervisão de runtime, não entrega/, "Orca records must be distinguished from delivery");
has(SKILL, /registro de tentativa/, "a Task must be an attempt record");
has(SKILL, /URL exata da issue/, "a Task must reference the exact issue URL");
has(SKILL, /timestamp da leitura remota/, "a Task must reference the remote read timestamp");
has(SKILL, /snapshot de handoff autossuficiente derivado/, "a Task must carry a derived self-contained handoff snapshot");
has(SKILL, /releia a issue imediatamente antes do dispatch/, "the issue must be reread before dispatch");
has(SKILL, /não\*\* pré-crie Tasks para o board inteiro/, "whole-board Task precreation must be forbidden");
has(SKILL, /não\*\* use `--deps` do Orca para modelar dependências entre issues do GitHub/, "Orca --deps must not model GitHub dependencies");
has(REFERENCE, /never use Orca `--deps` to model GitHub issue dependencies/, "reference must forbid Orca --deps for GitHub dependencies");
has(REFERENCE, /Create one Task \*\*only at admission\*\*/, "reference must bound Task creation to admission");
for (const path of [SKILL, REFERENCE]) {
  lacks(path, /orchestration task-create[^\n`]*--deps\b/, "executable Task examples must not create a second dependency graph");
}
has(REFERENCE, /PI engineering plans and transient readiness artifacts inside a single issue workspace remain allowed/, "in-workspace PI plans must stay allowed");

// ── 1c.1. Central coordinator resumes persisted Orca state ──────────────────
has(SKILL, /### 6\.0\.1 Retomar o Run e as mensagens persistidas/, "resume must discover the existing Run before dispatch inspection");
has(SKILL, /ORCA orchestration run-list --json/, "resume must enumerate Runs without creating one");
has(SKILL, /ORCA orchestration run-show --id <run-id> --json/, "resume must inspect exact Run identity");
has(SKILL, /ORCA orchestration task-list --run <run-id> --json/, "resume must recover full Task specs and their issue references");
has(SKILL, /URL do Project, repositórios\/bases aprovados e URLs das issues/, "Run selection must reconcile campaign identity against GitHub");
has(SKILL, /título parecido, idade ou terminal ocioso não provam identidade/, "Run selection must not infer ownership from labels or age");
has(SKILL, /Não use `run-create` para recuperar contexto perdido/, "lost context must not create a duplicate Run");
has(SKILL, /Run ausente, inacessível ou ambíguo com WIP existente/, "missing or ambiguous runtime state must block affected admission");
has(SKILL, /`run-use` só depois da prova de propriedade ou handoff explícito/, "binding must retain ownership authorization gates");
has(SKILL, /ORCA orchestration check --peek --json/, "pending delivery inspection must be non-consuming");
has(SKILL, /perguntas, escalations e resultados pendentes antes de admitir novo trabalho/, "pending work must be reconciled before new admission");
has(SKILL, /antes do ack do Delivery exato/, "settlement and reply handling must precede acknowledgement");
has(SKILL, /Após compactação ou perda de contexto, use re-entry completo/, "compacted coordinator must revalidate rather than trust its summary");
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
has(SKILL, /`ORCA orchestration <subcomando>`/, "skill must state the orchestration namespace rule");
has(REFERENCE, /every orchestration subcommand runs under the `orchestration` namespace/, "reference must state the orchestration namespace rule");
for (const [path, pattern] of [
  [SKILL, /orchestration worker-start --task <id> --terminal <handle exato> --run <id> --json/],
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
has(SKILL, /apenas dentro da workspace Orca da issue[^.\n]*nunca no checkout canônico/, "artifacts live only in the issue Orca workspace, never the canonical checkout");
has(SKILL, /nunca os converta[^.\n]*Flow\/GitHub\/Orca/, "artifacts must not become Flow/GitHub/Orca state");
has(SKILL, /bloqueado[^.\n]*não cria TODO[^.\n]*mutação de fonte/, "a blocked TILL-DO must prevent TODO and source mutation");

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
has(SKILL, /default `AUTÔNOMO`/, "intake must consume the global default mode");
has(SKILL, /não faça uma pergunta separada de escolha de modo/, "intake must not re-ask a separate mode question");
lacks(SKILL, /- \[ \] Modo da campanha:/, "cold start must not present the defaulted mode as missing");
lacks(SKILL, /Base por repositório e modo da campanha \| escolha explícita/, "cold start must distinguish explicit base selection from resolved mode");
has(SKILL, /O modo default \*\*não autoriza a campanha por si só\*\*/, "the default mode must never authorize a campaign by itself");
has(SKILL, /alias legado\*\* de `AUTÔNOMO`/, "AUTÔNOMO ATÉ PR must remain an accepted legacy alias");
has(SKILL, /AUTÔNOMO ATÉ PR/, "the legacy alias literal must remain documented");
has(SKILL, /Grants existentes válidos permanecem como estão/, "existing valid grants must be preserved without migration");
has(SKILL, /o modo default nunca preenche um grant ausente/, "a missing grant must never be filled by the default mode");
has(REFERENCE, /AUTÔNOMO \(alias legado: AUTÔNOMO ATÉ PR\)/, "reference report must use the canonical mode plus its legacy alias");
has(REFERENCE, /the global default mode alone never authorizes a campaign/, "reference admission must reject default-mode campaign authorization");
has(SKILL, /\*\*SUPERVISIONADO\*\*[^|]*\|[^|]*\|[^|]*início de issue[\s\S]{0,80}commit[\s\S]{0,40}push[\s\S]{0,40}PR/i, "SUPERVISIONADO must gate start, commit, push, and PR individually");
has(SKILL, /YOLO é \*\*escopo de aprovação\*\*, não flag de runtime nem bypass de segurança/, "YOLO must be scope, never a safety bypass");
has(SKILL, /YOLO[\s\S]{0,400}review independente do head SHA final/, "YOLO merge requires an independent final-SHA review");
has(SKILL, /deploy\/migração \*\*separadamente nomeadas e aprovadas\*\*/, "deploy/migration authority must be separately named and approved");
has(SKILL, /base branch POR REPOSITÓRIO|base branch de cada repositório|base \*\*por repositório\*\*|base branch escolhida para cada repositório/i, "intake must record the base branch per repository");
has(SKILL, /nunca a default implícita|Nunca assuma `main`\/default/, "the default branch must never be assumed");
has(SKILL, /não repita a mesma pergunta enquanto escopo, alvo, método e evidência continuarem os mesmos/, "an unchanged grant must not be re-asked");

// ── 5. Verified Orca interface ──────────────────────────────────────────────
has(SKILL, /ORCA_CLI_COMMAND[\s\S]{0,200}ORCA_DEV_REPO_ROOT[\s\S]{0,120}orca-ide/, "executable resolution order must be documented");
has(SKILL, /skills get orca-cli[\s\S]{0,80}skills get orchestration/, "both live guides must be loaded each session");
has(SKILL, /sem fallback/, "guide loading must be fail-closed with no fallback");
has(SKILL, /orca status --json|`ORCA status --json`/i, "readiness must be confirmed with status --json");
has(SKILL, /worktree create --repo <selector> --name <name> --issue <N> --base-branch <base do repo> --parent-worktree <pai verificado da campanha> --agent pi --setup <policy> --json/, "campaign worktree creation must bind its verified parent explicitly");
has(SKILL, /\*\*Não existe\*\* flag documentada de nome de branch nem de attach em branch existente: não invente/, "invented branch/attach flags must be forbidden");
has(SKILL, /`--parent-worktree` controla linhagem de sidebar, não a base Git/, "parent lineage must not be confused with the Git base");
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
has(SKILL, /Leia da resposta o ID do workspace, a \*\*branch real\*\* e o handle do terminal; nunca derive branch do `--name`/, "identity must come from the actual create response");
has(SKILL, /Inspecione e autorize política de setup e terminais default \*\*antes\*\* do create/, "setup/default terminals must be authorized before create");
has(SKILL, /mesmo com `--setup skip`/, "setup skip must not be assumed side-effect free");
has(SKILL, /worker-start --task <id> --terminal <handle exato> --run <id> --json/, "dispatch must adopt the exact prepared terminal");
has(SKILL, /`worker-start` aceita `--base-branch`, mas \*\*não\*\* aceita `--issue`/, "worker-start must not be given --issue");
has(REFERENCE, /Prepare and verify the issue-worker base model\*\* in that PI terminal before creating a Task or dispatch/, "reference must verify the base model before dispatch");
has(REFERENCE, /pi --continue --provider openai-codex --model gpt-6.1-sol --thinking medium/, "issue workers must restart to Sol/medium only through the reference protocol");
lacks(SKILL, /pi --continue --provider openai-codex/, "the main skill must not carry a second restart command protocol");
has(SKILL, /openai-codex\/gpt-6.1-sol` com `medium`/, "main skill must require Sol/medium before the Task");
has(REFERENCE, /never send `--model`\/`--effort` to Orca/, "model flags remain forbidden on Orca");
has(SKILL, /sem `--model`\/`--effort` ao Orca/, "main skill must keep model flags off Orca");
has(SKILL, /gh api user -q \.login/, "admission must resolve the authenticated GitHub user");
has(SKILL, /gh issue edit <N> --add-assignee "\$EXECUTOR"/, "admission must assign the logged-in user");
has(SKILL, /FLOW_ASSIGNEE_MISMATCH/, "admission must prove the assignee before progressing");
has(SKILL, /nunca remova outro assignee automaticamente/, "admission must not remove an existing owner");
has(REFERENCE, /assign the issue to that exact user, and re-read that it is the sole assignee/, "reference must require verified logged-user assignment");
has(REFERENCE, /\*\*Always pin and verify the grant mode\*\* in that same PI terminal/, "new PI workers must always pin the grant mode before dispatch");
has(REFERENCE, /terminal wait --terminal <exact handle> --for tui-idle --timeout-ms/, "mode pin must wait for tui-idle");
has(REFERENCE, /terminal read --terminal <exact handle> --limit <n> --json/, "initial read must not invent a cursor");
has(REFERENCE, /save its actual `nextCursor`/, "model/mode proof must retain the returned cursor");
has(REFERENCE, /EXECUTION_MODE=.*canonical grant mode.*source.*session/, "dispatch requires the exact session receipt");
has(SKILL, /EXECUTION_MODE=.*canonical grant mode.*source.*session/, "main skill must require the exact session receipt before the Task");
has(REFERENCE, /command echo, stale output, agent prose, and exit 0 are not proof/, "stale output and exit status must not prove the pin");
has(REFERENCE, /never falls back to dispatch, and never changes global\/project settings/, "pin failure must block without fallback or global mutation");
has(REFERENCE, /ORCA terminal send --terminal <exact handle> --text [^\n]*pi --continue --provider openai-codex --model gpt-6.1-sol --thinking medium[^\n]*--enter --json/, "reference must start issue workers with Sol/medium");
for (const file of [SKILL, REFERENCE]) {
  lacks(file, /gpt-6\.1-sol` (?:com|with) `high`|gpt-6\.1-sol --thinking high/, "child PI defaults must not retain Sol/high");
}
for (const file of [SYSTEM, SYSTEM_MIRROR]) {
  has(file, /Child PI sessions default to `openai-codex\/gpt-6\.1-sol` with `medium` thinking/, "direct child PI handoffs must default to Sol/medium");
  has(file, /PI_REPORT_RUN=<run-id> pi --provider openai-codex --model gpt-6\.1-sol --thinking medium/, "direct child PI launch must pin Sol/medium explicitly");
  has(file, /Internal planner\/builder\/QA model routing remains unchanged/, "outer child PI defaults must not override specialists");
}
has(REFERENCE, /do not alter planner\/plan-heavy internal routing/, "reference must preserve planner routing");
has(REFERENCE, /ORCA terminal send --terminal <exact handle> --text [^\n]*execution-mode <canonical grant mode> session[^\n]*--enter --json/, "reference must use the native mode pin command");
has(REFERENCE, /Repeat both checks before subsequent dispatch on a settled owned PI/, "reuse/resume must reverify model and session pin");
has(SKILL, /`--model`\/`--effort` valem para Claude\/Codex\/Cursor e \*\*não\*\* para PI/, "PI model/effort flags must stay off Orca");
has(SKILL, /worktree set --worktree <id exato> --issue <N> --workspace-status <id> --comment \.\.\. --json/, "workspace metadata command must be exact");
has(SKILL, /`Blocked` \*\*não\*\* é status Orca conhecido[\s\S]{0,200}comentário de bloqueio/, "Blocked must not be invented as an Orca status");
has(SKILL, /check --wait --types worker_done,escalation,question --timeout-ms/, "bounded waiting must use the documented check form");
has(SKILL, /processe \*\*todos\*\* os itens e faça ack do Delivery exato/, "the whole FIFO batch must be processed and acked");
has(SKILL, /worker-release/, "terminal release must be documented");
has(SKILL, /`release_pending`\/desconhecido não é limpo e não libera vaga/, "release_pending must not count as settled");
has(SKILL, /Resultado desconhecido de `worktree create`\/`worker-start` é \*\*reconciliação\*\*/, "unknown outcomes must reconcile, never blind-retry");
has(SKILL, /Nunca faça retry cego nem crie uma segunda workspace\/terminal para a mesma issue/, "no blind retry or duplicate workspace");
has(SKILL, /run-create --objective|orchestration run-create/, "the campaign Run must use the documented command");
has(SKILL, /`completed` é desfecho de tentativa, nunca prova de merge/, "task completion must not imply dependency satisfaction");

// Native Orca operational context; no extra delivery state or live commands.
has(SKILL, /ORCA skills get --help/, "guide detail lookup must follow installed CLI support");
has(SKILL, /ORCA skills get orchestration --full/, "full native guide remains available for detail");
has(REFERENCE, /`agentTerminalHandle`, with `startupTerminal.handle` as compatibility/, "handle lookup must use the native response fields");
has(REFERENCE, /never send to both/, "stale handle recovery must not dual-send");
has(SKILL, /`source_changed`.*sem o cursor antigo/, "changed output source must reset the read cursor");
has(SKILL, /orchestration ask --resume <message_id> --timeout-ms <n> --json/, "pending asks must resume by existing identity");
has(SKILL, /`stage`, `effects` e `residualResources`/, "partial starts must inspect native effect receipts");
has(REFERENCE, /`stage`, `effects`, and `residualResources`/, "reference must inspect native effect receipts");
has(REFERENCE, /Resume a pending ask by its existing message ID/, "concurrent monitoring must avoid duplicate questions");

// ── 6. Single-coordinator admission and scheduling ──────────────────────────
has(SKILL, /coordenador admite \*\*em série\*\*/, "admission must be serial under one coordinator");
has(SKILL, /não oferecem transação única nem claim atômico entre máquinas/, "no false atomicity claim");
has(REFERENCE, /This is serialization with visible intent and recheck, \*\*not\*\* atomic mutual exclusion/, "reference must reject false atomicity");
has(REFERENCE, /never invent a second reservation branch, lock file, claim service, or parallel branch scheme/, "no second reservation mechanism");
has(REFERENCE, /Legacy reservations remain occupied/, "legacy reservations must remain occupied and reconciled");
has(SKILL, /teto de \*\*doze\*\* workers PI de issue|no máximo \*\*12 workers PI de issue\*\*|\*\*Teto global: doze workers PI de issue simultâneos\*\*/, "the ceiling of six issue PI workers must be stated");
has(REFERENCE, /\*\*at most twelve active issue PI workers in total\*\*/, "reference must state the global twelve-worker ceiling");
has(SKILL, /limite de PIs simultâneos \(`≤ 12`\)/, "campaign intake must use the twelve-worker ceiling");
lacks(SKILL, /limite de PIs simultâneos \(`≤ 6`\)/, "campaign intake must not keep the retired six-worker limit");
has(REFERENCE, /twelve is a limit, not a target/, "the ceiling must not be treated as demand");
has(SKILL, /work-conserving/, "the scheduler must be work-conserving");
has(SKILL, /Não existe wave imutável/, "no immutable wave barrier");
has(SKILL, /Timeout, idle, silêncio, `check` vazio ou terminal quieto \*\*não\*\* liberam vaga/, "idle/timeout must never free a slot");
has(SKILL, /Writer bloqueado ou de estado desconhecido, mas ainda vivo, \*\*mantém\*\* sua vaga/, "live blocked/unknown writers keep their slot");
has(SKILL, /Um único writer por issue e por workspace|Um writer por issue\/workspace|1 writer por issue\/workspace/, "one writer per issue workspace");
has(SKILL, /Sem aninhar campanhas dentro de workers/, "no campaign nesting inside workers");
has(REFERENCE, /never to bypass Orca nesting guards or to substitute for an issue dispatch/, "internal PI roles must not replace issue dispatch");

// ── 6b. Admission-to-dispatch efficiency ────────────────────────────────────
// Intake is separate from approved execution.
has(SKILL, /\*\*Escopo desta fase:\*\* é \*intake\*[^\n]*não pré-requisito de cada issue já contratada/, "Phase 1 module scouting must be intake, not per contracted issue");
has(SKILL, /DoR\/escopo ausente continua bloqueando o dispatch — nunca terceirize descoberta vaga ao agente/, "missing DoR must still block dispatch");
has(SKILL, /descoberta de implementação dentro de um escopo de issue já estabelecido pertence ao PI atribuído/, "implementation discovery inside an established scope belongs to the assigned PI");
has(SKILL, /continue aprovado usa Phase 6\/7, não novo ciclo de scout\/proposta\/intake/i, "approved continue must not restart intake");
// Same-session delta: positive preconditions and mandatory fallbacks.
has(SKILL, /\*\*Delta de campanha \(mesma sessão ininterrupta, candidata diferente\):\*\* só quando \*\*todas\*\* as precondições valem: o re-entry completo \(baseline\) já foi concluído nesta sessão; não houve compactação, perda de contexto, chat novo, handoff nem anomalia desde então; grant, repositório\(s\), base\(s\) e coordenador são os mesmos/, "delta refresh must require every precondition");
has(SKILL, /Status dos itens do Project[^\n]*claims ativos e PRs[^\n]*branches remotas com SHAs[^\n]*workers Orca alcançáveis/, "each delta admission needs current campaign-wide occupancy evidence");
has(SKILL, /contrato de \*\*todo\*\* WIP ativo para colisão/, "delta must recheck every active WIP contract");
has(SKILL, /comparar a identidade e o body obtidos na leitura remota atual[^\n]*baseline; `updated_at` sozinho não prova conteúdo igual\. Linha nova ou desconhecida é reconciliada/, "contract reuse requires a current body comparison, never a timestamp alone");
has(REFERENCE, /identity and body from the current remote read[^\n]*baseline; `updated_at` alone never proves unchanged content/, "reference must require current body comparison before reuse");
has(SKILL, /Não é exigido reler o histórico de issues fechadas nem todos os módulos/, "delta must not reread closed histories or all modules");
has(SKILL, /Branch\/claim\/conflito novo e inexplicado, ou inventário incompleto[^\n]*volta ao re-entry completo/, "new conflicts or incomplete inventory must fall back to full re-entry");
has(SKILL, /Compactação, chat novo, handoff e anomalia exigem o completo — nunca o delta/, "compaction/new chat/handoff/anomaly must always be full");
lacks(SKILL, /Re-entry de campanha nunca usa fast path/, "the unconditional full-reentry-per-candidate wording must be gone");
lacks(SKILL, /Rodar \*\*re-entry completo\*\* \(Phase 6\): fetch\/prune/, "Phase 9 must not prescribe unconditional full re-entry");
lacks(SKILL, /^1\. Confirmar repo\/Project, executar re-entry completo e preflight Orca$/m, "Quick start B must not prescribe unconditional full re-entry");
has(SKILL, /Quick start|## Quick start/, "quick start must remain");
has(SKILL, /Campanha já aprovada: vá direto às Phases 6\/7, sem repetir scout\/proposta\/intake/, "opening route must distinguish approved execution from intake");
has(SKILL, /chat novo nunca usa delta nem o fast path de issue única/, "cold-start quick start must not offer the same-session shortcut");
has(SKILL, /delta de campanha de 6\.0 na mesma sessão ininterrupta com baseline/, "Quick start B must use the 6.0 selector");
has(REFERENCE, /\*\*Same-session delta refresh \(preconditions, all required\):\*\* a full baseline reconciliation already completed in this session; no compaction, lost context, new chat, handoff, or anomaly since; same grant, repositories, bases, and coordinator/, "reference section 3 must carry the delta preconditions");
has(REFERENCE, /compaction, new chat, handoff, or anomaly always requires the full one/, "reference must keep full re-entry mandatory after interruption");
has(REFERENCE, /A new unexplained branch\/claim\/conflict or an incomplete inventory falls back to full re-entry/, "reference must fall back on new conflict/incomplete inventory");
has(REFERENCE, /occupancy evidence is current for this admission/, "admission gate must require current occupancy evidence");
// One detailed dispatch protocol, owned by reference section 6.
has(SKILL, /\*\*Protocolo detalhado único: `references\/parallel-execution\.md`, seção 6\.\*\* Carregue-a antes de qualquer admissão\/dispatch, mesmo de uma só issue/, "main 7.2 must link the single detailed protocol even for one issue");
has(SKILL, /seção 6 de `references\/parallel-execution\.md` é obrigatória/, "Phase 7 intro must require reference section 6 for any dispatch");
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
has(SKILL, /\*\*Handoff em memória primeiro\.\*\*[^\n]*NOT TO DO[^\n]*Sem Task pré-criada/, "main skill must keep the compact handoff-first stage");
has(REFERENCE, /one uninterrupted bounded unit: once a PI is open[^\n]*no unrelated scouting, board reanalysis, opening another PI, or a user-facing "progress" reply as the end of the turn while the row is unassigned and actionable/, "an opened PI must be dispatched or explicitly blocked before anything else");
has(SKILL, /nenhum scouting alheio, nenhuma reanálise do board, nenhum outro PI aberto e nenhuma resposta de “progresso” como fim de turno/, "main skill must forbid idling an unassigned PI");
has(REFERENCE, /finish one row's dispatch before creating the next independent ready row; do not wait for the first worker to complete/, "serial admission with parallel implementation must not wait for completion");
has(REFERENCE, /A blocked row may let unaffected ready rows proceed only under the existing safety\/isolation gates/, "a blocked row must not freeze safe independent rows");
has(REFERENCE, /reuse it only after exact ownership proof[^\n]*never duplicate it or interrupt an active or unrelated PI/, "reuse of an unassigned PI requires exact ownership proof");
has(SKILL, /\*\*Prioridade de ações do coordenador:\*\* \(1\) tratar pergunta\/resultado pendente[^\n]*\(2\) terminar primeiro um PI aberto ainda sem atribuição[^\n]*\(3\) despachar candidatas independentes seguras[^\n]*\(4\) só então observação limitada/, "action priorities must be explicit and ordered");
has(SKILL, /Sem timer fixo de polling/, "priorities must not add a polling timer");
// Model: skip restart when the fresh UI already proves it; restart only for an uninjected owned PI.
has(REFERENCE, /If that fresh UI already shows `openai-codex\/gpt-6\.1-sol` with `medium`, skip `\/quit` and the restart/, "an already-correct fresh model must skip the restart");
has(REFERENCE, /one bounded fresh verification read is allowed; never infer the model from command echo, stale output, global settings, or exit 0/, "missing indication allows only a fresh verification read");
has(REFERENCE, /only when this is a newly created or settled owned PI with \*\*no task injected\*\*/, "restart must be limited to an uninjected owned PI");
// Mode pin is mandatory even when the model restart was skipped.
has(REFERENCE, /whether or not the model restart was skipped/, "mode pin must remain mandatory when the restart is skipped");
// worker-start proof and unknown-start freeze.
has(REFERENCE, /the real Task\/Dispatch identity and the ready\/injection\/live proof must be read before reporting `worker active`/, "worker active needs real dispatch proof");
has(REFERENCE, /error or unknown result freezes lifecycle mutation[^\n]*reconcile the existing workspace, terminal, and dispatch[^\n]*\*\*before\*\* any further lifecycle call/, "unknown start must freeze lifecycle mutation until reconciled");
has(REFERENCE, /No blind retry, no new workspace, no direct-prompt or alternative-dispatch fallback, no lowered gates/, "unknown start must not retry, duplicate, fall back, or lower gates");
has(REFERENCE, /does not assert a cause for any past start failure/, "the protocol must not claim a cause for the earlier failure");
has(SKILL, /\*\*`worker-start` com falha ou resultado desconhecido\*\* congela o ciclo de vida[^\n]*antes\*\* de qualquer nova mutação — sem retry cego, sem nova workspace, sem prompt direto como fallback e sem baixar gates/, "main skill must keep the unknown-start freeze");
lacks(SKILL, /orchestration dispatch\b[^\n]*--inject|worker-start[^\n]*--inject/, "no second active dispatch mechanism");
lacks(REFERENCE, /orchestration dispatch\b[^\n]*--inject|worker-start[^\n]*--inject/, "no second active dispatch mechanism");
// Anti-patterns are captured explicitly.
has(SKILL, /Deixar um PI aberto sem atribuição enquanto faz scout repetido/, "anti-pattern: unassigned PI left idle");
has(SKILL, /Herdar o `FLOW_EXECUTOR_ID` do shell para a próxima issue/, "anti-pattern: inherited executor ID");
has(SKILL, /Reiniciar o PI quando a UI fresca já prova/, "anti-pattern: needless model restart");

// ── 6c. Goal activation and file-free prompt delivery ──────────────────────
has(SKILL, /texto inline preparado em memória, nunca apenas um caminho de arquivo/, "Task handoff must be inline text, not a prompt-file pointer");
has(SKILL, /Não crie `\.md` só para transportar prompts\/handoffs/, "main skill must forbid transport-only Markdown files");
has(REFERENCE, /Do not create `\.md` files solely to transport prompts\/handoffs or mirror issue bodies/, "reference must forbid prompt/issue-body file mirrors");
has(REFERENCE, /Pass its text inline to `task-create --spec`, never just a file path/, "dispatch must receive its self-contained spec inline");
lacks(SKILL, /\.pi\/flow\/<project-slug>\/BACKLOG\.md|Scouts por módulo → `PROJECT_MAP\.md`/, "intake must not prescribe local backlog/map files");
has(SKILL, /mapa fundamentado apresentado no chat, sem arquivo local/, "intake map must stay in chat");
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
has(SKILL, /envia `worker_done` uma só vez e chama `goal_complete` com o `goal_id` atual como última ferramenta/, "lifecycle result must precede the terminating Goal tool");
has(REFERENCE, /report `worker_done` exactly once, then call `goal_complete` with the current `goal_id` as the final tool/, "Goal completion must not prevent the single lifecycle report");
has(REFERENCE, /Task must explicitly allow this sole post-`worker_done` action as native Goal finalization — no engineering, second lifecycle report, polling, or other Orca call after settlement/, "Task must narrowly authorize only final Goal bookkeeping after worker_done");
has(REFERENCE, /Before Task creation, require the Goal extension[^\n]*No goal is currently set\./, "Goal availability and fresh-session state must be proven before Task injection");
has(REFERENCE, /observe its matching `Goal complete` result and settled terminal with no pending continuation/, "terminal release must not race Goal completion");
has(REFERENCE, /Neither Goal completion nor `worker_done` proves GitHub `Done`/, "Goal success must not bypass GitHub completion gates");
has(SKILL, /`\/goal` cobre somente a entrega autorizada daquele worker, sem incluir PR\/merge\/deploy do coordenador/, "Goal must stop at the worker's authorized deliverable");

// ── 7. Project status contract ──────────────────────────────────────────────
has(SKILL, /`Backlog`, `Ready`, `In progress`, `In review`, `Blocked`, `Done`/, "the six Project statuses must be exact");
has(SKILL, /`Blocked` é \*\*aditivo\*\*/, "Blocked must be additive on an existing board");
has(SKILL, /Atualize \*\*e releia\*\* o Project na hora de cada transição/, "status must be updated and reread at each transition");
has(SKILL, /mova o card para `Blocked`, releia o status, e pule a issue \*\*e seus dependentes\*\*/, "external blockers must move to Blocked, be reread, and skip dependents");
has(SKILL, /Recheca[r]? .*quando o usuário informa a resolução|rechecar acontece quando o usuário informa a resolução/i, "blocked work must be rechecked on user resolution, not polled");

// ── 8. Done postconditions ──────────────────────────────────────────────────
has(SKILL, /Pós-condição de `Done`, todas obrigatórias: `mergedAt != null`/, "Done requires a real mergedAt");
has(SKILL, /`baseRefName` igual à base aprovada/, "Done requires the approved base");
has(SKILL, /issue \*\*fechada\*\* — quando a base não é a default e o GitHub não fecha automaticamente, feche explicitamente/, "non-default-base merges require an explicit issue close");
has(SKILL, /Project `Done` \*\*atualizado e relido\*\*/, "Done requires an updated and reread Project status");
has(SKILL, /Nunca são `Done`: `worker_done`, exit verde, task `completed`, PR aberto, PR fechado com `mergedAt=null`, deployment\/migração exigida pela AC ainda incompleta/, "false Done signals must be enumerated");
has(SKILL, /integração é \*\*serial por repositório\*\*, sempre na base escolhida, nunca em `main` implícita/, "integration must be serial into the chosen base");
has(SKILL, /incorpore-a apenas por merge normal autorizado/, "a moved base is incorporated only by authorized normal merge");
has(SKILL, /Nunca force push, nunca rebase automático/, "no force push or automatic rebase");

// ── 9. Incident, repair, and preservation ───────────────────────────────────
has(SKILL, /no máximo duas tentativas, cada uma com hipótese nova; no máximo um retry quando a falha for comprovadamente transitória/, "repairs are two attempts plus one proven transient retry");
has(SKILL, /congela os recursos afetados[\s\S]{0,200}nada de restore, reseed, cleanup, retry ou recriação sem autorização nova/, "incidents must freeze mutation, including cleanup and restore");
has(SKILL, /Cleanup condicional da worktree da issue/, "post-merge cleanup must be conditional, not blanket-preserved");
lacks(SKILL, /não existe deleção, arquivamento ou cleanup automático|Não há limpeza automática/, "blanket no-cleanup rules must be removed");
lacks(REFERENCE, /There is no automatic cleanup|preserve\*\* the workspace and the branch/, "reference must drop the blanket preserve rule");
has(SKILL, /não relacionados à campanha\*\* ficam intocados/, "unrelated workspaces/terminals must be preserved");
has(SKILL, /Só com prova exata de issue, repositório, branch real, base, PR e dono/, "reuse requires exact ownership proof");
has(REFERENCE, /never restore or reseed data after an unexpected mutation without fresh explicit authorization/, "no unauthorized restore/reseed");
has(REFERENCE, /no test, migration, seed, or deployment against non-disposable state/, "workers must not touch non-disposable state");

// ── 9b. Event-driven completion and conditional cleanup (fixed policy gates) ─
// Automatic routing and exclusions across skill, SYSTEM, mirror, and README.
has(SKILL, /Acione automaticamente, sem exigir `\/skill:flow-orca`/, "skill must self-route automatically");
has(SKILL, /Não acione para\*\* criação simples de worktree\/terminal, handoff completo sem supervisão/, "skill must exclude simple worktree and unsupervised handoff");
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
  has(path, /prefix the launch with that id, e\.g\. `PI_REPORT_RUN=<run-id> pi --provider openai-codex --model gpt-6\.1-sol --thinking medium`/, "worker launched with PI_REPORT_RUN and Sol/medium");
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
has(SKILL, /Testes são meio: provado o comportamento, pare de testar e entregue/, "flow-orca stops testing once proven");
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
has(SKILL, /O WIP de um worker ativo é dele até `worker_done`, pergunta ou escalation/, "coordinator must not shadow an active worker");
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
has(SKILL, /\*\*Fechamento de cada worker \(triagem obrigatória\)\.\*\* O wake do Orca, o report do worker ou o usuário dizendo que os workers finalizaram, pararam ou estão ociosos é a ordem para fechar \*\*todos\*\* os workers da campanha agora, nunca uma pergunta sobre o que fazer/, "campaign settlement trigger");
has(SKILL, /\*\*completo\*\*[^\n]*\*\*incompleto sem bloqueio\*\*[^\n]*\*\*bloqueado\*\*/, "campaign workers are triaged into three outcomes");
has(SKILL, /faça \*\*uma\*\* pergunta consolidada com todos os PRs prontos/, "campaign merge approval is one batched question");
has(SKILL, /devolva o restante exato ao \*\*mesmo\*\* PI e workspace/, "incomplete campaign work goes back to the same worker");
has(SKILL, /Bloqueio, pergunta ou aprovação pendente de um worker nunca para o fechamento, a reconciliação, o merge ou a admissão dos outros/, "one campaign blocker never stalls the others");
has(SKILL, /Quando falta aprovação de merge, prepare todos os PRs prontos e peça-a numa única pergunta consolidada \(7\.4\); autorização explícita já dada nesta conversa para esses merges vale e não é perguntada de novo/, "7.6 merge approval reuses earlier explicit authorization");
has(README, /PI should load it automatically for issue\/board campaigns and coordination of PI issue workers in Orca worktrees; there is no need to name it/, "README must document automatic routing");
has(README, /Simple worktree creation, unsupervised handoff, and standalone explanations remain outside this workflow/, "README must document routing exclusions");
// Notification: Orca-owned pointer wake, one non-waiting check, ack after settlement, manual wait only as fallback.
has(SKILL, /Conclusão por evento, sem polling/, "event-driven completion must be the default");
has(SKILL, /ponteiro é \*\*só despertar\*\*, nunca `worker_done`, nem GitHub `Done`/, "pointer is wakeup only");
has(SKILL, /ORCA orchestration check --run <run-id verificado> --json`\s+sem `--wait`|ORCA orchestration check --run <run-id verificado> --json` sem `--wait`/, "wake must run one check without --wait");
has(SKILL, /ORCA orchestration check --run <run-id verificado> --ack <delivery-id> --json/, "exact Delivery ack must name the verified Run");
has(SKILL, /resolva ciclo de vida\/Goal[^\n]*\*\*antes\*\* do ack/, "settlement must precede ack");
has(SKILL, /validando Run, Task, Dispatch, issue e veredito explícito/, "result attribution must be validated");
has(SKILL, /`worker_done` nunca prova Goal; é permitida \*\*uma\*\* verificação pontual de assentamento[^\n]*não é monitoramento contínuo/, "wake before goal_complete allows only one bounded settlement verification");
has(SKILL, /Assentamento não provado: não libere, mantenha vaga e terminal, registre a retenção explícita/, "unproven settlement must retain slot and terminal");
has(SKILL, /retenção registrada conta como resolvida[^\n]*não congele a inbox inteira[^\n]*ack nunca libera vaga nem prova Goal/, "ack must not freeze the inbox nor free a slot");
has(REFERENCE, /wake arrives immediately on `worker_done` and can precede the worker's final `goal_complete`, so `worker_done` never proves Goal/, "reference wake may precede goal_complete");
has(REFERENCE, /ORCA terminal wait --terminal <exact handle> --for tui-idle --timeout-ms <n> --json`, then an exact-cursor `ORCA orchestration worker-read --dispatch <id> --json`[^\n]*not a monitoring loop/, "reference bounded settlement verification");
has(REFERENCE, /If settlement is still unproven: do not release; keep the slot and terminal; record an explicit retention/, "reference unproven settlement retains");
has(REFERENCE, /a recorded retention counts as resolved, so an unproven Goal never freezes the entire inbox indefinitely/, "reference retention allows ack");
has(SKILL, /duplicada ou sem correspondência não é aceita nem liberada/, "duplicate or unmatched messages must not release anything");
has(SKILL, /drene lotes limitados adicionais só enquanto houver mensagens realmente pendentes — nunca por timer/, "extra batches only while pending");
has(SKILL, /Sem sleep, loops de espera, polling ou leituras repetidas de terminal só para observar/, "no sleep/poll loops");
lacks(SKILL, /Sem sleep, loops de espera, `check --wait` repetido/, "blanket repeated-wait ban is replaced by the conditional rolling fallback");
// Lost-wake correction: queued != woken; conditional native rolling long-poll; unfiltered for untracked status/handoff.
for (const path of [SYSTEM, SYSTEM_MIRROR]) {
  lacks(path, /which wakes you/, "no unconditional wake promise");
}
has(SKILL, /recibo de envio `ok: true` prova só que a mensagem foi enfileirada, nunca que o coordenador retomou/, "skill: queued is not a wake");
has(SKILL, /Fallback manual explícito[\s\S]{0,200}pedido explícito do usuário ou quando o push do runtime está genuinamente indisponível ou não verificado[\s\S]{0,200}wake perdido confirmado/, "skill: fallback is conditional on unavailable/unverified push or confirmed lost wake");
has(SKILL, /`check --run <run-id verificado> --wait --timeout-ms <n> --json` sem `--types`[^\n]*PI_REPORT_RUN[^\n]*sem Task\/Dispatch/, "skill: unfiltered waiter for untracked PI_REPORT_RUN children");
has(SKILL, /rearme[^\n]*timeout[^\n]*enquanto houver workers conhecidos pendentes/, "skill: rolling rearm after timeout");
has(SKILL, /status\/handoff[^\n]*evidência de report apenas[^\n]*nunca assentamento de ciclo de vida, liberação, GitHub `Done`, autorização de merge ou sucesso do runtime/, "skill: status/handoff is not settlement");
has(SKILL, /não fabrique `worker_done` nem IDs retroativos/, "skill: no fabricated worker_done");
has(SKILL, /prompt chamado “handoff”[^\n]*supervisão[^\n]*Task\/Dispatch/, "skill: supervised handoff routes through Task/Dispatch");
has(SKILL, /transferência completa genuína[^\n]*termina após entrega comprovada/, "skill: genuine full transfer needs no monitoring");
has(SKILL, /encerrar trabalho supervisionado[^\n]*wake não verificado/, "skill anti-pattern: no abandon on unverified wake");
has(REFERENCE, /`ok: true` proves only that mail was queued, never that the coordinator resumed/, "reference: queued is not a wake");
has(REFERENCE, /fallback only on explicit user request or when runtime push is genuinely unavailable or unverified for this Run, including a lost wake confirmed/, "reference: conditional fallback");
has(REFERENCE, /^ORCA orchestration check --run <verified run-id> --wait --timeout-ms <n> --json$/m, "reference: unfiltered rolling waiter");
has(REFERENCE, /Rearm after a timeout checkpoint while known workers remain pending/, "reference: rolling rearm");
has(REFERENCE, /Status\/handoff reports are report evidence only/, "reference: status/handoff is evidence only");
has(REFERENCE, /Do not sleep, poll, or repeatedly read terminals merely to observe/, "reference: no polling");
lacks(REFERENCE, /Do not sleep, loop, repeat waits, or repeatedly read terminals merely to observe/, "reference: blanket repeated-wait ban replaced");
has(SKILL, /Fallback manual explícito[\s\S]{0,200}pedido explícito do usuário ou quando o push do runtime está genuinamente indisponível/, "manual wait is an explicit fallback only");
has(SKILL, /wake automático não verificado, não falha de worker/, "unverified wake must not be worker failure");
has(SKILL, /sem `--to`, sem `--from`, sem terminal direto duplicado/, "worker_done must be sent once to the Run");
has(SKILL, /PI coordenador exato/, "Run must bind to the exact coordinator PI");
has(REFERENCE, /Completion is \*\*event-driven\*\*; Orca already owns delivery — no new extension, service, file, or monitor/, "reference must keep event delivery with Orca");
has(REFERENCE, /^ORCA orchestration check --run <verified run-id> --json$/m, "reference non-waiting check");
has(REFERENCE, /^ORCA orchestration check --run <verified run-id> --ack <delivery-id> --json$/m, "reference exact ack");
has(REFERENCE, /Resolve lifecycle and Goal settlement \*\*before\*\* acknowledging/, "reference settlement before ack");
has(REFERENCE, /pointer is a wakeup \*\*only\*\*; it is neither `worker_done` nor GitHub `Done`/, "reference pointer is wakeup only");
has(REFERENCE, /fallback only on explicit user request or when runtime push is genuinely unavailable/, "reference manual wait is fallback only");
// Cleanup: authority, proof, content classification, recovery, exact command, incident freeze.
has(SKILL, /ORCA worktree rm --worktree <seletor exato> --json`, sem `--force`\/`--run-hooks`/, "cleanup must use the exact supported command without force/hooks");
has(REFERENCE, /^ORCA worktree rm --worktree <exact selector> --json$/m, "reference cleanup command");
lacks(SKILL, /^\s*(?:ORCA\s+)?worktree rm\b[^\n]*--(?:force|run-hooks)/m, "no executable cleanup form may use force or hooks");
has(SKILL, /nem YOLO, nem “entregar”, nem um grant mutável genérico o autorizam/, "generic grants must not authorize cleanup");
has(SKILL, /grants antigos nunca são ampliados em silêncio/, "old grants must not be silently expanded");
has(SKILL, /Pedido explícito do usuário para aquele cleanup exato|pedido explícito do usuário para aquele cleanup exato/, "explicit exact user request suffices");
has(SKILL, /Classifique \*\*todo\*\* o conteúdo — incluindo ignorados, histórico\/refs\/reflogs ou trabalho salvo não publicado/, "cleanup must classify ignored data, history, refs and unpublished work");
has(SKILL, /Sem `git clean`\/`rm` de pré-limpeza/, "no pre-clean");
has(SKILL, /`worker-release` isoladamente não preserva evidência após `worktree rm`/, "worker-release alone must not be treated as recovery");
has(SKILL, /não segura, por si só, a vaga/, "retained worktree must not hold a settled slot");
has(SKILL, /Falha ou pós-estado ambíguo é incidente/, "failed removal is an incident");
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
  [/## Phase 2 — Normalizar backlog/, "backlog normalization and dedup"],
  [/Descubra Projects abertos vinculados/, "Project discovery"],
  [/sub_issues/, "native epics and sub-issues"],
  [/priority:p0/, "priority labels"],
  [/effort:xl/, "effort labels"],
  [/Não quebrar o que já funciona, sem espiral de testes/, "proportional regression"],
  [/## Phase 6 — Re-entry/, "autonomous re-entry"],
  [/review independente/, "independent issue/PR validation"],
  [/Tabela de reconciliação em memória/, "reconciliation table derived at read time"],
  [/Regras do DAG derivado/, "adaptive derived DAG"],
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
