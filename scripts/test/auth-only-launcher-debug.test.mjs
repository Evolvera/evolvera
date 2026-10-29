import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { renderPiEntrypoints } from "../users/entrypoints.mjs";

const repo = fileURLToPath(new URL("../..", import.meta.url));
const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-launcher-debug-"));
const binDir = path.join(root, "bin");
const fakeLauncher = path.join(root, "fake-launcher.mjs");
const sdkRoot = path.join(root, "sdk");
const bootstrap = path.join(binDir, "pi-account-entry.mjs");
fs.mkdirSync(binDir);
fs.mkdirSync(sdkRoot);
fs.writeFileSync(fakeLauncher, 'export async function launchUser() { throw Object.assign(new Error("synthetic diagnostic"), { code: "SYNTHETIC_FAILURE" }); }\n');
for (const entry of renderPiEntrypoints({ binDir, launcherPath: fakeLauncher, sdkRoot, platform: "posix" })) {
  fs.writeFileSync(entry.path, entry.content, { mode: entry.mode });
}

after(() => fs.rmSync(root, { recursive: true, force: true }));

function run(script, extraEnv = {}) {
  return spawnSync(process.execPath, [script], {
    cwd: root,
    encoding: "utf8",
    timeout: 10000,
    env: { PATH: path.dirname(process.execPath), HOME: root, TMPDIR: root, ...extraEnv },
  });
}

test("generated bootstrap reports only the safe code unless PI_DEBUG is defined", () => {
  const normal = run(bootstrap);
  assert.equal(normal.status, 1);
  assert.equal(normal.stderr, "SYNTHETIC_FAILURE\n");

  const debug = run(bootstrap, { PI_DEBUG: "" });
  assert.equal(debug.status, 1);
  assert.equal(debug.stderr, "SYNTHETIC_FAILURE\nsynthetic diagnostic\n");
});

test("direct launcher reports only the safe code unless PI_DEBUG is defined", () => {
  const launcher = path.join(repo, "scripts/users/launcher.mjs");
  const context = { PI_ACCOUNT_LAUNCH_CONTEXT: "invalid" };
  const normal = run(launcher, context);
  assert.equal(normal.status, 1);
  assert.equal(normal.stderr, "ACCOUNT_LAUNCH_CONTEXT_INVALID\n");

  const debug = run(launcher, { ...context, PI_DEBUG: "" });
  assert.equal(debug.status, 1);
  assert.equal(debug.stderr, "ACCOUNT_LAUNCH_CONTEXT_INVALID\nACCOUNT_LAUNCH_CONTEXT_INVALID\n");
});
