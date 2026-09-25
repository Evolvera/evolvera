const $ = (selector) => document.querySelector(selector);

const els = {
  projects: $("#projectsList"),
  refreshProjects: $("#refreshProjectsBtn"),
  projectEyebrow: $("#projectEyebrow"),
  projectTitle: $("#projectTitle"),
  projectPath: $("#projectPath"),
  runtimePill: $("#runtimePill"),
  dockerHelp: $("#openDockerHelpBtn"),
  dockerDialog: $("#dockerDialog"),
  newSession: $("#newSessionBtn"),
  messages: $("#messages"),
  prompt: $("#promptInput"),
  composer: $("#composer"),
  action: $("#actionBtn"),
  imageInput: $("#imageInput"),
  attachments: $("#attachments"),
  widgetArea: $("#widgetArea"),
  dialog: $("#uiDialog"),
  dialogTitle: $("#uiDialogTitle"),
  dialogBody: $("#uiDialogBody"),
  dialogOk: $("#uiOkBtn"),
  dialogCancel: $("#uiCancelBtn"),
  toasts: $("#toasts"),
};

const state = {
  projects: [],
  history: [],
  currentProject: null,
  currentSession: null,
  activeHistoryPath: "",
  source: null,
  isStreaming: false,
  currentAssistantBubble: null,
  attachments: [],
};

const id = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const text = (value) => String(value ?? "");

function toast(message, type = "info") {
  const item = document.createElement("div");
  item.className = `toast ${type}`;
  item.textContent = message;
  els.toasts.append(item);
  setTimeout(() => item.remove(), 4200);
}

function mutedDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const apiToken = document.querySelector('meta[name="pi-studio-token"]')?.content || "";

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { "content-type": "application/json", "x-pi-studio-token": apiToken, ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function renderProjects() {
  els.projects.replaceChildren();

  for (const project of state.projects) {
    const item = document.createElement("div");
    const active = state.currentProject?.id === project.id;
    item.className = `project-item ${active ? "active" : ""} ${project.activeSessionId ? "running" : ""}`;

    const main = document.createElement("button");
    main.className = "project-main";
    main.type = "button";
    main.innerHTML = `<strong><span class="dot"></span>${text(project.name)}</strong><span>${text(project.cwd)}</span>`;
    main.addEventListener("click", () => openProject(project.id).catch((error) => toast(error.message, "error")));
    item.append(main);

    if (active) {
      const conversation = document.createElement("div");
      conversation.className = "conversation-picker";

      const label = document.createElement("label");
      label.textContent = "Conversa";

      const select = document.createElement("select");
      const current = new Option("Conversa atual", "");
      select.append(current);
      for (const session of state.history) {
        const suffix = mutedDate(session.timestamp);
        select.append(new Option(`${session.title || "Nova conversa"}${suffix ? ` · ${suffix}` : ""}`, session.path));
      }
      select.value = state.activeHistoryPath || "";
      select.addEventListener("click", (event) => event.stopPropagation());
      select.addEventListener("change", () => {
        if (select.value) switchHistory(select.value).catch((error) => toast(error.message, "error"));
        else loadCurrentConversation().catch((error) => toast(error.message, "error"));
      });

      label.append(select);
      conversation.append(label);
      item.append(conversation);
    }

    els.projects.append(item);
  }
}

function updateProjectHeader() {
  const project = state.currentProject;
  els.projectEyebrow.textContent = project ? "Projeto aberto" : "Nenhum projeto selecionado";
  els.projectTitle.textContent = project?.name || "Escolha um projeto";
  els.projectPath.textContent = project?.cwd || "O PI inicia automaticamente quando você abre um projeto.";
}

function clearMessages() {
  state.currentAssistantBubble = null;
  els.messages.innerHTML = `
    <div class="empty-state">
      <div class="empty-orb">π</div>
      <h2>PI pronto dentro do projeto</h2>
      <p>Selecione um projeto na esquerda. As conversas ficam no dropdown do próprio projeto.</p>
    </div>`;
}

function clearEmptyState() {
  const empty = els.messages.querySelector(".empty-state");
  if (empty) empty.remove();
}

function addMessage(role, content, kind = role) {
  clearEmptyState();
  const wrap = document.createElement("article");
  wrap.className = `message ${kind}`;
  const label = document.createElement("div");
  label.className = "role";
  label.textContent = role;
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = content || "";
  wrap.append(label, bubble);
  els.messages.append(wrap);
  requestAnimationFrame(() => {
    els.messages.scrollTop = els.messages.scrollHeight;
  });
  return bubble;
}

function appendAssistant(delta) {
  if (!state.currentAssistantBubble) state.currentAssistantBubble = addMessage("PI", "", "assistant");
  state.currentAssistantBubble.textContent += delta;
  requestAnimationFrame(() => {
    els.messages.scrollTop = els.messages.scrollHeight;
  });
}

function messageText(message) {
  if (!message) return "";
  if (typeof message.content === "string") return message.content;
  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => {
        if (part.type === "text") return part.text || "";
        if (part.type === "toolCall") return `[tool call: ${part.name}]\n${JSON.stringify(part.arguments || {}, null, 2)}`;
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function renderEntries(entries = []) {
  clearMessages();
  for (const entry of entries) {
    const message = entry.message;
    if (!message) continue;
    if (message.role === "user") addMessage("Você", messageText(message), "user");
    else if (message.role === "assistant") addMessage("PI", messageText(message), "assistant");
    else if (message.role === "toolResult") addMessage("tool", `${message.toolName}\n${messageText(message)}`, message.isError ? "error" : "tool");
    else if (message.role === "bashExecution") addMessage("bash", `${message.command}\n${message.output || ""}`, message.exitCode ? "error" : "tool");
    else if (message.role === "custom" && message.display !== false) addMessage("custom", messageText(message), "tool");
  }
}

function setRunning(isRunning) {
  state.isStreaming = Boolean(isRunning);
  els.action.textContent = isRunning ? "■" : "Enviar";
  els.action.setAttribute("aria-label", isRunning ? "Abortar" : "Enviar");
  els.action.classList.toggle("is-abort", isRunning);
}

function handleResponse(event) {
  if (event.command === "get_state" && event.success) {
    setRunning(Boolean(event.data?.isStreaming));
    state.currentSession = { ...(state.currentSession || {}), ...event.data };
  } else if (event.command === "get_entries" && event.success) {
    renderEntries(event.data?.entries || []);
  } else if (event.command === "switch_session" && event.success) {
    sendRpc({ type: "get_entries" }, { silent: true });
  }
}

function handleRpc(event) {
  switch (event.type) {
    case "response":
      handleResponse(event);
      break;
    case "agent_start":
      setRunning(true);
      state.currentAssistantBubble = null;
      break;
    case "agent_end":
      setRunning(false);
      state.currentAssistantBubble = null;
      sendRpc({ type: "get_state" }, { silent: true });
      refreshHistory().catch(() => {});
      break;
    case "message_update": {
      const update = event.assistantMessageEvent;
      if (update?.type === "text_delta" && update.delta) appendAssistant(update.delta);
      break;
    }
    case "message_end":
      state.currentAssistantBubble = null;
      break;
    case "tool_execution_start":
      addMessage("tool", `▶ ${event.toolName}\n${JSON.stringify(event.args || {}, null, 2)}`, "tool");
      break;
    case "tool_execution_end":
      addMessage("tool", `✓ ${event.toolName}${event.isError ? " (error)" : ""}\n${JSON.stringify(event.result || {}, null, 2)}`, event.isError ? "error" : "tool");
      break;
    case "extension_ui_request":
      handleExtensionUi(event);
      break;
  }
}

async function bootstrap() {
  const data = await api("/api/bootstrap");
  state.projects = data.projects || [];
  els.runtimePill.textContent = data.config?.projectRoots?.join(", ") || "workspace";
  renderProjects();

  if (state.projects.length) {
    const last = localStorage.getItem("pi-studio:last-project");
    const target = state.projects.find((project) => project.id === last) || state.projects[0];
    await openProject(target.id);
  }
}

async function refreshProjects() {
  const { projects } = await api("/api/projects");
  state.projects = projects || [];
  renderProjects();
}

async function openProject(projectId) {
  const { project, session, history } = await api(`/api/projects/${encodeURIComponent(projectId)}/open`, { method: "POST", body: "{}" });
  state.currentProject = project;
  state.currentSession = session;
  state.history = history || [];
  state.activeHistoryPath = "";
  localStorage.setItem("pi-studio:last-project", project.id);
  updateProjectHeader();
  renderProjects();
  clearMessages();
  connectProjectEvents(project.id);
  setTimeout(() => sendRpc({ type: "get_state" }, { silent: true }), 100);
  setTimeout(() => sendRpc({ type: "get_entries" }, { silent: true }), 250);
}

function connectProjectEvents(projectId) {
  if (state.source) state.source.close();
  state.source = new EventSource(`/api/projects/${encodeURIComponent(projectId)}/events`);
  state.source.addEventListener("rpc", (event) => handleRpc(JSON.parse(event.data)));
  state.source.addEventListener("stderr", (event) => console.debug("PI stderr", JSON.parse(event.data).text));
  state.source.addEventListener("process_error", (event) => toast(JSON.parse(event.data).message, "error"));
}

async function sendRpc(command, opts = {}) {
  if (!state.currentProject) {
    toast("Escolha um projeto primeiro.", "warning");
    return;
  }
  const payload = { id: id(), ...command };
  await api(`/api/projects/${encodeURIComponent(state.currentProject.id)}/command`, { method: "POST", body: JSON.stringify(payload) });
  if (!opts.silent && payload.type !== "prompt") console.debug("PI RPC", payload);
}

async function submitPrompt(event) {
  event.preventDefault();

  if (state.isStreaming) {
    await sendRpc({ type: "abort" }, { silent: true });
    return;
  }

  const raw = els.prompt.value.trim();
  if (!raw && !state.attachments.length) return;

  addMessage("Você", raw || "[imagem]", "user");
  const images = state.attachments.map(({ data, mimeType }) => ({ type: "image", data, mimeType }));
  await sendRpc({ type: "prompt", message: raw, images });
  els.prompt.value = "";
  state.attachments = [];
  renderAttachments();
  autoResizePrompt();
}

async function refreshHistory() {
  if (!state.currentProject) return;
  const { history } = await api(`/api/projects/${encodeURIComponent(state.currentProject.id)}/history`);
  state.history = history || [];
  renderProjects();
}

async function switchHistory(sessionPath) {
  if (!state.currentProject) return;
  state.activeHistoryPath = sessionPath;
  renderProjects();
  clearMessages();
  await api(`/api/projects/${encodeURIComponent(state.currentProject.id)}/switch`, {
    method: "POST",
    body: JSON.stringify({ sessionPath, id: id() }),
  });
}

async function loadCurrentConversation() {
  state.activeHistoryPath = "";
  renderProjects();
  clearMessages();
  await sendRpc({ type: "get_entries" }, { silent: true });
}

function renderAttachments() {
  els.attachments.replaceChildren();
  for (const item of state.attachments) {
    const pill = document.createElement("span");
    pill.className = "attachment-pill";
    pill.textContent = `${item.name} · ${Math.round(item.bytes / 1024)}KB`;
    els.attachments.append(pill);
  }
}

function fileToImagePayload(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("Erro lendo imagem"));
    reader.onload = () => {
      const result = String(reader.result || "");
      const data = result.includes(",") ? result.split(",", 2)[1] : result;
      resolve({ name: file.name, bytes: file.size, mimeType: file.type || "image/png", data });
    };
    reader.readAsDataURL(file);
  });
}

async function handleImageInput() {
  const files = [...els.imageInput.files].filter((file) => file.type.startsWith("image/"));
  for (const file of files) state.attachments.push(await fileToImagePayload(file));
  els.imageInput.value = "";
  renderAttachments();
}

function handleExtensionUi(req) {
  switch (req.method) {
    case "notify":
      toast(req.message || "PI notification", req.notifyType || "info");
      break;
    case "setStatus":
      break;
    case "setWidget":
      if (req.widgetLines?.length) {
        els.widgetArea.textContent = req.widgetLines.join("\n");
        els.widgetArea.classList.remove("hidden");
      } else {
        els.widgetArea.classList.add("hidden");
      }
      break;
    case "setTitle":
      document.title = req.title || "PI Studio";
      break;
    case "set_editor_text":
      els.prompt.value = req.text || "";
      autoResizePrompt();
      break;
    case "select":
    case "confirm":
    case "input":
    case "editor":
      openUiDialog(req);
      break;
  }
}

function openUiDialog(req) {
  els.dialogTitle.textContent = req.title || "PI precisa de resposta";
  els.dialogBody.replaceChildren();
  let getValue = () => ({});

  if (req.method === "select") {
    const options = document.createElement("div");
    options.className = "dialog-options";
    (req.options || []).forEach((option, index) => {
      const label = document.createElement("label");
      label.className = "dialog-option";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "ui-select";
      input.value = option;
      input.checked = index === 0;
      const span = document.createElement("span");
      span.textContent = option;
      label.append(input, span);
      options.append(label);
    });
    els.dialogBody.append(options);
    getValue = () => ({ value: els.dialogBody.querySelector("input:checked")?.value });
  } else if (req.method === "confirm") {
    const p = document.createElement("p");
    p.textContent = req.message || "Confirmar?";
    els.dialogBody.append(p);
    getValue = () => ({ confirmed: true });
  } else if (req.method === "editor") {
    const input = document.createElement("textarea");
    input.rows = 8;
    input.value = req.prefill || "";
    input.placeholder = req.placeholder || "";
    els.dialogBody.append(input);
    setTimeout(() => input.focus(), 0);
    getValue = () => ({ value: input.value });
  } else {
    const input = document.createElement("input");
    input.value = req.prefill || "";
    input.placeholder = req.placeholder || "";
    els.dialogBody.append(input);
    setTimeout(() => input.focus(), 0);
    getValue = () => ({ value: input.value });
  }

  els.dialogOk.onclick = async (event) => {
    event.preventDefault();
    await sendUiResponse(req.id, getValue());
    els.dialog.close();
  };
  els.dialogCancel.onclick = async (event) => {
    event.preventDefault();
    await sendUiResponse(req.id, { cancelled: true });
    els.dialog.close();
  };
  els.dialog.showModal();
}

async function sendUiResponse(requestId, payload) {
  if (!state.currentProject) return;
  await api(`/api/projects/${encodeURIComponent(state.currentProject.id)}/ui-response`, {
    method: "POST",
    body: JSON.stringify({ id: requestId, ...payload }),
  });
}

async function newSession() {
  state.activeHistoryPath = "";
  await sendRpc({ type: "new_session" });
  clearMessages();
  setTimeout(() => sendRpc({ type: "get_state" }, { silent: true }), 300);
  refreshHistory().catch(() => {});
}

function autoResizePrompt() {
  els.prompt.style.height = "auto";
  els.prompt.style.height = `${Math.min(220, els.prompt.scrollHeight)}px`;
}

els.refreshProjects.addEventListener("click", () => refreshProjects().catch((error) => toast(error.message, "error")));
els.dockerHelp.addEventListener("click", () => els.dockerDialog.showModal());
els.newSession.addEventListener("click", () => newSession().catch((error) => toast(error.message, "error")));
els.composer.addEventListener("submit", (event) => submitPrompt(event).catch((error) => toast(error.message, "error")));
els.prompt.addEventListener("input", autoResizePrompt);
els.prompt.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    els.composer.requestSubmit();
  }
});
els.imageInput.addEventListener("change", () => handleImageInput().catch((error) => toast(error.message, "error")));

bootstrap().catch((error) => toast(error.message, "error"));
