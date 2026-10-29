// Development tools inside the Studio, so the person does not need Orca or the browser for them: the project's git
// worktrees (branch, changes, ahead/behind, last commit) and its GitHub repository (open PRs with their checks, open
// issues, latest workflow runs). Read-only. `run(bin, args, { cwd, env })` executes a command and resolves its stdout;
// server.mjs passes execFile, the tests pass fakes.

// `git worktree list --porcelain` -> [{ path, head, branch, detached, bare, locked }].
export function parseWorktreeList(text) {
  const items = [];
  let current = null;
  for (const line of String(text ?? "").split(/\r?\n/)) {
    if (line.startsWith("worktree ")) {
      current = { path: line.slice(9).trim(), head: null, branch: null, detached: false, bare: false, locked: false };
      items.push(current);
    } else if (!current) continue;
    else if (line.startsWith("HEAD ")) current.head = line.slice(5).trim();
    else if (line.startsWith("branch ")) current.branch = line.slice(7).trim().replace(/^refs\/heads\//, "");
    else if (line === "detached") current.detached = true;
    else if (line === "bare") current.bare = true;
    else if (line.startsWith("locked")) current.locked = true;
  }
  return items;
}

// `git status --porcelain=v1 -b`: changed files, and ahead/behind from the "## branch...upstream [ahead 1, behind 2]" line.
export function parseStatus(text) {
  const lines = String(text ?? "").split(/\r?\n/).filter(Boolean);
  const head = lines[0]?.startsWith("## ") ? lines.shift() : "";
  const ahead = Number(/ahead (\d+)/.exec(head)?.[1] ?? 0);
  const behind = Number(/behind (\d+)/.exec(head)?.[1] ?? 0);
  const upstream = /\.\.\.(\S+)/.exec(head)?.[1] ?? null;
  return { changed: lines.length, untracked: lines.filter((line) => line.startsWith("??")).length, ahead, behind, upstream };
}

// The owner/repo of a GitHub remote URL (https or ssh); null for anything else.
export function githubRepoFromUrl(url) {
  const match = /github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(String(url ?? "").trim());
  return match ? { owner: match[1], repo: match[2] } : null;
}

export async function gitWorktrees(cwd, { run }) {
  const list = parseWorktreeList(await run("git", ["worktree", "list", "--porcelain"], { cwd }));
  const out = [];
  for (const item of list.filter((worktree) => !worktree.bare).slice(0, 30)) {
    let status = { changed: 0, untracked: 0, ahead: 0, behind: 0, upstream: null };
    let last = null;
    try { status = parseStatus(await run("git", ["status", "--porcelain=v1", "-b"], { cwd: item.path })); } catch { status.missing = true; }
    try {
      const [hash, subject, time] = String(await run("git", ["log", "-1", "--format=%h%x1f%s%x1f%ct"], { cwd: item.path })).trim().split("\x1f");
      if (hash) last = { hash, subject: (subject ?? "").slice(0, 140), at: Number(time) * 1000 || null };
    } catch { /* empty repository */ }
    out.push({ ...item, ...status, last });
  }
  return out;
}

// Checks of a PR from gh's statusCheckRollup: how many passed, failed and are still running.
export function checkSummary(rollup) {
  const summary = { passed: 0, failed: 0, pending: 0 };
  for (const check of Array.isArray(rollup) ? rollup : []) {
    const state = String(check?.conclusion || check?.state || check?.status || "").toUpperCase();
    if (["SUCCESS", "NEUTRAL", "SKIPPED"].includes(state)) summary.passed++;
    else if (["FAILURE", "ERROR", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED", "STARTUP_FAILURE"].includes(state)) summary.failed++;
    else summary.pending++;
  }
  return summary;
}

export async function githubSummary({ owner, repo }, { run, env = {} }) {
  const R = `${owner}/${repo}`;
  const json = async (args) => JSON.parse(await run("gh", args, { env }));
  const [prs, issues, runs] = await Promise.all([
    json(["pr", "list", "-R", R, "--state", "open", "--limit", "20", "--json", "number,title,author,headRefName,baseRefName,isDraft,updatedAt,url,reviewDecision,statusCheckRollup"]),
    json(["issue", "list", "-R", R, "--state", "open", "--limit", "20", "--json", "number,title,labels,updatedAt,url,assignees"]),
    json(["run", "list", "-R", R, "--limit", "6", "--json", "name,displayTitle,status,conclusion,headBranch,url,createdAt"]).catch(() => []),
  ]);
  return {
    repo: R,
    url: `https://github.com/${R}`,
    prs: prs.map((pr) => ({ number: pr.number, title: pr.title, author: pr.author?.login ?? null, branch: pr.headRefName, base: pr.baseRefName, draft: Boolean(pr.isDraft), updatedAt: pr.updatedAt, url: pr.url, review: pr.reviewDecision || null, checks: checkSummary(pr.statusCheckRollup) })),
    issues: issues.map((issue) => ({ number: issue.number, title: issue.title, labels: (issue.labels ?? []).map((label) => label.name).slice(0, 4), updatedAt: issue.updatedAt, url: issue.url, assignees: (issue.assignees ?? []).map((person) => person.login).slice(0, 3) })),
    runs: runs.map((item) => ({ name: item.name, title: item.displayTitle, status: item.status, conclusion: item.conclusion || null, branch: item.headBranch, url: item.url, createdAt: item.createdAt })),
  };
}

// Results kept for `ttlMs` per key; a failure is not cached, the next call tries again.
export function createCache(ttlMs, now = Date.now) {
  const entries = new Map();
  return async (key, load) => {
    const hit = entries.get(key);
    if (hit && now() - hit.at < ttlMs) return hit.value;
    const value = await load();
    entries.set(key, { at: now(), value });
    return value;
  };
}
