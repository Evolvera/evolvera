#!/usr/bin/env node
// Load test for GET /api/voice/status plus endpoints behind worktrees/Orca, conversation states and visibility: GET /api/orca, GET /api/projects/status
// (incl. per-project running counts), GET /api/projects/:id/history, GET /api/activity (full 300-item ring) and GET /api/usage/today
// (cost/tokens of today's sessions) and GET /api/projects/:id/file (small text and a 5 MB file) over a temp sessions dir of 2000 files (some multi-MB, some sub-PI) with a tail-read state each.
// and GET /api/sessions/watch (each client: first read = the 2 MiB tail of a ~5 MB session, then incremental reads by offset)
// while a writer keeps appending lines to that session; one client checks it saw every appended line exactly once.
// Starts its own PI Studio on a throwaway port (PI_WEB_PORT=0) with a fake PI and a fake orca in an owned temp dir,
// drives each endpoint with CONCURRENCY keep-alive clients for DURATION seconds, then reports throughput,
// p50/p95/p99 latency, cold/warm /api/tree latency, 5-minute 10-client conditional-poll latency and RSS, errors, and bounded child-process counts.
// Env: LOAD_SECONDS (default 10), LOAD_CONCURRENCY (default 50), LOAD_WARMUP_SECONDS (default 4). Exit 1 on any error, unbounded orca spawns or RSS growth > 64 MB over a settling pass (the endpoints run twice; the second pass is reported).
import { execFileSync, spawn } from "node:child_process";
import http from "node:http";
import { appendFile, mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
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
const taskLinksDir = path.join(tmp, "agent", "pi-studio-data");
await mkdir(taskLinksDir, { recursive: true });
await writeFile(path.join(taskLinksDir, "task-links.json"), JSON.stringify([{ conversationId: "load-conversation", taskId: 1, worktreePath: `${tmp}/wt/task`, worktreeName: "task", terminalHandle: "load-terminal", createdAt: new Date().toISOString() }]));
for (const dir of projects) await writeFile(path.join(dir, "package.json"), "{}");
// Files for GET /api/projects/:id/file: a small text and a 5 MB one (the mix of previews and big downloads).
await writeFile(path.join(projects[0], "small.txt"), "linha de texto\n".repeat(40));
await writeFile(path.join(projects[0], "big.txt"), ("x".repeat(1023) + "\n").repeat(5 * 1024));
const stateFile = path.join(tmp, "orca-state.json");
const countFile = path.join(tmp, "orca-count.txt");
// RAM/CPU routes: the process table comes from fake-ps (rows written once the fake PIs are up); spawns are counted.
const psStateFile = path.join(tmp, "ps-state.json");
const psCountFile = path.join(tmp, "ps-count.txt");
const piPidFile = path.join(tmp, "pi-pids.txt");
await writeFile(psStateFile, JSON.stringify({ mode: "normal", format: "csv", rows: [] }));
const worktrees = Array.from({ length: 22 }, (_, i) => ({
  path: i < 2 ? projects[i].replace(/\\/g, "/") : `${tmp.replace(/\\/g, "/")}/wt/${i}`,
  displayName: `worktree-${i}`,
  status: i % 3 === 0 ? "working" : "inactive",
  unread: i % 4 === 0,
  agents: i % 3 === 0 ? [{ state: "working", agentType: "pi", taskTitle: `tarefa ${i}`, lastAssistantMessage: "x".repeat(150) }] : [],
}));
await writeFile(stateFile, JSON.stringify({ mode: "normal", active: worktrees[0].path, worktrees }));

// ~700 session files: 60 belong to the project under test (alpha, 12 of them multi-MB), the rest to other cwds.
const SESSION_FILES = 2000;
const sessionsDir = path.join(tmp, "agent", "sessions", "--load--");
await mkdir(sessionsDir, { recursive: true });
const pad = JSON.stringify({ type: "custom", customType: "pad", data: "p".repeat(900) });
const line = (value) => `${JSON.stringify(value)}\n`;
const stops = ["stop", "toolUse", "aborted", "error", "length"];
for (let index = 0; index < SESSION_FILES; index++) {
  const mine = index % 12 === 0;
  const big = mine && index % 24 === 0;
  const header = { type: "session", id: `s${index}`, timestamp: new Date(1_700_000_000_000 + index * 60_000).toISOString(), cwd: mine ? projects[0] : path.join(tmp, `other-${index % 40}`), ...(index % 5 === 0 ? { parentSession: "parent.jsonl" } : {}) };
  const body = [line(header), line({ type: "message", id: "u", message: { role: "user", content: `pergunta ${index}` } })];
  if (big) body.push(`${pad}\n`.repeat(2500 + (index % 7) * 500));
  body.push(line({ type: "message", id: "a", timestamp: new Date().toISOString(), message: { role: "assistant", content: [{ type: "text", text: "ok" }], stopReason: stops[index % stops.length], usage: { totalTokens: 100, cost: { total: 0.01 } } } }), line({ type: "custom", customType: "loop-state" }));
  await writeFile(path.join(sessionsDir, `s-${index}.jsonl`), body.join(""));
}

// The session another PI keeps writing during the watch run: ~5 MB, in a project nobody lists.
const watchFile = path.join(sessionsDir, "watch-live.jsonl");
const WATCH_BYTES = 5 * 1024 * 1024;
await writeFile(watchFile, line({ type: "session", id: "watch-live", timestamp: new Date().toISOString(), cwd: path.join(tmp, "watch-cwd") }) + line({ type: "message", id: "u", message: { role: "user", content: "acompanhe" } }) + `${pad}\n`.repeat(Math.ceil(WATCH_BYTES / (pad.length + 1))));

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
    PI_STUDIO_PS_BIN: process.execPath,
    PI_STUDIO_PS_BIN_ARGS: JSON.stringify([path.join(here, "fake-ps.mjs")]),
    FAKE_PS_STATE: psStateFile,
    FAKE_PS_COUNT_FILE: psCountFile,
    FAKE_PI_PID_FILE: piPidFile,
    GIT_AUTHOR_NAME: "Carga", GIT_AUTHOR_EMAIL: "carga@example.invalid", GIT_COMMITTER_NAME: "Carga", GIT_COMMITTER_EMAIL: "carga@example.invalid",
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
// Keep-alive race (Node docs, `request.reusedSocket`): the server may close an idle socket (keepAliveTimeout 5 s) just as
// the client reuses it, e.g. after a slow `tasklist` between segments. Such a request never reached the server, so it
// is retried once on a fresh socket and counted in staleSocketRetries; a failure on a fresh socket is still an error.
let staleSocketRetries = 0;
const request = (method, pathname, options = {}) => sendOnce(method, pathname, options).catch((error) => {
  if (!error.reusedSocket || error.code !== "ECONNRESET") throw error;
  staleSocketRetries++;
  return sendOnce(method, pathname, options);
});
const sendOnce = (method, pathname, { token, body, decode = true, etag } = {}) => new Promise((resolve, reject) => {
  const req = http.request({ host: "127.0.0.1", port, path: pathname, method, agent, headers: { ...(token ? { "x-pi-studio-token": token } : {}), ...(body ? { "content-type": "application/json" } : {}), ...(etag ? { "if-none-match": etag } : {}) } }, (res) => {
    const chunks = [];
    res.on("data", (chunk) => chunks.push(chunk));
    res.on("end", () => {
      const bytes = Buffer.concat(chunks);
      // The hammered file route only measures its (multi-MB) bodies; every other caller reads the text.
      resolve({ status: res.statusCode, bytes: bytes.length, text: decode ? bytes.toString("utf8") : "" });
    });
  });
  req.on("error", (error) => reject(Object.assign(error, { reusedSocket: req.reusedSocket })));
  req.end(body);
});

const rssMb = (pid) => {
  if (process.platform === "win32") {
    const line = execFileSync("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"], { encoding: "utf8" }).trim().split("\n")[0];
    return Number(line.split('","').pop().replace(/\D/g, "")) / 1024;
  }
  return Number(execFileSync("ps", ["-o", "rss=", "-p", String(pid)], { encoding: "utf8" }).trim()) / 1024;
};
const psSpawns = async () => (await readFile(psCountFile, "utf8").catch(() => "")).split("\n").filter(Boolean).length;
const orcaSpawns = async () => (await readFile(countFile, "utf8").catch(() => "")).split("\n").filter(Boolean).length;
const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];

// `pathname` may be a list: each request takes the next one, round robin.
async function hammer(label, pathname, token, runSeconds = DURATION, method = "GET", body, etag = null, allow304 = false) {
  const paths = [pathname].flat();
  let turn = 0;
  const latencies = [];
  let errors = 0;
  const statuses = {};
  const deadline = performance.now() + runSeconds * 1000;
  const started = performance.now();
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (performance.now() < deadline) {
      const t0 = performance.now();
      try {
        const res = await request(method, paths[turn++ % paths.length], { token, body: body === undefined ? undefined : JSON.stringify(body), decode: false, etag });
        statuses[res.status] = (statuses[res.status] || 0) + 1;
        if (res.status !== 200 && !(allow304 && res.status === 304)) errors++;
        latencies.push(performance.now() - t0);
      } catch (error) {
        errors++;
        // Thrown errors (no status) are counted by code so a report can tell a socket reset from a server failure.
        statuses[error.code || "thrown"] = (statuses[error.code || "thrown"] || 0) + 1;
      }
    }
  }));
  const seconds = (performance.now() - started) / 1000;
  latencies.sort((a, b) => a - b);
  return { label, seconds, requests: latencies.length, rps: latencies.length / seconds, p50: percentile(latencies, 50), p95: percentile(latencies, 95), p99: percentile(latencies, 99), max: latencies.at(-1), errors, statuses };
}

// Watch clients keep their own offset like the page does. appendEvery: ms between lines the "other PI" appends.
async function soakTree(token, initialEtag) {
  const rssStart = rssMb(server.pid);
  const deadline = performance.now() + 5 * 60_000;
  const statuses = {};
  let errors = 0;
  const clients = await Promise.all(Array.from({ length: 10 }, async () => {
    let etag = initialEtag;
    let requests = 0;
    while (performance.now() < deadline) {
      const tick = performance.now();
      try {
        const response = await request("GET", "/api/tree", { token, etag });
        statuses[response.status] = (statuses[response.status] || 0) + 1;
        if (response.status === 200) etag = JSON.parse(response.text).version;
        else if (response.status !== 304) errors++;
      } catch { errors++; }
      requests++;
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, tick + 2000 - performance.now())));
    }
    return requests;
  }));
  const rssEnd = rssMb(server.pid);
  return { clients: clients.length, requests: clients.reduce((sum, count) => sum + count, 0), statuses, errors, rssStart, rssEnd, rssDelta: rssEnd - rssStart };
}

async function hammerWatch(label, token, runSeconds = DURATION, appendEvery = 40) {
  const latencies = [];
  let errors = 0;
  let appended = 0;
  const statuses = {};
  const seen = [];
  // Appends are chained: two overlapping appendFile calls can land out of order on Windows, which made
  // the "in order" check fail intermittently for a reason that is not the server's.
  let appending = Promise.resolve();
  const writer = setInterval(() => {
    const index = appended;
    appending = appending.then(() => appendFile(watchFile, line({ type: "message", id: `live-${index}`, parentId: index ? `live-${index - 1}` : "u", message: { role: "assistant", content: [{ type: "text", text: `linha ${index}` }], stopReason: "toolUse" } }), "utf8")).catch(() => { errors++; });
    appended++;
  }, appendEvery);
  const deadline = performance.now() + runSeconds * 1000;
  const started = performance.now();
  await Promise.all(Array.from({ length: CONCURRENCY }, async (_, client) => {
    let offset = 0;
    while (performance.now() < deadline) {
      const t0 = performance.now();
      try {
        const res = await request("GET", `/api/sessions/watch?path=${encodeURIComponent(watchFile)}&since=${offset}`, { token });
        statuses[res.status] = (statuses[res.status] || 0) + 1;
        if (res.status !== 200) errors++;
        else {
          const data = JSON.parse(res.text);
          if (data.offset < offset) errors++;
          offset = data.offset;
          if (client === 0) for (const entry of data.entries) if (entry.id?.startsWith("live-")) seen.push(Number(entry.id.slice(5)));
        }
        latencies.push(performance.now() - t0);
      } catch {
        errors++;
      }
    }
  }));
  clearInterval(writer);
  await appending;
  const seconds = (performance.now() - started) / 1000;
  await new Promise((resolve) => setTimeout(resolve, 200));
  // Client 0 saw every appended line once, in order (no gaps, no repeats).
  const contiguous = seen.every((id, index) => index === 0 || id === seen[index - 1] + 1);
  if (!seen.length || !contiguous) errors++;
  latencies.sort((a, b) => a - b);
  return { label: `${label} (${(WATCH_BYTES / 1048576).toFixed(0)} MB session, +${appended} lines appended meanwhile, client 0 saw ${seen.length} in order: ${contiguous})`, seconds, requests: latencies.length, rps: latencies.length / seconds, p50: percentile(latencies, 50), p95: percentile(latencies, 95), p99: percentile(latencies, 99), max: latencies.at(-1), errors, statuses };
}

let failed = false;
const openedIds = [];
const sessionIds = [];
try {
  const page = await request("GET", "/");
  const token = page.text.match(/name="pi-studio-token" content="([a-f0-9]+)"/)[1];
  // Two live projects (one running a ~4 s fake run) so /api/projects/status has real entries.
  for (const [index, dir] of projects.entries()) {
    const opened = JSON.parse((await request("POST", "/api/projects/open-path", { token, body: JSON.stringify({ cwd: dir }) })).text);
    openedIds.push(opened.project.id);
    sessionIds.push(opened.session.id);
    if (index === 0) await request("POST", `/api/projects/${opened.project.id}/command`, { token, body: JSON.stringify({ id: "load", type: "prompt", message: "demo" }) });
  }
  await request("GET", "/api/orca", { token });
  // beta is a real git repository (one commit, one untracked file) for GET /api/sessions/:id/git-files.
  const git = (...args) => execFileSync("git", ["-c", "commit.gpgsign=false", "-C", projects[1], ...args], { stdio: "ignore" });
  git("init", "-q");
  git("add", "package.json");
  git("commit", "-q", "-m", "carga");
  await writeFile(path.join(projects[1], "novo.txt"), "novo");
  // Process table: each fake PI with a bash child; pids come from the PI pid file.
  const piPids = (await readFile(piPidFile, "utf8")).split("\n").filter(Boolean).map(Number);
  await writeFile(psStateFile, JSON.stringify({ mode: "normal", format: "csv", rows: [{ pid: 1, ppid: 0, rssBytes: 102400, cpuSeconds: 1, name: "node.exe", commandLine: "node" }, ...piPids.flatMap((pid, i) => [{ pid, ppid: 1, rssBytes: 40000 * 1024, cpuSeconds: 3 + i, name: "node.exe", commandLine: "node @earendil-works/pi-coding-agent/dist/cli.js" }, { pid: pid + 500000, ppid: pid, rssBytes: 8000 * 1024, cpuSeconds: 1, name: "bash", commandLine: "bash" }])] }));
  const resourcesPath = `/api/sessions/${sessionIds[0]}/resources`;
  const gitFilesPath = `/api/sessions/${sessionIds[1]}/git-files?path=package.json&path=novo.txt`;
  const resourcesSample = await request("GET", resourcesPath, { token });
  const gitSample = await request("GET", gitFilesPath, { token });
  console.log(`resources sample: ${resourcesSample.text}`);
  console.log(`git-files sample: ${gitSample.text}`);
  if (resourcesSample.status !== 200 || JSON.parse(resourcesSample.text).children !== 1) throw new Error("resources route must sum the PI process tree");
  if (gitSample.status !== 200 || JSON.parse(gitSample.text).requested["novo.txt"].state !== "untracked") throw new Error("git-files route must report the untracked file");
  const treeColdTimes = [];
  const treeWarmTimes = [];
  let treeStarted = performance.now();
  const treeFirst = await request("GET", "/api/tree", { token });
  treeColdTimes.push(performance.now() - treeStarted);
  let treeEtag = treeFirst.text ? JSON.parse(treeFirst.text).version : null;
  if (treeFirst.status !== 200 || !treeEtag) throw new Error("/api/tree must return its initial tree body");
  const firstTree = JSON.parse(treeFirst.text);
  console.log(`live API sample: ${JSON.stringify({ version: firstTree.version, generatedAt: firstTree.generatedAt, projects: firstTree.projects.map((project) => ({ id: project.id, name: project.name, envs: project.envs.map((env) => ({ key: env.key, name: env.name, pis: env.pis.slice(0, 1).map((pi) => ({ sessionId: pi.sessionId, title: pi.title, live: pi.live, raw: pi.raw })) })) })) })}`);
  for (let sample = 0; sample < 4; sample++) {
    await new Promise((resolve) => setTimeout(resolve, 1100));
    treeStarted = performance.now();
    const cold = await request("GET", "/api/tree", { token, etag: treeEtag });
    treeColdTimes.push(performance.now() - treeStarted);
    if (cold.status === 200) treeEtag = JSON.parse(cold.text).version;
    else if (cold.status !== 304) throw new Error(`/api/tree cold sample failed: ${cold.status}`);
  }
  for (let sample = 0; sample < 20; sample++) {
    treeStarted = performance.now();
    const warm = await request("GET", "/api/tree", { token, etag: treeEtag });
    treeWarmTimes.push(performance.now() - treeStarted);
    if (warm.status === 200) treeEtag = JSON.parse(warm.text).version;
    else if (warm.status !== 304) throw new Error(`/api/tree warm sample failed: ${warm.status}`);
  }
  treeColdTimes.sort((a, b) => a - b);
  treeWarmTimes.sort((a, b) => a - b);
  console.log(`/api/tree ${SESSION_FILES}-session fixture · cold ms p50 ${percentile(treeColdTimes, 50).toFixed(2)} p95 ${percentile(treeColdTimes, 95).toFixed(2)}; warm ms p50 ${percentile(treeWarmTimes, 50).toFixed(2)} p95 ${percentile(treeWarmTimes, 95).toFixed(2)}`);
  if ((await request("GET", "/api/tree", { token, etag: treeEtag })).status !== 304) throw new Error("/api/tree must return 304 for an unchanged ETag");
  // Fill the activity ring (300 items): each fake turn adds one "Terminou a resposta" per project.
  for (const id of openedIds) for (let turn = 0; turn < 170; turn++) await request("POST", `/api/projects/${id}/command`, { token, body: JSON.stringify({ id: `t${turn}`, type: "prompt", message: "oi" }) });
  const waitUntil = async (what, check, seconds = 40) => {
    for (const deadline = performance.now() + seconds * 1000; performance.now() < deadline; await new Promise((resolve) => setTimeout(resolve, 250))) if (await check()) return;
    throw new Error(`timed out waiting for ${what}`);
  };
  const getJson = async (pathname) => JSON.parse((await request("GET", pathname, { token })).text);
  await waitUntil("a full activity ring", async () => (await getJson("/api/activity")).items.length >= 300);
  // The fake turns queued above may still be finishing: sample once the feed has been quiet for a moment.
  let activity = await getJson("/api/activity");
  for (let quiet = 0; quiet < 4; await new Promise((resolve) => setTimeout(resolve, 250))) {
    const next = await getJson("/api/activity");
    quiet = next.seq === activity.seq ? quiet + 1 : 0;
    activity = next;
  }
  const tail = await getJson(`/api/activity?since=${activity.seq - 5}`);
  console.log(`activity sample: ${activity.items.length} items (seq ${activity.seq}), since=seq-5 -> ${tail.items.length} items`);
  if (tail.items.length !== 5) throw new Error("since cursor must return exactly the newer items");
  await waitUntil("the session index", async () => !(await getJson("/api/usage/today")).indexing);
  const usage = await getJson("/api/usage/today");
  console.log(`usage sample: ${JSON.stringify(usage)}`);
  if (!(usage.sessions >= SESSION_FILES && usage.tokens >= SESSION_FILES * 100 && usage.cost > 0)) throw new Error("usage/today must sum every indexed session");
  // A project-0 fixture whose last message is a tool call counts as running only while its file is fresh (90 s); the slow fixture
  // setup above outlives that, so touch it now: the assertion must not depend on how long the setup took.
  const inFlight = Array.from({ length: SESSION_FILES }, (_, index) => index).find((index) => index % 12 === 0 && stops[index % stops.length] === "toolUse");
  await utimes(path.join(sessionsDir, `s-${inFlight}.jsonl`), new Date(), new Date());
  const running = (await getJson("/api/projects/status")).runningCounts;
  console.log(`running counts sample: ${JSON.stringify(running)}`);
  if (!(running[openedIds[0]] >= 1)) throw new Error("runningCounts must count the in-flight conversations of the project");
  // Warm-up (JIT, sockets, caches) so the RSS baseline is the steady state, not a cold process.
  const historyPath = `/api/projects/${openedIds[0]}/history`;
  const sample = JSON.parse((await request("GET", historyPath, { token })).text).history;
  const seenStates = [...new Set(sample.map((item) => item.state))].sort();
  console.log(`history sample: ${sample.length} items, states ${seenStates.join("/")}, ${sample.filter((item) => item.isSubagent).length} sub-PI`);
  if (!sample.length || sample.some((item) => !item.state)) throw new Error("history items must carry a state");
  const fileUrl = (name) => `/api/projects/${openedIds[0]}/file?path=${name}`;
  const small = await request("GET", fileUrl("small.txt"), { token });
  const big = await request("GET", fileUrl("big.txt"), { token });
  console.log(`file sample: small.txt ${small.bytes} B, big.txt ${big.bytes} B`);
  if (small.status !== 200 || big.status !== 200 || big.bytes !== 5 * 1024 * 1024) throw new Error("file route must serve both files whole");
  for (const pathname of ["/api/resources", resourcesPath, gitFilesPath, "/api/orca", "/api/projects/status", historyPath, "/api/activity", "/api/usage/today", "/api/tasks/links?conversation=load-conversation", fileUrl("small.txt"), fileUrl("big.txt")]) await hammer("warm-up", pathname, token, WARMUP);
  await hammer("warm-up", "/api/orca/terminal-send", token, WARMUP, "POST", { handle: "load-terminal", text: "load message" });
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const warmTree = await request("GET", "/api/tree", { token });
  treeEtag = JSON.parse(warmTree.text).version;
  if ((await request("GET", "/api/tree", { token, etag: treeEtag })).status !== 304) throw new Error("warm /api/tree ETag must yield 304");

  // Leak check: one full settling pass first (V8 keeps heap it grew to, and a GC right before the
  // baseline made "before" swing 35-250 MB), then the measured pass must not grow past that plateau.
  const ENDPOINTS = [["GET /api/voice/status", "/api/voice/status"], ["GET /api/resources (cached 5 s)", "/api/resources"], ["GET /api/sessions/:id/resources", resourcesPath], ["GET /api/sessions/:id/git-files (2 paths)", gitFilesPath], ["GET /api/orca", "/api/orca"], ["GET /api/projects/status (+ running counts)", "/api/projects/status"], [`GET /api/projects/:id/history (${SESSION_FILES} session files)`, historyPath], ["GET /api/activity (ring of 300)", "/api/activity"], [`GET /api/usage/today (${SESSION_FILES} sessions)`, "/api/usage/today"], ["GET /api/tasks/links", "/api/tasks/links?conversation=load-conversation"], ["POST /api/orca/terminal-send", "/api/orca/terminal-send", "POST", { handle: "load-terminal", text: "load message" }], ["GET /api/projects/:id/file (small text, 600 B)", fileUrl("small.txt")], ["GET /api/projects/:id/file (5 MB)", fileUrl("big.txt")], ["GET /api/projects/:id/file (mix: 1 small + 1 of 5 MB)", [fileUrl("small.txt"), fileUrl("big.txt")]]];
  // The watch check appends to its session file and counts lines from a fresh start, so it runs once (measured pass).
  const runPass = async (withWatch) => {
    const out = [];
    for (const [label, pathname, method, body] of ENDPOINTS) {
      out.push(await hammer(label, pathname, token, DURATION, method || "GET", body));
      out.at(-1).rss = rssMb(server.pid);
    }
    if (withWatch) {
      out.push(await hammerWatch("GET /api/sessions/watch", token));
      out.at(-1).rss = rssMb(server.pid);
    }
    return out;
  };
  const settling = await runPass(false);
  // Name every erroring settling segment (a bare "had errors" line hid which endpoint failed).
  for (const item of settling.filter((entry) => entry.errors)) console.log(`settling pass errors: ${item.label} · errors ${item.errors} · status ${JSON.stringify(item.statuses)}`);
  await new Promise((resolve) => setTimeout(resolve, 1000));
  // Baseline = the plateau the settling pass reached (largest RSS seen in it): a leak keeps climbing past it, GC noise does not.
  const rssBefore = Math.max(rssMb(server.pid), ...settling.map((item) => item.rss));
  const spawnsBefore = await orcaSpawns();
  const psBefore = await psSpawns();
  const psListBefore = await psSpawns();
  const results = await runPass(true);
  // The pass above outlives the 90 s "fazendo" window of the fixture, so the tree version moved on: poll with the
  // current ETag, otherwise every conditional request is a full 200 and the 304 path is never measured.
  treeEtag = JSON.parse((await request("GET", "/api/tree", { token })).text).version;
  const treeLoad = await hammer("GET /api/tree (conditional)", "/api/tree", token, DURATION, "GET", undefined, treeEtag, true);
  treeLoad.rss = rssMb(server.pid);
  results.push(treeLoad);
  const treeSoak = await soakTree(token, treeEtag);
  console.log(`/api/tree 5-minute soak · 10 clients / 2 s · ${treeSoak.requests} polls · status ${JSON.stringify(treeSoak.statuses)} · errors ${treeSoak.errors} · RSS ${treeSoak.rssStart.toFixed(1)} MB → ${treeSoak.rssEnd.toFixed(1)} MB (Δ ${treeSoak.rssDelta.toFixed(1)} MB)`);
  const psListRuns = await psSpawns() - psListBefore;
  if (settling.some((item) => item.errors)) for (const item of settling.filter((entry) => entry.errors)) results.push({ ...item, label: `settling pass (errors): ${item.label}` });
  const elapsed = results.reduce((sum, item) => sum + item.seconds, 0) + 300;
  const spawns = (await orcaSpawns()) - spawnsBefore;
  const psRuns = (await psSpawns()) - psBefore;
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const rssAfter = rssMb(server.pid);

  const fmt = (value, digits = 1) => value.toFixed(digits);
  console.log(`\nLoad test · concurrency ${CONCURRENCY} · ${DURATION}s per endpoint · server pid ${server.pid} port ${port}\n`);
  for (const item of results) {
    console.log(`${item.label}\n  requests ${item.requests} in ${fmt(item.seconds)}s = ${fmt(item.rps, 0)} req/s · latency ms p50 ${fmt(item.p50, 2)} p95 ${fmt(item.p95, 2)} p99 ${fmt(item.p99, 2)} max ${fmt(item.max, 2)} · errors ${item.errors} · status ${JSON.stringify(item.statuses)} · RSS after ${fmt(item.rss)} MB`);
  }
  const bound = Math.ceil(elapsed / 2) + 2;
  console.log(`\norca child processes during the run: ${spawns} (bound for ${fmt(elapsed)}s with a 2 s cache: ${bound})`);
  const psBound = Math.ceil(elapsed / 5) + 2;
  console.log(`process-table sampler runs during the run: ${psRuns} (bound for ${fmt(elapsed)}s with a 5 s cache: ${psBound})`);
  console.log(`process-list child processes during /api/tree load: ${psListRuns} (5 s cache; expected bounded)`);
  console.log(`server RSS: after the settling pass ${fmt(rssBefore)} MB, after ${fmt(rssAfter)} MB (Δ ${fmt(rssAfter - rssBefore)} MB, limit ${RSS_GROWTH_LIMIT_MB} MB)`);
  const problems = [];
  if (results.some((item) => item.errors)) problems.push("request errors");
  if (spawns > bound) problems.push("orca spawns exceed the cache bound");
  if (psRuns > psBound) problems.push("sampler spawns exceed the cache bound");
  // Window = the /api/tree segment plus the 5-minute soak (both poll the process list through its 5 s cache).
  if (psListRuns > Math.ceil((DURATION + 300) / 5) + 2) problems.push("process-list spawns exceed the 5 s cache bound");
  console.log(`stale keep-alive sockets retried once: ${staleSocketRetries}`);
  // `>= 1` (not `< 1`): a segment with no 304 at all leaves statuses[304] undefined, and `undefined < 1` is false.
  if (!(treeLoad.statuses[304] >= 1)) problems.push("/api/tree did not return unchanged 304 responses");
  // Baseline regressions measured at multi-second p50; unchanged refreshes should stay below the 500 ms p95 budget.
  if (treeLoad.p95 >= 500) problems.push("/api/tree conditional p95 exceeded 500 ms");
  const historyLoad = results.find((item) => item.label.startsWith("GET /api/projects/:id/history"));
  // Baseline served 100-200 req/s; 50 req/s leaves margin while rejecting the prior 25 req/s regression.
  if (!historyLoad || historyLoad.requests < 50 * DURATION) problems.push("history throughput below 50 requests per second");
  if (treeSoak.errors || treeSoak.statuses[304] < treeSoak.requests * 0.9) problems.push("/api/tree soak did not sustain unchanged 304 polls");
  if (treeSoak.rssDelta > RSS_GROWTH_LIMIT_MB) problems.push("/api/tree soak RSS growth");
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
