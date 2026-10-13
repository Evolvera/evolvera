import type { BeforeAgentStartEvent, ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { isAbsolute, join, resolve } from "node:path";
import { managedMemoryContext, resolvePlasticMemoryOwnerModeFromFiles } from "./plastic-memory/index.ts";
import { assembleProjectContext } from "./plastic-memory/project/context.ts";

function currentMemoryRoot(ctx: { cwd?: unknown; sessionManager?: { getSessionFile?: () => string } }): { cwd: string; memoryRoot: string } {
  if (typeof ctx.cwd !== "string" || !isAbsolute(ctx.cwd)) throw new Error("current project cwd is unavailable");
  const cwd = resolve(ctx.cwd);
  const managed = managedMemoryContext(cwd);
  if (managed) {
    const sessionPath = ctx.sessionManager?.getSessionFile?.();
    if (typeof sessionPath !== "string" || !isAbsolute(sessionPath)) throw new Error("current session ownership is unavailable");
    managedMemoryContext(cwd, sessionPath);
    managed.admitUserResources({ resource: "project-memory", cwd, memoryRoot: join(cwd, ".pi", "memory") });
  }
  return { cwd, memoryRoot: join(cwd, ".pi", "memory") };
}

function combineProjectContext(systemPrompt: unknown, block: string): string {
  const prior = typeof systemPrompt === "string" ? systemPrompt : "";
  return prior ? `${block}\n\n${prior}` : block;
}

export default function projectMemoryExtension(pi: ExtensionAPI): void {
  const managed = managedMemoryContext();
  if (!managed && resolvePlasticMemoryOwnerModeFromFiles() === "full") return;

  pi.on("before_agent_start", (event: BeforeAgentStartEvent, ctx: ExtensionContext): { systemPrompt: string } | undefined => {
    try {
      const { cwd, memoryRoot } = currentMemoryRoot(ctx);
      if (resolvePlasticMemoryOwnerModeFromFiles(cwd) === "full") return undefined;
      const project = assembleProjectContext(memoryRoot, { architectureRoot: memoryRoot, repositoryRoot: cwd });
      return { systemPrompt: combineProjectContext(event.systemPrompt, project.block) };
    } catch {
      return undefined;
    }
  });
}
