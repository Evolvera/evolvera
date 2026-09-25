import { loadJiti } from "./lib/pi-sdk.mjs";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { createJiti } = await loadJiti(import.meta.url);
const jiti = createJiti(import.meta.url, { moduleCache: false });
const coordinatorModule = await jiti.import(path.join(root, "plastic-memory/runtime/coordinator.ts"));
const engine = await jiti.import(path.join(root, "plastic-memory/compaction/engine.ts"));
const ledger = await jiti.import(path.join(root, "plastic-memory/session/ledger.ts"));
const ids = await jiti.import(path.join(root, "plastic-memory/common/ids.ts"));

const projectId = "pm:p:" + "a".repeat(32);
const projectSnapshot = { summary: "bounded project summary", activeIndex: "bounded active index" };
const model = { provider: "openai-codex", id: "gpt-6-luna", contextWindow: 200_000, maxTokens: 16_000 };
const candidate = {
  category: "decisions", title: "Keep promotion provenance fresh", target: "docs/promotion-provenance.md", body: "The candidate is a delayed, evidence-backed proposal only.", confidence: "known",
  evidence: [{ id: "promotion-lifecycle", path: "extensions/test/plastic-memory-promotion-lifecycle.smoke.mjs", claim: "The fake runtime proves the detached acknowledgement lifecycle." }],
};

function fakeLuna(request) {
  return {
    summary: "fake compaction summary",
    state: {
      facts: request.facts,
      cycleIds: [...(request.priorState?.cycleIds ?? []), ...request.cycleIds],
      sourceEntryIds: [...(request.priorState?.sourceEntryIds ?? []), ...request.sourceEntryIds],
      sourceDigests: [...(request.priorState?.sourceDigests ?? []), ...request.sourceDigests],
    },
  };
}

function fixture() {
  let nextId = 0;
  const entries = [];
  const spans = [];
  const append = (message) => {
    const entry = { type: "message", id: `entry-${++nextId}`, parentId: entries.at(-1)?.id ?? null, message, tokenCount: 5_000 };
    entries.push(entry);
    return entry;
  };
  for (let number = 1; number <= 6; number += 1) {
    const start = append({ role: "user", content: [{ type: "text", text: `goal ${number}` }] });
    const tool = append({ role: "assistant", content: [{ type: "toolCall", id: `call-${number}`, name: "functions.read", arguments: { path: `src/${number}.ts` } }], stopReason: "toolUse" });
    const result = append({ role: "toolResult", toolCallId: `call-${number}`, content: [{ type: "text", text: "read complete" }] });
    const end = append({ role: "assistant", content: [{ type: "text", text: `completed ${number}` }], stopReason: "stop" });
    spans.push({ start, end, ids: [start.id, tool.id, result.id, end.id] });
  }
  return { entries, spans };
}
function closedCycle(binding, span, entries) {
  const sourceEntries = span.ids.map((id) => entries.find((entry) => entry.id === id));
  return {
    schemaVersion: 1, ...binding, sourceStartId: span.start.id, sourceEndId: span.end.id,
    sourceEntryIds: span.ids, sourceDigest: ledger.sourceDigest(sourceEntries), completedTurnEndId: span.end.id,
    cycleId: `cycle-${span.start.id}`, attemptId: `attempt-${span.start.id}`, snapshotId: `snapshot-${span.start.id}`,
    status: "complete", observationIds: [], reflectionIds: [],
  };
}

/** A fake-only coordinator host; no filesystem, network, or live Pi session is used. */
function world() {
  const { entries, spans } = fixture();
  const handlers = new Map();
  const appended = [];
  const compactCalls = [];
  const promoterCalls = [];
  const gates = [];
  let clock = 2_000;
  let plasticSeq = 0;
  let compactionSeq = 0;
  const state = { branch: [...entries] };
  const runtime = {
    modelRegistry: {
      find(provider, id) { assert.equal(provider, "openai-codex"); assert.equal(id, "gpt-6-luna"); return model; },
      async getProviderAuth(provider) { assert.equal(provider, "openai-codex"); return { apiKey: "fake-only" }; },
    },
    async agentLoop(prompts, context, config, signal) {
      assert.equal(context.role, "project-promoter", "only the promoter runs in this lifecycle smoke");
      assert.equal(config.model, model);
      promoterCalls.push({ request: JSON.parse(prompts[0].content[0].text), context, signal });
      return await new Promise((resolve, reject) => {
        const gate = { resolve, reject };
        gates.push(gate);
        signal.addEventListener("abort", () => resolve({ candidate }), { once: true });
      });
    },
  };
  const pi = {
    on(event, handler) { handlers.set(event, handler); },
    appendEntry(customType, data) {
      appended.push({ customType, data });
      state.branch.push({ type: "custom", id: `plastic-${++plasticSeq}`, parentId: state.branch.at(-1)?.id, customType, data });
    },
    registerTool() {}, registerCommand() {},
  };
  const ctx = {
    cwd: root,
    hasUI: false,
    sessionManager: {
      getSessionId() { return "019fcf17-6e55-7646-89f9-4e0e0258b267"; },
      getEntries() { return state.branch; },
      getBranch() { return state.branch; },
      getLeafId() { return state.branch.at(-1).id; },
      buildContextEntries() { return state.branch; },
    },
    isIdle() { return true; },
    hasPendingMessages() { return false; },
    getContextUsage() { return { tokens: 21_000, contextWindow: 160_000 }; },
    getSystemPrompt() { return "synthetic system prompt"; },
    compact(request) { compactCalls.push(request); },
    ui: { notify() {} },
  };
  const coordinator = new coordinatorModule.PlasticMemoryCoordinator(pi, {
    enabled: true,
    runtime,
    runtimeToken: "promotion-lifecycle",
    projectId: () => projectId,
    now: () => clock,
  });
  handlers.get("session_start")({ type: "session_start", reason: "startup" }, ctx);
  const sourceBinding = coordinator.getBinding(ctx);
  const cycles = spans.map((span) => closedCycle(sourceBinding, span, entries));

  function stage() {
    clock += 1_000;
    const prepared = engine.prepareSemanticCompaction({
      binding: coordinator.getBinding(ctx), branchEntries: state.branch, cycles, projectSnapshot,
      runtimeToken: "promotion-lifecycle", now: clock, compact: fakeLuna,
    });
    assert.equal(prepared.eligible, true, `synthetic six-cycle state must prepare: ${prepared.reason}`);
    coordinator.pendingStore.stage(prepared.prepared.pending);
    coordinator.preparedViews.set(prepared.prepared.pending, {
      summary: prepared.prepared.rendered.summary,
      details: prepared.prepared.rendered.details,
      state: prepared.prepared.rendered.state,
    });
    return prepared.prepared;
  }
  async function apply() {
    const prepared = stage();
    const compaction = await handlers.get("session_before_compact")({
      type: "session_before_compact", branchEntries: state.branch,
      preparation: { firstKeptEntryId: state.branch[0].id, tokensBefore: 7_777 }, reason: "manual",
    }, ctx);
    assert.equal(compaction.compaction.firstKeptEntryId, prepared.cut.firstKeptEntryId);
    const host = {
      type: "compaction", id: `cmp-${++compactionSeq}`, parentId: state.branch.at(-1).id,
      timestamp: new Date(clock).toISOString(), summary: compaction.compaction.summary,
      firstKeptEntryId: compaction.compaction.firstKeptEntryId, tokensBefore: compaction.compaction.tokensBefore,
      details: compaction.compaction.details, usage: undefined, fromHook: true,
    };
    state.branch = [...state.branch, host];
    const hookResult = handlers.get("session_compact")({ type: "session_compact", compactionEntry: host }, ctx);
    assert.equal(hookResult, undefined, "session_compact remains synchronous and never awaits Luna");
    return { prepared, host };
  }
  return { coordinator, ctx, handlers, state, appended, compactCalls, promoterCalls, gates, apply, sourceBinding };
}

async function waitForGate(w) {
  for (let attempt = 0; attempt < 20 && w.gates.length === 0; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(w.gates.length, 1, "the detached promoter reaches its fake Luna gate");
}
async function settle() { await new Promise((resolve) => setTimeout(resolve, 0)); await Promise.resolve(); }
function proposals(w) { return w.appended.filter((entry) => entry.customType === "plastic.project.proposal.recorded"); }

// Acknowledgement is visible first, the rebase bootstraps a fresh binding, and the
// gate proves the session hook did not await Luna or issue another compaction.
const w = world();
const { prepared, host } = await w.apply();
assert.equal(w.appended.filter((entry) => entry.customType === "plastic.compaction.applied").length, 1);
assert.equal(proposals(w).length, 0, "no proposal is appended before gated Luna resolves");
assert.equal(w.compactCalls.length, 0, "promotion never adds ctx.compact");
const destination = w.coordinator.getBinding(w.ctx);
assert.equal(destination.sessionId, w.sourceBinding.sessionId);
assert.notDeepEqual(destination, w.sourceBinding, "rebase creates the fresh automatic destination binding");
assert.equal(w.appended.some((entry) => entry.customType === "plastic.bootstrap.recorded" && entry.data.generation === destination.generation), true);
await waitForGate(w);
assert.equal(w.promoterCalls[0].context.role, "project-promoter");
assert.deepEqual(w.promoterCalls[0].context.tools, [], "promoter has no filesystem or host tools");
assert.deepEqual(w.promoterCalls[0].request.projectSnapshot, prepared.rendered.state.projectSnapshot, "only the verified state snapshot is supplied");
assert.equal("binding" in w.promoterCalls[0].request, false, "Luna cannot supply destination binding authority");
w.gates[0].resolve({ candidate });
await settle();
assert.equal(proposals(w).length, 1, "a valid delayed structured candidate appends once");
const proposal = proposals(w)[0].data;
assert.deepEqual({ sessionId: proposal.sessionId, generation: proposal.generation, branchId: proposal.branchId }, destination);
const acknowledgement = w.appended.find((entry) => entry.customType === "plastic.compaction.applied").data;
const acknowledgementDigest = ids.recordDigest(destination.sessionId, { kind: "plastic-compaction-acknowledgement" }, acknowledgement);
const sourceDigest = ids.recordDigest(destination.sessionId, { compactionEntryId: host.id, acknowledgementDigest, stateDigest: prepared.rendered.state.stateDigest }, prepared.rendered.state.projectSnapshot);
assert.deepEqual(proposal.source, { kind: "plastic-compaction", compactionEntryId: host.id, acknowledgementDigest, stateDigest: prepared.rendered.state.stateDigest });
assert.equal(proposal.sourceDigest, sourceDigest);
assert.equal(proposal.proposalId, ids.makeQueryId(destination.sessionId, ids.recordDigest(destination.sessionId, { projectId, sourceDigest }, candidate)));
const branchTypes = w.state.branch.map((entry) => entry.customType ?? entry.type);
assert.ok(branchTypes.indexOf("plastic.compaction.applied") < branchTypes.findIndex((type, index) => type === "plastic.bootstrap.recorded" && w.state.branch[index].data?.generation === destination.generation));
assert.ok(branchTypes.findIndex((type, index) => type === "plastic.bootstrap.recorded" && w.state.branch[index].data?.generation === destination.generation) < branchTypes.indexOf("plastic.project.proposal.recorded"));
assert.equal(w.compactCalls.length, 0, "success adds no compaction request");

// Invalidation aborts/discards a late candidate even if the fake worker resolves after it.
const stale = world();
await stale.apply();
await waitForGate(stale);
stale.handlers.get("session_before_switch")({ type: "session_before_switch" }, stale.ctx);
stale.gates[0].resolve({ candidate });
await settle();
assert.equal(proposals(stale).length, 0, "switch invalidation discards late promotion results");
assert.equal(stale.compactCalls.length, 0, "stale promotion adds no compaction request");

// Worker failure is detached and leaves no partial proposal record behind.
const failed = world();
await failed.apply();
await waitForGate(failed);
failed.gates[0].reject(new Error("fake promoter failure"));
await settle();
assert.equal(proposals(failed).length, 0, "failed promoter output appends no record");
assert.equal(failed.compactCalls.length, 0, "failed promotion adds no compaction request");

console.log("PLASTIC_MEMORY_PROMOTION_LIFECYCLE: PASS (detached acknowledgement→fresh binding→structured proposal, stale/failure discard, no extra compaction)");
