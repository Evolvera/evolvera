// Simple view (answers and plain-language work; delegations as an exchange between agents): pure functions only.
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildTimeline } from "../public/lib.js";
import { agentExchange, agentSignature, humanRunning, humanWork, isTestCommand, joinPt, simplifyTimeline } from "../public/simple-view.js";

const tool = (name, args = {}, extra = {}) => ({ id: `${name}-${JSON.stringify(args).length}`, name, args, status: "done", result: null, isError: false, ...extra });

test("joinPt joins like Portuguese prose", () => {
  assert.equal(joinPt([]), "");
  assert.equal(joinPt(["a"]), "a");
  assert.equal(joinPt(["a", "b"]), "a e b");
  assert.equal(joinPt(["a", "", "b", "c"]), "a, b e c");
});

test("humanWork says what was done in short sentences, with the test result", () => {
  assert.deepEqual(humanWork([tool("read", { path: "a.ts" }), tool("grep", { pattern: "x" })]), { text: "Leu o código", tone: "" });
  assert.deepEqual(humanWork([tool("edit", { path: "src/a.ts" }), tool("write", { path: "src/b.ts" }), tool("edit", { path: "src/a.ts" })]), { text: "Mexeu em a.ts e b.ts", tone: "" });
  assert.equal(humanWork(["a", "b", "c"].map((name) => tool("edit", { path: `${name}.ts` }))).text, "Mexeu em 3 arquivos");
  assert.deepEqual(humanWork([tool("edit", { path: "a.ts" }), tool("bash", { command: "npm test" })]), { text: "Mexeu em a.ts. Rodou os testes: passaram", tone: "ok" });
  assert.deepEqual(humanWork([tool("bash", { command: "pnpm run test -- --watch=false" }, { status: "error", isError: true })]), { text: "Rodou os testes: falharam", tone: "bad" });
  assert.equal(humanWork([tool("bash", { command: "node --test" }, { status: "running" })]).text, "Está rodando os testes");
  assert.equal(humanWork([tool("bash", { command: "git status" }), tool("bash", { command: "ls" }), tool("mcp_search", {})]).text, "Rodou 2 comandos. Usou 1 ferramenta");
  assert.equal(humanWork([]).text, "Trabalhou nos arquivos");
});

test("test commands are recognized across the usual runners, other commands are not", () => {
  for (const command of ["npm test", "npm run test", "yarn test", "bun test", "npx vitest run", "pytest -q", "go test ./...", "cargo test", "node --test test/a.mjs", "node scripts/run-tests.mjs"]) assert.equal(isTestCommand(command), true, command);
  for (const command of ["npm install", "git commit -m test", "echo testing", ""]) assert.equal(isTestCommand(command), false, command);
});

test("humanRunning describes the tool running now in plain words", () => {
  assert.equal(humanRunning(tool("read", { path: "a" })), "Lendo o código");
  assert.equal(humanRunning(tool("edit", { path: "src/pix.ts" })), "Mexendo em pix.ts");
  assert.equal(humanRunning(tool("bash", { command: "npm test" })), "Rodando os testes");
  assert.equal(humanRunning(tool("bash", { command: "ls" })), "Rodando um comando");
  assert.equal(humanRunning(tool("other")), "Trabalhando");
});

test("agentExchange: who was asked what, and what came back", () => {
  const finished = agentExchange(tool("Agent", { subagent_type: "scout", description: "Mapear o pagamento\nlinha 2", prompt: "longo" }, {
    result: { content: [{ type: "text", text: "Linha 1\n\nLinha 2" }], details: { displayName: "🔎 scout", modelName: "Luna", durationMs: 75_000, cost: 0.034 } },
  }));
  assert.deepEqual(finished, { name: "scout", initial: "S", family: "scout", model: "Luna", status: "done", label: "pronto", ask: "Mapear o pagamento", answer: "Linha 1 Linha 2", elapsed: finished.elapsed, cost: "US$ 0.03" });
  assert.match(finished.elapsed, /1 min/);
  const running = agentExchange(tool("Agent", { subagent_type: "builder", prompt: "Crie a tela" }, { status: "running" }));
  assert.equal(running.status, "running");
  assert.equal(running.label, "trabalhando");
  assert.equal(running.answer, "");
  assert.equal(running.ask, "Crie a tela");
  assert.equal(agentExchange(tool("Agent", {}, { status: "error", isError: true, result: { content: [{ type: "text", text: "falhou" }] } })).label, "não concluiu");
  assert.equal(agentExchange(tool("Agent", { subagent_type: "qa" }, { result: { content: [], details: { status: "background" } } })).label, "em segundo plano");
  assert.equal(agentExchange(tool("Agent", {})).name, "agente");
});

test("simplifyTimeline drops reasoning and turns each delegation into its own exchange, in order", () => {
  const messages = [
    { role: "user", content: [{ type: "text", text: "faz" }], timestamp: 1 },
    { role: "assistant", timestamp: 2, content: [
      { type: "thinking", thinking: "pensando" },
      { type: "toolCall", id: "r1", name: "read", arguments: { path: "a.ts" } },
      { type: "toolCall", id: "g1", name: "Agent", arguments: { subagent_type: "scout", description: "mapear" } },
      { type: "toolCall", id: "e1", name: "edit", arguments: { path: "a.ts", edits: [] } },
    ] },
    { role: "toolResult", toolCallId: "r1", content: [{ type: "text", text: "ok" }] },
    { role: "toolResult", toolCallId: "g1", content: [{ type: "text", text: "mapa" }] },
    { role: "toolResult", toolCallId: "e1", content: [{ type: "text", text: "ok" }] },
    { role: "assistant", timestamp: 3, content: [{ type: "thinking", thinking: "fim" }, { type: "text", text: "Pronto." }] },
  ];
  const full = buildTimeline(messages);
  const simple = simplifyTimeline(full);
  assert.deepEqual(simple.map((item) => item.kind), ["user", "tools", "agent", "tools", "assistant"]);
  const group = full.find((item) => item.kind === "tools");
  assert.equal(simple[1].key, group.key, "the first part keeps the group key, so its open state survives");
  assert.notEqual(simple[3].key, group.key);
  assert.deepEqual(simple[1].tools.map((t) => t.id), ["r1"]);
  assert.equal(simple[2].key, "ag:g1");
  assert.equal(simple[4].thinking, "");
  assert.equal(simple.every((item) => item.kind !== "thinking"), true);
  assert.equal(simple[1].simple, true);
  // The full timeline is untouched (technical view and the inspector still use it).
  assert.ok(full.find((item) => item.kind === "assistant").thinking);
});

test("agentSignature changes when the delegation finishes", () => {
  const item = { kind: "agent", tool: tool("Agent", {}, { status: "running" }) };
  const before = agentSignature(item);
  item.tool = { ...item.tool, status: "done", result: { content: [{ type: "text", text: "feito" }], details: { durationMs: 10 } } };
  assert.notEqual(agentSignature(item), before);
});
