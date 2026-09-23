import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const packageRoot = "/Users/j.henrique/npm-global/lib/node_modules/@earendil-works/pi-coding-agent";
const { createJiti } = await import(pathToFileURL(path.join(packageRoot, "node_modules/jiti/lib/jiti.mjs")).href);
const jiti = createJiti(import.meta.url, { moduleCache: false });
const m = await jiti.import(path.join(root, "extensions/maestro/index.ts"));

const prompts = [
  "commit e push",
  "depura por que a subconta Alpha não consegue cobrar PIX no app e o que está bloqueando a venda online hoje",
  "cara entende melhor o sistema e a documentação do asaas, porque você misturou conta-pai e subconta e tirou conclusões além do que verificou, então refaz tudo do zero com evidência",
  "Ação, coração, pão — “aspas” ‘curvas’ … 😀🚀 ñ ü ß 中文 日本語 한국어 <mask> <bos>",
  "  espaços   duplos\te\ttabs\nnova linha  ".repeat(12),
  "x".repeat(900),
  readFileSync(path.join(root, "SYSTEM.md"), "utf8").slice(0, 4000),
];

// 1. Budget cutting is never over budget and keeps short prompts whole (bound counter, no files needed).
for (const text of prompts) {
  for (const budget of [1, 10, 36, 46]) {
    const cut = m.fitState(text, budget, m.boundCounter);
    assert.ok(m.boundCounter(cut) <= budget, "bound-cut state fits");
    assert.ok(m.normalizeState(text).startsWith(cut), "cut is a head of the normalized prompt");
  }
}
assert.equal(m.fitState("commit e push", 36, m.boundCounter), "commit e push");
assert.equal(m.fitState("a  \n b", 36, m.boundCounter), "a b");

// 2. Exact counter (real Laya tokenizer.json) and the engine's own laya_coreml as oracle, when present.
const exact = await m.loadExactCounter();
const venvPython = path.join(homedir(), "snake-game/server/.venv/bin/python");
if (exact) {
  for (const text of prompts) {
    const n = m.normalizeState(text);
    assert.ok(m.boundCounter(n) >= exact(n), "byte bound is an upper bound");
    for (const [name, entry] of Object.entries(m.QUESTIONS)) {
      const cut = m.fitState(text, 96 - entry.fixedTokens, exact);
      assert.ok(exact(cut) <= 96 - entry.fixedTokens, `${name}: exact-cut state fits`);
    }
  }
  if (existsSync(venvPython)) {
    // End to end: the engine's TokenCounter must see every request we would send as <= 96.
    const cases = [];
    for (const text of prompts) for (const [name, entry] of Object.entries(m.QUESTIONS)) {
      cases.push({ name, question: entry.question, fixed: entry.fixedTokens, state: m.fitState(text, 96 - entry.fixedTokens, exact) });
    }
    const script = `
import json, sys
from pathlib import Path
import laya_coreml, laya_coreml.tokenizer, laya_coreml.common as c
d = next(Path.home().glob(".cache/huggingface/hub/models--aac6fef--laya-multilingual-coreml-ane/snapshots/*/tokenizer")).parent
tok = laya_coreml.tokenizer.Tokenizer(d / "tokenizer")
out = []
for case in json.load(sys.stdin):
    prefix, _ = c.build_prefix(tok, laya_coreml.Agent._to_internal(case["question"]), 256)
    st = c.serialize_state(case["state"]).replace(tok.mask_token, " ")
    out.append([len(prefix) + 1, len(prefix) + len(tok(st, add_special_tokens=False)["input_ids"]) + 1])
print(json.dumps(out))`;
    const result = JSON.parse(execFileSync(venvPython, ["-c", script], { input: JSON.stringify(cases), encoding: "utf8" }));
    result.forEach(([fixed, total], i) => {
      assert.equal(fixed, cases[i].fixed, `${cases[i].name}: fixedTokens constant matches the engine`);
      assert.ok(total <= 96, `${cases[i].name}: engine count ${total} <= 96`);
    });
    const fullest = Math.max(...result.map(([, total]) => total));
    console.log(`maestro: engine oracle verified ${result.length} requests, max ${fullest}/96 tokens`);
  } else {
    console.log("maestro: engine venv absent; oracle check skipped");
  }
} else {
  console.log("maestro: tokenizer unavailable; exact checks skipped (bound counter still safe)");
}

// 3. Requests: one short-mode question each, state within budget, 413 retried once at half budget.
const requests = [];
const reply = (status, body) => new Response(JSON.stringify(body), { status });
let reject413 = true;
const fakeFetch = async (_url, init) => {
  const body = JSON.parse(init.body);
  requests.push({ body, auth: init.headers.Authorization });
  assert.equal(body.mode, "short");
  assert.deepEqual(Object.keys(body.questions), ["q"]);
  const isModel = "opus" in body.questions.q.criteria;
  const fixed = isModel ? m.QUESTIONS.model.fixedTokens : m.QUESTIONS.effort.fixedTokens;
  assert.ok(m.boundCounter(body.state) + fixed <= 96, "every sent request fits 96 tokens");
  if (reject413 && isModel) { reject413 = false; return reply(413, {}); }
  return reply(200, { answers: { q: { choice: isModel ? "opus" : "xhigh" } } });
};
assert.deepEqual(await m.decide(prompts[2], "k", m.boundCounter, fakeFetch), { model: "opus", effort: "xhigh" });
assert.equal(requests.length, 3, "only the rejected question is retried");
assert.ok(requests.every((r) => r.auth === "Bearer k"));
assert.deepEqual(await m.decide("oi", "k", m.boundCounter, async () => reply(200, { answers: { q: { choice: "gpt-9" } } })), { model: undefined, effort: undefined });
assert.deepEqual(await m.decide("oi", "k", m.boundCounter, async () => { throw new Error("net"); }), { model: undefined, effort: undefined });

// 3b. Retry: transient errors retried up to 3 times; deterministic errors never; deadline bounds it.
const fast = { retries: 3, backoffMs: [1, 1, 1], deadlineMs: 5_000 };
const q = m.QUESTIONS.model;
const scripted = (statuses) => { let i = 0; const f = async () => {
  const s = statuses[i++]; f.n = i;
  if (s === "throw") throw new Error("net");
  return s === 200 ? reply(200, { answers: { q: { choice: "sol" } } }) : reply(s, {});
}; return f; };
let f = scripted([503, "throw", 429, 200]);
assert.equal(await m.askChoice(q, "oi", ["luna", "sol", "opus"], "k", m.boundCounter, f, fast), "sol", "succeeds on 4th attempt");
assert.equal(f.n, 4);
f = scripted([500, 502, 503, 504, 200]);
assert.equal(await m.askChoice(q, "oi", ["luna", "sol", "opus"], "k", m.boundCounter, f, fast), undefined, "gives up after 3 retries");
assert.equal(f.n, 4);
for (const code of [400, 401, 403, 422]) {
  f = scripted([code, 200]);
  assert.equal(await m.askChoice(q, "oi", ["luna", "sol", "opus"], "k", m.boundCounter, f, fast), undefined);
  assert.equal(f.n, 1, `${code} is not retried`);
}
f = scripted([413, 503, 200]);
assert.equal(await m.askChoice(q, "oi", ["luna", "sol", "opus"], "k", m.boundCounter, f, fast), "sol", "413 shrink does not consume a retry");
const started = Date.now();
f = async () => { throw new Error("net"); };
assert.equal(await m.askChoice(q, "oi", ["luna"], "k", m.boundCounter, f, { retries: 3, backoffMs: [300, 300, 300], deadlineMs: 500 }), undefined);
assert.ok(Date.now() - started < 700, "deadline bounds total wait");

// 4. Adaptive effort: errors/repeats raise, 3 clean steps lower, floor = base-1, final answer inert.
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

// 5. Extension wiring: routes an interactive prompt, skips streaming/commands, adapts in-run, restores base.
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
