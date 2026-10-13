#!/usr/bin/env node
import { chmod, lstat, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_NAME = '@rahularya01/pi-cursor';
const PACKAGE_VERSION = '1.4.39';
const TARGET = 'dist/index.js';
const REPLACEMENTS = [
  [
    'function _u(e){if(e.parameters.some(t=>t.id==="reasoning"))return "reasoning";if(e.parameters.some(t=>t.id==="effort"))return "effort"}',
    'function _u(e){if(e.parameters.some(t=>t.id==="reasoning"))return "reasoning";if(e.parameters.some(t=>t.id==="effort"))return "effort";if(e.parameters.some(t=>t.id==="reasoning_effort"))return "reasoning_effort"}',
  ],
  ['var ku=/^(cursor-)?grok-4\\.7(-max)?$/','var ku=/^(cursor-)?grok-4\\.7(?:-\\d+[km])?(-max)?$/'],
];

function packageRootFromArgs(argv, env = process.env, home = os.homedir()) {
  if (argv.length === 0) {
    const agent = env.PI_CODING_AGENT_DIR || path.join(home, '.pi', 'agent');
    return path.join(agent, 'npm', 'node_modules', '@rahularya01', 'pi-cursor');
  }
  if (argv.length === 2 && argv[0] === '--package-root' && path.isAbsolute(argv[1])) return argv[1];
  throw new Error('usage: patch-pi-cursor-reasoning-effort.mjs [--package-root ABSOLUTE_PATH]');
}

function replaceExactlyOnce(source, oldText, newText, label) {
  const count = (text) => source.split(text).length - 1;
  const oldCount = count(oldText);
  const newCount = count(newText);
  if (oldCount === 1 && newCount === 0) return source.replace(oldText, newText);
  if (oldCount === 0 && newCount === 1) return source;
  throw new Error(`${label} anchor cardinality/drift mismatch`);
}

async function patch(packageRoot) {
  const packageStat = await lstat(packageRoot);
  if (!packageStat.isDirectory()) throw new Error('package root must be a regular directory');
  const metadataPath = path.join(packageRoot, 'package.json');
  const metadataStat = await lstat(metadataPath);
  if (!metadataStat.isFile()) throw new Error('package metadata must be a regular file');
  const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
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
  // Cursor emits reasoning_effort; its model rows advertise contextual Grok IDs.
  // Refuse unknown package revisions so an update must be reviewed before repatching.
  let output = source;
  for (const [index, [oldText, newText]] of REPLACEMENTS.entries()) {
    output = replaceExactlyOnce(output, oldText, newText, `anchor ${index + 1}`);
  }
  if (output === source) return false;

  const mode = targetStat.mode & 0o7777;
  const temporaryDirectory = await mkdtemp(path.join(path.dirname(targetPath), '.pi-cursor-reasoning-effort-'));
  const temporaryPath = path.join(temporaryDirectory, path.basename(targetPath));
  try {
    await writeFile(temporaryPath, output, { mode, flag: 'wx' });
    await chmod(temporaryPath, mode);
    await rename(temporaryPath, targetPath);
    const writtenStat = await lstat(targetPath);
    const written = await readFile(targetPath);
    if (!writtenStat.isFile() || writtenStat.nlink !== 1 || (writtenStat.mode & 0o7777) !== mode
        || !written.equals(Buffer.from(output, 'utf8'))) {
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
    console.log(changed ? 'Cursor reasoning-effort compatibility patch applied.' : 'Cursor reasoning-effort compatibility patch already applied.');
  } catch (error) {
    console.error(`Cursor reasoning-effort patch refused: ${error instanceof Error ? error.message : 'unknown refusal'}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

export { PACKAGE_NAME, PACKAGE_VERSION, TARGET, REPLACEMENTS, packageRootFromArgs, patch };
