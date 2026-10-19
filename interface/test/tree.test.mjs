// Tree tests use only synthetic session records and injectable providers so the tree contract is deterministic and isolated.
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createTreeService } from "../lib-server/tree.mjs";

// Builds a stable project/environment tree and preserves the same ETag until source data changes.
test("tree service composes project and worktree entries with conditional versions", async () => {
  let changed = 0;
  let activity = 800;
  const service = createTreeService({
    now: () => 1000 + changed,
    getProjects: async () => [{ id: "p", name: "proj", cwd: "C:/repo" }],
    getOrca: async () => ({ available: true, worktrees: [{ path: "C:/repo", repoId: "r", worktreeId: "r", displayName: "main", branch: "main", isMainWorktree: true, status: "working", agents: [] }, { path: "C:/repo/wt", repoId: "r", worktreeId: "w", displayName: "feature", branch: "feature", isMainWorktree: false, status: "inactive", agents: [] }] }),
    getSessions: async () => [{ path: "C:/s/a.jsonl", header: { id: "a", cwd: "C:/repo", timestamp: new Date(10).toISOString() }, stat: { mtimeMs: 900, size: 0 }, title: "A", state: "pronto", lastAssistantAt: activity }],
    getLive: async () => [],
  });
  const first = await service.get();
  assert.equal(first.projects[0].envs.length, 2);
  assert.equal(first.projects[0].envs[0].pis[0].title, "A");
  assert.equal((await service.get(first.version)).notModified, true);
  changed += 1001;
  activity++;
  assert.equal((await service.get(first.version)).notModified, false);
  service.close();
});

// Worktree membership follows the repository root or its descendants, never an unrelated ancestor checkout.
test("tree excludes ancestor worktrees and nests live subagents by parent session", async () => {
  const service = createTreeService({
    now: () => 2000,
    getProjects: async () => [{ id: "p", name: "proj", cwd: "C:/repo/project" }],
    getOrca: async () => ({ available: true, worktrees: [
      { path: "C:/repo", worktreeId: "ancestor", displayName: "not ours", isMainWorktree: true, agents: [] },
      { path: "C:/repo/project", worktreeId: "main", displayName: "Main", isMainWorktree: true, agents: [] },
      { path: "C:/repo/project/wt", worktreeId: "child", displayName: "Feature", agents: [{ agentType: "pi", path: "C:/repo/project/wt", state: "working" }] },
    ] }),
    getSessions: async () => [
      { path: "C:/sessions/parent.jsonl", header: { id: "parent", cwd: "C:/repo/project/wt", timestamp: 1000 }, stat: { mtimeMs: 1900 }, title: "Parent", state: "pronto" },
      { path: "C:/sessions/child.jsonl", header: { id: "child", cwd: "C:/repo/project/wt", timestamp: 1100, parentSession: "C:/sessions/parent.jsonl" }, stat: { mtimeMs: 1950 }, title: { title: "Humano", agentType: "scout" }, state: "erro" },
      { path: "C:/sessions/other.jsonl", header: { id: "other", cwd: "C:/elsewhere", timestamp: 1200 }, stat: { mtimeMs: 1990 }, title: "Other", state: "erro" },
    ],
    getLive: async () => [{ sessionPath: "c:/sessions/parent.jsonl", pid: 7, owner: "orca", startedAt: 1500, streaming: true }],
  });
  const tree = await service.get();
  const envs = tree.projects[0].envs;
  assert.deepEqual(envs.map((env) => env.key), ["main", "child"]);
  const childEnv = envs.find((env) => env.key === "child");
  assert.equal(childEnv.pis.length, 1);
  assert.equal(childEnv.pis[0].live.owner, "orca");
  assert.equal(childEnv.pis[0].raw.orcaState, "working");
  assert.equal(childEnv.pis[0].raw.busy, true);
  assert.equal(childEnv.pis[0].children[0].title, "Humano");
  assert.equal(childEnv.pis[0].children[0].agentType, "scout");
  assert.equal(childEnv.pis[0].children[0].raw.error, true);
  assert.equal(tree.projects[0].envs.some((env) => env.key === "ancestor"), false);
  service.close();
});

// Empty, unavailable, and over-limit inputs produce stable public records without leaking private linkage fields.
test("tree handles unavailable providers, local-only projects, and PI limits", async () => {
  const sessions = Array.from({ length: 17 }, (_, index) => ({
    path: `C:/s/${index}.jsonl`, header: { id: String(index), cwd: "C:/local", timestamp: "invalid" },
    stat: { mtimeMs: index, birthtimeMs: index + 1 }, state: "parado", name: `PI ${index}`,
  }));
  sessions.push({ path: "C:/s/no-cwd.jsonl", header: { id: "ignored" }, stat: {}, state: "erro" });
  const service = createTreeService({
    now: () => 50,
    getProjects: async () => [{ id: "local", cwd: "C:/local" }],
    getOrca: async () => ({ available: false, worktrees: [{ path: "C:/local/wt", agents: [] }] }),
    getSessions: async () => sessions,
    getLive: async () => [{ pid: 8, sessionPath: "C:/s/16.jsonl", owner: "terminal" }],
  });
  const tree = await service.get();
  const env = tree.projects[0].envs[0];
  assert.equal(env.name, "Local");
  assert.equal(env.orca, false);
  assert.equal(env.pis.length, 15);
  assert.equal(env.morePis, 2);
  assert.equal(env.pis[0].sessionPath, "C:/s/16.jsonl");
  assert.equal(env.pis[0].startedAt, 17);
  assert.equal("_env" in env.pis[0], false);
  service.close();
});

// Concurrent reads coalesce, stable inputs retain their generatedAt, and close rejects later reads.
test("tree coalesces concurrent refreshes and closes cleanly", async () => {
  let calls = 0;
  let release;
  const service = createTreeService({
    now: () => 5000,
    getProjects: async () => { calls++; await new Promise((resolve) => { release = resolve; }); return []; },
    getOrca: async () => ({ available: false }), getSessions: async () => [], getLive: async () => [],
  });
  const one = service.get();
  const two = service.get('"old"');
  await new Promise((resolve) => setImmediate(resolve));
  release();
  const [first, second] = await Promise.all([one, two]);
  assert.equal(calls, 1);
  assert.equal(first.generatedAt, second.generatedAt);
  assert.equal(second.notModified, false);
  service.close();
  await assert.rejects(service.get(), /closed/);
});

// The authenticated HTTP route returns the composed tree and its ETag, then answers unchanged polls with 304.
test("GET /api/tree is authenticated and serves conditional JSON", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "pi-studio-tree-route-"));
  const names = ["PI_AGENT_DIR", "PI_PROJECT_ROOTS", "PI_WEB_PI_BIN", "PI_WEB_PI_BIN_ARGS", "PI_STUDIO_ORCA_BIN", "PI_STUDIO_ORCA_BIN_ARGS", "PI_STUDIO_PS_BIN", "PI_STUDIO_PS_BIN_ARGS", "FAKE_ORCA_STATE", "FAKE_PS_ROWS", "FAKE_PI_SESSION_FILE"];
  const prior = Object.fromEntries(names.map((key) => [key, process.env[key]]));
  let app;
  try {
    const agentDir = path.join(tmp, "agent");
    const roots = path.join(tmp, "roots");
    const project = path.join(roots, "project");
    const sessionDir = path.join(agentDir, "sessions", "--tree--");
    await Promise.all([mkdir(project, { recursive: true }), mkdir(sessionDir, { recursive: true })]);
    await writeFile(path.join(project, "package.json"), "{}\n");
    const mainSession = path.join(sessionDir, "main.jsonl");
    await writeFile(mainSession, `${JSON.stringify({ type: "session", id: "main", timestamp: new Date().toISOString(), cwd: project })}\n${JSON.stringify({ type: "message", message: { role: "user", content: "Tarefa de teste" } })}\n${JSON.stringify({ type: "message", timestamp: new Date().toISOString(), message: { role: "assistant", timestamp: new Date().toISOString(), content: [{ type: "text", text: "Pronto" }] } })}\n`);
    const childSession = path.join(sessionDir, "child.jsonl");
    await writeFile(childSession, `${JSON.stringify({ type: "session", id: "child", timestamp: new Date().toISOString(), cwd: project, parentSession: mainSession })}\n${JSON.stringify({ type: "session_info", name: "scout#12345678" })}\n${JSON.stringify({ type: "message", message: { role: "user", content: "Ler tarefas" } })}\n`);
    await writeFile(path.join(sessionDir, "child-no-name.jsonl"), `${JSON.stringify({ type: "session", id: "child-no-name", timestamp: new Date().toISOString(), cwd: project, parentSession: mainSession })}\n${JSON.stringify({ type: "message", message: { role: "user", content: "Sem nome" } })}\n`);
    await writeFile(path.join(sessionDir, "child-malformed-name.jsonl"), `${JSON.stringify({ type: "session", id: "child-malformed-name", timestamp: new Date().toISOString(), cwd: project, parentSession: mainSession })}\n{broken\n${JSON.stringify({ type: "message", message: { role: "user", content: "Nome com linha quebrada" } })}\n`);
    await writeFile(path.join(sessionDir, "child-empty-name.jsonl"), `${JSON.stringify({ type: "session", id: "child-empty-name", timestamp: new Date().toISOString(), cwd: project, parentSession: mainSession })}\n${JSON.stringify({ type: "session_info" })}\n${JSON.stringify({ type: "message", message: { role: "user", content: "Nome omitido" } })}\n`);
    await writeFile(path.join(sessionDir, "malformed.jsonl"), "{broken\n");
    await writeFile(path.join(sessionDir, "not-session.jsonl"), `${JSON.stringify({ type: "message", cwd: project })}\n`);
    await writeFile(path.join(sessionDir, "no-cwd.jsonl"), `${JSON.stringify({ type: "session", id: "no-cwd" })}\n`);
    await mkdir(path.join(sessionDir, "not-a-file.jsonl"));
    await writeFile(path.join(agentDir, "sessions", "ignored.jsonl"), "ignored\n");
    const orcaState = path.join(tmp, "orca.json");
    const psRows = path.join(tmp, "ps.json");
    await writeFile(orcaState, JSON.stringify({ mode: "normal", worktrees: [{ path: project, repoId: "r", displayName: "Main", isMainWorktree: true }] }));
    await writeFile(psRows, "[]");
    Object.assign(process.env, {
      PI_AGENT_DIR: agentDir, PI_PROJECT_ROOTS: roots,
      PI_WEB_PI_BIN: process.execPath, PI_WEB_PI_BIN_ARGS: JSON.stringify([path.resolve("test/fake-pi-rpc.mjs")]),
      PI_STUDIO_ORCA_BIN: process.execPath, PI_STUDIO_ORCA_BIN_ARGS: JSON.stringify([path.resolve("test/fake-orca.mjs")]), FAKE_ORCA_STATE: orcaState,
      PI_STUDIO_PS_BIN: process.execPath, PI_STUDIO_PS_BIN_ARGS: JSON.stringify([path.resolve("test/fake-ps-pis.mjs")]), FAKE_PS_ROWS: psRows,
      FAKE_PI_SESSION_FILE: mainSession,
    });
    app = await import(`../server.mjs?tree-route-${process.pid}`);
    const server = await app.startServer(0, "127.0.0.1");
    const base = `http://127.0.0.1:${server.address().port}`;
    const page = await fetch(base);
    const token = (await page.text()).match(/name="pi-studio-token" content="([a-f0-9]+)"/)[1];
    assert.equal((await fetch(`${base}/api/tree`)).status, 401);
    const auth = { "x-pi-studio-token": token };
    const opened = await fetch(`${base}/api/projects/open-path`, { method: "POST", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify({ cwd: project }) });
    assert.equal(opened.status, 201);
    const projectId = (await opened.json()).project.id;
    await fetch(`${base}/api/projects/${projectId}/command`, { method: "POST", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify({ id: "tree-state", type: "get_state" }) });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const [first, concurrent] = await Promise.all([fetch(`${base}/api/tree`, { headers: auth }), fetch(`${base}/api/tree`, { headers: auth })]);
    const body = await first.json();
    await concurrent.arrayBuffer();
    assert.equal(first.status, 200);
    assert.equal(body.projects[0].envs[0].pis[0].title, "Tarefa de teste");
    assert.equal(body.projects[0].envs[0].pis[0].live.owner, "studio");
    assert.deepEqual(body.projects[0].envs[0].pis[0].children.map((child) => child.title).sort(), ["Ler tarefas", "Nome com linha quebrada", "Nome omitido", "Sem nome"]);
    assert.equal(first.headers.get("etag"), body.version);
    const unchanged = await fetch(`${base}/api/tree`, { headers: { "x-pi-studio-token": token, "if-none-match": body.version } });
    assert.equal(unchanged.status, 304);
    assert.equal(await unchanged.text(), "");
    await writeFile(mainSession, `${await import("node:fs/promises").then(({ readFile }) => readFile(mainSession, "utf8"))}${JSON.stringify({ type: "session_info", name: "Título atualizado" })}\n`);
    await fetch(`${base}/api/projects/${projectId}/stop`, { method: "POST", headers: auth });
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const stopped = await fetch(`${base}/api/tree`, { headers: auth });
    assert.equal(stopped.status, 200);
    const stoppedTree = (await stopped.json()).projects[0].envs[0].pis[0];
    assert.equal(stoppedTree.live, null);
    assert.equal(stoppedTree.title, "Título atualizado");
  } finally {
    if (app) await app.stopServer().catch(() => {});
    for (const [key, value] of Object.entries(prior)) value === undefined ? delete process.env[key] : process.env[key] = value;
    await rm(tmp, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
});

// Environment ordering prefers live worktrees and tolerates absent headers, worktree identifiers, and OrCa agent paths.
test("tree sorts active environments and resolves sparse source records", async () => {
  const sessions = [
    { path: "C:/s/active.jsonl", header: { cwd: "C:/multi/active" }, stat: { mtimeMs: 10 }, state: "pronto" },
    { path: "C:/s/idle.jsonl", header: { cwd: "C:/multi/idle" }, stat: { mtimeMs: 20 }, state: "parado" },
    { path: "C:/s/no-header.jsonl", stat: {} },
  ];
  const service = createTreeService({
    now: () => 100,
    getProjects: async () => [{ id: "multi", cwd: "C:/multi" }],
    getOrca: async () => ({ available: true, worktrees: [
      { path: "C:/multi", repoId: "r", branch: "main", agents: [] },
      { path: "C:/multi/active", repoId: "r", worktreeId: "active", displayName: "Active", agents: [{ agentType: "Pi", state: "waiting" }] },
      { path: "C:/multi/idle", repoId: "r", worktreeId: "idle", displayName: "Idle", agents: [] },
    ] }),
    getSessions: async () => sessions,
    getLive: async () => [{ sessionPath: "C:/s/active.jsonl", owner: "terminal" }],
  });
  const tree = await service.get();
  assert.deepEqual(tree.projects[0].envs.map((env) => env.key), ["active", "idle", "C:/multi"]);
  assert.equal(tree.projects[0].envs.find((env) => env.key === "active").pis[0].raw.orcaState, "waiting");
  service.close();
});

// Missing worktree collections and session collections follow their empty fallbacks without changing local membership.
test("tree handles absent worktree and session collections", async () => {
  const service = createTreeService({
    getProjects: async () => [{ id: "p", cwd: "C:/sparse" }],
    getOrca: async () => ({ available: true }), getSessions: async () => null, getLive: async () => null,
  });
  const tree = await service.get();
  assert.equal(tree.projects[0].envs.length, 1);
  assert.equal(tree.projects[0].envs[0].key, "local");
  service.close();
});

// Sparse worktrees exercise missing-agent, non-working-agent, and complete display-field fallbacks.
test("tree handles sparse worktrees and unmatched Orca agents", async () => {
  const service = createTreeService({
    getProjects: async () => [{ id: "p", cwd: "C:/sparse" }],
    getOrca: async () => ({ available: true, worktrees: [
      { path: "C:/sparse" },
      { path: "C:/sparse/child", agents: [{ agentType: "PI" }] },
      { path: "C:/sparse/sibling", agents: [] },
    ] }),
    getSessions: async () => [
      { path: "C:/s/root.jsonl", header: { cwd: "C:/sparse" }, stat: {} },
      { path: "C:/s/child.jsonl", header: { cwd: "C:/sparse/child" }, stat: {} },
    ], getLive: async () => [],
  });
  const envs = (await service.get()).projects[0].envs;
  assert.equal(envs.find((env) => env.path === "C:/sparse").name, "Worktree");
  assert.equal(envs.find((env) => env.path === "C:/sparse").pis[0].raw.orcaState, null);
  assert.equal(envs.find((env) => env.path === "C:/sparse/child").pis[0].raw.orcaState, null);
  service.close();
});

// Null providers are treated as empty data rather than causing a refresh failure.
test("tree accepts null providers and preserves empty snapshots", async () => {
  const service = createTreeService({ getProjects: async () => null, getOrca: async () => null, getSessions: async () => null, getLive: async () => null });
  const first = await service.get();
  assert.deepEqual(first.projects, []);
  assert.equal((await service.get(first.version)).notModified, true);
  service.close();
});

// Optional and malformed records exercise each contract fallback while orphan children remain private.
test("tree applies field fallbacks and ignores sessions outside project environments", async () => {
  const service = createTreeService({
    now: () => 3000,
    getProjects: async () => [{ id: "p", cwd: "C:/repo" }, { id: "empty", cwd: "C:/empty" }],
    getOrca: async () => ({ available: true, worktrees: [
      { path: "C:/repo", repoId: "r", branch: "main", agents: [{ agentType: "worker", state: "blocked" }, { agentType: "PI", cwd: "C:/repo", state: "done" }] },
      { path: "C:/repo/wt", repoId: "r", status: "ready", linkedIssue: { title: "Issue" }, agents: [{ agentType: "PI", path: "C:/repo/wt", state: "blocked" }] },
      { path: "C:/empty/wt", repoId: "e", branch: "", displayName: "", agents: [] },
    ] }),
    getSessions: async () => [
      { path: "C:/repo/root.jsonl", header: { cwd: "C:/repo", timestamp: "invalid" }, stat: { mtimeMs: 0, birthtimeMs: 77 }, title: null, name: "Fallback name", state: null },
      { path: "C:/repo/no-parent.jsonl", header: { cwd: "C:/repo/wt", timestamp: 1234 }, stat: { mtimeMs: 2999 }, title: { agentType: "reviewer" }, agentType: null, lastAssistantAt: "bad" },
      { path: "C:/repo/orphan.jsonl", header: { cwd: "C:/repo/wt", parentSession: "missing" }, stat: {}, title: "Orphan" },
      { path: "", header: { cwd: "C:/repo" }, stat: {} },
      { path: "C:/outside.jsonl", header: { cwd: "C:/outside" }, stat: {} },
    ],
    getLive: async () => [{ sessionPath: "C:/repo/root.jsonl", owner: "terminal" }],
  });
  const tree = await service.get();
  const [project, empty] = tree.projects;
  const primary = project.envs.find((env) => env.path === "C:/repo");
  const root = primary.pis[0];
  assert.equal(root.title, "Fallback name");
  assert.equal(root.sessionId, "");
  assert.equal(root.live.pid, null);
  assert.equal(root.live.startedAt, null);
  assert.equal(root.startedAt, 77);
  assert.equal(root.lastAssistantAt, null);
  assert.equal(root.raw.orcaState, "done");
  assert.equal(root.raw.busy, false);
  assert.equal(root.raw.stalledMs, null);
  assert.equal(primary.orcaStatus, null);
  assert.equal(primary.issue, null);
  assert.equal(project.envs.find((env) => env.path === "C:/repo/wt").issue, "Issue");
  assert.equal(project.envs.find((env) => env.path === "C:/repo/wt").pis[0].title, "Nova conversa");
  assert.equal(empty.envs[0].name, "Worktree");
  assert.equal(empty.envs[0].branch, "");
  assert.equal(empty.envs[0].primary, false);
  assert.equal(empty.envs[1].key, "local");
  assert.equal(tree.projects[0].name, "");
  service.close();
});
