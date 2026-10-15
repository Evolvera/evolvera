#!/usr/bin/env node
// Restyles the rpiv-todo overlay (the panel above the editor) as a "cyberpunk HUD" so it matches the
// footer in extensions/clean-ui.ts: a left rail, a heat-free progress bar, single-cell glyphs and a
// palette of red, orange, white and gray only (theme tokens accent, warning, text, muted, dim,
// borderMuted). Presentation only: task state, hide-completed tracking, the row budget, truncation and
// the /todos command are untouched. `formatOverlayTaskLine` and `overlayStatusGlyph` are used by the
// overlay alone, so nothing else changes colour.
import { chmod, lstat, mkdtemp, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_NAME = '@juicesharp/rpiv-todo';
const PACKAGE_VERSION = '2.11.0';
const MARKER = 'HUD presentation (Evolvera patch v1)';
const OVERLAY = 'todo-overlay.ts';
const FORMAT = 'view/format.ts';

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

const PATCHES = [
  [OVERLAY, 'const OVERLAY_HEADING = "Todos";', 'const OVERLAY_HEADING = "TODO";'],
  [OVERLAY, 'export class TodoOverlay {', HELPERS],
  [OVERLAY, HEADING_BEFORE, HEADING_AFTER],
  [OVERLAY, '// Collapsed view: just the heading + a dim "└─" expand hint, then the', '// Collapsed view: just the heading + a dim expand hint on the same line, then the'],
  [OVERLAY,
    'return this.withTrailingSpacer([heading, truncate(`${theme.fg("dim", "└─")} ${theme.fg("dim", hint)}`)]);',
    'return this.withTrailingSpacer([truncate(`${headingLine}  ${theme.fg("dim", hint)}`)]);'],
  [OVERLAY,
    'lines.push(truncate(`${theme.fg("dim", "├─")} ${formatOverlayTaskLine(task, theme, showIds)}`));',
    'lines.push(truncate(`${rowRail}${formatOverlayTaskLine(task, theme, showIds)}`));'],
  [OVERLAY,
    'if (layout.hiddenCompleted === 0 && layout.truncatedTail === 0) {\n\t\t\tconst last = lines.length - 1;\n\t\t\tlines[last] = lines[last].replace("├─", "└─");\n\t\t\treturn this.withTrailingSpacer(lines);',
    'if (layout.hiddenCompleted === 0 && layout.truncatedTail === 0) {\n\t\t\treturn this.withTrailingSpacer(lines);'],
  [OVERLAY,
    'lines.push(truncate(`${theme.fg("dim", "└─")} ${theme.fg("dim", summary)}`));',
    'lines.push(truncate(`${rowRail}${theme.fg("dim", summary)}`));'],
  [FORMAT, FORMAT_GLYPH_BEFORE, FORMAT_GLYPH_AFTER],
  [FORMAT, FORMAT_LINE_BEFORE, FORMAT_LINE_AFTER],
];

function resolveRoot(argv, env = process.env) {
  if (!argv.length) return path.join(env.PI_CODING_AGENT_DIR || path.join(os.homedir(), '.pi', 'agent'), 'npm', 'node_modules', '@juicesharp', 'rpiv-todo');
  if (argv.length === 2 && argv[0] === '--package-root' && path.isAbsolute(argv[1])) return argv[1];
  throw new Error('unsupported arguments');
}
const count = (source, value) => source.split(value).length - 1;
async function stage(target, bytes, mode) {
  const dir = await mkdtemp(path.join(path.dirname(target), '.rpiv-todo-hud-'));
  const file = path.join(dir, path.basename(target));
  await writeFile(file, bytes, { flag: 'wx', mode }); await chmod(file, mode);
  const h = await open(file, 'r+'); try { await h.sync(); } finally { await h.close(); }
  return { dir, file };
}
async function patch(root, { renameFile = rename } = {}) {
  const meta = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  if (meta.name !== PACKAGE_NAME || meta.version !== PACKAGE_VERSION) throw new Error('package identity mismatch');
  const targets = [];
  for (const rel of [...new Set(PATCHES.map(([r]) => r))]) {
    const target = path.join(root, rel); const stat = await lstat(target); const original = await readFile(target);
    let source = original.toString('utf8');
    const own = PATCHES.filter(([r]) => r === rel);
    const mode = stat.mode & 0o7777;
    if (own.every(([, , after]) => count(source, after) === 1) && count(source, MARKER) === (rel === OVERLAY ? 1 : 0)) {
      targets.push({ target, original, output: original, mode, changed: false });
      continue;
    }
    if (count(source, MARKER) !== 0) throw new Error(`anchor cardinality mismatch: ${rel}`);
    for (const [, before, after] of own) {
      if (count(source, before) !== 1) throw new Error(`anchor cardinality mismatch: ${rel}`);
      source = source.replace(before, () => after);
    }
    targets.push({ target, original, output: Buffer.from(source), mode, changed: true });
  }
  // A half-patched package (one file patched, one pristine) is drift, not progress.
  const changed = targets.filter((t) => t.changed);
  if (changed.length && changed.length !== targets.length) throw new Error('package is partially patched');
  if (!changed.length) return false;
  const staged = [];
  try {
    for (const t of changed) staged.push({ t, next: await stage(t.target, t.output, t.mode), prev: await stage(t.target, t.original, t.mode) });
    const committed = [];
    try { for (const x of staged) { committed.push(x); await renameFile(x.next.file, x.t.target); } }
    catch (error) { for (const x of committed.reverse()) await renameFile(x.prev.file, x.t.target); throw error; }
  } finally { await Promise.all(staged.flatMap((x) => [x.next.dir, x.prev.dir]).map((d) => rm(d, { recursive: true, force: true }))); }
  return true;
}
async function main() {
  try { const changed = await patch(resolveRoot(process.argv.slice(2))); console.log(changed ? 'rpiv-todo HUD patch applied.' : 'rpiv-todo HUD patch already applied.'); }
  catch (error) { console.error(`rpiv-todo HUD patch refused: ${error instanceof Error ? error.message : 'unknown error'}`); process.exitCode = 1; }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
export { PACKAGE_NAME, PACKAGE_VERSION, PATCHES, MARKER, patch, resolveRoot };
