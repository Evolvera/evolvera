import {
  INSPECTOR_TABS,
  buildTerminal,
  clampPanelWidth,
  collectSubagents,
  contextBreakdown,
  eventNotice,
  subagentRecords,
  tabKeyTarget,
  setSessionGate,
  waitSessionGate,
  stripAnsi,
  shouldShowToast,
  applyAssistantDelta,
  basename,
  buildTimeline,
  collectOutputs,
  composerAction,
  contextUsage,
  createUiResponder,
  diffLines,
  diffStats,
  entriesToMessages,
  formatElapsed,
  formatTokens,
  greeting,
  isFileChange,
  isLongText,
  modelLabel,
  normalizeModels,
  plural,
  relativeTime,
  reconcileEntries,
  renderMarkdown,
  runningTool,
  samePath,
  shortArgs,
  summarizeTools,
  thinkingLabel,
  timelineSignature,
  timelineTools,
  toolKind,
  toolPath,
  toolResultText,
  truncate,
  updateProcessExitUi,
  upsertMessage,
} from "./lib.js";

const $ = (selector) => document.querySelector(selector);
const els = {
  app: $("#app"),
  menuBtn: $("#menuBtn"),
  toggleLeft: $("#toggleLeftBtn"),
  toggleRight: $("#toggleRightBtn"),
  projectMenuBtn: $("#projectMenuBtn"),
  projectTitle: $("#projectTitle"),
  consoleBtn: $("#consoleBtn"),
  filesBtn: $("#filesBtn"),
  newSession: $("#newSessionBtn"),
  newSessionLabel: $("#newSessionLabel"),
  searchWrap: $("#searchWrap"),
  search: $("#searchInput"),
  searchBtn: $("#searchBtn"),
  settingsBtn: $("#settingsBtn"),
  refreshProjects: $("#refreshProjectsBtn"),
  projects: $("#projectsList"),
  userAvatar: $("#userAvatar"),
  userName: $("#userName"),
  scroller: $("#scroller"),
  thread: $("#thread"),
  jump: $("#jumpBtn"),
  widgetArea: $("#widgetArea"),
  exitBanner: $("#exitBanner"),
  restart: $("#restartBtn"),
  queueArea: $("#queueArea"),
  composer: $("#composer"),
  attachments: $("#attachments"),
  prompt: $("#promptInput"),
  imageInput: $("#imageInput"),
  hint: $("#composerHint"),
  stop: $("#stopBtn"),
  send: $("#sendBtn"),
  modeLabel: $("#modeLabel"),
  statusLine: $("#statusLine"),
  modelBtn: $("#modelBtn"),
  modelName: $("#modelName"),
  thinkingName: $("#thinkingName"),
  ctxRing: $("#ctxRing"),
  ctxRingFill: $("#ctxRingFill"),
  drawer: $("#drawer"),
  logFilter: $("#logFilter"),
  logList: $("#logList"),
  clearLog: $("#clearLogBtn"),
  serverLogs: $("#serverLogsBtn"),
  closeDrawer: $("#closeDrawerBtn"),
  rawForm: $("#rawForm"),
  rawInput: $("#rawInput"),
  panel: $("#panel"),
  panelResizer: $("#panelResizer"),
  tablist: $("#inspectorTabs"),
  tabs: [...document.querySelectorAll("#inspectorTabs [role=tab]")],
  views: [...document.querySelectorAll("#panel [role=tabpanel]")],
  term: $("#term"),
  termJump: $("#termJump"),
  termWidgets: $("#termWidgets"),
  termFoot: $("#termFoot"),
  subList: $("#subList"),
  subBadge: $("#subBadge"),
  ctxView: $("#ctxView"),
  filesView: $("#view-files"),
  envPath: $("#envPath"),
  outputsList: $("#outputsList"),
  confirmDialog: $("#confirmDialog"),
  confirmTitle: $("#confirmTitle"),
  confirmMessage: $("#confirmMessage"),
  confirmOk: $("#confirmOkBtn"),
  scrim: $("#scrim"),
  dialog: $("#uiDialog"),
  dialogTitle: $("#uiDialogTitle"),
  dialogMessage: $("#uiDialogMessage"),
  dialogBody: $("#uiDialogBody"),
  dialogTimer: $("#uiDialogTimer"),
  dialogOk: $("#uiOkBtn"),
  dialogCancel: $("#uiCancelBtn"),
  diffDialog: $("#diffDialog"),
  diffTitle: $("#diffTitle"),
  diffPath: $("#diffPath"),
  diffStats: $("#diffStats"),
  diffBody: $("#diffBody"),
  customizeDialog: $("#customizeDialog"),
  customizeForm: $("#customizeForm"),
  prefName: $("#prefName"),
  prefThinking: $("#prefThinking"),
  prefTools: $("#prefTools"),
  dockerDialog: $("#dockerDialog"),
  menu: $("#menu"),
  toasts: $("#toasts"),
};

const PREFS_KEY = "pi-studio:prefs";
const prefs = { userName: "Miguel", showThinking: false, expandTools: false, left: "open", right: "open" };
try {
  Object.assign(prefs, JSON.parse(localStorage.getItem(PREFS_KEY) || "{}"));
} catch {
  // Corrupt prefs fall back to defaults.
}
const savePrefs = () => localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));

const state = {
  projects: [],
  history: [],
  otherHistory: new Map(),
  expandedProjects: new Set(),
  showAllSessions: false,
  currentProject: null,
  session: null,
  source: null,
  replaying: false,
  isStreaming: false,
  processExited: false,
  sending: false,
  messages: [],
  runtime: new Map(),
  liveMessage: null,
  toolIndex: new Map(),
  outputs: [],
  runStartedAt: 0,
  phase: "thinking",
  liveThinking: "",
  liveThinkingOpen: false,
  attachments: [],
  models: null,
  thinkingLevels: null,
  stats: null,
  statuses: new Map(),
  widgets: new Map(),
  queue: { steering: [], followUp: [] },
  expanded: new Set(),
  pending: new Map(),
  log: [],
  stick: true,
  filter: "",
  uiQueue: [],
  uiActive: null,
  notices: [],
  subagentRecords: new Map(),
  compacting: false,
};

const nodeCache = new Map();
const apiToken = document.querySelector('meta[name="pi-studio-token"]')?.content || "";
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const svg = (name, cls = "") => `<svg class="${cls}" aria-hidden="true"><use href="#${name}"/></svg>`;
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

// ------------------------------------------------------------------ basics

const toastSeen = new Map();

function toast(message, type = "info") {
  if (!shouldShowToast(toastSeen, `${type}:${message}`, Date.now())) return;
  const item = document.createElement("div");
  item.className = `toast ${type}`;
  item.setAttribute("role", type === "error" ? "alert" : "status");
  item.textContent = message;
  els.toasts.append(item);
  setTimeout(() => {
    item.classList.add("leaving");
    setTimeout(() => item.remove(), 220);
  }, 4200);
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { "content-type": "application/json", "x-pi-studio-token": apiToken, ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

const report = (error) => toast(error?.message || String(error), "error");

async function sendRpc(command) {
  if (!state.currentProject) throw new Error("Escolha um projeto primeiro.");
  const payload = { id: newId(), ...command };
  await api(`/api/projects/${encodeURIComponent(state.currentProject.id)}/command`, { method: "POST", body: JSON.stringify(payload) });
  return payload.id;
}

// new_session/switch_session may wait on extension hooks during PI's cold start.
const SESSION_SWITCH_TIMEOUT_MS = 60000;

// Resolves with the RPC `response` event for an id the caller sends itself.
function awaitResponse(id, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      state.pending.delete(id);
      reject(new Error("Sem resposta do PI para a troca de sessão"));
    }, timeoutMs);
    state.pending.set(id, { resolve, reject, timer });
  });
}

function failPending(id, error) {
  const pending = state.pending.get(id);
  if (!pending) return;
  clearTimeout(pending.timer);
  state.pending.delete(id);
  pending.reject(error);
}

// Resolves with the RPC `response` event carrying our id (delivered over SSE).
function rpcRequest(command, timeoutMs = 20000) {
  const id = newId();
  return new Promise((resolve, reject) => {
    const timer = timeoutMs ? setTimeout(() => {
      state.pending.delete(id);
      reject(new Error(`Sem resposta do PI para ${command.type}`));
    }, timeoutMs) : null;
    state.pending.set(id, { resolve, reject, timer });
    sendRpc({ ...command, id }).catch((error) => {
      clearTimeout(timer);
      state.pending.delete(id);
      reject(error);
    });
  });
}

// ------------------------------------------------------------------ layout

// Below these widths the side panels become overlays: they start closed and their
// open/closed state is not persisted (the saved preference is the desktop layout).
const overlayQuery = { left: window.matchMedia("(max-width: 860px)"), right: window.matchMedia("(max-width: 1180px)") };
const layout = {
  left: overlayQuery.left.matches ? "closed" : prefs.left,
  right: overlayQuery.right.matches ? "closed" : prefs.right,
};

function applyLayout() {
  els.app.dataset.left = layout.left;
  els.app.dataset.right = layout.right;
  els.toggleLeft.setAttribute("aria-expanded", String(layout.left === "open"));
  els.toggleRight.setAttribute("aria-expanded", String(layout.right === "open"));
  els.scrim.hidden = !["left", "right"].some((side) => overlayQuery[side].matches && layout[side] === "open");
  if (layout.right === "open") scheduleInspector(inspector.tab);
}

// Inspector (right panel): one persisted tab and width; views render lazily when visible.
const INSPECTOR_TAB_KEY = "pi-studio:inspector-tab";
const INSPECTOR_WIDTH_KEY = "pi-studio:inspector-width";
const TERM_MAX_LINES = 400;
const savedTab = localStorage.getItem(INSPECTOR_TAB_KEY);
const inspector = {
  tab: INSPECTOR_TABS.includes(savedTab) ? savedTab : "terminal",
  width: clampPanelWidth(localStorage.getItem(INSPECTOR_WIDTH_KEY), window.innerWidth),
  dirty: new Set(INSPECTOR_TABS),
  queued: false,
};
const term = { cache: new Map(), stick: true, collapsed: new Set() };
const subOpen = new Set();
const subCache = new Map();
let noticeSeq = 0;

function setPanel(side, open) {
  layout[side] = open ? "open" : "closed";
  if (!overlayQuery[side].matches) {
    prefs[side] = layout[side];
    savePrefs();
  }
  applyLayout();
}

function closeOverlays() {
  for (const side of ["left", "right"]) if (overlayQuery[side].matches) layout[side] = "closed";
  applyLayout();
}

for (const side of ["left", "right"]) {
  overlayQuery[side].addEventListener("change", (event) => {
    layout[side] = event.matches ? "closed" : prefs[side];
    applyLayout();
  });
}

function setDrawer(open, full = false) {
  els.drawer.hidden = !open;
  els.drawer.classList.toggle("full", open && full);
  els.consoleBtn.setAttribute("aria-expanded", String(open));
  if (open) renderLog(true);
}

// -------------------------------------------------------------------- menu

let menuCleanup = null;

function closeMenu() {
  els.menu.hidden = true;
  els.menu.replaceChildren();
  menuCleanup?.();
  menuCleanup = null;
}

// items: { label, sub?, icon?, checked?, disabled?, onSelect } | { section } | { separator: true }
function openMenu(anchor, items, { align = "start", placement = "below" } = {}) {
  closeMenu();
  for (const item of items) {
    if (item.section) {
      const label = document.createElement("div");
      label.className = "menu-section";
      label.textContent = item.section;
      els.menu.append(label);
      continue;
    }
    if (item.separator) {
      els.menu.append(Object.assign(document.createElement("div"), { className: "menu-sep" }));
      continue;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = `menu-item${item.checked ? " checked" : ""}`;
    button.setAttribute("role", item.checked === undefined ? "menuitem" : "menuitemradio");
    if (item.checked !== undefined) button.setAttribute("aria-checked", String(Boolean(item.checked)));
    button.disabled = Boolean(item.disabled);
    button.innerHTML = `${item.icon ? svg(item.icon, "menu-ico") : ""}<span class="menu-label"><span>${esc(item.label)}</span>${item.sub ? `<small>${esc(item.sub)}</small>` : ""}</span>${item.checked ? svg("i-check", "menu-check") : ""}`;
    button.addEventListener("click", () => {
      closeMenu();
      Promise.resolve(item.onSelect?.()).catch(report);
    });
    els.menu.append(button);
  }
  els.menu.hidden = false;
  const rect = anchor.getBoundingClientRect();
  const menuRect = els.menu.getBoundingClientRect();
  let left = align === "end" ? rect.right - menuRect.width : rect.left;
  left = Math.max(8, Math.min(left, window.innerWidth - menuRect.width - 8));
  let top = placement === "above" ? rect.top - menuRect.height - 6 : rect.bottom + 6;
  if (top + menuRect.height > window.innerHeight - 8) top = Math.max(8, rect.top - menuRect.height - 6);
  els.menu.style.left = `${left}px`;
  els.menu.style.top = `${Math.max(8, top)}px`;
  const buttons = () => [...els.menu.querySelectorAll(".menu-item:not(:disabled)")];
  (els.menu.querySelector(".menu-item.checked:not(:disabled)") || buttons()[0])?.focus();
  const onKey = (event) => {
    const list = buttons();
    const index = list.indexOf(document.activeElement);
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu();
      anchor.focus();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const next = event.key === "ArrowDown" ? index + 1 : index - 1;
      list[(next + list.length) % list.length]?.focus();
    } else if (event.key === "Tab") {
      closeMenu();
    }
  };
  const onPointer = (event) => {
    if (!els.menu.contains(event.target) && !anchor.contains(event.target)) closeMenu();
  };
  document.addEventListener("keydown", onKey, true);
  setTimeout(() => document.addEventListener("pointerdown", onPointer, true), 0);
  window.addEventListener("resize", closeMenu, { once: true });
  menuCleanup = () => {
    document.removeEventListener("keydown", onKey, true);
    document.removeEventListener("pointerdown", onPointer, true);
  };
}

// ----------------------------------------------------------------- sidebar

function matchesFilter(...values) {
  const query = state.filter.trim().toLowerCase();
  return !query || values.some((value) => String(value || "").toLowerCase().includes(query));
}

function sessionButton(project, item, active) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `session-item${active ? " active" : ""}`;
  button.dataset.action = "open-session";
  button.dataset.project = project.id;
  button.dataset.path = item.path;
  if (active) button.setAttribute("aria-current", "true");
  button.innerHTML = `<span class="session-title">${esc(item.title || "Nova conversa")}</span><span class="session-time">${esc(relativeTime(item.timestamp))}</span>`;
  button.title = item.title || "Nova conversa";
  return button;
}

function renderProjects() {
  const fragment = document.createDocumentFragment();
  for (const project of state.projects) {
    const active = state.currentProject?.id === project.id;
    const history = active ? state.history : state.otherHistory.get(project.id) || [];
    const sessions = history.filter((item) => matchesFilter(item.title));
    if (!matchesFilter(project.name, project.cwd) && !sessions.length) continue;
    const expanded = active || state.expandedProjects.has(project.id) || Boolean(state.filter && sessions.length);
    const wrap = document.createElement("div");
    wrap.className = `project${active ? " active" : ""}${project.activeSessionId ? " running" : ""}`;
    wrap.setAttribute("role", "listitem");
    wrap.innerHTML = `
      <div class="project-row-wrap">
        <button type="button" class="project-row" data-action="open-project" data-project="${esc(project.id)}" title="${esc(project.cwd)}"${active ? ' aria-current="true"' : ""}>
          ${svg("i-code", "project-ico")}
          <span class="project-name">${esc(project.name)}</span>
          <span class="run-dot" aria-hidden="true"></span>
        </button>
        <button type="button" class="project-chev${expanded ? " open" : ""}" data-action="expand-project" data-project="${esc(project.id)}" aria-label="${expanded ? "Recolher" : "Expandir"} conversas de ${esc(project.name)}" aria-expanded="${expanded}">${svg("i-chevron-right")}</button>
      </div>`;
    if (expanded) {
      const list = document.createElement("div");
      list.className = "sessions";
      const limit = active && state.showAllSessions ? sessions.length : 6;
      const currentFile = active ? state.session?.sessionFile : null;
      sessions.slice(0, limit).forEach((item) => list.append(sessionButton(project, item, samePath(item.path, currentFile))));
      if (!sessions.length) {
        const empty = document.createElement("div");
        empty.className = "sessions-empty";
        empty.textContent = active || state.otherHistory.has(project.id) ? "Nenhuma conversa ainda" : "Carregando…";
        list.append(empty);
      } else if (sessions.length > limit) {
        const more = document.createElement("button");
        more.type = "button";
        more.className = "session-more";
        more.dataset.action = active ? "more-sessions" : "open-project";
        more.dataset.project = project.id;
        more.textContent = `Mostrar mais (${sessions.length - limit})`;
        list.append(more);
      }
      wrap.append(list);
    }
    fragment.append(wrap);
  }
  if (!fragment.childNodes.length) {
    const empty = document.createElement("div");
    empty.className = "sessions-empty pad";
    empty.textContent = state.filter ? "Nada encontrado." : "Nenhum projeto encontrado.";
    fragment.append(empty);
  }
  els.projects.replaceChildren(fragment);
}

async function loadOtherHistory(projectId) {
  if (state.otherHistory.has(projectId)) return;
  const { history } = await api(`/api/projects/${encodeURIComponent(projectId)}/history`);
  state.otherHistory.set(projectId, history || []);
  renderProjects();
}

els.projects.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const { action, project: projectId, path } = target.dataset;
  if (action === "open-project") {
    if (state.currentProject?.id !== projectId) openProject(projectId).catch(report);
  } else if (action === "expand-project") {
    if (state.expandedProjects.has(projectId)) state.expandedProjects.delete(projectId);
    else {
      state.expandedProjects.add(projectId);
      if (state.currentProject?.id !== projectId) loadOtherHistory(projectId).catch(report);
    }
    renderProjects();
  } else if (action === "more-sessions") {
    state.showAllSessions = true;
    renderProjects();
  } else if (action === "open-session") {
    openSession(projectId, path).catch(report);
  }
  if (action !== "expand-project" && action !== "more-sessions") closeOverlays();
});

// ------------------------------------------------------------------ header

function updateHeader() {
  const project = state.currentProject;
  els.projectTitle.textContent = project?.name || "PI Studio";
  document.title = project ? `${project.name} · PI Studio` : "PI Studio";
  els.modeLabel.textContent = project ? `Agente · ${project.name}` : "Agente";
  els.userName.textContent = prefs.userName || "Você";
  els.userAvatar.textContent = (prefs.userName || "?").trim().charAt(0).toUpperCase() || "?";
}

function updateModelButton() {
  const model = state.session?.model;
  els.modelName.textContent = model ? modelLabel(model) : "Modelo";
  const level = state.session?.thinkingLevel;
  els.thinkingName.textContent = model?.reasoning === false || !level ? "" : thinkingLabel(level);
  els.thinkingName.hidden = !els.thinkingName.textContent;
}

// ---------------------------------------------------------------- projects

function resetConversation() {
  state.messages = [];
  state.runtime.clear();
  state.liveMessage = null;
  state.outputs = [];
  state.stats = null;
  state.queue = { steering: [], followUp: [] };
  state.liveThinking = "";
  state.notices = [];
  state.subagentRecords = new Map();
  nodeCache.clear();
  els.thread.replaceChildren();
  state.stick = true;
  term.cache.clear();
  term.collapsed.clear();
  term.stick = true;
  els.term.replaceChildren();
  subOpen.clear();
  subCache.clear();
  scheduleInspector();
}

function setExited(exited) {
  state.processExited = exited;
  if (!exited) {
    els.prompt.disabled = false;
    els.newSessionLabel.textContent = "Nova conversa";
    els.exitBanner.classList.add("hidden");
    updateComposer();
  }
}

async function bootstrap() {
  updateHeader();
  applyLayout();
  renderThread();
  const data = await api("/api/bootstrap");
  state.projects = data.projects || [];
  renderProjects();
  renderPanel();
  if (!state.projects.length) {
    renderThread();
    return;
  }
  const last = localStorage.getItem("pi-studio:last-project");
  const target = state.projects.find((project) => project.id === last) || state.projects[0];
  await openProject(target.id);
}

async function refreshProjects() {
  const { projects } = await api("/api/projects");
  state.projects = projects || [];
  state.otherHistory.clear();
  renderProjects();
  renderPanel();
}

async function openProject(projectId) {
  const { project, session, history } = await api(`/api/projects/${encodeURIComponent(projectId)}/open`, { method: "POST", body: "{}" });
  setExited(false);
  state.currentProject = project;
  state.session = session;
  state.history = history || [];
  state.showAllSessions = false;
  state.models = null;
  state.thinkingLevels = null;
  state.statuses.clear();
  state.widgets.clear();
  renderWidgets();
  setRunning(Boolean(session?.isStreaming));
  localStorage.setItem("pi-studio:last-project", project.id);
  const known = state.projects.find((item) => item.id === project.id);
  if (known) Object.assign(known, { activeSessionId: session?.id || known.activeSessionId });
  else state.projects.unshift(project);
  resetConversation();
  updateHeader();
  updateModelButton();
  renderProjects();
  renderPanel();
  renderThread();
  connectProjectEvents(project.id);
}

async function openSession(projectId, sessionPath) {
  if (state.currentProject?.id !== projectId) await openProject(projectId);
  resetConversation();
  state.session = { ...(state.session || {}), sessionFile: sessionPath };
  updateHeader();
  renderProjects();
  renderThread();
  const id = newId();
  setSessionGate(state, awaitResponse(id, SESSION_SWITCH_TIMEOUT_MS));
  try {
    await api(`/api/projects/${encodeURIComponent(projectId)}/switch`, { method: "POST", body: JSON.stringify({ sessionPath, id }) });
  } catch (error) {
    failPending(id, error);
    throw error;
  }
}

async function refreshHistory() {
  if (!state.currentProject) return;
  const { history } = await api(`/api/projects/${encodeURIComponent(state.currentProject.id)}/history`);
  state.history = history || [];
  renderProjects();
}

async function newSession() {
  const restarting = state.processExited;
  const id = newId();
  setSessionGate(state, awaitResponse(id, SESSION_SWITCH_TIMEOUT_MS));
  try {
    await sendRpc({ type: "new_session", id });
  } catch (error) {
    failPending(id, error);
    throw error;
  }
  if (restarting) {
    setExited(false);
    connectProjectEvents(state.currentProject.id);
  }
  resetConversation();
  state.session = { ...(state.session || {}), sessionFile: null };
  renderThread();
  renderPanel();
  setTimeout(() => refreshState().catch(() => {}), 300);
  refreshHistory().catch(() => {});
}

// --------------------------------------------------------------------- SSE

function connectProjectEvents(projectId) {
  if (state.source) state.source.close();
  const source = new EventSource(`/api/projects/${encodeURIComponent(projectId)}/events`);
  state.source = source;
  state.replaying = true;
  const on = (name, handler) => source.addEventListener(name, (event) => {
    if (state.source !== source) return;
    const payload = JSON.parse(event.data);
    logEvent(name, payload);
    handler(payload);
  });
  on("rpc", (payload) => {
    if (!state.replaying) handleRpc(payload);
  });
  on("replay_done", () => {
    state.replaying = false;
    refreshState().catch(report);
  });
  on("session_ready", () => {});
  on("stdout", () => {});
  on("stderr", () => {});
  on("process_error", (payload) => {
    if (state.replaying) return;
    toast(`Não foi possível executar o PI: ${payload.message}`, "error");
  });
  on("process_exit", (exit) => {
    state.processExited = true;
    setRunning(false);
    updateProcessExitUi(exit, { status: els.exitBanner, prompt: els.prompt, action: els.send, restart: els.newSessionLabel });
    addNotice({ level: exit.code === 0 ? "dim" : "err", text: `■ ${els.exitBanner.textContent}` });
    source.close();
    state.source = null;
    for (const pending of state.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("PI encerrado"));
    }
    state.pending.clear();
  });
  source.onerror = () => {
    if (state.source === source && source.readyState === EventSource.CONNECTING) state.replaying = true;
  };
}

async function refreshState() {
  await sendRpc({ type: "get_state" });
  await sendRpc({ type: "get_entries" });
  refreshStats();
  if (!state.thinkingLevels) {
    rpcRequest({ type: "get_available_thinking_levels" })
      .then((res) => {
        if (res.success && Array.isArray(res.data?.levels)) state.thinkingLevels = res.data.levels;
      })
      .catch(() => {});
  }
}

function refreshStats() {
  rpcRequest({ type: "get_session_stats" })
    .then((res) => {
      state.stats = res.success ? res.data : null;
      renderPanel();
    })
    .catch(() => {
      state.stats = null;
      renderPanel();
    });
}

function handleResponse(event) {
  const pending = state.pending.get(event.id);
  if (pending) {
    clearTimeout(pending.timer);
    state.pending.delete(event.id);
    pending.resolve(event);
  }
  if (!event.success) {
    if (!pending && event.command !== "extension_ui_response") toast(event.error || `Falha em ${event.command}`, "error");
    return;
  }
  switch (event.command) {
    case "get_state":
      state.session = { ...(state.session || {}), ...event.data };
      setRunning(Boolean(event.data?.isStreaming));
      updateModelButton();
      renderProjects();
      renderPanel();
      break;
    case "get_entries":
      if (!Array.isArray(event.data?.entries)) break;
      state.messages = reconcileEntries(entriesToMessages(event.data.entries, event.data.leafId), state.messages);
      state.subagentRecords = subagentRecords(event.data.entries);
      if (state.isStreaming && state.liveMessage && !state.messages.includes(state.liveMessage)) state.messages.push(state.liveMessage);
      for (const [id, tool] of state.runtime) if (tool.status !== "running") state.runtime.delete(id);
      scheduleRender();
      break;
    case "switch_session":
    case "new_session":
      if (event.data?.cancelled) toast("Uma extensão cancelou a troca de sessão.", "warning");
      else {
        sendRpc({ type: "get_state" }).catch(() => {});
        refreshStats();
      }
      break;
    case "set_model":
    case "set_thinking_level":
      sendRpc({ type: "get_state" }).catch(() => {});
      break;
  }
}

function liveAssistant() {
  if (!state.liveMessage) {
    state.liveMessage = { role: "assistant", content: [], timestamp: Date.now() };
    state.messages.push(state.liveMessage);
  }
  return state.liveMessage;
}

function handleRpc(event) {
  switch (event.type) {
    case "response":
      handleResponse(event);
      return;
    case "agent_start":
      setRunning(true);
      state.runStartedAt = Date.now();
      state.phase = "thinking";
      state.liveThinking = "";
      break;
    case "agent_end":
      if (event.willRetry) break;
      setRunning(false);
      state.liveMessage = null;
      sendRpc({ type: "get_entries" }).catch(() => {});
      refreshStats();
      refreshHistory().catch(() => {});
      break;
    case "message_start":
      if (event.message?.role === "assistant") {
        state.liveMessage = { ...event.message, content: Array.isArray(event.message.content) ? [...event.message.content] : [] };
        state.messages.push(state.liveMessage);
        state.phase = "thinking";
      } else upsertMessage(state.messages, event.message);
      break;
    case "message_update": {
      const live = liveAssistant();
      const delta = event.assistantMessageEvent;
      if (Array.isArray(event.message?.content) && event.message.content.length) live.content = event.message.content;
      else applyAssistantDelta(live, delta);
      if (delta?.type === "thinking_delta") {
        state.phase = "thinking";
        state.liveThinking += delta.delta || "";
      } else if (delta?.type === "text_delta") state.phase = "writing";
      break;
    }
    case "message_end":
      if (event.message?.role === "assistant") {
        const index = state.messages.indexOf(state.liveMessage);
        if (index !== -1) state.messages[index] = event.message;
        else state.messages.push(event.message);
        state.liveMessage = null;
        state.liveThinking = "";
      } else upsertMessage(state.messages, event.message);
      break;
    case "tool_execution_start":
      state.runtime.set(event.toolCallId, { name: event.toolName, args: event.args || {}, status: "running", partial: null, result: null, startedAt: Date.now() });
      state.phase = "tool";
      break;
    case "tool_execution_update": {
      const tool = state.runtime.get(event.toolCallId);
      if (tool) tool.partial = event.partialResult;
      break;
    }
    case "tool_execution_end": {
      const tool = state.runtime.get(event.toolCallId) || { name: event.toolName, args: {} };
      state.runtime.set(event.toolCallId, { ...tool, status: event.isError ? "error" : "done", result: event.result });
      state.phase = "thinking";
      break;
    }
    case "queue_update":
      state.queue = { steering: event.steering || [], followUp: event.followUp || [] };
      renderQueue();
      return;
    case "compaction_start":
      state.phase = "compacting";
      addNotice(eventNotice(event));
      break;
    case "compaction_end":
      if (event.errorMessage) toast(`Falha ao compactar: ${event.errorMessage}`, "error");
      state.phase = "thinking";
      addNotice(eventNotice(event));
      refreshStats();
      break;
    case "auto_retry_start":
      state.phase = "retry";
      state.retry = `${event.attempt}/${event.maxAttempts}`;
      addNotice(eventNotice(event));
      break;
    case "auto_retry_end":
      if (!event.success) toast(event.finalError || "Falha após novas tentativas", "error");
      state.phase = "thinking";
      addNotice(eventNotice(event));
      break;
    case "extension_error":
      toast(`Erro de extensão: ${event.error}`, "error");
      addNotice(eventNotice(event));
      return;
    case "extension_ui_request":
      handleExtensionUi(event);
      return;
    default:
      return;
  }
  scheduleRender();
}

// ------------------------------------------------------------------ thread

let renderQueued = false;
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    renderThread();
  });
}

function emptyState() {
  const node = document.createElement("div");
  node.className = "empty";
  const project = state.currentProject;
  node.innerHTML = `
    <h1>${esc(greeting(new Date().getHours(), prefs.userName))}</h1>
    <p>${project ? `${esc(project.name)}` : "Escolha um projeto na barra lateral para começar."}</p>`;
  return node;
}

function renderThread() {
  const items = buildTimeline(state.messages, state.runtime);
  const tools = timelineTools(items);
  state.toolIndex = new Map(tools.map((tool) => [tool.id, tool]));
  state.outputs = collectOutputs(tools);

  const nodes = [];
  if (!items.length && !state.isStreaming) nodes.push(nodeCache.get("empty")?.node || emptyState());
  if (!items.length && !state.isStreaming) nodeCache.set("empty", { node: nodes[0], sig: "" });
  const seen = new Set(["empty"]);
  for (const item of items) {
    const sig = `${timelineSignature(item)}|${isExpanded(item.key) ? 1 : 0}${isExpanded(`think:${item.key}`) ? 1 : 0}`;
    const cached = nodeCache.get(item.key);
    seen.add(item.key);
    if (cached && cached.sig === sig) {
      nodes.push(cached.node);
      continue;
    }
    const node = renderItem(item);
    // Entry animation only on first appearance; re-renders (streaming, toggles) must not flash.
    if (cached) node.classList.add("settled");
    nodeCache.set(item.key, { node, sig });
    nodes.push(node);
  }
  if (state.isStreaming) nodes.push(runStatusNode());
  for (const key of nodeCache.keys()) if (!seen.has(key)) nodeCache.delete(key);

  const stick = state.stick;
  nodes.forEach((node, index) => {
    if (els.thread.children[index] !== node) els.thread.insertBefore(node, els.thread.children[index] || null);
  });
  while (els.thread.children.length > nodes.length) els.thread.lastElementChild.remove();
  els.thread.classList.toggle("is-empty", !items.length && !state.isStreaming);
  updateRunStatus();
  scheduleInspector("terminal", "subagents", "files");
  if (stick) scrollToBottom();
}

function isExpanded(key) {
  if (state.expanded.has(`!${key}`)) return false;
  if (state.expanded.has(key)) return true;
  return key.startsWith("t:") ? prefs.expandTools : key.startsWith("think:") ? prefs.showThinking : false;
}

function toggleExpanded(key) {
  const open = isExpanded(key);
  state.expanded.delete(key);
  state.expanded.delete(`!${key}`);
  state.expanded.add(open ? `!${key}` : key);
  scheduleRender();
}

function thinkingBlock(key, text) {
  const open = isExpanded(`think:${key}`);
  return `<div class="thinking${open ? " open" : ""}">
    <button type="button" class="thinking-toggle" data-action="toggle" data-key="think:${esc(key)}" aria-expanded="${open}">${svg("i-chevron-right", "chev")}<span>Raciocínio</span></button>
    ${open ? `<div class="thinking-text">${esc(text)}</div>` : ""}
  </div>`;
}

function fileCard(tool) {
  const stats = diffStats(tool);
  const filePath = toolPath(tool.args);
  return `<button type="button" class="file-card${tool.isError ? " failed" : ""}" data-action="diff" data-tool="${esc(tool.id)}" title="${esc(filePath)}">
    ${svg("i-file", "file-ico")}<span class="file-name">${esc(basename(filePath))}</span>
    <span class="diff-count"><span class="add">+${stats.added}</span><span class="del">-${stats.removed}</span></span>
  </button>`;
}

function statusIcon(tool) {
  if (tool.status === "running") return svg("i-spinner", "st st-run");
  if (tool.status === "error") return svg("i-alert", "st st-err");
  if (tool.status === "done") return svg("i-check", "st st-ok");
  return '<span class="st st-wait" aria-hidden="true"></span>';
}

function renderItem(item) {
  const node = document.createElement("div");
  node.dataset.key = item.key;
  switch (item.kind) {
    case "user": {
      const long = isLongText(item.text);
      const open = isExpanded(item.key);
      node.className = `msg msg-user${item.optimistic ? " pending" : ""}`;
      const images = item.images.map((image) => `<img src="data:${esc(image.mimeType)};base64,${esc(image.data)}" alt="Imagem anexada" loading="lazy">`).join("");
      node.innerHTML = `<div class="user-card${long && !open ? " collapsed" : ""}">${images ? `<div class="user-images">${images}</div>` : ""}<div class="user-text">${esc(item.text || (images ? "" : "…"))}</div></div>
        ${long ? `<button type="button" class="more-btn" data-action="toggle" data-key="${esc(item.key)}">${open ? "Mostrar menos" : "Mostrar mais"}</button>` : ""}`;
      break;
    }
    case "assistant":
      node.className = "msg msg-assistant";
      node.innerHTML = `${item.thinking ? thinkingBlock(item.key, item.thinking) : ""}<div class="md">${renderMarkdown(item.text)}</div>`;
      break;
    case "thinking":
      node.className = "msg msg-thinking";
      node.innerHTML = thinkingBlock(item.key, item.text);
      break;
    case "tools": {
      const open = isExpanded(item.key);
      const running = runningTool(item.tools);
      node.className = `msg tool-group${open ? " open" : ""}${running ? " running" : ""}`;
      const summary = running ? `${toolVerb(running)} · ${shortArgs(running.name, running.args)}` : summarizeTools(item.tools);
      const files = item.tools.filter(isFileChange);
      node.innerHTML = `${item.thinking ? thinkingBlock(item.key, item.thinking) : ""}
        <button type="button" class="tool-summary" data-action="toggle" data-key="${esc(item.key)}" aria-expanded="${open}">
          ${running ? svg("i-spinner", "chev spin") : svg("i-chevron-right", "chev")}<span>${esc(summary)}</span>
        </button>
        ${open ? `<div class="tool-list">${item.tools.map(toolRow).join("")}</div>` : ""}
        ${files.length ? `<div class="file-cards">${files.map(fileCard).join("")}</div>` : ""}`;
      break;
    }
    case "divider":
      node.className = "msg divider";
      node.innerHTML = `<span>${esc(item.text)}</span>`;
      node.title = item.detail || "";
      break;
    case "error":
      node.className = "msg msg-error";
      node.innerHTML = `${svg("i-alert")}<span>${esc(item.text)}</span>`;
      break;
    case "notice":
      node.className = "msg msg-notice";
      node.textContent = item.text;
      break;
    default:
      node.className = "msg msg-note";
      node.innerHTML = `<div class="md">${renderMarkdown(item.text)}</div>`;
  }
  return node;
}

function toolVerb(tool) {
  return { command: "Executando", edit: "Editando", write: "Criando", read: "Lendo", search: "Buscando" }[toolKind(tool.name)] || `Usando ${tool.name}`;
}

function toolRow(tool) {
  const output = toolResultText(tool.result);
  const args = shortArgs(tool.name, tool.args);
  return `<div class="tool-row ${esc(tool.status)}">
    <div class="tool-head">${statusIcon(tool)}<span class="tool-name">${esc(tool.name)}</span><code class="tool-args">${esc(args)}</code></div>
    ${output ? `<details class="tool-output"${tool.status === "error" ? " open" : ""}><summary>${tool.status === "error" ? "Erro" : "Saída"} · ${plural(output.split("\n").length, "linha", "linhas")}</summary><pre>${esc(truncate(output, 20000))}</pre></details>` : ""}
  </div>`;
}

// The live "••• 1 min 16 s · Pensando" row; reasoning text only on demand.
const runStatus = document.createElement("div");
runStatus.className = "run-status";
runStatus.innerHTML = `<button type="button" class="run-line" data-action="live-thinking" aria-expanded="false">
  <span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>
  <span class="run-elapsed"></span><span class="run-sep" aria-hidden="true">·</span><span class="run-phase"></span>
</button><div class="run-thinking" hidden></div>`;

function runStatusNode() {
  return runStatus;
}

function phaseLabel() {
  if (state.phase === "writing") return "Escrevendo";
  if (state.phase === "compacting") return "Compactando contexto";
  if (state.phase === "retry") return `Tentando novamente (${state.retry || "…"})`;
  if (state.phase === "tool") {
    const tool = [...state.runtime.values()].reverse().find((item) => item.status === "running");
    if (tool) return `${toolVerb(tool)} · ${truncate(shortArgs(tool.name, tool.args), 48)}`;
  }
  return "Pensando";
}

function updateRunStatus() {
  if (!state.isStreaming) return;
  runStatus.querySelector(".run-elapsed").textContent = formatElapsed(Date.now() - (state.runStartedAt || Date.now()));
  runStatus.querySelector(".run-phase").textContent = phaseLabel();
  const panel = runStatus.querySelector(".run-thinking");
  const line = runStatus.querySelector(".run-line");
  const canExpand = Boolean(state.liveThinking.trim());
  line.classList.toggle("expandable", canExpand);
  line.setAttribute("aria-expanded", String(canExpand && state.liveThinkingOpen));
  panel.hidden = !(canExpand && state.liveThinkingOpen);
  if (!panel.hidden) panel.textContent = state.liveThinking.slice(-4000);
}

setInterval(() => {
  updateRunStatus();
  if (layout.right !== "open") return;
  if (inspector.tab === "terminal" && state.isStreaming) renderTermFoot();
  else if (inspector.tab === "subagents" && !els.subBadge.hidden) scheduleInspector("subagents");
}, 1000);

function setRunning(running) {
  const was = state.isStreaming;
  state.isStreaming = Boolean(running);
  if (state.isStreaming && !was && !state.runStartedAt) state.runStartedAt = Date.now();
  if (!state.isStreaming) {
    state.runStartedAt = 0;
    state.liveThinkingOpen = false;
  }
  updateComposer();
  if (was !== state.isStreaming) {
    scheduleRender();
    scheduleInspector("context");
  }
}

function scrollToBottom() {
  els.scroller.scrollTop = els.scroller.scrollHeight;
}

els.scroller.addEventListener("scroll", () => {
  const distance = els.scroller.scrollHeight - els.scroller.scrollTop - els.scroller.clientHeight;
  state.stick = distance < 64;
  els.jump.hidden = state.stick;
}, { passive: true });

els.jump.addEventListener("click", () => {
  els.scroller.scrollTo({ top: els.scroller.scrollHeight, behavior: reduceMotion.matches ? "auto" : "smooth" });
});

els.thread.addEventListener("click", (event) => {
  const copy = event.target.closest("[data-copy]");
  if (copy) {
    const code = copy.closest(".code-block")?.querySelector("code")?.textContent || "";
    navigator.clipboard?.writeText(code).then(() => {
      copy.textContent = "Copiado";
      setTimeout(() => (copy.textContent = "Copiar"), 1400);
    }).catch(() => toast("Não foi possível copiar.", "error"));
    return;
  }
  const target = event.target.closest("[data-action]");
  if (!target) return;
  if (target.dataset.action === "toggle") toggleExpanded(target.dataset.key);
  else if (target.dataset.action === "diff") openDiff([target.dataset.tool]);
  else if (target.dataset.action === "live-thinking" && state.liveThinking.trim()) {
    state.liveThinkingOpen = !state.liveThinkingOpen;
    updateRunStatus();
  }
});

// --------------------------------------------------------------- inspector

function renderPanel() {
  const usage = contextUsage(state.stats);
  els.ctxRing.hidden = !usage;
  if (usage) {
    const circumference = 2 * Math.PI * 7.5;
    els.ctxRingFill.style.strokeDasharray = `${(usage.percent / 100) * circumference} ${circumference}`;
    els.ctxRing.title = `${usage.percent}% do contexto usado`;
    els.ctxRing.classList.toggle("warn", usage.percent >= 80);
  }
  scheduleInspector("terminal", "context", "files");
}

function scheduleInspector(...tabs) {
  for (const tab of tabs.length ? tabs : INSPECTOR_TABS) inspector.dirty.add(tab);
  if (inspector.queued) return;
  inspector.queued = true;
  requestAnimationFrame(() => {
    inspector.queued = false;
    renderInspector();
  });
}

const VIEW_RENDERERS = { terminal: renderTerminal, subagents: renderSubagents, context: renderContext, files: renderFiles };

function renderInspector() {
  updateSubBadge();
  if (layout.right !== "open" || !inspector.dirty.has(inspector.tab)) return;
  inspector.dirty.delete(inspector.tab);
  VIEW_RENDERERS[inspector.tab]();
}

function addNotice(notice) {
  if (!notice) return;
  state.notices.push({ id: ++noticeSeq, at: state.messages.length, ...notice });
  if (state.notices.length > 300) state.notices.shift();
  scheduleInspector("terminal");
}

function selectTab(tab, { focus = false } = {}) {
  inspector.tab = tab;
  localStorage.setItem(INSPECTOR_TAB_KEY, tab);
  for (const button of els.tabs) {
    const active = button.dataset.tab === tab;
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
    if (active && focus) button.focus();
  }
  for (const view of els.views) view.hidden = view.dataset.view !== tab;
  els.panel.dataset.tab = tab;
  if (tab === "context" && state.currentProject && !state.processExited) refreshStats();
  scheduleInspector(tab);
}

els.tablist.addEventListener("click", (event) => {
  const tab = event.target.closest("[role=tab]");
  if (tab) selectTab(tab.dataset.tab);
});
els.tablist.addEventListener("keydown", (event) => {
  const index = els.tabs.findIndex((button) => button.dataset.tab === inspector.tab);
  const target = tabKeyTarget(event.key, index, els.tabs.length);
  if (target === null) return;
  event.preventDefault();
  selectTab(els.tabs[target].dataset.tab, { focus: true });
});

// Width: dragged on the panel's left edge (or arrow keys on the separator); persisted per browser.
function applyPanelWidth() {
  els.app.style.setProperty("--iw", `${inspector.width}px`);
  els.panelResizer.setAttribute("aria-valuenow", String(inspector.width));
  els.panelResizer.setAttribute("aria-valuemax", String(Math.max(320, Math.floor(window.innerWidth * 0.6))));
}

function setPanelWidth(width, persist) {
  inspector.width = clampPanelWidth(width, window.innerWidth);
  applyPanelWidth();
  if (persist) localStorage.setItem(INSPECTOR_WIDTH_KEY, String(inspector.width));
}

els.panelResizer.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || overlayQuery.right.matches) return;
  event.preventDefault();
  const handle = els.panelResizer;
  handle.setPointerCapture(event.pointerId);
  els.app.classList.add("resizing");
  const move = (moveEvent) => setPanelWidth(window.innerWidth - moveEvent.clientX, false);
  const end = () => {
    handle.removeEventListener("pointermove", move);
    handle.removeEventListener("pointerup", end);
    handle.removeEventListener("pointercancel", end);
    els.app.classList.remove("resizing");
    setPanelWidth(inspector.width, true);
  };
  handle.addEventListener("pointermove", move);
  handle.addEventListener("pointerup", end);
  handle.addEventListener("pointercancel", end);
});
els.panelResizer.addEventListener("dblclick", () => setPanelWidth(460, true));
els.panelResizer.addEventListener("keydown", (event) => {
  const step = event.shiftKey ? 64 : 16;
  const next = { ArrowLeft: inspector.width + step, ArrowRight: inspector.width - step, Home: 0.0001, End: window.innerWidth }[event.key];
  if (next === undefined) return;
  event.preventDefault();
  setPanelWidth(next, true);
});
window.addEventListener("resize", () => setPanelWidth(localStorage.getItem(INSPECTOR_WIDTH_KEY) ?? inspector.width, false));

// --- Terminal: read-only mirror of the session, rendered like PI's TUI.

const TERM_STATUS = { running: "em execução", done: "concluído", error: "erro", pending: "aguardando" };
const termEmpty = Object.assign(document.createElement("div"), { className: "term-empty" });
termEmpty.innerHTML = `<span class="tl dim">pi · terminal somente leitura</span><span class="tl dim">Prompts, raciocínio, ferramentas e saídas desta conversa aparecem aqui, como no PI.</span>`;
const termCursor = Object.assign(document.createElement("div"), { className: "term-cursor", ariaHidden: "true" });

function termLineNode(item) {
  const span = document.createElement("span");
  span.className = item.cls ? `tl ${item.cls}` : "tl";
  span.textContent = item.text;
  return span;
}

function termBlockNode(block, open) {
  const node = document.createElement("div");
  node.className = `tb tb-${block.kind}${block.status ? ` is-${block.status}` : ""}`;
  if (block.kind === "thinking") {
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "tb-toggle";
    toggle.dataset.key = block.key;
    toggle.setAttribute("aria-expanded", String(open));
    toggle.textContent = `${open ? "▾" : "▸"} Raciocínio${open ? "" : ` · ${plural(block.lines.length, "linha", "linhas")}`}`;
    node.append(toggle);
    if (!open) return node;
  }
  if (block.head.length) {
    const head = document.createElement("div");
    head.className = "tb-head";
    const glyph = document.createElement("span");
    glyph.className = "tb-glyph";
    glyph.title = TERM_STATUS[block.status] || "";
    const lines = document.createElement("div");
    lines.className = "tb-call";
    lines.append(...block.head.map(termLineNode));
    head.append(glyph, lines);
    node.append(head);
  }
  if (!block.lines.length && !block.hidden) return node;
  const body = block.kind === "tool" ? document.createElement("div") : node;
  if (body !== node) {
    body.className = "tb-body";
    node.append(body);
  }
  if (block.hidden) body.append(termLineNode({ text: `… ${plural(block.hidden, "linha oculta", "linhas ocultas")}`, cls: "meta" }));
  body.append(...block.lines.map(termLineNode));
  return node;
}

function renderTerminal() {
  const blocks = buildTerminal(state.messages, state.runtime, state.notices, TERM_MAX_LINES);
  const nodes = [];
  const seen = new Set();
  for (const block of blocks) {
    const open = !term.collapsed.has(block.key);
    const sig = `${block.sig}|${open ? 1 : 0}`;
    seen.add(block.key);
    const cached = term.cache.get(block.key);
    if (cached?.sig === sig) {
      nodes.push(cached.node);
      continue;
    }
    const node = termBlockNode(block, open);
    term.cache.set(block.key, { node, sig });
    nodes.push(node);
  }
  for (const key of term.cache.keys()) if (!seen.has(key)) term.cache.delete(key);
  if (!blocks.length) nodes.push(termEmpty);
  if (state.isStreaming) nodes.push(termCursor);
  nodes.forEach((node, index) => {
    if (els.term.children[index] !== node) els.term.insertBefore(node, els.term.children[index] || null);
  });
  while (els.term.children.length > nodes.length) els.term.lastElementChild.remove();
  renderTermFoot();
  if (term.stick) els.term.scrollTop = els.term.scrollHeight;
}

function renderTermFoot() {
  const widgets = [...state.widgets.values()].flat();
  els.termWidgets.hidden = !widgets.length;
  els.termWidgets.replaceChildren(...widgets.map((text) => termLineNode({ text, cls: "widget" })));
  const usage = contextUsage(state.stats);
  const model = state.session?.model;
  const status = state.isStreaming
    ? `<span class="tf-live"><i aria-hidden="true"></i>${esc(formatElapsed(Date.now() - (state.runStartedAt || Date.now())))} · ${esc(phaseLabel())}</span>`
    : `<span class="tf-idle">${state.processExited ? "PI encerrado" : state.currentProject ? "pronto" : "sem projeto"}</span>`;
  const statuses = [...state.statuses.values()].join(" · ");
  const right = [model ? modelLabel(model) : "", usage ? `${usage.percent}% ctx` : ""].filter(Boolean).join(" · ");
  els.termFoot.innerHTML = `${status}${statuses ? `<span class="tf-status" title="${esc(statuses)}">${esc(statuses)}</span>` : ""}<span class="meta-spacer"></span><span class="tf-model">${esc(right)}</span>`;
}

els.term.addEventListener("scroll", () => {
  const distance = els.term.scrollHeight - els.term.scrollTop - els.term.clientHeight;
  term.stick = distance < 24;
  els.termJump.hidden = term.stick;
}, { passive: true });
els.termJump.addEventListener("click", () => {
  term.stick = true;
  els.termJump.hidden = true;
  els.term.scrollTo({ top: els.term.scrollHeight, behavior: reduceMotion.matches ? "auto" : "smooth" });
});
els.term.addEventListener("click", (event) => {
  const toggle = event.target.closest(".tb-toggle");
  if (!toggle) return;
  const key = toggle.dataset.key;
  if (term.collapsed.has(key)) term.collapsed.delete(key);
  else term.collapsed.add(key);
  const stick = term.stick;
  term.stick = false;
  renderTerminal();
  term.stick = stick;
  term.cache.get(key)?.node.querySelector(".tb-toggle")?.focus({ preventScroll: true });
});

// --- Subagents: one card per Agent tool call (pi-subagents), live tail + expandable transcript.

const SUB_PHASE = { running: "rodando", done: "concluído", error: "erro" };

function currentSubagents() {
  return collectSubagents(state.messages, state.runtime, state.subagentRecords, Date.now());
}

function updateSubBadge(runs) {
  const running = (runs || currentSubagents()).filter((run) => run.phase === "running").length;
  els.subBadge.hidden = !running;
  els.subBadge.textContent = String(running);
  els.subBadge.title = running ? `${plural(running, "subagente rodando", "subagentes rodando")}` : "";
}

function subCard(run, open) {
  const node = document.createElement("article");
  node.className = `sa-card is-${run.phase}${open ? " open" : ""}`;
  node.dataset.key = run.key;
  const subtitle = run.name && run.type ? run.type : "";
  const meta = [run.model && !run.stats.includes(run.model) ? run.model : "", ...run.stats, run.background ? "segundo plano" : ""].filter(Boolean);
  const sections = run.sections.map((section) => `<section class="sa-sec"><h4>${esc(section.label)}</h4><pre>${esc(truncate(section.text, 60000))}</pre></section>`).join("");
  node.innerHTML = `
    <button type="button" class="sa-head" data-sa="${esc(run.key)}" aria-expanded="${open}">
      <span class="sa-dot" aria-hidden="true"></span>
      <span class="sa-title"><strong>${esc(run.title)}</strong>${subtitle ? `<span class="sa-type">${esc(subtitle)}</span>` : ""}</span>
      <span class="sa-state"><span class="sa-phase">${esc(SUB_PHASE[run.phase])}</span><span class="sa-time">${esc(formatElapsed(run.elapsed))}</span></span>
      ${svg("i-chevron-right", "sa-chev")}
    </button>
    ${run.description ? `<p class="sa-desc">${esc(run.description)}</p>` : ""}
    ${meta.length ? `<p class="sa-meta">${meta.map((item) => `<span>${esc(item)}</span>`).join("")}</p>` : ""}
    ${run.tail.length ? `<div class="sa-tail">${run.tail.map((line) => `<span>${esc(truncate(line, 400))}</span>`).join("")}</div>` : ""}
    ${open ? `<div class="sa-detail">${sections || `<p class="muted">Sem transcrição disponível.</p>`}</div>` : ""}`;
  return node;
}

function renderSubagents() {
  const runs = currentSubagents();
  updateSubBadge(runs);
  const counts = { running: 0, done: 0, error: 0 };
  for (const run of runs) counts[run.phase]++;
  const extension = [state.statuses.get("subagents"), ...[...state.widgets.values()].flat()].filter(Boolean);
  const nodes = [];
  const head = subCache.get("head") || { node: document.createElement("div"), sig: "" };
  const headSig = JSON.stringify([counts, extension, runs.length]);
  if (head.sig !== headSig) {
    head.node.className = "sa-summary";
    head.node.innerHTML = runs.length
      ? `<p class="sa-counts"><span><b>${counts.running}</b> rodando</span><span><b>${counts.done}</b> ${counts.done === 1 ? "concluído" : "concluídos"}</span>${counts.error ? `<span class="bad"><b>${counts.error}</b> com erro</span>` : ""}</p>`
      : "";
    if (extension.length) head.node.innerHTML += `<div class="sa-ext" aria-label="Status da extensão">${extension.map((line) => `<span>${esc(line)}</span>`).join("")}</div>`;
    head.sig = headSig;
    subCache.set("head", head);
  }
  nodes.push(head.node);
  if (!runs.length) {
    const empty = subCache.get("empty")?.node || Object.assign(document.createElement("div"), {
      className: "insp-empty",
      innerHTML: `${svg("i-agents")}<strong>Nenhum subagente nesta conversa.</strong><span>Quando o PI delegar uma tarefa (ferramenta Agent), cada execução aparece aqui com o que está fazendo.</span>`,
    });
    subCache.set("empty", { node: empty, sig: "" });
    nodes.push(empty);
  }
  const seen = new Set(["head", "empty"]);
  for (const run of runs) {
    const open = subOpen.has(run.key);
    const sig = JSON.stringify([run, open, formatElapsed(run.elapsed)]);
    seen.add(run.key);
    const cached = subCache.get(run.key);
    if (cached?.sig === sig) {
      nodes.push(cached.node);
      continue;
    }
    const node = subCard(run, open);
    subCache.set(run.key, { node, sig });
    nodes.push(node);
  }
  for (const key of subCache.keys()) if (!seen.has(key)) subCache.delete(key);
  nodes.forEach((node, index) => {
    if (els.subList.children[index] !== node) els.subList.insertBefore(node, els.subList.children[index] || null);
  });
  while (els.subList.children.length > nodes.length) els.subList.lastElementChild.remove();
}

els.subList.addEventListener("click", (event) => {
  if (event.target.closest(".sa-detail")) return;
  const card = event.target.closest(".sa-card");
  if (!card) return;
  const key = card.dataset.key;
  if (subOpen.has(key)) subOpen.delete(key);
  else subOpen.add(key);
  renderSubagents();
  subCache.get(key)?.node.querySelector(".sa-head")?.focus({ preventScroll: true });
});

// --- Context: usage, token breakdown, model and session; manual compaction.

function renderContext() {
  const data = contextBreakdown(state.stats, state.session);
  const usage = data.usage;
  const windowText = usage?.tokens !== null && usage?.contextWindow ? `${formatTokens(usage.tokens)} / ${formatTokens(usage.contextWindow)} tokens` : "";
  const hero = usage
    ? `<div class="ctx-big"><strong>${usage.percent}<small>%</small></strong><span>da janela de contexto</span></div>
      <div class="progress ctx-progress${usage.percent >= 80 ? " warn" : ""}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${usage.percent}" aria-label="Contexto usado"><span style="width:${usage.percent}%"></span></div>
      <div class="ctx-meta"><span>${esc(windowText)}</span>${data.cost !== null ? `<span>US$ ${data.cost.toFixed(2)}</span>` : ""}</div>`
    : `<div class="ctx-big is-empty"><strong>—</strong><span>${state.currentProject ? "Uso de contexto aparece após a primeira resposta." : "Nenhum projeto aberto."}</span></div>`;
  const row = (label, value, extra = "") => `<div class="kv-row"><dt>${extra}${esc(label)}</dt><dd>${esc(value)}</dd></div>`;
  const tokens = data.parts.length
    ? `<section class="insp-sec"><h3 class="sec-title">Tokens da sessão</h3>
        <div class="stack-bar" aria-hidden="true">${data.parts.map((part, index) => `<span class="seg s${index}" style="flex-grow:${part.share}"></span>`).join("")}</div>
        <dl class="kv">${data.parts.map((part, index) => row(part.label, `${formatTokens(part.value)} · ${Math.round(part.share * 100)}%`, `<i class="sw s${index}" aria-hidden="true"></i>`)).join("")}
        ${data.total !== null ? row("Total", formatTokens(data.total)) : ""}</dl></section>`
    : "";
  const model = data.model
    ? `<section class="insp-sec"><h3 class="sec-title">Modelo</h3><dl class="kv">${row("Modelo", data.model)}${data.provider ? row("Provedor", data.provider) : ""}${data.thinking ? row("Raciocínio", data.thinking) : ""}</dl></section>`
    : "";
  const counts = data.counts.length
    ? `<section class="insp-sec"><h3 class="sec-title">Conversa</h3><dl class="kv">${data.counts.map((item) => row(item.label, String(item.value))).join("")}</dl></section>`
    : "";
  const file = data.sessionFile
    ? `<section class="insp-sec"><h3 class="sec-title">Arquivo da sessão</h3><div class="path-row"><code title="${esc(data.sessionFile)}">&lrm;${esc(data.sessionFile)}&lrm;</code><button type="button" class="icon-btn small" data-copy-session aria-label="Copiar caminho da sessão">${svg("i-copy")}</button></div></section>`
    : "";
  const blocked = !state.currentProject || state.processExited || state.isStreaming || state.compacting;
  const hint = state.compacting ? "Compactando… isso pode levar alguns instantes." : state.isStreaming ? "Disponível quando o PI terminar a resposta atual." : "Resume o histórico para liberar espaço na janela de contexto.";
  const compact = `<section class="insp-sec ctx-actions"><button type="button" class="btn btn-block" data-compact${blocked ? " disabled" : ""}${state.compacting ? ' aria-busy="true"' : ""}>${state.compacting ? `${svg("i-spinner", "spin")}Compactando…` : "Compactar agora"}</button><p class="sec-hint">${esc(hint)}</p></section>`;
  const focused = document.activeElement?.closest?.("[data-compact]") ? "[data-compact]" : document.activeElement?.closest?.("[data-copy-session]") ? "[data-copy-session]" : "";
  els.ctxView.innerHTML = `<section class="insp-sec ctx-hero">${hero}</section>${tokens}${model}${counts}${file}${compact}`;
  if (focused) els.ctxView.querySelector(focused)?.focus();
}

function confirmDialog({ title, message, confirm }) {
  els.confirmTitle.textContent = title;
  els.confirmMessage.textContent = message;
  els.confirmOk.textContent = confirm;
  els.confirmDialog.returnValue = "";
  els.confirmDialog.showModal();
  return new Promise((resolve) => {
    els.confirmDialog.addEventListener("close", () => resolve(els.confirmDialog.returnValue === "ok"), { once: true });
  });
}

async function compactNow() {
  if (state.compacting || !state.currentProject || state.isStreaming) return;
  const ok = await confirmDialog({
    title: "Compactar o contexto agora?",
    message: "O PI resume o histórico desta conversa e passa a enviar o resumo ao modelo no lugar das mensagens antigas. As mensagens continuam salvas na sessão.",
    confirm: "Compactar",
  });
  if (!ok) return;
  state.compacting = true;
  scheduleInspector("context");
  try {
    // Compaction calls the model and can take a while: no client-side timeout.
    const res = await rpcRequest({ type: "compact" }, 0);
    if (!res.success) throw new Error(res.error || "Não foi possível compactar o contexto.");
    toast("Contexto compactado.");
  } catch (error) {
    report(error);
  } finally {
    state.compacting = false;
    scheduleInspector("context");
    if (!state.processExited) {
      refreshStats();
      sendRpc({ type: "get_entries" }).catch(() => {});
    }
  }
}

els.ctxView.addEventListener("click", (event) => {
  if (event.target.closest("[data-compact]")) {
    compactNow().catch(report);
  } else if (event.target.closest("[data-copy-session]")) {
    const file = contextBreakdown(state.stats, state.session).sessionFile;
    navigator.clipboard?.writeText(file).then(() => toast("Caminho da sessão copiado.")).catch(() => toast("Não foi possível copiar.", "error"));
  }
});

// --- Files: project path + files written/edited in this session.

function renderFiles() {
  const project = state.currentProject;
  els.envPath.innerHTML = project
    ? `<div class="path-row"><code title="${esc(project.cwd)}">&lrm;${esc(project.cwd)}&lrm;</code><button type="button" class="icon-btn small" data-copy-path aria-label="Copiar caminho do projeto">${svg("i-copy")}</button></div>`
    : `<p class="muted">Nenhum projeto aberto.</p>`;
  renderOutputs();
}

function renderOutputs() {
  const outputs = state.outputs;
  if (!outputs.length) {
    els.outputsList.innerHTML = `<p class="muted">Arquivos criados ou editados nesta conversa aparecem aqui.</p>`;
    return;
  }
  els.outputsList.innerHTML = outputs.map((item) => `<button type="button" class="output-item" data-tools="${esc(item.toolIds.join(","))}" title="${esc(item.path)}">
      ${svg("i-file", "file-ico")}<span class="output-text"><span class="output-name">${esc(item.name)}</span><small>${esc(item.kind === "write" ? "criado" : "editado")} · ${esc(item.path)}</small></span>
      <span class="diff-count"><span class="add">+${item.added}</span><span class="del">-${item.removed}</span></span>
    </button>`).join("");
}

els.envPath.addEventListener("click", (event) => {
  if (!event.target.closest("[data-copy-path]") || !state.currentProject) return;
  navigator.clipboard?.writeText(state.currentProject.cwd).then(() => toast("Caminho copiado.")).catch(() => {});
});
els.outputsList.addEventListener("click", (event) => {
  const target = event.target.closest("[data-tools]");
  if (target) openDiff(target.dataset.tools.split(","));
});

function openDiff(toolIds) {
  const tools = toolIds.map((id) => state.toolIndex.get(id)).filter(Boolean);
  if (!tools.length) return;
  const filePath = toolPath(tools[0].args) || tools[0].name;
  const totals = tools.reduce((acc, tool) => {
    const stats = diffStats(tool);
    return { added: acc.added + stats.added, removed: acc.removed + stats.removed };
  }, { added: 0, removed: 0 });
  els.diffTitle.textContent = basename(filePath);
  els.diffPath.textContent = filePath;
  els.diffStats.innerHTML = `<span class="add">+${totals.added}</span><span class="del">-${totals.removed}</span>`;
  const fragment = document.createDocumentFragment();
  tools.forEach((tool, index) => {
    if (index) fragment.append(Object.assign(document.createElement("div"), { className: "diff-sep", textContent: "…" }));
    const pre = document.createElement("pre");
    pre.className = "diff";
    for (const line of diffLines(tool)) {
      const row = document.createElement("span");
      row.className = `dl ${line.type}`;
      row.textContent = line.text;
      pre.append(row);
    }
    fragment.append(pre);
  });
  els.diffBody.replaceChildren(fragment);
  els.diffDialog.showModal();
}

// ---------------------------------------------------------------- composer

function updateComposer() {
  const hasContent = Boolean(els.prompt.value.trim() || state.attachments.length);
  els.send.disabled = state.processExited || state.sending || !hasContent || !state.currentProject;
  els.stop.hidden = !state.isStreaming;
  els.send.classList.toggle("is-queue", state.isStreaming);
  els.send.setAttribute("aria-label", state.isStreaming ? "Direcionar (steer)" : "Enviar");
  els.hint.textContent = state.isStreaming ? "Enter direciona · Ctrl+Enter enfileira" : "";
  els.prompt.disabled = state.processExited;
}

function autoResize() {
  els.prompt.style.height = "auto";
  els.prompt.style.height = `${Math.min(260, els.prompt.scrollHeight)}px`;
}

function renderAttachments() {
  els.attachments.replaceChildren(...state.attachments.map((item, index) => {
    const chip = document.createElement("div");
    chip.className = "attachment";
    chip.innerHTML = `<img src="data:${esc(item.mimeType)};base64,${esc(item.data)}" alt=""><span>${esc(truncate(item.name, 24))}</span><button type="button" class="icon-btn small" aria-label="Remover ${esc(item.name)}" data-index="${index}">${svg("i-x")}</button>`;
    return chip;
  }));
  els.attachments.hidden = !state.attachments.length;
  updateComposer();
}

els.attachments.addEventListener("click", (event) => {
  const button = event.target.closest("[data-index]");
  if (!button) return;
  state.attachments.splice(Number(button.dataset.index), 1);
  renderAttachments();
});

function fileToImagePayload(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("Erro lendo imagem"));
    reader.onload = () => {
      const result = String(reader.result || "");
      const data = result.includes(",") ? result.split(",", 2)[1] : result;
      resolve({ name: file.name || "imagem", bytes: file.size, mimeType: file.type || "image/png", data });
    };
    reader.readAsDataURL(file);
  });
}

async function addImages(files) {
  for (const file of [...files].filter((item) => item.type.startsWith("image/"))) state.attachments.push(await fileToImagePayload(file));
  renderAttachments();
}

async function submit(mode) {
  if (state.processExited || state.sending || !state.currentProject) return;
  if (state.gate) {
    // Hold the text in the composer until PI finishes switching sessions, then send it.
    state.sending = true;
    updateComposer();
    try {
      await waitSessionGate(state);
    } finally {
      state.sending = false;
      updateComposer();
    }
    if (state.processExited || !state.currentProject) return;
  }
  const message = els.prompt.value.trim();
  if (!message && !state.attachments.length) return;
  const type = mode === "steer" || mode === "follow_up" ? mode : "prompt";
  const images = state.attachments.map(({ data, mimeType }) => ({ type: "image", data, mimeType }));
  let optimistic = null;
  if (type === "prompt") {
    optimistic = { role: "user", content: [{ type: "text", text: message }, ...images], timestamp: Date.now(), _optimistic: true };
    state.messages.push(optimistic);
    state.stick = true;
    scheduleRender();
  }
  state.sending = true;
  updateComposer();
  const failed = (text) => {
    const index = state.messages.indexOf(optimistic);
    if (index !== -1) state.messages.splice(index, 1);
    scheduleRender();
    toast(text, "error");
    if (!els.prompt.value) {
      els.prompt.value = message;
      autoResize();
      updateComposer();
    }
  };
  // The response may arrive only after an extension command finishes, so no timeout.
  const request = rpcRequest({ type, message, ...(images.length ? { images } : {}) }, 0);
  els.prompt.value = "";
  state.attachments = [];
  renderAttachments();
  autoResize();
  state.sending = false;
  updateComposer();
  request.then((res) => {
    if (!res.success) return failed(res.error || "O PI recusou a mensagem.");
    if (type === "steer") toast("Mensagem direcionada ao PI.");
    if (type === "follow_up") toast("Mensagem adicionada à fila.");
  }, (error) => failed(error.message));
}

els.composer.addEventListener("submit", (event) => {
  event.preventDefault();
  submit(state.isStreaming ? "steer" : "prompt");
});
els.prompt.addEventListener("keydown", (event) => {
  const action = composerAction(event, state.isStreaming);
  if (!action || action === "newline") return;
  event.preventDefault();
  submit(action);
});
els.prompt.addEventListener("input", () => {
  autoResize();
  updateComposer();
});
els.prompt.addEventListener("paste", (event) => {
  const files = [...(event.clipboardData?.files || [])].filter((file) => file.type.startsWith("image/"));
  if (!files.length) return;
  event.preventDefault();
  addImages(files).catch(report);
});
els.composer.addEventListener("dragover", (event) => {
  if ([...(event.dataTransfer?.items || [])].some((item) => item.type.startsWith("image/"))) {
    event.preventDefault();
    els.composer.classList.add("drop");
  }
});
els.composer.addEventListener("dragleave", () => els.composer.classList.remove("drop"));
els.composer.addEventListener("drop", (event) => {
  els.composer.classList.remove("drop");
  if (!event.dataTransfer?.files?.length) return;
  event.preventDefault();
  addImages(event.dataTransfer.files).catch(report);
});
els.imageInput.addEventListener("change", () => {
  addImages(els.imageInput.files).catch(report).finally(() => (els.imageInput.value = ""));
});
els.stop.addEventListener("click", () => sendRpc({ type: "abort" }).catch(report));

function renderQueue() {
  const items = [...state.queue.steering.map((text) => ["Direcionada", text]), ...state.queue.followUp.map((text) => ["Na fila", text])];
  els.queueArea.hidden = !items.length;
  els.queueArea.innerHTML = items.map(([label, text]) => `<div class="queue-item"><span>${esc(label)}</span>${esc(truncate(text, 140))}</div>`).join("");
}

function renderWidgets() {
  const lines = [...state.widgets.values()].flat();
  els.widgetArea.textContent = lines.join("\n");
  els.widgetArea.classList.toggle("hidden", !lines.length);
  els.statusLine.textContent = [...state.statuses.values()].join(" · ");
  scheduleInspector("terminal", "subagents");
}

// ------------------------------------------------------------- model menu

async function openModelMenu() {
  if (!state.currentProject) return;
  const loadingItems = [{ section: "Modelo" }, { label: "Carregando modelos…", disabled: true }];
  if (!state.models) {
    openMenu(els.modelBtn, loadingItems, { align: "end", placement: "above" });
    try {
      const res = await rpcRequest({ type: "get_available_models" });
      state.models = res.success ? normalizeModels(res.data) : [];
    } catch {
      state.models = [];
    }
    if (els.menu.hidden) return;
  }
  if (!state.thinkingLevels) {
    try {
      const res = await rpcRequest({ type: "get_available_thinking_levels" }, 8000);
      state.thinkingLevels = res.success && Array.isArray(res.data?.levels) ? res.data.levels : [];
    } catch {
      state.thinkingLevels = [];
    }
  }
  const current = state.session?.model;
  const items = [{ section: "Modelo" }];
  if (!state.models.length) items.push({ label: "Nenhum modelo disponível", disabled: true });
  for (const model of state.models) {
    items.push({
      label: modelLabel(model),
      sub: [model.provider, model.contextWindow ? `${formatTokens(model.contextWindow)} contexto` : ""].filter(Boolean).join(" · "),
      checked: Boolean(current && current.id === model.id && current.provider === model.provider),
      onSelect: () => rpcRequest({ type: "set_model", provider: model.provider, modelId: model.id }).then((res) => {
        if (!res.success) throw new Error(res.error || "Não foi possível trocar o modelo");
        state.thinkingLevels = null;
        toast(`Modelo: ${modelLabel(model)}`);
      }),
    });
  }
  const levels = state.thinkingLevels.length ? state.thinkingLevels : [];
  if (levels.length > 1) {
    items.push({ separator: true }, { section: "Raciocínio" });
    for (const level of levels) {
      items.push({
        label: thinkingLabel(level),
        checked: state.session?.thinkingLevel === level,
        onSelect: () => rpcRequest({ type: "set_thinking_level", level }).then((res) => {
          if (!res.success) throw new Error(res.error || "Nível não suportado");
        }),
      });
    }
  }
  openMenu(els.modelBtn, items, { align: "end", placement: "above" });
}

// --------------------------------------------------------- extension UI

function handleExtensionUi(req) {
  switch (req.method) {
    case "notify":
      toast(stripAnsi(req.message) || "Notificação do PI", req.notifyType || "info");
      addNotice(eventNotice(req));
      break;
    case "setStatus":
      if (req.statusText) state.statuses.set(req.statusKey || "default", stripAnsi(req.statusText));
      else state.statuses.delete(req.statusKey || "default");
      renderWidgets();
      break;
    case "setWidget":
      if (Array.isArray(req.widgetLines) && req.widgetLines.length) state.widgets.set(req.widgetKey || "default", req.widgetLines.map(stripAnsi));
      else state.widgets.delete(req.widgetKey || "default");
      renderWidgets();
      break;
    case "setTitle":
      document.title = req.title || "PI Studio";
      break;
    case "set_editor_text":
      els.prompt.value = req.text || "";
      autoResize();
      updateComposer();
      els.prompt.focus();
      break;
    case "select":
    case "confirm":
    case "input":
    case "editor":
      state.uiQueue.push(req);
      if (!state.uiActive) nextUiDialog();
      break;
  }
}

function nextUiDialog() {
  const req = state.uiQueue.shift();
  state.uiActive = req || null;
  if (req) openUiDialog(req);
}

let dialogTimer = null;

function closeUiDialog() {
  clearTimeout(dialogTimer);
  if (els.dialog.open) els.dialog.close();
  state.uiActive = null;
  setTimeout(nextUiDialog, 120);
}

function openUiDialog(req) {
  els.dialogTitle.textContent = req.title || "O PI precisa de uma resposta";
  els.dialogMessage.hidden = !req.message;
  els.dialogMessage.textContent = req.message || "";
  els.dialogBody.replaceChildren();
  els.dialogOk.textContent = req.method === "confirm" ? "Confirmar" : "OK";
  let getValue = () => ({});

  if (req.method === "select") {
    const options = document.createElement("div");
    options.className = "dialog-options";
    options.setAttribute("role", "radiogroup");
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
      label.addEventListener("dblclick", () => els.dialogOk.click());
      options.append(label);
    });
    els.dialogBody.append(options);
    getValue = () => ({ value: els.dialogBody.querySelector("input:checked")?.value });
  } else if (req.method === "confirm") {
    getValue = () => ({ confirmed: true });
  } else {
    const input = document.createElement(req.method === "editor" ? "textarea" : "input");
    if (req.method === "editor") input.rows = 10;
    input.className = "dialog-input";
    input.value = req.prefill || "";
    input.placeholder = req.placeholder || "";
    els.dialogBody.append(input);
    setTimeout(() => input.focus(), 0);
    getValue = () => ({ value: input.value });
  }

  // With a timeout the agent auto-resolves on its side; we only close the stale dialog.
  els.dialogTimer.hidden = !req.timeout;
  clearTimeout(dialogTimer);
  if (req.timeout) {
    const bar = els.dialogTimer.firstElementChild;
    bar.style.transition = "none";
    bar.style.transform = "scaleX(1)";
    requestAnimationFrame(() => requestAnimationFrame(() => {
      bar.style.transition = `transform ${req.timeout}ms linear`;
      bar.style.transform = "scaleX(0)";
    }));
    dialogTimer = setTimeout(() => {
      if (state.uiActive === req) {
        toast("Tempo esgotado: o PI seguiu com a opção padrão.", "warning");
        closeUiDialog();
      }
    }, req.timeout);
  }

  const responder = createUiResponder(req.id, sendUiResponse);
  const finish = (promise) => promise.then(closeUiDialog).catch(report);
  els.dialog.oncancel = (event) => finish(responder.cancel(event));
  els.dialogOk.onclick = (event) => {
    event.preventDefault();
    finish(responder.respond(getValue()));
  };
  els.dialogCancel.onclick = (event) => {
    event.preventDefault();
    finish(responder.respond({ cancelled: true }));
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

// ----------------------------------------------------------------- console

const LOG_LIMIT = 1000;
let logQueued = false;

function logEvent(event, payload) {
  state.log.push({ at: new Date(), event, payload });
  if (state.log.length > LOG_LIMIT) state.log.shift();
  if (!els.drawer.hidden && !logQueued) {
    logQueued = true;
    requestAnimationFrame(() => {
      logQueued = false;
      renderLog(false);
    });
  }
}

function logLabel(item) {
  return item.event === "rpc" ? item.payload?.type || "rpc" : item.event;
}

let renderedLogCount = 0;
function renderLog(reset) {
  const filter = els.logFilter.value.trim().toLowerCase();
  const nearBottom = els.logList.scrollHeight - els.logList.scrollTop - els.logList.clientHeight < 40;
  if (reset || filter) {
    els.logList.replaceChildren();
    renderedLogCount = Math.max(0, state.log.length - 300);
  }
  renderedLogCount = Math.min(renderedLogCount, state.log.length);
  const fragment = document.createDocumentFragment();
  for (const item of state.log.slice(renderedLogCount)) {
    const label = logLabel(item);
    const json = JSON.stringify(item.payload);
    if (filter && !`${label} ${json}`.toLowerCase().includes(filter)) continue;
    const row = document.createElement("details");
    row.className = `log-row ev-${item.event}`;
    const summary = document.createElement("summary");
    summary.innerHTML = `<time>${item.at.toLocaleTimeString("pt-BR")}</time><span class="log-ev">${esc(label)}</span><code>${esc(truncate(json, 220))}</code>`;
    row.append(summary);
    row.addEventListener("toggle", () => {
      if (row.open && !row.querySelector("pre")) row.append(Object.assign(document.createElement("pre"), { textContent: JSON.stringify(item.payload, null, 2) }));
    }, { once: true });
    fragment.append(row);
  }
  renderedLogCount = state.log.length;
  els.logList.append(fragment);
  while (els.logList.children.length > 400) els.logList.firstElementChild.remove();
  if (reset || nearBottom) els.logList.scrollTop = els.logList.scrollHeight;
}

els.logFilter.addEventListener("input", () => renderLog(true));
els.clearLog.addEventListener("click", () => {
  state.log = [];
  renderLog(true);
});
els.serverLogs.addEventListener("click", async () => {
  try {
    const { logs } = await api("/api/logs");
    for (const entry of logs || []) state.log.push({ at: new Date(entry.at), event: `server:${entry.level}`, payload: entry });
    renderLog(true);
  } catch (error) {
    report(error);
  }
});
els.closeDrawer.addEventListener("click", () => setDrawer(false));
els.rawForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  let command;
  try {
    command = JSON.parse(els.rawInput.value);
  } catch (error) {
    toast(`JSON inválido: ${error.message}`, "error");
    return;
  }
  if (!command || typeof command !== "object" || Array.isArray(command) || !command.type) {
    toast("O comando precisa ser um objeto com \"type\".", "error");
    return;
  }
  sendRpc(command).catch(report);
});
els.rawForm.addEventListener("click", (event) => {
  const preset = event.target.closest("[data-raw]");
  if (preset) els.rawInput.value = preset.dataset.raw;
});
els.rawInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    els.rawForm.requestSubmit();
  }
});

// ----------------------------------------------------------------- dialogs

function openCustomize() {
  els.prefName.value = prefs.userName || "";
  els.prefThinking.checked = Boolean(prefs.showThinking);
  els.prefTools.checked = Boolean(prefs.expandTools);
  els.customizeDialog.showModal();
}

els.customizeDialog.addEventListener("close", () => {
  if (els.customizeDialog.returnValue !== "save") return;
  prefs.userName = els.prefName.value.trim() || "Você";
  prefs.showThinking = els.prefThinking.checked;
  prefs.expandTools = els.prefTools.checked;
  savePrefs();
  nodeCache.clear();
  updateHeader();
  renderThread();
});

// ------------------------------------------------------------------ wiring

function appMenuItems() {
  return [
    { label: "Nova conversa", icon: "i-plus", onSelect: () => newSession() },
    { label: "Recarregar projetos", icon: "i-folder-open", onSelect: () => refreshProjects() },
    { label: "Console RPC", icon: "i-terminal", onSelect: () => setDrawer(els.drawer.hidden) },
    { separator: true },
    { label: "Personalização", icon: "i-brush", onSelect: openCustomize },
    { label: "Rodar no Docker", icon: "i-code", onSelect: () => els.dockerDialog.showModal() },
  ];
}

els.menuBtn.addEventListener("click", () => openMenu(els.menuBtn, appMenuItems()));
els.toggleLeft.addEventListener("click", () => setPanel("left", layout.left !== "open"));
els.toggleRight.addEventListener("click", () => setPanel("right", layout.right !== "open"));
els.scrim.addEventListener("click", closeOverlays);
els.consoleBtn.addEventListener("click", () => setDrawer(els.drawer.hidden));
const showOutputs = () => {
  setPanel("right", true);
  selectTab("files");
  els.filesView.classList.remove("flash");
  void els.filesView.offsetWidth;
  els.filesView.classList.add("flash");
};
els.filesBtn.addEventListener("click", showOutputs);
els.settingsBtn.addEventListener("click", openCustomize);
els.searchBtn.addEventListener("click", () => {
  els.searchWrap.hidden = !els.searchWrap.hidden;
  if (!els.searchWrap.hidden) els.search.focus();
  else {
    state.filter = "";
    els.search.value = "";
    renderProjects();
  }
});
els.search.addEventListener("input", () => {
  state.filter = els.search.value;
  renderProjects();
});
els.refreshProjects.addEventListener("click", () => refreshProjects().catch(report));
els.newSession.addEventListener("click", () => newSession().catch(report));
els.restart.addEventListener("click", () => newSession().catch(report));
els.modelBtn.addEventListener("click", () => openModelMenu().catch(report));
els.projectMenuBtn.addEventListener("click", () => {
  openMenu(els.projectMenuBtn, [
    { section: "Projetos" },
    ...state.projects.slice(0, 14).map((project) => ({
      label: project.name,
      sub: project.cwd,
      checked: project.id === state.currentProject?.id,
      onSelect: () => openProject(project.id),
    })),
  ]);
});
document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "`") {
    event.preventDefault();
    setDrawer(els.drawer.hidden);
  } else if (event.key === "Escape" && !els.drawer.hidden && !document.querySelector("dialog[open]") && els.menu.hidden) {
    setDrawer(false);
  }
});

updateComposer();
renderAttachments();
applyPanelWidth();
selectTab(inspector.tab);
bootstrap().catch(report);
