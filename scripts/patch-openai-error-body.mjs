#!/usr/bin/env node
import { chmod, lstat, mkdtemp, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PI_PACKAGE_NAME = '@earendil-works/pi-coding-agent';
const PI_PACKAGE_VERSION = '0.83.0';
const AI_PACKAGE_NAME = '@earendil-works/pi-ai';
const AI_PACKAGE_VERSION = '0.83.0';
const TARGET_RELATIVE_PATH = 'node_modules/@earendil-works/pi-ai/dist/api/openai-completions.js';
const CREATE_CLIENT_ANCHOR = 'function createClient(';
const UNPATCHED_ANCHOR = `    return new OpenAI({
        apiKey,
        baseURL: model.baseUrl,
        dangerouslyAllowBrowser: true,
        fetch,
        defaultHeaders: headers,
    });`;
const PATCHED_ANCHOR = `    return new OpenAI({
        apiKey,
        baseURL: model.baseUrl,
        dangerouslyAllowBrowser: true,
        fetch: piNormalizeErrorEnvelope(fetch),
        defaultHeaders: headers,
    });`;
const HELPER = `// The OpenAI SDK requires the {"error": ...} envelope, but providers like Cerebras return flat bodies; without it, the SDK reports "<status> status code (no body)".
function piNormalizeErrorEnvelope(baseFetch) {
    const underlying = baseFetch ?? globalThis.fetch;
    return async (url, init) => {
        const response = await underlying(url, init);
        if (response.ok) return response;
        let text;
        try {
            text = await response.text();
        }
        catch {
            return response;
        }
        let payload = text;
        try {
            const parsed = JSON.parse(text);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && parsed.error === undefined) {
                payload = JSON.stringify({ error: parsed });
            }
        }
        catch {
            // Non-JSON error body: forward it untouched.
        }
        const headers = new Headers(response.headers);
        headers.delete("content-length");
        headers.delete("content-encoding");
        return new Response(payload, { status: response.status, statusText: response.statusText, headers });
    };
}
`;
const UNPATCHED_SHA256 = 'e5122e013f472c77b55d805cd91daff47f2a29bf68c7be0c94f904af9b8591bd';
const PATCHED_SHA256 = 'd53631958ac16e82d95d84c872b086ff9693962cb0d491182c67d2d15e621f00';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function countOccurrences(source, value) {
  let count = 0;
  let offset = 0;
  while (true) {
    const index = source.indexOf(value, offset);
    if (index < 0) return count;
    count += 1;
    offset = index + value.length;
  }
}

function decodeUtf8(bytes) {
  const source = bytes.toString('utf8');
  if (!Buffer.from(source, 'utf8').equals(bytes)) {
    throw new Error('target is not valid UTF-8');
  }
  return source;
}

function npmInvocation(platform = process.platform) {
  return platform === 'win32'
    ? { command: 'npm.cmd', shell: true }
    : { command: 'npm', shell: false };
}

function npmGlobalNodeModulesRoot() {
  try {
    const { command, shell } = npmInvocation();
    const root = execFileSync(command, ['root', '-g'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      shell,
    }).trim();
    if (!root) throw new Error('empty root');
    return root;
  } catch {
    throw new Error('global package root unavailable');
  }
}

function packageRootFromArgs(argv, resolveNpmGlobalNodeModulesRoot = npmGlobalNodeModulesRoot) {
  if (argv.length === 0) {
    return path.join(resolveNpmGlobalNodeModulesRoot(), '@earendil-works', 'pi-coding-agent');
  }
  if (argv.length === 2 && argv[0] === '--pi-package-root' && path.isAbsolute(argv[1])) {
    return argv[1];
  }
  throw new Error('unsupported arguments');
}

async function readPackage(packageRoot, expectedName, expectedVersion) {
  let packageStat;
  let metadataStat;
  let metadata;
  try {
    [packageStat, metadataStat, metadata] = await Promise.all([
      lstat(packageRoot),
      lstat(path.join(packageRoot, 'package.json')),
      readFile(path.join(packageRoot, 'package.json'), 'utf8').then(JSON.parse),
    ]);
  } catch {
    throw new Error(`package metadata unavailable: ${expectedName}`);
  }
  if (!packageStat.isDirectory() || !metadataStat.isFile()) {
    throw new Error(`package metadata has unsafe type: ${expectedName}`);
  }
  if (metadata.name !== expectedName || metadata.version !== expectedVersion) {
    throw new Error(`package identity/version mismatch for ${expectedName}; re-verify the anchor before patching`);
  }
}

async function prepareTarget(packageRoot) {
  await readPackage(packageRoot, PI_PACKAGE_NAME, PI_PACKAGE_VERSION);
  const aiPackageRoot = path.join(packageRoot, 'node_modules', '@earendil-works', 'pi-ai');
  await readPackage(aiPackageRoot, AI_PACKAGE_NAME, AI_PACKAGE_VERSION);

  const targetPath = path.join(packageRoot, TARGET_RELATIVE_PATH);
  let original;
  let targetStat;
  try {
    [original, targetStat] = await Promise.all([readFile(targetPath), lstat(targetPath)]);
  } catch {
    throw new Error(`target unavailable: ${TARGET_RELATIVE_PATH}`);
  }
  if (!targetStat.isFile()) {
    throw new Error(`target is not a regular file: ${TARGET_RELATIVE_PATH}`);
  }

  const source = decodeUtf8(original);
  const currentSha256 = sha256(original);
  const unpatchedCount = countOccurrences(source, UNPATCHED_ANCHOR);
  const patchedCount = countOccurrences(source, PATCHED_ANCHOR);
  if (currentSha256 === PATCHED_SHA256) {
    if (unpatchedCount !== 0 || patchedCount !== 1) {
      throw new Error(`patched SHA/anchor mismatch: ${TARGET_RELATIVE_PATH}`);
    }
    return { targetPath, original, output: original, mode: targetStat.mode & 0o7777, changed: false };
  }
  if (currentSha256 !== UNPATCHED_SHA256) {
    throw new Error(`unexpected target SHA; re-verify the anchor before patching: ${TARGET_RELATIVE_PATH}`);
  }
  if (unpatchedCount !== 1 || patchedCount !== 0 || countOccurrences(source, CREATE_CLIENT_ANCHOR) !== 1) {
    throw new Error(`anchor cardinality mismatch; re-verify the anchor before patching: ${TARGET_RELATIVE_PATH}`);
  }

  const createClientIndex = source.indexOf(CREATE_CLIENT_ANCHOR);
  const anchorIndex = source.indexOf(UNPATCHED_ANCHOR);
  const output = Buffer.from(
    source.slice(0, createClientIndex)
      + HELPER
      + source.slice(createClientIndex).replace(UNPATCHED_ANCHOR, PATCHED_ANCHOR),
    'utf8',
  );
  if (output.equals(original) || countOccurrences(output.toString('utf8'), UNPATCHED_ANCHOR) !== 0
      || countOccurrences(output.toString('utf8'), PATCHED_ANCHOR) !== 1
      || sha256(output) !== PATCHED_SHA256
      || anchorIndex < createClientIndex) {
    throw new Error(`patched output verification failed: ${TARGET_RELATIVE_PATH}`);
  }
  return { targetPath, original, output, mode: targetStat.mode & 0o7777, changed: true };
}

async function stageBytes(targetPath, bytes, mode) {
  const directory = await mkdtemp(path.join(path.dirname(targetPath), '.pi-openai-error-body-'));
  const temporaryPath = path.join(directory, path.basename(targetPath));
  try {
    await writeFile(temporaryPath, bytes, { mode, flag: 'wx' });
    await chmod(temporaryPath, mode);
    const handle = await open(temporaryPath, 'r+');
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
    const written = await readFile(temporaryPath);
    if (!written.equals(bytes) || ((await lstat(temporaryPath)).mode & 0o7777) !== mode) {
      throw new Error(`temporary output verification failed: ${targetPath}`);
    }
    return { directory, path: temporaryPath };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

async function verifyTarget(target, expectedBytes) {
  const targetStat = await lstat(target.targetPath);
  if (!targetStat.isFile() || (targetStat.mode & 0o7777) !== target.mode) {
    throw new Error(`output mode/type verification failed: ${target.targetPath}`);
  }
  const actual = await readFile(target.targetPath);
  if (!actual.equals(expectedBytes)) {
    throw new Error(`output bytes verification failed: ${target.targetPath}`);
  }
}

async function patchPackageRoot(packageRoot, { renameFile = rename } = {}) {
  const target = await prepareTarget(packageRoot);
  if (!target.changed) return false;

  let staged;
  let rollback;
  try {
    staged = await stageBytes(target.targetPath, target.output, target.mode);
    rollback = await stageBytes(target.targetPath, target.original, target.mode);
    try {
      await renameFile(staged.path, target.targetPath);
      await verifyTarget(target, target.output);
    } catch (error) {
      await renameFile(rollback.path, target.targetPath);
      await verifyTarget(target, target.original);
      throw new Error(`patch commit failed: ${error instanceof Error ? error.message : 'unknown failure'}`);
    }
  } finally {
    await Promise.all([staged, rollback].filter(Boolean).map(({ directory }) => rm(directory, { recursive: true, force: true })));
  }
  return true;
}

function fail(message) {
  console.error(`OpenAI error-body patch refused: ${message}`);
  process.exitCode = 1;
}

async function main() {
  try {
    const packageRoot = packageRootFromArgs(process.argv.slice(2));
    const changed = await patchPackageRoot(packageRoot);
    console.log(changed
      ? 'OpenAI error-body patch applied.'
      : 'OpenAI error-body patch already applied.');
  } catch (error) {
    fail(error instanceof Error ? error.message : 'unknown refusal');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}

export {
  AI_PACKAGE_NAME,
  AI_PACKAGE_VERSION,
  PI_PACKAGE_NAME,
  PI_PACKAGE_VERSION,
  TARGET_RELATIVE_PATH,
  UNPATCHED_ANCHOR,
  PATCHED_ANCHOR,
  HELPER,
  UNPATCHED_SHA256,
  PATCHED_SHA256,
  npmInvocation,
  npmGlobalNodeModulesRoot,
  packageRootFromArgs,
  patchPackageRoot,
};
