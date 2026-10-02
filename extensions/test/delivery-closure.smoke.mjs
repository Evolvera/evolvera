import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePiSdkRoot } from "./lib/pi-sdk.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);
const { createJiti } = require(path.join(resolvePiSdkRoot(import.meta.url), "node_modules/jiti/lib/jiti.cjs"));
const jiti = createJiti(import.meta.url, { fsCache: false });
const extension = await jiti.import(path.join(root, "extensions/delivery-closure.ts"));

function fixture({ primary = true, mode = "tui", stopReason = "stop", toolCall = false, pending = false, idle = true, running = false, env = {}, assistantTail = [], todos = [] } = {}) {
  const handlers = new Map(); const sends = []; const judgments = [];
  let hasPending = pending;
  const assistantContent = [{ type: "text", text: "I finished part; next I will complete the remaining implementation." }, ...(toolCall ? [{ type: "toolCall", name: "bash" }] : [])];
  const branch = [
    { type: "message", message: { role: "user", content: [{ type: "text", text: "Please implement the feature." }] } },
    { type: "message", message: { role: "assistant", content: assistantContent, stopReason } },
    ...assistantTail,
    ...(todos.length ? [{ type: "message", message: { role: "toolResult", toolName: "todo", details: { action: "list", tasks: todos, nextId: todos.length + 1 } } }] : []),
  ];
  const pi = {
    on: (name, handler) => handlers.set(name, handler),
    sendMessage: async (message, options) => sends.push({ message, options }),
  };
  const ctx = {
    mode,
    isIdle: () => idle,
    hasPendingMessages: () => hasPending,
    modelRegistry: {
      find: (provider, model) => ({ provider, model }),
      getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "fake", headers: {} }),
    },
    sessionManager: { getBranch: () => branch },
  };
  const completeSimple = async (_model, request, options) => {
    judgments.push({ request, options });
    return { content: [{ type: "text", text: '{"verdict":"continue","work":"Finish the requested implementation."}' }] };
  };
  extension.registerDeliveryClosure(pi, { completeSimple, manager: { hasRunning: () => running }, env });
  return {
    handlers, pi, ctx, sends, judgments, branch,
    start: async (isPrimary = primary) => handlers.get("before_agent_start")({ systemPromptOptions: { customPrompt: isPrimary ? "# PI Coding Agent\nbase" : "# Specialist" } }, ctx),
    input: async (source = "interactive", text = "Please implement the feature.") => handlers.get("input")({ source, text }, ctx),
    settle: async () => handlers.get("agent_settled")({}, ctx),
    pending: (value) => { hasPending = value; },
  };
}

{
  const f = fixture(); await f.start(); await f.input(); await f.settle();
  assert.equal(f.sends.length, 1);
  assert.deepEqual(f.sends[0].options, { triggerTurn: true, deliverAs: "followUp" });
  assert.equal(f.sends[0].message.customType, "delivery-closure-check");
  assert.equal(f.sends[0].message.details.work, "Finish the requested implementation.");
  assert.equal(f.judgments.length, 1);
  await f.settle(); assert.equal(f.judgments.length, 1); assert.equal(f.sends.length, 1, "one judge and nudge per user message");
  await f.input("extension", "injected continuation"); await f.settle(); assert.equal(f.judgments.length, 1, "extension input does not reset budget");
  await f.input("interactive", "new request"); await f.settle(); assert.equal(f.judgments.length, 2, "real user input resets budget");
}
for (const [name, options] of [
  ["non-primary", { primary: false }], ["non-TUI", { mode: "print" }],
  ["aborted", { stopReason: "aborted" }], ["error", { stopReason: "error" }],
  ["tool call", { toolCall: true }], ["pending", { pending: true }], ["not idle", { idle: false }],
  ["running manager", { running: true }], ["disabled", { env: { PI_DELIVERY_CHECK: "off" } }],
]) {
  const f = fixture(options); await f.start(); await f.input(); await f.settle();
  assert.equal(f.judgments.length, 0, `${name} skips judging`); assert.equal(f.sends.length, 0, `${name} sends nothing`);
}
for (const answer of [
  '{"verdict":"complete","work":"done"}', '{"verdict":"needs_user","work":"ask"}',
  '{"verdict":"blocked","work":"waiting"}', "garbage",
]) {
  const f = fixture({ completeSimple: undefined });
  // Re-register with a deterministic alternate judge response.
  f.handlers.clear();
  extension.registerDeliveryClosure(f.pi, { manager: { hasRunning: () => false }, env: {}, completeSimple: async () => ({ content: [{ type: "text", text: answer }] }) });
  await f.start(); await f.input(); await f.settle(); assert.equal(f.sends.length, 0, answer);
}
{
  const f = fixture();
  extension.registerDeliveryClosure(f.pi, { manager: { hasRunning: () => false }, env: {}, completeSimple: async () => { throw new Error("offline"); } });
  await f.start(); await f.input(); await f.settle(); assert.equal(f.sends.length, 0, "thrown judge error fails closed");
}
{
  const f = fixture({ assistantTail: [{ type: "compaction", summary: "compacted" }] }); await f.start(); await f.input(); await f.settle();
  assert.equal(f.judgments.length, 1, "compaction entry after assistant is ignored");
}
{
  const f = fixture();
  extension.registerDeliveryClosure(f.pi, { manager: { hasRunning: () => false }, env: {}, completeSimple: async () => {
    f.pending(true); return { content: [{ type: "text", text: '{"verdict":"continue","work":"Finish it."}' }] };
  } });
  await f.start(); await f.input(); await f.settle(); assert.equal(f.sends.length, 0, "user input during judging suppresses send");
}
{
  const todos = [
    { id: 1, subject: "open", status: "pending", description: "unfinished task" },
    { id: 2, subject: "working", status: "in_progress", description: "in progress" },
    { id: 3, subject: "done", status: "completed", description: "should not be included" },
  ];
  const f = fixture({ todos }); await f.start(); await f.input("interactive", "implement the requested change"); await f.settle();
  const data = f.judgments[0].request.messages[0].content[0].text;
  assert.match(data, /implement the requested change/); assert.match(data, /last reply stopped|remaining implementation/i);
  assert.match(data, /unfinished task/); assert.doesNotMatch(data, /should not be included/);
  assert.equal(f.judgments[0].options.reasoning, "minimal"); assert.equal(f.judgments[0].options.maxTokens, 300);
}
{
  const f = fixture(); await f.start(); await f.input();
  await f.handlers.get("session_tree")({}, f.ctx); await f.settle(); assert.equal(f.judgments.length, 0, "session tree resets budget unavailable");
}
{
  // Incident shape: latest request delivered, earlier authorized work pending only in the compacted state.
  const summary = "## Goal\n- ship\n## Progress\n### Done\n- [x] OLD-DONE\n### In Progress\n- [ ] EMAIL-CARD repair and re-review\n### Blocked\n- PROD-MIGRATION awaits approval\n## Key Decisions\n- KEY-DECISION\n## Next Steps\n1. RE-REVIEW email card\n## Critical Context\n- CRITICAL-PATH";
  const f = fixture({ assistantTail: [{ type: "compaction", summary }] }); await f.start();
  await f.input("interactive", "add the email card"); await f.input("interactive", "Please implement the feature."); await f.settle();
  const data = f.judgments[0].request.messages[0].content[0].text;
  assert.match(data, /EARLIER USER REQUESTS[^]*add the email card[^]*COMPACTED SESSION STATE/, "earlier request is context");
  assert.equal(data.split("Please implement the feature.").length - 1, 1, "current request is not duplicated");
  for (const kept of ["EMAIL-CARD", "PROD-MIGRATION", "RE-REVIEW"]) assert.match(data, new RegExp(kept));
  for (const dropped of ["OLD-DONE", "KEY-DECISION", "CRITICAL-PATH"]) assert.doesNotMatch(data, new RegExp(dropped));
  assert.equal(extension.compactedPendingState([]), "");
}
assert.equal(extension.parseDeliveryDecision('{"verdict":"wat","work":"x"}'), undefined);
console.log("delivery-closure smoke: PASS");
