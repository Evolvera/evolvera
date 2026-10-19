import {
  INSPECTOR_TABS,
  NOTIFY_KEY,
  SETTINGS_KEY,
  followDecision,
  followedPath,
  detachProjectRequests,
  applyTurnFinish,
  countBadge,
  projectRunningCount,
  runningSubagentCount,
  runningWorktreeCount,
  studioPiState,
  finishedLabel,
  stampTurnEnd,
  filterWorktrees,
  groupWorktrees,
  historyPollWanted,
  orcaEnabledNow,
  sessionStateBadge,
  sessionTooltip,
  stepIndex,
  worktreeDetail,
  orcaPollWanted,
  resolveInspectorTab,
  statusAttention,
  visibleInspectorTabs,
  sortWorktrees,
  worktreeRow,
  paletteSections,
  parseSettings,
  settingsAttributes,
  SHORTCUT_GROUPS,
  appendBashOutput,
  attentionState,
  forkEntryIds,
  messageActions,
  messageText,
  notificationContent,
  notifyEnabled,
  shouldNotify,
  todoFromMessages,
  todoSnapshot,
  todoSummary,
  bashLabels,
  buildTerminal,
  capTail,
  filterCommands,
  finishBash,
  insertMention,
  isShellText,
  mentionToken,
  mergeCommands,
  parseBuiltin,
  recallAction,
  shellCommand,
  shortcutAction,
  slashCompletion,
  slashEnterSubmits,
  slashQuery,
  sourceLabel,
  splitLines,
  clampPanelWidth,
  collectSubagents,
  contextBreakdown,
  eventNotice,
  subagentRecords,
  tabKeyTarget,
  isAwaitedResponse,
  runGated,
  waitSessionGate,
  stripAnsi,
  shouldShowToast,
  applyAssistantDelta,
  basename,
  buildTimeline,
  collectOutputs,
  composerAction,
  composerSendType,
  requestExceedsLimit,
  restoreFailedDraft,
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
  withSessionRollback,
} from "./lib.js";

import { ACTIVITY_LIMIT, SUBAGENT_TOOLS, activityRows, activitySinceUrl, agoLabel, problemsFromEvent, stallThresholds, stalledPi, subagentTiming, todayUsageRows, unseenActivity } from "./lib.js";

const $ = (selector) => document.querySelector(selector);
const els = {
  app: $("#app"),
  sidebar: $("#sidebar"),
  menuBtn: $("#menuBtn"),
  toggleLeft: $("#toggleLeftBtn"),
  toggleRight: $("#toggleRightBtn"),
  projectMenuBtn: $("#projectMenuBtn"),
  projectTitle: $("#projectTitle"),
  consoleBtn: $("#consoleBtn"),
  filesBtn: $("#filesBtn"),
  worktreesBtn: $("#worktreesBtn"),
  worktreesDialog: $("#worktreesDialog"),
  worktreesInput: $("#worktreesInput"),
  worktreesList: $("#worktreesList"),
  activityBadge: $("#activityBadge"),
  wtvModes: [...document.querySelectorAll('input[name="wtvMode"]')],
  newSession: $("#newSessionBtn"),
  newSessionLabel: $("#newSessionLabel"),
  searchWrap: $("#searchWrap"),
  search: $("#searchInput"),
  searchBtn: $("#searchBtn"),
  searchResults: $("#searchResults"),
  settingsBtn: $("#settingsBtn"),
  refreshProjects: $("#refreshProjectsBtn"),
  projects: $("#projectsList"),
  userAvatar: $("#userAvatar"),
  userName: $("#userName"),
  scroller: $("#scroller"),
  thread: $("#thread"),
  jump: $("#jumpBtn"),
  dock: document.querySelector(".dock"),
  todoPanel: $("#todoPanel"),
  todoToggle: $("#todoToggle"),
  todoCount: $("#todoCount"),
  todoCurrent: $("#todoCurrent"),
  todoList: $("#todoList"),
  widgetArea: $("#widgetArea"),
  exitBanner: $("#exitBanner"),
  restart: $("#restartBtn"),
  queueArea: $("#queueArea"),
  composer: $("#composer"),
  attachments: $("#attachments"),
  prompt: $("#promptInput"),
  imageInput: $("#imageInput"),
  hint: $("#composerHint"),
  shellChip: $("#shellChip"),
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
  wtList: $("#wtList"),
  subBadge: $("#subBadge"),
  filesBadge: $("#filesBadge"),
  wtTabBadge: $("#wtTabBadge"),
  worktreesBadge: $("#worktreesBadge"),
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
  shortcutsDialog: $("#shortcutsDialog"),
  shortcutsBody: $("#shortcutsBody"),
  settingsDialog: $("#settingsDialog"),
  settingFont: [...document.querySelectorAll('input[name="settingFont"]')],
  settingWidth: [...document.querySelectorAll('input[name="settingWidth"]')],
  settingNotify: $("#settingNotify"),
  settingNotifyHint: $("#settingNotifyHint"),
  settingMotion: $("#settingMotion"),
  settingThinking: $("#settingThinking"),
  settingOrca: $("#settingOrca"),
  settingOrcaHint: $("#settingOrcaHint"),
  settingOrcaFollow: $("#settingOrcaFollow"),
  renameDialog: $("#renameDialog"),
  renameInput: $("#renameInput"),
  paletteDialog: $("#paletteDialog"),
  paletteInput: $("#paletteInput"),
  paletteList: $("#paletteList"),
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

// Display settings (font size, chat width, reduced motion). public/boot.js applies the saved values
// before first paint; this keeps <html> in step when they change.
const settings = parseSettings(localStorage.getItem(SETTINGS_KEY));
function applySettings() {
  Object.assign(document.documentElement.dataset, settingsAttributes(settings));
}
function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  applySettings();
}
applySettings();

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
  uiRequestIds: new Set(),
  notices: [],
  problems: [],
  subagentRecords: new Map(),
  compactingProjects: new Set(),
  commands: null,
  commandsLoading: false,
  lastSent: null,
  recalled: null,
  bash: null,
  todo: null,
  todoCollapsed: localStorage.getItem("pi-studio:todo-collapsed") === "1",
  forkMessages: [],
  forking: false,
  timeline: new Map(),
  retryTarget: null,
  attention: new Map(),
  settledSupported: false,
  settleTimer: null,
};

const nodeCache = new Map();
const apiToken = document.querySelector('meta[name="pi-studio-token"]')?.content || "";
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const svg = (name, cls = "") => `<svg class="${cls}" aria-hidden="true"><use href="#${name}"/></svg>`;
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const prefersReducedMotion = () => reduceMotion.matches || settings.reduceMotion;

// ------------------------------------------------------------------ basics

const toastSeen = new Map();

// action: { label, run } adds a button (and keeps the toast a little longer).
function toast(message, type = "info", action = null) {
  if (!shouldShowToast(toastSeen, `${type}:${message}`, Date.now())) return;
  const item = document.createElement("div");
  item.className = `toast ${type}${action ? " has-action" : ""}`;
  item.setAttribute("role", type === "error" ? "alert" : "status");
  const text = document.createElement("span");
  text.textContent = message;
  item.append(text);
  if (action) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "toast-action";
    button.textContent = action.label;
    button.addEventListener("click", () => {
      Promise.resolve().then(action.run).catch(report);
      item.remove();
    });
    item.append(button);
  }
  els.toasts.append(item);
  setTimeout(() => {
    item.classList.add("leaving");
    setTimeout(() => item.remove(), 220);
  }, action ? 9000 : 4200);
}

// timeoutMs bounds requests a session switch waits on, so a hung server can never hold the
// session gate (and the composer) forever.
async function api(path, { timeoutMs, ...options } = {}) {
  const res = await fetch(path, {
    ...options,
    ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
    headers: { "content-type": "application/json", "x-pi-studio-token": apiToken, ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

const report = (error) => { if (!error?.detached) toast(error?.message || String(error), "error"); };

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
    state.pending.set(id, { resolve, reject, timer, projectId: state.currentProject?.id });
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
  const id = command.id || newId();
  return new Promise((resolve, reject) => {
    const timer = timeoutMs ? setTimeout(() => {
      state.pending.delete(id);
      reject(new Error(`Sem resposta do PI para ${command.type}`));
    }, timeoutMs) : null;
    state.pending.set(id, { resolve, reject, timer, projectId: state.currentProject?.id });
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
  const closeLeft = layout.left !== "open" && !els.sidebar.inert && els.sidebar.contains(document.activeElement);
  const closeRight = layout.right !== "open" && !els.panel.inert && els.panel.contains(document.activeElement);
  els.sidebar.inert = layout.left !== "open";
  els.panel.inert = layout.right !== "open";
  if (closeLeft) els.toggleLeft.focus();
  if (closeRight) els.toggleRight.focus();
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
  tab: resolveInspectorTab(savedTab, settings),
  width: clampPanelWidth(localStorage.getItem(INSPECTOR_WIDTH_KEY), window.innerWidth),
  dirty: new Set(INSPECTOR_TABS),
  queued: false,
};
const term = { cache: new Map(), stick: true, collapsed: new Set() };
// Orca integration (off by default): latest /api/orca answer, the path follow mode last handled, and its poll timer.
const orca = { data: null, lastFollowed: null, timer: null, inflight: false, renderSig: "", uiKey: "" };
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
  els.menu.classList.remove("menu-wide", "menu-live");
  els.menu.setAttribute("role", "menu");
  els.menu.onmousedown = null;
  menuCleanup?.();
  menuCleanup = null;
}

// items: { label, sub?, badge?, icon?, checked?, active?, disabled?, onSelect } | { section } | { separator: true }
// passive: a listbox the owner drives (the composer / and @ pickers): no focus move, no key handling,
// and onClose runs whenever the menu closes for any reason.
function openMenu(anchor, items, { align = "start", placement = "below", passive = false, wide = false, onClose } = {}) {
  closeMenu();
  els.menu.classList.toggle("menu-wide", wide);
  els.menu.classList.toggle("menu-live", passive);
  els.menu.setAttribute("role", passive ? "listbox" : "menu");
  els.menu.onmousedown = passive ? (event) => event.preventDefault() : null;
  let optionIndex = 0;
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
    button.className = `menu-item${item.checked ? " checked" : ""}${item.active ? " active" : ""}`;
    button.setAttribute("role", passive ? "option" : item.checked === undefined ? "menuitem" : "menuitemradio");
    if (passive) {
      button.id = `menu-opt-${optionIndex++}`;
      button.tabIndex = -1;
      button.setAttribute("aria-selected", String(Boolean(item.active)));
    }
    if (item.checked !== undefined) button.setAttribute("aria-checked", String(Boolean(item.checked)));
    button.disabled = Boolean(item.disabled);
    button.innerHTML = `${item.icon ? svg(item.icon, "menu-ico") : ""}<span class="menu-label"><span>${esc(item.label)}</span>${item.sub ? `<small>${esc(item.sub)}</small>` : ""}</span>${item.badge ? `<span class="menu-badge">${esc(item.badge)}</span>` : ""}${item.checked ? svg("i-check", "menu-check") : ""}`;
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
  if (passive) els.menu.querySelector(".menu-item.active")?.scrollIntoView({ block: "nearest" });
  else (els.menu.querySelector(".menu-item.checked:not(:disabled)") || buttons()[0])?.focus();
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
  if (!passive) document.addEventListener("keydown", onKey, true);
  const pointerTimer = setTimeout(() => document.addEventListener("pointerdown", onPointer, true), 0);
  window.addEventListener("resize", closeMenu, { once: true });
  menuCleanup = () => {
    clearTimeout(pointerTimer);
    document.removeEventListener("keydown", onKey, true);
    document.removeEventListener("pointerdown", onPointer, true);
    onClose?.();
  };
}

// ----------------------------------------------------------------- sidebar

function matchesFilter(...values) {
  const query = state.filter.trim().toLowerCase();
  return !query || values.some((value) => String(value || "").toLowerCase().includes(query));
}

function sessionButton(project, item, active) {
  const row = document.createElement("div");
  row.className = "session-row";
  const button = document.createElement("button");
  button.type = "button";
  button.className = `session-item${active ? " active" : ""}`;
  button.dataset.action = "open-session";
  button.dataset.project = project.id;
  button.dataset.path = item.path;
  if (active) button.setAttribute("aria-current", "true");
  const badge = sessionStateBadge(item);
  const dot = badge ? `<span class="session-state st-${badge.state}" role="img" aria-label="${esc(badge.aria)}"></span>` : "";
  button.innerHTML = `<span class="session-title">${esc(item.title || "Nova conversa")}</span>${dot}<span class="session-time">${esc(relativeTime(item.timestamp))}</span>`;
  button.title = sessionTooltip(item);
  const menu = document.createElement("button");
  menu.type = "button";
  menu.className = "session-menu-btn";
  menu.dataset.action = "session-menu";
  menu.dataset.project = project.id;
  menu.dataset.path = item.path;
  menu.dataset.title = item.title || "";
  menu.setAttribute("aria-haspopup", "menu");
  menu.setAttribute("aria-label", `Ações da conversa ${item.title || "Nova conversa"}`);
  menu.innerHTML = svg("i-more");
  row.append(button, menu);
  return row;
}

// Rename and export go through RPC, which only acts on the open session: the other conversations of
// the list show the entries disabled (open one first) instead of silently switching sessions.
function openSessionMenu(anchor) {
  const { project: projectId, path: sessionPath, title } = anchor.dataset;
  const available = state.currentProject?.id === projectId && samePath(sessionPath, state.session?.sessionFile) && !state.processExited;
  const sub = available ? undefined : "Abra a conversa primeiro";
  anchor.setAttribute("aria-expanded", "true");
  openMenu(anchor, [
    { label: "Renomear", icon: "i-edit", disabled: !available, sub, onSelect: () => promptRename(title) },
    { label: "Exportar conversa", icon: "i-file", disabled: !available, sub, onSelect: exportSession },
  ], { align: "end", onClose: () => anchor.removeAttribute("aria-expanded") });
}

function promptRename(current = "") {
  els.renameInput.value = current;
  els.renameDialog.returnValue = "";
  els.renameDialog.showModal();
  els.renameInput.select();
}

// Enter would submit through the first button (Cancelar); save explicitly instead.
els.renameInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.isComposing) return;
  event.preventDefault();
  if (els.renameInput.value.trim()) els.renameDialog.close("save");
});

els.renameDialog.addEventListener("close", () => {
  if (els.renameDialog.returnValue === "save") renameSession(els.renameInput.value.trim()).catch(report);
});

els.projects.addEventListener("contextmenu", (event) => {
  const anchor = event.target.closest(".session-row")?.querySelector(".session-menu-btn");
  if (!anchor) return;
  event.preventDefault();
  openSessionMenu(anchor);
});

function renderProjects() {
  const fragment = document.createDocumentFragment();
  for (const project of state.projects) {
    const active = state.currentProject?.id === project.id;
    const history = active ? state.history : state.otherHistory.get(project.id) || [];
    const sessions = history.filter((item) => matchesFilter(item.title));
    if (!matchesFilter(project.name, project.cwd) && !sessions.length) continue;
    const expanded = active || state.expandedProjects.has(project.id) || Boolean(state.filter && sessions.length);
    const wrap = document.createElement("div");
    const attention = attentionState(state.attention.get(project.id) || {});
    const running = projectRunningCount(history, projectStatus.last.get(project.id), { open: active, serverCount: projectStatus.running.get(project.id) ?? 0 });
    const stalled = projectStatus.stalled.get(project.id);
    const badge = countBadge(running);
    const badgeLabel = plural(running, "conversa em andamento", "conversas em andamento");
    wrap.className = `project${active ? " active" : ""}${project.activeSessionId ? " running" : ""}${attention ? ` attn-${attention}` : ""}`;
    wrap.setAttribute("role", "listitem");
    wrap.innerHTML = `
      <div class="project-row-wrap">
        <button type="button" class="project-row" data-action="open-project" data-project="${esc(project.id)}" title="${esc(project.cwd)}"${active ? ' aria-current="true"' : ""}>
          ${svg("i-code", "project-ico")}
          <span class="project-name">${esc(project.name)}</span>
          ${badge ? `<span class="count-badge" role="img" aria-label="${esc(badgeLabel)}" title="${esc(badgeLabel)}">${badge}</span>` : ""}
          <span class="run-dot" aria-hidden="true"></span>
          ${attention ? `<span class="sr-only">${attention === "waiting" ? "aguardando sua resposta" : "terminou enquanto você estava fora"}</span>` : ""}
        </button>
        <button type="button" class="project-chev${expanded ? " open" : ""}" data-action="expand-project" data-project="${esc(project.id)}" aria-label="${expanded ? "Recolher" : "Expandir"} conversas de ${esc(project.name)}" aria-expanded="${expanded}">${svg("i-chevron-right")}</button>
      </div>
      ${stalled ? `<p class="project-stall"><i class="stall-dot" aria-hidden="true"></i>${esc(stalled)}</p>` : ""}`;
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
  syncHistoryPolling();
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
  } else if (action === "session-menu") {
    openSessionMenu(target);
  }
  if (action !== "expand-project" && action !== "more-sessions" && action !== "session-menu") closeOverlays();
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
  updateFilesBadge();
  state.stats = null;
  state.queue = { steering: [], followUp: [] };
  renderQueue();
  state.liveThinking = "";
  state.notices = [];
  state.problems = [];
  state.subagentRecords = new Map();
  state.commands = null;
  state.lastSent = null;
  state.recalled = null;
  state.bash = null;
  state.todo = null;
  state.forkMessages = [];
  state.retryTarget = null;
  clearTimeout(state.settleTimer);
  renderTodo();
  closeComposerMenu();
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

// Opening a project starts PI for it (seconds on a cold start). The session gate makes a
// prompt or "Nova conversa" issued meanwhile wait for it instead of being dropped.
function openProject(projectId) {
  return runGated(state, () => loadProject(projectId));
}

// `cwd` opens a directory the Studio does not list yet (an Orca worktree); the server checks it.
async function loadProject(projectId, { cwd } = {}) {
  const { project, session, history } = cwd
    ? await api("/api/projects/open-path", { method: "POST", body: JSON.stringify({ cwd }), timeoutMs: SESSION_SWITCH_TIMEOUT_MS })
    : await api(`/api/projects/${encodeURIComponent(projectId)}/open`, { method: "POST", body: "{}", timeoutMs: SESSION_SWITCH_TIMEOUT_MS });
  setExited(false);
  if (state.currentProject?.id && state.currentProject.id !== project.id) {
    detachProjectRequests(state.pending, state.currentProject.id);
    state.compactingProjects.delete(state.currentProject.id);
  }
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
  markSeen(project.id);
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

function openSession(projectId, sessionPath) {
  return runGated(state, async () => {
    if (state.currentProject?.id !== projectId) await loadProject(projectId);
    const previousSession = { ...(state.session || {}) };
    return withSessionRollback(async () => {
      const id = newId();
      const applied = awaitResponse(id, SESSION_SWITCH_TIMEOUT_MS);
      try {
        await api(`/api/projects/${encodeURIComponent(projectId)}/switch`, { method: "POST", body: JSON.stringify({ sessionPath, id }) });
      } catch (error) {
        failPending(id, error);
        throw error;
      }
      const response = await applied;
      if (response.success && !response.data?.cancelled) {
        resetConversation();
        state.session = { ...previousSession, sessionFile: sessionPath };
        updateHeader();
        renderProjects();
        renderThread();
      }
      return response;
    }, () => {
      state.session = previousSession;
      renderProjects();
      renderThread();
    });
  });
}

async function refreshHistory({ onlyIfChanged = false } = {}) {
  const project = state.currentProject;
  if (!project) return;
  const { history } = await api(`/api/projects/${encodeURIComponent(project.id)}/history`);
  const next = history || [];
  if (state.currentProject?.id !== project.id || (onlyIfChanged && JSON.stringify(next) === JSON.stringify(state.history))) return;
  state.history = next;
  renderProjects();
}

// While a conversation of the open project is running its state is re-read every few seconds.
const HISTORY_POLL_MS = 5000;
let historyTimer = null;
function syncHistoryPolling() {
  const wanted = historyPollWanted(state.history, document.hidden);
  if (wanted && !historyTimer) historyTimer = setInterval(() => refreshHistory({ onlyIfChanged: true }).catch(() => {}), HISTORY_POLL_MS);
  else if (!wanted && historyTimer) {
    clearInterval(historyTimer);
    historyTimer = null;
  }
}

function newSession() {
  return runGated(state, async () => {
    if (!state.currentProject) return;
    const previousSession = { ...(state.session || {}) };
    return withSessionRollback(async () => {
      const restarting = state.processExited;
      const id = newId();
      const applied = awaitResponse(id, SESSION_SWITCH_TIMEOUT_MS);
      try {
        await sendRpc({ type: "new_session", id });
      } catch (error) {
        failPending(id, error);
        throw error;
      }
      const response = await applied;
      if (response.success && !response.data?.cancelled) {
        if (restarting) {
          setExited(false);
          connectProjectEvents(state.currentProject.id);
        }
        resetConversation();
        state.session = { ...previousSession, sessionFile: null };
        renderThread();
        renderPanel();
        setTimeout(() => refreshState().catch(() => {}), 300);
        refreshHistory().catch(() => {});
      }
      return response;
    }, () => {
      state.session = previousSession;
      renderProjects();
      renderThread();
    });
  });
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
    if (!state.replaying || payload.type === "queue_update") handleRpc(payload);
    // A command sent right after opening the project (e.g. new_session) can be answered
    // before this stream connects; its response then only arrives in the replay.
    else if (isAwaitedResponse(payload, state.pending)) handleResponse(payload);
    else if (payload.type === "extension_ui_request" && ["select", "confirm", "input", "editor", "setStatus", "setWidget"].includes(payload.method)) handleExtensionUi(payload);
  });
  on("ui_resolved", ({ id }) => resolveUiDialog(id));
  on("replay_done", () => {
    state.replaying = false;
    refreshState().catch(report);
  });
  on("session_ready", () => {});
  on("stdout", () => {});
  on("stderr", () => {});
  on("process_error", (payload) => {
    if (state.replaying) return;
    problemsFromEvent({ type: "process_error", message: payload.message }).forEach(addProblem);
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
    if (state.source === source && source.readyState === EventSource.CONNECTING) {
      if (!state.replaying) {
        state.queue = { steering: [], followUp: [] };
        renderQueue();
      }
      state.replaying = true;
    }
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

// Cost of today's sessions across projects (server-side sum); asked at most every 5 s, none while the index is still building.
const usageToday = { data: null, at: 0, inflight: false };

async function refreshUsageToday() {
  if (usageToday.inflight || Date.now() - usageToday.at < 5000) return;
  usageToday.inflight = true;
  try {
    const res = await api("/api/usage/today");
    usageToday.data = res.indexing ? null : res;
    usageToday.at = Date.now();
    scheduleInspector("context");
  } catch {
    // Transient: the next stats refresh retries.
  } finally {
    usageToday.inflight = false;
  }
}

function refreshStats() {
  refreshUsageToday();
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
      applyTodo(todoFromMessages(state.messages));
      refreshForkMessages();
      if (state.isStreaming && state.liveMessage && !state.messages.includes(state.liveMessage)) state.messages.push(state.liveMessage);
      // Finished Agent runs stay: their end time is the only source of "terminou há N min" once the result is in the entries.
      for (const [id, tool] of state.runtime) if (tool.status !== "running" && tool.name !== SUBAGENT_TOOLS.agent) state.runtime.delete(id);
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

// Errors and auto-retries of this conversation, kept for the Contexto tab (toasts vanish). Replayed history never reaches here.
function addProblem(problem) {
  state.problems.push({ kind: problem.kind, text: problem.text, at: problem.at });
  if (state.problems.length > 100) state.problems.shift();
  scheduleInspector("context");
}

function handleRpc(event) {
  problemsFromEvent(event).forEach(addProblem);
  switch (event.type) {
    case "response":
      handleResponse(event);
      return;
    case "agent_start":
      clearTimeout(state.settleTimer);
      setRunning(true);
      state.runStartedAt = Date.now();
      state.phase = "thinking";
      state.liveThinking = "";
      break;
    case "agent_end":
      if (event.willRetry) break;
      setRunning(false);
      state.liveMessage = null;
      stampTurnEnd(state.messages);
      sendRpc({ type: "get_entries" }).catch(() => {});
      refreshStats();
      refreshHistory().catch(() => {});
      // PI versions without agent_settled: treat a quiet period after agent_end as the end of the run.
      if (!state.settledSupported) state.settleTimer = setTimeout(() => onSettled().catch(() => {}), SETTLE_FALLBACK_MS);
      break;
    case "agent_settled":
      state.settledSupported = true;
      clearTimeout(state.settleTimer);
      stampTurnEnd(state.messages);
      onSettled().catch(() => {});
      return;
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
      state.runtime.set(event.toolCallId, { name: event.toolName, args: event.args || {}, status: "running", partial: null, result: null, startedAt: Date.now(), updatedAt: Date.now() });
      state.phase = "tool";
      break;
    case "tool_execution_update": {
      const tool = state.runtime.get(event.toolCallId);
      if (tool) {
        tool.partial = event.partialResult;
        tool.updatedAt = Date.now();
      }
      break;
    }
    case "tool_execution_end": {
      const tool = state.runtime.get(event.toolCallId) || { name: event.toolName, args: {} };
      state.runtime.set(event.toolCallId, { ...tool, status: event.isError ? "error" : "done", result: event.result, endedAt: Date.now() });
      applyTodo(todoSnapshot({ toolName: event.toolName, isError: event.isError, details: event.result?.details }));
      state.phase = "thinking";
      break;
    }
    case "bash_execution_update": {
      const block = state.messages.find((message) => message._bashId === event.id);
      if (block) appendBashOutput(block, event.delta);
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
      if (state.currentProject) state.compactingProjects.delete(state.currentProject.id);
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
  updateFilesBadge();
  annotateActions(items);

  const nodes = [];
  if (!items.length && !state.isStreaming) nodes.push(nodeCache.get("empty")?.node || emptyState());
  if (!items.length && !state.isStreaming) nodeCache.set("empty", { node: nodes[0], sig: "" });
  const seen = new Set(["empty"]);
  for (const item of items) {
    const actions = (item.actions || []).map((action) => `${action.id}${action.disabled ? 0 : 1}`).join();
    const sig = `${timelineSignature(item)}|${isExpanded(item.key) ? 1 : 0}${isExpanded(`think:${item.key}`) ? 1 : 0}|${actions}|${item.finishAt ?? ""}`;
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

// Message toolbars: copy everywhere; edit/retry only where get_fork_messages verifies the fork point.
function annotateActions(items) {
  const users = items.filter((item) => item.kind === "user");
  const ids = forkEntryIds(users.map((item) => item.text), state.forkMessages);
  users.forEach((item, index) => (item.entryId = ids[index]));
  const lastUser = users.at(-1);
  const lastUserIndex = lastUser ? items.indexOf(lastUser) : -1;
  const lastAssistant = items.findLast((item) => item.kind === "assistant");
  const forkable = lastUser && messageActions(lastUser).some((action) => action.id === "edit");
  state.retryTarget = forkable && items.indexOf(lastAssistant) > lastUserIndex ? { entryId: lastUser.entryId, text: lastUser.text } : null;
  const ctx = { streaming: state.isStreaming, busy: state.forking };
  applyTurnFinish(items, state.isStreaming);
  for (const item of items) {
    if (item.kind === "user") item.actions = messageActions(item, ctx);
    else if (item.kind === "assistant") item.actions = messageActions(item, { ...ctx, lastAssistant: item === lastAssistant, retryId: state.retryTarget?.entryId });
  }
  state.timeline = new Map(items.map((item) => [item.key, item]));
}

const ACTION_ICONS = { copy: "i-copy", edit: "i-edit", retry: "i-retry" };

function actionsHtml(item) {
  if (!item.actions?.length) return "";
  const buttons = item.actions.map((action) => `<button type="button" class="act-btn" data-action="msg-${action.id}" data-key="${esc(item.key)}" title="${esc(action.label)}" aria-label="${esc(action.label)}"${action.disabled ? " disabled" : ""}>${svg(ACTION_ICONS[action.id])}${action.id === "copy" ? '<span class="act-flash">Copiado</span>' : ""}</button>`);
  const finished = item.finishAt === undefined ? null : finishedLabel(item.finishAt, item.finishTook);
  const time = finished ? `<span class="act-time" data-finished="${item.finishAt}" title="${esc(finished.title)}">${esc(finished.text)}</span>` : "";
  return `<div class="msg-actions" role="toolbar" aria-label="Ações da mensagem">${buttons.join("")}${time}</div>`;
}

// "terminou há N min" texts age in place: only their text is rewritten, the thread is not re-rendered.
setInterval(() => {
  if (document.hidden) return;
  for (const node of els.thread.querySelectorAll(".act-time[data-finished]")) {
    const label = finishedLabel(Number(node.dataset.finished));
    if (label && node.textContent !== label.text) node.textContent = label.text;
  }
}, 30_000);

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
        ${long ? `<button type="button" class="more-btn" data-action="toggle" data-key="${esc(item.key)}">${open ? "Mostrar menos" : "Mostrar mais"}</button>` : ""}${actionsHtml(item)}`;
      break;
    }
    case "assistant":
      node.className = "msg msg-assistant";
      node.innerHTML = `${item.thinking ? thinkingBlock(item.key, item.thinking) : ""}<div class="md">${renderMarkdown(item.text)}</div>${actionsHtml(item)}`;
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
    case "bash": {
      const lines = capTail(splitLines(item.output), 200);
      const outputText = (lines.hidden ? [`… ${plural(lines.hidden, "linha oculta", "linhas ocultas")}`, ...lines.lines] : lines.lines).join("\n");
      const icon = item.state === "running" ? svg("i-spinner", "spin") : item.state === "done" ? svg("i-check") : svg("i-alert");
      node.className = `msg msg-bash is-${item.state}`;
      node.innerHTML = `<div class="bash-head"><span class="bash-prompt" aria-hidden="true">$</span><code class="bash-cmd" title="${esc(item.text)}">${esc(item.text)}</code>
        <span class="bash-state">${icon}${esc(bashLabels(item).join(" · "))}</span></div>
        ${lines.lines.length ? `<div class="bash-scroll"><pre class="bash-out">${esc(outputText)}</pre></div>` : `<div class="bash-empty">${item.state === "running" ? "Aguardando saída…" : "Sem saída"}</div>`}`;
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

let tick = 0;
setInterval(() => {
  tick++;
  updateRunStatus();
  if (layout.right !== "open") return;
  if (inspector.tab === "terminal" && state.isStreaming) renderTermFoot();
  // Finished runs only age by the minute ("terminou há N min"): refresh them every 15 s.
  else if (inspector.tab === "subagents" && (!els.subBadge.hidden || tick % 15 === 0)) scheduleInspector("subagents");
  else if (inspector.tab === "context" && state.problems.length && tick % 15 === 0) scheduleInspector("context");
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
  // Re-enable following right away: the smooth scroll takes a few frames to reach the bottom.
  state.stick = true;
  els.jump.hidden = true;
  els.scroller.scrollTo({ top: els.scroller.scrollHeight, behavior: prefersReducedMotion() ? "auto" : "smooth" });
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
  else if (target.dataset.action.startsWith("msg-")) messageAction(target.dataset.action.slice(4), target).catch(report);
  else if (target.dataset.action === "diff") openDiff([target.dataset.tool]);
  else if (target.dataset.action === "live-thinking" && state.liveThinking.trim()) {
    state.liveThinkingOpen = !state.liveThinkingOpen;
    updateRunStatus();
  }
});

// The jump button floats just above the dock, whatever its height (composer growth, task list).
new ResizeObserver(() => {
  els.jump.style.bottom = `${els.dock.offsetHeight + 14}px`;
}).observe(els.dock);

// ---------------------------------------------------------- message actions

// Forks the session at a user message (RPC `fork`). Resolves with the message text, or null when
// nothing happened (busy, streaming, or an extension vetoed the fork).
function forkFrom(entryId) {
  if (state.forking || state.isStreaming) return Promise.resolve(null);
  state.forking = true;
  scheduleRender();
  return runGated(state, async () => {
    const id = newId();
    const applied = awaitResponse(id, SESSION_SWITCH_TIMEOUT_MS);
    try {
      await sendRpc({ type: "fork", entryId, id });
    } catch (error) {
      failPending(id, error);
      throw error;
    }
    const res = await applied;
    if (!res.success) throw new Error(res.error || "Não foi possível bifurcar a conversa.");
    if (res.data?.cancelled) {
      toast("Uma extensão cancelou a bifurcação.", "warning");
      return null;
    }
    resetConversation();
    state.session = { ...(state.session || {}), sessionFile: null };
    renderThread();
    renderPanel();
    sendRpc({ type: "get_state" }).catch(() => {});
    sendRpc({ type: "get_entries" }).catch(() => {});
    refreshStats();
    refreshHistory().catch(() => {});
    setTimeout(() => refreshHistory().catch(() => {}), 800);
    return String(res.data?.text ?? "");
  }).finally(() => {
    state.forking = false;
    scheduleRender();
  });
}

// "Tentar de novo": after the fork the same text goes out as a new prompt in the new session.
function sendRetry(message) {
  state.lastSent = message;
  const optimistic = { role: "user", content: [{ type: "text", text: message }], timestamp: Date.now(), _optimistic: true };
  state.messages.push(optimistic);
  state.stick = true;
  scheduleRender();
  const failed = (text) => {
    const index = state.messages.indexOf(optimistic);
    if (index !== -1) state.messages.splice(index, 1);
    scheduleRender();
    toast(text, "error");
    if (!els.prompt.value) setComposerText(message);
  };
  rpcRequest({ type: "prompt", message }, 0).then((res) => {
    if (!res.success) failed(res.error || "O PI recusou a mensagem.");
  }, (error) => failed(error.message));
}

async function messageAction(action, button) {
  const item = state.timeline.get(button.dataset.key);
  if (!item) return;
  if (action === "copy") {
    if (!navigator.clipboard) throw new Error("A cópia não está disponível neste navegador.");
    await navigator.clipboard.writeText(item.text);
    button.classList.add("done");
    setTimeout(() => button.classList.remove("done"), 1400);
  } else if (action === "edit") {
    const text = await forkFrom(item.entryId);
    if (text === null) return;
    setComposerText(text);
    els.prompt.focus();
  } else if (action === "retry" && state.retryTarget) {
    const target = state.retryTarget;
    const text = await forkFrom(target.entryId);
    if (text !== null) sendRetry(text || target.text);
  }
}

// Fork points PI offers (get_fork_messages); matched to thread messages by order in annotateActions.
function refreshForkMessages() {
  if (!state.messages.some((message) => message?.role === "user")) return;
  rpcRequest({ type: "get_fork_messages" }, 8000)
    .then((res) => {
      state.forkMessages = res.success && Array.isArray(res.data?.messages) ? res.data.messages : [];
      scheduleRender();
    })
    .catch(() => {});
}

// ------------------------------------------------------------------ tasks

function applyTodo(tasks) {
  if (!tasks) return;
  state.todo = tasks;
  renderTodo();
}

function renderTodo() {
  const summary = todoSummary(state.todo);
  els.todoPanel.hidden = !summary.total;
  els.todoPanel.classList.toggle("collapsed", state.todoCollapsed);
  els.todoToggle.setAttribute("aria-expanded", String(!state.todoCollapsed));
  els.todoCount.textContent = summary.total ? `${summary.done}/${summary.total}` : "";
  els.todoCurrent.textContent = summary.current;
  const labels = { completed: "Concluída: ", in_progress: "Em andamento: ", pending: "Pendente: " };
  els.todoList.replaceChildren(...summary.tasks.map((task) => {
    const item = document.createElement("li");
    item.className = `todo-item ${task.status}`;
    if (task.status === "in_progress") item.setAttribute("aria-current", "step");
    item.innerHTML = `<span class="todo-mark" aria-hidden="true"></span><span><span class="sr-only">${labels[task.status]}</span><span class="todo-subject">${esc(task.status === "in_progress" ? task.activeForm || task.subject : task.subject)}</span></span>`;
    return item;
  }));
}

function toggleTodo() {
  if (els.todoPanel.hidden) return;
  state.todoCollapsed = !state.todoCollapsed;
  localStorage.setItem("pi-studio:todo-collapsed", state.todoCollapsed ? "1" : "0");
  renderTodo();
}

els.todoToggle.addEventListener("click", toggleTodo);

// ------------------------------------------- notifications + status dots

const SETTLE_FALLBACK_MS = 2500;
const canNotify = typeof Notification !== "undefined";
const notifyOn = () => notifyEnabled(localStorage.getItem(NOTIFY_KEY));
const pageUnseen = () => document.hidden || !document.hasFocus();

// Asked lazily, from a user gesture (the first send), never on page load; a denial is respected.
function ensureNotifyPermission() {
  if (!canNotify || !notifyOn() || Notification.permission !== "default") return;
  try {
    Promise.resolve(Notification.requestPermission()).catch(() => {});
  } catch {
    // Old browsers throw on the promise form; notifications simply stay off.
  }
}

function notifyAllowed() {
  return canNotify && shouldNotify({ enabled: notifyOn(), permission: Notification.permission, hidden: document.hidden, focused: document.hasFocus() });
}

function notifyUser(kind, details) {
  if (!notifyAllowed()) return;
  const projectId = state.currentProject?.id || "";
  const content = notificationContent(kind, { project: state.currentProject?.name, ...details });
  try {
    const note = new Notification(content.title, { body: content.body, tag: `pi-studio:${kind}:${projectId}` });
    note.onclick = () => {
      window.focus();
      note.close();
    };
  } catch {
    // Some browsers only allow notifications through a service worker.
  }
}

function setAttention(projectId, patch) {
  if (!projectId) return;
  state.attention.set(projectId, { ...(state.attention.get(projectId) || {}), ...patch });
  renderProjects();
}

function markSeen(projectId) {
  if (state.attention.get(projectId)?.unseen && !pageUnseen()) setAttention(projectId, { unseen: false });
}

async function lastAssistantText() {
  try {
    const res = await rpcRequest({ type: "get_last_assistant_text" }, 4000);
    if (res.success && typeof res.data?.text === "string") return res.data.text;
  } catch {
    // Fall back to what the thread already holds.
  }
  return messageText(state.messages.findLast((message) => message?.role === "assistant"));
}

// The run is fully over (agent_settled): flag the project when nobody was looking, and notify.
async function onSettled() {
  const project = state.currentProject;
  if (!project || !pageUnseen()) return;
  setAttention(project.id, { unseen: true });
  if (!notifyAllowed()) return;
  notifyUser("done", { text: await lastAssistantText().catch(() => "") });
}

window.addEventListener("focus", () => state.currentProject && markSeen(state.currentProject.id));
document.addEventListener("visibilitychange", () => state.currentProject && markSeen(state.currentProject.id));

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
  scheduleInspector("terminal", "context", "files", "worktrees");
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

const VIEW_RENDERERS = { terminal: renderTerminal, subagents: renderSubagents, context: renderContext, files: renderFiles, worktrees: renderWorktrees };

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
  syncOrcaPolling();
}

els.tablist.addEventListener("click", (event) => {
  const tab = event.target.closest("[role=tab]");
  if (tab) selectTab(tab.dataset.tab);
});
els.tablist.addEventListener("keydown", (event) => {
  const tabs = els.tabs.filter((button) => !button.hidden);
  const index = tabs.findIndex((button) => button.dataset.tab === inspector.tab);
  const target = tabKeyTarget(event.key, index, tabs.length);
  if (target === null) return;
  event.preventDefault();
  selectTab(tabs[target].dataset.tab, { focus: true });
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
  els.term.scrollTo({ top: els.term.scrollHeight, behavior: prefersReducedMotion() ? "auto" : "smooth" });
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
  return collectSubagents(state.messages, state.runtime, state.subagentRecords, Date.now(), projectStatus.stall.subagentMs);
}

// Count badges (pure counting lives in lib.js): hidden at 0, otherwise the number with a tooltip/aria label.
function setBadge(node, count, label) {
  const text = countBadge(count);
  node.hidden = text === null;
  node.textContent = text ?? "";
  node.title = text === null ? "" : label;
  if (text === null) node.removeAttribute("aria-label");
  else node.setAttribute("aria-label", label);
}

function updateSubBadge(runs) {
  const running = runningSubagentCount(runs || currentSubagents());
  setBadge(els.subBadge, running, plural(running, "subagente rodando", "subagentes rodando"));
}

function updateFilesBadge() {
  setBadge(els.filesBadge, state.outputs.length, plural(state.outputs.length, "arquivo alterado", "arquivos alterados"));
}

function updateWorktreeBadges() {
  const running = orca.data?.available ? runningWorktreeCount(orca.data.worktrees, (worktree) => (worktree.projectId ? projectStatus.last.get(worktree.projectId) : null)) : 0;
  const label = plural(running, "worktree trabalhando", "worktrees trabalhando");
  setBadge(els.wtTabBadge, running, label);
  setBadge(els.worktreesBadge, running, label);
}

function subCard(run, open) {
  const node = document.createElement("article");
  const timing = subagentTiming(run);
  node.className = `sa-card is-${run.phase}${timing.stalled ? " is-stalled" : ""}${open ? " open" : ""}`;
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
    ${timing.text || timing.stalled ? `<p class="sa-timing">${timing.text ? `<span>${esc(timing.text)}</span>` : ""}${timing.stalled ? `<span class="sa-stalled"><i class="stall-dot" aria-hidden="true"></i>${esc(timing.stalled)}</span>` : ""}</p>` : ""}
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
    const sig = JSON.stringify([run, open, formatElapsed(run.elapsed), subagentTiming(run)]);
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
  const today = todayUsageRows(usageToday.data);
  const todaySection = today.length ? `<section class="insp-sec"><h3 class="sec-title">Hoje</h3><dl class="kv">${today.map(([label, value]) => row(label, value)).join("")}</dl></section>` : "";
  const now = Date.now();
  const problemRow = (item) => `<li><span class="session-state st-${item.kind === "error" ? "erro" : "aguardando"}" aria-hidden="true"></span><span class="prob-text">${esc(item.text)}</span>${item.at ? `<span class="prob-time">${esc(agoLabel(item.at, now))}</span>` : ""}</li>`;
  const problems = `<section class="insp-sec"><h3 class="sec-title">Erros e tentativas</h3>${state.problems.length
    ? `<ul class="prob-list">${[...state.problems].reverse().map(problemRow).join("")}</ul>`
    : `<p class="sec-hint">Nenhum erro nesta conversa.</p>`}</section>`;
  const compacting = state.compactingProjects.has(state.currentProject?.id);
  const blocked = !state.currentProject || state.processExited || state.isStreaming || compacting;
  const hint = compacting ? "Compactando… isso pode levar alguns instantes." : state.isStreaming ? "Disponível quando o PI terminar a resposta atual." : "Resume o histórico para liberar espaço na janela de contexto.";
  const compact = `<section class="insp-sec ctx-actions"><button type="button" class="btn btn-block" data-compact${blocked ? " disabled" : ""}${compacting ? ' aria-busy="true"' : ""}>${compacting ? `${svg("i-spinner", "spin")}Compactando…` : "Compactar agora"}</button><p class="sec-hint">${esc(hint)}</p></section>`;
  const focused = document.activeElement?.closest?.("[data-compact]") ? "[data-compact]" : document.activeElement?.closest?.("[data-copy-session]") ? "[data-copy-session]" : "";
  els.ctxView.innerHTML = `<section class="insp-sec ctx-hero">${hero}</section>${todaySection}${tokens}${problems}${model}${counts}${file}${compact}`;
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

async function compactNow({ instructions = "", confirm = true } = {}) {
  const projectId = state.currentProject?.id;
  if (!projectId || state.compactingProjects.has(projectId)) return;
  if (state.isStreaming) {
    toast("Disponível quando o PI terminar a resposta atual.", "warning");
    return;
  }
  const ok = !confirm || await confirmDialog({
    title: "Compactar o contexto agora?",
    message: "O PI resume o histórico desta conversa e passa a enviar o resumo ao modelo no lugar das mensagens antigas. As mensagens continuam salvas na sessão.",
    confirm: "Compactar",
  });
  if (!ok) return;
  state.compactingProjects.add(projectId);
  scheduleInspector("context");
  try {
    // Compaction calls the model and can take a while: no client-side timeout.
    const res = await rpcRequest({ type: "compact", ...(instructions ? { customInstructions: instructions } : {}) }, 0);
    if (!res.success) throw new Error(res.error || "Não foi possível compactar o contexto.");
    toast("Contexto compactado.");
  } catch (error) {
    report(error);
  } finally {
    state.compactingProjects.delete(projectId);
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

function composerHint(shell) {
  if (state.sending && state.gate) return "Aguardando o PI iniciar… a mensagem sai em seguida";
  if (state.bash) return "Comando em execução · Esc interrompe";
  if (shell) return state.isStreaming ? "Shell indisponível enquanto o PI responde" : "Executa no shell do projeto; o resultado entra no contexto";
  return state.isStreaming ? "Enter direciona · Ctrl+Enter enfileira" : "";
}

function updateComposer() {
  const value = els.prompt.value;
  const shell = isShellText(value);
  const hasContent = Boolean(value.trim() || state.attachments.length);
  // A shell command needs an idle agent and a command; nothing is sent while one is running.
  const blocked = Boolean(state.bash) || (shell && (state.isStreaming || !shellCommand(value)));
  // While a project/session is still opening (state.gate) sending is allowed: submit() waits.
  els.send.disabled = state.processExited || state.sending || !hasContent || blocked || (!state.currentProject && !state.gate);
  els.composer.classList.toggle("is-shell", shell);
  els.shellChip.hidden = !shell;
  els.stop.hidden = !(state.isStreaming || state.bash);
  els.send.classList.toggle("is-queue", state.isStreaming && !shell);
  els.send.setAttribute("aria-label", shell ? "Executar" : state.isStreaming ? "Direcionar (steer)" : "Enviar");
  els.hint.textContent = composerHint(shell);
  els.hint.title = els.hint.textContent;
  els.prompt.disabled = state.processExited;
}

// The long placeholder (/ commands, @ files, ! shell) does not fit a phone-width composer.
const narrowComposer = window.matchMedia("(max-width: 560px)");
const PLACEHOLDER_LONG = els.prompt.placeholder;
const applyPlaceholder = () => {
  els.prompt.placeholder = narrowComposer.matches ? "Mensagem · / @ !" : PLACEHOLDER_LONG;
};
narrowComposer.addEventListener("change", applyPlaceholder);
applyPlaceholder();

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
  if (state.processExited || state.sending) return;
  if (els.prompt.value.trim() || state.attachments.length) ensureNotifyPermission();
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
    if (state.processExited) return;
  }
  if (!state.currentProject) return;
  const message = els.prompt.value.trim();
  if (!message && !state.attachments.length) return;
  if (state.bash) return;
  closeComposerMenu();
  const builtin = parseBuiltin(message);
  if (builtin) return runBuiltin(builtin, message);
  if (isShellText(message)) return runShell(message);
  if (message) state.lastSent = message;
  state.recalled = null;
  const type = composerSendType(message, mode, state.commands);
  const capturedAttachments = state.attachments.slice();
  const images = capturedAttachments.map(({ data, mimeType }) => ({ type: "image", data, mimeType }));
  const id = newId();
  const command = { id, type, message, ...(images.length ? { images } : {}) };
  if (requestExceedsLimit(command, 30 * 1024 * 1024)) {
    toast("Anexos muito grandes (máx. 30 MB)", "error");
    return;
  }
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
    const restored = restoreFailedDraft(els.prompt.value, state.attachments, message, capturedAttachments);
    if (restored.message !== els.prompt.value) els.prompt.value = restored.message;
    if (restored.attachments !== state.attachments) state.attachments = restored.attachments;
    autoResize();
    renderAttachments();
  };
  // The response may arrive only after an extension command finishes, so no timeout.
  const request = rpcRequest(command, 0);
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
  if (composerMenu.kind && handleComposerMenuKey(event)) return;
  const recalled = state.recalled !== null && els.prompt.value === state.recalled;
  const recall = recallAction(event, { empty: !els.prompt.value.trim(), recalled });
  if (recall === "recall" && state.lastSent) {
    event.preventDefault();
    state.recalled = state.lastSent;
    setComposerText(state.lastSent);
    return;
  }
  if (recall === "clear") {
    event.preventDefault();
    event.stopPropagation();
    clearComposer();
    return;
  }
  const action = composerAction(event, state.isStreaming);
  if (!action || action === "newline") return;
  event.preventDefault();
  submit(action);
});
els.prompt.addEventListener("input", () => {
  autoResize();
  updateComposer();
  syncComposerMenus();
});
els.prompt.addEventListener("blur", () => closeComposerMenu());
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

function setComposerText(text, cursor = text.length) {
  els.prompt.value = text;
  els.prompt.setSelectionRange(cursor, cursor);
  autoResize();
  updateComposer();
}

function clearComposer() {
  els.prompt.value = "";
  state.recalled = null;
  autoResize();
  updateComposer();
}

// Stop button and Esc: a running shell command first, otherwise the agent's response.
function interrupt() {
  if (state.bash) return sendRpc({ type: "abort_bash" }).catch(report);
  if (state.isStreaming) return sendRpc({ type: "abort" }).catch(report);
  return undefined;
}
els.stop.addEventListener("click", interrupt);

// ----------------------------------------------------- built-in / commands

async function renameSession(title) {
  if (!title) {
    toast("Use /name seguido do título da conversa.", "warning");
    return;
  }
  const res = await rpcRequest({ type: "set_session_name", name: title });
  if (!res.success) throw new Error(res.error || "Não foi possível renomear a conversa.");
  toast(`Conversa renomeada: ${truncate(title, 60)}`);
  sendRpc({ type: "get_state" }).catch(() => {});
  await refreshHistory();
}

async function exportSession() {
  // Rendering the whole session can take a while on a long conversation.
  const res = await rpcRequest({ type: "export_html" }, 120000);
  if (!res.success) throw new Error(res.error || "Não foi possível exportar a conversa.");
  const file = res.data?.path;
  if (!file) {
    toast("Conversa exportada.");
    return;
  }
  toast(`Exportado em ${file}`, "info", {
    label: "Copiar caminho",
    run: () => {
      if (!navigator.clipboard) throw new Error("A cópia não está disponível neste navegador.");
      return navigator.clipboard.writeText(file).then(() => toast("Caminho copiado."));
    },
  });
}

const BUILTIN_HANDLERS = {
  new: () => newSession(),
  compact: (instructions) => compactNow({ instructions, confirm: false }),
  name: renameSession,
  export: exportSession,
  atalhos: () => toggleShortcuts(true),
};

async function runBuiltin({ name, args }, text) {
  state.lastSent = text;
  clearComposer();
  try {
    await BUILTIN_HANDLERS[name](args);
  } catch (error) {
    report(error);
  }
}

// `!command`: runs in the project shell through PI's bash RPC; the block streams into the thread.
async function runShell(text) {
  const command = shellCommand(text);
  if (!command) return;
  if (state.isStreaming) {
    toast("O shell fica indisponível enquanto o PI responde.", "warning");
    return;
  }
  state.lastSent = text;
  const id = newId();
  const block = { role: "bashExecution", command, output: "", exitCode: null, cancelled: false, truncated: false, timestamp: Date.now(), _bash: true, _live: true, _bashId: id };
  state.messages.push(block);
  state.bash = { id };
  state.stick = true;
  clearComposer();
  scheduleRender();
  try {
    // The response arrives when the command ends, however long it runs: no client-side timeout.
    finishBash(block, await rpcRequest({ type: "bash", id, command }, 0));
  } catch (error) {
    finishBash(block, { success: false, error: error.message });
  } finally {
    if (state.bash?.id === id) state.bash = null;
    updateComposer();
    scheduleRender();
  }
  if (!state.processExited) {
    sendRpc({ type: "get_entries" }).catch(() => {});
    refreshStats();
  }
}

// ---------------------------------------------------- shortcuts overlay

function renderShortcuts() {
  els.shortcutsBody.replaceChildren(...SHORTCUT_GROUPS.map((group) => {
    const section = document.createElement("section");
    const rows = group.items.map((item) => `<div class="shortcut-row"><span>${esc(item.label)}</span><span class="shortcut-keys">${item.keys.map((key) => `<kbd>${esc(key)}</kbd>`).join("")}</span></div>`);
    section.innerHTML = `<h4>${esc(group.title)}</h4>${rows.join("")}`;
    return section;
  }));
}

function toggleShortcuts(open = !els.shortcutsDialog.open) {
  if (open === els.shortcutsDialog.open) return;
  if (open) els.shortcutsDialog.showModal();
  else els.shortcutsDialog.close();
}

// ------------------------------------------ composer popovers (/ and @)

// kind: "slash" | "mention" | null (closed). entries: [{ item, command | file }].
const composerMenu = { kind: null, entries: [], index: 0 };
let mentionTimer = null;
let mentionSeq = 0;

function resetComposerMenu() {
  composerMenu.kind = null;
  composerMenu.entries = [];
  composerMenu.index = 0;
  els.prompt.removeAttribute("aria-activedescendant");
}

function cancelMention() {
  mentionSeq++;
  clearTimeout(mentionTimer);
}

function closeComposerMenu() {
  cancelMention();
  if (composerMenu.kind) closeMenu();
  resetComposerMenu();
}

function showComposerMenu(kind, entries, index = 0) {
  // Another menu (model, project) opened meanwhile owns the popover, and late results (commands,
  // files) must not pop up after the user left the composer.
  if ((!els.menu.hidden && !composerMenu.kind) || document.activeElement !== els.prompt) return;
  closeMenu();
  if (!entries.length) return;
  composerMenu.kind = kind;
  composerMenu.entries = entries;
  composerMenu.index = index;
  const items = entries.map((entry, position) => ({ ...entry.item, active: position === index, onSelect: () => acceptComposerEntry(kind, entry, "click") }));
  openMenu(els.composer, items, { placement: "above", passive: true, wide: true, onClose: resetComposerMenu });
  els.prompt.setAttribute("aria-activedescendant", `menu-opt-${index}`);
}

function setComposerCompletion(text, cursor) {
  setComposerText(text, cursor);
  closeComposerMenu();
  els.prompt.focus();
}

// via: "enter" | "tab" | "click". Enter submits a command that is already complete.
function acceptComposerEntry(kind, entry, via) {
  if (kind === "slash") {
    const query = slashQuery(els.prompt.value);
    if (via === "enter" && query !== null && slashEnterSubmits(entry.command, query)) {
      closeComposerMenu();
      return submit(state.isStreaming ? "steer" : "prompt").catch(report);
    }
    return setComposerCompletion(slashCompletion(entry.command));
  }
  const token = mentionToken(els.prompt.value, els.prompt.selectionStart);
  if (!token) return closeComposerMenu();
  const next = insertMention(els.prompt.value, token, entry.file);
  return setComposerCompletion(next.text, next.cursor);
}

function handleComposerMenuKey(event) {
  if (event.isComposing) return false;
  const plain = !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey;
  if ((event.key === "ArrowDown" || event.key === "ArrowUp") && plain) {
    event.preventDefault();
    const count = composerMenu.entries.length;
    const step = event.key === "ArrowDown" ? 1 : -1;
    showComposerMenu(composerMenu.kind, composerMenu.entries, (composerMenu.index + step + count) % count);
    return true;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    closeComposerMenu();
    return true;
  }
  if ((event.key === "Tab" || event.key === "Enter") && plain) {
    event.preventDefault();
    acceptComposerEntry(composerMenu.kind, composerMenu.entries[composerMenu.index], event.key === "Enter" ? "enter" : "tab");
    return true;
  }
  // Moving the caret leaves the word the menu was completing.
  if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) closeComposerMenu();
  return false;
}

function slashEntries(commands, query) {
  return filterCommands(commands, query).map((command) => ({
    command,
    item: { label: `/${command.name}`, sub: [command.args, command.description].filter(Boolean).join(" · "), badge: sourceLabel(command.source) },
  }));
}

// PI's get_commands (extensions, prompt templates, skills): fetched once per conversation.
async function loadCommands() {
  if (state.commandsLoading) return;
  state.commandsLoading = true;
  const project = state.currentProject;
  try {
    const res = await rpcRequest({ type: "get_commands" }, 15000);
    if (res.success && state.currentProject === project) state.commands = Array.isArray(res.data?.commands) ? res.data.commands : [];
  } catch {
    // Built-ins still work; the next "/" retries.
  } finally {
    state.commandsLoading = false;
  }
  if (state.commands) refreshSlashMenu(true);
}

function refreshSlashMenu(keepIndex = false) {
  const query = slashQuery(els.prompt.value);
  if (query === null) {
    if (composerMenu.kind === "slash") closeComposerMenu();
    return;
  }
  if (!state.commands && state.currentProject && !state.processExited) loadCommands();
  const entries = slashEntries(mergeCommands(state.commands || []), query);
  const index = keepIndex && composerMenu.kind === "slash" ? Math.min(composerMenu.index, entries.length - 1) : 0;
  if (entries.length) showComposerMenu("slash", entries, index);
  else closeComposerMenu();
}

function refreshMentionMenu(token) {
  cancelMention();
  const seq = mentionSeq;
  mentionTimer = setTimeout(async () => {
    const project = state.currentProject;
    if (!project) return;
    try {
      const { files } = await api(`/api/projects/${encodeURIComponent(project.id)}/files?q=${encodeURIComponent(token.query)}`);
      if (seq !== mentionSeq) return;
      const entries = (files || []).map((file) => ({ file, item: { label: basename(file), sub: file === basename(file) ? "" : file, icon: "i-file" } }));
      if (entries.length) showComposerMenu("mention", entries);
      else closeComposerMenu();
    } catch {
      if (seq === mentionSeq) closeComposerMenu();
    }
  }, 120);
}

function syncComposerMenus() {
  const value = els.prompt.value;
  if (isShellText(value)) return closeComposerMenu();
  if (slashQuery(value) !== null) {
    cancelMention();
    return refreshSlashMenu();
  }
  const token = mentionToken(value, els.prompt.selectionStart);
  return token ? refreshMentionMenu(token) : closeComposerMenu();
}

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
      if (!req.id || state.uiRequestIds.has(req.id)) break;
      state.uiRequestIds.add(req.id);
      notifyUser("input", { title: req.title, text: req.message });
      state.uiQueue.push(req);
      if (!state.uiActive) nextUiDialog();
      break;
  }
}

function nextUiDialog() {
  const req = state.uiQueue.shift();
  state.uiActive = req || null;
  setAttention(state.currentProject?.id, { waiting: Boolean(req) });
  if (req) openUiDialog(req);
}

let dialogTimer = null;

function closeUiDialog() {
  clearTimeout(dialogTimer);
  if (state.uiActive?.id) state.uiRequestIds.delete(state.uiActive.id);
  if (els.dialog.open) els.dialog.close();
  state.uiActive = null;
  setTimeout(nextUiDialog, 120);
}

function resolveUiDialog(id) {
  if (!id) return;
  if (state.uiActive?.id === id) {
    closeUiDialog();
    return;
  }
  state.uiQueue = state.uiQueue.filter((req) => req.id !== id);
  state.uiRequestIds.delete(id);
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
  els.customizeDialog.returnValue = "";
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

// ------------------------------------------------------- settings dialog

function openSettings() {
  const denied = canNotify && Notification.permission === "denied";
  for (const input of els.settingFont) input.checked = input.value === settings.fontSize;
  for (const input of els.settingWidth) input.checked = input.value === settings.chatWidth;
  els.settingNotify.checked = notifyOn() && !denied;
  els.settingNotifyHint.textContent = denied
    ? "Bloqueadas pelo navegador: libere nas permissões do site."
    : "Avisa quando o PI termina ou precisa de você, com a aba em segundo plano.";
  els.settingMotion.checked = settings.reduceMotion;
  els.settingThinking.checked = Boolean(prefs.showThinking);
  els.settingOrca.checked = orcaOn();
  els.settingOrcaFollow.checked = settings.orcaFollow;
  els.settingOrcaFollow.disabled = !orcaOn();
  els.settingsDialog.showModal();
}

els.settingsDialog.addEventListener("change", (event) => {
  const { target } = event;
  if (target.name === "settingFont") settings.fontSize = target.value;
  else if (target.name === "settingWidth") settings.chatWidth = target.value;
  else if (target === els.settingMotion) settings.reduceMotion = target.checked;
  else if (target === els.settingOrca) Object.assign(settings, { orcaEnabled: target.checked, orcaChosen: true });
  else if (target === els.settingOrcaFollow) {
    settings.orcaFollow = target.checked;
    orca.lastFollowed = null;
  } else if (target === els.settingNotify) {
    localStorage.setItem(NOTIFY_KEY, target.checked ? "1" : "0");
    ensureNotifyPermission();
  } else if (target === els.settingThinking) {
    prefs.showThinking = target.checked;
    savePrefs();
    nodeCache.clear();
    renderThread();
    return;
  }
  saveSettings();
  if (target === els.settingOrca || target === els.settingOrcaFollow) {
    els.settingOrcaFollow.disabled = !orcaOn();
    applyOrcaSettings();
  }
});

// ----------------------------------------------- Orca worktrees + project status

const POLL_MS = 3000;

// The integration is on when the user said so; until then it follows whether Orca answered (see orcaEnabledNow).
const orcaOn = () => orcaEnabledNow(settings, orca.data?.available);

function applyOrcaSettings() {
  if (settings.orcaEnabled === false) {
    orca.data = null;
    orca.lastFollowed = null;
    closeWorktrees();
  }
  const on = orcaOn();
  els.tabs.find((button) => button.dataset.tab === "worktrees").hidden = !on;
  els.tablist.classList.toggle("has-worktrees", on);
  els.worktreesBtn.hidden = !(on && orca.data?.available);
  updateWorktreeBadges();
  orca.uiKey = `${on}/${Boolean(orca.data?.available)}`;
  if (!on && inspector.tab === "worktrees") selectTab("terminal");
  syncOrcaPolling();
  if (on && !orca.data) pollOrca();
}

// Orca is only asked while the Worktrees tab is on screen or follow mode is on, and never in a hidden page.
function syncOrcaPolling() {
  const wanted = orcaPollWanted({
    enabled: orcaOn(),
    follow: settings.orcaFollow,
    // The top-bar button's running count keeps Orca polled while the button is shown.
    tabVisible: (inspector.tab === "worktrees" && layout.right === "open") || els.worktreesDialog.open || !els.worktreesBtn.hidden,
    hidden: document.hidden,
  });
  if (wanted && !orca.timer) {
    orca.timer = setInterval(pollOrca, POLL_MS);
    pollOrca();
  } else if (!wanted && orca.timer) {
    clearInterval(orca.timer);
    orca.timer = null;
  }
}

async function pollOrca() {
  if (orca.inflight) return;
  orca.inflight = true;
  let data;
  try {
    data = await api("/api/orca");
  } catch {
    data = { available: false, reason: "failed", active: null, worktrees: [] };
  } finally {
    orca.inflight = false;
  }
  if (settings.orcaEnabled === false) return;
  orca.data = data;
  updateWorktreeBadges();
  if (orca.uiKey !== `${orcaOn()}/${Boolean(data.available)}`) applyOrcaSettings();
  scheduleInspector("worktrees");
  renderWorktreesOverlay();
  followOrca();
}

function openWorktree(worktree) {
  if (samePath(state.currentProject?.cwd, worktree.path)) return Promise.resolve();
  if (worktree.projectId) return openProject(worktree.projectId);
  return runGated(state, () => loadProject(null, { cwd: worktree.path }));
}

// Follow mode: switch to the worktree focused in Orca, unless the user is mid-sentence or answering a dialog
// (then it waits for the next poll). A manual project choice is kept until Orca's focus changes again.
function followOrca() {
  const active = orca.data?.active;
  if (!state.currentProject) return;
  const decision = followDecision({
    enabled: settings.orcaFollow,
    activePath: active?.path,
    lastFollowed: orca.lastFollowed,
    currentPath: state.currentProject.cwd,
    composerText: Boolean(els.prompt.value.trim()) || state.attachments.length > 0,
    dialogOpen: Boolean(document.querySelector("dialog[open]")) || Boolean(state.uiActive),
  });
  if (decision === "mark") orca.lastFollowed = active.path;
  if (decision !== "switch") return;
  const worktree = orca.data.worktrees.find((item) => samePath(item.path, active.path)) || { path: active.path, name: basename(active.path) };
  openWorktree(worktree)
    .then(() => {
      orca.lastFollowed = followedPath(orca.lastFollowed, active.path, true);
      toast(`Seguindo o Orca: ${worktree.name}`);
    })
    .catch(report);
}

function worktreeCard(worktree) {
  const row = worktreeRow(worktree);
  const current = samePath(state.currentProject?.cwd, worktree.path);
  const node = document.createElement("article");
  node.className = `sa-card wt-card${row.running ? " is-running" : ""}${current ? " is-current" : ""}`;
  node.innerHTML = `
    <button type="button" class="sa-head" data-wt="${esc(worktree.path)}" data-project="${esc(worktree.projectId || "")}"${current ? ' aria-current="true"' : ""}>
      <span class="sa-dot" aria-hidden="true"></span>
      <span class="sa-title"><strong>${esc(row.name)}</strong><span class="sa-type">${esc(row.sub)}</span></span>
      <span class="sa-state">${row.unread ? '<span class="wt-unread" role="img" aria-label="não lido" title="Não lido"></span>' : ""}${row.active ? '<span class="wt-flag" title="Em foco no Orca">Orca</span>' : ""}<span class="sa-phase">${esc(row.statusLabel)}</span></span>
    </button>
    <div class="wt-body">
      ${row.agents ? `<p class="sa-desc">${esc(row.agents)}</p>` : ""}
      ${row.message ? `<p class="wt-msg">${esc(row.message)}</p>` : ""}
      ${row.meta.length ? `<p class="sa-meta">${row.meta.map((item) => `<span>${esc(item)}</span>`).join("")}</p>` : ""}
    </div>`;
  return node;
}

function renderWorktrees() {
  const data = orca.data;
  const sig = JSON.stringify([data, state.currentProject?.cwd]);
  if (sig === orca.renderSig) return;
  orca.renderSig = sig;
  const focused = els.wtList.contains(document.activeElement) ? document.activeElement.dataset.wt : null;
  let nodes;
  if (!data || !data.available || !data.worktrees.length) {
    const [title, hint] = !data
      ? ["Carregando…", ""]
      : !data.available
        ? data.reason === "not-found"
          ? ["Disponível no app desktop", "O Orca não foi encontrado neste ambiente (por exemplo, dentro do Docker)."]
          : ["Não foi possível ler o Orca", "O Studio tenta de novo a cada poucos segundos."]
        : ["Nenhuma worktree no Orca", "As worktrees abertas no Orca aparecem aqui."];
    const empty = document.createElement("div");
    empty.className = "insp-empty";
    empty.innerHTML = `${svg("i-branch")}<strong>${esc(title)}</strong>${hint ? `<span>${esc(hint)}</span>` : ""}`;
    nodes = [empty];
  } else {
    nodes = sortWorktrees(data.worktrees).map(worktreeCard);
  }
  els.wtList.replaceChildren(...nodes);
  if (focused) [...els.wtList.querySelectorAll("[data-wt]")].find((button) => button.dataset.wt === focused)?.focus({ preventScroll: true });
}

els.wtList.addEventListener("click", (event) => {
  const head = event.target.closest("[data-wt]");
  if (!head) return;
  openWorktree({ path: head.dataset.wt, projectId: head.dataset.project }).catch(report);
});

// Sidebar dots for every project with a live PI, not only the open one.
const projectStatus = { last: new Map(), inflight: false, running: new Map(), stalled: new Map(), stall: stallThresholds() };

// The server's clock stamps events and statuses; "há N min" is computed against it, not the browser's.
const clock = { skew: 0 };
const serverNow = () => Date.now() + clock.skew;

function applyProjectStatuses(statuses, meta = {}) {
  if (Number.isFinite(meta.now)) clock.skew = meta.now - Date.now();
  if (meta.stall) projectStatus.stall = meta.stall;
  const next = new Map(statuses.map((status) => [status.projectId, status]));
  const running = new Map(Object.entries(meta.runningCounts || {}));
  const stalled = new Map();
  let changed = false;
  for (const project of state.projects) {
    const status = next.get(project.id);
    const stalledLabel = stalledPi(status, serverNow(), projectStatus.stall.piMs);
    if (stalledLabel) stalled.set(project.id, stalledLabel);
    if ((projectStatus.stalled.get(project.id) ?? null) !== stalledLabel) changed = true;
    if ((projectStatus.running.get(project.id) ?? 0) !== (running.get(project.id) ?? 0)) changed = true;
    if (studioPiState(projectStatus.last.get(project.id)) !== studioPiState(status)) changed = true;
    const isCurrent = state.currentProject?.id === project.id;
    const activeSessionId = status ? (status.exited ? null : status.sessionId) : isCurrent ? project.activeSessionId : null;
    if (project.activeSessionId !== activeSessionId) {
      project.activeSessionId = activeSessionId;
      changed = true;
    }
    const patch = statusAttention(projectStatus.last.get(project.id), status, isCurrent);
    const known = state.attention.get(project.id) || {};
    if (patch && Object.keys(patch).some((key) => Boolean(known[key]) !== Boolean(patch[key]))) {
      state.attention.set(project.id, { ...known, ...patch });
      changed = true;
    }
  }
  projectStatus.last = next;
  projectStatus.running = running;
  projectStatus.stalled = stalled;
  updateWorktreeBadges();
  if (changed) renderProjects();
  renderWorktreesOverlay();
}

async function pollProjectStatus() {
  if (document.hidden || projectStatus.inflight) return;
  projectStatus.inflight = true;
  try {
    const data = await api("/api/projects/status");
    applyProjectStatuses(data.statuses || [], data);
  } catch {
    // Transient: the next poll retries.
  } finally {
    projectStatus.inflight = false;
  }
}

// Activity feed: polled with the last seq seen; the first answer is the baseline, so only later items count as unseen.
const activity = { items: [], seq: 0, epoch: null, seenSeq: 0, primed: false, inflight: false };

function updateActivityBadge() {
  const unseen = unseenActivity(activity.items, activity.seenSeq);
  setBadge(els.activityBadge, unseen, plural(unseen, "evento novo", "eventos novos"));
}

async function pollActivity() {
  if (document.hidden || activity.inflight) return;
  activity.inflight = true;
  try {
    const data = await api(activitySinceUrl(activity.seq, activity.epoch));
    clock.skew = data.now - Date.now();
    if (data.epoch !== undefined) activity.epoch = data.epoch;
    if (data.reset) activity.items = [];
    activity.items = [...activity.items, ...data.items].slice(-ACTIVITY_LIMIT);
    activity.seq = data.seq;
    if (!activity.primed || (els.worktreesDialog.open && wtv.mode === "activity")) activity.seenSeq = data.seq;
    else if (data.reset) activity.seenSeq = 0;
    activity.primed = true;
    updateActivityBadge();
    renderWorktreesOverlay();
  } catch {
    // Transient: the next poll retries.
  } finally {
    activity.inflight = false;
  }
}

setInterval(pollProjectStatus, POLL_MS);
setInterval(pollActivity, POLL_MS);
pollActivity();
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    pollProjectStatus();
    pollActivity();
    // Orca may have started since the last probe.
    if (settings.orcaEnabled !== false && orca.data?.available !== true) pollOrca();
  }
  syncOrcaPolling();
  syncHistoryPolling();
});

// ------------------------------------------------------ worktrees overview (top bar)

const wtv = { mode: "worktrees", query: "", selected: null, entries: [], sig: "" };
// Rows of the worktrees mode are identified by path, rows of the activity mode by seq.
const wtvKey = (item) => (wtv.mode === "activity" ? item.seq : item.path);

function worktreeEmptyText() {
  if (!orca.data) return "Carregando…";
  if (!orca.data.available) return orca.data.reason === "not-found" ? "O Orca não foi encontrado neste ambiente." : "Não foi possível ler o Orca.";
  return wtv.query.trim() ? "Nada encontrado." : "Nenhuma worktree no Orca.";
}

function worktreeOverviewItem(worktree, detail, index) {
  const selected = worktree.path === wtv.selected;
  const current = samePath(state.currentProject?.cwd, worktree.path);
  const node = document.createElement("div");
  node.id = `wtv-opt-${index}`;
  node.className = `wtv-item${selected ? " active" : ""}${detail.running ? " is-running" : ""}`;
  node.setAttribute("role", "option");
  node.setAttribute("aria-selected", String(selected));
  node.dataset.index = String(index);
  if (current) node.setAttribute("aria-current", "true");
  const meta = [worktree.repo, detail.issue, detail.pr, detail.terminals, detail.lastActivity && `atividade ${detail.lastActivity}`].filter(Boolean);
  node.innerHTML = `
    <div class="wtv-head">
      <span class="sa-dot" aria-hidden="true"></span>
      <span class="sa-title"><strong>${esc(detail.name)}</strong><span class="sa-type">${esc(detail.sub)}</span></span>
      <span class="sa-state">
        ${detail.unread ? '<span class="wt-unread" role="img" aria-label="não lido" title="Não lido"></span>' : ""}
        ${current ? '<span class="wt-flag">Aberta</span>' : ""}
        ${detail.active ? '<span class="wt-flag" title="Em foco no Orca">Orca</span>' : ""}
        ${detail.studio ? `<span class="wt-flag wtv-chip"><span class="session-state st-${esc(detail.studio.key)}" aria-hidden="true"></span>${esc(detail.studio.label)}</span>` : ""}
        ${detail.stalled ? `<span class="wt-flag wtv-chip"><i class="stall-dot" aria-hidden="true"></i>${esc(detail.stalled)}</span>` : ""}
        <span class="sa-phase">${esc(detail.statusLabel)}</span>
      </span>
    </div>
    ${meta.length ? `<p class="sa-meta">${meta.map((item) => `<span>${esc(item)}</span>`).join("")}</p>` : ""}
    ${detail.comment ? `<p class="wtv-comment">${esc(detail.comment)}</p>` : ""}
    ${detail.agents.length ? `<ul class="wtv-agents">${detail.agents.map((agent) => `
      <li class="wtv-agent">
        <span class="wtv-agent-head"><span class="session-state${agent.key ? ` st-${esc(agent.key)}` : ""}" aria-hidden="true"></span><span class="wtv-agent-title">${esc(agent.title)}</span><span class="sa-phase">${esc(agent.label)}</span></span>
        ${agent.message ? `<span class="wtv-msg">${esc(agent.message)}</span>` : ""}
      </li>`).join("")}</ul>` : ""}`;
  return node;
}

function activityItem(row, index) {
  const selected = row.seq === wtv.selected;
  const node = document.createElement("div");
  node.id = `wtv-opt-${index}`;
  node.className = `wtv-item wtv-activity${selected ? " active" : ""}`;
  node.setAttribute("role", "option");
  node.setAttribute("aria-selected", String(selected));
  node.dataset.index = String(index);
  node.innerHTML = `
    <div class="wtv-head">
      <span class="session-state${row.dot ? ` st-${esc(row.dot)}` : ""}" aria-hidden="true"></span>
      <span class="sa-title"><strong>${esc(row.project)}</strong></span>
      <span class="sa-state"><span class="sa-phase">${esc(row.ago)}</span></span>
    </div>
    <p class="wtv-comment">${esc(row.text)}</p>`;
  return node;
}

function renderActivityList() {
  const rows = activityRows(activity.items, wtv.query, serverNow());
  wtv.entries = rows;
  if (!rows.some((row) => row.seq === wtv.selected)) wtv.selected = rows[0]?.seq ?? null;
  const sig = JSON.stringify([rows, wtv.selected]);
  if (sig === wtv.sig) return;
  wtv.sig = sig;
  const scrollTop = els.worktreesList.scrollTop;
  const nodes = rows.map(activityItem);
  if (!nodes.length) nodes.push(el("div", "palette-empty", wtv.query.trim() ? "Nada encontrado." : "Nenhuma atividade ainda."));
  els.worktreesList.replaceChildren(...nodes);
  els.worktreesList.scrollTop = scrollTop;
  const activeIndex = rows.findIndex((row) => row.seq === wtv.selected);
  els.worktreesInput.setAttribute("aria-activedescendant", activeIndex >= 0 ? `wtv-opt-${activeIndex}` : "");
}

// "Worktrees | Atividade" segmented control of the overlay; the filter and the list are shared.
function setWtvMode(mode) {
  Object.assign(wtv, { mode, query: "", selected: null, sig: "", entries: [] });
  const isActivity = mode === "activity";
  els.worktreesInput.value = "";
  els.worktreesInput.placeholder = isActivity ? "Filtrar atividade por projeto ou texto…" : "Filtrar worktrees por nome, branch ou repositório…";
  els.worktreesInput.setAttribute("aria-label", isActivity ? "Filtrar atividade" : "Filtrar worktrees");
  els.worktreesList.setAttribute("aria-label", isActivity ? "Atividade" : "Worktrees");
  for (const input of els.wtvModes) input.checked = input.value === mode;
  if (isActivity) {
    activity.seenSeq = activity.seq;
    updateActivityBadge();
  }
  renderWorktreesOverlay();
}

for (const input of els.wtvModes) {
  input.addEventListener("change", () => {
    setWtvMode(input.value);
    els.worktreesInput.focus();
  });
}

// Re-rendered by every Orca / project-status poll while open; skipped when nothing visible changed.
function renderWorktreesOverlay() {
  if (!els.worktreesDialog.open) return;
  if (wtv.mode === "activity") return renderActivityList();
  const now = serverNow();
  const data = orca.data;
  const groups = groupWorktrees(data?.available ? filterWorktrees(data.worktrees, wtv.query) : []);
  wtv.entries = groups.flatMap((group) => group.worktrees);
  if (!wtv.entries.some((item) => item.path === wtv.selected)) wtv.selected = wtv.entries[0]?.path ?? null;
  const details = new Map(wtv.entries.map((worktree) => [worktree, worktreeDetail(worktree, worktree.projectId ? projectStatus.last.get(worktree.projectId) : null, now, projectStatus.stall.piMs)]));
  const sig = JSON.stringify([[...details.values()], groups.map((group) => group.repo), wtv.selected, worktreeEmptyText(), state.currentProject?.cwd]);
  if (sig === wtv.sig) return;
  wtv.sig = sig;
  const scrollTop = els.worktreesList.scrollTop;
  const nodes = [];
  let position = 0;
  for (const group of groups) {
    nodes.push(el("div", "palette-section", group.repo));
    for (const worktree of group.worktrees) nodes.push(worktreeOverviewItem(worktree, details.get(worktree), position++));
  }
  if (!nodes.length) nodes.push(el("div", "palette-empty", worktreeEmptyText()));
  els.worktreesList.replaceChildren(...nodes);
  els.worktreesList.scrollTop = scrollTop;
  const activeIndex = wtv.entries.findIndex((item) => item.path === wtv.selected);
  els.worktreesInput.setAttribute("aria-activedescendant", activeIndex >= 0 ? `wtv-opt-${activeIndex}` : "");
}

function openWorktrees(mode = "worktrees") {
  closeMenu();
  els.worktreesDialog.showModal();
  setWtvMode(mode === "activity" ? "activity" : "worktrees");
  els.worktreesInput.focus();
  pollOrca();
  pollProjectStatus();
  pollActivity();
  syncOrcaPolling();
}

function closeWorktrees() {
  if (els.worktreesDialog.open) els.worktreesDialog.close();
}

els.worktreesDialog.addEventListener("close", syncOrcaPolling);

function chooseWorktree(index) {
  const worktree = wtv.entries[index];
  if (!worktree) return;
  closeWorktrees();
  if (wtv.mode === "activity") {
    if (state.currentProject?.id !== worktree.projectId) openProject(worktree.projectId).then(() => toast(`Projeto: ${worktree.project}`)).catch(report);
    return;
  }
  openWorktree(worktree)
    .then(() => toast(`Worktree: ${worktree.name}`))
    .catch(report);
}

els.worktreesInput.addEventListener("input", () => {
  wtv.query = els.worktreesInput.value;
  wtv.selected = null;
  renderWorktreesOverlay();
});

els.worktreesInput.addEventListener("keydown", (event) => {
  const index = Math.max(0, wtv.entries.findIndex((item) => wtvKey(item) === wtv.selected));
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    const target = wtv.entries[stepIndex(index, event.key === "ArrowDown" ? 1 : -1, wtv.entries.length)];
    wtv.selected = target ? wtvKey(target) : null;
    renderWorktreesOverlay();
    els.worktreesList.querySelector(".wtv-item.active")?.scrollIntoView({ block: "nearest" });
  } else if (event.key === "Enter" && !event.isComposing) {
    event.preventDefault();
    chooseWorktree(index);
  }
});

// Keep focus in the filter while the pointer picks a row; clicking the backdrop closes.
els.worktreesList.addEventListener("mousedown", (event) => event.preventDefault());
els.worktreesList.addEventListener("click", (event) => {
  const option = event.target.closest(".wtv-item");
  if (option) chooseWorktree(Number(option.dataset.index));
});
els.worktreesDialog.addEventListener("click", (event) => {
  if (event.target === els.worktreesDialog) closeWorktrees();
});
els.worktreesBtn.addEventListener("click", () => openWorktrees());


// ------------------------------------------------------ command palette

const PALETTE_ICONS = { session: "i-code", hit: "i-search" };
const palette = { query: "", entries: [], index: 0, hits: [], loading: false, indexing: false, seq: 0, timer: null };

function paletteActions() {
  const rightTab = (tab) => () => {
    setPanel("right", true);
    selectTab(tab);
  };
  return [
    { label: "Nova conversa", icon: "i-plus", keywords: "novo chat", run: () => newSession() },
    { label: "Alternar Inspector", icon: "i-panel", keywords: "painel inspetor", run: () => setPanel("right", layout.right !== "open") },
    { label: "Abrir aba Terminal", icon: "i-terminal", run: rightTab("terminal") },
    { label: "Abrir aba Subagentes", icon: "i-agents", run: rightTab("subagents") },
    { label: "Abrir aba Contexto", icon: "i-gauge", run: rightTab("context") },
    { label: "Abrir aba Arquivos", icon: "i-files", run: rightTab("files") },
    ...(orcaOn() ? [{ label: "Abrir aba Worktrees", icon: "i-branch", keywords: "orca", run: rightTab("worktrees") }] : []),
    ...(!els.worktreesBtn.hidden ? [{ label: "Ver worktrees", icon: "i-branch", keywords: "orca visão geral alt+w", run: () => openWorktrees() }] : []),
    { label: "Ver atividade", icon: "i-agents", keywords: "feed eventos erros terminou subagentes", run: () => openWorktrees("activity") },
    { label: "Exportar conversa", icon: "i-file", keywords: "html salvar", run: () => exportSession() },
    { label: "Compactar conversa", icon: "i-gauge", keywords: "contexto resumir", run: () => compactNow() },
    { label: "Atalhos de teclado", icon: "i-code", keywords: "ajuda teclas", run: () => toggleShortcuts(true) },
    { label: "Configurações", icon: "i-gear", keywords: "preferências fonte largura", run: openSettings },
  ];
}

function paletteSessions() {
  const tagged = (projectId, list) => list.map((item) => ({ ...item, projectId }));
  const all = [
    ...(state.currentProject ? tagged(state.currentProject.id, state.history) : []),
    ...[...state.otherHistory].flatMap(([projectId, list]) => tagged(projectId, list)),
  ].sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
  return all.map((item) => ({
    label: item.title || "Nova conversa",
    sub: state.projects.find((project) => project.id === item.projectId)?.name || "",
    icon: PALETTE_ICONS.session,
    run: () => openSession(item.projectId, item.path),
  }));
}

function paletteGroups() {
  return [
    { title: "Ações", items: paletteActions(), limit: 10 },
    {
      title: "Projetos",
      items: state.projects.map((project) => ({ label: "Abrir projeto " + project.name, sub: project.cwd, icon: "i-folder-open", run: () => openProject(project.id) })),
      limit: 5,
    },
    { title: "Conversas recentes", items: paletteSessions(), limit: 6 },
    {
      title: "Nas conversas",
      raw: true,
      limit: 10,
      items: palette.hits.map((hit) => ({ label: hit.title, sub: hit.snippet, icon: PALETTE_ICONS.hit, run: () => openSession(hit.projectId, hit.sessionPath) })),
    },
  ];
}

function renderPalette() {
  const sections = paletteSections(paletteGroups(), palette.query);
  palette.entries = sections.flatMap((section) => section.items);
  palette.index = Math.min(palette.index, Math.max(0, palette.entries.length - 1));
  const nodes = [];
  let position = 0;
  for (const section of sections) {
    nodes.push(el("div", "palette-section", section.title));
    for (const item of section.items) {
      const index = position++;
      const option = document.createElement("div");
      option.id = "palette-opt-" + index;
      option.className = "palette-item" + (index === palette.index ? " active" : "");
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", String(index === palette.index));
      option.dataset.index = String(index);
      const sub = item.sub ? "<small>" + esc(item.sub) + "</small>" : "";
      option.innerHTML = (item.icon ? svg(item.icon, "palette-ico") : "") + '<span class="palette-text"><span>' + esc(item.label) + "</span>" + sub + "</span>";
      nodes.push(option);
    }
  }
  if (palette.indexing) nodes.push(el("div", "palette-empty", "Indexando conversas…"));
  else if (palette.loading) nodes.push(el("div", "palette-empty", "Buscando nas conversas…"));
  else if (!nodes.length) nodes.push(el("div", "palette-empty", "Nada encontrado."));
  els.paletteList.replaceChildren(...nodes);
  els.paletteInput.setAttribute("aria-activedescendant", palette.entries.length ? "palette-opt-" + palette.index : "");
  els.paletteList.querySelector(".palette-item.active")?.scrollIntoView({ block: "nearest" });
}

function openPalette() {
  closeMenu();
  Object.assign(palette, { query: "", index: 0, hits: [], loading: false });
  els.paletteInput.value = "";
  els.paletteDialog.showModal();
  renderPalette();
  els.paletteInput.focus();
}

function closePalette() {
  if (els.paletteDialog.open) els.paletteDialog.close();
}

els.paletteDialog.addEventListener("close", () => {
  clearTimeout(palette.timer);
  palette.seq++;
  palette.loading = false;
});

function choosePaletteEntry(index) {
  const entry = palette.entries[index];
  if (!entry) return;
  closePalette();
  Promise.resolve(entry.run()).catch(report);
}

els.paletteInput.addEventListener("input", () => {
  palette.query = els.paletteInput.value;
  palette.index = 0;
  clearTimeout(palette.timer);
  const seq = ++palette.seq;
  const query = palette.query.trim();
  palette.hits = [];
  palette.loading = query.length >= SEARCH_MIN_CHARS;
  renderPalette();
  if (!palette.loading) return;
  palette.timer = setTimeout(async () => {
    try {
      const response = await searchConversations(query);
      if (seq === palette.seq) {
        palette.hits = response.results;
        palette.indexing = response.indexing;
      }
    } catch (error) {
      if (seq === palette.seq) report(error);
    }
    if (seq !== palette.seq) return;
    palette.loading = false;
    renderPalette();
  }, SEARCH_DEBOUNCE_MS);
});

els.paletteInput.addEventListener("keydown", (event) => {
  const count = palette.entries.length;
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    if (!count) return;
    palette.index = (palette.index + (event.key === "ArrowDown" ? 1 : -1) + count) % count;
    renderPalette();
  } else if (event.key === "Enter" && !event.isComposing) {
    event.preventDefault();
    choosePaletteEntry(palette.index);
  }
});

// Keep focus in the input while the pointer picks an entry; clicking the backdrop closes.
els.paletteList.addEventListener("mousedown", (event) => event.preventDefault());
els.paletteList.addEventListener("click", (event) => {
  const option = event.target.closest(".palette-item");
  if (option) choosePaletteEntry(Number(option.dataset.index));
});
els.paletteDialog.addEventListener("click", (event) => {
  if (event.target === els.paletteDialog) closePalette();
});

// ------------------------------------------------------------------ wiring

function appMenuItems() {
  return [
    { label: "Nova conversa", icon: "i-plus", onSelect: () => newSession().catch(report) },
    { label: "Recarregar projetos", icon: "i-folder-open", onSelect: () => refreshProjects() },
    { label: "Exportar conversa", icon: "i-file", disabled: !state.currentProject || state.processExited, onSelect: exportSession },
    { label: "Paleta de comandos", icon: "i-search", badge: "Ctrl K", onSelect: openPalette },
    { label: "Console RPC", icon: "i-terminal", onSelect: () => setDrawer(els.drawer.hidden) },
    { separator: true },
    { label: "Configurações", icon: "i-gear", onSelect: openSettings },
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
els.settingsBtn.addEventListener("click", openSettings);
els.searchBtn.addEventListener("click", () => {
  els.searchWrap.hidden = !els.searchWrap.hidden;
  if (!els.searchWrap.hidden) els.search.focus();
  else {
    state.filter = "";
    els.search.value = "";
    resetSidebarSearch();
    renderProjects();
  }
});
// ---------------------------------------------- conversation search

const SEARCH_MIN_CHARS = 3;
const SEARCH_DEBOUNCE_MS = 250;

async function searchConversations(query) {
  const response = await api(`/api/search?q=${encodeURIComponent(query)}`);
  return { results: response.results || [], indexing: Boolean(response.indexing) };
}

const sidebarSearch = { seq: 0, timer: null };

function el(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderSearchResults(results, note = "") {
  const parts = [];
  if (results.length) {
    parts.push(el("div", "search-heading", "Nas conversas"));
    for (const hit of results) {
      const button = el("button", "search-hit");
      button.type = "button";
      button.dataset.action = "open-hit";
      button.dataset.project = hit.projectId;
      button.dataset.path = hit.sessionPath;
      button.title = hit.title;
      button.append(el("span", "search-hit-title", hit.title), el("span", "search-hit-snippet", hit.snippet));
      parts.push(button);
    }
  }
  if (note) parts.push(el("div", "search-note", note));
  els.searchResults.replaceChildren(...parts);
  els.searchResults.hidden = !parts.length;
}

function resetSidebarSearch() {
  clearTimeout(sidebarSearch.timer);
  sidebarSearch.seq++;
  renderSearchResults([]);
}

els.search.addEventListener("input", () => {
  state.filter = els.search.value;
  renderProjects();
  resetSidebarSearch();
  const query = state.filter.trim();
  if (query.length < SEARCH_MIN_CHARS) return;
  const seq = sidebarSearch.seq;
  renderSearchResults([], "Buscando nas conversas…");
  sidebarSearch.timer = setTimeout(async () => {
    try {
      const response = await searchConversations(query);
      if (seq === sidebarSearch.seq) renderSearchResults(response.results, response.indexing ? "Indexando conversas…" : (response.results.length ? "" : "Nada nas conversas."));
    } catch (error) {
      if (seq === sidebarSearch.seq) renderSearchResults([]);
      report(error);
    }
  }, SEARCH_DEBOUNCE_MS);
});

els.searchResults.addEventListener("click", (event) => {
  const target = event.target.closest('[data-action="open-hit"]');
  if (!target) return;
  openSession(target.dataset.project, target.dataset.path).catch(report);
  closeOverlays();
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
      onSelect: () => openProject(project.id).catch(report),
    })),
  ]);
});
const isTypingTarget = (target) => Boolean(target?.closest?.("input, textarea, select, [contenteditable]:not([contenteditable=false])"));

document.addEventListener("keydown", (event) => {
  const modalOpen = Boolean(document.querySelector("dialog[open]"));
  const action = shortcutAction(event, { typing: isTypingTarget(event.target) || modalOpen });
  if (action === "console") {
    event.preventDefault();
    setDrawer(els.drawer.hidden);
  } else if (action === "shortcuts") {
    // The overlay toggles itself, but never opens on top of another dialog.
    if (modalOpen && !els.shortcutsDialog.open) return;
    event.preventDefault();
    toggleShortcuts();
  } else if (action === "palette") {
    event.preventDefault();
    if (els.paletteDialog.open) closePalette();
    else if (!modalOpen) openPalette();
  } else if (action === "worktrees") {
    event.preventDefault();
    if (els.worktreesDialog.open) closeWorktrees();
    else if (!modalOpen && !els.worktreesBtn.hidden) openWorktrees();
  } else if (action === "todos") {
    event.preventDefault();
    if (!modalOpen) toggleTodo();
  } else if (action === "new") {
    event.preventDefault();
    if (!modalOpen) newSession().catch(report);
  } else if (action === "focus") {
    if (!els.prompt.disabled) els.prompt.focus();
  } else if (action === "escape" && !event.defaultPrevented && !modalOpen && els.menu.hidden) {
    // The drawer closes first; otherwise Esc interrupts, except while typing in another field.
    if (!els.drawer.hidden) setDrawer(false);
    else if (!isTypingTarget(event.target) || event.target === els.prompt) interrupt();
  }
});

renderShortcuts();
updateComposer();
renderAttachments();
applyPanelWidth();
applyOrcaSettings();
if (settings.orcaEnabled !== false) pollOrca();
selectTab(inspector.tab);
bootstrap().catch(report);
