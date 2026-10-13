#!/usr/bin/env node
// Holds subagent completion notifications while the parent session is busy.
// Upstream queues a follow-up message the moment an agent finishes. If the parent
// consumes that result with get_subagent_result later in the same turn, the queued
// message still fires afterwards and wakes the model once per agent for nothing.
// Patched: while the parent is busy, completions wait; once it is idle they are
// re-checked, consumed ones are dropped, and the rest arrive together as one turn.
import { chmod, lstat, mkdtemp, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_NAME = '@tintinweb/pi-subagents';
const PACKAGE_VERSION = '0.18.2';
const POLL_MS = 250;
const IDLE_STABLE_MS = 1000;
const COMPACTION_MAX_MS = 600000;

// v1 block (installed by the first version of this patch); kept only to upgrade it in place.
const deferBlockV1 = (ts) => `  // ---- Deferred completion notifications (Evolvera patch) ----
  // A completion that lands while the parent is busy waits until it is idle and is
  // re-checked then, so a result consumed meanwhile through get_subagent_result never
  // wakes the model again, and held completions arrive together as one turn.
  const deferredNudges = new Map${ts ? '<string, AgentRecord>' : ''}();
  let deferredNudgeTimer${ts ? ': ReturnType<typeof setTimeout> | undefined' : ''};
  function parentBusy()${ts ? ': boolean' : ''} {
    try { return currentCtx !== undefined && (!currentCtx.isIdle() || currentCtx.hasPendingMessages()); }
    catch { return false; }
  }
  function deferNudge(records${ts ? ': AgentRecord[]' : ''})${ts ? ': boolean' : ''} {
    if (!parentBusy()) return false;
    for (const r of records) deferredNudges.set(r.id, r);
    if (!deferredNudgeTimer) deferredNudgeTimer = setTimeout(flushDeferredNudges, ${POLL_MS});
    return true;
  }
  function flushDeferredNudges() {
    deferredNudgeTimer = undefined;
    if (deferredNudges.size === 0) return;
    if (!currentCtx) { deferredNudges.clear(); return; }
    if (parentBusy()) { deferredNudgeTimer = setTimeout(flushDeferredNudges, ${POLL_MS}); return; }
    const pending = [...deferredNudges.values()].filter(r => !r.resultConsumed);
    deferredNudges.clear();
    if (pending.length === 1) { emitIndividualNudge(pending[0]); return; }
    if (pending.length === 0) return;
    const [first, ...rest] = pending;
    const details = buildNotificationDetails(first, 300, agentActivity.get(first.id));
    details.others = rest.map(r => buildNotificationDetails(r, 300, agentActivity.get(r.id)));
    pi.sendMessage${ts ? '<NotificationDetails>' : ''}({
      customType: "subagent-notification",
      content: \`Background agent group completed: \${pending.length} agent(s) finished\\n\\n\${pending.map(r => formatTaskNotification(r, 300, showCost)).join('\\n\\n')}\\n\\nUse get_subagent_result for full output.\`,
      display: true,
      details,
    }, { deliverAs: "followUp", triggerTurn: true });
  }

`;

// Body shared by both files; only type annotations differ.
const deferBlock = (ts) => `  // ---- Deferred completion notifications (Evolvera patch v2) ----
  // A completion that lands while the parent is busy waits until it is idle and is
  // re-checked then, so a result consumed meanwhile through get_subagent_result never
  // wakes the model again, and held completions arrive together as one turn.
  // Compaction counts as busy: the session is idle while it summarizes, and a turn
  // started then runs on the context the compaction is about to replace (it stalled
  // a real session). Idle must also hold for a full second before anything is sent.
  const deferredNudges = new Map${ts ? '<string, AgentRecord>' : ''}();
  let deferredNudgeTimer${ts ? ': ReturnType<typeof setTimeout> | undefined' : ''};
  let compactingSince = 0;
  let idleSince = 0;
  pi.on("session_before_compact", () => { compactingSince = Date.now(); });
  pi.on("session_compact", () => { compactingSince = 0; });
  pi.on("agent_start", () => { compactingSince = 0; });
  function parentBusy()${ts ? ': boolean' : ''} {
    if (compactingSince && Date.now() - compactingSince < ${COMPACTION_MAX_MS}) return true;
    try { return currentCtx !== undefined && (!currentCtx.isIdle() || currentCtx.hasPendingMessages()); }
    catch { return false; }
  }
  function deferNudge(records${ts ? ': AgentRecord[]' : ''})${ts ? ': boolean' : ''} {
    if (!parentBusy()) return false;
    for (const r of records) deferredNudges.set(r.id, r);
    if (!deferredNudgeTimer) deferredNudgeTimer = setTimeout(flushDeferredNudges, ${POLL_MS});
    return true;
  }
  function flushDeferredNudges() {
    deferredNudgeTimer = undefined;
    if (deferredNudges.size === 0) return;
    if (!currentCtx) { deferredNudges.clear(); return; }
    if (parentBusy()) { idleSince = 0; deferredNudgeTimer = setTimeout(flushDeferredNudges, ${POLL_MS}); return; }
    if (!idleSince) idleSince = Date.now();
    if (Date.now() - idleSince < ${IDLE_STABLE_MS}) { deferredNudgeTimer = setTimeout(flushDeferredNudges, ${POLL_MS}); return; }
    idleSince = 0;
    const pending = [...deferredNudges.values()].filter(r => !r.resultConsumed);
    deferredNudges.clear();
    if (pending.length === 1) { emitIndividualNudge(pending[0]); return; }
    if (pending.length === 0) return;
    const [first, ...rest] = pending;
    const details = buildNotificationDetails(first, 300, agentActivity.get(first.id));
    details.others = rest.map(r => buildNotificationDetails(r, 300, agentActivity.get(r.id)));
    pi.sendMessage${ts ? '<NotificationDetails>' : ''}({
      customType: "subagent-notification",
      content: \`Background agent group completed: \${pending.length} agent(s) finished\\n\\n\${pending.map(r => formatTaskNotification(r, 300, showCost)).join('\\n\\n')}\\n\\nUse get_subagent_result for full output.\`,
      display: true,
      details,
    }, { deliverAs: "followUp", triggerTurn: true });
  }

`;

const PATCHES = [
  ['src/index.ts',
    '    if (record.resultConsumed) return;  // re-check at send time\n',
    '    if (record.resultConsumed) return;  // re-check at send time\n    if (deferNudge([record])) return;\n'],
  ['src/index.ts',
    '        if (unconsumed.length === 0) { widget.update(); return; }\n',
    '        if (unconsumed.length === 0) { widget.update(); return; }\n        if (deferNudge(unconsumed)) { widget.update(); return; }\n'],
  ['src/index.ts',
    '  // ---- Group join manager ----\n',
    `${deferBlock(true)}  // ---- Group join manager ----\n`],
  ['dist/index.js',
    '        if (record.resultConsumed)\n            return; // re-check at send time\n',
    '        if (record.resultConsumed)\n            return; // re-check at send time\n        if (deferNudge([record]))\n            return;\n'],
  ['dist/index.js',
    '            if (unconsumed.length === 0) {\n                widget.update();\n                return;\n            }\n',
    '            if (unconsumed.length === 0) {\n                widget.update();\n                return;\n            }\n            if (deferNudge(unconsumed)) {\n                widget.update();\n                return;\n            }\n'],
  ['dist/index.js',
    '    // ---- Group join manager ----\n',
    `${deferBlock(false).replace(/^ {2}/gm, '    ')}    // ---- Group join manager ----\n`],
];
const MARKER = 'Deferred completion notifications (Evolvera patch v2)';
const MARKER_V1 = 'Deferred completion notifications (Evolvera patch) ----';

function resolveRoot(argv, env = process.env) {
  if (!argv.length) return path.join(env.PI_CODING_AGENT_DIR || path.join(os.homedir(), '.pi', 'agent'), 'npm', 'node_modules', '@tintinweb', 'pi-subagents');
  if (argv.length === 2 && argv[0] === '--package-root' && path.isAbsolute(argv[1])) return argv[1];
  throw new Error('unsupported arguments');
}
const count = (source, value) => source.split(value).length - 1;
async function stage(target, bytes, mode) {
  const dir = await mkdtemp(path.join(path.dirname(target), '.pi-subagents-nudges-'));
  const file = path.join(dir, path.basename(target));
  await writeFile(file, bytes, { flag: 'wx', mode }); await chmod(file, mode);
  const h = await open(file, 'r+'); try { await h.sync(); } finally { await h.close(); }
  return { dir, file };
}
async function patch(root, { renameFile = rename } = {}) {
  const meta = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  if (meta.name !== PACKAGE_NAME || meta.version !== PACKAGE_VERSION) throw new Error('package identity mismatch');
  const targets = [];
  for (const rel of [...new Set(PATCHES.map(([rel]) => rel))]) {
    const target = path.join(root, rel); const stat = await lstat(target); const original = await readFile(target);
    let source = original.toString('utf8');
    const own = PATCHES.filter(([r]) => r === rel);
    if (count(source, MARKER_V1) === 1) {
      const ts = rel.endsWith('.ts');
      const oldBlock = ts ? deferBlockV1(true) : deferBlockV1(false).replace(/^ {2}/gm, '    ');
      const newBlock = ts ? deferBlock(true) : deferBlock(false).replace(/^ {2}/gm, '    ');
      if (count(source, oldBlock) !== 1) throw new Error(`anchor cardinality mismatch: ${rel}`);
      source = source.replace(oldBlock, () => newBlock);
      targets.push({ target, original, output: Buffer.from(source), mode: stat.mode & 0o7777, changed: true });
      continue;
    }
    if (count(source, MARKER) === 1 && own.every(([, , after]) => count(source, after) === 1)) {
      targets.push({ target, original, output: original, mode: stat.mode & 0o7777, changed: false });
      continue;
    }
    if (count(source, MARKER) !== 0) throw new Error(`anchor cardinality mismatch: ${rel}`);
    for (const [, before, after] of own) {
      if (count(source, before) !== 1) throw new Error(`anchor cardinality mismatch: ${rel}`);
      source = source.replace(before, () => after);
    }
    targets.push({ target, original, output: Buffer.from(source), mode: stat.mode & 0o7777, changed: true });
  }
  const changed = targets.filter((t) => t.changed); if (!changed.length) return false;
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
  try { const changed = await patch(resolveRoot(process.argv.slice(2))); console.log(changed ? 'pi-subagents deferred-nudges patch applied.' : 'pi-subagents deferred-nudges patch already applied.'); }
  catch (error) { console.error(`pi-subagents deferred-nudges patch refused: ${error instanceof Error ? error.message : 'unknown error'}`); process.exitCode = 1; }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
export { PACKAGE_NAME, PACKAGE_VERSION, PATCHES, MARKER, POLL_MS, IDLE_STABLE_MS, deferBlock, deferBlockV1, patch, resolveRoot };
