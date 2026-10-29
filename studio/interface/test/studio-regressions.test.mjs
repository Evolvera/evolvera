// Studio selection/lifecycle regressions. These inspect the actual bounded handlers without starting PI,
// Orca, a server, a browser, or making API writes; the source-level assertions are deterministic offline.
import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createTitleIndex } from "../lib-server/session-titles.mjs";
import { createTreeService } from "../lib-server/tree.mjs";
import { subagentTiming, treePiRow } from "../public/lib.js";

const [app, server, treeSource, sidebar, controller, styles] = await Promise.all([
  readFile(new URL("../public/app.js", import.meta.url), "utf8"),
  readFile(new URL("../server.mjs", import.meta.url), "utf8"),
  readFile(new URL("../lib-server/tree.mjs", import.meta.url), "utf8"),
  readFile(new URL("../public/sidebar-tree.js", import.meta.url), "utf8"),
  readFile(new URL("../public/tree-controller.js", import.meta.url), "utf8"),
  readFile(new URL("../public/styles.css", import.meta.url), "utf8"),
]);

function functionBody(name) {
  const declaration = app.indexOf(`function ${name}(`);
  const assignment = app.indexOf(`const ${name} =`);
  const start = declaration >= 0 ? declaration : assignment;
  assert.notEqual(start, -1, `expected function ${name} to exist`);
  let open;
  if (declaration >= 0) {
    const parameters = app.indexOf("(", declaration);
    let depth = 0;
    let closeParameters = -1;
    for (let index = parameters; index < app.length; index++) {
      if (app[index] === "(") depth++;
      if (app[index] === ")" && --depth === 0) { closeParameters = index; break; }
    }
    assert.notEqual(closeParameters, -1, `unclosed parameters for ${name}`);
    open = app.indexOf("{", closeParameters + 1);
  } else {
    const arrow = app.indexOf("=>", assignment);
    assert.notEqual(arrow, -1, `expected arrow function ${name}`);
    open = app.indexOf("{", arrow + 2);
  }
  assert.notEqual(open, -1, `expected block body for ${name}`);
  let depth = 0;
  for (let index = open; index < app.length; index++) {
    if (app[index] === "{") depth++;
    if (app[index] === "}" && --depth === 0) return app.slice(open + 1, index);
  }
  assert.fail(`unclosed function ${name}`);
}

test("watched chats never borrow or send the parent PI's Fast Mode", () => {
  // Behavior: a followed chat from another process has no verified mode owner; expect unknown/disabled UI and no /fast RPC.
  // Why: `state.statuses` and rpcRequest belong to Studio's current PI, not the selected watched session.
  const section = functionBody("fastSectionHtml");
  const chip = functionBody("renderFastChip");
  const actions = functionBody("fastPaletteActions");
  const send = functionBody("sendFast");
  const choose = functionBody("chooseFast");
  assert.match(section, /state\.watch[\s\S]*indisponível[\s\S]*return/);
  assert.match(chip, /state\.watch/);
  assert.match(actions, /state\.watch/);
  assert.match(send, /state\.watch[\s\S]*return/);
  assert.match(choose, /state\.watch[\s\S]*return/);
  assert.match(send, /rpcRequest\(\{ type: "prompt", message: `\/fast \$\{option\.flag\}` \}/);
  const view = functionBody("fastView");
  assert.match(view, /statusText:\s*state\.statuses\.get\(FAST_STATUS_KEY\)/, "the normal current-PI path still projects its status");
  assert.match(section, /const view = fastView\(\)/, "the normal current-PI controls remain intact");
});

test("queued worktree selection recalculates project equality after it acquires the gate", () => {
  // Behavior: while A is queued, B becomes current; expect the callback to open A and then select its conversation.
  // Why: a captured pre-gate equality can incorrectly skip A's load after another gated transition opens B.
  const body = functionBody("openWorktree");
  const gate = body.indexOf("return runGated(state, async () => {");
  const targetCheck = body.indexOf("samePath(state.currentProject?.cwd, worktree.path)", gate);
  const openTarget = body.indexOf("if (!open)", gate);
  assert.ok(gate >= 0, "worktree operation remains gated");
  assert.ok(targetCheck > gate, "current-project equality is recomputed inside the gated callback");
  assert.ok(openTarget > targetCheck, "the freshly computed decision controls whether the target opens");
  assert.doesNotMatch(body.slice(0, gate), /const open\s*=/, "no stale equality captured before queueing");
});

test("switching projects tears down the old watch before installing the new session", () => {
  // Behavior: while following a file in A, opening B restores A's studioFile only in A; expect no A file assigned to B.
  // Why: stopWatch restores into state.session, so reset/teardown must precede replacing A's session with B's.
  const body = functionBody("loadProject");
  const reset = body.indexOf("resetConversation()");
  const installSession = body.indexOf("state.session = session;");
  const installProject = body.indexOf("state.currentProject = project;");
  assert.ok(reset >= 0, "project load resets conversation and stops any old watch");
  assert.ok(installSession > reset, "old watch teardown finishes before the new session is installed");
  assert.ok(installProject > reset, "old watch teardown finishes before the new project becomes current");
});

test("nested child pages keep every child reachable beyond the first 20", async () => {
  // Behavior: both a main chat and its child can page the 21st+ descendants without expanding the polling payload.
  const rootPath = "/sessions/main.jsonl";
  const childPath = "/sessions/child-0.jsonl";
  const sessions = [
    { path: rootPath, header: { id: "main", cwd: "/project" }, stat: { mtimeMs: 100 }, state: "parado", title: "Main" },
    ...Array.from({ length: 23 }, (_, index) => ({ path: `/sessions/child-${index}.jsonl`, header: { id: `child-${index}`, cwd: "/project", parentSession: rootPath }, stat: { mtimeMs: 200 - index }, state: "parado", title: `Child ${index}` })),
    ...Array.from({ length: 22 }, (_, index) => ({ path: `/sessions/grandchild-${index}.jsonl`, header: { id: `grandchild-${index}`, cwd: "/project", parentSession: childPath }, stat: { mtimeMs: 300 - index }, state: "parado", title: `Grandchild ${index}` })),
  ];
  const service = createTreeService({
    getProjects: async () => [{ id: "p", cwd: "/project" }],
    getOrca: async () => ({ available: false }), getSessions: async () => sessions,
    getLive: async () => [], now: () => 1000,
  });
  const tree = await service.get();
  assert.equal(tree.projects[0].envs[0].pis[0].children.length, 20);
  assert.equal(tree.projects[0].envs[0].pis[0].childrenTotal, 23);
  assert.equal(tree.projects[0].envs[0].pis[0].childrenMore, 3);
  assert.match(treeSource, /left: 3000/);
  const page = await service.getChildren(rootPath, 20);
  assert.equal(page.children.length, 3);
  const nestedPage = await service.getChildren(childPath, 20);
  assert.equal(nestedPage.children.length, 2);
  const chain = await service.getSessionChain("/sessions/grandchild-0.jsonl");
  assert.deepEqual(chain.chain.map((item) => item.sessionPath), [rootPath, childPath, "/sessions/grandchild-0.jsonl"]);
  service.close();
});

test("explicit child-page continuation and selected chains work beyond depth eight", async () => {
  const paths = Array.from({ length: 11 }, (_, index) => `/sessions/deep-${index}.jsonl`);
  const sessions = paths.map((path, index) => ({
    path, header: { id: `deep-${index}`, cwd: "/project", ...(index ? { parentSession: paths[index - 1] } : {}) },
    stat: { mtimeMs: 100 + index }, state: "parado", title: `Depth ${index}`,
  }));
  const service = createTreeService({
    getProjects: async () => [{ id: "p", cwd: "/project" }],
    getOrca: async () => ({ available: false }), getSessions: async () => sessions, getLive: async () => [], now: () => 1000,
  });
  const tree = await service.get();
  let node = tree.projects[0].envs[0].pis[0];
  for (let depth = 1; depth < 8; depth++) node = node.children[0];
  assert.equal(node.children.length, 0);
  assert.equal(node.childrenMore, 1, "depth-eight node advertises direct page continuation");
  const page = await service.getChildren(paths[7], node.childrenOffset);
  assert.equal(page.children[0].sessionPath, paths[8]);
  assert.equal(page.children[0].childrenMore, 1, "page result retains another level of continuation");
  const deeper = await service.getChildren(paths[8], page.children[0].childrenOffset);
  assert.equal(deeper.children[0].sessionPath, paths[9]);
  const deepest = await service.getChildren(paths[9], deeper.children[0].childrenOffset);
  assert.equal(deepest.children[0].sessionPath, paths[10]);
  const chain = await service.getSessionChain(paths[10]);
  assert.deepEqual(chain.chain.map((item) => item.sessionPath), paths);
  service.close();
});

test("active descendants beyond depth eight propagate and own urgency remains accessible", async () => {
  const paths = Array.from({ length: 10 }, (_, index) => `/sessions/activity-${index}.jsonl`);
  const sessions = paths.map((path, index) => ({
    path, header: { id: `activity-${index}`, cwd: "/project", ...(index ? { parentSession: paths[index - 1] } : {}) },
    stat: { mtimeMs: 100 + index }, state: index === 9 ? "fazendo" : "parado", title: `Depth ${index}`,
  }));
  const service = createTreeService({
    getProjects: async () => [{ id: "p", cwd: "/project" }],
    getOrca: async () => ({ available: false }), getSessions: async () => sessions, getLive: async () => [], now: () => 1000,
  });
  const tree = await service.get();
  const root = tree.projects[0].envs[0].pis[0];
  assert.equal(root.descendantWorking, true);
  const row = treePiRow({ ...root, pendingQuestions: { total: 1, blocking: 1 }, children: [] }, { baseline: 0, seen: {} }, 1000);
  assert.equal(row.state, "working");
  assert.match(row.tooltip, /precisa de você/);
  service.close();
});

test("tree-derived Subagentes preserves waiting and urgent semantic states", () => {
  const body = functionBody("selectedSubagents");
  const card = functionBody("subCard");
  assert.match(body, /tree\.stateOf\(item\.sessionPath\)/);
  assert.match(body, /const semanticState = tree\.stateOf\(item\.sessionPath\)/);
  assert.match(body, /status: item\.raw\?\.error \? "error" : semanticState === "working" \|\| semanticState === "attention" \? "running" : semanticState === "urgent" \? "waiting"/);
  assert.match(body, /phase: item\.raw\?\.error \? "error" : semanticState === "urgent" \? "waiting"/);
  assert.match(body, /indicatorState: semanticState === "urgent" \? "urgent"/);
  assert.match(body, /return \[\.\.\.grouped, \.\.\.current\.filter/);
  assert.match(card, /aria-label=[\s\S]*precisa de você/);
  assert.match(app, /waiting: "aguardando"/);
  assert.match(app, /counts\.waiting/);
});

test("all subagent title fallbacks are capped at seven words", async () => {
  const longPrompt = "one two three four five six seven eight nine ten";
  const titles = createTitleIndex({
    statFile: async () => ({ mtimeMs: 1, size: 1 }),
    readLines: async function* () { yield JSON.stringify({ type: "user", message: { role: "user", content: longPrompt } }); },
  });
  const result = await titles.subagentTitle("child", { parentSession: "" }, "scout#abcd1234");
  assert.ok(result.title.trim().split(/\s+/).length <= 7);
  assert.ok(result.title.length > 0);
  const fallback = await titles.subagentTitle("child", {}, "very long agent type name has many words");
  assert.ok(fallback.title.split(/\s+/).length <= 7);
  assert.match(await readFile(new URL("../lib-server/session-titles.mjs", import.meta.url), "utf8"), /shortLabel\(stripPictographs\(args\.description\) \|\| stripPictographs\(args\.name\)\)/);
});

test("working descendants surface on parents without hiding own urgency", () => {
  const item = {
    sessionPath: "/main", title: "Main", raw: {}, pendingQuestions: { total: 1, blocking: 1 }, children: [
      { sessionPath: "/child", title: "Child", isSubagent: true, raw: { busy: true }, pendingQuestions: {}, children: [
        { sessionPath: "/grandchild", title: "Grandchild", isSubagent: true, raw: { busy: true }, pendingQuestions: {}, children: [] },
      ] },
    ],
  };
  const row = treePiRow(item, { baseline: 0, seen: {} }, 1000);
  assert.equal(row.state, "working");
  assert.match(row.tooltip, /precisa de você/);
  const attention = treePiRow({ ...item, pendingQuestions: { total: 1, blocking: 0 } }, { baseline: 0, seen: {} }, 1000);
  assert.equal(attention.state, "working");
  assert.match(attention.tooltip, /precisa de resposta/);
});

test("waiting tree-derived subagent timing never looks completed", () => {
  assert.deepEqual(subagentTiming({ phase: "waiting", elapsed: 60_000, endedAt: null }), { text: "aguardando", stalled: null });
});

test("main-chat grouping removes only the intermediate count folder", () => {
  assert.match(sidebar, /make\("button", "tl-head"/);
  assert.match(sidebar, /row\.append\([^\n]*tl-head/);
  assert.doesNotMatch(sidebar, /body\.append\(make\("button", "tl-head"/);
  assert.match(sidebar, /listKey = `l:\$\{project\.id\}\/\$\{env\.key\}`/);
  assert.match(sidebar, /const models = \[\.\.\.env\.pis, \.\.\.extras\]\.map\(\(pi\) => \(\{ key: `pi:\$\{pi\.sessionPath\}`/);
  assert.match(sidebar, /body\.append\(make\("div", "tl-list"\)\)/);
  assert.match(sidebar, /reconcileChildren\(list, models, hooks\)/, "main-chat rows are direct siblings in the worktree list");
  assert.match(sidebar, /row\.append\([^\n]*make\("button", "tl-head"/);
  assert.doesNotMatch(sidebar, /body\.append\(make\("button", "tl-head"/);
  assert.match(sidebar, /hide\(list, !listOpen && total > 0\)/, "list collapse remains independent of environment collapse");
  assert.match(sidebar, /pi\.children/);
});

test("Subagentes resolves the selected main-chat root and includes descendant pages", () => {
  assert.match(controller, /rootFor\(path\)/);
  assert.match(controller, /descendants\(path\)/);
  assert.match(controller, /resolveRoot\(path\)/);
  assert.match(controller, /loadDescendants\(path\)/);
  assert.match(controller, /fetchAncestors\(pi\.sessionPath\)/);
  assert.match(app, /tree\.rootFor\(/);
  assert.match(app, /tree\.descendants\(/);
  assert.match(server, /getSessionChain/);
  assert.match(treeSource, /getChildren/);
});

test("tree node cap is visible and does not leave inert pagination", () => {
  assert.match(sidebar, /childrenLimited/);
  assert.match(sidebar, /Limite de 3\.000 sessões atingido/);
  assert.match(controller, /item\.childrenLimited = true/);
  assert.match(controller, /item\.childrenMore = 0/);
});

test("working and urgent states use square indicators and the composer is slightly shorter", () => {
  const working = styles.match(/\.state\[data-state="working"\]::before\s*\{([^}]+)\}/)?.[1] ?? "";
  const urgent = styles.match(/\.state\[data-state="urgent"\]::before\s*\{([^}]+)\}/)?.[1] ?? "";
  const composer = styles.match(/\.composer\s*\{([^}]+)\}/)?.[1] ?? "";
  const input = styles.match(/\.composer textarea\s*\{([^}]+)\}/)?.[1] ?? "";
  const selected = styles.match(/\.session-item\.active\s*\{([^}]+)\}/)?.[1] ?? "";
  assert.match(working, /width:\s*8px/);
  assert.match(working, /height:\s*8px/);
  assert.match(working, /animation:\s*spin/);
  assert.match(styles, /\.state\[data-state="working"\]\s*\{[^}]*color:\s*var\(--c-blue\)/s);
  assert.match(urgent, /border-radius:\s*2px/);
  assert.match(urgent, /background:\s*var\(--c-red\)/);
  assert.doesNotMatch(urgent, /animation/);
  assert.doesNotMatch(styles, /state-pulse|state-braille/);
  assert.match(composer, /padding:\s*10px 12px 8px 18px/);
  assert.match(input, /max-height:\s*260px/);
  assert.match(selected, /var\(--c-blue\)/);
});

// Behavior: authenticated child-page and session-chain queries return their requested descendants; expect validation/not-found status codes at the HTTP boundary.
// Why: pure tree-service coverage cannot catch route authentication or Windows query-string encoding regressions.
test("GET /api/tree serves authenticated child pages and complete ancestor chains", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "pi-studio-tree-query-"));
  const names = [
    "PI_AGENT_DIR", "PI_PROJECT_ROOTS", "PI_WEB_HOST", "PI_WEB_PORT", "PI_WEB_PI_BIN", "PI_WEB_PI_BIN_ARGS",
    "PI_STUDIO_ORCA_BIN", "PI_STUDIO_ORCA_BIN_ARGS", "PI_STUDIO_PS_BIN", "PI_STUDIO_PS_BIN_ARGS",
    "FAKE_ORCA_STATE", "FAKE_PS_STATE", "HOME", "USERPROFILE", "XDG_CONFIG_HOME",
  ];
  const prior = Object.fromEntries(names.map((key) => [key, process.env[key]]));
  let app;
  let server;
  let port = null;
  let started = false;
  try {
    const agentDir = path.join(tmp, "agent");
    const roots = path.join(tmp, "roots");
    const project = path.join(roots, "project");
    const sessionDir = path.join(agentDir, "sessions", "--query-test--");
    const home = path.join(tmp, "home");
    const xdg = path.join(tmp, "xdg");
    await Promise.all([mkdir(project, { recursive: true }), mkdir(sessionDir, { recursive: true }), mkdir(home, { recursive: true }), mkdir(xdg, { recursive: true })]);
    await writeFile(path.join(project, "package.json"), "{}\n");

    const mainSession = path.join(sessionDir, "main.jsonl");
    const childPaths = Array.from({ length: 23 }, (_, index) => path.join(sessionDir, `child-${index}.jsonl`));
    const grandchildPaths = [0, 1].map((index) => path.join(sessionDir, `grandchild-${index}.jsonl`));
    const header = (id, parentSession) => JSON.stringify({
      type: "session", id, cwd: project, timestamp: new Date().toISOString(), ...(parentSession ? { parentSession } : {}),
    });
    await writeFile(mainSession, `${header("main")}\n${JSON.stringify({ type: "message", message: { role: "user", content: "Synthetic parent prompt" } })}\n`);
    await Promise.all(childPaths.map((file, index) => writeFile(file, `${header(`child-${index}`, mainSession)}\n${JSON.stringify({ type: "message", message: { role: "user", content: `Synthetic child ${index}` } })}\n`)));
    await Promise.all(grandchildPaths.map((file, index) => writeFile(file, `${header(`grandchild-${index}`, childPaths[0])}\n${JSON.stringify({ type: "message", message: { role: "user", content: `Synthetic grandchild ${index}` } })}\n`)));

    const orcaState = path.join(tmp, "orca.json");
    const psState = path.join(tmp, "ps.json");
    await writeFile(orcaState, JSON.stringify({ mode: "normal", worktrees: [{ path: project, repoId: "synthetic", displayName: "Synthetic", isMainWorktree: true }] }));
    await writeFile(psState, JSON.stringify({ format: "csv", rows: [] }));
    Object.assign(process.env, {
      PI_AGENT_DIR: agentDir, PI_PROJECT_ROOTS: roots, PI_WEB_HOST: "127.0.0.1", PI_WEB_PORT: "0",
      HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: xdg,
      PI_WEB_PI_BIN: process.execPath, PI_WEB_PI_BIN_ARGS: JSON.stringify([path.resolve("test/fake-pi-rpc.mjs")]),
      PI_STUDIO_ORCA_BIN: process.execPath, PI_STUDIO_ORCA_BIN_ARGS: JSON.stringify([path.resolve("test/fake-orca.mjs")]), FAKE_ORCA_STATE: orcaState,
      PI_STUDIO_PS_BIN: process.execPath, PI_STUDIO_PS_BIN_ARGS: JSON.stringify([path.resolve("test/fake-ps.mjs")]), FAKE_PS_STATE: psState,
    });

    app = await import(`../server.mjs?tree-query-${process.pid}-${Date.now()}`);
    server = await app.startServer(0, "127.0.0.1");
    started = true;
    port = server.address().port;
    const base = `http://127.0.0.1:${port}`;
    const page = await fetch(base);
    const token = (await page.text()).match(/name="pi-studio-token" content="([a-f0-9]+)"/)?.[1];
    assert.ok(token, "the local page provides its API token");
    const auth = { "x-pi-studio-token": token };
    const queryUrl = (params) => {
      const query = new URLSearchParams(params);
      return `${base}/api/tree?${query}`;
    };

    // Authentication applies to query modes just as it does to the ordinary tree endpoint.
    assert.equal((await fetch(queryUrl({ parent: mainSession, offset: "20" }))).status, 401);

    // The final parent page returns the three remaining lightweight records, not their nested payloads.
    const pageResponse = await fetch(queryUrl({ parent: mainSession, offset: "20" }), { headers: auth });
    assert.equal(pageResponse.status, 200);
    const pageBody = await pageResponse.json();
    assert.equal(pageBody.total, 23);
    assert.equal(pageBody.offset, 20);
    assert.equal(pageBody.children.length, 3);
    assert.ok(pageBody.children.every((child) => typeof child.sessionPath === "string" && Array.isArray(child.children) && child.children.length === 0));

    // A selected child's page still exposes its own grandchildren through the same endpoint.
    const nestedResponse = await fetch(queryUrl({ parent: childPaths[0], offset: "0" }), { headers: auth });
    assert.equal(nestedResponse.status, 200);
    const nestedBody = await nestedResponse.json();
    assert.equal(nestedBody.total, 2);
    assert.deepEqual(nestedBody.children.map((child) => child.sessionPath).sort(), grandchildPaths.sort());

    // A session query returns the full root-to-selected-session chain, including Windows paths intact.
    const chainResponse = await fetch(queryUrl({ session: grandchildPaths[0] }), { headers: auth });
    assert.equal(chainResponse.status, 200);
    assert.deepEqual((await chainResponse.json()).chain.map((item) => item.sessionPath), [mainSession, childPaths[0], grandchildPaths[0]]);

    // Invalid selectors/offsets fail as client errors; an absent parent is not found.
    assert.equal((await fetch(queryUrl({ parent: mainSession, offset: "-1" }), { headers: auth })).status, 400);
    assert.equal((await fetch(queryUrl({ offset: "0" }), { headers: auth })).status, 400);
    assert.equal((await fetch(queryUrl({ session: "" }), { headers: auth })).status, 400);
    assert.equal((await fetch(queryUrl({ parent: path.join(sessionDir, "unknown.jsonl") }), { headers: auth })).status, 404);
    // A session file not written yet (PI writes on the first message) answers { missing: true }, not an error.
    const unknown = await fetch(queryUrl({ session: path.join(sessionDir, "unknown.jsonl") }), { headers: auth });
    assert.equal(unknown.status, 200);
    assert.deepEqual(await unknown.json(), { missing: true });
  } finally {
    if (app && started) {
      await app.stopServer().catch(() => {});
      await assert.rejects(fetch(`http://127.0.0.1:${port}/`), (error) => /fetch failed|ECONNREFUSED/i.test(String(error.message)), "the run-owned ephemeral listener must be closed");
    }
    for (const [key, value] of Object.entries(prior)) value === undefined ? delete process.env[key] : process.env[key] = value;
    await rm(tmp, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
    await assert.rejects(access(tmp), { code: "ENOENT" }, "the run-owned temporary tree must be removed");
  }
});
