import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '../..');
const patcher = path.join(root, 'scripts/patch-pi-threshold-cancel.mjs');
const sdkRoot = process.env.PI_SDK_ROOT;
assert.ok(sdkRoot && path.isAbsolute(sdkRoot), 'PI_SDK_ROOT must name the pristine 1.3.0 SDK');
const disposableRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'evolvera-pi-threshold-'));
const fixtureRoot = path.join(disposableRoot, 'package');
const target = path.join(fixtureRoot, 'dist/core/agent-session.js');
const source = fs.readFileSync(path.join(sdkRoot, 'dist/core/agent-session.js'));
const packageJson = path.join(sdkRoot, 'package.json');
const metadata = JSON.parse(fs.readFileSync(packageJson, 'utf8'));
assert.equal(metadata.name, '@earendil-works/pi-coding-agent');
assert.equal(metadata.version, '1.3.0');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.copyFileSync(path.join(sdkRoot, 'package.json'), path.join(fixtureRoot, 'package.json'));
fs.copyFileSync(path.join(sdkRoot, 'dist/core/agent-session.js'), target);

const patcherApi = await import(pathToFileURL(patcher));
const {
  UNPATCHED_ANCHOR, PATCHED_ANCHOR, UNPATCHED_SHA256, PATCHED_SHA256,
  PACKAGE_VERSION, npmInvocation, npmGlobalNodeModulesRoot, packageRootFromArgs,
} = patcherApi;
function runPatcher() {
  return spawnSync(process.execPath, [patcher, '--package-root', fixtureRoot], {
    cwd: root, encoding: 'utf8', env: { PATH: process.env.PATH ?? '' },
  });
}
function expressionFromAnchor(anchor) {
  const start = anchor.indexOf('            return ');
  const end = anchor.indexOf(';', start);
  assert.ok(start >= 0 && end > start);
  return anchor.slice(start + '            return '.length, end);
}
function evaluateCatch({ cancelledByExtension, reason, aborted, queued }) {
  const expression = expressionFromAnchor(PATCHED_ANCHOR);
  const decision = new Function('cancelledByExtension', 'reason', 'abortController', `return ${expression};`);
  return decision.call(
    { agent: { hasQueuedMessages: () => queued } },
    cancelledByExtension, reason, aborted ? { signal: { aborted: true } } : { signal: { aborted: false } },
  );
}

try {
  assert.equal(PACKAGE_VERSION, '1.3.0');
  assert.equal(createHash('sha256').update(UNPATCHED_ANCHOR).digest('hex'), UNPATCHED_SHA256);
  assert.equal(createHash('sha256').update(PATCHED_ANCHOR).digest('hex'), PATCHED_SHA256);
  assert.equal(packageRootFromArgs(['--package-root', fixtureRoot]), fixtureRoot);
  const globalRoot = path.join(disposableRoot, 'global-node-modules');
  assert.equal(packageRootFromArgs([], () => globalRoot), path.join(globalRoot, '@earendil-works', 'pi-coding-agent'));
  assert.deepEqual(npmInvocation('win32'), { command: 'npm.cmd', shell: true });
  assert.deepEqual(npmInvocation('linux'), { command: 'npm', shell: false });
  assert.ok(path.isAbsolute(npmGlobalNodeModulesRoot()));

  const first = runPatcher();
  assert.equal(first.status, 0, first.stderr);
  const patched = fs.readFileSync(target);
  assert.equal(patched.toString().split(UNPATCHED_ANCHOR).length, 1);
  assert.equal(patched.toString().split(PATCHED_ANCHOR).length, 2);
  assert.equal(patched.toString().replace(PATCHED_ANCHOR, UNPATCHED_ANCHOR), source.toString(), 'bytes outside anchor changed');
  const second = runPatcher();
  assert.equal(second.status, 0, second.stderr);
  assert.deepEqual(fs.readFileSync(target), patched, 'second patch changed bytes');

  assert.equal(evaluateCatch({ cancelledByExtension: true, reason: 'threshold', aborted: false, queued: true }), true);
  assert.equal(evaluateCatch({ cancelledByExtension: true, reason: 'threshold', aborted: false, queued: false }), false);
  assert.equal(evaluateCatch({ cancelledByExtension: true, reason: 'overflow', aborted: false, queued: true }), false);
  assert.equal(evaluateCatch({ cancelledByExtension: false, reason: 'threshold', aborted: false, queued: true }), false);
  assert.equal(evaluateCatch({ cancelledByExtension: true, reason: 'threshold', aborted: true, queued: true }), false);
  assert.equal(new Function('agent', 'return agent.hasQueuedMessages();')({ hasQueuedMessages: () => true }), true, 'native success queue continuation changed');
  assert.match(PATCHED_ANCHOR, /_emitSessionCompactFailed/);
  assert.match(PATCHED_ANCHOR, /finally \{/);

  const unknownRoot = path.join(disposableRoot, 'unknown');
  fs.mkdirSync(path.dirname(path.join(unknownRoot, 'dist/core/agent-session.js')), { recursive: true });
  fs.copyFileSync(path.join(fixtureRoot, 'package.json'), path.join(unknownRoot, 'package.json'));
  const unknownTarget = path.join(unknownRoot, 'dist/core/agent-session.js');
  fs.writeFileSync(unknownTarget, 'unknown source');
  const beforeUnknown = fs.readFileSync(unknownTarget);
  const unknown = spawnSync(process.execPath, [patcher, '--package-root', unknownRoot], { encoding: 'utf8' });
  assert.notEqual(unknown.status, 0, 'unknown source unexpectedly patched');
  assert.deepEqual(fs.readFileSync(unknownTarget), beforeUnknown, 'unknown source changed');
  assert.match(unknown.stderr, /anchor cardinality mismatch/);

  console.log('patch-pi-threshold-cancel smoke: PASS (DISPOSABLE_VERIFIED)');
} finally {
  fs.rmSync(disposableRoot, { recursive: true, force: true });
}
