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

function extensionHarness({ toolRenderer = true, keyed = false, entryCount = true } = {}) {
  const handlers = new Map();
  const commands = new Map();
  let resolver;
  let footerFactory;
  let getCommandsCalls = 0;
  let sdkRuntimeBound = false;
  let availableCommands = [{ name: "fast" }, { name: "maestro" }];
  let renderRequests = 0;
  let contextPercent = 50;
  let branchScans = 0;
  let contextReads = 0;
  const sessionManager = { getBranch() { branchScans++; return []; } };
  const keys = { session: "session-1", leaf: "leaf-1", count: 3 };
  if (keyed) {
    sessionManager.getSessionId = () => keys.session;
    sessionManager.getLeafId = () => keys.leaf;
    if (entryCount) sessionManager.getEntryCount = () => keys.count;
  }
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
    getThinkingLevel() { return this.thinkingLevel ?? "high"; },
  };
  const ctx = {
    mode: "tui", hasUI: true, cwd: ".", model: { id: "test-model" },
    getContextUsage() { contextReads++; return { percent: contextPercent }; },
    sessionManager,
    ui: {
      theme,
      setFooter(factory) { footerFactory = factory; },
      setWorkingIndicator() {}, setWorkingMessage() {}, setHiddenThinkingLabel() {},
      notify() {},
    },
  };
  if (!toolRenderer) delete pi.registerToolRenderer;
  ui.registerCleanUi(pi, () => path.join(agentRoot, ui.STATE_FILE_NAME));
  return {
    pi, ctx, handlers, commands, statuses,
    get resolver() { return resolver; },
    get getCommandsCalls() { return getCommandsCalls; },
    get renderRequests() { return renderRequests; },
    get branchScans() { return branchScans; },
    get contextReads() { return contextReads; },
    sessionManager,
    keys,
    setAvailableCommands(value) { availableCommands = value; },
    setContextPercent(value) { contextPercent = value; },
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
  for (const width of [6, 20, 40, 80, 160]) {
    for (const value of [-25, 0, 37.4, 100, 120, null, Number.NaN, Infinity]) {
      const line = ui.formatFooter({ model: "model-name", thinking: "high", contextPercent: value, branch: "feature" }, theme, width);
      assert.ok(ui.cellWidth(line) <= width, `${width}: ${line}`);
      assert.match(line, /model/);
    }
  }
  assert.doesNotMatch(ui.formatFooter({ contextPercent: Number.NaN }, theme, 120), /ctx/);
});

test("HUD footer shows only active modes, translates emoji statuses, and stays within widths", async () => {
  const harness = extensionHarness();
  await harness.handlers.get("session_start")({}, harness.ctx);
  harness.statuses.set("codex-fast-mode", "⚡ECO");
  harness.statuses.set("maestro", "OFF");
  harness.statuses.set("execution-mode", "MODE  YOLO · GLOBAL");
  harness.statuses.set("usuario", "EVOLVERA");
  harness.statuses.set("other-extension", "ready");
  const footer = harness.makeFooter();
  const lines = footer.render(160);
  assert.equal(harness.getCommandsCalls, 0, "footer no longer needs the command registry");
  assert.match(lines[0], /test-model/);
  assert.doesNotMatch(lines.join(" "), /\$/, "cost is not shown");
  const modes = lines.slice(1).join(" ");
  assert.match(modes, /ctx ━+ /);
  assert.match(modes, /⚡ECO/);
  assert.doesNotMatch(modes, /FAST|MAESTRO|unavailable|GLOBAL|MODE/);
  assert.match(modes, /YOLO/);
  assert.match(modes, /@EVOLVERA/);
  assert.match(modes, /other-extension ready/);
  assert.doesNotMatch(modes, /◈/, "default context mode shows nothing");
  harness.statuses.set("context-mode", "800K");
  assert.match(footer.render(160).slice(1).join(" "), /\d+%  ◈800K  ⚡ECO/, "high context mode follows the gauge");
  harness.statuses.delete("context-mode");
  harness.statuses.set("codex-fast-mode", "🚀🟢");
  harness.statuses.set("execution-mode", "MODE  AUTÔNOMO · SESSION");
  assert.match(footer.render(160).slice(1).join(" "), /🚀(?!·)/);
  assert.match(footer.render(160).slice(1).join(" "), /AUTÔNOMO·session/);
  harness.setContextPercent(Number.NaN);
  assert.match(footer.render(160)[1], /ctx ━+ --/);
  harness.setContextPercent(120);
  assert.match(footer.render(160)[1], /100%/);
  harness.setContextPercent(-2);
  assert.match(footer.render(160)[1], /0%/);
  harness.setContextPercent(50);
  for (const width of [6, 20, 40, 80, 160]) {
    const rendered = footer.render(width);
    assert.equal(rendered.length, 2, `footer is always exactly two lines at width ${width}`);
    assert.ok(rendered.every((line) => ui.cellWidth(line) <= width), `footer exceeds width ${width}`);
    assert.match(footer.render(width).join(" "), /ctx/);
  }
  harness.statuses.clear();
  assert.doesNotMatch(harness.makeFooter().render(160).join(" "), /fast|maestro|unavailable/i);
  await harness.handlers.get("model_select")({}, harness.ctx);
  await harness.handlers.get("thinking_level_select")({}, harness.ctx);
  await harness.handlers.get("session_compact")({}, harness.ctx);
  assert.equal(harness.renderRequests, 3);
});

test("SDK without tool-renderer middleware retains native cards and the account footer", async () => {
  const h = extensionHarness({ toolRenderer: false });
  assert.equal(h.resolver, undefined, "native tool rendering remains untouched");
  assert.ok(h.commands.has("clean-ui"));
  await h.handlers.get("session_start")({}, h.ctx);
  h.statuses.set("usuario", "EVOLVERA");
  const footer = h.makeFooter();
  assert.match(footer.render(160).join(" "), /@EVOLVERA/);
  assert.match(footer.render(160).join(" "), /test-model/);
  for (const width of [6, 20, 40, 80, 160]) {
    assert.ok(footer.render(width).every((line) => ui.cellWidth(line) <= width));
  }
});

test("mode labels keep extra detail and long external status tokens stay bounded", async () => {
  const harness = extensionHarness();
  await harness.handlers.get("session_start")({}, harness.ctx);
  harness.statuses.set("codex-fast-mode", "ON");
  harness.statuses.set("maestro", "routing xhigh");
  harness.statuses.set("a-very-long-extension-status-key-with-no-break", "a-very-long-status-value-with-no-break");
  const footer = harness.makeFooter();
  assert.match(footer.render(160).join(" "), /⚡/);
  assert.match(footer.render(160).join(" "), /MAESTRO·routing xhigh/);
  assert.equal(ui.cellWidth("⚡"), 2, "lightning is measured as a wide glyph");
  for (const width of [6, 20, 40, 80, 160]) {
    assert.equal(footer.render(width).length, 2);
    assert.ok(footer.render(width).every((line) => ui.cellWidth(line) <= width));
  }
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

test("redrawing an old reopen card cannot re-announce an already completed todo", () => {
  const harness = extensionHarness();
  const renderers = harness.resolver("todo", () => ({}));
  const options = { isPartial: false, expanded: false };
  const result = { content: [{ type: "text", text: "synthetic success" }] };
  const reopened = renderContext({ action: "update", id: 81, status: "in_progress" });
  renderers.renderCall(reopened.args, theme, reopened);
  renderers.renderResult(result, options, theme, reopened);
  const finished = renderContext({ action: "update", id: 81, status: "completed" });
  const finishedCall = renderers.renderCall(finished.args, theme, finished);
  renderers.renderResult(result, options, theme, finished);
  assert.match(finishedCall.render(80).join(""), /todo/);
  renderers.renderResult(result, { ...options, expanded: true }, theme, reopened);
  const duplicate = renderContext(finished.args);
  const duplicateCall = renderers.renderCall(duplicate.args, theme, duplicate);
  renderers.renderResult(result, options, theme, duplicate);
  assert.deepEqual(duplicateCall.render(80), [], "repaint is not a new reopening transition");
});

test("new-session lifecycle resets only the UI todo deduplication", async () => {
  const harness = extensionHarness();
  await harness.handlers.get("session_start")({}, harness.ctx);
  const renderers = harness.resolver("todo", () => ({}));
  const args = { action: "update", id: 91, status: "completed" };
  const result = { content: [{ type: "text", text: "finished" }] };
  const before = structuredClone(result);
  const show = () => {
    const ctx = renderContext(args);
    const call = renderers.renderCall(args, theme, ctx);
    renderers.renderResult(result, { isPartial: false, expanded: false }, theme, ctx);
    return call.render(80);
  };
  assert.match(show().join(""), /todo/);
  assert.deepEqual(show(), []);
  await harness.handlers.get("session_start")({}, harness.ctx);
  assert.match(show().join(""), /todo/, "IDs from another session cannot suppress this session");
  assert.deepEqual(result, before);
});

test("image results delegate unchanged to stock while the Unicode header finishes", () => {
  const result = { content: [{ type: "text", text: "synthetic image" }, { type: "image", data: "synthetic", mimeType: "image/png" }] };
  const before = structuredClone(result);
  const options = { isPartial: false, expanded: false };
  for (const toolName of ["read", "todo"]) {
    let forwarded;
    const stockComponent = component(["stock image"]);
    const stock = { renderResult(...args) { forwarded = args; return stockComponent; } };
    const harness = extensionHarness();
    const renderers = toolName === "todo" ? harness.resolver(toolName, () => stock) : ui.createCardRenderers(toolName, stock);
    const ctx = renderContext({ action: "get", path: "synthetic.png" });
    ctx.lastComponent = component(["previous component"]);
    const call = renderers.renderCall(ctx.args, theme, ctx);
    assert.equal(renderers.renderResult(result, options, theme, ctx), stockComponent);
    assert.equal(forwarded[0], result);
    assert.equal(forwarded[1], options);
    assert.equal(forwarded[2], theme);
    assert.notEqual(forwarded[3].state, ctx.state, "stock rendering keeps its own per-card state");
    assert.equal(forwarded[3].lastComponent, undefined);
    assert.match(call.render(80).join(""), new RegExp(`✓ ${toolName}`), "finished image must not remain a running spinner");
    assert.deepEqual(result, before);
  }
});

test("collapsed edit cards show a bounded framed diff, delta summary, and visible errors", () => {
  const diff = "--- before\n+++ after\n context\n-old line\n+new 界";
  const data = { toolName: "edit", args: { path: "src/file.ts" }, cwd: ".", result: { content: [{ type: "text", text: "File updated" }], details: { diff } }, partial: false, isError: false };
  assert.equal(ui.diffStats(diff).added, 1);
  assert.equal(ui.diffStats(diff).removed, 1);
  assert.match(ui.renderHeader(data, theme, 80), /✓ edit  src\/file.ts  \+1 -1/);
  const preview = ui.renderBody(data, theme, 80, false);
  assert.match(preview[0], /╭/);
  assert.match(preview[3], /│  context/);
  assert.match(preview[4], /│ -old line/);
  assert.match(preview[5], /│ \+new 界/);
  assert.match(preview.at(-1), /╰/);
  for (const width of [6, 20, 40, 80, 160]) {
    const rows = ui.renderBody(data, theme, width, false);
    assert.ok(rows.every((line) => ui.cellWidth(ui.stripControl(line)) <= width), `edit preview exceeds ${width}`);
    if (width <= 8) assert.ok(rows.every((line) => !/[╭│╰]/.test(line)), "narrow preview drops borders");
  }
  const largeDiff = Array.from({ length: 50 }, (_, i) => `${i % 2 ? "+" : "-"}line-${i}`).join("\n");
  const bounded = ui.renderBody({ ...data, result: { details: { diff: largeDiff } } }, theme, 40, false);
  assert.equal(bounded.length, ui.MAX_EXPANDED_LINES + 3, "20 diff rows plus skip label and two frame edges");
  assert.match(bounded.join("\n"), /more lines/);
  const error = { ...data, isError: true, result: { content: [{ type: "text", text: "edit failed\nCommand exited with code 2" }], details: { diff } } };
  assert.deepEqual(ui.renderBody(error, theme, 40, false), ["  ╰ edit failed"]);
});

test("ANSI-colored Unicode cards retain terminal cell-width bounds", () => {
  const ansiTheme = { fg: (_color, text) => `\u001b[31m${text}\u001b[0m`, bold: (text) => `\u001b[1m${text}\u001b[22m` };
  const data = { toolName: "edit", args: { path: "界.ts" }, result: { details: { diff: "-old\n+new 界" } }, partial: false, isError: false };
  for (const width of [6, 20, 40, 80, 160]) {
    for (const line of [ui.renderHeader(data, ansiTheme, width), ...ui.renderBody(data, ansiTheme, width, false)]) {
      assert.ok(ui.cellWidth(ui.stripControl(line)) <= width, `${width}: ${line}`);
    }
  }
  assert.ok(ui.renderBody(data, ansiTheme, 40, false).some((line) => line.includes("\u001b[31m")));
});

test("expanded output keeps head or shell tail, caps lines, and clips narrow cells", () => {
  assert.equal(ui.MAX_EXPANDED_LINES, 20, "preserve the installed baseline output cap");
  const text = Array.from({ length: 100 }, (_, i) => `line-${String(i).padStart(3, "0")} ${"x".repeat(120)}`).join("\n");
  const result = { content: [{ type: "text", text }] };
  const before = structuredClone(result);
  for (const toolName of ["read", "bash", "powershell"]) {
    const data = { toolName, result, partial: false, isError: false };
    const expanded = ui.renderBody(data, theme, 80, true);
    assert.equal(expanded.length, 21);
    if (toolName === "read") {
      assert.match(expanded[0], /line-000/);
      assert.match(expanded[19], /line-019/);
      assert.match(expanded[20], /80 more lines/);
    } else {
      assert.match(expanded[0], /80 earlier lines/);
      assert.match(expanded[1], /line-080/);
      assert.match(expanded[20], /line-099/);
    }
    for (const width of [6, 20, 80]) assert.ok(ui.renderBody(data, theme, width, true).every((line) => ui.cellWidth(line) <= width));
    assert.deepEqual(ui.renderBody(data, theme, 80, false), []);
  }
  assert.deepEqual(result, before);
});

test("completed card redraw caches output but refreshes on updates, layout, and invalidation", () => {
  let textReads = 0;
  const result = { content: [{ type: "text", get text() { textReads++; return "cached output"; } }] };
  const args = { command: "first" };
  let themeWork = 0;
  const countingTheme = { fg(color, text) { themeWork++; return text; }, bold(text) { themeWork++; return text; } };
  const renderers = ui.createCardRenderers("bash", undefined);
  const ctx = renderContext(args);
  const call = renderers.renderCall(args, countingTheme, ctx);
  const body = renderers.renderResult(result, { expanded: true }, countingTheme, ctx);
  call.render(80);
  body.render(80);
  const readsAfterFirst = textReads;
  const themeAfterFirst = themeWork;
  for (let i = 0; i < 5; i++) { call.render(80); body.render(80); }
  assert.equal(textReads, readsAfterFirst, "unchanged redraw must not reread full result");
  assert.equal(themeWork, themeAfterFirst, "unchanged redraw must not redo theme work");
  args.command = "mutated argument";
  result.content = [{ type: "text", text: "mutated result" }];
  const updatedBody = renderers.renderResult(result, { expanded: true }, countingTheme, ctx);
  assert.match(call.render(80).join(""), /mutated argument/);
  assert.match(updatedBody.render(80).join(""), /mutated result/);
  const workBeforeResize = themeWork;
  updatedBody.render(40);
  assert.ok(themeWork > workBeforeResize, "a new width recomputes the layout");
  const collapsed = renderers.renderResult(result, { expanded: false }, countingTheme, ctx);
  assert.deepEqual(collapsed.render(80), []);
  updatedBody.render(40);
  updatedBody.invalidate();
  const workBeforeInvalidate = themeWork;
  updatedBody.render(40);
  assert.ok(themeWork > workBeforeInvalidate, "explicit invalidation forces theme work");
});

test("footer memoizes only history-derived stats with complete public keys", async () => {
  const h = extensionHarness({ keyed: true });
  await h.handlers.get("session_start")({}, h.ctx);
  const footer = h.makeFooter();
  footer.render(160);
  footer.render(160);
  assert.equal(h.contextReads, 1);
  h.keys.count++;
  footer.render(160);
  assert.equal(h.contextReads, 2);
  h.keys.leaf = "leaf-2";
  footer.render(160);
  assert.equal(h.contextReads, 3);
  h.keys.session = "session-2";
  footer.render(160);
  assert.equal(h.contextReads, 4);
  const priorManager = h.ctx.sessionManager;
  h.ctx.sessionManager = { ...priorManager };
  footer.render(160);
  assert.equal(h.contextReads, 5, "manager identity participates in the cache key");
  h.ctx.model = { id: "other", contextWindow: 4096 };
  footer.render(160);
  assert.equal(h.contextReads, 6);
  h.ctx.model.contextWindow = 8192;
  footer.render(160);
  assert.equal(h.contextReads, 7);
  await h.handlers.get("session_compact")({}, h.ctx);
  footer.render(160);
  assert.equal(h.contextReads, 8, "compaction explicitly invalidates history stats");
});

test("todo call invalidation reaches its nested themed card", () => {
  let palette = "blue";
  const mutableTheme = { fg: (_color, text) => `${palette}:${text}`, bold: text => `${palette}:${text}` };
  const h = extensionHarness();
  const renderers = h.resolver("todo", () => ({}));
  const args = { action: "update", id: 301, status: "completed" };
  const ctx = renderContext(args);
  const call = renderers.renderCall(args, mutableTheme, ctx);
  renderers.renderResult({ content: [{ type: "text", text: "done" }] }, { isPartial: false }, mutableTheme, ctx);
  assert.match(call.render(80).join(""), /blue:/);
  palette = "green";
  call.invalidate();
  const redraw = call.render(80).join("");
  assert.match(redraw, /green:/);
  assert.doesNotMatch(redraw, /blue:/);
});

test("footer memoizes with session and leaf keys when entry count is unavailable", async () => {
  const h = extensionHarness({ keyed: true, entryCount: false });
  await h.handlers.get("session_start")({}, h.ctx);
  const footer = h.makeFooter();
  footer.render(160);
  footer.render(160);
  assert.equal(h.contextReads, 1);
  h.keys.leaf = "older-sdk-leaf";
  footer.render(160);
  assert.equal(h.contextReads, 2);
  h.keys.session = "older-sdk-session";
  footer.render(160);
  assert.equal(h.contextReads, 3);
});

test("model selection invalidates context stats even when visible model and leaf keys are unchanged", async () => {
  const h = extensionHarness({ keyed: true });
  await h.handlers.get("session_start")({}, h.ctx);
  const footer = h.makeFooter();
  assert.match(footer.render(160).join(" "), /50%/);
  h.setContextPercent(73);
  await h.handlers.get("model_select")({}, h.ctx);
  assert.match(footer.render(160).join(" "), /73%/);
  assert.equal(h.contextReads, 2);
});

test("footer falls back to live history reads without keys and keeps dynamic chrome live", async () => {
  const h = extensionHarness();
  await h.handlers.get("session_start")({}, h.ctx);
  const footer = h.makeFooter();
  footer.render(160);
  footer.render(160);
  assert.equal(h.contextReads, 2);
  h.pi.getThinkingLevel = () => "low";
  h.statuses.set("live-status", "changed");
  h.setAvailableCommands([]);
  const dynamic = footer.render(160).join(" ");
  assert.match(dynamic, /low/);
  assert.match(dynamic, /live-status changed/);
  assert.doesNotMatch(dynamic, /unavailable/);
});

console.log(`clean-ui isolated fixture retained at ${runRoot}`);


test("working art has constant-width colored Unicode phases and uses the existing native indicator", async () => {
  const palette = { muted: 2, accent: 36, warning: 33 };
  const colorTheme = { fg: (color, text) => `\x1b[${palette[color]}m${text}\x1b[0m`, bold: text => text };
  const frames = ui.coloredWorkingFrames(colorTheme);
  assert.equal(frames.length, 8);
  assert.equal(new Set(frames).size, 8);
  for (const frame of frames) {
    assert.equal([...frame.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")].length, 8);
    assert.match(frame, /◆/);
    assert.match(frame, /━/);
    assert.match(frame, /\x1b\[2m/);
    assert.match(frame, /\x1b\[36m/);
    assert.ok(frame.endsWith("\x1b[0m"));
      assert.ok(!frame.includes(String.fromCharCode(13)) && !frame.includes(String.fromCharCode(10)));
  }
  assert.ok(frames.some(frame => frame.includes("\x1b[33m◆")));
  const h = extensionHarness();
  const received = [];
  h.ctx.ui.theme = colorTheme;
  h.ctx.ui.setWorkingIndicator = options => received.push(options);
  await h.handlers.get("session_start")({}, h.ctx);
  assert.deepEqual(received[0], { frames, intervalMs: 125 });
  await h.commands.get("clean-ui").handler("off", h.ctx);
  assert.equal(received.at(-1), undefined);
  received.length = 0;
  await h.commands.get("clean-ui").handler("on", { ...h.ctx, mode: "rpc", hasUI: false });
  assert.equal(received.length, 0);
});
