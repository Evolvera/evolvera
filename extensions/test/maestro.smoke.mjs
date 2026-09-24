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
assert.equal(m.CATEGORIES.install_simple.model, "luna", "documented download/install/run uses Luna");
assert.equal(m.CATEGORIES.setup.model, "sol", "custom setup and integration stay on Sol");
assert.deepEqual(["research", "deep_research", "document", "spreadsheet", "chart"].map((c) => m.CATEGORIES[c].model), ["sol", "opus", "opus", "sol", "opus"]);
assert.deepEqual([m.CATEGORIES.deploy.model, m.CATEGORIES.deploy.effort], ["opus", "medium"]);
const R = (category) => ({ ...m.pickRoute({ choice: category }) });
const eff = (c, n) => { const r = m.scaleByCount(R(c), n); return `${r.model}/${r.effort}`; };
assert.equal(eff("multi_complex", "two"), "opus/medium");
assert.equal(eff("multi_complex", "three_four"), "opus/high");
assert.equal(eff("multi_complex", "many"), "opus/xhigh");
assert.equal(eff("multi_moderate", "two"), "sol/high");
assert.equal(eff("multi_moderate", "three_four"), "opus/medium");
assert.equal(eff("multi_moderate", "many"), "opus/medium");
assert.equal(eff("chore", "many"), "luna/medium", "count only affects multi_*");
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
assert.deepEqual(Object.keys(seen[0].body.questions), ["q", "f", "n"], "route + frustration + count in one request");
assert.deepEqual(Object.keys(seen[0].body.questions.q.criteria), Object.keys(m.CATEGORIES));
const angry = (noul) => async () => reply(200, { answers: { q: { choice: "chore" }, f: { noul } } });
assert.deepEqual(await m.classify("porra quebrou tudo de novo", "k", angry(0.94)), { model: "opus", effort: "xhigh", category: "frustrado" });
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
assert.deepEqual(m.parseLunaRoute('{"tier":"sol","frustrated":false}'), { model: "sol", effort: "medium", category: "sol" });
assert.deepEqual(m.parseLunaRoute('ok ```{"tier":"luna","frustrated":true}```'), { model: "opus", effort: "xhigh", category: "frustrado" }, "fallback frustration -> Opus xhigh");
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

// 2d. Secrets: detected locally, never sent to Jev, redacted from PREVIOUS.
for (const text of [
  "adiciona api key td_live_8d4dbdafb1e40e4a0f1873ccab93bb5e0ae683f2",
  "apikey_2191fc30606976534b70b498dd95d656a9f7_b0c19500de3c5d884708c18526e3809d3540145ecbc889e8bd43019f159e4d97 agora testa",
  "OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz123456",
  "ghp_abcdefghijklmnopqrstuvwxyz0123456789",
  "AKIAIOSFODNN7EXAMPLE",
  "DATABASE_URL=postgres://user:s3cr3tpass@db.host:5432/app",
  "-----BEGIN RSA PRIVATE KEY-----",
]) assert.equal(m.containsSecret(text), true, text);
for (const text of ["adiciona api key no maestro", "o token expira em 1h", "commit e push", "roda o sk-learn", "senha do wifi é qual?"]) assert.equal(m.containsSecret(text), false, text);
assert.ok(!m.buildState("ok", "usa a chave td_live_8d4dbdafb1e40e4a0f1873ccab93bb5e0ae683f2 aqui").includes("td_live_8d4"), "PREVIOUS redacted");

// 3. Continuation detection; the benchmark fixture is present and complete.
const bench = JSON.parse(readFileSync(path.join(root, "extensions/test/fixtures/maestro-benchmark.json"), "utf8"));
assert.equal(Object.values(bench.sets).flat().length, 531);
for (const text of ["continua", "ok pode fazer", "yep go ahead", "tenta de novo ai"]) assert.equal(m.isContinuation(text), true, text);
for (const text of ["ok, agora faz o mesmo pro endpoint de produtos", "blz agora commita", "tenta de novo mas descobre pq falha"]) {
  assert.equal(m.isContinuation(text), false, text);
}

// 4. Wiring: routing changes only the model, never the user's effort.
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
  assert.deepEqual(calls, [["model", "gpt-6-luna"]], "Luna routing preserves effort");
  globalThis.fetch = ok("install_simple");
  calls.length = 0;
  await handlers.input({ text: "baixa, instala e roda https://github.com/unreallabsai/unreal-agent/releases", source: "interactive" }, ctx);
  assert.deepEqual(calls, [["model", "gpt-6-luna"]], "simple install -> Luna without effort change");
  globalThis.fetch = ok("debug_unknown");
  calls.length = 0;
  await handlers.input({ text: "o site caiu", source: "interactive" }, ctx);
  assert.deepEqual(calls, [["model", "claude-opus-5-5"]], "debug -> Opus without effort change");
  globalThis.fetch = angry(0.98);
  calls.length = 0;
  await handlers.input({ text: "vc é burro? reverte isso agora", source: "interactive" }, ctx);
  assert.deepEqual(calls, [["model", "claude-opus-5-5"], ["thinking", "xhigh"]], "frustration -> Opus 5.5 xhigh");
  calls.length = 0;
  await handlers.input({ text: "continua", source: "interactive" }, ctx);
  assert.deepEqual(calls, [], "a continuation keeps the frustration effort");
  globalThis.fetch = angry(0.99);
  await handlers.input({ text: "de novo essa merda", source: "interactive" }, ctx);
  assert.deepEqual(calls, [["model", "claude-opus-5-5"], ["thinking", "xhigh"]], "repeated frustration stays xhigh");
  globalThis.fetch = ok("chore");
  calls.length = 0;
  await handlers.input({ text: "commit e push", source: "interactive" }, ctx);
  assert.deepEqual(calls, [["model", "gpt-6-luna"], ["thinking", "low"]], "next routed prompt restores the user's effort");
  let jevCalled = false;
  globalThis.fetch = async () => { jevCalled = true; return reply(200, {}); };
  calls.length = 0;
  await handlers.input({ text: "usa essa key sk-proj-abcdefghijklmnopqrstuvwxyz123456", source: "interactive" }, ctx);
  assert.equal(jevCalled, false, "secret never sent to the classifier");
  assert.deepEqual(calls, [["model", "claude-opus-5-5"]], "secret -> Opus without effort change");
  calls.length = 0;
  for (const e of [
    { text: "continua", source: "interactive" },
    { text: "mais", source: "interactive", streamingBehavior: "steer" },
    { text: "/reload", source: "interactive" },
  ]) await handlers.input(e, ctx);
  assert.deepEqual(calls, []);
  assert.equal(handlers.turn_end, undefined, "no in-turn effort adaptation");
  assert.equal(handlers.agent_end, undefined, "no effort reset at agent end");
  assert.equal(thinking, "low", "user-selected effort remains unchanged");
} finally {
  globalThis.fetch = realFetch;
}
console.log("maestro smoke: PASS");
