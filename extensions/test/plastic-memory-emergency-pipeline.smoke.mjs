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
const types = await jiti.import(path.join(root, "plastic-memory/session/types.ts"));
const pending = await jiti.import(path.join(root, "plastic-memory/compaction/pending.ts"));
const emergency = await jiti.import(path.join(root, "plastic-memory/compaction/emergency.ts"));

const binding = { sessionId: ids.sessionDigest("emergency-pipeline", { generation: 1 }), generation: 1, branchId: "main" };
const entries = [];
function append(message) {
  const entry = { type: "message", id: `e${entries.length + 1}`, parentId: entries.at(-1)?.id ?? null, message, tokenCount: 1 };
  entries.push(entry);
  return entry;
}
const user = append({ role: "user", content: [{ type: "text", text: "preserve the emergency semantic goal" }] });
const terminal = append({ role: "assistant", content: [{ type: "text", text: "completed answer" }], stopReason: "stop" });
const open = append({ role: "user", content: [{ type: "text", text: "current incomplete turn" }] });
const cycle = {
  schemaVersion: 1,
  ...binding,
  cycleId: "cycle-1",
  attemptId: "attempt-1",
  snapshotId: "snapshot-1",
  status: "complete",
  sourceStartId: user.id,
  sourceEndId: terminal.id,
  completedTurnEndId: terminal.id,
  sourceEntryIds: [user.id, terminal.id],
  sourceDigest: ledger.sourceDigest([user, terminal]),
  observationIds: [],
  reflectionIds: [],
};
const selection = emergency.selectEmergencyWindow({
  binding,
  branchEntries: entries,
  activeEntryIds: entries.map((entry) => entry.id),
  cycles: [cycle],
  physicalBudget: { contextWindow: 100, fixedTokens: 0, entryTokens: Object.fromEntries(entries.map((entry) => [entry.id, 1])) },
});
assert.ok(selection);
assert.equal(selection.firstKeptEntryId, open.id);

const luna = { provider: "openai-codex", id: "gpt-5.6-luna", contextWindow: 200_000, maxTokens: 16_000 };
const sonnet = { provider: "anthropic", id: "claude-sonnet-5", contextWindow: 200_000, maxTokens: 16_000 };
const visible = { provider: "google", id: "visible-emergency-model", contextWindow: 200_000, maxTokens: 16_000 };
const models = new Map([
  ["openai-codex/gpt-5.6-luna", luna],
  ["anthropic/claude-sonnet-5", sonnet],
  ["google/visible-emergency-model", visible],
]);
const traces = [];
const phaseCalls = { observer: 0, reflector: 0, compactor: 0 };
const runtime = {
  modelRegistry: {
    find(provider, id) { return models.get(`${provider}/${id}`); },
    async getApiKeyAndHeaders() { return { ok: true, apiKey: "fake-in-process-key" }; },
  },
  async agentLoop(prompts, context, config) {
    const prompt = prompts[0].content[0].text;
    traces.push({ role: context.role, model: `${config.model.provider}/${config.model.id}`, prompt });
    phaseCalls[context.role] += 1;
    const input = JSON.parse(prompt);
    if (context.role === "observer") {
      if (phaseCalls.observer === 1) return { observations: [{ content: "bad citation", timestamp: "2026-08-06", relevance: "high", sourceEntryIds: ["outside-span"] }] };
      return { observations: [{ content: "durable emergency observation", timestamp: "2026-08-06", relevance: "high", sourceEntryIds: input.sourceEntryIds }] };
    }
    if (context.role === "reflector") {
      if (phaseCalls.reflector === 1) return { reflections: [{ content: "bad citation", supportingObservationIds: ["pm:o:outside"] }] };
      return { reflections: [{ content: "durable emergency reflection", supportingObservationIds: input.observations.map((observation) => observation.id) }] };
    }
    if (phaseCalls.compactor === 1) return { summary: "" };
    return { summary: "Semantic emergency summary", state: { facts: {} }, details: { sourceMetadataMustStayInternal: true } };
  },
};
const store = pending.createPendingStore();
const result = await emergency.prepareEmergencyCompaction({
  selection,
  binding,
  branchEntries: entries,
  runtime,
  visibleModel: visible,
  projectSnapshot: { summary: "bounded project summary", activeIndex: "bounded active index" },
  runtimeToken: "fake-runtime",
  now: 1_000,
  pendingStore: store,
});
assert.equal(result.ok, true);
assert.equal(result.cancel, false);
assert.equal(result.records.length, 2);
assert.deepEqual(result.records.map((record) => record.customType), [types.PLASTIC_OBSERVATIONS_RECORDED, types.PLASTIC_REFLECTIONS_RECORDED]);
assert.ok(result.records.every((record) => record.type === "custom"));
assert.equal(result.records.some((record) => record.customType === types.PLASTIC_CYCLE_ATTEMPTED || record.customType === types.PLASTIC_CYCLE_CLOSED), false);
assert.equal(result.pending.cut.firstKeptEntryId, selection.firstKeptEntryId);
assert.equal(result.pending.preparedPrefixDigest, safety.digestParts(entries.map((entry) => entry.id)).slice(0, 32));
assert.equal(store.peek(1_000), undefined, "emergency preparation does not mutate the pending store");
assert.equal(result.rendered.summary.includes(result.observations[0].id), true);
assert.equal(result.rendered.summary.includes(result.reflections[0].id), true);
assert.match(result.rendered.summary, /Use memory_recall only with an exact observation or reflection ID shown in this index/u);
assert.equal(result.rendered.summary.includes("sourceEntryIds"), false);
assert.equal(result.rendered.summary.includes("sourceMetadataMustStayInternal"), false);
assert.equal(result.rendered.summary.length <= 48_000, true);
assert.equal(result.rendered.summary.includes("Verified cumulative structured state."), false);
assert.equal(traces.filter((trace) => trace.role === "observer").length, 2);
assert.equal(traces.filter((trace) => trace.role === "reflector").length, 2);
assert.equal(traces.filter((trace) => trace.role === "compactor").length, 2);
for (const role of ["observer", "reflector", "compactor"]) {
  const roleTraces = traces.filter((trace) => trace.role === role);
  assert.equal(roleTraces[0].model, "openai-codex/gpt-5.6-luna");
  assert.equal(roleTraces[1].model, "openai-codex/gpt-5.6-luna");
  assert.equal(roleTraces[0].prompt, roleTraces[1].prompt, `${role} retries use immutable prompt bytes`);
}
assert.deepEqual(entries.map((entry) => entry.id), ["e1", "e2", "e3"], "pipeline does not mutate the host branch");

const deadlineFailure = await emergency.prepareEmergencyCompaction({
  selection,
  binding,
  branchEntries: entries,
  runtime,
  visibleModel: visible,
  projectSnapshot: { summary: "bounded project summary", activeIndex: "bounded active index" },
  deadlineMs: 0,
});
assert.deepEqual(deadlineFailure, { ok: false, cancel: true, reason: "emergency semantic pipeline failed" });
const failingRuntime = {
  ...runtime,
  async agentLoop() { throw new Error("raw provider payload must not escape"); },
};
const exhaustedFailure = await emergency.prepareEmergencyCompaction({
  selection,
  binding,
  branchEntries: entries,
  runtime: failingRuntime,
  visibleModel: visible,
  projectSnapshot: { summary: "bounded project summary", activeIndex: "bounded active index" },
  deadlineMs: 10_000,
});
assert.equal(exhaustedFailure.ok, false);
assert.equal(exhaustedFailure.cancel, true);
assert.equal(exhaustedFailure.reason, "emergency semantic pipeline failed");

console.log("PLASTIC_MEMORY_EMERGENCY_PIPELINE: PASS (semantic phases, immutable fallback, strict citations, overlay rendering, pending binding, deadline-safe transient result, and no cycle persistence)");
