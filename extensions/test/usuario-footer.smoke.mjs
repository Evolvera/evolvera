import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

// Import copied sources with an owned SDK stub; never resolve installed SDK or user configuration.
const runRoot = mkdtempSync(path.join(os.tmpdir(), "usuario-footer-smoke-"));
const agentRoot = path.join(runRoot, "agent-home");
const fakePackage = path.join(runRoot, "node_modules", "@earendil-works", "pi-coding-agent");
const copiedExtensions = path.join(runRoot, "extensions");
mkdirSync(fakePackage, { recursive: true });
mkdirSync(copiedExtensions, { recursive: true });
mkdirSync(agentRoot, { recursive: true });
for (const name of ["usuario.ts", "clean-ui.ts"]) {
  copyFileSync(new URL(`../${name}`, import.meta.url), path.join(copiedExtensions, name));
}
writeFileSync(path.join(fakePackage, "package.json"), JSON.stringify({ name: "@earendil-works/pi-coding-agent", type: "module", exports: "./index.js" }));
writeFileSync(path.join(fakePackage, "index.js"), `export function getAgentDir() { return process.env.PI_CODING_AGENT_DIR; }\n`);
for (const key of ["HOME", "USERPROFILE", "PI_CODING_AGENT_DIR", "TEMP", "TMP", "TMPDIR", "XDG_CACHE_HOME"]) {
  process.env[key] = key === "PI_CODING_AGENT_DIR" ? agentRoot : path.join(runRoot, key.toLowerCase());
}
const usuario = await import(pathToFileURL(path.join(copiedExtensions, "usuario.ts")).href);
const cleanUi = await import(pathToFileURL(path.join(copiedExtensions, "clean-ui.ts")).href);
const theme = { fg: (_color, text) => text, bold: (text) => text };

function harness(label, managed = label !== undefined) {
  const handlers = new Map();
  const commands = new Map();
  const statuses = new Map();
  const messages = [];
  const controlCalls = [];
  let footerFactory;
  const pi = {
    on(name, handler) { handlers.set(name, [...(handlers.get(name) ?? []), handler]); },
    registerCommand(name, command) { commands.set(name, command); },
    registerToolRenderer() {},
    sendMessage(message) { messages.push(message); },
    getCommands() { return [{ name: "fast" }, { name: "maestro" }]; },
    getThinkingLevel() { return "high"; },
  };
  const ctx = {
    mode: "tui", hasUI: true, cwd: ".", model: { id: "synthetic-model" },
    getContextUsage() { return { percent: 50 }; },
    sessionManager: { getBranch() { return []; } },
    ui: {
      theme,
      setStatus(key, value) { if (value === undefined) statuses.delete(key); else statuses.set(key, value); },
      setFooter(factory) { footerFactory = factory; },
      setWorkingIndicator() {}, setWorkingMessage() {}, setHiddenThinkingLabel() {},
      notify() {},
    },
  };
  const control = managed ? Object.freeze({ ...(label === undefined ? {} : { label }), async execute(request) { controlCalls.push(request); return undefined; } }) : undefined;
  usuario.createUsuarioFactory(control)(pi);
  cleanUi.registerCleanUi(pi, () => path.join(agentRoot, cleanUi.STATE_FILE_NAME));
  return {
    ctx, handlers, commands, statuses, messages, controlCalls,
    async startSession() {
      for (const handler of handlers.get("session_start") ?? []) await handler({}, ctx);
    },
    render(width) {
      assert.ok(footerFactory, "clean-ui installs its footer during session_start");
      return footerFactory({ requestRender() {} }, theme, { getGitBranch: () => "main", getExtensionStatuses: () => statuses, onBranchChange: () => () => {} }).render(width);
    },
    getMessages() { return messages; },
  };
}

test("managed selected labels reach the existing footer at startup and new-session repaint", async () => {
  for (const label of ["EVOLVERA", "Pessoal"]) {
    const h = harness(label);
    h.statuses.set("codex-fast-mode", "⚡ECO");
    h.statuses.set("maestro", "routing xhigh");
    await h.startSession();
    let lines = h.render(160);
    assert.ok(lines.join(" ").includes(`usuario ${label}`), `${label}: ${lines.join(" | ")}`);
    if (label === "EVOLVERA") console.log(`Rendered footer sample: ${lines.join(" | ")}`);
    assert.match(lines.join(" "), /fast ON.*ECO/);
    assert.match(lines.join(" "), /maestro ON.*routing xhigh/);
    for (const width of [6, 20, 40, 80, 160]) {
      lines = h.render(width);
      assert.ok(lines.every((line) => cleanUi.cellWidth(line) <= width), `${width}: ${lines.join(" | ")}`);
    }
    await h.startSession();
    assert.ok(h.render(160).join(" ").includes(`usuario ${label}`), "each new native session republishes the process-bound label");
    assert.deepEqual(h.getMessages(), [], "footer must not send transcript/model messages");
    assert.deepEqual(h.controlCalls, [], "footer must not query account commands or credentials");
  }
});

test("unmanaged and absent/empty labels publish no guessed identity", async () => {
  for (const label of [undefined, "", "   "]) {
    for (const managed of [false, true]) {
      const h = harness(label, managed);
      await h.startSession();
      assert.equal(h.statuses.has("usuario"), false);
      assert.doesNotMatch(h.render(160).join(" "), /usuario/);
      assert.deepEqual(h.getMessages(), []);
      assert.deepEqual(h.controlCalls, []);
    }
  }
  assert.match(readFileSync(new URL("../../scripts/users/runtime.mjs", import.meta.url), "utf8"), /factory: createUsuarioFactory\(Object\.freeze\(\{\s*label: account\.label,/u);
});

test("unmanaged factory does not clear another owner's status", async () => {
  const h = harness(undefined);
  h.statuses.set("usuario", "existing owner");
  await h.startSession();
  assert.equal(h.statuses.get("usuario"), "existing owner");
});

test("headless managed sessions do not publish UI or transcript messages", async () => {
  const h = harness("Pessoal");
  h.ctx.mode = "rpc";
  h.ctx.hasUI = false;
  await h.startSession();
  assert.equal(h.statuses.has("usuario"), false);
  assert.deepEqual(h.getMessages(), []);
  assert.deepEqual(h.controlCalls, []);
});

console.log(`usuario footer isolated fixture retained at ${runRoot}`);
