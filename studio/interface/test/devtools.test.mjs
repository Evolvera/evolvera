// Dev tools in the inspector: git worktrees and the GitHub summary. Fake command runners only: no git, no gh, no network.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { checkSummary, createCache, githubRepoFromUrl, githubSummary, gitWorktrees, parseStatus, parseWorktreeList } from "../lib-server/devtools.mjs";
import { gitWorktreeView, prView } from "../public/lib.js";

describe("git worktrees", () => {
  test("parseWorktreeList reads the porcelain blocks: branch, detached, bare, locked", () => {
    const text = "worktree D:/repo\nHEAD abc\nbranch refs/heads/NatiamG\n\nworktree D:/repo-team/front\nHEAD def\ndetached\nlocked\n\nworktree D:/repo.git\nbare\n";
    assert.deepEqual(parseWorktreeList(text), [
      { path: "D:/repo", head: "abc", branch: "NatiamG", detached: false, bare: false, locked: false },
      { path: "D:/repo-team/front", head: "def", branch: null, detached: true, bare: false, locked: true },
      { path: "D:/repo.git", head: null, branch: null, detached: false, bare: true, locked: false },
    ]);
  });

  test("parseStatus: changed and untracked files, ahead/behind and upstream", () => {
    assert.deepEqual(parseStatus("## NatiamG...origin/NatiamG [ahead 2, behind 1]\n M a.js\n?? b.js\n"), { changed: 2, untracked: 1, ahead: 2, behind: 1, upstream: "origin/NatiamG" });
    assert.deepEqual(parseStatus("## main\n"), { changed: 0, untracked: 0, ahead: 0, behind: 0, upstream: null });
  });

  test("gitWorktrees: one entry per non-bare worktree with status and last commit; a missing folder is flagged", async () => {
    const calls = [];
    const run = async (bin, args, { cwd }) => {
      calls.push([bin, args[0], cwd]);
      if (args[0] === "worktree") return "worktree D:/repo\nbranch refs/heads/NatiamG\n\nworktree D:/gone\nbranch refs/heads/x\n\nworktree D:/bare\nbare\n";
      if (cwd === "D:/gone") throw new Error("no such directory");
      if (args[0] === "status") return "## NatiamG...origin/NatiamG [ahead 1]\n M a.js\n";
      return "f942638\x1fStudio vira código nosso\x1f1793200000\n";
    };
    const list = await gitWorktrees("D:/repo", { run });
    assert.equal(list.length, 2);
    assert.deepEqual([list[0].branch, list[0].changed, list[0].ahead, list[0].last.hash], ["NatiamG", 1, 1, "f942638"]);
    assert.equal(list[1].missing, true);
    assert.ok(!calls.some(([, , cwd]) => cwd === "D:/bare"), "a bare repository is not inspected");
  });

  test("gitWorktreeView: what the card says", () => {
    const view = gitWorktreeView({ path: "C:/x/NatiamG", branch: "NatiamG", changed: 3, ahead: 1, behind: 0, upstream: "origin/NatiamG", last: { subject: "feat", at: 1000 } }, 61_000);
    assert.deepEqual([view.name, view.branch, view.changes, view.dirty, view.sync], ["NatiamG", "NatiamG", "3 arquivos alterados", true, "1 à frente"]);
    assert.equal(gitWorktreeView({ path: "C:/y", detached: true, changed: 0, upstream: null }).branch, "HEAD solto");
    assert.equal(gitWorktreeView({ path: "C:/y", changed: 0, upstream: null }).sync, "sem upstream");
  });
});

describe("github", () => {
  test("githubRepoFromUrl: https and ssh remotes; anything else is not GitHub", () => {
    assert.deepEqual(githubRepoFromUrl("https://github.com/Evolvera/evolvera.git\n"), { owner: "Evolvera", repo: "evolvera" });
    assert.deepEqual(githubRepoFromUrl("git@github.com:NatiamG/pi-studio.git"), { owner: "NatiamG", repo: "pi-studio" });
    assert.equal(githubRepoFromUrl("https://gitlab.com/a/b.git"), null);
    assert.equal(githubRepoFromUrl(""), null);
  });

  test("checkSummary counts passed, failed and still running checks", () => {
    assert.deepEqual(checkSummary([{ conclusion: "SUCCESS" }, { conclusion: "FAILURE" }, { status: "IN_PROGRESS" }, { state: "SUCCESS" }, { conclusion: "SKIPPED" }]), { passed: 3, failed: 1, pending: 1 });
    assert.deepEqual(checkSummary(null), { passed: 0, failed: 0, pending: 0 });
  });

  test("githubSummary: PRs with checks, issues and runs, every gh call with the pinned token", async () => {
    const envs = [];
    const run = async (bin, args, { env }) => {
      envs.push(env.GH_TOKEN);
      if (args[0] === "pr") return JSON.stringify([{ number: 7, title: "Studio próprio", author: { login: "NatiamG" }, headRefName: "feat", baseRefName: "NatiamG", isDraft: false, updatedAt: "2026-10-29T10:00:00Z", url: "u", reviewDecision: "APPROVED", statusCheckRollup: [{ conclusion: "SUCCESS" }] }]);
      if (args[0] === "issue") return JSON.stringify([{ number: 3, title: "Bug", labels: [{ name: "bug" }], updatedAt: "2026-10-28T10:00:00Z", url: "i", assignees: [] }]);
      throw new Error("actions disabled");
    };
    const summary = await githubSummary({ owner: "Evolvera", repo: "evolvera" }, { run, env: { GH_TOKEN: "t" } });
    assert.equal(summary.repo, "Evolvera/evolvera");
    assert.deepEqual(summary.prs[0].checks, { passed: 1, failed: 0, pending: 0 });
    assert.deepEqual(summary.issues[0].labels, ["bug"]);
    assert.deepEqual(summary.runs, [], "a repository without Actions still shows PRs and issues");
    assert.ok(envs.every((token) => token === "t"));
  });

  test("prView: tone and labels from checks and review", () => {
    assert.deepEqual(prView({ checks: { passed: 3, failed: 1, pending: 0 }, review: "CHANGES_REQUESTED" }), { tone: "bad", checks: "3 ok · 1 falhou", state: "pede mudanças" });
    assert.deepEqual(prView({ checks: { passed: 0, failed: 0, pending: 0 }, draft: true }), { tone: "idle", checks: "sem checks", state: "rascunho" });
    assert.equal(prView({ checks: { passed: 1, failed: 0, pending: 2 } }).tone, "work");
  });

  test("createCache keeps a result for its time and never caches a failure", async () => {
    let clock = 0;
    let loads = 0;
    const cache = createCache(1000, () => clock);
    assert.equal(await cache("k", async () => ++loads), 1);
    assert.equal(await cache("k", async () => ++loads), 1);
    clock = 1500;
    assert.equal(await cache("k", async () => ++loads), 2);
    await assert.rejects(cache("bad", async () => { throw new Error("x"); }));
    assert.equal(await cache("bad", async () => "ok"), "ok");
  });
});

describe("shell runner", async () => {
  const { EventEmitter } = await import("node:events");
  const { createShellRunner } = await import("../lib-server/devtools.mjs");
  const fakeSpawn = (spawned) => (command, cwd) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.killed = false;
    child.kill = () => { child.killed = true; child.emit("close", null); };
    spawned.push({ command, cwd, child });
    return child;
  };

  test("one command per project, output read by offset, exit code at the end", () => {
    const spawned = [];
    const shell = createShellRunner({ spawn: fakeSpawn(spawned), timeoutMs: 60_000 });
    const first = shell.start({ projectId: "p", cwd: "D:/repo", command: "git status" });
    assert.deepEqual([spawned[0].command, spawned[0].cwd, first.running], ["git status", "D:/repo", true]);
    assert.throws(() => shell.start({ projectId: "p", cwd: "D:/repo", command: "npm test" }), /rodando/);
    assert.equal(shell.start({ projectId: "q", cwd: "D:/outro", command: "ls" }).running, true, "another project runs in parallel");
    spawned[0].child.stdout.emit("data", "On branch NatiamG\n");
    spawned[0].child.stderr.emit("data", "warning\n");
    const mid = shell.read(first.id, 0);
    assert.equal(mid.chunk, "On branch NatiamG\nwarning\n");
    spawned[0].child.emit("close", 0);
    const end = shell.read(first.id, mid.offset);
    assert.deepEqual([end.chunk, end.running, end.exitCode], ["", false, 0]);
    assert.equal(shell.start({ projectId: "p", cwd: "D:/repo", command: "npm test" }).running, true, "free again after the exit");
  });

  test("stop, invalid commands and the output cap", () => {
    const spawned = [];
    const shell = createShellRunner({ spawn: fakeSpawn(spawned), maxOutput: 10, timeoutMs: 60_000 });
    for (const bad of ["", "   ", "a\nb", "x".repeat(2001)]) assert.throws(() => shell.start({ projectId: "p", cwd: "D:/r", command: bad }), /inválido/);
    const run = shell.start({ projectId: "p", cwd: "D:/r", command: "npm run dev" });
    spawned[0].child.stdout.emit("data", "0123456789ABCDEF");
    const read = shell.read(run.id, 0);
    assert.equal(read.chunk, "6789ABCDEF", "only the last bytes stay");
    assert.equal(read.offset, 16, "the offset keeps counting what was dropped");
    assert.equal(shell.stop(run.id), true);
    assert.equal(spawned[0].child.killed, true);
    assert.equal(shell.stop(run.id), false, "an ended command cannot be stopped again");
    assert.equal(shell.read("nope"), null);
    assert.deepEqual(shell.list("p").map((item) => item.command), ["npm run dev"]);
  });
});
