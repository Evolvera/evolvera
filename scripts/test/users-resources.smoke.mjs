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
const attempts = { protected: [], network: [], child: [], outside: [] };
let allowedRunRoot;
let phase = "initialization";
let sdkCodeProbePaths = new Set();
let virtualAncestorMarkerPaths = new Set();
const virtualMetadataOperations = [];
const virtualDeniedOperations = [];
const implicitPoisonReads = [];
let implicitPoisonPath;
let declaredPoisonPath;
let unownedManifestPath;
let unownedSkillRootPath;
const declaredPoisonReads = [];
const unownedManifestReads = [];
const unownedSkillRootEnumerations = [];
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
const SYNTHETIC_ABSENT = Symbol("synthetic-absent");
const SYNTHETIC_EXISTS_FALSE = Symbol("synthetic-exists-false");
const VIRTUAL_MARKERS = [[".pi"], [".pi", "memory"], [".agents"], ["AGENTS.md"], ["CLAUDE.md"]];
function virtualAncestorMarkers(runRoot) {
  const candidates = new Set();
  for (let dir = path.dirname(path.resolve(runRoot)); ; dir = path.dirname(dir)) {
    for (const parts of VIRTUAL_MARKERS) candidates.add(metadataKey(path.resolve(dir, ...parts)));
    if (path.dirname(dir) === dir) break;
  }
  return candidates;
}
function canonicalRoot(p) {
  const canonical = fs.realpathSync.native(p);
  assert.equal(canonical, path.resolve(p), `non-canonical run/code root: ${p}`);
  return canonical;
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
  throw Object.assign(new Error(`${category.toUpperCase()}_RESOURCE_DENIED: ${phase}:${operation}`), {
    code: `${category.toUpperCase()}_RESOURCE_DENIED`, phase, operation,
  });
}
function installComprehensiveGuards(runRoot) {
  allowedRunRoot = canonicalRoot(runRoot);
  sdkCodeProbePaths = new Set();
  const sourceRoot = canonicalRoot(SOURCE_ROOT);
  const sdkRoot = path.resolve(SDK_PACKAGE);
  const sdkCanonicalRoot = fs.realpathSync.native(sdkRoot);
  const codeRoots = [sourceRoot, sdkRoot, sdkCanonicalRoot];
  const protectedRoots = ["C:/Users/kevin/.pi", "C:/Users/kevin/.agents", "C:/Users/kevin/Documents/Pi/.pi"].map((root) => path.resolve(root));
  virtualAncestorMarkerPaths = virtualAncestorMarkers(allowedRunRoot);
  for (const candidate of virtualAncestorMarkerPaths) {
    if (inside(allowedRunRoot, candidate)
      || codeRoots.some((root) => inside(root, candidate) || inside(candidate, root))
      || protectedRoots.some((root) => inside(root, candidate) || inside(candidate, root))) {
      throw new Error("VIRTUAL_MARKER_SCOPE_INVALID");
    }
  }
  // The installed SDK's getAliases() probes only these exact package siblings with
  // existsSync before import.meta.resolve. These are read-only CODE resolver checks,
  // not host marker paths or authorization for any other out-of-root metadata.
  for (const relative of ["agent/dist/index.js", "tui/dist/index.js", "ai/dist/compat.js", "ai/dist/oauth.js", "ai/dist/providers/all.js"]) {
    const candidate = path.join(path.dirname(sdkCanonicalRoot), relative);
    if (fs.existsSync(candidate)) throw new Error("SDK_CODE_SIBLING_PRESENT");
    sdkCodeProbePaths.add(metadataKey(candidate));
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
    if (implicitPoisonPath && metadataKey(target) === metadataKey(implicitPoisonPath)
      && new Set(["readFile", "open", "createReadStream"]).has(base)) implicitPoisonReads.push(method);
    if (declaredPoisonPath && metadataKey(target) === metadataKey(declaredPoisonPath)
      && new Set(["readFile", "open", "createReadStream"]).has(base)) declaredPoisonReads.push(method);
    if (unownedManifestPath && metadataKey(target) === metadataKey(unownedManifestPath)
      && new Set(["readFile", "open", "createReadStream"]).has(base)) unownedManifestReads.push(method);
    if (unownedSkillRootPath && metadataKey(target) === metadataKey(unownedSkillRootPath)
      && new Set(["readdir", "opendir"]).has(base)) unownedSkillRootEnumerations.push(method);
    const flags = base === "open" ? args[1] : args[1]?.flags;
    const writes = WRITES.has(base) || (base === "open" && (typeof flags === "number"
      ? (flags & (fs.constants.O_WRONLY | fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_APPEND)) !== 0
      : typeof flags === "string" && /[wa+]/.test(flags)));
    const readOnlyCode = codeRoots.some((root) => inside(root, target)) && !writes;
    if (protectedRoots.some((root) => inside(root, target) || inside(target, root))) recordAndThrow("protected", method);
    if (virtualAncestorMarkerPaths.has(metadataKey(target))) {
      if (method === "lstatSync" || method === "statSync") {
        virtualMetadataOperations.push(method);
        return SYNTHETIC_ABSENT;
      }
      if (method === "existsSync") {
        virtualMetadataOperations.push(method);
        return SYNTHETIC_EXISTS_FALSE;
      }
      virtualDeniedOperations.push(method);
      throw Object.assign(new Error(`VIRTUAL_MARKER_ACCESS_DENIED: ${phase}:${method}`), {
        code: "VIRTUAL_MARKER_ACCESS_DENIED", phase, operation: method,
      });
    }
    if (sdkCodeProbePaths.has(metadataKey(target))) {
      if (!new Set(["stat", "lstat", "access", "exists", "realpath"]).has(base)) recordAndThrow("outside", `${method}:sdk-code-probe-content`);
      return;
    }
    if (!inside(allowedRunRoot, target) && !readOnlyCode) recordAndThrow("outside", method);
    let existing = target;
    for (;;) {
      try { originalLstat(existing); break; }
      catch (error) {
        if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
        const parent = path.dirname(existing);
        if (parent === existing) recordAndThrow("outside", method);
        existing = parent;
      }
    }
    const canonicalExisting = originalRealpath(existing);
    const canonicalTarget = path.resolve(canonicalExisting, path.relative(existing, target));
    if (!inside(allowedRunRoot, canonicalTarget) && !(codeRoots.some((root) => inside(root, canonicalTarget)) && !writes)) recordAndThrow("outside", method);
  }
  const patch = (object, name, indexes, label = name) => {
    const original = object?.[name];
    if (typeof original !== "function") return;
    originals.set(`${label}:${name}`, () => { object[name] = original; });
    const guarded = function (...args) {
      let syntheticResult;
      for (const index of indexes) {
        if (index >= args.length) continue;
        const result = check(args[index], name, args);
        if (result !== undefined) syntheticResult = result;
      }
      if (syntheticResult === SYNTHETIC_ABSENT) {
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT", errno: -4058, syscall: name.replace(/Sync$/, "") });
      }
      if (syntheticResult === SYNTHETIC_EXISTS_FALSE) return false;
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
  const runRoot = fs.mkdtempSync(path.join(temp, "pi-users-resources-run-"));
  try {
    assert.equal(canonicalRoot(runRoot), runRoot, "fresh run root canonical identity");
    const env = {};
    for (const key of ["SystemRoot", "windir"]) if (process.env[key]) env[key] = process.env[key];
    for (const [key, relative] of Object.entries({ HOME: "home", USERPROFILE: "home", APPDATA: "appdata/Roaming", LOCALAPPDATA: "appdata/Local", XDG_CONFIG_HOME: "config", XDG_CACHE_HOME: "cache", TMPDIR: "tmp", TEMP: "tmp", TMP: "tmp" })) env[key] = path.join(runRoot, relative);
    fs.mkdirSync(path.join(runRoot, "tmp"), { recursive: true });
    const child = spawnSync(process.execPath, [SCRIPT, "--isolated-child", runRoot], { cwd: runRoot, env, encoding: "utf8", timeout: 120000, windowsHide: true });
    if (child.error) {
      console.error(JSON.stringify({ phase: "isolated-child-launch", code: child.error.code ?? "LAUNCH_ERROR", operation: "spawnSync" }));
      process.exitCode = 1;
    } else if (child.status !== 0) {
      let diagnostic;
      try { diagnostic = JSON.parse(child.stderr.trim()); } catch { /* Do not relay an unredacted child error. */ }
      if (diagnostic && ["phase", "code", "operation"].every((key) => typeof diagnostic[key] === "string")) {
        const counters = diagnostic.counters && Object.fromEntries(Object.entries(diagnostic.counters).filter(([, value]) => Number.isInteger(value)));
        console.error(JSON.stringify({ phase: diagnostic.phase, code: diagnostic.code, operation: diagnostic.operation, ...(counters ? { counters } : {}) }));
      } else {
        console.error(JSON.stringify({ phase: "isolated-child", code: "UNSANITIZED_CHILD_FAILURE", operation: "child" }));
      }
      process.exitCode = 1;
    } else {
      console.log(child.stdout.trim());
    }
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
  assert.equal(path.resolve(process.cwd()), runRoot, "child cwd is the owned run root");
  assert.equal(process.env.PATH, undefined);
  assert.equal(process.env.NODE_OPTIONS, undefined);
  assert.equal(process.env.NODE_PATH, undefined);
  phase = "guard-installation";
  const restoreComprehensive = installComprehensiveGuards(runRoot);
  const sandbox = createSandbox("users-resources");
  const protectedGuard = { get count() { return attempts.protected.length; }, protect() {}, install() {}, restore() {} };
  const networkGuard = { get attempts() { return attempts.network.length; }, restore() {} };
  const priorEnv = { ...process.env };
  try {
    phase = "virtual-marker-negative-oracle";
    const virtualMarker = virtualAncestorMarkerPaths.values().next().value;
    assert.throws(() => fs.readFileSync(virtualMarker, "utf8"), (error) => error.code === "VIRTUAL_MARKER_ACCESS_DENIED");
    assert.deepEqual(virtualDeniedOperations, ["readFileSync"], "virtual marker content remains denied before syscall");
    phase = "synthetic-fixture-setup";
    const [{ registerUser }, { assertOwnedWorkspace }, { admitUserResources, buildAdmittedLoaderOptions, validateAdmittedResourceInventory }, { createAdmittedSettingsManager }] = await Promise.all([
      import("../users/registry.mjs"), import("../users/ownership.mjs"), import("../users/resources.mjs"), import("../users/settings.mjs"),
    ]);
    Object.assign(process.env, sandbox.env);
    assert.ok(inside(runRoot, sandbox.root), "nested fixture sandbox remains under run-owned parent");
    assert.equal(path.resolve(process.env.USERPROFILE), path.resolve(sandbox.dirs.home));
    assert.equal(path.resolve(os.homedir()), path.resolve(sandbox.dirs.home), "synthetic os.homedir root selected before SDK import");
    const homeSkillsRoot = sandbox.mkdir("home", ".agents", "skills");
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
  const profile = registerUser({ registryPath: path.join(sandbox.root, "registry", "users.json"), id: "kevin", label: "Kevin synthetic", agentDir, sessionRoots: [sessionRoot], workspaces: [workspace], sharedAssets: [sharedDir, homeSkillsRoot], contexts: [contextFile] });
  const projectSettingsDir = sandbox.mkdir("workspaces", "repo", ".pi");
  const allowedExtension = path.join(detached, "allowed.mjs");
  const managerExtension = path.join(workspace, "managed.mjs");
  const sharedExtension = path.join(sharedDir, "shared.mjs");
  const blockedExtension = path.join(sandbox.root, "alien", "blocked.mjs");
  const mcpExtension = path.join(agentDir, "mcp.ts");
  const mcpAdapterExtension = path.join(agentDir, "pi-mcp-adapter.ts");
  const managerContextFile = path.join(workspace, "AGENTS.md");
  const implicitPoisonSource = path.join(sandbox.root, "alien", "implicit-poison.md");
  implicitPoisonPath = path.join(projectSettingsDir, "skills", "poisoned-alias", "SKILL.md");
  sandbox.write(implicitPoisonSource, "---\nname: implicit-poison\ndescription: Must not be ingested.\n---\nSynthetic poisoned content.\n");
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
  const legitimateSkillDir = sandbox.mkdir("shared", "skills", "matrix-skill");
  const legitimateSkillFile = path.join(legitimateSkillDir, "SKILL.md");
  const homeSkillDir = sandbox.mkdir("home", ".agents", "skills", "registered-home-skill");
  sandbox.write(path.join(homeSkillDir, "SKILL.md"), "---\nname: registered-home-skill\ndescription: Registered synthetic home skill.\n---\nSynthetic body.\n");
  const legitimatePromptFile = path.join(sharedDir, "prompts", "matrix-review.md");
  const legitimateThemeFile = path.join(sharedDir, "themes", "matrix-theme.json");
  sandbox.write(legitimateSkillFile, "---\nname: matrix-skill\ndescription: Synthetic admitted skill fixture.\n---\nSynthetic skill body.\n");
  sandbox.write(legitimatePromptFile, "---\ndescription: Synthetic admitted prompt fixture.\n---\nSynthetic prompt body.\n");
  const themeFixture = JSON.parse(fs.readFileSync(path.join(SDK_PACKAGE, "dist", "modes", "interactive", "theme", "dark.json"), "utf8"));
  themeFixture.name = "matrix-theme";
  sandbox.write(legitimateThemeFile, JSON.stringify(themeFixture));
  const goodPackage = sandbox.mkdir("shared", "npm", "node_modules", "public-good");
  sandbox.write(path.join(goodPackage, "package.json"), JSON.stringify({ name: "public-good", version: "1.2.0", type: "module", pi: { skills: ["resources/**/*.md"] } }));
  sandbox.write(path.join(goodPackage, "extensions", "owned.js"), "export default function () { globalThis.__usersPackageAllowed++; }\n");
  sandbox.write(path.join(goodPackage, "extensions", "filtered.js"), "export default function () { globalThis.__usersPackageFiltered++; }\n");
  sandbox.write(path.join(goodPackage, "resources", "healthy", "SKILL.md"), "---\nname: package-glob-skill\ndescription: Synthetic declared glob skill.\n---\nSynthetic body.\n");
  const unreferencedPackage = sandbox.mkdir("shared", "npm", "node_modules", "not-referenced");
  sandbox.write(path.join(unreferencedPackage, "package.json"), JSON.stringify({ name: "not-referenced", version: "1.0.0" }));
  const binTarget = sandbox.mkdir("shared", "npm", "node_modules", ".bin-target");
  const binDir = sandbox.mkdir("shared", "npm", "node_modules", ".bin");
  assert.equal(sandbox.makeLink(binTarget, path.join(binDir, "unrelated-tool")).ok, true, "unrelated .bin link is a run-owned fixture");
  const unownedPackageDir = sandbox.mkdir("alien", "unowned-package");
  const unownedManifestSource = path.join(sandbox.root, "alien", "unowned-package-source.json");
  unownedManifestPath = path.join(unownedPackageDir, "package.json");
  sandbox.write(unownedManifestSource, JSON.stringify({ name: "unowned-poison", version: "1.0.0", pi: { skills: ["resources/**/*.md"] } }));
  assert.equal(sandbox.makeHardLink(unownedManifestSource, unownedManifestPath).ok, true, "unowned hardlinked package manifest fixture created");
  const declaredPoisonSource = path.join(sandbox.root, "alien", "declared-poison.md");
  declaredPoisonPath = path.join(goodPackage, "resources", "poison", "SKILL.md");
  sandbox.write(declaredPoisonSource, "---\nname: declared-poison\ndescription: Must not be read.\n---\nSynthetic poison.\n");
  const privateShadow = sandbox.mkdir("profiles", "kevin", "agent", "npm", "node_modules", "public-good");
  sandbox.write(path.join(privateShadow, "package.json"), JSON.stringify({ name: "public-good", version: "1.0.0", type: "module" }));
  sandbox.write(path.join(privateShadow, "extensions", "owned.js"), "export default function () { globalThis.__usersPrivateShadow++; }\n");
  const privateOverlay = sandbox.mkdir("profiles", "kevin", "agent", "overlays", "private-overlay");
  sandbox.write(path.join(privateOverlay, "package.json"), JSON.stringify({ name: "private-overlay", version: "1.0.0", type: "module" }));
  sandbox.write(path.join(privateOverlay, "extensions", "owned.js"), "export default function () { globalThis.__usersOverlayAllowed++; }\n");
  const rawSettings = { extensions: [managerExtension, sharedExtension], skills: [legitimateSkillDir], prompts: [legitimatePromptFile], themes: [legitimateThemeFile], packages: [{ source: "npm:public-good@^1.0.0", extensions: ["extensions/owned.js"] }, { source: privateOverlay, extensions: ["extensions/owned.js"] }, "not-installed-synthetic-package@1.0.0", "npm:owned-mcp-alias"], unknownSyntheticField: { keep: "unchanged" } };
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
  phase = "resource-admission-fixture";
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
  validateAdmittedResourceInventory(profile, { cwd, requestInputs: { cliPaths: { extensions: ["builtin:synthetic"] } } });
  const unownedHome = sandbox.mkdir("unowned-home");
  unownedSkillRootPath = sandbox.mkdir("unowned-home", ".agents", "skills");
  assert.throws(() => validateAdmittedResourceInventory(profile, { cwd, homeDir: unownedHome }), /RESOURCE_INVENTORY_REJECTED/);
  assert.throws(() => validateAdmittedResourceInventory(profile, { cwd, requestInputs: { homeDir: unownedHome } }), /RESOURCE_INVENTORY_REJECTED/, "captured home input remains the inventory authority");
  assert.deepEqual(unownedSkillRootEnumerations, [], "unowned existing home skill root refuses before enumeration");
  const goodManifestPath = path.join(goodPackage, "package.json");
  const goodManifestBefore = fs.readFileSync(goodManifestPath);
  fs.writeFileSync(goodManifestPath, JSON.stringify({ name: "public-good", version: "1.2.0", type: "module", pi: { skills: ["resources/{healthy,poison}/**/*.md"] } }));
  assert.equal(sandbox.makeHardLink(declaredPoisonSource, declaredPoisonPath).ok, true);
  assert.throws(() => validateAdmittedResourceInventory(profile, { cwd, settings: { packages: [goodPackage] } }), /RESOURCE_INVENTORY_REJECTED/, "brace glob prefixes cannot conceal aliased resource members");
  assert.deepEqual(declaredPoisonReads, [], "brace glob alias refused before content");
  fs.unlinkSync(declaredPoisonPath);
  fs.writeFileSync(goodManifestPath, goodManifestBefore);
  const forcedAlias = path.join(privateOverlay, "forced", "SKILL.md");
  assert.equal(sandbox.makeHardLink(declaredPoisonSource, forcedAlias).ok, true);
  assert.throws(() => validateAdmittedResourceInventory(profile, { cwd, settings: { packages: [{ source: privateOverlay, skills: ["+forced/SKILL.md"] }] } }), /RESOURCE_INVENTORY_REJECTED/, "force-include declarations retain identity preflight");
  fs.unlinkSync(forcedAlias);
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

  phase = "public-sdk-import";
  const sdk = await import(pathToFileURL(SDK).href);
  phase = "settings-manager-construction";
  const managerResourceRequest = { contextPaths: [managerContextFile] };
  const settingsManager = createAdmittedSettingsManager(sdk, profile, { cwd: managerCwd, settingsOptions: { projectTrusted: true }, resourceRequest: managerResourceRequest });
  managerResourceRequest.contextPaths.push(blockedExtension); // Later caller mutation must not widen the manager-bound inventory.
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
  phase = "loader-construction";
  const loader = new sdk.DefaultResourceLoader(loaderOptions);
  assert.equal(sandbox.makeHardLink(implicitPoisonSource, implicitPoisonPath).ok, true, "implicit skill hardlink poison fixture created after manager construction");
  phase = "loader-startup-poison-refusal";
  assert.equal(sandbox.makeHardLink(declaredPoisonSource, declaredPoisonPath).ok, true, "declared glob hardlink poison fixture created");
  await assert.rejects(loader.reload(), /RESOURCE_INVENTORY_REJECTED/, "implicit and declared-glob hardlinks reject before native resource ingestion");
  assert.deepEqual(implicitPoisonReads, [], "startup implicit poison refusal precedes all content reads");
  assert.deepEqual(declaredPoisonReads, [], "declared glob poison refusal precedes all content reads");
  fs.unlinkSync(implicitPoisonPath);
  fs.unlinkSync(declaredPoisonPath);
  phase = "loader-startup-reload";
  await loader.reload();
  if (!globalThis.__usersPackageAllowed) console.error(JSON.stringify({ extensions: loader.getExtensions().extensions.map((item) => item.path), errors: loader.getExtensions().errors }));
  phase = "startup-owned-and-shared-extensions";
  assert.equal(globalThis.__usersManagedFactory, 1, "admitted owned extension factory executed");
  assert.equal(globalThis.__usersSharedFactory, 1, "admitted shared CODE factory executed");
  phase = "startup-admitted-skill";
  assert.ok(loader.getSkills().skills.some((skill) => skill.name === "matrix-skill"), "legitimate admitted skill loads through public getter");
  assert.ok(loader.getSkills().skills.some((skill) => skill.name === "registered-home-skill"), "registered selected-home implicit skill remains native-discoverable");
  assert.ok(loader.getSkills().skills.some((skill) => skill.name === "package-glob-skill"), "healthy declared custom package glob remains native-discoverable");
  phase = "startup-admitted-prompt";
  assert.ok(loader.getPrompts().prompts.some((prompt) => prompt.name === "matrix-review"), "legitimate admitted prompt loads through public getter");
  phase = "startup-admitted-theme";
  assert.ok(loader.getThemes().themes.some((theme) => theme.name === "matrix-theme"), "legitimate admitted theme loads through public getter");
  phase = "startup-implicit-poison-pre-read";
  assert.deepEqual(implicitPoisonReads, [], "implicit hardlink poison rejected before native skill content ingestion");
  assert.equal(loader.getSkills().skills.some((skill) => skill.name === "implicit-poison"), false, "implicit poisoned skill is not exposed by public getter");
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
  assert.equal(sandbox.makeHardLink(implicitPoisonSource, implicitPoisonPath).ok, true, "reload poison alias is run-created");
  phase = "loader-reload-poison-refusal";
  await assert.rejects(loader.reload(), /RESOURCE_INVENTORY_REJECTED/, "reload poison rejects before native resource ingestion");
  assert.deepEqual(implicitPoisonReads, [], "reload poison refusal precedes all content reads");
  fs.unlinkSync(implicitPoisonPath);
  phase = "loader-reload-unowned-settings-refusal";
  await assert.rejects(loader.reload(), /RESOURCE_INVENTORY_REJECTED/, "unowned settings candidate refuses reload before native resolution");
  assert.equal(globalThis.__usersBlockedFactory, 0, "unowned extension factory never executes before refusal");
  fs.writeFileSync(globalSettingsFile, JSON.stringify({ ...rawSettings, packages: [...rawSettings.packages, unownedPackageDir] }));
  fs.writeFileSync(projectSettingsFile, JSON.stringify({ extensions: [managerExtension] }));
  phase = "loader-unowned-manifest-refusal";
  await assert.rejects(loader.reload(), /RESOURCE_INVENTORY_REJECTED/, "unowned package manifest refuses reload before content");
  assert.deepEqual(unownedManifestReads, [], "unowned manifest body remains unread at ownership refusal");
  fs.unlinkSync(unownedManifestPath);
  fs.writeFileSync(globalSettingsFile, JSON.stringify(rawSettings));
  fs.writeFileSync(projectSettingsFile, JSON.stringify({ extensions: [managerExtension] }));
  phase = "loader-healthy-reload";
  await loader.reload();
  assert.equal(globalThis.__usersBlockedFactory, 0, "unowned extension factory remains unexecuted");
  assert.equal(globalThis.__usersManagedFactory, factoryCount.owned + 1, "legitimate owned extension remains available after reload");
  assert.equal(globalThis.__usersSharedFactory, factoryCount.shared + 1, "legitimate shared extension remains available after reload");
  assert.equal(globalThis.__usersPackageAllowed, factoryCount.package + 1, "legitimate common package remains enabled on reload");
  assert.equal(globalThis.__usersOverlayAllowed, factoryCount.overlay + 1, "explicit owned overlay remains enabled on reload");
  assert.ok(loader.getSkills().skills.some((skill) => skill.name === "matrix-skill"), "legitimate admitted skill remains available after reload");
  assert.ok(loader.getSkills().skills.some((skill) => skill.name === "registered-home-skill"), "registered home skill remains available after reload");
  assert.ok(loader.getSkills().skills.some((skill) => skill.name === "package-glob-skill"), "declared package glob remains available after reload");
  assert.ok(loader.getPrompts().prompts.some((prompt) => prompt.name === "matrix-review"), "legitimate admitted prompt remains available after reload");
  assert.ok(loader.getThemes().themes.some((theme) => theme.name === "matrix-theme"), "legitimate admitted theme remains available after reload");
  assert.deepEqual(implicitPoisonReads, [], "implicit hardlink poison remains unread through reload");
  assert.deepEqual(declaredPoisonReads, [], "declared glob hardlink poison remains unread through reload");
  let trustBootstrapCalls = 0;
  await loader.reload({ resolveProjectTrust: async ({ extensionsResult }) => {
    trustBootstrapCalls++;
    assert.ok(Array.isArray(extensionsResult.extensions), "native trust bootstrap supplies its public extension result");
    return true;
  } });
  assert.equal(trustBootstrapCalls, 1, "native trust-bootstrap reload journey observed");
  assert.ok(loader.getSkills().skills.some((skill) => skill.name === "matrix-skill"), "admitted skill survives native trust-bootstrap reload");
  assert.equal(globalThis.__usersBlockedFactory, 0, "trust bootstrap never executes an unowned factory");
  assert.deepEqual(implicitPoisonReads, [], "trust bootstrap preserves the zero-poison-content oracle");
  fs.writeFileSync(globalSettingsFile, "{ malformed");
  await assert.rejects(loader.reload(), /SETTINGS_LOAD_FAILED/, "malformed native reload is rejected before package resolution");
  assert.equal(globalThis.__usersBlockedFactory, 0);
  restoreComprehensive();
  protectedGuard.restore();
  syncBuiltinESMExports();
  assert.equal(protectedGuard.count, 0, "no host settings/auth/model/MCP store access");
  assert.deepEqual([sandbox.sha(credentialSentinel), sandbox.sha(fakeMcpStore)], protectedSyntheticSnapshots, "unrelated synthetic secret sentinels remained byte-identical");
  assert.ok(virtualMetadataOperations.length > 0, "ancestor marker metadata was answered synthetically");
  assert.deepEqual(virtualDeniedOperations, ["readFileSync"], "only the deliberate virtual marker content denial occurred");
  assert.deepEqual(attempts, { protected: [], network: [], child: [], outside: [] }, "no protected, egress, child-process or unrelated outside-resource attempts");
  assert.equal(networkGuard.attempts, 0, "no sockets opened");
  assert.doesNotMatch(JSON.stringify(admitted.diagnostics), /FAKE-SECRET|fake-user|invalid\.example/);
  console.log(JSON.stringify({ result: "users-resources smoke passed", sdk: "public SettingsManager+DefaultResourceLoader", startupReload: "observed", syntheticAncestorMetadata: virtualMetadataOperations.length, virtualContentDenied: virtualDeniedOperations.length, implicitPoisonReads: implicitPoisonReads.length, declaredPoisonReads: declaredPoisonReads.length, unownedManifestReads: unownedManifestReads.length, unownedSkillRootEnumerations: unownedSkillRootEnumerations.length, protected: 0, network: 0, child: 0, outside: 0 }));
} catch (error) {
  console.error(JSON.stringify({
    phase, code: error?.code ?? error?.name ?? "ERROR", operation: error?.operation ?? "uncaught",
    counters: {
      ...Object.fromEntries(Object.entries(attempts).map(([category, values]) => [category, values.length])),
      virtualMetadata: virtualMetadataOperations.length,
      virtualDenied: virtualDeniedOperations.length,
    },
  }));
  process.exitCode = 1;
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
