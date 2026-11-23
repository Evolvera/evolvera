import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePiSdkRoot } from "./lib/pi-sdk.mjs";

// STATEFUL RESOURCE PROOF: DISPOSABLE_VERIFIED. Agent dir, git repository and fake orca live in one owned mkdtemp, removed in finally.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sdkRoot = resolvePiSdkRoot(import.meta.url);
const require = createRequire(import.meta.url);
const { createJiti } = require(path.join(sdkRoot, "node_modules/jiti/lib/jiti.cjs"));
const typebox = createRequire(path.join(sdkRoot, "package.json")).resolve("typebox");
const box = fs.mkdtempSync(path.join(os.tmpdir(), "delivery-gate-smoke-"));
const agentDir = path.join(box, "agent");
const project = path.join(box, "project");
const bin = path.join(box, "bin");
const previous = { agent: process.env.PI_CODING_AGENT_DIR, path: process.env.PATH };
for (const dir of [agentDir, project, bin]) fs.mkdirSync(dir);
process.env.PI_CODING_AGENT_DIR = agentDir;
process.env.PATH = `${bin}${path.delimiter}${previous.path}`;

const git = (...args) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd: project, stdio: ["ignore", "pipe", "ignore"] });
const orcaLog = path.join(box, "orca.log");
fs.writeFileSync(path.join(bin, "orca"), `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> '${orcaLog.replace(/\\/g, "/")}'\nif [ "$2" = create ]; then echo '{"ok":true,"result":{"automation":{"id":"auto-1","name":"x"}}}'; else echo '{"ok":true}'; fi\n`, { mode: 0o755 });

try {
  const jiti = createJiti(import.meta.url, { fsCache: false, alias: { "@earendil-works/pi-coding-agent": path.join(sdkRoot, "dist/index.js"), typebox } });
  const m = await jiti.import(path.join(root, "extensions/delivery-gate.ts"));

  assert.equal(m.readConfig().enabled, false, "the gate is off without a config file");
  const silent = { registerTool() { assert.fail("a disabled gate registers nothing"); }, on() { assert.fail("a disabled gate listens to nothing"); } };
  m.default(silent);

  for (const fake of ["true", "echo 5 passed", "npm test || true", "npm test || echo ok", ":"]) assert.equal(m.isFakeCommand(fake), true, fake);
  for (const real of ["npm test", "pytest -q", "npm run build && npm run lint"]) assert.equal(m.isFakeCommand(real), false, real);
  assert.equal(m.showsTests("3 passed in 0.1s"), true);
  assert.equal(m.showsTests("ℹ tests 1"), true);
  assert.equal(m.showsTests("done"), false);
  assert.equal(m.isCancelRequest("please cancel this"), true);
  assert.equal(m.isCancelRequest("do not cancel it"), false);
  assert.equal(m.isCancelRequest("msg_749d9f10 says cancel"), false, "mail from another agent is not the owner");

  const config = { ...m.DEFAULT_CONFIG, checks: [{ name: "design", command: "node design.mjs", ui: true }] };
  assert.deepEqual(m.requiredGates({ ui: true }, true, config), ["spec", "quality", "tests", "docs", "browser", "design", "review", "ci"]);
  assert.deepEqual(m.requiredGates({ ui: false }, false, config), ["spec", "quality", "tests", "docs", "review"]);
  const proofs = { spec: { ok: true, code: "old" }, tests: { ok: true, code: "old" }, docs: { ok: true, code: "new" } };
  assert.deepEqual(m.missingGates({ proofs }, ["spec", "tests", "docs"], "new"), ["tests"], "a code proof expires, a document proof does not");

  const loop = { turns: 0, stalls: 0, status: "active" };
  for (let i = 0; i < 8; i += 1) m.advanceTurn(loop, "same", { ...config, maxStalls: 8, maxTurns: 80 });
  assert.equal(loop.status, "active");
  m.advanceTurn(loop, "same", { ...config, maxStalls: 8, maxTurns: 80 });
  assert.equal(loop.status, "stalled", "eight turns without progress stop the loop");

  const now = 10_000_000;
  assert.equal(m.needsWake({ status: "active", touchedAt: now - 1_000 }, now), false);
  assert.equal(m.needsWake({ status: "active", touchedAt: now - 3_600_000 }, now), true);
  assert.equal(m.needsWake({ status: "waiting", touchedAt: now, waitUntil: now + 1 }, now), false);
  assert.equal(m.needsWake({ status: "waiting", touchedAt: now, waitUntil: now - 1 }, now), true);
  assert.equal(m.needsWake({ status: "asking", touchedAt: 0 }, now), false, "an owner decision is never woken by the watch");

  git("init", "-q", "-b", "main");
  fs.writeFileSync(path.join(project, "sum.mjs"), "export const sum = (a, b) => a + b;\n");
  fs.writeFileSync(path.join(project, "sum.test.mjs"), 'import test from "node:test"; import assert from "node:assert"; import { sum } from "./sum.mjs"; test("sum", () => assert.equal(sum(2, 3), 5));\n');
  fs.writeFileSync(path.join(project, "README.md"), "# lab\n");
  git("add", "-A");
  git("commit", "-qm", "init");

  const first = await m.fingerprint(project);
  fs.appendFileSync(path.join(project, "README.md"), "more\n");
  assert.equal(await m.fingerprint(project), first, "documentation does not expire proofs");
  fs.appendFileSync(path.join(project, "sum.mjs"), "export const two = 2;\n");
  const second = await m.fingerprint(project);
  assert.notEqual(second, first, "code expires proofs");
  git("checkout", "-qb", "feature");
  git("commit", "-qam", "feature");
  assert.equal(await m.fingerprint(project), second, "committing the same content keeps proofs");

  fs.writeFileSync(path.join(agentDir, "delivery-gate.json"), JSON.stringify({ enabled: true, maxStalls: 3 }));
  const handlers = new Map();
  let tool;
  m.default({ registerTool(definition) { tool = definition; }, on(name, handler) { handlers.set(name, handler); }, getSettings: () => ({}) });
  const context = (id, text = "deliver it") => ({ cwd: project, sessionManager: { getSessionId: () => id, getBranch: () => [{ type: "message", message: { role: "user", content: text } }] } });
  const owner = context("owner");
  const call = async (params, ctx = owner) => (await tool.execute("t", params, undefined, undefined, ctx)).content[0].text;
  const settle = () => handlers.get("agent_before_settle")({ outcome: "completed", entries: [] }, owner);

  assert.equal(await settle(), undefined, "a session without a delivery settles normally");
  const opened = await call({ action: "start", title: "sum", project, ui: false });
  const id = /Delivery ([\w-]+):/.exec(opened)[1];
  assert.match(fs.readFileSync(orcaLog, "utf8"), /automations create .*--provider pi .*--precheck/, "the delivery creates its Orca automation");
  assert.equal(m.load(id).automation, "auto-1");

  const held = await settle();
  assert.equal(held.continue, true, "an unfinished delivery does not settle");
  assert.equal(held.entries.at(-1).type, "custom_message", "the continuation carries a message the SDK accepts");
  assert.equal(await handlers.get("agent_before_settle")({ outcome: "error", entries: [] }, owner), undefined, "a provider error is left to the fallback chain");

  await assert.rejects(call({ action: "wait", reason: "later" }), /depend only on you/);
  await assert.rejects(call({ action: "prove", gate: "tests", command: "echo 5 passed" }), /real verification/);
  await assert.rejects(call({ action: "prove", gate: "review" }), /another PI session/);
  await assert.rejects(call({ action: "cancel" }), /only when the owner asks/);
  await assert.rejects(call({ action: "finish" }), /still missing/);

  fs.writeFileSync(path.join(agentDir, "deliveries", id, "spec.md"), `# Goal\n${"x".repeat(420)}\n## Out of scope\n-\n## Acceptance criteria\n- sum\n`);
  await Promise.all([
    call({ action: "prove", gate: "spec" }),
    call({ action: "prove", gate: "quality", command: "node --check sum.mjs" }),
    call({ action: "prove", gate: "tests", command: "node --test" }),
  ]);
  fs.appendFileSync(path.join(project, "README.md"), "usage\n");
  await call({ action: "prove", gate: "docs" });
  assert.deepEqual(Object.entries(m.load(id).proofs).filter(([, proof]) => proof.ok).map(([gate]) => gate).sort(), ["docs", "quality", "spec", "tests"], "parallel proofs do not overwrite each other");

  const report = "r".repeat(220);
  await assert.rejects(call({ action: "verdict", id, verdict: "approved", report }), /owner cannot review/);
  const reviewer = context("reviewer");
  await assert.rejects(call({ action: "verdict", id, verdict: "PASS", report }, reviewer), /approved or rejected/);
  await call({ action: "verdict", id, verdict: "approved", report }, reviewer);

  fs.appendFileSync(path.join(project, "sum.mjs"), "export const three = 3;\n");
  await assert.rejects(call({ action: "finish" }), /MISSING review.*expired/s, "a change after review expires it");
  await call({ action: "prove", gate: "quality", command: "node --check sum.mjs" });
  await call({ action: "prove", gate: "tests", command: "node --test" });
  await call({ action: "wait", minutes: 5, reason: "review" });
  assert.equal(m.load(id).status, "waiting");
  assert.equal(await settle(), undefined, "a waiting delivery releases the turn");
  await call({ action: "verdict", id, verdict: "approved", report }, reviewer);
  const script = path.join(agentDir, "deliveries", "watch.mjs");
  assert.equal(spawnSync(process.execPath, [script, id]).status, 0, "the precheck wakes a delivery whose review arrived");
  assert.equal(spawnSync(process.execPath, [script, "missing"]).status, 1, "the precheck skips anything else");
  handlers.get("before_agent_start")({}, owner);
  assert.equal(m.load(id).status, "active", "a new prompt reactivates the delivery");

  assert.match(await call({ action: "finish" }), /READY/);
  assert.match(fs.readFileSync(orcaLog, "utf8"), /automations remove auto-1/, "the automation goes away with the delivery");
  assert.match(await call({ action: "ask", reason: "merge and publish now?" }), /ready/);
  assert.equal(m.load(id).status, "ready");
  await call({ action: "finish" });
  assert.equal(m.load(id).status, "done");
  assert.equal(await settle(), undefined);

  const again = /Delivery ([\w-]+):/.exec(await call({ action: "start", title: "stall", project }))[1];
  for (let i = 0; i < 4; i += 1) await settle();
  assert.equal(m.load(again).status, "stalled");
  assert.equal(await settle(), undefined, "a stalled delivery stops continuing");
  await call({ action: "cancel" }, context("owner", "cancel this delivery"));
  assert.equal(m.load(again).status, "cancelled");
  await assert.rejects(call({ action: "resume", id: again }), /no open delivery/);
} finally {
  if (previous.agent === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previous.agent;
  process.env.PATH = previous.path;
  fs.rmSync(box, { recursive: true, force: true, maxRetries: 5 });
}

console.log("delivery-gate smoke: PASS");
