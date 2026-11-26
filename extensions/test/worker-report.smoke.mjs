import assert from "node:assert/strict";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolvePiSdkRoot } from "./lib/pi-sdk.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sandbox = mkdtempSync(path.join(os.tmpdir(), "worker-report-smoke-"));
process.env.HOME = path.join(sandbox, "home");
process.env.PI_CODING_AGENT_DIR = path.join(sandbox, "agent");
process.env.TMPDIR = sandbox;
mkdirSync(process.env.HOME, { recursive: true });
const sdkRoot = resolvePiSdkRoot(import.meta.url);
const require = createRequire(import.meta.url);
const { createJiti } = require(path.join(sdkRoot, "node_modules/jiti/lib/jiti.cjs"));
const jiti = createJiti(import.meta.url, { fsCache: false, alias: { "@earendil-works/pi-coding-agent": path.join(sdkRoot, "dist/index.js") } });
const { createWorkerReportExtension } = await jiti.import(path.join(root, "extensions/worker-report.ts"));

const goalState = (id, status = "active") => ({ type: "custom", customType: "goal-state", data: { goal: { id, status } } });

function setup(env, runner = async () => ({ stdout: '{"ok":true}' }), entries = [], runShow) {
  if (env === undefined) delete process.env.PI_REPORT_RUN;
  else process.env.PI_REPORT_RUN = env;
  const handlers = new Map();
  const notices = [];
  const coordinator = JSON.stringify({ ok: true, result: { run: { coordinator_handle: "term_123e4567-e89b-12d3-a456-426614174000" } } });
  const withRun = async (file, args, options) => file === "orca" && args[1] === "run-show" ? { stdout: runShow ?? coordinator } : runner(file, args, options);
  createWorkerReportExtension(withRun)({
    on: (name, handler) => handlers.set(name, handler),
    appendEntry: (customType, data) => entries.push({ type: "custom", customType, data }),
  });
  const ctx = {
    cwd: "/tmp/worker-project",
    sessionManager: { getBranch: () => entries },
    ui: { notify: (message, type) => notices.push({ message, type }) },
  };
  const callArgs = new Map();
  const originalToolCall = handlers.get("tool_call");
  if (originalToolCall) handlers.set("tool_call", (event, callCtx) => { if (event.toolName === "goal_complete" || event.toolName === "goal_blocked") callArgs.set(event.toolCallId, event.input); return originalToolCall(event, callCtx ?? ctx); });
  const finishGoal = async (event, status) => {
    entries.push({ type: "custom", customType: "goal-state", data: { goal: { id: callArgs.get(event.toolCallId)?.goal_id, status } } });
    await handlers.get("tool_execution_end")(event, ctx);
  };
  return { handlers, notices, ctx, entries, finishGoal };
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
await active.finishGoal(complete, "complete");
await active.handlers.get("tool_execution_end")(complete, active.ctx);
assert.equal(calls.filter(({ file, args }) => file === "orca" && args[1] === "send").length, 1, "duplicate completion does not resend");
assert.deepEqual(calls.find(({ file, args }) => file === "orca" && args[1] === "send").args, [
  "terminal", "send", "--terminal", "term_123e4567-e89b-12d3-a456-426614174000",
  "--text", "[child worker-project] goal finished | goal_id=goal-1 | branch=feature/worker | Summary: Implemented and tested.",
  "--enter", "--json",
]);
assert.equal(calls.every(({ options }) => options.timeout === 10_000), true);

{
  const agentDir = process.env.PI_CODING_AGENT_DIR;
  const childEvents = path.join(agentDir, "child-events");
  mkdirSync(childEvents, { recursive: true });
  const stat = readFileSync(`/proc/${process.pid}/stat`, "utf8");
  const startTime = stat.slice(stat.lastIndexOf(") ") + 2).trim().split(/\s+/)[19];
  writeFileSync(path.join(childEvents, "relay.pid.json"), JSON.stringify({ pid: process.pid, startTime }));
  const queuedCalls = [];
  const queued = setup("run_cached-route", async (file, args) => {
    queuedCalls.push({ file, args });
    return { stdout: '{"ok":true}' };
  }, [], "invalid run-show response");
  const routesFile = path.join(agentDir, "report-routes.json");
  mkdirSync(agentDir, { recursive: true });
  writeFileSync(routesFile, JSON.stringify({ "run_cached-route": "term_123e4567-e89b-12d3-a456-426614174000", "run_other": "term_other" }));
  queued.handlers.get("tool_call")({ toolCallId: "relay-goal", toolName: "goal_complete", input: { goal_id: "goal-relay", summary: "queued once" } });
  await queued.finishGoal({ toolCallId: "relay-goal", toolName: "goal_complete", isError: false }, "complete");
  assert.equal(queuedCalls.some(({ file, args }) => file === "orca" && args[1] === "send"), false, "ready relay owns delivery; no direct terminal send");
  const files = readdirSync(path.join(childEvents, "queue")).filter((name) => name.endsWith(".json"));
  assert.equal(files.length, 1, "accepted Goal is atomically queued once");
  const event = JSON.parse(readFileSync(path.join(childEvents, "queue", files[0]), "utf8"));
  assert.equal(event.kind, "goal_finished");
  assert.equal(event.runId, "run_cached-route");
  assert.deepEqual(JSON.parse(readFileSync(routesFile, "utf8")), { "run_cached-route": "term_123e4567-e89b-12d3-a456-426614174000", "run_other": "term_other" }, "route updates preserve unrelated entries and cached route survives invalid run-show");
  assert.equal(queued.notices.length, 0);
  unlinkSync(path.join(childEvents, "relay.pid.json"));
}

{
  const agentDir = process.env.PI_CODING_AGENT_DIR;
  const childEvents = path.join(agentDir, "child-events");
  const queue = path.join(childEvents, "queue");
  mkdirSync(queue, { recursive: true });
  const queuedBeforeDirect = readdirSync(queue).filter((name) => name.endsWith(".json")).length;
  const runId = "run_direct-race";
  const sent = setup(runId, async (file, args) => {
    if (file === "orca" && args[1] === "send") {
      const stat = readFileSync(`/proc/${process.pid}/stat`, "utf8");
      const startTime = stat.slice(stat.lastIndexOf(") ") + 2).trim().split(/\s+/)[19];
      writeFileSync(path.join(childEvents, "relay.pid.json"), JSON.stringify({ pid: process.pid, startTime }));
      return { stdout: '{"ok":true}' };
    }
    return { stdout: file === "git" ? "" : "" };
  });
  sent.handlers.get("tool_call")({ toolCallId: "direct-race", toolName: "goal_complete", input: { goal_id: "goal-direct-race", summary: "sent directly" } });
  await sent.finishGoal({ toolCallId: "direct-race", toolName: "goal_complete", isError: false }, "complete");
  assert.equal(readdirSync(queue).filter((name) => name.endsWith(".json")).length, queuedBeforeDirect, "successful direct delivery does not spool even when relay readiness appears before its receipt resolves");
  unlinkSync(path.join(childEvents, "relay.pid.json"));
}

const blockedCalls = [];
const blocked = setup("run_3419a9bd44e8", async (file, args) => {
  blockedCalls.push({ file, args });
  return { stdout: file === "git" ? "main" : "" };
});
blocked.handlers.get("tool_call")({ toolCallId: "b1", toolName: "goal_blocked", input: { goal_id: "goal-2", reason: "Needs access", evidence: "Access denied three times" } });
await blocked.finishGoal({ toolCallId: "b1", toolName: "goal_blocked", isError: false }, "blocked");
const blockedMessage = blockedCalls.find(({ file }) => file === "orca").args;
assert.match(blockedMessage[5], /^\[child worker-project\] goal blocked \| goal_id=goal-2/);
assert.match(blockedMessage[5], /Reason: Needs access Evidence: Access denied three times/);

// pi-goal returns rejections (stale goal_id, empty summary…) as normal results: never report them.
let rejectedSends = 0;
const rejected = setup("run_3419a9bd44e8", async (file) => { if (file === "orca") rejectedSends++; return { stdout: "" }; });
rejected.handlers.get("tool_call")({ toolCallId: "r1", toolName: "goal_complete", input: { goal_id: "old", summary: "done" } });
await rejected.handlers.get("tool_execution_end")({ toolCallId: "r1", toolName: "goal_complete", isError: false, result: { content: [{ type: "text", text: "Goal completion rejected: goal_id is stale." }] } }, rejected.ctx);
rejected.handlers.get("tool_call")({ toolCallId: "r2", toolName: "goal_blocked", input: { goal_id: "old", reason: "x", evidence: "y" } });
await rejected.handlers.get("tool_execution_end")({ toolCallId: "r2", toolName: "goal_blocked", isError: false, result: { content: [{ type: "text", text: "goal_blocked rejected: evidence is empty." }] } }, rejected.ctx);
assert.equal(rejectedSends, 0, "rejected goal calls are not reported");

for (const receipt of ["", "not-json", '{"ok":false}']) {
  let sends = 0;
  const candidate = setup("run_3419a9bd44e8", async (file) => {
    if (file === "orca") { sends++; return { stdout: receipt }; }
    return { stdout: "" };
  });
  candidate.handlers.get("tool_call")({ toolCallId: `receipt-${sends}`, toolName: "goal_complete", input: { goal_id: "receipt-goal", summary: "done" } });
  await candidate.finishGoal({ toolCallId: `receipt-${sends}`, toolName: "goal_complete", isError: false }, "complete");
  await candidate.handlers.get("agent_end")({}, candidate.ctx);
  assert.equal(sends, process.platform === "linux" ? 1 : 2, `receipt ${JSON.stringify(receipt)} uses Linux spool acceptance or one non-Linux retry`);
}

let mismatchedSends = 0;
const mismatched = setup("run_3419a9bd44e8", async (file) => { if (file === "orca") mismatchedSends++; return { stdout: '{"ok":true}' }; });
mismatched.handlers.get("tool_call")({ toolCallId: "mismatch", toolName: "goal_complete", input: { goal_id: "goal-mismatch", summary: "done" } });
mismatched.entries.push(goalState("different-goal", "complete"));
await mismatched.handlers.get("tool_execution_end")({ toolCallId: "mismatch", toolName: "goal_complete", isError: false }, mismatched.ctx);
assert.equal(mismatchedSends, 0, "terminal state for a different canonical Goal is not accepted evidence");

for (const latestState of [
  { type: "custom", customType: "goal-state", data: { goal: null } },
  { type: "custom", customType: "goal-state", data: { malformed: true } },
  { type: "custom", customType: "goal-state", data: { goal: { id: "another-goal", status: "complete" } } },
]) {
  let sends = 0;
  const candidate = setup("run_3419a9bd44e8", async (file) => { if (file === "orca") sends++; return { stdout: '{"ok":true}' }; }, [goalState("older-complete", "complete"), latestState]);
  candidate.handlers.get("tool_call")({ toolCallId: "cleared-old", toolName: "goal_complete", input: { goal_id: "older-complete", summary: "done" } });
  await candidate.handlers.get("tool_execution_end")({ toolCallId: "cleared-old", toolName: "goal_complete", isError: false }, candidate.ctx);
  assert.equal(sends, 0, "cleared, malformed, or nonmatching latest canonical state cannot fall back to an older terminal Goal");
}

{
  let sends = 0;
  const lifecycle = setup("run_3419a9bd44e8", async (file) => { if (file === "orca") sends++; return { stdout: '{"ok":true}' }; }, [goalState("goal-lifecycle")]);
  lifecycle.handlers.get("tool_call")({ toolCallId: "lifecycle", toolName: "goal_complete", input: { goal_id: "goal-lifecycle", summary: "done" } });
  lifecycle.entries.push(goalState("goal-lifecycle", "complete"), { type: "custom", customType: "goal-state", data: { goal: null } });
  await lifecycle.handlers.get("tool_execution_end")({ toolCallId: "lifecycle", toolName: "goal_complete", isError: false }, lifecycle.ctx);
  assert.equal(sends, 1, "native terminal-then-cleared state persisted during this call is accepted");
}

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
reloaded.entries.push(goalState("goal-native", "complete"));
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
later.entries.push(goalState("goal-later", "complete"));
await later.handlers.get("tool_execution_end")({ toolCallId: "later", toolName: "goal_complete", isError: false }, later.ctx);
assert.equal(noGoalEntries.some((entry) => entry.customType === "worker-report-native-done"), false, "native done without active goal cannot suppress a future goal");
assert.equal(later.notices.length, 0, "new goal still uses normal reporting fallback");
const newerEntries = [...nativeEntries, goalState("goal-new")];
let newerSends = 0;
const newer = setup("run_3419a9bd44e8", async (file) => { if (file === "orca") newerSends++; return { stdout: "" }; }, newerEntries);
newer.handlers.get("tool_call")({ toolCallId: "new-goal", toolName: "goal_complete", input: { goal_id: "goal-new", summary: "done" } });
newer.entries.push(goalState("goal-new", "complete"));
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
const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
const unavailableSpool = path.join(sandbox, "unavailable-agent");
mkdirSync(path.join(unavailableSpool, "child-events"), { recursive: true });
writeFileSync(path.join(unavailableSpool, "child-events", "queue"), "not a directory");
process.env.PI_CODING_AGENT_DIR = unavailableSpool;
await failed.finishGoal({ toolCallId: "f1", toolName: "goal_complete", isError: false }, "complete");
await failed.handlers.get("agent_end")({}, failed.ctx);
process.env.PI_CODING_AGENT_DIR = previousAgentDir;
assert.equal(failedSendAttempts, 2, "failed direct delivery and unavailable spool gets exactly one lifecycle retry");
assert.equal(failed.notices.length, 1, "persistent total transport failure warns once after the bounded retry");
assert.equal(failed.notices[0].type, "warning");
await failed.handlers.get("agent_end")({}, failed.ctx);
assert.equal(failedSendAttempts, 2, "no retry loop after the lifecycle checkpoint");

let recoveryAttempts = 0;
const recovered = setup("run_3419a9bd44e8", async (file) => {
  if (file === "orca") { recoveryAttempts++; if (recoveryAttempts === 1) throw new Error("temporary failure"); return { stdout: '{"ok":true}' }; }
  return { stdout: "" };
});
recovered.handlers.get("tool_call")({ toolCallId: "recover", toolName: "goal_complete", input: { goal_id: "goal-recover", summary: "done" } });
const recoveryAgentDir = path.join(sandbox, "recovery-agent");
mkdirSync(path.join(recoveryAgentDir, "child-events"), { recursive: true });
writeFileSync(path.join(recoveryAgentDir, "child-events", "queue"), "not a directory");
const reportAgentDir = process.env.PI_CODING_AGENT_DIR;
process.env.PI_CODING_AGENT_DIR = recoveryAgentDir;
await recovered.finishGoal({ toolCallId: "recover", toolName: "goal_complete", isError: false }, "complete");
await recovered.handlers.get("agent_end")({}, recovered.ctx);
process.env.PI_CODING_AGENT_DIR = reportAgentDir;
await recovered.handlers.get("tool_execution_end")({ toolCallId: "recover", toolName: "goal_complete", isError: false }, recovered.ctx);
assert.equal(recoveryAttempts, 2, "positive retry acknowledgment marks the goal/outcome reported and prevents later duplicates");

{
  // pi-goal stopping a Goal by itself (agent error) is reported once, deferred after agent_end.
  const sends = [];
  const stopped = setup("run_3419a9bd44e8", async (file, args) => { if (file === "orca") sends.push(args); return { stdout: '{"ok":true}' }; },
    [{ type: "custom", customType: "goal-state", data: { goal: { id: "goal-self", status: "blocked", updatedAt: 1 } } }]);
  const end = { messages: [{ role: "assistant", errorMessage: "ENOSPC: no space left on device" }] };
  await stopped.handlers.get("agent_end")(end, stopped.ctx);
  await stopped.handlers.get("agent_end")(end, stopped.ctx);
  await new Promise((resolve) => setTimeout(resolve, 1_300));
  assert.equal(sends.length, 1, "self-stopped goal is reported exactly once");
  assert.match(sends[0][5], /goal blocked \| goal_id=goal-self .*ENOSPC/);
  const active = setup("run_3419a9bd44e8", async (file) => { if (file === "orca") throw new Error("must not send"); return { stdout: "" }; }, [goalState("goal-running")]);
  await active.handlers.get("agent_end")({ messages: [] }, active.ctx);
  await new Promise((resolve) => setTimeout(resolve, 1_300));
  assert.equal(active.notices.length, 0, "active goal is not reported");
}

delete process.env.PI_REPORT_RUN;
rmSync(sandbox, { recursive: true, force: true });
console.log("worker-report smoke: PASS");
