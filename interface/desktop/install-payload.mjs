import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopDir = path.dirname(fileURLToPath(import.meta.url));
const interfaceDir = path.resolve(desktopDir, '..');
const allowed = ['server.mjs', 'cli.mjs', 'cli-lib.mjs', 'package.json', 'public', 'desktop', 'pi-studio.cmd'];

export async function installPayload(sourceDir, piDir) {
  const source = path.resolve(sourceDir);
  const destination = path.join(path.resolve(piDir), 'studio');
  if (source === destination || destination.startsWith(`${source}${path.sep}`)) {
    throw new Error('PI Studio destination cannot be inside its source tree.');
  }
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  for (const item of allowed) {
    await cp(path.join(source, item), path.join(destination, item), { recursive: true });
  }
  return destination;
}

export async function installPayloadCommand(args, output = console) {
  const [sourceDir = interfaceDir, piDir] = args;
  if (!piDir) {
    output.error('Usage: node install-payload-cli.mjs <interface-dir> <pi-agent-dir>');
    return 2;
  }
  try {
    output.log(await installPayload(sourceDir, piDir));
    return 0;
  } catch (error) {
    output.error(error.message);
    return 1;
  }
}
