#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PACKAGE_NAME, PACKAGE_VERSION, patch as patchCanonical } from './patch-rpiv-todo-hud.mjs';

export { PACKAGE_NAME, PACKAGE_VERSION };
export function packageRootFromArgs(argv) {
  const value = argv.length === 2 && argv[0] === '--package-root' ? argv[1] : process.env.RPIV_TODO_PACKAGE_ROOT;
  if (argv.length && !(argv.length === 2 && argv[0] === '--package-root')) throw new Error('unsupported arguments');
  if (!value || !path.isAbsolute(value)) throw new Error('set RPIV_TODO_PACKAGE_ROOT or pass --package-root <absolute-dir>');
  return value;
}
export async function patchPackageRoot(root, options) {
  return patchCanonical(root, options);
}
async function main() {
  try {
    console.log(await patchPackageRoot(packageRootFromArgs(process.argv.slice(2)))
      ? 'rpiv-todo ETA patch applied.'
      : 'rpiv-todo ETA patch already applied.');
  } catch (error) {
    console.error(`rpiv-todo ETA patch refused: ${error instanceof Error ? error.message : 'unknown refusal'}`);
    process.exitCode = 1;
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
