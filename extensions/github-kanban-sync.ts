import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type Task = { id?: unknown; subject?: unknown; status?: unknown; description?: unknown; blockedBy?: unknown; metadata?: unknown };
type IssueRef = { owner: string; repo: string; number: number };
const ISSUE_URL = /https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/issues\/(\d+)/i;
const ISSUE_SHORT = /\b([\w.-]+)\/([\w.-]+)#(\d+)\b/;

export function parseIssueReference(task: Task): IssueRef | undefined {
  const metadata = task.metadata && typeof task.metadata === "object" ? task.metadata as Record<string, unknown> : {};
  const explicit = [metadata.issue, metadata.issueUrl];
  for (const value of explicit) {
    if (typeof value !== "string" && typeof value !== "number") continue;
    const text = String(value);
    const url = text.match(ISSUE_URL);
    if (url) return { owner: url[1], repo: url[2], number: Number(url[3]) };
    const short = text.match(ISSUE_SHORT);
    if (short) return { owner: short[1], repo: short[2], number: Number(short[3]) };
    if (/^\d+$/.test(text) && typeof metadata.repo === "string") {
      const repo = metadata.repo.match(/^([\w.-]+)\/([\w.-]+)$/);
      if (repo) return { owner: repo[1], repo: repo[2], number: Number(text) };
    }
  }
  const text = `${typeof task.subject === "string" ? task.subject : ""}\n${typeof task.description === "string" ? task.description : ""}`;
  const url = text.match(ISSUE_URL);
  if (url) return { owner: url[1], repo: url[2], number: Number(url[3]) };
  const short = text.match(ISSUE_SHORT);
  return short ? { owner: short[1], repo: short[2], number: Number(short[3]) } : undefined;
}

export function statusOptionId(options: Array<string | { id: string; name: string }>, status: string): string | undefined {
  const patterns: Record<string, RegExp> = {
    in_progress: /in progress|em andamento|doing|fazendo/i,
    blocked: /blocked|bloquead|paused|pausad/i,
    completed: /in review|review|revis/i,
  };
  const match = options.find((option) => patterns[status]?.test(typeof option === "string" ? option : option.name));
  return typeof match === "string" ? match : match?.id;
}

const QUERY = `query($owner:String!,$repo:String!,$number:Int!){repository(owner:$owner,name:$repo){issue(number:$number){projectItems(first:50){nodes{id project{id fields(first:50){nodes{... on ProjectV2SingleSelectField{id name options{id name}}}}} fieldValues(first:50){nodes{... on ProjectV2ItemFieldSingleSelectValue{optionId field{... on ProjectV2SingleSelectField{name}}}}}}}}}}`;
const MUTATION = `mutation($project:ID!,$item:ID!,$field:ID!,$option:String!){updateProjectV2ItemFieldValue(input:{projectId:$project,itemId:$item,fieldId:$field,value:{singleSelectOptionId:$option}}){projectV2Item{id}}}`;
const execFileAsync = promisify(execFile);
const ghTimeoutMs = () => Number.isSafeInteger(Number(process.env.PI_KANBAN_GH_TIMEOUT_MS)) && Number(process.env.PI_KANBAN_GH_TIMEOUT_MS) > 0
  ? Number(process.env.PI_KANBAN_GH_TIMEOUT_MS) : 20_000;
const debounceMs = () => Number.isSafeInteger(Number(process.env.PI_KANBAN_DEBOUNCE_MS)) && Number(process.env.PI_KANBAN_DEBOUNCE_MS) >= 0
  ? Number(process.env.PI_KANBAN_DEBOUNCE_MS) : 2_000;

export default function githubKanbanSync(pi: ExtensionAPI) {
  const previous = new Map<string, string>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const queues = new Map<string, Promise<void>>();
  const failedIssues = new Set<string>();
  let missingNotified = false;
  let ctx: { hasUI?: boolean; ui?: { notify(message: string, level?: "info" | "warning" | "error"): void } } | undefined;
  const notify = (message: string, level: "info" | "warning" | "error" = "warning") => { if (ctx?.hasUI) ctx.ui.notify(message, level); };
  const callGh = async (query: string, variables: Array<[string, string, boolean?]>): Promise<{ stdout: string; stderr: string }> => {
    const args = ["api", "graphql", "-f", `query=${query}`];
    for (const [name, value, integer] of variables) args.push(integer ? "-F" : "-f", `${name}=${value}`);
    return execFileAsync(process.env.PI_KANBAN_GH_BIN || "gh", args, { encoding: "utf8", timeout: ghTimeoutMs(), windowsHide: true, shell: false });
  };
  const reportFailure = (key: string, error?: string) => {
    if (/ENOENT|not logged into|authentication|project scope|resource not accessible/i.test(error ?? "")) {
      if (!missingNotified) { missingNotified = true; notify("GitHub Kanban indisponível (gh ausente, autenticação ou escopo de projetos).", "warning"); }
      return;
    }
    if (!failedIssues.has(key)) { failedIssues.add(key); notify(`Falha ao sincronizar Kanban para ${key}.`, "warning"); }
  };
  const sync = async (ref: IssueRef, status: string, blocked: boolean) => {
    const key = `${ref.owner}/${ref.repo}#${ref.number}`;
    try {
      const result = await callGh(QUERY, [["owner", ref.owner], ["repo", ref.repo], ["number", String(ref.number), true]]);
      const data = JSON.parse(result.stdout).data?.repository?.issue?.projectItems?.nodes ?? [];
      let changed = false;
      for (const item of data) {
        const fields = item.project?.fields?.nodes ?? [];
        const field = fields.find((f: any) => f.name === "Status");
        if (!field) continue;
        const desired = blocked ? statusOptionId(field.options ?? [], "blocked") : statusOptionId(field.options ?? [], status);
        if (!desired) continue;
        const current = (item.fieldValues?.nodes ?? []).find((v: any) => v.field?.name === "Status")?.optionId;
        if (current === desired) continue;
        await callGh(MUTATION, [["project", item.project.id], ["item", item.id], ["field", field.id], ["option", desired]]);
        changed = true;
      }
      if (changed) notify(`kanban: #${ref.number} → ${blocked ? "Blocked" : status === "completed" ? "In review" : "In progress"}`, "info");
      failedIssues.delete(key);
    } catch (error) {
      const detail = error && typeof error === "object" && "stderr" in error ? String(error.stderr) : error instanceof Error ? error.message : "erro";
      reportFailure(key, detail);
    }
  };
  const enqueue = (ref: IssueRef, status: string, blocked: boolean) => {
    const id = `${ref.owner}/${ref.repo}#${ref.number}`;
    const next = (queues.get(id) ?? Promise.resolve()).then(() => sync(ref, status, blocked));
    queues.set(id, next.catch(() => {}));
  };
  pi.on("session_start", (_event, context) => { ctx = context; previous.clear(); });
  pi.on("tool_result", (event) => {
    if (event.toolName !== "todo" || event.isError || !Array.isArray(event.details?.tasks)) return;
    const tasks = event.details.tasks as Task[];
    const byId = new Map(tasks.filter((task) => Number.isSafeInteger(task.id)).map((task) => [task.id as number, task]));
    for (const task of tasks) {
      if (!Number.isSafeInteger(task.id) || typeof task.status !== "string") continue;
      const id = String(task.id);
      const status = task.status;
      const old = previous.get(id);
      previous.set(id, status);
      if (!parseIssueReference(task)) continue;
      if (!(old === undefined ? status === "in_progress" : old !== status)) continue;
      if (status !== "in_progress" && status !== "completed") continue;
      const blocked = Array.isArray(task.blockedBy) && task.blockedBy.some((blocker) => {
        const blockedTask = byId.get(typeof blocker === "number" ? blocker : Number(blocker));
        return blockedTask && blockedTask.status !== "completed" && blockedTask.status !== "deleted";
      });
      const ref = parseIssueReference(task)!;
      const prior = timers.get(id);
      if (prior) clearTimeout(prior);
      const timer = setTimeout(() => { timers.delete(id); enqueue(ref, status, blocked); }, debounceMs());
      timer.unref?.();
      timers.set(id, timer);
    }
  });
  pi.on("session_shutdown", () => { for (const timer of timers.values()) clearTimeout(timer); timers.clear(); ctx = undefined; });
  return { getPendingTimerCount: () => timers.size };
}
