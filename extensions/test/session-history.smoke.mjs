// session-history skill: the read-only helper finds earlier work in a session file, including what compaction dropped.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const script = path.join(root, "skills/session-history/scripts/session-search.mjs");
const skill = fs.readFileSync(path.join(root, "skills/session-history/SKILL.md"), "utf8");
assert.match(skill, /^name: session-history$/m);
assert.match(skill, /PI_SESSION_FILE/);
assert.match(skill, /session-search\.mjs/);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "session-history-"));
const file = path.join(dir, "s.jsonl");
const t = (min) => new Date(Date.now() - (120 - min) * 60e3).toISOString();
const big = "x".repeat(5000) + " MIGRATION-DONE";
const lines = [
  { type: "session", version: 3, id: "sess-1", timestamp: t(0), cwd: "/repo" },
  { type: "message", id: "u1", parentId: null, timestamp: t(1), message: { role: "user", content: "rode a migração do banco", timestamp: 1 } },
  { type: "message", id: "a1", parentId: "u1", timestamp: t(2), message: { role: "assistant", content: [{ type: "text", text: "Rodando." }, { type: "toolCall", id: "c1", name: "bash", arguments: { command: "npm run migrate -- --env prod" } }], stopReason: "toolUse" } },
  { type: "message", id: "r1", parentId: "a1", timestamp: t(3), message: { role: "toolResult", toolCallId: "c1", toolName: "bash", content: [{ type: "text", text: big }], isError: false } },
  { type: "message", id: "a2", parentId: "r1", timestamp: t(4), message: { role: "assistant", content: [{ type: "toolCall", id: "c2", name: "edit", arguments: { path: "src/auth.ts", edits: [{ oldText: "const ttl = 60", newText: "const ttl = 3600" }] } }], stopReason: "toolUse" } },
  { type: "message", id: "r2", parentId: "a2", timestamp: t(5), message: { role: "toolResult", toolCallId: "c2", toolName: "edit", content: [{ type: "text", text: "Edited src/auth.ts" }], isError: false } },
  { type: "message", id: "b1", parentId: "r2", timestamp: t(6), message: { role: "user", content: "abandoned branch idea" } },
  { type: "compaction", id: "k1", parentId: "r2", timestamp: t(100), summary: "## Goal\nMigrate the DB.", firstKeptEntryId: "r2", tokensBefore: 90000, details: { readFiles: [], modifiedFiles: ["src/auth.ts"] } },
  { type: "message", id: "u2", parentId: "k1", timestamp: t(110), message: { role: "user", content: "o que você mudou antes no auth?" } },
];
fs.writeFileSync(file, `${lines.map((l) => JSON.stringify(l)).join("\n")}\n`);
const hash = () => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const before = hash();
const run = (...args) => execFileSync(process.execPath, [script, ...args], { encoding: "utf8", env: { ...process.env, PI_SESSION_FILE: file } });

let out = run("migrate");
assert.match(out, /\[a1\].*npm run migrate/, "finds the command by keyword");
assert.match(out, /\[r1\] .*tool\/bash: bash «npm run migrate -- --env prod» →/, "a result carries the command that produced it");
assert.ok(out.split("\n").every((line) => line.length < 400), "hits are clipped");
out = run("MIGRATION-DONE");
assert.match(out, /\[r1\].*MIGRATION-DONE/, "a match deep in a long result is shown around the match");
out = run("--show", "r1", "--max", "6000");
assert.match(out, /call \[a1\] bash .*npm run migrate/);
assert.match(out, /MIGRATION-DONE/, "--show returns the full original result that compaction truncated");
out = run("--tool", "edit");
assert.match(out, /\[a2\]/); assert.match(out, /\[r2\].*src\/auth\.ts/);
out = run("--show", "a2");
assert.match(out, /const ttl = 3600/, "the diff is recoverable");
assert.match(out, /result \[r2\]: Edited src\/auth\.ts/);
out = run("--role", "user");
assert.equal((out.match(/^\[/gm) ?? []).length, 3);
out = run("--role", "user", "--branch");
assert.ok(!out.includes("abandoned"), "--branch leaves out other branches");
out = run("--compactions");
assert.match(out, /\[k1\].*tokensBefore=90000.*modified=src\/auth\.ts.*Migrate the DB/);
out = run("--after-compaction", "--role", "user");
assert.match(out, /\[u1\]/); assert.ok(!out.includes("[u2]"), "--after-compaction shows only what was summarized away");
out = run("--role", "user", "--since", "30m");
assert.match(out, /\[u2\]/); assert.ok(!out.includes("[u1]"), "--since filters by time");
out = run("--limit", "1", "--role", "user");
assert.match(out, /hits=3 \(last 1/);
assert.throws(() => execFileSync(process.execPath, [script, "x"], { encoding: "utf8", stdio: "pipe", env: { ...process.env, PI_SESSION_FILE: "" } }), /no session file/);
assert.equal(hash(), before, "the helper never writes the session file");

fs.rmSync(dir, { recursive: true, force: true });
console.log("session-history smoke: PASS");
