#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const script = fileURLToPath(new URL("../inventory-qa-surfaces.mjs", import.meta.url));
const fixture = fileURLToPath(new URL("./fixtures/inventory", import.meta.url));
const repo = resolve(dirname(script), "../../..");
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const run = (args) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8", stdio: "pipe" });
const before = execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: repo, encoding: "utf8" });
const forbiddenValues = ["FIXTURE_MUST_NOT_EXECUTE", "LIFECYCLE_MUST_NOT_EXECUTE", "CONFIG_MUST_NOT_EXECUTE", "fixture-secret.invalid", "drop table qa_fixture"];

try {
  const first = run([fixture]);
  assert(first.status === 0, `inventory failed: ${first.stderr}`);
  const second = run([fixture]);
  assert(second.status === 0, `second inventory failed: ${second.stderr}`);
  assert(first.stdout === second.stdout, "inventory output is not deterministic");
  const result = JSON.parse(first.stdout);

  assert(result.schemaVersion === "1.0", "schema version is missing");
  assert(result.target === resolve(fixture), "resolved target is incorrect");
  assert(result.mode === "static-read-only", "read-only mode is missing");
  for (const group of ["manifestsAndCommands", "testRunnersHooksFixtures", "browserUi", "statefulResourceMarkers", "destructiveEgressMarkers"]) {
    assert(Array.isArray(result.candidates[group]), `${group} is not an array`);
    const paths = result.candidates[group].map((entry) => entry.path);
    assert(paths.every((path, index) => index === 0 || paths[index - 1].localeCompare(path) <= 0), `${group} is not sorted`);
  }
  const manifest = result.candidates.manifestsAndCommands.find((entry) => entry.path === "package.json");
  assert(manifest, "package manifest was not found");
  assert(JSON.stringify(manifest).includes("posttest") && JSON.stringify(manifest).includes("test"), "package script names were not retained");
  assert(result.candidates.testRunnersHooksFixtures.some((entry) => entry.path === "package.json"), "test command surface was not found");
  assert(result.candidates.browserUi.some((entry) => entry.path === "playwright.config.js"), "browser surface was not found");
  assert(result.candidates.statefulResourceMarkers.some((entry) => entry.path === "playwright.config.js"), "stateful marker surface was not found");
  assert(result.candidates.destructiveEgressMarkers.some((entry) => entry.path === "playwright.config.js"), "destructive/egress surface was not found");
  assert(forbiddenValues.every((value) => !first.stdout.includes(value)), "raw fixture command or resource value leaked");
  assert(!first.stdout.includes("DISPOSABLE_VERIFIED"), "inventory emitted a resource-safety verdict");

  const rootFailure = run([resolve("/")]);
  assert(rootFailure.status !== 0 && rootFailure.stderr.includes("INVENTORY_FAILURE"), "filesystem root was accepted");
  const homeFailure = run([homedir()]);
  assert(homeFailure.status !== 0 && homeFailure.stderr.includes("INVENTORY_FAILURE"), "home root was accepted");

  const after = execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: repo, encoding: "utf8" });
  assert(after === before, "smoke changed repository status");
  console.log("PASS: static QA-surface inventory schema, safety, and determinism");
} catch (error) {
  console.error(`FAIL: ${error.message}`);
  process.exitCode = 1;
}
