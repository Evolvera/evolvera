import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolvePiSdkRoot } from '../../extensions/test/lib/pi-sdk.mjs';

const project = path.resolve(import.meta.dirname, '../..');
const patcher = await import(pathToFileURL(path.join(project, 'scripts/patch-pi-subagents-bounded-waits.mjs')));
const installed = patcher.resolveRoot([]);
const sdkRoot = resolvePiSdkRoot(import.meta.url);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-subagent-deadline-'));
const fixture = path.join(tmp, 'package');
const nativeSetTimeout = globalThis.setTimeout;
const nativeClearTimeout = globalThis.clearTimeout;
const controlled = new Set();
const timersByDelay = new Map();

const STUB_RUNNER_SOURCE = `
const pending = [];
const session = { sessionManager: { getSessionFile: () => undefined }, steer: async () => {}, dispose() { this.disposed = true; } };
function deferred(signal, kind, prompt) {
  return new Promise((resolve, reject) => {
    const run = { resolve, reject, signal, kind, prompt };
    pending.push(run);
    signal?.addEventListener("abort", () => { run.abortObserved = true; }, { once: true });
  });
}
export function takeRun(kind) { return pending.find(run => run.kind === kind && !run.taken && (run.taken = true)); }
export async function runAgent(ctx, type, prompt, options) {
  options.onSessionCreated?.(session);
  return deferred(options.signal, "fresh", prompt);
}
export async function resumeAgent(_session, prompt, options) {
  return deferred(options.signal, "resume", prompt);
}
`;

function normalizeManagerPatch(packageRoot) {
  const managerEdits = patcher.PATCHES.filter(([file]) => file.endsWith('agent-manager.ts') || file.endsWith('agent-manager.js'));
  for (const rel of new Set(managerEdits.map(([file]) => file))) {
    let source = fs.readFileSync(path.join(packageRoot, rel), 'utf8');
    if (!source.includes('Agent execution timed out after its maximum total execution duration.')) continue;
    for (const [, before, after] of managerEdits.filter(([file]) => file === rel).reverse()) {
      const afterCount = source.split(after).length - 1;
      const beforeCount = source.split(before).length - 1;
      if (afterCount === 1) source = source.replace(after, () => before);
      else if (afterCount === 0 && beforeCount === 1) continue;
      else throw new Error(`cannot normalize manager patch in ${rel}: ${before.slice(0, 80)}`);
    }
    fs.writeFileSync(path.join(packageRoot, rel), source);
  }
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

try {
  fs.cpSync(installed, fixture, { recursive: true });
  await patcher.patch(fixture);
  const pkg = JSON.parse(fs.readFileSync(path.join(fixture, 'package.json'), 'utf8'));
  pkg.type = 'module';
  fs.writeFileSync(path.join(fixture, 'package.json'), JSON.stringify(pkg));
  linkRuntimeDependencies(fixture);
  fs.writeFileSync(path.join(fixture, 'dist/agent-runner.js'), STUB_RUNNER_SOURCE);
  fs.writeFileSync(path.join(fixture, 'dist/worktree.js'), `
export function createWorktree(_base, id) { return { path: "/synthetic/" + id, branch: "synthetic-" + id }; }
export function cleanupWorktree() { globalThis.__deadlineWorktreeCleanups = (globalThis.__deadlineWorktreeCleanups ?? 0) + 1; return { hasChanges: false }; }
export function pruneWorktrees() {}
export function isWorktreeIsolationEnabled() { return true; }
`);
  globalThis.__deadlineWorktreeCleanups = 0;

  const timers = await import(pathToFileURL(path.join(fixture, 'dist/agent-manager.js')) + `?deadline=${Date.now()}`);
  const { AgentManager } = timers;
  const runner = await import(pathToFileURL(path.join(fixture, 'dist/agent-runner.js')));
  const notifications = [];
  const manager = new AgentManager(record => notifications.push(record), 1);
  const cwd = tmp;
  const ctx = { cwd };
  const pi = {};
  const intercept = (fn, delay, args = []) => {
    if (delay === 30 * 60_000 || delay === 60 * 60_000) {
      const entry = { fn, delay, args, cleared: false, unref() {} };
      controlled.add(entry);
      timersByDelay.set(delay, [...(timersByDelay.get(delay) ?? []), entry]);
      return entry;
    }
    return nativeSetTimeout(fn, delay, ...args);
  };
  globalThis.setTimeout = intercept;
  globalThis.clearTimeout = timer => {
    if (controlled.has(timer)) { timer.cleared = true; controlled.delete(timer); }
    else nativeClearTimeout(timer);
  };
  const fireClockWithoutDeadline = () => {
    for (const delay of [30 * 60_000, 60 * 60_000]) {
      const timer = timersByDelay.get(delay)?.find(item => !item.cleared && !item.fired);
      if (timer) { timer.fired = true; timer.fn(...(timer.args ?? [])); }
    }
  };
  // Before the patch, the real manager starts a planner run without an execution
  // deadline: advancing the synthetic 60m deadline clock leaves it running.
  const baseline = path.join(tmp, 'baseline');
  fs.cpSync(installed, baseline, { recursive: true });
  // Normalize only the two manager targets in this run-owned copy. Seed them from
  // the patched fixture so this also covers an already-patched installed package;
  // all other installed package bytes remain untouched in the baseline fixture.
  for (const rel of ['src/agent-manager.ts', 'dist/agent-manager.js']) {
    fs.copyFileSync(path.join(fixture, rel), path.join(baseline, rel));
  }
  normalizeManagerPatch(baseline);
  const baselineMeta = JSON.parse(fs.readFileSync(path.join(baseline, 'package.json'), 'utf8'));
  baselineMeta.type = 'module'; fs.writeFileSync(path.join(baseline, 'package.json'), JSON.stringify(baselineMeta));
  linkRuntimeDependencies(baseline);
  fs.writeFileSync(path.join(baseline, 'dist/agent-runner.js'), STUB_RUNNER_SOURCE);
  const { AgentManager: BaselineManager } = await import(pathToFileURL(path.join(baseline, 'dist/agent-manager.js')) + `?baseline=${Date.now()}`);
  const baselineRunner = await import(pathToFileURL(path.join(baseline, 'dist/agent-runner.js')));
  const baselineManager = new BaselineManager(() => {}, 1);
  const baselineId = baselineManager.spawn(pi, ctx, 'planner', 'pre-patch planner', { description: 'custom planner description', isBackground: true });
  const baselineRecord = baselineManager.getRecord(baselineId);
  assert.equal(controlled.size, 0, 'pre-patch manager has no total execution timer');
  fireClockWithoutDeadline();
  assert.equal(baselineRecord.status, 'running', 'pre-patch manager remains running past the prospective cap');
  const baselineRun = baselineRunner.takeRun('fresh');
  baselineRun.resolve({ responseText: 'baseline finished', session: baselineRecord.session, aborted: false });
  await baselineRecord.promise;
  assert.equal(baselineRecord.status, 'completed');
  await baselineManager.dispose();

  const fire = delay => {
    const timer = timersByDelay.get(delay)?.find(item => !item.cleared && !item.fired);
    assert.ok(timer, `a ${delay / 60_000}m timer was armed`);
    timer.fired = true;
    timer.fn(...timer.args);
  };
  const settle = async (record, kind, value = {}) => {
    const run = runner.takeRun(kind);
    assert.ok(run, `${kind} run started`);
    run.resolve({ responseText: value.text ?? 'partial-output', text: value.text ?? 'partial-output', session: { sessionManager: { getSessionFile: () => undefined }, steer: async () => {}, dispose() {} }, aborted: false, failure: undefined });
    await record.promise;
    return run;
  };

  // Fresh/background execution: timeout aborts natively, retains partial text and reason,
  // preserves the worktree, settles exactly once, and releases the pool.
  const freshId = manager.spawn(pi, ctx, 'builder', 'fresh', { description: 'custom brief', isBackground: true, isolation: 'worktree' });
  const fresh = manager.getRecord(freshId);
  const artifact = path.join(tmp, 'timeout-partial.txt');
  fs.writeFileSync(artifact, 'partial:');
  fresh.outputFile = artifact;
  fresh.outputCleanup = () => fs.appendFileSync(artifact, 'flushed');
  const freshRun = runner.takeRun('fresh');
  fresh.handle = 'live-timeout';
  fresh.sessionFile = '/synthetic/live-timeout.jsonl';
  fire(30 * 60_000);
  assert.equal(fresh.status, 'stopped');
  assert.equal(manager.isAttemptActive(freshId), true, 'timeout remains active until the underlying run settles');
  fresh.completedAt = Date.now() - 11 * 60_000;
  manager.cleanup();
  manager.clearCompleted();
  assert.equal(manager.getRecord(freshId), fresh, 'cleanup and clearCompleted retain a stopped-but-active record');
  assert.equal(fresh.session.disposed, undefined, 'active session was not disposed');
  assert.equal(manager.listTombstones().some(entry => entry.handle === 'live-timeout'), false);
  assert.equal(manager.resolveMention('live-timeout')?.record, fresh, 'handle resolves to the live record, not a tombstone');
  assert.match(fresh.error, /timed out after its maximum total execution duration/);
  assert.equal(freshRun.abortObserved, true, 'timeout reaches the native runner AbortSignal');
  freshRun.resolve({ responseText: 'partial-output', session: fresh.session, aborted: true });
  await fresh.promise;
  assert.equal(manager.isAttemptActive(freshId), false);
  assert.equal(fresh.result, 'partial-output');
  assert.equal(fs.readFileSync(artifact, 'utf8'), 'partial:flushed', 'timeout retains and flushes run-owned output artifacts');
  assert.ok(fresh.worktree, 'worktree remains attached for manual recovery');
  assert.equal(fresh.worktreeResult, undefined, 'timed-out worktree was not cleaned up');
  assert.equal(globalThis.__deadlineWorktreeCleanups, 0);
  assert.equal(notifications.filter(record => record.id === freshId).length, 1);
  assert.equal(controlled.size, 0, 'deadline timer cleared on settle');
  fresh.completedAt = Date.now() - 11 * 60_000;
  manager.cleanup();
  assert.equal(manager.getRecord(freshId), undefined, 'ordinary cleanup evicts after settlement');
  assert.equal(manager.listTombstones().some(entry => entry.handle === 'live-timeout'), true, 'settled cleanup may create its ordinary tombstone');

  // Planner duration is keyed only by exact agent type, not description.
  const plannerId = manager.spawn(pi, ctx, 'planner', 'planner prompt', { description: 'custom planner description', isBackground: true });
  const planner = manager.getRecord(plannerId);
  const plannerRun = runner.takeRun('fresh');
  assert.ok([...controlled].some(timer => timer.delay === 60 * 60_000));
  fire(60 * 60_000);
  assert.equal(planner.status, 'stopped');
  assert.equal(plannerRun.abortObserved, true);
  plannerRun.resolve({ responseText: 'planner partial', session: planner.session, aborted: true });
  await planner.promise;
  assert.equal(planner.result, 'planner partial');

  // Foreground resume gets a fresh controller/deadline. A timeout keeps the stopped
  // status/reason even when its promise rejects, and a second resume cannot overlap it.
  const resumeId = manager.spawn(pi, ctx, 'builder', 'seed', { description: 'resume fixture' });
  const resumeRecord = manager.getRecord(resumeId);
  await settle(resumeRecord, 'fresh', { text: 'seed result' });
  const foreground = manager.resume(resumeId, 'resume once');
  const foregroundRun = runner.takeRun('resume');
  fire(30 * 60_000);
  assert.equal(foregroundRun.abortObserved, true);
  assert.equal(resumeRecord.status, 'stopped');
  assert.equal(await manager.resume(resumeId, 'overlap'), undefined, 'stopped-but-active attempt cannot be resumed');
  foregroundRun.reject(new Error('native abort rejection'));
  await foreground;
  assert.equal(resumeRecord.status, 'stopped');
  assert.match(resumeRecord.error, /timed out/);
  assert.equal(controlled.size, 0);

  // Background resume has its own fresh attempt timer and retains one completion notice.
  const bgId = manager.spawn(pi, ctx, 'builder', 'seed bg', { description: 'background resume fixture' });
  const bgRecord = manager.getRecord(bgId);
  await settle(bgRecord, 'fresh', { text: 'seed' });
  const noticesBefore = notifications.length;
  await manager.resume(bgId, 'resume detached', undefined, { isBackground: true });
  const bgRun = runner.takeRun('resume');
  fire(30 * 60_000);
  assert.equal(bgRecord.status, 'stopped');
  assert.equal(bgRun.abortObserved, true);
  assert.equal(await manager.resume(bgId, 'overlap', undefined, { isBackground: true }), undefined);
  bgRun.resolve({ text: 'background partial', failure: undefined });
  await bgRecord.promise;
  assert.equal(bgRecord.result, 'background partial');
  assert.equal(notifications.length, noticesBefore + 1);

  // Success/manual abort clear each attempt's timer; ordinary failures retain their own reason.
  const doneId = manager.spawn(pi, ctx, 'plan-briefer-gpt', 'quick', { description: 'quick' });
  const done = manager.getRecord(doneId);
  await settle(done, 'fresh', { text: 'done' });
  assert.equal(done.status, 'completed');
  assert.equal(controlled.size, 0);
  const noticesAfterForegroundSpawn = notifications.length;
  const firstResume = manager.resume(doneId, 'first successful resume');
  const firstResumeRun = runner.takeRun('resume');
  const firstTimer = [...controlled][0];
  assert.ok(firstTimer);
  firstResumeRun.resolve({ text: 'first resume result' });
  await firstResume;
  assert.equal(controlled.size, 0);
  const secondResume = manager.resume(doneId, 'second successful resume');
  const secondResumeRun = runner.takeRun('resume');
  const secondTimer = [...controlled][0];
  assert.ok(secondTimer && secondTimer !== firstTimer, 'successive resume gets a distinct deadline');
  assert.equal([...controlled].length, 1, 'first resume timer did not leak into the next attempt');
  secondResumeRun.resolve({ text: 'second resume result' });
  await secondResume;
  assert.equal(done.result, 'second resume result');
  assert.equal(controlled.size, 0);
  assert.equal(notifications.length, noticesAfterForegroundSpawn, 'foreground resumes add no completion notifications');
  const parentController = new AbortController();
  const parentResume = manager.resume(doneId, 'parent abort', parentController.signal);
  const parentResumeRun = runner.takeRun('resume');
  assert.notEqual(parentResumeRun.signal, parentController.signal, 'foreground resume owns a fresh native controller');
  parentController.abort(new Error('parent interrupted'));
  assert.equal(parentResumeRun.signal.aborted, true, 'parent abort is forwarded to the native resume signal');
  parentResumeRun.reject(new Error('parent interrupted'));
  await parentResume;
  assert.equal(done.status, 'stopped');
  assert.equal(controlled.size, 0, 'parent-aborted resume clears its own deadline');
  const failedId = manager.spawn(pi, ctx, 'builder', 'fail quickly', { description: 'failure', isBackground: true });
  const failed = manager.getRecord(failedId);
  runner.takeRun('fresh').reject(new Error('synthetic execution failure'));
  await failed.promise;
  assert.equal(failed.status, 'error');
  assert.match(failed.error, /synthetic execution failure/);
  assert.equal(controlled.size, 0, 'execution-error path clears its deadline');

  const manualId = manager.spawn(pi, ctx, 'builder', 'manual', { description: 'manual', isBackground: true });
  const manual = manager.getRecord(manualId);
  const manualRun = runner.takeRun('fresh');
  const manualTimer = [...controlled][0];
  assert.ok(manualTimer);
  assert.equal(manager.abort(manualId), true);
  manual.error = 'manual stop reason';
  assert.equal(manual.status, 'stopped');
  assert.equal(controlled.has(manualTimer), false, 'manual abort immediately clears its deadline timer');
  assert.equal(manager.isAttemptActive(manualId), true, 'manual abort keeps the old attempt active until settlement');
  assert.equal(await manager.resume(manualId, 'must not overlap'), undefined);
  fireClockWithoutDeadline();
  assert.equal(manual.error, 'manual stop reason', 'elapsed deadline cannot overwrite manual stop reason');
  manualRun.resolve({ responseText: 'manually stopped', session: manual.session, aborted: true });
  await manual.promise;
  assert.equal(manual.error, 'manual stop reason');
  assert.equal(manager.isAttemptActive(manualId), false);
  assert.equal(controlled.size, 0);
  assert.equal([...timersByDelay.values()].flat().filter(timer => timer.cleared).length >= 5, true);

  // Waiting in the manager queue does not spend an execution's deadline. It is armed
  // only when drainQueue transitions that record into the running state.
  const blockerId = manager.spawn(pi, ctx, 'builder', 'pool blocker', { description: 'pool blocker', isBackground: true });
  const blocker = manager.getRecord(blockerId);
  const blockerRun = runner.takeRun('fresh');
  const queuedId = manager.spawn(pi, ctx, 'builder', 'queued child', { description: 'queued child', isBackground: true });
  const queued = manager.getRecord(queuedId);
  assert.equal(queued.status, 'queued');
  assert.equal(controlled.size, 1, 'queued attempt has no deadline timer');
  fire(30 * 60_000);
  blockerRun.resolve({ responseText: 'blocker partial', session: blocker.session, aborted: true });
  await blocker.promise;
  assert.equal(queued.status, 'running', 'queued attempt starts after pool release');
  const queuedRun = runner.takeRun('fresh');
  assert.equal(controlled.size, 1, 'queue wait was not charged; timer begins on actual start');
  fire(30 * 60_000);
  queuedRun.resolve({ responseText: 'queued partial', session: queued.session, aborted: true });
  await queued.promise;
  assert.equal(queued.status, 'stopped');

  // Nested executions enter the same manager path and receive the same per-attempt cap.
  const nestedId = manager.spawn(pi, ctx, 'builder', 'nested', { description: 'nested', isBackground: true, parentAgentId: resumeId });
  const nested = manager.getRecord(nestedId);
  const nestedRun = runner.takeRun('fresh');
  assert.equal(controlled.size, 1);
  fire(30 * 60_000);
  nestedRun.resolve({ responseText: 'nested partial', session: nested.session, aborted: true });
  await nested.promise;
  assert.equal(nested.status, 'stopped');

  assert.equal(manager.hasRunning(), false);
  console.log('pi-subagents deadline lifecycle smoke: PASS (DISPOSABLE_VERIFIED; real patched AgentManager, stub runAgent/resumeAgent, fake deadline clock; no provider/network)');
  await manager.dispose();
} finally {
  globalThis.setTimeout = nativeSetTimeout;
  globalThis.clearTimeout = nativeClearTimeout;
  delete globalThis.__deadlineWorktreeCleanups;
  fs.rmSync(tmp, { recursive: true, force: true });
}
