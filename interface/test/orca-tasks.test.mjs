// Orca task routes use only the fake CLI and a run-owned temporary agent/data directory.
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = await mkdtemp(path.join(os.tmpdir(), "pi-studio-orca-tasks-"));
const agentDir = path.join(tmp, "agent");
const roots = path.join(tmp, "roots");
const projectDir = path.join(roots, "project");
const orcaState = path.join(tmp, "orca.json");
const argvFile = path.join(tmp, "argv.jsonl");
const linksFile = path.join(agentDir, "pi-studio-data", "task-links.json");
await mkdir(projectDir, { recursive: true });
await writeFile(path.join(projectDir, "package.json"), "{}");
await writeFile(orcaState, JSON.stringify({ mode: "normal", worktrees: [] }));

Object.assign(process.env, { PI_WEB_HOST: "127.0.0.1", PI_WEB_PORT: "0", PI_AGENT_DIR: agentDir, PI_PROJECT_ROOTS: roots,
  PI_WEB_PI_BIN: process.execPath, PI_WEB_PI_BIN_ARGS: JSON.stringify([path.join(here, "fake-pi-rpc.mjs")]),
  PI_STUDIO_ORCA_BIN: process.execPath, PI_STUDIO_ORCA_BIN_ARGS: JSON.stringify([path.join(here, "fake-orca.mjs")]),
  PI_STUDIO_ORCA_TIMEOUT_MS: "2500", FAKE_ORCA_STATE: orcaState, FAKE_ORCA_ARGV_FILE: argvFile, FAKE_ORCA_WORKTREE_ROOT: path.join(tmp, "worktrees") });
const server = await import("../server.mjs");
let base;
let token;
let projectId;
const link = (conversationId, taskId, terminalHandle = `terminal-${taskId}`) => ({ conversationId, taskId, worktreePath: `/wt/${taskId}`, worktreeName: `task-${taskId}`, terminalHandle, createdAt: new Date(0).toISOString() });
const request = async (method, route, body, headers = {}) => {
  const response = await fetch(`${base}${route}`, { method, headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
};
const postCreate = (overrides = {}, headers = {}) => request("POST", "/api/orca/worktrees", { projectId, conversationId: "conv-1", taskId: 7, name: "Tarefa 7", prompt: "faça a tarefa", ...overrides }, headers);
const setState = (value) => writeFile(orcaState, JSON.stringify(value));
const argvLines = async () => (await readFile(argvFile, "utf8").catch(() => "")).trim().split("\n").filter(Boolean).map(JSON.parse);

before(async () => {
  const running = await server.startServer(0, "127.0.0.1");
  base = `http://127.0.0.1:${running.address().port}`;
  const page = await fetch(base);
  token = (await page.text()).match(/name="pi-studio-token" content="([a-f0-9]+)"/)[1];
  const projects = await fetch(`${base}/api/projects`, { headers: { "x-pi-studio-token": token } }).then((r) => r.json());
  projectId = projects.projects.find((item) => path.resolve(item.cwd) === path.resolve(projectDir))?.id;
  assert.ok(projectId, `test project not discovered: ${JSON.stringify(projects.projects)}`);
});
after(async () => {
  await server.stopServer();
  await rm(tmp, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
});

describe("Orca task routes", () => {
  test("POST create enforces token, Host/Origin, and all body validation", async () => {
    assert.equal((await fetch(`${base}/api/orca/worktrees`, { method: "POST" })).status, 401);
    assert.equal((await postCreate({}, { origin: "https://evil.invalid" })).status, 403);
    for (const invalid of [
      { projectId: "unknown" }, { conversationId: "" }, { taskId: 1.5 }, { name: "" }, { name: "x".repeat(61) },
      { name: "bad;name" }, { name: "bad\nname" }, { prompt: "" }, { prompt: "x".repeat(8001) },
    ]) assert.equal((await postCreate(invalid, { "x-pi-studio-token": token })).status, 400, JSON.stringify(invalid));
  });

  test("create uses argv verbatim, returns and atomically persists the task link", async () => {
    const name = "--flag";
    const prompt = 'quote " ; &&\n--danger';
    const result = await postCreate({ name, prompt }, { "x-pi-studio-token": token });
    assert.equal(result.status, 201);
    assert.equal(result.body.ok, true);
    assert.deepEqual({ ...result.body.link, createdAt: "" }, { conversationId: "conv-1", taskId: 7, worktreePath: `${path.join(tmp, "worktrees")}/${name}`, worktreeName: name, terminalHandle: `fake-terminal-${name}`, createdAt: "" });
    const args = (await argvLines()).at(-1);
    assert.deepEqual(args, ["worktree", "create", "--name", name, "--agent", "pi", "--prompt", prompt, "--parent-worktree", "active", "--comment", "pi-studio task conv-1#7", "--json"]);
    assert.deepEqual(JSON.parse(await readFile(linksFile, "utf8")), [result.body.link]);
    await setState({ mode: "normal", createResponse: { result: { worktree: { worktreePath: "/alternate/path", startupTerminal: { handle: "alternate-terminal" } } } }, worktrees: [] });
    const alternate = await postCreate({ taskId: 11, name: "alternate" }, { "x-pi-studio-token": token });
    assert.equal(alternate.status, 201);
    assert.equal(alternate.body.link.worktreePath, "/alternate/path");
    assert.equal(alternate.body.link.terminalHandle, "alternate-terminal");
    await setState({ mode: "normal", createResponse: { path: "/fallback/path", terminalHandle: "outer-terminal" }, worktrees: [] });
    const terminalFallback = await postCreate({ taskId: 12, name: "fallback" }, { "x-pi-studio-token": token });
    assert.equal(terminalFallback.body.link.terminalHandle, "outer-terminal");
    await setState({ mode: "normal", createResponse: { result: { path: "/outer-startup", startupTerminal: { handle: "outer-startup-terminal" } } }, worktrees: [] });
    assert.equal((await postCreate({ taskId: 17, name: "outer-startup" }, { "x-pi-studio-token": token })).body.link.terminalHandle, "outer-startup-terminal");
    await setState({ mode: "normal", createResponse: { result: {} }, worktrees: [] });
    assert.equal((await postCreate({ taskId: 15, name: "bad-response" }, { "x-pi-studio-token": token })).status, 502);
    await setState({ mode: "normal", createMode: "malformed", worktrees: [] });
    assert.equal((await postCreate({ taskId: 16, name: "bad-json" }, { "x-pi-studio-token": token })).status, 500);
    await setState({ mode: "normal", worktrees: [] });
    const filtered = await request("GET", "/api/tasks/links?conversation=conv-1", undefined, { "x-pi-studio-token": token });
    assert.equal(filtered.body.links.find((item) => item.taskId === 7).terminalHandle, result.body.link.terminalHandle);
    assert.equal(filtered.body.links.length, 4);
    assert.equal((await request("GET", "/api/tasks/links?conversation=other", undefined, { "x-pi-studio-token": token })).body.links.length, 0);
  });

  test("terminal-send permits only stored terminal handles and passes text as one argv item", async () => {
    const text = 'literal " ; &&\n--ignore';
    assert.equal((await request("POST", "/api/orca/terminal-send", { handle: "not-linked", text }, { "x-pi-studio-token": token })).status, 403);
    assert.equal((await request("POST", "/api/orca/terminal-send", { handle: "fake-terminal---flag", text }, { "x-pi-studio-token": token })).status, 200);
    await setState({ mode: "normal", sendMode: "exit", worktrees: [] });
    assert.equal((await request("POST", "/api/orca/terminal-send", { handle: "fake-terminal---flag", text }, { "x-pi-studio-token": token })).status, 502);
    await setState({ mode: "normal", sendMode: "timeout", worktrees: [] });
    assert.equal((await request("POST", "/api/orca/terminal-send", { handle: "fake-terminal---flag", text }, { "x-pi-studio-token": token })).status, 504);
    await setState({ mode: "normal", worktrees: [] });
    assert.deepEqual((await argvLines()).at(-1), ["terminal", "send", "--terminal", "fake-terminal---flag", "--text", text, "--enter", "--json"]);
    for (const body of [{ handle: "", text }, { handle: "fake-terminal---flag", text: "" }, { handle: "fake-terminal---flag", text: "x".repeat(8001) }]) {
      assert.equal((await request("POST", "/api/orca/terminal-send", body, { "x-pi-studio-token": token })).status, 400);
    }
  });

  test("create timeout re-reads ps and reports unknown or persists a discovered result", async () => {
    try {
      await setState({ mode: "normal", createMode: "timeout", worktrees: [] });
      assert.deepEqual((await postCreate({ taskId: 8, name: "unknown" }, { "x-pi-studio-token": token })).body, { ok: false, unknown: true });
      await setState({ mode: "normal", createMode: "timeout", worktrees: [{ path: "/found/known", displayName: "different", name: "known", comment: "pi-studio task conv-1#9", agents: [{ terminalHandle: "found-terminal" }] }] });
      const found = await postCreate({ taskId: 9, name: "known" }, { "x-pi-studio-token": token });
      assert.equal(found.status, 201);
      assert.equal(found.body.link.terminalHandle, "found-terminal");
      const commands = (await argvLines()).map((args) => args.slice(0, 2).join(" "));
      assert.ok(commands.filter((item) => item === "worktree create").length >= 2);
      assert.ok(commands.filter((item) => item === "worktree ps").length >= 2);
      await setState({ mode: "normal", createMode: "timeout", psMode: "exit", worktrees: [] });
      assert.deepEqual((await postCreate({ taskId: 13, name: "ps-failed" }, { "x-pi-studio-token": token })).body, { ok: false, unknown: true });
      await setState({ mode: "normal", createMode: "timeout", psResponse: { result: { result: { worktrees: [{ path: "/comment/path", comment: "pi-studio task conv-1#14", terminalHandle: "comment-terminal" }] } } } });
      const commentMatch = await postCreate({ taskId: 14, name: "comment-match" }, { "x-pi-studio-token": token });
      assert.equal(commentMatch.status, 201);
      assert.equal(commentMatch.body.link.terminalHandle, "comment-terminal");
    } finally {
      await setState({ mode: "normal", worktrees: [] });
    }
  });

  test("missing Orca returns 503; links are bounded and corrupt data is backed up", async () => {
    const bin = process.env.PI_STUDIO_ORCA_BIN;
    process.env.PI_STUDIO_ORCA_BIN = path.join(tmp, "missing-orca");
    try { assert.equal((await postCreate({}, { "x-pi-studio-token": token })).status, 503); } finally { process.env.PI_STUDIO_ORCA_BIN = bin; }
    const many = Array.from({ length: 1001 }, (_, i) => link("conv-many", i));
    await writeFile(linksFile, JSON.stringify(many));
    assert.equal((await request("GET", "/api/tasks/links", undefined, { "x-pi-studio-token": token })).body.links.length, 1000);
    await writeFile(linksFile, "{corrupt");
    assert.deepEqual((await request("GET", "/api/tasks/links", undefined, { "x-pi-studio-token": token })).body.links, []);
    assert.equal(await readFile(`${linksFile}.bak`, "utf8"), "{corrupt");
    await writeFile(linksFile, JSON.stringify({ invalid: true }));
    assert.deepEqual((await request("GET", "/api/tasks/links", undefined, { "x-pi-studio-token": token })).body.links, []);
    await writeFile(linksFile, JSON.stringify([null, { conversationId: "bad", taskId: "x" }, link("good", 1)]));
    assert.deepEqual((await request("GET", "/api/tasks/links", undefined, { "x-pi-studio-token": token })).body.links, [link("good", 1)]);
    await rm(linksFile, { force: true });
    await rm(`${linksFile}.bak`, { force: true });
    await mkdir(linksFile, { recursive: true });
    await mkdir(`${linksFile}.bak`, { recursive: true });
    const failedSave = await postCreate({ taskId: 10, name: "save-failure" }, { "x-pi-studio-token": token });
    assert.equal(failedSave.status, 500);
  });
});
