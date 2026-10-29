// Sidebar tree (Orca style): pure model in lib.js. Each test says what, expected, why (one comment line).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import * as lib from "../public/lib.js";

const NOW = 1_800_000_000_000;
const raw = (patch = {}) => ({ busy: false, streaming: false, waitingUi: false, error: false, stalledMs: null, orcaState: null, ...patch });
const pi = (patch = {}) => ({
  sessionPath: "/s/a.jsonl", sessionId: "a", title: "Conversa", agentType: null, isSubagent: false,
  live: null, raw: raw(), pendingQuestions: { total: 0, blocking: 0 },
  lastAssistantAt: null, updatedAt: NOW - 5000, startedAt: NOW - 60000, children: [], ...patch,
});
const live = (owner = "orca") => ({ pid: 10, owner, startedAt: NOW - 1000 });

describe("stripPictographs", () => {
  // Emoji in front of a title are removed and the rest is kept, because the UI must show no emoji.
  test("removes emoji, joiners, flags, keycaps and skin tones", () => {
    assert.equal(lib.stripPictographs("🚀 Deploy"), "Deploy");
    assert.equal(lib.stripPictographs("👨‍👩‍👧 família"), "família");
    assert.equal(lib.stripPictographs("🇧🇷 Brasil"), "Brasil");
    assert.equal(lib.stripPictographs("1️⃣ passo"), "1 passo");
    assert.equal(lib.stripPictographs("oi 👍🏽 tchau"), "oi tchau");
  });
  // Trademark/copyright signs and accents are text, not pictures: they must survive.
  test("keeps (c) (R) TM, accents, braille and CJK", () => {
    assert.equal(lib.stripPictographs("Café© ®x ™"), "Café© ®x ™");
    assert.equal(lib.stripPictographs("⠋ 日本語"), "⠋ 日本語");
  });
  // Null, numbers and emoji-only text must not throw or leave stray spaces.
  test("handles empty and non-string input", () => {
    assert.equal(lib.stripPictographs(null), "");
    assert.equal(lib.stripPictographs(undefined), "");
    assert.equal(lib.stripPictographs(42), "42");
    assert.equal(lib.stripPictographs("🔥🔥"), "");
    assert.equal(lib.stripPictographs("  a \n\t b  "), "a b");
  });
});

describe("conversationState precedence (urgent > attention > working > done > idle)", () => {
  const state = (patch, seen = NOW, now = NOW) => lib.conversationState(pi(patch), seen, now);
  // A PI with nothing going on is idle, the default.
  test("idle by default and for missing fields", () => {
    assert.equal(state({}), "idle");
    assert.equal(lib.conversationState({}, 0, NOW), "idle");
    assert.equal(lib.conversationState(null, 0, NOW), "idle");
  });
  // Streaming/busy or an Orca "working" agent means the PI is producing.
  test("working from streaming, busy or orca working", () => {
    assert.equal(state({ live: live(), raw: raw({ streaming: true }) }), "working");
    assert.equal(state({ live: live(), raw: raw({ busy: true }) }), "working");
    assert.equal(state({ live: live(), raw: raw({ orcaState: "working" }) }), "working");
  });
  // A pending extension dialog blocks on the user, whatever else is going on.
  test("urgent from waitingUi even while streaming", () => {
    assert.equal(state({ live: live(), raw: raw({ waitingUi: true, streaming: true }) }), "urgent");
  });
  // Orca blocked/waiting/error mean the agent needs the user.
  test("urgent from orca blocked, waiting, error", () => {
    for (const orcaState of ["blocked", "waiting", "error"]) assert.equal(state({ live: live(), raw: raw({ orcaState }) }), "urgent", orcaState);
    assert.equal(state({ live: live(), raw: raw({ orcaState: "done" }) }), "idle");
  });
  // An error stopped the run only when nothing is streaming any more; a retrying PI keeps working.
  test("urgent from error only when it stopped", () => {
    assert.equal(state({ raw: raw({ error: true }) }), "urgent");
    assert.equal(state({ live: live(), raw: raw({ error: true, streaming: true }) }), "working");
  });
  // Stalled more than 10 minutes while live needs a look; exactly 10 minutes or not live does not.
  test("urgent when stalled over 10 minutes and live", () => {
    assert.equal(state({ live: live(), raw: raw({ busy: true, stalledMs: 10 * 60_000 + 1 }) }), "urgent");
    assert.equal(state({ live: live(), raw: raw({ busy: true, stalledMs: 10 * 60_000 }) }), "working");
    assert.equal(state({ live: null, raw: raw({ stalledMs: 99 * 60_000 }) }), "idle");
  });
  // Blocking questions are urgent, non-blocking ones keep working but ask for attention.
  test("pendingQuestions: blocking is urgent, non-blocking is attention; booleans accepted", () => {
    assert.equal(state({ pendingQuestions: { total: 2, blocking: 1 } }), "urgent");
    assert.equal(state({ pendingQuestions: { total: 2, blocking: true } }), "urgent");
    assert.equal(state({ pendingQuestions: { total: 2, blocking: 0 } }), "attention");
    assert.equal(state({ pendingQuestions: { total: 2, blocking: false } }), "attention");
    assert.equal(state({ live: live(), raw: raw({ streaming: true }), pendingQuestions: { total: 1, blocking: 0 } }), "attention");
    assert.equal(state({ pendingQuestions: { total: 0, blocking: 0 } }), "idle");
    assert.equal(state({ pendingQuestions: undefined }), "idle");
  });
  // A finished turn the user has not seen is "done" until lastSeenAt reaches it.
  test("done when lastAssistantAt is newer than lastSeenAt and not working", () => {
    assert.equal(state({ lastAssistantAt: NOW - 10 }, NOW - 20), "done");
    assert.equal(state({ lastAssistantAt: NOW - 10 }, NOW - 10), "idle");
    assert.equal(state({ lastAssistantAt: NOW - 10 }, NOW), "idle");
    assert.equal(state({ lastAssistantAt: NOW - 10, live: live(), raw: raw({ streaming: true }) }, NOW - 20), "working");
    assert.equal(state({ lastAssistantAt: null }, 0), "idle");
  });
  // Bad lastSeenAt (undefined) counts as never seen.
  test("undefined lastSeenAt means never seen", () => {
    assert.equal(lib.conversationState(pi({ lastAssistantAt: 5 }), undefined, NOW), "done");
  });
});

describe("worstState / stateLabel / legacyState", () => {
  // The aggregate shown on collapsed rows is the highest precedence among the children.
  test("worstState picks by precedence and tolerates empties and unknowns", () => {
    assert.equal(lib.worstState(["idle", "done", "working"]), "working");
    assert.equal(lib.worstState(["working", "attention", "done"]), "attention");
    assert.equal(lib.worstState(["done", "urgent", "working"]), "urgent");
    assert.equal(lib.worstState([]), "idle");
    assert.equal(lib.worstState(["bogus", "done"]), "done");
  });
  // Accessible labels are fixed pt-BR strings; unknown states read as idle.
  test("stateLabel is pt-BR", () => {
    assert.deepEqual(["working", "done", "attention", "urgent", "idle", "x"].map(lib.stateLabel),
      ["trabalhando", "terminou", "precisa de resposta (continua trabalhando)", "precisa de você", "parado", "parado"]);
  });
  // Older vocabulary (fazendo/pronto/...) maps onto the new states so every dot shares one component.
  test("legacyState maps the Portuguese keys", () => {
    assert.deepEqual(["fazendo", "aguardando", "erro", "pronto", "parado", "nova", undefined].map(lib.legacyState),
      ["working", "urgent", "urgent", "idle", "idle", "idle", "idle"]);
  });
  // Orca worktree status: working spins, blocked/waiting/error are urgent, "done" is blue only while unread.
  test("worktreeIndicator maps Orca status and unread", () => {
    assert.equal(lib.worktreeIndicator({ status: "working" }), "working");
    assert.equal(lib.worktreeIndicator({ status: "blocked" }), "urgent");
    assert.equal(lib.worktreeIndicator({ status: "waiting" }), "urgent");
    assert.equal(lib.worktreeIndicator({ status: "error" }), "urgent");
    assert.equal(lib.worktreeIndicator({ status: "done", unread: true }), "done");
    assert.equal(lib.worktreeIndicator({ status: "done", unread: false }), "idle");
    assert.equal(lib.worktreeIndicator({ status: "inactive" }), "idle");
    assert.equal(lib.worktreeIndicator(null), "idle");
  });
  // Sub-agent run phases map to the same set; a finished run is not an unseen turn.
  test("subagentIndicator maps run phases", () => {
    assert.deepEqual(["running", "done", "error", "other"].map(lib.subagentIndicator), ["working", "idle", "urgent", "idle"]);
  });
});

describe("seen store", () => {
  // First ever load sets a baseline at "now" so old conversations do not all light up blue.
  test("seenLoad starts with baseline now on empty, corrupt or wrong-shaped input", () => {
    for (const input of [null, "", "{bad", "[]", "42", '{"seen":5}']) assert.deepEqual(lib.seenLoad(input, 77), { baseline: 77, seen: {} }, String(input));
  });
  // A saved store round-trips; invalid entries are dropped on load.
  test("seenLoad/seenSerialize round trip and sanitize", () => {
    const store = lib.seenMark(lib.seenLoad(null, 100), "/a", 500);
    const loaded = lib.seenLoad(lib.seenSerialize(store), 999);
    assert.deepEqual(loaded, { baseline: 100, seen: { "/a": 500 } });
    assert.deepEqual(lib.seenLoad('{"baseline":"x","seen":{"/a":"y","/b":3}}', 9), { baseline: 9, seen: { "/b": 3 } });
  });
  // Unknown paths fall back to the baseline; known ones return their time.
  test("seenAt", () => {
    const store = { baseline: 50, seen: { "/a": 80 } };
    assert.equal(lib.seenAt(store, "/a"), 80);
    assert.equal(lib.seenAt(store, "/zzz"), 50);
  });
  // Marking is monotonic (an older time never moves it back) and does not mutate the input.
  test("seenMark is monotonic and immutable", () => {
    const store = { baseline: 1, seen: { "/a": 100 } };
    assert.equal(lib.seenMark(store, "/a", 50), store);
    const next = lib.seenMark(store, "/a", 150);
    assert.equal(next.seen["/a"], 150);
    assert.equal(store.seen["/a"], 100);
  });
  // Bounded: with more than the max, the oldest times go first (LRU by time).
  test("seenMark evicts the oldest beyond the bound", () => {
    let store = { baseline: 0, seen: {} };
    for (let i = 1; i <= 7; i++) store = lib.seenMark(store, `/p${i}`, i * 10, 5);
    assert.deepEqual(Object.keys(store.seen).sort(), ["/p3", "/p4", "/p5", "/p6", "/p7"]);
    assert.equal(lib.SEEN_MAX, 2000);
    let big = { baseline: 0, seen: {} };
    for (let i = 0; i < 2100; i++) big = lib.seenMark(big, `/q${i}`, i + 1);
    assert.equal(Object.keys(big.seen).length, 2000);
    assert.ok(!("/q0" in big.seen) && "/q2099" in big.seen);
  });
  // Seen is recorded only for the open conversation, in a visible page, scrolled to the bottom.
  test("shouldMarkSeen needs open + visible + at bottom", () => {
    assert.equal(lib.shouldMarkSeen({ open: true, visible: true, atBottom: true }), true);
    for (const patch of [{ open: false }, { visible: false }, { atBottom: false }]) assert.equal(lib.shouldMarkSeen({ open: true, visible: true, atBottom: true, ...patch }), false);
  });
});

describe("expanded state", () => {
  // Nothing saved means the node's default; stored overrides win.
  test("expandedLoad/isExpanded with defaults", () => {
    assert.equal(lib.isExpanded(lib.expandedLoad(null), "k", true), true);
    assert.equal(lib.isExpanded(lib.expandedLoad("{bad"), "k", false), false);
    assert.equal(lib.isExpanded(lib.expandedLoad('{"k":false,"j":true,"z":1}'), "k", true), false);
    assert.equal(lib.isExpanded(lib.expandedLoad('{"j":true}'), "j", false), true);
    assert.equal(lib.isExpanded(lib.expandedLoad("[1]"), "j", false), false);
  });
  // Toggling flips relative to the effective value and is immutable; serialization round-trips.
  test("toggleExpanded flips and round trips", () => {
    const empty = lib.expandedLoad(null);
    const closed = lib.toggleExpanded(empty, "k", true);
    assert.equal(lib.isExpanded(closed, "k", true), false);
    assert.equal(lib.isExpanded(empty, "k", true), true);
    const open = lib.toggleExpanded(closed, "k", true);
    assert.equal(lib.isExpanded(open, "k", true), true);
    assert.equal(lib.isExpanded(lib.expandedLoad(lib.expandedSerialize(closed)), "k", true), false);
  });
  // Bounded so a long-lived browser does not grow the saved map forever; the newest overrides survive.
  test("toggleExpanded keeps at most EXPANDED_MAX overrides", () => {
    let map = lib.expandedLoad(null);
    for (let i = 0; i < lib.EXPANDED_MAX + 10; i++) map = lib.toggleExpanded(map, `k${i}`, true);
    assert.equal(map.size, lib.EXPANDED_MAX);
    assert.equal(map.has("k0"), false);
    assert.equal(map.has(`k${lib.EXPANDED_MAX + 9}`), true);
  });
});

describe("normalizeTree", () => {
  const env = (patch = {}) => ({ key: "e", name: "Env", branch: "main", primary: true, path: "/p", orca: true, orcaStatus: null, issue: null, pis: [], ...patch });
  const proj = (patch = {}) => ({ id: "p1", name: "Proj", cwd: "/p", envs: [env()], ...patch });
  // A good payload keeps version and shapes; unknown fields are dropped, missing arrays default to [].
  test("keeps a valid tree", () => {
    const tree = lib.normalizeTree({ version: "v1", generatedAt: 5, projects: [proj({ envs: [env({ pis: [pi({ children: [pi({ sessionPath: "/s/b.jsonl", isSubagent: true, agentType: "scout" })] })], morePis: 3 })] })] });
    assert.equal(tree.version, "v1");
    assert.equal(tree.projects[0].envs[0].morePis, 3);
    assert.equal(tree.projects[0].envs[0].pis[0].children[0].agentType, "scout");
  });
  // API errors, empty bodies and garbage mean "no tree": the sidebar falls back to the project list.
  test("returns null for non-trees and an empty list for an empty tree", () => {
    for (const bad of [null, undefined, 3, "x", [], {}, { projects: "no" }]) assert.equal(lib.normalizeTree(bad), null, String(bad));
    assert.deepEqual(lib.normalizeTree({ version: "e", projects: [] }), { version: "e", projects: [] });
  });
  // Broken items are skipped instead of crashing the render.
  test("skips malformed projects, envs and PIs", () => {
    const tree = lib.normalizeTree({ version: "v", projects: [null, 4, proj({ envs: [null, env({ pis: [null, pi(), { title: "no path" }] })] })] });
    assert.equal(tree.projects.length, 1);
    assert.equal(tree.projects[0].envs.length, 1);
    assert.equal(tree.projects[0].envs[0].pis.length, 1);
  });
  // Deep nesting is clamped and the total node count capped, so a hostile or buggy payload cannot freeze the page.
  test("clamps depth and total nodes", () => {
    let nested = pi({ sessionPath: "/deep/0" });
    for (let i = 1; i < 50; i++) nested = pi({ sessionPath: `/deep/${i}`, children: [nested] });
    const tree = lib.normalizeTree({ version: "v", projects: [proj({ envs: [env({ pis: [nested] })] })] }, { maxDepth: 4 });
    let depth = 0;
    for (let node = tree.projects[0].envs[0].pis[0]; node; node = node.children[0]) depth++;
    assert.equal(depth, 4);
    const many = Array.from({ length: 50 }, (_, i) => pi({ sessionPath: `/m/${i}` }));
    const capped = lib.normalizeTree({ version: "v", projects: [proj({ envs: [env({ pis: many })] })] }, { maxNodes: 10 });
    assert.equal(capped.projects[0].envs[0].pis.length, 10);
  });
  // Titles are stripped of emoji, collapsed, bounded and never `type#hash`-less empty.
  test("titles: emoji removed, long ones cut, empty falls back", () => {
    const rows = lib.normalizeTree({ version: "v", projects: [proj({ envs: [env({ pis: [
      pi({ sessionPath: "/1", title: "🚀 Titulo" }),
      pi({ sessionPath: "/2", title: "x".repeat(500) }),
      pi({ sessionPath: "/3", title: "", agentType: "scout" }),
      pi({ sessionPath: "/4", title: "🔥", agentType: null }),
      pi({ sessionPath: "/5", title: "日本語のとても長いタイトル".repeat(30) }),
    ] })] })] }).projects[0].envs[0].pis.map((item) => item.title);
    assert.equal(rows[0], "Titulo");
    assert.equal(rows[1].length, lib.TREE_TITLE_MAX);
    assert.ok(rows[1].endsWith("…"));
    assert.equal(rows[2], "scout");
    assert.equal(rows[3], "Nova conversa");
    assert.equal([...rows[4]].length, lib.TREE_TITLE_MAX);
  });
  // Numbers are coerced to safe values: a missing/NaN time becomes null, children missing become [].
  test("coerces times and counts", () => {
    const tree = lib.normalizeTree({ version: "v", projects: [proj({ envs: [env({ pis: [pi({ lastAssistantAt: "x", updatedAt: undefined, children: undefined, pendingQuestions: null, raw: null, live: "nope" })], morePis: -4 })] })] });
    const item = tree.projects[0].envs[0].pis[0];
    assert.equal(item.lastAssistantAt, null);
    assert.equal(item.updatedAt, 0);
    assert.deepEqual(item.children, []);
    assert.deepEqual(item.pendingQuestions, { total: 0, blocking: 0 });
    assert.equal(item.raw.busy, false);
    assert.equal(item.live, null);
    assert.equal(tree.projects[0].envs[0].morePis, 0);
  });
});

describe("tree view model", () => {
  const store = (seen = NOW) => ({ baseline: seen, seen: {} });
  const envOf = (pis, patch = {}) => ({ key: "e", name: "Env", branch: "main", primary: true, path: "/p", orca: true, orcaStatus: null, issue: null, pis, morePis: 0, ...patch });
  // A PI row shows the cleaned title, the state, the relative time and the sub-PI type chip only for sub-PIs.
  test("treePiRow", () => {
    const row = lib.treePiRow(pi({ title: "Olá", updatedAt: NOW - 2 * 60_000, lastAssistantAt: NOW - 1000 }), { baseline: 0, seen: {} }, NOW);
    assert.deepEqual({ key: row.key, title: row.title, state: row.state, label: row.label, time: row.time, chip: row.chip, childCount: row.childCount },
      { key: "/s/a.jsonl", title: "Olá", state: "done", label: "terminou", time: "2 min", chip: "", childCount: 0 });
    const sub = lib.treePiRow(pi({ isSubagent: true, agentType: "scout", children: [pi({ sessionPath: "/c" })] }), store(), NOW);
    assert.equal(sub.chip, "scout");
    assert.equal(sub.childCount, 1);
    assert.equal(lib.treePiRow(pi({ isSubagent: true, agentType: null }), store(), NOW).chip, "");
    assert.equal(lib.treePiRow(pi({ updatedAt: 0 }), store(), NOW).time, "");
  });
  // Tooltip carries the full title, the state label, the owner when live elsewhere and the sub-PI marker.
  test("treePiRow tooltip", () => {
    assert.equal(lib.treePiRow(pi({ title: "T" }), store(), NOW).tooltip, "T · parado");
    assert.equal(lib.treePiRow(pi({ title: "T", isSubagent: true, agentType: "scout", live: live("terminal"), raw: raw({ streaming: true }) }), store(), NOW).tooltip, "T · sub-PI scout · trabalhando · no terminal");
    assert.equal(lib.treePiRow(pi({ title: "T", live: live("orca"), raw: raw({ streaming: true }) }), store(), NOW).tooltip, "T · trabalhando · no Orca");
    assert.equal(lib.treePiRow(pi({ title: "T", live: live("studio") }), store(), NOW).tooltip, "T · parado · no Studio");
  });
  // Aggregates ignore a sub-PI's "done" (sub-PIs finish constantly) but keep its working/urgent states.
  test("aggregateState", () => {
    const seen = { baseline: 0, seen: {} };
    const child = (patch) => pi({ sessionPath: `/c${Math.random()}`, isSubagent: true, ...patch });
    assert.equal(lib.aggregateState(pi({}), seen, NOW), "idle");
    assert.equal(lib.aggregateState(pi({ children: [child({ lastAssistantAt: NOW - 1 })] }), seen, NOW), "idle");
    assert.equal(lib.aggregateState(pi({ children: [child({ live: live(), raw: raw({ streaming: true }) })] }), seen, NOW), "working");
    assert.equal(lib.aggregateState(pi({ lastAssistantAt: NOW - 1, children: [child({ raw: raw({ waitingUi: true }) })] }), seen, NOW), "urgent");
    const nested = pi({ children: [child({ children: [child({ live: live(), raw: raw({ streaming: true }) })] })] });
    assert.equal(lib.aggregateState(nested, seen, NOW), "working");
  });
  // The env row shows the worst state of its PIs, a "primary" flag, the branch only when it adds information, and the list label.
  test("treeEnvRow", () => {
    const env = envOf([pi({ sessionPath: "/1", live: live(), raw: raw({ streaming: true }) }), pi({ sessionPath: "/2" }), pi({ sessionPath: "/3" })], { name: "Working", branch: "master", morePis: 4 });
    const row = lib.treeEnvRow(env, store(), NOW);
    assert.deepEqual({ key: row.key, name: row.name, branch: row.branch, primary: row.primary, state: row.state, count: row.count, countLabel: row.countLabel, more: row.more },
      { key: "e", name: "Working", branch: "master", primary: true, state: "working", count: 3, countLabel: "3 agentes", more: 4 });
    assert.equal(lib.treeEnvRow(envOf([pi()], { name: "main", branch: "main" }), store(), NOW).branch, "");
    assert.equal(lib.treeEnvRow(envOf([pi()], { branch: null }), store(), NOW).branch, "");
    assert.equal(lib.treeEnvRow(envOf([pi()]), store(), NOW).countLabel, "1 agente");
    assert.equal(lib.treeEnvRow(envOf([]), store(), NOW).countLabel, "sem agentes");
    assert.equal(lib.treeEnvRow(envOf([pi()], { issue: "#12" }), store(), NOW).issue, "#12");
    assert.equal(lib.treeEnvRow(envOf([pi()], { issue: null }), store(), NOW).issue, "");
  });
  // The project row is the worst state of its envs, so a collapsed folder still signals work or a question.
  test("treeProjectRow", () => {
    const project = { id: "p", name: "Piloto", cwd: "/p", envs: [envOf([pi()]), envOf([pi({ raw: raw({ waitingUi: true }) })], { key: "f" })] };
    const row = lib.treeProjectRow(project, store(), NOW);
    assert.deepEqual({ key: row.key, name: row.name, state: row.state, envCount: row.envCount }, { key: "p", name: "Piloto", state: "urgent", envCount: 2 });
    assert.equal(lib.treeProjectRow({ id: "q", name: "", cwd: "C:\\a\\b", envs: [] }, store(), NOW).name, "b");
  });
});

describe("opening a PI from the tree", () => {
  // Without a history entry the PI is opened from the tree data; a PI another process writes must be followed read-only.
  test("treeHistoryItem synthesizes and flags live elsewhere", () => {
    const item = lib.treeHistoryItem(null, pi({ title: "T", live: live("orca"), raw: raw({ streaming: true }) }));
    assert.deepEqual({ path: item.path, title: item.title, state: item.state, studioOwned: item.studioOwned, lastActivity: item.lastActivity }, { path: "/s/a.jsonl", title: "T", state: "fazendo", studioOwned: false, lastActivity: NOW - 5000 });
    assert.equal(lib.treeHistoryItem(null, pi({ live: live("studio") })).studioOwned, true);
    assert.equal(lib.treeHistoryItem(null, pi({ live: live("terminal") })).state, "fazendo");
    assert.equal(lib.treeHistoryItem(null, pi({ raw: raw({ waitingUi: true }), live: live("terminal") })).state, "aguardando");
    assert.equal(lib.treeHistoryItem(null, pi({})).state, "parado");
  });
  // A history entry is kept as is, only upgraded to "fazendo" when a non-Studio process is live on it.
  test("treeHistoryItem keeps history and upgrades the state", () => {
    const entry = { path: "/s/a.jsonl", title: "H", state: "pronto", studioOwned: false, lastActivity: 1 };
    assert.equal(lib.treeHistoryItem(entry, pi({})), entry);
    assert.equal(lib.treeHistoryItem(entry, pi({ live: live("studio") })), entry);
    assert.deepEqual(lib.treeHistoryItem(entry, pi({ live: live("terminal") })), { ...entry, state: "fazendo" });
    const busy = { ...entry, state: "fazendo" };
    assert.equal(lib.treeHistoryItem(busy, pi({ live: live("terminal") })), busy);
  });
});

describe("older history rows in the tree", () => {
  // "Mostrar mais" lists history entries the tree did not show, newest first, never sub-PIs, bounded.
  test("extraHistoryPis", () => {
    const history = [
      { path: "/a", title: "A", state: "pronto", timestamp: "2026-01-01T00:00:00Z", lastActivity: 100, isSubagent: false },
      { path: "/b", title: "B", state: "fazendo", timestamp: "2026-01-02T00:00:00Z", lastActivity: 200, isSubagent: false },
      { path: "/c", title: "C", state: "pronto", isSubagent: true, lastActivity: 300 },
      { path: "/d", title: "D", state: "aguardando", lastActivity: 50 },
    ];
    const extra = lib.extraHistoryPis(history, new Set(["/a"]), 5);
    assert.deepEqual(extra.map((item) => item.sessionPath), ["/b", "/d"]);
    assert.equal(extra[0].raw.busy, true);
    assert.equal(extra[1].raw.waitingUi, true);
    assert.equal(lib.extraHistoryPis(history, new Set(), 1).length, 1);
    assert.deepEqual(lib.extraHistoryPis(null, new Set(), 5), []);
    assert.equal(lib.extraHistoryPis([{ path: "/z", title: "Z" }], new Set(), 5)[0].updatedAt, 0);
  });
});

describe("polling cadence", () => {
  // 2 s while the page is visible, 15 s hidden; failures back off up to 30 s and reset on success.
  test("treePollDelay", () => {
    assert.equal(lib.treePollDelay({ hidden: false, failures: 0 }), 2000);
    assert.equal(lib.treePollDelay({ hidden: true, failures: 0 }), 15000);
    assert.equal(lib.treePollDelay({ hidden: false, failures: 1 }), 4000);
    assert.equal(lib.treePollDelay({ hidden: false, failures: 3 }), 16000);
    assert.equal(lib.treePollDelay({ hidden: false, failures: 9 }), 30000);
    assert.equal(lib.treePollDelay({ hidden: true, failures: 5 }), 30000);
  });
});

describe("filterTree (sidebar search)", () => {
  const mk = (path, title, children = []) => pi({ sessionPath: path, title, children });
  const data = { version: "v", projects: [
    { id: "p1", name: "Piloto", cwd: "/p", envs: [
      { key: "a", name: "Working", branch: "master", primary: true, path: "/p", orca: true, orcaStatus: null, issue: null, morePis: 2, pis: [mk("/1", "Corrigir Café", [mk("/1c", "sub scout")]), mk("/2", "Outra coisa")] },
      { key: "b", name: "Auxiliar", branch: "fix-x", primary: false, path: "/q", orca: true, orcaStatus: null, issue: null, morePis: 0, pis: [mk("/3", "terceira")] },
    ] },
    { id: "p2", name: "Sanvera", cwd: "/s", envs: [] },
  ] };
  // An empty query changes nothing (same object), so no needless re-render.
  test("blank query returns the same tree", () => {
    assert.equal(lib.filterTree(data, ""), data);
    assert.equal(lib.filterTree(data, "   "), data);
  });
  // A title match keeps only that PI (accent/case-insensitive) with its parents.
  test("matches titles ignoring case and accents", () => {
    const out = lib.filterTree(data, "CAFE");
    assert.deepEqual(out.projects.map((project) => project.id), ["p1"]);
    assert.deepEqual(out.projects[0].envs.map((env) => env.key), ["a"]);
    assert.deepEqual(out.projects[0].envs[0].pis.map((item) => item.sessionPath), ["/1"]);
    assert.equal(out.projects[0].envs[0].morePis, 0);
  });
  // A match on a sub-PI keeps its ancestors so it stays reachable.
  test("sub-PI match keeps ancestors", () => {
    const out = lib.filterTree(data, "scout");
    assert.deepEqual(out.projects[0].envs[0].pis.map((item) => item.sessionPath), ["/1"]);
    assert.deepEqual(out.projects[0].envs[0].pis[0].children.map((item) => item.sessionPath), ["/1c"]);
  });
  // Matching a project or environment name (or branch) keeps everything below it.
  test("project/env/branch match keeps the whole subtree", () => {
    assert.equal(lib.filterTree(data, "pilot").projects[0].envs.length, 2);
    assert.deepEqual(lib.filterTree(data, "auxiliar").projects[0].envs.map((env) => env.key), ["b"]);
    assert.deepEqual(lib.filterTree(data, "fix-x").projects[0].envs.map((env) => env.key), ["b"]);
    assert.deepEqual(lib.filterTree(data, "sanvera").projects.map((project) => project.id), ["p2"]);
  });
  // No match: an empty project list, so the UI says "Nada encontrado".
  test("no match gives no projects", () => {
    assert.deepEqual(lib.filterTree(data, "zzz").projects, []);
  });
});

describe("sparse payloads (optional fields missing or filled)", () => {
  // The server may omit optional fields: every one falls back to a safe default instead of "undefined" text.
  test("normalizeTree defaults for a bare minimum payload", () => {
    const tree = lib.normalizeTree({ projects: [{ id: "p", envs: [{ key: "k", pis: [{ sessionPath: "/s" }] }, { key: "j", branch: "b" }, { key: "i", name: "N", branch: "br", issue: "#3", orcaStatus: "working", path: "/i", primary: true, orca: true, morePis: 2.9 }] }] });
    assert.deepEqual(lib.normalizeTree({ projects: [{ id: "q" }] }).projects[0].envs, []);
    assert.equal(tree.version, "");
    assert.equal(tree.projects[0].name, "");
    assert.equal(tree.projects[0].cwd, "");
    const [bare, branchOnly, full] = tree.projects[0].envs;
    assert.deepEqual({ name: bare.name, branch: bare.branch, path: bare.path, issue: bare.issue, orcaStatus: bare.orcaStatus }, { name: "k", branch: "", path: "", issue: null, orcaStatus: null });
    assert.equal(branchOnly.name, "b");
    assert.deepEqual({ name: full.name, issue: full.issue, orcaStatus: full.orcaStatus, morePis: full.morePis, primary: full.primary, orca: full.orca }, { name: "N", issue: "#3", orcaStatus: "working", morePis: 2, primary: true, orca: true });
    assert.deepEqual(bare.pis[0].raw, { busy: false, streaming: false, waitingUi: false, error: false, stalledMs: null, orcaState: null });
    assert.equal(bare.pis[0].sessionId, "");
    assert.equal(bare.pis[0].startedAt, 0);
    assert.equal(bare.pis[0].agentType, null);
  });
  // Filled optional fields survive normalization.
  test("normalizeTree keeps live, raw and question details", () => {
    const item = lib.normalizeTree({ version: 3, projects: [{ id: "p", name: "P", cwd: "/p", envs: [{ key: "k", pis: [{
      sessionPath: "/s", sessionId: "abc", agentType: "scout", isSubagent: true, live: { pid: 7, owner: "orca", startedAt: 9 },
      raw: { busy: true, streaming: true, waitingUi: true, error: true, stalledMs: 5, orcaState: "blocked" }, pendingQuestions: { total: 3, blocking: true }, startedAt: 4,
    }] }] }] }).projects[0].envs[0].pis[0];
    assert.deepEqual(item.live, { pid: 7, owner: "orca", startedAt: 9 });
    assert.equal(item.raw.orcaState, "blocked");
    assert.deepEqual(item.pendingQuestions, { total: 3, blocking: true });
    assert.equal(item.sessionId, "abc");
    assert.equal(item.startedAt, 4);
    assert.equal(lib.normalizeTree({ version: 3, projects: [] }).version, "3");
    assert.deepEqual(lib.normalizeTree({ projects: [{ id: "p", envs: [{ key: "k", pis: [{ sessionPath: "/s", live: {} }] }] }] }).projects[0].envs[0].pis[0].live, { pid: null, owner: "", startedAt: null });
  });
  // Rows built from partial env/live data still read well: unknown owner adds nothing; missing counts are zero.
  test("view model tolerates missing optional fields", () => {
    const item = lib.normalizeTree({ projects: [{ id: "p", envs: [{ key: "k", pis: [{ sessionPath: "/s", title: "T", live: { owner: "alien" } }] }] }] }).projects[0].envs[0].pis[0];
    assert.equal(lib.treePiRow(item, { baseline: 0, seen: {} }, NOW).tooltip, "T · parado");
    const env = { key: "k", name: "k", branch: "", primary: false, pis: [item] };
    const row = lib.treeEnvRow(env, { baseline: 0, seen: {} }, NOW);
    assert.equal(row.more, 0);
    assert.equal(row.issue, "");
  });
});
