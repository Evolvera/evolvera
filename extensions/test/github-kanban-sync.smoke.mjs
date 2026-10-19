import assert from "node:assert/strict";
import { loadJiti } from "./lib/pi-sdk.mjs";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const { createJiti } = await loadJiti(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const mod = await createJiti(import.meta.url).import(path.join(root, "extensions/github-kanban-sync.ts"));
// Explicit repository/issue forms are accepted so only deterministically linked tasks can mutate Projects.
assert.equal(mod.parseIssueReference({ subject: "Fix owner/repo#12" }).number, 12);
assert.equal(mod.parseIssueReference({ subject: "See https://github.com/acme/app/issues/8" }).number, 8);
assert.deepEqual(mod.parseIssueReference({ metadata: { issueUrl: "https://github.com/acme/app/issues/9" } }), { owner: "acme", repo: "app", number: 9 });
assert.deepEqual(mod.parseIssueReference({ metadata: { issue: "acme/app#10" } }), { owner: "acme", repo: "app", number: 10 });
assert.deepEqual(mod.parseIssueReference({ metadata: { issue: 13, repo: "acme/project" } }), { owner: "acme", repo: "project", number: 13 });
// Bare issue numbers are rejected because they do not uniquely identify a repository.
assert.equal(mod.parseIssueReference({ subject: "Fix #12" }), undefined);
// Each status maps only to its intended existing option, preserving Done for merge/close.
assert.equal(mod.statusOptionId(["Todo", "In Progress", "Done"], "in_progress"), "In Progress");
assert.equal(mod.statusOptionId([{ id: "review-id", name: "In Review" }, { id: "done-id", name: "Done" }], "completed"), "review-id");
assert.equal(mod.statusOptionId(["Todo", "Done"], "completed"), undefined);
assert.equal(mod.statusOptionId(["Backlog", "Bloqueado"], "blocked"), "Bloqueado");

const dir = mkdtempSync(path.join(tmpdir(), "kanban-smoke-"));
const callsFile = path.join(dir, "calls.jsonl");
const fakeGh = path.join(root, "extensions/test/fixtures/fake-gh.mjs");
const importUrl = pathToFileURL(fakeGh).href;
const prior = { bin: process.env.PI_KANBAN_GH_BIN, timeout: process.env.PI_KANBAN_GH_TIMEOUT_MS, debounce: process.env.PI_KANBAN_DEBOUNCE_MS, import: process.env.NODE_OPTIONS };
const listeners = new Map();
const notifications = [];
const emit = (name, ...args) => { for (const fn of listeners.get(name) ?? []) fn(...args); };
const pi = {
  on(name, fn) { const list = listeners.get(name) ?? []; list.push(fn); listeners.set(name, list); },
  events: { on() { return () => {}; }, emit() {} },
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const waitFor = async (predicate, timeoutMs = 3_000) => {
  const deadline = Date.now() + timeoutMs;
  while (!predicate() && Date.now() < deadline) await sleep(20);
  assert.ok(predicate(), `timed out waiting for fake gh activity: ${JSON.stringify({ calls: calls(), notifications })}`);
};
const records = () => existsSync(callsFile) ? readFileSync(callsFile, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)) : [];
const calls = () => records().filter((call) => call.phase === "start");
const todo = (...tasks) => emit("tool_result", { toolName: "todo", details: { tasks } });
try {
  process.env.PI_KANBAN_GH_BIN = process.execPath;
  process.env.PI_KANBAN_GH_TIMEOUT_MS = "1000";
  process.env.PI_KANBAN_DEBOUNCE_MS = "35";
  process.env.PI_KANBAN_FAKE_CALLS = callsFile;
  process.env.NODE_OPTIONS = `${prior.import ? `${prior.import} ` : ""}--import=${importUrl}`;
  const extension = mod.default(pi);
  emit("session_start", {}, { hasUI: true, ui: { notify: (message, level) => notifications.push({ message, level }) } });
  const task = (id, status, issue = 1, blockedBy) => ({ id, subject: `acme/app#${issue}`, status, ...(blockedBy ? { blockedBy } : {}) });
  // First in_progress sighting syncs once, while pending/deleted and repeated same-status snapshots never trigger extra calls.
  todo(task(1, "in_progress")); await sleep(500);
  assert.equal(calls().filter((call) => call.args.some((arg) => arg.startsWith("query=query("))).length, 1);
  todo(task(1, "in_progress"), task(2, "pending", 2), task(3, "deleted", 3)); await sleep(90);
  assert.equal(calls().length, 2);
  // An available matching status is idempotently skipped when the fake project already has that value.
  process.env.PI_KANBAN_FAKE_MODE = "already-in-status";
  todo(task(1, "completed"));
  await waitFor(() => calls().length >= 3);
  assert.equal(calls().length, 3);
  // Quick transitions debounce into one final sync using the latest status.
  process.env.PI_KANBAN_FAKE_MODE = "ok";
  todo(task(4, "in_progress", 4)); await sleep(10); todo(task(4, "completed", 4));
  await waitFor(() => calls().filter((call) => call.args.some((arg) => arg.includes("number=4") || arg.includes("item-4"))).length >= 2);
  assert.equal(calls().filter((call) => call.args.some((arg) => arg.includes("number=4") || arg.includes("item-4"))).length, 2);
  assert.ok(calls().some((call) => call.args.some((arg) => arg.includes("number=4")) && JSON.stringify(call.args).includes("number=4")));
  // Different issues proceed concurrently rather than waiting on one global serialization queue.
  process.env.PI_KANBAN_FAKE_MODE = "slow";
  todo(task(5, "in_progress", 5), task(6, "in_progress", 6));
  await waitFor(() => records().some((call) => call.phase === "end" && call.args.some((arg) => arg.includes("number=5"))) && records().some((call) => call.phase === "end" && call.args.some((arg) => arg.includes("number=6"))));
  const parallelQueries = records().filter((call) => call.args.some((arg) => arg.includes("number=5") || arg.includes("number=6")));
  assert.ok(Math.max(...parallelQueries.filter((call) => call.phase === "start").map((call) => call.at)) < Math.min(...parallelQueries.filter((call) => call.phase === "end").map((call) => call.at)));
  // The same issue still serializes its query/mutation pairs without blocking other issue queues.
  // Explicit numeric owner/repo metadata stay strings while the issue number alone uses gh's integer coercion.
  todo({ id: 16, status: "in_progress", metadata: { issue: 16, repo: "123/true" } });
  await waitFor(() => calls().some((call) => call.args.some((arg) => arg.includes("number=16"))));
  const numericArgs = calls().find((call) => call.args.some((arg) => arg.includes("number=16"))).args;
  assert.ok(numericArgs.includes("-f") && numericArgs.includes("owner=123"));
  assert.ok(numericArgs.includes("repo=true") && numericArgs.includes("-F") && numericArgs.includes("number=16"));
  // A blocker selects the blocked option, while a missing review option never falls through to Done.
  todo({ id: 17, subject: "acme/app#17", status: "in_progress", blockedBy: [18] }, { id: 18, status: "pending" });
  process.env.PI_KANBAN_FAKE_MODE = "ok";
  await waitFor(() => calls().some((call) => call.args.some((arg) => arg.includes("number=17"))));
  await waitFor(() => calls().some((call) => call.args.some((arg) => arg.includes("option=blocked-id"))));
  process.env.PI_KANBAN_FAKE_MODE = "no-review-option";
  todo(task(19, "pending", 19));
  todo(task(19, "completed", 19));
  const noReviewBefore = calls().length;
  await waitFor(() => calls().some((call) => call.args.some((arg) => arg.includes("number=19"))));
  await sleep(80);
  assert.equal(calls().length, noReviewBefore + 1);
  // Auth absence warns once per session and ordinary issue failure warns once per issue.
  process.env.PI_KANBAN_FAKE_MODE = "auth-missing";
  todo(task(7, "in_progress", 7));
  await waitFor(() => notifications.some((entry) => /indisponível/.test(entry.message)));
  todo(task(8, "in_progress", 8)); await sleep(200);
  assert.equal(notifications.filter((entry) => /indisponível/.test(entry.message)).length, 1);
  process.env.PI_KANBAN_FAKE_MODE = "failure";
  todo(task(9, "in_progress", 9));
  await waitFor(() => notifications.some((entry) => /Falha ao sincronizar.*#9/.test(entry.message)));
  todo(task(9, "completed", 9)); await sleep(200);
  assert.equal(notifications.filter((entry) => /Falha ao sincronizar.*#9/.test(entry.message)).length, 1);
  // A hanging gh child is killed by its configured deadline and reported without leaking a timer.
  process.env.PI_KANBAN_FAKE_MODE = "hang";
  todo(task(10, "in_progress", 10)); await sleep(1_300);
  assert.ok(calls().some((call) => call.args.some((arg) => arg.includes("number=10"))));
  assert.equal(records().filter((call) => call.phase === "end" && call.args.some((arg) => arg.includes("number=10"))).length, 0);
  assert.ok(notifications.some((entry) => /#10/.test(entry.message)));
  // The per-issue queue orders query/mutation pairs even when another status transition arrives during an active gh call.
  process.env.PI_KANBAN_FAKE_MODE = "slow";
  todo(task(20, "in_progress", 20));
  await waitFor(() => calls().some((call) => call.args.some((arg) => arg.includes("number=20"))));
  todo(task(20, "completed", 20));
  await waitFor(() => calls().filter((call) => call.args.some((arg) => arg.includes("number=20") || arg.includes("item-20"))).length >= 4);
  const serial = calls().filter((call) => call.args.some((arg) => arg.includes("number=20") || arg.includes("item-20")));
  assert.ok(serial[0].args.some((arg) => arg.includes("number=20")));
  assert.ok(serial[1].args.some((arg) => arg.includes("item-20")));
  assert.ok(serial[2].args.some((arg) => arg.includes("number=20")));
  assert.ok(serial[3].args.some((arg) => arg.includes("item-20")));
  // Async gh execution keeps PI's event loop responsive while its child is still running.
  process.env.PI_KANBAN_FAKE_MODE = "slow";
  let ticks = 0; const interval = setInterval(() => ticks++, 5);
  todo(task(11, "in_progress", 11));
  await waitFor(() => calls().some((call) => call.args.some((arg) => arg.includes("number=11"))));
  await sleep(30); clearInterval(interval);
  assert.ok(ticks > 2);
  // Shutdown clears a queued debounce timer so a later callback cannot start an unexpected API call.
  todo(task(12, "in_progress", 12));
  emit("session_shutdown");
  assert.equal(extension.getPendingTimerCount?.(), 0);
  await sleep(80);
  assert.equal(calls().filter((call) => call.args.some((arg) => arg.includes("number=12"))).length, 0);
} finally {
  for (const [key, value] of Object.entries({ PI_KANBAN_GH_BIN: prior.bin, PI_KANBAN_GH_TIMEOUT_MS: prior.timeout, PI_KANBAN_DEBOUNCE_MS: prior.debounce, NODE_OPTIONS: prior.import, PI_KANBAN_FAKE_CALLS: undefined, PI_KANBAN_FAKE_MODE: undefined })) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  rmSync(dir, { recursive: true, force: true });
}
