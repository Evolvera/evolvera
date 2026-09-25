// Snapshot only installer/patcher write targets, not all of ~/.pi/agent: the
// active PI session continually writes sessions, logs, and runtime memory there.
// The scoped destinations below are the approved CA2 boundary.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const bash = execFileSync(process.platform === 'win32' ? 'where.exe' : 'which', ['bash'], { encoding: 'utf8' }).trim().split(/\r?\n/)[0];
const realHome = os.homedir();
const realAgent = path.join(realHome, '.pi', 'agent');
const globalModules = execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['root', '-g'], {
  encoding: 'utf8', shell: process.platform === 'win32',
}).trim();
const sdkSource = path.join(globalModules, '@earendil-works', 'pi-coding-agent');
const subagentsSource = path.join(realAgent, 'npm', 'node_modules', '@tintinweb', 'pi-subagents');
const authSource = path.join(realAgent, 'npm', 'node_modules', '@gotgenes', 'pi-anthropic-auth');
const sdkFiles = [
  'package.json',
  'dist/core/agent-session.js',
  'dist/cli/args.js',
  'dist/core/model-config.js',
  'dist/modes/interactive/components/settings-selector.js',
  'dist/modes/interactive/components/thinking-selector.js',
  'dist/modes/interactive/interactive-mode.js',
  'dist/modes/interactive/theme/theme.js',
  'dist/modes/interactive/theme/theme.d.ts',
  'dist/modes/interactive/theme/dark.json',
  'dist/modes/interactive/theme/light.json',
  'dist/modes/interactive/theme/theme-schema.json',
  'node_modules/@earendil-works/pi-ai/package.json',
  'node_modules/@earendil-works/pi-ai/dist/types.d.ts',
  'node_modules/@earendil-works/pi-ai/dist/models.js',
  'node_modules/@earendil-works/pi-ai/dist/api/anthropic-messages.js',
  'node_modules/@earendil-works/pi-ai/dist/api/openai-completions.js',
  'node_modules/@earendil-works/pi-ai/dist/api/openai-codex-responses.d.ts',
  'node_modules/@earendil-works/pi-agent-core/dist/types.d.ts',
];
const subagentsFiles = ['package.json', 'src/index.ts', 'dist/index.js'];
const authFiles = ['package.json', 'src/constants.ts'];
const sourceInputs = [
  ...sdkFiles.map((relative) => path.join(sdkSource, relative)),
  ...subagentsFiles.map((relative) => path.join(subagentsSource, relative)),
  ...authFiles.map((relative) => path.join(authSource, relative)),
];
// Snapshot only installer/patcher write surfaces in the real home. Deliberately
// exclude sessions, logs, and runtime memory: the active PI session writes there.
const agentWriteTargets = [
  ...['agents', 'skills', 'extensions'].map((name) => path.join(realAgent, name)),
  ...['settings.json', 'mcp.json'].map((name) => path.join(realAgent, name)),
  ...[
    '@tintinweb/pi-subagents', '@gotgenes/pi-anthropic-auth',
    'pi-mcp-adapter', 'pi-alibaba-models', '@narumitw/pi-goal',
    '@juicesharp/rpiv-todo',
  ].map((name) => path.join(realAgent, 'npm', 'node_modules', name)),
];
const realWriteTargets = [
  ...agentWriteTargets,
  ...sourceInputs,
];
const absent = sourceInputs.filter((file) => !fs.existsSync(file));
if (absent.length) {
  console.log(`NÃO VERIFICADO: arquivos de origem ausentes; casos que dependem deles serão pulados: ${absent.join(', ')}`);
  throw new Error('origem incompleta para executar o instalador isolado');
}

function snapshotTree(directory) {
  const entries = [];
  if (!fs.existsSync(directory)) return entries;
  if (!fs.lstatSync(directory).isDirectory()) {
    const stat = fs.lstatSync(directory);
    return [[path.basename(directory), stat.isSymbolicLink() ? 'symlink' : 'file', stat.mtimeMs, stat.size,
      stat.isSymbolicLink() ? fs.readlinkSync(directory) : createHash('sha256').update(fs.readFileSync(directory)).digest('hex')]];
  }
  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      const stat = fs.lstatSync(absolute);
      const relative = path.relative(directory, absolute);
      entries.push([relative, entry.isDirectory() ? 'directory' : entry.isSymbolicLink() ? 'symlink' : 'file', stat.mtimeMs, stat.size,
        entry.isSymbolicLink() ? fs.readlinkSync(absolute) : entry.isDirectory() ? '' :
          createHash('sha256').update(fs.readFileSync(absolute)).digest('hex')]);
      if (entry.isDirectory()) visit(absolute);
    }
  }
  visit(directory);
  return entries.sort(([a], [b]) => a.localeCompare(b));
}
function snapshotTargets() {
  return realWriteTargets.map((target) => [target, snapshotTree(target)]);
}
function copySubset(source, destination, files) {
  for (const relative of files) {
    const from = path.join(source, relative);
    const to = path.join(destination, relative);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  }
}
function copyPackage(source, destination, files) {
  copySubset(source, destination, files);
}
function makeCase(label, { space = false, failPackage = '' } = {}) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), space ? 'evolvera install ' : 'evolvera-install-'));
  const home = path.join(parent, space ? 'home with spaces' : 'home');
  fs.mkdirSync(home);
  const fakeGlobalModules = path.join(parent, 'npm-global', 'node_modules');
  const fakeSdk = path.join(fakeGlobalModules, '@earendil-works', 'pi-coding-agent');
  const fakeSubagents = path.join(parent, 'fixtures', 'pi-subagents');
  const fakeAuth = path.join(parent, 'fixtures', 'pi-anthropic-auth');
  const fakeBin = path.join(parent, 'bin');
  fs.mkdirSync(fakeBin, { recursive: true });
  copyPackage(sdkSource, fakeSdk, sdkFiles);
  copyPackage(subagentsSource, fakeSubagents, subagentsFiles);
  copyPackage(authSource, fakeAuth, authFiles);
  for (const command of ['pi', 'npm']) {
    const source = path.join(root, 'scripts', 'test', 'fixtures', command);
    const destination = path.join(fakeBin, command);
    fs.copyFileSync(source, destination);
    fs.chmodSync(destination, 0o755);
  }
  fs.copyFileSync(path.join(root, 'scripts/test/fixtures/npm.cmd'), path.join(fakeBin, 'npm.cmd'));
  const log = path.join(parent, 'install.log');
  // Poison inherited destination selectors so this smoke catches accidental
  // fallback to the caller's PI/npm configuration.
  const inheritedEnv = {
    ...process.env,
    PI_CODING_AGENT_DIR: path.join(parent, 'inherited-pi-agent'),
    PI_TEST_DESTINATION: path.join(parent, 'inherited-pi-target'),
    npm_config_prefix: path.join(parent, 'inherited-npm-prefix'),
    npm_config_cache: path.join(parent, 'inherited-npm-cache'),
  };
  const safeInheritedEnv = Object.fromEntries(
    Object.entries(inheritedEnv).filter(([key]) => !/^(PI_|npm_config_)/i.test(key)),
  );
  const env = {
    ...safeInheritedEnv,
    HOME: home,
    USERPROFILE: home,
    XDG_CONFIG_HOME: path.join(home, '.config'),
    PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? ''}`,
    FAKE_INSTALL_LOG: log,
    FAKE_NPM_ROOT: fakeGlobalModules,
    FAKE_SUBAGENTS_FIXTURE: fakeSubagents,
    FAKE_AUTH_FIXTURE: fakeAuth,
    PI_CODING_AGENT_DIR: path.join(home, '.pi', 'agent'),
  };
  delete env.WSL_DISTRO_NAME;
  delete env.WSL_INTEROP;
  if (failPackage) env.FAKE_PI_FAIL = failPackage;
  else delete env.FAKE_PI_FAIL;
  return { label, parent, home, env, log, fakeBin, fakeGlobalModules };
}
function runInstall(testCase) {
  const child = spawnSync(bash, [path.join(root, 'install.sh')], {
    cwd: root, encoding: 'utf8', env: testCase.env, timeout: 25_000,
  });
  assert.equal(child.error, undefined, `${testCase.label}: ${child.error?.message ?? ''}`);
  assert.equal(child.status, 0, `${testCase.label}: ${child.stderr}\n${child.stdout}`);
  return `${child.stdout}${child.stderr}`;
}
function assertInstalled(testCase, mcpExpected) {
  const agent = path.join(testCase.home, '.pi', 'agent');
  for (const name of ['agents', 'skills', 'extensions']) assert.ok(fs.statSync(path.join(agent, name)).isDirectory(), `${testCase.label}: ${name}`);
  assert.ok(fs.existsSync(path.join(agent, 'agents', 'scout.md')), `${testCase.label}: agents/scout.md`);
  assert.ok(fs.existsSync(path.join(agent, 'skills', 'copy-thief', 'SKILL.md')), `${testCase.label}: skills/copy-thief/SKILL.md`);
  assert.ok(fs.existsSync(path.join(agent, 'extensions', 'execution-mode.ts')), `${testCase.label}: extensions/execution-mode.ts`);
  const settingsPath = path.join(agent, 'settings.json');
  assert.ok(fs.statSync(settingsPath).isFile(), `${testCase.label}: settings.json`);
  assert.equal(JSON.parse(fs.readFileSync(settingsPath, 'utf8')).compaction.reserveTokens,
    JSON.parse(fs.readFileSync(path.join(root, 'config/settings.json'), 'utf8')).compaction.reserveTokens,
    `${testCase.label}: settings.json compaction.reserveTokens`);
  const mcpPath = path.join(agent, 'mcp.json');
  assert.ok(fs.statSync(mcpPath).isFile(), `${testCase.label}: mcp.json`);
  if (mcpExpected !== null) {
    assert.deepEqual(fs.readFileSync(mcpPath), mcpExpected, `${testCase.label}: mcp.json bytes differ`);
  }
}
function hostPathFromBash(value) {
  if (process.platform === 'win32' && /^\/[a-z]\//i.test(value)) {
    return path.resolve(`${value[1].toUpperCase()}:${value.slice(2).replaceAll('/', path.sep)}`);
  }
  return path.resolve(value);
}
function runPreflight(testCase) {
  const command = process.platform === 'win32'
    ? 'set -e; npm_bin=$(command -v npm); npm_root=$(npm root -g); pi_bin=$(command -v pi); printf "%s\\n%s\\n%s\\n" "$(cygpath -aw "$npm_bin")" "$(cygpath -aw "$npm_root")" "$(cygpath -aw "$pi_bin")"'
    : 'command -v npm; npm root -g; command -v pi';
  const probe = spawnSync(bash, ['-c', command], {
    cwd: root, encoding: 'utf8', env: testCase.env, timeout: 5_000,
  });
  assert.equal(probe.error, undefined, `${testCase.label}: preflight bash: ${probe.error?.message ?? ''}`);
  assert.equal(probe.status, 0, `${testCase.label}: preflight failed: ${probe.stderr}`);
  const lines = probe.stdout.trim().split(/\r?\n/);
  assert.equal(lines.length, 3, `${testCase.label}: preflight must return npm, npm root -g, pi`);
  assert.equal(hostPathFromBash(lines[0]), path.resolve(testCase.fakeBin, 'npm'), 'command -v npm did not resolve to tmp stub');
  assert.equal(hostPathFromBash(lines[1]), path.resolve(testCase.fakeGlobalModules), 'npm root -g did not resolve to tmp root');
  assert.equal(hostPathFromBash(lines[2]), path.resolve(testCase.fakeBin, 'pi'), 'command -v pi did not resolve to tmp stub');
  if (process.platform === 'win32') {
    const npmCmdRoot = execFileSync('npm.cmd', ['root', '-g'], {
      encoding: 'utf8', env: testCase.env, shell: true, timeout: 5_000,
    }).trim();
    assert.equal(hostPathFromBash(npmCmdRoot), path.resolve(testCase.fakeGlobalModules), 'npm.cmd did not resolve to tmp root');
  }
}

// STATEFUL RESOURCE PROOF: this unique mkdtemp owns HOME, USERPROFILE, XDG_CONFIG_HOME,
// fake npm-global, fixtures, and logs. Bash resolves fake pi/npm first on PATH; the fake
// npm root -g reports the tmpdir root. PI_* destination overrides and npm_config_*
// selectors are stripped, then PI_CODING_AGENT_DIR is pinned to this HOME. Neither
// stub accesses network. The real-home snapshot is limited to install/patch write
// targets; sessions, logs, and runtime memory are excluded because PI writes there.
const realTargetsBefore = snapshotTargets();
const home = makeCase('instalação limpa e HOME com espaço', { space: true });
try {
  for (const key of ['HOME', 'USERPROFILE', 'XDG_CONFIG_HOME']) {
    assert.ok(path.resolve(home.env[key]).startsWith(`${path.resolve(home.parent)}${path.sep}`), `${key} fora do tmpdir`);
  }
  const expectedAgent = path.join(home.home, '.pi', 'agent');
  assert.equal(home.env.PI_CODING_AGENT_DIR, expectedAgent, 'PI_CODING_AGENT_DIR fora do HOME temporário');
  assert.deepEqual(
    Object.keys(home.env).filter((key) => /^(PI_|npm_config_)/i.test(key) && key !== 'PI_CODING_AGENT_DIR'),
    [],
    'variáveis PI_ ou npm_config_ herdadas',
  );
  runPreflight(home);

  const cleanOutput = runInstall(home);
  assertInstalled(home, fs.readFileSync(path.join(root, 'config/mcp.json')));
  assert.ok(cleanOutput.includes('Setup completo!'), 'clean install should still report full success');
  const mcpPath = path.join(home.home, '.pi', 'agent', 'mcp.json');
  const expected = Buffer.from('{"preserve-me":true}\n');
  fs.writeFileSync(mcpPath, expected);
  const failedPackage = 'npm:@tintinweb/pi-subagents@0.18.2';
  fs.rmSync(path.join(home.home, '.pi', 'agent', 'npm', 'node_modules', '@tintinweb', 'pi-subagents'),
    { recursive: true, force: true });
  home.env.FAKE_PI_FAIL = failedPackage;
  home.env.FAKE_PI_FAIL_REASON = 'simulated registry unavailable';
  const output = runInstall(home);
  assert.ok(output.includes('Falha ao instalar npm:@tintinweb/pi-subagents@0.18.2: simulated registry unavailable'),
    'warning must identify package and summarized cause');
  assert.ok(output.includes('Pacotes com falha: npm:@tintinweb/pi-subagents@0.18.2'),
    'final summary must list the failed package');
  assert.ok(output.includes('Setup completo com ressalvas'), 'partial setup must be caveated');
  assert.ok(!output.includes('Setup completo!'), 'failure must not be reported as full success');
  assert.ok(output.includes('Pulando patch de pi-subagents'), 'dependent patch must be skipped visibly');
  assert.equal(fs.existsSync(path.join(home.home, '.pi', 'agent', 'npm', 'node_modules', '@tintinweb', 'pi-subagents')), false,
    'pi-subagents package must remain absent after simulated install failure');
  assertInstalled(home, expected);
} finally {
  fs.rmSync(home.parent, { recursive: true, force: true });
}

// BUG CONHECIDO #12: falhas de `pi install` ainda são ocultadas nesta baseline;
// a issue #12 altera esse comportamento e acrescentará a asserção com FAKE_PI_FAIL.
assert.deepEqual(snapshotTargets(), realTargetsBefore, 'CA2: destinos reais de install/patch mudaram');
console.log(`install-sh smoke: PASS (DISPOSABLE_VERIFIED; bash=${bash})`);
