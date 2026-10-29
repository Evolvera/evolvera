// RAM/CPU sampling of the PIs the Studio spawned. The process table always comes from test/fake-ps.mjs (never the real one);
// PIs are the fake RPC PI in run-owned temp dirs. Cleanup removes only what this file created.
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = await mkdtemp(path.join(os.tmpdir(), "pi-studio-resources-"));
const agentDir = path.join(tmp, "agent");
const roots = path.join(tmp, "roots");
const projectA = path.join(roots, "alpha");
const projectB = path.join(roots, "beta");
const stateFile = path.join(tmp, "ps.json");
const countFile = path.join(tmp, "ps-count.txt");
const pidFile = path.join(tmp, "pi-pids.txt");
for (const dir of [projectA, projectB, agentDir]) await mkdir(dir, { recursive: true });
for (const dir of [projectA, projectB]) await writeFile(path.join(dir, "package.json"), "{}");

Object.assign(process.env, { PI_WEB_HOST: "127.0.0.1", PI_WEB_PORT: "0", PI_AGENT_DIR: agentDir, PI_PROJECT_ROOTS: roots,
  PI_WEB_PI_BIN: process.execPath, PI_WEB_PI_BIN_ARGS: JSON.stringify([path.join(here, "fake-pi-rpc.mjs")]), FAKE_PI_PID_FILE: pidFile,
  PI_STUDIO_PS_BIN: process.execPath, PI_STUDIO_PS_BIN_ARGS: JSON.stringify([path.join(here, "fake-ps.mjs")]), PI_STUDIO_PS_TIMEOUT_MS: "1500",
  FAKE_PS_STATE: stateFile, FAKE_PS_COUNT_FILE: countFile });
const server = await import("../server.mjs");

let base;
let token;
const setPs = (value) => writeFile(stateFile, JSON.stringify(value));
const spawns = async () => (await readFile(countFile, "utf8").catch(() => "")).split("\n").filter(Boolean).length;
const piPids = async () => (await readFile(pidFile, "utf8").catch(() => "")).split("\n").filter(Boolean).map(Number);
const get = async (route) => {
  const response = await fetch(`${base}${route}`, { headers: { "x-pi-studio-token": token } });
  return { status: response.status, body: await response.json() };
};
const post = (route, body) => fetch(`${base}${route}`, { method: "POST", headers: { "x-pi-studio-token": token, "content-type": "application/json" }, body: JSON.stringify(body ?? {}) }).then((r) => r.json());
const open = async (cwd) => (await post("/api/projects/open-path", { cwd })).session;
const stopAll = async () => {
  for (const live of (await get("/api/sessions")).body.sessions.filter((item) => !item.exited)) await post(`/api/sessions/${live.id}/stop`);
  await waitFor("all sessions ended", async () => (await get("/api/sessions")).body.sessions.every((item) => item.exited));
};
const waitFor = async (what, check, ms = 8000) => {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise((resolve) => setTimeout(resolve, 25))) {
    const value = await check();
    if (value) return value;
  }
  throw new Error(`timed out waiting for ${what}`);
};

before(async () => {
  const running = await server.startServer(0, "127.0.0.1");
  base = `http://127.0.0.1:${running.address().port}`;
  token = (await (await fetch(base)).text()).match(/name="pi-studio-token" content="([a-f0-9]+)"/)[1];
});
after(async () => {
  await server.stopServer();
  await rm(tmp, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
});

describe("sampler command", () => {
  test("the env override wins and its args must be a JSON array of strings", () => {
    // Tests and odd hosts replace the sampler; a malformed args value must degrade to "no extra args", not crash.
    const env = { PI_STUDIO_PS_BIN: "x", PI_STUDIO_PS_BIN_ARGS: '["a","b"]' };
    assert.deepEqual(server.resolveSamplerCommand({ platform: "linux", env }), { bin: "x", args: ["a", "b"] });
    assert.deepEqual(server.resolveSamplerCommand({ platform: "linux", env: { PI_STUDIO_PS_BIN: "x", PI_STUDIO_PS_BIN_ARGS: "{no" } }).args, []);
    assert.deepEqual(server.resolveSamplerCommand({ platform: "linux", env: { PI_STUDIO_PS_BIN: "x", PI_STUDIO_PS_BIN_ARGS: "[1]" } }).args, []);
  });
  test("POSIX uses ps with no header and one batched call; Windows uses one PowerShell CIM query", () => {
    // Both ask for the whole table once; the pids of interest are picked from it afterwards.
    assert.deepEqual(server.resolveSamplerCommand({ platform: "linux", env: {} }), { bin: "ps", args: ["-eo", "pid=,ppid=,rss=,time=,lstart=,args="] });
    const win = server.resolveSamplerCommand({ platform: "win32", env: {} });
    assert.equal(win.bin, "powershell.exe");
    assert.deepEqual(win.args.slice(0, 3), ["-NoProfile", "-NonInteractive", "-Command"]);
    assert.match(win.args[3], /Get-CimInstance Win32_Process/);
    assert.match(win.args[3], /Name,CreationDate,CommandLine,WorkingSetSize,KernelModeTime,UserModeTime/);
  });
});

describe("parseProcessTable", () => {
  test("parses ps lines, including every shape of the cumulative time column", () => {
    // ps prints [[dd-]hh:]mm:ss[.cc]; every form must become seconds or the CPU figure is wrong by orders of magnitude.
    const table = server.parseProcessTable([" 10 1 2048 00:01", "11 10 1024 1:02:03", "12 10 512 2-03:04:05", "13 10 100 0:01.50", "14 10 0 7"].join("\n"));
    assert.deepEqual([...table.entries()].map(([pid, row]) => [pid, row.ppid, row.rssKb, row.cpuSeconds]), [
      [10, 1, 2048, 1], [11, 10, 1024, 3723], [12, 10, 512, 2 * 86400 + 3 * 3600 + 4 * 60 + 5], [13, 10, 100, 1.5], [14, 10, 0, 7],
    ]);
  });
  test("parses the Windows CSV: bytes become KB, kernel+user 100 ns ticks become seconds, empty cells become zero", () => {
    // The shape of ConvertTo-Csv; System Idle has an empty working set on some builds.
    const csv = ['"ProcessId","ParentProcessId","WorkingSetSize","KernelModeTime","UserModeTime"', '"0","0","","18000000000","0"', '"4242","1","10485760","10000000","5000000"'].join("\r\n");
    const table = server.parseProcessTable(csv);
    assert.deepEqual(table.get(4242), { ppid: 1, rssKb: 10240, cpuSeconds: 1.5 });
    assert.deepEqual(table.get(0), { ppid: 0, rssKb: 0, cpuSeconds: 1800 });
  });
  test("skips malformed lines and rejects output with no valid row at all", () => {
    // Garbage, binary junk, negative or fractional ids and blank output must not produce a table (the caller reports unavailable).
    assert.equal(server.parseProcessTable("not a table\n\u0000\u0001\n"), null);
    assert.equal(server.parseProcessTable(""), null);
    assert.equal(server.parseProcessTable(undefined), null);
    assert.equal(server.parseProcessTable("-1 2 3 4\n1.5 2 3 4\n1 2 3 99:99:xx"), null);
    const mixed = server.parseProcessTable("garbage\n5 1 100 00:02\n\n6 1 x 00:01\n");
    assert.deepEqual([...mixed.keys()], [5]);
  });
  test("a repeated pid keeps the last row and a huge table stays bounded", () => {
    // pid reuse inside one snapshot is impossible, but a hostile or broken sampler must not make the Map grow without limit.
    assert.equal(server.parseProcessTable("5 1 100 1\n5 1 200 2").get(5).rssKb, 200);
    const big = Array.from({ length: 70000 }, (_, i) => `${i + 1} 1 1 1`).join("\n");
    assert.equal(server.parseProcessTable(big).size, 50000);
  });
});

describe("treeTotals", () => {
  const table = server.parseProcessTable(["1 0 100 1", "10 1 1000 10", "11 10 2000 20", "12 11 3000 30", "13 10 4000 40", "99 1 9999 99"].join("\n"));
  test("sums the pid and all its descendants and counts the descendants, leaving siblings out", () => {
    // pi (10) + bash (11) + mcp server (12) + another child (13); 99 is a sibling and must not leak in.
    assert.deepEqual(server.treeTotals(table, 10), { rssKb: 10000, cpuSeconds: 100, children: 3 });
    assert.deepEqual(server.treeTotals(table, 12), { rssKb: 3000, cpuSeconds: 30, children: 0 });
  });
  test("a missing pid is null and cycles (self parent, mutual parents) terminate", () => {
    // A vanished PI must read as "no process"; a corrupt table with loops must not hang the server.
    assert.equal(server.treeTotals(table, 777), null);
    const loop = server.parseProcessTable("1 1 10 1\n2 3 20 2\n3 2 30 3");
    assert.deepEqual(server.treeTotals(loop, 1), { rssKb: 10, cpuSeconds: 1, children: 0 });
    assert.deepEqual(server.treeTotals(loop, 2), { rssKb: 50, cpuSeconds: 5, children: 1 });
  });
});

describe("sessionResources math", () => {
  const tableAt = (cpuSeconds, rssKb = 312 * 1024) => server.parseProcessTable(`10 1 ${rssKb} ${cpuSeconds}\n11 10 1024 0`);
  const args = (extra) => ({ id: "s", pid: 10, startedAt: 0, cpus: 4, history: new Map(), ...extra });

  test("first sample: average is cpu seconds over wall seconds over CPUs; the recent figure is unknown", () => {
    // 20 cpu-seconds in 100 s on 4 CPUs = 5 %. There is no earlier sample, so "recent" must be null, not a guess.
    const result = server.sessionResources(args({ table: tableAt(20), at: 100_000 }));
    assert.deepEqual(result, { pid: 10, rssMb: 313, cpuAvgPct: 5, cpuRecentPct: null, sampledAt: 100_000, children: 1 });
  });
  test("second sample: recent CPU comes from the delta between the last two samples", () => {
    // +4 cpu-seconds in 5 s on 4 CPUs = 20 %; asking again for the same table must not move the window.
    const history = new Map();
    server.sessionResources(args({ history, table: tableAt(20), at: 100_000 }));
    const second = server.sessionResources(args({ history, table: tableAt(24), at: 105_000 }));
    assert.equal(second.cpuRecentPct, 20);
    assert.equal(server.sessionResources(args({ history, table: tableAt(24), at: 105_000 })).cpuRecentPct, 20);
  });
  test("clock skew, a stale previous sample and a falling CPU counter never produce nonsense", () => {
    // Same/backwards clock -> null; previous sample older than 30 s -> null; a child that exited lowers the tree sum -> 0, not negative.
    const history = new Map();
    server.sessionResources(args({ history, table: tableAt(20), at: 100_000 }));
    assert.equal(server.sessionResources(args({ history, table: tableAt(21), at: 100_000 })).cpuRecentPct, null);
    assert.equal(server.sessionResources(args({ history, table: tableAt(22), at: 90_000 })).cpuRecentPct, null);
    assert.equal(server.sessionResources(args({ history, table: tableAt(23), at: 200_000 })).cpuRecentPct, null);
    assert.equal(server.sessionResources(args({ history, table: tableAt(10), at: 205_000 })).cpuRecentPct, 0);
  });
  test("an unusable start time or a pid that left the table: no average / no result", () => {
    // A start time in the future or garbage cannot give a wall duration; a missing pid is null for the caller to map to 409.
    assert.equal(server.sessionResources(args({ table: tableAt(5), at: 1000, startedAt: 5000 })).cpuAvgPct, null);
    assert.equal(server.sessionResources(args({ table: tableAt(5), at: 1000, startedAt: Number.NaN })).cpuAvgPct, null);
    assert.equal(server.sessionResources(args({ table: tableAt(5), at: 1000, pid: 4040 })), null);
  });
});

describe("getProcessTable cache", () => {
  test("serves the cached table for 5 s, then samples again", async () => {
    // The cache is what keeps polling from spawning a process per request.
    server.clearResourceCache();
    let clock = 1000;
    let calls = 0;
    const sample = async () => { calls++; return server.parseProcessTable("1 0 1 1"); };
    const first = await server.getProcessTable({ now: () => clock, sample });
    clock += 4999;
    assert.equal(await server.getProcessTable({ now: () => clock, sample }), first);
    clock += 2;
    assert.notEqual(await server.getProcessTable({ now: () => clock, sample }), first);
    assert.equal(calls, 2);
  });
  test("maps normalized shared rows for the session-math consumer", async () => {
    // The shared sampler owns normalized rows; only the resource consumer derives its existing Map shape.
    server.clearResourceCache();
    const result = await server.getProcessTable({ now: () => 5000, sample: async () => [{ pid: 8, ppid: 1, rssBytes: 2048, cpuSeconds: 2 }] });
    assert.deepEqual(result.table.get(8), { ppid: 1, rssKb: 2, cpuSeconds: 2 });
  });
  test("50 concurrent callers await one sample; a failure is shared, cached for 1 s only and never throws", async () => {
    // Coalescing is the "never more than one sampling process at a time" rule; a rejecting sampler is the worst case.
    server.clearResourceCache();
    let calls = 0;
    let clock = 0;
    const failing = async () => { calls++; throw new Error("boom"); };
    const all = await Promise.all(Array.from({ length: 50 }, () => server.getProcessTable({ now: () => clock, sample: failing })));
    assert.equal(calls, 1);
    assert.ok(all.every((value) => value === null));
    clock = 999;
    await server.getProcessTable({ now: () => clock, sample: failing });
    assert.equal(calls, 1);
    clock = 1001;
    await server.getProcessTable({ now: () => clock, sample: failing });
    assert.equal(calls, 2);
  });
});

describe("sampleProcesses with the fake sampler", () => {
  const command = () => server.resolveSamplerCommand();
  test("normal output in both formats becomes a table", async () => {
    // The ps shape and the Windows CSV shape reach the same Map.
    for (const format of ["ps", "csv"]) {
      await setPs({ mode: "normal", format, rows: [[10, 1, 2048, 3.5]] });
      assert.deepEqual((await server.sampleProcesses(command(), 3000)).get(10), { ppid: 1, rssKb: 2048, cpuSeconds: 3.5 });
    }
  });
  test("malformed output, empty output, a failing exit, a missing binary and a hang all yield null (hang within the timeout)", async () => {
    // Every failure is the same answer for the caller: unavailable. The hang case also proves the timeout kills the child.
    for (const mode of ["malformed", "empty", "exit"]) {
      await setPs({ mode, rows: [] });
      assert.equal(await server.sampleProcesses(command(), 3000), null, mode);
    }
    assert.equal(await server.sampleProcesses({ bin: path.join(tmp, "nope-binary"), args: [] }, 3000), null);
    await setPs({ mode: "hang", rows: [] });
    const started = Date.now();
    assert.equal(await server.sampleProcesses(command(), 300), null);
    assert.ok(Date.now() - started < 2500, "timeout must cut the hang");
  });
});

describe("HTTP routes", () => {
  const spawnedPids = async (count) => waitFor(`${count} PI pids`, async () => ((await piPids()).length >= count ? piPids() : null));
  const tree = (pi, extra = []) => [[1, 0, 100, 1], [pi, 1, 30 * 1024, 12], [pi + 100000, pi, 20 * 1024, 6], [pi + 100001, pi + 100000, 10 * 1024, 2], ...extra];

  test("/api/sessions/:id/resources sums the PI process tree and reports the documented fields", async () => {
    // pi 30 MB + bash 20 MB + mcp 10 MB = 60 MB, two descendants; the numbers come from the fake table, not from the real OS.
    const session = await open(projectA);
    const [pi] = await spawnedPids(1);
    await setPs({ mode: "normal", rows: tree(pi) });
    server.clearResourceCache();
    const { status, body } = await get(`/api/sessions/${session.id}/resources`);
    assert.equal(status, 200);
    assert.deepEqual(Object.keys(body).sort(), ["children", "cpuAvgPct", "cpuRecentPct", "pid", "rssMb", "sampledAt"]);
    assert.deepEqual([body.pid, body.rssMb, body.children, body.cpuRecentPct], [pi, 60, 2, null]);
    assert.ok(body.cpuAvgPct >= 0 && Number.isFinite(body.sampledAt));
  });

  test("404 for an unknown session, 409 for a session that ended, 409 when its pid left the table", async () => {
    // 404 = the id never existed; 409 = known but nothing to measure.
    assert.equal((await get("/api/sessions/nope/resources")).status, 404);
    const [alpha] = (await get("/api/sessions")).body.sessions.filter((s) => !s.exited);
    await setPs({ mode: "normal", rows: [[1, 0, 100, 1]] });
    server.clearResourceCache();
    const gone = await get(`/api/sessions/${alpha.id}/resources`);
    assert.deepEqual([gone.status, gone.body.error], [409, "no-live-process"]);
    await post(`/api/sessions/${alpha.id}/stop`);
    await waitFor("session exit", async () => (await get("/api/sessions")).body.sessions.find((s) => s.id === alpha.id)?.exited);
    assert.equal((await get(`/api/sessions/${alpha.id}/resources`)).status, 409);
  });

  test("a failing or malformed sampler answers 503 resources-unavailable, and the next good sample recovers", async () => {
    // The Contexto tab shows "indisponível" for 503; it must come back by itself when the sampler does.
    const session = await open(projectB);
    const pi = (await spawnedPids(2))[1];
    for (const mode of ["exit", "malformed", "empty"]) {
      await setPs({ mode, rows: [] });
      server.clearResourceCache();
      const result = await get(`/api/sessions/${session.id}/resources`);
      assert.deepEqual([result.status, result.body], [503, { error: "resources-unavailable" }], mode);
    }
    await setPs({ mode: "normal", rows: tree(pi) });
    server.clearResourceCache();
    assert.equal((await get(`/api/sessions/${session.id}/resources`)).status, 200);
  });

  test("/api/resources lists every live Studio session once, with cwd and project for the Worktrees panel", async () => {
    // Only live sessions appear (alpha was stopped above); the response is the same cached sample.
    const live = (await get("/api/sessions")).body.sessions.filter((s) => !s.exited);
    assert.equal(live.length, 1);
    const [, pi] = await piPids();
    await setPs({ mode: "normal", rows: tree(pi) });
    server.clearResourceCache();
    const { status, body } = await get("/api/resources");
    assert.equal(status, 200);
    assert.equal(body.resources.length, 1);
    assert.deepEqual([body.resources[0].sessionId, body.resources[0].projectId, path.resolve(body.resources[0].cwd), body.resources[0].rssMb], [live[0].id, live[0].projectId, path.resolve(projectB), 60]);
    await setPs({ mode: "exit", rows: [] });
    server.clearResourceCache();
    assert.deepEqual((await get("/api/resources")).body, { error: "resources-unavailable" });
  });

  test("/api/resources skips a live session whose pid is missing from the table instead of failing the whole list", async () => {
    // A PI that started a moment after the sample (or died) must not hide the others from the Worktrees panel.
    await stopAll();
    const before = (await piPids()).length;
    // One at a time: the PI pid file is written by the PIs themselves, so opening both at once would not say whose pid is whose.
    const alpha = await open(projectA);
    await waitFor("alpha PI pid", async () => (await piPids()).length >= before + 1);
    const beta = await open(projectB);
    const betaPid = (await spawnedPids(before + 2)).at(-1);
    await setPs({ mode: "normal", rows: tree(betaPid) });
    server.clearResourceCache();
    const { body } = await get("/api/resources");
    assert.deepEqual(body.resources.map((item) => item.sessionId), [beta.id]);
    assert.notEqual(alpha.id, beta.id);
    for (const session of [alpha, beta]) await post(`/api/sessions/${session.id}/stop`);
  });

  test("no live session means no sampler process at all", async () => {
    // Opening the Worktrees panel with nothing running must cost nothing.
    await stopAll();
    server.clearResourceCache();
    const before = await spawns();
    assert.deepEqual((await get("/api/resources")).body, { resources: [] });
    assert.equal(await spawns(), before);
  });

  test("50 concurrent requests across both routes cause exactly one sampler spawn; the next window causes one more", async () => {
    // The load rule: callers share a promise while it runs and the 5 s cache afterwards.
    const known = (await piPids()).length;
    const session = await open(projectA);
    const pi = (await spawnedPids(known + 1)).at(-1);
    await setPs({ mode: "normal", rows: tree(pi), delayMs: 150 });
    server.clearResourceCache();
    const before = await spawns();
    const answers = await Promise.all(Array.from({ length: 50 }, (_, i) => get(i % 2 ? `/api/sessions/${session.id}/resources` : "/api/resources")));
    assert.ok(answers.every((answer) => answer.status === 200), JSON.stringify(answers.map((a) => a.status)));
    assert.equal((await spawns()) - before, 1);
    server.clearResourceCache();
    await get("/api/resources");
    assert.equal((await spawns()) - before, 2);
  });

  test("the sampler never runs two at a time even when the cache is cleared mid-flight", async () => {
    // Resource exhaustion: clearing the cache while a sample runs must not start a second concurrent process.
    await setPs({ mode: "normal", rows: [[1, 0, 1, 1]], delayMs: 300 });
    server.clearResourceCache();
    const first = server.getProcessTable();
    server.clearResourceCache();
    const second = server.getProcessTable();
    assert.equal(await first, await second);
  });
});
