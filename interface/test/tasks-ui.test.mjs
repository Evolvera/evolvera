// Pure helpers behind the Tarefas Inspector tab, the adaptive tab labels and the emoji-free subagent cards (public/lib.js).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import * as lib from "../public/lib.js";

const todoResult = (timestamp, tasks, over = {}) => ({ role: "toolResult", toolName: "todo", timestamp, isError: false, details: { action: "update", tasks, nextId: 9 }, ...over });

describe("task stamps", () => {
  test("todoSnapshot keeps owner/blockedBy/metadata/description only when asked (live snapshots feed the Tarefas tab)", () => {
    const task = { id: 1, subject: "a", status: "pending", owner: "scout", blockedBy: [2], description: "d", metadata: { agent: "x" } };
    const result = { toolName: "todo", details: { tasks: [task], nextId: 2 } };
    assert.deepEqual(lib.todoSnapshot(result), [{ id: 1, subject: "a", status: "pending", activeForm: "" }]);
    assert.deepEqual(lib.todoSnapshot(result, true), [{ ...task, activeForm: "" }]);
    assert.equal(lib.todoSnapshot({ toolName: "bash" }, true), null);
  });

  test("taskStampsFromMessages replays every todo snapshot with its message time, so a reload keeps real start/end times", () => {
    const messages = [
      todoResult(1000, [{ id: 1, subject: "a", status: "in_progress" }, { id: 2, subject: "b", status: "pending" }]),
      { role: "assistant", content: [] },
      todoResult(99_999, [{ id: 7, subject: "lixo", status: "completed" }], { isError: true }),
      todoResult(undefined, [{ id: 8, subject: "sem hora", status: "completed" }]),
      todoResult(61_000, [{ id: 1, subject: "a", status: "completed" }, { id: 2, subject: "b", status: "in_progress" }]),
    ];
    assert.deepEqual(lib.taskStampsFromMessages(messages), {
      1: { status: "completed", since: 61_000, startedAt: 1000, endedAt: 61_000 },
      2: { status: "in_progress", since: 61_000, startedAt: 61_000 },
    });
    // Saved stamps stand in for tasks the history no longer shows (e.g. after a compaction); replayed ones win.
    const saved = { 1: { status: "pending", since: 5 }, 3: { status: "pending", since: 5 } };
    assert.deepEqual(lib.taskStampsFromMessages(messages, saved)[3], { status: "pending", since: 5 });
    assert.equal(lib.taskStampsFromMessages(messages, saved)[1].status, "completed");
    assert.deepEqual(lib.taskStampsFromMessages(null, saved), saved);
    assert.deepEqual(lib.taskStampsFromMessages([], undefined), {});
  });

  test("task stamps persist per session path, bounded and tolerant of corrupt storage", () => {
    assert.deepEqual(lib.loadTaskStamps(null, "s1"), {});
    assert.deepEqual(lib.loadTaskStamps("{nao json", "s1"), {});
    assert.deepEqual(lib.loadTaskStamps("[1]", "s1"), {});
    assert.deepEqual(lib.loadTaskStamps(JSON.stringify({ s1: { at: 1, stamps: "x" } }), "s1"), {});
    assert.deepEqual(lib.loadTaskStamps(JSON.stringify({ s1: { at: 1, stamps: { 1: { status: "pending", since: 1 } } } }), "s1"), { 1: { status: "pending", since: 1 } });
    assert.deepEqual(lib.loadTaskStamps(JSON.stringify({ s1: { at: 1, stamps: {} } }), "other"), {});
    let raw = lib.saveTaskStamps(null, "a", { 1: { status: "pending", since: 1 } }, 100, 2);
    raw = lib.saveTaskStamps(raw, "b", { 1: { status: "pending", since: 2 } }, 200, 2);
    raw = lib.saveTaskStamps(raw, "c", { 1: { status: "pending", since: 3 } }, 300, 2);
    assert.deepEqual(Object.keys(JSON.parse(raw)).sort(), ["b", "c"], "the least recently updated session is dropped");
    assert.deepEqual(lib.loadTaskStamps(raw, "c"), { 1: { status: "pending", since: 3 } });
    // Corrupt storage and malformed entries start over instead of throwing.
    assert.deepEqual(Object.keys(JSON.parse(lib.saveTaskStamps("{x", "a", {}, 1))), ["a"]);
    assert.deepEqual(Object.keys(JSON.parse(lib.saveTaskStamps(JSON.stringify({ bad: 3, ok: { at: 1, stamps: {} } }), "a", {}, 2))).sort(), ["a", "ok"]);
    // Missing stamps / missing times still store (sorted last).
    assert.deepEqual(lib.loadTaskStamps(lib.saveTaskStamps(null, "n", null, 1), "n"), {});
    assert.deepEqual(Object.keys(lib.loadTaskStamps(lib.saveTaskStamps(null, "n", { 1: { status: "pending" }, 2: { status: "pending", since: 4 }, 3: { status: "pending" }, 4: { status: "pending", since: 2 } }, 1), "n")).sort(), ["1", "2", "3", "4"]);
    // One session never stores more than the newest 200 tasks.
    const many = Object.fromEntries(Array.from({ length: 250 }, (_, index) => [index + 1, { status: "pending", since: index }]));
    assert.equal(Object.keys(lib.loadTaskStamps(lib.saveTaskStamps(null, "big", many, 1), "big")).length, 200);
  });
});

describe("inspector tab labels", () => {
  test("tabFitMode: all labels, else only the selected label, else icons only (decided from measured widths)", () => {
    const withText = [60, 80, 70];
    const iconOnly = [30, 30, 30];
    assert.equal(lib.tabFitMode({ withText, iconOnly, available: 210, selected: 0 }), "full");
    assert.equal(lib.tabFitMode({ withText, iconOnly, available: 200, selected: 1 }), "selected", "90 - 30 + 80 = 140 fits");
    assert.equal(lib.tabFitMode({ withText, iconOnly, available: 140, selected: 1 }), "selected", "exactly fitting counts");
    assert.equal(lib.tabFitMode({ withText, iconOnly, available: 139, selected: 1 }), "icons");
    assert.equal(lib.tabFitMode({ withText, iconOnly, available: 60, selected: 1 }), "icons", "even icons overflow: icons anyway");
    assert.equal(lib.tabFitMode({ withText, iconOnly, available: 200, selected: -1 }), "icons", "no selected tab to keep");
    assert.equal(lib.tabFitMode({ withText, iconOnly, available: 200, selected: 9 }), "icons");
    assert.equal(lib.tabFitMode({ withText: [60, 80], iconOnly: [30], available: 110, selected: 1 }), "selected", "a missing icon width counts as 0");
    assert.equal(lib.tabFitMode({ withText: [], iconOnly: [], available: 0, selected: 0 }), "full");
    assert.equal(lib.tabFitMode(), "full");
  });
});

describe("subagent cards without emoji", () => {
  test("stripEmoji removes pictographs, variation selectors, joiners, flags and skin tones from display names", () => {
    assert.equal(lib.stripEmoji("🧪 QA"), "QA");
    assert.equal(lib.stripEmoji("🛡️ Validator"), "Validator");
    assert.equal(lib.stripEmoji("🎨 Builder"), "Builder");
    assert.equal(lib.stripEmoji("👨‍💻 Dev 👍🏽 🇧🇷"), "Dev");
    assert.equal(lib.stripEmoji("  Plain   name "), "Plain name");
    assert.equal(lib.stripEmoji("🧪"), "");
    assert.equal(lib.stripEmoji(null), "");
    assert.equal(lib.stripEmoji(42), "42");
  });

  test("collectSubagents shows names without emoji and falls back to the next candidate", () => {
    const call = (id, args) => ({ role: "assistant", timestamp: 1, content: [{ type: "toolCall", id, name: "Agent", arguments: args }] });
    const result = (id, displayName) => ({ role: "toolResult", toolCallId: id, content: [{ type: "text", text: "ok" }], details: { displayName, status: "completed", agentId: id } });
    const named = lib.collectSubagents([call("a", { name: "🧪 QA", prompt: "p" }), result("a", "x")], new Map(), new Map(), 10);
    assert.equal(named[0].title, "QA");
    const display = lib.collectSubagents([call("b", { prompt: "p" }), result("b", "🛡️ Validator")], new Map(), new Map(), 10);
    assert.equal(display[0].title, "Validator");
    const onlyEmoji = lib.collectSubagents([call("c", { name: "🎨", subagent_type: "builder", prompt: "p" }), result("c", "")], new Map(), new Map(), 10);
    assert.equal(onlyEmoji[0].title, "builder");
    const nothing = lib.collectSubagents([call("d", { name: "🎨" }), result("d", "🎨")], new Map(), new Map(), 10);
    assert.equal(nothing[0].title, "Agente");
  });

  test("the Fast chip is plain text (no emoji)", () => {
    const astra = { provider: "openai-codex", id: "gpt-6-astra" };
    for (const [status, label] of [["⚡🟢", "Fast"], ["⚡ECO", "Eco"], ["🚀🟢", "Ultra"], ["🚀ECO", "Ultra-eco"]]) assert.equal(lib.fastPanel({ statusText: status, model: astra }).chip.label, label);
  });

  test("subagentFamily picks one line icon per agent family from type, name or title", () => {
    const family = (value) => lib.subagentFamily(value);
    assert.equal(family({ title: "🧪 QA" }), "qa");
    assert.equal(family({ type: "Explore" }), "scout");
    assert.equal(family({ name: "scout" }), "scout");
    assert.equal(family({ name: "app-validator" }), "validator");
    assert.equal(family({ title: "🛡️ Validator", type: "general-purpose" }), "validator");
    assert.equal(family({ type: "builder-heavy-design" }), "builder");
    assert.equal(family({ title: "Builder" }), "builder");
    assert.equal(family({ type: "Plan" }), "planner");
    assert.equal(family({ type: "plan-heavy" }), "planner");
    assert.equal(family({ type: "bug-hunt" }), "bug-hunt");
    assert.equal(family({ type: "deep-research" }), "research");
    assert.equal(family({ title: "Researcher" }), "research");
    assert.equal(family({ type: "general-purpose" }), "general");
    assert.equal(family({ title: "Aqaria" }), "general", "qa must be a whole word");
    assert.equal(family({}), "general");
    assert.equal(family(), "general");
  });

  test("data-state for subagent cards and task rows (working, done, attention, urgent, idle)", () => {
    assert.equal(lib.subagentDotState({ phase: "running" }), "working");
    assert.equal(lib.subagentDotState({ phase: "running" }, true), "attention", "stalled run");
    assert.equal(lib.subagentDotState({ phase: "done" }), "done");
    assert.equal(lib.subagentDotState({ phase: "done" }, true), "done");
    assert.equal(lib.subagentDotState({ phase: "error" }), "urgent");
    assert.equal(lib.subagentDotState({ phase: "?" }), "idle");
    assert.equal(lib.subagentDotState(null), "idle");
    assert.equal(lib.taskDotState({ running: true, status: "in_progress" }), "working");
    assert.equal(lib.taskDotState({ running: false, status: "completed" }), "done");
    assert.equal(lib.taskDotState({ running: false, status: "pending", blocked: true }), "idle");
    assert.equal(lib.taskDotState({ running: false, status: "pending" }), "idle");
    assert.equal(lib.taskDotState(null), "idle");
  });
});

describe("opening a subagent and acting on a task", () => {
  test("subagentSession finds the sub-PI conversation of a run: this parent, matching task text, newest first", () => {
    const run = { agentId: "ab12", description: "Rodar benchmark", sections: [{ label: "Tarefa", text: "Execute o benchmark completo e reporte tempos" }] };
    const item = (over) => ({ path: "/s/x.jsonl", title: "Execute o benchmark completo e reporte tempos", isSubagent: true, parentSession: "C:\\p\\Parent.jsonl", timestamp: "2026-01-01T00:00:01Z", ...over });
    const old = item({ path: "/s/old.jsonl" });
    const fresh = item({ path: "/s/new.jsonl", timestamp: "2026-01-01T00:00:09Z" });
    const history = [old, fresh, item({ path: "/s/other-parent.jsonl", parentSession: "/other.jsonl", timestamp: "2026-01-01T00:00:20Z" }), item({ path: "/s/main.jsonl", isSubagent: false }), item({ path: "/s/unrelated.jsonl", title: "Algo totalmente diferente" })];
    assert.equal(lib.subagentSession({ run, history, parentFile: "c:/p/parent.jsonl" }).path, "/s/new.jsonl");
    assert.equal(lib.subagentSession({ run, history, parentFile: null }).path, "/s/other-parent.jsonl", "unknown parent: any sub-PI");
    // Matches the description when the prompt is not there.
    assert.equal(lib.subagentSession({ run: { description: "Rodar benchmark" }, history: [item({ title: "Rodar benchmark" })], parentFile: "c:/p/parent.jsonl" }).path, "/s/x.jsonl");
    // History items without a timestamp fall back to lastActivity, then to nothing.
    const stamped = [item({ path: "/s/a.jsonl", timestamp: undefined, lastActivity: "2026-02-01T00:00:00Z" }), item({ path: "/s/b.jsonl", timestamp: undefined, lastActivity: undefined }), item({ path: "/s/c.jsonl", timestamp: undefined, lastActivity: "2026-01-01T00:00:00Z" })];
    assert.equal(lib.subagentSession({ run, history: stamped, parentFile: null }).path, "/s/a.jsonl");
    // The session name "<agent>#<id8>" wins over any title match, whichever parent the history says.
    const named = [item({ path: "/s/untitled.jsonl", title: undefined }), item({ path: "/s/titled.jsonl" }), item({ path: "/s/named.jsonl", title: "Explore#AB12CD34", parentSession: "/x.jsonl", timestamp: "2020-01-01T00:00:00Z" }), item({ path: "/s/main-named.jsonl", title: "Explore#ab12cd34", isSubagent: false })];
    assert.equal(lib.subagentSession({ run: { ...run, agentId: "ab12cd34-9999" }, history: named, parentFile: "c:/p/parent.jsonl" }).path, "/s/named.jsonl");
    assert.equal(lib.subagentSession({ run: { ...run, agentId: "zzzzzzzz" }, history: named, parentFile: "c:/p/parent.jsonl" }).path, "/s/titled.jsonl", "no session carries that id: fall back to the text");
    assert.equal(lib.subagentSession({ run, history: [], parentFile: "/p/parent.jsonl" }), null);
    assert.equal(lib.subagentSession({ run, history: [old], parentFile: "/nope.jsonl" }), null);
    assert.equal(lib.subagentSession({ run: {}, history, parentFile: null }), null);
    assert.equal(lib.subagentSession({ run: null, history: null }), null);
    assert.equal(lib.subagentSession({ run: { agentId: "abcd1234" }, history: null }), null);
    assert.equal(lib.subagentSession(), null);
  });

  test("taskWorktreeName makes a valid Orca name (slug, max 60) and taskWorktreePrompt carries subject, description and context", () => {
    assert.equal(lib.taskWorktreeName("Rodar o benchmark — API v2!", 3), "rodar-o-benchmark-api-v2");
    assert.equal(lib.taskWorktreeName("Ação rápida", 1), "acao-rapida");
    assert.equal(lib.taskWorktreeName("!!!", 3), "tarefa-3");
    assert.equal(lib.taskWorktreeName(null, 4), "tarefa-4");
    const long = lib.taskWorktreeName(`${"palavra ".repeat(20)}fim`, 1);
    assert.ok(long.length <= 60 && !long.endsWith("-") && long.startsWith("palavra-palavra"));
    assert.match(lib.taskWorktreeName("x".repeat(100), 1), /^x{60}$/);
    assert.equal(lib.taskWorktreePrompt({ subject: "Medir", description: "com 3 execuções" }, "Benchmark"), "Medir\n\ncom 3 execuções\n\nContexto: conversa Benchmark");
    assert.equal(lib.taskWorktreePrompt({}, "T"), "Contexto: conversa T");
    assert.equal(lib.taskWorktreePrompt({ subject: "Medir" }, ""), "Medir\n\nContexto: conversa (sem título)");
    const huge = lib.taskWorktreePrompt({ subject: "Medir", description: "d".repeat(9000) }, "T");
    assert.ok(huge.length <= 8000 && huge.endsWith("Contexto: conversa T") && huge.includes("…"));
  });

  test("worktreeCreateFeedback turns every server answer into one pt-BR message", () => {
    assert.deepEqual(lib.worktreeCreateFeedback({ data: { ok: true, link: { worktreeName: "bench" } } }), { kind: "created", level: "info", text: "Worktree “bench” criada no Orca." });
    assert.deepEqual(lib.worktreeCreateFeedback({ data: { ok: true, link: {} } }), { kind: "created", level: "info", text: "Worktree criada no Orca." });
    assert.deepEqual(lib.worktreeCreateFeedback({ data: { ok: false, unknown: true } }), { kind: "unknown", level: "warning", text: "Não deu para confirmar — confira no Orca." });
    assert.equal(lib.worktreeCreateFeedback({ error: new Error("project-not-in-orca") }).text, "Esta pasta não está no Orca.");
    assert.equal(lib.worktreeCreateFeedback({ error: new Error("project-not-in-orca") }).kind, "not-in-orca");
    assert.equal(lib.worktreeCreateFeedback({ error: new Error("orca-unavailable") }).kind, "unavailable");
    assert.match(lib.worktreeCreateFeedback({ error: new Error("orca-timeout") }).text, /demorou/);
    assert.match(lib.worktreeCreateFeedback({ error: new Error("orca-failed") }).text, /falhou/);
    assert.match(lib.worktreeCreateFeedback({ error: new Error("orca-invalid-response") }).text, /falhou/);
    assert.match(lib.worktreeCreateFeedback({ error: new Error("invalid-request") }).text, /inválid/);
    assert.match(lib.worktreeCreateFeedback({ error: new Error("invalid-project") }).text, /inválid/);
    assert.equal(lib.worktreeCreateFeedback({ error: new Error("HTTP 500") }).text, "Não foi possível criar a worktree: HTTP 500.");
    assert.equal(lib.worktreeCreateFeedback({ error: "texto" }).text, "Não foi possível criar a worktree: texto.");
    assert.equal(lib.worktreeCreateFeedback({ data: {} }).level, "error");
    assert.equal(lib.worktreeCreateFeedback().level, "error");
  });

  test("taskActionStates: each button's availability, tooltip reason and target", () => {
    const row = (over) => ({ id: 1, status: "pending", blocked: false, running: false, owner: { kind: "none" }, actions: { parallel: true, worktree: true, open: false, message: false }, ...over });
    const free = lib.taskActionStates(row(), { orcaAvailable: true, projectInOrca: true, piBlocked: "", link: null });
    assert.deepEqual(free.parallel, { enabled: true, reason: "" });
    assert.deepEqual(free.worktree, { visible: true, enabled: true, reason: "" });
    assert.deepEqual(free.message, { enabled: false, reason: "Sem responsável em execução", target: null });
    // No Orca: the worktree button disappears. Folder outside Orca: disabled with the reason.
    assert.equal(lib.taskActionStates(row(), { orcaAvailable: false }).worktree.visible, false);
    assert.deepEqual(lib.taskActionStates(row(), { orcaAvailable: true, projectInOrca: false }).worktree, { visible: true, enabled: false, reason: "Esta pasta não está no Orca" });
    // The PI cannot take a message (exited / read-only follow): parallel is off, worktree creation is not.
    const locked = lib.taskActionStates(row(), { orcaAvailable: true, projectInOrca: true, piBlocked: "PI encerrado" });
    assert.deepEqual([locked.parallel.enabled, locked.parallel.reason, locked.worktree.enabled], [false, "PI encerrado", true]);
    // Reasons by task state.
    const reason = (over, key = "parallel") => lib.taskActionStates(row({ actions: { parallel: false, worktree: false, open: false, message: false }, ...over }), { orcaAvailable: true, projectInOrca: true })[key].reason;
    assert.equal(reason({ status: "completed" }), "Tarefa concluída");
    assert.equal(reason({ blocked: true }), "Tarefa bloqueada");
    assert.equal(reason({ status: "in_progress" }), "Já está em andamento");
    assert.equal(reason({ owner: { kind: "subagent" } }), "Já tem responsável");
    assert.equal(reason({ status: "completed" }, "worktree"), "Tarefa concluída");
    // Message to a running subagent: steer target; blocked when the PI cannot take it.
    const sub = row({ status: "in_progress", running: true, owner: { kind: "subagent", runId: "ab12" }, actions: { parallel: false, worktree: false, open: true, message: true } });
    assert.deepEqual(lib.taskActionStates(sub, { piBlocked: "" }).message, { enabled: true, reason: "", target: { kind: "steer", agentId: "ab12" } });
    assert.deepEqual(lib.taskActionStates(sub, { piBlocked: "Somente leitura" }).message, { enabled: false, reason: "Somente leitura", target: null });
    const subNoId = row({ owner: { kind: "subagent" }, actions: { parallel: false, worktree: false, open: true, message: true } });
    assert.equal(lib.taskActionStates(subNoId, {}).message.reason, "Subagente sem identificador");
    // Message to a worktree: terminal handle from the link; a recovered link has none.
    const wt = row({ running: true, owner: { kind: "worktree" }, actions: { parallel: false, worktree: false, open: true, message: true } });
    assert.deepEqual(lib.taskActionStates(wt, { link: { terminalHandle: "term-1" }, piBlocked: "PI encerrado" }).message, { enabled: true, reason: "", target: { kind: "worktree", handle: "term-1" } });
    assert.deepEqual(lib.taskActionStates(wt, { link: { terminalHandle: null } }).message, { enabled: false, reason: "Terminal não identificado", target: null });
    assert.equal(lib.taskActionStates(wt, {}).message.reason, "Terminal não identificado");
    assert.equal(lib.taskActionStates(row(), undefined).worktree.visible, false);
  });
});

describe("messages to a task's worktree", () => {
  test("terminalSendFeedback explains each failure of POST /api/orca/terminal-send in pt-BR", () => {
    assert.match(lib.terminalSendFeedback(new Error("terminal-not-linked")), /não pertence/);
    assert.match(lib.terminalSendFeedback(new Error("orca-unavailable")), /Orca indisponível/);
    assert.match(lib.terminalSendFeedback(new Error("orca-timeout")), /demorou/);
    assert.match(lib.terminalSendFeedback(new Error("orca-failed")), /falhou ao enviar/);
    assert.match(lib.terminalSendFeedback(new Error("invalid-request")), /inválida/);
    assert.equal(lib.terminalSendFeedback(new Error("HTTP 500")), "Não foi possível enviar a mensagem: HTTP 500.");
    assert.equal(lib.terminalSendFeedback("texto"), "Não foi possível enviar a mensagem: texto.");
    assert.equal(lib.terminalSendFeedback(), "Não foi possível enviar a mensagem: erro desconhecido.");
  });
});
