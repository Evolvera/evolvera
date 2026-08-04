import assert from "node:assert/strict";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const packageRoot = process.env.PI_CODING_AGENT_PACKAGE_ROOT
  ?? path.join(homedir(), "npm-global", "lib", "node_modules", "@earendil-works", "pi-coding-agent");
const { createJiti } = await import(pathToFileURL(path.join(packageRoot, "node_modules/jiti/lib/jiti.mjs")).href);
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
  const plastic = sourceSettings["plastic-memory"];
  assert.equal(plastic.enabled, true);
  assert.deepEqual(Object.keys(plastic.roles), ["observer", "reflector", "compactor", "project-promoter"]);
  for (const role of Object.values(plastic.roles)) {
    assert.deepEqual(role, { model: "openai-codex/gpt-5.6-luna", thinking: "medium", maxTurns: 8, maxToolCalls: 4, maxRuntimeMs: 60000 });
  }
  assert.deepEqual(plastic.edgeTriggers, { observeAfterTokens: 10000, reflectAfterTokens: 20000 });
  assert.deepEqual(plastic.pool, { maxTokens: 20000, targetTokens: 10000 });
  assert.equal(plastic.automaticRetryCount, 1);
  assert.equal(plastic.pendingTtlMs, 300000);
  assert.equal(plastic.summaryCapChars, 48000);
  assert.deepEqual(plastic.projectCaps, { summaryChars: 8000, indexChars: 4000, categoryChars: 4000 });

  mkdirSync(path.join(destinationHome, ".pi", "agent", "extensions"), { recursive: true });
  const oldSettings = '{"plastic-memory":{"enabled":false},"sentinel":"old-destination"}\n';
  writeFileSync(path.join(destinationHome, ".pi", "agent/settings.json"), oldSettings);
  const fault = runInstaller(destinationHome, "fault");
  assert.notEqual(fault.status, 0, "forced staging fault must fail");
  assert.equal(readFileSync(path.join(destinationHome, ".pi", "agent/settings.json"), "utf8"), oldSettings, "fault must preserve old settings");
  assert.equal(existsSync(path.join(destinationHome, ".pi", "agent/extensions/plastic-memory/config.ts")), true, "fault occurs after recursive extension staging");
  assert.equal(fault.logText.includes("forced-cp-fault"), true);
  assert.equal(fault.logText.includes("settings.json"), false, "fault must precede activation write");

  const successHome = path.join(sandbox, "success-home");
  const success = runInstaller(successHome);
  assert.equal(success.status, 0, success.stderr || success.stdout);
  const destinationRoot = path.join(successHome, ".pi", "agent");
  assert.deepEqual(fileList(path.join(sourceRoot, "extensions/plastic-memory")), fileList(path.join(destinationRoot, "extensions/plastic-memory")));
  assert.equal(existsSync(path.join(destinationRoot, "extensions/project-memory.ts")), true);
  assert.equal(existsSync(path.join(destinationRoot, "extensions/flat-fixture.ts")), true);
  assert.equal(readFileSync(path.join(destinationRoot, "settings.json"), "utf8"), readFileSync(path.join(sourceRoot, "config/settings.json"), "utf8"));
  const extensionCopyIndex = success.logText.indexOf("extensions/plastic-memory");
  const resourceCopyIndex = success.logText.indexOf("config/mcp.json");
  const activationIndex = success.logText.lastIndexOf("config/settings.json");
  assert.equal(extensionCopyIndex >= 0 && resourceCopyIndex > extensionCopyIndex && activationIndex > resourceCopyIndex, true, "activation follows complete resource staging");
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

  const jiti = createJiti(import.meta.url, { moduleCache: false });
  const projectRoot = path.join(sandbox, "project");
  mkdirSync(path.join(projectRoot, ".pi"), { recursive: true });
  process.chdir(projectRoot);
  const rootModule = await jiti.import(path.join(destinationRoot, "extensions/plastic-memory/index.ts"));
  const bridgeModule = await jiti.import(path.join(destinationRoot, "extensions/project-memory.ts"));
  const calls = () => ({ hooks: new Map(), tools: [], commands: [], on(name, handler) { this.hooks.set(name, handler); }, registerTool(definition) { this.tools.push(definition); }, registerCommand(name) { this.commands.push(name); }, appendEntry() {} });
  const rootCalls = calls();
  const bridgeCalls = calls();
  await rootModule.default(rootCalls);
  bridgeModule.default(bridgeCalls);
  assert.equal(rootCalls.hooks.has("before_agent_start"), true, "staged plastic owner loads");
  assert.equal(rootCalls.tools.length, 2, "one full plastic owner registers tools");
  assert.equal(bridgeCalls.hooks.size, 0, "project bridge is inert under plastic ownership");

  const powershell = readFileSync(path.join(repositoryRoot, "install.ps1"), "utf8");
  assert.equal(powershell.includes("Copy-Item $plasticMemory (Join-Path $PI_DIR \"extensions\") -Recurse -Force"), true);
  assert.equal(powershell.includes("if (-not $sameRoot)"), true);
  assert.equal(powershell.includes("pi-observational-memory"), false);
  assert.equal(powershell.includes("pi-provider-kimi-code"), true);
  assert.equal(powershell.indexOf('Copy-Item (Join-Path $SCRIPT_DIR "config\\settings.json")') > powershell.indexOf("# -- Packages"), true);
  console.log("PLASTIC_MEMORY_INSTALL: PASS (temp recursive staging, deferred activation fault, self-root safety, one owner, and PowerShell parity; Windows runtime UNVERIFIED)");
} finally {
  process.chdir(repositoryRoot);
  rmSync(sandbox, { recursive: true, force: true });
}
