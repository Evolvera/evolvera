import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Swarm mode: makes the primary orchestrator work at maximum parallelism.
 *
 * `/swarm on [objective]` adds an orchestration directive to the primary session's system
 * prompt (subagents never receive it) and, when an objective is given, starts a pi-goal run
 * so the work continues autonomously until done. The concurrency ceiling itself lives in
 * subagents.json (maxConcurrent); planning uses the existing multi-family plan-heavy ensemble.
 * Safety gates are untouched: the directive repeats that they still apply.
 */

const STATUS_KEY = "swarm-mode";
const STATE_KEY = Symbol.for("evolvera.swarm-mode.state");
const PRIMARY_PROMPT = "# PI Coding Agent";
export const GOAL_START_CHANNEL = "pi-goal:start";
export const goalEventChannel = (runId: string) => `pi-goal:event:${runId}`;
export const MAX_AGENTS = 50;

export const SWARM_DIRECTIVE = `
## SWARM MODE (active — set by the user with /swarm)
Work at maximum parallelism until nothing executable remains. This overrides any lighter routing preference above; it never relaxes the Safety section, stateful-resource gates, or approval boundaries.
- Fan out: decompose every task into the largest set of independent fronts with disjoint write sets and launch every ready front in one concurrent wave, up to ${MAX_AGENTS} concurrent subagents. Refill each freed slot immediately with the next ready front. Never run independent work serially and never do discovery yourself that a scout, bug-hunt, or research agent can do in parallel.
- Planning uses two model families: for any plan, load the plan-heavy skill so the GPT and Claude briefers run in parallel and a fresh planner reconciles them. Other work (scouts, builders, reviewers) uses each agent's normal model; give each write set exactly one builder.
- Combine: reconcile every result as it arrives, resolve contradictions with evidence, and keep a single authoritative result per front.
- Self-index: the todo list is the running index of all fronts; update it as each result lands and dispatch newly ready work at once.
- Keep going: do not end the turn or ask questions while safe, authorized, in-scope work remains; report only when everything is complete or genuinely blocked.
- Heavy local commands (tests, builds) still share about 80% of CPU; agents waiting on models do not count against it.`;

type SwarmState = { enabled: boolean };

function state(): SwarmState {
  const global = globalThis as typeof globalThis & { [key: symbol]: unknown };
  const existing = global[STATE_KEY] as SwarmState | undefined;
  if (existing) return existing;
  const created: SwarmState = { enabled: true };
  global[STATE_KEY] = created;
  return created;
}

export function isPrimaryPrompt(customPrompt: unknown): boolean {
  return typeof customPrompt === "string" && customPrompt.trimStart().startsWith(PRIMARY_PROMPT);
}

export function parseSwarmArgs(raw: string): { action: "on" | "off" | "status" | "invalid"; objective?: string } {
  const text = raw.trim();
  const [first = "", ...rest] = text.split(/\s+/);
  const word = first.toLowerCase();
  if (word === "") return { action: "status" };
  if (word === "off") return rest.length === 0 ? { action: "off" } : { action: "invalid" };
  if (word === "on" || word === "max") {
    const objective = text.slice(first.length).trim();
    return objective ? { action: "on", objective } : { action: "on" };
  }
  return { action: "invalid" };
}

type Ui = {
  notify(message: string, type?: "info" | "warning" | "error"): void;
  setStatus(key: string, text: string | undefined): void;
};

export default function swarmMode(pi: ExtensionAPI): void {
  const show = (ui: Ui) => ui.setStatus(STATUS_KEY, state().enabled ? "🐝SWARM" : undefined);

  const startGoal = (objective: string, ui: Ui) => {
    const runId = `swarm-${Date.now()}`;
    const unsubscribe = pi.events.on(goalEventChannel(runId), (raw: unknown) => {
      unsubscribe();
      const event = raw as { type?: string; error?: { message?: string } };
      if (event?.type === "error") {
        ui.notify(`Swarm ligado, mas o /goal não iniciou: ${event.error?.message ?? "erro desconhecido"}. Use /goal <objetivo>.`, "warning");
      }
    });
    pi.events.emit(GOAL_START_CHANNEL, { runId, objective });
  };

  pi.registerCommand("swarm", {
    description: "Swarm mode: /swarm on [objetivo] | /swarm off | /swarm (status)",
    getArgumentCompletions: async (prefix) =>
      [
        { value: "on", label: "on", description: `Máximo paralelismo (até ${MAX_AGENTS} agentes); com objetivo, inicia /goal` },
        { value: "off", label: "off", description: "Volta ao roteamento normal" },
      ].filter((option) => option.value.startsWith(prefix.trim().toLowerCase())),
    handler: async (rawArgs, ctx) => {
      const parsed = parseSwarmArgs(rawArgs);
      if (parsed.action === "invalid") {
        ctx.ui.notify("Uso: /swarm on [objetivo] | /swarm off | /swarm", "warning");
        return;
      }
      if (parsed.action === "status") {
        ctx.ui.notify(state().enabled ? `Swarm ativo (até ${MAX_AGENTS} agentes).` : "Swarm desligado.", "info");
        return;
      }
      state().enabled = parsed.action === "on";
      show(ctx.ui);
      if (parsed.action === "off") {
        ctx.ui.notify("Swarm desligado: roteamento normal.", "info");
        return;
      }
      ctx.ui.notify(
        `Swarm ativo: fan-out máximo (até ${MAX_AGENTS} agentes), planejamento GPT + Claude, sem parar até acabar. Consome bem mais créditos.`,
        "warning",
      );
      if (parsed.objective) startGoal(parsed.objective, ctx.ui);
    },
  });

  pi.on("before_agent_start", async (event) => {
    if (!state().enabled || !isPrimaryPrompt(event.systemPromptOptions?.customPrompt)) return;
    return { systemPrompt: `${event.systemPrompt}\n${SWARM_DIRECTIVE}` };
  });

  pi.on("session_start", async (_event, ctx) => {
    show(ctx.ui);
  });
}
