import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = "/Users/j.henrique/npm-global/lib/node_modules/@earendil-works/pi-coding-agent";
const { createJiti } = await import(pathToFileURL(path.join(packageRoot, "node_modules/jiti/lib/jiti.mjs")).href);
const jiti = createJiti(import.meta.url, { moduleCache: false });
const ids = await jiti.import(path.join(root, "plastic-memory/common/ids.ts"));
const safety = await jiti.import(path.join(root, "plastic-memory/common/safety.ts"));
const ledger = await jiti.import(path.join(root, "plastic-memory/session/ledger.ts"));
const cycles = await jiti.import(path.join(root, "plastic-memory/session/cycles.ts"));
const observer = await jiti.import(path.join(root, "plastic-memory/workers/observer.ts"));
const reflector = await jiti.import(path.join(root, "plastic-memory/workers/reflector.ts"));
const compactor = await jiti.import(path.join(root, "plastic-memory/workers/compactor.ts"));

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
let compactorMode = "valid";
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
    if (context.role === "compactor") {
      if (compactorMode === "legacy") return JSON.stringify({ summary: "legacy identity echo", state: { sourceEntryIds: request.readOnlyIdentityContext.sourceEntryIds } });
      return JSON.stringify({
        summary: "The cumulative state records the bounded work and its durable constraints.",
        state: { facts: { goals: request.deterministicFacts.goals } },
        details: { source: "offline contract smoke" },
      });
    }
    if (context.role === "observer") {
      return JSON.stringify({ observations: [{
        content: "The durable constraint is to preserve the bounded snapshot.",
        timestamp: "2026-08-03T00:00:00Z",
        relevance: "high",
        sourceEntryIds: [request.sourceEntryIds[0]],
        id: "pm:o:aaaaaaaaaaaaaaaaaaaaaaaa:bbbbbbbbbbbbbbbbbbbbbbbb",
      }] });
    }
    return JSON.stringify({ reflections: [{
      content: "The bounded snapshot constraint is durable.",
      supportingObservationIds: request.observations.map((observation) => observation.id),
      id: "pm:r:aaaaaaaaaaaaaaaaaaaaaaaa:bbbbbbbbbbbbbbbbbbbbbbbb",
    }] });
  },
};

const observerRequest = JSON.parse(observer.buildObserverRequest({ binding, snapshot, sourceEntries, runtime }));
assert.deepEqual(observerRequest.sourceEntryIds, snapshot.span.sourceEntryIds);
assert.equal(Object.hasOwn(observerRequest, "binding"), false);
assert.equal(Object.hasOwn(observerRequest, "snapshot"), false);
assert.equal(Object.hasOwn(observerRequest, "expectedCoverageManifest"), false);
assert.match(observerRequest.output.response, /single JSON object/);
const observed = await observer.runObserver({ binding, snapshot, sourceEntries, runtime });
assert.equal(observed.ok, true);
assert.equal(observed.status, "complete");
assert.equal(observed.manifestValid, true);
assert.equal(observed.observations.length, 1);
assert.equal(observed.observations[0].content, "The durable constraint is to preserve the bounded snapshot.");
assert.equal(typeof observed.observations[0].timestamp, "string");

const reflectorRequest = JSON.parse(reflector.buildReflectorRequest({ binding, snapshot, observations: observed.observations, runtime }));
assert.equal(Object.hasOwn(reflectorRequest, "binding"), false);
assert.equal(Object.hasOwn(reflectorRequest, "snapshot"), false);
assert.equal(Object.hasOwn(reflectorRequest, "expectedCoverageManifest"), false);
assert.match(reflectorRequest.output.reflections.item.supportingObservationIds, /non-empty subset/);
const reflected = await reflector.runReflector({ binding, snapshot, observations: observed.observations, runtime });
assert.equal(reflected.ok, true);
assert.equal(reflected.status, "complete");
assert.equal(reflected.manifestValid, true);
assert.equal(reflected.reflections.length, 1);
assert.equal(reflected.reflections[0].content, "The bounded snapshot constraint is durable.");
assert.deepEqual(reflected.reflections[0].supportingObservationIds, [observed.observations[0].id]);
assert.deepEqual(calls.map((call) => call.role), ["observer", "reflector"]);

const compactorBinding = { sessionId: ids.sessionDigest("worker-contract-compactor", { generation: 1 }), generation: 1, branchId: "main" };
const compactorSnapshot = { summary: "bounded compactor project summary", activeIndex: "{}" };
const compactorEntries = [];
function compactorCycle(number) {
  const user = { type: "message", id: `compact-user-${number}`, parentId: compactorEntries.at(-1)?.id ?? null, message: { role: "user", content: [{ type: "text", text: `Goal C${number}; must preserve the bounded constraint.` }] }, tokenCount: 8 };
  const assistant = { type: "message", id: `compact-assistant-${number}`, parentId: user.id, message: { role: "assistant", content: [{ type: "text", text: `Completed C${number}.` }] }, tokenCount: 8 };
  compactorEntries.push(user, assistant);
  return {
    schemaVersion: 1, ...compactorBinding,
    sourceStartId: user.id, sourceEndId: assistant.id, sourceEntryIds: [user.id, assistant.id],
    sourceDigest: ledger.sourceDigest([user, assistant]), completedTurnEndId: assistant.id,
    cycleId: `compact-cycle-${number}`, attemptId: `compact-attempt-${number}`, snapshotId: `compact-snapshot-${number}`,
    status: "complete", observationIds: [], reflectionIds: [],
  };
}
const compactorCycles = Array.from({ length: 6 }, (_, index) => compactorCycle(index + 1));
const priorFacts = { activeMemoryIds: [], files: [], commands: [], errors: [], decisions: [], constraints: ["Preserve the bounded constraint."], goals: ["Previous goal."], openLoops: [] };
const priorStateBase = { version: 1, cycleIds: ["prior-cycle"], sourceEntryIds: ["prior-entry"], sourceDigests: ["prior-digest"], facts: priorFacts, projectSnapshot: compactorSnapshot };
const priorState = { ...priorStateBase, stateDigest: safety.digestParts(priorStateBase).slice(0, 32) };
const compactorInput = {
  engine: { binding: compactorBinding, branchEntries: compactorEntries, cycles: compactorCycles, projectSnapshot: compactorSnapshot, runtimeToken: "offline" },
  eligibleCycles: compactorCycles.slice(0, 2),
  priorState,
  projectSnapshot: compactorSnapshot,
  runtime,
};
const compacted = await compactor.runCompactor(compactorInput);
assert.equal(compacted.ok, true);
assert.ok(compacted.prepared);
assert.ok(compacted.prepared.rendered.summary.startsWith("PLASTIC-COMPACTION cycle-range="));
const compactorRequest = calls.findLast((call) => call.role === "compactor")?.request;
assert.ok(compactorRequest);
assert.deepEqual(compactorRequest.readOnlyIdentityContext.cycleIds, compactorCycles.slice(0, 2).map((cycle) => cycle.cycleId));
assert.equal(Object.hasOwn(compactorRequest, "sourceEntryIds"), false);
assert.deepEqual(compactorRequest.priorStructuredState, priorState);
assert.deepEqual(compactorRequest.boundedProjectSnapshot, compactorSnapshot);
assert.match(compactorRequest.readOnlyIdentityContext.instruction, /READ-ONLY context only/);
assert.match(compactorRequest.output.identityRule, /HARD RULE/);
assert.match(compactorRequest.output.identityRule, /omit cycleIds, sourceEntryIds, and sourceDigests entirely/);
assert.deepEqual(Object.keys(compactorRequest.output.state.facts), ["activeMemoryIds", "files", "commands", "errors", "decisions", "constraints", "goals", "openLoops"]);

compactorMode = "legacy";
const legacyCompacted = await compactor.runCompactor(compactorInput);
assert.equal(legacyCompacted.ok, false);
assert.match(legacyCompacted.reason, /identity mismatch/);

// Semantic-only responses never need lifecycle identity. Citations remain strict.
const wideEntries = [1, 2].flatMap((turn) => {
  const user = { type: "message", id: `wide-user-${turn}`, parentId: turn === 1 ? null : `wide-assistant-${turn - 1}`, message: { role: "user", content: [{ type: "text", text: `Wide turn ${turn} constraint.` }] }, tokenCount: 8 };
  const assistant = { type: "message", id: `wide-assistant-${turn}`, parentId: user.id, message: { role: "assistant", content: [{ type: "text", text: `Wide turn ${turn} done.` }] }, tokenCount: 8 };
  return [user, assistant];
});
const wideSnapshot = cycles.createCompletedTurnSnapshot({ binding, sourceEntries: wideEntries, maxTokens: 100_000 });
const span = wideSnapshot.span.sourceEntryIds;
const stub = (responder) => ({ modelRegistry: runtime.modelRegistry, async agentLoop(prompts) { return JSON.stringify(responder(JSON.parse(prompts[0].content[0].text))); } });
const observeWith = (responder) => observer.runObserver({ binding, snapshot: wideSnapshot, sourceEntries: wideEntries, runtime: stub(responder) });
const observation = (cited, content = "Wide durable constraint.") => ({ content, timestamp: "2026-08-03T00:00:00Z", relevance: "high", sourceEntryIds: cited, id: "pm:o:ffffffffffffffffffffffff:eeeeeeeeeeeeeeeeeeeeeeee" });
const semantic = await observeWith(() => ({ observations: [observation([span[2], span[0], span[2]])] }));
assert.equal(semantic.ok, true);
assert.deepEqual(semantic.observations[0].sourceEntryIds, [span[0], span[2]]);
assert.notEqual(semantic.observations[0].id, "pm:o:ffffffffffffffffffffffff:eeeeeeeeeeeeeeeeeeeeeeee");
for (const cited of [[span[0], "outside-span"], [], [span[0], 7]]) {
  const bad = await observeWith(() => ({ observations: [observation(cited)] }));
  assert.equal(bad.ok, false);
  assert.equal(bad.reason, "observer returned an invalid observation (invalid-observation-sourceEntryIds)");
}
const noManifest = JSON.parse(observer.buildObserverRequest({ binding, snapshot: wideSnapshot, sourceEntries: wideEntries, runtime }));
assert.equal(Object.hasOwn(noManifest, "expectedCoverageManifest"), false);
assert.equal(Object.hasOwn(noManifest, "binding"), false);
const observationIds = semantic.observations.map((item) => item.id);
const reflectWith = (responder) => reflector.runReflector({ binding, snapshot: wideSnapshot, observations: semantic.observations, runtime: stub(responder) });
const reflectedSemantic = await reflectWith(() => ({ reflections: [{ content: "The wide constraint is durable.", supportingObservationIds: [observationIds[0], observationIds[0]], id: "pm:r:ffffffffffffffffffffffff:eeeeeeeeeeeeeeeeeeeeeeee" }] }));
assert.equal(reflectedSemantic.ok, true);
assert.notEqual(reflectedSemantic.reflections[0].id, "pm:r:ffffffffffffffffffffffff:eeeeeeeeeeeeeeeeeeeeeeee");
for (const cited of [[observationIds[0], "pm:o:deadbeef"], []]) {
  const bad = await reflectWith(() => ({ reflections: [{ content: "invalid", supportingObservationIds: cited }] }));
  assert.equal(bad.ok, false);
  assert.equal(bad.reason, "reflector returned an invalid reflection");
}
const reflectorPrompt = JSON.parse(reflector.buildReflectorRequest({ binding, snapshot: wideSnapshot, observations: semantic.observations, runtime }));
assert.equal(Object.hasOwn(reflectorPrompt, "expectedCoverageManifest"), false);
assert.match(reflectorPrompt.output.reflections.item.supportingObservationIds, /order does not matter/);
console.log("PLASTIC_MEMORY_WORKER_CONTRACT: PASS (semantic-only worker contracts, code-owned identity, strict citations, and compactor contract validate)");
