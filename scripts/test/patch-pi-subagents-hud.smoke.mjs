import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  assertPaletteAndShape, assertTokens, copyPackage, createJitiFor, loadRealTheme, plainTheme, stripTokens, tokenTheme, toUpstream,
} from './lib/hud-render.mjs';
import { resolvePiSdkRoot } from '../../extensions/test/lib/pi-sdk.mjs';

// STATEFUL RESOURCE PROOF: DISPOSABLE_VERIFIED. The installed package (which already carries the ultra-thinking,
// deferred-nudges and bounded-waits patches) is only read; every patch and render runs on copies under one mkdtemp.
const root = path.resolve(import.meta.dirname, '../..');
const p = await import(pathToFileURL(path.join(root, 'scripts/patch-pi-subagents-hud.mjs')));
const installed = p.resolveRoot([]);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'evolvera-subagents-hud-'));
const digest = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const targets = [p.SRC, p.DIST];
const installedBefore = targets.map((rel) => digest(path.join(installed, rel)));
const realDateNow = Date.now;
const otherPatches = ['ultra-thinking', 'deferred-nudges', 'bounded-waits'];

function upstreamCopy(name) {
  const dest = path.join(temp, name);
  copyPackage(installed, dest);
  toUpstream(dest, p.PATCHES);
  return dest;
}

try {
  const meta = JSON.parse(fs.readFileSync(path.join(installed, 'package.json'), 'utf8'));
  assert.equal(meta.name, p.PACKAGE_NAME); assert.equal(meta.version, p.PACKAGE_VERSION);

  // 1. Apply on a copy that already carries the three sibling patches; idempotent; one occurrence of each replacement.
  const upstream = upstreamCopy('upstream');
  const pkg = upstreamCopy('pkg');
  const nudges = await import(pathToFileURL(path.join(root, 'scripts/patch-pi-subagents-deferred-nudges.mjs')));
  assert.ok(fs.readFileSync(path.join(pkg, 'src/index.ts'), 'utf8').includes(nudges.MARKER), 'fixture must carry the deferred-nudges patch');
  assert.equal(await p.patch(pkg), true);
  assert.equal(await p.patch(pkg), false, 'patch is not idempotent');
  for (const [rel, , after] of p.PATCHES) assert.equal(fs.readFileSync(path.join(pkg, rel), 'utf8').split(after).length - 1, 1, `${rel} replacement count`);
  assert.equal(fs.readdirSync(path.join(pkg)).filter((name) => name.startsWith('.pi-subagents-hud-')).length, 0, 'no staging leftovers');
  for (const rel of targets) assert.ok(!/renderAgentName[(,]|├─|└─|⎿|⠋|"success"/u.test(fs.readFileSync(path.join(pkg, rel), 'utf8')), `${rel}: legacy look left behind`);

  // Patched sources still parse: dist as JavaScript, src with its type annotations stripped.
  execFileSync(process.execPath, ['--check', path.join(pkg, p.DIST)]);
  const checkCopy = path.join(pkg, 'src/ui/agent-widget.check.mts'); fs.copyFileSync(path.join(pkg, p.SRC), checkCopy);
  execFileSync(process.execPath, ['--experimental-strip-types', '--check', checkCopy], { stdio: 'pipe' });
  fs.rmSync(checkCopy);

  // Composition: the sibling patches still see their own content as applied, and the HUD touches none of their files.
  for (const name of otherPatches) {
    const out = execFileSync(process.execPath, [path.join(root, `scripts/patch-pi-subagents-${name}.mjs`), '--package-root', pkg], { encoding: 'utf8' });
    assert.match(out, /already applied/, `${name} no longer recognises its own patch after the HUD patch`);
  }
  assert.equal(await p.patch(pkg), false);
  for (const rel of targets) assert.ok(!['src/index.ts', 'dist/index.js'].includes(rel));

  // 2. Refusals leave the package byte-identical.
  const drift = upstreamCopy('drift');
  const driftFile = path.join(drift, p.DIST);
  fs.writeFileSync(driftFile, fs.readFileSync(driftFile, 'utf8').replace('"⠋"', '"⠌"'));
  const driftBefore = targets.map((rel) => fs.readFileSync(path.join(drift, rel)));
  await assert.rejects(p.patch(drift), /anchor cardinality mismatch/);
  assert.deepEqual(targets.map((rel) => fs.readFileSync(path.join(drift, rel))), driftBefore, 'refusal mutated the package');

  const partial = upstreamCopy('partial');
  fs.copyFileSync(path.join(pkg, p.SRC), path.join(partial, p.SRC));
  await assert.rejects(p.patch(partial), /partially patched/);

  const wrong = upstreamCopy('wrong');
  fs.writeFileSync(path.join(wrong, 'package.json'), JSON.stringify({ name: p.PACKAGE_NAME, version: '9.9.9' }));
  await assert.rejects(p.patch(wrong), /package identity mismatch/);

  const rollback = upstreamCopy('rollback');
  const rollbackBefore = targets.map((rel) => fs.readFileSync(path.join(rollback, rel)));
  let renames = 0;
  await assert.rejects(p.patch(rollback, { renameFile: async (from, to) => { if (++renames === 2) throw new Error('disk'); fs.renameSync(from, to); } }), /disk/);
  assert.deepEqual(targets.map((rel) => fs.readFileSync(path.join(rollback, rel))), rollbackBefore, 'failed commit was not rolled back');

  // 3. Render the patched widget (src and dist) against the upstream widget, with fake and real themes.
  const agentRoot = path.dirname(path.dirname(installed)); // .../npm/node_modules
  const piTui = path.join(agentRoot, '@earendil-works', 'pi-tui');
  const sdk = path.join(resolvePiSdkRoot(import.meta.url), 'dist', 'index.js');
  const { visibleWidth } = await createJitiFor(import.meta.url, {}).import(path.join(piTui, 'dist', 'index.js'));
  const realTheme = await loadRealTheme(root);

  async function load(packageRoot, rel) {
    const jiti = createJitiFor(import.meta.url, { '@earendil-works/pi-tui': piTui, '@earendil-works/pi-coding-agent': sdk });
    // One entry module, so the widget and the registry the test fills are the same module instance.
    const types = rel.startsWith('src/') ? './src/agent-types.ts' : './dist/agent-types.js';
    const entry = path.join(packageRoot, `hud-entry-${rel.startsWith('src/') ? 'src' : 'dist'}.ts`);
    fs.writeFileSync(entry, `export * from "./${rel}";\nexport { registerAgents } from "${types}";\n`);
    const widgetModule = await jiti.import(entry);
    widgetModule.registerAgents(new Map([
      // Per-agent badge colours must not reach the widget.
      ['scout', { name: 'scout', displayName: 'scout', description: 'x', color: 'blue', promptMode: 'replace', extensions: true, skills: true }],
      ['builder', { name: 'builder', displayName: 'builder', description: 'x', color: 'green', promptMode: 'append', extensions: true, skills: true }],
    ]));
    return widgetModule;
  }
  // Frozen clock so elapsed times are exact; restored in finally.
  const now = Date.now();
  Date.now = () => now;
  const rec = (id, type, status, description, extra = {}) => ({ id, type, status, description, toolUses: 0, startedAt: now - 30_000, isBackground: true, ...extra });
  const session = (percent) => ({ getSessionStats: () => ({ contextUsage: { percent } }) });
  const scenarios = {
    mixed: () => ({
      agents: [
        rec('r1', 'scout', 'running', 'Localizar conflito', { toolUses: 12, lifetimeUsage: { input: 12300, output: 0, cacheWrite: 0 } }),
        rec('r2', 'builder', 'running', 'Aplicar patch', { toolUses: 1, lifetimeUsage: { input: 90000, output: 0, cacheWrite: 0 }, compactionCount: 2 }),
        rec('q1', 'scout', 'queued', 'Esperando'),
        rec('f1', 'builder', 'completed', 'Fix footer', { completedAt: now - 1_000, startedAt: now - 63_000, toolUses: 3 }),
        rec('f2', 'scout', 'steered', 'Limite', { completedAt: now }),
        rec('f3', 'scout', 'stopped', 'Parado', { completedAt: now }),
        rec('f4', 'scout', 'error', 'Quebrou', { completedAt: now, error: 'boom' }),
        rec('f5', 'scout', 'aborted', 'Cancelado', { completedAt: now }),
      ],
      activity: { r1: { activeTools: new Map([['a', 'read']]), toolUses: 12, responseText: '', turnCount: 3, maxTurns: 30, session: session(18) }, r2: { activeTools: new Map(), toolUses: 1, responseText: 'pensando', turnCount: 1, session: session(90) } },
    }),
    idle: () => ({ agents: [rec('f1', 'builder', 'completed', 'Fix footer', { completedAt: now })], activity: {} }),
    overflow: () => ({
      agents: [
        ...Array.from({ length: 8 }, (_, i) => rec(`r${i}`, 'scout', 'running', `Tarefa ${i}`)),
        rec('q1', 'scout', 'queued', 'Fila'), rec('q2', 'scout', 'queued', 'Fila 2'),
        ...Array.from({ length: 3 }, (_, i) => rec(`f${i}`, 'builder', 'completed', `Feito ${i}`, { completedAt: now })),
      ],
      activity: {},
    }),
  };

  function renderWidget(module, scenarioName, theme, columns, frames = 1) {
    const { agents, activity } = scenarios[scenarioName]();
    const widget = new module.AgentWidget({ listAgents: () => agents }, new Map(Object.entries(activity)), () => 'all', () => false, () => false);
    let factory;
    widget.setUICtx({ setStatus() {}, setWidget: (_key, f) => { if (f) factory = f; } });
    for (let i = 0; i < frames; i++) widget.update();
    return factory({ terminal: { columns }, requestRender() {} }, theme).render();
  }

  for (const rel of [p.SRC, p.DIST]) {
    const before = await load(upstream, rel);
    const after = await load(pkg, rel);
    assert.deepEqual([...after.SPINNER], ['◢', '◣', '◤', '◥']);

    for (const scenario of Object.keys(scenarios)) {
      for (const width of [20, 40, 80, 160]) {
        const old = renderWidget(before, scenario, plainTheme, width);
        const plain = renderWidget(after, scenario, plainTheme, width);
        // Same rows in the same places: overflow math, linger and the line cap are untouched.
        assert.equal(plain.length, old.length, `${rel} ${scenario}@${width}: row count changed`);
        assert.ok(plain.length <= 12, 'MAX_WIDGET_LINES');
        assertPaletteAndShape(plain, { width, visibleWidth, label: `${rel} ${scenario}@${width}` });
        for (const line of plain) assert.ok(line.startsWith('▌'), `rail missing: ${line}`);
        const real = renderWidget(after, scenario, realTheme, width);
        assertPaletteAndShape(real, { width, visibleWidth, label: `${rel} real ${scenario}@${width}` });
        assert.equal(real.length, plain.length);
        assert.ok(!/\u001b\[(?:38;2;(?:93;124;240|125;151;255)|48;2)/.test(real.join('\n')), 'blue or a badge background reached the real theme render');
      }
    }

    // Content and colours (wide enough that the token markup is not truncated).
    const tokens = tokenTheme();
    const mixed = renderWidget(after, 'mixed', tokens, 600);
    assertTokens(tokens.used, `${rel} mixed`);
    const text = mixed.map(stripTokens);
    assert.equal(text[0], '▌ AGENTS  2 running · 1 queued');
    assert.equal(mixed[0], '[accent]▌[/] <b>[accent]AGENTS[/]</b>  [muted]2 running · 1 queued[/]');
    const scoutIndex = text.findIndex((line) => line.includes('scout  Localizar conflito'));
    assert.match(text[scoutIndex], /^▌ [◢◣◤◥] scout  Localizar conflito · ↻3≤30 · 12 tools · 12\.3k token \(18%\) · 30s$/);
    assert.ok(mixed[scoutIndex].includes('[borderMuted]▌[/] [warning]') && mixed[scoutIndex].includes('<b>[text]scout[/]</b>'));
    assert.equal(text[scoutIndex + 1], '▌   ╰ reading…');
    assert.ok(mixed[scoutIndex + 1].startsWith('[borderMuted]▌[/] [dim]  ╰ reading…[/]'));
    assert.match(text.find((line) => line.includes('Aplicar patch')), /builder \(twin\)  Aplicar patch · ↻1 · 1 tool · 90\.0k token \(90% · ⇊2\) · 30s$/);
    assert.ok(mixed.find((line) => line.includes('Aplicar patch')).includes('[thinkingXhigh]90%[/]'), 'high context percent is scarlet');
    assert.ok(mixed.find((line) => line.includes('12.3k')).includes('[dim]18%[/]'));
    assert.equal(text.find((line) => line.includes('queued') && !line.includes('AGENTS')), '▌ ◇ 1 queued');
    const line = (needle) => mixed.find((l) => l.includes(needle));
    assert.ok(line('Fix footer').includes('[muted]✓[/]') && !line('Fix footer').includes('[success]'));
    assert.match(stripTokens(line('Fix footer')), /^▌ ✓ builder \(twin\)  Fix footer · 3 tools · 1m 2s$/);
    assert.ok(line('Limite').includes('[warning]✓[/]') && line('Limite').includes('[warning] (turn limit)[/]'));
    assert.ok(line('Parado').includes('[dim]■[/]') && line('Parado').includes('[dim] stopped[/]'));
    assert.ok(line('Quebrou').includes('[thinkingXhigh]✗[/]') && line('Quebrou').includes('[thinkingXhigh] error: boom[/]'));
    assert.ok(line('Cancelado').includes('[thinkingXhigh]✗[/]') && line('Cancelado').includes('[warning] aborted[/]'));

    // Idle: nothing active means a dim heading with no counts.
    const idleTokens = tokenTheme();
    const idle = renderWidget(after, 'idle', idleTokens, 600);
    assert.equal(idle[0], '[dim]▌[/] <b>[dim]AGENTS[/]</b>');
    assert.equal(stripTokens(idle[1]).startsWith('▌ ✓ builder'), true);

    // Overflow: dim rail row, still within the cap.
    const overflowTokens = tokenTheme();
    const overflow = renderWidget(after, 'overflow', overflowTokens, 600);
    assertTokens(overflowTokens.used, `${rel} overflow`);
    assert.equal(overflow.length, 12);
    assert.match(stripTokens(overflow.at(-1)), /^▌ \+\d+ more \(.+\)$/);
    assert.ok(overflow.at(-1).startsWith('[borderMuted]▌[/] [dim]+'));

    // The spinner turns one cell per update.
    const frames = new Set();
    for (let n = 1; n <= 4; n++) frames.add(stripTokens(renderWidget(after, 'mixed', tokenTheme(), 600, n).find((l) => l.includes('Localizar'))).match(/[◢◣◤◥]/)?.[0]);
    assert.equal(frames.size, 4, 'four distinct spinner frames');
  }

  if (process.env.HUD_PREVIEW === '1') {
    const module = await load(pkg, p.SRC);
    console.log('--- agents mixed ---'); console.log(renderWidget(module, 'mixed', tokenTheme(), 600).join('\n'));
    console.log('--- agents idle ---'); console.log(renderWidget(module, 'idle', tokenTheme(), 600).join('\n'));
    console.log('--- agents overflow ---'); console.log(renderWidget(module, 'overflow', tokenTheme(), 600).join('\n'));
  }

  assert.deepEqual(targets.map((rel) => digest(path.join(installed, rel))), installedBefore, 'installed package was modified');
  for (const file of ['install.sh', 'install.ps1']) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.ok(source.indexOf('patch-pi-subagents-hud.mjs') > source.indexOf('patch-pi-subagents-bounded-waits.mjs'), `${file} must run the HUD patch after bounded-waits`);
  }
  console.log('patch-pi-subagents-hud smoke: PASS (DISPOSABLE_VERIFIED)');
} finally {
  Date.now = realDateNow;
  fs.rmSync(temp, { recursive: true, force: true });
}
