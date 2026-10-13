import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { transformMainSource, transformMigrationsSource } from "../users/sdk-cli-source.mjs";
import { transformModelConfigSource, transformModelRuntimeSource } from "../users/sdk-auth-source.mjs";
import { prepareSdkStage } from "../users/sdk-stage.mjs";

const roots = { "1.0.1": process.env.SDK_101_ROOT, "1.1.0": process.env.SDK_110_ROOT, "1.2.0": process.env.SDK_120_ROOT };
const missing = Object.entries(roots).filter(([, root]) => !root).map(([version]) => version);
const hash = (text) => createHash("sha256").update(text).digest("hex");
const files = ["dist/main.js", "dist/migrations.js", "dist/core/model-runtime.js", "dist/core/model-config.js"];
const transforms = {
  "dist/main.js": transformMainSource,
  "dist/migrations.js": transformMigrationsSource,
  "dist/core/model-runtime.js": transformModelRuntimeSource,
  "dist/core/model-config.js": transformModelConfigSource,
};
const runRoot = mkdtempSync(path.join(os.tmpdir(), "sdk-110-compat-"));
const readSdk = (root, relative) => readFileSync(path.join(root, ...relative.split("/")), "utf8");
const verifySyntax = (file) => {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  assert.equal(result.status, 0, `${file}\n${result.stderr}`);
};

test("1.0.1, 1.1.0 and 1.2.0 pinned transforms preserve auth/runtime/resource invariants", { skip: missing.length ? `provide ${missing.map((version) => `SDK_${version.replaceAll(".", "")}_ROOT`).join(" and ")} fixture paths; missing ${missing.join(", ")}` : false }, async () => {
  const before = {};
  const prepared = {};
  const expectedPins = {
    "1.0.1": {
      "package.json": "fa487897918283976006d8c4f450772a9c90b9674f2a19d5f01e3ab9af35ce8f",
      "dist/main.js": "060521b0b81f91948d8ded9139e423e5d0c9e6808a45c81750cc30519de4d2db",
      "dist/migrations.js": "8514d2573b028baeba60635498a1c5f129a602abd203ea5c37a63df2eea3fb6b",
      "dist/core/model-runtime.js": "da26f76339a031456f6d239a249159231776f760ab4ac538c6b54c417dea6f67",
      "dist/core/model-config.js": "68c447ff2ef729331713e044dae41b7416dbafbf96c83773308e2eb9c3f86107",
    },
    "1.1.0": {
      "package.json": "c662a36f8bc47843393a60dc8616a34dfcc8376e8fcc96dbc2f1020c60e38e2a",
      "dist/main.js": "866d65f2d42f74d2bb72ed4a755c8ace1b8a2c497a32cb57cc4db594a4fcb2bf",
      "dist/migrations.js": "8514d2573b028baeba60635498a1c5f129a602abd203ea5c37a63df2eea3fb6b",
      "dist/core/model-runtime.js": "732c2be87ac94ceb1f9c68074eb78c15bc189f21671414bb91bcd0cf141d5b9c",
      "dist/core/model-config.js": "24a0e0f98672766e16e00d9f61587f50f9481915581156ae71a14e48ee912e4c",
    },
    "1.2.0": {
      "package.json": "d4231a02b6a2ccb357a8e9e420fab9c217490137ade958d4a45a12e169daad0c",
      "dist/main.js": "f4e68ceeeb8ddfd905662d2c55497fea8ccdf252a83a2ca14233ec872d742016",
      "dist/migrations.js": "8514d2573b028baeba60635498a1c5f129a602abd203ea5c37a63df2eea3fb6b",
      "dist/core/model-runtime.js": "578b742bea061fed029b8e139c6c0bcfe31e60665e9c0c6a08769761ef169dfd",
      "dist/core/model-config.js": "602795a0db074909e325e65c6b34c9120d0d2eb39f678e453a5ceffbbb37984b",
    },
  };
  for (const [version, root] of Object.entries(roots)) {
    const metadata = JSON.parse(readSdk(root, "package.json"));
    assert.equal(metadata.version, version);
    before[version] = Object.fromEntries(["package.json", ...files].map((relative) => [relative, hash(readSdk(root, relative))]));
    assert.deepEqual(before[version], expectedPins[version], `verified SDK source pins for ${version}`);
    prepared[version] = Object.fromEntries(files.map((relative) => [relative, transforms[relative](readSdk(root, relative))]));
    assert.notEqual(prepared[version]["dist/main.js"], readSdk(root, "dist/main.js"));
    assert.match(prepared[version]["dist/main.js"], /async function runAuthCommand\(args, accountRuntimeFactory\)/);
    assert.match(prepared[version]["dist/main.js"], /readonly: command\.noRefresh === true/);
    assert.match(prepared[version]["dist/main.js"], /readonly: command\.noRefresh,/);
    assert.match(prepared[version]["dist/main.js"], /skipAuthMigration: true/);
    assert.match(prepared[version]["dist/main.js"], /predecessorSessionManager: sessionStartEvent === undefined \? undefined : predecessorSessionManager/);
    assert.match(prepared[version]["dist/main.js"], /extensionFactories: \[\.\.\.extensionFactories, \.\.\.\(suppliedResources\.extensionFactories \?\? \[\]\)\]/);
    assert.match(prepared[version]["dist/main.js"], /typeof suppliedResources\.extensionsOverride === "function"/);
    assert.match(prepared[version]["dist/main.js"], /\.\.\.\(account \? \{ modelRuntime: account\.modelRuntime \} : \{\}\)/);
    assert.match(prepared[version]["dist/migrations.js"], /options\?\.skipAuthMigration === true \? \[\] : migrateAuthToAuthJson\(\)/);
    assert.match(prepared[version]["dist/core/model-runtime.js"], /createModels\(\{ credentials, modelsStore, authContext: this\.authContext \}\)/);
    assert.match(prepared[version]["dist/core/model-runtime.js"], /this\.accountConfigPolicy\?\.filterConfig/);
    assert.match(prepared[version]["dist/core/model-runtime.js"], /this\.accountConfigPolicy\.filterRegistration\(config\)/);
    if (version === "1.2.0") assert.match(prepared[version]["dist/core/model-config.js"], /typeof transform === "function" \? transform\(parsed\.providers\) : parsed\.providers/);
    else assert.match(prepared[version]["dist/core/model-config.js"], /typeof transform === "function" \? transform\(config\.providers\) : config\.providers/);
    if (version === "1.1.0") {
      assert.match(prepared[version]["dist/main.js"], /disabledBuiltinExtensions: parsed\.noMcp \? \["mcp"\] : undefined/);
      assert.match(readSdk(root, "dist/core/model-runtime.js"), /assertClassifierInputSupported\(model, context\)/);
      assert.match(readSdk(root, "dist/core/model-config.js"), /samplingParamsByThinkingLevel/);
    } else if (version === "1.2.0") {
      assert.match(prepared[version]["dist/main.js"], /disabledBuiltinExtensions: parsed\.noMcp \? \["mcp"\] : undefined/);
      assert.match(readSdk(root, "dist/core/model-runtime.js"), /personalizeOpenRouterCatalog/);
      assert.match(prepared[version]["dist/core/model-runtime.js"], /accountConfigPolicy\.wrapModelsStore\(modelsStore\)/);
      assert.match(prepared[version]["dist/core/model-runtime.js"], /new ModelRuntime\(credentials, config, modelsPath, scopedModelsStore/);
      assert.match(prepared[version]["dist/core/model-config.js"], /transform\(parsed\.providers\)/);
      assert.match(prepared[version]["dist/core/model-config.js"], /Object\.entries\(policyProviders\)/);
      assert.match(readSdk(root, "dist/core/model-config.js"), /ProviderCompatSchema \} from "@earendil-works\/pi-ai\/providers\/compat-schema"/);
      assert.match(readSdk(root, "dist/core/model-config.js"), /ModelCostSchema,[^\n]*from "@earendil-works\/pi-ai\/providers\/model-schema"/);
    } else {
      assert.doesNotMatch(prepared[version]["dist/main.js"], /disabledBuiltinExtensions: parsed\.noMcp/);
    }
    for (const relative of files) {
      const fixture = path.join(runRoot, `${version}-${path.basename(relative)}`);
      writeFileSync(fixture, prepared[version][relative], { flag: "wx" });
      verifySyntax(fixture);
    }
    assert.deepEqual(Object.fromEntries(["package.json", ...files].map((relative) => [relative, hash(readSdk(root, relative))])), before[version], `public source unchanged for ${version}`);
  }
});

test("1.0.1, 1.1.0 and 1.2.0 create fresh pinned stages and reject unknown/tampered inputs before output", { skip: missing.length ? `provide verified fixture paths; missing ${missing.join(", ")}` : false }, async () => {
  const protectedSources = {};
  for (const version of Object.keys(roots)) {
    const packageRoot = path.resolve(roots[version]);
    protectedSources[version] = Object.fromEntries(["package.json", ...files].map((relative) => [relative, hash(readSdk(packageRoot, relative))]));
    const stageRoot = path.join(runRoot, `stage-${version.replaceAll(".", "")}`);
    const manifest = await prepareSdkStage({ packageRoot, stageRoot, transforms });
    assert.equal(manifest.package.version, version);
    assert.equal(manifest.package.name, "@earendil-works/pi-coding-agent");
    assert.equal(manifest.dependencyPins["@earendil-works/pi-ai"].version, version);
    assert.equal(manifest.dependencyPins["@earendil-works/pi-tui"].version, version);
    assert.equal(manifest.dependencyPins.chalk.version, "6.0.0");
    assert.equal(manifest.dependencyPins.typebox.version, "1.3.27");
    assert.equal(Object.keys(manifest.outputs).length, 4);
    assert.equal(manifest.evaluation, "none; transformed SDK source was not imported or evaluated");
    for (const relative of files) verifySyntax(path.join(stageRoot, ...relative.split("/")));
    assert.ok(manifest.imports.some((edge) => edge.staged && edge.target === "dist/core/model-runtime.js"));
    assert.ok(manifest.imports.some((edge) => !edge.staged && edge.specifier === "@earendil-works/pi-ai"));
    assert.ok(readFileSync(path.join(stageRoot, "dist/main.js"), "utf8").includes(pathToFileURL(path.join(stageRoot, "dist/core/model-runtime.js")).href));
    if (version === "1.2.0") {
      for (const specifier of ["@earendil-works/pi-ai/providers/openrouter", "@earendil-works/pi-ai/providers/compat-schema", "@earendil-works/pi-ai/providers/model-schema"]) {
        assert.ok(manifest.imports.some((edge) => edge.specifier === specifier), `approved ${specifier} import`);
      }
    }
    assert.deepEqual(Object.fromEntries(["package.json", ...files].map((relative) => [relative, hash(readSdk(packageRoot, relative))])), protectedSources[version], `public source/package remains unchanged after ${version} stage`);
    const tamperedSource = readSdk(packageRoot, "dist/main.js").replace("async function runAuthCommand(args)", "async function runAuthCommand(other)");
    assert.throws(() => transformMainSource(tamperedSource), /source pin mismatch/);
    await assert.rejects(prepareSdkStage({ packageRoot, stageRoot, transforms }), /already exists/);
    await assert.rejects(prepareSdkStage({ packageRoot, stageRoot: path.join(packageRoot, "inside-stage"), transforms }), /paths overlap/);
  }

  const packageRoot = path.resolve(roots["1.1.0"]);
  const syntheticRoot = path.join(runRoot, "synthetic-tamper-source");
  mkdirSync(syntheticRoot, { recursive: true });
  writeFileSync(path.join(syntheticRoot, "package.json"), JSON.stringify({ name: "@earendil-works/pi-coding-agent", version: "1.1.0" }), { flag: "wx" });
  const refusedStage = path.join(runRoot, "refused-stage");
  await assert.rejects(prepareSdkStage({ packageRoot: syntheticRoot, stageRoot: refusedStage, transforms }), /package pin mismatch/);
  assert.equal(existsSync(refusedStage), false, "tampered SDK metadata is rejected before output creation");

  const dependencyFixture = path.join(runRoot, "synthetic-tamper-dependency");
  mkdirSync(path.join(dependencyFixture, "node_modules", "@earendil-works", "pi-ai"), { recursive: true });
  writeFileSync(path.join(dependencyFixture, "package.json"), readFileSync(path.join(packageRoot, "package.json")), { flag: "wx" });
  writeFileSync(path.join(dependencyFixture, "node_modules", "@earendil-works", "pi-ai", "package.json"), JSON.stringify({ name: "@earendil-works/pi-ai", version: "1.1.0" }), { flag: "wx" });
  const refusedDependencyStage = path.join(runRoot, "refused-dependency-stage");
  await assert.rejects(prepareSdkStage({ packageRoot: dependencyFixture, stageRoot: refusedDependencyStage, transforms }), /dependency pin mismatch: @earendil-works\/pi-ai/);
  assert.equal(existsSync(refusedDependencyStage), false, "tampered dependency is rejected before output creation");
});
