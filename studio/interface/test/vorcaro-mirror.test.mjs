// Vorcaro's mirrors (Orca board, GitHub Project) and the organization rules. Fake CLIs as in-memory functions only:
// nothing is spawned, nothing reaches GitHub or Orca.
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";
import { createGithubMirror, createOrcaMirror, itemBody, orcaStatusFor, readMirrorConfig, statusOptionFor } from "../lib-server/vorcaro-mirror.mjs";
import { autoArchivable, boardChanges, buildBoard, createArchive, isArchived, organizeProjects, projectFolder, readSessionDetail, seenSnapshot, validateAction } from "../lib-server/vorcaro.mjs";
import { changeLabel, popHtml } from "../public/vorcaro.js";

const tmp = await mkdtemp(path.join(os.tmpdir(), "pi-studio-mirror-"));
after(() => rm(tmp, { recursive: true, force: true }));
const HOUR = 3_600_000;
const digest = (name, cwd, extra = {}) => ({ path: path.join(tmp, `${name}.jsonl`), cwd, project: path.basename(cwd), title: name, turns: 1, cost: 0, openItems: [], doneItems: 0, endedWith: "stop", lastOutput: "Pronto.", goalState: null, lastActivity: 10 * HOUR, ...extra });

describe("config", () => {
  test("no file: Orca on, no GitHub; a GitHub block needs owner and project; bad values are ignored", async () => {
    assert.deepEqual(await readMirrorConfig(path.join(tmp, "nada.json")), { orcaAuto: true, claudeCode: true, github: null });
    const file = path.join(tmp, "config.json");
    await writeFile(file, JSON.stringify({ orca: { auto: false }, claudeCode: false, github: { owner: "NatiamG", project: 2, conta: "NatiamG" } }));
    assert.deepEqual(await readMirrorConfig(file), { orcaAuto: false, claudeCode: false, github: { owner: "NatiamG", project: 2, conta: "NatiamG" } });
    await writeFile(file, JSON.stringify({ github: { owner: "a b", project: 2 } }));
    assert.equal((await readMirrorConfig(file)).github, null);
    await writeFile(file, JSON.stringify({ github: { owner: "x", project: "2" } }));
    assert.equal((await readMirrorConfig(file)).github, null);
  });
});

describe("orca", () => {
  test("phases map to Orca's board columns", () => {
    assert.equal(orcaStatusFor("enviado"), "in-progress");
    assert.equal(orcaStatusFor("verificando"), "in-review");
    assert.equal(orcaStatusFor("feito"), "completed");
    assert.equal(orcaStatusFor("qualquer"), "in-progress");
  });

  test("ensure opens Orca when its runtime is down and waits until it answers", async () => {
    const calls = [];
    let up = false;
    const orca = createOrcaMirror({ wait: async () => {}, run: async (args) => {
      calls.push(args.join(" "));
      if (args[0] === "open") { up = true; return { ok: true }; }
      return { result: { app: { running: up }, runtime: { reachable: up } } };
    } });
    assert.equal(await orca.ensure(), true);
    assert.ok(calls.includes("open --json"), "Orca is launched by itself");
    calls.length = 0;
    assert.equal(await orca.ensure(), true);
    assert.ok(!calls.includes("open --json"), "an Orca already up is not reopened");
  });

  test("ensure gives up when Orca is not installed or never comes up", async () => {
    const missing = createOrcaMirror({ run: async () => { throw Object.assign(new Error("x"), { code: "ENOENT" }); } });
    assert.equal(await missing.ensure(), false);
    const stuck = createOrcaMirror({ wait: async () => {}, startTimeoutMs: 3000, run: async () => ({ result: { runtime: { reachable: false } } }) });
    assert.equal(await stuck.ensure(), false);
  });

  test("createTask: a child worktree with a PI agent; setStatus moves it on the board", async () => {
    const calls = [];
    const orca = createOrcaMirror({ run: async (args) => {
      calls.push(args);
      return args[1] === "create" ? { result: { worktree: { id: "r::w", path: "D:/repo-wt/x" }, agentTerminalHandle: "t1" } } : { ok: true };
    } });
    assert.deepEqual(await orca.createTask({ repoId: "r", parentWorktreeId: "r::main", name: "vorcaro-x", prompt: "/goal x", comment: "vorcaro d1" }), { worktreeId: "r::w", path: "D:/repo-wt/x", handle: "t1" });
    assert.ok(calls[0].includes("--agent") && calls[0].includes("pi") && calls[0].includes("--parent-worktree=worktree:r::main"));
    await orca.setStatus("D:/repo-wt/x", "verificando");
    assert.deepEqual(calls[1], ["worktree", "set", "--worktree=path:D:/repo-wt/x", "--workspace-status=in-review", "--json"]);
  });
});

describe("github", () => {
  const fields = [{ id: "F1", name: "Status", options: [{ id: "o1", name: "Todo" }, { id: "o2", name: "In Progress" }, { id: "o3", name: "Done" }] }, { id: "F2", name: "Title" }];

  test("statusOptionFor picks the Status option by name", () => {
    assert.deepEqual(statusOptionFor(fields, "enviado"), { fieldId: "F1", optionId: "o1", name: "Todo" });
    assert.deepEqual(statusOptionFor(fields, "trabalhando"), { fieldId: "F1", optionId: "o2", name: "In Progress" });
    assert.deepEqual(statusOptionFor(fields, "feito"), { fieldId: "F1", optionId: "o3", name: "Done" });
    assert.equal(statusOptionFor([{ id: "F", name: "Status", options: [{ id: "a", name: "Outra" }] }], "feito"), null);
    assert.equal(statusOptionFor([], "feito"), null);
  });

  test("create, move and read back, always with the pinned account's token", async () => {
    const calls = [];
    const run = async (args, env) => {
      calls.push({ args, env });
      if (args[1] === "item-create") return JSON.stringify({ id: "I1" });
      if (args[1] === "view") return JSON.stringify({ id: "P1", url: "https://github.com/users/x/projects/2" });
      if (args[1] === "field-list") return JSON.stringify({ fields });
      if (args[1] === "item-list") return JSON.stringify({ items: [{ id: "I1", status: "Done" }] });
      return "{}";
    };
    const github = createGithubMirror({ owner: "NatiamG", project: 2, conta: "NatiamG" }, { run, token: async (account) => `tok-${account}\n` });
    const demand = { id: "d1", project: "loja", cwd: "D:/loja", objetivo: "Fechar o Pix", checklist: ["Testes passam"], verify: ["npm test"] };
    assert.deepEqual(await github.create(demand), { itemId: "I1" });
    assert.equal(await github.setPhase("I1", "trabalhando"), "In Progress");
    assert.equal(await github.setPhase("I1", "feito"), "Done");
    assert.deepEqual([...(await github.statuses())], [["I1", "Done"]]);
    assert.ok(calls.every((call) => call.env.GH_TOKEN === "tok-NatiamG"), "every write uses the pinned account");
    assert.equal(calls.filter((call) => call.args[1] === "view").length, 1, "project metadata is read once");
    const edit = calls.find((call) => call.args[1] === "item-edit").args;
    assert.deepEqual(edit.slice(2, 10), ["--id", "I1", "--project-id", "P1", "--field-id", "F1", "--single-select-option-id", "o2"]);
    assert.match(itemBody(demand), /- \[ \] Testes passam/);
  });
});

describe("organization", () => {
  test("projectFolder folds desktop-app and team worktrees into the repository", () => {
    assert.equal(projectFolder("D:\\x\\evolvera\\.claude\\worktrees\\abc"), "D:\\x\\evolvera");
    assert.equal(projectFolder("D:/x/repo-team/front"), "D:/x/repo");
    assert.equal(projectFolder("D:/x/loja"), "D:/x/loja");
  });

  test("organizeProjects: open sessions newest first, the ones past two are over the limit", () => {
    const cwd = path.join(tmp, "loja");
    const digests = [
      digest("a", cwd, { openItems: [{ text: "x" }], lastActivity: 5 }),
      digest("b", path.join(cwd, ".claude", "worktrees", "w1"), { openItems: [{ text: "x" }], lastActivity: 9 }),
      digest("c", cwd, { openItems: [{ text: "x" }], lastActivity: 7 }),
      digest("d", cwd),
    ];
    const [row] = organizeProjects(digests);
    assert.equal(row.name, "loja");
    assert.equal(row.open, 3);
    assert.equal(row.over, 1);
    assert.deepEqual(row.main.map((item) => item.title), ["b", "c"]);
    assert.deepEqual(row.extra.map((item) => item.title), ["a"]);
    assert.equal(row.done, 1);
    const board = buildBoard(digests, { now: 10 * HOUR });
    assert.ok(board.suggestions.some((text) => /loja tem 3 sessões abertas/.test(text)));
  });

  test("archive: hidden from the board, never deleted; finished and idle for two days leave by themselves", async () => {
    const cwd = path.join(tmp, "loja");
    const old = digest("velha", cwd, { lastActivity: 0 });
    const fresh = digest("nova", cwd, { lastActivity: 10 * HOUR });
    const open = digest("aberta", cwd, { lastActivity: 0, openItems: [{ text: "x" }] });
    assert.deepEqual(autoArchivable([old, fresh, open], { now: 55 * HOUR }), [old.path], "only finished sessions idle for 48h");
    const archive = createArchive(path.join(tmp, "arquivo.json"));
    const map = await archive.add([old.path], "vorcaro");
    assert.ok(isArchived(map, old.path));
    const board = buildBoard([old, fresh], { archived: map, now: 60 * HOUR });
    assert.equal(board.archivedCount, 1);
    assert.deepEqual(board.columns.flatMap((column) => column.cards).map((card) => card.title), ["nova"]);
    assert.ok(!isArchived(await archive.remove([old.path]), old.path), "archiving is undone");
    assert.equal((await createArchive(path.join(tmp, "nenhum.json")).read()).size, 0);
  });

  test("changes since the last visit: moved and new sessions, nothing before the first visit", () => {
    const cwd = path.join(tmp, "loja");
    const waiting = digest("espera", cwd, { lastOutput: "Posso seguir?", lastActivity: 20 });
    const done = digest("pronta", cwd, { lastActivity: 20 });
    const seen = seenSnapshot([{ ...waiting, lastOutput: "Pronto.", openItems: [{ text: "x" }] }], { now: 10 });
    const created = digest("nova", cwd, { lastActivity: 30 });
    assert.deepEqual(boardChanges([waiting, done, created], null), []);
    const changes = boardChanges([waiting, created], seen);
    assert.deepEqual(changes.map((change) => [change.title, change.from, change.to]), [["espera", "a-fazer", "aguardando"], ["nova", null, "feito"]]);
    assert.equal(changeLabel(changes[0]), "espera você");
    assert.equal(changeLabel(changes[1]), "nova: terminou");
  });

  test("a brief for Orca drops the conversation; the default goes to the project's main session", () => {
    const project = path.join(tmp, "loja");
    assert.equal(validateAction({ acao: "enviar", projeto: project, objetivo: "x", onde: "orca", sessao: path.join(tmp, "s.jsonl") }).sessao, "");
    assert.equal(validateAction({ acao: "enviar", projeto: project, objetivo: "x", onde: "orca" }).onde, "orca");
    assert.equal(validateAction({ acao: "enviar", projeto: project, objetivo: "x", onde: "marte" }).onde, "sessao");
  });
});

describe("session pop-out", () => {
  test("readSessionDetail: asks and answers in order, steps counted, the whole checklist, secrets hidden", async () => {
    const file = path.join(tmp, "pi.jsonl");
    const line = (value) => JSON.stringify(value);
    const msg = (role, extra) => line({ type: "message", timestamp: new Date(1000).toISOString(), message: { role, ...extra } });
    await writeFile(file, [
      line({ type: "session", id: "s", cwd: tmp, timestamp: new Date().toISOString() }),
      msg("user", { content: [{ type: "text", text: "Faz o Pix com a chave sk-ant-api03-abcdefghijklmnop1234" }] }),
      msg("assistant", { content: [{ type: "toolCall", name: "read" }, { type: "toolCall", name: "edit" }] }),
      msg("toolResult", { toolName: "todo", details: { tasks: [{ subject: "QR", status: "completed" }, { subject: "Testes", status: "in_progress" }] } }),
      msg("assistant", { content: [{ type: "text", text: "QR pronto." }] }),
    ].join("\n") + "\n");
    const detail = await readSessionDetail(file, "pi");
    assert.deepEqual(detail.timeline.map((item) => [item.role, item.text]), [["user", "Faz o Pix com a chave [segredo oculto]"], ["steps", "2 passos de ferramenta"], ["assistant", "QR pronto."]]);
    assert.deepEqual(detail.checklist, [{ text: "QR", status: "completed" }, { text: "Testes", status: "in_progress" }]);
    const html = popHtml({ digest: { ...digest("Pix", tmp), column: "fazendo" }, ...detail, demands: [] }, (value) => String(value));
    assert.match(html, /Checklist <b>1\/2<\/b>/);
    assert.match(html, /data-pop-open/, "a PI session can be opened");
    assert.doesNotMatch(popHtml({ digest: { ...digest("C", tmp), source: "claude", column: "feito" }, timeline: [], checklist: [], demands: [] }), /data-pop-open/, "a Claude Code session cannot");
  });
});

describe("model accounts and sidebar", async () => {
  const { connectHint, modelMenuGroups, providerLabel } = await import("../public/lib.js");
  const { claudeSidebar, hiddenFolders, insideIgnored } = await import("../lib-server/vorcaro.mjs");

  test("a config saved with a BOM (Notepad, PowerShell 5.1) still reads", async () => {
    const file = path.join(tmp, "bom.json");
    await writeFile(file, "\uFEFF" + JSON.stringify({ orca: { auto: false }, github: { owner: "NatiamG", project: 2 } }));
    assert.deepEqual(await readMirrorConfig(file), { orcaAuto: false, claudeCode: true, github: { owner: "NatiamG", project: 2, conta: null } });
  });

  test("models by account: connected selectable, a disconnected login locked, accounts without models listed locked", () => {
    const models = [{ provider: "openai-codex", id: "gpt" }, { provider: "anthropic", id: "opus" }, { provider: "groq", id: "llama" }];
    const accounts = [{ provider: "openai-codex", status: "ready" }, { provider: "anthropic", status: "not_ready", authType: "oauth" }, { provider: "openai", status: "not_ready", reason: "credentials_not_configured" }];
    const { connected, missing } = modelMenuGroups(models, accounts);
    assert.deepEqual(connected.map((group) => [group.provider, group.locked]), [["openai-codex", false], ["groq", false], ["anthropic", true]], "an unknown check (groq) never locks");
    assert.deepEqual(missing, [{ provider: "openai", label: "OpenAI API", hint: "Falta a chave da API de OpenAI API" }]);
    assert.equal(connectHint({ provider: "anthropic" }), "Conecte com /login anthropic no PI");
    assert.equal(providerLabel("openai-codex"), "ChatGPT (OpenAI)");
  });

  test("the sidebar's Claude Code list: Claude sessions only, newest first, archived out; hidden folders by the ignore file", async () => {
    const cwd = path.join(tmp, "loja");
    const sessions = [digest("a", cwd, { source: "claude", lastActivity: 1 }), digest("b", cwd, { source: "claude", lastActivity: 5 }), digest("pi", cwd, { lastActivity: 9 })];
    const archive = await createArchive(path.join(tmp, "arq2.json")).add([sessions[0].path]);
    assert.deepEqual(claudeSidebar(sessions, { archived: archive }).map((item) => item.title), ["b"]);
    const ignoreFile = path.join(tmp, "ignorar.json");
    await writeFile(ignoreFile, JSON.stringify({ ignorarPastas: [path.join(tmp, "bench")] }));
    const hidden = await hiddenFolders(ignoreFile);
    assert.ok(insideIgnored(path.join(tmp, "bench", "run", "work"), hidden));
    assert.ok(!insideIgnored(cwd, hidden));
  });
});

describe("sources that can be switched off", async () => {
  const { createDigestIndex } = await import("../lib-server/vorcaro.mjs");
  const { mkdir } = await import("node:fs/promises");
  test("a disabled source is not read, and its sessions leave the index on the next refresh", async () => {
    const root = path.join(tmp, "fonte");
    await mkdir(path.join(root, "proj"), { recursive: true });
    await writeFile(path.join(root, "proj", "s.jsonl"), "{}");
    let on = true;
    let scans = 0;
    const index = createDigestIndex({ sources: [{ root, enabled: async () => on, scan: async (file) => { scans++; return { path: file, cwd: tmp, title: "s", lastActivity: Date.now(), openItems: [], doneItems: 0 }; } }] });
    assert.equal((await index.refresh()).length, 1);
    on = false;
    assert.equal((await index.refresh()).length, 0);
    assert.equal(scans, 1, "nothing is scanned while it is off");
  });
});
