import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { failedTests, isAllowedPath, listStudioFiles, looksSecret, main, parseArgs, voiceTestSkip } from '../studio/sync-studio.mjs';

// STATEFUL RESOURCE PROOF: DISPOSABLE_VERIFIED. A synthetic studio/ folder inside its own mkdtemp, removed in finally;
// only --extract-only runs, so nothing is installed, tested or started.
const temp = mkdtempSync(path.join(os.tmpdir(), 'evolvera-sync-studio-'));
const write = (root, file, text) => {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), text);
};
const quiet = async (task) => {
  const log = console.log;
  console.log = () => {};
  try { return await task(); } finally { console.log = log; }
};

try {
  // Regras puras: só interface/ e os dois instaladores; segredo e link param tudo.
  assert.equal(isAllowedPath('interface/server.mjs'), true);
  assert.equal(isAllowedPath('install.ps1'), true);
  assert.equal(isAllowedPath('README.md'), false);
  assert.equal(isAllowedPath('interface/node_modules/x/index.js'), false);
  for (const file of ['interface/.env', 'interface/.env.local', 'interface/auth.json', 'interface/config/jev/token', 'interface/certs/dev.pem', 'interface/api_key']) {
    assert.equal(looksSecret(file), true, file);
  }
  assert.equal(looksSecret('interface/public/env.js'), false);

  assert.deepEqual(failedTests('✔ ok (1ms)\nℹ fail 1\n\n✖ failing tests:\n\ntest at test\\a.mjs:1:1\n✖ a test name (12.5ms)\n  AssertionError\n✖ other (3ms)\n'), ['a test name', 'other']);
  assert.deepEqual(failedTests('ℹ fail 0\n'), []);
  assert.throws(() => parseArgs(['--pi-dir']), /precisa de um valor/);
  assert.throws(() => parseArgs(['--latest']), /desconhecida/, 'the pinned-commit options are gone');
  assert.equal(parseArgs(['--skip-tests', '--restart']).restart, true);

  const probes = [];
  assert.equal(voiceTestSkip({ platform: 'win32', probe: (command, args) => (probes.push([command, ...args]), true) }), null);
  assert.equal(voiceTestSkip({ platform: 'linux', probe: (command, args) => (probes.push([command, ...args]), false) }), 'NVIDIA');
  assert.deepEqual(probes, [['py', '-3.14', '--version'], ['python3', '--version']]);

  // Ponta a ponta com um studio/ sintético: só interface/ e os instaladores saem; docs e node_modules ficam.
  const studio = path.join(temp, 'studio');
  write(studio, 'interface/server.mjs', 'export const ok = 1;\n');
  write(studio, 'interface/desktop/install-payload-cli.mjs', '// payload\n');
  write(studio, 'interface/public/app.js', 'console.log("app");\n');
  write(studio, 'interface/node_modules/dep/index.js', 'module.exports = 1;\n');
  write(studio, 'install.ps1', '# ps1\n');
  write(studio, 'install.sh', '# sh\n');
  write(studio, 'README.md', '# doc\n');
  write(studio, 'HISTORICO.md', '# history\n');
  assert.deepEqual(listStudioFiles(studio), ['install.ps1', 'install.sh', 'interface/desktop/install-payload-cli.mjs', 'interface/public/app.js', 'interface/server.mjs']);

  const out = path.join(temp, 'out');
  assert.equal(await quiet(() => main(['--source-dir', studio, '--extract-only', out])), 0);
  assert.equal(readFileSync(path.join(out, 'interface/server.mjs'), 'utf8'), 'export const ok = 1;\n');
  assert.equal(existsSync(path.join(out, 'install.sh')), true);
  assert.equal(existsSync(path.join(out, 'README.md')), false, 'docs stay in the repository');
  assert.equal(existsSync(path.join(out, 'interface/node_modules')), false);

  // Sem o instalador do payload não é um Studio; um segredo para antes de copiar qualquer arquivo.
  const bare = path.join(temp, 'bare');
  write(bare, 'interface/server.mjs', '1\n');
  assert.throws(() => listStudioFiles(bare), /install-payload-cli/);
  write(studio, 'interface/.env', 'TOKEN=x\n');
  const blocked = path.join(temp, 'blocked');
  await assert.rejects(quiet(() => main(['--source-dir', studio, '--extract-only', blocked])), /segredo/);
  assert.equal(existsSync(blocked), false);
  rmSync(path.join(studio, 'interface/.env'));

  // A link inside the Studio stops everything too (skipped where the OS refuses to create one without privilege).
  let linked = false;
  try { symlinkSync(path.join(temp, 'out'), path.join(studio, 'interface', 'link'), 'junction'); linked = true; } catch { /* no privilege */ }
  if (linked) assert.throws(() => listStudioFiles(studio), /Link simbólico/);

  console.log('sync-studio smoke: PASS');
} finally {
  rmSync(temp, { recursive: true, force: true });
}
