import { access, cp, mkdir, rename, rm } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopDir = path.dirname(fileURLToPath(import.meta.url));
const interfaceDir = path.resolve(desktopDir, '..');
// Runtime files only: server.mjs imports lib-server/ and spawns voice/transcribe_worker.py (cwd = studio dir).
const allowed = ['server.mjs', 'cli.mjs', 'cli-lib.mjs', 'package.json', 'public', 'desktop', 'pi-studio.cmd', 'lib-server', 'voice'];

export async function installPayload(sourceDir, piDir) {
  const source = path.resolve(sourceDir);
  const destination = path.join(path.resolve(piDir), 'studio');
  if (source === destination || destination.startsWith(`${source}${path.sep}`)) {
    throw new Error('PI Studio destination cannot be inside its source tree.');
  }
  await mkdir(path.dirname(destination), { recursive: true });
  const staged = `${destination}.stage-${randomUUID()}`;
  const backup = `${destination}.backup-${randomUUID()}`;
  await mkdir(staged);
  let movedOld = false;
  try {
    for (const item of allowed) {
      const sourceItem = path.join(source, item);
      await access(sourceItem, fsConstants.F_OK);
      await cp(sourceItem, path.join(staged, item), { recursive: true });
    }
    try {
      await access(destination, fsConstants.F_OK);
      await rename(destination, backup);
      movedOld = true;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    try {
      await rename(staged, destination);
    } catch (error) {
      if (movedOld) await rename(backup, destination);
      movedOld = false;
      throw error;
    }
    if (movedOld) {
      movedOld = false;
      await rm(backup, { recursive: true, force: true }).catch(() => {});
    }
    return destination;
  } finally {
    await rm(staged, { recursive: true, force: true });
    if (movedOld) await rename(backup, destination);
  }
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
