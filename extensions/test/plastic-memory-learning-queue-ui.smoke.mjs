import { loadJiti } from "./lib/pi-sdk.mjs";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { createJiti } = await loadJiti(import.meta.url);
const sandbox = mkdtempSync(path.join(tmpdir(), "plastic-memory-learning-queue-ui-"));
const agentRoot = path.join(sandbox, "agent");
const projectRoot = path.join(sandbox, "project");
mkdirSync(path.join(agentRoot, "extensions"), { recursive: true });
mkdirSync(path.join(agentRoot, "skills", "project-memory", "scripts"), { recursive: true });
mkdirSync(path.join(projectRoot, ".pi"), { recursive: true });
cpSync(path.join(repositoryRoot, "extensions", "plastic-memory"), path.join(agentRoot, "extensions", "plastic-memory"), { recursive: true });
cpSync(path.join(repositoryRoot, "skills", "project-memory", "scripts", "validate-architecture.mjs"), path.join(agentRoot, "skills", "project-memory", "scripts", "validate-architecture.mjs"));
writeFileSync(path.join(agentRoot, "settings.json"), JSON.stringify({ "plastic-memory": { enabled: true } }));

const jiti = createJiti(import.meta.url, { moduleCache: false });
const rootModule = await jiti.import(path.join(agentRoot, "extensions", "plastic-memory", "index.ts"));
const schema = await jiti.import(path.join(agentRoot, "extensions", "plastic-memory", "project", "schema.ts"));
const types = await jiti.import(path.join(agentRoot, "extensions", "plastic-memory", "session", "types.ts"));
const ledger = await jiti.import(path.join(agentRoot, "extensions", "plastic-memory", "session", "ledger.ts"));
const ids = await jiti.import(path.join(agentRoot, "extensions", "plastic-memory", "common", "ids.ts"));

let sequence = 0;
const entries = [];
function append(type, extra = {}) {
  const entry = { type, id: `entry-${++sequence}`, parentId: entries.at(-1)?.id ?? null, ...extra };
  entries.push(entry);
  return entry;
}
function appendCustom(customType, data) { return append("custom", { customType, data }); }
function candidate(title, target, body) {
  return {
    category: "decisions", title, target, body, confidence: "known",
    evidence: [{ id: `evidence-${title.toLowerCase().replaceAll(" ", "-")}`, path: "synthetic/source.ts", claim: "Synthetic evidence for the queue widget." }],
  };
}

// A synthetic branch is the only durable fixture. No provider, live session, or
// user memory is opened; the project root is unique to this test process.
const sourceUser = append("message", { message: { role: "user", content: [{ type: "text", text: "synthetic source" }] } });
const sourceAnswer = append("message", { message: { role: "assistant", content: [{ type: "text", text: "synthetic answer" }] } });
const projectSnapshot = { summary: "synthetic bounded summary", activeIndex: "synthetic bounded index" };
const stateDigest = "b".repeat(32);
const host = append("compaction", {
  details: { structuredState: { version: 1, stateDigest, projectSnapshot } },
  firstKeptEntryId: sourceAnswer.id,
});

function fakePi() {
  const calls = { hooks: new Map(), commands: new Map(), widgets: [], notifications: [] };
  return {
    calls,
    on(name, handler) { calls.hooks.set(name, handler); },
    registerTool() {},
    registerCommand(name, options) { calls.commands.set(name, options); },
    appendEntry(customType, data) { appendCustom(customType, data); },
  };
}
const sessionManager = {
  getSessionId: () => "learning-queue-ui-session",
  getEntries: () => entries,
  getBranch: () => entries,
  getLeafId: () => entries.at(-1)?.id,
  buildContextEntries: () => entries,
};
function context(hasUI, calls) {
  return {
    cwd: projectRoot, hasUI, sessionManager,
    ui: {
      notify(message) { calls?.notifications.push(message); },
      ...(hasUI ? { setWidget(key, content, options) { calls.widgets.push({ key, content, options }); } } : {}),
    },
  };
}

try {
  process.chdir(projectRoot);
  const pi = fakePi();
  await rootModule.default(pi);
  const ctx = context(true, pi.calls);
  await pi.calls.hooks.get("session_start")({ type: "session_start" }, ctx);
  assert.equal(pi.calls.widgets.at(-1).content, undefined, "empty queue clears the fixed widget key");
  assert.deepEqual(pi.calls.widgets.at(-1).options, { placement: "aboveEditor" });

  const bootstrap = entries.find((entry) => entry.customType === types.PLASTIC_BOOTSTRAP_RECORDED);
  assert.ok(bootstrap, "full root creates the durable bootstrap binding");
  const binding = { sessionId: bootstrap.data.sessionId, generation: bootstrap.data.generation, branchId: bootstrap.data.branchId };
  const projectId = schema.makeProject({ root: projectRoot }, { name: path.basename(projectRoot), repository: path.basename(projectRoot) }).id;
  const acknowledgement = appendCustom(types.PLASTIC_COMPACTION_APPLIED, {
    schemaVersion: 1, ...binding, compactionEntryId: host.id, firstKeptEntryId: sourceAnswer.id,
    activeEntryIds: [sourceAnswer.id], activeDigest: "c".repeat(32),
  });
  const acknowledgementDigest = ids.recordDigest(binding.sessionId, { kind: "plastic-compaction-acknowledgement" }, acknowledgement.data);
  const source = { kind: "plastic-compaction", compactionEntryId: host.id, acknowledgementDigest, stateDigest };
  const sourceDigest = ids.recordDigest(binding.sessionId, { compactionEntryId: host.id, acknowledgementDigest, stateDigest }, projectSnapshot);
  const firstCandidate = candidate("First queued rule", "synthetic/first.ts", "first body\nwith bounded details");
  const secondCandidate = candidate("Second queued rule", "synthetic/second.ts", "second body");
  function proposal(value, label) {
    const proposalId = ids.makeQueryId(binding.sessionId, ids.recordDigest(binding.sessionId, { projectId, source: label }, value));
    return { schemaVersion: 1, ...binding, proposalId, sourceDigest, projectId, candidate: value, source };
  }
  const first = proposal(firstCandidate, "first");
  const second = proposal(secondCandidate, "second");
  appendCustom(types.PLASTIC_PROJECT_PROPOSAL_RECORDED, first);
  appendCustom(types.PLASTIC_PROJECT_PROPOSAL_RECORDED, second);

  // A late producer append is durable before the next root/session reload. The
  // reload reconstructs the same branch FIFO rather than using an in-memory card.
  await pi.calls.hooks.get("session_start")({ type: "session_start" }, ctx);
  const rendered = pi.calls.widgets.at(-1);
  assert.equal(rendered.key, "plastic-memory-learning-queue");
  assert.deepEqual(rendered.options, { placement: "aboveEditor" });
  assert.ok(Array.isArray(rendered.content));
  assert.equal(rendered.content.filter((line) => line.includes(first.proposalId)).length, 3);
  assert.ok(rendered.content.some((line) => line.includes("First queued rule")));
  assert.ok(rendered.content.some((line) => line.includes("Rule: first body with bounded details")));
  assert.ok(rendered.content.some((line) => line.includes("Accept: /memory:accept " + first.proposalId)));
  assert.ok(rendered.content.some((line) => line.includes("Reject: /memory:reject " + first.proposalId)));
  assert.equal(rendered.content.some((line) => line.includes("synthetic answer")), false, "widget never exposes session payload");

  const invoke = (name, args = "") => pi.calls.commands.get(name).handler(args, ctx);
  const currentBootstrap = entries.filter((entry) => entry.customType === types.PLASTIC_BOOTSTRAP_RECORDED).at(-1);
  assert.deepEqual({ sessionId: currentBootstrap.data.sessionId, generation: currentBootstrap.data.generation, branchId: currentBootstrap.data.branchId }, binding, "restart must recover proposal binding");
  const nonHead = await invoke("memory:reject", second.proposalId);
  assert.equal(nonHead.status, "error");
  assert.match(nonHead.reason, /FIFO head/);
  assert.equal(pi.calls.widgets.at(-1).content.at(-2), "Accept: /memory:accept " + first.proposalId, "non-head guard leaves the card unchanged");

  const rejected = await invoke("memory:reject", first.proposalId);
  assert.equal(rejected.decision, "rejected", JSON.stringify(rejected));
  assert.ok(pi.calls.widgets.at(-1).content.some((line) => line.includes("Second queued rule")), "visible reject advances FIFO");
  assert.ok(pi.calls.widgets.at(-1).content.some((line) => line.includes(second.proposalId)));

  const accepted = await invoke("memory:accept", second.proposalId);
  assert.equal(accepted.decision, "accepted");
  assert.equal(pi.calls.widgets.at(-1).content, undefined, "visible accept clears the exhausted queue");
  assert.equal(ledger.reconstructProposalQueue({ branchEntries: entries, binding, leafId: entries.at(-1).id }).head, undefined);

  const noUiPi = fakePi();
  await rootModule.default(noUiPi);
  const noUiContext = context(false, noUiPi.calls);
  await noUiPi.calls.hooks.get("session_start")({ type: "session_start" }, noUiContext);
  assert.equal(noUiPi.calls.widgets.length, 0, "RPC/print-style no-UI contexts make no widget call");
  assert.equal(ctx.compact, undefined, "queue UI never starts or blocks agent flow");

  const switchCalls = pi.calls.widgets.length;
  pi.calls.hooks.get("session_before_switch")({ type: "session_before_switch" }, ctx);
  assert.equal(pi.calls.widgets.length, switchCalls + 1);
  assert.equal(pi.calls.widgets.at(-1).content, undefined, "switch invalidation clears the fixed key");
  console.log("PLASTIC_MEMORY_LEARNING_QUEUE_UI: PASS (root identity, durable FIFO widget, restart/late arrival, guarded decisions, clear/no-UI, and non-modal flow)");
} finally {
  process.chdir(repositoryRoot);
  rmSync(sandbox, { recursive: true, force: true });
}
