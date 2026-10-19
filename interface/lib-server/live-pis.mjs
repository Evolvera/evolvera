import { spawn as nodeSpawn } from "node:child_process";

const CLI = /@earendil-works[\\/]pi-coding-agent[\\/]dist[\\/]cli\.js/i;

function number(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function timestamp(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const text = value;
  const wmi = text.match(/^\/Date\((-?\d+)(?:[+-]\d+)?\)\/$/);
  const compact = text.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\.(\d{1,6})([+-]\d{3,4})?$/);
  const parsed = wmi ? Number(wmi[1]) : compact
    ? Date.parse(`${compact[1]}-${compact[2]}-${compact[3]}T${compact[4]}:${compact[5]}:${compact[6]}.${compact[7].slice(0, 3)}${compact[8] ? `${compact[8].slice(0, 3)}:${compact[8].slice(-2)}` : "Z"}`)
    : Date.parse(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function tokenize(commandLine) {
  const tokens = [];
  let token = "";
  let quote = "";
  const input = String(commandLine);
  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    if (quote && char === "\\" && input[index + 1] === quote) { token += quote; index++; }
    else if (quote) { if (char === quote) quote = ""; else token += char; }
    else if (char === '"' || char === "'") quote = char;
    else if (/\s/.test(char)) { if (token) { tokens.push(token); token = ""; } }
    else token += char;
  }
  if (token) tokens.push(token);
  return tokens;
}

function processTokens(commandLine) {
  const tokens = tokenize(commandLine);
  let sessionArg = null;
  let continueFlag = false;
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token === "--session" || token === "-s") sessionArg = tokens[index + 1] ?? null;
    else if (token.startsWith("--session=")) sessionArg = token.slice("--session=".length);
    if (token === "--continue" || token === "-c") continueFlag = true;
  }
  return { sessionArg: sessionArg || null, continueFlag };
}

export function parsePiProcesses(rows, { studioPids = new Set(), orcaPids = new Set() } = {}) {
  if (!Array.isArray(rows)) return [];
  const byPid = new Map();
  for (const row of rows) {
    const pid = number(row?.ProcessId ?? row?.pid);
    if (pid !== null) byPid.set(pid, row);
  }
  const out = [];
  for (const row of rows) {
    const pid = number(row?.ProcessId ?? row?.pid);
    const ppid = number(row?.ParentProcessId ?? row?.ppid) ?? 0;
    const commandLine = row?.CommandLine ?? row?.args;
    if (pid === null || typeof commandLine !== "string" || !CLI.test(commandLine)) continue;
    const parsedTime = timestamp(row?.CreationDate ?? row?.startedAt ?? row?.lstart);
    let owner = studioPids.has(pid) ? "studio" : "terminal";
    if (owner !== "studio") {
      const seen = new Set([pid]);
      let parent = ppid;
      while (parent !== null && !seen.has(parent)) {
        if (orcaPids.has(parent) || /(?:^|[\\/])Orca\.exe$/i.test(String(byPid.get(parent)?.Name ?? ""))) { owner = "orca"; break; }
        seen.add(parent);
        parent = number(byPid.get(parent)?.ParentProcessId ?? byPid.get(parent)?.ppid);
      }
    }
    out.push({ pid, ppid, owner, startedAt: parsedTime ?? 0, ...processTokens(commandLine) });
  }
  return out;
}

function samePath(a, b) {
  return typeof a === "string" && typeof b === "string" && a.replace(/\\/g, "/").replace(/\/$/, "").toLowerCase() === b.replace(/\\/g, "/").replace(/\/$/, "").toLowerCase();
}

export function resolveSessions(procs, sessionHeaders) {
  const headers = Array.isArray(sessionHeaders) ? sessionHeaders.filter((header) => header && typeof header.path === "string") : [];
  return (Array.isArray(procs) ? procs : []).map((proc) => {
    let sessionPath = null;
    if (typeof proc?.sessionArg === "string" && proc.sessionArg) sessionPath = headers.find((header) => samePath(header.path, proc.sessionArg))?.path ?? proc.sessionArg;
    if (!sessionPath && Number.isFinite(proc?.startedAt)) {
      const match = headers.find((header) => Number.isFinite(header.timestampMs) && Math.abs(header.timestampMs - proc.startedAt) <= 10_000);
      if (match) sessionPath = match.path;
    }
    if (!sessionPath && proc?.continueFlag && headers.length) sessionPath = [...headers].sort((a, b) => (Number(b.mtimeMs) || 0) - (Number(a.mtimeMs) || 0))[0].path;
    return { ...proc, sessionPath };
  });
}

function windowsCommand() {
  return "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -or $_.Name -eq 'Orca.exe' } | Select-Object ProcessId,ParentProcessId,CreationDate,CommandLine,Name | ConvertTo-Json -Compress";
}

function parsePosix(text) {
  const lines = text.trim().split(/\r?\n/);
  lines.shift();
  return lines.map((line) => {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.{24})\s+(.*)$/);
    return match ? { ProcessId: match[1], ParentProcessId: match[2], CreationDate: match[3], CommandLine: match[4], Name: match[4].split(/[\\/]/).pop()?.split(/\s/)[0] } : null;
  }).filter(Boolean);
}

function runSpawn(command, args, options, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = nodeSpawn(command, args, { ...options, stdio: ["ignore", "pipe", "ignore"] });
    let output = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error("process listing timeout")); }, timeoutMs);
    child.stdout.on("data", (chunk) => { output += chunk; if (output.length > 16 * 1024 * 1024) { child.kill(); reject(new Error("process listing too large")); } });
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("close", (code) => { clearTimeout(timer); code === 0 ? resolve(output) : reject(new Error(`process listing exited ${code}`)); });
  });
}

export function createProcessLister({ command, args, platform = process.platform, timeoutMs = 4000, cacheMs = 3000, now = Date.now } = {}) {
  const envBin = process.env.PI_STUDIO_PS_BIN;
  const bin = command ?? envBin ?? (platform === "win32" ? "powershell.exe" : "ps");
  let argv = args;
  if (argv === undefined && process.env.PI_STUDIO_PS_BIN_ARGS) {
    try { const decoded = JSON.parse(process.env.PI_STUDIO_PS_BIN_ARGS); if (Array.isArray(decoded) && decoded.every((item) => typeof item === "string")) argv = decoded; } catch { argv = undefined; }
  }
  if (argv === undefined) argv = platform === "win32" ? ["-NoProfile", "-Command", windowsCommand()] : ["-eo", "pid,ppid,lstart,args"];
  let cachedAt = -Infinity;
  let cached = [];
  let pending = null;
  return {
    async list() {
      if (now() - cachedAt < cacheMs) return cached;
      if (pending) return pending;
      pending = (async () => {
        try {
          const output = await runSpawn(bin, argv, { windowsHide: true }, timeoutMs);
          const rows = platform === "win32" ? JSON.parse(output || "[]") : parsePosix(output);
          cached = Array.isArray(rows) ? rows : rows ? [rows] : [];
        } catch { cached = []; }
        cachedAt = now();
        return cached;
      })();
      try { return await pending; } finally { pending = null; }
    },
  };
}
