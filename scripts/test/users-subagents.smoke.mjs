import assert from "node:assert/strict";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import net from "node:net";
import tls from "node:tls";
import dns from "node:dns";
import dgram from "node:dgram";
import http from "node:http";
import https from "node:https";
import childProcess from "node:child_process";
import Module, { createRequire, syncBuiltinESMExports } from "node:module";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createSandbox } from "./lib/users-sandbox.mjs";
import { registerUser } from "../users/registry.mjs";
import { assertOwnedSession, assertOwnedWorkspace } from "../users/ownership.mjs";
import { PACKAGE_NAME, PACKAGE_VERSION, stageSubagentsProfileCompatibility } from "../compat/subagents-users.mjs";
import { createAdmittedSettingsManager } from "../users/settings.mjs";
import { buildAdmittedLoaderOptions } from "../users/resources.mjs";

const SDK_ROOT = process.env.SDK_140_ROOT ?? process.env.PI_SDK_ROOT;
const LIVE_SOURCE = process.env.PI_SUBAGENTS_ROOT;
assert.ok(SDK_ROOT && path.isAbsolute(SDK_ROOT), "PI_SDK_ROOT or SDK_140_ROOT must explicitly name the canonical SDK 1.4 package root");
assert.ok(LIVE_SOURCE && path.isAbsolute(LIVE_SOURCE), "PI_SUBAGENTS_ROOT must explicitly name the canonical pi-subagents source root");
assert.equal(fs.realpathSync.native(SDK_ROOT), path.resolve(SDK_ROOT), "SDK source root must be canonical");
assert.equal(fs.realpathSync.native(LIVE_SOURCE), path.resolve(LIVE_SOURCE), "pi-subagents source root must be canonical");
const sdk = path.join(SDK_ROOT, "dist/core/sdk.d.ts");
const script = fileURLToPath(import.meta.url);
const required = ["src/agent-runner.ts", "src/agent-manager.ts", "src/index.ts", "src/memory.ts", "src/output-file.ts", "src/schedule-store.ts", "src/custom-agents.ts"];
let commonAgentRoot;
const commonAgentEvents = [];
const poisonResourcePaths = new Set();
const poisonResourceReads = [];
function installResourceGuards(runRoot) {
  const root = fs.realpathSync.native(runRoot);
  assert.equal(root, path.resolve(runRoot), "run root must be canonical");
  const sdkDeclaredRoot = path.resolve(SDK_ROOT);
  const declaredCodeRoots = [path.resolve(path.dirname(script), ".."), path.resolve(path.dirname(script), "../../agents"), sdkDeclaredRoot, ...["pi-agent-core", "pi-tui", "pi-ai"].map((name) => path.join(sdkDeclaredRoot, "node_modules", "@earendil-works", name)), path.resolve(LIVE_SOURCE)];
  const codeRoots = [...new Set([...declaredCodeRoots, ...declaredCodeRoots.map((code) => fs.realpathSync.native(code))])];
  const liveSubRoots = [path.resolve(LIVE_SOURCE), fs.realpathSync.native(LIVE_SOURCE)];
  const sdkSubRoots = [declaredCodeRoots[2], fs.realpathSync.native(declaredCodeRoots[2])];
  const sdkRoot = fs.realpathSync.native(declaredCodeRoots[2]);
  const protectedRoots = [path.join(originalEnv.HOME ?? os.homedir(), ".pi"), path.join(originalEnv.HOME ?? os.homedir(), ".agents"), path.resolve(path.dirname(script), "../../.pi")];
  const inside = (base, candidate) => { const rel = path.relative(base, candidate); return rel === "" || (rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel)); };
  const attempts = { protected: 0, network: 0, child: 0, outside: 0, keyring: 0 };
  const outsideDetails = [];
  const denyOutside = (method, target, reason) => { attempts.outside++; if (outsideDetails.length < 20) outsideDetails.push({ method, target, reason }); };
  const descriptors = new Map();
  const originals = [];
  const rawLstat = fs.lstatSync;
  const rawRealpath = fs.realpathSync.native;
  const markerPaths = new Set();
  const missingCodeProbes = new Set(["agent/dist/index.js", "tui/dist/index.js", "ai/dist/compat.js", "ai/dist/oauth.js", "ai/dist/providers/all.js"].map((relative) => path.join(sdkRoot, "node_modules", "@earendil-works", ...relative.split("/"))));
  for (let dir = path.dirname(root); ; dir = path.dirname(dir)) {
    for (const marker of [".pi", path.join(".pi", "memory"), ".agents", "AGENTS.md", "CLAUDE.md"]) markerPaths.add(path.resolve(dir, marker));
    if (path.dirname(dir) === dir) break;
  }
  for (const marker of markerPaths) if (inside(root, marker) || codeRoots.some((code) => inside(code, marker))) throw new Error("synthetic ancestor marker scope is ambiguous");
  const absent = Symbol("synthetic absent");
  const check = (value, method, args = [], pathIndex = 0) => {
    if (typeof value === "number") value = descriptors.get(value);
    const raw = value instanceof URL ? fileURLToPath(value) : Buffer.isBuffer(value) ? value.toString() : value;
    if (typeof raw !== "string") { denyOutside(method, "[untracked]", "untracked filesystem descriptor"); throw new Error("untracked filesystem descriptor"); }
    const target = path.resolve(raw.startsWith("file:") ? fileURLToPath(new URL(raw)) : raw);
    const base = method.replace(/Sync$/, "");
    if (commonAgentRoot && (base === "readdir" || base === "readFile") && inside(commonAgentRoot, target)) commonAgentEvents.push("read");
    if (poisonResourcePaths.has(target) && /^(open|readFile|read|readv|createReadStream)$/.test(base)) poisonResourceReads.push(target);
    if (missingCodeProbes.has(target) && /^(lstat|stat|exists|realpath)$/.test(base)) return absent;
    if (markerPaths.has(target)) {
      if (/^(lstat|stat|exists|realpath)$/.test(base)) return absent;
      denyOutside(method, target, "ancestor content access denied"); throw new Error(`ancestor content access denied: ${method} ${target}`);
    }
    const flags = base === "open" ? args[1] : args[1]?.flags;
    const mutating = /^(appendFile|chmod|chown|copyFile|cp|createWriteStream|fchmod|fchown|ftruncate|futimes|link|mkdir|mkdtemp|rename|rm|rmdir|symlink|truncate|unlink|utimes|lutimes|write|writeFile|writev)$/.test(base) || (base === "open" && (typeof flags === "string" ? /[wa+]/.test(flags) : typeof flags === "number" && (flags & (fs.constants.O_WRONLY | fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_APPEND)) !== 0));
    const write = mutating && !(["copyFile", "cp"].includes(base) && pathIndex === 0);
    if (protectedRoots.some((protectedRoot) => inside(protectedRoot, target) || (write && inside(target, protectedRoot)))) {
      if (!((liveSubRoots.some((source) => inside(source, target)) || sdkSubRoots.some((source) => inside(source, target))) && !write)) { attempts.protected++; throw new Error(`protected host path denied: ${method} ${target}`); }
    }
    const readCode = !write && codeRoots.some((code) => inside(code, target)) && (!protectedRoots.some((protectedRoot) => inside(protectedRoot, target)) || liveSubRoots.some((source) => inside(source, target)) || sdkSubRoots.some((source) => inside(source, target)));
    if (!inside(root, target) && !readCode) { denyOutside(method, target, "filesystem access outside run root or read-only CODE"); throw new Error(`filesystem access outside run root or read-only CODE: ${method} ${target}`); }
    try {
      const targetStat = rawLstat(target);
      if (targetStat.isSymbolicLink() || (targetStat.isFile() && targetStat.nlink > 1)) { denyOutside(method, target, "filesystem alias denied"); throw new Error(`filesystem alias denied: ${method} ${target}`); }
    } catch (error) { if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error; }
    let existing = target;
    for (;;) { try { rawLstat(existing); break; } catch (error) { if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error; const parent = path.dirname(existing); if (parent === existing) { denyOutside(method, target, "filesystem root escaped authorized paths"); throw error; } existing = parent; } }
    const resolved = path.resolve(rawRealpath(existing), path.relative(existing, target));
    if (!inside(root, resolved) && !(readCode && codeRoots.some((code) => inside(code, resolved)))) { denyOutside(method, target, `filesystem alias escaped authorized roots -> ${resolved}`); throw new Error(`filesystem alias escaped authorized roots: ${method} ${target} -> ${resolved}`); }
    return undefined;
  };
  const patch = (object, name, indexes) => {
    const original = object?.[name]; if (typeof original !== "function") return;
    const guarded = function (...args) {
      let synthetic;
      for (const index of indexes) if (index < args.length) { const result = check(args[index], name, args, index); if (result === absent) synthetic = absent; }
      if (synthetic === absent) {
        if (name.startsWith("exists")) return false;
        const error = Object.assign(new Error("ENOENT"), { code: "ENOENT" }); throw error;
      }
      if (name === "open" && typeof args.at(-1) === "function") { const callback = args.at(-1); args[args.length - 1] = (error, fd, ...rest) => { if (!error) descriptors.set(fd, args[0]); callback(error, fd, ...rest); }; }
      const result = original.apply(this, args);
      if (name === "openSync" && typeof result === "number") descriptors.set(result, args[0]);
      if (name === "open" && result?.then) return result.then((handle) => { descriptors.set(handle.fd, args[0]); for (const method of ["read", "readFile", "readv", "write", "writeFile", "writev", "stat", "truncate"]) { const fn = handle[method]; if (typeof fn === "function") handle[method] = function (...values) { check(handle.fd, method, values); return fn.apply(this, values); }; } return handle; });
      return result;
    };
    if (original.native) guarded.native = (...args) => { for (const index of indexes) check(args[index], `${name}.native`, args); return original.native.apply(original, args); };
    object[name] = guarded; originals.push(() => { object[name] = original; });
  };
  const paths = { access:[0], appendFile:[0], chmod:[0], chown:[0], copyFile:[0,1], link:[0,1], cp:[0,1], createReadStream:[0], createWriteStream:[0], exists:[0], lstat:[0], mkdir:[0], mkdtemp:[0], open:[0], opendir:[0], readFile:[0], readdir:[0], readlink:[0], realpath:[0], rename:[0,1], rm:[0], rmdir:[0], stat:[0], symlink:[0,1], truncate:[0], unlink:[0], utimes:[0], lutimes:[0], writeFile:[0] };
  try {
    for (const [name, indexes] of Object.entries(paths)) { patch(fs, `${name}Sync`, indexes); patch(fs, name, indexes); patch(fsPromises, name, indexes); }
  const originalLoad = Module._load;
  Module._load = function (request, ...args) {
    if (typeof request === "string" && /(?:keytar|keyring|keychain|credential-storage|wincred)/i.test(request)) { attempts.keyring++; throw new Error("OS keyring access denied"); }
    return originalLoad.call(this, request, ...args);
  };
  originals.push(() => { Module._load = originalLoad; });
  const graceful = createRequire(path.join(sdkRoot, "dist/core/package-manager.js"))("graceful-fs");
  for (const surface of [graceful, graceful.promises]) for (const [name, indexes] of Object.entries(paths)) { const method = surface === graceful ? `${name}Sync` : name; patch(surface, method, indexes); }
  for (const surface of [fs, graceful]) for (const name of ["fstat", "fstatSync", "ftruncate", "ftruncateSync", "read", "readSync", "readv", "readvSync", "write", "writeSync", "writev", "writevSync", "fsync", "fsyncSync"]) patch(surface, name, [0]);
  for (const name of ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"]) { const original = childProcess[name]; childProcess[name] = () => { attempts.child++; throw new Error("child process denied"); }; originals.push(() => { childProcess[name] = original; }); }
  const denyNetworkCall = (object, name) => { const original = object?.[name]; if (typeof original !== "function") return; object[name] = () => { attempts.network++; throw new Error("network denied"); }; originals.push(() => { object[name] = original; }); };
  for (const [object, name] of [[net, "connect"], [net, "createConnection"], [net.Socket.prototype, "connect"], [net.Server.prototype, "listen"], [tls, "connect"], [tls.TLSSocket.prototype, "connect"], [dgram.Socket.prototype, "connect"], [dgram.Socket.prototype, "send"], [dgram.Socket.prototype, "bind"], [http, "request"], [http, "get"], [https, "request"], [https, "get"], [globalThis, "fetch"]]) denyNetworkCall(object, name);
  for (const name of ["lookup", "lookupService", "resolve", "resolve4", "resolve6", "resolveAny", "resolveCaa", "resolveCname", "resolveMx", "resolveNaptr", "resolveNs", "resolvePtr", "resolveSoa", "resolveSrv", "resolveTxt", "reverse"]) { denyNetworkCall(dns, name); denyNetworkCall(dns.promises, name); denyNetworkCall(dns.Resolver.prototype, name); }
  syncBuiltinESMExports();
  return { attempts, outsideDetails, restore() { for (const restore of originals.reverse()) restore(); syncBuiltinESMExports(); } };
  } catch (error) {
    for (const restore of originals.reverse()) restore();
    syncBuiltinESMExports();
    throw error;
  }
}
const sandbox = createSandbox("subagents");
const originalEnv = { ...process.env };
for (const key of Object.keys(process.env)) delete process.env[key];
Object.assign(process.env, sandbox.env);
assert.deepEqual(Object.keys(process.env).sort(), Object.keys(sandbox.env).sort(), "SDK imports start from a clean explicit environment allowlist");
assert.equal(process.env.NODE_OPTIONS, undefined);
assert.equal(process.env.NODE_PATH, undefined);
assert.equal(path.resolve(os.homedir()), path.resolve(sandbox.dirs.home), "SDK imports must use the selected synthetic home");
let resourceGuards;
try {
  resourceGuards = installResourceGuards(sandbox.root);
  sandbox.write(path.join(sandbox.root, "package.json"), JSON.stringify({ name: "pi-users-subagents-smoke", version: "1.0.0", type: "module" }));
  assert.ok(fs.statSync(sdk).isFile(), "public SDK declaration must exist");
  const source = sandbox.mkdir("source", "pkg");
  const sourceFiles = ["package.json", ...required];
  const sourceBytes = new Map(sourceFiles.map((relative) => [relative, fs.readFileSync(path.join(LIVE_SOURCE, relative))]));
  fs.cpSync(LIVE_SOURCE, source, { recursive: true, filter: (p) => !path.relative(LIVE_SOURCE, p).split(path.sep).some((part) => ["node_modules", ".git", "dist"].includes(part)) });
  const staging = sandbox.mkdir("staging");
  const agentDir = sandbox.mkdir("home", ".pi", "agent");
  const sessionRoot = sandbox.mkdir("home", ".pi", "sessions");
  const repo = sandbox.mkdir("workspaces", "repo");
  const commonGit = sandbox.mkdir("workspaces", "repo", ".git");
  const sharedRoot = sandbox.mkdir("shared");
  const commonAgents = sandbox.mkdir("shared", "agents");
  const owner = registerUser({ registryPath: sandbox.dir("registry", "users.json"), id: "kevin", label: "Kevin synthetic", agentDir, sessionRoots: [sessionRoot], workspaces: [repo], sharedAssets: [sharedRoot] });
  const agentDirB = sandbox.mkdir("home-b", ".pi", "agent");
  const sessionRootB = sandbox.mkdir("home-b", ".pi", "sessions");
  const repoB = sandbox.mkdir("workspaces", "repo-b");
  const ownerB = registerUser({ registryPath: owner.registryPath, id: "sanvera", label: "Sanvera synthetic", agentDir: agentDirB, sessionRoots: [sessionRootB], workspaces: [repoB], sharedAssets: [sharedRoot] });
  const ownedExtension = path.join(agentDir, "child-owned.mjs");
  const sharedExtension = path.join(sharedRoot, "child-common.mjs");
  sandbox.write(ownedExtension, "export default function () { globalThis.__childOwnedFactory++; }\n");
  sandbox.write(sharedExtension, "export default function () { globalThis.__childSharedFactory++; }\n");
  sandbox.write(path.join(agentDir, "settings.json"), JSON.stringify({ extensions: [ownedExtension, sharedExtension] }));
  const profile = owner;
  process.env.PI_CODING_AGENT_SESSION_DIR = sessionRoot;
  const commonAuthority = path.resolve(path.dirname(script), "../../agents");
  const commonAuthorityFiles = fs.readdirSync(commonAuthority).filter((name) => name.endsWith(".md"));
  const commonAuthorityBytes = new Map(commonAuthorityFiles.map((name) => [name, fs.readFileSync(path.join(commonAuthority, name))]));
  for (const file of commonAuthorityFiles) fs.copyFileSync(path.join(commonAuthority, file), path.join(commonAgents, file));
  const staged = stageSubagentsProfileCompatibility(source, staging, { profile });
  assert.equal(path.resolve(staged.entry), path.join(staging, "pi-subagents-0.18.2-users", "src", "index.ts"));
  assert.equal(Object.isFrozen(staged), true);
  const stagedDiscovery = fs.readFileSync(path.join(staged.packageRoot, "src/custom-agents.ts"), "utf8");
  assert.ok(stagedDiscovery.indexOf('admitUserResources({ resource: "pi-subagents-agents"') < stagedDiscovery.indexOf("loadFromDir(commonDir"), "common source admission precedes directory ingestion");
  assert.ok(stagedDiscovery.indexOf("loadFromDir(commonDir") < stagedDiscovery.indexOf('loadFromDir(globalDir, agents, "global", strict)'), "common defaults precede private global overrides");
  const transformedRunner = fs.readFileSync(path.join(staged.packageRoot, "src/agent-runner.ts"), "utf8");
  assert.ok(transformedRunner.indexOf('resource: "pi-subagents-loader"') < transformedRunner.indexOf("detectEnv(options.pi, effectiveCwd)"), "child binding precedes env/preload/loader ingestion");
  assert.ok(transformedRunner.includes("childResourceBinding.settingsManager") && transformedRunner.includes("childResourceBinding.resourceLoaderOptions"), "same binding feeds session and native child loader");
  const metadata = JSON.parse(fs.readFileSync(path.join(staged.packageRoot, "package.json"), "utf8"));
  assert.equal(metadata.name, PACKAGE_NAME);
  assert.equal(metadata.version, PACKAGE_VERSION);
  for (const relative of required) {
    assert.ok(fs.statSync(path.join(staged.packageRoot, relative)).isFile(), `missing staged ${relative}`);
    const text = fs.readFileSync(path.join(staged.packageRoot, relative), "utf8");
    assert.match(text, /pi\.users\.context/);
  }
  const runner = fs.readFileSync(path.join(staged.packageRoot, "src/agent-runner.ts"), "utf8");
  assert.ok(runner.indexOf("usersWorkspace(effectiveCwd)") < runner.indexOf("detectEnv(options.pi, effectiveCwd)"), "ownership must precede environment/config ingestion");
  assert.ok(runner.indexOf("usersSession(options.resumeSessionFile, effectiveCwd)") < runner.indexOf("detectEnv(options.pi, effectiveCwd)"), "resume ownership must precede session ingestion");
  assert.match(runner, /usersContext\.modelRuntime/);
  const manager = fs.readFileSync(path.join(staged.packageRoot, "src/agent-manager.ts"), "utf8");
  assert.ok(manager.indexOf("usersWorkspace(baseCwd)") < manager.indexOf("createWorktree(baseCwd, id)"), "base ownership must precede worktree creation");
  const output = fs.readFileSync(path.join(staged.packageRoot, "src/output-file.ts"), "utf8");
  assert.match(output, /\.pi", "subagent-output"/);
  assert.match(output, /usersManaged \? join\(owned\.workspaceRoot, "\.pi", "subagent-output"\) : join\(tmpdir\(\)/);

  // Execute the exact staged receipt/ownership prelude in a fresh VM context. No extension,
  // session, provider, or real Git code is loaded by this smoke.
  const prefix = fs.readFileSync(path.join(staged.packageRoot, "src/index.ts"), "utf8").split("/**")[0].replace('import * as usersPath from "node:path";', '');
  const executeGuard = (descriptor, marker = undefined) => {
    const calls = { workspace: 0, session: 0, admission: 0 };
    const runtime = Object.freeze({ realParentRuntime: true });
    const profileForVm = Object.freeze({ id: owner.id, agentDir: owner.agentDir });
    const receipt = Object.freeze({
      profile: profileForVm, modelRuntime: runtime,
      assertOwnedWorkspace(cwd) { calls.workspace++; return assertOwnedWorkspace(owner, cwd); },
      assertOwnedSession(request) { calls.session++; return assertOwnedSession(owner, request); },
      admitUserResources() { calls.admission++; },
    });
    const context = { process: { env: marker === undefined ? {} : { PI_USER_ID: marker } }, globalThis: null, Object, Symbol, Error, console, usersPath: path, runtime, calls };
    context.globalThis = context;
    if (descriptor) Object.defineProperty(context, Symbol.for("pi.users.context"), descriptor(receipt));
    vm.runInNewContext(`${prefix}\nglobalThis.__guard = { usersManaged, usersContext, usersWorkspace, usersSession };`, context);
    return { context, calls, receipt, runtime };
  };
  const good = executeGuard((value) => ({ value, writable: false, configurable: false }), "kevin");
  const outside = sandbox.mkdir("detached", "copy");
  const subdir = sandbox.mkdir("detached", "copy", "nested");
  const gitdir = sandbox.mkdir("workspaces", "repo", ".git", "worktrees", "copy");
  const worktreeDotGit = path.join(outside, ".git");
  fs.writeFileSync(worktreeDotGit, `gitdir: ${gitdir}\n`);
  fs.writeFileSync(path.join(gitdir, "commondir"), "../..\n");
  fs.writeFileSync(path.join(gitdir, "gitdir"), `${worktreeDotGit}\n`);
  const positives = good.context.__guard.usersWorkspace(outside);
  assert.equal(positives.workspaceRoot, outside);
  assert.equal(positives.worktreeOrigin, repo);
  const copied = good.context.__guard.usersWorkspace(subdir);
  assert.equal(copied.workspaceRoot, outside, "copied-subdir cwd must use derived worktree root");
  assert.equal(good.calls.workspace, 2);
  assert.throws(() => good.context.__guard.usersWorkspace(sandbox.dir("alien", "forged-workspace")), /WORKSPACE|OWNED|UNDECIDABLE/);
  assert.equal(good.calls.admission, 2, "alien cwd must fail before resource admission");
  const forged = sandbox.mkdir("detached", "forged");
  fs.writeFileSync(path.join(forged, ".git"), `gitdir: ${gitdir}\n`);
  assert.throws(() => good.context.__guard.usersWorkspace(forged), /WORKTREE_ORIGIN_UNDECIDABLE/);
  good.context.__guard.usersSession(path.join(sessionRoot, "synthetic-session.json"), outside);
  assert.equal(good.calls.session, 1);
  assert.equal(good.context.__guard.usersContext.modelRuntime, good.runtime, "parent modelRuntime identity must be preserved");

  let getterReads = 0;
  assert.throws(() => executeGuard((value) => ({ get() { getterReads++; return value; }, configurable: true }), "kevin"), /valid matching users receipt/);
  assert.equal(getterReads, 0, "receipt accessor must not be invoked");
  assert.throws(() => executeGuard(undefined, "kevin"), /valid matching users receipt/);
  assert.throws(() => executeGuard((value) => ({ value, writable: true, configurable: false }), "kevin"), /valid matching users receipt/);
  assert.throws(() => executeGuard((value) => ({ value, writable: false, configurable: false }), "alien"), /valid matching users receipt/);

  // Version mismatch must fail before any final or temporary publication.
  const badSource = sandbox.mkdir("source", "bad");
  fs.cpSync(source, badSource, { recursive: true });
  const badMetaPath = path.join(badSource, "package.json");
  const badMeta = JSON.parse(fs.readFileSync(badMetaPath, "utf8"));
  badMeta.version = "0.0.0";
  fs.writeFileSync(badMetaPath, JSON.stringify(badMeta));
  const badStage = sandbox.mkdir("bad-staging");
  assert.throws(() => stageSubagentsProfileCompatibility(badSource, badStage, { profile }), /identity, version, or entry mismatch/);
  assert.deepEqual(fs.readdirSync(badStage), [], "incompatible source must not publish partial staging");
  const badAnchorSource = sandbox.mkdir("source", "bad-anchor");
  fs.cpSync(source, badAnchorSource, { recursive: true });
  const badCustomAgents = path.join(badAnchorSource, "src", "custom-agents.ts");
  fs.writeFileSync(badCustomAgents, fs.readFileSync(badCustomAgents, "utf8").replace('loadFromDir(globalDir, agents, "global", strict);', 'loadFromDir(globalDir, agents, "project", strict);'));
  const badAnchorStage = sandbox.mkdir("bad-anchor-staging");
  assert.throws(() => stageSubagentsProfileCompatibility(badAnchorSource, badAnchorStage, { profile }), /anchor mismatch/);
  assert.deepEqual(fs.readdirSync(badAnchorStage), [], "anchor mismatch is refused before staging output");
  assert.deepEqual(resourceGuards.attempts, { protected: 0, network: 0, child: 0, outside: 0, keyring: 0 });

  // Runtime-backed state journeys use the transformed modules with an uncached Jiti loader.
  const jitiPath = path.join(SDK_ROOT, "node_modules/jiti/lib/jiti.mjs");
  const { createJiti } = await import(pathToFileURL(jitiPath).href);
  const sdkRuntime = path.join(SDK_ROOT, "dist/index.js");
  assert.ok(fs.statSync(sdkRuntime).isFile(), "public SDK runtime package must exist");
  process.env.PI_USER_ID = owner.id;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  const sdkExports = await import(pathToFileURL(sdkRuntime).href);
  const parentRuntime = await sdkExports.ModelRuntime.create({ authPath: path.join(agentDir, "auth.json"), modelsPath: null, refreshOnCreate: false });
  assert.equal(path.resolve(os.homedir()), path.resolve(sandbox.dirs.home), "public SDK observes the selected synthetic home");
  const bindingRequests = [];
  let bindingEnabled = true;
  let lastBinding;
  const admitFromFixture = (request) => {
    if (request.resource === "pi-subagents-agents") {
      assert.equal(request.userId, owner.id);
      assert.equal(request.root, path.join(sharedRoot, "agents"));
      commonAgentEvents.push("admitted");
      return undefined;
    }
    if (request.resource !== "pi-subagents-loader") return undefined;
    bindingRequests.push(request);
    if (!bindingEnabled) return undefined;
    assert.equal(request.userId, owner.id);
    const selectedSkills = request.frontmatter?.skills;
    if (Array.isArray(selectedSkills) && selectedSkills.some((name) => typeof name !== "string" || !name || path.isAbsolute(name) || /^[a-zA-Z]:/.test(name) || name.startsWith("~") || name.split(/[\\/]+/).some((part) => part === ".."))) throw new Error("unadmitted child skill selector");
    assertOwnedWorkspace(owner, request.cwd);
    assertOwnedWorkspace(owner, request.configCwd);
    const resourceRequest = { cliPaths: request.cliPaths, contextPaths: request.contextPaths, homeDir: request.homeDir };
    const settingsManager = createAdmittedSettingsManager(sdkExports, profile, {
      cwd: request.configCwd, settingsOptions: { projectTrusted: true }, resourceRequest,
    });
    const admitted = buildAdmittedLoaderOptions(profile, {
      cwd: request.configCwd,
      settings: settingsManager.getGlobalSettings(),
      projectSettings: settingsManager.getProjectSettings(),
      cliPaths: request.cliPaths, contextPaths: request.contextPaths, homeDir: request.homeDir,
    });
    lastBinding = Object.freeze({ settingsManager, resourceLoaderOptions: admitted.loaderOptions });
    return lastBinding;
  };
  Object.defineProperty(globalThis, Symbol.for("pi.users.context"), {
    value: Object.freeze({
      profile,
      assertOwnedWorkspace: (cwd) => assertOwnedWorkspace(owner, cwd),
      assertOwnedSession: (request) => assertOwnedSession(owner, request),
      admitUserResources: admitFromFixture,
      modelRuntime: parentRuntime,
    }), writable: false, configurable: false,
  });
  const jiti = createJiti(import.meta.url, { fsCache: false, alias: { "@earendil-works/pi-coding-agent": sdkRuntime } });
  const agentTypesPath = sandbox.dir("discovery-agent-types.js");
  fs.writeFileSync(agentTypesPath, 'export const BUILTIN_TOOL_NAMES=["read","write","edit","bash"];\n');
  const discoveryJiti = createJiti(import.meta.url, { fsCache: false, alias: { "@earendil-works/pi-coding-agent": sdkRuntime, "./agent-types.js": agentTypesPath } });
  const customAgents = await discoveryJiti.import(path.join(staged.packageRoot, "src/custom-agents.ts"));
  commonAgentRoot = commonAgents;
  assert.equal(fs.existsSync(path.join(agentDir, "agents")), false, "profile A global agents root starts empty");
  assert.equal(fs.existsSync(path.join(repo, ".agents", "agents")), false, "profile A workspace agents root starts empty");
  assert.equal(fs.existsSync(path.join(repo, ".pi", "agents")), false, "profile A project agents root starts empty");
  const commonMap = customAgents.loadCustomAgents(repo);
  assert.ok(commonMap.size > 0, "empty private agent root discovers admitted common agents");
  for (const [name, model, thinking] of [
    ["builder-heavy", "openai-codex/gpt-6.1-terra", "xhigh"],
    ["builder", "openai-codex/gpt-6-luna", "high"],
    ["builder-design", "anthropic/claude-sonnet-5-5", "high"],
    ["builder-heavy-design", "anthropic/claude-opus-5-5", "high"],
    ["scout", "openai-codex/gpt-6-luna", "medium"],
  ]) {
    const agent = commonMap.get(name);
    assert.ok(agent, `common routing includes ${name}`);
    assert.equal(agent.model, model);
    assert.equal(agent.thinking, thinking);
    assert.equal(agent.sourcePath, path.join(commonAgents, `${name}.md`));
  }
  assert.ok(commonAgentEvents.indexOf("admitted") >= 0 && commonAgentEvents.indexOf("admitted") < commonAgentEvents.indexOf("read"), "common path admission precedes directory/file reads");
  assert.equal(fs.existsSync(path.join(agentDirB, "agents")), false);
  assert.equal(fs.existsSync(path.join(repoB, ".agents", "agents")), false);
  assert.equal(fs.existsSync(path.join(repoB, ".pi", "agents")), false);
  const bModulePath = sandbox.dir("profile-b-custom-agents.ts");
  const bModuleSource = fs.readFileSync(path.join(staged.packageRoot, "src/custom-agents.ts"), "utf8").replace('const USERS_CONTEXT_KEY = Symbol.for("pi.users.context");', 'const USERS_CONTEXT_KEY = Symbol.for("pi.users.context.profileB");');
  assert.notEqual(bModuleSource, fs.readFileSync(path.join(staged.packageRoot, "src/custom-agents.ts"), "utf8"), "second fixture keeps the same consumer source under a separate immutable receipt key");
  fs.writeFileSync(bModulePath, bModuleSource);
  const bAdmissionEvents = [];
  const bReceipt = Object.freeze({ profile: ownerB, modelRuntime: parentRuntime, assertOwnedWorkspace: (cwd) => assertOwnedWorkspace(ownerB, cwd), assertOwnedSession: (request) => assertOwnedSession(ownerB, request), admitUserResources(request) { assert.equal(request.userId, ownerB.id); assert.equal(request.root, path.join(sharedRoot, "agents")); bAdmissionEvents.push("admitted"); } });
  Object.defineProperty(globalThis, Symbol.for("pi.users.context.profileB"), { value: bReceipt, writable: false, configurable: false });
  const priorUserId = process.env.PI_USER_ID;
  const priorAgentDir = process.env.PI_CODING_AGENT_DIR;
  let commonMapB;
  try {
    process.env.PI_USER_ID = ownerB.id;
    process.env.PI_CODING_AGENT_DIR = agentDirB;
    const customAgentsB = await discoveryJiti.import(bModulePath);
    commonMapB = customAgentsB.loadCustomAgents(repoB);
  } finally {
    if (priorUserId === undefined) delete process.env.PI_USER_ID; else process.env.PI_USER_ID = priorUserId;
    if (priorAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = priorAgentDir;
  }
  const routingSignature = (agents) => [...agents].map(([name, agent]) => [name, agent.model, agent.thinking, agent.builtinToolNames, agent.extSelectors]).sort(([left], [right]) => left.localeCompare(right));
  assert.deepEqual(routingSignature(commonMapB), routingSignature(commonMap), "independent empty private roots discover identical common routing/tool fields");
  assert.equal(bAdmissionEvents[0], "admitted");
  const readsBeforeAmbiguous = commonAgentEvents.filter((event) => event === "read").length;
  const agentDirC = sandbox.mkdir("home-c", ".pi", "agent");
  const sessionRootC = sandbox.mkdir("home-c", ".pi", "sessions");
  const repoC = sandbox.mkdir("workspaces", "repo-c");
  const sharedRootC = sandbox.mkdir("shared-c");
  const ownerC = registerUser({ registryPath: owner.registryPath, id: "evolvera", label: "Evolvera synthetic", agentDir: agentDirC, sessionRoots: [sessionRootC], workspaces: [repoC], sharedAssets: [sharedRoot, sharedRootC] });
  const cModulePath = sandbox.dir("profile-c-custom-agents.ts");
  fs.writeFileSync(cModulePath, fs.readFileSync(path.join(staged.packageRoot, "src/custom-agents.ts"), "utf8").replace('const USERS_CONTEXT_KEY = Symbol.for("pi.users.context");', 'const USERS_CONTEXT_KEY = Symbol.for("pi.users.context.profileC");'));
  let cAdmissions = 0;
  const cReceipt = Object.freeze({ profile: ownerC, modelRuntime: parentRuntime, assertOwnedWorkspace: (cwd) => assertOwnedWorkspace(ownerC, cwd), assertOwnedSession: (request) => assertOwnedSession(ownerC, request), admitUserResources() { cAdmissions++; } });
  Object.defineProperty(globalThis, Symbol.for("pi.users.context.profileC"), { value: cReceipt, writable: false, configurable: false });
  const priorUserIdC = process.env.PI_USER_ID;
  const priorAgentDirC = process.env.PI_CODING_AGENT_DIR;
  try {
    process.env.PI_USER_ID = ownerC.id;
    process.env.PI_CODING_AGENT_DIR = agentDirC;
    const customAgentsC = await discoveryJiti.import(cModulePath);
    assert.throws(() => customAgentsC.loadCustomAgents(repoC), /exactly one canonical shared code root/);
  } finally {
    if (priorUserIdC === undefined) delete process.env.PI_USER_ID; else process.env.PI_USER_ID = priorUserIdC;
    if (priorAgentDirC === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = priorAgentDirC;
  }
  assert.equal(cAdmissions, 0, "ambiguous shared roots fail before resource admission and reads");
  assert.equal(commonAgentEvents.filter((event) => event === "read").length, readsBeforeAmbiguous, "ambiguous roots do not read any common source");
  const unavailableCommon = sandbox.dir("shared", "agents-unavailable");
  const readsBeforeMissing = commonAgentEvents.filter((event) => event === "read").length;
  fs.renameSync(commonAgents, unavailableCommon);
  assert.throws(() => customAgents.loadCustomAgents(repo), /common agents source is unavailable/);
  assert.equal(commonAgentEvents.filter((event) => event === "read").length, readsBeforeMissing, "missing common source fails before directory/file reads");
  fs.renameSync(unavailableCommon, commonAgents);
  sandbox.write(path.join(commonAgents, "priority.md"), "---\nname: priority\nmodel: common/model\nthinking: low\ntools: read\n---\ncommon\n");
  assert.equal(customAgents.loadCustomAgents(repo).get("priority").model, "common/model");
  const privateGlobalAgents = sandbox.mkdir("home", ".pi", "agent", "agents");
  sandbox.write(path.join(privateGlobalAgents, "priority.md"), "---\nname: priority\nmodel: global/model\ntools: read\n---\nglobal\n");
  assert.equal(customAgents.loadCustomAgents(repo).get("priority").model, "global/model");
  const workspaceAgents = sandbox.mkdir("workspaces", "repo", ".agents", "agents");
  sandbox.write(path.join(workspaceAgents, "priority.md"), "---\nname: priority\nmodel: workspace/model\ntools: read\n---\nworkspace\n");
  assert.equal(customAgents.loadCustomAgents(repo).get("priority").model, "workspace/model");
  const projectAgents = sandbox.mkdir("workspaces", "repo", ".pi", "agents");
  sandbox.write(path.join(projectAgents, "priority.md"), "---\nname: priority\nmodel: project/model\ntools: read\n---\nproject\n");
  assert.equal(customAgents.loadCustomAgents(repo).get("priority").model, "project/model");
  const memory = await jiti.import(path.join(staged.packageRoot, "src/memory.ts"));
  const outputModule = await jiti.import(path.join(staged.packageRoot, "src/output-file.ts"));
  const schedule = await jiti.import(path.join(staged.packageRoot, "src/schedule-store.ts"));
  const memoryDir = memory.resolveMemoryDir("general-purpose", "user", outside);
  assert.ok(memoryDir.startsWith(owner.agentDir), "user memory must remain under this profile root");
  assert.doesNotMatch(memoryDir, /agent-memory-local|C:\\\\Users\\\\kevin\\\\AppData/i);
  const transcript = outputModule.createOutputFilePath(subdir, "child-1", "session-1");
  assert.ok(transcript.startsWith(path.join(outside, ".pi", "subagent-output")));
  outputModule.writeInitialEntry(transcript, "child-1", "synthetic prompt", subdir);
  const messages = [{ role: "user", content: "synthetic prompt" }];
  let listener;
  const session = { messages, subscribe(callback) { listener = callback; return () => {}; } };
  const flush = outputModule.streamToOutputFile(session, transcript, "child-1", subdir, 1);
  messages.push({ role: "assistant", content: "before compact" });
  listener({ type: "turn_end" });
  listener({ type: "compaction_start" });
  messages.splice(1, 1, { role: "assistant", content: "compacted summary" });
  listener({ type: "compaction_end", aborted: false, result: {} });
  await new Promise((resolve) => setImmediate(resolve));
  messages.push({ role: "assistant", content: "after compact" });
  listener({ type: "turn_end" });
  flush();
  const transcriptText = fs.readFileSync(transcript, "utf8");
  assert.match(transcriptText, /after compact/, "transcript stream must continue after compaction");
  const storePath = schedule.resolveStorePath(subdir, "session-1");
  assert.ok(storePath.startsWith(path.join(outside, ".pi", "subagent-schedules")));
  const store = new schedule.ScheduleStore(storePath);
  store.add({ id: "scheduled-1", name: "synthetic job" });
  assert.equal(new schedule.ScheduleStore(storePath).get("scheduled-1").name, "synthetic job", "scheduled state must reload from the owned worktree root");

  // The fixture delegates all SDK classes/factories to the installed public SDK; only local SUB helpers are stubbed.
  const fakeRoot = sandbox.mkdir("runner-fixtures");
  const countersPath = path.join(fakeRoot, "counters.mjs");
  fs.writeFileSync(countersPath, `export const calls = { nested: 0 };\n`);
  const stubs = {
    "agent-types.js": `export const BUILTIN_TOOL_NAMES=["read","write","edit","bash"]; const c={name:"general-purpose",extensions:true,skills:false,tools:["read"],builtinToolNames:["read"],allowedSubagents:"all",persistSession:true}; export const getAgentConfig=()=>globalThis.__subagentsConfig||c; export const getConfig=()=>c; export const getMemoryToolNames=()=>[]; export const getReadOnlyMemoryToolNames=()=>[]; export const getToolNamesForType=()=>["read"];`,
    "child-context.js": `export const runInChildSessionContext=(fn)=>fn();`,
    "context.js": `export const buildParentContext=()=>""; export const extractText=(content)=>typeof content==="string"?content:Array.isArray(content)?content.map(x=>x.text||"").join(""):"";`,
    "default-agents.js": `const c={name:"general-purpose",extensions:true,skills:false,tools:["read"],builtinToolNames:["read"],allowedSubagents:"all",persistSession:true}; export const DEFAULT_AGENTS=new Map([["general-purpose",c]]);`,
    "env.js": `export const detectEnv=async()=>({});`,
    "memory.js": `export const buildMemoryBlock=()=>""; export const buildReadOnlyMemoryBlock=()=>"";`,
    "nested-tools.js": `import { calls } from "${pathToFileURL(countersPath).href}"; export const getMaxSubagentDepth=()=>4; export const createNestedSubagentTools=(options)=>{calls.nested++; return [];};`,
    "prompts.js": `export const buildAgentPrompt=()=>"synthetic system prompt";`,
    "skill-loader.js": `export const preloadSkills=()=>{globalThis.__childPreloads=(globalThis.__childPreloads||0)+1; return [];};`,
  };
  const aliases = { "@earendil-works/pi-coding-agent": sdkRuntime };
  for (const [name, contents] of Object.entries(stubs)) {
    const file = path.join(fakeRoot, name);
    fs.writeFileSync(file, contents);
    aliases[`./${name}`] = file;
  }
  const runnerJiti = createJiti(import.meta.url, { fsCache: false, alias: aliases });
  const runnerModule = await runnerJiti.import(path.join(staged.packageRoot, "src/agent-runner.ts"));
  const counters = await runnerJiti.import(countersPath);
  const parentModel = parentRuntime.getModels()[0];
  assert.ok(parentModel, "synthetic clean-env runtime exposes static public models without network");
  const modelRegistry = { runtime: parentRuntime, find: (provider, id) => parentRuntime.getModel(provider, id), getAvailable: () => [parentModel] };
  const fakePi = {};
  const ctx = { cwd: repo, model: parentModel, modelRegistry, getSystemPrompt: () => "parent", sessionManager: { getSessionFile: () => path.join(sessionRoot, "parent.json") } };
  const createdSessions = [];
  const run = (cwd, extra = {}) => runnerModule.runAgent(ctx, "general-purpose", "synthetic task", {
    pi: fakePi, cwd, configCwd: repo, model: ctx.model,
    onSessionCreated(session) {
      createdSessions.push(session);
      Object.defineProperty(session, "prompt", { value: async () => undefined, configurable: true });
    },
    ...extra,
  });
  bindingEnabled = false;
  await assert.rejects(() => run(repo), /profile-bound admitted child settings manager and resource loader/);
  assert.equal(createdSessions.length, 0, "missing admitted binding fails before native session factory");
  bindingEnabled = true;
  globalThis.__childOwnedFactory = 0;
  globalThis.__childSharedFactory = 0;
  let result = await run(repo);
  assert.equal(result.responseText, "", "synthetic prompt is intercepted before any provider request");
  assert.equal(result.session.modelRuntime, parentRuntime, "child receives the exact parent ModelRuntime instance");
  assert.equal(result.session.settingsManager, lastBinding.settingsManager, "session reuses the bound native admitted manager");
  assert.ok(result.session.resourceLoader instanceof sdkExports.DefaultResourceLoader, "child uses the actual public native loader");
  const extensionResult = result.session.resourceLoader.getExtensions();
  assert.ok(globalThis.__childOwnedFactory > 0, `owned extension factory executes through child startup; options=${JSON.stringify(lastBinding.resourceLoaderOptions)} errors=${JSON.stringify(extensionResult.errors)}`);
  assert.ok(globalThis.__childSharedFactory > 0, "shared extension factory executes through child startup");
  const ownedFactoryCount = globalThis.__childOwnedFactory;
  const sharedFactoryCount = globalThis.__childSharedFactory;
  await result.session.resourceLoader.reload();
  assert.ok(globalThis.__childOwnedFactory > ownedFactoryCount, "child reload reuses admitted manager and retains owned resources");
  assert.ok(globalThis.__childSharedFactory > sharedFactoryCount, "child reload retains admitted shared resources");
  const settingsPath = path.join(agentDir, "settings.json");
  const originalSettings = fs.readFileSync(settingsPath);
  const poisonContext = path.join(repo, "AGENTS.md");
  fs.writeFileSync(poisonContext, "FAKE-SECRET: context must not be read by child loader\\n");
  poisonResourcePaths.add(poisonContext);
  try {
    fs.writeFileSync(settingsPath, JSON.stringify({ extensions: [ownedExtension, sharedExtension], packages: ["https://example.invalid/untrusted.tgz", "npm:pi-mcp-adapter"] }));
    const filtered = await run(repo);
    assert.deepEqual(filtered.session.settingsManager.getGlobalSettings().packages, [], "remote and MCP package resources are filtered before native discovery");
    assert.deepEqual(poisonResourceReads, [], "project ancestor context remains no-context and unread");
    assert.equal(resourceGuards.attempts.network, 0, "remote package selectors cause no network fallback");
  } finally {
    fs.writeFileSync(settingsPath, originalSettings);
    poisonResourcePaths.delete(poisonContext);
  }
  const ownedBeforeIsolation = globalThis.__childOwnedFactory;
  const sharedBeforeIsolation = globalThis.__childSharedFactory;
  const isolated = await run(repo, { isolated: true });
  assert.equal(isolated.session.modelRuntime, parentRuntime, "extensions:false isolation still preserves parent runtime");
  assert.equal(globalThis.__childOwnedFactory, ownedBeforeIsolation, "extensions:false does not execute owned extensions");
  assert.equal(globalThis.__childSharedFactory, sharedBeforeIsolation, "extensions:false does not execute shared extensions");
  assert.equal(isolated.session.resourceLoader.getExtensions().extensions.length, 0, "extensions:false retains native loader isolation");
  assert.equal(result.session.sessionManager.getCwd(), repo);
  result = await run(outside);
  assert.equal(result.session.sessionManager.getCwd(), outside, "external worktree root reaches the native child session unchanged");
  result = await run(subdir);
  assert.equal(result.session.sessionManager.getCwd(), subdir, "copied subdirectory reaches native child session unchanged");
  const sessionsBeforeRejects = createdSessions.length;
  const bindingsBeforeRejects = bindingRequests.length;
  await assert.rejects(() => run(sandbox.dir("alien", "worktree")), /WORKSPACE|OWNED|UNDECIDABLE/);
  await assert.rejects(() => run(forged), /WORKTREE_ORIGIN_UNDECIDABLE/);
  assert.equal(createdSessions.length, sessionsBeforeRejects, "alien and backlink-mismatch cwd fail before native session factory");
  assert.equal(bindingRequests.length, bindingsBeforeRejects, "alien cwd fails before admitted resource binding");
  const poisonExtension = path.join(sandbox.root, "alien", "extension.mjs");
  fs.mkdirSync(path.dirname(poisonExtension), { recursive: true });
  fs.writeFileSync(poisonExtension, "export default function () {}\n");
  poisonResourcePaths.add(poisonExtension);
  const preloadsBeforePoison = globalThis.__childPreloads ?? 0;
  globalThis.__subagentsConfig = { extensions: [poisonExtension], skills: false };
  await assert.rejects(() => run(repo), /RESOURCE_INVENTORY|RESOURCE_OUTSIDE_OWNER/);
  assert.equal(globalThis.__childPreloads ?? 0, preloadsBeforePoison, "unadmitted extension path fails before skill preloading");
  globalThis.__subagentsConfig = { extensions: true, skills: [poisonExtension] };
  await assert.rejects(() => run(repo), /unadmitted child skill selector/);
  assert.equal(globalThis.__childPreloads ?? 0, preloadsBeforePoison, "unadmitted skill path fails before skill preloading");
  assert.deepEqual(poisonResourceReads, [], "poison resource bytes are never ingested before admission");
  delete globalThis.__subagentsConfig;

  const ownedSession = path.join(sessionRoot, "owned-session.json");
  fs.writeFileSync(ownedSession, JSON.stringify({ type: "session", version: 3, id: "synthetic-owned-session", timestamp: "2026-10-03T00:00:00.000Z", cwd: outside }) + "\n");
  const resumed = await run(repo, { resumeSessionFile: ownedSession });
  assert.equal(resumed.session.sessionManager.getSessionFile(), ownedSession, "owned resume reaches the native public session manager");
  const alienSession = sandbox.dir("alien", "session.json");
  fs.mkdirSync(path.dirname(alienSession), { recursive: true });
  fs.writeFileSync(alienSession, JSON.stringify({ type: "session", cwd: repo }) + "\n");
  const sessionsBeforeAlienResume = createdSessions.length;
  await assert.rejects(() => run(repo, { resumeSessionFile: alienSession }), /SESSION_NOT_OWNED|SESSION_HEADER_CWD_UNOWNED/);
  assert.equal(createdSessions.length, sessionsBeforeAlienResume, "alien resume fails before native session factory");
  const nested = await run(repo, { nested: true, nestedRuntime: { manager: {}, parentAgentId: "parent", depth: 1 } });
  assert.equal(nested.session.modelRuntime, parentRuntime, "nested child preserves exact parent runtime");
  assert.equal(counters.calls.nested, 1, "nested delegation plumbing is reached");
  assert.ok(nested.session.sessionManager.getSessionDir().startsWith(sessionRoot), "nested session remains in the selected private session root");
  for (const relative of sourceFiles) assert.deepEqual(fs.readFileSync(path.join(LIVE_SOURCE, relative)), sourceBytes.get(relative), `installed SUB CODE remains unchanged: ${relative}`);
  for (const name of commonAuthorityFiles) assert.deepEqual(fs.readFileSync(path.join(commonAuthority, name)), commonAuthorityBytes.get(name), `checked-in common agent source remains unchanged: ${name}`);
  assert.deepEqual(resourceGuards.attempts, { protected: 0, network: 0, child: 0, outside: 0, keyring: 0 }, `protected/network/child/keyring/outside counters remain zero; outside=${JSON.stringify(resourceGuards.outsideDetails)}`);
  console.log("PASS: admitted common discovery/priority, actual public child manager+loader startup/reload, exact parent ModelRuntime, derived-worktree/resume/nested/private state, pre-factory rejection, and guarded source staging");
} finally {
  resourceGuards?.restore();
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, originalEnv);
  delete globalThis.__childOwnedFactory;
  delete globalThis.__childSharedFactory;
  assert.equal(sandbox.cleanup(), true, "only the run-owned sandbox is cleaned");
}
