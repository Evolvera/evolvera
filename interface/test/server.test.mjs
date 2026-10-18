// In-process tests for server.mjs helpers and routes (fake PI only; owned temp dirs only).
import assert from "node:assert/strict";
import http from "node:http";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
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
  PI_WEB_PI_BIN: process.execPath,
  PI_WEB_PI_BIN_ARGS: JSON.stringify([path.join(here, "fake-pi-rpc.mjs")]),
});
delete process.env.PI_WEB_HOST;
const server = await import("../server.mjs");

after(() => rm(tmp, { recursive: true, force: true }));

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
    assert.equal(paths.includes(path.join(sessionsRoot, "--beta--", "b-1.jsonl")), process.platform === "win32");
    assert.equal(history.history.find((item) => item.path === historyFileB).title, "Olá beta");
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
    first.destroy();

    const pending = [];
    const second = sse(`/api/projects/${id}/events`, pending);
    await waitFor(() => pending.some((item) => item.event === "replay_done"));
    second.destroy();
    assert.ok(pending.some((item) => item.payload.id === "fake-ui-1"), "an unanswered dialog is replayed");

    assert.equal((await postJson(`/api/projects/${id}/ui-response`, { id: "fake-ui-1", value: "Bloquear" })).status, 202);
    const replay = [];
    const third = sse(`/api/projects/${id}/events`, replay);
    await waitFor(() => replay.some((item) => item.payload.message === "Escolha: Bloquear"));
    await waitFor(() => replay.some((item) => item.event === "replay_done"));
    third.destroy();
    const done = replay.find((item) => item.event === "replay_done");
    assert.ok(Number.isInteger(done.payload.count) && done.payload.count > 0);
    assert.equal(replay.some((item) => item.payload.type === "extension_ui_request" && item.payload.id === "fake-ui-1"), false);
  });
});
