import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { createUserRuntime } from "../users/runtime.mjs";
import { registerUser, resolveUser, removeUser } from "../users/registry.mjs";

const runRoot = fs.mkdtempSync(path.join(os.tmpdir(), "auth-only-remove-"));
const registryPath = path.join(runRoot, "registry", "users.json");
for (const id of ["alpha", "beta"]) {
  registerUser({
    registryPath,
    id,
    label: `${id} synthetic`,
    agentDir: path.join(runRoot, "profiles", id, "agent"),
    sessionRoots: [path.join(runRoot, "sessions", id)],
  });
}
const initialRegistryBytes = fs.readFileSync(registryPath);
const sentinels = [
  path.join(runRoot, "profiles", "beta", "agent", "auth.json"),
  path.join(runRoot, "profiles", "beta", "agent", "settings.json"),
  path.join(runRoot, "profiles", "beta", "agent", "sessions", "history.jsonl"),
];
for (const file of sentinels) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `synthetic sentinel ${path.basename(file)}\n`);
}
const sentinelBytes = sentinels.map((file) => fs.readFileSync(file));

class FakeSessionManager {
  getEntries() { return [{ type: "custom", customType: "pi.account", data: { version: 1, accountId: "alpha" } }]; }
  getSessionId() { return "synthetic-session"; }
}

async function managedHandler() {
  const sessionManager = new FakeSessionManager();
  const factory = createUserRuntime(registryPath, {
    sdkRoot: path.join(runRoot, "sdk-placeholder"),
    inheritedAccountId: "alpha",
    createStore: () => ({}),
    createModelRuntime: async () => ({}),
    launchOrcaChild: () => { throw new Error("must not launch"); },
  });
  const loaded = await factory({
    purpose: "application", sessionManager, sdkRoot: path.join(runRoot, "sdk-placeholder"),
    agentDir: path.join(runRoot, "profiles", "alpha", "agent"),
  });
  let handler;
  loaded.resourceLoaderOptions.extensionFactories[0].factory({
    registerCommand(name, definition) { assert.equal(name, "usuario"); handler = definition.handler; },
    on() {}, sendMessage() {},
  });
  return { handler, sessionManager };
}

async function facadeHandler() {
  const source = fs.readFileSync(new URL("../../extensions/usuario.ts", import.meta.url), "utf8")
    .replace(/^import type .*;\r?\n/m, "");
  const js = stripTypeScriptTypes(source, { mode: "strip" });
  const { createUsuarioFactory } = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
  let handler;
  createUsuarioFactory({ execute: async (request) => JSON.stringify(request) })({
    registerCommand(_name, definition) { handler = definition.handler; }, sendMessage() {},
  });
  return handler;
}

function uiContext(sessionManager, confirm, messages = []) {
  return {
    sessionManager,
    hasUI: typeof confirm === "function",
    ui: { confirm, notify: (text) => messages.push(text) },
  };
}

function assertProtectedSentinels() {
  sentinels.forEach((file, index) => assert.deepEqual(fs.readFileSync(file), sentinelBytes[index]));
}

test("facade dispatches only exact remove id and unmanaged mode cannot remove", async () => {
  const handler = await facadeHandler();
  const shown = [];
  const ctx = { hasUI: true, ui: { notify: (text) => shown.push(text) } };
  await handler("remove beta", ctx);
  assert.equal(shown[0], '{"operation":"remove","id":"beta"}');
  await handler("remove", ctx);
  await handler("remove beta extra", ctx);
  assert.match(shown[1], /remove <id>/);
  assert.match(shown[2], /remove <id>/);

  let unmanaged;
  const source = fs.readFileSync(new URL("../../extensions/usuario.ts", import.meta.url), "utf8").replace(/^import type .*;\r?\n/m, "");
  const { createUsuarioFactory } = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source, { mode: "strip" })).toString("base64")}`);
  createUsuarioFactory()({ registerCommand(_name, definition) { unmanaged = definition.handler; }, sendMessage() {} });
  const noControl = [];
  await unmanaged("remove beta", { hasUI: true, ui: { notify: (text) => noControl.push(text) } });
  assert.match(noControl[0], /não oferece seleção/);
  assert.equal(resolveUser({ registryPath, id: "beta" }).id, "beta");
});

test("actual managed handler confirms and removes only target registration with complete recovery metadata", async () => {
  const { handler, sessionManager } = await managedHandler();
  let prompt;
  const messages = [];
  await handler("remove beta", uiContext(sessionManager, async (title, message) => {
    prompt = { title, message };
    return true;
  }, messages));
  assert.match(prompt.title, /beta \(beta synthetic\)/);
  assert.match(prompt.message, /credentials and history remain on disk/i);
  assert.match(prompt.message, /cannot resume until its registration is restored/);
  const result = JSON.parse(messages.at(-1));
  assert.equal(result.id, "beta");
  assert.equal(typeof result.recoveryPath, "string");
  assert.equal(fs.existsSync(result.recoveryPath), true);
  assert.deepEqual(JSON.parse(fs.readFileSync(result.recoveryPath, "utf8")), {
    id: "beta", label: "beta synthetic", agentDir: path.join(runRoot, "profiles", "beta", "agent"),
    sessionRoots: [path.join(runRoot, "sessions", "beta")], workspaces: [], contexts: [], sharedAssets: [], adoption: "new",
  });
  assert.deepEqual(JSON.parse(fs.readFileSync(registryPath, "utf8")).users.map(({ id }) => id), ["alpha"]);
  assert.equal(resolveUser({ registryPath, id: "alpha" }).id, "alpha");
  assert.equal(JSON.stringify(messages).includes("synthetic sentinel"), false);
  assertProtectedSentinels();
});

test("active, non-root, cancelled, headless, unknown, and malformed requests fail closed", async () => {
  // Restore only the run-owned synthetic fixture for the independent denial checks.
  fs.writeFileSync(registryPath, initialRegistryBytes);
  const { handler, sessionManager } = await managedHandler();
  const before = fs.readFileSync(registryPath);
  const messages = [];
  let confirms = 0;
  const confirm = async () => { confirms++; return true; };
  await handler("remove alpha", uiContext(sessionManager, confirm, messages));
  assert.equal(messages.at(-1), "USER_REMOVE_ACTIVE");
  assert.equal(confirms, 0);
  await handler("remove beta", uiContext(new FakeSessionManager(), confirm, messages));
  assert.equal(messages.at(-1), "ACCOUNT_CONTROL_NOT_ROOT");
  assert.equal(confirms, 0);
  await handler("remove beta", uiContext(sessionManager, async () => false, messages));
  assert.equal(messages.at(-1), "USER_REMOVE_CANCELLED");
  await handler("remove beta", { sessionManager, hasUI: false, ui: {} });
  assertProtectedSentinels();
  assert.deepEqual(fs.readFileSync(registryPath), before);

  await handler("remove beta", uiContext(sessionManager, async () => {
    const changed = JSON.parse(fs.readFileSync(registryPath, "utf8"));
    changed.users.find((user) => user.id === "beta").label = "race changed";
    fs.writeFileSync(registryPath, JSON.stringify(changed, null, 2) + "\n");
    return true;
  }, messages));
  assert.equal(messages.at(-1), "USER_REMOVE_CHANGED");
  assert.equal(JSON.parse(fs.readFileSync(registryPath, "utf8")).users.find((user) => user.id === "beta").label, "race changed");
  fs.writeFileSync(registryPath, initialRegistryBytes);
  await handler("remove absent", uiContext(sessionManager, confirm, messages));
  assert.equal(messages.at(-1), "USER_UNKNOWN");
  await handler("remove BadID", uiContext(sessionManager, confirm, messages));
  assert.equal(messages.at(-1), "USER_ID_INVALID");
  assertProtectedSentinels();
  assert.deepEqual(fs.readFileSync(registryPath), before);
});

test("stale snapshots and backup failures never mutate the registry", () => {
  const stale = resolveUser({ registryPath, id: "beta" });
  const before = fs.readFileSync(registryPath);
  const data = JSON.parse(before);
  data.users.find((user) => user.id === "beta").label = "changed synthetic";
  fs.writeFileSync(registryPath, JSON.stringify(data, null, 2) + "\n");
  const changed = fs.readFileSync(registryPath);
  assert.throws(() => removeUser(stale, { activeAccountId: "alpha" }), { code: "USER_REMOVE_CHANGED" });
  assert.deepEqual(fs.readFileSync(registryPath), changed);

  // Block creation of the recovery directory using a run-owned regular file.
  const failureRoot = path.join(runRoot, "backup-failure");
  const failureRegistry = path.join(failureRoot, "registry", "users.json");
  const user = registerUser({ registryPath: failureRegistry, id: "gamma", label: "gamma", agentDir: path.join(failureRoot, "profile", "agent") });
  const recoveryBlocker = path.join(failureRoot, "registry", "registry-recovery");
  fs.writeFileSync(recoveryBlocker, "synthetic blocker");
  const beforeFailure = fs.readFileSync(failureRegistry);
  assert.throws(() => removeUser(user, { activeAccountId: "alpha" }), { code: "REGISTRY_RECOVERY_FAILED" });
  assert.deepEqual(fs.readFileSync(failureRegistry), beforeFailure);
});

test("registry alias, malformed, missing, root drift, and lock timeout reject without removal", () => {
  const missingRoot = path.join(runRoot, "missing");
  const missing = resolveUser;
  assert.throws(() => missing({ registryPath: path.join(missingRoot, "users.json"), id: "zeta" }), { code: "REGISTRY_MISSING" });

  const malformedPath = path.join(runRoot, "malformed", "users.json");
  fs.mkdirSync(path.dirname(malformedPath), { recursive: true });
  fs.writeFileSync(malformedPath, "{bad json");
  assert.throws(() => resolveUser({ registryPath: malformedPath, id: "zeta" }), { code: "REGISTRY_MALFORMED" });

  const locked = resolveUser({ registryPath, id: "beta" });
  fs.mkdirSync(`${registryPath}.lock`);
  try { assert.throws(() => removeUser(locked, { activeAccountId: "alpha", lockTimeoutMs: 0 }), { code: "REGISTRY_LOCK_TIMEOUT" }); }
  finally { fs.rmdirSync(`${registryPath}.lock`); }

  const aliasPath = path.join(runRoot, "registry", "users-alias.json");
  fs.linkSync(registryPath, aliasPath);
  try { assert.throws(() => resolveUser({ registryPath, id: "beta" }), { code: "REGISTRY_ALIAS" }); }
  finally { fs.unlinkSync(aliasPath); }

  const deltaDir = path.join(runRoot, "profiles", "delta", "agent");
  fs.mkdirSync(deltaDir, { recursive: true });
  const delta = registerUser({ registryPath, id: "delta", label: "delta", agentDir: deltaDir });
  const movedDir = `${deltaDir}-moved`;
  fs.renameSync(deltaDir, movedDir);
  fs.symlinkSync(movedDir, deltaDir, "junction");
  const beforeDriftRemoval = fs.readFileSync(registryPath);
  assert.throws(() => removeUser(delta, { activeAccountId: "alpha" }), { code: "ROOT_DRIFT" });
  assert.deepEqual(fs.readFileSync(registryPath), beforeDriftRemoval);
  assertProtectedSentinels();

});


test("valid registry property order does not invalidate confirmation", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "auth-only-remove-order-"));
  const file = path.join(root, "registry.json");
  registerUser({ registryPath: file, id: "gamma", label: "gamma", agentDir: path.join(root, "agent") });
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  data.users = data.users.map((record) => Object.fromEntries(Object.entries(record).reverse()));
  fs.writeFileSync(file, JSON.stringify(data));
  const confirmed = resolveUser({ registryPath: file, id: "gamma" });
  const removed = removeUser(confirmed, { activeAccountId: "alpha" });
  assert.equal(removed.id, "gamma");
  assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")).users, []);
});

test("exclusive backup collision never removes a file the operation did not create", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "auth-only-remove-collision-"));
  const file = path.join(root, "registry.json");
  const target = registerUser({ registryPath: file, id: "gamma", label: "gamma", agentDir: path.join(root, "agent") });
  const before = fs.readFileSync(file);
  const originalOpen = fs.openSync;
  let collision;
  fs.openSync = function (candidate, flags, ...args) {
    if (flags === "wx" && path.dirname(String(candidate)) === path.join(root, "registry-recovery")) {
      collision = candidate;
      fs.writeFileSync(candidate, "pre-existing synthetic recovery");
    }
    return originalOpen.call(this, candidate, flags, ...args);
  };
  try {
    assert.throws(() => removeUser(target, { activeAccountId: "alpha" }), { code: "REGISTRY_RECOVERY_FAILED" });
  } finally { fs.openSync = originalOpen; }
  assert.equal(fs.readFileSync(collision, "utf8"), "pre-existing synthetic recovery");
  assert.deepEqual(fs.readFileSync(file), before);
});
