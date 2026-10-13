import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { decodeAccountLaunchContext, encodeAccountLaunchContext } from "../users/environment.mjs";
import { buildAccountChildCommand, createOrcaChildLaunch } from "../users/child-command.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "auth-only-child-command-"));
const registryPath = path.join(root, "shared", "users.json");
const entrypointPath = path.join(root, "fake-entrypoint.mjs");
fs.writeFileSync(entrypointPath, [
  "const values = []; for await (const chunk of process.stdin) values.push(chunk);",
  "process.stdout.write(JSON.stringify({ argv: process.argv.slice(2), context: process.env.PI_ACCOUNT_LAUNCH_CONTEXT ?? null }));",
  "if (process.argv.at(-1) === '--fail') process.exitCode = 23;",
  "",
].join("\n"), { flag: "wx" });
const context = (accountId) => Object.freeze({ version: 1, accountId, registryPath });
const encoded = (accountId) => encodeAccountLaunchContext(context(accountId));
const windows = process.platform === "win32";
const nodePath = process.execPath;
const windowsShells = ["cmd.exe", "powershell.exe", "pwsh.exe"];
const shellEnv = Object.freeze(Object.fromEntries(Object.entries({
  SystemRoot: process.env.SystemRoot,
  windir: process.env.windir,
  PATH: process.env.PATH,
  PATHEXT: process.env.PATHEXT,
  ComSpec: process.env.ComSpec,
  SYSTEMDRIVE: process.env.SYSTEMDRIVE,
  HOME: root,
  USERPROFILE: root,
  APPDATA: path.join(root, "AppData", "Roaming"),
  LOCALAPPDATA: path.join(root, "AppData", "Local"),
  TEMP: root,
  TMP: root,
  TMPDIR: root,
  PI_ACCOUNT_LAUNCH_CONTEXT: "synthetic-inherited-context",
}).filter(([, value]) => typeof value === "string")));
fs.writeFileSync(path.join(root, "resource-manifest.json"), `${JSON.stringify({
  root,
  ownership: "unique fs.mkdtemp root; synthetic fake entrypoint and retained artifacts",
  executed: windows ? "Node plus local cmd.exe, Windows PowerShell and pwsh; fake entrypoint only" : "Node test process only; shell execution skipped",
  imports: ["Node built-ins", "users/environment.mjs", "users/child-command.mjs"],
  forbidden: ["SDK/provider/credentials/private stores", "network", "PI/Orca/DEV CLI", "cleanup of prior roots"],
  environment: "literal OS essentials plus run-owned HOME/temp roots and synthetic context; no inherited auth/NODE_OPTIONS/NODE_PATH",
}, null, 2)}\n`, { flag: "wx" });

const commandOptions = (accountId = "alpha", shell = "powershell.exe", argv = []) => ({
  context: encoded(accountId), nodePath, entrypointPath, shell, argv,
});

test("canonical contexts bind alpha and beta independently without changing inputs", () => {
  const alpha = context("alpha"), beta = context("beta");
  const alphaBefore = structuredClone(alpha), betaBefore = structuredClone(beta);
  const alphaCommand = buildAccountChildCommand(commandOptions("alpha"));
  const betaCommand = buildAccountChildCommand(commandOptions("beta"));
  assert.match(alphaCommand, new RegExp(`--usuario-context=${encoded("alpha")}`));
  assert.match(betaCommand, new RegExp(`--usuario-context=${encoded("beta")}`));
  assert.notEqual(alphaCommand, betaCommand);
  assert.deepEqual(alpha, alphaBefore);
  assert.deepEqual(beta, betaBefore);
  assert.deepEqual(decodeAccountLaunchContext(encoded("alpha")), alphaBefore);
  assert.throws(() => buildAccountChildCommand(commandOptions("alpha", "powershell.exe", ["--usuario-context=x"])), { code: "ACCOUNT_CHILD_COMMAND_INVALID" });
  assert.doesNotThrow(() => buildAccountChildCommand(commandOptions("alpha", "powershell.exe", ["--", "--usuario-context=x"])));
});

test("shell quoting preserves metacharacters, spaces, apostrophes and post-- literals", () => {
  const args = ["space here", "it's", "ampersand&pipe|", "$(literal); *", "--", "--usuario-context", "literal value"];
  const ps = buildAccountChildCommand(commandOptions("alpha", "powershell.exe", args));
  assert.match(ps, /'it''s'/);
  assert.match(ps, /'ampersand&pipe\|' /);
  assert.match(ps, /'--usuario-context' 'literal value'/);
  const sh = buildAccountChildCommand({ ...commandOptions("alpha", "sh", args), nodePath: "/usr/bin/node", entrypointPath: "/tmp/fake-entrypoint.mjs" });
  assert.match(sh, /'it'\\''s'/);
  assert.match(sh, /--usuario-context/);
  assert.match(buildAccountChildCommand(commandOptions("alpha", "cmd.exe", ["space here", "ampersand&pipe|"])), /"space here" "ampersand&pipe\|"/);
  for (const invalid of ['a"b', "%PATH%", "bang!"]) {
    assert.throws(() => buildAccountChildCommand(commandOptions("alpha", "cmd.exe", [invalid])), { code: "ACCOUNT_CHILD_COMMAND_INVALID" });
  }
  assert.throws(() => buildAccountChildCommand(commandOptions("alpha", "sh", ["bad\nvalue"])), { code: "ACCOUNT_CHILD_COMMAND_INVALID" });
});

test("requires a canonical context, absolute compatible paths, explicit shell and worktree", () => {
  assert.throws(() => buildAccountChildCommand({ ...commandOptions(), context: undefined }), { code: "ACCOUNT_LAUNCH_CONTEXT_INVALID" });
  assert.throws(() => buildAccountChildCommand({ ...commandOptions(), nodePath: "node.exe" }), { code: "ACCOUNT_CHILD_COMMAND_INVALID" });
  assert.throws(() => buildAccountChildCommand({ ...commandOptions(), shell: "sh" }), { code: "ACCOUNT_CHILD_COMMAND_INVALID" });
  assert.throws(() => buildAccountChildCommand({ ...commandOptions(), shell: "unknown" }), { code: "ACCOUNT_CHILD_COMMAND_INVALID" });
  assert.throws(() => buildAccountChildCommand({ ...commandOptions(), nodePath: "/mnt/c/node.exe" }), { code: "ACCOUNT_CHILD_COMMAND_INVALID" });
  assert.throws(() => createOrcaChildLaunch({ ...commandOptions(), worktree: undefined }), { code: "ACCOUNT_CHILD_COMMAND_INVALID" });
  assert.throws(() => createOrcaChildLaunch({ ...commandOptions(), worktree: "  " }), { code: "ACCOUNT_CHILD_COMMAND_INVALID" });
});

test("Orca terminal argv exactly uses documented explicit selector and shell options", () => {
  const win = createOrcaChildLaunch({ ...commandOptions(), shell: "pwsh.exe", worktree: "exact-selector" });
  assert.deepEqual(win.argv, ["terminal", "create", "--worktree", "exact-selector", "--shell", "pwsh.exe", "--command", win.command, "--json"]);
  assert.equal(Object.isFrozen(win), true);
  assert.equal(Object.isFrozen(win.argv), true);
  const posix = createOrcaChildLaunch({ ...commandOptions("beta", "sh", []), nodePath: "/usr/bin/node", entrypointPath: "/tmp/fake.mjs", worktree: "explicit-posix" });
  assert.deepEqual(posix.argv, ["terminal", "create", "--worktree", "explicit-posix", "--command", posix.command, "--json"]);
});

test("actual local Windows shells run only the synthetic fake entrypoint", { skip: !windows }, () => {
  for (const shell of windowsShells) {
    const native = ["space value", "it's", "ampersand&pipe|", "$(literal); *", String.fromCharCode(92) + "trailing" + String.fromCharCode(92), "--", "--usuario-context", "literal" ];
    const launch = buildAccountChildCommand(commandOptions("beta", shell, native));
    const args = shell === "cmd.exe"
      ? ["/d", "/s", "/c", launch]
      : ["-NoProfile", "-NonInteractive", "-Command", launch];
    const executable = shell === "pwsh.exe"
      ? "C:\\Users\\kevin\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe"
      : shell === "cmd.exe"
        ? path.join(process.env.SystemRoot, "System32", "cmd.exe")
        : path.join(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    const result = spawnSync(executable, args, { cwd: root, env: shellEnv, encoding: "utf8", timeout: 15000, windowsHide: true, windowsVerbatimArguments: shell === "cmd.exe" });
    assert.equal(result.error, undefined, `${shell} spawn failed`);
    assert.equal(result.status, 0, `${shell}: ${result.stderr}\ncommand=${launch}`);
    assert.deepEqual(JSON.parse(result.stdout), {
      argv: [`--usuario-context=${encoded("beta")}`, ...native],
      context: null,
    });
    assert.equal(shellEnv.PI_ACCOUNT_LAUNCH_CONTEXT, "synthetic-inherited-context", "parent env object remains unchanged");

    const failure = spawnSync(executable, shell === "cmd.exe"
      ? ["/d", "/s", "/c", buildAccountChildCommand(commandOptions("beta", shell, ["--fail"] ))]
      : ["-NoProfile", "-NonInteractive", "-Command", `${buildAccountChildCommand(commandOptions("beta", shell, ["--fail"]))}; exit $LASTEXITCODE`],
    { cwd: root, env: shellEnv, encoding: "utf8", timeout: 15000, windowsHide: true, windowsVerbatimArguments: shell === "cmd.exe" });
    assert.equal(failure.status, 23, `${shell} must preserve child exit code: ${failure.stderr}`);
  }
});

after(() => {
  fs.writeFileSync(path.join(root, "resource-postcheck.json"), `${JSON.stringify({ runRoot: root, syntheticOnly: true, retained: true }, null, 2)}\n`, { flag: "wx" });
  console.log(`SYNTHETIC_RESOURCE_MANIFEST=${path.join(root, "resource-manifest.json")}`);
});
