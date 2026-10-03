import assert from "node:assert/strict";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import net from "node:net";
import tls from "node:tls";
import os from "node:os";
import childProcess from "node:child_process";
import path from "node:path";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createSandbox } from "./lib/users-sandbox.mjs";

const SCRIPT = fileURLToPath(import.meta.url);
const SDK_PACKAGE = "C:/nvm4w/nodejs/node_modules/@earendil-works/pi-coding-agent";
const SDK = `${SDK_PACKAGE}/dist/index.js`;
const SOURCE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MARKERS = [[".pi"], [".pi", "memory"], [".agents"], ["AGENTS.md"], ["CLAUDE.md"]];
const attempts = { protected: [], network: [], child: [], outside: [] };
let allowedRunRoot;
let metadataCandidates = new Set();
let descriptorPaths = new Map();
const normalizeFsPath = (value) => {
  let resolved = path.resolve(value);
  if (process.platform === "win32") {
    resolved = resolved.replace(/^\\\\\\?\\UNC\\/i, "\\\\").replace(/^\\\\\\?\\/, "");
  }
  return resolved;
};
const inside = (root, value) => {
  const relative = path.relative(normalizeFsPath(root), normalizeFsPath(value));
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
};
const metadataKey = (value) => process.platform === "win32" ? normalizeFsPath(value).toLowerCase() : path.resolve(value);
function canonicalRoot(p) {
  const canonical = fs.realpathSync.native(p);
  assert.equal(canonical, path.resolve(p), `non-canonical run/code root: ${p}`);
  return canonical;
}
function discoverAbsentMarkers(root) {
  const candidates = new Set();
  for (let dir = root; ; dir = path.dirname(dir)) {
    for (const parts of MARKERS) {
      const candidate = path.join(dir, ...parts);
      try { fs.lstatSync(candidate); throw new Error(`ANCESTOR_MARKER_EXISTS: ${candidate}`); }
      catch (error) { if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error; }
      candidates.add(path.resolve(candidate));
    }
    if (path.dirname(dir) === dir) break;
  }
  return candidates;
}
const FS_PATH_ARGS = {
  access: [0], appendFile: [0], chmod: [0], chown: [0], copyFile: [0, 1], cp: [0, 1], createReadStream: [0], createWriteStream: [0],
  exists: [0], lchmod: [0], lchown: [0], link: [0, 1], lstat: [0], mkdir: [0], mkdtemp: [0], open: [0], opendir: [0],
  readFile: [0], readdir: [0], readlink: [0], realpath: [0], rename: [0, 1], rm: [0], rmdir: [0], stat: [0], symlink: [0, 1],
  truncate: [0], unlink: [0], utimes: [0], lutimes: [0], writeFile: [0], glob: [0], watch: [0], watchFile: [0],
};
const WRITES = new Set(["appendFile", "chmod", "chown", "copyFile", "cp", "createWriteStream", "fchmod", "fchown", "ftruncate", "futimes", "lchmod", "lchown", "link", "mkdir", "mkdtemp", "rename", "rm", "rmdir", "symlink", "truncate", "unlink", "utimes", "lutimes", "write", "writev", "writeFile"]);
function recordAndThrow(category, operation) {
  attempts[category].push(operation);
  throw Object.assign(new Error(`${category.toUpperCase()}_RESOURCE_DENIED: ${operation}`), { code: `${category.toUpperCase()}_RESOURCE_DENIED` });
}
function installComprehensiveGuards(runRoot, markerCandidates) {
  allowedRunRoot = canonicalRoot(runRoot);
  metadataCandidates = new Set(markerCandidates.map(metadataKey));
  const sourceRoot = canonicalRoot(SOURCE_ROOT);
  const sdkRoot = path.resolve(SDK_PACKAGE);
  const sdkCanonicalRoot = fs.realpathSync.native(sdkRoot);
  const codeRoots = [sourceRoot, sdkRoot, sdkCanonicalRoot];
  // SDK extension loader (dist/core/extensions/loader.js getAliases) probes monorepo
  // workspace siblings with existsSync before falling back to import.meta.resolve.
  // Admit exactly those absent sibling paths for metadata only; never content or writes.
  for (const root of [sdkRoot, sdkCanonicalRoot]) {
    for (const relative of ["agent/dist/index.js", "tui/dist/index.js", "ai/dist/compat.js", "ai/dist/oauth.js", "ai/dist/providers/all.js"]) {
      const candidate = path.join(path.dirname(root), relative);
      assert.equal(fs.existsSync(candidate), false, `unexpected SDK workspace sibling present: ${candidate}`);
      metadataCandidates.add(metadataKey(candidate));
    }
  }
  const originals = new Map();
  const originalLstat = fs.lstatSync;
  const originalRealpath = fs.realpathSync.native;
  function check(value, method, args = []) {
    if (typeof value === "number") value = descriptorPaths.get(value);
    const raw = value instanceof URL ? fileURLToPath(value) : Buffer.isBuffer(value) ? value.toString() : value;
    if (typeof raw !== "string") recordAndThrow("outside", `${method}:untracked-descriptor`);
    const target = path.resolve(raw.startsWith("file:") ? fileURLToPath(raw) : raw);
    const base = method.replace(/Sync$/, "");
    const flags = base === "open" ? args[1] : args[1]?.flags;
    const writes = WRITES.has(base) || (base === "open" && (typeof flags === "number"
      ? (flags & (fs.constants.O_WRONLY | fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_APPEND)) !== 0
      : typeof flags === "string" && /[wa+]/.test(flags)));
    const readOnlyCode = codeRoots.some((root) => inside(root, target)) && !writes;
    const protectedRoots = ["C:/Users/kevin/.pi", "C:/Users/kevin/.agents", "C:/Users/kevin/Documents/Pi/.pi"];
    if (protectedRoots.some((root) => inside(path.resolve(root), target) || inside(target, path.resolve(root)))) recordAndThrow("protected", method);
    if (metadataCandidates.has(metadataKey(target))) {
      if (!new Set(["stat", "lstat", "access", "exists", "realpath"]).has(base)) recordAndThrow("protected", `${method}:ancestor-marker-content`);
      return;
    }
    if (!inside(allowedRunRoot, target) && !readOnlyCode) recordAndThrow("outside", `${method}:lexical-scope [${allowedRunRoot} -> ${target}]`);
    let existing = target;
    for (;;) {
      try { originalLstat(existing); break; }
      catch (error) {
        if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
        const parent = path.dirname(existing);
        if (parent === existing) recordAndThrow("outside", `${method}:canonical-parent`);
        existing = parent;
      }
    }
    const canonicalExisting = originalRealpath(existing);
    const canonicalTarget = path.resolve(canonicalExisting, path.relative(existing, target));
    if (!inside(allowedRunRoot, canonicalTarget) && !(codeRoots.some((root) => inside(root, canonicalTarget)) && !writes)) recordAndThrow("outside", `${method}:canonical-alias`);
  }
  const patch = (object, name, indexes, label = name) => {
    const original = object?.[name];
    if (typeof original !== "function") return;
    originals.set(`${label}:${name}`, () => { object[name] = original; });
    const guarded = function (...args) {
      for (const index of indexes) if (index < args.length) check(args[index], name, args);
      const cbIndex = args.findIndex((item) => typeof item === "function");
      if (["open", "openSync"].includes(name) && typeof args[cbIndex] === "function") {
        const callback = args[cbIndex]; args[cbIndex] = (error, fd, ...rest) => { if (!error) descriptorPaths.set(fd, args[0]); callback(error, fd, ...rest); };
      }
      const result = original.apply(this, args);
      if (name === "openSync" && typeof result === "number") descriptorPaths.set(result, args[0]);
      if (name === "open" && result?.then) return result.then((handle) => {
        descriptorPaths.set(handle.fd, args[0]);
        for (const method of ["appendFile", "chmod", "chown", "createReadStream", "createWriteStream", "read", "readFile", "readv", "stat", "truncate", "utimes", "write", "writeFile", "writev"]) {
          const originalMethod = handle[method];
          if (typeof originalMethod === "function") handle[method] = function (...values) { check(handle.fd, method, values); return originalMethod.apply(this, values); };
        }
        return handle;
      });
      return result;
    };
    if (original.native) guarded.native = function (...args) { for (const index of indexes) check(args[index], `${name}.native`, args); return original.native.apply(this, args); };
    object[name] = guarded;
  };
  for (const [name, indexes] of Object.entries(FS_PATH_ARGS)) {
    const syncName = `${name}Sync`;
    patch(fs, syncName, indexes);
    patch(fs, name, indexes);
    patch(fsPromises, name, indexes);
  }
  const sdkRequire = createRequire(path.join(SDK_PACKAGE, "dist", "core", "package-manager.js"));
  const gracefulFs = sdkRequire("graceful-fs");
  for (const surface of [gracefulFs, gracefulFs.promises]) {
    for (const surfaceName of ["stat", "lstat", "access", "exists", "realpath", "readFile", "writeFile", "appendFile", "open", "mkdir", "rm", "unlink", "rename", "copyFile", "cp", "link", "symlink", "truncate", "utimes", "lutimes", "readdir", "opendir", "readlink", "createReadStream", "createWriteStream"]) {
      for (const suffix of surface === gracefulFs ? ["Sync", ""] : [""]) {
        const method = `${surfaceName}${suffix}`;
        const indexes = [0, ...(["rename", "copyFile", "cp", "link", "symlink"].includes(surfaceName) ? [1] : [])];
        patch(surface, method, indexes, surface === gracefulFs ? "graceful" : "graceful-promises");
      }
    }
  }
  for (const name of ["fchmod", "fchmodSync", "fchown", "fchownSync", "fdatasync", "fdatasyncSync", "fsync", "fsyncSync", "fstat", "fstatSync", "ftruncate", "ftruncateSync", "futimes", "futimesSync", "read", "readSync", "readv", "readvSync", "write", "writeSync", "writev", "writevSync"]) {
    patch(fs, name, [0]);
  }
  for (const [object, name] of [[childProcess, "spawn"], [childProcess, "spawnSync"], [childProcess, "exec"], [childProcess, "execSync"], [childProcess, "execFile"], [childProcess, "execFileSync"], [childProcess, "fork"]]) {
    const original = object[name]; originals.set(`child:${name}`, () => { object[name] = original; }); object[name] = () => recordAndThrow("child", `child_process.${name}`);
  }
  for (const [object, name] of [[net, "connect"], [net, "createConnection"], [net.Socket.prototype, "connect"], [net.Server.prototype, "listen"], [tls, "connect"], [tls.TLSSocket.prototype, "connect"], [globalThis, "fetch"]]) {
    const original = object[name]; originals.set(`network:${name}`, () => { object[name] = original; }); object[name] = () => recordAndThrow("network", name);
  }
  syncBuiltinESMExports();
  return () => { for (const restore of [...originals.values()].reverse()) restore(); syncBuiltinESMExports(); };
}

if (!process.argv.includes("--isolated-child")) {
  const temp = "C:/Windows/Temp";
  assert.equal(canonicalRoot(temp), path.resolve(temp), "dedicated canonical Windows temp root required");
  discoverAbsentMarkers(temp);
  const runRoot = fs.mkdtempSync(path.join(temp, "pi-users-resources-run-"));
  try {
    assert.equal(canonicalRoot(runRoot), runRoot, "fresh run root canonical identity");
    const markerCandidates = discoverAbsentMarkers(runRoot);
    const env = {};
    for (const key of ["SystemRoot", "windir"]) if (process.env[key]) env[key] = process.env[key];
    for (const [key, relative] of Object.entries({ HOME: "home", USERPROFILE: "home", APPDATA: "appdata/Roaming", LOCALAPPDATA: "appdata/Local", XDG_CONFIG_HOME: "config", XDG_CACHE_HOME: "cache", TMPDIR: "tmp", TEMP: "tmp", TMP: "tmp" })) env[key] = path.join(runRoot, relative);
    fs.mkdirSync(path.join(runRoot, "tmp"), { recursive: true });
    const child = spawnSync(process.execPath, [SCRIPT, "--isolated-child", runRoot, JSON.stringify([...markerCandidates])], { cwd: runRoot, env, encoding: "utf8", timeout: 120000, windowsHide: true });
    assert.equal(child.error, undefined, child.error?.message);
    assert.equal(child.status, 0, `isolated smoke child failed: ${child.stderr}`);
    console.log(child.stdout.trim());
  } finally {
    assert.equal(canonicalRoot(runRoot), runRoot, "parent teardown remains inside unique run root");
    fs.rmSync(runRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    assert.equal(fs.existsSync(runRoot), false, "fresh run root disposed");
  }
} else {
  const environmentAllowlist = new Set(["SystemRoot", "windir", "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "TMPDIR", "TEMP", "TMP"]);
  for (const key of Object.keys(process.env)) if (!environmentAllowlist.has(key)) delete process.env[key];
  assert.deepEqual(Object.keys(process.env).sort(), [...environmentAllowlist].filter((key) => process.env[key] !== undefined).sort());
  const runRoot = process.argv[3];
  const markerCandidates = JSON.parse(process.argv[4]);
  assert.equal(path.resolve(process.cwd()), runRoot, "child cwd is the owned run root");
  assert.equal(process.env.PATH, undefined);
  assert.equal(process.env.NODE_OPTIONS, undefined);
  assert.equal(process.env.NODE_PATH, undefined);
  const restoreComprehensive = installComprehensiveGuards(runRoot, markerCandidates);
  const sandbox = createSandbox("users-resources");
  const protectedGuard = { get count() { return attempts.protected.length; }, protect() {}, install() {}, restore() {} };
  const networkGuard = { get attempts() { return attempts.network.length; }, restore() {} };
  const priorEnv = { ...process.env };
  try {
    const [{ registerUser }, { assertOwnedWorkspace }, { admitUserResources, buildAdmittedLoaderOptions }, { createAdmittedSettingsManager }] = await Promise.all([
      import("../users/registry.mjs"), import("../users/ownership.mjs"), import("../users/resources.mjs"), import("../users/settings.mjs"),
    ]);
    Object.assign(process.env, sandbox.env);
    assert.ok(inside(runRoot, sandbox.root), "nested fixture sandbox remains under run-owned parent");
    assert.equal(path.resolve(process.env.USERPROFILE), path.resolve(sandbox.dirs.home));
    assert.equal(path.resolve(os.homedir()), path.resolve(sandbox.dirs.home), "synthetic os.homedir root selected before SDK import");
    sandbox.mkdir("home", ".agents", "skills");
  const agentDir = sandbox.mkdir("profiles", "kevin", "agent");
  const sessionRoot = sandbox.mkdir("profiles", "kevin", "sessions");
  const workspace = sandbox.mkdir("workspaces", "repo");
  sandbox.mkdir("workspaces", "repo", ".git");
  const detached = sandbox.mkdir("detached", "allowed-tree");
  const nested = sandbox.mkdir("detached", "allowed-tree", "subdir");
  const gitdir = sandbox.mkdir("workspaces", "repo", ".git", "worktrees", "smoke");
  const detachedGit = path.join(detached, ".git");
  sandbox.write(detachedGit, `gitdir: ${gitdir}\n`);
  sandbox.write(path.join(gitdir, "commondir"), "../..\n");
  sandbox.write(path.join(gitdir, "gitdir"), `${detachedGit.replaceAll("\\", "/")}\n`);
  const sharedDir = sandbox.mkdir("shared");
  const contextFile = path.join(detached, "AGENTS.md");
  const profile = registerUser({ registryPath: path.join(sandbox.root, "registry", "users.json"), id: "kevin", label: "Kevin synthetic", agentDir, sessionRoots: [sessionRoot], workspaces: [workspace], sharedAssets: [sharedDir], contexts: [contextFile] });
  const projectSettingsDir = sandbox.mkdir("workspaces", "repo", ".pi");
  const allowedExtension = path.join(detached, "allowed.mjs");
  const managerExtension = path.join(workspace, "managed.mjs");
  const sharedExtension = path.join(sharedDir, "shared.mjs");
  const blockedExtension = path.join(sandbox.root, "alien", "blocked.mjs");
  const mcpExtension = path.join(agentDir, "mcp.ts");
  const mcpAdapterExtension = path.join(agentDir, "pi-mcp-adapter.ts");
  const managerContextFile = path.join(workspace, "AGENTS.md");
  sandbox.write(contextFile, "synthetic admitted context\n");
  sandbox.write(allowedExtension, "export default function () { globalThis.__usersAllowedFactory++; }\n");
  sandbox.write(managerExtension, "export default function () { globalThis.__usersManagedFactory++; }\n");
  sandbox.write(managerContextFile, "synthetic managed context\n");
  sandbox.write(sharedExtension, "export default function () { globalThis.__usersSharedFactory++; }\n");
  sandbox.write(blockedExtension, "export default function () { globalThis.__usersBlockedFactory++; }\n");
  sandbox.write(mcpExtension, "export default function () { globalThis.__usersMcpFactory++; }\n");
  sandbox.write(mcpAdapterExtension, "export default function () { globalThis.__usersMcpFactory++; }\n");
  const globalSettingsFile = path.join(agentDir, "settings.json");
  const projectSettingsFile = path.join(projectSettingsDir, "settings.json");
  const goodPackage = sandbox.mkdir("shared", "npm", "node_modules", "public-good");
  sandbox.write(path.join(goodPackage, "package.json"), JSON.stringify({ name: "public-good", version: "1.2.0", type: "module" }));
  sandbox.write(path.join(goodPackage, "extensions", "owned.js"), "export default function () { globalThis.__usersPackageAllowed++; }\n");
  sandbox.write(path.join(goodPackage, "extensions", "filtered.js"), "export default function () { globalThis.__usersPackageFiltered++; }\n");
  const privateShadow = sandbox.mkdir("profiles", "kevin", "agent", "npm", "node_modules", "public-good");
  sandbox.write(path.join(privateShadow, "package.json"), JSON.stringify({ name: "public-good", version: "1.0.0", type: "module" }));
  sandbox.write(path.join(privateShadow, "extensions", "owned.js"), "export default function () { globalThis.__usersPrivateShadow++; }\n");
  const privateOverlay = sandbox.mkdir("profiles", "kevin", "agent", "overlays", "private-overlay");
  sandbox.write(path.join(privateOverlay, "package.json"), JSON.stringify({ name: "private-overlay", version: "1.0.0", type: "module" }));
  sandbox.write(path.join(privateOverlay, "extensions", "owned.js"), "export default function () { globalThis.__usersOverlayAllowed++; }\n");
  const rawSettings = { extensions: [managerExtension, sharedExtension], packages: [{ source: "npm:public-good@^1.0.0", extensions: ["extensions/owned.js"] }, { source: privateOverlay, extensions: ["extensions/owned.js"] }, "not-installed-synthetic-package@1.0.0", "npm:owned-mcp-alias"], unknownSyntheticField: { keep: "unchanged" } };
  sandbox.write(globalSettingsFile, JSON.stringify(rawSettings));
  sandbox.write(projectSettingsFile, JSON.stringify({ extensions: [managerExtension], projectUnknown: "preserve" }));
  const aliasPackage = sandbox.mkdir("profiles", "kevin", "agent", "npm", "node_modules", "owned-mcp-alias");
  sandbox.write(path.join(aliasPackage, "package.json"), JSON.stringify({ name: "pi-mcp-adapter", version: "1.0.0" }));
  // npm refs resolve only from shared CODE, so the copied MCP manifest must also exist there to exercise its rejection.
  const sharedAliasPackage = sandbox.mkdir("shared", "npm", "node_modules", "owned-mcp-alias");
  sandbox.write(path.join(sharedAliasPackage, "package.json"), JSON.stringify({ name: "pi-mcp-adapter", version: "1.0.0" }));
  const credentialSentinel = path.join(agentDir, "auth.json");
  sandbox.write(credentialSentinel, JSON.stringify({ token: "FAKE-SECRET-no-read" }));
  const fakeMcpStore = path.join(sandbox.root, "fake-mcp-store.json");
  sandbox.write(fakeMcpStore, JSON.stringify({ url: "https://fake-user:FAKE-SECRET-mcp@invalid.example" }));
  protectedGuard.protect(credentialSentinel);
  protectedGuard.protect(fakeMcpStore);
  const protectedSyntheticSnapshots = [sandbox.sha(credentialSentinel), sandbox.sha(fakeMcpStore)];
  const cwd = nested;
  const managerCwd = workspace;
  const admitted = buildAdmittedLoaderOptions(profile, {
    cwd,
    settings: { extensions: [allowedExtension, blockedExtension, mcpExtension, mcpAdapterExtension, "builtin:mcp"], packages: ["pi-mcp-adapter@https://fake-user:FAKE-SECRET-package@invalid.example"] },
    projectSettings: { extensions: [allowedExtension] },
    cliPaths: { extensions: [allowedExtension, blockedExtension] },
    contextPaths: [contextFile],
  });
  assert.equal(admitted.loaderOptions.cwd, cwd);
  assert.equal(admitted.loaderOptions.agentDir, agentDir);
  assert.equal(admitted.loaderOptions.noContextFiles, true, "unadmitted ancestors disable public ancestor context scanning");
  assert.deepEqual(admitted.loaderOptions.additionalExtensionPaths, [allowedExtension]);
  assert.deepEqual(admitted.projectSettings.extensions, [allowedExtension]);
  assert.deepEqual(admitted.settings.extensions, [allowedExtension, allowedExtension]);
  assert.equal(admitted.diagnostics.filter((item) => item.code === "MCP_BLOCKED").length >= 4, true, "MCP names with .ts suffix and builtin identity are rejected");
  assert.deepEqual(admitted.settings.packages, []);
  assert.equal(admitted.diagnostics.some((item) => item.code === "MCP_BLOCKED"), true);
  assert.equal(admitted.loaderOptions.extensionFactories, undefined, "caller inline factories are not implicitly trusted or admitted");
  assert.doesNotMatch(JSON.stringify(admitted.diagnostics), /FAKE-SECRET|fake-user|invalid\.example/);
  const effective = assertOwnedWorkspace(profile, cwd);
  assert.equal(effective.workspaceRoot, detached);
  assert.equal(effective.worktreeOrigin, workspace);
  const derived = admitUserResources(profile, { cwd, cliPaths: { extensions: [allowedExtension] } });
  assert.deepEqual(derived.cliPaths.extensions, [allowedExtension]);
  const extensionAlias = path.join(sandbox.root, "alias", "allowed.mjs");
  assert.equal(sandbox.makeHardLink(allowedExtension, extensionAlias).ok, true, "synthetic CLI alias fixture created");
  const recheckedAlias = buildAdmittedLoaderOptions(profile, { cwd, cliPaths: { extensions: [allowedExtension] } });
  assert.deepEqual(recheckedAlias.loaderOptions.additionalExtensionPaths, [], "a re-admitted CLI path is denied after alias poisoning");
  assert.equal(recheckedAlias.diagnostics.some((item) => item.code === "RESOURCE_ALIAS"), true);
  fs.unlinkSync(extensionAlias);

  let forgedConstruction = false;
  assert.throws(() => {
    const options = buildAdmittedLoaderOptions(profile, { cwd: path.join(sandbox.root, "forged"), settings: {} });
    forgedConstruction = true;
    return options;
  }, /WORKSPACE|WORKTREE|OWNED/);
  assert.equal(forgedConstruction, false, "forged cwd must reject before loader construction");
  const forged = sandbox.mkdir("detached", "forged");
  sandbox.write(path.join(forged, ".git"), `gitdir: ${gitdir}\n`);
  assert.throws(() => buildAdmittedLoaderOptions(profile, { cwd: forged }), /WORKTREE_ORIGIN_UNDECIDABLE/);

  const sdk = await import(pathToFileURL(SDK).href);
  const settingsManager = createAdmittedSettingsManager(sdk, profile, { cwd: managerCwd, settingsOptions: { projectTrusted: true } });
  const actualSettings = buildAdmittedLoaderOptions(profile, {
    cwd: managerCwd,
    settings: settingsManager.getGlobalSettings(),
    projectSettings: settingsManager.getProjectSettings(),
    contextPaths: [managerContextFile],
  });
  const loaderOptions = { ...actualSettings.loaderOptions, settingsManager };
  assert.equal(settingsManager.getGlobalSettings().packages.length, 2, "common npm refs map to shared CODE and explicit private local overlays remain admitted");
  // Every file-backed loader root and resource input is a descendant of this run's mkdtemp.
  for (const key of ["cwd", "agentDir", ...Object.keys(loaderOptions).filter((name) => name.startsWith("additional"))]) {
    const value = loaderOptions[key];
    for (const item of Array.isArray(value) ? value : [value]) {
      if (typeof item === "string" && path.isAbsolute(item)) assert.ok(item === sandbox.root || item.startsWith(`${sandbox.root}${path.sep}`), `loader input escaped sandbox: ${key}`);
    }
  }
  globalThis.__usersAllowedFactory = 0;
  globalThis.__usersManagedFactory = 0;
  globalThis.__usersSharedFactory = 0;
  globalThis.__usersBlockedFactory = 0;
  globalThis.__usersPackageAllowed = 0;
  globalThis.__usersPackageFiltered = 0;
  globalThis.__usersPrivateShadow = 0;
  globalThis.__usersOverlayAllowed = 0;
  const loader = new sdk.DefaultResourceLoader(loaderOptions);
  await loader.reload();
  if (!globalThis.__usersPackageAllowed) console.error(JSON.stringify({ extensions: loader.getExtensions().extensions.map((item) => item.path), errors: loader.getExtensions().errors }));
  assert.equal(globalThis.__usersManagedFactory, 1, "admitted owned extension factory executed");
  assert.equal(globalThis.__usersSharedFactory, 1, "admitted shared CODE factory executed");
  assert.equal(globalThis.__usersPackageAllowed, 1, "common package factory came from the shared inventory");
  assert.equal(globalThis.__usersPrivateShadow, 0, "legacy private npm copy cannot shadow common CODE");
  assert.equal(globalThis.__usersOverlayAllowed, 1, "explicit private local overlay remains admitted");
  assert.equal(globalThis.__usersPackageFiltered, 0, "package resource filter remains effective");
  assert.equal(globalThis.__usersBlockedFactory, 0, "inadmissible extension factory never executed");
  assert.deepEqual(loader.getAgentsFiles().agentsFiles.map(({ path: file, content }) => ({ path: file, content })), [{ path: managerContextFile, content: "synthetic managed context\n" }]);
  const admittedPackages = settingsManager.getGlobalSettings().packages;
  assert.equal(admittedPackages.some((entry) => typeof entry === "string" && entry.includes("not-installed-synthetic-package")), false, "uninstalled package ref is filtered before package resolution");
  assert.equal(admittedPackages.length, 2, "MCP alias package is filtered before package resolution");
  // The manager's getters already return admitted views, so the raw settings carry the diagnostic.
  assert.equal(admitUserResources(profile, { cwd: managerCwd, settings: rawSettings }).diagnostics.some((item) => item.code === "MCP_BLOCKED"), true, "copied MCP manifest aliases are denied before package resolution");
  assert.equal(typeof admittedPackages[0], "object");
  assert.equal(admittedPackages[0].source, goodPackage, "common package ref resolves to the shared CODE inventory");
  assert.equal(admittedPackages[1].source, privateOverlay, "explicit private overlay remains local to the owned agent");
  assert.deepEqual(admittedPackages[0].extensions, ["extensions/owned.js"], "installed package source filters remain intact");
  settingsManager.setDefaultModel("synthetic-updated");
  await settingsManager.flush();
  await settingsManager.reload();
  assert.equal(settingsManager.getDefaultModel(), "synthetic-updated");
  const persisted = JSON.parse(fs.readFileSync(globalSettingsFile, "utf8"));
  assert.deepEqual(persisted.unknownSyntheticField, rawSettings.unknownSyntheticField, "native merge preserves unrelated raw settings");
  assert.equal(persisted.defaultModel, "synthetic-updated", "native setter+flush persists selected field");
  const queuedSaveAlias = path.join(sandbox.root, "queued-save-alias.json");
  const preAliasSettings = fs.readFileSync(globalSettingsFile);
  settingsManager.setDefaultModel("must-not-write-after-alias-drift");
  assert.equal(sandbox.makeHardLink(globalSettingsFile, queuedSaveAlias).ok, true, "queued save alias fixture created");
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(fs.readFileSync(globalSettingsFile), preAliasSettings, "queued native save rechecks identity before writing");
  fs.unlinkSync(queuedSaveAlias);
  await assert.rejects(settingsManager.flush(), /SETTINGS_LOAD_FAILED/, "queued storage rejection is surfaced through the public manager");
  const factoryCount = { owned: globalThis.__usersManagedFactory, shared: globalThis.__usersSharedFactory, package: globalThis.__usersPackageAllowed, overlay: globalThis.__usersOverlayAllowed };
  fs.writeFileSync(globalSettingsFile, JSON.stringify({ ...rawSettings, extensions: [blockedExtension] }));
  fs.writeFileSync(projectSettingsFile, JSON.stringify({ extensions: [blockedExtension] }));
  await loader.reload();
  assert.equal(globalThis.__usersBlockedFactory, 0, "unowned extension poisoned on reload never executes");
  assert.equal(globalThis.__usersManagedFactory, factoryCount.owned, "reload admission suppresses the unowned settings-poisoned extension");
  assert.equal(globalThis.__usersSharedFactory, factoryCount.shared, "reload admission suppresses the removed owned extension");
  assert.equal(globalThis.__usersPackageAllowed, factoryCount.package + 1, "legitimate common package remains enabled on reload");
  assert.equal(globalThis.__usersOverlayAllowed, factoryCount.overlay + 1, "explicit owned overlay remains enabled on reload");
  fs.writeFileSync(globalSettingsFile, "{ malformed");
  await assert.rejects(loader.reload(), /SETTINGS_LOAD_FAILED/, "malformed native reload is rejected before package resolution");
  assert.equal(globalThis.__usersBlockedFactory, 0);
  restoreComprehensive();
  protectedGuard.restore();
  syncBuiltinESMExports();
  assert.equal(protectedGuard.count, 0, "no host settings/auth/model/MCP store access");
  assert.deepEqual([sandbox.sha(credentialSentinel), sandbox.sha(fakeMcpStore)], protectedSyntheticSnapshots, "unrelated synthetic secret sentinels remained byte-identical");
  assert.deepEqual(attempts, { protected: [], network: [], child: [], outside: [] }, "no protected, egress, child-process or outside-resource attempts");
  assert.equal(networkGuard.attempts, 0, "no sockets opened");
  assert.doesNotMatch(JSON.stringify(admitted.diagnostics), /FAKE-SECRET|fake-user|invalid\.example/);
  console.log("users-resources smoke passed; public SettingsManager+DefaultResourceLoader startup/reload observed; admitted factory positive, unowned/MCP/remote package factories and resolution blocked; native setter+flush preserved unknown fields; malformed reload rejected; protected reads=0; network attempts=0.");
} finally {
  restoreComprehensive();
  protectedGuard.restore();
  syncBuiltinESMExports();
  networkGuard.restore();
  for (const key of Object.keys(process.env)) if (!(key in priorEnv)) delete process.env[key];
  for (const [key, value] of Object.entries(priorEnv)) process.env[key] = value;
  delete globalThis.__usersAllowedFactory;
  delete globalThis.__usersManagedFactory;
  delete globalThis.__usersSharedFactory;
  delete globalThis.__usersBlockedFactory;
  delete globalThis.__usersPackageAllowed;
  delete globalThis.__usersPackageFiltered;
  delete globalThis.__usersPrivateShadow;
  delete globalThis.__usersOverlayAllowed;
  const cleaned = sandbox.cleanup();
  assert.equal(cleaned, true, "run-owned sandbox cleaned");
}
}
