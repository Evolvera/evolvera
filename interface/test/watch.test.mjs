// GET /api/sessions/watch + readSessionWatch/resolveWatchPath: following a session file another PI writes (owned temp dirs only).
import assert from "node:assert/strict";
import { statSync } from "node:fs";
import { appendFile, mkdir, mkdtemp, realpath, rm, symlink, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";

const tmp = await mkdtemp(path.join(os.tmpdir(), "pi-studio-watch-"));
const agentDir = path.join(tmp, "agent");
const sessionsRoot = path.join(agentDir, "sessions");
const outside = path.join(tmp, "outside");
const dir = path.join(sessionsRoot, "--w--");
for (const folder of [dir, outside]) await mkdir(folder, { recursive: true });

Object.assign(process.env, { PI_AGENT_DIR: agentDir, PI_WEB_PROJECT_LIMIT: "3", PI_WEB_PI_BIN: process.execPath });
delete process.env.PI_WEB_HOST;
const server = await import("../server.mjs");

after(() => rm(tmp, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }));

const line = (value) => `${JSON.stringify(value)}\n`;
const user = (id, text = "oi") => ({ type: "message", id, message: { role: "user", content: text } });
const reply = (id, text = "pronto", stopReason = "stop") => ({ type: "message", id, message: { role: "assistant", stopReason, content: [{ type: "text", text }] } });
let counter = 0;
async function file(content, name = `s${++counter}.jsonl`, folder = dir) {
  const target = path.join(folder, name);
  await writeFile(target, content);
  return target;
}

describe("resolveWatchPath", () => {
  test("accepts a .jsonl file inside the sessions root and returns its real path", async () => {
    const target = await file(line({ type: "session", id: "h" }));
    assert.equal(await server.resolveWatchPath(target), await realpath(target));
    assert.equal(await server.resolveWatchPath(target, sessionsRoot), await realpath(target));
  });

  test("rejects anything that is not an absolute .jsonl path (400)", async () => {
    for (const bad of [undefined, null, "", 42, "relative/s.jsonl", "..\\s.jsonl", path.join(dir, "notes.txt"), path.join(dir, `a${String.fromCharCode(0)}b.jsonl`)]) {
      await assert.rejects(server.resolveWatchPath(bad), { statusCode: 400 }, String(bad));
    }
  });

  test("rejects traversal and files outside the sessions root (403)", async () => {
    const stray = await file(line({ type: "session" }), "stray.jsonl", outside);
    await assert.rejects(server.resolveWatchPath(stray), { statusCode: 403 });
    await assert.rejects(server.resolveWatchPath(path.join(dir, "..", "..", "..", "outside", "stray.jsonl")), { statusCode: 403 });
    await assert.rejects(server.resolveWatchPath(path.join(sessionsRoot, "..", "agent", "..", "outside", "stray.jsonl")), { statusCode: 403 });
    // The root itself is not a file inside it.
    await assert.rejects(server.resolveWatchPath(`${sessionsRoot}.jsonl`), { statusCode: 403 });
  });

  test("a symlink inside the root that points outside is refused (403)", async (t) => {
    const stray = await file(line({ type: "session" }), "linked.jsonl", outside);
    const link = path.join(dir, "link.jsonl");
    try {
      await symlink(stray, link, "file");
    } catch {
      t.skip("symlinks are not permitted here");
      return;
    }
    await assert.rejects(server.resolveWatchPath(link), { statusCode: 403 });
  });

  test("a missing file or a directory named like a session is 404", async () => {
    await assert.rejects(server.resolveWatchPath(path.join(dir, "missing.jsonl")), { statusCode: 404 });
    const folder = path.join(dir, "folder.jsonl");
    await mkdir(folder);
    await assert.rejects(server.resolveWatchPath(folder), { statusCode: 404 });
  });
});

describe("readSessionWatch", () => {
  test("empty file: nothing yet", async () => {
    const target = await file("");
    const result = await server.readSessionWatch(target, 0);
    assert.deepEqual([result.entries, result.offset, result.size, result.reset, result.truncated, result.state], [[], 0, 0, false, false, "nova"]);
  });

  test("whole file first, then only what was appended after the returned offset", async () => {
    const first = line({ type: "session", id: "h" }) + line(user("1")) + line(reply("2"));
    const target = await file(first);
    const one = await server.readSessionWatch(target, 0);
    assert.deepEqual(one.entries.map((entry) => entry.id), ["h", "1", "2"]);
    assert.equal(one.offset, Buffer.byteLength(first));
    assert.equal(one.state, "pronto");
    assert.ok(one.mtimeMs > 0);
    assert.deepEqual((await server.readSessionWatch(target, one.offset)).entries, [], "caught up");
    await appendFile(target, line(user("3", "çã")));
    const two = await server.readSessionWatch(target, one.offset);
    assert.deepEqual(two.entries.map((entry) => entry.id), ["3"]);
    assert.equal(two.offset, one.offset + Buffer.byteLength(line(user("3", "çã"))), "offsets count bytes, not characters");
  });

  test("a line still being written is held back until it is complete", async () => {
    const head = line(user("1"));
    const target = await file(head);
    const whole = line(user("2", "texto completo"));
    const cut = Math.floor(whole.length / 2);
    await appendFile(target, whole.slice(0, cut));
    const partial = await server.readSessionWatch(target, 0);
    assert.deepEqual([partial.entries.map((entry) => entry.id), partial.offset], [["1"], Buffer.byteLength(head)]);
    assert.deepEqual((await server.readSessionWatch(target, partial.offset)).entries, [], "still partial");
    await appendFile(target, whole.slice(cut));
    const done = await server.readSessionWatch(target, partial.offset);
    assert.deepEqual([done.entries.map((entry) => entry.id), done.offset], [["2"], Buffer.byteLength(head + whole)]);
  });

  test("a final line without newline is returned once it parses as a whole object", async () => {
    const target = await file(line(user("1")) + JSON.stringify(user("2")));
    const result = await server.readSessionWatch(target, 0);
    assert.deepEqual(result.entries.map((entry) => entry.id), ["1", "2"]);
    assert.equal(result.offset, statSync(target).size);
    await appendFile(target, "\n");
    assert.deepEqual((await server.readSessionWatch(target, result.offset)).entries, [], "the newline alone adds nothing");
  });

  test("malformed and non-object lines are skipped but consumed", async () => {
    const text = `${line(user("1"))}{broken\n42\n[1]\nnull\n\n${line(user("2"))}`;
    const target = await file(text);
    const result = await server.readSessionWatch(target, 0);
    assert.deepEqual(result.entries.map((entry) => entry.id), ["1", "2"]);
    assert.equal(result.offset, Buffer.byteLength(text));
  });

  test("a cursor past the end (file replaced) starts over", async () => {
    const target = await file(line(user("1")));
    const result = await server.readSessionWatch(target, 9999);
    assert.deepEqual([result.reset, result.entries.map((entry) => entry.id)], [true, ["1"]]);
  });

  test("the cap bounds one call: it stops at the last complete line and the next call continues", async () => {
    const lines = ["a", "b", "c", "d", "e", "f"].map((id) => line(user(id, "x".repeat(40))));
    const head = line({ type: "session", id: "h" });
    const target = await file(head + lines.join(""));
    const cap = lines[0].length * 2 + 10;
    const collected = [];
    let offset = Buffer.byteLength(head); // a client that already rendered the header
    for (let call = 0; call < 10; call++) {
      const result = await server.readSessionWatch(target, offset, { cap });
      collected.push(...result.entries.map((entry) => entry.id));
      if (result.offset === offset) break;
      offset = result.offset;
    }
    assert.deepEqual(collected, ["a", "b", "c", "d", "e", "f"]);
  });

  test("a line bigger than the cap is skipped and the stream recovers on the next line", async () => {
    const huge = line(user("big", "y".repeat(300)));
    const head = line(user("1"));
    const target = await file(head + huge + line(user("2")));
    const cap = 100;
    const seen = ["1"];
    let offset = Buffer.byteLength(head);
    for (let call = 0; call < 30; call++) {
      const result = await server.readSessionWatch(target, offset, { cap });
      seen.push(...result.entries.map((entry) => entry.id));
      if (result.offset === offset) break;
      offset = result.offset;
    }
    assert.deepEqual(seen, ["1", "2"]);
    assert.equal(offset, statSync(target).size);
  });

  test("a huge file starts at its tail, on a line boundary", async () => {
    const lines = Array.from({ length: 40 }, (_, index) => line(user(`m${index}`, "z".repeat(50))));
    const target = await file(lines.join(""));
    const cap = lines[0].length * 5 + 7;
    const result = await server.readSessionWatch(target, 0, { cap });
    assert.equal(result.truncated, true);
    assert.deepEqual(result.entries.map((entry) => entry.id), ["m35", "m36", "m37", "m38", "m39"]);
    assert.equal(result.offset, Buffer.byteLength(lines.join("")));
  });

  test("a huge file whose tail is one single line yields nothing but still moves to the end", async () => {
    const giant = JSON.stringify(user("giant", "g".repeat(500)));
    for (const ending of ["\n", ""]) {
      const target = await file(line(user("1")) + giant + ending);
      const result = await server.readSessionWatch(target, 0, { cap: 100 });
      assert.deepEqual([result.entries, result.truncated], [[], true], JSON.stringify(ending));
      assert.equal(result.offset, statSync(target).size);
    }
  });

  test("state follows the last message and the clock", async () => {
    const running = await file(line(user("1")));
    await utimes(running, 1_700_000_000, 1_700_000_000);
    const at = 1_700_000_000_000;
    assert.equal((await server.readSessionWatch(running, 0, { now: at + 10_000 })).state, "fazendo");
    assert.equal((await server.readSessionWatch(running, 0, { now: at + 600_000 })).state, "parado");
    const errored = await file(line(user("1")) + line(reply("2", "falhou", "error")));
    assert.equal((await server.readSessionWatch(errored, 0)).state, "erro");
  });

  test("a missing file rejects", async () => {
    await assert.rejects(server.readSessionWatch(path.join(dir, "gone.jsonl"), 0), { code: "ENOENT" });
  });
});

describe("GET /api/sessions/watch", () => {
  let listening;
  let base;
  let token;
  const get = (pathname, { headers = {}, method = "GET" } = {}) => fetch(`${base}${pathname}`, { method, headers: { "x-pi-studio-token": token, ...headers } });
  const watch = (target, since) => get(`/api/sessions/watch?path=${encodeURIComponent(target)}${since === undefined ? "" : `&since=${since}`}`);

  before(async () => {
    listening = await server.startServer(0);
    base = `http://127.0.0.1:${listening.address().port}`;
    token = (await (await fetch(`${base}/`)).text()).match(/name="pi-studio-token" content="([a-f0-9]+)"/)[1];
  });
  after(() => server.stopServer());

  test("requires the token and a same-origin request like every other route", async () => {
    const target = await file(line(user("1")));
    const url = `/api/sessions/watch?path=${encodeURIComponent(target)}`;
    assert.equal((await fetch(`${base}${url}`)).status, 401);
    assert.equal((await fetch(`${base}${url}`, { headers: { "x-pi-studio-token": "0".repeat(64) } })).status, 401);
    assert.equal((await get(url, { headers: { origin: "http://evil.example" } })).status, 403);
    assert.equal((await get(url, { headers: { origin: base } })).status, 200);
  });

  test("returns entries, offset, size, mtime and state; incremental polling by offset", async () => {
    const target = await file(line({ type: "session", id: "h" }) + line(user("1")));
    const first = await (await watch(target)).json();
    assert.deepEqual(first.entries.map((entry) => entry.id), ["h", "1"]);
    assert.deepEqual([first.reset, first.truncated, first.state], [false, false, "fazendo"]);
    assert.equal(first.size, first.offset);
    await appendFile(target, line(reply("2")));
    const second = await (await watch(target, first.offset)).json();
    assert.deepEqual(second.entries.map((entry) => entry.id), ["2"]);
    assert.equal(second.state, "pronto");
    const none = await (await watch(target, second.offset)).json();
    assert.deepEqual(none.entries, []);
    assert.equal((await (await watch(target, 0)).json()).entries.length, 3, "since=0 is the same as omitting it");
  });

  test("rejects bad parameters, traversal, other extensions and missing files", async () => {
    const target = await file(line(user("1")));
    for (const since of ["-1", "abc", "1.5", "", "1234567890123456"]) assert.equal((await watch(target, since)).status, 400, `since=${since}`);
    assert.equal((await get("/api/sessions/watch")).status, 400);
    assert.equal((await get("/api/sessions/watch?path=relative.jsonl")).status, 400);
    assert.equal((await watch(path.join(dir, "notes.txt"))).status, 400);
    const stray = await file(line(user("x")), "stray2.jsonl", outside);
    assert.equal((await watch(stray)).status, 403);
    assert.equal((await watch(path.join(dir, "..", "..", "..", "outside", "stray2.jsonl"))).status, 403);
    assert.equal((await watch(path.join(dir, "missing.jsonl"))).status, 404);
    assert.equal((await get(`/api/sessions/watch?path=${encodeURIComponent(target)}`, { method: "POST" })).status, 405);
  });

  test("a file bigger than the per-call cap starts at its tail and the rest follows by offset", async () => {
    const big = "w".repeat(20_000);
    const count = Math.ceil((server.WATCH_CAP_BYTES * 1.5) / (big.length + 60));
    const lines = Array.from({ length: count }, (_, index) => line(user(`b${index}`, big)));
    const target = await file(lines.join(""));
    const first = await (await watch(target)).json();
    assert.equal(first.truncated, true);
    assert.equal(first.entries.at(-1).id, `b${count - 1}`);
    assert.ok(first.entries.length < count);
    assert.equal(first.offset, first.size);
    await appendFile(target, line(reply("tail")));
    const next = await (await watch(target, first.offset)).json();
    assert.deepEqual(next.entries.map((entry) => entry.id), ["tail"]);
    // A client far behind gets at most one cap per call and catches up call by call.
    const behind = await (await watch(target, 1)).json();
    assert.equal(behind.truncated, false);
    assert.ok(behind.offset > 1 && behind.offset <= 1 + server.WATCH_CAP_BYTES);
    assert.ok(behind.entries.length > 0 && behind.entries.length < count);
  });
});
