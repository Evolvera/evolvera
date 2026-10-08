// SOURCE checkpoint only. Parent admission is required before executing this native-SDK fixture.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import cp from "node:child_process";
import net from "node:net";
import tls from "node:tls";
import http from "node:http";
import https from "node:https";
import dns from "node:dns";
import http2 from "node:http2";
import dgram from "node:dgram";
import workers from "node:worker_threads";
import v8 from "node:v8";
import sea from "node:sea";
import crypto from "node:crypto";
import Module, { syncBuiltinESMExports, registerHooks } from "node:module";
import { createHash, randomBytes } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createSandbox } from "./lib/users-sandbox.mjs";

const SCRIPT = fileURLToPath(import.meta.url);
const SOURCE = path.resolve(path.dirname(SCRIPT), "../..");
// Pinned public CODE identity: parent verifies the NVM alias; permission-bound children use only its canonical root.
const SDK_REQUESTED = path.resolve("C:/nvm4w/nodejs/node_modules/@earendil-works/pi-coding-agent");
const SDK = path.resolve("C:/Users/kevin/AppData/Local/nvm/v24.20.0/node_modules/@earendil-works/pi-coding-agent");
const AI = path.join(SDK, "node_modules/@earendil-works/pi-ai/dist/index.js");
const COMPAT = path.join(SDK, "node_modules/@earendil-works/pi-ai/dist/compat.js");
const SDK_ABSENT_PATHS = Object.freeze([path.join(SDK, "dist/package.json"), path.join(SDK, "src")]);
const FILES = ["extensions/usuario.ts", ...["registry", "ownership", "credentials", "settings", "resources", "environment", "runtime", "launcher", "switch-readiness"].map((name) => `scripts/users/${name}.mjs`), "scripts/compat/alibaba-users.mjs", "scripts/compat/subagents-users.mjs", "scripts/test/users-switch.smoke.mjs", "scripts/test/lib/users-sandbox.mjs"];
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const token = () => randomBytes(24).toString("hex");
const within = (root, file) => { const rel = path.relative(root, file); return rel === "" || rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel); };
const STARTUP_READY_TIMEOUT_MS = 120_000;
const bounded = (promise, label, timeout = 30_000) => {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`UNVERIFIED_TIMEOUT ${label}; preserve namespace, no signal/cleanup/retry`)), timeout); })]).finally(() => clearTimeout(timer));
};
// Diagnostic output stays on our existing stderr pipe; never inspect a failed namespace for evidence.
const diagnostic = (phase) => process.stderr.write(`SWITCH_DIAGNOSTIC ${JSON.stringify({ pid: process.pid, phase, time: Date.now() })}\n`);
const trustedRegisterHooks = registerHooks;
const originalSpawn = cp.spawn;
const originalPrototypeSpawn = cp.ChildProcess.prototype.spawn;
const originalCreateRequire = Module.createRequire;

// Captured readFileSync still calls patched public fs methods. Keep CODE hash IO private and non-reentrant.
const readCodeBytes = (() => {
  const open = fs.openSync, stat = fs.fstatSync, read = fs.readSync, close = fs.closeSync;
  return (file) => {
    const fd = open(file, "r");
    try {
      const before = stat(fd);
      assert.ok(before.isFile() && before.nlink === 1 && Number.isSafeInteger(before.size) && before.size >= 0, "CODE_READ_FILE_IDENTITY");
      const bytes = Buffer.alloc(before.size);
      let offset = 0;
      while (offset < bytes.length) {
        const count = read(fd, bytes, offset, bytes.length - offset, offset);
        assert.ok(count > 0, "CODE_READ_SHORT_READ");
        offset += count;
      }
      const after = stat(fd);
      assert.ok(after.isFile() && ["dev", "ino", "nlink", "size", "mtimeMs", "ctimeMs"].every((key) => after[key] === before[key]), "CODE_READ_CHANGED");
      return bytes;
    } finally {
      close(fd);
    }
  };
})();

function owned(root, file) {
  const result = path.resolve(file);
  assert.ok(within(root, result), "FIXTURE_PATH_ESCAPE");
  return result;
}
function verifyTree(root, directory = root) {
  assert.equal(fs.realpathSync.native(directory), directory);
  const stat = fs.lstatSync(directory);
  assert.ok(stat.isDirectory() && !stat.isSymbolicLink());
  for (const name of fs.readdirSync(directory)) {
    const file = owned(root, path.join(directory, name)), entry = fs.lstatSync(file);
    assert.equal(entry.isSymbolicLink(), false);
    if (entry.isDirectory()) verifyTree(root, file);
    else assert.ok(entry.isFile() && entry.nlink === 1);
  }
}

// Finite, sealed readonly CODE inventory, constructed before SDK import. No HOME discovery.
function sdkInventory() {
  const result = {}, directories = [];
  const canonical = fs.realpathSync.native(SDK);
  assert.equal(canonical, SDK, "SDK_CODE_ROOT_CANONICAL");
  assert.equal(fs.realpathSync.native(SDK_REQUESTED), canonical, "SDK_CODE_ROOT_ALIAS_IDENTITY");
  const visit = (directory) => {
    directories.push(directory);
    for (const name of fs.readdirSync(directory)) {
      const file = path.join(directory, name), stat = fs.lstatSync(file);
      assert.equal(stat.isSymbolicLink(), false, "SDK_CODE_ALIAS");
      if (stat.isDirectory()) { if (![".cache", ".git", "coverage"].includes(name)) visit(file); }
      else if (/\.(?:[cm]?js|json|ts|wasm|md|txt|css)$/.test(name) && !/^(?:auth|settings|models|mcp)\.json$/i.test(name)) {
        assert.ok(stat.isFile() && stat.nlink === 1);
        result[file] = digest(fs.readFileSync(file));
      }
    }
  };
  visit(canonical);
  const absent = SDK_ABSENT_PATHS.map((file) => {
    const parent = path.dirname(file);
    assert.ok(directories.includes(parent), "SDK_ABSENCE_PARENT_ADMITTED");
    const parentStat = fs.lstatSync(parent);
    assert.ok(parentStat.isDirectory() && !parentStat.isSymbolicLink());
    assert.equal(fs.realpathSync.native(parent), parent);
    const identity = Object.fromEntries(["dev", "ino", "birthtimeMs"].map((key) => [key, parentStat[key]]));
    assert.ok(Object.values(identity).every(Number.isFinite), "SDK_ABSENCE_PARENT_IDENTITY");
    assert.throws(() => fs.lstatSync(file), (error) => error.code === "ENOENT", "SDK_METADATA_ABSENCE");
    return Object.freeze({ path: file, parent, identity: Object.freeze(identity) });
  });
  const pkg = JSON.parse(fs.readFileSync(path.join(canonical, "package.json"), "utf8"));
  assert.equal(pkg.name, "@earendil-works/pi-coding-agent"); assert.equal(pkg.version, "1.0.1");
  return Object.freeze({ requested: SDK_REQUESTED, canonical, files: Object.freeze(result), directories: Object.freeze(directories), absent: Object.freeze(absent) });
}

const verifySdkAbsence = (() => {
  const privateLstat = fs.lstatSync, privateRealpath = fs.realpathSync.native;
  return function verifySdkAbsence(grant, file, lstat = privateLstat, realpath = privateRealpath) {
    const entry = grant.sdk.absent.find((candidate) => candidate.path === file);
    assert.ok(SDK_ABSENT_PATHS.includes(file) && entry && entry.parent === path.dirname(file), "SDK_ABSENCE_GRANT_IDENTITY");
    assert.ok(grant.sdk.directories.includes(entry.parent), "SDK_ABSENCE_PARENT_ADMITTED");
    const parentStat = lstat(entry.parent);
    assert.ok(parentStat.isDirectory() && !parentStat.isSymbolicLink());
    assert.equal(realpath(entry.parent), entry.parent);
    assert.deepEqual(entry.identity, Object.fromEntries(["dev", "ino", "birthtimeMs"].map((key) => [key, parentStat[key]])), "SDK_ABSENCE_PARENT_IDENTITY");
    assert.throws(() => lstat(file), (error) => error.code === "ENOENT", "SDK_METADATA_ABSENCE");
  };
})();

// Identity-preserving translation of ONE parent-verified SDK CODE alias, never an additional filesystem grant.
function canonicalSdkAlias(grant, value) {
  if (typeof value === "number") return value;
  const url = value instanceof URL ? value : typeof value === "string" && value.startsWith("file:") ? new URL(value) : undefined;
  if (url && (url.protocol !== "file:" || url.search || url.hash)) return value;
  const text = url ? fileURLToPath(url) : typeof value === "string" ? value : Buffer.isBuffer(value) ? value.toString() : undefined;
  if (text === undefined) return value;
  const file = path.resolve(text);
  if (!within(SDK_REQUESTED, file)) return value;
  assert.equal(grant.sdk.requested, SDK_REQUESTED); assert.equal(grant.sdk.canonical, SDK);
  const canonical = path.join(SDK, path.relative(SDK_REQUESTED, file));
  assert.ok(within(SDK, canonical));
  if (url) return value instanceof URL ? pathToFileURL(canonical) : pathToFileURL(canonical).href;
  return Buffer.isBuffer(value) ? Buffer.from(canonical) : canonical;
}

function cleanEnvironment(home, root) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) if (["systemroot", "windir", "systemdrive"].includes(key.toLowerCase())) env[key] = value;
  Object.assign(env, { HOME: home, USERPROFILE: home, APPDATA: path.join(home, "AppData/Roaming"), LOCALAPPDATA: path.join(home, "AppData/Local"),
    XDG_CONFIG_HOME: path.join(home, ".config"), XDG_CACHE_HOME: path.join(home, ".cache"),
    TMP: path.join(home, "Temp"), TEMP: path.join(home, "Temp"), TMPDIR: path.join(home, "Temp"), PATH: path.join(root, "empty-bin"),
    HOMEDRIVE: path.parse(home).root.slice(0, 2), HOMEPATH: home.slice(2), USERNAME: "pi-switch-fixture", USERDOMAIN: "PI-SWITCH-FIXTURE", LOGONSERVER: "\\\\PI-SWITCH-FIXTURE" });
  return env;
}

// Native discovery is delegated unchanged; acceptance of its result is finite and hash-bound.
// No hook handle (and hence no deregistration authority) escapes this trusted closure.
const AUDITED_BUILTINS = new Set([
  "assert", "assert/strict", "async_hooks", "buffer", "child_process", "console", "constants", "crypto",
  "diagnostics_channel", "dns", "dns/promises", "dgram", "events", "fs", "fs/promises",
  "http", "http2", "https", "module", "net", "os", "path", "path/posix", "path/win32",
  "perf_hooks", "process", "querystring", "readline", "readline/promises", "sea", "stream",
  "stream/promises", "stream/web", "string_decoder", "timers", "timers/promises", "tls",
  "tty", "url", "util", "util/types", "v8", "vm", "worker_threads", "zlib",
]);
const permissionArgs = (grant, supervisor = false) => {
  for (const directory of [grant.root, grant.sdk.canonical]) {
    assert.ok(path.isAbsolute(directory)); assert.equal(fs.realpathSync.native(directory), directory);
    assert.ok(!/[*,\r\n]/.test(directory), "PERMISSION_GRANT_NOT_LITERAL");
  }
  return ["--permission", `--allow-fs-read=${grant.root}`, `--allow-fs-read=${grant.sdk.canonical}`,
    `--allow-fs-write=${grant.root}`, ...(supervisor ? ["--allow-child-process"] : [])];
};
function installCodeHooks(grant, refuse) {
  const rawRead = readCodeBytes, rawStat = fs.lstatSync, rawReal = fs.realpathSync.native;
  const files = Object.freeze({ ...grant.sdk.files, ...grant.codeFiles });
  const validate = (url, source, reject = refuse) => {
    if (url.startsWith("node:")) {
      if (!AUDITED_BUILTINS.has(url.slice(5))) reject();
      return;
    }
    let parsed;
    try { parsed = new URL(url); } catch { reject(); }
    if (parsed.protocol !== "file:" || parsed.search || parsed.hash) reject();
    const file = fileURLToPath(parsed);
    if (pathToFileURL(file).href !== url || !Object.hasOwn(files, file) || /\.node$/i.test(file)) reject();
    const stat = rawStat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || rawReal(file) !== file) reject();
    if (digest(rawRead(file)) !== files[file]) reject();
    if (source !== undefined && source !== null && digest(Buffer.from(source)) !== files[file]) reject();
  };
  // Pure decision controls: no mutation, import, resolution or evaluation is attempted.
  let controls = 0;
  const expected = () => { controls++; throw new Error("EXPECTED_CODE_DENIAL"); };
  for (const url of ["data:text/javascript,0", "https://invalid.invalid/code.mjs",
    pathToFileURL(path.join(grant.root, "unknown-code.mjs")).href,
    pathToFileURL(path.join(path.dirname(grant.root), "outside-code.mjs")).href]) {
    assert.throws(() => validate(url, undefined, expected), /EXPECTED_CODE_DENIAL/);
  }
  const admitted = pathToFileURL(grant.jitiAdapter).href;
  validate(admitted, rawRead(grant.jitiAdapter));
  assert.throws(() => validate(admitted, Buffer.concat([rawRead(grant.jitiAdapter), Buffer.from("\n// mutated")]), expected), /EXPECTED_CODE_DENIAL/);
  assert.equal(controls, 5);
  trustedRegisterHooks({
    resolve(specifier, context, nextResolve) {
      // Canonicalize the verified SDK identity BEFORE native resolution; discovery/context remain native.
      // Exact staged dependency/SDK peer aliases, never a node_modules/HOME fallback.
      const redirect = specifier === "jiti" ? grant.jitiAdapter : Object.hasOwn(grant.codeAliases, specifier) ? grant.codeAliases[specifier] : undefined;
      const result = redirect ? { url: pathToFileURL(redirect).href, shortCircuit: true } : nextResolve(canonicalSdkAlias(grant, specifier), context);
      validate(result.url);
      return result;
    },
    load(url, context, nextLoad) {
      validate(url);
      const result = nextLoad(url, context);
      if (!url.startsWith("node:") && result.source == null) refuse();
      validate(url, result.source);
      return result; // Retain native formats, conditions, source and CJS semantics.
    },
  });
  return controls;
}

function installGuards(grant) {
  const root = grant.root;
  const rawStat = fs.lstatSync, rawReal = fs.realpathSync.native, rawRead = readCodeBytes;
  // Normalize the public constructor BEFORE CJS parent lookup; changing nextResolve.parentURL is insufficient in Node24.
  Module.createRequire = (filename) => originalCreateRequire(canonicalSdkAlias(grant, filename));
  const requestedPackage = path.join(SDK_REQUESTED, "package.json");
  assert.equal(canonicalSdkAlias(grant, requestedPackage), path.join(SDK, "package.json"));
  const neighbour = path.join(`${SDK_REQUESTED}-outside`, "package.json");
  assert.equal(canonicalSdkAlias(grant, neighbour), neighbour);
  const escaped = path.resolve(SDK_REQUESTED, "..", "outside-code.mjs");
  assert.equal(canonicalSdkAlias(grant, escaped), escaped);
  const counters = { outside: 0, protected: 0, network: 0, child: 0, keyring: 0, worker: 0, module: 0 };
  const descriptors = new Map(), pending = new Set();
  let broker;
  let expectedDenial = false;
  const negativeControls = { worker: 0, module: 0, code: 0 };
  const expectedDenied = { gitProbe: 0 };
  const deniedGitProbes = [];
  const gitProbeArguments = Object.freeze([
    Object.freeze(["rev-parse", "--is-inside-work-tree"]),
    Object.freeze(["branch", "--show-current"]),
  ]);
  let lastAccess; // Diagnostic only: op + sandbox-relative path of the fs call being checked.
  const deny = (kind) => {
    if (expectedDenial) negativeControls[kind]++; else counters[kind]++;
    let where = "";
    if (lastAccess) {
      const target = typeof lastAccess.file === "string" ? path.resolve(lastAccess.file) : undefined;
      where = `:${lastAccess.op}:${target === undefined ? typeof lastAccess.file : within(root, target) ? path.relative(root, target).replaceAll("\\", "/") : "<outside>"}`;
    }
    throw Object.assign(new Error(`SWITCH_RESOURCE_BOUNDARY_${kind}`), { code: `SWITCH_RESOURCE_BOUNDARY_${kind}${where}` });
  };
  const missing = new Set([path.dirname(SDK), path.dirname(grant.sdk.canonical)].flatMap((base) => ["agent/dist/index.js", "tui/dist/index.js", "ai/dist/compat.js", "ai/dist/oauth.js", "ai/dist/providers/all.js"].map((relative) => path.join(base, relative))));
  for (let dir = path.dirname(root); ; dir = path.dirname(dir)) {
    for (const marker of [".pi", ".pi/memory", ".agents", ".agents/skills", ".git", "AGENTS.md", "CLAUDE.md"]) missing.add(path.join(dir, marker));
    if (dir === path.dirname(dir)) break;
  }
  const check = (value, write = false, metadata = false, operation) => {
    if (typeof value === "number") {
      if (value === 0 && !write || (value === 1 || value === 2) && write) return;
      const descriptor = descriptors.get(value);
      if (!descriptor || write && !descriptor.write) deny("outside");
      if (descriptor.file) check(descriptor.file, write);
      return;
    }
    const file = path.resolve(value instanceof URL ? fileURLToPath(value) : String(value));
    if (!write && !metadata && /\.(?:[cm]?[jt]sx?|wasm|node)$/i.test(file) &&
        !Object.hasOwn(grant.sdk.files, file) && !Object.hasOwn(grant.codeFiles, file)) deny("module");
    if (!within(root, file)) {
      if (grant.sdk.absent.some((entry) => entry.path === file)) {
        if (write || !metadata || operation !== "existsSync") deny("outside");
        verifySdkAbsence(grant, file, rawStat, rawReal);
        return; // The guarded native existsSync call below must observe the real ENOENT.
      }
      if (write || !Object.hasOwn(grant.sdk.files, file) && !grant.sdk.directories.includes(file)) deny("outside");
      const stat = rawStat(file);
      if (stat.isSymbolicLink() || stat.isFile() && stat.nlink !== 1 || rawReal(file) !== file) deny("outside");
      // Jiti and public fs reads must enforce content, not merely corpus membership.
      if (stat.isFile() && digest(rawRead(file)) !== grant.sdk.files[file]) deny("module");
      return;
    }
    if (grant.role === "child" && within(path.join(root, "profiles"), file) && !within(grant.home, file)) {
      // The parent reserves one nonexistent namespace for the requested create case.
      // Only mkdir may write there; other-profile files, credentials/history/stores stay protected.
      const freshMkdir = write && operation === "mkdir" && within(grant.freshCreationRoot, file);
      if (!freshMkdir && (write || !metadata && path.basename(file) !== "settings.json")) deny("protected");
    }
    let probe = root;
    for (const part of path.relative(root, file).split(path.sep).filter(Boolean)) {
      probe = path.join(probe, part);
      try { const stat = rawStat(probe); if (stat.isSymbolicLink() || stat.isFile() && stat.nlink !== 1 || rawReal(probe) !== probe) deny("outside"); }
      catch (error) { if (["ENOENT", "ENOTDIR"].includes(error.code)) break; throw error; }
    }
    if (write && (within(grant.stage, file) || within(file, grant.stage) || Object.hasOwn(grant.codeFiles, file))) deny("outside");
    if (!write && Object.hasOwn(grant.codeFiles, file) && digest(rawRead(file)) !== grant.codeFiles[file]) deny("module");
  };
  const writesFlags = (flags) => typeof flags === "number" ? !!(flags & (fs.constants.O_WRONLY | fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_APPEND)) : /[wa+]/.test(flags ?? "r");
  const tracked = (promise) => { pending.add(promise); return promise.finally(() => pending.delete(promise)); };
  const operations = { access: [0], appendFile: [0], chmod: [0], chown: [0], copyFile: [0, 1], cp: [0, 1], exists: [0], lstat: [0], stat: [0], realpath: [0], readlink: [0], mkdir: [0], open: [0], opendir: [0], readFile: [0], readdir: [0], rename: [0, 1], rm: [0], rmdir: [0], truncate: [0], unlink: [0], utimes: [0], writeFile: [0] };
  const mutations = new Set(["appendFile", "chmod", "chown", "mkdir", "rename", "rm", "rmdir", "truncate", "unlink", "utimes", "writeFile"]);
  const patch = (object, name, base, indexes, promises) => {
    const original = object[name];
    if (typeof original !== "function") return;
    const wrap = (original) => function (...args) {
      for (const index of indexes) args[index] = canonicalSdkAlias(grant, args[index]);
      const write = mutations.has(base) || base === "open" && writesFlags(args[1]) || /File$/.test(base) && writesFlags(args[1]?.flag);
      if (grant.role === "child" && base === "mkdir" && path.resolve(String(args[0])) === path.join(root, "profiles")) {
        // Product's recursive parent mkdir is idempotent ONLY on the admitted existing inode.
        const parent = path.join(root, "profiles"), stat = rawStat(parent);
        if (!stat.isDirectory() || stat.isSymbolicLink() || rawReal(parent) !== parent ||
            !["dev", "ino", "birthtimeMs"].every((key) => stat[key] === grant.profilesIdentity[key]) || args[1]?.recursive !== true) deny("protected");
        if (promises) return Promise.resolve(undefined);
        if (name.endsWith("Sync")) return undefined;
        queueMicrotask(() => args.at(-1)(null, undefined)); return;
      }
      if (grant.role === "child" && base === "mkdir" && path.resolve(String(args[0])) === root) {
        // registerUser's recursive mkdir(dirname(registry)) targets the existing run root, an ancestor of stage.
        // Idempotent no-op ONLY for the exact canonical existing root; nothing is created or delegated.
        const stat = rawStat(root);
        if (!stat.isDirectory() || stat.isSymbolicLink() || rawReal(root) !== root || args[1]?.recursive !== true) deny("outside");
        if (promises) return Promise.resolve(undefined);
        if (name.endsWith("Sync")) return undefined;
        queueMicrotask(() => args.at(-1)(null, undefined)); return;
      }
      if (typeof args[0] === "string" && missing.has(path.resolve(args[0]))) {
        if (!["exists", "stat", "lstat", "realpath"].includes(base) || write) deny("outside");
        const error = Object.assign(new Error("owned synthetic ancestor absence"), { code: "ENOENT" });
        if (name === "existsSync") return false;
        if (promises) return Promise.reject(error);
        if (typeof args.at(-1) === "function") { queueMicrotask(() => args.at(-1)(base === "exists" ? false : error)); return; }
        throw error;
      }
      lastAccess = { op: name, file: args[indexes[0]] };
      for (const index of indexes) check(args[index], ["copyFile", "cp"].includes(base) ? index === 1 : write, ["exists", "stat", "lstat", "realpath", "readlink", "readdir", "opendir", "access"].includes(base), base === "exists" ? name : base);
      const callback = args.at(-1);
      if (!promises && !name.endsWith("Sync") && typeof callback === "function") {
        const ticket = {}; pending.add(ticket);
        args[args.length - 1] = (error, result, ...rest) => {
          if (!error && base === "open") descriptors.set(result, { write, file: args[0] });
          pending.delete(ticket); callback(error, result, ...rest);
        };
      }
      let result;
      try { result = original.apply(this, args); } catch (error) {
        // Diagnostic only: name the denied op + sandbox-relative target of a native permission denial.
        if (error?.code === "ERR_ACCESS_DENIED") {
          const target = typeof args[0] === "string" ? path.resolve(args[0]) : undefined;
          const where = target === undefined ? typeof args[0] : within(root, target) ? path.relative(root, target).replaceAll("\\", "/") : "<outside>";
          try { Object.defineProperty(error, "code", { value: `ERR_ACCESS_DENIED:${name}:${where}:${String(error.permission ?? "")}`, configurable: true }); } catch {}
        }
        throw error;
      }
      if (base === "open" && name.endsWith("Sync")) descriptors.set(result, { write, file: args[0] });
      if (promises && result?.then) return tracked(result).then((handle) => {
        if (base === "open") {
          const fd = handle.fd; descriptors.set(fd, { write, file: args[0] });
          for (const method of ["read", "readFile", "readv", "write", "writeFile", "writev", "stat", "sync", "datasync", "truncate", "chmod", "chown", "utimes", "close"]) {
            const fn = handle[method]; if (!fn) continue;
            handle[method] = (...values) => { check(fd, /^(?:write|truncate|chmod|chown|utimes)/.test(method)); return tracked(fn.apply(handle, values)).then((value) => { if (method === "close") descriptors.delete(fd); return value; }); };
          }
          for (const method of ["createReadStream", "createWriteStream", "readLines", "readableWebStream"]) if (typeof handle[method] === "function") handle[method] = () => deny("outside");
          handle[Symbol.asyncDispose] = () => handle.close();
        }
        return handle;
      });
      return result;
    };
    const guarded = wrap(original);
    if (base === "realpath" && original.native) guarded.native = wrap(original.native);
    object[name] = guarded;
  };
  for (const [base, indexes] of Object.entries(operations)) {
    patch(fs, base, base, indexes, false); patch(fs, `${base}Sync`, base, indexes, false); patch(fs.promises, base, base, indexes, true);
  }
  for (const name of ["close", "fstat", "fsync", "fdatasync", "read", "readv", "write", "writev", "ftruncate", "fchmod", "fchown", "futimes"]) for (const suffix of ["", "Sync"]) {
    const key = name + suffix, original = fs[key]; if (!original) continue;
    fs[key] = function (fd, ...args) {
      check(fd, /^(?:write|ftruncate|fchmod|fchown|futimes)/.test(name));
      const callback = args.at(-1);
      if (!suffix && typeof callback === "function") {
        const ticket = {}; pending.add(ticket);
        args[args.length - 1] = (error, ...values) => { if (!error && name === "close") descriptors.delete(fd); pending.delete(ticket); callback(error, ...values); };
      }
      // Node's Permission Model disables fsync/fdatasync outright (ERR_ACCESS_DENIED). Product code
      // (registry writeRegistryAtomic) fsyncs its own tmp file; under this harness only durability
      // is untestable, so an fsync on an already-checked owned descriptor is acknowledged without I/O.
      if ((name === "fsync" || name === "fdatasync") && descriptors.get(fd)?.file && within(root, path.resolve(String(descriptors.get(fd).file)))) {
        if (suffix) return undefined;
        queueMicrotask(() => args.at(-1)(null)); return;
      }
      const result = original.call(this, fd, ...args); if (suffix && name === "close") descriptors.delete(fd); return result;
    };
  }
  for (const name of ["link", "symlink", "mkdtemp", "watch", "watchFile", "unwatchFile", "glob", "openAsBlob", "createReadStream", "createWriteStream", "ReadStream", "WriteStream"]) for (const suffix of ["", "Sync"]) if (fs[name + suffix]) fs[name + suffix] = function () { return deny("outside"); };
  for (const name of ["link", "symlink", "mkdtemp", "watch", "glob"]) if (fs.promises[name]) fs.promises[name] = () => deny("outside");
  const denyMethods = (object, names, category) => {
    for (const name of names) if (typeof object?.[name] === "function") object[name] = function () { return deny(category); };
  };
  for (const object of [net, tls, http, https, http2, dgram]) {
    denyMethods(object, ["connect", "createConnection", "request", "get", "createSocket", "createServer", "createSecureServer", "createSecureContext"], "network");
    for (const ctor of ["Socket", "Server", "TLSSocket", "Http2Session", "ClientHttp2Session", "Http2Server", "Agent"]) {
      denyMethods(object[ctor]?.prototype, ["connect", "listen", "send", "bind", "request", "createConnection"], "network");
    }
  }
  const dnsNames = ["lookup", "lookupService", "resolve", "resolve4", "resolve6", "resolveAny", "resolveCaa", "resolveCname", "resolveMx", "resolveNaptr", "resolveNs", "resolvePtr", "resolveSoa", "resolveSrv", "resolveTlsa", "resolveTxt", "reverse", "setServers"];
  for (const object of [dns, dns.promises, dns.Resolver?.prototype, dns.promises.Resolver?.prototype]) denyMethods(object, dnsNames, "network");
  globalThis.fetch = () => deny("network");
  globalThis.WebSocket = class { constructor() { deny("network"); } };
  denyMethods(workers, ["Worker", "MessageChannel", "BroadcastChannel", "receiveMessageOnPort", "moveMessagePortToContext", "postMessageToThread"], "worker");
  for (const name of ["MessageChannel", "BroadcastChannel"]) globalThis[name] = workers[name];
  denyMethods(Module, ["register", "registerHooks", "enableCompileCache", "flushCompileCache"], "module");
  denyMethods(v8, ["writeHeapSnapshot", "getHeapSnapshot", "setFlagsFromString", "takeCoverage", "stopCoverage", "startCpuProfile", "startHeapProfile"], "module");
  denyMethods(sea, ["getAsset", "getAssetAsBlob", "getRawAsset"], "module");
  denyMethods(crypto, ["setEngine"], "keyring");
  denyMethods(os, ["setPriority", "getPriority", "userInfo"], "outside");
  const getBuiltinModule = process.getBuiltinModule;
  process.getBuiltinModule = (specifier) => {
    const name = String(specifier).replace(/^node:/, "");
    if (!AUDITED_BUILTINS.has(name)) deny("module");
    return getBuiltinModule.call(process, `node:${name}`);
  };
  process.binding = process._linkedBinding = () => deny("module");
  process.dlopen = () => deny("keyring");
  process.kill = () => deny("child");
  Module._extensions[".node"] = () => deny("keyring");
  for (const name of ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"]) cp[name] = () => deny("child");
  // The upstream env.ts fallback is expected, but remains a DENIAL, never a broker.
  // Only public spawn("git", exact argv, owned workspace cwd) is classified here.
  cp.spawn = (command, argv, options) => {
    if (grant.role === "child" && command === "git" && Array.isArray(argv) &&
        gitProbeArguments.some((expected) => expected.length === argv.length && expected.every((value, index) => value === argv[index])) &&
        typeof options?.cwd === "string" && path.isAbsolute(options.cwd) && within(grant.cwd, path.resolve(options.cwd))) {
      expectedDenied.gitProbe++;
      deniedGitProbes.push(Object.freeze({ argv: Object.freeze([...argv]), cwd: path.relative(grant.cwd, path.resolve(options.cwd)) }));
      throw Object.assign(new Error("SWITCH_RESOURCE_BOUNDARY_child"), { code: "SWITCH_RESOURCE_BOUNDARY_child" });
    }
    return deny("child");
  };
  cp.ChildProcess.prototype.spawn = function (options) {
    if (!broker) deny("child");
    const permit = broker; broker = undefined; // consumed before the one synchronous native entry
    assert.equal(options.file, permit.executable);
    assert.deepEqual(options.args, [permit.executable, ...permit.argv]);
    assert.equal(options.cwd, permit.cwd);
    assert.deepEqual([...options.envPairs].sort(), permit.envPairs);
    assert.equal(options.detached, false);
    assert.equal(options.windowsVerbatimArguments, false);
    assert.deepEqual(options.stdio, ["pipe", "pipe", "pipe", "ipc"]);
    return originalPrototypeSpawn.call(this, options);
  };
  // Constructor/hook controls enter the same deny wrappers and cannot create handles.
  expectedDenial = true;
  try {
    for (const name of ["Worker", "MessageChannel", "BroadcastChannel"]) assert.throws(() => new workers[name](), /SWITCH_RESOURCE_BOUNDARY_worker/);
    for (const name of ["register", "registerHooks", "enableCompileCache"]) assert.throws(() => Module[name](), /SWITCH_RESOURCE_BOUNDARY_module/);
  } finally { expectedDenial = false; }
  syncBuiltinESMExports();
  negativeControls.code = installCodeHooks(grant, () => deny("module"));
  assert.deepEqual(negativeControls, { worker: 3, module: 3, code: 5 });
  Object.freeze(negativeControls);
  return Object.freeze({ counters,
    spawn(executable, argv, options) {
      assert.equal(grant.role, "supervisor"); assert.equal(executable, process.execPath);
      assert.equal(argv[0], path.join(grant.stage, "scripts/users/launcher.mjs")); assert.equal(argv[1], "--managed-child"); assert.equal(argv[4], "rpc"); assert.equal(argv[6], grant.registryPath);
      assert.equal(options.cwd, path.join(grant.root, "profiles", argv[2], "workspace"));
      assert.deepEqual(options.stdio, ["pipe", "pipe", "pipe", "ipc"]);
      assert.equal(options.env.NODE_OPTIONS, undefined); assert.equal(options.env.NODE_PATH, undefined);
      assert.equal(options.env.PI_USER_ID, argv[2]); assert.equal(options.env.HOME, path.join(grant.root, "profiles", argv[2]));
      for (const key of ["USERPROFILE", "APPDATA", "LOCALAPPDATA", "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "TMP", "TEMP", "TMPDIR"]) check(options.env[key], true);
      const { _bootstrap, ...nativeOptions } = options;
      assert.ok(Array.isArray(_bootstrap));
      const prefix = [...permissionArgs(grant), "--import", pathToFileURL(grant.childBootstrap).href];
      assert.deepEqual(_bootstrap, [...prefix, ...argv]);
      check(grant.childBootstrap);
      const home = path.join(grant.root, "profiles", argv[2]);
      const expectedEnv = {
        HOME: home, USERPROFILE: home, APPDATA: path.join(home, "AppData/Roaming"),
        LOCALAPPDATA: path.join(home, "AppData/Local"), XDG_CONFIG_HOME: path.join(home, ".config"),
        XDG_CACHE_HOME: path.join(home, "AppData/Local/Cache"),
        TMP: path.join(home, "AppData/Local/Temp"), TEMP: path.join(home, "AppData/Local/Temp"), TMPDIR: path.join(home, "AppData/Local/Temp"),
        PI_CODING_AGENT_DIR: path.join(home, ".pi/agent"), PI_CODING_AGENT_SESSION_DIR: path.join(home, "sessions"),
        PI_USER_ID: argv[2], PI_USERS_REGISTRY: grant.registryPath,
        SWITCH_FIXTURE_GRANT: nativeOptions.env.SWITCH_FIXTURE_GRANT, SWITCH_FIXTURE_HASH: nativeOptions.env.SWITCH_FIXTURE_HASH,
      };
      for (const key of ["SystemRoot", "windir", "SYSTEMDRIVE"]) if (typeof process.env[key] === "string") expectedEnv[key] = process.env[key];
      expectedEnv.PATH = path.join(grant.root, "empty-bin");
      assert.deepEqual(options.env, expectedEnv); // No NODE_*, env-file, OpenSSL or ambient fallback.
      const childRecord = nativeOptions.env.SWITCH_FIXTURE_GRANT;
      assert.equal(path.dirname(childRecord), path.join(grant.root, "control"));
      const childGrant = readGrant(childRecord, nativeOptions.env.SWITCH_FIXTURE_HASH);
      assert.equal(childGrant.role, "child"); assert.deepEqual(childGrant.argv, argv);
      assert.deepEqual(childGrant.codeFiles, grant.codeFiles); assert.deepEqual(childGrant.sdk, grant.sdk);
      assert.deepEqual(childGrant.rootCode, grant.rootCode); assert.deepEqual(childGrant.codeAliases, grant.codeAliases);
      assert.deepEqual(childGrant.profilesIdentity, grant.profilesIdentity);
      assert.equal(childGrant.home, home); assert.equal(childGrant.cwd, options.cwd);
      const trustedOptions = { cwd: nativeOptions.cwd, env: { ...nativeOptions.env },
        stdio: ["pipe", "pipe", "pipe", "ipc"], windowsHide: nativeOptions.windowsHide === true };
      broker = { executable, argv: [..._bootstrap], cwd: trustedOptions.cwd,
        envPairs: Object.entries(trustedOptions.env).map(([key, value]) => `${key}=${value}`).sort() };
      try { return originalSpawn(executable, [..._bootstrap], trustedOptions); } finally { broker = undefined; }
    },
    async drain() { await Promise.all([...pending].filter((item) => item?.then)); await new Promise((resolve) => setImmediate(resolve)); assert.equal(pending.size, 0); assert.equal(descriptors.size, 0); assert.deepEqual(counters, { outside: 0, protected: 0, network: 0, child: 0, keyring: 0, worker: 0, module: 0 }); return { pending: 0, descriptors: 0, counters, negativeControls, expectedDenied, deniedGitProbes }; },
  });
}

function readGrant(file, hash) {
  diagnostic("read-grant:begin");
  assert.ok(path.isAbsolute(file)); assert.match(path.basename(file), /^[a-f0-9]{48}\.json$/);
  assert.equal(path.basename(path.dirname(file)), "control");
  const declaredRoot = path.dirname(path.dirname(file));
  assert.ok(path.basename(declaredRoot).startsWith("pi-users-switch-"));
  assert.ok(within(declaredRoot, process.env.HOME ?? ""));
  const stat = fs.lstatSync(file); assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1);
  assert.equal(fs.realpathSync.native(file), file);
  const bytes = fs.readFileSync(file); assert.equal(digest(bytes), hash);
  const grant = JSON.parse(bytes); assert.equal(grant.root, declaredRoot); owned(grant.root, file); assert.equal(fs.realpathSync.native(grant.root), grant.root);
  assert.match(grant.nonce, /^[a-f0-9]{48}$/); assert.equal(grant.stage, path.join(grant.root, "stage"));
  assert.equal(grant.freshCreationRoot, path.join(grant.root, "profiles", "fourth-user"));
  assert.equal(grant.sdk.requested, SDK_REQUESTED);
  assert.equal(grant.sdk.canonical, SDK); assert.equal(fs.realpathSync.native(SDK), SDK);
  assert.equal(grant.jitiAdapter, path.join(grant.stage, "jiti-no-cache.mjs"));
  assert.equal(grant.childBootstrap, path.join(grant.stage, "switch-child-bootstrap.mjs"));
  const expectedCode = [...FILES, "package.json", "jiti-no-cache.mjs", "switch-child-bootstrap.mjs", "common/synthetic-transport.mjs"].map((relative) => path.join(grant.stage, relative));
  assert.ok(Array.isArray(grant.rootCode) && grant.rootCode.length > 40);
  assert.equal(new Set(grant.rootCode).size, grant.rootCode.length);
  for (const relative of grant.rootCode) {
    assert.ok(typeof relative === "string" && /^(?:subagents-staging\/pi-subagents-0\.18\.2-users\/|plastic-memory\/|root-deps\/)/.test(relative));
    assert.equal(path.relative(grant.stage, owned(grant.stage, path.join(grant.stage, relative))).split(path.sep).join("/"), relative);
    expectedCode.push(path.join(grant.stage, relative));
  }
  assert.deepEqual(Object.keys(grant.codeFiles).sort(), expectedCode.sort());
  assert.deepEqual(Object.keys(grant.codeAliases).sort(), ["@earendil-works/pi-coding-agent", "@earendil-works/pi-ai", "@earendil-works/pi-ai/compat", "@earendil-works/pi-tui", "@sinclair/typebox", "croner", "nanoid"].sort());
  for (const file of Object.values(grant.codeAliases)) assert.ok(Object.hasOwn(grant.codeFiles, file) || Object.hasOwn(grant.sdk.files, file), "ROOT_ALIAS_FINITE_CODE");
  assert.equal(grant.codeAliases["@sinclair/typebox"], path.join(grant.stage, "root-deps/typebox/build/esm/index.mjs"));
  assert.equal(grant.codeAliases.croner, path.join(grant.stage, "root-deps/croner/dist/croner.js"));
  assert.equal(grant.codeAliases.nanoid, path.join(grant.stage, "root-deps/nanoid/index.js"));
  Object.freeze(grant.rootCode); Object.freeze(grant.codeAliases);
  for (const [codeFile, hash] of Object.entries(grant.codeFiles)) {
    assert.match(hash, /^[a-f0-9]{64}$/);
    const entry = fs.lstatSync(codeFile);
    assert.ok(entry.isFile() && !entry.isSymbolicLink() && entry.nlink === 1);
    assert.equal(fs.realpathSync.native(codeFile), codeFile);
    assert.equal(digest(fs.readFileSync(codeFile)), hash);
  }
  diagnostic("read-grant:staged-code-verified");
  for (const [codeFile, hash] of Object.entries(grant.sdk.files)) {
    assert.ok(path.isAbsolute(codeFile) && within(SDK, codeFile)); assert.match(hash, /^[a-f0-9]{64}$/);
    const entry = fs.lstatSync(codeFile);
    assert.ok(entry.isFile() && !entry.isSymbolicLink() && entry.nlink === 1);
    assert.equal(fs.realpathSync.native(codeFile), codeFile);
    assert.equal(digest(fs.readFileSync(codeFile)), hash); // Includes native package-resolution metadata.
  }
  diagnostic("read-grant:sdk-corpus-verified");
  for (const directory of grant.sdk.directories) {
    assert.ok(path.isAbsolute(directory) && within(SDK, directory));
    assert.ok(fs.lstatSync(directory).isDirectory()); assert.equal(fs.realpathSync.native(directory), directory);
  }
  assert.deepEqual(grant.sdk.absent.map(({ path: file, parent }) => ({ path: file, parent })), SDK_ABSENT_PATHS.map((file) => ({ path: file, parent: path.dirname(file) })));
  for (const file of SDK_ABSENT_PATHS) verifySdkAbsence(grant, file);
  diagnostic("read-grant:sdk-absence-verified");
  Object.freeze(grant.codeFiles); Object.freeze(grant.sdk.files); Object.freeze(grant.sdk.directories);
  for (const entry of grant.sdk.absent) { Object.freeze(entry.identity); Object.freeze(entry); }
  Object.freeze(grant.sdk.absent); Object.freeze(grant.sdk);
  diagnostic("read-grant:complete");
  return Object.freeze(grant);
}

export async function initializeSwitchChild(file, hash) {
  const grant = readGrant(file, hash); assert.equal(grant.role, "child");
  assert.deepEqual(process.argv.slice(1), grant.argv); assert.equal(process.cwd(), grant.cwd);
  assert.equal(process.env.HOME, grant.home); assert.equal(os.homedir(), grant.home);
  assert.deepEqual(process.execArgv, [...permissionArgs(grant), "--import", pathToFileURL(grant.childBootstrap).href]);
  const guards = installGuards(grant);
  diagnostic("child:guards-installed-sdk-import-begin");
  const sdk = await import(pathToFileURL(path.join(SDK, "dist/index.js")).href);
  diagnostic("child:sdk-import-complete");
  const refreshes = [];
  const refresh = sdk.ModelRuntime.prototype.refresh;
  sdk.ModelRuntime.prototype.refresh = function (...args) { const result = refresh.apply(this, args); refreshes.push(Promise.resolve(result)); return result; };
  const dispose = sdk.AgentSessionRuntime.prototype.dispose;
  sdk.AgentSessionRuntime.prototype.dispose = async function (...args) {
    const receipt = globalThis[Symbol.for("pi.users.context")];
    assert.equal(Object.isFrozen(receipt), true); assert.equal(Object.isFrozen(receipt.profile), true);
    assert.equal(this.profile, receipt.profile); assert.equal(this.session.modelRuntime, receipt.modelRuntime); assert.equal(this.services.modelRuntime, receipt.modelRuntime);
    const result = await dispose.apply(this, args);
    await this.services.settingsManager.flush();
    for (let count = 0; count !== refreshes.length;) { const batch = refreshes.slice(count); count = refreshes.length; await Promise.all(batch); }
    const drained = await guards.drain();
    await new Promise((resolve, reject) => process.send({ fixture: grant.nonce, type: "disposed", pid: process.pid, id: receipt.profile.id, drained }, (error) => error ? reject(error) : resolve()));
    return result;
  };
  globalThis.__switchFixture = Object.freeze({ nonce: grant.nonce, lifecycle(phase) {
    assert.ok(["sub-scheduler-stopped", "sub-manager-disposed", "plastic-shutdown", "plastic-unregistered"].includes(phase));
    process.send({ fixture: grant.nonce, type: "root-lifecycle", phase, pid: process.pid });
  } });
}

async function supervisor(file, hash) {
  const grant = readGrant(file, hash); assert.equal(grant.role, "supervisor");
  assert.deepEqual(process.execArgv, permissionArgs(grant, true));
  const guards = installGuards(grant), children = [];
  diagnostic("supervisor:guards-installed");
  let current, awaitingRecovery = false, requestRecovery;
  const recoveryRequested = new Promise((resolve) => { requestRecovery = resolve; });
  const emit = (detail) => process.send?.({ fixture: grant.nonce, ...detail });
  process.on("message", (message) => {
    if (message?.fixture !== grant.nonce) throw new Error("FIXTURE_CHANNEL_FORGED");
    if (message.type === "release") current?.send(message);
    else if (message.type === "recover") { assert.equal(awaitingRecovery, true); requestRecovery(); }
  });
  const { launchUser } = await import(pathToFileURL(path.join(grant.stage, "scripts/users/launcher.mjs")).href);
  diagnostic("supervisor:launcher-import-complete");
  const jointPhases = ["sub-scheduler-stopped", "sub-manager-disposed", "plastic-shutdown", "plastic-unregistered"];
  const jointShutdown = (entry) => {
    for (const phase of jointPhases) assert.equal(entry.lifecycle.filter((item) => item === phase).length, 1, `JOINT_SHUTDOWN_${phase}`);
    assert.ok(entry.lifecycle.indexOf("sub-scheduler-stopped") < entry.lifecycle.indexOf("sub-manager-disposed"));
  };
  const options = { spawnProcess(executable, argv, options) {
    diagnostic("supervisor:managed-child-spawn-requested");
    for (const prior of children) { assert.equal(prior.closed, true); assert.equal(prior.disposed, true); jointShutdown(prior); }
    if (grant.failDestination === argv[2]) throw new Error("INTENTIONAL_NEW_SPAWN_FAILURE");
    const childGrant = { ...grant, role: "child", argv, cwd: options.cwd, home: options.env.HOME };
    const record = path.join(grant.root, "control", `${token()}.json`); const bytes = JSON.stringify(childGrant);
    fs.writeFileSync(record, bytes, { flag: "wx" }); fs.chmodSync(record, 0o444);
    // Permission enforcement starts in Node itself; the owned prefix never changes PRODUCT argv.
    const spawnArgs = [...permissionArgs(grant), "--import", pathToFileURL(grant.childBootstrap).href, ...argv];
    let handle;
    try {
      handle = guards.spawn(executable, argv, { ...options,
        env: { ...options.env, SWITCH_FIXTURE_GRANT: record, SWITCH_FIXTURE_HASH: digest(bytes) }, _bootstrap: spawnArgs });
    } catch (error) {
      const descriptor = error instanceof Error ? Object.getOwnPropertyDescriptor(error, "stack") : undefined;
      const stack = typeof descriptor?.value === "string" ? descriptor.value : "";
      const frames = stack.split("\n").flatMap((line) => {
        const location = /users-switch\.smoke\.mjs:(\d{1,9}):(\d{1,9})\)?$/.exec(line.trim());
        return location ? [`users-switch.smoke.mjs:${location[1]}:${location[2]}`] : [];
      }).slice(0, 3); // Never emit path/function prefixes from an exception's stack.
      const nameDescriptor = error instanceof Error ? Object.getOwnPropertyDescriptor(Object.getPrototypeOf(error), "name") : undefined;
      const candidateName = nameDescriptor?.value;
      const name = ["AssertionError", "Error", "TypeError", "RangeError", "ReferenceError", "SyntaxError", "URIError", "EvalError"].includes(candidateName) ? candidateName : "Error";
      const codeDescriptor = error && (typeof error === "object" || typeof error === "function") ? Object.getOwnPropertyDescriptor(error, "code") : undefined;
      const candidateCode = codeDescriptor?.value;
      const code = ["ERR_ASSERTION", "ENOENT", "ENOTDIR", "EACCES", "EPERM", "ERR_ACCESS_DENIED", "ERR_INVALID_ARG_TYPE", "ERR_INVALID_ARG_VALUE"].includes(candidateCode) ? candidateCode : undefined;
      const messageDescriptor = error && (typeof error === "object" || typeof error === "function") ? Object.getOwnPropertyDescriptor(error, "message") : undefined;
      const candidateTag = messageDescriptor?.value;
      const tag = typeof candidateTag === "string" && /^(?:SWITCH_RESOURCE_BOUNDARY_(?:outside|protected|network|child|keyring|worker|module)|SDK_(?:ABSENCE_GRANT_IDENTITY|ABSENCE_PARENT_ADMITTED|ABSENCE_PARENT_IDENTITY|METADATA_ABSENCE))$/.test(candidateTag) ? candidateTag : undefined;
      try { process.stderr.write(`SWITCH_BROKER_ERROR ${JSON.stringify({ pid: process.pid, phase: "supervisor:broker-spawn", name, ...(code ? { code } : {}), ...(tag ? { tag } : {}), frames })}\n`); } catch {}
      throw error;
    }
    const entry = { handle, closed: false, disposed: false, lifecycle: [] }; children.push(entry); current = handle;
    handle.on("message", (message) => { if (message?.fixture === grant.nonce) {
      if (message.type === "disposed") entry.disposed = true;
      if (message.type === "root-lifecycle") { assert.equal(message.pid, handle.pid); assert.ok(jointPhases.includes(message.phase)); entry.lifecycle.push(message.phase); }
      emit(message);
    } });
    entry.done = new Promise((resolve) => handle.once("close", (code, signal) => { entry.closed = true; jointShutdown(entry); emit({ type: "close", pid: handle.pid, code, signal, disposed: entry.disposed }); resolve(); }));
    entry.pipes = Promise.all([handle.stdin, handle.stdout, handle.stderr].map((stream) => new Promise((resolve) => stream.once("close", resolve))));
    for (const object of [handle, handle.stdin, handle.stdout, handle.stderr]) object.on("error", () => emit({ type: "io-error", pid: handle.pid }));
    emit({ type: "spawn", pid: handle.pid, id: argv[2] });
    return handle;
  } };
  let outcome = "success";
  try {
    diagnostic("supervisor:launch-user-begin");
    await launchUser(["use", grant.id, "--cwd", grant.cwd, "--mode", "rpc", "--registry", grant.registryPath], options);
  } catch (error) {
    if (!grant.failDestination || children.length !== 1 || !children[0].closed) throw error;
    assert.equal(typeof error.recoverOwnOrigin, "function");
    outcome = "expected-relaunch-failure";
    awaitingRecovery = true;
    emit({ type: "failure-origin", origin: error.ownOrigin });
    await recoveryRequested; // Explicit parent IPC action; never an automatic fallback/restore.
    awaitingRecovery = false;
    await error.recoverOwnOrigin(options);
  }
  await Promise.all(children.flatMap((child) => [child.done, child.pipes]));
  assert.ok(children.every((child) => child.closed && child.disposed));
  const drained = await guards.drain();
  emit({ type: "finalized", outcome, drained });
  process.disconnect();
}

function transportSource() {
  return `import {createAssistantMessageEventStream} from ${JSON.stringify(pathToFileURL(AI).href)};
import {registerApiProvider,getApiProvider} from ${JSON.stringify(pathToFileURL(COMPAT).href)};
import {registerUserSwitchParticipant,lookupUserSwitchParticipants,acquireUserSwitchReadiness} from '../scripts/users/switch-readiness.mjs';
export default (pi) => {
 const receipt=globalThis[Symbol.for('pi.users.context')], runtime=receipt.modelRuntime;
 const original=runtime.getProvider('openai'); if(!original) throw new Error('FIXTURE_PROVIDER_MISSING');
 const fixture=globalThis.__switchFixture; let held; const emit=(value)=>process.send({fixture:fixture.nonce,...value});
 const realNames=['principal','subagents','plastic-memory']; let subReady=false, subId;
 pi.events.on('subagents:ready',()=>{subReady=true;emit({type:'sub-ready',pid:process.pid});});
 pi.events.on('subagents:failed',event=>{if(event.id===subId)emit({type:'sub-failed',pid:process.pid,id:event.id,status:event.status});});
 pi.events.on('subagents:completed',event=>{if(event.id!==subId)return;emit({type:'sub-completed',pid:process.pid,id:event.id,status:event.status,result:event.result});
  pi.events.emit('subagents:rpc:consume',{requestId:'switch-consume',agentId:event.id});});
 pi.events.on('subagents:rpc:consume:reply:switch-consume',reply=>{if(reply.success!==true)throw new Error('FIXTURE_SUB_CONSUME');emit({type:'sub-consumed',pid:process.pid});});
 pi.registerCommand('fixture:real-roots',{handler:async()=>{const lookup=lookupUserSwitchParticipants({names:realNames});if(!lookup.ok||!subReady)throw new Error('FIXTURE_REAL_COHORT');emit({type:'real-cohort',pid:process.pid,names:lookup.expected.map(e=>e.name)});}});
 pi.registerCommand('fixture:real-sub',{handler:async()=>{
  if(!subReady||subId)throw new Error('FIXTURE_SUB_NOT_READY');
  const off=pi.events.on('subagents:rpc:spawn:reply:switch-spawn',reply=>{off();if(reply.success!==true||typeof reply.data?.id!=='string')throw new Error('FIXTURE_SUB_SPAWN');subId=reply.data.id;emit({type:'sub-spawned',pid:process.pid,id:subId});});
  pi.events.emit('subagents:rpc:spawn',{requestId:'switch-spawn',type:'general-purpose',prompt:'fixture-hold real-sub accepted work',options:{isolated:true,isBackground:true,inheritContext:false,isolation:'off'}});
 }});
 process.on('message',m=>{if(m?.fixture===fixture.nonce&&m.type==='release'&&held){const end=held;held=undefined;end();}});
 const stream=(model,context,options)=>{
  if(JSON.stringify(context.messages).includes('accepted-next-turn'))emit({type:'next-turn-observed',pid:process.pid});
  const result=createAssistantMessageEventStream(); emit({type:'token',pid:process.pid,id:receipt.profile.id,token:options.apiKey});
  const end=()=>result.end({role:'assistant',content:[{type:'text',text:'owned synthetic response'}],api:model.api,provider:model.provider,model:model.id,usage:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},stopReason:'stop',timestamp:0});
  const last=context.messages.filter(m=>m.role==='user').at(-1); const text=typeof last?.content==='string'?last.content:JSON.stringify(last?.content);
  if(text?.includes('fixture-hold')) {if(held)throw new Error('FIXTURE_STREAM_ALREADY_HELD');held=end;if(text.includes('real-sub'))emit({type:'sub-stream-held',pid:process.pid});} else queueMicrotask(end); return result;
 };
 registerApiProvider({api:runtime.getModels('openai')[0].api,stream,streamSimple:stream},'switch-fixture');
 const api=getApiProvider(runtime.getModels('openai')[0].api); const hook=(...args)=>api.streamSimple(...args);
 pi.registerProvider({...original,stream:hook,streamSimple:hook});
 pi.on('session_start',async(_event,ctx)=>{const model=runtime.getModels('openai')[0]; if(!model)throw new Error('FIXTURE_MODEL_MISSING'); /* Recovered sessions already carry this model: no extra model_change entry. */ if(!(ctx.model&&ctx.model.provider===model.provider&&ctx.model.id===model.id)&&!await pi.setModel(model))throw new Error('FIXTURE_MODEL_MISSING'); emit({type:'ready',pid:process.pid,id:receipt.profile.id,sessionId:ctx.sessionManager.getSessionId(),sessionPath:ctx.sessionManager.getSessionFile(),entries:ctx.sessionManager.getBranch().length,frozen:Object.isFrozen(receipt)&&Object.isFrozen(receipt.profile),runtimeSame:runtime===receipt.modelRuntime});});
 let injectPrefixAside=false;
 pi.on('message_end',event=>{if(event.message?.role==='custom'&&event.message.customType==='fixture-next-turn')emit({type:'next-turn-prefix-end',pid:process.pid});});
 pi.registerCommand('fixture:next-turn',{handler:async()=>{pi.sendMessage({customType:'fixture-next-turn',content:'accepted-next-turn',display:false},{deliverAs:'nextTurn',triggerTurn:false});}});
 pi.registerCommand('fixture:next-turn-pair',{handler:async()=>{for(let i=0;i<2;i++)pi.sendMessage({customType:'fixture-next-turn',content:'accepted-next-turn',display:false},{deliverAs:'nextTurn',triggerTurn:false});}});
 pi.registerCommand('fixture:inject-prefix-aside',{handler:async()=>{injectPrefixAside=true;}});
 pi.on('agent_start',async()=>{if(injectPrefixAside){injectPrefixAside=false;pi.sendMessage({customType:'fixture-next-turn',content:'accepted-next-turn',display:false},{deliverAs:'nextTurn',triggerTurn:false});}});
 // Synthetic participant counterexamples use the real closure-backed API, not SDK facades.
 let extra;
 pi.registerCommand('fixture:probe',{handler:async(kind,ctx)=>{
  const ensure=(condition)=>{if(!condition)throw new Error('FIXTURE_PROBE_'+kind);};
  if(kind==='forge-ipc') {
   const binding=JSON.parse(process.argv[8]);process.send({protocol:'pi-user-handoff-v1',...binding,nonce:'0'.repeat(48),originPid:process.pid,profile:receipt.profile.id,type:'prepare',request:900,target:'cobalt-test',cwd:ctx.cwd,sessionPath:ctx.sessionManager.getSessionFile(),sessionId:ctx.sessionManager.getSessionId()});
  } else if(kind==='missing') ensure(!lookupUserSwitchParticipants({names:['principal','absent-root']}).ok);
  else if(kind==='forged') {
   const api=globalThis[Symbol.for('pi.users.switch-readiness.api.v1')];ensure(!lookupUserSwitchParticipants({names:['principal'],identity:{receipt:{...receipt},processIdentity:api.processIdentity}}).ok);
  } else if(kind==='unknown-add') {
   extra=registerUserSwitchParticipant({name:'fixture-unlisted',owner:{},isCurrent:i=>i.receipt===receipt,acquireFence:()=>()=>true});ensure(extra.ok);
  } else if(kind==='unknown-remove') {ensure(extra.unregister().ok);extra=undefined;}
  else {
   let current=true,fenced=false,dispatch=0,deferred=false;
   const owner={}, busy=['child','queue','scheduler','plastic','promotion'].includes(kind);
   const registration=registerUserSwitchParticipant({name:'fixture-root',owner,isCurrent:i=>current&&i.receipt===receipt,acquireFence:()=>{
    if(busy)return undefined; fenced=true;
    if(kind==='race')queueMicrotask(()=>{if(fenced)deferred=true;else dispatch++;});
    let active=true;return()=>{if(!active)return true;active=false;fenced=false;if(deferred){deferred=false;queueMicrotask(()=>dispatch++);}return true;};
   }});ensure(registration.ok);
   if(kind==='stale')current=false;
   const lookup=lookupUserSwitchParticipants({names:[...realNames,'fixture-root']});ensure(lookup.ok);
   const lease=acquireUserSwitchReadiness({expected:lookup.expected});
   if(busy||kind==='stale'){ensure(!lease.acquired);current=true;}
   else {ensure(lease.acquired);await Promise.resolve();ensure(dispatch===0);ensure(lease.release().ok);ensure(lease.release().ok);await Promise.resolve();if(kind==='race')ensure(dispatch===1);}
   ensure(registration.unregister().ok);
   const principal=lookupUserSwitchParticipants({names:realNames});ensure(principal.ok);
   const recovered=acquireUserSwitchReadiness({expected:principal.expected});ensure(recovered.acquired);ensure(recovered.release().ok);
  }
  emit({type:'probe',kind,pid:process.pid});
 }});
 let concurrent; pi.registerCommand('fixture:hold',{handler:async()=>new Promise(resolve=>{concurrent=resolve;emit({type:'command-held',pid:process.pid});})});
 process.on('message',m=>{if(m?.fixture===fixture.nonce&&m.type==='release'&&concurrent){const done=concurrent;concurrent=undefined;done();}});
};\n`;
}

// Inert mirrors are read only by the parent of a freshly admitted native run.
const PUBLIC_CODE = path.join(SOURCE, ".pi/recovery/public-code");
const ROOT_MIRRORS = Object.freeze({
  subagents: ["20261007T214943102322Z-pi-subagents-0.18.2", "235e92c74ec1503c102a2bb1247da6fe6e6926b2ccb655b43e945fa31b3b0bd7"],
  croner: ["20261008T145907631635Z-croner-10.0.1", "d87a476c7891ac122f05fcda18205e7bb0650743f809a8027489f32aafc369e8"],
  nanoid: ["20261008T145907631635Z-nanoid-5.1.16", "99debf7d449d058d4e2d199d77193288ee7cc39921d294d882e806818e4e43c7"],
  typebox: ["20261008T145907631635Z-sinclair-typebox-0.34.49", "f43de969486ba999cd93904e6952eccd2d9ed4b692afb04ffaa083abc08286e5"],
});
const PLASTIC_CODE = Object.freeze([
  "index.ts", "config.ts", "common/ids.ts", "common/safety.ts",
  "compaction/emergency.ts", "compaction/engine.ts", "compaction/extract.ts", "compaction/pending.ts", "compaction/projection.ts", "compaction/render.ts",
  "project/context.ts", "project/io.ts", "project/migrate.ts", "project/projection.ts", "project/schema.ts", "project/search.ts", "project/store.ts",
  "runtime/commands.ts", "runtime/coordinator.ts", "runtime/runner-runtime.ts", "runtime/tools.ts",
  "session/backfill.ts", "session/bootstrap.ts", "session/cycles.ts", "session/ledger.ts", "session/recall.ts", "session/render-summary.ts", "session/retention.ts", "session/types.ts",
  "workers/compactor.ts", "workers/observer.ts", "workers/promoter.ts", "workers/reflector.ts", "workers/runner.ts", "workers/scheduler.ts",
]);
function stageRealRoots(root, stage, make, sdkCode) {
  const inventory = [], rootCode = [];
  const mirror = (name) => {
    const [directory, hash] = ROOT_MIRRORS[name], base = path.join(PUBLIC_CODE, directory);
    assert.equal(fs.realpathSync.native(base), base);
    const bytes = fs.readFileSync(path.join(base, "SOURCE_MANIFEST.json")); assert.equal(digest(bytes), hash);
    const manifest = JSON.parse(bytes);
    return { base, files: manifest.files };
  };
  const sourceBytes = (base, relative, expected) => {
    const file = owned(base, path.join(base, relative)), stat = fs.lstatSync(file);
    assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1);
    assert.equal(fs.realpathSync.native(file), file);
    const bytes = fs.readFileSync(file); if (expected) assert.equal(digest(bytes), typeof expected === "string" ? expected : expected.sha256);
    return bytes;
  };
  const record = (relative, bytes, sourceHash = digest(bytes)) => {
    make(path.join(stage, relative), bytes); rootCode.push(relative); inventory.push({ file: relative, sourceHash });
  };
  const sub = mirror("subagents"), sourceCopy = path.join(root, "subagents-source");
  assert.equal(Object.keys(sub.files).length, 40);
  for (const [relative, hash] of Object.entries(sub.files)) make(path.join(sourceCopy, relative), sourceBytes(sub.base, relative, hash));
  const staging = path.join(stage, "subagents-staging"); fs.mkdirSync(staging);
  // Existing supported transform, executed only inside the future run-owned envelope.
  return import(pathToFileURL(path.join(stage, "scripts/compat/subagents-users.mjs")).href).then(({ stageSubagentsProfileCompatibility }) => {
    const staged = stageSubagentsProfileCompatibility(sourceCopy, staging, { id: "switch-code-staging", agentDir: path.join(root, "staging-profile-agent") });
    for (const [relative, hash] of Object.entries(sub.files)) {
      const target = path.relative(stage, path.join(staged.packageRoot, relative)).split(path.sep).join("/");
      rootCode.push(target); inventory.push({ file: target, sourceHash: hash });
    }
    const observe = (relative, before, after) => {
      const file = owned(stage, path.join(stage, relative)), text = fs.readFileSync(file, "utf8");
      assert.equal(text.split(before).length, 2, `ROOT_OBSERVER_ANCHOR ${relative}`);
      fs.writeFileSync(file, text.replace(before, after));
    };
    const subEntry = path.relative(stage, staged.entry).split(path.sep).join("/");
    // Observe actual calls at their original locations; never substitute shutdown.
    observe(subEntry, "    scheduler.stop();\n    manager.abortAll();", "    scheduler.stop();\n    if (ownsManagerRegistry) globalThis.__switchFixture.lifecycle('sub-scheduler-stopped');\n    manager.abortAll();");
    observe(subEntry, "    await manager.dispose();", "    await manager.dispose();\n    if (ownsManagerRegistry) globalThis.__switchFixture.lifecycle('sub-manager-disposed');");
    for (const relative of PLASTIC_CODE) record(`plastic-memory/${relative}`, sourceBytes(path.join(SOURCE, "extensions/plastic-memory"), relative));
    record("plastic-memory/package.json", Buffer.from(JSON.stringify({ private: true, type: "module" })));
    observe("plastic-memory/runtime/coordinator.ts", "    this.shutdownListeners.clear();", "    this.shutdownListeners.clear();\n    globalThis.__switchFixture.lifecycle('plastic-shutdown');");
    observe("plastic-memory/index.ts", "        const result = registration.unregister();", "        const result = registration.unregister();\n        if (result?.ok === true) globalThis.__switchFixture.lifecycle('plastic-unregistered');");
    observe("plastic-memory/index.ts", "queueMicrotask(() => { registration.unregister(); });", "queueMicrotask(() => { const result = registration.unregister(); if (result?.ok === true) globalThis.__switchFixture.lifecycle('plastic-unregistered'); });");
    const entries = { croner: "dist/croner.js", nanoid: "index.js", typebox: "build/esm/index.mjs" };
    const aliases = {};
    for (const [name, entry] of Object.entries(entries)) {
      const dependency = mirror(name), seen = new Set();
      // Finite literal ESM closure only. Metadata is needed for native/Jiti package scope.
      const visit = (relative) => {
        if (seen.has(relative)) return; seen.add(relative);
        assert.ok(Object.hasOwn(dependency.files, relative), "DEPENDENCY_MANIFEST_CLOSURE");
        const bytes = sourceBytes(dependency.base, relative, dependency.files[relative]);
        record(`root-deps/${name}/${relative}`, bytes);
        if (relative.endsWith(".json")) return;
        const text = bytes.toString("utf8");
        assert.ok(!/\b(?:require\s*\(|import\s*\()/.test(text), "DEPENDENCY_DYNAMIC_IMPORT_UNADMITTED");
        for (const match of text.matchAll(/\b(?:from\s*|import\s*)["']([^"']+)["']/g)) {
          const specifier = match[1];
          if (specifier.startsWith("node:")) continue;
          assert.ok(specifier.startsWith("."), "DEPENDENCY_BARE_IMPORT_UNADMITTED");
          const next = path.posix.normalize(path.posix.join(path.posix.dirname(relative), specifier));
          assert.ok(!next.startsWith("../") && !path.posix.isAbsolute(next)); visit(next);
        }
      };
      visit("package.json"); visit(entry);
      aliases[name === "typebox" ? "@sinclair/typebox" : name] = path.join(stage, "root-deps", name, entry);
    }
    const sdkRequire = originalCreateRequire(path.join(SDK, "package.json"));
    for (const name of ["@earendil-works/pi-coding-agent", "@earendil-works/pi-ai", "@earendil-works/pi-ai/compat", "@earendil-works/pi-tui"]) {
      const packageName = name.endsWith("/compat") ? name.slice(0, -7) : name;
      const metadata = packageName === "@earendil-works/pi-coding-agent" ? path.join(SDK, "package.json") : path.join(SDK, "node_modules", packageName, "package.json");
      assert.ok(Object.hasOwn(sdkCode.files, metadata), "ROOT_PEER_METADATA_PRESENT");
      const file = sdkRequire.resolve(name); assert.ok(Object.hasOwn(sdkCode.files, file), "ROOT_PEER_SDK_INVENTORY"); aliases[name] = file;
    }
    process.stdout.write(`REAL_ROOT_CODE_INVENTORY ${JSON.stringify(inventory)}\n`);
    return { rootCode, codeAliases: aliases, entries: [staged.entry, path.join(stage, "plastic-memory/index.ts")] };
  });
}

async function parent() {
  const sandbox = createSandbox("users-switch");
  const root = sandbox.root, identity = fs.lstatSync(root), stage = sandbox.mkdir("stage"), control = sandbox.mkdir("control");
  process.stdout.write(`NEW_SWITCH_NAMESPACE ${root}\n`); // Failure makes this new root OFFLIMITS; no automatic cleanup.
  const make = (file, bytes) => { owned(root, file); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes, { flag: "wx" }); };
  for (const relative of FILES) make(path.join(stage, relative), fs.readFileSync(path.join(SOURCE, relative)));
  const code = sdkInventory(), nonce = token();
  fs.mkdirSync(path.join(stage, "agents")); // Exactly one canonical sharedAssets root.
  const realRoots = await stageRealRoots(root, stage, make, code);
  const jitiAdapter = path.join(stage, "jiti-no-cache.mjs");
  make(jitiAdapter, `import {createJiti as native} from ${JSON.stringify(pathToFileURL(path.join(SDK, "node_modules/jiti/lib/jiti.mjs")).href)}; const aliases=${JSON.stringify(realRoots.codeAliases)}; export const createJiti=(id,options)=>native(id,{...options,alias:{...options?.alias,...aliases},fsCache:false});\n`);
  const extension = path.join(stage, "common/synthetic-transport.mjs"); make(extension, transportSource());
  // This package scope prevents staged native resolution metadata walks into ancestors.
  make(path.join(stage, "package.json"), JSON.stringify({ private: true, type: "module" }));
  const childBootstrap = path.join(stage, "switch-child-bootstrap.mjs");
  make(childBootstrap, `import {initializeSwitchChild} from './scripts/test/users-switch.smoke.mjs'; await initializeSwitchChild(process.env.SWITCH_FIXTURE_GRANT,process.env.SWITCH_FIXTURE_HASH);\n`);
  const codeFiles = {};
  for (const file of [...FILES.map((relative) => path.join(stage, relative)), ...realRoots.rootCode.map((relative) => path.join(stage, relative)), jitiAdapter, extension, childBootstrap, path.join(stage, "package.json")]) {
    codeFiles[file] = digest(fs.readFileSync(file)); fs.chmodSync(file, 0o444);
  }
  verifyTree(stage); Object.freeze(codeFiles);
  sandbox.mkdir("empty-bin");
  const registryPath = path.join(root, "registry.json");
  const { registerUser, resolveUser } = await import(pathToFileURL(path.join(stage, "scripts/users/registry.mjs")).href);
  const ids = ["amber-test", "cobalt-test", "orchid-test"];
  const profiles = ids.map((id) => {
    const home = sandbox.mkdir("profiles", id), agentDir = sandbox.mkdir("profiles", id, ".pi", "agent"), sessionRoot = sandbox.mkdir("profiles", id, "sessions"), workspace = sandbox.mkdir("profiles", id, "workspace");
    registerUser({ registryPath, id, label: id, agentDir, sessionRoots: [sessionRoot], workspaces: [workspace], contexts: [path.dirname(agentDir)], sharedAssets: [stage] });
    for (const relative of ["AppData/Roaming", "AppData/Local/Temp", "AppData/Local/Cache", ".config", ".cache", "Temp"]) fs.mkdirSync(path.join(home, relative), { recursive: true });
    make(path.join(agentDir, "auth.json"), JSON.stringify({ openai: { type: "api_key", key: `synthetic-${id}` } }));
    make(path.join(agentDir, "settings.json"), JSON.stringify({ extensions: [...realRoots.entries, extension], "plastic-memory": { enabled: true }, defaultProvider: "openai", enableInstallTelemetry: false, enableAnalytics: false }));
    return { id, home, agentDir, workspace };
  });
  const auth = profiles.map((profile) => digest(fs.readFileSync(path.join(profile.agentDir, "auth.json"))));
  const profilesStat = fs.lstatSync(path.join(root, "profiles"));
  const profilesIdentity = Object.fromEntries(["dev", "ino", "birthtimeMs"].map((key) => [key, profilesStat[key]]));
  const records = [];
  const launch = (profile, extra = {}) => {
    const grant = { root, stage, sdk: code, codeFiles, rootCode: realRoots.rootCode, codeAliases: realRoots.codeAliases, profilesIdentity, nonce, role: "supervisor", id: profile.id, cwd: profile.workspace, registryPath, jitiAdapter, childBootstrap,
      freshCreationRoot: path.join(root, "profiles", "fourth-user"), ...extra };
    const file = path.join(control, `${token()}.json`), bytes = JSON.stringify(grant); make(file, bytes); fs.chmodSync(file, 0o444);
    const handle = originalSpawn(process.execPath, [...permissionArgs(grant, true), path.join(stage, "scripts/test/users-switch.smoke.mjs"), "--supervisor", file, digest(bytes)], { cwd: profile.workspace, env: cleanEnvironment(profile.home, root), stdio: ["pipe", "pipe", "pipe", "ipc"], windowsHide: true });
    const record = { handle, events: [], lines: [], stdout: "", stderr: "", error: undefined, closed: false };
    records.push(record);
    record.close = new Promise((resolve) => handle.once("close", (code, signal) => { record.closed = true; record.code = code; record.signal = signal; resolve(); }));
    record.pipes = Promise.all([handle.stdin, handle.stdout, handle.stderr].map((stream) => new Promise((resolve) => stream.once("close", resolve))));
    for (const object of [handle, handle.stdin, handle.stdout, handle.stderr]) object.on("error", (error) => { record.error ??= error; });
    handle.on("message", (message) => {
      assert.equal(message.fixture, nonce);
      if (["disposed", "finalized"].includes(message.type)) {
        const { expectedDenied, deniedGitProbes } = message.drained;
        assert.deepEqual(Object.keys(expectedDenied), ["gitProbe"]);
        assert.ok(Number.isSafeInteger(expectedDenied.gitProbe) && expectedDenied.gitProbe >= 0);
        assert.equal(deniedGitProbes.length, expectedDenied.gitProbe);
        for (const probe of deniedGitProbes) {
          assert.deepEqual(Object.keys(probe).sort(), ["argv", "cwd"]);
          assert.ok([JSON.stringify(["rev-parse", "--is-inside-work-tree"]), JSON.stringify(["branch", "--show-current"])].includes(JSON.stringify(probe.argv)));
          // This case uses only the exact root cwd, not descendant or foreign workspaces.
          assert.equal(probe.cwd, "");
        }
        if (message.type === "finalized") { assert.equal(expectedDenied.gitProbe, 0); assert.deepEqual(deniedGitProbes, []); }
        assert.deepEqual(message.drained, { pending: 0, descriptors: 0,
          counters: { outside: 0, protected: 0, network: 0, child: 0, keyring: 0, worker: 0, module: 0 },
          negativeControls: { worker: 3, module: 3, code: 5 }, expectedDenied, deniedGitProbes });
      }
      record.events.push(message);
    });
    handle.stdout.setEncoding("utf8").on("data", (chunk) => { record.stdout += chunk; const lines = record.stdout.split("\n"); record.lines = lines.slice(0, -1).filter(Boolean).map((line) => JSON.parse(line)); });
    handle.stderr.setEncoding("utf8").on("data", (chunk) => {
      record.stderr += chunk;
      process.stderr.write(`SWITCH_WORKER_STDERR pid=${handle.pid} ${chunk}`);
    });
    return record;
  };
  const until = (record, predicate, label, timeout = 30_000) => {
    let pollTimer, settled = false;
    const observation = new Promise((resolve, reject) => {
      const poll = () => {
        if (settled) return;
        try {
          if (record.error) return reject(record.error);
          const value = predicate();
          if (value) return resolve(value);
          if (record.closed) return reject(new Error(`EARLY_WORKER_CLOSE ${label}`));
          pollTimer = setTimeout(poll, 10);
        } catch (error) { reject(error); }
      };
      poll();
    });
    return bounded(observation, label, timeout).catch((error) => {
      const detail = { label, pid: record.handle.pid, closed: record.closed, code: record.code, signal: record.signal,
        recentEvents: record.events.slice(-8).map((event) => event.type), stdoutTail: record.stdout.slice(-4096), stderrTail: record.stderr.slice(-16384) };
      throw new Error(`${error.stack ?? error}\nWORKER_FAILURE_DIAGNOSTIC ${JSON.stringify(detail)}`, { cause: error });
    }).finally(() => {
      // Cancel ONLY this observer's timer, never SDK work, stdio, IPC or a child process.
      settled = true; clearTimeout(pollTimer);
    });
  };
  let nextId = 0;
  const send = async (record, command) => {
    const id = `fixture-${++nextId}`;
    record.handle.stdin.write(`${JSON.stringify({ ...command, id })}\n`);
    return until(record, () => record.lines.find((line) => line.type === "response" && line.id === id), command.type);
  };
  const slash = (record, message) => send(record, { type: "prompt", message });
  const end = async (record) => { record.handle.stdin.end(); await bounded(record.close, "public RPC EOF/worker close"); await bounded(record.pipes, "worker pipes"); assert.equal(record.code, 0); assert.equal(record.signal, null); assert.ok(record.events.some((event) => event.type === "finalized")); };
  // Deliberately no failure finally/cleanup/signals: an ambiguous postcondition freezes mutation.
  const other = launch(profiles[0]); await until(other, () => other.events.find((event) => event.type === "ready"), "other terminal ready", STARTUP_READY_TIMEOUT_MS);
  await send(other, { type: "prompt", message: "other terminal history" });
  await until(other, () => other.lines.find((line) => line.type === "agent_settled"), "other terminal settlement");
  const otherState = (await send(other, { type: "get_state" })).data;
  const otherBytes = fs.readFileSync(owned(root, otherState.sessionFile));
  const active = launch(profiles[0]); const origin = await until(active, () => active.events.find((event) => event.type === "ready"), "origin ready", STARTUP_READY_TIMEOUT_MS);
  assert.equal(origin.frozen && origin.runtimeSame, true);
  await slash(active, "/usuario list"); assert.ok(active.stdout.includes("orchid-test"));
  await slash(active, "/usuario status"); assert.ok(active.stdout.includes("amber-test"));
  await slash(active, "/fixture:real-roots");
  assert.deepEqual(active.events.find((event) => event.type === "real-cohort" && event.pid === origin.pid)?.names, ["principal", "subagents", "plastic-memory"]);
  await slash(active, "/usuario create fourth-user Fourth fixture");
  await slash(active, "/usuario create fourth-user Fourth fixture");
  await slash(active, "/usuario list"); assert.ok(active.stdout.includes("fourth-user"), `FOURTH_USER_MISSING stdoutTail=${JSON.stringify(active.stdout.slice(-3000))}`);
  const freshRoot = path.join(root, "profiles/fourth-user");
  assert.deepEqual(resolveUser({ registryPath, id: "fourth-user" }).contexts, [path.join(freshRoot, ".pi")]);
  assert.deepEqual(fs.readdirSync(path.join(freshRoot, ".pi/agent")), []);
  assert.deepEqual(fs.readdirSync(path.join(freshRoot, "sessions")), []);
  assert.deepEqual(fs.readdirSync(path.join(freshRoot, "workspace")), []);
  for (const kind of ["missing", "forged", "stale", "child", "queue", "scheduler", "plastic", "promotion", "race", "forge-ipc"]) {
    await slash(active, `/fixture:probe ${kind}`);
    assert.ok(active.events.some((event) => event.type === "probe" && event.kind === kind));
  }
  await slash(active, "/fixture:probe unknown-add");
  const unlistedSpawns = active.events.filter((event) => event.type === "spawn").length;
  await slash(active, "/usuario use cobalt-test");
  assert.equal(active.events.filter((event) => event.type === "spawn").length, unlistedSpawns);
  await slash(active, "/fixture:probe unknown-remove");
  await send(active, { type: "prompt", message: "fixture-hold accepted work" });
  await until(active, () => active.events.find((event) => event.type === "token"), "busy native stream");
  const beforeBusy = active.events.filter((event) => event.type === "spawn").length;
  await slash(active, "/usuario use cobalt-test"); assert.equal(active.events.filter((event) => event.type === "spawn").length, beforeBusy);
  await send(active, { type: "follow_up", message: "preserve queued work" });
  await slash(active, "/usuario use cobalt-test"); assert.equal(active.events.filter((event) => event.type === "spawn").length, beforeBusy);
  active.handle.send({ fixture: nonce, type: "release" });
  await until(active, () => active.lines.filter((line) => line.type === "agent_settled").length >= 1 && active.events.filter((event) => event.type === "token").length >= 2, "accepted queue survives refusal");
  // Public native command/prompt seams cover handled slash + no-turn and the native batch; immediate append, Agent.continue, and rejected-prompt counterexamples remain pending because this fixture has no non-facade public seam for them.
  const consumeAsides = async (message, expectedPrefixCount) => {
    const settled = active.lines.filter((line) => line.type === "agent_settled").length;
    const prefixEnds = active.events.filter((event) => event.type === "next-turn-prefix-end").length;
    await send(active, { type: "prompt", message });
    await until(active, () => active.lines.filter((line) => line.type === "agent_settled").length > settled, "actual normal prompt settlement");
    const settledState = (await send(active, { type: "get_state" })).data;
    assert.equal(settledState.isStreaming, false);
    assert.equal(active.events.filter((event) => event.type === "next-turn-prefix-end").length - prefixEnds, expectedPrefixCount);
  };
  const assertNextTurnPending = async (expected) => {
    const before = active.lines.length;
    await slash(active, "/usuario status");
    const notification = active.lines.slice(before).find((line) => line.type === "extension_ui_request" && line.method === "notify" && typeof line.message === "string" && line.message.includes("pendingNextTurnUnproved"));
    assert.ok(notification, "native /usuario status notification");
    // Status is non-secret: ids/flags/role names/counts only. Surface the proof enum on mismatch.
    assert.equal(JSON.parse(notification.message).pendingNextTurnUnproved, expected, `NEXT_TURN_PROOF ${JSON.stringify(JSON.parse(notification.message).nextTurnProof)}`);
  };
  await slash(active, "/fixture:next-turn");
  await assertNextTurnPending(true);
  await consumeAsides("consume earlier accepted aside", 1);
  await assertNextTurnPending(false);
  await slash(active, "/fixture:next-turn-pair");
  await slash(active, "/fixture:inject-prefix-aside");
  await assertNextTurnPending(true); // Handled slash/status must not consume the pair.
  await consumeAsides("consume identical prequeued asides", 2);
  await assertNextTurnPending(true); // A payload-identical later send is NOT in the original batch.
  const beforePrefixAsideRefusal = active.events.filter((event) => event.type === "spawn").length;
  const beforeRefusalLines = active.lines.length;
  await slash(active, "/usuario use cobalt-test");
  assert.equal(active.events.filter((event) => event.type === "spawn").length, beforePrefixAsideRefusal);
  assert.ok(active.lines.slice(beforeRefusalLines).some((line) => line.message === "USER_SWITCH_NEXT_TURN_UNPROVED"));
  await consumeAsides("consume prefix-enqueued third aside", 1);
  await assertNextTurnPending(false);
  const state = (await send(active, { type: "get_state" })).data;
  assert.equal(state.pendingMessageCount, 0); assert.equal(state.isStreaming, false);
  active.handle.stdin.write(`${JSON.stringify({ id: "held-command", type: "prompt", message: "/fixture:hold" })}\n`);
  await until(active, () => active.events.find((event) => event.type === "command-held"), "concurrent extension handler");
  await slash(active, "/usuario use cobalt-test"); assert.equal(active.events.filter((event) => event.type === "spawn").length, beforeBusy);
  active.handle.send({ fixture: nonce, type: "release" });
  await until(active, () => active.lines.find((line) => line.id === "held-command"), "concurrent command survives refusal");
  await slash(active, "/usuario use missing-user"); assert.equal(active.events.filter((event) => event.type === "spawn").length, beforeBusy);
  // Public RPC dispatch into the REAL root manager; only the provider stream is synthetic.
  await slash(active, "/fixture:real-sub");
  const realSub = await until(active, () => active.events.find((event) => event.type === "sub-spawned" && event.pid === origin.pid), "real SUB RPC spawn");
  await until(active, () => active.events.find((event) => event.type === "sub-stream-held" && event.pid === origin.pid), "real SUB held synthetic stream");
  const rootBusyState = (await send(active, { type: "get_state" })).data;
  assert.equal(rootBusyState.isStreaming, false); assert.equal(rootBusyState.pendingMessageCount, 0);
  const beforeRealBusy = active.events.filter((event) => event.type === "spawn").length;
  const refusalStart = active.lines.length;
  await slash(active, "/usuario use cobalt-test");
  assert.equal(active.events.filter((event) => event.type === "spawn").length, beforeRealBusy);
  assert.ok(active.lines.slice(refusalStart).some((line) => line.type === "extension_ui_request" && line.method === "notify" && line.message === "USER_SWITCH_FENCE_REFUSED"));
  assert.equal(active.events.some((event) => ["sub-completed", "sub-failed"].includes(event.type) && event.id === realSub.id), false);
  active.handle.send({ fixture: nonce, type: "release" });
  const completedSub = await until(active, () => active.events.find((event) => event.type === "sub-completed" && event.id === realSub.id), "real SUB accepted work completes after release");
  assert.equal(completedSub.status, "completed"); assert.equal(completedSub.result, "owned synthetic response");
  await until(active, () => active.events.find((event) => event.type === "sub-consumed" && event.pid === origin.pid), "public SUB completed result acknowledged");
  assert.equal(active.events.some((event) => event.type === "sub-failed" && event.id === realSub.id), false);
  const afterRealBusy = (await send(active, { type: "get_state" })).data;
  assert.equal(afterRealBusy.isStreaming, false); assert.equal(afterRealBusy.pendingMessageCount, 0);
  const originBytes = fs.readFileSync(owned(root, state.sessionFile));
  // A successful slash may close before its prompt ACK. Observe the fresh native receipt instead.
  active.handle.stdin.write(`${JSON.stringify({ id: "switch-cobalt", type: "prompt", message: "/usuario use cobalt-test" })}\n`);
  const destination = await until(active, () => active.events.find((event) => event.type === "ready" && event.id === "cobalt-test"), "actual old close then fresh selected process", STARTUP_READY_TIMEOUT_MS);
  assert.notEqual(destination.pid, origin.pid); assert.notEqual(destination.sessionId, origin.sessionId); assert.equal(destination.frozen && destination.runtimeSame, true);
  const oldClose = active.events.findIndex((event) => event.type === "close" && event.pid === origin.pid);
  const newSpawn = active.events.findIndex((event) => event.type === "spawn" && event.pid === destination.pid);
  assert.ok(oldClose !== -1 && newSpawn > oldClose); assert.equal(active.events[oldClose].disposed, true);
  const phases = ["sub-scheduler-stopped", "sub-manager-disposed", "plastic-shutdown", "plastic-unregistered"];
  for (const phase of phases) {
    const index = active.events.findIndex((event) => event.type === "root-lifecycle" && event.pid === origin.pid && event.phase === phase);
    assert.ok(index !== -1 && index < oldClose && index < newSpawn, `OLD_CHILD_JOINT_SHUTDOWN_${phase}`);
  }
  const originDrain = active.events.find((event) => event.type === "disposed" && event.pid === origin.pid).drained;
  assert.ok(originDrain.expectedDenied.gitProbe >= 1, "REAL_SUB_GIT_ENV_PROBE_DENIED");
  assert.ok(originDrain.deniedGitProbes.some((probe) => JSON.stringify(probe.argv) === JSON.stringify(["rev-parse", "--is-inside-work-tree"])));
  await slash(active, "/fixture:real-roots");
  assert.deepEqual(active.events.find((event) => event.type === "real-cohort" && event.pid === destination.pid)?.names, ["principal", "subagents", "plastic-memory"]);
  assert.deepEqual(fs.readFileSync(state.sessionFile), originBytes);
  const freshState = (await send(active, { type: "get_state" })).data;
  assert.equal(freshState.messageCount, 0); assert.equal(freshState.pendingMessageCount, 0);
  const settledBefore = active.lines.filter((line) => line.type === "agent_settled").length;
  await send(active, { type: "prompt", message: "selected token request" });
  await until(active, () => active.events.find((event) => event.type === "token" && event.id === "cobalt-test") && active.lines.filter((line) => line.type === "agent_settled").length > settledBefore, "selected auth boundary and settlement");
  active.handle.stdin.write(`${JSON.stringify({ id: "switch-orchid", type: "prompt", message: "/usuario use orchid-test" })}\n`);
  const third = await until(active, () => active.events.find((event) => event.type === "ready" && event.id === "orchid-test"), "third arbitrary selected user", STARTUP_READY_TIMEOUT_MS);
  assert.notEqual(third.pid, destination.pid); assert.notEqual(third.sessionId, destination.sessionId);
  const thirdState = (await send(active, { type: "get_state" })).data;
  assert.equal(thirdState.messageCount, 0);
  await send(active, { type: "prompt", message: "third selected token request" });
  await until(active, () => active.events.find((event) => event.type === "token" && event.id === "orchid-test"), "third auth boundary");
  assert.ok(active.events.filter((event) => event.type === "token").every((event) => event.token === `synthetic-${event.id}`));
  const preservedOther = (await send(other, { type: "get_state" })).data;
  assert.equal(preservedOther.sessionId, otherState.sessionId); assert.equal(preservedOther.sessionFile, otherState.sessionFile);
  assert.deepEqual(fs.readFileSync(otherState.sessionFile), otherBytes);
  await end(active); await end(other);
  const failed = launch(profiles[0], { failDestination: "cobalt-test" });
  await until(failed, () => failed.events.find((event) => event.type === "ready"), "failure origin ready", STARTUP_READY_TIMEOUT_MS);
  await send(failed, { type: "prompt", message: "history for explicit origin recovery" });
  await until(failed, () => failed.lines.find((line) => line.type === "agent_settled"), "failure origin settlement");
  const failedState = (await send(failed, { type: "get_state" })).data;
  const failedBytes = fs.readFileSync(failedState.sessionFile);
  failed.handle.stdin.write(`${JSON.stringify({ id: "expected-failure", type: "prompt", message: "/usuario use cobalt-test" })}\n`);
  const failure = await until(failed, () => failed.events.find((event) => event.type === "failure-origin"), "expected new-spawn failure");
  assert.equal(failed.events.filter((event) => event.type === "spawn").length, 1);
  assert.ok(failed.events.some((event) => event.type === "close" && event.pid === failure.origin.originPid && event.disposed));
  assert.deepEqual(fs.readFileSync(failedState.sessionFile), failedBytes);
  failed.handle.send({ fixture: nonce, type: "recover" });
  const recoveryReceipt = await until(failed, () => failed.events.find((event) => event.type === "ready" && event.pid !== failure.origin.originPid), "explicit own saved-origin recovery", STARTUP_READY_TIMEOUT_MS);
  assert.equal(recoveryReceipt.sessionId, failedState.sessionId);
  assert.equal(recoveryReceipt.sessionPath, failedState.sessionFile);
  assert.deepEqual(fs.readFileSync(failedState.sessionFile), failedBytes);
  await slash(failed, "/fixture:next-turn");
  const nextTurnBytes = fs.readFileSync(failedState.sessionFile), beforeNextTurnUse = failed.events.filter((event) => event.type === "spawn").length;
  await slash(failed, "/usuario use orchid-test");
  assert.equal(failed.events.filter((event) => event.type === "spawn").length, beforeNextTurnUse);
  assert.deepEqual(fs.readFileSync(failedState.sessionFile), nextTurnBytes);
  await send(failed, { type: "prompt", message: "consume accepted aside normally" });
  await until(failed, () => failed.events.some((event) => event.type === "next-turn-observed"), "accepted nextTurn survives refusal without draining");
  await end(failed);
  assert.ok(failed.events.some((event) => event.type === "finalized" && event.outcome === "expected-relaunch-failure"));
  assert.deepEqual(profiles.map((profile) => digest(fs.readFileSync(path.join(profile.agentDir, "auth.json")))), auth);
  assert.ok(records.every((record) => record.closed));
  assert.equal(fs.realpathSync.native(root), root); const current = fs.lstatSync(root);
  for (const key of ["dev", "ino", "birthtimeMs"]) assert.equal(current[key], identity[key]);
  verifyTree(root);
  process.stdout.write("NATIVE_RPC_MATRIX REAL principal/pending/concurrent/refusal/success/three-users/selected-auth/fresh-session/relaunch-failure/explicit-recovery/two-terminal; REAL_ROOT_MATRIX SUB-0.18.2/full-Plastic/cohort/public-SUB-busy/no-successor/no-lost-work/release-completion/switch/joint-shutdown-before-spawn; SYNTHETIC provider-stream + READINESS missing/stale/unknown/forged/child/queue/scheduler/Plastic/promotion/race/release; UNVERIFIED Plastic-busy(public-held-workload-not-established)/real-scheduler-race/real-promotion/Windows-TTY; git env probe denied (non-git fallback exercised)\n");
  sandbox.cleanup(); // Success only, after all public disposals/drains/own children AND pipes close.
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const work = process.argv[2] === "--supervisor" ? supervisor(process.argv[3], process.argv[4]) : parent();
  work.catch((error) => { process.stderr.write(`SWITCH_FIXTURE_FAILED_NAMESPACE_OFFLIMITS ${error.stack}\n`); process.exitCode = 1; });
}
