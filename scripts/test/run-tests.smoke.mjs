import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

// Verifica descoberta, isolamento de processo e resumo sem executar a suíte real.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sandbox = mkdtempSync(path.join(os.tmpdir(), "runner-testes-"));
const fakeRoot = path.join(sandbox, "repo");
const smokeDir = path.join(fakeRoot, "scripts", "test");
mkdirSync(smokeDir, { recursive: true });
const runner = path.join(repoRoot, "scripts", "run-tests.mjs");

function executar() {
  return spawnSync(process.execPath, [runner, "--root", fakeRoot], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 10_000,
    maxBuffer: 1024 * 1024,
  });
}

try {
  // Sem arquivos, runner conclui e relata 0 casos sem executar suítes fixas.
  let result = executar();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Aprovados: 0/);

  // Processo de teste separado: stdout/stderr não determinam falha, exit code sim.
  writeFileSync(path.join(smokeDir, "um.smoke.mjs"), 'console.error("aviso");\n');
  writeFileSync(path.join(smokeDir, "dois.smoke.mjs"), 'process.exitCode = 7;\n');
  result = executar();
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /dois\.smoke\.mjs/);
  assert.match(result.stdout, /Aprovados: 1/);
  assert.match(result.stdout, /Falhos: 1/);

  // Timeout encerra a execução e apresenta o nome do smoke preso.
  writeFileSync(path.join(smokeDir, "dois.smoke.mjs"), 'setInterval(() => {}, 1000);\n');
  result = spawnSync(process.execPath, [runner, "--root", fakeRoot, "--timeout", "100"], {
    cwd: repoRoot, encoding: "utf8", timeout: 5_000, maxBuffer: 1024 * 1024,
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /dois\.smoke\.mjs/);
  assert.match(result.stdout, /tempo limite/i);
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}
