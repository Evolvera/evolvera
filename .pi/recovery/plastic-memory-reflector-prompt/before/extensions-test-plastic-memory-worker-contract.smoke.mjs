import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = "/Users/j.henrique/npm-global/lib/node_modules/@earendil-works/pi-coding-agent";
const { createJiti } = await import(pathToFileURL(path.join(packageRoot, "node_modules/jiti/lib/jiti.mjs")).href);
const jiti = createJiti(import.meta.url, { moduleCache: false });
const ids = await jiti.import(path.join(root, "plastic-memory/common/ids.ts"));
const cycles = await jiti.import(path.join(root, "plastic-memory/session/cycles.ts"));
const observer = await jiti.import(path.join(root, "plastic-memory/workers/observer.ts"));
const reflector = await jiti.import(path.join(root, "plastic-memory/workers/reflector.ts"));

const binding = { sessionId: ids.sessionDigest("worker-contract-smoke", { generation: 1 }), generation: 1, branchId: "main" };
const sourceEntries = [
  { type: "message", id: "user-1", parentId: null, message: { role: "user", content: [{ type: "text", text: "Preserve this durable constraint." }] }, tokenCount: 8 },
  { type: "message", id: "assistant-1", parentId: "user-1", message: { role: "assistant", content: [{ type: "text", text: "The constraint is recorded." }] }, tokenCount: 8 },
];
const snapshot = cycles.createCompletedTurnSnapshot({ binding, sourceEntries, maxTokens: 100_000 });
assert.equal(snapshot.status, "ready");
const expectedCoverageManifest = {
  snapshotId: snapshot.snapshotId,
  cycleId: snapshot.cycleId,
  sourceDigest: snapshot.span.sourceDigest,
  completedTurnEndId: snapshot.span.completedTurnEndId,
  sourceEntryIds: snapshot.span.sourceEntryIds,
  sessionId: binding.sessionId,
  generation: binding.generation,
  branchId: binding.branchId,
};

const calls = [];
const model = { provider: "openai-codex", id: "gpt-5.6-luna", contextWindow: 200_000, maxTokens: 16_000 };
const runtime = {
  modelRegistry: {
    find(provider, id) {
      assert.equal(provider, "openai-codex");
      assert.equal(id, "gpt-5.6-luna");
      return model;
    },
    async getProviderAuth() { return { apiKey: "test-only" }; },
  },
  async agentLoop(prompts, context) {
    const request = JSON.parse(prompts[0].content[0].text);
    calls.push({ role: context.role, request });
    if (context.role === "observer") {
      return JSON.stringify({
        coverageManifest: request.expectedCoverageManifest,
        observations: [{
          content: "The durable constraint is to preserve the bounded snapshot.",
          timestamp: "2026-08-03T00:00:00Z",
          relevance: "high",
          sourceEntryIds: [request.expectedCoverageManifest.sourceEntryIds[0]],
        }],
      });
    }
    return JSON.stringify({
      coverageManifest: request.expectedCoverageManifest,
      reflections: [{
        content: "The bounded snapshot constraint is durable.",
        supportingObservationIds: request.observations.map((observation) => observation.id),
      }],
    });
  },
};

const observerRequest = JSON.parse(observer.buildObserverRequest({ binding, snapshot, sourceEntries, runtime }));
assert.deepEqual(observerRequest.expectedCoverageManifest, expectedCoverageManifest);
assert.deepEqual(Object.keys(observerRequest.expectedCoverageManifest), [
  "snapshotId", "cycleId", "sourceDigest", "completedTurnEndId", "sourceEntryIds", "sessionId", "generation", "branchId",
]);
assert.match(observerRequest.output.response, /single JSON object/);
const observed = await observer.runObserver({ binding, snapshot, sourceEntries, runtime });
assert.equal(observed.ok, true);
assert.equal(observed.status, "complete");
assert.equal(observed.manifestValid, true);
assert.equal(observed.observations.length, 1);
assert.equal(observed.observations[0].content, "The durable constraint is to preserve the bounded snapshot.");
assert.equal(typeof observed.observations[0].timestamp, "string");

const reflectorRequest = JSON.parse(reflector.buildReflectorRequest({ binding, snapshot, observations: observed.observations, runtime }));
assert.deepEqual(reflectorRequest.expectedCoverageManifest, expectedCoverageManifest);
assert.deepEqual(Object.keys(reflectorRequest.expectedCoverageManifest), Object.keys(observerRequest.expectedCoverageManifest));
assert.match(reflectorRequest.output.reflections.item.supportingObservationIds, /strictly ordered subset/);
const reflected = await reflector.runReflector({ binding, snapshot, observations: observed.observations, runtime });
assert.equal(reflected.ok, true);
assert.equal(reflected.status, "complete");
assert.equal(reflected.manifestValid, true);
assert.equal(reflected.reflections.length, 1);
assert.equal(reflected.reflections[0].content, "The bounded snapshot constraint is durable.");
assert.deepEqual(reflected.reflections[0].supportingObservationIds, [observed.observations[0].id]);
assert.deepEqual(calls.map((call) => call.role), ["observer", "reflector"]);

console.log("PLASTIC_MEMORY_WORKER_CONTRACT: PASS (literal manifests and observer/reflector item schemas validate)");
