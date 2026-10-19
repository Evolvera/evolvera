import { createHash } from "node:crypto";

const cleanPath = (value) => String(value ?? "").replace(/\\/g, "/").replace(/\/$/, "").toLowerCase();
const within = (child, parent) => cleanPath(child) === cleanPath(parent) || cleanPath(child).startsWith(`${cleanPath(parent)}/`);
const timestamp = (value) => { const parsed = typeof value === "number" ? value : Date.parse(value); return Number.isFinite(parsed) ? parsed : null; };
const projectEnv = (project, worktree) => worktree.path === project.cwd || within(worktree.path, project.cwd) || within(project.cwd, worktree.path);

export function createTreeService({ getProjects, getOrca, getSessions, getLive, now = Date.now, onPoll = () => {} }) {
  let current = null;
  let lastActivity = 0;
  let pending = null;
  let cachedAt = 0;
  let closed = false;

  async function refresh() {
    const [projects, orca, sessions, live] = await Promise.all([getProjects(), getOrca(), getSessions(), getLive()]);
    const worktrees = orca?.available ? (orca.worktrees ?? []) : [];
    const liveByPath = new Map((live ?? []).filter((item) => item?.sessionPath).map((item) => [cleanPath(item.sessionPath), item]));
    const treeProjects = [];
    for (const project of projects ?? []) {
      const worktreeList = worktrees.filter((item) => projectEnv(project, item));
      const envs = worktreeList.map((item) => ({ key: item.worktreeId || item.path, name: item.displayName || item.branch || "Worktree", branch: item.branch ?? "", primary: item.isMainWorktree === true, path: item.path, orca: true, orcaStatus: item.workspaceStatus ?? item.status ?? null, issue: item.linkedIssue?.title ?? item.issue ?? null, pis: [], morePis: 0, _agents: item.agents ?? [] }));
      if (!worktreeList.some((item) => cleanPath(item.path) === cleanPath(project.cwd))) envs.push({ key: "local", name: "Local", branch: "", primary: false, path: project.cwd, orca: false, orcaStatus: null, issue: null, pis: [], morePis: 0, _agents: [] });
      const envFor = (cwd) => envs.find((env) => cleanPath(env.path) === cleanPath(cwd));
      const rootItems = [];
      const children = new Map();
      for (const session of sessions ?? []) {
        const header = session.header ?? {};
        const env = envFor(header.cwd);
        if (!env || !session.path) continue;
        const liveItem = liveByPath.get(cleanPath(session.path)) ?? null;
        const titleInfo = session.title && typeof session.title === "object" ? session.title : null;
        const state = session.state ?? "parado";
        const item = {
          sessionPath: session.path, sessionId: String(header.id ?? ""), title: titleInfo?.title ?? session.title ?? session.name ?? "Nova conversa",
          agentType: titleInfo?.agentType ?? session.agentType ?? null, isSubagent: Boolean(header.parentSession),
          live: liveItem ? { pid: liveItem.pid ?? null, owner: liveItem.owner, startedAt: liveItem.startedAt ?? null } : null,
          raw: { busy: liveItem ? Boolean(liveItem.streaming || state === "fazendo") : state === "fazendo", streaming: Boolean(liveItem?.streaming), waitingUi: Boolean(liveItem?.waitingUi), error: state === "erro", stalledMs: liveItem?.streaming && session.stat?.mtimeMs ? Math.max(0, now() - session.stat.mtimeMs) : null, orcaState: null },
          pendingQuestions: { total: 0, blocking: 0 }, lastAssistantAt: timestamp(session.lastAssistantAt),
          updatedAt: Number(session.stat?.mtimeMs) || timestamp(header.timestamp) || 0, startedAt: timestamp(header.timestamp) || Number(session.stat?.birthtimeMs) || 0,
          children: [], _parent: header.parentSession ? cleanPath(header.parentSession) : null, _env: env,
        };
        const agent = env._agents.find((entry) => String(entry.agentType).toLowerCase() === "pi" && cleanPath(entry.path ?? entry.cwd ?? env.path) === cleanPath(env.path));
        if (agent) { item.raw.orcaState = agent.state ?? null; if (agent.state === "working") item.raw.busy = true; }
        if (item._parent) { const list = children.get(item._parent) ?? []; list.push(item); children.set(item._parent, list); } else rootItems.push(item);
      }
      const latest = (a, b) => b.updatedAt - a.updatedAt;
      const allItems = [...rootItems, ...[...children.values()].flat()];
      for (const [parentPath, list] of children) {
        const parent = allItems.find((item) => cleanPath(item.sessionPath) === parentPath);
        if (parent) parent.children = list.sort(latest).slice(0, 20);
      }
      for (const env of envs) {
        const candidates = rootItems.filter((item) => item._env === env).sort((a, b) => Number(Boolean(b.live)) - Number(Boolean(a.live)) || latest(a, b));
        env.pis = candidates.slice(0, 15).map(({ _parent, _env, ...item }) => { item.children = item.children.map(({ _parent: ignored, _env: ignoredEnv, ...child }) => child); return item; });
        env.morePis = Math.max(0, candidates.length - env.pis.length);
        delete env._agents;
      }
      envs.sort((a, b) => Number(b.primary) - Number(a.primary) || Number(b.pis.some((pi) => pi.live || pi.raw.busy)) - Number(a.pis.some((pi) => pi.live || pi.raw.busy)) || Math.max(0, ...b.pis.map((pi) => pi.updatedAt)) - Math.max(0, ...a.pis.map((pi) => pi.updatedAt)));
      treeProjects.push({ id: project.id, name: project.name ?? "", cwd: project.cwd, envs });
    }
    const version = `"${createHash("sha256").update(JSON.stringify(treeProjects)).digest("hex").slice(0, 24)}"`;
    if (!current || current.version !== version) current = { version, generatedAt: now(), projects: treeProjects };
    cachedAt = now();
    return current;
  }

  return {
    async get(ifNoneMatch = null) {
      if (closed) throw new Error("tree service is closed");
      onPoll(now());
      lastActivity = now();
      pending ??= (async () => {
        if (current && now() - cachedAt < 1000) return current;
        return refresh();
      })().finally(() => { pending = null; });
      const tree = await pending;
      return ifNoneMatch === tree.version ? { notModified: true, version: tree.version } : { ...tree, notModified: false };
    },
    lastPollAt: () => lastActivity,
    close() { closed = true; current = null; },
  };
}
