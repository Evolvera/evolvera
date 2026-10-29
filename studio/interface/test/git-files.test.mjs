// Git state of files (GET /api/sessions/:id/git-files). Every repository here is a real, disposable one created in a
// run-owned temp dir (with a bare "remote" as upstream); the PI is the fake RPC PI. Cleanup removes only those dirs.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = await mkdtemp(path.join(os.tmpdir(), "pi-studio-gitfiles-"));
const agentDir = path.join(tmp, "agent");
const roots = path.join(tmp, "roots");
await mkdir(agentDir, { recursive: true });
await mkdir(roots, { recursive: true });

Object.assign(process.env, { PI_WEB_HOST: "127.0.0.1", PI_WEB_PORT: "0", PI_AGENT_DIR: agentDir, PI_PROJECT_ROOTS: roots,
  PI_WEB_PI_BIN: process.execPath, PI_WEB_PI_BIN_ARGS: JSON.stringify([path.join(here, "fake-pi-rpc.mjs")]),
  GIT_AUTHOR_NAME: "Teste", GIT_AUTHOR_EMAIL: "teste@example.invalid", GIT_COMMITTER_NAME: "Teste", GIT_COMMITTER_EMAIL: "teste@example.invalid",
  GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0" });
const server = await import("../server.mjs");

const git = (cwd, ...args) => execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "core.autocrlf=false", "-c", "init.defaultBranch=main", "-C", cwd, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const put = async (cwd, name, content = name) => {
  await mkdir(path.dirname(path.join(cwd, name)), { recursive: true });
  await writeFile(path.join(cwd, name), content);
};
// A work repository with a bare upstream (tmp/<name>.git) and one pushed commit of `files`.
async function makeRepo(name, files, { upstream = true } = {}) {
  const dir = path.join(roots, name);
  await mkdir(dir, { recursive: true });
  git(dir, "init", "-q");
  for (const file of files) await put(dir, file);
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "inicial");
  if (upstream) {
    const bare = path.join(tmp, `${name}.git`);
    execFileSync("git", ["init", "-q", "--bare", bare]);
    git(dir, "remote", "add", "origin", bare);
    git(dir, "push", "-q", "-u", "origin", "main");
  }
  return dir;
}
const stateOf = (data) => Object.fromEntries(data.files.map((file) => [file.path, file.state]));
const reqOf = (data) => Object.fromEntries(Object.entries(data.requested).map(([key, value]) => [key, value.state]));

let base;
let token;
const api = async (route, init = {}) => {
  const response = await fetch(`${base}${route}`, { ...init, headers: { "x-pi-studio-token": token, ...(init.headers || {}) } });
  return { status: response.status, body: await response.json() };
};
const openSession = async (cwd) => (await (await fetch(`${base}/api/projects/open-path`, { method: "POST", headers: { "x-pi-studio-token": token, "content-type": "application/json" }, body: JSON.stringify({ cwd }) })).json()).session;

before(async () => {
  const running = await server.startServer(0, "127.0.0.1");
  base = `http://127.0.0.1:${running.address().port}`;
  token = (await (await fetch(base)).text()).match(/name="pi-studio-token" content="([a-f0-9]+)"/)[1];
});
after(async () => {
  await server.stopServer();
  await rm(tmp, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
});

describe("parseGitStatus", () => {
  const nul = String.fromCharCode(0);
  const z = (...tokens) => tokens.join(nul) + nul;
  test("maps the XY codes of porcelain v1 -z to the six states", () => {
    // Worktree change wins over a staged one (alterado); D on either side is apagado; U/AA/DD conflicts need attention (alterado); ?? novo; !! ignored is dropped.
    const entries = server.parseGitStatus(z("?? novo.txt", " M mod.txt", "MM both.txt", "M  staged.txt", "A  added.txt", " D del.txt", "D  gone.txt", "AD addgone.txt", "UU conflict.txt", "AA both-added.txt", "DD both-deleted.txt", "DU theirs.txt", "!! ignored.log", " T type.txt"));
    assert.deepEqual(Object.fromEntries(entries.map((entry) => [entry.path, entry.state])), {
      "novo.txt": "untracked", "mod.txt": "modified", "both.txt": "modified", "staged.txt": "staged", "added.txt": "staged", "del.txt": "deleted", "gone.txt": "deleted",
      "addgone.txt": "deleted", "conflict.txt": "modified", "both-added.txt": "modified", "both-deleted.txt": "modified", "theirs.txt": "modified", "type.txt": "modified",
    });
  });
  test("a rename or copy consumes its origin token and lists only the new path", () => {
    // `R  new` is followed by the old name in its own NUL field; reading it as a file would invent a phantom entry.
    const entries = server.parseGitStatus(z("R  new name.txt", "old name.txt", "C  copy.txt", "orig.txt", "?? after.txt"));
    assert.deepEqual(entries, [{ path: "new name.txt", state: "staged" }, { path: "copy.txt", state: "staged" }, { path: "after.txt", state: "untracked" }]);
  });
  test("short, empty or truncated input is safe: a cut last token is dropped", () => {
    // When the output hit the buffer limit the last field may be half a path; it must not appear as a file.
    assert.deepEqual(server.parseGitStatus(""), []);
    assert.deepEqual(server.parseGitStatus(z("??", "x", "")), []);
    assert.deepEqual(server.parseGitStatus("?? a.txt" + nul + "?? b.t", { truncated: true }), [{ path: "a.txt", state: "untracked" }]);
    assert.deepEqual(server.parseGitStatus("?? a.txt" + nul + "?? b.txt" + nul, { truncated: true }).length, 1);
  });
});

describe("parseGitNames", () => {
  test("splits NUL names, drops blanks and duplicates and a cut last name", () => {
    // `git log -z --name-only --format=` leaves empty fields between commits.
    const nul = String.fromCharCode(0);
    assert.deepEqual(server.parseGitNames(`a.txt${nul}${nul}b c.txt${nul}a.txt${nul}`), ["a.txt", "b c.txt"]);
    assert.deepEqual(server.parseGitNames(`a.txt${nul}b.t`, { truncated: true }), ["a.txt"]);
    assert.deepEqual(server.parseGitNames(""), []);
  });
});

describe("createLimiter", () => {
  test("never runs more tasks than its slots, runs all of them, and a failing task frees its slot", async () => {
    // Resource exhaustion: 40 callers on 4 slots must queue instead of forking 40 git processes.
    const limit = server.createLimiter(4);
    let running = 0;
    let peak = 0;
    const task = (index) => limit(async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running--;
      if (index % 7 === 0) throw new Error("falha");
      return index;
    });
    const results = await Promise.allSettled(Array.from({ length: 40 }, (_, index) => task(index)));
    assert.equal(peak, 4);
    assert.equal(results.filter((item) => item.status === "fulfilled").length, 34);
    assert.equal(running, 0);
  });
});

describe("readGitFiles on real repositories", () => {
  test("reports every state: pushed, committed, modified, staged, untracked, deleted, ignored and outside", async () => {
    // One repo, one file per state; the conversation's files are asked by relative and absolute path.
    const repo = await makeRepo("states", ["clean.txt", "mod.txt", "staged.txt", "del.txt", "pasta com espaço/ação é.txt", ".gitignore"]);
    await put(repo, ".gitignore", "ignored.log\n");
    git(repo, "add", ".gitignore");
    git(repo, "commit", "-q", "-m", "ignore");
    git(repo, "push", "-q");
    await put(repo, "local.txt");
    git(repo, "add", "local.txt");
    git(repo, "commit", "-q", "-m", "local");
    await put(repo, "mod.txt", "mudou");
    await put(repo, "staged.txt", "preparado");
    git(repo, "add", "staged.txt");
    await rm(path.join(repo, "del.txt"));
    await put(repo, "novo arquivo.txt");
    await put(repo, "newdir/a.txt");
    await put(repo, "ignored.log");
    const outside = path.join(tmp, "elsewhere.txt");
    const data = await server.readGitFiles(repo, ["clean.txt", path.join(repo, "mod.txt"), "staged.txt", "del.txt", "local.txt", "novo arquivo.txt", "ignored.log", "pasta com espaço/ação é.txt", outside, "nao-existe.txt"]);
    assert.equal(data.git, true);
    assert.equal(data.upstream, true);
    assert.equal(data.truncated, false);
    assert.equal(path.resolve(data.root), path.resolve(realpathSync.native(repo)));
    assert.deepEqual(stateOf(data), { "mod.txt": "modified", "staged.txt": "staged", "del.txt": "deleted", "novo arquivo.txt": "untracked", "newdir/a.txt": "untracked", "local.txt": "committed" });
    assert.deepEqual(reqOf(data), {
      "clean.txt": "pushed", [path.join(repo, "mod.txt")]: "modified", "staged.txt": "staged", "del.txt": "deleted", "local.txt": "committed", "novo arquivo.txt": "untracked",
      "ignored.log": "ignored", "pasta com espaço/ação é.txt": "pushed", [outside]: "outside", "nao-existe.txt": "ignored",
    });
    assert.equal(data.requested["clean.txt"].path, "clean.txt");
    assert.equal(data.requested[path.join(repo, "mod.txt")].path, "mod.txt");
    assert.equal(data.requested[outside].path, null);
  });

  test("a staged rename lists the new name once; unicode and spaces survive quoting", async () => {
    // Without -z git would print "pasta com espa\303\247o" in quotes; with -z the real name must come through.
    const repo = await makeRepo("rename", ["velho nome.txt", "ç/ã é.txt"]);
    git(repo, "mv", "velho nome.txt", "nome novo ü.txt");
    await put(repo, "ç/ã é.txt", "mudou");
    const data = await server.readGitFiles(repo, []);
    assert.deepEqual(stateOf(data), { "nome novo ü.txt": "staged", "ç/ã é.txt": "modified" });
  });

  test("from a subdirectory the paths stay repo-relative and ../ inside the repo resolves, ../ out of it is outside", async () => {
    // Orca/Studio projects are often a subfolder of the repository.
    const repo = await makeRepo("sub", ["top.txt", "pkg/inner.txt"]);
    await put(repo, "pkg/changed.txt");
    const data = await server.readGitFiles(path.join(repo, "pkg"), ["inner.txt", "../top.txt", "changed.txt", "../../escape.txt", path.join(repo, "top.txt"), "."]);
    assert.deepEqual(reqOf(data), { "inner.txt": "pushed", "../top.txt": "pushed", "changed.txt": "untracked", "../../escape.txt": "outside", [path.join(repo, "top.txt")]: "pushed", ".": "outside" });
    assert.deepEqual(stateOf(data), { "pkg/changed.txt": "untracked" });
    assert.equal(data.requested["../top.txt"].path, "top.txt");
  });

  test("without an upstream nothing is pushed: clean tracked files are committed and upstream is false", async () => {
    // "Enviado" must never be claimed when there is no remote branch to have been sent to.
    const repo = await makeRepo("noup", ["a.txt"], { upstream: false });
    await put(repo, "b.txt");
    const data = await server.readGitFiles(repo, ["a.txt"]);
    assert.equal(data.upstream, false);
    assert.equal(data.requested["a.txt"].state, "committed");
    assert.deepEqual(stateOf(data), { "b.txt": "untracked" });
  });

  test("a repository with no commit yet still reports untracked files", async () => {
    // `git log @{u}..HEAD` fails on an unborn branch; that must not turn into an error.
    const dir = path.join(roots, "unborn");
    await mkdir(dir, { recursive: true });
    git(dir, "init", "-q");
    await put(dir, "first.txt");
    const data = await server.readGitFiles(dir, ["first.txt"]);
    assert.deepEqual([stateOf(data), data.upstream, data.requested["first.txt"].state], [{ "first.txt": "untracked" }, false, "untracked"]);
  });

  test("not a repository, a missing directory or a missing git binary answer git:false", async () => {
    // The tab simply stays uncolored; nothing throws.
    const plain = path.join(roots, "plain");
    await mkdir(plain, { recursive: true });
    assert.deepEqual(await server.readGitFiles(plain, ["x"]), { git: false });
    assert.deepEqual(await server.readGitFiles(path.join(roots, "does-not-exist"), []), { git: false });
    assert.deepEqual(await server.readGitFiles(plain, [], { run: (args, dir) => server.runGit(dir, args, { bin: path.join(tmp, "no-git") }) }), { git: false });
  });

  test("a git that exceeds its timeout is unavailable (null), not an empty repository", async () => {
    // Timing out must be distinguishable from "no changes", or a stuck git would paint everything as clean.
    const repo = await makeRepo("slow", ["a.txt"]);
    assert.equal(await server.readGitFiles(repo, [], { run: (args, dir) => server.runGit(dir, args, { timeoutMs: 1 }) }), null);
  });

  test("a failing or timing-out status, log or ls-files is handled per command", async () => {
    // status failing or any command timing out = unavailable (null); log failing = no upstream; ls-files failing = nothing is tracked.
    const repo = await makeRepo("partial", ["a.txt"]);
    const failing = (name, result) => (args, dir) => (args[0] === name ? Promise.resolve(result) : server.runGit(dir, args));
    assert.equal(await server.readGitFiles(repo, ["a.txt"], { run: failing("status", { ok: false, code: 1 }) }), null);
    assert.equal(await server.readGitFiles(repo, ["a.txt"], { run: failing("log", { timedOut: true }) }), null);
    assert.equal(await server.readGitFiles(repo, ["a.txt"], { run: failing("ls-files", { timedOut: true }) }), null);
    const noLog = await server.readGitFiles(repo, ["a.txt"], { run: failing("log", { ok: false, code: 128 }) });
    assert.deepEqual([noLog.upstream, noLog.requested["a.txt"].state], [false, "committed"]);
    const noTracked = await server.readGitFiles(repo, ["a.txt"], { run: failing("ls-files", { ok: false, code: 1 }) });
    assert.equal(noTracked.requested["a.txt"].state, "ignored");
  });

  test("a huge status is capped at 2000 entries and flagged", async () => {
    // 2300 untracked files: the list stops at the cap and says so; nothing is half-listed.
    const repo = await makeRepo("huge", ["a.txt"]);
    await mkdir(path.join(repo, "many"), { recursive: true });
    await Promise.all(Array.from({ length: 2300 }, (_, index) => writeFile(path.join(repo, "many", `f${index}.txt`), "")));
    const data = await server.readGitFiles(repo, []);
    assert.equal(data.files.length, 2000);
    assert.equal(data.truncated, true);
    assert.ok(data.files.every((file) => file.state === "untracked" && /^many\/f\d+\.txt$/.test(file.path)));
  });

  test("output beyond the buffer is cut cleanly: truncated, only whole paths, no crash", async () => {
    // Same repo, tiny buffer: git is killed mid-output; the partial last path must be discarded.
    const repo = path.join(roots, "huge");
    const data = await server.readGitFiles(repo, [], { run: (args, dir) => server.runGit(dir, args, { maxBuffer: 3000 }) });
    assert.equal(data.truncated, true);
    assert.ok(data.files.length > 10 && data.files.length < 300, String(data.files.length));
    assert.ok(data.files.every((file) => /^many\/f\d+\.txt$/.test(file.path)));
  });

  test("hostile requested paths are inert: leading dash, pathspec magic, glob, newline, unicode, NUL and oversize", async () => {
    // Paths go to git after `--` with literal pathspecs, so none of them can act as an option or a pattern.
    const repo = await makeRepo("hostile", ["-rf", "a.txt", "[ab].txt"]);
    const asked = ["-rf", ":(exclude)a.txt", "*.txt", "[ab].txt", "linha\nnova.txt", "é.txt", "a\u0000b", "x".repeat(2000)];
    const data = await server.readGitFiles(repo, asked);
    assert.deepEqual(reqOf(data), { "-rf": "pushed", ":(exclude)a.txt": "ignored", "*.txt": "ignored", "[ab].txt": "pushed", "linha\nnova.txt": "ignored", "é.txt": "ignored" });
  });

  test("more than 100 requested paths: only the first 100 are answered", async () => {
    // A client cannot make the server build an unbounded argv.
    const repo = await makeRepo("manypaths", ["a.txt"]);
    const data = await server.readGitFiles(repo, Array.from({ length: 150 }, (_, index) => `p${index}.txt`));
    assert.equal(Object.keys(data.requested).length, 100);
  });
});

describe("gitFilesCached", () => {
  test("50 concurrent identical calls run git once (4 commands) and share the result; 2 s later it runs again", async () => {
    // Coalescing + 2 s cache per cwd: polling clients cost one set of git processes, not one per request.
    const repo = await makeRepo("cache", ["a.txt"]);
    server.clearGitFilesCache();
    let runs = 0;
    const run = (args, dir) => { runs++; return server.runGit(dir, args); };
    let clock = 10_000;
    const call = () => server.gitFilesCached(repo, ["a.txt"], { run, now: () => clock });
    const all = await Promise.all(Array.from({ length: 50 }, call));
    assert.ok(all.every((value) => value === all[0]));
    const firstRuns = runs;
    assert.equal(firstRuns, 4);
    clock += 1999;
    assert.equal(await call(), all[0]);
    assert.equal(runs, firstRuns);
    clock += 2;
    assert.notEqual(await call(), all[0]);
    assert.equal(runs, firstRuns * 2);
  });
  test("different path sets or directories do not share an entry, and the cache stays bounded", async () => {
    // The key includes the requested paths; many different keys must not grow memory without limit.
    const repo = path.join(roots, "cache");
    server.clearGitFilesCache();
    const run = () => Promise.resolve({ ok: false, code: 128 });
    const a = await server.gitFilesCached(repo, ["a"], { run, now: () => 1 });
    const b = await server.gitFilesCached(repo, ["b"], { run, now: () => 1 });
    assert.notEqual(a, b);
    for (let index = 0; index < 400; index++) await server.gitFilesCached(repo, [`k${index}`], { run, now: () => 1 });
    assert.ok(server.gitFilesCacheSize() <= 200);
  });
  test("a failed read (null) is cached for the same short window, not forever", async () => {
    // A transient timeout must clear itself at the next window.
    server.clearGitFilesCache();
    let clock = 0;
    let fail = true;
    const run = async () => (fail ? { timedOut: true } : { ok: false, code: 128 });
    assert.equal(await server.gitFilesCached("/x", [], { run, now: () => clock }), null);
    fail = false;
    assert.equal(await server.gitFilesCached("/x", [], { run, now: () => clock }), null);
    clock = 2001;
    assert.deepEqual(await server.gitFilesCached("/x", [], { run, now: () => clock }), { git: false });
  });
});

describe("GET /api/sessions/:id/git-files", () => {
  test("404 for an unknown session, 405 for other methods, 200 with the documented shape for a live one", async () => {
    // The route resolves the cwd from the session; it never takes a directory from the client.
    const repo = await makeRepo("route", ["clean.txt"]);
    await put(repo, "novo.txt");
    const session = await openSession(repo);
    server.clearGitFilesCache();
    assert.equal((await api("/api/sessions/nope/git-files")).status, 404);
    assert.equal((await api(`/api/sessions/${session.id}/git-files`, { method: "POST" })).status, 405);
    const { status, body } = await api(`/api/sessions/${session.id}/git-files?path=clean.txt&path=novo.txt&path=${encodeURIComponent("a\u0000b")}`);
    assert.equal(status, 200);
    assert.deepEqual(Object.keys(body).sort(), ["files", "git", "requested", "root", "truncated", "upstream"]);
    assert.deepEqual(stateOf(body), { "novo.txt": "untracked" });
    assert.deepEqual(reqOf(body), { "clean.txt": "pushed", "novo.txt": "untracked" });
  });

  test("a project that is not a repository answers { git:false } and a stopped session is still readable", async () => {
    // The Files tab of an ended conversation keeps its colors.
    const plain = path.join(roots, "plain");
    const session = await openSession(plain);
    server.clearGitFilesCache();
    assert.deepEqual((await api(`/api/sessions/${session.id}/git-files`)).body, { git: false });
    await api(`/api/sessions/${session.id}/stop`, { method: "POST" });
    for (const end = Date.now() + 5000; Date.now() < end;) {
      if ((await api("/api/sessions")).body.sessions.find((item) => item.id === session.id)?.exited) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.equal((await api(`/api/sessions/${session.id}/git-files`)).status, 200);
  });

  test("a git timeout answers 503 git-unavailable", async () => {
    // Distinct from git:false so the UI keeps its last good colors instead of dropping them.
    const repo = await makeRepo("route-timeout", ["a.txt"]);
    const session = await openSession(repo);
    server.clearGitFilesCache();
    process.env.PI_STUDIO_GIT_TIMEOUT_MS = "1";
    try {
      assert.deepEqual((await api(`/api/sessions/${session.id}/git-files`)).body, { error: "git-unavailable" });
    } finally {
      delete process.env.PI_STUDIO_GIT_TIMEOUT_MS;
    }
  });

  test("50 concurrent requests and 30 different path sets all succeed", async () => {
    // Volume: identical requests coalesce; distinct ones queue behind the git slots instead of failing.
    const repo = await makeRepo("route-load", ["a.txt"]);
    const session = await openSession(repo);
    server.clearGitFilesCache();
    const same = await Promise.all(Array.from({ length: 50 }, () => api(`/api/sessions/${session.id}/git-files?path=a.txt`)));
    assert.ok(same.every((answer) => answer.status === 200 && answer.body.requested["a.txt"].state === "pushed"));
    const distinct = await Promise.all(Array.from({ length: 30 }, (_, index) => api(`/api/sessions/${session.id}/git-files?path=n${index}.txt`)));
    assert.ok(distinct.every((answer) => answer.status === 200 && answer.body.requested[`n${distinct.indexOf(answer)}.txt`].state === "ignored"));
  });
});
