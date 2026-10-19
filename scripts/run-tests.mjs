import { readFileSync, readdirSync } from "node:fs";
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
const tmpdirProprioPadrao = new Set([
  "ask-user.smoke.mjs", "codex-fast-mode.smoke.mjs", "communication-style.smoke.mjs",
  "execution-mode.smoke.mjs", "native-compaction-routing.smoke.mjs",
  "plastic-memory-bootstrap.smoke.mjs", "plastic-memory-cutover.smoke.mjs",
  "plastic-memory-host.smoke.mjs", "plastic-memory-install.smoke.mjs",
  "plastic-memory-context-injection.smoke.mjs", // writes only to its owned mkdtemp sandbox and removes it in finally
  "plastic-memory-learning-queue-ui.smoke.mjs",
  "plastic-memory-migration.smoke.mjs", "plastic-memory-project.smoke.mjs",
  "plastic-memory-proposal-commands.smoke.mjs",
  "plastic-memory-publication.smoke.mjs", "plastic-memory-retrieval.smoke.mjs",
  "plastic-memory-surfaces.smoke.mjs",
  "install-wsl-keybindings.smoke.mjs",
  // Mid-run compaction uses a faux provider and removes its owned mkdtemp agentDir in finally.
  "midrun-compaction.smoke.mjs",
  // Faux provider + real bash tool (sleep/echo only) inside its owned mkdtemp root, removed in finally.
  "bash-timeout.smoke.mjs",
  // Faux provider session in its owned mkdtemp root; Git Bash probe only echoes an env var.
  "msys-slash-restore.smoke.mjs",
  // Faux provider session + installed pi-goal (read-only) inside its owned mkdtemp agentDir.
  "swarm-mode.smoke.mjs",
  // Installs only under a disposable HOME; snapshots real install/patch write targets.
  "install-sh.smoke.mjs",
  "patch-anthropic-client-version.smoke.mjs",
  "patch-openai-error-body.smoke.mjs", "patch-pi-083-threshold-cancel.smoke.mjs",
  // Writes only to owned temp copies; global package and install scripts are read-only.
  "patch-pi-083-context-wall-retry.smoke.mjs", "patch-ultra-thinking.smoke.mjs",
  "run-tests.smoke.mjs", "pi-sdk-resolution.smoke.mjs",
  // Real AgentSession uses a faux provider and confines writes to its owned mkdtemp root.
  "todo-reconciliation.smoke.mjs",
  // Repo git descartável + worktrees no mkdtemp próprio, removido no finally; agente/modelo são fakes.
  "loop.smoke.mjs",
  // Histórico/config só no mkdtemp próprio (agentDir injetado), removido no finally; modelo é fake.
  "work-status.smoke.mjs",
  // Interface smoke owns agent/project tmpdirs, fake PI, and ephemeral port.
  "npm test (interface)",
]);
const semEstadoPadrao = new Set([
  "anthropic-model-policy.smoke.mjs", "maestro.smoke.mjs",
  // só lê config/settings.json do repo; sem escrita, rede ou processo
  "config-settings.smoke.mjs",
  // só lê config/SYSTEM.md; sem escrita, rede ou subprocessos
  "delivery-contract.smoke.mjs",
  "plastic-memory-acknowledge.smoke.mjs", "plastic-memory-apply-cut.smoke.mjs",
  "plastic-memory-binding.smoke.mjs", "plastic-memory-chunking.smoke.mjs",
  "plastic-memory-compaction.smoke.mjs",
  "plastic-memory-emergency-hook.smoke.mjs",
  "plastic-memory-emergency-pipeline.smoke.mjs",
  "plastic-memory-emergency-queue.smoke.mjs",
  "plastic-memory-emergency-selection.smoke.mjs",
  "plastic-memory-emergency-summary.smoke.mjs",
  "plastic-memory-fresh-session.smoke.mjs",
  "plastic-memory-integration.smoke.mjs",
  "plastic-memory-lifecycle-observability.smoke.mjs",
  "plastic-memory-model-fallback.smoke.mjs",
  "plastic-memory-promotion-lifecycle.smoke.mjs",
  "plastic-memory-proposal-queue.smoke.mjs", "plastic-memory-queue.smoke.mjs",
  "plastic-memory-session.smoke.mjs", "plastic-memory-stride.smoke.mjs",
  // Backfill uses only in-memory history and an array-backed fake append sink.
  "plastic-memory-backfill.smoke.mjs",
  "plastic-memory-token-calibration.smoke.mjs",
  "plastic-memory-transport-integrity.smoke.mjs",
  "plastic-memory-worker-contract.smoke.mjs", "plastic-memory-workers.smoke.mjs",
  "plastic-memory-rebind-observability.smoke.mjs",
  // Só valida raízes de busca; o carregador consulta arquivos, sem gravar estado.
  "plastic-memory-search-root.smoke.mjs",
  "user-attention-notifier.smoke.mjs", "working-time.smoke.mjs",
  "subagent-watchdog.smoke.mjs", "github-kanban-sync.smoke.mjs",
]);
let tmpdirProprio = tmpdirProprioPadrao;
let semEstado = semEstadoPadrao;
if (root !== repoRoot) {
  // Árvore falsa pode fornecer classificação isolada; a classificação real
  // permanece neste runner e não depende de arquivo do repositório.
  try {
    const fakeClasses = JSON.parse(readFileSync(
      path.join(root, "scripts/test/.classificacao.json"), "utf8",
    ));
    tmpdirProprio = new Set(fakeClasses.tmpdirProprio ?? []);
    semEstado = new Set(fakeClasses.semEstado ?? []);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
// Escrita isolada é provada nos smoke tests; estes exceções acessam dado externo.
const exclusoes = new Map([
  ["patch-openai-error-body.smoke.mjs", "lê alvo instalado fora do tmpdir para montar fixture"],
]);

const resultados = { aprovados: [], falhos: [], excluidos: [], naoClassificados: [] };
function executar(nome, comando, args, cwd, shell = false) {
  const child = spawnSync(comando, args, {
    cwd, encoding: "utf8", timeout: timeoutMs, maxBuffer: 1024 * 1024, shell,
  });
  if (child.error?.code !== "ENOBUFS") {
    if (child.stdout) process.stdout.write(child.stdout);
    if (child.stderr) process.stderr.write(child.stderr);
  }
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
    const classe = tmpdirProprio.has(name) ? "tmpdir próprio"
      : semEstado.has(name) ? "sem estado persistente" : null;
    if (!classe) {
      resultados.naoClassificados.push(name);
      continue;
    }
    console.log(`\n[${classe}] ${name}`);
    executar(name, process.execPath, [path.join(absoluteDir, name)], root);
  }
}

// --root fornece uma árvore falsa para testar glob/processos sem disparar suítes
// fixas contra o repositório de trabalho.
if (root === repoRoot) {
  const interfaceTest = "npm test (interface)";
  console.log("\n[tmpdir próprio] npm test (interface)");
  executar(interfaceTest, "npm", ["test"], path.join(root, "interface"), process.platform === "win32");
}

console.log("\nResumo final");
console.log(`Aprovados: ${resultados.aprovados.length}`);
console.log(`Falhos: ${resultados.falhos.length}`);
console.log(`Excluídos: ${resultados.excluidos.length}`);
console.log(`Não classificados: ${resultados.naoClassificados.length}`);
for (const failure of resultados.falhos) console.log(`Falha: ${failure}`);
for (const excluded of resultados.excluidos) console.log(`Excluído: ${excluded}`);
for (const name of resultados.naoClassificados) {
  console.log(`Não classificado: ${name} — classifique-o antes de executar`);
}
if (resultados.falhos.length) process.exitCode = 1;
