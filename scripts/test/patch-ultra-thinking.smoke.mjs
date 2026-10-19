import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '../..');
const main = await import(pathToFileURL(path.join(root, 'scripts/patch-pi-083-ultra-thinking.mjs')));
const sub = await import(pathToFileURL(path.join(root, 'scripts/patch-pi-subagents-ultra-thinking.mjs')));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'evolvera-ultra-thinking-'));
const piRoot = path.join(temp, 'pi');
const subRoot = path.join(temp, 'subagents');

function writePackage(packageRoot, name, version) {
  fs.mkdirSync(packageRoot, { recursive: true });
  fs.writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({ name, version }));
}

try {
  writePackage(piRoot, main.PACKAGE_NAME, main.PACKAGE_VERSION);
  const grouped = new Map();
  for (const [rel, before] of main.PATCHES) grouped.set(rel, `${grouped.get(rel) ?? ''}${before}\n/* seam */\n`);
  for (const [rel, source] of grouped) { const target = path.join(piRoot, rel); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, source); }

  assert.equal(await main.patch(piRoot), true);
  assert.equal(await main.patch(piRoot), false, 'main patch is not idempotent');
  for (const [rel, before, after] of main.PATCHES) {
    const source = fs.readFileSync(path.join(piRoot, rel), 'utf8');
    if (!after.includes(before)) assert.equal(source.includes(before), false, `${rel}: old anchor remains`);
    assert.equal(source.split(after).length - 1, 1, `${rel}: patched anchor cardinality`);
  }
  assert.equal(main.PULSE_MS, 350);

  writePackage(subRoot, sub.PACKAGE_NAME, sub.PACKAGE_VERSION);
  for (const rel of sub.FILES) { const target = path.join(subRoot, rel); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, `const levels = ${sub.BEFORE};\n`); }
  assert.equal(await sub.patch(subRoot), true);
  assert.equal(await sub.patch(subRoot), false, 'subagent patch is not idempotent');
  for (const rel of sub.FILES) assert.match(fs.readFileSync(path.join(subRoot, rel), 'utf8'), /"max", "ultra"/);

  const drift = path.join(piRoot, main.PATCHES[0][0]);
  fs.writeFileSync(drift, fs.readFileSync(drift, 'utf8').replace(main.PATCHES[0][2], 'drift'));
  const snapshot = new Map([...grouped.keys()].map((rel) => [rel, fs.readFileSync(path.join(piRoot, rel))]));
  await assert.rejects(main.patch(piRoot), /anchor cardinality mismatch/);
  for (const [rel, bytes] of snapshot) assert.deepEqual(fs.readFileSync(path.join(piRoot, rel)), bytes, `${rel}: refusal mutated fixture`);

  const shell = fs.readFileSync(path.join(root, 'install.sh'), 'utf8');
  const powershell = fs.readFileSync(path.join(root, 'install.ps1'), 'utf8');
  assert.ok(shell.indexOf('patch-pi-083-ultra-thinking.mjs') > shell.indexOf('npm install -g --ignore-scripts'));
  assert.ok(shell.indexOf('patch-pi-subagents-ultra-thinking.mjs') > shell.indexOf('pi install npm:@tintinweb/pi-subagents@0.18.2'));
  assert.ok(powershell.indexOf('patch-pi-083-ultra-thinking.mjs') > powershell.indexOf('npm install -g '));
  assert.ok(powershell.indexOf('patch-pi-subagents-ultra-thinking.mjs') > powershell.indexOf('Invoke-PiInstall npm:@tintinweb/pi-subagents@0.18.2'));
  console.log('patch-ultra-thinking smoke: PASS (DISPOSABLE_VERIFIED)');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
