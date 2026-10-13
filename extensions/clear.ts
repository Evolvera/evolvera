/**
 * /clear — limpa o chat e todo o contexto do agente.
 *
 * Como funciona: aborta qualquer execução em andamento e troca para uma sessão
 * nova e vazia (o mesmo mecanismo do /new nativo). O modelo passa a não ver
 * nenhuma mensagem anterior. A sessão antiga continua salva em disco e pode ser
 * reaberta com /resume — nada é apagado.
 *
 * Arquivo do usuário, fora do harness Evolvera: o instalador só copia os
 * próprios arquivos para extensions/, então este sobrevive a atualizações.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	pi.registerCommand("clear", {
		description: "Limpa o chat e todo o contexto (inicia uma sessão vazia)",
		handler: async (_args, ctx) => {
			if (!ctx.isIdle()) {
				ctx.abort();
				await ctx.waitForIdle();
			}

			const result = await ctx.newSession({
				withSession: async (fresh) => {
					// Limpa também o histórico visível do terminal (tela + scrollback).
					process.stdout.write("\x1b[2J\x1b[3J\x1b[H");
					fresh.ui.notify("Chat e contexto limpos.", "info");
				},
			});

			if (result.cancelled) {
				ctx.ui.notify("Limpeza cancelada por outra extensão.", "warning");
			}
		},
	});
}
