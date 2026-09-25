import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
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
  writeFileSync(path.join(smokeDir, ".classificacao.json"), JSON.stringify({
    semEstado: ["um.smoke.mjs", "dois.smoke.mjs"], tmpdirProprio: [],
  }));
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

  // Saída acima do limite deve falhar com motivo nomeado sem travar o runner.
  writeFileSync(path.join(smokeDir, "dois.smoke.mjs"), 'process.exitCode = 0;\n');
  writeFileSync(path.join(smokeDir, "grande.smoke.mjs"),
    'process.stdout.write("x".repeat(1024 * 1024 + 1));\n');
  writeFileSync(path.join(smokeDir, ".classificacao.json"), JSON.stringify({
    semEstado: ["um.smoke.mjs", "dois.smoke.mjs", "grande.smoke.mjs"],
    tmpdirProprio: [],
  }));
  result = executar();
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /Falha: grande\.smoke\.mjs \(saída excedeu 1 MiB\)/);
  assert.match(result.stdout, /Falhos: 1/);

  // Um smoke sem classificação é reportado, mas não roda nem cria sentinela.
  writeFileSync(path.join(smokeDir, "grande.smoke.mjs"), 'process.exitCode = 0;\n');
  const sentinel = path.join(sandbox, "nao-executado");
  writeFileSync(path.join(smokeDir, "novo.smoke.mjs"),
    `import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(sentinel)}, "rodou");\n`);
  writeFileSync(path.join(smokeDir, ".classificacao.json"), JSON.stringify({
    semEstado: ["um.smoke.mjs", "dois.smoke.mjs", "grande.smoke.mjs"],
    tmpdirProprio: [],
  }));
  result = executar();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(sentinel), false);
  assert.match(result.stdout, /Não classificados: 1/);
  assert.match(result.stdout, /novo\.smoke\.mjs/);
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}
