// Glue between /api/tree, the persisted browser state (seen, expanded) and the sidebar tree DOM.
// Everything the page owns is injected (storage, fetch, clock, view), so it runs the same under test.
import {
  expandedLoad, expandedSerialize, extraHistoryPis, filterTree, normalizeTree, seenAt, seenLoad, seenMark, seenSerialize, toggleExpanded, treePiRow,
} from "./lib.js";
import { createSidebarTree, createTreePoller } from "./sidebar-tree.js";

export const SEEN_KEY = "pi-studio:seen";
export const OPEN_KEY = "pi-studio:tree-open";

// `getView()` -> { currentPath, filter, projectsKey, projectIdFor(envPath, treeProjectId) }.
// `onChange(reason)`: "tree" after a new tree was drawn, "unavailable" when there is no tree to show (old list takes over).
// `beforeRender()`: runs after new data arrives and before it is drawn (mark the open conversation seen without a blue flash).
export function createTreeController({
  root, doc, icon, storage, fetchTree, isHidden, getView, onChange = () => {}, beforeRender = () => {},
  now = Date.now, setTimer, clearTimer,
}) {
  const read = (key) => {
    try {
      return storage.getItem(key);
    } catch {
      return null;
    }
  };
  const write = (key, value) => {
    try {
      storage.setItem(key, value);
    } catch {
      // Storage full or blocked: the state just lasts for this page.
    }
  };

  const view = createSidebarTree({ root, doc, icon });
  const stats = { renders: 0, pollRenders: 0 };
  const extras = new Map();
  const index = new Map();
  let data = null;
  let available = null;
  let rev = 0;
  let lastKey = null;
  let expanded = expandedLoad(read(OPEN_KEY));
  let store = seenLoad(read(SEEN_KEY), now());
  if (read(SEEN_KEY) === null) write(SEEN_KEY, seenSerialize(store));

  function reindex() {
    index.clear();
    const stack = data.projects.flatMap((project) => project.envs.flatMap((env) => env.pis));
    while (stack.length) {
      const item = stack.pop();
      index.set(item.sessionPath, item);
      stack.push(...item.children);
    }
  }

  function render({ force = false } = {}) {
    if (!data) return false;
    const current = getView();
    const key = [rev, current.filter, current.currentPath, current.projectsKey, Math.floor(now() / 60_000)].join("\u0000");
    if (!force && key === lastKey) return false;
    lastKey = key;
    stats.renders++;
    view.render({
      data: filterTree(data, current.filter ?? ""), store, expanded, now: now(), extras,
      currentPath: current.currentPath, projectIdFor: current.projectIdFor, filtered: Boolean((current.filter ?? "").trim()),
    });
    return true;
  }

  function setUnavailable() {
    if (available === false) return;
    available = false;
    onChange("unavailable");
  }

  const poller = createTreePoller({
    fetchTree, isHidden, setTimer, clearTimer,
    onTree(body, meta) {
      const tree = normalizeTree(body);
      if (!tree) {
        if (!data) setUnavailable();
        return;
      }
      available = true;
      if (!meta.changed && data) return;
      data = tree;
      reindex();
      rev++;
      beforeRender();
      stats.pollRenders++;
      render();
      onChange("tree");
    },
    onError() {
      if (!data) setUnavailable();
    },
  });

  return {
    stats, poller, viewStats: view.stats,
    start: () => poller.start(),
    stop: () => poller.stop(),
    poke: () => poller.poke(),
    render,
    active: () => data !== null,
    findPi: (path) => index.get(path) ?? null,
    stateOf: (path) => {
      const item = index.get(path);
      return item ? treePiRow(item, store, now()).state : null;
    },
    toggle(key, fallback) {
      expanded = toggleExpanded(expanded, key, fallback);
      write(OPEN_KEY, expandedSerialize(expanded));
      rev++;
      render();
    },
    // The user looked at the newest turn of this conversation. False when there is nothing new to mark.
    markSeen(path, { render: draw = true } = {}) {
      const item = index.get(path);
      const target = item?.lastAssistantAt ?? 0;
      if (!item || target <= 0 || seenAt(store, path) >= target) return false;
      store = seenMark(store, path, Math.max(now(), target));
      write(SEEN_KEY, seenSerialize(store));
      rev++;
      if (draw) render();
      return true;
    },
    // "Mostrar mais": fills one environment ("projectId/envKey") with the older entries of its history.
    expandEnv(extraKey, history) {
      const env = data?.projects.flatMap((project) => project.envs.map((item) => [`${project.id}/${item.key}`, item])).find(([key]) => key === extraKey)?.[1];
      if (!env) return false;
      const shown = new Set();
      const stack = [...env.pis];
      while (stack.length) {
        const item = stack.pop();
        shown.add(item.sessionPath);
        stack.push(...item.children);
      }
      extras.set(extraKey, extraHistoryPis(history, shown));
      rev++;
      render();
      return true;
    },
  };
}
