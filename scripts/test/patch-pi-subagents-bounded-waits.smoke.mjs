import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolvePiSdkRoot } from '../../extensions/test/lib/pi-sdk.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const smokeStartedAt = Date.now();
const patcher = await import(pathToFileURL(path.join(root, 'scripts/patch-pi-subagents-bounded-waits.mjs')));
const installed = patcher.resolveRoot([]);
const sdkRoot = resolvePiSdkRoot(import.meta.url);
const { createBashToolDefinition } = await import(pathToFileURL(path.join(sdkRoot, 'dist/core/tools/bash.js')));
const sdkApi = await import(pathToFileURL(path.join(sdkRoot, 'dist/index.js')));
assert.equal(typeof sdkApi.createBashToolDefinition, 'function', 'public SDK index exports the definition factory');
const { createAgentSession, DefaultResourceLoader, SessionManager, SettingsManager } = sdkApi;
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'evolvera-bounded-waits-'));

function copyPackage(source, target) {
  fs.cpSync(source, target, { recursive: true });
}
function normalizePatch(packageRoot) {
  let patched = true;
  for (const rel of new Set(patcher.PATCHES.map(([file]) => file))) {
    let source = fs.readFileSync(path.join(packageRoot, rel), 'utf8');
    const edits = patcher.PATCHES.filter(([file]) => file === rel).reverse();
    for (const [, before, after, insertion] of edits) {
      const afterCount = source.split(after).length - 1;
      const beforeCount = source.split(before).length - 1;
      if (insertion) {
        if (afterCount === 1) source = `${source.replace(after, '').trimEnd()}\n`;
        else if (afterCount === 0) patched = false;
        else throw new Error(`cannot normalize ${rel}: patch anchor is mixed or drifted`);
      } else if (afterCount === 1) source = source.replace(after, () => before);
      else if (afterCount === 0 && beforeCount === 1) patched = false;
      else throw new Error(`cannot normalize ${rel}: patch anchor is mixed or drifted`);
    }
    fs.writeFileSync(path.join(packageRoot, rel), source);
  }
  return patched;
}
function linkRuntimeDependencies(packageRoot) {
  const npmModules = path.resolve(installed, '../../../node_modules');
  const target = path.join(packageRoot, 'node_modules');
  fs.mkdirSync(path.join(target, '@earendil-works'), { recursive: true });
  for (const entry of fs.readdirSync(npmModules, { withFileTypes: true })) {
    const to = path.join(target, entry.name);
    if (entry.name === '@earendil-works') {
      for (const sdkEntry of fs.readdirSync(path.join(npmModules, entry.name), { withFileTypes: true })) {
        fs.symlinkSync(path.join(npmModules, entry.name, sdkEntry.name), path.join(target, entry.name, sdkEntry.name), 'dir');
      }
      fs.symlinkSync(sdkRoot, path.join(target, entry.name, 'pi-coding-agent'), 'dir');
    } else {
      fs.symlinkSync(path.join(npmModules, entry.name), to, entry.isDirectory() ? 'dir' : 'file');
    }
  }
}
function instrumentSignal() {
  const controller = new AbortController();
  const adds = new Set(), removed = new Set();
  const signal = controller.signal;
  const add = signal.addEventListener.bind(signal), remove = signal.removeEventListener.bind(signal);
  signal.addEventListener = (name, fn, options) => { if (name === 'abort') adds.add(fn); return add(name, fn, options); };
  signal.removeEventListener = (name, fn) => { if (name === 'abort') removed.add(fn); return remove(name, fn); };
  return { controller, signal, adds, removed };
}

try {
  const meta = JSON.parse(fs.readFileSync(path.join(installed, 'package.json'), 'utf8'));
  assert.equal(meta.version, patcher.PACKAGE_VERSION);
  const fixture = path.join(temp, 'pkg');
  copyPackage(installed, fixture);
  normalizePatch(fixture); // reverse only this patch's edits; retain ultra-thinking/deferred-nudges.
  const normalizedIndex = fs.readFileSync(path.join(fixture, 'src/index.ts'), 'utf8');
  assert.match(normalizedIndex, /Deferred completion notifications \(Evolvera patch v2\)/);
  assert.match(normalizedIndex, /"max", "ultra"/);
  const patchedInput = path.join(temp, 'already-patched'); copyPackage(fixture, patchedInput);
  assert.equal(await patcher.patch(patchedInput), true, 'patch applies to pristine synthetic input');
  const patchedBytes = new Map([...new Set(patcher.PATCHES.map(([file]) => file))].map(rel => [rel, fs.readFileSync(path.join(patchedInput, rel))]));
  assert.equal(await patcher.patch(patchedInput), false, 'already-patched package is an idempotent no-op');
  for (const [rel, bytes] of patchedBytes) assert.deepEqual(fs.readFileSync(path.join(patchedInput, rel)), bytes);
  assert.equal(await patcher.patch(fixture), true, 'patch applies to normalized unpatched package');
  assert.equal(await patcher.patch(fixture), false, 'patch is idempotent');
  const fixtureMetaPath = path.join(fixture, 'package.json');
  const fixtureMeta = JSON.parse(fs.readFileSync(fixtureMetaPath, 'utf8'));
  fixtureMeta.type = 'module'; fs.writeFileSync(fixtureMetaPath, JSON.stringify(fixtureMeta));
  linkRuntimeDependencies(fixture);
  for (const rel of new Set(patcher.PATCHES.map(([file]) => file))) {
    if (rel.endsWith('.js')) execFileSync(process.execPath, ['--check', path.join(fixture, rel)]);
    else if (rel.endsWith('.ts')) {
      const checkFile = path.join(temp, `${path.basename(rel, '.ts')}.mts`);
      fs.copyFileSync(path.join(fixture, rel), checkFile);
      execFileSync(process.execPath, ['--experimental-strip-types', '--check', checkFile], { stdio: 'pipe' });
    }
  }

  // Identity and anchor failures are preflighted before any package bytes change.
  const wrongVersion = path.join(temp, 'wrong-version'); copyPackage(fixture, wrongVersion);
  fs.writeFileSync(path.join(wrongVersion, 'package.json'), JSON.stringify({ name: patcher.PACKAGE_NAME, version: '0.18.3' }));
  const versionBefore = fs.readFileSync(path.join(wrongVersion, 'src/index.ts'));
  await assert.rejects(patcher.patch(wrongVersion), /package identity mismatch/);
  assert.deepEqual(fs.readFileSync(path.join(wrongVersion, 'src/index.ts')), versionBefore);
  const drift = path.join(temp, 'drift'); copyPackage(fixture, drift); normalizePatch(drift);
  fs.writeFileSync(path.join(drift, 'dist/nested-tools.js'), fs.readFileSync(path.join(drift, 'dist/nested-tools.js'), 'utf8').replace('formatRecord(record, "fetched")', 'formatRecord(record, "drifted")'));
  const driftBefore = new Map([...new Set(patcher.PATCHES.map(([file]) => file))].map(rel => [rel, fs.readFileSync(path.join(drift, rel))]));
  await assert.rejects(patcher.patch(drift), /anchor cardinality mismatch/);
  for (const [rel, bytes] of driftBefore) assert.deepEqual(fs.readFileSync(path.join(drift, rel)), bytes, `preflight left ${rel} untouched`);

  // Simulated mid-commit rename failure restores every already-replaced file.
  const rollback = path.join(temp, 'rollback'); copyPackage(fixture, rollback); normalizePatch(rollback);
  const rollbackBefore = new Map([...new Set(patcher.PATCHES.map(([file]) => file))].map(rel => [rel, fs.readFileSync(path.join(rollback, rel))]));
  let renames = 0;
  await assert.rejects(patcher.patch(rollback, { renameFile: async (from, to) => {
    renames++;
    if (renames === 2) throw new Error('synthetic rename failure');
    return fs.promises.rename(from, to);
  }}), /synthetic rename failure/);
  for (const [rel, bytes] of rollbackBefore) assert.deepEqual(fs.readFileSync(path.join(rollback, rel)), bytes, `rollback restored ${rel}`);

  // Queue -> running uses one shared deadline; completion afterwards stays deliverable.
  const waitModule = await import(pathToFileURL(path.join(fixture, 'dist/abortable.js')) + `?test=${Date.now()}`);
  const nativeSetTimeout = globalThis.setTimeout, nativeClearTimeout = globalThis.clearTimeout;
  const activeTimers = new Set();
  globalThis.setTimeout = (fn, delay, ...args) => {
    let handle;
    handle = nativeSetTimeout(() => { activeTimers.delete(handle); fn(...args); }, delay);
    activeTimers.add(handle); return handle;
  };
  globalThis.clearTimeout = (handle) => { activeTimers.delete(handle); return nativeClearTimeout(handle); };
  try {
  const queued = { status: 'queued', resultConsumed: false };
  let finish;
  queued.promise = new Promise(resolve => { finish = resolve; });
  const start = Date.now();
  const queuedWait = waitModule.waitForRecord(queued, undefined, 80, 5);
  setTimeout(() => { queued.status = 'running'; }, 25);
  const timedOut = await queuedWait;
  const elapsed = Date.now() - start;
  assert.equal(timedOut, false);
  assert.ok(elapsed >= 60 && elapsed < 180, `queue+run share ~80ms total deadline (elapsed ${elapsed}ms)`);
  assert.equal(queued.status, 'running');
  assert.equal(queued.resultConsumed, false);
  queued.status = 'completed'; finish();
  assert.equal(queued.resultConsumed, false, 'late completion remains unconsumed/deliverable');

  const immediate = { status: 'completed' };
  assert.equal(await waitModule.waitForRecord(immediate, undefined, 80, 5), true);
  const aborting = instrumentSignal();
  const abortWait = waitModule.waitForRecord({ status: 'running', promise: new Promise(() => {}) }, aborting.signal, 500, 5);
  aborting.controller.abort(new Error('cancel wait'));
  await assert.rejects(abortWait, /cancel wait/);
  assert.equal(aborting.adds.size, 1);
  assert.deepEqual(aborting.removed, aborting.adds, 'abort listener removed');
  const timeoutSignal = instrumentSignal();
  assert.equal(await waitModule.waitForRecord({ status: 'running', promise: new Promise(() => {}) }, timeoutSignal.signal, 20, 5), false);
  assert.deepEqual(timeoutSignal.removed, timeoutSignal.adds, 'deadline listener removed');
  assert.equal(activeTimers.size, 0, 'completion, timeout, and abort leave no active wait timers');
  } finally {
    globalThis.setTimeout = nativeSetTimeout; globalThis.clearTimeout = nativeClearTimeout;
  }

  // Exercise the same wrapper contract against the real installed SDK bash tool.
  const runnerSource = fs.readFileSync(path.join(fixture, 'dist/agent-runner.js'), 'utf8');
  assert.match(runnerSource, /toolNames\.includes\("bash"\) && !disallowedSet\?\.has\("bash"\)/);
  assert.match(runnerSource, /settingsManager\.getShellPath\(\)/);
  assert.match(runnerSource, /settingsManager\.getShellCommandPrefix\(\)/);
  assert.match(runnerSource, /customTools: childCustomTools/);
  const nestedSource = fs.readFileSync(path.join(fixture, 'dist/nested-tools.js'), 'utf8');
  assert.doesNotMatch(nestedSource, /Wait limit reached; nested agent[^`]*notify/);
  const sdkSessionSource = fs.readFileSync(path.join(sdkRoot, 'dist/core/agent-session.js'), 'utf8');
  assert.match(sdkSessionSource, /allCustomTools[\s\S]*?\.filter\(\(tool\) => isAllowedTool\(tool\.definition\.name\)\)/);
  assert.match(sdkSessionSource, /definitionRegistry\.set\(tool\.definition\.name/);
  const { createBoundedBashTool } = await import(pathToFileURL(path.join(fixture, 'dist/agent-runner.js')) + `?runtime=${Date.now()}`);
  const cwd = path.join(temp, 'bash-cwd'); fs.mkdirSync(cwd);
  const shellPath = process.platform === 'win32'
    ? execFileSync('where.exe', ['bash.exe'], { encoding: 'utf8' }).trim().split(/\r?\n/)[0]
    : '/bin/bash';
  const commandPrefix = 'export BOUNDED_PREFIX=retained';
  let calls = 0, forwarded = [], factoryOptions;
  const wrapped = createBoundedBashTool(cwd, shellPath, commandPrefix, (workingDir, options) => {
    factoryOptions = options;
    const base = createBashToolDefinition(workingDir, options);
    const baseExecute = base.execute.bind(base);
    base.execute = async (id, params, ...rest) => { calls++; forwarded.push(params.timeout); return baseExecute(id, params, ...rest); };
    return base;
  });
  assert.deepEqual(factoryOptions, { shellPath, commandPrefix }, 'shell settings reach the SDK definition factory');
  assert.match(wrapped.description, /Timeout is in seconds.*300 seconds.*1800 seconds/);
  assert.match(wrapped.parameters.properties.timeout.description, /seconds.*300.*1800/);
  assert.equal(typeof wrapped.renderCall, 'function', 'SDK call renderer is preserved');
  assert.equal(typeof wrapped.renderResult, 'function', 'SDK result renderer is preserved');
  const result = await wrapped.execute('default', {
    command: 'printf "%s:%s:%s:%s" "$BOUNDED_PREFIX" "$PI_SESSION_ID" "$PI_PROVIDER" "$PI_REASONING_LEVEL"; printf ":bash=%s" "$BASH_VERSION"',
  }, undefined, undefined, {
    sessionManager: { getSessionId: () => 'synthetic-session', getSessionFile: () => undefined },
    model: { provider: 'synthetic-provider', id: 'synthetic-model' }, thinkingLevel: 'high',
  });
  const bashOutput = result.content.map(c => c.text ?? '').join('\n');
  assert.match(bashOutput, /retained:synthetic-session:synthetic-provider:high:bash=[0-9]/);
  assert.equal(forwarded[0], 300, 'default is forwarded as 300 seconds');
  for (const invalid of [300000, 0, -1, Infinity, NaN, 1800.1]) {
    await assert.rejects(wrapped.execute('invalid', { command: "touch should-not-run", timeout: invalid }), /finite number of seconds.*seconds, not milliseconds/);
  }
  assert.equal(calls, 1, 'invalid values rejected before SDK bash invocation');
  await wrapped.execute('max-valid', { command: "printf 'maximum-ok'", timeout: 1800 });
  assert.equal(forwarded.at(-1), 1800, 'maximum valid explicit timeout is preserved in seconds');
  await assert.rejects(wrapped.execute('timeout', { command: 'sleep 2', timeout: 0.12 }), /timed out after 0\.12 seconds/);
  assert.equal(forwarded.at(-1), 0.12, 'fractional seconds preserved and native SDK timeout/process cleanup used');

  // Actual in-memory SDK registries prove the definition wins only inside the allowlist.
  const sessionAgentDir = path.join(temp, 'agent-dir'); fs.mkdirSync(sessionAgentDir);
  const settingsManager = SettingsManager.inMemory({ shellPath, shellCommandPrefix: commandPrefix });
  const resourceLoader = new DefaultResourceLoader({
    cwd, agentDir: sessionAgentDir, settingsManager,
    noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true,
  });
  await resourceLoader.reload();
  const makeSession = (tools) => createAgentSession({
    cwd, agentDir: sessionAgentDir, tools, resourceLoader,
    sessionManager: SessionManager.inMemory(cwd), settingsManager,
    customTools: [createBoundedBashTool(cwd, shellPath, commandPrefix)],
  });
  const allowedSession = await makeSession(['bash']);
  try {
    assert.match(allowedSession.session.getToolDefinition('bash').description, /defaults to 300 seconds/);
  } finally { allowedSession.session.dispose(); }
  const restrictedSession = await makeSession(['read']);
  try {
    assert.equal(restrictedSession.session.getToolDefinition('bash'), undefined, 'custom bash cannot escape SDK allowlist');
  } finally { restrictedSession.session.dispose(); }

  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  assert.match(readme, /a 300 segundos por padrão/);
  assert.match(readme, /no máximo 60 segundos/);
  console.log(`patch-pi-subagents-bounded-waits smoke: PASS (DISPOSABLE_VERIFIED; SDK=${sdkRoot}; ${Date.now() - smokeStartedAt}ms)`);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
