import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const types = await import(pathToFileURL(path.join(root, "plastic-memory/session/types.ts")).href);
const ledger = await import(pathToFileURL(path.join(root, "plastic-memory/session/ledger.ts")).href);
const ids = await import(pathToFileURL(path.join(root, "plastic-memory/common/ids.ts")).href);

const sourceBinding = { sessionId: ids.sessionDigest("proposal-queue", { generation: 1 }), generation: 1, branchId: "source" };
const destinationBinding = { ...sourceBinding, generation: 2, branchId: "destination" };
const projectId = "pm:p:" + "a".repeat(32);
const snapshot = { summary: "bounded summary", activeIndex: "bounded index" };
const stateDigest = "b".repeat(32);
const candidate = (title, body = `${title} body`) => ({
  category: "decisions", title, target: `docs/${title.toLowerCase().replaceAll(" ", "-")}.md`, body, confidence: "known",
  evidence: [{ id: `evidence-${title.toLowerCase().replaceAll(" ", "-")}`, path: "extensions/test/plastic-memory-proposal-queue.smoke.mjs", claim: "Synthetic queue evidence." }],
});
let sequence = 0;
const entries = [];
function append(type, extra = {}) {
  const entry = { type, id: `entry-${++sequence}`, parentId: entries.at(-1)?.id ?? null, ...extra };
  entries.push(entry);
  return entry;
}
function custom(customType, data, extra = {}) { return append("custom", { customType, data, ...extra }); }
function proposalData(proposalId, value, binding = destinationBinding, source = proposalSource) {
  return { schemaVersion: 1, ...binding, proposalId, sourceDigest: sourceDigest(source), projectId, candidate: value, source };
}
const host = append("compaction", {
  details: { structuredState: { version: 1, stateDigest, projectSnapshot: snapshot } },
  summary: "host compaction",
  firstKeptEntryId: "source-answer",
});
// The host compaction must itself be an earlier branch entry; the strict acknowledgement follows it.
const sourceUser = append("message", { id: "source-user", message: { role: "user", content: [{ type: "text", text: "source" }] }, tokenCount: 1 });
const sourceAnswer = append("message", { id: "source-answer", message: { role: "assistant", content: [{ type: "text", text: "answer" }] }, tokenCount: 1 });
// Rebuild parentage around the synthetic host entry so all provenance records share one ancestry.
host.parentId = null;
sourceUser.parentId = host.id;
sourceAnswer.parentId = sourceUser.id;
const acknowledgement = custom(types.PLASTIC_COMPACTION_APPLIED, {
  schemaVersion: 1, ...sourceBinding, compactionEntryId: host.id, firstKeptEntryId: sourceAnswer.id,
  activeEntryIds: [sourceAnswer.id], activeDigest: "c".repeat(32),
});
const acknowledgementDigest = ids.recordDigest(sourceBinding.sessionId, { kind: "plastic-compaction-acknowledgement" }, acknowledgement.data);
const proposalSource = { kind: "plastic-compaction", compactionEntryId: host.id, acknowledgementDigest, stateDigest };
function sourceDigest(source) {
  return ids.recordDigest(destinationBinding.sessionId, {
    compactionEntryId: source.compactionEntryId,
    acknowledgementDigest: source.acknowledgementDigest,
    stateDigest: source.stateDigest,
  }, snapshot);
}
const bootstrap = custom(types.PLASTIC_BOOTSTRAP_RECORDED, {
  schemaVersion: 1, ...destinationBinding, activeEntryIds: [], activeDigest: "d".repeat(32),
  legacyCoverageIds: [], historicalPrefixIds: [sourceUser.id, sourceAnswer.id], historicalGap: "historical-unindexed",
});
const firstId = ids.makeQueryId(destinationBinding.sessionId, ids.recordDigest(destinationBinding.sessionId, { projectId, source: "first" }, candidate("First proposal")));
const first = custom(types.PLASTIC_PROJECT_PROPOSAL_RECORDED, proposalData(firstId, candidate("First proposal")));
const secondId = ids.makeQueryId(destinationBinding.sessionId, ids.recordDigest(destinationBinding.sessionId, { projectId, source: "second" }, candidate("Second proposal")));
const second = custom(types.PLASTIC_PROJECT_PROPOSAL_RECORDED, proposalData(secondId, candidate("Second proposal")));

assert.equal(types.isStructuredProjectProposalRecord(first), true);
assert.equal(types.isMetadataProjectProposalData({ schemaVersion: 1, ...destinationBinding, proposalId: firstId, sourceDigest: "e".repeat(24), projectId }), true);
assert.equal(types.isPlasticRecord({ ...first, data: { ...first.data, candidate: { ...first.data.candidate, unsupported: true } } }), false);
assert.equal(types.isPlasticRecord({ ...first, data: { ...first.data, source: { ...first.data.source, stateDigest: "f".repeat(24) } } }), false);
assert.equal(types.isPlasticRecord({ ...first, data: { ...first.data, candidate: { ...first.data.candidate, evidence: [] } } }), false);
assert.equal(types.isPlasticRecord({ ...first, data: { ...first.data, source: { ...first.data.source, kind: "other" } } }), false);

// Exact source/bootstrap provenance produces a durable branch-order FIFO; metadata is never queued.
const metadata = custom(types.PLASTIC_PROJECT_PROPOSAL_RECORDED, { schemaVersion: 1, ...destinationBinding, proposalId: ids.makeQueryId(destinationBinding.sessionId, "1".repeat(24)), sourceDigest: "1".repeat(24), projectId });
const initial = ledger.reconstructProposalQueue({ branchEntries: entries, leafId: metadata.id });
assert.equal(initial.valid, true);
assert.deepEqual(initial.queued.map((entry) => entry.data.proposalId), [firstId, secondId]);
assert.equal(initial.head.data.proposalId, firstId);
assert.equal(initial.queued.includes(metadata), false);
assert.deepEqual(initial.unresolved.map((entry) => entry.data.proposalId), [firstId, secondId]);

// Exact duplicate replay is idempotent; a conflicting duplicate fails closed.
const duplicate = { ...first, id: "duplicate-first", parentId: second.id };
const duplicateState = ledger.reconstructProposalQueue({ branchEntries: [...entries, duplicate], leafId: duplicate.id });
assert.equal(duplicateState.valid, true);
assert.equal(duplicateState.queued.length, 2);
const conflict = { ...first, id: "conflict-first", parentId: duplicate.id, data: { ...first.data, candidate: { ...first.data.candidate, body: "conflicting body" } } };
assert.equal(ledger.reconstructProposalQueue({ branchEntries: [...entries, duplicate, conflict], leafId: conflict.id }).valid, false);

// Decisions only resolve later same-branch proposals and carry the proposal binding exactly.
const earlyDecision = ledger.makeProposalDecision(first, "rejected");
earlyDecision.id = "early-decision";
earlyDecision.parentId = acknowledgement.id;
const wrongBindingDecision = { ...ledger.makeProposalDecision(first, "accepted"), id: "wrong-binding", parentId: second.id, data: { ...ledger.makeProposalDecision(first, "accepted").data, generation: 99 } };
const withIgnoredDecisions = ledger.reconstructProposalQueue({ branchEntries: [...entries, earlyDecision, wrongBindingDecision], leafId: wrongBindingDecision.id });
assert.equal(withIgnoredDecisions.head.data.proposalId, firstId);
const accepted = ledger.makeProposalDecision(first, "accepted", destinationBinding);
assert.deepEqual(accepted.data, { schemaVersion: 1, ...destinationBinding, proposalId: firstId, decision: "accepted" });
assert.throws(() => ledger.makeProposalDecision(metadata, "accepted"));
assert.throws(() => ledger.makeProposalDecision(first, "accepted", { ...destinationBinding, branchId: "wrong" }));
accepted.id = "accepted-first";
accepted.parentId = second.id;
const afterFirst = ledger.reconstructProposalQueue({ branchEntries: [...entries, accepted], leafId: accepted.id });
assert.equal(afterFirst.head.data.proposalId, secondId);
assert.deepEqual(afterFirst.unresolved.map((entry) => entry.data.proposalId), [secondId]);
const rejected = ledger.createProposalDecision(afterFirst.head, "rejected");
rejected.id = "rejected-second";
rejected.parentId = accepted.id;
const afterRestart = ledger.reconstructProposalQueue({ branchEntries: [...entries, accepted, rejected], leafId: rejected.id });
assert.equal(afterRestart.valid, true);
assert.equal(afterRestart.head, undefined);
assert.equal(afterRestart.unresolved.length, 0);
assert.equal(afterRestart.decisions.length, 2);

// Missing/mismatched state, acknowledgement, bootstrap, session, and off-branch records cannot become a head.
function invalidBranch(mutator, label) {
  const altered = mutator(first);
  altered.id = `${label}-proposal`;
  altered.data = { ...altered.data, proposalId: ids.makeQueryId(destinationBinding.sessionId, ids.recordDigest(destinationBinding.sessionId, { label }, label)) };
  altered.parentId = second.id;
  const state = ledger.reconstructProposalQueue({ branchEntries: [...entries, altered], leafId: altered.id });
  assert.equal(state.valid, true, label);
  assert.equal(state.queued.some((entry) => entry.id === altered.id), false, label);
}
invalidBranch((entry) => ({ ...entry, data: { ...entry.data, sourceDigest: "2".repeat(24) } }), "wrong-source");
invalidBranch((entry) => ({ ...entry, data: { ...entry.data, source: { ...entry.data.source, acknowledgementDigest: "3".repeat(24) } } }), "wrong-ack");
invalidBranch((entry) => ({ ...entry, data: { ...entry.data, source: { ...entry.data.source, stateDigest: "4".repeat(32) } } }), "wrong-state");
const otherSession = { ...first, id: "other-session", parentId: second.id, data: { ...first.data, sessionId: ids.sessionDigest("other-session", { generation: 1 }) } };
assert.equal(ledger.reconstructProposalQueue({ branchEntries: [...entries, otherSession], leafId: otherSession.id }).queued.some((entry) => entry.id === otherSession.id), false);
const fork = { ...first, id: "off-branch", parentId: host.id };
const branchState = ledger.reconstructProposalQueue({ branchEntries: [...entries, fork], leafId: second.id });
assert.equal(branchState.queued.some((entry) => entry.id === fork.id), false);
const noBootstrapEntries = entries.filter((entry) => entry.id !== bootstrap.id);
assert.equal(ledger.reconstructProposalQueue({ branchEntries: noBootstrapEntries, leafId: second.id }).head, undefined);

console.log("PLASTIC_MEMORY_PROPOSAL_QUEUE: PASS (strict candidate/source variants, acknowledgement/state/bootstrap provenance, branch FIFO, restart decisions, duplicate and stale rejection, metadata exclusion)");
