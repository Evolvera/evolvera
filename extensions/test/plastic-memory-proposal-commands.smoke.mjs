import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const packageRoot = "/Users/j.henrique/npm-global/lib/node_modules/@earendil-works/pi-coding-agent";
const { createJiti } = await import(pathToFileURL(path.join(packageRoot, "node_modules/jiti/lib/jiti.mjs")).href);
const sandbox = mkdtempSync(path.join(tmpdir(), "plastic-memory-proposal-commands-"));
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
const types = await jiti.import(path.join(agentRoot, "extensions", "plastic-memory", "session", "types.ts"));
const ledger = await jiti.import(path.join(agentRoot, "extensions", "plastic-memory", "session", "ledger.ts"));
const ids = await jiti.import(path.join(agentRoot, "extensions", "plastic-memory", "common", "ids.ts"));
const schema = await jiti.import(path.join(agentRoot, "extensions", "plastic-memory", "project", "schema.ts"));
const search = await jiti.import(path.join(agentRoot, "extensions", "plastic-memory", "project", "search.ts"));

let binding = { sessionId: ids.sessionDigest("command-session", "plastic-memory:session"), generation: 0, branchId: "fixture" };
const projectId = schema.makeProject({ root: projectRoot }, { name: path.basename(projectRoot), repository: path.basename(projectRoot) }).id;
const snapshot = { summary: "synthetic source", activeIndex: "synthetic index" };
const stateDigest = "b".repeat(32);
let sequence = 0;
const entries = [];
function append(type, extra = {}) {
  const entry = { type, id: `entry-${++sequence}`, parentId: entries.at(-1)?.id ?? null, ...extra };
  entries.push(entry);
  return entry;
}
function custom(customType, data) { return append("custom", { customType, data }); }
const host = append("compaction", { details: { structuredState: { version: 1, stateDigest, projectSnapshot: snapshot } }, firstKeptEntryId: "source-answer" });
const sourceUser = append("message", { id: "source-user", message: { role: "user", content: [{ type: "text", text: "source" }] } });
const sourceAnswer = append("message", { id: "source-answer", message: { role: "assistant", content: [{ type: "text", text: "answer" }] } });
function candidate(title, body) {
  return { category: "bugs", title, target: "src/shared.ts", body, confidence: "known", evidence: [{ id: `evidence-${title.toLowerCase().replaceAll(" ", "-")}`, path: "extensions/test/plastic-memory-proposal-commands.smoke.mjs", claim: "Synthetic command evidence." }] };
}

function snapshotProject() {
  const files = [];
  function visit(directory) {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else files.push([path.relative(projectRoot, file), readFileSync(file).toString("base64")]);
    }
  }
  visit(projectRoot);
  return files;
}
function fakePi() {
  const calls = { commands: new Map(), hooks: new Map() };
  return {
    calls,
    on(name, handler) { calls.hooks.set(name, handler); },
    registerTool() {},
    registerCommand(name, options) { calls.commands.set(name, options); },
    appendEntry(customType, data) { entries.push({ type: "custom", id: `entry-${++sequence}`, parentId: entries.at(-1)?.id ?? null, customType, data }); },
  };
}

try {
  process.chdir(projectRoot);
  const pi = fakePi();
  await rootModule.default(pi);
  assert.ok(pi.calls.commands.has("plastic:status"), "plastic:status is registered alongside the existing memory commands");
  const sessionManager = {
    getSessionId: () => "command-session",
    getEntries: () => entries,
    getBranch: () => entries,
    getLeafId: () => entries.at(-1)?.id,
    buildContextEntries: () => entries,
  };
  const ctx = { cwd: projectRoot, sessionManager, ui: { notify() {} } };
  await pi.calls.hooks.get("session_start")({}, ctx);
  const bootstrapEntry = entries.find((entry) => entry.customType === types.PLASTIC_BOOTSTRAP_RECORDED);
  assert.ok(bootstrapEntry, "session start must expose a durable bootstrap binding");
  binding = { sessionId: bootstrapEntry.data.sessionId, generation: bootstrapEntry.data.generation, branchId: bootstrapEntry.data.branchId };
  const acknowledgement = custom(types.PLASTIC_COMPACTION_APPLIED, { schemaVersion: 1, ...binding, compactionEntryId: host.id, firstKeptEntryId: sourceAnswer.id, activeEntryIds: [sourceAnswer.id], activeDigest: "c".repeat(32) });
  const acknowledgementDigest = ids.recordDigest(binding.sessionId, { kind: "plastic-compaction-acknowledgement" }, acknowledgement.data);
  const source = { kind: "plastic-compaction", compactionEntryId: host.id, acknowledgementDigest, stateDigest };
  const sourceDigest = ids.recordDigest(binding.sessionId, { compactionEntryId: source.compactionEntryId, acknowledgementDigest, stateDigest }, snapshot);
  function proposal(title, body, label) {
    const value = candidate(title, body);
    const proposalId = ids.makeQueryId(binding.sessionId, ids.recordDigest(binding.sessionId, { projectId, source: label }, value));
    return { value, proposalId };
  }
  const first = proposal("First queued fact", "first queued body", "first");
  const second = proposal("Conflicting queued fact", "second queued body", "second");
  for (const item of [first, second]) custom(types.PLASTIC_PROJECT_PROPOSAL_RECORDED, { schemaVersion: 1, ...binding, proposalId: item.proposalId, sourceDigest, projectId, candidate: item.value, source });
  const invoke = (name, args = "") => pi.calls.commands.get(name).handler(args, ctx);
  const beforeStatusEntries = entries.map((entry) => JSON.stringify(entry));
  const beforeStatusFiles = snapshotProject();
  const plasticStatus = await invoke("plastic:status");
  assert.equal(plasticStatus.status, "ready");
  assert.deepEqual(plasticStatus.context, { tokens: null, window: null });
  assert.equal(Number.isSafeInteger(plasticStatus.binding.generation), true);
  assert.equal(plasticStatus.lastCompactionDiagnostic, null);
  assert.deepEqual(entries.map((entry) => JSON.stringify(entry)), beforeStatusEntries, "plastic:status does not append session entries");
  assert.deepEqual(snapshotProject(), beforeStatusFiles, "plastic:status does not write project files");
  const plasticStatusText = JSON.stringify(plasticStatus);
  for (const forbidden of ["command-session", "source-user", "source-answer", "first queued body", "second queued body"]) {
    assert.equal(plasticStatusText.includes(forbidden), false, `plastic:status does not expose ${forbidden}`);
  }
  const accepted = await invoke("memory:accept");
  assert.equal(accepted.status, "published", accepted.reason);
  assert.equal(accepted.decision, "accepted");
  assert.equal(accepted.proposalId, first.proposalId);
  assert.equal(search.searchProject(path.join(projectRoot, ".pi", "memory"), { text: "first queued body", limit: 5 }).matches.length, 1);
  let queue = ledger.reconstructProposalQueue({ branchEntries: entries, binding, leafId: entries.at(-1).id });
  assert.equal(queue.head.data.proposalId, second.proposalId);
  assert.equal(queue.decisions.filter((entry) => entry.data.proposalId === first.proposalId).length, 1);

  const beforeNonHead = snapshotProject();
  const nonHead = await invoke("memory:accept", first.proposalId);
  assert.equal(nonHead.status, "error");
  assert.match(nonHead.reason, /FIFO head/);
  assert.deepEqual(snapshotProject(), beforeNonHead);
  queue = ledger.reconstructProposalQueue({ branchEntries: entries, binding, leafId: entries.at(-1).id });
  assert.equal(queue.head.data.proposalId, second.proposalId);

  const beforeConflict = snapshotProject();
  const conflict = await invoke("memory:accept", second.proposalId);
  assert.equal(conflict.status, "error");
  assert.match(conflict.reason, /duplicate active target/);
  assert.deepEqual(snapshotProject(), beforeConflict);
  queue = ledger.reconstructProposalQueue({ branchEntries: entries, binding, leafId: entries.at(-1).id });
  assert.equal(queue.head.data.proposalId, second.proposalId, "failed publication retains head");
  assert.equal(queue.decisions.filter((entry) => entry.data.proposalId === second.proposalId).length, 0);

  const beforeReject = snapshotProject();
  const rejected = await invoke("memory:reject", second.proposalId);
  assert.deepEqual(rejected, { status: "rejected", proposalId: second.proposalId, decision: "rejected", queueHead: undefined });
  assert.deepEqual(snapshotProject(), beforeReject, "reject never writes canonical files");
  queue = ledger.reconstructProposalQueue({ branchEntries: entries, binding, leafId: entries.at(-1).id });
  assert.equal(queue.head, undefined);
  assert.equal(queue.decisions.filter((entry) => entry.data.proposalId === second.proposalId && entry.data.decision === "rejected").length, 1);

  const manual = { category: "environment", title: "Manual JSON", target: "src/manual.ts", body: "manual body", confidence: "unknown" };
  const beforePreview = snapshotProject();
  const preview = await invoke("memory:propose", JSON.stringify(manual));
  assert.equal(preview.status, "preview");
  assert.deepEqual(snapshotProject(), beforePreview);
  const manualPublished = await invoke("memory:accept", JSON.stringify(manual));
  assert.equal(manualPublished.status, "published");
  assert.equal(manualPublished.proposalId, undefined, "manual JSON is not a queue decision");
  console.log("PLASTIC_MEMORY_PROPOSAL_COMMANDS: PASS (read-only plastic:status registration, FIFO guarded accept, conflict retention, no-write reject, durable decisions, and manual JSON compatibility)");
} finally {
  process.chdir(repositoryRoot);
  rmSync(sandbox, { recursive: true, force: true });
}
