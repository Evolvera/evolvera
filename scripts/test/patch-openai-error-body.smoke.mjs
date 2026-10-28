import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

// STATEFUL RESOURCE PROOF: DISPOSABLE_VERIFIED. This smoke test uses one unique
// synthetic fixture under os.tmpdir(), never writes the live target, makes no
// network calls, and removes only that fixture.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const patcherPath = path.join(root, 'scripts/patch-openai-error-body.mjs');
const patcher = await import(pathToFileURL(patcherPath));
assert.ok(process.env.PI_SDK_ROOT, 'PI_SDK_ROOT must name the approved copied SDK fixture');
const sdkPackageRoot = path.resolve(process.env.PI_SDK_ROOT);
const copiedTarget = path.resolve(sdkPackageRoot, patcher.TARGET_RELATIVE_PATH);
const copiedBytes = fs.readFileSync(copiedTarget);
const piMetadata = JSON.parse(fs.readFileSync(path.join(sdkPackageRoot, 'package.json'), 'utf8'));
const aiMetadata = JSON.parse(fs.readFileSync(path.join(sdkPackageRoot, 'node_modules/@earendil-works/pi-ai/package.json'), 'utf8'));
assert.equal(piMetadata.version, aiMetadata.version, 'SDK package pair mismatch');
const versionHashes = patcher.VERSIONED_HASHES[piMetadata.version];
assert.ok(versionHashes, `unsupported copied SDK version: ${piMetadata.version}`);

// The copied SDK target may be pristine or already patched; derive only an exact
// pinned pristine baseline, never from an installed shared SDK.
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const copiedSha = sha256(copiedBytes);
let baseline;
if (copiedSha === versionHashes.unpatched) {
  baseline = copiedBytes;
} else if (copiedSha === versionHashes.patched) {
  baseline = Buffer.from(
    copiedBytes
      .toString('utf8')
      .replace(patcher.HELPER, '')
      .replace(patcher.PATCHED_ANCHOR, patcher.UNPATCHED_ANCHOR),
    'utf8',
  );
} else {
  throw new Error('copied target matches neither the pinned unpatched nor the pinned patched SHA256');
}
assert.equal(sha256(baseline), versionHashes.unpatched, 'derived baseline does not match the pinned unpatched SHA256');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'evolvera-openai-error-body-'));
const piRoot = path.join(temp, 'pi-coding-agent');
const target = path.join(piRoot, patcher.TARGET_RELATIVE_PATH);

function writePackage(packageRoot, name, version) {
  fs.mkdirSync(packageRoot, { recursive: true });
  fs.writeFileSync(path.join(packageRoot, 'package.json'), `${JSON.stringify({ name, version, type: 'module' })}\n`);
}

function createFixture(source = baseline, { piVersion = piMetadata.version, aiVersion = aiMetadata.version } = {}) {
  fs.rmSync(piRoot, { recursive: true, force: true });
  writePackage(piRoot, patcher.PI_PACKAGE_NAME, piVersion);
  writePackage(path.join(piRoot, 'node_modules', '@earendil-works', 'pi-ai'), patcher.AI_PACKAGE_NAME, aiVersion);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, source);
  fs.chmodSync(target, 0o744);
}

function runPatcher() {
  return spawnSync(process.execPath, [patcherPath, '--pi-package-root', piRoot], {
    cwd: root,
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '' },
  });
}

function assertRefused(label, source) {
  createFixture(source);
  const before = fs.readFileSync(target);
  const result = runPatcher();
  assert.notEqual(result.status, 0, `${label}: patcher unexpectedly succeeded`);
  assert.deepEqual(fs.readFileSync(target), before, `${label}: fixture bytes changed`);
  assert.doesNotMatch(result.stderr, /secret|credential|token|password/i, `${label}: sensitive output`);
}

function response(body, status = 402, headers = {}) {
  return new Response(body, { status, headers });
}

try {
  assert.ok(['1.3.0', '1.4.0'].includes(piMetadata.version));
  assert.equal(piMetadata.version, aiMetadata.version);
  assert.equal(patcher.TARGET_RELATIVE_PATH, 'node_modules/@earendil-works/pi-ai/dist/api/openai-completions.js');
  assert.deepEqual(
    patcher.packageRootFromArgs(['--pi-package-root', piRoot], () => { throw new Error('live npm root resolver used'); }),
    piRoot,
  );

  createFixture(baseline, { aiVersion: piMetadata.version === '1.3.0' ? '1.4.0' : '1.3.0' });
  const mismatchedPair = fs.readFileSync(target);
  const mismatch = runPatcher();
  assert.notEqual(mismatch.status, 0, 'mismatched PI/pi-ai versions were accepted');
  assert.deepEqual(fs.readFileSync(target), mismatchedPair, 'mismatched package pair changed target');

  createFixture();
  const before = fs.readFileSync(target);
  const mode = fs.statSync(target).mode & 0o7777;
  const first = runPatcher();
  assert.equal(first.status, 0, first.stderr);
  const patched = fs.readFileSync(target);
  assert.equal((patched.toString('utf8').match(/fetch: piNormalizeErrorEnvelope\(fetch\),/g) ?? []).length, 1);
  assert.equal((patched.toString('utf8').match(/function piNormalizeErrorEnvelope\(/g) ?? []).length, 1);
  assert.notDeepEqual(patched, before);
  assert.equal(fs.statSync(target).mode & 0o7777, mode, 'target mode changed');
  assert.match(first.stdout, /applied/);

  const patchedSnapshot = Buffer.from(patched);
  const second = runPatcher();
  assert.equal(second.status, 0, second.stderr);
  assert.deepEqual(fs.readFileSync(target), patchedSnapshot, 'second patch changed fixture bytes');
  assert.match(second.stdout, /already applied/);

  const unexpected = Buffer.from(baseline);
  unexpected[0] ^= 1;
  assertRefused('unexpected content', unexpected);
  assertRefused('multiple unpatched anchors', Buffer.concat([baseline, Buffer.from(`\n${patcher.UNPATCHED_ANCHOR}\n`)]));

  const patchedSource = patched.toString('utf8');
  const helperStart = patchedSource.indexOf('// The OpenAI SDK requires');
  const helperEnd = patchedSource.indexOf('function createClient(', helperStart);
  assert.ok(helperStart >= 0 && helperEnd > helperStart, 'patched helper not found');
  const helperModule = `${patchedSource.slice(helperStart, helperEnd)}\nexport { piNormalizeErrorEnvelope };`;
  const helperUrl = `data:text/javascript,${encodeURIComponent(helperModule)}`;
  const { piNormalizeErrorEnvelope } = await import(helperUrl);

  const flat = await piNormalizeErrorEnvelope(async () => response('{"message":"x","code":"y"}', 402, {
    'content-length': '25',
    'content-encoding': 'gzip',
    'x-provider': 'synthetic',
  }))('offline', {});
  assert.deepEqual(await flat.json(), { error: { message: 'x', code: 'y' } });
  assert.equal(flat.status, 402);
  assert.equal(flat.headers.has('content-length'), false);
  assert.equal(flat.headers.has('content-encoding'), false);
  assert.equal(flat.headers.get('x-provider'), 'synthetic');

  const envelopedBody = '{"error":{"message":"already"}}';
  const enveloped = await piNormalizeErrorEnvelope(async () => response(envelopedBody))('offline', {});
  assert.equal(await enveloped.text(), envelopedBody);

  const nonJsonBody = 'gateway timeout';
  const nonJson = await piNormalizeErrorEnvelope(async () => response(nonJsonBody))('offline', {});
  assert.equal(await nonJson.text(), nonJsonBody);

  const successful = { ok: true, headers: new Headers(), text() { throw new Error('success body was consumed'); } };
  const returned = await piNormalizeErrorEnvelope(async () => successful)('offline', {});
  assert.equal(returned, successful, 'successful response was rebuilt');

  const originalFetch = globalThis.fetch;
  let fallbackCalled = false;
  try {
    globalThis.fetch = async () => {
      fallbackCalled = true;
      return response('{"message":"fallback"}');
    };
    const fallback = await piNormalizeErrorEnvelope(undefined)('offline', {});
    assert.equal(fallbackCalled, true, 'globalThis.fetch fallback was not used');
    assert.deepEqual(await fallback.json(), { error: { message: 'fallback' } });
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log('patch-openai-error-body smoke: PASS (DISPOSABLE_VERIFIED)');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
