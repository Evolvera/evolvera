#!/usr/bin/env node

import {
  lstatSync, readFileSync, readdirSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";

const MAX_FILE_SIZE = 1024 * 1024;
const EXCLUDED_NAMES = new Set([
  ".git", "node_modules", "vendor", "dist", "build", "coverage", ".next",
  ".cache", ".parcel-cache", ".turbo", ".venv", "venv", "target", "__pycache__",
]);
const BINARY_EXTENSIONS = new Set([
  ".7z", ".a", ".bin", ".bmp", ".class", ".dll", ".dylib", ".exe", ".gif", ".gz",
  ".ico", ".jar", ".jpg", ".jpeg", ".mov", ".mp3", ".mp4", ".o", ".pdf", ".png",
  ".so", ".tar", ".webp", ".woff", ".woff2", ".zip",
]);
const GROUPS = [
  "manifestsAndCommands",
  "testRunnersHooksFixtures",
  "browserUi",
  "statefulResourceMarkers",
  "destructiveEgressMarkers",
];

const fail = (message) => {
  console.error(`INVENTORY_FAILURE: ${message}`);
  process.exit(2);
};

const args = process.argv.slice(2);
if (args.length !== 1) fail("exactly one target directory is required");

const requested = resolve(args[0]);
let target;
try {
  const targetInfo = lstatSync(requested);
  if (targetInfo.isSymbolicLink()) fail("target symlinks are forbidden");
  if (!targetInfo.isDirectory()) fail("target is not a directory");
  target = resolve(requested);
} catch (error) {
  if (error?.code === "ENOENT") fail("target directory does not exist");
  fail("target directory cannot be inspected");
}

const filesystemRoot = resolve(target, sep);
const homeRoot = resolve(homedir());
if (target === filesystemRoot || target === homeRoot) {
  fail("filesystem-root and home-root targets are forbidden");
}

const toPosix = (value) => value.split(sep).join("/");
const safeRelative = (value) => {
  const clean = toPosix(value).replace(/^\.\//, "");
  if (!clean || clean === ".." || clean.startsWith("../") || isAbsolute(clean)) {
    throw new Error("unsafe inventory path");
  }
  return clean;
};
const warnings = [];
const warning = (path, reason) => warnings.push({ path, reason });
const candidates = Object.fromEntries(GROUPS.map((group) => [group, []]));

const add = (group, path, markers, scriptNames = []) => {
  const entry = { path, markers: [...new Set(markers)].sort() };
  if (scriptNames.length) entry.scriptNames = [...new Set(scriptNames)].sort();
  candidates[group].push(entry);
};

const markerRules = [
  ["statefulResourceMarkers", /\b(?:database|db|schema|migration|migrations|seed|seeds|queue|topic|bucket|object\s*store|cache|index|storage)\b/i, "stateful-resource"],
  ["destructiveEgressMarkers", /\b(?:truncate|drop\s+(?:table|database|schema)|delete\s+from|reset|purge|rm\s+-rf|exec|spawn|child_process|fetch|axios|https?\s*:\/\/|websocket|network)\b/i, "destructive-or-egress"],
];

const inspectFile = (path, info) => {
  const extension = path.slice(path.lastIndexOf(".")).toLowerCase();
  if (info.size > MAX_FILE_SIZE) {
    warning(path, "oversized-file-skipped");
    return;
  }
  if (BINARY_EXTENSIONS.has(extension)) {
    warning(path, "binary-file-skipped");
    return;
  }

  let text;
  try {
    text = readFileSync(resolve(target, path), "utf8");
  } catch {
    warning(path, "unreadable-file-skipped");
    return;
  }
  if (text.includes("\0")) {
    warning(path, "binary-file-skipped");
    return;
  }

  const name = basename(path).toLowerCase();
  const manifest = name === "package.json" || name === "package-lock.json" || name === "pnpm-lock.yaml" || name === "yarn.lock";
  if (manifest) {
    let scriptNames = [];
    if (name === "package.json") {
      try {
        const parsed = JSON.parse(text);
        scriptNames = Object.keys(parsed?.scripts ?? {}).filter((item) => typeof item === "string");
      } catch {
        warning(path, "invalid-manifest-skipped");
      }
    }
    add("manifestsAndCommands", path, ["manifest"], scriptNames);
    if (scriptNames.length || /(?:test|spec|playwright|cypress|jest|mocha|vitest|hook|fixture)/i.test(text)) {
      add("testRunnersHooksFixtures", path, ["manifest-test-surface"], scriptNames);
    }
  }

  const testMarkers = [];
  if (/(?:^|[/.-])(?:test|tests|spec|specs|fixtures?)(?:[/.-]|$)/i.test(path) || /(?:playwright|cypress|jest|vitest|mocha|ava|pytest|test runner|beforeEach|afterEach|global setup|global teardown)/i.test(`${name}\n${text}`)) {
    testMarkers.push("test-runner-or-fixture");
  }
  if (/(?:hook|setup|teardown|config)/i.test(name)) testMarkers.push("hook-or-config");
  if (testMarkers.length && !manifest) add("testRunnersHooksFixtures", path, testMarkers);

  const browserMarkers = [];
  if (/(?:playwright|cypress|puppeteer|selenium|browser|chromium|webkit|firefox|page\.|viewport|screenshot|click\s*\()/i.test(`${name}\n${text}`)) browserMarkers.push("browser-surface");
  if (/(?:\.html?$|\.tsx$|\.jsx$|\.vue$|\.svelte$|(?:^|\/)(?:ui|components?|frontend|visual)(?:\/|$))/i.test(path)) browserMarkers.push("ui-surface");
  if (browserMarkers.length) add("browserUi", path, browserMarkers);

  for (const [group, rule, label] of markerRules) {
    if (rule.test(text)) add(group, path, [label]);
  }
};

const walk = (directory, prefix = "") => {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    warning(prefix || ".", "directory-not-readable");
    return;
  }
  for (const entry of entries) {
    const path = safeRelative(prefix ? `${prefix}/${entry.name}` : entry.name);
    if (EXCLUDED_NAMES.has(entry.name)) {
      warning(path, "excluded-directory");
      continue;
    }
    const absolute = resolve(target, path);
    let info;
    try { info = lstatSync(absolute); } catch { warning(path, "entry-not-readable"); continue; }
    if (info.isSymbolicLink()) {
      warning(path, "symlink-skipped");
    } else if (info.isDirectory()) {
      walk(absolute, path);
    } else if (info.isFile()) {
      inspectFile(path, info);
    } else {
      warning(path, "non-regular-entry-skipped");
    }
  }
};

walk(target);
for (const group of GROUPS) {
  candidates[group].sort((a, b) => a.path.localeCompare(b.path) || a.markers.join(",").localeCompare(b.markers.join(",")));
}
warnings.sort((a, b) => a.path.localeCompare(b.path) || a.reason.localeCompare(b.reason));

console.log(JSON.stringify({
  schemaVersion: "1.0",
  target,
  mode: "static-read-only",
  exclusions: [...EXCLUDED_NAMES].sort(),
  warnings,
  candidates,
}, null, 2));
