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
const m = await jiti.import(path.join(root, "extensions/maestro.ts"));

const prompts = [
  "commit e push",
  "depura por que a subconta Alpha não consegue cobrar PIX no app e o que está bloqueando a venda online hoje",
  "cara entende melhor o sistema e a documentação do asaas, porque você misturou conta-pai e subconta e tirou conclusões além do que verificou, então refaz tudo do zero com evidência",
  "Ação, coração, pão — “aspas” ‘curvas’ … 😀🚀 ñ ü ß 中文 日本語 한국어 <mask> <bos>",
  "  espaços   duplos\te\ttabs\nnova linha  ".repeat(12),
  "x".repeat(900),
  readFileSync(path.join(root, "SYSTEM.md"), "utf8").slice(0, 4000),
];

// 1. Char cut: whitespace collapsed, head of prompt, within limit.
for (const text of prompts) for (const max of [10, 82, 94]) {
  const cut = m.cutState(text, max);
  assert.ok(Array.from(cut).length <= max);
  assert.ok(text.replaceAll("<mask>", " ").replace(/\s+/g, " ").trim().startsWith(cut));
}
assert.equal(m.cutState("a  \n b", 82), "a b");

// 2. Engine oracle (when its venv exists): fixed costs match and typical prompts fit 96 at the char limit.
const venvPython = path.join(homedir(), "snake-game/server/.venv/bin/python");
if (existsSync(venvPython)) {
  const cases = [];
  for (const text of prompts.slice(0, 3)) for (const [name, entry] of Object.entries(m.QUESTIONS)) {
    cases.push({ name, question: entry.question, fixed: entry.fixedTokens, state: m.cutState(text, entry.maxChars) });
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
    assert.equal(fixed, cases[i].fixed, `${cases[i].name}: fixedTokens matches the engine`);
    assert.ok(total <= 96, `${cases[i].name}: typical prompt ${total} <= 96 at char limit`);
  });
  console.log(`maestro: engine oracle verified ${result.length} requests, max ${Math.max(...result.map(([, t]) => t))}/96 tokens`);
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
  const limit = isModel ? m.QUESTIONS.model.maxChars : m.QUESTIONS.effort.maxChars;
  assert.ok(Array.from(body.state).length <= limit, "state within char limit");
  if (reject413 && isModel) { reject413 = false; return reply(413, {}); }
  return reply(200, { answers: { q: { choice: isModel ? "opus" : "xhigh" } } });
};
assert.deepEqual(await m.decide(prompts[2], "k", fakeFetch), { model: "opus", effort: "xhigh" });
assert.equal(requests.length, 3, "only the rejected question is resent");
const modelStates = requests.filter((r) => "opus" in r.body.questions.q.criteria).map((r) => Array.from(r.body.state).length);
assert.ok(modelStates[1] <= Math.floor(m.QUESTIONS.model.maxChars * 0.75), "413 cuts 25%");
assert.ok(requests.every((r) => r.auth === "Bearer k"));
assert.deepEqual(await m.decide("oi", "k", async () => reply(200, { answers: { q: { choice: "gpt-9" } } })), { model: undefined, effort: undefined });
assert.deepEqual(await m.decide("oi", "k", async () => { throw new Error("net"); }), { model: undefined, effort: undefined });

// 3b. Retry: transient errors retried up to 3 times; deterministic errors never; deadline bounds it.
const fast = { retries: 3, backoffMs: [1, 1, 1], deadlineMs: 5_000 };
const q = m.QUESTIONS.model;
const scripted = (statuses) => { let i = 0; const f = async () => {
  const s = statuses[i++]; f.n = i;
  if (s === "throw") throw new Error("net");
  return s === 200 ? reply(200, { answers: { q: { choice: "sol" } } }) : reply(s, {});
}; return f; };
let f = scripted([503, "throw", 429, 200]);
assert.equal(await m.askChoice(q, "oi", ["luna", "sol", "opus"], "k", f, fast), "sol", "succeeds on 4th attempt");
assert.equal(f.n, 4);
f = scripted([500, 502, 503, 504, 200]);
assert.equal(await m.askChoice(q, "oi", ["luna", "sol", "opus"], "k", f, fast), undefined, "gives up after 3 retries");
assert.equal(f.n, 4);
for (const code of [400, 401, 403, 422]) {
  f = scripted([code, 200]);
  assert.equal(await m.askChoice(q, "oi", ["luna", "sol", "opus"], "k", f, fast), undefined);
  assert.equal(f.n, 1, `${code} is not retried`);
}
f = scripted([413, 413, 413, 413, 413, 200]);
assert.equal(await m.askChoice(q, "oi", ["luna", "sol", "opus"], "k", f, fast), undefined, "at most 4 cuts on 413");
assert.equal(f.n, 5);
f = scripted([413, 503, 200]);
assert.equal(await m.askChoice(q, "oi", ["luna", "sol", "opus"], "k", f, fast), "sol", "413 shrink does not consume a retry");
const started = Date.now();
f = async () => { throw new Error("net"); };
assert.equal(await m.askChoice(q, "oi", ["luna"], "k", f, { retries: 3, backoffMs: [300, 300, 300], deadlineMs: 500 }), undefined);
assert.ok(Date.now() - started < 700, "deadline bounds total wait");

// 3c. Doubt resolves upward: explicit "duvida" or low confidence -> Opus 5.5 / high.
const answer = (model, effort, conf = 0.9) => async (_u, init) => {
  const isModel = "opus" in JSON.parse(init.body).questions.q.criteria;
  return reply(200, { answers: { q: { choice: isModel ? model : effort, confidence: conf } } });
};
assert.deepEqual(await m.decide("oi", "k", answer("duvida", "duvida")), { model: "opus", effort: "high" });
assert.deepEqual(await m.decide("oi", "k", answer("luna", "low", 0.34)), { model: "opus", effort: "high" }, "low confidence is doubt");
assert.deepEqual(await m.decide("oi", "k", answer("luna", "low", 0.45)), { model: "opus", effort: "low" }, "thresholds are per question");
assert.deepEqual(await m.decide("oi", "k", answer("luna", "low")), { model: "luna", effort: "low" });

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
