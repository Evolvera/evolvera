#!/usr/bin/env node
// Restyles the rpiv-todo overlay (the panel above the editor) as a "cyberpunk HUD" so it matches the
// footer in extensions/clean-ui.ts: a left rail, a heat-free progress bar, single-cell glyphs and a
// palette of red, orange, white and gray only (theme tokens accent, warning, text, muted, dim,
// borderMuted). Presentation only: task state, hide-completed tracking, the row budget, truncation and
// the /todos command are untouched. `formatOverlayTaskLine` and `overlayStatusGlyph` are used by the
// overlay alone, so nothing else changes colour.
import { chmod, lstat, mkdtemp, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_NAME = '@juicesharp/rpiv-todo';
const PACKAGE_VERSION = '2.11.0';
const MARKER = 'HUD presentation (Evolvera patch v1)';
const OVERLAY = 'todo-overlay.ts';
const FORMAT = 'view/format.ts';
const TARGETS = ['index.ts', 'todo.ts', OVERLAY, FORMAT];
const BASE_HASHES = {
  'index.ts': '509904d71a601ba2e2694c3f0fda1f014553eaafde1515ddd99dab8bb123d85a',
  'todo.ts': 'ae4b00e934d896ed73f15097758d31a34989b2512cc93cf86a47906c0ce58d27',
  'todo-overlay.ts': 'bcc44d001ff08cc4c42d019163d78214edc9df2f3ba9219080f01f13ad8520e3',
  'view/format.ts': '86e6055085c0a74adb86699333ebd998487713b804ef760baf0c1995f8ab1ed4',
};

const HELPERS = `// ---- ${MARKER} ----
// Rail + progress bar shared with the footer in clean-ui.ts. Colours are theme tokens only.
const HUD_RAIL = "▌";
const HUD_BAR_CELL = "━";
const HUD_BAR_MAX = 10;

/** Completed cells in warning, remaining in borderMuted; empty when there is no room for a readable bar. */
function hudProgressBar(theme: Theme, completed: number, total: number, room: number): string {
	const cells = Math.min(HUD_BAR_MAX, room);
	if (cells < 3 || total <= 0) return "";
	const filled = Math.round((completed / total) * cells);
	const done = filled > 0 ? theme.fg("warning", HUD_BAR_CELL.repeat(filled)) : "";
	return done + (filled < cells ? theme.fg("borderMuted", HUD_BAR_CELL.repeat(cells - filled)) : "");
}

export class TodoOverlay {`;

const HEADING_BEFORE = `		const headingColor = hasActive ? "accent" : "dim";
		const headingIcon = hasActive ? "●" : "○";
		const headingText = \`\${t("overlay.heading", OVERLAY_HEADING)} (\${counts.completed}/\${counts.total})\`;
		const heading = truncate(\`\${theme.fg(headingColor, headingIcon)} \${theme.fg(headingColor, headingText)}\`);
`;
const HEADING_AFTER = `		const headingColor = hasActive ? "accent" : "dim";
		const headingTitle = t("overlay.heading", OVERLAY_HEADING).toLocaleUpperCase();
		const headingCount = \`\${counts.completed}/\${counts.total}\`;
		// rail + space + title + space + bar + space + count; the bar yields to narrow widths.
		const headingBar = hudProgressBar(theme, counts.completed, counts.total, width - 4 - headingTitle.length - headingCount.length);
		const headingLine = \`\${theme.fg(headingColor, HUD_RAIL)} \${theme.bold(theme.fg(headingColor, headingTitle))}\${headingBar ? \` \${headingBar}\` : ""} \${theme.fg("text", headingCount)}\`;
		const heading = truncate(headingLine);
		const rowRail = \`\${theme.fg("borderMuted", HUD_RAIL)} \`;
`;

const FORMAT_GLYPH_BEFORE = `		case "pending":
			return theme.fg("dim", "○");
		case "in_progress":
			return theme.fg("warning", "◐");
		case "completed":
			return theme.fg("success", "✓");
		case "deleted":
			return theme.fg("error", "✗");
`;
const FORMAT_GLYPH_AFTER = `		case "pending":
			return theme.fg("muted", "◇");
		case "in_progress":
			return theme.fg("accent", "◆");
		case "completed":
			return theme.fg("dim", "✓");
		case "deleted":
			return theme.fg("dim", "✗");
`;

const FORMAT_LINE_BEFORE = `	const glyph = overlayStatusGlyph(t.status, theme);
	const subjectColor =
		t.status === "in_progress" ? "accent" : t.status === "completed" || t.status === "deleted" ? "muted" : "text";
	let subject = theme.fg(subjectColor, sanitizeTerminalText(t.subject));
	if (t.status === "completed" || t.status === "deleted") {
		subject = theme.strikethrough(subject);
	}
	let line = \`\${glyph}\`;
	if (showId) line += \` \${theme.fg("dim", \`#\${t.id}\`)}\`;
	line += \` \${subject}\`;
	if (t.status === "in_progress" && t.activeForm) {
		line += \` \${theme.fg("muted", \`(\${sanitizeTerminalText(t.activeForm)})\`)}\`;
	}
	if (t.blockedBy && t.blockedBy.length > 0) {
		line += \` \${theme.fg("muted", \`⛓ \${t.blockedBy.map((id) => \`#\${id}\`).join(",")}\`)}\`;
	}
	return line;
`;
const FORMAT_LINE_AFTER = `	const glyph = overlayStatusGlyph(t.status, theme);
	const finished = t.status === "completed" || t.status === "deleted";
	const subjectText = sanitizeTerminalText(t.subject);
	let subject =
		t.status === "in_progress" ? theme.bold(theme.fg("text", subjectText)) : theme.fg(finished ? "dim" : "text", subjectText);
	if (finished) {
		subject = theme.strikethrough(subject);
	}
	let line = \`\${glyph}\`;
	if (showId) line += \` \${theme.fg("dim", \`#\${t.id}\`)}\`;
	line += \` \${subject}\`;
	if (t.status === "in_progress" && t.activeForm) {
		line += \`  \${theme.fg("warning", \`› \${sanitizeTerminalText(t.activeForm)}\`)}\`;
	}
	if (t.blockedBy && t.blockedBy.length > 0) {
		line += \`  \${theme.fg("dim", \`⊣ \${t.blockedBy.map((id) => \`#\${id}\`).join(",")}\`)}\`;
	}
	return line;
`;

const ETA_PATCHES = [
  ['index.ts', '\t\t\treplaceState(id, replayFromBranch(ctx));', '\t\t\treplaceState(id, replayFromBranch(ctx));\n\t\t\temitTodoSnapshot(pi, id);', 2],
  ['index.ts', '\t\t// The shutting-down session\'s own data slot is always evicted.\n\t\tevictSession(s);', '\t\t// The shutting-down session\'s own data slot is always evicted.\n\t\tetaBySession.delete(s);\n\t\tif (etaUnsubscribe) { etaUnsubscribe(); etaUnsubscribe = undefined; }\n\t\tevictSession(s);'],
  ['index.ts', '\tregisterTodoTool(pi);', `\tconst etaBySession = new Map<string, Map<number, { elapsedSec: number | null; remainingSec: number | null }>>();
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
  ['index.ts', 'import {\n\tclearActiveRenderSession,\n\tevictSession,\n\tgetActiveRenderSession,\n\tgetRenderState,', 'import {\n\tclearActiveRenderSession,\n\tevictSession,\n\tgetActiveRenderSession,\n\tgetRenderState,\n\tgetState,'],
  ['index.ts', '\t\tconst generation = ++lifecycleGeneration;\n\t\tuiCtx = ctx.ui;', '\t\tconst generation = ++lifecycleGeneration;\n\t\tuiCtx = ctx.ui;\n\t\ttodoOverlay?.setEta(etaBySession.get(id) ?? new Map());'],
  ['index.ts', '\t\tif (isForeground) await updateTodoOverlay(true);', '\t\tif (isForeground) {\n\t\t\tconst id = sid(ctx);\n\t\t\temitTodoSnapshot(pi, id);\n\t\t\ttodoOverlay?.setEta(etaBySession.get(id) ?? new Map());\n\t\t\tawait updateTodoOverlay(true);\n\t\t}'],
  ['todo.ts', '\t\t\tcommitState(sid(ctx), result.state);', '\t\t\tcommitState(sid(ctx), result.state);\n\t\t\tpi.events.emit("rpiv-todo:snapshot", { sessionId: sid(ctx), tasks: result.state.tasks.map(({ id, subject, status }) => ({ id, subject, status })), at: Date.now() });'],
  [OVERLAY, 'export class TodoOverlay {', 'function formatEtaSeconds(seconds: number | null): string {\n\tconst value = Math.max(0, Math.floor(seconds ?? 0));\n\tconst minutes = Math.floor(value / 60);\n\treturn minutes ? `${minutes}m ${value % 60}s` : `${value}s`;\n}\n\nexport class TodoOverlay {'],
  [OVERLAY, '\tprivate collapsed = false;', '\tprivate collapsed = false;\n\tprivate eta = new Map<number, { elapsedSec: number | null; remainingSec: number | null }>();'],
  [OVERLAY, '\tupdate(): void {', '\tsetEta(items: Map<number, { elapsedSec: number | null; remainingSec: number | null }>): void {\n\t\tthis.eta = new Map(items);\n\t}\n\n\tupdate(): void {'],
  [OVERLAY, '\t\tfor (const task of layout.visible) {\n\t\t\tlines.push(truncate(`${theme.fg("dim", "├─")} ${formatOverlayTaskLine(task, theme, showIds)}`));\n\t\t}', '\t\tfor (const task of layout.visible) {\n\t\t\tlet row = formatOverlayTaskLine(task, theme, showIds);\n\t\t\tconst eta = task.status === "in_progress" ? this.eta.get(task.id) : undefined;\n\t\t\tif (eta) {\n\t\t\t\tconst elapsed = formatEtaSeconds(eta.elapsedSec);\n\t\t\t\tif (eta.remainingSec === null) row += ` ⏱ ${elapsed} | ETA indisponível`;\n\t\t\t\telse {\n\t\t\t\t\tconst total = (eta.elapsedSec ?? 0) + eta.remainingSec;\n\t\t\t\t\tconst pct = Math.min(99, total > 0 ? Math.floor(((eta.elapsedSec ?? 0) / total) * 100) : 0);\n\t\t\t\t\tconst filled = Math.floor(pct / 10);\n\t\t\t\t\trow += ` ⏱ ${elapsed} | ~${formatEtaSeconds(eta.remainingSec)} ${"█".repeat(filled)}${"░".repeat(10 - filled)} ${pct}%`;\n\t\t\t\t}\n\t\t\t}\n\t\t\tlines.push(truncate(`${theme.fg("dim", "├─")} ${row}`));\n\t\t}'],
  [OVERLAY, '\t\tthis.resetCompletedDisplayState();\n\t}', '\t\tthis.resetCompletedDisplayState();\n\t\tthis.eta.clear();\n\t}'],
];

const ETA_ROW_BEFORE = ETA_PATCHES.find(([rel, before]) => rel === OVERLAY && before.includes('for (const task of layout.visible)'))[2];
const ETA_ROW_AFTER = ETA_ROW_BEFORE.replace('lines.push(truncate(`${theme.fg("dim", "├─")} ${row}`));', 'lines.push(truncate(`${rowRail}${row}`));');
const PATCHES = [
  [OVERLAY, 'const OVERLAY_HEADING = "Todos";', 'const OVERLAY_HEADING = "TODO";'],
  [OVERLAY, 'export class TodoOverlay {', HELPERS],
  [OVERLAY, HEADING_BEFORE, HEADING_AFTER],
  [OVERLAY, '// Collapsed view: just the heading + a dim "└─" expand hint, then the', '// Collapsed view: just the heading + a dim expand hint on the same line, then the'],
  [OVERLAY, 'return this.withTrailingSpacer([heading, truncate(`${theme.fg("dim", "└─")} ${theme.fg("dim", hint)}`)]);', 'return this.withTrailingSpacer([truncate(`${headingLine}  ${theme.fg("dim", hint)}`)]);'],
  [OVERLAY, ETA_ROW_BEFORE, ETA_ROW_AFTER],
  [OVERLAY, 'if (layout.hiddenCompleted === 0 && layout.truncatedTail === 0) {\n\t\t\tconst last = lines.length - 1;\n\t\t\tlines[last] = lines[last].replace("├─", "└─");\n\t\t\treturn this.withTrailingSpacer(lines);', 'if (layout.hiddenCompleted === 0 && layout.truncatedTail === 0) {\n\t\t\treturn this.withTrailingSpacer(lines);'],
  [OVERLAY, 'lines.push(truncate(`${theme.fg("dim", "└─")} ${theme.fg("dim", summary)}`));', 'lines.push(truncate(`${rowRail}${theme.fg("dim", summary)}`));'],
  [FORMAT, FORMAT_GLYPH_BEFORE, FORMAT_GLYPH_AFTER],
  [FORMAT, FORMAT_LINE_BEFORE, FORMAT_LINE_AFTER],
];

function resolveRoot(argv, env = process.env) {
  if (!argv.length) return path.join(env.PI_CODING_AGENT_DIR || path.join(os.homedir(), '.pi', 'agent'), 'npm', 'node_modules', '@juicesharp', 'rpiv-todo');
  if (argv.length === 2 && argv[0] === '--package-root' && path.isAbsolute(argv[1])) return argv[1];
  throw new Error('unsupported arguments');
}
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const own = (list, rel) => list.filter(([file]) => file === rel);
function transform(source, patches, direction, rel) {
  const subset = own(patches, rel);
  const ordered = direction === 'forward' ? subset : [...subset].reverse();
  for (const [, before, after, expectedCount = 1] of ordered) {
    const from = direction === 'forward' ? before : after;
    const to = direction === 'forward' ? after : before;
    if (source.split(from).length - 1 !== expectedCount) throw new Error(`anchor mismatch: ${rel}`);
    source = source.replaceAll(from, () => to);
  }
  return source;
}
function normalize(rel, bytes) {
  const source = bytes.toString('utf8');
  if (!Buffer.from(source).equals(bytes)) throw new Error(`invalid UTF-8: ${rel}`);
  const hash = digest(bytes);
  if (hash === BASE_HASHES[rel]) return { source, eta: false, hud: false };
  const attempts = [
    { eta: true, hud: true, run: (s) => transform(transform(s, PATCHES, 'reverse', rel), ETA_PATCHES, 'reverse', rel) },
    { eta: true, hud: false, run: (s) => transform(s, ETA_PATCHES, 'reverse', rel) },
    { eta: false, hud: true, run: (s) => transform(s, PATCHES, 'reverse', rel) },
  ];
  for (const state of attempts) {
    try {
      const base = state.run(source);
      if (digest(Buffer.from(base)) === BASE_HASHES[rel]) return { source: base, eta: state.eta && own(ETA_PATCHES, rel).length > 0, hud: state.hud && own(PATCHES, rel).length > 0 };
    } catch {}
  }
  throw new Error(`unrecognized source state: ${rel}`);
}
async function stage(target, bytes, mode) {
  const dir = await mkdtemp(path.join(path.dirname(target), '.rpiv-todo-hud-'));
  const file = path.join(dir, path.basename(target));
  try {
    await writeFile(file, bytes, { flag: 'wx', mode }); await chmod(file, mode);
    const h = await open(file, 'r+'); try { await h.sync(); } finally { await h.close(); }
    if (!(await readFile(file)).equals(bytes)) throw new Error(`staged bytes mismatch: ${target}`);
    return { dir, file };
  } catch (error) { await rm(dir, { recursive: true, force: true }); throw error; }
}
async function patch(root, { renameFile = rename } = {}) {
  const meta = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  if (meta.name !== PACKAGE_NAME || meta.version !== PACKAGE_VERSION) throw new Error('package identity/version mismatch');
  const files = [];
  for (const rel of TARGETS) {
    const target = path.join(root, rel); const stat = await lstat(target);
    if (!stat.isFile()) throw new Error(`not a regular file: ${rel}`);
    const original = await readFile(target);
    files.push({ rel, target, original, mode: stat.mode & 0o7777, state: normalize(rel, original) });
  }
  const etaStates = files.filter((f) => ['index.ts', 'todo.ts', OVERLAY].includes(f.rel)).map((f) => f.state.eta);
  const hudStates = files.filter((f) => [OVERLAY, FORMAT].includes(f.rel)).map((f) => f.state.hud);
  const pristine = etaStates.every((value) => !value) && hudStates.every((value) => !value);
  const etaOnly = etaStates.every(Boolean) && hudStates.every((value) => !value);
  const combined = etaStates.every(Boolean) && hudStates.every(Boolean);
  if (!pristine && !etaOnly && !combined) {
    if (etaStates.every((value) => !value) && hudStates.some(Boolean)) throw new Error('HUD-only state is unsupported');
    throw new Error('unrecognized package state (partial or drifted)');
  }
  if (combined) return false;
  const prepared = files.map((file) => {
    let output = file.state.source;
    output = transform(output, ETA_PATCHES, 'forward', file.rel);
    output = transform(output, PATCHES, 'forward', file.rel);
    return { ...file, output: Buffer.from(output, 'utf8') };
  }).filter((file) => !file.output.equals(file.original));
  if (prepared.length === 0) return false;
  const staged = [];
  const preserved = new Set();
  try {
    for (const f of prepared) {
      const next = await stage(f.target, f.output, f.mode);
      try { staged.push({ f, next, prev: await stage(f.target, f.original, f.mode) }); }
      catch (error) { await rm(next.dir, { recursive: true, force: true }); throw error; }
    }
    const touched = [];
    try {
      for (const item of staged) { touched.push(item); await renameFile(item.next.file, item.f.target); if (!(await readFile(item.f.target)).equals(item.f.output)) throw new Error(`commit verify failed: ${item.f.rel}`); }
    } catch (error) {
      let rollbackError;
      for (const item of touched.reverse()) {
        try { await renameFile(item.prev.file, item.f.target); if (!(await readFile(item.f.target)).equals(item.f.original)) throw new Error(`rollback verify failed: ${item.f.rel}`); }
        catch (restoreError) { rollbackError ??= restoreError; preserved.add(item.prev.dir); }
      }
      if (rollbackError) throw new Error(`patch commit failed and rollback failed: ${rollbackError instanceof Error ? rollbackError.message : 'unknown error'}; recovery directories: ${[...preserved].join(', ')}`);
      throw new Error(`patch commit failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  } finally {
    // Keep prev bytes available when rollback itself could not restore a target.
    await Promise.all(staged.flatMap((x) => [x.next.dir, x.prev.dir]).filter((dir) => !preserved.has(dir)).map((dir) => rm(dir, { recursive: true, force: true })));
  }
  return true;
}
async function main() {
  try { const changed = await patch(resolveRoot(process.argv.slice(2))); console.log(changed ? 'rpiv-todo HUD+ETA patch applied.' : 'rpiv-todo HUD+ETA patch already applied.'); }
  catch (error) { console.error(`rpiv-todo HUD patch refused: ${error instanceof Error ? error.message : 'unknown error'}`); process.exitCode = 1; }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
export { PACKAGE_NAME, PACKAGE_VERSION, TARGETS, ETA_PATCHES, PATCHES, MARKER, patch, resolveRoot };
