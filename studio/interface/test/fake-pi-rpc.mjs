#!/usr/bin/env node
// Deterministic stand-in for `pi --mode rpc` (never calls a model).
// Prompt "tools" streams thinking + tool executions; prompt "ui" asks an extension dialog; a prompt containing
// "todo-demo" streams `todo` tool results (full snapshots in details, plus one error result that must be ignored).
// `fork` switches to a new fake session holding the history before the chosen user message.
// FAKE_PI_SESSION_FILE: path reported as sessionFile; set_session_name then appends a session_info line to it.
// `clone` copies that file next to itself (new header id) and switches to the copy; a user message "cancel-clone" makes an
// extension veto it.
// FAKE_PI_MODEL="provider/id": the model get_state reports. FAKE_PI_FAST=1: get_commands lists a `fast` extension command
// and the prompt "/fast on|eco|ultra|ultra-eco|off" answers like extensions/codex-fast-mode.ts (setStatus + notify);
// FAKE_PI_FAST_STUCK=1 makes it only warn (no status change). FAKE_PI_CONTEXT_PERCENT: context usage get_session_stats reports (default 30).
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
// FAKE_PI_PID_FILE: this process id is appended there, so a test can describe the process tree the Studio spawned.
if (process.env.FAKE_PI_PID_FILE) appendFileSync(process.env.FAKE_PI_PID_FILE, `${process.pid}\n`);
// FAKE_PI_ARGV_FILE: one JSON line per started process with the argv it received, so a test can assert how the Studio spawned it.
if (process.env.FAKE_PI_ARGV_FILE) appendFileSync(process.env.FAKE_PI_ARGV_FILE, `${JSON.stringify({ pid: process.pid, argv: process.argv.slice(2) })}\n`);
process.stdin.setEncoding("utf8");
let buffer = "";
const entries = [];

function emit(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function respond(command, success = true, data = undefined) {
  emit({ id: command.id, type: "response", command: command.type, success, ...(data === undefined ? {} : { data }) });
}

function record(message) {
  const id = `e${entries.length + 1}`;
  entries.push({ type: "message", id, parentId: entries.length ? entries[entries.length - 1].id : null, timestamp: new Date().toISOString(), message });
}

function assistant(content, stopReason = "stop") {
  return {
    role: "assistant",
    content,
    provider: "fake",
    model: "fake-model",
    usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { total: 0 } },
    stopReason,
    timestamp: Date.now(),
  };
}

function streamTools(command) {
  const first = assistant([
    { type: "thinking", thinking: "Planejando a edição." },
    { type: "toolCall", id: "call_bash", name: "bash", arguments: { command: "npm test" } },
    { type: "toolCall", id: "call_edit", name: "edit", arguments: { path: "src/app.js", edits: [{ oldText: "a", newText: "b\nc" }] } },
  ], "toolUse");
  emit({ type: "message_start", message: { ...first, content: [] } });
  emit({ type: "message_update", message: { ...first, content: [] }, assistantMessageEvent: { type: "thinking_delta", contentIndex: 0, delta: "Planejando a edição." } });
  emit({ type: "message_end", message: first });
  record(first);
  emit({ type: "tool_execution_start", toolCallId: "call_bash", toolName: "bash", args: { command: "npm test" } });
  emit({ type: "tool_execution_update", toolCallId: "call_bash", toolName: "bash", args: { command: "npm test" }, partialResult: { content: [{ type: "text", text: "running" }] } });
  const bashResult = { content: [{ type: "text", text: "ok 1" }], details: {} };
  emit({ type: "tool_execution_end", toolCallId: "call_bash", toolName: "bash", result: bashResult, isError: false });
  const editResult = { content: [{ type: "text", text: "Edited src/app.js" }], details: { diff: "-1 a\n+1 b\n+2 c" } };
  emit({ type: "tool_execution_start", toolCallId: "call_edit", toolName: "edit", args: first.content[2].arguments });
  emit({ type: "tool_execution_end", toolCallId: "call_edit", toolName: "edit", result: editResult, isError: false });
  for (const [id, name, result] of [["call_bash", "bash", bashResult], ["call_edit", "edit", editResult]]) {
    const message = { role: "toolResult", toolCallId: id, toolName: name, content: result.content, details: result.details, isError: false, timestamp: Date.now() };
    emit({ type: "message_start", message });
    emit({ type: "message_end", message });
    record(message);
  }
  const final = assistant([{ type: "text", text: `Fake PI: ${command.message}` }]);
  emit({ type: "message_start", message: { ...final, content: [] } });
  emit({ type: "message_update", message: { ...final, content: [] }, assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: final.content[0].text } });
  emit({ type: "message_end", message: final });
  record(final);
}

const DEMO_MARKDOWN = [
  "## Resumo da mudança",
  "",
  "Atualizei o **renderizador** e conferi os testes. Pontos principais:",
  "",
  "- `lib.js` agora resume ferramentas em uma linha",
  "- Contagem de linhas `+N` / `-M` por arquivo",
  "  - inclusive para edições sem diff",
  "",
  "```js",
  "export function formatElapsed(ms) {",
  "  return `${Math.floor(ms / 1000)} s`;",
  "}",
  "```",
  "",
  "| Arquivo | Status |",
  "|---|:-:|",
  "| src/app.js | ok |",
  "",
  "Veja https://example.com para detalhes.",
].join("\n");

// Shape of @juicesharp/rpiv-todo results: details carries the FULL snapshot {action, params, tasks, nextId}.
function streamTodo(command) {
  const snapshot = (statuses) => statuses.map(([subject, status, activeForm], index) => ({ id: index + 1, subject, status, ...(activeForm ? { activeForm } : {}) }));
  const steps = [
    { id: "call_todo_1", isError: false, tasks: snapshot([["Ler o código", "in_progress", "lendo o código"], ["Escrever testes", "pending"], ["Publicar", "pending"]]) },
    { id: "call_todo_2", isError: false, tasks: snapshot([["Ler o código", "completed"], ["Escrever testes", "in_progress", "escrevendo testes"], ["Publicar", "pending"]]) },
    // An error result keeps the previous state: the UI must not show it.
    { id: "call_todo_3", isError: true, tasks: snapshot([["Lixo", "completed"]]) },
  ];
  const calls = assistant(steps.map((step) => ({ type: "toolCall", id: step.id, name: "todo", arguments: { action: "update" } })), "toolUse");
  emit({ type: "message_start", message: { ...calls, content: [] } });
  emit({ type: "message_end", message: calls });
  record(calls);
  for (const step of steps) {
    const result = { content: [{ type: "text", text: step.isError ? "Error: invalid" : "Updated" }], details: { action: "update", params: {}, tasks: step.tasks, nextId: step.tasks.length + 1 } };
    emit({ type: "tool_execution_start", toolCallId: step.id, toolName: "todo", args: { action: "update" } });
    emit({ type: "tool_execution_end", toolCallId: step.id, toolName: "todo", result, isError: step.isError });
    const message = { role: "toolResult", toolCallId: step.id, toolName: "todo", content: result.content, details: result.details, isError: step.isError, timestamp: Date.now() };
    emit({ type: "message_start", message });
    emit({ type: "message_end", message });
    record(message);
  }
  const final = assistant([{ type: "text", text: `Plano atualizado.\nSegunda linha. (${command.message})` }]);
  emit({ type: "message_start", message: { ...final, content: [] } });
  emit({ type: "message_end", message: final });
  record(final);
}

// Tarefas tab fixture (prompt "tasks-demo"): full todo snapshots with description/blockedBy/owner, timed in the past through the
// message timestamps, plus two Agent runs linked to tasks by subject (ag-t1 still running in the background, ag-t2 finished).
// Prompt "tasks-finish" completes ag-t1 and its task. FAKE_PI_STEER=1: get_commands lists `steer` and "/steer <id> <text>"
// answers like extensions/studio-steer.ts (notify), appending {agentId, message} to FAKE_PI_STEER_LOG.
const finishedAgents = new Set();
const MINUTE = 60_000;

function emitMessage(message) {
  emit({ type: "message_start", message });
  emit({ type: "message_end", message });
  record(message);
}

function emitToolResult(callId, toolName, args, result, timestamp) {
  emit({ type: "tool_execution_start", toolCallId: callId, toolName, args });
  emit({ type: "tool_execution_end", toolCallId: callId, toolName, result, isError: false });
  emitMessage({ role: "toolResult", toolCallId: callId, toolName, content: result.content, details: result.details, isError: false, timestamp });
}

function todoResult(tasks) {
  return { content: [{ type: "text", text: "Updated" }], details: { action: "update", params: {}, tasks, nextId: tasks.length + 1 } };
}

// Visual QA of the HUD ("hud-demo"): answers stamped with a real provider/model/thinkingLevel, a checklist whose first two
// items finished minutes apart, an edit and a passing test run, then an edit left running (the run never ends, like
// "silent"), so the activity line, the time estimate and the model in use can be seen.
function streamHudDemo() {
  const now = Date.now();
  const tasks = (statuses) => ["Gerar o QR do Pix no confirmar", "Tela de confirmação com o QR", "Mensagem de pagamento aprovado", "Testes do checkout", "Atualizar o README"].map((subject, index) => ({ id: index + 1, subject, status: statuses[index] }));
  const answer = (content, minutesAgo, stopReason = "toolUse") => ({ role: "assistant", content, provider: "openai-codex", model: "gpt-6.1-luna", thinkingLevel: "high", usage: { input: 4200, output: 300, cacheRead: 0, cacheWrite: 0, totalTokens: 4500, cost: { total: 0.014 } }, stopReason, timestamp: now - minutesAgo * MINUTE });
  const steps = [
    [7, ["in_progress", "pending", "pending", "pending", "pending"]],
    [5, ["completed", "in_progress", "pending", "pending", "pending"]],
    [2, ["completed", "completed", "in_progress", "pending", "pending"]],
  ];
  steps.forEach(([minutesAgo, statuses], index) => {
    const id = `call_hud_todo_${index}`;
    emitMessage(answer([{ type: "toolCall", id, name: "todo", arguments: { action: "update" } }], minutesAgo));
    emitToolResult(id, "todo", { action: "update" }, todoResult(tasks(statuses)), now - minutesAgo * MINUTE);
  });
  const edit = { path: "src/telas/Confirmacao.tsx", edits: [{ oldText: "a", newText: "b" }] };
  emitMessage(answer([{ type: "toolCall", id: "call_hud_edit", name: "edit", arguments: edit }], 3));
  emitToolResult("call_hud_edit", "edit", edit, { content: [{ type: "text", text: "Arquivo editado." }] }, now - 3 * MINUTE);
  const test = { command: "npm test" };
  emitMessage(answer([{ type: "toolCall", id: "call_hud_test", name: "bash", arguments: test }], 1.5));
  emitToolResult("call_hud_test", "bash", test, { content: [{ type: "text", text: "Tests: 42 passed" }] }, now - 1.5 * MINUTE);
  const running = { path: "src/telas/PagamentoAprovado.tsx", content: "export const Aprovado = () => null;" };
  emitMessage(answer([{ type: "toolCall", id: "call_hud_write", name: "write", arguments: running }], 0));
  emit({ type: "tool_execution_start", toolCallId: "call_hud_write", toolName: "write", args: running });
}

function streamTasksDemo() {
  const now = Date.now();
  const fixture = (statuses) => [
    { id: 1, subject: "Rodar benchmark da API", status: statuses[0], description: "Medir a latência p95 do endpoint /v1/items" },
    { id: 2, subject: "Escrever relatório", status: statuses[1], description: "Resumir os resultados em markdown", blockedBy: [1] },
    { id: 3, subject: "Revisar resultados", status: statuses[2], description: "Conferir números e valores atípicos" },
    { id: 4, subject: "Coletar métricas", status: statuses[3] },
    { id: 5, subject: "Atualizar documentação", status: statuses[4], owner: "docs-bot" },
  ];
  const early = assistant([{ type: "toolCall", id: "call_tk_todo_a", name: "todo", arguments: { action: "create" } }], "toolUse");
  early.timestamp = now - 9 * MINUTE;
  emitMessage(early);
  emitToolResult("call_tk_todo_a", "todo", { action: "create" }, todoResult(fixture(["pending", "pending", "pending", "in_progress", "pending"])), now - 9 * MINUTE);
  const benchArgs = { name: "benchmark-bot", subagent_type: "general-purpose", description: "Rodar benchmark da API", prompt: "Execute o benchmark da API e relate a latência p95.", run_in_background: true };
  const metricsArgs = { subagent_type: "validator", description: "Coletar métricas", prompt: "Colete as métricas do serviço." };
  const later = assistant([
    { type: "toolCall", id: "call_tk_todo_b", name: "todo", arguments: { action: "update" } },
    { type: "toolCall", id: "call_tk_bench", name: "Agent", arguments: benchArgs },
    { type: "toolCall", id: "call_tk_metrics", name: "Agent", arguments: metricsArgs },
  ], "toolUse");
  later.timestamp = now - 6 * MINUTE;
  emitMessage(later);
  emitToolResult("call_tk_todo_b", "todo", { action: "update" }, todoResult(fixture(["in_progress", "pending", "pending", "completed", "pending"])), now - 6 * MINUTE);
  const benchDetails = { displayName: "general-purpose", description: benchArgs.description, subagentType: "general-purpose", status: "background", agentId: "ag-t1", toolUses: 0, tokens: "", durationMs: 0 };
  emitToolResult("call_tk_bench", "Agent", benchArgs, { content: [{ type: "text", text: "Agent started in background.\nAgent ID: ag-t1" }], details: benchDetails }, now - 6 * MINUTE);
  const metricsDetails = { displayName: "🛡️ Validator", description: metricsArgs.description, subagentType: "validator", status: "completed", agentId: "ag-t2", toolUses: 3, tokens: "", durationMs: 42_000 };
  emitToolResult("call_tk_metrics", "Agent", metricsArgs, { content: [{ type: "text", text: "Métricas válidas." }], details: metricsDetails }, now - 5 * MINUTE);
  emitMessage(assistant([{ type: "text", text: "Quadro de tarefas criado." }]));
}

function streamTasksFinish() {
  const now = Date.now();
  finishedAgents.add("ag-t1");
  const tasks = [
    { id: 1, subject: "Rodar benchmark da API", status: "completed", description: "Medir a latência p95 do endpoint /v1/items" },
    { id: 2, subject: "Escrever relatório", status: "pending", description: "Resumir os resultados em markdown", blockedBy: [1] },
    { id: 3, subject: "Revisar resultados", status: "pending", description: "Conferir números e valores atípicos" },
    { id: 4, subject: "Coletar métricas", status: "completed" },
    { id: 5, subject: "Atualizar documentação", status: "pending", owner: "docs-bot" },
  ];
  emitToolResult("call_tk_todo_c", "todo", { action: "update" }, todoResult(tasks), now);
  const details = { id: "ag-t1", description: "Rodar benchmark da API", status: "completed", toolUses: 5, turnCount: 3, totalTokens: 9000, totalCost: 0.01, durationMs: 6 * MINUTE, resultPreview: "p95 = 120 ms" };
  const note = { role: "custom", customType: "subagent-notification", content: "<task-notification>\n<task-id>ag-t1</task-id>\n<status>completed</status>\n</task-notification>", display: true, details, timestamp: now };
  emit({ type: "message_start", message: note });
  emit({ type: "message_end", message: note });
  entries.push({ type: "custom_message", id: `e${entries.length + 1}`, parentId: entries.at(-1)?.id ?? null, timestamp: new Date().toISOString(), customType: note.customType, content: note.content, display: true, details });
  emitMessage(assistant([{ type: "text", text: "Benchmark concluído." }]));
}

// Same replies as extensions/studio-steer.ts: the extension notifies, it never throws to the PI.
function steerCommand(argument) {
  const notify = (message, notifyType) => emit({ type: "extension_ui_request", id: `steer-${Date.now()}`, method: "notify", message, notifyType });
  const match = /^(\S+)\s+([\s\S]*?)\s*$/.exec(argument);
  if (!match || !match[2].trim()) return notify("Uso: /steer <agentId> <mensagem> (a mensagem não pode estar vazia).", "warning");
  const [, agentId, message] = match;
  if (agentId !== "ag-t1") return notify(`Subagente desconhecido: ${agentId}.`, "warning");
  if (finishedAgents.has(agentId)) return notify(`O subagente ${agentId} não está em execução.`, "warning");
  if (process.env.FAKE_PI_STEER_LOG) appendFileSync(process.env.FAKE_PI_STEER_LOG, `${JSON.stringify({ agentId, message })}\n`);
  return notify(`Mensagem enviada ao subagente ${agentId}`, "info");
}

// Visual QA only: thinking, tools and markdown spread over ~4 s so the live state is observable.
function streamDemo(command) {
  const at = (ms, fn) => setTimeout(fn, ms);
  const live = assistant([], "toolUse");
  emit({ type: "message_start", message: live });
  for (let index = 0; index < 6; index++) {
    at(200 + index * 250, () => emit({ type: "message_update", message: { ...live, content: [] }, assistantMessageEvent: { type: "thinking_delta", contentIndex: 0, delta: "Lendo o projeto e planejando a edição. " } }));
  }
  at(1800, () => {
    streamTools({ message: command.message });
    entries.pop();
    const final = assistant([{ type: "text", text: DEMO_MARKDOWN }]);
    record(final);
    emit({ type: "message_end", message: final });
  });
  at(4200, () => {
    emit({ type: "turn_end", message: { role: "assistant", content: [] }, toolResults: [] });
    emit({ type: "agent_end", messages: [] });
  });
}

// Visual QA of the inspector: a ~9 s run with the shapes real PI and @tintinweb/pi-subagents emit
// (AgentDetails in tool partial/final results, "subagent-notification" custom message, "subagents" status).
let inspectorRuns = 0;
function streamInspector(command) {
  const n = ++inspectorRuns;
  const at = (ms, fn) => setTimeout(fn, ms);
  const tool = (id, name, args, partials, result, isError = false, stepMs = 120) => (start) => {
    emit({ type: "tool_execution_start", toolCallId: id, toolName: name, args });
    partials.forEach((partial, index) => at(start + (index + 1) * stepMs, () => emit({ type: "tool_execution_update", toolCallId: id, toolName: name, args, partialResult: partial })));
    const end = start + (partials.length + 1) * stepMs;
    at(end, () => {
      emit({ type: "tool_execution_end", toolCallId: id, toolName: name, result, isError });
      const message = { role: "toolResult", toolCallId: id, toolName: name, content: result.content, details: result.details, isError, timestamp: Date.now() };
      emit({ type: "message_start", message });
      emit({ type: "message_end", message });
      record(message);
    });
    return end;
  };
  const text = (value) => ({ content: [{ type: "text", text: value }] });
  const testLines = Array.from({ length: 24 }, (_, i) => `  ✔ caso ${String(i + 1).padStart(2, "0")} · ${["lib", "server", "smoke"][i % 3]} (${(i * 7) % 40 + 2} ms)`);
  const bashArgs = { command: "npm test -- --reporter=spec\necho fim" };
  const editArgs = { path: "public/lib.js", edits: [{ oldText: "return a;", newText: "return a ?? b;\n// fallback" }] };
  const failArgs = { command: "node scripts/check-types.mjs" };
  const fgArgs = { description: "Mapear rotas da API", subagent_type: "Explore", prompt: "Liste todas as rotas HTTP em server.mjs e diga quais exigem token.", run_in_background: false };
  const bgArgs = { description: "Auditar dependências", subagent_type: "general-purpose", name: "deps-audit", prompt: "Verifique dependências desatualizadas e riscos conhecidos." };
  const base = { displayName: "Explore", description: fgArgs.description, subagentType: "Explore", modelName: "haiku 4.5", tags: ["thinking: low"] };
  const activities = ["reading…", "searching…", "reading 2 files…", "running command…", "Encontrei 9 rotas; conferindo autenticação…"];
  const fgPartials = activities.map((activity, i) => ({ content: [{ type: "text", text: `${i + 1} tool uses...` }], details: { ...base, toolUses: i + 1, tokens: `${(4.1 + i * 2.3).toFixed(1)}k token`, cost: 0, turnCount: i + 1, durationMs: (i + 1) * 450, status: "running", activity, spinnerFrame: i } }));
  const fgResult = { content: [{ type: "text", text: "Agent completed in 2.7s (5 tool uses, 15.3k token).\n\n9 rotas encontradas:\n- GET /api/health (token)\n- GET /api/bootstrap (token)\n- POST /api/projects/:id/command (token)\n- GET /api/projects/:id/events (cookie)\nTodas exigem token, exceto os arquivos estáticos." }], details: { ...base, toolUses: 5, tokens: "15.3k token", cost: 0, turnCount: 5, durationMs: 2700, status: "completed", agentId: `ag-fg01-${n}` } };
  const bgResult = { content: [{ type: "text", text: `Agent started in background.\nAgent ID: ag-bg02-${n}\nType: general-purpose\nDescription: Auditar dependências\n\nYou will be notified when this agent completes.` }], details: { displayName: "general-purpose", description: bgArgs.description, subagentType: "general-purpose", modelName: "sonnet 4.5", toolUses: 0, tokens: "", durationMs: 0, status: "background", agentId: `ag-bg02-${n}` } };

  const first = assistant([
    { type: "thinking", thinking: "Vou rodar os testes, corrigir o fallback em lib.js\ne delegar o mapeamento de rotas a um subagente." },
    { type: "text", text: "Vou rodar os testes e ajustar o fallback." },
    { type: "toolCall", id: `call_i_bash_${n}`, name: "bash", arguments: bashArgs },
    { type: "toolCall", id: `call_i_edit_${n}`, name: "edit", arguments: editArgs },
    { type: "toolCall", id: `call_i_fail_${n}`, name: "bash", arguments: failArgs },
    { type: "toolCall", id: `call_i_fg_${n}`, name: "Agent", arguments: fgArgs },
    { type: "toolCall", id: `call_i_bg_${n}`, name: "Agent", arguments: bgArgs },
  ], "toolUse");
  emit({ type: "message_start", message: { ...first, content: [] } });
  const thought = first.content[0].thinking;
  for (let index = 0; index < 4; index++) {
    at(150 + index * 150, () => emit({ type: "message_update", message: { ...first, content: [] }, assistantMessageEvent: { type: "thinking_delta", contentIndex: 0, delta: thought.slice(index * Math.ceil(thought.length / 4), (index + 1) * Math.ceil(thought.length / 4)) } }));
  }
  at(800, () => emit({ type: "message_update", message: { ...first, content: [] }, assistantMessageEvent: { type: "text_delta", contentIndex: 1, delta: first.content[1].text } }));
  at(1000, () => {
    emit({ type: "message_end", message: first });
    record(first);
    let t = tool(`call_i_bash_${n}`, "bash", bashArgs, testLines.map((_, i) => text(testLines.slice(0, i + 1).join("\n"))), text(`${testLines.join("\n")}\nℹ tests 24\nℹ pass 24\nfim`), false, 70)(0);
    at(t + 100, () => {
      let u = tool(`call_i_edit_${n}`, "edit", editArgs, [], { content: [{ type: "text", text: "Edited public/lib.js" }], details: { diff: " 41   const a = read();\n-42   return a;\n+42   return a ?? b;\n+43   // fallback\n 44 }" } })(0);
      at(u + 100, () => {
        u = tool(`call_i_fail_${n}`, "bash", failArgs, [], text("scripts/check-types.mjs:12\n  TypeError: Cannot read properties of undefined (reading 'kind')\n\nCommand exited with code 1"), true)(0);
        at(u + 100, () => {
          emit({ type: "extension_ui_request", id: "insp-status-1", method: "setStatus", statusKey: "subagents", statusText: "1 running agent" });
          u = tool(`call_i_fg_${n}`, "Agent", fgArgs, fgPartials, fgResult, false, 650)(0);
          at(u + 100, () => {
            tool(`call_i_bg_${n}`, "Agent", bgArgs, [], bgResult)(0);
            at(400, () => {
              emit({ type: "auto_retry_start", attempt: 1, maxAttempts: 3, delayMs: 2000, errorMessage: "529 overloaded_error" });
              emit({ type: "auto_retry_end", success: true, attempt: 2 });
              emit({ type: "extension_ui_request", id: "insp-notify", method: "notify", message: "Subagente deps-audit rodando em segundo plano", notifyType: "info" });
              const final = assistant([{ type: "text", text: `Pronto: testes passaram, o fallback foi aplicado e as rotas foram mapeadas.\nO verificador de tipos falhou (scripts/check-types.mjs:12) — sigo nele. (${command.message})` }]);
              emit({ type: "message_start", message: { ...final, content: [] } });
              emit({ type: "message_update", message: { ...final, content: [] }, assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: final.content[0].text } });
              emit({ type: "message_end", message: final });
              record(final);
              emit({ type: "turn_end", message: final, toolResults: [] });
              emit({ type: "agent_end", messages: [] });
            });
            at(3500, () => {
              const details = { id: `ag-bg02-${n}`, description: bgArgs.description, status: "completed", toolUses: 7, turnCount: 4, totalTokens: 22800, totalCost: 0.04, durationMs: 3600, outputFile: `/tmp/pi-subagents/ag-bg02-${n}.jsonl`, resultPreview: "2 dependências desatualizadas (sem CVEs conhecidos).\nRecomendo atualizar croner e nanoid." };
              const note = { role: "custom", customType: "subagent-notification", content: `<task-notification>\n<task-id>ag-bg02-${n}</task-id>\n<status>completed</status>\n<summary>Agent \"Auditar dependências\" completed</summary>\n</task-notification>`, display: true, details, timestamp: Date.now() };
              emit({ type: "extension_ui_request", id: "insp-status-2", method: "setStatus", statusKey: "subagents" });
              emit({ type: "message_start", message: note });
              emit({ type: "message_end", message: note });
              entries.push({ type: "custom_message", id: `e${entries.length + 1}`, parentId: entries.at(-1)?.id ?? null, timestamp: new Date().toISOString(), customType: note.customType, content: note.content, display: true, details });
              entries.push({ type: "custom", id: `e${entries.length + 1}`, parentId: entries.at(-1).id, timestamp: new Date().toISOString(), customType: "subagents:record", data: { id: `ag-bg02-${n}`, type: "general-purpose", description: bgArgs.description, status: "completed", result: "2 dependências desatualizadas (sem CVEs conhecidos).\n\n| pacote | atual | última |\n| croner | 10.0.1 | 10.1.0 |\n| nanoid | 5.1.16 | 5.2.0 |\n\nRecomendo atualizar croner e nanoid.", startedAt: Date.now() - 3600, completedAt: Date.now() } });
            });
          });
        });
      });
    });
  });
}

// Direct `!` shell commands. "sleep" runs until abort_bash; "fail" exits 1; "big" reports truncation;
// "nobytes" answers with an error response. Output streams as bash_execution_update chunks.
let activeBash = null;
let sessionName = "fake";
let sessionFile = process.env.FAKE_PI_SESSION_FILE || undefined;
let forks = 0;
const [modelProvider = "fake", ...modelRest] = (process.env.FAKE_PI_MODEL || "fake/fake-model").split("/");
const fakeModel = { provider: modelProvider, id: modelRest.join("/") || "fake-model", name: "Fake Model", reasoning: true, contextWindow: 200000 };
let fastMode = "off";
let fastAccepted = false;
const FAST_MODES = { on: "all", eco: "subagents", ultra: "ultra", "ultra-eco": "ultra-subagents", off: "off" };

// Same status strings as the extension: ECO for eco modes, 🟡/🟢 on an eligible model, SUB otherwise.
function fastStatus() {
  const ultra = fastMode === "ultra" || fastMode === "ultra-subagents";
  if (fastMode === "off") return undefined;
  if (fastMode === "subagents") return "⚡ECO";
  if (fastMode === "ultra-subagents") return "🚀ECO";
  if (fakeModel.provider !== "openai-codex") return `${ultra ? "🚀" : "⚡"}SUB`;
  return `${ultra && fakeModel.id === "gpt-6-astra" ? "🚀" : "⚡"}${fastAccepted ? "🟢" : "🟡"}`;
}

function emitFastStatus() {
  emit({ type: "extension_ui_request", id: `fast-status-${Date.now()}`, method: "setStatus", statusKey: "codex-fast-mode", statusText: fastStatus() });
}

function fastCommand(argument) {
  const mode = FAST_MODES[argument];
  if (!mode) {
    emit({ type: "extension_ui_request", id: `fast-usage-${Date.now()}`, method: "notify", message: "Uso: /fast on | /fast eco | /fast ultra | /fast ultra-eco | /fast off", notifyType: "warning" });
    return;
  }
  if (process.env.FAKE_PI_FAST_STUCK === "1") {
    emit({ type: "extension_ui_request", id: `fast-stuck-${Date.now()}`, method: "notify", message: "Fast Mode indisponível nesta conta.", notifyType: "warning" });
    return;
  }
  fastMode = mode;
  fastAccepted = false;
  emitFastStatus();
  emit({ type: "extension_ui_request", id: `fast-notify-${Date.now()}`, method: "notify", message: mode === "off" ? "Fast Mode desativado." : `Fast Mode ${argument} ativado.`, notifyType: mode === "off" ? "info" : "warning" });
}

// Duplicates the session file under a new id and switches to the copy (RPC clone).
function cloneSessionFile() {
  forks += 1;
  if (!sessionFile || !existsSync(sessionFile)) return;
  const [header, ...rest] = readFileSync(sessionFile, "utf8").split("\n");
  const copy = path.join(path.dirname(sessionFile), `clone-${forks}-${path.basename(sessionFile)}`);
  const parsed = JSON.parse(header);
  writeFileSync(copy, [JSON.stringify({ ...parsed, id: `${parsed.id}-clone-${forks}`, timestamp: new Date().toISOString() }), ...rest].join("\n"));
  sessionFile = copy;
}

function finishBash(run, cancelled) {
  clearTimeout(run.timer);
  const exitCode = cancelled ? undefined : run.command.command.startsWith("fail") ? 1 : 0;
  const truncated = run.command.command === "big";
  record({ role: "bashExecution", command: run.command.command, output: run.output, exitCode, cancelled, truncated, timestamp: Date.now() });
  respond(run.command, true, { output: run.output, exitCode, cancelled, truncated, ...(truncated ? { fullOutputPath: "/tmp/pi-bash-fake.log" } : {}) });
  activeBash = null;
}

function startBash(command) {
  if (command.command === "nobytes") {
    emit({ id: command.id, type: "response", command: "bash", success: false, error: "Shell indisponível" });
    return;
  }
  const run = { command, output: "", timer: null };
  activeBash = run;
  const chunks = command.command === "sleep" ? ["dormindo\n"] : [`saída de: ${command.command}\n`, "linha 2\n"];
  chunks.forEach((delta, index) => setTimeout(() => {
    if (activeBash !== run) return;
    run.output += delta;
    emit({ type: "bash_execution_update", id: command.id, delta });
    if (command.command !== "sleep" && index === chunks.length - 1) run.timer = setTimeout(() => activeBash === run && finishBash(run, false), 30);
  }, 20 * (index + 1)));
}

function handle(command) {
  if (command.type === "test_exit") {
    process.exit(Number.isInteger(command.code) ? command.code : 0);
  }

  if (command.type === "prompt" && process.env.FAKE_PI_FAST === "1" && /^\/fast(\s|$)/.test(command.message)) {
    respond(command);
    fastCommand(command.message.slice(5).trim());
    return;
  }

  if (command.type === "prompt" && process.env.FAKE_PI_STEER === "1" && /^\/steer(\s|$)/.test(command.message)) {
    respond(command);
    steerCommand(command.message.slice(6).trim());
    return;
  }

  if (command.type === "prompt") {
    respond(command);
    emit({ type: "agent_start" });
    emit({ type: "turn_start" });
    const user = { role: "user", content: command.message, timestamp: Date.now() };
    emit({ type: "message_start", message: user });
    emit({ type: "message_end", message: user });
    record(user);
    if (command.message === "ui-timeout") {
      emit({ type: "extension_ui_request", id: "fake-ui-timeout", method: "select", timeout: 30, options: ["Sim"] });
      return;
    }
    if (command.message === "ui") {
      emit({ type: "extension_ui_request", id: "fake-status-old", method: "setStatus", statusKey: "test", statusText: "old" });
      emit({ type: "extension_ui_request", id: "fake-widget", method: "setWidget", widgetKey: "test", widgetLines: ["widget"] });
      emit({ type: "extension_ui_request", id: "fake-status-new", method: "setStatus", statusKey: "test", statusText: "latest" });
      emit({ type: "extension_ui_request", id: "fake-ui-1", method: "select", timeout: 5000, title: "Permitir?", options: ["Permitir", "Bloquear"] });
      return;
    }
    if (command.message === "demo") {
      streamDemo(command);
      return;
    }
    // Visibility QA: "silent" streams forever without another event; "silent-agent" starts a foreground Agent run, reports
    // one progress update and goes quiet.
    if (command.message === "silent") return;
    if (command.message === "hud-demo") {
      streamHudDemo();
      return;
    }
    if (command.message === "silent-agent") {
      const args = { description: "Mapear rotas", subagent_type: "Explore", name: "mapeador", prompt: "mapeie" };
      emit({ type: "tool_execution_start", toolCallId: "call_silent_agent", toolName: "Agent", args });
      emit({ type: "tool_execution_update", toolCallId: "call_silent_agent", toolName: "Agent", args, partialResult: { content: [{ type: "text", text: "1 tool uses..." }], details: { displayName: "Explore", subagentType: "Explore", status: "running", activity: "reading…", toolUses: 1 } } });
      return;
    }
    if (command.message === "inspector") {
      streamInspector(command);
      return;
    }
    if (command.message === "tools") {
      streamTools(command);
    } else if (command.message.includes("todo-demo")) {
      streamTodo(command);
    } else if (command.message === "tasks-demo") {
      streamTasksDemo();
    } else if (command.message === "tasks-finish") {
      streamTasksFinish();
    } else {
      // FAKE_PI_REPLY_FILE: answer with that file's text instead of echoing the prompt (Vorcaro tests and screenshots).
      const reply = process.env.FAKE_PI_REPLY_FILE && existsSync(process.env.FAKE_PI_REPLY_FILE) ? readFileSync(process.env.FAKE_PI_REPLY_FILE, "utf8") : `Fake PI: ${command.message}`;
      emit({ type: "message_start", message: { role: "assistant", content: [], timestamp: Date.now() } });
      emit({
        type: "message_update",
        message: { role: "assistant", content: [], timestamp: Date.now() },
        assistantMessageEvent: { type: "text_delta", delta: reply },
      });
      const final = assistant([{ type: "text", text: reply }]);
      emit({ type: "message_end", message: final });
      record(final);
    }
    emit({ type: "turn_end", message: { role: "assistant", content: [] }, toolResults: [] });
    emit({ type: "agent_end", messages: [] });
    emit({ type: "agent_settled" });
    // A provider answer confirms Fast (🟡 -> 🟢) once a request went out.
    if (!fastAccepted && fastStatus()?.endsWith("🟡")) {
      fastAccepted = true;
      emitFastStatus();
    }
    return;
  }

  if (command.type === "clone") {
    if (entries.some((entry) => entry.message?.content === "cancel-clone")) {
      respond(command, true, { cancelled: true });
      return;
    }
    cloneSessionFile();
    respond(command, true, { cancelled: false });
    return;
  }

  if (command.type === "get_fork_messages") {
    respond(command, true, { messages: entries.filter((entry) => entry.message?.role === "user").map((entry) => ({ entryId: entry.id, text: entry.message.content })) });
    return;
  }

  if (command.type === "fork") {
    const index = entries.findIndex((entry) => entry.id === command.entryId && entry.message?.role === "user");
    if (index === -1) {
      emit({ id: command.id, type: "response", command: "fork", success: false, error: `Entry ${command.entryId} not found` });
      return;
    }
    const text = entries[index].message.content;
    // An extension (session_before_fork) may veto: nothing changes.
    if (text.includes("cancel-fork")) {
      respond(command, true, { text, cancelled: true });
      return;
    }
    entries.length = index;
    forks += 1;
    respond(command, true, { text, cancelled: false });
    return;
  }

  if (command.type === "get_last_assistant_text") {
    const last = entries.findLast((entry) => entry.message?.role === "assistant" && Array.isArray(entry.message.content) && entry.message.content.some((part) => part.type === "text"));
    respond(command, true, { text: last ? last.message.content.filter((part) => part.type === "text").map((part) => part.text).join("\n") : null });
    return;
  }

  if (command.type === "get_commands") {
    respond(command, true, {
      commands: [
        { name: "fix-tests", description: "Fix failing tests", source: "prompt", location: "project", path: "/p/.pi/prompts/fix-tests.md" },
        { name: "skill:brave-search", description: "Web search via Brave API", source: "skill", location: "user" },
        { name: "session-info", source: "extension" },
        { name: "compact", description: "Colide com o built-in do Studio", source: "extension" },
        ...(process.env.FAKE_PI_STEER === "1" ? [{ name: "steer", description: "Envia uma mensagem a um subagente em execução", source: "extension" }] : []),
        ...(process.env.FAKE_PI_FAST === "1" ? [{ name: "fast", description: "Toggle OpenAI Codex Fast mode", source: "extension" }] : []),
      ],
    });
    return;
  }

  if (command.type === "bash") {
    startBash(command);
    return;
  }

  if (command.type === "abort_bash") {
    if (activeBash) finishBash(activeBash, true);
    respond(command);
    return;
  }

  if (command.type === "set_session_name") {
    sessionName = command.name;
    if (sessionFile) appendFileSync(sessionFile, JSON.stringify({ type: "session_info", id: `n${Date.now()}`, parentId: null, timestamp: new Date().toISOString(), name: command.name }) + "\n");
    respond(command);
    return;
  }

  if (command.type === "export_html") {
    respond(command, true, { path: command.outputPath || "/tmp/fake-session.html" });
    return;
  }

  if (command.type === "get_state") {
    respond(command, true, {
      model: fakeModel,
      thinkingLevel: "off",
      isStreaming: false,
      isCompacting: false,
      sessionFile,
      sessionId: forks ? `fake-session-fork-${forks}` : "fake-session",
      sessionName,
      messageCount: entries.length,
      pendingMessageCount: 0,
    });
    return;
  }

  if (command.type === "get_entries") {
    respond(command, true, { entries, leafId: entries.length ? entries[entries.length - 1].id : null });
    return;
  }

  if (command.type === "get_session_stats") {
    respond(command, true, {
      sessionFile: "/tmp/fake-sessions/fake-session.jsonl",
      sessionId: "fake-session",
      userMessages: 2,
      assistantMessages: 3,
      toolCalls: 5,
      toolResults: 5,
      totalMessages: 10,
      tokens: { input: 50000, output: 10000, cacheRead: 40000, cacheWrite: 5000, total: 105000 },
      cost: 0.45,
      contextUsage: { tokens: Number(process.env.FAKE_PI_CONTEXT_PERCENT || 30) * 2000, contextWindow: 200000, percent: Number(process.env.FAKE_PI_CONTEXT_PERCENT || 30) },
    });
    return;
  }

  if (command.type === "switch_session") {
    sessionFile = command.sessionPath;
    respond(command, true, { cancelled: false });
    return;
  }

  if (command.type === "new_session") {
    entries.length = 0;
    respond(command, true, { cancelled: false });
    return;
  }

  if (command.type === "compact") {
    const result = { summary: "Resumo: testes, fallback em lib.js e rotas mapeadas.", firstKeptEntryId: entries.at(-1)?.id ?? null, tokensBefore: 60000, estimatedTokensAfter: 12000, details: {} };
    emit({ type: "compaction_start", reason: "manual" });
    setTimeout(() => {
      entries.push({ type: "compaction", id: `e${entries.length + 1}`, parentId: entries.at(-1)?.id ?? null, timestamp: new Date().toISOString(), summary: result.summary, firstKeptEntryId: result.firstKeptEntryId, tokensBefore: result.tokensBefore });
      emit({ type: "compaction_end", reason: "manual", result, aborted: false, willRetry: false });
      respond(command, true, result);
    }, 600);
    return;
  }

  if (command.type === "get_available_models") {
    respond(command, true, { models: [{ provider: "fake", id: "fake-model", name: "Fake Model", reasoning: true }] });
    return;
  }

  if (command.type === "get_available_thinking_levels") {
    respond(command, true, { levels: ["off", "low", "medium", "high"] });
    return;
  }

  if (command.type === "extension_ui_response") {
    emit({ type: "response", command: "extension_ui_response", success: true, id: command.id });
    if (command.id === "fake-ui-1") {
      emit({ type: "extension_ui_request", id: "fake-notify", method: "notify", message: `Escolha: ${command.value ?? "cancelado"}`, notifyType: "info" });
      emit({ type: "agent_end", messages: [] });
    }
    return;
  }

  respond(command, true, { ok: true });
}

process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let newlineIndex = buffer.indexOf("\n");
  while (newlineIndex !== -1) {
    let line = buffer.slice(0, newlineIndex);
    buffer = buffer.slice(newlineIndex + 1);
    if (line.endsWith("\r")) line = line.slice(0, -1);
    if (line.trim()) {
      try {
        handle(JSON.parse(line));
      } catch (error) {
        emit({ type: "fake_error", message: error.message, line });
      }
    }
    newlineIndex = buffer.indexOf("\n");
  }
});
