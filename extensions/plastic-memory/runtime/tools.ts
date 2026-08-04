import { scrubSensitiveText } from "../common/safety.ts";

export type MemoryToolContext = unknown;
export type ToolTextResult = { content: Array<{ type: "text"; text: string }>; details?: unknown; isError?: boolean };
export type MemoryToolOperations = Readonly<{
  recall: (id: string, ctx: MemoryToolContext) => unknown | Promise<unknown>;
  search: (filters: Record<string, unknown>, ctx: MemoryToolContext) => unknown | Promise<unknown>;
}>;

const ID_PATTERN = /^(?:[a-f0-9]{12}|pm:(?:o|r|q|p|c):[a-f0-9]{24,32}(?::[a-f0-9]{24})?)$/;
const FILTER_KEYS = new Set(["text", "tag", "tags", "category", "status", "confidence", "limit"]);
const FILTER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    text: { type: "string", maxLength: 500 },
    tag: { type: "string", maxLength: 80 },
    tags: { type: "array", maxItems: 20, items: { type: "string", maxLength: 80 } },
    category: { type: "string" },
    status: { type: "string" },
    confidence: { type: "string" },
    limit: { type: "integer", minimum: 1, maximum: 100 },
  },
} as const;

function text(value: unknown): string {
  if (typeof value === "string") return value;
  try { return JSON.stringify(value); } catch { return "[unserializable result]"; }
}
function result(value: unknown, isError = false): ToolTextResult {
  const rendered = text(value);
  return { content: [{ type: "text", text: rendered }], details: value, ...(isError ? { isError: true } : {}) };
}
function failure(message: string): ToolTextResult {
  return result({ status: "error", state: "error", reason: scrubSensitiveText(message).slice(0, 500) }, true);
}
function validateFilters(value: unknown): Record<string, unknown> {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("search filters must be an object");
  const filters = value as Record<string, unknown>;
  for (const key of Object.keys(filters)) if (!FILTER_KEYS.has(key)) throw new Error(`unsupported search filter: ${key}`);
  return filters;
}

export function createMemoryTools(operations: MemoryToolOperations): readonly Record<string, unknown>[] {
  const recallTool = {
    name: "memory_recall",
    label: "Memory recall",
    description: "Recall exact current-branch session or current-project memory by a specific raw or namespaced id. Results retain collision, tombstone, partial, and unavailable evidence honestly.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["id"],
      properties: { id: { type: "string", description: "12 lowercase hex session id or namespaced pm:o:, pm:r:, pm:q:, pm:p:, or pm:c: id" } },
    },
    async execute(_toolCallId: string, params: { id?: unknown }, _signal: unknown, _onUpdate: unknown, ctx: MemoryToolContext): Promise<ToolTextResult> {
      if (typeof params?.id !== "string" || !ID_PATTERN.test(params.id)) return failure("MALFORMED_ID: expected a lowercase 12-hex or namespaced memory id");
      try { return result(await operations.recall(params.id, ctx)); } catch (error) { return failure(error instanceof Error ? error.message : String(error)); }
    },
  };
  const searchTool = {
    name: "memory_search",
    label: "Memory search",
    description: "Run bounded deterministic lexical search over eligible current-branch session records and the injected current project; this is not transcript browsing.",
    parameters: FILTER_SCHEMA,
    async execute(_toolCallId: string, params: Record<string, unknown> | undefined, _signal: unknown, _onUpdate: unknown, ctx: MemoryToolContext): Promise<ToolTextResult> {
      try { return result(await operations.search(validateFilters(params), ctx)); } catch (error) { return failure(error instanceof Error ? error.message : String(error)); }
    },
  };
  return [recallTool, searchTool];
}

/** Injectable registration surface; root/index registration is deliberately out of scope. */
export function registerMemoryTools(pi: { registerTool: (definition: Record<string, unknown>) => void }, operations: MemoryToolOperations): string[] {
  const tools = createMemoryTools(operations);
  for (const tool of tools) pi.registerTool(tool);
  return tools.map((tool) => String(tool.name));
}
export const makeMemoryTools = createMemoryTools;
