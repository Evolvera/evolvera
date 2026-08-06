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

// --- optional manifest echo + normalized citation order (observer and reflector) ---
const wideEntries = [1, 2].flatMap((turn) => {
  const user = { type: "message", id: `wide-user-${turn}`, parentId: turn === 1 ? null : `wide-assistant-${turn - 1}`, message: { role: "user", content: [{ type: "text", text: `Wide turn ${turn} constraint.` }] }, tokenCount: 8 };
  const assistant = { type: "message", id: `wide-assistant-${turn}`, parentId: user.id, message: { role: "assistant", content: [{ type: "text", text: `Wide turn ${turn} done.` }] }, tokenCount: 8 };
  return [user, assistant];
});
const wideSnapshot = cycles.createCompletedTurnSnapshot({ binding, sourceEntries: wideEntries, maxTokens: 100_000 });
assert.equal(wideSnapshot.status, "ready");
const span = wideSnapshot.span.sourceEntryIds;
assert.ok(span.length >= 4);
const scalarManifest = () => {
  const { sourceEntryIds: _omitted, ...scalars } = expectedCoverageManifest;
  return { ...scalars, snapshotId: wideSnapshot.snapshotId, cycleId: wideSnapshot.cycleId, sourceDigest: wideSnapshot.span.sourceDigest, completedTurnEndId: wideSnapshot.span.completedTurnEndId };
};
const stub = (responder) => ({ modelRegistry: runtime.modelRegistry, async agentLoop(prompts, context) { return JSON.stringify(responder(JSON.parse(prompts[0].content[0].text), context)); } });
const observeWith = (responder) => observer.runObserver({ binding, snapshot: wideSnapshot, sourceEntries: wideEntries, runtime: stub(responder) });
const observation = (cited, content = "Wide durable constraint.") => ({ content, timestamp: "2026-08-03T00:00:00Z", relevance: "high", sourceEntryIds: cited });

// A1: manifest omitting sourceEntryIds is accepted and the stored span is untouched.
const omitted = await observeWith(() => ({ coverageManifest: scalarManifest(), observations: [observation([span[0]])] }));
assert.equal(omitted.ok, true);
assert.equal(omitted.manifestValid, true);
assert.deepEqual(omitted.record.data.span, wideSnapshot.span);

// A2: a supplied but wrong/reordered manifest array is still rejected.
for (const wrong of [[...span].reverse(), span.slice(0, 2), [...span.slice(0, -1), "not-an-entry"]]) {
  const bad = await observeWith(() => ({ coverageManifest: { ...scalarManifest(), sourceEntryIds: wrong }, observations: [] }));
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /coverage manifest is missing, reordered, or identity-mismatched/);
}

// A3: every scalar identity field stays required and exactly compared.
for (const key of ["snapshotId", "cycleId", "sourceDigest", "completedTurnEndId", "sessionId", "generation", "branchId"]) {
  for (const mutate of [(m) => { delete m[key]; return m; }, (m) => ({ ...m, [key]: "corrupted" })]) {
    const bad = await observeWith(() => ({ coverageManifest: mutate(scalarManifest()), observations: [] }));
    assert.equal(bad.ok, false, `scalar ${key} must be required`);
    assert.match(bad.reason, /coverage manifest is missing, reordered, or identity-mismatched/);
  }
}

// A4: out-of-order and duplicated citations are normalized, not rejected.
const normalized = await observeWith(() => ({ coverageManifest: scalarManifest(), observations: [observation([span[2], span[0], span[2]])] }));
assert.equal(normalized.ok, true);
assert.deepEqual(normalized.observations[0].sourceEntryIds, [span[0], span[2]]);

// A5/A6: membership and non-emptiness remain hard invariants.
for (const cited of [[span[0], "outside-span"], [], [span[0], 7]]) {
  const bad = await observeWith(() => ({ coverageManifest: scalarManifest(), observations: [observation(cited)] }));
  assert.equal(bad.ok, false);
  assert.equal(bad.reason, "observer returned an invalid observation");
}

// A7: the emitted prompt tells the model to omit the manifest ids.
const widePrompt = JSON.parse(observer.buildObserverRequest({ binding, snapshot: wideSnapshot, sourceEntries: wideEntries, runtime }));
assert.match(widePrompt.output.coverageManifest, /OMIT sourceEntryIds/);
assert.match(widePrompt.output.observations.item.sourceEntryIds, /order does not matter/);
assert.deepEqual(widePrompt.expectedCoverageManifest.sourceEntryIds, span);

const multi = await observeWith(() => ({
  coverageManifest: scalarManifest(),
  observations: ["alpha", "beta", "gamma"].map((word, index) => observation([span[index]], `Durable ${word} constraint.`)),
}));
assert.equal(multi.observations.length, 3);
const observationIds = multi.observations.map((item) => item.id);
const reflectWith = (responder) => reflector.runReflector({ binding, snapshot: wideSnapshot, observations: multi.observations, runtime: stub(responder) });
const reflection = (cited) => ({ content: "The wide constraint is durable.", supportingObservationIds: cited });

// B1: reflector accepts an omitted manifest array and keeps the stored span.
const reflectedOmitted = await reflectWith(() => ({ coverageManifest: scalarManifest(), reflections: [reflection([observationIds[0]])] }));
assert.equal(reflectedOmitted.ok, true);
assert.deepEqual(reflectedOmitted.record.data.span, wideSnapshot.span);

// B2/B3: supplied-but-wrong arrays and scalar corruption stay rejected.
const reflectedWrong = await reflectWith(() => ({ coverageManifest: { ...scalarManifest(), sourceEntryIds: [...span].reverse() }, reflections: [] }));
assert.equal(reflectedWrong.ok, false);
assert.match(reflectedWrong.reason, /coverage manifest is missing, reordered, or identity-mismatched/);
for (const key of ["snapshotId", "cycleId", "sourceDigest", "completedTurnEndId", "sessionId", "generation", "branchId"]) {
  const bad = await reflectWith(() => { const m = scalarManifest(); delete m[key]; return { coverageManifest: m, reflections: [] }; });
  assert.equal(bad.ok, false, `scalar ${key} must be required`);
  assert.match(bad.reason, /coverage manifest is missing, reordered, or identity-mismatched/);
}

// B4: supporting ids are deduplicated and ordered by observation position.
const reflectedNormalized = await reflectWith(() => ({ coverageManifest: scalarManifest(), reflections: [reflection([observationIds[2], observationIds[0], observationIds[2]])] }));
assert.equal(reflectedNormalized.ok, true);
assert.deepEqual(reflectedNormalized.reflections[0].supportingObservationIds, [observationIds[0], observationIds[2]]);

// B5/B6: outside ids and empty citations stay rejected.
for (const cited of [[observationIds[0], "pm:o:deadbeef"], []]) {
  const bad = await reflectWith(() => ({ coverageManifest: scalarManifest(), reflections: [reflection(cited)] }));
  assert.equal(bad.ok, false);
  assert.equal(bad.reason, "reflector returned an invalid reflection");
}

// B7: reflector prompt also instructs omission.
const widePromptReflector = JSON.parse(reflector.buildReflectorRequest({ binding, snapshot: wideSnapshot, observations: multi.observations, runtime }));
assert.match(widePromptReflector.output.coverageManifest, /OMIT sourceEntryIds/);
assert.match(widePromptReflector.output.reflections.item.supportingObservationIds, /order does not matter/);

console.log("PLASTIC_MEMORY_WORKER_CONTRACT: PASS (optional manifest echo, normalized citations, and observer/reflector/compactor contracts validate)");
