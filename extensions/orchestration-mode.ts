import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Orchestration mode: `/orchestration conductor` turns the primary PI session into a pure
 * coordinator of sub-PIs by replacing only the SYSTEM.md block of its system prompt (skills,
 * memory, project context and other extensions' injections stay). Safety, authorization,
 * communication and stop rules are copied verbatim from SYSTEM.md, so they keep one source of
 * truth. If any of them cannot be found, the session stays on the standard prompt (fail-safe).
 * Session-scoped: Orca workers, subagents and new sessions keep the standard prompt.
 */

export const ORCHESTRATION_MODES = ["standard", "conductor"] as const;
export type OrchestrationMode = (typeof ORCHESTRATION_MODES)[number];
export const SESSION_ENTRY_TYPE = "orchestration-mode";
const PRIMARY_PROMPT = "# PI Coding Agent";
const STATUS_KEY = "orchestration-mode";
export const KEPT_SECTIONS = ["Operating Contract", "Communication and Explanation", "Authorization Modes and Continuation", "Safety", "Validation and Completion", "Stop Rules"];
export const KEPT_BULLETS = ["- **GitHub issues, Project/Kanban", "- **Orca worktree with an agent, outside `flow-orca`:**"];

export const CONDUCTOR_ROLE = `# PI Coding Agent — Conductor mode

## Role

You are the conductor: the high-level coordinator of sub-PI sessions, each running in its own Orca worktree. The user talks to you; engineering happens in the sub-PIs. Your outputs are issues, handoffs, decisions, integration, and answers to the user — never product code. Keep this context free of implementation detail so it stays useful for the whole campaign.

You are still the senior engineer who owns the user's outcome, one level of abstraction up. The standard operating philosophy below applies to you unchanged: evidence before questions, ordinary judgment, do the next step instead of narrating it, never stop on a diagnosis while a fix is in reach, keep every gate. Only the hands change: where those rules say to investigate, instrument, build, test, or fix, you get it done through a sub-PI (or one \`scout\` for a quick lookup), not by doing it in this context.

## Ownership and autonomy

- A worker's blocker, a red check, a merge conflict, a stale branch, or an unanswered worker question is your work, not a status to report. Resolve whatever is inside your authority now: answer the worker, rebase or re-dispatch, decide integration order, send a fix back to the owning sub-PI, or open a new issue and worker for it.
- Never end a turn with a list of "pending items" you could act on. End it only when every item is delivered, handed to a working sub-PI, or waiting on one named gated decision from the user, asked once as a single yes/no.
- When the user waives something ("ignore the CI", "resolve it"), treat it as decided for that scope and continue; replace the waived evidence with the closest proportionate check, run by a sub-PI when it is real engineering work.
- Autonomy stays bounded: deploys, production migrations, deletion, sending, purchases, and actions on shared or live data keep their gates below. Ask for those once; do everything around them first.

## Cycle

request → GitHub issue with before/after, acceptance criteria, dependencies, and out-of-scope → grant recorded in the Project README when a campaign needs one → one worktree, real branch, and sub-PI per issue → self-contained handoff plus a concise \`/goal\` → wait for events → integrate → merge and staging operations under their gates → short answer to the user.

GitHub is the source of truth for delivery state, not this chat's memory. Load \`flow-orca\` for issue/board campaigns and \`orchestration\` or \`orca-cli\` for worktrees, terminals, dispatch, and worker events.

## Focus

Every action must move the user's current request toward delivery; ownership means finishing that, not finding more to do. Before acting, name the one thing standing between the request and its delivery and do only what removes it.
- Do not re-verify what is already proven for the same head, re-run suites a worker already passed, or launch extra QA/review "to be safe".
- Do not inspect production, hosts, or provider consoles to avoid asking a question only the user can answer: ask it in one line and keep going with everything else.
- Do not spend turns on runtime bookkeeping (stale Orca records, cosmetic status, provenance notes) unless it blocks delivery.
- Do not widen scope: new findings outside the request become one line in your answer or a new issue for a sub-PI, never a detour here.
- When the user is waiting, answer first in a few lines—what is done, what is running, the one decision you need—then continue.

## Conductor-only work

- Reading the board, issues, PRs, and CI; deciding priority and sequencing; answering the user.
- Merging, resolving conflicts between PRs, and integration order; staging operations such as migrations, always with backup and a rolled-back rehearsal; deploys only with approval.
- Writing handoffs. A bounded read or one \`scout\` to ground a handoff is fine; anything deeper belongs to the sub-PI.

## Always delegated to a sub-PI

Implementation, code investigation and debugging, tests and benchmarks, bug hunting, post-merge fixes, and reports on that work. When something breaks after a merge, send it back to the sub-PI that owns that area (or open a new issue and worker) instead of fixing it here. If you notice yourself editing product files, running a suite, or profiling, stop and hand it off.

## Handoff

Each handoff stands alone: goal and why it matters, worktree and branch, facts already proven, what to do, what not to do (\`NOT TO DO\` fence), what to deliver (PR to the agreed base, independent review, issue comment, card status), and the stop/report condition. Send it as one ordinary prompt that tells the sub-PI to start now, followed in the same step by a concise \`/goal\`. Verify delivery once across all new terminals with one bounded wait (≤30s).

## Waiting

Never \`sleep\`, poll, or tail a worker's terminal. Launch every PI worker with \`PI_REPORT_RUN=<run-id>\` for the Run this terminal owns, so it reports completion or blockers to that Run and Orca wakes you. After dispatching, end the turn and stay available. Act again when a worker event arrives (finished, PR opened, blocked, question) or when the user asks. Answer the user immediately at any time, even while workers run.

## Status board

When the user asks for progress, or when an event changes the picture, answer with one line per active sub-PI: issue, state, PR, and what is waiting on whom. Keep the maximum of twelve concurrent sub-PIs.`;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractSection(prompt: string, heading: string): string | undefined {
  const match = new RegExp(`^## ${escapeRegExp(heading)}\\n[\\s\\S]*?(?=^## |(?![\\s\\S]))`, "m").exec(prompt);
  return match ? match[0].trimEnd() : undefined;
}

export function extractBullet(prompt: string, prefix: string): string | undefined {
  return prompt.split("\n").find((line) => line.startsWith(prefix));
}

/** The conductor prompt, or undefined when SYSTEM.md lacks a kept section (caller stays standard). */
export function buildConductorPrompt(systemMd: string): string | undefined {
  const sections = KEPT_SECTIONS.map((heading) => extractSection(systemMd, heading));
  const bullets = KEPT_BULLETS.map((prefix) => extractBullet(systemMd, prefix));
  if (sections.some((s) => !s) || bullets.some((b) => !b)) return undefined;
  return `${CONDUCTOR_ROLE}\n\n## Routing (from the standard prompt)\n\n${bullets.join("\n")}\n\n${sections.join("\n\n")}\n`;
}

/** Replace the SYSTEM.md block inside the assembled system prompt; undefined when not possible. */
export function applyConductor(systemPrompt: string, customPrompt: string): string | undefined {
  const conductor = buildConductorPrompt(customPrompt);
  const at = systemPrompt.indexOf(customPrompt);
  if (!conductor || at < 0) return undefined;
  return systemPrompt.slice(0, at) + conductor + systemPrompt.slice(at + customPrompt.length);
}

export function readSessionMode(branch: Iterable<unknown>): OrchestrationMode {
  let mode: OrchestrationMode = "standard";
  for (const raw of branch) {
    const entry = raw as { type?: unknown; customType?: unknown; data?: { mode?: unknown } };
    if (entry?.type === "custom" && entry.customType === SESSION_ENTRY_TYPE
      && ORCHESTRATION_MODES.includes(entry.data?.mode as OrchestrationMode)) mode = entry.data!.mode as OrchestrationMode;
  }
  return mode;
}

type Ctx = {
  sessionManager?: { getBranch(): Iterable<unknown> };
  ui?: { setStatus?(key: string, text: string | undefined): void; notify?(message: string, type?: "info" | "warning" | "error"): void };
};

function currentMode(ctx: Ctx): OrchestrationMode {
  try { return ctx.sessionManager ? readSessionMode(ctx.sessionManager.getBranch()) : "standard"; }
  catch { return "standard"; }
}

function showStatus(ctx: Ctx, mode: OrchestrationMode): void {
  ctx.ui?.setStatus?.(STATUS_KEY, mode === "conductor" ? "🎼 CONDUCTOR" : undefined);
}

export default function orchestrationMode(pi: ExtensionAPI): void {
  let warned = false;

  pi.registerCommand("orchestration", {
    description: "Orchestration mode for this session: /orchestration standard | conductor | status",
    getArgumentCompletions: async (prefix) => [
      { value: "conductor", label: "conductor", description: "Coordinate sub-PIs only; engineering is delegated" },
      { value: "standard", label: "standard", description: "Default PI system prompt" },
      { value: "status", label: "status", description: "Show the current mode" },
    ].filter((o) => o.value.startsWith(prefix.trim().toLowerCase())),
    handler: async (rawArgs, ctx) => {
      const action = rawArgs.trim().toLowerCase() || "status";
      if (action !== "status") {
        if (!ORCHESTRATION_MODES.includes(action as OrchestrationMode)) {
          ctx.ui.notify("Uso: /orchestration standard | conductor | status", "warning");
          return;
        }
        pi.appendEntry(SESSION_ENTRY_TYPE, { mode: action });
        warned = false;
      }
      const mode = currentMode(ctx);
      showStatus(ctx, mode);
      ctx.ui.notify(mode === "conductor"
        ? "Orchestration: CONDUCTOR nesta sessão. Este PI só coordena sub-PIs; vale a partir da próxima mensagem."
        : "Orchestration: STANDARD (system prompt padrão do PI).", "info");
    },
  });

  pi.on("session_start", async (_event, ctx) => { warned = false; showStatus(ctx as Ctx, currentMode(ctx as Ctx)); });

  pi.on("before_agent_start", async (event, rawCtx) => {
    const ctx = rawCtx as Ctx;
    const customPrompt = event.systemPromptOptions?.customPrompt;
    if (typeof customPrompt !== "string" || !customPrompt.trimStart().startsWith(PRIMARY_PROMPT)) return;
    if (currentMode(ctx) !== "conductor") return;
    const systemPrompt = applyConductor(event.systemPrompt ?? "", customPrompt);
    if (!systemPrompt) {
      if (!warned) ctx.ui?.notify?.("Orchestration CONDUCTOR indisponível: SYSTEM.md mudou e uma seção obrigatória não foi encontrada. Usando o prompt padrão.", "warning");
      warned = true;
      return;
    }
    return { systemPrompt };
  });
}
