import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '../..');
const p = await import(pathToFileURL(path.join(root, 'scripts/patch-pi-subagents-deferred-nudges.mjs')));
const installed = p.resolveRoot([]);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'evolvera-deferred-nudges-'));

// Behaviour of the injected block, driven with stub parent state and manual timers.
function harness() {
  const timers = [];
  const sent = [];
  const individual = [];
  const state = { idle: false, pending: false, ctx: true };
  const clock = { now: 1_000_000 };
  const events = new Map();
  const sandbox = {
    timers, sent, individual, state, clock, events,
    Date: { now: () => clock.now },
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    pi: { sendMessage: (msg, opts) => sent.push({ msg, opts }), on: (name, fn) => events.set(name, fn) },
    emitIndividualNudge: (r) => individual.push(r.id),
    buildNotificationDetails: (r) => ({ id: r.id }),
    formatTaskNotification: (r) => `<n>${r.id}</n>`,
    agentActivity: new Map(), showCost: false,
  };
  vm.runInNewContext(`let currentCtx = { isIdle: () => state.idle, hasPendingMessages: () => state.pending };
${p.deferBlock(false)}
this.deferNudge = deferNudge; this.setCtx = (v) => { currentCtx = v; };`, sandbox);
  // Each tick advances past the idle-stability window so a settled parent flushes on the next poll.
  const tick = () => { clock.now += 300; const fn = timers.shift(); fn?.(); };
  const settle = () => { for (let i = 0; i < 8 && timers.length; i++) tick(); };
  return { ...sandbox, tick, settle };
}

try {
  // 1. Busy parent: completions are held; a result consumed meanwhile is dropped;
  //    the rest arrive together as one triggering message once idle.
  let h = harness();
  const a = { id: 'a' }, b = { id: 'b' }, c = { id: 'c' };
  assert.equal(h.deferNudge([a]), true);
  assert.equal(h.deferNudge([b, c]), true);
  assert.equal(h.timers.length, 1, 'one poll timer, not one per completion');
  b.resultConsumed = true; // orchestrator called get_subagent_result during its turn
  h.tick();
  assert.equal(h.sent.length, 0, 'nothing sent while busy');
  assert.equal(h.timers.length, 1, 're-arms while busy');
  h.state.idle = true; h.state.pending = true; h.tick();
  assert.equal(h.sent.length, 0, 'waits while the parent has queued messages');
  h.state.pending = false; h.tick();
  assert.equal(h.sent.length, 0, 'idle must hold for a full second before sending');
  h.settle();
  assert.equal(h.sent.length, 1, 'one message for all held completions');
  assert.match(h.sent[0].msg.content, /2 agent\(s\) finished/);
  assert.match(h.sent[0].msg.content, /<n>a<\/n>/); assert.match(h.sent[0].msg.content, /<n>c<\/n>/);
  assert.doesNotMatch(h.sent[0].msg.content, /<n>b<\/n>/, 'consumed result must not wake the model');
  assert.equal(h.sent[0].opts.deliverAs, 'followUp'); assert.equal(h.sent[0].opts.triggerTurn, true);

  // 2. All held results consumed: nothing is sent at all.
  h = harness(); const d = { id: 'd' };
  h.deferNudge([d]); d.resultConsumed = true; h.state.idle = true; h.settle();
  assert.equal(h.sent.length + h.individual.length, 0);

  // 3. A single held completion keeps the individual format (with transcript footer).
  h = harness(); h.deferNudge([{ id: 'e' }]); h.state.idle = true; h.settle();
  assert.deepEqual([...h.individual], ['e']); assert.equal(h.sent.length, 0);

  // 3b. Compaction: the session is idle while it summarizes, but nothing may start a turn then.
  h = harness(); h.deferNudge([{ id: 'k' }]);
  h.events.get('session_before_compact')(); h.state.idle = true; h.settle();
  assert.equal(h.individual.length, 0, 'held during compaction even though idle');
  h.events.get('session_compact')(); h.settle();
  assert.deepEqual([...h.individual], ['k'], 'delivered once compaction finished');
  // A failed compaction that never emits session_compact is released by the next agent run.
  h = harness(); h.deferNudge([{ id: 'm' }]); h.events.get('session_before_compact')(); h.state.idle = true; h.settle();
  assert.equal(h.individual.length, 0); h.events.get('agent_start')(); h.settle();
  assert.deepEqual([...h.individual], ['m']);
  // Idle flicker (e.g. the gap between abort and compaction start) never flushes.
  h = harness(); h.deferNudge([{ id: 'n' }]); h.state.idle = true; h.tick(); h.state.idle = false; h.tick(); h.state.idle = true; h.tick();
  assert.equal(h.individual.length, 0, 'stability window restarts after any busy poll');

  // 4. Idle parent: nothing is deferred, upstream delivery is unchanged.
  h = harness(); h.state.idle = true;
  assert.equal(h.deferNudge([{ id: 'f' }]), false); assert.equal(h.timers.length, 0);

  // 5. Session gone: held completions are dropped, no stale send.
  h = harness(); h.deferNudge([{ id: 'g' }]); h.setCtx(undefined); h.tick();
  assert.equal(h.sent.length + h.individual.length, 0);

  // Patch application on copies of the installed package files.
  const meta = JSON.parse(fs.readFileSync(path.join(installed, 'package.json'), 'utf8'));
  assert.equal(meta.version, p.PACKAGE_VERSION);
  const fixture = path.join(temp, 'pkg');
  for (const rel of ['package.json', 'src/index.ts', 'dist/index.js']) {
    fs.mkdirSync(path.dirname(path.join(fixture, rel)), { recursive: true });
    let src = fs.readFileSync(path.join(installed, rel), 'utf8');
    // Start from upstream bytes even if the installed copy is already patched (v1 or v2).
    const block = (gen) => rel.endsWith('.ts') ? gen(true) : gen(false).replace(/^ {2}/gm, '    ');
    if (rel !== 'package.json') for (const gen of [p.deferBlockV1, p.deferBlock]) src = src.replace(block(gen), () => '');
    for (const [r, before, after] of p.PATCHES) if (r === rel) src = src.replace(after, () => before);
    fs.writeFileSync(path.join(fixture, rel), src);
  }
  const upstream = new Map(['src/index.ts', 'dist/index.js'].map((rel) => [rel, fs.readFileSync(path.join(fixture, rel), 'utf8')]));
  // Upgrade: a package carrying the first (v1) patch is converted in place to v2.
  const v1 = path.join(temp, 'v1');
  fs.mkdirSync(path.join(v1, 'src'), { recursive: true }); fs.mkdirSync(path.join(v1, 'dist'));
  fs.copyFileSync(path.join(fixture, 'package.json'), path.join(v1, 'package.json'));
  for (const [rel, src] of upstream) {
    let out = src;
    for (const [r, before, after] of p.PATCHES) if (r === rel) out = out.replace(before, () => after);
    const block = (gen) => rel.endsWith('.ts') ? gen(true) : gen(false).replace(/^ {2}/gm, '    ');
    out = out.replace(block(p.deferBlock), () => block(p.deferBlockV1));
    fs.writeFileSync(path.join(v1, rel), out);
  }
  assert.equal(await p.patch(v1), true, 'v1 is upgraded');
  assert.equal(await p.patch(v1), false, 'upgrade is idempotent');
  for (const [rel, , after] of p.PATCHES) assert.equal(fs.readFileSync(path.join(v1, rel), 'utf8').split(after).length - 1, 1, `upgrade ${rel}`);
  assert.equal(await p.patch(fixture), true);
  assert.equal(await p.patch(fixture), false, 'patch is not idempotent');
  for (const [rel, , after] of p.PATCHES) assert.equal(fs.readFileSync(path.join(fixture, rel), 'utf8').split(after).length - 1, 1, rel);
  execFileSync(process.execPath, ['--check', path.join(fixture, 'dist/index.js')]);
  const ts = path.join(fixture, 'src/index.mts'); fs.copyFileSync(path.join(fixture, 'src/index.ts'), ts);
  execFileSync(process.execPath, ['--experimental-strip-types', '--check', ts], { stdio: 'pipe' });

  const drift = path.join(fixture, 'dist/index.js');
  fs.writeFileSync(drift, fs.readFileSync(drift, 'utf8').replace('if (deferNudge(unconsumed))', 'if (drifted)'));
  const before = fs.readFileSync(drift);
  await assert.rejects(p.patch(fixture), /anchor cardinality mismatch/);
  assert.deepEqual(fs.readFileSync(drift), before, 'refusal mutated fixture');

  for (const [file, install] of [['install.sh', 'pi install npm:@tintinweb/pi-subagents@0.18.2'], ['install.ps1', 'pi install npm:@tintinweb/pi-subagents@0.18.2']]) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    assert.ok(text.indexOf('patch-pi-subagents-deferred-nudges.mjs') > text.indexOf(install), `${file} must run the patch after installing pi-subagents`);
  }
  console.log('patch-pi-subagents-deferred-nudges smoke: PASS (DISPOSABLE_VERIFIED)');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
