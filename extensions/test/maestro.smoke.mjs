import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const packageRoot = "/Users/j.henrique/npm-global/lib/node_modules/@earendil-works/pi-coding-agent";
const { createJiti } = await import(pathToFileURL(path.join(packageRoot, "node_modules/jiti/lib/jiti.mjs")).href);
const m = await createJiti(import.meta.url, { moduleCache: false }).import(path.join(root, "extensions/maestro.ts"));
const reply = (status, body) => new Response(JSON.stringify(body), { status });

// 1. State cut and tier pick (argmax over probabilities, choice as fallback).
assert.equal(m.cutState("a  \n b"), "a b");
assert.equal(Array.from(m.cutState("x".repeat(2000))).length, m.STATE_MAX_CHARS);
assert.deepEqual(m.pickRoute({ choice: "chore", probabilities: { chore: 0.3, debug_unknown: 0.6 } }), { model: "opus", effort: "xhigh", category: "debug_unknown" });
assert.deepEqual(m.pickRoute({ choice: "code_feature" }), { model: "sol", effort: "medium", category: "code_feature" });
assert.deepEqual(m.pickRoute({ choice: "duvida" }), { model: "opus", effort: "high", category: "duvida" }, "doubt -> Opus high");
assert.equal(m.pickRoute({ choice: "gpt-9" }), undefined);
for (const [name, c] of Object.entries(m.CATEGORIES)) {
  assert.ok(["luna", "sol", "opus"].includes(c.model), name);
  if (c.model === "luna") assert.notEqual(c.effort, "low", "Luna never starts at low");
}
assert.equal(m.CATEGORIES.writing.model, "opus");
assert.equal(m.CATEGORIES.business.model, "opus");

// 2. One Jev request per message with the route question; retries only transient failures.
const seen = [];
const ok = (tier) => async (url, init) => {
  seen.push({ url, body: JSON.parse(init.body), auth: init.headers.Authorization });
  return reply(200, { answers: { q: { choice: tier } } });
};
assert.equal((await m.classify("commit e push", "k", ok("chore"))).model, "luna");
assert.equal(seen.length, 1);
assert.match(seen[0].url, /\/systemone$/);
assert.equal(seen[0].auth, "Bearer k");
assert.deepEqual(Object.keys(seen[0].body.questions), ["q", "f"], "route + frustration in one request");
assert.deepEqual(Object.keys(seen[0].body.questions.q.criteria), Object.keys(m.CATEGORIES));
const angry = (noul) => async () => reply(200, { answers: { q: { choice: "chore" }, f: { noul } } });
assert.deepEqual(await m.classify("porra quebrou tudo de novo", "k", angry(0.94)), { model: "astra", effort: "high", category: "frustrado" });
assert.equal((await m.classify("URGENTE o site caiu", "k", angry(0.87))).model, "luna", "below threshold keeps the category");
const fast = { retries: 3, backoffMs: [1, 1, 1], deadlineMs: 5_000 };
const scripted = (statuses) => {
  let i = 0;
  const f = async () => {
    const s = statuses[i++]; f.n = i;
    if (s === "throw") throw new Error("net");
    return s === 200 ? reply(200, { answers: { q: { choice: "fix_known" } } }) : reply(s, {});
  };
  return f;
};
let f = scripted([503, "throw", 429, 200]);
assert.equal((await m.classify("oi", "k", f, fast)).model, "sol");
assert.equal(f.n, 4);
f = scripted([500, 502, 503, 504, 200]);
assert.equal(await m.classify("oi", "k", f, fast), undefined);
assert.equal(f.n, 4, "gives up after 3 retries");
for (const code of [400, 401, 403, 422]) {
  f = scripted([code, 200]);
  assert.equal(await m.classify("oi", "k", f, fast), undefined);
  assert.equal(f.n, 1, `${code} not retried`);
}

// 2b. Luna fallback: parse, frustration first, injected completer.
assert.equal(m.parseLunaRoute('{"tier":"sol","frustrated":false}'), "sol");
assert.equal(m.parseLunaRoute('ok ```{"tier":"luna","frustrated":true}```'), "astra");
assert.equal(m.parseLunaRoute('{"tier":"gpt-9"}'), undefined);
assert.equal(m.parseLunaRoute("not json"), undefined);
const lunaCtx = { modelRegistry: { find: (p, id) => ({ provider: p, id }), getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "x" }) } };
let lunaCall;
assert.equal(await m.classifyWithLuna("o site caiu", lunaCtx, async (model, context, options) => {
  lunaCall = { model, context, options }; return { content: [{ type: "text", text: '{"tier":"opus","frustrated":false}' }] };
}).then((r) => r.model), "opus");
assert.equal(lunaCall.model.id, "gpt-6-luna");
assert.equal(lunaCall.options.reasoning, "minimal");
assert.equal(await m.classifyWithLuna("x", { modelRegistry: { find: () => undefined } }, async () => ({})), undefined);
assert.equal(await m.classifyWithLuna("x", lunaCtx, async () => { throw new Error("down"); }), undefined);

// 2c. Context: last assistant text, tail-truncated, labeled apart from the user message.
const branch = [
  { type: "message", message: { role: "assistant", content: [{ type: "text", text: "old" }] } },
  { type: "message", message: { role: "user", content: "x" } },
  { type: "message", message: { role: "assistant", content: [{ type: "toolCall" }, { type: "text", text: "Achei a causa. Quer que eu aplique o fix?" }] } },
];
assert.equal(m.lastAssistantText(branch), "Achei a causa. Quer que eu aplique o fix?");
assert.equal(m.lastAssistantText([]), "");
const st = m.buildState("sim faz", "a".repeat(1000) + " Quer que eu aplique?");
assert.ok(st.startsWith("PREVIOUS: …") && st.includes("Quer que eu aplique?") && st.endsWith("USER: sim faz"));
assert.equal(m.buildState("oi"), "PREVIOUS: (none)\nUSER: oi");
await m.classify("sim faz", "k", ok("apply_plan"), undefined, "Quer que eu aplique?");
assert.match(seen.at(-1).body.state, /^PREVIOUS: Quer que eu aplique\?\nUSER: sim faz$/);

// 3. Continuation detection; the benchmark fixture is present and complete.
const bench = JSON.parse(readFileSync(path.join(root, "extensions/test/fixtures/maestro-benchmark.json"), "utf8"));
assert.equal(Object.values(bench.sets).flat().length, 531);
for (const text of ["continua", "ok pode fazer", "yep go ahead", "tenta de novo ai"]) assert.equal(m.isContinuation(text), true, text);
for (const text of ["ok, agora faz o mesmo pro endpoint de produtos", "blz agora commita", "tenta de novo mas descobre pq falha"]) {
  assert.equal(m.isContinuation(text), false, text);
}

// 4. Adaptive effort.
const s = m.newAdaptState("medium");
const call = (n, a = {}) => ({ type: "toolCall", name: n, arguments: a });
const step = (calls, err = false) => m.stepSignal({ message: { content: calls }, toolResults: calls.map(() => ({ isError: err })) });
assert.equal(m.adaptEffort(s, step([call("bash", { c: "t" })], true)), "high");
assert.equal(m.adaptEffort(s, step([call("bash", { c: "t" })])), "xhigh", "repeat raises");
for (const p of ["a", "b"]) m.adaptEffort(s, step([call("read", { p })]));
assert.equal(m.adaptEffort(s, step([call("read", { p: "c" })])), "high", "three clean steps lower");
for (const p of "defghijkl") m.adaptEffort(s, step([call("read", { p })]));
assert.equal(s.current, "low", "floor one below base");

// 5. Wiring: Jev choice sets model + mapped effort; continuation/steer/commands untouched; base restored.
delete process.env.JEV_API_KEY;
delete process.env.TYPESAFE_API_KEY;
assert.equal(m.readApiKey("/nonexistent"), undefined);
process.env.JEV_API_KEY = "k";
const handlers = {}, commands = {}, calls = [];
let thinking = "low";
m.default({
  on: (e, h) => { handlers[e] = h; },
  registerCommand: (n, c) => { commands[n] = c; },
  appendEntry: () => {},
  setModel: async (model) => { calls.push(["model", model.id]); return true; },
  setThinkingLevel: (l) => { thinking = l; calls.push(["thinking", l]); },
  getThinkingLevel: () => thinking,
});
const ctx = {
  ui: { notify: () => {}, setStatus: () => {} },
  sessionManager: { getBranch: () => [] },
  model: { provider: "openai-codex", id: "gpt-6-sol" },
  modelRegistry: { find: (p, id) => ({ provider: p, id }) },
};
const realFetch = globalThis.fetch;
try {
  globalThis.fetch = ok("chore");
  await commands.maestro.handler("on", ctx);
  await handlers.input({ text: "commit e push", source: "interactive" }, ctx);
  assert.deepEqual(calls, [["model", "gpt-6-luna"], ["thinking", "medium"]], "Luna starts at medium");
  globalThis.fetch = ok("debug_unknown");
  calls.length = 0;
  await handlers.input({ text: "o site caiu", source: "interactive" }, ctx);
  assert.deepEqual(calls, [["model", "claude-opus-5-5"], ["thinking", "xhigh"]], "debug -> Opus xhigh");
  globalThis.fetch = angry(0.98);
  calls.length = 0;
  await handlers.input({ text: "vc é burro? reverte isso agora", source: "interactive" }, ctx);
  assert.deepEqual(calls, [["model", "gpt-6-astra"], ["thinking", "high"]], "frustration -> Astra high");
  calls.length = 0;
  for (const e of [
    { text: "continua", source: "interactive" },
    { text: "mais", source: "interactive", streamingBehavior: "steer" },
    { text: "/reload", source: "interactive" },
  ]) await handlers.input(e, ctx);
  assert.deepEqual(calls, []);
  await handlers.turn_end({ message: { content: [call("bash")] }, toolResults: [{ isError: true }] }, ctx);
  await handlers.agent_end({}, ctx);
  assert.deepEqual(calls.at(-1), ["thinking", "high"], "base restored");
} finally {
  globalThis.fetch = realFetch;
}
console.log("maestro smoke: PASS");
