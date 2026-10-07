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
  const sandbox = {
    timers, sent, individual, state,
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    pi: { sendMessage: (msg, opts) => sent.push({ msg, opts }) },
    emitIndividualNudge: (r) => individual.push(r.id),
    buildNotificationDetails: (r) => ({ id: r.id }),
    formatTaskNotification: (r) => `<n>${r.id}</n>`,
    agentActivity: new Map(), showCost: false,
  };
  vm.runInNewContext(`let currentCtx = { isIdle: () => state.idle, hasPendingMessages: () => state.pending };
${p.deferBlock(false)}
this.deferNudge = deferNudge; this.setCtx = (v) => { currentCtx = v; };`, sandbox);
  const tick = () => { const fn = timers.shift(); fn?.(); };
  return { ...sandbox, tick };
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
  assert.equal(h.sent.length, 1, 'one message for all held completions');
  assert.match(h.sent[0].msg.content, /2 agent\(s\) finished/);
  assert.match(h.sent[0].msg.content, /<n>a<\/n>/); assert.match(h.sent[0].msg.content, /<n>c<\/n>/);
  assert.doesNotMatch(h.sent[0].msg.content, /<n>b<\/n>/, 'consumed result must not wake the model');
  assert.equal(h.sent[0].opts.deliverAs, 'followUp'); assert.equal(h.sent[0].opts.triggerTurn, true);

  // 2. All held results consumed: nothing is sent at all.
  h = harness(); const d = { id: 'd' };
  h.deferNudge([d]); d.resultConsumed = true; h.state.idle = true; h.tick();
  assert.equal(h.sent.length + h.individual.length, 0);

  // 3. A single held completion keeps the individual format (with transcript footer).
  h = harness(); h.deferNudge([{ id: 'e' }]); h.state.idle = true; h.tick();
  assert.deepEqual([...h.individual], ['e']); assert.equal(h.sent.length, 0);

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
    // Start from upstream bytes even if the installed copy is already patched.
    for (const [r, before, after] of p.PATCHES) if (r === rel) src = src.replace(after, () => before);
    fs.writeFileSync(path.join(fixture, rel), src);
  }
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
