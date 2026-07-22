#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync, readdirSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve, sep } from "node:path";

if (process.argv.length !== 3) {
  console.error("Usage: node verify-source-unchanged.mjs <baseline-manifest.json>");
  process.exit(2);
}
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const hashFile = (path) => sha256(readFileSync(path));
const runGit = (cwd, args, buffer = false) => execFileSync("git", ["-C", cwd, ...args], { encoding: buffer ? null : "utf8", stdio: ["ignore", "pipe", "pipe"] });
const tryGit = (cwd, args) => { try { return runGit(cwd, args).trim() || null; } catch { return null; } };
const splitZero = (value) => value.toString().split("\0").filter(Boolean);
const toPosix = (value) => value.split(sep).join("/");

let baseline;
let manifestPath;
try {
  manifestPath = realpathSync(resolve(process.argv[2]));
  baseline = JSON.parse(readFileSync(manifestPath, "utf8"));
} catch (error) {
  console.error(`VERIFY_FAILURE: ${error.message}`);
  process.exit(2);
}
const runRoot = realpathSync(baseline.runRoot);
if (!manifestPath.startsWith(`${runRoot}${sep}`) || join(runRoot, "baseline-manifest.json") !== manifestPath) {
  console.error("VERIFY_FAILURE: baseline manifest is not the run-root manifest");
  process.exit(2);
}
const sourceRoot = realpathSync(baseline.sourceRoot);
const files = [];
const skippedSymlinks = [];
const skippedNonRegular = [];
const skippedMissing = [];

function recordCandidate(relativePath, origin) {
  const clean = toPosix(relativePath).replace(/^\.\//, "");
  if (!clean || clean.startsWith("../") || isAbsolute(clean)) throw new Error(`unsafe inventory path: ${relativePath}`);
  const absolute = join(sourceRoot, clean);
  let info;
  try { info = lstatSync(absolute); } catch { skippedMissing.push({ path: clean, origin }); return; }
  if (info.isSymbolicLink()) skippedSymlinks.push({ path: clean, origin });
  else if (!info.isFile()) skippedNonRegular.push({ path: clean, origin });
  else files.push({ path: clean, origin, size: info.size, sha256: hashFile(absolute) });
}

let git = null;
try {
  if (baseline.inventoryMode.startsWith("git-")) {
    for (const path of splitZero(runGit(sourceRoot, ["ls-files", "-z"], true))) recordCandidate(path, "tracked");
    if (baseline.includeUntracked) {
      for (const path of splitZero(runGit(sourceRoot, ["ls-files", "--others", "--exclude-standard", "-z"], true))) recordCandidate(path, "untracked");
    }
    const statusRaw = runGit(sourceRoot, ["status", "--porcelain=v1", "-z", "--untracked-files=all"], true);
    const diffRaw = runGit(sourceRoot, ["diff", "--binary", "--no-ext-diff"], true);
    const stagedDiffRaw = runGit(sourceRoot, ["diff", "--cached", "--binary", "--no-ext-diff"], true);
    git = {
      head: runGit(sourceRoot, ["rev-parse", "HEAD"]).trim(),
      branch: tryGit(sourceRoot, ["symbolic-ref", "--quiet", "--short", "HEAD"]),
      statusSha256: sha256(statusRaw), diffSha256: sha256(diffRaw), stagedDiffSha256: sha256(stagedDiffRaw),
    };
  } else if (baseline.inventoryMode === "filesystem-conservative") {
    const excluded = new Set(baseline.exclusions);
    const walk = (directory, prefix = "") => {
      for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (excluded.has(entry.name)) continue;
        if (entry.isSymbolicLink()) skippedSymlinks.push({ path: rel, origin: "filesystem" });
        else if (entry.isDirectory()) walk(join(directory, entry.name), rel);
        else recordCandidate(rel, "filesystem");
      }
    };
    walk(sourceRoot);
  } else throw new Error(`unsupported inventory mode: ${baseline.inventoryMode}`);
} catch (error) {
  console.error(`VERIFY_FAILURE: ${error.message}`);
  process.exit(2);
}
for (const list of [files, skippedSymlinks, skippedNonRegular, skippedMissing]) list.sort((a, b) => a.path.localeCompare(b.path));
const membershipSha256 = sha256(JSON.stringify(files.map(({ path, origin, size, sha256: hash }) => [path, origin, size, hash])));
const comparisons = {
  membershipAndContent: membershipSha256 === baseline.membershipSha256,
  selectedFiles: JSON.stringify(files) === JSON.stringify(baseline.files),
  skippedSymlinks: JSON.stringify(skippedSymlinks) === JSON.stringify(baseline.skippedSymlinks),
  skippedNonRegular: JSON.stringify(skippedNonRegular) === JSON.stringify(baseline.skippedNonRegular),
  skippedMissing: JSON.stringify(skippedMissing) === JSON.stringify(baseline.skippedMissing),
  head: JSON.stringify(git?.head ?? null) === JSON.stringify(baseline.git?.head ?? null),
  branch: JSON.stringify(git?.branch ?? null) === JSON.stringify(baseline.git?.branch ?? null),
  status: JSON.stringify(git?.statusSha256 ?? null) === JSON.stringify(baseline.git?.statusSha256 ?? null),
  diff: JSON.stringify(git?.diffSha256 ?? null) === JSON.stringify(baseline.git?.diffSha256 ?? null),
  stagedDiff: JSON.stringify(git?.stagedDiffSha256 ?? null) === JSON.stringify(baseline.git?.stagedDiffSha256 ?? null),
};
const passed = Object.values(comparisons).every(Boolean);
const receipt = {
  schemaVersion: "1.0", checkedAt: new Date().toISOString(), status: passed ? "PASS" : "INTEGRITY_FAILURE",
  baselineManifest: manifestPath, sourceRoot, membershipSha256, comparisons,
  note: passed ? "Selected source state exactly matches the baseline." : "A concurrent or other source change was observed; this receipt does not attribute causation.",
};
const receiptPath = join(runRoot, "logs", "source-integrity.json");
writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
if (!passed) {
  console.error(`INTEGRITY_FAILURE: selected membership/content or Git state changed; receipt=${receiptPath}`);
  process.exit(1);
}
console.log(JSON.stringify({ status: "PASS", receipt: receiptPath, membershipSha256 }));
