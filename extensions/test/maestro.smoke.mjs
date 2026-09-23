import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const packageRoot = "/Users/j.henrique/npm-global/lib/node_modules/@earendil-works/pi-coding-agent";
const { createJiti } = await import(pathToFileURL(path.join(packageRoot, "node_modules/jiti/lib/jiti.mjs")).href);
const jiti = createJiti(import.meta.url, { moduleCache: false });
const m = await jiti.import(path.join(root, "extensions/maestro.ts"));

// Excerpt stays within budget and collapses whitespace.
assert.equal(m.promptExcerpt("  a \n b  "), "a b");
assert.ok(m.promptExcerpt("x".repeat(1000)).length <= m.STATE_MAX_CHARS);

// Offline TypeDec fake: one question per request, short mode, 413 retried once smaller.
const requests = [];
const reply = (status, body) => new Response(JSON.stringify(body), { status });
const fakeFetch = async (_url, init) => {
  const body = JSON.parse(init.body);
  requests.push({ body, auth: init.headers.Authorization });
  assert.equal(body.mode, "short");
  assert.deepEqual(Object.keys(body.questions), ["q"]);
  if (body.state.length > 80) return reply(413, {});
  const isModel = "opus" in body.questions.q.criteria;
  return reply(200, { answers: { q: { choice: isModel ? "opus" : "xhigh" } } });
};
const decision = await m.decide("depura por que a subconta Alpha não cobra ".repeat(10), "k", fakeFetch);
assert.deepEqual(decision, { model: "opus", effort: "xhigh" });
assert.equal(requests.length, 4, "each question retried once after 413");
assert.ok(requests.every((r) => r.auth === "Bearer k"));

// Unknown choice and HTTP errors degrade to undefined, never throw.
assert.deepEqual(await m.decide("oi", "k", async () => reply(200, { answers: { q: { choice: "gpt-9" } } })), { model: undefined, effort: undefined });
assert.deepEqual(await m.decide("oi", "k", async () => { throw new Error("net"); }), { model: undefined, effort: undefined });


// Adaptive effort: errors/repeats raise, 3 clean steps lower, floor = base-1, final answer inert.
const s = m.newAdaptState("medium");
const call = (n, a = {}) => ({ type: "toolCall", name: n, arguments: a });
const step = (calls, err = false) => m.stepSignal({ message: { content: calls }, toolResults: calls.map(() => ({ isError: err })) });
assert.equal(m.adaptEffort(s, step([call("bash", { c: "test" })], true)), "high", "tool error raises");
assert.equal(m.adaptEffort(s, step([call("bash", { c: "test" })])), "xhigh", "identical repeated call raises");
assert.equal(m.adaptEffort(s, step([call("read", { p: "a" })])), "xhigh");
assert.equal(m.adaptEffort(s, step([call("read", { p: "b" })])), "xhigh");
assert.equal(m.adaptEffort(s, step([call("read", { p: "c" })])), "high", "three clean steps lower one level");
for (const p of ["d", "e", "f", "g", "h", "i", "j", "k", "l"]) m.adaptEffort(s, step([call("read", { p })]));
assert.equal(s.current, "low", "floor is one level below base");
assert.equal(m.adaptEffort(s, step([])), "low", "final answer step changes nothing");
assert.equal(m.adaptEffort(m.newAdaptState("xhigh"), step([call("x")], true)), "xhigh", "capped at xhigh");

// Extension wiring: routes an interactive prompt, skips streaming/commands.
process.env.TYPEDEC_API_KEY = "k";
const handlers = {}; const commands = {}; const calls = [];
let thinking = "medium";
const pi = {
  on: (e, h) => { handlers[e] = h; },
  registerCommand: (n, c) => { commands[n] = c; },
  appendEntry: () => {},
  setModel: async (model) => { calls.push(["model", model.id]); return true; },
  setThinkingLevel: (l) => { thinking = l; calls.push(["thinking", l]); },
  getThinkingLevel: () => thinking,
};
m.default(pi);
const ctx = {
  ui: { notify: () => {}, setStatus: () => {} },
  sessionManager: { getBranch: () => [] },
  model: { provider: "openai-codex", id: "gpt-6-sol" },
  modelRegistry: { find: (p, id) => ({ provider: p, id }) },
};
const realFetch = globalThis.fetch;
globalThis.fetch = async (_u, init) => {
  const isModel = "luna" in JSON.parse(init.body).questions.q.criteria;
  return reply(200, { answers: { q: { choice: isModel ? "luna" : "low" } } });
};
try {
  await commands.maestro.handler("on", ctx);
  assert.deepEqual(await handlers.input({ text: "commit e push", source: "interactive" }, ctx), { action: "continue" });
  assert.deepEqual(calls, [["model", "gpt-6-luna"], ["thinking", "low"]]);
  calls.length = 0;
  await handlers.input({ text: "mais", source: "interactive", streamingBehavior: "steer" }, ctx);
  await handlers.input({ text: "/reload", source: "interactive" }, ctx);
  assert.deepEqual(calls, [], "no routing mid-run or for commands");
  // In-run: error step raises effort via setThinkingLevel; agent_end restores the prompt base.
  await handlers.input({ text: "commit e push", source: "interactive" }, ctx);
  calls.length = 0;
  await handlers.turn_end({ message: { content: [{ type: "toolCall", name: "bash", arguments: {} }] }, toolResults: [{ isError: true }] }, ctx);
  assert.deepEqual(calls, [["thinking", "medium"]]);
  await handlers.agent_end({}, ctx);
  assert.deepEqual(calls, [["thinking", "medium"], ["thinking", "low"]], "base restored at agent_end");
} finally {
  globalThis.fetch = realFetch;
}
console.log("maestro smoke: PASS");
