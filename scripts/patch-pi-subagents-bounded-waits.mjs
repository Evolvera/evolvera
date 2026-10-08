#!/usr/bin/env node
import { chmod, lstat, mkdtemp, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_NAME = '@tintinweb/pi-subagents';
const PACKAGE_VERSION = '0.18.2';
const WAIT_MS = 60_000;
const BASH_DEFAULT_SECONDS = 300;
const BASH_MAX_SECONDS = 1800;
const WAIT_HELPER_TS = `/** Wait at most waitMs for a record without cancelling or consuming its worker. */
export async function waitForRecord(record: { status: string; promise?: Promise<unknown> }, signal?: AbortSignal, waitMs = 60_000, pollMs = 250): Promise<boolean> {
  if (signal?.aborted) throw signal.reason;
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const deadline = new Promise<false>(resolve => { deadlineTimer = setTimeout(() => resolve(false), waitMs); });
  const aborted = signal ? new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
  }) : new Promise<never>(() => {});
  const worker = async (): Promise<boolean> => {
    while (record.status === "queued") {
      let pollTimer: ReturnType<typeof setTimeout> | undefined;
      const poll = new Promise<true>(resolve => { pollTimer = setTimeout(() => resolve(true), pollMs); });
      try {
        const result = await Promise.race([poll, deadline, aborted]);
        if (result === false) return false;
      } finally { if (pollTimer) clearTimeout(pollTimer); }
    }
    if (record.status === "running" && record.promise) {
      return Promise.race([record.promise.then(() => true), deadline, aborted]);
    }
    return true;
  };
  try { return await Promise.race([worker(), deadline, aborted]); }
  finally {
    if (deadlineTimer) clearTimeout(deadlineTimer);
    if (signal && onAbort) signal.removeEventListener("abort", onAbort);
  }
}
`;
const BASH_TOOL_HELPER_TS = `export function createBoundedBashTool(cwd: string, shellPath: string | undefined, commandPrefix: string | undefined, factory = createBashToolDefinition) {
  const base = factory(cwd, { shellPath, commandPrefix });
  const properties = (base.parameters as any).properties;
  return {
    ...base,
    description: \`\${base.description} Timeout is in seconds: defaults to 300 seconds; explicit values must be greater than 0 and at most 1800 seconds.\`,
    parameters: Type.Object({
      ...properties,
      timeout: Type.Optional(Type.Number({ description: "Timeout in seconds (default 300; maximum 1800)." })),
    }),
    execute: async (toolCallId: string, params: { command: string; timeout?: number }, signal: AbortSignal | undefined, onUpdate: any, ctx: any) => {
      const timeout = params.timeout ?? 300;
      if (!Number.isFinite(timeout) || timeout <= 0 || timeout > 1800) {
        throw new Error("Invalid bash timeout: provide a finite number of seconds greater than 0 and at most 1800 (timeout is seconds, not milliseconds).");
      }
      return base.execute(toolCallId, { ...params, timeout }, signal, onUpdate, ctx);
    },
  };
}
`;
const BASH_TOOL_HELPER_JS = `export function createBoundedBashTool(cwd, shellPath, commandPrefix, factory = createBashToolDefinition) {
    const base = factory(cwd, { shellPath, commandPrefix });
    const properties = base.parameters.properties;
    return {
        ...base,
        description: \`\${base.description} Timeout is in seconds: defaults to 300 seconds; explicit values must be greater than 0 and at most 1800 seconds.\`,
        parameters: Type.Object({ ...properties, timeout: Type.Optional(Type.Number({ description: "Timeout in seconds (default 300; maximum 1800)." })) }),
        execute: async (toolCallId, params, signal, onUpdate, ctx) => {
            const timeout = params.timeout ?? 300;
            if (!Number.isFinite(timeout) || timeout <= 0 || timeout > 1800)
                throw new Error("Invalid bash timeout: provide a finite number of seconds greater than 0 and at most 1800 (timeout is seconds, not milliseconds).");
            return base.execute(toolCallId, { ...params, timeout }, signal, onUpdate, ctx);
        },
    };
}
`;
const WAIT_HELPER_JS = `/** Wait at most waitMs for a record without cancelling or consuming its worker. */
export async function waitForRecord(record, signal, waitMs = 60_000, pollMs = 250) {
  if (signal?.aborted) throw signal.reason;
  let deadlineTimer;
  let onAbort;
  const deadline = new Promise(resolve => { deadlineTimer = setTimeout(() => resolve(false), waitMs); });
  const aborted = signal ? new Promise((_resolve, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
  }) : new Promise(() => {});
  const worker = async () => {
    while (record.status === "queued") {
      let pollTimer;
      const poll = new Promise(resolve => { pollTimer = setTimeout(() => resolve(true), pollMs); });
      try {
        const result = await Promise.race([poll, deadline, aborted]);
        if (result === false) return false;
      } finally { if (pollTimer) clearTimeout(pollTimer); }
    }
    if (record.status === "running" && record.promise) {
      return Promise.race([record.promise.then(() => true), deadline, aborted]);
    }
    return true;
  };
  try { return await Promise.race([worker(), deadline, aborted]); }
  finally {
    if (deadlineTimer) clearTimeout(deadlineTimer);
    if (signal && onAbort) signal.removeEventListener("abort", onAbort);
  }
}
`;

const PATCHES = [
  ['src/abortable.ts', 'export async function waitForRecord', WAIT_HELPER_TS, true],
  ['dist/abortable.js', 'export async function waitForRecord', WAIT_HELPER_JS, true],
  ['src/index.ts', 'import { abortable } from "./abortable.js";', 'import { waitForRecord } from "./abortable.js";', false],
  ['src/index.ts', 'description: "If true, wait for the agent to complete before returning. Default: false.",', 'description: "If true, wait up to 60 seconds for the agent to complete. If still queued or running, returns its current status; the worker continues and will notify you. Default: false.",', false],
  ['src/index.ts', `      if (params.wait && (record.status === "running" || record.status === "queued")) {
        while (record.status === "queued") {
          await abortable(
            new Promise<void>((resolve) => setTimeout(resolve, QUEUE_WAIT_POLL_MS)),
            signal,
          );
        }
        if (record.promise) await abortable(record.promise, signal);
      }`, `      let waitTimedOut = false;
      if (params.wait && (record.status === "running" || record.status === "queued")) {
        waitTimedOut = !(await waitForRecord(record, signal, ${WAIT_MS}));
      }`, false],
  ['src/index.ts', '      if (record.status === "running") {\n        output += "Agent is still running. Use wait: true or check back later.";', '      if (record.status === "running" || (waitTimedOut && record.status === "queued")) {\n        output += waitTimedOut\n          ? `Wait limit reached; agent is still ${record.status}. The result remains unconsumed; the worker continues and will notify you when complete.`\n          : "Agent is still running. It will notify you when complete.";', false],
  ['src/nested-tools.ts', 'import { abortable } from "./abortable.js";', 'import { waitForRecord } from "./abortable.js";', false],
  ['src/nested-tools.ts', '      wait: Type.Optional(Type.Boolean()),', '      wait: Type.Optional(Type.Boolean({ description: "Wait up to 60 seconds; if still queued or running, return the current status. The child continues and can be fetched later with get_subagent_result." })),', false],
  ['src/nested-tools.ts', `      if (params.wait && (record.status === "queued" || record.status === "running")) {
        while (record.status === "queued") {
          await abortable(new Promise<void>(resolve => setTimeout(resolve, 250)), signal);
        }
        if (record.promise) await abortable(record.promise, signal);
      }
      return textResult(formatRecord(record, "fetched"), record.status === "error");`, `      let waitTimedOut = false;
      if (params.wait && (record.status === "queued" || record.status === "running")) {
        waitTimedOut = !(await waitForRecord(record, signal, ${WAIT_MS}));
      }
      const status = formatRecord(record, "fetched");
      return textResult(waitTimedOut
        ? \`Wait limit reached; nested agent is still \${record.status}. The child continues; its result remains unconsumed and can be fetched later with get_subagent_result.\`
        : status, record.status === "error");`, false],
  ['src/agent-runner.ts', '  createAgentSession,\n', '  createAgentSession,\n  createBashToolDefinition,\n', false],
  ['src/agent-runner.ts', 'import type { Model } from "@earendil-works/pi-ai";', 'import type { Model } from "@earendil-works/pi-ai";\nimport { Type } from "@sinclair/typebox";', false],
  ['src/agent-runner.ts', 'export async function runAgent(', `${BASH_TOOL_HELPER_TS}\nexport async function runAgent(`, false],
  ['src/agent-runner.ts', '  const settingsManager = SettingsManager.create(configCwd, agentDir);', `  const settingsManager = SettingsManager.create(configCwd, agentDir);
  const boundedBashTool = toolNames.includes("bash") && !disallowedSet?.has("bash")
    ? createBoundedBashTool(effectiveCwd, settingsManager.getShellPath(), settingsManager.getShellCommandPrefix())
    : undefined;
  const childCustomTools = [...nestedTools, ...(boundedBashTool ? [boundedBashTool] : [])];`, false],
  ['src/agent-runner.ts', '    customTools: nestedTools,', '    customTools: childCustomTools,', false],
  ['dist/index.js', 'import { abortable } from "./abortable.js";', 'import { waitForRecord } from "./abortable.js";', false],
  ['dist/index.js', 'description: "If true, wait for the agent to complete before returning. Default: false.",', 'description: "If true, wait up to 60 seconds for the agent to complete. If still queued or running, returns its current status; the worker continues and will notify you. Default: false.",', false],
  ['dist/index.js', `            if (params.wait && (record.status === "running" || record.status === "queued")) {
                while (record.status === "queued") {
                    await abortable(new Promise((resolve) => setTimeout(resolve, QUEUE_WAIT_POLL_MS)), signal);
                }
                if (record.promise)
                    await abortable(record.promise, signal);
            }`, `            let waitTimedOut = false;
            if (params.wait && (record.status === "running" || record.status === "queued")) {
                waitTimedOut = !(await waitForRecord(record, signal, ${WAIT_MS}));
            }`, false],
  ['dist/index.js', '            if (record.status === "running") {\n                output += "Agent is still running. Use wait: true or check back later.";', '            if (record.status === "running" || (waitTimedOut && record.status === "queued")) {\n                output += waitTimedOut\n                    ? `Wait limit reached; agent is still ${record.status}. The result remains unconsumed; the worker continues and will notify you when complete.`\n                    : "Agent is still running. It will notify you when complete.";', false],
  ['dist/nested-tools.js', 'import { abortable } from "./abortable.js";', 'import { waitForRecord } from "./abortable.js";', false],
  ['dist/nested-tools.js', '            wait: Type.Optional(Type.Boolean()),', '            wait: Type.Optional(Type.Boolean({ description: "Wait up to 60 seconds; if still queued or running, return the current status. The child continues and can be fetched later with get_subagent_result." })),', false],
  ['dist/nested-tools.js', `            if (params.wait && (record.status === "queued" || record.status === "running")) {
                while (record.status === "queued") {
                    await abortable(new Promise(resolve => setTimeout(resolve, 250)), signal);
                }
                if (record.promise)
                    await abortable(record.promise, signal);
            }
            return textResult(formatRecord(record, "fetched"), record.status === "error");`, `            let waitTimedOut = false;
            if (params.wait && (record.status === "queued" || record.status === "running")) {
                waitTimedOut = !(await waitForRecord(record, signal, ${WAIT_MS}));
            }
            const status = formatRecord(record, "fetched");
            return textResult(waitTimedOut
                ? \`Wait limit reached; nested agent is still \${record.status}. The child continues; its result remains unconsumed and can be fetched later with get_subagent_result.\`
                : status, record.status === "error");`, false],
  ['dist/agent-runner.js', 'import { createAgentSession, DefaultResourceLoader,', 'import { createAgentSession, createBashToolDefinition, DefaultResourceLoader,', false],
  ['dist/agent-runner.js', 'import { BUILTIN_TOOL_NAMES,', 'import { Type } from "@sinclair/typebox";\nimport { BUILTIN_TOOL_NAMES,', false],
  ['dist/agent-runner.js', 'export async function runAgent(', `${BASH_TOOL_HELPER_JS}\nexport async function runAgent(`, false],
  ['dist/agent-runner.js', '    const settingsManager = SettingsManager.create(configCwd, agentDir);', `    const settingsManager = SettingsManager.create(configCwd, agentDir);
    const boundedBashTool = toolNames.includes("bash") && !disallowedSet?.has("bash")
        ? createBoundedBashTool(effectiveCwd, settingsManager.getShellPath(), settingsManager.getShellCommandPrefix())
        : undefined;
    const childCustomTools = [...nestedTools, ...(boundedBashTool ? [boundedBashTool] : [])];`, false],
  ['dist/agent-runner.js', '        customTools: nestedTools,', '        customTools: childCustomTools,', false],
];

function resolveRoot(argv, env = process.env) {
  if (!argv.length) return path.join(env.PI_CODING_AGENT_DIR || path.join(os.homedir(), '.pi', 'agent'), 'npm', 'node_modules', '@tintinweb', 'pi-subagents');
  if (argv.length === 2 && argv[0] === '--package-root' && path.isAbsolute(argv[1])) return argv[1];
  throw new Error('unsupported arguments');
}
const count = (source, value) => source.split(value).length - 1;
async function stage(target, bytes, mode) {
  const dir = await mkdtemp(path.join(path.dirname(target), '.pi-subagents-bounded-'));
  const file = path.join(dir, path.basename(target));
  await writeFile(file, bytes, { flag: 'wx', mode }); await chmod(file, mode);
  const h = await open(file, 'r+'); try { await h.sync(); } finally { await h.close(); }
  return { dir, file };
}
async function patch(root, { renameFile = rename } = {}) {
  const meta = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  if (meta.name !== PACKAGE_NAME || meta.version !== PACKAGE_VERSION) throw new Error('package identity mismatch');
  const targets = [];
  for (const rel of [...new Set(PATCHES.map(([file]) => file))]) {
    const target = path.join(root, rel); const stat = await lstat(target); const original = await readFile(target); let source = original.toString('utf8');
    const edits = PATCHES.filter(([file]) => file === rel);
    const marker = rel.endsWith('abortable.ts') || rel.endsWith('abortable.js') ? 'export async function waitForRecord'
      : rel.endsWith('agent-runner.ts') || rel.endsWith('agent-runner.js') ? 'const boundedBashTool ='
      : 'waitTimedOut';
    const markerComplete = count(source, marker) === 1 && edits.every(([, before, after]) =>
      count(source, after) === 1 && (count(source, before) === 0 || after.includes(before)));
    const fullyPatched = markerComplete || edits.every(([, before, after, insertion]) =>
      count(source, after) === 1 && (insertion || before === after || count(source, before) === 0));
    if (fullyPatched) {
      targets.push({ target, original, output: original, mode: stat.mode & 0o7777, changed: false });
      continue;
    }
    for (const [, before, after, insertion] of edits) {
      const found = count(source, before);
      if ((insertion && found !== 0) || (!insertion && found !== 1)) throw new Error(`anchor cardinality mismatch: ${rel}: ${JSON.stringify(before.slice(0, 80))} (${found})`);
      source = insertion ? `${source.trimEnd()}\n\n${after}` : source.replace(before, () => after);
    }
    targets.push({ target, original, output: Buffer.from(source), mode: stat.mode & 0o7777, changed: true });
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
  try { const changed = await patch(resolveRoot(process.argv.slice(2))); console.log(changed ? 'pi-subagents bounded-waits patch applied.' : 'pi-subagents bounded-waits patch already applied.'); }
  catch (error) { console.error(`pi-subagents bounded-waits patch refused: ${error instanceof Error ? error.message : 'unknown error'}`); process.exitCode = 1; }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
export { PACKAGE_NAME, PACKAGE_VERSION, WAIT_MS, BASH_DEFAULT_SECONDS, BASH_MAX_SECONDS, WAIT_HELPER_TS, WAIT_HELPER_JS, PATCHES, patch, resolveRoot };
