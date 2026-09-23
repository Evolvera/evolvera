#!/usr/bin/env node
import { chmod, lstat, mkdtemp, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_NAME = '@tintinweb/pi-subagents';
const PACKAGE_VERSION = '0.18.2';
const FILES = ['src/index.ts', 'dist/index.js'];
const BEFORE = '["off", "minimal", "low", "medium", "high", "xhigh", "max"]';
const AFTER = '["off", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"]';

function resolveRoot(argv, env = process.env) {
  if (!argv.length) return path.join(env.PI_CODING_AGENT_DIR || path.join(os.homedir(), '.pi', 'agent'), 'npm', 'node_modules', '@tintinweb', 'pi-subagents');
  if (argv.length === 2 && argv[0] === '--package-root' && path.isAbsolute(argv[1])) return argv[1];
  throw new Error('unsupported arguments');
}
async function stage(target, bytes, mode) {
  const dir = await mkdtemp(path.join(path.dirname(target), '.pi-subagents-ultra-'));
  const file = path.join(dir, path.basename(target));
  await writeFile(file, bytes, { flag: 'wx', mode }); await chmod(file, mode);
  const h = await open(file, 'r+'); try { await h.sync(); } finally { await h.close(); }
  return { dir, file };
}
async function patch(root, { renameFile = rename } = {}) {
  const meta = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  if (meta.name !== PACKAGE_NAME || meta.version !== PACKAGE_VERSION) throw new Error('package identity mismatch');
  const targets = [];
  for (const rel of FILES) {
    const target = path.join(root, rel); const stat = await lstat(target); const original = await readFile(target); const source = original.toString('utf8');
    const beforeCount = source.split(BEFORE).length - 1, afterCount = source.split(AFTER).length - 1;
    if (beforeCount === 1 && afterCount === 0) targets.push({ target, rel, original, output: Buffer.from(source.replace(BEFORE, AFTER)), mode: stat.mode & 0o7777, changed: true });
    else if (beforeCount === 0 && afterCount === 1) targets.push({ target, rel, original, output: original, mode: stat.mode & 0o7777, changed: false });
    else throw new Error(`anchor cardinality mismatch: ${rel}`);
  }
  const changed = targets.filter((t) => t.changed); if (!changed.length) return false;
  const staged = [];
  try {
    for (const t of changed) staged.push({ t, next: await stage(t.target, t.output, t.mode), prev: await stage(t.target, t.original, t.mode) });
    const committed = [];
    try { for (const x of staged) { committed.push(x); await renameFile(x.next.file, x.t.target); } }
    catch (error) { for (const x of committed.reverse()) await renameFile(x.prev.file, x.t.target); throw error; }
  } finally { await Promise.all(staged.flatMap((x) => [x.next.dir, x.prev.dir]).map((d) => rm(d, { recursive: true, force: true }))); }
  return true;
}
async function main() {
  try { const changed = await patch(resolveRoot(process.argv.slice(2))); console.log(changed ? 'pi-subagents ultra-thinking patch applied.' : 'pi-subagents ultra-thinking patch already applied.'); }
  catch (error) { console.error(`pi-subagents ultra-thinking patch refused: ${error instanceof Error ? error.message : 'unknown error'}`); process.exitCode = 1; }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
export { PACKAGE_NAME, PACKAGE_VERSION, FILES, BEFORE, AFTER, patch, resolveRoot };
