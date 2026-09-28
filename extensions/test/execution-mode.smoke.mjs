import { resolvePiSdkRoot } from "./lib/pi-sdk.mjs";
import { createTestSymlink, trySymlinkFile } from "./lib/test-symlink.mjs";
import assert from "node:assert/strict";
import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDir, "../..");
const sandbox = mkdtempSync(path.join(tmpdir(), "execution-mode-smoke-"));
const oldAgentDir = process.env.PI_CODING_AGENT_DIR;
const agentDir = path.join(sandbox, "agent");
const project = path.join(sandbox, "project");
const projectSettings = path.join(project, ".pi", "settings.json");
const globalSettings = path.join(agentDir, "settings.json");

function writeJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function makeContext({ trusted = true, sessionManager } = {}) {
  const notices = [];
  const statuses = new Map();
  return {
    cwd: project,
    hasUI: false,
    sessionManager,
    isProjectTrusted: () => trusted,
    ui: {
      select: async () => undefined,
      notify(message, type) { notices.push({ message, type }); },
      setStatus(key, value) { statuses.set(key, value); },
    },
    notices,
    statuses,
  };
}

try {
  // The installed SDK is imported only through a sandbox symlink, and the
  // agent directory is owned by this run before any command callback exists.
  process.env.PI_CODING_AGENT_DIR = agentDir;
  const packageRoot = resolvePiSdkRoot(import.meta.url);
  const sdkScope = path.join(sandbox, "node_modules", "@earendil-works");
  mkdirSync(sdkScope, { recursive: true });
  createTestSymlink(packageRoot, path.join(sdkScope, "pi-coding-agent"), "dir");
  cpSync(path.join(root, "extensions", "execution-mode.ts"), path.join(sandbox, "execution-mode.ts"));

  const sdk = await import(pathToFileURL(path.join(packageRoot, "dist/core/session-manager.js")));
  const sdkConfig = await import(pathToFileURL(path.join(packageRoot, "dist/config.js")));
  assert.equal(sdkConfig.getAgentDir(), agentDir, "SDK getAgentDir must use the run-owned root before callbacks");
  const mod = await import(pathToFileURL(path.join(sandbox, "execution-mode.ts")));

  assert.deepEqual(mod.EXECUTION_MODES, ["supervised", "autonomous", "yolo"]);
  assert.equal(mod.parseExecutionMode("SUPERVISIONADO"), "supervised");
  assert.equal(mod.parseExecutionMode("AUTÔNOMO"), "autonomous");
  assert.equal(mod.parseExecutionMode("AUTÔNOMO ATÉ PR"), "autonomous");
  assert.equal(mod.parseExecutionMode("unknown"), undefined);
  for (const invalid of ["constructor", "__proto__", "prototype", 42, null]) {
    assert.equal(mod.parseExecutionMode(invalid), undefined);
  }
  assert.equal(mod.parseExecutionScope("session"), "session");
  assert.equal(mod.parseExecutionScope("other"), undefined);

  const handlers = new Map();
  let sessionManager;
  const pi = {
    registerCommand(name, command) { handlers.set(`command:${name}`, command.handler); },
    on(name, handler) { handlers.set(`event:${name}`, handler); },
    appendEntry(type, data) { sessionManager.appendCustomEntry(type, data); },
  };
  mod.default(pi);
  const command = handlers.get("command:execution-mode");
  const beforeAgentStart = handlers.get("event:before_agent_start");
  assert.equal(typeof command, "function");
  assert.equal(typeof beforeAgentStart, "function");

  assert.equal(mod.resolveExecutionMode(project, true, agentDir), "autonomous");
  writeJson(globalSettings, { unrelated: "preserve", nested: { keep: true } });
  const globalBefore = readFileSync(globalSettings, "utf8");
  const globalContext = makeContext();
  await command("autonomous global", globalContext);
  assert.deepEqual(JSON.parse(readFileSync(globalSettings, "utf8")), {
    unrelated: "preserve",
    nested: { keep: true },
    executionMode: "autonomous",
  });
  assert.match(globalContext.notices.at(-1).message, /^EXECUTION_MODE=\{"mode":"autonomous","source":"global"\}$/);
  assert.equal(globalContext.statuses.get("execution-mode"), "MODE  AUTÔNOMO · GLOBAL");
  assert.equal(mod.formatExecutionModeStatus({ mode: "yolo", source: "session" }), "MODE  YOLO · SESSION");
  assert.notEqual(readFileSync(globalSettings, "utf8"), globalBefore);
  if (process.platform === "win32") {
    console.log("SKIP (Windows NTFS não oferece chmod 0600): asserção do modo 0o600");
  } else {
    chmodSync(globalSettings, 0o600);
    await command("autonomous global", globalContext);
    assert.equal(statSync(globalSettings).mode & 0o777, 0o600);
  }
  const protectedTarget = path.join(sandbox, "linked-settings.json");
  const originalSettings = readFileSync(globalSettings, "utf8");
  writeFileSync(protectedTarget, originalSettings);
  rmSync(globalSettings);
  if (trySymlinkFile(protectedTarget, globalSettings, "protected settings symlink")) {
    await command("yolo global", globalContext);
    assert.ok(lstatSync(globalSettings).isSymbolicLink(), "mode command must not replace a settings symlink");
    assert.equal(readFileSync(protectedTarget, "utf8"), originalSettings);
    rmSync(globalSettings);
  }
  writeFileSync(globalSettings, originalSettings);

  writeJson(path.join(project, ".pi", "settings.json"), { executionMode: "yolo", projectKey: 7 });
  assert.equal(mod.resolveExecutionMode(project, true, agentDir), "yolo");
  const maskedProjectContext = makeContext();
  await command("autonomous global", maskedProjectContext);
  assert.match(maskedProjectContext.notices.at(-1).message, /^EXECUTION_MODE=\{"mode":"yolo","source":"project"\}$/);
  assert.equal(mod.resolveExecutionMode(project, false, agentDir), "autonomous");
  const untrustedProjectBefore = readFileSync(projectSettings, "utf8");
  const untrustedContext = makeContext({ trusted: false });
  await command("supervised project", untrustedContext);
  assert.equal(readFileSync(projectSettings, "utf8"), untrustedProjectBefore, "untrusted project must not be written");
  assert.match(untrustedContext.notices.at(-1).message, /not trusted/);

  const invalidArgsBefore = readFileSync(globalSettings, "utf8");
  const nonUiContext = makeContext();
  await command("", nonUiContext);
  assert.match(nonUiContext.notices.at(-1).message, /Usage: \/execution-mode/);
  await command("yolo project extra", makeContext());
  await command("status extra", makeContext());
  await command("not-a-mode", makeContext());
  await command("constructor", makeContext());
  await command("yolo invalid-scope", makeContext());
  assert.equal(readFileSync(globalSettings, "utf8"), invalidArgsBefore, "invalid arguments must not write settings");

  writeFileSync(globalSettings, '{"unrelated":"safe",');
  const corruptState = mod.resolveExecutionModeState(project, false, agentDir);
  assert.equal(corruptState.mode, "supervised");
  assert.equal(corruptState.source, "global");
  assert.equal(corruptState.diagnostic, "Execution mode configuration is invalid; using SUPERVISIONADO fail-safe.");
  const corruptBefore = readFileSync(globalSettings, "utf8");
  const corruptContext = makeContext({ trusted: false });
  await command("status", corruptContext);
  assert.equal(readFileSync(globalSettings, "utf8"), corruptBefore);
  assert.match(corruptContext.notices.at(-1).message, /supervised|SUPERVISIONADO|EXECUTION_MODE/);
  assert.doesNotMatch(corruptContext.notices.at(-1).message, /unrelated|settings contents/);
  assert.match(mod.formatExecutionModeReceipt(corruptState), /"valid":false/);
  await command("yolo global", corruptContext);
  assert.equal(readFileSync(globalSettings, "utf8"), corruptBefore, "saving must not replace corrupt configuration");
  for (const invalid of [42, "constructor", "__proto__"]) {
    writeJson(globalSettings, { executionMode: invalid });
    assert.equal(mod.resolveExecutionModeState(project, false, agentDir).mode, "supervised");
    assert.ok(mod.resolveExecutionModeState(project, false, agentDir).diagnostic);
  }
  await command("AUTÔNOMO ATÉ PR global", makeContext({ trusted: false }));
  assert.equal(JSON.parse(readFileSync(globalSettings, "utf8")).executionMode, "autonomous");

  writeJson(globalSettings, { executionMode: "supervised", worker: "keep" });
  rmSync(projectSettings, { force: true });
  const sessionDir = path.join(sandbox, "sessions");
  mkdirSync(sessionDir, { recursive: true });
  // Native SDK buffers new-session entries until the first assistant message;
  // the pin is already active before any work and is flushed with that message.
  sessionManager = sdk.SessionManager.create(project, sessionDir);
  const freshContext = makeContext({ sessionManager });
  await command("autonomous session", freshContext);
  assert.match(freshContext.notices.at(-1).message, /"source":"session"/);
  const freshPrompt = await beforeAgentStart({ systemPrompt: "FRESH" }, freshContext);
  assert.match(freshPrompt.systemPrompt, /EXECUTION_MODE=\{"mode":"autonomous","source":"session"\}/);
  assert.equal(existsSync(sessionManager.getSessionFile()), false, "native pre-assistant buffering must not be misreported as disk persistence");
  sessionManager.appendMessage({ role: "assistant", content: [{ type: "text", text: "synthetic first response" }], provider: "synthetic", model: "synthetic", stopReason: "stop" });
  const freshReopened = sdk.SessionManager.open(sessionManager.getSessionFile(), sessionDir);
  assert.equal(mod.resolveExecutionModeState(project, true, agentDir, freshReopened).mode, "autonomous");
  const noSessionContext = makeContext({ sessionManager: sdk.SessionManager.inMemory(project) });
  await command("yolo session", noSessionContext);
  assert.match(noSessionContext.notices.at(-1).message, /no success receipt/);

  sessionManager = sdk.SessionManager.create(project, sessionDir);
  sessionManager.appendMessage({
    role: "assistant",
    content: [{ type: "text", text: "synthetic" }],
    provider: "synthetic",
    model: "synthetic",
    usage: { input: 0, output: 0, totalTokens: 0 },
    stopReason: "stop",
  });
  sessionManager.appendCustomEntry("synthetic-marker", { purpose: "branch base" });
  const sessionContext = makeContext({ sessionManager });
  await command("yolo session", sessionContext);
  assert.match(sessionContext.notices.at(-1).message, /^EXECUTION_MODE=\{"mode":"yolo","source":"session"\}$/);
  assert.equal(mod.resolveExecutionModeState(project, true, agentDir, sessionManager).mode, "yolo");

  const sessionFile = sessionManager.getSessionFile();
  assert.ok(sessionFile);
  const reopened = sdk.SessionManager.open(sessionFile, sessionDir);
  assert.equal(mod.resolveExecutionModeState(project, true, agentDir, reopened).source, "session");
  const pinEntry = reopened.getBranch().find((entry) => entry.type === "custom" && entry.customType === "execution-mode");
  assert.ok(pinEntry, "session pin must be a durable custom entry");
  reopened.appendCompaction("synthetic compaction", pinEntry.id, 1);
  assert.equal(mod.resolveExecutionModeState(project, true, agentDir, reopened).mode, "yolo", "pin survives a compaction-shaped branch");
  assert.equal(reopened.buildSessionContext().messages.some((message) => JSON.stringify(message).includes("execution-mode")), false, "custom pin must not enter LLM context");

  // A global change cannot upgrade or downgrade the pinned worker.
  await command("autonomous global", makeContext({ sessionManager: reopened }));
  assert.deepEqual(mod.resolveExecutionModeState(project, true, agentDir, reopened), { mode: "yolo", source: "session" });
  const baseEntry = reopened.getBranch().find((entry) => entry.type === "custom" && entry.customType === "execution-mode")?.parentId;
  assert.ok(baseEntry);
  reopened.branch(baseEntry);
  assert.equal(mod.resolveExecutionModeState(project, true, agentDir, reopened).source, "global", "active branch switch must ignore pins on another branch");

  for (const mode of mod.EXECUTION_MODES) {
    await command(`${mode} global`, makeContext());
    const context = makeContext();
    const first = await beforeAgentStart(
      { systemPrompt: "BASE\nConsequential Action Gate", systemPromptOptions: { customPrompt: "# Custom agent" } },
      context,
    );
    assert.match(first.systemPrompt, /BASE\nConsequential Action Gate/);
    assert.match(first.systemPrompt, /PI EXECUTION MODE START/);
    assert.ok(first.systemPrompt.includes(`EXECUTION_MODE={"mode":"${mode}","source":"global"}`));
    assert.match(first.systemPrompt, new RegExp(mod.executionModeLabel(mode)));
    for (const other of mod.EXECUTION_MODES.filter((candidate) => candidate !== mode)) {
      assert.doesNotMatch(first.systemPrompt, new RegExp(`EXECUTION MODE: ${mod.executionModeLabel(other)}`));
    }
    assert.match(first.systemPrompt, /not runtime, sandbox, credential, or tool-permission access/);
    const repeated = await beforeAgentStart(
      { systemPrompt: first.systemPrompt, systemPromptOptions: { customPrompt: "# Custom agent" } },
      context,
    );
    assert.equal((repeated.systemPrompt.match(/PI EXECUTION MODE START/g) ?? []).length, 1, "repeated hooks must not duplicate the block");
  }

  const selectorContext = makeContext();
  selectorContext.hasUI = true;
  selectorContext.ui.select = async () => "SUPERVISIONADO";
  await command("", selectorContext);
  assert.equal(JSON.parse(readFileSync(globalSettings, "utf8")).executionMode, "supervised");
  const beforeCancel = readFileSync(globalSettings, "utf8");
  selectorContext.ui.select = async () => undefined;
  await command("", selectorContext);
  assert.equal(readFileSync(globalSettings, "utf8"), beforeCancel);

  console.log("execution-mode smoke: PASS");
} finally {
  if (oldAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = oldAgentDir;
  rmSync(sandbox, { recursive: true, force: true });
}
