#!/usr/bin/env node
import { chmod, lstat, mkdtemp, readFile, rename, rm, writeFile, open } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_NAME = '@earendil-works/pi-coding-agent';
const PACKAGE_VERSION = '0.83.0';
const TARGET_RELATIVE_PATH = 'dist/core/agent-session.js';
const UNPATCHED_ANCHOR = `                if (extensionResult?.cancel) {
                    this._emit({
                        type: "compaction_end",
                        reason,
                        result: undefined,
                        aborted: true,
                        willRetry: false,
                    });
                    return false;
                }`;
const PATCHED_ANCHOR = UNPATCHED_ANCHOR.replace(
  '                    return false;',
  '                    return reason === "threshold" ? this.agent.hasQueuedMessages() : false;',
);
const UNPATCHED_SHA256 = 'aae8010f71636922729ad833127724d351b4883c67ad3065bfdc180a22da1ce0';
const PATCHED_SHA256 = '2632644852ed30cf6237f384f2b3a8412fc959bf5f3c590b6c610e2e89b9e18f';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function fail(message) {
  console.error(`Pi 0.83.0 threshold patch refused: ${message}`);
  process.exitCode = 1;
}

// Windows ships npm as `npm.cmd`: the bare name is not PATHEXT-resolved (ENOENT)
// and Node refuses to spawn a .cmd without a shell (EINVAL). Both failures made
// install.ps1 refuse the patch. Arguments stay fixed literals, so no shell
// interpolation of external input is possible.
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
  if (argv.length === 2 && argv[0] === '--package-root' && path.isAbsolute(argv[1])) {
    return argv[1];
  }
  throw new Error('unsupported arguments');
}

async function readPackage(packageRoot) {
  let metadata;
  try {
    metadata = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));
  } catch {
    throw new Error('package metadata unavailable');
  }
  if (metadata.name !== PACKAGE_NAME || metadata.version !== PACKAGE_VERSION) {
    throw new Error('package identity mismatch');
  }
}

async function patch(packageRoot) {
  await readPackage(packageRoot);
  const targetPath = path.join(packageRoot, TARGET_RELATIVE_PATH);
  let original;
  let targetStat;
  try {
    [original, targetStat] = await Promise.all([
      readFile(targetPath),
      lstat(targetPath),
    ]);
  } catch {
    throw new Error('target unavailable');
  }
  if (!targetStat.isFile()) {
    throw new Error('target is not a file');
  }

  const unpatchedCount = original.toString('utf8').split(UNPATCHED_ANCHOR).length - 1;
  const patchedCount = original.toString('utf8').split(PATCHED_ANCHOR).length - 1;
  if (unpatchedCount === 1 && patchedCount === 0) {
    if (sha256(UNPATCHED_ANCHOR) !== UNPATCHED_SHA256) {
      throw new Error('unpatched anchor digest mismatch');
    }
  } else if (unpatchedCount === 0 && patchedCount === 1) {
    if (sha256(PATCHED_ANCHOR) !== PATCHED_SHA256) {
      throw new Error('patched anchor digest mismatch');
    }
    return false;
  } else {
    throw new Error('anchor cardinality mismatch');
  }

  const source = original.toString('utf8');
  const output = Buffer.from(source.replace(UNPATCHED_ANCHOR, PATCHED_ANCHOR), 'utf8');
  if (output.equals(original)) {
    throw new Error('patch produced no change');
  }
  if (output.toString('utf8').split(UNPATCHED_ANCHOR).length !== 1
      || output.toString('utf8').split(PATCHED_ANCHOR).length !== 2
      || sha256(PATCHED_ANCHOR) !== PATCHED_SHA256) {
    throw new Error('patched output verification failed');
  }

  const directory = path.dirname(targetPath);
  const temporaryDirectory = await mkdtemp(path.join(directory, '.pi-threshold-patch-'));
  const temporaryPath = path.join(temporaryDirectory, 'agent-session.js');
  try {
    await writeFile(temporaryPath, output, { mode: targetStat.mode & 0o7777, flag: 'wx' });
    await chmod(temporaryPath, targetStat.mode & 0o7777);
    const handle = await open(temporaryPath, 'r+');
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
    const written = await readFile(temporaryPath);
    if (!written.equals(output)) {
      throw new Error('temporary output verification failed');
    }
    await rename(temporaryPath, targetPath);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
  return true;
}

async function main() {
  let packageRoot;
  try {
    packageRoot = packageRootFromArgs(process.argv.slice(2));
    if (!packageRoot) throw new Error('global package root unavailable');
    const changed = await patch(packageRoot);
    console.log(changed ? 'Pi 0.83.0 threshold patch applied.' : 'Pi 0.83.0 threshold patch already applied.');
  } catch (error) {
    fail(error instanceof Error ? error.message : 'unknown refusal');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}

export {
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
  patch,
};
