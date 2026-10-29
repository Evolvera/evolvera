#!/usr/bin/env node
// Browser-check harness for the sidebar tree. NOT part of `npm test`; it never touches real PI state.
// Starts the real Studio (server.mjs, fake PI, owned temp dirs, PI_WEB_PORT=0) behind a small proxy that adds the
// `/api/tree` the sidebar polls (S1 owns the real one). The proxy is the only place the tree is stubbed.
//
//   node test/fake-tree-server.mjs            -> prints {"url": "http://127.0.0.1:PORT/"} and serves until GET /__quit
//   GET  /__stats                             -> { requests, ok, notModified, failed }
//   POST /__tree  (JSON tree)                 -> replaces the fixture and bumps the version
//   POST /__fail  ({ status: 500 | null })    -> /api/tree answers that status until reset
//   GET  /__quit                              -> stops Studio and exits, removing the temp dirs
import { spawn } from "node:child_process";
import http from "node:http";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const tmp = await mkdtemp(path.join(os.tmpdir(), "pi-studio-tree-"));
const agentDir = path.join(tmp, "agent");
const rootsDir = path.join(tmp, "roots");
const projects = [path.join(rootsDir, "Piloto de Teste"), path.join(rootsDir, "Sanvera")];
for (const dir of [...projects, path.join(agentDir, "sessions", "--fake--")]) await mkdir(dir, { recursive: true });
for (const dir of projects) await writeFile(path.join(dir, "package.json"), "{}\n");

// A real session file the sidebar can open (followed read-only: a terminal PI "owns" it).
const realSession = path.join(agentDir, "sessions", "--fake--", "2026-01-01_real.jsonl");
await writeFile(realSession, [
  JSON.stringify({ type: "session", version: 3, id: "real-1", timestamp: new Date().toISOString(), cwd: projects[0] }),
  JSON.stringify({ type: "message", id: "m1", parentId: null, timestamp: new Date().toISOString(), message: { role: "user", content: "Conversa de teste da barra lateral" } }),
  JSON.stringify({ type: "message", id: "m2", parentId: "m1", timestamp: new Date().toISOString(), message: { role: "assistant", content: [{ type: "text", text: "Resposta de teste." }] } }),
].join("\n"));

const orcaState = path.join(tmp, "orca-state.json");
await writeFile(orcaState, JSON.stringify({ mode: "normal", active: null, worktrees: [] }));
const studio = spawn(process.execPath, [path.join(root, "server.mjs")], {
  cwd: root,
  env: {
    ...process.env, PI_WEB_PORT: "0", PI_AGENT_DIR: agentDir, PI_PROJECT_ROOTS: rootsDir,
    PI_STUDIO_ORCA_BIN: process.execPath, PI_STUDIO_ORCA_BIN_ARGS: JSON.stringify([path.join(here, "fake-orca.mjs")]), FAKE_ORCA_STATE: orcaState,
    PI_WEB_PI_BIN: process.execPath, PI_WEB_PI_BIN_ARGS: JSON.stringify([path.join(here, "fake-pi-rpc.mjs")]),
  },
  stdio: ["ignore", "pipe", "pipe"],
});
const studioPort = await new Promise((resolve, reject) => {
  let output = "";
  const timer = setTimeout(() => reject(new Error(`Studio did not start:\n${output}`)), 8000);
  const onData = (chunk) => {
    output += chunk;
    const match = output.match(/http:\/\/127\.0\.0\.1:(\d+)/);
    if (match) { clearTimeout(timer); resolve(Number(match[1])); }
  };
  studio.stdout.on("data", onData);
  studio.stderr.on("data", onData);
  studio.on("exit", (code) => reject(new Error(`Studio exited ${code}:\n${output}`)));
});
const studioBase = `http://127.0.0.1:${studioPort}`;
const token = (await (await fetch(studioBase)).text()).match(/name="pi-studio-token" content="([^"]+)"/)?.[1] ?? "";
const known = (await (await fetch(`${studioBase}/api/projects`, { headers: { "x-pi-studio-token": token } })).json()).projects;
const projectOf = (dir) => known.find((item) => path.resolve(item.cwd).toLowerCase() === path.resolve(dir).toLowerCase());

const now = Date.now();
const raw = (patch = {}) => ({ busy: false, streaming: false, waitingUi: false, error: false, stalledMs: null, orcaState: null, ...patch });
const pi = (id, title, patch = {}) => ({
  sessionPath: id.startsWith("/") || id.includes(":") ? id : `/fake/${id}.jsonl`, sessionId: id, title, agentType: null, isSubagent: false, live: null, raw: raw(),
  pendingQuestions: { total: 0, blocking: 0 }, lastAssistantAt: null, updatedAt: now - 120_000, startedAt: now - 3_600_000, children: [], ...patch,
});
const live = (owner = "orca") => ({ pid: 4242, owner, startedAt: now - 600_000 });
const working = { live: live(), raw: raw({ streaming: true, busy: true }), updatedAt: now - 3000 };
const sub = (id, title, type, patch = {}) => pi(id, title, { isSubagent: true, agentType: type, ...patch });

function fixture() {
  const [a, b] = [projectOf(projects[0]), projectOf(projects[1])];
  return {
    version: "", generatedAt: now,
    projects: [
      { id: a.id, name: a.name, cwd: a.cwd, envs: [
        { key: "wt1", name: "Working", branch: "master", primary: true, path: a.cwd, orca: true, orcaStatus: "working", issue: null, morePis: 5, pis: [
          pi("visual", "PI Visual - bash: cd C:/Users/Miguel/projeto && npm run build", { ...working, children: [
            sub("c1", "Mapear arquivos da barra lateral", "scout", { ...working }),
            sub("c2", "Revisar o CSS dos indicadores", "reviewer", { lastAssistantAt: now - 5000, updatedAt: now - 5000 }),
            sub("c3", "Ler README", "scout", { updatedAt: now - 3_000_000 }),
          ] }),
          pi("work", "Evolvera Work \u2014 WhatsApp integration \uD83D\uDE80 com um t\u00EDtulo bem comprido para testar a elipse", { lastAssistantAt: now - 60_000, updatedAt: now - 60_000 }),
          pi("ctx", "Contexto Sanvera demo", { ...working, pendingQuestions: { total: 1, blocking: 0 } }),
          pi("perm", "Precisa de permiss\u00E3o para rodar rm -rf", { live: live("terminal"), raw: raw({ waitingUi: true }), updatedAt: now - 20_000 }),
          pi("old", "Conversa antiga sem novidades", { updatedAt: now - 5 * 86_400_000 }),
          pi(realSession, "Sess\u00E3o real (acompanhando)", { live: live("terminal"), raw: raw({ streaming: true }), updatedAt: now - 1000 }),
        ] },
        { key: "wt2", name: "Auxiliar", branch: "fix-macos-launcher-pid", primary: false, path: `${a.cwd}-aux`, orca: true, orcaStatus: "idle", issue: "#42", morePis: 0, pis: [
          pi("aux1", "READ ONLY precise candidates for the launcher", { ...working }),
          pi("aux2", "\u65E5\u672C\u8A9E\u306E\u30BF\u30A4\u30C8\u30EB \u0645\u0631\u062D\u0628\u0627", { updatedAt: now - 7_200_000 }),
        ] },
      ] },
      { id: b.id, name: b.name, cwd: b.cwd, envs: [
        { key: "main", name: "main", branch: "main", primary: true, path: b.cwd, orca: false, orcaStatus: null, issue: null, morePis: 0, pis: [
          pi("san1", "Planejar a migra\u00E7\u00E3o do banco", { lastAssistantAt: now - 90_000, updatedAt: now - 90_000 }),
        ] },
      ] },
    ],
  };
}

let tree = fixture();
let version = 1;
let failStatus = null;
const stats = { requests: 0, ok: 0, notModified: 0, failed: 0 };

const readBody = (req) => new Promise((resolve) => { let text = ""; req.on("data", (c) => { text += c; }); req.on("end", () => resolve(text)); });
const json = (res, status, body, headers = {}) => { res.writeHead(status, { "content-type": "application/json", ...headers }); res.end(JSON.stringify(body)); };

const proxy = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/__quit") {
    res.end("bye");
    studio.kill();
    await rm(tmp, { recursive: true, force: true }).catch(() => {});
    process.exit(0);
  }
  if (url.pathname === "/__stats") return json(res, 200, stats);
  if (url.pathname === "/__tree" && req.method === "POST") {
    tree = JSON.parse(await readBody(req));
    version++;
    return json(res, 200, { version });
  }
  if (url.pathname === "/__fail" && req.method === "POST") {
    failStatus = JSON.parse(await readBody(req)).status ?? null;
    return json(res, 200, { failStatus });
  }
  if (url.pathname === "/api/tree") {
    stats.requests++;
    if (failStatus) { stats.failed++; return json(res, failStatus, { error: "forced" }); }
    const etag = `v${version}`;
    if (req.headers["if-none-match"] === etag) { stats.notModified++; res.writeHead(304, { etag }); return res.end(); }
    stats.ok++;
    return json(res, 200, { ...tree, version: etag, generatedAt: Date.now() }, { etag });
  }
  // Everything else is the real Studio; it only answers its own authority, so Host/Origin are rewritten.
  const headers = { ...req.headers, host: `127.0.0.1:${studioPort}` };
  if (headers.origin) headers.origin = `http://127.0.0.1:${studioPort}`;
  const upstream = http.request({ host: "127.0.0.1", port: studioPort, path: req.url, method: req.method, headers }, (response) => {
    res.writeHead(response.statusCode, response.headers);
    response.pipe(res);
  });
  upstream.on("error", () => res.destroy());
  res.on("close", () => upstream.destroy());
  req.pipe(upstream);
});

await new Promise((resolve) => proxy.listen(0, "127.0.0.1", resolve));
console.log(JSON.stringify({ url: `http://127.0.0.1:${proxy.address().port}/`, realSession, projects: known.map((item) => ({ id: item.id, name: item.name })) }));
