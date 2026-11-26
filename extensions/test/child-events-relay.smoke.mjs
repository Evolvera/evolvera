import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'linux') {
  console.log('SKIP child-events relay smoke: Linux inotify and pidfd required');
  process.exit(0);
}

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const scratch = await mkdtemp(path.join(os.tmpdir(), 'child-events-relay-'));
const agentDir = path.join(scratch, 'agent');
const binDir = path.join(scratch, 'bin');
const queue = path.join(agentDir, 'child-events', 'queue');
const children = path.join(agentDir, 'child-events', 'children');
const callsPath = path.join(scratch, 'orca-calls.jsonl');
const screenPath = path.join(scratch, 'screen.json');
const failuresPath = path.join(scratch, 'failures');
const runId = 'run_smoke-123';
const terminal = 'term_01234567-89ab-cdef-0123456789abcdef';
let relay;
let child;

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function eventually(check, message, timeout = 5000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await check()) return;
    await delay(25);
  }
  assert.fail(message);
}
async function calls() {
  try { return (await readFile(callsPath, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line)); }
  catch { return []; }
}
async function enqueue(id, kind, text) {
  const event = { id, pid: process.pid, ts: Date.now(), runId, cwd: scratch, child: 'smoke-child', kind, text };
  const temporary = path.join(queue, `.${id}.tmp`);
  await writeFile(temporary, JSON.stringify(event));
  await rename(temporary, path.join(queue, `${id}.json`));
}
async function waitForSendCount(count) {
  await eventually(async () => (await calls()).filter(call => call.command === 'send').length >= count,
    `expected ${count} terminal sends`);
}

try {
  await mkdir(binDir, { recursive: true });
  await mkdir(queue, { recursive: true });
  await mkdir(children, { recursive: true });
  await mkdir(path.join(scratch, 'tmp'), { recursive: true });
  await writeFile(path.join(agentDir, 'report-routes.json'), JSON.stringify({ [runId]: terminal }));
  await writeFile(screenPath, JSON.stringify({ result: { terminal: { handle: terminal, status: 'ready', tail: ['idle'], source: 'screen' } } }));
  await writeFile(failuresPath, '0');
  const fakeOrca = `#!/usr/bin/env python3
import json, os, sys
args = sys.argv[1:]
command = args[1]
if command == 'read':
    print(open(os.environ['FAKE_SCREEN']).read())
    raise SystemExit(0)
with open(os.environ['FAKE_CALLS'], 'a') as f: f.write(json.dumps({'command': command, 'args': args}) + '\\n')
count = int(open(os.environ['FAKE_FAILURES']).read())
if count > 0:
    open(os.environ['FAKE_FAILURES'], 'w').write(str(count - 1))
    print(json.dumps({'ok': False}))
    raise SystemExit(1)
print(json.dumps({'ok': True, 'accepted': True}))
`;
  const orcaPath = path.join(binDir, 'orca-ide');
  await writeFile(orcaPath, fakeOrca, { mode: 0o755 });
  const env = { ...process.env, HOME: scratch, PI_CODING_AGENT_DIR: agentDir, TMPDIR: path.join(scratch, 'tmp'),
    PATH: `${binDir}:${process.env.PATH}`, FAKE_SCREEN: screenPath, FAKE_CALLS: callsPath,
    FAKE_FAILURES: failuresPath };
  const relayCode = `import runpy; m=runpy.run_path(${JSON.stringify(path.join(repo, 'bin/child-events-relay.py'))}); raise SystemExit(m['run'](timing=m['Timing'](coalesce=.08, retry_initial=.08, retry_max=.2, screen_timeout=1, send_timeout=1)))`;
  relay = spawn('python3', ['-c', relayCode], { env, stdio: 'ignore' });
  await eventually(async () => {
    try { return JSON.parse(await readFile(path.join(agentDir, 'child-events', 'relay.pid.json'))).pid === relay.pid; }
    catch { return false; }
  }, 'relay did not publish ready marker');

  await enqueue('group-one', 'idle', 'first event');
  await enqueue('group-two', 'goal_finished', '[child smoke-child] goal finished | second event');
  await waitForSendCount(1);
  let sent = (await calls()).filter(call => call.command === 'send');
  assert.match(sent[0].args[sent[0].args.indexOf('--text') + 1], /^AVISO DE FILHOS \(evento automático\):/);
  assert.match(sent[0].args.join(' '), /first event/);
  assert.match(sent[0].args.join(' '), /\[child smoke-child\] goal finished \| second event/);
  await eventually(async () => (await readdir(queue)).length === 0, 'successful batch was not removed');

  await writeFile(failuresPath, '1');
  await enqueue('retry-event', 'job', 'retry me');
  await eventually(async () => (await calls()).filter(call => call.command === 'send').length >= 2, 'failed send was not attempted');
  await eventually(async () => (await calls()).filter(call => call.command === 'send').length >= 3, 'failed send was not retried');
  await eventually(async () => (await readdir(queue)).length === 0, 'retry success did not remove event');

  await writeFile(screenPath, JSON.stringify({ result: { terminal: { handle: terminal, status: 'ready', tail: ['Enter select mode'], source: 'screen' } } }));
  await enqueue('blocked-event', 'job', 'blocked until safe');
  await delay(200);
  assert.equal((await calls()).filter(call => call.command === 'send').length, 3, 'selection prompt must block send');
  await writeFile(screenPath, JSON.stringify({ result: { terminal: { handle: terminal, status: 'ready', tail: ['idle'], source: 'screen' } } }));
  await waitForSendCount(4);
  await eventually(async () => (await readdir(queue)).length === 0, 'unblocked event was not delivered');

  await writeFile(screenPath, JSON.stringify({ result: { terminal: { handle: terminal, status: 'ready', tail: ['idle'], source: 'screen-unavailable' } } }));
  await enqueue('unavailable-screen-event', 'job', 'hold on unknown screen');
  await delay(200);
  assert.equal((await calls()).filter(call => call.command === 'send').length, 4, 'unavailable screen must block send');
  await writeFile(screenPath, JSON.stringify({ result: { terminal: { handle: terminal, status: 'ready', tail: ['idle'] } } }));
  await waitForSendCount(5);
  await eventually(async () => (await readdir(queue)).length === 0, 'screen-unavailable event was not delivered after screen recovery');

  await writeFile(path.join(agentDir, 'report-routes.json'), '{}');
  await enqueue('missing-route-event', 'job', 'wait for route');
  await delay(200);
  assert.equal((await readdir(queue)).length, 1, 'event must remain queued without a route');
  await writeFile(path.join(agentDir, 'report-routes.json'), JSON.stringify({ [runId]: terminal }));
  await waitForSendCount(6);
  await eventually(async () => (await readdir(queue)).length === 0, 'event was lost when route was restored');

  child = spawn('python3', ['-c', 'import time; time.sleep(60)'], { env, stdio: 'ignore' });
  await new Promise(resolve => child.once('spawn', resolve));
  const stat = await readFile(`/proc/${child.pid}/stat`, 'utf8');
  const startTime = stat.slice(stat.lastIndexOf(') ') + 2).split(/\s+/)[19];
  await writeFile(path.join(children, `${child.pid}.json`), JSON.stringify({ pid: child.pid, startTime,
    runId, cwd: scratch, child: 'killed-test-child', clean: false }));
  await delay(120);
  child.kill('SIGTERM');
  await waitForSendCount(7);
  await eventually(async () => (await readdir(queue)).length === 0, 'died event was not delivered');
  sent = (await calls()).filter(call => call.command === 'send');
  assert.match(sent.at(-1).args.join(' '), /died/);

  child = spawn('python3', ['-c', 'import time; time.sleep(60)'], { env, stdio: 'ignore' });
  await new Promise(resolve => child.once('spawn', resolve));
  const cleanStat = await readFile(`/proc/${child.pid}/stat`, 'utf8');
  const cleanStartTime = cleanStat.slice(cleanStat.lastIndexOf(') ') + 2).split(/\s+/)[19];
  const cleanPath = path.join(children, `${child.pid}.json`);
  await writeFile(cleanPath, JSON.stringify({ pid: child.pid, startTime: cleanStartTime,
    runId, cwd: scratch, child: 'clean-test-child', clean: true }));
  await eventually(async () => {
    try { await readFile(cleanPath); return false; } catch { return true; }
  }, 'clean child registration was not consumed');
  const countBeforeCleanExit = (await calls()).filter(call => call.command === 'send').length;
  child.kill('SIGTERM');
  await delay(180);
  assert.equal((await calls()).filter(call => call.command === 'send').length, countBeforeCleanExit,
    'clean child exit must not produce died');

  const notify = spawnSync(path.join(repo, 'bin/notify-conductor'), ['job completed', runId], { env, encoding: 'utf8' });
  assert.equal(notify.status, 0, notify.stderr);
  await waitForSendCount(8);
  sent = (await calls()).filter(call => call.command === 'send');
  assert.match(sent.at(-1).args.join(' '), /job completed/);
  assert.notEqual(spawnSync(path.join(repo, 'bin/notify-conductor'), ['missing-run'], { env }).status, 0,
    'notifier must reject calls without run id');
  assert.notEqual(spawnSync(path.join(repo, 'bin/notify-conductor'), ['x'.repeat(1201), runId], { env }).status, 0,
    'notifier must reject rather than truncate an oversized event');
  const relayClosed = new Promise(resolve => relay.once('exit', resolve));
  relay.kill('SIGTERM');
  await eventually(() => relay.exitCode !== null, 'idle relay did not stop after SIGTERM');
  assert.equal(await relayClosed, 0);
  await assert.rejects(readFile(path.join(agentDir, 'child-events', 'relay.pid.json')), { code: 'ENOENT' });
  console.log('PASS child-events relay smoke: grouped delivery, retry, selection guard, pidfd died, notifier, clean shutdown');
} finally {
  if (child && child.exitCode === null) child.kill('SIGKILL');
  if (relay && relay.exitCode === null && relay.signalCode === null) {
    const relayClosed = new Promise(resolve => relay.once('exit', resolve));
    relay.kill('SIGKILL');
    await relayClosed;
  }
  await rm(scratch, { recursive: true, force: true });
}
