import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDir, "../..");
const sandbox = mkdtempSync(path.join(tmpdir(), "native-compaction-routing-"));
const oldAgentDir = process.env.PI_CODING_AGENT_DIR;
const agentDir = path.join(sandbox, "agent");
const extensionPath = path.join(sandbox, "native-compaction-routing.ts");
const mockPackageDir = path.join(sandbox, "node_modules", "@earendil-works", "pi-coding-agent");

function preparation() {
  return {
    firstKeptEntryId: "keep-entry",
    messagesToSummarize: [{ role: "user", content: [{ type: "text", text: "old context" }], timestamp: 1 }],
    turnPrefixMessages: [],
    isSplitTurn: false,
    tokensBefore: 321,
    previousSummary: "previous",
    fileOps: { read: new Set(["README.md"]), edited: new Set(), written: new Set() },
    settings: { enabled: true, reserveTokens: 1000, keepRecentTokens: 100 },
  };
}

function makeContext(state, model) {
  const notices = [];
  return {
    ui: { notify(message, type) { notices.push({ message, type }); } },
    modelRegistry: {
      find(provider, modelId) {
        state.findCalls.push([provider, modelId]);
        return state.findResult;
      },
      async getApiKeyAndHeaders(foundModel) {
        state.authCalls.push(foundModel);
        return state.authResult;
      },
    },
    model,
    notices,
  };
}

function assertSafeCancel(result, context, forbidden = []) {
  assert.deepEqual(result, { cancel: true });
  assert.equal(context.notices.length, 1);
  assert.equal(context.notices[0].type, "warning");
  for (const text of forbidden) assert.doesNotMatch(context.notices[0].message, new RegExp(text, "i"));
}

try {
  // The mock package is run-owned and scoped to this copied extension. No module
  // cache is patched; the real SDK is loaded later from its distinct package URL.
  process.env.PI_CODING_AGENT_DIR = agentDir;
  mkdirSync(mockPackageDir, { recursive: true });
  writeFileSync(path.join(mockPackageDir, "package.json"), JSON.stringify({ type: "module", exports: "./index.js" }));
  writeFileSync(path.join(mockPackageDir, "index.js"), `
    export const state = { calls: [], result: undefined, error: undefined };
    export async function compact(...args) {
      state.calls.push(args);
      if (state.error) throw state.error;
      return state.result;
    }
  `);
  cpSync(path.join(root, "extensions", "native-compaction-routing.ts"), extensionPath);

  const mockSdk = await import(pathToFileURL(path.join(mockPackageDir, "index.js")).href);
  const mod = await import(`${pathToFileURL(extensionPath).href}?run=${Date.now()}`);
  const handlers = new Map();
  mod.default({ on(name, handler) { handlers.set(name, handler); } });
  const handler = handlers.get("session_before_compact");
  assert.equal(typeof handler, "function");

  const conversationModel = { provider: "openai-codex", id: "conversation-model" };
  const lunaModel = { provider: "openai-codex", id: "gpt-5.6-luna" };
  const state = {
    findCalls: [],
    authCalls: [],
    findResult: lunaModel,
    authResult: { ok: true, apiKey: "synthetic-key", headers: { "x-test": "header" }, env: { TEST_ENV: "owned" } },
  };
  const result = {
    summary: "native summary",
    firstKeptEntryId: "keep-entry",
    tokensBefore: 321,
    usage: { input: 10, output: 4, cacheRead: 0, cacheWrite: 0, totalTokens: 14, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    details: { readFiles: ["README.md"], modifiedFiles: ["src/app.ts"] },
  };
  mockSdk.state.result = result;

  for (const reason of ["manual", "threshold", "overflow"]) {
    const signal = new AbortController().signal;
    const context = makeContext(state, conversationModel);
    const routed = await handler(
      { type: "session_before_compact", preparation: preparation(), branchEntries: [], customInstructions: "Preserve the migration acceptance criteria", reason, willRetry: reason === "overflow", signal },
      context,
    );
    assert.deepEqual(routed, { compaction: result });
    const args = mockSdk.state.calls.at(-1);
    assert.equal(args[0].tokensBefore, 321);
    assert.equal(args[1], lunaModel);
    assert.equal(args[2], "synthetic-key");
    assert.deepEqual(args[3], { "x-test": "header" });
    assert.equal(args[4], "Preserve the migration acceptance criteria", "preserve user /compact instructions without inventing a prompt");
    assert.equal(args[5], signal);
    assert.equal(args[6], "xhigh");
    assert.equal(args[7], undefined, "the public hook does not expose a session stream function");
    assert.deepEqual(args[8], { TEST_ENV: "owned" });
    assert.equal(context.notices.length, 0);
    assert.equal(context.model, conversationModel, "conversation model must remain unchanged");
  }
  assert.deepEqual(state.findCalls, [
    ["openai-codex", "gpt-5.6-luna"],
    ["openai-codex", "gpt-5.6-luna"],
    ["openai-codex", "gpt-5.6-luna"],
  ]);

  state.findResult = undefined;
  let context = makeContext(state, conversationModel);
  assertSafeCancel(await handler({ preparation: preparation(), signal: new AbortController().signal }, context), context);

  state.findResult = lunaModel;
  state.authResult = { ok: false, error: "provider secret response must not leak" };
  context = makeContext(state, conversationModel);
  assertSafeCancel(await handler({ preparation: preparation(), signal: new AbortController().signal }, context), context, ["provider", "secret"]);

  state.authResult = { ok: true, headers: { "x-test": "header" }, env: { TEST_ENV: "owned" } };
  context = makeContext(state, conversationModel);
  assertSafeCancel(await handler({ preparation: preparation(), signal: new AbortController().signal }, context), context);

  state.authResult = { ok: true, apiKey: "synthetic-key" };
  mockSdk.state.error = new Error("provider URL and credential text must not leak");
  context = makeContext(state, conversationModel);
  assertSafeCancel(await handler({ preparation: preparation(), signal: new AbortController().signal }, context), context, ["provider", "credential", "url"]);
  mockSdk.state.error = undefined;

  for (const invalid of [undefined, {}, { summary: "   ", firstKeptEntryId: "keep-entry", tokensBefore: 1 }, { summary: "ok", firstKeptEntryId: "", tokensBefore: 1 }, { summary: "ok", firstKeptEntryId: "keep-entry", tokensBefore: NaN }]) {
    mockSdk.state.result = invalid;
    context = makeContext(state, conversationModel);
    assertSafeCancel(await handler({ preparation: preparation(), signal: new AbortController().signal }, context), context);
  }
  mockSdk.state.result = result;

  const aborted = new AbortController();
  aborted.abort();
  const callsBeforeAbort = mockSdk.state.calls.length;
  context = makeContext(state, conversationModel);
  assertSafeCancel(await handler({ preparation: preparation(), signal: aborted.signal }, context), context);
  assert.equal(mockSdk.state.calls.length, callsBeforeAbort, "aborted compaction must not call the provider helper");

  // Exercise the installed SDK helper separately with a synthetic stream. This
  // proves native preparation/result semantics without any provider or session I/O.
  const packageCandidates = [
    path.resolve(root, "../../npm-global/lib/node_modules/@earendil-works/pi-coding-agent"),
    path.resolve(root, "../../../npm-global/lib/node_modules/@earendil-works/pi-coding-agent"),
  ];
  const packageRoot = packageCandidates.find((candidate) => existsSync(candidate));
  assert.ok(packageRoot, "a local installed SDK is required for the real helper check");
  const realSdk = await import(`${pathToFileURL(path.join(packageRoot, "dist", "index.js")).href}?run=${Date.now()}-real`);
  const realSignal = new AbortController().signal;
  let streamRequest;
  const realModel = {
    provider: "openai-codex",
    id: "gpt-5.6-luna",
    api: "openai-codex-responses",
    name: "GPT-5.6 Luna",
    reasoning: true,
    contextWindow: 300000,
    maxTokens: 16000,
  };
  const assistant = {
    role: "assistant",
    content: [{ type: "text", text: "real SDK summary" }],
    usage: { input: 10, output: 4, cacheRead: 0, cacheWrite: 0, totalTokens: 14, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason: "stop",
  };
  const streamFn = async (model, contextValue, options) => {
    streamRequest = { model, context: contextValue, options };
    return { result: async () => assistant };
  };
  const realResult = await realSdk.compact(
    preparation(),
    realModel,
    "synthetic-key",
    { "x-test": "header" },
    undefined,
    realSignal,
    "xhigh",
    streamFn,
    { TEST_ENV: "owned" },
  );
  assert.equal(streamRequest.model, realModel);
  assert.equal(streamRequest.options.reasoning, "xhigh");
  assert.equal(streamRequest.options.apiKey, "synthetic-key");
  assert.deepEqual(streamRequest.options.headers, { "x-test": "header" });
  assert.deepEqual(streamRequest.options.env, { TEST_ENV: "owned" });
  assert.equal(streamRequest.options.signal, realSignal);
  assert.equal(streamRequest.options.cacheRetention, "none");
  assert.match(realResult.summary, /^real SDK summary\n\n<read-files>\nREADME\.md\n<\/read-files>$/);
  assert.equal(realResult.firstKeptEntryId, "keep-entry");
  assert.equal(realResult.tokensBefore, 321);
  assert.deepEqual(realResult.usage, assistant.usage);
  assert.deepEqual(realResult.details, { readFiles: ["README.md"], modifiedFiles: [] });

  const split = preparation();
  split.isSplitTurn = true;
  split.turnPrefixMessages = [{ role: "user", content: "split prefix marker", timestamp: 2 }];
  split.fileOps.edited.add("src/synthetic.ts");
  const requests = [];
  const splitResult = await realSdk.compact(
    split, realModel, "synthetic-key", undefined, "preserve custom focus marker", realSignal,
    "xhigh", async (model, context, options) => {
      requests.push({ model, context, options });
      return { result: async () => ({ ...assistant, content: [{ type: "text", text: requests.length === 1 ? "history summary" : "prefix summary" }] }) };
    },
  );
  assert.equal(requests.length, 2);
  assert.ok(requests.every((r) => r.model === realModel && r.options.reasoning === "xhigh" && r.options.signal === realSignal));
  assert.match(JSON.stringify(requests[0].context), /preserve custom focus marker/);
  assert.match(JSON.stringify(requests[0].context), /previous/);
  assert.match(JSON.stringify(requests[1].context), /split prefix marker/);
  assert.match(splitResult.summary, /history summary[\s\S]*Turn Context \(split turn\)[\s\S]*prefix summary/);
  assert.equal(splitResult.usage.totalTokens, 28);
  assert.equal(splitResult.firstKeptEntryId, split.firstKeptEntryId);
  assert.equal(splitResult.tokensBefore, split.tokensBefore);
  assert.deepEqual(splitResult.details.modifiedFiles, ["src/synthetic.ts"]);

  console.log("native-compaction-routing smoke: PASS");
} finally {
  if (oldAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = oldAgentDir;
  rmSync(sandbox, { recursive: true, force: true });
}
