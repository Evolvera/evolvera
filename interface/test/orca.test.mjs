// Orca worktrees + multi-project status: pure logic (lib.js), the orca adapter and the new routes
// (/api/orca, /api/projects/status, /api/projects/open-path). Fake PI + fake orca only; owned temp dirs only.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import * as lib from "../public/lib.js";

describe("Orca worktrees (lib)", () => {
  const raw = (worktrees, extra = {}) => ({ id: "x", ok: true, result: { worktrees, ...extra } });
  const wt = (over = {}) => ({ worktreeId: "r::/a", repo: "Repo", path: "C:/a/b", branch: "refs/heads/feat/x", displayName: "Nome", isActive: false, status: "inactive", unread: false, linkedIssue: null, linkedPR: null, comment: "", lastActivityAt: 5, agents: [], ...over });
  const norm = (over) => lib.normalizeOrca(raw([wt(over)])).worktrees[0];

  test("tabs: Worktrees is visible only with the Orca integration on", () => {
    assert.deepEqual(lib.visibleInspectorTabs(lib.DEFAULT_SETTINGS), ["terminal", "subagents", "context", "files", "browser"]);
    assert.deepEqual(lib.visibleInspectorTabs({ orcaEnabled: true }), lib.INSPECTOR_TABS);
    assert.equal(lib.resolveInspectorTab("worktrees", lib.DEFAULT_SETTINGS), "terminal");
    assert.equal(lib.resolveInspectorTab("worktrees", { orcaEnabled: true }), "worktrees");
    assert.equal(lib.resolveInspectorTab("files", lib.DEFAULT_SETTINGS), "files");
    assert.equal(lib.resolveInspectorTab("nope", { orcaEnabled: true }), "terminal");
    assert.equal(lib.resolveInspectorTab(null, lib.DEFAULT_SETTINGS), "terminal");
  });

  test("orcaBranch strips refs/heads/ and tolerates detached worktrees", () => {
    assert.equal(lib.orcaBranch("refs/heads/a/b"), "a/b");
    assert.equal(lib.orcaBranch("main"), "main");
    assert.equal(lib.orcaBranch(""), "");
    assert.equal(lib.orcaBranch(null), "");
  });

  test("normalizeOrca rejects unexpected shapes", () => {
    for (const bad of [null, undefined, "x", {}, { ok: false, result: { worktrees: [] } }, { ok: true }, { ok: true, result: { worktrees: "no" } }]) {
      assert.deepEqual(lib.normalizeOrca(bad), { ok: false }, JSON.stringify(bad));
    }
  });

  test("normalizeOrca summarizes worktrees, finds the active one and drops unusable entries", () => {
    const result = lib.normalizeOrca(raw([
      wt({ isActive: true, status: "working", unread: true, linkedIssue: 321, linkedPR: { number: 9, state: "draft" }, comment: "  nota\ncom quebra ", agents: [{ state: "working", agentType: "pi", taskTitle: "Tarefa", lastAssistantMessage: "feito\n  ok" }] }),
      wt({ worktreeId: "r::/c", path: "C:/c", displayName: "", branch: "", isActive: true }),
      null, "x", { path: "" }, { path: 5 },
    ]));
    assert.equal(result.ok, true);
    assert.deepEqual(result.active, { path: "C:/a/b" });
    assert.equal(result.worktrees.length, 2);
    assert.deepEqual(result.worktrees[0], {
      id: "r::/a", name: "Nome", repo: "Repo", path: "C:/a/b", branch: "feat/x", status: "working", active: true, unread: true,
      linkedIssue: { number: 321, state: "" }, linkedPR: { number: 9, state: "draft" }, comment: "nota com quebra", terminals: 0, lastActivityAt: 5,
      agents: [{ state: "working", type: "pi", title: "Tarefa", lastMessage: "feito ok", interrupted: false }],
    });
    assert.equal(result.worktrees[1].name, "c");
    assert.equal(result.worktrees[1].branch, "");
    assert.deepEqual(lib.normalizeOrca(raw([wt()])).active, null);
  });

  test("normalizeOrca copes with odd field types and bounds the lists", () => {
    const odd = norm({ displayName: null, isActive: "yes", unread: 1, status: undefined, lastActivityAt: "x", linkedIssue: { number: "7" }, linkedPR: "pr", agents: "none" });
    assert.deepEqual([odd.name, odd.active, odd.unread, odd.status, odd.lastActivityAt, odd.linkedIssue, odd.linkedPR, odd.agents], ["b", false, false, "", 0, null, null, []]);
    const agents = norm({ agents: [null, 5, { displayName: "Nome do agente", prompt: "x" }, { prompt: "primeira linha\nsegunda" }, {}, ...Array.from({ length: 30 }, () => ({ state: "done" }))] }).agents;
    assert.equal(agents.length, 20);
    assert.deepEqual(agents.slice(0, 3), [
      { state: "", type: "", title: "Nome do agente", lastMessage: "", interrupted: false },
      { state: "", type: "", title: "primeira linha", lastMessage: "", interrupted: false },
      { state: "", type: "", title: "", lastMessage: "", interrupted: false },
    ]);
    assert.equal(norm({ agents: [{ lastAssistantMessage: "m".repeat(500), taskTitle: "t".repeat(500) }] }).agents[0].lastMessage.length, 200);
    assert.equal(lib.normalizeOrca(raw(Array.from({ length: 250 }, (_, i) => wt({ path: `C:/w${i}` })))).worktrees.length, 200);
  });

  test("agentsSummary: count, state and the most relevant one-line message", () => {
    assert.deepEqual(lib.agentsSummary([]), { line: "", message: "" });
    const agent = (state, lastMessage = "", title = "") => ({ state, lastMessage, title, type: "pi" });
    assert.deepEqual(lib.agentsSummary([agent("working", "", "Escrevendo testes")]), { line: "1 agente · trabalhando", message: "Escrevendo testes" });
    assert.deepEqual(lib.agentsSummary([agent("working"), agent("done", "pronto")]), { line: "2 agentes · 1 trabalhando", message: "pronto" });
    assert.deepEqual(lib.agentsSummary([agent("done", "a"), agent("done", "b")]), { line: "2 agentes · concluído", message: "b" });
    assert.deepEqual(lib.agentsSummary([agent("blocked"), agent("done")]), { line: "2 agentes · em espera", message: "" });
  });

  test("worktreeRow: labels, refs, status and flags", () => {
    const row = lib.worktreeRow(norm({ status: "working", unread: true, isActive: true, linkedIssue: 321, linkedPR: { number: 339, state: "draft" }, agents: [{ state: "working", taskTitle: "X" }] }));
    assert.deepEqual(row, { name: "Nome", sub: "feat/x", statusLabel: "trabalhando", running: true, agents: "1 agente · trabalhando", message: "X", meta: ["Repo", "#321", "PR #339 · draft"], unread: true, active: true });
    const bare = lib.worktreeRow(norm({ branch: "", repo: "", status: "", linkedPR: 7 }));
    assert.deepEqual(bare, { name: "Nome", sub: "b", statusLabel: "—", running: false, agents: "", message: "", meta: ["PR #7"], unread: false, active: false });
    assert.equal(lib.worktreeRow(norm({ status: "inactive" })).statusLabel, "inativa");
    assert.equal(lib.worktreeRow(norm({ status: "weird" })).statusLabel, "weird");
  });

  test("sortWorktrees: active first, then working, then newest activity; the input is not mutated", () => {
    const list = [
      { name: "old", status: "inactive", active: false, lastActivityAt: 1 },
      { name: "new", status: "inactive", active: false, lastActivityAt: 9 },
      { name: "busy", status: "working", active: false, lastActivityAt: 2 },
      { name: "focus", status: "inactive", active: true, lastActivityAt: 0 },
    ];
    assert.deepEqual(lib.sortWorktrees(list).map((item) => item.name), ["focus", "busy", "new", "old"]);
    assert.deepEqual(list.map((item) => item.name), ["old", "new", "busy", "focus"]);
  });

  test("followDecision: switch, defer while typing or in a dialog, never undo a manual choice", () => {
    const base = { enabled: true, activePath: "C:/wt/a", lastFollowed: null, currentPath: "C:\\wt\\b", composerText: false, dialogOpen: false };
    assert.equal(lib.followDecision(base), "switch");
    assert.equal(lib.followDecision({ ...base, enabled: false }), "none");
    assert.equal(lib.followDecision({ ...base, activePath: null }), "none");
    assert.equal(lib.followDecision({ ...base, composerText: true }), "wait");
    assert.equal(lib.followDecision({ ...base, dialogOpen: true }), "wait");
    assert.equal(lib.followDecision({ ...base, lastFollowed: "c:\\WT\\a" }), "none");
    assert.equal(lib.followDecision({ ...base, currentPath: "c:/WT/a/" }), "mark");
    assert.equal(lib.followDecision({ ...base, currentPath: "C:/wt/a", composerText: true }), "mark");
  });

  test("orcaPollWanted: only when enabled, visible, and following or looking at the tab", () => {
    assert.equal(lib.orcaPollWanted({ enabled: true, follow: true, tabVisible: false, hidden: false }), true);
    assert.equal(lib.orcaPollWanted({ enabled: true, follow: false, tabVisible: true, hidden: false }), true);
    assert.equal(lib.orcaPollWanted({ enabled: true, follow: false, tabVisible: false, hidden: false }), false);
    assert.equal(lib.orcaPollWanted({ enabled: true, follow: true, tabVisible: true, hidden: true }), false);
    assert.equal(lib.orcaPollWanted({ enabled: false, follow: true, tabVisible: true, hidden: false }), false);
  });

  test("statusAttention: waiting follows the PI dialog; finishing a run in a closed project marks it unseen", () => {
    const status = (over = {}) => ({ streaming: false, waitingUi: false, exited: false, ...over });
    assert.equal(lib.statusAttention(status(), undefined, false), null);
    assert.equal(lib.statusAttention(status({ streaming: true }), status(), true), null);
    assert.deepEqual(lib.statusAttention(undefined, status({ streaming: true }), false), { waiting: false });
    assert.deepEqual(lib.statusAttention(status({ streaming: true }), status(), false), { waiting: false, unseen: true });
    assert.deepEqual(lib.statusAttention(status({ streaming: true }), status({ streaming: true }), false), { waiting: false });
    assert.deepEqual(lib.statusAttention(status({ streaming: true }), status({ waitingUi: true, streaming: true }), false), { waiting: true });
    assert.deepEqual(lib.statusAttention(status({ streaming: true }), status({ waitingUi: true }), false), { waiting: true });
    assert.deepEqual(lib.statusAttention(status({ streaming: true }), status({ exited: true }), false), { waiting: false });
  });
});

// ------------------------------------------------------------------ server

const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = await mkdtemp(path.join(os.tmpdir(), "pi-studio-orca-"));
const agentDir = path.join(tmp, "agent");
const rootsDir = path.join(tmp, "roots");
const wtListed = path.join(tmp, "worktrees", "feature-a");
const wtSecond = path.join(tmp, "worktrees", "feature-b");
const wtGhost = path.join(tmp, "worktrees", "removed");
const outside = path.join(tmp, "outside-unlisted");
const underRoot = path.join(rootsDir, "plain-dir");
for (const dir of [agentDir, rootsDir, wtListed, wtSecond, outside, underRoot, `${rootsDir}-evil`]) await mkdir(dir, { recursive: true });
const stateFile = path.join(tmp, "orca-state.json");
const countFile = path.join(tmp, "orca-count.txt");
const fakeOrca = path.join(here, "fake-orca.mjs");
const fwd = (value) => value.replace(/\\/g, "/");
const setOrca = (state) => writeFile(stateFile, JSON.stringify(state));
const orcaCalls = async () => (await readFile(countFile, "utf8").catch(() => "")).split("\n").filter(Boolean).length;
const WORKTREES = [
  { path: fwd(wtListed), displayName: "Feature A", branch: "refs/heads/feat/a", status: "working", unread: true, linkedIssue: 12, liveTerminalCount: 2, agents: [{ state: "working", agentType: "pi", taskTitle: "Escrever testes", lastAssistantMessage: "quase lá" }] },
  { path: fwd(wtSecond), displayName: "Feature B", linkedPR: { number: 5, state: "open" } },
  { path: fwd(wtGhost), displayName: "Removida" },
];
await setOrca({ mode: "normal", active: fwd(wtListed), worktrees: WORKTREES });

Object.assign(process.env, {
  PI_AGENT_DIR: agentDir,
  PI_PROJECT_ROOTS: rootsDir,
  PI_WEB_PI_BIN: process.execPath,
  PI_WEB_PI_BIN_ARGS: JSON.stringify([path.join(here, "fake-pi-rpc.mjs")]),
  PI_STUDIO_ORCA_BIN: process.execPath,
  PI_STUDIO_ORCA_BIN_ARGS: JSON.stringify([fakeOrca]),
  PI_STUDIO_ORCA_TIMEOUT_MS: "1500",
  FAKE_ORCA_STATE: stateFile,
  FAKE_ORCA_COUNT_FILE: countFile,
});
delete process.env.PI_WEB_HOST;
delete process.env.PI_WEB_PATH_MAP;
const server = await import("../server.mjs");

after(() => rm(tmp, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }));

async function waitFor(predicate, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Timed out waiting for condition");
}

describe("orca adapter", () => {
  test("resolveOrcaCommand: env override (with args) wins; platform defaults otherwise", () => {
    assert.deepEqual(server.resolveOrcaCommand({ platform: "win32", env: { PI_STUDIO_ORCA_BIN: "x.exe", PI_STUDIO_ORCA_BIN_ARGS: '["a","b"]' } }), { bin: "x.exe", prefixArgs: ["a", "b"] });
    for (const args of [undefined, "", "{oops", '{"a":1}', "[1]"]) {
      assert.deepEqual(server.resolveOrcaCommand({ platform: "linux", env: { PI_STUDIO_ORCA_BIN: "x", PI_STUDIO_ORCA_BIN_ARGS: args } }).prefixArgs, [], String(args));
    }
    assert.deepEqual(server.resolveOrcaCommand({ platform: "darwin", env: {} }), { bin: "orca", prefixArgs: [] });
    const exe = path.win32.join("C:\\Users\\u\\AppData\\Local", "Programs", "orca", "resources", "bin", "orca.exe");
    assert.deepEqual(server.resolveOrcaCommand({ platform: "win32", env: { LOCALAPPDATA: "C:\\Users\\u\\AppData\\Local" }, exists: (file) => file === exe }), { bin: exe, prefixArgs: [] });
    assert.equal(server.resolveOrcaCommand({ platform: "win32", env: { LOCALAPPDATA: "C:\\Users\\u\\AppData\\Local" }, exists: () => false }), null);
    assert.equal(server.resolveOrcaCommand({ platform: "win32", env: {}, exists: () => true }), null);
    // Default arguments read the process environment (the fake orca of this suite).
    assert.equal(server.resolveOrcaCommand().bin, process.execPath);
  });

  test("fetchOrca: normalized worktrees, and every failure becomes available:false", async () => {
    const command = server.resolveOrcaCommand();
    const ok = await server.fetchOrca();
    assert.equal(ok.available, true);
    assert.deepEqual(ok.active, { path: fwd(wtListed) });
    assert.deepEqual(ok.worktrees.map((item) => item.name), ["Feature A", "Feature B", "Removida"]);
    assert.equal(ok.worktrees[0].branch, "feat/a");
    assert.deepEqual(await server.fetchOrca(null), { available: false, reason: "not-found" });
    assert.deepEqual(await server.fetchOrca({ bin: path.join(tmp, "no-such-orca"), prefixArgs: [] }), { available: false, reason: "not-found" });
    assert.deepEqual(await server.fetchOrca({ bin: process.execPath, prefixArgs: [fakeOrca, "bogus"] }), { available: false, reason: "failed" });
    for (const [mode, reason] of [["malformed", "invalid"], ["shape", "invalid"], ["exit", "failed"]]) {
      await setOrca({ mode, worktrees: [] });
      assert.deepEqual(await server.fetchOrca(command), { available: false, reason }, mode);
    }
    await setOrca({ mode: "hang", worktrees: [] });
    const started = Date.now();
    assert.deepEqual(await server.fetchOrca(command, 300), { available: false, reason: "timeout" });
    assert.ok(Date.now() - started < 3000);
    await setOrca({ mode: "normal", active: fwd(wtListed), worktrees: WORKTREES });
  });

  test("getOrca caches for 2 s and shares one child between concurrent callers", async () => {
    let clock = 1000;
    let calls = 0;
    const fetch = async () => ({ available: true, n: ++calls });
    const now = () => clock;
    server.clearOrcaCache();
    const [a, b, c] = await Promise.all([server.getOrca({ now, fetch }), server.getOrca({ now, fetch }), server.getOrca({ now, fetch })]);
    assert.deepEqual([a.n, b.n, c.n, calls], [1, 1, 1, 1]);
    clock = 2999;
    assert.equal((await server.getOrca({ now, fetch })).n, 1);
    clock = 3000;
    assert.equal((await server.getOrca({ now, fetch })).n, 2);
    server.clearOrcaCache();
    assert.equal((await server.getOrca({ now, fetch })).n, 3);
    // A failed result is cached too, so a missing orca is not re-spawned on every poll.
    server.clearOrcaCache();
    let failures = 0;
    const failing = async () => { failures++; return { available: false, reason: "failed" }; };
    await server.getOrca({ now, fetch: failing });
    await server.getOrca({ now, fetch: failing });
    assert.equal(failures, 1);
    server.clearOrcaCache();
  });

  test("pathInside is a real prefix check on whole segments", () => {
    assert.equal(server.pathInside(rootsDir, rootsDir), true);
    assert.equal(server.pathInside(rootsDir, path.join(rootsDir, "a", "b")), true);
    assert.equal(server.pathInside(rootsDir, `${rootsDir}-evil`), false);
    assert.equal(server.pathInside(rootsDir, path.dirname(rootsDir)), false);
    assert.equal(server.pathInside(path.parse(rootsDir).root, rootsDir), true);
    assert.equal(server.pathInside(rootsDir, rootsDir.toUpperCase()), process.platform === "win32");
  });
});

describe("session activity tracking", () => {
  const make = () => new server.PiRpcSession({ projectId: "p", projectName: "p", cwd: tmp });

  test("streaming follows agent_start/agent_end; a dialog is pending until answered", () => {
    const session = make();
    assert.deepEqual(session.statusSummary(), { projectId: "p", sessionId: session.id, streaming: false, waitingUi: false, exited: false, lastEventAt: session.lastEventAt });
    session.track({ type: "agent_start" }, 100);
    assert.equal(session.statusSummary(100).streaming, true);
    assert.equal(session.statusSummary(100).lastEventAt, 100);
    session.track({ type: "extension_ui_request", id: "d1", method: "select" }, 110);
    session.track({ type: "extension_ui_request", id: "n1", method: "notify" }, 111);
    session.track({ type: "extension_ui_request", method: "select" }, 112);
    session.track({ type: "message_start" }, 113);
    assert.equal(session.statusSummary(200).waitingUi, true);
    session.proc = { stdin: { writable: true, write() {} } };
    session.send({ type: "extension_ui_response", id: "d1", value: "x" });
    assert.equal(session.statusSummary(200).waitingUi, false);
    session.track({ type: "agent_end" }, 300);
    assert.equal(session.statusSummary(300).streaming, false);
  });

  test("answered UI IDs and expired pending UI requests stay bounded", () => {
    const session = make();
    session.proc = { stdin: { writable: true, write() {} } };
    for (let index = 0; index < 1200; index++) {
      session.send({ type: "extension_ui_response", id: `answered-${index}` });
      session.track({ type: "extension_ui_request", id: `expired-${index}`, method: "select", timeout: 1 }, 1000);
    }
    assert.ok(session.pendingUi.size <= 1000);
    session.pendingUi.clear();
    for (let index = 0; index < 1001; index++) session.pendingUi.set(`cap-${index}`, Infinity);
    session.pruneUi(0);
    assert.equal(session.pendingUi.size, 1000);
    session.pendingUi.clear();
    session.statusSummary(1002);
    assert.ok(session.answeredUi.size <= 1000);
    assert.equal(session.pendingUi.size, 0);
  });

  test("a dialog with a timeout stops counting as waiting once it passes; an exited session is idle", () => {
    const session = make();
    session.track({ type: "extension_ui_request", id: "t1", method: "confirm", timeout: 1000 }, 1000);
    session.track({ type: "extension_ui_request", id: "t2", method: "input", timeout: 0 }, 1000);
    assert.equal(session.statusSummary(1999).waitingUi, true);
    session.pendingUi.delete("t2");
    assert.equal(session.statusSummary(1999).waitingUi, true);
    assert.equal(session.statusSummary(2000).waitingUi, false);
    session.track({ type: "agent_start" }, 2000);
    session.exited = true;
    session.track({ type: "extension_ui_request", id: "t3", method: "editor" }, 2001);
    assert.deepEqual([session.statusSummary(2001).streaming, session.statusSummary(2001).waitingUi, session.statusSummary(2001).exited], [false, false, true]);
  });
});

describe("orca + status + open-path routes", () => {
  let listening;
  let base;
  let token;
  const headers = (extra = {}) => ({ "x-pi-studio-token": token, ...extra });
  const getJson = async (pathname) => {
    const res = await fetch(`${base}${pathname}`, { headers: headers() });
    assert.equal(res.status, 200, pathname);
    return res.json();
  };
  const post = async (pathname, body, extra = {}) => {
    const res = await fetch(`${base}${pathname}`, { method: "POST", headers: headers({ "content-type": "application/json" }), body: typeof body === "string" ? body : JSON.stringify(body), ...extra });
    return { status: res.status, data: await res.json() };
  };
  const openPath = (cwd) => post("/api/projects/open-path", { cwd });
  const statuses = async () => (await getJson("/api/projects/status")).statuses;
  const rawGet = (pathname, hostHeader) => new Promise((resolve, reject) => {
    const url = new URL(`${base}${pathname}`);
    http.get({ host: url.hostname, port: url.port, path: pathname, headers: { host: hostHeader, "x-pi-studio-token": token } }, (res) => {
      res.resume();
      resolve(res.statusCode);
    }).on("error", reject);
  });

  before(async () => {
    listening = await server.startServer(0);
    base = `http://127.0.0.1:${listening.address().port}`;
    const page = await fetch(`${base}/`);
    token = (await page.text()).match(/name="pi-studio-token" content="([a-f0-9]+)"/)[1];
  });

  after(async () => {
    await server.stopServer();
  });

  test("all three routes need the token, an allowed Origin and Host, and the right method", async () => {
    for (const [method, pathname] of [["GET", "/api/orca"], ["GET", "/api/projects/status"], ["POST", "/api/projects/open-path"]]) {
      const url = `${base}${pathname}`;
      const body = method === "POST" ? { body: "{}" } : {};
      assert.equal((await fetch(url, { method, ...body })).status, 401, `${pathname} without token`);
      assert.equal((await fetch(url, { method, headers: headers({ "x-pi-studio-token": "nope" }), ...body })).status, 401, `${pathname} with a wrong token`);
      assert.equal((await fetch(url, { method, headers: headers({ origin: "https://evil.example" }), ...body })).status, 403, `${pathname} evil origin`);
      assert.equal(await rawGet(pathname, "evil.example"), 403, `${pathname} evil host`);
      const other = method === "GET" ? "POST" : "GET";
      assert.equal((await fetch(url, { method: other, headers: headers(), ...(other === "POST" ? { body: "{}" } : {}) })).status, 405, `${pathname} ${other}`);
    }
  });

  test("GET /api/orca: summary with the Studio project id once known; the active worktree is reported", async () => {
    server.clearOrcaCache();
    const data = await getJson("/api/orca");
    assert.equal(data.available, true);
    assert.deepEqual(data.active, { path: fwd(wtListed) });
    assert.deepEqual(data.worktrees.map((item) => [item.name, item.projectId]), [["Feature A", null], ["Feature B", null], ["Removida", null]]);
    const first = data.worktrees[0];
    assert.deepEqual({ ...first, projectId: undefined }, {
      id: `fake-repo::${fwd(wtListed)}`, name: "Feature A", repo: "fake-repo", path: fwd(wtListed), branch: "feat/a", status: "working", active: true, unread: true,
      linkedIssue: { number: 12, state: "" }, linkedPR: null, comment: "", terminals: 2, lastActivityAt: 1_700_000_000_000, projectId: undefined,
      agents: [{ state: "working", type: "pi", title: "Escrever testes", lastMessage: "quase lá", interrupted: false }],
    });
  });

  test("/api/orca runs one child for a burst of requests and none while cached", async () => {
    server.clearOrcaCache();
    const before = await orcaCalls();
    const burst = await Promise.all(Array.from({ length: 20 }, () => fetch(`${base}/api/orca`, { headers: headers() }).then((res) => res.json())));
    assert.ok(burst.every((item) => item.available === true));
    assert.equal(await orcaCalls(), before + 1);
    await getJson("/api/orca");
    assert.equal(await orcaCalls(), before + 1);
  });

  test("/api/orca follows Orca: a changed active worktree shows after the cache expires", async () => {
    server.clearOrcaCache();
    await setOrca({ mode: "normal", active: fwd(wtSecond), worktrees: WORKTREES });
    const data = await getJson("/api/orca");
    assert.deepEqual(data.active, { path: fwd(wtSecond) });
    assert.deepEqual(data.worktrees.map((item) => item.active), [false, true, false]);
    await setOrca({ mode: "normal", active: null, worktrees: WORKTREES });
    server.clearOrcaCache();
    assert.equal((await getJson("/api/orca")).active, null);
  });

  test("/api/orca never fails with 5xx: missing, malformed, failing and hanging orca give available:false", async () => {
    for (const [mode, reason] of [["malformed", "invalid"], ["shape", "invalid"], ["exit", "failed"], ["hang", "timeout"]]) {
      server.clearOrcaCache();
      await setOrca({ mode, worktrees: [] });
      assert.deepEqual(await getJson("/api/orca"), { available: false, reason, active: null, worktrees: [] }, mode);
    }
    const saved = process.env.PI_STUDIO_ORCA_BIN;
    process.env.PI_STUDIO_ORCA_BIN = path.join(tmp, "no-such-orca");
    try {
      server.clearOrcaCache();
      assert.deepEqual(await getJson("/api/orca"), { available: false, reason: "not-found", active: null, worktrees: [] });
    } finally {
      process.env.PI_STUDIO_ORCA_BIN = saved;
      server.clearOrcaCache();
      await setOrca({ mode: "normal", active: fwd(wtListed), worktrees: WORKTREES });
    }
  });

  test("open-path opens an Orca-listed worktree (slash style and case do not matter) and keeps it in the project list", async () => {
    const opened = await openPath(wtListed);
    assert.equal(opened.status, 201);
    assert.equal(opened.data.project.cwd, path.resolve(wtListed));
    assert.equal(opened.data.project.name, "feature-a");
    assert.equal(opened.data.session.cwd, path.resolve(wtListed));
    assert.ok(Array.isArray(opened.data.history) && Array.isArray(opened.data.agents));
    // Idempotent: same project, same live PI.
    const again = await openPath(fwd(wtListed));
    assert.equal(again.status, 201);
    assert.equal(again.data.project.id, opened.data.project.id);
    assert.equal(again.data.session.id, opened.data.session.id);
    const { projects } = await getJson("/api/projects");
    const listed = projects.find((item) => item.id === opened.data.project.id);
    assert.ok(listed, "the opened worktree survives project rediscovery");
    assert.ok(listed.lastUsedAt);
    assert.equal(listed.activeSessionId, opened.data.session.id);
    server.clearOrcaCache();
    const orca = await getJson("/api/orca");
    assert.equal(orca.worktrees[0].projectId, opened.data.project.id);
    assert.equal(orca.worktrees[1].projectId, null);
    if (process.platform === "win32") assert.equal((await openPath(fwd(wtListed).toUpperCase())).data.project.id, opened.data.project.id);
  });

  test("open-path accepts a directory under a project root even without Orca", async () => {
    await setOrca({ mode: "exit", worktrees: [] });
    server.clearOrcaCache();
    const opened = await openPath(underRoot);
    assert.equal(opened.status, 201);
    assert.equal(opened.data.project.cwd, path.resolve(underRoot));
    assert.equal((await openPath(rootsDir)).status, 201);
    const listedOnlyByOrca = await openPath(wtSecond);
    assert.equal(listedOnlyByOrca.status, 403, "Orca unavailable: a worktree outside the roots is not trusted");
    await setOrca({ mode: "normal", active: fwd(wtListed), worktrees: WORKTREES });
    server.clearOrcaCache();
  });

  test("open-path rejects unknown, nonexistent, traversal, relative and malformed input", async () => {
    const cases = [
      [outside, 403, "exists but is neither listed nor under a root"],
      [`${rootsDir}-evil`, 403, "sibling that only shares the root's prefix"],
      [path.dirname(rootsDir), 403, "parent of a root"],
      [path.join(rootsDir, "does-not-exist"), 404, "nonexistent under a root"],
      [wtGhost, 404, "listed by Orca but removed from disk"],
      [`${rootsDir}${path.sep}plain-dir${path.sep}..${path.sep}..${path.sep}outside-unlisted`, 400, "traversal"],
      [`${fwd(wtListed)}/../../outside-unlisted`, 400, "traversal with slashes"],
      [`${rootsDir}${path.sep}..`, 400, "trailing .."],
      ["relative/dir", 400, "relative"],
      ["", 400, "empty"],
      [undefined, 400, "missing"],
      [5, 400, "not a string"],
    ];
    for (const [cwd, status, label] of cases) assert.equal((await openPath(cwd)).status, status, label);
    assert.equal((await post("/api/projects/open-path", "null")).status, 400);
    assert.equal((await post("/api/projects/open-path", "{}")).status, 400);
    assert.equal((await post("/api/projects/open-path", "{oops")).status, 400);
  });

  test("/api/projects/status reflects streaming, a pending dialog, and exit for every project with a PI", async () => {
    const one = (await openPath(wtListed)).data;
    const two = (await openPath(wtSecond)).data;
    const find = async (id) => (await statuses()).find((item) => item.projectId === id);
    assert.deepEqual(Object.keys(await find(one.project.id)).sort(), ["exited", "lastEventAt", "projectId", "sessionId", "streaming", "waitingUi"]);
    assert.deepEqual([(await find(one.project.id)).streaming, (await find(one.project.id)).waitingUi, (await find(one.project.id)).exited], [false, false, false]);

    // Project one asks a question while project two stays idle: both are visible at once.
    await post(`/api/projects/${one.project.id}/command`, { id: "p1", type: "prompt", message: "ui" });
    await waitFor(async () => (await find(one.project.id)).waitingUi);
    assert.equal((await find(one.project.id)).streaming, true);
    assert.deepEqual([(await find(two.project.id)).streaming, (await find(two.project.id)).waitingUi], [false, false]);

    await post(`/api/projects/${one.project.id}/ui-response`, { id: "fake-ui-1", value: "Permitir" });
    await waitFor(async () => !(await find(one.project.id)).waitingUi && !(await find(one.project.id)).streaming);

    await post(`/api/projects/${two.project.id}/command`, { id: "p2", type: "prompt", message: "demo" });
    await waitFor(async () => (await find(two.project.id)).streaming);
    assert.equal((await find(one.project.id)).streaming, false);
    await waitFor(async () => !(await find(two.project.id)).streaming, 8000);

    // PI exits: reported as exited, idle; reopening starts a fresh session that replaces the exited one.
    const exitedSessionId = (await find(one.project.id)).sessionId;
    await post(`/api/projects/${one.project.id}/command`, { id: "x1", type: "test_exit", code: 0 });
    await waitFor(async () => (await find(one.project.id)).exited);
    const gone = await find(one.project.id);
    assert.deepEqual([gone.streaming, gone.waitingUi], [false, false]);
    const reopened = (await openPath(wtListed)).data;
    assert.notEqual(reopened.session.id, exitedSessionId);
    const now = await find(one.project.id);
    assert.deepEqual([now.exited, now.sessionId], [false, reopened.session.id]);
    assert.equal((await statuses()).filter((item) => item.projectId === one.project.id).length, 1);
  });
});
