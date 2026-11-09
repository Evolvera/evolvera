#!/usr/bin/env node
import { access, chmod, lstat, mkdtemp, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_NAME = '@earendil-works/pi-coding-agent';
const PACKAGE_VERSION = '1.3.0';
const SUPPORTED_PACKAGE_VERSIONS = Object.freeze(['1.3.0', '1.4.0', '1.5.0']);
const PI_AI_150_SCHEMA_VERSIONS = Object.freeze(['1.5.0']);
// pi-ai switched its schema builder between 1.4.0 and 1.5.0 (typebox Type.* to pi-schema
// oneOf/opt), so the same logical level addition has a different text per version.
const LEGACY_SCHEMA_VERSIONS = Object.freeze(['1.3.0', '1.4.0']);
const PULSE_MS = 350;

const BUNDLE_150_PATCHES = [
  ['dist/bundle/chunks/chunk-44DLKSKE.js',
    'VALID_THINKING_LEVELS=["off","minimal","low","medium","high","xhigh","max"]',
    'VALID_THINKING_LEVELS=["off","minimal","low","medium","high","xhigh","max","ultra"]'],
  ['dist/bundle/chunks/chunk-44DLKSKE.js',
    'ThinkingLevelMapSchema=openObject2({off:opt(ThinkingLevelMapValueSchema),minimal:opt(ThinkingLevelMapValueSchema),low:opt(ThinkingLevelMapValueSchema),medium:opt(ThinkingLevelMapValueSchema),high:opt(ThinkingLevelMapValueSchema),xhigh:opt(ThinkingLevelMapValueSchema),max:opt(ThinkingLevelMapValueSchema)},{',
    'ThinkingLevelMapSchema=openObject2({off:opt(ThinkingLevelMapValueSchema),minimal:opt(ThinkingLevelMapValueSchema),low:opt(ThinkingLevelMapValueSchema),medium:opt(ThinkingLevelMapValueSchema),high:opt(ThinkingLevelMapValueSchema),xhigh:opt(ThinkingLevelMapValueSchema),max:opt(ThinkingLevelMapValueSchema),ultra:opt(ThinkingLevelMapValueSchema)},{'],
  ['dist/bundle/chunks/chunk-44DLKSKE.js',
    '={off:"No reasoning",minimal:"Very brief reasoning (~1k tokens)",low:"Light reasoning (~2k tokens)",medium:"Moderate reasoning (~8k tokens)",high:"Deep reasoning (~16k tokens)",xhigh:"Extra-high reasoning (~32k tokens)",max:"Maximum reasoning"}',
    '={off:"No reasoning",minimal:"Very brief reasoning (~1k tokens)",low:"Light reasoning (~2k tokens)",medium:"Moderate reasoning (~8k tokens)",high:"Deep reasoning (~16k tokens)",xhigh:"Extra-high reasoning (~32k tokens)",max:"Maximum reasoning",ultra:"Ultra reasoning"}', 2],
  ['dist/bundle/chunks/chunk-44DLKSKE.js',
    'Set thinking level: off, minimal, low, medium, high, xhigh, max',
    'Set thinking level: off, minimal, low, medium, high, xhigh, max, ultra'],
  ['dist/bundle/chunks/chunk-44DLKSKE.js',
    'THINKING_LEVEL_OPTIONS=["off","minimal","low","medium","high","xhigh","max"]',
    'THINKING_LEVEL_OPTIONS=["off","minimal","low","medium","high","xhigh","max","ultra"]'],
  ['dist/bundle/chunks/chunk-44DLKSKE.js',
    ',THINKING_LEVELS=["off","minimal","low","medium","high","xhigh","max"]',
    ',THINKING_LEVELS=["off","minimal","low","medium","high","xhigh","max","ultra"]'],
  ['dist/bundle/chunks/chunk-44DLKSKE.js',
    'for(let level of["off","minimal","low","medium","high","xhigh","max"])',
    'for(let level of["off","minimal","low","medium","high","xhigh","max","ultra"])'],
];

const PATCHES = [
  ['node_modules/@earendil-works/pi-ai/dist/providers/model-schema.js',
    'export const THINKING_LEVELS = ["minimal", "low", "medium", "high", "xhigh", "max"];',
    'export const THINKING_LEVELS = ["minimal", "low", "medium", "high", "xhigh", "max", "ultra"];'],
  ['node_modules/@earendil-works/pi-ai/dist/providers/model-schema.d.ts',
    'THINKING_LEVELS: readonly ["minimal", "low", "medium", "high", "xhigh", "max"]',
    'THINKING_LEVELS: readonly ["minimal", "low", "medium", "high", "xhigh", "max", "ultra"]'],
  ['node_modules/@earendil-works/pi-ai/dist/providers/model-schema.d.ts',
    'MODEL_THINKING_LEVELS: readonly ["off", "minimal", "low", "medium", "high", "xhigh", "max"]',
    'MODEL_THINKING_LEVELS: readonly ["off", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"]'],
  ['node_modules/@earendil-works/pi-ai/dist/providers/model-schema.d.ts',
    'export declare const ThinkingLevelSchema: import("@earendil-works/pi-schema").Schema<"high" | "low" | "max" | "medium" | "minimal" | "xhigh">;',
    'export declare const ThinkingLevelSchema: import("@earendil-works/pi-schema").Schema<"high" | "low" | "max" | "medium" | "minimal" | "ultra" | "xhigh">;', 1, PI_AI_150_SCHEMA_VERSIONS],
  ['node_modules/@earendil-works/pi-ai/dist/providers/model-schema.d.ts',
    'export declare const ThinkingLevelSchema: Type.TEnum<["minimal", "low", "medium", "high", "xhigh", "max"]>;',
    'export declare const ThinkingLevelSchema: Type.TEnum<["minimal", "low", "medium", "high", "xhigh", "max", "ultra"]>;', 1, LEGACY_SCHEMA_VERSIONS],
  ['node_modules/@earendil-works/pi-ai/dist/providers/model-schema.d.ts',
    'export declare const ModelThinkingLevelSchema: import("@earendil-works/pi-schema").Schema<"high" | "low" | "max" | "medium" | "minimal" | "off" | "xhigh">;',
    'export declare const ModelThinkingLevelSchema: import("@earendil-works/pi-schema").Schema<"high" | "low" | "max" | "medium" | "minimal" | "off" | "ultra" | "xhigh">;', 1, PI_AI_150_SCHEMA_VERSIONS],
  ['node_modules/@earendil-works/pi-ai/dist/providers/model-schema.d.ts',
    'export declare const ModelThinkingLevelSchema: Type.TEnum<["off", "minimal", "low", "medium", "high", "xhigh", "max"]>;',
    'export declare const ModelThinkingLevelSchema: Type.TEnum<["off", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"]>;', 1, LEGACY_SCHEMA_VERSIONS],
  ['node_modules/@earendil-works/pi-ai/dist/providers/model-schema.d.ts',
    '    xhigh?: string | null | undefined;\n    max?: string | null | undefined;\n}>;',
    '    xhigh?: string | null | undefined;\n    max?: string | null | undefined;\n    ultra?: string | null | undefined;\n}>;', 1, PI_AI_150_SCHEMA_VERSIONS],
  // 1.3.0/1.4.0 order the map members alphabetically and close the block with xhigh.
  ['node_modules/@earendil-works/pi-ai/dist/providers/model-schema.d.ts',
    '    xhigh: Type.TOptional<Type.TUnion<[Type.TString, Type.TNull]>>;\n}>;',
    '    xhigh: Type.TOptional<Type.TUnion<[Type.TString, Type.TNull]>>;\n    ultra: Type.TOptional<Type.TUnion<[Type.TString, Type.TNull]>>;\n}>;', 1, LEGACY_SCHEMA_VERSIONS],
  ['node_modules/@earendil-works/pi-ai/dist/providers/model-schema.js',
    '    max: opt(ThinkingLevelMapValueSchema),\n}, {',
    '    max: opt(ThinkingLevelMapValueSchema),\n    ultra: opt(ThinkingLevelMapValueSchema),\n}, {', 1, PI_AI_150_SCHEMA_VERSIONS],
  ['node_modules/@earendil-works/pi-agent-core/dist/types.d.ts',
    'export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";',
    'export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | "ultra";'],
  ['node_modules/@earendil-works/pi-ai/dist/models.js',
    'const EXTENDED_THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];',
    'const EXTENDED_THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"];'],
  ['node_modules/@earendil-works/pi-ai/dist/models.js',
    'if (level === "xhigh" || level === "max")',
    'if (level === "xhigh" || level === "max" || level === "ultra")'],
  ['node_modules/@earendil-works/pi-ai/dist/api/openai-responses.d.ts',
    'reasoningEffort?: "minimal" | "low" | "medium" | "high" | "xhigh" | "max";',
    'reasoningEffort?: "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | "ultra";'],
  ['dist/cli/args.js',
    'const VALID_THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];',
    'const VALID_THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"];'],
  ['dist/cli/args.js',
    'Set thinking level: off, minimal, low, medium, high, xhigh, max\n  --extension',
    'Set thinking level: off, minimal, low, medium, high, xhigh, max, ultra\n  --extension'],
  ['dist/modes/interactive/components/thinking-selector.js',
    '    max: "Maximum reasoning",\n};',
    '    max: "Maximum reasoning",\n    ultra: "Ultra reasoning",\n};'],
  ['dist/modes/interactive/components/settings-selector.js',
    '    max: "Maximum reasoning",\n};',
    '    max: "Maximum reasoning",\n    ultra: "Ultra reasoning",\n};'],
  ['dist/modes/interactive/theme/theme-tokens.d.ts',
    '    readonly bashMode: {',
    '    readonly thinkingUltra: { readonly slot: "foreground"; readonly description: "Thinking level border: ultra primary"; readonly fallback: "thinkingMax"; };\n    readonly thinkingUltraAlt: { readonly slot: "foreground"; readonly description: "Thinking level border: ultra pulse alternate"; readonly fallback: "thinkingUltra"; };\n    readonly bashMode: {'],
  ['dist/modes/interactive/theme/theme-tokens.js',
    '    bashMode: { slot: "foreground", description: "Editor border color in bash mode" },',
    '    thinkingUltra: { slot: "foreground", description: "Thinking level border: ultra primary", fallback: "thinkingMax" },\n    thinkingUltraAlt: { slot: "foreground", description: "Thinking level border: ultra pulse alternate", fallback: "thinkingUltra" },\n    bashMode: { slot: "foreground", description: "Editor border color in bash mode" },'],
  ['dist/modes/interactive/theme/theme.js',
    '            case "max":\n                return (str) => this.fg("thinkingMax", str);',
    '            case "max":\n                return (str) => this.fg("thinkingMax", str);\n            case "ultra":\n                return (str) => this.fg(Math.floor(Date.now() / 350) % 2 === 0 ? "thinkingUltra" : "thinkingUltraAlt", str);'],
  ['dist/modes/interactive/theme/dark.json',
    '\t\t"thinkingMax": "okhsl(20 99% 63%)",',
    '\t\t"thinkingMax": "okhsl(20 99% 63%)",\n\t\t"thinkingUltra": "#ff8cff",\n\t\t"thinkingUltraAlt": "#ff5faf",'],
  ['dist/modes/interactive/theme/light.json',
    '\t\t"thinkingMax": "okhsl(20 98% 68%)",',
    '\t\t"thinkingMax": "okhsl(20 98% 68%)",\n\t\t"thinkingUltra": "#d00072",\n\t\t"thinkingUltraAlt": "#b8007f",'],
  ['dist/modes/interactive/interactive-mode.js',
    '    updateEditorBorderColor() {\n        if (this.isBashMode) {\n            this.editor.borderColor = theme.getBashModeBorderColor();\n        }\n        else {\n            const level = this.session.thinkingLevel || "off";\n            this.editor.borderColor = theme.getThinkingBorderColor(level);\n        }\n        this.activeStatusIndicator?.invalidate();\n        this.ui.requestRender();\n    }',
    '    updateEditorBorderColor() {\n        const level = this.session.thinkingLevel || "off";\n        if (this.isBashMode) {\n            this.editor.borderColor = theme.getBashModeBorderColor();\n        }\n        else {\n            this.editor.borderColor = theme.getThinkingBorderColor(level);\n        }\n        if (level === "ultra" && !this.isBashMode) {\n            if (!this.ultraPulseTimer) {\n                this.ultraPulseTimer = setInterval(() => {\n                    if (this.session.thinkingLevel !== "ultra" || this.isBashMode) {\n                        clearInterval(this.ultraPulseTimer);\n                        this.ultraPulseTimer = undefined;\n                        return;\n                    }\n                    this.editor.borderColor = theme.getThinkingBorderColor("ultra");\n                    this.ui.requestRender();\n                }, 350);\n                this.ultraPulseTimer.unref?.();\n            }\n        }\n        else if (this.ultraPulseTimer) {\n            clearInterval(this.ultraPulseTimer);\n            this.ultraPulseTimer = undefined;\n        }\n        this.activeStatusIndicator?.invalidate();\n        this.ui.requestRender();\n    }'],
];

function count(source, value) { return source.split(value).length - 1; }
/** Every anchor that applies to one package version, in declaration order. */
function operationsForVersion(version) {
  const all = [...PATCHES, ...(version === '1.5.0' ? BUNDLE_150_PATCHES : [])];
  const operations = [];
  for (const [rel, before, after, expected = 1, versions = SUPPORTED_PACKAGE_VERSIONS] of all) {
    if (!versions.includes(version) || (rel.startsWith('dist/bundle/') && version !== '1.5.0')) continue;
    operations.push({ rel, before, after, expectedCount: expected });
  }
  return operations;
}
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
  if (meta.name !== PACKAGE_NAME || !SUPPORTED_PACKAGE_VERSIONS.includes(meta.version)) throw new Error('package identity mismatch');
  const grouped = new Map();
  for (const { rel, before, after, expectedCount } of operationsForVersion(meta.version)) {
    const list = grouped.get(rel) ?? []; list.push({ before, after, expectedCount }); grouped.set(rel, list);
  }
  const targets = [];
  for (const [rel, operations] of grouped) {
    const target = path.join(packageRoot, rel);
    if (rel.startsWith('dist/bundle/')) {
      try { await access(target); } catch (error) {
        if (error.code === 'ENOENT') continue;
        throw error;
      }
    }
    const stat = await lstat(target);
    if (!stat.isFile()) throw new Error(`target is not a regular file: ${rel}`);
    const original = await readFile(target); let source = original.toString('utf8'); let changed = false;
    for (const { before, after, expectedCount } of operations) {
      const bc = count(source, before), ac = count(source, after), expected = expectedCount;
      if (ac === expected) continue;
      if (bc === expected && ac === 0) {
        source = source.split(before).join(after);
        changed = true;
      } else throw new Error(`anchor cardinality mismatch: ${rel} (expected ${expected} pristine or patched; found ${bc} pristine, ${ac} patched)`);
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
  try { const changed = await patch(resolveRoot(process.argv.slice(2))); console.log(changed ? 'Pi ultra-thinking patch applied.' : 'Pi ultra-thinking patch already applied.'); }
  catch (error) { console.error(`Pi ultra-thinking patch refused: ${error instanceof Error ? error.message : 'unknown error'}`); process.exitCode = 1; }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
export { PACKAGE_NAME, PACKAGE_VERSION, SUPPORTED_PACKAGE_VERSIONS, PATCHES, BUNDLE_150_PATCHES, PULSE_MS, operationsForVersion, patch, resolveRoot };
