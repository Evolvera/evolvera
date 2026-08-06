import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = "/Users/j.henrique/npm-global/lib/node_modules/@earendil-works/pi-coding-agent";
const { createJiti } = await import(pathToFileURL(path.join(packageRoot, "node_modules/jiti/lib/jiti.mjs")).href);
const jiti = createJiti(import.meta.url, { moduleCache: false });
const ids = await jiti.import(path.join(root, "plastic-memory/common/ids.ts"));
const ledger = await jiti.import(path.join(root, "plastic-memory/session/ledger.ts"));
const emergency = await jiti.import(path.join(root, "plastic-memory/compaction/emergency.ts"));

const binding = { sessionId: ids.sessionDigest("emergency-selection", { generation: 1 }), generation: 1, branchId: "main" };
function fixture(count, open = true, tokenCount = 1) {
  let next = 0;
  const entries = [];
  const append = (message) => {
    const entry = { type: "message", id: `e${++next}`, parentId: entries.at(-1)?.id ?? null, message, tokenCount };
    entries.push(entry);
    return entry;
  };
  const turns = [];
  for (let number = 1; number <= count; number += 1) {
    const user = append({ role: "user", content: [{ type: "text", text: `goal ${number}` }] });
    const call = append({ role: "assistant", content: [{ type: "toolCall", id: `call-${number}`, name: "read", arguments: { path: `src/${number}.ts` } }], stopReason: "toolUse" });
    const result = append({ role: "toolResult", toolCallId: `call-${number}`, content: [{ type: "text", text: "result" }] });
    const terminal = append({ role: "assistant", content: [{ type: "text", text: `done ${number}` }], stopReason: "stop" });
    turns.push({ user, ids: [user.id, call.id, result.id, terminal.id] });
  }
  if (open) {
    const user = append({ role: "user", content: [{ type: "text", text: "current incomplete turn" }] });
    const call = append({ role: "assistant", content: [{ type: "toolCall", id: "open-call", name: "read", arguments: { path: "src/open.ts" } }], stopReason: "toolUse" });
    const result = append({ role: "toolResult", toolCallId: "open-call", content: [{ type: "text", text: "still running" }] });
    turns.push({ user, ids: [user.id, call.id, result.id] });
  }
  const cycles = turns.slice(0, count).map((turn, index) => {
    const sourceEntries = turn.ids.map((id) => entries.find((entry) => entry.id === id));
    return {
      schemaVersion: 1, ...binding,
      cycleId: `cycle-${index + 1}`, attemptId: `attempt-${index + 1}`, snapshotId: `snapshot-${index + 1}`,
      status: "complete", sourceStartId: turn.user.id, sourceEndId: turn.ids.at(-1), completedTurnEndId: turn.ids.at(-1),
      sourceEntryIds: turn.ids, sourceDigest: ledger.sourceDigest(sourceEntries), observationIds: [], reflectionIds: [],
    };
  });
  return { entries, cycles, activeEntryIds: entries.map((entry) => entry.id) };
}
function budget(entries, contextWindow = 100, fixedTokens = 0, tokens = 1) {
  return { contextWindow, fixedTokens, entryTokens: Object.fromEntries(entries.map((entry) => [entry.id, tokens])) };
}
function select(data, physicalBudget = budget(data.entries)) {
  return emergency.selectEmergencyWindow({ binding, branchEntries: data.entries, activeEntryIds: data.activeEntryIds, cycles: data.cycles, physicalBudget });
}

// 0, 1, 2, and 3+ valid records all select a transient whole-turn prefix when a
// representable incomplete user boundary remains.
for (const count of [0, 1, 2, 3]) {
  const data = fixture(count + 1);
  const result = select({ ...data, cycles: data.cycles.slice(0, count) });
  assert.ok(result, `${count}-cycle emergency selection succeeds`);
  assert.equal(result.unit.kind, "transient-emergency");
  const expectedCut = count > 2 ? data.cycles[count - 2].sourceStartId : data.entries.at(-3).id;
  assert.equal(result.firstKeptEntryId, expectedCut, `${count}-cycle candidate removes the largest safe prefix under the fixture cap`);
  assert.equal(result.removedTokens, result.removedEntryIds.length);
  assert.ok(result.removedTokens > 0 && result.removedTokens <= result.maxRemovedTokens);
  assert.deepEqual(result.retainedEntryIds, data.entries.slice(result.removedEntryIds.length).map((entry) => entry.id));
  assert.deepEqual(result.unit.sourceEntryIds, data.entries.slice(0, result.removedEntryIds.length).map((entry) => entry.id));
  assert.equal(result.unit.sourceDigest, ledger.sourceDigest(data.entries.slice(0, result.removedEntryIds.length)));
  assert.equal(result.unit.cycleId.startsWith("cycle-"), false, "transient identity is code-owned, not a persisted cycle record");
}

// More than two valid cycles always leaves the newest two raw; the cap is a
// maximum on removed entry tokens, not an activation threshold.
{
  const data = fixture(4);
  const result = select(data, budget(data.entries, 20, 0, 1));
  assert.ok(result);
  assert.equal(result.firstKeptEntryId, data.cycles[2].sourceStartId);
  assert.equal(result.removedTokens, 8);
  assert.ok(result.removedTokens <= Math.floor(20 * 3 / 5));
}
{
  const data = fixture(4);
  const result = select(data, budget(data.entries, 100, 0, 1));
  assert.ok(result);
  assert.equal(result.firstKeptEntryId, data.cycles[2].sourceStartId, "60% does not trigger emergency selection or remove protected cycles");
}

// The incomplete turn is retained byte-for-byte, including its atomic tool call/result.
{
  const data = fixture(3);
  const result = select(data);
  assert.ok(result);
  const open = data.entries.slice(-3).map((entry) => entry.id);
  assert.deepEqual(result.retainedEntryIds.slice(-3), open);
  assert.equal(result.retainedEntryIds.includes("open-call"), false);
  assert.deepEqual(result.unit.sourceEntryIds, data.cycles[0].sourceEntryIds);
}

// Unknown token proof, stale digest, malformed order, and an unrepresentable cut fail closed.
{
  const data = fixture(3);
  const tokens = Object.fromEntries(data.entries.slice(1).map((entry) => [entry.id, 1]));
  assert.equal(select(data, { contextWindow: 100, fixedTokens: 0, entryTokens: tokens }), undefined);
  const stale = { ...data.cycles[0], sourceDigest: "stale-digest" };
  assert.equal(select({ ...data, cycles: [stale, ...data.cycles.slice(1)] }), undefined);
  const malformed = data.entries.map((entry, index) => index === 2 ? { ...entry, parentId: "foreign" } : entry);
  assert.equal(select({ ...data, entries: malformed, branchEntries: malformed }), undefined);
  const closed = fixture(1, false);
  assert.equal(select(closed), undefined, "branch ending at a closed turn has no representable firstKeptEntryId");
}

// A single indivisible exchange over the cap is never split to manufacture a fit.
{
  const data = fixture(1, true, 10);
  assert.equal(select(data, budget(data.entries, 20, 0, 10)), undefined);
}

console.log("PLASTIC_MEMORY_EMERGENCY_SELECTION: PASS (0/1/2/3 cycles, cap, preserve-two, open-turn and atomic exchange, transient facts, and fail-closed matrix)");
