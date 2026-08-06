import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const types = await import(pathToFileURL(path.join(root, "plastic-memory/session/types.ts")).href);
const ids = await import(pathToFileURL(path.join(root, "plastic-memory/common/ids.ts")).href);
const renderSummary = await import(pathToFileURL(path.join(root, "plastic-memory/session/render-summary.ts")).href);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\[\]\\]/gu, "\\$&");
}
function countIdRows(summary, id) {
  const regex = new RegExp(`\\[${escapeRegExp(id)}\\]`, "gu");
  return summary.match(regex)?.length ?? 0;
}
function sectionRows(summary, title) {
  const capture = summary.match(new RegExp(`## ${title}\\n([\\s\\S]*?)(?:\\n## |$)`, "u"));
  if (!capture) return [];
  return capture[1].split("\n").filter((line) => line.startsWith("[")).map((line) => line.trim());
}

const binding = {
  sessionId: ids.sessionDigest("emergency-overlay", { cwd: "/tmp/emergency-summary", generation: 1 }),
  generation: 1,
  branchId: "main",
};
let next = 0;
const entries = [];
function append(type, extra = {}) {
  const entry = { type, id: `E${++next}`, parentId: entries.at(-1)?.id ?? null, ...extra };
  entries.push(entry);
  return entry;
}
function message(role, text, tokenCount = 1) {
  return append("message", { message: { role, content: [{ type: "text", text }] }, tokenCount });
}
function legacyObservation(id, sourceEntryIds, relevance = "medium") {
  return {
    id,
    content: `legacy fact ${id}`,
    timestamp: "2026-08-03T00:00:00.000Z",
    relevance,
    sourceEntryIds,
    tokenCount: 2,
  };
}
function legacyReflection(id, supportingObservationIds) {
  return { id, content: `legacy reflection ${id}`, supportingObservationIds, tokenCount: 1 };
}
function makeTransientObservation(content, sourceEntryId, relevance = "high") {
  return {
    id: ids.makeObservationId(binding.sessionId, ids.recordDigest(binding.sessionId, { kind: "emergency", content }, { sourceEntryId })),
    content,
    timestamp: "2026-08-03T00:00:00.000Z",
    relevance,
    sourceEntryIds: [sourceEntryId],
    tokenCount: Math.max(1, Math.ceil(content.length / 4)),
  };
}
function makeTransientReflection(content, supportingObservationIds) {
  return {
    id: ids.makeReflectionId(binding.sessionId, ids.recordDigest(binding.sessionId, { kind: "emergency", content }, supportingObservationIds)),
    content,
    supportingObservationIds,
    tokenCount: Math.max(1, Math.ceil(content.length / 4)),
  };
}

const historicalUser = message("user", "historical user question", 2);
const historicalAssistant = message("assistant", "historical answer", 2);
const keptObservationId = "a1a2a3a4a5a6";
const droppedObservationId = "b1b1b1b1b1b1";
const legacyReflectionId = "c1c1c1c1c1c1";
append("custom", {
  customType: types.LEGACY_OBSERVATIONS_RECORDED,
  data: {
    observations: [
      legacyObservation(keptObservationId, [historicalUser.id]),
      legacyObservation(droppedObservationId, [historicalUser.id], "low"),
    ],
    coversUpToId: historicalAssistant.id,
  },
});
append("custom", {
  customType: types.LEGACY_OBSERVATIONS_DROPPED,
  data: {
    observationIds: [droppedObservationId],
    coversUpToId: historicalAssistant.id,
  },
});
append("custom", {
  customType: types.LEGACY_REFLECTIONS_RECORDED,
  data: {
    reflections: [legacyReflection(legacyReflectionId, [keptObservationId])],
    coversUpToId: historicalAssistant.id,
  },
});
const activeUser = message("user", "latest goal", 1);
const activeAssistant = message("assistant", "latest answer", 1);

const noOverlay = renderSummary.renderSessionSummary(entries, { binding, leafId: activeAssistant.id });
assert.match(noOverlay, /Use memory_recall only with an exact observation or reflection ID shown in this index/u);
assert.equal(countIdRows(noOverlay, keptObservationId), 1, "kept legacy observation remains visible");
assert.equal(countIdRows(noOverlay, droppedObservationId), 0, "dropped legacy observation stays excluded");
assert.equal(renderSummary.renderSessionSummary(entries, { binding, leafId: activeAssistant.id, overlay: { observations: [], reflections: [] } }), noOverlay, "empty overlay is byte-identical");

const overlayObservationSecret = makeTransientObservation(
  "transient fact with api_key=supersecret and email user@example.com",
  activeAssistant.id,
);
const overlayObservationDuplicate = { ...overlayObservationSecret, content: "transient duplicate should dedupe", id: overlayObservationSecret.id };
const overlayObservationRevivesDropped = {
  ...makeTransientObservation("this content must not appear", activeAssistant.id),
  id: droppedObservationId,
  relevance: "critical",
};
const overlayReflectionSecret = makeTransientReflection(
  "transient reflection with api_key=supersecret",
  [overlayObservationSecret.id],
);
const overlayReflectionDup = { ...overlayReflectionSecret, content: "duplicate reflection payload" };
const overlayReflectionLegacyDuplicate = {
  ...makeTransientReflection("legacy-reflection duplicate", [keptObservationId]),
  id: legacyReflectionId,
};

const withOverlay = renderSummary.renderSessionSummary(entries, {
  binding,
  leafId: activeAssistant.id,
  overlay: {
    observations: [overlayObservationSecret, overlayObservationDuplicate, overlayObservationRevivesDropped],
    reflections: [overlayReflectionSecret, overlayReflectionDup, overlayReflectionLegacyDuplicate],
  },
});
assert.equal(withOverlay.includes("No active observations recorded."), false, "overlay observations are rendered");
assert.equal(countIdRows(withOverlay, overlayObservationSecret.id), 1, "overlay id de-dupes within overlay");
assert.equal(countIdRows(withOverlay, keptObservationId), 1, "existing folded rows stay present with overlay");
assert.equal(countIdRows(withOverlay, legacyReflectionId), 1, "overlay cannot duplicate existing reflection row");
assert.equal(countIdRows(withOverlay, droppedObservationId), 0, "overlay cannot revive a dropped branch observation");
assert.equal(withOverlay.includes("api_key=supersecret"), false, "secrets are scrubbed from transient rows");
assert.equal(withOverlay.includes("user@example.com"), false, "PII is scrubbed from transient rows");
assert.equal(withOverlay.includes("sourceEntryIds"), false, "internal source metadata is not rendered");
assert.equal(withOverlay.includes("structuredState"), false, "no hidden structured JSON is rendered");

const overflowObservations = Array.from({ length: 140 }, (_value, index) => makeTransientObservation(
  `overflow observation ${index} keeps the bounded summary deterministic`,
  activeAssistant.id,
  index % 2 === 0 ? "low" : "medium",
));
const overflow = renderSummary.renderSessionSummary(entries, {
  binding,
  leafId: activeAssistant.id,
  overlay: {
    observations: overflowObservations,
    reflections: Array.from({ length: 130 }, (_value, index) => makeTransientReflection(
    `overflow reflection ${index}`,
    [overflowObservations[index].id],
  )),
  },
});
assert.equal(sectionRows(overflow, "Observations").length <= 64, true, "observation section enforces row cap");
assert.equal(sectionRows(overflow, "Reflections").length <= 64, true, "reflection section enforces row cap");
assert.equal(overflow.length <= 16_000, true, "summary text respects total cap");

console.log("PLASTIC_MEMORY_EMERGENCY_SUMMARY: PASS (overlay merge, dedupe, tombstone exclusion, deterministic cap/scrub behavior, and no-overlay compatibility)");
