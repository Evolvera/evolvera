#!/usr/bin/env node
import { chmod, lstat, mkdtemp, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_NAME = '@tintinweb/pi-subagents';
const PACKAGE_VERSION = '0.18.2';
const PATCHES = [
  ['src/index.ts', `      void runMentionClone({ ctx, type, message: mention.message, agentTool: registeredAgentTool })
        .then((result) => {
          if (result.spawned) return;
          // A clone that could not run must not swallow the mention: start the
          // agent the direct way rather than leaving the user with a toast and
          // nothing running.
          try {
            spawnTopLevel(pi, ctx, type, mention.message, {
              description: describeMention(mention.message),
              isBackground: true,
            });
            ctx.ui.notify(\`Started \${label} directly — \${result.error}\`, "warning");
          } catch (err) {
            ctx.ui.notify(
              \`Could not start \${label}: \${err instanceof Error ? err.message : String(err)}\`,
              "error",
            );
          }
        });`, `      void runMentionClone({ ctx, type, message: mention.message, agentTool: registeredAgentTool })
        .then((result) => {
          if (result.spawned || currentCtx !== ctx) return;
          // A clone that could not run must not swallow the mention: start the
          // agent the direct way rather than leaving the user with a toast and
          // nothing running.
          try {
            spawnTopLevel(pi, ctx, type, mention.message, {
              description: describeMention(mention.message),
              isBackground: true,
            });
            ctx.ui.notify(\`Started \${label} directly — \${result.error}\`, "warning");
          } catch (err) {
            if (currentCtx !== ctx) return;
            ctx.ui.notify(
              \`Could not start \${label}: \${err instanceof Error ? err.message : String(err)}\`,
              "error",
            );
          }
        })
        .catch(() => {});`],
  ['dist/index.js', `            void runMentionClone({ ctx, type, message: mention.message, agentTool: registeredAgentTool })
                .then((result) => {
                if (result.spawned)
                    return;
                // A clone that could not run must not swallow the mention: start the
                // agent the direct way rather than leaving the user with a toast and
                // nothing running.
                try {
                    spawnTopLevel(pi, ctx, type, mention.message, {
                        description: describeMention(mention.message),
                        isBackground: true,
                    });
                    ctx.ui.notify(\`Started \${label} directly — \${result.error}\`, "warning");
                }
                catch (err) {
                    ctx.ui.notify(\`Could not start \${label}: \${err instanceof Error ? err.message : String(err)}\`, "error");
                }
            });`, `            void runMentionClone({ ctx, type, message: mention.message, agentTool: registeredAgentTool })
                .then((result) => {
                if (result.spawned || currentCtx !== ctx)
                    return;
                // A clone that could not run must not swallow the mention: start the
                // agent the direct way rather than leaving the user with a toast and
                // nothing running.
                try {
                    spawnTopLevel(pi, ctx, type, mention.message, {
                        description: describeMention(mention.message),
                        isBackground: true,
                    });
                    ctx.ui.notify(\`Started \${label} directly — \${result.error}\`, "warning");
                }
                catch (err) {
                    if (currentCtx !== ctx)
                        return;
                    ctx.ui.notify(\`Could not start \${label}: \${err instanceof Error ? err.message : String(err)}\`, "error");
                }
            })
                .catch(() => { });`],
];

function resolveRoot(argv, env = process.env) {
  if (!argv.length) return path.join(env.PI_CODING_AGENT_DIR || path.join(os.homedir(), '.pi', 'agent'), 'npm', 'node_modules', '@tintinweb', 'pi-subagents');
  if (argv.length === 2 && argv[0] === '--package-root' && path.isAbsolute(argv[1])) return argv[1];
  throw new Error('unsupported arguments');
}
const count = (source, value) => source.split(value).length - 1;
async function stage(target, bytes, mode) {
  const dir = await mkdtemp(path.join(path.dirname(target), '.pi-subagents-stale-context-'));
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
    const [, before, after] = PATCHES.find(([file]) => file === rel);
    const beforeCount = count(source, before); const afterCount = count(source, after);
    if (afterCount === 1 && beforeCount === 0) {
      targets.push({ target, original, output: original, mode: stat.mode & 0o7777, changed: false });
      continue;
    }
    if (beforeCount !== 1 || afterCount !== 0) throw new Error(`anchor cardinality mismatch: ${rel} (before=${beforeCount}, after=${afterCount})`);
    source = source.replace(before, () => after);
    targets.push({ target, original, output: Buffer.from(source), mode: stat.mode & 0o7777, changed: true });
  }
  const changed = targets.filter(t => t.changed); if (!changed.length) return false;
  const staged = [];
  try {
    for (const t of changed) staged.push({ t, next: await stage(t.target, t.output, t.mode), prev: await stage(t.target, t.original, t.mode) });
    const committed = [];
    try { for (const entry of staged) { committed.push(entry); await renameFile(entry.next.file, entry.t.target); } }
    catch (error) { for (const entry of committed.reverse()) await renameFile(entry.prev.file, entry.t.target); throw error; }
  } finally { await Promise.all(staged.flatMap(entry => [entry.next.dir, entry.prev.dir]).map(dir => rm(dir, { recursive: true, force: true }))); }
  return true;
}
async function main() {
  try { const changed = await patch(resolveRoot(process.argv.slice(2))); console.log(changed ? 'pi-subagents stale-mention-context patch applied.' : 'pi-subagents stale-mention-context patch already applied.'); }
  catch (error) { console.error(`pi-subagents stale-mention-context patch refused: ${error instanceof Error ? error.message : 'unknown error'}`); process.exitCode = 1; }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
export { PACKAGE_NAME, PACKAGE_VERSION, PATCHES, patch, resolveRoot };
