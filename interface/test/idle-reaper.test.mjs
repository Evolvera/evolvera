// Idle Studio-PI reaping (Miguel: nothing left running that is not used) — pure rules, child-activity probe, and the real server.
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { hasRecentChildActivity, idleThresholdMs, isIdleCandidate, reapIdle } from "../lib-server/idle-reaper.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const MIN = 60_000;
const idle = (over = {}) => ({ exited: false, streaming: false, clientCount: 0, waitingUi: false, lastViewedAt: 0, lastEventAt: 0, ...over });

test("threshold: default 15 min, clamped to 5–240, test-only ms override honored only under NODE_ENV=test", () => {
  // Default when unset or garbage: 15 minutes (production default from the contract).
  assert.equal(idleThresholdMs({}), 15 * MIN);
  assert.equal(idleThresholdMs({ PI_STUDIO_IDLE_PI_MINUTES: "abc" }), 15 * MIN);
  // Out-of-range values are clamped so nobody can reap after 1 minute in production or never.
  assert.equal(idleThresholdMs({ PI_STUDIO_IDLE_PI_MINUTES: "1" }), 5 * MIN);
  assert.equal(idleThresholdMs({ PI_STUDIO_IDLE_PI_MINUTES: "9999" }), 240 * MIN);
  assert.equal(idleThresholdMs({ PI_STUDIO_IDLE_PI_MINUTES: "30" }), 30 * MIN);
  // The ms override exists for tests only: ignored outside NODE_ENV=test, so the production floor stays.
  assert.equal(idleThresholdMs({ PI_STUDIO_IDLE_PI_TEST_MS: "50" }), 15 * MIN);
  assert.equal(idleThresholdMs({ PI_STUDIO_IDLE_PI_TEST_MS: "50", NODE_ENV: "test" }), 50);
  assert.equal(idleThresholdMs({ PI_STUDIO_IDLE_PI_TEST_MS: "-1", NODE_ENV: "test" }), 15 * MIN);
});

test("candidate only when idle, unwatched, no dialog, no recent view and no recent event", () => {
  const now = 100 * MIN;
  const t = 15 * MIN;
  // Fully idle for longer than the threshold → candidate.
  assert.equal(isIdleCandidate(idle(), now, t), true);
  // Each reason to keep it alive blocks the reap (work in progress or someone looking at it).
  assert.equal(isIdleCandidate(idle({ exited: true }), now, t), false);
  assert.equal(isIdleCandidate(idle({ streaming: true }), now, t), false);
  assert.equal(isIdleCandidate(idle({ clientCount: 1 }), now, t), false);
  assert.equal(isIdleCandidate(idle({ waitingUi: true }), now, t), false);
  assert.equal(isIdleCandidate(idle({ lastViewedAt: now - t + 1 }), now, t), false);
  // An RPC event inside the window (e.g. a background subagent notifying) keeps it too.
  assert.equal(isIdleCandidate(idle({ lastEventAt: now - t + 1 }), now, t), false);
  // Exactly at the boundary counts as idle (>=), so the timer is deterministic.
  assert.equal(isIdleCandidate(idle({ lastViewedAt: now - t, lastEventAt: now - t }), now, t), true);
});

test("child activity: a sub-PI of this session written recently keeps the parent alive", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "pi-reaper-children-"));
  try {
    const parent = path.join(dir, "parent.jsonl");
    const child = path.join(dir, "child.jsonl");
    const other = path.join(dir, "other.jsonl");
    await writeFile(parent, `${JSON.stringify({ type: "session", cwd: dir })}\n`);
    await writeFile(child, `${JSON.stringify({ type: "session", cwd: dir, parentSession: parent })}\n`);
    await writeFile(other, `${JSON.stringify({ type: "session", cwd: dir, parentSession: path.join(dir, "someone-else.jsonl") })}\n`);
    await writeFile(path.join(dir, "notes.txt"), "not a session");
    await writeFile(path.join(dir, "broken.jsonl"), "{not json\n");
    await mkdir(path.join(dir, "sub.jsonl"));
    const now = Date.now();
    // A child written just now (a background subagent working) → active.
    assert.equal(await hasRecentChildActivity(parent, { now, thresholdMs: 15 * MIN }), true);
    // The same child, last written long ago → not active (finished subagent).
    const old = (now - 60 * MIN) / 1000;
    await utimes(child, old, old);
    assert.equal(await hasRecentChildActivity(parent, { now, thresholdMs: 15 * MIN }), false);
    // Path spelling differences (case, separators) still match on Windows-style keys.
    await utimes(child, now / 1000, now / 1000);
    assert.equal(await hasRecentChildActivity(parent.toUpperCase().replaceAll("\\", "/"), { now, thresholdMs: 15 * MIN, platform: "win32" }), true);
    // POSIX keys are case-sensitive: a differently-cased parent path is a different session there.
    assert.equal(await hasRecentChildActivity(parent, { now, thresholdMs: 15 * MIN, platform: "linux" }), true);
    assert.equal(await hasRecentChildActivity(parent.toUpperCase(), { now, thresholdMs: 15 * MIN, platform: "linux" }), false);
    // A file that disappears between listing and stat/open is skipped, not an error (sessions get deleted while we scan).
    assert.equal(await hasRecentChildActivity(parent, { now, thresholdMs: 15 * MIN, statFile: async () => { throw new Error("ENOENT"); } }), false);
    assert.equal(await hasRecentChildActivity(parent, { now, thresholdMs: 15 * MIN, openFile: async () => { throw new Error("EBUSY"); } }), false);
    // No session file known, or a folder that vanished → no activity (never throws).
    assert.equal(await hasRecentChildActivity(null, { now, thresholdMs: 15 * MIN }), false);
    assert.equal(await hasRecentChildActivity(path.join(dir, "missing", "x.jsonl"), { now, thresholdMs: 15 * MIN }), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("reapIdle stops only idle sessions without active children and logs one line each; 50 sessions under a busy flip", async () => {
  const stopped = [];
  const logs = [];
  const make = (id, over = {}) => ({ id, cwd: `/p/${id}`, sessionFile: `/s/${id}.jsonl`, snapshot: () => idle(over), stop: () => stopped.push(id) });
  const sessions = [make("a"), make("b", { streaming: true }), make("c"), make("d", { clientCount: 2 })];
  // c has a live child (background subagent): kept even though the parent itself is quiet.
  const reaped = await reapIdle(sessions, { now: 100 * MIN, thresholdMs: 15 * MIN, childActive: async (file) => file === "/s/c.jsonl", log: (line) => logs.push(line) });
  assert.deepEqual(reaped, ["a"]);
  assert.deepEqual(stopped, ["a"]);
  assert.equal(logs.length, 1);
  assert.match(logs[0], /\/p\/a/);
  // A session that becomes busy while the async child check runs is re-checked and kept (no reap of fresh work).
  let flip = idle();
  const racing = { id: "r", cwd: "/p/r", sessionFile: "/s/r.jsonl", snapshot: () => flip, stop: () => stopped.push("r") };
  await reapIdle([racing], { now: 100 * MIN, thresholdMs: 15 * MIN, childActive: async () => { flip = idle({ streaming: true }); return false; }, log: () => {} });
  assert.equal(stopped.includes("r"), false);
  // A failing child probe keeps the session (fail safe: never kill on uncertainty).
  const unsure = make("u");
  await reapIdle([unsure], { now: 100 * MIN, thresholdMs: 15 * MIN, childActive: async () => { throw new Error("disk gone"); }, log: () => {} });
  assert.equal(stopped.includes("u"), false);
  // 50 idle sessions are all handled in one pass (bounded, no exceptions).
  const many = Array.from({ length: 50 }, (_, i) => make(`m${i}`));
  const reapedMany = await reapIdle(many, { now: 100 * MIN, thresholdMs: 15 * MIN, childActive: async () => false, log: () => {} });
  assert.equal(reapedMany.length, 50);
});

test("real server: an idle unwatched Studio PI is stopped, a watched one is kept, and reopening respawns it", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "pi-reaper-server-"));
  const project = path.join(tmp, "roots", "proj");
  await mkdir(project, { recursive: true });
  await writeFile(path.join(project, "package.json"), "{}");
  Object.assign(process.env, {
    NODE_ENV: "test", PI_STUDIO_IDLE_PI_TEST_MS: "200", PI_AGENT_DIR: path.join(tmp, "agent"), PI_PROJECT_ROOTS: path.join(tmp, "roots"),
    PI_WEB_HOST: "127.0.0.1", PI_WEB_PORT: "0", PI_WEB_PI_BIN: process.execPath, PI_WEB_PI_BIN_ARGS: JSON.stringify([path.join(here, "fake-pi-rpc.mjs")]),
  });
  const server = await import("../server.mjs?idle-reaper");
  try {
    const running = await server.startServer(0, "127.0.0.1");
    const base = `http://127.0.0.1:${running.address().port}`;
    const token = (await (await fetch(base)).text()).match(/name="pi-studio-token" content="([a-f0-9]+)"/)[1];
    const headers = { "x-pi-studio-token": token, "content-type": "application/json" };
    const open = async () => (await (await fetch(`${base}/api/sessions`, { method: "POST", headers, body: JSON.stringify({ cwd: project }) })).json()).session;
    const first = await open();
    const live = () => fetch(`${base}/api/sessions`, { headers }).then((r) => r.json()).then((d) => d.sessions.find((s) => s.id === first.id));
    // Watched (an SSE client attached): never reaped, however old.
    const controller = new AbortController();
    const events = await fetch(`${base}/api/sessions/${encodeURIComponent(first.id)}/events`, { headers, signal: controller.signal });
    await new Promise((resolve) => setTimeout(resolve, 400));
    await server.reapIdleStudioPIsNow();
    assert.equal((await live())?.exited ?? false, false);
    // Unwatched past the (test) threshold: stopped; its JSONL stays where it was.
    controller.abort();
    await events.body?.cancel().catch(() => {});
    // The SSE close is processed asynchronously (slower under coverage): poll the reaper for up to 15 s (it was slow once while other suites loaded the CPU).
    let reaped = [];
    for (let i = 0; i < 75 && !reaped.length; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      reaped = await server.reapIdleStudioPIsNow();
    }
    assert.deepEqual(reaped, [first.id], `not reaped; live state: ${JSON.stringify(await live())}`);
    await new Promise((resolve) => setTimeout(resolve, 300));
    // Reopening the project respawns a PI as before the reap.
    const second = await open();
    assert.ok(second?.id);
    assert.equal((await live())?.exited ?? true, true);
  } finally {
    await server.stopServer();
    delete process.env.PI_STUDIO_IDLE_PI_TEST_MS;
    await rm(tmp, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
});
