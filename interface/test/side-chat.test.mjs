// "Dúvidas" side PI: prompt/argv/command filter/registry (pure), then the real server with the fake PI (owned temp dirs only).
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { SIDE_MAX_SESSIONS, SIDE_TOOLS, buildSidePrompt, createSideRegistry, sideArgs, sideCommand, sideIdleMs } from "../lib-server/side-chat.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const fakeSession = (id, extra = {}) => ({ id, exited: false, streaming: false, stopped: 0, stop() { this.stopped += 1; }, ...extra });

describe("side prompt and argv", () => {
  // What: the prompt names the log, the sub-agent rule and the project. Expected: all three paths appear. Why: without them the side PI cannot find what is happening.
  test("buildSidePrompt points at the JSONL, its folder (sub-agents) and the project", () => {
    const prompt = buildSidePrompt({ sessionPath: "/s/dir/main.jsonl", cwd: "/work/proj" });
    assert.match(prompt, /\/s\/dir\/main\.jsonl/);
    assert.match(prompt, /parentSession/);
    assert.match(prompt, /\/work\/proj/);
    assert.match(prompt, /somente leitura/);
  });

  // What: the extra argv. Expected: exactly the ephemeral flag, the read-only allowlist and the prompt. Why: this is the read-only guarantee.
  test("sideArgs: --no-session, exactly --tools read,grep,find,ls, then the prompt", () => {
    assert.equal(SIDE_TOOLS, "read,grep,find,ls");
    assert.deepEqual(sideArgs("P"), ["--no-session", "--tools", "read,grep,find,ls", "--append-system-prompt", "P"]);
    assert.doesNotMatch(sideArgs("P").slice(0, 4).join(" "), /bash|edit|write/);
  });

  // What: idle limit. Expected: 10 min, shortened only under NODE_ENV=test. Why: production must not be tunable by a stray variable.
  test("sideIdleMs defaults to 10 minutes and only the test environment can shorten it", () => {
    assert.equal(sideIdleMs({}), 600_000);
    assert.equal(sideIdleMs({ PI_STUDIO_SIDE_IDLE_TEST_MS: "5" }), 600_000);
    assert.equal(sideIdleMs({ NODE_ENV: "test", PI_STUDIO_SIDE_IDLE_TEST_MS: "5" }), 5);
    assert.equal(sideIdleMs({ NODE_ENV: "test", PI_STUDIO_SIDE_IDLE_TEST_MS: "x" }), 600_000);
    assert.equal(sideIdleMs(), 600_000);
  });
});

describe("sideCommand", () => {
  // What: a question. Expected: trimmed, queued as follow-up, images/unknown fields dropped. Why: several questions must queue behind a running answer.
  test("a prompt becomes a trimmed follow-up without extra fields", () => {
    assert.deepEqual(sideCommand({ id: "q1", type: "prompt", message: "  oi  ", images: [1], streamingBehavior: "steer", extra: 1 }), { id: "q1", type: "prompt", message: "oi", streamingBehavior: "followUp" });
    assert.deepEqual(sideCommand({ type: "prompt", message: "oi", id: 5 }), { type: "prompt", message: "oi", streamingBehavior: "followUp" });
  });

  // What: harmless commands. Expected: allowed, reduced to type (+id). Why: the UI needs abort and state.
  test("abort, get_state and get_entries pass; nothing else does", () => {
    assert.deepEqual(sideCommand({ type: "abort", id: "a", junk: 1 }), { id: "a", type: "abort" });
    assert.deepEqual(sideCommand({ type: "get_state" }), { type: "get_state" });
    assert.deepEqual(sideCommand({ type: "get_entries", id: 3 }), { type: "get_entries" });
    for (const type of ["bash", "switch_session", "new_session", "fork", "clone", "set_model", "compact", "extension_ui_response", undefined]) {
      assert.throws(() => sideCommand({ type, command: "rm -rf /" }), (error) => error.statusCode === 403, String(type));
    }
  });

  // What: malformed input. Expected: 400. Why: explicit errors at the boundary.
  test("rejects non-objects, empty, huge and slash-command prompts with 400", () => {
    for (const bad of [null, "x", [], 7]) assert.throws(() => sideCommand(bad), (error) => error.statusCode === 400);
    for (const message of [undefined, "", "   ", 12, "x".repeat(8001), "/fast on", "  /skill:x"]) {
      assert.throws(() => sideCommand({ type: "prompt", message }), (error) => error.statusCode === 400, String(message).slice(0, 12));
    }
  });
});

describe("createSideRegistry", () => {
  // What: acquire twice. Expected: one session, `make` called once. Why: one side PI per conversation.
  test("acquire returns the live session of a key and creates a new one when it exited", () => {
    let made = 0;
    const registry = createSideRegistry({ now: () => 1 });
    const make = () => fakeSession(`s${++made}`);
    const first = registry.acquire("k", make);
    assert.equal(registry.acquire("k", make), first);
    assert.equal(made, 1);
    first.exited = true;
    const second = registry.acquire("k", make);
    assert.notEqual(second, first);
    assert.equal(registry.find("s1"), undefined);
    assert.equal(registry.find("s2"), second);
    assert.equal(registry.size(), 1);
  });

  // What: reap. Expected: only idle, non-answering sessions stop; touch renews. Why: nothing left running unused, never cut an answer.
  test("reap stops idle sessions, keeps streaming and touched ones", () => {
    let clock = 0;
    const registry = createSideRegistry({ idleMs: 100, now: () => clock });
    const idle = registry.acquire("a", () => fakeSession("a"));
    const busy = registry.acquire("b", () => fakeSession("b", { streaming: true }));
    const renewed = registry.acquire("c", () => fakeSession("c"));
    clock = 90;
    registry.touch("c");
    registry.touch("zzz");
    assert.deepEqual(registry.reap(99), []);
    clock = 150;
    assert.deepEqual(registry.reap(180), ["a"]);
    assert.equal(idle.stopped, 1);
    assert.equal(busy.stopped, 0);
    assert.equal(renewed.stopped, 0);
    assert.deepEqual(registry.reap(), []);
    assert.deepEqual(registry.reap(500), ["c"]);
    assert.equal(registry.size(), 1);
  });

  // What: more conversations than the cap. Expected: least recently used stops, newest stays. Why: bounded processes.
  test("past the cap the least recently used session stops", () => {
    let clock = 0;
    const registry = createSideRegistry({ max: 2, now: () => ++clock });
    const a = registry.acquire("a", () => fakeSession("a"));
    const b = registry.acquire("b", () => fakeSession("b"));
    registry.acquire("a", () => fakeSession("never"));
    const c = registry.acquire("c", () => fakeSession("c"));
    assert.equal(b.stopped, 1);
    assert.equal(a.stopped, 0);
    assert.equal(c.stopped, 0);
    assert.equal(registry.size(), 2);
    assert.equal(SIDE_MAX_SESSIONS, 6);
    assert.equal(createSideRegistry().size(), 0);
  });

  // What: exit and shutdown. Expected: remove forgets, pids lists live pids, stopAll stops all. Why: no process outlives the server.
  test("remove, pids and stopAll", () => {
    const registry = createSideRegistry();
    const a = registry.acquire("a", () => fakeSession("a", { proc: { pid: 11 } }));
    const b = registry.acquire("b", () => fakeSession("b"));
    assert.deepEqual(registry.pids(), [11]);
    registry.remove(a);
    assert.equal(registry.find("a"), undefined);
    registry.stopAll();
    assert.equal(b.stopped, 1);
    assert.equal(registry.size(), 0);
  });
});

describe("server: /api/side-chat with the fake PI", () => {
  let tmp, app, base, auth, argvFile, pidFile, sessionsDir, project, mainSession, childSession, psRows;
  const names = ["PI_AGENT_DIR", "PI_PROJECT_ROOTS", "PI_WEB_PI_BIN", "PI_WEB_PI_BIN_ARGS", "FAKE_PI_ARGV_FILE", "FAKE_PI_PID_FILE", "PI_STUDIO_PS_BIN", "PI_STUDIO_PS_BIN_ARGS", "FAKE_PS_ROWS", "NODE_ENV", "PI_STUDIO_ORCA_BIN"];
  const prior = Object.fromEntries(names.map((key) => [key, process.env[key]]));
  const header = (id, extra = {}) => JSON.stringify({ type: "session", id, timestamp: new Date().toISOString(), cwd: project, ...extra });
  const post = (route, body, headers = auth) => fetch(`${base}${route}`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });
  const sideChat = (sessionPath) => post("/api/side-chat", { sessionPath });
  const argvLines = async () => (await readFile(argvFile, "utf8").catch(() => "")).split("\n").filter(Boolean).map((line) => JSON.parse(line));
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

  // Reads an SSE stream until `done(events)` or the deadline; returns the parsed events.
  async function collect(sessionId, done, timeoutMs = 8000) {
    const controller = new AbortController();
    const res = await fetch(`${base}/api/sessions/${sessionId}/events`, { headers: { cookie: `pi-studio-token=${auth["x-pi-studio-token"]}` }, signal: controller.signal });
    const decoder = new TextDecoder();
    const events = [];
    let buffer = "";
    const deadline = Date.now() + timeoutMs;
    try {
      for await (const chunk of res.body) {
        buffer += decoder.decode(chunk, { stream: true });
        let index;
        while ((index = buffer.indexOf("\n\n")) !== -1) {
          const frame = buffer.slice(0, index);
          buffer = buffer.slice(index + 2);
          const event = /^event: (.*)$/m.exec(frame)?.[1];
          const data = /^data: (.*)$/m.exec(frame)?.[1];
          if (event && data) events.push({ event, payload: JSON.parse(data) });
        }
        if (done(events) || Date.now() > deadline) break;
      }
    } finally {
      controller.abort();
    }
    return events;
  }

  before(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "pi-side-chat-"));
    const agentDir = path.join(tmp, "agent");
    const roots = path.join(tmp, "roots");
    project = path.join(roots, "proj");
    sessionsDir = path.join(agentDir, "sessions", "--proj--");
    await Promise.all([mkdir(project, { recursive: true }), mkdir(sessionsDir, { recursive: true })]);
    await writeFile(path.join(project, "package.json"), "{}\n");
    mainSession = path.join(sessionsDir, "main.jsonl");
    childSession = path.join(sessionsDir, "child.jsonl");
    await writeFile(mainSession, `${header("main")}\n${JSON.stringify({ type: "message", message: { role: "user", content: "Tarefa" } })}\n`);
    await writeFile(childSession, `${header("child", { parentSession: mainSession })}\n`);
    await writeFile(path.join(sessionsDir, "nocwd.jsonl"), `${JSON.stringify({ type: "session", id: "nocwd" })}\n`);
    await writeFile(path.join(sessionsDir, "gone.jsonl"), `${header("gone", { cwd: path.join(tmp, "missing-dir") })}\n`);
    await writeFile(path.join(sessionsDir, "broken.jsonl"), "{broken\n");
    argvFile = path.join(tmp, "argv.jsonl");
    pidFile = path.join(tmp, "pids.txt");
    psRows = path.join(tmp, "ps.json");
    await writeFile(psRows, "[]");
    Object.assign(process.env, {
      NODE_ENV: "test", PI_AGENT_DIR: agentDir, PI_PROJECT_ROOTS: roots,
      PI_WEB_PI_BIN: process.execPath, PI_WEB_PI_BIN_ARGS: JSON.stringify([path.join(here, "fake-pi-rpc.mjs")]),
      FAKE_PI_ARGV_FILE: argvFile, FAKE_PI_PID_FILE: pidFile,
      PI_STUDIO_PS_BIN: process.execPath, PI_STUDIO_PS_BIN_ARGS: JSON.stringify([path.join(here, "fake-ps-pis.mjs")]), FAKE_PS_ROWS: psRows,
      PI_STUDIO_ORCA_BIN: process.execPath,
    });
    delete process.env.PI_WEB_HOST;
    app = await import("../server.mjs?side-chat");
    const server = await app.startServer(0, "127.0.0.1");
    base = `http://127.0.0.1:${server.address().port}`;
    const token = (await (await fetch(base)).text()).match(/name="pi-studio-token" content="([a-f0-9]+)"/)[1];
    auth = { "x-pi-studio-token": token };
  });

  after(async () => {
    await app?.stopServer().catch(() => {});
    for (const [key, value] of Object.entries(prior)) value === undefined ? delete process.env[key] : process.env[key] = value;
    await rm(tmp, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  });

  // What: first question's session. Expected: 200 + {session}, the fake PI saw exactly the read-only argv with the JSONL path in the prompt. Why: proves read-only at the spawn boundary.
  test("creates the side PI read-only: argv has --no-session, exactly --tools read,grep,find,ls and the JSONL path in the prompt", async () => {
    const res = await sideChat(mainSession);
    assert.equal(res.status, 200);
    const { session } = await res.json();
    assert.ok(session.id);
    assert.equal(session.side, true);
    assert.equal(session.cwd, path.resolve(project));
    await sleep(300);
    const [start] = await argvLines();
    const { argv } = start;
    assert.ok(argv.includes("--no-session"));
    assert.equal(argv[argv.indexOf("--tools") + 1], "read,grep,find,ls");
    assert.equal(argv.filter((arg) => arg === "--tools").length, 1);
    const prompt = argv[argv.indexOf("--append-system-prompt") + 1];
    assert.ok(prompt.includes(await realpath(mainSession)), "the prompt names the conversation log (real path)");
    assert.ok(prompt.includes(project), "and the project folder");
    for (const forbidden of ["bash", "edit", "write", "subagent", "Agent"]) assert.ok(!argv[argv.indexOf("--tools") + 1].includes(forbidden));
  });

  // What: 20 concurrent opens + a repeat. Expected: the same session id, still a single process. Why: one side PI per conversation, bounded processes.
  test("concurrent POSTs for one conversation share one session and one process", async () => {
    const before = (await argvLines()).length;
    const answers = await Promise.all(Array.from({ length: 20 }, () => sideChat(mainSession).then((res) => res.json())));
    assert.equal(new Set(answers.map((answer) => answer.session.id)).size, 1);
    assert.equal((await argvLines()).length, before, "no extra process was started");
    assert.equal((await (await sideChat(mainSession)).json()).session.id, answers[0].session.id);
  });

  // What: sidebar sources. Expected: the side session is absent from every listing the sidebar reads. Why: it must never look like a conversation.
  test("the side session never appears in the sidebar sources", async () => {
    const { session } = await (await sideChat(mainSession)).json();
    // The bootstrap carries the server log lines (which name every process the Studio starts); only its listings matter here.
    const get = async (route) => { const { logs, ...body } = await (await fetch(`${base}${route}`, { headers: auth })).json(); return JSON.stringify(body); };
    for (const route of ["/api/sessions", "/api/bootstrap", "/api/projects/status", "/api/resources", "/api/tree"]) {
      const text = await get(route);
      assert.ok(!text.includes(session.id), `${route} must not list the side session`);
    }
    assert.equal(JSON.parse(await get("/api/sessions")).sessions.some((item) => item.side), false);
    const health = JSON.parse(await get("/api/health"));
    assert.equal(health.sessions, 0, "the side session is not counted as a Studio session");
    const files = await readFile(path.join(sessionsDir, "main.jsonl"), "utf8");
    assert.ok(!files.includes(session.id));
  });

  // What: a question and 20 more at once. Expected: every one answered (queued), none lost, no crash. Why: the user may fire questions faster than answers.
  test("21 questions at once on one side chat are all answered", async () => {
    const { session } = await (await sideChat(mainSession)).json();
    const reading = collect(session.id, (events) => events.filter((e) => e.event === "rpc" && e.payload.type === "message_end" && e.payload.message?.role === "assistant").length >= 21);
    await sleep(150);
    const sent = await Promise.all(Array.from({ length: 21 }, (_, index) => post(`/api/sessions/${session.id}/command`, { type: "prompt", message: `pergunta ${index}`, streamingBehavior: "steer" })));
    assert.deepEqual([...new Set(sent.map((res) => res.status))], [202]);
    const events = await reading;
    const answers = events.filter((e) => e.event === "rpc" && e.payload.type === "message_end" && e.payload.message?.role === "assistant").map((e) => e.payload.message.content[0].text);
    for (let index = 0; index < 21; index += 1) assert.ok(answers.includes(`Fake PI: pergunta ${index}`), `pergunta ${index} answered`);
  });

  // What: dangerous RPC commands aimed at the side session. Expected: 403/400 and nothing reaches the PI. Why: --tools does not cover RPC `bash`.
  test("the command route refuses bash, session switches and slash commands for the side session", async () => {
    const { session } = await (await sideChat(mainSession)).json();
    for (const body of [{ type: "bash", command: "echo hacked > x.txt" }, { type: "switch_session", sessionPath: mainSession }, { type: "new_session" }]) {
      assert.equal((await post(`/api/sessions/${session.id}/command`, body)).status, 403, body.type);
    }
    for (const body of [{ type: "prompt", message: "/fast on" }, { type: "prompt" }]) assert.equal((await post(`/api/sessions/${session.id}/command`, body)).status, 400);
    assert.equal((await post(`/api/sessions/${session.id}/command`, { type: "get_state" })).status, 202);
    await sleep(150);
    assert.equal(await readFile(path.join(project, "x.txt"), "utf8").catch(() => "absent"), "absent");
  });

  // What: bad paths. Expected: 400/403/404/409 and no process. Why: only real conversation logs inside the sessions folder.
  test("invalid or foreign paths are rejected without starting a process", async () => {
    const before = (await argvLines()).length;
    const outside = path.join(tmp, "outside.jsonl");
    await writeFile(outside, `${header("outside")}\n`);
    const link = path.join(sessionsDir, "link.jsonl");
    const linked = await symlink(outside, link).then(() => true, () => false);
    const cases = [
      [{ sessionPath: "relative/main.jsonl" }, 400], [{ sessionPath: path.join(sessionsDir, "main.txt") }, 400], [{}, 400], [{ sessionPath: 5 }, 400],
      [{ sessionPath: outside }, 403], [{ sessionPath: path.join(sessionsDir, "..", "..", "..", "outside.jsonl") }, 403],
      [{ sessionPath: path.join(sessionsDir, "absent.jsonl") }, 404],
      [{ sessionPath: path.join(sessionsDir, "nocwd.jsonl") }, 409], [{ sessionPath: path.join(sessionsDir, "gone.jsonl") }, 409], [{ sessionPath: path.join(sessionsDir, "broken.jsonl") }, 409],
      ...(linked ? [[{ sessionPath: link }, 403]] : []),
    ];
    for (const [body, status] of cases) assert.equal((await post("/api/side-chat", body)).status, status, JSON.stringify(body));
    assert.equal((await post("/api/side-chat", "{nao json")).status, 400);
    assert.equal((await fetch(`${base}/api/side-chat`, { headers: auth })).status, 405);
    assert.equal((await fetch(`${base}/api/side-chat`, { method: "POST", body: "{}" })).status, 401);
    assert.equal((await argvLines()).length, before);
  });

  // What: the side PI's OS process in the process table. Expected: the tree ignores it. Why: a --no-session PI must not be matched to a conversation by start time.
  test("the tree does not mistake the side PI process for a live PI of a conversation", async () => {
    const stamp = new Date().toISOString();
    const candidate = path.join(sessionsDir, "candidate.jsonl");
    await writeFile(candidate, `${JSON.stringify({ type: "session", id: "candidate", timestamp: stamp, cwd: project })}\n${JSON.stringify({ type: "message", message: { role: "user", content: "Outra conversa" } })}\n`);
    const { session } = await (await sideChat(mainSession)).json();
    const [{ pid }] = (await argvLines()).slice(-1);
    await writeFile(psRows, JSON.stringify([{ ProcessId: pid, ParentProcessId: 1, CreationDate: stamp, CommandLine: `node C:/x/node_modules/@earendil-works/pi-coding-agent/dist/cli.js --mode rpc --no-session`, Name: "node.exe" }]));
    await sleep(1200);
    const tree = await (await fetch(`${base}/api/tree`, { headers: auth })).json();
    const pis = tree.projects.flatMap((p) => p.envs.flatMap((env) => env.pis));
    const found = pis.find((pi) => pi.title === "Outra conversa" || pi.path === candidate);
    assert.ok(found, "the candidate conversation is in the tree");
    assert.equal(found.live, null);
    assert.ok(session.id);
  });

  // What: idle stop then reuse. Expected: reaped after 10 min unused, new id + new process on the next open, old id gone; an answering one is kept. Why: nothing left running unused.
  test("an idle side PI is stopped and the next question starts a fresh one; an answering one is kept", async () => {
    const first = (await (await sideChat(mainSession)).json()).session;
    assert.deepEqual(app.reapSideChatsNow(Date.now() + 9 * 60_000), [], "9 minutes: still in use");
    await post(`/api/sessions/${first.id}/command`, { type: "prompt", message: "silent" });
    await sleep(200);
    assert.deepEqual(app.reapSideChatsNow(Date.now() + 11 * 60_000), [], "answering: never cut");
    const startedBefore = (await argvLines()).length;
    const pid = (await argvLines()).slice(-1)[0].pid;
    await post(`/api/sessions/${first.id}/command`, { type: "abort" });
    await sleep(100);
    // The fake PI never ends "silent"; this session stays `streaming`, so stop it the way the idle rule would once it ended.
    assert.equal((await post(`/api/sessions/${first.id}/stop`, {})).status, 202);
    await sleep(500);
    assert.equal(alive(pid), false);
    assert.equal((await post(`/api/sessions/${first.id}/command`, { type: "get_state" })).status, 404, "the old id is gone");
    const second = (await (await sideChat(mainSession)).json()).session;
    assert.notEqual(second.id, first.id);
    await sleep(300);
    assert.equal((await argvLines()).length, startedBefore + 1);
    assert.deepEqual(app.reapSideChatsNow(Date.now() + 11 * 60_000), [second.id]);
    await sleep(600);
    const third = (await (await sideChat(mainSession)).json()).session;
    assert.notEqual(third.id, second.id);
  });

  // What: switching the main conversation while an answer streams. Expected: two independent side sessions; the first still finishes. Why: each conversation keeps its own chat.
  test("two conversations have independent side sessions and the first one still answers after switching", async () => {
    const other = path.join(sessionsDir, "other.jsonl");
    await writeFile(other, `${header("other")}\n`);
    const one = (await (await sideChat(mainSession)).json()).session;
    const reading = collect(one.id, (events) => events.some((e) => e.event === "rpc" && e.payload.type === "agent_end"), 9000);
    await sleep(150);
    await post(`/api/sessions/${one.id}/command`, { type: "prompt", message: "demo" });
    const two = (await (await sideChat(other)).json()).session;
    assert.notEqual(two.id, one.id);
    assert.equal((await post(`/api/sessions/${two.id}/command`, { type: "prompt", message: "pergunta na outra" })).status, 202);
    const events = await collect(two.id, (list) => list.some((e) => e.event === "rpc" && e.payload.type === "agent_end"));
    assert.ok(events.some((e) => e.event === "rpc" && JSON.stringify(e.payload).includes("Fake PI: pergunta na outra")));
    const firstEvents = await reading;
    assert.ok(firstEvents.some((e) => e.event === "rpc" && e.payload.type === "agent_end"), "the first answer was not interrupted");
  });

  // What: server shutdown. Expected: every side PI process is gone. Why: no orphan processes.
  test("stopping the server stops the side PIs", async () => {
    const { session } = await (await sideChat(mainSession)).json();
    await sleep(300);
    const pids = (await readFile(pidFile, "utf8")).split("\n").filter(Boolean).map(Number);
    assert.ok(session.id && pids.length > 0);
    const live = pids.filter(alive);
    assert.ok(live.length > 0);
    await app.stopServer();
    await sleep(3500);
    assert.deepEqual(pids.filter(alive), []);
  });
});
