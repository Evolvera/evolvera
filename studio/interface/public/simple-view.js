// Simple view: the conversation shows answers and what was done in plain words, not reasoning, raw tools or diffs.
// Delegations to subagents become a short exchange between agents. Pure functions over buildTimeline() items.
import { SUBAGENT_TOOLS, basename, formatElapsed, plural, stripEmoji, subagentFamily, toolKind, toolPath, toolResultText, truncate } from "./lib.js";

const TEST_COMMAND = /\b(?:(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test|npx\s+(?:vitest|jest|playwright\s+test)|vitest|jest|pytest|go\s+test|cargo\s+test|node\s+--test|dotnet\s+test|scripts\/run-tests\.mjs)\b/i;
const done = (tool) => tool?.status === "done" || tool?.status === "error";
const failed = (tool) => Boolean(tool?.isError) || tool?.status === "error";

// "a", "a e b", "a, b e c".
export function joinPt(parts) {
  const list = parts.filter(Boolean);
  if (list.length < 2) return list[0] ?? "";
  return `${list.slice(0, -1).join(", ")} e ${list.at(-1)}`;
}

const capitalize = (text) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text);

export function isTestCommand(command) {
  return TEST_COMMAND.test(String(command ?? ""));
}

// One sentence for a group of finished (or running) tools; `tone` says whether tests passed or failed.
export function humanWork(tools = []) {
  const files = [];
  let reads = 0;
  let commands = 0;
  let other = 0;
  let tests = null;
  for (const tool of tools) {
    const kind = toolKind(tool?.name);
    if (kind === "edit" || kind === "write") {
      const name = basename(toolPath(tool.args)) || "um arquivo";
      if (!files.includes(name)) files.push(name);
    } else if (kind === "read" || kind === "search") reads++;
    else if (kind === "command" && isTestCommand(tool.args?.command)) tests = !done(tool) ? "running" : failed(tool) ? "failed" : "passed";
    else if (kind === "command") commands++;
    else other++;
  }
  const parts = [];
  if (reads) parts.push("leu o código");
  if (files.length) parts.push(files.length <= 2 ? `mexeu em ${joinPt(files)}` : `mexeu em ${files.length} arquivos`);
  if (commands) parts.push(`rodou ${plural(commands, "comando", "comandos")}`);
  if (other) parts.push(`usou ${plural(other, "ferramenta", "ferramentas")}`);
  if (tests === "running") parts.push("está rodando os testes");
  else if (tests) parts.push(`rodou os testes: ${tests === "passed" ? "passaram" : "falharam"}`);
  // One short sentence per action ("Mexeu em pix.ts e checkout.ts. Rodou os testes: passaram."): a single joined
  // sentence repeated "e" when a file list was inside it.
  return { text: parts.map(capitalize).join(". ") || "Trabalhou nos arquivos", tone: tests === "failed" ? "bad" : tests === "passed" ? "ok" : "" };
}

// Present tense for the tool running now.
export function humanRunning(tool) {
  const kind = toolKind(tool?.name);
  if (kind === "read" || kind === "search") return "Lendo o código";
  if (kind === "edit" || kind === "write") return `Mexendo em ${basename(toolPath(tool.args)) || "um arquivo"}`;
  if (kind === "command") return isTestCommand(tool.args?.command) ? "Rodando os testes" : "Rodando um comando";
  return "Trabalhando";
}

const AGENT_STATES = { running: "trabalhando", background: "em segundo plano", done: "pronto", error: "não concluiu" };

// The two sides of a delegation: what the PI asked, and what the agent answered (or that it is still working).
export function agentExchange(tool) {
  const args = tool?.args ?? {};
  const details = tool?.result?.details ?? {};
  const name = stripEmoji(String(details.displayName || args.name || args.subagent_type || "agente")).trim() || "agente";
  let status = "running";
  if (done(tool)) status = failed(tool) ? "error" : details.status === "background" ? "background" : "done";
  const answerText = status === "done" || status === "error" ? toolResultText(tool.result) : "";
  const answer = answerText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 4).join(" ");
  const ask = String(args.description || args.prompt || "").split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "uma tarefa";
  const cost = Number(details.cost ?? details.totalCost);
  return {
    name,
    initial: name.charAt(0).toUpperCase(),
    family: subagentFamily({ title: name, type: args.subagent_type }),
    model: String(details.modelName || args.model || ""),
    status,
    label: AGENT_STATES[status],
    ask: truncate(ask, 180),
    answer: truncate(answer, 420),
    elapsed: details.durationMs > 0 ? formatElapsed(details.durationMs) : "",
    cost: Number.isFinite(cost) && cost > 0 ? `US$ ${cost.toFixed(2)}` : "",
  };
}

// buildTimeline() items -> simple items: no reasoning items, no reasoning on answers, each Agent call its own
// "agent" item, the other tools of a group kept together (key unchanged for the first part, so its open state holds).
export function simplifyTimeline(items = []) {
  const out = [];
  for (const item of items) {
    if (item.kind === "thinking") continue;
    if (item.kind === "assistant") {
      out.push(item.thinking ? { ...item, thinking: "" } : item);
      continue;
    }
    if (item.kind !== "tools") {
      out.push(item);
      continue;
    }
    let work = null;
    item.tools.forEach((tool, index) => {
      if (tool?.name === SUBAGENT_TOOLS.agent) {
        work = null;
        out.push({ kind: "agent", key: `ag:${tool.id}`, tool });
        return;
      }
      if (!work) {
        work = { ...item, key: index ? `${item.key}:${index}` : item.key, tools: [], simple: true };
        out.push(work);
      }
      work.tools.push(tool);
    });
  }
  return out;
}

// Cache signature of a simple "agent" item (the regular timelineSignature covers the rest).
export function agentSignature(item) {
  const tool = item.tool ?? {};
  return `agent|${tool.status}|${toolResultText(tool.result).length}|${JSON.stringify(tool.result?.details ?? {}).length}`;
}
