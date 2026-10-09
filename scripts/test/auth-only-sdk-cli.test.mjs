import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import vm from "node:vm";
import { pathToFileURL } from "node:url";
import { transformMainSource, transformMigrationsSource } from "../users/sdk-cli-source.mjs";
import { prepareSdkStage } from "../users/sdk-stage.mjs";

const sdkRoot = "C:/Users/kevin/AppData/Local/nvm/v24.20.0/node_modules/@earendil-works/pi-coding-agent";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const protectedPins = {
  "scripts/patch-pi-101-interactive-activity.mjs": "e47429c2e2c20393cc57fa561b897ad126d0008994ca36d75779d7a0b9e1f48f",
  "scripts/test/patch-pi-101-interactive-activity.smoke.mjs": "075f4e8450f97560d60d00be20cd91e45808306ce40beccb09f42be577ca4423",
};
const sdkProtectedPins = {
  "package.json": "fa487897918283976006d8c4f450772a9c90b9674f2a19d5f01e3ab9af35ce8f",
  "dist/main.js": "060521b0b81f91948d8ded9139e423e5d0c9e6808a45c81750cc30519de4d2db",
  "dist/migrations.js": "8514d2573b028baeba60635498a1c5f129a602abd203ea5c37a63df2eea3fb6b",
  "dist/core/model-runtime.js": "da26f76339a031456f6d239a249159231776f760ab4ac538c6b54c417dea6f67",
  "dist/core/model-config.js": "68c447ff2ef729331713e044dae41b7416dbafbf96c83773308e2eb9c3f86107",
  "dist/core/agent-session-services.js": "20b7aa4b0657b53fb522ea051df26f72901802e03cc06c89e0a8926388bca601",
};
const resourceRoot = await mkdtemp(path.join(os.tmpdir(), "auth-only-sdk-cli-"));
const resourceRecord = { root: resourceRoot, ownership: "fresh fs.mkdtemp root", externalReads: [], writes: [], imports: ["../users/sdk-cli-source.mjs", "../users/sdk-stage.mjs"], evaluatedSdkImports: 0, checks: [] };
const recordWrite = (file) => resourceRecord.writes.push(path.relative(resourceRoot, file));
async function sdkText(relative) {
  resourceRecord.externalReads.push(relative);
  return readFile(path.join(sdkRoot, ...relative.split("/")), "utf8");
}
function extractFunction(source, signature, nextMarker) {
  const start = source.indexOf(signature);
  const end = source.indexOf(nextMarker, start + signature.length);
  assert.ok(start >= 0 && end > start, `function source boundaries found: ${signature}`);
  return source.slice(start, end).trim();
}
function evaluateFunction(source, signature, nextMarker, dependencies) {
  const declaration = extractFunction(source, signature, nextMarker);
  const fn = vm.runInNewContext(`(${declaration})`, dependencies, { timeout: 1000 });
  return fn;
}
async function recordManifest(extra = {}) {
  resourceRecord.checks.push(extra);
}

const mainOriginal = await sdkText("dist/main.js");
const migrationOriginal = await sdkText("dist/migrations.js");
const modelRuntimeOriginal = await sdkText("dist/core/model-runtime.js");
const modelConfigOriginal = await sdkText("dist/core/model-config.js");
const mainPrepared = transformMainSource(mainOriginal);
const migrationsPrepared = transformMigrationsSource(migrationOriginal);

test("source-pinned CLI transform preserves native path while threading account factory", async () => {
  assert.notEqual(mainPrepared, mainOriginal);
  assert.match(mainPrepared, /async function runAuthCommand\(args, accountRuntimeFactory\)/);
  assert.match(mainPrepared, /purpose: parsed\.help \? "metadata" : "application"/);
  assert.match(mainPrepared, /predecessorSessionManager: sessionStartEvent === undefined \? undefined : predecessorSessionManager/);
  assert.match(mainPrepared, /parsed, modelRuntimeTimeoutMs: 15_000, readonly:/);
  assert.doesNotMatch(mainPrepared, /sessionStartEvent, cwd, agentDir, parsed, signal: AbortSignal\.timeout/);
  assert.ok(mainPrepared.indexOf("const account = accountRuntimeFactory") < mainPrepared.indexOf("const services = await createAgentSessionServices"));
  assert.match(mainPrepared, /runMigrations\(cwd, accountRuntimeFactory \? \{ skipAuthMigration: true \} : undefined\)/);
  assert.ok(mainPrepared.indexOf("handlePackageCommand(args") < mainPrepared.indexOf("const parsed = parseArgs(args)"));
  assert.ok(mainPrepared.indexOf("if (parsed.version)") < mainPrepared.indexOf("purpose: parsed.help ?"));
  assert.match(mainPrepared, /extensionFactories: \[\.\.\.extensionFactories, \.\.\.\(suppliedResources\.extensionFactories \?\? \[\]\)\]/);
  assert.match(migrationsPrepared, /options\?\.skipAuthMigration === true \? \[\] : migrateAuthToAuthJson\(\)/);
  const vmDeps = { calls: [], migrateAuthToAuthJson() { throw new Error("default auth migration forbidden"); }, migrateSessionsFromAgentRoot() { vmDeps.calls.push("sessions"); }, migrateToolsToBin() { vmDeps.calls.push("tools"); }, migrateKeybindingsConfigFile() { vmDeps.calls.push("keys"); }, migrateExtensionSystem(cwd) { vmDeps.calls.push(`extensions:${cwd}`); return ["warning"]; } };
  const migration = evaluateFunction(migrationsPrepared, "function runMigrations(cwd, options) {", "\n//# sourceMappingURL", vmDeps);
  assert.equal(JSON.stringify(migration("/synthetic/project", { skipAuthMigration: true })), JSON.stringify({ migratedAuthProviders: [], deprecationWarnings: ["warning"] }));
  assert.deepEqual(vmDeps.calls, ["sessions", "tools", "keys", "extensions:/synthetic/project"]);
  const defaults = { calls: [], migrateAuthToAuthJson() { defaults.calls.push("auth"); return ["legacy"]; }, migrateSessionsFromAgentRoot() {}, migrateToolsToBin() {}, migrateKeybindingsConfigFile() {}, migrateExtensionSystem() { return []; } };
  const unmanaged = evaluateFunction(migrationsPrepared, "function runMigrations(cwd, options) {", "\n//# sourceMappingURL", defaults);
  assert.deepEqual(unmanaged("/native", undefined).migratedAuthProviders, ["legacy"]);
  await recordManifest({ sourceTransform: "PASS", migrationCalls: vmDeps.calls });
});

test("auth print and readonly check use selected factory and forbid default SDK storage", async () => {
  const outputs = [];
  const processFake = { exitCode: undefined, stdout: { write: (text) => outputs.push(text) }, stderr: { write() {} } };
  let request;
  const common = {
    isAuthCommandHelp: () => false,
    parseAuthCommand: () => ({ kind: "print", args: [], minExpiryMs: 0 }),
    parseArgs: () => ({ unknownFlags: new Map(), diagnostics: [] }),
    getAuthCommandName: () => "auth print", getAuthCommandUsage: () => "pi auth print",
    AuthCommandError: class AuthCommandError extends Error {},
    chalk: { red: (x) => x, dim: (x) => x }, APP_NAME: "pi",
    process: { ...processFake, cwd: () => "/synthetic/project" }, AbortSignal, console: { error() {} }, processExit: () => {},
    ModelRuntime: { create: async () => { throw new Error("default ModelRuntime.create forbidden"); } },
    createAuthCheckModelRuntime: async () => { throw new Error("default auth check runtime forbidden"); },
    AuthStorage: { create: () => { throw new Error("default AuthStorage forbidden"); } },
    ReadOnlyAuthStorage: class { constructor() { throw new Error("default readonly store forbidden"); } },
    resolveCredentialForPrint: async (_parsed, runtime) => { assert.equal(runtime.id, "selected"); return "synthetic-credential"; },
    getAgentDir: () => "/shared/agent", checkProviderAuth: async () => ({ status: "ready", provider: "fake" }),
    getProviderCredential: async () => undefined, validateAuthCommandArgs: () => ({ provider: "fake" }),
  };
  const authPrint = evaluateFunction(mainPrepared, "async function runAuthCommand(args, accountRuntimeFactory) {", "async function prepareInitialMessage", common);
  let factoryCalls = 0;
  common.isAuthCommandHelp = () => true;
  common.printAuthCommandHelp = () => {};
  assert.equal(await authPrint(["auth", "--help"], async () => { factoryCalls++; }), true);
  assert.equal(factoryCalls, 0, "auth help must stay account-selection free");
  common.isAuthCommandHelp = () => false;
  await authPrint(["auth"] , async (r) => { request = r; factoryCalls++; return { modelRuntime: { id: "selected" } }; });
  assert.equal(request.purpose, "auth-command");
  assert.deepEqual(outputs, ["synthetic-credential\n"]);

  outputs.length = 0; processFake.exitCode = undefined;
  common.parseAuthCommand = () => ({ kind: "check", args: [], noRefresh: true, credentials: false, json: false });
  common.validateAuthCommandArgs = () => ({ provider: "fake" });
  const check = evaluateFunction(mainPrepared, "async function runAuthCommand(args, accountRuntimeFactory) {", "async function prepareInitialMessage", common);
  await check(["auth", "check"], async (r) => { request = r; return { credentials: { id: "selected-store" }, modelRuntime: { id: "selected" } }; });
  assert.equal(request.readonly, true);
  assert.equal(outputs[0], "ready\n");
  await recordManifest({ authFactory: "PASS", authOutput: outputs[0], readonly: request.readonly });
});

test("fresh code-only stage relocates exact graph edges and refuses unknown edges", async () => {
  const actualStageRoot = path.join(resourceRoot, "actual-prepared-sdk");
  const actualManifest = await prepareSdkStage({ packageRoot: sdkRoot, stageRoot: actualStageRoot, transforms: {
    "dist/main.js": transformMainSource,
    "dist/migrations.js": transformMigrationsSource,
    "dist/core/model-runtime.js": (source) => source,
    "dist/core/model-config.js": (source) => source,
  } });
  recordWrite(actualStageRoot);
  assert.deepEqual(Object.keys(actualManifest.outputs).sort(), ["dist/core/model-config.js", "dist/core/model-runtime.js", "dist/main.js", "dist/migrations.js"].sort());
  assert.ok(actualManifest.imports.some((edge) => edge.from === "dist/main.js" && edge.staged && edge.target === "dist/core/model-runtime.js"));
  assert.ok(actualManifest.imports.some((edge) => edge.from === "dist/core/model-runtime.js" && edge.staged && edge.target === "dist/core/model-config.js"));
  assert.ok(actualManifest.imports.some((edge) => !edge.staged && edge.specifier === "@earendil-works/pi-ai"));
  resourceRecord.externalReads.push("package.json", ...Object.keys(actualManifest.dependencyPins).map((name) => `node_modules/${name}/package.json`), ...actualManifest.imports.filter((edge) => !edge.staged && !edge.builtin).map((edge) => `read-only-import-target:${edge.target}`));
  resourceRecord.writes.push(...Object.keys(actualManifest.outputs).map((name) => `actual-prepared-sdk/${name}`), "actual-prepared-sdk/package.json", "actual-prepared-sdk/manifest.json");
  const stageRoot = path.join(resourceRoot, "prepared-sdk");
  const stageTransforms = {
    "dist/main.js": () => 'import "node:readline"; import { modelsAreEqual } from "@earendil-works/pi-ai"; import "./migrations.js"; export const go = () => import("./core/model-runtime.js");',
    "dist/migrations.js": () => 'export { config } from "./core/model-config.js";',
    "dist/core/model-runtime.js": () => 'import "./model-config.js"; export const run = 1;',
    "dist/core/model-config.js": () => 'export const config = 1;',
  };
  const manifest = await prepareSdkStage({ packageRoot: sdkRoot, stageRoot, transforms: stageTransforms });
  recordWrite(stageRoot);
  assert.equal(manifest.outputs && Object.keys(manifest.outputs).length, 4);
  assert.ok(manifest.imports.some((edge) => edge.from === "dist/main.js" && edge.staged && edge.target === "dist/migrations.js"));
  assert.ok(manifest.imports.some((edge) => edge.from === "dist/main.js" && edge.staged && edge.target === "dist/core/model-runtime.js"));
  assert.ok(manifest.imports.some((edge) => edge.from === "dist/main.js" && !edge.staged && edge.specifier === "@earendil-works/pi-ai"));
  assert.ok(manifest.imports.some((edge) => edge.from === "dist/migrations.js" && edge.staged && edge.target === "dist/core/model-config.js"));
  assert.deepEqual((await readdir(stageRoot)).sort(), ["dist", "manifest.json", "package.json"]);
  const stagedMain = await readFile(path.join(stageRoot, "dist/main.js"), "utf8");
  assert.ok(stagedMain.includes(pathToFileURL(path.join(stageRoot, "dist/migrations.js")).href));
  assert.ok(stagedMain.includes(pathToFileURL(path.join(stageRoot, "dist/core/model-runtime.js")).href));
  assert.ok(stagedMain.includes(pathToFileURL(path.join(sdkRoot, "node_modules/@earendil-works/pi-ai/dist/index.js")).href));
  assert.ok(stagedMain.includes('import "node:readline";'));
  const unknownRoot = path.join(resourceRoot, "unknown-edge-stage");
  await assert.rejects(prepareSdkStage({ packageRoot: sdkRoot, stageRoot: unknownRoot, transforms: { ...stageTransforms, "dist/core/model-config.js": () => 'import "not-an-allowed-package";' } }), /unapproved SDK import/);
  assert.equal(await exists(unknownRoot), false, "unknown import rejected before stage creation");
  await assert.rejects(prepareSdkStage({ packageRoot: sdkRoot, stageRoot, transforms: stageTransforms }), /already exists/);
  const stageManifest = JSON.parse(await readFile(path.join(stageRoot, "manifest.json"), "utf8"));
  assert.equal(stageManifest.evaluation, "none; transformed SDK source was not imported or evaluated");
  await recordManifest({ stageRoot, edgeCount: manifest.imports.length, sourcePins: actualManifest.sourcePins, dependencyPins: actualManifest.dependencyPins, actualOutputHashes: actualManifest.outputs, outputs: manifest.outputs, unknownEdge: "rejected before writes" });
});

async function exists(file) { try { await readFile(file); return true; } catch (error) { if (error.code === "ENOENT") return false; throw error; } }

after(async () => {
  for (const [relative, expected] of Object.entries(protectedPins)) {
    // Local uncommitted selector preparation is protected when present, not a clone prerequisite.
    if (await exists(path.resolve(relative))) {
      assert.equal(hash(await readFile(path.resolve(relative))), expected, `protected selector source unchanged: ${relative}`);
    } else resourceRecord.checks.push({ protectedSelector: relative, status: "not present" });
  }
  for (const [relative, expected] of Object.entries(sdkProtectedPins)) {
    assert.equal(hash(await readFile(path.join(sdkRoot, ...relative.split("/")))), expected, `installed SDK source unchanged: ${relative}`);
  }
  const manifestPath = path.join(resourceRoot, "resource-import-manifest.json");
  await writeFile(manifestPath, JSON.stringify({ ...resourceRecord, finalProtectedSourceCheck: "PASS", sdkProtectedSourceCheck: "PASS" }, null, 2) + "\n", { flag: "wx" });
  recordWrite(manifestPath);
});
