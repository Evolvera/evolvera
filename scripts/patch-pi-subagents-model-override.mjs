#!/usr/bin/env node
import { chmod, lstat, mkdtemp, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_NAME = '@tintinweb/pi-subagents';
const PACKAGE_VERSION = '0.18.2';
const PATCHES = [
  ['src/invocation-config.ts', `  const overriddenThinking = agentConfig?.thinking != null && params.thinking != null
    && agentConfig.thinking !== params.thinking
    ? params.thinking as ThinkingLevel
    : undefined;
  const overriddenModel = agentConfig?.model != null && params.model != null
    && agentConfig.model !== params.model
    ? params.model
    : undefined;

`, '  // Caller parameters win, so there are no overridden caller values.\n'],
  ['src/invocation-config.ts', 'modelInput: agentConfig?.model ?? params.model,', 'modelInput: params.model ?? (agentConfig?.model && agentConfig.model.trim().toLowerCase() !== "inherit" ? agentConfig.model : undefined),'],
  ['src/invocation-config.ts', `    // Undefined rather than an empty object when nothing was overridden: callers
    // spread this into the invocation snapshot, and an always-present key would
    // put \`requestedThinking: undefined\` on every record.
    overridden: overriddenThinking || overriddenModel
      ? { thinking: overriddenThinking, model: overriddenModel }
      : undefined,`, '    // Caller parameters now win, so no invocation value was overridden.\n    overridden: undefined,'],
  ['src/invocation-config.ts', 'modelFromParams: agentConfig?.model == null && params.model != null,', 'modelFromParams: params.model != null,'],
  ['src/invocation-config.ts', 'thinking: (agentConfig?.thinking ?? params.thinking) as ThinkingLevel | undefined,', 'thinking: (params.thinking ?? agentConfig?.thinking) as ThinkingLevel | undefined,'],
  ['dist/invocation-config.js', `    const overriddenThinking = agentConfig?.thinking != null && params.thinking != null
        && agentConfig.thinking !== params.thinking
        ? params.thinking
        : undefined;
    const overriddenModel = agentConfig?.model != null && params.model != null
        && agentConfig.model !== params.model
        ? params.model
        : undefined;
`, '    // Caller parameters win, so there are no overridden caller values.\n'],
  ['dist/invocation-config.js', 'modelInput: agentConfig?.model ?? params.model,', 'modelInput: params.model ?? (agentConfig?.model && agentConfig.model.trim().toLowerCase() !== "inherit" ? agentConfig.model : undefined),'],
  ['dist/invocation-config.js', `        // Undefined rather than an empty object when nothing was overridden: callers
        // spread this into the invocation snapshot, and an always-present key would
        // put \`requestedThinking: undefined\` on every record.
        overridden: overriddenThinking || overriddenModel
            ? { thinking: overriddenThinking, model: overriddenModel }
            : undefined,`, '        // Caller parameters now win, so no invocation value was overridden.\n        overridden: undefined,'],
  ['dist/invocation-config.js', 'modelFromParams: agentConfig?.model == null && params.model != null,', 'modelFromParams: params.model != null,'],
  ['dist/invocation-config.js', 'thinking: (agentConfig?.thinking ?? params.thinking),', 'thinking: (params.thinking ?? agentConfig?.thinking),'],
  ['src/index.ts', `      // Resolve model from agent config first; tool-call params only fill gaps.
      let model = ctx.model;
      if (resolvedConfig.modelInput) {
        const resolved = resolveModel(resolvedConfig.modelInput, ctx.modelRegistry);
        if (typeof resolved === "string") {
          if (resolvedConfig.modelFromParams) return textResult(resolved);
          // config-specified: silent fallback to parent
        } else {
          model = resolved;
        }
      }`, `      // Frontmatter is a default, never a reason to silently start on the parent model.
      let model = ctx.model;
      if (resolvedConfig.modelInput) {
        const resolved = resolveModel(resolvedConfig.modelInput, ctx.modelRegistry);
        if (typeof resolved === "string") {
          return textResult(resolved + "\\n\\nAgent type default model: " + (customConfig?.model ?? "none"));
        }
        model = resolved;
      }`],
  ['dist/index.js', `            // Resolve model from agent config first; tool-call params only fill gaps.
            let model = ctx.model;
            if (resolvedConfig.modelInput) {
                const resolved = resolveModel(resolvedConfig.modelInput, ctx.modelRegistry);
                if (typeof resolved === "string") {
                    if (resolvedConfig.modelFromParams)
                        return textResult(resolved);
                    // config-specified: silent fallback to parent
                }
                else {
                    model = resolved;
                }
            }`, `            // Frontmatter is a default, never a reason to silently start on the parent model.
            let model = ctx.model;
            if (resolvedConfig.modelInput) {
                const resolved = resolveModel(resolvedConfig.modelInput, ctx.modelRegistry);
                if (typeof resolved === "string") {
                    return textResult(resolved + "\\n\\nAgent type default model: " + (customConfig?.model ?? "none"));
                }
                model = resolved;
            }`]
];

function resolveRoot(argv, env = process.env) {
  if (!argv.length) return path.join(env.PI_CODING_AGENT_DIR || path.join(os.homedir(), '.pi', 'agent'), 'npm', 'node_modules', '@tintinweb', 'pi-subagents');
  if (argv.length === 2 && argv[0] === '--package-root' && path.isAbsolute(argv[1])) return argv[1];
  throw new Error('unsupported arguments');
}
const count = (source, value) => source.split(value).length - 1;
async function stage(target, bytes, mode) {
  const dir = await mkdtemp(path.join(path.dirname(target), '.pi-subagents-model-'));
  const file = path.join(dir, path.basename(target));
  await writeFile(file, bytes, { flag: 'wx', mode }); await chmod(file, mode);
  const handle = await open(file, 'r+'); try { await handle.sync(); } finally { await handle.close(); }
  return { dir, file };
}
async function patch(root, { renameFile = rename } = {}) {
  const meta = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  if (meta.name !== PACKAGE_NAME || meta.version !== PACKAGE_VERSION) throw new Error('package identity mismatch');
  const targets = [];
  for (const rel of [...new Set(PATCHES.map(([file]) => file))]) {
    const target = path.join(root, rel); const stat = await lstat(target); const original = await readFile(target); let source = original.toString('utf8');
    let changed = false;
    for (const [, before, after] of PATCHES.filter(([file]) => file === rel)) {
      const beforeCount = count(source, before), afterCount = count(source, after);
      if (afterCount === 1 && beforeCount === 0) continue;
      if (beforeCount !== 1 || afterCount !== 0) throw new Error(`anchor cardinality mismatch: ${rel}: ${JSON.stringify(before.slice(0, 80))} (before=${beforeCount}, after=${afterCount})`);
      source = source.replace(before, () => after); changed = true;
    }
    targets.push({ target, original, output: changed ? Buffer.from(source) : original, mode: stat.mode & 0o7777, changed });
  }
  const changed = targets.filter(t => t.changed); if (!changed.length) return false;
  const staged = [];
  try {
    for (const t of changed) staged.push({ t, next: await stage(t.target, t.output, t.mode), prev: await stage(t.target, t.original, t.mode) });
    const committed = [];
    try { for (const x of staged) { committed.push(x); await renameFile(x.next.file, x.t.target); } }
    catch (error) { for (const x of committed.reverse()) await renameFile(x.prev.file, x.t.target); throw error; }
  } finally { await Promise.all(staged.flatMap(x => [x.next.dir, x.prev.dir]).map(d => rm(d, { recursive: true, force: true }))); }
  return true;
}
async function main() {
  try { const changed = await patch(resolveRoot(process.argv.slice(2))); console.log(changed ? 'pi-subagents model-override patch applied.' : 'pi-subagents model-override patch already applied.'); }
  catch (error) { console.error(`pi-subagents model-override patch refused: ${error instanceof Error ? error.message : 'unknown error'}`); process.exitCode = 1; }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
export { PACKAGE_NAME, PACKAGE_VERSION, PATCHES, patch, resolveRoot };
