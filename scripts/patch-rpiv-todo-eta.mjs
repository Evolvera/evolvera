#!/usr/bin/env node
import { chmod, lstat, mkdtemp, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PACKAGE_NAME = '@juicesharp/rpiv-todo';
export const PACKAGE_VERSION = '2.11.0';
const FILES = [
  {
    name: 'index.ts', sha: '509904d71a601ba2e2694c3f0fda1f014553eaafde1515ddd99dab8bb123d85a',
    edits: [
      ['\t\t\treplaceState(id, replayFromBranch(ctx));', '\t\t\treplaceState(id, replayFromBranch(ctx));\n\t\t\temitTodoSnapshot(pi, id);'],
      ['\t\t// The shutting-down session\'s own data slot is always evicted.\n\t\tevictSession(s);', '\t\t// The shutting-down session\'s own data slot is always evicted.\n\t\tetaBySession.delete(s);\n\t\tif (etaUnsubscribe) { etaUnsubscribe(); etaUnsubscribe = undefined; }\n\t\tevictSession(s);'],
      ['\tregisterTodoTool(pi);', `\tconst etaBySession = new Map<string, Map<number, { elapsedSec: number | null; remainingSec: number | null }>>();
\tconst emitTodoSnapshot = (api: ExtensionAPI, sessionId: string): void => {
\t\tconst tasks = getState(sessionId).tasks;
\t\tapi.events.emit("rpiv-todo:snapshot", { sessionId, tasks: tasks.map(({ id, subject, status }) => ({ id, subject, status })), at: Date.now() });
\t};
\tlet etaUnsubscribe: (() => void) | undefined;
\tconst validEta = (value: unknown): value is { sessionId: string; items: Record<string, { elapsedSec: number | null; remainingSec: number | null }> } => {
\t\tif (!value || typeof value !== "object" || Array.isArray(value)) return false;
\t\tconst v = value as Record<string, unknown>;
\t\tif (typeof v.sessionId !== "string" || !v.sessionId || !v.items || typeof v.items !== "object" || Array.isArray(v.items) || Object.keys(v).some((k) => k !== "sessionId" && k !== "items")) return false;
\t\treturn Object.entries(v.items as Record<string, unknown>).every(([id, item]) => /^\\d+$/.test(id) && !!item && typeof item === "object" && !Array.isArray(item) && Object.keys(item).length === 2 && ["elapsedSec", "remainingSec"].every((k) => Object.hasOwn(item, k) && (((item as Record<string, unknown>)[k] === null) || (typeof (item as Record<string, unknown>)[k] === "number" && Number.isFinite((item as Record<string, number>)[k]) && (item as Record<string, number>)[k] >= 0))));
\t};
\tetaUnsubscribe = pi.events.on("pi-work-status:todo-eta", (payload) => {
\t\tif (!validEta(payload)) return;
\t\tconst items = new Map(Object.entries(payload.items).map(([id, item]) => [Number(id), item]));
\t\tetaBySession.set(payload.sessionId, items);
\t\tif (payload.sessionId === getActiveRenderSession() && todoOverlay) { todoOverlay.setEta(items); todoOverlay.update(); }
\t});
\tregisterTodoTool(pi);`],
      ['import {\n\tclearActiveRenderSession,\n\tevictSession,\n\tgetActiveRenderSession,\n\tgetRenderState,', 'import {\n\tclearActiveRenderSession,\n\tevictSession,\n\tgetActiveRenderSession,\n\tgetRenderState,\n\tgetState,'],
      ['\t\tconst generation = ++lifecycleGeneration;\n\t\tuiCtx = ctx.ui;', '\t\tconst generation = ++lifecycleGeneration;\n\t\tuiCtx = ctx.ui;\n\t\ttodoOverlay?.setEta(etaBySession.get(id) ?? new Map());'],
      ['\t\tif (isForeground) await updateTodoOverlay(true);', '\t\tif (isForeground) {\n\t\t\tconst id = sid(ctx);\n\t\t\temitTodoSnapshot(pi, id);\n\t\t\ttodoOverlay?.setEta(etaBySession.get(id) ?? new Map());\n\t\t\tawait updateTodoOverlay(true);\n\t\t}'],
    ],
  },
  {
    name: 'todo.ts', sha: 'ae4b00e934d896ed73f15097758d31a34989b2512cc93cf86a47906c0ce58d27',
    edits: [[
      '\t\t\tcommitState(sid(ctx), result.state);',
      '\t\t\tcommitState(sid(ctx), result.state);\n\t\t\tpi.events.emit("rpiv-todo:snapshot", { sessionId: sid(ctx), tasks: result.state.tasks.map(({ id, subject, status }) => ({ id, subject, status })), at: Date.now() });',
    ]],
  },
  {
    name: 'todo-overlay.ts', sha: 'bcc44d001ff08cc4c42d019163d78214edc9df2f3ba9219080f01f13ad8520e3',
    edits: [
      ['export class TodoOverlay {', 'function formatEtaSeconds(seconds: number | null): string {\n\tconst value = Math.max(0, Math.floor(seconds ?? 0));\n\tconst minutes = Math.floor(value / 60);\n\treturn minutes ? `${minutes}m ${value % 60}s` : `${value}s`;\n}\n\nexport class TodoOverlay {'],
      ['\tprivate collapsed = false;', '\tprivate collapsed = false;\n\tprivate eta = new Map<number, { elapsedSec: number | null; remainingSec: number | null }>();'],
      ['\tupdate(): void {', '\tsetEta(items: Map<number, { elapsedSec: number | null; remainingSec: number | null }>): void {\n\t\tthis.eta = new Map(items);\n\t}\n\n\tupdate(): void {'],
      ['\t\tfor (const task of layout.visible) {\n\t\t\tlines.push(truncate(`${theme.fg("dim", "├─")} ${formatOverlayTaskLine(task, theme, showIds)}`));\n\t\t}', `\t\tfor (const task of layout.visible) {
\t\t\tlet row = formatOverlayTaskLine(task, theme, showIds);
\t\t\tconst eta = task.status === "in_progress" ? this.eta.get(task.id) : undefined;
\t\t\tif (eta) {
\t\t\t\tconst elapsed = formatEtaSeconds(eta.elapsedSec);
\t\t\t\tif (eta.remainingSec === null) row += \` ⏱ \${elapsed} | ETA indisponível\`;
\t\t\t\telse {
\t\t\t\t\tconst total = (eta.elapsedSec ?? 0) + eta.remainingSec;
\t\t\t\t\tconst pct = Math.min(99, total > 0 ? Math.floor(((eta.elapsedSec ?? 0) / total) * 100) : 0);
\t\t\t\t\tconst filled = Math.floor(pct / 10);
\t\t\t\t\trow += \` ⏱ \${elapsed} | ~\${formatEtaSeconds(eta.remainingSec)} \${"█".repeat(filled)}\${"░".repeat(10 - filled)} \${pct}%\`;
\t\t\t\t}
\t\t\t}
\t\t\tlines.push(truncate(\`\${theme.fg("dim", "├─")} \${row}\`));
\t\t}`],
      ['\t\tthis.resetCompletedDisplayState();\n\t}', '\t\tthis.resetCompletedDisplayState();\n\t\tthis.eta.clear();\n\t}'],
    ],
  },
];

function hash(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function fail(message) { console.error(`rpiv-todo ETA patch refused: ${message}`); process.exitCode = 1; }
function packageRootFromArgs(argv) {
  const value = argv.length === 2 && argv[0] === '--package-root' ? argv[1] : process.env.RPIV_TODO_PACKAGE_ROOT;
  if (argv.length && !(argv.length === 2 && argv[0] === '--package-root')) throw new Error('unsupported arguments');
  if (!value || !path.isAbsolute(value)) throw new Error('set RPIV_TODO_PACKAGE_ROOT or pass --package-root <absolute-dir>');
  return value;
}
async function stage(target, bytes, mode) {
  const directory = await mkdtemp(path.join(path.dirname(target), '.rpiv-todo-eta-'));
  const temp = path.join(directory, path.basename(target));
  try {
    await writeFile(temp, bytes, { mode, flag: 'wx' }); await chmod(temp, mode);
    const handle = await open(temp, 'r+'); try { await handle.sync(); } finally { await handle.close(); }
    if (! (await readFile(temp)).equals(bytes)) throw new Error(`staged bytes mismatch: ${target}`);
    return { directory, path: temp };
  } catch (e) { await rm(directory, { recursive: true, force: true }); throw e; }
}
async function prepare(root) {
  const meta = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  if (meta.name !== PACKAGE_NAME || meta.version !== PACKAGE_VERSION) throw new Error('package identity/version mismatch');
  const prepared = [];
  for (const file of FILES) {
    const target = path.join(root, file.name); const stat = await lstat(target);
    if (!stat.isFile()) throw new Error(`not a regular file: ${file.name}`);
    const original = await readFile(target); const text = original.toString('utf8');
    if (!Buffer.from(text).equals(original)) throw new Error(`invalid UTF-8: ${file.name}`);
    const sourceHash = hash(original);
    let output = text;
    if (sourceHash === file.sha) {
      for (const [before, after] of file.edits) {
        const count = output.split(before).length - 1;
        if (count < 1) throw new Error(`anchor missing: ${file.name}`);
        output = output.replaceAll(before, after);
      }
    } else {
      let reverted = text;
      for (const [before, after] of [...file.edits].reverse()) reverted = reverted.replaceAll(after, before);
      if (hash(Buffer.from(reverted)) !== file.sha) throw new Error(`unexpected source digest: ${file.name}`);
    }
    const bytes = Buffer.from(output, 'utf8');
    prepared.push({ name: file.name, target, original, output: bytes, mode: stat.mode & 0o7777, changed: !bytes.equals(original) });
  }
  return prepared;
}
async function patchPackageRoot(root, { renameFile = rename } = {}) {
  const files = await prepare(root); const changed = files.filter((f) => f.changed); if (!changed.length) return false;
  const staged = []; const rollback = [];
  try {
    for (const f of changed) { staged.push(await stage(f.target, f.output, f.mode)); rollback.push(await stage(f.target, f.original, f.mode)); }
    const committed = [];
    try {
      for (let i = 0; i < changed.length; i++) { committed.push(i); await renameFile(staged[i].path, changed[i].target); if (!(await readFile(changed[i].target)).equals(changed[i].output)) throw new Error(`commit verify failed: ${changed[i].name}`); }
    } catch (error) {
      for (const i of committed.reverse()) { await renameFile(rollback[i].path, changed[i].target); if (!(await readFile(changed[i].target)).equals(changed[i].original)) throw new Error(`rollback verify failed: ${changed[i].name}`); }
      throw new Error(`patch commit failed: ${error instanceof Error ? error.message : 'unknown failure'}`);
    }
  } finally { await Promise.all([...staged, ...rollback].map((s) => rm(s.directory, { recursive: true, force: true }))); }
  return true;
}
async function main() { try { console.log(await patchPackageRoot(packageRootFromArgs(process.argv.slice(2))) ? 'rpiv-todo ETA patch applied.' : 'rpiv-todo ETA patch already applied.'); } catch (e) { fail(e instanceof Error ? e.message : 'unknown refusal'); } }
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
export { packageRootFromArgs, patchPackageRoot };
