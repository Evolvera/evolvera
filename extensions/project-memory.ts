import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isAbsolute, join, resolve } from "node:path";
import { resolvePlasticMemoryOwnerModeFromFiles } from "./plastic-memory/index.ts";
import { assembleProjectContext } from "./plastic-memory/project/context.ts";

function currentMemoryRoot(ctx: { cwd?: unknown }): { cwd: string; memoryRoot: string } {
  if (typeof ctx.cwd !== "string" || !isAbsolute(ctx.cwd)) throw new Error("current project cwd is unavailable");
  const cwd = resolve(ctx.cwd);
  return { cwd, memoryRoot: join(cwd, ".pi", "memory") };
}

function prependProjectContext(ctx: { systemPrompt?: unknown }, block: string): void {
  const prior = typeof ctx.systemPrompt === "string" ? ctx.systemPrompt : "";
  ctx.systemPrompt = prior ? `${block}\n\n${prior}` : block;
}

export default function projectMemoryExtension(pi: ExtensionAPI): void {
  if (resolvePlasticMemoryOwnerModeFromFiles() === "full") return;

  pi.on("before_agent_start", (_event, ctx) => {
    const { cwd, memoryRoot } = currentMemoryRoot(ctx);
    const project = assembleProjectContext(memoryRoot, { architectureRoot: memoryRoot, repositoryRoot: cwd });
    prependProjectContext(ctx, project.block);
  });
}
