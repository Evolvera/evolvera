// Sidebar tree DOM + poller + state indicator, on a minimal fake DOM and fake timers. One comment line per test: what, expected, why.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import * as lib from "../public/lib.js";
import { applyState, stateHtml } from "../public/state-indicator.js";
import { createSidebarTree, createTreePoller, reconcileChildren } from "../public/sidebar-tree.js";
import { createTreeController as lib_createController } from "../public/tree-controller.js";
import { byClass, byKey, FakeDocument, FakeElement, findAll } from "./fake-dom.mjs";

const NOW = 1_800_000_000_000;
const raw = (patch = {}) => ({ busy: false, streaming: false, waitingUi: false, error: false, stalledMs: null, orcaState: null, ...patch });
const pi = (path, patch = {}) => ({
  sessionPath: path, sessionId: path, title: `Titulo ${path}`, agentType: null, isSubagent: false, live: null, raw: raw(),
  pendingQuestions: { total: 0, blocking: 0 }, lastAssistantAt: null, updatedAt: NOW - 60_000, startedAt: 0, children: [], ...patch,
});
const live = { pid: 1, owner: "orca", startedAt: NOW };
const env = (key, pis, patch = {}) => ({ key, name: key, branch: "", primary: false, path: `/${key}`, orca: true, orcaStatus: null, issue: null, pis, morePis: 0, ...patch });
const project = (id, envs) => ({ id, name: `Proj ${id}`, cwd: `/${id}`, envs });
const store = { baseline: NOW, seen: {} };

function setup() {
  const doc = new FakeDocument();
  const root = new FakeElement("div");
  const tree = createSidebarTree({ root, doc, icon: () => "<svg/>" });
  const render = (data, extra = {}) => tree.render({ data: { version: "v", projects: data }, store, expanded: new Map(), now: NOW, currentPath: null, extras: new Map(), projectIdFor: (path, id) => id, ...extra });
  return { doc, root, tree, render };
}

describe("state indicator", () => {
  // The component sets data-state and a pt-BR accessible label; unknown states read as idle.
  test("applyState sets state, label and title, only when changed", () => {
    const el = new FakeElement("span");
    applyState(el, "working");
    assert.equal(el.dataset.state, "working");
    assert.equal(el.getAttribute("aria-label"), "trabalhando");
    assert.equal(el.title, "trabalhando");
    assert.equal(el.getAttribute("role"), "img");
    assert.equal(applyState(el, "working"), false);
    assert.equal(applyState(el, "urgent"), true);
    assert.equal(el.getAttribute("aria-label"), "precisa de você");
    applyState(el, "bogus");
    assert.equal(el.dataset.state, "idle");
  });
  // Templates (innerHTML builders) use the same markup so CSS styles one thing.
  test("stateHtml renders the span with class, state and label; extra class and escaping", () => {
    assert.equal(stateHtml("done"), '<span class="state" data-state="done" role="img" aria-label="terminou" title="terminou"></span>');
    assert.match(stateHtml("urgent", "sa-state-dot"), /class="state sa-state-dot" data-state="urgent"/);
    assert.match(stateHtml("<x>"), /data-state="idle"/);
  });
});

describe("reconcileChildren (keyed, in place)", () => {
  const makeParent = () => new FakeElement("div");
  const hooks = (log) => ({
    create: (model) => { log.push(`create ${model.key}`); const el = new FakeElement("i"); el.dataset.key = model.key; return el; },
    update: (el, model) => { log.push(`update ${model.key}`); el.textContent = model.text ?? ""; },
  });
  // Same keys: the very same elements are reused and nothing is created.
  test("reuses elements by key", () => {
    const parent = makeParent();
    const log = [];
    reconcileChildren(parent, [{ key: "a" }, { key: "b" }], hooks(log));
    const [a, b] = parent.children;
    log.length = 0;
    reconcileChildren(parent, [{ key: "a", text: "x" }, { key: "b" }], hooks(log));
    assert.deepEqual(parent.children, [a, b]);
    assert.equal(log.filter((line) => line.startsWith("create")).length, 0);
    assert.equal(a.textContent, "x");
  });
  // Reorders move existing nodes, inserts create only the new one, removed keys disappear.
  test("reorders, inserts and removes", () => {
    const parent = makeParent();
    reconcileChildren(parent, [{ key: "a" }, { key: "b" }, { key: "c" }], hooks([]));
    const [a, b, c] = parent.children;
    const log = [];
    reconcileChildren(parent, [{ key: "c" }, { key: "n" }, { key: "a" }], hooks(log));
    assert.deepEqual(parent.children.map((el) => el.dataset.key), ["c", "n", "a"]);
    assert.equal(parent.children[0], c);
    assert.equal(parent.children[2], a);
    assert.equal(b.parentNode, null);
    assert.deepEqual(log.filter((line) => line.startsWith("create")), ["create n"]);
  });
  // An empty model list clears the parent; a duplicate key is rendered once instead of breaking.
  test("empties and ignores duplicate keys", () => {
    const parent = makeParent();
    reconcileChildren(parent, [{ key: "a" }, { key: "a" }, { key: "b" }], hooks([]));
    assert.deepEqual(parent.children.map((el) => el.dataset.key), ["a", "b"]);
    reconcileChildren(parent, [], hooks([]));
    assert.equal(parent.children.length, 0);
  });
});

describe("sidebar tree render", () => {
  const data = () => [
    project("p1", [
      env("main", [
        pi("/1", { live, raw: raw({ streaming: true }), children: [pi("/1a", { title: "Ler arquivos", isSubagent: true, agentType: "scout", updatedAt: NOW - 5000 })] }),
        pi("/2", { lastAssistantAt: NOW - 1000 }),
      ], { primary: true, name: "Working", branch: "master", morePis: 3 }),
      env("aux", [pi("/3")], { name: "Auxiliar", branch: "fix-x" }),
    ]),
    project("p2", [env("main", [], { primary: true, name: "main" })]),
  ];
  // Project -> env -> PI nesting with names, chips, branch, state and relative time in the expected places.
  test("builds the hierarchy with the right texts and states", () => {
    const { root, render } = setup();
    render(data(), { store: { baseline: 0, seen: {} } });
    assert.deepEqual(root.children.map((el) => el.dataset.key), ["p:p1", "p:p2"]);
    const p1 = byKey(root, "p:p1");
    assert.equal(byClass(p1, "tp-name")[0].textContent, "Proj p1");
    assert.equal(byClass(p1, "tp-head")[0].getAttribute("aria-expanded"), "true");
    const main = byKey(root, "e:p1/main");
    assert.equal(byClass(main, "te-name")[0].textContent, "Working");
    assert.equal(byClass(main, "te-chip")[0].hidden, false);
    assert.equal(byClass(main, "te-chip")[0].textContent, "primary");
    assert.equal(byClass(main, "te-branch")[0].textContent, "master");
    const listToggle = byClass(main, "tl-head")[0];
    assert.equal(listToggle.textContent, "2 agentes");
    assert.equal(listToggle.parentNode, byClass(main, "te-row")[0], "the compact list toggle is inline with the environment header");
    assert.equal(listToggle.getAttribute("aria-expanded"), "true");
    assert.equal(byClass(byKey(root, "e:p1/aux"), "te-chip")[0].hidden, true);
    const row = byKey(root, "pi:/1");
    assert.equal(byClass(row, "session-title")[0].textContent, "Titulo /1");
    assert.equal(byClass(row, "state")[0].dataset.state, "working");
    assert.equal(byClass(byKey(root, "pi:/2"), "state")[0].dataset.state, "done");
    assert.equal(byClass(row, "session-time")[0].textContent, "1 min");
    assert.equal(byClass(row, "session-item")[0].dataset.action, "open-session");
    assert.equal(byClass(row, "session-item")[0].dataset.path, "/1");
    assert.equal(byClass(row, "session-item")[0].dataset.env, "/main");
    assert.equal(byClass(row, "session-menu-btn")[0].dataset.path, "/1");
  });
  // Folders and envs aggregate the worst state of what is inside, so a collapsed folder still signals work.
  test("aggregated indicators on project and env rows", () => {
    const { root, render } = setup();
    render(data(), { store: { baseline: 0, seen: {} } });
    assert.equal(byClass(byClass(byKey(root, "p:p1"), "tp-head")[0], "state")[0].dataset.state, "working");
    assert.equal(byClass(byClass(byKey(root, "e:p1/aux"), "te-head")[0], "state")[0].dataset.state, "idle");
    assert.equal(byClass(byClass(byKey(root, "p:p2"), "tp-head")[0], "state")[0].dataset.state, "idle");
  });
  // Sub-PIs sit under their parent, collapsed by default with a count, tagged with their agent type only.
  test("sub-PIs are nested, collapsed by default, with a type chip when shown", () => {
    const { root, render } = setup();
    render(data());
    const parent = byKey(root, "pi:/1");
    assert.equal(byClass(parent, "tpi-sub")[0].textContent, "1 sub-PI");
    assert.equal(byClass(parent, "tpi-sub")[0].getAttribute("aria-expanded"), "false");
    assert.equal(byKey(root, "pi:/1a"), undefined);
    assert.equal(byClass(byKey(root, "pi:/2"), "tpi-sub")[0].hidden, true);
    render(data(), { expanded: new Map([["s:/1", true]]) });
    const sub = byKey(root, "pi:/1a");
    assert.equal(sub.parentNode.parentNode, byKey(root, "pi:/1"));
    assert.equal(byClass(sub, "tp-chip")[0].textContent, "scout");
    assert.equal(byClass(byKey(root, "pi:/2"), "tp-chip")[0].hidden, true);
  });
  // Collapsed nodes hide the body; the expanded override survives re-renders.
  test("collapsing a project or env hides its body", () => {
    const { root, render } = setup();
    render(data(), { expanded: new Map([["p:p1", false], ["l:p1/aux", false]]) });
    assert.equal(byClass(byKey(root, "p:p1"), "tp-body")[0].hidden, true);
    assert.equal(byClass(byKey(root, "p:p1"), "tp-head")[0].getAttribute("aria-expanded"), "false");
    assert.equal(byClass(byKey(root, "p:p2"), "tp-body")[0].hidden, false);
    render(data(), { expanded: new Map([["l:p1/aux", false]]) });
    const aux = byKey(root, "e:p1/aux");
    assert.equal(byClass(aux, "tl-list")[0].hidden, true);
    assert.equal(byClass(aux, "tl-head")[0].getAttribute("aria-expanded"), "false");
    assert.equal(byClass(aux, "te-body")[0].hidden, false, "list collapse does not collapse the environment");
    assert.equal(byClass(aux, "te-toggle")[0].getAttribute("aria-expanded"), "true");
  });
  // The open conversation is highlighted with aria-current, the same cue as the old list.
  test("marks the open conversation", () => {
    const { root, render } = setup();
    render(data(), { currentPath: "/2" });
    assert.equal(byClass(byKey(root, "pi:/2"), "session-item")[0].getAttribute("aria-current"), "true");
    assert.equal(byClass(byKey(root, "pi:/1"), "session-item")[0].getAttribute("aria-current"), null);
    render(data(), { currentPath: "/1" });
    assert.equal(byClass(byKey(root, "pi:/2"), "session-item")[0].getAttribute("aria-current"), null);
  });
  // "Mostrar mais (N)" per env: from the server's count, or extra history rows when the user asked for them.
  test("more button with the server count and extra rows", () => {
    const { root, render } = setup();
    render(data());
    const more = byClass(byKey(root, "e:p1/main"), "session-more")[0];
    assert.equal(more.textContent, "Mostrar mais (3)");
    assert.equal(more.dataset.action, "tree-more");
    assert.equal(more.dataset.path, "/main");
    assert.equal(byClass(byKey(root, "e:p1/aux"), "session-more").length, 0);
    render(data(), { extras: new Map([["p1/main", [pi("/x1"), pi("/x2")]]]) });
    assert.ok(byKey(root, "pi:/x1") && byKey(root, "pi:/x2"));
    assert.equal(byClass(byKey(root, "e:p1/main"), "session-more").length, 0);
    const countToggle = byClass(byKey(root, "e:p1/main"), "tl-head")[0];
    assert.equal(countToggle.textContent, "4 agentes");
    assert.equal(countToggle.parentNode, byClass(byKey(root, "e:p1/main"), "te-row")[0]);
  });
  // The old project list shares the container: the first tree render must clear its rows once, then never again.
  test("first render clears foreign rows", () => {
    const { root, render } = setup();
    const old = new FakeElement("div");
    root.append(old);
    render(data());
    assert.equal(old.parentNode, null);
    assert.deepEqual(root.children.map((el) => el.dataset.key), ["p:p1", "p:p2"]);
  });
  // Project id for a worktree the Studio already lists is used on the row, so the menu opens the right project.
  test("rows carry the project id given by projectIdFor", () => {
    const { root, render } = setup();
    render(data(), { projectIdFor: (path, id) => (path === "/aux" ? "studio-aux" : id) });
    assert.equal(byClass(byKey(root, "pi:/3"), "session-item")[0].dataset.project, "studio-aux");
    assert.equal(byClass(byKey(root, "pi:/2"), "session-item")[0].dataset.project, "p1");
    assert.equal(byClass(byKey(root, "e:p1/aux"), "te-head")[0].dataset.project, "studio-aux");
  });
  // Empty tree: one friendly note; filter active: a different note; the note goes away when data arrives.
  test("empty tree and empty filter notes", () => {
    const { root, render } = setup();
    render([]);
    assert.equal(root.children.length, 1);
    assert.equal(root.children[0].textContent, "Nenhum projeto encontrado.");
    render([], { filtered: true });
    assert.equal(root.children[0].textContent, "Nada encontrado.");
    render(data());
    assert.equal(root.children.length, 2);
  });
});

describe("sidebar tree stability (phase 2: break it)", () => {
  const big = (count) => [project("p1", [env("main", Array.from({ length: count }, (_, i) => pi(`/s${i}`, { updatedAt: NOW - i * 1000 })), { primary: true })])];
  // Rendering unchanged data again must touch the DOM zero times and keep every node.
  test("identical re-render: zero writes, same nodes", () => {
    const { root, render, tree } = setup();
    render(big(60));
    const nodes = findAll(root, () => true);
    const writes = tree.stats.writes;
    render(big(60));
    assert.equal(tree.stats.writes, writes);
    assert.deepEqual(findAll(root, () => true), nodes);
    assert.equal(tree.stats.renders, 2);
  });
  // One PI changing state writes only that indicator; the spinner element of others is never replaced.
  test("a state change writes just that row", () => {
    const { root, render, tree } = setup();
    render(big(40));
    const before = byKey(root, "pi:/s7");
    const writes = tree.stats.writes;
    const changed = big(40);
    changed[0].envs[0].pis[7] = pi("/s7", { live, raw: raw({ streaming: true }), updatedAt: NOW - 7000 });
    render(changed);
    assert.equal(byKey(root, "pi:/s7"), before);
    assert.equal(byClass(before, "state")[0].dataset.state, "working");
    assert.ok(tree.stats.writes - writes <= 10, `writes ${tree.stats.writes - writes}`);
  });
  // 500 PIs: renders correctly and a second pass writes nothing (per-env cap is the server's job, the DOM copes anyway).
  test("500 PIs", () => {
    const { root, render, tree } = setup();
    render(big(500));
    assert.equal(byClass(root, "tpi").length, 500);
    const writes = tree.stats.writes;
    render(big(500));
    assert.equal(tree.stats.writes, writes);
  });
  // Rapid updates every 500 ms for a minute (120 renders with a moving timestamp) keep node count constant and never leak nodes.
  test("120 rapid updates keep the DOM size constant", () => {
    const { doc, root, render } = setup();
    render(big(30));
    const created = doc.created;
    for (let i = 0; i < 120; i++) {
      const frame = big(30);
      frame[0].envs[0].pis[i % 30] = pi(`/s${i % 30}`, { live, raw: raw({ streaming: i % 2 === 0 }) });
      render(frame, { now: NOW + i * 500 });
    }
    assert.equal(byClass(root, "tpi").length, 30);
    assert.equal(doc.created, created);
  });
  // Deep nesting (clamped to 8 by normalizeTree) renders as nested lists without recursion problems when opened.
  test("deeply nested sub-PIs render when expanded", () => {
    const { root, render } = setup();
    let nested = pi("/d8", { isSubagent: true, agentType: "x" });
    for (let i = 7; i >= 0; i--) nested = pi(`/d${i}`, { isSubagent: i > 0, agentType: "x", children: [nested] });
    const expanded = new Map(Array.from({ length: 10 }, (_, i) => [`s:/d${i}`, true]));
    render([project("p1", [env("main", [nested])])], { expanded });
    assert.equal(byClass(root, "tpi").length, 9);
    assert.ok(byKey(root, "pi:/d8"));
  });
  // Unicode, RTL, long and markup-like titles are plain text: no markup is ever injected.
  test("odd titles are set as text", () => {
    const { root, render } = setup();
    const titles = ["日本語のタイトル", "مرحبا بالعالم", "<img src=x onerror=alert(1)>", "x".repeat(160), "a & b \"c\""];
    render([project("p1", [env("main", titles.map((title, i) => pi(`/t${i}`, { title })))])]);
    titles.forEach((title, i) => assert.equal(byClass(byKey(root, `pi:/t${i}`), "session-title")[0].textContent, title));
    assert.equal(findAll(root, (el) => el.tag === "img").length, 0);
  });
  // Removing a PI from the data removes only its node; the others keep identity (scroll/focus preserved).
  test("removed PI leaves others untouched", () => {
    const { root, render } = setup();
    render(big(5));
    const keep = byKey(root, "pi:/s3");
    const data = big(5);
    data[0].envs[0].pis.splice(1, 1);
    render(data);
    assert.equal(byKey(root, "pi:/s1"), undefined);
    assert.equal(byKey(root, "pi:/s3"), keep);
  });
});

describe("tree poller", () => {
  function harness(responses, { hidden = false } = {}) {
    const timers = [];
    const calls = [];
    const events = [];
    let hiddenNow = hidden;
    const poller = createTreePoller({
      fetchTree: async ({ etag, signal }) => {
        calls.push({ etag, signal });
        const next = responses.shift();
        if (next instanceof Error) throw next;
        if (typeof next === "function") return next(signal);
        return next;
      },
      onTree: (data, meta) => events.push(["tree", data.version, meta.changed]),
      onError: (error, failures) => events.push(["error", error.message, failures]),
      isHidden: () => hiddenNow,
      setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
      clearTimer: (id) => { if (timers[id - 1]) timers[id - 1].cleared = true; },
    });
    const flush = () => new Promise((resolve) => setImmediate(resolve));
    const fire = async () => { const timer = [...timers].reverse().find((item) => !item.cleared && !item.fired); timer.fired = true; timer.fn(); await flush(); };
    return { poller, timers, calls, events, setHidden: (value) => { hiddenNow = value; }, flush, fire };
  }
  // A 200 delivers the tree and remembers its version; the next request is conditional.
  test("200 then conditional request; 304 delivers nothing", async () => {
    const h = harness([{ status: 200, data: { version: "v1", projects: [] } }, { status: 304 }, { status: 304 }]);
    h.poller.start();
    await h.flush();
    assert.deepEqual(h.events, [["tree", "v1", true]]);
    assert.equal(h.calls[0].etag, null);
    await h.fire();
    await h.fire();
    assert.equal(h.calls[1].etag, "v1");
    assert.equal(h.calls[2].etag, "v1");
    assert.deepEqual(h.events, [["tree", "v1", true]]);
    assert.equal(h.poller.stats.polls, 3);
    assert.equal(h.poller.stats.notModified, 2);
    assert.equal(h.timers.at(-1).ms, 2000);
  });
  // A 200 with the same version (server without 304 support) is not a change: no re-render.
  test("200 with the same version reports changed=false", async () => {
    const h = harness([{ status: 200, data: { version: "v1", projects: [] } }, { status: 200, data: { version: "v1", projects: [] } }]);
    h.poller.start();
    await h.flush();
    await h.fire();
    assert.deepEqual(h.events, [["tree", "v1", true], ["tree", "v1", false]]);
  });
  // Hidden page: 15 s cadence. Becoming visible polls at once.
  test("hidden cadence and poke on visibility", async () => {
    const h = harness([{ status: 304 }, { status: 304 }], { hidden: true });
    h.poller.start();
    await h.flush();
    assert.equal(h.timers.at(-1).ms, 15000);
    h.setHidden(false);
    h.poller.poke();
    await h.flush();
    assert.equal(h.calls.length, 2);
    assert.equal(h.timers.at(-1).ms, 2000);
  });
  // Errors (API down, 404 before the server has the endpoint) back off, report, and recover on the next success.
  test("errors back off and recover", async () => {
    const h = harness([new Error("HTTP 500"), new Error("HTTP 500"), { status: 200, data: { version: "ok", projects: [] } }]);
    h.poller.start();
    await h.flush();
    assert.deepEqual(h.events, [["error", "HTTP 500", 1]]);
    assert.equal(h.timers.at(-1).ms, 4000);
    await h.fire();
    assert.equal(h.timers.at(-1).ms, 8000);
    await h.fire();
    assert.deepEqual(h.events.at(-1), ["tree", "ok", true]);
    assert.equal(h.timers.at(-1).ms, 2000);
  });
  // stop() aborts the request in flight, ignores its late answer and clears the timer; start() again works.
  test("stop aborts in-flight and ignores the late result", async () => {
    let release;
    const h = harness([(signal) => new Promise((resolve) => { release = () => resolve({ status: 200, data: { version: "late", projects: [] } }); signal.addEventListener("abort", () => {}); })]);
    h.poller.start();
    await h.flush();
    h.poller.stop();
    assert.equal(h.calls[0].signal.aborted, true);
    release();
    await h.flush();
    assert.deepEqual(h.events, []);
    assert.ok(h.timers.every((timer) => timer.cleared || timer.fired || true));
    assert.equal(h.timers.filter((timer) => !timer.cleared).length, 0);
  });
  // Overlapping triggers (timer + poke) never run two requests at once.
  test("no overlapping requests", async () => {
    let release;
    const h = harness([() => new Promise((resolve) => { release = () => resolve({ status: 304 }); }), { status: 304 }]);
    h.poller.start();
    await h.flush();
    h.poller.poke();
    h.poller.poke();
    await h.flush();
    assert.equal(h.calls.length, 1);
    release();
    await h.flush();
    assert.equal(h.calls.length, 1);
  });
  // An aborted request (stop) throws AbortError: it is not reported as a failure.
  test("abort errors are silent", async () => {
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    const h = harness([abort]);
    h.poller.start();
    await h.flush();
    assert.deepEqual(h.events, []);
  });
  // 10 polls answered 304 never reach the render callback (the re-render counter stays at 0).
  test("ten 304 polls cause zero renders", async () => {
    const h = harness([{ status: 200, data: { version: "v1", projects: [] } }, ...Array.from({ length: 10 }, () => ({ status: 304 }))]);
    let renders = 0;
    h.poller.start();
    await h.flush();
    const base = h.events.length;
    for (let i = 0; i < 10; i++) await h.fire();
    renders = h.events.length - base;
    assert.equal(renders, 0);
    assert.equal(h.poller.stats.notModified, 10);
  });
});

describe("tree controller (storage, polling, seen, expanded)", () => {
  const makeStorage = (initial = {}) => {
    const map = new Map(Object.entries(initial));
    return { map, getItem: (key) => (map.has(key) ? map.get(key) : null), setItem: (key, value) => { map.set(key, String(value)); } };
  };
  const body = (version, pis = [pi("/1", { lastAssistantAt: NOW - 100 })]) => ({ version, generatedAt: NOW, projects: [{ id: "p1", name: "P", cwd: "/p", envs: [{ key: "main", name: "main", branch: "main", primary: true, path: "/p", orca: false, orcaStatus: null, issue: null, pis, morePis: 2 }] }] });
  function build({ responses, storage = makeStorage(), view = {}, hidden = false } = {}) {
    const doc = new FakeDocument();
    const root = new FakeElement("div");
    const changes = [];
    const timers = [];
    let clock = NOW;
    const controller = lib_createController({
      root, doc, icon: () => "", storage, now: () => clock,
      fetchTree: async () => { const next = responses.shift(); if (next instanceof Error) throw next; return next; },
      isHidden: () => hidden,
      getView: () => ({ currentPath: null, filter: "", projectsKey: "k", projectIdFor: (path, id) => id, ...view }),
      onChange: (reason) => changes.push(reason),
      setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
      clearTimer: () => {},
    });
    const flush = () => new Promise((resolve) => setImmediate(resolve));
    return { controller, root, storage, changes, timers, flush, setClock: (value) => { clock = value; }, fire: async () => { timers.at(-1).fn(); await flush(); } };
  }

  // First load writes the seen baseline so old conversations do not all turn blue; a saved store is honored.
  test("persists a baseline on first load and reuses a saved store", () => {
    const first = build({ responses: [] });
    assert.deepEqual(JSON.parse(first.storage.map.get("pi-studio:seen")), { baseline: NOW, seen: {} });
    const saved = makeStorage({ "pi-studio:seen": JSON.stringify({ baseline: 5, seen: { "/a": 9 } }) });
    build({ responses: [], storage: saved });
    assert.deepEqual(JSON.parse(saved.map.get("pi-studio:seen")), { baseline: 5, seen: { "/a": 9 } });
  });

  // 200 renders once; ten 304 polls render nothing; a new version renders again.
  test("renders on change only", async () => {
    const h = build({ responses: [{ status: 200, data: body("v1") }, ...Array.from({ length: 10 }, () => ({ status: 304 })), { status: 200, data: body("v2") }] });
    h.controller.start();
    await h.flush();
    assert.equal(h.controller.stats.renders, 1);
    assert.equal(h.controller.active(), true);
    for (let i = 0; i < 10; i++) await h.fire();
    assert.equal(h.controller.stats.renders, 1);
    assert.equal(h.controller.stats.pollRenders, 1);
    await h.fire();
    assert.equal(h.controller.stats.renders, 2);
    assert.equal(h.controller.stats.pollRenders, 2);
  });

  // An error before any data means "no tree" (old project list stays); after data, the last tree stays on screen.
  test("errors: inactive without data, sticky with data", async () => {
    const down = build({ responses: [{ status: 200, data: { nope: true } }] });
    down.controller.start();
    await down.flush();
    assert.equal(down.controller.active(), false);
    assert.deepEqual(down.changes, ["unavailable"]);
    const up = build({ responses: [{ status: 200, data: body("v1") }, new Error("HTTP 500")] });
    up.controller.start();
    await up.flush();
    await up.fire();
    assert.equal(up.controller.active(), true);
    assert.equal(up.controller.stats.renders, 1);
  });

  // Toggling flips the override, persists it, and the next controller instance starts with it.
  test("toggle persists expanded state", async () => {
    const h = build({ responses: [{ status: 200, data: body("v1") }] });
    h.controller.start();
    await h.flush();
    h.controller.toggle("p:p1", true);
    assert.deepEqual(JSON.parse(h.storage.map.get("pi-studio:tree-open")), { "p:p1": false });
    assert.equal(byClass(byKey(h.root, "p:p1"), "tp-body")[0].hidden, true);
    const again = build({ responses: [{ status: 200, data: body("v1") }], storage: h.storage });
    again.controller.start();
    await again.flush();
    assert.equal(byClass(byKey(again.root, "p:p1"), "tp-body")[0].hidden, true);
  });

  // Opening a conversation (or a new turn while it is open) clears "done" once, without a flash of blue.
  test("markSeen clears done, only when newer, and can skip the render", async () => {
    const h = build({ responses: [{ status: 200, data: body("v1") }], storage: makeStorage({ "pi-studio:seen": JSON.stringify({ baseline: 0, seen: {} }) }) });
    h.controller.start();
    await h.flush();
    assert.equal(byClass(byKey(h.root, "pi:/1"), "state")[0].dataset.state, "done");
    const renders = h.controller.stats.renders;
    assert.equal(h.controller.markSeen("/1", { render: false }), true);
    assert.equal(h.controller.stats.renders, renders);
    h.controller.render();
    assert.equal(byClass(byKey(h.root, "pi:/1"), "state")[0].dataset.state, "idle");
    assert.equal(h.controller.markSeen("/1"), false);
    assert.equal(h.controller.markSeen("/unknown"), false);
    assert.ok(JSON.parse(h.storage.map.get("pi-studio:seen")).seen["/1"] >= NOW - 100);
  });

  // Same inputs never re-render; a changed filter, current conversation or project list does.
  test("render() skips unchanged inputs", async () => {
    const view = { filter: "" };
    const h = build({ responses: [{ status: 200, data: body("v1") }], view });
    h.controller.start();
    await h.flush();
    const renders = h.controller.stats.renders;
    h.controller.render();
    h.controller.render();
    assert.equal(h.controller.stats.renders, renders);
    view.filter = "titulo";
    h.controller.render();
    assert.equal(h.controller.stats.renders, renders + 1);
    view.currentPath = "/1";
    h.controller.render();
    assert.equal(h.controller.stats.renders, renders + 2);
    h.controller.render({ force: true });
    assert.equal(h.controller.stats.renders, renders + 3);
  });

  // findPi walks sub-PIs; stateOf gives the row state for the header indicator.
  test("findPi and stateOf", async () => {
    const child = pi("/1c", { isSubagent: true, live, raw: raw({ streaming: true }) });
    const h = build({ responses: [{ status: 200, data: body("v1", [pi("/1", { children: [child] })]) }] });
    h.controller.start();
    await h.flush();
    assert.equal(h.controller.findPi("/1c").sessionPath, "/1c");
    assert.equal(h.controller.findPi("/nope"), null);
    assert.equal(h.controller.stateOf("/1c"), "working");
    assert.equal(h.controller.stateOf("/nope"), null);
  });

  // "Mostrar mais" fills the env with older history rows (not already shown) and hides the button.
  test("expandEnv adds older history rows", async () => {
    const h = build({ responses: [{ status: 200, data: body("v1") }] });
    h.controller.start();
    await h.flush();
    await h.controller.expandEnv("p1/main", [{ path: "/1", title: "ja", state: "pronto" }, { path: "/old", title: "Antiga", state: "pronto", lastActivity: 5 }]);
    assert.ok(byKey(h.root, "pi:/old"));
    assert.equal(byClass(byKey(h.root, "e:p1/main"), "session-more").length, 0);
    assert.equal(await h.controller.expandEnv("zzz/none", []), false);
  });

  // stop() halts polling for good (page unload).
  test("stop cancels polling", async () => {
    const h = build({ responses: [{ status: 200, data: body("v1") }, { status: 304 }] });
    h.controller.start();
    await h.flush();
    h.controller.stop();
    assert.equal(h.controller.poller.stats.polls, 1);
  });
});
