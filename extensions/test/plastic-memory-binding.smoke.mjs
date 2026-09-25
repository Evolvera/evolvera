import { loadJiti } from "./lib/pi-sdk.mjs";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { createJiti } = await loadJiti(import.meta.url);
const jiti = createJiti(import.meta.url, { moduleCache: false });
const coordinatorModule = await jiti.import(path.join(root, "plastic-memory/runtime/coordinator.ts"));
const ids = await jiti.import(path.join(root, "plastic-memory/common/ids.ts"));
const types = await jiti.import(path.join(root, "plastic-memory/session/types.ts"));

const hostSessionId = "019fcf17-6e55-7646-89f9-4e0e0258b267";
const entries = [
  { type: "message", id: "user-1", parentId: null, message: { role: "user", content: [{ type: "text", text: "hello" }] }, tokenCount: 1 },
  { type: "message", id: "assistant-1", parentId: "user-1", message: { role: "assistant", content: [{ type: "text", text: "hello" }] }, tokenCount: 1 },
];
const handlers = new Map();
const appended = [];
const pi = {
  on(event, handler) { handlers.set(event, handler); },
  appendEntry(customType, data) { appended.push({ type: "custom", customType, data }); },
  registerTool() {},
  registerCommand() {},
};
const ctx = {
  cwd: root,
  hasUI: false,
  sessionManager: {
    getSessionId() { return hostSessionId; },
    getEntries() { return entries; },
    getBranch() { return entries; },
    getLeafId() { return "assistant-1"; },
    buildContextEntries() { return entries; },
  },
  modelRegistry: { find() {}, getApiKeyAndHeaders() {} },
  isIdle() { return true; },
  hasPendingMessages() { return false; },
  compact() {},
  ui: { notify() {} },
};

const coordinator = new coordinatorModule.PlasticMemoryCoordinator(pi, { enabled: true });
await handlers.get("session_start")({ type: "session_start", reason: "startup" }, ctx);
const binding = coordinator.getBinding(ctx);
assert.match(binding.sessionId, /^[a-f0-9]{24}$/u);
assert.equal(types.isSessionBinding(binding), true);
const bootstrap = appended.find((entry) => entry.customType === "plastic.bootstrap.recorded");
assert.ok(bootstrap, "session_start appends a bootstrap record");
assert.equal(types.isPlasticRecord(bootstrap), true);
assert.doesNotThrow(() => ids.makeCycleId(binding.sessionId, "a".repeat(24)));

const secondPi = { ...pi, on(event, handler) { handlers.set(`second:${event}`, handler); } };
const secondCoordinator = new coordinatorModule.PlasticMemoryCoordinator(secondPi, { enabled: true });
assert.equal(secondCoordinator.getBinding(ctx).sessionId, binding.sessionId);

console.log("PLASTIC_MEMORY_BINDING: PASS (UUID host id derives stable valid session digest and bootstrap record)");
