import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourceRoot = path.join(repositoryRoot, "extensions", "plastic-memory");
const hostPackageRoot = "/Users/j.henrique/npm-global/lib/node_modules/@earendil-works/pi-coding-agent";
const sandbox = mkdtempSync(path.join(tmpdir(), "plastic-memory-bootstrap-"));
const sandboxRoot = path.join(sandbox, "plastic-memory");
cpSync(sourceRoot, sandboxRoot, { recursive: true });

const importNode = (relative) => import(pathToFileURL(path.join(sandboxRoot, relative)).href);
const calls = [];
const fakePi = new Proxy({}, {
  get(_target, property) {
    return (..._args) => { calls.push(String(property)); };
  },
});

try {
  // Plain Node must load every foundation module from a manifest-free sandbox.
  const nodeConfig = await importNode("config.ts");
  const nodeIds = await importNode("common/ids.ts");
  const nodeSafety = await importNode("common/safety.ts");
  const nodeRoot = await importNode("index.ts");
  nodeRoot.default(fakePi);

  assert.equal(nodeConfig.loadConfig().enabled, false, "absent config must be inert");
  assert.equal(nodeConfig.loadConfig({ enabled: "yes" }).enabled, false, "invalid config must be inert");
  assert.equal(nodeConfig.loadConfig({ enabled: true }).enabled, true, "legacy enabled shorthand remains compatible");

  // Settings resolution is pure: these are temporary in-memory objects, not host settings.
  const globalSettings = {
    "plastic-memory": {
      enabled: false,
      projectCaps: { summaryChars: 8_000, categoryChars: 4_000 },
      pool: { maxTokens: 20_000 },
    },
    packages: ["npm:other-package", "npm:pi-observational-memory@3.0.3"],
  };
  const projectSettings = {
    "plastic-memory": {
      enabled: true,
      projectCaps: { indexChars: 4_000 },
      pool: { targetTokens: 10_000 },
    },
    packages: ["npm:unrelated-package", "npm:pi-observational-memory"],
  };
  Object.defineProperty(globalSettings, "unrelatedNamespace", {
    get() { throw new Error("real settings must not be read"); },
  });
  const resolved = nodeConfig.resolvePlasticMemorySettings(globalSettings, projectSettings);
  assert.equal(resolved.config.enabled, true, "project namespace fields override global fields");
  assert.deepEqual(resolved.config.projectCaps, { summaryChars: 8_000, indexChars: 4_000, categoryChars: 4_000 });
  assert.deepEqual(resolved.config.pool, { maxTokens: 20_000, targetTokens: 10_000 });
  assert.deepEqual(resolved.observationalMemoryConfigured, { global: true, project: true, any: true });

  const projectDisabled = nodeConfig.resolvePlasticMemorySettings(
    globalSettings,
    { "plastic-memory": { enabled: false }, packages: [] },
  );
  assert.equal(projectDisabled.config.enabled, false, "project disable takes precedence");
  const projectEnabled = nodeConfig.resolvePlasticMemorySettings(
    globalSettings,
    { "plastic-memory": { enabled: true }, packages: [] },
  );
  assert.equal(projectEnabled.config.enabled, true, "project enable takes precedence");

  // Previously saved role overrides must not silently disable Plastic Memory.
  // The configured input stays untouched; only the resolved runtime uses Luna 6.
  const oldRoles = Object.fromEntries(nodeConfig.ROLE_NAMES.map((name) => [name, { model: "openai-codex/gpt-5.6-luna" }]));
  const oldSettings = { "plastic-memory": { enabled: true, roles: oldRoles } };
  const upgraded = nodeConfig.resolvePlasticMemorySettings(oldSettings);
  assert.equal(upgraded.config.enabled, true);
  for (const role of nodeConfig.ROLE_NAMES) {
    assert.equal(upgraded.config.roles[role].model, "openai-codex/gpt-6-luna");
    assert.equal(oldRoles[role].model, "openai-codex/gpt-5.6-luna", "saved settings must not change");
  }
  assert.equal(nodeConfig.loadConfig({ ...nodeConfig.defaultConfig(), enabled: true, roles: Object.fromEntries(
    nodeConfig.ROLE_NAMES.map((name) => [name, { ...nodeConfig.DEFAULT_CONFIG.roles[name], model: "openai-codex/gpt-5.6-luna" }]),
  ) }).roles.compactor.model, "openai-codex/gpt-6-luna");
  assert.equal(nodeConfig.resolvePlasticMemorySettings({ "plastic-memory": { enabled: true, roles: { observer: { model: "openai-codex/unknown" } } } }).config.enabled, false);

  assert.equal(nodeConfig.resolvePlasticMemorySettings({ "plastic-memory": null }, projectSettings).config.enabled, false);
  assert.equal(nodeConfig.resolvePlasticMemorySettings({ "plastic-memory": { enabled: "yes" } }, projectSettings).config.enabled, false);
  assert.equal(nodeConfig.resolvePlasticMemorySettings(globalSettings, { "plastic-memory": { pool: { extra: true } } }).config.enabled, false);
  assert.equal(nodeConfig.isObservationalMemoryPackageSpec("npm:pi-observational-memory@3.0.3"), true);
  assert.equal(nodeConfig.isObservationalMemoryPackageSpec("npm:pi-observational-memory"), true);
  assert.equal(nodeConfig.isObservationalMemoryPackageSpec("npm:pi-observational-memory-extra@3.0.3"), false);
  assert.equal(nodeConfig.hasObservationalMemoryPackage(["npm:other-package"]), false);

  assert.deepEqual(nodeConfig.ROLE_NAMES, ["observer", "reflector", "compactor", "project-promoter"]);
  assert.deepEqual(Object.keys(nodeConfig.DEFAULT_CONFIG.roles), nodeConfig.ROLE_NAMES);
  for (const role of nodeConfig.ROLE_NAMES) {
    assert.deepEqual(nodeConfig.DEFAULT_CONFIG.roles[role], {
      model: "openai-codex/gpt-6-luna",
      thinking: "medium",
      maxTurns: 8,
      maxToolCalls: 4,
      maxRuntimeMs: 60_000,
    });
  }
  assert.equal(nodeConfig.DEFAULT_CONFIG.edgeTriggers.observeAfterTokens, 10_000);
  assert.equal(nodeConfig.DEFAULT_CONFIG.edgeTriggers.reflectAfterTokens, 20_000);
  assert.equal(nodeConfig.DEFAULT_CONFIG.pool.maxTokens, 20_000);
  assert.equal(nodeConfig.DEFAULT_CONFIG.pool.targetTokens, 10_000);
  assert.equal(nodeConfig.DEFAULT_CONFIG.automaticRetryCount, 1);
  assert.equal(nodeConfig.DEFAULT_CONFIG.pendingTtlMs, 300_000);
  assert.equal(nodeConfig.DEFAULT_CONFIG.summaryCapChars, 48_000);
  assert.deepEqual(nodeConfig.DEFAULT_CONFIG.projectCaps, { summaryChars: 8_000, indexChars: 4_000, categoryChars: 4_000 });

  const session = nodeIds.sessionDigest("session-01", { cwd: "/sandbox", generation: 1 });
  const record = nodeIds.recordDigest("session-01", { cwd: "/sandbox", generation: 1 }, { source: "entry-01", content: "full provenance" });
  assert.match(session, /^[a-f0-9]{24}$/);
  assert.match(record, /^[a-f0-9]{24}$/);
  assert.match(nodeIds.makeObservationId(session, record), /^pm:o:[a-f0-9]{24}:[a-f0-9]{24}$/);
  assert.match(nodeIds.makeReflectionId(session, record), /^pm:r:[a-f0-9]{24}:[a-f0-9]{24}$/);
  assert.match(nodeIds.makeQueryId(session, record), /^pm:q:[a-f0-9]{24}:[a-f0-9]{24}$/);
  assert.match(nodeIds.makeProjectId({ repo: "/sandbox", branch: "main" }, { name: "demo" }), /^pm:p:[a-f0-9]{32}$/);
  assert.match(nodeIds.makeChunkId({ repo: "/sandbox", branch: "main" }, { category: "bugs", body: "full" }), /^pm:c:[a-f0-9]{32}$/);
  assert.match(nodeIds.makeCycleId(session, record), /^pm:cy:[a-f0-9]{24}:[a-f0-9]{24}$/);
  assert.match(nodeIds.makeAttemptId(session, record, 0), /^pm:at:[a-f0-9]{24}:[a-f0-9]{24}:0$/);
  assert.equal(nodeIds.parseLegacyMemoryId("abcdef012345"), "abcdef012345");
  assert.equal(nodeIds.parseLegacyMemoryId("ABCDEF012345"), undefined, "legacy IDs remain raw lowercase input only");
  assert.equal(nodeIds.isPublicId("pm:o:bad:bad"), false);
  assert.equal(nodeIds.isInternalId("pm:at:bad:bad:-1"), false);

  nodeSafety.assertSafeRelativePath("docs/memory.md");
  assert.throws(() => nodeSafety.assertSafeRelativePath("../outside"));
  assert.throws(() => nodeSafety.assertSafeRelativePath("/absolute"));
  assert.throws(() => nodeSafety.assertSafeContent("token=super-secret", 100));
  assert.throws(() => nodeSafety.assertSafeContent("person@example.com", 100));
  const scrubbed = nodeSafety.scrubSensitiveText("token=super-secret person@example.com");
  assert.equal(scrubbed.includes("super-secret"), false);
  assert.equal(scrubbed.includes("person@example.com"), false);
  assert.equal(nodeSafety.sha256Hex("plastic-memory"), nodeSafety.sha256Hex("plastic-memory"));

  const notice = readFileSync(path.join(sandboxRoot, "THIRD-PARTY-NOTICES.md"), "utf8");
  assert.equal((notice.match(/^MIT License$/gmu) ?? []).length, 2);
  assert.match(notice, /Copyright \(c\) 2026 pi-observational-memory contributors/);
  assert.match(notice, /Copyright \(c\) 2026 Semantic Compact Contributors/);
  assert.match(notice, /Adaptation provenance/);
  assert.deepEqual(calls, [], "inert root must register no hooks, tools, commands, shortcuts, or flags");

  // The installed Pi jiti loader must load the same sandbox without a manifest or
  // dependency resolution through the user's active extension directory.
  const { createJiti } = await import(pathToFileURL(path.join(hostPackageRoot, "node_modules/jiti/lib/jiti.mjs")).href);
  const jiti = createJiti(import.meta.url, { moduleCache: false });
  const jitiConfig = await jiti.import(path.join(sandboxRoot, "config.ts"));
  const jitiIds = await jiti.import(path.join(sandboxRoot, "common/ids.ts"));
  const jitiSafety = await jiti.import(path.join(sandboxRoot, "common/safety.ts"));
  const jitiRoot = await jiti.import(path.join(sandboxRoot, "index.ts"));
  const jitiCalls = [];
  jitiRoot.default(new Proxy({}, { get: () => (..._args) => jitiCalls.push(true) }));
  assert.equal(jitiConfig.DEFAULT_CONFIG.roles.compactor.model, "openai-codex/gpt-6-luna");
  assert.equal(jitiIds.parseLegacyMemoryId("abcdef012345"), "abcdef012345");
  assert.equal(jitiSafety.scrubSensitiveText("api_key=hidden").includes("hidden"), false);
  assert.deepEqual(jitiCalls, [], "Pi jiti inert root must register nothing");

  console.log("BOOTSTRAP: PASS (Node + Pi jiti, four Luna-medium roles, IDs/safety/notices, zero registrations)");
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}
