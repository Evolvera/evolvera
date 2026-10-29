// Scratch: a Studio on port 4198 with synthetic projects, sessions and a fake Orca, for screenshots only.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const studio = process.argv[2];
const temp = mkdtempSync(path.join(os.tmpdir(), "pi-studio-shots-"));
const agent = path.join(temp, "agent");
const roots = path.join(temp, "projetos");
const names = [["loja-online", "feat/checkout-pix", "in-progress", "Checkout com Pix e boleto", "working"], ["painel-financeiro", "fix/fluxo-caixa", "in-review", "Corrigir o fluxo de caixa do mês", "done"], ["app-agenda", "feat/lembretes", "todo", "Lembretes por WhatsApp", "waiting"]];
const now = Date.now();
const worktrees = [];
names.forEach(([name, branch, column, task, agentState], i) => {
  const dir = path.join(roots, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "package.json"), `{"name":"${name}"}\n`);
  const sessionsDir = path.join(agent, "sessions", `--${name}--`);
  mkdirSync(sessionsDir, { recursive: true });
  for (let s = 0; s < 3; s++) {
    const id = `${name}-${s}`;
    const lines = [{ type: "session", version: 3, id, timestamp: new Date(now - (s + 1) * 3600_000).toISOString(), cwd: dir },
      { type: "message", id: `${id}-u`, timestamp: new Date(now - (s + 1) * 3600_000).toISOString(), message: { role: "user", content: [{ type: "text", text: s === 0 ? task : `Revisar ${["testes", "textos da tela", "README"][s - 1]} de ${name}` }] } },
      { type: "message", id: `${id}-a`, timestamp: new Date(now - (s + 1) * 3500_000).toISOString(), message: { role: "assistant", content: [{ type: "text", text: s === 0 && name === "app-agenda" ? "Os lembretes saem pelo WhatsApp. Qual horário padrão você prefere: 9h ou 18h?" : "Feito. Testes passando." }], stopReason: "stop", usage: { input: 1200, output: 300, cost: { total: 0.004 } } } }];
    if (s === 0 && name === "painel-financeiro") lines.splice(2, 0, { type: "message", id: `${id}-t`, timestamp: new Date(now - 3400_000).toISOString(), message: { role: "toolResult", toolCallId: "td", toolName: "todo", content: [{ type: "text", text: "ok" }], details: { tasks: [{ id: 1, subject: "Corrigir o saldo inicial", status: "completed" }, { id: 2, subject: "Conferir o fechamento de setembro", status: "pending" }, { id: 3, subject: "Gráfico de entradas e saídas", status: "pending" }] } } });
    writeFileSync(path.join(sessionsDir, `${id}.jsonl`), `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`);
  }
  worktrees.push({ path: dir, repoId: "demo-repo", displayName: name, branch: `refs/heads/${branch}`, status: agentState === "working" ? "working" : "inactive", workspaceStatus: column, unread: i === 1, liveTerminalCount: 1, comment: i === 0 ? "testando o retorno do banco" : "", agents: [{ agentType: "pi", state: agentState, taskTitle: task, lastAssistantMessage: agentState === "working" ? "Rodando os testes do checkout" : agentState === "done" ? "PR aberto, aguardando revisão" : "Pergunta: qual horário padrão do lembrete?" }] });
});
// A rich conversation in loja-online: reasoning, reads, a scout subagent, edits with diffs, tests, and a builder still running.
{
  const dir = path.join(roots, "loja-online");
  const file = path.join(agent, "sessions", "--loja-online--", "rich-checkout.jsonl");
  const t = (s) => new Date(now - 600_000 + s * 1000).toISOString();
  let n = 0;
  const msg = (s, message) => ({ type: "message", id: `r${++n}`, timestamp: t(s), message: { timestamp: Date.parse(t(s)), ...message } });
  const result = (s, toolCallId, toolName, text, details = {}, isError = false) => msg(s, { role: "toolResult", toolCallId, toolName, content: [{ type: "text", text }], details, isError });
  const lines = [
    { type: "session", version: 3, id: "rich-checkout", timestamp: t(0), cwd: dir },
    { type: "session_info", id: "r0", timestamp: t(0), name: "Checkout com Pix" },
    msg(1, { role: "user", content: [{ type: "text", text: "Implementa o pagamento por Pix no checkout e roda os testes no fim." }] }),
    msg(5, { role: "assistant", content: [{ type: "thinking", thinking: "Preciso entender como o checkout calcula o total e onde entram os meios de pagamento. Vou ler o módulo e buscar as referências a boleto." }, { type: "toolCall", id: "c1", name: "read", arguments: { path: "src/checkout.ts" } }, { type: "toolCall", id: "c2", name: "grep", arguments: { pattern: "boleto", path: "src" } }], stopReason: "toolUse", usage: { input: 3200, output: 180, cost: { total: 0.012 } } }),
    result(6, "c1", "read", "export function total(cart) { ... }"),
    result(7, "c2", "grep", "src/checkout.ts:42: boleto\nsrc/payments/boleto.ts:1: export"),
    msg(9, { role: "assistant", content: [{ type: "thinking", thinking: "Antes de mexer, vale um scout mapear o fluxo de pagamento inteiro." }, { type: "toolCall", id: "c3", name: "Agent", arguments: { subagent_type: "scout", description: "Mapear o fluxo de pagamento", prompt: "Mapeie como um pedido vira pagamento: onde o total é calculado, como o boleto é emitido e onde um Pix entraria." } }], stopReason: "toolUse", usage: { input: 4100, output: 220, cost: { total: 0.015 } } }),
    result(84, "c3", "Agent", "O total sai de src/checkout.ts (função total). Boleto é emitido em src/payments/boleto.ts e chamado no passo confirmar. Um Pix entra como novo meio em src/payments, com QR gerado no confirmar.", { agentId: "ag-scout-1", status: "completed", displayName: "scout", subagentType: "scout", modelName: "Luna", durationMs: 75_000 }),
    msg(90, { role: "assistant", content: [{ type: "thinking", thinking: "Com o mapa do scout, crio src/payments/pix.ts e ligo no confirmar." }, { type: "toolCall", id: "c4", name: "write", arguments: { path: "src/payments/pix.ts", content: "export function gerarPix(pedido) {\n  return { qr: '...', valor: pedido.total };\n}\n" } }, { type: "toolCall", id: "c5", name: "edit", arguments: { path: "src/checkout.ts", edits: [{ oldText: "  if (meio === 'boleto') return emitirBoleto(pedido);", newText: "  if (meio === 'boleto') return emitirBoleto(pedido);\n  if (meio === 'pix') return gerarPix(pedido);" }] } }], stopReason: "toolUse", usage: { input: 5200, output: 640, cost: { total: 0.021 } } }),
    result(92, "c4", "write", "Arquivo criado."),
    result(93, "c5", "edit", "Arquivo editado.", { diff: "--- a/src/checkout.ts\n+++ b/src/checkout.ts\n@@ -40,1 +40,2 @@\n   if (meio === 'boleto') return emitirBoleto(pedido);\n+  if (meio === 'pix') return gerarPix(pedido);\n" }),
    msg(95, { role: "assistant", content: [{ type: "toolCall", id: "c6", name: "bash", arguments: { command: "npm test" } }], stopReason: "toolUse", usage: { input: 5600, output: 40, cost: { total: 0.008 } } }),
    result(121, "c6", "bash", "Tests: 42 passed, 42 total\nTime: 18.2 s"),
    msg(124, { role: "assistant", content: [{ type: "text", text: "Pronto. O checkout aceita **Pix**: o pedido gera o QR no passo confirmar, e os 42 testes passaram.\n\nAgora peço a um builder a tela de confirmação com o QR." }], stopReason: "stop", usage: { input: 5800, output: 120, cost: { total: 0.009 } } }),
    { type: "custom", customType: "goal-state", id: "g1", timestamp: t(2), data: { goal: { id: "goal-pix", status: "active", objective: "Checkout aceita Pix com testes passando" } } },
    msg(125, { role: "assistant", content: [{ type: "toolCall", id: "t1", name: "todo", arguments: {} }], stopReason: "toolUse" }),
    result(125, "t1", "todo", "lista atualizada", { tasks: [{ id: 1, subject: "Gerar o Pix no confirmar", status: "completed" }, { id: 2, subject: "Testes do checkout", status: "completed" }, { id: 3, subject: "Tela de confirmação com o QR", status: "in_progress" }, { id: 4, subject: "Mensagem de pagamento aprovado", status: "pending" }] }),
    msg(126, { role: "assistant", content: [{ type: "toolCall", id: "c7", name: "Agent", arguments: { subagent_type: "builder", description: "Tela de confirmação com o QR do Pix", prompt: "Crie a tela de confirmação mostrando o QR do Pix e o valor." } }], stopReason: "toolUse", usage: { input: 6000, output: 90, cost: { total: 0.006 } } }),
  ];
  let parent = null;
  for (const line of lines.slice(1)) { line.parentId = parent; parent = line.id; }
  writeFileSync(file,`${lines.map((line) => JSON.stringify(line)).join("\n")}\n`);
}
// The answer every fake PI gives (shows Vorcaro's summary and one proposed action).
const replyFile = path.join(temp, "reply.md");
const action = { acao: "enviar", projeto: path.join(roots, "painel-financeiro"), sessao: "", objetivo: "Fechar a correção do fluxo de caixa de setembro", checklist: ["Fechamento de setembro confere com o extrato", "Gráfico de entradas e saídas aparece no painel", "Testes do painel passando"], instrucoes: "Retome os itens abertos da lista de tarefas e verifique cada um antes de concluir." };
writeFileSync(replyFile, [
  "Nos últimos dias você tocou 3 frentes:",
  "",
  "- **Checkout com Pix** (loja-online): fazendo, 2 de 4 itens, objetivo ativo. O builder está na tela do QR.",
  "- **Lembretes por WhatsApp** (app-agenda): parado esperando você escolher o horário padrão (9h ou 18h).",
  "- **Fluxo de caixa** (painel-financeiro): 2 itens abertos e nada rodando.",
  "",
  "Sugiro responder o app-agenda e mandar o painel-financeiro terminar. Preparei o pedido:",
  "",
  "```vorcaro-acao",
  JSON.stringify(action),
  "```",
].join("\n"));
const orcaState = path.join(temp, "orca.json");
writeFileSync(orcaState, JSON.stringify({ mode: "normal", active: worktrees[0].path, worktrees }));
const env = { ...process.env, PI_WEB_PORT: "4198", PI_WEB_HOST: "127.0.0.1", PI_AGENT_DIR: agent, PI_PROJECT_ROOTS: JSON.stringify([roots]),
  PI_WEB_PI_BIN: process.execPath, PI_WEB_PI_BIN_ARGS: JSON.stringify([path.join(studio, "test", "fake-pi-rpc.mjs")]),
  PI_STUDIO_ORCA_BIN: process.execPath, PI_STUDIO_ORCA_BIN_ARGS: JSON.stringify([path.join(studio, "test", "fake-orca.mjs")]), FAKE_ORCA_STATE: orcaState, FAKE_PI_REPLY_FILE: replyFile, PI_STUDIO_AMBIENTES_HOME: path.join(temp, "home") };
const server = spawn(process.execPath, [path.join(studio, "server.mjs")], { cwd: studio, env, stdio: "inherit" });
console.log(`temp ${temp}`);
server.on("exit", (code) => process.exit(code ?? 0));
