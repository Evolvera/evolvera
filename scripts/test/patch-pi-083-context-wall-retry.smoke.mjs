import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '../..');
const patcher = path.join(root, 'scripts/patch-pi-083-context-wall-retry.mjs');
const scenario = path.join(root, 'scripts/test/fixtures/context-wall-scenario.mjs');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'evolvera-pi-083-context-wall-'));

const {
  PACKAGE_NAME,
  PACKAGE_VERSION,
  TARGET_RELATIVE_PATH,
  ANCHORS,
  UNPATCHED_SHA256,
  PATCHED_SHA256,
  packageRootFromArgs,
} = await import(pathToFileURL(patcher));

function run(args) {
  return spawnSync(process.execPath, args, {
    cwd: root,
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '', PI_OFFLINE: '1' },
  });
}

function patchRoot(packageRoot) {
  return run([patcher, '--package-root', packageRoot]);
}

// ---- Mechanics on a synthetic fixture ------------------------------------
const fixtureRoot = path.join(temp, 'fixture');
const fixtureTarget = path.join(fixtureRoot, TARGET_RELATIVE_PATH);
const fixturePackage = path.join(fixtureRoot, 'package.json');
const fixtureSource = (kind) => `// head\n${ANCHORS.map((anchor, i) => `// region ${i}\n${anchor[kind]}`).join('')}// tail\n`;

function writeFixture(source, name = PACKAGE_NAME, version = PACKAGE_VERSION) {
  fs.mkdirSync(path.dirname(fixtureTarget), { recursive: true });
  fs.writeFileSync(fixturePackage, `${JSON.stringify({ name, version })}\n`);
  fs.writeFileSync(fixtureTarget, source);
}

function assertRefused(label) {
  const before = [fs.readFileSync(fixturePackage), fs.readFileSync(fixtureTarget)];
  const result = patchRoot(fixtureRoot);
  assert.notEqual(result.status, 0, `${label}: patcher unexpectedly succeeded`);
  assert.deepEqual(fs.readFileSync(fixturePackage), before[0], `${label}: package changed`);
  assert.deepEqual(fs.readFileSync(fixtureTarget), before[1], `${label}: target changed`);
}

// ---- Behavior on disposable copies of the installed package ---------------
function installedPackageRoot() {
  const npm = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['root', '-g'], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  assert.equal(npm.status, 0, 'npm root -g failed');
  return path.join(npm.stdout.trim(), '@earendil-works', 'pi-coding-agent');
}

function packageCopy(source, name) {
  const copy = path.join(temp, name);
  fs.mkdirSync(copy);
  fs.copyFileSync(path.join(source, 'package.json'), path.join(copy, 'package.json'));
  fs.cpSync(path.join(source, 'dist'), path.join(copy, 'dist'), { recursive: true });
  fs.symlinkSync(path.join(source, 'node_modules'), path.join(copy, 'node_modules'), 'junction');
  return copy;
}

function runScenario(packageRoot, mode) {
  const result = run([scenario, packageRoot, mode]);
  assert.equal(result.status, 0, `${mode}: ${result.stderr}`);
  return JSON.parse(result.stdout.trim().split('\n').pop());
}

try {
  assert.equal(TARGET_RELATIVE_PATH, 'dist/core/agent-session.js');
  const digest = (kind) => createHash('sha256').update(ANCHORS.map((anchor) => anchor[kind]).join('\u0000')).digest('hex');
  assert.equal(digest('unpatched'), UNPATCHED_SHA256);
  assert.equal(digest('patched'), PATCHED_SHA256);
  assert.equal(packageRootFromArgs(['--package-root', temp]), temp);

  writeFixture(fixtureSource('unpatched'));
  fs.chmodSync(fixtureTarget, 0o744);
  const first = patchRoot(fixtureRoot);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(fs.readFileSync(fixtureTarget, 'utf8'), fixtureSource('patched'), 'bytes outside anchors changed');
  assert.equal(fs.statSync(fixtureTarget).mode & 0o7777, 0o744, 'file mode changed');
  const second = patchRoot(fixtureRoot);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(fs.readFileSync(fixtureTarget, 'utf8'), fixtureSource('patched'), 'second run changed bytes');

  writeFixture(fixtureSource('unpatched'), 'wrong/package');
  assertRefused('wrong package name');
  writeFixture(fixtureSource('unpatched'), PACKAGE_NAME, '0.83.1');
  assertRefused('wrong package version');
  writeFixture(fixtureSource('unpatched').replace(ANCHORS[1].unpatched, ''));
  assertRefused('missing anchor');
  writeFixture(`${fixtureSource('unpatched')}${ANCHORS[2].unpatched}`);
  assertRefused('duplicated anchor');
  writeFixture(fixtureSource('unpatched').replace(ANCHORS[0].unpatched, ANCHORS[0].patched));
  assertRefused('mixed patched and unpatched anchors');

  const installed = installedPackageRoot();
  const control = packageCopy(installed, 'control');
  const patched = packageCopy(installed, 'patched');
  // The installed package may already carry this patch; normalize the control copy.
  const controlTarget = path.join(control, TARGET_RELATIVE_PATH);
  let controlSource = fs.readFileSync(controlTarget, 'utf8');
  for (const anchor of ANCHORS) controlSource = controlSource.replace(anchor.patched, () => anchor.unpatched);
  fs.writeFileSync(controlTarget, controlSource);
  const applied = patchRoot(patched);
  assert.equal(applied.status, 0, applied.stderr);

  const stalled = runScenario(control, 'wall');
  assert.deepEqual(stalled.events, [{ reason: 'threshold', willRetry: false, failed: false }], 'control did not reproduce the stall');
  assert.equal(stalled.lastStop, 'length', 'control did not end on the truncated reply');
  assert.equal(stalled.pending, 1, 'control unexpectedly resumed');

  const resumed = runScenario(patched, 'wall');
  assert.deepEqual(resumed.events, [{ reason: 'overflow', willRetry: true, failed: false }]);
  assert.equal(resumed.lastStop, 'stop');
  assert.equal(resumed.lastText, 'RESUMED-DONE', 'patched session did not resume after compaction');
  assert.equal(resumed.pending, 0);

  const guarded = runScenario(patched, 'loop');
  assert.deepEqual(guarded.events, [
    { reason: 'overflow', willRetry: true, failed: false },
    { reason: 'overflow', willRetry: false, failed: true },
  ], 'second wall hit must stop after one compact-and-retry attempt');
  assert.equal(guarded.calls, 4, 'loop guard issued extra requests');

  const ordinary = runScenario(patched, 'normal-length');
  assert.deepEqual(ordinary.events, [], 'length below threshold must not compact');
  assert.equal(ordinary.lastStop, 'length');

  const thresholdStop = runScenario(patched, 'stop-threshold');
  assert.deepEqual(thresholdStop.events, [{ reason: 'threshold', willRetry: false, failed: false }], 'completed answers keep plain threshold compaction');
  assert.equal(thresholdStop.lastText, 'FULL-ANSWER');

  const shell = fs.readFileSync(path.join(root, 'install.sh'), 'utf8');
  const powershell = fs.readFileSync(path.join(root, 'install.ps1'), 'utf8');
  const shellPatch = shell.indexOf('node "$SCRIPT_DIR/scripts/patch-pi-083-context-wall-retry.mjs"');
  const powershellPatch = powershell.indexOf('& node (Join-Path $SCRIPT_DIR "scripts\\patch-pi-083-context-wall-retry.mjs")');
  assert.ok(shellPatch > shell.indexOf('npm install -g --ignore-scripts'), 'shell patch is not after npm install');
  assert.ok(powershellPatch > powershell.indexOf('npm install -g '), 'PowerShell patch is not after npm install');
  assert.match(powershell.slice(powershellPatch), /^[^\n]*\n\s*if \(\$LASTEXITCODE -ne 0\)/);
  assert.ok(shell.indexOf('cp "$SCRIPT_DIR/config/settings.json"') > shellPatch, 'shell activation precedes patch');

  console.log('patch-pi-083-context-wall-retry smoke: PASS (DISPOSABLE_VERIFIED)');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
