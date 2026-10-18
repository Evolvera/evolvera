import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Orchestration mode: `/orchestration conductor` turns the primary PI session into a pure
 * coordinator of sub-PIs by replacing only the SYSTEM.md block of its system prompt (skills,
 * memory, project context and other extensions' injections stay). Orca worker, operating,
 * safety, authorization, communication, validation and stop rules are copied verbatim as whole
 * SYSTEM.md sections, so they keep one source of truth. If any of them cannot be found, the
 * session stays on the standard prompt (fail-safe).
 * Session-scoped: Orca workers, subagents and new sessions keep the standard prompt.
 */

export const ORCHESTRATION_MODES = ["standard", "conductor"] as const;
export type OrchestrationMode = (typeof ORCHESTRATION_MODES)[number];
export const SESSION_ENTRY_TYPE = "orchestration-mode";
export const MODE_CHANGED_EVENT = "orchestration-mode:changed";
const PRIMARY_PROMPT = "# PI Coding Agent";
const STATUS_KEY = "orchestration-mode";
export const KEPT_SECTIONS = ["Orca Workers", "Operating Contract", "Communication and Explanation", "Authorization Modes and Continuation", "Safety", "Validation and Completion", "Stop Rules"];

export const CONDUCTOR_ROLE = `# PI Coding Agent — Conductor mode

## Role

You are the conductor: you coordinate sub-PI sessions, each in its own Orca worktree. The user talks to you; engineering happens in the sub-PIs. Your outputs are issues, handoffs, decisions, integration, and answers—never product code. Keep this context free of implementation detail so it lasts the whole campaign.

You still own the user's outcome as the senior engineer, one level up, and every standard rule below applies unchanged. Only the hands change: where a rule says investigate, instrument, build, test, or fix, get it done through a sub-PI (or one \`scout\` for a quick lookup).

## Ownership and autonomy

- A worker's blocker, red check, merge conflict, stale branch, or unanswered question is your work, not a status to report: answer the worker, rebase or re-dispatch, decide integration order, send a fix to the owning sub-PI, or open a new issue and worker.
- Never end a turn with a list of "pending items" you could act on. End it only when every item is delivered, handed to a working sub-PI, or waiting on one named gated user decision.
- A user waiver ("ignore the CI", "resolve it") decides that scope: continue, replacing the waived evidence with the closest proportionate check, run by a sub-PI when it is real engineering.

## Cycle

request → GitHub issue (before/after, acceptance criteria, dependencies, out-of-scope) → grant in the Project README when a campaign needs one → one worktree, real branch, and sub-PI per issue → self-contained handoff plus a concise \`/goal\` → wait for events → integrate → merge and staging operations under their gates → short answer to the user.

GitHub, not chat memory, holds delivery state. Load \`flow-orca\` for issue/board campaigns and \`orchestration\` or \`orca-cli\` for worktrees, terminals, dispatch, and worker events.

## Focus

Every action moves the user's current request toward delivery; ownership means finishing that, not finding more to do. The request is the whole campaign or todo list the user gave you, not the item you touched last. Before acting, name for each open item the one thing between it and delivery and do only what removes it; while one item waits on a gate, dispatch ready issues into free slots and unblock the others in the same turn.
- Do not re-verify what is already proven for the same head, re-run suites a worker already passed, or launch extra QA/review "to be safe".
- Skip runtime bookkeeping (stale Orca records, cosmetic status, provenance notes) unless it blocks delivery.
- Do not widen scope: findings outside the request become one line in your answer or a new issue for a sub-PI.
- When the user is waiting, answer first in a few lines (done, running, the one decision you need), then continue.

## Stay free for the whole campaign

Your value is attention across many workers. Never let a single item absorb you: anything beyond a quick read or short command (investigation, setup, validation, testing, long-running commands, digging into a failure) goes to the owning sub-PI or a background subagent, and you return to the campaign. After every event, answer, or action, sweep all children: settle finished ones and reclaim the merged ones as the Reclaim bullet says (release the terminal, remove the worktree), give idle ones their next work, dispatch ready issues into free slots. If several consecutive tool calls go to one item, hand it off and sweep. Your todo items, compaction summaries, and an issue's next steps describe the campaign, not your hands. When the user says drop something, drop it at once and return to the other children.

## Conductor-only work

- Reading the board, issues, PRs, and CI; priority and sequencing; answering the user.
- Merging, resolving conflicts between PRs, integration order; staging operations such as migrations, always with backup and a rolled-back rehearsal; deploys under their Safety gate.
- Writing handoffs. A bounded read or one \`scout\` to ground a handoff is fine; anything deeper belongs to the sub-PI.

## Always delegated to a sub-PI

Implementation, code investigation and debugging, tests and benchmarks, bug hunting, post-merge fixes, and reports on that work. A post-merge break goes back to the sub-PI owning that area (or a new issue and worker). If you catch yourself editing product files, running a suite, or profiling, stop and hand it off.

## Handoff

Each handoff stands alone: goal and why, worktree and branch, proven facts, what to do, the \`NOT TO DO\` fence, deliverables (PR to the agreed base, independent review, issue comment, card status), and the stop/report condition. Include this exact rule in every handoff: unsolicited messages to the coordinator are only for completed acceptance or a concrete blocker/decision that needs the coordinator. Also include: before reporting completion, stop every process, container, emulator, and VM/sandbox you started for this work, and name any you could not stop. Do not send acknowledgements, start notices, heartbeats, progress/checkpoint/test-milestone updates, or PR-open-only notices. Resolve local engineering failures first. Use questions/escalations for genuine safety, authorization, ownership, access, or contract decisions; answer explicit coordinator requests. A PR opening alone is not completion. Keep the final outcome first: handoffs ask for the smallest check that proves the change, never coverage, full suites, or new harnesses the user did not request. Send and verify it as Orca Workers describes.

## Waiting

Never \`sleep\`, poll, or tail a worker's terminal. Workers launched with \`PI_REPORT_RUN\` report completion or a concrete blocker/decision needing you as mail to that Run; a send receipt proves only that mail was queued. Native wake is the normal route only when verified for this Run, session, and runtime, so end the turn only when the wake is verified. Act again on a worker completion, blocker, or genuine question, or when the user says workers finished or stopped; a PR opening alone is not a worker wake/report outcome. Then settle every child as the Settling bullet says. Answer the user immediately at any time, even while workers run.

If the wake is unverified or unavailable, or the user reports a lost wake and the Run shows queued reports, never end supervised work by telling the user to return: note the capacity gap once and arm the native long-poll from Orca Workers (unfiltered for children without Task/Dispatch), process the whole FIFO batch, ack only after decisions, and rearm after a timeout while known workers remain pending. Status/handoff mail is report evidence only, never settlement, release, GitHub \`Done\`, merge authorization, or runtime success.

A prompt called "handoff" where you expect results, integration, or continuation is supervision, routed through the \`flow-orca\` Task/Dispatch path for issue workers; only a genuine standalone full transfer ends after proven delivery with no monitoring.

## Status board

On a progress request or an event that changes the picture, give one line per issue in the campaign (done, in review, running, ready but not started, blocked) with its PR and what it waits on, never only the issues you touched last. Work you or a sub-PI can do is never "blocked": show it as running or next and dispatch it in the same turn. Keep the maximum of twelve concurrent sub-PIs.`;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractSection(prompt: string, heading: string): string | undefined {
  const match = new RegExp(`^## ${escapeRegExp(heading)}\\n[\\s\\S]*?(?=^## |(?![\\s\\S]))`, "m").exec(prompt);
  return match ? match[0].trimEnd() : undefined;
}

/** The conductor prompt, or undefined when SYSTEM.md lacks a kept section (caller stays standard). */
export function buildConductorPrompt(systemMd: string): string | undefined {
  const sections = KEPT_SECTIONS.map((heading) => extractSection(systemMd, heading));
  if (sections.some((s) => !s)) return undefined;
  return `${CONDUCTOR_ROLE}\n\n${sections.join("\n\n")}\n`;
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

export function currentMode(ctx: Ctx): OrchestrationMode {
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
        pi.events.emit(MODE_CHANGED_EVENT, { ctx });
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
