#!/usr/bin/env node
/**
 * Orca fullscreen-lag mitigation for @earendil-works/pi-tui 1.2.0 and 1.3.0.
 *
 * Why: the fullscreen renderer writes every changed row as `ESC[<row>;1H ESC[2K <text>`.
 * Orca's main-process terminal-tail parser drops CUP (`H`) but keeps `ESC[2K`, so its virtual
 * cursor column never returns to 0. Each row is then left-padded with the accumulated width of
 * all previous rows, and Orca trims that row with `/[ \t]+$/`, which is quadratic on long space
 * runs. Measured with Orca 1.4.192's own tail code: ~86 ms (worst ~172 ms) of Orca main-thread
 * time per PI frame, which stalls input/output for every Orca terminal.
 *
 * Fix: emit `\r` before each absolute cursor position. CR followed by CUP leaves the real terminal
 * screen and cursor identical (CUP overrides the column; no cell is printed in between), while
 * Orca's parser resets its column to 0, so the per-frame cost drops to ~0.2 ms.
 *
 * Fail-closed: only exact pristine source files published in supported releases are patched; an already-patched file is a no-op;
 * any other content is refused without writing.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstat, readFile, rename, writeFile, chmod, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PI_PACKAGE_NAME = '@earendil-works/pi-coding-agent';
export const PI_PACKAGE_VERSION = '1.2.0';
export const TUI_PACKAGE_NAME = '@earendil-works/pi-tui';
export const TUI_PACKAGE_VERSION = '1.2.0';
export const SUPPORTED_PACKAGE_VERSIONS = Object.freeze(['1.2.0', '1.3.0', '1.4.0']);
export const TARGET_RELATIVE_PATH = 'node_modules/@earendil-works/pi-tui/dist/tui-alt-screen.js';
export const UNPATCHED_SHA256 = 'aa0b953c0158357d20a1d6f868cd4d7b667fd6646848a788ffded9808c9ef720';
export const PATCHED_SHA256 = '4266c1e4239c8b39d17b9b62e3421b349b81c928244ad32f70786db30ec60ce0';
export const VERSIONED_PINS = Object.freeze({
  '1.2.0': { unpatched: UNPATCHED_SHA256, patched: PATCHED_SHA256 },
  '1.3.0': { unpatched: UNPATCHED_SHA256, patched: PATCHED_SHA256 },
  '1.4.0': {
    unpatched: 'ea5f52dc983f60c4354c674bd19f0d296fda8b5fa86185d4a4bdf0343b1ff92b',
    patched: 'ae1456234e4b6008af27ccaaf14888f83bf0f99d88cdccd8469d5e9c2157ce01',
  },
});

// Literal source text (the file contains the two-character escape `\x1b`, not ESC).
export const REPLACEMENTS = [
  { from: 'buffer += `\\x1b[${row + 1};1H', to: 'buffer += `\\r\\x1b[${row + 1};1H', count: 4 },
  { from: 'buffer += `\\x1b[${cursorPos.row + 1};', to: 'buffer += `\\r\\x1b[${cursorPos.row + 1};', count: 1 },
];

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function countOccurrences(source, value) {
  let count = 0;
  for (let index = source.indexOf(value); index >= 0; index = source.indexOf(value, index + value.length)) count += 1;
  return count;
}

export function patchSource(source) {
  let next = source;
  for (const { from, to, count } of REPLACEMENTS) {
    const found = countOccurrences(next, from);
    if (found !== count) throw new Error(`anchor count mismatch (${found} != ${count}): ${from}`);
    next = next.split(from).join(to);
  }
  return next;
}

async function readPackageVersion(root, expectedName) {
  const metadata = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  if (metadata.name !== expectedName) throw new Error(`unexpected package at ${root}: ${metadata.name}`);
  return metadata.version;
}

function defaultPackageRoot() {
  const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const root = execFileSync(command, ['root', '-g'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], shell: process.platform === 'win32' }).trim();
  return path.join(root, ...PI_PACKAGE_NAME.split('/'));
}

/** Returns { status: 'patched' | 'already-patched' | 'skipped', reason?, target? }. Throws on unknown content. */
export async function applyPatch({ packageRoot = defaultPackageRoot(), pins } = {}) {
  const piVersion = await readPackageVersion(packageRoot, PI_PACKAGE_NAME);
  if (!SUPPORTED_PACKAGE_VERSIONS.includes(piVersion)) return { status: 'skipped', reason: `${PI_PACKAGE_NAME}@${piVersion} is unsupported` };
  const tuiRoot = path.join(packageRoot, 'node_modules', ...TUI_PACKAGE_NAME.split('/'));
  const tuiVersion = await readPackageVersion(tuiRoot, TUI_PACKAGE_NAME);
  if (!SUPPORTED_PACKAGE_VERSIONS.includes(tuiVersion) || tuiVersion !== piVersion) return { status: 'skipped', reason: `${TUI_PACKAGE_NAME}@${tuiVersion} is unsupported for ${PI_PACKAGE_NAME}@${piVersion}` };

  pins ??= VERSIONED_PINS[piVersion];

  const target = path.join(packageRoot, ...TARGET_RELATIVE_PATH.split('/'));
  const stat = await lstat(target);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`target is not a regular file: ${target}`);
  const bytes = await readFile(target);
  const source = bytes.toString('utf8');
  const digest = sha256(bytes);
  if (digest === pins.patched) return { status: 'already-patched', target };
  if (digest !== pins.unpatched) throw new Error(`refusing to patch unrecognized ${TARGET_RELATIVE_PATH} (sha256 ${digest})`);
  const patched = patchSource(source);
  if (sha256(patched) !== pins.patched) throw new Error('patched output does not match the expected sha256');
  const temporary = `${target}.orca-redraw-${process.pid}.tmp`;
  try {
    await writeFile(temporary, patched, { flag: 'wx' });
    await chmod(temporary, stat.mode & 0o7777);
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
  return { status: 'patched', target };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rootFlag = process.argv.indexOf('--root');
  const packageRoot = rootFlag > 0 ? process.argv[rootFlag + 1] : undefined;
  applyPatch(packageRoot ? { packageRoot } : {})
    .then((result) => console.log(`pi-tui Orca redraw patch: ${result.status}${result.reason ? ` (${result.reason})` : ''}${result.target ? ` ${result.target}` : ''}`))
    .catch((error) => { console.error(`pi-tui Orca redraw patch failed: ${error.message}`); process.exitCode = 1; });
}
