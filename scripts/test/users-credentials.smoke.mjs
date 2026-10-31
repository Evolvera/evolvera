import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import childProcess from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import tls from "node:tls";
import dns from "node:dns";
import dgram from "node:dgram";
import http from "node:http";
import https from "node:https";
import Module from "node:module";
import { constants } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createSandbox, createAccessGuard, denyNetwork } from "./lib/users-sandbox.mjs";

const SCRIPT = fileURLToPath(import.meta.url);
const CORE = "C:/nvm4w/nodejs/node_modules/@earendil-works/pi-coding-agent";
const SDK_CODE_ROOTS = [CORE, fs.realpathSync.native(CORE)];
const SOURCE_ROOT = path.resolve(path.dirname(SCRIPT), "..");
const WRITES = new Set(["appendFile", "chmod", "chown", "copyFile", "cp", "lchmod", "lchown", "link", "mkdir", "mkdtemp", "rename", "rm", "rmdir", "symlink", "truncate", "unlink", "utimes", "lutimes", "writeFile", "createWriteStream", "fchmod", "fchown", "ftruncate", "futimes", "write", "writev"]);
let onLockWait;
let traceLocks = false;
const trace = (message) => { if (traceLocks) process.stderr.write(`LOCK_TRACE ${message}\n`); };
const latch = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
async function bounded(promise, ms = 10_000, message = "LATCH_TIMEOUT") {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); })]); }
  finally { clearTimeout(timer); }
}
const hostProtected = ["C:/Users/kevin/.pi/agent", "C:/Users/kevin/Documents/Pi/.pi"];
const inside = (root, value) => {
  const rel = path.relative(root, path.resolve(value));
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
};

function installResourceGuards(root) {
  const restores = [];
  const canonical = fs.realpathSync.native;
  const lstat = fs.lstatSync;
  const counters = { protected: 0, network: 0, child: 0, outside: 0, keyring: 0 };
  const descriptors = new Map();
  let operations = 0;
  let lastOperation = "none";
  const hit = (value, method, args) => {
    operations++;
    lastOperation = method;
    if (typeof value === "number") value = descriptors.get(value);
    const raw = value instanceof URL ? fileURLToPath(value) : Buffer.isBuffer(value) ? value.toString() : value;
    if (typeof raw !== "string") throw new Error("UNGUARDED_FILE_DESCRIPTOR");
    const resolved = path.resolve(raw.startsWith("file:") ? fileURLToPath(raw) : raw);
    const baseMethod = method.replace(/Sync$/, "");
    const flags = baseMethod === "open" ? args?.[1] : args?.[1]?.flags;
    const openWrites = typeof flags === "number" ? (flags & (constants.O_WRONLY | constants.O_RDWR | constants.O_CREAT | constants.O_TRUNC | constants.O_APPEND)) !== 0 : typeof flags === "string" && /[wa+]/.test(flags);
    const writes = WRITES.has(baseMethod) || openWrites;
    const allowed = (candidate) => {
      for (const protectedPath of hostProtected) {
        if (inside(protectedPath, candidate) || inside(candidate, protectedPath)) {
          counters.protected++; throw new Error("PROTECTED_HOST_PATH_ACCESS");
        }
      }
      if (inside(root, candidate)) return;
      if (!writes && [SOURCE_ROOT, ...SDK_CODE_ROOTS].some((codeRoot) => inside(codeRoot, candidate))) return;
      counters.outside++; throw new Error("FILESYSTEM_OUTSIDE_RUN_ROOT");
    };
    allowed(resolved);
    let ancestor = resolved;
    for (;;) {
      try { lstat(ancestor); break; } catch (error) {
        if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
        const parent = path.dirname(ancestor);
        if (parent === ancestor) throw error;
        ancestor = parent;
      }
    }
    allowed(path.join(canonical(ancestor), path.relative(ancestor, resolved)));
  };
  const pathArgMethods = ["access", "appendFile", "chmod", "chown", "copyFile", "cp", "createReadStream", "createWriteStream", "lchmod", "lchown", "link", "lstat", "mkdir", "mkdtemp", "open", "opendir", "readFile", "readdir", "readlink", "realpath", "rename", "rm", "rmdir", "stat", "symlink", "truncate", "unlink", "utimes", "lutimes", "writeFile"];
  const syncNames = pathArgMethods.map((name) => `${name}Sync`).concat(["existsSync"]);
  const asyncNames = pathArgMethods;
  const patch = (object, name, indexes) => {
    const original = object[name];
    if (typeof original !== "function") return;
    const guarded = function (...args) {
      for (const index of indexes) if (index < args.length) hit(args[index], name, args);
      if (["mkdir", "rmdir"].includes(name) && typeof args.at(-1) === "function") {
        const callback = args.at(-1);
        const isAuthLock = String(args[0]).endsWith("auth.json.lock");
        if (isAuthLock) trace(`${name} begin ${new Error().stack.split("\n").slice(2, 5).map((line) => line.trim()).join(" | ")}`);
        args[args.length - 1] = (error, ...rest) => {
          if (isAuthLock && error?.code !== "EEXIST") trace(`${name} callback ${error?.code ?? "OK"}`);
          if (name === "mkdir" && error?.code === "EEXIST" && isAuthLock) onLockWait?.();
          callback(error, ...rest);
        };
      }
      if (name === "open" && typeof args.at(-1) === "function") {
        const callback = args.at(-1);
        args[args.length - 1] = (error, fd) => {
          if (!error) descriptors.set(fd, args[0]);
          callback(error, fd);
        };
      }
      const result = original.apply(this, args);
      if (["mkdirSync", "rmdirSync"].includes(name) && String(args[0]).endsWith("auth.json.lock")) trace(`${name} returned`);
      if (name === "openSync") descriptors.set(result, args[0]);
      if (name === "open" && result?.then) return result.then((handle) => {
        descriptors.set(handle.fd, args[0]);
        for (const method of ["appendFile", "chmod", "chown", "truncate", "utimes", "write", "writev", "writeFile", "createReadStream", "createWriteStream", "read", "readv", "readFile", "stat", "sync", "datasync"]) {
          const originalMethod = handle[method];
          if (typeof originalMethod === "function") handle[method] = function (...values) {
            hit(handle.fd, method, values); return originalMethod.apply(this, values);
          };
        }
        return handle;
      });
      return result;
    };
    if (original.native) guarded.native = function (...args) {
      for (const index of indexes) if (index < args.length) hit(args[index], name, args);
      return original.native.apply(this, args);
    };
    object[name] = guarded;
    restores.push(() => { object[name] = original; });
  };
  for (const name of syncNames) patch(fs, name, [0, ...(new Set(["copyFileSync", "cpSync", "linkSync", "renameSync", "symlinkSync"]).has(name) ? [1] : [])]);
  for (const name of ["createReadStream", "createWriteStream"]) patch(fs, name, [0]);
  for (const name of asyncNames) {
    const indexes = [0, ...(new Set(["copyFile", "cp", "link", "rename", "symlink"]).has(name) ? [1] : [])];
    patch(fs, name, indexes);
    patch(fs.promises, name, indexes);
  }
  const require = createRequire(`${CORE}/package.json`);
  const graceful = require("graceful-fs");
  for (const name of syncNames) patch(graceful, name, [0, ...(new Set(["copyFileSync", "cpSync", "linkSync", "renameSync", "symlinkSync"]).has(name) ? [1] : [])]);
  for (const name of ["createReadStream", "createWriteStream"]) patch(graceful, name, [0]);
  for (const name of asyncNames) {
    const indexes = [0, ...(new Set(["copyFile", "cp", "link", "rename", "symlink"]).has(name) ? [1] : [])];
    patch(graceful, name, indexes);
    patch(graceful.promises, name, indexes);
  }
  for (const object of [fs, graceful]) {
    for (const name of ["fchmod", "fchmodSync", "fchown", "fchownSync", "fdatasync", "fdatasyncSync", "fsync", "fsyncSync", "fstat", "fstatSync", "ftruncate", "ftruncateSync", "futimes", "futimesSync", "read", "readSync", "readv", "readvSync", "write", "writeSync", "writev", "writevSync"]) patch(object, name, [0]);
  }
  for (const name of ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"]) {
    const original = childProcess[name];
    childProcess[name] = () => { counters.child++; throw new Error("CHILD_PROCESS_DENIED"); };
    restores.push(() => { childProcess[name] = original; });
  }
  for (const [object, name] of [[tls, "connect"], [tls.TLSSocket.prototype, "connect"], [net, "connect"], [net, "createConnection"], [net.Socket.prototype, "connect"], [net.Server.prototype, "listen"], [dgram.Socket.prototype, "connect"], [dgram.Socket.prototype, "send"], [dgram.Socket.prototype, "bind"], [http, "request"], [http, "get"], [https, "request"], [https, "get"], [globalThis, "fetch"]]) {
    const original = object[name];
    object[name] = () => { counters.network++; throw new Error("NETWORK_DENIED"); };
    restores.push(() => { object[name] = original; });
  }
  for (const [object, name] of [[dns, "lookup"], [dns, "lookupService"], ...["resolve", "resolve4", "resolve6", "resolveAny", "resolveCaa", "resolveCname", "resolveMx", "resolveNaptr", "resolveNs", "resolvePtr", "resolveSoa", "resolveSrv", "resolveTxt", "reverse"].map((name) => [dns, name]), ...["lookup", "lookupService", "resolve", "resolve4", "resolve6", "resolveAny", "resolveCaa", "resolveCname", "resolveMx", "resolveNaptr", "resolveNs", "resolvePtr", "resolveSoa", "resolveSrv", "resolveTxt", "reverse"].map((name) => [dns.promises, name]), ...["lookup", "lookupService", "resolve", "resolve4", "resolve6", "resolveAny", "resolveCaa", "resolveCname", "resolveMx", "resolveNaptr", "resolveNs", "resolvePtr", "resolveSoa", "resolveSrv", "resolveTxt", "reverse"].map((name) => [dns.Resolver.prototype, name])]) {
    const original = object?.[name]; if (typeof original !== "function") continue;
    object[name] = () => { counters.network++; throw new Error("NETWORK_DENIED"); };
    restores.push(() => { object[name] = original; });
  }
  const originalLoad = Module._load;
  Module._load = function (request, ...args) {
    if (typeof request === "string" && /(?:keytar|keyring|keychain|credential-storage|wincred)/i.test(request)) { counters.keyring++; throw new Error("OS_KEYRING_DENIED"); }
    return originalLoad.call(this, request, ...args);
  };
  restores.push(() => { Module._load = originalLoad; });
  syncBuiltinESMExports();
  const restore = () => { for (const restore of restores.reverse()) restore(); syncBuiltinESMExports(); };
  restore.counters = counters;
  restore.activity = () => ({ operations, lastOperation, resources: process.getActiveResourcesInfo() });
  return restore;
}

async function integration(store, authPath, root) {
  traceLocks = process.env.PI_TEST_LOCK_TRACE === "1";
  const backingStore = store;
  let seq = 0;
  store = Object.fromEntries(["read", "list", "modify", "delete"].map((method) => [method, async (...args) => {
    const id = ++seq;
    trace(`store ${id} ${method} begin`);
    try { const result = await backingStore[method](...args); trace(`store ${id} ${method} end`); return result; }
    catch (error) { trace(`store ${id} ${method} error ${error.code ?? error.name}`); throw error; }
  }]));
  const { ModelRuntime } = await import(pathToFileURL(path.join(CORE, "dist", "index.js")).href);
  const { createAssistantMessageEventStream } = await import(pathToFileURL(path.join(CORE, "node_modules", "@earendil-works", "pi-ai", "dist", "index.js")).href);
  const native = await ModelRuntime.create({ authPath, modelsPath: null, refreshOnCreate: false, allowModelNetwork: false });
  const app = await ModelRuntime.create({ credentials: store, modelsPath: null, refreshOnCreate: false, allowModelNetwork: false });
  const builtinIds = native.getProviders().map(({ id }) => id).sort();
  assert.deepEqual(app.getProviders().map(({ id }) => id).sort(), builtinIds);
  const recorded = [];
  for (const runtime of [app, native]) {
    const original = runtime.getProvider("openai");
    runtime.registerNativeProvider({ ...original, stream(model, context, options) {
      recorded.push(options.apiKey);
      const stream = createAssistantMessageEventStream();
      stream.end({ role: "assistant", content: [{ type: "text", text: "synthetic" }], api: model.api, provider: model.provider, model: model.id,
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: "stop", timestamp: 0 });
      return stream;
    } });
    assert.deepEqual(runtime.getProviders().map(({ id }) => id).sort(), builtinIds);
  }
  for (const token of ["SYNTHETIC_A", "SYNTHETIC_B"]) {
    await store.modify("openai", async (current) => ({ ...current, access: token }));
    trace(`after modify lock exists=${fs.existsSync(`${authPath}.lock`)}`);
    const before = fs.readFileSync(authPath);
    for (const runtime of [app, native]) {
      const model = runtime.getModels("openai")[0];
      assert.ok(model);
      const result = await runtime.complete(model, { messages: [{ role: "user", content: "synthetic", timestamp: 0 }] });
      assert.equal(result.stopReason, "stop", result.errorMessage);
      assert.equal(recorded.at(-1), token);
    }
    assert.deepEqual(fs.readFileSync(authPath), before, "request auth must not persist normalization");
  }
  assert.deepEqual(recorded, ["SYNTHETIC_A", "SYNTHETIC_A", "SYNTHETIC_B", "SYNTHETIC_B"]);
  await store.delete("openai");
  const count = recorded.length;
  for (const runtime of [app, native]) {
    const result = await runtime.complete(runtime.getModels("openai")[0], { messages: [] });
    assert.equal(result.stopReason, "error");
  }
  assert.equal(recorded.length, count, "absent personal auth must not dispatch the previous token");

  const expired = { type: "oauth", access: "EXPIRED", refresh: "SYNTHETIC_REFRESH", expires: 0, extra: { keep: true } };
  await store.modify("native-proof", async () => expired);
  let refreshEntered = latch();
  let refreshRelease = latch();
  let refreshCount = 0;
  native.registerNativeProvider({ id: "native-proof", name: "Synthetic native lock proof", getModels: () => [],
    auth: { oauth: { name: "Synthetic", login: async () => { throw new Error("LOGIN_DENIED"); },
      refresh: async (current) => { refreshCount++; refreshEntered.resolve(); await refreshRelease.promise; return { ...current, access: `ROTATED_${refreshCount}`, expires: 4_000_000_000_000 }; },
      toAuth: async (current) => ({ apiKey: current.access }) } },
    stream: () => { throw new Error("TRANSPORT_DENIED"); }, streamSimple: () => { throw new Error("TRANSPORT_DENIED"); } });
  const nativeRefresh = native.getAuth("native-proof");
  await bounded(refreshEntered.promise);
  assert.ok(fs.statSync(`${authPath}.lock`).isDirectory());
  const waiting = latch(); onLockWait = waiting.resolve;
  let appEntered = false;
  const appWrite = store.modify("other", async (current) => { appEntered = true; return { ...current, key: "APP_AFTER_NATIVE" }; });
  await bounded(waiting.promise);
  assert.equal(appEntered, false);
  refreshRelease.resolve();
  await Promise.all([nativeRefresh, appWrite]);
  assert.equal((await store.read("native-proof")).access, "ROTATED_1");
  assert.equal((await store.read("other")).key, "APP_AFTER_NATIVE");
  assert.deepEqual(JSON.parse(fs.readFileSync(authPath)).unrelated, { opaque: [1, 2, 3] });
  assert.deepEqual((await store.read("native-proof")).extra, { keep: true });

  await store.modify("native-proof", async () => expired);
  refreshEntered = latch(); refreshRelease = latch();
  const appHeld = latch(); const appRelease = latch();
  const heldWrite = store.modify("other", async (current) => { appHeld.resolve(); await appRelease.promise; return { ...current, key: "APP_BEFORE_NATIVE" }; });
  await bounded(appHeld.promise);
  const nativeWaiting = latch(); onLockWait = nativeWaiting.resolve;
  const nextRefresh = native.getAuth("native-proof");
  await bounded(nativeWaiting.promise);
  assert.equal(refreshCount, 1, "native refresh must not enter while app callback holds the same lock");
  appRelease.resolve(); await heldWrite;
  await bounded(refreshEntered.promise); refreshRelease.resolve(); await nextRefresh;
  assert.equal((await store.read("native-proof")).access, "ROTATED_2");
  assert.equal((await store.read("other")).key, "APP_BEFORE_NATIVE");
  assert.deepEqual(JSON.parse(fs.readFileSync(authPath)).unrelated, { opaque: [1, 2, 3] });
  onLockWait = undefined;
  console.log("Request A/B app+native, absent auth, builtin IDs, native/app callback lock exclusion proved.");
}

async function legacyReadCases(store, authPath) {
  const cases = [
    { input: { alibaba: { type: "oauth", access: "CLOUD_OLD" } }, providerId: "alibaba-cloud", token: "CLOUD_OLD", type: "api_key" },
    { input: { alibaba: { type: "oauth", access: "sk-sp-PLAN" } }, providerId: "alibaba-plan", token: "sk-sp-PLAN", type: "oauth" },
    { input: { alibaba: { type: "api_key", key: "sk-tok-PLAN" } }, providerId: "alibaba-plan", token: "sk-tok-PLAN", type: "oauth" },
    { input: { "alibaba-cloud": { type: "oauth", access: "CLOUD_OAUTH" } }, providerId: "alibaba-cloud", token: "CLOUD_OAUTH", type: "api_key" },
    { input: { "alibaba-cloud": { type: "api_key", key: "sk-sp-MISROUTED" } }, providerId: "alibaba-plan", token: "sk-sp-MISROUTED", type: "oauth" },
    { input: { alibaba: { type: "oauth", access: "OLD_WINS" }, "alibaba-cloud": { type: "api_key", key: "MODERN" }, unrelated: 7 }, providerId: "alibaba-cloud", token: "OLD_WINS", type: "api_key", unrelated: 7 },
    { input: { "alibaba-cloud": { type: "api_key", key: "sk-tok-X" }, "alibaba-plan": { type: "oauth", access: "CANON", refresh: "refresh", expires: 77 }, unrelated: 9 }, providerId: "alibaba-plan", token: "CANON", type: "oauth", unrelated: 9, stale: true },
  ];
  const { ModelRuntime } = await import(pathToFileURL(path.join(CORE, "dist", "index.js")).href);
  const runtime = await ModelRuntime.create({ credentials: store, modelsPath: null, refreshOnCreate: false, allowModelNetwork: false });
  runtime.registerProvider("alibaba-cloud", { api: "anthropic-messages", baseUrl: "https://synthetic.invalid" });
  runtime.registerProvider("alibaba-plan", { api: "anthropic-messages", baseUrl: "https://synthetic.invalid", oauth: {
    name: "Synthetic Alibaba Plan", login: async () => { throw new Error("LOGIN_DENIED"); },
    refreshToken: async () => { throw new Error("REFRESH_DENIED"); }, getApiKey: (credentials) => credentials.access,
  } });
  for (const [index, item] of cases.entries()) {
    fs.writeFileSync(authPath, JSON.stringify(item.input, null, 2));
    const before = fs.readFileSync(authPath);
    const credential = await store.read(item.providerId);
    assert.equal(credential?.type, item.type, `legacy case ${index + 1} credential type`);
    assert.equal(item.type === "api_key" ? credential.key : credential.access, item.token, `legacy case ${index + 1} selected token`);
    if (item.type === "oauth" && !item.stale) assert.ok(credential.expires > Date.now(), `legacy case ${index + 1} gets a future synthetic expiry`);
    const projectedIds = item.stale ? ["alibaba-plan"] : [item.providerId];
    assert.deepEqual(await store.list(), projectedIds.map((providerId) => ({ providerId, type: providerId === "alibaba-cloud" ? "api_key" : "oauth" })));
    assert.deepEqual(fs.readFileSync(authPath), before, `legacy case ${index + 1} read/list preserves raw bytes`);
    assert.deepEqual(JSON.parse(fs.readFileSync(authPath)), item.input, `legacy case ${index + 1} retains unrelated/raw fields`);
    let callbacks = 0;
    await assert.rejects(store.modify(item.providerId, async () => { callbacks++; return undefined; }), /CREDENTIAL_LEGACY_MUTATION_BLOCKED/);
    await assert.rejects(store.delete(item.providerId), /CREDENTIAL_LEGACY_MUTATION_BLOCKED/);
    assert.equal(callbacks, 0, `legacy case ${index + 1} modify callback is excluded`);
    assert.deepEqual(fs.readFileSync(authPath), before, `legacy case ${index + 1} rejected mutations preserve raw bytes`);
    if (!item.stale) {
      const auth = await runtime.getAuth(item.providerId);
      assert.equal(auth?.auth?.apiKey, item.token, `public SDK getAuth resolves legacy case ${index + 1}`);
      assert.deepEqual(fs.readFileSync(authPath), before, `legacy case ${index + 1} SDK lookup preserves raw bytes`);
    }
  }
  console.log("Legacy alias/oauth/cloud-plan read/list/getAuth projections, mutation exclusion, and raw-byte preservation proved (7 cases; stale expiry is read-only).");
}

async function boundaries(store, authPath, agentDir) {
  const original = fs.readFileSync(authPath);
  fs.writeFileSync(authPath, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), original]));
  assert.ok(await store.read("openai"));
  assert.deepEqual(fs.readFileSync(authPath), Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), original]));
  fs.writeFileSync(authPath, original);
  await store.modify("env-proof", async () => ({ type: "api_key", key: "$SELECTED/${SELECTED}/$$/$!", env: { SELECTED: "SYNTHETIC_ENV" } }));
  const beforeEnv = fs.readFileSync(authPath);
  assert.equal((await store.read("env-proof")).key, "SYNTHETIC_ENV/SYNTHETIC_ENV/$/!");
  assert.deepEqual(fs.readFileSync(authPath), beforeEnv);
  await store.modify("command-proof", async () => ({ type: "api_key", key: "!must-never-run" }));
  assert.equal((await store.read("command-proof")).key, "!must-never-run");
  for (const value of [{ type: "oauth", access: "a", refresh: "r", expires: Infinity }, { type: "api_key", env: { bad: 1 } }]) {
    await assert.rejects(store.modify("invalid", async () => value), /CREDENTIAL_VALUE_INVALID/);
  }
  await store.modify("__proto__", async () => ({ type: "api_key", key: "SYNTHETIC_PROTO" }));
  assert.equal((await store.read("__proto__")).key, "SYNTHETIC_PROTO");
  assert.equal(await store.read("toString"), undefined);
  assert.ok(Object.hasOwn(JSON.parse(fs.readFileSync(authPath)), "__proto__"));
  await store.delete("__proto__");

  const entered = latch(); const release = latch(); const controller = new AbortController();
  const beforeAbort = fs.readFileSync(authPath);
  const held = store.modify("openai", async (current) => { entered.resolve(); await release.promise; return { ...current, access: "MUST_NOT_COMMIT" }; }, { signal: controller.signal });
  const heldRejected = assert.rejects(held, /CREDENTIAL_ABORTED/);
  await bounded(entered.promise);
  const queuedController = new AbortController();
  let queuedEntered = false;
  const queued = store.modify("other", async () => { queuedEntered = true; return undefined; }, { signal: queuedController.signal });
  const queuedRejected = assert.rejects(queued, /CREDENTIAL_ABORTED/);
  // The callback already entered above owns the FIFO turn: a queued operation
  // must cancel promptly without attempting a second file lock in this process.
  queuedController.abort(); await queuedRejected;
  assert.equal(queuedEntered, false);
  controller.abort();
  let deleted = false;
  const deleting = store.delete("env-proof").then(() => { deleted = true; });
  await Promise.resolve();
  assert.equal(deleted, false);
  assert.ok(fs.lstatSync(`${authPath}.lock`).isDirectory(), "unsettled callback retains the physical lock");
  assert.deepEqual(fs.readFileSync(authPath), beforeAbort, "abort must not unlock an unsettled callback");
  release.resolve(); await heldRejected; await deleting;
  assert.equal((await store.read("openai")).access, JSON.parse(beforeAbort).openai.access);
  assert.equal(await store.read("env-proof"), undefined);
  onLockWait = undefined;

  const compromiseEntered = latch(); const compromiseRelease = latch();
  const beforeCompromise = fs.readFileSync(authPath);
  const compromised = store.modify("other", async (current) => { compromiseEntered.resolve(); await compromiseRelease.promise; return { ...current, key: "MUST_NOT_COMMIT" }; });
  const rejected = assert.rejects(compromised, /CREDENTIAL_LOCK_COMPROMISED/);
  await bounded(compromiseEntered.promise);
  const retired = `${authPath}.retired-lock`;
  fs.renameSync(`${authPath}.lock`, retired);
  fs.mkdirSync(`${authPath}.lock`);
  const replacement = fs.statSync(`${authPath}.lock`);
  compromiseRelease.resolve(); await rejected;
  assert.deepEqual(fs.readFileSync(authPath), beforeCompromise);
  assert.equal(fs.statSync(`${authPath}.lock`).ino, replacement.ino, "release must not remove another owner's replacement lock");
  fs.rmdirSync(`${authPath}.lock`); fs.rmdirSync(retired);

  const alias = `${authPath}.hardlink`;
  fs.linkSync(authPath, alias);
  let aliasCallbacks = 0;
  await assert.rejects(store.read("openai"), /CREDENTIAL_FILE_ALIAS/);
  await assert.rejects(store.modify("openai", async () => { aliasCallbacks++; }), /CREDENTIAL_FILE_ALIAS/);
  assert.equal(aliasCallbacks, 0); fs.unlinkSync(alias);
  const moved = `${agentDir}-canonical`;
  fs.renameSync(agentDir, moved); fs.symlinkSync(moved, agentDir, "junction");
  await assert.rejects(store.list(), /CREDENTIAL_PROFILE_IDENTITY/);
  fs.unlinkSync(agentDir); fs.renameSync(moved, agentDir);
  const valid = fs.readFileSync(authPath);
  for (const malformed of ["[]", "null", "{broken"]) {
    fs.writeFileSync(authPath, malformed);
    await assert.rejects(store.read("openai"), /CREDENTIAL_FILE_MALFORMED/);
  }
  fs.writeFileSync(authPath, valid);
  console.log("BOM/env/command/prototype, finite values, queued/in-flight abort, delete, compromise, hardlink/junction and malformed input proved.");
}

async function worker(mode, root, registryPath, agentDir, fixture) {
  traceLocks = mode === "inspect" && process.env.PI_TEST_LOCK_TRACE === "1";
  assert.equal(process.env.NODE_OPTIONS, undefined);
  assert.equal(process.env.NODE_PATH, undefined);
  assert.equal(process.env.OPENAI_API_KEY, undefined);
  const access = createAccessGuard(fs, hostProtected);
  const network = denyNetwork(net);
  const restoreResources = installResourceGuards(root);
  access.install();
  syncBuiltinESMExports();
  try {
    const allowedEnv = new Set(["APPDATA", "HOME", "LOCALAPPDATA", "TEMP", "TMP", "TMPDIR", "USERPROFILE", "XDG_CACHE_HOME", "XDG_CONFIG_HOME", "SystemRoot", "windir", "PI_TEST_LOCK_TRACE"].map((key) => key.toLowerCase()));
    // Windows can add ambient OS variables to a child despite an explicit env.
    // Drop them before application imports; do not admit host identity or PATH.
    for (const key of Object.keys(process.env)) if (!allowedEnv.has(key.toLowerCase())) delete process.env[key];
    assert.ok(Object.keys(process.env).every((key) => allowedEnv.has(key.toLowerCase())));
    for (const [key, relative] of [["HOME", "home"], ["USERPROFILE", "home"], ["APPDATA", path.join("appdata", "Roaming")], ["LOCALAPPDATA", path.join("appdata", "Local")], ["XDG_CONFIG_HOME", "config"], ["XDG_CACHE_HOME", "cache"], ["TMPDIR", "tmp"], ["TEMP", "tmp"], ["TMP", "tmp"]]) assert.equal(path.resolve(process.env[key]), path.resolve(root, relative), `${key} must remain in the fresh sandbox`);
    if (process.env.PI_TEST_LOCK_TRACE !== undefined) assert.equal(process.env.PI_TEST_LOCK_TRACE, "1");
    assert.equal(process.env.NODE_OPTIONS, undefined);
    assert.equal(process.env.NODE_PATH, undefined);
    assert.equal(process.env.OPENAI_API_KEY, undefined);
    assert.equal(path.resolve(os.homedir()), path.resolve(root, "home"), "worker SDK home must be the fresh synthetic root");
    if (mode === "setup" || mode === "setup-blank") {
      const { registerUser } = await import("../users/registry.mjs");
      const context = registerUser({ registryPath, id: "kevin", label: "Kevin synthetic", agentDir, sessionRoots: [fixture.sessionDir] });
      assert.equal(context.agentDir, agentDir);
      assert.equal(access.count, 0);
      assert.equal(network.attempts, 0);
      assert.deepEqual(restoreResources.counters, { protected: 0, network: 0, child: 0, outside: 0, keyring: 0 });
      return;
    }
    const [{ resolveUser }, { createUserCredentialStore }] = await Promise.all([
      import("../users/registry.mjs"), import("../users/credentials.mjs"),
    ]);
    const context = resolveUser({ registryPath, id: "kevin" });
    const store = createUserCredentialStore(context, { lockTimeoutMs: mode === "lock-error" ? 120 : 3000, sdkRoot: CORE });
    const authPath = path.join(agentDir, "auth.json");
    if (mode === "lock-error") {
      const originalMkdir = fs.mkdir;
      let attempts = 0;
      let failPermanently = false;
      fs.mkdir = function (target, ...args) {
        if (String(target) === `${authPath}.lock`) {
          const callback = args.at(-1);
          attempts++;
          if (failPermanently || attempts <= 3) {
            queueMicrotask(() => callback(Object.assign(new Error("synthetic filesystem failure with secret token"), { code: "EPERM", errno: -4048, syscall: "mkdir" })));
            return;
          }
        }
        return originalMkdir.call(this, target, ...args);
      };
      await store.modify("other", async (current) => current);
      assert.equal(attempts, 4, "transient EPERM must retry until lock acquisition succeeds");
      failPermanently = true;
      const beforePermanentFailure = attempts;
      const started = Date.now();
      await assert.rejects(store.modify("other", async (current) => current), (error) => {
        assert.equal(error.code, "CREDENTIAL_LOCK_FAILED");
        assert.deepEqual(error.cause, { code: "EPERM", errno: -4048, syscall: "mkdir" });
        assert.doesNotMatch(error.message, /secret token|EPERM/);
        return true;
      });
      assert.ok(attempts > beforePermanentFailure, "permanent EPERM must be retried");
      assert.ok(Date.now() - started < 1500, "permanent EPERM must stop at the short deadline");
    } else if (mode === "integration") {
      await integration(store, authPath, root);
    } else if (mode === "boundaries") {
      await boundaries(store, authPath, agentDir);
    } else if (mode === "contend") {
      onLockWait = () => process.stdout.write("LOCK_WAIT\n");
      await store.modify("other", async (current) => ({ ...current, key: "CROSS_PROCESS_OTHER" }));
    } else if (mode === "inspect") {
      const before = fs.existsSync(authPath) ? fs.readFileSync(authPath, "utf8") : undefined;
      assert.deepEqual(await store.read("openai"), fixture.openai);
      assert.deepEqual(await store.list(), [{ providerId: "openai", type: "oauth" }, { providerId: "other", type: "api_key" }]);
      assert.equal(fs.existsSync(authPath) ? fs.readFileSync(authPath, "utf8") : undefined, before);
      trace("inspect before SDK import");
      const watchImport = traceLocks ? setInterval(() => trace(`import activity ${JSON.stringify(restoreResources.activity())}`), 4000) : undefined;
      watchImport?.unref();
      const { ModelRuntime } = await import(pathToFileURL(path.join(CORE, "dist", "index.js")).href);
      clearInterval(watchImport);
      trace("inspect before SDK create");
      const runtime = await ModelRuntime.create({ credentials: store, modelsPath: path.join(root, "models.json"), modelsStorePath: path.join(root, "cache", "models.json"), refreshOnCreate: false, allowModelNetwork: false });
      trace("inspect before getAuth");
      const auth = await runtime.getAuth("openai");
      trace("inspect after getAuth");
      assert.equal(auth?.auth?.apiKey, "SYNTHETIC_A_OR_B_TOKEN");
    } else if (mode === "modify") {
      await store.modify("openai", async (current) => ({ ...current, access: `${current.access}-updated`, refresh: "SYNTHETIC_REFRESH", expires: 4_000_000_000_000, extra: { keep: true } }));
    } else if (mode === "undefined") {
      const before = fs.readFileSync(authPath, "utf8");
      assert.deepEqual(await store.modify("openai", async () => undefined), fixture.openai);
      assert.equal(fs.readFileSync(authPath, "utf8"), before);
    } else if (mode === "throw") {
      const before = fs.readFileSync(authPath, "utf8");
      await assert.rejects(store.modify("openai", async () => { throw new Error("synthetic callback failure"); }), /synthetic callback failure/);
      assert.equal(fs.readFileSync(authPath, "utf8"), before);
    } else if (mode === "legacy") {
      const legacyRecords = { ...fixture, alibaba: { type: "api_key", key: "SYNTHETIC_LEGACY" } };
      fs.writeFileSync(authPath, JSON.stringify(legacyRecords));
      let callbacks = 0;
      const before = fs.readFileSync(authPath);
      await assert.rejects(store.modify("alibaba-cloud", async () => { callbacks += 1; return undefined; }), /CREDENTIAL_LEGACY_MUTATION_BLOCKED/);
      await assert.rejects(store.delete("alibaba-cloud"), /CREDENTIAL_LEGACY_MUTATION_BLOCKED/);
      assert.equal(callbacks, 0);
      assert.deepEqual(fs.readFileSync(authPath), before);
      await legacyReadCases(store, authPath);
    } else if (mode === "missing") {
      assert.equal(await store.read("openai"), undefined);
      assert.deepEqual(await store.list(), []);
      assert.equal(fs.existsSync(authPath), false);
      await store.modify("openai", async () => ({ type: "api_key", key: "SYNTHETIC_MISSING_FILE" }));
      assert.equal(JSON.parse(fs.readFileSync(authPath, "utf8")).openai.key, "SYNTHETIC_MISSING_FILE");
    } else if (mode === "hold") {
      let entered;
      const started = new Promise((resolve) => { entered = resolve; });
      const writing = store.modify("openai", async (current) => {
        entered();
        await new Promise((resolve) => process.stdin.once("data", resolve));
        return { ...current, access: "SERIALIZED" };
      });
      await started;
      process.stdout.write("LOCK_HELD\n");
      await writing;
    }
    assert.equal(access.count, 0);
    assert.equal(network.attempts, 0);
    assert.deepEqual(restoreResources.counters, { protected: 0, network: 0, child: 0, outside: 0, keyring: 0 });
  } finally {
    restoreResources();
    access.restore();
    network.restore();
    syncBuiltinESMExports();
  }
}

class WorkerSupervisor {
  constructor(sandbox) { this.sandbox = sandbox; this.children = new Set(); }
  start(args) {
    assert.equal(args[0], SCRIPT);
    assert.equal(args[1], "--worker");
    assert.equal(args[3], this.sandbox.root);
    assert.ok(inside(this.sandbox.root, args[4]) && inside(this.sandbox.root, args[5]));
    const child = spawn(process.execPath, args, {
      cwd: this.sandbox.root, env: this.sandbox.env, windowsHide: true,
      stdio: args[2] === "hold" ? ["pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"],
    });
    const record = { child, stdout: "", stderr: "", error: null, closed: false, stdoutClosed: false, stderrClosed: false, waiters: new Set() };
    this.children.add(record);
    const append = (key, chunk) => { record[key] += chunk.toString(); for (const wake of [...record.waiters]) wake(); };
    child.stdout.on("data", (chunk) => append("stdout", chunk));
    child.stderr.on("data", (chunk) => append("stderr", chunk));
    child.stdout.on("error", (error) => { record.error ??= error; });
    child.stderr.on("error", (error) => { record.error ??= error; });
    child.stdout.on("close", () => { record.stdoutClosed = true; });
    child.stderr.on("close", () => { record.stderrClosed = true; });
    child.on("error", (error) => { record.error ??= error; });
    if (child.stdin) child.stdin.on("error", (error) => { record.error ??= error; });
    record.closedPromise = new Promise((resolve) => child.on("close", (code, signal) => {
      record.closed = true; record.code = code; record.signal = signal; resolve(record);
    }));
    return record;
  }
  diagnostic(record, phase) {
    return new Error(`${phase}: ${record.error ? `${record.error.code ?? record.error.name}: ${record.error.message}` : `exit=${record.code} signal=${record.signal ?? "none"}`}\nstdout:\n${record.stdout}\nstderr:\n${record.stderr}`);
  }
  async waitOutput(record, text, phase, ms = 10_000) {
    const found = () => record.stdout.includes(text);
    if (found()) return;
    let wake;
    let cancelled = false;
    const done = record.closedPromise.then(() => { throw this.diagnostic(record, `${phase}: closed before ${text}`); });
    const output = (async () => {
      while (!found() && !cancelled) {
        await new Promise((resolve) => { wake = resolve; record.waiters.add(wake); });
        record.waiters.delete(wake);
      }
    })();
    try { await bounded(Promise.race([output, done]), ms, `${phase}: timed out waiting for ${text}; ${this.diagnostic(record, phase).message}`); }
    finally { cancelled = true; if (wake) { record.waiters.delete(wake); wake(); } }
  }
  async waitClosed(record, phase, ms = 20_000) {
    await bounded(record.closedPromise, ms, `${phase}: child did not close; ${this.diagnostic(record, phase).message}`);
    if (!record.stdoutClosed || !record.stderrClosed) throw this.diagnostic(record, `${phase}: output pipes did not finalize`);
    if (record.error || record.code !== 0 || record.signal) throw this.diagnostic(record, phase);
    return record;
  }
  async run(args, phase) { return this.waitClosed(this.start(args), phase); }
  allClosed() { return [...this.children].every(({ closed, stdoutClosed, stderrClosed }) => closed && stdoutClosed && stderrClosed); }
  async stopOwned() {
    const failures = [];
    for (const record of this.children) {
      if (record.closed) continue;
      try {
        record.child.kill("SIGTERM");
        try { await bounded(record.closedPromise, 2_000, "terminate grace expired"); }
        catch { if (!record.closed) record.child.kill("SIGKILL"); }
        if (!record.closed) await bounded(record.closedPromise, 5_000, "owned child remained open after kill");
        if (!record.stdoutClosed || !record.stderrClosed) throw new Error("owned child closed without finalizing output pipes");
      } catch (error) { failures.push(error.message); }
    }
    return failures;
  }
}

async function main() {
  const debugInspect = process.argv.includes("--debug-inspect");
  const sandbox = createSandbox("users-credentials");
  if (debugInspect) sandbox.env.PI_TEST_LOCK_TRACE = "1";
  const supervisor = new WorkerSupervisor(sandbox);
  let phase = "sandbox setup";
  let cleanupStarted = false;
  try {
    assert.equal(fs.realpathSync.native(sandbox.root), sandbox.root, "sandbox root is canonical and newly allocated");
    const agentDir = sandbox.mkdir("profile", "agent");
    const sessionDir = sandbox.mkdir("profile", "sessions");
    sandbox.mkdir("home", ".pi", "users");
    const registryPath = path.join(sandbox.root, "home", ".pi", "users", "registry.json");
    phase = "setup worker";
    await supervisor.run([SCRIPT, "--worker", "setup", sandbox.root, registryPath, agentDir, JSON.stringify({ sessionDir })], phase);
    const authPath = path.join(agentDir, "auth.json");
    const fixture = {
      openai: { type: "oauth", access: "SYNTHETIC_A_OR_B_TOKEN", refresh: "SYNTHETIC_REFRESH", expires: 4_000_000_000_000, extra: { keep: true } },
      other: { type: "api_key", key: "SYNTHETIC_OTHER", env: { accountId: "synthetic" } },
      unrelated: { opaque: [1, 2, 3] },
    };
    fs.writeFileSync(authPath, JSON.stringify(fixture, null, 2));
    const before = fs.readFileSync(authPath, "utf8");
    phase = "inspect/public SDK";
    const inspect = supervisor.start([SCRIPT, "--worker", "inspect", sandbox.root, registryPath, agentDir, JSON.stringify(fixture)]);
    await supervisor.waitClosed(inspect, phase);
    assert.equal(fs.readFileSync(authPath, "utf8"), before, "read/list/public getAuth must preserve original auth bytes");
    if (!debugInspect) {
      for (const mode of ["undefined", "throw", "legacy", "lock-error"]) { phase = `${mode} worker`; await supervisor.run([SCRIPT, "--worker", mode, sandbox.root, registryPath, agentDir, JSON.stringify(fixture)], phase); }
      // Legacy cases intentionally replace the synthetic file with independent records.
      // Start the lock scenario from its own fixture, as boundary/integration cases do.
      fs.writeFileSync(authPath, JSON.stringify(fixture));
      phase = "native/app lock contention";
      const holder = supervisor.start([SCRIPT, "--worker", "hold", sandbox.root, registryPath, agentDir, JSON.stringify(fixture)]);
      await supervisor.waitOutput(holder, "LOCK_HELD", "lock holder ready");
      const contender = supervisor.start([SCRIPT, "--worker", "contend", sandbox.root, registryPath, agentDir, JSON.stringify(fixture)]);
      await supervisor.waitOutput(contender, "LOCK_WAIT", "cross-process lock contention");
      assert.equal(JSON.parse(fs.readFileSync(authPath)).other.key, fixture.other.key);
      holder.child.stdin.end("release\n");
      await Promise.all([supervisor.waitClosed(holder, "lock holder"), supervisor.waitClosed(contender, "lock contender")]);
      const final = JSON.parse(fs.readFileSync(authPath, "utf8"));
      assert.equal(final.openai.access, "SERIALIZED");
      assert.equal(final.other.key, "CROSS_PROCESS_OTHER");
      assert.deepEqual(final.openai.extra, { keep: true });
      assert.deepEqual(final.unrelated, fixture.unrelated);
      for (const mode of ["boundaries", "integration"]) {
        phase = `${mode} worker`;
        fs.writeFileSync(authPath, JSON.stringify(fixture));
        const result = await supervisor.run([SCRIPT, "--worker", mode, sandbox.root, registryPath, agentDir, JSON.stringify(fixture)], mode);
        console.log(result.stdout.trim());
      }
      const blankDir = sandbox.mkdir("profile", "blank-agent");
      const blankSession = sandbox.mkdir("profile", "blank-sessions");
      const blankRegistry = path.join(sandbox.root, "home", ".pi", "users", "blank-registry.json");
      phase = "blank profile setup";
      await supervisor.run([SCRIPT, "--worker", "setup-blank", sandbox.root, blankRegistry, blankDir, JSON.stringify({ sessionDir: blankSession })], phase);
      phase = "missing auth file";
      await supervisor.run([SCRIPT, "--worker", "missing", sandbox.root, blankRegistry, blankDir, "{}"], phase);
      assert.equal(JSON.parse(fs.readFileSync(path.join(blankDir, "auth.json"), "utf8")).openai.key, "SYNTHETIC_MISSING_FILE");
    }
    phase = "worker close verification";
    assert.equal(supervisor.allClosed(), true, "every run-owned worker and output pipe closes before cleanup");
    phase = "run-owned sandbox cleanup";
    cleanupStarted = true;
    assert.equal(sandbox.cleanup(), true, "cleanup removes only the fresh canonical run root");
    console.log("Selected-file credential store smoke passed; synthetic fixture cleaned.");
  } catch (primary) {
    const termination = await supervisor.stopOwned();
    process.stderr.write(`PRIMARY_FAILURE phase=${phase}\n${primary.stack ?? primary.message}\n`);
    if (termination.length) process.stderr.write(`OWNED_CHILD_FINALIZATION_FAILURE\n${termination.join("\n")}\n`);
    process.stderr.write(cleanupStarted ? `SANDBOX_CLEANUP_OUTCOME_UNCERTAIN ${sandbox.root}\n` : `SANDBOX_PRESERVED ${sandbox.root}\n`);
    throw primary;
  }
}

if (process.argv[2] === "--worker") {
  const [, , , mode, root, registryPath, agentDir, rawFixture] = process.argv;
  const fixture = JSON.parse(rawFixture);
  await worker(mode, root, registryPath, agentDir, fixture);
  process.exit(0);
} else await main();
