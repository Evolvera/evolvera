import assert from "node:assert/strict";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sandbox = mkdtempSync(path.join(tmpdir(), "plastic-memory-install-"));
const sourceRoot = path.join(sandbox, "source");
const destinationHome = path.join(sandbox, "destination-home");
const fakeBin = path.join(sandbox, "bin");
const sourceExtensionRoot = path.join(repositoryRoot, "extensions");

function writeExecutable(name, content) {
  mkdirSync(fakeBin, { recursive: true });
  const file = path.join(fakeBin, name);
  writeFileSync(file, content);
  chmodSync(file, 0o755);
}
function fixtureSource(root) {
  mkdirSync(root, { recursive: true });
  mkdirSync(path.join(root, "config"), { recursive: true });
  mkdirSync(path.join(root, "agents"), { recursive: true });
  mkdirSync(path.join(root, "skills", "fixture"), { recursive: true });
  mkdirSync(path.join(root, "skills", "project-memory", "scripts"), { recursive: true });
  mkdirSync(path.join(root, "themes"), { recursive: true });
  cpSync(path.join(repositoryRoot, "install.sh"), path.join(root, "install.sh"));
  cpSync(path.join(repositoryRoot, "install.ps1"), path.join(root, "install.ps1"));
  cpSync(path.join(repositoryRoot, "config/settings.json"), path.join(root, "config/settings.json"));
  writeFileSync(path.join(root, "config/models.json"), "{}\n");
  writeFileSync(path.join(root, "config/SYSTEM.md"), "fixture system\n");
  writeFileSync(path.join(root, "config/pi-goal.json"), "{}\n");
  writeFileSync(path.join(root, "config/mcp.json"), "{}\n");
  writeFileSync(path.join(root, "agents/fixture.md"), "fixture agent\n");
  writeFileSync(path.join(root, "skills/fixture/SKILL.md"), "# Fixture\n");
  cpSync(path.join(repositoryRoot, "skills/project-memory/scripts/validate-architecture.mjs"), path.join(root, "skills/project-memory/scripts/validate-architecture.mjs"));
  writeFileSync(path.join(root, "themes/fixture.json"), "{}\n");
  cpSync(path.join(sourceExtensionRoot, "project-memory.ts"), path.join(root, "extensions/project-memory.ts"));
  cpSync(path.join(sourceExtensionRoot, "plastic-memory"), path.join(root, "extensions/plastic-memory"), { recursive: true });
  writeFileSync(path.join(root, "extensions/flat-fixture.ts"), "export default () => {};\n");
}
function installEnvironment(home, cpMode = "normal") {
  const log = path.join(sandbox, `${cpMode}-${path.basename(home)}.log`);
  writeExecutable("node", "#!/bin/sh\nif [ \"$1\" = \"--version\" ]; then echo v22.22.3; fi\nexit 0\n");
  writeExecutable("npm", `#!/bin/sh\nprintf 'npm %s\\n' \"$*\" >> \"${log}\"\nexit 0\n`);
  writeExecutable("pi", `#!/bin/sh\nprintf 'pi %s\\n' \"$*\" >> \"${log}\"\nexit 0\n`);
  const cpFailure = cpMode === "fault"
    ? `case \"$*\" in *mcp.json*) printf 'forced-cp-fault %s\\n' \"$*\" >> \"${log}\"; exit 91 ;; esac\n`
    : "";
  writeExecutable("cp", `#!/bin/sh\nprintf 'cp %s\\n' \"$*\" >> \"${log}\"\n${cpFailure}/bin/cp \"$@\"\n`);
  return log;
}
function runInstaller(home, mode = "normal") {
  const log = installEnvironment(home, mode);
  const result = spawnSync("bash", [path.join(sourceRoot, "install.sh")], {
    cwd: sourceRoot,
    env: { ...process.env, HOME: home, PATH: `${fakeBin}:${process.env.PATH}` },
    encoding: "utf8",
  });
  return { ...result, log, logText: readFileSync(log, "utf8") };
}
function fileList(root) {
  const result = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const relative = entry.name;
    const full = path.join(root, relative);
    if (entry.isDirectory()) result.push(...fileList(full).map((item) => path.join(relative, item)));
    else result.push(relative);
  }
  return result.sort();
}

try {
  fixtureSource(sourceRoot);
  const sourceSettings = JSON.parse(readFileSync(path.join(sourceRoot, "config/settings.json"), "utf8"));
  assert.equal(sourceSettings.packages.some((value) => value.includes("observational-memory")), false);
  assert.equal(sourceSettings["observational-memory"], undefined);
  assert.equal(sourceSettings["plastic-memory"], undefined, "installer settings must not activate plastic-memory");

  mkdirSync(path.join(destinationHome, ".pi", "agent", "extensions", "plastic-memory"), { recursive: true });
  writeFileSync(path.join(destinationHome, ".pi", "agent", "extensions", "plastic-memory", "stale.ts"), "stale\n");
  const oldSettings = '{"plastic-memory":{"enabled":false},"sentinel":"old-destination"}\n';
  writeFileSync(path.join(destinationHome, ".pi", "agent/settings.json"), oldSettings);
  const fault = runInstaller(destinationHome, "fault");
  assert.notEqual(fault.status, 0, "forced staging fault must fail");
  assert.equal(readFileSync(path.join(destinationHome, ".pi", "agent/settings.json"), "utf8"), oldSettings, "fault must preserve old settings");
  assert.equal(existsSync(path.join(destinationHome, ".pi", "agent/extensions/plastic-memory", "index.ts")), true, "plastic-memory dependency tree must stage before activation");
  assert.equal(existsSync(path.join(destinationHome, ".pi", "agent/extensions/plastic-memory", "stale.ts")), false, "stale plastic-memory files must be removed before staging");
  assert.equal(fault.logText.includes("forced-cp-fault"), true);
  assert.equal(fault.logText.includes("settings.json"), false, "fault must precede activation write");

  const successHome = path.join(sandbox, "success-home");
  const success = runInstaller(successHome);
  assert.equal(success.status, 0, success.stderr || success.stdout);
  const destinationRoot = path.join(successHome, ".pi", "agent");
  assert.equal(existsSync(path.join(destinationRoot, "extensions/plastic-memory", "index.ts")), true, "project-memory dependency tree must be installed");
  assert.equal(existsSync(path.join(destinationRoot, "extensions/project-memory.ts")), true);
  assert.equal(existsSync(path.join(destinationRoot, "extensions/flat-fixture.ts")), true);
  assert.equal(readFileSync(path.join(destinationRoot, "settings.json"), "utf8"), readFileSync(path.join(sourceRoot, "config/settings.json"), "utf8"));
  assert.equal(success.logText.includes("extensions/plastic-memory"), true, "installer must stage plastic-memory");
  const resourceCopyIndex = success.logText.indexOf("config/mcp.json");
  const activationIndex = success.logText.lastIndexOf("config/settings.json");
  assert.equal(resourceCopyIndex >= 0 && activationIndex > resourceCopyIndex, true, "activation follows complete resource staging");
  assert.equal(success.logText.includes("observational-memory"), false, "fake package commands omit OM");

  const sameHome = path.join(sandbox, "same-home");
  const sameRoot = path.join(sameHome, ".pi", "agent");
  cpSync(sourceRoot, sameRoot, { recursive: true });
  const sameManifest = fileList(sameRoot).map((file) => [file, readFileSync(path.join(sameRoot, file))]);
  const same = spawnSync("bash", [path.join(sameRoot, "install.sh")], {
    cwd: sameRoot,
    env: { ...process.env, HOME: sameHome, PATH: `${fakeBin}:${process.env.PATH}` },
    encoding: "utf8",
  });
  assert.equal(same.status, 0, same.stderr || same.stdout);
  for (const [file, bytes] of sameManifest) assert.deepEqual(readFileSync(path.join(sameRoot, file)), bytes, `self-root changed ${file}`);

  const powershell = readFileSync(path.join(repositoryRoot, "install.ps1"), "utf8");
  assert.equal(powershell.includes("Copy-Item $plasticMemory (Join-Path $PI_DIR \"extensions\") -Recurse -Force"), true);
  assert.equal(powershell.includes("Remove-Item (Join-Path $PI_DIR \"extensions\\plastic-memory\") -Recurse -Force"), true);
  assert.equal(powershell.includes("if (-not $sameRoot)"), true);
  assert.equal(powershell.includes("pi-observational-memory"), false);
  assert.equal(powershell.includes("pi-provider-kimi-code"), true);
  assert.equal(powershell.indexOf('Copy-Item (Join-Path $SCRIPT_DIR "config\\settings.json")') > powershell.indexOf("# -- Packages"), true);
  console.log("PLASTIC_MEMORY_INSTALL: PASS (plastic-memory staged with project-memory on macOS/Linux and Windows, stale copies replaced, deferred activation fault, self-root safety, and PowerShell parity; Windows runtime UNVERIFIED)");
} finally {
  process.chdir(repositoryRoot);
  rmSync(sandbox, { recursive: true, force: true });
}
