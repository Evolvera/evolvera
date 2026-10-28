import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("../..", import.meta.url));
const cli = path.join(repo, "scripts/users/entrypoints.mjs");
const sdk14 = process.env.SDK_140_ROOT;
assert.ok(sdk14 && path.isAbsolute(sdk14), "SDK_140_ROOT must explicitly name the pinned SDK 1.4 fixture");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-entrypoint-pins-"));
const fakeSdk = path.join(root, "unsupported-sdk");
fs.mkdirSync(fakeSdk);
fs.writeFileSync(path.join(fakeSdk, "package.json"), JSON.stringify({ name: "@earendil-works/pi-coding-agent", version: "9.9.9" }) + "\n", { flag: "wx" });
after(() => fs.rmSync(root, { recursive: true, force: true }));

function run(sdkRoot) {
  return spawnSync(process.execPath, [cli, "--bin-dir", path.join(root, "bin"), "--sdk-root", sdkRoot, "--platform", "posix"], {
    encoding: "utf8", timeout: 15000,
    env: { PATH: process.env.PATH, HOME: root, TMPDIR: root, TEMP: root, TMP: root },
  });
}

test("entrypoint CLI validates supported SDK pins before emitting descriptors", () => {
  assert.equal(fs.existsSync(sdk14), true, "the installed pinned SDK 1.4 fixture is available");
  const supported = run(sdk14);
  assert.equal(supported.status, 0, supported.stderr);
  assert.equal(JSON.parse(supported.stdout).some(({ path: entry }) => entry.endsWith("pi-account-entry.mjs")), true);

  const unsupported = run(fakeSdk);
  assert.notEqual(unsupported.status, 0);
  assert.equal(unsupported.stdout, "", "rejected SDK produces no JSON descriptors");
  assert.match(unsupported.stderr, /unsupported version/u);
  assert.deepEqual(fs.readdirSync(root).filter((entry) => entry === "bin"), [], "validation creates no publication directory");
});
