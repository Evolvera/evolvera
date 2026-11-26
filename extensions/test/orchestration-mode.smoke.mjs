import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import { resolvePiSdkRoot } from "./lib/pi-sdk.mjs";


const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sdkRoot = resolvePiSdkRoot(import.meta.url);
const sandboxHome = fs.mkdtempSync(path.join(os.tmpdir(), "orchestration-mode-"));
for (const key of Object.keys(process.env)) if (/^(ORCA|PI)_/.test(key)) delete process.env[key];
process.env.HOME = sandboxHome;
process.env.USERPROFILE = sandboxHome;
process.env.PI_CODING_AGENT_DIR = path.join(sandboxHome, ".pi", "agent");
process.on("exit", () => fs.rmSync(sandboxHome, { recursive: true, force: true }));
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
for (const prefix of ["- **GitHub issues, Project/Kanban", "- **Orca worktree with an agent, outside `flow-orca`:**", "- **Settling child PIs you launched", "- **Tests serve the outcome:**"]) { const bullet = systemMd.split("\n").find((line) => line.startsWith(prefix)); assert.ok(bullet && conductor.includes(bullet), `${prefix} kept verbatim`); }
assert.match(conductor, /\*\*Consequential Action Gate:\*\*/);
assert.equal(systemMd, configSystemMd, "SYSTEM source and installed mirror remain identical");
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
assert.match(conductor, /\*\*Tests serve the outcome:\*\*/, "conductor keeps proportional testing");
assert.match(conductor, /\*\*Stay anchored to the final outcome:\*\*/, "conductor keeps outcome anchoring");
assert.match(conductor, /Child PI sessions default to (?:the physical )?`[^`]+`[^`]{0,60}?with `[^`]+` thinking/, "conductor states a child PI model and effort default");
assert.match(conductor, /settle every child as the Settling bullet says/, "worker events trigger settlement");
assert.match(conductor, /handoffs ask for the smallest check that proves the change/, "handoffs do not demand test spirals");
assert.match(conductor, /Include this exact rule in every handoff: unsolicited messages to the coordinator are only for completed acceptance or a concrete blocker\/decision that needs the coordinator\./, "worker handoff repeats the communication policy");
assert.doesNotMatch(conductor.match(/## Waiting[\s\S]*?(?=^## |$)/m)?.[0] ?? "", /worker event \(finished, PR opened/);
assert.match(conductor, /Never end a turn with a list of "pending items" you could act on/);
assert.match(conductor, /\*\*Reclaim finished children \(standing user instruction\):\*\*/, "conductor keeps the reclaim rule");
assert.match(conductor, /reclaim the merged ones as the Reclaim bullet says/, "sweep reclaims merged children");
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

// Event-driven waiting: no polling or no-change updates, notices wake the conductor, every notice refills slots.
assert.match(waiting, /never run a `\/goal` polling loop or `watch`; never write "sem mudança"/, "no polling loop or no-change update");
assert.match(waiting, /pause your own `\/goal` and leave it paused\. End the turn while workers run and stay idle/, "goal stays paused while idle");
assert.match(waiting, /AVISO DE FILHOS \(evento automático\): \[child <worktree>\] <kind>/, "notice format");
for (const kind of ["goal_finished", "goal_blocked", "idle", "prompt", "quit", "died", "job"]) assert.ok(waiting.includes(`\`${kind}\``) || waiting.includes(`/\`${kind}\``), `notice kind ${kind}`);
assert.match(waiting, /explicitly check both the active slot count and the free RAM; \(3\) re-read the live board; \(4\) open a sub-PI for every granted ready issue that has none, up to the twelve-slot ceiling and the memory limit/, "every notice refills slots within RAM");
assert.match(waiting, /report evidence only, never settlement, release, GitHub `Done`, merge authorization/, "notice is not settlement");
assert.match(waiting, /notify-conductor "<job> finished: status \$status" "\$run_id"; exit "\$status"/, "background job example passes the Run and keeps status");
assert.doesNotMatch(waiting, /run_[A-Za-z0-9]{6,}/, "no hardcoded Run id");
assert.match(waiting, /worker-report extension types the one-line goal report directly/, "direct fallback documented");
assert.match(waiting, /no monitoring; this event model never turns such a transfer into supervision/, "standalone transfer is not monitored");

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

// Extension wiring with a fake PI. The mock thinking runtime mirrors PI: a level change emits
// `thinking_level_select` back into the extension, so conductor reentrancy is exercised for real.
const handlers = new Map(); const commands = new Map(); const entries = []; const notices = []; const statuses = []; const emitted = [];
let thinkingLevel = "high"; const thinkingCalls = [];
const ctx = {
  cwd: sandboxHome,
  sessionManager: { getBranch: () => entries },
  ui: { notify: (message, type) => notices.push({ message, type }), setStatus: (key, text) => statuses.push({ key, text }) },
};
m.default({
  on: (name, fn) => handlers.set(name, fn),
  registerCommand: (name, def) => commands.set(name, def),
  appendEntry: (customType, data) => entries.push({ type: "custom", customType, data }),
  events: { emit: (name, data) => emitted.push({ name, data }) },
  getThinkingLevel: () => thinkingLevel,
  setThinkingLevel: (level) => {
    thinkingCalls.push(level);
    if (level === thinkingLevel) return;
    const previousLevel = thinkingLevel; thinkingLevel = level;
    handlers.get("thinking_level_select")?.({ type: "thinking_level_select", level, previousLevel }, ctx);
  },
});
assert.ok(handlers.has("tool_result"), "bash results are observed for conductor job notices");
assert.equal(await handlers.get("tool_result")({ type: "tool_result", toolName: "bash", isError: false, input: { command: "true" } }, ctx), undefined, "standard sessions ignore bash results");
const start = (customPrompt, systemPrompt) => handlers.get("before_agent_start")({ systemPrompt, systemPromptOptions: { customPrompt } }, ctx);
const nextTurn = async () => start(systemMd, assembled);

assert.equal(await start(systemMd, assembled), undefined, "standard by default");
assert.equal(thinkingCalls.length, 0, "standard sessions never touch thinking effort");
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

// Conductor starts on medium effort and stops fighting a choice made afterwards.
thinkingLevel = "high";
await commands.get("orchestration").handler("conductor", ctx);
assert.equal(thinkingLevel, "medium", "entering conductor starts on medium");
assert.equal(thinkingCalls.at(-1), "medium");
const pinnedCalls = thinkingCalls.length;
thinkingLevel = "xhigh";
await nextTurn();
assert.equal(thinkingLevel, "xhigh", "a higher effort chosen afterwards is respected");
thinkingLevel = "off";
await nextTurn();
assert.equal(thinkingLevel, "off", "a lower effort chosen afterwards is respected");
assert.equal(thinkingCalls.length, pinnedCalls, "no hidden reset happens after the pin");
// Model change and session resume bring the conductor back to medium.
thinkingLevel = "high";
await handlers.get("model_select")({ type: "model_select", source: "set" }, ctx);
assert.equal(thinkingLevel, "medium", "model change returns to medium");
thinkingLevel = "high";
await handlers.get("session_start")({ type: "session_start", reason: "resume" }, ctx);
assert.equal(thinkingLevel, "medium", "session resume returns to medium");
assert.equal(statuses.at(-1).text, "🎼 CONDUCTOR");
// Standard sessions are never forced and can hold a higher effort.
await commands.get("orchestration").handler("standard", ctx);
const standardCalls = thinkingCalls.length;
thinkingLevel = "high";
await nextTurn();
assert.equal(thinkingLevel, "high", "standard keeps a user-selected high effort");
assert.equal(thinkingCalls.length, standardCalls, "standard never sets a thinking level");
assert.equal(await start(systemMd, assembled), undefined, "standard keeps the standard prompt");
assert.equal(thinkingLevel, "high");
// A worker or new session with an empty branch inherits neither the prompt nor the pin.
const workerEntries = []; const workerStatuses = [];
const workerCtx = { cwd: sandboxHome, sessionManager: { getBranch: () => workerEntries }, ui: { notify: () => {}, setStatus: (key, text) => workerStatuses.push({ key, text }) } };
thinkingLevel = "xhigh";
const workerCalls = thinkingCalls.length;
await handlers.get("session_start")({ type: "session_start", reason: "startup" }, workerCtx);
await handlers.get("model_select")({ type: "model_select", source: "set" }, workerCtx);
assert.equal(await handlers.get("before_agent_start")({ systemPrompt: assembled, systemPromptOptions: { customPrompt: systemMd } }, workerCtx), undefined, "worker keeps the standard prompt");
assert.equal(thinkingLevel, "xhigh", "a worker with an empty branch keeps its own effort");
assert.equal(thinkingCalls.length, workerCalls, "workers are never pinned");
assert.equal(workerStatuses.at(-1).text, undefined);

console.log(`orchestration-mode smoke: PASS (conductor prompt ${conductor.length} chars vs SYSTEM.md ${systemMd.length})`);
