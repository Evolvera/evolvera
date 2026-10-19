// "Tarefas" Inspector tab: one card per task of the open conversation's latest todo snapshot, with its owner, timing and
// the hand-off buttons (parallel subagent, new Orca worktree, message). Pure decisions live in lib.js; this module owns
// the DOM and the few requests, and talks to app.js only through the callbacks given to createTasksPanel.
import {
  loadTaskStamps,
  orcaAgentState,
  parallelPrompt,
  saveTaskStamps,
  stampTaskChanges,
  taskActionStates,
  taskDotState,
  taskRows,
  taskStampsFromMessages,
  taskWorktreeName,
  taskWorktreePrompt,
  tasksBadgeCount,
  terminalSendFeedback,
  worktreeCreateFeedback,
} from "./lib.js";

const STAMPS_KEY = "pi-studio:task-stamps";
const STATUS_ICON = { pending: "i-task-pending", in_progress: "i-task-running", completed: "i-task-done" };
const PHASE_LABEL = { pending: "pendente", in_progress: "em andamento", completed: "concluída" };

// deps: { els: { list, dialog, form, name, prompt, ok }, svg, esc, toast, api, setBadge(count),
//   context() -> { tasks, runs, sessionKey, conversationId, title, projectId, orcaAvailable, projectInOrca, orcaAgents, piBlocked },
//   sendParallel(text), sendSteer(agentId, text), openSubagent(run), openWorktree(path), scrollToEnd(), refreshOrca(), invalidate() }
export function createTasksPanel(deps) {
  const { els, svg, esc, toast } = deps;
  const model = { key: null, stamps: {}, links: [], linksFor: null, linksInflight: false };
  const cache = new Map();
  const openMessage = new Map();
  const creating = new Set();
  let pendingTask = null;

  function stampsFor(key) {
    if (model.key === key) return;
    model.key = key;
    model.stamps = key ? loadTaskStamps(localStorage.getItem(STAMPS_KEY), key) : {};
  }

  // Called whenever the todo snapshot changes. `messages` (when the snapshot came from history) replays real times.
  function observe(tasks, messages = null) {
    const { sessionKey } = deps.context();
    stampsFor(sessionKey);
    if (!tasks) return;
    const base = messages ? taskStampsFromMessages(messages, model.stamps) : model.stamps;
    const next = stampTaskChanges(base, tasks, Date.now());
    if (JSON.stringify(next) === JSON.stringify(model.stamps)) return;
    model.stamps = next;
    if (sessionKey) {
      try {
        localStorage.setItem(STAMPS_KEY, saveTaskStamps(localStorage.getItem(STAMPS_KEY), sessionKey, next));
      } catch {
        // Storage full or unavailable: the stamps just stay in memory.
      }
    }
  }

  function reset() {
    model.key = null;
    model.stamps = {};
    model.links = [];
    model.linksFor = null;
    cache.clear();
    openMessage.clear();
    els.list.replaceChildren();
  }

  function rows(runs) {
    const ctx = deps.context(runs);
    stampsFor(ctx.sessionKey);
    const links = model.linksFor === ctx.conversationId ? model.links : [];
    return { ctx, links, rows: taskRows({ tasks: ctx.tasks || [], stamps: model.stamps, runs: ctx.runs, links, orcaAgents: ctx.orcaAgents, now: Date.now() }) };
  }

  function updateBadge(runs) {
    deps.setBadge(tasksBadgeCount(rows(runs).rows));
  }

  async function refreshLinks() {
    const { conversationId } = deps.context();
    if (!conversationId || model.linksInflight) return;
    model.linksInflight = true;
    try {
      const data = await deps.api(`/api/tasks/links?conversation=${encodeURIComponent(conversationId)}`);
      if (deps.context().conversationId !== conversationId) return;
      const next = Array.isArray(data.links) ? data.links : [];
      const changed = model.linksFor !== conversationId || JSON.stringify(next) !== JSON.stringify(model.links);
      model.links = next;
      model.linksFor = conversationId;
      if (changed) deps.invalidate();
    } catch {
      // The links are an add-on: without them the rows simply show no worktree owner.
    } finally {
      model.linksInflight = false;
    }
  }

  function ownerChip(row) {
    const icon = row.owner.kind === "worktree" ? "i-branch" : row.owner.kind === "main" ? "i-terminal" : "i-agents";
    const body = `${row.owner.kind === "none" ? "" : svg(icon)}<span>${esc(row.owner.label)}</span>`;
    if (row.owner.kind === "subagent" || row.owner.kind === "worktree" || row.owner.kind === "main") {
      const title = row.owner.kind === "subagent" ? "Abrir a conversa do subagente" : row.owner.kind === "worktree" ? "Abrir a conversa da worktree" : "Ir para o fim da conversa";
      return `<button type="button" class="tk-owner" data-owner="${esc(row.owner.kind)}" title="${esc(title)}" aria-label="${esc(`${title}: ${row.owner.label}`)}">${body}</button>`;
    }
    return `<span class="tk-owner${row.owner.kind === "none" ? " is-none" : ""}" title="Responsável">${body}</span>`;
  }

  function actionButton(name, icon, label, state) {
    const title = state.enabled ? label : `${label} — ${state.reason}`;
    return `<button type="button" class="tk-act" data-act="${name}" title="${esc(title)}" aria-label="${esc(title)}" aria-disabled="${!state.enabled}"${name === "message" ? ` aria-expanded="${openMessage.has(name)}"` : ""}>${svg(icon)}</button>`;
  }

  function rowNode(row, states, ctx) {
    const node = document.createElement("article");
    const phase = row.running ? "executando agora" : row.blocked ? "bloqueada" : PHASE_LABEL[row.status] || row.status;
    node.className = `sa-card tk-card${row.running ? " is-running" : ""}${row.status === "completed" ? " is-done" : ""}${row.blocked ? " is-blocked" : ""}`;
    node.dataset.task = String(row.id);
    const task = (ctx.tasks || []).find((item) => item.id === row.id) || {};
    const agent = row.orcaAgent ? `Agente no Orca: ${orcaAgentState(row.orcaAgent).label}` : "";
    const notes = [task.description, agent].filter(Boolean);
    const messageOpen = openMessage.has(row.id);
    const icon = row.blocked ? "i-task-blocked" : row.running ? "i-task-running" : STATUS_ICON[row.status] || "i-task-pending";
    node.innerHTML = `
      <div class="tk-head">
        <span class="tk-ico" data-state="${taskDotState(row)}" aria-hidden="true">${svg(icon)}</span>
        <span class="tk-subject" title="${esc(row.subject)}">${esc(row.subject)}</span>
        <span class="sa-state"><span class="sa-phase">${esc(phase)}</span></span>
      </div>
      <div class="tk-meta">${ownerChip(row)}<span class="tk-time">${esc(row.timing.text)}</span></div>
      ${notes.map((note) => `<p class="tk-note" title="${esc(note)}">${esc(note)}</p>`).join("")}
      <div class="tk-actions">
        ${actionButton("parallel", "i-parallel", "Rodar em paralelo", states.parallel)}
        ${states.worktree.visible ? actionButton("worktree", "i-branch", creating.has(row.id) ? "Criando worktree…" : "Rodar numa worktree", creating.has(row.id) ? { enabled: false, reason: "aguarde" } : states.worktree) : ""}
        ${actionButton("message", "i-msg", "Mensagem", states.message).replace(`aria-expanded="false"`, `aria-expanded="${messageOpen}"`)}
      </div>
      ${messageOpen ? `<form class="tk-msg" data-msg="${row.id}"><input type="text" maxlength="2000" autocomplete="off" aria-label="Mensagem para ${esc(row.owner.label)}" placeholder="${esc(row.owner.kind === "worktree" ? "Mensagem para a worktree" : `Mensagem para ${row.owner.label}`)} · Enter envia · Esc fecha" value="${esc(openMessage.get(row.id).draft)}" /></form>` : ""}`;
    return node;
  }

  function render() {
    const { ctx, links, rows: list } = rows();
    updateBadge();
    const nodes = [];
    const head = cache.get("head") || { node: document.createElement("div"), sig: "" };
    const counts = { running: list.filter((row) => row.running).length, pending: list.filter((row) => row.status === "pending").length, done: list.filter((row) => row.status === "completed").length };
    const headSig = JSON.stringify(counts);
    if (head.sig !== headSig) {
      head.node.className = "sa-summary";
      head.node.innerHTML = list.length
        ? `<p class="sa-counts"><span><b>${counts.running}</b> executando agora</span><span><b>${counts.pending}</b> ${counts.pending === 1 ? "pendente" : "pendentes"}</span><span><b>${counts.done}</b> ${counts.done === 1 ? "concluída" : "concluídas"}</span></p>`
        : "";
      head.sig = headSig;
      cache.set("head", head);
    }
    nodes.push(head.node);
    if (!list.length) {
      const empty = cache.get("empty")?.node || Object.assign(document.createElement("div"), {
        className: "insp-empty",
        innerHTML: `${svg("i-tasks")}<strong>Nenhuma tarefa nesta conversa.</strong><span>Quando o PI montar uma lista de tarefas, cada uma aparece aqui com responsável e tempo.</span>`,
      });
      cache.set("empty", { node: empty, sig: "" });
      nodes.push(empty);
    }
    const seen = new Set(["head", "empty"]);
    for (const row of list) {
      const key = `t${row.id}`;
      seen.add(key);
      const link = links.find((item) => item.taskId === row.id) || null;
      const states = taskActionStates(row, { orcaAvailable: ctx.orcaAvailable, projectInOrca: ctx.projectInOrca, piBlocked: ctx.piBlocked, link });
      const task = (ctx.tasks || []).find((item) => item.id === row.id) || {};
      // The timing text is patched in place below: re-rendering a row would drop a half-typed message.
      const sig = JSON.stringify([{ ...row, timing: undefined }, states, task.description, creating.has(row.id), openMessage.has(row.id)]);
      const cached = cache.get(key);
      if (cached?.sig === sig) {
        const time = cached.node.querySelector(".tk-time");
        if (time && time.textContent !== row.timing.text) time.textContent = row.timing.text;
        nodes.push(cached.node);
        continue;
      }
      const focused = cached?.node.contains(document.activeElement) && document.activeElement.matches?.(".tk-msg input");
      const node = rowNode(row, states, ctx);
      cache.set(key, { node, sig, row, states });
      nodes.push(node);
      if (focused) queueMicrotask(() => node.querySelector(".tk-msg input")?.focus());
    }
    for (const key of cache.keys()) if (!seen.has(key)) cache.delete(key);
    nodes.forEach((node, index) => {
      if (els.list.children[index] !== node) els.list.insertBefore(node, els.list.children[index] || null);
    });
    while (els.list.children.length > nodes.length) els.list.lastElementChild.remove();
  }

  const find = (id) => {
    const { ctx, links, rows: list } = rows();
    const row = list.find((item) => item.id === id);
    return { ctx, link: links.find((item) => item.taskId === id) || null, row, task: (ctx.tasks || []).find((item) => item.id === id) || {} };
  };

  function toggleMessage(id) {
    if (openMessage.has(id)) openMessage.delete(id);
    else openMessage.set(id, { draft: "" });
    deps.invalidate();
    if (openMessage.has(id)) queueMicrotask(() => els.list.querySelector(`.tk-msg[data-msg="${id}"] input`)?.focus());
  }

  async function sendMessage(id, text) {
    const { ctx, row, link } = find(id);
    const target = row && taskActionStates(row, { orcaAvailable: ctx.orcaAvailable, projectInOrca: ctx.projectInOrca, piBlocked: ctx.piBlocked, link }).message.target;
    if (!target) return toast("Esta tarefa não tem para quem enviar a mensagem agora.", "warning");
    const input = els.list.querySelector(`.tk-msg[data-msg="${id}"] input`);
    if (input) input.disabled = true;
    try {
      if (target.kind === "steer") await deps.sendSteer(target.agentId, text);
      else {
        await deps.api("/api/orca/terminal-send", { method: "POST", body: JSON.stringify({ handle: target.handle, text }) });
        toast("Mensagem enviada à worktree.");
      }
      openMessage.delete(id);
    } catch (error) {
      toast(target.kind === "steer" ? error.message : terminalSendFeedback(error), "error");
    } finally {
      deps.invalidate();
      if (target.kind === "worktree") refreshLinks();
    }
  }

  function openWorktreeDialog(id) {
    const { ctx, task } = find(id);
    pendingTask = { id, projectId: ctx.projectId, conversationId: ctx.conversationId };
    els.name.value = taskWorktreeName(task.subject, id);
    els.prompt.value = taskWorktreePrompt(task, ctx.title);
    els.dialog.returnValue = "";
    els.dialog.showModal();
    els.name.select();
  }

  async function createWorktree(request, name, prompt) {
    creating.add(request.id);
    deps.invalidate();
    try {
      const data = await deps.api("/api/orca/worktrees", { method: "POST", body: JSON.stringify({ projectId: request.projectId, conversationId: request.conversationId, taskId: request.id, name, prompt }) });
      const feedback = worktreeCreateFeedback({ data });
      toast(feedback.text, feedback.level === "info" ? "info" : feedback.level);
      if (data.link && model.linksFor === request.conversationId) model.links = [...model.links.filter((item) => item.taskId !== request.id), data.link];
    } catch (error) {
      const feedback = worktreeCreateFeedback({ error });
      toast(feedback.text, feedback.level);
    } finally {
      creating.delete(request.id);
      deps.invalidate();
      refreshLinks();
      deps.refreshOrca();
    }
  }

  els.dialog.addEventListener("close", () => {
    const request = pendingTask;
    pendingTask = null;
    if (els.dialog.returnValue !== "create" || !request) return;
    const name = els.name.value.trim();
    const prompt = els.prompt.value.trim();
    if (!name || !prompt) return;
    createWorktree(request, name, prompt);
  });

  els.list.addEventListener("click", (event) => {
    const card = event.target.closest(".tk-card");
    if (!card) return;
    const id = Number(card.dataset.task);
    const owner = event.target.closest("[data-owner]");
    if (owner) {
      const { row, ctx } = find(id);
      if (owner.dataset.owner === "subagent") deps.openSubagent(ctx.runs.find((run) => run.agentId === row.owner.runId));
      else if (owner.dataset.owner === "worktree") deps.openWorktree(row.owner.worktreePath);
      else deps.scrollToEnd();
      return;
    }
    const button = event.target.closest("[data-act]");
    if (!button) return;
    const { ctx, row, link, task } = find(id);
    const states = taskActionStates(row, { orcaAvailable: ctx.orcaAvailable, projectInOrca: ctx.projectInOrca, piBlocked: ctx.piBlocked, link });
    const state = states[button.dataset.act];
    if (!state.enabled || button.getAttribute("aria-disabled") === "true") return;
    if (button.dataset.act === "parallel") {
      deps.sendParallel(parallelPrompt({ ...task, id: row.id, subject: row.subject }));
    } else if (button.dataset.act === "worktree") openWorktreeDialog(id);
    else toggleMessage(id);
  });

  els.list.addEventListener("input", (event) => {
    const form = event.target.closest(".tk-msg");
    if (form && openMessage.has(Number(form.dataset.msg))) openMessage.get(Number(form.dataset.msg)).draft = event.target.value;
  });

  els.list.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.target.closest(".tk-msg");
    const text = form?.querySelector("input").value.trim();
    if (text) sendMessage(Number(form.dataset.msg), text);
  });

  els.list.addEventListener("keydown", (event) => {
    const form = event.target.closest?.(".tk-msg");
    if (event.key !== "Escape" || !form) return;
    event.stopPropagation();
    toggleMessage(Number(form.dataset.msg));
  });

  return { observe, reset, render, updateBadge, refreshLinks };
}
