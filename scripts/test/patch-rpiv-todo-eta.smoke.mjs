import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire, Module } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { patchPackageRoot } from '../patch-rpiv-todo-eta.mjs';
import { resolvePiSdkRoot } from '../../extensions/test/lib/pi-sdk.mjs';

// STATEFUL RESOURCE PROOF: NO_STATEFUL_RESOURCES. The package is copied to a unique OS-temp directory; all events/UI are in-memory, with no provider, network, install, or app startup.
const installed = 'C:/Users/Miguel.N.Zane/.pi/agent/npm/node_modules/@juicesharp/rpiv-todo';
const temp = await mkdtemp(path.join(os.tmpdir(), 'rpiv-todo-eta-smoke-'));
try {
  const copy = path.join(temp, 'package');
  await cp(installed, copy, { recursive: true });
  assert.equal(await patchPackageRoot(copy), true);
  assert.equal(await patchPackageRoot(copy), false, 'second run is idempotent');

  process.env.NODE_PATH = [
    'C:/Users/Miguel.N.Zane/.pi/agent/npm/node_modules',
    path.join(resolvePiSdkRoot(import.meta.url), 'node_modules'),
  ].join(path.delimiter);
  Module._initPaths();
  const require = createRequire(import.meta.url);
  const stubs = path.join(temp, 'stubs');
  await mkdir(stubs);
  const piAiStub = path.join(stubs, 'pi-ai.ts');
  const tuiStub = path.join(stubs, 'pi-tui.ts');
  await writeFile(piAiStub, 'export const StringEnum = () => ({}); export const Type = new Proxy({}, { get: () => () => ({}) });');
  await writeFile(tuiStub, 'export class Text { constructor(public value: string) {} } export const truncateToWidth = (value: string, width: number) => value.slice(0, width);');
  const { createJiti } = require(path.join(resolvePiSdkRoot(import.meta.url), 'node_modules/jiti/lib/jiti.cjs'));
  const jiti = createJiti(import.meta.url, { fsCache: false, alias: { '@earendil-works/pi-ai': piAiStub, '@earendil-works/pi-tui': tuiStub } });
  const events = new Map();
  const handlers = new Map();
  const emitted = [];
  const registered = {};
  const listeners = new Map();
  const pi = {
    events: {
      emit(channel, data) { emitted.push({ channel, data }); for (const fn of listeners.get(channel) ?? []) fn(data); },
      on(channel, fn) { const set = listeners.get(channel) ?? new Set(); set.add(fn); listeners.set(channel, set); return () => set.delete(fn); },
    },
    on(name, fn) { handlers.set(name, fn); },
    registerTool(tool) { registered.tool = tool; },
    registerCommand() {}, registerShortcut() {},
  };
  const { default: extension } = await jiti.import(path.join(copy, 'index.ts'));
  extension(pi, () => jiti.import(path.join(copy, 'todo-overlay.ts')));
  const widgets = new Map();
  const ui = { theme: { fg: (_color, text) => text, strikethrough: (text) => text }, setWidget(key, factory) { widgets.set(key, factory); } };
  const ctx = { hasUI: true, ui, sessionManager: { getSessionId: () => 'sid-smoke', getBranch: () => [] } };
  await handlers.get('session_start')({}, ctx);
  const replay = emitted.filter((e) => e.channel === 'rpiv-todo:snapshot');
  assert.equal(replay.at(-1).data.sessionId, 'sid-smoke');
  assert.deepEqual(replay.at(-1).data.tasks, []);
  assert.equal(typeof replay.at(-1).data.at, 'number');

  await registered.tool.execute('call-1', { action: 'create', subject: 'Smoke task' }, undefined, undefined, ctx);
  await registered.tool.execute('call-2', { action: 'update', id: 1, status: 'in_progress', activeForm: 'testing' }, undefined, undefined, ctx);
  assert.deepEqual(emitted.at(-1).data.tasks.map(({ id, subject, status }) => ({ id, subject, status })), [{ id: 1, subject: 'Smoke task', status: 'in_progress' }]);
  await handlers.get('tool_execution_end')({ toolName: 'todo', isError: false }, ctx);
  const widget = widgets.get('rpiv-todos');
  const tui = { requestRender() {} };
  const view = widget(tui, ui.theme);
  const render = () => view.render(180).join('\n');

  const eta = listeners.get('pi-work-status:todo-eta');
  assert.ok(eta?.size);
  pi.events.emit('pi-work-status:todo-eta', { sessionId: 'other', items: { 1: { elapsedSec: 5, remainingSec: 5 } } });
  pi.events.emit('pi-work-status:todo-eta', { sessionId: 'sid-smoke', items: { 1: { elapsedSec: -5, remainingSec: 5 } } });
  assert.doesNotMatch(render(), /⏱/);
  pi.events.emit('pi-work-status:todo-eta', { sessionId: 'sid-smoke', items: { 1: { elapsedSec: 30, remainingSec: 30 } } });
  assert.match(render(), /⏱ 30s \| ~30s .*50%/);
  pi.events.emit('pi-work-status:todo-eta', { sessionId: 'sid-smoke', items: { 1: { elapsedSec: 30, remainingSec: null } } });
  assert.match(render(), /⏱ 30s \| ETA indisponível/);
  assert.doesNotMatch(render(), /ETA indisponível.*%/);

  const mismatch = path.join(temp, 'wrong-version');
  await cp(copy, mismatch, { recursive: true });
  const metadata = JSON.parse(await readFile(path.join(mismatch, 'package.json'), 'utf8'));
  metadata.version = '2.11.1';
  await (await import('node:fs/promises')).writeFile(path.join(mismatch, 'package.json'), JSON.stringify(metadata));
  await assert.rejects(() => patchPackageRoot(mismatch), /identity\/version mismatch/);
  await handlers.get('session_shutdown')({}, ctx);
  assert.equal(eta.size, 0, 'shutdown unsubscribes the ETA listener');
  console.log('rpiv-todo ETA patch smoke: PASS');
} finally {
  await rm(temp, { recursive: true, force: true });
}
