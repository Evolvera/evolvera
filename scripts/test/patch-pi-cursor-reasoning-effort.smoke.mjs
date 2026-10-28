import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { trySymlinkFile } from '../../extensions/test/lib/test-symlink.mjs';

// STATEFUL RESOURCE PROOF: DISPOSABLE_VERIFIED. All writes are confined to this
// unique fixture, passed explicitly to the patcher; cleanup removes only its root.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const patcherPath = path.join(root, 'scripts/patch-pi-cursor-reasoning-effort.mjs');
const patcher = await import(pathToFileURL(patcherPath));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-cursor-reasoning-effort-'));
const packageRoot = path.join(temp, 'package');
const target = path.join(packageRoot, patcher.TARGET);
const pristine = `prefix π\n${patcher.REPLACEMENTS[0][0]}\n${patcher.REPLACEMENTS[1][0]}\nsuffix\n`;

function fixture({ name = patcher.PACKAGE_NAME, version = patcher.PACKAGE_VERSION, source = pristine, link = null } = {}) {
  fs.rmSync(packageRoot, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(path.join(packageRoot, 'package.json'), `${JSON.stringify({ name, version })}\n`);
  fs.writeFileSync(target, source, { mode: 0o751 });
  if (link === 'symlink') {
    const sidecar = path.join(packageRoot, 'sidecar.js');
    fs.renameSync(target, sidecar);
    if (!trySymlinkFile(sidecar, target, 'unsafe Cursor target type')) return false;
  } else if (link === 'hardlink') {
    fs.linkSync(target, path.join(packageRoot, 'hardlink.js'));
  }
  return true;
}
function run() {
  return spawnSync(process.execPath, [patcherPath, '--package-root', packageRoot], {
    cwd: root, encoding: 'utf8', env: { PATH: process.env.PATH ?? '' },
  });
}
function snapshot() {
  return fs.readFileSync(target);
}
function refusedWithoutWrite(label, options) {
  if (!fixture(options)) return;
  const before = snapshot();
  const result = run();
  assert.notEqual(result.status, 0, `${label}: expected refusal`);
  assert.deepEqual(snapshot(), before, `${label}: target changed on refusal`);
}

try {
  assert.equal(patcher.packageRootFromArgs(['--package-root', packageRoot]), packageRoot);
  assert.equal(patcher.packageRootFromArgs([], { PI_CODING_AGENT_DIR: '/synthetic/pi' }, '/ignored'),
    path.join('/synthetic/pi', 'npm', 'node_modules', '@rahularya01', 'pi-cursor'));
  fixture();
  const before = snapshot();
  const mode = fs.statSync(target).mode & 0o7777;
  const first = run();
  assert.equal(first.status, 0, first.stderr);
  const expected = Buffer.from(patcher.REPLACEMENTS.reduce((text, [oldText, newText]) => text.replace(oldText, newText), pristine));
  assert.deepEqual(snapshot(), expected, 'patch changed unrelated bytes');
  assert.equal(fs.statSync(target).mode & 0o7777, mode, 'patch changed mode');
  const patched = snapshot();
  const second = run();
  assert.equal(second.status, 0, second.stderr);
  assert.deepEqual(snapshot(), patched, 'patch is not idempotent');
  assert.notDeepEqual(before, patched);

  const parsed = vm.runInNewContext(`${expected.toString('utf8').split('\n')[1]}\n${expected.toString('utf8').split('\n')[2]};\n({ _u, ku })`);
  const ids = (values) => ({ parameters: values.map((id) => ({ id })) });
  assert.equal(parsed._u(ids(['reasoning', 'effort', 'reasoning_effort'])), 'reasoning', 'reasoning precedence changed');
  assert.equal(parsed._u(ids(['effort', 'reasoning_effort'])), 'effort', 'effort precedence changed');
  assert.equal(parsed._u(ids(['reasoning_effort'])), 'reasoning_effort');
  for (const model of ['grok-4.7-256k', 'grok-4.7-500k', 'cursor-grok-4.7-256k']) {
    assert.equal(parsed.ku.test(model), true, `${model} should match Grok 4.7 base family`);
  }
  assert.equal(parsed.ku.test('grok-4.7'), true, 'base model should still match');
  // The provider strips effort/fast suffixes before matching the group base;
  // fast is a separate routing flag, not part of this regex's input.
  assert.equal(parsed.ku.test('grok-4.7-fast'), false, 'raw wire ID is not a group base');
  for (const context of ['256k', '500k']) {
    for (const effort of ['low', 'medium', 'high', 'xhigh']) {
      const base = `grok-4.7-${context}-${effort}-fast`
        .replace(/-fast$/, '').replace(/-(low|medium|high|xhigh)$/, '');
      assert.equal(parsed.ku.test(base), true, 'fast variant group base must match');
    }
  }
  assert.equal(parsed.ku.test('grok-4.6-256k'), false, 'unrelated Grok family matched');
  assert.equal(parsed.ku.test('grok-4.7-256k-max'), true, 'context-qualified max model did not match');

  refusedWithoutWrite('wrong package name', { name: 'other/package' });
  refusedWithoutWrite('wrong package version', { version: '1.4.40' });
  refusedWithoutWrite('missing second anchor', { source: pristine.replace(patcher.REPLACEMENTS[1][0], 'unknown second anchor') });
  refusedWithoutWrite('duplicate second anchor', { source: `${pristine}\n${patcher.REPLACEMENTS[1][0]}` });
  refusedWithoutWrite('unknown first anchor', { source: pristine.replace(patcher.REPLACEMENTS[0][0], 'unknown first anchor') });
  refusedWithoutWrite('symlink target', { link: 'symlink' });
  try {
    refusedWithoutWrite('multiply linked target', { link: 'hardlink' });
  } catch (error) {
    if (error.code !== 'EPERM' && error.code !== 'EACCES' && error.code !== 'ENOTSUP') throw error;
    console.log('hardlink check skipped: filesystem does not support hardlinks');
  }
  console.log('patch-pi-cursor-reasoning-effort smoke: PASS (DISPOSABLE_VERIFIED)');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
