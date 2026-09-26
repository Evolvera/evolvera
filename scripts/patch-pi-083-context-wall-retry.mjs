#!/usr/bin/env node
// Pi 0.83.0 stops a long agent run at the context wall and never resumes it:
// the pre-request clamp shrinks max_tokens to 1, the provider returns
// stopReason "length" with ~1 output token, `isContextOverflow` misses it
// (it requires output === 0 and >= 99% of the window), and the run falls into
// threshold compaction, which never retries. The user then has to nudge the
// agent. This patch routes a "length" stop above the compaction threshold into
// the existing single-attempt overflow compact-and-retry path.
import { chmod, lstat, mkdtemp, readFile, rename, rm, writeFile, open } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_NAME = '@earendil-works/pi-coding-agent';
const PACKAGE_VERSION = '0.83.0';
const TARGET_RELATIVE_PATH = 'dist/core/agent-session.js';

const ANCHORS = [
  {
    // Treat a context-wall "length" stop as overflow (willRetry is true for non-"stop").
    unpatched: '        if (sameModel && isContextOverflow(assistantMessage, contextWindow)) {\n',
    patched: '        if (sameModel && (isContextOverflow(assistantMessage, contextWindow) || (assistantMessage.stopReason === "length" && shouldCompact(calculateContextTokens(assistantMessage.usage), contextWindow, settings)))) {\n',
  },
  {
    // A "length" stop must not re-arm the one-shot recovery guard, or a retry that
    // hits the wall again would compact in a loop.
    unpatched: '                if (assistantMsg.stopReason !== "error") {\n                    this._overflowRecoveryAttempted = false;\n',
    patched: '                if (assistantMsg.stopReason !== "error" && assistantMsg.stopReason !== "length") {\n                    this._overflowRecoveryAttempted = false;\n',
  },
  {
    // Compaction rebuilds messages from the session, restoring the truncated reply;
    // drop it again so agent.continue() does not start from an assistant message.
    unpatched: '                if (lastMsg?.role === "assistant" && lastMsg.stopReason === "error") {\n',
    patched: '                if (lastMsg?.role === "assistant" && (lastMsg.stopReason === "error" || lastMsg.stopReason === "length")) {\n',
  },
];
const UNPATCHED_SHA256 = '28cf0c4a62531c2d4fc02a23f358a5d7c39e5929e16d1e472be6c1d6ddbbecc4';
const PATCHED_SHA256 = '5d83bd855b697d2a7cf93bbc30a545fd93710cdc959c667aa0e5c919aefd6081';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function anchorsDigest(kind) {
  return sha256(ANCHORS.map((anchor) => anchor[kind]).join('\u0000'));
}

function count(source, needle) {
  return source.split(needle).length - 1;
}

function fail(message) {
  console.error(`Pi 0.83.0 context-wall patch refused: ${message}`);
  process.exitCode = 1;
}

// Windows ships npm as `npm.cmd`; see patch-pi-083-threshold-cancel.mjs.
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
  if (anchorsDigest('unpatched') !== UNPATCHED_SHA256 || anchorsDigest('patched') !== PATCHED_SHA256) {
    throw new Error('anchor digest mismatch');
  }
  const targetPath = path.join(packageRoot, TARGET_RELATIVE_PATH);
  let original;
  let targetStat;
  try {
    [original, targetStat] = await Promise.all([readFile(targetPath), lstat(targetPath)]);
  } catch {
    throw new Error('target unavailable');
  }
  if (!targetStat.isFile()) {
    throw new Error('target is not a file');
  }

  const source = original.toString('utf8');
  const states = ANCHORS.map(({ unpatched, patched }) => [count(source, unpatched), count(source, patched)]);
  if (states.every(([u, p]) => u === 0 && p === 1)) {
    return false;
  }
  if (!states.every(([u, p]) => u === 1 && p === 0)) {
    throw new Error('anchor cardinality mismatch');
  }

  let output = source;
  for (const { unpatched, patched } of ANCHORS) {
    output = output.replace(unpatched, () => patched);
  }
  if (!ANCHORS.every(({ unpatched, patched }) => count(output, unpatched) === 0 && count(output, patched) === 1)) {
    throw new Error('patched output verification failed');
  }
  const outputBytes = Buffer.from(output, 'utf8');

  const directory = path.dirname(targetPath);
  const temporaryDirectory = await mkdtemp(path.join(directory, '.pi-context-wall-patch-'));
  const temporaryPath = path.join(temporaryDirectory, 'agent-session.js');
  try {
    await writeFile(temporaryPath, outputBytes, { mode: targetStat.mode & 0o7777, flag: 'wx' });
    await chmod(temporaryPath, targetStat.mode & 0o7777);
    const handle = await open(temporaryPath, 'r+');
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
    if (!(await readFile(temporaryPath)).equals(outputBytes)) {
      throw new Error('temporary output verification failed');
    }
    await rename(temporaryPath, targetPath);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
  return true;
}

async function main() {
  try {
    const packageRoot = packageRootFromArgs(process.argv.slice(2));
    const changed = await patch(packageRoot);
    console.log(changed ? 'Pi 0.83.0 context-wall patch applied.' : 'Pi 0.83.0 context-wall patch already applied.');
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
  ANCHORS,
  UNPATCHED_SHA256,
  PATCHED_SHA256,
  anchorsDigest,
  npmInvocation,
  packageRootFromArgs,
  patch,
};
