import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const TARGET_PROVIDER = "alibaba-plan";
const TARGET_MODEL = "qwen3.8-max-preview";
export const QWEN_CONTEXT_WINDOW = 200_000;

type ModelContext = {
  provider: string;
  id: string;
  contextWindow: number;
};

export function applyQwenContextLimit(model: ModelContext | undefined): boolean {
  if (model?.provider !== TARGET_PROVIDER || model.id !== TARGET_MODEL) return false;
  model.contextWindow = QWEN_CONTEXT_WINDOW;
  return true;
}

export default function qwenContextLimit(pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    applyQwenContextLimit(ctx.modelRegistry.find(TARGET_PROVIDER, TARGET_MODEL));
    applyQwenContextLimit(ctx.model);
  });

  pi.on("model_select", async (event) => {
    applyQwenContextLimit(event.model);
  });
}
