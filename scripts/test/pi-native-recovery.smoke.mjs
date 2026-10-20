import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolvePiSdkRoot } from '../../extensions/test/lib/pi-sdk.mjs';

// DISPOSABLE_VERIFIED: synthetic in-memory credentials; each scenario creates its
// own mkdtemp, in-memory session/settings, empty resource loader and faux provider.
// The SDK is read-only. No user settings, credentials, sessions or network access.
const sdkRoot = resolvePiSdkRoot(import.meta.url);
assert.equal(JSON.parse(fs.readFileSync(path.join(sdkRoot, 'package.json'), 'utf8')).version, '1.3.0');
const { AuthStorage } = await import(pathToFileURL(path.join(sdkRoot, 'dist/core/auth-storage.js')));
let content = JSON.stringify({ synthetic: { type: 'api_key', key: 'fixture-only' } });
let rejectRead = false;
const storage = AuthStorage.fromStorage({
  withLock() { throw new Error('synthetic initial lock contention'); },
  async withLockAsync(fn) {
    if (rejectRead) throw new Error('synthetic transient read error');
    return (await fn(content)).result;
  },
});
assert.deepEqual(await storage.read('synthetic'), { type: 'api_key', key: 'fixture-only' });
assert.equal((await storage.list()).length, 1);
content = JSON.stringify({ synthetic: { type: 'api_key', key: 'updated-fixture' } });
assert.equal((await storage.read('synthetic')).key, 'updated-fixture');
rejectRead = true;
assert.equal((await storage.read('synthetic')).key, 'updated-fixture', 'retain the last valid snapshot on transient failure');
const abort = new AbortController();
abort.abort();
await assert.rejects(storage.read('synthetic', { signal: abort.signal }), { name: 'AbortError' });

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-native-recovery-'));
try {
  const scenario = path.join(import.meta.dirname, 'fixtures/context-wall-scenario.mjs');
  const run = (mode) => {
    const result = spawnSync(process.execPath, [scenario, sdkRoot, mode], {
      cwd: temp,
      env: { PATH: process.env.PATH ?? '', HOME: temp, USERPROFILE: temp, PI_CODING_AGENT_DIR: temp, PI_OFFLINE: '1', TMPDIR: temp, TMP: temp, TEMP: temp },
      encoding: 'utf8', timeout: 15000,
    });
    assert.equal(result.status, 0, `${mode}: ${result.stderr}`);
    return JSON.parse(result.stdout.trim().split('\n').at(-1));
  };
  const recovered = run('wall');
  assert.deepEqual(recovered.events, [{ reason: 'overflow', willRetry: true, failed: false }]);
  assert.equal(recovered.lastStop, 'stop');
  assert.equal(recovered.lastText, 'RESUMED-DONE');
  assert.equal(recovered.pending, 0);
  const guarded = run('loop');
  assert.deepEqual(guarded.events, [{ reason: 'overflow', willRetry: true, failed: false }, { reason: 'overflow', willRetry: false, failed: true }]);
  assert.equal(guarded.calls, 5, 'exactly one bounded compact-and-retry attempt');
  const outputLimit = run('normal-length');
  assert.deepEqual(outputLimit.events, []);
  assert.equal(outputLimit.lastStop, 'length', 'a genuine output limit must not be retried');
  const completed = run('stop-threshold');
  assert.deepEqual(completed.events, [{ reason: 'threshold', willRetry: false, failed: false }]);
  assert.equal(completed.lastText, 'FULL-ANSWER');
  assert.equal(completed.pending, 0);
  console.log('pi-native-recovery smoke: PASS (DISPOSABLE_VERIFIED; native auth recovery and context retry)');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
