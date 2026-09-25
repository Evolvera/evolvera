import { readdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootIndex = process.argv.indexOf("--root");
const timeoutIndex = process.argv.indexOf("--timeout");
const root = rootIndex === -1 ? repoRoot : path.resolve(process.argv[rootIndex + 1] ?? "");
const timeoutMs = timeoutIndex === -1 ? 30_000 : Number(process.argv[timeoutIndex + 1]);
if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
  console.error("--timeout deve ser um inteiro positivo em milissegundos.");
  process.exit(2);
}

// Evidência de estado: tmpdir contém apenas smokes que criam mkdtemp e fazem
// limpeza explícita; in-memory não cria arquivo/serviço persistente. Revisado
// grep dirigido em home/HOME/.pi/rede/listen/spawn/escritas para todos os nomes.
const tmpdirProprio = new Set([
  "codex-fast-mode.smoke.mjs", "communication-style.smoke.mjs",
  "execution-mode.smoke.mjs", "native-compaction-routing.smoke.mjs",
  "plastic-memory-bootstrap.smoke.mjs", "plastic-memory-cutover.smoke.mjs",
  "plastic-memory-host.smoke.mjs", "plastic-memory-install.smoke.mjs",
  "plastic-memory-learning-queue-ui.smoke.mjs",
  "plastic-memory-migration.smoke.mjs", "plastic-memory-project.smoke.mjs",
  "plastic-memory-proposal-commands.smoke.mjs",
  "plastic-memory-publication.smoke.mjs", "plastic-memory-retrieval.smoke.mjs",
  "plastic-memory-surfaces.smoke.mjs",
  "install-wsl-keybindings.smoke.mjs",
  "patch-anthropic-client-version.smoke.mjs",
  "patch-openai-error-body.smoke.mjs", "patch-pi-083-threshold-cancel.smoke.mjs",
  "patch-ultra-thinking.smoke.mjs", "run-tests.smoke.mjs",
]);
// Escrita isolada é provada nos smoke tests; estes exceções acessam dado externo.
const exclusoes = new Map([
  ["patch-openai-error-body.smoke.mjs", "lê alvo instalado fora do tmpdir para montar fixture"],
  ["npm test (interface)", "servidor lê ~/.pi/agent; smoke usa rede loopback e repo real"],
]);

const resultados = { aprovados: [], falhos: [], excluidos: [] };
function executar(nome, comando, args, cwd) {
  const child = spawnSync(comando, args, {
    cwd, encoding: "utf8", timeout: timeoutMs, maxBuffer: 1024 * 1024,
  });
  if (child.stdout) process.stdout.write(child.stdout);
  if (child.stderr) process.stderr.write(child.stderr);
  const failed = child.error || child.status !== 0;
  if (failed) {
    const motivo = child.error?.code === "ETIMEDOUT"
      ? `tempo limite (${timeoutMs} ms)`
      : child.error?.code === "ENOBUFS" ? "saída excedeu 1 MiB" :
        `código ${child.status ?? "indisponível"}`;
    resultados.falhos.push(`${nome} (${motivo})`);
  } else {
    resultados.aprovados.push(nome);
  }
}

for (const dir of ["extensions/test", "scripts/test"]) {
  const absoluteDir = path.join(root, dir);
  let names = [];
  try {
    names = readdirSync(absoluteDir).filter((name) => name.endsWith(".smoke.mjs")).sort();
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  for (const name of names) {
    const reason = exclusoes.get(name);
    if (reason) {
      resultados.excluidos.push(`${name} — ${reason}`);
      continue;
    }
    const classe = tmpdirProprio.has(name) ? "tmpdir próprio" : "sem estado persistente";
    console.log(`\n[${classe}] ${name}`);
    executar(name, process.execPath, [path.join(absoluteDir, name)], root);
  }
}

// --root fornece uma árvore falsa para testar glob/processos sem disparar suítes
// fixas contra o repositório de trabalho.
if (root === repoRoot) {
  const ct = "skills/copy-thief/scripts/test/ct.test.mjs";
  executar(ct, process.execPath, ["--test", path.join(root, ct)], root);
  const interfaceTest = "npm test (interface)";
  const reason = exclusoes.get(interfaceTest);
  resultados.excluidos.push(`${interfaceTest} — ${reason}`);
}

console.log("\nResumo final");
console.log(`Aprovados: ${resultados.aprovados.length}`);
console.log(`Falhos: ${resultados.falhos.length}`);
console.log(`Excluídos: ${resultados.excluidos.length}`);
for (const failure of resultados.falhos) console.log(`Falha: ${failure}`);
for (const excluded of resultados.excluidos) console.log(`Excluído: ${excluded}`);
if (resultados.falhos.length) process.exitCode = 1;
