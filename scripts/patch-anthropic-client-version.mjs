#!/usr/bin/env node
import { chmod, lstat, mkdtemp, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PI_PACKAGE_NAME = '@earendil-works/pi-coding-agent';
const PI_PACKAGE_VERSION = '1.3.0';
const AUTH_PACKAGE_NAME = '@gotgenes/pi-anthropic-auth';
const AUTH_PACKAGE_VERSION = '2.0.6';
// Preserve the installed adapted 2.0.1 instead of reinstalling its OAuth path.
const AUTH_SUPPORTED_VERSIONS = [AUTH_PACKAGE_VERSION, '2.0.1'];
const PI_TARGET_RELATIVE_PATH = 'node_modules/@earendil-works/pi-ai/dist/api/anthropic-messages.js';
const AUTH_TARGET_RELATIVE_PATH = 'src/constants.ts';
const PI_UNPATCHED_ANCHOR = 'const claudeCodeVersion = "2.1.75";';
const PI_PATCHED_ANCHOR = 'const claudeCodeVersion = "2.1.280";';
const AUTH_UNPATCHED_ANCHOR = 'export const CLAUDE_CODE_VERSION = "2.1.206";';
const AUTH_PATCHED_ANCHOR = 'export const CLAUDE_CODE_VERSION = "2.1.280";';
const PI_UNPATCHED_SHA256 = 'af2514d6f1a4a4f4e92499c9ff996b5f12792e882cdf55a7687aa09aed7b9a9e';
const PI_PATCHED_SHA256 = 'eaa26ecdb63f379a96b5bc556bda397fa8d747ea6a3aa94922656f1496fcce41';
const AUTH_UNPATCHED_SHA256 = 'e327b67cd75d719f06910db06468f9b39fd03e657b5fb593555ca6e4cbe349f8';
const AUTH_PATCHED_SHA256 = 'bfbe5a011ae42f04765567d4b177f164a048eaca33f3d89043fa0672360691c3';
/**
 * Client versions this patcher previously wrote. An install already carrying
 * one of them is migrated to the current target with the same fail-closed
 * identity, cardinality, and rollback guarantees as a pristine install; every
 * other value is still refused.
 */
const PI_SUPERSEDED_ANCHORS = [
  {
    anchor: 'const claudeCodeVersion = "2.1.257";',
    sha256: 'ca9165b796800e97b0946541d95c586cac8fb963d148673935d46091eacd9cd6',
  },
];
const AUTH_SUPERSEDED_ANCHORS = [
  {
    anchor: 'export const CLAUDE_CODE_VERSION = "2.1.257";',
    sha256: 'b01a4eb50efa8fecd6bf8e3ebdd525337f30d57ad43d2562c7b2cbd62f50efff',
  },
];

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

function authPackageRootFromEnvironment(env = process.env, homeDirectory = os.homedir()) {
  const agentDirectory = env.PI_CODING_AGENT_DIR || path.join(homeDirectory, '.pi', 'agent');
  return path.join(agentDirectory, 'npm', 'node_modules', '@gotgenes', 'pi-anthropic-auth');
}

function packageRootsFromArgs(
  argv,
  resolveNpmGlobalNodeModulesRoot = npmGlobalNodeModulesRoot,
  env = process.env,
  homeDirectory = os.homedir(),
) {
  if (argv.length === 0) {
    return {
      piPackageRoot: path.join(resolveNpmGlobalNodeModulesRoot(), '@earendil-works', 'pi-coding-agent'),
      authPackageRoot: authPackageRootFromEnvironment(env, homeDirectory),
    };
  }
  if (
    argv.length === 4
    && argv[0] === '--pi-package-root'
    && path.isAbsolute(argv[1])
    && argv[2] === '--auth-package-root'
    && path.isAbsolute(argv[3])
  ) {
    return { piPackageRoot: argv[1], authPackageRoot: argv[3] };
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
    throw new Error('package metadata unavailable');
  }
  if (!packageStat.isDirectory() || !metadataStat.isFile()) {
    throw new Error('package metadata has unsafe type');
  }
  const versions = Array.isArray(expectedVersion) ? expectedVersion : [expectedVersion];
  if (metadata.name !== expectedName || !versions.includes(metadata.version)) {
    throw new Error(`package identity mismatch for ${expectedName}`);
  }
}

async function prepareTarget({
  packageRoot, relativePath, unpatchedAnchor, patchedAnchor, unpatchedSha256, patchedSha256,
  supersededAnchors = [],
}) {
  const targetPath = path.join(packageRoot, relativePath);
  let original;
  let targetStat;
  try {
    [original, targetStat] = await Promise.all([readFile(targetPath), lstat(targetPath)]);
  } catch {
    throw new Error(`target unavailable: ${relativePath}`);
  }
  if (!targetStat.isFile()) {
    throw new Error(`target is not a regular file: ${relativePath}`);
  }

  const source = decodeUtf8(original);
  // Exactly one known client-version anchor may appear, exactly once: a
  // pristine install, one this patcher wrote earlier, or the current target.
  const sourceAnchors = [{ anchor: unpatchedAnchor, sha256: unpatchedSha256 }, ...supersededAnchors];
  const patchedCount = countOccurrences(source, patchedAnchor);
  const present = sourceAnchors
    .map((candidate) => ({ ...candidate, count: countOccurrences(source, candidate.anchor) }))
    .filter((candidate) => candidate.count > 0);
  const total = patchedCount + present.reduce((sum, candidate) => sum + candidate.count, 0);
  if (total !== 1) {
    throw new Error(`anchor cardinality mismatch: ${relativePath}`);
  }
  if (patchedCount === 1) {
    if (sha256(patchedAnchor) !== patchedSha256) {
      throw new Error(`patched anchor digest mismatch: ${relativePath}`);
    }
    return {
      targetPath,
      original,
      mode: targetStat.mode & 0o7777,
      output: original,
      changed: false,
      unpatchedAnchor,
      patchedAnchor,
    };
  }
  const [replaced] = present;
  if (sha256(replaced.anchor) !== replaced.sha256) {
    throw new Error(`unpatched anchor digest mismatch: ${relativePath}`);
  }
  const sourceAnchor = replaced.anchor;

  const index = source.indexOf(sourceAnchor);
  const output = Buffer.concat([
    Buffer.from(source.slice(0, index), 'utf8'),
    Buffer.from(patchedAnchor, 'utf8'),
    Buffer.from(source.slice(index + sourceAnchor.length), 'utf8'),
  ]);
  if (output.equals(original) || countOccurrences(output.toString('utf8'), sourceAnchor) !== 0
      || countOccurrences(output.toString('utf8'), patchedAnchor) !== 1
      || sha256(patchedAnchor) !== patchedSha256) {
    throw new Error(`patched output verification failed: ${relativePath}`);
  }
  return {
    targetPath,
    original,
    mode: targetStat.mode & 0o7777,
    output,
    changed: true,
    unpatchedAnchor,
    patchedAnchor,
  };
}

async function stageBytes(targetPath, bytes, mode) {
  const directory = await mkdtemp(path.join(path.dirname(targetPath), '.pi-anthropic-client-version-'));
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

async function patchPackageRoots(piPackageRoot, authPackageRoot, { renameFile = rename } = {}) {
  await Promise.all([
    readPackage(piPackageRoot, PI_PACKAGE_NAME, PI_PACKAGE_VERSION),
    readPackage(authPackageRoot, AUTH_PACKAGE_NAME, AUTH_SUPPORTED_VERSIONS),
  ]);

  // Both targets are read, validated, and prepared before either file can be renamed.
  const targets = await Promise.all([
    prepareTarget({
      packageRoot: piPackageRoot,
      relativePath: PI_TARGET_RELATIVE_PATH,
      unpatchedAnchor: PI_UNPATCHED_ANCHOR,
      patchedAnchor: PI_PATCHED_ANCHOR,
      unpatchedSha256: PI_UNPATCHED_SHA256,
      patchedSha256: PI_PATCHED_SHA256,
      supersededAnchors: PI_SUPERSEDED_ANCHORS,
    }),
    prepareTarget({
      packageRoot: authPackageRoot,
      relativePath: AUTH_TARGET_RELATIVE_PATH,
      unpatchedAnchor: AUTH_UNPATCHED_ANCHOR,
      patchedAnchor: AUTH_PATCHED_ANCHOR,
      unpatchedSha256: AUTH_UNPATCHED_SHA256,
      patchedSha256: AUTH_PATCHED_SHA256,
      supersededAnchors: AUTH_SUPERSEDED_ANCHORS,
    }),
  ]);
  const changedTargets = targets.filter((target) => target.changed);
  if (changedTargets.length === 0) return false;

  const staged = [];
  try {
    // Stage both replacement and rollback bytes before mutating either target.
    for (const target of changedTargets) {
      let output;
      try {
        output = await stageBytes(target.targetPath, target.output, target.mode);
        const rollback = await stageBytes(target.targetPath, target.original, target.mode);
        staged.push({ target, output, rollback });
      } catch (error) {
        if (output) await rm(output.directory, { recursive: true, force: true });
        throw error;
      }
    }

    const attempted = [];
    try {
      for (const entry of staged) {
        attempted.push(entry);
        await renameFile(entry.output.path, entry.target.targetPath);
        await verifyTarget(entry.target, entry.target.output);
      }
    } catch (error) {
      const rollbackErrors = [];
      for (const entry of attempted.reverse()) {
        try {
          await renameFile(entry.rollback.path, entry.target.targetPath);
          await verifyTarget(entry.target, entry.target.original);
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError instanceof Error ? rollbackError.message : 'unknown rollback failure');
        }
      }
      if (rollbackErrors.length > 0) {
        throw new Error(`patch commit failed; rollback failed: ${rollbackErrors.join('; ')}`);
      }
      throw new Error(`patch commit failed: ${error instanceof Error ? error.message : 'unknown failure'}`);
    }
  } finally {
    await Promise.all(staged.flatMap(({ output, rollback }) => [output.directory, rollback.directory])
      .map((directory) => rm(directory, { recursive: true, force: true })));
  }
  return true;
}

function fail(message) {
  console.error(`Anthropic client-version patch refused: ${message}`);
  process.exitCode = 1;
}

async function main() {
  try {
    const { piPackageRoot, authPackageRoot } = packageRootsFromArgs(process.argv.slice(2));
    const changed = await patchPackageRoots(piPackageRoot, authPackageRoot);
    console.log(changed
      ? 'Anthropic client-version patch applied.'
      : 'Anthropic client-version patch already applied.');
  } catch (error) {
    fail(error instanceof Error ? error.message : 'unknown refusal');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}

export {
  PI_PACKAGE_NAME,
  PI_PACKAGE_VERSION,
  AUTH_PACKAGE_NAME,
  AUTH_PACKAGE_VERSION,
  PI_TARGET_RELATIVE_PATH,
  AUTH_TARGET_RELATIVE_PATH,
  PI_UNPATCHED_ANCHOR,
  PI_PATCHED_ANCHOR,
  AUTH_UNPATCHED_ANCHOR,
  AUTH_PATCHED_ANCHOR,
  PI_UNPATCHED_SHA256,
  PI_PATCHED_SHA256,
  AUTH_UNPATCHED_SHA256,
  AUTH_PATCHED_SHA256,
  PI_SUPERSEDED_ANCHORS,
  AUTH_SUPERSEDED_ANCHORS,
  npmInvocation,
  npmGlobalNodeModulesRoot,
  authPackageRootFromEnvironment,
  packageRootsFromArgs,
  patchPackageRoots,
};
