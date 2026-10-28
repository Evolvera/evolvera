#!/usr/bin/env node
/**
 * Instala ou atualiza o PI Studio (~/.pi/agent/studio) a partir do commit fixado em config/studio-source.json.
 *
 * Por quê: o Studio é desenvolvido no branch MiguelNevesZane, fora desta distribuição (main ignora /interface/).
 * Sem este passo, a cópia instalada no PC fica congelada na versão do dia em que foi instalada, enquanto o atalho
 * da Área de Trabalho continua abrindo essa versão velha.
 *
 * Determinístico: instala exatamente o commit fixado (busca no remoto só se o objeto não existir localmente);
 * `--latest` usa a ponta do branch e imprime o SHA para fixar. Lê do git apenas `interface/` (mais install.ps1 e
 * install.sh do mesmo commit, que os testes do Studio leem), nunca o resto do branch; para tudo se aparecer
 * arquivo com cara de segredo, link simbólico ou submódulo. Roda o `npm test` do Studio antes de trocar a cópia
 * instalada; a troca é atômica (instalador do próprio Studio). Não para um Studio em execução sem `--restart`.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const STUDIO_PORT = 4123;
export const EXTRA_PATHS = Object.freeze(['install.ps1', 'install.sh']);
// O teste exige `py -3.14` (ou python3) e não respeita PI_STUDIO_PYTHON; sem esse Python ele falha por ambiente.
// Nome sem espaço: vai dentro de NODE_OPTIONS. Só esse teste do Studio tem "NVIDIA" no nome.
export const VOICE_PYTHON_TEST = 'NVIDIA';
const SECRET_NAME = /(^|\/)(auth\.json|mcp-secrets\.json|api_key|\.env(\.[^/]*)?|[^/]+\.(pem|key|p12|pfx))$/i;

export function isAllowedPath(file) {
  if (EXTRA_PATHS.includes(file)) return true;
  return file.startsWith('interface/') && !file.split('/').includes('node_modules');
}

export function looksSecret(file) {
  return SECRET_NAME.test(file) || /(^|\/)config\/jev(\/|$)/i.test(file);
}

// `git ls-tree -r -z` → [{ mode, type, sha, file }]; só blobs comuns entram, o resto para a sincronização.
export function parseTree(output) {
  const entries = [];
  for (const record of output.split('\0')) {
    if (!record) continue;
    const match = /^(\d{6}) (\w+) ([0-9a-f]{40,64})\t(.+)$/s.exec(record);
    if (!match) throw new Error(`Linha inesperada de git ls-tree: ${JSON.stringify(record)}`);
    entries.push({ mode: match[1], type: match[2], sha: match[3], file: match[4] });
  }
  return entries;
}

export function selectEntries(entries) {
  const selected = [];
  for (const entry of entries) {
    if (!isAllowedPath(entry.file)) continue;
    if (looksSecret(entry.file)) throw new Error(`Arquivo com cara de segredo no Studio, nada foi instalado: ${entry.file}`);
    if (entry.type !== 'blob' || !['100644', '100755'].includes(entry.mode)) {
      throw new Error(`Entrada não suportada (${entry.mode} ${entry.type}) no Studio, nada foi instalado: ${entry.file}`);
    }
    selected.push(entry);
  }
  if (!selected.some((entry) => entry.file === 'interface/desktop/install-payload-cli.mjs')) {
    throw new Error('O commit não tem interface/desktop/install-payload-cli.mjs; não parece um PI Studio instalável.');
  }
  return selected;
}

// Padrão para --test-skip-pattern quando falta o Python que o teste de voz exige; null = rodar tudo.
export function voiceTestSkip({ platform = process.platform, probe = probePython } = {}) {
  const python = platform === 'win32' ? ['py', ['-3.14', '--version']] : ['python3', ['--version']];
  return probe(python[0], python[1]) ? null : VOICE_PYTHON_TEST;
}

function probePython(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', windowsHide: true, timeout: 10_000 });
  return result.status === 0;
}

export function parseArgs(argv) {
  const options = { latest: false, skipTests: false, shortcuts: false, restart: false, ref: null, piDir: null, repo: null, source: null, extractOnly: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = () => {
      const next = argv[index + 1];
      if (next === undefined || next.startsWith('--')) throw new Error(`${arg} precisa de um valor.`);
      index += 1;
      return next;
    };
    if (arg === '--latest') options.latest = true;
    else if (arg === '--skip-tests') options.skipTests = true;
    else if (arg === '--shortcuts') options.shortcuts = true;
    else if (arg === '--restart') options.restart = true;
    else if (arg === '--ref') options.ref = value();
    else if (arg === '--pi-dir') options.piDir = path.resolve(value());
    else if (arg === '--repo') options.repo = path.resolve(value());
    else if (arg === '--source') options.source = path.resolve(value());
    else if (arg === '--extract-only') options.extractOnly = path.resolve(value());
    else throw new Error(`Opção desconhecida: ${arg}`);
  }
  if (options.latest && options.ref) throw new Error('Use --latest ou --ref, não os dois.');
  return options;
}

function git(repo, args, options = {}) {
  return execFileSync('git', ['-C', repo, ...args], { maxBuffer: 64 * 1024 * 1024, windowsHide: true, ...options });
}

function hasCommit(repo, ref) {
  return spawnSync('git', ['-C', repo, 'cat-file', '-e', `${ref}^{commit}`], { windowsHide: true }).status === 0;
}

export function resolveCommit(repo, source, { latest = false, ref = null } = {}) {
  if (latest) {
    git(repo, ['fetch', '--quiet', source.remote, source.branch], { stdio: 'inherit' });
    return git(repo, ['rev-parse', '--verify', 'FETCH_HEAD^{commit}'], { encoding: 'utf8' }).trim();
  }
  const wanted = ref ?? source.commit;
  if (!wanted) throw new Error('config/studio-source.json não tem "commit".');
  if (!hasCommit(repo, wanted)) {
    git(repo, ['fetch', '--quiet', source.remote, source.branch], { stdio: 'inherit' });
    if (!hasCommit(repo, wanted) && /^[0-9a-f]{40}$/.test(wanted)) git(repo, ['fetch', '--quiet', source.remote, wanted], { stdio: 'inherit' });
    if (!hasCommit(repo, wanted)) throw new Error(`Commit do Studio não encontrado: ${wanted}`);
  }
  return git(repo, ['rev-parse', '--verify', `${wanted}^{commit}`], { encoding: 'utf8' }).trim();
}

export function extractStudio(repo, commit, destination) {
  const tree = git(repo, ['ls-tree', '-r', '-z', '--full-tree', commit, '--', 'interface', ...EXTRA_PATHS], { encoding: 'utf8' });
  const entries = selectEntries(parseTree(tree));
  for (const entry of entries) {
    const target = path.join(destination, ...entry.file.split('/'));
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, git(repo, ['cat-file', 'blob', entry.sha]));
    if (entry.mode === '100755' && process.platform !== 'win32') chmodSync(target, 0o755);
  }
  return entries.map((entry) => entry.file);
}

function runStudioTests(interfaceDir) {
  const skip = voiceTestSkip();
  const env = { ...process.env };
  if (skip) {
    env.NODE_OPTIONS = [env.NODE_OPTIONS, `--test-skip-pattern=${skip}`].filter(Boolean).join(' ');
    console.log('  Python do teste de voz ausente: pulando o teste das DLLs NVIDIA da voz (não afeta o restante do Studio).');
  }
  // Comando inteiro numa string: com shell e sem args, o Node não emite DEP0190.
  const result = spawnSync('npm test', { cwd: interfaceDir, env, stdio: 'inherit', shell: true, windowsHide: true });
  if (result.status !== 0) throw new Error(`npm test do Studio falhou (código ${result.status ?? result.error?.code}); a cópia instalada não foi trocada.`);
}

async function studioRunning(port = STUDIO_PORT) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1500) });
    return response.ok && /name="pi-studio-token"/.test(await response.text());
  } catch {
    return false;
  }
}

function stopStudio(studioDir) {
  const result = process.platform === 'win32'
    ? spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(studioDir, 'desktop', 'launch-windows.ps1'), '-Stop'], { stdio: 'inherit', windowsHide: true })
    : spawnSync('bash', [path.join(studioDir, 'desktop', process.platform === 'darwin' ? 'launch-macos.sh' : 'launch-unix.sh'), '--stop'], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error('Não foi possível parar o Studio em execução.');
}

function installShortcuts(studioDir, piDir) {
  let result;
  if (process.platform === 'win32') {
    // A Área de Trabalho pode estar redirecionada (OneDrive); só o Windows sabe o caminho real.
    const desktopDir = execFileSync('powershell.exe', ['-NoProfile', '-Command', "[Environment]::GetFolderPath('Desktop')"], { encoding: 'utf8', windowsHide: true }).trim();
    const startMenuDir = path.join(process.env.APPDATA ?? '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'PI Studio');
    result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(studioDir, 'desktop', 'install-app.ps1'),
      '-StudioDir', studioDir, '-DesktopDir', desktopDir, '-StartMenuDir', startMenuDir], { stdio: 'inherit', windowsHide: true });
  } else {
    result = spawnSync('bash', [path.join(studioDir, 'desktop', 'install-app.sh'), piDir, os.homedir(), process.platform === 'darwin' ? 'darwin' : 'linux'], { stdio: 'inherit' });
  }
  if (result.status !== 0) throw new Error('Falha ao criar os atalhos do PI Studio.');
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const repo = options.repo ?? repoRoot;
  const source = JSON.parse(readFileSync(options.source ?? path.join(repo, 'config', 'studio-source.json'), 'utf8'));
  const commit = resolveCommit(repo, source, options);
  console.log(`PI Studio: ${source.remote}/${source.branch} @ ${commit}`);
  if (options.latest && commit !== source.commit) console.log(`  Para fixar esta versão, grave "commit": "${commit}" em config/studio-source.json.`);

  if (options.extractOnly) {
    const files = extractStudio(repo, commit, options.extractOnly);
    console.log(`  ${files.length} arquivos extraídos em ${options.extractOnly}`);
    return 0;
  }

  const piDir = options.piDir ?? path.join(os.homedir(), '.pi', 'agent');
  const staging = mkdtempSync(path.join(os.tmpdir(), 'pi-studio-sync-'));
  try {
    const files = extractStudio(repo, commit, staging);
    console.log(`  ${files.length} arquivos extraídos`);
    const interfaceDir = path.join(staging, 'interface');
    if (options.skipTests) console.log('  --skip-tests: testes do Studio não rodados.');
    else runStudioTests(interfaceDir);

    const installer = spawnSync(process.execPath, [path.join(interfaceDir, 'desktop', 'install-payload-cli.mjs'), interfaceDir, piDir], { stdio: 'inherit', windowsHide: true });
    if (installer.status !== 0) throw new Error('Falha ao instalar os arquivos do PI Studio.');
    const studioDir = path.join(piDir, 'studio');
    writeFileSync(path.join(studioDir, '.source.json'), `${JSON.stringify({ ...source, commit, installedAt: new Date().toISOString() }, null, 2)}\n`);
    if (process.platform === 'win32') {
      mkdirSync(path.join(piDir, 'bin'), { recursive: true });
      // bin\pi-studio.cmd só repassa para o cliente instalado (cli.mjs precisa do public/ ao lado).
      writeFileSync(path.join(piDir, 'bin', 'pi-studio.cmd'), '@chcp 65001 >nul\r\n@node "%~dp0..\\studio\\cli.mjs" %*', 'ascii');
    }
    if (options.shortcuts) installShortcuts(studioDir, piDir);
    console.log(`  Instalado em ${studioDir}`);

    if (await studioRunning()) {
      if (options.restart) {
        stopStudio(studioDir);
        console.log('  Studio antigo parado; abra o atalho PI Studio para usar a versão nova.');
      } else {
        console.log('  Um Studio já está rodando com a versão anterior. Ele segue até ser parado; para trocar agora, rode de novo com --restart');
        console.log('  (isso encerra os PIs abertos pelo Studio) ou feche-o e abra o atalho PI Studio.');
      }
    }
    return 0;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => process.exit(code), (error) => {
    console.error(`sync-studio: ${error.message}`);
    process.exit(1);
  });
}
