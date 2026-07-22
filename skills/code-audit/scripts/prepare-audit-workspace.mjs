#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import {
  chmodSync, copyFileSync, lstatSync, mkdirSync, mkdtempSync, readFileSync,
  readdirSync, realpathSync, statSync, writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { createHash } from "node:crypto";

const args = process.argv.slice(2);
const includeUntracked = args.includes("--include-untracked");
const positional = args.filter((arg) => arg !== "--include-untracked");
if (positional.length !== 1) {
  console.error("Usage: node prepare-audit-workspace.mjs [--include-untracked] <target-directory>");
  process.exit(2);
}

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const hashFile = (path) => sha256(readFileSync(path));
const run = (cwd, commandArgs, options = {}) => execFileSync("git", ["-C", cwd, ...commandArgs], {
  encoding: options.buffer ? null : "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});
const tryRun = (cwd, commandArgs) => { try { return run(cwd, commandArgs).trim() || null; } catch { return null; } };
const splitZero = (value) => value.toString().split("\0").filter(Boolean);
const toPosix = (value) => value.split(sep).join("/");

let sourceRoot;
try {
  sourceRoot = realpathSync(resolve(positional[0]));
  if (!statSync(sourceRoot).isDirectory()) throw new Error("target is not a directory");
} catch (error) {
  console.error(`PREPARE_FAILURE: ${error.message}`);
  process.exit(2);
}
const filesystemRoot = resolve(sourceRoot, sep);
if (sourceRoot === filesystemRoot || sourceRoot === realpathSync(homedir())) {
  console.error("PREPARE_FAILURE: filesystem-root and home-root targets are forbidden");
  process.exit(2);
}

const runRoot = mkdtempSync(join(tmpdir(), "pi-code-audit-"));
chmodSync(runRoot, 0o700);
const paths = Object.fromEntries(["mirror", "proof", "evidence", "findings", "logs", "cache", "report"].map((name) => {
  const path = join(runRoot, name);
  mkdirSync(path, { mode: 0o700 });
  return [name, path];
}));

let gitRoot = null;
try {
  gitRoot = realpathSync(run(sourceRoot, ["rev-parse", "--show-toplevel"]).trim());
} catch {
  gitRoot = null;
}
if (gitRoot && gitRoot !== sourceRoot) {
  console.error("PREPARE_FAILURE: a Git target must be the repository root; target/root ambiguity is forbidden");
  process.exit(2);
}

const standardExclusions = [
  ".git", "node_modules", ".next", "dist", "build", "coverage", ".cache", ".parcel-cache",
  ".turbo", ".venv", "venv", "target", "vendor", "__pycache__", ".DS_Store",
];
const excludedNames = new Set(standardExclusions);
const files = [];
const skippedSymlinks = [];
const skippedNonRegular = [];
const skippedMissing = [];

function recordCandidate(relativePath, origin = "tracked") {
  const clean = toPosix(relativePath).replace(/^\.\//, "");
  if (!clean || clean.startsWith("../") || isAbsolute(clean)) throw new Error(`unsafe inventory path: ${relativePath}`);
  const absolute = join(sourceRoot, clean);
  let info;
  try { info = lstatSync(absolute); } catch {
    skippedMissing.push({ path: clean, origin });
    return;
  }
  if (info.isSymbolicLink()) {
    skippedSymlinks.push({ path: clean, origin });
    return;
  }
  if (!info.isFile()) {
    skippedNonRegular.push({ path: clean, origin });
    return;
  }
  const destination = join(paths.mirror, clean);
  mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
  copyFileSync(absolute, destination);
  files.push({ path: clean, origin, size: info.size, sha256: hashFile(absolute) });
}

let inventoryMode;
let git = null;
try {
  if (gitRoot) {
    inventoryMode = includeUntracked ? "git-tracked-plus-untracked" : "git-tracked";
    for (const path of splitZero(run(sourceRoot, ["ls-files", "-z"], { buffer: true }))) recordCandidate(path, "tracked");
    if (includeUntracked) {
      for (const path of splitZero(run(sourceRoot, ["ls-files", "--others", "--exclude-standard", "-z"], { buffer: true }))) recordCandidate(path, "untracked");
    }
    const head = run(sourceRoot, ["rev-parse", "HEAD"]).trim();
    const branch = tryRun(sourceRoot, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
    const statusRaw = run(sourceRoot, ["status", "--porcelain=v1", "-z", "--untracked-files=all"], { buffer: true });
    const diffRaw = run(sourceRoot, ["diff", "--binary", "--no-ext-diff"], { buffer: true });
    const stagedDiffRaw = run(sourceRoot, ["diff", "--cached", "--binary", "--no-ext-diff"], { buffer: true });
    git = {
      head, branch,
      statusSha256: sha256(statusRaw),
      diffSha256: sha256(diffRaw),
      stagedDiffSha256: sha256(stagedDiffRaw),
    };
  } else {
    inventoryMode = "filesystem-conservative";
    const walk = (directory, prefix = "") => {
      for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (excludedNames.has(entry.name)) continue;
        if (entry.isSymbolicLink()) skippedSymlinks.push({ path: rel, origin: "filesystem" });
        else if (entry.isDirectory()) walk(join(directory, entry.name), rel);
        else recordCandidate(rel, "filesystem");
      }
    };
    walk(sourceRoot);
  }
} catch (error) {
  console.error(`PREPARE_FAILURE: ${error.message}`);
  process.exit(2);
}

files.sort((a, b) => a.path.localeCompare(b.path));
skippedSymlinks.sort((a, b) => a.path.localeCompare(b.path));
skippedNonRegular.sort((a, b) => a.path.localeCompare(b.path));
skippedMissing.sort((a, b) => a.path.localeCompare(b.path));
const membershipSha256 = sha256(JSON.stringify(files.map(({ path, origin, size, sha256: hash }) => [path, origin, size, hash])));
const mirrorMembership = files.map(({ path, origin }) => {
  const absolute = join(paths.mirror, path);
  const info = lstatSync(absolute);
  return [path, origin, info.size, hashFile(absolute)];
});
const mirrorSha256 = sha256(JSON.stringify(mirrorMembership));
if (mirrorSha256 !== membershipSha256) {
  console.error("PREPARE_FAILURE: source/mirror hash mismatch");
  process.exit(3);
}

const createdAt = new Date().toISOString();
const manifest = {
  schemaVersion: "1.0",
  runId: runRoot.split(sep).at(-1),
  createdAt,
  sourceRoot,
  runRoot,
  paths,
  inventoryMode,
  includeUntracked,
  exclusions: inventoryMode === "filesystem-conservative" ? standardExclusions : [".git", "Git-ignored files", ...(includeUntracked ? [] : ["untracked files"])],
  git,
  files,
  skippedSymlinks,
  skippedNonRegular,
  skippedMissing,
  membershipSha256,
  mirrorSha256,
  retainedUntilManualCleanup: true,
};
const manifestPath = join(runRoot, "baseline-manifest.json");
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({ status: "PASS", runId: manifest.runId, runRoot, mirror: paths.mirror, manifest: manifestPath, inventoryMode, fileCount: files.length, membershipSha256 }));
