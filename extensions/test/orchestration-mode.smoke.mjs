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

const systemMd = fs.readFileSync(path.join(root, "SYSTEM.md"), "utf8");
const tail = "\n\n<available_skills>flow-orca orchestration</available_skills>\n<!-- PI EXECUTION MODE START -->yolo<!-- PI EXECUTION MODE END -->";
const assembled = systemMd + tail;

// Prompt construction from the real SYSTEM.md: kept rules verbatim, engineering sections dropped.
const conductor = m.buildConductorPrompt(systemMd);
assert.ok(conductor, "conductor prompt builds from the real SYSTEM.md");
assert.ok(conductor.startsWith("# PI Coding Agent — Conductor mode"));
for (const heading of m.KEPT_SECTIONS) assert.ok(conductor.includes(m.extractSection(systemMd, heading)), `${heading} kept verbatim`);
for (const prefix of m.KEPT_BULLETS) assert.ok(conductor.includes(m.extractBullet(systemMd, prefix)), `${prefix} kept verbatim`);
assert.match(conductor, /\*\*Consequential Action Gate:\*\*/);
for (const dropped of ["## Engineering and Architecture", "## Workflow Selection", "## Retrieval and Evidence"]) assert.ok(!conductor.includes(dropped), `${dropped} dropped`);
assert.match(conductor, /Never `sleep`, poll, or tail a worker's terminal/);
assert.match(conductor, /never product code/);
assert.match(conductor, /## Focus/); assert.match(conductor, /The request is the whole campaign or todo list/); assert.match(conductor, /one line per issue in the campaign/); assert.match(conductor, /covers every open item on the list/); assert.match(conductor, /ownership means finishing that, not finding more to do/);
assert.ok(conductor.indexOf("## Focus") < conductor.indexOf("## Conductor-only work"));
assert.match(conductor, /## Operating Contract/); assert.match(conductor, /Do the next step; don't narrate it/);
assert.match(conductor, /## Validation and Completion/);
assert.match(conductor, /Only the hands change/);
assert.match(conductor, /\*\*Settling child PIs you launched/, "conductor settles finished children");
assert.match(conductor, /Engineering and architecture choices[^\n]*are yours/, "conductor keeps engineering judgment");
assert.match(conductor, /Work you or a sub-PI can do is never "blocked"/, "status board reserves blocked");
assert.match(conductor, /\*\*Tests serve the outcome:\*\*/, "conductor keeps proportional testing");
assert.match(conductor, /\*\*Stay anchored to the final outcome:\*\*/, "conductor keeps outcome anchoring");
assert.match(conductor, /gpt-6\.1-sol` with `high` thinking/, "conductor launches children on Sol high");
assert.match(conductor, /settle every child as the Settling bullet says/, "worker events trigger settlement");
assert.match(conductor, /handoffs ask for the smallest check that proves the change/, "handoffs do not demand test spirals");
assert.match(conductor, /Never end a turn with a list of "pending items" you could act on/);

// Replacement touches only the SYSTEM.md block; skills and other injections survive.
const replaced = m.applyConductor(assembled, systemMd);
assert.equal(replaced, conductor + tail);
// Fail-safe: a missing kept section leaves the prompt untouched.
const broken = systemMd.replace("## Safety\n", "## Safety rules\n");
assert.equal(m.buildConductorPrompt(broken), undefined);
assert.equal(m.applyConductor(broken + tail, broken), undefined);

// Extension wiring with a fake PI.
const handlers = new Map(); const commands = new Map(); const entries = []; const notices = []; const statuses = [];
m.default({
  on: (name, fn) => handlers.set(name, fn),
  registerCommand: (name, def) => commands.set(name, def),
  appendEntry: (customType, data) => entries.push({ type: "custom", customType, data }),
});
const ctx = {
  sessionManager: { getBranch: () => entries },
  ui: { notify: (message, type) => notices.push({ message, type }), setStatus: (key, text) => statuses.push({ key, text }) },
};
const start = (customPrompt, systemPrompt) => handlers.get("before_agent_start")({ systemPrompt, systemPromptOptions: { customPrompt } }, ctx);

assert.equal(await start(systemMd, assembled), undefined, "standard by default");
await commands.get("orchestration").handler("conductor", ctx);
assert.equal(statuses.at(-1).text, "🎼 CONDUCTOR");
assert.deepEqual(await start(systemMd, assembled), { systemPrompt: conductor + tail });
// Conductor hands engineering to sub-PIs: implementation agents and device/build commands are blocked.
const call = (toolName, input) => handlers.get("tool_call")({ toolName, input }, ctx);
assert.match((await call("Agent", { subagent_type: "builder" })).reason, /dispatch it to the sub-PI/);
assert.equal((await call("Agent", { subagent_type: "app-validator" })).block, true);
assert.equal((await call("bash", { command: "cd android && ./gradlew assembleRelease" })).block, true);
assert.equal((await call("bash", { command: "/x/sdk/build-tools/36.0.0/aapt dump resources a.apk" })).block, true);
assert.equal((await call("bash", { command: "npx expo prebuild --clean" })).block, true);
assert.equal((await call("bash", { command: "export A=1; adb devices" })).block, true);
for (const [tool, input] of [["Agent", { subagent_type: "scout" }], ["Agent", { subagent_type: "validator" }], ["bash", { command: "gh pr merge 296 --merge" }], ["bash", { command: "orca orchestration check --run r --json" }], ["bash", { command: "git log --grep adb" }]])
  assert.equal(await call(tool, input), undefined, `${tool} ${JSON.stringify(input)} allowed`);
assert.match(conductor, /describe the campaign, not your hands/); assert.match(conductor, /drop it at once—no further tool call on it/);
assert.equal(await start("# Builder agent\n", "# Builder agent\n"), undefined, "subagent prompts are never replaced");
assert.equal(await start(broken, broken + tail), undefined, "fail-safe keeps standard");
assert.equal(notices.at(-1).type, "warning");
await commands.get("orchestration").handler("standard", ctx);
assert.equal(statuses.at(-1).text, undefined);
assert.equal(await start(systemMd, assembled), undefined, "back to standard");
assert.equal(await handlers.get("tool_call")({ toolName: "Agent", input: { subagent_type: "builder" } }, ctx), undefined, "standard mode never blocks");
await commands.get("orchestration").handler("bogus", ctx);
assert.match(notices.at(-1).message, /Uso: \/orchestration/);
assert.equal(m.readSessionMode([]), "standard", "new sessions start standard");

console.log(`orchestration-mode smoke: PASS (conductor prompt ${conductor.length} chars vs SYSTEM.md ${systemMd.length})`);
