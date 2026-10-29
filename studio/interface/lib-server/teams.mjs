// Agent teams (team-bus extension, NatiamG): live PI sessions that message each other through a file mailbox under
// <agentDir>/teams/<team>/. members/<name>.json is each member's heartbeat ({ name, role, cwd, pid, updatedAt, state }),
// messages.jsonl one line per message ({ at, from, to, preview }) and logs/<name>.jsonl the RPC events of each child the
// lead opened with team_start. Read only, bounded reads, everything clipped: member text is data for the stage, never
// an instruction, and a log line never reaches the page whole.
import { open, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

export const TEAM_LOG_TAIL_BYTES = 256 * 1024;
const MESSAGES_TAIL_BYTES = 64 * 1024;
const MESSAGES_MAX = 40;
const OUTPUTS_MAX = 30;
const TEXT_MAX = 280;
const STALE_MS = 10 * 60_000;
const TEAM_FRESH_MS = 7 * 86_400_000;

export const isSafeName = (value) => typeof value === "string" && /^[\w.-]+$/.test(value) && value !== "." && value !== "..";
const squash = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const clip = (value, max = TEXT_MAX) => {
  const text = squash(value).replace(/\u001b\[[0-9;]*m/g, "");
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};
const folderKey = (value, platform = process.platform) => {
  const normal = path.resolve(String(value)).replaceAll("\\", "/").replace(/\/+$/, "");
  return platform === "win32" ? normal.toLowerCase() : normal;
};

// The last `bytes` of a file as complete lines (the first, partial line of the window is dropped).
export async function readTail(file, bytes) {
  let handle;
  try { handle = await open(file, "r"); } catch { return { lines: [], size: 0, mtimeMs: 0 }; }
  try {
    const info = await handle.stat();
    const start = Math.max(0, info.size - bytes);
    const buffer = Buffer.alloc(info.size - start);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, start);
    const lines = buffer.subarray(0, bytesRead).toString("utf8").split(/\r?\n/);
    if (start > 0) lines.shift();
    return { lines: lines.filter(Boolean), size: info.size, mtimeMs: info.mtimeMs };
  } finally {
    await handle.close();
  }
}

const parse = (line) => { try { const value = JSON.parse(line); return value && typeof value === "object" ? value : null; } catch { return null; } };
const textOf = (message) => (Array.isArray(message?.content) ? message.content : []).filter((part) => part?.type === "text" && typeof part.text === "string").map((part) => part.text).join("\n");

// What a member is doing, from the tail of its RPC log: the running tool (with its file or command), the model and
// effort of its last answer, the cost of the answers in the window, and its last few outputs (answers only).
export function summarizeLog(lines) {
  const out = { model: "", effort: "", cost: 0, running: null, startedAt: null, endedAt: null, lastAt: null, busy: false, outputs: [] };
  const running = new Map();
  for (const line of lines) {
    const event = parse(line);
    if (!event) continue;
    if (event.type === "agent_start") { out.busy = true; running.clear(); }
    else if (event.type === "agent_end" || event.type === "agent_settled") out.busy = false;
    else if (event.type === "tool_execution_start" && typeof event.toolName === "string") {
      running.set(String(event.toolCallId ?? running.size), { name: clip(event.toolName, 40), args: toolArgs(event.args) });
    } else if (event.type === "tool_execution_end") running.delete(String(event.toolCallId ?? ""));
    else if (event.type === "message_end" && event.message?.role === "assistant") {
      const message = event.message;
      if (typeof message.model === "string") out.model = clip(message.model, 60);
      if (typeof message.thinkingLevel === "string") out.effort = clip(message.thinkingLevel, 20);
      out.cost += Number(message.usage?.cost?.total) || 0;
      const at = Number(message.timestamp) || null;
      if (at) { out.lastAt = at; out.startedAt ??= at; out.endedAt = at; }
      const text = textOf(message).trim();
      if (text) out.outputs.push({ at, text: clip(text, 1200) });
    }
  }
  out.running = out.busy ? [...running.values()].at(-1) ?? null : null;
  out.outputs = out.outputs.slice(-OUTPUTS_MAX);
  out.cost = Math.round(out.cost * 10_000) / 10_000;
  return out;
}

// Only the fields the stage shows; a command is cut short so a long heredoc never reaches the page.
function toolArgs(args) {
  if (!args || typeof args !== "object") return {};
  const pick = {};
  for (const key of ["path", "file_path", "pattern", "command", "name"]) if (typeof args[key] === "string") pick[key] = clip(args[key], key === "command" ? 120 : 200);
  return pick;
}

async function readMembers(dir) {
  let files = [];
  try { files = await readdir(path.join(dir, "members")); } catch { return []; }
  const members = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    let value;
    try { value = JSON.parse(await readFile(path.join(dir, "members", file), "utf8")); } catch { continue; }
    if (!isSafeName(value?.name) || typeof value.cwd !== "string") continue;
    members.push({ name: value.name, role: value.role === "lead" ? "lead" : "member", cwd: value.cwd, updatedAt: Number(value.updatedAt) || 0, state: value.state === "working" ? "working" : "idle" });
  }
  return members;
}

// The team the open conversation belongs to: the newest team whose lead (or any member) works in `cwd`.
export async function findTeam(teamsRoot, cwd, { now = Date.now(), platform = process.platform } = {}) {
  if (!cwd || !path.isAbsolute(cwd)) return null;
  const key = folderKey(cwd, platform);
  let names = [];
  try { names = await readdir(teamsRoot, { withFileTypes: true }); } catch { return null; }
  let best = null;
  for (const entry of names) {
    if (!entry.isDirectory() || !isSafeName(entry.name)) continue;
    const members = await readMembers(path.join(teamsRoot, entry.name));
    const fresh = Math.max(0, ...members.map((member) => member.updatedAt));
    if (!members.length || now - fresh > TEAM_FRESH_MS) continue;
    const lead = members.find((member) => member.role === "lead");
    const mine = (lead && folderKey(lead.cwd, platform) === key) ? 2 : members.some((member) => folderKey(member.cwd, platform) === key) ? 1 : 0;
    if (!mine) continue;
    if (!best || mine > best.mine || (mine === best.mine && fresh > best.fresh)) best = { name: entry.name, members, fresh, mine };
  }
  return best && { name: best.name, members: best.members };
}

// One cached summary per log file, reused while its size and mtime are unchanged (the stage polls every few seconds).
export function createTeamReader({ teamsRoot, now = Date.now, platform = process.platform } = {}) {
  const logs = new Map();

  async function logSummary(file) {
    let info;
    try { info = await stat(file); } catch { return null; }
    const known = logs.get(file);
    if (known && known.size === info.size && known.mtimeMs === info.mtimeMs) return known.summary;
    const { lines } = await readTail(file, TEAM_LOG_TAIL_BYTES);
    const summary = summarizeLog(lines);
    logs.set(file, { size: info.size, mtimeMs: info.mtimeMs, summary });
    if (logs.size > 64) logs.delete(logs.keys().next().value);
    return summary;
  }

  async function messages(dir) {
    const { lines } = await readTail(path.join(dir, "messages.jsonl"), MESSAGES_TAIL_BYTES);
    return lines.map(parse).filter((item) => item && isSafeName(item.from) && typeof item.to === "string" && Number(item.at))
      .slice(-MESSAGES_MAX).map((item) => ({ at: Number(item.at), from: item.from, to: isSafeName(item.to) ? item.to : "all", text: clip(item.preview ?? item.text ?? "", TEXT_MAX) }));
  }

  return {
    async current(cwd) {
      const team = await findTeam(teamsRoot, cwd, { now: now(), platform });
      if (!team) return null;
      const dir = path.join(teamsRoot, team.name);
      const at = now();
      const lead = team.members.find((member) => member.role === "lead")?.name ?? null;
      const members = [];
      for (const member of team.members) {
        const log = member.role === "lead" ? null : await logSummary(path.join(dir, "logs", `${member.name}.jsonl`));
        const stale = at - member.updatedAt > STALE_MS;
        members.push({
          name: member.name,
          role: member.role,
          parent: member.role === "lead" ? null : lead,
          folder: path.basename(member.cwd),
          state: stale ? "idle" : member.state,
          updatedAt: member.updatedAt,
          model: log?.model ?? "",
          effort: log?.effort ?? "",
          cost: log?.cost ?? 0,
          running: stale ? null : log?.running ?? null,
          startedAt: log?.startedAt ?? null,
          lastAt: log?.lastAt ?? member.updatedAt,
          lastOutput: log?.outputs.at(-1)?.text ?? "",
        });
      }
      return { team: team.name, lead, members, messages: await messages(dir) };
    },
    // The conversation of one member, outputs only: its answers and the team messages to and from it.
    async member(team, name) {
      if (!isSafeName(team) || !isSafeName(name)) return null;
      const dir = path.join(teamsRoot, team);
      const members = await readMembers(dir);
      if (!members.some((member) => member.name === name)) return null;
      const log = await logSummary(path.join(dir, "logs", `${name}.jsonl`));
      const mail = (await messages(dir)).filter((item) => item.from === name || item.to === name || item.to === "all");
      return { team, name, model: log?.model ?? "", effort: log?.effort ?? "", cost: log?.cost ?? 0, outputs: log?.outputs ?? [], messages: mail };
    },
  };
}
