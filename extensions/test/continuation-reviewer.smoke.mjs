import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePiSdkRoot } from "./lib/pi-sdk.mjs";

// STATEFUL RESOURCE PROOF: DISPOSABLE_VERIFIED. In-memory fakes plus one fresh mkdtemp config root, removed at the end. No network or model calls.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sdkRoot = resolvePiSdkRoot(import.meta.url);
const { createJiti } = createRequire(import.meta.url)(path.join(sdkRoot, "node_modules/jiti/lib/jiti.cjs"));
const jiti = createJiti(import.meta.url, { fsCache: false, alias: { "@earendil-works/pi-coding-agent": path.join(sdkRoot, "dist/index.js") } });
const m = await jiti.import(path.join(root, "extensions/continuation-reviewer.ts"));

const dir = mkdtempSync(path.join(tmpdir(), "continuation-reviewer-"));
const configPath = path.join(dir, "continuation-reviewer.json");
const user = (text) => ({ type: "message", message: { role: "user", content: [{ type: "text", text }] } });
const assistant = (text, stopReason = "stop", tool = false) => ({ type: "message", message: { role: "assistant", stopReason, content: tool ? [{ type: "toolCall" }] : [{ type: "text", text }] } });

function fixture({ branch = [user("implemente o fix"), assistant("Próximo passo: rodar os testes.")], verdict = "continue", primary = true, mode = "tui", running = false, env = {} } = {}) {
  const handlers = new Map(); const commands = {}; const sends = []; const reviews = []; const notices = [];
  let pending = false; let release;
  const deferred = { on: false };
  const pi = { on: (k, h) => handlers.set(k, h), registerCommand: (n, c) => { commands[n] = c; }, sendMessage: async (msg, opts) => sends.push({ msg, opts }) };
  const ctx = {
    mode, isIdle: () => true, hasPendingMessages: () => pending, sessionManager: { getBranch: () => branch },
    modelRegistry: { find: (p, id) => ({ p, id }), getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "fake" }) },
    ui: { notify: (text) => notices.push(text) },
  };
  const completeSimple = async (model, request, options) => {
    reviews.push({ model, request, options });
    const reply = { content: [{ type: "text", text: typeof verdict === "string" ? `{"verdict":"${verdict}","work":"Rodar os testes."}` : verdict() }] };
    if (deferred.on) await new Promise((r) => { release = r; });
    return reply;
  };
  m.registerContinuationReviewer(pi, { completeSimple, getManager: () => ({ hasRunning: () => running }), env, configPath });
  return {
    handlers, commands, sends, reviews, notices, ctx, deferred,
    setPending: (v) => { pending = v; }, release: () => release?.(),
    start: () => handlers.get("before_agent_start")({ systemPromptOptions: { customPrompt: primary ? "# PI Coding Agent\n" : "# Specialist" } }, ctx),
    input: (text = "implemente o fix", source = "interactive") => handlers.get("input")({ source, text }, ctx),
    settle: () => handlers.get("agent_settled")({}, ctx),
  };
}

try {
  // Defaults: on, Luna 6, medium.
  assert.deepEqual(m.readReviewerConfig(configPath), { enabled: true, model: "openai-codex/gpt-6-luna", thinking: "medium" });

  // continue → exactly one visible followUp that triggers a turn; review uses the configured model.
  let f = fixture(); await f.start(); await f.input(); await f.settle();
  assert.equal(f.reviews.length, 1); assert.deepEqual(f.reviews[0].model, { p: "openai-codex", id: "gpt-6-luna" });
  assert.equal(f.reviews[0].options.reasoning, "medium");
  assert.equal(f.sends.length, 1); assert.equal(f.sends[0].msg.customType, "continuation-reviewer");
  assert.equal(f.sends[0].opts.triggerTurn, true); assert.equal(f.sends[0].opts.deliverAs, "followUp");
  await f.settle(); assert.equal(f.reviews.length, 1, "one review per user message");
  await f.input("x", "extension"); await f.settle(); assert.equal(f.reviews.length, 1, "extension input does not rearm");
  await f.input("/model"); await f.settle(); assert.equal(f.reviews.length, 1, "slash commands do not rearm");
  await f.input("faz o resto"); await f.settle(); assert.equal(f.reviews.length, 2, "a new user message rearms");

  // Other verdicts and failures never send.
  for (const verdict of ["complete", "needs_user", "blocked", () => "garbage", () => { throw new Error("down"); }]) {
    f = fixture({ verdict }); await f.start(); await f.input(); await f.settle(); assert.equal(f.sends.length, 0, String(verdict));
  }

  // Skips: no review at all.
  const skips = [
    ["non-primary", { primary: false }], ["non-tui", { mode: "print" }], ["subagents running", { running: true }], ["env off", { env: { PI_REVIEWER: "off" } }],
    ["aborted", { branch: [user("x"), assistant("y", "aborted")] }], ["length", { branch: [user("x"), assistant("y", "length")] }],
    ["ends on tool call", { branch: [user("x"), assistant("y", "stop", true)] }],
    ["reply to a notification", { branch: [user("x"), assistant("done"), assistant("notification handled")] }],
  ];
  for (const [label, options] of skips) { f = fixture(options); await f.start(); await f.input(); await f.settle(); assert.equal(f.reviews.length, 0, label); }

  // Tool-call steps keep the request current; earlier messages are context only.
  const target = m.findReviewTarget([assistant("old final"), user("pedido atual"), assistant("", "toolUse", true), { type: "message", message: { role: "toolResult", content: [] } }, assistant("parcial")]);
  assert.deepEqual(target, { reply: "parcial", users: ["pedido atual"] });
  const input = m.buildReviewInput(target.users, target.reply, ["pedido antigo"]);
  assert.match(input, /EARLIER USER MESSAGES[^]*pedido antigo[^]*CURRENT USER MESSAGE[^]*pedido atual[^]*FINAL ASSISTANT REPLY[^]*parcial/);

  // Stale review: user typed or a subagent started while the reviewer was thinking.
  for (const mutate of [(x) => x.input("cancela"), (x) => x.setPending(true), (x) => x.handlers.get("session_tree")({}, x.ctx)]) {
    f = fixture(); f.deferred.on = true; await f.start(); await f.input();
    const settling = f.settle(); await new Promise((r) => setImmediate(r)); await mutate(f); f.release(); await settling;
    assert.equal(f.sends.length, 0, "stale review suppressed");
  }

  // /reviewer toggles and persists; off disables reviews; model is configurable.
  f = fixture(); const ui = { notify: (t) => f.notices.push(t) };
  await f.commands.reviewer.handler("off", { ui });
  assert.equal(JSON.parse(readFileSync(configPath, "utf8")).enabled, false);
  await f.start(); await f.input(); await f.settle(); assert.equal(f.reviews.length, 0, "disabled");
  await f.commands.reviewer.handler("model anthropic/claude-haiku-5 low", { ui });
  await f.commands.reviewer.handler("on", { ui });
  assert.deepEqual(m.readReviewerConfig(configPath), { enabled: true, model: "anthropic/claude-haiku-5", thinking: "low" });
  await f.commands.reviewer.handler("status", { ui }); assert.match(f.notices.at(-1), /ligado · anthropic\/claude-haiku-5 · low/);

  assert.equal(m.parseReviewDecision('{"verdict":"wat","work":"x"}'), undefined);
  assert.deepEqual(m.parseReviewDecision('ok {"verdict":"continue","work":"Rodar testes"}'), { verdict: "continue", work: "Rodar testes" });
} finally {
  rmSync(dir, { recursive: true, force: true });
}
// Text deliverables: a reply that contains the requested message is delivery, and a nudge must not trigger a rewrite.
{
  const source = (await import("node:fs")).readFileSync(new URL("../continuation-reviewer.ts", import.meta.url), "utf8");
  assert.match(source, /requested deliverable is text the reply itself contains/);
  assert.match(source, /"manda\/escreve\/me passa a mensagem" means put it in the reply, not send it anywhere/);
  assert.match(source, /already delivered it, do not redo or rewrite it: say in one line that it is already done and stop/);
}

console.log("continuation-reviewer smoke: PASS");
