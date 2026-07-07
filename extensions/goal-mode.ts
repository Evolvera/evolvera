/**
 * Goal Mode Extension
 *
 * Claude Code-style `/goal` for PI:
 * - `/goal <condition>` sets one session goal and starts work immediately.
 * - After each agent turn, a separate evaluator model judges the transcript.
 * - If the condition is not met, the extension queues a follow-up turn.
 * - If the condition is met, the goal clears automatically.
 *
 * Usage:
 *   /goal <done criteria>
 *   /goal status
 *   /goal continue
 *   /goal clear
 */

import { complete, type UserMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type GoalStatus = "active" | "achieved" | "blocked" | "cleared";

type GoalState = {
  criteria: string;
  status: GoalStatus;
  createdAt: string;
  updatedAt: string;
  evaluations: number;
  continuations: number;
  maxContinuations: number;
  lastReason?: string;
  evaluatorModel?: string;
};

type GoalEvaluation = {
  status: "met" | "not_met" | "blocked";
  reason: string;
};

const STATE_ENTRY_TYPE = "goal-mode-state";
const MAX_TRANSCRIPT_CHARS = 120_000;
const DEFAULT_MAX_CONTINUATIONS = 20;
const EVALUATOR_MODEL_CANDIDATES: Array<[provider: string, model: string]> = [
  ["anthropic", "claude-opus-4-8"],
  ["anthropic", "claude-opus-4.8"],
  ["anthropic", "claude-opus-4.7"],
  ["anthropic", "claude-opus-4.6"],
  ["anthropic", "claude-opus-4.5"],
];

let activeGoal: GoalState | null = null;
let skipNextAgentEndEvaluation = false;
let isEvaluating = false;

const EVALUATOR_SYSTEM_PROMPT = `You are a strict Goal Mode stop-hook evaluator, similar to Claude Code /goal.

You receive:
- a user-defined goal completion condition;
- the conversation transcript so far.

Decide whether the goal condition is satisfied by evidence already present in the transcript.

Important rules:
- You do not call tools or inspect files. Judge only transcript evidence.
- Return JSON only. No markdown, no prose outside JSON.
- Use status "met" only when the transcript demonstrates the goal condition is satisfied.
- Use status "not_met" when autonomous work can still continue.
- Use status "blocked" only when the transcript shows a real blocker requiring user input or an external condition. Do not use blocked for ordinary remaining work.
- If validation/checks are part of the goal, status is met only if the transcript contains the validation result or an explicit acceptable reason it cannot run.

Output schema:
{"status":"met"|"not_met"|"blocked","reason":"short reason, one or two sentences"}`;

function normalizeArgs(args: unknown): string {
  if (typeof args === "string") return args.trim();
  if (args == null) return "";
  return String(args).trim();
}

function nowIso(): string {
  return new Date().toISOString();
}

function summarize(criteria: string): string {
  const oneLine = criteria.replace(/\s+/g, " ").trim();
  return oneLine.length > 80 ? `${oneLine.slice(0, 77)}...` : oneLine;
}

function formatGoalBlock(goal: GoalState): string {
  return `
=== GOAL MODE ACTIVE ===
The user set a session-scoped completion condition. Keep working toward it until /goal clear or until the evaluator confirms it is met.

Goal condition:
${goal.criteria}

Operating rules:
- Treat the goal condition as the primary objective.
- Do not stop at analysis, partial progress, or a plan when implementation/verification is possible.
- Surface evidence in the transcript: changed files, command outputs, validation results, blockers, and remaining criteria.
- If a real blocker requires user input, say BLOCKED clearly and list the smallest user action needed.
- Do not expand scope beyond the goal condition.
=== END GOAL MODE ===
`;
}

function formatInitialPrompt(goal: GoalState): string {
  return `Goal Mode started.

Goal condition:
${goal.criteria}

Work autonomously toward this condition now. Continue using tools until the condition is satisfied or a real blocker requires user input. Surface enough evidence in your response for a separate evaluator to judge the condition.`;
}

function formatContinuationPrompt(goal: GoalState, reason: string): string {
  return `Goal Mode continuation required.

Evaluator reason:
${reason}

Goal condition still active:
${goal.criteria}

Continue autonomously from the current state. Use tools where useful. Do not merely summarize unless the goal is now demonstrably complete or a real blocker requires user input. Surface concrete evidence for the evaluator.`;
}

function coerceVisibleText(value: unknown, depth = 0): string {
  if (value == null || depth > 6) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  if (Array.isArray(value)) {
    return value
      .map((item) => coerceVisibleText(item, depth + 1))
      .filter(Boolean)
      .join("\n");
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const preferredKeys = [
      "text",
      "output_text",
      "content",
      "message",
      "summary_text",
      "summary",
      "thinking",
      "reasoning",
      "reasoning_content",
      "completion",
      "response",
    ];

    const parts: string[] = [];
    for (const key of preferredKeys) {
      if (key in record) {
        const text = coerceVisibleText(record[key], depth + 1);
        if (text) parts.push(text);
      }
    }
    if (parts.length > 0) return parts.join("\n");

    try {
      return JSON.stringify(record);
    } catch {
      return "";
    }
  }

  return "";
}

function goalEvaluationFromParsed(parsed: Partial<GoalEvaluation> & Record<string, unknown>): GoalEvaluation | null {
  if (parsed.status === "met" || parsed.status === "not_met" || parsed.status === "blocked") {
    return {
      status: parsed.status,
      reason: typeof parsed.reason === "string" && parsed.reason.trim() ? parsed.reason.trim() : "No reason provided.",
    };
  }

  const statusText = String(parsed.status ?? parsed.state ?? parsed.goal_status ?? parsed.evaluator_action ?? "").toUpperCase();
  const isBlocked =
    parsed.blocked === true ||
    parsed.user_input_required === true ||
    parsed.real_blocker_requires_user_input === true ||
    statusText.includes("BLOCKED");
  if (isBlocked) {
    return {
      status: "blocked",
      reason: typeof parsed.reason === "string" && parsed.reason.trim()
        ? parsed.reason.trim()
        : "Goal artifact reports a blocker or required user input.",
    };
  }

  const doneStatus = String(parsed.definition_of_done_status ?? "").toUpperCase();
  const complete =
    parsed.goal_complete === true ||
    parsed.goal_condition_complete === true ||
    statusText.includes("COMPLETE_FOR_APPROVED_SCOPE") ||
    statusText.includes("COMPLETE_WITH_RESIDUAL_BLOCKS") ||
    statusText.includes("STOP_GOAL_COMPLETE") ||
    statusText.includes("GOAL_COMPLETE") ||
    doneStatus === "PASS" ||
    doneStatus.startsWith("PASS_");
  if (complete) {
    return {
      status: "met",
      reason: typeof parsed.reason === "string" && parsed.reason.trim()
        ? parsed.reason.trim()
        : "Goal artifact reports completion for the approved scope.",
    };
  }

  if (statusText.includes("ACTIVE") || statusText.includes("CONTINUE") || statusText.includes("NOT_MET")) {
    return {
      status: "not_met",
      reason: typeof parsed.reason === "string" && parsed.reason.trim()
        ? parsed.reason.trim()
        : "Goal artifact reports active or continuing work.",
    };
  }

  return null;
}

function candidateJsonObjects(text: string): string[] {
  const candidates: string[] = [];
  for (let start = text.indexOf("{"); start >= 0; start = text.indexOf("{", start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i += 1) {
      const ch = text[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === "{") depth += 1;
      if (ch === "}") depth -= 1;
      if (depth === 0) {
        candidates.push(text.slice(start, i + 1));
        break;
      }
    }
  }
  return candidates;
}

function extractText(message: unknown): string {
  const typed = message as { role?: string; content?: unknown; summary?: unknown; stopReason?: string; errorMessage?: string };
  if (typeof typed.summary === "string") return typed.summary;

  const text = coerceVisibleText(typed.content).trim();
  if (text) return text;

  return typed.errorMessage ? `ERROR: ${typed.errorMessage}` : "";
}

function serializeMessages(messages: unknown[], maxChars = MAX_TRANSCRIPT_CHARS): string {
  const chunks: string[] = [];

  for (const message of messages) {
    const typed = message as { role?: string; toolName?: string; stopReason?: string; isError?: boolean };
    const role = typed.role ?? "unknown";
    const label = role === "toolResult" && typed.toolName ? `toolResult:${typed.toolName}` : role;
    const text = extractText(message).trim();
    if (!text) continue;

    const suffix = role === "assistant" && typed.stopReason ? ` (stopReason=${typed.stopReason})` : "";
    const err = typed.isError ? " [ERROR]" : "";
    chunks.push(`## ${label}${suffix}${err}\n${text}`);
  }

  const serialized = chunks.join("\n\n---\n\n");
  if (serialized.length <= maxChars) return serialized;

  return `[Transcript truncated to last ${maxChars} chars]\n${serialized.slice(serialized.length - maxChars)}`;
}

function parseEvaluation(text: string): GoalEvaluation | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1];
  const candidates = [fenced, trimmed, trimmed.replace(/\\"/g, '"'), ...candidateJsonObjects(trimmed)]
    .filter((candidate): candidate is string => typeof candidate === "string" && candidate.trim().length > 0);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate.trim()) as Partial<GoalEvaluation> & Record<string, unknown>;
      const normalized = goalEvaluationFromParsed(parsed);
      if (normalized) return normalized;
    } catch {
      // Try the next candidate/fallback.
    }
  }

  const status = trimmed.match(/"?status"?\s*:\s*"?(met|not_met|blocked)"?/i)?.[1] as GoalEvaluation["status"] | undefined;
  if (status) {
    const reason = trimmed.match(/"?reason"?\s*:\s*"([\s\S]*?)"\s*[}\n]/i)?.[1]?.trim() || "Evaluator returned a status without a parseable reason.";
    return { status, reason };
  }

  if (
    /"?goal_complete"?\s*:\s*true/i.test(trimmed) ||
    /"?should_stop_goal_loop"?\s*:\s*true/i.test(trimmed) ||
    /COMPLETE_FOR_APPROVED_SCOPE/.test(trimmed) ||
    /COMPLETE_WITH_RESIDUAL_BLOCKS/.test(trimmed) ||
    /STOP_GOAL_COMPLETE/.test(trimmed)
  ) {
    return { status: "met", reason: "Evaluator output included a completed Goal Mode artifact." };
  }

  return null;
}

function persistGoal(pi: ExtensionAPI, event: string, goal: GoalState | null, details?: Record<string, unknown>) {
  pi.appendEntry(STATE_ENTRY_TYPE, {
    event,
    goal,
    details,
    timestamp: nowIso(),
  });
}

function restoreGoalFromSession(ctx: { sessionManager?: { getEntries?: () => unknown[] } }) {
  const entries = ctx.sessionManager?.getEntries?.() ?? [];

  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = entries[i] as { type?: string; customType?: string; data?: { goal?: GoalState | null } };
    if (entry.type !== "custom" || entry.customType !== STATE_ENTRY_TYPE) continue;

    const goal = entry.data?.goal ?? null;
    activeGoal = goal && (goal.status === "active" || goal.status === "blocked") ? goal : null;
    return;
  }
}

async function selectEvaluatorModel(ctx: {
  model?: unknown;
  modelRegistry: { find: (provider: string, model: string) => unknown; getApiKeyAndHeaders: (model: unknown) => Promise<{ ok: boolean; apiKey?: string; headers?: Record<string, string>; error?: string }> };
}) {
  for (const [provider, modelId] of EVALUATOR_MODEL_CANDIDATES) {
    const model = ctx.modelRegistry.find(provider, modelId);
    if (!model) continue;

    const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
    if (auth.ok && auth.apiKey) return { model, auth, label: `${provider}/${modelId}` };
  }

  const currentModel = ctx.model as { provider?: string; id?: string } | undefined;
  if (currentModel?.provider === "anthropic") {
    const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
    if (auth.ok && auth.apiKey) {
      return { model: ctx.model, auth, label: `anthropic/${currentModel.id ?? "selected-claude-model"}` };
    }
  }

  return null;
}

function workspaceCwd(ctx: { cwd?: string } | unknown): string {
  const maybe = ctx as { cwd?: unknown };
  return typeof maybe.cwd === "string" && maybe.cwd.trim() ? maybe.cwd : process.cwd();
}

function readCompletionArtifact(cwd: string): GoalEvaluation | null {
  const artifactRoots = Array.from(
    new Set(
      [cwd, process.cwd(), process.env.PWD]
        .filter((root): root is string => typeof root === "string" && root.trim().length > 0)
        .flatMap((root) => {
          const resolved = path.resolve(root);
          const roots = [resolved];
          let cursor = resolved;
          for (let i = 0; i < 4; i += 1) {
            const parent = path.dirname(cursor);
            if (parent === cursor) break;
            roots.push(parent);
            cursor = parent;
          }
          return roots;
        }),
    ),
  );
  const directArtifactDirs = Array.from(
    new Set([
      ...artifactRoots.map((root) => path.join(root, ".pi")),
      path.join(os.homedir(), ".pi"),
    ]),
  );
  const artifactNames = [
    "GOAL_MODE_STATUS.json",
    "GOAL_MODE_RESULT.json",
    "GOAL_MODE_EVALUATOR_MINIMAL.json",
    "GOAL_MODE_EVALUATOR_NATIVE.json",
    "GOAL_MODE_EVALUATOR_STOP_PACKET.json",
    "GOAL_MODE_EVALUATOR_ONE_LINE.json",
  ];
  const candidateFiles = directArtifactDirs.flatMap((dir) => artifactNames.map((name) => path.join(dir, name)));

  for (const file of candidateFiles) {
    try {
      if (!fs.existsSync(file)) continue;
      const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<GoalEvaluation> & Record<string, unknown>;
      const evaluation = goalEvaluationFromParsed(parsed);
      if (evaluation?.status === "met") {
        return {
          status: "met",
          reason: `Repository Goal Mode artifact ${path.relative(cwd, file)} reports completion for the approved scope.`,
        };
      }
    } catch {
      // Ignore malformed artifacts and fall back to the model evaluator.
    }
  }

  return null;
}

async function evaluateGoal(goal: GoalState, messages: unknown[], ctx: {
  model?: unknown;
  modelRegistry: { find: (provider: string, model: string) => unknown; getApiKeyAndHeaders: (model: unknown) => Promise<{ ok: boolean; apiKey?: string; headers?: Record<string, string>; error?: string }> };
  signal?: AbortSignal;
}): Promise<GoalEvaluation & { modelLabel?: string }> {
  const selected = await selectEvaluatorModel(ctx);
  if (!selected) {
    return {
      status: "blocked",
      reason: "Goal evaluator requires an authenticated Anthropic Claude model in PI, but none was available. Configure/login Anthropic Claude or clear the goal.",
    };
  }

  const transcript = serializeMessages(messages);
  const userMessage: UserMessage = {
    role: "user",
    timestamp: Date.now(),
    content: [
      {
        type: "text",
        text: `Goal condition:\n${goal.criteria}\n\nConversation transcript:\n${transcript}`,
      },
    ],
  };

  const response = await complete(
    selected.model as never,
    { systemPrompt: EVALUATOR_SYSTEM_PROMPT, messages: [userMessage] },
    {
      apiKey: selected.auth.apiKey,
      headers: selected.auth.headers,
      signal: ctx.signal,
      maxTokens: 800,
      temperature: 0,
    },
  );

  let text = coerceVisibleText(response.content);
  if (!text.trim()) {
    text = coerceVisibleText(response);
  }

  if (!text.trim()) {
    return {
      status: "blocked",
      reason: `Goal evaluator ${selected.label} returned no visible text, so Goal Mode cannot safely auto-continue. Reload PI after updating the evaluator extension, then use /goal continue or /goal clear.`,
      modelLabel: selected.label,
    };
  }

  const parsed = parseEvaluation(text);
  if (!parsed) {
    return {
      status: "not_met",
      reason: `Goal evaluator returned unparseable output; keeping the goal active. Output preview: ${text.slice(0, 300)}`,
      modelLabel: selected.label,
    };
  }

  return { ...parsed, modelLabel: selected.label };
}

function queueContinuation(pi: ExtensionAPI, goal: GoalState, reason: string, options?: { skipCurrentAgentEnd?: boolean }) {
  if (goal.continuations >= goal.maxContinuations) {
    console.warn("[goal-mode] Max continuations reached; not queueing another follow-up");
    return false;
  }

  goal.status = "active";
  goal.continuations += 1;
  goal.updatedAt = nowIso();

  if (options?.skipCurrentAgentEnd) {
    skipNextAgentEndEvaluation = true;
  }

  pi.sendUserMessage(formatContinuationPrompt(goal, reason), { deliverAs: "followUp" });
  persistGoal(pi, "continue", goal, { reason });
  return true;
}

function formatStatus(goal: GoalState): string {
  return [
    `Goal Mode ${goal.status}: ${summarize(goal.criteria)}`,
    `evaluations=${goal.evaluations}`,
    `continuations=${goal.continuations}/${goal.maxContinuations}`,
    goal.evaluatorModel ? `evaluator=${goal.evaluatorModel}` : undefined,
    goal.lastReason ? `last=${goal.lastReason}` : undefined,
  ]
    .filter(Boolean)
    .join(" | ");
}

export default function goalModeExtension(pi: ExtensionAPI) {
  pi.registerCommand("goal", {
    description: "Set, show, continue, or clear Claude Code-style Goal Mode. Usage: /goal <condition>, /goal status, /goal continue, /goal clear",
    handler: async (args, ctx) => {
      const raw = normalizeArgs(args);
      const command = raw.toLowerCase();

      if (!raw || command === "status") {
        if (!activeGoal) {
          ctx.ui.notify("Goal Mode is not active. Use /goal <done criteria> to enable it.", "info");
          return;
        }

        ctx.ui.notify(formatStatus(activeGoal), "info");
        return;
      }

      if (["clear", "off", "reset", "none", "cancel", "stop", "done"].includes(command)) {
        if (activeGoal) {
          activeGoal.status = "cleared";
          activeGoal.updatedAt = nowIso();
          persistGoal(pi, "clear", activeGoal);
        }

        activeGoal = null;
        skipNextAgentEndEvaluation = false;
        ctx.ui.setStatus("goal-mode", "");
        ctx.ui.notify("Goal Mode cleared.", "info");
        return;
      }

      if (command === "continue") {
        if (!activeGoal) {
          ctx.ui.notify("Goal Mode is not active. Use /goal <done criteria> first.", "warning");
          return;
        }

        const queued = queueContinuation(pi, activeGoal, "manual /goal continue");
        ctx.ui.notify(queued ? "Goal continuation queued." : "Goal continuation limit reached.", queued ? "info" : "warning");
        return;
      }

      const evaluator = await selectEvaluatorModel(ctx);
      if (!evaluator) {
        ctx.ui.notify(
          "Goal Mode requires an authenticated Anthropic Claude evaluator in PI (preferred: anthropic/claude-opus-4-8). Run /login or configure Anthropic before using /goal.",
          "error",
        );
        return;
      }

      activeGoal = {
        criteria: raw,
        status: "active",
        createdAt: nowIso(),
        updatedAt: nowIso(),
        evaluations: 0,
        continuations: 0,
        maxContinuations: DEFAULT_MAX_CONTINUATIONS,
        evaluatorModel: evaluator.label,
      };
      skipNextAgentEndEvaluation = false;
      persistGoal(pi, "set", activeGoal);
      ctx.ui.setStatus("goal-mode", `◎ /goal active: ${summarize(raw)}`);

      if (ctx.isIdle()) {
        // Match Claude Code behavior: setting a goal starts a turn immediately.
        pi.sendUserMessage(formatInitialPrompt(activeGoal));
        ctx.ui.notify("Goal Mode enabled and started.", "info");
      } else {
        const queued = queueContinuation(pi, activeGoal, "goal was enabled while the agent was already running", {
          skipCurrentAgentEnd: true,
        });
        ctx.ui.notify(
          queued
            ? "Goal Mode enabled. A follow-up continuation was queued because the agent is currently running."
            : "Goal Mode enabled, but continuation limit was reached.",
          queued ? "info" : "warning",
        );
      }
    },
  });

  pi.on("before_agent_start", async (_event, ctx) => {
    if (!activeGoal || activeGoal.status !== "active") return;

    const completionArtifact = readCompletionArtifact(workspaceCwd(ctx));
    if (completionArtifact?.status === "met") {
      activeGoal.status = "achieved";
      activeGoal.updatedAt = nowIso();
      persistGoal(pi, "achieved", activeGoal, { evaluation: completionArtifact, source: "before_agent_start_artifact" });
      activeGoal = null;
      ctx.ui.setStatus("goal-mode", "");
      ctx.ui.notify(`Goal achieved and cleared: ${completionArtifact.reason}`, "info");
      return;
    }

    const goalBlock = formatGoalBlock(activeGoal);
    if (ctx.systemPrompt) {
      ctx.systemPrompt = `${goalBlock}\n\n${ctx.systemPrompt}`;
    } else {
      ctx.systemPrompt = goalBlock;
    }
  });

  pi.on("agent_end", async (event, ctx) => {
    if (!activeGoal || activeGoal.status !== "active") return;
    if (isEvaluating) return;

    if (skipNextAgentEndEvaluation) {
      skipNextAgentEndEvaluation = false;
      return;
    }

    const goal = activeGoal;
    isEvaluating = true;

    try {
      const completionArtifact = readCompletionArtifact(workspaceCwd(ctx));
      const evaluation = completionArtifact ?? (await evaluateGoal(goal, event.messages as unknown[], ctx as never));
      goal.evaluations += 1;
      goal.updatedAt = nowIso();
      goal.lastReason = evaluation.reason;
      goal.evaluatorModel = evaluation.modelLabel;

      persistGoal(pi, "evaluate", goal, { evaluation });
      ctx.ui.setStatus("goal-mode", `◎ /goal active: ${summarize(goal.criteria)} (${goal.evaluations} evals)`);

      if (evaluation.status === "met") {
        goal.status = "achieved";
        goal.updatedAt = nowIso();
        persistGoal(pi, "achieved", goal, { evaluation });
        activeGoal = null;
        ctx.ui.setStatus("goal-mode", "");
        ctx.ui.notify(`Goal achieved and cleared: ${evaluation.reason}`, "info");
        return;
      }

      if (evaluation.status === "blocked") {
        goal.status = "blocked";
        goal.updatedAt = nowIso();
        persistGoal(pi, "blocked", goal, { evaluation });
        ctx.ui.notify(`Goal blocked: ${evaluation.reason}. Use /goal continue after resolving, or /goal clear.`, "warning");
        return;
      }

      const queued = queueContinuation(pi, goal, evaluation.reason);
      ctx.ui.notify(
        queued
          ? `Goal not met; continuation queued. ${evaluation.reason}`
          : `Goal not met, but continuation limit reached. ${evaluation.reason}`,
        queued ? "info" : "warning",
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      goal.lastReason = `Evaluator error: ${reason}`;
      goal.updatedAt = nowIso();
      persistGoal(pi, "evaluator_error", goal, { reason });
      const queued = queueContinuation(pi, goal, `Evaluator error (${reason}); continue conservatively.`);
      ctx.ui.notify(queued ? "Goal evaluator failed; continuation queued conservatively." : "Goal evaluator failed and continuation limit reached.", queued ? "warning" : "error");
    } finally {
      isEvaluating = false;
    }
  });

  pi.on("session_start", async (_event, ctx) => {
    restoreGoalFromSession(ctx);
    if (activeGoal) {
      const completionArtifact = readCompletionArtifact(workspaceCwd(ctx));
      if (completionArtifact?.status === "met") {
        activeGoal.status = "achieved";
        activeGoal.updatedAt = nowIso();
        persistGoal(pi, "achieved", activeGoal, { evaluation: completionArtifact, source: "session_start_artifact" });
        activeGoal = null;
        ctx.ui.setStatus("goal-mode", "");
        ctx.ui.notify(`Goal achieved and cleared: ${completionArtifact.reason}`, "info");
        return;
      }
      ctx.ui.setStatus("goal-mode", `◎ /goal active: ${summarize(activeGoal.criteria)}`);
    }
  });

  console.log("[goal-mode] Extension loaded: Claude Code-style /goal command enabled");
}
