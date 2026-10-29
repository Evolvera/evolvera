// Tests docker/git-host-path.sh (installed as `git` in the image) with a fake real git.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const wrapper = path.join(here, "..", "docker", "git-host-path.sh").replace(/\\/g, "/");
// Never WSL's System32\bash.exe: on Windows use Git for Windows' bash explicitly.
const gitBash = "C:/Program Files/Git/bin/bash.exe";
const bash = process.platform === "win32" ? (existsSync(gitBash) ? gitBash : null) : "bash";

const tmp = await mkdtemp(path.join(os.tmpdir(), "pi-studio-gitwrap-"));
after(() => rm(tmp, { recursive: true, force: true }));
const fwd = (p) => p.replace(/\\/g, "/");
const fakeGit = path.join(tmp, "fake-git.sh");
await writeFile(fakeGit, '#!/bin/bash\nprintf "GIT_DIR=%s\\nGIT_WORK_TREE=%s\\nARGS=%s\\n" "${GIT_DIR:-}" "${GIT_WORK_TREE:-}" "$*"\n');

async function tree(name, gitEntry) {
  const root = path.join(tmp, name);
  await mkdir(path.join(root, "sub", "deep"), { recursive: true });
  if (gitEntry === "dir") await mkdir(path.join(root, ".git"), { recursive: true });
  else if (gitEntry) await writeFile(path.join(root, ".git"), gitEntry);
  return root;
}

function run(cwd, args, env = {}) {
  const script = 'cd "$1" || exit 9; shift; exec bash "$WRAPPER" "$@"';
  const res = spawnSync(bash, ["-c", script, "wrap", fwd(cwd), ...args], {
    encoding: "utf8",
    env: { PATH: process.env.PATH, WRAPPER: wrapper, GIT_WRAPPER_REAL: fwd(fakeGit), GIT_HOST_PREFIX: "C:/Users/Me", GIT_HOST_MOUNT: "/home/host/", ...env },
  });
  assert.equal(res.status, 0, res.stderr);
  return Object.fromEntries(res.stdout.trim().split("\n").map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]));
}

// POSIX-style path of a dir as seen by bash (Git Bash shows /c/..., Linux unchanged).
function posix(dir) {
  return spawnSync(bash, ["-c", 'cd "$1" && pwd', "p", fwd(dir)], { encoding: "utf8" }).stdout.trim();
}

describe("git-host-path wrapper", { skip: bash ? false : "Git Bash not found" }, () => {
  test("maps a Windows worktree pointer (CRLF, backslashes, other casing) from a subdirectory", async () => {
    const root = await tree("wt", "gitdir: c:\\users\\me\\repo\\.git\\worktrees\\x\r\n");
    const out = run(path.join(root, "sub", "deep"), ["status", "--short"]);
    assert.equal(out.GIT_DIR, "/home/host/repo/.git/worktrees/x");
    assert.equal(out.GIT_WORK_TREE, posix(root));
    assert.equal(out.ARGS, "status --short");
  });

  test("honors leading -C (relative and absolute)", async () => {
    const root = await tree("wtc", "gitdir: C:/Users/Me/repo/.git/worktrees/y\n");
    assert.equal(run(tmp, ["-C", "wtc/sub", "log"]).GIT_WORK_TREE, posix(root));
    const other = await tree("plain-c", null);
    const out = run(other, ["-C", posix(path.join(root, "sub")), "log"]);
    assert.equal(out.GIT_DIR, "/home/host/repo/.git/worktrees/y");
    assert.equal(out.ARGS, `-C ${posix(path.join(root, "sub"))} log`);
  });

  test("an exact prefix match maps to the mount root", async () => {
    const root = await tree("exact", "gitdir: C:/Users/Me\n");
    assert.equal(run(root, ["status"]).GIT_DIR, "/home/host");
  });

  test("passes through: other prefix, prefix-lookalike, real .git dir, no repo, preset GIT_DIR, unset map", async () => {
    const other = await tree("other", "gitdir: D:/elsewhere/.git/worktrees/z\n");
    assert.equal(run(other, ["status"]).GIT_DIR, "");
    const lookalike = await tree("lookalike", "gitdir: C:/Users/MeToo/repo/.git\n");
    assert.equal(run(lookalike, ["status"]).GIT_DIR, "");
    const normal = await tree("normal", "dir");
    assert.equal(run(path.join(normal, "sub"), ["status"]).GIT_WORK_TREE, "");
    const none = await tree("none", null);
    assert.equal(run(none, ["status"]).GIT_DIR, "");
    const wt = await tree("preset", "gitdir: C:/Users/Me/repo/.git/worktrees/p\n");
    assert.equal(run(wt, ["status"], { GIT_DIR: "/custom" }).GIT_DIR, "/custom");
    assert.equal(run(wt, ["status"], { GIT_HOST_PREFIX: "" }).GIT_DIR, "");
  });
});
