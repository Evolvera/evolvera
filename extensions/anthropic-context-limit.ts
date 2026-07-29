import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type ModelContext = {
  provider: string;
  contextWindow: number;
};

export const ANTHROPIC_NATIVE_CONTEXT_WINDOW = 1_000_000;
export const ANTHROPIC_APPLIED_CONTEXT_WINDOW = 450_000;

export function applyAnthropicContextLimit(model: ModelContext | undefined): boolean {
  if (model?.provider !== "anthropic" || model.contextWindow !== ANTHROPIC_NATIVE_CONTEXT_WINDOW) return false;
  model.contextWindow = ANTHROPIC_APPLIED_CONTEXT_WINDOW;
  return true;
}

export default function anthropicContextLimit(pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    for (const model of ctx.modelRegistry.getAll()) applyAnthropicContextLimit(model);
    applyAnthropicContextLimit(ctx.model);
  });

  pi.on("model_select", async (event) => {
    applyAnthropicContextLimit(event.model);
  });
}
