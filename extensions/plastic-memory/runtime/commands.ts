import { scrubSensitiveText } from "../common/safety.ts";

export type MemoryCommandContext = { ui?: { notify?: (message: string, level?: string) => void } } & Record<string, unknown>;
export type MemoryCommandOperations = Readonly<{
  status: (ctx: MemoryCommandContext) => unknown | Promise<unknown>;
  plasticStatus?: (ctx: MemoryCommandContext) => unknown | Promise<unknown>;
  view: (args: { mode?: string }, ctx: MemoryCommandContext) => unknown | Promise<unknown>;
  propose: (args: Record<string, unknown>, ctx: MemoryCommandContext) => unknown | Promise<unknown>;
  accept: (args: Record<string, unknown>, ctx: MemoryCommandContext) => unknown | Promise<unknown>;
  reject: (args: Record<string, unknown>, ctx: MemoryCommandContext) => unknown | Promise<unknown>;
  migrate: (args: Record<string, unknown>, ctx: MemoryCommandContext) => unknown | Promise<unknown>;
  backfill: (args: Record<string, unknown>, ctx: MemoryCommandContext) => unknown | Promise<unknown>;
  retry: (args: Record<string, unknown>, ctx: MemoryCommandContext) => unknown | Promise<unknown>;
}>;

const MAX_ARGS = 4_000;
const FORBIDDEN_RESOURCE_KEYS = new Set(["root", "projectRoot", "session", "sessionFile", "sessionId", "cwd", "path"]);
function rendered(value: unknown): string {
  if (typeof value === "string") return value;
  try { return JSON.stringify(value); } catch { return "[unserializable result]"; }
}
function parseObject(raw: string, label: string): Record<string, unknown> {
  if (!raw.trim()) return {};
  if (raw.length > MAX_ARGS) throw new Error(`${label} arguments exceed the safety bound`);
  if (!raw.trimStart().startsWith("{")) return { command: raw.trim() };
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`${label} arguments must be a JSON object`);
  const object = parsed as Record<string, unknown>;
  for (const key of Object.keys(object)) if (FORBIDDEN_RESOURCE_KEYS.has(key)) throw new Error(`${label} cannot select a session or project resource`);
  return object;
}
function parseBackfill(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  if (!trimmed) return { action: "report" };
  const [command, ...rest] = trimmed.split(/\s+/u);
  if (rest.length === 0) return { action: command };
  const tail = rest.join(" ");
  const parsed = parseObject(tail, "backfill");
  return { ...parsed, action: command };
}
function parseProposalDecision(raw: string, label: string, allowJson: boolean): Record<string, unknown> {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  if (trimmed.startsWith("{")) {
    if (!allowJson) throw new Error(`${label} accepts only an optional proposal ID`);
    const parsed = parseObject(trimmed, label);
    Object.defineProperty(parsed, "__manualJson", { value: true, enumerable: false });
    return parsed;
  }
  const parts = trimmed.split(/\s+/u);
  if (parts.length !== 1) throw new Error(`Usage: /memory:${label} [proposal-id]`);
  return { proposalId: parts[0] };
}
function notify(ctx: MemoryCommandContext, value: unknown): unknown {
  ctx.ui?.notify?.(rendered(value), "info");
  return value;
}
function errorResult(error: unknown): Record<string, string> {
  return { status: "error", state: "error", reason: scrubSensitiveText(error instanceof Error ? error.message : String(error)).slice(0, 500) };
}
function command(handler: (args: string, ctx: MemoryCommandContext) => Promise<unknown> | unknown) {
  return { handler: async (args: string | undefined, ctx: MemoryCommandContext) => { try { return notify(ctx, await handler(args ?? "", ctx)); } catch (error) { return notify(ctx, errorResult(error)); } } };
}

export function createMemoryCommands(operations: MemoryCommandOperations): Readonly<Record<string, Record<string, unknown>>> {
  const status = command((_args, ctx) => operations.status(ctx));
  const plasticStatus = operations.plasticStatus === undefined ? undefined : command((_args, ctx) => operations.plasticStatus!(ctx));
  const view = command((args, ctx) => {
    const mode = args.trim();
    if (mode && mode !== "full" && mode !== "visible") throw new Error("Usage: /memory:view [full|visible]");
    return operations.view(mode ? { mode } : {}, ctx);
  });
  return {
    "memory:status": status,
    "memory:view": view,
    "memory:propose": command((args, ctx) => operations.propose(parseObject(args, "proposal"), ctx)),
    "memory:accept": command((args, ctx) => operations.accept(parseProposalDecision(args, "acceptance", true), ctx)),
    "memory:reject": command((args, ctx) => operations.reject(parseProposalDecision(args, "rejection", false), ctx)),
    "memory:migrate": command((args, ctx) => operations.migrate(parseObject(args, "migration"), ctx)),
    "memory:backfill": command((args, ctx) => operations.backfill(parseBackfill(args), ctx)),
    "memory:retry": command((args, ctx) => operations.retry(parseObject(args, "retry"), ctx)),
    // OM aliases intentionally share only the injected active-runtime operations.
    "om:status": status,
    "om:view": view,
    ...(plasticStatus ? { "plastic:status": plasticStatus } : {}),
  };
}

/** Injectable registration surface; this module does not activate itself from a root extension. */
export function registerMemoryCommands(pi: { registerCommand: (name: string, options: Record<string, unknown>) => void }, operations: MemoryCommandOperations): string[] {
  const commands = createMemoryCommands(operations);
  for (const [name, options] of Object.entries(commands)) pi.registerCommand(name, options);
  return Object.keys(commands);
}
export const makeMemoryCommands = createMemoryCommands;
