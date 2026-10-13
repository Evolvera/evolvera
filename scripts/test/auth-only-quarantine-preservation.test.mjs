import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { transformMainSource } from '../users/sdk-cli-source.mjs';

// Public, pinned SDK source only; no SDK import, startup, cleanup, or filesystem writes.
const sdkRoot = process.env.SDK_120_ROOT;
if (!sdkRoot || !path.isAbsolute(sdkRoot)) throw new Error('SDK_120_ROOT must explicitly identify public SDK 1.2 source');
const source = fs.readFileSync(path.join(sdkRoot, 'dist/main.js'), 'utf8');

test('SDK 1.2 managed bridge never invokes installed quarantine cleanup', () => {
  const transformed = transformMainSource(source);
  const cleanupLine = '        if (!accountRuntimeFactory) cleanupWindowsSelfUpdateQuarantine(getPackageDir());';
  assert.equal(transformed.split(cleanupLine).length - 1, 1);
  assert.equal(transformed.includes('\n        cleanupWindowsSelfUpdateQuarantine(getPackageDir());'), false);
  assert.ok(transformed.indexOf('const accountRuntimeFactory = options?.accountRuntimeFactory;') < transformed.indexOf(cleanupLine));
  const conditional = new Function('accountRuntimeFactory', 'cleanupWindowsSelfUpdateQuarantine', 'getPackageDir', cleanupLine);
  let calls = 0;
  const cleanup = () => { calls++; };
  const packageDir = () => 'synthetic-public-sdk-path';
  conditional(() => {}, cleanup, packageDir);
  assert.equal(calls, 0, 'managed invocation retains the installed quarantine');
  conditional(undefined, cleanup, packageDir);
  assert.equal(calls, 1, 'unmanaged transformed source retains native behavior');
  assert.equal(fs.readFileSync(path.join(sdkRoot, 'dist/main.js'), 'utf8'), source, 'installed SDK bytes remain unchanged');
});
