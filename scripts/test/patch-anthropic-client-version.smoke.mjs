import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { trySymlinkFile } from '../../extensions/test/lib/test-symlink.mjs';

// STATEFUL RESOURCE PROOF: DISPOSABLE_VERIFIED. This test uses one unique synthetic
// fixture under os.tmpdir(), never resolves live npm roots, and removes only that fixture.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const patcherPath = path.join(root, 'scripts/patch-anthropic-client-version.mjs');
const patcher = await import(pathToFileURL(patcherPath));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'evolvera-anthropic-client-version-'));
const piRoot = path.join(temp, 'pi-coding-agent');
const authRoot = path.join(temp, 'pi-anthropic-auth');
const piTarget = path.join(piRoot, patcher.PI_TARGET_RELATIVE_PATH);
const authTarget = path.join(authRoot, patcher.AUTH_TARGET_RELATIVE_PATH);

function packageMetadata(name, version) {
  return `${JSON.stringify({ name, version, type: 'module' })}\n`;
}

function sourceAround(anchor) {
  return `// synthetic fixture: preserve this π prefix\nexport const before = "unchanged";\n${anchor}\nexport const after = "unchanged";\n`;
}

function writePackage(packageRoot, name, version) {
  fs.mkdirSync(packageRoot, { recursive: true });
  fs.writeFileSync(path.join(packageRoot, 'package.json'), packageMetadata(name, version));
}

function writeTarget(targetPath, source, mode) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, source);
  fs.chmodSync(targetPath, mode);
}

function createFixture({
  piName = patcher.PI_PACKAGE_NAME,
  piVersion = patcher.PI_PACKAGE_VERSION,
  authName = patcher.AUTH_PACKAGE_NAME,
  authVersion = patcher.AUTH_PACKAGE_VERSION,
  piSource = sourceAround(patcher.PI_UNPATCHED_ANCHOR),
  authSource = sourceAround(patcher.AUTH_UNPATCHED_ANCHOR),
  missing = null,
  symlink = null,
} = {}) {
  fs.rmSync(piRoot, { recursive: true, force: true });
  fs.rmSync(authRoot, { recursive: true, force: true });
  writePackage(piRoot, piName, piVersion);
  writePackage(authRoot, authName, authVersion);
  if (missing !== 'pi') writeTarget(piTarget, piSource, 0o744);
  if (missing !== 'auth') writeTarget(authTarget, authSource, 0o640);
  if (symlink === 'pi') {
    fs.rmSync(piTarget, { force: true });
    const sidecar = path.join(piRoot, 'pi-target-sidecar.js');
    fs.writeFileSync(sidecar, piSource);
    if (!trySymlinkFile(sidecar, piTarget, 'unsafe PI target type')) return false;
  }
  if (symlink === 'auth') {
    fs.rmSync(authTarget, { force: true });
    const sidecar = path.join(authRoot, 'auth-target-sidecar.ts');
    fs.writeFileSync(sidecar, authSource);
    if (!trySymlinkFile(sidecar, authTarget, 'unsafe auth target type')) return false;
  }
  return true;
}

function snapshotTree(directory) {
  const entries = [];
  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      const relative = path.relative(temp, absolute);
      if (entry.isDirectory()) {
        visit(absolute);
      } else if (entry.isSymbolicLink()) {
        entries.push([relative, 'symlink', fs.readlinkSync(absolute)]);
      } else {
        entries.push([relative, 'file', fs.readFileSync(absolute)]);
      }
    }
  }
  visit(directory);
  return entries;
}

function fixtureSnapshot() {
  return [...snapshotTree(piRoot), ...snapshotTree(authRoot)].sort(([left], [right]) => left.localeCompare(right));
}

function runPatcher() {
  return spawnSync(process.execPath, [
    patcherPath,
    '--pi-package-root', piRoot,
    '--auth-package-root', authRoot,
  ], {
    cwd: root,
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '' },
  });
}

function expectedReplacement(source, unpatched, patched) {
  const index = source.indexOf(unpatched);
  assert.ok(index >= 0, 'fixture anchor missing');
  return Buffer.from(source.slice(0, index) + patched + source.slice(index + unpatched.length), 'utf8');
}

function assertRefused(label, options) {
  if (!createFixture(options)) return;
  const before = fixtureSnapshot();
  const result = runPatcher();
  assert.notEqual(result.status, 0, `${label}: patcher unexpectedly succeeded`);
  assert.deepEqual(fixtureSnapshot(), before, `${label}: fixture bytes changed`);
  assert.doesNotMatch(result.stderr, /secret|credential|token|password/i, `${label}: sensitive output`);
}

try {
  assert.equal(patcher.PI_TARGET_RELATIVE_PATH, 'node_modules/@earendil-works/pi-ai/dist/api/anthropic-messages.js');
  assert.equal(patcher.AUTH_TARGET_RELATIVE_PATH, 'src/constants.ts');
  assert.deepEqual(patcher.packageRootsFromArgs(
    ['--pi-package-root', piRoot, '--auth-package-root', authRoot],
    () => { throw new Error('live npm root resolver used'); },
  ), { piPackageRoot: piRoot, authPackageRoot: authRoot });
  assert.equal(
    patcher.authPackageRootFromEnvironment({ PI_CODING_AGENT_DIR: '/synthetic/agent' }, '/ignored/home'),
    path.join('/synthetic/agent', 'npm', 'node_modules', '@gotgenes', 'pi-anthropic-auth'),
  );
  assert.equal(
    patcher.authPackageRootFromEnvironment({}, '/synthetic/home'),
    path.join('/synthetic/home', '.pi', 'agent', 'npm', 'node_modules', '@gotgenes', 'pi-anthropic-auth'),
  );

  createFixture();
  const piBefore = fs.readFileSync(piTarget);
  const authBefore = fs.readFileSync(authTarget);
  const piMode = fs.statSync(piTarget).mode & 0o7777;
  const authMode = fs.statSync(authTarget).mode & 0o7777;
  const first = runPatcher();
  assert.equal(first.status, 0, first.stderr);
  assert.deepEqual(
    fs.readFileSync(piTarget),
    expectedReplacement(piBefore.toString('utf8'), patcher.PI_UNPATCHED_ANCHOR, patcher.PI_PATCHED_ANCHOR),
  );
  assert.deepEqual(
    fs.readFileSync(authTarget),
    expectedReplacement(authBefore.toString('utf8'), patcher.AUTH_UNPATCHED_ANCHOR, patcher.AUTH_PATCHED_ANCHOR),
  );
  assert.equal(fs.statSync(piTarget).mode & 0o7777, piMode, 'PI target mode changed');
  assert.equal(fs.statSync(authTarget).mode & 0o7777, authMode, 'auth target mode changed');
  const patchedSnapshot = fixtureSnapshot();
  const second = runPatcher();
  assert.equal(second.status, 0, second.stderr);
  assert.deepEqual(fixtureSnapshot(), patchedSnapshot, 'second patch changed fixture bytes');

  // An install carrying a client version this patcher wrote earlier migrates
  // to the current target instead of being refused.
  assert.ok(patcher.PI_SUPERSEDED_ANCHORS.length > 0 && patcher.AUTH_SUPERSEDED_ANCHORS.length > 0);
  for (const [piSuperseded, authSuperseded] of patcher.PI_SUPERSEDED_ANCHORS.map(
    (pi, index) => [pi, patcher.AUTH_SUPERSEDED_ANCHORS[index]],
  )) {
    assert.ok(authSuperseded, 'superseded anchor lists are not paired');
    assert.notEqual(piSuperseded.anchor, patcher.PI_PATCHED_ANCHOR);
    assert.notEqual(authSuperseded.anchor, patcher.AUTH_PATCHED_ANCHOR);
    createFixture({
      piSource: sourceAround(piSuperseded.anchor),
      authSource: sourceAround(authSuperseded.anchor),
    });
    const piSupersededBefore = fs.readFileSync(piTarget);
    const authSupersededBefore = fs.readFileSync(authTarget);
    const migration = runPatcher();
    assert.equal(migration.status, 0, migration.stderr);
    assert.deepEqual(
      fs.readFileSync(piTarget),
      expectedReplacement(piSupersededBefore.toString('utf8'), piSuperseded.anchor, patcher.PI_PATCHED_ANCHOR),
    );
    assert.deepEqual(
      fs.readFileSync(authTarget),
      expectedReplacement(authSupersededBefore.toString('utf8'), authSuperseded.anchor, patcher.AUTH_PATCHED_ANCHOR),
    );
    const migratedSnapshot = fixtureSnapshot();
    const migrationAgain = runPatcher();
    assert.equal(migrationAgain.status, 0, migrationAgain.stderr);
    assert.deepEqual(fixtureSnapshot(), migratedSnapshot, 'migration is not idempotent');
    assertRefused('mixed superseded/current PI anchors', {
      piSource: `${sourceAround(piSuperseded.anchor)}\n${patcher.PI_PATCHED_ANCHOR}`,
    });
    assertRefused('mixed superseded/pristine auth anchors', {
      authSource: `${sourceAround(authSuperseded.anchor)}\n${patcher.AUTH_UNPATCHED_ANCHOR}`,
    });
  }

  // The adapted 2.0.1 must keep all bytes except the version constant.
  const adaptedSource = sourceAround(patcher.AUTH_SUPERSEDED_ANCHORS[0].anchor)
    + '\nexport const customAdaptation = "preserve-me";\n';
  createFixture({
    authVersion: '2.0.1',
    piSource: sourceAround(patcher.PI_SUPERSEDED_ANCHORS[0].anchor),
    authSource: adaptedSource,
  });
  const metadataBefore = fs.readFileSync(path.join(authRoot, 'package.json'));
  const adaptedRun = runPatcher();
  assert.equal(adaptedRun.status, 0, adaptedRun.stderr);
  assert.deepEqual(fs.readFileSync(authTarget), expectedReplacement(
    adaptedSource, patcher.AUTH_SUPERSEDED_ANCHORS[0].anchor, patcher.AUTH_PATCHED_ANCHOR,
  ));
  assert.deepEqual(fs.readFileSync(path.join(authRoot, 'package.json')), metadataBefore);
  const adaptedSnapshot = fixtureSnapshot();
  assert.equal(runPatcher().status, 0);
  assert.deepEqual(fixtureSnapshot(), adaptedSnapshot);

  assertRefused('wrong PI package name', { piName: 'wrong/package' });
  assertRefused('wrong PI package version', { piVersion: '0.83.1' });
  assertRefused('wrong auth package name', { authName: 'wrong/auth' });
  assertRefused('wrong auth package version', { authVersion: '2.0.5' });
  assertRefused('missing PI target', { missing: 'pi' });
  assertRefused('missing auth target', { missing: 'auth' });
  assertRefused('wrong PI anchor', { piSource: sourceAround('const claudeCodeVersion = "2.1.999";') });
  assertRefused('wrong auth anchor', { authSource: sourceAround('export const CLAUDE_CODE_VERSION = "2.1.999";') });
  assertRefused('multiple PI anchors', {
    piSource: `${sourceAround(patcher.PI_UNPATCHED_ANCHOR)}\n${patcher.PI_UNPATCHED_ANCHOR}`,
  });
  assertRefused('multiple auth anchors', {
    authSource: `${sourceAround(patcher.AUTH_UNPATCHED_ANCHOR)}\n${patcher.AUTH_UNPATCHED_ANCHOR}`,
  });
  assertRefused('mixed PI anchors', {
    piSource: `${sourceAround(patcher.PI_PATCHED_ANCHOR)}\n${patcher.PI_UNPATCHED_ANCHOR}`,
  });
  assertRefused('mixed auth anchors', {
    authSource: `${sourceAround(patcher.AUTH_PATCHED_ANCHOR)}\n${patcher.AUTH_UNPATCHED_ANCHOR}`,
  });
  assertRefused('unsafe PI target type', { symlink: 'pi' });
  assertRefused('unsafe auth target type', { symlink: 'auth' });

  createFixture();
  const beforeCommitFailure = fixtureSnapshot();
  let failAuthCommit = true;
  await assert.rejects(
    patcher.patchPackageRoots(piRoot, authRoot, {
      renameFile: async (from, to) => {
        if (to === authTarget && failAuthCommit) {
          failAuthCommit = false;
          throw new Error('synthetic commit failure');
        }
        return fs.promises.rename(from, to);
      },
    }),
    /patch commit failed/,
  );
  assert.deepEqual(fixtureSnapshot(), beforeCommitFailure, 'commit failure did not roll back both targets');

  const shell = fs.readFileSync(path.join(root, 'install.sh'), 'utf8');
  const powershell = fs.readFileSync(path.join(root, 'install.ps1'), 'utf8');
  const settings = JSON.parse(fs.readFileSync(path.join(root, 'config/settings.json'), 'utf8'));
  assert.equal(settings.packages.filter((pkg) => pkg === 'npm:@gotgenes/pi-anthropic-auth@2.0.6').length, 1);
  assert.equal((shell.match(/npm:@gotgenes\/pi-anthropic-auth@2\.0\.6/g) ?? []).length, 1);
  assert.equal((powershell.match(/npm:@gotgenes\/pi-anthropic-auth@2\.0\.6/g) ?? []).length, 1);
  const shellAuth = shell.indexOf('pi install npm:@gotgenes/pi-anthropic-auth@2.0.6');
  const shellPatch = shell.indexOf('node "$SCRIPT_DIR/scripts/patch-anthropic-client-version.mjs"');
  const shellSettings = shell.indexOf('settings.json');
  assert.ok(shellAuth >= 0 && shellPatch > shellAuth && shellSettings > shellPatch, 'shell auth/patch/settings order changed');
  assert.doesNotMatch(shell.slice(shellAuth, shellPatch), /\|\| true/);
  const powershellAuth = powershell.indexOf('& pi install npm:@gotgenes/pi-anthropic-auth@2.0.6');
  const powershellPatch = powershell.indexOf('& node (Join-Path $SCRIPT_DIR "scripts\\patch-anthropic-client-version.mjs")');
  const powershellSettings = powershell.indexOf('settings.json');
  assert.ok(powershellAuth >= 0 && powershellPatch > powershellAuth && powershellSettings > powershellPatch, 'PowerShell auth/patch/settings order changed');
  assert.match(powershell.slice(powershellAuth, powershellPatch), /\$LASTEXITCODE -ne 0/);

  console.log('patch-anthropic-client-version smoke: PASS (DISPOSABLE_VERIFIED)');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
