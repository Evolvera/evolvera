#!/usr/bin/env node
/**
 * Instala ou atualiza o PI Studio (~/.pi/agent/studio) a partir de studio/ deste repositório.
 *
 * Por quê: o Studio é código desta branch (studio/, ver studio/README.md). Sem este passo, a cópia instalada no PC
 * fica congelada na versão do dia em que foi instalada, enquanto o atalho da Área de Trabalho continua abrindo ela.
 *
 * Copia só studio/interface e os dois instaladores do Studio (install.ps1, install.sh, que os testes leem); para
 * tudo se aparecer arquivo com cara de segredo ou link simbólico. Roda o `npm test` do Studio numa cópia temporária
 * antes de trocar a instalada; a troca é atômica (instalador do próprio Studio). Não para um Studio em execução sem
 * `--restart`.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const STUDIO_PORT = 4123;
export const STUDIO_DIR = 'studio';
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

// Os arquivos do Studio a instalar, caminhos relativos com "/": só interface/ (sem node_modules) e os instaladores.
// Segredo ou link simbólico param tudo antes de qualquer cópia.
export function listStudioFiles(sourceDir) {
  const files = [];
  const walk = (relative) => {
    for (const entry of readdirSync(path.join(sourceDir, relative), { withFileTypes: true })) {
      const file = relative ? `${relative}/${entry.name}` : entry.name;
      if (lstatSync(path.join(sourceDir, file)).isSymbolicLink()) throw new Error(`Link simbólico no Studio, nada foi instalado: ${file}`);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') continue;
        if (file === 'interface' || file.startsWith('interface/')) walk(file);
        continue;
      }
      if (!entry.isFile() || !isAllowedPath(file)) continue;
      if (looksSecret(file)) throw new Error(`Arquivo com cara de segredo no Studio, nada foi instalado: ${file}`);
      files.push(file);
    }
  };
  walk('');
  if (!files.includes('interface/desktop/install-payload-cli.mjs')) {
    throw new Error(`${sourceDir} não tem interface/desktop/install-payload-cli.mjs; não parece um PI Studio instalável.`);
  }
  return files.sort();
}

export function copyStudio(sourceDir, destination) {
  const files = listStudioFiles(sourceDir);
  for (const file of files) {
    const target = path.join(destination, ...file.split('/'));
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(path.join(sourceDir, ...file.split('/')), target);
  }
  return files;
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
  const options = { skipTests: false, shortcuts: false, restart: false, piDir: null, sourceDir: null, extractOnly: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = () => {
      const next = argv[index + 1];
      if (next === undefined || next.startsWith('--')) throw new Error(`${arg} precisa de um valor.`);
      index += 1;
      return next;
    };
    if (arg === '--skip-tests') options.skipTests = true;
    else if (arg === '--shortcuts') options.shortcuts = true;
    else if (arg === '--restart') options.restart = true;
    else if (arg === '--pi-dir') options.piDir = path.resolve(value());
    else if (arg === '--source-dir') options.sourceDir = path.resolve(value());
    else if (arg === '--extract-only') options.extractOnly = path.resolve(value());
    else throw new Error(`Opção desconhecida: ${arg}`);
  }
  return options;
}

// O commit desta branch que está sendo instalado, para .source.json; null fora de um checkout git.
function repoCommit(dir) {
  const result = spawnSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true });
  return result.status === 0 ? result.stdout.trim() : null;
}

function runStudioTests(interfaceDir) {
  const skip = voiceTestSkip();
  const env = { ...process.env };
  if (skip) {
    env.NODE_OPTIONS = [env.NODE_OPTIONS, `--test-skip-pattern=${skip}`].filter(Boolean).join(' ');
    console.log('  Python do teste de voz ausente: pulando o teste das DLLs NVIDIA da voz (não afeta o restante do Studio).');
  }
  // Comando inteiro numa string: com shell e sem args, o Node não emite DEP0190. A saída passa por aqui para
  // apontar os testes que falharam.
  const run = () => {
    const result = spawnSync('npm test', { cwd: interfaceDir, env, encoding: 'utf8', shell: true, windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
    process.stdout.write(result.stdout ?? '');
    process.stderr.write(result.stderr ?? '');
    return { ok: result.status === 0, code: result.status ?? result.error?.code, failed: failedTests(result.stdout ?? '') };
  };
  const first = run();
  if (first.ok) return;
  // Um teste do Studio depende de tempo e falha às vezes com a suíte inteira carregando a CPU (passa sozinho).
  // Uma segunda rodada separa isso de uma falha real; uma falha que se repete continua bloqueando a instalação.
  console.log(`  npm test falhou na 1ª rodada (${first.failed.join('; ') || `código ${first.code}`}); repetindo uma vez.`);
  const second = run();
  if (!second.ok) throw new Error(`npm test do Studio falhou duas vezes (${second.failed.join('; ') || `código ${second.code}`}); a cópia instalada não foi trocada.`);
  console.log(`  2ª rodada passou. Instável na 1ª: ${first.failed.join('; ') || 'sem nome'}.`);
}

// Nomes dos testes na lista "failing tests" do reporter do node:test.
export function failedTests(output) {
  const tail = output.split(/\r?\n/).slice(output.split(/\r?\n/).findIndex((line) => /failing tests:/.test(line)) + 1);
  return [...new Set(tail.map((line) => /^\s*✖ (.+?)(?: \(\d+(?:\.\d+)?ms\))?$/.exec(line)?.[1]).filter(Boolean))];
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
  const sourceDir = options.sourceDir ?? path.join(repoRoot, STUDIO_DIR);
  if (!existsSync(sourceDir)) throw new Error(`Pasta do Studio não encontrada: ${sourceDir}`);
  const commit = repoCommit(sourceDir);
  console.log(`PI Studio: ${sourceDir}${commit ? ` @ ${commit.slice(0, 12)}` : ''}`);

  if (options.extractOnly) {
    const files = copyStudio(sourceDir, options.extractOnly);
    console.log(`  ${files.length} arquivos copiados para ${options.extractOnly}`);
    return 0;
  }

  const piDir = options.piDir ?? path.join(os.homedir(), '.pi', 'agent');
  const staging = mkdtempSync(path.join(os.tmpdir(), 'pi-studio-sync-'));
  try {
    const files = copyStudio(sourceDir, staging);
    console.log(`  ${files.length} arquivos copiados`);
    const interfaceDir = path.join(staging, 'interface');
    if (options.skipTests) console.log('  --skip-tests: testes do Studio não rodados.');
    else runStudioTests(interfaceDir);

    const installer = spawnSync(process.execPath, [path.join(interfaceDir, 'desktop', 'install-payload-cli.mjs'), interfaceDir, piDir], { stdio: 'inherit', windowsHide: true });
    if (installer.status !== 0) throw new Error('Falha ao instalar os arquivos do PI Studio.');
    const studioDir = path.join(piDir, 'studio');
    writeFileSync(path.join(studioDir, '.source.json'), `${JSON.stringify({ source: 'NatiamG/studio', commit, base: 'MiguelNevesZane@a3a9e74', installedAt: new Date().toISOString() }, null, 2)}\n`);
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
