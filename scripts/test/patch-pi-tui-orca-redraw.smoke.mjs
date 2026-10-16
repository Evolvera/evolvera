import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// STATEFUL RESOURCE PROOF: DISPOSABLE_VERIFIED. Uses one synthetic fixture under os.tmpdir(),
// never resolves the live npm root (packageRoot is always passed), and removes only that fixture.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const patcher = await import(pathToFileURL(path.join(root, 'scripts/patch-pi-tui-orca-redraw.mjs')));
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'evolvera-pi-tui-orca-redraw-'));

// Mirrors the five absolute-cursor writes shared by pi-tui 1.2.0/1.3.0 doRender, plus a pre-existing
// unrelated "`\r\x1b[" that must stay untouched.
const pristine = [
  'const unrelated = `\\r\\x1b[K`;',
  'buffer += `\\x1b[${row + 1};1H\\x1b[2K`;',
  'buffer += `\\x1b[${row + 1};1H${preparedKittyScreen.lines[row] ?? ""}`;',
  'buffer += `\\x1b[${row + 1};1H${preparedKittyScreen.lines[row] ?? ""}`;',
  'buffer += `\\x1b[${row + 1};1H\\x1b[2K${preparedKittyScreen.lines[row] ?? ""}`;',
  'buffer += `\\x1b[${cursorPos.row + 1};${Math.min(width, cursorPos.col) + 1}H`;',
  '',
].join('\n');

function writePackage(packageRoot, name, version) {
  fs.mkdirSync(packageRoot, { recursive: true });
  fs.writeFileSync(path.join(packageRoot, 'package.json'), `${JSON.stringify({ name, version })}\n`);
}

function fixture(name, { piVersion = patcher.PI_PACKAGE_VERSION, tuiVersion = patcher.TUI_PACKAGE_VERSION, source = pristine } = {}) {
  const packageRoot = path.join(temp, name);
  writePackage(packageRoot, patcher.PI_PACKAGE_NAME, piVersion);
  writePackage(path.join(packageRoot, 'node_modules', ...patcher.TUI_PACKAGE_NAME.split('/')), patcher.TUI_PACKAGE_NAME, tuiVersion);
  const target = path.join(packageRoot, ...patcher.TARGET_RELATIVE_PATH.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, source);
  fs.chmodSync(target, 0o644);
  return { packageRoot, target };
}

try {
  const patchedText = patcher.patchSource(pristine);
  const pins = { unpatched: sha256(pristine), patched: sha256(patchedText) };

  // Every absolute cursor write gains exactly one leading CR; the unrelated CR sequence is preserved.
  assert.equal((patchedText.match(/`\\r\\x1b\[\$\{row \+ 1\};1H/g) ?? []).length, 4);
  assert.equal((patchedText.match(/`\\r\\x1b\[\$\{cursorPos\.row \+ 1\};/g) ?? []).length, 1);
  assert.equal((patchedText.match(/`\\x1b\[\$\{(row|cursorPos\.row) \+ 1\}/g) ?? []).length, 0);
  assert.ok(patchedText.startsWith('const unrelated = `\\r\\x1b[K`;\n'));
  assert.throws(() => patcher.patchSource(pristine.replace('buffer += `\\x1b[${row + 1};1H\\x1b[2K`;\n', '')), /anchor count mismatch/);

  // Pristine -> patched, mode preserved; second run is a no-op on both supported PI releases.
  for (const version of ['1.2.0', '1.3.0']) {
    const ok = fixture(`ok-${version}`, { piVersion: version, tuiVersion: version });
    const originalMode = fs.statSync(ok.target).mode & 0o777;
    assert.deepEqual(await patcher.applyPatch({ packageRoot: ok.packageRoot, pins }), { status: 'patched', target: ok.target });
    assert.equal(fs.readFileSync(ok.target, 'utf8'), patchedText);
    assert.equal(fs.statSync(ok.target).mode & 0o777, originalMode, "patch preserves the platform-reported mode");
    assert.deepEqual(await patcher.applyPatch({ packageRoot: ok.packageRoot, pins }), { status: 'already-patched', target: ok.target });
    assert.deepEqual(fs.readdirSync(path.dirname(ok.target)), ['tui-alt-screen.js']);
  }

  // Unrecognized content is refused without writing.
  const drift = fixture('drift', { source: `${pristine}// drift\n` });
  await assert.rejects(patcher.applyPatch({ packageRoot: drift.packageRoot, pins }), /refusing to patch unrecognized/);
  assert.equal(fs.readFileSync(drift.target, 'utf8'), `${pristine}// drift\n`);

  // Unsupported or mismatched SDK/TUI versions are skipped untouched.
  for (const [name, options] of [['old-pi', { piVersion: '0.83.0' }], ['other-tui', { tuiVersion: '1.1.0' }], ['mismatched-pair', { piVersion: '1.2.0', tuiVersion: '1.3.0' }]]) {
    const other = fixture(name, options);
    const result = await patcher.applyPatch({ packageRoot: other.packageRoot, pins });
    assert.equal(result.status, 'skipped');
    assert.equal(fs.readFileSync(other.target, 'utf8'), pristine);
  }

  // Check the real published 1.2.0 and 1.3.0 files in temporary copies; never patch either SDK root.
  for (const [version, sdkRoot] of [['1.2.0', process.env.SDK_120_ROOT], ['1.3.0', process.env.SDK_130_ROOT]]) {
    if (!sdkRoot) continue;
    const sdkMetadata = JSON.parse(fs.readFileSync(path.join(sdkRoot, 'package.json'), 'utf8'));
    const tuiRoot = path.join(sdkRoot, 'node_modules', ...patcher.TUI_PACKAGE_NAME.split('/'));
    const sourcePath = path.join(tuiRoot, ...patcher.TARGET_RELATIVE_PATH.split('/').slice(3));
    const source = fs.readFileSync(sourcePath, 'utf8');
    assert.equal(sdkMetadata.version, version);
    assert.equal(JSON.parse(fs.readFileSync(path.join(tuiRoot, 'package.json'), 'utf8')).version, version);
    const originalHash = sha256(source);
    assert.ok([patcher.UNPATCHED_SHA256, patcher.PATCHED_SHA256].includes(originalHash), `published ${version} source matches a known pin`);
    const copied = fixture(`published-${version}`, { piVersion: version, tuiVersion: version, source });
    const expectedStatus = originalHash === patcher.PATCHED_SHA256 ? 'already-patched' : 'patched';
    assert.deepEqual(await patcher.applyPatch({ packageRoot: copied.packageRoot }), { status: expectedStatus, target: copied.target });
    assert.equal(sha256(fs.readFileSync(copied.target)), patcher.PATCHED_SHA256);
    assert.equal(sha256(fs.readFileSync(sourcePath)), originalHash, `published ${version} source remains unchanged`);
  }

  assert.match(patcher.UNPATCHED_SHA256, /^[a-f0-9]{64}$/);
  assert.match(patcher.PATCHED_SHA256, /^[a-f0-9]{64}$/);
  assert.notEqual(patcher.UNPATCHED_SHA256, patcher.PATCHED_SHA256);

  console.log('patch-pi-tui-orca-redraw smoke: PASS (DISPOSABLE_VERIFIED)');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
