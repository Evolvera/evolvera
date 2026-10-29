// HUD (public/hud.js): the model really answering next to the default one, the context with PI's auto-compaction mark,
// the live activity in plain words, an honest time estimate without model calls, the last turn and the useful statuses.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { activityNow, contextGauge, estimate, modelTruth, toolSentence, turnReceipt, usefulStatuses } from "../public/hud.js";

const MIN = 60_000;
const defaults = { defaultProvider: "openai-codex", defaultModel: "gpt-6.1-sol", defaultThinkingLevel: "medium", compaction: { reserveTokens: 65536 } };

describe("model truth", () => {
  test("the model in use is the one stamped on the last answer, not the selector's display name", () => {
    const session = { model: { provider: "openai-codex", id: "gpt-6.1-luna", name: "GPT-6 Luna" }, thinkingLevel: "high" };
    const truth = modelTruth({ defaults, session, messages: [{ role: "assistant", provider: "openai-codex", model: "gpt-6.1-sol", thinkingLevel: "medium", content: [] }] });
    assert.deepEqual([truth.standard.id, truth.selected.id, truth.inUse.id], ["gpt-6.1-sol", "gpt-6.1-luna", "gpt-6.1-sol"]);
    assert.equal(truth.differsFromSelected, true, "the selector said Luna but Sol answered");
    assert.equal(truth.differsFromDefault, false);
    const fresh = modelTruth({ defaults, session, messages: [] });
    assert.equal(fresh.inUse.fromState, true, "before any answer, the selected model stands in");
    assert.equal(fresh.differsFromDefault, true);
  });
});

describe("context", () => {
  test("the bar marks where PI compacts by itself (window minus compaction.reserveTokens) and turns red near it", () => {
    const at = (percent) => contextGauge({ contextUsage: { tokens: percent * 2000, contextWindow: 200000, percent } }, defaults);
    assert.equal(Math.round(at(30).compactAt), 67);
    assert.equal(at(30).tone, "ok");
    assert.equal(at(61).tone, "wait");
    assert.equal(at(63).tone, "bad");
    assert.equal(at(63).label, "63% · 126k / 200k");
    assert.match(at(63).toCompact, /compacta sozinho em 67% \(faltam 8k tokens\)/);
    assert.match(at(70).toCompact, /próxima resposta/);
    assert.equal(contextGauge({ contextUsage: { tokens: 1, contextWindow: 100 } }, { compaction: { enabled: false } }).compactAt, null);
    assert.equal(contextGauge(null, defaults), null);
    assert.match(contextGauge({ contextUsage: { tokens: 10, contextWindow: 100 } }, defaults, { lastCompactionAt: 0, now: 5 * MIN }).compacted, /compactado há 5 min/);
  });
});

describe("activity", () => {
  test("what is happening now, in words, with what the turn already did", () => {
    assert.equal(activityNow({ streaming: false }), null);
    const runtime = new Map([["w", { name: "write", args: { path: "src/telas/Aprovado.tsx" }, status: "running" }]]);
    const turn = [
      { role: "assistant", content: [{ type: "toolCall", id: "e", name: "edit", arguments: { path: "src/a.ts" } }, { type: "toolCall", id: "t", name: "bash", arguments: { command: "npm test" } }] },
      { role: "toolResult", toolCallId: "e", content: [] },
      { role: "toolResult", toolCallId: "t", content: [], isError: true },
    ];
    const now = activityNow({ streaming: true, phase: "tool", runtime, turn, startedAt: 1000, now: 73_000 });
    assert.deepEqual([now.text, now.done, now.elapsed], ["Editando Aprovado.tsx", "1 arquivo editado · testes falharam", "1 min 12 s"]);
    assert.equal(activityNow({ streaming: true, phase: "thinking" }).text, "Pensando");
    assert.equal(toolSentence({ name: "bash", args: { command: "npm test" } }), "Rodando os testes");
    assert.equal(toolSentence({ name: "read", args: { path: "src/checkout.ts" } }), "Lendo checkout.ts");
  });
});

describe("estimate", () => {
  const tasks = (statuses) => statuses.map((status, index) => ({ id: index + 1, subject: `item ${index + 1}`, status }));
  test("from the checklist: average and spread of the finished items times what is left", () => {
    const stamps = { 1: { startedAt: 0, endedAt: 2 * MIN }, 2: { startedAt: 2 * MIN, endedAt: 6 * MIN }, 3: { startedAt: 6 * MIN } };
    const eta = estimate({ tasks: tasks(["completed", "completed", "in_progress", "pending", "pending"]), stamps, now: 7 * MIN });
    assert.equal(eta.text, "≈ 8 min restantes");
    assert.equal(eta.range, "entre 5 min e 12 min");
    assert.equal(eta.detail, "2 de 5 itens · cerca de 3 min por item");
    assert.equal(eta.pct, 40);
  });

  test("says so when it cannot know yet, and falls back to this project's past runs", () => {
    assert.match(estimate({ tasks: tasks(["in_progress", "pending"]), stamps: {} }).detail, /quando o primeiro item terminar/);
    assert.equal(estimate({ tasks: tasks(["completed", "completed"]) }).text, "Checklist completo");
    assert.equal(estimate({ history: [3 * MIN, 4 * MIN, 5 * MIN], elapsed: MIN }).text, "costuma levar 4 min");
    assert.equal(estimate({ history: [3 * MIN, 4 * MIN, 5 * MIN], elapsed: 9 * MIN }).text, "passou do tempo comum");
    assert.equal(estimate({ history: [MIN] }), null, "two runs or less: no guess");
  });
});

describe("last turn and statuses", () => {
  test("the receipt counts the files changed, the time and the cost of the last turn", () => {
    const messages = [
      { role: "user", content: "x", timestamp: 0 },
      { role: "assistant", content: [{ type: "toolCall", id: "a", name: "edit", arguments: { path: "src/a.ts" } }, { type: "toolCall", id: "b", name: "write", arguments: { path: "src/b.ts" } }], usage: { cost: { total: 0.03 } }, timestamp: 1000 },
      { role: "toolResult", toolCallId: "a", content: [], timestamp: 2000 },
      { role: "toolResult", toolCallId: "b", content: [], timestamp: 3000 },
      { role: "assistant", content: [{ type: "text", text: "ok" }], usage: { cost: { total: 0.01 } }, timestamp: 100_000 },
    ];
    assert.deepEqual(turnReceipt(messages), { duration: "1 min 40 s", files: 2, cost: "US$ 0,04" });
    assert.equal(turnReceipt([]), null);
  });

  test("counts such as 'MCP: 3 servers enabled' stay out; the mode and the goal stay in", () => {
    const statuses = new Map([["mcp", "\u001b[38;2;224;108;120m🔌 MCP: 3 servers enabled\u001b[39m"], ["execution-mode", "MODE  AUTÔNOMO · DEFAULT"], ["goal", ""], ["context-mode", "x"]]);
    assert.deepEqual(usefulStatuses(statuses), ["MODE AUTÔNOMO · DEFAULT"]);
  });
});
