import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = "/Users/j.henrique/npm-global/lib/node_modules/@earendil-works/pi-coding-agent";
const { createJiti } = await import(pathToFileURL(path.join(packageRoot, "node_modules/jiti/lib/jiti.mjs")).href);
const jiti = createJiti(import.meta.url, { moduleCache: false });
const projection = await jiti.import(path.join(root, "plastic-memory/compaction/projection.ts"));
const coordinatorModule = await jiti.import(path.join(root, "plastic-memory/runtime/coordinator.ts"));
const pendingModule = await jiti.import(path.join(root, "plastic-memory/compaction/pending.ts"));

function entry(id, parentId, role = "user") {
  return { type: "message", id, parentId, message: { role, content: [{ type: "text", text: id }] } };
}
const branch = [entry("C1", undefined), entry("C2", "C1", "assistant"), entry("C3", "C2"), entry("C4", "C3", "assistant")];
function compaction(id, parentId, from, through, stateDigest) {
  const header = `PLASTIC-COMPACTION ${stateDigest}`;
  return {
    type: "compaction", id, parentId, firstKeptEntryId: through,
    summary: `${header}\nverified body`,
    details: { plastic: { kind: "cumulative", state: "verified", stateDigest, header, sourceEntryIds: ["C1", "C2", ...(through === "C4" ? ["C3", "C4"] : [])] } },
  };
}
const old = compaction("old", "C4", "C1", "C2", "old-state");
const latest = compaction("latest", "old", "C1", "C4", "latest-state");
const fullBranch = [...branch, old, latest];
const contextEntries = [latest, old];
const messages = [
  { role: "compactionSummary", summary: latest.summary },
  { role: "compactionSummary", summary: old.summary },
  { role: "user", content: [{ type: "text", text: "descendant" }] },
];
const projected = projection.projectPlasticContext({ messages, branchEntries: fullBranch, contextEntries });
assert.equal(projected.status, "projected");
assert.equal(projected.removed, 1);
assert.deepEqual(projected.messages.map((message) => message.role), ["compactionSummary", "user"]);
assert.equal(projected.messages[0].summary, latest.summary);

const native = { type: "compaction", id: "native", parentId: "C4", firstKeptEntryId: "C2", summary: "host-native" };
const nativeResult = projection.projectPlasticContext({
  messages: [{ role: "compactionSummary", summary: "host-native" }],
  branchEntries: [...branch, native], contextEntries: [native],
});
assert.equal(nativeResult.status, "noop");
assert.deepEqual(nativeResult.messages, [{ role: "compactionSummary", summary: "host-native" }]);

const ambiguous = projection.projectPlasticContext({
  messages: [
    { role: "compactionSummary", summary: latest.summary },
    { role: "compactionSummary", summary: "host-native" },
    { role: "compactionSummary", summary: old.summary },
  ],
  branchEntries: [...branch, old, { ...native, parentId: old.id }, { ...latest, parentId: native.id }], contextEntries: [latest, native, old],
});
assert.equal(ambiguous.status, "blocked");
assert.equal(ambiguous.removed, 0);

// Registration is direct and provider-free: the coordinator only asks Pi for
// public session/context/lifecycle callbacks and does not register a provider.
const handlers = new Map();
const pi = {
  on(type, handler) { handlers.set(type, handler); },
  appendEntry() { throw new Error("workers are intentionally not enabled in this probe"); },
};
const coordinator = coordinatorModule.registerPlasticMemoryCoordinator(pi, { enabled: true });
const sessionManager = {
  getSessionId: () => "session",
  getLeafId: () => undefined,
  getEntries: () => [],
  getBranch: () => [],
  buildContextEntries: () => [],
};
const ctx = { sessionManager, isIdle: () => true, hasPendingMessages: () => false, compact: () => {} };
await handlers.get("session_start")({ type: "session_start", reason: "startup" }, ctx);
assert.equal(coordinator.getGeneration(), 1);
assert.ok(handlers.has("session_before_compact"));
assert.ok(handlers.has("context"));
await handlers.get("session_shutdown")({ type: "session_shutdown", reason: "quit" }, ctx);
assert.equal(coordinator.getGeneration(), 2);

// The host forwards customInstructions unchanged to session_before_compact.
// Exercise the coordinator's live intent boundary directly so private-prefix
// values cancel unless they are the exact live nonce, while ordinary manual
// custom instructions retain native fallback.
function makeNonceProbe() {
  const probeHandlers = new Map();
  const probePi = {
    on(type, handler) { probeHandlers.set(type, handler); },
    appendEntry() {},
  };
  const branch = [];
  const compactCalls = [];
  const sessionManager = {
    getSessionId: () => "nonce-session",
    getLeafId: () => branch.at(-1)?.id,
    getEntries: () => branch,
    getBranch: () => branch,
    buildContextEntries: () => branch,
  };
  const probeCtx = {
    sessionManager,
    isIdle: () => true,
    hasPendingMessages: () => false,
    compact: (options) => compactCalls.push(options),
  };
  const probe = coordinatorModule.registerPlasticMemoryCoordinator(probePi, { enabled: true, now: () => 1_000 });
  const beforeCompact = (event) => probeHandlers.get("session_before_compact")(event, probeCtx);
  return {
    probe,
    probeCtx,
    branch,
    compactCalls,
    beforeCompact,
    async start() { await probeHandlers.get("session_start")({ type: "session_start", reason: "startup" }, probeCtx); },
    async restart() {
      await probeHandlers.get("session_before_switch")({ type: "session_before_switch" }, probeCtx);
      await probeHandlers.get("session_start")({ type: "session_start", reason: "switch" }, probeCtx);
    },
    stagePending() {
      const binding = probe.getBinding(probeCtx);
      const pending = pendingModule.makePendingCompaction({
        slotId: `nonce-slot-${binding.generation}`,
        binding,
        runtimeToken: probe.runtimeToken,
        preparedPrefixIds: branch.map((entry) => entry.id),
        cut: { firstKeptEntryId: branch[0].id, cutDigest: "nonce-cut", detailsDigest: "nonce-details", summaryHeader: "nonce-summary" },
        stateDigest: "nonce-state",
        now: 1_000,
      });
      probe.pendingStore.stage(pending);
      probe.preparedViews.set(pending, { summary: "nonce summary", details: { plastic: { state: "verified" } } });
      return pending;
    },
    settle() { probeHandlers.get("agent_settled")({ type: "agent_settled" }, probeCtx); },
  };
}
const nonceProbe = makeNonceProbe();
await nonceProbe.start();
assert.deepEqual(nonceProbe.beforeCompact({
  customInstructions: "\u0000plastic-memory:internal-compaction:no-live-intent",
  reason: "manual",
  preparation: { firstKeptEntryId: "missing", tokensBefore: 1 },
  branchEntries: nonceProbe.branch,
}), { cancel: true }, "private-prefix compaction without a live intent must cancel");
nonceProbe.branch.push(entry("N1", undefined), entry("N2", "N1", "assistant"));
nonceProbe.stagePending();
nonceProbe.settle();
assert.equal(nonceProbe.compactCalls.length, 1);
const firstNonce = nonceProbe.compactCalls[0].customInstructions;
assert.match(firstNonce, /^\u0000plastic-memory:internal-compaction:[0-9a-f-]{36}$/);
assert.notEqual(firstNonce, "Apply the already-prepared plastic-memory summary only when the guarded hook accepts the exact host cut.");

// A new generation makes the first nonce stale; the new settled intent gets a
// distinct value. Clear staged state while probing fallback classification.
await nonceProbe.restart();
nonceProbe.stagePending();
nonceProbe.settle();
assert.equal(nonceProbe.compactCalls.length, 2);
const realNonce = nonceProbe.compactCalls[1].customInstructions;
assert.notEqual(realNonce, firstNonce);
nonceProbe.probe.pendingStore.clear();
const preparation = { firstKeptEntryId: "N1", tokensBefore: 1 };
const eventFor = (customInstructions) => ({ customInstructions, reason: "manual", preparation, branchEntries: nonceProbe.branch });
const formerStatic = "Apply the already-prepared plastic-memory summary only when the guarded hook accepts the exact host cut.";
const wrongNonce = `${realNonce.slice(0, realNonce.lastIndexOf(":") + 1)}wrong`;
assert.equal(nonceProbe.beforeCompact(eventFor(formerStatic)), undefined, "ordinary manual custom instructions must remain native fallback");
let nativeFallbackCount = 0;
for (const [label, customInstructions] of [["wrong nonce", wrongNonce], ["stale nonce", firstNonce]]) {
  const result = nonceProbe.beforeCompact(eventFor(customInstructions));
  assert.deepEqual(result, { cancel: true }, `${label} must cancel rather than native-fallback`);
  if (result === undefined) nativeFallbackCount += 1;
}
assert.equal(nativeFallbackCount, 0, "private-prefix nonce attempts must never native-fallback");

// Re-stage fresh state and verify only the exact live nonce consumes it. A
// second synchronous event with that nonce is cancelled before a second append.
nonceProbe.stagePending();
const exactResult = nonceProbe.beforeCompact(eventFor(realNonce));
assert.equal(typeof exactResult?.compaction?.summary, "string");
assert.equal(nonceProbe.probe.internalIntent.consumed, true);
const overlapResult = nonceProbe.beforeCompact(eventFor(realNonce));
assert.deepEqual(overlapResult, { cancel: true });
let appendCount = 0;
if (exactResult?.compaction) appendCount += 1;
if (overlapResult?.compaction) appendCount += 1;
assert.equal(appendCount, 1, "exact nonce overlap must produce one append result");
nonceProbe.probe.shutdown("nonce-test");

// A real Pi 0.83.0 in-memory session loads the coordinator directly. The
// visible model is fake and no provider/network/auth state is used by the
// coordinator; this checks the public runner lifecycle and shutdown path.
const {
  DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager, createAgentSession,
} = await import(pathToFileURL(path.join(packageRoot, "dist/index.js")).href);
const sandbox = mkdtempSync(path.join(tmpdir(), "plastic-memory-integration-"));
const extensionPath = path.join(sandbox, "coordinator.ts");
writeFileSync(extensionPath, `import { registerPlasticMemoryCoordinator } from ${JSON.stringify(path.join(root, "plastic-memory/runtime/coordinator.ts"))};\nexport default function (pi) { globalThis.__plasticCoordinator = registerPlasticMemoryCoordinator(pi, { enabled: true }); }\n`);
const fakeModel = {
  id: "integration-fake", name: "Integration Fake", api: "fake", provider: "integration-fake",
  baseUrl: "https://provider.invalid", reasoning: false, input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 100_000, maxTokens: 1_000,
};
const assistant = () => ({ role: "assistant", content: [{ type: "text", text: "integration response" }], api: "fake", provider: "integration-fake", model: "integration-fake", usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: "stop", timestamp: Date.now() });
const settingsManager = SettingsManager.inMemory({ compaction: { enabled: true, keepRecentTokens: 1 } });
const modelRuntime = await ModelRuntime.create({ authPath: path.join(sandbox, "auth.json"), modelsPath: null, allowModelNetwork: false });
const resourceLoader = new DefaultResourceLoader({ cwd: sandbox, agentDir: path.join(sandbox, "agent"), settingsManager, additionalExtensionPaths: [extensionPath] });
await resourceLoader.reload();
const hostSessionManager = SessionManager.inMemory(sandbox);
const sessionResult = await createAgentSession({ cwd: sandbox, agentDir: path.join(sandbox, "agent"), model: fakeModel, modelRuntime, resourceLoader, settingsManager, sessionManager: hostSessionManager, noTools: "all", thinkingLevel: "off" });
sessionResult.session.agent.streamFunction = async function* () { yield { type: "start", partial: { ...assistant(), content: [] } }; yield { type: "done", reason: "stop", message: assistant() }; };
await sessionResult.session.bindExtensions({ mode: "print" });
assert.equal(globalThis.__plasticCoordinator.getGeneration(), 1);
await sessionResult.session.agent.prompt("host lifecycle probe");
assert.equal(sessionResult.session.sessionManager.getEntries().some((entry) => entry.type === "custom" && entry.customType === "plastic.bootstrap.recorded"), true);
sessionResult.session.dispose();
rmSync(sandbox, { recursive: true, force: true });
delete globalThis.__plasticCoordinator;
console.log("PLASTIC_MEMORY_INTEGRATION: PASS (Pi 0.83.0 in-memory registration, structural projection, native/emergency preservation, ambiguous blocking, generation invalidation)");
