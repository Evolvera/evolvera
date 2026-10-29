// Palco dos agentes: the pure model (agent-stage.js), the team-bus reader (lib-server/teams.mjs), the theme chosen
// before first paint (boot.js) and the visual contract the redesign keeps (VeroNati: no type under 12px, no loops,
// motion respects reduced motion, fonts served locally).
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { describe, test } from "node:test";
import { activityState, clock, formatCost, mainNode, memberNode, runNode, stageModel, tiers, toolState, verifiedByTests } from "../public/agent-stage.js";
import { createTeamReader, findTeam, summarizeLog } from "../lib-server/teams.mjs";

const call = (id, name, args) => ({ role: "assistant", content: [{ type: "toolCall", id, name, arguments: args }], usage: { cost: { total: 0.01 } } });
const result = (id, isError = false) => ({ role: "toolResult", toolCallId: id, content: [], isError });

describe("stage model", () => {
  test("each tool reads as a state and a step", () => {
    assert.deepEqual(toolState({ name: "edit", args: { path: "src/payments/pix.ts" } }), { state: "editing", step: "pix.ts" });
    assert.deepEqual(toolState({ name: "read", args: { path: "src/a.ts" } }), { state: "reading", step: "a.ts" });
    assert.equal(toolState({ name: "bash", args: { command: "npm test" } }).state, "testing");
    assert.equal(toolState({ name: "bash", args: { command: "git status" } }).state, "running");
    assert.deepEqual(activityState("└ edit src/telas/Qr.tsx"), { state: "editing", step: "Qr.tsx" });
    assert.deepEqual(activityState("└ pensando…"), { state: "thinking", step: "" });
  });

  test("a finished agent is 'pronto e verificado' only when tests passed after its last edit", () => {
    assert.equal(verifiedByTests([call("e", "edit", { path: "a" }), result("e"), call("t", "bash", { command: "npm test" }), result("t")]), true);
    assert.equal(verifiedByTests([call("t", "bash", { command: "npm test" }), result("t"), call("e", "edit", { path: "a" }), result("e")]), false);
    assert.equal(verifiedByTests([call("e", "edit", { path: "a" }), result("e"), call("t", "bash", { command: "npm test" }), result("t", true)]), false);
    const node = mainNode({ messages: [call("e", "edit", { path: "a" }), result("e"), call("t", "bash", { command: "npm test" }), result("t"), { role: "assistant", content: [{ type: "text", text: "Pronto." }] }] });
    assert.equal(node.state, "verified");
    assert.equal(mainNode({ messages: [{ role: "assistant", content: [{ type: "text", text: "Prefere 9h ou 18h?" }] }] }).state, "waiting");
    assert.equal(mainNode({ streaming: true, phase: "tool", runtime: new Map([["x", { name: "edit", args: { path: "b.ts" }, status: "running" }]]) }).step, "b.ts");
  });

  test("one agent is one calm node; subagents make a crew; a team-bus team makes a tree with its messages", () => {
    assert.equal(stageModel({ main: {} }).mode, "solo");
    const runs = [{ key: "sa:1", name: "", title: "builder", type: "builder", description: "Tela do QR", model: "Luna", stats: ["US$ 0.02"], phase: "running", tail: ["└ edit src/Qr.tsx"], elapsed: 64_000 }];
    const crew = stageModel({ main: { messages: [{ role: "assistant", content: [{ type: "text", text: "Agora peço ao builder." }] }] }, runs });
    assert.equal(crew.mode, "crew");
    assert.deepEqual(crew.nodes.map((node) => [node.id, node.state]), [["main", "coordinating"], ["run:sa:1", "editing"]]);
    assert.equal(crew.nodes[1].cost, 0.02);
    assert.deepEqual(crew.wires.map((wire) => [wire.from, wire.to, wire.tone]), [["main", "run:sa:1", "work"]]);
    const team = { team: "t", lead: "lead", members: [
      { name: "lead", role: "lead", parent: null, state: "working" },
      { name: "front", role: "member", parent: "lead", state: "working", running: { name: "edit", args: { path: "src/App.tsx" } }, startedAt: 1, cost: 0.03 },
      { name: "revisor", role: "member", parent: "lead", state: "idle", lastOutput: "Corrijo ou fica com você?" },
    ], messages: [{ at: 5, from: "lead", to: "front", text: "Monte a tela" }, { at: 9, from: "revisor", to: "lead", text: "Achei um erro" }] };
    const model = stageModel({ main: {}, team, now: 61_000 });
    assert.equal(model.mode, "team");
    assert.deepEqual(model.nodes.map((node) => [node.id, node.parent, node.state]), [["main", null, "coordinating"], ["member:front", "main", "editing"], ["member:revisor", "main", "waiting"]]);
    assert.deepEqual(model.messages.map((item) => [item.fromId, item.toId]), [["main", "member:front"], ["member:revisor", "main"]]);
    assert.equal(model.wires.find((wire) => wire.to === "member:revisor").flowDir, "up");
    assert.deepEqual([model.summary.working, model.summary.waiting], [2, 1]);
    assert.deepEqual(tiers(model.nodes).map((row) => row.length), [1, 2]);
    // A lead running outside the Studio (terminal or RPC) with idle members: its fresh heartbeat wins over the idle open conversation.
    const outside = stageModel({ main: {}, team: { ...team, members: [team.members[0], { name: "back", role: "member", parent: "lead", state: "idle" }], messages: [] } });
    assert.deepEqual([outside.nodes[0].state, outside.nodes[0].step], ["thinking", "trabalhando fora do Studio"]);
  });

  test("numbers read the Brazilian way and the stopwatch stays short", () => {
    assert.equal(formatCost(0.004), "");
    assert.equal(formatCost(1.5), "US$ 1,50");
    assert.equal(clock(65_000), "1:05");
    assert.equal(clock(3_900_000), "1h 05");
    assert.equal(runNode({ key: "k", title: "scout", type: "scout", stats: [], phase: "done", tail: [] }).kind, "subagente");
    assert.equal(memberNode({ name: "docs", role: "member", state: "idle", lastOutput: "Feito." }).state, "done");
  });
});

describe("team-bus reader", () => {
  test("summarizeLog keeps the running tool, model, effort, cost and the answers only", () => {
    const lines = [
      { type: "agent_start" },
      { type: "message_end", message: { role: "assistant", model: "gpt-6.1-sol", thinkingLevel: "high", timestamp: 10, usage: { cost: { total: 0.02 } }, content: [{ type: "thinking", thinking: "segredo" }, { type: "text", text: "Vou editar." }] } },
      { type: "tool_execution_start", toolCallId: "a", toolName: "edit", args: { path: "src/x.ts", content: "x".repeat(5000) } },
      "não é json",
    ].map((line) => (typeof line === "string" ? line : JSON.stringify(line)));
    const summary = summarizeLog(lines);
    assert.deepEqual([summary.model, summary.effort, summary.cost, summary.busy], ["gpt-6.1-sol", "high", 0.02, true]);
    assert.deepEqual(summary.running, { name: "edit", args: { path: "src/x.ts" } });
    assert.deepEqual(summary.outputs.map((item) => item.text), ["Vou editar."]);
  });

  test("the team of a folder is found by its lead, members and messages are read, names are checked", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "teams-"));
    try {
      const dir = path.join(root, "t1");
      await mkdir(path.join(dir, "members"), { recursive: true });
      await mkdir(path.join(dir, "logs"), { recursive: true });
      const now = Date.now();
      await writeFile(path.join(dir, "members", "lead.json"), JSON.stringify({ name: "lead", role: "lead", cwd: path.join(root, "proj"), pid: 1, updatedAt: now, state: "working" }));
      await writeFile(path.join(dir, "members", "front.json"), JSON.stringify({ name: "front", role: "member", cwd: path.join(root, "proj-front"), pid: 2, updatedAt: now, state: "working" }));
      await writeFile(path.join(dir, "members", "bad.json"), JSON.stringify({ name: "../x", role: "member", cwd: "/", updatedAt: now }));
      await writeFile(path.join(dir, "logs", "front.jsonl"), `${JSON.stringify({ type: "agent_start" })}\n${JSON.stringify({ type: "tool_execution_start", toolCallId: "1", toolName: "bash", args: { command: "npm test" } })}\n`);
      await writeFile(path.join(dir, "messages.jsonl"), `${JSON.stringify({ at: now, from: "lead", to: "front", preview: "Rode os testes" })}\n{quebrado\n`);
      assert.equal((await findTeam(root, path.join(root, "proj"))).name, "t1");
      assert.equal(await findTeam(root, path.join(root, "outro")), null);
      const reader = createTeamReader({ teamsRoot: root });
      const team = await reader.current(path.join(root, "proj"));
      assert.deepEqual(team.members.map((member) => member.name).sort(), ["front", "lead"]);
      assert.deepEqual(team.members.find((member) => member.name === "front").running, { name: "bash", args: { command: "npm test" } });
      assert.deepEqual(team.messages.map((item) => item.text), ["Rode os testes"]);
      assert.equal(await reader.member("t1", "../lead"), null);
      assert.equal((await reader.member("t1", "front")).messages.length, 1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("theme and visual contract", () => {
  test("boot.js applies a saved light or dark theme before first paint; anything else follows the system", async () => {
    const source = await readFile(new URL("../public/boot.js", import.meta.url), "utf8");
    const boot = (theme) => {
      const dataset = {};
      vm.runInNewContext(source, { localStorage: { getItem: (key) => (key === "pi-studio:theme" ? theme : null) }, document: { documentElement: { dataset } } });
      return dataset.theme;
    };
    assert.equal(boot("light"), "light");
    assert.equal(boot("dark"), "dark");
    assert.equal(boot("roxo"), undefined);
    assert.equal(boot(null), undefined);
  });

  test("the stage stylesheet: local fonts, a light theme, no type under 12px, no looping motion, reduced motion honoured", async () => {
    const css = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");
    const stage = css.slice(css.indexOf("palco dos agentes, workbench e temas"));
    assert.match(stage, /src: url\("\/fonts\/plus-jakarta-sans-latin\.woff2"\)/);
    assert.match(stage, /src: url\("\/fonts\/geist-mono\.woff2"\)/);
    assert.match(css, /:root\[data-theme="light"\]\s*\{[^}]*--bg: #f8f8f7/);
    assert.match(css, /@media \(prefers-color-scheme: light\)\s*\{\s*:root:not\(\[data-theme="dark"\]\)/);
    assert.doesNotMatch(stage, /infinite/);
    assert.match(stage, /prefers-reduced-motion: reduce/);
    for (const match of stage.matchAll(/font(?:-size)?:[^;]*?(\d+(?:\.\d+)?)px/g)) assert.ok(Number(match[1]) >= 12, match[0]);
    for (const file of ["plus-jakarta-sans-latin.woff2", "plus-jakarta-sans-latin-ext.woff2", "geist-mono.woff2", "LICENSES.txt"]) {
      assert.ok((await readFile(new URL(`../public/fonts/${file}`, import.meta.url))).length > 1000, file);
    }
  });
});
