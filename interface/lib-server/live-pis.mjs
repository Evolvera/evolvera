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
    const pid = number(row?.pid ?? row?.ProcessId);
    if (pid !== null) byPid.set(pid, row);
  }
  const out = [];
  for (const row of rows) {
    const pid = number(row?.pid ?? row?.ProcessId);
    const ppid = number(row?.ppid ?? row?.ParentProcessId) ?? 0;
    const commandLine = row?.commandLine ?? row?.CommandLine ?? row?.args;
    if (pid === null || typeof commandLine !== "string" || !CLI.test(commandLine)) continue;
    const parsedTime = timestamp(row?.startedAt ?? row?.CreationDate ?? row?.lstart);
    let owner = studioPids.has(pid) ? "studio" : "terminal";
    if (owner !== "studio") {
      const seen = new Set([pid]);
      let parent = ppid;
      while (parent !== null && !seen.has(parent)) {
        if (orcaPids.has(parent) || /(?:^|[\\/])Orca\.exe$/i.test(String(byPid.get(parent)?.name ?? byPid.get(parent)?.Name ?? ""))) { owner = "orca"; break; }
        seen.add(parent);
        parent = number(byPid.get(parent)?.ppid ?? byPid.get(parent)?.ParentProcessId);
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

