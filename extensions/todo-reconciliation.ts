import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// The duplicate-read guard applies to the main session only; no advisory text is injected anywhere.
const ELIGIBLE_PROMPTS = ["# PI Coding Agent"];
const REMINDER_TYPE = "todo-reconciliation-reminder";
const LEGACY_TYPES = new Set([REMINDER_TYPE, "todo-reconciliation-repair"]);
// The exact sentence older versions injected; copies can survive inside quoted messages and summaries.
const LEGACY_SENTENCE = /Todo reconciliation is optional\.[\s\S]{0,400}?Do not infer task completion\.\s*/g;

type TodoDetails = { action?: string; params?: Record<string, unknown>; tasks?: unknown[]; nextId?: number; error?: unknown };
type SessionEntry = { type?: string; id?: string; message?: { role?: string; toolName?: string; isError?: boolean; details?: unknown } };
type Context = { mode?: string; sessionManager: { getSessionId(): string; getBranch(): Iterable<unknown> } };

function details(value: unknown): value is TodoDetails {
  return !!value && typeof value === "object" && Array.isArray((value as TodoDetails).tasks)
    && typeof (value as TodoDetails).nextId === "number";
}

function branchSnapshot(ctx: Context) {
  let latest: TodoDetails | undefined;
  for (const value of ctx.sessionManager.getBranch()) {
    const entry = value as SessionEntry;
    const message = entry.message;
    if (entry.type === "message" && message?.role === "toolResult" && message.toolName === "todo"
      && successfulTodo({ toolName: message.toolName, isError: message.isError, details: message.details })) latest = message.details as TodoDetails;
  }
  return { latest };
}

function successfulTodo(event: { toolName?: string; isError?: boolean; details?: unknown }): event is { toolName: string; isError?: boolean; details: TodoDetails } {
  if (event.toolName !== "todo" || event.isError || !details(event.details) || event.details.error !== undefined) return false;
  return ["get", "list", "create", "update", "delete", "clear"].includes(String(event.details.action));
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stable(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

function snapshotKey(snapshot: TodoDetails): string { return stable({ tasks: snapshot.tasks, nextId: snapshot.nextId }); }
function openTaskCount(snapshot: TodoDetails | undefined): number {
  return (snapshot?.tasks ?? []).filter((task) => !!task && typeof task === "object"
    && Number.isSafeInteger((task as { id?: unknown }).id)
    && ["pending", "in_progress"].includes(String((task as { status?: unknown }).status))).length;
}

function queryKey(action: string, input: Record<string, unknown>): string {
  const params: Record<string, unknown> = {};
  if (action === "get" && input.id !== undefined) params.id = input.id;
  if (action === "list") {
    if (input.status !== undefined) params.status = input.status;
    if (input.includeDeleted === true) params.includeDeleted = true;
  }
  return stable({ action, params });
}

export function registerTodoReconciliation(pi: ExtensionAPI) {
  let primary = false;
  let sessionId: string | undefined;
  let readSnapshot: string | undefined;
  let readKeys = new Set<string>();
  let requestInitialized = false;

  const resetRequest = () => {
    readSnapshot = undefined;
    readKeys = new Set();
  };
  const syncSnapshot = (snapshot: TodoDetails) => {
    const signature = snapshotKey(snapshot);
    if (signature !== readSnapshot) {
      readSnapshot = signature;
      readKeys.clear();
    }
  };

  pi.on("before_agent_start", async (event, ctx) => {
    const id = ctx.sessionManager.getSessionId();
    const newSession = id !== sessionId;
    if (newSession) sessionId = id;
    const prompt = event.systemPromptOptions.customPrompt;
    const text = typeof prompt === "string" ? prompt.trimStart() : "";
    primary = ELIGIBLE_PROMPTS.some((prefix) => text.startsWith(prefix));
    if (newSession || !requestInitialized) {
      resetRequest();
      requestInitialized = true;
    }
  });

  pi.on("input", async (event) => {
    if (event.source !== "extension" && event.text) {
      resetRequest(true);
      requestInitialized = true;
    }
  });

  pi.on("tool_call", async (event, ctx) => {
    if (!primary || ctx.mode !== "tui" || !pi.getActiveTools().includes("todo") || event.toolName !== "todo") return;
    const action = event.input.action;
    if (action !== "list" && action !== "get") return;
    const branch = branchSnapshot(ctx as Context);
    if (!branch.latest) return;
    syncSnapshot(branch.latest);
    const key = queryKey(action, event.input);
    if (readKeys.has(key)) {
      return { block: true, reason: "This exact todo read is already known for the current task snapshot. Use the existing result and continue the user's original work; do not retry the unchanged read or report bookkeeping as the outcome." };
    }
  });

  pi.on("tool_result", async (event, ctx) => {
    if (!primary || ctx.mode !== "tui" || !pi.getActiveTools().includes("todo")) return;
    if (successfulTodo(event)) {
      syncSnapshot(event.details);
      const action = event.details.action;
      if (action === "list" || action === "get") readKeys.add(queryKey(action, event.details.params ?? {}));
    }
    // Unrelated work never rearms a reminder or read.
  });

  // Legacy advisory text is scrubbed everywhere it can still live: custom messages from older
  // versions, and copies the model quoted into ordinary messages or a compaction summary.
  pi.on("context", async (event) => {
    let changed = false;
    const messages = event.messages.filter((message) => !(message.role === "custom" && LEGACY_TYPES.has(String(message.customType))));
    if (messages.length !== event.messages.length) changed = true;
    const scrubbed = messages.map((message) => {
      if (!Array.isArray(message.content)) return message;
      let touched = false;
      const content = message.content.map((part) => {
        if (!part || part.type !== "text" || typeof part.text !== "string") return part;
        const text = part.text.replace(LEGACY_SENTENCE, "").replace(/\n{3,}/g, "\n\n").trimEnd();
        if (text === part.text) return part;
        touched = true;
        return { ...part, text };
      });
      if (!touched) return message;
      changed = true;
      return { ...message, content };
    });
    return changed ? { messages: scrubbed } : undefined;
  });

  pi.on("session_start", async (_event, ctx) => {
    sessionId = ctx.sessionManager.getSessionId();
    primary = false;
    resetRequest();
    requestInitialized = false;
  });
  pi.on("session_tree", async () => {
    resetRequest();
    requestInitialized = true;
  });
  pi.on("session_shutdown", async () => {
    primary = false;
    sessionId = undefined;
    resetRequest();
    requestInitialized = false;
  });
}

export default function todoReconciliation(pi: ExtensionAPI) {
  registerTodoReconciliation(pi);
}
