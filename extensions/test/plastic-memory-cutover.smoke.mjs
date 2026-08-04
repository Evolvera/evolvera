import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const packageRoot = "/Users/j.henrique/npm-global/lib/node_modules/@earendil-works/pi-coding-agent";
const { createJiti } = await import(pathToFileURL(path.join(packageRoot, "node_modules/jiti/lib/jiti.mjs")).href);
const sandbox = mkdtempSync(path.join(tmpdir(), "plastic-memory-cutover-"));
const agentRoot = path.join(sandbox, "agent");
const projectRoot = path.join(sandbox, "project");
const sourceExtensionRoot = path.join(repositoryRoot, "extensions");
const sandboxExtensionRoot = path.join(agentRoot, "extensions");
mkdirSync(sandboxExtensionRoot, { recursive: true });
cpSync(path.join(sourceExtensionRoot, "plastic-memory"), path.join(sandboxExtensionRoot, "plastic-memory"), { recursive: true });
cpSync(path.join(sourceExtensionRoot, "project-memory.ts"), path.join(sandboxExtensionRoot, "project-memory.ts"));
mkdirSync(path.join(agentRoot, "skills", "project-memory", "scripts"), { recursive: true });
cpSync(path.join(repositoryRoot, "skills", "project-memory", "scripts", "validate-architecture.mjs"), path.join(agentRoot, "skills", "project-memory", "scripts", "validate-architecture.mjs"));
mkdirSync(path.join(projectRoot, ".pi"), { recursive: true });

const jiti = createJiti(import.meta.url, { moduleCache: false });
const rootPath = path.join(sandboxExtensionRoot, "plastic-memory", "index.ts");
const bridgePath = path.join(sandboxExtensionRoot, "project-memory.ts");
const rootModule = await jiti.import(rootPath);
const bridgeModule = await jiti.import(bridgePath);
const configModule = await jiti.import(path.join(sandboxExtensionRoot, "plastic-memory", "config.ts"));
const storeModule = await jiti.import(path.join(sandboxExtensionRoot, "plastic-memory", "project", "store.ts"));
const contextModule = await jiti.import(path.join(sandboxExtensionRoot, "plastic-memory", "project", "context.ts"));

function writeSettings(globalValue, projectValue) {
  writeFileSync(path.join(agentRoot, "settings.json"), `${JSON.stringify(globalValue)}\n`);
  const file = path.join(projectRoot, ".pi", "settings.json");
  if (projectValue === undefined) rmSync(file, { force: true });
  else writeFileSync(file, `${JSON.stringify(projectValue)}\n`);
}
function fakePi() {
  const calls = { hooks: new Map(), tools: [], commands: [] };
  return {
    calls,
    on(name, handler) { calls.hooks.set(name, handler); },
    registerTool(definition) { calls.tools.push(definition); },
    registerCommand(name, options) { calls.commands.push([name, options]); },
    appendEntry() {},
  };
}
async function loadMode(globalValue, projectValue) {
  writeSettings(globalValue, projectValue);
  process.chdir(projectRoot);
  const rootPi = fakePi();
  const bridgePi = fakePi();
  await rootModule.default(rootPi);
  bridgeModule.default(bridgePi);
  return { root: rootPi.calls, bridge: bridgePi.calls };
}
function hookNames(calls) { return [...calls.hooks.keys()]; }
function assertInertRoot(calls, label) {
  assert.deepEqual(hookNames(calls.root), [], `${label}: root hooks`);
  assert.deepEqual(calls.root.tools, [], `${label}: root tools`);
  assert.deepEqual(calls.root.commands, [], `${label}: root commands`);
}
function enabledConfig() { return { "plastic-memory": { enabled: true } }; }

try {
  assert.equal(rootModule.resolvePlasticMemoryOwnerMode({ "plastic-memory": { enabled: true } }, {}), "full");
  assert.equal(rootModule.resolvePlasticMemoryOwnerMode({ "plastic-memory": { enabled: true }, packages: ["npm:pi-observational-memory@3.0.3"] }, {}), "bridge");
  assert.equal(rootModule.resolvePlasticMemoryOwnerMode({ "plastic-memory": { enabled: true } }, { packages: ["npm:pi-observational-memory"] }), "bridge");
  assert.equal(rootModule.resolvePlasticMemoryOwnerMode({ "plastic-memory": { enabled: "yes" } }, {}), "bridge");
  assert.equal(rootModule.resolvePlasticMemoryOwnerMode(undefined, undefined), "bridge");
  assert.equal(configModule.isObservationalMemoryPackageSpec("npm:pi-observational-memory-extra@3"), false);

  for (const [label, globalValue, projectValue] of [
    ["disabled", { "plastic-memory": { enabled: false } }, {}],
    ["invalid", { "plastic-memory": { enabled: "yes" } }, undefined],
    ["missing", {}, undefined],
    ["OM-global", { ...enabledConfig(), packages: ["npm:pi-observational-memory@3.0.3"] }, {}],
    ["OM-project", enabledConfig(), { packages: ["npm:pi-observational-memory"] }],
  ]) {
    const mode = await loadMode(globalValue, projectValue);
    assertInertRoot(mode, label);
    assert.deepEqual(hookNames(mode.bridge), ["before_agent_start"], `${label}: one bridge context hook`);
  }

  writeSettings(enabledConfig(), {});
  writeFileSync(path.join(agentRoot, "settings.json"), "{malformed settings\n");
  process.chdir(projectRoot);
  const malformed = fakePi();
  const malformedBridge = fakePi();
  await rootModule.default(malformed);
  bridgeModule.default(malformedBridge);
  assertInertRoot({ root: malformed.calls }, "unreadable settings");
  assert.deepEqual(hookNames(malformedBridge.calls), ["before_agent_start"], "unreadable settings: fail-closed bridge");

  const full = await loadMode(enabledConfig(), {});
  assert.deepEqual(full.bridge.hooks.size, 0, "full mode bridge is empty");
  assert.equal(full.root.tools.length, 2, "full mode has recall/search tools");
  assert.deepEqual(full.root.tools.map((tool) => tool.name), ["memory_recall", "memory_search"]);
  assert.deepEqual(full.root.commands.map(([name]) => name), [
    "memory:status", "memory:view", "memory:propose", "memory:accept", "memory:migrate", "memory:backfill", "memory:retry", "om:status", "om:view",
  ]);
  assert.equal(hookNames(full.root).filter((name) => name === "before_agent_start").length, 1);
  assert.equal(hookNames(full.root).filter((name) => name === "context").length, 1);
  assert.equal(hookNames(full.root).filter((name) => name === "session_before_compact").length, 1);
  assert.equal(hookNames(full.root).filter((name) => name === "session_before_compact").length + full.bridge.hooks.size, 1);
  assert.equal(hookNames(full.root).filter((name) => name === "before_agent_start").length + full.bridge.hooks.size, 1);

  // The checked-in source configuration enables plastic-memory. Loading the
  // real entries must therefore give the root full ownership and keep the
  // legacy project bridge inert.
  process.chdir(repositoryRoot);
  const sourceRootPi = fakePi();
  const sourceBridgePi = fakePi();
  await (await jiti.import(path.join(repositoryRoot, "extensions/plastic-memory/index.ts"))).default(sourceRootPi);
  (await jiti.import(path.join(repositoryRoot, "extensions/project-memory.ts"))).default(sourceBridgePi);
  assert.equal(sourceRootPi.calls.tools.length, 2, "source plastic root tools");
  assert.equal(sourceRootPi.calls.hooks.has("session_before_compact"), true, "source plastic root compaction hook");
  assert.deepEqual(hookNames(sourceBridgePi.calls), [], "source plastic bridge");

  const proposalCommand = full.root.commands.find(([name]) => name === "memory:propose")[1];
  const unavailableProposal = await proposalCommand.handler("{}", { ui: { notify() {} } });
  assert.equal(unavailableProposal.state, "unavailable", "promoter semantics remain honestly unavailable");

  // Build a disposable canonical fixture and prove that the owner hook uses the
  // shared bounded block, never the full chunk body. The ProjectStore publish
  // below is explicit test authority, not a claim that the unavailable promoter
  // command performs proposal-to-canonical publication.
  const canonicalCwd = path.join(sandbox, "canonical-project");
  const flatCwd = path.join(sandbox, "flat-project");
  const emptyCwd = path.join(sandbox, "empty-project");
  for (const cwd of [canonicalCwd, flatCwd, emptyCwd]) mkdirSync(path.join(cwd, ".pi", "memory"), { recursive: true });
  const memoryRoot = path.join(canonicalCwd, ".pi", "memory");
  const sentinel = "CUTOVER-FULL-CHUNK-SENTINEL-DO-NOT-INJECT ".repeat(80);
  const store = new storeModule.ProjectStore(memoryRoot, { now: () => "2026-08-03T20:00:00.000Z" });
  const published = store.publish({
    project: { provenance: { root: canonicalCwd }, name: "Cutover", repository: "fixture", sourceHead: "UNKNOWN" },
    candidate: { category: "bugs", title: "Cutover retrieval", target: "fixture.ts", confidence: "unknown", body: sentinel, evidence: [] },
  }, { accepted: true });
  writeFileSync(path.join(flatCwd, ".pi", "memory", "_summary.md"), "legacy flat summary\n".repeat(50));

  const contexts = [
    ["canonical", canonicalCwd],
    ["legacy-flat", flatCwd],
    ["uninitialized", emptyCwd],
  ];
  for (const [expectedMode, cwd] of contexts) {
    const expected = contextModule.assembleProjectContext(path.join(cwd, ".pi", "memory"), { architectureRoot: path.join(cwd, ".pi", "memory"), repositoryRoot: cwd });
    const hook = expectedMode === "canonical" ? full.root.hooks.get("before_agent_start") : (await loadMode({}, undefined)).bridge.hooks.get("before_agent_start");
    const ctx = { cwd, systemPrompt: "ORIGINAL-SYSTEM-PROMPT" };
    hook({}, ctx);
    assert.equal(expected.mode, expectedMode);
    assert.equal(ctx.systemPrompt, `${expected.block}\n\nORIGINAL-SYSTEM-PROMPT`, `${expectedMode}: shared bounded block`);
    assert.equal(ctx.systemPrompt.includes(sentinel), false, `${expectedMode}: no full chunk injection`);
  }

  // Tools are bound to the current ctx.cwd and current branch, never to an
  // argument-selected root. Project recall/search remain exact and bounded.
  const sessionManager = {
    getSessionId: () => "session",
    getLeafId: () => "message-1",
    getBranch: () => [{ type: "message", id: "message-1", message: { role: "user", content: "synthetic branch" } }],
  };
  const toolCtx = { cwd: canonicalCwd, sessionManager };
  const recallTool = full.root.tools.find((tool) => tool.name === "memory_recall");
  const searchTool = full.root.tools.find((tool) => tool.name === "memory_search");
  const recalled = await recallTool.execute("call-1", { id: published.chunkId }, undefined, undefined, toolCtx);
  assert.equal(recalled.isError, undefined);
  assert.equal(recalled.details.state, "found");
  assert.equal(recalled.details.chunk.body, sentinel);
  const searched = await searchTool.execute("call-2", { text: "Cutover retrieval" }, undefined, undefined, toolCtx);
  assert.equal(searched.details.matches.some((match) => match.id === published.chunkId), true);
  const foreign = await recallTool.execute("call-3", { id: published.chunkId }, undefined, undefined, { cwd: flatCwd, sessionManager });
  assert.equal(foreign.details.state, "unavailable", "recall cannot cross ctx.cwd roots");
  assert.equal(readFileSync(path.join(canonicalCwd, ".pi", "memory", "chunks", "bugs", `${published.chunkId.replaceAll(":", "-")}.md`), "utf8").includes(sentinel), true);

  console.log("PLASTIC_MEMORY_CUTOVER: PASS (all owner modes, one bridge/full owner, shared bounded context, exact current-root tools, aliases, and OM-inert source load)");
} finally {
  process.chdir(repositoryRoot);
  rmSync(sandbox, { recursive: true, force: true });
}
