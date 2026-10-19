#!/usr/bin/env node
// Coverage gate: runs the suites under V8 coverage, then reports line + branch coverage for
// (a) server.mjs lines changed vs a git base (read-only `git diff`, default HEAD), (b) public/lib.js, and (c) all of cli-lib.mjs.
// Usage: node test/coverage.mjs [git-base]. Exits 1 below 100%.
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = process.argv[2] || "HEAD";
const lcovPath = path.join(os.tmpdir(), `pi-studio-lcov-${process.pid}.info`);
const suites = ["test/lib.test.mjs", "test/server.test.mjs", "test/smoke.mjs", "test/cli.test.mjs", "test/orca.test.mjs", "test/orca-tasks.test.mjs", "test/tasks-ui.test.mjs", "test/tasks-fake-pi.test.mjs", "test/visibility.test.mjs", "test/watch.test.mjs", "test/sidebar-tree.test.mjs", "test/sidebar-tree-dom.test.mjs"];

const run = spawnSync(process.execPath, [
  "--test", "--experimental-test-coverage",
  "--test-coverage-include=server.mjs", "--test-coverage-include=public/lib.js", "--test-coverage-include=cli-lib.mjs",
  "--test-reporter=dot", "--test-reporter-destination=stdout",
  "--test-reporter=lcov", `--test-reporter-destination=${lcovPath}`,
  ...suites,
], { cwd: root, stdio: "inherit" });
if (run.status !== 0) process.exit(run.status ?? 1);

// A file can appear in several SF records: one per module instance (server.test imports a second
// `server.mjs?main` instance to run the main block). Block ids differ per instance, so merge by line:
// lines take the max hit count; a not-taken branch on line L counts as covered when another instance
// executed L with no not-taken branch on it.
const records = new Map();
let current = null;
for (const line of readFileSync(lcovPath, "utf8").split(/\r?\n/)) {
  if (line.startsWith("SF:")) {
    const name = path.relative(root, line.slice(3)).replace(/\\/g, "/");
    current = { lines: new Map(), branches: [] };
    if (!records.has(name)) records.set(name, []);
    records.get(name).push(current);
  } else if (line.startsWith("DA:")) {
    const [number, count] = line.slice(3).split(",").map(Number);
    current.lines.set(number, count);
  } else if (line.startsWith("BRDA:")) {
    const [number, , , count] = line.slice(5).split(",");
    current.branches.push({ line: Number(number), taken: count !== "-" && Number(count) > 0 });
  }
}
const files = new Map();
for (const [name, instances] of records) {
  const lines = new Map();
  for (const instance of instances) for (const [number, count] of instance.lines) lines.set(number, Math.max(count, lines.get(number) ?? 0));
  const cleanElsewhere = (self, number) => instances.some((other) => other !== self && other.lines.get(number) > 0 &&
    !other.branches.some((branch) => branch.line === number && !branch.taken));
  const branches = instances.flatMap((instance) => instance.branches.map((branch) => ({
    line: branch.line,
    taken: branch.taken || cleanElsewhere(instance, branch.line),
  })));
  files.set(name, { lines, branches });
}
rmSync(lcovPath, { force: true });

function changedLines(file) {
  const diff = execFileSync("git", ["diff", "-U0", base, "--", file], { cwd: root, encoding: "utf8" });
  const lines = new Set();
  for (const match of diff.matchAll(/^@@ -\S+ \+(\d+)(?:,(\d+))? @@/gm)) {
    const start = Number(match[1]);
    const count = match[2] === undefined ? 1 : Number(match[2]);
    for (let offset = 0; offset < count; offset++) lines.add(start + offset);
  }
  return lines;
}

function report(label, data, only) {
  const keep = (line) => !only || only.has(line);
  const lines = [...data.lines].filter(([line]) => keep(line));
  const branches = data.branches.filter((branch) => keep(branch.line));
  const missedLines = lines.filter(([, count]) => count === 0).map(([line]) => line);
  const missedBranches = branches.filter((branch) => !branch.taken).map((branch) => branch.line);
  const pct = (hit, total) => (total ? ((hit / total) * 100).toFixed(2) : "100.00");
  console.log(`${label}: lines ${pct(lines.length - missedLines.length, lines.length)}% (${lines.length - missedLines.length}/${lines.length}), ` +
    `branches ${pct(branches.length - missedBranches.length, branches.length)}% (${branches.length - missedBranches.length}/${branches.length})` +
    `${missedLines.length ? ` · uncovered lines ${missedLines.join(",")}` : ""}${missedBranches.length ? ` · uncovered branches @ ${[...new Set(missedBranches)].join(",")}` : ""}`);
  return missedLines.length + missedBranches.length;
}

const changed = changedLines("server.mjs");
let missed = report(`server.mjs changed vs ${base} (${changed.size} changed lines)`, files.get("server.mjs"), changed);
missed += report("public/lib.js (whole file)", files.get("public/lib.js"));
missed += report("cli-lib.mjs (whole file)", files.get("cli-lib.mjs"));
report("server.mjs (whole file, informational)", files.get("server.mjs"));
process.exit(missed ? 1 : 0);
