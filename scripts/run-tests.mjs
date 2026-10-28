import { existsSync, readFileSync, readdirSync } from "node:fs";
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
  // Picked from MiguelNevesZane: each smoke owns a fresh mkdtemp root removed in finally; models/agents are fakes.
  "bash-timeout.smoke.mjs", "msys-slash-restore.smoke.mjs", "loop.smoke.mjs",
  "studio-steer.smoke.mjs", // fake subagent manager on globalThis; extension copy in its own mkdtemp
  "provider-login-check.smoke.mjs", // agent files in its own mkdtemp; in-memory fake model registry
  "sync-studio.smoke.mjs", // synthetic upstream/local git repos and extraction only inside its owned mkdtemp
  // Context-mode persistence exercises only a synthetic settings.json in its own mkdtemp.
  "anthropic-model-policy.smoke.mjs",
  "context-orchestration.integration.smoke.mjs", // real AgentSession with synthetic provider and exact-root disposable state
  "disk-hygiene.smoke.mjs", // git repo, fake /tmp tree and stamp only inside its owned mkdtemp, removed in finally
  "worker-report.integration.smoke.mjs", // real Goal tool/session with faux provider and exact-root disposable state
  "codex-fast-mode.smoke.mjs", "communication-style.smoke.mjs",
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
  // Installs only under a disposable HOME; snapshots real install/patch write targets.
  "install-sh.smoke.mjs",
  "patch-anthropic-client-version.smoke.mjs",
  // Synthetic fixture under its own mkdtemp; packageRoot is always explicit, never the live npm root.
  "patch-pi-tui-orca-redraw.smoke.mjs",
  "patch-pi-cursor-reasoning-effort.smoke.mjs",
  "patch-openai-error-body.smoke.mjs", "patch-pi-threshold-cancel.smoke.mjs",
  // Writes only to owned temp copies; global package and install scripts are read-only.
  "pi-native-recovery.smoke.mjs", "patch-ultra-thinking.smoke.mjs",
  // HUD patches: read the installed packages, patch and render only copies under their own mkdtemp (HOME redirected there).
  "patch-rpiv-todo-hud.smoke.mjs", "patch-pi-subagents-hud.smoke.mjs",
  "run-tests.smoke.mjs", "pi-sdk-resolution.smoke.mjs",
  // Real AgentSession uses a faux provider and confines writes to its owned mkdtemp root.
  "todo-reconciliation.smoke.mjs",
  // Interface smoke owns agent/project tmpdirs, fake PI, and ephemeral port.
  "npm test (interface)",
]);
const semEstadoPadrao = new Set([
  // só lê config/settings.json do repo; sem escrita, rede ou processo
  "config-settings.smoke.mjs",
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
  if (existsSync(path.join(root, "interface", "package.json"))) {
    console.log("\n[tmpdir próprio] npm test (interface)");
    executar(interfaceTest, "npm", ["test"], path.join(root, "interface"), process.platform === "win32");
  } else {
    // /interface/ fica fora desta distribuição (.gitignore); scripts/studio/sync-studio.mjs roda essa suíte
    // no commit fixado antes de instalar o Studio.
    resultados.excluidos.push(`${interfaceTest} — interface/ ausente; testada por scripts/studio/sync-studio.mjs`);
  }
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
