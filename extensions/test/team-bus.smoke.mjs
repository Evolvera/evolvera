import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePiSdkRoot } from "./lib/pi-sdk.mjs";

// STATEFUL RESOURCE PROOF: DISPOSABLE_VERIFIED. The team root is a fresh mkdtemp removed in finally; the two
// sessions are in-memory fake extension hosts in this process. No network, model, or PI process.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sdkRoot = resolvePiSdkRoot(import.meta.url);
const require = createRequire(import.meta.url);
const { createJiti } = require(path.join(sdkRoot, "node_modules/jiti/lib/jiti.cjs"));
const jiti = createJiti(import.meta.url, { fsCache: false, alias: { "@earendil-works/pi-coding-agent": path.join(sdkRoot, "dist/index.js"), typebox: require.resolve("typebox", { paths: [sdkRoot] }) } });
const m = await jiti.import(path.join(root, "extensions/team-bus.ts"));

assert.equal(m.teamFromEnv({}), undefined, "no team without env");
assert.equal(m.teamFromEnv({ PI_TEAM: "t", PI_TEAM_NAME: "../x" }), undefined, "names cannot escape the team folder");
assert.deepEqual(m.teamFromEnv({ PI_TEAM: "mkt", PI_TEAM_NAME: "lead", PI_TEAM_ROLE: "lead" }), { team: "mkt", name: "lead", role: "lead" });

function host() {
  const handlers = new Map(); const tools = new Map(); const sent = [];
  return { handlers, tools, sent, api: { on: (n, h) => handlers.set(n, h), registerTool: (t) => tools.set(t.name, t), sendMessage: (msg, opts) => sent.push({ msg, opts }) } };
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "team-bus-"));
try {
  const lead = host(); const back = host();
  m.default(lead.api, { PI_TEAM: "mkt", PI_TEAM_NAME: "lead", PI_TEAM_ROLE: "lead" }, tmp);
  m.default(back.api, { PI_TEAM: "mkt", PI_TEAM_NAME: "backend" }, tmp);
  const sub = host();
  m.default(sub.api, { PI_TEAM: "mkt", PI_TEAM_NAME: "backend" }, tmp);
  assert.equal(sub.tools.size, 0, "an in-process subagent with the same env does not join again");
  const dir = m.teamDir(tmp, "mkt");
  assert.deepEqual(m.listMembers(dir).map((x) => x.name).sort(), ["backend", "lead"]);
  assert.deepEqual(m.recipients("lead", "backend", m.listMembers(dir)), ["lead"]);
  assert.deepEqual(m.recipients("all", "lead", m.listMembers(dir)), ["backend"]);
  for (const bad of ["../x", "..", ".", "a/b", "a\\b", "C:x", ""]) {
    assert.deepEqual(m.recipients(bad, "lead", m.listMembers(dir)), [], `recipient ${JSON.stringify(bad)} is refused`);
    assert.throws(() => m.deliver(dir, { id: "e", from: "x", to: bad, text: "t", at: 1 }), /invalid team recipient/);
  }
  const escape = await back.tools.get("team_send").execute("e", { to: "../../outside", message: "oi" });
  assert.equal(escape.isError, true, "team_send refuses a path-like recipient");
  assert.equal(fs.existsSync(path.join(tmp, "outside")), false);
  assert.equal(m.teamFromEnv({ PI_TEAM: "..", PI_TEAM_NAME: "x" }), undefined);

  const r1 = await back.tools.get("team_send").execute("1", { to: "lead", message: "Contrato da API mudou: GET /chats agora pagina por cursor." });
  assert.match(r1.content[0].text, /Enviado para lead/);
  const r2 = await back.tools.get("team_send").execute("2", { to: "lead", message: "Contrato da API mudou: GET /chats agora pagina por cursor." });
  assert.match(r2.content[0].text, /não reenviada/, "duplicates within a minute are dropped");
  const big = await back.tools.get("team_send").execute("3", { to: "lead", message: "x".repeat(m.MAX_MESSAGE_CHARS + 500) });
  assert.match(big.content[0].text, /Enviado/);

  const got = m.drain(dir, "lead");
  assert.equal(got.length, 2);
  assert.equal(got[0].from, "backend");
  assert.equal(got[1].text.length, m.MAX_MESSAGE_CHARS, "messages are capped");
  assert.equal(m.drain(dir, "lead").length, 0, "drain removes what it read");
  assert.match(m.formatInbox(got), /não instruções do usuário/);

  // A member that settles after writing to the lead sends no idle notice; one that did not, does.
  await back.handlers.get("agent_settled")({ aborted: false });
  assert.equal(m.drain(dir, "lead").length, 0, "no idle notice after a message to the lead in the same run");
  await back.handlers.get("agent_start")({});
  await back.handlers.get("agent_settled")({ aborted: false });
  const idle = m.drain(dir, "lead");
  assert.equal(idle.length, 1);
  assert.match(idle[0].text, /backend ficou ocioso/);
  assert.match(idle[0].text, /git status --short/);

  const inboxCount = () => fs.readdirSync(path.join(dir, "inbox", "lead")).filter((f) => f.endsWith(".json")).length;
  const wait = () => new Promise((r) => setTimeout(r, 2_600));

  // Before the first run starts nothing is injected: PI rejects sendMessage while extensions load.
  m.deliver(dir, { id: "z", from: "backend", to: "lead", text: "Pronto e commitado em abc123.", at: Date.now() });
  await wait();
  assert.equal(lead.sent.length, 0, "no delivery before the first run");
  assert.equal(inboxCount(), 1, "message waits in the inbox");

  // Mail waiting when a run starts rides along with that run.
  const prompt = await lead.handlers.get("before_agent_start")({ systemPrompt: "base" });
  assert.match(prompt.systemPrompt, /## Team\n\nYou are `lead` \(lead\) in team `mkt`/);
  assert.equal(prompt.message.customType, "team-message");
  assert.match(prompt.message.content, /Pronto e commitado/);
  assert.equal(inboxCount(), 0);

  // While running, new mail steers the run; while idle, it starts a new turn.
  await lead.handlers.get("agent_start")({});
  m.deliver(dir, { id: "y", from: "backend", to: "lead", text: "Achei um bug no schema.", at: Date.now() });
  await wait();
  assert.deepEqual(lead.sent.at(-1).opts, { deliverAs: "steer" });
  assert.match(lead.sent.at(-1).msg.content, /bug no schema/);
  await lead.handlers.get("agent_settled")({ aborted: false });
  m.deliver(dir, { id: "x", from: "backend", to: "lead", text: "Revisão concluída.", at: Date.now() });
  await wait();
  assert.deepEqual(lead.sent.at(-1).opts, { deliverAs: "followUp", triggerTurn: true });

  // A failed injection puts the messages back for the next attempt.
  const realSend = lead.api.sendMessage;
  lead.api.sendMessage = () => { throw new Error("not initialized"); };
  m.deliver(dir, { id: "w", from: "backend", to: "lead", text: "Mensagem que não pode se perder.", at: Date.now() });
  await wait();
  assert.equal(inboxCount(), 1, "a failed injection puts the message back");
  lead.api.sendMessage = realSend;
  await wait();
  assert.match(lead.sent.at(-1).msg.content, /não pode se perder/);
  assert.equal(inboxCount(), 0);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
// A heartbeat that cannot be written (locked or missing folder) must not throw out of the timer.
{
  const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), "team-bus-hb-"));
  const h = host();
  m.default(h.api, { PI_TEAM: "hb", PI_TEAM_NAME: "solo" }, tmp2);
  fs.rmSync(path.join(m.teamDir(tmp2, "hb"), "members"), { recursive: true, force: true });
  await new Promise((r) => setTimeout(r, 2_600)); // one poll tick with the members folder gone
  fs.rmSync(tmp2, { recursive: true, force: true });
}
// team_start validates before touching git or spawning anything.
{
  const tmp3 = fs.mkdtempSync(path.join(os.tmpdir(), "team-bus-start-"));
  const solo = host();
  m.default(solo.api, {}, tmp3);
  for (const bad of ["lead", "../x", "a/b", ""]) {
    const r = await solo.tools.get("team_start").execute("s", { name: bad, task: "t" });
    assert.equal(r.isError, true, `child name ${JSON.stringify(bad)} is refused`);
  }
  const declined = await solo.tools.get("team_start").execute("s", { name: "docs", task: "t" }, undefined, undefined, { hasUI: true, ui: { confirm: async () => false } });
  assert.match(declined.content[0].text, /não autorizou/, "the user can refuse child sessions");
  assert.equal(fs.existsSync(path.join(tmp3, "teams")), false, "nothing is created when refused");
  // Two parallel team_start calls share one question; a refusal refuses both.
  let asked = 0;
  const slowNo = { hasUI: true, ui: { confirm: () => { asked++; return new Promise((resolve) => setTimeout(() => resolve(false), 20)); } } };
  const pair = await Promise.all(["front", "back"].map((name) => solo.tools.get("team_start").execute("s", { name, task: "t" }, undefined, undefined, slowNo)));
  assert.equal(asked, 1, "parallel calls ask once");
  assert.ok(pair.every((r) => /não autorizou/.test(r.content[0].text)), "one refusal covers both");
  const empty = await solo.tools.get("team_start").execute("s", { name: "docs", task: "  " });
  assert.equal(empty.isError, true, "a child needs a task");
  const notInTeam = await solo.tools.get("team_send").execute("s", { to: "lead", message: "oi" });
  assert.match(notInTeam.content[0].text, /team_start/, "team_send outside a team points to team_start");
  const wt = m.childWorktree(path.join(tmp3, "repo"), "docs");
  assert.equal(wt.branch, "team/docs");
  assert.equal(wt.dir, path.join(`${path.join(tmp3, "repo")}-team`, "docs"), "child worktree is a sibling of the repository");
  fs.rmSync(tmp3, { recursive: true, force: true });
}
console.log("team-bus smoke: PASS");
process.exit(0);
