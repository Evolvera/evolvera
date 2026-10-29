import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePiSdkRoot } from "./lib/pi-sdk.mjs";

// STATEFUL RESOURCE PROOF: NO_STATEFUL_RESOURCES. In-memory fake extension host and session branch only.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sdkRoot = resolvePiSdkRoot(import.meta.url);
const require = createRequire(import.meta.url);
const { createJiti } = require(path.join(sdkRoot, "node_modules/jiti/lib/jiti.cjs"));
const jiti = createJiti(import.meta.url, { fsCache: false, alias: { "@earendil-works/pi-coding-agent": path.join(sdkRoot, "dist/index.js") } });
const m = await jiti.import(path.join(root, "extensions/autopilot.ts"));

const todo = (tasks) => ({ type: "message", message: { role: "toolResult", toolName: "todo", details: { tasks, nextId: tasks.length + 1 } } });
const reply = (text, tools = []) => ({ type: "message", message: { role: "assistant", content: [{ type: "text", text }, ...tools.map((name) => ({ type: "toolCall", name }))] } });
const goal = (status) => ({ type: "custom", customType: "goal-state", data: { goal: { status } } });

assert.deepEqual(m.openTodos([todo([{ id: 1, subject: "a", status: "completed" }, { id: 2, subject: "b", status: "in_progress" }])]).map((t) => t.id), [2]);
assert.deepEqual(m.openTodos([todo([{ id: 1, status: "pending" }]), todo([{ id: 1, status: "completed" }])]), [], "the latest list wins");
assert.equal(m.goalActive([goal("active")]), true);
assert.equal(m.goalActive([goal("active"), goal("complete")]), false);
assert.equal(m.endsWithQuestion("Posso apagar a tabela?"), true);
assert.equal(m.endsWithQuestion("Feito. Próximo passo: testes."), false);

function host(entries) {
  const handlers = new Map(); const sent = [];
  m.default({ on: (n, h) => handlers.set(n, h), sendMessage: (msg, opts) => sent.push({ msg, opts }) }, {});
  const ctx = { sessionManager: { getBranch: () => entries } };
  const primary = { systemPromptOptions: { customPrompt: "# PI Coding Agent\n..." } };
  return { handlers, sent, ctx, primary };
}

// Open items and a plain final reply: one follow-up per settle, capped per user request.
{
  const entries = [todo([{ id: 1, subject: "Tela de login", status: "completed" }, { id: 2, subject: "Testes do login", status: "pending" }]), reply("Fiz a tela. Próximos passos: testes.")];
  const h = host(entries);
  await h.handlers.get("before_agent_start")(h.primary);
  for (let i = 0; i < m.MAX_NUDGES + 2; i++) await h.handlers.get("agent_settled")({ aborted: false }, h.ctx);
  assert.equal(h.sent.length, m.MAX_NUDGES, "capped per request");
  assert.match(h.sent[0].msg.content, /Testes do login/);
  assert.doesNotMatch(h.sent[0].msg.content, /Tela de login/, "only open items are named");
  assert.deepEqual(h.sent[0].opts, { deliverAs: "followUp", triggerTurn: true });
  await h.handlers.get("input")({ source: "interactive", text: "continua" });
  await h.handlers.get("agent_settled")({ aborted: false }, h.ctx);
  assert.equal(h.sent.length, m.MAX_NUDGES + 1, "a new user message resets the budget");
}
// Cases that must stay quiet.
for (const [name, entries, event] of [
  ["all done", [todo([{ id: 1, status: "completed" }]), reply("Pronto.")], { aborted: false }],
  ["question to the user", [todo([{ id: 1, status: "pending" }]), reply("Posso rodar a migração em produção?")], { aborted: false }],
  ["declared block", [todo([{ id: 1, status: "pending" }]), reply("Bloqueado.", ["goal_blocked"])], { aborted: false }],
  ["active goal", [goal("active"), todo([{ id: 1, status: "pending" }]), reply("Seguindo.")], { aborted: false }],
  ["user aborted", [todo([{ id: 1, status: "pending" }]), reply("Parcial.")], { aborted: true }],
]) {
  const h = host(entries);
  await h.handlers.get("before_agent_start")(h.primary);
  await h.handlers.get("agent_settled")(event, h.ctx);
  assert.equal(h.sent.length, 0, name);
}
// Subagent sessions are never nudged; PI_AUTOPILOT=off disables it.
{
  const h = host([todo([{ id: 1, status: "pending" }]), reply("Parcial.")]);
  await h.handlers.get("before_agent_start")({ systemPromptOptions: { customPrompt: "You are a builder" } });
  await h.handlers.get("agent_settled")({ aborted: false }, h.ctx);
  assert.equal(h.sent.length, 0, "subagent");
  const handlers = new Map();
  m.default({ on: (n, f) => handlers.set(n, f), sendMessage: () => {} }, { PI_AUTOPILOT: "off" });
  assert.equal(handlers.size, 0, "off");
}
console.log("autopilot smoke: PASS");
