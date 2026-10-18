// In-process tests for server.mjs helpers and routes (fake PI only; owned temp dirs only).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import http from "node:http";
import { mkdir, mkdtemp, readFile, rm, stat, symlink, utimes, writeFile } from "node:fs/promises";
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

describe("PI stdin errors", () => {
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
  describe("session titles + conversation search", () => {
    const user = (text) => ({ type: "message", message: { role: "user", content: text } });
    const assistant = (text) => ({ type: "message", message: { role: "assistant", content: [{ type: "text", text }] } });
    const header = (cwd, timestamp) => ({ type: "session", cwd, ...(timestamp ? { timestamp } : {}) });
    const search = async (query) => (await getJson(`/api/search?q=${encodeURIComponent(query)}`)).results;
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
    });

    test("titles prefer the latest session name over the first prompt, falling back to the prompt", async () => {
      const history = (await getJson(`/api/projects/${alphaId}/history`)).history;
      assert.equal(history.find((item) => item.path === rich).title, "Plano de auth final");
      assert.equal(history.find((item) => item.path.endsWith("blank-name.jsonl")).title, "só o prompt: quokka-unico");
      assert.equal((await server.scanSession(rich, { fallback: "x" })).title, "Plano de auth final");
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

    test("bounds: a file is read up to its byte cap, files and total bytes are limited", async () => {
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
      assert.deepEqual(await names({ maxFileBytes: 1000 }), ["early.jsonl", "third.jsonl"]);
      assert.deepEqual(await names({ maxFiles: 2 }), ["early.jsonl", "late.jsonl"]);
      assert.deepEqual(await names({ limit: 1 }), ["early.jsonl"]);
      assert.deepEqual(await names({ maxTotalBytes: 1 }), ["early.jsonl"]);

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
