import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePiSdkRoot } from "./lib/pi-sdk.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sdkRoot = resolvePiSdkRoot(import.meta.url);
const require = createRequire(import.meta.url);
const { createJiti } = require(path.join(sdkRoot, "node_modules/jiti/lib/jiti.cjs"));
const jiti = createJiti(import.meta.url, { fsCache: false, alias: { "@earendil-works/pi-coding-agent": path.join(sdkRoot, "dist/index.js") } });
const m = await jiti.import(path.join(root, "extensions/orchestration-mode.ts"));

const systemMd = fs.readFileSync(path.join(root, "SYSTEM.md"), "utf8").replace(/\r\n/g, "\n");
const configSystemMd = fs.readFileSync(path.join(root, "config/SYSTEM.md"), "utf8").replace(/\r\n/g, "\n");
const workerPolicy = systemMd.split("\n").find((line) => line.startsWith("- **Worker communication:**"));
assert.ok(workerPolicy && configSystemMd.split("\n").includes(workerPolicy), "worker communication policy is mirrored exactly");
for (const phrase of ["completed acceptance", "concrete blocker/decision", "Do not send acknowledgements", "heartbeats", "PR-open-only notices", "Resolve local engineering failures first", "answer explicit coordinator requests", "A PR opening alone is not completion"]) assert.ok(workerPolicy.includes(phrase), `worker policy includes ${phrase}`);
const tail = "\n\n<available_skills>flow-orca orchestration</available_skills>\n<!-- PI EXECUTION MODE START -->yolo<!-- PI EXECUTION MODE END -->";
const assembled = systemMd + tail;

// Prompt construction from the real SYSTEM.md: kept rules verbatim, engineering sections dropped.
const conductor = m.buildConductorPrompt(systemMd);
assert.ok(conductor, "conductor prompt builds from the real SYSTEM.md");
assert.ok(conductor.startsWith("# PI Coding Agent — Conductor mode"));
for (const heading of m.KEPT_SECTIONS) assert.ok(conductor.includes(m.extractSection(systemMd, heading)), `${heading} kept verbatim`);
for (const prefix of ["- **GitHub issues, Project/Kanban", "- **Orca worktree with an agent, outside `flow-orca`:**", "- **Settling child PIs you launched"]) { const bullet = systemMd.split("\n").find((line) => line.startsWith(prefix)); assert.ok(bullet && conductor.includes(bullet), `${prefix} kept verbatim`); }
assert.match(conductor, /\*\*Consequential Action Gate:\*\*/);
for (const dropped of ["## Engineering and Architecture", "## Workflow Selection", "## Retrieval and Evidence"]) assert.ok(!conductor.includes(dropped), `${dropped} dropped`);
assert.match(conductor, /Never `sleep`, poll, or tail a worker's terminal/);
assert.match(conductor, /never product code/);
assert.match(conductor, /## Focus/); assert.match(conductor, /The request is the whole campaign or todo list/); assert.match(conductor, /one line per issue in the campaign/); assert.match(conductor, /covers every open item on the list/); assert.match(conductor, /ownership means finishing that, not finding more to do/);
assert.ok(conductor.indexOf("## Focus") < conductor.indexOf("## Conductor-only work"));
assert.match(conductor, /## Operating Contract/); assert.match(conductor, /Do the next step; don't narrate it/);
assert.match(conductor, /## Validation and Completion/);
assert.match(conductor, /Only the hands change/);
assert.match(conductor, /## Round close: refill from the board/); assert.match(conductor, /never a timer, poll, or watch loop/);
assert.match(conductor, /## Stay free for the whole campaign/); assert.match(conductor, /Never let a single item absorb you/); assert.match(conductor, /sweep all children/);
assert.match(conductor, /\*\*Settling child PIs you launched/, "conductor settles finished children");
assert.match(conductor, /Engineering and architecture choices[^\n]*are yours/, "conductor keeps engineering judgment");
assert.match(conductor, /Work you or a sub-PI can do is never "blocked"/, "status board reserves blocked");
assert.match(conductor, /\*\*Stay anchored to the final outcome:\*\*/, "conductor keeps outcome anchoring");
assert.match(conductor, /gpt-6\.1-sol` with `medium` thinking/, "conductor launches children on Sol medium");
assert.match(conductor, /settle every child as the Settling bullet says/, "worker events trigger settlement");
assert.match(conductor, /handoffs ask for the smallest check that proves the change/, "handoffs do not demand test spirals");
assert.match(conductor, /Include this exact rule in every handoff: unsolicited messages to the coordinator are only for completed acceptance or a concrete blocker\/decision that needs the coordinator\./, "worker handoff repeats the communication policy");
assert.doesNotMatch(conductor.match(/## Waiting[\s\S]*?(?=^## |$)/m)?.[0] ?? "", /worker event \(finished, PR opened/);
assert.match(conductor, /Never end a turn with a list of "pending items" you could act on/);
assert.match(conductor, /stop every process, container, emulator, and VM\/sandbox you started/, "handoffs require workers to stop what they started");

// Goal reports arrive as a line typed into the coordinator terminal; no mailbox wake or long-poll.
for (const [name, doc] of [["SYSTEM.md", systemMd], ["config/SYSTEM.md", configSystemMd], ["conductor prompt", conductor]]) {
  assert.match(doc, /\[child <worktree>\] goal finished\|blocked/, `${name}: harness types the report into the coordinator terminal`);
  assert.doesNotMatch(doc, /check --run <run-id> --wait/, `${name}: no long-poll fallback`);
}
const waiting = conductor.match(/## Waiting\n[\s\S]*?(?=\n## )/)?.[0] ?? "";
assert.match(waiting, /End the turn while workers run/, "conductor ends the turn and is woken by the typed report");
assert.match(waiting, /prompt called "handoff"[^\n]*supervision[^\n]*Task\/Dispatch/, "handoff wording does not make supervision a transfer");
assert.match(waiting, /genuine standalone full transfer[^\n]*ends after proven delivery/, "true full transfer still needs no monitoring");
assert.match(systemMd, /Proven delivery completes this full ownership handoff/, "full transfer rule preserved");

// Replacement touches only the SYSTEM.md block; skills and other injections survive.
const replaced = m.applyConductor(assembled, systemMd);
assert.equal(replaced, conductor + tail);
// Windows headings are accepted without normalizing preserved policy text or surrounding context.
const crlfSystemMd = systemMd.replace(/\n/g, "\r\n");
const crlfConductor = m.buildConductorPrompt(crlfSystemMd);
assert.ok(crlfConductor, "conductor prompt builds from CRLF SYSTEM.md");
for (const heading of m.KEPT_SECTIONS) {
  const section = m.extractSection(crlfSystemMd, heading);
  assert.equal(section, m.extractSection(systemMd, heading).replace(/\n/g, "\r\n"), `${heading} keeps CRLF verbatim`);
  assert.ok(crlfConductor.includes(section), `${heading} CRLF section kept verbatim`);
}
const prefix = "native prefix\r\n";
assert.equal(m.applyConductor(prefix + crlfSystemMd + tail, crlfSystemMd), prefix + crlfConductor + tail);
const crlfBroken = crlfSystemMd.replace("## Safety\r\n", "## Safety rules\r\n");
assert.equal(m.buildConductorPrompt(crlfBroken), undefined, "CRLF missing section fails safe");
assert.equal(m.applyConductor(crlfBroken + tail, crlfBroken), undefined);
// Fail-safe: a missing kept section leaves the prompt untouched.
const broken = systemMd.replace("## Safety\n", "## Safety rules\n");
assert.equal(m.buildConductorPrompt(broken), undefined);
assert.equal(m.applyConductor(broken + tail, broken), undefined);

// Extension wiring with a fake PI.
const handlers = new Map(); const commands = new Map(); const entries = []; const notices = []; const statuses = []; const emitted = [];
m.default({
  on: (name, fn) => handlers.set(name, fn),
  registerCommand: (name, def) => commands.set(name, def),
  appendEntry: (customType, data) => entries.push({ type: "custom", customType, data }),
  events: { emit: (name, data) => emitted.push({ name, data }) },
});
const ctx = {
  sessionManager: { getBranch: () => entries },
  ui: { notify: (message, type) => notices.push({ message, type }), setStatus: (key, text) => statuses.push({ key, text }) },
};
const start = (customPrompt, systemPrompt) => handlers.get("before_agent_start")({ systemPrompt, systemPromptOptions: { customPrompt } }, ctx);

assert.equal(await start(systemMd, assembled), undefined, "standard by default");
await commands.get("orchestration").handler("conductor", ctx);
assert.equal(statuses.at(-1).text, "🎼 CONDUCTOR");
assert.equal(emitted.at(-1).name, m.MODE_CHANGED_EVENT);
assert.equal(emitted.at(-1).data.ctx, ctx, "notification carries current command context after session entry append");
assert.deepEqual(await start(systemMd, assembled), { systemPrompt: conductor + tail });
assert.deepEqual(await start(crlfSystemMd, prefix + crlfSystemMd + tail), { systemPrompt: prefix + crlfConductor + tail }, "native event accepts CRLF and preserves surrounding context");
assert.equal(await start(crlfBroken, crlfBroken + tail), undefined, "CRLF event fails safe");
assert.equal(await start("# Builder agent\n", "# Builder agent\n"), undefined, "subagent prompts are never replaced");
assert.equal(await start(broken, broken + tail), undefined, "fail-safe keeps standard");
assert.equal(notices.at(-1).type, "warning");
await commands.get("orchestration").handler("standard", ctx);
assert.equal(statuses.at(-1).text, undefined);
assert.equal(await start(systemMd, assembled), undefined, "back to standard");
await commands.get("orchestration").handler("bogus", ctx);
assert.match(notices.at(-1).message, /Uso: \/orchestration/);
assert.equal(m.readSessionMode([]), "standard", "new sessions start standard");

console.log(`orchestration-mode smoke: PASS (conductor prompt ${conductor.length} chars vs SYSTEM.md ${systemMd.length})`);
