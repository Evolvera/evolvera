import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  isAllowedPath, looksSecret, main, parseArgs, parseTree, selectEntries, voiceTestSkip,
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
