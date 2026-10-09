import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const shellInstaller = await readFile(join(repo, "install.sh"), "utf8");
const powershellInstaller = await readFile(join(repo, "install.ps1"), "utf8");
const shellBlock = extract(shellInstaller, "# ── MCP adapter", "# ── PI Packages");
const powershellBlock = extract(powershellInstaller, "# -- MCP adapter config", "# -- Packages");
const template = Buffer.from('{"servers":{"fixture":{"command":"synthetic"}}}\n');
const powershell = process.env.POWERSHELL_EXE || "powershell";
const shell = process.env.BASH_EXE || "bash";
const root = await mkdtemp(join(tmpdir(), "pi-mcp-config-fixture-"));

function extract(text, start, end) {
  const from = text.indexOf(start);
  const to = text.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `missing source block marker: ${start}`);
  assert.notEqual(to, -1, `missing end marker: ${end}`);
  return text.slice(from, to);
}

function cleanEnv(home, scriptDir) {
  const env = { HOME: home, USERPROFILE: home, SCRIPT_DIR: scriptDir, PATH: process.env.PATH ?? "" };
  for (const key of ["SystemRoot", "WINDIR", "TEMP", "TMP"]) {
    if (process.env[key]) env[key] = process.env[key];
  }
  return env;
}

async function runFixture(platform, scenario) {
  const base = join(root, `${platform}-${scenario}`);
  const scriptDir = join(base, "source");
  const home = join(base, "home");
  const piDir = join(home, ".pi", "agent");
  await mkdir(join(scriptDir, "config"), { recursive: true });
  await mkdir(piDir, { recursive: true });
  await writeFile(join(scriptDir, "config", "mcp-adapter.json"), template);
  const adapter = join(piDir, "mcp-adapter.json");
  const legacy = join(piDir, "mcp.json");
  const originalAdapter = Buffer.from('{"adapter":"keep"}\n');
  const originalLegacy = Buffer.from('{"native":"keep"}\n');
  if (scenario === "adapter" || scenario === "both") await writeFile(adapter, originalAdapter);
  if (scenario === "legacy" || scenario === "both") await writeFile(legacy, originalLegacy);

  let result;
  if (platform === "bash") {
    const script = `set -e\nPI_DIR="$HOME/.pi/agent"\nsame_root=false\nstep(){ :; }\ninfo(){ printf '%s\\n' "$*"; }\n${shellBlock}\n`;
    result = spawnSync(shell, ["-c", script], { cwd: base, env: cleanEnv(home, scriptDir), encoding: "utf8" });
  } else {
    const scriptPath = join(base, "mcp-block.ps1");
    const script = `$ErrorActionPreference = 'Stop'\n$PI_DIR = Join-Path $env:USERPROFILE '.pi\\agent'\n$SCRIPT_DIR = $env:SCRIPT_DIR\n$sameRoot = $false\nfunction Step($name) {}\nfunction Info($message) { Write-Output $message }\n${powershellBlock}\n`;
    await writeFile(scriptPath, script, "utf8");
    result = spawnSync(powershell, ["-NoProfile", "-NonInteractive", "-File", scriptPath], {
      cwd: base,
      env: cleanEnv(home, scriptDir),
      encoding: "utf8",
    });
  }
  assert.equal(result.error, undefined, `${platform}/${scenario}: ${result.error?.message}`);
  assert.equal(result.status, 0, `${platform}/${scenario}: ${result.stderr || result.stdout}`);
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;

  if (scenario === "empty") {
    assert.deepEqual(await readFile(adapter), template);
    await assert.rejects(access(legacy));
    assert.match(output, /copiado de config/);
  } else if (scenario === "adapter") {
    assert.deepEqual(await readFile(adapter), originalAdapter);
    await assert.rejects(access(legacy));
    assert.match(output, /preservado/);
  } else if (scenario === "legacy") {
    await assert.rejects(access(adapter));
    assert.deepEqual(await readFile(legacy), originalLegacy);
    assert.match(output, /MCP config setup bloqueado/);
  } else {
    assert.deepEqual(await readFile(adapter), originalAdapter);
    assert.deepEqual(await readFile(legacy), originalLegacy);
    assert.match(output, /preservado/);
  }
}

try {
  for (const platform of ["bash", "powershell"]) {
    for (const scenario of ["empty", "adapter", "legacy", "both"]) {
      await runFixture(platform, scenario);
    }
  }
  console.log("PASS: both installer MCP blocks preserve/seed/block correctly in 8 isolated fixtures");
} finally {
  await rm(root, { recursive: true, force: true });
  await assert.rejects(access(root), "fixture root should be removed");
}
