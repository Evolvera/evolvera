import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { AsyncLocalStorage } from "node:async_hooks";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import { types } from "node:util";
import Module, { createRequire, syncBuiltinESMExports } from "node:module";
import { PACKAGE_NAME, PACKAGE_VERSION, stageSubagentsProfileCompatibility } from "../compat/subagents-users.mjs";

let ROOT;
let RUN_KEY;
const cliGrants = new WeakSet();
const scheduledGrants = new WeakSet();
const SCHEDULED_EXEC_FILE_SYNC = execFileSync; // Private original; never exported to the SDK or returned by the broker.
const SCHEDULED_SUB_FILES = Object.freeze(["src/schedule.ts", "src/worktree.ts", "src/mention.ts", "src/model-resolver.ts", "src/usage.ts", "src/agent-types.ts", "src/types.ts"]);
const SCHEDULED_PACKAGE_FILES = Object.freeze({ croner: ["package.json", "dist/croner.js"], nanoid: ["package.json", "index.js", "url-alphabet/index.js"] });
const SCHEDULED_GIT = Object.freeze({ executable: path.resolve("C:/Program Files/Git/mingw64/bin/git.exe"), dev: 907685340, ino: 562949954003362, nlink: 4, size: 4383048, sha256: "1a0043555d254618f2d56c936c3d9a1fbfb878bc878416a133c346bc7835eda9" });
let cliBootstrapInitialized = false;
const SCRIPT = fileURLToPath(import.meta.url);
const SUB_SOURCE = "C:/Users/kevin/.pi/agent/npm/node_modules/@tintinweb/pi-subagents";
const MEMORY_SOURCE = path.resolve(path.dirname(SCRIPT), "../../extensions/plastic-memory");
const MEMORY_CODE_FILES = Object.freeze(["common/ids.ts", "common/safety.ts", "compaction/engine.ts", "compaction/extract.ts", "compaction/pending.ts", "compaction/render.ts", "project/schema.ts", "runtime/runner-runtime.ts", "session/cycles.ts", "session/ledger.ts", "session/render-summary.ts", "session/types.ts", "workers/compactor.ts", "workers/observer.ts", "workers/promoter.ts", "workers/reflector.ts", "workers/runner.ts", "workers/scheduler.ts"]);
const SUB_CODE_FILES = new Set(["package.json", "src/agent-runner.ts", "src/agent-manager.ts", "src/index.ts", "src/memory.ts", "src/output-file.ts", "src/schedule-store.ts", "src/custom-agents.ts", "src/schedule.ts"].map((file) => path.resolve(SUB_SOURCE, file)));
const runOwned = (p) => {
  const resolved = path.resolve(p);
  const rel = path.relative(ROOT, resolved);
  if (rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) throw new Error("runtime smoke path escaped its owned root");
  return resolved;
};
const mkdir = (...parts) => {
  const target = runOwned(path.join(ROOT, ...parts));
  fs.mkdirSync(target, { recursive: true });
  return target;
};
const write = (p, data) => fs.writeFileSync(runOwned(p), data, { flag: "wx" });

// Fixed Git inputs are constructed by the parent, not accepted from SDK/tool callers.
function scheduledGitEnvironment(home, control, workspace) {
  const env = {};
  for (const key of ["SystemRoot", "windir"]) if (typeof process.env[key] === "string") env[key] = process.env[key];
  Object.assign(env, {
    HOME: home, USERPROFILE: home, APPDATA: path.join(home, "AppData", "Roaming"),
    LOCALAPPDATA: path.join(home, "AppData", "Local"), XDG_CONFIG_HOME: path.join(home, ".config"),
    XDG_CACHE_HOME: path.join(home, ".cache"), TEMP: path.join(home, "Temp"), TMP: path.join(home, "Temp"), TMPDIR: path.join(home, "Temp"),
    PATH: path.join(control, "empty-bin"), SYSTEMDRIVE: path.parse(home).root.slice(0, 2),
    HOMEDRIVE: path.parse(home).root.slice(0, 2), HOMEPATH: home.slice(2),
    LOGONSERVER: "\\\\PI-USERS-SYNTHETIC", USERDOMAIN: "PI-USERS-SYNTHETIC", USERNAME: "pi-users-synthetic",
    GIT_CONFIG_GLOBAL: path.join(control, "global.config"), GIT_CONFIG_SYSTEM: path.join(control, "system.config"),
    GIT_CONFIG_NOSYSTEM: "1", GIT_CEILING_DIRECTORIES: workspace,
  });
  return env;
}
function readScheduledRecord(id, registryPath, nonce, recordHash) {
  const recordPath = runOwned(path.join(ROOT, "registry", `${id}-scheduled.json`));
  const recordStat = fs.lstatSync(recordPath);
  assert.ok(recordStat.isFile() && !recordStat.isSymbolicLink() && recordStat.nlink === 1);
  assert.equal(fs.realpathSync.native(recordPath), recordPath);
  const bytes = fs.readFileSync(recordPath);
  assert.equal(cliDigest(bytes), recordHash);
  const grant = sealCliData(JSON.parse(bytes));
  assert.equal(grant.root, ROOT);
  assert.equal(grant.id, id);
  assert.equal(grant.nonce, nonce);
  assert.match(grant.nonce, /^[a-f0-9]{48}$/);
  assert.equal(grant.registryPath, registryPath);
  assert.equal(grant.recordPath, recordPath);
  assert.equal(grant.cwd, path.join(ROOT, id, "workspace"));
  assert.equal(grant.control, path.join(ROOT, id, "git-control"));
  assert.equal(grant.template, path.join(grant.control, "empty-template"));
  assert.deepEqual(grant.binary, SCHEDULED_GIT);
  assert.deepEqual(grant.env, scheduledGitEnvironment(path.join(ROOT, id, "home"), grant.control, grant.cwd));
  scheduledGrants.add(grant);
  return grant;
}
function createScheduledGitBroker(grant, boundaryFailure, counters) {
  assert.equal(scheduledGrants.has(grant), true);
  // Private captured FS methods inspect only fixed manifest paths (and the one readonly CODE binary).
  const read = fs.readFileSync.bind(fs), stat = fs.lstatSync.bind(fs), list = fs.readdirSync.bind(fs), real = fs.realpathSync.native;
  // readFileSync still calls the patched openSync; this private reader owns its
  // readonly descriptor and accepts no caller path or fd. Never expose it to SDK code.
  const binaryOpen = fs.openSync.bind(fs), binaryRead = fs.readSync.bind(fs);
  const binaryStat = fs.fstatSync.bind(fs), binaryClose = fs.closeSync.bind(fs);
  const readPinnedGitBinary = () => {
    const fd = binaryOpen(SCHEDULED_GIT.executable, "r");
    try {
      const before = binaryStat(fd);
      assert.ok(before.isFile());
      for (const key of ["dev", "ino", "nlink", "size"]) assert.equal(before[key], SCHEDULED_GIT[key]);
      const bytes = Buffer.alloc(SCHEDULED_GIT.size);
      let offset = 0;
      while (offset < bytes.length) {
        const count = binaryRead(fd, bytes, offset, bytes.length - offset, offset);
        assert.ok(Number.isInteger(count) && count > 0 && count <= bytes.length - offset, "SCHEDULED_GIT_BINARY_SHORT_READ");
        offset += count;
      }
      const after = binaryStat(fd);
      assert.ok(after.isFile());
      for (const key of ["dev", "ino", "nlink", "size", "birthtimeMs", "mtimeMs", "ctimeMs"]) assert.equal(after[key], before[key]);
      assert.equal(real(SCHEDULED_GIT.executable), SCHEDULED_GIT.executable);
      const current = stat(SCHEDULED_GIT.executable);
      assert.ok(current.isFile() && !current.isSymbolicLink());
      for (const key of ["dev", "ino", "nlink", "size"]) assert.equal(current[key], before[key]);
      return bytes;
    } finally {
      binaryClose(fd); // Also closes after assertion, short-read or native read failure.
    }
  };
  const ancestry = new AsyncLocalStorage();
  const tokens = new WeakSet();
  const originalExecFileSync = SCHEDULED_EXEC_FILE_SYNC;
  let initConsumed = false, initCompleted = 0, pruneCompleted = 0, failed = false;
  let registration;
  const recordHash = cliDigest(JSON.stringify(grant));
  const identity = (file, expected, directory) => {
    assert.equal(real(file), file);
    const s = stat(file);
    assert.equal(s.isSymbolicLink(), false);
    assert.equal(directory ? s.isDirectory() : s.isFile(), true);
    if (!directory) assert.equal(s.nlink, 1);
    for (const key of ["dev", "ino", "birthtimeMs"]) assert.equal(s[key], expected[key]);
  };
  const tree = (directory) => {
    assert.equal(real(directory), directory);
    const directoryStat = stat(directory);
    assert.ok(directoryStat.isDirectory() && !directoryStat.isSymbolicLink());
    for (const name of list(directory)) {
      const file = runOwned(path.join(directory, name));
      const s = stat(file);
      assert.equal(s.isSymbolicLink(), false);
      assert.equal(real(file), file);
      if (s.isDirectory()) tree(file);
      else assert.ok(s.isFile() && s.nlink === 1, "SCHEDULED_MUTABLE_ALIAS");
    }
  };
  let gitIdentity;
  let configBytes;
  const attest = (initialized) => {
    assert.equal(failed, false, "SCHEDULED_GIT_FAILURE_LATCHED");
    assert.deepEqual(counters, { protected: 0, network: 0, child: 0, outside: 0, keyring: 0 });
    assert.equal(process.cwd(), grant.cwd);
    identity(grant.root, grant.rootIdentity, true);
    identity(grant.cwd, grant.workspaceIdentity, true);
    identity(grant.control, grant.controlIdentity, true);
    tree(grant.root); // Includes every mutable config/template/controller relation, not merely lexical containment.
    assert.equal(cliDigest(read(grant.recordPath)), recordHash);
    assert.deepEqual(list(grant.template), []);
    assert.deepEqual(list(path.join(grant.control, "empty-bin")), []);
    for (const file of [grant.env.GIT_CONFIG_GLOBAL, grant.env.GIT_CONFIG_SYSTEM]) assert.equal(read(file).length, 0);
    assert.equal(real(SCHEDULED_GIT.executable), SCHEDULED_GIT.executable);
    const binary = stat(SCHEDULED_GIT.executable);
    assert.ok(binary.isFile() && !binary.isSymbolicLink());
    for (const key of ["dev", "ino", "nlink", "size"]) assert.equal(binary[key], SCHEDULED_GIT[key]);
    assert.equal(cliDigest(readPinnedGitBinary()), SCHEDULED_GIT.sha256);
    // Only these explicit Git configuration controls are admitted; no redirect/alternate inherited variables.
    assert.deepEqual(grant.env, scheduledGitEnvironment(path.join(ROOT, grant.id, "home"), grant.control, grant.cwd));
    assert.deepEqual(Object.keys(grant.env).filter((key) => /^GIT_/i.test(key)).sort(), ["GIT_CEILING_DIRECTORIES", "GIT_CONFIG_GLOBAL", "GIT_CONFIG_NOSYSTEM", "GIT_CONFIG_SYSTEM"]);
    if (process.platform === "win32") for (const key of WINDOWS_REQUIRED_ENV) {
      assert.ok(Object.keys(grant.env).some((name) => name.toLowerCase() === key.toLowerCase()), `SCHEDULED_NO_WINDOWS_ENV_FALLBACK ${key}`);
    }
    if (!initialized) { assert.deepEqual(list(grant.cwd), []); return; }
    const git = path.join(grant.cwd, ".git");
    const s = stat(git);
    assert.ok(s.isDirectory() && !s.isSymbolicLink()); // Never accept a linked/separate .git controller file.
    if (gitIdentity) identity(git, gitIdentity, true);
    else gitIdentity = { dev: s.dev, ino: s.ino, birthtimeMs: s.birthtimeMs };
    const directories = new Set(["objects", "objects/info", "objects/pack", "refs", "refs/heads", "refs/tags"]);
    const files = new Set(["HEAD", "config"]);
    const namespace = (dir, relative = "") => {
      for (const name of list(dir)) {
        const rel = relative ? `${relative}/${name}` : name;
        const entry = path.join(dir, name), entryStat = stat(entry);
        if (entryStat.isDirectory()) { assert.equal(directories.has(rel), true, `SCHEDULED_UNKNOWN_GIT_NAMESPACE ${rel}`); namespace(entry, rel); }
        else assert.equal(files.has(rel), true, `SCHEDULED_UNKNOWN_GIT_NAMESPACE ${rel}`);
      }
    };
    namespace(git); // Excludes worktrees, commondir, gitdir, alternates, includes, hooks, refs and objects.
    assert.match(read(path.join(git, "HEAD"), "utf8"), /^ref: refs\/heads\/[A-Za-z0-9_-]+\r?\n$/);
    const config = read(path.join(git, "config"));
    if (configBytes) assert.deepEqual(config, configBytes);
    else {
      const lines = config.toString("utf8").trim().split(/\r?\n/);
      assert.equal(lines.shift(), "[core]");
      const values = new Map();
      for (const line of lines) {
        const match = /^\s*(repositoryformatversion|filemode|bare|logallrefupdates|symlinks|ignorecase)\s*=\s*(0|true|false)\s*$/.exec(line);
        assert.ok(match, "SCHEDULED_UNKNOWN_GIT_CONFIG");
        assert.equal(values.has(match[1]), false);
        values.set(match[1], match[2]);
      }
      assert.equal(values.get("repositoryformatversion"), "0");
      assert.equal(values.get("bare"), "false");
      for (const [key, value] of values) if (key !== "repositoryformatversion") assert.ok(["true", "false"].includes(value));
      configBytes = Buffer.from(config);
    }
    assert.deepEqual(list(path.join(git, "objects/info")), []);
    assert.deepEqual(list(path.join(git, "objects/pack")), []);
    assert.deepEqual(list(path.join(git, "refs/heads")), []);
    assert.deepEqual(list(path.join(git, "refs/tags")), []);
  };
  const effect = (argv, initialized) => {
    try {
      attest(initialized);
      assert.equal(typeof originalExecFileSync, "function");
      const result = originalExecFileSync(SCHEDULED_GIT.executable, argv, {
        cwd: grant.cwd, env: { ...grant.env }, stdio: "pipe", timeout: 5000, shell: false,
      }); // Native lexical spawnSync and checkExecSyncError: a return proves successful synchronous completion.
      assert.ok(Buffer.isBuffer(result));
      if (initialized) pruneCompleted++; else initCompleted++;
      attest(true);
      return result;
    } catch (error) { failed = true; throw error; }
  };
  const guardedExecFileSync = function (file, argv, options) {
    const token = ancestry.getStore();
    if (!token || !tokens.has(token) || token !== registration?.token || token.manager !== registration.manager || !token.active || token.consumed || failed) {
      failed = true; boundaryFailure("child", "unadmitted scheduled Git ancestry");
    }
    token.consumed = true; // Consume before inspecting inputs or entering the original syscall; never retry.
    try {
      assertPlainData(argv); assertPlainData(options);
      assert.equal(file, "git");
      assert.deepEqual(argv, ["worktree", "prune"]);
      assert.deepEqual(options, { cwd: grant.cwd, stdio: "pipe", timeout: 5000 });
      assert.equal(registration.NativeManager.prototype.dispose, registration.originalDispose);
      assert.equal(registration.manager.dispose, registration.originalDispose);
      assert.equal(registration.record.status, "completed");
      assert.equal(registration.record.session, registration.session);
      assert.equal(registration.session.modelRuntime, registration.runtime.receipt.modelRuntime);
      registration.runtime.receipt.assertOwnedSession({ sessionPath: registration.session.sessionFile, cwd: grant.cwd });
      const disposals = registration.disposals.filter(({ session }) => session === registration.session);
      assert.equal(disposals.length, 1);
      assert.equal(disposals[0].synchronousReturn, true, "original SDK child disposal returned before Git");
    } catch { failed = true; boundaryFailure("child", "invalid scheduled Git invocation"); }
    return effect(["worktree", "prune"], true);
  };
  const broker = Object.freeze({
    init() {
      assert.equal(initConsumed, false);
      initConsumed = true;
      effect(["init", `--template=${grant.template}`], false);
    },
    register(manager, NativeManager, record, runtime, disposals) {
      assert.equal(registration, undefined);
      assert.ok(Array.isArray(disposals) && !types.isProxy(disposals));
      assert.equal(initCompleted, 1);
      assert.equal(Object.getPrototypeOf(manager), NativeManager.prototype);
      const originalDispose = Object.getOwnPropertyDescriptor(NativeManager.prototype, "dispose").value;
      assert.equal(manager.dispose, originalDispose);
      assert.equal(typeof originalDispose, "function");
      assert.equal(manager.getRecord(record.id), record);
      assert.equal(record.status, "completed");
      assert.ok(record.promise && typeof record.promise.then === "function");
      const session = record.session;
      assert.ok(session instanceof runtime.sdk.AgentSession);
      assert.equal(session.modelRuntime, runtime.receipt.modelRuntime);
      assert.equal(session.isStreaming, false);
      assert.equal(session.isIdle, true);
      assert.deepEqual(session.getActiveToolNames(), []);
      assert.deepEqual(session.getCallableToolNames(), []);
      assert.equal(session.sessionManager.getCwd(), grant.cwd);
      runtime.receipt.assertOwnedSession({ sessionPath: session.sessionFile, cwd: grant.cwd });
      const token = Object.seal(Object.defineProperty({ active: false, consumed: false }, "manager", { value: manager, writable: false, configurable: false }));
      tokens.add(token);
      registration = Object.freeze({ manager, NativeManager, originalDispose, record, session, runtime, disposals, token });
    },
    async dispose() {
      assert.ok(registration);
      const r = registration;
      assert.equal(r.token.active, false);
      assert.equal(r.token.consumed, false);
      assert.equal(r.NativeManager.prototype.dispose, r.originalDispose);
      assert.equal(r.manager.dispose, r.originalDispose);
      assert.equal(r.manager.getRecord(r.record.id), r.record);
      assert.equal(r.record.status, "completed");
      assert.equal(r.record.session, r.session);
      assert.equal(r.session.isStreaming, false);
      assert.equal(r.session.isIdle, true);
      assert.deepEqual(r.session.getActiveToolNames(), []);
      assert.deepEqual(r.session.getCallableToolNames(), []);
      await r.record.promise;
      r.runtime.receipt.assertOwnedSession({ sessionPath: r.session.sessionFile, cwd: grant.cwd });
      r.token.active = true;
      try { await ancestry.run(r.token, () => r.originalDispose.call(r.manager)); }
      catch (error) { failed = true; throw error; }
      finally { r.token.active = false; }
      assert.equal(r.NativeManager.prototype.dispose, r.originalDispose);
      assert.equal(r.token.consumed, true);
      assert.deepEqual({ initCompleted, pruneCompleted, failed }, { initCompleted: 1, pruneCompleted: 1, failed: false });
    },
    receipt() { assert.deepEqual({ initCompleted, pruneCompleted, failed }, { initCompleted: 1, pruneCompleted: 1, failed: false }); return { initCompleted, pruneCompleted }; },
  });
  return Object.freeze({ guardedExecFileSync, broker });
}

async function installResourceGuards(workerId, aliasFixtures = [], managedChildGrant, scheduledGrant) {
  const CORE = "C:/nvm4w/nodejs/node_modules/@earendil-works/pi-coding-agent";
  const scriptsRoot = path.resolve(path.dirname(SCRIPT), "..");
  const declaredSources = [path.join(scriptsRoot, "users"), path.join(scriptsRoot, "compat"), path.join(scriptsRoot, "test"), path.resolve(CORE), path.resolve(SUB_SOURCE)];
  const sourceRoots = [...new Set(declaredSources.flatMap((code) => [code, fs.realpathSync.native(code)]))];
  const realpathNativeOriginal = fs.realpathSync.native;
  const lstatSyncOriginal = fs.lstatSync;
  const statSyncOriginal = fs.statSync;
  const within = (root, target) => { const rel = path.relative(root, target); return rel === "" || (rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel)); };
  const fdOwners = new Map();
  const denied = { protected: 0, network: 0, child: 0, outside: 0, keyring: 0 };
  const protectedRoots = ["C:/Users/kevin/.pi", "C:/Users/kevin/.agents", "C:/Users/kevin/Documents/Pi/.pi"].map((p) => path.resolve(p));
  const boundaryFailure = (category = "outside", detail = "") => {
    denied[category] += 1;
    process.stderr.write(`GUARD_DENIAL ${category} ${detail}\n${new Error().stack}\n`);
    throw Object.assign(new Error(`SMOKE_RESOURCE_BOUNDARY ${category} ${detail}`), { code: "SMOKE_RESOURCE_BOUNDARY" });
  };
  const scheduledGit = scheduledGrant ? createScheduledGitBroker(scheduledGrant, boundaryFailure, denied) : undefined;
  const assertDescriptor = (fd, writeAccess = false, logging = false) => {
    const access = fdOwners.get(fd);
    if (logging && writeAccess && (fd === 1 || fd === 2)) return;
    if (!access || writeAccess && !access.writes) boundaryFailure("outside", "untracked/read-only descriptor");
    ownPath(access.file, writeAccess);
  };
  const aliasMetadataPaths = new Set();
  const attestAliasFixtures = () => {
    for (const fixture of aliasFixtures) {
      const aliasPath = path.resolve(fixture.aliasPath);
      const targetPath = path.resolve(fixture.targetPath);
      if (!within(ROOT, aliasPath) || !within(ROOT, targetPath) || aliasPath === targetPath) throw new Error("SMOKE_ALIAS_FIXTURE_OUTSIDE_ROOT");
      const targetCanonical = realpathNativeOriginal(targetPath);
      const aliasCanonical = realpathNativeOriginal(aliasPath);
      if (targetCanonical !== targetPath || !within(ROOT, aliasCanonical) || (fixture.kind !== "hardlink" && aliasCanonical !== targetPath)) throw new Error("SMOKE_ALIAS_CANONICAL_TARGET_INVALID");
      const aliasStat = lstatSyncOriginal(aliasPath);
      const targetStat = lstatSyncOriginal(targetPath);
      const resolvedAliasStat = statSyncOriginal(aliasPath);
      if (targetCanonical !== targetPath || !within(ROOT, targetCanonical) || !targetStat.isFile() || !resolvedAliasStat.isFile()) throw new Error("SMOKE_ALIAS_FIXTURE_INVALID");
      if (fixture.kind === "symlink") {
        if (!aliasStat.isSymbolicLink() || aliasCanonical !== targetCanonical || resolvedAliasStat.dev !== targetStat.dev || resolvedAliasStat.ino !== targetStat.ino || aliasStat.nlink !== 1 || targetStat.nlink !== 1) throw new Error("SMOKE_SYMLINK_FIXTURE_IDENTITY");
        aliasMetadataPaths.add(aliasPath);
      } else if (fixture.kind === "junction") {
        const linkPath = path.resolve(fixture.linkPath);
        const targetDirectory = path.dirname(targetPath);
        if (!within(ROOT, linkPath) || path.dirname(aliasPath) !== linkPath || !lstatSyncOriginal(linkPath).isSymbolicLink() || realpathNativeOriginal(linkPath) !== targetDirectory || aliasStat.isSymbolicLink() || !aliasStat.isFile() || aliasStat.nlink !== 1 || targetStat.nlink !== 1 || resolvedAliasStat.dev !== targetStat.dev || resolvedAliasStat.ino !== targetStat.ino) throw new Error("SMOKE_JUNCTION_FIXTURE_IDENTITY");
        aliasMetadataPaths.add(aliasPath);
      } else if (fixture.kind === "hardlink") {
        if (aliasStat.isSymbolicLink() || aliasCanonical !== aliasPath || aliasStat.dev !== targetStat.dev || aliasStat.ino !== targetStat.ino || aliasStat.nlink !== 2 || targetStat.nlink !== 2) throw new Error("SMOKE_HARDLINK_FIXTURE_IDENTITY");
        aliasMetadataPaths.add(aliasPath);
        aliasMetadataPaths.add(targetPath);
      } else throw new Error("SMOKE_ALIAS_FIXTURE_KIND");
    }
  };
  attestAliasFixtures();
  const ownPath = (value, writeAccess = false, metadataOperation = "") => {
    if (typeof value === "number") return assertDescriptor(value, writeAccess);
    if (typeof value !== "string" && !(value instanceof URL) && !Buffer.isBuffer(value)) boundaryFailure();
    const raw = value instanceof URL ? fileURLToPath(value) : Buffer.isBuffer(value) ? value.toString() : value;
    const target = path.resolve(raw.startsWith("file:") ? fileURLToPath(raw) : raw);
    const exactSubCodeRead = !writeAccess && SUB_CODE_FILES.has(target);
    const exactAliasMetadata = !writeAccess && aliasMetadataPaths.has(target) && /^(?:lstat|realpath)$/.test(metadataOperation);
    if (exactAliasMetadata) attestAliasFixtures();
    if (protectedRoots.some((root) => (within(root, target) && !exactSubCodeRead) || writeAccess && within(target, root))) boundaryFailure("protected");
    const lexicalOwned = within(ROOT, target);
    const lexicalSourceRoot = sourceRoots.find((root) => within(root, target));
    const lexicalSource = lexicalSourceRoot !== undefined;
    if (!lexicalOwned && !(lexicalSource && !writeAccess)) boundaryFailure("outside", `path=${target} write=${writeAccess}`);
    const allowedRoot = lexicalOwned ? ROOT : lexicalSourceRoot;
    let probe = allowedRoot;
    const relative = path.relative(allowedRoot, target);
    for (const component of relative.split(path.sep).filter(Boolean)) {
      probe = path.join(probe, component);
      try {
        const stat = lstatSyncOriginal(probe);
        if ((stat.isSymbolicLink() || stat.isFile() && stat.nlink > 1) && !exactAliasMetadata) boundaryFailure();
      } catch (error) {
        if (error.code === "ENOENT" || error.code === "ENOTDIR") break;
        throw error;
      }
    }
    let current = target;
    const rest = [];
    let canonical;
    for (;;) {
      try { canonical = path.join(realpathNativeOriginal(current), ...rest.slice().reverse()); break; }
      catch (error) {
        if (!["ENOENT", "ENOTDIR"].includes(error.code)) boundaryFailure();
        const parent = path.dirname(current);
        if (parent === current || !within(allowedRoot, parent)) boundaryFailure();
        rest.push(path.basename(current));
        current = parent;
      }
    }
    const canonicalOwned = within(ROOT, canonical);
    const canonicalSource = sourceRoots.some((root) => within(root, canonical));
    const exactAliasTarget = exactAliasMetadata && canonicalOwned && within(ROOT, target) && aliasFixtures.some((fixture) => {
      const aliasPath = path.resolve(fixture.aliasPath);
      const targetPath = path.resolve(fixture.targetPath);
      return target === aliasPath && (fixture.kind !== "hardlink" ? canonical === targetPath : canonical === aliasPath) || fixture.kind === "hardlink" && target === targetPath && canonical === targetPath;
    });
    if (lexicalOwned && canonical !== target && !exactAliasTarget || writeAccess && (!canonicalOwned || canonical !== target) || !writeAccess && !canonicalOwned && !canonicalSource) boundaryFailure();
  };
  // Metadata-only synthetic absence: never stat/read host ancestor markers.
  const sdkWorkspaceBases = [path.dirname(path.resolve(CORE)), path.dirname(realpathNativeOriginal(CORE))];
  const absentPaths = new Set(sdkWorkspaceBases.flatMap((base) => ["agent/dist/index.js", "tui/dist/index.js", "ai/dist/compat.js", "ai/dist/oauth.js", "ai/dist/providers/all.js"].map((p) => path.resolve(base, ...p.split("/")))));
  for (let dir = path.dirname(ROOT); ; dir = path.dirname(dir)) {
    for (const marker of [".pi", path.join(".pi", "memory"), ".agents", path.join(".agents", "skills"), ".git", "AGENTS.md", "CLAUDE.md"]) absentPaths.add(path.join(dir, marker));
    if (path.dirname(dir) === dir) break;
  }
  const writesFlags = (flags) => typeof flags === "number"
    ? (flags & (fs.constants.O_WRONLY | fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_APPEND)) !== 0
    : typeof flags === "string" && /[wa+]/.test(flags);
  const pendingOperations = new Map();
  const completedOperations = [];
  let nextPendingId = 0;
  let activity = 0;
  const pendingCount = () => pendingOperations.size;
  const roleFor = (value) => {
    const target = typeof value === "string" ? path.resolve(value) : "";
    if (/[/\\]sessions?[/\\]/i.test(target)) return "session";
    if (/[/\\]settings\.json$/i.test(target)) return "settings";
    if (/[/\\]extensions[/\\]/i.test(target)) return "extension-code";
    if (within(ROOT, target)) return "run-owned";
    if (sourceRoots.some((root) => within(root, target))) return "read-only-code";
    return "descriptor-or-other";
  };
  const safeDiagnosticPath = (value) => {
    if (typeof value !== "string") return String(value ?? "<unknown>");
    const target = path.resolve(value);
    if (within(ROOT, target)) return `<run-root>${path.relative(ROOT, target) ? path.sep + path.relative(ROOT, target) : ""}`;
    for (const root of sourceRoots) if (within(root, target)) return `<code-root>${path.relative(root, target) ? path.sep + path.relative(root, target) : ""}`;
    return path.basename(target);
  };
  const pendingStart = (operation, target) => {
    const id = ++nextPendingId;
    const startedAt = Date.now();
    let stack = new Error().stack ?? "";
    stack = stack.replaceAll(ROOT, "<run-root>").replace(/(?:[A-Z]:[\\/]+Users[\\/]+)[^\\/]+/gi, "<user-home>");
    pendingOperations.set(id, { id, workerId, operation, path: safeDiagnosticPath(target), role: roleFor(target), startedAt, stack });
    return id;
  };
  const pendingFinish = (id) => {
    const operation = pendingOperations.get(id);
    if (!operation) throw new Error(`SMOKE_PENDING_TRACKING_MISMATCH id=${id}`);
    pendingOperations.delete(id);
    completedOperations.push({ id, workerId: operation.workerId, operation: operation.operation, path: operation.path, role: operation.role, lifetimeMs: Date.now() - operation.startedAt });
    if (completedOperations.length > 30) completedOperations.shift();
  };
  const trackPromise = (promise, operation, target) => {
    const id = pendingStart(operation, target);
    return promise.finally(() => pendingFinish(id));
  };
  const pathOps = {
    access: [0], accessSync: [0], appendFile: [0], appendFileSync: [0], chmod: [0], chmodSync: [0], chown: [0], chownSync: [0],
    copyFile: [0, 1], copyFileSync: [0, 1], createReadStream: [0], createWriteStream: [0], exists: [0], existsSync: [0], lstat: [0], lstatSync: [0],
    mkdir: [0], mkdirSync: [0], open: [0], openSync: [0], opendir: [0], opendirSync: [0], readFile: [0], readFileSync: [0], readdir: [0], readdirSync: [0],
    readlink: [0], readlinkSync: [0], realpath: [0], realpathSync: [0], rename: [0, 1], renameSync: [0, 1], rm: [0], rmSync: [0], rmdir: [0], rmdirSync: [0], stat: [0], statSync: [0],
    symlink: [0, 1], symlinkSync: [0, 1], truncate: [0], truncateSync: [0], unlink: [0], unlinkSync: [0], utimes: [0], utimesSync: [0],
    writeFile: [0], writeFileSync: [0], cp: [0, 1], cpSync: [0, 1], link: [0, 1], linkSync: [0, 1],
    lchmod: [0], lchmodSync: [0], lchown: [0], lchownSync: [0], lutimes: [0], lutimesSync: [0],
    statfs: [0], statfsSync: [0], watch: [0], watchFile: [0], unwatchFile: [0], mkdtemp: [0], mkdtempSync: [0],
    glob: [0], globSync: [0], openAsBlob: [0],
  };
  const writeOps = new Set(["appendFile", "appendFileSync", "chmod", "chmodSync", "chown", "chownSync", "createWriteStream", "mkdir", "mkdirSync", "rename", "renameSync", "rm", "rmSync", "rmdir", "rmdirSync", "truncate", "truncateSync", "unlink", "unlinkSync", "utimes", "utimesSync", "writeFile", "writeFileSync"]);
  const writeIndex = { copyFile: new Set([1]), copyFileSync: new Set([1]), symlink: new Set([1]), symlinkSync: new Set([1]) };
  for (const name of ["lchmod", "lchown", "lutimes", "cp"]) { writeOps.add(name); writeOps.add(`${name}Sync`); }
  const fdMethods = ["close", "closeSync", "fstat", "fstatSync", "fsync", "fsyncSync", "fdatasync", "fdatasyncSync", "read", "readSync", "readv", "readvSync", "write", "writeSync", "writev", "writevSync", "ftruncate", "ftruncateSync", "fchmod", "fchmodSync", "fchown", "fchownSync", "futimes", "futimesSync"];
  const descriptorWrites = /^(?:write|append|truncate|chmod|chown|utimes|ftruncate|fchmod|fchown|futimes|createWriteStream)/;
  const handleMethods = ["appendFile", "chmod", "chown", "close", "createReadStream", "createWriteStream", "datasync", "read", "readableWebStream", "readFile", "readLines", "readv", "stat", "sync", "truncate", "utimes", "write", "writeFile", "writev"];
  const guardHandle = (handle, file, writes) => {
    const fd = handle.fd;
    fdOwners.set(fd, { file, writes });
    for (const method of handleMethods) {
      const original = handle[method];
      if (typeof original !== "function") continue;
      handle[method] = function (...args) {
        activity++;
        assertDescriptor(fd, descriptorWrites.test(method));
        const result = original.apply(this, args);
        if (result?.then) return trackPromise(result, `FileHandle.${method}`, file).then((value) => { if (method === "close") fdOwners.delete(fd); return value; });
        return result;
      };
    }
    if (Symbol.asyncDispose in handle) handle[Symbol.asyncDispose] = () => handle.close();
    return handle;
  };
  const patch = (object, name, indexes, promises = false) => {
    const original = object?.[name];
    if (typeof original !== "function") return;
    const base = name.replace(/Sync$/, "");
    const guarded = function (...args) {
      activity++;
      if (["link", "symlink", "mkdtemp", "watch", "watchFile", "unwatchFile", "glob", "openAsBlob"].includes(base)) boundaryFailure("outside", `unsupported ${base}`);
      const flags = base === "open" ? args[1] : args[1]?.flags ?? args[1]?.flag;
      const writes = writeOps.has(name) || writesFlags(flags);
      if (["createReadStream", "createWriteStream"].includes(base)) {
        if (args[1]?.fs) boundaryFailure("outside", "custom stream filesystem unsupported");
        if (args[1]?.fd !== undefined) assertDescriptor(typeof args[1].fd === "number" ? args[1].fd : args[1].fd.fd, writes);
      }
      for (const index of indexes) {
        if (typeof args[index] === "number") assertDescriptor(args[index], writes && !["copyFile", "cp"].includes(base));
        else {
          const value = args[index] instanceof URL ? fileURLToPath(args[index]) : Buffer.isBuffer(args[index]) ? args[index].toString() : args[index];
          if (typeof value === "string" && absentPaths.has(path.resolve(value))) {
            if (!/^(?:exists|lstat|stat|realpath)$/.test(base) || writes) boundaryFailure("outside", "ancestor content");
            const error = Object.assign(new Error("synthetic ENOENT"), { code: "ENOENT" });
            if (base === "exists") { if (typeof args.at(-1) === "function") { queueMicrotask(() => args.at(-1)(false)); return; } return false; }
            if (promises) return Promise.reject(error);
            if (typeof args.at(-1) === "function") { queueMicrotask(() => args.at(-1)(error)); return; }
            throw error;
          }
          ownPath(args[index], ["copyFile", "cp"].includes(base) ? index === 1 : writes || writeIndex[name]?.has(index), base);
        }
      }
      const callback = args.at(-1);
      let pendingId;
      if (!promises && !name.endsWith("Sync") && typeof callback === "function") {
        pendingId = pendingStart(name, args[0]);
        args[args.length - 1] = (error, result, ...rest) => {
          pendingFinish(pendingId);
          if (!error && base === "open") fdOwners.set(result, { file: args[0], writes });
          callback(error, result, ...rest);
        };
      }
      let result;
      try { result = original.apply(this, args); }
      catch (error) { if (pendingId !== undefined) pendingFinish(pendingId); throw error; }
      if (name === "openSync") fdOwners.set(result, { file: args[0], writes });
      if (promises && result?.then) return trackPromise(result, name, args[0]).then((value) => base === "open" ? guardHandle(value, args[0], writes) : value);
      return result;
    };
    if (original.native) guarded.native = (...args) => { ownPath(args[0], false, base); return original.native.apply(original, args); };
    object[name] = guarded;
  };
  for (const [name, indexes] of Object.entries(pathOps)) {
    patch(fs, name, indexes);
    if (!name.endsWith("Sync")) patch(fs.promises, name, indexes, true);
  }
  const patchDescriptors = (object) => {
    for (const name of fdMethods) {
      const original = object[name];
      if (typeof original !== "function") continue;
      object[name] = function (fd, ...args) {
        activity++;
        assertDescriptor(fd, descriptorWrites.test(name), /^write/.test(name));
        const callback = args.at(-1);
        let pendingId;
        if (!name.endsWith("Sync") && typeof callback === "function") {
          pendingId = pendingStart(name, fdOwners.get(fd)?.file ?? `fd:${fd}`);
          args[args.length - 1] = (error, ...rest) => { pendingFinish(pendingId); if (!error && name === "close") fdOwners.delete(fd); callback(error, ...rest); };
        }
        let result;
        try { result = original.call(this, fd, ...args); }
        catch (error) { if (pendingId !== undefined) pendingFinish(pendingId); throw error; }
        if (name === "closeSync") fdOwners.delete(fd);
        return result;
      };
    }
  };
  patchDescriptors(fs);
  for (const name of ["ReadStream", "WriteStream"]) {
    const Original = fs[name];
    fs[name] = class extends Original {
      constructor(file, options) {
        if (options?.fs) boundaryFailure("outside", "custom stream filesystem unsupported");
        const writes = name === "WriteStream" || writesFlags(options?.flags);
        if (options?.fd !== undefined) assertDescriptor(typeof options.fd === "number" ? options.fd : options.fd.fd, writes);
        else ownPath(file, writes);
        super(file, options);
      }
    };
  }
  // CJS clone must be created only after standard fs/descriptor guards exist.
  const require = createRequire(path.join(CORE, "package.json"));
  const load = Module._load;
  Module._load = function (request, ...args) {
    if (typeof request === "string" && /(?:keytar|keyring|keychain|credential-storage|wincred)/i.test(request)) boundaryFailure("keyring");
    return load.call(this, request, ...args);
  };
  process.dlopen = () => boundaryFailure("outside", "native addon unsupported");
  const graceful = require("graceful-fs");
  graceful.ReadStream = fs.ReadStream;
  graceful.WriteStream = fs.WriteStream;
  for (const [name, indexes] of Object.entries(pathOps)) {
    patch(graceful, name, indexes);
    if (!name.endsWith("Sync")) patch(graceful.promises, name, indexes, true);
  }
  patchDescriptors(graceful);
  const denyMethods = (object, names, category = "network") => {
    for (const name of names) if (typeof object?.[name] === "function") object[name] = function () { boundaryFailure(category, name); };
  };
  let managedSpawn;
  for (const moduleName of ["net", "tls", "http", "https", "http2", "dns", "dgram", "child_process", "worker_threads"]) {
    const mod = (await import(`node:${moduleName}`)).default;
    const child = ["child_process", "worker_threads"].includes(moduleName);
    if (moduleName === "child_process" && managedChildGrant) {
      const originalSpawn = mod.spawn;
      const prototype = mod.ChildProcess.prototype;
      const originalPrototypeSpawn = prototype.spawn;
      if (!cliGrants.has(managedChildGrant)) throw new Error("CLI_GRANT_NOT_PARENT_ISSUED");
      const grant = managedChildGrant;
      const childArgv = ["--import", pathToFileURL(grant.bootstrap).href, ...grant.argv];
      const envPairs = Object.entries(grant.env).map(([key, value]) => `${key}=${value}`).sort();
      let activeSpawn = false;
      let spawnConsumed = false;
      prototype.spawn = function (options) {
        if (!activeSpawn) boundaryFailure("child", "ChildProcess.prototype.spawn");
        activeSpawn = false; // Consume BEFORE inspecting or entering the native spawn.
        assertPlainData(options);
        assert.equal(options.file, grant.executable);
        assert.equal(options.cwd, grant.cwd);
        assert.deepEqual(options.args, [grant.executable, ...childArgv]);
        assert.deepEqual([...options.envPairs].sort(), envPairs);
        assert.equal(options.windowsHide, false);
        assert.equal(options.windowsVerbatimArguments, false);
        assert.equal(options.detached, false);
        // Public spawn passes the inherit string to ChildProcess.spawn; that method
        // normalizes it to fd 0/1/2, which the real returned handle asserts below.
        assert.equal(options.stdio, "inherit");
        return originalPrototypeSpawn.call(this, options);
      };
      mod.spawn = () => boundaryFailure("child", "unadmitted spawn");
      managedSpawn = Object.freeze({
        spawn(executable, argv, options) {
          if (spawnConsumed || activeSpawn) boundaryFailure("child", "managed child capability consumed");
          // Reject proxies/accessors without invoking them; never pass caller objects to Node.
          assertPlainData(argv);
          assertPlainData(options);
          assert.equal(executable, grant.executable);
          assert.deepEqual(argv, grant.argv);
          assert.deepEqual(options, { cwd: grant.cwd, env: { ...grant.env }, stdio: "inherit", windowsHide: false });
          readCliRecord(grant.recordPath, grant.manifestHash, grant.recordHash);
          const trustedArgv = childArgv.map((value) => String(value));
          const trustedEnv = Object.fromEntries(Object.entries(grant.env).map(([key, value]) => [key, String(value)]));
          const trustedOptions = { cwd: grant.cwd, env: trustedEnv, stdio: "inherit", windowsHide: false };
          spawnConsumed = true;
          activeSpawn = true;
          try { return originalSpawn(grant.executable, trustedArgv, trustedOptions); }
          finally { activeSpawn = false; }
        },
      });
      denyMethods(mod, ["spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"], "child");
      // The prototype wrapper above consumes only the synchronous public-spawn permit.
    } else if (moduleName === "child_process" && scheduledGit) {
      assert.equal(mod.execFileSync, SCHEDULED_EXEC_FILE_SYNC);
      denyMethods(mod, ["spawn", "spawnSync", "exec", "execSync", "execFile", "fork"], "child");
      denyMethods(mod.ChildProcess?.prototype, ["spawn"], "child");
      mod.execFileSync = scheduledGit.guardedExecFileSync;
    } else {
      denyMethods(mod, child ? ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork", "Worker"] : ["connect", "createConnection", "request", "get", "createSocket", "createServer", "createSecureServer"], child ? "child" : "network");
      if (moduleName === "child_process") denyMethods(mod.ChildProcess?.prototype, ["spawn"], "child");
    }
    for (const ctor of ["Socket", "Server", "TLSSocket", "Http2Session", "ClientHttp2Session", "Http2Server"]) denyMethods(mod[ctor]?.prototype, ["connect", "listen", "send", "bind", "request"]);
    if (moduleName === "dns") {
      const names = ["lookup", "lookupService", "resolve", "resolve4", "resolve6", "resolveAny", "resolveCaa", "resolveCname", "resolveMx", "resolveNaptr", "resolveNs", "resolvePtr", "resolveSoa", "resolveSrv", "resolveTlsa", "resolveTxt", "reverse", "setServers"];
      for (const object of [mod, mod.promises, mod.Resolver?.prototype, mod.promises?.Resolver?.prototype]) denyMethods(object, names);
    }
  }
  if (scheduledGit) process.kill = () => boundaryFailure("child", "scheduled PID probe/signal");
  globalThis.fetch = () => boundaryFailure("network", "fetch");
  globalThis.WebSocket = class { constructor() { boundaryFailure("network", "WebSocket"); } };
  syncBuiltinESMExports();
  return {
    counters: denied,
    ...(managedSpawn ? { spawnManagedChild: managedSpawn.spawn } : {}),
    ...(scheduledGit ? { scheduledGit: scheduledGit.broker } : {}),
    async drain() {
      // No native operation may outlive host disposal; guards stay installed until natural exit.
      let prior = activity;
      for (let stable = 0, i = 0; i < 100; i++) {
        await new Promise((resolve) => setTimeout(resolve, 20));
        stable = pendingCount() === 0 && activity === prior ? stable + 1 : 0;
        prior = activity;
        if (stable === 3) return { pending: pendingCount(), descriptors: fdOwners.size };
      }
      const pending = [...pendingOperations.values()].map(({ id, workerId, operation, path: target, role, startedAt, stack }) => ({ id, workerId, operation, path: target, role, lifetimeMs: Date.now() - startedAt, stack }));
      throw new Error(`SMOKE_NATIVE_ASYNC_NOT_DRAINED pending=${pendingCount()} operations=${JSON.stringify(pending)} recent=${JSON.stringify(completedOperations.slice(-12))}`);
    },
  };
}

function cliWorkerEnvironment(profile, registryPath, nonce = RUN_KEY) {
  const env = cleanWorkerEnv(profile.home, profile.id, registryPath);
  env.PI_USERS_SMOKE_RUN_KEY = nonce;
  for (const key of ["PATHEXT", "ComSpec"]) if (typeof process.env[key] === "string") env[key] = process.env[key];
  const drive = path.parse(profile.home).root.slice(0, 2);
  Object.assign(env, {
    HOMEDRIVE: drive,
    HOMEPATH: profile.home.slice(drive.length),
    LOGONSERVER: "\\\\PI-USERS-SMOKE",
    PATH: path.join(profile.agentDir, "bin"),
    SYSTEMDRIVE: drive,
    TEMP: path.join(profile.home, "AppData", "Local", "Temp"),
    USERDOMAIN: "PI-USERS-SMOKE",
    USERNAME: `pi-users-${profile.id}`,
  });
  return env;
}

function cleanWorkerEnv(home, id, registryPath) {
  const env = Object.create(null);
  for (const key of ["SystemRoot", "windir"]) {
    if (typeof process.env[key] === "string") env[key] = process.env[key];
  }
  Object.assign(env, {
    PI_USERS_SMOKE_HOME: home,
    PI_USERS_SMOKE_ID: id,
    PI_USERS_SMOKE_REGISTRY: registryPath,
    PI_USERS_SMOKE_RUN_KEY: RUN_KEY,
    PI_USER_ID: id,
    PI_CODING_AGENT_DIR: path.join(home, ".pi", "agent"),
    HOME: home,
    USERPROFILE: home,
    APPDATA: path.join(home, "AppData", "Roaming"),
    LOCALAPPDATA: path.join(home, "AppData", "Local"),
    XDG_CONFIG_HOME: path.join(home, ".config"),
    XDG_CACHE_HOME: path.join(home, ".cache"),
    TEMP: path.join(home, "Temp"),
    TMP: path.join(home, "Temp"),
    TMPDIR: path.join(home, "Temp"),
  });
  return env;
}

async function worker(root, id, registryPath, runKey, mode, foreignSessionPath, foreignParentHeaderPath, ownedParentHeaderPath, badHeaderCwdPath, phase, aliasFixtures, scheduledRecordHash) {
  RUN_KEY = process.env.PI_USERS_SMOKE_RUN_KEY;
  if (!RUN_KEY || runKey !== RUN_KEY) throw new Error("SMOKE_WORKER_NOT_PARENT_OWNED");
  ROOT = fs.realpathSync.native(root);
  if (ROOT !== path.resolve(root)) throw new Error("SMOKE_RUN_ROOT_ALIAS");
  assert.ok(["account-a", "account-b"].includes(id));
  assert.ok(["text", "json", "rpc", "interactive"].includes(mode));
  assert.ok(["native", "children", "interactive", "cache", "memory", "scheduled"].includes(phase));
  if (phase === "scheduled") assert.equal(mode, "json");
  if (phase === "children") assert.equal(mode, "json", "prepared child prompts run only in the separate native JSON phase");
  if (phase === "interactive") assert.equal(mode, "interactive", "controlled public interactive mode runs only in its own fresh phase");
  assert.equal(process.env.PI_USERS_SMOKE_ID, id);
  assert.equal(process.env.PI_USERS_SMOKE_REGISTRY, registryPath);
  runOwned(registryPath);
  const allowed = new Set(["SystemRoot", "windir", "PI_USERS_SMOKE_HOME", "PI_USERS_SMOKE_ID", "PI_USERS_SMOKE_REGISTRY", "PI_USERS_SMOKE_RUN_KEY", "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "TEMP", "TMP", "TMPDIR"]);
  for (const key of Object.keys(process.env)) if (![...allowed].some((name) => name.toLowerCase() === key.toLowerCase())) delete process.env[key];
  const home = process.env.PI_USERS_SMOKE_HOME;
  assert.equal(home, path.join(ROOT, id, "home"));
  assert.equal(process.cwd(), path.join(ROOT, id, "workspace"));
  assert.equal(process.env.NODE_OPTIONS, undefined);
  assert.equal(process.env.NODE_PATH, undefined);
  assert.equal(process.env.OPENAI_API_KEY, undefined);
  for (const key of ["PI_USERS_SMOKE_HOME", "PI_USERS_SMOKE_ID", "PI_USERS_SMOKE_REGISTRY", "PI_USERS_SMOKE_RUN_KEY"]) delete process.env[key];
  const scheduledGrant = phase === "scheduled" ? readScheduledRecord(id, registryPath, RUN_KEY, scheduledRecordHash) : undefined;
  const guards = await installResourceGuards(id, aliasFixtures, undefined, scheduledGrant);
  let runtime;
  let disposed = false;
  let firstError;
  let drained;
  const timingRestores = [];
  const scheduledNativeDisposals = phase === "scheduled" ? [] : undefined;
  const cacheNativeRefreshes = phase === "cache" ? [] : undefined;
  const memoryNativeRefreshes = phase === "memory" ? [] : undefined;
  let credentialMetrics;
  let publicSdkImportMs;
  let initialCreateUserRuntimeMs;
  const credentialMetricsSummary = () => credentialMetrics && Object.fromEntries(Object.entries(credentialMetrics).map(([kind, metric]) => [kind, {
    calls: metric.calls, completed: metric.completed, errors: metric.errors, pending: metric.pending,
    maxPending: metric.maxPending, summedDurationMs: Number(metric.summedDurationMs.toFixed(3)), errorsByCode: { ...metric.errorsByCode },
  }]));
  try {
  if (scheduledGrant) guards.scheduledGit.init(); // Empty owned workspace, before any SDK/project imports or writes.
  assert.equal(fs.realpathSync.native(os.homedir()), fs.realpathSync.native(home), "selected Windows/POSIX home must be active before SDK import");
  const core = "C:/nvm4w/nodejs/node_modules/@earendil-works/pi-coding-agent/dist/index.js";
  const { resolveUser } = await import("../../scripts/users/registry.mjs");
  const profile = resolveUser({ id, registryPath });
  assert.equal(Object.isFrozen(profile), true);
  for (const field of ["workspaces", "sessionRoots", "sharedAssets", "contexts"]) assert.equal(Object.isFrozen(profile[field]), true);
  const authPath = path.join(profile.agentDir, "auth.json");
  const authBefore = fs.readFileSync(authPath);
  const { installUserEnvironment, getUserHome } = await import("../../scripts/users/environment.mjs");
  installUserEnvironment(profile);
  if (phase === "interactive") {
    process.env.PI_OFFLINE = "1";
    process.env.PI_SKIP_VERSION_CHECK = "1";
    delete process.env.TMUX;
  }
  assert.equal(path.resolve(os.homedir()), path.resolve(home));
  assert.equal(process.env.PI_CODING_AGENT_DIR, profile.agentDir);
  const { createUserEnvironment } = await import("../../scripts/users/environment.mjs");
  const selected = createUserEnvironment(profile);
  assert.equal(selected.USERPROFILE, getUserHome(profile));
  assert.equal(selected.USERPROFILE, home);
  assert.equal(selected.PI_USER_ID, id);
  assert.equal(Object.isFrozen(selected), true);
  const { createUserRuntime, createGuardedSessionRuntimeClass, runUserMode } = await import("../../scripts/users/runtime.mjs");
  assert.ok(fs.statSync(core).isFile());
  assert.equal(JSON.parse(fs.readFileSync(path.resolve(core, "../../package.json"), "utf8")).version, "1.0.1");
  let publicSDK;
  let originalModelRuntimeCreate;
  let observedCreate;
  if (mode === "json") {
    const publicSdkImportStartedAt = performance.now();
    publicSDK = await import(pathToFileURL(core).href);
    publicSdkImportMs = performance.now() - publicSdkImportStartedAt;
    originalModelRuntimeCreate = publicSDK.ModelRuntime.create;
    assert.equal(typeof originalModelRuntimeCreate, "function", "public SDK ModelRuntime.create is available");
    observedCreate = function (options = {}) {
      const originalStore = options.credentials;
      if (!originalStore || typeof originalStore.read !== "function" || typeof originalStore.list !== "function") throw new Error("CREDENTIAL_OBSERVER_PUBLIC_STORE_UNAVAILABLE");
      credentialMetrics = Object.fromEntries(["read", "list"].map((kind) => [kind, { calls: 0, completed: 0, errors: 0, pending: 0, maxPending: 0, summedDurationMs: 0, errorsByCode: Object.create(null) }]));
      const observe = (kind, method) => function (...args) {
        const metric = credentialMetrics[kind];
        metric.calls += 1;
        metric.pending += 1;
        metric.maxPending = Math.max(metric.maxPending, metric.pending);
        const startedAt = performance.now();
        const settled = (failed, error) => {
          metric.completed += 1;
          if (failed) {
            metric.errors += 1;
            const code = typeof error?.code === "string" && /^[A-Z][A-Z0-9_]{0,63}$/.test(error.code) ? error.code : "OTHER";
            metric.errorsByCode[code] = (metric.errorsByCode[code] ?? 0) + 1;
          }
          metric.pending -= 1;
          metric.summedDurationMs += performance.now() - startedAt;
        };
        let result;
        try { result = method.apply(originalStore, args); }
        catch (error) { settled(true, error); throw error; }
        if (result && typeof result.then === "function") result.then(() => settled(false), (error) => settled(true, error));
        else settled(false);
        return result;
      };
      const observedStore = Object.freeze({
        read: observe("read", originalStore.read),
        list: observe("list", originalStore.list),
        modify: originalStore.modify,
        delete: originalStore.delete,
      });
      return originalModelRuntimeCreate.call(this, { ...options, credentials: observedStore });
    };
  }
  const initialResumePath = phase === "children" && id === "account-b" ? ownedParentHeaderPath : undefined;
  const initialResumeBytes = initialResumePath ? fs.readFileSync(runOwned(initialResumePath)) : undefined;
  const createStartedAt = performance.now();
  try {
    if (observedCreate) publicSDK.ModelRuntime.create = observedCreate;
    runtime = await createUserRuntime(profile, { cwd: profile.workspaces[0], ...(initialResumePath ? { initialSessionPath: initialResumePath } : {}) });
  } finally {
    initialCreateUserRuntimeMs = performance.now() - createStartedAt;
    if (originalModelRuntimeCreate) publicSDK.ModelRuntime.create = originalModelRuntimeCreate;
  }
  if (mode === "json") process.stderr.write(`SDK_BOUNDARY publicIndexImportMs=${Number(publicSdkImportMs.toFixed(3))} initialCreateUserRuntimeMs=${Number((initialCreateUserRuntimeMs ?? 0).toFixed(3))} credentials=${JSON.stringify(credentialMetricsSummary() ?? null)} credentialDurations=overlapping-sum-not-wall-clock\n`);
  assert.equal(globalThis[Symbol.for("pi.users.context")].modelRuntime, runtime.modelRuntime);
  if (mode === "json") {
    let timingId = 0;
    for (const [type, method] of [["AgentSession", "abort"], ["AgentSession", "dispose"], ["SettingsManager", "reload"], ["SettingsManager", "flush"], ["DefaultResourceLoader", "reload"], ["ModelRuntime", "refresh"]]) {
      const prototype = runtime.sdk[type].prototype;
      const original = prototype[method];
      assert.equal(typeof original, "function");
      prototype[method] = function (...args) {
        const call = ++timingId;
        const started = Date.now();
        const log = (status) => process.stderr.write(`SDK_TIMING profile=${id} call=${call} method=${type}.${method} status=${status} ms=${Date.now() - started}${type === "ModelRuntime" && method === "refresh" ? ` credentials=${JSON.stringify(credentialMetricsSummary() ?? null)} credentialDurations=overlapping-sum-not-wall-clock` : ""}\n`);
        log("START");
        let result;
        try { result = original.apply(this, args); }
        catch (error) { log("ERROR"); throw error; }
        if (scheduledNativeDisposals && type === "AgentSession" && method === "dispose") scheduledNativeDisposals.push(Object.freeze({ session: this, synchronousReturn: result === undefined, completion: Promise.resolve(result) }));
        if ((cacheNativeRefreshes || memoryNativeRefreshes) && type === "ModelRuntime" && method === "refresh" && this === runtime.modelRuntime) {
          const captured = Object.freeze({ modelRuntime: this, options: args[0], completion: result });
          cacheNativeRefreshes?.push(captured);
          memoryNativeRefreshes?.push(captured);
        }
        if (result?.then) result.then(() => log("RETURN"), () => log("ERROR"));
        else log("RETURN");
        return result;
      };
      timingRestores.push(() => { prototype[method] = original; });
    }
  }
  assert.equal(runtime.sessionManager.getCwd(), profile.workspaces[0], "genuine initial create/resume selected the issued profile workspace");
  assert.ok(path.resolve(runtime.session.sessionFile).startsWith(path.resolve(profile.sessionRoots[0]) + path.sep), "genuine initial create/resume selected the issued profile session root");
  assert.equal(runtime.modelRuntime, runtime.receipt.modelRuntime, "initial native session uses the immutable receipt ModelRuntime");
  if (initialResumePath) {
    assert.equal(path.resolve(runtime.session.sessionFile), path.resolve(initialResumePath), "genuine SDK startup resumed the existing selected-profile session");
    const resumedBytes = fs.readFileSync(runOwned(initialResumePath));
    assert.deepEqual(resumedBytes.subarray(0, initialResumeBytes.length), initialResumeBytes, "initial resume preserves every existing fixture byte");
    // SDK 1.0.1 initializes model/thinking metadata for a header-only session.
    const appended = resumedBytes.subarray(initialResumeBytes.length).toString("utf8").trim().split("\n").map((line) => JSON.parse(line));
    assert.deepEqual(appended.map((entry) => entry.type), ["model_change", "thinking_level_change"], "startup appends only native initialization metadata");
    assert.equal(appended[0].provider, runtime.session.model.provider);
    assert.equal(appended[0].modelId, runtime.session.model.id);
    assert.equal(appended[1].thinkingLevel, runtime.session.thinkingLevel);
    process.stderr.write(`INITIAL_RESUME profile=${id} sessionOwned=true cwdOwned=true modelRuntimeIdentity=true existingBytesPreserved=true nativeMetadataAppended=2\n`);
  } else process.stderr.write(`INITIAL_CREATE profile=${id} sessionOwned=true cwdOwned=true modelRuntimeIdentity=true\n`);
  if (id === "account-b" && mode === "json" && phase !== "scheduled") {
    const counters = { nativeConstructor: 0, replacementFactory: 0, switchSession: 0, importFromJsonl: 0, newSession: 0, fork: 0, sessionOpen: 0, sessionCreate: 0, sessionBranch: 0, copyFile: 0 };
    let foreignIO = 0;
    const foreignRoot = path.dirname(foreignSessionPath);
    const restore = [];
    const wrap = (object, key, counter) => {
      const original = object[key];
      object[key] = function (...args) { counters[counter] += 1; return original.apply(this, args); };
      restore.push(() => { object[key] = original; });
    };
    for (const name of ["switchSession", "importFromJsonl", "newSession", "fork"]) wrap(runtime.sdk.AgentSessionRuntime.prototype, name, name);
    const trackForeign = (object, key) => {
      const original = object[key];
      object[key] = function (value, ...args) {
        if (typeof value === "string") {
          const resolved = path.resolve(value);
          const relative = path.relative(foreignRoot, resolved);
          if (relative === "" || relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) foreignIO += 1;
        }
        return original.call(this, value, ...args);
      };
      restore.push(() => { object[key] = original; });
    };
    for (const name of ["lstatSync", "statSync", "existsSync", "openSync", "readFileSync"]) trackForeign(fs, name);
    const realpathOriginal = fs.realpathSync.native;
    fs.realpathSync.native = function (value, ...args) {
      if (typeof value === "string") {
        const relative = path.relative(foreignRoot, path.resolve(value));
        if (relative === "" || relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) foreignIO += 1;
      }
      return realpathOriginal.call(this, value, ...args);
    };
    restore.push(() => { fs.realpathSync.native = realpathOriginal; });
    for (const name of ["open", "create"]) wrap(runtime.sdk.SessionManager, name, name === "open" ? "sessionOpen" : "sessionCreate");
    wrap(runtime.sdk.SessionManager.prototype, "createBranchedSession", "sessionBranch");
    const originalCopy = fs.copyFileSync;
    fs.copyFileSync = function (...args) { counters.copyFile += 1; return originalCopy.apply(this, args); };
    restore.push(() => { fs.copyFileSync = originalCopy; syncBuiltinESMExports(); });
    syncBuiltinESMExports();
    const assertNoNativeEffects = async (label, operation, code) => {
      const before = { ...counters };
      const deniedBefore = { ...guards.counters };
      const foreignIOBefore = foreignIO;
      const currentSession = runtime.session;
      const currentManager = runtime.sessionManager;
      const currentPath = currentSession.sessionFile;
      const currentExists = fs.existsSync(runOwned(currentPath));
      const currentBytes = currentExists ? fs.readFileSync(runOwned(currentPath)) : null;
      await assert.rejects(async () => operation(), (error) => error.code === code && error instanceof Error);
      assert.deepEqual(counters, before, `${label}: SDK native entry/open/create/branch/copy counters stayed unchanged`);
      assert.deepEqual(guards.counters, deniedBefore, `${label}: no guarded content I/O or forbidden resource operation was attempted`);
      assert.equal(foreignIO, foreignIOBefore, `${label}: no foreign session path was probed or read`);
      assert.equal(runtime.session, currentSession, `${label}: current session identity unchanged`);
      assert.equal(runtime.sessionManager, currentManager, `${label}: current manager identity unchanged`);
      assert.equal(fs.existsSync(runOwned(currentPath)), currentExists, `${label}: current session file presence unchanged`);
      if (currentExists) assert.deepEqual(fs.readFileSync(runOwned(currentPath)), currentBytes, `${label}: current session bytes unchanged`);
    };
    try {
      runtime.session.sessionManager.appendMessage({ role: "user", content: [{ type: "text", text: "session-origin guard fixture" }], timestamp: Date.now() });
      for (const fixture of aliasFixtures) {
        await assertNoNativeEffects(`${fixture.kind} alias switch`, () => runtime.host.switchSession(fixture.aliasPath, { cwdOverride: profile.workspaces[0] }), "SESSION_ALIAS");
        await assertNoNativeEffects(`${fixture.kind} alias import`, () => runtime.host.importFromJsonl(fixture.aliasPath, profile.workspaces[0]), "SESSION_ALIAS");
        await assertNoNativeEffects(`${fixture.kind} alias parent`, () => runtime.host.newSession({ parentSession: fixture.aliasPath }), "SESSION_ALIAS");
      }
      process.stderr.write(`SESSION_ALIAS_DENIALS PASS ${JSON.stringify(aliasFixtures.map(({ kind }) => kind))} metadataOnly=true contentIO=0\n`);
      await assertNoNativeEffects("initial foreign resume", () => createUserRuntime(profile, { cwd: profile.workspaces[0], initialSessionPath: foreignSessionPath }), "SESSION_NOT_OWNED");
      await assertNoNativeEffects("initial owned resume with foreign parent reference", () => createUserRuntime(profile, { cwd: profile.workspaces[0], initialSessionPath: foreignParentHeaderPath }), "SESSION_NOT_OWNED");
      await assertNoNativeEffects("initial owned session with foreign header cwd", () => createUserRuntime(profile, { cwd: profile.workspaces[0], initialSessionPath: badHeaderCwdPath }), "SESSION_HEADER_CWD_UNOWNED");
      await assertNoNativeEffects("switch owned source with foreign header cwd despite owned override", () => runtime.host.switchSession(badHeaderCwdPath, { cwdOverride: profile.workspaces[0] }), "SESSION_HEADER_CWD_UNOWNED");
      await assertNoNativeEffects("import owned source with foreign header cwd before copy", () => runtime.host.importFromJsonl(badHeaderCwdPath, profile.workspaces[0]), "SESSION_HEADER_CWD_UNOWNED");
      await assertNoNativeEffects("switch foreign source", () => runtime.host.switchSession(foreignSessionPath, { cwdOverride: profile.workspaces[0] }), "SESSION_NOT_OWNED");
      await assertNoNativeEffects("import foreign source before selected destination copy", () => runtime.host.importFromJsonl(foreignSessionPath, profile.workspaces[0]), "SESSION_NOT_OWNED");
      await assertNoNativeEffects("newSession foreign parent option", () => runtime.host.newSession({ parentSession: foreignSessionPath }), "SESSION_NOT_OWNED");
      await assertNoNativeEffects("newSession ambiguous relative parent option", () => runtime.host.newSession({ parentSession: "relative-parent.jsonl" }), "SESSION_INVALID");
      await assertNoNativeEffects("receipt session resource foreign parent", () => runtime.receipt.admitUserResources({ resource: "pi-session-new", cwd: profile.workspaces[0], sessionDir: profile.sessionRoots[0], parentSession: foreignSessionPath }), "SESSION_NOT_OWNED");
      await assertNoNativeEffects("receipt direct session foreign source", () => runtime.receipt.assertOwnedSession({ sessionPath: foreignSessionPath, cwd: profile.workspaces[0] }), "SESSION_NOT_OWNED");
      await assertNoNativeEffects("owned header with foreign parent on switch", () => runtime.host.switchSession(foreignParentHeaderPath, { cwdOverride: profile.workspaces[0] }), "SESSION_NOT_OWNED");
      await assertNoNativeEffects("owned header with foreign parent on import", () => runtime.host.importFromJsonl(foreignParentHeaderPath, profile.workspaces[0]), "SESSION_NOT_OWNED");
      const currentPath = runtime.session.sessionFile;
      const currentBytes = fs.readFileSync(runOwned(currentPath));
      const lines = currentBytes.toString("utf8").split("\n");
      const currentHeader = JSON.parse(lines[0]);
      currentHeader.parentSession = foreignSessionPath;
      fs.writeFileSync(runOwned(currentPath), `${JSON.stringify(currentHeader)}\n${lines.slice(1).join("\n")}`);
      const badCurrentBytes = fs.readFileSync(runOwned(currentPath));
      class ObservedNativeRuntime extends runtime.sdk.AgentSessionRuntime {
        constructor(...args) { counters.nativeConstructor += 1; super(...args); }
      }
      let suppliedPolicyCalls = 0;
      const GuardedConstructor = createGuardedSessionRuntimeClass(ObservedNativeRuntime, () => { suppliedPolicyCalls += 1; });
      await assertNoNativeEffects("constructor cannot accept a caller-supplied origin bypass", () => new GuardedConstructor(
        profile, runtime.session, runtime.services,
        () => { counters.replacementFactory += 1; throw new Error("unexpected replacement factory"); },
      ), "SESSION_NOT_OWNED");
      assert.equal(suppliedPolicyCalls, 0, "constructor derives its policy from the issued profile, never a supplied callback");
      await assertNoNativeEffects("fork current source with foreign parent", () => runtime.host.fork("synthetic-no-entry", { position: "at" }), "SESSION_NOT_OWNED");
      await assertNoNativeEffects("newSession current source with foreign parent", () => runtime.host.newSession(), "SESSION_NOT_OWNED");
      assert.deepEqual(fs.readFileSync(runOwned(currentPath)), badCurrentBytes, "rejected parent guards did not change the current session file");
      fs.writeFileSync(runOwned(currentPath), currentBytes);
      const badCwdHeader = { ...JSON.parse(lines[0]), cwd: path.join(ROOT, "account-a", "workspace") };
      fs.writeFileSync(runOwned(currentPath), `${JSON.stringify(badCwdHeader)}\n${lines.slice(1).join("\n")}`);
      const badCwdBytes = fs.readFileSync(runOwned(currentPath));
      await assertNoNativeEffects("constructor rejects foreign header cwd before native construction", () => new GuardedConstructor(
        profile, runtime.session, runtime.services,
        () => { counters.replacementFactory += 1; throw new Error("unexpected replacement factory"); },
      ), "SESSION_HEADER_CWD_UNOWNED");
      assert.equal(suppliedPolicyCalls, 0, "header cwd cannot be bypassed by a supplied callback");
      await assertNoNativeEffects("fork current source with foreign header cwd", () => runtime.host.fork("synthetic-no-entry", { position: "at" }), "SESSION_HEADER_CWD_UNOWNED");
      await assertNoNativeEffects("newSession current source with foreign header cwd", () => runtime.host.newSession(), "SESSION_HEADER_CWD_UNOWNED");
      assert.deepEqual(fs.readFileSync(runOwned(currentPath)), badCwdBytes, "rejected cwd guards did not change the current session file");
      fs.writeFileSync(runOwned(currentPath), currentBytes);
      const ownResult = runtime.receipt.assertOwnedSession({ sessionPath: ownedParentHeaderPath, cwd: profile.workspaces[0] });
      assert.equal(ownResult.parentSession, path.join(profile.sessionRoots[0], "synthetic-owned-parent-session.jsonl"), "owned header exposes its optional parentSession metadata");
      for (const [name, metadata] of [["absent", undefined], ["null", null], ["empty", ""]]) {
        const optionalPath = path.join(profile.sessionRoots[0], `synthetic-parent-${name}.jsonl`);
        const header = { type: "session", version: 3, id: `synthetic-${name}`, timestamp: new Date().toISOString(), cwd: profile.workspaces[0] };
        if (metadata !== undefined) header.parentSession = metadata;
        fs.writeFileSync(runOwned(optionalPath), `${JSON.stringify(header)}\n`, { flag: "wx" });
        assert.equal(runtime.receipt.assertOwnedSession({ sessionPath: optionalPath, cwd: profile.workspaces[0] }).parentSession, undefined, `${name} parent metadata means no parent`);
      }
      assert.equal(foreignIO, 0, "all foreign origin/parent cases rejected before foreign-path filesystem access");
      process.stderr.write(`SESSION_ORIGIN_DENIALS PASS ${JSON.stringify({ counters, foreignIO })}\n`);
    } finally { for (const undo of restore.reverse()) undo(); }
  }
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, Symbol.for("pi.users.context"));
  assert.equal(descriptor.writable, false);
  assert.equal(descriptor.configurable, false);
  assert.equal(descriptor.get, undefined);
  assert.equal(Object.isFrozen(runtime.receipt), true);
  assert.equal(runtime.modelRuntime, runtime.services.modelRuntime);
  assert.equal(runtime.settingsManager, runtime.services.settingsManager);
  assert.equal(runtime.receipt.profile, profile);
  assert.ok(runtime.settingsManager instanceof runtime.sdk.SettingsManager);
  assert.ok(runtime.services.resourceLoader instanceof runtime.sdk.DefaultResourceLoader);
  assert.equal(runtime.session.resourceLoader, runtime.services.resourceLoader);
  assert.ok(runtime.modelRuntime.getModels().length > 0, "verified public static builtin catalog remains available");
  const catalogIds = runtime.modelRuntime.getProviders().map(({ id }) => id).sort();
  const originalCatalogModels = structuredClone(runtime.modelRuntime.getModels());
  const originalCatalogModelIds = originalCatalogModels.map(({ provider: providerId, id: modelId }) => `${providerId}/${modelId}`).sort();

  if (phase === "cache") {
    const cacheProviderId = "pi-users-smoke-catalog-cache";
    const modelsStorePath = path.join(profile.agentDir, "cache", "models.json");
    const readOwnModelsStore = () => fs.existsSync(modelsStorePath) ? JSON.parse(fs.readFileSync(modelsStorePath, "utf8")) : {};
    const initialStore = readOwnModelsStore();
    assert.ok(initialStore && typeof initialStore === "object" && !Array.isArray(initialStore), "selected private catalog store parses as an object");
    assert.equal(Object.hasOwn(initialStore, cacheProviderId), false, "selected private store starts without this synthetic provider entry");
    const cacheModel = { ...runtime.modelRuntime.getModels("openai")[0], id: `synthetic-catalog-${id}`, name: `Synthetic catalog cache ${id}`, provider: cacheProviderId };
    const cacheEntry = { models: [cacheModel] };
    const storedCacheEntry = JSON.parse(JSON.stringify(cacheEntry));
    let fixtureModels = [];
    let persistAttempts = 0;
    let persistedPublications = 0;
    let restoredPublications = 0;
    const cacheProvider = {
      id: cacheProviderId,
      name: "Test-only offline synthetic catalog provider",
      auth: { apiKey: { name: "Test-only keyless catalog auth", resolve: async () => ({ auth: {}, source: "synthetic-catalog-cache-test" }) } },
      getModels: () => fixtureModels,
      stream: () => { throw new Error("synthetic catalog cache fixture must not dispatch a model request"); },
      streamSimple: () => { throw new Error("synthetic catalog cache fixture must not dispatch a model request"); },
      refreshModels: async ({ stored, publish, allowNetwork }) => {
        assert.equal(allowNetwork, false, "catalog cache fixture is always refreshed offline");
        if (stored) {
          const restored = stored.models.filter((model) => model.provider === cacheProviderId);
          if (await publish({ update: () => { fixtureModels = restored; } })) restoredPublications += 1;
          return;
        }
        persistAttempts += 1;
        if (await publish({ persist: cacheEntry, update: () => { fixtureModels = [cacheModel]; } })) persistedPublications += 1;
      },
    };
    runtime.modelRuntime.registerNativeProvider(cacheProvider);
    assert.equal(runtime.modelRuntime.getRegisteredNativeProvider(cacheProviderId), cacheProvider);
    const assertRefreshSucceeded = async (label) => {
      const result = await runtime.modelRuntime.refresh({ allowNetwork: false, providers: [cacheProviderId] });
      assert.equal(result.aborted, false, `${label}: explicit public offline refresh completed`);
      assert.equal(result.errors.has(cacheProviderId), false, `${label}: public offline refresh has no provider error`);
    };
    await assertRefreshSucceeded("cold catalog cache");
    assert.ok(persistAttempts > 0, "cold native refresh submitted its synthetic catalog through public publish(persist)");
    assert.ok(persistedPublications > 0 || Object.hasOwn(readOwnModelsStore(), cacheProviderId), "superseded cold publication either completed or is proven by the locked store entry");
    assert.deepEqual(readOwnModelsStore()[cacheProviderId], storedCacheEntry, "selected profile's locked models store contains exactly its synthetic provider entry");
    assert.deepEqual(fixtureModels, [cacheModel], "cold publication updated the provider's in-memory catalog");
    const restoresBeforeWarmRefresh = restoredPublications;
    fixtureModels = [];
    await assertRefreshSucceeded("warm catalog cache");
    assert.ok(restoredPublications > restoresBeforeWarmRefresh, "warm public refresh restored the stored provider entry through publish(update)");
    assert.deepEqual(fixtureModels, storedCacheEntry.models, "warm refresh repopulated the empty provider catalog from stored data");
    assert.deepEqual(readOwnModelsStore()[cacheProviderId], storedCacheEntry, "warm restoration leaves the selected provider entry unchanged");
    assert.deepEqual(runtime.modelRuntime.getProviders().map(({ id: providerId }) => providerId).filter((providerId) => providerId !== cacheProviderId).sort(), catalogIds, "cache fixture registration preserves all builtin provider IDs");
    assert.deepEqual(runtime.modelRuntime.getModels().filter(({ provider: providerId }) => providerId !== cacheProviderId).map(({ provider: providerId, id: modelId }) => `${providerId}/${modelId}`).sort(), originalCatalogModelIds, "cache fixture registration preserves all builtin model IDs");
    assert.deepEqual(structuredClone(runtime.modelRuntime.getModels().filter(({ provider: providerId }) => providerId !== cacheProviderId)), originalCatalogModels, "cache fixture registration preserves every builtin model definition");
    assert.deepEqual(fs.readFileSync(authPath), authBefore, "offline catalog cache refresh preserves raw owner authentication bytes");
    const cacheSidecars = fs.readdirSync(path.dirname(modelsStorePath)).filter((name) => /^models\.json\.(?:lock|tmp)(?:$|[.-])/.test(name));
    assert.deepEqual(cacheSidecars, [], "SDK store refresh leaves no cache lock or temporary file");
    const refreshesBeforeRemoval = cacheNativeRefreshes.length;
    runtime.modelRuntime.unregisterProvider(cacheProviderId);
    const removalRefreshes = cacheNativeRefreshes.slice(refreshesBeforeRemoval);
    assert.equal(removalRefreshes.length, 1, "public unregister schedules exactly one selected native refresh");
    const [removalRefresh] = removalRefreshes;
    assert.equal(removalRefresh.modelRuntime, runtime.modelRuntime);
    assert.deepEqual(removalRefresh.options, { allowNetwork: false }, "provider removal retains the native full offline refresh");
    assert.equal(typeof removalRefresh.completion?.then, "function", "capture the original native refresh Promise, not a substitute");
    const removalResult = await removalRefresh.completion;
    assert.equal(removalResult.aborted, false, "the actual provider-removal refresh completes before host disposal");
    process.stderr.write(`NATIVE_CATALOG_CACHE_REFRESH profile=${id} operation=unregister native=true runtimeIdentity=true offline=true awaited=true aborted=false\n`);
    assert.equal(runtime.modelRuntime.getRegisteredNativeProvider(cacheProviderId), undefined, "public provider removal unregisters the test-only fixture");
    assert.deepEqual(runtime.modelRuntime.getProviders().map(({ id: providerId }) => providerId).sort(), catalogIds, "public provider removal restores the original provider catalog");
    assert.deepEqual(runtime.modelRuntime.getModels().map(({ provider: providerId, id: modelId }) => `${providerId}/${modelId}`).sort(), originalCatalogModelIds, "public provider removal restores the original model catalog");
    assert.deepEqual(structuredClone(runtime.modelRuntime.getModels()), originalCatalogModels, "public provider removal restores every original builtin model definition");
    assert.deepEqual(readOwnModelsStore()[cacheProviderId], storedCacheEntry, "provider removal does not delete or truncate persisted catalog data");
    assert.deepEqual(fs.readFileSync(authPath), authBefore, "provider removal preserves raw owner authentication bytes");
    process.stderr.write(`NATIVE_CATALOG_CACHE profile=${id} cold=persisted warm=restored offline=true owner=${id} store=private entry=provider-only\n`);
    const selectedRuntime = runtime.modelRuntime;
    const selectedSettings = runtime.settingsManager;
    const selectedSession = runtime.session;
    await runtime.host.dispose();
    disposed = true;
    await runtime.settingsManager.flush();
    drained = await guards.drain();
    assert.equal(runtime.modelRuntime, selectedRuntime);
    assert.equal(runtime.receipt.modelRuntime, selectedRuntime);
    assert.equal(runtime.services.modelRuntime, selectedRuntime);
    assert.equal(runtime.settingsManager, selectedSettings);
    assert.equal(runtime.host.services, runtime.services);
    assert.equal(runtime.host.profile, profile);
    assert.equal(runtime.session, selectedSession);
    assert.deepEqual(fs.readFileSync(authPath), authBefore, "cache-phase finalization preserves raw owner authentication bytes");
    assert.deepEqual(readOwnModelsStore()[cacheProviderId], storedCacheEntry, "cache-phase finalization preserves the exact native-published owner entry");
    assert.deepEqual(fs.readdirSync(path.dirname(modelsStorePath)).filter((name) => /^models\.json\.(?:lock|tmp)(?:$|[.-])/.test(name)), [], "cache-phase finalization leaves no native store sidecars");
    assert.equal(globalThis.__usersSyntheticDispatches, 0, "offline catalog refresh must not dispatch a model request");
    assert.deepEqual(globalThis.__usersSyntheticTokens, [], "catalog cache proof has no model-dispatch credentials");
    assert.deepEqual(runtime.modelRuntime.getProviders().map(({ id: providerId }) => providerId).sort(), catalogIds, "cache-phase disposal preserves the builtin provider catalog");
    assert.deepEqual(structuredClone(runtime.modelRuntime.getModels()), originalCatalogModels, "cache-phase disposal preserves every builtin model definition");
    assert.deepEqual(guards.counters, { protected: 0, network: 0, child: 0, outside: 0, keyring: 0 });
    assert.equal(drained.pending, 0);
    assert.equal(drained.descriptors, 0);
    process.stderr.write(`CACHE_PHASE_DISPOSAL profile=${id} hostDisposed=true settingsFlushed=true identities=true builtinCatalog=true rawAuthPreserved=true selectedEntryPreserved=true sdkDispatches=0 drained=${JSON.stringify(drained)} counters=${JSON.stringify(guards.counters)}\n`);
    return;
  }

  const selectedModel = runtime.modelRuntime.getModels("openai")[0];
  assert.ok(selectedModel, "builtin catalog supplies the selected test model");
  await runtime.session.setModel(selectedModel);
  const provider = runtime.modelRuntime.getProvider("openai");
  assert.equal(typeof globalThis.__usersSyntheticStream, "function", `synthetic extension must load before dispatch: ${JSON.stringify(runtime.services.resourceLoader.getExtensions().errors)}`);
  assert.equal(provider.streamSimple, globalThis.__usersSyntheticStream, "actual session streamSimple hook must be synthetic before dispatch");
  assert.equal(provider.stream, globalThis.__usersSyntheticStream);
  if (phase === "scheduled") {
    const catalogModelIds = runtime.modelRuntime.getModels().map(({ provider: providerId, id: modelId }) => `${providerId}/${modelId}`).sort();
    const staged = path.join(ROOT, "common-code", "subagents-staging", `pi-subagents-${PACKAGE_VERSION}-users`);
    const codeManifestPath = path.join(ROOT, "common-code", "scheduled-code.json");
    const manifestBytes = fs.readFileSync(codeManifestPath);
    assert.equal(cliDigest(manifestBytes), scheduledGrant.codeManifestHash);
    const codeManifest = sealCliData(JSON.parse(manifestBytes));
    for (const [relative, hash] of Object.entries(codeManifest)) {
      const file = runOwned(path.join(ROOT, "common-code", relative));
      assert.equal(cliDigest(fs.readFileSync(file)), hash, `staged scheduled CODE identity: ${relative}`);
    }
    assert.equal(JSON.parse(fs.readFileSync(path.join(staged, "package.json"), "utf8")).name, PACKAGE_NAME);
    const { createJiti } = await import(pathToFileURL("C:/nvm4w/nodejs/node_modules/@earendil-works/pi-coding-agent/node_modules/jiti/lib/jiti.mjs").href);
    const aliases = { "@earendil-works/pi-coding-agent": core, croner: path.join(staged, "scheduled-deps/croner/croner.js"), nanoid: path.join(staged, "scheduled-deps/nanoid/index.js") };
    for (const name of ["agent-types.js", "child-context.js", "context.js", "default-agents.js", "env.js", "memory.js", "nested-tools.js", "prompts.js", "skill-loader.js"]) aliases[`./${name}`] = path.join(ROOT, "common-code", "runner-fixtures", name);
    const jiti = createJiti(import.meta.url, { fsCache: false, alias: aliases });
    const { AgentManager } = await jiti.import(path.join(staged, "src/agent-manager.ts"));
    const { SubagentScheduler } = await jiti.import(path.join(staged, "src/schedule.ts"));
    const { ScheduleStore, resolveStorePath } = await jiti.import(path.join(staged, "src/schedule-store.ts"));
    const worktree = await jiti.import(path.join(staged, "src/worktree.ts"));
    worktree.setWorktreeIsolationEnabled(false); // Original public switch; job also explicitly requests off.
    assert.equal(worktree.isWorktreeIsolationEnabled(), false);
    const modelRegistry = new runtime.sdk.ModelRegistry(runtime.receipt.modelRuntime);
    assert.equal(modelRegistry.runtime, runtime.receipt.modelRuntime);
    assert.equal(modelRegistry.find("openai", selectedModel.id), selectedModel);
    assert.ok(modelRegistry.getAvailable().some((model) => model.provider === "openai" && model.id === selectedModel.id));
    const ctx = { cwd: profile.workspaces[0], model: selectedModel, modelRegistry, getSystemPrompt: () => runtime.session.systemPrompt, sessionManager: runtime.sessionManager };
    const scheduleWorkspace = runtime.receipt.assertOwnedWorkspace(ctx.cwd);
    const scheduleRoot = scheduleWorkspace.workspaceRoot;
    const schedulePath = (sessionId) => path.join(scheduleRoot, ".pi", "subagent-schedules", `${sessionId}.json`);
    const scheduleDir = path.join(scheduleRoot, ".pi", "subagent-schedules");
    const scheduleStateBefore = [path.join(scheduleRoot, ".pi"), scheduleDir, schedulePath(runtime.sessionManager.getSessionId())].map((entry) => fs.existsSync(entry));
    const scheduleAdmissions = [];
    const admitSchedule = (label, request) => { runtime.receipt.admitUserResources(request); scheduleAdmissions.push(label); };
    const expectScheduleRejection = (label, request, code) => {
      assert.throws(() => runtime.receipt.admitUserResources(request), (error) => error.code === code, label);
      scheduleAdmissions.push(label);
    };
    const nativeSessionId = runtime.sessionManager.getSessionId();
    admitSchedule("native-session-id", { resource: "pi-subagents-schedules", userId: profile.id, cwd: ctx.cwd, root: scheduleRoot, sessionId: nativeSessionId, path: schedulePath(nativeSessionId) });
    admitSchedule("legacy-session-id", { resource: "pi-subagents-schedules", userId: profile.id, cwd: ctx.cwd, root: scheduleRoot, sessionId: "session-1", path: schedulePath("session-1") });
    admitSchedule("index-shape-derived-id", { resource: "pi-subagents-schedules", userId: profile.id, cwd: ctx.cwd, root: scheduleRoot, path: schedulePath("session-1") });
    expectScheduleRejection("wrong-user", { resource: "pi-subagents-schedules", userId: "account-not-selected", cwd: ctx.cwd, root: scheduleRoot, sessionId: nativeSessionId, path: schedulePath(nativeSessionId) }, "USER_RESOURCE_PROFILE_MISMATCH");
    expectScheduleRejection("wrong-root", { resource: "pi-subagents-schedules", userId: profile.id, cwd: ctx.cwd, root: profile.agentDir, sessionId: nativeSessionId, path: schedulePath(nativeSessionId) }, "USER_SCHEDULE_ROOT_MISMATCH");
    const foreignWorkspace = path.join(ROOT, id === "account-a" ? "account-b" : "account-a", "workspace");
    expectScheduleRejection("foreign-workspace", { resource: "pi-subagents-schedules", userId: profile.id, cwd: foreignWorkspace, root: foreignWorkspace, sessionId: nativeSessionId, path: path.join(foreignWorkspace, ".pi", "subagent-schedules", `${nativeSessionId}.json`) }, "WORKSPACE_NOT_OWNED");
    expectScheduleRejection("path-traversal", { resource: "pi-subagents-schedules", userId: profile.id, cwd: ctx.cwd, root: scheduleRoot, sessionId: nativeSessionId, path: path.join(scheduleDir, "..", `${nativeSessionId}.json`) }, "USER_SCHEDULE_PATH_MISMATCH");
    expectScheduleRejection("path-separator", { resource: "pi-subagents-schedules", userId: profile.id, cwd: ctx.cwd, root: scheduleRoot, sessionId: nativeSessionId, path: path.join(scheduleDir, "nested", `${nativeSessionId}.json`) }, "USER_SCHEDULE_PATH_MISMATCH");
    expectScheduleRejection("path-nul", { resource: "pi-subagents-schedules", userId: profile.id, cwd: ctx.cwd, root: scheduleRoot, sessionId: nativeSessionId, path: `${schedulePath(nativeSessionId)}\0` }, "USER_SCHEDULE_PATH_INVALID");
    expectScheduleRejection("relative-path", { resource: "pi-subagents-schedules", userId: profile.id, cwd: ctx.cwd, root: scheduleRoot, sessionId: nativeSessionId, path: "relative-schedule.json" }, "USER_SCHEDULE_PATH_INVALID");
    expectScheduleRejection("invalid-path-type", { resource: "pi-subagents-schedules", userId: profile.id, cwd: ctx.cwd, root: scheduleRoot, sessionId: nativeSessionId, path: 42 }, "USER_SCHEDULE_PATH_INVALID");
    expectScheduleRejection("invalid-session-id", { resource: "pi-subagents-schedules", userId: profile.id, cwd: ctx.cwd, root: scheduleRoot, sessionId: "bad/id", path: schedulePath(nativeSessionId) }, "USER_SCHEDULE_SESSION_ID_INVALID");
    expectScheduleRejection("mismatched-session-id", { resource: "pi-subagents-schedules", userId: profile.id, cwd: ctx.cwd, root: scheduleRoot, sessionId: "session-1", path: schedulePath(nativeSessionId) }, "USER_SCHEDULE_SESSION_ID_INVALID");
    const foreignSchedulePath = path.join(foreignWorkspace, ".pi", "subagent-schedules", `${nativeSessionId}.json`);
    expectScheduleRejection("explicit-branch-session-path-bypass", { resource: "pi-subagents-schedules", userId: profile.id, cwd: ctx.cwd, root: scheduleRoot, sessionId: nativeSessionId, path: foreignSchedulePath, sessionPath: runtime.session.sessionFile }, "USER_SCHEDULE_PATH_MISMATCH");
    expectScheduleRejection("unsupported-resource", { resource: "pi-subagents-unknown", userId: profile.id }, "USER_RESOURCE_REQUEST_UNSUPPORTED");
    // Real receipt coverage: shared CODE never grants workspace ownership.
    const subRequests = [
      { resource: "pi-subagents-global-config", root: profile.agentDir },
      { resource: "pi-subagents-agents", root: path.join(profile.sharedAssets[0], "agents") },
      ...[
        path.join(profile.agentDir, "agent-memory", "Agent_1.test"),
        path.join(ctx.cwd, ".pi", "agent-memory", "Agent_1.test"),
        path.join(ctx.cwd, ".pi", "agent-memory-local", "Agent_1.test"),
      ].map((root) => ({ resource: "pi-subagents-memory", cwd: ctx.cwd, root })),
      { resource: "pi-subagents-transcript", cwd: ctx.cwd, root: path.join(scheduleRoot, ".pi", "subagent-output"), sessionId: nativeSessionId },
    ];
    for (const [index, request] of subRequests.entries()) {
      const admitted = runtime.receipt.admitUserResources({ ...request, userId: profile.id });
      assert.equal(request.cwd ? admitted.cwd : admitted, request.cwd ? scheduleWorkspace.cwd : profile);
      expectScheduleRejection(`sub-${index}-wrong-user`, { ...request, userId: "account-not-selected" }, "USER_RESOURCE_PROFILE_MISMATCH");
      expectScheduleRejection(`sub-${index}-wrong-root`, { ...request, root: path.join(foreignWorkspace, "wrong-root") }, "USER_RESOURCE_ROOT_MISMATCH");
      expectScheduleRejection(`sub-${index}-nested-root`, { ...request, root: path.join(request.root, "nested") }, "USER_RESOURCE_ROOT_MISMATCH");
      if (request.cwd) {
        expectScheduleRejection(`sub-${index}-foreign-workspace`, { ...request, cwd: foreignWorkspace }, "WORKSPACE_NOT_OWNED");
        expectScheduleRejection(`sub-${index}-shared-code-not-workspace`, { ...request, cwd: profile.sharedAssets[0] }, "WORKSPACE_NOT_OWNED");
      }
    }
    const memoryRequest = subRequests[2];
    for (const name of [".hidden", "..", "bad name", "bad@name", "a".repeat(129)]) {
      expectScheduleRejection(`sub-memory-unsafe-${name.length}`, { ...memoryRequest, root: `${path.dirname(memoryRequest.root)}${path.sep}${name}` }, "USER_RESOURCE_NAME_INVALID");
    }
    runtime.receipt.admitUserResources({ ...memoryRequest, root: path.join(path.dirname(memoryRequest.root), "a".repeat(128)) });
    expectScheduleRejection("sub-memory-traversal", { ...memoryRequest, root: `${path.dirname(memoryRequest.root)}${path.sep}..${path.sep}outside` }, "USER_RESOURCE_ROOT_MISMATCH");
    const transcriptRequest = subRequests.at(-1);
    for (const sessionId of [undefined, null, 42, "", "../session", "bad/session", ".session", "session-"]) {
      expectScheduleRejection("sub-transcript-unsafe-session", { ...transcriptRequest, sessionId }, "USER_RESOURCE_SESSION_ID_INVALID");
    }
    const legacyMemoryRoot = path.join(path.dirname(profile.agentDir), "agent-memory", "Agent_1.test");
    expectScheduleRejection("sub-memory-legacy-other-user", { ...memoryRequest, root: legacyMemoryRoot }, "USER_RESOURCE_ROOT_MISMATCH");
    // Unit-only identity variants exercise the exact private admission function.
    // Ownership stays bound to the real issued profile; cloned metadata is ONLY
    // for the legacy-id/sharedAssets policy, never a forged production receipt.
    const admissionSource = fs.readFileSync(new URL("../users/runtime.mjs", import.meta.url), "utf8");
    const admissionStart = admissionSource.indexOf("function assertManagedRequest(");
    const admissionEnd = admissionSource.indexOf("\nfunction createReceipt(", admissionStart);
    assert.ok(admissionStart >= 0 && admissionEnd > admissionStart);
    const { assertOwnedWorkspace: unitOwnedWorkspace } = await import("../users/ownership.mjs");
    const { canonicalize: unitCanonicalize } = await import("../users/registry.mjs");
    const unitAdmission = new Function("path", "assertOwnedWorkspace", "canonicalize", "fail", "SCHEDULE_SESSION_ID", `${admissionSource.slice(admissionStart, admissionEnd)}; return assertManagedRequest;`)(path, (_unitProfile, cwd) => unitOwnedWorkspace(profile, cwd), unitCanonicalize, (code) => Object.assign(new Error(code), { code }), /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/);
    const legacyProfile = Object.freeze({ ...profile, id: "evolvera" });
    assert.equal(unitAdmission(legacyProfile, { ...memoryRequest, userId: "evolvera", root: legacyMemoryRoot }).cwd, ctx.cwd);
    assert.throws(() => unitAdmission(legacyProfile, { ...memoryRequest, userId: profile.id, root: legacyMemoryRoot }), (error) => error.code === "USER_RESOURCE_PROFILE_MISMATCH");
    for (const sharedAssets of [undefined, [], [profile.sharedAssets[0], profile.sharedAssets[0]]]) {
      assert.throws(() => unitAdmission({ ...profile, sharedAssets }, subRequests[1]), (error) => error.code === "USER_RESOURCE_PROFILE_MISMATCH");
    }
    assert.deepEqual([path.join(scheduleRoot, ".pi"), scheduleDir, schedulePath(nativeSessionId)].map((entry) => fs.existsSync(entry)), scheduleStateBefore, "admission assertions do not create schedule storage");
    process.stdout.write(`SCHEDULE_ADMISSION cases=${scheduleAdmissions.length} readonly=true\n`);
    const storePath = resolveStorePath(ctx.cwd, runtime.sessionManager.getSessionId());
    assert.equal(storePath, path.join(profile.workspaces[0], ".pi", "subagent-schedules", `${runtime.sessionManager.getSessionId()}.json`));
    const store = new ScheduleStore(storePath);
    assert.deepEqual(store.list(), []);
    const scheduler = new SubagentScheduler();
    const originalDispose = AgentManager.prototype.dispose;
    const manager = new AgentManager(); // No UI/index/notification activation or arbitrary completion callbacks.
    const events = [];
    let resolveFired, rejectFired;
    const fired = new Promise((resolve, reject) => { resolveFired = resolve; rejectFired = reject; });
    const pi = { events: { emit(name, event) {
      assert.equal(name, "subagents:scheduled");
      events.push(event);
      if (event.type === "fired") resolveFired(event);
      if (event.type === "error") rejectFired(new Error(`SCHEDULED_NATIVE_ERROR ${event.error}`));
    } } };
    const admittedManagers = [];
    const originalFromStorage = runtime.sdk.SettingsManager.fromStorage;
    runtime.sdk.SettingsManager.fromStorage = function (...args) {
      const result = originalFromStorage.apply(this, args); admittedManagers.push(result); return result;
    };
    const originalStreams = {};
    let nativeStreamCalls = 0;
    for (const method of ["stream", "streamSimple"]) {
      originalStreams[method] = runtime.modelRuntime[method];
      runtime.modelRuntime[method] = function (...args) {
        assert.equal(this, runtime.receipt.modelRuntime, "scheduled native stream receiver is the exact owner receipt runtime");
        assert.equal(args[0].provider, selectedModel.provider); assert.equal(args[0].id, selectedModel.id);
        nativeStreamCalls++;
        return originalStreams[method].apply(this, args);
      };
    }
    globalThis.__usersChildSessionDir = profile.sessionRoots[0];
    let managerDisposalAttempted = false;
    let childSession;
    try {
      scheduler.start(pi, ctx, manager, store);
      const job = scheduler.addJob({ name: `scheduled-${id}`, description: "owned native scheduled smoke", schedule: "+1s", subagent_type: "general-purpose", prompt: "synthetic scheduled native request", model: `openai/${selectedModel.id}`, isolation: "off" });
      const event = await fired;
      assert.equal(event.jobId, job.id);
      const record = manager.getRecord(event.agentId);
      assert.ok(record?.promise, "original manager assigned the genuine runner promise");
      await record.promise; // Scheduler registered its original persistence continuation before this continuation.
      assert.equal(record.status, "completed");
      assert.equal(record.result, "synthetic mode response");
      childSession = record.session;
      assert.ok(childSession instanceof runtime.sdk.AgentSession);
      await childSession.waitForIdle();
      assert.equal(childSession.isIdle, true);
      assert.deepEqual(childSession.getActiveToolNames(), []);
      assert.deepEqual(childSession.getCallableToolNames(), []);
      assert.equal(childSession.modelRuntime, runtime.receipt.modelRuntime);
      assert.equal(admittedManagers.length, 1);
      const admittedManager = admittedManagers[0];
      assert.equal(childSession.settingsManager, admittedManager);
      assert.ok(admittedManager instanceof runtime.sdk.SettingsManager);
      const childLoader = childSession.resourceLoader;
      assert.ok(childLoader instanceof runtime.sdk.DefaultResourceLoader);
      assert.equal(childLoader.getExtensions().extensions.length, 0, "pure scheduled actor exposes no extension callbacks/tools");
      runtime.receipt.assertOwnedSession({ sessionPath: childSession.sessionFile, cwd: ctx.cwd });
      assert.equal(nativeStreamCalls, 1, "one scheduled job performs exactly one original native transport request");
      assert.equal(globalThis.__usersSyntheticDispatches, 1);
      assert.deepEqual(globalThis.__usersSyntheticTokens, [`synthetic-${id}`]);
      const saved = store.get(job.id);
      assert.equal(saved.lastStatus, "success"); assert.equal(saved.runCount, 1); assert.equal(saved.enabled, false);
      assert.equal(typeof saved.lastRun, "string");
      // Native JSON persistence omits undefined object properties (e.g. nextRun).
      const persistedJob = JSON.parse(JSON.stringify(saved));
      const reload = new ScheduleStore(storePath); // Genuine new native store, same receipt-bound namespace.
      assert.deepEqual(reload.list(), [persistedJob]);
      const backing = JSON.parse(fs.readFileSync(storePath, "utf8"));
      assert.deepEqual(backing, { version: 1, jobs: [persistedJob] });
      assert.equal(fs.existsSync(`${storePath}.lock`), false); assert.equal(fs.existsSync(`${storePath}.tmp`), false);
      assert.equal(events.filter(({ type }) => type === "fired").length, 1);
      assert.equal(events.some(({ type }) => type === "error"), false);
      assert.equal(AgentManager.prototype.dispose, originalDispose);
      scheduler.stop(); assert.equal(scheduler.isActive(), false);
      assert.deepEqual(guards.counters, { protected: 0, network: 0, child: 0, outside: 0, keyring: 0 });
      guards.scheduledGit.register(manager, AgentManager, record, runtime, scheduledNativeDisposals);
      managerDisposalAttempted = true;
      await guards.scheduledGit.dispose();
      // Reuse the existing original-delegating SDK timing observer, never replace a child
      // session method. Observe and await its real return despite native manager not doing so.
      const childDisposals = scheduledNativeDisposals.filter(({ session }) => session === childSession);
      assert.equal(childDisposals.length, 1);
      await childDisposals[0].completion;
      assert.equal(childSession.settingsManager, admittedManager); assert.equal(childSession.resourceLoader, childLoader);
      assert.equal(childSession.modelRuntime, runtime.receipt.modelRuntime);
      await admittedManager.flush();
      assert.deepEqual(runtime.modelRuntime.getProviders().map(({ id: providerId }) => providerId).sort(), catalogIds);
      assert.deepEqual(runtime.modelRuntime.getModels().map(({ provider: providerId, id: modelId }) => `${providerId}/${modelId}`).sort(), catalogModelIds);
      assert.deepEqual(fs.readFileSync(authPath), authBefore);
      assert.equal(globalThis[Symbol.for("pi.users.context")], runtime.receipt);
      assert.equal(Object.isFrozen(runtime.receipt), true);
      await runtime.host.dispose(); disposed = true;
      await runtime.settingsManager.flush();
      drained = await guards.drain();
      assert.deepEqual(drained, { pending: 0, descriptors: 0 });
      assert.deepEqual(guards.counters, { protected: 0, network: 0, child: 0, outside: 0, keyring: 0 });
      assert.deepEqual(guards.scheduledGit.receipt(), { initCompleted: 1, pruneCompleted: 1 });
      process.stdout.write(`SCHEDULED_NATIVE profile=${id} jobs=1 nativeStreamCalls=1 selectedTokens=1 storeReload=success runCount=1 disabled=true identities=true sdkDispose=1 settingsFlushed=true gitInitCompleted=1 gitPruneCompleted=1 drained=0 counters=0 catalogAuthPreserved=true\n`);
    } finally {
      scheduler.stop();
      // Failure never arms the broker. Honest original shutdown remains guarded: its
      // unconditional prune is denied/reported, not stubbed, retried or treated as success.
      if (!managerDisposalAttempted) await originalDispose.call(manager);
      runtime.sdk.SettingsManager.fromStorage = originalFromStorage;
      for (const method of Object.keys(originalStreams)) runtime.modelRuntime[method] = originalStreams[method];
      delete globalThis.__usersChildSessionDir;
    }
    return;
  }
  if (phase === "memory") {
    const catalogModelIds = runtime.modelRuntime.getModels().map(({ provider: providerId, id }) => `${providerId}/${id}`).sort();
    const stagedMemory = path.join(ROOT, "common-code", "plastic-memory-stage");
    assert.equal(JSON.parse(fs.readFileSync(path.join(stagedMemory, "package.json"), "utf8")).name, "pi-users-plastic-memory-stage");
    const jitiPath = "C:/nvm4w/nodejs/node_modules/@earendil-works/pi-coding-agent/node_modules/jiti/lib/jiti.mjs";
    const { createJiti } = await import(pathToFileURL(jitiPath).href);
    const memoryJiti = createJiti(import.meta.url, { fsCache: false });
    const cyclesModule = await memoryJiti.import(path.join(stagedMemory, "session/cycles.ts"));
    const ids = await memoryJiti.import(path.join(stagedMemory, "common/ids.ts"));
    const ledger = await memoryJiti.import(path.join(stagedMemory, "session/ledger.ts"));
    const observerModule = await memoryJiti.import(path.join(stagedMemory, "workers/observer.ts"));
    const compactorModule = await memoryJiti.import(path.join(stagedMemory, "workers/compactor.ts"));
    const schedulerModule = await memoryJiti.import(path.join(stagedMemory, "workers/scheduler.ts"));
    const runnerRuntimeModule = await memoryJiti.import(path.join(stagedMemory, "runtime/runner-runtime.ts"));
    const sourceEntries = [
      { type: "message", id: "memory-user", parentId: null, message: { role: "user", content: [{ type: "text", text: "Preserve this synthetic durable constraint." }] }, tokenCount: 1 },
      { type: "message", id: "memory-assistant", parentId: "memory-user", message: { role: "assistant", content: [{ type: "text", text: "I will preserve the synthetic durable constraint." }] }, tokenCount: 1 },
    ];
    const binding = { sessionId: ids.sessionDigest("users-runtime-memory", { profile: id }), generation: 1, branchId: "main" };
    const snapshot = cyclesModule.createCompletedTurnSnapshot({ binding, sourceEntries, activeEntryIds: sourceEntries.map(({ id: entryId }) => entryId), maxTokens: 100_000 });
    assert.equal(snapshot.status, "ready");
    const queuedResponses = [
      JSON.stringify({ observations: [{ content: "Synthetic durable constraint retained.", timestamp: "2026-10-05T00:00:00.000Z", relevance: "medium", sourceEntryIds: snapshot.span.sourceEntryIds }] }),
      JSON.stringify({ summary: "Synthetic bounded compaction." }),
    ];
    globalThis.__usersMemoryResponses = queuedResponses;
    const sdkModelRegistry = new runtime.sdk.ModelRegistry(runtime.receipt.modelRuntime);
    const memoryRuntime = runnerRuntimeModule.createPiRunnerRuntime(sdkModelRegistry);
    assert.ok(memoryRuntime, "real public SDK ModelRegistry adapts to the Plastic worker runtime");
    const originalComplete = runtime.receipt.modelRuntime.complete;
    const nativeCompletionResults = [];
    let completeCalls = 0;
    runtime.receipt.modelRuntime.complete = function (...args) {
      assert.equal(this, runtime.receipt.modelRuntime, "public native complete retains exact selected receipt runtime receiver");
      completeCalls += 1;
      const completion = originalComplete.apply(this, args);
      completion.then((message) => nativeCompletionResults.push({ provider: args[0].provider, model: args[0].id, stopReason: message.stopReason, errorMessage: message.errorMessage }),
        (error) => nativeCompletionResults.push({ provider: args[0].provider, model: args[0].id, rejected: true, errorMessage: error.message }));
      return completion;
    };
    let observerResult;
    let compactorResult;
    let defaultObserverResult;
    let defaultCompactorResult;
    let scheduledResult;
    let scheduledAppended = [];
    let scheduledLifecycle = [];
    const memoryCatalogModels = structuredClone(runtime.modelRuntime.getModels());
    const nativeBaseline = memoryCatalogModels.map(({ provider: providerId, id: modelId }) => `${providerId}/${modelId}`).sort();
    const nativeProviders = new Map();
    const originalProviders = new Map();
    const nativeDispatches = [];
    let nativeStreamCalls = 0;
    try {
      observerResult = await observerModule.runObserver({ binding, snapshot, sourceEntries, runtime: memoryRuntime, model: { provider: "openai", id: selectedModel.id } });
      const branchEntries = [];
      const closedCycles = [];
      for (let index = 0; index < 6; index += 1) {
        const user = { type: "message", id: `memory-cycle-${index}-user`, parentId: branchEntries.at(-1)?.id ?? null, message: { role: "user", content: [{ type: "text", text: `Synthetic cycle ${index} durable goal.` }] }, tokenCount: 20_000 };
        const assistant = { type: "message", id: `memory-cycle-${index}-assistant`, parentId: user.id, message: { role: "assistant", content: [{ type: "text", text: `Synthetic cycle ${index} completed.` }] }, tokenCount: 1 };
        branchEntries.push(user, assistant);
        const spanEntries = [user, assistant];
        const sourceEntryIds = spanEntries.map(({ id: entryId }) => entryId);
        const sourceSpan = { sourceStartId: user.id, sourceEndId: assistant.id, sourceEntryIds, sourceDigest: ledger.sourceDigest(spanEntries), completedTurnEndId: assistant.id };
        closedCycles.push({ schemaVersion: 1, ...binding, ...sourceSpan, cycleId: `memory-cycle-${index}`, snapshotId: `memory-snapshot-${index}`, status: "complete", observationIds: [], reflectionIds: [] });
      }
      const projectSnapshot = { summary: "Synthetic project summary.", activeIndex: JSON.stringify({ kind: "active-chunk-index", chunks: [] }) };
      compactorResult = await compactorModule.runCompactor({
        engine: { binding, branchEntries, cycles: closedCycles, projectSnapshot, runtimeToken: `memory-${id}` },
        eligibleCycles: closedCycles,
        projectSnapshot,
        runtime: memoryRuntime,
        model: { provider: "openai", id: selectedModel.id },
      });
      assert.equal(completeCalls, 2, "the original explicit OpenAI observer and detached compactor remain two native calls");
      assert.deepEqual(queuedResponses, [], "the original OpenAI observer and detached compactor responses are consumed");
      const targets = [
        { provider: "openai-codex", id: "gpt-6-luna", apiKey: `synthetic-codex-${id}` },
        { provider: "anthropic", id: "claude-sonnet-5", apiKey: id === "account-a" ? "synthetic-corporate-poison-account-a" : `synthetic-anthropic-${id}` },
      ];
      for (const target of targets) {
        const originalProvider = runtime.modelRuntime.getProvider(target.provider);
        const nativeModel = runtime.modelRuntime.getModel(target.provider, target.id);
        assert.ok(originalProvider, `native builtin ${target.provider} provider exists`);
        assert.ok(nativeModel, `native builtin ${target.provider}/${target.id} model exists`);
        assert.equal(nativeModel.provider, target.provider);
        assert.equal(nativeModel.id, target.id);
        originalProviders.set(target.provider, originalProvider);
        const syntheticStream = (model, context, options) => {
          nativeStreamCalls += 1;
          const next = globalThis.__usersMemoryNativeResponses?.shift();
          assert.ok(next, "native synthetic response queue is exhausted only by expected calls");
          assert.equal(model.provider, next.provider);
          assert.equal(model.id, next.id);
          assert.equal(options.apiKey, next.apiKey, "native provider sees only the selected owner's resolved auth");
          const record = { provider: model.provider, model: model.id, apiKey: options.apiKey, prompt: JSON.stringify(context.messages), stopReason: next.error ? "error" : "stop" };
          nativeDispatches.push(record);
          const stream = globalThis.__usersMemoryCreateStream();
          stream.end({ role: "assistant", content: next.error ? [] : [{ type: "text", text: next.text }], api: model.api, provider: model.provider, model: model.id, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: record.stopReason, ...(next.error ? { errorMessage: "synthetic native Codex fallback" } : {}), timestamp: 0 });
          return stream;
        };
        const fixture = { ...originalProvider, stream: syntheticStream, streamSimple: syntheticStream };
        assert.equal(fixture.auth, originalProvider.auth, `${target.provider} keeps the native OAuth/API-key resolver`);
        assert.equal(fixture.getModels, originalProvider.getModels, `${target.provider} keeps its builtin model definitions`);
        const refreshIndex = memoryNativeRefreshes.length;
        runtime.modelRuntime.registerNativeProvider(fixture);
        nativeProviders.set(target.provider, fixture);
        assert.equal(runtime.modelRuntime.getRegisteredNativeProvider(target.provider), fixture);
        assert.equal(runtime.modelRuntime.getProvider(target.provider).stream, syntheticStream);
        const refreshes = memoryNativeRefreshes.slice(refreshIndex);
        assert.equal(refreshes.length, 1, `${target.provider} registration starts one actual native refresh`);
        assert.equal(refreshes[0].modelRuntime, runtime.receipt.modelRuntime);
        assert.deepEqual(refreshes[0].options, { allowNetwork: false });
        assert.equal(typeof refreshes[0].completion?.then, "function");
        const refreshed = await refreshes[0].completion;
        assert.equal(refreshed.aborted, false);
        assert.equal(refreshed.errors.has(target.provider), false);
        assert.equal(memoryNativeRefreshes.length, refreshIndex + 1, "captured promise is the sole registration refresh; no extra refresh is used as a join");
      }
      assert.deepEqual(runtime.modelRuntime.getModels().map(({ provider: providerId, id: modelId }) => `${providerId}/${modelId}`).sort(), nativeBaseline, "native fixture hooks preserve all catalog model IDs");
      assert.deepEqual(structuredClone(runtime.modelRuntime.getModels()), memoryCatalogModels, "native fixture hooks preserve every builtin model definition");
      assert.equal(runtime.modelRuntime.getProvider("openai-codex").auth.oauth, originalProviders.get("openai-codex").auth.oauth, "Codex keeps the original lazy native OAuth resolver");
      assert.equal(runtime.modelRuntime.getProvider("anthropic").auth.apiKey, originalProviders.get("anthropic").auth.apiKey, "Anthropic keeps the original native API-key resolver");
      globalThis.__usersMemoryNativeResponses = [
        { ...targets[0], text: JSON.stringify({ observations: [{ content: "Default Codex observation retained.", timestamp: "2026-10-06T00:00:00.000Z", relevance: "medium", sourceEntryIds: snapshot.span.sourceEntryIds }] }) },
        { ...targets[0], text: JSON.stringify({ summary: "Default Codex detached compaction." }) },
      ];
      defaultObserverResult = await observerModule.runObserver({ binding, snapshot, sourceEntries, runtime: memoryRuntime });
      defaultCompactorResult = await compactorModule.runCompactor({
        engine: { binding, branchEntries, cycles: closedCycles, projectSnapshot, runtimeToken: `memory-default-${id}` },
        eligibleCycles: closedCycles, projectSnapshot, runtime: memoryRuntime,
      });
      assert.equal(defaultObserverResult.ok, true);
      assert.equal(defaultObserverResult.runner.resolved.model.provider, "openai-codex");
      assert.equal(defaultObserverResult.runner.resolved.model.id, "gpt-6-luna");
      assert.equal(defaultObserverResult.runner.resolved.config.thinking, "medium");
      assert.equal(defaultObserverResult.runner.resolved.auth.apiKey, `synthetic-codex-${id}`);
      assert.equal(defaultCompactorResult.ok, true);
      assert.equal(defaultCompactorResult.detached, true);
      assert.equal(defaultCompactorResult.runner.resolved.model.provider, "openai-codex");
      assert.equal(defaultCompactorResult.runner.resolved.model.id, "gpt-6-luna");
      assert.equal(defaultCompactorResult.runner.resolved.config.thinking, "medium");
      assert.equal(defaultCompactorResult.runner.resolved.auth.apiKey, `synthetic-codex-${id}`);
      assert.deepEqual(globalThis.__usersMemoryNativeResponses, []);
      if (id === "account-b") {
        const previousBytes = fs.readFileSync(authPath);
        const missingBytes = Buffer.from(JSON.stringify({ openai: { type: "api_key", key: `synthetic-${id}` }, anthropic: { type: "api_key", key: `synthetic-anthropic-${id}` } }));
        fs.writeFileSync(authPath, missingBytes);
        try {
          assert.deepEqual(fs.readFileSync(authPath), missingBytes);
          const beforeMissingDispatch = nativeDispatches.length;
          const beforeMissingStreamCalls = nativeStreamCalls;
          const beforeMissingCompleteCalls = completeCalls;
          const beforeMissingResults = nativeCompletionResults.length;
          const unavailable = await observerModule.runObserver({ binding, snapshot, sourceEntries, runtime: memoryRuntime });
          assert.equal(unavailable.ok, false);
          // The public facade preserves keyless compatibility; authenticated Codex fails at native request setup, not at a fabricated facade gate.
          assert.equal(completeCalls - beforeMissingCompleteCalls, 1);
          assert.deepEqual(nativeCompletionResults.slice(beforeMissingResults), [{ provider: "openai-codex", model: "gpt-6-luna", stopReason: "error", errorMessage: "Provider is not configured: openai-codex" }]);
          assert.equal(nativeStreamCalls, beforeMissingStreamCalls, "missing selected B credential never enters either provider stream hook");
          assert.equal(nativeDispatches.length, beforeMissingDispatch, "missing selected B credential fails before any native transport dispatch");
          assert.equal(JSON.stringify(unavailable).includes("synthetic-corporate-poison-account-a"), false, "other-owner corporate fixture is excluded from B's selected store");
          assert.deepEqual(fs.readFileSync(authPath), missingBytes);
        } finally {
          fs.writeFileSync(authPath, previousBytes);
          assert.deepEqual(fs.readFileSync(authPath), authBefore, "restore the exact raw selected auth fixture before worker finalization");
        }
      }
      const scheduler = schedulerModule.createCycleScheduler();
      const cycleBinding = { sessionId: ids.sessionDigest("users-runtime-memory-scheduler", { profile: id }), generation: 1, branchId: "main" };
      const scheduledEntries = [
        { type: "message", id: "fallback-user", parentId: null, message: { role: "user", content: [{ type: "text", text: "Qualifying synthetic 100k completed turn." }] }, tokenCount: 50_000 },
        { type: "message", id: "fallback-assistant", parentId: "fallback-user", message: { role: "assistant", content: [{ type: "text", text: "Synthetic turn completed." }] }, tokenCount: 50_000 },
      ];
      const queuedRecord = cyclesModule.createQueuedCycleRecords({ binding: cycleBinding, sourceEntries: scheduledEntries })[0];
      assert.ok(queuedRecord, "scheduler enters from the public durable queue-record constructor");
      assert.equal(queuedRecord.data.estimatedTokenCount, 100_000);
      const queueBytes = JSON.stringify(queuedRecord.data);
      globalThis.__usersMemoryNativeResponses = [
        { ...targets[0], error: true },
        { ...targets[0], error: true },
        { ...targets[1], text: JSON.stringify({ observations: [{ content: "Fallback retained the queued synthetic turn.", timestamp: "2026-10-06T00:00:01.000Z", relevance: "high", sourceEntryIds: queuedRecord.data.sourceEntryIds }] }) },
        { ...targets[0], text: JSON.stringify({ reflections: [] }) },
      ];
      const dispatchStart = nativeDispatches.length;
      const callsStart = completeCalls;
      try {
        scheduledResult = await scheduler.trigger({
          binding: cycleBinding,
          branchEntries: scheduledEntries,
          bootstrap: { activeEntryIds: scheduledEntries.map(({ id: entryId }) => entryId), historicalPrefixIds: [], historicalGap: "historical-unindexed" },
          records: [queuedRecord],
          runtime: memoryRuntime,
          append: (entry) => scheduledAppended.push(entry),
          lifecycleReporter: (event) => scheduledLifecycle.push(event),
        });
      } finally {
        scheduler.shutdown();
      }
      assert.equal(scheduledResult.status, "closed", "original public scheduler naturally closes after its built-in model fallback order");
      assert.equal(scheduler.isBusy(), false);
      assert.deepEqual(scheduler.getDetachedCompactorJobs(), []);
      assert.equal(JSON.stringify(queuedRecord.data), queueBytes, "the immutable durable chunk record is unchanged through fallback");
      assert.deepEqual(scheduledResult.snapshot.span.sourceEntryIds, queuedRecord.data.sourceEntryIds);
      assert.equal(scheduledResult.cycle.data.sourceDigest, queuedRecord.data.sourceDigest);
      assert.equal(scheduledAppended.filter((entry) => entry.customType === "plastic.cycle.closed").length, 1);
      assert.equal(scheduledAppended.filter((entry) => entry.customType === "plastic.observations.recorded").length, 1);
      assert.deepEqual(scheduledLifecycle.filter((event) => event.phase === "observer" && event.status === "failed").map(({ status }) => status), ["failed", "failed"]);
      assert.equal(scheduledLifecycle.filter((event) => event.phase === "observer" && event.status === "started").length, 3);
      const scheduledDispatches = nativeDispatches.slice(dispatchStart);
      assert.deepEqual(scheduledDispatches.map(({ provider, model }) => `${provider}/${model}`), ["openai-codex/gpt-6-luna", "openai-codex/gpt-6-luna", "anthropic/claude-sonnet-5", "openai-codex/gpt-6-luna"]);
      assert.deepEqual(scheduledDispatches.map(({ apiKey }) => apiKey), [`synthetic-codex-${id}`, `synthetic-codex-${id}`, targets[1].apiKey, `synthetic-codex-${id}`]);
      const [firstRetryMessages, secondRetryMessages] = scheduledDispatches.slice(0, 2).map(({ prompt }) => JSON.parse(prompt));
      for (const messages of [firstRetryMessages, secondRetryMessages]) {
        assert.equal(messages.length, 2);
        assert.equal(messages[1].role, "user");
        assert.ok(Number.isSafeInteger(messages[1].timestamp), "each retry retains its native request timestamp");
        // The original runner generates this envelope timestamp per request; queued content stays immutable.
        delete messages[1].timestamp;
      }
      assert.deepEqual(firstRetryMessages, secondRetryMessages, "native Codex retry preserves every message field except the per-request outer user timestamp");
      assert.ok(scheduledDispatches[0].prompt.includes("fallback-user") && scheduledDispatches[0].prompt.includes("fallback-assistant"));
      assert.equal(scheduledDispatches[0].stopReason, "error");
      assert.equal(scheduledDispatches[1].stopReason, "error");
      assert.equal(completeCalls - callsStart, 4, "actual native SDK completion order is two Codex failures, Sonnet success, Luna reflection");
      assert.deepEqual(globalThis.__usersMemoryNativeResponses, [], "all scheduled native fallback replies were consumed");
      for (const providerId of [...nativeProviders.keys()].reverse()) {
        const refreshIndex = memoryNativeRefreshes.length;
        runtime.modelRuntime.unregisterProvider(providerId);
        const refreshes = memoryNativeRefreshes.slice(refreshIndex);
        assert.equal(refreshes.length, 1, `${providerId} fixture removal starts one actual native refresh`);
        assert.equal(refreshes[0].modelRuntime, runtime.receipt.modelRuntime);
        assert.deepEqual(refreshes[0].options, { allowNetwork: false });
        const refreshed = await refreshes[0].completion;
        assert.equal(refreshed.aborted, false);
        assert.equal(refreshed.errors.has(providerId), false);
        nativeProviders.delete(providerId);
        assert.equal(runtime.modelRuntime.getRegisteredNativeProvider(providerId), undefined);
        assert.equal(runtime.modelRuntime.getProvider(providerId).stream, originalProviders.get(providerId).stream, `${providerId} native builtin stream is restored`);
        assert.equal(runtime.modelRuntime.getProvider(providerId).streamSimple, originalProviders.get(providerId).streamSimple, `${providerId} native builtin simple stream is restored`);
      }
      assert.deepEqual(runtime.modelRuntime.getModels().map(({ provider: providerId, id: modelId }) => `${providerId}/${modelId}`).sort(), nativeBaseline);
      assert.deepEqual(structuredClone(runtime.modelRuntime.getModels()), memoryCatalogModels);
      assert.equal(nativeStreamCalls, 6, "all six native transport entries are accounted for, including failures");
      assert.deepEqual(nativeDispatches.slice(0, 2).map(({ provider, model, apiKey }) => ({ provider, model, apiKey })), [
        { provider: "openai-codex", model: "gpt-6-luna", apiKey: `synthetic-codex-${id}` },
        { provider: "openai-codex", model: "gpt-6-luna", apiKey: `synthetic-codex-${id}` },
      ]);
    } finally {
      runtime.receipt.modelRuntime.complete = originalComplete;
      delete globalThis.__usersMemoryResponses;
      delete globalThis.__usersMemoryNativeResponses;
    }
    assert.equal(observerResult?.ok, true, "actual observer completed and validated its structured result");
    assert.equal(compactorResult?.ok, true, "actual detached compactor completed and prepared its engine result");
    assert.equal(compactorResult.detached, true);
    assert.equal(completeCalls, id === "account-b" ? 9 : 8, "all successful and missing-auth requests use the exact native ModelRuntime.complete");
    assert.equal(queuedResponses.length, 0, "both original valid OpenAI structured replies were consumed by native transport");
    assert.deepEqual(globalThis.__usersSyntheticTokens, [`synthetic-${id}`, `synthetic-${id}`], "native transport received only this profile's owner token");
    assert.deepEqual(runtime.modelRuntime.getProviders().map(({ id: providerId }) => providerId).sort(), catalogIds, "direct consumers preserve original provider catalog");
    assert.deepEqual(runtime.modelRuntime.getModels().map(({ provider: providerId, id }) => `${providerId}/${id}`).sort(), catalogModelIds, "direct consumers preserve original model catalog");
    assert.deepEqual(fs.readFileSync(authPath), authBefore, "direct consumers preserve raw owner authentication bytes");
    const refreshesBeforeHostDisposal = memoryNativeRefreshes.length;
    await runtime.host.dispose();
    disposed = true;
    for (const refresh of memoryNativeRefreshes.slice(refreshesBeforeHostDisposal)) {
      assert.equal(refresh.modelRuntime, runtime.receipt.modelRuntime);
      assert.deepEqual(refresh.options, { allowNetwork: false });
      assert.equal(typeof refresh.completion?.then, "function");
      await refresh.completion; // Join actual SDK teardown work, including a superseded refresh; never manufacture a second refresh.
    }
    await runtime.settingsManager.flush();
    drained = await guards.drain();
    assert.deepEqual(drained, { pending: 0, descriptors: 0 });
    assert.deepEqual(guards.counters, { protected: 0, network: 0, child: 0, outside: 0, keyring: 0 });
    assert.deepEqual(fs.readFileSync(authPath), authBefore, "both direct and default/fallback phases preserve raw owner authentication bytes");
    assert.equal(globalThis[Symbol.for("pi.users.context")], runtime.receipt);
    assert.equal(runtime.receipt.modelRuntime, runtime.modelRuntime);
    assert.equal(nativeProviders.size, 0, "all synthetic native provider hooks are removed before finalization");
    process.stdout.write(`MEMORY_DIRECT_CONSUMERS profile=${id} observer=complete compactor=detached-prepared nativeCompleteCalls=2 selectedTokens=2 catalogPreserved=true authBytesPreserved=true scheduler=closed publication=not-run\n`);
    process.stdout.write(`MEMORY_DEFAULT_FALLBACK profile=${id} defaultObserver=openai-codex/gpt-6-luna/default-medium defaultCompactor=openai-codex/gpt-6-luna/default-medium scheduler=closed order=openai-codex/gpt-6-luna,openai-codex/gpt-6-luna,anthropic/claude-sonnet-5,openai-codex/gpt-6-luna nativeCompleteCalls=${completeCalls} nativeTokens=${nativeDispatches.length} negativeB=${id === "account-b" ? "native-auth-error-before-provider-stream" : "not-applicable"} hostDisposed=true settingsFlushed=true drained={"pending":0,"descriptors":0} counters={"protected":0,"network":0,"child":0,"outside":0,"keyring":0} catalogPreserved=true authBytesPreserved=true publication=not-run\n`);
    for (const dispatch of nativeDispatches) process.stdout.write(`MEMORY_NATIVE_TRANSPORT ${JSON.stringify({ provider: dispatch.provider, model: dispatch.model, apiKey: dispatch.apiKey })}\n`);
    return;
  }
  if (id === "account-a") {
    const { createAssistantMessageEventStream } = await import(pathToFileURL(path.resolve(core, "../../node_modules/@earendil-works/pi-ai/dist/index.js")).href);
    const keylessProviderId = "pi-users-smoke-keyless";
    const keylessModel = { ...selectedModel, id: "synthetic-keyless-model", name: "Synthetic keyless smoke model", provider: keylessProviderId };
    let keylessDispatches = 0;
    let keylessApiKey;
    globalThis.__usersKeylessDispatches = 0;
    globalThis.__usersKeylessApiKey = undefined;
    const keylessStream = (model, context, options) => {
      keylessDispatches += 1;
      keylessApiKey = options.apiKey;
      globalThis.__usersKeylessDispatches = keylessDispatches;
      globalThis.__usersKeylessApiKey = options.apiKey;
      const stream = createAssistantMessageEventStream();
      stream.end({ role: "assistant", content: [{ type: "text", text: "synthetic keyless response" }], api: model.api, provider: model.provider, model: model.id, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: "stop", timestamp: 0 });
      return stream;
    };
    const keylessProvider = {
      id: keylessProviderId,
      name: "Test-only keyless synthetic provider",
      auth: { apiKey: { name: "Test-only keyless auth", resolve: async () => ({ auth: {}, source: "synthetic-keyless-test" }) } },
      getModels: () => [keylessModel],
      stream: keylessStream,
      streamSimple: keylessStream,
    };
    runtime.modelRuntime.registerNativeProvider(keylessProvider);
    assert.equal(runtime.modelRuntime.getRegisteredNativeProvider(keylessProviderId), keylessProvider);
    assert.equal(runtime.modelRuntime.getProvider(keylessProviderId).stream, keylessStream);
    assert.equal(runtime.modelRuntime.getProvider(keylessProviderId).streamSimple, keylessStream);
    assert.deepEqual(runtime.modelRuntime.getProviders().map(({ id }) => id).filter((providerId) => providerId !== keylessProviderId).sort(), catalogIds, "test-only provider registration retains every builtin provider");
    await runtime.session.setModel(keylessModel);
    const keylessEvents = [];
    const unsubscribe = runtime.session.subscribe((event) => {
      if (event.type === "message_end" && event.message?.role === "assistant") keylessEvents.push(event.message);
    });
    try {
      await runtime.session.prompt("keyless synthetic request");
      await runtime.session.waitForIdle();
    } finally { unsubscribe(); }
    assert.equal(keylessDispatches, 1, "actual SDK session dispatched once through the test-only keyless native provider");
    assert.equal(keylessApiKey, undefined, "keyless transport received no API key");
    assert.ok(keylessEvents.some((message) => message.content?.some((part) => part.text === "synthetic keyless response")), "actual SDK session completed the keyless synthetic response");
    assert.deepEqual(runtime.modelRuntime.getProviders().map(({ id }) => id).filter((providerId) => providerId !== keylessProviderId).sort(), catalogIds, "builtin providers remain present after keyless session dispatch");
    await runtime.session.setModel(selectedModel);
  }
  if (id === "account-b") {
    assert.equal(globalThis.__usersSyntheticDispatches, 0, "B synthetic transport starts undispatched");
    const missingBytes = Buffer.from("{}\n");
    fs.writeFileSync(authPath, missingBytes);
    assert.deepEqual(fs.readFileSync(authPath), missingBytes, "B missing-auth case begins with its explicit run-owned empty fixture");
    const beforeDispatch = globalThis.__usersSyntheticDispatches;
    const missingResult = await runtime.modelRuntime.completeSimple(selectedModel, { messages: [{ role: "user", content: "missing B auth probe", timestamp: 0 }] });
    assert.equal(missingResult.stopReason, "error");
    assert.match(missingResult.errorMessage ?? "", /not configured.*openai/i);
    assert.equal(globalThis.__usersSyntheticDispatches, beforeDispatch, "missing B auth errors before synthetic provider dispatch");
    assert.doesNotMatch(JSON.stringify(missingResult), /synthetic-account-[ab]/, "missing-auth result cannot contain either profile secret");
    assert.equal(process.env.OPENAI_API_KEY, undefined, "no ambient provider key is available as fallback");
    assert.deepEqual(fs.readFileSync(authPath), missingBytes, "SDK auth resolution leaves the missing B fixture unchanged");
    fs.writeFileSync(authPath, authBefore);
    assert.deepEqual(fs.readFileSync(authPath), authBefore, "B original synthetic auth bytes are explicitly restored before native JSON mode");
    assert.equal(globalThis.__usersSyntheticDispatches, beforeDispatch, "fixture restoration does not dispatch transport");
  }
  if (phase === "children") {
    const core = "C:/nvm4w/nodejs/node_modules/@earendil-works/pi-coding-agent/dist/index.js";
    const jitiPath = "C:/nvm4w/nodejs/node_modules/@earendil-works/pi-coding-agent/node_modules/jiti/lib/jiti.mjs";
    const { createJiti } = await import(pathToFileURL(jitiPath).href);
    const stagedRunner = path.join(ROOT, "common-code", "subagents-staging", `pi-subagents-${PACKAGE_VERSION}-users`, "src", "agent-runner.ts");
    assert.equal(JSON.parse(fs.readFileSync(path.join(ROOT, "common-code", "subagents-staging", `pi-subagents-${PACKAGE_VERSION}-users`, "package.json"), "utf8")).name, PACKAGE_NAME);
    const helperDir = path.join(ROOT, "common-code", "runner-fixtures");
    const aliases = { "@earendil-works/pi-coding-agent": core };
    for (const name of ["agent-types.js", "child-context.js", "context.js", "default-agents.js", "env.js", "memory.js", "nested-tools.js", "prompts.js", "skill-loader.js"]) aliases[`./${name}`] = path.join(helperDir, name);
    const runnerJiti = createJiti(import.meta.url, { fsCache: false, alias: aliases });
    const { runAgent } = await runnerJiti.import(stagedRunner);
    const modelRegistry = { runtime: runtime.modelRuntime, find: (provider, modelId) => runtime.modelRuntime.getModel(provider, modelId), getAvailable: () => runtime.modelRuntime.getModels() };
    const ctx = { cwd: profile.workspaces[0], model: selectedModel, modelRegistry, getSystemPrompt: () => "synthetic parent context", sessionManager: runtime.session.sessionManager };
    const admittedManagers = [];
    const createdChildSessions = [];
    const originalFromStorage = runtime.sdk.SettingsManager.fromStorage;
    runtime.sdk.SettingsManager.fromStorage = function (...args) {
      const manager = originalFromStorage.apply(this, args);
      admittedManagers.push(manager);
      return manager;
    };
    const runActualChild = async (extensionsEnabled, label) => {
      globalThis.__usersChildExtensionsEnabled = extensionsEnabled;
      globalThis.__usersChildSessionDir = profile.sessionRoots[0];
      const managerStart = admittedManagers.length;
      const tokenStart = globalThis.__usersSyntheticTokens.length;
      const ownedBefore = globalThis.__usersChildOwnedFactory ?? 0;
      const sharedBefore = globalThis.__usersChildSharedFactory ?? 0;
      let childSession;
      try {
        const child = await runAgent(ctx, "general-purpose", `${label} actual SDK child request`, {
          pi: {}, cwd: profile.workspaces[0], configCwd: profile.workspaces[0], model: selectedModel,
          onSessionCreated(session) { childSession = session; createdChildSessions.push(session); },
        });
        childSession = child.session;
        assert.equal(child.responseText, "synthetic mode response", `${label}: actual prepared runner collected the synthetic native response`);
        assert.ok(childSession instanceof runtime.sdk.AgentSession, `${label}: runner returned the actual public SDK session class`);
        assert.equal(childSession.modelRuntime, runtime.receipt.modelRuntime, `${label}: session uses the exact current immutable receipt modelRuntime`);
        assert.ok(childSession.settingsManager instanceof runtime.sdk.SettingsManager, `${label}: actual public SDK SettingsManager`);
        assert.equal(admittedManagers.length, managerStart + 1, `${label}: runner consumed one genuine receipt-admitted SettingsManager factory result`);
        const admittedManager = admittedManagers[managerStart];
        assert.equal(childSession.settingsManager, admittedManager, `${label}: actual child session reuses the exact receipt-admitted manager`);
        assert.ok(childSession.resourceLoader instanceof runtime.sdk.DefaultResourceLoader, `${label}: actual public DefaultResourceLoader`);
        const actualChildLoader = childSession.resourceLoader;
        assert.deepEqual(globalThis.__usersSyntheticTokens.slice(tokenStart), [`synthetic-${id}`], `${label}: only the selected account token reached the fake transport`);
        assert.ok(globalThis.__usersSyntheticDispatches > 0, `${label}: actual child prompt dispatched through current fake transport`);
        if (extensionsEnabled) {
          assert.ok(globalThis.__usersChildOwnedFactory > ownedBefore, `${label}: admitted profile-owned code factory ran`);
          assert.ok(globalThis.__usersChildSharedFactory > sharedBefore, `${label}: admitted common-code factory ran`);
          const ownedReloadBefore = globalThis.__usersChildOwnedFactory;
          const sharedReloadBefore = globalThis.__usersChildSharedFactory;
          const originalManagerReload = admittedManager.reload;
          let managerReloads = 0;
          admittedManager.reload = function (...args) { managerReloads++; return originalManagerReload.apply(this, args); };
          try { await childSession.reload(); }
          finally { admittedManager.reload = originalManagerReload; }
          assert.equal(managerReloads, 2, `${label}: public AgentSession.reload reloads its admitted manager directly and through the public resource loader`);
          assert.equal(childSession.settingsManager, admittedManager, `${label}: public reload preserves the exact admitted SettingsManager`);
          assert.equal(childSession.resourceLoader, actualChildLoader, `${label}: public reload preserves the actual DefaultResourceLoader instance`);
          assert.equal(childSession.modelRuntime, runtime.receipt.modelRuntime, `${label}: public reload preserves the exact receipt modelRuntime`);
          assert.ok(globalThis.__usersChildOwnedFactory > ownedReloadBefore, `${label}: public session reload invokes admitted profile-owned CODE again`);
          assert.ok(globalThis.__usersChildSharedFactory > sharedReloadBefore, `${label}: public session reload invokes admitted shared CODE again`);
          const currentProvider = runtime.modelRuntime.getProvider("openai");
          const reloadedHook = globalThis.__usersSyntheticStream;
          assert.equal(currentProvider.stream, reloadedHook, `${label}: reloaded fake stream hook identity is current`);
          assert.equal(currentProvider.streamSimple, reloadedHook, `${label}: reloaded simple-stream hook identity is current`);
          const promptTokenStart = globalThis.__usersSyntheticTokens.length;
          const promptResponses = [];
          const unsubscribeReloadPrompt = childSession.subscribe((event) => {
            if (event.type === "message_end" && event.message?.role === "assistant") promptResponses.push(event.message);
          });
          try {
            await childSession.prompt(`${label} prompt after public session reload`);
            await childSession.waitForIdle();
          } finally { unsubscribeReloadPrompt(); }
          assert.deepEqual(globalThis.__usersSyntheticTokens.slice(promptTokenStart), [`synthetic-${id}`], `${label}: post-reload native prompt uses only the selected account token`);
          assert.ok(promptResponses.some((message) => message.content?.some((part) => part.text === "synthetic mode response")), `${label}: actual session prompt completes via the freshly rebound hook`);
        } else {
          assert.equal(childSession.resourceLoader.getExtensions().extensions.length, 0, `${label}: extensions:false preserves native load isolation`);
          assert.equal(globalThis.__usersChildOwnedFactory ?? 0, ownedBefore, `${label}: isolated child never invokes owned factories`);
          assert.equal(globalThis.__usersChildSharedFactory ?? 0, sharedBefore, `${label}: isolated child never invokes shared factories`);
          const provider = runtime.modelRuntime.getProvider("openai");
          assert.equal(provider.stream, globalThis.__usersSyntheticStream, `${label}: parent runtime keeps the current fake transport`);
          assert.equal(provider.streamSimple, globalThis.__usersSyntheticStream, `${label}: parent runtime keeps the current simple transport`);
          const originalManagerReload = admittedManager.reload;
          let managerReloads = 0;
          admittedManager.reload = function (...args) { managerReloads++; return originalManagerReload.apply(this, args); };
          try { await childSession.reload(); }
          finally { admittedManager.reload = originalManagerReload; }
          assert.equal(managerReloads, 2, `${label}: public session reload retains the admitted manager lifecycle`);
          assert.equal(childSession.resourceLoader, actualChildLoader, `${label}: isolated public reload preserves its actual loader instance`);
          assert.equal(childSession.modelRuntime, runtime.receipt.modelRuntime, `${label}: isolated public reload preserves the receipt modelRuntime`);
          assert.equal(childSession.resourceLoader.getExtensions().extensions.length, 0, `${label}: extensions:false remains isolated after public session reload`);
          assert.equal(globalThis.__usersChildOwnedFactory ?? 0, ownedBefore, `${label}: isolated reload still invokes no owned factory`);
          assert.equal(globalThis.__usersChildSharedFactory ?? 0, sharedBefore, `${label}: isolated reload still invokes no shared factory`);
        }
        process.stdout.write(`CHILD_LOADER ${JSON.stringify({ profile: id, label, token: `synthetic-${id}`, modelRuntimeIdentity: true, managerIdentity: true, loader: "DefaultResourceLoader", reload: extensionsEnabled ? "owned+shared" : "extensions:false-isolated" })}\n`);
      } finally {
        try { if (childSession) await childSession.dispose(); }
        finally { if (admittedManagers[managerStart]) await admittedManagers[managerStart].flush(); }
      }
    };
    const originalSessionCreate = runtime.sdk.SessionManager.create;
    let nativeCreates = 0;
    runtime.sdk.SessionManager.create = function (...args) { nativeCreates++; return originalSessionCreate.apply(this, args); };
    try {
      const poisonPath = path.join(ROOT, id === "account-a" ? "account-b" : "account-a", "home", ".pi", "agent", "alien-skill.md");
      globalThis.__usersChildPoisonSkill = poisonPath;
      const managerCount = admittedManagers.length;
      const sessionCount = createdChildSessions.length;
      const preloadCount = globalThis.__usersChildPreloads ?? 0;
      const createCount = nativeCreates;
      let poisonError;
      try {
        await runAgent(ctx, "general-purpose", "poisoned frontmatter must fail before ingestion", {
          pi: {}, cwd: profile.workspaces[0], configCwd: profile.workspaces[0], model: selectedModel,
          onSessionCreated(session) { createdChildSessions.push(session); },
        });
      } catch (error) { poisonError = error; }
      finally {
        for (const session of createdChildSessions.slice(sessionCount).reverse()) await session.dispose();
        for (const manager of admittedManagers.slice(managerCount)) await manager.flush();
      }
      assert.ok(poisonError, "poisoned frontmatter must reject before child session startup");
      assert.equal(poisonError.code, "RESOURCE_INVENTORY_REJECTED", "poisoned frontmatter uses the established typed inventory rejection");
      assert.equal(admittedManagers.length, managerCount, "poisoned child frontmatter fails before admitted manager construction");
      assert.equal(createdChildSessions.length, sessionCount, "poisoned child frontmatter fails before native session factory callback");
      assert.equal(globalThis.__usersChildPreloads ?? 0, preloadCount, "poisoned child frontmatter fails before skill preloading");
      assert.equal(nativeCreates, createCount, "poisoned child frontmatter fails before native SessionManager.create");
      delete globalThis.__usersChildPoisonSkill;
      await runActualChild(true, "prepared-runner");
      await runActualChild(false, "prepared-runner-extensions-false");
    } finally {
      runtime.sdk.SessionManager.create = originalSessionCreate;
      runtime.sdk.SettingsManager.fromStorage = originalFromStorage;
      delete globalThis.__usersChildPoisonSkill;
      delete globalThis.__usersChildExtensionsEnabled;
      delete globalThis.__usersChildSessionDir;
    }
    assert.deepEqual(guards.counters, { protected: 0, network: 0, child: 0, outside: 0, keyring: 0 }, "child runner never reached protected/network/keyring/child effects");
  }
  if (mode === "json") {
    const hostProfile = Object.getOwnPropertyDescriptor(runtime.host, "profile");
    assert.equal(hostProfile.value, profile);
    assert.equal(hostProfile.writable, false);
    assert.equal(hostProfile.configurable, false);
    assert.equal(Object.isFrozen(runtime), true, "runtime's public current-session view is frozen");
    const verifyCurrent = () => {
      assert.equal(runtime.session, runtime.host.session);
      assert.equal(runtime.sessionManager, runtime.host.session.sessionManager);
      assert.equal(runtime.services, runtime.host.services);
      assert.equal(runtime.settingsManager, runtime.host.services.settingsManager);
      assert.equal(runtime.modelRuntime, runtime.receipt.modelRuntime);
      assert.equal(runtime.modelRuntime, runtime.host.services.modelRuntime);
      assert.ok(runtime.settingsManager instanceof runtime.sdk.SettingsManager);
      assert.equal(runtime.session.resourceLoader, runtime.services.resourceLoader);
      assert.equal(runtime.host.profile, profile);
    };
    const promptCurrent = async (label) => {
      const currentProvider = runtime.modelRuntime.getProvider("openai");
      const currentHook = globalThis.__usersSyntheticStream;
      assert.equal(typeof currentHook, "function", `${label}: current resource loader installed synthetic hook`);
      assert.equal(currentProvider.streamSimple, currentHook, `${label}: current streamSimple hook is synthetic`);
      assert.equal(currentProvider.stream, currentHook, `${label}: current stream hook is synthetic`);
      const before = globalThis.__usersSyntheticDispatches;
      const responses = [];
      const unsubscribe = runtime.session.subscribe((event) => {
        if (event.type === "message_end" && event.message?.role === "assistant") responses.push(event.message);
      });
      try {
        await runtime.session.setModel(selectedModel);
        await runtime.session.prompt(`${label} lifecycle prompt`);
        process.stderr.write(`REPLACEMENT_PROMPT_RETURNED profile=${id} label=${label}\n`);
        await runtime.session.waitForIdle();
      } finally { unsubscribe(); }
      assert.equal(globalThis.__usersSyntheticDispatches, before + 1, `${label}: current synthetic transport dispatched exactly once`);
      assert.ok(responses.some((message) => message.content?.some((part) => part.text === "synthetic mode response")), `${label}: actual SDK session recorded a synthetic assistant response`);
      verifyCurrent();
    };
    const replacementCount = { value: 0 };
    const replace = async (label, operation) => {
      process.stderr.write(`REPLACEMENT_START profile=${id} label=${label}\n`);
      const diagnostic = setTimeout(() => process.stderr.write(`REPLACEMENT_PENDING profile=${id} label=${label} isStreaming=${runtime.session.isStreaming}\n`), 10_000);
      diagnostic.unref();
      try {
        const result = await operation();
        process.stderr.write(`REPLACEMENT_CREATED profile=${id} label=${label}\n`);
        assert.equal(result.cancelled, false, `${label}: native SDK replacement completed`);
        replacementCount.value += 1;
        verifyCurrent();
        await promptCurrent(label);
        process.stderr.write(`REPLACEMENT_COMPLETE profile=${id} label=${label}\n`);
      } finally { clearTimeout(diagnostic); }
    };
    await replace("newSession-own-parent", () => runtime.host.newSession({ parentSession: ownedParentHeaderPath }));
    const fixtureDir = path.join(profile.sessionRoots[0], "replacement-fixtures");
    fs.mkdirSync(runOwned(fixtureDir), { recursive: true });
    const fixtureManager = runtime.sdk.SessionManager.create(profile.workspaces[0], fixtureDir);
    const fixtureEntryId = fixtureManager.appendMessage({ role: "user", content: [{ type: "text", text: "synthetic lifecycle fixture" }], timestamp: Date.now() });
    const fixturePath = fixtureManager.getSessionFile();
    assert.ok(fixturePath && fs.existsSync(runOwned(fixturePath)), "public SessionManager produced a saved run-owned synthetic fixture");
    assert.equal(fixtureManager.getEntry(fixtureEntryId)?.type, "message", "fork fixture uses a real public message entry ID");
    await replace("switchSession", () => runtime.host.switchSession(fixturePath, { cwdOverride: profile.workspaces[0] }));
    await replace("importFromJsonl", () => runtime.host.importFromJsonl(fixturePath, profile.workspaces[0]));
    const importedUserEntry = runtime.session.sessionManager.getEntries().find((entry) => entry.type === "message" && entry.message.role === "user");
    assert.ok(importedUserEntry?.id, "imported native session contains a valid public message entry ID");
    await replace("fork", () => runtime.host.fork(importedUserEntry.id, { position: "at" }));
    assert.equal(replacementCount.value, 4, "all four native public replacement operations were exercised");
    runtime.settingsManager.setLastChangelogVersion("task07-session-replacement");
    await runtime.settingsManager.flush();
    assert.equal(runtime.settingsManager.getLastChangelogVersion(), "task07-session-replacement");
    assert.ok(fs.existsSync(runOwned(path.join(profile.agentDir, "settings.json"))), "replacement settings flush persisted only inside selected profile");
  }
  if (mode === "interactive") {
    const terminalWrites = [];
    let publicInput;
    let terminalStarted = false;
    let terminalStopped = false;
    let terminalDrained = false;
    const terminal = {
      start(onInput, onResize) { assert.equal(terminalStarted, false); terminalStarted = true; publicInput = onInput; this.onResize = onResize; },
      stop() { terminalStopped = true; },
      async drainInput() { terminalDrained = true; },
      write(data) { terminalWrites.push(data); },
      columns: 80,
      rows: 24,
      kittyProtocolActive: false,
      moveBy() {}, hideCursor() {}, showCursor() {}, clearLine() {}, clearFromCursor() {}, clearScreen() {}, setTitle() {}, setProgress() {},
    };
    let agentSettled = false;
    runtime.session.subscribe((event) => { if (event.type === "agent_settled") agentSettled = true; });
    const originalDispose = runtime.host.dispose.bind(runtime.host);
    runtime.host.dispose = async (...args) => {
      const result = await originalDispose(...args);
      await runtime.settingsManager.flush();
      const rendered = terminalWrites.join("").includes("synthetic mode response");
      assert.equal(agentSettled, true, "actual public session emitted agent_settled before quit");
      assert.equal(rendered, true, "in-memory public Terminal.write captured the synthetic SDK response");
      assert.equal(globalThis.__usersSyntheticTokens?.length, 1);
      assert.equal(globalThis.__usersSyntheticTokens[0], `synthetic-${id}`);
      assert.equal(terminalStopped, true, "native interactive shutdown stopped the injected terminal");
      assert.equal(terminalDrained, true, "native interactive shutdown drained the injected terminal");
      assert.deepEqual(fs.readFileSync(authPath), authBefore, "interactive shutdown preserves selected raw auth bytes");
      disposed = true;
      drained = await guards.drain();
      assert.deepEqual(drained, { pending: 0, descriptors: 0 });
      assert.deepEqual(guards.counters, { protected: 0, network: 0, child: 0, outside: 0, keyring: 0 });
      process.stderr.write(`INTERACTIVE_DISPOSAL profile=${id} hostDisposed=true settingsFlushed=true drained=${JSON.stringify(drained)} counters=${JSON.stringify(guards.counters)} terminalStopped=true terminalDrained=true agentSettled=true rendered=true selectedToken=synthetic-${id} quitFed=true\n`);
      return result;
    };
    void runUserMode(runtime, "interactive", { interactiveOptions: { terminal, initialThemeSetting: "dark", initialMessage: "synthetic mode request" } })
      .catch((error) => { firstError ??= error; process.stderr.write(`INTERACTIVE_MODE_ERROR ${error.stack ?? error}\n`); });
    const deadline = Date.now() + 45_000;
    while ((!agentSettled || !terminalWrites.join("").includes("synthetic mode response")) && Date.now() < deadline) {
      if (firstError) throw firstError;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(agentSettled, true, "native public session settled the initial synthetic prompt");
    assert.ok(terminalWrites.join("").includes("synthetic mode response"), "native public terminal rendered the synthetic response");
    assert.equal(terminalStarted, true);
    assert.equal(typeof publicInput, "function", "public injected terminal captured its registered input callback");
    process.stderr.write(`INTERACTIVE_INPUT profile=${id} publicTerminalCallback=true agentSettled=true rendered=true\n`);
    for (const sequence of ["/", "q", "u", "i", "t", "\r"]) publicInput(sequence);
    await new Promise(() => {}); // Native public interactive quit drains, disposes, then exits this owned worker.
  }
  if (mode === "rpc") {
    const originalDispose = runtime.host.dispose.bind(runtime.host);
    runtime.host.dispose = async (...args) => {
      const result = await originalDispose(...args);
      if (id === "account-a") {
        assert.equal(globalThis.__usersKeylessDispatches, 2, "native RPC keyless request reaches the synthetic provider");
        assert.equal(globalThis.__usersKeylessApiKey, undefined, "native RPC keyless dispatch has no credential");
      }
      await runtime.settingsManager.flush();
      assert.deepEqual(fs.readFileSync(authPath), authBefore, "RPC shutdown preserves selected raw auth bytes");
      disposed = true;
      drained = await guards.drain();
      assert.deepEqual(drained, { pending: 0, descriptors: 0 });
      assert.deepEqual(guards.counters, { protected: 0, network: 0, child: 0, outside: 0, keyring: 0 });
      process.stderr.write(`RPC_DISPOSAL profile=${id} hostDisposed=true settingsFlushed=true drained=${JSON.stringify(drained)} counters=${JSON.stringify(guards.counters)}\n`);
      return result;
    };
    void runUserMode(runtime, mode).catch((error) => { firstError ??= error; process.stderr.write(`RPC_MODE_ERROR ${error.stack ?? error}\n`); });
    await new Promise(() => {}); // The SDK's documented stdin EOF shutdown owns disposal and process exit.
  }
  const modeResult = await runUserMode(runtime, mode, { initialMessage: "synthetic mode request" });
  assert.equal(modeResult, 0);
  const providersAfterMode = runtime.modelRuntime.getProviders().map(({ id }) => id).sort();
  assert.deepEqual(providersAfterMode.filter((providerId) => providerId !== "pi-users-smoke-keyless"), catalogIds, "native mode preserves the builtin provider ID catalog");
  if (id === "account-a") assert.ok(providersAfterMode.includes("pi-users-smoke-keyless"), "additional provider is explicitly test-only");
  assert.equal(guards.counters.network, 0, "synthetic provider transport prevents all network attempts");
  disposed = true; // The official print mode disposes the host in its own finally block.
  await runtime.settingsManager.flush();
  drained = await guards.drain();
  assert.deepEqual(fs.readFileSync(authPath), authBefore, "native bootstrap preserves synthetic auth raw bytes");
  assert.equal(drained.pending, 0);
  assert.equal(drained.descriptors, 0);
  assert.deepEqual(guards.counters, { protected: 0, network: 0, child: 0, outside: 0, keyring: 0 });
  process.stdout.write(`native-print-mode PASS profile=${id} mode=${mode} home=${os.homedir()} models=${runtime.modelRuntime.getModels().length} tokenTransport=1 disposed=true drained=${JSON.stringify(drained)} counters=${JSON.stringify(guards.counters)}\n`);
  } catch (error) {
    firstError = error;
    throw error;
  } finally {
    // Preserve the original bootstrap error even if later disposal/draining also fails.
    let finalizationError;
    if (runtime && !disposed) {
      try { await runtime.host.dispose(); disposed = true; } catch (error) { finalizationError = error; }
    }
    try { drained = await guards.drain(); } catch (error) { finalizationError ??= error; }
    for (const restore of timingRestores.reverse()) restore();
    process.stderr.write(`BOOTSTRAP_RECEIPT profile=${id} disposed=${disposed} drained=${JSON.stringify(drained ?? null)} counters=${JSON.stringify(guards.counters)}\n`);
    if (mode === "json") process.stderr.write(`BOOTSTRAP_TIMING publicIndexImportMs=${Number((publicSdkImportMs ?? 0).toFixed(3))} initialCreateUserRuntimeMs=${Number((initialCreateUserRuntimeMs ?? 0).toFixed(3))} credentials=${JSON.stringify(credentialMetricsSummary() ?? null)} credentialDurations=overlapping-sum-not-wall-clock\n`);
    if (firstError) process.stderr.write(`FIRST_ERROR profile=${id}\n${firstError.stack ?? firstError}\n`);
    if (finalizationError) {
      process.stderr.write(`FINALIZATION_ERROR ${finalizationError.stack ?? finalizationError}\n`);
      if (!firstError) throw finalizationError;
    }
  }
}

// These helpers accept inert records, never arbitrary validators or spawn options.
function assertPlainData(value) {
  if (value === null || ["string", "number", "boolean", "undefined"].includes(typeof value)) return;
  assert.equal(typeof value, "object");
  assert.equal(types.isProxy(value), false, "CLI_PROXY_REJECTED");
  assert.ok([Object.prototype, Array.prototype, null].includes(Object.getPrototypeOf(value)), "CLI_NON_DATA_OBJECT");
  for (const key of Reflect.ownKeys(value)) {
    assert.equal(typeof key, "string");
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    assert.ok(Object.hasOwn(descriptor, "value"), "CLI_ACCESSOR_REJECTED");
    assertPlainData(descriptor.value);
  }
}
const cliDigest = (value) => createHash("sha256").update(value).digest("hex");
const WINDOWS_REQUIRED_ENV = Object.freeze(["HOMEDRIVE", "HOMEPATH", "LOGONSERVER", "PATH", "SYSTEMDRIVE", "SYSTEMROOT", "TEMP", "USERDOMAIN", "USERNAME", "USERPROFILE", "WINDIR"]);
function expectedWindowsChildEnv(env, workerEnv) {
  const expected = { ...env };
  if (process.platform === "win32") {
    const present = new Set(Object.keys(expected).map((key) => key.toLowerCase()));
    const workerKeys = new Map(Object.keys(workerEnv).map((key) => [key.toLowerCase(), key]));
    for (const key of WINDOWS_REQUIRED_ENV) {
      const workerKey = workerKeys.get(key.toLowerCase());
      if (workerKey === undefined) throw new Error(`CLI_WINDOWS_WORKER_ENV_MISSING_${key}`);
      if (!present.has(key.toLowerCase())) expected[workerKey] = workerEnv[workerKey];
    }
  }
  return Object.freeze(expected);
}
function sealCliData(value) {
  assertPlainData(value);
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) sealCliData(child);
    Object.freeze(value);
  }
  return value;
}
function readCliRecord(recordPath, manifestHash, recordHash) {
  // Only the parent-supplied exact files and root identity are inspected pre-guard.
  const bytes = fs.readFileSync(recordPath);
  if (recordHash) assert.equal(cliDigest(bytes), recordHash);
  const record = sealCliData(JSON.parse(bytes));
  const m = record.manifest;
  assert.equal(cliDigest(JSON.stringify(m)), manifestHash);
  assert.match(m.nonce, /^[a-f0-9]{48}$/);
  assert.equal(recordPath, path.join(m.root, "registry", `${m.id}-cli.json`));
  assert.equal(m.bootstrap, path.join(m.root, "registry", `${m.id}-bootstrap.mjs`));
  assert.equal(fs.realpathSync.native(m.root), m.root);
  const identity = fs.lstatSync(m.root);
  for (const key of ["dev", "ino", "birthtimeMs"]) assert.equal(identity[key], m.identity[key]);
  for (const file of [recordPath, m.bootstrap]) {
    const stat = fs.lstatSync(file);
    assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1);
    assert.equal(fs.realpathSync.native(file), file);
  }
  assert.equal(cliDigest(fs.readFileSync(m.bootstrap)), record.bootstrapHash);
  assert.equal(m.executable, process.execPath);
  assert.equal(m.argv[0], path.resolve(path.dirname(SCRIPT), "../users/launcher.mjs"));
  assert.deepEqual(m.argv, [m.argv[0], "--managed-child", m.id, m.cwd, m.mode, "synthetic mode request", m.registryPath]);
  assert.ok(["account-a", "account-b"].includes(m.id));
  assert.ok(["text", "json"].includes(m.mode));
  assert.equal(m.cwd, path.join(m.root, m.id, "workspace"));
  assert.equal(m.env.HOME, path.join(m.root, m.id, "home"));
  assert.equal(m.registryPath, path.join(m.root, "registry", "registry.json"));
  const workerProfile = { home: m.env.HOME, id: m.id, agentDir: m.env.PI_CODING_AGENT_DIR };
  // JSON round-trips produce ordinary records; retain strict field/value equality.
  assert.deepEqual(m.workerEnv, { ...cliWorkerEnvironment(workerProfile, m.registryPath, m.nonce) });
  assert.deepEqual(m.effectiveChildEnv, expectedWindowsChildEnv(m.env, m.workerEnv));
  return record;
}

async function cliWorker(recordPath, manifestHash, recordHash) {
  const record = readCliRecord(recordPath, manifestHash, recordHash);
  const m = record.manifest;
  let managed;
  let closePromise;
  let managedClosed = false;
  let managedClose;
  let managedError;
  let shutdownRequested = false;
  let shutdownPromise;
  let finalizationPromise;
  let finalizationSent = false;
  const stopManaged = () => { if (managed && !managedClosed) managed.kill("SIGTERM"); };
  const sendFinalization = (outcome) => {
    if (finalizationPromise) return finalizationPromise;
    finalizationPromise = new Promise((resolve, reject) => {
      if (!process.send || !process.connected) return reject(new Error("CLI_FINALIZATION_CHANNEL_UNAVAILABLE"));
      const message = {
        type: "cli-no-more-managed-children-finalization", nonce: m.nonce, id: m.id,
        managed: managedClose ? "closed" : "never-started",
        code: managedClose?.code ?? null, signal: managedClose?.signal ?? null, outcome,
      };
      process.send(message, (error) => {
        if (error) return reject(error);
        finalizationSent = true;
        const disconnected = new Promise((done) => {
          if (!process.connected) done();
          else process.once("disconnect", done);
        });
        process.disconnect();
        disconnected.then(() => {
          process.removeListener("message", onShutdownRequest);
          resolve(message);
        }, reject);
      });
    });
    return finalizationPromise;
  };
  const onShutdownRequest = (message) => {
    if (!message || Object.getPrototypeOf(message) !== Object.prototype
      || Object.keys(message).sort().join(",") !== "id,nonce,type"
      || message.type !== "cli-shutdown" || message.nonce !== m.nonce || message.id !== m.id) {
      throw new Error("CLI_SHUTDOWN_MESSAGE_INVALID");
    }
    if (shutdownRequested) return;
    shutdownRequested = true;
    shutdownPromise = (async () => {
      if (managed && !managedClosed) managed.kill("SIGTERM");
      if (closePromise) managedClose = await closePromise;
      await sendFinalization("shutdown-ack");
    })().catch((error) => { process.stderr.write(`CLI_FINALIZATION_ERROR ${error.message}\n`); process.exitCode = 1; });
  };
  process.on("message", onShutdownRequest);
  process.once("SIGTERM", stopManaged);
  try {
    assert.equal(process.env.PI_USERS_SMOKE_RUN_KEY, m.nonce);
    assert.equal(process.env.PI_USERS_SMOKE_ID, m.id);
    assert.equal(process.env.PI_USERS_SMOKE_REGISTRY, m.registryPath);
    assert.equal(process.env.PI_USERS_SMOKE_HOME, m.env.HOME);
    assert.equal(process.cwd(), m.cwd);
    assert.deepEqual({ ...process.env }, m.workerEnv, "worker starts with the sealed controlled input environment");
    for (const [stream, fd] of [[process.stdin, 0], [process.stdout, 1], [process.stderr, 2]]) {
      assert.equal(stream.fd, fd);
      assert.equal(Boolean(stream.isTTY), false, "CLI_WORKER_REQUIRES_PARENT_PIPES");
    }
    ROOT = m.root;
    RUN_KEY = m.nonce;
    const grant = sealCliData({ ...m, recordPath, manifestHash, recordHash });
    cliGrants.add(grant); // Private admission exists only in this parent worker, before imports.
    const guards = await installResourceGuards(m.id, [], grant);
    assert.equal(cliDigest(fs.readFileSync(m.registryPath)), m.registryHash);
    assert.equal(cliDigest(fs.readFileSync(path.join(m.env.PI_CODING_AGENT_DIR, "auth.json"))), m.authHash);
    for (const key of Object.keys(process.env)) if (key.startsWith("PI_USERS_SMOKE_")) delete process.env[key];
    const { resolveUser } = await import("../users/registry.mjs");
    const { createUserEnvironment } = await import("../users/environment.mjs");
    const profile = resolveUser({ id: m.id, registryPath: m.registryPath });
    assert.deepEqual({ ...createUserEnvironment(profile) }, m.env);
    const { launchUser } = await import("../users/launcher.mjs");
    if (shutdownRequested) throw new Error("CLI_SHUTDOWN_PREVENTED_MANAGED_SPAWN");
    const result = await launchUser(["use", m.id, "--cwd", m.cwd, "--mode", m.mode, "--message", "synthetic mode request", "--registry", m.registryPath], {
      spawnProcess(executable, argv, options) {
        if (shutdownRequested) throw new Error("CLI_SHUTDOWN_PREVENTED_MANAGED_SPAWN");
        assert.equal(managed, undefined, "CLI_MANAGED_HANDLE_ALREADY_REGISTERED");
        const handle = guards.spawnManagedChild(executable, argv, options);
        managed = handle;
        // Capture the real handle and its close receipt synchronously before any later assertion or await.
        closePromise = new Promise((resolve) => handle.once("close", (code, signal) => {
          managedClosed = true;
          managedClose = { code, signal };
          resolve(managedClose);
        }));
        handle.on("error", (error) => { managedError ??= error; });
        assert.ok(Number.isInteger(handle.pid));
        assert.equal(handle.stdin, null);
        assert.equal(handle.stdout, null);
        assert.equal(handle.stderr, null);
        assert.deepEqual(handle.stdio, [null, null, null]);
        process.stderr.write(`CLI_MANAGED_HANDLE profile=${m.id} pid=${handle.pid} stdio=inherit streams=null workerPipes=3\n`);
        return handle;
      },
    });
    if (shutdownRequested) throw new Error("CLI_SHUTDOWN_ABORTED_LAUNCH");
    assert.ok(managed);
    assert.deepEqual(await closePromise, { code: 0, signal: null });
    if (managedError) throw managedError;
    assert.equal(result, 0);
    assert.deepEqual(await guards.drain(), { pending: 0, descriptors: 0 });
    assert.deepEqual(guards.counters, { protected: 0, network: 0, child: 0, outside: 0, keyring: 0 });
    process.stderr.write(`CLI_PARENT_CLOSE profile=${m.id} managedClosed=true drained=0 counters=0\n`);
    await sendFinalization("success");
  } catch (error) {
    if (!shutdownRequested && managed && !managedClosed) stopManaged();
    if (closePromise && !managedClosed) managedClose = await closePromise;
    if (shutdownRequested && shutdownPromise) await shutdownPromise;
    else if (!finalizationSent) {
      shutdownRequested = true; // Latch before a never-started ACK can be delivered.
      await sendFinalization(managedClose ? "failure-closed" : "failure-never-started");
    }
    throw error;
  } finally { process.removeListener("SIGTERM", stopManaged); }
}

// Initialization-only entry used by a parent-generated --import module. No spawn grant is exported.
export async function initializeOwnedCliBootstrap(recordPath, manifestHash) {
  if (cliBootstrapInitialized || ROOT !== undefined) throw new Error("CLI_BOOTSTRAP_REENTRY");
  cliBootstrapInitialized = true;
  const record = readCliRecord(recordPath, manifestHash);
  const m = record.manifest;
  assert.deepEqual(process.execArgv, ["--import", pathToFileURL(m.bootstrap).href]);
  assert.deepEqual(process.argv.slice(1), m.argv);
  assert.deepEqual({ ...process.env }, m.effectiveChildEnv);
  assert.equal(process.cwd(), m.cwd);
  ROOT = m.root;
  RUN_KEY = m.nonce;
  const guards = await installResourceGuards(m.id); // Child has no capability, including prototype spawn.
  assert.equal(guards.spawnManagedChild, undefined);
  for (const [stream, fd] of [[process.stdin, 0], [process.stdout, 1], [process.stderr, 2]]) {
    assert.equal(stream.fd, fd);
    assert.equal(Boolean(stream.isTTY), false, "CLI_CHILD_REQUIRES_INHERITED_WORKER_PIPES");
  }
  assert.equal(os.homedir(), m.env.HOME);
  assert.equal(process.env.NODE_OPTIONS, undefined);
  assert.equal(process.env.NODE_PATH, undefined);
  assert.equal(process.env.OPENAI_API_KEY, undefined);
  const authPath = path.join(m.env.PI_CODING_AGENT_DIR, "auth.json");
  const authHash = cliDigest(fs.readFileSync(authPath));
  assert.equal(authHash, m.authHash);
  assert.equal(cliDigest(fs.readFileSync(m.registryPath)), m.registryHash);
  process.env.PI_OFFLINE = "1";
  process.env.PI_SKIP_VERSION_CHECK = "1";
  const core = "C:/nvm4w/nodejs/node_modules/@earendil-works/pi-coding-agent/dist/index.js";
  const sdk = await import(pathToFileURL(core).href);
  const originalDispose = sdk.AgentSessionRuntime.prototype.dispose;
  let disposals = 0;
  let drained;
  sdk.AgentSessionRuntime.prototype.dispose = async function (...args) {
    const receipt = globalThis[Symbol.for("pi.users.context")];
    assert.equal(Object.isFrozen(receipt), true);
    assert.equal(Object.isFrozen(receipt.profile), true);
    assert.equal(receipt.profile.id, m.id);
    assert.equal(this.profile, receipt.profile);
    assert.equal(this.services.modelRuntime, receipt.modelRuntime);
    assert.equal(this.session.modelRuntime, receipt.modelRuntime);
    assert.ok(this.session instanceof sdk.AgentSession);
    assert.ok(this.services.settingsManager instanceof sdk.SettingsManager);
    assert.ok(this.services.resourceLoader instanceof sdk.DefaultResourceLoader);
    assert.equal(this.session.resourceLoader, this.services.resourceLoader);
    assert.equal(this.session.sessionManager.getCwd(), m.cwd);
    runOwned(this.session.sessionFile);
    assert.ok(this.session.sessionFile.startsWith(m.env.PI_CODING_AGENT_SESSION_DIR + path.sep));
    const provider = receipt.modelRuntime.getProvider("openai");
    assert.equal(provider.stream, globalThis.__usersSyntheticStream);
    assert.equal(provider.streamSimple, globalThis.__usersSyntheticStream);
    const result = await originalDispose.apply(this, args); // Genuine SDK lifecycle, never simulated.
    disposals++;
    await this.services.settingsManager.flush();
    assert.deepEqual(globalThis.__usersSyntheticTokens, [`synthetic-${m.id}`]);
    assert.equal(globalThis.__usersSyntheticDispatches, 1);
    assert.equal(cliDigest(fs.readFileSync(authPath)), authHash);
    drained = await guards.drain(); // Only after actual host disposal and settings flush.
    assert.deepEqual(drained, { pending: 0, descriptors: 0 });
    assert.deepEqual(guards.counters, { protected: 0, network: 0, child: 0, outside: 0, keyring: 0 });
    process.stderr.write(`CLI_CHILD_DISPOSAL profile=${m.id} hostDisposed=true settingsFlushed=true identities=true selectedTokenOnly=true drained=${JSON.stringify(drained)} counters=${JSON.stringify(guards.counters)}\n`);
    return result;
  };
  process.once("beforeExit", () => {
    assert.ok(disposals > 0, "CLI_NATURAL_EXIT_WITHOUT_DISPOSAL");
    assert.deepEqual(drained, { pending: 0, descriptors: 0 });
    assert.deepEqual(guards.counters, { protected: 0, network: 0, child: 0, outside: 0, keyring: 0 });
    assert.deepEqual({ ...process.env }, m.env, "launcher reinstalls the original selected environment");
    assert.equal(cliDigest(fs.readFileSync(authPath)), authHash);
    process.stderr.write(`CLI_CHILD_NATURAL_EXIT profile=${m.id} disposals=${disposals} noSpawnCapability=true\n`);
  });
}

async function parent({ childPhase = false, interactivePhase = false, cachePhase = false, cliPhase = false, memoryPhase = false, scheduledPhase = false } = {}) {
  const phase = cachePhase ? "cache" : scheduledPhase ? "scheduled" : cliPhase ? "cli" : memoryPhase ? "memory" : interactivePhase ? "interactive" : childPhase ? "children" : "native";
  const parentEnvironment = JSON.stringify(Object.entries(process.env).sort());
  const parentHome = os.homedir();
  ROOT = fs.realpathSync.native(fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), "pi-users-runtime-")));
  const rootIdentity = fs.lstatSync(ROOT);
  process.stdout.write(`BOOTSTRAP_ROOT ${ROOT}\n`);
  RUN_KEY = randomBytes(24).toString("hex");
  const registryDir = mkdir("registry");
  const registryPath = path.join(registryDir, "registry.json");
  const stage = mkdir("common-code");
  const agents = mkdir("common-code", "agents");
  if (memoryPhase) {
    const memoryStage = mkdir("common-code", "plastic-memory-stage");
    write(path.join(memoryStage, "package.json"), JSON.stringify({ name: "pi-users-plastic-memory-stage", type: "module" }));
    for (const relative of MEMORY_CODE_FILES) {
      const sourceFile = path.join(MEMORY_SOURCE, relative);
      const stat = fs.lstatSync(sourceFile);
      assert.ok(stat.isFile() && !stat.isSymbolicLink(), `declared Plastic CODE must be a regular file: ${relative}`);
      fs.mkdirSync(runOwned(path.dirname(path.join(memoryStage, relative))), { recursive: true });
      write(path.join(memoryStage, relative), fs.readFileSync(sourceFile));
    }
  }
  let sharedChildExtension;
  let scheduledCodeManifestHash;
  if (childPhase || scheduledPhase) {
    const staging = mkdir("common-code", "subagents-staging");
    const stageProfile = { id: "users-runtime-child-fixture", agentDir: path.join(ROOT, "stage-profile-agent") };
    // Bound installed CODE reads before the existing preparer's recursive copy.
    const sourceFixture = mkdir("common-code", "subagents-source");
    mkdir("common-code", "subagents-source", "src");
    const sourceFiles = ["package.json", "src/index.ts", "src/agent-runner.ts", "src/agent-manager.ts", "src/memory.ts", "src/output-file.ts", "src/schedule-store.ts", "src/custom-agents.ts", "src/schedule.ts"];
    for (const relative of scheduledPhase ? [...new Set([...sourceFiles, ...SCHEDULED_SUB_FILES])] : sourceFiles) {
      const sourceFile = path.join(SUB_SOURCE, relative);
      const stat = fs.lstatSync(sourceFile);
      assert.ok(stat.isFile() && !stat.isSymbolicLink(), "declared SUB CODE must be a regular file");
      if (scheduledPhase) assert.equal(stat.nlink, 1);
      write(path.join(sourceFixture, relative), fs.readFileSync(sourceFile));
    }
    if (scheduledPhase) for (const [name, files] of Object.entries(SCHEDULED_PACKAGE_FILES)) {
      for (const relative of files) {
        const sourceFile = path.resolve(SUB_SOURCE, "..", "..", name, relative);
        assert.equal(fs.realpathSync.native(sourceFile), sourceFile);
        const stat = fs.lstatSync(sourceFile);
        assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1);
        // The existing stager intentionally excludes node_modules and dist. Explicit
        // aliases load these finite unchanged ESM files; nanoid's local alphabet stays adjacent.
        const stagedRelative = name === "croner" && relative === "dist/croner.js" ? "croner.js" : relative;
        const target = path.join(sourceFixture, "scheduled-deps", name, stagedRelative);
        fs.mkdirSync(runOwned(path.dirname(target)), { recursive: true });
        write(target, fs.readFileSync(sourceFile));
      }
    }
    stageSubagentsProfileCompatibility(sourceFixture, staging, { profile: stageProfile });
    const fixtureDir = mkdir("common-code", "runner-fixtures");
    write(path.join(fixtureDir, "package.json"), JSON.stringify({ name: "pi-users-runner-fixtures", type: "module" }));
    write(path.join(fixtureDir, "agent-types.js"), scheduledPhase
      ? `const agentConfig=()=>({name:"general-purpose",enabled:true,description:"owned scheduled fixture",extensions:false,skills:false,tools:[],builtinToolNames:[],persistSession:true,sessionDir:globalThis.__usersChildSessionDir});\nexport const BUILTIN_TOOL_NAMES=["read","write","edit","bash"]; export const getAgentConfig=agentConfig; export const getConfig=()=>agentConfig(); export const getMemoryToolNames=()=>[]; export const getReadOnlyMemoryToolNames=()=>[]; export const getToolNamesForType=()=>[]; export const resolveSpawnType=(type)=>type==="general-purpose"?{ok:true,type}:{ok:false,message:"Only the finite scheduled fixture type is admitted"};\n`
      : `const agentConfig=()=>({name:"general-purpose",extensions:globalThis.__usersChildExtensionsEnabled?true:false,skills:globalThis.__usersChildPoisonSkill?[globalThis.__usersChildPoisonSkill]:false,tools:[],builtinToolNames:[],persistSession:true,sessionDir:globalThis.__usersChildSessionDir});\nexport const BUILTIN_TOOL_NAMES=["read","write","edit","bash"]; export const getAgentConfig=agentConfig; export const getConfig=()=>agentConfig(); export const getMemoryToolNames=()=>[]; export const getReadOnlyMemoryToolNames=()=>[]; export const getToolNamesForType=()=>[];\n`);
    write(path.join(fixtureDir, "child-context.js"), `export const runInChildSessionContext=(fn)=>fn();\n`);
    write(path.join(fixtureDir, "context.js"), `export const buildParentContext=()=>\"\"; export const extractText=(content)=>typeof content===\"string\"?content:Array.isArray(content)?content.map(x=>x.text||\"\").join(\"\"): \"\";\n`);
    write(path.join(fixtureDir, "default-agents.js"), `export const DEFAULT_AGENTS=new Map();\n`);
    write(path.join(fixtureDir, "env.js"), `export const detectEnv=async()=>({});\n`);
    write(path.join(fixtureDir, "memory.js"), `export const buildMemoryBlock=()=>\"\"; export const buildReadOnlyMemoryBlock=()=>\"\";\n`);
    write(path.join(fixtureDir, "nested-tools.js"), `export const getMaxSubagentDepth=()=>4; export const createNestedSubagentTools=()=>[];\n`);
    write(path.join(fixtureDir, "prompts.js"), `export const buildAgentPrompt=()=>\"synthetic child system prompt\";\n`);
    write(path.join(fixtureDir, "skill-loader.js"), `export const preloadSkills=()=>{globalThis.__usersChildPreloads=(globalThis.__usersChildPreloads||0)+1; return [];};\n`);
    if (childPhase) {
      sharedChildExtension = path.join(stage, "extensions", "child-shared.mjs");
      mkdir("common-code", "extensions");
      write(sharedChildExtension, `export default ()=>{globalThis.__usersChildSharedFactory=(globalThis.__usersChildSharedFactory||0)+1;};\n`);
    }
    if (scheduledPhase) {
      const manifest = {};
      const finalStage = path.join(staging, `pi-subagents-${PACKAGE_VERSION}-users`);
      const fixtureFiles = ["package.json", "agent-types.js", "child-context.js", "context.js", "default-agents.js", "env.js", "memory.js", "nested-tools.js", "prompts.js", "skill-loader.js"];
      for (const relative of [...sourceFiles, ...SCHEDULED_SUB_FILES, ...Object.entries(SCHEDULED_PACKAGE_FILES).flatMap(([name, files]) => files.map((file) => `scheduled-deps/${name}/${name === "croner" && file === "dist/croner.js" ? "croner.js" : file}`))]) {
        for (const directory of [sourceFixture, finalStage]) {
          const file = path.join(directory, relative);
          manifest[path.relative(stage, file)] = cliDigest(fs.readFileSync(file));
        }
      }
      for (const relative of fixtureFiles) {
        const file = path.join(fixtureDir, relative); manifest[path.relative(stage, file)] = cliDigest(fs.readFileSync(file));
      }
      const bytes = JSON.stringify(manifest);
      write(path.join(stage, "scheduled-code.json"), bytes);
      scheduledCodeManifestHash = cliDigest(bytes);
    }
  }
  write(path.join(agents, "default.md"), "---\nmodel: anthropic/claude-sonnet-5-5\nthinking: high\n---\ncommon fixture\n");
  const extensionDir = mkdir("common-code", "extensions");
  const extensionPath = path.join(extensionDir, "synthetic-transport.mjs");
  const aiApiPath = path.resolve("C:/nvm4w/nodejs/node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai/dist/index.js");
  const cliTransportImport = cliPhase ? `import { registerApiProvider, getApiProvider } from ${JSON.stringify(pathToFileURL(path.join(path.dirname(aiApiPath), "compat.js")).href)};\n` : "";
  const cliTransportRegister = cliPhase ? `const selected = runtime.getModels("openai")[0]; if (!selected) throw new Error("CLI_SYNTHETIC_MODEL_UNAVAILABLE"); registerApiProvider({ api: selected.api, stream: syntheticStream, streamSimple: syntheticStream }, "owned-cli-synthetic"); const cliRegisteredApi = getApiProvider(selected.api); if (!cliRegisteredApi) throw new Error("CLI_PUBLIC_API_TRANSPORT_UNAVAILABLE"); globalThis.__usersSyntheticStream = (model, context, options) => cliRegisteredApi.streamSimple(model, context, options);` : "";
  const cliTransportAssert = cliPhase ? `if (getApiProvider(model.api) !== cliRegisteredApi) throw new Error("CLI_PUBLIC_API_TRANSPORT_IDENTITY");` : "";
  const transportHook = cliPhase ? "globalThis.__usersSyntheticStream" : "syntheticStream";
  const transportOutput = cliPhase ? "stderr" : "stdout";
  const memoryStreamFactory = memoryPhase ? "globalThis.__usersMemoryCreateStream = createAssistantMessageEventStream;" : "";
  write(extensionPath, `${cliTransportImport}import { createAssistantMessageEventStream } from ${JSON.stringify(pathToFileURL(aiApiPath).href)};\nexport default (pi) => {\n  ${memoryStreamFactory}\n  globalThis.__usersSyntheticDispatches = 0; globalThis.__usersSyntheticTokens ??= []; const receipt = globalThis[Symbol.for("pi.users.context")];\n  const runtime = receipt?.modelRuntime;\n  const original = runtime?.getProvider("openai");\n  if (!original) throw new Error("SYNTHETIC_PROVIDER_UNAVAILABLE");\n  const syntheticStream = function syntheticStream(model, context, options) {\n    const current = runtime.getProvider("openai");\n    if (current.stream !== ${transportHook} || current.streamSimple !== ${transportHook}) throw new Error("SYNTHETIC_TRANSPORT_IDENTITY_MISMATCH");\n    ${cliTransportAssert}\n    globalThis.__usersSyntheticDispatches += 1; globalThis.__usersSyntheticTokens.push(options.apiKey);\n    process.${transportOutput}.write("MODE_TRANSPORT " + JSON.stringify({ provider: model.provider, apiKey: options.apiKey }) + "\\n");\n    const stream = createAssistantMessageEventStream();\n    stream.end({ role: "assistant", content: [{ type: "text", text: ${memoryPhase ? 'globalThis.__usersMemoryResponses?.shift() ?? "synthetic mode response"' : '"synthetic mode response"'} }], api: model.api, provider: model.provider, model: model.id, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: "stop", timestamp: 0 });\n    return stream;\n  };\n  globalThis.__usersSyntheticStream = syntheticStream;\n  ${cliTransportRegister}\n  pi.registerProvider({ ...original, stream: ${transportHook}, streamSimple: ${transportHook} });\n};\n`);
  if (childPhase) write(path.join(extensionDir, "package.json"), JSON.stringify({ name: "pi-users-common-fixtures", pi: { extensions: ["./synthetic-transport.mjs", "./child-shared.mjs"] } }));
  const profiles = [];
  for (const id of ["account-a", "account-b"]) {
    const home = mkdir(id, "home");
    const agentDir = mkdir(id, "home", ".pi", "agent");
    if (interactivePhase || cliPhase) {
      const binDir = mkdir(id, "home", ".pi", "agent", "bin");
      for (const tool of ["fd.exe", "rg.exe"]) write(path.join(binDir, tool), "inert existence-only fixture; not an executable\n");
    }
    const sessionRoot = mkdir(id, "sessions");
    const workspace = mkdir(id, "workspace");
    mkdir(id, "home", "AppData", "Roaming");
    mkdir(id, "home", "AppData", "Local");
    mkdir(id, "home", ".config");
    mkdir(id, "home", ".cache");
    mkdir(id, "home", "Temp");
    mkdir(id, "home", "AppData", "Local", "Temp");
    mkdir(id, "home", "AppData", "Local", "Cache");
    write(path.join(agentDir, "auth.json"), JSON.stringify(memoryPhase ? {
      openai: { type: "api_key", key: `synthetic-${id}` },
      "openai-codex": { type: "oauth", access: `synthetic-codex-${id}`, refresh: `synthetic-refresh-${id}`, expires: 4_000_000_000_000 },
      anthropic: { type: "api_key", key: id === "account-a" ? "synthetic-corporate-poison-account-a" : `synthetic-anthropic-${id}` },
    } : { openai: { type: "api_key", key: `synthetic-${id}` } }));
    const ownedChildExtension = path.join(agentDir, "extensions", "child-owned.mjs");
    if (childPhase) {
      mkdir(id, "home", ".pi", "agent", "extensions");
      write(ownedChildExtension, `export default ()=>{globalThis.__usersChildOwnedFactory=(globalThis.__usersChildOwnedFactory||0)+1;};\n`);
      write(path.join(agentDir, "extensions", "package.json"), JSON.stringify({ name: `pi-users-${id}-fixtures`, pi: { extensions: ["./child-owned.mjs"] } }));
    }
    if (cliPhase) {
      const selectPath = path.join(agentDir, "extensions", "cli-select.mjs");
      mkdir(id, "home", ".pi", "agent", "extensions");
      write(selectPath, `export default (pi) => { pi.on("session_start", async () => { const runtime = globalThis[Symbol.for("pi.users.context")].modelRuntime; const model = runtime.getModels("openai")[0]; if (!model || !await pi.setModel(model)) throw new Error("CLI_SYNTHETIC_MODEL_UNAVAILABLE"); }); };\n`);
      write(path.join(agentDir, "settings.json"), JSON.stringify({ extensions: [extensionPath, selectPath], defaultProvider: "openai", theme: "dark" }));
    } else write(path.join(agentDir, "settings.json"), JSON.stringify({ extensions: childPhase ? [extensionPath, ownedChildExtension, sharedChildExtension] : [extensionPath], ...(interactivePhase ? { theme: "dark" } : {}) }));
    profiles.push({ id, home, agentDir, sessionRoot, workspace });
  }
  for (const profile of profiles) {
    const other = profiles.find((candidate) => candidate.id !== profile.id);
    const header = (parentSession) => `${JSON.stringify({ type: "session", version: 3, id: `synthetic-${profile.id}-${randomBytes(8).toString("hex")}`, timestamp: new Date().toISOString(), cwd: profile.workspace, ...(parentSession === undefined ? {} : { parentSession }) })}\n`;
    write(path.join(profile.sessionRoot, "synthetic-foreign-session.jsonl"), header());
    write(path.join(profile.sessionRoot, "synthetic-owned-parent-session.jsonl"), header());
    write(path.join(profile.sessionRoot, "synthetic-owned-parent-header.jsonl"), header(path.join(profile.sessionRoot, "synthetic-owned-parent-session.jsonl")));
    write(path.join(profile.sessionRoot, "synthetic-foreign-parent-header.jsonl"), header(path.join(other.sessionRoot, "synthetic-foreign-session.jsonl")));
    write(path.join(profile.sessionRoot, "synthetic-foreign-cwd-header.jsonl"), `${JSON.stringify({ type: "session", version: 3, id: `synthetic-${profile.id}-foreign-cwd-${randomBytes(8).toString("hex")}`, timestamp: new Date().toISOString(), cwd: other.workspace })}\n`);
  }
  const aliasFixturesById = new Map();
  const aliasFixtureBytes = new Map();
  for (const profile of cliPhase || memoryPhase || scheduledPhase || cachePhase ? [] : profiles) {
    const junctionTarget = runOwned(path.join(profile.sessionRoot, "synthetic-alias-junction-target"));
    fs.mkdirSync(junctionTarget);
    const junctionPath = path.join(profile.sessionRoot, "synthetic-alias-junction");
    const fixtures = [
      { kind: "junction", targetPath: path.join(junctionTarget, "session.jsonl"), aliasPath: path.join(junctionPath, "session.jsonl"), linkPath: junctionPath },
      { kind: "hardlink", targetPath: path.join(profile.sessionRoot, "synthetic-alias-hardlink-target.jsonl"), aliasPath: path.join(profile.sessionRoot, "synthetic-alias-hardlink.jsonl") },
    ];
    const aliasContent = `${JSON.stringify({ type: "session", version: 3, id: `synthetic-${profile.id}-alias-${randomBytes(8).toString("hex")}`, timestamp: new Date().toISOString(), cwd: profile.workspace })}\n`;
    for (const fixture of fixtures) {
      write(fixture.targetPath, aliasContent);
      aliasFixtureBytes.set(fixture.targetPath, Buffer.from(aliasContent));
    }
    try { fs.symlinkSync(junctionTarget, junctionPath, "junction"); }
    catch (error) { throw Object.assign(new Error(`SESSION_ALIAS_UNVERIFIED junction creation failed: ${error.code ?? error.message}`), { cause: error }); }
    try { fs.linkSync(fixtures[1].targetPath, fixtures[1].aliasPath); }
    catch (error) { throw Object.assign(new Error(`SESSION_ALIAS_UNVERIFIED hardlink creation failed: ${error.code ?? error.message}`), { cause: error }); }
    aliasFixturesById.set(profile.id, fixtures);
  }
  write(registryPath, `${JSON.stringify({ version: 1, users: profiles.map((p) => ({
    adoption: "new", agentDir: p.agentDir, contexts: [], id: p.id, label: p.id,
    sessionRoots: [p.sessionRoot], sharedAssets: [stage], workspaces: [p.workspace],
  })) }, null, 2)}\n`);
  const sha = (file) => createHash("sha256").update(fs.readFileSync(runOwned(file))).digest("hex");
  const authHashes = profiles.map((p) => sha(path.join(p.agentDir, "auth.json")));
  if (cliPhase) for (const p of profiles) {
    // Independently sealed expectation, not an echo of the DI callback's arguments.
    const workerEnv = cliWorkerEnvironment(p, registryPath);
    const env = {};
    for (const key of ["SystemRoot", "windir", "PATHEXT", "ComSpec"]) if (typeof workerEnv[key] === "string") env[key] = workerEnv[key];
    Object.assign(env, {
      PATH: workerEnv.PATH, SYSTEMDRIVE: workerEnv.SYSTEMDRIVE,
      HOME: p.home, USERPROFILE: p.home, APPDATA: path.join(p.home, "AppData", "Roaming"),
      LOCALAPPDATA: path.join(p.home, "AppData", "Local"), XDG_CONFIG_HOME: path.join(p.home, ".config"),
      XDG_CACHE_HOME: path.join(p.home, "AppData", "Local", "Cache"),
      TMP: path.join(p.home, "AppData", "Local", "Temp"), TEMP: path.join(p.home, "AppData", "Local", "Temp"),
      TMPDIR: path.join(p.home, "AppData", "Local", "Temp"), PI_CODING_AGENT_DIR: p.agentDir,
      PI_CODING_AGENT_SESSION_DIR: p.sessionRoot, PI_USER_ID: p.id, PI_USERS_REGISTRY: registryPath,
    });
    const mode = p.id === "account-a" ? "text" : "json";
    const bootstrap = path.join(registryDir, `${p.id}-bootstrap.mjs`);
    const recordPath = path.join(registryDir, `${p.id}-cli.json`);
    const manifest = sealCliData({
      root: ROOT, identity: { dev: rootIdentity.dev, ino: rootIdentity.ino, birthtimeMs: rootIdentity.birthtimeMs },
      nonce: RUN_KEY, id: p.id, registryPath, registryHash: sha(registryPath), authHash: sha(path.join(p.agentDir, "auth.json")),
      bootstrap, executable: process.execPath, cwd: p.workspace, mode, env,
      workerEnv,
      effectiveChildEnv: expectedWindowsChildEnv(env, workerEnv),
      argv: [path.resolve(path.dirname(SCRIPT), "../users/launcher.mjs"), "--managed-child", p.id, p.workspace, mode, "synthetic mode request", registryPath],
    });
    const manifestHash = cliDigest(JSON.stringify(manifest));
    const bootstrapSource = `import { initializeOwnedCliBootstrap } from ${JSON.stringify(import.meta.url)};\nawait initializeOwnedCliBootstrap(${JSON.stringify(recordPath)}, ${JSON.stringify(manifestHash)});\n`;
    write(bootstrap, bootstrapSource);
    const recordBytes = JSON.stringify({ manifest, bootstrapHash: cliDigest(bootstrapSource) });
    write(recordPath, recordBytes);
    p.cli = { recordPath, manifestHash, recordHash: cliDigest(recordBytes), workerEnv };
  }
  if (scheduledPhase) for (const p of profiles) {
    const control = mkdir(p.id, "git-control");
    const template = mkdir(p.id, "git-control", "empty-template");
    mkdir(p.id, "git-control", "empty-bin");
    write(path.join(control, "global.config"), ""); write(path.join(control, "system.config"), "");
    const identity = (file) => { const s = fs.lstatSync(file); return { dev: s.dev, ino: s.ino, birthtimeMs: s.birthtimeMs }; };
    const recordPath = path.join(registryDir, `${p.id}-scheduled.json`);
    const manifest = sealCliData({ root: ROOT, id: p.id, nonce: RUN_KEY, registryPath, recordPath,
      rootIdentity: identity(ROOT), workspaceIdentity: identity(p.workspace), controlIdentity: identity(control),
      cwd: p.workspace, control, template, binary: { ...SCHEDULED_GIT },
      env: scheduledGitEnvironment(p.home, control, p.workspace), codeManifestHash: scheduledCodeManifestHash,
    });
    const bytes = JSON.stringify(manifest); write(recordPath, bytes);
    p.scheduledRecordHash = cliDigest(bytes);
  }
  const records = [];
  let firstError;
  const bounded = async (promise, ms, message) => {
    let timer;
    try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); })]); }
    finally { clearTimeout(timer); }
  };
  const closed = () => records.every((r) => r.closed && r.stdinClosed && r.stdoutClosed && r.stderrClosed
    && (!cliPhase || (r.cliFinalized && r.cliIpcDisconnected)));
  const stopOwned = async () => {
    if (scheduledPhase) return records.filter((record) => !record.closed).map((record) => `OWNED_FINALIZATION_UNKNOWN ${record.id}: scheduled failure preserves root and sends no signal/retry`);
    const errors = [];
    for (const record of records) {
      if (cliPhase) {
        try {
          if (!record.cliFinalized && !record.closed && !record.cliIpcDisconnected) {
            if (!record.child.connected) throw new Error("CLI_FINALIZATION_CHANNEL_DISCONNECTED");
            await new Promise((resolve, reject) => record.child.send({ type: "cli-shutdown", nonce: record.nonce, id: record.id }, (error) => error ? reject(error) : resolve()));
          }
          if (!record.cliFinalized || !record.cliIpcDisconnected) {
            await bounded(Promise.all([record.cliFinalization, record.cliDisconnect]), 2_000, "owned CLI finalization ACK grace");
          }
        } catch (error) {
          errors.push(`OWNED_FINALIZATION_UNKNOWN ${record.id}: ${error.message}`);
          continue; // The worker may be the only remaining owner; never terminate or infer finalization.
        }
        if (record.closed) continue;
      } else if (record.closed) continue;
      try {
        record.child.kill("SIGTERM");
        try { await bounded(record.done, 2_000, "owned terminate grace"); }
        catch { if (!record.closed) record.child.kill("SIGKILL"); }
        await bounded(record.done, 5_000, "owned worker failed to close");
      } catch (error) { errors.push(error.message); }
    }
    return errors;
  };
  let cleanupStarted = false;
  try {
    // No application imports in the parent; only these registered handles may spawn/terminate.
    const waits = profiles.map(async (p) => {
      if ((childPhase || memoryPhase || scheduledPhase || cachePhase) && p.id === "account-b" && records[0]) {
        await records[0].wait;
        assert.equal(records[0].stdinClosed && records[0].stdoutClosed && records[0].stderrClosed, true, "A worker pipes close before B starts");
      }
      const mode = cliPhase ? p.id === "account-a" ? "text" : "json" : memoryPhase || scheduledPhase || cachePhase ? "json" : interactivePhase ? "interactive" : childPhase ? "json" : p.id === "account-a" ? "rpc" : "json";
      const other = profiles.find((candidate) => candidate.id !== p.id);
      const foreignSessionPath = path.join(other.sessionRoot, "synthetic-foreign-session.jsonl");
      const foreignParentHeaderPath = path.join(p.sessionRoot, "synthetic-foreign-parent-header.jsonl");
      const ownedParentHeaderPath = path.join(p.sessionRoot, "synthetic-owned-parent-header.jsonl");
      const badHeaderCwdPath = path.join(p.sessionRoot, "synthetic-foreign-cwd-header.jsonl");
      const aliasFixtures = aliasFixturesById.get(p.id);
      const workerArgv = cliPhase ? [SCRIPT, "--cli-worker", p.cli.recordPath, p.cli.manifestHash, p.cli.recordHash] : [SCRIPT, "--worker", ROOT, p.id, registryPath, RUN_KEY, mode, foreignSessionPath, foreignParentHeaderPath, ownedParentHeaderPath, badHeaderCwdPath, phase, JSON.stringify(aliasFixtures ?? [])];
      if (scheduledPhase) workerArgv.push(p.scheduledRecordHash);
      const workerEnv = cliPhase ? { ...p.cli.workerEnv } : cleanWorkerEnv(p.home, p.id, registryPath);
      if (cliPhase) { delete workerEnv.NODE_CHANNEL; delete workerEnv.NODE_UNIQUE_ID; }
      const child = spawn(process.execPath, workerArgv, { cwd: p.workspace, env: workerEnv, windowsHide: true, stdio: cliPhase ? ["pipe", "pipe", "pipe", "ipc"] : ["pipe", "pipe", "pipe"] });
      const r = { child, id: p.id, nonce: RUN_KEY, stdout: "", stderr: "", closed: false, stdinClosed: false, stdoutClosed: false, stderrClosed: false, error: null, cliFinalized: false, cliIpcDisconnected: false };
      records.push(r);
      if (cliPhase) {
        r.cliFinalization = new Promise((resolve, reject) => { r.resolveCliFinalization = resolve; r.rejectCliFinalization = reject; });
        r.cliFinalization.catch(() => {});
        r.cliDisconnect = new Promise((resolve) => { r.resolveCliDisconnect = resolve; });
        child.on("message", (message) => {
          const validShape = message && Object.getPrototypeOf(message) === Object.prototype
            && Object.keys(message).sort().join(",") === "code,id,managed,nonce,outcome,signal,type"
            && message.type === "cli-no-more-managed-children-finalization" && message.nonce === r.nonce && message.id === r.id
            && ["closed", "never-started"].includes(message.managed)
            && ["success", "shutdown-ack", "failure-closed", "failure-never-started"].includes(message.outcome)
            && (message.code === null || Number.isInteger(message.code))
            && (message.signal === null || typeof message.signal === "string")
            && (message.managed !== "closed" || message.code !== null || message.signal !== null)
            && (message.managed !== "never-started" || (message.code === null && message.signal === null));
          if (!validShape || r.cliFinalized) {
            const error = new Error("CLI_FINALIZATION_RECEIPT_INVALID");
            r.error ??= error; firstError ??= error; r.rejectCliFinalization(error); return;
          }
          if (message.outcome === "success" && (message.managed !== "closed" || message.code !== 0 || message.signal !== null)) {
            const error = new Error("CLI_SUCCESS_FINALIZATION_INVALID");
            r.error ??= error; firstError ??= error; r.rejectCliFinalization(error); return;
          }
          r.cliFinalized = true;
          r.cliFinalizationReceipt = message;
          r.resolveCliFinalization(message);
        });
        child.once("disconnect", () => { r.cliIpcDisconnected = true; r.resolveCliDisconnect(); });
      }
      child.stdout.setEncoding("utf8").on("data", (chunk) => { r.stdout += chunk; });
      child.stderr.setEncoding("utf8").on("data", (chunk) => { r.stderr += chunk; });
      // ChildProcess.close excludes stdin from Node's close counter in every phase.
      r.pipesClosed = Promise.all([[child.stdin, "stdinClosed"], [child.stdout, "stdoutClosed"], [child.stderr, "stderrClosed"]]
        .map(([stream, field]) => new Promise((resolve) => stream.once("close", () => {
          r[field] = true;
          resolve();
        }))));
      for (const handle of [child, child.stdin, child.stdout, child.stderr]) handle.on("error", (error) => { r.error ??= error; firstError ??= error; });
      r.done = new Promise((resolve) => child.once("close", (code, signal) => { r.closed = true; r.code = code; r.signal = signal; resolve(); }));
      const protocol = { records: [], buffer: "", ended: false };
      if (mode === "rpc") {
        child.stdout.on("data", (chunk) => {
          protocol.buffer += chunk;
          const lines = protocol.buffer.split("\n");
          protocol.buffer = lines.pop();
          for (const line of lines) {
            if (!line) continue;
            try { protocol.records.push(JSON.parse(line)); }
            catch { r.error ??= new Error(`unexpected RPC stdout record: ${line}`); firstError ??= r.error; }
          }
          const settledTurns = protocol.records.filter((x) => x.type === "agent_settled").length;
          if (settledTurns === 1 && !protocol.keylessModelRequested) {
            protocol.keylessModelRequested = true;
            child.stdin.write(`${JSON.stringify({ id: "keyless-model-1", type: "set_model", provider: "pi-users-smoke-keyless", modelId: "synthetic-keyless-model" })}\n`);
          }
          if (protocol.records.some((x) => x.type === "response" && x.id === "keyless-model-1" && x.success) && !protocol.keylessPromptRequested) {
            protocol.keylessPromptRequested = true;
            child.stdin.write(`${JSON.stringify({ id: "keyless-prompt-1", type: "prompt", message: "keyless RPC request" })}\n`);
          }
          if (settledTurns === 2 && !protocol.ended) { protocol.ended = true; child.stdin.end(); }
        });
        child.stdin.write(`${JSON.stringify({ id: "state-1", type: "get_state" })}\n`);
        child.stdin.write(`${JSON.stringify({ id: "prompt-1", type: "prompt", message: "synthetic RPC request" })}\n`);
      } else if (!cliPhase && !scheduledPhase) child.stdin.end(); // CLI/scheduled need no input/EOF: pipes close only on natural worker exit.
      r.wait = bounded(r.done, 60_000, `runtime worker ${p.id} timed out`).then(async () => {
        if (cliPhase) await bounded(Promise.all([r.cliFinalization, r.cliDisconnect, r.pipesClosed]), 2_000, "CLI worker finalization receipt/disconnect/pipes");
        else await bounded(r.pipesClosed, 2_000, scheduledPhase ? "scheduled worker pipes" : memoryPhase ? "memory worker pipes" : "runtime worker pipes");
        if (r.error || r.code !== 0 || r.signal || !r.stdinClosed || !r.stdoutClosed || !r.stderrClosed) throw r.error ?? new Error(`runtime worker ${p.id} exit=${r.code} signal=${r.signal ?? "none"} stdinClosed=${r.stdinClosed} stdoutClosed=${r.stdoutClosed} stderrClosed=${r.stderrClosed}\n${r.stderr}`);
        if (cliPhase) {
          assert.equal(r.cliFinalized, true, "parent received actual managed-close finalization before worker exit");
          assert.equal(r.cliIpcDisconnected, true, "parent observed the worker-owned IPC channel disconnect");
          assert.deepEqual(r.cliFinalizationReceipt, {
            type: "cli-no-more-managed-children-finalization", nonce: RUN_KEY, id: p.id, managed: "closed", code: 0, signal: null, outcome: "success",
          });
          assert.ok(r.stderr.includes(`CLI_MANAGED_HANDLE profile=${p.id} pid=`));
          assert.ok(r.stderr.includes("stdio=inherit streams=null workerPipes=3"));
          assert.ok(r.stderr.includes(`CLI_PARENT_CLOSE profile=${p.id} managedClosed=true drained=0 counters=0`));
          assert.ok(r.stderr.includes(`CLI_CHILD_DISPOSAL profile=${p.id} hostDisposed=true settingsFlushed=true identities=true selectedTokenOnly=true drained={"pending":0,"descriptors":0} counters={"protected":0,"network":0,"child":0,"outside":0,"keyring":0}`));
          assert.ok(r.stderr.includes(`CLI_CHILD_NATURAL_EXIT profile=${p.id} disposals=`));
          assert.ok(r.stdout.includes("synthetic mode response"), "actual CLI public SDK print output");
          assert.ok(r.stderr.includes(`MODE_TRANSPORT {"provider":"openai","apiKey":"synthetic-${p.id}"}`));
          if (mode === "json") {
            const events = r.stdout.split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line));
            assert.ok(events.length > 0, "actual CLI JSON output contains native events only");
          }
          assert.equal((r.stdout + r.stderr).includes(`synthetic-${other.id}`), false);
          return;
        }
        if (scheduledPhase) {
          assert.ok(r.stdout.includes(`SCHEDULED_NATIVE profile=${p.id} jobs=1 nativeStreamCalls=1 selectedTokens=1 storeReload=success runCount=1 disabled=true identities=true sdkDispose=1 settingsFlushed=true gitInitCompleted=1 gitPruneCompleted=1 drained=0 counters=0 catalogAuthPreserved=true`));
          assert.equal(r.stdout.split(/\r?\n/).filter((line) => line === `MODE_TRANSPORT {"provider":"openai","apiKey":"synthetic-${p.id}"}`).length, 1);
          assert.equal((r.stdout + r.stderr).includes(`synthetic-${other.id}`), false);
          assert.ok(r.stderr.includes(`BOOTSTRAP_RECEIPT profile=${p.id} disposed=true drained={"pending":0,"descriptors":0} counters={"protected":0,"network":0,"child":0,"outside":0,"keyring":0}`));
          return;
        }
        if (memoryPhase) {
          assert.ok(r.stdout.includes(`MEMORY_DIRECT_CONSUMERS profile=${p.id} observer=complete compactor=detached-prepared nativeCompleteCalls=2 selectedTokens=2 catalogPreserved=true authBytesPreserved=true scheduler=closed publication=not-run`));
          const negativeB = p.id === "account-b" ? "native-auth-error-before-provider-stream" : "not-applicable";
          const expectedCompleteCalls = p.id === "account-b" ? 9 : 8;
          assert.ok(r.stdout.includes(`MEMORY_DEFAULT_FALLBACK profile=${p.id} defaultObserver=openai-codex/gpt-6-luna/default-medium defaultCompactor=openai-codex/gpt-6-luna/default-medium scheduler=closed order=openai-codex/gpt-6-luna,openai-codex/gpt-6-luna,anthropic/claude-sonnet-5,openai-codex/gpt-6-luna nativeCompleteCalls=${expectedCompleteCalls} nativeTokens=6 negativeB=${negativeB} hostDisposed=true settingsFlushed=true drained={"pending":0,"descriptors":0} counters={"protected":0,"network":0,"child":0,"outside":0,"keyring":0} catalogPreserved=true authBytesPreserved=true publication=not-run`), "owner-specific default OAuth/fallback proof follows actual disposal and strict drain");
          assert.ok(r.stdout.split("\n").some((line) => line === `MODE_TRANSPORT {"provider":"openai","apiKey":"synthetic-${p.id}"}`));
          const nativeLines = r.stdout.split("\n").filter((line) => line.startsWith("MEMORY_NATIVE_TRANSPORT "));
          assert.equal(nativeLines.filter((line) => line === `MEMORY_NATIVE_TRANSPORT {"provider":"openai-codex","model":"gpt-6-luna","apiKey":"synthetic-codex-${p.id}"}`).length, 5);
          const anthropicToken = p.id === "account-a" ? "synthetic-corporate-poison-account-a" : `synthetic-anthropic-${p.id}`;
          assert.equal(nativeLines.filter((line) => line === `MEMORY_NATIVE_TRANSPORT {"provider":"anthropic","model":"claude-sonnet-5","apiKey":"${anthropicToken}"}`).length, 1);
          assert.equal((r.stdout + r.stderr).includes(`synthetic-codex-${other.id}`), false, "default/fallback workers never borrow sibling Codex OAuth");
          assert.equal((r.stdout + r.stderr).includes(p.id === "account-b" ? "synthetic-corporate-poison-account-a" : "synthetic-anthropic-account-b"), false, "no other-owner/corporate poison token is exposed");
          assert.equal((r.stdout + r.stderr).includes(`synthetic-${other.id}`), false, "direct consumers never expose sibling OpenAI key");
          return;
        }
        const initialMarker = childPhase && p.id === "account-b" ? "INITIAL_RESUME" : "INITIAL_CREATE";
        assert.ok(r.stderr.includes(`${initialMarker} profile=${p.id} sessionOwned=true cwdOwned=true modelRuntimeIdentity=true`), `${p.id}: genuine native initial create/resume authority observed before replacements`);
        if (phase === "cache") {
          const cacheMarkers = r.stderr.split(/\r?\n/).filter((line) => line.startsWith("NATIVE_CATALOG_CACHE "));
          assert.deepEqual(cacheMarkers, [`NATIVE_CATALOG_CACHE profile=${p.id} cold=persisted warm=restored offline=true owner=${p.id} store=private entry=provider-only`], `${p.id}: exactly one owner-specific native cold/warm cache proof`);
          const removalRefreshMarkers = r.stderr.split(/\r?\n/).filter((line) => line.startsWith("NATIVE_CATALOG_CACHE_REFRESH "));
          assert.deepEqual(removalRefreshMarkers, [`NATIVE_CATALOG_CACHE_REFRESH profile=${p.id} operation=unregister native=true runtimeIdentity=true offline=true awaited=true aborted=false`], `${p.id}: exactly one actual native unregister-refresh completion before disposal`);
          const disposalMarkers = r.stderr.split(/\r?\n/).filter((line) => line.startsWith("CACHE_PHASE_DISPOSAL "));
          assert.deepEqual(disposalMarkers, [`CACHE_PHASE_DISPOSAL profile=${p.id} hostDisposed=true settingsFlushed=true identities=true builtinCatalog=true rawAuthPreserved=true selectedEntryPreserved=true sdkDispatches=0 drained={"pending":0,"descriptors":0} counters={"protected":0,"network":0,"child":0,"outside":0,"keyring":0}`], `${p.id}: exactly one actual runtime disposal receipt`);
          assert.equal((r.stdout + r.stderr).includes(`profile=${other.id}`), false, `${p.id}: cache receipt does not include a sibling owner marker`);
          return;
        }
        if (initialMarker === "INITIAL_RESUME") assert.ok(r.stderr.includes("existingBytesPreserved=true"), "genuine initial resume preserved the exact owned fixture bytes");
        if (p.id === "account-b" && mode === "json") assert.ok(r.stderr.includes("SESSION_ALIAS_DENIALS PASS [\"junction\",\"hardlink\"] metadataOnly=true contentIO=0"), "actual guarded SDK host rejected both synthetic alias forms before effects");
        if (mode === "rpc") {
          assert.equal(protocol.ended, true, "parent ended its owned RPC input after native session settlement");
          assert.ok(protocol.records.some((x) => x.type === "response" && x.id === "state-1" && x.command === "get_state" && x.success && path.resolve(x.data?.sessionFile ?? "").startsWith(path.resolve(ROOT, p.id) + path.sep)), "official RPC returned owned session state");
          assert.ok(protocol.records.some((x) => x.type === "response" && x.id === "prompt-1" && x.command === "prompt" && x.success), "official RPC returned authenticated prompt response");
          assert.ok(protocol.records.some((x) => x.type === "message_end" && x.message?.role === "assistant" && x.message.content?.some((part) => part.text === "synthetic mode response")), "official RPC emitted synthetic authenticated assistant event");
          assert.ok(protocol.records.some((x) => x.type === "response" && x.id === "keyless-model-1" && x.command === "set_model" && x.success), "official RPC accepted the test-only keyless model");
          assert.ok(protocol.records.some((x) => x.type === "response" && x.id === "keyless-prompt-1" && x.command === "prompt" && x.success), "official RPC returned keyless prompt response");
          assert.ok(protocol.records.some((x) => x.type === "message_end" && x.message?.role === "assistant" && x.message.content?.some((part) => part.text === "synthetic keyless response")), "official RPC emitted synthetic keyless assistant event");
          // Native RPC reserves stdout for JSON and redirects normal writes to stderr.
          assert.ok(r.stderr.split("\n").some((line) => line === `MODE_TRANSPORT {"provider":"openai","apiKey":"synthetic-${p.id}"}`), "actual registered runtime transport received only the selected profile token");
          assert.ok(r.stderr.includes(`RPC_DISPOSAL profile=${p.id} hostDisposed=true settingsFlushed=true drained={"pending":0,"descriptors":0}`), "official EOF shutdown disposed and drained the actual host");
        } else if (mode === "interactive") {
          assert.ok(r.stderr.includes(`INTERACTIVE_INPUT profile=${p.id} publicTerminalCallback=true agentSettled=true rendered=true`), "controlled quit followed native session settlement and rendered response");
          assert.ok(r.stderr.includes(`INTERACTIVE_DISPOSAL profile=${p.id} hostDisposed=true settingsFlushed=true drained={\"pending\":0,\"descriptors\":0} counters={\"protected\":0,\"network\":0,\"child\":0,\"outside\":0,\"keyring\":0} terminalStopped=true terminalDrained=true agentSettled=true rendered=true selectedToken=synthetic-${p.id} quitFed=true`), "native interactive shutdown disposed and drained before natural exit");
          assert.ok(r.stdout.includes(`MODE_TRANSPORT {\"provider\":\"openai\",\"apiKey\":\"synthetic-${p.id}\"}`), "actual registered runtime transport received only the selected profile token");
        } else {
          assert.ok(r.stdout.includes(`native-print-mode PASS profile=${p.id} mode=${mode}`));
          assert.ok(r.stdout.includes("synthetic mode response"), "official print mode emitted the synthetic transport response");
          assert.ok(r.stdout.includes(`MODE_TRANSPORT {\"provider\":\"openai\",\"apiKey\":\"synthetic-${p.id}\"}`), "actual registered runtime transport received only the selected profile token");
          if (childPhase) {
            assert.ok(r.stdout.includes(`CHILD_LOADER {"profile":"${p.id}","label":"prepared-runner","token":"synthetic-${p.id}"`), "actual staged child runner completed with this profile's selected token");
            assert.ok(r.stdout.includes(`CHILD_LOADER {"profile":"${p.id}","label":"prepared-runner-extensions-false","token":"synthetic-${p.id}"`), "extensions:false child still dispatched only through this profile's selected runtime");
          }
        }
      }).catch((error) => { firstError ??= error; throw firstError; });
      return r.wait;
    });
    await Promise.all(waits);
    assert.equal(closed(), true, "all registered children AND stdin/stdout/stderr pipes finalized");
    assert.deepEqual(profiles.map((p) => sha(path.join(p.agentDir, "auth.json"))), authHashes, "raw auth fixture hashes unchanged");
    assert.equal(JSON.stringify(Object.entries(process.env).sort()), parentEnvironment);
    assert.equal(os.homedir(), parentHome);
    const current = fs.lstatSync(ROOT);
    assert.equal(fs.realpathSync.native(ROOT), ROOT);
    assert.equal(current.dev, rootIdentity.dev);
    assert.equal(current.ino, rootIdentity.ino);
    assert.equal(current.birthtimeMs, rootIdentity.birthtimeMs);
    const verifyTree = (directory) => {
      assert.equal(fs.realpathSync.native(directory), directory);
      for (const entry of fs.readdirSync(directory)) {
        const file = runOwned(path.join(directory, entry));
        const stat = fs.lstatSync(file);
        assert.equal(stat.isSymbolicLink(), false, "cleanup cannot follow an alias");
        if (stat.isDirectory()) verifyTree(file);
        else { assert.equal(stat.isFile(), true); assert.equal(stat.nlink, 1); }
      }
    };
    for (const fixtures of aliasFixturesById.values()) {
      for (const fixture of fixtures) {
        const alias = runOwned(fixture.kind === "junction" ? fixture.linkPath : fixture.aliasPath);
        const aliasStat = fs.lstatSync(alias);
        assert.equal(aliasStat.isSymbolicLink(), fixture.kind === "junction");
        if (fixture.kind === "hardlink") assert.equal(aliasStat.nlink, 2);
        const target = runOwned(fixture.targetPath);
        const targetBytes = fs.readFileSync(target);
        assert.deepEqual(targetBytes, aliasFixtureBytes.get(target), "alias target fixture bytes stayed unchanged during SDK checks");
        if (fixture.kind === "junction") {
          assert.equal(fs.realpathSync.native(alias), path.dirname(target));
          fs.rmdirSync(alias);
        } else {
          assert.equal(aliasStat.dev, fs.lstatSync(target).dev);
          assert.equal(aliasStat.ino, fs.lstatSync(target).ino);
          fs.unlinkSync(alias);
        }
        assert.deepEqual(fs.readFileSync(target), targetBytes);
        assert.equal(fs.lstatSync(target).nlink, 1);
      }
    }
    verifyTree(ROOT);
    if (memoryPhase) {
      assert.equal(records.length, 2);
      assert.deepEqual(records.map(({ id }) => id), ["account-a", "account-b"]);
      assert.equal(records.every((record) => record.closed && record.stdinClosed && record.stdoutClosed && record.stderrClosed), true);
      process.stdout.write("MEMORY_PARENT_PROOF workers=2 sequential=true pipes=6 rawAuthHashes=unchanged parentEnvHome=unchanged rootIdentity=true aliasFreeTree=true workerDisposeFlushDrainGuards=verified beforeOwnedCleanup=true\n");
    }
    for (const record of records) {
      const diagnosticLines = record.stderr.split("\n").filter((line) => /^(CLI_|NATIVE_CATALOG_CACHE|CACHE_PHASE_DISPOSAL|SDK_TIMING|SDK_BOUNDARY|BOOTSTRAP_TIMING|SESSION_ALIAS_DENIALS|REPLACEMENT_|INTERACTIVE_|INITIAL_)/.test(line));
      if (diagnosticLines.length) process.stderr.write(diagnosticLines.join("\n") + "\n");
    }
    process.stdout.write(records.map((r) => r.stdout.trim()).join("\n") + `\nNATIVE_PROCESS_CLOSE phase=${phase} all=2 pipes=6 authHashes=unchanged parentEnv/Home=unchanged\n`);
    cleanupStarted = true;
    fs.rmSync(ROOT, { recursive: true, force: false });
    assert.equal(fs.existsSync(ROOT), false);
    process.stdout.write(`${scheduledPhase ? "scheduled-native" : cliPhase ? "guarded-cli" : memoryPhase ? "memory-default-fallback" : cachePhase ? "catalog-cache" : interactivePhase ? "native-interactive" : "native-rpc-and-json"} PASS phase=${phase} cleaned=${ROOT}; full task07 UNVERIFIED\n`);
    if (!cliPhase && !childPhase && !interactivePhase && !memoryPhase && !scheduledPhase && !cachePhase) await parent({ childPhase: true });
    else if (childPhase) await parent({ interactivePhase: true });
    else if (interactivePhase) await parent({ cachePhase: true });
  } catch (error) {
    firstError ??= error;
    const termination = cleanupStarted ? [] : await stopOwned();
    const failureCleaned = closed() && termination.length === 0;
    if (failureCleaned) {
      fs.rmSync(ROOT, { recursive: true, force: false });
      assert.equal(fs.existsSync(ROOT), false);
    }
    process.stderr.write(`FIRST_ERROR\n${firstError.stack ?? firstError}\n`);
    for (const r of records) process.stderr.write(`WORKER ${r.id} closed=${r.closed} stdinClosed=${r.stdinClosed} stdoutClosed=${r.stdoutClosed} stderrClosed=${r.stderrClosed}\n${r.stdout}\n${r.stderr}\n`);
    const finalizationUnknown = termination.some((message) => message.startsWith("OWNED_FINALIZATION_UNKNOWN"));
    process.stderr.write(`${finalizationUnknown ? "OWNED_FINALIZATION_UNKNOWN" : "OWNED_FINALIZATION"} ${JSON.stringify(termination)} allClosed=${closed()}\n${cleanupStarted ? "INCIDENT_CLEANUP_AMBIGUOUS" : failureCleaned ? "SANDBOX_CLEANED" : "SANDBOX_PRESERVED"} ${ROOT}\n`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  if (process.argv[2] === "--worker") await worker(process.argv[3], process.argv[4], process.argv[5], process.argv[6], process.argv[7], process.argv[8], process.argv[9], process.argv[10], process.argv[11], process.argv[12], JSON.parse(process.argv[13]), process.argv[14]);
  else if (process.argv[2] === "--cli-worker") await cliWorker(process.argv[3], process.argv[4], process.argv[5]);
  else if (process.argv[2] === "--cli-only") await parent({ cliPhase: true });
  else if (process.argv[2] === "--memory-only") await parent({ memoryPhase: true });
  else if (process.argv[2] === "--scheduled-only") await parent({ scheduledPhase: true });
  else await parent();
}
