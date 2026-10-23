import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Delegated research guard. The main agent tends to repeat the research it delegated: it reads
 * the same files and pages while a scout or general-purpose agent is still working, and again
 * after the report arrives, to re-check it.
 *   - While a research subagent launched by this session runs, read-style results get a short note.
 *   - After its report arrives, the first read of a URL or file the report cited is blocked with a
 *     reason; asking for the same source again goes through, so a real need is never stuck.
 * The cited set is cleared on each new user request. Edits, writes, git/gh, project commands,
 * and the harness's own skill and agent files are never touched; subagent sessions are exempt.
 */

const PRIMARY_PROMPT = "# PI Coding Agent";
const RESEARCH_TYPES = new Set(["scout", "general-purpose"]);
const READ_TOOLS = new Set(["read", "grep", "find", "ls", "jina_read"]);
// Shell reads count; anything that changes state or talks to git/gh/the package manager does not.
const BASH_READ = /^\s*(?:cat|sed\s+-n|head|tail|rg|grep|find|ls|curl|wget|awk)\b/;
const URL = /https?:\/\/[^\s)`'"\\\]<>]+/g;
// A file path ends in a short extension and is not followed by more path, so a directory such as
// /Users/j.henrique is never treated as a cited file.
const PATH = /(?:[\w.@-]+\/)+[\w@-][\w.@-]*\.[A-Za-z0-9]{1,6}(?![\w/.@-])/g;
const HARNESS_FILE = /\/\.pi\/agent\/(?:skills|agents)\//;

type Running = { id: string; type: string; description: string };

export function isResearchRead(toolName: string, input: Record<string, unknown>): boolean {
  if (typeof input.path === "string" && HARNESS_FILE.test(input.path)) return false;
  if (READ_TOOLS.has(toolName)) return true;
  if (toolName !== "bash") return false;
  const command = typeof input.command === "string" ? input.command : "";
  return command.split(/;|&&|\|\||\n/).some((part) => BASH_READ.test(part));
}

const normalizeUrl = (url: string) => url.replace(/[.,;:]+$/, "").replace(/\/+$/, "").toLowerCase();

/** URLs and repository-style file paths a research report cites. */
export function citedTargets(report: string): { urls: Set<string>; paths: Set<string> } {
  const urls = new Set((report.match(URL) ?? []).map(normalizeUrl));
  const withoutUrls = report.replace(URL, " ");
  const paths = new Set((withoutUrls.match(PATH) ?? []).map((p) => p.replace(/^\.\//, "")));
  return { urls, paths };
}

/** The cited target this read touches, if any. */
export function coveredTarget(toolName: string, input: Record<string, unknown>, urls: Set<string>, paths: Set<string>): string | undefined {
  const text = toolName === "bash" ? String(input.command ?? "")
    : toolName === "jina_read" ? String(input.url ?? "")
      : String(input.path ?? input.pattern ?? "");
  for (const url of text.match(URL) ?? []) if (urls.has(normalizeUrl(url))) return url;
  for (const path of paths) if (text.includes(path)) return path;
  return undefined;
}

export default function delegatedResearchGuard(pi: ExtensionAPI): void {
  const running = new Map<string, Running>();
  const urls = new Set<string>();
  const paths = new Set<string>();
  const allowed = new Set<string>();
  let primary = false;

  pi.on("before_agent_start", async (event) => {
    const custom = event.systemPromptOptions?.customPrompt;
    primary = typeof custom === "string" && custom.trimStart().startsWith(PRIMARY_PROMPT);
  });

  pi.on("input", async (event) => {
    if (event.source === "extension") return;
    urls.clear();
    paths.clear();
    allowed.clear();
  });

  pi.events.on("subagents:started", (data: unknown) => {
    const record = data as Partial<Running> | undefined;
    if (!record?.id || !record.type || !RESEARCH_TYPES.has(record.type)) return;
    running.set(record.id, { id: record.id, type: record.type, description: record.description ?? "" });
  });
  for (const name of ["subagents:completed", "subagents:failed"]) {
    pi.events.on(name, (data: unknown) => {
      const record = data as { id?: string; result?: unknown } | undefined;
      if (!record?.id || !running.has(record.id)) return;
      running.delete(record.id);
      if (name === "subagents:completed" && typeof record.result === "string") {
        const cited = citedTargets(record.result);
        for (const url of cited.urls) urls.add(url);
        for (const path of cited.paths) paths.add(path);
      }
    });
  }

  pi.on("tool_call", async (event) => {
    if (!primary || running.size > 0 || !isResearchRead(event.toolName, event.input)) return;
    const target = coveredTarget(event.toolName, event.input, urls, paths);
    if (!target || allowed.has(target)) return;
    allowed.add(target);
    return { block: true, reason: `${target} was already covered by a research report in this request; use the report. If you still need this source for a specific contradiction or a gap the report named, request it again and it will go through.` };
  });

  pi.on("tool_result", async (event) => {
    if (!primary || event.isError || !isResearchRead(event.toolName, event.input)) return;
    let note: string | undefined;
    if (running.size > 0) {
      const list = [...running.values()].map((r) => `${r.type} "${r.description}"`).join(", ");
      note = `Note: ${list} is still researching for you. If this read covers the same question, wait for its result or work on something it does not cover; reading it yourself pays twice for one answer.`;
    }
    if (!note) return;
    return { content: [...event.content, { type: "text", text: note }] };
  });

  pi.on("session_start", async () => { running.clear(); urls.clear(); paths.clear(); allowed.clear(); });
  pi.on("session_shutdown", async () => { running.clear(); urls.clear(); paths.clear(); allowed.clear(); primary = false; });
}
