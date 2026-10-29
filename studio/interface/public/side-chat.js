// "Dúvidas" Inspector tab: a compact chat with a read-only side PI that knows the open conversation but only answers.
// The decisions (event folding, text, status) live in lib.js; this module owns the DOM, the per-conversation chats and the
// two requests (open the side session, send a command). app.js reaches it through render() and focus().
import { sideChatApply, sideChatAsk, sideChatFail, sideChatInitial, sideChatStatusText } from "./lib.js";

const MAX_CHATS = 6;
const INPUT_MAX_HEIGHT = 140;
const STICK_PX = 40;

// deps: { els: { list, status, form, input, send, stop }, api, renderMarkdown, esc, svg, path() -> open conversation file | null, report(error) }
// Optional (Vorcaro reuses this client): openUrl (route that opens the side session for `path()`), emptyTitle/emptyText,
// renderAssistant(text) -> html of a finished answer (default: markdown).
// Saved conversations (Vorcaro): decorate(question) -> the text actually sent (a context line before it), cleanUser(text) ->
// the question as the person wrote it (the echo of a decorated message), persistent: keep the exchange when the PI stops.
export function createSideChat(deps) {
  const { els, api, renderMarkdown, esc, svg, report } = deps;
  const chats = new Map();
  const itemHtml = new WeakMap();
  let current = null;
  let painted = { key: undefined, model: null, opening: false };

  function chatFor(key) {
    let chat = chats.get(key);
    if (!chat) {
      chat = { key, sessionId: null, source: null, model: sideChatInitial(), opened: false, opening: null, draft: "" };
      chats.set(key, chat);
      // Bounded browser memory and connections: the oldest chat that is not the current one nor answering goes away.
      for (const [oldKey, old] of chats) {
        if (chats.size <= MAX_CHATS) break;
        if (old === chat || old.model.busy) continue;
        old.source?.close();
        chats.delete(oldKey);
      }
    }
    return chat;
  }

  const emptyHtml = (title, text) => `<div class="sc-empty">${svg("i-help")}<strong>${esc(title)}</strong><span>${esc(text)}</span></div>`;

  function messageHtml(item) {
    let html = itemHtml.get(item);
    if (html === undefined) {
      if (item.role === "assistant") html = `<div class="sc-msg sc-assistant">${deps.renderAssistant ? deps.renderAssistant(item.text) : `<div class="md">${renderMarkdown(item.text)}</div>`}</div>`;
      else if (item.role === "error") html = `<div class="sc-msg sc-error" role="alert">${esc(item.text)}</div>`;
      else html = `<div class="sc-msg sc-user${item.confirmed ? "" : " is-pending"}">${esc(item.text)}</div>`;
      itemHtml.set(item, html);
    }
    return html;
  }

  function paint() {
    const model = current?.model ?? null;
    const opening = Boolean(current?.opening);
    if (painted.key === current?.key && painted.model === model && painted.opening === opening) return;
    painted = { key: current?.key, model, opening };
    const list = els.list;
    const stuck = list.scrollHeight - list.scrollTop - list.clientHeight < STICK_PX || list.scrollTop === 0;
    if (!current) {
      list.innerHTML = emptyHtml("Sem conversa aberta", "Abra uma conversa para tirar dúvidas sobre ela.");
    } else if (!model.items.length && !model.live) {
      list.innerHTML = emptyHtml(deps.emptyTitle ?? "Tire dúvidas sobre esta conversa", deps.emptyText ?? "O assistente lê o que está acontecendo, inclusive os subagentes, mas só responde: não altera arquivos nem manda mensagens.");
    } else {
      const live = model.live ? `<div class="sc-msg sc-assistant"><div class="md">${renderMarkdown(model.live)}</div></div>` : "";
      list.innerHTML = model.items.map(messageHtml).join("") + live;
    }
    if (stuck) list.scrollTop = list.scrollHeight;
    const text = model ? sideChatStatusText(model) : "";
    els.status.innerHTML = model?.busy ? `<span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>${esc(text)}` : esc(text);
    els.input.disabled = !current;
    els.send.disabled = !current || opening;
    els.stop.hidden = !model?.busy;
  }

  // The echo of a decorated question shows as the person wrote it, so it matches the pending item.
  function cleanEcho(payload) {
    const message = payload?.message;
    if (!deps.cleanUser || message?.role !== "user") return payload;
    const content = typeof message.content === "string" ? deps.cleanUser(message.content) : Array.isArray(message.content) ? message.content.map((part) => (part?.type === "text" ? { ...part, text: deps.cleanUser(part.text) } : part)) : message.content;
    return { ...payload, message: { ...message, content } };
  }
  function fold(chat, raw) {
    const payload = cleanEcho(raw);
    chat.model = sideChatApply(chat.model, payload);
    if (payload?.type === "process_exit" || payload?.type === "process_error") {
      chat.source?.close();
      chat.source = null;
      chat.sessionId = null;
    }
    if (chat === current) paint();
  }

  function connect(chat, sessionId) {
    const source = new EventSource(`/api/sessions/${encodeURIComponent(sessionId)}/events`);
    Object.assign(chat, { source, sessionId, opened: false });
    // A reconnect replays the whole history: start from nothing so nothing shows twice.
    source.addEventListener("open", () => {
      if (chat.source !== source) return;
      if (chat.opened) chat.model = { ...sideChatInitial(), items: [...(chat.seed ?? [])] };
      chat.opened = true;
    });
    for (const type of ["rpc", "process_exit", "process_error"]) {
      source.addEventListener(type, (event) => {
        if (chat.source !== source) return;
        try {
          fold(chat, JSON.parse(event.data));
        } catch {
          // A malformed frame is ignored; the next ones still apply.
        }
      });
    }
    // CLOSED = the server no longer knows the session (stopped while idle): the next question opens a new one.
    source.addEventListener("error", () => {
      if (chat.source === source && source.readyState === EventSource.CLOSED) fold(chat, { type: "process_exit" });
    });
  }

  async function openSession(chat) {
    paint();
    const { session } = await api(deps.openUrl ?? "/api/side-chat", { method: "POST", body: JSON.stringify({ sessionPath: chat.key }) });
    connect(chat, session.id);
  }

  function ensureSession(chat) {
    if (chat.sessionId) return Promise.resolve();
    chat.opening ??= openSession(chat).finally(() => {
      chat.opening = null;
      paint();
    });
    return chat.opening;
  }

  // The side PI may have been stopped for idleness since the last use: one retry with a fresh session.
  async function send(chat, command) {
    for (let attempt = 0; ; attempt += 1) {
      await ensureSession(chat);
      try {
        await api(`/api/sessions/${encodeURIComponent(chat.sessionId)}/command`, { method: "POST", body: JSON.stringify(command) });
        return;
      } catch (error) {
        if (attempt > 0 || !/Unknown session/.test(error.message)) throw error;
        chat.source?.close();
        Object.assign(chat, { source: null, sessionId: null });
      }
    }
  }

  async function ask(text) {
    const chat = current;
    const question = text.trim();
    if (!chat || !question) return;
    els.input.value = "";
    resizeInput();
    // After an idle stop the new PI knows nothing of the old exchange, so the chat starts over too.
    if (chat.model.ended) chat.model = deps.persistent ? { ...sideChatInitial(), items: chat.model.items } : sideChatInitial();
    chat.model = sideChatAsk(chat.model, question);
    paint();
    try {
      await send(chat, { type: "prompt", message: deps.decorate ? deps.decorate(question) : question });
    } catch (error) {
      chat.model = sideChatFail(chat.model, error.message);
      if (chat === current) paint();
    }
  }

  function resizeInput() {
    els.input.style.height = "auto";
    els.input.style.height = `${Math.min(els.input.scrollHeight, INPUT_MAX_HEIGHT)}px`;
  }

  els.form.addEventListener("submit", (event) => {
    event.preventDefault();
    ask(els.input.value);
  });
  els.input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    els.form.requestSubmit();
  });
  els.input.addEventListener("input", resizeInput);
  els.stop.addEventListener("click", () => {
    if (current?.sessionId) send(current, { type: "abort" }).catch(report);
  });

  return {
    // Shows the chat of the conversation that is open now (switching the draft along with it).
    render() {
      const key = deps.path();
      if (current?.key !== (key ?? undefined)) {
        if (current) current.draft = els.input.value;
        current = key ? chatFor(key) : null;
        els.input.value = current?.draft ?? "";
        resizeInput();
        painted = { key: undefined, model: null, opening: false };
      }
      paint();
    },
    focus() {
      if (!els.input.disabled) els.input.focus();
    },
    // A saved conversation's earlier exchange, shown before anything new (only into a chat that has nothing yet).
    seed(key, items) {
      const chat = chatFor(key);
      if (chat.model.items.length || chat.sessionId) return;
      chat.seed = items.map((item) => ({ role: item.role, text: item.text, confirmed: true }));
      chat.model = { ...sideChatInitial(), items: [...chat.seed] };
      if (chat === current) paint();
    },
    // A new conversation got its saved file: the chat moves to that key, so a later reopen resumes the file.
    rekey(oldKey, newKey) {
      const chat = chats.get(oldKey);
      if (!chat || chats.has(newKey)) return;
      chats.delete(oldKey);
      chat.key = newKey;
      chats.set(newKey, chat);
    },
    sessionIdOf: (key) => chats.get(key)?.sessionId ?? null,
  };
}
