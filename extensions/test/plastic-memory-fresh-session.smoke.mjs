import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = "/Users/j.henrique/npm-global/lib/node_modules/@earendil-works/pi-coding-agent";
const { createJiti } = await import(pathToFileURL(path.join(packageRoot, "node_modules/jiti/lib/jiti.mjs")).href);
const jiti = createJiti(import.meta.url, { moduleCache: false });
const ids = await jiti.import(path.join(root, "plastic-memory/common/ids.ts"));
const bootstrapModule = await jiti.import(path.join(root, "plastic-memory/session/bootstrap.ts"));
const ledger = await jiti.import(path.join(root, "plastic-memory/session/ledger.ts"));
const cycles = await jiti.import(path.join(root, "plastic-memory/session/cycles.ts"));
const schedulerModule = await jiti.import(path.join(root, "plastic-memory/workers/scheduler.ts"));

const binding = { sessionId: ids.sessionDigest("fresh-session-smoke", { generation: 1 }), generation: 1, branchId: "main" };
let next = 0;
const branch = [];
function append(entry) {
  const full = { ...entry, id: `e${++next}`, parentId: branch.at(-1)?.id ?? null };
  branch.push(full);
  return full;
}

// A genuinely fresh session: the coordinator bootstraps at session_start, when the branch
// carries only non-source entries and SessionManager.buildContextEntries() is empty.
const modelChange = append({ type: "model_change", data: { model: "openai-codex/gpt-5.6-luna" } });
const thinkingChange = append({ type: "thinking_level_change", data: { level: "medium" } });

const bootstrap = bootstrapModule.bootstrapSession({ entries: branch, binding, activeEntries: [] });
assert.equal(bootstrap.appended, true);
assert.deepEqual(bootstrap.state.activeEntryIds, [], "fresh session has an empty active window");
assert.deepEqual(bootstrap.state.historicalPrefixIds, [], "fresh session has no historical prefix");
assert.deepEqual(bootstrap.record.data.activeEntryIds, []);
assert.deepEqual(bootstrap.record.data.historicalPrefixIds, []);
assert.equal(bootstrap.record.data.activeStartId, undefined);
assert.equal(bootstrap.record.data.activeEndId, undefined);
assert.equal(bootstrap.record.data.historicalGap, "historical-unindexed");

const bootstrapData = bootstrap.record.data;
const bootstrapEntry = append({ type: "custom", customType: bootstrap.record.customType, data: bootstrapData });
const user = append({ type: "message", message: { role: "user", content: [{ type: "text", text: "first turn of a brand-new session" }] }, tokenCount: 10_000 });
const assistant = append({ type: "message", message: { role: "assistant", stopReason: "endTurn", content: [{ type: "text", text: "terminal answer" }] }, tokenCount: 10_000 });

// The fresh-session bootstrap is anchored by its own record: sources are exactly the
// entries appended after it, never anything that precedes the anchor.
const sources = ledger.normalSourceEntries(branch, bootstrapData);
assert.deepEqual(sources.map((entry) => entry.id), [user.id, assistant.id], "observer must read the first fresh-session turn");
assert.equal(sources.some((entry) => entry.id === bootstrapEntry.id || entry.id === modelChange.id || entry.id === thinkingChange.id), false,
  "no pre-bootstrap entry may enter the source window");

const snapshot = cycles.createCompletedTurnSnapshot({ binding, sourceEntries: sources });
assert.equal(snapshot.status, "ready");
assert.deepEqual(snapshot.span.sourceEntryIds, [user.id, assistant.id]);
assert.ok(snapshot.span.sourceEntryIds.length > 0);

// Negative cases preserved: an inconsistent empty window, and an unanchored bootstrap.
assert.deepEqual(ledger.normalSourceEntries(branch, { ...bootstrapData, activeStartId: user.id }), [],
  "an empty active window carrying activeStartId stays rejected");
assert.deepEqual(ledger.normalSourceEntries(branch, { ...bootstrapData, activeEndId: assistant.id }), [],
  "an empty active window carrying activeEndId stays rejected");
assert.deepEqual(ledger.normalSourceEntries(branch.filter((entry) => entry.id !== bootstrapEntry.id), bootstrapData), [],
  "without its own record on the branch the fresh bootstrap has no anchor");
assert.deepEqual(ledger.normalSourceEntries(branch, { ...bootstrapData, activeDigest: "not-the-recorded-digest" }), [],
  "a bootstrap that does not match the branch record has no anchor");
assert.deepEqual(ledger.normalSourceEntries(branch, { ...bootstrapData, historicalGap: "other" }), [],
  "only the historical-unindexed gap is selectable");

// Resumed session: the bootstrap records the PRIOR context window, so the new turn is a
// strict descendant of the anchor and is legitimately outside that window. The scheduler
// must not re-apply the stale window as a snapshot allow-set.
const resumedBootstrapData = { ...bootstrapData, activeEntryIds: [user.id, assistant.id], activeStartId: user.id, activeEndId: assistant.id, activeDigest: ledger.digestActiveWindow([user, assistant]) };
const resumedRecord = append({ type: "custom", customType: bootstrap.record.customType, data: resumedBootstrapData });
const resumedUser = append({ type: "message", message: { role: "user", content: [{ type: "text", text: "second session, first new turn" }] }, tokenCount: 10_000 });
const resumedAssistant = append({ type: "message", message: { role: "assistant", stopReason: "endTurn", content: [{ type: "text", text: "new terminal answer" }] }, tokenCount: 10_000 });

const resumedSources = ledger.normalSourceEntries(branch, resumedBootstrapData);
assert.deepEqual(resumedSources.map((entry) => entry.id), [user.id, assistant.id, resumedUser.id, resumedAssistant.id],
  "resume selects the prior active window plus the new descendants");
assert.equal(resumedRecord.type, "custom");

const resumedSnapshot = cycles.createCompletedTurnSnapshot({ binding, sourceEntries: resumedSources });
assert.equal(resumedSnapshot.status, "ready");
assert.equal(resumedSnapshot.span.sourceEntryIds.includes(resumedUser.id), true, "the new user message enters the snapshot");
assert.equal(resumedSnapshot.span.sourceEntryIds.includes(resumedAssistant.id), true, "the new terminal assistant enters the snapshot");

// Drive the real scheduler with an offline runtime: the worker fails, but the cycle must
// reach an attempt record instead of throwing "snapshot source is outside the active bootstrap window".
const appended = [];
const offlineRuntime = {
  modelRegistry: {
    find: () => ({ provider: "openai-codex", id: "gpt-5.6-luna", contextWindow: 200_000, maxTokens: 16_000 }),
    async getProviderAuth() { return { apiKey: "fake-only" }; },
  },
  async agentLoop() { throw new Error("offline smoke runtime never calls a model"); },
};
const scheduler = schedulerModule.createCycleScheduler();
const resumedQueue = cycles.createQueuedCycleRecords({ binding, sourceEntries: resumedSources.slice(2) });
assert.equal(resumedQueue.length, 1, "the resumed qualifying turn is queued before worker execution");
const scheduled = await scheduler.trigger({ binding, branchEntries: branch, bootstrap: resumedBootstrapData, records: resumedQueue, runtime: offlineRuntime, append: (entry) => appended.push(entry) });
assert.equal(scheduled.status, "failed", "an offline worker fails closed rather than throwing");
assert.equal(scheduled.snapshot.status, "ready");
assert.deepEqual(scheduled.snapshot.span.sourceEntryIds, resumedQueue[0].data.sourceEntryIds, "queued resume uses the exact new-turn manifest");
assert.equal(appended.some((entry) => entry.customType === "plastic.cycle.attempted"), true, "the resumed turn produces a cycle attempt");
scheduler.shutdown();

console.log("PLASTIC_MEMORY_FRESH_SESSION: PASS (empty-window bootstrap anchored by its own record, pre-bootstrap history excluded, unanchored/inconsistent windows rejected, resumed-session descendants schedule without throwing)");
