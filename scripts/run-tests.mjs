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
  "ask-user.smoke.mjs", "codex-fast-mode.smoke.mjs", "communication-style.smoke.mjs",
  "context-orchestration.integration.smoke.mjs", // real AgentSession with synthetic provider and exact-root disposable state
  "disk-hygiene.smoke.mjs", // git repo, fake /tmp tree and stamp only inside its owned mkdtemp, removed in finally
  "worker-report.integration.smoke.mjs", // real Goal tool/session with faux provider and exact-root disposable state
  "execution-mode.smoke.mjs", "native-compaction-routing.smoke.mjs",
  "studio-steer.smoke.mjs",
  "plastic-memory-bootstrap.smoke.mjs", "plastic-memory-cutover.smoke.mjs",
  "plastic-memory-host.smoke.mjs", "plastic-memory-install.smoke.mjs",
  "plastic-memory-context-injection.smoke.mjs", // writes only to its owned mkdtemp sandbox and removes it in finally
  "plastic-memory-learning-queue-ui.smoke.mjs",
  // Fixture writes stay in owned mkdtemp roots; chrome-control uses a synthetic Typebox module.
  "chrome-control.smoke.mjs",
  "mcp-config.smoke.mjs",
  // Only a fresh mkdtemp root, removed in finally; resolvePiSdkRoot only reads the global npm root.
  "continuation-reviewer.smoke.mjs", "write-guard.smoke.mjs",
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
  // Synthetic fixture under its own mkdtemp; packageRoot is always explicit, never the live npm root.
  "patch-pi-tui-orca-redraw.smoke.mjs",
  "patch-pi-cursor-reasoning-effort.smoke.mjs",
  "patch-pi-083-threshold-cancel.smoke.mjs",
  "patch-pi-083-auth-load-recovery.smoke.mjs",
  // Writes only to owned temp copies; global package and install scripts are read-only.
  "patch-pi-083-context-wall-retry.smoke.mjs", "patch-ultra-thinking.smoke.mjs",
  // HUD patches: read installed packages, patch/render copies in owned mkdtemp (HOME redirected there).
  "patch-rpiv-todo-hud.smoke.mjs", "patch-pi-subagents-hud.smoke.mjs",
  "run-tests.smoke.mjs", "pi-sdk-resolution.smoke.mjs",
  // Real AgentSession uses a faux provider and confines writes to its owned mkdtemp root.
  "todo-reconciliation.smoke.mjs",
  // Repo git descartável + worktrees no mkdtemp próprio, removido no finally; agente/modelo são fakes.
  "loop.smoke.mjs",
  // Histórico/config só no mkdtemp próprio (agentDir injetado), removido no finally; modelo é fake.
  "work-status.smoke.mjs",
  // Sessões sintéticas só no mkdtemp próprio (agentDir injetado), removido no finally; modelo é fake, sem rede.
  "chat-names.smoke.mjs",
  // Copia o pi-subagents instalado (só leitura) para o mkdtemp próprio, aplica o patch na cópia e remove no finally.
  "patch-pi-subagents-model-override.smoke.mjs",
  // Fixture HOME is redirected into each mkdtemp; node:test after hooks remove the roots.
  "clean-ui.smoke.mjs", "usuario-footer.smoke.mjs",
  // Package/parser smoke reads installed SUB and writes only its owned temp fixture, removed in finally.
  "orca-subagent-extension-exclusion.smoke.mjs",
  // Users memory fixture redirects HOME and confines files to mkdtemp, removed in finally.
  "users-memory.smoke.mjs",
  // Synthetic patch fixtures only; every mkdtemp is removed in finally.
  "patch-pi-083-conversation-only.smoke.mjs", "patch-pi-subagents-bounded-waits.smoke.mjs",
  "patch-pi-subagents-deferred-nudges.smoke.mjs", "pi-subagents-deadline.smoke.mjs",
  // Users registry/resources/subagents fixtures use run-owned sandboxes and clean them in finally.
  "users-registry.smoke.mjs", "users-resources.smoke.mjs", "users-subagents.smoke.mjs",
]);
const semEstadoPadrao = new Set([
  // Reads repository/config and installed SDK sources; the watchdog behavior is exercised with in-memory timers and fake PI.
  "anthropic-model-policy.smoke.mjs", "subagent-watchdog.smoke.mjs", "maestro.smoke.mjs",
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
  "github-kanban-sync.smoke.mjs",
  // Git e Orca são fakes injetados; resolvePiSdkRoot só lê a raiz global do npm.
  "orca-worktree-visibility.smoke.mjs",
  // In-memory extension contract tests; no filesystem, network, or subprocess effects.
  "session-usage.smoke.mjs", "text-autocomplete.smoke.mjs", "worker-report.smoke.mjs",
  // Reads repository and installed SDK code only; state is in-memory/fake PI harness.
  "orchestration-mode.smoke.mjs",
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
  ["patch-rpiv-todo-eta.smoke.mjs", "depende de pacote instalado em caminho fixo em ~/.pi/agent; classificação mantida excluída"],
  ["users-alibaba.smoke.mjs", "lê pacote instalado em caminho fixo C:/Users/kevin/.pi/agent; efeito fora do sandbox não fechado para esta execução"],
  ["users-credentials.smoke.mjs", "instala guards globais e executa workers/credenciais; limites de estado/processo não demonstrados como sem estado"],
  ["users-runtime.smoke.mjs", "lê fontes instaladas em C:/Users/kevin/.pi/agent; não reclassificar por tocar estado de usuário real"],
  ["users-switch.smoke.mjs", "exige admissão nativa; em falha preserva namespace e processos para diagnóstico, sem cleanup automático"],
  ["npm test (interface)", "suíte completa UNKNOWN: apenas /api/tree foi provado isolado; demais testes/processos/sessões e teardown não fechados"],
]);

const resultados = { aprovados: [], falhos: [], excluidos: [], naoClassificados: [] };
function executar(nome, comando, args, cwd, shell = false, limiteMs = timeoutMs) {
  const child = spawnSync(comando, args, {
    cwd, encoding: "utf8", timeout: limiteMs, maxBuffer: 1024 * 1024, shell,
  });
  if (child.error?.code !== "ENOBUFS") {
    if (child.stdout) process.stdout.write(child.stdout);
    if (child.stderr) process.stderr.write(child.stderr);
  }
  const failed = child.error || child.status !== 0;
  if (failed) {
    const motivo = child.error?.code === "ETIMEDOUT"
      ? `tempo limite (${limiteMs} ms)`
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

// A suíte da interface roda na própria árvore (a do --root só tem interface/ quando o teste a cria) e é uma suíte
// inteira, não um smoke: ~60 s com a CPU ocupada. Por isso tem limite próprio de no mínimo 300 s; os smokes
// mantêm o --timeout (padrão 30 s) para um smoke travado continuar sendo detectado rápido.
const INTERFACE_TIMEOUT_MS = 300_000;
if (existsSync(path.join(root, "interface", "package.json"))) {
  const interfaceTest = "npm test (interface)";
  // The canonical repository suite has unresolved stateful-resource boundaries; a caller-supplied
  // fake root may run its interface test only when the run-owned classification explicitly allows it.
  const reason = root === repoRoot ? exclusoes.get(interfaceTest) : undefined;
  if (reason) {
    resultados.excluidos.push(`${interfaceTest} — ${reason}`);
  } else {
    const classe = tmpdirProprio.has(interfaceTest) ? "tmpdir próprio"
      : semEstado.has(interfaceTest) ? "sem estado persistente" : null;
    if (!classe) {
      resultados.naoClassificados.push(interfaceTest);
    } else {
      const limite = Math.max(timeoutMs, INTERFACE_TIMEOUT_MS);
      console.log(`\n[${classe}] ${interfaceTest} (limite ${limite} ms)`);
      executar(interfaceTest, "npm", ["test"], path.join(root, "interface"), process.platform === "win32", limite);
    }
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
