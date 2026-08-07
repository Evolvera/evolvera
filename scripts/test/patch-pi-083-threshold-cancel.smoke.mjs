import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '../..');
const patcher = path.join(root, 'scripts/patch-pi-083-threshold-cancel.mjs');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'evolvera-pi-083-threshold-'));
const target = path.join(temp, 'dist/core/agent-session.js');
const packageJson = path.join(temp, 'package.json');

const {
  PACKAGE_NAME,
  PACKAGE_VERSION,
  TARGET_RELATIVE_PATH,
  UNPATCHED_ANCHOR,
  PATCHED_ANCHOR,
  UNPATCHED_SHA256,
  PATCHED_SHA256,
  npmInvocation,
  npmGlobalNodeModulesRoot,
  packageRootFromArgs,
} = await import(pathToFileURL(patcher));

function packageMetadata(name = PACKAGE_NAME, version = PACKAGE_VERSION) {
  return `${JSON.stringify({ name, version, type: 'module' })}\n`;
}

function semanticFixture(anchor) {
  return `export class SyntheticSession {
  constructor(queued) {
    this.agent = { hasQueuedMessages: () => queued };
  }
  _emit() {}
  runAuto(reason, extensionResult) {
    if (extensionResult?.cancel) {
${anchor}
    }
    return this.agent.hasQueuedMessages();
  }
  runManual(extensionResult) {
    if (extensionResult?.cancel) return false;
    return true;
  }
  runSuccessful() {
    return this.agent.hasQueuedMessages();
  }
}
`;
}

function writeFixture(source, name = PACKAGE_NAME, version = PACKAGE_VERSION) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(packageJson, packageMetadata(name, version));
  fs.writeFileSync(target, source);
}

function runPatcher() {
  return spawnSync(process.execPath, [patcher, '--package-root', temp], {
    cwd: root,
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '' },
  });
}

function fixtureBytes() {
  return {
    package: fs.readFileSync(packageJson),
    target: fs.readFileSync(target),
  };
}

function assertUnchanged(before, label) {
  const after = fixtureBytes();
  assert.deepEqual(after.package, before.package, `${label}: package changed`);
  assert.deepEqual(after.target, before.target, `${label}: target changed`);
}

function assertRefused(label) {
  const before = fixtureBytes();
  const result = runPatcher();
  assert.notEqual(result.status, 0, `${label}: patcher unexpectedly succeeded`);
  assertUnchanged(before, label);
  assert.doesNotMatch(result.stderr, /session|password|secret|credential|token|queued/i, `${label}: sensitive/payload output`);
}

try {
  assert.equal(createHash('sha256').update(UNPATCHED_ANCHOR).digest('hex'), UNPATCHED_SHA256);
  assert.equal(createHash('sha256').update(PATCHED_ANCHOR).digest('hex'), PATCHED_SHA256);
  assert.equal(TARGET_RELATIVE_PATH, 'dist/core/agent-session.js');
  const syntheticNpmRoot = path.join(temp, 'synthetic-global-node_modules');
  let resolverCalls = 0;
  assert.equal(
    packageRootFromArgs([], () => {
      resolverCalls += 1;
      return `${syntheticNpmRoot}/`;
    }),
    path.join(syntheticNpmRoot, '@earendil-works', 'pi-coding-agent'),
  );
  assert.equal(resolverCalls, 1, 'default resolver seam was not used exactly once');
  assert.equal(packageRootFromArgs(['--package-root', temp]), temp, 'explicit fixture root changed');

  // Regression: on Windows the bare `npm` name is unresolvable (ENOENT) and a
  // .cmd cannot be spawned without a shell (EINVAL).
  assert.deepEqual(npmInvocation('win32'), { command: 'npm.cmd', shell: true }, 'Windows npm invocation regressed');
  assert.deepEqual(npmInvocation('linux'), { command: 'npm', shell: false }, 'POSIX npm invocation regressed');
  assert.deepEqual(npmInvocation('darwin'), { command: 'npm', shell: false }, 'macOS npm invocation regressed');
  assert.ok(
    path.isAbsolute(npmGlobalNodeModulesRoot()),
    'npm global root is not resolvable on this host',
  );

  const original = semanticFixture(UNPATCHED_ANCHOR);
  writeFixture(original);
  fs.chmodSync(target, 0o744);
  const modeBefore = fs.statSync(target).mode & 0o7777;
  const first = runPatcher();
  assert.equal(first.status, 0, first.stderr);
  const patched = fs.readFileSync(target);
  assert.notDeepEqual(patched, Buffer.from(original));
  assert.equal(fs.statSync(target).mode & 0o7777, modeBefore, 'file mode changed');
  assert.equal(patched.toString('utf8').split(UNPATCHED_ANCHOR).length, 1);
  assert.equal(patched.toString('utf8').split(PATCHED_ANCHOR).length, 2);
  assert.equal(patched.toString('utf8').replace(PATCHED_ANCHOR, UNPATCHED_ANCHOR), original, 'bytes outside anchor changed');

  const second = runPatcher();
  assert.equal(second.status, 0, second.stderr);
  assert.deepEqual(fs.readFileSync(target), patched, 'second patch changed bytes');

  const imported = await import(`${pathToFileURL(target).href}?patched=${Date.now()}`);
  assert.equal(new imported.SyntheticSession(true).runAuto('threshold', { cancel: true }), true);
  assert.equal(new imported.SyntheticSession(false).runAuto('threshold', { cancel: true }), false);
  assert.equal(new imported.SyntheticSession(true).runAuto('overflow', { cancel: true }), false);
  assert.equal(new imported.SyntheticSession(true).runManual({ cancel: true }), false);
  assert.equal(new imported.SyntheticSession(true).runSuccessful(), true);
  assert.equal(new imported.SyntheticSession(false).runSuccessful(), false);

  writeFixture(original, 'wrong/package', PACKAGE_VERSION);
  assertRefused('wrong package name');
  writeFixture(original, PACKAGE_NAME, '0.83.1');
  assertRefused('wrong package version');

  const wrongHashAnchor = UNPATCHED_ANCHOR.replace('willRetry: false,', 'willRetry: true,');
  const wrongHash = original.replace(UNPATCHED_ANCHOR, wrongHashAnchor);
  writeFixture(wrongHash);
  assert.notEqual(createHash('sha256').update(wrongHashAnchor).digest('hex'), UNPATCHED_SHA256);
  assertRefused('wrong anchor hash/content');

  writeFixture(original.replace(UNPATCHED_ANCHOR, ''));
  assertRefused('zero anchors');
  writeFixture(`${original}\n${UNPATCHED_ANCHOR}`);
  assertRefused('multiple anchors');
  writeFixture(`${semanticFixture(PATCHED_ANCHOR)}\n${UNPATCHED_ANCHOR}`);
  assertRefused('mixed patched and unpatched anchors');

  const shell = fs.readFileSync(path.join(root, 'install.sh'), 'utf8');
  const powershell = fs.readFileSync(path.join(root, 'install.ps1'), 'utf8');
  const shellNpm = shell.indexOf('npm install -g --ignore-scripts');
  const shellPatch = shell.indexOf('node "$SCRIPT_DIR/scripts/patch-pi-083-threshold-cancel.mjs"');
  const powershellNpm = powershell.indexOf('npm install -g ');
  const powershellPatch = powershell.indexOf('& node (Join-Path $SCRIPT_DIR "scripts\\patch-pi-083-threshold-cancel.mjs")');
  assert.ok(shellNpm >= 0 && shellPatch > shellNpm, 'shell patch is not after npm install');
  assert.ok(powershellNpm >= 0 && powershellPatch > powershellNpm, 'PowerShell patch is not after npm install');
  assert.match(powershell.slice(powershellPatch), /if \(\$LASTEXITCODE -ne 0\)/);
  assert.ok(shell.indexOf('settings.json') > shellPatch, 'shell activation precedes patch');
  assert.ok(powershell.indexOf('settings.json') > powershellPatch, 'PowerShell activation precedes patch');

  console.log('patch-pi-083-threshold-cancel smoke: PASS (DISPOSABLE_VERIFIED)');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
