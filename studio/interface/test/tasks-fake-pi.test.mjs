// The fake PI's "tasks-demo" scenario and /steer reply, exercised through the same lib.js the Tarefas tab uses (no real pi, no server).
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { collectSubagents, entriesToMessages, subagentRecords, taskRows, taskStampsFromMessages, todoFromMessages } from "../public/lib.js";

const fakePi = path.join(path.dirname(fileURLToPath(import.meta.url)), "fake-pi-rpc.mjs");
const tmp = await mkdtemp(path.join(os.tmpdir(), "pi-studio-tasks-fake-"));
const steerLog = path.join(tmp, "steer.log");
after(() => rm(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));

let child;
let buffered = "";
const events = [];
const waiters = [];
before(() => {
  child = spawn(process.execPath, [fakePi], { env: { ...process.env, FAKE_PI_STEER: "1", FAKE_PI_STEER_LOG: steerLog }, stdio: ["pipe", "pipe", "inherit"] });
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    buffered += chunk;
    let index = buffered.indexOf("\n");
    while (index !== -1) {
      const line = buffered.slice(0, index);
      buffered = buffered.slice(index + 1);
      if (line.trim()) {
        const event = JSON.parse(line);
        events.push(event);
        for (const waiter of [...waiters]) waiter(event);
      }
      index = buffered.indexOf("\n");
    }
  });
});
after(() => child.kill());

function send(command) {
  child.stdin.write(`${JSON.stringify(command)}\n`);
}

function waitFor(match, timeoutMs = 8000) {
  const known = events.find(match);
  if (known) return Promise.resolve(known);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out waiting for a fake PI event")), timeoutMs);
    const waiter = (event) => {
      if (!match(event)) return;
      clearTimeout(timer);
      waiters.splice(waiters.indexOf(waiter), 1);
      resolve(event);
    };
    waiters.push(waiter);
  });
}

async function entries() {
  const id = `entries-${events.length}`;
  send({ id, type: "get_entries" });
  return (await waitFor((event) => event.type === "response" && event.id === id)).data.entries;
}

const notifies = () => events.filter((event) => event.method === "notify").map((event) => [event.notifyType, event.message]);

describe("fake PI: tasks-demo and /steer", () => {
  test("tasks-demo streams todo snapshots with owner, blockedBy, description and metadata, plus linked Agent runs", async () => {
    send({ id: "p1", type: "prompt", message: "tasks-demo" });
    await waitFor((event) => event.type === "agent_settled");
    const list = await entries();
    const messages = entriesToMessages(list, list.at(-1).id);
    const tasks = todoFromMessages(messages);
    assert.deepEqual(tasks.map((task) => [task.id, task.status]), [[1, "in_progress"], [2, "pending"], [3, "pending"], [4, "completed"], [5, "pending"]]);
    assert.deepEqual(tasks[1].blockedBy, [1]);
    assert.equal(tasks[4].owner, "docs-bot");
    assert.ok(tasks[2].description);
    // The live event carries the full snapshot too (what the Tarefas tab reads while the PI runs).
    const live = events.findLast((event) => event.type === "tool_execution_end" && event.toolName === "todo");
    assert.equal(live.result.details.tasks.find((task) => task.id === 2).blockedBy[0], 1);

    const runs = collectSubagents(messages, new Map(), subagentRecords(list), Date.now());
    assert.deepEqual(runs.map((run) => [run.agentId, run.phase]).sort(), [["ag-t1", "running"], ["ag-t2", "done"]]);
    assert.deepEqual(runs.map((run) => run.title).sort(), ["Validator", "benchmark-bot"], "emoji in the display name is stripped");
    const rows = taskRows({ tasks, stamps: taskStampsFromMessages(messages), runs, now: Date.now() });
    const bench = rows.find((row) => row.id === 1);
    assert.deepEqual([bench.owner.kind, bench.owner.runId, bench.running, bench.actions.message], ["subagent", "ag-t1", true, true]);
    assert.match(bench.timing.text, /^rodando há [56] min$/);
    assert.equal(rows.find((row) => row.id === 4).timing.text, "levou 3 min", "start and end come from the snapshots' message times");
    assert.deepEqual([rows.find((row) => row.id === 2).blocked, rows.find((row) => row.id === 2).timing.text], [true, "bloqueada"]);
    assert.equal(rows.find((row) => row.id === 3).actions.parallel, true);
    assert.equal(rows.find((row) => row.id === 5).owner.label, "docs-bot");
  });

  test("get_commands lists /steer and a /steer prompt answers with the extension's notify and is recorded", async () => {
    send({ id: "c1", type: "get_commands" });
    const commands = (await waitFor((event) => event.type === "response" && event.id === "c1")).data.commands;
    assert.ok(commands.some((command) => command.name === "steer" && command.source === "extension"));
    send({ id: "s1", type: "prompt", message: "/steer ag-t1 olá   do   teste" });
    await waitFor((event) => event.message === "Mensagem enviada ao subagente ag-t1");
    assert.deepEqual((await readFile(steerLog, "utf8")).trim().split("\n").map((line) => JSON.parse(line)), [{ agentId: "ag-t1", message: "olá   do   teste" }]);
    send({ id: "s2", type: "prompt", message: "/steer ag-zzz oi" });
    await waitFor((event) => event.message === "Subagente desconhecido: ag-zzz.");
    send({ id: "s3", type: "prompt", message: "/steer ag-t1" });
    await waitFor((event) => typeof event.message === "string" && event.message.startsWith("Uso: /steer"));
    assert.deepEqual(notifies().map(([level]) => level), ["info", "warning", "warning"]);
  });

  test("tasks-finish completes the running agent and its task, after which /steer says it is not running", async () => {
    send({ id: "p2", type: "prompt", message: "tasks-finish" });
    await waitFor((event) => event.type === "agent_settled" && events.filter((item) => item.type === "agent_settled").length === 2);
    const list = await entries();
    const messages = entriesToMessages(list, list.at(-1).id);
    assert.equal(todoFromMessages(messages).find((task) => task.id === 1).status, "completed");
    const runs = collectSubagents(messages, new Map(), subagentRecords(list), Date.now());
    assert.equal(runs.find((run) => run.agentId === "ag-t1").phase, "done");
    send({ id: "s4", type: "prompt", message: "/steer ag-t1 ainda aí?" });
    await waitFor((event) => event.message === "O subagente ag-t1 não está em execução.");
  });
});
