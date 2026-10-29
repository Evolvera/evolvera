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
 *
 * Mudanças do NatiamG no Studio ficam em studio-patches/*.patch (diffs sobre o commit fixado, em ordem de nome),
 * aplicados depois da extração e antes dos testes. Um patch só pode tocar interface/, nunca cria link simbólico, e
 * um patch que não aplica limpo para tudo. Ao subir o commit fixado, os patches precisam aplicar no commit novo.
 */
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  const options = { latest: false, skipTests: false, shortcuts: false, restart: false, noPatches: false, ref: null, piDir: null, repo: null, source: null, extractOnly: null };
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
    else if (arg === '--no-patches') options.noPatches = true;
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

export const PATCHES_DIR = 'studio-patches';

export function listPatches(repo) {
  const dir = path.join(repo, PATCHES_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => name.endsWith('.patch')).sort().map((name) => path.join(dir, name));
}

// Caminhos que um diff no formato do git toca (`diff --git` e renomeações) e se ele cria link simbólico ou
// submódulo. Linhas ---/+++ não são lidas: dentro de um trecho elas podem ser conteúdo.
export function inspectPatch(text) {
  const files = new Set();
  let special = false;
  for (const line of text.split(/\r?\n/)) {
    const rename = /^(?:rename|copy) (?:from|to) (.+)$/.exec(line);
    if (rename) files.add(rename[1]);
    const diff = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
    if (diff) { files.add(diff[1]); files.add(diff[2]); }
    if (/^(?:new file mode|new mode|old mode|deleted file mode) (?:120000|160000)$/.test(line) || /^index \S+ (?:120000|160000)$/.test(line)) special = true;
  }
  return { files: [...files], special };
}

export function applyPatches(destination, patches) {
  const applied = [];
  for (const file of patches) {
    const text = readFileSync(file, 'utf8');
    const name = path.basename(file);
    const { files, special } = inspectPatch(text);
    if (!files.length) throw new Error(`Patch sem cabeçalho "diff --git" (gere com git diff): ${name}`);
    const outside = files.find((item) => !item.startsWith('interface/') || item.split('/').includes('..'));
    if (outside) throw new Error(`Patch ${name} toca ${outside}, fora de interface/; nada foi instalado.`);
    if (special) throw new Error(`Patch ${name} cria link simbólico ou submódulo; nada foi instalado.`);
    const blocked = files.find(looksSecret);
    if (blocked) throw new Error(`Patch ${name} toca arquivo com cara de segredo (${blocked}); nada foi instalado.`);
    // Sem o teto, um destino dentro de outro repositório faria o git aplicar a partir da raiz dele; sem autocrlf=false,
    // o core.autocrlf=true comum no Windows gravaria CRLF nos arquivos tocados.
    const env = { ...process.env, GIT_CEILING_DIRECTORIES: path.dirname(path.resolve(destination)) };
    const result = spawnSync('git', ['-c', 'core.autocrlf=false', 'apply', '--whitespace=nowarn', file], { cwd: destination, env, encoding: 'utf8', windowsHide: true });
    if (result.status !== 0) throw new Error(`Patch ${name} não aplica no commit fixado: ${(result.stderr || '').trim()}`);
    applied.push({ name, sha256: createHash('sha256').update(text).digest('hex') });
  }
  return applied;
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
  const repo = options.repo ?? repoRoot;
  const source = JSON.parse(readFileSync(options.source ?? path.join(repo, 'config', 'studio-source.json'), 'utf8'));
  const commit = resolveCommit(repo, source, options);
  console.log(`PI Studio: ${source.remote}/${source.branch} @ ${commit}`);
  if (options.latest && commit !== source.commit) console.log(`  Para fixar esta versão, grave "commit": "${commit}" em config/studio-source.json.`);

  const patches = options.noPatches ? [] : listPatches(repo);
  const extract = (destination) => {
    const files = extractStudio(repo, commit, destination);
    const applied = applyPatches(destination, patches);
    console.log(`  ${files.length} arquivos extraídos${applied.length ? `, ${applied.length} patch(es) do NatiamG aplicado(s): ${applied.map((item) => item.name).join(', ')}` : ''}`);
    return applied;
  };

  if (options.extractOnly) {
    extract(options.extractOnly);
    console.log(`  Em ${options.extractOnly}`);
    return 0;
  }

  const piDir = options.piDir ?? path.join(os.homedir(), '.pi', 'agent');
  const staging = mkdtempSync(path.join(os.tmpdir(), 'pi-studio-sync-'));
  try {
    const applied = extract(staging);
    const interfaceDir = path.join(staging, 'interface');
    if (options.skipTests) console.log('  --skip-tests: testes do Studio não rodados.');
    else runStudioTests(interfaceDir);

    const installer = spawnSync(process.execPath, [path.join(interfaceDir, 'desktop', 'install-payload-cli.mjs'), interfaceDir, piDir], { stdio: 'inherit', windowsHide: true });
    if (installer.status !== 0) throw new Error('Falha ao instalar os arquivos do PI Studio.');
    const studioDir = path.join(piDir, 'studio');
    writeFileSync(path.join(studioDir, '.source.json'), `${JSON.stringify({ ...source, commit, patches: applied, installedAt: new Date().toISOString() }, null, 2)}\n`);
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
