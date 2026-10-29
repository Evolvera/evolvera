// Glue between /api/tree, the persisted browser state (seen, expanded) and the sidebar tree DOM.
// Everything the page owns is injected (storage, fetch, clock, view), so it runs the same under test.
import {
  expandedLoad, expandedSerialize, extraHistoryPis, filterTree, normalizeTree, normalizeTreeChildren, seenAt, seenLoad, seenMark, seenSerialize, toggleExpanded, treePiRow,
} from "./lib.js";
import { createSidebarTree, createTreePoller } from "./sidebar-tree.js";

export const SEEN_KEY = "pi-studio:seen";
export const OPEN_KEY = "pi-studio:tree-open";

// `getView()` -> { currentPath, filter, projectsKey, projectIdFor(envPath, treeProjectId) }.
// `onChange(reason)`: "tree" after a new tree was drawn, "unavailable" when there is no tree to show (old list takes over).
// `beforeRender()`: runs after new data arrives and before it is drawn (mark the open conversation seen without a blue flash).
export function createTreeController({
  root, doc, icon, storage, fetchTree, fetchChildren = async () => null, fetchAncestors = async () => null, isHidden, getView, onChange = () => {}, beforeRender = () => {},
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
  const depthByPath = new Map();
  const childRequests = new Map();
  const descendantRequests = new Map();
  const rootRequests = new Map();
  const externalItems = new Map();
  const externalRoots = new Map();
  let data = null;
  let available = null;
  let rev = 0;
  let lastKey = null;
  let expanded = expandedLoad(read(OPEN_KEY));
  let store = seenLoad(read(SEEN_KEY), now());
  if (read(SEEN_KEY) === null) write(SEEN_KEY, seenSerialize(store));

  function reindex() {
    index.clear();
    depthByPath.clear();
    const stack = [
      ...(data?.projects ?? []).flatMap((project) => project.envs.flatMap((env) => env.pis.map((item) => [item, 1]))),
      ...[...extras.values()].flatMap((items) => items.map((item) => [item, 1])),
    ];
    while (stack.length) {
      const [item, depth] = stack.pop();
      index.set(item.sessionPath, item);
      depthByPath.set(item.sessionPath, depth);
      stack.push(...item.children.map((child) => [child, depth + 1]));
    }
    for (const rootItem of externalRoots.values()) {
      if (!index.has(rootItem.sessionPath)) stack.push([rootItem, 1]);
    }
    while (stack.length) {
      const [item, depth] = stack.pop();
      if (index.has(item.sessionPath)) continue;
      index.set(item.sessionPath, item);
      depthByPath.set(item.sessionPath, depth);
      stack.push(...item.children.map((child) => [child, depth + 1]));
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
    rootFor(path) {
      let item = index.get(path) ?? externalItems.get(String(path).toLowerCase()) ?? null;
      const visited = new Set();
      while (item?.parentSession && !visited.has(item.sessionPath)) {
        visited.add(item.sessionPath);
        const parent = index.get(item.parentSession) ?? externalItems.get(String(item.parentSession).toLowerCase()) ?? [...index.values()].find((candidate) => candidate.sessionPath.toLowerCase() === item.parentSession.toLowerCase());
        if (!parent) break;
        item = parent;
      }
      return item;
    },
    descendants(path) {
      const root = index.get(path) ?? externalItems.get(String(path).toLowerCase());
      if (!root) return [];
      const found = [];
      const visited = new Set([root.sessionPath]);
      const stack = [...root.children].reverse();
      while (stack.length) {
        const item = stack.pop();
        if (visited.has(item.sessionPath)) continue;
        visited.add(item.sessionPath);
        found.push(item);
        stack.push(...item.children.slice().reverse());
      }
      return found;
    },
    async loadChildren(path) {
      const item = index.get(path) ?? externalItems.get(String(path).toLowerCase());
      const depth = depthByPath.get(path) ?? 1;
      if (!item || item.childrenMore <= 0) return false;
      if (index.size >= 3000) {
        item.childrenMore = 0;
        item.childrenLimited = true;
        rev++;
        render();
        return false;
      }
      if (childRequests.has(path)) return childRequests.get(path);
      const pending = (async () => {
        const offset = item.childrenOffset ?? item.children.length;
        const page = await fetchChildren(path, offset);
        if (!page || !Array.isArray(page.children)) return false;
        const children = normalizeTreeChildren(page.children, { maxDepth: 8, maxNodes: Math.max(0, 3000 - index.size) });
        const known = new Set(item.children.map((child) => child.sessionPath));
        item.children.push(...children.filter((child) => !known.has(child.sessionPath)));
        item.childrenTotal = Number.isFinite(page.total) ? page.total : item.children.length;
        item.childrenOffset = page.nextOffset ?? item.childrenTotal;
        const truncatedAtCap = children.length < page.children.length && index.size + children.length >= 3000;
        item.childrenLimited = truncatedAtCap;
        item.childrenMore = truncatedAtCap ? 0 : Math.max(0, item.childrenTotal - item.children.length);
        reindex();
        rev++;
        render();
        onChange("tree-page");
        return page.children.length > 0;
      })().finally(() => childRequests.delete(path));
      childRequests.set(path, pending);
      return pending;
    },
    resolveRoot(path) {
      const found = this.rootFor(path);
      if (found) return Promise.resolve(found);
      if (rootRequests.has(path)) return rootRequests.get(path);
      const pending = (async () => {
        const result = await fetchAncestors(path);
        if (!Array.isArray(result?.chain) || !result.chain.length) return null;
        const chain = normalizeTreeChildren(result.chain, { maxDepth: 1 });
        for (const item of chain) externalItems.set(item.sessionPath.toLowerCase(), item);
        for (let index = 0; index < chain.length - 1; index++) {
          const parent = chain[index];
          const child = chain[index + 1];
          if (!parent.children.some((candidate) => candidate.sessionPath === child.sessionPath)) parent.children.push(child);
          parent.childrenTotal = Math.max(parent.childrenTotal, 1);
          parent.childrenOffset = 0;
          parent.childrenMore = Math.max(0, parent.childrenTotal - parent.children.length);
        }
        const rootItem = chain[0];
        externalRoots.set(rootItem.sessionPath.toLowerCase(), rootItem);
        reindex();
        rev++;
        render();
        return rootItem;
      })().finally(() => rootRequests.delete(path));
      rootRequests.set(path, pending);
      return pending;
    },
    async loadDescendants(path) {
      if (descendantRequests.has(path)) return descendantRequests.get(path);
      const pending = (async () => {
        const rootItem = await this.resolveRoot(path);
        if (!rootItem) return [];
        const queue = [[rootItem, 1]];
        const visited = new Set();
        while (queue.length && visited.size < 3000) {
          const [item, depth] = queue.shift();
          if (visited.has(item.sessionPath)) continue;
          visited.add(item.sessionPath);
          while (item.childrenMore > 0) {
            if (!await this.loadChildren(item.sessionPath)) break;
          }
          for (const child of item.children) queue.push([child, depth + 1]);
        }
        return this.descendants(rootItem.sessionPath);
      })().finally(() => descendantRequests.delete(path));
      descendantRequests.set(path, pending);
      return pending;
    },
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
    async expandEnv(extraKey, history) {
      const env = data?.projects.flatMap((project) => project.envs.map((item) => [`${project.id}/${item.key}`, item])).find(([key]) => key === extraKey)?.[1];
      if (!env) return false;
      const shown = new Set();
      const stack = [...env.pis];
      while (stack.length) {
        const item = stack.pop();
        shown.add(item.sessionPath);
        stack.push(...item.children);
      }
      const extraPis = extraHistoryPis(history, shown);
      extras.set(extraKey, extraPis);
      reindex();
      rev++;
      render();
      await Promise.all(extraPis.map(async (pi) => {
        const result = await fetchAncestors(pi.sessionPath).catch(() => null);
        const item = normalizeTreeChildren(result?.chain, { maxDepth: 2, maxNodes: 8 })[0];
        if (item?.sessionPath === pi.sessionPath) Object.assign(pi, item, { children: [], childrenOffset: 0, childrenMore: item.childrenTotal });
      }));
      reindex();
      rev++;
      render();
      return true;
    },
  };
}
