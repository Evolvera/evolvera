// Visibility wave: activity feed, stalled-detection thresholds, today's usage, per-project running counts.
// Fake PI only; owned temp dirs only (agent dir, project roots, sessions).
import assert from "node:assert/strict";
import http from "node:http";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = await mkdtemp(path.join(os.tmpdir(), "pi-studio-vis-"));
const agentDir = path.join(tmp, "agent");
const sessionsRoot = path.join(agentDir, "sessions");
const rootsDir = path.join(tmp, "roots");
const projA = path.join(rootsDir, "alpha");
for (const dir of [projA, sessionsRoot]) await mkdir(dir, { recursive: true });
await writeFile(path.join(projA, "package.json"), "{}");

Object.assign(process.env, {
  PI_AGENT_DIR: agentDir,
  PI_PROJECT_ROOTS: rootsDir,
  PI_WEB_PI_BIN: process.execPath,
  PI_WEB_PI_BIN_ARGS: JSON.stringify([path.join(here, "fake-pi-rpc.mjs")]),
  PI_STUDIO_STALL_PI_MS: "1500",
  PI_STUDIO_STALL_SUBAGENT_MS: "2500",
});
delete process.env.PI_WEB_HOST;
const server = await import("../server.mjs");

after(() => rm(tmp, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }));

const MIN = 60_000;
const line = (value) => `${JSON.stringify(value)}\n`;
const idFor = (cwd) => createHash("sha1").update(server.cwdKey(cwd)).digest("hex").slice(0, 16);
async function waitFor(predicate, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Timed out waiting for condition");
}

describe("ActivityLog", () => {
  test("is bounded, numbers items and answers since a cursor", () => {
    const log = new server.ActivityLog(3);
    assert.deepEqual(log.since(0), { items: [], seq: 0, reset: false });
    for (const text of ["a", "b", "c", "d", "e"]) log.push({ text });
    assert.deepEqual(log.items.map((item) => [item.seq, item.text]), [[3, "c"], [4, "d"], [5, "e"]], "the oldest items fall off");
    assert.deepEqual(log.since(0).items.map((item) => item.seq), [3, 4, 5]);
    assert.deepEqual(log.since(3).items.map((item) => item.seq), [4, 5]);
    assert.deepEqual(log.since(5), { items: [], seq: 5, reset: false });
    assert.deepEqual(log.since(9), { items: log.items, seq: 5, reset: true }, "a cursor past the newest seq (restart) starts over");
    assert.equal(new server.ActivityLog().limit, 300);
  });
});

describe("PI sessions feed the activity log", () => {
  const session = () => new server.PiRpcSession({ projectId: "p1", projectName: "Projeto", cwd: projA });
  const feed = (afterSeq) => server.activityLog.since(afterSeq).items;

  test("track() notes turn, subagent and error events with the project and timestamp", () => {
    const before = server.activityLog.seq;
    const pi = session();
    pi.track({ type: "agent_start" }, 1000);
    pi.track({ type: "tool_execution_start", toolName: "Agent", toolCallId: "t1", args: { name: "auditor" } }, 2000);
    pi.track({ type: "tool_execution_end", toolName: "Agent", toolCallId: "t1", result: { details: { status: "completed" } } }, 5000);
    pi.track({ type: "extension_error", error: "boom" }, 6000);
    pi.track({ type: "agent_end" }, 61_000);
    pi.track({ type: "message_update" }, 62_000);
    const items = feed(before);
    assert.deepEqual(items.map((item) => [item.kind, item.at, item.projectId, item.projectName]), [
      ["subagent_start", 2000, "p1", "Projeto"], ["subagent_end", 5000, "p1", "Projeto"], ["error", 6000, "p1", "Projeto"], ["turn", 61_000, "p1", "Projeto"],
    ]);
    assert.equal(items[1].text, "Subagente auditor terminou · levou 3 s");
    assert.equal(items[3].text, "Terminou a resposta · levou 1 min 0 s");
  });

  test("a dialog waiting, its answer and the process exit are noted", () => {
    const before = server.activityLog.seq;
    const pi = session();
    pi.proc = { stdin: { writable: true, write() {} } };
    pi.track({ type: "extension_ui_request", id: "u1", method: "confirm", title: "Apagar?" });
    pi.send({ type: "extension_ui_response", id: "u1", confirmed: true });
    pi.send({ type: "get_state" });
    pi.note({ type: "process_exit", code: 2, signal: null });
    assert.deepEqual(feed(before).map((item) => item.text), ["Aguardando sua resposta: Apagar?", "Resposta enviada", "PI encerrado (código 2)"]);
  });
});

describe("PI process failures are noted", () => {
  test("a process error and the exit of a real (fake) PI reach the feed", async () => {
    const before = server.activityLog.seq;
    const pi = new server.PiRpcSession({ projectId: "p2", projectName: "Falha", cwd: projA });
    pi.start();
    pi.proc.emit("error", new Error("spawn boom"));
    pi.stop();
    await waitFor(() => pi.exited);
    const texts = server.activityLog.since(before).items.map((item) => item.text);
    assert.ok(texts.includes("Falha ao executar o PI: spawn boom"));
    assert.ok(texts.some((text) => text.startsWith("PI encerrado (")));
  });
});

describe("routes + running counts + today's usage (live server)", () => {
  let listening;
  let base;
  let token;
  const headers = (extra = {}) => ({ "x-pi-studio-token": token, ...extra });
  const getJson = async (pathname) => {
    const res = await fetch(`${base}${pathname}`, { headers: headers() });
    return { status: res.status, data: await res.json() };
  };
  const post = async (pathname, body) => {
    const res = await fetch(`${base}${pathname}`, { method: "POST", headers: headers({ "content-type": "application/json" }), body: JSON.stringify(body) });
    return { status: res.status, data: await res.json() };
  };
  const rawGet = (pathname, hostHeader) => new Promise((resolve, reject) => {
    const url = new URL(`${base}${pathname}`);
    http.get({ host: url.hostname, port: url.port, path: pathname, headers: { host: hostHeader, "x-pi-studio-token": token } }, (res) => {
      res.resume();
      resolve(res.statusCode);
    }).on("error", reject);
  });
  const writeSession = async (dir, name, header, entries, mtimeMs = Date.now()) => {
    await mkdir(path.join(sessionsRoot, dir), { recursive: true });
    const file = path.join(sessionsRoot, dir, name);
    await writeFile(file, [header, ...entries].map(line).join(""));
    await utimes(file, mtimeMs / 1000, mtimeMs / 1000);
    return file;
  };

  before(async () => {
    listening = await server.startServer(0);
    base = `http://127.0.0.1:${listening.address().port}`;
    token = ((await (await fetch(`${base}/`)).text()).match(/name="pi-studio-token" content="([a-f0-9]+)"/))[1];
  });

  after(() => server.stopServer());

  test("both new routes need the token, an allowed Origin and GET", async () => {
    for (const pathname of ["/api/activity", "/api/activity?since=3", "/api/usage/today"]) {
      const url = `${base}${pathname}`;
      assert.equal((await fetch(url)).status, 401, `${pathname} without token`);
      assert.equal((await fetch(url, { headers: headers({ "x-pi-studio-token": "nope" }) })).status, 401, `${pathname} wrong token`);
      assert.equal((await fetch(url, { headers: headers({ origin: "https://evil.example" }) })).status, 403, `${pathname} evil origin`);
      assert.equal(await rawGet(pathname, "evil.example"), 403, `${pathname} evil host`);
      assert.equal((await fetch(url, { method: "POST", headers: headers({ "content-type": "application/json" }), body: "{}" })).status, 405, `${pathname} POST`);
    }
  });

  test("/api/activity: since validation, pagination, reset and real PI events", async () => {
    for (const bad of ["abc", "-1", "1.5", "1e3", "", "1234567890123456"]) assert.equal((await getJson(`/api/activity?since=${bad}`)).status, 400, `since=${bad}`);
    const first = (await getJson("/api/activity")).data;
    assert.deepEqual(Object.keys(first).sort(), ["items", "now", "reset", "seq"]);
    assert.equal(typeof first.now, "number");
    const empty = (await getJson(`/api/activity?since=${first.seq}`)).data;
    assert.deepEqual([empty.items, empty.reset, empty.seq], [[], false, first.seq]);

    const opened = await post("/api/projects/open-path", { cwd: projA });
    assert.equal(opened.status, 201);
    const projectId = opened.data.project.id;
    await post(`/api/projects/${projectId}/command`, { id: "p1", type: "prompt", message: "tools" });
    await waitFor(async () => (await getJson(`/api/activity?since=${first.seq}`)).data.items.some((item) => item.kind === "turn"));
    const fresh = (await getJson(`/api/activity?since=${first.seq}`)).data;
    const turn = fresh.items.find((item) => item.kind === "turn");
    assert.equal(turn.projectId, projectId);
    assert.equal(turn.projectName, "alpha");
    assert.match(turn.text, /^Terminou a resposta/);
    assert.ok(fresh.items.every((item) => item.seq > first.seq));
    assert.equal((await getJson(`/api/activity?since=${fresh.seq + 100}`)).data.reset, true, "cursor from a previous server run");
    assert.ok((await getJson(`/api/activity?since=${fresh.seq + 100}`)).data.items.length >= fresh.items.length);

    // The PI exits: the feed says so.
    await post(`/api/projects/${projectId}/command`, { id: "x1", type: "test_exit", code: 3 });
    await waitFor(async () => (await getJson(`/api/activity?since=${fresh.seq}`)).data.items.some((item) => item.kind === "exit"));
    assert.ok((await getJson(`/api/activity?since=${fresh.seq}`)).data.items.some((item) => item.text === "PI encerrado (código 3)"));
  });

  test("/api/projects/status carries the stall thresholds (env), the server clock and per-project running counts", async () => {
    const mine = await writeSession("--alpha--", "run.jsonl", { type: "session", id: "r1", cwd: projA, timestamp: new Date().toISOString() },
      [{ type: "message", message: { role: "user", content: "faça" } }]);
    server.clearRunningCache();
    const { status, data } = await getJson("/api/projects/status");
    assert.equal(status, 200);
    assert.deepEqual(data.stall, { piMs: 1500, subagentMs: 2500 });
    assert.ok(Math.abs(data.now - Date.now()) < 5000);
    assert.equal(data.runningCounts[idFor(projA)], 1, "an in-flight conversation of a project nobody opened is counted");
    // Cached for 2 s: a finished conversation shows up as soon as the cache is dropped.
    await writeFile(mine, line({ type: "session", id: "r1", cwd: projA }) + line({ type: "message", message: { role: "assistant", content: [], stopReason: "stop" } }));
    assert.equal((await getJson("/api/projects/status")).data.runningCounts[idFor(projA)], 1);
    server.clearRunningCache();
    assert.deepEqual((await getJson("/api/projects/status")).data.runningCounts, {});
    await rm(mine);
  });

  test("/api/usage/today: today's sessions across projects, local day boundary, missing cost", async () => {
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const assistant = (stamp, usage, iso = true) => ({ type: "message", ...(iso ? { timestamp: new Date(stamp).toISOString() } : {}), message: { role: "assistant", content: [{ type: "text", text: "ok" }], stopReason: "stop", ...(iso ? {} : { timestamp: stamp }), usage } });
    await writeSession("--a--", "u1.jsonl", { type: "session", id: "u1", cwd: projA, timestamp: new Date(dayStart).toISOString() }, [
      assistant(dayStart + 1000, { totalTokens: 100, cost: { total: 0.5 } }),
      assistant(dayStart - 1000, { totalTokens: 7000, cost: { total: 9 } }), // yesterday, local time
      assistant(dayStart + 2000, { input: 10, output: 20, cacheRead: 0, cacheWrite: 0, cost: { total: 0.25 } }, false), // message timestamp only
    ]);
    await writeSession("--b--", "u2.jsonl", { type: "session", id: "u2", cwd: path.join(tmp, "elsewhere"), timestamp: new Date(dayStart).toISOString() }, [
      assistant(dayStart + 3000, { totalTokens: 50 }), // tokens, no cost
      { type: "message", message: { role: "user", content: "x" } },
    ]);
    await writeSession("--b--", "u3.jsonl", { type: "session", id: "u3", cwd: projA }, [assistant(dayStart - 5000, { totalTokens: 1, cost: { total: 1 } })]); // only yesterday
    await server.refreshSessionIndex();
    const { status, data } = await getJson("/api/usage/today");
    assert.equal(status, 200);
    assert.deepEqual({ ...data, cost: Math.round(data.cost * 100) / 100 }, { cost: 0.75, tokens: 180, sessions: 2, indexing: false });
  });
});

describe("SessionIndex usage", () => {
  const dayStart = new Date(2025, 5, 10).getTime();
  const day = "2025-06-10";
  const assistant = (offset, usage) => line({ type: "message", timestamp: new Date(dayStart + offset).toISOString(), message: { role: "assistant", content: [{ type: "text", text: "r" }], usage } });

  test("scan sums per local day, reuses unchanged files (counting reader) and rescans changed ones", async () => {
    const root = path.join(tmp, "usage-index");
    await mkdir(path.join(root, "d"), { recursive: true });
    const file = path.join(root, "d", "s.jsonl");
    await writeFile(file, line({ type: "session", id: "s", cwd: projA, timestamp: new Date(dayStart).toISOString() }) + assistant(1000, { totalTokens: 10, cost: { total: 0.1 } }));
    let scans = 0;
    const index = new server.SessionIndex(root, { scan: (filePath, options) => { scans++; return server.scanSessionIndexEntry(filePath, options); } });
    await index.refresh();
    await index.refresh();
    assert.equal(scans, 1, "second refresh is a cache hit (same mtime and size)");
    assert.deepEqual(index.usageOn(day), { cost: 0.1, tokens: 10, sessions: 1 });
    assert.deepEqual(index.usageOn("2025-06-11"), { cost: null, tokens: 0, sessions: 0 });

    await writeFile(file, line({ type: "session", id: "s", cwd: projA, timestamp: new Date(dayStart).toISOString() }) + assistant(1000, { totalTokens: 10, cost: { total: 0.1 } }) + assistant(2000, { totalTokens: 5, cost: { total: 0.2 } }));
    await index.refresh();
    assert.equal(scans, 2, "a grown file is scanned again");
    assert.deepEqual(index.usageOn(day), { cost: 0.30000000000000004, tokens: 15, sessions: 1 });
  });

  test("sessions without any cost report tokens only", async () => {
    const root = path.join(tmp, "usage-nocost");
    await mkdir(path.join(root, "d"), { recursive: true });
    await writeFile(path.join(root, "d", "s.jsonl"), line({ type: "session", id: "s", cwd: projA }) + assistant(0, { totalTokens: 42 }));
    const index = new server.SessionIndex(root);
    await index.refresh();
    assert.deepEqual(index.usageOn(day), { cost: null, tokens: 42, sessions: 1 });
  });
});

describe("running counts", () => {
  test("countRunningByProject: only recent in-flight conversations, per project (host paths mapped)", async () => {
    const root = path.join(tmp, "running");
    const now = Date.now();
    const write = async (dir, name, header, entries, ageMs = 1000) => {
      await mkdir(path.join(root, dir), { recursive: true });
      const file = path.join(root, dir, name);
      await writeFile(file, [header, ...entries].map(line).join(""));
      await utimes(file, (now - ageMs) / 1000, (now - ageMs) / 1000);
    };
    const user = [{ type: "message", message: { role: "user", content: "x" } }];
    const done = [{ type: "message", message: { role: "assistant", content: [], stopReason: "stop" } }];
    const tool = [{ type: "message", message: { role: "assistant", content: [], stopReason: "toolUse" } }];
    await write("one", "a.jsonl", { type: "session", cwd: projA }, user);
    await write("one", "b.jsonl", { type: "session", cwd: projA }, tool, 60_000 - 1);
    await write("one", "c.jsonl", { type: "session", cwd: projA }, done);
    await write("one", "stale.jsonl", { type: "session", cwd: projA }, user, 31 * MIN);
    await write("one", "interrupted.jsonl", { type: "session", cwd: projA }, user, 10 * MIN);
    await write("one", "nocwd.jsonl", { type: "session", id: "x" }, user);
    await write("one", "badcwd.jsonl", { type: "session", cwd: 5 }, user);
    await write("two", "mapped.jsonl", { type: "session", cwd: "Z:\\Host\\alpha" }, user);
    await write("two", "other.jsonl", { type: "session", cwd: path.join(tmp, "other") }, user);
    await writeFile(path.join(root, "one", "notes.txt"), "x");
    await writeFile(path.join(root, "loose.jsonl"), "{}");
    await write("two", "garbage.jsonl", "not json", []);

    const reads = [];
    const states = new server.SessionStateReader({ read: async (filePath, size) => { reads.push(path.basename(filePath)); return server.readLastMessage(filePath, size); } });
    const counts = await server.countRunningByProject(root, { states, now, pathMap: [["Z:\\Host", tmp + "/roots"]] });
    assert.deepEqual(counts, { [idFor(projA)]: 3, [idFor(path.join(tmp, "other"))]: 1 });
    assert.ok(!reads.includes("stale.jsonl"), "files outside the window are never read");
    assert.deepEqual(await server.countRunningByProject(path.join(root, "missing"), { now }), {});
    assert.deepEqual(await server.countRunningByProject(root, { now, windowMs: 0, statFile: async () => { throw new Error("gone"); } }), {}, "a file that vanishes is skipped");
  });

  test("getRunningCounts caches for 2 s and shares one scan between concurrent callers", async () => {
    server.clearRunningCache();
    let clock = 10_000;
    let calls = 0;
    const compute = async () => { calls++; return { p: calls }; };
    const options = { now: () => clock, compute };
    const [a, b] = await Promise.all([server.getRunningCounts(options), server.getRunningCounts(options)]);
    assert.deepEqual([a, b, calls], [{ p: 1 }, { p: 1 }, 1]);
    clock += 1999;
    assert.deepEqual(await server.getRunningCounts(options), { p: 1 });
    clock += 1;
    assert.deepEqual(await server.getRunningCounts(options), { p: 2 });
    server.clearRunningCache();
    assert.deepEqual(await server.getRunningCounts(options), { p: 3 });
    server.clearRunningCache();
  });
});
