import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const MANAGER_KEY = Symbol.for("pi-subagents:manager");

type AgentRecord = {
  id: string;
  status: string;
  resultConsumed?: boolean;
  session?: { steer(message: string): Promise<void> };
  pendingSteers?: string[];
};

type SubagentManager = {
  getRecord(id: string): AgentRecord | undefined;
};

export default function studioSteerExtension(pi: ExtensionAPI) {
  pi.registerCommand("steer", {
    description: "/steer <agentId> <message…> — envia uma mensagem a um subagente em execução",
    handler: async (rawArgs, ctx) => {
      try {
        const match = /^(\S+)\s+([\s\S]*?)\s*$/.exec(rawArgs);
        if (!match || !match[2].trim()) {
          ctx.ui.notify("Uso: /steer <agentId> <mensagem> (a mensagem não pode estar vazia).", "warning");
          return;
        }

        const manager = (globalThis as typeof globalThis & { [key: symbol]: unknown })[MANAGER_KEY] as
          SubagentManager | undefined;
        if (!manager || typeof manager.getRecord !== "function") {
          ctx.ui.notify("Gerenciador de subagentes indisponível.", "error");
          return;
        }

        const record = manager.getRecord(match[1]);
        if (!record) {
          ctx.ui.notify(`Subagente desconhecido: ${match[1]}.`, "warning");
          return;
        }
        // Same rule as pi-subagents' own @mention steering: running or still queued.
        if (record.status !== "running" && record.status !== "queued") {
          ctx.ui.notify(`O subagente ${match[1]} não está em execução.`, "warning");
          return;
        }

        const message = match[2].trim();
        // Like the steer_subagent tool: un-consume the result so the agent's reply to this message is relayed.
        record.resultConsumed = false;
        if (!record.session) {
          if (!record.pendingSteers) record.pendingSteers = [];
          record.pendingSteers.push(message);
          pi.events.emit("subagents:steered", { id: record.id, message });
        } else {
          await record.session.steer(message);
          pi.events.emit("subagents:steered", { id: record.id, message });
        }
        ctx.ui.notify(`Mensagem enviada ao subagente ${record.id}`, "info");
      } catch {
        ctx.ui.notify("Não foi possível enviar a mensagem ao subagente.", "error");
      }
    },
  });
}
