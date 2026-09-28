import { loadJiti } from "./lib/pi-sdk.mjs";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { createJiti } = await loadJiti(import.meta.url);
const jiti = createJiti(import.meta.url, { moduleCache: false });
const { PlasticMemoryCoordinator } = await jiti.import(path.join(root, "plastic-memory/runtime/coordinator.ts"));

const handlers = new Map();
const notices = [];
const entries = [];
const pi = {
  on(type, handler) { handlers.set(type, handler); },
  appendEntry() { throw new Error("synthetic lifecycle smoke must not append"); },
};
const ctx = {
  sessionManager: {
    getSessionId: () => "synthetic-lifecycle-session",
    getBranch: () => entries,
    getEntries: () => entries,
    getLeafId: () => undefined,
    buildContextEntries: () => entries,
  },
  getContextUsage: () => ({ tokens: 0, contextWindow: 160_000 }),
  hasUI: true,
  ui: { notify(message, level) { notices.push({ message, level }); } },
};
const coordinator = new PlasticMemoryCoordinator(pi, { enabled: true });
const report = (event) => coordinator.reportLifecycle(ctx, event);

assert.equal(coordinator.getStatus(ctx).lastLifecycleDiagnostic, null, "fresh status has no lifecycle diagnosis");

report({
  phase: "observer",
  status: "failed",
  reason: "could not read /Users/alice/project/session-0123456789abcdef0123456789abcdef",
});
const observerDiagnostic = coordinator.getStatus(ctx).lastLifecycleDiagnostic;
assert.deepEqual(observerDiagnostic, {
  phase: "observer",
  outcome: "failed",
  code: "observer-failed",
  reason: "could not read [REDACTED_PATH]",
});
assert.equal(Object.keys(observerDiagnostic).sort().join(","), "code,outcome,phase,reason");
assert.equal(notices.at(-1).message, "Plastic memory: observer failed — observer-failed: could not read [REDACTED_PATH]");
assert.equal(notices.at(-1).level, "warning");
assert.equal(notices.at(-1).message.includes("session-0123456789abcdef0123456789abcdef"), false, "UI omits raw IDs");

report({ phase: "reflector", status: "failed" });
const reflectorDiagnostic = coordinator.getStatus(ctx).lastLifecycleDiagnostic;
assert.deepEqual(reflectorDiagnostic, {
  phase: "reflector",
  outcome: "failed",
  code: "reflector-failed",
  reason: "reflector failed did not provide a reason",
});
assert.equal(notices.at(-1).message, "Plastic memory: reflector failed — reflector-failed: reflector failed did not provide a reason");

report({ phase: "compactor", status: "skipped", reason: "stride not eligible (need six cycles)" });
assert.deepEqual(coordinator.getStatus(ctx).lastLifecycleDiagnostic, {
  phase: "compactor",
  outcome: "skipped",
  code: "compactor-skipped",
  reason: "stride not eligible (need six cycles)",
});
assert.deepEqual(coordinator.getStatus(ctx).lastCompactionDiagnostic, {
  phase: "normal-refresh",
  outcome: "skipped",
  code: "normal-stride-unavailable",
  reason: "stride not eligible (need six cycles)",
});
assert.equal(notices.at(-1).message, "Plastic memory: compactor skipped — compactor-skipped: stride not eligible (need six cycles)");

report({ phase: "compaction", status: "prepared" });
assert.deepEqual(coordinator.getStatus(ctx).lastLifecycleDiagnostic, {
  phase: "compactor",
  outcome: "skipped",
  code: "compactor-skipped",
  reason: "stride not eligible (need six cycles)",
}, "progress does not erase the last failure/skip diagnosis");

ctx.ui.notify = () => { throw new Error("notification failure"); };
const result = report({ phase: "compaction", status: "failed", reason: "host refused compaction" });
assert.equal(result, undefined, "notification failure does not change lifecycle return behavior");
assert.deepEqual(coordinator.getStatus(ctx).lastLifecycleDiagnostic, {
  phase: "compaction",
  outcome: "failed",
  code: "compaction-failed",
  reason: "host refused compaction",
});

coordinator.shutdown("synthetic lifecycle smoke complete");
console.log("PLASTIC_MEMORY_LIFECYCLE_OBSERVABILITY: PASS (retained lifecycle diagnostics, stable codes, sanitized UI/status reasons, skip compatibility, progress retention, and swallowed notify errors)");
