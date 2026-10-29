// Where Vorcaro's requests are also seen: Orca (worktree board, on the phone) and a GitHub Project (kanban, on the phone).
// Both are mirrors: the Studio's demand file stays the source of truth, a mirror that fails never blocks a demand, and
// the person moving a card there is read back and shown, never taken as "done" (done needs Vorcaro's own verification).
//
// Config (pi-studio-data/vorcaro-config.json), all optional:
//   { "orca": { "auto": true }, "claudeCode": true, "github": { "owner": "<login or org>", "project": <number>, "conta": "<gh account>" } }
// No "github" block = no GitHub mirror. "conta" pins the gh account (gh auth token --user <conta>), so a different
// active account in gh never receives the writes.
import { readFile } from "node:fs/promises";

export async function readMirrorConfig(file) {
  let value = {};
  // A file saved by Notepad or PowerShell 5.1 starts with a BOM, which JSON.parse refuses.
  try { value = JSON.parse((await readFile(file, "utf8")).replace(/^\uFEFF/, "")) ?? {}; } catch { value = {}; }
  const github = value.github && typeof value.github === "object" ? value.github : null;
  const owner = typeof github?.owner === "string" && /^[A-Za-z0-9-]{1,39}$/.test(github.owner) ? github.owner : null;
  const project = Number.isInteger(github?.project) && github.project > 0 ? github.project : null;
  const conta = typeof github?.conta === "string" && /^[A-Za-z0-9-]{1,39}$/.test(github.conta) ? github.conta : null;
  // "claudeCode": false leaves Claude Code's sessions out of the Studio (sidebar, board, Vorcaro).
  return { orcaAuto: value.orca?.auto !== false, claudeCode: value.claudeCode !== false, github: owner && project ? { owner, project, conta } : null };
}

// ---- Orca: the demand's phase as a column of Orca's board (defaults: todo, in-progress, in-review, completed).
const ORCA_STATUS = { enviado: "in-progress", trabalhando: "in-progress", aguardando: "in-progress", bloqueado: "in-progress", verificando: "in-review", feito: "completed", cancelado: "completed" };
export const orcaStatusFor = (phase) => ORCA_STATUS[phase] ?? "in-progress";

// `run(args)` executes the orca CLI and resolves its parsed JSON (server.mjs passes runOrcaJson with the resolved binary).
// `launch()` starts the app itself when given: `orca open` waits for a desktop window, which never shows up when the caller
// is a hidden process (the Studio server is one), while the app started detached comes up on its own (~1 min cold).
export function createOrcaMirror({ run, launch = null, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), startTimeoutMs = 90_000 } = {}) {
  async function status() {
    try {
      const value = await run(["status", "--json"]);
      const result = value?.result ?? value;
      return { app: Boolean(result?.app?.running), reachable: Boolean(result?.runtime?.reachable) };
    } catch { return { app: false, reachable: false, missing: true }; }
  }
  return {
    status,
    // Orca invoked by itself when Vorcaro needs it: the app is launched and its runtime awaited.
    async ensure() {
      const now = await status();
      if (now.reachable || now.missing) return now.reachable;
      if (!now.app) {
        try { if (launch) launch(); else await run(["open", "--json"]); } catch { /* checked below */ }
      }
      for (let waited = 0; waited < startTimeoutMs; waited += 1500) {
        if ((await status()).reachable) return true;
        await wait(1500);
      }
      return false;
    },
    // A child worktree of the project's own, with a PI agent that starts on the brief. Returns { worktreeId, path, handle }.
    async createTask({ repoId, parentWorktreeId, name, prompt, comment }) {
      const value = await run(["worktree", "create", `--name=${name}`, `--repo=id:${repoId}`, "--agent", "pi", `--prompt=${prompt}`,
        `--parent-worktree=worktree:${parentWorktreeId}`, `--comment=${comment}`, "--json"]);
      const outer = value?.result ?? value;
      const worktree = outer?.worktree ?? outer;
      const path = worktree?.path ?? worktree?.worktreePath;
      if (typeof path !== "string" || !path) throw new Error("Orca não devolveu a worktree criada");
      return { worktreeId: worktree?.id ?? worktree?.worktreeId ?? null, path, handle: outer?.agentTerminalHandle ?? outer?.startupTerminal?.handle ?? null };
    },
    async setStatus(worktreePath, phase) {
      await run(["worktree", "set", `--worktree=path:${worktreePath}`, `--workspace-status=${orcaStatusFor(phase)}`, "--json"]);
    },
  };
}

// ---- GitHub Projects: one draft item per demand, its Status column following the phase.
const GITHUB_COLUMN = { enviado: "todo", trabalhando: "doing", aguardando: "doing", bloqueado: "doing", verificando: "doing", feito: "done", cancelado: "done" };
const COLUMN_NAMES = { todo: ["todo", "a fazer", "backlog"], doing: ["in progress", "fazendo", "em andamento", "doing"], done: ["done", "feito", "concluído", "concluido"] };

// The option of the Status field for a phase, by name (projects created from GitHub's template say Todo / In Progress / Done).
export function statusOptionFor(fields, phase) {
  const field = (fields ?? []).find((item) => String(item?.name).toLowerCase() === "status" && Array.isArray(item.options));
  if (!field) return null;
  const names = COLUMN_NAMES[GITHUB_COLUMN[phase] ?? "doing"];
  const option = field.options.find((item) => names.includes(String(item?.name).toLowerCase()));
  return option ? { fieldId: field.id, optionId: option.id, name: option.name } : null;
}

export function itemBody(demand) {
  const lines = [`Projeto: ${demand.project} (${demand.cwd})`, "", "Aceite:"];
  for (const item of demand.checklist ?? []) lines.push(`- [ ] ${item}`);
  if (demand.verify?.length) lines.push("", `Verificação do Vorcaro: ${demand.verify.join(", ")}`);
  lines.push("", `Pedido ${demand.id}, enviado pelo Vorcaro no PI Studio.`);
  return lines.join("\n");
}

// `run(args, env)` executes gh and resolves its stdout; `token(conta)` resolves that account's token (gh auth token --user).
export function createGithubMirror(config, { run, token }) {
  let meta = null;
  async function env() {
    return config.conta ? { GH_TOKEN: (await token(config.conta)).trim() } : {};
  }
  async function gh(args) {
    return run(args, await env());
  }
  async function projectMeta() {
    if (meta) return meta;
    const project = JSON.parse(await gh(["project", "view", String(config.project), "--owner", config.owner, "--format", "json"]));
    const fields = JSON.parse(await gh(["project", "field-list", String(config.project), "--owner", config.owner, "--format", "json"]))?.fields ?? [];
    meta = { projectId: project.id, fields, url: project.url ?? null };
    return meta;
  }
  return {
    async create(demand) {
      const item = JSON.parse(await gh(["project", "item-create", String(config.project), "--owner", config.owner, "--title", demand.objetivo.slice(0, 250), "--body", itemBody(demand), "--format", "json"]));
      if (!item?.id) throw new Error("GitHub não devolveu o item criado");
      return { itemId: item.id };
    },
    async setPhase(itemId, phase) {
      const { projectId, fields } = await projectMeta();
      const option = statusOptionFor(fields, phase);
      if (!option) return null;
      await gh(["project", "item-edit", "--id", itemId, "--project-id", projectId, "--field-id", option.fieldId, "--single-select-option-id", option.optionId, "--format", "json"]);
      return option.name;
    },
    // The Status each item has now on GitHub (moved by hand on the phone, for instance): Map itemId -> column name.
    async statuses() {
      const value = JSON.parse(await gh(["project", "item-list", String(config.project), "--owner", config.owner, "--limit", "200", "--format", "json"]));
      return new Map((value?.items ?? []).map((item) => [item.id, item.status ?? null]));
    },
  };
}
