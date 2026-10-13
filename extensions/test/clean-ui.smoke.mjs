import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

// This harness imports only a copied extension and its run-owned SDK stub. It never resolves the
// installed SDK or reads the user's Pi configuration.
const runRoot = mkdtempSync(path.join(os.tmpdir(), "clean-ui-smoke-"));
const agentRoot = path.join(runRoot, "agent-home");
const fakePackage = path.join(runRoot, "node_modules", "@earendil-works", "pi-coding-agent");
const copiedExtension = path.join(runRoot, "extensions", "clean-ui.ts");
mkdirSync(path.dirname(copiedExtension), { recursive: true });
mkdirSync(fakePackage, { recursive: true });
mkdirSync(agentRoot, { recursive: true });
copyFileSync(new URL("../clean-ui.ts", import.meta.url), copiedExtension);
writeFileSync(path.join(fakePackage, "package.json"), JSON.stringify({ name: "@earendil-works/pi-coding-agent", type: "module", exports: "./index.js" }));
writeFileSync(path.join(fakePackage, "index.js"), `export function getAgentDir() { return process.env.PI_CODING_AGENT_DIR; }\n`);
for (const key of ["HOME", "USERPROFILE", "PI_CODING_AGENT_DIR", "TEMP", "TMP", "TMPDIR", "XDG_CACHE_HOME"]) {
  process.env[key] = key === "PI_CODING_AGENT_DIR" ? agentRoot : path.join(runRoot, key.toLowerCase());
}

const ui = await import(pathToFileURL(copiedExtension).href);
const theme = { fg: (_color, text) => text, bold: (text) => text };
const component = (lines = []) => ({ render: () => lines, invalidate() {} });

function extensionHarness() {
  const handlers = new Map();
  const commands = new Map();
  let resolver;
  let footerFactory;
  let getCommandsCalls = 0;
  let sdkRuntimeBound = false;
  let availableCommands = [{ name: "fast" }, { name: "maestro" }];
  let renderRequests = 0;
  const statuses = new Map();
  const pi = {
    registerToolRenderer(value) { resolver = value; },
    on(name, handler) {
      handlers.set(name, async (...args) => {
        if (name === "session_start") sdkRuntimeBound = true;
        return handler(...args);
      });
    },
    registerCommand(name, value) { commands.set(name, value); },
    getCommands() {
      if (!sdkRuntimeBound) throw new Error("Extension runtime not initialized. Action methods cannot be called during extension loading.");
      getCommandsCalls++;
      return availableCommands;
    },
    getThinkingLevel() { return "high"; },
  };
  const ctx = {
    mode: "tui", hasUI: true, cwd: ".", model: { id: "test-model" },
    getContextUsage() { return { percent: 50 }; },
    sessionManager: { getBranch() { return []; } },
    ui: {
      theme,
      setFooter(factory) { footerFactory = factory; },
      setWorkingIndicator() {}, setWorkingMessage() {}, setHiddenThinkingLabel() {},
      notify() {},
    },
  };
  ui.registerCleanUi(pi, () => path.join(agentRoot, ui.STATE_FILE_NAME));
  return {
    pi, ctx, handlers, commands, statuses,
    get resolver() { return resolver; },
    get getCommandsCalls() { return getCommandsCalls; },
    get renderRequests() { return renderRequests; },
    setAvailableCommands(value) { availableCommands = value; },
    makeFooter() {
      assert.ok(footerFactory, "session_start should install footer");
      return footerFactory({ requestRender() { renderRequests++; } }, theme, {
        getGitBranch: () => "main",
        getExtensionStatuses: () => statuses,
        onBranchChange: () => () => {},
      });
    },
    get footerFactory() { return footerFactory; },
  };
}

function renderContext(args = {}, isError = false) {
  return { state: {}, args, cwd: ".", executionStarted: true, isError };
}

test("preserves Unicode clean cards, clipping, errors, images and renderer results", () => {
  const data = { toolName: "bash", args: { command: "echo hi" }, result: { content: [{ type: "text", text: "hello\n" }] }, partial: false, isError: false };
  const before = structuredClone(data.result);
  assert.match(ui.renderHeader(data, theme, 30), /✓ bash/);
  assert.deepEqual(ui.renderBody(data, theme, 30, true), ["  ╰ hello"]);
  assert.deepEqual(data.result, before, "rendering must not mutate model-visible result content");
  const error = { ...data, isError: true, result: { content: [{ type: "text", text: "Oops\nCommand exited with code 2" }] } };
  assert.deepEqual(ui.renderBody(error, theme, 30, false), ["  ╰ Oops"]);
  assert.equal(ui.hasImage({ content: [{ type: "image", data: "synthetic" }] }), true);
  assert.equal(ui.shouldCollapse("bash", undefined), true);
  assert.equal(ui.shouldCollapse("custom", { renderCall() {} }), false);
});

test("context footer clamps finite values, marks unknown, and stays within responsive widths", () => {
  for (const width of [20, 40, 80, 120, 160]) {
    for (const value of [-25, 0, 37.4, 100, 120, null, Number.NaN, Infinity]) {
      const line = ui.formatFooter({ model: "model-name", thinking: "high", contextPercent: value, cost: 0.25, branch: "feature" }, theme, width);
      assert.ok(ui.cellWidth(line) <= width, `${width}: ${line}`);
    }
  }
  assert.match(ui.formatFooter({ contextPercent: Number.NaN }, theme, 120), /ctx \[----/);
  assert.match(ui.formatFooter({ contextPercent: 120 }, theme, 120), /100%/);
  assert.match(ui.formatFooter({ contextPercent: -2 }, theme, 120), /0%/);
});

test("footer queries commands only after session runtime binding and preserves owner/other statuses", async () => {
  const harness = extensionHarness();
  assert.equal(harness.getCommandsCalls, 0, "factory must not query commands");
  await harness.handlers.get("session_start")({}, harness.ctx);
  assert.equal(harness.getCommandsCalls, 0, "session_start only binds presentation");
  harness.statuses.set("codex-fast-mode", "ON");
  harness.statuses.set("maestro", "OFF");
  harness.statuses.set("other-extension", "ready");
  const footer = harness.makeFooter();
  const lines = footer.render(160);
  assert.equal(harness.getCommandsCalls, 1, "commands are read during footer rendering only");
  assert.match(lines[0], /ctx \[/);
  assert.match(lines[1], /fast ON/);
  assert.match(lines[1], /maestro OFF/);
  assert.match(lines[1], /other-extension ready/);
  for (const width of [20, 40, 80, 120, 160]) {
    assert.ok(footer.render(width).every((line) => ui.cellWidth(line) <= width), `footer exceeds width ${width}`);
  }
  harness.statuses.clear();
  harness.setAvailableCommands([]);
  assert.match(harness.makeFooter().render(160).join(" "), /fast --\/unavailable/);
  assert.match(harness.makeFooter().render(160).join(" "), /maestro --\/unavailable/);
  await harness.handlers.get("model_select")({}, harness.ctx);
  await harness.handlers.get("thinking_level_select")({}, harness.ctx);
  await harness.handlers.get("session_compact")({}, harness.ctx);
  assert.equal(harness.renderRequests, 3);
});

test("mode labels include explicit ON and long external status tokens stay bounded", async () => {
  const harness = extensionHarness();
  await harness.handlers.get("session_start")({}, harness.ctx);
  harness.statuses.set("codex-fast-mode", "ECO");
  harness.statuses.set("maestro", "routing xhigh");
  harness.statuses.set("a-very-long-extension-status-key-with-no-break", "a-very-long-status-value-with-no-break");
  const footer = harness.makeFooter();
  assert.match(footer.render(160).join(" "), /fast ON.*ECO/);
  assert.match(footer.render(160).join(" "), /maestro ON.*routing/);
  for (const width of [20, 40, 80, 120, 160]) assert.ok(footer.render(width).every((line) => ui.cellWidth(line) <= width));
});

test("a completed todo stays visible on redraw and can be announced after reopening", () => {
  const harness = extensionHarness();
  const renderers = harness.resolver("todo", () => ({}));
  const result = { content: [{ type: "text", text: "done" }] };
  const options = { isPartial: false, expanded: false };
  const doneArgs = { action: "update", id: 73, status: "completed" };
  const ctx = renderContext(doneArgs);
  const call = renderers.renderCall(doneArgs, theme, ctx);
  renderers.renderResult(result, options, theme, ctx);
  assert.match(call.render(80).join(""), /todo/);
  renderers.renderResult(result, { ...options, expanded: true }, theme, ctx);
  assert.match(call.render(80).join(""), /todo/, "redrawing the SAME completed card must not hide it");
  const reopenArgs = { action: "update", id: 73, status: "in_progress" };
  const reopen = renderContext(reopenArgs);
  renderers.renderCall(reopenArgs, theme, reopen);
  renderers.renderResult({ content: [{ type: "text", text: "reopened" }] }, options, theme, reopen);
  const again = renderContext(doneArgs);
  const againCall = renderers.renderCall(doneArgs, theme, again);
  renderers.renderResult(result, options, theme, again);
  assert.match(againCall.render(80).join(""), /todo/, "a NEW completion after successful reopening is visible");
});

test("todo reads and successful intermediate calls are silent; mutations, completion and errors remain visible", () => {
  const harness = extensionHarness();
  const renderers = harness.resolver("todo", () => ({ renderCall: () => component(["stock"]), renderResult: () => component(["stock result"]) }));
  const listArgs = { action: "list" };
  const listContext = renderContext(listArgs);
  const listCall = renderers.renderCall(listArgs, theme, listContext);
  const listResult = renderers.renderResult({ content: [{ type: "text", text: "todos" }] }, { isPartial: false, expanded: false }, theme, listContext);
  assert.deepEqual(listCall.render(80), []);
  assert.deepEqual(listResult.render(80), []);

  const createArgs = { action: "create", title: "write smoke test" };
  const createContext = renderContext(createArgs);
  const createCall = renderers.renderCall(createArgs, theme, createContext);
  assert.deepEqual(createCall.render(80), [], "call remains hidden until successful final result");
  const createResult = renderers.renderResult({ content: [{ type: "text", text: "created" }] }, { isPartial: false, expanded: false }, theme, createContext);
  assert.match(createCall.render(80).join(""), /todo/);
  assert.deepEqual(createResult.render(80), []);

  const partialArgs = { action: "update", id: "42", status: "completed" };
  const partialContext = renderContext(partialArgs);
  renderers.renderCall(partialArgs, theme, partialContext);
  const partial = renderers.renderResult({ content: [{ type: "text", text: "partial" }] }, { isPartial: true, expanded: false }, theme, partialContext);
  assert.deepEqual(partial.render(80), [], "partial update is not recorded as a completed result");

  const doneArgs = { action: "update", id: "42", status: "completed" };
  const doneContext = renderContext(doneArgs);
  const doneCall = renderers.renderCall(doneArgs, theme, doneContext);
  const doneResult = renderers.renderResult({ content: [{ type: "text", text: "done" }] }, { isPartial: false, expanded: false }, theme, doneContext);
  assert.match(doneCall.render(80).join(""), /todo/);
  assert.deepEqual(doneResult.render(80), []);
  const repeatContext = renderContext(doneArgs);
  renderers.renderCall(doneArgs, theme, repeatContext);
  const repeated = renderers.renderResult({ content: [{ type: "text", text: "done again" }] }, { isPartial: false, expanded: false }, theme, repeatContext);
  assert.deepEqual(repeated.render(80), [], "same completed ID does not spam success cards");

  const errorContext = renderContext({ action: "get", id: "42" }, true);
  const errorCall = renderers.renderCall(errorContext.args, theme, errorContext);
  const errorResult = renderers.renderResult({ content: [{ type: "text", text: "lookup failed" }] }, { isPartial: false, expanded: false }, theme, errorContext);
  assert.match(errorCall.render(80).join(""), /todo/);
  assert.deepEqual(errorResult.render(80), ["  ╰ lookup failed"], "todo errors remain visible even for read actions");
});

test("clean-ui on/off/status persistence remains scoped to the run-owned fake agent directory", async () => {
  const harness = extensionHarness();
  await harness.handlers.get("session_start")({}, harness.ctx);
  const command = harness.commands.get("clean-ui");
  await command.handler("status", harness.ctx);
  await command.handler("off", harness.ctx);
  assert.deepEqual(JSON.parse(readFileSync(path.join(agentRoot, ui.STATE_FILE_NAME), "utf8")), { enabled: false });
  const stock = { renderCall: () => component(["stock"]) };
  assert.equal(harness.resolver("bash", () => stock), stock);
  await command.handler("on", harness.ctx);
  assert.deepEqual(JSON.parse(readFileSync(path.join(agentRoot, ui.STATE_FILE_NAME), "utf8")), { enabled: true });
  assert.equal(harness.resolver("bash", () => stock).renderShell, "self");
});

console.log(`clean-ui isolated fixture retained at ${runRoot}`);
