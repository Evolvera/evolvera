import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = "/Users/j.henrique/npm-global/lib/node_modules/@earendil-works/pi-coding-agent";
const { createJiti } = await import(pathToFileURL(path.join(packageRoot, "node_modules/jiti/lib/jiti.mjs")).href);
const jiti = createJiti(import.meta.url, { moduleCache: false });
const ids = await jiti.import(path.join(root, "plastic-memory/common/ids.ts"));
const schedulerModule = await jiti.import(path.join(root, "plastic-memory/workers/scheduler.ts"));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

const binding = { sessionId: ids.sessionDigest("emergency-queue-smoke", { generation: 1 }), generation: 1, branchId: "main" };
const entries = [
  { type: "message", id: "queue-user", parentId: null, message: { role: "user", content: [{ type: "text", text: "preserve the bounded queue" }] }, tokenCount: 10 },
  { type: "message", id: "queue-assistant", parentId: "queue-user", message: { role: "assistant", content: [{ type: "text", text: "completed bounded queue" }] }, tokenCount: 10 },
];
const bootstrap = { activeEntryIds: entries.map((entry) => entry.id), historicalPrefixIds: [], historicalGap: "historical-unindexed" };
const firstObserver = deferred();
const firstObserverStarted = deferred();
const rescheduled = deferred();
const appended = [];
const calls = [];
let firstSignal;
let observerCalls = 0;
const model = { provider: "openai-codex", id: "gpt-5.6-luna", contextWindow: 200_000, maxTokens: 16_000 };
const runtime = {
  modelRegistry: {
    find(provider, id) { assert.equal(provider, model.provider); assert.equal(id, model.id); return model; },
    async getProviderAuth() { return { apiKey: "offline-only" }; },
  },
  async agentLoop(prompts, context, _config, signal) {
    const request = JSON.parse(prompts[0].content[0].text);
    calls.push(context.role);
    if (context.role === "observer") {
      observerCalls += 1;
      if (observerCalls === 1) {
        firstSignal = signal;
        firstObserverStarted.resolve();
        return firstObserver.promise;
      }
      return { observations: [{ content: "rescheduled fact", timestamp: "2026-08-06T15:02:43Z", relevance: "medium", sourceEntryIds: request.sourceEntryIds }] };
    }
    return { reflections: [{ content: "rescheduled reflection", supportingObservationIds: request.observations.map((observation) => observation.id) }] };
  },
};
const scheduler = schedulerModule.createCycleScheduler();
const input = { binding, branchEntries: entries, bootstrap, records: [], runtime, append: (entry) => appended.push(entry) };

const active = scheduler.trigger(input);
await firstObserverStarted.promise;
assert.equal(observerCalls, 1, "the first observer is active before lease acquisition");
assert.equal(appended.filter((entry) => entry.customType === "plastic.cycle.attempted").length, 1);

// Reservation happens synchronously, so neither a second acquirer nor a trigger can slip in
// while the aborted observer is still settling.
const acquiring = scheduler.acquireExclusiveLease();
assert.equal(firstSignal.aborted, true, "lease acquisition aborts the active worker synchronously");
const competing = await scheduler.acquireExclusiveLease();
assert.equal(competing.ok, false, "a second acquisition cannot succeed in the same scheduler epoch");
assert.equal(competing.reason, "exclusive-lease-held");
const firstDeferred = await scheduler.trigger({ ...input, reschedule: () => { throw new Error("older deferred callback must not run"); } });
let latestReschedules = 0;
const latestDeferred = await scheduler.trigger({
  ...input,
  reschedule: () => {
    latestReschedules += 1;
    void scheduler.trigger(input).then(rescheduled.resolve, rescheduled.reject);
  },
});
assert.equal(firstDeferred.status, "skipped");
assert.equal(latestDeferred.status, "skipped");
assert.equal(observerCalls, 1, "leased triggers start no observer/model work");
assert.equal(calls.filter((role) => role === "reflector").length, 0);

// A valid late response from the old observer cannot append semantic records after the barrier.
firstObserver.resolve({ observations: [{ content: "late fact", timestamp: "2026-08-06T15:02:43Z", relevance: "medium", sourceEntryIds: entries.map((entry) => entry.id) }] });
assert.equal((await active).status, "stale");
const acquisition = await acquiring;
assert.equal(acquisition.ok, true, "the lease resolves only after the aborted worker settles");
assert.equal(appended.some((entry) => entry.customType === "plastic.observations.recorded"), false, "no late observation append crosses the acquisition barrier");
assert.equal(appended.some((entry) => entry.customType === "plastic.cycle.closed"), false, "no late closure append crosses the acquisition barrier");

const lease = acquisition.lease;
lease.release();
lease.release();
assert.equal(latestReschedules, 0, "release starts no work inline");
const rescheduledResult = await rescheduled.promise;
assert.equal(rescheduledResult.status, "closed", "the latest deferred callback resumes ordinary scheduling once");
assert.equal(latestReschedules, 1, "the retained callback runs exactly once after release");
assert.equal(observerCalls, 2, "normal scheduling resumes after release");
assert.equal(appended.filter((entry) => entry.customType === "plastic.cycle.closed").length, 1);

// Invalidation clears deferred work and turns an outstanding release into a no-op.
const invalidatedScheduler = schedulerModule.createCycleScheduler();
const invalidated = await invalidatedScheduler.acquireExclusiveLease();
assert.equal(invalidated.ok, true);
let invalidatedReschedules = 0;
const invalidatedTrigger = await invalidatedScheduler.trigger({ ...input, reschedule: () => { invalidatedReschedules += 1; } });
assert.equal(invalidatedTrigger.status, "skipped");
invalidatedScheduler.invalidate("queue smoke invalidation");
invalidated.lease.release();
await Promise.resolve();
assert.equal(invalidatedReschedules, 0, "a stale release cannot restart cleared deferred work");

const aborted = new AbortController();
aborted.abort(new Error("queue smoke cancellation"));
const abortedAcquisition = await schedulerModule.createCycleScheduler().acquireExclusiveLease(aborted.signal);
assert.deepEqual(abortedAcquisition, { ok: false, reason: "aborted" }, "an already-aborted acquisition fails closed without reserving work");

console.log("PLASTIC_MEMORY_EMERGENCY_QUEUE: PASS (synchronous lease, abort-settle barrier, one deferred reschedule, idempotent release, invalidation, and no late append)");
