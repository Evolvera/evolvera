import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "../..");
const lib = await import(pathToFileURL(path.join(root, "scripts/lib/obscura-capture.mjs")));
const script = path.join(root, "scripts/capture-home-screenshots.mjs");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "evolvera-capture-engine-"));

try {
  // resolveObscura precedence: explicit override wins, then PATH, then ~/.pi/agent/bin.
  const fakeHome = path.join(temp, "home");
  const fakeBin = path.join(temp, "pathbin");
  fs.mkdirSync(path.join(fakeHome, ".pi", "agent", "bin"), { recursive: true });
  fs.mkdirSync(fakeBin, { recursive: true });
  fs.writeFileSync(path.join(fakeHome, ".pi", "agent", "bin", "obscura"), "");
  fs.writeFileSync(path.join(fakeBin, "obscura"), "");

  assert.equal(
    lib.resolveObscura({ PI_OBSCURA_BIN: "/custom/obscura", HOME: fakeHome }, fakeBin),
    "/custom/obscura",
    "explicit override must win",
  );
  assert.equal(
    lib.resolveObscura({ HOME: fakeHome }, fakeBin),
    path.join(fakeBin, "obscura"),
    "PATH must beat the harness bin directory",
  );
  assert.equal(
    lib.resolveObscura({ HOME: fakeHome }, path.join(temp, "empty")),
    path.join(fakeHome, ".pi", "agent", "bin", "obscura"),
    "harness bin directory is the last resort",
  );
  assert.equal(
    lib.resolveObscura({ HOME: path.join(temp, "nohome") }, path.join(temp, "empty")),
    undefined,
    "missing binary resolves to undefined",
  );

  // A free port must actually be bindable right after it is reported.
  const port = await lib.findFreePort();
  assert.ok(Number.isInteger(port) && port > 0, "findFreePort returned no port");

  // Unknown engine is rejected before any browser work.
  const html = path.join(temp, "index.html");
  fs.writeFileSync(html, "<!doctype html><title>x</title><h1>x</h1>");
  const bad = spawnSync(process.execPath, [script, html, path.join(temp, "out")], {
    encoding: "utf8",
    env: { ...process.env, PI_BROWSER: "netscape" },
  });
  assert.equal(bad.status, 2, "unknown engine must exit 2");
  assert.match(bad.stderr, /Unknown PI_BROWSER/);
  assert.equal(fs.existsSync(path.join(temp, "out")), false, "rejected engine must not create output");

  // The pinned Playwright version replaces the drifting `@latest` selector.
  const source = fs.readFileSync(script, "utf8");
  assert.match(source, /`playwright@\$\{PLAYWRIGHT_VERSION\}`/, "install must resolve through the pinned constant");
  assert.doesNotMatch(source, /[`"']playwright@latest[`"']/, "script must not select a floating Playwright version");
  assert.match(source, /const PLAYWRIGHT_VERSION = "\d+\.\d+\.\d+";/, "pinned Playwright version missing");
  assert.doesNotMatch(
    source,
    /npx.*playwright@\$\{PLAYWRIGHT_VERSION\}.*install chromium/,
    "chromium install must stay behind the retry path",
  );

  console.log("capture-engine smoke: PASS (DISPOSABLE_VERIFIED)");
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}