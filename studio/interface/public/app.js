import {
  FAST_OPTIONS,
  contextTone,
  gitFilesUrl,
  gitLegend,
  groupGitFiles,
  resourceForPath,
  resourceLine,
  resourceRows,
  FAST_STATUS_KEY,
  INSPECTOR_TABS,
  fastFromStatus,
  fastPanel,
  sessionMenuItems,
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
  orcaPollDelay, orcaPollWanted,
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
  greetingName,
  isFileChange,
  isLongText,
  modelLabel,
  normalizeModels,
  plural,
  relativeTime,
  gitWorktreeView,
  prView,
  modelMenuGroups,
  connectHint,
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

import { createTasksPanel } from "./tasks-panel.js";
import { createSideChat } from "./side-chat.js";
import { steerCommand, subagentDotState, subagentFamily, subagentSession, tabFitMode } from "./lib.js";
import { legacyState, shouldMarkSeen, stripPictographs, subagentIndicator, treeHistoryItem, worktreeIndicator } from "./lib.js";
import { orcaBoardOptions, orcaWriteFeedback } from "./lib.js";
import { agentExchange, agentSignature, humanRunning, humanWork, simplifyTimeline } from "./simple-view.js";
import { createVorcaro } from "./vorcaro.js";
import { createStage, effortLabel, nodeMeta, stageModel } from "./agent-stage.js";
import { taskStampsFromMessages } from "./lib.js";
import { activityNow, contextGauge, estimate, modelText, modelTruth, turnReceipt, usefulStatuses } from "./hud.js";
import { applyState, stateHtml } from "./state-indicator.js";
import { createTreeController } from "./tree-controller.js";
import { browserHistoryCurrent, browserHistoryMove, browserHistoryPush, classifyTarget, emptyBrowserHistory, formatBytes, linkAction, parseBrowserHistory, resolveSibling, targetText } from "./lib.js";

import { ACTIVITY_LIMIT, activityRows, activitySinceUrl, agoLabel, conversationOwner, mergeWatchEntries, pickConversation, problemsFromEvent, stalledPi, stallThresholds, SUBAGENT_TOOLS, subagentTiming, todayUsageRows, unseenActivity, WATCH_POLL_MS, watchMessages, watchStatus } from "./lib.js";

import { VOICE_READ_KEY, VOICE_SHORTCUTS, sideChatPath, voiceReadEnabled, withSpeakAction } from "./lib.js";
import { createVoice } from "./voice.js";

const $ = (selector) => document.querySelector(selector);
const els = {
  app: $("#app"),
  sidebar: $("#sidebar"),
  menuBtn: $("#menuBtn"),
  toggleLeft: $("#toggleLeftBtn"),
  toggleRight: $("#toggleRightBtn"),
  projectMenuBtn: $("#projectMenuBtn"),
  projectTitle: $("#projectTitle"),
  headerState: $("#headerState"),
  consoleBtn: $("#consoleBtn"),
  filesBtn: $("#filesBtn"),
  worktreesBtn: $("#worktreesBtn"),
  worktreesDialog: $("#worktreesDialog"),
  worktreesNotice: $("#worktreesNotice"),
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
  watchBar: $("#watchBar"),
  watchText: $("#watchText"),
  watchContinue: $("#watchContinue"),
  restart: $("#restartBtn"),
  queueArea: $("#queueArea"),
  composer: $("#composer"),
  attachments: $("#attachments"),
  prompt: $("#promptInput"),
  imageInput: $("#imageInput"),
  hint: $("#composerHint"),
  shellChip: $("#shellChip"),
  stop: $("#stopBtn"),
  micBtn: $("#micBtn"),
  micLive: $("#micLive"),
  micLabel: $("#micLabel"),
  micTimer: $("#micTimer"),
  micLevel: $("#micLevel"),
  speakStop: $("#speakStop"),
  send: $("#sendBtn"),
  modeLabel: $("#modeLabel"),
  statusLine: $("#statusLine"),
  modelBtn: $("#modelBtn"),
  fastChip: $("#fastChip"),
  modelName: $("#modelName"),
  thinkingName: $("#thinkingName"),
  ctxRing: $("#ctxRing"),
  ctxRingFill: $("#ctxRingFill"),
  hudActivity: $("#hudActivity"),
  hudDefault: $("#hudDefault"),
  hudCtx: $("#hudCtx"),
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
  tasksBadge: $("#tasksBadge"),
  tasksList: $("#tasksList"),
  taskWorktreeDialog: $("#taskWorktreeDialog"),
  taskWorktreeName: $("#taskWorktreeName"),
  taskWorktreePrompt: $("#taskWorktreePrompt"),
  watchBack: $("#watchBack"),
  filesBadge: $("#filesBadge"),
  wtTabBadge: $("#wtTabBadge"),
  ghView: $("#ghView"),
  ghBadge: $("#ghBadge"),
  worktreesBadge: $("#worktreesBadge"),
  ctxView: $("#ctxView"),
  filesView: $("#view-files"),
  envPath: $("#envPath"),
  outputsList: $("#outputsList"),
  gitLegend: $("#gitLegend"),
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
  settingDensity: [...document.querySelectorAll('input[name="settingDensity"]')],
  settingWidth: [...document.querySelectorAll('input[name="settingWidth"]')],
  settingVoiceRead: $("#settingVoiceRead"),
  settingNotify: $("#settingNotify"),
  settingNotifyHint: $("#settingNotifyHint"),
  settingMotion: $("#settingMotion"),
  settingThinking: $("#settingThinking"),
  settingTechnical: $("#settingTechnical"),
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
const accountName = document.querySelector('meta[name="pi-studio-account-name"]')?.content;
// technical: false = simple view (answers and what was done in plain words; reasoning, tools and diffs on a click).
const prefs = { userName: "", showThinking: false, expandTools: false, technical: false, left: "open", right: "open" };
try {
  Object.assign(prefs, JSON.parse(localStorage.getItem(PREFS_KEY) || "{}"));
  // The Studio this one came from saved "Miguel" as the default name; a name never chosen here is not the person's.
  if (!prefs.nameChosen && prefs.userName === "Miguel") prefs.userName = "";
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
  // Read-only follow of a conversation another PI is writing (see startWatch). While following, studioFile is the
  // file the Studio's own PI has open; session.sessionFile points at the followed one (sidebar highlight).
  watch: null,
  studioFile: null,
};

const nodeCache = new Map();
// HUD state (renderHud): PI's settings, when the context was last compacted, the last painted signature.
const RUN_HISTORY_KEY = "pi-studio:run-history";
const hud = { settings: null, lastCompactionAt: null, queued: false, sig: "" };
const apiToken = document.querySelector('meta[name="pi-studio-token"]')?.content || "";
// Vorcaro's face, when the person put one in pi-studio-data (vorcaro-foto.png): the buttons and the screen header use it.
fetch("/api/vorcaro/foto", { cache: "no-store", headers: { "x-pi-studio-token": apiToken } })
  .then((response) => (response.ok ? response.blob() : null))
  .then((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    document.documentElement.style.setProperty("--vc-photo", `url("${url}")`);
    document.documentElement.dataset.vcPhoto = "1";
    // Vorcaro is the brand: his bust in the Evolvera uniform, the same crop as the buttons, becomes the window's icon.
    const image = new Image();
    image.onload = () => {
      const canvas = Object.assign(document.createElement("canvas"), { width: 64, height: 64 });
      const context = canvas.getContext("2d");
      const side = Math.min(image.width, image.height) * 0.86;
      context.beginPath();
      context.roundRect(0, 0, 64, 64, 16);
      context.clip();
      context.drawImage(image, image.width * 0.56 - side / 2, image.height * 0.47 - side / 2, side, side, 0, 0, 64, 64);
      const link = document.querySelector('link[rel="icon"]');
      if (link) link.href = canvas.toDataURL("image/png");
    };
    image.src = url;
  })
  .catch(() => {});
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

// ---------------------------------------------------- sidebar tree (/api/tree)

const projectIdForPath = (path) => state.projects.find((project) => samePath(project.cwd, path))?.id ?? null;

// 200 = a (new) tree; 304 = unchanged. Anything else throws, and the poller backs off.
async function fetchTree({ etag, signal }) {
  const response = await fetch("/api/tree", { cache: "no-store", signal, headers: { "x-pi-studio-token": apiToken, ...(etag ? { "if-none-match": etag } : {}) } });
  if (response.status === 304) return { status: 304 };
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return { status: 200, data: await response.json() };
}

async function fetchTreeChildren(parent, offset) {
  const query = new URLSearchParams({ parent, offset: String(offset) });
  const response = await fetch(`/api/tree?${query}`, { cache: "no-store", headers: { "x-pi-studio-token": apiToken } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function fetchTreeAncestors(session) {
  const query = new URLSearchParams({ session });
  const response = await fetch(`/api/tree?${query}`, { cache: "no-store", headers: { "x-pi-studio-token": apiToken } });
  // A conversation not yet written to disk (a new one, Vorcaro's) has no chain: not found, not an error toast.
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

const tree = createTreeController({
  root: els.projects,
  doc: document,
  icon: (name, cls = "") => svg(name, cls),
  storage: localStorage,
  fetchTree,
  fetchChildren: fetchTreeChildren,
  fetchAncestors: fetchTreeAncestors,
  isHidden: () => document.hidden,
  getView: () => ({
    currentPath: state.session?.sessionFile ?? null,
    filter: state.filter,
    projectsKey: state.projects.map((project) => `${project.id}|${project.cwd}`).join("\n"),
    projectIdFor: (path, treeProjectId) => projectIdForPath(path) ?? treeProjectId,
  }),
  beforeRender: () => markOpenSeen({ render: false }),
  onChange: () => {
    updateHeaderState();
    scheduleInspector("subagents");
    if (!tree.active()) renderProjects();
  },
});
globalThis.__piTree = tree; // read by the browser checks: render counters

// The conversation on screen has been read once the page is visible and scrolled to the bottom.
function markOpenSeen({ render = true } = {}) {
  const path = state.session?.sessionFile;
  if (!path || !shouldMarkSeen({ open: true, visible: document.visibilityState === "visible", atBottom: state.stick })) return;
  tree.markSeen(path, { render });
}

// Dot next to the title of the open conversation: local facts first (they are instant), the tree's state otherwise.
function updateHeaderState() {
  const path = state.session?.sessionFile;
  applyState(els.headerState, state.uiActive ? "urgent" : state.isStreaming ? "working" : (path && tree.stateOf(path)) || "idle");
  scheduleStage();
}

// "Mostrar mais (N)": the older conversations of one environment, from its project history.
async function showMoreSessions({ extra, path }) {
  const known = projectIdForPath(path);
  let history;
  if (state.currentProject && samePath(state.currentProject.cwd, path)) history = state.history;
  else if (known) history = (await api(`/api/projects/${encodeURIComponent(known)}/history`)).history || [];
  else {
    await openWorktree({ path, name: basename(path) });
    history = state.history;
  }
  await tree.expandEnv(extra, history);
}

// Voice (public/voice.js): mic in the composer and replies read aloud. Hooks below: message actions, agent_end, submit, settings.
function updateSpeakButtons(key) {
  for (const button of els.thread.querySelectorAll('[data-action="msg-speak"]')) {
    const on = key !== null && button.dataset.key === key;
    const label = on ? "Parar" : "Ouvir";
    button.classList.toggle("speaking", on);
    button.title = label;
    button.setAttribute("aria-label", label);
  }
}

const voice = createVoice({
  els,
  token: apiToken,
  toast,
  composer: {
    read: () => ({ value: els.prompt.value, start: els.prompt.selectionStart, end: els.prompt.selectionEnd }),
    write: (value, cursor) => {
      setComposerText(value, cursor);
      els.prompt.focus();
    },
  },
  isReadEnabled: () => voiceReadEnabled(localStorage.getItem(VOICE_READ_KEY)),
  onSpeakingChange: updateSpeakButtons,
  env: window,
});

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
  syncLivePolling();
}

// Inspector (right panel): one persisted tab and width; views render lazily when visible.
const INSPECTOR_TAB_KEY = "pi-studio:inspector-tab";
const INSPECTOR_WIDTH_KEY = "pi-studio:inspector-width";
const TERM_MAX_LINES = 400;
const savedTab = localStorage.getItem(INSPECTOR_TAB_KEY);
const inspector = {
  // Simple view opens on the agent team, not the raw terminal mirror, unless a tab was chosen before.
  tab: resolveInspectorTab(savedTab, settings),
  width: clampPanelWidth(localStorage.getItem(INSPECTOR_WIDTH_KEY), window.innerWidth),
  dirty: new Set(INSPECTOR_TABS),
  queued: false,
};
const term = { cache: new Map(), stick: true, collapsed: new Set() };
// Orca integration (off by default): latest /api/orca answer, the path follow mode last handled, and its poll timer.
const orca = { data: null, lastFollowed: null, timer: null, inflight: false, renderSig: "", uiKey: "" };
// Live data of the visible tab: RAM/CPU of this conversation's PI (Contexto), of every Studio PI (Worktrees) and the git
// state of the files (Arquivos). Each poller runs only while its tab is on screen in a visible page, one request at a time.
const LIVE_POLL_MS = 5000;
const LIVE_KICK_MS = 1000;
const tabShown = (tab) => layout.right === "open" && inspector.tab === tab && !document.hidden;
// A PI whose RAM/CPU can be read: the Studio's own, still running (not a followed conversation of another PI).
const livePiSessionId = () => (state.processExited || state.watch ? null : currentSessionId());
// The Studio session summary the project was opened with (still readable by id after the PI exits).
const currentSessionId = () => state.session?.id ?? null;

// run(): one load at a time (a request asked meanwhile runs once more after it); sync(): start/stop the interval;
// kick(): run soon, debounced.
function makePoller(wanted, load) {
  const poller = { timer: null, busy: false, again: false, kickTimer: null };
  poller.run = async () => {
    if (!wanted()) return;
    if (poller.busy) {
      poller.again = true;
      return;
    }
    poller.busy = true;
    try {
      await load();
    } finally {
      poller.busy = false;
    }
    if (poller.again) {
      poller.again = false;
      poller.run();
    }
  };
  poller.sync = () => {
    if (wanted() && !poller.timer) {
      poller.timer = setInterval(poller.run, LIVE_POLL_MS);
      poller.run();
    } else if (!wanted() && poller.timer) {
      clearInterval(poller.timer);
      poller.timer = null;
    }
  };
  poller.kick = () => {
    clearTimeout(poller.kickTimer);
    poller.kickTimer = setTimeout(poller.run, LIVE_KICK_MS);
  };
  return poller;
}

const piResources = { data: null, error: false, sig: "" };
const allResources = { list: null, sig: "" };
const gitFiles = { data: null, sig: "", asked: null };

async function loadPiResources() {
  const id = livePiSessionId();
  if (!id) return;
  let data = null;
  try {
    data = await api(`/api/sessions/${encodeURIComponent(id)}/resources`);
  } catch {
    // Shown as "Indisponível"; the next tick retries.
  }
  if (livePiSessionId() !== id) return;
  const sig = JSON.stringify(resourceRows(data));
  if (sig === piResources.sig && Boolean(data) !== piResources.error) return;
  Object.assign(piResources, { data, error: !data, sig });
  scheduleInspector("context");
}

async function loadAllResources() {
  let list = null;
  try {
    list = (await api("/api/resources")).resources;
  } catch {
    // No line is better than a stale one.
  }
  const sig = JSON.stringify((list ?? []).map((item) => [item.cwd, resourceLine(item)]));
  if (sig === allResources.sig) return;
  Object.assign(allResources, { list, sig });
  scheduleInspector("worktrees");
}

async function loadGitFiles() {
  const id = currentSessionId();
  const paths = state.outputs.map((item) => item.path);
  gitFiles.asked = paths.join("\0");
  if (!id) return;
  let data;
  try {
    data = await api(gitFilesUrl(id, paths));
  } catch {
    return; // Keeps the last good colors.
  }
  if (currentSessionId() !== id) return;
  const sig = JSON.stringify(data);
  if (sig === gitFiles.sig) return;
  Object.assign(gitFiles, { data, sig });
  scheduleInspector("files");
}

const resourcesPoller = makePoller(() => tabShown("context") && Boolean(livePiSessionId()), loadPiResources);
const worktreeResourcesPoller = makePoller(() => tabShown("worktrees"), loadAllResources);
const gitPoller = makePoller(() => tabShown("files") && Boolean(currentSessionId()), loadGitFiles);
function syncLivePolling() {
  for (const poller of [resourcesPoller, worktreeResourcesPoller, gitPoller]) poller.sync();
}
// A new conversation starts without the previous one's numbers and colors.
function resetLiveData() {
  Object.assign(piResources, { data: null, error: false, sig: "" });
  Object.assign(gitFiles, { data: null, sig: "", asked: null });
  resourcesPoller.kick();
  gitPoller.kick();
}

const subOpen = new Set();
const subCache = new Map();
let noticeSeq = 0;

// Tarefas tab (see tasks-panel.js). Everything it needs from the app goes through these callbacks.
function tasksContext(runs = currentSubagents()) {
  const orcaAvailable = Boolean(orcaOn() && orca.data?.available);
  const worktrees = orcaAvailable ? orca.data.worktrees : [];
  const file = state.session?.sessionFile ?? null;
  let piBlocked = "";
  if (state.processExited) piBlocked = "PI encerrado";
  else if (state.watch) piBlocked = "Conversa em modo de acompanhamento (somente leitura)";
  else if (!state.currentProject) piBlocked = "Nenhum projeto aberto";
  return {
    tasks: state.todo || [],
    runs,
    sessionKey: file,
    conversationId: state.watch ? state.watch.sessionId || null : state.session?.sessionId || null,
    title: state.watch ? state.watch.title : state.history.find((item) => samePath(item.path, file))?.title || state.session?.sessionName || "",
    projectId: state.currentProject?.id ?? null,
    orcaAvailable,
    projectInOrca: Boolean(orcaWorktreeOfProject()),
    orcaAgents: worktrees.flatMap((worktree) => (worktree.agents || []).map((agent) => ({ ...agent, worktreePath: worktree.path }))),
    piBlocked,
  };
}

const tasksPanel = createTasksPanel({
  els: { list: els.tasksList, dialog: els.taskWorktreeDialog, name: els.taskWorktreeName, prompt: els.taskWorktreePrompt },
  svg,
  esc,
  toast,
  api,
  setBadge: (count) => setBadge(els.tasksBadge, count, plural(count, "tarefa executando agora", "tarefas executando agora")),
  context: tasksContext,
  sendParallel: (text) => sendProgrammatic(text, "prompt").catch(report),
  sendSteer: (agentId, text) => steerSubagent(agentId, text),
  openSubagent: (run) => openSubagent(run).catch(report),
  openWorktree: (worktreePath) => openTaskWorktree(worktreePath),
  scrollToEnd: () => {
    state.stick = true;
    scrollToBottom();
  },
  refreshOrca: () => pollOrca(),
  invalidate: () => scheduleInspector("tasks"),
});

// Dúvidas tab (see side-chat.js): a read-only side PI per open conversation.
const sideChat = createSideChat({
  els: { list: $("#scList"), status: $("#scStatus"), form: $("#scForm"), input: $("#scInput"), send: $("#scSend"), stop: $("#scStop") },
  api,
  renderMarkdown,
  esc,
  svg,
  path: () => sideChatPath({ watch: state.watch, session: state.session }),
  report,
});

// Vorcaro (Alt+V): a screen of its own in place of the sidebar, chat and inspector (board on the left, chat in the
// middle, the requests it follows on the right); "Sessões" or Esc goes back. ?vorcaro=1 in the URL reopens it.
const vorcaroView = $("#vorcaroView");
function showVorcaroView(show) {
  vorcaroView.hidden = !show;
  document.title = show ? "Vorcaro, a inteligência Master" : "PI Studio";
  els.app.dataset.view = show ? "vorcaro" : "chat";
  $("#main").inert = show;
  els.sidebar.inert = show || layout.left !== "open";
  els.panel.inert = show || layout.right !== "open";
  const url = new URL(location.href);
  if (show) url.searchParams.set("vorcaro", "1");
  else url.searchParams.delete("vorcaro");
  history.replaceState(history.state, "", url);
  els.projectTitle.textContent = show ? "Vorcaro" : stripPictographs(state.currentProject?.name) || state.currentProject?.name || "PI Studio";
  if (!show) {
    applyLayout();
    scheduleStage();
  }
}
const vorcaro = createVorcaro({
  els: {
    view: vorcaroView, board: $("#vorcaroBoard"), boardPane: $("#vorcaroBoardPane"), boardToggle: $("#vcBoardToggle"), boardRail: $("#vcBoardRail"),
    live: $("#vcLive"), filters: $("#vcFilters"), historyBtn: $("#vcHistoryBtn"), historyMenu: $("#vcHistoryMenu"), newBtn: $("#vcNewBtn"),
    exit: $("#vcExit"), title: $("#vcConvTitle"), context: $("#vcContext"), suggestions: $("#vorcaroSuggestions"), notice: $("#vorcaroNotice"),
    list: $("#vcList"), status: $("#vcStatus"), form: $("#vcForm"), input: $("#vcInput"), send: $("#vcSend"), stop: $("#vcStop"),
    pop: $("#vcPop"),
  },
  api, esc, svg, renderMarkdown, report,
  toast: (text, kind) => toast(text, kind ?? "info"),
  openConversation: (sessionPath, cwd) => openSession(projectIdForPath(cwd), sessionPath, { cwd }),
  isFollowingElsewhere: () => Boolean(state.watch),
  show: () => showVorcaroView(true),
  hide: () => showVorcaroView(false),
});
const toggleVorcaro = () => (vorcaro.isOpen() ? vorcaro.close() : vorcaro.open());
$("#vorcaroBtn").addEventListener("click", toggleVorcaro);
$("#vorcaroSideBtn").addEventListener("click", () => vorcaro.open());
vorcaroView.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !event.defaultPrevented && !event.target.closest("dialog")) vorcaro.close();
});
if (new URLSearchParams(location.search).get("vorcaro") === "1") requestAnimationFrame(() => vorcaro.open());

// Palco dos agentes (agent-stage.js): the agents of this conversation above the chat, a tree when there is a team.
const STAGE_KEY = "pi-studio:stage";
const STAGE_TEAM_POLL_MS = 5000;
const stageEls = { root: $("#stage"), summary: $("#stageSummary"), canvas: $("#stageCanvas"), mail: $("#stageMail"), toggle: $("#stageToggle"), body: $("#stageBody") };
const stageData = { team: null, teamSig: "", teamFor: null, teamBusy: false, queued: false, sig: "", viewing: "" };
const stage = createStage({ ...stageEls, esc, reduceMotion: prefersReducedMotion, onOpen: (node) => openStageNode(node).catch(report) });

function applyStageOpen(open) {
  stageEls.root.dataset.open = String(open);
  stageEls.toggle.setAttribute("aria-expanded", String(open));
  stageEls.toggle.title = open ? "Recolher o palco" : "Mostrar o palco";
  stageEls.body.hidden = !open;
}
applyStageOpen(localStorage.getItem(STAGE_KEY) !== "closed");
stageEls.toggle.addEventListener("click", () => {
  const open = stageEls.root.dataset.open !== "true";
  localStorage.setItem(STAGE_KEY, open ? "open" : "closed");
  applyStageOpen(open);
  stageData.sig = "";
  scheduleStage();
});

function scheduleStage() {
  if (stageData.queued) return;
  stageData.queued = true;
  requestAnimationFrame(() => {
    stageData.queued = false;
    renderStage();
  });
}

function renderStage(runs = selectedSubagents()) {
  const project = state.currentProject;
  stageEls.root.hidden = !project;
  if (!project) return;
  if (stageData.teamFor !== project.id && !stageData.teamBusy) {
    stageData.team = null;
    stageData.teamSig = "";
    loadStageTeam();
  }
  const model = state.session?.model;
  const level = state.session?.thinkingLevel;
  const data = stageModel({
    main: {
      title: "Orquestrador",
      kind: stripPictographs(project.name) || project.name,
      messages: state.messages,
      runtime: state.runtime,
      streaming: state.isStreaming,
      phase: state.phase,
      waiting: Boolean(state.uiActive),
      model: lastAnswerModel()?.model || (state.watch ? "" : model?.id) || "",
      effort: effortLabel(lastAnswerModel()?.thinkingLevel ?? (model?.reasoning === false ? "" : level)),
      startedAt: state.runStartedAt,
    },
    runs,
    team: stageData.teamFor === project.id ? stageData.team : null,
    viewing: state.watch ? stageData.viewing : "main",
  });
  const sig = JSON.stringify(data);
  if (sig === stageData.sig) return;
  stageData.sig = sig;
  // Collapsed, the stage keeps only its summary line.
  stage.update(stageEls.root.dataset.open === "true" ? data : { ...data, nodes: [], wires: [], messages: [] });
}

// The last answer's own stamp (provider/model/thinkingLevel): the model really in use, whatever the selector says.
function lastAnswerModel() {
  for (let index = state.messages.length - 1; index >= 0; index--) {
    const message = state.messages[index];
    if (message?.role === "assistant" && typeof message.model === "string") return message;
  }
  return null;
}

// The team-bus team of the open project (null when it has none); polled only while a project is open and the page shows.
async function loadStageTeam() {
  const project = state.currentProject;
  if (!project || document.hidden || stageData.teamBusy) return;
  stageData.teamBusy = true;
  try {
    const { team } = await api(`/api/teams/current?project=${encodeURIComponent(project.id)}`);
    const sig = JSON.stringify(team);
    if (state.currentProject?.id === project.id && (sig !== stageData.teamSig || stageData.teamFor !== project.id)) {
      stageData.team = team;
      stageData.teamSig = sig;
      stageData.teamFor = project.id;
      scheduleStage();
    }
  } catch {
    // The stage keeps the last team it read; the next poll tries again.
    stageData.teamFor = project.id;
  } finally {
    stageData.teamBusy = false;
  }
}
setInterval(loadStageTeam, STAGE_TEAM_POLL_MS);

async function openStageNode(node) {
  if (node.open.type === "main") {
    if (state.watch) els.watchBack.click();
    else els.promptInput.focus();
    return;
  }
  if (node.open.type === "run") {
    const run = selectedSubagents().find((item) => item.key === node.open.key);
    stageData.viewing = node.open.key;
    await openSubagent(run);
    scheduleStage();
    return;
  }
  if (node.open.type === "member") await openMemberDialog(stageData.team?.team, node);
}

// A team member's conversation, outputs only: its answers and the team messages to and from it, oldest first.
const agentDialog = { dialog: $("#agentDialog"), title: $("#agentDialogTitle"), meta: $("#agentDialogMeta"), glyph: $("#agentDialogGlyph"), body: $("#agentDialogBody") };
agentDialog.dialog.addEventListener("click", (event) => {
  if (event.target === agentDialog.dialog || event.target.closest("[data-close]")) agentDialog.dialog.close();
});
async function openMemberDialog(team, node) {
  if (!team) return;
  const name = node.open.name;
  agentDialog.title.textContent = name;
  agentDialog.glyph.textContent = node.glyph;
  agentDialog.glyph.dataset.tone = node.tone;
  agentDialog.meta.textContent = [node.label, ...nodeMeta(node)].join(" · ");
  agentDialog.body.innerHTML = `<p class="ad-empty">Lendo a conversa</p>`;
  if (!agentDialog.dialog.open) agentDialog.dialog.showModal();
  const data = await api(`/api/teams/member?team=${encodeURIComponent(team)}&name=${encodeURIComponent(name)}`);
  const time = (at) => (at ? new Date(at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "");
  const items = [
    ...data.outputs.map((item) => ({ at: item.at || 0, html: `<article class="ad-out"><header><b>${esc(name)}</b><time>${esc(time(item.at))}</time></header><div class="md">${renderMarkdown(item.text)}</div></article>` })),
    ...data.messages.map((item) => ({ at: item.at, html: `<article class="ad-mail" data-dir="${item.from === name ? "out" : "in"}"><header><b>${esc(item.from)}</b><span aria-label="para">›</span><b>${esc(item.to === "all" ? "todos" : item.to)}</b><time>${esc(time(item.at))}</time></header><p>${esc(item.text)}</p></article>` })),
  ].sort((a, b) => a.at - b.at);
  agentDialog.body.innerHTML = items.map((item) => item.html).join("") || `<p class="ad-empty">Esta sessão ainda não respondeu nada.</p>`;
  agentDialog.body.scrollTop = agentDialog.body.scrollHeight;
}

// Theme: light, dark or the system's (default). public/boot.js applies the saved choice before first paint.
const THEME_KEY = "pi-studio:theme";
const lightQuery = window.matchMedia("(prefers-color-scheme: light)");
function applyTheme(choice) {
  const root = document.documentElement;
  if (choice === "light" || choice === "dark") root.dataset.theme = choice;
  else delete root.dataset.theme;
  for (const button of document.querySelectorAll("[data-theme-choice]")) button.setAttribute("aria-checked", String(button.dataset.themeChoice === (root.dataset.theme || "auto")));
  const light = root.dataset.theme === "light" || (!root.dataset.theme && lightQuery.matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", light ? "#f8f8f7" : "#09090b");
  stage.redraw();
}
applyTheme(document.documentElement.dataset.theme);
lightQuery.addEventListener("change", () => applyTheme(document.documentElement.dataset.theme));
$("#themeSwitch").addEventListener("click", (event) => {
  const choice = event.target.closest("[data-theme-choice]")?.dataset.themeChoice;
  if (!choice) return;
  try {
    if (choice === "auto") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch { /* storage blocked: the choice lasts this page */ }
  applyTheme(choice);
});

// Ambientes: the user creates a folder (or names an existing one); it becomes a box in the sidebar with its conversations.
const ambiente = { dialog: $("#ambienteDialog"), form: $("#ambienteForm"), name: $("#ambienteName"), folder: $("#ambienteFolder"), error: $("#ambienteError"), create: $("#ambienteCreate") };
$("#newAmbienteBtn").addEventListener("click", () => {
  ambiente.form.reset();
  ambiente.error.hidden = true;
  ambiente.dialog.showModal();
  ambiente.name.focus();
});
ambiente.dialog.addEventListener("click", (event) => { if (event.target.closest("[data-close]")) ambiente.dialog.close(); });
ambiente.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  ambiente.create.disabled = true;
  try {
    const { ambiente: created, project } = await api("/api/ambientes", { method: "POST", body: JSON.stringify({ name: ambiente.name.value, cwd: ambiente.folder.value }) });
    ambiente.dialog.close();
    toast(`Ambiente criado: ${created.name}`);
    await refreshProjects();
    tree.poke?.();
    if (project?.id) await openProject(project.id);
  } catch (error) {
    ambiente.error.textContent = error.message;
    ambiente.error.hidden = false;
  } finally {
    ambiente.create.disabled = false;
  }
});

function openDoubts() {
  setPanel("right", true);
  selectTab("sidechat");
  sideChat.render();
  requestAnimationFrame(() => sideChat.focus());
}

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
    button.addEventListener("click", (event) => {
      closeMenu();
      Promise.resolve(item.onSelect?.(event)).catch(report);
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
  const dot = badge ? stateHtml(legacyState(badge.state)) : "";
  button.innerHTML = `<span class="session-title">${esc(stripPictographs(item.title) || "Nova conversa")}</span>${dot}<span class="session-time">${esc(relativeTime(item.timestamp))}</span>`;
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

// The "⋯" menu works on any conversation of the list. Entries that act through RPC (rename, export,
// fork, duplicate) first open the conversation, because RPC only ever acts on the open session.
function historyItemFor(projectId, sessionPath) {
  const list = state.currentProject?.id === projectId ? state.history : state.otherHistory.get(projectId) || [];
  return list.find((item) => samePath(item.path, sessionPath));
}

// Where a sub-PI's parent conversation lives in the loaded histories, or null.
function findParentRow(item) {
  if (!item.parentSession) return null;
  for (const [projectId, list] of [[state.currentProject?.id, state.history], ...state.otherHistory]) {
    const parent = list.find((entry) => samePath(entry.path, item.parentSession));
    if (parent) return { projectId, path: parent.path };
  }
  return null;
}

function copyText(text, done) {
  if (!navigator.clipboard) throw new Error("A cópia não está disponível neste navegador.");
  return navigator.clipboard.writeText(text).then(() => toast(done));
}

function openSessionMenu(anchor) {
  const { project: projectId, path: sessionPath, title, env } = anchor.dataset;
  const cwd = env || undefined;
  const item = historyItemFor(projectId, sessionPath) || { path: sessionPath, title, sessionId: tree.findPi(sessionPath)?.sessionId };
  const isOpen = state.currentProject?.id === projectId && samePath(sessionPath, state.session?.sessionFile);
  const parent = findParentRow(item);
  const openFirst = async () => {
    if (!isOpen) await openSession(projectId, sessionPath, { cwd });
  };
  const actions = {
    open: () => openSession(projectId, sessionPath, { cwd }),
    rename: async () => {
      await openFirst();
      promptRename(item.title ?? title);
    },
    export: async () => {
      await openFirst();
      await exportSession();
    },
    fork: async () => {
      await openFirst();
      await pickForkPoint();
    },
    clone: async () => {
      await openFirst();
      await cloneSession();
    },
    "copy-path": () => copyText(sessionPath, "Caminho da sessão copiado."),
    "copy-id": () => copyText(item.sessionId, "ID da sessão copiado."),
    parent: () => openSession(parent.projectId, parent.path),
  };
  const entries = sessionMenuItems({ item, isOpen, processExited: state.processExited, streaming: state.isStreaming, parentKnown: Boolean(parent) });
  anchor.setAttribute("aria-expanded", "true");
  openMenu(anchor, entries.map(({ id, ...entry }) => (entry.separator ? entry : { ...entry, onSelect: actions[id] })), {
    align: "end",
    onClose: () => anchor.removeAttribute("aria-expanded"),
  });
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

// Shift+F10 / the ContextMenu key on a focused row open the same menu as a right click.
els.projects.addEventListener("keydown", (event) => {
  if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
  const anchor = event.target.closest(".session-row")?.querySelector(".session-menu-btn");
  if (!anchor) return;
  event.preventDefault();
  openSessionMenu(anchor);
});

els.projects.addEventListener("contextmenu", (event) => {
  const anchor = event.target.closest(".session-row")?.querySelector(".session-menu-btn");
  if (!anchor) return;
  event.preventDefault();
  openSessionMenu(anchor);
});

function renderProjects() {
  if (tree.active()) {
    tree.render();
    updateHeaderState();
    syncHistoryPolling();
    return;
  }
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
          <span class="project-name">${esc(stripPictographs(project.name) || project.name)}</span>
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
  if (action === "tree-toggle") {
    tree.toggle(target.dataset.toggle, target.dataset.default === "1");
    return;
  }
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
    openSession(projectId, path, { cwd: target.dataset.env || undefined }).catch(report);
  } else if (action === "tree-env") {
    openWorktree({ path: target.dataset.path, name: target.dataset.name, projectId: projectIdForPath(target.dataset.path) }).catch(report);
  } else if (action === "tree-more") {
    showMoreSessions(target.dataset).catch(report);
  } else if (action === "tree-child-more") {
    tree.loadChildren(target.dataset.path).catch(report);
  } else if (action === "session-menu") {
    openSessionMenu(target);
  }
  if (action !== "expand-project" && action !== "more-sessions" && action !== "session-menu" && action !== "tree-more") closeOverlays();
});

// ------------------------------------------------------------------ header

function updateHeader() {
  const project = state.currentProject;
  els.projectTitle.textContent = els.app.dataset.view === "vorcaro" ? "Vorcaro" : stripPictographs(project?.name) || project?.name || "PI Studio";
  updateHeaderState();
  els.modeLabel.textContent = project ? `Agente · ${project.name}` : "Agente";
  // A name chosen in Preferências wins; otherwise the Windows account, as in the greeting.
  const shownName = prefs.userName || accountName?.trim() || "Você";
  els.userName.textContent = shownName;
  els.userAvatar.textContent = (shownName || "?").trim().charAt(0).toUpperCase() || "?";
}

function updateModelButton() {
  const model = state.session?.model;
  els.modelName.textContent = model ? model.id || modelLabel(model) : "Modelo";
  els.modelName.title = model ? `${modelLabel(model)} (${model.provider ? `${model.provider}/` : ""}${model.id})` : "";
  const level = state.session?.thinkingLevel;
  els.thinkingName.textContent = model?.reasoning === false || !level ? "" : thinkingLabel(level);
  els.thinkingName.hidden = !els.thinkingName.textContent;
  refreshFastUi();
  scheduleHud();
}

// ---------------------------------------------------------------- projects

function resetConversation() {
  stopWatch();
  resetLiveData();
  voice.stopSpeaking();
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
  tasksPanel.reset();
  scheduleInspector();
}

function setExited(exited) {
  state.processExited = exited;
  if (!exited) {
    els.prompt.disabled = false;
    els.newSessionLabel.textContent = "Nova sessão";
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
  tree.start();
  setInterval(() => !document.hidden && tree.render(), 20_000);
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
  tree.poke();
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
  resetConversation();
  if (state.currentProject?.id && state.currentProject.id !== project.id) {
    detachProjectRequests(state.pending, state.currentProject.id);
    state.compactingProjects.delete(state.currentProject.id);
  }
  state.currentProject = project;
  state.session = session;
  state.history = history || [];
  state.showAllSessions = false;
  state.models = null;
  state.modelAccounts = null;
  state.thinkingLevels = null;
  state.statuses.clear();
  state.widgets.clear();
  clearTimeout(fast.pending?.timer);
  fast.pending = null;
  fast.available = null;
  renderWidgets();
  setRunning(Boolean(session?.isStreaming));
  localStorage.setItem("pi-studio:last-project", project.id);
  markSeen(project.id);
  const known = state.projects.find((item) => item.id === project.id);
  if (known) Object.assign(known, { activeSessionId: session?.id || known.activeSessionId });
  else state.projects.unshift(project);
  updateHeader();
  updateModelButton();
  renderProjects();
  renderPanel();
  renderThread();
  connectProjectEvents(project.id);
}

// A conversation another process is writing (an Orca agent's terminal, another PI) is only followed, read-only:
// the Studio's PI never switches into a file with two writers.
function openSession(projectId, sessionPath, { cwd } = {}) {
  return runGated(state, async () => {
    if (cwd ? !samePath(state.currentProject?.cwd, cwd) : state.currentProject?.id !== projectId) {
      const known = cwd ? projectIdForPath(cwd) : projectId;
      await (known ? loadProject(known) : loadProject(null, { cwd }));
    }
    await refreshHistory().catch(() => {});
    const entry = state.history.find((item) => samePath(item.path, sessionPath));
    const live = tree.findPi(sessionPath);
    await showConversation(live ? treeHistoryItem(entry ?? null, live) : entry, sessionPath);
  });
}

// Inside the session gate. `item`: the history entry (null when the file is not listed: then it is not known to be owned).
async function showConversation(item, sessionPath, { fallback = false } = {}) {
  if (state.watch && samePath(state.watch.path, sessionPath)) return;
  const owner = conversationOwner({ item, agents: worktreeAgents(), fallback, studioFile: currentStudioFile(), now: serverNow() });
  if (owner.elsewhere) return startWatch(item, { fallback });
  return switchSession(state.currentProject.id, sessionPath);
}

// The thread and the selected file change only once PI accepted the switch: a cancelled (extension veto)
// or failed switch leaves the current conversation on screen. The entries are re-requested after the
// reset, since the server's own follow-up get_entries can arrive before a slow switch response.
async function switchSession(projectId, sessionPath) {
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
      sendRpc({ type: "get_entries" }).catch(() => {});
    }
    return response;
  }, () => {
    state.session = previousSession;
    renderProjects();
    renderThread();
  });
}

// ---------------------------------------------------------- following (read-only)

const currentStudioFile = () => (state.watch ? state.studioFile : state.session?.sessionFile ?? null);
const orcaWorktreeOfProject = () => (orca.data?.available ? orca.data.worktrees.find((item) => samePath(item.path, state.currentProject?.cwd)) : null);
const worktreeAgents = () => orcaWorktreeOfProject()?.agents ?? [];

function startWatch(item, { fallback, steer = null }) {
  resetConversation();
  state.studioFile = state.session?.sessionFile ?? null;
  state.session = { ...(state.session || {}), sessionFile: item.path };
  setRunning(false);
  const watch = {
    path: item.path,
    title: item.title,
    sessionId: item.sessionId ?? null,
    steer,
    fallback,
    entries: [],
    offset: 0,
    fileState: item.state,
    touchedAt: item.lastActivity,
    elsewhere: true,
    where: orcaWorktreeOfProject() ? "orca" : "pi",
    failures: 0,
    inflight: false,
    timer: setInterval(() => watchTick().catch(() => {}), WATCH_POLL_MS),
  };
  state.watch = watch;
  updateHeader();
  renderProjects();
  renderThread();
  updateWatchUi();
  syncOrcaPolling();
  return watchTick();
}

function stopWatch() {
  const watch = state.watch;
  if (!watch) return;
  clearInterval(watch.timer);
  state.watch = null;
  if (state.session) state.session = { ...state.session, sessionFile: state.studioFile };
  updateWatchUi();
  syncOrcaPolling();
}

function updateWatchUi() {
  const watch = state.watch;
  els.watchBar.hidden = !watch;
  if (watch) {
    const status = watchStatus({ elsewhere: watch.elsewhere, where: watch.where });
    els.watchText.textContent = status.text;
    els.watchContinue.disabled = !status.canContinue;
  }
  els.watchBack.hidden = !watch?.steer;
  applyPlaceholder();
  updateComposer();
}

// One poll: new entries since the last offset. Skipped in a hidden page (the next visibility change polls at once).
async function watchTick() {
  const watch = state.watch;
  if (!watch || watch.inflight || document.hidden) return;
  watch.inflight = true;
  try {
    const data = await api(`/api/sessions/watch?path=${encodeURIComponent(watch.path)}&since=${watch.offset}`);
    if (state.watch !== watch) return;
    watch.failures = 0;
    const entries = mergeWatchEntries(watch.entries, data.entries, { reset: data.reset || watch.offset === 0 });
    watch.offset = data.offset;
    watch.fileState = data.state;
    watch.touchedAt = data.mtimeMs;
    watch.elsewhere = conversationOwner({ item: { path: watch.path, title: watch.title, state: watch.fileState, lastActivity: watch.touchedAt }, agents: worktreeAgents(), fallback: watch.fallback, studioFile: state.studioFile, now: serverNow() }).elsewhere;
    if (entries !== watch.entries) {
      watch.entries = entries;
      state.messages = watchMessages(entries);
      state.subagentRecords = subagentRecords(entries);
      applyTodo(todoFromMessages(state.messages), state.messages);
      scheduleRender();
    }
    updateWatchUi();
  } catch {
    if (state.watch !== watch) return;
    if (++watch.failures >= 5) {
      // Back to the Studio PI's own conversation instead of a frozen read-only view.
      resetConversation();
      renderThread();
      refreshState().catch(() => {});
      toast("Não foi possível acompanhar a conversa.", "error");
    }
  } finally {
    watch.inflight = false;
  }
}

// Back from a followed subagent to the Studio PI's own conversation (its parent).
els.watchBack.addEventListener("click", () => {
  if (!state.watch) return;
  resetConversation();
  renderThread();
  refreshState().catch(report);
});

// Opens a subagent's own conversation, read-only and live, with its message box (see steerableWatch).
// The child session is named "<agent>#<id8>" by pi-subagents; the run's task text is only a fallback.
async function openSubagent(run) {
  if (!run) throw new Error("Subagente não encontrado nesta conversa.");
  await refreshHistory().catch(() => {});
  const item = subagentSession({ run, history: state.history, parentFile: currentStudioFile() });
  if (!item) throw new Error("A conversa deste subagente ainda não está disponível.");
  await runGated(state, () => startWatch(item, { fallback: false, steer: { agentId: run.agentId, label: run.title } }));
}

function openTaskWorktree(worktreePath) {
  const worktree = orca.data?.available ? orca.data.worktrees.find((item) => samePath(item.path, worktreePath)) : null;
  if (!worktree) return toast("Esta worktree não aparece no Orca.", "warning");
  return openWorktree(worktree).catch(report);
}

// A followed subagent takes messages while its file is still being written (the Studio PI forwards them with /steer).
function steerableWatch() {
  return Boolean(state.watch?.steer && state.watch.elsewhere);
}

els.watchContinue.addEventListener("click", () => {
  const watch = state.watch;
  if (!watch || els.watchContinue.disabled) return;
  runGated(state, async () => {
    await watchTick(); // last look: the other process may have started writing again
    if (state.watch === watch && !watch.elsewhere) await switchSession(state.currentProject.id, watch.path);
  }).catch(report);
});

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
  if (state.watch) return;
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
      if (state.watch) {
        state.studioFile = event.data?.sessionFile ?? null;
        break;
      }
      state.session = { ...(state.session || {}), ...event.data };
      setRunning(Boolean(event.data?.isStreaming));
      updateModelButton();
      renderProjects();
      renderPanel();
      break;
    case "get_entries":
      if (state.watch || !Array.isArray(event.data?.entries)) break;
      state.messages = reconcileEntries(entriesToMessages(event.data.entries, event.data.leafId), state.messages);
      state.subagentRecords = subagentRecords(event.data.entries);
      applyTodo(todoFromMessages(state.messages), state.messages);
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

// Events of the Studio's own PI do not touch a followed (read-only) conversation; its dialogs still reach the user.
function handleRpc(event) {
  if (state.watch && event.type !== "response" && event.type !== "extension_ui_request") return;
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
      voice.autoRead(state.messages);
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
      applyTodo(todoSnapshot({ toolName: event.toolName, isError: event.isError, details: event.result?.details }, true));
      state.phase = "thinking";
      gitPoller.kick();
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
      hud.lastCompactionAt = Date.now();
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
    <h1>${esc(greeting(new Date().getHours(), greetingName(accountName, prefs.userName)))}</h1>
    <p>${project ? `${esc(project.name)}` : "Escolha um projeto na barra lateral para começar."}</p>`;
  return node;
}

function renderThread() {
  const full = buildTimeline(state.messages, state.runtime);
  const tools = timelineTools(full);
  const items = prefs.technical ? full : simplifyTimeline(full);
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
    const sig = `${item.kind === "agent" ? agentSignature(item) : timelineSignature(item)}|${item.simple ? "s" : ""}|${isExpanded(item.key) ? 1 : 0}${isExpanded(`think:${item.key}`) ? 1 : 0}|${actions}|${item.finishAt ?? ""}`;
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
  scheduleInspector("terminal", "subagents", "files", "tasks");
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
    else if (item.kind === "assistant") {
      const actions = messageActions(item, { ...ctx, lastAssistant: item === lastAssistant, retryId: state.retryTarget?.entryId });
      item.actions = withSpeakAction(actions, { supported: voice.speechSupported, text: item.text });
    }
  }
  state.timeline = new Map(items.map((item) => [item.key, item]));
}

const ACTION_ICONS = { copy: "i-copy", edit: "i-edit", retry: "i-retry" };

function actionsHtml(item) {
  if (!item.actions?.length) return "";
  const buttons = item.actions.map((action) => {
    const speaking = action.id === "speak" && voice.speakingKey() === item.key;
    const label = speaking ? "Parar" : action.label;
    const icon = action.id === "speak" ? svg("i-speaker", "act-speaker") + svg("i-stop", "act-stop") : svg(ACTION_ICONS[action.id]);
    return `<button type="button" class="act-btn${speaking ? " speaking" : ""}" data-action="msg-${action.id}" data-key="${esc(item.key)}" title="${esc(label)}" aria-label="${esc(label)}"${action.disabled ? " disabled" : ""}>${icon}${action.id === "copy" ? '<span class="act-flash">Copiado</span>' : ""}</button>`;
  });
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
      // Simple view: one plain sentence; reasoning, each tool and the diffs only after a click ("ver detalhes").
      const human = item.simple ? humanWork(item.tools) : null;
      node.className = `msg tool-group${open ? " open" : ""}${running ? " running" : ""}${human ? ` simple${human.tone ? ` tone-${human.tone}` : ""}` : ""}`;
      const summary = running ? (human ? humanRunning(running) : `${toolVerb(running)} · ${shortArgs(running.name, running.args)}`) : human ? human.text : summarizeTools(item.tools);
      const files = item.tools.filter(isFileChange);
      const details = !human || open;
      node.innerHTML = `${item.thinking && details ? thinkingBlock(item.key, item.thinking) : ""}
        <button type="button" class="tool-summary" data-action="toggle" data-key="${esc(item.key)}" aria-expanded="${open}"${human ? ` title="${open ? "Ocultar detalhes" : "Ver detalhes"}"` : ""}>
          ${running ? svg("i-spinner", "chev spin") : svg("i-chevron-right", "chev")}<span>${esc(summary)}</span>
        </button>
        ${open ? `<div class="tool-list">${item.tools.map(toolRow).join("")}</div>` : ""}
        ${files.length && details ? `<div class="file-cards">${files.map(fileCard).join("")}</div>` : ""}`;
      break;
    }
    case "agent": {
      const ex = agentExchange(item.tool);
      node.className = `msg agent-exchange is-${ex.status}`;
      const meta = [ex.model, ex.elapsed, ex.cost].filter(Boolean).map((text) => `<span>${esc(text)}</span>`).join("");
      node.innerHTML = `<div class="ax-line ax-ask"><span class="ax-avatar ax-pi" aria-hidden="true">PI</span>
          <p><strong>PI</strong> pediu a <strong>${esc(ex.name)}</strong>: ${esc(ex.ask)}</p></div>
        <div class="ax-line ax-reply"><span class="ax-avatar" data-family="${esc(ex.family)}" aria-hidden="true">${esc(ex.initial)}</span>
          <div class="ax-body">
            <div class="ax-head"><strong>${esc(ex.name)}</strong><span class="ax-chip" data-state="${esc(ex.status)}">${esc(ex.label)}</span>${meta ? `<span class="ax-meta">${meta}</span>` : ""}</div>
            ${ex.answer ? `<p class="ax-answer">${esc(ex.answer)}</p>` : ex.status === "running" ? `<p class="ax-wait"><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>Trabalhando nisso</p>` : ""}
          </div></div>`;
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
  runStatus.classList.toggle("is-hud", !prefs.technical);
  if (!state.isStreaming) return;
  runStatus.querySelector(".run-elapsed").textContent = formatElapsed(Date.now() - (state.runStartedAt || Date.now()));
  runStatus.querySelector(".run-phase").textContent = phaseLabel();
  const panel = runStatus.querySelector(".run-thinking");
  const line = runStatus.querySelector(".run-line");
  // Simple view never opens the live reasoning.
  const canExpand = prefs.technical && Boolean(state.liveThinking.trim());
  line.classList.toggle("expandable", canExpand);
  line.setAttribute("aria-expanded", String(canExpand && state.liveThinkingOpen));
  panel.hidden = !(canExpand && state.liveThinkingOpen);
  if (!panel.hidden) panel.textContent = state.liveThinking.slice(-4000);
}

let tick = 0;
setInterval(() => {
  tick++;
  updateRunStatus();
  if (state.isStreaming) scheduleHud();
  // Elapsed times on the stage move by the second while something runs; finished agents only by the minute.
  if (state.isStreaming || stageData.sig.includes('"tone":"work"') || tick % 30 === 0) scheduleStage();
  if (layout.right !== "open") return;
  if (inspector.tab === "terminal" && state.isStreaming) renderTermFoot();
  // Finished runs only age by the minute ("terminou há N min"): refresh them every 15 s.
  else if (inspector.tab === "subagents" && (!els.subBadge.hidden || tick % 15 === 0)) scheduleInspector("subagents");
  else if (inspector.tab === "context" && state.problems.length && tick % 15 === 0) scheduleInspector("context");
  else if (inspector.tab === "tasks" && tick % 30 === 0) {
    scheduleInspector("tasks");
    tasksPanel.refreshLinks();
  }
}, 1000);

function setRunning(running) {
  const was = state.isStreaming;
  if (was && !running && state.runStartedAt) rememberRun(Date.now() - state.runStartedAt);
  state.isStreaming = Boolean(running);
  scheduleHud();
  if (state.isStreaming && !was && !state.runStartedAt) state.runStartedAt = Date.now();
  if (!state.isStreaming) {
    state.runStartedAt = 0;
    state.liveThinkingOpen = false;
  }
  updateComposer();
  updateHeaderState();
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
  if (state.stick) markOpenSeen();
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
  } else if (action === "speak") {
    if (voice.speakingKey() === item.key) voice.stopSpeaking();
    else voice.speak(item.key, item.text);
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

// "Bifurcar a partir de…": the palette lists the fork points of the open conversation; picking one forks
// there and puts that message in the composer, like the pencil on a message.
async function pickForkPoint() {
  const res = await rpcRequest({ type: "get_fork_messages" }, 8000);
  const messages = res.success && Array.isArray(res.data?.messages) ? res.data.messages : [];
  state.forkMessages = messages;
  if (!messages.length) {
    toast("Esta conversa ainda não tem mensagens para bifurcar.", "warning");
    return;
  }
  openPalettePick("Bifurcar a partir de…", messages.map((message, index) => ({
    label: truncate(String(message.text ?? "").replace(/\s+/g, " ").trim(), 90) || "(mensagem vazia)",
    sub: `Mensagem ${index + 1} de ${messages.length}`,
    icon: "i-branch",
    run: async () => {
      const text = await forkFrom(message.entryId);
      if (text === null) return;
      setComposerText(text);
      els.prompt.focus();
      toast("Bifurcado: ajuste a mensagem e envie.");
    },
  })));
}

// "Duplicar" (RPC `clone`): copies the active branch into a new session and switches to the copy.
async function cloneSession() {
  const done = await runGated(state, async () => {
    const res = await rpcRequest({ type: "clone" }, SESSION_SWITCH_TIMEOUT_MS);
    if (!res.success) throw new Error(res.error || "Não foi possível duplicar a conversa.");
    if (res.data?.cancelled) {
      toast("Uma extensão cancelou a duplicação.", "warning");
      return false;
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
    return true;
  });
  if (done) toast("Conversa duplicada. Você está na cópia.");
}

// ------------------------------------------------------------------ tasks

function applyTodo(tasks, messages = null) {
  if (!tasks) return;
  state.todo = tasks;
  tasksPanel.observe(tasks, messages);
  renderTodo();
  scheduleInspector("tasks");
}

// --- HUD (hud.js): default vs in-use model, context with the auto-compaction mark, live activity, time left, last turn.
api("/api/pi-settings").then((settings) => {
  hud.settings = settings;
  scheduleHud();
}).catch(() => {});
function runHistory(projectId) {
  try { return JSON.parse(localStorage.getItem(RUN_HISTORY_KEY) || "{}")[projectId] ?? []; } catch { return []; }
}
function rememberRun(ms) {
  const id = state.currentProject?.id;
  if (!id || ms < 5000 || state.watch) return;
  try {
    const all = JSON.parse(localStorage.getItem(RUN_HISTORY_KEY) || "{}");
    all[id] = [...(all[id] ?? []), Math.round(ms)].slice(-20);
    localStorage.setItem(RUN_HISTORY_KEY, JSON.stringify(all));
  } catch { /* storage blocked: no history */ }
}
function scheduleHud() {
  if (hud.queued) return;
  hud.queued = true;
  requestAnimationFrame(() => {
    hud.queued = false;
    renderHud();
  });
}
function renderHud() {
  const truth = modelTruth({ defaults: hud.settings, session: state.session, messages: state.messages });
  const gauge = contextGauge(state.stats, hud.settings, { lastCompactionAt: hud.lastCompactionAt });
  let lastUser = -1;
  for (let index = state.messages.length - 1; index >= 0; index--) if (state.messages[index]?.role === "user") { lastUser = index; break; }
  const activity = activityNow({ streaming: state.isStreaming, phase: state.phase, runtime: state.runtime, turn: state.messages.slice(lastUser + 1), startedAt: state.runStartedAt });
  const eta = state.isStreaming || state.todo?.length ? estimate({ tasks: state.todo ?? [], stamps: taskStampsFromMessages(state.messages), history: runHistory(state.currentProject?.id), elapsed: state.runStartedAt ? Date.now() - state.runStartedAt : 0 }) : null;
  // Nothing running: the checklist progress stays, without a time estimate for work that is not happening.
  if (eta && !state.isStreaming && eta.basis === "checklist" && eta.pct !== 100) Object.assign(eta, { text: eta.detail.split(" · ")[0], detail: "", range: "" });
  const receipt = state.isStreaming ? null : turnReceipt(state.messages);
  const sig = JSON.stringify([truth, gauge, activity, eta, receipt]);
  if (sig === hud.sig) return;
  hud.sig = sig;
  // Default model of the settings, next to the model button (which shows the one in use)
  const differs = truth.differsFromDefault && truth.standard;
  els.hudDefault.hidden = !truth.standard;
  els.hudDefault.innerHTML = truth.standard ? `<span>Padrão</span><b>${esc(truth.standard.id)}</b>` : "";
  els.hudDefault.classList.toggle("is-different", Boolean(differs));
  els.hudDefault.title = truth.standard ? `Modelo padrão nas configurações do PI: ${truth.standard.provider ? `${truth.standard.provider}/` : ""}${truth.standard.id}${truth.standard.effort ? `, esforço ${truth.standard.effort}` : ""}.${truth.inUse ? ` A última resposta veio de ${truth.inUse.provider ? `${truth.inUse.provider}/` : ""}${truth.inUse.id}${truth.inUse.effort ? `, esforço ${truth.inUse.effort}` : ""}.` : ""}` : "";
  els.modelBtn.classList.toggle("is-mismatch", Boolean(truth.differsFromSelected));
  if (truth.differsFromSelected) els.modelBtn.title = `Selecionado: ${modelText(truth.selected)}. A última resposta veio de ${modelText(truth.inUse)}.`;
  // Context bar with the point where PI compacts by itself
  els.hudCtx.hidden = !gauge;
  els.ctxRing.classList.toggle("is-replaced", Boolean(gauge));
  if (gauge) {
    els.hudCtx.dataset.tone = gauge.tone;
    els.hudCtx.title = [`Contexto: ${gauge.label}`, gauge.toCompact, gauge.compacted].filter(Boolean).join(". ");
    els.hudCtx.innerHTML = `<span class="hud-ctx-bar" aria-hidden="true"><i style="width:${gauge.percent.toFixed(1)}%"></i>${gauge.compactAt !== null ? `<b style="left:${gauge.compactAt.toFixed(1)}%"></b>` : ""}</span><span class="hud-ctx-text">${esc(gauge.label)}</span>${gauge.compacted ? `<span class="hud-ctx-note">${esc(gauge.compacted)}</span>` : ""}`;
  }
  // The line above the composer: what is happening now and how long it may take, or what the last turn did
  const parts = [];
  if (activity) {
    parts.push(`<span class="hud-now"><i aria-hidden="true"></i><b>${esc(activity.text)}</b></span>`);
    if (activity.done) parts.push(`<span class="hud-done">${esc(activity.done)}</span>`);
    if (activity.elapsed) parts.push(`<span class="hud-time">${esc(activity.elapsed)}</span>`);
  } else if (receipt && (receipt.duration || receipt.files || receipt.cost)) {
    const bits = [receipt.duration, receipt.files ? `${receipt.files} ${receipt.files === 1 ? "arquivo alterado" : "arquivos alterados"}` : "", receipt.cost].filter(Boolean).join(" · ");
    parts.push(`<button type="button" class="hud-receipt" data-hud-files${receipt.files ? "" : " disabled"}><span>Última rodada</span><b>${esc(bits)}</b>${receipt.files ? `<span class="hud-link">Ver arquivos</span>` : ""}</button>`);
  }
  if (eta) {
    parts.push(`<span class="hud-eta" title="${esc([eta.detail, eta.range].filter(Boolean).join(". "))}">${eta.pct !== null ? `<span class="hud-eta-bar" aria-hidden="true"><i style="width:${eta.pct}%"></i></span>` : ""}<b>${esc(eta.text)}</b>${eta.range ? `<span>${esc(eta.range)}</span>` : ""}<span>${esc(eta.detail)}</span></span>`);
  }
  els.hudActivity.hidden = !parts.length;
  els.hudActivity.dataset.live = String(Boolean(activity));
  els.hudActivity.innerHTML = parts.join("");
}
$("#hudActivity").addEventListener("click", (event) => {
  if (!event.target.closest("[data-hud-files]")) return;
  setPanel("right", true);
  selectTab("files");
});
$("#hudCtx").addEventListener("click", () => {
  setPanel("right", true);
  selectTab("context");
});

function renderTodo() {
  scheduleHud();
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
    item.innerHTML = `${task.status === "in_progress" ? stateHtml("working", "todo-state") : '<span class="todo-mark" aria-hidden="true"></span>'}<span><span class="sr-only">${labels[task.status]}</span><span class="todo-subject">${esc(task.status === "in_progress" ? task.activeForm || task.subject : task.subject)}</span></span>`;
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
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) tree.poke();
  markOpenSeen();
});
window.addEventListener("pagehide", () => tree.stop());

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
  scheduleHud();
  scheduleInspector("terminal", "context", "files", "worktrees", "sidechat");
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

const VIEW_RENDERERS = { terminal: renderTerminal, tasks: () => tasksPanel.render(), subagents: renderSubagents, context: renderContext, files: renderFiles, browser: renderBrowser, worktrees: renderWorktrees, github: renderGithub, sidechat: () => sideChat.render() };

function renderInspector() {
  const runs = selectedSubagents();
  renderStage(runs);
  updateSubBadge(runs);
  tasksPanel.updateBadge(runs);
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
  if (tab === "tasks") tasksPanel.refreshLinks();
  scheduleInspector(tab);
  syncOrcaPolling();
  syncLivePolling();
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

// Every tab shows icon + label while they fit. Measured (any number of tabs, any panel width), the tabs give up first the
// labels of the unselected ones ("fit-selected"), and only if that still overflows all labels ("fit-icons").
// Name and count stay in title/aria-label either way.
function fitInspectorTabs() {
  els.tablist.classList.remove("fit-selected", "fit-icons");
  for (const tab of els.tabs) {
    const badge = tab.querySelector(".count-badge:not([hidden])");
    const name = tab.querySelector(".insp-label").textContent;
    const label = badge ? `${name}, ${badge.getAttribute("aria-label") || badge.textContent}` : name;
    tab.title = label;
    tab.setAttribute("aria-label", label);
  }
  // Measured once with text and once icon-only (two layouts per pass, no writes in between); tabFitMode (lib.js) decides.
  const tabs = els.tabs.filter((tab) => !tab.hidden);
  const withText = tabs.map((tab) => tab.offsetWidth);
  els.tablist.classList.add("fit-icons");
  const iconOnly = tabs.map((tab) => tab.offsetWidth);
  els.tablist.classList.remove("fit-icons");
  const style = getComputedStyle(els.tablist);
  const available = els.tablist.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  const selected = tabs.findIndex((tab) => tab.getAttribute("aria-selected") === "true");
  const mode = tabFitMode({ withText, iconOnly, available, selected });
  if (mode !== "full") els.tablist.classList.add(`fit-${mode}`);
}
let fitTabsQueued = false;
function scheduleFitTabs() {
  if (fitTabsQueued) return;
  fitTabsQueued = true;
  requestAnimationFrame(() => {
    fitTabsQueued = false;
    fitInspectorTabs();
  });
}
new ResizeObserver(scheduleFitTabs).observe(els.tablist);
new MutationObserver(scheduleFitTabs).observe(els.tablist, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["hidden", "aria-selected"] });

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
  // The panel width is in CSS pixels; under the density zoom one CSS pixel is smaller than one screen pixel.
  const zoom = Number.parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
  const move = (moveEvent) => setPanelWidth((window.innerWidth - moveEvent.clientX) / zoom, false);
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
  if (shellEls.cwd.textContent !== (state.currentProject?.name ?? "")) applyTermMode();
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
  const right = [lastAnswerModel()?.model || (model ? model.id || modelLabel(model) : ""), usage ? `${usage.percent}% ctx` : ""].filter(Boolean).join(" · ");
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

const SUB_PHASE = { running: "rodando", waiting: "aguardando", done: "concluído", error: "erro" };
const shortTaskLabel = (value) => String(value || "Agente").replace(/\s+/g, " ").trim().split(" ").filter(Boolean).slice(0, 7).join(" ") || "Agente";

function currentSubagents() {
  return collectSubagents(state.messages, state.runtime, state.subagentRecords, Date.now(), projectStatus.stall.subagentMs);
}

function selectedSubagents() {
  const current = currentSubagents();
  const selectedPath = state.session?.sessionFile;
  const root = tree.rootFor(selectedPath);
  if (!root) {
    if (selectedPath) tree.resolveRoot(selectedPath).then((resolved) => {
      if (!resolved) return;
      scheduleInspector("subagents");
      return tree.loadDescendants(resolved.sessionPath);
    }).catch(report);
    return current;
  }
  tree.loadDescendants(root.sessionPath).catch(report);
  const descendants = tree.descendants(root.sessionPath);
  if (!descendants.length) return current;
  const enriched = new Map();
  const descendantPaths = new Set(descendants.map((item) => item.sessionPath.toLowerCase()));
  for (const run of current) {
    const item = subagentSession({ run, history: state.history, parentFile: selectedPath });
    if (item?.path && descendantPaths.has(item.path.toLowerCase())) enriched.set(item.path.toLowerCase(), run);
  }
  const grouped = descendants.map((item) => {
    const semanticState = tree.stateOf(item.sessionPath);
    return enriched.get(item.sessionPath.toLowerCase()) ?? {
      key: `tree:${item.sessionPath}`, agentId: item.sessionId, name: "", title: item.title,
      type: item.agentType || "", description: item.title,
      model: "", stats: [], sections: [], tail: [],
      status: item.raw?.error ? "error" : semanticState === "working" || semanticState === "attention" ? "running" : semanticState === "urgent" ? "waiting" : "completed",
      phase: item.raw?.error ? "error" : semanticState === "urgent" ? "waiting" : semanticState === "working" || semanticState === "attention" ? "running" : "done",
      indicatorState: semanticState === "urgent" ? "urgent" : semanticState === "attention" ? "attention" : null,
      elapsed: Math.max(0, Date.now() - (item.startedAt || Date.now())), background: false, stalled: false,
    };
  });
  return [...grouped, ...current.filter((run) => {
    const item = subagentSession({ run, history: state.history, parentFile: selectedPath });
    return !item?.path || !descendantPaths.has(item.path.toLowerCase());
  })];
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

function subagentFamilyIcon(run) {
  const family = subagentFamily(run);
  return family === "general" ? "i-agents" : `i-ag-${family}`;
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
    <button type="button" class="sa-head" data-sa="${esc(run.key)}" aria-expanded="${open}" aria-label="${esc(`${run.title}: ${run.indicatorState === "urgent" ? "precisa de você" : run.indicatorState === "attention" ? "atenção" : SUB_PHASE[run.phase]}`)}">
      ${stateHtml(timing.stalled ? "attention" : run.indicatorState ?? subagentIndicator(run.phase))}
      <span class="sa-title">${svg(subagentFamilyIcon(run), "sa-ico")}<strong title="${esc(run.title)}">${esc(shortTaskLabel(run.title))}</strong>${subtitle ? `<span class="sa-type">${esc(subtitle)}</span>` : ""}</span>
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
  const runs = selectedSubagents();
  updateSubBadge(runs);
  const counts = { running: 0, waiting: 0, done: 0, error: 0 };
  for (const run of runs) counts[run.phase]++;
  const extension = [state.statuses.get("subagents"), ...[...state.widgets.values()].flat()].filter(Boolean);
  const nodes = [];
  const head = subCache.get("head") || { node: document.createElement("div"), sig: "" };
  const headSig = JSON.stringify([counts, extension, runs.length]);
  if (head.sig !== headSig) {
    head.node.className = "sa-summary";
    head.node.innerHTML = runs.length
      ? `<p class="sa-counts"><span><b>${counts.running}</b> rodando</span>${counts.waiting ? `<span><b>${counts.waiting}</b> aguardando</span>` : ""}<span><b>${counts.done}</b> ${counts.done === 1 ? "concluído" : "concluídos"}</span>${counts.error ? `<span class="bad"><b>${counts.error}</b> com erro</span>` : ""}</p>`
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
      <div class="progress ctx-progress tone-${contextTone(usage.percent)}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${usage.percent}" aria-label="Contexto usado"><span style="width:${usage.percent}%"></span></div>
      <div class="ctx-meta"><span>${esc(windowText)}</span>${data.cost !== null ? `<span>US$ ${data.cost.toFixed(2)}</span>` : ""}</div>`
    : `<div class="ctx-big is-empty"><strong>n/d</strong><span>${state.currentProject ? "Uso de contexto aparece após a primeira resposta." : "Nenhum projeto aberto."}</span></div>`;
  const row = (label, value, extra = "") => `<div class="kv-row"><dt>${extra}${esc(label)}</dt><dd>${esc(value)}</dd></div>`;
  const tokens = data.parts.length
    ? `<section class="insp-sec"><h3 class="sec-title">Tokens da sessão</h3>
        <div class="stack-bar" aria-hidden="true">${data.parts.map((part) => `<span class="seg k-${part.key}" style="flex-grow:${part.share}"></span>`).join("")}</div>
        <dl class="kv">${data.parts.map((part) => row(part.label, `${formatTokens(part.value)} · ${Math.round(part.share * 100)}%`, `<i class="sw k-${part.key}" aria-hidden="true"></i>`)).join("")}
        ${data.total !== null ? row("Total", formatTokens(data.total)) : ""}</dl></section>`
    : "";
  const resourceRowsList = resourceRows(piResources.data);
  const resources = livePiSessionId()
    ? `<section class="insp-sec"><h3 class="sec-title">Recursos</h3>${resourceRowsList.length
      ? `<dl class="kv">${resourceRowsList.map(([label, value]) => row(label, value)).join("")}</dl>`
      : `<p class="sec-hint">${piResources.error ? "Indisponível no momento." : "Medindo…"}</p>`}</section>`
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
  const problemRow = (item) => `<li>${stateHtml(item.kind === "error" ? "urgent" : "attention")}<span class="prob-text">${esc(item.text)}</span>${item.at ? `<span class="prob-time">${esc(agoLabel(item.at, now))}</span>` : ""}</li>`;
  const problems = `<section class="insp-sec"><h3 class="sec-title">Erros e tentativas</h3>${state.problems.length
    ? `<ul class="prob-list">${[...state.problems].reverse().map(problemRow).join("")}</ul>`
    : `<p class="sec-hint">Nenhum erro nesta conversa.</p>`}</section>`;
  const compacting = state.compactingProjects.has(state.currentProject?.id);
  const blocked = !state.currentProject || state.processExited || state.isStreaming || compacting;
  const hint = compacting ? "Compactando… isso pode levar alguns instantes." : state.isStreaming ? "Disponível quando o PI terminar a resposta atual." : "Resume o histórico para liberar espaço na janela de contexto.";
  const compact = `<section class="insp-sec ctx-actions"><button type="button" class="btn btn-block" data-compact${blocked ? " disabled" : ""}${compacting ? ' aria-busy="true"' : ""}>${compacting ? `${svg("i-spinner", "spin")}Compactando…` : "Compactar agora"}</button><p class="sec-hint">${esc(hint)}</p></section>`;
  const focused = document.activeElement?.closest?.("[data-compact]") ? "[data-compact]" : document.activeElement?.closest?.("[data-copy-session]") ? "[data-copy-session]" : document.activeElement?.closest?.(".fast-seg") ? ".fast-seg input:checked" : "";
  els.ctxView.innerHTML = `<section class="insp-sec ctx-hero">${hero}</section>${fastSectionHtml()}${todaySection}${tokens}${resources}${problems}${model}${counts}${file}${compact}`;
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

// --- Fast mode (extension codex-fast-mode): the Velocidade section, the composer chip, Ctrl+K entries.
// The mode is read from the extension's own status (pure mapping in lib.js) and changed with `/fast <flag>`,
// an extension command: PI runs it at once even while an answer streams, so no streamingBehavior is sent.

const fast = { available: null, pending: null };
const FAST_SEND_DELAY_MS = 350;
const FAST_CONFIRM_MS = 5000;

// Hidden when the extension is not loaded: no `fast` command and no status of its own.
const fastAvailable = () => fast.available === true || state.statuses.has(FAST_STATUS_KEY);

function fastView() {
  return fastPanel({
    statusText: state.statuses.get(FAST_STATUS_KEY),
    model: state.session?.model,
    selected: fast.pending?.mode,
    disabledReason: !state.currentProject || state.processExited ? "PI indisponível." : "",
  });
}

function fastSectionHtml() {
  if (state.watch) return `<section class="insp-sec fast-sec"><h3 class="sec-title">Velocidade</h3><p class="sec-hint">Modo indisponível para conversa acompanhada.</p></section>`;
  if (!fastAvailable()) return "";
  const view = fastView();
  const radios = view.options.map((option) => `<label title="${esc(option.reason)}"><input type="radio" name="fastMode" value="${option.mode}"${option.selected ? " checked" : ""}${option.disabled ? " disabled" : ""} /><span>${esc(option.label)}</span></label>`).join("");
  return `<section class="insp-sec fast-sec"><h3 class="sec-title">Velocidade</h3>
    <div class="seg-group fast-seg" role="radiogroup" aria-label="Velocidade">${radios}</div>
    <p class="sec-hint">${esc(view.description)}</p>
    <dl class="kv"><div class="kv-row"><dt>Estado</dt><dd>${esc(view.liveLabel)}</dd></div></dl>
    ${view.notes.map((note) => `<p class="sec-hint">${esc(note)}</p>`).join("")}</section>`;
}

function renderFastChip() {
  const chip = fastAvailable() && !state.watch ? fastView().chip : null;
  els.fastChip.hidden = !chip;
  if (chip) {
    els.fastChip.textContent = chip.label;
    els.fastChip.title = chip.title;
  }
}

function refreshFastUi() {
  if (fast.available === null && state.currentProject && !state.processExited && !state.commands && !state.commandsLoading) loadCommands();
  renderFastChip();
  scheduleInspector("context");
}

// The extension reported a new status: a pending choice is settled once it shows up.
function fastStatusChanged() {
  if (fast.pending && fastFromStatus(state.statuses.get(FAST_STATUS_KEY)).mode === fast.pending.mode) {
    clearTimeout(fast.pending.timer);
    fast.pending = null;
  }
  refreshFastUi();
}

// Drops the optimistic choice and says why (the PI's own warning if it sent one).
function revertFast(pending, reason) {
  if (fast.pending !== pending) return;
  clearTimeout(pending.timer);
  fast.pending = null;
  refreshFastUi();
  toast(reason || pending.notice || "O PI não confirmou a mudança do modo Fast.", "warning");
}

async function sendFast(pending, option) {
  if (state.watch || fast.pending !== pending) return;
  pending.sent = true;
  pending.timer = setTimeout(() => revertFast(pending), FAST_CONFIRM_MS);
  try {
    const res = await rpcRequest({ type: "prompt", message: `/fast ${option.flag}` }, 15000);
    if (!res.success) revertFast(pending, res.error || "O PI recusou o comando /fast.");
  } catch (error) {
    revertFast(pending, error.message);
  }
}

// Shows the choice at once and sends it shortly after, so arrowing through the radios sends only the last one.
function chooseFast(option) {
  if (state.watch) return;
  clearTimeout(fast.pending?.timer);
  if (option.mode === fastFromStatus(state.statuses.get(FAST_STATUS_KEY)).mode && !fast.pending?.sent) {
    fast.pending = null;
    refreshFastUi();
    return;
  }
  const pending = { mode: option.mode, sent: false, notice: "", timer: setTimeout(() => sendFast(pending, option), FAST_SEND_DELAY_MS) };
  fast.pending = pending;
  refreshFastUi();
}

function fastPaletteActions() {
  if (!fastAvailable() || state.watch) return [];
  const view = fastView();
  return [["Fast: ligar", "on"], ["Fast: desligar", "off"], ["Fast: eco", "eco"], ["Fast: ultra", "ultra"]].map(([label, flag]) => {
    const option = view.options.find((candidate) => candidate.flag === flag);
    return { label, icon: "i-gauge", keywords: "velocidade fast", run: () => (option.disabled ? toast(option.reason, "warning") : chooseFast(option)) };
  });
}

els.ctxView.addEventListener("change", (event) => {
  const option = event.target.matches?.("input[name=fastMode]") && FAST_OPTIONS.find((candidate) => candidate.mode === event.target.value);
  if (option) chooseFast(option);
});

els.fastChip.addEventListener("click", () => {
  setPanel("right", true);
  selectTab("context");
  requestAnimationFrame(() => requestAnimationFrame(() => els.ctxView.querySelector(".fast-seg input:checked")?.focus()));
});

// --- Files: project path + files written/edited in this session.

function renderFiles() {
  const project = state.currentProject;
  els.envPath.innerHTML = project
    ? `<div class="path-row"><code title="${esc(project.cwd)}">&lrm;${esc(project.cwd)}&lrm;</code><button type="button" class="icon-btn small" data-copy-path aria-label="Copiar caminho do projeto">${svg("i-copy")}</button></div>`
    : `<p class="muted">Nenhum projeto aberto.</p>`;
  renderOutputs();
}

const gitTag = (info) => `<span class="git-tag tone-${info.tone}"><i class="git-dot" aria-hidden="true"></i>${esc(info.label)}</span>`;

function outputRowHtml(item, tag = "") {
  return `<div class="output-row"><button type="button" class="output-item" data-open="${esc(item.path)}" title="Abrir no Navegador · ${esc(item.path)}">
      ${svg("i-file", "file-ico")}<span class="output-text"><span class="output-name">${esc(item.name)}</span><small>${esc(item.kind === "write" ? "criado" : "editado")} · ${esc(item.path)}</small></span>${tag}
      <span class="diff-count"><span class="add">+${item.added}</span><span class="del">-${item.removed}</span></span>
    </button><button type="button" class="icon-btn small output-diff" data-tools="${esc(item.toolIds.join(","))}" aria-label="Ver alterações de ${esc(item.name)}" title="Ver alterações">${svg("i-code")}</button></div>`;
}

// A file the repository reports as changed that this conversation did not touch: no diff counts, same click-to-open.
function repoFileRowHtml(item, tag) {
  return `<div class="output-row"><button type="button" class="output-item" data-open="${esc(item.path)}" title="Abrir no Navegador · ${esc(item.path)}">
      ${svg("i-file", "file-ico")}<span class="output-text"><span class="output-name">${esc(item.name)}</span><small>${esc(item.rel)}</small></span>${tag}
    </button></div>`;
}

function gitGroupHtml(group) {
  const head = `<h4 class="git-group${group.tone ? ` tone-${group.tone}` : ""}"><i class="git-dot" aria-hidden="true"></i>${esc(group.label)}<b>${group.count}</b></h4>`;
  const tag = group.tone ? gitTag(group) : "";
  const rows = group.items.map((item) => (item.output ? outputRowHtml(item.output, tag) : repoFileRowHtml(item, tag))).join("");
  return `<section class="git-section">${head}${rows}${group.more ? `<p class="muted git-more">+${group.more} arquivos não listados</p>` : ""}</section>`;
}

function renderOutputs() {
  const groups = groupGitFiles(state.outputs, gitFiles.data);
  const colored = groups.some((group) => group.tone);
  els.gitLegend.hidden = !colored;
  if (colored) els.gitLegend.innerHTML = gitLegend().map(gitTag).join("");
  if (state.outputs.map((item) => item.path).join("\0") !== gitFiles.asked) gitPoller.kick();
  if (!groups.length) {
    els.outputsList.innerHTML = `<p class="muted">Arquivos criados ou editados nesta conversa aparecem aqui.</p>`;
    return;
  }
  els.outputsList.innerHTML = colored ? groups.map(gitGroupHtml).join("") : groups[0].items.map((item) => outputRowHtml(item.output)).join("");
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
  els.send.disabled = state.processExited || state.sending || (Boolean(state.watch) && !steerableWatch()) || !hasContent || blocked || (!state.currentProject && !state.gate);
  els.composer.classList.toggle("is-shell", shell);
  els.shellChip.hidden = !shell;
  els.stop.hidden = !(state.isStreaming || state.bash);
  els.send.classList.toggle("is-queue", state.isStreaming && !shell);
  els.send.setAttribute("aria-label", shell ? "Executar" : state.isStreaming ? "Direcionar (steer)" : "Enviar");
  els.hint.textContent = composerHint(shell);
  els.hint.title = els.hint.textContent;
  els.prompt.disabled = state.processExited || (Boolean(state.watch) && !steerableWatch());
}

// The long placeholder (/ commands, @ files, ! shell) does not fit a phone-width composer.
const narrowComposer = window.matchMedia("(max-width: 560px)");
const PLACEHOLDER_LONG = els.prompt.placeholder;
const applyPlaceholder = () => {
  els.prompt.placeholder = steerableWatch() ? `Mensagem para ${state.watch.steer.label} (via PI principal)` : state.watch ? "Somente leitura: continue aqui quando a conversa parar" : narrowComposer.matches ? "Mensagem · / @ !" : PLACEHOLDER_LONG;
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

// A message to a running subagent: the Studio PI runs /steer (extensions/studio-steer.ts); its notify comes back as a toast.
async function steerSubagent(agentId, text) {
  const message = steerCommand(agentId, text);
  if (!message) throw new Error("Escreva uma mensagem.");
  if (!state.commands) await loadCommands();
  if (state.commands && !state.commands.some((command) => command.name === "steer")) throw new Error("O comando /steer não está instalado no PI. Reinstale as extensões do Studio.");
  await sendProgrammatic(message, "command");
}

// A message the app writes for the user (not the composer): "prompt" is a normal user message (queued as a follow-up while
// the PI answers); "command" is an extension slash command, which the PI runs at once and which leaves no user message.
async function sendProgrammatic(message, kind) {
  if (state.processExited || (state.watch && kind !== "command")) throw new Error("O PI não pode receber mensagens agora.");
  if (state.gate) await waitSessionGate(state);
  if (!state.currentProject) throw new Error("Escolha um projeto primeiro.");
  const type = kind === "command" ? "prompt" : state.isStreaming ? "follow_up" : "prompt";
  const optimistic = type === "prompt" && kind !== "command" ? { role: "user", content: [{ type: "text", text: message }], timestamp: Date.now(), _optimistic: true } : null;
  if (optimistic) {
    state.messages.push(optimistic);
    state.stick = true;
    scheduleRender();
  }
  const drop = () => {
    const index = state.messages.indexOf(optimistic);
    if (index !== -1) state.messages.splice(index, 1);
    scheduleRender();
  };
  let res;
  try {
    res = await rpcRequest({ type, message }, 0);
  } catch (error) {
    drop();
    throw error;
  }
  if (!res.success) {
    drop();
    throw new Error(res.error || "O PI recusou a mensagem.");
  }
  if (type === "follow_up") toast("Tarefa adicionada à fila.");
}

async function submit(mode) {
  if (state.watch?.steer && steerableWatch()) {
    const text = els.prompt.value.trim();
    if (!text || state.sending) return;
    clearComposer();
    steerSubagent(state.watch.steer.agentId, text).catch((error) => {
      if (!els.prompt.value) setComposerText(text);
      report(error);
    });
    return;
  }
  if (state.processExited || state.sending || state.watch) return;
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
  voice.stopSpeaking();
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
  // While recording, Enter stops the take and transcribes instead of sending.
  if (voice.isRecording() && event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    voice.toggle();
    return;
  }
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
  els.shortcutsBody.replaceChildren(...[...SHORTCUT_GROUPS, VOICE_SHORTCUTS].map((group) => {
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
  const items = entries.map((entry, position) => ({
    ...entry.item,
    active: position === index,
    ...(kind === "mention" && position === index ? { badge: "Alt+↵ Navegador" } : {}),
    onSelect: (event) => acceptComposerEntry(kind, entry, event?.altKey ? "alt" : "click"),
  }));
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
  // Alt+Enter / Alt+click on a file: look at it in the Navegador and leave the message as it is.
  if (kind === "mention" && via === "alt") {
    closeComposerMenu();
    els.prompt.focus();
    return openInBrowser(entry.file);
  }
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
  if (event.key === "Enter" && event.altKey && !event.shiftKey && !event.ctrlKey && !event.metaKey && composerMenu.kind === "mention") {
    event.preventDefault();
    acceptComposerEntry("mention", composerMenu.entries[composerMenu.index], "alt");
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
  if (state.currentProject === project) {
    fast.available = Boolean(state.commands?.some((command) => command.name === "fast"));
    refreshFastUi();
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
  els.statusLine.textContent = usefulStatuses(state.statuses).join(" · ");
  scheduleHud();
  scheduleInspector("terminal", "subagents", "tasks");
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
  // Which accounts are connected (pi auth check, cached by the server): models of an account that is not connected stay
  // visible but locked, and providers without any account are listed locked with what to do.
  if (!state.modelAccounts) {
    try {
      const providers = [...new Set(state.models.map((model) => model.provider).filter(Boolean))].join(",");
      state.modelAccounts = (await api(`/api/model-accounts?providers=${encodeURIComponent(providers)}`)).accounts ?? [];
    } catch { state.modelAccounts = []; }
  }
  const current = state.session?.model;
  const items = [];
  const { connected, missing } = modelMenuGroups(state.models, state.modelAccounts);
  if (!connected.length) items.push({ section: "Modelo" }, { label: "Nenhum modelo de conta conectada", disabled: true });
  for (const group of connected) {
    items.push({ section: group.locked ? `${group.label} · conta desconectada` : group.label });
    for (const model of group.models) {
      items.push({
        label: modelLabel(model),
        sub: group.locked ? connectHint(group.account) : model.contextWindow ? `${formatTokens(model.contextWindow)} contexto` : "",
        disabled: group.locked,
        checked: Boolean(current && current.id === model.id && current.provider === model.provider),
        onSelect: () => rpcRequest({ type: "set_model", provider: model.provider, modelId: model.id }).then((res) => {
          if (!res.success) throw new Error(res.error || "Não foi possível trocar o modelo");
          state.thinkingLevels = null;
          toast(`Modelo: ${modelLabel(model)}`);
        }),
      });
    }
  }
  if (missing.length) {
    items.push({ separator: true }, { section: "Contas não conectadas" });
    for (const account of missing) items.push({ label: account.label, sub: account.hint, disabled: true });
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
      if (fast.pending && req.notifyType && req.notifyType !== "info") fast.pending.notice = stripAnsi(req.message);
      toast(stripAnsi(req.message) || "Notificação do PI", req.notifyType || "info");
      addNotice(eventNotice(req));
      break;
    case "setStatus":
      if (req.statusText) state.statuses.set(req.statusKey || "default", stripAnsi(req.statusText));
      else state.statuses.delete(req.statusKey || "default");
      renderWidgets();
      if (req.statusKey === FAST_STATUS_KEY) fastStatusChanged();
      break;
    case "setWidget":
      if (Array.isArray(req.widgetLines) && req.widgetLines.length) state.widgets.set(req.widgetKey || "default", req.widgetLines.map(stripAnsi));
      else state.widgets.delete(req.widgetKey || "default");
      renderWidgets();
      break;
    case "setTitle":
      break; // the window title stays "PI Studio" (one clean bar with the app header)
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

function openCustomize({ focusName = false } = {}) {
  els.customizeDialog.returnValue = "";
  els.prefName.value = prefs.userName || "";
  els.prefName.placeholder = accountName?.trim() || "Seu nome";
  els.prefThinking.checked = Boolean(prefs.showThinking);
  els.prefTools.checked = Boolean(prefs.expandTools);
  els.customizeDialog.showModal();
  if (focusName) els.prefName.select();
}
// The name in the corner is the way to change it: one click opens Personalização on the name field.
// The sidebar's Claude Code list: the sessions the person actually uses, read-only, each opening Vorcaro's pop-out.
const claudeSide = $("#claudeSide");
const CLAUDE_DOT = { aguardando: "wait", fazendo: "work", "a-fazer": "open", feito: "done" };
const CLAUDE_GROUPS_KEY = "pi-studio:claude-groups";
async function loadClaudeSide() {
  let sessions = [];
  try { sessions = (await api("/api/claude/sessions")).sessions ?? []; } catch { return; }
  claudeSide.hidden = !sessions.length;
  if (!sessions.length) return;
  let closed = {};
  try { closed = JSON.parse(localStorage.getItem(CLAUDE_GROUPS_KEY) || "{}"); } catch { closed = {}; }
  const groups = new Map();
  for (const item of sessions) {
    if (!groups.has(item.project)) groups.set(item.project, []);
    groups.get(item.project).push(item);
  }
  claudeSide.innerHTML = `<div class="side-heading"><span>Claude Code</span><button type="button" class="info-dot" title="As suas sessões do Claude Code dos últimos dias, só leitura. Clique numa para ver no Vorcaro o que está acontecendo.">i</button></div>
    ${[...groups].map(([project, items]) => `<details class="claude-group" data-project="${esc(project)}"${closed[project] ? "" : " open"}>
      <summary><span>${esc(project)}</span><b>${items.length}</b></summary>
      ${items.map((item) => `<button type="button" class="claude-item" data-path="${esc(item.path)}" title="${esc(item.title)}"><i data-dot="${CLAUDE_DOT[item.column] ?? "open"}" aria-hidden="true"></i><span>${esc(item.title)}</span><time>${esc(relativeTime(item.lastActivity))}</time></button>`).join("")}
    </details>`).join("")}`;
}
claudeSide.addEventListener("click", (event) => {
  const item = event.target.closest(".claude-item");
  if (item) vorcaro.showSession(item.dataset.path);
});
claudeSide.addEventListener("toggle", (event) => {
  const group = event.target.closest?.(".claude-group");
  if (!group) return;
  let closed = {};
  try { closed = JSON.parse(localStorage.getItem(CLAUDE_GROUPS_KEY) || "{}"); } catch { closed = {}; }
  closed[group.dataset.project] = !group.open;
  try { localStorage.setItem(CLAUDE_GROUPS_KEY, JSON.stringify(closed)); } catch { /* storage off */ }
}, true);
loadClaudeSide();
setInterval(() => { if (!document.hidden) loadClaudeSide(); }, 60_000);
$("#userBtn").addEventListener("click", () => openCustomize({ focusName: true }));

els.customizeDialog.addEventListener("close", () => {
  if (els.customizeDialog.returnValue !== "save") return;
  prefs.userName = els.prefName.value.trim();
  prefs.nameChosen = true;
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
  for (const input of els.settingDensity) input.checked = input.value === settings.density;
  for (const input of els.settingWidth) input.checked = input.value === settings.chatWidth;
  els.settingVoiceRead.checked = voice.speechSupported && voiceReadEnabled(localStorage.getItem(VOICE_READ_KEY));
  els.settingVoiceRead.disabled = !voice.speechSupported;
  els.settingNotify.checked = notifyOn() && !denied;
  els.settingNotifyHint.textContent = denied
    ? "Bloqueadas pelo navegador: libere nas permissões do site."
    : "Avisa quando o PI termina ou precisa de você, com a aba em segundo plano.";
  els.settingMotion.checked = settings.reduceMotion;
  els.settingThinking.checked = Boolean(prefs.showThinking);
  els.settingTechnical.checked = Boolean(prefs.technical);
  els.settingOrca.checked = orcaOn();
  els.settingOrcaFollow.checked = settings.orcaFollow;
  els.settingOrcaFollow.disabled = !orcaOn();
  els.settingsDialog.showModal();
}

els.settingsDialog.addEventListener("change", (event) => {
  const { target } = event;
  if (target.name === "settingFont") settings.fontSize = target.value;
  else if (target.name === "settingDensity") settings.density = target.value;
  else if (target.name === "settingWidth") settings.chatWidth = target.value;
  else if (target === els.settingMotion) settings.reduceMotion = target.checked;
  else if (target === els.settingOrca) Object.assign(settings, { orcaEnabled: target.checked, orcaChosen: true });
  else if (target === els.settingOrcaFollow) {
    settings.orcaFollow = target.checked;
    orca.lastFollowed = null;
  } else if (target === els.settingVoiceRead) {
    localStorage.setItem(VOICE_READ_KEY, target.checked ? "1" : "0");
    if (!target.checked) voice.stopSpeaking();
  } else if (target === els.settingNotify) {
    localStorage.setItem(NOTIFY_KEY, target.checked ? "1" : "0");
    ensureNotifyPermission();
  } else if (target === els.settingThinking || target === els.settingTechnical) {
    prefs[target === els.settingTechnical ? "technical" : "showThinking"] = target.checked;
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
  els.tabs.find((button) => button.dataset.tab === "worktrees").hidden = false;
  els.worktreesBtn.hidden = !(on && orca.data?.available);
  updateWorktreeBadges();
  orca.uiKey = `${on}/${Boolean(orca.data?.available)}`;
  syncOrcaPolling();
  if (on && !orca.data) pollOrca();
}

// Orca is only asked while the Worktrees tab is on screen or follow mode is on, and never in a hidden page.
function syncOrcaPolling() {
  const panelVisible = (inspector.tab === "worktrees" && layout.right === "open") || els.worktreesDialog.open;
  const wanted = orcaPollWanted({
    enabled: orcaOn(),
    follow: settings.orcaFollow,
    // The top-bar button's running count keeps Orca polled while the button is shown.
    tabVisible: panelVisible || !els.worktreesBtn.hidden || Boolean(state.watch),
    hidden: document.hidden,
  });
  const delay = orcaPollDelay({ follow: settings.orcaFollow, panelVisible, watching: Boolean(state.watch) });
  if (wanted && orca.timer && orca.timerMs !== delay) {
    clearInterval(orca.timer);
    orca.timer = null;
  }
  if (wanted && !orca.timer) {
    orca.timer = setInterval(pollOrca, delay);
    orca.timerMs = delay;
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
  scheduleInspector("worktrees", "tasks");
  renderWorktreesOverlay();
  followOrca();
}

// Opens the worktree's project and shows its conversation: followed read-only when an Orca agent or another PI is
// writing it, else opened normally. `agent` (a clicked Orca agent row) picks the conversation titled like it.
// A project that already shows a conversation is left alone unless an agent was clicked.
function openWorktree(worktree, { agent = null } = {}) {
  return runGated(state, async () => {
    const open = samePath(state.currentProject?.cwd, worktree.path);
    if (open && !agent && (state.watch || state.messages.length)) return;
    if (!open) await (worktree.projectId ? loadProject(worktree.projectId) : loadProject(null, { cwd: worktree.path }));
    await refreshHistory().catch(() => {});
    const status = studioPiState(projectStatus.last.get(state.currentProject.id));
    const pick = pickConversation({ history: state.history, agents: agent ? [agent] : worktreeAgents(), liveBusy: state.isStreaming || status === "fazendo" || status === "aguardando" });
    if (pick.item) await showConversation(pick.item, pick.item.path, { fallback: pick.kind === "latest" });
  });
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
  const resources = resourceLine(resourceForPath(allResources.list, worktree.path));
  const current = samePath(state.currentProject?.cwd, worktree.path);
  const node = document.createElement("article");
  node.className = `sa-card wt-card${row.running ? " is-running" : ""}${current ? " is-current" : ""}`;
  node.innerHTML = `
    <button type="button" class="sa-head" data-wt="${esc(worktree.path)}" data-project="${esc(worktree.projectId || "")}"${current ? ' aria-current="true"' : ""}>
      ${stateHtml(worktreeIndicator(worktree))}
      <span class="sa-title"><strong>${esc(row.name)}</strong><span class="sa-type">${esc(row.sub)}</span></span>
      <span class="sa-state">${row.unread ? '<span class="wt-unread" role="img" aria-label="não lido" title="Não lido"></span>' : ""}${row.active ? '<span class="wt-flag" title="Em foco no Orca">Orca</span>' : ""}<span class="sa-phase">${esc(row.statusLabel)}</span></span>
    </button>
    <div class="wt-body">
      ${row.agents ? `<p class="sa-desc">${esc(row.agents)}</p>` : ""}
      ${row.message ? `<p class="wt-msg">${esc(row.message)}</p>` : ""}
      ${resources ? `<p class="wt-res">${esc(resources)}</p>` : ""}
      ${row.meta.length ? `<p class="sa-meta">${row.meta.map((item) => `<span>${esc(item)}</span>`).join("")}</p>` : ""}
    </div>`;
  return node;
}

// Worktrees and GitHub of the open project from the Studio itself (git and gh): Orca is no longer needed for them.
const devtools = { project: null, worktrees: null, github: null, loading: new Set(), sig: "" };
async function loadDevtools(kind) {
  const project = state.currentProject;
  if (!project || devtools.loading.has(kind)) return;
  if (devtools.project !== project.id) Object.assign(devtools, { project: project.id, worktrees: null, github: null });
  devtools.loading.add(kind);
  try {
    devtools[kind] = await api(`/api/devtools/${kind}?project=${encodeURIComponent(project.id)}`);
  } catch (error) {
    devtools[kind] = { error: error.message };
  } finally {
    devtools.loading.delete(kind);
    scheduleInspector(kind);
  }
}

function devEmpty(icon, title, hint = "") {
  const empty = document.createElement("div");
  empty.className = "insp-empty";
  empty.innerHTML = `${svg(icon)}<strong>${esc(title)}</strong>${hint ? `<span>${esc(hint)}</span>` : ""}`;
  return empty;
}

function renderGitWorktrees() {
  if (devtools.project !== state.currentProject?.id || !devtools.worktrees) {
    loadDevtools("worktrees");
    return [devEmpty("i-branch", "Lendo as worktrees")];
  }
  const items = devtools.worktrees.worktrees ?? [];
  if (!items.length) return [devEmpty("i-branch", "Nenhuma worktree", devtools.worktrees.reason || devtools.worktrees.error || "")];
  return items.map((worktree) => {
    const view = gitWorktreeView(worktree);
    const card = document.createElement("button");
    card.type = "button";
    card.className = "gw-card";
    card.dataset.gitWt = worktree.path;
    card.title = worktree.path;
    card.innerHTML = `<span class="gw-top"><span class="gw-name">${esc(view.name)}</span><span class="gw-branch">${svg("i-branch")}${esc(view.branch)}</span></span>
      <span class="gw-meta"><span class="gw-chip${view.dirty ? " is-dirty" : ""}">${esc(view.changes)}</span><span>${esc(view.sync)}</span></span>
      ${view.last ? `<span class="gw-last">${esc(view.last)}</span>` : ""}`;
    return card;
  });
}

function renderGithub() {
  const view = els.ghView;
  if (devtools.project !== state.currentProject?.id || !devtools.github) {
    loadDevtools("github");
    view.replaceChildren(devEmpty("i-code", state.currentProject ? "Lendo o GitHub" : "Abra uma conversa de um projeto"));
    return;
  }
  const data = devtools.github;
  if (!data.prs) {
    view.replaceChildren(devEmpty("i-code", data.repo ? `GitHub de ${data.repo}` : "Sem repositório do GitHub", data.reason || data.error || ""));
    return;
  }
  const failing = data.prs.filter((pr) => pr.checks?.failed).length;
  setBadge(els.ghBadge, failing, plural(failing, "PR com check falhando", "PRs com check falhando"));
  const link = (url, inner, cls = "") => `<a class="${cls}" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${inner}</a>`;
  const prs = data.prs.map((pr) => {
    const v = prView(pr);
    return link(pr.url, `<span class="gh-row-top"><b>#${pr.number}</b><span class="gh-title">${esc(pr.title)}</span></span>
      <span class="gh-row-meta"><i data-tone="${v.tone}"></i><span>${esc(v.checks)}</span>${v.state ? `<span>${esc(v.state)}</span>` : ""}<span>${esc(pr.branch)} → ${esc(pr.base)}</span><span>${esc(relativeTime(Date.parse(pr.updatedAt)))}</span></span>`, "gh-row");
  }).join("") || `<p class="vc-empty">Nenhum PR aberto.</p>`;
  const issues = data.issues.map((issue) => link(issue.url, `<span class="gh-row-top"><b>#${issue.number}</b><span class="gh-title">${esc(issue.title)}</span></span>
      <span class="gh-row-meta">${issue.labels.map((label) => `<span class="gh-label">${esc(label)}</span>`).join("")}<span>${esc(relativeTime(Date.parse(issue.updatedAt)))}</span></span>`, "gh-row")).join("") || `<p class="vc-empty">Nenhuma issue aberta.</p>`;
  const runs = data.runs.map((run) => link(run.url, `<span class="gh-row-top"><i data-tone="${run.conclusion === "success" ? "ok" : run.conclusion ? "bad" : "work"}"></i><span class="gh-title">${esc(run.title || run.name)}</span></span>
      <span class="gh-row-meta"><span>${esc(run.name)}</span><span>${esc(run.branch)}</span><span>${esc(run.conclusion || run.status)}</span><span>${esc(relativeTime(Date.parse(run.createdAt)))}</span></span>`, "gh-row")).join("") || `<p class="vc-empty">Nenhuma execução recente.</p>`;
  view.innerHTML = `<header class="gh-head">${link(data.url, `${svg("i-code")}<span>${esc(data.repo)}</span>`, "gh-repo")}<button type="button" class="icon-btn small" data-gh-refresh title="Atualizar">${svg("i-retry")}</button></header>
    <section class="insp-sec"><h3 class="sec-title">PRs abertos <b>${data.prs.length}</b></h3>${prs}</section>
    <section class="insp-sec"><h3 class="sec-title">Checks recentes</h3>${runs}</section>
    <section class="insp-sec"><h3 class="sec-title">Issues abertas <b>${data.issues.length}</b></h3>${issues}</section>`;
}

// Shell mode of the Terminal tab: commands typed here run in the open project's folder (server: /api/devtools/shell),
// one at a time, output polled by offset; ↑/↓ walk the history. PI mode is the read-only terminal of the conversation.
const shell = { mode: localStorage.getItem("pi-studio:term-mode") === "shell" ? "shell" : "pi", run: null, offset: 0, timer: null, history: [], cursor: -1 };
try { shell.history = JSON.parse(localStorage.getItem("pi-studio:shell-history") || "[]").slice(-50); } catch { shell.history = []; }
const shellEls = { view: $("#shellView"), out: $("#shellOut"), form: $("#shellForm"), input: $("#shellInput"), stop: $("#shellStop"), cwd: $("#shellCwd"), term: $("#term"), modes: [...document.querySelectorAll("[data-term-mode]")] };
function applyTermMode() {
  const isShell = shell.mode === "shell";
  shellEls.view.hidden = !isShell;
  shellEls.term.hidden = isShell;
  for (const button of shellEls.modes) button.setAttribute("aria-checked", String(button.dataset.termMode === shell.mode));
  shellEls.cwd.textContent = state.currentProject?.name ?? "";
  shellEls.cwd.title = state.currentProject?.cwd ?? "";
  if (isShell) requestAnimationFrame(() => shellEls.input.focus());
}
for (const button of shellEls.modes) button.addEventListener("click", () => {
  shell.mode = button.dataset.termMode;
  try { localStorage.setItem("pi-studio:term-mode", shell.mode); } catch { /* storage off */ }
  applyTermMode();
});
function shellWrite(text, cls = "") {
  const span = document.createElement("span");
  if (cls) span.className = cls;
  span.textContent = text;
  shellEls.out.append(span);
  while (shellEls.out.childNodes.length > 4000) shellEls.out.firstChild.remove();
  shellEls.out.scrollTop = shellEls.out.scrollHeight;
}
async function shellPoll() {
  if (!shell.run) return;
  try {
    const result = await api(`/api/devtools/shell?id=${encodeURIComponent(shell.run)}&offset=${shell.offset}`);
    if (result.chunk) shellWrite(result.chunk);
    shell.offset = result.offset;
    if (!result.running) {
      shellWrite(result.error ? `\n[erro: ${result.error}]\n` : `\n[terminou com código ${result.exitCode}]\n`, result.exitCode === 0 ? "shell-ok" : "shell-bad");
      shell.run = null;
      shellEls.stop.hidden = true;
      shellEls.input.disabled = false;
      shellEls.input.focus();
      return;
    }
  } catch (error) { report(error); }
  shell.timer = setTimeout(shellPoll, 400);
}
shellEls.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const command = shellEls.input.value.trim();
  if (!command || shell.run || !state.currentProject) return;
  shell.history = [...shell.history.filter((item) => item !== command), command].slice(-50);
  shell.cursor = -1;
  try { localStorage.setItem("pi-studio:shell-history", JSON.stringify(shell.history)); } catch { /* storage off */ }
  shellWrite(`\n$ ${command}\n`, "shell-cmd");
  shellEls.input.value = "";
  try {
    const started = await api("/api/devtools/shell", { method: "POST", body: JSON.stringify({ project: state.currentProject.id, command }) });
    shell.run = started.id;
    shell.offset = 0;
    shellEls.stop.hidden = false;
    shellEls.input.disabled = true;
    shellPoll();
  } catch (error) { shellWrite(`[${error.message}]\n`, "shell-bad"); }
});
shellEls.input.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
  if (!shell.history.length) return;
  event.preventDefault();
  shell.cursor = event.key === "ArrowUp" ? (shell.cursor < 0 ? shell.history.length - 1 : Math.max(0, shell.cursor - 1)) : (shell.cursor < 0 ? -1 : shell.cursor + 1);
  if (shell.cursor >= shell.history.length) shell.cursor = -1;
  shellEls.input.value = shell.cursor < 0 ? "" : shell.history[shell.cursor];
});
shellEls.stop.addEventListener("click", () => {
  if (!shell.run || !state.currentProject) return;
  api("/api/devtools/shell", { method: "POST", body: JSON.stringify({ project: state.currentProject.id, stop: shell.run }) }).catch(report);
});
applyTermMode();

els.ghView.addEventListener("click", (event) => {
  if (!event.target.closest("[data-gh-refresh]")) return;
  devtools.github = null;
  scheduleInspector("github");
});

function renderWorktrees() {
  const data = orca.data;
  // Without Orca (off, closed or not installed) the tab shows the project's git worktrees.
  if (!data || !data.available || !data.worktrees.length) {
    const sig = JSON.stringify(["git", devtools.worktrees, state.currentProject?.id]);
    if (sig === orca.renderSig) return;
    orca.renderSig = sig;
    els.wtList.replaceChildren(...renderGitWorktrees());
    return;
  }
  const sig = JSON.stringify([data, state.currentProject?.cwd, allResources.sig]);
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
  const git = event.target.closest("[data-git-wt]");
  if (git) {
    openWorktree({ path: git.dataset.gitWt, name: basename(git.dataset.gitWt), projectId: projectIdForPath(git.dataset.gitWt) }).catch(report);
    return;
  }
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
    watchTick().catch(() => {});
  }
  syncOrcaPolling();
  syncHistoryPolling();
  syncLivePolling();
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
      ${stateHtml(worktreeIndicator(worktree))}
      <span class="sa-title"><strong>${esc(detail.name)}</strong><span class="sa-type">${esc(detail.sub)}</span></span>
      <span class="sa-state">
        ${detail.unread ? '<span class="wt-unread" role="img" aria-label="não lido" title="Não lido"></span>' : ""}
        ${current ? '<span class="wt-flag">Aberta</span>' : ""}
        ${detail.active ? '<span class="wt-flag" title="Em foco no Orca">Orca</span>' : ""}
        ${detail.studio ? `<span class="wt-flag wtv-chip">${stateHtml(legacyState(detail.studio.key))}${esc(detail.studio.label)}</span>` : ""}
        ${detail.stalled ? `<span class="wt-flag wtv-chip"><i class="stall-dot" aria-hidden="true"></i>${esc(detail.stalled)}</span>` : ""}
        <span class="sa-phase">${esc(detail.statusLabel)}</span>
      </span>
    </div>
    ${meta.length ? `<p class="sa-meta">${meta.map((item) => `<span>${esc(item)}</span>`).join("")}</p>` : ""}
    ${detail.comment ? `<p class="wtv-comment">${esc(detail.comment)}</p>` : ""}
    ${detail.agents.length ? `<ul class="wtv-agents">${detail.agents.map((agent, index) => `
      <li class="wtv-agent" data-agent="${index}">
        <span class="wtv-agent-head">${stateHtml(legacyState(agent.key))}<span class="wtv-agent-title">${esc(agent.title)}</span><span class="sa-phase">${esc(agent.label)}</span></span>
        ${agent.message ? `<span class="wtv-msg">${esc(agent.message)}</span>` : ""}
      </li>`).join("")}</ul>` : ""}
    ${worktree.id && orca.data?.available ? `<div class="wtv-actions" data-wtv-actions>
      <label class="wtv-board"><span>Quadro do Orca</span><select data-wtv-status aria-label="Coluna de ${esc(detail.name)} no quadro do Orca">${orcaBoardOptions(detail.workspaceStatus).map((option) => `<option value="${esc(option.id)}"${option.selected ? " selected" : ""}${option.disabled ? " disabled" : ""}>${esc(option.label)}</option>`).join("")}</select></label>
      <button type="button" class="wtv-act" data-wtv-pi title="Abre um terminal novo com o PI nesta worktree, dentro do Orca">Abrir PI no Orca</button>
    </div>` : ""}`;
  return node;
}

// Writes to Orca from the overview; the next poll shows the result (the server clears its Orca cache). The result is
// also written in the dialog footer: a toast sits under the modal dialog, which is in the top layer.
async function orcaWrite(route, body, done) {
  const say = (text, kind) => {
    els.worktreesNotice.textContent = text;
    els.worktreesNotice.dataset.kind = kind;
    toast(text, kind === "error" ? "error" : undefined);
  };
  try {
    await api(route, { method: "POST", body: JSON.stringify(body) });
    say(done, "ok");
    pollOrca();
  } catch (error) {
    say(orcaWriteFeedback(error), "error");
    renderWorktreesOverlay();
  }
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
      ${stateHtml(legacyState(row.dot))}
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
  els.worktreesNotice.textContent = "";
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

function chooseWorktree(index, agentIndex) {
  const worktree = wtv.entries[index];
  if (!worktree) return;
  closeWorktrees();
  if (wtv.mode === "activity") {
    if (state.currentProject?.id !== worktree.projectId) openProject(worktree.projectId).then(() => toast(`Projeto: ${worktree.project}`)).catch(report);
    return;
  }
  openWorktree(worktree, { agent: Number.isInteger(agentIndex) ? worktree.agents[agentIndex] : null })
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
// The list keeps focus in the filter box, except on the Orca controls of a row (a select needs its own mousedown).
els.worktreesList.addEventListener("mousedown", (event) => { if (!event.target.closest("[data-wtv-actions]")) event.preventDefault(); });
els.worktreesList.addEventListener("change", (event) => {
  const select = event.target.closest("[data-wtv-status]");
  const worktree = select && wtv.entries[Number(select.closest(".wtv-item")?.dataset.index)];
  if (!worktree?.id || !select.value) return;
  const label = select.selectedOptions[0]?.textContent ?? select.value;
  orcaWrite("/api/orca/worktree-set", { worktreeId: worktree.id, workspaceStatus: select.value }, `${worktree.name}: ${label} no Orca`);
});
els.worktreesList.addEventListener("click", (event) => {
  if (event.target.closest("[data-wtv-actions]")) {
    const button = event.target.closest("[data-wtv-pi]");
    const worktree = button && wtv.entries[Number(button.closest(".wtv-item")?.dataset.index)];
    if (worktree?.id) orcaWrite("/api/orca/pi-terminal", { worktreeId: worktree.id }, `PI aberto no Orca: ${worktree.name}`);
    return;
  }
  const option = event.target.closest(".wtv-item");
  const agentRow = event.target.closest(".wtv-agent");
  if (option) chooseWorktree(Number(option.dataset.index), agentRow ? Number(agentRow.dataset.agent) : undefined);
});
els.worktreesDialog.addEventListener("click", (event) => {
  if (event.target === els.worktreesDialog) closeWorktrees();
});
els.worktreesBtn.addEventListener("click", () => openWorktrees());


// ------------------------------------------------------ command palette

const PALETTE_ICONS = { session: "i-code", hit: "i-search" };
const palette = { query: "", entries: [], index: 0, hits: [], loading: false, indexing: false, seq: 0, timer: null, pick: null };
const PALETTE_PLACEHOLDER = els.paletteInput.placeholder;

function paletteActions() {
  const rightTab = (tab) => () => {
    setPanel("right", true);
    selectTab(tab);
  };
  return [
    { label: "Nova conversa", icon: "i-plus", keywords: "novo chat", run: () => newSession() },
    { label: "Alternar Inspector", icon: "i-panel", keywords: "painel inspetor", run: () => setPanel("right", layout.right !== "open") },
    { label: "Abrir aba Terminal", icon: "i-terminal", run: rightTab("terminal") },
    { label: "Abrir aba Agentes", icon: "i-agents", run: rightTab("subagents") },
    { label: "Abrir aba Contexto", icon: "i-gauge", run: rightTab("context") },
    { label: "Abrir aba Arquivos", icon: "i-files", run: rightTab("files") },
    { label: "Abrir aba Navegador", icon: "i-globe", keywords: "arquivo página artefato", run: rightTab("browser") },
    { label: "Abrir no navegador…", icon: "i-globe", keywords: "arquivo caminho url localhost página artefato", run: promptBrowserTarget },
    ...(orcaOn() ? [{ label: "Abrir aba Worktrees", icon: "i-branch", keywords: "orca", run: rightTab("worktrees") }] : []),
    ...(!els.worktreesBtn.hidden ? [{ label: "Ver worktrees", icon: "i-branch", keywords: "orca visão geral alt+w", run: () => openWorktrees() }] : []),
    { label: "Ver atividade", icon: "i-agents", keywords: "feed eventos erros terminou subagentes", run: () => openWorktrees("activity") },
    { label: "Exportar conversa", icon: "i-file", keywords: "html salvar", run: () => exportSession() },
    { label: "Compactar conversa", icon: "i-gauge", keywords: "contexto resumir", run: () => compactNow() },
    { label: "Atalhos de teclado", icon: "i-code", keywords: "ajuda teclas", run: () => toggleShortcuts(true) },
    { label: "Configurações", icon: "i-gear", keywords: "preferências fonte largura", run: openSettings },
    ...fastPaletteActions(),
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
  if (palette.pick) return [{ title: palette.pick.title, items: palette.pick.items, limit: 500 }];
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
  Object.assign(palette, { query: "", index: 0, hits: [], loading: false, pick: null });
  els.paletteInput.value = "";
  els.paletteDialog.showModal();
  renderPalette();
  els.paletteInput.focus();
}

// The palette as a plain picker over `items` ({ label, sub, icon, run }): no actions, no conversation search.
function openPalettePick(title, items) {
  openPalette();
  palette.pick = { title, items };
  els.paletteInput.placeholder = `${title} (digite para filtrar)`;
  renderPalette();
}

function closePalette() {
  if (els.paletteDialog.open) els.paletteDialog.close();
}

els.paletteDialog.addEventListener("close", () => {
  els.paletteInput.placeholder = PALETTE_PLACEHOLDER;
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
  palette.loading = !palette.pick && query.length >= SEARCH_MIN_CHARS;
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

// ---------------------------------------------------------------- navegador
// Inspector tab that opens project files, artifacts and local pages beside the chat. A file is resolved and checked by
// GET .../file?info=1 and then loaded from the capability URL it returns, so a sandboxed frame never needs the Studio
// token (it has an opaque origin: no cookies, no storage, no access to this page). A local dev server loads in a frame
// of its own origin (`allow-same-origin` is only granted to origins other than Studio's, which classifyTarget refuses).

const browserEls = {
  bar: $("#browserBar"),
  input: $("#browserInput"),
  back: $("#browserBack"),
  forward: $("#browserForward"),
  reload: $("#browserReload"),
  outside: $("#browserOutside"),
  stage: $("#browserStage"),
};
const BROWSER_KEY_PREFIX = "pi-studio:browser:";
const BROWSER_TEXT_CAP = 1024 * 1024;
const BROWSER_EXTERNAL_TIMEOUT_MS = 12000;
const BROWSER_REASONS = {
  studio: "Este endereço é o próprio PI Studio e não abre aqui.",
  scheme: "Abrimos arquivos do projeto, http://localhost e páginas https.",
  credentials: "Endereços com usuário e senha não são abertos.",
  "remote-file": "Arquivos de outros computadores não são abertos.",
};
const BROWSER_ERRORS = {
  "Outside the project": "O arquivo está fora da pasta do projeto.",
  "File not found": "Arquivo não encontrado.",
  "Not a file": "O caminho não é um arquivo.",
  "Invalid path": "Caminho inválido.",
  "Project folder not found": "A pasta do projeto não existe mais.",
};
// History of the open project (back/forward), the signature of what the stage shows, and the "abrir fora" URL.
const browser = { projectId: null, history: emptyBrowserHistory(), shown: "", seq: 0, nonce: 0, outsideUrl: null, timer: null };

const studioPort = () => location.port || (location.protocol === "https:" ? "443" : "80");
const classify = (text) => classifyTarget(text, { studioPort: studioPort() });

function saveBrowserHistory() {
  if (!browser.projectId) return;
  try {
    localStorage.setItem(BROWSER_KEY_PREFIX + browser.projectId, JSON.stringify(browser.history));
  } catch {
    // Storage full or blocked: the history just stays in memory.
  }
}

function syncBrowserProject() {
  const id = state.currentProject?.id ?? null;
  if (id === browser.projectId) return;
  browser.projectId = id;
  browser.history = id ? parseBrowserHistory(localStorage.getItem(BROWSER_KEY_PREFIX + id)) : emptyBrowserHistory();
  browser.shown = "";
}

// Every entry point (Arquivos, message links, @ picker, Ctrl+K, the address bar) ends here.
function openInBrowser(input) {
  const target = classify(input);
  if (target.type === "invalid") return toast(BROWSER_REASONS[target.reason] || "Endereço inválido.", "error");
  if (!state.currentProject) return toast("Abra um projeto primeiro.", "error");
  syncBrowserProject();
  browser.history = browserHistoryPush(browser.history, targetText(target));
  saveBrowserHistory();
  browserEls.input.value = targetText(target);
  setPanel("right", true);
  selectTab("browser");
  scheduleInspector("browser");
}

function moveBrowser(step) {
  browser.history = browserHistoryMove(browser.history, step);
  saveBrowserHistory();
  scheduleInspector("browser");
}

function setBrowserOutside(url) {
  browser.outsideUrl = url;
  browserEls.outside.disabled = !url;
}

function openBrowserOutside() {
  if (browser.outsideUrl) window.open(browser.outsideUrl, "_blank", "noopener,noreferrer");
}

// Ctrl/Cmd+click on a file link: the same capability URL, in the system browser.
async function openTargetOutside(target) {
  if (target.type !== "file") return void window.open(target.url, "_blank", "noopener,noreferrer");
  const info = await browserFileInfo(target.path);
  window.open(new URL(info.raw, location.origin).href, "_blank", "noopener,noreferrer");
}

const browserFileInfo = (filePath) =>
  api(`/api/projects/${encodeURIComponent(state.currentProject.id)}/file?path=${encodeURIComponent(filePath)}&info=1`);

function browserCard(icon, title, text, actions = []) {
  const card = el("div", "insp-empty browser-card");
  card.innerHTML = `${svg(icon)}<strong>${esc(title)}</strong><span>${esc(text)}</span>`;
  for (const action of actions) {
    const button = el("button", "btn", action.label);
    button.type = "button";
    button.addEventListener("click", action.run);
    card.append(button);
  }
  return card;
}

const OUTSIDE_ACTION = { label: "Abrir fora", run: openBrowserOutside };

function browserFrame(src, title, sandbox) {
  const frame = el("iframe", "browser-frame");
  // The sandbox is set before the first navigation; a null sandbox is only for the PDF viewer (see browserFileView).
  if (sandbox !== null) frame.setAttribute("sandbox", sandbox);
  frame.title = title;
  frame.referrerPolicy = "no-referrer";
  frame.src = src;
  return frame;
}

async function browserText(info) {
  const res = await fetch(info.raw, { headers: { range: `bytes=0-${BROWSER_TEXT_CAP - 1}` } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const note = info.size > BROWSER_TEXT_CAP ? `Mostrando os primeiros ${formatBytes(BROWSER_TEXT_CAP)} de ${formatBytes(info.size)}.` : "";
  return { text: await res.text(), note };
}

async function browserFileView(info) {
  const media = (tag, props) => {
    const holder = el("div", "browser-media");
    holder.append(Object.assign(document.createElement(tag), props));
    return holder;
  };
  switch (info.kind) {
    case "image":
      return media("img", { src: info.raw, alt: info.name });
    case "audio":
    case "video":
      return media(info.kind, { src: info.raw, controls: true });
    case "pdf":
      return browserFrame(info.raw, info.name, null);
    case "html":
      // Scripts run, but in an opaque origin: no Studio token, storage or cookies; relative assets load through the capability path.
      return browserFrame(info.raw, info.name, "allow-scripts allow-forms");
    case "markdown": {
      const { text, note } = await browserText(info);
      const doc = el("article", "browser-doc md");
      doc.dataset.base = info.path;
      doc.innerHTML = renderMarkdown(text) + (note ? `<p class="muted">${esc(note)}</p>` : "");
      return doc;
    }
    case "text": {
      const { text, note } = await browserText(info);
      const holder = el("div", "browser-code");
      const code = el("code", "", text);
      const pre = el("pre", "");
      pre.append(code);
      holder.append(pre);
      if (note) holder.append(el("p", "browser-note", note));
      return holder;
    }
    default:
      return browserCard("i-file", info.name, `${formatBytes(info.size)} · este tipo de arquivo não tem visualização aqui.`, [OUTSIDE_ACTION]);
  }
}

async function showBrowserFile(target, seq) {
  const { stage } = browserEls;
  stage.replaceChildren(el("div", "browser-loading", "Abrindo…"));
  try {
    const info = await browserFileInfo(target.path);
    if (seq !== browser.seq) return;
    setBrowserOutside(new URL(info.raw, location.origin).href);
    const view = await browserFileView(info);
    if (seq === browser.seq) stage.replaceChildren(view);
  } catch (error) {
    if (seq === browser.seq) stage.replaceChildren(browserCard("i-alert", "Não foi possível abrir", BROWSER_ERRORS[error.message] || error.message));
  }
}

function showBrowserPage(target, seq) {
  const { stage } = browserEls;
  const local = target.type === "local";
  // allow-same-origin is safe here only because classifyTarget never lets Studio's own origin through.
  const frame = browserFrame(target.url, target.label, `allow-scripts allow-forms ${local ? "" : "allow-popups "}allow-same-origin`);
  setBrowserOutside(target.url);
  stage.replaceChildren(frame);
  if (local) return;
  // Most sites refuse to be framed and the browser gives no signal for it: say so, and fall back to a card if nothing loads.
  const note = el("div", "browser-note");
  const open = el("button", "mini-btn", "Abrir fora");
  open.type = "button";
  open.addEventListener("click", openBrowserOutside);
  note.append(el("span", "", "Alguns sites não permitem abrir aqui."), open);
  stage.append(note);
  frame.addEventListener("load", () => clearTimeout(browser.timer), { once: true });
  browser.timer = setTimeout(() => {
    if (seq === browser.seq) stage.replaceChildren(browserCard("i-globe", "Este site não permite abrir aqui", "A página não carregou dentro do Studio (muitos sites bloqueiam isso).", [OUTSIDE_ACTION]));
  }, BROWSER_EXTERNAL_TIMEOUT_MS);
}

function showBrowserTarget(current) {
  clearTimeout(browser.timer);
  const seq = ++browser.seq;
  setBrowserOutside(null);
  const { stage } = browserEls;
  if (!current) {
    stage.replaceChildren(browserCard("i-globe", "Navegador", "Abra aqui arquivos, artefatos e páginas locais do projeto. Clique em um arquivo em Arquivos ou digite um caminho ou endereço acima."));
    return;
  }
  const target = classify(current);
  if (target.type === "invalid") stage.replaceChildren(browserCard("i-alert", "Endereço inválido", BROWSER_REASONS[target.reason] || "Endereço inválido."));
  else if (target.type === "file") showBrowserFile(target, seq);
  else showBrowserPage(target, seq);
}

function renderBrowser() {
  syncBrowserProject();
  const { history } = browser;
  const current = browserHistoryCurrent(history);
  browserEls.back.disabled = history.index <= 0;
  browserEls.forward.disabled = history.index < 0 || history.index >= history.items.length - 1;
  browserEls.reload.disabled = !current;
  if (document.activeElement !== browserEls.input) browserEls.input.value = current;
  const signature = `${browser.projectId}|${current}|${browser.nonce}`;
  if (signature === browser.shown) return;
  browser.shown = signature;
  showBrowserTarget(current);
}

browserEls.bar.addEventListener("submit", (event) => {
  event.preventDefault();
  const value = browserEls.input.value.trim();
  if (!value) return;
  openInBrowser(value);
  browserEls.input.blur();
});
browserEls.input.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  browserEls.input.value = browserHistoryCurrent(browser.history);
  browserEls.input.blur();
});
browserEls.back.addEventListener("click", () => moveBrowser(-1));
browserEls.forward.addEventListener("click", () => moveBrowser(1));
browserEls.reload.addEventListener("click", () => {
  browser.nonce++;
  scheduleInspector("browser");
});
browserEls.outside.addEventListener("click", openBrowserOutside);

// Links in messages (and in a Markdown file shown here): a click opens the target in the Navegador, Ctrl/Cmd+click outside.
// `baseFile` resolves relative links of a Markdown file against its folder.
function onLinkClick(event, baseFile = "") {
  const anchor = event.target.closest?.("a");
  if (!anchor) return;
  const href = anchor.getAttribute("href") ?? "";
  const text = anchor.dataset.open !== undefined ? (baseFile ? resolveSibling(baseFile, anchor.dataset.open) : anchor.dataset.open) : href;
  if (anchor.dataset.open === undefined && !/^https?:/i.test(href)) return;
  const target = classify(text);
  const action = linkAction(target, event);
  if (action === "ignore") return;
  event.preventDefault();
  if (action === "inline") openInBrowser(text);
  else openTargetOutside(target).catch(report);
}

els.thread.addEventListener("click", (event) => onLinkClick(event));
browserEls.stage.addEventListener("click", (event) => onLinkClick(event, event.target.closest?.("[data-base]")?.dataset.base ?? ""));
els.outputsList.addEventListener("click", (event) => {
  const item = event.target.closest("[data-open]");
  if (item) openInBrowser(item.dataset.open);
});

// Ctrl+K "Abrir no navegador…": shows the tab and puts the cursor in the address bar.
function promptBrowserTarget() {
  setPanel("right", true);
  selectTab("browser");
  requestAnimationFrame(() => {
    browserEls.input.focus();
    browserEls.input.select();
  });
}

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
  } else if (action === "doubts") {
    event.preventDefault();
    if (!modalOpen) openDoubts();
  } else if (action === "vorcaro") {
    event.preventDefault();
    if (!modalOpen) toggleVorcaro();
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
voice.init().catch(() => {});
updateComposer();
renderAttachments();
applyPanelWidth();
applyOrcaSettings();
if (settings.orcaEnabled !== false) pollOrca();
selectTab(inspector.tab);
bootstrap().catch(report);
