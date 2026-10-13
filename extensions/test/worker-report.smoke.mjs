import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePiSdkRoot } from "./lib/pi-sdk.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sdkRoot = resolvePiSdkRoot(import.meta.url);
const require = createRequire(import.meta.url);
const { createJiti } = require(path.join(sdkRoot, "node_modules/jiti/lib/jiti.cjs"));
const jiti = createJiti(import.meta.url, { fsCache: false, alias: { "@earendil-works/pi-coding-agent": path.join(sdkRoot, "dist/index.js") } });
const { createWorkerReportExtension } = await jiti.import(path.join(root, "extensions/worker-report.ts"));

function setup(env, runner = async () => ({ stdout: "" }), entries = []) {
  if (env === undefined) delete process.env.PI_REPORT_RUN;
  else process.env.PI_REPORT_RUN = env;
  const handlers = new Map();
  const notices = [];
  createWorkerReportExtension(runner)({
    on: (name, handler) => handlers.set(name, handler),
    appendEntry: (customType, data) => entries.push({ type: "custom", customType, data }),
  });
  const ctx = {
    cwd: "/tmp/worker-project",
    sessionManager: { getBranch: () => entries },
    ui: { notify: (message, type) => notices.push({ message, type }) },
  };
  return { handlers, notices, ctx, entries };
}

for (const env of [undefined, "bad/run-id"]) {
  const { handlers } = setup(env);
  assert.equal(handlers.size, 0, `inactive for ${String(env)}`);
}

const calls = [];
const active = setup("run_3419a9bd44e8", async (file, args, options) => {
  calls.push({ file, args, options });
  return { stdout: file === "git" ? "feature/worker\n" : "{\"ok\":true}" };
});
active.handlers.get("tool_call")({ toolCallId: "c1", toolName: "goal_complete", input: { goal_id: "goal-1", summary: "Implemented and tested." } });
const complete = { toolCallId: "c1", toolName: "goal_complete", isError: false };
await active.handlers.get("tool_execution_end")(complete, active.ctx);
await active.handlers.get("tool_execution_end")(complete, active.ctx);
assert.equal(calls.filter(({ file }) => file === "orca").length, 1, "duplicate completion does not resend");
assert.deepEqual(calls.find(({ file }) => file === "orca").args, [
  "orchestration", "send", "--to", "run:run_3419a9bd44e8",
  "--subject", "finished: worker-project",
  "--body", "cwd: /tmp/worker-project\nbranch: feature/worker\nSummary: Implemented and tested.",
  "--type", "status", "--json",
]);
assert.equal(calls.every(({ options }) => options.timeout === 10_000), true);

const blockedCalls = [];
const blocked = setup("run_3419a9bd44e8", async (file, args) => {
  blockedCalls.push({ file, args });
  return { stdout: file === "git" ? "main" : "" };
});
blocked.handlers.get("tool_call")({ toolCallId: "b1", toolName: "goal_blocked", input: { goal_id: "goal-2", reason: "Needs access", evidence: "Access denied three times" } });
await blocked.handlers.get("tool_execution_end")({ toolCallId: "b1", toolName: "goal_blocked", isError: false }, blocked.ctx);
const blockedMessage = blockedCalls.find(({ file }) => file === "orca").args;
assert.equal(blockedMessage[5], "blocked: worker-project");
assert.match(blockedMessage[7], /Reason: Needs access\nEvidence: Access denied three times/);

// pi-goal returns rejections (stale goal_id, empty summary…) as normal results: never report them.
let rejectedSends = 0;
const rejected = setup("run_3419a9bd44e8", async (file) => { if (file === "orca") rejectedSends++; return { stdout: "" }; });
rejected.handlers.get("tool_call")({ toolCallId: "r1", toolName: "goal_complete", input: { goal_id: "old", summary: "done" } });
await rejected.handlers.get("tool_execution_end")({ toolCallId: "r1", toolName: "goal_complete", isError: false, result: { content: [{ type: "text", text: "Goal completion rejected: goal_id is stale." }] } }, rejected.ctx);
rejected.handlers.get("tool_call")({ toolCallId: "r2", toolName: "goal_blocked", input: { goal_id: "old", reason: "x", evidence: "y" } });
await rejected.handlers.get("tool_execution_end")({ toolCallId: "r2", toolName: "goal_blocked", isError: false, result: { content: [{ type: "text", text: "goal_blocked rejected: evidence is empty." }] } }, rejected.ctx);
assert.equal(rejectedSends, 0, "rejected goal calls are not reported");

const goalState = (id) => ({ type: "custom", customType: "goal-state", data: { goal: { id, status: "active" } } });
const nativeEntries = [goalState("goal-native")];
const native = setup("run_3419a9bd44e8", async () => ({ stdout: "" }), nativeEntries);
const canonicalCommand = "orca orchestration send --to run:run_123 --subject done --body complete --type worker_done";
const nativeResult = { content: [{ type: "text", text: '{"ok":true,"result":{"message":{"type":"worker_done"}}}' }] };
const doneEvent = { toolCallId: "native1", toolName: "bash", isError: false, result: { content: [{ type: "text", text: "Sent msg_5ec14fb534ea" }] } };
native.handlers.get("tool_call")({ toolCallId: doneEvent.toolCallId, toolName: "bash", input: { command: canonicalCommand } }, native.ctx);
await native.handlers.get("tool_execution_end")(doneEvent, native.ctx);
assert.equal(nativeEntries.filter((entry) => entry.customType === "worker-report-native-done").length, 1, "accepted native done persisted once for the active canonical goal");
native.handlers.get("tool_call")({ toolCallId: doneEvent.toolCallId, toolName: "bash", input: { command: canonicalCommand } }, native.ctx);
await native.handlers.get("tool_execution_end")(doneEvent, native.ctx);
assert.equal(nativeEntries.filter((entry) => entry.customType === "worker-report-native-done").length, 1, "duplicate native receipt does not append another entry");
const reloaded = setup("run_3419a9bd44e8", async (file, args) => { if (file === "orca") throw new Error("must suppress duplicate"); return { stdout: "" }; }, nativeEntries);
reloaded.handlers.get("tool_call")({ toolCallId: "native-goal", toolName: "goal_complete", input: { goal_id: "goal-native", summary: "done" } });
await reloaded.handlers.get("tool_execution_end")({ toolCallId: "native-goal", toolName: "goal_complete", isError: false }, reloaded.ctx);
assert.equal(reloaded.notices.length, 0, "native worker_done suppresses fallback after extension reload");

const jsonAcceptedEntries = [goalState("goal-json")];
const jsonAccepted = setup("run_3419a9bd44e8", undefined, jsonAcceptedEntries);
jsonAccepted.handlers.get("tool_call")({ toolCallId: "json-accepted", toolName: "bash", input: { command: canonicalCommand } }, jsonAccepted.ctx);
await jsonAccepted.handlers.get("tool_execution_end")({ toolCallId: "json-accepted", toolName: "bash", isError: false, result: nativeResult }, jsonAccepted.ctx);
assert.equal(jsonAcceptedEntries.some((entry) => entry.customType === "worker-report-native-done"), true, "strict positive JSON receipt remains accepted for canonical worker_done command");

for (const [label, result, isError, command] of [
  ["rejected", { content: [{ type: "text", text: '{"ok":false,"result":{"message":{"type":"worker_done"}}}' }] }, false, canonicalCommand],
  ["status", { content: [{ type: "text", text: '{"ok":true,"result":{"message":{"type":"status"}}}' }] }, false, "orca orchestration send --type status"],
  ["heartbeat", { content: [{ type: "text", text: '{"ok":true,"result":{"message":{"type":"heartbeat"}}}' }] }, false, "orca orchestration send --type heartbeat"],
  ["plain-status", { content: [{ type: "text", text: "Sent msg_status1" }] }, false, "orca orchestration send --type status"],
  ["plain-heartbeat", { content: [{ type: "text", text: "Sent msg_heartbeat1" }] }, false, "orca orchestration send --type heartbeat"],
  ["malformed", { content: [{ type: "text", text: "Sent msg_malformed1 trailing" }] }, false, canonicalCommand],
  ["error", { content: [{ type: "text", text: "Sent msg_error1" }] }, true, canonicalCommand],
  ["mixed", { content: [{ type: "text", text: "prefix" }, { type: "text", text: JSON.stringify(nativeResult) }] }, false, canonicalCommand],
  ["noncanonical", { content: [{ type: "text", text: "Sent msg_fake1" }] }, false, "echo 'orca orchestration send --type worker_done'"],
]) {
  const entries = [goalState(`goal-${label}`)];
  const candidate = setup("run_3419a9bd44e8", undefined, entries);
  candidate.handlers.get("tool_call")({ toolCallId: label, toolName: "bash", input: { command } }, candidate.ctx);
  await candidate.handlers.get("tool_execution_end")({ toolCallId: label, toolName: "bash", isError, result }, candidate.ctx);
  assert.equal(entries.some((entry) => entry.customType === "worker-report-native-done"), false, `${label} does not persist completion`);
}

const noGoalEntries = [];
const noGoal = setup("run_3419a9bd44e8", undefined, noGoalEntries);
noGoal.handlers.get("tool_call")({ toolCallId: doneEvent.toolCallId, toolName: "bash", input: { command: canonicalCommand } }, noGoal.ctx);
await noGoal.handlers.get("tool_execution_end")(doneEvent, noGoal.ctx);
noGoalEntries.push(goalState("goal-later"));
const later = setup("run_3419a9bd44e8", async (file) => ({ stdout: file === "orca" ? "sent" : "" }), noGoalEntries);
later.handlers.get("tool_call")({ toolCallId: "later", toolName: "goal_complete", input: { goal_id: "goal-later", summary: "done" } });
await later.handlers.get("tool_execution_end")({ toolCallId: "later", toolName: "goal_complete", isError: false }, later.ctx);
assert.equal(noGoalEntries.some((entry) => entry.customType === "worker-report-native-done"), false, "native done without active goal cannot suppress a future goal");
assert.equal(later.notices.length, 0, "new goal still uses normal reporting fallback");
const newerEntries = [...nativeEntries, goalState("goal-new")];
let newerSends = 0;
const newer = setup("run_3419a9bd44e8", async (file) => { if (file === "orca") newerSends++; return { stdout: "" }; }, newerEntries);
newer.handlers.get("tool_call")({ toolCallId: "new-goal", toolName: "goal_complete", input: { goal_id: "goal-new", summary: "done" } });
await newer.handlers.get("tool_execution_end")({ toolCallId: "new-goal", toolName: "goal_complete", isError: false }, newer.ctx);
assert.equal(newerSends, 1, "receipt for an earlier goal does not suppress a new goal ID");
const clearedEntries = [goalState("goal-cleared"), { type: "custom", customType: "goal-state", data: { goal: null } }];
const cleared = setup("run_3419a9bd44e8", undefined, clearedEntries);
cleared.handlers.get("tool_call")({ toolCallId: doneEvent.toolCallId, toolName: "bash", input: { command: canonicalCommand } }, cleared.ctx);
await cleared.handlers.get("tool_execution_end")(doneEvent, cleared.ctx);
assert.equal(clearedEntries.some((entry) => entry.customType === "worker-report-native-done"), false, "latest cleared canonical state does not fall back to an older goal");

// Native acceptance belongs to the Goal at call time, not a newer Goal
// installed while the external command is running.
const changingEntries = [goalState("goal-before")];
const changing = setup("run_3419a9bd44e8", undefined, changingEntries);
changing.handlers.get("tool_call")({ toolCallId: "changing", toolName: "bash", input: { command: canonicalCommand } }, changing.ctx);
changingEntries.push(goalState("goal-after"));
await changing.handlers.get("tool_execution_end")({ ...doneEvent, toolCallId: "changing" }, changing.ctx);
assert.equal(changingEntries.some((entry) => entry.customType === "worker-report-native-done" && entry.data.goal_id === "goal-before"), true);
assert.equal(changingEntries.some((entry) => entry.customType === "worker-report-native-done" && entry.data.goal_id === "goal-after"), false, "old native completion cannot suppress a new Goal");

let failedSendAttempts = 0;
const failed = setup("run_3419a9bd44e8", async (file) => {
  if (file === "orca") { failedSendAttempts++; throw new Error("offline"); }
  return { stdout: "" };
});
failed.handlers.get("tool_call")({ toolCallId: "e1", toolName: "goal_complete", input: { goal_id: "goal-3", summary: "done" } });
await failed.handlers.get("tool_execution_end")({ toolCallId: "e1", toolName: "goal_complete", isError: true }, failed.ctx);
assert.equal(failed.notices.length, 0, "tool execution errors are not reported");
assert.equal(failedSendAttempts, 0, "tool execution errors do not send");
failed.handlers.get("tool_call")({ toolCallId: "f1", toolName: "goal_complete", input: { goal_id: "goal-4", summary: "done" } });
await failed.handlers.get("tool_execution_end")({ toolCallId: "f1", toolName: "goal_complete", isError: false }, failed.ctx);
failed.handlers.get("tool_call")({ toolCallId: "f2", toolName: "goal_blocked", input: { goal_id: "goal-5", reason: "blocked", evidence: "proof" } });
await failed.handlers.get("tool_execution_end")({ toolCallId: "f2", toolName: "goal_blocked", isError: false }, failed.ctx);
assert.equal(failed.notices.length, 1, "runner failures warn once");
assert.equal(failed.notices[0].type, "warning");

delete process.env.PI_REPORT_RUN;
console.log("worker-report smoke: PASS");
