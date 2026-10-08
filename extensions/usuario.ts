import type { ExtensionCommandContext, ExtensionFactory } from "@earendil-works/pi-coding-agent";

export type UsuarioRequest =
  | Readonly<{ operation: "display" | "status" | "list" }>
  | Readonly<{ operation: "create"; id: string; label?: string }>
  | Readonly<{ operation: "use"; id: string }>;

/** Process-local authority supplied by the managed runtime, never by command arguments. */
export type UsuarioControl = Readonly<{
  // A committed use returns no message: publishing afterward would mutate the fenced origin.
  execute(request: UsuarioRequest, ctx: ExtensionCommandContext): Promise<string | undefined>;
}>;

const USAGE = "/usuario [status|list|create <id> [label]|use <id>]";

function parseRequest(args: string): UsuarioRequest | undefined {
  const text = args.trim();
  if (!text) return Object.freeze({ operation: "display" });
  if (text === "status" || text === "list") return Object.freeze({ operation: text });
  const use = /^use\s+(\S+)$/u.exec(text);
  if (use) return Object.freeze({ operation: "use", id: use[1] });
  const create = /^create\s+(\S+)(?:\s+(.+))?$/u.exec(text);
  if (create) return Object.freeze({ operation: "create", id: create[1], ...(create[2] ? { label: create[2] } : {}) });
  return undefined;
}

/** One authoritative factory; the supervisor/runtime owns validation, readiness and shutdown. */
export function createUsuarioFactory(control?: UsuarioControl): ExtensionFactory {
  return (pi) => {
    const display = (text: string, ctx: ExtensionCommandContext) => {
      if (ctx.hasUI) ctx.ui.notify(text, "info");
      else pi.sendMessage({ customType: "usuario", content: text, display: true });
    };
    pi.registerCommand("usuario", {
      description: "Usuário do processo: status, list, create <id> [label], use <id>",
      handler: async (args, ctx) => {
        if (!control) {
          display("Processo não gerenciado: /usuario não oferece garantia de isolamento ou troca ordenada.", ctx);
          return;
        }
        const request = parseRequest(args);
        if (!request) {
          display(USAGE, ctx);
          return;
        }
        // No registry, provider, environment or UI-derived authorization lives here.
        // The control releases refusal fences before returning a displayable response.
        const response = await control.execute(request, ctx);
        if (response !== undefined) display(response, ctx);
      },
    });
  };
}

export default createUsuarioFactory();
