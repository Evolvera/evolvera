import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolvePiSdkRoot } from '../../extensions/test/lib/pi-sdk.mjs';
import {
  assertPaletteAndShape, assertTokens, copyPackage, createJitiFor, loadRealTheme, plainTheme, stripTokens, tokenTheme, toUpstream,
} from './lib/hud-render.mjs';

// STATEFUL RESOURCE PROOF: DISPOSABLE_VERIFIED. The installed package is only read; every patch and render
// runs on a copy under one mkdtemp, with HOME pointed there so rpiv-todo's config lookup cannot see the user's.
const root = path.resolve(import.meta.dirname, '../..');
const p = await import(pathToFileURL(path.join(root, 'scripts/patch-rpiv-todo-hud.mjs')));
const installed = p.resolveRoot([]);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'evolvera-rpiv-todo-hud-'));
const digest = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const targets = p.TARGETS;
const installedBefore = targets.map((rel) => digest(path.join(installed, rel)));
const savedEnv = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };

function upstreamCopy(name) {
  const dest = path.join(temp, name);
  copyPackage(installed, dest);
  toUpstream(dest, p.PATCHES);
  return dest;
}
function pristineCopy(name) {
  const dest = upstreamCopy(name);
  for (const [rel, before, after, expectedCount = 1] of [...p.ETA_PATCHES].reverse()) {
    const file = path.join(dest, rel);
    const source = fs.readFileSync(file, 'utf8');
    assert.equal(source.split(after).length - 1, expectedCount, `${rel} ETA fixture anchor`);
    fs.writeFileSync(file, source.replaceAll(after, () => before));
  }
  return dest;
}

try {
  const meta = JSON.parse(fs.readFileSync(path.join(installed, 'package.json'), 'utf8'));
  assert.equal(meta.name, p.PACKAGE_NAME); assert.equal(meta.version, p.PACKAGE_VERSION);

  // 1. Apply, idempotent second run, and exactly one occurrence of every replacement.
  const pkg = path.join(temp, 'pkg');
  copyPackage(installed, pkg);
  let migrationRenames = 0;
  const etaMigration = await p.patch(pkg, { renameFile: async (from, to) => { migrationRenames++; fs.renameSync(from, to); } });
  assert.equal(typeof etaMigration, 'boolean', 'ETA-only migration or pre-combined no-op');
  assert.equal(migrationRenames, etaMigration ? 2 : 0, 'unchanged ETA-only files were staged for commit');
  assert.equal(await p.patch(pkg), false, 'patch is not idempotent');
  for (const [rel, , after] of p.PATCHES) assert.equal(fs.readFileSync(path.join(pkg, rel), 'utf8').split(after).length - 1, 1, `${rel} replacement count`);
  assert.equal(fs.readdirSync(path.join(pkg)).filter((name) => name.startsWith('.rpiv-todo-hud-')).length, 0, 'no staging leftovers');

  const pristine = pristineCopy('pristine');
  assert.equal(await p.patch(pristine), true, 'pristine package is combined');
  assert.equal(await p.patch(pristine), false, 'pristine combined result is idempotent');

  // Patched overlay and formatter still parse with their type annotations stripped.
  for (const rel of ['todo-overlay.ts', 'view/format.ts']) {
    const copy = path.join(pkg, rel.replace(/\.ts$/, '.check.mts')); fs.copyFileSync(path.join(pkg, rel), copy);
    execFileSync(process.execPath, ['--experimental-strip-types', '--check', copy], { stdio: 'pipe' });
    fs.rmSync(copy);
  }

  // 2. Refusals leave the package byte-identical: drifted anchor, partial patch, wrong version.
  const drift = upstreamCopy('drift');
  const driftFile = path.join(drift, 'view/format.ts');
  fs.writeFileSync(driftFile, fs.readFileSync(driftFile, 'utf8').replace('theme.fg("warning", "◐")', 'theme.fg("warning", "◑")'));
  const driftBefore = targets.map((rel) => fs.readFileSync(path.join(drift, rel)));
  await assert.rejects(p.patch(drift), /unrecognized source state|anchor mismatch/);
  assert.deepEqual(targets.map((rel) => fs.readFileSync(path.join(drift, rel))), driftBefore, 'refusal mutated the package');

  const partial = upstreamCopy('partial');
  const partialFormat = path.join(partial, 'view/format.ts');
  const partialPatched = fs.readFileSync(path.join(pkg, 'view/format.ts'));
  fs.writeFileSync(partialFormat, partialPatched);
  const partialBefore = targets.map((rel) => fs.readFileSync(path.join(partial, rel)));
  await assert.rejects(p.patch(partial), /partially patched|unrecognized package state/);
  assert.deepEqual(targets.map((rel) => fs.readFileSync(path.join(partial, rel))), partialBefore, 'partial refusal mutated the package');

  const wrong = upstreamCopy('wrong');
  fs.writeFileSync(path.join(wrong, 'package.json'), JSON.stringify({ name: p.PACKAGE_NAME, version: '9.9.9' }));
  await assert.rejects(p.patch(wrong), /package identity\/version mismatch/);

  // Normal rollback restores committed outputs when the next commit rename fails.
  const rollback = upstreamCopy('rollback');
  const rollbackBefore = targets.map((rel) => fs.readFileSync(path.join(rollback, rel)));
  let renames = 0;
  await assert.rejects(p.patch(rollback, { renameFile: async (from, to) => { if (++renames === 2) throw new Error('disk'); fs.renameSync(from, to); } }), /disk/);
  assert.deepEqual(targets.map((rel) => fs.readFileSync(path.join(rollback, rel))), rollbackBefore, 'failed commit was not rolled back');

  // A failed secondary rollback retains its byte-exact previous file for manual recovery.
  const rollbackRecovery = upstreamCopy('rollback-recovery');
  const originalFormat = fs.readFileSync(path.join(rollbackRecovery, 'view/format.ts'));
  let recoveryRenames = 0;
  let recoveryFailure;
  await assert.rejects(p.patch(rollbackRecovery, { renameFile: async (from, to) => {
    recoveryRenames++;
    if (recoveryRenames === 2 || recoveryRenames === 3) throw new Error(`rename ${recoveryRenames} failed`);
    fs.renameSync(from, to);
  } }), (error) => { recoveryFailure = error; return /rollback failed/.test(error.message); });
  const recoveryPath = recoveryFailure?.message.split('; recovery directories: ')[1];
  assert.ok(recoveryPath?.includes('.rpiv-todo-hud-'), `rollback failure omitted recovery directory: ${recoveryFailure?.message}`);
  assert.ok(fs.existsSync(path.join(recoveryPath, 'format.ts')), 'rollback recovery prev file was removed');
  assert.deepEqual(fs.readFileSync(path.join(recoveryPath, 'format.ts')), originalFormat, 'rollback recovery prev bytes changed');

  // 3. Render the patched overlay with a fake theme and with the real theme.
  process.env.HOME = process.env.USERPROFILE = path.join(temp, 'home');
  fs.mkdirSync(process.env.HOME, { recursive: true });
  const piTuiRoot = path.join(resolvePiSdkRoot(import.meta.url), 'node_modules', '@earendil-works', 'pi-tui');
  const jiti = createJitiFor(import.meta.url, {
    '@earendil-works/pi-tui': piTuiRoot,
    '@juicesharp/rpiv-config': path.join(path.dirname(installed), 'rpiv-config'), // installed dependency resolved for rpiv-todo's ^2.11.0 range
  });
  // One entry module, so the overlay and the test share a single store instance.
  fs.writeFileSync(path.join(pkg, 'hud-entry.ts'), 'export { TodoOverlay } from "./todo-overlay.ts";\nexport * as store from "./state/store.js";\n');
  const { TodoOverlay, store } = await jiti.import(path.join(pkg, 'hud-entry.ts'));
  const { visibleWidth } = await jiti.import(path.join(piTuiRoot, 'dist', 'index.js'));
  const realTheme = await loadRealTheme(root);

  function overlayFor(tasks, theme) {
    store.__resetState(); store.setActiveRenderSession('s'); store.replaceState('s', { tasks, nextId: tasks.length + 1 });
    const overlay = new TodoOverlay(); let factory;
    overlay.setUICtx({ theme, setWidget: (_key, f) => { factory = f; } });
    overlay.update();
    const widget = factory({ requestRender() {} }, theme);
    return { overlay, render: (width) => widget.render(width) };
  }
  const task = (id, status, subject, extra = {}) => ({ id, status, subject, ...extra });
  const mixed = [
    task(1, 'completed', 'Ajustar SYSTEM.md'),
    task(2, 'in_progress', 'Ajustar footer', { activeForm: 'escrevendo testes' }),
    task(3, 'pending', 'Revisar subagentes', { blockedBy: [2] }),
    task(4, 'pending', 'Publicar'),
    task(5, 'completed', 'Medir contexto'),
  ];

  // Geometry is judged on plain and real-theme output; the token theme's markup is not zero-width,
  // so it is only rendered wide enough that nothing truncates.
  for (const width of [20, 40, 80, 160]) {
    const plain = overlayFor(mixed, plainTheme).render(width);
    assert.equal(plain.at(-1), '', 'trailing spacer kept');
    assert.equal(plain.length, 1 + mixed.length + 1);
    assertPaletteAndShape(plain, { width, visibleWidth, label: `plain@${width}` });
    for (const line of plain.slice(0, -1)) assert.ok(line.startsWith('▌'), `rail missing: ${line}`);

    const real = overlayFor(mixed, realTheme).render(width);
    assertPaletteAndShape(real, { width, visibleWidth, label: `real@${width}` });
    assert.equal(real.length, plain.length);
    assert.ok(!real.join('\n').includes('\u001b[38;2;93;124;240m'), 'blue (royal) leaked into the real theme render');
  }

  // Content at a comfortable width.
  const tokens = tokenTheme();
  const combinedOverlay = overlayFor(mixed, tokens);
  combinedOverlay.overlay.setEta(new Map([[2, { elapsedSec: 30, remainingSec: 30 }]]));
  combinedOverlay.overlay.update();
  const wide = combinedOverlay.render(400);
  assertTokens(tokens.used, 'expanded');
  const text = wide.map(stripTokens);
  assert.match(text[0], /^▌ TODO ━{10} 2\/5$/);
  assert.equal(wide[0], '[accent]▌[/] <b>[accent]TODO[/]</b> [warning]━━━━[/][borderMuted]━━━━━━[/] [text]2/5[/]');
  assert.match(wide[1], /^\[borderMuted\]▌\[\/\] \[dim\]✓\[\/\] \[dim\]#1\[\/\] <s>\[dim\]Ajustar SYSTEM\.md\[\/\]<\/s>$/);
  assert.equal(text[2], '▌ ◆ #2 Ajustar footer  › escrevendo testes ⏱ 30s | ~30s █████░░░░░ 50%');
  assert.ok(wide[2].includes('[accent]◆[/]') && wide[2].includes('<b>[text]Ajustar footer[/]</b>') && wide[2].includes('[warning]› escrevendo testes[/]'));
  assert.equal(text[3], '▌ ◇ #3 Revisar subagentes  ⊣ #2');
  assert.ok(wide[3].includes('[muted]◇[/]') && wide[3].includes('[text]Revisar subagentes[/]') && wide[3].includes('[dim]⊣ #2[/]'));
  assert.equal(text[4], '▌ ◇ #4 Publicar');

  // Idle list: heading rail and title go dim; no activeForm without in_progress.
  const idleTokens = tokenTheme();
  const idle = overlayFor([task(1, 'completed', 'Feito')], idleTokens).render(400);
  assert.match(idle[0], /^\[dim\]▌\[\/\] <b>\[dim\]TODO\[\/\]<\/b> \[warning\]━{10}\[\/\] \[text\]1\/1\[\/\]$/);

  // Narrow widths shrink or drop the bar, never the rail.
  assert.equal(overlayFor(mixed, plainTheme).render(20)[0], '▌ TODO ━━━━━━━━━ 2/5');
  assert.equal(overlayFor(mixed, plainTheme).render(12)[0], '▌ TODO 2/5');

  // Collapsed: heading + dim hint on one line, then the spacer.
  const collapsedTokens = tokenTheme();
  const collapsed = overlayFor(mixed, collapsedTokens);
  collapsed.overlay.toggleCollapse();
  const collapsedLines = collapsed.render(400);
  assertTokens(collapsedTokens.used, 'collapsed');
  assert.equal(collapsedLines.length, 2); assert.equal(collapsedLines[1], '');
  assert.match(stripTokens(collapsedLines[0]), /^▌ TODO ━{10} 2\/5  .+$/);
  assert.match(collapsedLines[0], /\[dim\][^[]*\[\/\]$/, 'hint is dim');
  const plainCollapsed = overlayFor(mixed, plainTheme); plainCollapsed.overlay.toggleCollapse();
  assertPaletteAndShape(plainCollapsed.render(20), { width: 20, visibleWidth, label: 'collapsed@20' });

  // Overflow: summary is a dim rail row and nothing exceeds the row budget (11 body rows + heading + spacer).
  const many = Array.from({ length: 16 }, (_, i) => task(i + 1, i < 3 ? 'completed' : 'pending', `Tarefa ${i + 1}`));
  const overflowTokens = tokenTheme();
  const overflow = overlayFor(many, overflowTokens).render(400);
  assert.equal(overflow.length, 13);
  assert.match(stripTokens(overflow.at(-2)), /^▌ \+\d+ more \(.+\)$/);
  assert.ok(overflow.at(-2).includes('[dim]+') && overflow.at(-2).startsWith('[borderMuted]▌[/] '));
  assertTokens(overflowTokens.used, 'overflow');

  // Completed rows from a previous turn stay hidden (tracking untouched).
  const tracked = overlayFor(mixed, plainTheme);
  tracked.render(80); tracked.overlay.hideCompletedTasksFromPreviousTurn();
  assert.equal(tracked.render(80).length, 1 + 3 + 1);

  // Every other overlay state is rendered by the real theme without throwing (unknown tokens throw there).
  for (const width of [20, 40, 80, 160]) {
    assertPaletteAndShape(overlayFor(many, realTheme).render(width), { width, visibleWidth, label: `real-overflow@${width}` });
    const c = overlayFor(mixed, realTheme); c.overlay.toggleCollapse();
    assertPaletteAndShape(c.render(width), { width, visibleWidth, label: `real-collapsed@${width}` });
  }

  // The /todos command and tool hooks keep their formatter.
  const formatSource = fs.readFileSync(path.join(pkg, 'view/format.ts'), 'utf8');
  assert.match(formatSource, /export function formatCommandTaskLine[\s\S]*⛓/);
  assert.ok(formatSource.includes('"success"'), 'tool result echo keeps its own palette');

  if (process.env.HUD_PREVIEW === '1') {
    const preview = overlayFor(mixed, tokenTheme());
    console.log('--- todo expanded ---'); console.log(preview.render(400).join('\n'));
    preview.overlay.toggleCollapse();
    console.log('--- todo collapsed ---'); console.log(preview.render(400).join('\n'));
    console.log('--- todo overflow ---'); console.log(overlayFor(many, tokenTheme()).render(400).join('\n'));
  }

  assert.deepEqual(targets.map((rel) => digest(path.join(installed, rel))), installedBefore, 'installed package was modified');
  for (const file of ['install.sh', 'install.ps1']) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.ok(source.indexOf('patch-rpiv-todo-hud.mjs') > source.indexOf('@juicesharp/rpiv-todo@2.11.0'), `${file} must patch after installing rpiv-todo`);
  }
  console.log('patch-rpiv-todo-hud smoke: PASS (DISPOSABLE_VERIFIED)');
} finally {
  for (const [key, value] of Object.entries(savedEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  fs.rmSync(temp, { recursive: true, force: true });
}
