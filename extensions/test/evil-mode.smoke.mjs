// Evil mode: an abliterated selection moves the whole session, and every call made for it, onto one model.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolvePiSdkRoot } from "./lib/pi-sdk.mjs";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDir, "../..");
const sdkRoot = resolvePiSdkRoot(import.meta.url);
const require = createRequire(import.meta.url);
const { createJiti } = require(path.join(sdkRoot, "node_modules/jiti/lib/jiti.cjs"));
const sdkAlias = {
  "@earendil-works/pi-coding-agent": path.join(sdkRoot, "dist/index.js"),
  "@earendil-works/pi-ai/models": path.join(sdkRoot, "node_modules/@earendil-works/pi-ai/dist/models.js"),
};
const jiti = createJiti(import.meta.url, { fsCache: false, alias: sdkAlias });
delete process.env.PI_EVIL_MODE;

const evil = await jiti.import(path.join(root, "extensions/evil-mode.ts"));
const { default: evilMode, EVIL_MODEL, EVIL_MODEL_REF, EVIL_MODE_LOCK_TYPE, BLOCKED_BASE_URL } = evil;

// The one model, and that the harness ships it.
assert.equal(EVIL_MODEL_REF, "refuseless/deepseek-v4.1-flash-abliterated-fast");
for (const file of ["models.json", "config/models.json"]) {
  const ids = JSON.parse(fs.readFileSync(path.join(root, file), "utf8")).providers.refuseless.models.map((model) => model.id);
  assert.ok(ids.includes(EVIL_MODEL.id), `${file} lists the evil model`);
}

// Trigger regex: id or name, either spelling, any case.
assert.ok(evil.isAbliteratedModel({ provider: "refuseless", id: "glm-5.3-abliterated" }));
assert.ok(evil.isAbliteratedModel({ provider: "x", id: "m", name: "Some OBLITERATED build" }));
assert.ok(!evil.isAbliteratedModel({ provider: "refuseless", id: "deepseek-v4.1-flash-fast" }));
assert.ok(evil.isEvilModel({ provider: "refuseless", id: "deepseek-v4.1-flash-abliterated-fast" }));
assert.ok(!evil.isEvilModel({ provider: "refuseless", id: "deepseek-v4.1-flash-abliterated" }), "another abliterated model is not the evil model");

// Orca launches are forced onto the evil model; terminals that start pi must inherit the flag.
assert.equal(evil.forceOrcaAgentModel("orca-ide agent launch --agent pi --model openai/gpt-6.2-sol --effort high"), `orca-ide agent launch --agent pi --model ${EVIL_MODEL_REF} --effort high`);
assert.equal(evil.forceOrcaAgentModel("orca agent launch --agent pi --model=anthropic/claude-opus-5-5"), `orca agent launch --agent pi --model ${EVIL_MODEL_REF}`);
assert.equal(evil.forceOrcaAgentModel("orca-ide worktree create --name x --agent pi"), `orca-ide worktree create --name x --agent pi --model ${EVIL_MODEL_REF}`);
assert.equal(evil.forceOrcaAgentModel("cd a && orca-ide orchestration worker-start --agent pi --task t && echo ok"), `cd a && orca-ide orchestration worker-start --agent pi --task t --model ${EVIL_MODEL_REF} && echo ok`);
assert.equal(evil.forceOrcaAgentModel("orca-ide worktree create --name x"), undefined, "a worktree without an agent is left alone");
assert.equal(evil.forceOrcaAgentModel("git status"), undefined);
assert.ok(evil.orcaTerminalPiWithoutEvil(`orca-ide terminal create --command "pi -c"`));
assert.ok(!evil.orcaTerminalPiWithoutEvil(`orca-ide terminal create --command "PI_EVIL_MODE=1 pi -c"`));
assert.ok(!evil.orcaTerminalPiWithoutEvil(`orca-ide terminal create --command "npm test"`));

// Backstop scrub empties every conversation field.
assert.deepEqual(evil.scrubPayload({ model: "gpt-6-luna", messages: [{ role: "user" }], input: [1], instructions: "secret", stream: true }), { model: "gpt-6-luna", messages: [], input: [], instructions: "", stream: true });

// Lock detection: a lock entry, or an abliterated reply from before the extension existed.
const lockEntry = { type: "custom", customType: EVIL_MODE_LOCK_TYPE, data: { model: EVIL_MODEL_REF } };
const session = (list) => ({ getEntries: () => list });
assert.ok(evil.evilLocked({ sessionManager: session([lockEntry]) }));
assert.ok(evil.evilLocked({ sessionManager: session([{ type: "message", message: { role: "assistant", model: "glm-5.3-abliterated" } }]) }));
assert.ok(!evil.evilLocked({ sessionManager: session([{ type: "message", message: { role: "assistant", model: "gpt-6.2-sol" } }]) }));

// Router, before any evil session: chains route normally.
const fallback = await jiti.import(path.join(root, "extensions/model-fallback.ts"));
const levels = { off: null, minimal: "low", low: "low", medium: "high", high: "high", xhigh: "max", max: "max" };
const all = new Map();
const add = (provider, id) => all.set(`${provider}/${id}`, { provider, id, name: id, reasoning: true, api: "openai-completions", thinkingLevelMap: levels });
for (const chain of Object.values(fallback.FALLBACK_CHAINS)) for (const step of chain) add(step.provider, step.model);
add(EVIL_MODEL.provider, EVIL_MODEL.id);
add("refuseless", "glm-5.3-abliterated");
add("openai", "gpt-6-luna");
const registry = {
  find: (provider, id) => all.get(`${provider}/${id}`),
  getAll: () => [...all.values()],
  hasConfiguredAuth: () => true,
  async getApiKeyAndHeaders() { return { ok: true, apiKey: "test-key", headers: {} }; },
};
const virtual = new Map();
fallback.default({ registerVirtualModel(model) { virtual.set(model.id, model); }, on() {}, registerCommand() {}, appendEntry() {}, events: { emit() {}, on() {} } });
const route = (chain, ctx = { modelRegistry: registry }) => virtual.get(chain).route({ model: { provider: "fallback", id: chain }, thinkingLevel: "medium", messages: [{ role: "user", id: "u1" }], reason: "user" }, ctx);
assert.notEqual(route("sol").model.id, EVIL_MODEL.id, "outside evil mode the chain serves its own model");

// A locked session routes every chain to the evil model even before the process is marked.
const lockedRoute = route("sol", { modelRegistry: registry, sessionManager: session([lockEntry]) });
assert.equal(`${lockedRoute.model.provider}/${lockedRoute.model.id}`, EVIL_MODEL_REF, "a locked session's chain is served by the evil model");

// v2 helper targets the model it is given.
const orchestration = await jiti.import(path.join(root, "extensions/orchestration-mode.ts"));
const helperCalls = [];
const helperRegistry = {
  find(provider, id) { helperCalls.push(`${provider}/${id}`); return all.get(`${provider}/${id}`); },
  streamSimple(target) { helperCalls.push(`stream:${target.provider}/${target.id}`); return { result: async () => ({ content: [{ type: "text", text: '["workflow"]' }], usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2 } }) }; },
};
const helped = await orchestration.selectV2Guidance(helperRegistry, "", "do it", EVIL_MODEL);
assert.equal(helped.available, true);
assert.deepEqual(helperCalls, [EVIL_MODEL_REF, `stream:${EVIL_MODEL_REF}`], "the helper calls only the evil model");
assert.deepEqual(orchestration.V2_HELPER_MODEL, { provider: "openai", id: "gpt-6-luna" }, "outside evil mode the helper keeps luna");
assert.match(fs.readFileSync(path.join(root, "extensions/orchestration-mode.ts"), "utf8"), /evilActive\(ctx as any\) \? EVIL_MODEL : V2_HELPER_MODEL/);

// Compaction in an evil session tries the evil model and nothing else.
const mockDir = fs.mkdtempSync(path.join(os.tmpdir(), "evil-compaction-"));
fs.writeFileSync(path.join(mockDir, "sdk.mjs"), `export const calls = []; export let fail = false; export function setFail(v) { fail = v; }
export async function compact(prep, model, key, headers, instr, signal, thinking) { calls.push({ model: model.provider + "/" + model.id, thinking }); if (fail) throw new Error("down"); return { summary: "s", firstKeptEntryId: "k", tokensBefore: 1 }; }`);
const mockJiti = createJiti(import.meta.url, { fsCache: false, moduleCache: false, alias: { "@earendil-works/pi-coding-agent": path.join(mockDir, "sdk.mjs") } });
const mockSdk = await mockJiti.import(path.join(mockDir, "sdk.mjs"));
const compaction = await mockJiti.import(path.join(root, "extensions/native-compaction-routing.ts"));
let compactHandler;
compaction.default({ on(name, handler) { if (name === "session_before_compact") compactHandler = handler; }, events: { on() {} }, getThinkingLevel: () => "high" });
const compactEvent = () => ({ preparation: { tokensBefore: 1 }, signal: new AbortController().signal, customInstructions: undefined });
const evilCtx = (extra = {}) => ({ model: all.get(`${EVIL_MODEL.provider}/${EVIL_MODEL.id}`), modelRegistry: registry, sessionManager: session([lockEntry]), ui: { notify() {}, setStatus() {} }, getContextUsage: () => undefined, ...extra });
const compacted = await compactHandler(compactEvent(), evilCtx());
assert.ok(compacted.compaction, "evil compaction succeeds on the evil model");
assert.deepEqual(mockSdk.calls.map((call) => call.model), [EVIL_MODEL_REF]);
mockSdk.calls.length = 0;
mockSdk.setFail(true);
assert.deepEqual(await compactHandler(compactEvent(), evilCtx()), { cancel: true }, "a failed evil compaction cancels instead of trying luna, haiku or flash");
assert.deepEqual(mockSdk.calls.map((call) => call.model), [EVIL_MODEL_REF]);
mockSdk.setFail(false);

// Extension handlers, driven through a mock pi.
function harness() {
  const handlers = new Map();
  const state = { entries: [], model: undefined, setModels: [], providers: [], status: undefined, notices: [] };
  const pi = {
    on(name, handler) { handlers.set(name, handler); },
    registerCommand() {},
    appendEntry(customType, data) { state.entries.push({ type: "custom", customType, data }); },
    async setModel(model) { state.setModels.push(`${model.provider}/${model.id}`); const previousModel = state.model; state.model = model; await handlers.get("model_select")?.({ model, previousModel, source: "set" }, ctx()); return true; },
    registerProvider(name, config) { state.providers.push([name, config.baseUrl]); },
  };
  const ctx = () => ({
    model: state.model, modelRegistry: registry, sessionManager: session(state.entries),
    ui: { setStatus(_key, text) { state.status = text; }, notify(message) { state.notices.push(message); } },
  });
  evilMode(pi);
  const fire = async (name, event = {}) => handlers.get(name)?.(event, ctx());
  const select = async (provider, id) => { const previousModel = state.model; state.model = all.get(`${provider}/${id}`); await fire("model_select", { model: state.model, previousModel, source: "set" }); };
  return { state, fire, select };
}

{
  const { state, fire, select } = harness();
  await select("openai", "gpt-6-luna");
  assert.equal(state.status, undefined, "no status outside evil mode");
  await select("refuseless", "glm-5.3-abliterated");
  assert.equal(`${state.model.provider}/${state.model.id}`, EVIL_MODEL_REF, "any abliterated selection lands on the evil model");
  assert.equal(state.status, "😈 EVIL");
  await select("openai", "gpt-6-luna");
  assert.equal(state.model.id, "gpt-6-luna", "before the first prompt, switching away leaves evil mode");
  assert.equal(state.status, undefined);
  assert.equal(globalThis[Symbol.for("evolvera.evil-mode")], undefined, "leaving before a prompt marks nothing");
}

{
  const { state, fire, select } = harness();
  await select("refuseless", EVIL_MODEL.id);
  assert.equal(await fire("input", { text: "hi" }), undefined, "the evil model may prompt");
  await fire("before_agent_start", { prompt: "hi" });
  assert.equal(state.entries.filter((entry) => entry.customType === EVIL_MODE_LOCK_TYPE).length, 1, "the first run writes the lock");
  assert.equal(state.status, "😈 EVIL 🔒");
  assert.equal(process.env.PI_EVIL_MODE, "1", "child PIs inherit evil mode");
  const cut = new Set(state.providers.map(([name]) => name));
  assert.ok(cut.has("openai") && cut.has("anthropic"), "other providers are cut");
  assert.ok(!cut.has("refuseless") && !cut.has("fallback"), "the evil provider and the router stay");
  assert.ok(state.providers.every(([, url]) => url === BLOCKED_BASE_URL));
  await select("openai", "gpt-6-luna");
  assert.equal(`${state.model.provider}/${state.model.id}`, EVIL_MODEL_REF, "a locked chat reverts any other selection");
  await fire("before_agent_start", { prompt: "again" });
  assert.equal(state.entries.filter((entry) => entry.customType === EVIL_MODE_LOCK_TYPE).length, 1, "the lock is written once");

  const launch = { toolName: "bash", input: { command: "orca-ide agent launch --agent pi --model openai/gpt-6.2-sol" } };
  assert.equal(await fire("tool_call", launch), undefined);
  assert.equal(launch.input.command, `orca-ide agent launch --agent pi --model ${EVIL_MODEL_REF}`, "orca launches are rewritten in place");
  assert.equal((await fire("tool_call", { toolName: "bash", input: { command: "unset PI_EVIL_MODE; pi -p x" } }))?.block, true);
  assert.equal((await fire("tool_call", { toolName: "bash", input: { command: "PI_EVIL_MODE=0 pi -p x" } }))?.block, true);
  assert.equal((await fire("tool_call", { toolName: "bash", input: { command: `orca-ide terminal create --command "pi"` } }))?.block, true);
  assert.equal(await fire("tool_call", { toolName: "bash", input: { command: "pi -p 'child'" } }), undefined, "a shell child pi inherits the env and runs");

  const scrubbed = await fire("before_provider_request", { payload: { model: "gpt-6-luna", messages: [{ role: "user", content: "secret" }] } });
  assert.deepEqual(scrubbed.messages, [], "a stray request carries no conversation");
  assert.equal(await fire("before_provider_request", { payload: { model: EVIL_MODEL.id, messages: [1] } }), undefined, "evil requests pass untouched");
}

// Reload / resume of a locked chat, and a new in-process session (subagent) in an evil process.
{
  const { state, fire } = harness();
  state.entries.push(lockEntry);
  state.model = all.get("openai/gpt-6-luna");
  await fire("session_start", { reason: "resume" });
  assert.equal(`${state.model.provider}/${state.model.id}`, EVIL_MODEL_REF, "resume puts a locked chat back on the evil model");
}
{
  const { state, fire } = harness();
  state.model = all.get("anthropic/claude-opus-5-5") ?? all.get("openai/gpt-6-luna");
  await fire("session_start", { reason: "startup" });
  assert.equal(`${state.model.provider}/${state.model.id}`, EVIL_MODEL_REF, "a subagent session in an evil process starts on the evil model");
}

// The router honours the process flag even without a session.
const evilRoute = route("terra", { modelRegistry: registry });
assert.equal(`${evilRoute.model.provider}/${evilRoute.model.id}`, EVIL_MODEL_REF, "fallback/* pins (isolated subagents) route to the evil model");
for (const chain of Object.keys(fallback.FALLBACK_CHAINS)) assert.equal(route(chain).model.id, EVIL_MODEL.id, `${chain} is served by the evil model`);
assert.throws(() => route("sol", { modelRegistry: { ...registry, hasConfiguredAuth: () => false } }), /evil mode/, "no silent fallback when the evil model has no key");
// Compaction honours the flag for a session that has no lock yet (a subagent).
mockSdk.calls.length = 0;
await compactHandler(compactEvent(), evilCtx({ sessionManager: session([]), model: all.get("openai/gpt-6-luna") }));
assert.deepEqual(mockSdk.calls.map((call) => call.model), [EVIL_MODEL_REF]);

// Unblocked reviewers load evil mode so their physical pins are overridden.
for (const agent of ["reviewer-security", "reviewer-simplicity"]) {
  assert.match(fs.readFileSync(path.join(root, "agents", `${agent}.md`), "utf8"), /^extensions: \[evil-mode\]$/m, `${agent} loads evil mode`);
}

fs.rmSync(mockDir, { recursive: true, force: true });
console.log("evil-mode smoke: PASS");
