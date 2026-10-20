import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { renderPiEntrypoints } from "../users/entrypoints.mjs";

const repo = fileURLToPath(new URL("../..", import.meta.url));
const powershellExe = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
const nodeExe = "C:\\Users\\kevin\\AppData\\Local\\nvm\\v24.20.0\\node.exe";
const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-entrypoints-preparation-"));
const binDir = path.join(root, "bin with spaces");
const sdkRoot = path.join(root, "fake-sdk");
const launcherPath = path.join(root, "fake-launcher.mjs");
const capturePath = path.join(root, "capture.json");
const protectedFiles = [
  path.join(repo, "scripts/users/launcher.mjs"), path.join(repo, "scripts/users/environment.mjs"),
  path.join(repo, "scripts/test/auth-only-child-context.test.mjs"),
  "C:\\Users\\kevin\\AppData\\Local\\nvm\\v24.20.0\\pi.cmd",
  "C:\\Users\\kevin\\AppData\\Local\\nvm\\v24.20.0\\pi.ps1",
  "C:\\Users\\kevin\\AppData\\Local\\nvm\\v24.20.0\\pi",
];
const protectedHashes = Object.fromEntries(protectedFiles.map((file) => [file, createHash("sha256").update(fs.readFileSync(file)).digest("hex")]));
fs.mkdirSync(binDir, { recursive: true });
fs.mkdirSync(sdkRoot, { recursive: true });
fs.writeFileSync(launcherPath, `import fs from "node:fs";\nexport async function launchUser(argv, options) {\n let input = ""; for await (const chunk of process.stdin) input += chunk;\n fs.writeFileSync(process.env.PI_ENTRY_CAPTURE, JSON.stringify({ argv, input, packageRoot: options.packageRoot }));\n process.exitCode = 23;\n}\n`, { flag: "wx" });
const manifestPath = path.join(root, "resource-manifest.json");
const manifest = {
  root, ownership: "unique fs.mkdtemp root; retained, no cleanup", protectedHashes,
  writable: [binDir, path.join(binDir, "pi-account-entry.mjs"), path.join(binDir, "pi.cmd"), path.join(binDir, "pi.ps1"), path.join(binDir, "pi"), launcherPath, sdkRoot, capturePath, manifestPath, path.join(root, "resource-postcheck.json")],
  child: "fake launcher only; fake SDK is an empty directory; no real launcher/SDK/providers/network/package tools",
  env: "minimal explicit whitelist; HOME/USERPROFILE/APPDATA/LOCALAPPDATA/TEMP/TMP/TMPDIR under owned root; NODE_OPTIONS/NODE_PATH/context/provider keys absent",
};
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });

function childEnv(extra = {}) {
  return {
    SystemRoot: process.env.SystemRoot,
    WINDIR: process.env.WINDIR,
    ComSpec: process.env.ComSpec,
    PATH: path.dirname(nodeExe),
    PATHEXT: ".COM;.EXE;.BAT;.CMD", // Required for PowerShell to keep native execution in this console.
    HOME: root, USERPROFILE: root, APPDATA: root, LOCALAPPDATA: root,
    TEMP: root, TMP: root, TMPDIR: root,
    PI_ENTRY_CAPTURE: capturePath,
    ...extra,
  };
}
function render(platform = "win32") {
  const entries = renderPiEntrypoints({ binDir, nodePath: nodeExe, launcherPath, sdkRoot, platform });
  for (const entry of entries) fs.writeFileSync(entry.path, entry.content, { mode: entry.mode, flag: "wx" });
  return entries;
}
function capture() { return JSON.parse(fs.readFileSync(capturePath, "utf8")); }

test("renderer validates paths/platform/required values and emits only inert explicit-path artifacts", () => {
  assert.throws(() => renderPiEntrypoints({ sdkRoot, platform: "win32" }), /ENTRYPOINTS_INVALID/);
  assert.throws(() => renderPiEntrypoints({ binDir, platform: "win32" }), /ENTRYPOINTS_INVALID/);
  assert.throws(() => renderPiEntrypoints({ binDir, sdkRoot, platform: "other" }), /ENTRYPOINTS_INVALID/);
  assert.throws(() => renderPiEntrypoints({ binDir: "relative", sdkRoot, platform: "win32" }), /ENTRYPOINTS_INVALID/);
  assert.throws(() => renderPiEntrypoints({ binDir, sdkRoot, launcherPath: "relative", platform: "win32" }), /ENTRYPOINTS_INVALID/);
  const entries = renderPiEntrypoints({ binDir, nodePath: nodeExe, launcherPath, sdkRoot, platform: "win32" });
  assert.deepEqual(entries.map(({ path: p }) => path.basename(p)), ["pi-account-entry.mjs", "pi.cmd", "pi.ps1", "pi"]);
  assert.match(entries[0].content, /packageRoot: "/);
  assert.equal(entries.some(({ content }) => /process\.env\.(?:PI_ACCOUNT_LAUNCH_CONTEXT|OPENAI_API_KEY|ANTHROPIC_API_KEY)/u.test(content)), false);
  assert.equal(fs.existsSync(path.join(binDir, "pi-account-entry.mjs")), false, "rendering performs no filesystem write");
  assert.throws(() => renderPiEntrypoints({ binDir, sdkRoot, platform: "win32", nodePath: "C:\\bad%PATH%\\node.exe" }), /unsafe command character/);
});

test("generated cmd shim routes literal argv/stdin/exit status only to synthetic launcher", () => {
  render();
  const shim = path.join(binDir, "pi.cmd");
  const command = `call "${shim}" "space argument" --literal "ampersand&pipe|" -- "--usuario-context" "literal value"`;
  const result = spawnSync(path.join(process.env.SystemRoot, "System32", "cmd.exe"), ["/d", "/s", "/c", command], { encoding: "utf8", input: "stdin sentinel\n", env: childEnv(), timeout: 15000, windowsHide: true, windowsVerbatimArguments: true });
  assert.equal(result.status, 23, result.stderr);
  assert.deepEqual(capture(), { argv: ["space argument", "--literal", "ampersand&pipe|", "--", "--usuario-context", "literal value"], input: "stdin sentinel\n", packageRoot: sdkRoot });
});

test("generated PowerShell shim routes literal argv/stdin/exit status with profiles disabled", () => {
  const shim = path.join(binDir, "pi.ps1");
  const command = `& { 'powershell stdin' } | & '${shim}' space-argument --literal semi-colon; exit $LASTEXITCODE`;
  const result = spawnSync(powershellExe, ["-NoProfile", "-NonInteractive", "-Command", command], { encoding: "utf8", env: childEnv(), timeout: 15000, windowsHide: true });
  assert.equal(result.status, 23, `stdout=${result.stdout} stderr=${result.stderr}`);
  assert.deepEqual(capture(), { argv: ["space-argument", "--literal", "semi-colon"], input: "powershell stdin\r\n", packageRoot: sdkRoot });
});

test("PowerShell preparation mode prints JSON only and returns before installer operations", () => {
  const installer = path.join(repo, "install.ps1");
  const result = spawnSync(powershellExe, ["-NoProfile", "-NonInteractive", "-File", installer, "-PrepareUsuarioEntry", "-UsuarioBinDir", binDir, "-UsuarioSdkRoot", sdkRoot, "-UsuarioNodePath", nodeExe], { encoding: "utf8", env: childEnv({ PATH: `${path.dirname(nodeExe)};${process.env.SystemRoot}\\System32` }), timeout: 15000, windowsHide: true });
  assert.equal(result.status, 0, `stdout=${result.stdout} stderr=${result.stderr}`);
  const generated = JSON.parse(result.stdout);
  assert.deepEqual(generated.map(({ path: p }) => path.basename(p)), ["pi-account-entry.mjs", "pi.cmd", "pi.ps1", "pi"]);
  assert.equal(result.stdout.trim().split(/\r?\n/u).length, 1, "stdout is one parseable JSON document, without host decoration");
});

test("Windows Git Bash shim executes only the synthetic launcher", () => {
  const result = spawnSync("C:/Program Files/Git/bin/sh.exe", [path.join(binDir, "pi").replaceAll(String.fromCharCode(92), "/"), "space argument", "--", "literal value"], { encoding: "utf8", input: "shell stdin\n", env: childEnv(), timeout: 15000, windowsHide: true });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 23, result.stderr);
  assert.deepEqual(capture(), { argv: ["space argument", "--", "literal value"], input: "shell stdin\n", packageRoot: sdkRoot });
});

test("preparation branches precede every ordinary installer operation; POSIX output remains an unexecuted static proof", () => {
  const ps = fs.readFileSync(path.join(repo, "install.ps1"), "utf8");
  const sh = fs.readFileSync(path.join(repo, "install.sh"), "utf8");
  assert.ok(ps.indexOf("if ($PrepareUsuarioEntry)") < ps.indexOf("$ErrorActionPreference = \"Stop\""));
  assert.ok(sh.indexOf('if [ "${1:-}" = "--prepare-usuario-entry" ]') < sh.indexOf("# ── Corte seguro do Flow"));
  const posix = renderPiEntrypoints({ binDir: "/tmp/pi-synthetic/bin", nodePath: "/usr/bin/node", launcherPath: "/tmp/pi-synthetic/launcher.mjs", sdkRoot: "/tmp/pi-synthetic/sdk", platform: "posix" });
  assert.match(posix.find(({ path: p }) => path.posix.basename(p) === "pi").content, /exec .*"\$@"/u);
  assert.match(posix[0].content, /file:\/\/\/tmp\/pi-synthetic\/launcher\.mjs/u, "POSIX preparation is independent of the renderer host OS");
  const postHashes = Object.fromEntries(protectedFiles.map((file) => [file, createHash("sha256").update(fs.readFileSync(file)).digest("hex")]));
  assert.deepEqual(postHashes, protectedHashes, "protected source/wrapper hashes are unchanged");
  fs.writeFileSync(path.join(root, "resource-postcheck.json"), `${JSON.stringify({ retained: true, createdWithinRoot: fs.readdirSync(binDir), protectedHashes: postHashes }, null, 2)}\n`, { flag: "wx" });
  console.log(`SYNTHETIC_RESOURCE_MANIFEST=${manifestPath}`);
});
