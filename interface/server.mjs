#!/usr/bin/env node
import { createServer } from "node:http";
import { execFile, execFileSync, spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { access, open, readdir, readFile, stat } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { ACTIVITY_LIMIT, UI_DIALOG_METHODS, activityFromEvent, addUsage, foldText, localDay, newActivityTracker, normalizeOrca, rankFiles, searchSnippet, stallThresholds, sumUsage } from "./public/lib.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");
const DEFAULT_HOST = process.env.PI_WEB_HOST || "127.0.0.1";
const DEFAULT_PORT = Number.parseInt(process.env.PI_WEB_PORT || "4123", 10);
let listeningPort = DEFAULT_PORT;
const apiToken = randomBytes(32).toString("hex");
const AGENT_DIR = process.env.PI_AGENT_DIR || path.join(homedir(), ".pi", "agent");
const MAX_BODY_BYTES = 30 * 1024 * 1024;
const HISTORY_LIMIT = 800;
const SESSION_SCAN_MAX_BYTES = 5 * 1024 * 1024;
const SEARCH_LIMIT = 30;
const SEARCH_MIN_CHARS = 2;
const SEARCH_TEXT_CAP = 64 * 1024;
const SEARCH_REFRESH_INTERVAL_MS = 15_000;
const SEARCH_INDEX_CONCURRENCY = 4;
const LOG_LIMIT = 1000;
const PROJECT_LIMIT = Number.parseInt(process.env.PI_WEB_PROJECT_LIMIT || "200", 10);
const PROJECT_MARKERS = new Set([
  ".git",
  ".pi",
  "AGENTS.md",
  "package.json",
  "pnpm-workspace.yaml",
  "pyproject.toml",
  "Cargo.toml",
  "go.mod",
  "composer.json",
  "Gemfile",
  "deno.json",
]);
const SKIP_DIRS = new Set([
  ".Trash",
  ".cache",
  ".npm",
  ".bun",
  ".config",
  "Library",
  "Applications",
  "Movies",
  "Music",
  "Pictures",
  "node_modules",
]);

const sessions = new Map();
const projects = new Map();
// Projects opened by path (e.g. Orca worktrees): discovery rebuilds `projects`, so they are re-added each time.
const addedProjects = new Map();
const serverLogs = [];
const STALL = stallThresholds(process.env);

// Bounded in-memory feed of notable events of every PI (turn finished, subagents, errors, dialogs, exits).
// `seq` only grows, so a client polls with `since=<last seq>`; a cursor past the newest seq (server restarted) resets it.
export class ActivityLog {
  constructor(limit = ACTIVITY_LIMIT) {
    this.limit = limit;
    this.items = [];
    this.seq = 0;
  }

  push(entry) {
    const item = { seq: ++this.seq, ...entry };
    this.items.push(item);
    if (this.items.length > this.limit) this.items.shift();
    return item;
  }

  since(cursor) {
    const reset = cursor > this.seq;
    const from = reset ? 0 : cursor;
    return { items: this.items.filter((item) => item.seq > from), seq: this.seq, reset };
  }
}

export const activityLog = new ActivityLog();

function recordLog(level, message, details = undefined) {
  const entry = { at: new Date().toISOString(), level, message, details };
  serverLogs.push(entry);
  if (serverLogs.length > LOG_LIMIT) serverLogs.shift();
  return entry;
}

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  });
  res.end(body);
}

function text(res, status, payload, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "content-type": contentType,
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
  });
  res.end(payload);
}

function sendSse(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeName(value) {
  return String(value || "").replace(/[\u0000-\u001f]/g, "").trim();
}

// Windows paths are case-insensitive (session dirs exist as both `C--` and `c--`).
export function cwdKey(cwd, platform = process.platform) {
  const resolved = path.resolve(cwd);
  return platform === "win32" ? resolved.toLowerCase() : resolved;
}

// Sessions recorded by a host PI (e.g. Windows "C:\\Users\\me\\proj") are visible to a
// containerized PI Studio only through a bind mount. PI_WEB_PATH_MAP maps host prefixes to
// mount points: JSON [["C:/Users/me", "/home/me"], ...]. Matching ignores slash style and,
// for drive-letter prefixes, case. Unmapped paths are returned unchanged.
export function parsePathMap(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((pair) => Array.isArray(pair) && pair.length === 2 && pair.every((part) => typeof part === "string" && part))) return parsed;
  } catch {
    // fall through to the warning
  }
  recordLog("warn", "Ignoring PI_WEB_PATH_MAP; expected JSON [[from, to], ...].");
  return [];
}

export function mapHostPath(value, pathMap) {
  const slashed = String(value).replace(/\\/g, "/");
  for (const [from, to] of pathMap) {
    const prefix = from.replace(/\\/g, "/").replace(/\/+$/, "");
    const head = slashed.slice(0, prefix.length);
    const matches = /^[A-Za-z]:/.test(prefix) ? head.toLowerCase() === prefix.toLowerCase() : head === prefix;
    const rest = slashed.slice(prefix.length);
    if (matches && (rest === "" || rest.startsWith("/"))) return to.replace(/\/+$/, "") + rest;
  }
  return value;
}

const PATH_MAP = parsePathMap(process.env.PI_WEB_PATH_MAP);

function projectIdFor(cwd) {
  return createHash("sha1").update(cwdKey(cwd)).digest("hex").slice(0, 16);
}

function parseStringArrayEnv(name) {
  const raw = process.env[name];
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) return parsed;
  } catch {
    // Allow PATH-style env as a convenience.
  }
  return raw.split(path.delimiter).map((item) => item.trim()).filter(Boolean);
}

function parsePiPrefixArgs(env = process.env) {
  const raw = env.PI_WEB_PI_BIN_ARGS;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) return parsed;
  } catch {
    // Fall through to safe default.
  }
  recordLog("warn", "Ignoring PI_WEB_PI_BIN_ARGS; expected JSON array of strings.");
  return [];
}

const PI_CLI_PARTS = ["@earendil-works", "pi-coding-agent", "dist", "cli.js"];

// `npm root -g` without a shell: npm.cmd cannot be spawned directly on Windows,
// so run npm's own JS entry point with the current node binary.
export function runNpmRootGlobal({ nodeBin = process.execPath, npmCli = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js") } = {}) {
  if (!existsSync(npmCli)) return null;
  try {
    const output = execFileSync(nodeBin, [npmCli, "root", "-g"], { encoding: "utf8", timeout: 15000, windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
    return output.trim() || null;
  } catch {
    return null;
  }
}

export function npmGlobalRootCandidates({ env = process.env, execPath = process.execPath, runNpmRoot = runNpmRootGlobal } = {}) {
  const roots = [runNpmRoot()];
  if (env.APPDATA) roots.push(path.win32.join(env.APPDATA, "npm", "node_modules"));
  roots.push(path.win32.join(path.win32.dirname(execPath), "node_modules"));
  return [...new Set(roots.filter(Boolean))];
}

// On win32 `pi` is `pi.cmd`, which spawn() cannot run without `shell: true`.
// Spawn node with the globally installed CLI script instead.
export function resolvePiCommand({
  platform = process.platform,
  env = process.env,
  execPath = process.execPath,
  runNpmRoot = runNpmRootGlobal,
  npmRoots = () => npmGlobalRootCandidates({ env, execPath, runNpmRoot }),
  exists = existsSync,
  log = recordLog,
} = {}) {
  const prefixArgs = parsePiPrefixArgs(env);
  if (env.PI_WEB_PI_BIN) return { bin: env.PI_WEB_PI_BIN, prefixArgs, source: "env" };
  if (platform !== "win32") return { bin: "pi", prefixArgs, source: "path" };
  const roots = npmRoots();
  for (const root of roots) {
    const cli = path.win32.join(root, ...PI_CLI_PARTS);
    if (exists(cli)) return { bin: execPath, prefixArgs: [cli, ...prefixArgs], source: "npm-global" };
  }
  log("error", "PI CLI not found in the global npm root; falling back to `pi` (set PI_WEB_PI_BIN to fix).", { searched: roots });
  return { bin: "pi", prefixArgs, source: "fallback" };
}

export function buildPiArgs({ prefixArgs = [], name, cwd, env = process.env }) {
  const args = [...prefixArgs, "--mode", "rpc", "--name", name || path.basename(cwd) || "pi-web"];
  if (env.PI_WEB_PROVIDER) args.push("--provider", env.PI_WEB_PROVIDER);
  if (env.PI_WEB_MODEL) args.push("--model", env.PI_WEB_MODEL);
  return args;
}

let cachedPiCommand = null;
export function piCommand() {
  cachedPiCommand ??= resolvePiCommand();
  return cachedPiCommand;
}

async function readJsonBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.byteLength;
    if (size > MAX_BODY_BYTES) {
      const err = new Error("Request body too large");
      err.statusCode = 413;
      throw err;
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch (error) {
    error.statusCode = 400;
    error.message = `Invalid JSON body: ${error.message}`;
    throw error;
  }
}

async function pathExists(filePath) {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(filePath) {
  try {
    return (await stat(filePath)).isDirectory();
  } catch {
    return false;
  }
}

async function looksLikeProject(dir) {
  for (const marker of PROJECT_MARKERS) {
    if (await pathExists(path.join(dir, marker))) return true;
  }
  return false;
}

function parseFrontmatter(markdown) {
  if (!markdown.startsWith("---")) return {};
  const end = markdown.indexOf("\n---", 3);
  if (end === -1) return {};
  const block = markdown.slice(3, end).trim();
  const data = {};
  for (const line of block.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    data[key] = rawValue.trim().replace(/^['"]|['"]$/g, "");
  }
  return data;
}

async function readAgentsFromDir(dir, scope) {
  if (!(await isDirectory(dir))) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const agents = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const filePath = path.join(dir, entry.name);
    const content = await readFile(filePath, "utf8");
    const fm = parseFrontmatter(content);
    const fallbackName = entry.name.replace(/\.md$/i, "");
    const bodyTitle = content.match(/^#\s+(.+)$/m)?.[1];
    agents.push({
      name: fm.name || fallbackName,
      description: fm.description || bodyTitle || "Custom Pi agent",
      model: fm.model || undefined,
      thinking: fm.thinking || undefined,
      tools: fm.tools || undefined,
      scope,
      path: filePath,
    });
  }
  return agents;
}

async function listAgents(cwd = process.cwd()) {
  const dirs = [
    { dir: path.join(AGENT_DIR, "agents"), scope: "global" },
    { dir: path.join(cwd, ".pi", "agents"), scope: "project" },
  ];
  const byName = new Map();
  for (const { dir, scope } of dirs) {
    for (const agent of await readAgentsFromDir(dir, scope)) byName.set(agent.name, agent);
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function readdirSafe(dir) {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

// Reads only the head of the file: session JSONL can be many MB, the header is one short line.
export async function readFirstLine(filePath, maxBytes = 16 * 1024) {
  const handle = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(maxBytes);
    const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0);
    const head = buffer.subarray(0, bytesRead).toString("utf8");
    const newline = head.indexOf("\n");
    return (newline === -1 ? head : head.slice(0, newline)).replace(/\r$/, "");
  } finally {
    await handle.close();
  }
}

// Projects the user actually used with PI: cwd from each session header, newest first,
// keeping only directories that still exist.
export async function discoverHistoryProjects(sessionsDir, pathMap = PATH_MAP) {
  const byKey = new Map();
  for (const dir of await readdirSafe(sessionsDir)) {
    if (!dir.isDirectory()) continue;
    const fullDir = path.join(sessionsDir, dir.name);
    for (const file of await readdirSafe(fullDir)) {
      if (!file.isFile() || !file.name.endsWith(".jsonl")) continue;
      const filePath = path.join(fullDir, file.name);
      try {
        const header = JSON.parse(await readFirstLine(filePath));
        if (header?.type !== "session" || typeof header.cwd !== "string" || !header.cwd) continue;
        const { mtimeMs } = await stat(filePath);
        const cwd = mapHostPath(header.cwd, pathMap);
        const key = cwdKey(cwd);
        const previous = byKey.get(key);
        if (!previous || mtimeMs > previous.lastUsedMs) byKey.set(key, { cwd: path.resolve(cwd), lastUsedMs: mtimeMs });
      } catch {
        // Ignore malformed/partial session files.
      }
    }
  }
  const out = [];
  for (const item of byKey.values()) {
    if (await isDirectory(item.cwd)) out.push(item);
  }
  return out.sort((a, b) => b.lastUsedMs - a.lastUsedMs);
}

// Recently used projects first (newest first), then the rest alphabetically.
export function sortProjects(list) {
  return [...list].sort((a, b) => {
    if (a.lastUsedAt && b.lastUsedAt) return b.lastUsedAt.localeCompare(a.lastUsedAt);
    if (a.lastUsedAt || b.lastUsedAt) return a.lastUsedAt ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

async function getProjectRoots() {
  const explicit = parseStringArrayEnv("PI_PROJECT_ROOTS");
  if (explicit.length) return explicit.map((item) => path.resolve(item));
  const workspace = process.env.PI_WORKSPACES_DIR || ((await isDirectory("/workspaces")) ? "/workspaces" : homedir());
  return [path.resolve(workspace)];
}

async function discoverProjects() {
  const found = new Map();
  for (const root of await getProjectRoots()) {
    if (!(await isDirectory(root))) continue;
    if (await looksLikeProject(root)) {
      const project = makeProject(root, root);
      found.set(project.id, project);
    }
    let entries = [];
    try {
      entries = await readdir(root, { withFileTypes: true });
    } catch (error) {
      recordLog("warn", `Cannot read project root ${root}`, { error: error.message });
      continue;
    }
    for (const entry of entries) {
      if (found.size >= PROJECT_LIMIT) break;
      if (!entry.isDirectory() || SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
      const cwd = path.join(root, entry.name);
      if (!(await looksLikeProject(cwd))) continue;
      const project = makeProject(cwd, root);
      found.set(project.id, project);
    }
  }
  for (const item of await discoverHistoryProjects(path.join(AGENT_DIR, "sessions"))) {
    const lastUsedAt = new Date(item.lastUsedMs).toISOString();
    const id = projectIdFor(item.cwd);
    if (found.has(id)) found.get(id).lastUsedAt = lastUsedAt;
    else if (found.size < PROJECT_LIMIT) found.set(id, { ...makeProject(item.cwd, path.dirname(item.cwd)), lastUsedAt });
  }
  if (found.size === 0) {
    const fallback = makeProject(process.cwd(), path.dirname(process.cwd()));
    found.set(fallback.id, fallback);
  }
  for (const added of addedProjects.values()) {
    if (!found.has(added.id)) found.set(added.id, { ...makeProject(added.cwd, added.root), lastUsedAt: added.lastUsedAt });
  }
  projects.clear();
  for (const project of sortProjects([...found.values()])) projects.set(project.id, project);
  return [...projects.values()];
}

function makeProject(cwd, root) {
  const resolved = path.resolve(cwd);
  const active = [...sessions.values()].find((session) => session.cwd === resolved && !session.exited);
  return {
    id: projectIdFor(resolved),
    name: path.basename(resolved) || resolved,
    cwd: resolved,
    root,
    activeSessionId: active?.id || null,
    hasGit: false,
    lastUsedAt: null,
  };
}

async function ensureProject(projectId) {
  if (!projects.has(projectId)) await discoverProjects();
  const project = projects.get(projectId);
  if (!project) {
    const error = new Error("Unknown project");
    error.statusCode = 404;
    throw error;
  }
  return project;
}

export class PiRpcSession {
  constructor(options) {
    this.id = randomUUID();
    this.projectId = options.projectId;
    this.projectName = options.projectName;
    this.cwd = path.resolve(options.cwd || process.cwd());
    this.createdAt = new Date().toISOString();
    this.clients = new Set();
    this.history = [];
    this.stdoutBuffer = "";
    this.stderrBuffer = "";
    this.exited = false;
    this.exitCode = null;
    this.signal = null;
    this.options = options;
    this.proc = null;
    this.lastState = null;
    this.answeredUi = new Set();
    // Live activity for /api/projects/status: a dialog stays pending until answered (or until its timeout passes).
    this.streaming = false;
    this.pendingUi = new Map();
    this.lastEventAt = Date.now();
    this.activity = newActivityTracker();
  }

  // Notable PI events (see activityFromEvent) go to the shared feed, tagged with this project.
  note(payload, now = Date.now()) {
    for (const item of activityFromEvent(payload, this.activity, now)) {
      activityLog.push({ at: now, projectId: this.projectId, projectName: this.projectName, ...item });
    }
  }

  start() {
    const { bin: piBin, prefixArgs } = piCommand();
    const args = buildPiArgs({ prefixArgs, name: this.projectName, cwd: this.cwd });

    this.proc = spawn(piBin, args, {
      cwd: this.cwd,
      env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.proc.stdout.setEncoding("utf8");
    this.proc.stderr.setEncoding("utf8");
    this.proc.stdout.on("data", (chunk) => this.consumeStdout(chunk));
    this.proc.stderr.on("data", (chunk) => this.consumeStderr(chunk));
    // A write racing PI's exit fails asynchronously (EPIPE/ECONNRESET on stdin). Without a
    // listener that is an uncaught exception that would kill PI Studio; the exit handler
    // already reports the process end, so only log it.
    this.proc.stdin.on("error", (error) => {
      recordLog("warn", `PI stdin closed for ${this.cwd}`, { error: error.message });
    });
    // A spawn failure (no pid: missing binary, vanished cwd) never emits "exit", so it ends the session
    // here; an error on a running PI (e.g. a failed kill) is only noted and its later exit still counts.
    this.proc.on("error", (error) => {
      if (this.proc.pid === undefined) return this.finalizeTerminal("error", error);
      recordLog("error", `PI process error for ${this.cwd}`, { error: error.message });
      const payload = { type: "process_error", message: error.message };
      this.note(payload);
      this.broadcast("process_error", payload);
    });
    this.proc.on("exit", (code, signal) => this.finalizeTerminal("exit", null, code, signal));
    this.proc.on("close", (code, signal) => this.finalizeTerminal("close", null, code, signal));

    recordLog("info", `Started PI for ${this.cwd}`, { sessionId: this.id, piBin, args: redactArgs(args) });
    this.broadcast("session_ready", {
      type: "session_ready",
      id: this.id,
      projectId: this.projectId,
      projectName: this.projectName,
      cwd: this.cwd,
      createdAt: this.createdAt,
      piBin,
      args: redactArgs(args),
    });

    setTimeout(() => {
      try {
        this.send({ id: "bootstrap-state", type: "get_state" });
        this.send({ id: "bootstrap-commands", type: "get_commands" });
      } catch {
        // The process may have failed immediately; process_error covers it.
      }
    }, 250);
  }

  finalizeTerminal(kind, error = null, code = null, signal = null) {
    if (this.exited) return;
    this.exited = true;
    this.exitCode = code;
    this.signal = signal;
    if (kind === "error") {
      recordLog("error", `PI process error for ${this.cwd}`, { error: error.message });
      const payload = { type: "process_error", message: error.message };
      this.note(payload);
      this.broadcast("process_error", payload);
    } else {
      recordLog("info", `PI exited for ${this.cwd}`, { code, signal });
      const payload = { type: "process_exit", code, signal };
      this.note(payload);
      this.broadcast("process_exit", payload);
    }
    for (const client of this.clients) client.end();
    this.clients.clear();
  }

  consumeStdout(chunk) {
    this.stdoutBuffer += chunk;
    let newlineIndex = this.stdoutBuffer.indexOf("\n");
    while (newlineIndex !== -1) {
      let line = this.stdoutBuffer.slice(0, newlineIndex);
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      this.handleStdoutLine(line);
      newlineIndex = this.stdoutBuffer.indexOf("\n");
    }
  }

  consumeStderr(chunk) {
    this.stderrBuffer += chunk;
    let newlineIndex = this.stderrBuffer.indexOf("\n");
    while (newlineIndex !== -1) {
      let line = this.stderrBuffer.slice(0, newlineIndex);
      this.stderrBuffer = this.stderrBuffer.slice(newlineIndex + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line.trim()) {
        recordLog("stderr", line, { sessionId: this.id, cwd: this.cwd });
        this.broadcast("stderr", { type: "stderr", text: line });
      }
      newlineIndex = this.stderrBuffer.indexOf("\n");
    }
  }

  handleStdoutLine(line) {
    if (!line.trim()) return;
    try {
      const payload = JSON.parse(line);
      this.track(payload);
      if (payload.type === "response" && payload.command === "get_state" && payload.success) this.lastState = payload.data;
      this.broadcast("rpc", payload);
    } catch (error) {
      this.broadcast("stdout", { type: "stdout", text: line, parseError: error.message });
    }
  }

  track(payload, now = Date.now()) {
    this.lastEventAt = now;
    this.note(payload, now);
    if (payload.type === "agent_start") this.streaming = true;
    else if (payload.type === "agent_end") this.streaming = false;
    else if (payload.type === "extension_ui_request" && UI_DIALOG_METHODS.has(payload.method) && payload.id) {
      this.pendingUi.set(payload.id, payload.timeout > 0 ? now + payload.timeout : Infinity);
    }
  }

  statusSummary(now = Date.now()) {
    return {
      projectId: this.projectId,
      sessionId: this.id,
      streaming: !this.exited && this.streaming,
      waitingUi: !this.exited && [...this.pendingUi.values()].some((expiry) => expiry > now),
      exited: this.exited,
      lastEventAt: this.lastEventAt,
    };
  }

  broadcast(event, payload) {
    const envelope = { event, payload, at: new Date().toISOString() };
    this.history.push(envelope);
    if (this.history.length > HISTORY_LIMIT) this.history.shift();
    for (const client of this.clients) sendSse(client, event, payload);
  }

  addClient(res) {
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    res.write(`: connected ${this.id}\n\n`);
    let replayed = 0;
    for (const item of this.history) {
      // A dialog already answered must not pop up again on reconnect.
      if (item.payload?.type === "extension_ui_request" && this.answeredUi.has(item.payload.id)) continue;
      sendSse(res, item.event, item.payload);
      replayed++;
    }
    // Lets the client tell buffered history from live events.
    sendSse(res, "replay_done", { type: "replay_done", count: replayed });
    const heartbeat = setInterval(() => res.write(": ping\n\n"), 15000);
    this.clients.add(res);
    res.on("close", () => {
      clearInterval(heartbeat);
      this.clients.delete(res);
    });
  }

  send(command) {
    if (!isPlainObject(command)) throw new Error("RPC command must be a JSON object");
    if (!this.proc || this.exited || !this.proc.stdin.writable) throw new Error("Pi RPC process is not running");
    this.proc.stdin.write(`${JSON.stringify(command)}\n`);
    if (command.type === "extension_ui_response" && command.id) {
      this.answeredUi.add(command.id);
      this.pendingUi.delete(command.id);
      this.note(command);
    }
  }

  stop() {
    if (!this.proc || this.exited) return;
    this.proc.kill("SIGTERM");
    setTimeout(() => {
      if (!this.exited) this.proc.kill("SIGKILL");
    }, 2500).unref();
  }

  summary() {
    return {
      id: this.id,
      projectId: this.projectId,
      projectName: this.projectName,
      cwd: this.cwd,
      createdAt: this.createdAt,
      exited: this.exited,
      exitCode: this.exitCode,
      signal: this.signal,
      clientCount: this.clients.size,
      sessionId: this.lastState?.sessionId,
      sessionName: this.lastState?.sessionName,
      model: this.lastState?.model,
      isStreaming: this.lastState?.isStreaming ?? false,
    };
  }
}

function redactArgs(args) {
  return args.map((arg) => (/key|token|auth|secret/i.test(String(arg)) ? "[redacted]" : arg));
}

async function openProjectPayload(project) {
  const session = await getOrStartProjectSession(project);
  return { project, session: session.summary(), agents: await listAgents(project.cwd), history: await listProjectHistory(project) };
}

async function getOrStartProjectSession(project) {
  const existing = [...sessions.values()].find((session) => session.projectId === project.id && !session.exited);
  if (existing) return existing;
  const session = new PiRpcSession({ projectId: project.id, projectName: project.name, cwd: project.cwd });
  sessions.set(session.id, session);
  session.start();
  return session;
}

function messageText(message) {
  if (!message) return "";
  if (typeof message.content === "string") return message.content;
  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => (part?.type === "text" ? part.text || "" : ""))
      .filter(Boolean)
      .join(" ");
  }
  return "";
}

function compactTitle(text, fallback) {
  const cleaned = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return fallback;
  return cleaned.length > 72 ? `${cleaned.slice(0, 69)}…` : cleaned;
}

// One bounded pass over a session file: its title (the latest `session_info` name, else the first
// user prompt, else `fallback`) and, for a folded query, a snippet of the first matching user/assistant
// message. Streams at most `maxBytes`, so a huge session is never loaded whole; a line cut by the cap
// fails to parse and is skipped.
export async function scanSession(filePath, { foldedQuery = "", maxBytes = SESSION_SCAN_MAX_BYTES, fallback = "Nova conversa" } = {}) {
  const input = createReadStream(filePath, { encoding: "utf8", end: maxBytes - 1 });
  let name = "";
  let firstPrompt = "";
  let snippet = "";
  for await (const line of createInterface({ input, crlfDelay: Infinity })) {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry?.type === "session_info") {
      name = typeof entry.name === "string" ? entry.name.trim() : "";
    } else if (entry?.type === "message" && (entry.message?.role === "user" || entry.message?.role === "assistant")) {
      const body = messageText(entry.message);
      if (entry.message.role === "user" && !firstPrompt) firstPrompt = body;
      if (!snippet) snippet = searchSnippet(body, foldedQuery);
    }
  }
  return { title: compactTitle(name || firstPrompt, fallback), snippet };
}

// In-memory bound: at most 64 KiB of user/assistant text per indexed session (plus metadata).
// When over cap, retain the newest text so recent conversation context remains searchable.
export async function scanSessionIndexEntry(filePath, { maxBytes = SESSION_SCAN_MAX_BYTES, textCap = SEARCH_TEXT_CAP, statFile = stat } = {}) {
  const fileStat = await statFile(filePath);
  const input = createReadStream(filePath, { encoding: "utf8", end: maxBytes - 1 });
  let header;
  let name = "";
  let firstPrompt = "";
  const usage = {};
  const textParts = [];
  let textLength = 0;
  for await (const line of createInterface({ input, crlfDelay: Infinity })) {
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    if (!header && entry?.type === "session") header = entry;
    if (entry?.type === "session_info") name = typeof entry.name === "string" ? entry.name.trim() : "";
    if (entry?.type !== "message" || !["user", "assistant"].includes(entry.message?.role)) continue;
    const body = messageText(entry.message);
    if (entry.message.role === "user" && !firstPrompt) firstPrompt = body;
    if (entry.message.role === "assistant") addUsage(usage, entry.timestamp ?? entry.message.timestamp, entry.message.usage);
    if (body) {
      textParts.push(body);
      textLength += body.length + 1;
      while (textLength > textCap && textParts.length) {
        const oldest = textParts.shift();
        textLength -= oldest.length + 1;
        if (!textParts.length && oldest.length > textCap) {
          textParts.push(oldest.slice(-textCap));
          textLength = textCap;
        }
      }
    }
  }
  if (!header || typeof header.cwd !== "string" || !header.cwd) return null;
  const entry = {
    filePath, mtimeMs: fileStat.mtimeMs, size: fileStat.size,
    cwdKey: cwdKey(mapHostPath(header.cwd, PATH_MAP)),
    timestamp: header.timestamp || new Date(fileStat.mtimeMs).toISOString(),
    title: compactTitle(name || firstPrompt, "Nova conversa"),
    text: textParts.join("\n").slice(-textCap),
  };
  entry.usage = usage;
  // Folded once here so a query is a plain substring test, not a re-fold of every session.
  entry.folded = foldText(entry.text);
  return entry;
}

export class SessionIndex {
  constructor(sessionsRoot, { scan = scanSessionIndexEntry, statFile = stat, concurrency = SEARCH_INDEX_CONCURRENCY, now = Date.now } = {}) {
    this.sessionsRoot = sessionsRoot;
    this.scan = scan;
    this.statFile = statFile;
    this.concurrency = concurrency;
    this.now = now;
    this.entries = new Map();
    this.refreshPromise = null;
    this.lastRefresh = 0;
    this.indexing = false;
  }

  refresh() {
    if (this.refreshPromise) return this.refreshPromise;
    this.indexing = true;
    this.refreshPromise = this.refreshEntries().finally(() => {
      this.lastRefresh = this.now();
      this.indexing = false;
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }

  async refreshEntries() {
    const listed = new Map();
    for (const dir of await readdirSafe(this.sessionsRoot)) {
      if (!dir.isDirectory()) continue;
      for (const file of await readdirSafe(path.join(this.sessionsRoot, dir.name))) {
        if (file.isFile() && file.name.endsWith(".jsonl")) listed.set(path.join(this.sessionsRoot, dir.name, file.name), true);
      }
    }
    const pending = [];
    for (const filePath of listed.keys()) {
      try {
        const info = await this.statFile(filePath);
        const previous = this.entries.get(filePath);
        if (!previous || previous.mtimeMs !== info.mtimeMs || previous.size !== info.size) pending.push(filePath);
      } catch { /* vanished between listing and stat */ }
    }
    for (const filePath of this.entries.keys()) if (!listed.has(filePath)) this.entries.delete(filePath);
    let next = 0;
    const workers = Array.from({ length: Math.max(1, this.concurrency) }, async () => {
      while (next < pending.length) {
        const filePath = pending[next++];
        try {
          const entry = await this.scan(filePath, { statFile: this.statFile });
          if (entry) this.entries.set(filePath, entry);
          else this.entries.delete(filePath);
        } catch { this.entries.delete(filePath); }
      }
    });
    await Promise.all(workers);
  }

  // Cost/tokens of the assistant messages dated `day` (local YYYY-MM-DD); entries are reused until mtime/size change.
  usageOn(day) {
    return sumUsage(this.entries.values(), day);
  }

  search(query, projectsByCwd, { limit = SEARCH_LIMIT, pathMap = PATH_MAP } = {}) {
    const foldedQuery = foldText(String(query).trim().slice(0, 200));
    if (foldedQuery.length < SEARCH_MIN_CHARS) return [];
    const results = [];
    const ordered = [...this.entries.values()].sort((a, b) => b.mtimeMs - a.mtimeMs);
    for (const entry of ordered) {
      if (results.length >= limit) break;
      const project = projectsByCwd.get(entry.cwdKey);
      if (!project) continue;
      if (!(entry.folded ?? foldText(entry.text)).includes(foldedQuery)) continue;
      let snippet = "";
      for (const message of entry.text.split("\n")) if ((snippet = searchSnippet(message, foldedQuery))) break;
      if (snippet) results.push({ projectId: project.id, sessionPath: entry.filePath, title: entry.title, snippet, timestamp: entry.timestamp });
    }
    return results;
  }
}

export async function searchSessions(sessionsRoot, query, { projectsByCwd, pathMap = PATH_MAP, limit = SEARCH_LIMIT, maxFileBytes = SESSION_SCAN_MAX_BYTES, statFile = stat } = {}) {
  const index = new SessionIndex(sessionsRoot, { statFile, scan: (filePath) => scanSessionIndexEntry(filePath, { maxBytes: maxFileBytes, statFile }) });
  await index.refresh();
  return index.search(query, projectsByCwd, { limit, pathMap });
}

// Title of an indexed session, only while the file is unchanged since it was indexed.
export function indexedTitle(entry, fileStat) {
  return entry && entry.mtimeMs === fileStat.mtimeMs && entry.size === fileStat.size ? entry.title : null;
}

// Search answers from memory; a stale index refreshes in the background, never in the request.
export function refreshIfStale(index, { now = Date.now(), log = recordLog } = {}) {
  if (index.refreshPromise || now - index.lastRefresh < SEARCH_REFRESH_INTERVAL_MS) return false;
  index.refresh().catch((error) => log("warn", "Session search index refresh failed", { error: error.message }));
  return true;
}

// Discovery reads every session header (seconds on a big history); reuse the known list.
export async function knownProjects(known, discover) {
  return known.size ? [...known.values()] : discover();
}

const sessionIndex = new SessionIndex(path.join(AGENT_DIR, "sessions"));
export function refreshSessionIndex() { return sessionIndex.refresh(); }

// ---- Conversation state (pronto | fazendo | parado | erro | aguardando | nova), from the tail of the session file.
const STATE_TAIL_BYTES = 64 * 1024;
const STATE_TAIL_MAX_BYTES = 512 * 1024;
const STATE_FRESH_MS = 90_000;
const STATE_CACHE_MAX = 2000;
const HISTORY_LIMIT_ITEMS = 50;

// The last `message` entry decides; trailing `custom`/`session_info` entries and a line still being written are skipped.
function lastMessageIn(lines) {
  for (let index = lines.length - 1; index >= 0; index--) {
    const line = lines[index].trim();
    if (!line) continue;
    try {
      const entry = JSON.parse(line);
      if (entry?.type === "message" && isPlainObject(entry.message)) return entry.message;
    } catch {
      // Partial or malformed line: keep looking further back.
    }
  }
  return null;
}

// Reads only the tail of a session file: 64 KiB, widened to 512 KiB when no message line shows up.
// null = no message at all; { role: "unknown" } = content exists but a single line overflows the window.
export async function readLastMessage(filePath, size, { openFile = open } = {}) {
  if (!size) return null;
  const handle = await openFile(filePath, "r");
  try {
    for (const window of [STATE_TAIL_BYTES, STATE_TAIL_MAX_BYTES]) {
      const length = Math.min(window, size);
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await handle.read(buffer, 0, length, size - length);
      const lines = buffer.toString("utf8", 0, bytesRead).split(/\n/);
      if (length < size) lines.shift();
      const message = lastMessageIn(lines);
      if (message) return message;
      if (length >= size) return null;
    }
    return { role: "unknown" };
  } finally {
    await handle.close();
  }
}

// A turn that ended decides by its stopReason; one still in flight (tool call, tool result, prompt) is "fazendo"
// only while the file keeps changing, otherwise the run was interrupted ("parado").
export function classifySessionState(message, mtimeMs, now = Date.now()) {
  if (!message) return "nova";
  if (message.role === "assistant") {
    if (message.stopReason === "stop" || message.stopReason === "length") return "pronto";
    if (message.stopReason === "aborted") return "parado";
    if (message.stopReason === "error") return "erro";
  }
  return now - mtimeMs <= STATE_FRESH_MS ? "fazendo" : "parado";
}

// The live PI of the open project knows better than its file: a pending dialog is "aguardando", a streaming
// turn "fazendo"; an exited PI cannot be running, so a run the file still shows in flight is "parado".
export function applyLiveState(fileState, live) {
  if (!live) return fileState;
  if (live.exited) return fileState === "fazendo" ? "parado" : fileState;
  if (live.waitingUi) return "aguardando";
  return live.streaming ? "fazendo" : fileState;
}

// Last message per file, reused while (mtime, size) are unchanged.
export class SessionStateReader {
  constructor({ read = readLastMessage, maxEntries = STATE_CACHE_MAX } = {}) {
    this.read = read;
    this.maxEntries = maxEntries;
    this.cache = new Map();
  }

  async lastMessage(filePath, fileStat) {
    const cached = this.cache.get(filePath);
    if (cached && cached.mtimeMs === fileStat.mtimeMs && cached.size === fileStat.size) return cached.message;
    const message = await this.read(filePath, fileStat.size);
    if (this.cache.size >= this.maxEntries) this.cache.clear();
    this.cache.set(filePath, { mtimeMs: fileStat.mtimeMs, size: fileStat.size, message });
    return message;
  }
}

const sessionStates = new SessionStateReader();

// The project PI that is still alive, else the last one that ran (exited), else null.
function liveSessionFor(projectId) {
  const mine = [...sessions.values()].filter((session) => session.projectId === projectId);
  return mine.find((session) => !session.exited) ?? mine.at(-1) ?? null;
}

// A session header (first line: id, cwd, timestamp, parentSession) never changes once written, so
// history listings read it once per file instead of opening every session file on every call.
const sessionHeaders = new Map();
const SESSION_HEADER_CACHE_MAX = 20_000;

export async function sessionHeader(filePath, { read = readFirstLine, cache = sessionHeaders, max = SESSION_HEADER_CACHE_MAX } = {}) {
  const cached = cache.get(filePath);
  if (cached) return cached;
  const header = JSON.parse(await read(filePath));
  if (cache.size >= max) cache.clear();
  cache.set(filePath, header);
  return header;
}

export async function listProjectHistory(project, { states = sessionStates, now = Date.now() } = {}) {
  const sessionsRoot = path.join(AGENT_DIR, "sessions");
  if (!(await isDirectory(sessionsRoot))) return [];
  const out = [];
  const dirs = await readdir(sessionsRoot, { withFileTypes: true });
  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;
    const fullDir = path.join(sessionsRoot, dir.name);
    let files = [];
    try {
      files = await readdir(fullDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const file of files) {
      if (!file.isFile() || !file.name.endsWith(".jsonl")) continue;
      const filePath = path.join(fullDir, file.name);
      try {
        const header = await sessionHeader(filePath);
        if (cwdKey(mapHostPath(header.cwd || "", PATH_MAP)) !== cwdKey(project.cwd)) continue;
        const fileStat = await stat(filePath);
        const timestamp = header.timestamp || fileStat.mtime.toISOString();
        const title = indexedTitle(sessionIndex.entries.get(filePath), fileStat) ?? (await scanSession(filePath)).title;
        out.push({
          path: filePath,
          title,
          timestamp,
          bytes: fileStat.size,
          sessionId: header.id,
          isSubagent: Boolean(header.parentSession),
          parentSession: header.parentSession || null,
          lastActivity: fileStat.mtime.toISOString(),
          fileStat,
        });
      } catch {
        // Ignore malformed/partial session files.
      }
    }
  }
  const top = out.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp))).slice(0, HISTORY_LIMIT_ITEMS);
  const live = liveSessionFor(project.id);
  const liveFile = live?.lastState?.sessionFile ? cwdKey(live.lastState.sessionFile) : null;
  return Promise.all(top.map(async ({ fileStat, ...item }) => {
    let fileState = "nova";
    try {
      fileState = classifySessionState(await states.lastMessage(item.path, fileStat), fileStat.mtimeMs, now);
    } catch {
      // Vanished or unreadable between listing and reading: no state rather than a failed list.
    }
    return { ...item, state: liveFile === cwdKey(item.path) ? applyLiveState(fileState, live.statusSummary(now)) : fileState };
  }));
}

// ---- Running conversations per project (sidebar badge of projects that are not open).
const RUNNING_WINDOW_MS = 30 * 60_000;
const RUNNING_CACHE_MS = 2000;
const runningCache = { at: 0, value: null, pending: null };

// { projectId: n } for session files touched within `windowMs` whose last message says the run is still going ("fazendo").
// Older files are never read; headers and tails come from the same caches the history list uses.
export async function countRunningByProject(sessionsRoot, { states = sessionStates, now = Date.now(), windowMs = RUNNING_WINDOW_MS, pathMap = PATH_MAP, statFile = stat } = {}) {
  const counts = {};
  for (const dir of await readdirSafe(sessionsRoot)) {
    if (!dir.isDirectory()) continue;
    const fullDir = path.join(sessionsRoot, dir.name);
    const ids = await Promise.all((await readdirSafe(fullDir)).filter((file) => file.isFile() && file.name.endsWith(".jsonl")).map(async (file) => {
      const filePath = path.join(fullDir, file.name);
      try {
        const info = await statFile(filePath);
        if (now - info.mtimeMs > windowMs) return null;
        const header = await sessionHeader(filePath);
        if (typeof header.cwd !== "string" || !header.cwd) return null;
        const state = classifySessionState(await states.lastMessage(filePath, info), info.mtimeMs, now);
        return state === "fazendo" ? projectIdFor(mapHostPath(header.cwd, pathMap)) : null;
      } catch {
        return null; // vanished or malformed between listing and reading
      }
    }));
    for (const id of ids) if (id) counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}

export function clearRunningCache() {
  runningCache.at = 0;
  runningCache.value = null;
}

// Cached for 2 s; concurrent callers share one scan.
export function getRunningCounts({ now = Date.now, compute = () => countRunningByProject(path.join(AGENT_DIR, "sessions")) } = {}) {
  if (runningCache.value && now() - runningCache.at < RUNNING_CACHE_MS) return Promise.resolve(runningCache.value);
  runningCache.pending ??= compute()
    .then((value) => {
      runningCache.value = value;
      runningCache.at = now();
      return value;
    })
    .finally(() => {
      runningCache.pending = null;
    });
  return runningCache.pending;
}

// ---- Orca worktrees (read-only `orca worktree ps --json`; absent in Docker, so it degrades to available:false).
const ORCA_TIMEOUT_MS = Number.parseInt(process.env.PI_STUDIO_ORCA_TIMEOUT_MS || "5000", 10);
const ORCA_CACHE_MS = 2000;
const ORCA_MAX_BUFFER = 8 * 1024 * 1024;
const orcaCache = { at: 0, value: null, pending: null };

function parseJsonStringArray(raw) {
  try {
    const parsed = JSON.parse(raw || "[]");
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) return parsed;
  } catch {
    // Fall through to no extra args.
  }
  return [];
}

// PI_STUDIO_ORCA_BIN (+ PI_STUDIO_ORCA_BIN_ARGS, a JSON array run before the orca arguments) wins; otherwise the Orca
// desktop CLI on Windows, `orca` on PATH elsewhere. null = not installed.
export function resolveOrcaCommand({ platform = process.platform, env = process.env, exists = existsSync } = {}) {
  if (env.PI_STUDIO_ORCA_BIN) return { bin: env.PI_STUDIO_ORCA_BIN, prefixArgs: parseJsonStringArray(env.PI_STUDIO_ORCA_BIN_ARGS) };
  if (platform !== "win32") return { bin: "orca", prefixArgs: [] };
  const bin = env.LOCALAPPDATA ? path.win32.join(env.LOCALAPPDATA, "Programs", "orca", "resources", "bin", "orca.exe") : "";
  return bin && exists(bin) ? { bin, prefixArgs: [] } : null;
}

// Never rejects: every failure becomes { available: false, reason } (not-found | timeout | failed | invalid).
export function fetchOrca(command = resolveOrcaCommand(), timeoutMs = ORCA_TIMEOUT_MS) {
  if (!command) return Promise.resolve({ available: false, reason: "not-found" });
  return new Promise((resolve) => {
    const args = [...command.prefixArgs, "worktree", "ps", "--json"];
    execFile(command.bin, args, { timeout: timeoutMs, maxBuffer: ORCA_MAX_BUFFER, windowsHide: true }, (error, stdout) => {
      if (error) return resolve({ available: false, reason: error.code === "ENOENT" ? "not-found" : error.killed ? "timeout" : "failed" });
      let summary = { ok: false };
      try {
        summary = normalizeOrca(JSON.parse(stdout));
      } catch {
        // Malformed output keeps ok:false.
      }
      resolve(summary.ok ? { available: true, active: summary.active, worktrees: summary.worktrees } : { available: false, reason: "invalid" });
    });
  });
}

export function clearOrcaCache() {
  orcaCache.at = 0;
  orcaCache.value = null;
}

// Cached for 2 s; concurrent callers share one child process.
export function getOrca({ now = Date.now, fetch = fetchOrca } = {}) {
  if (orcaCache.value && now() - orcaCache.at < ORCA_CACHE_MS) return Promise.resolve(orcaCache.value);
  orcaCache.pending ??= fetch()
    .then((value) => {
      orcaCache.value = value;
      orcaCache.at = now();
      return value;
    })
    .finally(() => {
      orcaCache.pending = null;
    });
  return orcaCache.pending;
}

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

export function pathInside(root, target) {
  const base = cwdKey(root);
  const key = cwdKey(target);
  return key === base || key.startsWith(base.endsWith(path.sep) ? base : base + path.sep);
}

// Trust boundary of open-path: an absolute directory that Orca lists as a worktree or that sits under a project root.
async function projectForPath(raw) {
  const cwd = safeName(raw);
  if (!path.isAbsolute(cwd) || /(^|[\\/])\.\.([\\/]|$)/.test(cwd)) throw httpError(400, "Invalid path");
  const resolved = path.resolve(cwd);
  const orca = await getOrca();
  const listed = orca.available && orca.worktrees.some((worktree) => cwdKey(worktree.path) === cwdKey(resolved));
  if (!listed && !(await getProjectRoots()).some((root) => pathInside(root, resolved))) throw httpError(403, "Path not allowed");
  if (!(await isDirectory(resolved))) throw httpError(404, "Directory not found");
  await knownProjects(projects, discoverProjects);
  let project = projects.get(projectIdFor(resolved));
  if (!project) {
    project = { ...makeProject(resolved, path.dirname(resolved)), lastUsedAt: new Date().toISOString() };
    addedProjects.set(project.id, project);
    projects.set(project.id, project);
  }
  return project;
}

// ---- @-mention file picker: relative POSIX paths of a project, ranked per query.
const FILE_RESULT_LIMIT = 50;
const FILE_CACHE_TTL_MS = 10_000;
const FILE_LIST_MAX = 100_000;
const FILE_WALK_LIMIT = 5000;
const FILE_WALK_SKIP = new Set([".git", "node_modules", "dist", "build", ".next", "coverage"]);
const fileCache = new Map();

// Tracked + untracked-but-not-ignored files, NUL-separated so odd names survive. Resolves null
// (never rejects) when git is missing, times out or cwd is not a repository.
export function gitListFiles(cwd, { bin = "git", timeoutMs = 3000 } = {}) {
  return new Promise((resolve) => {
    execFile(bin, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd, timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, windowsHide: true }, (error, stdout) => {
      resolve(error ? null : stdout.split(String.fromCharCode(0)).filter(Boolean));
    });
  });
}

// Breadth-first, so shallow files win when the entry budget runs out. Symlinks are not followed.
export async function walkProjectFiles(cwd, limit = FILE_WALK_LIMIT) {
  const files = [];
  const queue = [""];
  for (let next = 0; next < queue.length && files.length < limit; next++) {
    for (const entry of await readdirSafe(path.join(cwd, queue[next]))) {
      const relative = queue[next] ? `${queue[next]}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!FILE_WALK_SKIP.has(entry.name) && !entry.name.startsWith(".")) queue.push(relative);
      } else if (entry.isFile() && files.length < limit) {
        files.push(relative);
      }
    }
  }
  return files;
}

// Only paths that stay inside cwd are ever returned, whatever the source produced.
function insideProject(relative) {
  return !path.win32.parse(relative).root && !path.win32.normalize(relative).split(path.win32.sep).includes("..");
}

export async function listProjectFiles(cwd, { git = gitListFiles, now = Date.now() } = {}) {
  const key = cwdKey(cwd);
  const cached = fileCache.get(key);
  if (cached && now - cached.at < FILE_CACHE_TTL_MS) return cached.files;
  const listed = (await git(cwd)) ?? (await walkProjectFiles(cwd));
  const files = [...new Set(listed.filter(insideProject))].slice(0, FILE_LIST_MAX);
  fileCache.set(key, { at: now, files });
  return files;
}

function normalizedAuthority(value) {
  if (typeof value !== "string" || !value) return null;
  try {
    const parsed = new URL(`http://${value}`);
    if (parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) return null;
    const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
    return `${hostname}:${parsed.port || "80"}`;
  } catch {
    return null;
  }
}

function hasSingleRawHeader(req, name) {
  let count = 0;
  for (let index = 0; index < req.rawHeaders.length; index += 2) {
    if (req.rawHeaders[index].toLowerCase() === name) count++;
  }
  return count === 1;
}

function requestTokenMatches(req, allowCookie = false) {
  let candidate;
  if (allowCookie) {
    const cookies = req.headers.cookie || "";
    const matches = cookies.split(";").map((item) => item.trim()).filter((item) => item.startsWith("pi-studio-token="));
    if (matches.length !== 1) return false;
    candidate = matches[0].slice("pi-studio-token=".length);
  } else {
    if (!hasSingleRawHeader(req, "x-pi-studio-token")) return false;
    candidate = req.headers["x-pi-studio-token"];
  }
  if (typeof candidate !== "string") return false;
  const provided = Buffer.from(candidate);
  const expected = Buffer.from(apiToken);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

// Host aceito = loopback ou PI_WEB_HOST, na porta em que o servidor ouve. Barra DNS
// rebinding: um domínio externo apontado para 127.0.0.1 chega com o Host dele.
function requestHostAllowed(req) {
  if (!hasSingleRawHeader(req, "host")) return null;
  const authority = normalizedAuthority(req.headers.host);
  const configuredHost = DEFAULT_HOST.toLowerCase().replace(/\.$/, "");
  const allowedHosts = new Set([
    `127.0.0.1:${listeningPort}`,
    `localhost:${listeningPort}`,
    `[::1]:${listeningPort}`,
    `${configuredHost.includes(":") && !configuredHost.startsWith("[") ? `[${configuredHost}]` : configuredHost}:${listeningPort}`,
  ].map(normalizedAuthority));
  return authority && allowedHosts.has(authority) ? authority : null;
}

function authorizeApiRequest(req, pathname) {
  if (!pathname.startsWith("/api/")) return null;
  const authority = requestHostAllowed(req);
  if (!authority) return 403;

  const origins = [];
  for (let index = 0; index < req.rawHeaders.length; index += 2) {
    if (req.rawHeaders[index].toLowerCase() === "origin") origins.push(req.rawHeaders[index + 1]);
  }
  if (origins.length > 1) return 403;
  if (origins.length === 1) {
    if (origins[0] === "null") return 403;
    try {
      const origin = new URL(origins[0]);
      if (origin.protocol !== "http:" || origin.username || origin.password || origin.origin === "null" ||
          normalizedAuthority(origin.host) !== authority) return 403;
    } catch {
      return 403;
    }
  }
  const isSse = req.method === "GET" && /^\/api\/(?:projects\/[^/]+|sessions\/[^/]+)\/events$/.test(pathname);
  if (!requestTokenMatches(req, isSse)) return 401;
  return null;
}

async function serveFrontend(req, res) {
  const html = (await readFile(path.join(PUBLIC_DIR, "index.html"), "utf8"))
    .replace("</head>", `<meta name="pi-studio-token" content="${apiToken}"></head>`);
  const body = Buffer.from(html);
  res.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "content-length": body.length,
    "cache-control": "no-store",
    "set-cookie": `pi-studio-token=${apiToken}; Path=/; HttpOnly; SameSite=Strict`,
  });
  res.end(body);
}

async function serveStatic(req, res, pathname) {
  // URL parsing normalizes literal dot segments; retain the origin-form path
  // so this guard also rejects plain ../ before resolving it.
  const requestPath = req.url?.startsWith("/") ? req.url.split(/[?#]/, 1)[0] : pathname;
  const rel = requestPath === "/" ? "/index.html" : requestPath;
  let decoded;
  try {
    decoded = decodeURIComponent(rel);
  } catch (error) {
    if (error instanceof URIError) return text(res, 400, "Bad Request");
    throw error;
  }
  const filePath = path.resolve(PUBLIC_DIR, `.${decoded}`);
  const relativePath = path.relative(PUBLIC_DIR, filePath);
  if (relativePath === ".." || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
    return text(res, 403, "Forbidden");
  }
  let fileStat;
  try {
    fileStat = await stat(filePath);
  } catch {
    return text(res, 404, "Not found");
  }
  if (!fileStat.isFile()) return text(res, 404, "Not found");
  const ext = path.extname(filePath).toLowerCase();
  const type = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
  }[ext] || "application/octet-stream";
  res.writeHead(200, { "content-type": type, "content-length": fileStat.size, "cache-control": "no-store" });
  createReadStream(filePath).pipe(res);
}

function parseProjectRoute(pathname) {
  const match = pathname.match(/^\/api\/projects\/([^/]+)(?:\/(open|events|command|ui-response|stop|history|switch|files))?$/);
  if (!match) return null;
  return { projectId: decodeURIComponent(match[1]), action: match[2] };
}

async function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || `${DEFAULT_HOST}:${listeningPort}`}`);
  const { pathname } = url;

  try {
    const authorizationStatus = authorizeApiRequest(req, pathname);
    if (authorizationStatus) return json(res, authorizationStatus, { error: authorizationStatus === 401 ? "Unauthorized" : "Forbidden" });
    if (req.method === "GET" && pathname === "/api/health") {
      return json(res, 200, {
        ok: true,
        host: DEFAULT_HOST,
        piBin: piCommand().bin,
        agentDir: AGENT_DIR,
        projectRoots: await getProjectRoots(),
        node: process.version,
        sessions: sessions.size,
      });
    }

    if (req.method === "GET" && pathname === "/api/bootstrap") {
      const discovered = await discoverProjects();
      const firstProject = discovered[0];
      return json(res, 200, {
        projects: discovered,
        agents: await listAgents(firstProject?.cwd || process.cwd()),
        activeSessions: [...sessions.values()].map((session) => session.summary()),
        logs: serverLogs.slice(-200),
        config: { agentDir: AGENT_DIR, projectRoots: await getProjectRoots() },
      });
    }

    if (req.method === "GET" && pathname === "/api/projects") {
      return json(res, 200, { projects: await discoverProjects() });
    }

    if (req.method === "GET" && pathname === "/api/agents") {
      const cwd = url.searchParams.get("cwd") || process.cwd();
      return json(res, 200, { agents: await listAgents(cwd) });
    }

    if (req.method === "GET" && pathname === "/api/logs") {
      return json(res, 200, { logs: serverLogs.slice(-300) });
    }

    if (req.method === "GET" && pathname === "/api/search") {
      const projectsByCwd = new Map((await knownProjects(projects, discoverProjects)).map((project) => [cwdKey(project.cwd), project]));
      refreshIfStale(sessionIndex);
      // "Indexando" only until the first build completes; later background refreshes are silent.
      return json(res, 200, { results: sessionIndex.search(url.searchParams.get("q") || "", projectsByCwd), indexing: sessionIndex.lastRefresh === 0 });
    }

    if (req.method === "GET" && pathname === "/api/sessions") {
      return json(res, 200, { sessions: [...sessions.values()].map((session) => session.summary()) });
    }

    if (pathname === "/api/orca") {
      if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });
      const orca = await getOrca();
      if (!orca.available) return json(res, 200, { available: false, reason: orca.reason, active: null, worktrees: [] });
      const byCwd = new Map((await knownProjects(projects, discoverProjects)).map((project) => [cwdKey(project.cwd), project.id]));
      return json(res, 200, { ...orca, worktrees: orca.worktrees.map((worktree) => ({ ...worktree, projectId: byCwd.get(cwdKey(worktree.path)) ?? null })) });
    }

    if (pathname === "/api/projects/status") {
      if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });
      const latest = new Map();
      for (const session of sessions.values()) {
        if (!latest.get(session.projectId) || latest.get(session.projectId).exited) latest.set(session.projectId, session);
      }
      return json(res, 200, { statuses: [...latest.values()].map((session) => session.statusSummary()), runningCounts: await getRunningCounts(), now: Date.now(), stall: STALL });
    }

    if (pathname === "/api/activity") {
      if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });
      const since = url.searchParams.get("since") ?? "0";
      if (!/^[0-9]{1,15}$/.test(since)) return json(res, 400, { error: "Invalid since" });
      return json(res, 200, { ...activityLog.since(Number(since)), now: Date.now() });
    }

    if (pathname === "/api/usage/today") {
      if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });
      refreshIfStale(sessionIndex);
      return json(res, 200, { ...sessionIndex.usageOn(localDay(Date.now())), indexing: sessionIndex.lastRefresh === 0 });
    }

    if (pathname === "/api/projects/open-path") {
      if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
      const body = await readJsonBody(req);
      return json(res, 201, await openProjectPayload(await projectForPath(body?.cwd)));
    }

    const projectRoute = parseProjectRoute(pathname);
    if (projectRoute) {
      const project = await ensureProject(projectRoute.projectId);
      const { action } = projectRoute;

      if (req.method === "POST" && action === "open") {
        return json(res, 201, await openProjectPayload(project));
      }

      if (req.method === "GET" && action === "events") {
        const session = [...sessions.values()].find((item) => item.projectId === project.id);
        if (!session || session.exited) {
          res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", connection: "keep-alive" });
          sendSse(res, "session_stopped", { type: "session_stopped", message: "PI encerrado; abra o projeto para iniciar uma nova sessão." });
          return res.end();
        }
        return session.addClient(res);
      }

      if (req.method === "POST" && action === "command") {
        const body = await readJsonBody(req);
        const session = await getOrStartProjectSession(project);
        session.send(body);
        return json(res, 202, { ok: true, session: session.summary() });
      }

      if (req.method === "POST" && action === "ui-response") {
        const body = await readJsonBody(req);
        if (!body.id) return json(res, 400, { error: "Missing extension UI request id" });
        const session = await getOrStartProjectSession(project);
        session.send({ type: "extension_ui_response", ...body });
        return json(res, 202, { ok: true });
      }

      if (req.method === "POST" && action === "stop") {
        const existing = [...sessions.values()].find((session) => session.projectId === project.id && !session.exited);
        existing?.stop();
        return json(res, 202, { ok: true });
      }

      if (req.method === "GET" && action === "history") {
        return json(res, 200, { history: await listProjectHistory(project) });
      }

      if (req.method === "GET" && action === "files") {
        const files = await listProjectFiles(project.cwd);
        return json(res, 200, { files: rankFiles(files, url.searchParams.get("q") || "", FILE_RESULT_LIMIT) });
      }

      if (req.method === "POST" && action === "switch") {
        const body = await readJsonBody(req);
        if (!body.sessionPath) return json(res, 400, { error: "Missing sessionPath" });
        const session = await getOrStartProjectSession(project);
        session.send({ id: body.id || randomUUID(), type: "switch_session", sessionPath: body.sessionPath });
        setTimeout(() => {
          try {
            session.send({ id: randomUUID(), type: "get_entries" });
          } catch {
            // Ignore if session exited.
          }
        }, 250);
        return json(res, 202, { ok: true });
      }
    }

    // Backward-compatible direct session endpoint used by smoke tests/tools.
    const sessionMatch = pathname.match(/^\/api\/sessions\/([^/]+)(?:\/(events|command|ui-response|stop))?$/);
    if (sessionMatch) {
      const [, id, action] = sessionMatch;
      const session = sessions.get(id);
      if (!session) return json(res, 404, { error: "Unknown session" });
      if (req.method === "GET" && action === "events") return session.addClient(res);
      if (req.method === "POST" && action === "command") {
        session.send(await readJsonBody(req));
        return json(res, 202, { ok: true });
      }
      if (req.method === "POST" && action === "stop") {
        session.stop();
        return json(res, 202, { ok: true });
      }
    }

    if (req.method === "POST" && pathname === "/api/sessions") {
      const body = await readJsonBody(req);
      const cwd = path.resolve(safeName(body.cwd) || process.cwd());
      const project = makeProject(cwd, path.dirname(cwd));
      projects.set(project.id, project);
      const session = await getOrStartProjectSession(project);
      return json(res, 201, { project, session: session.summary() });
    }

    if (req.method === "GET" && (pathname === "/" || pathname === "/index.html")) {
      // A página carrega o token: só é servida para um Host aceito.
      if (!requestHostAllowed(req)) return json(res, 403, { error: "Forbidden" });
      return await serveFrontend(req, res);
    }
    if (req.method === "GET") return serveStatic(req, res, pathname);
    return json(res, 405, { error: "Method not allowed" });
  } catch (error) {
    const status = error.statusCode || 500;
    recordLog(status >= 500 ? "error" : "warn", error.message, { pathname });
    return json(res, status, { error: error.message || "Internal server error" });
  }
}

const server = createServer((req, res) => {
  route(req, res).catch((error) => json(res, 500, { error: error.message || "Internal server error" }));
});

export function startServer(port = DEFAULT_PORT, host = DEFAULT_HOST) {
  return new Promise((resolve) => {
    server.listen(port, host, () => {
      const address = server.address();
      listeningPort = address.port;
      const line = `PI Studio listening on http://${host}:${listeningPort}`;
      recordLog("info", line);
      console.log(line);
      setTimeout(() => sessionIndex.refresh().catch((error) => recordLog("warn", "Session search index warm-up failed", { error: error.message })), 25).unref();
      if (!new Set(["127.0.0.1", "localhost", "::1", "[::1]"]).has(host.toLowerCase())) {
        console.warn("PI Studio is exposed beyond loopback; protect this server and its network access.");
      }
      resolve(server);
    });
  });
}

// Graceful stop for embedders/tests: stops PI children and closes the listener without exiting.
export function stopServer() {
  for (const session of sessions.values()) session.stop();
  server.closeAllConnections();
  return new Promise((resolve) => server.close(() => resolve()));
}

function shutdown() {
  for (const session of sessions.values()) session.stop();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}

export const isMainModule = Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
  await startServer();
  // Resolve the PI binary up front (it may run `npm root -g` once) so the first project opens fast.
  piCommand();
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
