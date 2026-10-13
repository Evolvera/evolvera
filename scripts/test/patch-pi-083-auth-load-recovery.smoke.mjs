import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { trySymlinkFile } from '../../extensions/test/lib/test-symlink.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const patcher = path.join(root, 'scripts/patch-pi-083-auth-load-recovery.mjs');
const { ANCHORS, npmInvocation, packageRootFromArgs } = await import(pathToFileURL(patcher));
const installedPackage = packageRootFromArgs([]);
const installedSourcePath = path.join(installedPackage, 'dist/core/auth-storage.js');
const installedSource = fs.readFileSync(installedSourcePath);
const installedSourceHash = createHash('sha256').update(installedSource).digest('hex');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-auth-load-recovery-'));
const fixture = path.join(temp, 'sdk');
const target = path.join(fixture, 'dist/core/auth-storage.js');
const packageJson = path.join(fixture, 'package.json');

function writePackage(source, { name = '@earendil-works/pi-coding-agent', version = '0.83.0' } = {}) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(packageJson, JSON.stringify({ name, version, type: 'module' }) + '\n');
  fs.writeFileSync(target, source);
}
function runPatcher(packageRoot = fixture) {
  return spawnSync(process.execPath, [patcher, '--package-root', packageRoot], {
    cwd: root, encoding: 'utf8', env: { PATH: process.env.PATH ?? '' },
  });
}
function assertRefused(label) {
  const before = fs.readFileSync(target);
  const result = runPatcher();
  assert.notEqual(result.status, 0, `${label}: patch unexpectedly succeeded`);
  assert.deepEqual(fs.readFileSync(target), before, `${label}: target mutated`);
  assert.doesNotMatch(result.stderr, /credential|password|secret|token/i, `${label}: unsafe output`);
}

try {
  // Normalize a previously patched installation back to its reviewed baseline
  // in the fixture only, so regression checks also work after local application.
  const source = ANCHORS.reduce((text, [before, after]) => text.replace(after, before), installedSource.toString('utf8'));
  assert.equal(JSON.parse(fs.readFileSync(path.join(installedPackage, 'package.json'), 'utf8')).name,
    '@earendil-works/pi-coding-agent');
  assert.equal(JSON.parse(fs.readFileSync(path.join(installedPackage, 'package.json'), 'utf8')).version, '0.83.0');
  writePackage(source);
  fs.chmodSync(target, 0o744);
  const originalMode = fs.statSync(target).mode & 0o7777;
  const first = runPatcher();
  assert.equal(first.status, 0, first.stderr);
  const patched = fs.readFileSync(target);
  assert.notDeepEqual(patched, Buffer.from(source));
  assert.equal(fs.statSync(target).mode & 0o7777, originalMode, 'mode changed');
  assert.deepEqual(fs.readFileSync(installedSourcePath), installedSource, 'installed source was mutated');
  assert.equal(createHash('sha256').update(fs.readFileSync(installedSourcePath)).digest('hex'), installedSourceHash);
  const second = runPatcher();
  assert.equal(second.status, 0, second.stderr);
  assert.deepEqual(fs.readFileSync(target), patched, 'idempotent invocation changed file');

  // Exercise the actual installed AuthStorage implementation, not a stand-in.
  // Imports alone are removed so provider resolution and filesystem storage cannot run.
  const patchedExecutable = `${patched.toString('utf8').split(/\r?\n/).filter((line) => !line.startsWith('import ')).join('\n')}`;
  const inject = `const resolveConfigValue = (value) => value;\n`;
  const actualModule = path.join(temp, 'actual-auth-storage.mjs');
  fs.writeFileSync(actualModule, inject + patchedExecutable);
  const { AuthStorage } = await import(`${pathToFileURL(actualModule).href}?test=${Date.now()}`);

  const eLocked = () => Object.assign(new Error('synthetic lock'), { code: 'ELOCKED' });
  class SyntheticBackend {
    content = JSON.stringify({ restored: { type: 'api_key', key: 'synthetic-key' } });
    syncFailures = 1;
    asyncFailures = 0;
    asyncReads = 0;
    writes = 0;
    withLock(fn) {
      if (this.syncFailures-- > 0) throw eLocked();
      const { result } = fn(this.content);
      return result;
    }
    async withLockAsync(fn) {
      this.asyncReads += 1;
      if (this.asyncFailures-- > 0) throw eLocked();
      const { result, next } = await fn(this.content);
      if (next !== undefined) { this.content = next; this.writes += 1; }
      return result;
    }
  }

  const backend = new SyntheticBackend();
  const storage = AuthStorage.fromStorage(backend);
  const [credential, metadata] = await Promise.all([storage.read('restored'), storage.list()]);
  assert.equal(credential.key, 'synthetic-key');
  assert.deepEqual(metadata, [{ providerId: 'restored', type: 'api_key' }]);
  assert.equal(backend.asyncReads, 1, 'concurrent read/list did not coalesce retry');
  assert.equal(backend.writes, 0, 'read/list wrote credentials');
  assert.deepEqual(await storage.read('missing'), undefined, 'availability read unexpectedly supplied auth');
  assert.equal((await storage.list()).length, 1, 'availability listing omitted restored auth');
  assert.equal(backend.asyncReads, 1, 'successful snapshot caused an unnecessary retry');

  const failingBackend = new SyntheticBackend();
  failingBackend.asyncFailures = 3;
  const failingStorage = AuthStorage.fromStorage(failingBackend);
  await Promise.all([
    assert.rejects(failingStorage.read('restored'), (error) => error.code === 'ELOCKED'),
    assert.rejects(failingStorage.list(), (error) => error.code === 'ELOCKED'),
  ]);
  assert.equal(failingBackend.asyncReads, 1, 'concurrent failed retry was not coalesced');
  assert.equal(failingBackend.writes, 0);
  await assert.rejects(failingStorage.read('restored'), (error) => error.code === 'ELOCKED');
  assert.equal(failingBackend.asyncReads, 2, 'failed pending promise was not cleared for retry');
  failingBackend.asyncFailures = 0;
  assert.equal((await failingStorage.read('restored')).key, 'synthetic-key', 'later unlock did not recover');
  assert.equal(failingBackend.asyncReads, 3);

  const emptyBackend = new SyntheticBackend();
  emptyBackend.syncFailures = 0;
  emptyBackend.content = '{}';
  const emptyStorage = AuthStorage.fromStorage(emptyBackend);
  assert.deepEqual(await emptyStorage.list(), []);
  assert.equal(emptyBackend.asyncReads, 0, 'valid empty startup was treated as uninitialized');

  // A last-good snapshot survives an ordinary failed synchronous reload.
  backend.content = JSON.stringify({ changed: { type: 'oauth' } });
  backend.syncFailures = 0;
  backend.withLock = () => { throw eLocked(); };
  storage.reload();
  assert.equal((await storage.read('restored')).key, 'synthetic-key');
  assert.equal((await storage.list()).length, 1);

  // Mutation snapshots keep normal modify/delete and key-resolution behavior.
  const mutable = AuthStorage.inMemory({ retained: { type: 'oauth' } });
  await mutable.modify('api', async () => ({ type: 'api_key', key: 'literal' }));
  assert.equal((await mutable.read('api')).key, 'literal');
  await mutable.delete('retained');
  assert.deepEqual(await mutable.list(), [{ providerId: 'api', type: 'api_key' }]);

  // Publish the initialization snapshot while still under the read lock.
  // A modification immediately after unlock must not be overwritten by a late
  // initialization continuation holding an older snapshot.
  const racingBackend = new SyntheticBackend();
  const originalAsync = racingBackend.withLockAsync.bind(racingBackend);
  let racingStorage;
  let interleaved = false;
  racingBackend.withLockAsync = async (fn) => {
    const result = await originalAsync(fn);
    if (!interleaved) {
      interleaved = true;
      await racingStorage.modify('restored', async () => ({ type: 'api_key', key: 'newer-synthetic-key' }));
    }
    return result;
  };
  racingStorage = AuthStorage.fromStorage(racingBackend);
  assert.equal((await racingStorage.read('restored')).key, 'newer-synthetic-key', 'initialization overwrote a newer modification');

  const wrongVersion = path.join(temp, 'wrong-version');
  const wrongTarget = path.join(wrongVersion, 'dist/core/auth-storage.js');
  fs.mkdirSync(path.dirname(wrongTarget), { recursive: true });
  fs.writeFileSync(path.join(wrongVersion, 'package.json'), JSON.stringify({
    name: '@earendil-works/pi-coding-agent', version: '0.83.1',
  }));
  fs.writeFileSync(wrongTarget, source);
  assert.notEqual(runPatcher(wrongVersion).status, 0, 'wrong package version accepted');
  assert.deepEqual(fs.readFileSync(wrongTarget), Buffer.from(source));

  writePackage(source, { name: '@mariozechner/pi-coding-agent' });
  assertRefused('wrong package identity');
  writePackage(source.replace('this.reload();', 'this.reload(); // drift'));
  assertRefused('anchor drift');
  writePackage(source);
  const linked = path.join(temp, 'linked.js');
  fs.linkSync(target, linked);
  assertRefused('hard link');
  fs.unlinkSync(linked);
  const symlinkTarget = path.join(temp, 'symlink-target.js');
  fs.renameSync(target, symlinkTarget);
  if (trySymlinkFile(symlinkTarget, target, 'unsafe auth source target')) {
    assertRefused('symlink');
    fs.unlinkSync(target);
  }
  fs.renameSync(symlinkTarget, target);

  assert.deepEqual(npmInvocation('win32'), { command: 'npm.cmd', shell: true });
  assert.deepEqual(npmInvocation('darwin'), { command: 'npm', shell: false });
  const fakeRoot = path.join(temp, 'npm-global');
  assert.equal(packageRootFromArgs([], () => fakeRoot), path.join(fakeRoot, '@earendil-works', 'pi-coding-agent'));
  console.log('patch-pi-083-auth-load-recovery smoke: PASS (DISPOSABLE_VERIFIED)');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
