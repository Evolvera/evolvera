import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const PRIMARY_PROMPT = "# PI Coding Agent";
const REMINDER_TYPE = "todo-reconciliation-reminder";
const REPAIR_TYPE = "todo-reconciliation-repair";
const REPAIR_PROMPT = "Review the entire current todo list with `todo` and reconcile it against this request's work. Update delivered items only when supported by evidence; merge only true duplicates. Keep blocked and pending items honest. Do not infer or fabricate completion. Do not do implementation, start agents, or deploy.";

type Task = { id: number; status: string };
type TodoDetails = { action?: string; tasks?: unknown[]; nextId?: number; error?: unknown };
type SessionEntry = { type?: string; id?: string; message?: { role?: string; toolName?: string; details?: unknown } };

function details(value: unknown): value is TodoDetails {
  return !!value && typeof value === "object" && Array.isArray((value as TodoDetails).tasks)
    && typeof (value as TodoDetails).nextId === "number";
}

function branchSnapshot(ctx: { sessionManager: { getBranch(): Iterable<unknown> } }) {
  let latest: TodoDetails | undefined;
  let entries: SessionEntry[] = [];
  for (const value of ctx.sessionManager.getBranch()) {
    const entry = value as SessionEntry;
    entries.push(entry);
    const message = entry.message;
    if (entry.type === "message" && message?.role === "toolResult" && message.toolName === "todo" && details(message.details)) {
      latest = message.details;
    }
  }
  return { latest, entries };
}

function successfulTodo(event: { toolName?: string; isError?: boolean; details?: unknown; input?: Record<string, unknown> }) {
  if (event.toolName !== "todo" || event.isError || !details(event.details) || event.details.error !== undefined) return false;
  const action = event.details.action ?? event.input?.action;
  return action === "list" || action === "create" || action === "update" || action === "delete" || action === "clear";
}

function openTasks(snapshot: ReturnType<typeof branchSnapshot>): Task[] {
  return (snapshot.latest?.tasks ?? []).filter((value): value is Task => {
    if (!value || typeof value !== "object") return false;
    const task = value as Partial<Task>;
    return Number.isSafeInteger(task.id) && (task.status === "pending" || task.status === "in_progress");
  });
}

export function registerTodoReconciliation(pi: ExtensionAPI) {
  let primary = false;
  let workSinceReview = false;
  let requestNeedsReview = false;
  let correctiveRoundUsed = false;
  let sessionId: string | undefined;
  const ownedSubagents = new Map<string, string>();
  const seenSubagentIds = new Set<string>();
  const ambiguousSubagentIds = new Set<string>();

  const reset = () => {
    workSinceReview = false;
    requestNeedsReview = false;
    correctiveRoundUsed = false;
    primary = false;
    sessionId = undefined;
    ownedSubagents.clear();
    seenSubagentIds.clear();
    ambiguousSubagentIds.clear();
  };

  pi.on("before_agent_start", async (event, ctx) => {
    if (ctx.sessionManager.getSessionId() !== sessionId) {
      reset();
      sessionId = ctx.sessionManager.getSessionId();
      requestNeedsReview = Boolean(event.prompt);
    }
    primary = typeof event.systemPromptOptions.customPrompt === "string"
      && event.systemPromptOptions.customPrompt.trimStart().startsWith(PRIMARY_PROMPT);
  });

  pi.on("input", async (event) => {
    if (event.source !== "extension" && event.text) {
      workSinceReview = false;
      requestNeedsReview = true;
      correctiveRoundUsed = false;
    }
  });

  pi.on("tool_result", async (event) => {
    if (event.toolName === "todo") {
      if (successfulTodo(event)) {
        workSinceReview = false;
        requestNeedsReview = false;
      }
    } else {
      workSinceReview = true;
    }
  });

  pi.on("context", async (event, ctx) => {
    const withoutOldReminder = event.messages.filter((message) => !(message.role === "custom" && message.customType === REMINDER_TYPE));
    if (!primary || ctx.mode !== "tui" || !pi.getActiveTools().includes("todo")) {
      return withoutOldReminder.length === event.messages.length ? undefined : { messages: withoutOldReminder };
    }
    const snapshot = branchSnapshot(ctx);
    const open = openTasks(snapshot);
    if (!open.length || (!requestNeedsReview && !workSinceReview)) {
      return withoutOldReminder.length === event.messages.length ? undefined : { messages: withoutOldReminder };
    }
    const pendingIds = open.map((task) => task.id).filter(Number.isSafeInteger).slice(0, 12);
    const boundedIds = pendingIds.length ? ` Open task IDs: ${pendingIds.join(", ")}.` : "";
    const reminder = `Todo reconciliation: ${open.length} open task(s) remain.${boundedIds} Reconcile the entire list before your final answer; use todo list to inspect it. The reminder omits task text. Update delivered items only with evidence, merge true duplicates only, and leave blocked/pending items honest. A read-only list is sufficient when no change is warranted. Do not infer completion.`;
    return { messages: [...withoutOldReminder, { role: "custom", customType: REMINDER_TYPE, content: [{ type: "text", text: reminder }], display: false, timestamp: Date.now() }] };
  });

  pi.on("agent_settled", async (_event, ctx) => {
    if (!primary || ctx.mode !== "tui" || !pi.getActiveTools().includes("todo") || !ctx.isIdle() || ctx.hasPendingMessages()) return;
    const snapshot = branchSnapshot(ctx);
    const open = openTasks(snapshot);
    if (!open.length || !workSinceReview || correctiveRoundUsed) return;
    const lastAssistant = [...snapshot.entries].reverse().find((entry) => entry.type === "message" && entry.message?.role === "assistant")?.message as { stopReason?: string } | undefined;
    if (!lastAssistant || lastAssistant.stopReason !== "stop") return;
    correctiveRoundUsed = true;
    await pi.sendMessage({
      customType: REPAIR_TYPE,
      content: [{ type: "text", text: REPAIR_PROMPT }],
      display: false,
    }, { triggerTurn: true });
  });

  let stopSubagentEvents: Array<() => void> = [];
  const onStarted = pi.events.on("subagents:started", (raw: unknown) => {
    const event = raw as { id?: unknown };
    if (!primary || typeof sessionId !== "string" || typeof event.id !== "string") return;
    if (seenSubagentIds.has(event.id)) {
      ownedSubagents.delete(event.id);
      ambiguousSubagentIds.add(event.id);
      return;
    }
    seenSubagentIds.add(event.id);
    ownedSubagents.set(event.id, sessionId);
  });
  const onTerminal = (raw: unknown) => {
    const event = raw as { id?: unknown };
    if (typeof event.id !== "string") return;
    const ownerSessionId = ownedSubagents.get(event.id);
    ownedSubagents.delete(event.id);
    if (ambiguousSubagentIds.has(event.id) || !primary || !sessionId || ownerSessionId !== sessionId) return;
    workSinceReview = true;
    requestNeedsReview = true;
  };
  stopSubagentEvents = [onStarted, pi.events.on("subagents:completed", onTerminal), pi.events.on("subagents:failed", onTerminal)];

  pi.on("session_start", async (_event, ctx) => {
    reset();
    sessionId = ctx.sessionManager.getSessionId();
  });
  pi.on("session_tree", async (_event, ctx) => {
    reset();
    sessionId = ctx.sessionManager.getSessionId();
  });
  pi.on("session_shutdown", async () => {
    reset();
    for (const stop of stopSubagentEvents) stop();
    stopSubagentEvents = [];
  });
}

export default function todoReconciliation(pi: ExtensionAPI) {
  registerTodoReconciliation(pi);
}
