// Vorcaro, a inteligência Master: a screen of its own with the board of the recent sessions, a chat with the read-only
// Vorcaro side PI (saved like any conversation) and the requests it follows.
// Vorcaro only proposes; a proposal ("vorcaro-acao" block) becomes a card, and only the user's click sends it
// (the chosen conversation is reopened first, then the server sends one /goal to it).
import { createSideChat } from "./side-chat.js";
import { relativeTime } from "./lib.js";
import { createFilterBar, filtersQuery, parseFilters, withFilters } from "./filter-bar.js";

const FENCE = /```vorcaro-acao\s*\n([\s\S]*?)```/g;
const BOARD_POLL_MS = 10_000;

// An answer split into text and proposed actions. Light check here; the server validates again before sending.
export function splitVorcaroAnswer(text) {
  const parts = [];
  let last = 0;
  const source = String(text ?? "");
  for (const match of source.matchAll(FENCE)) {
    if (match.index > last) parts.push({ type: "text", text: source.slice(last, match.index) });
    let action = null;
    try {
      const value = JSON.parse(match[1]);
      if (value?.acao === "enviar" && typeof value.projeto === "string" && value.projeto.trim() && typeof value.objetivo === "string" && value.objetivo.trim()) {
        action = {
          acao: "enviar",
          projeto: value.projeto.trim(),
          onde: value.onde === "orca" ? "orca" : "sessao",
          sessao: value.onde !== "orca" && typeof value.sessao === "string" ? value.sessao.trim() : "",
          objetivo: value.objetivo.trim(),
          checklist: (Array.isArray(value.checklist) ? value.checklist : []).map((item) => String(item).trim()).filter(Boolean).slice(0, 12),
          instrucoes: typeof value.instrucoes === "string" ? value.instrucoes.trim() : "",
          ...(Array.isArray(value.verificar) ? { verificar: value.verificar.map((item) => String(item).trim()).filter(Boolean).slice(0, 4) } : {}),
        };
      }
    } catch { /* not JSON: shown as text below */ }
    parts.push(action ? { type: "action", action } : { type: "text", text: match[0] });
    last = match.index + match[0].length;
  }
  if (last < source.length) parts.push({ type: "text", text: source.slice(last) });
  return parts.filter((part) => part.type === "action" || part.text.trim());
}

const projectName = (folder) => String(folder ?? "").split(/[\\/]/).filter(Boolean).at(-1) ?? folder;

// What a board card shows for one session digest.
export function cardView(digest, now = Date.now()) {
  const total = digest.openItems.length + digest.doneItems;
  return {
    title: digest.title,
    project: digest.project,
    open: digest.openItems.slice(0, 3).map((item) => item.text),
    more: Math.max(0, digest.openItems.length - 3),
    progress: total ? { done: digest.doneItems, total, pct: Math.round((digest.doneItems / total) * 100) } : null,
    when: relativeTime(digest.lastActivity, now),
    // Below one cent the number says nothing ("US$ 0.00"), so it is left out.
    cost: digest.cost >= 0.005 ? `US$ ${digest.cost.toFixed(2)}` : "",
    question: /\?\s*$/.test(digest.lastOutput ?? "") ? digest.lastOutput : "",
    goal: digest.goalState?.status === "active" ? "objetivo ativo" : digest.goalState?.status === "blocked" ? "objetivo bloqueado" : digest.goalState?.status === "complete" ? "objetivo concluído" : "",
    source: digest.source === "claude" ? "Claude Code" : "",
  };
}

export const MAIN_SESSIONS_PER_PROJECT = 2;
const CHANGE_LABEL = { aguardando: "espera você", feito: "terminou", fazendo: "começou a trabalhar", "a-fazer": "parou com itens abertos" };
export function changeLabel(change) {
  return `${change.from ? "" : "nova: "}${CHANGE_LABEL[change.to] ?? change.to}`;
}
const COLUMN_LABEL = { aguardando: "Aguardando você", fazendo: "Fazendo", "a-fazer": "A fazer", feito: "Feito" };
const TASK_MARK = { completed: "feito", done: "feito", in_progress: "fazendo" };

// The pop-out a board card opens: state, checklist and the latest exchanges, without leaving Vorcaro.
export function popHtml(detail, esc = (value) => value, now = Date.now()) {
  const digest = detail.digest;
  const claude = digest.source === "claude";
  const checklist = detail.checklist ?? [];
  const done = checklist.filter((item) => TASK_MARK[item.status] === "feito").length;
  const pct = checklist.length ? Math.round((done / checklist.length) * 100) : 0;
  const meta = [digest.project, digest.ambiente?.name, relativeTime(digest.lastActivity, now), `${digest.turns}${digest.partial ? "+" : ""} pedidos`, !claude && digest.cost >= 0.005 ? `US$ ${digest.cost.toFixed(2)}` : ""].filter(Boolean);
  const tasks = checklist.map((item) => {
    const mark = TASK_MARK[item.status] ?? "aberto";
    return `<li data-mark="${mark}"><i aria-hidden="true"></i><span>${esc(item.text)}</span></li>`;
  }).join("");
  const timeline = (detail.timeline ?? []).map((item) => item.role === "steps"
    ? `<li class="vc-pop-steps">${esc(item.text)}</li>`
    : `<li data-role="${item.role}"><b>${item.role === "user" ? "Você" : "Sessão"}</b><p>${esc(item.text)}</p></li>`).join("");
  const demands = (detail.demands ?? []).map((demand) => `<li><span>${esc(demand.objetivo)}</span><em>${esc(demand.phase)}</em></li>`).join("");
  return `<header class="vc-pop-head">
      <span class="vc-tags">${claude ? `<span class="vc-amb-tag vc-src-tag">Claude Code</span>` : ""}<span class="vc-col-chip" data-col="${esc(digest.column)}">${esc(COLUMN_LABEL[digest.column] ?? digest.column)}</span></span>
      <button type="button" class="icon-btn small" data-pop-close aria-label="Fechar" title="Fechar (Esc)"><svg><use href="#i-x" /></svg></button>
    </header>
    <h3 class="vc-pop-title">${esc(digest.title)}</h3>
    <p class="vc-pop-meta">${meta.map((part) => `<span>${esc(part)}</span>`).join("")}</p>
    ${checklist.length ? `<section class="vc-pop-sec"><h4>Checklist <b>${done}/${checklist.length}</b></h4><div class="vc-progress"><i style="width:${pct}%"></i></div><ul class="vc-pop-tasks">${tasks}</ul></section>` : ""}
    ${demands ? `<section class="vc-pop-sec"><h4>Pedidos do Vorcaro</h4><ul class="vc-pop-demands">${demands}</ul></section>` : ""}
    <section class="vc-pop-sec"><h4>O que aconteceu${detail.partial ? " por último" : ""}</h4>${timeline ? `<ol class="vc-pop-timeline">${timeline}</ol>` : `<p class="vc-empty">Nada registrado ainda.</p>`}</section>
    <footer class="vc-pop-foot">
      <button type="button" class="btn vc-pop-archive" data-pop-archive title="Tira do quadro; não apaga a sessão">Arquivar</button>
      <button type="button" class="btn" data-pop-ask>Perguntar ao Vorcaro</button>
      ${claude ? "" : `<button type="button" class="btn btn-primary" data-pop-open>Abrir a conversa</button>`}
    </footer>`;
}

// A Claude Code log is read, never opened or sent to: the pop-out asks Vorcaro about that session instead.
export function claudeQuestion(digest) {
  return `O que foi feito e o que falta na sessão do Claude Code "${digest.title}"? [fonte: ${digestRef(digest)}]`;
}

// The action as the user left it in the card: target unchanged (folder and conversation are not editable), text fields
// from the form, checklist one item per line.
export function reviewedAction(original, { objetivo, checklist, instrucoes, verificar } = {}) {
  const action = {
    ...original,
    objetivo: String(objetivo ?? original.objetivo).trim().slice(0, 400),
    checklist: String(checklist ?? original.checklist.join("\n")).split(/\r?\n/).map((item) => item.trim()).filter(Boolean).slice(0, 12),
    instrucoes: String(instrucoes ?? original.instrucoes).trim().slice(0, 2000),
  };
  // The verification commands the Studio will run itself (the server keeps only test, lint and build runners).
  if (verificar !== undefined || original.verificar) action.verificar = String(verificar ?? (original.verificar ?? []).join("\n")).split(/\r?\n/).map((item) => item.trim()).filter(Boolean).slice(0, 4);
  return action;
}

// The short reference Vorcaro cites a session by (same hash as digestRef in lib-server/vorcaro.mjs).
export function digestRef(digest) {
  let hash = 5381;
  for (const char of String(digest?.path ?? "")) hash = ((hash * 33) ^ char.charCodeAt(0)) >>> 0;
  return `s${hash.toString(36)}`;
}

// "[fonte: 1a2b3c4d]" in an answer's HTML becomes a button that opens that session; an unknown ref stays a plain chip.
export function citeHtml(html, digests = [], esc = (value) => value) {
  const byRef = new Map(digests.map((digest) => [digestRef(digest), digest]));
  return String(html).replace(/\[fonte:\s*([\w-]{1,12})\]/g, (_, ref) => {
    const digest = byRef.get(ref);
    return digest
      ? `<button type="button" class="vc-cite" data-path="${esc(digest.path)}" data-cwd="${esc(digest.cwd)}"${digest.source === "claude" ? ` data-source="claude" title="Sessão do Claude Code: perguntar ao Vorcaro sobre ela"` : ` title="Abrir a sessão citada"`}>${esc(digest.title)}</button>`
      : `<span class="vc-cite is-unknown" title="Sessão citada fora dos últimos dias">fonte ${esc(ref)}</span>`;
  });
}

const DEMAND_LABELS = { enviado: "enviado", trabalhando: "trabalhando", verificando: "verificando", aguardando: "aguardando você", bloqueado: "bloqueado", parado: "parou sem concluir", concluido: "concluído e verificado", cancelado: "cancelado" };
const BLOCK_LABELS = { credential: "falta uma credencial", needs_input: "precisa de uma resposta sua", decision: "precisa de uma decisão sua", capability: "falta uma ferramenta ou acesso", transient: "erro passageiro", no_progress: "sem progresso", budget: "orçamento esgotado", verify_failed: "a verificação falhou", session_gone: "a sessão foi encerrada" };
const AUDIT_LABELS = { mirror_failed: "espelho falhou (Orca ou GitHub)", dispatched: "pedido enviado", verify_started: "verificação iniciada", verify_result: "verificação", continuation_sent: "continuação enviada", blocked: "parado", done: "concluído e verificado", phase: "mudou de estado" };

// What a sent demand shows: its state in words, when it was sent, the checklist progress of the target session, why it
// stopped (typed block), Vorcaro's own checks, the continuations used and the audit trail.
export function demandView(demand, now = Date.now(), maxContinuations = 2) {
  const progress = demand.progress?.total ? { ...demand.progress, pct: Math.round((demand.progress.done / demand.progress.total) * 100) } : null;
  const block = demand.block?.kind ? { label: BLOCK_LABELS[demand.block.kind] ?? demand.block.kind, question: demand.block.question ?? "" } : null;
  const audit = (demand.audit ?? []).map((event) => ({
    when: relativeTime(event.at, now),
    text: event.type === "verify_result" ? `verificação ${event.data?.ok ? "passou" : "falhou"}` : event.type === "continuation_sent" ? `continuação ${event.data?.attempt ?? ""} de ${maxContinuations}`.replace("  ", " ") : AUDIT_LABELS[event.type] ?? event.type,
    actor: event.actor === "user" ? "você" : "Vorcaro",
  }));
  // Where else the request is seen: Orca's board (a worktree of its own) and the GitHub Project (with the Status it has
  // there now, possibly moved by hand on the phone).
  const mirrors = [demand.orca?.path ? "no Orca" : "", demand.github?.itemId ? `no GitHub${demand.github.status ? `: ${demand.github.status}` : ""}` : ""].filter(Boolean);
  return { label: DEMAND_LABELS[demand.state] ?? demand.state, when: relativeTime(demand.createdAt, now), progress, block, checks: demand.checks ?? [], continuations: Number(demand.continuations) || 0, maxContinuations, audit, mirrors };
}

// The line before each question when the board is filtered (same text as contextLine in lib-server/vorcaro.mjs, which
// the server-side prompt explains to Vorcaro).
export const CONTEXT_PREFIX = "[Contexto do Studio:";
const plain = (value) => String(value ?? "").replace(/\s+/g, " ").trim().replace(/`{3,}/g, "'''").replace(/vorcaro-acao/gi, "vorcaro_acao");
export function contextLine(ambiente) {
  if (!ambiente) return `${CONTEXT_PREFIX} todos os ambientes. Se a pessoa pedir algo para uma sessão, use o ambiente que ela disser; sem ambiente dito, pergunte.]`;
  return `${CONTEXT_PREFIX} ambiente ${plain(ambiente.name)}, pasta ${plain(ambiente.cwd)}. Pedidos novos vão para um projeto dentro dessa pasta, sem perguntar, salvo se a pessoa disser outro ambiente.]`;
}
export const stripContext = (text) => String(text ?? "").replace(/^\[Contexto do Studio:[^\]\n]*\]\s*/, "");

// The four steps a request goes through, with where it is now; a block marks the current step.
const STEPS = [["enviado", "Enviado"], ["trabalhando", "Trabalhando"], ["verificando", "Verificando"], ["concluido", "Feito"]];
export function pipelineSteps(demand) {
  const at = demand.state === "aguardando" || demand.state === "bloqueado" ? (demand.verification ? 2 : 1) : Math.max(0, STEPS.findIndex(([id]) => id === demand.state));
  return STEPS.map(([id, label], index) => ({ id, label, state: index < at || demand.state === "concluido" ? "done" : index === at ? (demand.block ? "blocked" : "current") : "todo" }));
}

// Sessions per ambiente (all ambientes) or per project (one ambiente), split by board column, biggest first.
export function activityRows(columns = [], byAmbiente = true) {
  const rows = new Map();
  for (const column of columns) {
    for (const card of column.cards) {
      const name = byAmbiente ? card.ambiente?.name ?? "Outras pastas" : card.project;
      const row = rows.get(name) ?? { name, total: 0, parts: {} };
      row.total++;
      row.parts[column.id] = (row.parts[column.id] ?? 0) + 1;
      rows.set(name, row);
    }
  }
  return [...rows.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)).slice(0, 8);
}

const BOARD_OPEN_KEY = "pi-studio:vorcaro-quadro";
const CONVERSATION_KEY = "pi-studio:vorcaro-conversa";
const COLUMN_SHORT = { aguardando: "Aguardando", fazendo: "Fazendo", "a-fazer": "A fazer", feito: "Feito" };
const store = {
  get: (key) => { try { return localStorage.getItem(key); } catch { return null; } },
  set: (key, value) => { try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* blocked */ } },
};

// The Vorcaro screen: a full view like any conversation, with the board (Kanban) on the left, collapsed at first, the
// chat in the middle and the work Vorcaro follows on the right. Its conversations are saved PI sessions (server:
// --session-dir), listed under "Conversas" and resumed from their file.
// deps: { els, api, esc, svg, renderMarkdown, report, toast(text, kind), openConversation(path, cwd), isFollowingElsewhere(),
//         show(), hide() }
export function createVorcaro(deps) {
  const { els, api, esc, svg, renderMarkdown } = deps;
  const proposals = new Map();
  let timer = null;
  let board = null;
  let conversations = [];
  let filters = parseFilters(location.search);
  let key = store.get(CONVERSATION_KEY) || newKey();
  const seeded = new Set();
  const boardDigests = () => (board?.columns ?? []).flatMap((column) => column.cards);
  const currentAmbiente = () => (filters.ambiente === "todos" ? null : board?.ambientes?.find((item) => item.id === filters.ambiente) ?? null);
  function newKey() {
    return `vorcaro:new:${Math.random().toString(36).slice(2, 10)}`;
  }

  // The proposal is model-written (and the model may have read third-party text in a log), so the objective, checklist,
  // instructions and verification are editable fields: what is sent is what the user sees and approves.
  function actionHtml(proposed) {
    // A Claude Code log cannot receive a /goal: the brief goes to the project's PI conversation.
    const claude = boardDigests().some((digest) => digest.source === "claude" && digest.path === proposed.sessao);
    const action = claude ? { ...proposed, sessao: "" } : proposed;
    const id = `p${proposals.size + 1}`;
    proposals.set(id, action);
    return `<div class="vc-action" data-proposal="${id}">
      <p class="vc-action-head">${svg("i-send")}<span>Enviar para <strong>${esc(projectName(action.projeto))}</strong>${action.onde === "orca" ? " (worktree nova no Orca, com PI próprio)" : action.sessao ? " (conversa indicada)" : " (sessão principal do projeto)"}</span></p>
      <p class="vc-review">Proposta escrita pelo Vorcaro. Revise e edite antes de enviar.</p>
      <p class="vc-target"><span>Pasta: ${esc(action.projeto)}</span>${action.sessao ? `<span>Conversa: ${esc(action.sessao)}</span>` : ""}</p>
      <label class="vc-field"><span>Objetivo</span><input type="text" data-field="objetivo" maxlength="400" value="${esc(action.objetivo)}" /></label>
      <label class="vc-field"><span>Aceite (um item por linha)</span><textarea data-field="checklist" rows="${Math.min(6, Math.max(2, action.checklist.length))}">${esc(action.checklist.join("\n"))}</textarea></label>
      <label class="vc-field"><span>Instruções</span><textarea data-field="instrucoes" rows="3" maxlength="2000">${esc(action.instrucoes)}</textarea></label>
      <label class="vc-field"><span>Verificação do Vorcaro (um comando por linha)<button type="button" class="info-dot" title="Depois que a sessão disser que terminou, o Studio roda estes comandos na pasta do projeto e só marca feito se passarem. Aceita só testes, lint e build (npm test, node --test, pytest, cargo test); qualquer outro comando é descartado. Se falhar, o Vorcaro manda no máximo duas continuações curtas.">i</button></span><textarea data-field="verificar" rows="2" spellcheck="false">${esc((action.verificar ?? []).join("\n"))}</textarea></label>
      <div class="vc-action-foot"><span>Vai como /goal. O Vorcaro verifica sozinho antes de marcar feito.</span><button type="button" class="btn btn-primary vc-send" data-send="${id}">Enviar para a sessão</button></div>
    </div>`;
  }

  const chat = createSideChat({
    els: { list: els.list, status: els.status, form: els.form, input: els.input, send: els.send, stop: els.stop },
    api, renderMarkdown, esc, svg, report: deps.report,
    path: () => key,
    openUrl: "/api/vorcaro/open",
    persistent: true,
    decorate: (question) => `${contextLine(currentAmbiente())}\n\n${question}`,
    cleanUser: stripContext,
    emptyTitle: "Pergunte sobre tudo o que você está fazendo",
    emptyText: "O Vorcaro conhece as sessões dos últimos 30 dias. Ele organiza, sugere e prepara pedidos; só envia algo para uma sessão quando você clicar.",
    renderAssistant: (text) => splitVorcaroAnswer(text).map((part) => (part.type === "action" ? actionHtml(part.action) : `<div class="md">${citeHtml(renderMarkdown(part.text), boardDigests(), esc)}</div>`)).join(""),
  });

  const filterBar = createFilterBar({
    root: els.filters, esc, svg,
    ambientes: () => board?.ambientes ?? [],
    get: () => filters,
    set(next) {
      filters = next;
      history.replaceState(history.state, "", withFilters(location.href, filters));
      filterBar.render();
      renderContext();
      loadBoard();
    },
  });

  // --- left: the Kanban, collapsed to a rail of counts until clicked
  function boardOpen() {
    return els.boardPane.dataset.open === "true";
  }
  function setBoardOpen(open) {
    els.boardPane.dataset.open = String(open);
    els.boardToggle.setAttribute("aria-expanded", String(open));
    els.boardToggle.title = open ? "Recolher o quadro" : "Abrir o quadro";
    store.set(BOARD_OPEN_KEY, open ? "open" : null);
    renderBoard();
  }

  function cardHtml(digest) {
    const view = cardView(digest);
    const progress = view.progress
      ? `<div class="vc-progress" title="${view.progress.done} de ${view.progress.total} itens feitos"><i style="width:${view.progress.pct}%"></i></div><span class="vc-count">${view.progress.done}/${view.progress.total}</span>`
      : "";
    const tag = filters.ambiente === "todos" && digest.ambiente ? `<span class="vc-amb-tag">${esc(digest.ambiente.name)}</span>` : "";
    const source = view.source ? `<span class="vc-amb-tag vc-src-tag">${esc(view.source)}</span>` : "";
    const tags = tag || source ? `<span class="vc-tags">${tag}${source}</span>` : "";
    return `<button type="button" class="vc-card" data-path="${esc(digest.path)}" data-cwd="${esc(digest.cwd)}"${view.source ? ` data-source="claude"` : ""} title="Ver o que está acontecendo nesta sessão">
      ${tags}<span class="vc-card-title">${esc(view.title)}</span>
      <span class="vc-card-meta"><span>${esc(view.project)}</span><span>${esc(view.when)}</span>${view.cost ? `<span>${esc(view.cost)}</span>` : ""}${view.goal ? `<span class="vc-goal-chip">${esc(view.goal)}</span>` : ""}</span>
      ${view.question ? `<span class="vc-question">${esc(view.question)}</span>` : ""}
      ${progress ? `<span class="vc-progress-row">${progress}</span>` : ""}
      ${view.open.length ? `<span class="vc-open">${view.open.map((item) => `<span>${esc(item)}</span>`).join("")}${view.more ? `<span class="vc-more">mais ${view.more}</span>` : ""}</span>` : ""}
    </button>`;
  }

  function renderBoard() {
    const open = boardOpen();
    els.boardRail.innerHTML = (board?.columns ?? []).map((column) => `<span class="vc-rail-col" data-col="${esc(column.id)}" title="${esc(column.label)}"><b>${column.cards.length}</b><span>${esc(COLUMN_SHORT[column.id] ?? column.label)}</span></span>`).join("");
    if (!open) return;
    if (!board) {
      els.board.innerHTML = `<p class="vc-loading">Lendo as sessões recentes</p>`;
      return;
    }
    els.board.innerHTML = board.columns.map((column) => `<section class="vc-col" data-col="${esc(column.id)}">
        <h4><span>${esc(column.label)}</span><b>${column.cards.length}</b></h4>
        <div class="vc-cards">${column.cards.slice(0, 30).map(cardHtml).join("") || `<p class="vc-empty">Nada aqui no período.</p>`}</div>
      </section>`).join("");
  }

  // --- right: what Vorcaro is driving, in pictures
  function demandHtml(demand) {
    const view = demandView(demand, Date.now(), board?.budget?.maxContinuations ?? 2);
    const steps = pipelineSteps(demand).map((step) => `<li data-step="${step.state}"><i aria-hidden="true"></i><span>${esc(step.label)}</span></li>`).join("");
    const checks = view.checks.length ? `<span class="vc-checks">${view.checks.map((check) => `<span class="vc-check" data-ok="${check.ok}"><i aria-hidden="true"></i><code>${esc(check.command)}</code></span>`).join("")}</span>` : "";
    const used = view.continuations ? `<span class="vc-budget" title="Continuações que o Vorcaro já mandou"><span class="vc-progress"><i style="width:${Math.round((view.continuations / view.maxContinuations) * 100)}%"></i></span>${view.continuations}/${view.maxContinuations} continuações</span>` : "";
    return `<article class="vc-demand" data-state="${esc(demand.state)}">
      <button type="button" class="vc-demand-open"${demand.sessionPath ? ` data-path="${esc(demand.sessionPath)}" data-cwd="${esc(demand.cwd)}"` : " disabled"}>
        <span class="vc-demand-head"><span class="vc-chip" data-state="${esc(demand.state)}">${esc(view.label)}</span>${filters.ambiente === "todos" && demand.ambiente ? `<span class="vc-amb-tag">${esc(demand.ambiente.name)}</span>` : ""}<span>${esc(demand.project)}</span><span>${esc(view.when)}</span></span>
        <span class="vc-demand-goal">${esc(demand.objetivo)}</span>
        <ol class="vc-steps" aria-label="Etapas do pedido">${steps}</ol>
        ${view.block ? `<span class="vc-block"><b>${esc(view.block.label)}</b>${view.block.question ? `<span>${esc(view.block.question)}</span>` : ""}</span>` : ""}
        ${view.progress ? `<span class="vc-progress-row"><span class="vc-progress"><i style="width:${view.progress.pct}%"></i></span><span class="vc-count">${view.progress.done}/${view.progress.total}</span></span>` : ""}
        ${checks}${used}
        ${view.mirrors.length ? `<span class="vc-mirrors">${view.mirrors.map((mirror) => `<span>${esc(mirror)}</span>`).join("")}</span>` : ""}
      </button>
      ${view.audit.length ? `<details class="vc-audit"><summary>Auditoria (${view.audit.length})</summary><ol>${view.audit.map((event) => `<li><span>${esc(event.text)}</span><span>${esc(event.actor)} · ${esc(event.when)}</span></li>`).join("")}</ol></details>` : ""}
    </article>`;
  }

  function renderLive() {
    if (!board) {
      els.live.innerHTML = `<p class="vc-loading">Lendo as sessões recentes</p>`;
      return;
    }
    const total = board.columns.reduce((sum, column) => sum + column.cards.length, 0);
    const bar = board.columns.map((column) => (column.cards.length ? `<i data-col="${esc(column.id)}" style="flex:${column.cards.length}" title="${esc(`${column.label}: ${column.cards.length}`)}"></i>` : "")).join("");
    const legend = board.columns.map((column) => `<button type="button" class="vc-legend" data-open-board data-col="${esc(column.id)}"><i aria-hidden="true"></i><span>${esc(column.label)}</span><b>${column.cards.length}</b></button>`).join("");
    const rows = activityRows(board.columns, filters.ambiente === "todos");
    const max = Math.max(1, ...rows.map((row) => row.total));
    const activity = rows.map((row) => `<div class="vc-act-row"><span class="vc-act-name">${esc(row.name)}</span><span class="vc-act-bar" style="width:${Math.round((row.total / max) * 100)}%">${board.columns.map((column) => (row.parts[column.id] ? `<i data-col="${esc(column.id)}" style="flex:${row.parts[column.id]}"></i>` : "")).join("")}</span><b>${row.total}</b></div>`).join("");
    const demands = board.demands.length ? board.demands.map(demandHtml).join("") : `<p class="vc-empty">Nenhum pedido do Vorcaro no período. Peça algo para uma sessão e ele acompanha aqui até verificar.</p>`;
    const organization = (board.organization ?? []).filter((project) => project.open || project.done).slice(0, 8);
    const projects = organization.map((project) => `<div class="vc-org-row${project.over ? " is-over" : ""}">
        <span class="vc-org-name" title="${esc(project.cwd)}">${esc(project.name)}</span>
        <span class="vc-org-slots" title="${project.open} abertas, até ${MAIN_SESSIONS_PER_PROJECT} por projeto">${Array.from({ length: Math.max(MAIN_SESSIONS_PER_PROJECT, project.open) }, (_, index) => `<i data-state="${index < project.open ? (index < MAIN_SESSIONS_PER_PROJECT ? "main" : "over") : "free"}"></i>`).join("")}</span>
        ${project.done ? `<button type="button" class="vc-org-archive" data-archive="${esc(project.donePaths.join("\n"))}" title="Tira do quadro as ${project.done} sessões concluídas deste projeto (não apaga nada)">arquivar ${project.done}</button>` : `<span></span>`}
      </div>`).join("");
    const changes = (board.changes ?? []).map((change) => `<button type="button" class="vc-change" data-change="${esc(change.path)}" data-to="${esc(change.to)}">
        <i aria-hidden="true"></i><span class="vc-change-title">${esc(change.title)}</span><span class="vc-change-what">${esc(changeLabel(change))}</span>
      </button>`).join("");
    els.live.innerHTML = `
      ${board.seenAt ? `<section class="vc-live-sec vc-news"><h4>Desde a sua última visita<b>${(board.changes ?? []).length}</b></h4>${changes ? `<div class="vc-changes">${changes}</div>` : `<p class="vc-empty">Nada mudou desde ${esc(relativeTime(board.seenAt))}.</p>`}</section>` : ""}
      ${projects ? `<section class="vc-live-sec"><h4>Organização por projeto<button type="button" class="info-dot" title="Cada projeto tem até ${MAIN_SESSIONS_PER_PROJECT} sessões principais abertas; o resto vira subagente ou sessão filha que reporta e fecha. Arquivar tira do quadro, não apaga. Concluídas paradas há dois dias saem sozinhas.${board.archivedCount ? ` ${board.archivedCount} arquivadas até agora.` : ""}">i</button></h4><div class="vc-org">${projects}</div></section>` : ""}
      <section class="vc-live-sec">
        <h4>Sessões no período<b>${total}</b></h4>
        <div class="vc-stack" aria-hidden="true">${bar || "<i></i>"}</div>
        <div class="vc-legends">${legend}</div>
      </section>
      <section class="vc-live-sec">
        <h4>Pedidos que o Vorcaro acompanha<b>${board.demands.length}</b></h4>
        <div class="vc-demand-list">${demands}</div>
      </section>
      ${rows.length ? `<section class="vc-live-sec"><h4>${filters.ambiente === "todos" ? "Atividade por ambiente" : "Atividade por projeto"}</h4><div class="vc-act">${activity}</div></section>` : ""}`;
  }

  async function archive(paths) {
    try {
      await api("/api/vorcaro/archive", { method: "POST", body: JSON.stringify({ paths }) });
      deps.toast(paths.length === 1 ? "Sessão arquivada: saiu do quadro" : `${paths.length} sessões arquivadas: saíram do quadro`);
      loadBoard();
    } catch (error) { deps.report(error); }
  }
  els.live.addEventListener("click", (event) => {
    const button = event.target.closest("[data-archive]");
    if (button) archive(button.dataset.archive.split("\n").filter(Boolean));
    const change = event.target.closest("[data-change]");
    if (change) openPop(change.dataset.change);
  });

  function renderContext() {
    const ambiente = currentAmbiente();
    els.context.innerHTML = ambiente
      ? `${svg("i-folder")}<span>Pedidos vão para <b>${esc(ambiente.name)}</b>, sem precisar dizer.</span>`
      : `${svg("i-folder")}<span>Todos os ambientes: diga no pedido para qual ambiente vai.</span>`;
    els.suggestions.innerHTML = (board?.suggestions ?? []).map((text) => `<span>${esc(text)}</span>`).join("");
    els.suggestions.hidden = !board?.suggestions?.length;
  }

  async function loadBoard() {
    try {
      const query = filtersQuery(filters);
      board = await api(`/api/vorcaro/board${query ? `?${query}` : ""}`);
    } catch (error) {
      deps.report(error);
    }
    filterBar.render();
    renderBoard();
    renderLive();
    renderContext();
  }

  // --- conversations: saved sessions, the last one reopened
  function useConversation(next) {
    key = next;
    store.set(CONVERSATION_KEY, key.startsWith("vorcaro:new:") ? null : key);
    proposals.clear();
    chat.render();
    renderConversations();
    if (!key.startsWith("vorcaro:") && !seeded.has(key)) {
      seeded.add(key);
      api(`/api/vorcaro/conversation?file=${encodeURIComponent(key)}`).then((saved) => chat.seed(key, saved.items)).catch((error) => {
        seeded.delete(key);
        if (/não encontrada/.test(error.message)) useConversation(newKey());
        else deps.report(error);
      });
    }
  }
  function renderConversations() {
    const list = conversations.map((item) => `<button type="button" class="vc-conv${item.file === key ? " is-current" : ""}" data-conv="${esc(item.file)}" role="menuitem"><span>${esc(item.title)}</span><time>${esc(relativeTime(item.updatedAt))}</time></button>`).join("");
    els.historyMenu.innerHTML = `<button type="button" class="vc-conv vc-conv-new" data-conv-new role="menuitem">${svg("i-plus")}<span>Nova conversa com o Vorcaro</span></button>${list || `<p class="vc-empty">As conversas com o Vorcaro ficam salvas e aparecem aqui.</p>`}`;
    const current = conversations.find((item) => item.file === key);
    els.title.textContent = current ? current.title : "Nova conversa";
  }
  async function loadConversations() {
    try {
      conversations = (await api("/api/vorcaro/conversations")).conversations ?? [];
    } catch (error) {
      deps.report(error);
      return;
    }
    // A new conversation that the PI has saved by now continues under its file (so a later reopen resumes it).
    const liveId = chat.sessionIdOf(key);
    const saved = key.startsWith("vorcaro:new:") && liveId ? conversations.find((item) => item.liveSessionId === liveId) : null;
    if (saved) {
      chat.rekey(key, saved.file);
      seeded.add(saved.file);
      key = saved.file;
      store.set(CONVERSATION_KEY, key);
    }
    renderConversations();
  }

  async function sendProposal(id, button) {
    const original = proposals.get(id);
    if (!original) return;
    const card = button.closest(".vc-action");
    const field = (name) => card?.querySelector(`[data-field="${name}"]`)?.value;
    const action = reviewedAction(original, { objetivo: field("objetivo"), checklist: field("checklist"), instrucoes: field("instrucoes"), verificar: field("verificar") });
    if (!action.objetivo) {
      els.notice.textContent = "Escreva o objetivo antes de enviar.";
      return;
    }
    button.disabled = true;
    button.textContent = "Enviando";
    try {
      if (action.sessao) {
        await deps.openConversation(action.sessao, action.projeto);
        if (deps.isFollowingElsewhere()) throw new Error("Essa conversa está rodando em outro lugar (Orca ou outro PI). Envie por lá ou escolha outra.");
      }
      const result = await api("/api/vorcaro/dispatch", { method: "POST", body: JSON.stringify({ action }) });
      button.textContent = "Enviado";
      els.notice.textContent = `Objetivo enviado para ${result.demand.project}.`;
      deps.toast(`Vorcaro enviou o objetivo para ${result.demand.project}`);
      loadBoard();
    } catch (error) {
      button.disabled = false;
      button.textContent = "Enviar para a sessão";
      els.notice.textContent = error.message;
      deps.toast(error.message, "error");
    }
  }

  function askAbout(digest) {
    els.input.value = digest.source === "claude" ? claudeQuestion(digest) : `O que foi feito e o que falta na sessão "${digest.title}"? [fonte: ${digestRef(digest)}]`;
    els.input.dispatchEvent(new Event("input", { bubbles: true }));
    chat.focus();
  }

  function leaveTo(path, cwd, source) {
    if (source === "claude") {
      const digest = boardDigests().find((item) => item.path === path);
      if (digest) askAbout(digest);
      return;
    }
    hide();
    deps.openConversation(path, cwd).catch(deps.report);
  }

  // The card pop-out: one at a time, refreshed with the board while open; Esc closes it before the screen.
  let popPath = null;
  const popOpen = () => !els.pop.hidden;
  function closePop() {
    els.pop.hidden = true;
    popPath = null;
    els.board.querySelector(".vc-card.is-open")?.classList.remove("is-open");
  }
  async function openPop(path) {
    popPath = path;
    els.pop.hidden = false;
    if (!els.pop.innerHTML) els.pop.innerHTML = `<p class="vc-loading">Lendo a sessão</p>`;
    try {
      const detail = await api(`/api/vorcaro/session?path=${encodeURIComponent(path)}`);
      if (popPath !== path) return;
      const tagged = boardDigests().find((item) => item.path === path);
      detail.digest.ambiente = tagged?.ambiente ?? detail.digest.ambiente;
      els.pop.innerHTML = popHtml(detail, esc);
      els.pop.dataset.path = path;
      els.pop.dataset.cwd = detail.digest.cwd;
      for (const card of els.board.querySelectorAll(".vc-card")) card.classList.toggle("is-open", card.dataset.path === path);
    } catch (error) {
      if (popPath === path) els.pop.innerHTML = `<p class="vc-empty">${esc(error.message || "Não deu para ler a sessão.")}</p>`;
    }
  }
  els.pop.addEventListener("click", (event) => {
    if (event.target.closest("[data-pop-close]")) return closePop();
    const digest = boardDigests().find((item) => item.path === els.pop.dataset.path);
    if (event.target.closest("[data-pop-ask]") && digest) { closePop(); askAbout(digest); }
    if (event.target.closest("[data-pop-archive]")) { const { path } = els.pop.dataset; closePop(); archive([path]); }
    if (event.target.closest("[data-pop-open]")) { const { path, cwd } = els.pop.dataset; closePop(); leaveTo(path, cwd); }
  });

  els.list.addEventListener("click", (event) => {
    const button = event.target.closest("[data-send]");
    if (button) sendProposal(button.dataset.send, button);
    const cite = event.target.closest(".vc-cite[data-path]");
    if (cite) leaveTo(cite.dataset.path, cite.dataset.cwd, cite.dataset.source);
  });
  for (const pane of [els.board, els.live]) {
    pane.addEventListener("click", (event) => {
      if (event.target.closest("[data-open-board]")) {
        setBoardOpen(true);
        return;
      }
      const card = event.target.closest(".vc-card[data-path]");
      if (card) return card.dataset.path === popPath ? closePop() : openPop(card.dataset.path);
      const demand = event.target.closest(".vc-demand-open[data-path]");
      if (demand) leaveTo(demand.dataset.path, demand.dataset.cwd);
    });
  }
  els.boardToggle.addEventListener("click", () => setBoardOpen(!boardOpen()));
  els.boardRail.addEventListener("click", () => setBoardOpen(true));
  els.historyBtn.addEventListener("click", () => {
    const open = els.historyMenu.hidden;
    els.historyMenu.hidden = !open;
    els.historyBtn.setAttribute("aria-expanded", String(open));
    if (open) loadConversations();
  });
  els.historyMenu.addEventListener("click", (event) => {
    const item = event.target.closest("[data-conv], [data-conv-new]");
    if (!item) return;
    els.historyMenu.hidden = true;
    els.historyBtn.setAttribute("aria-expanded", "false");
    useConversation(item.dataset.conv ?? newKey());
    chat.focus();
  });
  els.newBtn.addEventListener("click", () => {
    useConversation(newKey());
    chat.focus();
  });
  els.exit.addEventListener("click", () => hide());

  function hide() {
    if (els.view.hidden) return;
    // Leaving the screen is "seen": the next visit lists only what changed after this.
    api("/api/vorcaro/seen", { method: "POST", body: "{}" }).catch(() => {});
    clearInterval(timer);
    timer = null;
    els.historyMenu.hidden = true;
    deps.hide();
  }

  return {
    isOpen: () => !els.view.hidden,
    open({ fresh = false } = {}) {
      els.notice.textContent = "";
      filters = parseFilters(location.search);
      if (els.boardPane.dataset.open === undefined || !els.boardPane.dataset.open) setBoardOpen(store.get(BOARD_OPEN_KEY) === "open");
      deps.show();
      useConversation(fresh ? newKey() : key);
      filterBar.render();
      renderContext();
      loadBoard();
      loadConversations();
      clearInterval(timer);
      timer = setInterval(() => {
        if (document.hidden) return;
        loadBoard();
        loadConversations();
      }, BOARD_POLL_MS);
      requestAnimationFrame(() => chat.focus());
    },
    close: () => (popOpen() ? closePop() : hide()),
    // From outside (the sidebar's Claude Code list): open the screen on that session's pop-out.
    showSession(path) {
      if (els.view.hidden) this.open();
      openPop(path);
    },
  };
}
