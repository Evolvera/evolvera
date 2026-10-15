#!/usr/bin/env node
// Restyles the pi-subagents widget (the panel above the editor) as a "cyberpunk HUD" so it matches the
// footer in extensions/clean-ui.ts: a left rail, single-cell glyphs, a four-frame spinner and a palette of
// red, orange, white and gray only (theme tokens accent, warning, text, muted, dim, borderMuted,
// thinkingXhigh). Presentation only: widget modes, the 12-line cap, overflow math, finished-agent linger
// and truncation are untouched. The Agent tool result and the conversation viewer keep their own look,
// except that they share SPINNER and the context-percent colour.
//
// Touches only ui/agent-widget (src for PI's loader, dist for consumers of the build), which no other
// pi-subagents patch edits, so this composes with ultra-thinking, deferred-nudges and bounded-waits in any order.
import { chmod, lstat, mkdtemp, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_NAME = '@tintinweb/pi-subagents';
const PACKAGE_VERSION = '0.18.2';
const MARKER = 'HUD presentation (Evolvera patch v1)';
const SRC = 'src/ui/agent-widget.ts';
const DIST = 'dist/ui/agent-widget.js';

// Helpers shared by both files; only type annotations differ.
const hudBlock = (ts) => `// ---- ${MARKER} ----
// Rail + single-cell glyphs, matching the footer in clean-ui.ts. Colours are theme tokens only.
const HUD_RAIL = "▌";

/** Row prefix: the rail in \`color\`, then one space. */
function hudRail(theme${ts ? ': Theme' : ''}, color = "borderMuted")${ts ? ': string' : ''} {
  return theme.fg(color, HUD_RAIL) + " ";
}

/** Agent type name in a plain theme colour; renderAgentName's per-agent badge colours fall outside the palette. */
function hudAgentName(type${ts ? ': SubagentType' : ''}, theme${ts ? ': Theme' : ''}, color${ts ? ': string' : ''}, bold = false)${ts ? ': string' : ''} {
  const name = getConfig(type).displayName;
  const colored = theme.fg(color, name);
  return bold ? theme.bold(colored) : colored;
}

/** Compact duration: "30s", "1m 2s", "1h 5m". */
function hudDuration(ms${ts ? ': number' : ''})${ts ? ': string' : ''} {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return \`\${seconds}s\`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return \`\${minutes}m \${seconds % 60}s\`;
  return \`\${Math.floor(minutes / 60)}h \${minutes % 60}m\`;
}

/** "AGENTS  2 running · 1 queued": counts only for what is active; the colour is dim when idle. */
function hudHeading(theme${ts ? ': Theme' : ''}, color${ts ? ': string' : ''}, running${ts ? ': number' : ''}, queued${ts ? ': number' : ''})${ts ? ': string' : ''} {
  const counts = [running > 0 ? \`\${running} running\` : "", queued > 0 ? \`\${queued} queued\` : ""].filter(Boolean).join(" · ");
  return hudRail(theme, color) + theme.bold(theme.fg(color, "AGENTS")) + (counts ? "  " + theme.fg("muted", counts) : "");
}

// ---- Widget manager ----
`;

const FIT_TS = {
  before: "// Everything fits — add all lines and fix up connectors for the last item.\n      lines.push(...finishedLines);\n      for (const pair of runningLines) lines.push(...pair);\n      if (queuedLine) lines.push(queuedLine);\n\n      // Fix last connector: swap ├─ → └─ and │ → space for activity lines.\n      if (lines.length > 1) {\n        const last = lines.length - 1;\n        lines[last] = lines[last].replace(\"├─\", \"└─\");\n        // If last item is a running agent activity line, fix indent of that line\n        // and fix the header line above it.\n        if (runningLines.length > 0 && !queuedLine) {\n          // The last two lines are the last running agent's header + activity.\n          if (last >= 2) {\n            lines[last - 1] = lines[last - 1].replace(\"├─\", \"└─\");\n            lines[last] = lines[last].replace(\"│  \", \"   \");\n          }\n        }\n      }\n",
  after: "// Everything fits — add all lines in order; every row carries its own rail.\n      lines.push(...finishedLines);\n      for (const pair of runningLines) lines.push(...pair);\n      if (queuedLine) lines.push(queuedLine);\n",
};
const FIT_JS = {
  before: "// Everything fits — add all lines and fix up connectors for the last item.\n            lines.push(...finishedLines);\n            for (const pair of runningLines)\n                lines.push(...pair);\n            if (queuedLine)\n                lines.push(queuedLine);\n            // Fix last connector: swap ├─ → └─ and │ → space for activity lines.\n            if (lines.length > 1) {\n                const last = lines.length - 1;\n                lines[last] = lines[last].replace(\"├─\", \"└─\");\n                // If last item is a running agent activity line, fix indent of that line\n                // and fix the header line above it.\n                if (runningLines.length > 0 && !queuedLine) {\n                    // The last two lines are the last running agent's header + activity.\n                    if (last >= 2) {\n                        lines[last - 1] = lines[last - 1].replace(\"├─\", \"└─\");\n                        lines[last] = lines[last].replace(\"│  \", \"   \");\n                    }\n                }\n            }\n",
  after: "// Everything fits — add all lines in order; every row carries its own rail.\n            lines.push(...finishedLines);\n            for (const pair of runningLines)\n                lines.push(...pair);\n            if (queuedLine)\n                lines.push(queuedLine);\n",
};

// Anchors shared by src and dist: single-line, so indentation and tsc formatting do not matter.
const shared = (rel) => [
  [rel, '/** Braille spinner frames for animated running indicator. */\nexport const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];',
    '/** Four-frame single-cell rotation for the running indicator. */\nexport const SPINNER = ["◢", "◣", "◤", "◥"];'],
  [rel, 'const color = percent >= 85 ? "error" : percent >= 70 ? "warning" : "dim";',
    'const color = percent >= 85 ? "thinkingXhigh" : percent >= 70 ? "warning" : "dim";'],
  [rel, 'const duration = formatMs((a.completedAt ?? Date.now()) - a.startedAt);',
    'const duration = hudDuration((a.completedAt ?? Date.now()) - a.startedAt);'],
  [rel, 'icon = theme.fg("success", "✓");', 'icon = theme.fg("muted", "✓");'],
  [rel, 'statusText = theme.fg("error", ` error${errMsg}`);', 'statusText = theme.fg("thinkingXhigh", ` error${errMsg}`);'],
  [rel, 'parts.push(`${a.toolUses} tool use${a.toolUses === 1 ? "" : "s"}`);', 'parts.push(`${a.toolUses} tool${a.toolUses === 1 ? "" : "s"}`);'],
  [rel, 'return `${icon} ${renderAgentName(a.type, theme, { fallbackColor: "dim" })}${modeTag}  ',
    'return `${icon} ${hudAgentName(a.type, theme, "muted")}${modeTag}  '],
  [rel, 'finishedLines.push(truncate(theme.fg("dim", "├─") + " " + this.renderFinishedLine(a, theme)));',
    'finishedLines.push(truncate(hudRail(theme) + this.renderFinishedLine(a, theme)));'],
  [rel, 'const elapsed = formatMs(Date.now() - a.startedAt);', 'const elapsed = hudDuration(Date.now() - a.startedAt);'],
  [rel, 'parts.push(`${toolUses} tool use${toolUses === 1 ? "" : "s"}`);', 'parts.push(`${toolUses} tool${toolUses === 1 ? "" : "s"}`);'],
  [rel, 'truncate(theme.fg("dim", "├─") + ` ${theme.fg("accent", frame)} ${renderAgentName(a.type, theme, { bold: true })}${modeTag}  ',
    'truncate(hudRail(theme) + `${theme.fg("warning", frame)} ${hudAgentName(a.type, theme, "text", true)}${modeTag}  '],
  [rel, 'truncate(theme.fg("dim", "│  ") + theme.fg("dim", `  ⎿  ${activity}`)),',
    'truncate(hudRail(theme) + theme.fg("dim", `  ╰ ${activity}`)),'],
  [rel, '? truncate(theme.fg("dim", "├─") + ` ${theme.fg("muted", "◦")} ${theme.fg("dim", `${queued.length} queued`)}`)',
    '? truncate(hudRail(theme) + `${theme.fg("muted", "◇")} ${theme.fg("dim", `${queued.length} queued`)}`)'],
  [rel, 'truncate(theme.fg(headingColor, headingIcon) + " " + theme.fg(headingColor, "Agents"))',
    'truncate(hudHeading(theme, headingColor, running.length, queued.length))'],
  [rel, 'truncate(theme.fg("dim", "└─") + ` ${theme.fg("dim", `+${hiddenRunning + hiddenFinished} more (${overflowText})`)}`)',
    'truncate(hudRail(theme) + theme.fg("dim", `+${hiddenRunning + hiddenFinished} more (${overflowText})`))'],
];

// Anchors whose neighbours differ between src (2-space TS) and dist (4-space tsc output).
const PATCHES = [
  [SRC, 'import { renderAgentName } from "../agent-color.js";\nimport type { AgentManager }', 'import type { AgentManager }'],
  [SRC, '// ---- Widget manager ----\n', hudBlock(true)],
  ...shared(SRC),
  [SRC, 'icon = theme.fg("error", "✗");\n      const errMsg', 'icon = theme.fg("thinkingXhigh", "✗");\n      const errMsg'],
  [SRC, '// aborted\n      icon = theme.fg("error", "✗");', '// aborted\n      icon = theme.fg("thinkingXhigh", "✗");'],
  [SRC, 'const headingIcon = hasActive ? "●" : "○";\n    const frame = SPINNER', 'const frame = SPINNER'],
  [SRC, FIT_TS.before, FIT_TS.after],
  [DIST, 'import { renderAgentName } from "../agent-color.js";\nimport { getConfig }', 'import { getConfig }'],
  [DIST, '// ---- Widget manager ----\n', hudBlock(false)],
  ...shared(DIST),
  [DIST, 'icon = theme.fg("error", "✗");\n            const errMsg', 'icon = theme.fg("thinkingXhigh", "✗");\n            const errMsg'],
  [DIST, '// aborted\n            icon = theme.fg("error", "✗");', '// aborted\n            icon = theme.fg("thinkingXhigh", "✗");'],
  [DIST, 'const headingIcon = hasActive ? "●" : "○";\n        const frame = SPINNER', 'const frame = SPINNER'],
  [DIST, FIT_JS.before, FIT_JS.after],
];

function resolveRoot(argv, env = process.env) {
  if (!argv.length) return path.join(env.PI_CODING_AGENT_DIR || path.join(os.homedir(), '.pi', 'agent'), 'npm', 'node_modules', '@tintinweb', 'pi-subagents');
  if (argv.length === 2 && argv[0] === '--package-root' && path.isAbsolute(argv[1])) return argv[1];
  throw new Error('unsupported arguments');
}
const count = (source, value) => source.split(value).length - 1;
async function stage(target, bytes, mode) {
  const dir = await mkdtemp(path.join(path.dirname(target), '.pi-subagents-hud-'));
  const file = path.join(dir, path.basename(target));
  await writeFile(file, bytes, { flag: 'wx', mode }); await chmod(file, mode);
  const h = await open(file, 'r+'); try { await h.sync(); } finally { await h.close(); }
  return { dir, file };
}
async function patch(root, { renameFile = rename } = {}) {
  const meta = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  if (meta.name !== PACKAGE_NAME || meta.version !== PACKAGE_VERSION) throw new Error('package identity mismatch');
  const targets = [];
  for (const rel of [SRC, DIST]) {
    const target = path.join(root, rel); const stat = await lstat(target); const original = await readFile(target);
    let source = original.toString('utf8');
    const own = PATCHES.filter(([r]) => r === rel);
    const mode = stat.mode & 0o7777;
    if (count(source, MARKER) === 1 && own.every(([, , after]) => count(source, after) === 1)) {
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
  try { const changed = await patch(resolveRoot(process.argv.slice(2))); console.log(changed ? 'pi-subagents HUD patch applied.' : 'pi-subagents HUD patch already applied.'); }
  catch (error) { console.error(`pi-subagents HUD patch refused: ${error instanceof Error ? error.message : 'unknown error'}`); process.exitCode = 1; }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
export { PACKAGE_NAME, PACKAGE_VERSION, PATCHES, MARKER, SRC, DIST, hudBlock, patch, resolveRoot };
