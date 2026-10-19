/**
 * Disk hygiene for Orca worker campaigns.
 *
 * 1. Worker scratch: an Orca worker PI (PI_REPORT_RUN set) points TMPDIR/TMP/TEMP at
 *    `<worktree>/.tmp` (git-excluded). Test temp roots then live with the issue and are
 *    removed when the merged child's worktree is reclaimed.
 * 2. Disk guard: `orca worktree create` is blocked while free disk is below MIN_FREE_GIB,
 *    so the conductor stops opening workers instead of letting them die on ENOSPC.
 * 3. Stale temp janitor (user-authorized, 2026-10-18): at most once a day, in the background,
 *    remove top-level directories under /tmp owned by this user with no file modified for
 *    48h and no open file/cwd, except the KEEP prefixes (model training/validation roots).
 */
import { execFile as nodeExecFile, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export const MIN_FREE_GIB = 20;
export const STALE_MINUTES = 48 * 60;
export const KEEP_PREFIXES = ["ua-safe", "ua-docker", "stage1-", "h8-", "recurrent-cnn-", "com.apple", "tmux-", "."];
const RUN_ID_PATTERN = /^run_[A-Za-z0-9]+$/;
const WORKTREE_CREATE = /\borca\s+worktree\s+create\b/;
const DAY_MS = 24 * 60 * 60 * 1000;

type Runner = (file: string, args: string[], timeoutMs: number) => Promise<string>;

const execFile: Runner = (file, args, timeoutMs) => new Promise((resolve, reject) => {
  nodeExecFile(file, args, { timeout: timeoutMs, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }, (error, stdout) => {
    // Any error (exit code, timeout, buffer overflow) means the output may be partial: reject.
    if (error) reject(error); else resolve(String(stdout));
  });
});

export function freeGiB(target: string): number | undefined {
  try { const s = fs.statfsSync(target); return (s.bavail * s.bsize) / 2 ** 30; } catch { return undefined; }
}

/** Point this worker's temp env at <worktree>/.tmp; returns the directory or undefined. */
export function setupWorkerScratch(cwd: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (!env.PI_REPORT_RUN || !RUN_ID_PATTERN.test(env.PI_REPORT_RUN)) return undefined;
  try {
    const top = execFileSync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], { encoding: "utf8", timeout: 5_000 }).trim();
    const exclude = path.resolve(top, execFileSync("git", ["-C", top, "rev-parse", "--git-path", "info/exclude"], { encoding: "utf8", timeout: 5_000 }).trim());
    const scratch = path.join(top, ".tmp");
    fs.mkdirSync(scratch, { recursive: true });
    fs.mkdirSync(path.dirname(exclude), { recursive: true });
    const current = fs.existsSync(exclude) ? fs.readFileSync(exclude, "utf8") : "";
    if (!current.split(/\r?\n/).includes("/.tmp/")) fs.appendFileSync(exclude, `${current && !current.endsWith("\n") ? "\n" : ""}/.tmp/\n`);
    env.TMPDIR = env.TMP = env.TEMP = scratch;
    return scratch;
  } catch { return undefined; }
}

export { execFile as defaultRunner };

export async function sweepStaleTemp(root: string, run: Runner = execFile, now = Date.now()): Promise<string[]> {
  const uid = process.getuid?.();
  if (uid === undefined) return [];
  let names: string[];
  try { names = fs.readdirSync(root); } catch { return []; }
  const candidates = names.filter((name) => !KEEP_PREFIXES.some((prefix) => name.startsWith(prefix))).map((name) => path.join(root, name)).filter((dir) => {
    try { const st = fs.lstatSync(dir); return st.isDirectory() && st.uid === uid && now - st.mtimeMs > STALE_MINUTES * 60_000; } catch { return false; }
  });
  if (!candidates.length) return [];
  // Fail closed: without a complete open-file list nothing is removed.
  let open: string;
  try { open = await run("lsof", ["-nP", "-u", String(uid), "-Fn"], 60_000); } catch { return []; }
  const real = fs.realpathSync(root);
  const used = new Set(open.split("\n").filter((line) => line.startsWith("n")).map((line) => line.slice(1))
    .map((p) => p.startsWith(real + "/") ? p.slice(real.length + 1) : p.startsWith(root + "/") ? p.slice(root.length + 1) : undefined)
    .filter((rel): rel is string => !!rel).map((rel) => rel.split("/")[0]));
  const removed: string[] = [];
  for (const dir of candidates) {
    if (used.has(path.basename(dir))) continue;
    try {
      const recent = await run("find", [dir, "-mmin", `-${STALE_MINUTES}`, "-print", "-quit"], 120_000);
      if (recent.trim()) continue;
    } catch { continue; }
    try { await fs.promises.rm(dir, { recursive: true, force: true }); removed.push(dir); } catch { /* next */ }
  }
  return removed;
}

export function createDiskHygieneExtension(run: Runner = execFile, tmpRoot = "/tmp", stampPath = path.join(process.env.PI_CODING_AGENT_DIR ?? path.join(os.homedir(), ".pi", "agent"), ".tmp-janitor.stamp")) {
  return function diskHygiene(pi: ExtensionAPI) {
    setupWorkerScratch(process.cwd());

    pi.on("tool_call", (event) => {
      if (event.toolName !== "bash") return;
      const command = (event.input as { command?: unknown } | undefined)?.command;
      if (typeof command !== "string" || !WORKTREE_CREATE.test(command)) return;
      const free = freeGiB(os.homedir());
      if (free === undefined || free >= MIN_FREE_GIB) return;
      return { block: true, reason: `Disk guard: only ${free.toFixed(1)} GiB free (< ${MIN_FREE_GIB} GiB). Do not open a new worker; reclaim merged children or free space first, then retry.` };
    });

    pi.on("session_start", () => {
      if (process.platform === "win32") return;
      try { if (Date.now() - fs.statSync(stampPath).mtimeMs < DAY_MS) return; } catch { /* first run */ }
      try { fs.writeFileSync(stampPath, new Date().toISOString()); } catch { return; }
      void sweepStaleTemp(tmpRoot, run).catch(() => {});
    });
  };
}

export default createDiskHygieneExtension();
