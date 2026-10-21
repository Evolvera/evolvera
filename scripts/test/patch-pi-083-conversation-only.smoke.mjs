import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import childProcess, { spawnSync } from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';

const root = path.resolve(import.meta.dirname, '../..');
const patcher = await import(pathToFileURL(path.join(root, 'scripts/patch-pi-083-conversation-only.mjs')));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'evolvera-conversation-only-'));
const packageRoot = path.join(temp, 'pi-fixture');

try {
  fs.mkdirSync(packageRoot, { recursive: true });
  fs.writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({ name: patcher.PACKAGE_NAME, version: patcher.PACKAGE_VERSION }));
  const grouped = new Map();
  for (const [rel, before] of patcher.PATCHES) grouped.set(rel, `${grouped.get(rel) ?? ''}${before}\n/* seam */\n`);
  for (const [rel, source] of grouped) {
    const target = path.join(packageRoot, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, source);
  }

  const modeTarget = path.join(packageRoot, 'dist/modes/interactive/interactive-mode.js');
  fs.chmodSync(modeTarget, 0o640);
  const originalMode = fs.statSync(modeTarget).mode & 0o777;
  assert.equal(patcher.anchorsDigest(1), patcher.UNPATCHED_SHA256);
  assert.equal(patcher.anchorsDigest(2), patcher.PATCHED_SHA256);
  assert.ok(patcher.PATCHES.every(([, before, after]) => before !== after), 'fixed patch anchors must differ');

  assert.equal(patcher.resolveRoot(['--package-root', packageRoot]), packageRoot);
  assert.throws(() => patcher.resolveRoot(['--unsupported']), /unsupported arguments/);
  assert.throws(() => patcher.resolveRoot(['--unsupported', packageRoot]), /unsupported arguments/);
  assert.throws(() => patcher.resolveRoot(['--package-root', 'relative-root']), /unsupported arguments/);
  const fakeNpmRoot = path.join(temp, 'synthetic-npm-root');
  const fakeBin = path.join(temp, 'fake-bin');
  fs.mkdirSync(fakeBin);
  const fakeNpm = process.platform === 'win32' ? path.join(fakeBin, 'npm.cmd') : path.join(fakeBin, 'npm');
  fs.writeFileSync(fakeNpm, process.platform === 'win32'
    ? `@echo off\r\necho ${fakeNpmRoot}\r\n`
    : `#!/bin/sh\nprintf '%s\\n' '${fakeNpmRoot.replaceAll("'", "'\\''")}'\n`);
  if (process.platform !== 'win32') fs.chmodSync(fakeNpm, 0o755);
  const originalPath = process.env.PATH;
  try {
    if (process.platform === 'win32') assert.equal(fs.existsSync(path.join(root, 'npm.cmd')), false, 'project-root npm.cmd could shadow the fixture command');
    process.env.PATH = fakeBin;
    assert.equal(patcher.resolveRoot([]), path.join(fakeNpmRoot, '@earendil-works', 'pi-coding-agent'));
  } finally {
    if (originalPath === undefined) delete process.env.PATH;
    else process.env.PATH = originalPath;
  }
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  const originalExecFileSync = childProcess.execFileSync;
  try {
    Object.defineProperty(process, 'platform', { ...originalPlatform, value: 'linux' });
    childProcess.execFileSync = (command, args, options) => {
      assert.equal(command, 'npm');
      assert.deepEqual(args, ['root', '-g']);
      assert.equal(options.shell, false);
      assert.equal(options.encoding, 'utf8');
      return `${fakeNpmRoot}\n`;
    };
    syncBuiltinESMExports();
    assert.equal(patcher.resolveRoot([]), path.join(fakeNpmRoot, '@earendil-works', 'pi-coding-agent'));
  } finally {
    Object.defineProperty(process, 'platform', originalPlatform);
    childProcess.execFileSync = originalExecFileSync;
    syncBuiltinESMExports();
  }
  const firstPatch = patcher.PATCHES[0];
  const firstAnchor = firstPatch[1];
  firstPatch[1] = `${firstAnchor} altered`;
  await assert.rejects(patcher.patch(packageRoot), /anchor hash mismatch/);
  firstPatch[1] = firstAnchor;
  assert.equal(await patcher.patch(packageRoot), true);
  assert.equal(fs.statSync(modeTarget).mode & 0o777, originalMode, 'patch changed file mode');
  assert.equal(await patcher.patch(packageRoot), false, 'patch is not idempotent');
  const mixedRoot = path.join(temp, 'mixed-anchor-fixture');
  fs.mkdirSync(mixedRoot, { recursive: true });
  fs.writeFileSync(path.join(mixedRoot, 'package.json'), JSON.stringify({ name: patcher.PACKAGE_NAME, version: patcher.PACKAGE_VERSION }));
  for (const [rel, source] of grouped) {
    const target = path.join(mixedRoot, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, rel === patcher.PATCHES[0][0] ? `${source}${patcher.PATCHES[0][2]}\n` : source);
  }
  assert.equal(await patcher.patch(mixedRoot), true, 'mixed before/after anchors were not resolved');
  const mixedTool = fs.readFileSync(path.join(mixedRoot, patcher.PATCHES[0][0]), 'utf8');
  assert.equal(mixedTool.split(patcher.PATCHES[0][2]).length - 1, 2, 'mixed anchor fixture output changed unexpectedly');
  const tool = fs.readFileSync(path.join(packageRoot, 'dist/modes/interactive/components/tool-execution.js'), 'utf8');
  const mode = fs.readFileSync(path.join(packageRoot, 'dist/modes/interactive/interactive-mode.js'), 'utf8');
  assert.match(tool, /if \(this\.conversationFocus\) \{\s*return \[\];\s*\}/);
  assert.match(mode, /toggleToolConversationFocus\(\) \{[\s\S]*?this\.rebuildChatFromMessages\(\);[\s\S]*?setHideThinkingBlock\(this\.hideThinkingBlock \|\| this\.toolsConversationFocus\)/);
  assert.match(mode, /new AssistantMessageComponent\(undefined, this\.hideThinkingBlock \|\| this\.toolsConversationFocus/);
  assert.match(mode, /new AssistantMessageComponent\(message, this\.hideThinkingBlock \|\| this\.toolsConversationFocus/);
  assert.match(mode, /setHideThinkingBlock\(this\.hideThinkingBlock \|\| this\.toolsConversationFocus\)/);
  const toggle = mode.match(/toggleToolConversationFocus\(\) \{([\s\S]*?)\n    \}/)?.[1];
  assert.ok(toggle);
  assert.doesNotMatch(toggle, /settingsManager|sessionManager|executeTool/);
  assert.match(toggle, /tools and thinking hidden/);
  assert.doesNotMatch(toggle, /app\.tools\.reveal/);

  const rollbackRoot = path.join(temp, 'rollback-fixture');
  fs.mkdirSync(rollbackRoot, { recursive: true });
  fs.writeFileSync(path.join(rollbackRoot, 'package.json'), JSON.stringify({ name: patcher.PACKAGE_NAME, version: patcher.PACKAGE_VERSION }));
  for (const [rel, source] of grouped) {
    const target = path.join(rollbackRoot, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, source);
  }
  const rollbackModeTargets = [...grouped.keys()].map((rel) => path.join(rollbackRoot, rel));
  for (const target of rollbackModeTargets) fs.chmodSync(target, 0o640);
  const rollbackBefore = new Map(rollbackModeTargets.map((target) => [target, {
    bytes: fs.readFileSync(target),
    mode: fs.statSync(target).mode & 0o777,
  }]));
  let renameCalls = 0;
  await assert.rejects(patcher.patch(rollbackRoot, {
    renameFile: async (from, to) => {
      renameCalls += 1;
      if (renameCalls === 2) throw new Error('simulated staged rename failure');
      await fs.promises.rename(from, to);
    },
  }), /simulated staged rename failure/);
  assert.equal(renameCalls, 4, 'rollback did not restore all committed entries after the staged failure');
  for (const [target, snapshot] of rollbackBefore) {
    assert.deepEqual(fs.readFileSync(target), snapshot.bytes, `${target}: rollback did not restore bytes`);
    assert.equal(fs.statSync(target).mode & 0o777, snapshot.mode, `${target}: rollback did not restore mode`);
    assert.deepEqual(fs.readdirSync(path.dirname(target)).filter((name) => name.startsWith('.pi-conversation-only-')), [], `${target}: staging directory leaked`);
  }
  let verificationRenameCalls = 0;
  await assert.rejects(patcher.patch(rollbackRoot, {
    renameFile: async (from, to) => {
      verificationRenameCalls += 1;
      await fs.promises.rename(from, to);
      if (verificationRenameCalls === 1) await fs.promises.writeFile(to, 'verification mismatch');
    },
  }), /verification failed/);
  assert.equal(verificationRenameCalls, 2, 'verification failure did not restore the replaced target');
  for (const [target, snapshot] of rollbackBefore) assert.deepEqual(fs.readFileSync(target), snapshot.bytes, `${target}: verification rollback did not restore bytes`);

  const nonFileRoot = path.join(temp, 'non-file-fixture');
  fs.mkdirSync(path.join(nonFileRoot, path.dirname(patcher.PATCHES[0][0])), { recursive: true });
  fs.writeFileSync(path.join(nonFileRoot, 'package.json'), JSON.stringify({ name: patcher.PACKAGE_NAME, version: patcher.PACKAGE_VERSION }));
  fs.mkdirSync(path.join(nonFileRoot, patcher.PATCHES[0][0]));
  await assert.rejects(patcher.patch(nonFileRoot), /target is not a regular file/);

  const cliRoot = path.join(temp, 'cli-fixture');
  fs.mkdirSync(cliRoot, { recursive: true });
  fs.writeFileSync(path.join(cliRoot, 'package.json'), JSON.stringify({ name: patcher.PACKAGE_NAME, version: patcher.PACKAGE_VERSION }));
  for (const [rel, source] of grouped) {
    const target = path.join(cliRoot, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, source);
  }
  const patcherPath = path.join(root, 'scripts/patch-pi-083-conversation-only.mjs');
  const importOnly = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(pathToFileURL(patcherPath).href)})`], { encoding: 'utf8' });
  assert.equal(importOnly.status, 0, importOnly.stderr);
  const cliSuccess = spawnSync(process.execPath, [patcherPath, '--package-root', cliRoot], { encoding: 'utf8' });
  assert.equal(cliSuccess.status, 0, cliSuccess.stderr);
  assert.match(cliSuccess.stdout, /patch applied\./);
  const cliIdempotent = spawnSync(process.execPath, [patcherPath, '--package-root', cliRoot], { encoding: 'utf8' });
  assert.equal(cliIdempotent.status, 0, cliIdempotent.stderr);
  assert.match(cliIdempotent.stdout, /patch already applied\./);
  const cliError = spawnSync(process.execPath, [patcherPath, '--unsupported'], { encoding: 'utf8' });
  assert.equal(cliError.status, 1, 'CLI catch path did not set a failing exit code');
  assert.match(cliError.stderr, /patch refused: unsupported arguments/);

  const nonErrorPreloader = path.join(temp, 'force-non-error-instanceof.cjs');
  fs.writeFileSync(nonErrorPreloader, `Object.defineProperty(Error, Symbol.hasInstance, { configurable: true, value: () => false });\n`);
  const cliUnknownError = spawnSync(process.execPath, ['--require', nonErrorPreloader, patcherPath, '--unsupported'], { encoding: 'utf8' });
  assert.equal(cliUnknownError.status, 1, 'CLI generic catch path did not set a failing exit code');
  assert.match(cliUnknownError.stderr, /refused: unknown error/);

  const before = new Map([...grouped.keys()].map((rel) => [rel, fs.readFileSync(path.join(packageRoot, rel))]));
  const metadata = path.join(packageRoot, 'package.json');
  fs.writeFileSync(metadata, JSON.stringify({ name: patcher.PACKAGE_NAME, version: '0.84.0' }));
  await assert.rejects(patcher.patch(packageRoot), /package identity mismatch/);
  for (const [rel, bytes] of before) assert.deepEqual(fs.readFileSync(path.join(packageRoot, rel)), bytes, `${rel}: refusal mutated fixture`);
  fs.writeFileSync(metadata, JSON.stringify({ name: patcher.PACKAGE_NAME, version: patcher.PACKAGE_VERSION }));
  const modePath = path.join(packageRoot, 'dist/modes/interactive/interactive-mode.js');
  fs.writeFileSync(modePath, fs.readFileSync(modePath, 'utf8').replace('tools and thinking hidden', 'drift'));
  const snapshot = new Map([...grouped.keys()].map((rel) => [rel, fs.readFileSync(path.join(packageRoot, rel))]));
  await assert.rejects(patcher.patch(packageRoot), /anchor cardinality mismatch/);
  for (const [rel, bytes] of snapshot) assert.deepEqual(fs.readFileSync(path.join(packageRoot, rel)), bytes, `${rel}: refusal mutated fixture`);
  console.log('patch-pi-083-conversation-only smoke: PASS (fixture-only)');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
