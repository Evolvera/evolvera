#!/usr/bin/env node
import { chmod, lstat, mkdtemp, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_NAME = '@earendil-works/pi-coding-agent';
const PACKAGE_VERSION = '0.83.0';
const TARGET = 'dist/core/auth-storage.js';
const ANCHORS = [
  [
    `    data = {};\n    storage;\n    constructor(storage) {\n        this.storage = storage;\n        this.reload();\n    }`,
    `    data = {};\n    storage;\n    initialized = false;\n    pendingInitialization;\n    constructor(storage) {\n        this.storage = storage;\n        this.reload();\n    }`,
  ],
  [
    `            this.data = this.parseStorageData(content);\n        }\n        catch {\n            // Preserve the last valid in-memory snapshot.\n        }\n    }`,
    `            this.data = this.parseStorageData(content);\n            this.initialized = true;\n        }\n        catch {\n            // Preserve the last valid in-memory snapshot.\n        }\n    }\n    async ensureInitialized() {\n        if (this.initialized)\n            return;\n        if (!this.pendingInitialization) {\n            this.pendingInitialization = this.storage.withLockAsync((current) => {\n                const data = this.parseStorageData(current);\n                this.data = data;\n                this.initialized = true;\n                return { result: undefined };\n            }).finally(() => {\n                this.pendingInitialization = undefined;\n            });\n        }\n        await this.pendingInitialization;\n    }`,
  ],
  [
    `    async read(provider) {\n        const credential = this.data[provider];`,
    `    async read(provider) {\n        await this.ensureInitialized();\n        const credential = this.data[provider];`,
  ],
  [
    `            if (next === undefined) {\n                this.data = currentData;\n                return { result: currentData[provider] };\n            }\n            const merged = { ...currentData, [provider]: next };\n            this.data = merged;`,
    `            if (next === undefined) {\n                this.data = currentData;\n                this.initialized = true;\n                return { result: currentData[provider] };\n            }\n            const merged = { ...currentData, [provider]: next };\n            this.data = merged;\n            this.initialized = true;`,
  ],
  [
    `            delete currentData[provider];\n            this.data = currentData;\n            return { result: undefined, next: JSON.stringify(currentData, null, 2) };`,
    `            delete currentData[provider];\n            this.data = currentData;\n            this.initialized = true;\n            return { result: undefined, next: JSON.stringify(currentData, null, 2) };`,
  ],
  [
    `    async list() {\n        return Object.entries(this.data).map(([providerId, credential]) => ({ providerId, type: credential.type }));\n    }`,
    `    async list() {\n        await this.ensureInitialized();\n        return Object.entries(this.data).map(([providerId, credential]) => ({ providerId, type: credential.type }));\n    }`,
  ],
];
const ORIGINAL_SHA256 = [
  // Reviewed against @earendil-works/pi-coding-agent@0.83.0.
  '756abf2ee1e7de77189aeb92408430ac8fe012fcc06681af055de44fab7898b3',
  'ea0c3482991486b338b875c21b98b728dfa89bca0986111f58ce57d7198dae41',
  '1bc040e70ac1980bc22df87a9afb637af1033d90b1902d74cae05b26b8120421',
  'e59bb599e4b51eb52cd0d27389273e008590b51b875391ba8109cec1c767ab51',
  'c0e817afd4bd2fef1ba0bc98783d67e5259ed58625a4d1e13ae751a99d1b74a5',
  'c77214bfba5670a568f2f41288598d4f25ed32c0cbb532b9d94c1711f58eb2b5',
];
const PATCHED_SHA256 = [
  '52c8321d5d4287c99c66cfde24237cb3316d3432e83fa37aefae586fb6b1ff8a',
  'eb0c3c6afeb9ade1a74bf9c72f529f59cdb82fbc836b8ad973ecb659957131c4',
  '9c3e36e60e40bc9c80770d71a0e9aa5ce33b8b09d17b57eb302f5eb6437742f5',
  'a9eca5f78e65a97b85ed647e3b0cadab44cbf7c4a7a30ce59ce3cee2af6962f7',
  '949618f8a00348a2090b14a6f2b5fb8fa6c07a026a6d307afc839bc26e764b31',
  'e5a3addf8390389529283d461592fb1b687981dcee7a2ef4e82a03c326ca5454',
];

function npmInvocation(platform = process.platform) {
  return platform === 'win32' ? { command: 'npm.cmd', shell: true } : { command: 'npm', shell: false };
}

function npmGlobalNodeModulesRoot() {
  try {
    const { command, shell } = npmInvocation();
    const root = execFileSync(command, ['root', '-g'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], shell,
    }).trim();
    if (!root) throw new Error('empty root');
    return root;
  } catch {
    throw new Error('global package root unavailable');
  }
}

function packageRootFromArgs(argv, resolveRoot = npmGlobalNodeModulesRoot) {
  if (argv.length === 0) return path.join(resolveRoot(), '@earendil-works', 'pi-coding-agent');
  if (argv.length === 2 && argv[0] === '--package-root' && path.isAbsolute(argv[1])) return argv[1];
  throw new Error('unsupported arguments');
}

function replaceExactlyOnce(source, oldText, newText, index) {
  const oldCount = source.split(oldText).length - 1;
  const newCount = source.split(newText).length - 1;
  if (oldCount === 1 && newCount === 0) {
    if (createHash('sha256').update(oldText).digest('hex') !== ORIGINAL_SHA256[index]) {
      throw new Error(`reviewed anchor ${index + 1} digest mismatch`);
    }
    return source.replace(oldText, newText);
  }
  if (oldCount === 0 && newCount === 1) {
    if (createHash('sha256').update(newText).digest('hex') !== PATCHED_SHA256[index]) {
      throw new Error(`patched anchor ${index + 1} digest mismatch`);
    }
    return source;
  }
  throw new Error(`anchor ${index + 1} cardinality/drift mismatch`);
}

async function patch(packageRoot) {
  const packageStat = await lstat(packageRoot);
  if (!packageStat.isDirectory()) throw new Error('package root must be a regular directory');
  const metadataStat = await lstat(path.join(packageRoot, 'package.json'));
  if (!metadataStat.isFile()) throw new Error('package metadata must be a regular file');
  const metadata = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));
  if (metadata.name !== PACKAGE_NAME || metadata.version !== PACKAGE_VERSION) {
    throw new Error(`package identity/version mismatch; expected ${PACKAGE_NAME}@${PACKAGE_VERSION}`);
  }

  const targetPath = path.join(packageRoot, TARGET);
  const targetStat = await lstat(targetPath);
  if (!targetStat.isFile() || targetStat.nlink !== 1) {
    throw new Error('target must be a regular, non-symlink, singly linked file');
  }
  const original = await readFile(targetPath);
  const source = original.toString('utf8');
  if (!Buffer.from(source, 'utf8').equals(original)) throw new Error('target is not valid UTF-8');
  let output = source;
  for (const [index, [before, after]] of ANCHORS.entries()) {
    output = replaceExactlyOnce(output, before, after, index);
  }
  if (output === source) return false;
  for (const [, patched] of ANCHORS) {
    if (output.split(patched).length - 1 !== 1) throw new Error('patched output verification failed');
  }

  const mode = targetStat.mode & 0o7777;
  const temporaryDirectory = await mkdtemp(path.join(path.dirname(targetPath), '.pi-auth-load-recovery-'));
  const temporaryPath = path.join(temporaryDirectory, path.basename(targetPath));
  try {
    await writeFile(temporaryPath, output, { mode, flag: 'wx' });
    await chmod(temporaryPath, mode);
    const handle = await open(temporaryPath, 'r+');
    try { await handle.sync(); } finally { await handle.close(); }
    if ((await lstat(temporaryPath)).nlink !== 1 || (await readFile(temporaryPath, 'utf8')) !== output) {
      throw new Error('temporary output verification failed');
    }
    await rename(temporaryPath, targetPath);
    const writtenStat = await lstat(targetPath);
    if (!writtenStat.isFile() || writtenStat.nlink !== 1 || (writtenStat.mode & 0o7777) !== mode
        || (await readFile(targetPath, 'utf8')) !== output) {
      throw new Error('patched target verification failed');
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
  return true;
}

async function main() {
  try {
    const changed = await patch(packageRootFromArgs(process.argv.slice(2)));
    console.log(changed ? 'Pi 0.83.0 auth-load recovery patch applied.' : 'Pi 0.83.0 auth-load recovery patch already applied.');
  } catch (error) {
    console.error(`Pi 0.83.0 auth-load recovery patch refused: ${error instanceof Error ? error.message : 'unknown refusal'}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

export { PACKAGE_NAME, PACKAGE_VERSION, TARGET, ANCHORS, npmInvocation, npmGlobalNodeModulesRoot, packageRootFromArgs, patch };
