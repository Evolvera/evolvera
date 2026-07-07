#!/usr/bin/env node
process.stdin.setEncoding("utf8");
let buffer = "";

function emit(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function respond(command, success = true, data = undefined) {
  emit({ id: command.id, type: "response", command: command.type, success, ...(data === undefined ? {} : { data }) });
}

function handle(command) {
  if (command.type === "prompt") {
    respond(command);
    emit({ type: "agent_start" });
    emit({ type: "turn_start" });
    emit({ type: "message_start", message: { role: "assistant", content: [], timestamp: Date.now() } });
    emit({
      type: "message_update",
      message: { role: "assistant", content: [], timestamp: Date.now() },
      assistantMessageEvent: { type: "text_delta", delta: `Fake PI: ${command.message}` },
    });
    emit({
      type: "message_end",
      message: {
        role: "assistant",
        content: [{ type: "text", text: `Fake PI: ${command.message}` }],
        provider: "fake",
        model: "fake-model",
        usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { total: 0 } },
        stopReason: "stop",
        timestamp: Date.now(),
      },
    });
    emit({ type: "turn_end", message: { role: "assistant", content: [] }, toolResults: [] });
    emit({ type: "agent_end", messages: [] });
    return;
  }

  if (command.type === "get_state") {
    respond(command, true, {
      model: { provider: "fake", id: "fake-model" },
      thinkingLevel: "off",
      isStreaming: false,
      isCompacting: false,
      sessionFile: undefined,
      sessionId: "fake-session",
      sessionName: "fake",
      messageCount: 1,
      pendingMessageCount: 0,
    });
    return;
  }

  if (command.type === "get_available_models") {
    respond(command, true, { providers: [{ name: "fake", models: [{ id: "fake-model", name: "Fake Model" }] }] });
    return;
  }

  if (command.type === "extension_ui_response") {
    emit({ type: "response", command: "extension_ui_response", success: true, id: command.id });
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
