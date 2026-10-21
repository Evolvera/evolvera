// Orca-style sidebar tree: projects -> environments (worktrees) -> PIs -> sub-PIs.
// DOM is updated in place by key (no rebuilds), so scroll, focus, hover and the CSS spinner survive every poll.
import { isExpanded, plural, samePath, treeEnvRow, treePiRow, treePollDelay, treeProjectRow } from "./lib.js";
import { applyState } from "./state-indicator.js";

// ------------------------------------------------------------ keyed reconciliation

const keyed = new WeakMap();

// Makes `parent`'s children match `models` (each with a unique `key`): reuses elements by key, creates only the new
// ones, moves only what is out of place, removes what is gone. `create(model)` builds, `update(el, model)` refreshes.
export function reconcileChildren(parent, models, { create, update }) {
  const previous = keyed.get(parent) ?? new Map();
  const next = new Map();
  let index = 0;
  for (const model of models) {
    if (next.has(model.key)) continue;
    const el = previous.get(model.key) ?? create(model);
    next.set(model.key, el);
    update(el, model);
    if (parent.children[index] !== el) parent.insertBefore(el, parent.children[index] ?? null);
    index++;
  }
  for (const [key, el] of previous) if (!next.has(key)) el.remove();
  keyed.set(parent, next);
}

// ------------------------------------------------------------ polling

// Polls /api/tree: conditional requests (304 = nothing to do), one request at a time, backoff on failure.
// `fetchTree({ etag, signal })` resolves { status: 304 } or { status: 200, data }.
export function createTreePoller({ fetchTree, onTree, onError, isHidden = () => false, setTimer = setTimeout, clearTimer = clearTimeout }) {
  const stats = { polls: 0, notModified: 0, errors: 0 };
  let running = false;
  let inflight = false;
  let timer = null;
  let controller = null;
  let version = null;
  let failures = 0;

  const schedule = () => {
    clearTimer(timer);
    timer = running ? setTimer(tick, treePollDelay({ hidden: isHidden(), failures })) : null;
  };

  async function tick() {
    if (!running || inflight) return;
    inflight = true;
    clearTimer(timer);
    controller = new AbortController();
    const mine = controller;
    stats.polls++;
    try {
      const response = await fetchTree({ etag: version, signal: mine.signal });
      if (!running || mine.signal.aborted) return;
      failures = 0;
      if (response.status === 304) {
        stats.notModified++;
      } else {
        const changed = response.data.version !== version;
        version = response.data.version;
        onTree(response.data, { changed });
      }
    } catch (error) {
      if (!running || mine.signal.aborted || error?.name === "AbortError") return;
      failures++;
      stats.errors++;
      onError(error, failures);
    } finally {
      if (controller === mine) inflight = false;
      if (running && !mine.signal.aborted) schedule();
    }
  }

  return {
    stats,
    start() {
      if (running) return;
      running = true;
      tick();
    },
    // Polls now (page became visible, user action) unless a request is already running.
    poke() {
      if (running && !inflight) tick();
    },
    stop() {
      running = false;
      clearTimer(timer);
      timer = null;
      controller?.abort();
      inflight = false;
    },
  };
}

// ------------------------------------------------------------ rendering

const BASE = { project: true, env: true, list: true, sub: false };

// `icon(name, className)` -> markup of an svg from the page sprite. `doc` is injectable for tests.
export function createSidebarTree({ root, doc = document, icon = () => "" }) {
  const stats = { renders: 0, writes: 0 };
  let ctx = null;

  const make = (tag, className, extra = {}) => {
    const el = doc.createElement(tag);
    el.className = className;
    if (tag === "button") el.setAttribute("type", "button");
    for (const [name, value] of Object.entries(extra)) {
      if (name.startsWith("data-")) el.dataset[name.slice(5)] = value;
      else el.setAttribute(name, value);
    }
    return el;
  };
  const text = (el, value) => { if (el.textContent !== value) { el.textContent = value; stats.writes++; } };
  const cls = (el, value) => { if (el.className !== value) { el.className = value; stats.writes++; } };
  const attr = (el, name, value) => {
    if (value === null || value === undefined) {
      if (el.getAttribute(name) !== null) { el.removeAttribute(name); stats.writes++; }
    } else if (el.getAttribute(name) !== String(value)) { el.setAttribute(name, value); stats.writes++; }
  };
  const data = (el, name, value) => { if (el.dataset[name] !== value) { el.dataset[name] = value; stats.writes++; } };
  const hide = (el, hidden) => { if (el.hidden !== hidden) { el.hidden = hidden; stats.writes++; } };
  const dot = (el, state) => { if (applyState(el, state)) stats.writes++; };
  const open = (key) => ctx.forceOpen || isExpanded(ctx.expanded, key, BASE[key[0] === "p" ? "project" : key[0] === "e" ? "env" : key[0] === "l" ? "list" : "sub"]);

  // ---- PI row (and its sub-PIs)
  function createPi() {
    const node = make("div", "tpi");
    const row = make("div", "session-row");
    const item = make("button", "session-item", { "data-action": "open-session" });
    item.append(make("span", "state"), make("span", "session-title"), make("span", "tp-chip"), make("span", "session-time"));
    const menu = make("button", "session-menu-btn", { "data-action": "session-menu", "aria-haspopup": "menu" });
    menu.innerHTML = icon("i-more");
    row.append(item, menu);
    const sub = make("button", "tpi-sub", { "data-action": "tree-toggle" });
    node.append(row, sub, make("div", "tpi-children"));
    return node;
  }

  function updatePi(node, model) {
    const { pi, projectId, envPath } = model;
    const view = treePiRow(pi, ctx.store, ctx.now);
    data(node, "key", model.key);
    const [row, sub, children] = node.children;
    const [item, menu] = row.children;
    const [stateEl, title, chip, time] = item.children;
    cls(item, `session-item${samePath(pi.sessionPath, ctx.currentPath) ? " active" : ""}`);
    attr(item, "aria-current", samePath(pi.sessionPath, ctx.currentPath) ? "true" : null);
    data(item, "project", projectId);
    data(item, "path", pi.sessionPath);
    data(item, "env", envPath);
    attr(item, "title", view.tooltip);
    attr(item, "aria-label", `${pi.title} · ${view.tooltip}`);
    dot(stateEl, view.state);
    text(title, view.title);
    text(chip, view.chip);
    hide(chip, !view.chip);
    text(time, view.time);
    data(menu, "project", projectId);
    data(menu, "path", pi.sessionPath);
    data(menu, "env", envPath);
    data(menu, "title", pi.title);
    attr(menu, "aria-label", `Ações da conversa ${pi.title}`);
    const key = `s:${pi.sessionPath}`;
    const expanded = view.childCount + view.childMore > 0 && open(key);
    hide(sub, view.childCount + view.childMore === 0);
    text(sub, plural(view.childCount + view.childMore, "sub-PI", "sub-PIs"));
    data(sub, "toggle", key);
    data(sub, "default", "0");
    attr(sub, "aria-expanded", String(expanded));
    hide(children, !expanded);
    if (expanded) {
      const models = pi.children.map((child) => ({ key: `pi:${child.sessionPath}`, kind: "pi", pi: child, projectId, envPath }));
      if (pi.childrenMore > 0) models.push({ key: `more:${pi.sessionPath}`, kind: "child-more", path: pi.sessionPath, count: pi.childrenMore });
      else if (pi.childrenLimited) models.push({ key: `limit:${pi.sessionPath}`, kind: "child-limit" });
      reconcileChildren(children, models, hooks);
    }
  }

  function createMore(model) {
    return make("button", "session-more", { "data-action": model.kind === "child-more" ? "tree-child-more" : "tree-more" });
  }

  function updateMore(node, model) {
    data(node, "key", model.key);
    text(node, model.kind === "child-limit" ? "Limite de 3.000 sessões atingido" : model.kind === "child-more" ? `Mostrar mais subagentes (${model.count})` : `Mostrar mais (${model.count})`);
    if (model.kind === "child-limit") { attr(node, "disabled", ""); return; }
    if (model.kind === "child-more") {
      data(node, "path", model.path);
      return;
    }
    data(node, "project", model.projectId);
    data(node, "path", model.envPath);
    data(node, "extra", model.extraKey);
  }

  const hooks = {
    create: (model) => (model.kind === "more" || model.kind === "child-more" || model.kind === "child-limit" ? createMore(model) : createPi()),
    update: (node, model) => (model.kind === "more" || model.kind === "child-more" || model.kind === "child-limit" ? updateMore(node, model) : updatePi(node, model)),
  };

  // ---- environment
  function createEnv() {
    const node = make("div", "tenv");
    const row = make("div", "te-row");
    const head = make("button", "te-head", { "data-action": "tree-env" });
    head.append(make("span", "te-name"), make("span", "te-chip"), make("span", "te-branch"), make("span", "te-issue"), make("span", "state"));
    row.append(make("button", "te-toggle", { "data-action": "tree-toggle" }), head, make("button", "tl-head", { "data-action": "tree-toggle" }));
    const body = make("div", "te-body");
    body.append(make("div", "tl-list"));
    node.append(row, body);
    return node;
  }

  function updateEnv(node, model) {
    const { env, project } = model;
    const extras = ctx.extras.get(`${project.id}/${env.key}`) ?? [];
    const view = treeEnvRow(env, ctx.store, ctx.now);
    const projectId = ctx.projectIdFor(env.path, project.id);
    const envKey = `e:${project.id}/${env.key}`;
    data(node, "key", model.key);
    const [row, body] = node.children;
    const [toggle, head, listHead] = row.children;
    const [name, chip, branch, issue, stateEl] = head.children;
    const envOpen = open(envKey);
    data(toggle, "toggle", envKey);
    data(toggle, "default", "1");
    attr(toggle, "aria-expanded", String(envOpen));
    attr(toggle, "aria-label", `${envOpen ? "Recolher" : "Expandir"} ${view.name}`);
    data(head, "path", env.path);
    data(head, "project", projectId);
    data(head, "name", view.name);
    attr(head, "title", env.path);
    text(name, view.name);
    text(chip, view.primary ? "primary" : "");
    hide(chip, !view.primary);
    text(branch, view.branch);
    hide(branch, !view.branch);
    text(issue, view.issue);
    hide(issue, !view.issue);
    dot(stateEl, view.state);
    hide(body, !envOpen);
    const listKey = `l:${project.id}/${env.key}`;
    const total = env.pis.length + extras.length;
    const listOpen = open(listKey);
    hide(listHead, total === 0);
    text(listHead, total ? plural(total, "agente", "agentes") : "sem agentes");
    data(listHead, "toggle", listKey);
    data(listHead, "default", "1");
    attr(listHead, "aria-expanded", String(listOpen));
    if (!envOpen) return;
    const [list] = body.children;
    hide(list, !listOpen && total > 0);
    const models = [...env.pis, ...extras].map((pi) => ({ key: `pi:${pi.sessionPath}`, kind: "pi", pi, projectId, envPath: env.path }));
    if (view.more > 0 && !ctx.extras.has(`${project.id}/${env.key}`)) models.push({ key: "more", kind: "more", count: view.more, projectId, envPath: env.path, extraKey: `${project.id}/${env.key}` });
    reconcileChildren(list, models, hooks);
  }

  // ---- project
  function createProject() {
    const node = make("div", "tproj");
    const head = make("button", "tp-head", { "data-action": "tree-toggle" });
    head.append(make("span", "tp-name"), make("span", "state"));
    const row = make("div", "tp-row");
    row.append(head);
    node.append(row, make("div", "tp-body"));
    return node;
  }

  function updateProject(node, model) {
    const { project } = model;
    const view = treeProjectRow(project, ctx.store, ctx.now);
    const key = `p:${project.id}`;
    const expanded = open(key);
    data(node, "key", model.key);
    const [row, body] = node.children;
    const head = row.children[0];
    const [name, stateEl] = head.children;
    data(head, "toggle", key);
    data(head, "default", "1");
    attr(head, "aria-expanded", String(expanded));
    attr(head, "title", project.cwd);
    text(name, view.name);
    dot(stateEl, view.state);
    hide(body, !expanded);
    if (!expanded) return;
    reconcileChildren(body, project.envs.map((env) => ({ key: `e:${project.id}/${env.key}`, kind: "env", env, project })), {
      create: createEnv,
      update: updateEnv,
    });
  }

  function createNote() {
    return make("div", "sessions-empty pad");
  }

  // `data`: normalized tree. `expanded`: Map of overrides. `extras`: Map("projectId/envKey" -> older PIs). `filtered`: a search is active.
  function render(input) {
    // The old project list shares this container: its rows are dropped once, before the first keyed render.
    if (!keyed.has(root)) while (root.children.length) root.children[0].remove();
    ctx = { forceOpen: input.filtered === true && input.data.projects.length > 0, extras: new Map(), ...input };
    stats.renders++;
    const models = input.data.projects.map((project) => ({ key: `p:${project.id}`, kind: "project", project }));
    if (!models.length) models.push({ key: "note", kind: "note" });
    reconcileChildren(root, models, {
      create: (model) => (model.kind === "note" ? createNote() : createProject()),
      update: (node, model) => {
        if (model.kind === "note") text(node, input.filtered ? "Nada encontrado." : "Nenhum projeto encontrado.");
        else updateProject(node, model);
      },
    });
  }

  return { render, stats };
}
