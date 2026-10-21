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

  // The configured timeout bounds ordinary suites and is reported precisely.
  writeFileSync(path.join(smokeDir, "um.smoke.mjs"), 'console.error("aviso");\n');
  writeFileSync(path.join(smokeDir, "dois.smoke.mjs"), 'process.exitCode = 0;\n');
  writeFileSync(path.join(smokeDir, "normal.smoke.mjs"), 'await new Promise((resolve) => setTimeout(resolve, 650));\n');
  writeFileSync(path.join(smokeDir, ".classificacao.json"), JSON.stringify({
    semEstado: ["um.smoke.mjs", "dois.smoke.mjs", "normal.smoke.mjs"], tmpdirProprio: [],
  }));
  result = spawnSync(process.execPath, [runner, "--root", fakeRoot, "--timeout", "500"], {
    cwd: repoRoot, encoding: "utf8", timeout: 5_000, maxBuffer: 1024 * 1024,
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /Aprovados: 2/);
  assert.match(result.stdout, /Falha: normal\.smoke\.mjs \(tempo limite \(500 ms\)\)/);
  result = spawnSync(process.execPath, [runner, "--root", fakeRoot, "--timeout", "130000"], {
    cwd: repoRoot, encoding: "utf8", timeout: 5_000, maxBuffer: 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Aprovados: 3/);
  assert.match(result.stdout, /Falhos: 0/);
  rmSync(path.join(smokeDir, "normal.smoke.mjs"));

  // A suíte da interface (centenas de testes, ~60 s) tem limite próprio de no mínimo 300 s: com --timeout 500 o smoke
  // de 800 ms falha, mas a interface de 800 ms passa. Antes, o limite único de 30 s derrubava a suíte que passa sozinha.
  const interfaceDir = path.join(fakeRoot, "interface");
  mkdirSync(interfaceDir, { recursive: true });
  writeFileSync(path.join(interfaceDir, "package.json"), JSON.stringify({
    name: "fake-interface", private: true, scripts: { test: 'node -e "setTimeout(() => {}, 800)"' },
  }));
  writeFileSync(path.join(smokeDir, "lento.smoke.mjs"), 'await new Promise((resolve) => setTimeout(resolve, 800));\n');
  writeFileSync(path.join(smokeDir, ".classificacao.json"), JSON.stringify({
    semEstado: ["um.smoke.mjs", "dois.smoke.mjs", "lento.smoke.mjs", "npm test (interface)"], tmpdirProprio: [],
  }));
  result = spawnSync(process.execPath, [runner, "--root", fakeRoot, "--timeout", "500"], {
    cwd: repoRoot, encoding: "utf8", timeout: 60_000, maxBuffer: 1024 * 1024,
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /Falha: lento\.smoke\.mjs \(tempo limite \(500 ms\)\)/);
  assert.doesNotMatch(result.stdout, /Falha: npm test \(interface\)/);
  assert.match(result.stdout, /npm test \(interface\) \(limite 300000 ms\)/);
  assert.match(result.stdout, /Aprovados: 3/);
  // Um --timeout explícito acima de 300 s também vale para a interface: o limite próprio é piso, nunca teto.
  result = spawnSync(process.execPath, [runner, "--root", fakeRoot, "--timeout", "400000"], {
    cwd: repoRoot, encoding: "utf8", timeout: 60_000, maxBuffer: 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /npm test \(interface\) \(limite 400000 ms\)/);
  assert.match(result.stdout, /Aprovados: 4/);

  // The full repository suite is intentionally excluded, but a disposable fake-root suite must run only when classified.
  writeFileSync(path.join(interfaceDir, "package.json"), JSON.stringify({
    name: "fake-interface-unclassified", private: true, scripts: { test: 'node -e "process.exit(17)"' },
  }));
  writeFileSync(path.join(smokeDir, ".classificacao.json"), JSON.stringify({
    semEstado: ["um.smoke.mjs", "dois.smoke.mjs", "lento.smoke.mjs"], tmpdirProprio: [],
  }));
  result = executar();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Não classificados: 1/);
  assert.match(result.stdout, /npm test \(interface\)/);
  assert.doesNotMatch(result.stdout, /Falha: npm test \(interface\)/);

  rmSync(path.join(smokeDir, "lento.smoke.mjs"));
  rmSync(interfaceDir, { recursive: true, force: true });

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
