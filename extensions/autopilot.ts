import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Autopilot: keeps the primary session working while its own todo list still has open items.
 *
 * Observed failure: without an active /goal, a run that settles halfway (an error, a long tool chain, a
 * "next steps" summary) just stops, and the user has to type "continua". The todo list is the session's
 * own record of what the user asked for, so it is a deterministic signal: when a run settles normally with
 * open items, no active goal (pi-goal continues those itself), no declared block, and no question to the
 * user, Autopilot sends one follow-up naming the open items. At most MAX_NUDGES per user request, and
 * none after the user aborts. Real gates stay with the user: a reply that ends in a question is left alone.
 * Disable with PI_AUTOPILOT=off.
 */

export const MAX_NUDGES = 3;
const PRIMARY_PROMPT = "# PI Coding Agent";
const DONE = new Set(["completed", "done", "deleted", "cancelled", "canceled"]);

type Entry = { type?: string; customType?: string; data?: unknown; message?: { role?: string; toolName?: string; isError?: boolean; details?: unknown; content?: unknown } };
type Task = { id?: number; subject?: string; status?: string };

export function openTodos(entries: Iterable<unknown>): Task[] {
  let tasks: Task[] | undefined;
  for (const value of entries) {
    const message = (value as Entry).message;
    if ((value as Entry).type !== "message" || message?.role !== "toolResult" || message.toolName !== "todo" || message.isError) continue;
    const details = message.details as { tasks?: unknown } | undefined;
    if (Array.isArray(details?.tasks)) tasks = details.tasks as Task[];
  }
  return (tasks ?? []).filter((task) => !DONE.has(String(task.status ?? "").toLowerCase()));
}

export function goalActive(entries: Iterable<unknown>): boolean {
  let status: unknown;
  for (const value of entries) {
    const entry = value as Entry;
    if (entry.type === "custom" && entry.customType === "goal-state") status = (entry.data as { goal?: { status?: unknown } | null })?.goal?.status;
  }
  return status === "active";
}

/** The last assistant message: its text, and the tools it called. */
export function lastReply(entries: Iterable<unknown>): { text: string; tools: string[] } {
  let last: { text: string; tools: string[] } = { text: "", tools: [] };
  for (const value of entries) {
    const message = (value as Entry).message;
    if ((value as Entry).type !== "message" || message?.role !== "assistant" || !Array.isArray(message.content)) continue;
    const parts = message.content as Array<{ type?: string; text?: string; name?: string }>;
    last = { text: parts.filter((p) => p.type === "text").map((p) => p.text ?? "").join("\n"), tools: parts.filter((p) => p.type === "toolCall").map((p) => p.name ?? "") };
  }
  return last;
}

export function endsWithQuestion(text: string): boolean {
  return /\?\s*\**\s*$/.test(text.trim());
}

export function nudgeText(open: Task[], attempt: number): string {
  const items = open.map((t) => `- ${t.subject ?? `item ${t.id}`} (${t.status ?? "pending"})`).join("\n");
  return `[Autopilot ${attempt}/${MAX_NUDGES}] A resposta terminou com itens abertos na sua lista de tarefas:\n${items}\n\nContinue até concluir e verificar cada um. Pare só por uma decisão que é do usuário (ação destrutiva, produção, credencial, preferência sem leitura dominante) ou por bloqueio real; nesse caso diga exatamente o que falta e por quê. Se um item não faz mais sentido, atualize a lista dizendo o motivo.`;
}

export default function autopilot(pi: ExtensionAPI, env: Record<string, string | undefined> = process.env): void {
  if ((env.PI_AUTOPILOT ?? "").toLowerCase() === "off") return;
  let primary = false;
  let nudges = 0;

  pi.on("before_agent_start", async (event) => {
    const custom = event.systemPromptOptions?.customPrompt;
    primary = typeof custom === "string" && custom.trimStart().startsWith(PRIMARY_PROMPT);
  });
  pi.on("input", async (event) => {
    if (event.source !== "extension") nudges = 0; // a new user request gets a fresh budget
  });

  pi.on("agent_settled", async (event, ctx) => {
    if (!primary) return;
    if (event.aborted) { nudges = MAX_NUDGES; return; } // the user stopped it: respect that until they write again
    const entries = [...ctx.sessionManager.getBranch()];
    if (goalActive(entries)) return;
    const open = openTodos(entries);
    if (!open.length || nudges >= MAX_NUDGES) return;
    const reply = lastReply(entries);
    if (reply.tools.includes("goal_blocked") || endsWithQuestion(reply.text)) return;
    nudges += 1;
    pi.sendMessage({ customType: "autopilot", content: nudgeText(open, nudges), display: true, details: { open: open.map((t) => t.id) } },
      { deliverAs: "followUp", triggerTurn: true });
  });
}
