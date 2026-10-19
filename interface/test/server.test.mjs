// In-process tests for server.mjs helpers and routes (fake PI only; owned temp dirs only).
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { execFileSync } from "node:child_process";
import http from "node:http";
import { mkdir, mkdtemp, open as openFile, readFile, rm, stat, symlink, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = await mkdtemp(path.join(os.tmpdir(), "pi-studio-unit-"));
const agentDir = path.join(tmp, "agent");
const sessionsRoot = path.join(agentDir, "sessions");
const rootsDir = path.join(tmp, "roots");
const projA = path.join(rootsDir, "alpha");
const projC = path.join(rootsDir, "gamma");
const histB = path.join(tmp, "beta-history");
const histD = path.join(tmp, "delta-history");
for (const dir of [projA, projC, histB, histD, sessionsRoot]) await mkdir(dir, { recursive: true });
await writeFile(path.join(projA, "package.json"), "{}");
await writeFile(path.join(projC, "package.json"), "{}");

async function sessionFile(dirName, fileName, header, mtimeSeconds, extra = []) {
  const dir = path.join(sessionsRoot, dirName);
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, fileName);
  await writeFile(file, [typeof header === "string" ? header : JSON.stringify(header), ...extra.map((line) => JSON.stringify(line))].join("\n"));
  await utimes(file, mtimeSeconds, mtimeSeconds);
  return file;
}

// Owned env, set before import: the server never sees the real ~/.pi, projects or pi binary.
Object.assign(process.env, {
  PI_AGENT_DIR: agentDir,
  PI_PROJECT_ROOTS: rootsDir,
  PI_WEB_PROJECT_LIMIT: "3",
  // A host (Windows-style) prefix mapped onto the owned tmp dir, like the Docker bind mount.
  PI_WEB_PATH_MAP: JSON.stringify([["Z:\\Host\\", tmp]]),
  PI_WEB_PI_BIN: process.execPath,
  PI_WEB_PI_BIN_ARGS: JSON.stringify([path.join(here, "fake-pi-rpc.mjs")]),
});
delete process.env.PI_WEB_HOST;
const server = await import("../server.mjs");

// The fake PI may still be exiting with its cwd inside tmp; Windows reports EBUSY until it is gone.
after(() => rm(tmp, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }));

async function waitFor(predicate, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Timed out waiting for condition");
}

describe("main mode", () => {
  test("run as main: listens, resolves PI once, installs signal handlers", async () => {
    const argv1 = process.argv[1];
    const before = { int: process.listeners("SIGINT"), term: process.listeners("SIGTERM") };
    process.env.PI_WEB_PORT = "0";
    process.argv[1] = fileURLToPath(new URL("../server.mjs", import.meta.url));
    try {
      // A second module instance (query string) evaluates the main block in-process.
      const main = await import("../server.mjs?main");
      assert.equal(main.isMainModule, true);
      assert.equal(main.piCommand().bin, process.execPath);
      assert.equal(process.listeners("SIGINT").length, before.int.length + 1);
      assert.equal(process.listeners("SIGTERM").length, before.term.length + 1);
      await main.stopServer();
    } finally {
      process.argv[1] = argv1;
      delete process.env.PI_WEB_PORT;
      for (const signal of ["SIGINT", "SIGTERM"]) {
        for (const listener of process.listeners(signal)) if (!before[signal === "SIGINT" ? "int" : "term"].includes(listener)) process.off(signal, listener);
      }
    }
  });
});

describe("session header cache", () => {
  test("reads a replaced session file header again", async () => {
    const file = path.join(tmp, "replaceable-session.jsonl");
    const cache = new Map();
    await writeFile(file, JSON.stringify({ type: "session", id: "old", cwd: projA }));
    assert.equal((await server.sessionHeader(file, { cache })).id, "old");
    await rm(file);
    await writeFile(file, JSON.stringify({ type: "session", id: "new", cwd: projC }));
    assert.equal((await server.sessionHeader(file, { cache })).id, "new");
  });

  test("uses non-shrinking size when file identity metadata is unavailable", async () => {
    const cache = new Map();
    let size = 10;
    let id = "same";
    let reads = 0;
    const read = async () => { reads++; return JSON.stringify({ type: "session", id }); };
    const statFile = async () => ({ size });
    assert.equal((await server.sessionHeader("fallback", { read, cache, statFile })).id, "same");
    assert.equal((await server.sessionHeader("fallback", { read, cache, statFile })).id, "same");
    size = 9;
    id = "replaced";
    assert.equal((await server.sessionHeader("fallback", { read, cache, statFile })).id, "replaced");
    assert.equal(reads, 2);
  });
});

describe("SSE client backpressure", () => {
  test("disconnects clients that exceed the cap during replay", () => {
    const makeClient = (bufferedBytes) => {
      const client = new EventEmitter();
      client.writableLength = bufferedBytes;
      client.writeHead = () => {};
      client.write = (chunk) => { client.writableLength += Buffer.byteLength(chunk); return false; };
      client.end = () => { client.ended = true; client.emit("close"); };
      return client;
    };
    const connecting = new server.PiRpcSession({ projectId: "sse-connect-cap", projectName: "sse", cwd: tmp });
    const alreadyFull = makeClient(8 * 1024 * 1024 + 1);
    try {
      connecting.addClient(alreadyFull);
      assert.equal(alreadyFull.ended, true, "initial connection frame is subject to the limit");
    } finally {
      alreadyFull.emit("close");
    }

    const replaying = new server.PiRpcSession({ projectId: "sse-replay-cap", projectName: "sse", cwd: tmp });
    replaying.history.push({ event: "rpc", payload: { type: "message_update", content: "payload" } });
    const duringReplay = makeClient(8 * 1024 * 1024 - 64);
    try {
      replaying.addClient(duringReplay);
      assert.equal(duringReplay.ended, true, "replay frame must not exceed the per-client limit");
    } finally {
      duringReplay.emit("close");
    }
  });

  test("drops a client above the buffered-byte cap but keeps healthy clients", () => {
    const session = new server.PiRpcSession({ projectId: "sse-cap", projectName: "sse-cap", cwd: tmp });
    const makeClient = () => {
      const client = new EventEmitter();
      client.writes = [];
      client.writeHead = () => {};
      client.write = (chunk) => { client.writes.push(chunk); return true; };
      client.end = () => { client.ended = true; client.emit("close"); };
      client.writableLength = 0;
      return client;
    };
    const slow = makeClient();
    const healthy = makeClient();
    session.addClient(slow);
    session.addClient(healthy);
    try {
      slow.writableLength = 8 * 1024 * 1024 + 1;
      session.broadcast("rpc", { type: "message_update", content: "next" });
      assert.equal(slow.ended, true, "slow client should be disconnected to replay on reconnect");
      assert.equal(session.clients.has(slow), false);
      assert.equal(session.clientHeartbeats.has(slow), false);
      assert.equal(session.clients.has(healthy), true);
      assert.ok(healthy.writes.some((chunk) => chunk.includes("message_update")));
      session.finalizeTerminal("exit", null, 0, null);
      assert.equal(session.clientHeartbeats.size, 0);
    } finally {
      for (const client of [slow, healthy]) client.emit("close");
    }
  });
});

describe("PI stdin errors", () => {
  test("a spawn error marks the wrapper exited so a later open can replace it", async () => {
    const session = new server.PiRpcSession({ projectId: "spawn-error", projectName: "spawn-error", cwd: path.join(tmp, "missing-cwd") });
    session.start();
    await waitFor(() => session.exited);
    assert.equal(session.summary().exited, true);
    assert.throws(() => session.send({ type: "get_state" }), /not running/);
  });

  test("a stdin error (write racing PI exit) is logged, not thrown as uncaught", async () => {
    const session = new server.PiRpcSession({ projectId: "stdin-err", projectName: "stdin-err", cwd: tmp });
    session.start();
    const uncaught = [];
    const onUncaught = (error) => uncaught.push(error);
    process.on("uncaughtException", onUncaught);
    try {
      const failure = Object.assign(new Error("write EPIPE"), { code: "EPIPE" });
      // emit() returns false when nobody listens, in which case Node would throw it.
      assert.equal(session.proc.stdin.emit("error", failure), true);
      await new Promise((resolve) => setImmediate(resolve));
      assert.deepEqual(uncaught, []);
    } finally {
      process.off("uncaughtException", onUncaught);
      const exited = new Promise((resolve) => session.proc.once("exit", resolve));
      session.stop();
      await exited;
    }
  });
});

describe("activity restart cursor", () => {
  test("a cursor from another server epoch resets to the complete feed", () => {
    const activity = new server.ActivityLog(10);
    activity.push({ message: "current" });
    const previousEpoch = "previous-server";
    const response = activity.since(1, previousEpoch);
    assert.equal(typeof response.epoch, "string");
    assert.notEqual(response.epoch, previousEpoch);
    assert.equal(response.reset, true);
    assert.deepEqual(response.items.map((item) => item.message), ["current"]);
  });

  test("legacy sequence-only cursor keeps its existing behavior", () => {
    const activity = new server.ActivityLog(10);
    activity.push({ message: "current" });
    assert.deepEqual(activity.since(0).items.map((item) => item.message), ["current"]);
  });
});

describe("host path map", () => {
  test("parsePathMap accepts only [[from, to], ...] JSON", () => {
    assert.deepEqual(server.parsePathMap(""), []);
    assert.deepEqual(server.parsePathMap(undefined), []);
    assert.deepEqual(server.parsePathMap('[["C:/a", "/a"]]'), [["C:/a", "/a"]]);
    for (const bad of ["{", '{"a":1}', '[["C:/a"]]', '[["C:/a", ""]]', '[["C:/a", 1]]', '["x"]']) assert.deepEqual(server.parsePathMap(bad), [], bad);
  });

  test("mapHostPath maps drive prefixes caselessly, posix prefixes exactly, on segment boundaries", () => {
    const map = [["C:\\Users\\Me\\", "/home/me/"], ["/srv/data", "/data"]];
    assert.equal(server.mapHostPath("c:\\users\\me\\Desktop\\proj", map), "/home/me/Desktop/proj");
    assert.equal(server.mapHostPath("C:/Users/Me", map), "/home/me");
    assert.equal(server.mapHostPath("C:\\Users\\MeToo\\x", map), "C:\\Users\\MeToo\\x");
    assert.equal(server.mapHostPath("/srv/data/x", map), "/data/x");
    assert.equal(server.mapHostPath("/SRV/data/x", map), "/SRV/data/x");
    assert.equal(server.mapHostPath("D:\\other", map), "D:\\other");
    assert.equal(server.mapHostPath("/any", []), "/any");
  });
});

describe("cwdKey", () => {
  test("is case-insensitive only on win32", () => {
    assert.equal(server.cwdKey("/Tmp/X", "win32"), path.resolve("/Tmp/X").toLowerCase());
    assert.equal(server.cwdKey("/Tmp/X", "linux"), path.resolve("/Tmp/X"));
  });
});

describe("resolvePiCommand", () => {
  const logs = [];
  const log = (...args) => logs.push(args);

  test("PI_WEB_PI_BIN wins on any platform and keeps prefix args", () => {
    const result = server.resolvePiCommand({ platform: "win32", env: { PI_WEB_PI_BIN: "C:/x/pi.exe", PI_WEB_PI_BIN_ARGS: '["--a"]' }, log });
    assert.deepEqual(result, { bin: "C:/x/pi.exe", prefixArgs: ["--a"], source: "env" });
  });

  test("non-Windows spawns `pi` from PATH", () => {
    assert.deepEqual(server.resolvePiCommand({ platform: "linux", env: {}, log }), { bin: "pi", prefixArgs: [], source: "path" });
  });

  test("win32 runs node + global cli.js from the first root that has it", () => {
    const seen = [];
    const result = server.resolvePiCommand({
      platform: "win32",
      env: { PI_WEB_PI_BIN_ARGS: '["--x"]' },
      execPath: "C:\\node\\node.exe",
      npmRoots: () => ["C:\\missing", "C:\\npm\\node_modules"],
      exists: (file) => {
        seen.push(file);
        return file.startsWith("C:\\npm");
      },
      log,
    });
    const cli = path.win32.join("C:\\npm\\node_modules", "@earendil-works", "pi-coding-agent", "dist", "cli.js");
    assert.deepEqual(result, { bin: "C:\\node\\node.exe", prefixArgs: [cli, "--x"], source: "npm-global" });
    assert.equal(seen.length, 2);
  });

  test("win32 default roots: npm root -g, then APPDATA, then the node dir; logs and falls back", () => {
    const tried = [];
    const result = server.resolvePiCommand({
      platform: "win32",
      env: { APPDATA: "C:\\Users\\u\\AppData\\Roaming" },
      execPath: "C:\\node\\node.exe",
      runNpmRoot: () => "D:\\npm-root",
      exists: (file) => {
        tried.push(file);
        return false;
      },
      log,
    });
    assert.deepEqual(result, { bin: "pi", prefixArgs: [], source: "fallback" });
    assert.deepEqual(tried.map((file) => file.split("\\@earendil-works")[0]), ["D:\\npm-root", "C:\\Users\\u\\AppData\\Roaming\\npm\\node_modules", "C:\\node\\node_modules"]);
    assert.equal(logs.at(-1)[0], "error");
    assert.match(logs.at(-1)[1], /PI_WEB_PI_BIN/);
  });

  test("piCommand resolves once and caches", () => {
    const first = server.piCommand();
    assert.equal(first.bin, process.execPath);
    assert.equal(server.piCommand(), first);
  });
});

describe("buildPiArgs", () => {
  test("names the session and forwards provider/model overrides", () => {
    assert.deepEqual(server.buildPiArgs({ prefixArgs: ["cli.js"], name: "proj", cwd: "/x", env: {} }), ["cli.js", "--mode", "rpc", "--name", "proj"]);
    assert.deepEqual(
      server.buildPiArgs({ name: "", cwd: path.join(tmp, "folder"), env: { PI_WEB_PROVIDER: "p", PI_WEB_MODEL: "m" } }),
      ["--mode", "rpc", "--name", "folder", "--provider", "p", "--model", "m"],
    );
    assert.deepEqual(server.buildPiArgs({ cwd: path.parse(tmp).root, env: {} }).slice(-1), ["pi-web"]);
    assert.equal(server.buildPiArgs({ name: "n", cwd: "/x" }).length, 4);
  });
});

describe("npm root helpers", () => {
  test("candidates dedupe and skip empty npm output", () => {
    assert.deepEqual(
      server.npmGlobalRootCandidates({ env: {}, execPath: "C:\\node\\node.exe", runNpmRoot: () => "C:\\node\\node_modules" }),
      ["C:\\node\\node_modules"],
    );
    assert.deepEqual(
      server.npmGlobalRootCandidates({ env: { APPDATA: "C:\\A" }, execPath: "C:\\n\\node.exe", runNpmRoot: () => null }),
      ["C:\\A\\npm\\node_modules", "C:\\n\\node_modules"],
    );
  });

  test("runNpmRootGlobal runs npm's JS entry through node (no shell)", async () => {
    const script = path.join(tmp, "npm-cli.js");
    await writeFile(script, "process.stdout.write(process.argv.slice(2).join(' ') === 'root -g' ? '  /fake/global  \\n' : 'bad');");
    assert.equal(server.runNpmRootGlobal({ nodeBin: process.execPath, npmCli: script }), "/fake/global");
    const empty = path.join(tmp, "npm-empty.js");
    await writeFile(empty, "");
    assert.equal(server.runNpmRootGlobal({ nodeBin: process.execPath, npmCli: empty }), null);
    const failing = path.join(tmp, "npm-fail.js");
    await writeFile(failing, "process.exit(3)");
    assert.equal(server.runNpmRootGlobal({ nodeBin: process.execPath, npmCli: failing }), null);
    assert.equal(server.runNpmRootGlobal({ nodeBin: process.execPath, npmCli: path.join(tmp, "absent.js") }), null);
  });
});

describe("session file helpers", () => {
  test("readdirSafe returns [] for a missing dir", async () => {
    assert.deepEqual(await server.readdirSafe(path.join(tmp, "nope")), []);
  });

  test("readFirstLine reads only the head, strips CR, handles no newline", async () => {
    const crlf = path.join(tmp, "crlf.txt");
    await writeFile(crlf, "first\r\nsecond");
    assert.equal(await server.readFirstLine(crlf), "first");
    const single = path.join(tmp, "single.txt");
    await writeFile(single, "only");
    assert.equal(await server.readFirstLine(single), "only");
    const big = path.join(tmp, "big.txt");
    await writeFile(big, "x".repeat(100));
    assert.equal(await server.readFirstLine(big, 10), "x".repeat(10));
  });

  test("sortProjects: recently used first (newest first), then by name", () => {
    const sorted = server.sortProjects([
      { name: "b" },
      { name: "old", lastUsedAt: "2024-01-01T00:00:00.000Z" },
      { name: "a" },
      { name: "new", lastUsedAt: "2025-01-01T00:00:00.000Z" },
    ]);
    assert.deepEqual(sorted.map((item) => item.name), ["new", "old", "a", "b"]);
  });
});

describe("history discovery + routes", () => {
  let listening;
  let base;
  let token;
  let cookie;
  let historyFileB;

  const headers = (extra = {}) => ({ "x-pi-studio-token": token, ...extra });
  const getJson = async (pathname) => {
    const res = await fetch(`${base}${pathname}`, { headers: headers() });
    assert.equal(res.status, 200, pathname);
    return res.json();
  };
  const postJson = async (pathname, body) => {
    const res = await fetch(`${base}${pathname}`, { method: "POST", headers: headers({ "content-type": "application/json" }), body: JSON.stringify(body) });
    return { status: res.status, data: await res.json() };
  };
  const sse = (pathname, sink) => {
    const req = http.get(`${base}${pathname}`, { headers: { cookie: `pi-studio-token=${cookie}` } }, (res) => {
      res.setEncoding("utf8");
      let buffer = "";
      res.on("data", (chunk) => {
        buffer += chunk;
        let boundary = buffer.indexOf("\n\n");
        while (boundary !== -1) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const event = frame.split("\n").find((line) => line.startsWith("event: "))?.slice(7);
          const data = frame.split("\n").find((line) => line.startsWith("data: "))?.slice(6);
          if (event && data) sink.push({ event, payload: JSON.parse(data) });
          boundary = buffer.indexOf("\n\n");
        }
      });
    });
    req.on("error", () => {});
    return req;
  };

  before(async () => {
    // alpha: in a root AND in history. beta: history only (3 files). delta: beyond the project limit.
    await sessionFile("--alpha--", "a1.jsonl", { type: "session", cwd: projA }, 1_700_000_000);
    // b-1 has other casing: same project on win32, a missing dir elsewhere. b-2 newest, b-3 older than b-2.
    await sessionFile("--beta--", "b-1.jsonl", { type: "session", cwd: histB.toUpperCase() }, 1_600_000_000);
    historyFileB = await sessionFile("--beta--", "b-2.jsonl", { type: "session", cwd: histB }, 1_800_000_000, [
      { type: "message", id: "x", message: { role: "user", content: [{ type: "text", text: "Olá beta" }] } },
    ]);
    await sessionFile("--beta--", "b-3.jsonl", { type: "session", cwd: histB }, 1_700_000_000);
    // Recorded by a host PI: Windows path under the mapped prefix (other drive-letter casing).
    await sessionFile("--beta-host--", "b-host.jsonl", { type: "session", cwd: "z:\\host\\beta-history" }, 1_650_000_000);
    await sessionFile("--delta--", "d.jsonl", { type: "session", cwd: histD }, 1_500_000_000);
    await sessionFile("--gone--", "g.jsonl", { type: "session", cwd: path.join(tmp, "deleted") }, 1_900_000_000);
    await sessionFile("--junk--", "bad.jsonl", "{oops", 1_900_000_000);
    await sessionFile("--junk--", "nocwd.jsonl", { type: "session" }, 1_900_000_000);
    await sessionFile("--junk--", "wrongtype.jsonl", { type: "message", cwd: histD }, 1_900_000_000);
    await writeFile(path.join(sessionsRoot, "--junk--", "notes.txt"), "ignored");
    await mkdir(path.join(sessionsRoot, "--junk--", "nested.jsonl"), { recursive: true });
    await writeFile(path.join(sessionsRoot, "stray-file.jsonl"), "ignored");

    listening = await server.startServer(0);
    base = `http://127.0.0.1:${listening.address().port}`;
    const page = await fetch(`${base}/`);
    token = (await page.text()).match(/name="pi-studio-token" content="([a-f0-9]+)"/)[1];
    cookie = page.headers.get("set-cookie").match(/pi-studio-token=([^;]+)/)[1];
  });

  test("activity response carries epoch and resets a mismatched cursor", async () => {
    const initial = await getJson("/api/activity?since=0");
    assert.equal(typeof initial.epoch, "string");
    const restarted = await getJson("/api/activity?since=1&epoch=old-instance");
    assert.equal(restarted.reset, true);
    assert.equal(restarted.epoch, initial.epoch);
    const legacy = await getJson("/api/activity?since=0");
    assert.equal(legacy.epoch, initial.epoch);
  });

  after(async () => {
    await server.stopServer();
    assert.equal(listening.listening, false);
    // Off-loopback hosts get a console warning (127.0.0.2 stays local).
    const warnings = [];
    const warn = console.warn;
    console.warn = (message) => warnings.push(message);
    try {
      await server.startServer(0, "127.0.0.2");
    } finally {
      console.warn = warn;
    }
    await server.stopServer();
    assert.match(warnings.join("\n"), /beyond loopback/);
  });

  test("not started as main when imported", () => {
    assert.equal(server.isMainModule, false);
  });

  test("discoverHistoryProjects: newest first, existing dirs only, newest mtime per cwd", async () => {
    const found = await server.discoverHistoryProjects(sessionsRoot);
    assert.deepEqual(found.map((item) => item.cwd), [histB, projA, histD]);
    assert.equal(found[0].lastUsedMs, 1_800_000_000_000);
  });

  test("bootstrap merges roots + history (recent first) within the project limit", async () => {
    const data = await getJson("/api/bootstrap");
    assert.deepEqual(data.projects.map((item) => item.cwd), [histB, projA, projC]);
    assert.ok(data.projects[0].lastUsedAt && data.projects[1].lastUsedAt);
    assert.equal(data.projects[2].lastUsedAt, null);
    const health = await getJson("/api/health");
    assert.equal(health.piBin, process.execPath);
    const history = await getJson(`/api/projects/${data.projects[0].id}/history`);
    const paths = history.history.map((item) => item.path);
    assert.ok(paths.includes(historyFileB) && paths.includes(path.join(sessionsRoot, "--beta--", "b-3.jsonl")));
    assert.ok(paths.includes(path.join(sessionsRoot, "--beta-host--", "b-host.jsonl")));
    assert.equal(paths.includes(path.join(sessionsRoot, "--beta--", "b-1.jsonl")), process.platform === "win32");
    assert.equal(history.history.find((item) => item.path === historyFileB).title, "Olá beta");
  });

  test("S5: subscribing after explicit stop reports stopped without spawning another PI", async () => {
    const { projects } = await getJson("/api/projects");
    const id = projects.find((item) => item.cwd === projC).id;
    await postJson(`/api/projects/${id}/open`, {});
    await postJson(`/api/projects/${id}/stop`, {});
    await new Promise((resolve) => setTimeout(resolve, 100));
    const events = [];
    const client = sse(`/api/projects/${id}/events`, events);
    await waitFor(() => events.some((item) => item.event === "session_stopped"));
    assert.equal(events.some((item) => item.event === "session_ready"), false);
    client.destroy();
  });

  test("retired session wrappers are replaced by a bounded summary window", async () => {
    let latestId;
    for (let index = 0; index < 205; index++) {
      const session = new server.PiRpcSession({ projectId: `retired-${index}`, projectName: "retired", cwd: projA });
      latestId = session.id;
      session.finalizeTerminal("exit", null, 0, null);
    }
    const response = await getJson("/api/sessions");
    assert.ok(response.sessions.length <= 200);
    assert.equal(response.sessions.at(-1).id, latestId);
    const status = await getJson("/api/projects/status");
    assert.ok(status.statuses.some((item) => item.sessionId === latestId && item.exited));
  });

  test("SSE replay ends with replay_done and skips answered dialogs", async () => {
    const { projects } = await getJson("/api/projects");
    const id = projects.find((item) => item.cwd === projA).id;
    assert.equal((await postJson(`/api/projects/${id}/open`, {})).status, 201);
    const live = [];
    const first = sse(`/api/projects/${id}/events`, live);
    await waitFor(() => live.some((item) => item.event === "replay_done"));
    await postJson(`/api/projects/${id}/command`, { id: "p-ui", type: "prompt", message: "ui" });
    await waitFor(() => live.some((item) => item.payload.id === "fake-ui-1"));
    assert.ok(live.some((item) => item.payload.statusText === "latest"));

    const pending = [];
    const second = sse(`/api/projects/${id}/events`, pending);
    await waitFor(() => pending.some((item) => item.event === "replay_done"));
    assert.ok(pending.some((item) => item.payload.id === "fake-ui-1"), "an unanswered dialog is replayed");
    assert.ok(pending.find((item) => item.payload.id === "fake-ui-1").payload.timeout < 5000, "replay keeps only the remaining timeout");
    assert.ok(pending.some((item) => item.payload.statusText === "latest"), "latest status is replayed");
    assert.ok(pending.some((item) => item.payload.widgetKey === "test"), "widget is replayed");

    assert.equal((await postJson(`/api/projects/${id}/ui-response`, { id: "fake-ui-1", value: "Bloquear" })).status, 202);
    await waitFor(() => live.some((item) => item.event === "ui_resolved" && item.payload.id === "fake-ui-1"));
    await waitFor(() => pending.some((item) => item.event === "ui_resolved" && item.payload.id === "fake-ui-1"));
    first.destroy();
    second.destroy();
    const replay = [];
    const third = sse(`/api/projects/${id}/events`, replay);
    await waitFor(() => replay.some((item) => item.payload.message === "Escolha: Bloquear"));
    await waitFor(() => replay.some((item) => item.event === "replay_done"));
    third.destroy();
    const done = replay.find((item) => item.event === "replay_done");
    assert.ok(Number.isInteger(done.payload.count) && done.payload.count > 0);
    assert.equal(replay.some((item) => item.payload.type === "extension_ui_request" && item.payload.id === "fake-ui-1"), false);

    const timeoutLive = [];
    const fourth = sse(`/api/projects/${id}/events`, timeoutLive);
    await waitFor(() => timeoutLive.some((item) => item.event === "replay_done"));
    await postJson(`/api/projects/${id}/command`, { id: "p-ui-timeout", type: "prompt", message: "ui-timeout" });
    await waitFor(() => timeoutLive.some((item) => item.payload.id === "fake-ui-timeout"));
    fourth.destroy();
    await new Promise((resolve) => setTimeout(resolve, 40));
    const expired = [];
    const fifth = sse(`/api/projects/${id}/events`, expired);
    await waitFor(() => expired.some((item) => item.event === "replay_done"));
    fifth.destroy();
    assert.equal(expired.some((item) => item.payload.type === "extension_ui_request" && item.payload.id === "fake-ui-timeout"), false, "expired dialogs are not replayed");
    assert.equal((await postJson(`/api/projects/${id}/ui-response`, { id: "not-pending", value: "ignored" })).status, 202);
  });
  describe("session titles + conversation search", () => {
    const user = (text) => ({ type: "message", message: { role: "user", content: text } });
    const assistant = (text) => ({ type: "message", message: { role: "assistant", content: [{ type: "text", text }] } });
    const header = (cwd, timestamp) => ({ type: "session", cwd, ...(timestamp ? { timestamp } : {}) });
    const search = async (query) => {
      let response;
      for (let attempt = 0; attempt < 200; attempt++) {
        response = await getJson(`/api/search?q=${encodeURIComponent(query)}`);
        if (!response.indexing) return response.results;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error("Session index did not finish refreshing");
    };
    let alphaId;
    let rich;
    let accent;
    let outsideDir;

    before(async () => {
      const { projects } = await getJson("/api/projects");
      alphaId = projects.find((item) => item.cwd === projA).id;
      rich = await sessionFile("--search--", "rich.jsonl", header(projA, "2025-03-01T10:00:00.000Z"), 1_400_000_100, [
        { type: "session_info", name: 5 },
        { type: "session_info", name: "Plano de login" },
        user("Preciso de uma função de AUTENTICAÇÃO segura"),
        assistant("Claro, vou implementar a autenticacao com tokens"),
        { type: "message", message: { role: "toolResult", content: [{ type: "text", text: "segredo-tool" }] } },
        { type: "message" },
        { type: "message", message: { role: "assistant", content: [{ type: "toolCall" }] } },
        user("outra coisa com autenticacao"),
        { type: "session_info", name: "  Plano de auth final  " },
      ]);
      await writeFile(rich, `${await readFile(rich, "utf8")}\n{cortada\nnull\n`);
      accent = await sessionFile("--search--", "accent.jsonl", header(histB), 1_400_000_200, [assistant("Resposta sobre Café com leite e açúcar")]);
      await sessionFile("--search--", "blank-name.jsonl", header(projA), 1_400_000_050, [{ type: "session_info", name: "   " }, user("só o prompt: quokka-unico")]);
      await sessionFile("--search--", "unknown.jsonl", header(histD), 1_400_000_300, [user("autenticacao em projeto desconhecido")]);
      await sessionFile("--search--", "nocwd.jsonl", header(""), 1_400_000_310, [user("autenticacao sem cwd")]);
      await sessionFile("--search--", "broken.jsonl", "{oops", 1_400_000_320);
      for (let index = 0; index < 35; index++) {
        await sessionFile("--bulk--", `bulk-${index}.jsonl`, header(projA), 1_300_000_000 + index, [user(`palavra-em-massa ${index}`)]);
      }
      outsideDir = await mkdtemp(path.join(tmp, "search-outside-"));
      await writeFile(path.join(outsideDir, "leak.jsonl"), [JSON.stringify(header(projA)), JSON.stringify(user("autenticacao vazada"))].join("\n"));
      try {
        await symlink(outsideDir, path.join(sessionsRoot, "--link--"), "junction");
      } catch {
        // Links need privileges on some Windows setups; the path comes from readdir either way.
      }
      await server.refreshSessionIndex();
    });

    test("finds the latest session name in the bounded tail beyond the title scan prefix", async () => {
      const large = path.join(tmp, "large-title-session.jsonl");
      await writeFile(large, `${JSON.stringify({ type: "session", id: "large", cwd: projA })}\n${JSON.stringify(user("inicio"))}\n`);
      const padding = "x".repeat(5 * 1024 * 1024);
      await writeFile(large, (await readFile(large, "utf8")) + `${JSON.stringify(user(padding))}\n${JSON.stringify({ type: "session_info", name: "Título do tail" })}\n${JSON.stringify({ type: "custom" })}\nnull\n`);
      assert.equal((await server.scanSession(large)).title, "Título do tail");
      assert.equal((await server.scanSessionIndexEntry(large)).title, "Título do tail");
      const unnamed = path.join(tmp, "large-unnamed-session.jsonl");
      await writeFile(unnamed, `${JSON.stringify({ type: "session", id: "unnamed", cwd: projA })}\n${"x".repeat(5 * 1024 * 1024)}\n${JSON.stringify({ type: "session_info", name: 42 })}\n`);
      assert.equal((await server.scanSession(unnamed)).title, "Nova conversa");
    });

    test("titles prefer the latest session name over the first prompt, falling back to the prompt", async () => {
      const history = (await getJson(`/api/projects/${alphaId}/history`)).history;
      assert.equal(history.find((item) => item.path === rich).title, "Plano de auth final");
      assert.equal(history.find((item) => item.path.endsWith("blank-name.jsonl")).title, "só o prompt: quokka-unico");
      assert.equal((await server.scanSession(rich, { fallback: "x" })).title, "Plano de auth final");
      // A session written after the last index refresh is titled by a direct scan.
      const fresh = await sessionFile("--search--", "fresh-after-index.jsonl", header(projA, "2031-01-01T00:00:00.000Z"), 1_900_000_000, [{ type: "session_info", name: "Recém-criada" }, user("depois do índice")]);
      const after = (await getJson(`/api/projects/${alphaId}/history`)).history;
      assert.equal(after.find((item) => item.path === fresh).title, "Recém-criada");
      const empty = path.join(tmp, "empty-session.jsonl");
      await writeFile(empty, "");
      assert.deepEqual(await server.scanSession(empty, { fallback: "vazia" }), { title: "vazia", snippet: "" });
    });

    test("GET /api/search matches user and assistant text, ignoring case and accents, with a snippet", async () => {
      const hits = await search("autenticacao");
      assert.deepEqual(hits.map((hit) => hit.sessionPath), [rich]);
      assert.equal(hits[0].projectId, alphaId);
      assert.equal(hits[0].title, "Plano de auth final");
      assert.equal(hits[0].timestamp, "2025-03-01T10:00:00.000Z");
      assert.equal(hits[0].snippet, "Preciso de uma função de AUTENTICAÇÃO segura");
      const viaAssistant = await search("CAFÉ");
      assert.equal(viaAssistant.length, 1);
      assert.equal(viaAssistant[0].sessionPath, accent);
      assert.equal(viaAssistant[0].title, "Nova conversa");
      assert.match(viaAssistant[0].snippet, /Café com leite/);
      assert.equal(new Date(viaAssistant[0].timestamp).getTime() > 0, true);
      assert.deepEqual((await search("quokka")).map((hit) => hit.title), ["só o prompt: quokka-unico"]);
    });

    test("tool results, unknown projects, header-less files and files outside the sessions dir are never searched", async () => {
      for (const needle of ["segredo-tool", "projeto desconhecido", "sem cwd", "vazada"]) assert.deepEqual(await search(needle), [], needle);
    });

    test("empty or one-character queries return nothing; results are capped at 30", async () => {
      for (const query of ["", "a", "  ", " é "]) assert.deepEqual(await search(query), [], JSON.stringify(query));
      assert.deepEqual((await getJson("/api/search")).results, []);
      assert.equal((await search("palavra-em-massa")).length, 30);
    });

    test("index scans remain bounded per file and retain the newest text", async () => {
      const known = new Map([[server.cwdKey(projA), { id: alphaId }]]);
      const dir = path.join(tmp, "bounded-sessions");
      const put = async (name, lines, mtimeSeconds) => {
        await mkdir(path.join(dir, "d"), { recursive: true });
        const file = path.join(dir, "d", name);
        await writeFile(file, lines.map((line) => JSON.stringify(line)).join("\n"));
        await utimes(file, mtimeSeconds, mtimeSeconds);
      };
      await put("early.jsonl", [header(projA), user("zebra no inicio")], 1_000_000_003);
      await put("late.jsonl", [header(projA), { type: "custom", data: "x".repeat(2000) }, user("zebra no fim")], 1_000_000_002);
      await put("third.jsonl", [header(projA), user("zebra terceira")], 1_000_000_001);
      const names = async (options) => (await server.searchSessions(dir, "zebra", { projectsByCwd: known, ...options })).map((hit) => path.basename(hit.sessionPath));
      assert.deepEqual(await names({}), ["early.jsonl", "late.jsonl", "third.jsonl"]);
      const remappedCwd = path.join(tmp, "remapped-project");
      const mappedHeader = { ...header("Z:\\Host\\remote-project"), cwd: "Z:\\Host\\remote-project" };
      await put("mapped.jsonl", [mappedHeader, user("zebra mapped")], 1_000_000_003);
      const mappedProjects = new Map([[server.cwdKey(remappedCwd), { id: "mapped-project" }]]);
      const mapped = await server.searchSessions(dir, "zebra", { projectsByCwd: mappedProjects, pathMap: [["Z:\\Host\\remote-project", remappedCwd]] });
      assert.equal(mapped.some((hit) => path.basename(hit.sessionPath) === "mapped.jsonl"), true);
      assert.deepEqual(await names({ maxFileBytes: 1000 }), ["early.jsonl", "third.jsonl"]);
      assert.deepEqual(await names({ limit: 1 }), ["early.jsonl"]);
      const capped = await server.scanSessionIndexEntry(path.join(dir, "d", "late.jsonl"), { textCap: 8 });
      assert.equal(capped.text.length <= 8, true);
      assert.match(capped.text, /fim$/);

      // The real 5 MB cap: the oversized filler line is cut, so the match behind it is never read.
      const huge = path.join(dir, "d", "huge.jsonl");
      await writeFile(huge, [JSON.stringify(header(projA)), JSON.stringify({ type: "custom", data: "x".repeat(5 * 1024 * 1024 + 10) }), JSON.stringify(user("narval-escondido"))].join("\n"));
      assert.deepEqual(await server.searchSessions(dir, "narval", { projectsByCwd: known }), []);
      const flaky = async (file) => {
        if (file.endsWith("late.jsonl")) throw new Error("vanished");
        return stat(file);
      };
      assert.deepEqual(await names({ statFile: flaky }), ["early.jsonl", "third.jsonl"]);
      assert.deepEqual(await server.searchSessions(path.join(tmp, "no-such-sessions"), "zebra", { projectsByCwd: known }), []);
    });

    test("incremental index coalesces refreshes, skips unchanged files, updates and removes entries", async () => {
      const dir = path.join(tmp, "incremental-sessions");
      const sub = path.join(dir, "project");
      await mkdir(sub, { recursive: true });
      const file = path.join(sub, "one.jsonl");
      await writeFile(file, "first");
      const indexed = [];
      let scans = 0;
      const index = new server.SessionIndex(dir, { scan: async (filePath) => {
        scans++;
        indexed.push(filePath);
        return { filePath, mtimeMs: (await stat(filePath)).mtimeMs, size: (await stat(filePath)).size, cwdKey: server.cwdKey(projA), timestamp: "now", title: "Title", text: "needle" };
      } });
      await Promise.all([index.refresh(), index.refresh()]);
      assert.equal(scans, 1);
      await index.refresh();
      assert.equal(scans, 1);
      await writeFile(file, "changed-content");
      await utimes(file, new Date(), new Date());
      await index.refresh();
      assert.equal(scans, 2);
      await rm(file);
      await index.refresh();
      assert.equal(index.entries.size, 0);

      await writeFile(file, "pending");
      let release;
      const slow = new server.SessionIndex(dir, { scan: async (filePath) => {
        await new Promise((resolve) => { release = resolve; });
        const info = await stat(filePath);
        return { filePath, ...info, cwdKey: server.cwdKey(projA), timestamp: "now", title: "T", text: "needle" };
      } });
      const building = slow.refresh();
      assert.equal(slow.refresh(), building);
      assert.equal(slow.search("needle", new Map()).length, 0);
      assert.equal(slow.indexing, true);
      await waitFor(() => typeof release === "function");
      release();
      await building;
      assert.equal(slow.indexing, false);

      // A file that stops being a valid session (scan -> null) leaves the index.
      let valid = true;
      const shrinking = new server.SessionIndex(dir, { scan: async (filePath) => {
        if (!valid) return null;
        const info = await stat(filePath);
        return { filePath, mtimeMs: info.mtimeMs, size: info.size, cwdKey: "k", timestamp: "now", title: "T", text: "x" };
      } });
      await shrinking.refresh();
      assert.equal(shrinking.entries.size, 1);
      valid = false;
      await writeFile(file, "no longer a session header");
      await shrinking.refresh();
      assert.equal(shrinking.entries.size, 0);

      // A scan that throws (unreadable file) also drops the entry.
      valid = true;
      await writeFile(file, "valid again");
      await shrinking.refresh();
      assert.equal(shrinking.entries.size, 1);
      shrinking.scan = async () => { throw new Error("EACCES"); };
      await writeFile(file, "unreadable now!");
      await shrinking.refresh();
      assert.equal(shrinking.entries.size, 0);
    });

    test("knownProjects reuses the known list and discovers only when it is empty", async () => {
      let discovered = 0;
      const discover = async () => { discovered++; return [{ id: "d" }]; };
      assert.deepEqual(await server.knownProjects(new Map([["a", { id: "a" }]]), discover), [{ id: "a" }]);
      assert.equal(discovered, 0);
      assert.deepEqual(await server.knownProjects(new Map(), discover), [{ id: "d" }]);
      assert.equal(discovered, 1);
    });

    test("search uses the pre-folded text when present and folds on the fly otherwise", () => {
      const index = new server.SessionIndex(path.join(tmp, "unused"));
      const project = { id: "p" };
      const base = { cwdKey: "k", timestamp: "t", title: "T" };
      index.entries.set("a", { ...base, filePath: "a", mtimeMs: 2, text: "Ação rápida", folded: "acao rapida" });
      index.entries.set("b", { ...base, filePath: "b", mtimeMs: 1, text: "Outra AÇÃO" });
      assert.deepEqual(index.search("acao", new Map([["k", project]])).map((hit) => hit.sessionPath), ["a", "b"]);
      // A stale fold that matches but no message does yields no hit.
      index.entries.set("c", { ...base, filePath: "c", mtimeMs: 3, text: "nada aqui", folded: "fantasma" });
      assert.deepEqual(index.search("fantasma", new Map([["k", project]])), []);
    });

    test("indexedTitle reuses the index only for an unchanged file", () => {
      const entry = { mtimeMs: 5, size: 10, title: "Nome salvo" };
      assert.equal(server.indexedTitle(entry, { mtimeMs: 5, size: 10 }), "Nome salvo");
      assert.equal(server.indexedTitle(entry, { mtimeMs: 6, size: 10 }), null);
      assert.equal(server.indexedTitle(entry, { mtimeMs: 5, size: 11 }), null);
      assert.equal(server.indexedTitle(undefined, { mtimeMs: 5, size: 10 }), null);
    });

    test("refreshIfStale refreshes in the background only when stale and idle, and logs failures", async () => {
      const logs = [];
      const log = (...args) => logs.push(args);
      let calls = 0;
      const fake = (overrides) => ({ refreshPromise: null, lastRefresh: 0, refresh: () => { calls++; return Promise.resolve(); }, ...overrides });
      assert.equal(server.refreshIfStale(fake({ refreshPromise: Promise.resolve() }), { now: 1e9, log }), false);
      assert.equal(server.refreshIfStale(fake({ lastRefresh: 1e9 - 1000 }), { now: 1e9, log }), false);
      assert.equal(calls, 0);
      assert.equal(server.refreshIfStale(fake({}), { now: 1e9, log }), true);
      assert.equal(calls, 1);
      assert.equal(server.refreshIfStale(fake({ refresh: () => Promise.reject(new Error("disco")) }), { now: 1e9, log }), true);
      await new Promise((resolve) => setImmediate(resolve));
      assert.deepEqual(logs, [["warn", "Session search index refresh failed", { error: "disco" }]]);
      // Default clock/logger path.
      assert.equal(server.refreshIfStale(fake({ lastRefresh: Date.now() })), false);
    });

    test("GET /api/search needs auth, an allowed origin and GET", async () => {
      const url = `${base}/api/search?q=autenticacao`;
      assert.equal((await fetch(url)).status, 401);
      assert.equal((await fetch(url, { headers: headers({ origin: "https://evil.example" }) })).status, 403);
      assert.equal((await fetch(url, { method: "POST", headers: headers({ "content-type": "application/json" }), body: "{}" })).status, 405);
    });
  });

  describe("project files (@ mentions)", () => {
    const git = (cwd, ...args) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { cwd, stdio: "ignore" });
    const put = async (root, files) => {
      for (const [name, content = "x"] of files.map((file) => (Array.isArray(file) ? file : [file]))) {
        await mkdir(path.dirname(path.join(root, name)), { recursive: true });
        await writeFile(path.join(root, name), content);
      }
    };
    let repo;
    let plain;

    before(async () => {
      repo = path.join(tmp, "files-repo");
      plain = path.join(tmp, "files-plain");
      await mkdir(repo, { recursive: true });
      await put(repo, ["README.md", "src/app.js", "src/lib/util.js", [".gitignore", "ignored.txt\n"]]);
      git(repo, "init", "-q");
      git(repo, "add", "-A");
      git(repo, "commit", "-qm", "init");
      await put(repo, ["src/new file.js", "ignored.txt"]);
      await put(plain, ["a.txt", ".env", "src/deep/er/f.js", ".hidden/x.txt", "node_modules/m/index.js", "build/b.js", "dist/d.js", ".next/n.js", "coverage/c.js", ".git/config"]);
    });

    test("gitListFiles lists tracked + untracked files without ignored ones; failures resolve null", async () => {
      assert.deepEqual((await server.gitListFiles(repo)).sort(), [".gitignore", "README.md", "src/app.js", "src/lib/util.js", "src/new file.js"]);
      assert.equal(await server.gitListFiles(repo, { bin: path.join(tmp, "no-such-git") }), null);
    });

    test("walkProjectFiles is breadth-first, skips build/dot dirs, honors the entry limit and ignores links", async () => {
      assert.deepEqual((await server.walkProjectFiles(plain)).sort(), [".env", "a.txt", "src/deep/er/f.js"]);
      const limited = await server.walkProjectFiles(plain, 1);
      assert.equal(limited.length, 1);
      assert.ok([".env", "a.txt"].includes(limited[0]));
      assert.deepEqual(await server.walkProjectFiles(path.join(tmp, "files-missing")), []);
      const outside = path.join(tmp, "files-outside");
      await put(outside, ["secret.txt"]);
      try {
        await symlink(outside, path.join(plain, "link"), "junction");
        await symlink(path.join(outside, "secret.txt"), path.join(plain, "secret-link.txt"), "file");
      } catch {
        // Links need privileges on some Windows setups; the rest of the test still holds.
      }
      assert.deepEqual((await server.walkProjectFiles(plain)).filter((file) => file.includes("secret")), []);
    });

    test("listProjectFiles keeps only paths inside the project, dedupes, caps the list and caches for 10 s", async () => {
      const calls = [];
      const lister = (files) => async (cwd) => {
        calls.push(cwd);
        return files;
      };
      const dir = path.join(tmp, "files-cache");
      const dirty = ["ok/a.js", "ok/a.js", "../evil.js", "/etc/passwd", "C:\\win.txt", "C:rel.txt", "a/../../b.js", "..\\back.js", "a/../kept.js", "ok/b..c/d.js"];
      const first = await server.listProjectFiles(dir, { git: lister(dirty), now: 1000 });
      assert.deepEqual(first, ["ok/a.js", "a/../kept.js", "ok/b..c/d.js"]);
      assert.equal(await server.listProjectFiles(dir, { git: lister(["other.js"]), now: 10_999 }), first);
      assert.equal(calls.length, 1);
      assert.deepEqual(await server.listProjectFiles(dir, { git: lister(["other.js"]), now: 11_000 }), ["other.js"]);
      assert.equal(calls.length, 2);

      // Not a git repository (git resolves null): falls back to the bounded walk.
      assert.deepEqual((await server.listProjectFiles(plain, { git: async () => null, now: 5 })).sort(), [".env", "a.txt", "src/deep/er/f.js"]);
      const huge = await server.listProjectFiles(path.join(tmp, "files-huge"), { git: async () => Array.from({ length: 100_005 }, (_, i) => `f/${i}.js`), now: 5 });
      assert.equal(huge.length, 100_000);
    });

    test("GET /files ranks git files by query, returns at most 50, and needs auth + a known project", async () => {
      const { projects } = await getJson("/api/projects");
      const id = projects.find((item) => item.cwd === projA).id;
      for (const file of ["src/app.js", "docs/app-notes.md", "src/lib/happy.js", "README.md"]) {
        await mkdir(path.dirname(path.join(projA, file)), { recursive: true });
        await writeFile(path.join(projA, file), "x");
      }
      git(projA, "init", "-q");
      git(projA, "add", "-A");
      git(projA, "commit", "-qm", "init");
      const files = async (query) => (await getJson(`/api/projects/${id}/files${query}`)).files;
      assert.deepEqual(await files("?q=app"), ["src/app.js", "docs/app-notes.md", "src/lib/happy.js"]);
      assert.deepEqual(await files("?q=readme"), ["README.md"]);
      assert.deepEqual(await files("?q=%2E%2E%2F%2E%2E%2Fetc%2Fpasswd"), []);
      assert.ok((await files("")).includes("package.json"));

      // 60 files in a non-git project: capped at 50 (git may or may not see a parent repo; the files are untracked either way).
      const gamma = projects.find((item) => item.cwd === projC).id;
      for (let index = 0; index < 60; index++) await writeFile(path.join(projC, `bulk-${String(index).padStart(2, "0")}.txt`), "x");
      const bulk = (await getJson(`/api/projects/${gamma}/files?q=bulk`)).files;
      assert.equal(bulk.length, 50);
      assert.equal(bulk[0], "bulk-00.txt");

      const url = `${base}/api/projects/${id}/files?q=app`;
      assert.equal((await fetch(url)).status, 401);
      assert.equal((await fetch(url, { headers: headers({ origin: "https://evil.example" }) })).status, 403);
      assert.equal((await fetch(`${base}/api/projects/nope/files`, { headers: headers() })).status, 404);
      assert.equal((await fetch(url, { method: "POST", headers: headers({ "content-type": "application/json" }), body: "{}" })).status, 405);
    });
  });
});

describe("conversation states", () => {
  const ghost = path.join(tmp, "states-ghost-project");
  const msg = (role, extra = {}) => ({ type: "message", id: `m-${Math.random()}`, message: { role, content: [{ type: "text", text: "x" }], ...extra } });
  const custom = (name = "loop-state") => ({ type: "custom", customType: name, data: {} });
  const header = (cwd, extra = {}) => ({ type: "session", id: "s", timestamp: "2025-01-01T00:00:00.000Z", cwd, ...extra });
  let seq = 0;
  const stateFile = (lines, { ghostCwd = ghost, extraHeader = {}, mtime = 1_900_000_000 } = {}) =>
    sessionFile("--states--", `st-${seq++}.jsonl`, header(ghostCwd, extraHeader), mtime, lines);

  test("history items flag the files the Studio's own PIs had open (live now or switched away from), and only those", async () => {
    const mine = path.join(tmp, "studio-owned-project");
    const own = (text) => stateFile([msg("user"), msg("assistant", { stopReason: "stop" })], { ghostCwd: mine, extraHeader: { timestamp: text } });
    const [current, before, foreign, lonely] = await Promise.all([own("2025-02-04T00:00:00.000Z"), own("2025-02-03T00:00:00.000Z"), own("2025-02-02T00:00:00.000Z"), own("2025-02-01T00:00:00.000Z")]);
    const pi = new server.PiRpcSession({ projectId: "owned", projectName: "owned", cwd: mine });
    const getState = (sessionFile, extra = {}) => pi.handleStdoutLine(JSON.stringify({ type: "response", command: "get_state", success: true, data: { sessionFile }, ...extra }));
    const flags = async () => Object.fromEntries((await server.listProjectHistory({ id: "owned", cwd: mine }, { now: 1_900_000_010_000 })).map((item) => [path.basename(item.path), item.studioOwned]));
    const names = [current, before, foreign, lonely].map((file) => path.basename(file));
    assert.deepEqual(Object.values(await flags()), [false, false, false, false]);
    getState(before);
    getState(current); // switched away from `before`: it stays flagged
    pi.handleStdoutLine(JSON.stringify({ type: "response", command: "get_state", success: false, data: { sessionFile: foreign } }));
    pi.handleStdoutLine(JSON.stringify({ type: "response", command: "get_state", success: true, data: {} }));
    pi.handleStdoutLine(JSON.stringify({ type: "response", command: "get_state", success: true }));
    assert.deepEqual(await flags(), { [names[0]]: true, [names[1]]: true, [names[2]]: false, [names[3]]: false });
  });

  test("classifySessionState: every rule of the table", () => {
    const now = 10_000_000;
    const old = now - 91_000;
    const fresh = now - 90_000;
    const assistant = (stopReason) => ({ role: "assistant", stopReason });
    assert.equal(server.classifySessionState(null, now, now), "nova");
    assert.equal(server.classifySessionState(assistant("stop"), old, now), "pronto");
    assert.equal(server.classifySessionState(assistant("length"), old, now), "pronto");
    assert.equal(server.classifySessionState(assistant("aborted"), fresh, now), "parado");
    assert.equal(server.classifySessionState(assistant("error"), fresh, now), "erro");
    assert.equal(server.classifySessionState(assistant("toolUse"), fresh, now), "fazendo");
    assert.equal(server.classifySessionState(assistant("toolUse"), old, now), "parado");
    assert.equal(server.classifySessionState(assistant(undefined), fresh, now), "fazendo");
    for (const role of ["toolResult", "user", "unknown", "bashExecution"]) {
      assert.equal(server.classifySessionState({ role }, fresh, now), "fazendo", `${role} recent`);
      assert.equal(server.classifySessionState({ role }, old, now), "parado", `${role} old`);
    }
    assert.equal(server.classifySessionState({ role: "user" }, Date.now()), "fazendo", "default now");
  });

  test("readLastMessage: last message wins; trailing custom entries, a partial last line and empty files are handled", async () => {
    const read = async (file) => server.readLastMessage(file, (await stat(file)).size);
    const done = await stateFile([msg("user"), msg("assistant", { stopReason: "stop" }), custom(), { type: "session_info", name: "x" }, custom("loop-state")]);
    assert.equal((await read(done)).stopReason, "stop");
    const tool = await stateFile([msg("assistant", { stopReason: "stop" }), msg("user"), msg("assistant", { stopReason: "toolUse" }), custom()]);
    assert.equal((await read(tool)).stopReason, "toolUse");
    // The last line is cut mid-write (no newline, invalid JSON): the previous message decides.
    const partial = path.join(sessionsRoot, "--states--", "partial.jsonl");
    await writeFile(partial, `${JSON.stringify(header(ghost))}\n${JSON.stringify(msg("user"))}\n{"type":"message","message":{"role":"assis`);
    assert.equal((await read(partial)).role, "user");
    // Blank lines and CRLF are tolerated.
    const crlf = path.join(sessionsRoot, "--states--", "crlf.jsonl");
    await writeFile(crlf, `${JSON.stringify(header(ghost))}\r\n${JSON.stringify(msg("assistant", { stopReason: "error" }))}\r\n\r\n`);
    assert.equal((await read(crlf)).stopReason, "error");
    // No message at all (header only, or an empty file): null.
    assert.equal(await read(await stateFile([custom()])), null);
    const empty = path.join(sessionsRoot, "--states--", "empty.jsonl");
    await writeFile(empty, "");
    assert.equal(await server.readLastMessage(empty, 0), null);
    // A message entry whose payload is not an object is not a message.
    assert.equal(await read(await stateFile([{ type: "message", message: "text" }])), null);
  });

  test("readLastMessage: huge files read only the tail window, widening once before giving up", async () => {
    const filler = (count) => Array.from({ length: count }, () => ({ type: "custom", customType: "pad", data: "p".repeat(900) }));
    const read = async (file) => server.readLastMessage(file, (await stat(file)).size);
    // ~3 MB: the message sits ~100 KB from the end (outside 64 KiB, inside 512 KiB), the window starts mid-line.
    const widened = await stateFile([...filler(2500), msg("assistant", { stopReason: "stop" }), ...filler(110)]);
    assert.ok((await stat(widened)).size > 2_000_000);
    assert.equal((await read(widened)).stopReason, "stop");
    // Message within the first window of a huge file.
    const near = await stateFile([...filler(2500), msg("assistant", { stopReason: "aborted" }), ...filler(5)]);
    assert.equal((await read(near)).stopReason, "aborted");
    // Only padding in the last 512 KiB: content exists, so the state is unknown rather than "nova".
    const buried = await stateFile([msg("user"), ...filler(700)]);
    assert.ok((await stat(buried)).size > 600_000);
    assert.deepEqual(await read(buried), { role: "unknown" });
    // One giant final line (bigger than the widest window), e.g. a huge tool result.
    const giant = await stateFile([msg("user"), { type: "message", message: { role: "toolResult", content: "z".repeat(700_000) } }]);
    assert.deepEqual(await read(giant), { role: "unknown" });
    // Medium file (> 64 KiB, < 512 KiB) without any message: whole file read, then null.
    const mediumPad = await stateFile(filler(150));
    assert.ok((await stat(mediumPad)).size > 100_000 && (await stat(mediumPad)).size < 500_000);
    assert.equal(await read(mediumPad), null);
  });

  test("sessionHeader reads each file's first line once, retries unparsable ones and stays bounded", async () => {
    const cache = new Map();
    const reads = [];
    const read = async (file) => { reads.push(file); return file === "partial" ? "{\"type\":\"sess" : JSON.stringify({ type: "session", id: file }); };
    const statFile = async () => ({ ino: 1, birthtimeMs: 1, size: 100 });
    assert.equal((await server.sessionHeader("a", { read, cache, max: 2, statFile })).id, "a");
    assert.equal((await server.sessionHeader("a", { read, cache, max: 2, statFile })).id, "a");
    assert.deepEqual(reads, ["a"]);
    // A file still being written (partial first line) is not cached, so the next call retries it.
    await assert.rejects(server.sessionHeader("partial", { read, cache, max: 2, statFile }));
    await assert.rejects(server.sessionHeader("partial", { read, cache, max: 2, statFile }));
    assert.equal(reads.filter((file) => file === "partial").length, 2);
    await server.sessionHeader("b", { read, cache, max: 2, statFile });
    assert.equal(cache.size, 2);
    // At the bound the cache restarts instead of growing without limit.
    await server.sessionHeader("c", { read, cache, max: 2, statFile });
    assert.deepEqual([...cache.keys()], ["c"]);
  });

  test("readLastMessage closes the file handle even when reading fails", async () => {
    let closed = 0;
    const openFile = async () => ({ read: async () => { throw new Error("EIO"); }, close: async () => { closed++; } });
    await assert.rejects(server.readLastMessage("whatever", 10, { openFile }), /EIO/);
    assert.equal(closed, 1);
  });

  test("SessionStateReader: cached per (path, mtime, size), bounded", async () => {
    let reads = 0;
    const reader = new server.SessionStateReader({ read: async (file, size) => { reads++; return { role: "user", size }; }, maxEntries: 2 });
    const info = { mtimeMs: 1, size: 10 };
    assert.deepEqual(await reader.lastMessage("a", info), { role: "user", size: 10 });
    await reader.lastMessage("a", info);
    assert.equal(reads, 1, "cache hit");
    await reader.lastMessage("a", { mtimeMs: 2, size: 10 });
    assert.equal(reads, 2, "mtime changed");
    await reader.lastMessage("a", { mtimeMs: 2, size: 11 });
    assert.equal(reads, 3, "size changed");
    await reader.lastMessage("b", info);
    assert.equal(reader.cache.size, 2);
    await reader.lastMessage("c", info);
    assert.equal(reader.cache.size, 1, "full cache is dropped, never grows past its bound");
    const defaults = new server.SessionStateReader();
    assert.equal(defaults.maxEntries, 2000);
    assert.equal(typeof defaults.read, "function");
  });

  test("applyLiveState: the live PI overrides the file only where it knows better", () => {
    assert.equal(server.applyLiveState("pronto", null), "pronto");
    assert.equal(server.applyLiveState("parado", undefined), "parado");
    assert.equal(server.applyLiveState("pronto", { streaming: true }), "fazendo");
    assert.equal(server.applyLiveState("pronto", { waitingUi: true, streaming: true }), "aguardando");
    assert.equal(server.applyLiveState("fazendo", { streaming: false }), "fazendo");
    assert.equal(server.applyLiveState("pronto", { streaming: false }), "pronto");
    assert.equal(server.applyLiveState("fazendo", { exited: true, streaming: false }), "parado");
    assert.equal(server.applyLiveState("pronto", { exited: true }), "pronto");
    assert.equal(server.applyLiveState("erro", { exited: true, waitingUi: true }), "erro");
  });

  test("history items carry state, isSubagent, parentSession and lastActivity; the file tail is read once per change", async () => {
    const parent = path.join(sessionsRoot, "--states--", "parent.jsonl");
    const doneFile = await stateFile([msg("user"), msg("assistant", { stopReason: "stop" })], { mtime: 1_900_000_100 });
    const subFile = await stateFile([msg("user"), msg("assistant", { stopReason: "toolUse" })], { extraHeader: { id: "sub", timestamp: "2025-01-02T00:00:00.000Z", parentSession: parent }, mtime: 1_900_000_200 });
    const errFile = await stateFile([msg("assistant", { stopReason: "error" })], { extraHeader: { timestamp: "2025-01-03T00:00:00.000Z" }, mtime: 1_900_000_300 });
    const newFile = await stateFile([custom()], { extraHeader: { timestamp: "2025-01-04T00:00:00.000Z" } });
    const reads = [];
    const states = new server.SessionStateReader({ read: async (file, size) => { reads.push(file); return server.readLastMessage(file, size); } });
    const project = { id: "ghost", cwd: ghost };
    // "now" 10 s after the sub-PI's last write: still running.
    const items = await server.listProjectHistory(project, { states, now: 1_900_000_210_000 });
    const byPath = new Map(items.map((item) => [item.path, item]));
    assert.equal(byPath.get(doneFile).state, "pronto");
    assert.equal(byPath.get(subFile).state, "fazendo");
    assert.equal(byPath.get(errFile).state, "erro");
    assert.equal(byPath.get(newFile).state, "nova");
    assert.deepEqual([byPath.get(doneFile).isSubagent, byPath.get(doneFile).parentSession], [false, null]);
    assert.deepEqual([byPath.get(subFile).isSubagent, byPath.get(subFile).parentSession], [true, parent]);
    assert.equal(byPath.get(subFile).lastActivity, new Date(1_900_000_200_000).toISOString());
    assert.equal(byPath.get(subFile).fileStat, undefined, "internal stat is not leaked");
    const firstReads = reads.length;
    assert.ok(firstReads >= 4);
    await server.listProjectHistory(project, { states, now: 1_900_000_210_000 });
    assert.equal(reads.length, firstReads, "second listing is served from the cache");
    // Same file, 10 minutes later: an in-flight run is now an interrupted one.
    const later = await server.listProjectHistory(project, { states, now: 1_900_000_800_000 });
    assert.equal(later.find((item) => item.path === subFile).state, "parado");
    assert.equal(reads.length, firstReads);
    // A write invalidates the cache entry.
    await writeFile(doneFile, `${JSON.stringify(header(ghost))}\n${JSON.stringify(msg("user"))}\n`);
    const changed = await server.listProjectHistory(project, { states, now: Date.now() });
    assert.equal(changed.find((item) => item.path === doneFile).state, "fazendo");
    assert.equal(reads.length, firstReads + 1);
  });

  test("history: an unreadable tail yields state nova instead of failing the list; only the newest 50 are read", async () => {
    const failing = new server.SessionStateReader({ read: async () => { throw new Error("EACCES"); } });
    const items = await server.listProjectHistory({ id: "ghost", cwd: ghost }, { states: failing });
    assert.ok(items.length > 0 && items.every((item) => item.state === "nova"));
    const crowded = path.join(tmp, "states-crowded-project");
    for (let index = 0; index < 55; index++) await sessionFile("--crowded--", `c-${index}.jsonl`, header(crowded, { timestamp: new Date(1_800_000_000_000 + index * 1000).toISOString() }), 1_900_000_000 + index, [msg("assistant", { stopReason: "stop" })]);
    let reads = 0;
    const counting = new server.SessionStateReader({ read: async (file, size) => { reads++; return server.readLastMessage(file, size); } });
    const listed = await server.listProjectHistory({ id: "crowded", cwd: crowded }, { states: counting });
    assert.equal(listed.length, 50);
    assert.equal(reads, 50);
    assert.ok(listed.every((item) => item.state === "pronto"));
    assert.equal((await server.listProjectHistory({ id: "none", cwd: path.join(tmp, "states-nobody") })).length, 0);
  });

  test("history: sub-PIs never crowd main conversations out (separate caps of 50 each, newest first)", async () => {
    const busy = path.join(tmp, "states-busy-project");
    const at = (index) => new Date(1_800_000_000_000 + index * 1000).toISOString();
    // Two old main conversations, then 60 newer sub-PIs (their parent is the second main one).
    for (let index = 0; index < 2; index++) await sessionFile("--busy--", `main-${index}.jsonl`, header(busy, { id: `main-${index}`, timestamp: at(index) }), 1_900_000_000 + index, [msg("assistant", { stopReason: "stop" })]);
    for (let index = 0; index < 60; index++) await sessionFile("--busy--", `sub-${index}.jsonl`, header(busy, { id: `sub-${index}`, parentSession: "main-1.jsonl", timestamp: at(100 + index) }), 1_900_000_100 + index, [msg("assistant", { stopReason: "stop" })]);
    const listed = await server.listProjectHistory({ id: "busy", cwd: busy });
    assert.deepEqual(listed.filter((item) => !item.isSubagent).map((item) => item.sessionId), ["main-1", "main-0"]);
    const subs = listed.filter((item) => item.isSubagent);
    assert.equal(subs.length, 50);
    assert.equal(subs[0].sessionId, "sub-59");
    assert.equal(listed.length, 52);
    assert.ok(listed.every((item, index) => index === 0 || String(listed[index - 1].timestamp) >= String(item.timestamp)), "newest first");
  });

  describe("live PI of the open project", () => {
    let listening;
    let base;
    let token;
    let projectId;
    let liveFile;
    const headers = (extra = {}) => ({ "x-pi-studio-token": token, ...extra });
    const get = async (pathname) => (await fetch(`${base}${pathname}`, { headers: headers() })).json();
    const post = async (pathname, body) => {
      const res = await fetch(`${base}${pathname}`, { method: "POST", headers: headers({ "content-type": "application/json" }), body: JSON.stringify(body) });
      return { status: res.status, data: await res.json() };
    };
    const liveState = async () => (await get(`/api/projects/${projectId}/history`)).history.find((item) => item.path === liveFile)?.state;
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    before(async () => {
      liveFile = await stateFile([msg("user"), msg("assistant", { stopReason: "stop" })], { ghostCwd: projC });
      listening = await server.startServer(0);
      base = `http://127.0.0.1:${listening.address().port}`;
      const page = await fetch(`${base}/`);
      token = (await page.text()).match(/name="pi-studio-token" content="([a-f0-9]+)"/)[1];
      projectId = (await get("/api/projects")).projects.find((item) => item.cwd === projC).id;
    });

    after(async () => {
      await server.stopServer();
    });

    test("open returns history with states; the switched-to file takes the live PI's state", async () => {
      const opened = await post(`/api/projects/${projectId}/open`, {});
      assert.equal(opened.status, 201);
      const entry = opened.data.history.find((item) => item.path === liveFile);
      assert.deepEqual([entry.state, entry.isSubagent], ["pronto", false]);
      // Point the fake PI at the file and let the server learn it through get_state.
      await post(`/api/projects/${projectId}/command`, { id: "sw", type: "switch_session", sessionPath: liveFile });
      await post(`/api/projects/${projectId}/command`, { id: "gs", type: "get_state" });
      await sleep(300);
      assert.equal(await liveState(), "pronto", "idle live PI keeps the file state");
    });

    test("streaming -> fazendo, pending dialog -> aguardando, settled -> pronto, exited mid-run -> parado", async () => {
      await post(`/api/projects/${projectId}/command`, { id: "p-ui", type: "prompt", message: "ui" });
      let waiting = "";
      for (let attempt = 0; attempt < 100 && waiting !== "aguardando"; attempt++) {
        waiting = await liveState();
        if (waiting !== "aguardando") await sleep(50);
      }
      assert.equal(waiting, "aguardando");
      await post(`/api/projects/${projectId}/ui-response`, { id: "fake-ui-1", value: "Permitir" });
      let settled = "";
      for (let attempt = 0; attempt < 200 && settled !== "pronto"; attempt++) {
        settled = await liveState();
        if (settled !== "pronto") await sleep(50);
      }
      assert.equal(settled, "pronto");

      await post(`/api/projects/${projectId}/command`, { id: "p-run", type: "prompt", message: "demo" });
      let running = "";
      for (let attempt = 0; attempt < 100 && running !== "fazendo"; attempt++) {
        running = await liveState();
        if (running !== "fazendo") await sleep(30);
      }
      assert.equal(running, "fazendo");
      // The file also says the run is in flight; the PI dies: interrupted.
      await writeFile(liveFile, `${JSON.stringify(header(projC))}\n${JSON.stringify(msg("user"))}\n`);
      await post(`/api/projects/${projectId}/command`, { id: "x1", type: "test_exit", code: 0 });
      let exited = "";
      for (let attempt = 0; attempt < 100 && exited !== "parado"; attempt++) {
        exited = await liveState();
        if (exited !== "parado") await sleep(50);
      }
      assert.equal(exited, "parado");
    });
  });
});

describe("navegador: project files and the capability route", () => {
  const siteDir = path.join(rootsDir, "sitebrowser");
  const outsideDir = path.join(rootsDir, "sitebrowser-outside");
  const linkedRoot = path.join(rootsDir, "sitebrowser-link");
  const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
  let listening;
  let base;
  let port;
  let token;
  let project;
  let linked;
  let escapeLink;
  let raw;
  const headers = (extra = {}) => ({ "x-pi-studio-token": token, ...extra });
  const api = (pathname, extra = {}) => fetch(`${base}${pathname}`, { headers: headers(extra) });
  const file = (query, extra) => api(`/api/projects/${project.id}/file?${query}`, extra);
  // fetch() would normalise "/../"; this sends the request line exactly as given.
  const exact = (pathname, { method = "GET", extra = {} } = {}) => new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path: pathname, method, headers: extra }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on("error", reject);
    req.end();
  });

  before(async () => {
    for (const dir of [path.join(siteDir, "sub"), outsideDir]) await mkdir(dir, { recursive: true });
    await writeFile(path.join(siteDir, "package.json"), "{}");
    await writeFile(path.join(siteDir, "index.html"), '<link rel="stylesheet" href="style.css"><script src="sub/app.js"></script><h1>oi</h1>');
    await writeFile(path.join(siteDir, "style.css"), "h1{color:red}");
    await writeFile(path.join(siteDir, "sub", "app.js"), "document.title='x'");
    await writeFile(path.join(siteDir, "sub", "ola mundo.txt"), "com espaço");
    await writeFile(path.join(siteDir, "pic.png"), PNG);
    await writeFile(path.join(siteDir, "notes.md"), "# Notas");
    await writeFile(path.join(siteDir, "doc.pdf"), "%PDF-1.4\n");
    await writeFile(path.join(siteDir, "data.bin"), "0123456789");
    await writeFile(path.join(siteDir, "empty.txt"), "");
    await writeFile(path.join(siteDir, "~tilde.txt"), "til");
    const big = await openFile(path.join(siteDir, "big.bin"), "w");
    await big.truncate(21 * 1024 * 1024);
    await big.close();
    await writeFile(path.join(outsideDir, "secret.txt"), "TOP-SECRET");
    // Junctions need no privilege on Windows (a plain symlink on POSIX): a link inside the project that leads out of it.
    await symlink(outsideDir, path.join(siteDir, "escape"), "junction");
    await symlink(siteDir, linkedRoot, "junction");
    try {
      await symlink(path.join(outsideDir, "secret.txt"), path.join(siteDir, "secret-link.txt"), "file");
      escapeLink = true;
    } catch {
      escapeLink = false; // creating file symlinks needs a privilege on Windows
    }
    listening = await server.startServer(0);
    port = listening.address().port;
    base = `http://127.0.0.1:${port}`;
    const page = await fetch(`${base}/`);
    token = (await page.text()).match(/name="pi-studio-token" content="([a-f0-9]+)"/)[1];
    const openProject = async (cwd) => (await (await fetch(`${base}/api/projects/open-path`, { method: "POST", headers: headers({ "content-type": "application/json" }), body: JSON.stringify({ cwd }) })).json()).project;
    project = await openProject(siteDir);
    linked = await openProject(linkedRoot);
    raw = (await (await file("path=index.html&info=1")).json()).raw.replace(/index\.html$/, "");
  });

  after(async () => {
    await server.stopServer();
  });

  test("auth: token, Host and Origin are enforced like the other routes", async () => {
    const url = `${base}/api/projects/${project.id}/file?path=notes.md`;
    assert.equal((await fetch(url)).status, 401);
    assert.equal((await fetch(url, { headers: { "x-pi-studio-token": "0".repeat(64) } })).status, 401);
    assert.equal((await fetch(url, { headers: headers({ origin: "https://evil.example" }) })).status, 403);
    assert.equal((await fetch(url, { headers: headers({ origin: "null" }) })).status, 403);
    assert.equal((await fetch(url, { headers: headers({ origin: base }) })).status, 200);
    assert.equal((await exact(`/api/projects/${project.id}/file?path=notes.md`, { extra: { ...headers(), host: "evil.example" } })).status, 403);
    assert.equal((await fetch(url, { method: "POST", headers: headers() })).status, 405);
  });

  test("info describes the file and hands out a capability URL; bad input fails cleanly", async () => {
    const info = await (await file("path=sub%2Fapp.js&info=1")).json();
    assert.deepEqual({ ...info, mtimeMs: typeof info.mtimeMs, raw: undefined }, { path: "sub/app.js", name: "app.js", size: 18, mtimeMs: "number", kind: "text", mime: "text/javascript; charset=utf-8", raw: undefined });
    assert.match(info.raw, new RegExp(`^/api/projects/${project.id}/raw/[0-9a-f]{32}/sub/app\\.js$`));
    const spaced = await (await file(`path=${encodeURIComponent("sub/ola mundo.txt")}&info=1`)).json();
    assert.ok(spaced.raw.endsWith("/sub/ola%20mundo.txt"));
    assert.equal((await file("info=1")).status, 400);
    assert.equal((await file("path=")).status, 400);
    assert.equal((await file("path=a%00b")).status, 400);
    assert.equal((await api("/api/projects/nope/file?path=a")).status, 404);
  });

  test("the file route streams bytes with the right type and the hardening headers", async () => {
    const png = await file("path=pic.png");
    assert.equal(png.status, 200);
    assert.equal(png.headers.get("content-type"), "image/png");
    assert.equal(png.headers.get("x-content-type-options"), "nosniff");
    assert.equal(png.headers.get("content-security-policy"), "sandbox");
    assert.equal(png.headers.get("referrer-policy"), "no-referrer");
    assert.deepEqual(Buffer.from(await png.arrayBuffer()), PNG);
    const html = await file("path=index.html");
    assert.equal(html.headers.get("content-type"), "text/html; charset=utf-8");
    assert.equal(html.headers.get("content-security-policy"), "sandbox", "only the capability route lets a page run scripts");
    assert.equal(await (await file("path=notes.md")).text(), "# Notas");
    assert.equal(await (await file("path=~tilde.txt")).text(), "til", "only ~ and ~/ expand to the home folder");
    assert.equal((await file("path=data.bin")).headers.get("content-type"), "application/octet-stream");
    assert.equal((await file("path=doc.pdf")).headers.get("content-type"), "application/pdf");
    const empty = await file("path=empty.txt");
    assert.deepEqual([empty.status, empty.headers.get("content-length"), await empty.text()], [200, "0", ""]);
  });

  test("absolute paths inside the project (also through a linked project root) and ./relative paths resolve", async () => {
    assert.equal(await (await file(`path=${encodeURIComponent(path.join(siteDir, "notes.md"))}`)).text(), "# Notas");
    assert.equal(await (await file("path=.%2Fsub%2F..%2Fnotes.md")).text(), "# Notas");
    assert.equal((await file("path=notes.md%3A12")).status, 404, "the :line suffix is the client's business");
    const viaLink = await api(`/api/projects/${linked.id}/file?path=${encodeURIComponent(path.join(linkedRoot, "notes.md"))}`);
    assert.equal(await viaLink.text(), "# Notas");
    const info = await (await api(`/api/projects/${linked.id}/file?path=notes.md&info=1`)).json();
    assert.equal(info.path, "notes.md");
  });

  test("anything outside the project root is 403: .., encoded dots, absolute paths, ~, junctions and file symlinks", async () => {
    const outside = encodeURIComponent(path.join(outsideDir, "secret.txt"));
    const wanted = ["../sitebrowser-outside/secret.txt", "..%2Fsitebrowser-outside%2Fsecret.txt", "%2e%2e/sitebrowser-outside/secret.txt", "sub/../../sitebrowser-outside/secret.txt", "..%5Csitebrowser-outside%5Csecret.txt", outside, "~", "~%2Fsecret.txt", "~%5Csecret.txt", "escape%2Fsecret.txt", "escape%5Csecret.txt", "escape", "%2F", "Z%3A%5Celsewhere%5Cx.txt"];
    for (const query of wanted) {
      for (const suffix of ["", "&info=1"]) {
        const res = await file(`path=${query}${suffix}`);
        assert.equal(res.status, 403, query);
        assert.doesNotMatch(await res.text(), /TOP-SECRET/);
      }
    }
    if (escapeLink) assert.equal((await file("path=secret-link.txt")).status, 403);
  });

  test("missing, directory and oversized targets", async () => {
    assert.equal((await file("path=nope.txt")).status, 404);
    assert.equal((await file("path=sub")).status, 404);
    const big = await file("path=big.bin");
    assert.equal(big.status, 413);
    assert.match((await big.json()).error, /too large \(21\.0 MB; limit 20\.0 MB\)/);
    assert.equal((await file("path=big.bin&info=1")).status, 413);
    assert.equal((await exact(`${raw}big.bin`)).status, 413);
  });

  test("Range requests: partial, open-ended, suffix, unsatisfiable, malformed and multi", async () => {
    const ranged = async (value) => {
      const res = await file("path=data.bin", { range: value });
      return { status: res.status, range: res.headers.get("content-range"), length: res.headers.get("content-length"), body: await res.text() };
    };
    assert.deepEqual(await ranged("bytes=2-4"), { status: 206, range: "bytes 2-4/10", length: "3", body: "234" });
    assert.deepEqual(await ranged("bytes=7-"), { status: 206, range: "bytes 7-9/10", length: "3", body: "789" });
    assert.deepEqual(await ranged("bytes=-3"), { status: 206, range: "bytes 7-9/10", length: "3", body: "789" });
    assert.deepEqual(await ranged("bytes=5-999"), { status: 206, range: "bytes 5-9/10", length: "5", body: "56789" });
    assert.deepEqual(await ranged("bytes=-99"), { status: 206, range: "bytes 0-9/10", length: "10", body: "0123456789" });
    assert.deepEqual(await ranged("bytes=10-"), { status: 416, range: "bytes */10", length: "0", body: "" });
    assert.equal((await ranged("bytes=-0")).status, 416);
    assert.equal((await ranged("bytes=5-2")).status, 416);
    for (const ignored of ["bytes=-", "items=1-2", "bytes=1-2,4-5", "garbage"]) {
      const result = await ranged(ignored);
      assert.deepEqual([result.status, result.body], [200, "0123456789"], ignored);
    }
    assert.equal((await file("path=empty.txt", { range: "bytes=0-" })).status, 200);
    assert.deepEqual([server.parseByteRange(undefined, 5), server.parseByteRange("bytes=9-", 5), server.parseByteRange("bytes=1-2", 5)], [null, "unsatisfiable", { start: 1, end: 2 }]);
  });

  test("capability route: no token needed, relative assets resolve, HTML may run scripts only here (sandboxed)", async () => {
    const page = await exact(`${raw}index.html`);
    assert.equal(page.status, 200);
    assert.equal(page.headers["content-type"], "text/html; charset=utf-8");
    assert.equal(page.headers["content-security-policy"], "sandbox allow-scripts allow-forms");
    assert.equal(page.headers["x-content-type-options"], "nosniff");
    assert.equal(page.headers["referrer-policy"], "no-referrer");
    assert.match(page.body.toString(), /<h1>oi<\/h1>/);
    // What the browser does with the page's relative URLs:
    const pageUrl = new URL(`${raw}index.html`, base);
    const css = await exact(new URL("style.css", pageUrl).pathname);
    assert.deepEqual([css.status, css.headers["content-type"], css.headers["content-security-policy"], css.body.toString()], [200, "text/css; charset=utf-8", "sandbox", "h1{color:red}"]);
    const script = await exact(new URL("sub/app.js", pageUrl).pathname);
    assert.deepEqual([script.status, script.headers["content-type"]], [200, "text/javascript; charset=utf-8"]);
    assert.equal((await exact(`${raw}sub/ola%20mundo.txt`)).body.toString(), "com espaço");
    assert.equal((await exact(`${raw}~tilde.txt`)).body.toString(), "til");
    const partial = await exact(`${raw}data.bin`, { extra: { range: "bytes=1-2" } });
    assert.deepEqual([partial.status, partial.body.toString()], [206, "12"]);
    // Subresources of an opaque-origin page may carry `Origin: null`; real foreign origins stay out.
    assert.equal((await exact(`${raw}style.css`, { extra: { origin: "null" } })).status, 200);
    assert.equal((await exact(`${raw}style.css`, { extra: { origin: "https://evil.example" } })).status, 403);
    assert.equal((await exact(`${raw}style.css`, { extra: { host: "evil.example" } })).status, 403);
  });

  test("capability route: wrong or foreign capabilities, bad encodings, methods and traversal", async () => {
    const forged = raw.replace(/\/raw\/[0-9a-f]{32}\//, `/raw/${"0".repeat(32)}/`);
    assert.equal((await exact(`${forged}style.css`)).status, 403);
    const otherProject = (await (await api(`/api/projects/${linked.id}/file?path=notes.md&info=1`)).json()).raw;
    assert.equal((await exact(otherProject.replace(linked.id, project.id))).status, 403, "a capability is bound to its project");
    assert.equal((await exact(`/api/projects/${project.id}/raw/short/style.css`)).status, 401, "not a capability URL: the normal token rule applies");
    assert.equal((await exact(`${raw}%zz`)).status, 400);
    assert.equal((await exact(`${raw.replace(project.id, "%zz")}style.css`)).status, 400);
    assert.equal((await exact(`${raw}style.css`, { method: "POST" })).status, 405);
    assert.equal((await exact(raw)).status, 404, "the project folder itself is not a file");
    assert.equal((await exact(raw.slice(0, -1))).status, 404);
    assert.equal((await exact(`${raw}sub/`)).status, 404);
    assert.equal((await exact(`${raw}nope.css`)).status, 404);
    assert.equal((await exact(`${raw}a%00b`)).status, 400);
    const secretPaths = ["../../sitebrowser-outside/secret.txt", "%2e%2e/%2e%2e/sitebrowser-outside/secret.txt", "..%2F..%2Fsitebrowser-outside%2Fsecret.txt", "sub/../../../sitebrowser-outside/secret.txt", "escape/secret.txt"];
    for (const wanted of secretPaths) {
      const res = await exact(`${raw}${wanted}`);
      assert.equal(res.status, 403, wanted);
      assert.doesNotMatch(res.body.toString(), /TOP-SECRET/);
    }
    // Backslash forms: 403 on Windows, a plain (missing) file name elsewhere; never the secret.
    const backslash = await exact(`${raw}..%5C..%5Csitebrowser-outside%5Csecret.txt`);
    assert.ok([403, 404].includes(backslash.status));
    assert.doesNotMatch(backslash.body.toString(), /TOP-SECRET/);
    // The token check is skipped for capability URLs, so a "../" tail must never reach another route.
    const sneaky = await exact(`${raw}../../../../health`);
    assert.equal(sneaky.status, 403);
    assert.doesNotMatch(sneaky.body.toString(), /"ok"/);
    assert.equal((await exact("/api/health")).status, 401);
  });

  test("a project whose folder vanished answers 404", async () => {
    const gone = path.join(rootsDir, "sitebrowser-gone");
    await mkdir(gone, { recursive: true });
    const opened = (await (await fetch(`${base}/api/projects/open-path`, { method: "POST", headers: headers({ "content-type": "application/json" }), body: JSON.stringify({ cwd: gone }) })).json()).project;
    await fetch(`${base}/api/projects/${opened.id}/stop`, { method: "POST", headers: headers() });
    // Windows keeps the folder busy until the fake PI is gone.
    await rm(gone, { recursive: true, force: true, maxRetries: 40, retryDelay: 100 });
    assert.equal((await api(`/api/projects/${opened.id}/file?path=a.txt`)).status, 404);
  });
});
