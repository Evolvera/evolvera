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

function setup(env, runner = async () => ({ stdout: "" })) {
  if (env === undefined) delete process.env.PI_REPORT_RUN;
  else process.env.PI_REPORT_RUN = env;
  const handlers = new Map();
  const notices = [];
  createWorkerReportExtension(runner)({ on: (name, handler) => handlers.set(name, handler) });
  const ctx = { cwd: "/tmp/worker-project", ui: { notify: (message, type) => notices.push({ message, type }) } };
  return { handlers, notices, ctx };
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
