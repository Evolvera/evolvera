import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

const MAX_OUTPUT = 16 * 1024 * 1024;
const MAX_ROWS = 50_000;
const HEADER = ["ProcessId", "ParentProcessId", "Name", "CreationDate", "CommandLine", "WorkingSetSize", "KernelModeTime", "UserModeTime"];

function strings(value) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "string") ? parsed : [];
  } catch { return []; }
}

export function resolveProcessTableCommand({ platform = process.platform, env = process.env } = {}) {
  const timeout = Number(env.PI_STUDIO_PS_TIMEOUT_MS);
  const timeoutMs = Number.isSafeInteger(timeout) && timeout > 0 ? timeout : 4000;
  if (env.PI_STUDIO_PS_BIN) return { bin: env.PI_STUDIO_PS_BIN, args: strings(env.PI_STUDIO_PS_BIN_ARGS), timeoutMs };
  if (platform === "win32") {
    const properties = HEADER.join(",");
    const query = `[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new(); Get-CimInstance Win32_Process -Property ${properties} | Select-Object ${properties} | ConvertTo-Csv -NoTypeInformation`;
    // `query` lets createProcessTable keep one PowerShell alive instead of starting one per sample.
    return { bin: "powershell.exe", args: ["-NoProfile", "-NonInteractive", "-Command", query], timeoutMs, query };
  }
  return { bin: "ps", args: ["-eo", "pid=,ppid=,rss=,time=,lstart=,args="], timeoutMs };
}

function numeric(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

function dateValue(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value) return null;
  const wmi = /^\/Date\((-?\d+)(?:[+-]\d+)?\)\/$/.exec(value);
  const compact = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\.(\d{1,6})([+-]\d{3,4})?$/.exec(value);
  const result = wmi ? Number(wmi[1]) : compact
    ? Date.parse(`${compact[1]}-${compact[2]}-${compact[3]}T${compact[4]}:${compact[5]}:${compact[6]}.${compact[7].slice(0, 3)}${compact[8] ? `${compact[8].slice(0, 3)}:${compact[8].slice(-2)}` : "Z"}`)
    : Date.parse(value);
  return Number.isFinite(result) ? result : null;
}

function cpuSeconds(text) {
  if (/^\d+(?:\.\d+)?$/.test(text)) return Number(text);
  const match = /^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)$/.exec(text);
  return match ? Number(match[1] ?? 0) * 86400 + Number(match[2] ?? 0) * 3600 + Number(match[3]) * 60 + Number(match[4]) : null;
}

function csvRecords(text) {
  const records = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(cell); cell = ""; }
    else if (char === "\n") { row.push(cell.replace(/\r$/, "")); records.push(row); row = []; cell = ""; }
    else cell += char;
  }
  if (cell || row.length) { row.push(cell.replace(/\r$/, "")); records.push(row); }
  return records;
}

function fromWindowsCsv(text) {
  const records = csvRecords(text);
  const header = records.shift()?.map((item) => item.trim());
  if (header?.join(",") === "ProcessId,ParentProcessId,WorkingSetSize,KernelModeTime,UserModeTime") {
    const out = [];
    for (const record of records) {
      if (out.length >= MAX_ROWS) break;
      const pid = numeric(record[0]), ppid = numeric(record[1]), rss = Number(record[2] || 0), kernel = Number(record[3] || 0), user = Number(record[4] || 0);
      if (pid !== null && ppid !== null && Number.isFinite(rss) && Number.isFinite(kernel) && Number.isFinite(user)) out.push({ pid, ppid, name: "", startedAt: null, commandLine: "", rssBytes: rss, cpuSeconds: (kernel + user) / 1e7 });
    }
    return out;
  }
  if (!header || HEADER.some((field) => !header.includes(field))) return [];
  const index = Object.fromEntries(HEADER.map((field) => [field, header.indexOf(field)]));
  const out = [];
  for (const record of records) {
    if (out.length >= MAX_ROWS) break;
    const pid = numeric(record[index.ProcessId]);
    const ppid = numeric(record[index.ParentProcessId]);
    const rss = Number(record[index.WorkingSetSize]);
    const kernel = Number(record[index.KernelModeTime] || 0);
    const user = Number(record[index.UserModeTime] || 0);
    if (pid === null || ppid === null || !Number.isFinite(rss) || rss < 0 || !Number.isFinite(kernel) || !Number.isFinite(user)) continue;
    out.push({ pid, ppid, name: record[index.Name] || "", startedAt: dateValue(record[index.CreationDate]), commandLine: record[index.CommandLine] || "", rssBytes: rss, cpuSeconds: (kernel + user) / 1e7 });
  }
  return out;
}

function fromPosix(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    if (out.length >= MAX_ROWS) break;
    // lstart is the fixed-width 24-character fifth ps field; args remains the unmodified remainder.
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.{24})\s+(.*)$/.exec(line);
    if (!match) {
      const legacy = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s*$/.exec(line);
      if (!legacy) continue;
      const pid = numeric(legacy[1]), ppid = numeric(legacy[2]), rss = Number(legacy[3]), cpu = cpuSeconds(legacy[4]);
      if (pid !== null && ppid !== null && Number.isFinite(rss) && cpu !== null) out.push({ pid, ppid, name: "", startedAt: null, commandLine: "", rssBytes: rss * 1024, cpuSeconds: cpu });
      continue;
    }
    const pid = numeric(match[1]), ppid = numeric(match[2]), rss = Number(match[3]), cpu = cpuSeconds(match[4]);
    if (pid === null || ppid === null || !Number.isFinite(rss) || cpu === null) continue;
    const commandLine = match[6];
    out.push({ pid, ppid, name: commandLine.trim().split(/\s/, 1)[0].split(/[\\/]/).pop() || "", startedAt: dateValue(match[5].trim()), commandLine, rssBytes: rss * 1024, cpuSeconds: cpu });
  }
  return out;
}

// Produces one normalized row shape regardless of the host's native process-list serialization.
export function parseProcessTable(output, { platform = process.platform } = {}) {
  const text = String(output ?? "");
  if (!text || text.length > MAX_OUTPUT) return [];
  if (platform === "win32" && /^\s*[{[]/.test(text)) {
    try {
      const parsed = JSON.parse(text);
      const source = Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" ? [parsed] : [];
      return source.slice(0, MAX_ROWS).flatMap((row) => {
        const pid = numeric(row?.ProcessId), ppid = numeric(row?.ParentProcessId);
        const rss = Number(row?.WorkingSetSize), kernel = Number(row?.KernelModeTime || 0), user = Number(row?.UserModeTime || 0);
        if (pid === null || ppid === null || !Number.isFinite(rss) || rss < 0 || !Number.isFinite(kernel) || !Number.isFinite(user)) return [];
        return [{ pid, ppid, name: String(row.Name ?? ""), startedAt: dateValue(row.CreationDate), commandLine: String(row.CommandLine ?? ""), rssBytes: rss, cpuSeconds: (kernel + user) / 1e7 }];
      });
    } catch { return []; }
  }
  return platform === "win32" && /^\s*"ProcessId",/.test(text) ? fromWindowsCsv(text) : fromPosix(text);
}

function spawnTable(command, platform) {
  if (!command || typeof command.bin !== "string" || !command.bin || !Array.isArray(command.args) || !command.args.every((arg) => typeof arg === "string")) return Promise.resolve(null);
  return new Promise((resolve) => {
    let child, output = "", outputBytes = 0, settled = false;
    const finish = (rows) => { if (settled) return; settled = true; clearTimeout(timer); resolve(rows); };
    child = spawn(command.bin, command.args, { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
    const timer = setTimeout(() => { child.kill(); finish(null); }, command.timeoutMs);
    child.stdout.on("data", (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > MAX_OUTPUT) { child.kill(); finish(null); return; }
      output += chunk.toString("utf8");
    });
    child.once("error", () => finish(null));
    child.once("close", (code) => finish(code === 0 ? parseProcessTable(output, { platform }) : null));
  });
}

// Windows: starting powershell.exe costs ~0.7 s of CPU per sample (measured on a 16-core Windows 11 host: 709 ms CPU,
// 1.5 s wall), while the same CIM query in a warm PowerShell costs ~90 ms. One PowerShell therefore stays alive and
// answers one request per stdin line. The request line is a fresh random marker that PowerShell echoes after the
// answer: it must never be in the PowerShell command line, because the answer lists that command line. It exits after
// `idleMs` without requests; any failure (spawn error, exit, timeout, oversized output) kills it, falls back to a
// one-shot spawn, and the one-shot path is used for `retryAfterMs`.
export function createPersistentSampler(command, { platform = "win32", idleMs = 60_000, spawnImpl = spawn, retryAfterMs = 60_000, now = Date.now } = {}) {
  const script = `while ($null -ne ($line = [Console]::In.ReadLine())) { try { ${command.query} | ForEach-Object { [Console]::Out.WriteLine($_) } } catch { }; [Console]::Out.WriteLine($line); [Console]::Out.Flush() }`;
  let child = null, output = "", waiter = null, marker = null, idleTimer = null, brokenUntil = 0;
  const stop = () => {
    clearTimeout(idleTimer);
    idleTimer = null;
    if (child) { child.removeAllListeners(); child.kill(); }
    child = null;
    output = "";
  };
  const fail = () => {
    brokenUntil = now() + retryAfterMs;
    const pending = waiter;
    waiter = null;
    stop();
    pending?.(null);
  };
  const start = () => {
    child = spawnImpl(command.bin, ["-NoProfile", "-NonInteractive", "-Command", script], { windowsHide: true, stdio: ["pipe", "pipe", "ignore"] });
    child.stdout.setEncoding?.("utf8");
    child.stdout.on("data", (chunk) => {
      output += chunk;
      if (output.length > MAX_OUTPUT) return fail();
      const end = marker ? output.indexOf(marker) : -1;
      if (end === -1 || !waiter) return;
      const text = output.slice(0, end);
      output = output.slice(end + marker.length).replace(/^\r?\n/, "");
      const resolve = waiter;
      waiter = null;
      resolve(parseProcessTable(text, { platform }));
    });
    child.stdin.on?.("error", fail);
    child.once("error", fail);
    child.once("exit", fail);
    // Never keeps the Studio process alive by itself; the request timer below holds the loop while a sample runs.
    child.unref?.();
    child.stdin.unref?.();
    child.stdout.unref?.();
  };
  return {
    async sample() {
      if (now() < brokenUntil) return spawnTable(command, platform);
      if (waiter) return null;
      if (!child) start();
      clearTimeout(idleTimer);
      const rows = await new Promise((resolve) => {
        const timer = setTimeout(fail, command.timeoutMs ?? 4000);
        waiter = (value) => { clearTimeout(timer); resolve(value); };
        marker = `__PI_STUDIO_END_${randomUUID().replaceAll("-", "")}__`;
        child.stdin.write(`${marker}\n`);
      });
      if (child) { idleTimer = setTimeout(stop, idleMs); idleTimer.unref?.(); }
      return rows ?? spawnTable(command, platform);
    },
    stop,
    get running() { return Boolean(child); },
  };
}

export function createProcessTable({ platform = process.platform, command = resolveProcessTableCommand({ platform }), now = Date.now, sample = null } = {}) {
  let cachedAt = -Infinity, cached = [], pending = null, success = false, snapshotValue = null;
  const persistent = !sample && platform === "win32" && command?.query ? createPersistentSampler(command, { platform }) : null;
  return {
    // `maxAgeMs` (default 5 s) is how old a successful sample this caller accepts; failures are retried after 1 s.
    async list({ maxAgeMs = 5000 } = {}) {
      if (now() - cachedAt < (success ? maxAgeMs : cachedAt === -Infinity ? 0 : 1000)) return cached;
      if (pending) return pending;
      pending = (async () => {
        try {
          const result = sample ? await sample() : persistent ? await persistent.sample() : await spawnTable(command, platform);
          cached = Array.isArray(result) ? result.slice(0, MAX_ROWS) : [];
          success = cached.length > 0;
        } catch { cached = []; }
        cachedAt = now();
        snapshotValue = success ? { at: cachedAt, rows: cached } : null;
        return cached;
      })();
      try { return await pending; } finally { pending = null; }
    },
    async snapshot() {
      const rows = await this.list();
      return success ? snapshotValue : null;
    },
    clear() { cachedAt = -Infinity; cached = []; success = false; snapshotValue = null; },
  };
}

export async function sampleProcessTable(command, platform = process.platform) {
  return spawnTable({ ...command, timeoutMs: command.timeoutMs ?? 4000 }, platform);
}

export const processTable = createProcessTable();
