// Disk hygiene: worker scratch, worktree-create disk guard, and stale /tmp janitor, all in an owned mkdtemp root.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { resolvePiSdkRoot } from "./lib/pi-sdk.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sdkRoot = resolvePiSdkRoot(import.meta.url);
const require = createRequire(import.meta.url);
const { createJiti } = require(path.join(sdkRoot, "node_modules/jiti/lib/jiti.cjs"));
const jiti = createJiti(import.meta.url, { fsCache: false, alias: { "@earendil-works/pi-coding-agent": path.join(sdkRoot, "dist/index.js") } });
const mod = await jiti.import(path.join(repoRoot, "extensions/disk-hygiene.ts"));

const root = fs.mkdtempSync(path.join(os.tmpdir(), "disk-hygiene-"));
try {
  // 1. Worker scratch lives in the worktree and is git-excluded; non-workers are untouched.
  const repo = path.join(root, "repo");
  execFileSync("git", ["init", "-q", repo]);
  const plainEnv = {};
  assert.equal(mod.setupWorkerScratch(repo, plainEnv), undefined, "non-worker sessions keep the system temp dir");
  assert.equal(plainEnv.TMPDIR, undefined);
  const env = { PI_REPORT_RUN: "run_abc123" };
  const scratch = mod.setupWorkerScratch(repo, env);
  // Windows TEMP can use an 8.3 short path while git returns the canonical long path.
  assert.equal(fs.realpathSync.native(scratch), fs.realpathSync.native(path.join(repo, ".tmp")));
  assert.equal(env.TMPDIR, scratch); assert.equal(env.TMP, scratch); assert.equal(env.TEMP, scratch);
  fs.writeFileSync(path.join(scratch, "junk"), "x");
  assert.equal(execFileSync("git", ["-C", repo, "status", "--porcelain"], { encoding: "utf8" }), "", ".tmp is git-excluded");
  mod.setupWorkerScratch(repo, { PI_REPORT_RUN: "run_abc123" });
  const exclude = fs.readFileSync(path.join(repo, ".git/info/exclude"), "utf8");
  assert.equal(exclude.split("\n").filter((line) => line === "/.tmp/").length, 1, "exclude entry is idempotent");

  // 2. Disk guard blocks only `orca worktree create`, and only below the threshold.
  const handlers = new Map();
  const realStatfs = fs.statfsSync;
  const realCwd = process.cwd;
  process.cwd = () => root;
  mod.createDiskHygieneExtension(async () => "", path.join(root, "none"), path.join(root, "stamp"))({ on: (name, handler) => handlers.set(name, handler) });
  process.cwd = realCwd;
  const call = (command) => handlers.get("tool_call")({ toolName: "bash", input: { command } });
  fs.statfsSync = () => ({ bavail: 5 * 2 ** 18, bsize: 4096 }); // 5 GiB
  assert.equal(call("orca worktree create --repo x --name y --json").block, true, "low disk blocks new workers");
  assert.equal(call("orca worktree list --json"), undefined, "other orca commands are never blocked");
  fs.statfsSync = () => ({ bavail: 50 * 2 ** 18, bsize: 4096 }); // 50 GiB
  assert.equal(call("orca worktree create --repo x --name y --json"), undefined, "enough disk allows new workers");
  fs.statfsSync = realStatfs;

  // 3. Janitor: removes only stale, unused, non-kept dirs. It requires a POSIX uid.
  if (process.getuid?.() !== undefined) {
  const tmpRoot = path.join(root, "tmp");
  fs.mkdirSync(tmpRoot);
  const old = (Date.now() - 3 * 24 * 3600_000) / 1000;
  const mk = (name, { stale = true, innerFresh = false } = {}) => {
    const dir = path.join(tmpRoot, name);
    fs.mkdirSync(path.join(dir, "sub"), { recursive: true });
    const file = path.join(dir, "sub", "f");
    fs.writeFileSync(file, "x");
    if (stale) { fs.utimesSync(file, old, old); fs.utimesSync(path.join(dir, "sub"), old, old); }
    if (innerFresh) fs.utimesSync(file, Date.now() / 1000, Date.now() / 1000);
    if (stale) fs.utimesSync(dir, old, old);
    return dir;
  };
  const staleDir = mk("s435.Qecq2p");
  const freshInner = mk("busy-build.abc", { innerFresh: true });
  const recent = mk("new.xyz", { stale: false });
  const kept = mk("stage1-t07.iWqQyk");
  const inUse = mk("open.qqq");
  const runner = async (file, args) => {
    if (file === "lsof") return `p1\nn${path.join(inUse, "sub", "f")}\n`;
    return execFileSync(file, args, { encoding: "utf8" });
  };
  const removed = await mod.sweepStaleTemp(tmpRoot, runner);
  assert.deepEqual(removed, [staleDir], "only the stale, unused, non-kept directory is removed");
  for (const dir of [freshInner, recent, kept, inUse]) assert.ok(fs.existsSync(dir), `${path.basename(dir)} preserved`);
  const failClosed = await mod.sweepStaleTemp(tmpRoot, async (file) => { if (file === "lsof") throw new Error("no lsof"); return ""; });
  assert.deepEqual(failClosed, [], "no open-file list means nothing is removed");
  // A failing lsof that still printed partial output must not be trusted.
  const fakeBin = path.join(root, "bin"); fs.mkdirSync(fakeBin);
  fs.writeFileSync(path.join(fakeBin, "lsof"), "#!/bin/sh\necho p1\nexit 1\n", { mode: 0o755 });
  const realPath = process.env.PATH; process.env.PATH = `${fakeBin}:${realPath}`;
  const victim = mk("victim.zzz");
  const partial = await mod.sweepStaleTemp(tmpRoot, mod.defaultRunner);
  process.env.PATH = realPath;
  assert.deepEqual(partial, [], "lsof failure with partial stdout removes nothing");
  assert.ok(fs.existsSync(victim));
  }
  console.log("disk-hygiene smoke: PASS");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
