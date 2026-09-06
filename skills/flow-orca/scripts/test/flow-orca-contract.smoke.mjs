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
const MEMORY_SKILL = "skills/project-memory/SKILL.md";
const PLANNER_SMOKE = "skills/planner/scripts/test/internal-execution-order.smoke.mjs";
const README = "README.md";
const INSTALL_SH = "install.sh";
const INSTALL_PS1 = "install.ps1";
const ARCH_JSON = ".pi/memory/architecture.json";
const ARCH_HTML = ".pi/memory/architecture.html";

const files = [
  SKILL, REFERENCE, SYSTEM, SYSTEM_MIRROR, MEMORY_SKILL,
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
has(SYSTEM, /Issue\/board delivery use `flow-orca`|delivery use `flow-orca`/, "SYSTEM must route issue/board delivery to flow-orca");
has(SYSTEM, /branch-per-issue delivery:\*\* `flow-orca`/, "SYSTEM skill routing table must name flow-orca");
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
// The global contract owns the mode vocabulary; Flow consumes it.
has(SYSTEM, /`SUPERVISIONADO \| AUTÔNOMO \| YOLO`/, "SYSTEM must own the canonical global mode enum");
has(SYSTEM, /\*\*`AUTÔNOMO` is the default\*\*/, "SYSTEM must make AUTÔNOMO the default mode");
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
has(SKILL, /worktree create --repo <selector> --name <name> --issue <N> --base-branch <base do repo> --no-parent --agent pi --setup <policy> --json/, "the documented worktree create form must be exact");
has(SKILL, /\*\*Não existe\*\* flag documentada de nome de branch nem de attach em branch existente: não invente/, "invented branch/attach flags must be forbidden");
has(SKILL, /`--no-parent` controla linhagem de sidebar, não a base Git/, "--no-parent must not be confused with the Git base");
has(SKILL, /Leia da resposta o ID do workspace, a \*\*branch real\*\* e o handle do terminal; nunca derive branch do `--name`/, "identity must come from the actual create response");
has(SKILL, /Inspecione e autorize política de setup e terminais default \*\*antes\*\* do create/, "setup/default terminals must be authorized before create");
has(SKILL, /mesmo com `--setup skip`/, "setup skip must not be assumed side-effect free");
has(SKILL, /worker-start --task <id> --terminal <handle exato> --run <id> --json/, "dispatch must adopt the exact prepared terminal");
has(SKILL, /`worker-start` aceita `--base-branch`, mas \*\*não\*\* aceita `--issue`/, "worker-start must not be given --issue");
has(SKILL, /`--model`\/`--effort` valem para Claude\/Codex\/Cursor e \*\*não\*\* para PI/, "PI model/effort must stay untouched");
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

// ── 6. Single-coordinator admission and scheduling ──────────────────────────
has(SKILL, /coordenador admite \*\*em série\*\*/, "admission must be serial under one coordinator");
has(SKILL, /não oferecem transação única nem claim atômico entre máquinas/, "no false atomicity claim");
has(REFERENCE, /This is serialization with visible intent and recheck, \*\*not\*\* atomic mutual exclusion/, "reference must reject false atomicity");
has(REFERENCE, /never invent a second reservation branch, lock file, claim service, or parallel branch scheme/, "no second reservation mechanism");
has(REFERENCE, /Legacy reservations remain occupied/, "legacy reservations must remain occupied and reconciled");
has(SKILL, /teto de \*\*seis\*\* workers PI de issue|no máximo \*\*6 workers PI de issue\*\*|\*\*Teto global: seis workers PI de issue simultâneos\*\*/, "the ceiling of six issue PI workers must be stated");
has(REFERENCE, /\*\*at most six active issue PI workers in total\*\*/, "reference must state the global six-worker ceiling");
has(REFERENCE, /six is a limit, not a target/, "the ceiling must not be treated as demand");
has(SKILL, /work-conserving/, "the scheduler must be work-conserving");
has(SKILL, /Não existe wave imutável/, "no immutable wave barrier");
has(SKILL, /Timeout, idle, silêncio, `check` vazio ou terminal quieto \*\*não\*\* liberam vaga/, "idle/timeout must never free a slot");
has(SKILL, /Writer bloqueado ou de estado desconhecido, mas ainda vivo, \*\*mantém\*\* sua vaga/, "live blocked/unknown writers keep their slot");
has(SKILL, /Um único writer por issue e por workspace|Um writer por issue\/workspace|1 writer por issue\/workspace/, "one writer per issue workspace");
has(SKILL, /Sem aninhar campanhas dentro de workers/, "no campaign nesting inside workers");
has(REFERENCE, /never to bypass Orca nesting guards or to substitute for an issue dispatch/, "internal PI roles must not replace issue dispatch");

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
has(SKILL, /não existe deleção, arquivamento ou cleanup automático/, "completed workspaces must be preserved");
has(SKILL, /não relacionados à campanha\*\* ficam intocados/, "unrelated workspaces/terminals must be preserved");
has(SKILL, /Só com prova exata de issue, repositório, branch real, base, PR e dono/, "reuse requires exact ownership proof");
has(REFERENCE, /never restore or reseed data after an unexpected mutation without fresh explicit authorization/, "no unauthorized restore/reseed");
has(REFERENCE, /no test, migration, seed, or deployment against non-disposable state/, "workers must not touch non-disposable state");

// ── 10. Preserved delivery capabilities ─────────────────────────────────────
for (const [pattern, message] of [
  [/## Phase 2 — Normalizar backlog/, "backlog normalization and dedup"],
  [/Descubra Projects abertos vinculados/, "Project discovery"],
  [/sub_issues/, "native epics and sub-issues"],
  [/priority:p0/, "priority labels"],
  [/effort:xl/, "effort labels"],
  [/baseline de caracterização/, "characterization baseline"],
  [/Regressão cumulativa é obrigatória/, "cumulative regression"],
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
has(README, /### Modos de autorização/, "README must document the general authorization modes");
has(README, /`SYSTEM\.md`/, "README must point at the canonical global contract");
has(README, /`AUTÔNOMO` \(\*\*default\*\*\)/, "README must state the global default mode");
has(README, /por repositório/, "README must state the per-repository base choice");
has(README, /seis/, "README must state the six-worker ceiling");
has(README, /`Blocked`/, "README must mention the Blocked Project status");
has(README, /`mergedAt`/, "README must state the merged-evidence Done rule");
has(README, /verificação estática|estaticamente|não é certificação de campanha live|nenhuma campanha live/i, "README must keep the static-only caveat");

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
