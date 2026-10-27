import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { renderPiEntrypoints } from "../users/entrypoints.mjs";
import { createAccount } from "../users/account-session.mjs";

const SDK_ROOT = process.env.SDK_140_ROOT;
const RUN_PARENT = process.env.SDK_140_RUN_PARENT;
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sha = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");

function requireRunRoots() {
  assert.ok(SDK_ROOT && path.isAbsolute(SDK_ROOT), "SDK_140_ROOT must explicitly name the pinned SDK 1.4 package");
  assert.ok(RUN_PARENT && path.isAbsolute(RUN_PARENT), "SDK_140_RUN_PARENT must explicitly name a fresh disposable parent");
  assert.equal(realpathSync.native(RUN_PARENT), path.resolve(RUN_PARENT), "run parent must be canonical");
  assert.ok(lstatSync(RUN_PARENT).isDirectory() && !lstatSync(RUN_PARENT).isSymbolicLink(), "run parent must be a real directory");
  const metadata = JSON.parse(readFileSync(path.join(SDK_ROOT, "package.json"), "utf8"));
  assert.equal(metadata.name, "@earendil-works/pi-coding-agent");
  assert.equal(metadata.version, "1.4.0", "no SDK fallback is permitted");
  assert.deepEqual(readdirSync(RUN_PARENT), [], "run parent must be fresh and empty");
}

test("generated account bootstrap launches SDK 1.4 for the selected synthetic account", (t) => {
  requireRunRoots();
  const run = mkdtempSync(path.join(RUN_PARENT, "sdk-140-runtime-"));
  t.diagnostic(`SDK1.4 generated-bootstrap evidence root: ${run}`);
  const sdkFiles = ["package.json", "dist/main.js", "dist/migrations.js", "dist/core/model-runtime.js", "dist/core/model-config.js"];
  const sourcePins = Object.fromEntries(sdkFiles.map((file) => [file, sha(path.join(SDK_ROOT, file))]));
  try {
    const home = path.join(run, "home");
    const bin = path.join(run, "bin");
    const tmp = path.join(run, "tmp");
    const cwd = path.join(run, "workspace");
    for (const dir of [home, bin, tmp, cwd]) mkdirSync(dir, { recursive: true });
    const registryPath = path.join(home, ".pi", "users", "registry.json");
    mkdirSync(path.dirname(registryPath), { recursive: true });
    createAccount({ registryPath, id: "synthetic", label: "Synthetic" });

    // The registered native faux provider is entirely in-process and has one literal response.
    const extensionPath = path.join(run, "faux-extension.mjs");
    writeFileSync(extensionPath, `import { fauxProvider, fauxAssistantMessage } from ${JSON.stringify(pathToFileURL(path.join(SDK_ROOT, "node_modules/@earendil-works/pi-ai/dist/providers/faux.js")).href)};\nconst faux = fauxProvider({ models: [{ id: "sdk140-regression", contextWindow: 16000, maxTokens: 128 }] });\nfaux.setResponses([fauxAssistantMessage("ok")]);\nexport default function(pi) { pi.registerProvider(faux.provider); }\n`, { flag: "wx" });

    const launcherPath = path.join(REPO, "scripts/users/launcher.mjs");
    const entries = renderPiEntrypoints({ binDir: bin, launcherPath, sdkRoot: SDK_ROOT, platform: "posix" });
    for (const entry of entries) {
      writeFileSync(entry.path, entry.content, { flag: "wx", mode: entry.mode });
      chmodSync(entry.path, entry.mode);
    }
    const env = {
      HOME: home,
      USERPROFILE: home,
      PI_CODING_AGENT_DIR: path.join(home, ".pi", "agent"),
      PI_USERS_REGISTRY: registryPath,
      TMPDIR: tmp,
      TMP: tmp,
      TEMP: tmp,
      XDG_CONFIG_HOME: path.join(home, ".config"),
      XDG_CACHE_HOME: path.join(home, ".cache"),
      XDG_DATA_HOME: path.join(home, ".local", "share"),
      PATH: `${bin}${path.delimiter}/usr/bin:/bin`,
      PI_OFFLINE: "1",
      PI_SKIP_VERSION_CHECK: "1",
      JITI_FS_CACHE: "0",
    };
    const result = spawnSync(path.join(bin, "pi"), ["-u", "synthetic", "-p", "responda ok", "--model", "faux/sdk140-regression", "--extension", extensionPath, "--no-session", "--offline", "--no-extensions", "--no-skills", "--no-prompt-templates", "--no-context-files", "--no-themes", "--no-mcp"], {
      cwd, env, encoding: "utf8", timeout: 60_000,
    });
    assert.equal(result.error, undefined, `generated pi command spawn failed: ${result.error?.code ?? result.error}`);
    assert.equal(result.status, 0, `generated pi command failed (signal ${result.signal}):\n${result.stderr}`);
    assert.equal(result.stdout.trim(), "ok", `expected the faux provider's literal response, got: ${result.stdout}`);
    assert.doesNotMatch(result.stderr, /USER_LAUNCH_FAILED/);
    assert.deepEqual(Object.fromEntries(sdkFiles.map((file) => [file, sha(path.join(SDK_ROOT, file))])), sourcePins, "installed SDK sources must remain unchanged");
  } finally {
    rmSync(run, { recursive: true, force: true });
  }
});
