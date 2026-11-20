#!/usr/bin/env node
// Read-only search over a Pi session JSONL file. Prints one short line per hit; --show prints one entry.
import fs from "node:fs";

const HELP = `usage: session-search.mjs [options] [pattern]
  pattern            case-insensitive regex matched against entry text, tool arguments and results
  --file <path>      session file (default: $PI_SESSION_FILE)
  --role <r>         user | assistant | tool | compaction | branch | custom (repeatable)
  --tool <name>      only tool calls/results of this tool (bash, edit, write, read, Agent, ...)
  --since <time>     ISO time or relative (30m, 2h, 1d); --until likewise
  --branch           only the active branch (path from the last entry to the root)
  --compactions      list compaction/branch summaries with what they covered
  --show <id>        print one entry in full (its tool call and result are paired)
  --max <n>          characters per printed field (default 240; --show default 4000)
  --limit <n>        hits to print, newest last (default 40)
  --after-compaction only entries the newest compaction summarized away
`;

const args = process.argv.slice(2);
const opt = { roles: [], file: process.env.PI_SESSION_FILE, limit: 40 };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  const next = () => { if (i + 1 >= args.length) fail(`${a} needs a value`); return args[++i]; };
  if (a === "-h" || a === "--help") { process.stdout.write(HELP); process.exit(0); }
  else if (a === "--file") opt.file = next();
  else if (a === "--role") opt.roles.push(next());
  else if (a === "--tool") opt.tool = next();
  else if (a === "--since") opt.since = parseTime(next());
  else if (a === "--until") opt.until = parseTime(next());
  else if (a === "--branch") opt.branch = true;
  else if (a === "--compactions") opt.compactions = true;
  else if (a === "--after-compaction") opt.afterCompaction = true;
  else if (a === "--show") opt.show = next();
  else if (a === "--max") opt.max = Number(next());
  else if (a === "--limit") opt.limit = Number(next());
  else if (a.startsWith("--")) fail(`unknown option ${a}`);
  else opt.pattern = a;
}

function fail(message) { process.stderr.write(`session-search: ${message}\n${HELP}`); process.exit(2); }
function parseTime(value) {
  const rel = /^(\d+)([mhd])$/.exec(value);
  if (rel) return Date.now() - Number(rel[1]) * { m: 60e3, h: 3600e3, d: 86400e3 }[rel[2]];
  const t = Date.parse(value);
  if (Number.isNaN(t)) fail(`bad time ${value}`);
  return t;
}

if (!opt.file) fail("no session file: pass --file or run inside Pi's bash tool (PI_SESSION_FILE)");
let raw;
try { raw = fs.readFileSync(opt.file, "utf8"); } catch (error) { fail(`cannot read ${opt.file}: ${error.code ?? error.message}`); }
const entries = [];
for (const line of raw.split("\n")) {
  if (!line.trim()) continue;
  try { entries.push(JSON.parse(line)); } catch { /* a torn last line while Pi writes */ }
}
const header = entries[0]?.type === "session" ? entries.shift() : undefined;
const byId = new Map(entries.filter((e) => e.id).map((e) => [e.id, e]));

const textOf = (content) => typeof content === "string" ? content
  : Array.isArray(content) ? content.map((b) => b?.type === "text" ? b.text : b?.type === "toolCall" ? `${b.name}(${JSON.stringify(b.arguments)})` : b?.type === "image" ? "[image]" : "").filter(Boolean).join("\n") : "";
const calls = new Map();
for (const e of entries) {
  if (e.type !== "message" || e.message?.role !== "assistant") continue;
  for (const b of e.message.content ?? []) if (b?.type === "toolCall") calls.set(b.id, { entry: e, call: b });
}
const resultFor = new Map();
for (const e of entries) if (e.type === "message" && e.message?.role === "toolResult") resultFor.set(e.message.toolCallId, e);

function kind(e) {
  if (e.type === "message") {
    const r = e.message?.role;
    return r === "toolResult" || r === "bashExecution" ? "tool" : r;
  }
  return { compaction: "compaction", branch_summary: "branch", custom: "custom", custom_message: "custom" }[e.type] ?? e.type;
}
function toolName(e) {
  const m = e.message;
  if (m?.role === "toolResult") return m.toolName;
  if (m?.role === "bashExecution") return "bash";
  if (m?.role === "assistant") return (m.content ?? []).filter((b) => b?.type === "toolCall").map((b) => b.name).join(",") || undefined;
}
function describe(e) {
  const m = e.message;
  if (e.type === "message") {
    if (m.role === "toolResult") {
      const call = calls.get(m.toolCallId)?.call;
      const a = call?.arguments ?? {};
      const what = a.command ?? a.path ?? a.pattern ?? a.description ?? (call ? JSON.stringify(a) : "");
      return `${m.toolName}${m.isError ? " ERROR" : ""} ${what ? `«${what}» → ` : "→ "}${textOf(m.content)}`;
    }
    if (m.role === "bashExecution") return `!${m.command} (exit ${m.exitCode}) → ${m.output ?? ""}`;
    if (m.role === "assistant") return `${textOf(m.content)}${m.stopReason === "error" ? ` [error: ${m.errorMessage}]` : ""}`;
    return textOf(m.content);
  }
  if (e.type === "compaction") return `tokensBefore=${e.tokensBefore} firstKept=${e.firstKeptEntryId} files read=${(e.details?.readFiles ?? []).length} modified=${(e.details?.modifiedFiles ?? []).join(",")}\n${e.summary ?? ""}`;
  if (e.type === "branch_summary") return `from=${e.fromId}\n${e.summary ?? ""}`;
  if (e.type === "custom") return `${e.customType} ${JSON.stringify(e.data ?? {})}`;
  if (e.type === "custom_message") return `${e.customType} ${typeof e.content === "string" ? e.content : textOf(e.content)}`;
  if (e.type === "model_change") return `${e.provider}/${e.modelId}`;
  if (e.type === "thinking_level_change") return e.thinkingLevel;
  if (e.type === "label") return `${e.label} → ${e.targetId}`;
  if (e.type === "session_info") return e.name ?? "";
  return JSON.stringify(e).slice(0, 200);
}
const clip = (s, n) => { const flat = String(s).replace(/\s+/g, " ").trim(); return flat.length > n ? `${flat.slice(0, n)}… [+${flat.length - n} chars]` : flat; };
const when = (e) => {
  const t = Date.parse(e.timestamp);
  if (Number.isNaN(t)) return "?";
  const d = new Date(t);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

if (opt.show) {
  const max = opt.max ?? 4000;
  const e = byId.get(opt.show) ?? entries.find((x) => x.id?.startsWith(opt.show));
  if (!e) fail(`no entry ${opt.show}`);
  const out = [`[${e.id}] ${when(e)} ${kind(e)}${toolName(e) ? `/${toolName(e)}` : ""} parent=${e.parentId}`];
  if (e.type === "message" && e.message.role === "assistant") {
    out.push(clip(textOf(e.message.content), max));
    for (const b of e.message.content ?? []) if (b?.type === "toolCall") {
      const r = resultFor.get(b.id);
      out.push(`  result ${r ? `[${r.id}]` : "(none)"}${r?.message.isError ? " ERROR" : ""}: ${r ? clip(textOf(r.message.content), max) : ""}`);
    }
  } else if (e.type === "message" && e.message.role === "toolResult") {
    const c = calls.get(e.message.toolCallId);
    if (c) out.push(`  call [${c.entry.id}] ${c.call.name} ${clip(JSON.stringify(c.call.arguments), max)}`);
    out.push(clip(textOf(e.message.content), max));
  } else out.push(String(describe(e)).slice(0, max));
  process.stdout.write(`${out.join("\n")}\n`);
  process.exit(0);
}

let pool = entries;
if (opt.branch) {
  const path = [];
  for (let e = entries.at(-1); e; e = e.parentId ? byId.get(e.parentId) : undefined) path.unshift(e);
  pool = path;
}
if (opt.compactions) {
  const max = opt.max ?? 600;
  const list = pool.filter((e) => e.type === "compaction" || e.type === "branch_summary");
  if (!list.length) process.stdout.write("no compaction or branch summary in this session\n");
  for (const e of list) process.stdout.write(`[${e.id}] ${when(e)} ${kind(e)} ${clip(describe(e), max)}\n`);
  process.exit(0);
}
if (opt.afterCompaction) {
  const at = pool.findLastIndex((e) => e.type === "compaction");
  if (at < 0) fail("no compaction in this session");
  const kept = pool.findIndex((e) => e.id === pool[at].firstKeptEntryId);
  pool = pool.slice(0, kept >= 0 && kept < at ? kept : at);
}
const re = opt.pattern ? new RegExp(opt.pattern, "i") : undefined;
const hits = pool.filter((e) => {
  if (e.type === "session") return false;
  if (opt.roles.length && !opt.roles.includes(kind(e))) return false;
  if (opt.tool && !(toolName(e) ?? "").split(",").includes(opt.tool)) return false;
  const t = Date.parse(e.timestamp);
  if (opt.since && !(t >= opt.since)) return false;
  if (opt.until && !(t <= opt.until)) return false;
  if (!re && !opt.roles.length && !opt.tool && !["message", "compaction", "branch_summary"].includes(e.type)) return false;
  return !re || re.test(describe(e));
});
const max = opt.max ?? 240;
const shown = hits.slice(-opt.limit);
if (header) process.stdout.write(`session ${header.id} cwd=${header.cwd}${header.parentSession ? ` parent=${header.parentSession}` : ""} entries=${entries.length} hits=${hits.length}${hits.length > shown.length ? ` (last ${shown.length}; use --limit/--since)` : ""}\n`);
for (const e of shown) {
  let text = describe(e);
  if (re) { const m = re.exec(text); if (m && m.index > max / 2) text = `…${text.slice(m.index - Math.floor(max / 4))}`; }
  process.stdout.write(`[${e.id}] ${when(e)} ${kind(e)}${toolName(e) ? `/${toolName(e)}` : ""}: ${clip(text, max)}\n`);
}
