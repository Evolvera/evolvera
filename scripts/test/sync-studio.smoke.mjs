import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  failedTests, isAllowedPath, looksSecret, main, parseArgs, parseTree, selectEntries, voiceTestSkip,
} from '../studio/sync-studio.mjs';

const temp = mkdtempSync(path.join(os.tmpdir(), 'evolvera-sync-studio-'));
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, '-c', 'core.autocrlf=false', '-c', 'user.name=Smoke', '-c', 'user.email=smoke@example.invalid', ...args], { encoding: 'utf8', windowsHide: true });
const write = (root, file, text) => {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), text);
};

try {
  // Regras puras: só interface/ e os dois instaladores; segredo, link e submódulo param tudo.
  assert.equal(isAllowedPath('interface/server.mjs'), true);
  assert.equal(isAllowedPath('install.ps1'), true);
  assert.equal(isAllowedPath('config/jev/api_key'), false);
  assert.equal(isAllowedPath('interface/node_modules/x/index.js'), false);
  assert.equal(isAllowedPath('extensions/studio-steer.ts'), false);
  for (const file of ['interface/.env', 'interface/.env.local', 'interface/auth.json', 'interface/config/jev/token', 'interface/certs/dev.pem', 'interface/api_key']) {
    assert.equal(looksSecret(file), true, file);
  }
  assert.equal(looksSecret('interface/public/env.js'), false);
  const sha = 'a'.repeat(40);
  const payload = { mode: '100644', type: 'blob', sha, file: 'interface/desktop/install-payload-cli.mjs' };
  assert.deepEqual(parseTree(`100644 blob ${sha}\tinterface/a b.js\0`), [{ mode: '100644', type: 'blob', sha, file: 'interface/a b.js' }]);
  assert.throws(() => selectEntries([payload, { ...payload, file: 'interface/.env' }]), /segredo/);
  assert.throws(() => selectEntries([payload, { ...payload, mode: '120000', file: 'interface/link' }]), /não suportada/);
  assert.throws(() => selectEntries([payload, { ...payload, mode: '160000', type: 'commit', file: 'interface/sub' }]), /não suportada/);
  assert.throws(() => selectEntries([{ ...payload, file: 'interface/server.mjs' }]), /install-payload-cli/);
  assert.deepEqual(selectEntries([payload, { ...payload, file: 'config/jev/api_key' }]).map((entry) => entry.file), [payload.file]);

  assert.deepEqual(failedTests('✔ ok (1ms)\nℹ fail 1\n\n✖ failing tests:\n\ntest at test\\a.mjs:1:1\n✖ a test name (12.5ms)\n  AssertionError\n✖ other (3ms)\n'), ['a test name', 'other']);
  assert.deepEqual(failedTests('ℹ fail 0\n'), []);
  assert.throws(() => parseArgs(['--latest', '--ref', 'x']), /não os dois/);
  assert.throws(() => parseArgs(['--ref']), /precisa de um valor/);
  assert.throws(() => parseArgs(['--bogus']), /desconhecida/);
  assert.equal(parseArgs(['--skip-tests', '--restart']).restart, true);

  const probes = [];
  assert.equal(voiceTestSkip({ platform: 'win32', probe: (command, args) => (probes.push([command, ...args]), true) }), null);
  assert.equal(voiceTestSkip({ platform: 'linux', probe: (command, args) => (probes.push([command, ...args]), false) }), 'NVIDIA');
  assert.deepEqual(probes, [['py', '-3.14', '--version'], ['python3', '--version']]);

  // Ponta a ponta com repositórios git sintéticos: o commit fixado só existe no "remoto", então
  // a extração precisa buscar, e nada fora de interface/ + instaladores pode sair do git.
  const upstream = path.join(temp, 'upstream');
  mkdirSync(upstream);
  git(upstream, 'init', '--quiet', '-b', 'MiguelNevesZane');
  write(upstream, 'interface/server.mjs', 'export const ok = 1;\n');
  write(upstream, 'interface/desktop/install-payload-cli.mjs', '// payload\n');
  write(upstream, 'interface/public/app.js', 'console.log("app");\n');
  write(upstream, 'install.ps1', '# ps1\n');
  write(upstream, 'install.sh', '# sh\n');
  write(upstream, 'config/jev/api_key', 'SECRET-SHOULD-NEVER-LEAVE-GIT\n');
  write(upstream, 'research/notes.md', 'fora\n');
  git(upstream, 'add', '-A');
  git(upstream, 'commit', '--quiet', '-m', 'studio');
  const commit = git(upstream, 'rev-parse', 'HEAD').trim();

  const local = path.join(temp, 'local');
  mkdirSync(local);
  git(local, 'init', '--quiet');
  git(local, 'remote', 'add', 'origin', upstream);
  const source = path.join(temp, 'studio-source.json');
  writeFileSync(source, JSON.stringify({ remote: 'origin', branch: 'MiguelNevesZane', commit }));

  const out = path.join(temp, 'out');
  const log = console.log;
  console.log = () => {};
  try {
    assert.equal(await main(['--repo', local, '--source', source, '--extract-only', out]), 0);
  } finally {
    console.log = log;
  }
  assert.equal(readFileSync(path.join(out, 'interface/server.mjs'), 'utf8'), 'export const ok = 1;\n');
  assert.equal(existsSync(path.join(out, 'interface/public/app.js')), true);
  assert.equal(existsSync(path.join(out, 'install.ps1')), true);
  assert.equal(existsSync(path.join(out, 'install.sh')), true);
  assert.equal(existsSync(path.join(out, 'config')), false, 'config/jev nunca é extraído');
  assert.equal(existsSync(path.join(out, 'research')), false);

  // Patches do NatiamG: aplicados em ordem sobre o commit fixado; fora de interface/, link ou conflito param tudo.
  write(upstream, 'interface/server.mjs', 'export const ok = 2;\n');
  const goodPatch = git(upstream, 'diff');
  git(upstream, 'checkout', '--', 'interface/server.mjs');
  const patchesDir = path.join(local, 'studio-patches');
  mkdirSync(patchesDir);
  writeFileSync(path.join(patchesDir, '0001-ok.patch'), goodPatch);
  const extractTo = async (name, extra = []) => {
    const target = path.join(temp, name);
    console.log = () => {};
    try { await main(['--repo', local, '--source', source, '--extract-only', target, ...extra]); } finally { console.log = log; }
    return target;
  };
  assert.equal(readFileSync(path.join(await extractTo('patched'), 'interface/server.mjs'), 'utf8'), 'export const ok = 2;\n');
  assert.equal(readFileSync(path.join(await extractTo('pristine', ['--no-patches']), 'interface/server.mjs'), 'utf8'), 'export const ok = 1;\n');
  const rejects = async (patchName, text, pattern) => {
    writeFileSync(path.join(patchesDir, patchName), text);
    await assert.rejects(extractTo(`bad-${patchName}`), pattern);
    rmSync(path.join(patchesDir, patchName));
  };
  await rejects('0002-conflict.patch', goodPatch, /não aplica/);
  await rejects('0002-outside.patch', goodPatch.replaceAll('interface/server.mjs', 'config/jev/api_key'), /fora de interface/);
  await rejects('0002-link.patch', 'diff --git a/interface/l b/interface/l\nnew file mode 120000\nindex 0000000..1111111\n--- /dev/null\n+++ b/interface/l\n@@ -0,0 +1 @@\n+../../config\n', /link simbólico/);
  await rejects('0002-plain.patch', '--- a/interface/server.mjs\n+++ b/interface/server.mjs\n', /diff --git/);
  rmSync(patchesDir, { recursive: true });

  // Um segredo dentro de interface/ para antes de escrever qualquer arquivo.
  write(upstream, 'interface/.env', 'TOKEN=x\n');
  git(upstream, 'add', '-A');
  git(upstream, 'commit', '--quiet', '-m', 'leak');
  writeFileSync(source, JSON.stringify({ remote: 'origin', branch: 'MiguelNevesZane', commit: git(upstream, 'rev-parse', 'HEAD').trim() }));
  const blocked = path.join(temp, 'blocked');
  console.log = () => {};
  try {
    await assert.rejects(main(['--repo', local, '--source', source, '--extract-only', blocked]), /segredo/);
  } finally {
    console.log = log;
  }
  assert.equal(existsSync(blocked), false);

  console.log('sync-studio smoke: PASS');
} finally {
  rmSync(temp, { recursive: true, force: true });
}
