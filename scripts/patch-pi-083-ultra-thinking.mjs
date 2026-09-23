#!/usr/bin/env node
import { chmod, lstat, mkdtemp, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_NAME = '@earendil-works/pi-coding-agent';
const PACKAGE_VERSION = '0.83.0';
const PULSE_MS = 350;

const PATCHES = [
  ['node_modules/@earendil-works/pi-ai/dist/types.d.ts',
    'export type ThinkingLevel = "minimal" | "low" | "medium" | "high" | "xhigh" | "max";',
    'export type ThinkingLevel = "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | "ultra";'],
  ['node_modules/@earendil-works/pi-agent-core/dist/types.d.ts',
    'export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";',
    'export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | "ultra";'],
  ['node_modules/@earendil-works/pi-ai/dist/models.js',
    'const EXTENDED_THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];',
    'const EXTENDED_THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"];'],
  ['node_modules/@earendil-works/pi-ai/dist/models.js',
    'if (level === "xhigh" || level === "max")',
    'if (level === "xhigh" || level === "max" || level === "ultra")'],
  ['node_modules/@earendil-works/pi-ai/dist/api/openai-codex-responses.d.ts',
    'reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";',
    'reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | "ultra";'],
  ['dist/cli/args.js',
    'const VALID_THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];',
    'const VALID_THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"];'],
  ['dist/cli/args.js',
    'Set thinking level: off, minimal, low, medium, high, xhigh, max\n  --extension',
    'Set thinking level: off, minimal, low, medium, high, xhigh, max, ultra\n  --extension'],
  ['dist/core/model-config.js',
    '    max: Type.Optional(ThinkingLevelMapValueSchema),\n});',
    '    max: Type.Optional(ThinkingLevelMapValueSchema),\n    ultra: Type.Optional(ThinkingLevelMapValueSchema),\n});'],
  ['dist/modes/interactive/components/thinking-selector.js',
    '    max: "Maximum reasoning",\n};',
    '    max: "Maximum reasoning",\n    ultra: "Ultra reasoning",\n};'],
  ['dist/modes/interactive/components/settings-selector.js',
    '    max: "Maximum reasoning",\n};',
    '    max: "Maximum reasoning",\n    ultra: "Ultra reasoning",\n};'],
  ['dist/modes/interactive/theme/theme.js',
    '        thinkingMax: Type.Optional(ColorValueSchema),',
    '        thinkingMax: Type.Optional(ColorValueSchema),\n        thinkingUltra: Type.Optional(ColorValueSchema),\n        thinkingUltraAlt: Type.Optional(ColorValueSchema),'],
  ['dist/modes/interactive/theme/theme.js',
    'return { ...colors, thinkingMax: colors.thinkingMax ?? colors.thinkingXhigh };',
    'return { ...colors, thinkingMax: colors.thinkingMax ?? colors.thinkingXhigh, thinkingUltra: colors.thinkingUltra ?? colors.thinkingMax ?? colors.thinkingXhigh, thinkingUltraAlt: colors.thinkingUltraAlt ?? colors.thinkingUltra ?? colors.thinkingMax ?? colors.thinkingXhigh };'],
  ['dist/modes/interactive/theme/theme.js',
    'const colors = { ...fgColors, thinkingMax: fgColors.thinkingMax ?? fgColors.thinkingXhigh };',
    'const colors = { ...fgColors, thinkingMax: fgColors.thinkingMax ?? fgColors.thinkingXhigh, thinkingUltra: fgColors.thinkingUltra ?? fgColors.thinkingMax ?? fgColors.thinkingXhigh, thinkingUltraAlt: fgColors.thinkingUltraAlt ?? fgColors.thinkingUltra ?? fgColors.thinkingMax ?? fgColors.thinkingXhigh };'],
  ['dist/modes/interactive/theme/theme.js',
    '            case "max":\n                return (str) => this.fg("thinkingMax", str);',
    '            case "max":\n                return (str) => this.fg("thinkingMax", str);\n            case "ultra":\n                return (str) => this.fg(Math.floor(Date.now() / 350) % 2 === 0 ? "thinkingUltra" : "thinkingUltraAlt", str);'],
  ['dist/modes/interactive/theme/theme.d.ts',
    '"thinkingXhigh" | "thinkingMax" | "bashMode";',
    '"thinkingXhigh" | "thinkingMax" | "thinkingUltra" | "thinkingUltraAlt" | "bashMode";'],
  ['dist/modes/interactive/theme/dark.json',
    '\t\t"thinkingMax": "#ff5fff",',
    '\t\t"thinkingMax": "#ff5fff",\n\t\t"thinkingUltra": "#ff8cff",\n\t\t"thinkingUltraAlt": "#ff5faf",'],
  ['dist/modes/interactive/theme/light.json',
    '\t\t"thinkingMax": "#af005f",',
    '\t\t"thinkingMax": "#af005f",\n\t\t"thinkingUltra": "#d00072",\n\t\t"thinkingUltraAlt": "#b8007f",'],
  ['dist/modes/interactive/theme/theme-schema.json',
    '\t\t\t\t"thinkingMax": {\n\t\t\t\t\t"$ref": "#/$defs/colorValue",\n\t\t\t\t\t"description": "Thinking level border: max (falls back to thinkingXhigh when omitted)"\n\t\t\t\t},',
    '\t\t\t\t"thinkingMax": {\n\t\t\t\t\t"$ref": "#/$defs/colorValue",\n\t\t\t\t\t"description": "Thinking level border: max (falls back to thinkingXhigh when omitted)"\n\t\t\t\t},\n\t\t\t\t"thinkingUltra": {\n\t\t\t\t\t"$ref": "#/$defs/colorValue",\n\t\t\t\t\t"description": "Thinking level border: ultra primary"\n\t\t\t\t},\n\t\t\t\t"thinkingUltraAlt": {\n\t\t\t\t\t"$ref": "#/$defs/colorValue",\n\t\t\t\t\t"description": "Thinking level border: ultra pulse alternate"\n\t\t\t\t},'],
  ['dist/modes/interactive/interactive-mode.js',
    '    updateEditorBorderColor() {\n        if (this.isBashMode) {\n            this.editor.borderColor = theme.getBashModeBorderColor();\n        }\n        else {\n            const level = this.session.thinkingLevel || "off";\n            this.editor.borderColor = theme.getThinkingBorderColor(level);\n        }\n        this.ui.requestRender();\n    }',
    '    updateEditorBorderColor() {\n        const level = this.session.thinkingLevel || "off";\n        if (this.isBashMode) {\n            this.editor.borderColor = theme.getBashModeBorderColor();\n        }\n        else {\n            this.editor.borderColor = theme.getThinkingBorderColor(level);\n        }\n        if (level === "ultra" && !this.isBashMode) {\n            if (!this.ultraPulseTimer) {\n                this.ultraPulseTimer = setInterval(() => {\n                    if (this.session.thinkingLevel !== "ultra" || this.isBashMode) {\n                        clearInterval(this.ultraPulseTimer);\n                        this.ultraPulseTimer = undefined;\n                        return;\n                    }\n                    this.editor.borderColor = theme.getThinkingBorderColor("ultra");\n                    this.ui.requestRender();\n                }, 350);\n                this.ultraPulseTimer.unref?.();\n            }\n        }\n        else if (this.ultraPulseTimer) {\n            clearInterval(this.ultraPulseTimer);\n            this.ultraPulseTimer = undefined;\n        }\n        this.ui.requestRender();\n    }'],
];

function count(source, value) { return source.split(value).length - 1; }
function npmRoot() { return execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['root', '-g'], { encoding: 'utf8', shell: process.platform === 'win32' }).trim(); }
function resolveRoot(argv) {
  if (!argv.length) return path.join(npmRoot(), '@earendil-works', 'pi-coding-agent');
  if (argv.length === 2 && argv[0] === '--package-root' && path.isAbsolute(argv[1])) return argv[1];
  throw new Error('unsupported arguments');
}
async function stage(target, bytes, mode) {
  const dir = await mkdtemp(path.join(path.dirname(target), '.pi-ultra-patch-'));
  const file = path.join(dir, path.basename(target));
  await writeFile(file, bytes, { flag: 'wx', mode }); await chmod(file, mode);
  const h = await open(file, 'r+'); try { await h.sync(); } finally { await h.close(); }
  return { dir, file };
}
async function patch(packageRoot, { renameFile = rename } = {}) {
  const meta = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));
  if (meta.name !== PACKAGE_NAME || meta.version !== PACKAGE_VERSION) throw new Error('package identity mismatch');
  const grouped = new Map();
  for (const [rel, before, after] of PATCHES) {
    const list = grouped.get(rel) ?? []; list.push({ before, after }); grouped.set(rel, list);
  }
  const targets = [];
  for (const [rel, operations] of grouped) {
    const target = path.join(packageRoot, rel); const stat = await lstat(target);
    if (!stat.isFile()) throw new Error(`target is not a regular file: ${rel}`);
    const original = await readFile(target); let source = original.toString('utf8'); let changed = false;
    for (const { before, after } of operations) {
      const bc = count(source, before), ac = count(source, after);
      if (ac === 1) {}
      else if (bc === 1) { source = source.replace(before, after); changed = true; }
      else throw new Error(`anchor cardinality mismatch: ${rel}`);
    }
    targets.push({ rel, target, original, output: Buffer.from(source), mode: stat.mode & 0o7777, changed });
  }
  const changed = targets.filter((t) => t.changed); if (!changed.length) return false;
  const staged = [];
  try {
    for (const t of changed) staged.push({ t, next: await stage(t.target, t.output, t.mode), prev: await stage(t.target, t.original, t.mode) });
    const committed = [];
    try {
      for (const x of staged) { committed.push(x); await renameFile(x.next.file, x.t.target); if (!(await readFile(x.t.target)).equals(x.t.output)) throw new Error(`verification failed: ${x.t.rel}`); }
    } catch (error) {
      for (const x of committed.reverse()) await renameFile(x.prev.file, x.t.target);
      throw error;
    }
  } finally { await Promise.all(staged.flatMap((x) => [x.next.dir, x.prev.dir]).map((d) => rm(d, { recursive: true, force: true }))); }
  return true;
}
async function main() {
  try { const changed = await patch(resolveRoot(process.argv.slice(2))); console.log(changed ? 'Pi 0.83.0 ultra-thinking patch applied.' : 'Pi 0.83.0 ultra-thinking patch already applied.'); }
  catch (error) { console.error(`Pi 0.83.0 ultra-thinking patch refused: ${error instanceof Error ? error.message : 'unknown error'}`); process.exitCode = 1; }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
export { PACKAGE_NAME, PACKAGE_VERSION, PATCHES, PULSE_MS, patch, resolveRoot };
