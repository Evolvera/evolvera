import type { BeforeAgentStartEvent, ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { isAbsolute, join, resolve } from "node:path";
import { resolvePlasticMemoryOwnerModeFromFiles } from "./plastic-memory/index.ts";
import { assembleProjectContext } from "./plastic-memory/project/context.ts";

function currentMemoryRoot(ctx: { cwd?: unknown }): { cwd: string; memoryRoot: string } {
  if (typeof ctx.cwd !== "string" || !isAbsolute(ctx.cwd)) throw new Error("current project cwd is unavailable");
  const cwd = resolve(ctx.cwd);
  return { cwd, memoryRoot: join(cwd, ".pi", "memory") };
}

function combineProjectContext(systemPrompt: unknown, block: string): string {
  const prior = typeof systemPrompt === "string" ? systemPrompt : "";
  return prior ? `${block}\n\n${prior}` : block;
}

export default function projectMemoryExtension(pi: ExtensionAPI): void {
  if (resolvePlasticMemoryOwnerModeFromFiles() === "full") return;

  pi.on("before_agent_start", (event: BeforeAgentStartEvent, ctx: ExtensionContext): { systemPrompt: string } | undefined => {
    try {
      const { cwd, memoryRoot } = currentMemoryRoot(ctx);
      const project = assembleProjectContext(memoryRoot, { architectureRoot: memoryRoot, repositoryRoot: cwd });
      return { systemPrompt: combineProjectContext(event.systemPrompt, project.block) };
    } catch {
      return undefined;
    }
  });
}
