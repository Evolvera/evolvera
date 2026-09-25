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
  const env = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    XDG_CONFIG_HOME: path.join(home, '.config'),
    PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? ''}`,
    FAKE_INSTALL_LOG: log,
    FAKE_NPM_ROOT: fakeGlobalModules,
    FAKE_SUBAGENTS_FIXTURE: fakeSubagents,
    FAKE_AUTH_FIXTURE: fakeAuth,
  };
  delete env.WSL_DISTRO_NAME;
  delete env.WSL_INTEROP;
  if (failPackage) env.FAKE_PI_FAIL = failPackage;
  else delete env.FAKE_PI_FAIL;
  return { label, parent, home, env, log, fakeGlobalModules };
}
function runInstall(testCase) {
  const child = spawnSync(bash, [path.join(root, 'install.sh')], {
    cwd: root, encoding: 'utf8', env: testCase.env, timeout: 25_000,
  });
  assert.equal(child.error, undefined, `${testCase.label}: ${child.error?.message ?? ''}`);
  assert.equal(child.status, 0, `${testCase.label}: ${child.stderr}\n${child.stdout}`);
  return child.stdout;
}
function assertInstalled(testCase, mcpExpected) {
  const agent = path.join(testCase.home, '.pi', 'agent');
  for (const name of ['agents', 'skills', 'extensions']) assert.ok(fs.statSync(path.join(agent, name)).isDirectory(), `${testCase.label}: ${name}`);
  assert.ok(fs.statSync(path.join(agent, 'settings.json')).isFile(), `${testCase.label}: settings.json`);
  assert.ok(fs.statSync(path.join(agent, 'mcp.json')).isFile(), `${testCase.label}: mcp.json`);
  const mcp = fs.readFileSync(path.join(agent, 'mcp.json'), 'utf8');
  if (mcpExpected !== null) assert.equal(mcp, mcpExpected, `${testCase.label}: mcp.json was not preserved`);
  assert.ok(fs.readdirSync(path.join(agent, 'agents')).length > 0, `${testCase.label}: no agents copied`);
  assert.ok(fs.readdirSync(path.join(agent, 'skills')).length > 0, `${testCase.label}: no skills copied`);
  assert.ok(fs.readdirSync(path.join(agent, 'extensions')).length > 0, `${testCase.label}: no extensions copied`);
}

// STATEFUL RESOURCE PROOF: this unique mkdtemp owns HOME, USERPROFILE, XDG_CONFIG_HOME,
// fake npm-global, fixtures, and logs. Bash resolves fake pi/npm first on PATH; the fake
// npm root -g reports the tmpdir root. Neither stub accesses network. The real-home
// snapshot is limited to install/patch write targets below; sessions, logs, and runtime
// memory are explicitly excluded because the active PI session writes there continuously.
const realTargetsBefore = snapshotTargets();
const home = makeCase('instalação limpa e HOME com espaço', { space: true });
try {
  for (const key of ['HOME', 'USERPROFILE', 'XDG_CONFIG_HOME']) {
    assert.ok(path.resolve(home.env[key]).startsWith(`${path.resolve(home.parent)}${path.sep}`), `${key} fora do tmpdir`);
  }
  const npmRoot = execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['root', '-g'], {
    encoding: 'utf8', env: home.env, shell: process.platform === 'win32',
  }).trim();
  assert.equal(path.resolve(npmRoot), path.resolve(home.fakeGlobalModules), 'npm root -g fora do tmpdir');
  assert.ok(path.resolve(npmRoot).startsWith(`${path.resolve(home.parent)}${path.sep}`), 'npm root -g fora do tmpdir');

  runInstall(home);
  assertInstalled(home, null);
  const mcpPath = path.join(home.home, '.pi', 'agent', 'mcp.json');
  const expected = '{"preserve-me":true}\n';
  fs.writeFileSync(mcpPath, expected);
  runInstall(home);
  assertInstalled(home, expected);
} finally {
  fs.rmSync(home.parent, { recursive: true, force: true });
}

// BUG CONHECIDO #12: falhas de `pi install` ainda são ocultadas nesta baseline;
// a issue #12 altera esse comportamento e acrescentará a asserção com FAKE_PI_FAIL.
assert.deepEqual(snapshotTargets(), realTargetsBefore, 'CA2: destinos reais de install/patch mudaram');
console.log(`install-sh smoke: PASS (DISPOSABLE_VERIFIED; bash=${bash})`);
