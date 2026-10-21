import { createHash } from "node:crypto";

const cleanPath = (value) => String(value ?? "").replace(/\\/g, "/").replace(/\/$/, "").toLowerCase();
const within = (child, parent) => cleanPath(child) === cleanPath(parent) || cleanPath(child).startsWith(`${cleanPath(parent)}/`);
const timestamp = (value) => { const parsed = typeof value === "number" ? value : Date.parse(value); return Number.isFinite(parsed) ? parsed : null; };
const CHILD_PAGE_SIZE = 20;
const TREE_MAX_DEPTH = 8;

export async function mapConcurrent(values, limit, map) {
  const results = new Array(values.length);
  let next = 0;
  const worker = async () => {
    while (next < values.length) {
      const index = next++;
      results[index] = await map(values[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return results;
}

const projectEnv = (project, worktree, repoId) => (repoId && worktree.repoId === repoId) || within(worktree.path, project.cwd);

export function createTreeService({ getProjects, getOrca, getSessions, getLive, now = Date.now, onPoll = () => {} }) {
  let current = null;
  let lastActivity = 0;
  let pending = null;
  let cachedAt = 0;
  let childrenByParent = new Map();
  let itemsByPath = new Map();
  let closed = false;

  function publicItem(item, depth = 0, budget = { left: 3000 }) {
    if (budget.left <= 0) return null;
    budget.left--;
    const children = [];
    if (depth < TREE_MAX_DEPTH) {
      for (const child of item.children.slice(0, CHILD_PAGE_SIZE)) {
        const publicChild = publicItem(child, depth + 1, budget);
        if (!publicChild) break;
        children.push(publicChild);
      }
    }
    const { _parent, _env, ...publicFields } = item;
    return {
      ...publicFields, children,
      childrenTotal: item.childrenTotal,
      childrenMore: Math.max(0, item.childrenTotal - children.length),
      childrenOffset: children.length,
      descendantWorking: item.descendantWorking,
    };
  }

  async function refresh() {
    const [projects, orca, sessions, live] = await Promise.all([getProjects(), getOrca(), getSessions(), getLive()]);
    const worktrees = orca?.available ? (orca.worktrees ?? []) : [];
    const liveByPath = new Map((live ?? []).filter((item) => item?.sessionPath).map((item) => [cleanPath(item.sessionPath), item]));
    const treeProjects = [];
    const allItemsByPath = new Map();
    const allChildrenByParent = new Map();
    const payloadBudget = { left: 3000 };
    for (const project of projects ?? []) {
      const projectRepoId = worktrees.find((item) => cleanPath(item.path) === cleanPath(project.cwd))?.repoId;
      const worktreeList = worktrees.filter((item) => projectEnv(project, item, projectRepoId));
      const envs = worktreeList.map((item) => ({ key: item.worktreeId || item.path, name: item.displayName || item.branch || "Worktree", branch: item.branch ?? "", primary: item.isMainWorktree === true, path: item.path, orca: true, orcaStatus: item.workspaceStatus ?? item.status ?? null, issue: item.linkedIssue?.title ?? item.issue ?? null, pis: [], morePis: 0, _agents: item.agents ?? [] }));
      if (!worktreeList.some((item) => cleanPath(item.path) === cleanPath(project.cwd))) envs.push({ key: "local", name: "Local", branch: "", primary: false, path: project.cwd, orca: false, orcaStatus: null, issue: null, pis: [], morePis: 0, _agents: [] });
      const envFor = (cwd) => envs.find((env) => cleanPath(env.path) === cleanPath(cwd));
      const rootItems = [];
      const children = new Map();
      const byPath = new Map();
      for (const session of sessions ?? []) {
        const header = session.header ?? {};
        const env = envFor(header.cwd);
        if (!env || !session.path) continue;
        const liveItem = liveByPath.get(cleanPath(session.path)) ?? null;
        const titleInfo = session.title && typeof session.title === "object" ? session.title : null;
        const state = session.state ?? "parado";
        const item = {
          sessionPath: session.path, sessionId: String(header.id ?? ""), title: titleInfo?.title ?? (typeof session.title === "string" ? session.title : null) ?? session.name ?? "Nova conversa",
          agentType: titleInfo?.agentType ?? session.agentType ?? null, isSubagent: Boolean(header.parentSession),
          live: liveItem ? { pid: liveItem.pid ?? null, owner: liveItem.owner, startedAt: liveItem.startedAt ?? null } : null,
          raw: { busy: liveItem ? Boolean(liveItem.streaming || state === "fazendo") : state === "fazendo", streaming: Boolean(liveItem?.streaming), waitingUi: Boolean(liveItem?.waitingUi), error: state === "erro", stalledMs: liveItem?.streaming && session.stat?.mtimeMs ? Math.max(0, now() - session.stat.mtimeMs) : null, orcaState: null },
          pendingQuestions: { total: 0, blocking: 0 }, lastAssistantAt: timestamp(session.lastAssistantAt),
          updatedAt: Number(session.stat?.mtimeMs) || timestamp(header.timestamp) || 0, startedAt: timestamp(header.timestamp) || Number(session.stat?.birthtimeMs) || 0,
          children: [], childrenTotal: 0, _parent: header.parentSession ? cleanPath(header.parentSession) : null,
          parentSession: header.parentSession || null, _env: env,
        };
        byPath.set(cleanPath(item.sessionPath), item);
        allItemsByPath.set(cleanPath(item.sessionPath), item);
        const agent = env._agents.find((entry) => String(entry.agentType).toLowerCase() === "pi" && cleanPath(entry.path ?? entry.cwd ?? env.path) === cleanPath(env.path));
        if (agent) { item.raw.orcaState = agent.state ?? null; if (agent.state === "working") item.raw.busy = true; }
        if (item._parent) { const list = children.get(item._parent) ?? []; list.push(item); children.set(item._parent, list); } else rootItems.push(item);
      }
      const latest = (a, b) => b.updatedAt - a.updatedAt;
      const subtreeWorking = (item, depth = 0, seen = new Set()) => {
        const key = cleanPath(item.sessionPath);
        if (depth >= 3000 || seen.size >= 3000 || seen.has(key)) return false;
        seen.add(key);
        return (children.get(key) ?? []).some((child) => {
          const blocked = child.raw.waitingUi || ["blocked", "waiting", "error"].includes(child.raw.orcaState) || (child.raw.error && !child.raw.busy && !child.raw.streaming);
          return (!blocked && (child.raw.busy || child.raw.streaming || child.raw.orcaState === "working")) || subtreeWorking(child, depth + 1, seen);
        });
      };
      for (const item of byPath.values()) item.descendantWorking = subtreeWorking(item);
      for (const [parentPath, list] of children) {
        const ordered = list.sort(latest);
        children.set(parentPath, ordered);
        allChildrenByParent.set(parentPath, ordered);
        const parent = byPath.get(parentPath);
        if (parent) {
          parent.childrenTotal = ordered.length;
          parent.children = ordered.slice(0, CHILD_PAGE_SIZE);
        }
      }
      for (const env of envs) {
        const candidates = rootItems.filter((item) => item._env === env).sort((a, b) => Number(Boolean(b.live)) - Number(Boolean(a.live)) || latest(a, b));
        env.pis = candidates.slice(0, 15).map((item) => publicItem(item, 1, payloadBudget)).filter(Boolean);
        env.morePis = Math.max(0, candidates.length - env.pis.length);
        delete env._agents;
      }
      envs.sort((a, b) => Number(b.primary) - Number(a.primary) || Number(b.pis.some((pi) => pi.live || pi.raw.busy)) - Number(a.pis.some((pi) => pi.live || pi.raw.busy)) || Math.max(0, ...b.pis.map((pi) => pi.updatedAt)) - Math.max(0, ...a.pis.map((pi) => pi.updatedAt)));
      treeProjects.push({ id: project.id, name: project.name ?? "", cwd: project.cwd, envs });
    }
    itemsByPath = allItemsByPath;
    childrenByParent = allChildrenByParent;
    const version = `"${createHash("sha256").update(JSON.stringify(treeProjects)).digest("hex").slice(0, 24)}"`;
    if (!current || current.version !== version) current = { version, generatedAt: now(), projects: treeProjects };
    cachedAt = now();
    return current;
  }

  async function ensureFresh() {
    if (closed) throw new Error("tree service is closed");
    pending ??= (async () => {
      if (current && now() - cachedAt < 1000) return current;
      return refresh();
    })().finally(() => { pending = null; });
    return pending;
  }

  return {
    async get(ifNoneMatch = null) {
      if (closed) throw new Error("tree service is closed");
      onPoll(now());
      lastActivity = now();
      const tree = await ensureFresh();
      return ifNoneMatch === tree.version ? { notModified: true, version: tree.version } : { ...tree, notModified: false };
    },
    async getChildren(parentPath, offset = 0) {
      await ensureFresh();
      if (typeof parentPath !== "string" || !parentPath || !Number.isSafeInteger(offset) || offset < 0) return null;
      const list = childrenByParent.get(cleanPath(parentPath));
      const parentItem = itemsByPath.get(cleanPath(parentPath));
      if (!list && !parentItem) return null;
      if (!list) return { children: [], total: 0, offset, nextOffset: null, descendantWorking: parentItem.descendantWorking };
      if (offset >= list.length) return { children: [], total: list.length, offset, nextOffset: null, descendantWorking: parentItem?.descendantWorking ?? false };
      const pageItems = list.slice(offset, offset + CHILD_PAGE_SIZE);
      const budget = { left: 3000 };
      const result = [];
      for (const item of pageItems) {
        const publicChild = publicItem(item, TREE_MAX_DEPTH, budget);
        if (!publicChild) break;
        result.push(publicChild);
      }
      const nextOffset = offset + result.length;
      return { children: result, total: list.length, offset, nextOffset: nextOffset < list.length ? nextOffset : null, descendantWorking: parentItem?.descendantWorking ?? false };
    },
    async getSessionChain(sessionPath) {
      await ensureFresh();
      if (typeof sessionPath !== "string" || !sessionPath) return null;
      let item = itemsByPath.get(cleanPath(sessionPath));
      if (!item) return null;
      const chain = [];
      const visited = new Set();
      while (item && !visited.has(cleanPath(item.sessionPath)) && chain.length < 3000) {
        visited.add(cleanPath(item.sessionPath));
        const { _parent, _env, ...publicFields } = item;
        chain.unshift({
          ...publicFields, children: [],
          childrenTotal: item.childrenTotal, childrenMore: item.childrenTotal, childrenOffset: 0,
        });
        item = _parent ? itemsByPath.get(_parent) : null;
      }
      return item ? null : { chain };
    },
    lastPollAt: () => lastActivity,
    close() { closed = true; current = null; childrenByParent = new Map(); itemsByPath = new Map(); },
  };
}
