import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { createUserRuntime } from "../users/runtime.mjs";
import { encodeAccountLaunchContext, ACCOUNT_LAUNCH_CONTEXT_ENV } from "../users/environment.mjs";
import { registerUser } from "../users/registry.mjs";

const runRoot = fs.mkdtempSync(path.join(os.tmpdir(), "usuario-orca-"));
const registryPath = path.join(runRoot, "registry", "users.json");
for (const id of ["alpha", "beta"]) {
  registerUser({
    registryPath,
    id,
    label: id,
    agentDir: path.join(runRoot, "profiles", id, "agent"),
    sessionRoots: [path.join(runRoot, "sessions", id)],
  });
}

class FakeSessionManager {
  constructor(entries = []) { this.entries = structuredClone(entries); }
  getEntries() { return this.entries; }
  getSessionId() { return "synthetic-session"; }
  appendCustomEntry(customType, data) { this.entries.push({ type: "custom", customType, data: structuredClone(data) }); }
}
const binding = (id) => ({ type: "custom", customType: "pi.account", data: { version: 1, accountId: id } });

async function managedCommand({ launchOrcaChild, id = "alpha" } = {}) {
  const factory = createUserRuntime(registryPath, {
    sdkRoot: path.join(runRoot, "sdk-placeholder"),
    inheritedAccountId: id,
    createStore: () => ({}),
    createModelRuntime: async () => ({}),
    launchOrcaChild,
    orcaPlatform: "win32",
    localAppData: "C:\\synthetic\\Local",
  });
  const sessionManager = new FakeSessionManager([binding(id)]);
  const loaded = await factory({ purpose: "application", sessionManager, sdkRoot: path.join(runRoot, "sdk-placeholder"), agentDir: path.join(runRoot, "profiles", id, "agent") });
  let command;
  loaded.resourceLoaderOptions.extensionFactories[0].factory({ registerCommand(name, definition) { assert.equal(name, "usuario"); command = definition.handler; }, on() {}, sendMessage() {} });
  return { command, sessionManager };
}

async function importFacade() {
  const source = fs.readFileSync(new URL("../../extensions/usuario.ts", import.meta.url), "utf8")
    .replace(/^import type .*;\r?\n/m, "");
  const javascript = stripTypeScriptTypes(source, { mode: "strip" });
  return import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);
}

test("managed /usuario orca launches once with fixed account context and absolute bootstrap", async () => {
  const calls = [];
  process.env[ACCOUNT_LAUNCH_CONTEXT_ENV] = encodeAccountLaunchContext({ version: 1, accountId: "alpha", registryPath: path.resolve(registryPath) });
  try {
    const { command, sessionManager } = await managedCommand({ launchOrcaChild: (options) => { calls.push(options); return 0; } });
    const messages = [];
    await command("orca worktree:feature/one", { sessionManager, hasUI: true, ui: { notify: (text) => messages.push(text) } });
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], {
      orcaCommand: path.join("C:\\synthetic\\Local", "Programs", "orca", "resources", "bin", "orca.EXE"),
      nodePath: path.resolve(process.execPath),
      entrypointPath: path.resolve(process.argv[1]),
      shell: "powershell.exe",
      worktree: "worktree:feature/one",
    });
    assert.deepEqual(messages, ["Orca terminal created."]);
    assert.equal(JSON.stringify(messages).includes("alpha"), false);
  } finally {
    delete process.env[ACCOUNT_LAUNCH_CONTEXT_ENV];
  }
});

test("root, account-context, platform, selector and launch failures fail closed", async () => {
  let calls = 0;
  const launchOrcaChild = () => { calls++; return 0; };
  const { command, sessionManager } = await managedCommand({ launchOrcaChild });
  const notified = [];
  const ctx = { sessionManager, hasUI: true, ui: { notify: (text) => notified.push(text) } };
  await command("orca selected", { ...ctx, sessionManager: new FakeSessionManager() });
  assert.deepEqual(notified, ["ACCOUNT_CONTROL_NOT_ROOT"]);
  assert.equal(calls, 0);
  await command("orca ", ctx);
  assert.equal(calls, 0);

  process.env[ACCOUNT_LAUNCH_CONTEXT_ENV] = encodeAccountLaunchContext({ version: 1, accountId: "beta", registryPath: path.resolve(registryPath) });
  try {
    await command("orca selected", ctx);
    assert.equal(notified.at(-1), "ACCOUNT_LAUNCH_CONTEXT_INVALID");
    assert.equal(calls, 0);
  } finally { delete process.env[ACCOUNT_LAUNCH_CONTEXT_ENV]; }

  process.env[ACCOUNT_LAUNCH_CONTEXT_ENV] = encodeAccountLaunchContext({ version: 1, accountId: "alpha", registryPath: path.resolve(registryPath) });
  try {
    const bad = await managedCommand({ launchOrcaChild: () => { throw Object.assign(new Error("private detail"), { code: "ACCOUNT_CHILD_INVOCATION_FAILED" }); } });
    const badMessages = [];
    await bad.command("orca selected", { sessionManager: bad.sessionManager, hasUI: true, ui: { notify: (text) => badMessages.push(text) } });
    assert.deepEqual(badMessages, ["ACCOUNT_CHILD_INVOCATION_FAILED"]);
    await command("orca selected", ctx);
    assert.equal(notified.at(-1), "Orca terminal created.");
    let nonzeroCalls = 0;
    const nonzero = await managedCommand({ launchOrcaChild: () => { nonzeroCalls++; return 7; } });
    const nonzeroMessages = [];
    await nonzero.command("orca selected", { sessionManager: nonzero.sessionManager, hasUI: true, ui: { notify: (text) => nonzeroMessages.push(text) } });
    assert.equal(nonzeroCalls, 1, "nonzero exit is not retried");
    assert.deepEqual(nonzeroMessages, ["ORCA_TERMINAL_CREATE_FAILED (7)"]);
  } finally { delete process.env[ACCOUNT_LAUNCH_CONTEXT_ENV]; }

  const unsupportedFactory = createUserRuntime(registryPath, { inheritedAccountId: "alpha", createStore: () => ({}), createModelRuntime: async () => ({}), orcaPlatform: "linux", launchOrcaChild: () => { calls++; } });
  const unsupportedManager = new FakeSessionManager([binding("alpha")]);
  const unsupported = await unsupportedFactory({ purpose: "application", sessionManager: unsupportedManager, sdkRoot: path.join(runRoot, "sdk-placeholder"), agentDir: path.join(runRoot, "profiles", "alpha", "agent") });
  let unsupportedHandler;
  unsupported.resourceLoaderOptions.extensionFactories[0].factory({ registerCommand(_name, definition) { unsupportedHandler = definition.handler; }, on() {}, sendMessage() {} });
  const unsupportedMessages = [];
  await unsupportedHandler("orca selected", { sessionManager: unsupportedManager, hasUI: true, ui: { notify: (text) => unsupportedMessages.push(text) } });
  assert.deepEqual(unsupportedMessages, ["ORCA_PLATFORM_UNSUPPORTED"]);
});

test("facade parses explicit Orca selectors and unmanaged mode never launches", async () => {
  const { createUsuarioFactory } = await importFacade();
  let handler;
  createUsuarioFactory({ execute: async (request) => JSON.stringify(request) })({
    registerCommand(_name, definition) { handler = definition.handler; },
    sendMessage() {},
  });
  const shown = [];
  const ctx = { hasUI: true, ui: { notify: (text) => shown.push(text) } };
  await handler("orca project:branch with spaces", ctx);
  assert.equal(shown[0], '{"operation":"orca","worktree":"project:branch with spaces"}');
  await handler("orca", ctx);
  assert.match(shown[1], /orca <worktree-selector>/);

  let unmanaged;
  createUsuarioFactory()({ registerCommand(_name, definition) { unmanaged = definition.handler; }, sendMessage() {} });
  const unmanagedMessages = [];
  await unmanaged("orca selected", { hasUI: true, ui: { notify: (text) => unmanagedMessages.push(text) } });
  assert.match(unmanagedMessages[0], /Processo não gerenciado/);
});
