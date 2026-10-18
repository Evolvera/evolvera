#!/usr/bin/env node
// Load test for the endpoints behind worktrees/Orca: GET /api/orca and GET /api/projects/status.
// Starts its own PI Studio on a throwaway port (PI_WEB_PORT=0) with a fake PI and a fake orca in an owned temp dir,
// drives each endpoint with CONCURRENCY keep-alive clients for DURATION seconds, then reports throughput,
// p50/p95/p99 latency, errors, how many orca child processes ran (the 2 s cache must bound them) and server RSS.
// Env: LOAD_SECONDS (default 10), LOAD_CONCURRENCY (default 50), LOAD_WARMUP_SECONDS (default 4). Exit 1 on any error, unbounded orca spawns or RSS growth > 64 MB.
import { execFileSync, spawn } from "node:child_process";
import http from "node:http";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const DURATION = Number(process.env.LOAD_SECONDS || 10);
const CONCURRENCY = Number(process.env.LOAD_CONCURRENCY || 50);
const WARMUP = Number(process.env.LOAD_WARMUP_SECONDS || 4);
const RSS_GROWTH_LIMIT_MB = 64;

const tmp = await mkdtemp(path.join(os.tmpdir(), "pi-studio-load-"));
const rootsDir = path.join(tmp, "roots");
const projects = ["alpha", "beta"].map((name) => path.join(rootsDir, name));
for (const dir of [...projects, path.join(tmp, "agent")]) await mkdir(dir, { recursive: true });
for (const dir of projects) await writeFile(path.join(dir, "package.json"), "{}");
const stateFile = path.join(tmp, "orca-state.json");
const countFile = path.join(tmp, "orca-count.txt");
const worktrees = Array.from({ length: 22 }, (_, i) => ({
  path: i < 2 ? projects[i].replace(/\\/g, "/") : `${tmp.replace(/\\/g, "/")}/wt/${i}`,
  displayName: `worktree-${i}`,
  status: i % 3 === 0 ? "working" : "inactive",
  unread: i % 4 === 0,
  agents: i % 3 === 0 ? [{ state: "working", agentType: "pi", taskTitle: `tarefa ${i}`, lastAssistantMessage: "x".repeat(150) }] : [],
}));
await writeFile(stateFile, JSON.stringify({ mode: "normal", active: worktrees[0].path, worktrees }));

const server = spawn(process.execPath, [path.join(root, "server.mjs")], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
  env: {
    ...process.env,
    PI_WEB_HOST: "127.0.0.1",
    PI_WEB_PORT: "0",
    PI_AGENT_DIR: path.join(tmp, "agent"),
    PI_PROJECT_ROOTS: rootsDir,
    PI_WEB_PI_BIN: process.execPath,
    PI_WEB_PI_BIN_ARGS: JSON.stringify([path.join(here, "fake-pi-rpc.mjs")]),
    PI_STUDIO_ORCA_BIN: process.execPath,
    PI_STUDIO_ORCA_BIN_ARGS: JSON.stringify([path.join(here, "fake-orca.mjs")]),
    FAKE_ORCA_STATE: stateFile,
    FAKE_ORCA_COUNT_FILE: countFile,
  },
});
let output = "";
server.stderr.on("data", (chunk) => { output += chunk; });
const port = await new Promise((resolve, reject) => {
  server.stdout.on("data", (chunk) => {
    output += chunk;
    const match = output.match(/listening on http:\/\/127\.0\.0\.1:(\d+)/);
    if (match) resolve(Number(match[1]));
  });
  server.on("exit", (code) => reject(new Error(`server exited early (${code}): ${output}`)));
  setTimeout(() => reject(new Error(`server did not start: ${output}`)), 15000).unref();
});

const agent = new http.Agent({ keepAlive: true, maxSockets: CONCURRENCY + 4 });
const request = (method, pathname, { token, body } = {}) => new Promise((resolve, reject) => {
  const req = http.request({ host: "127.0.0.1", port, path: pathname, method, agent, headers: { ...(token ? { "x-pi-studio-token": token } : {}), ...(body ? { "content-type": "application/json" } : {}) } }, (res) => {
    const chunks = [];
    res.on("data", (chunk) => chunks.push(chunk));
    res.on("end", () => resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString("utf8") }));
  });
  req.on("error", reject);
  req.end(body);
});

const rssMb = (pid) => {
  if (process.platform === "win32") {
    const line = execFileSync("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"], { encoding: "utf8" }).trim().split("\n")[0];
    return Number(line.split('","').pop().replace(/\D/g, "")) / 1024;
  }
  return Number(execFileSync("ps", ["-o", "rss=", "-p", String(pid)], { encoding: "utf8" }).trim()) / 1024;
};
const orcaSpawns = async () => (await readFile(countFile, "utf8").catch(() => "")).split("\n").filter(Boolean).length;
const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];

async function hammer(label, pathname, token, runSeconds = DURATION) {
  const latencies = [];
  let errors = 0;
  const statuses = {};
  const deadline = performance.now() + runSeconds * 1000;
  const started = performance.now();
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (performance.now() < deadline) {
      const t0 = performance.now();
      try {
        const res = await request("GET", pathname, { token });
        statuses[res.status] = (statuses[res.status] || 0) + 1;
        if (res.status !== 200) errors++;
        latencies.push(performance.now() - t0);
      } catch {
        errors++;
      }
    }
  }));
  const seconds = (performance.now() - started) / 1000;
  latencies.sort((a, b) => a - b);
  return { label, seconds, requests: latencies.length, rps: latencies.length / seconds, p50: percentile(latencies, 50), p95: percentile(latencies, 95), p99: percentile(latencies, 99), max: latencies.at(-1), errors, statuses };
}

let failed = false;
const openedIds = [];
try {
  const page = await request("GET", "/");
  const token = page.text.match(/name="pi-studio-token" content="([a-f0-9]+)"/)[1];
  // Two live projects (one running a ~4 s fake run) so /api/projects/status has real entries.
  for (const [index, dir] of projects.entries()) {
    const opened = JSON.parse((await request("POST", "/api/projects/open-path", { token, body: JSON.stringify({ cwd: dir }) })).text);
    openedIds.push(opened.project.id);
    if (index === 0) await request("POST", `/api/projects/${opened.project.id}/command`, { token, body: JSON.stringify({ id: "load", type: "prompt", message: "demo" }) });
  }
  await request("GET", "/api/orca", { token });
  // Warm-up (JIT, sockets, caches) so the RSS baseline is the steady state, not a cold process.
  for (const pathname of ["/api/orca", "/api/projects/status"]) await hammer("warm-up", pathname, token, WARMUP);
  await new Promise((resolve) => setTimeout(resolve, 1500));

  const rssBefore = rssMb(server.pid);
  const spawnsBefore = await orcaSpawns();
  const results = [];
  for (const [label, pathname] of [["GET /api/orca", "/api/orca"], ["GET /api/projects/status", "/api/projects/status"]]) {
    results.push(await hammer(label, pathname, token));
  }
  const elapsed = results.reduce((sum, item) => sum + item.seconds, 0);
  const spawns = (await orcaSpawns()) - spawnsBefore;
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const rssAfter = rssMb(server.pid);

  const fmt = (value, digits = 1) => value.toFixed(digits);
  console.log(`\nLoad test · concurrency ${CONCURRENCY} · ${DURATION}s per endpoint · server pid ${server.pid} port ${port}\n`);
  for (const item of results) {
    console.log(`${item.label}\n  requests ${item.requests} in ${fmt(item.seconds)}s = ${fmt(item.rps, 0)} req/s · latency ms p50 ${fmt(item.p50, 2)} p95 ${fmt(item.p95, 2)} p99 ${fmt(item.p99, 2)} max ${fmt(item.max, 2)} · errors ${item.errors} · status ${JSON.stringify(item.statuses)}`);
  }
  const bound = Math.ceil(elapsed / 2) + 2;
  console.log(`\norca child processes during the run: ${spawns} (bound for ${fmt(elapsed)}s with a 2 s cache: ${bound})`);
  console.log(`server RSS: before ${fmt(rssBefore)} MB, after ${fmt(rssAfter)} MB (Δ ${fmt(rssAfter - rssBefore)} MB, limit ${RSS_GROWTH_LIMIT_MB} MB)`);
  const problems = [];
  if (results.some((item) => item.errors)) problems.push("request errors");
  if (spawns > bound) problems.push("orca spawns exceed the cache bound");
  if (rssAfter - rssBefore > RSS_GROWTH_LIMIT_MB) problems.push("RSS growth");
  failed = problems.length > 0;
  console.log(failed ? `FAIL: ${problems.join(", ")}` : "PASS");
} finally {
  agent.destroy();
  // Stop the fake PIs through the API so none outlives the server, then stop the server.
  try {
    const page = await new Promise((resolve, reject) => http.get({ host: "127.0.0.1", port, path: "/" }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    }).on("error", reject));
    const token = page.match(/name="pi-studio-token" content="([a-f0-9]+)"/)[1];
    await Promise.all(openedIds.map((id) => new Promise((resolve) => {
      const req = http.request({ host: "127.0.0.1", port, path: `/api/projects/${id}/stop`, method: "POST", headers: { "x-pi-studio-token": token } }, (res) => { res.resume(); res.on("end", resolve); });
      req.on("error", resolve);
      req.end();
    })));
    await new Promise((resolve) => setTimeout(resolve, 3200));
  } catch {
    // The server may already be gone.
  }
  server.kill();
  await new Promise((resolve) => (server.exitCode !== null ? resolve() : server.once("exit", resolve)));
  await rm(tmp, { recursive: true, force: true, maxRetries: 20, retryDelay: 150 });
}
process.exit(failed ? 1 : 0);
