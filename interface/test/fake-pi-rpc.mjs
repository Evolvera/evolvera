#!/usr/bin/env node
// Deterministic stand-in for `pi --mode rpc` (never calls a model).
// Prompt "tools" streams thinking + tool executions; prompt "ui" asks an extension dialog.
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

function handle(command) {
  if (command.type === "test_exit") {
    process.exit(Number.isInteger(command.code) ? command.code : 0);
  }

  if (command.type === "prompt") {
    respond(command);
    emit({ type: "agent_start" });
    emit({ type: "turn_start" });
    const user = { role: "user", content: command.message, timestamp: Date.now() };
    emit({ type: "message_start", message: user });
    emit({ type: "message_end", message: user });
    record(user);
    if (command.message === "ui") {
      emit({ type: "extension_ui_request", id: "fake-ui-1", method: "select", title: "Permitir?", options: ["Permitir", "Bloquear"] });
      return;
    }
    if (command.message === "demo") {
      streamDemo(command);
      return;
    }
    if (command.message === "tools") {
      streamTools(command);
    } else {
      emit({ type: "message_start", message: { role: "assistant", content: [], timestamp: Date.now() } });
      emit({
        type: "message_update",
        message: { role: "assistant", content: [], timestamp: Date.now() },
        assistantMessageEvent: { type: "text_delta", delta: `Fake PI: ${command.message}` },
      });
      const final = assistant([{ type: "text", text: `Fake PI: ${command.message}` }]);
      emit({ type: "message_end", message: final });
      record(final);
    }
    emit({ type: "turn_end", message: { role: "assistant", content: [] }, toolResults: [] });
    emit({ type: "agent_end", messages: [] });
    return;
  }

  if (command.type === "get_state") {
    respond(command, true, {
      model: { provider: "fake", id: "fake-model", name: "Fake Model", reasoning: true, contextWindow: 200000 },
      thinkingLevel: "off",
      isStreaming: false,
      isCompacting: false,
      sessionFile: undefined,
      sessionId: "fake-session",
      sessionName: "fake",
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
    respond(command, true, { sessionId: "fake-session", tokens: { total: 2 }, cost: 0, contextUsage: { tokens: 60000, contextWindow: 200000, percent: 30 } });
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
