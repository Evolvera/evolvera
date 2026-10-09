import { execFile } from "node:child_process";
import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type ExecResult = { code: number; stdout: string; stderr: string };
type Runner = (command: string, args: string[], cwd: string) => Promise<ExecResult>;

const TIMEOUT_MS = 10_000;
const MAX_CACHED_REPOS = 100;

const runProcess: Runner = (command, args, cwd) => new Promise((resolve) => {
	execFile(command, args, { cwd, timeout: TIMEOUT_MS, windowsHide: true, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
		resolve({ code: error ? (typeof (error as any).code === "number" ? (error as any).code : 1) : 0, stdout: String(stdout), stderr: String(stderr) });
	});
});

export function isWorktreeAddCommand(command: unknown): boolean {
	if (typeof command !== "string") return false;
	return /(?:^|[\n;&|])\s*git(?:\s+-C\s+(?:"[^\"]+"|'[^']+'|[^\s;&|]+))?\s+worktree\s+add(?:\s|$)/i.test(command);
}

export function gitCommandCwd(command: string, fallbackCwd: string): string {
	const match = /(?:^|[\n;&|])\s*git\s+-C\s+(?:"([^\"]+)"|'([^']+)'|([^\s;&|]+))\s+worktree\s+add(?:\s|$)/i.exec(command);
	return match ? (match[1] ?? match[2] ?? match[3]) : fallbackCwd;
}

export function normalizeRepoPath(value: string, platform: string = process.platform): string {
	let normalized = value.trim().replace(/\\/g, "/").replace(/\/+$/, "");
	if (/^[A-Za-z]:\//.test(normalized)) normalized = `${normalized[0].toLowerCase()}${normalized.slice(1)}`;
	return platform === "win32" ? normalized.toLowerCase() : normalized;
}

export function parseRepoList(text: string): Array<{ id: string; name: string; path: string }> {
	const repos: Array<{ id: string; name: string; path: string }> = [];
	for (const line of text.split(/\r?\n/)) {
		const match = /^(\S+)\s{2}(.+?)\s{2}([A-Za-z]:[\\/].*|\/.*)$/.exec(line);
		if (match) repos.push({ id: match[1], name: match[2], path: match[3] });
	}
	return repos;
}

function successful(result: ExecResult): boolean {
	return result.code === 0;
}

export type OrcaVisibilityDeps = { run?: Runner; platform?: string; cacheLimit?: number };

export function registerOrcaWorktreeVisibility(pi: ExtensionAPI, deps: OrcaVisibilityDeps = {}) {
	const run = deps.run ?? runProcess;
	const platform = deps.platform ?? process.platform;
	const cache = new Set<string>();
	const remember = (key: string) => {
		cache.add(key);
		while (cache.size > (deps.cacheLimit ?? MAX_CACHED_REPOS)) cache.delete(cache.values().next().value!);
	};

	async function ensureVisible(cwd: string) {
		try {
			const common = await run("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], cwd);
			if (!successful(common)) return;
			const commonDir = path.resolve(cwd, common.stdout.trim());
			const mainRepo = path.dirname(commonDir);
			const key = normalizeRepoPath(mainRepo, platform);
			if (cache.has(key)) return;

			const worktrees = await run("git", ["worktree", "list", "--porcelain"], cwd);
			if (!successful(worktrees) || !worktrees.stdout.trim()) return;
			const repoList = await run("orca", ["repo", "list"], cwd);
			if (!successful(repoList)) return;
			let repos = parseRepoList(repoList.stdout);
			let repo = repos.find((item) => normalizeRepoPath(item.path, platform) === key);
			if (!repo) {
				const added = await run("orca", ["repo", "add", "--path", mainRepo, "--json"], cwd);
				if (!successful(added)) return;
				const refreshed = await run("orca", ["repo", "list"], cwd);
				if (!successful(refreshed)) return;
				repos = parseRepoList(refreshed.stdout);
				repo = repos.find((item) => normalizeRepoPath(item.path, platform) === key);
			}
			if (!repo) return;
			const shown = await run("orca", ["repo", "set", "--repo", `id:${repo.id}`, "--external-worktree-visibility", "show", "--json"], cwd);
			if (successful(shown)) remember(key);
		} catch {
			// Orca and git integration is best-effort; it must never disrupt the PI tool flow.
		}
	}

	pi.on("tool_result", async (event: any, ctx: any) => {
		try {
			if (event?.toolName !== "bash" || event?.isError || !isWorktreeAddCommand(event?.input?.command)) return;
			const cwd = gitCommandCwd(event.input.command, ctx?.cwd ?? process.cwd());
			await ensureVisible(cwd);
		} catch { /* best effort only */ }
	});

	pi.on("session_start", async (_event: any, ctx: any) => {
		try {
			const cwd = ctx?.cwd ?? process.cwd();
			const gitDir = await run("git", ["rev-parse", "--path-format=absolute", "--git-dir"], cwd);
			const commonDir = await run("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], cwd);
			if (!successful(gitDir) || !successful(commonDir)) return;
			if (normalizeRepoPath(gitDir.stdout.trim(), platform) !== normalizeRepoPath(commonDir.stdout.trim(), platform)) await ensureVisible(cwd);
		} catch { /* outside git or unavailable; no-op */ }
	});

	return { ensureVisible };
}

export default function (pi: ExtensionAPI) {
	registerOrcaWorktreeVisibility(pi);
}
