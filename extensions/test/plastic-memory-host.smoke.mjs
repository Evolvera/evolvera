import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../npm-global/lib/node_modules/@earendil-works/pi-coding-agent",
);
const packageJson = JSON.parse(readFileSync(path.join(packageRoot, "package.json"), "utf8"));
assert.equal(packageJson.version, "0.83.0", "host version must be Pi 0.83.0");

const sandbox = mkdtempSync(path.join(tmpdir(), "plastic-memory-host-"));
const packageLinkDir = path.join(sandbox, "node_modules", "@earendil-works");
const packageLink = path.join(packageLinkDir, "pi-coding-agent");
await (async () => {
  const { mkdirSync } = await import("node:fs");
  mkdirSync(packageLinkDir, { recursive: true });
  symlinkSync(packageRoot, packageLink, "dir");
})();
const {
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  createAgentSession,
  findCutPoint,
} = await import(pathToFileURL(path.join(packageLink, "dist/index.js")).href);
assert.equal(typeof SessionManager.inMemory, "function");
assert.equal(typeof createAgentSession, "function");
assert.equal(typeof findCutPoint, "function");
const trace = {
  beforeCompact: [],
  compact: [],
  context: [],
  streamContexts: [],
  settled: 0,
  sessionCount: 0,
  summaryCount: 0,
  contextSummaries: [],
  guardDecisions: [],
};
globalThis.__plasticMemoryHostTrace = trace;

const extensionSource = `
function cancelIfUnsafe(branchEntries, selectedId, reordered) {
  const entries = reordered ? [...branchEntries].reverse() : branchEntries;
  if (!Array.isArray(entries) || entries.length === 0) return { cancel: true };
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const expectedParent = index === 0 ? undefined : entries[index - 1]?.id;
    if (!entry?.id || (index > 0 && entry.parentId !== expectedParent)) return { cancel: true };
  }
  const index = entries.findIndex((entry) => entry.id === selectedId);
  if (index < 0) return { cancel: true };
  const selected = entries[index];
  if (selected.type !== "message" || !["user", "assistant"].includes(selected.message?.role)) return { cancel: true };
  return undefined;
}
function consumeOneUseInternalIntent(trace) {
  const intent = trace.overlapInternalIntent;
  const intentId = intent?.id;
  if (!intent || intent.consumed === true) {
    const result = { cancel: true };
    trace.overlapGuardDecisions.push({ intentId, consumedBefore: intent?.consumed === true, result });
    return result;
  }
  intent.consumed = true;
  trace.overlapGuardDecisions.push({ intentId, consumedBefore: false, consumedAfter: true, result: undefined });
  return undefined;
}
function plasticDetails(branchEntries, firstKeptEntryId) {
  return {
    plastic: {
      kind: "cumulative",
      state: "host-prototype",
      range: {
        fromEntryId: branchEntries[0]?.id,
        throughEntryId: firstKeptEntryId,
      },
    },
  };
}
function mapCompactionMessages(messages, branchEntries, contextEntries) {
  const contextCompactions = contextEntries.filter((entry) => entry.type === "compaction");
  const mapped = [];
  let contextIndex = 0;
  for (const message of messages) {
    if (message.role !== "compactionSummary") continue;
    mapped.push({ message, entry: contextCompactions[contextIndex++] });
  }
  if (contextIndex !== contextCompactions.length || mapped.some(({ entry }) => !entry)) return undefined;
  const branchIndex = new Map(branchEntries.map((entry, index) => [entry.id, index]));
  if (mapped.some(({ entry }) => !branchIndex.has(entry.id))) return undefined;
  return mapped.map(({ message, entry }) => ({
    message,
    entry,
    branchPosition: branchIndex.get(entry.id),
  }));
}
function isPlasticCumulative(entry) {
  return entry?.details?.plastic?.kind === "cumulative"
    && entry.details.plastic.state === "host-prototype"
    && typeof entry.details.plastic.range?.fromEntryId === "string"
    && typeof entry.details.plastic.range?.throughEntryId === "string";
}
function isStructurallySubsumed(candidate, latest, branchEntries) {
  if (!isPlasticCumulative(candidate.entry) || !isPlasticCumulative(latest.entry)) return false;
  const branchIndex = new Map(branchEntries.map((entry, index) => [entry.id, index]));
  const candidateRange = candidate.entry.details.plastic.range;
  const latestRange = latest.entry.details.plastic.range;
  const candidateFrom = branchIndex.get(candidateRange.fromEntryId);
  const latestFrom = branchIndex.get(latestRange.fromEntryId);
  const candidateThrough = branchIndex.get(candidateRange.throughEntryId);
  const latestThrough = branchIndex.get(latestRange.throughEntryId);
  return candidateFrom !== undefined
    && latestFrom === candidateFrom
    && candidateThrough !== undefined
    && latestThrough !== undefined
    && candidateThrough <= latestThrough
    && candidate.branchPosition < latest.branchPosition;
}
export default function (pi) {
  const trace = globalThis.__plasticMemoryHostTrace;
  trace.guardCut = cancelIfUnsafe;
  pi.on("session_before_compact", async (event, ctx) => {
    trace.beforeCompact.push({
      firstKeptEntryId: event.preparation.firstKeptEntryId,
      tokensBefore: event.preparation.tokensBefore,
      branchLength: event.branchEntries.length,
    });
    const selected = trace.nextCut ?? event.preparation.firstKeptEntryId;
    if (trace.mode === "guarded-overlap") {
      const overlapResult = consumeOneUseInternalIntent(trace);
      if (overlapResult) return overlapResult;
    }
    if (trace.mode !== "unguarded") {
      const branch = ctx.sessionManager.getBranch();
      const result = cancelIfUnsafe(branch, selected, trace.forceReordered === true);
      trace.guardDecisions.push({ label: trace.currentUnsafeLabel, result });
      if (result) return result;
    }
    const cycle = ++trace.summaryCount;
    return {
      compaction: {
        summary: trace.summaryPrefix ? trace.summaryPrefix + ":cycle=" + cycle + ":through=C" + (cycle === 1 ? "2" : "4") : "pm-host-compaction-" + cycle,
        firstKeptEntryId: selected,
        tokensBefore: event.preparation.tokensBefore,
        details: trace.mode === "plastic" ? plasticDetails(event.branchEntries, selected) : undefined,
      },
    };
  });
  pi.on("session_compact", (event) => {
    trace.compact.push({
      id: event.compactionEntry.id,
      firstKeptEntryId: event.compactionEntry.firstKeptEntryId,
      summary: event.compactionEntry.summary,
    });
  });
  pi.on("context", async (event, ctx) => {
    trace.context.push(event.messages.map((message) => message.role));
    const summaries = event.messages.filter((message) => message.role === "compactionSummary").map((message) => message.summary);
    trace.contextSummaries.push({ mode: trace.mode, summaries });
    if (trace.mode !== "plastic") return { messages: event.messages };

    const branchEntries = ctx.sessionManager.getBranch();
    const contextEntries = ctx.sessionManager.buildContextEntries();
    const mapped = mapCompactionMessages(event.messages, branchEntries, contextEntries);
    if (!mapped) return { messages: event.messages };
    trace.contextMappings ??= [];
    trace.contextMappings.push(mapped.map(({ entry, branchPosition }) => ({
      id: entry.id,
      branchPosition,
      details: entry.details,
    })));

    const plastic = mapped.filter(({ entry }) => isPlasticCumulative(entry));
    const latest = plastic.reduce((current, candidate) => (
      !current || candidate.branchPosition > current.branchPosition ? candidate : current
    ), undefined);
    const messages = event.messages.filter((message) => {
      const match = mapped.find((candidate) => candidate.message === message);
      if (!match || !isPlasticCumulative(match.entry) || !latest || match === latest) return true;
      return !isStructurallySubsumed(match, latest, branchEntries);
    });
    trace.projectedContexts ??= [];
    trace.projectedContexts.push(messages.map((message) => message.role));
    trace.projectedSummaries ??= [];
    trace.projectedSummaries.push(messages.filter((message) => message.role === "compactionSummary").map((message) => message.summary));
    return { messages };
  });
  pi.on("agent_settled", () => { trace.settled += 1; });
}
`;
const extensionPath = path.join(sandbox, "host-extension.ts");
writeFileSync(extensionPath, extensionSource);

const fakeModel = {
  id: "host-fake-model",
  name: "Host Fake Model",
  api: "fake",
  provider: "host-fake",
  baseUrl: "https://provider.invalid",
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 100_000,
  maxTokens: 1_000,
};

function assistant(text) {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    api: fakeModel.api,
    provider: fakeModel.provider,
    model: fakeModel.id,
    usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason: "stop",
    timestamp: Date.now(),
  };
}

function user(text) {
  return { role: "user", content: [{ type: "text", text }], timestamp: Date.now() };
}

function toolCall() {
  return {
    role: "assistant",
    content: [{ type: "toolCall", id: "host-call-1", name: "noop", arguments: {} }],
    api: fakeModel.api,
    provider: fakeModel.provider,
    model: fakeModel.id,
    usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason: "toolUse",
    timestamp: Date.now(),
  };
}

function toolResult() {
  return {
    role: "toolResult",
    toolCallId: "host-call-1",
    toolName: "noop",
    content: [{ type: "text", text: "tool result" }],
    isError: false,
    timestamp: Date.now(),
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

async function fakeStream(_model, context) {
  trace.streamContexts.push(context.messages);
  trace.streamStarted?.();
  if (trace.streamGate) await trace.streamGate.promise;
  const final = assistant("provider-free response");
  return {
    async *[Symbol.asyncIterator]() {
      yield { type: "start", partial: { ...final, content: [] } };
      yield { type: "done", reason: "stop", message: final };
    },
    async result() { return final; },
  };
}

async function makeSession(mode = "guarded") {
  const cwd = path.join(sandbox, `cwd-${trace.sessionCount++}`);
  trace.mode = mode;
  trace.forceReordered = false;
  trace.currentUnsafeLabel = undefined;
  const agentDir = path.join(sandbox, "agent");
  const settingsManager = SettingsManager.inMemory({ compaction: { enabled: true, keepRecentTokens: 1 } });
  const modelRuntime = await ModelRuntime.create({
    authPath: path.join(sandbox, "auth.json"),
    modelsPath: null,
    allowModelNetwork: false,
  });
  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager,
    additionalExtensionPaths: [extensionPath],
  });
  await resourceLoader.reload();
  const sessionManager = SessionManager.inMemory(cwd);
  const result = await createAgentSession({
    cwd,
    agentDir,
    model: fakeModel,
    modelRuntime,
    resourceLoader,
    settingsManager,
    sessionManager,
    noTools: "all",
    thinkingLevel: "off",
  });
  result.session.agent.streamFunction = fakeStream;
  return result.session;
}

function populate(session, includeLatest = true) {
  const manager = session.sessionManager;
  const ids = {};
  ids.C1 = manager.appendMessage(user("C1 goal"));
  ids.C2 = manager.appendMessage(assistant("C2 progress"));
  ids.C3 = manager.appendMessage(user("C3 constraint"));
  ids.C4 = manager.appendMessage(toolCall());
  ids.TR = manager.appendMessage(toolResult());
  ids.C5 = manager.appendMessage(user("C5 latest user turn"));
  ids.C6 = manager.appendMessage(assistant("C6 latest answer"));
  if (includeLatest) {
    ids.C7 = manager.appendMessage(assistant("C7 latest answer"));
    ids.C8 = manager.appendMessage(user("C8 follow-up"));
  }
  session.agent.state.messages = manager.buildSessionContext().messages;
  return ids;
}

async function compactWithCut(cut, mode = "guarded", includeLatest = true) {
  const session = await makeSession(mode);
  const ids = populate(session, includeLatest);
  trace.forceReordered = false;
  trace.currentUnsafeLabel = undefined;
  trace.nextCut = typeof cut === "function" ? cut(ids) : cut;
  const before = session.sessionManager.getEntries().length;
  try {
    await session.compact("host characterization");
  } catch (error) {
    session.dispose();
    throw error;
  }
  const afterEntries = session.sessionManager.getEntries();
  const contextEntries = session.sessionManager.buildContextEntries();
  const compactions = afterEntries.filter((entry) => entry.type === "compaction");
  session.dispose();
  return { ids, before, afterEntries, contextEntries, compactions };
}

async function expectCancelled(label, cut, options = {}) {
  const session = await makeSession("guarded");
  const ids = populate(session);
  if (options.fork) {
    session.sessionManager.branch(ids.C3);
    options.forkId = session.sessionManager.appendMessage(user("fork-only entry"));
    session.sessionManager.branch(ids.C8);
    session.agent.state.messages = session.sessionManager.buildSessionContext().messages;
  }
  trace.currentUnsafeLabel = label;
  trace.nextCut = typeof cut === "function" ? cut(ids, options) : cut;
  trace.forceReordered = options.reordered === true;
  const before = session.sessionManager.getEntries().length;
  let error;
  try {
    await session.compact(`unsafe ${label}`);
  } catch (caught) {
    error = caught;
  }
  const afterEntries = session.sessionManager.getEntries();
  assert.match(String(error?.message), /Compaction cancelled/, `${label} must be cancelled by the extension guard`);
  assert.equal(afterEntries.length, before, `${label} must be rejected before append`);
  assert.equal(trace.guardDecisions.at(-1).label, label);
  assert.deepEqual(trace.guardDecisions.at(-1).result, { cancel: true });
  session.dispose();
}

try {
  // Negative control: Pi 0.83.0 appends an invalid custom cut and collapses the rebuilt context.
  trace.mode = "unguarded";
  const negative = await compactWithCut("missing-entry-id", "unguarded");
  assert.equal(negative.afterEntries.length, negative.before + 1);
  assert.equal(negative.compactions.length, 1);
  assert.deepEqual(negative.contextEntries.map((entry) => entry.id), [negative.compactions[0].id]);
  console.log("NEGATIVE_CONTROL: unguarded missing firstKeptEntryId appended; collapse hazard observed");

  // Test-local deterministic guard: every unsafe class cancels before host append.
  await expectCancelled("missing", "missing-entry-id");
  await expectCancelled("non-ancestor", "future-entry-id");
  await expectCancelled("tool-result", (ids) => ids.TR);
  await expectCancelled("orphan", "orphan-entry-id");
  await expectCancelled("fork", (_ids, options) => options.forkId, { fork: true });
  await expectCancelled("reordered", (ids) => ids.C6, { reordered: true });

  // Real preparation reaches both hooks; a valid ancestor cut preserves descendants.
  trace.currentUnsafeLabel = undefined;
  const valid = await compactWithCut((ids) => ids.C6);
  assert.equal(trace.beforeCompact.length >= 2, true, "real preparation hook was not reached");
  assert.equal(trace.compact.length >= 1, true, "real session_compact hook was not reached");
  assert.equal(valid.afterEntries.length, valid.before + 1, "valid compaction must append exactly once");
  assert.match(trace.compact.at(-1).id, /^[0-9a-f]{8,}$/);
  const compaction = valid.compactions[0];
  const active = valid.contextEntries.filter((entry) => entry.id === compaction.id || entry.id === valid.ids.C6 || entry.id === valid.ids.C7 || entry.id === valid.ids.C8);
  assert.deepEqual(active.map((entry) => entry.id), [compaction.id, valid.ids.C6, valid.ids.C7, valid.ids.C8]);
  const cutProbe = findCutPoint(valid.afterEntries, 0, valid.afterEntries.length - 1, 100_000);
  assert.notEqual(valid.afterEntries[cutProbe.firstKeptEntryIndex]?.message?.role, "toolResult");

  // Undefined preparation is a real deferral and never reaches the extension hook.
  const small = await makeSession("guarded");
  small.sessionManager.appendMessage(user("too small to compact"));
  small.agent.state.messages = small.sessionManager.buildSessionContext().messages;
  const beforeDeferral = trace.beforeCompact.length;
  await assert.rejects(() => small.compact("temporary deferral"), /Nothing to compact/);
  assert.equal(trace.beforeCompact.length, beforeDeferral);
  small.dispose();

  // Repeated C1-C6/C7-C8 public rebuild gives the known raw shape, while the
  // guarded context prototype removes only the superseded plastic summary.
  trace.summaryCount = 0;
  trace.summaryPrefix = "pm-plastic";
  const repeated = await makeSession("plastic");
  const repeatedIds = populate(repeated, false);
  trace.nextCut = repeatedIds.C3;
  await repeated.compact("C1-C6");
  repeatedIds.C7 = repeated.sessionManager.appendMessage(assistant("C7 latest answer"));
  repeatedIds.C8 = repeated.sessionManager.appendMessage(user("C8 follow-up"));
  repeated.agent.state.messages = repeated.sessionManager.buildSessionContext().messages;
  trace.nextCut = repeatedIds.C5;
  await repeated.compact("C7-C8");
  const rawCompactions = repeated.sessionManager.buildContextEntries().filter((entry) => entry.type === "compaction");
  assert.deepEqual(rawCompactions.map((entry) => entry.summary), ["pm-plastic:cycle=2:through=C4", "pm-plastic:cycle=1:through=C2"]);
  assert.deepEqual(rawCompactions.map((entry) => entry.details?.plastic?.kind), ["cumulative", "cumulative"]);
  await repeated.agent.prompt("projection probe");
  const projected = trace.streamContexts.at(-1);
  const projectedSummaries = trace.projectedSummaries.at(-1);
  const contextMapping = trace.contextMappings.at(-1);
  assert.deepEqual(contextMapping.map(({ details }) => details?.plastic?.kind), ["cumulative", "cumulative"]);
  assert.equal(contextMapping[0].branchPosition > contextMapping[1].branchPosition, true);
  assert.deepEqual(projectedSummaries, ["pm-plastic:cycle=2:through=C4"]);
  assert.match(projected[0].content[0].text, /pm-plastic:cycle=2:through=C4/);
  assert.equal(projected.some((message) => message.content?.[0]?.text?.includes("cycle=1")), false);
  repeated.dispose();

  // Native and emergency summaries are not plastic evidence and remain unfiltered.
  for (const mode of ["native", "emergency"]) {
    const control = await makeSession(mode);
    const controlIds = populate(control, false);
    control.sessionManager.appendCompaction(`${mode}-compaction-1`, controlIds.C3, 10, undefined, false);
    controlIds.C7 = control.sessionManager.appendMessage(assistant("C7 latest answer"));
    controlIds.C8 = control.sessionManager.appendMessage(user("C8 follow-up"));
    control.sessionManager.appendCompaction(`${mode}-compaction-2`, controlIds.C5, 20, undefined, false);
    control.agent.state.messages = control.sessionManager.buildSessionContext().messages;
    await control.agent.prompt(`${mode} projection probe`);
    const summaries = trace.contextSummaries.at(-1).summaries;
    assert.deepEqual(summaries, [`${mode}-compaction-2`, `${mode}-compaction-1`]);
    assert.deepEqual(
      control.sessionManager.getEntries().filter((entry) => entry.type === "compaction").map((entry) => entry.details),
      [undefined, undefined],
    );
    control.dispose();
  }

  // Prompt arrival is deferred while a visible run is active, then one settled apply appends.
  const race = await makeSession("guarded");
  const raceIds = populate(race);
  trace.nextCut = raceIds.C6;
  const started = deferred();
  const gate = deferred();
  trace.streamStarted = started.resolve;
  trace.streamGate = gate;
  const visiblePrompt = race.agent.prompt("visible prompt");
  await started.promise;
  assert.notEqual(race.agent.signal, undefined);
  const beforeRaceApply = race.sessionManager.getEntries().length;
  assert.equal(race.agent.signal !== undefined || race.pendingMessageCount > 0, true);
  assert.equal(race.sessionManager.getEntries().length, beforeRaceApply);
  gate.resolve();
  await visiblePrompt;
  trace.streamGate = undefined;
  trace.streamStarted = undefined;
  await race.compact("settled apply");
  assert.equal(race.sessionManager.getEntries().filter((entry) => entry.type === "compaction").length, 1);
  race.dispose();

  // Negative control: direct overlapping public compacts can both append on Pi 0.83.0.
  const overlapNegative = await makeSession("unguarded");
  const overlapNegativeIds = populate(overlapNegative);
  trace.nextCut = overlapNegativeIds.C6;
  const overlapNegativeBefore = overlapNegative.sessionManager.getEntries().length;
  const overlapNegativeResults = await Promise.allSettled([
    overlapNegative.compact("overlap-negative-1"),
    overlapNegative.compact("overlap-negative-2"),
  ]);
  const overlapNegativeEntries = overlapNegative.sessionManager.getEntries();
  assert.equal(overlapNegativeResults.filter((result) => result.status === "fulfilled").length, 2);
  assert.equal(overlapNegativeEntries.length, overlapNegativeBefore + 2, "unguarded overlap must retain the host double-append negative control");
  assert.equal(overlapNegativeEntries.filter((entry) => entry.type === "compaction").length, 2);
  console.log("NEGATIVE_CONTROL: two direct overlapping session.compact calls appended twice");
  overlapNegative.dispose();

  // Extension-side prototype: one internal intent is consumed synchronously by the
  // first hook invocation; a second overlapping invocation cancels before append.
  const overlap = await makeSession("guarded-overlap");
  const overlapIds = populate(overlap);
  trace.nextCut = overlapIds.C6;
  trace.overlapInternalIntent = { id: "pm-host-overlap-intent", consumed: false };
  trace.overlapGuardDecisions = [];
  const overlapBefore = overlap.sessionManager.getEntries().length;
  const overlapCompactBefore = trace.compact.length;
  const overlapResults = await Promise.allSettled([
    overlap.compact("overlap-guarded-1"),
    overlap.compact("overlap-guarded-2"),
  ]);
  const overlapEntries = overlap.sessionManager.getEntries();
  const overlapObservations = trace.compact.slice(overlapCompactBefore);
  assert.equal(overlapResults.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(overlapResults.filter((result) => result.status === "rejected").length, 1);
  assert.equal(overlapEntries.length, overlapBefore + 1, "guarded overlap must append at most once");
  assert.equal(overlapObservations.length, 1, "guarded overlap must observe one session_compact event");
  assert.deepEqual(trace.overlapGuardDecisions, [
    { intentId: "pm-host-overlap-intent", consumedBefore: false, consumedAfter: true, result: undefined },
    { intentId: "pm-host-overlap-intent", consumedBefore: true, result: { cancel: true } },
  ]);
  assert.equal(trace.overlapInternalIntent.consumed, true, "first overlapping hook must consume the intent synchronously");
  overlap.dispose();
  trace.overlapInternalIntent = undefined;
  trace.overlapGuardDecisions = undefined;

  console.log("HOST_CAPABILITY: PASS");
} catch (error) {
  console.error(`HOST_CAPABILITY: BLOCKED — ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  delete globalThis.__plasticMemoryHostTrace;
  rmSync(sandbox, { recursive: true, force: true });
}
