import { loadJiti } from "./lib/pi-sdk.mjs";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { createJiti } = await loadJiti(import.meta.url);
const jiti = createJiti(import.meta.url, { moduleCache: false });
const ids = await jiti.import(path.join(root, "plastic-memory/common/ids.ts"));
const types = await jiti.import(path.join(root, "plastic-memory/session/types.ts"));
const ledger = await jiti.import(path.join(root, "plastic-memory/session/ledger.ts"));
const recall = await jiti.import(path.join(root, "plastic-memory/session/recall.ts"));
const renderSummary = await jiti.import(path.join(root, "plastic-memory/session/render-summary.ts"));
const backfill = await jiti.import(path.join(root, "plastic-memory/session/backfill.ts"));
const tools = await jiti.import(path.join(root, "plastic-memory/runtime/tools.ts"));
const commands = await jiti.import(path.join(root, "plastic-memory/runtime/commands.ts"));
const projectSearch = await jiti.import(path.join(root, "plastic-memory/project/search.ts"));
const projectStore = await jiti.import(path.join(root, "plastic-memory/project/store.ts"));

const binding = { sessionId: ids.sessionDigest("surface-smoke", { generation: 1 }), generation: 1, branchId: "main" };
let sequence = 0;
const entries = [];
function append(type, extra = {}) {
  const entry = { type, id: `e${++sequence}`, parentId: entries.at(-1)?.id ?? null, ...extra };
  entries.push(entry);
  return entry;
}
function message(role, text, tokenCount = 1) {
  return append("message", { message: { role, content: [{ type: "text", text }] }, tokenCount });
}
function legacyObservation(id, sourceEntryIds) {
  return { id, content: `legacy fact #${id.slice(-2)}`, timestamp: "2026-08-03T00:00:00.000Z", relevance: "high", sourceEntryIds, tokenCount: 2 };
}
function syntheticTurn(prefix, count, terminalIndex) {
  const entries = [];
  for (let index = 0; index < count; index += 1) {
    const entry = { type: "message", id: `${prefix}-${index}`, parentId: entries.at(-1)?.id ?? null, message: { role: index === terminalIndex ? "assistant" : "user", content: [{ type: "text", text: `${prefix} ${index}` }] }, tokenCount: 1 };
    entries.push(entry);
  }
  return entries;
}
const oldUser = message("user", "historical user turn", 2);
const oldAnswer = message("assistant", "historical terminal answer", 2);
const rawId = "abcdef000001";
append("custom", { customType: types.LEGACY_OBSERVATIONS_RECORDED, data: { observations: [legacyObservation(rawId, [oldUser.id])], coversUpToId: oldAnswer.id } });
const dropped = append("custom", { customType: types.LEGACY_OBSERVATIONS_DROPPED, data: { observationIds: [rawId], coversUpToId: oldAnswer.id } });
const reflectionId = "abcdef000002";
append("custom", { customType: types.LEGACY_REFLECTIONS_RECORDED, data: { reflections: [{ id: reflectionId, content: "historical reflection #durable", supportingObservationIds: [rawId, "missing-support"], tokenCount: 2 }], coversUpToId: oldAnswer.id } });
const currentUser = message("user", "active current goal", 1);
const currentAnswer = message("assistant", "active current answer", 1);
const newObservationId = ids.makeObservationId(binding.sessionId, ids.recordDigest(binding.sessionId, { kind: "new-observation" }, { source: currentAnswer.id }));
append("custom", { customType: types.PLASTIC_OBSERVATIONS_RECORDED, data: { schemaVersion: 1, ...binding, observations: [{ id: newObservationId, content: "new namespaced fact", timestamp: "2026-08-03T00:00:00.000Z", relevance: "medium", sourceEntryIds: [currentAnswer.id], tokenCount: 2 }], span: { sourceStartId: currentUser.id, sourceEndId: currentAnswer.id, sourceEntryIds: [currentUser.id, currentAnswer.id], sourceDigest: ledger.sourceDigest([currentUser, currentAnswer]), completedTurnEndId: currentAnswer.id } } });
const proposalId = ids.makeQueryId(binding.sessionId, ids.recordDigest(binding.sessionId, { kind: "proposal" }, { source: currentAnswer.id }));
append("custom", { customType: types.PLASTIC_PROJECT_PROPOSAL_RECORDED, data: { schemaVersion: 1, ...binding, proposalId, sourceDigest: ledger.sourceDigest([currentUser, currentAnswer]), projectId: "pm:p:" + "a".repeat(32) } });
const structuredProposalId = ids.makeQueryId(binding.sessionId, ids.recordDigest(binding.sessionId, { kind: "structured-surface-proposal" }, { source: currentAnswer.id }));
append("custom", { customType: types.PLASTIC_PROJECT_PROPOSAL_RECORDED, data: {
  schemaVersion: 1, ...binding, proposalId: structuredProposalId, sourceDigest: "b".repeat(24), projectId: "pm:p:" + "a".repeat(32),
  candidate: { category: "bugs", title: "Structured surface candidate", target: "src/surface.ts", body: "A structured candidate remains recallable.", confidence: "known", evidence: [{ id: "surface-structured", path: "extensions/test/plastic-memory-surfaces.smoke.mjs", claim: "The structured fixture is explicit." }] },
  source: { kind: "plastic-compaction", compactionEntryId: "surface-compaction", acknowledgementDigest: "c".repeat(24), stateDigest: "d".repeat(32) },
} });
const forkOnly = { type: "message", id: "fork-only", parentId: oldAnswer.id, message: { role: "user", content: [{ type: "text", text: "off branch secret" }] }, tokenCount: 1 };

// Exact raw recall retains tombstone, reflection support gaps, and current-branch honesty.
const raw = recall.recallSession({ entries: [...entries, forkOnly], binding, leafId: currentAnswer.id, id: rawId });
assert.equal(raw.status, "found");
assert.equal(raw.collision, false);
assert.equal(raw.observations[0].status, "dropped");
assert.deepEqual(raw.sourceEntries.map((entry) => entry.id), [oldUser.id]);
assert.equal(raw.sourceEntries.some((entry) => entry.id === forkOnly.id), false);
const namespaced = recall.recallSession({ entries, binding, leafId: entries.at(-1).id, id: newObservationId });
assert.equal(namespaced.status, "found");
assert.deepEqual(namespaced.sourceEntries.map((entry) => entry.id), [currentAnswer.id]);
const proposal = recall.recallSession({ entries, binding, leafId: entries.at(-1).id, id: proposalId });
assert.equal(proposal.kind, "proposal");
assert.equal(proposal.proposals[0].proposal.projectId, "pm:p:" + "a".repeat(32));
const structuredProposal = recall.recallSession({ entries, binding, leafId: entries.at(-1).id, id: structuredProposalId });
assert.equal(structuredProposal.kind, "proposal");
assert.equal(structuredProposal.proposals[0].proposal.candidate.title, "Structured surface candidate");
assert.equal(structuredProposal.proposals[0].proposal.source.kind, "plastic-compaction");
const reflected = recall.recallSession({ entries, binding, leafId: currentAnswer.id, id: reflectionId });
assert.equal(reflected.status, "partial");
assert.deepEqual(reflected.missingSupportingObservationIds, ["missing-support"]);

// The visible compaction index is folded from the current branch, not Luna
// prose or hidden structured state. Every rendered memory id is exact-recallable.
const sessionSummary = renderSummary.renderSessionSummary([...entries, forkOnly], { binding, leafId: entries.at(-1).id });
assert.match(sessionSummary, /Use memory_recall only with an exact observation or reflection ID shown in this index/u);
assert.match(sessionSummary, new RegExp(`\\[${reflectionId}\\] historical reflection`));
assert.match(sessionSummary, new RegExp(`\\[${newObservationId}\\][^\\n]*new namespaced fact`));
assert.equal(sessionSummary.includes(`[${rawId}]`), false, "dropped observation id must not be indexed");
assert.equal(sessionSummary.includes("legacy fact"), false, "dropped observation content must not be indexed");
assert.equal(sessionSummary.includes("historical user turn"), false, "source message bodies must not be indexed");
assert.equal(sessionSummary.includes("off branch secret"), false, "off-branch source must not be indexed");
const renderedObservationId = sessionSummary.match(/\[(pm:o:[a-f0-9:]+)\]/u)?.[1];
assert.equal(renderedObservationId, newObservationId);
assert.equal(recall.recallSession({ entries, binding, leafId: entries.at(-1).id, id: renderedObservationId }).status, "found");
assert.equal(recall.recallSession({ entries, binding, leafId: currentAnswer.id, id: "ABCDEF000001" }).status, "unavailable");
assert.equal(recall.recallSession({ entries, binding, leafId: currentAnswer.id, id: "not-an-id" }).status, "unavailable");

const searched = recall.searchMemory({ entries, binding, leafId: currentAnswer.id, filters: { text: "durable", limit: 10 } });
assert.deepEqual(searched.matches.map((match) => match.id), [reflectionId]);
const projectRoot = mkdtempSync(path.join(tmpdir(), "plastic-memory-surfaces-project-"));
try {
  const store = new projectStore.ProjectStore(projectRoot, { now: () => "2026-08-03T20:00:00.000Z" });
  const evidence = { id: "surface", path: "extensions/test/plastic-memory-surfaces.smoke.mjs", claim: "The surface smoke fixture is explicit." };
  store.publish({ project: { provenance: { projectRoot }, name: "Surface fixture", repository: "fixture" }, candidate: { category: "bugs", title: "Searchable project fact", target: "src/fact.ts", confidence: "known", body: "project lexical fact #fixture", evidence: [evidence] } }, { accepted: true });
  const combined = recall.searchMemory({ entries, binding, leafId: currentAnswer.id, projectRoot, projectSearch: projectSearch.searchProject, filters: { text: "fact", limit: 10 } });
  assert.equal(combined.matches.some((match) => match.namespace === "project"), true);
  const beforeReport = readdirSync(projectRoot, { withFileTypes: true }).map((entry) => entry.name).sort();

  // Report is strictly read-only and the explicit processor is the only worker seam.
  const backfillInput = { binding, branchEntries: entries, bootstrap: { activeEntryIds: [currentUser.id, currentAnswer.id], historicalPrefixIds: [oldUser.id, oldAnswer.id], historicalGap: "historical-unindexed" }, records: [] };
  let processorCalls = 0;
  let writes = 0;
  const report = backfill.reportBackfill({ ...backfillInput, append: () => { writes += 1; } });
  assert.equal(report.noWrite, true);
  assert.equal(report.cost.providerCalls, 0);
  assert.equal(report.cost.writes, 0);
  assert.equal(processorCalls, 0);
  assert.equal(writes, 0);
  assert.deepEqual(readdirSync(projectRoot, { withFileTypes: true }).map((entry) => entry.name).sort(), beforeReport);
  const appendCursor = (entry) => { writes += 1; entries.push({ ...entry, id: `cursor-${++sequence}`, parentId: entries.at(-1)?.id ?? null }); };
  const completed = await backfill.startBackfill({ ...backfillInput, append: appendCursor }, () => { processorCalls += 1; return { outcome: "complete" }; });
  assert.equal(completed.status, "complete");
  assert.equal(processorCalls, 1);
  assert.equal(writes, 1);
  const rerun = await backfill.startBackfill({ ...backfillInput, records: entries, append: appendCursor }, () => { processorCalls += 1; return { outcome: "complete" }; });
  assert.equal(rerun.status, "complete");
  assert.equal(processorCalls, 1, "durable cursor makes a completed window idempotent");

  // A history larger than the per-window bound remains resumable across turns.
  const largeBinding = { ...binding, branchId: "large-history" };
  const largeEntries = [];
  const largeSourceIds = [];
  for (let index = 0; index < 1_001; index += 1) {
    const user = { type: "message", id: `large-${index}-user`, parentId: largeEntries.at(-1)?.id ?? null, message: { role: "user", content: [{ type: "text", text: `large historical user ${index}` }] }, tokenCount: 1 };
    const assistant = { type: "message", id: `large-${index}-assistant`, parentId: user.id, message: { role: "assistant", content: [{ type: "text", text: `large historical answer ${index}` }] }, tokenCount: 1 };
    largeEntries.push(user, assistant);
    largeSourceIds.push(user.id, assistant.id);
  }
  let largeProcessorCalls = 0;
  let largeWrites = 0;
  let largeCursorSequence = 0;
  const appendLargeCursor = (entry) => {
    largeWrites += 1;
    largeEntries.push({ ...entry, id: `large-cursor-${++largeCursorSequence}`, parentId: largeEntries.at(-1)?.id ?? null });
  };
  const largeBackfillInput = {
    binding: largeBinding,
    branchEntries: largeEntries,
    bootstrap: { activeEntryIds: [], historicalPrefixIds: largeSourceIds, historicalGap: "historical-unindexed" },
    records: [],
    append: appendLargeCursor,
  };
  assert.ok(largeSourceIds.length > 2_000);
  const largeReport = backfill.reportBackfill(largeBackfillInput);
  assert.equal(largeReport.status, "ready");
  assert.equal(largeReport.cost.providerCalls, 0);
  assert.equal(largeReport.cost.writes, 0);
  assert.equal(largeProcessorCalls, 0);
  assert.equal(largeWrites, 0);
  assert.ok(largeReport.safeWindows.length <= 8);
  assert.ok(largeReport.safeWindows.every((window) => window.sourceEntryIds.length <= 2_000));
  assert.equal(largeReport.safeWindows[0].sourceStartId, largeSourceIds[0]);
  const largeCompleted = await backfill.startBackfill(largeBackfillInput, () => { largeProcessorCalls += 1; return { outcome: "complete" }; });
  assert.equal(largeCompleted.status, "complete");
  assert.equal(largeCompleted.cursor.data.nextEntryId, largeSourceIds[2]);
  assert.equal(largeProcessorCalls, 1);
  assert.equal(largeWrites, 1);
  const nextLargeReport = backfill.reportBackfill({ ...largeBackfillInput, branchEntries: largeEntries, records: largeEntries });
  assert.equal(nextLargeReport.status, "ready");
  assert.equal(nextLargeReport.cost.providerCalls, 0);
  assert.equal(nextLargeReport.cost.writes, 0);
  assert.equal(nextLargeReport.safeWindows[0].sourceStartId, largeSourceIds[2]);
  assert.equal(largeProcessorCalls, 1);
  assert.equal(largeWrites, 1);

  const oversizedEntries = syntheticTurn("oversized", 2_001, 2_000);
  const oversizedReport = backfill.reportBackfill({ binding: { ...binding, branchId: "oversized" }, branchEntries: oversizedEntries, bootstrap: { activeEntryIds: [], historicalPrefixIds: oversizedEntries.map((entry) => entry.id), historicalGap: "historical-unindexed" }, records: [] });
  assert.equal(oversizedReport.status, "oversized");
  assert.equal(oversizedReport.safeWindows[0].sourceEntryIds.length, 2_000);
  const partialEntries = syntheticTurn("partial", 2_000, -1);
  const partialReport = backfill.reportBackfill({ binding: { ...binding, branchId: "partial" }, branchEntries: partialEntries, bootstrap: { activeEntryIds: [], historicalPrefixIds: partialEntries.map((entry) => entry.id), historicalGap: "historical-unindexed" }, records: [] });
  assert.equal(partialReport.status, "partial");
  assert.match(partialReport.gaps[0], /no terminal assistant/);

  const failureInput = { ...backfillInput, branchEntries: entries.filter((entry) => !entry.id.startsWith("cursor-")), append: () => { writes += 1; } };
  const failed = await backfill.startBackfill(failureInput, () => ({ outcome: "failed", reason: "fake worker failure" }));
  assert.equal(failed.status, "failed");
  const retryCalls = { count: 0 };
  const retryOnce = await backfill.startBackfill({ ...failureInput, priorRun: failed.runState }, () => { retryCalls.count += 1; return { outcome: "failed" }; });
  assert.equal(retryOnce.status, "failed");
  const suppressed = await backfill.startBackfill({ ...failureInput, priorRun: retryOnce.runState }, () => { retryCalls.count += 1; return { outcome: "failed" }; });
  assert.equal(suppressed.status, "suppressed");
  assert.equal(retryCalls.count, 1);
  const explicitRetry = await backfill.retryBackfill({ ...failureInput, priorRun: retryOnce.runState }, () => { retryCalls.count += 1; return { outcome: "complete" }; });
  assert.equal(explicitRetry.status, "complete");
  assert.equal(retryCalls.count, 2);

  // Injectable host surfaces register only namespaced tools and commands.
  const registeredTools = [];
  const api = { registerTool(definition) { registeredTools.push(definition); }, registerCommand(name, definition) { commandMap.set(name, definition); } };
  const operationCalls = [];
  const operationResult = (name, value) => { operationCalls.push([name, value]); return { status: "ok", name }; };
  const operationSet = {
    recall: (id) => operationResult("recall", id),
    search: (filters) => operationResult("search", filters),
    status: () => operationResult("status"),
    view: (args) => operationResult("view", args),
    propose: (args) => operationResult("propose", args),
    accept: (args) => operationResult("accept", args),
    reject: (args) => operationResult("reject", args),
    migrate: (args) => operationResult("migrate", args),
    backfill: (args) => operationResult("backfill", args),
    retry: (args) => operationResult("retry", args),
  };
  const commandMap = new Map();
  assert.deepEqual(tools.registerMemoryTools(api, operationSet), ["memory_recall", "memory_search"]);
  assert.deepEqual(registeredTools.map((tool) => tool.name), ["memory_recall", "memory_search"]);
  const recallResult = await registeredTools[0].execute("call", { id: rawId }, undefined, undefined, {});
  assert.equal(recallResult.details.name, "recall");
  const searchResult = await registeredTools[1].execute("call", { text: "bounded", limit: 2 }, undefined, undefined, {});
  assert.equal(searchResult.details.name, "search");
  commands.registerMemoryCommands(api, operationSet);
  assert.equal(commandMap.has("recall"), false);
  assert.equal(commandMap.has("memory:status"), true);
  assert.equal(commandMap.has("om:status"), true);
  assert.equal(commandMap.has("memory:backfill"), true);
  await commandMap.get("memory:backfill").handler("report", { ui: { notify() {} } });
  assert.deepEqual(operationCalls.at(-1), ["backfill", { action: "report" }]);
  await commandMap.get("memory:propose").handler("{\"accepted\":true}", { ui: { notify() {} } });
  assert.deepEqual(operationCalls.at(-1), ["propose", { accepted: true }]);
  await commandMap.get("memory:accept").handler("", { ui: { notify() {} } });
  assert.deepEqual(operationCalls.at(-1), ["accept", {}]);
  await commandMap.get("memory:accept").handler("proposal-1", { ui: { notify() {} } });
  assert.deepEqual(operationCalls.at(-1), ["accept", { proposalId: "proposal-1" }]);
  await commandMap.get("memory:accept").handler("{\"candidate\":true}", { ui: { notify() {} } });
  assert.deepEqual(operationCalls.at(-1), ["accept", { candidate: true }]);
  await commandMap.get("memory:reject").handler("proposal-1", { ui: { notify() {} } });
  assert.deepEqual(operationCalls.at(-1), ["reject", { proposalId: "proposal-1" }]);
  const malformedAccept = await commandMap.get("memory:accept").handler("one two", { ui: { notify() {} } });
  assert.equal(malformedAccept.status, "error");
  const malformedReject = await commandMap.get("memory:reject").handler("{\"proposalId\":\"proposal-1\"}", { ui: { notify() {} } });
  assert.equal(malformedReject.status, "error");
  const beforeRejectedPath = operationCalls.length;
  await commandMap.get("memory:migrate").handler("{\"root\":\"/outside\"}", { ui: { notify() {} } });
  assert.equal(operationCalls.length, beforeRejectedPath, "commands must reject arbitrary resource selection");
} finally {
  rmSync(projectRoot, { recursive: true, force: true });
}

console.log("PLASTIC_MEMORY_SURFACES: PASS (honest branch recall/search, read-only one-window backfill, durable cursor/retry control, injectable namespaced tools and commands)");
