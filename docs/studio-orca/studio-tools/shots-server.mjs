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
// A team-bus team led from painel-financeiro: three child sessions in sibling worktrees, their logs and the messages
// between them (the stage draws the tree and the mail column from these files). Heartbeats are refreshed every 30 s,
// like live members, so the team does not go stale while screenshots are taken.
const teamDir = path.join(agent, "teams", "painel-fechamento");
{
  const lead = path.join(roots, "painel-financeiro");
  const members = [
    { name: "lead", role: "lead", cwd: lead, state: "working" },
    { name: "saldo", role: "member", cwd: `${lead}-saldo`, state: "idle" },
    { name: "graficos", role: "member", cwd: `${lead}-graficos`, state: "working" },
    { name: "revisor", role: "member", cwd: `${lead}-revisor`, state: "idle" },
  ];
  mkdirSync(path.join(teamDir, "members"), { recursive: true });
  mkdirSync(path.join(teamDir, "logs"), { recursive: true });
  const beat = () => { for (const member of members) writeFileSync(path.join(teamDir, "members", `${member.name}.json`), JSON.stringify({ ...member, pid: 1, updatedAt: Date.now() })); };
  beat();
  setInterval(beat, 30_000).unref();
  const at = (s) => now - 420_000 + s * 1000;
  const answer = (s, text, cost, model = "gpt-6.1-sol", thinkingLevel = "medium") => ({ type: "message_end", message: { role: "assistant", model, thinkingLevel, timestamp: at(s), usage: { cost: { total: cost } }, content: [{ type: "text", text }] } });
  const logs = {
    saldo: [{ type: "agent_start" }, { type: "tool_execution_start", toolCallId: "s1", toolName: "read", args: { path: "src/saldo.ts" } }, { type: "tool_execution_end", toolCallId: "s1" },
      { type: "tool_execution_start", toolCallId: "s2", toolName: "bash", args: { command: "npm test -- saldo" } }, { type: "tool_execution_end", toolCallId: "s2" },
      answer(140, "O saldo inicial de setembro agora sai do extrato importado, não do mês anterior. Os 18 testes do saldo passaram e commitei na branch team/saldo.", 0.042), { type: "agent_end" }],
    graficos: [{ type: "agent_start" }, answer(60, "Vou montar o gráfico de entradas e saídas com as cores do painel.", 0.011, "claude-opus-5-5", "high"),
      { type: "tool_execution_start", toolCallId: "g1", toolName: "edit", args: { path: "src/telas/GraficoFluxo.tsx" } }],
    revisor: [{ type: "agent_start" }, { type: "tool_execution_start", toolCallId: "r1", toolName: "grep", args: { pattern: "fechamento", path: "src" } }, { type: "tool_execution_end", toolCallId: "r1" },
      answer(210, "Revisei o saldo: está certo. Achei um arredondamento no fechamento de setembro (centavos somados duas vezes). Corrijo agora ou fica com o lead?", 0.019, "gpt-6.1-sol", "high"), { type: "agent_end" }],
  };
  for (const [name, events] of Object.entries(logs)) writeFileSync(path.join(teamDir, "logs", `${name}.jsonl`), `${events.map((event) => JSON.stringify(event)).join("\n")}\n`);
  const mail = [
    [5, "lead", "saldo", "Corrija o saldo inicial de setembro a partir do extrato importado. Commit na sua branch e me avise."],
    [8, "lead", "graficos", "Monte o gráfico de entradas e saídas do mês no painel, com as cores do tema."],
    [12, "lead", "revisor", "Revise o saldo e o fechamento de setembro quando o saldo terminar."],
    [141, "saldo", "lead", "Saldo inicial corrigido a partir do extrato. 18 testes passando, commit na team/saldo."],
    [212, "revisor", "lead", "Achei um arredondamento no fechamento de setembro. Corrijo ou fica com você?"],
  ];
  writeFileSync(path.join(teamDir, "messages.jsonl"), `${mail.map(([s, from, to, preview]) => JSON.stringify({ at: at(s), from, to, preview })).join("\n")}\n`);
}
// Vorcaro v1: two requests it already followed (one verified by its own `npm test`, one waiting on a decision) and their
// audit trail, so the board shows the conductor's work without running anything.
{
  const data = path.join(agent, "pi-studio-data");
  mkdirSync(data, { recursive: true });
  const loja = path.join(roots, "loja-online");
  const agenda = path.join(roots, "app-agenda");
  const sent = now - 50 * 60_000;
  const demands = [
    { id: "dm-pix", createdAt: sent, projectId: "x", project: "loja-online", cwd: loja, objetivo: "Testes do checkout com Pix passando", checklist: ["npm test passa", "Pix aparece no confirmar"], verify: ["npm test"], phase: "feito", continuations: 1, lastContinuationAt: sent + 20 * 60_000, sessionId: "s-pix", sessionFile: path.join(agent, "sessions", "--loja-online--", "loja-online-1.jsonl"),
      verification: { at: sent + 40 * 60_000, ok: true, results: [{ command: "npm test", ok: true, exit: 0, output: "Tests: 42 passed" }] } },
    { id: "dm-agenda", createdAt: now - 25 * 60_000, projectId: "y", project: "app-agenda", cwd: agenda, objetivo: "Lembrete diário pelo WhatsApp no horário padrão", checklist: ["Horário padrão configurável", "Teste do agendador passando"], verify: ["npm test"], phase: "aguardando", continuations: 0, sessionId: "s-agenda", sessionFile: path.join(agent, "sessions", "--app-agenda--", "app-agenda-0.jsonl"),
      block: { kind: "decision", question: "Os lembretes saem pelo WhatsApp. Qual horário padrão você prefere: 9h ou 18h?" } },
  ];
  writeFileSync(path.join(data, "vorcaro-demandas.json"), JSON.stringify(demands));
  const audit = [
    [sent, "dm-pix", "dispatched", "user", { project: "loja-online" }], [sent + 18 * 60_000, "dm-pix", "verify_result", "vorcaro", { ok: false }],
    [sent + 20 * 60_000, "dm-pix", "continuation_sent", "vorcaro", { attempt: 1 }], [sent + 40 * 60_000, "dm-pix", "verify_result", "vorcaro", { ok: true }], [sent + 40 * 60_000, "dm-pix", "done", "vorcaro", {}],
    [now - 25 * 60_000, "dm-agenda", "dispatched", "user", {}], [now - 12 * 60_000, "dm-agenda", "blocked", "vorcaro", { block: { kind: "decision" } }],
  ];
  writeFileSync(path.join(data, "vorcaro-auditoria.jsonl"), `${audit.map(([at, demandId, type, actor, d]) => JSON.stringify({ at, demandId, type, actor, data: d })).join("\n")}\n`);
}
// The answer every fake PI gives (shows Vorcaro's summary with cited sources and one proposed action). The refs follow
// digestRef in lib-server/vorcaro.mjs (a hash of the session file).
const ref = (file) => { let hash = 5381; for (const char of file) hash = ((hash * 33) ^ char.charCodeAt(0)) >>> 0; return `s${hash.toString(36)}`; };
const sessionFile = (project, name) => path.join(agent, "sessions", `--${project}--`, `${name}.jsonl`);
const replyFile = path.join(temp, "reply.md");
const action = { acao: "enviar", projeto: path.join(roots, "painel-financeiro"), sessao: "", objetivo: "Fechar a correção do fluxo de caixa de setembro", checklist: ["Fechamento de setembro confere com o extrato", "Gráfico de entradas e saídas aparece no painel", "Testes do painel passando"], instrucoes: "Retome os itens abertos da lista de tarefas e verifique cada um antes de concluir.", verificar: ["npm test"] };
writeFileSync(replyFile, [
  "Nos últimos dias você tocou 3 frentes:",
  "",
  `- **Checkout com Pix** (loja-online): fazendo, 2 de 4 itens, objetivo ativo. O builder está na tela do QR [fonte: ${ref(sessionFile("loja-online", "rich-checkout"))}].`,
  `- **Lembretes por WhatsApp** (app-agenda): parado esperando você escolher o horário padrão, 9h ou 18h [fonte: ${ref(sessionFile("app-agenda", "app-agenda-0"))}].`,
  `- **Fluxo de caixa** (painel-financeiro): 2 itens abertos e nada rodando [fonte: ${ref(sessionFile("painel-financeiro", "painel-financeiro-0"))}].`,
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
