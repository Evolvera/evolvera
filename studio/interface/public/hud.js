// The Studio's HUD, under the chat: which model is really answering (next to the default one in the settings), how full
// the context is and where PI compacts it by itself, what the agent is doing right now in plain words, how long it may
// still take (from the checklist and this project's past runs, never from an extra model call) and what the last turn
// cost. Pure functions here; app.js paints them.
import { basename, formatElapsed, thinkingLabel, toolKind, toolPath, truncate } from "./lib.js";
import { isTestCommand } from "./simple-view.js";

const EFFORT = { off: "sem raciocínio", minimal: "mínimo", low: "baixo", medium: "médio", high: "alto", xhigh: "máximo" };
export const effortText = (level) => (level ? EFFORT[level] ?? String(thinkingLabel(level)).toLowerCase() : "");
const money = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const costText = (value) => (Number(value) >= 0.005 ? `US$ ${money.format(Number(value))}` : "");
const kTokens = (value) => (value >= 1000 ? `${Math.round(value / 1000)}k` : String(value));

// Default (settings.json), selected (what get_state says PI will use) and in use (what the last answer actually came
// from: provider/model and thinkingLevel stamped on the message). The labels are ids, never a guessed display name.
export function modelTruth({ defaults = null, session = null, messages = [] } = {}) {
  const last = [...messages].reverse().find((message) => message?.role === "assistant" && typeof message.model === "string");
  const selected = session?.model ? { provider: session.model.provider ?? "", id: session.model.id ?? "", name: session.model.name ?? "", effort: session.model.reasoning === false ? "" : session.thinkingLevel ?? "" } : null;
  const inUse = last ? { provider: last.provider ?? "", id: last.model, effort: last.thinkingLevel ?? "", at: Number(last.timestamp) || null } : selected && { ...selected, at: null, fromState: true };
  const standard = defaults?.defaultModel ? { provider: defaults.defaultProvider ?? "", id: defaults.defaultModel, effort: defaults.defaultThinkingLevel ?? "" } : null;
  const same = (a, b) => Boolean(a && b) && a.id === b.id && (!a.provider || !b.provider || a.provider === b.provider);
  return {
    standard,
    selected,
    inUse,
    differsFromDefault: Boolean(standard && inUse) && (!same(standard, inUse) || (standard.effort && inUse.effort && standard.effort !== inUse.effort)),
    differsFromSelected: Boolean(selected && last) && !same(selected, inUse),
  };
}
export const modelText = (model) => (model ? [model.id, effortText(model.effort)].filter(Boolean).join(" · ") : "");

// Context: tokens / window, the point where PI compacts by itself (window minus compaction.reserveTokens) and the tone.
export function contextGauge(stats, settings = null, { lastCompactionAt = null, now = Date.now() } = {}) {
  const usage = stats?.contextUsage;
  const window = Number(usage?.contextWindow) || 0;
  const tokens = typeof usage?.tokens === "number" ? usage.tokens : typeof usage?.percent === "number" && window ? (usage.percent / 100) * window : null;
  if (!window || tokens === null) return null;
  const percent = Math.min(100, Math.max(0, (tokens / window) * 100));
  const enabled = settings?.compaction?.enabled !== false;
  const reserve = Number(settings?.compaction?.reserveTokens) || 16_384;
  const compactAt = enabled && reserve < window ? ((window - reserve) / window) * 100 : null;
  const tone = compactAt !== null && percent >= compactAt - 5 ? "bad" : percent >= 60 ? "wait" : "ok";
  const label = `${Math.round(percent)}% · ${kTokens(Math.round(tokens))} / ${kTokens(window)}`;
  const toCompact = compactAt === null ? "" : percent >= compactAt ? "compacta na próxima resposta" : `compacta sozinho em ${Math.round(compactAt)}% (faltam ${kTokens(Math.round(((compactAt - percent) / 100) * window))} tokens)`;
  return { percent, tokens, window, compactAt, tone, label, toCompact, compacted: Number.isFinite(lastCompactionAt) ? `compactado ${formatAgo(now - lastCompactionAt)}` : "" };
}
const formatAgo = (ms) => (ms < 60_000 ? "agora há pouco" : `há ${formatElapsed(ms).replace(/ \d+ s$/, "")}`);

// What the agent is doing now, from the running tool or the phase, plus what this turn has done so far.
// turn: the messages since the last user message.
export function activityNow({ streaming = false, phase = "thinking", runtime = new Map(), turn = [], startedAt = 0, now = Date.now() } = {}) {
  if (!streaming) return null;
  const tool = [...(runtime?.values?.() ?? [])].reverse().find((item) => item?.status === "running");
  let text = "Pensando";
  if (phase === "compacting") text = "Compactando o contexto";
  else if (phase === "retry") text = "Tentando de novo";
  else if (phase === "writing") text = "Escrevendo a resposta";
  else if (phase === "tool" && tool) text = toolSentence(tool);
  const edited = new Set();
  let tests = null;
  const calls = new Map();
  for (const message of turn) {
    if (message?.role === "assistant" && Array.isArray(message.content)) for (const part of message.content) if (part?.type === "toolCall") calls.set(part.id, part);
    if (message?.role !== "toolResult") continue;
    const call = calls.get(message.toolCallId);
    const kind = toolKind(call?.name ?? message.toolName);
    if (kind === "edit" || kind === "write") edited.add(basename(toolPath(call?.arguments ?? {})) || "arquivo");
    if (kind === "command" && isTestCommand(call?.arguments?.command)) tests = message.isError ? "falharam" : "passaram";
  }
  const done = [edited.size ? `${edited.size} ${edited.size === 1 ? "arquivo editado" : "arquivos editados"}` : "", tests ? `testes ${tests}` : ""].filter(Boolean).join(" · ");
  return { text, done, elapsed: startedAt ? formatElapsed(now - startedAt) : "", tool: tool?.name ?? "" };
}

export function toolSentence(tool) {
  const kind = toolKind(tool?.name);
  const args = tool?.args ?? {};
  const file = basename(toolPath(args));
  if (kind === "read") return `Lendo ${file || "o código"}`;
  if (kind === "search") return `Procurando ${truncate(String(args.pattern ?? "no código"), 40)}`;
  if (kind === "edit" || kind === "write") return `Editando ${file || "um arquivo"}`;
  if (kind === "command") return isTestCommand(args.command) ? "Rodando os testes" : `Rodando ${truncate(String(args.command ?? "um comando").split(/\r?\n/)[0], 48)}`;
  if (tool?.name === "Agent") return `Delegando a ${args.subagent_type || "um agente"}`;
  return `Usando ${tool?.name || "uma ferramenta"}`;
}

// Time left, honestly: from the checklist (average and spread of the items finished so far times the items left) and,
// with no checklist, from how long this project's last runs took. No model is asked; with too little data it says so.
// tasks: todo items; stamps: taskStampsFromMessages; history: durations (ms) of past runs here.
export function estimate({ tasks = [], stamps = {}, history = [], elapsed = 0, now = Date.now() } = {}) {
  const visible = tasks.filter((task) => task && task.status !== "deleted");
  const done = visible.filter((task) => task.status === "completed");
  const left = visible.length - done.length;
  const durations = done.map((task) => stamps[task.id]).filter((stamp) => Number.isFinite(stamp?.startedAt) && Number.isFinite(stamp?.endedAt) && stamp.endedAt > stamp.startedAt).map((stamp) => stamp.endedAt - stamp.startedAt);
  if (visible.length && left === 0) return { text: "Checklist completo", detail: `${done.length} de ${visible.length} itens`, pct: 100, basis: "checklist" };
  if (visible.length && durations.length) {
    const avg = durations.reduce((sum, value) => sum + value, 0) / durations.length;
    const current = visible.find((task) => task.status === "in_progress");
    const inFlight = current && Number.isFinite(stamps[current.id]?.startedAt) ? Math.min(avg, now - stamps[current.id].startedAt) : 0;
    const mid = Math.max(0, left * avg - inFlight);
    const low = Math.max(0, left * Math.min(...durations) - inFlight);
    const high = Math.max(mid, left * Math.max(...durations));
    const spread = high - low;
    return {
      text: `≈ ${minutes(mid)} restantes`,
      range: durations.length > 1 && spread >= 60_000 ? `entre ${minutes(low)} e ${minutes(high)}` : "",
      detail: `${done.length} de ${visible.length} itens · cerca de ${minutes(avg)} por item`,
      pct: Math.round((done.length / visible.length) * 100),
      basis: "checklist",
    };
  }
  if (visible.length) return { text: "Estimando", detail: `${done.length} de ${visible.length} itens · a estimativa sai quando o primeiro item terminar`, pct: Math.round((done.length / visible.length) * 100), basis: "checklist" };
  const runs = history.filter((value) => Number(value) > 0).slice(-12);
  if (runs.length >= 3) {
    const sorted = [...runs].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    return elapsed < median
      ? { text: `costuma levar ${minutes(median)}`, detail: `mediana das últimas ${runs.length} rodadas neste projeto`, pct: null, basis: "history" }
      : { text: "passou do tempo comum", detail: `a mediana aqui é ${minutes(median)}`, pct: null, basis: "history" };
  }
  return null;
}
function minutes(ms) {
  if (ms < 60_000) return "menos de 1 min";
  const total = Math.round(ms / 60_000);
  return total < 60 ? `${total} min` : `${Math.floor(total / 60)} h ${total % 60} min`;
}

// The last finished turn: how long it took, how many files it changed and what it cost.
export function turnReceipt(messages = []) {
  let start = -1;
  for (let index = messages.length - 1; index >= 0; index--) if (messages[index]?.role === "user") { start = index; break; }
  if (start < 0) return null;
  const turn = messages.slice(start + 1);
  if (!turn.length) return null;
  const calls = new Map();
  const files = new Set();
  let cost = 0;
  const began = Number(messages[start].timestamp);
  let last = Number.isFinite(began) ? began : 0;
  for (const message of turn) {
    if (Number.isFinite(Number(message?.timestamp))) last = Math.max(last, Number(message.timestamp));
    if (message?.role === "assistant") {
      cost += Number(message.usage?.cost?.total) || 0;
      for (const part of Array.isArray(message.content) ? message.content : []) if (part?.type === "toolCall") calls.set(part.id, part);
    } else if (message?.role === "toolResult" && !message.isError) {
      const call = calls.get(message.toolCallId);
      const kind = toolKind(call?.name ?? message.toolName);
      if (kind === "edit" || kind === "write") files.add(toolPath(call?.arguments ?? {}) || "arquivo");
    }
  }
  const took = Number.isFinite(began) ? last - began : 0;
  return { duration: took >= 1000 ? formatElapsed(took) : "", files: files.size, cost: costText(cost) };
}

// Statuses worth a place in the HUD: the execution mode and the goal; counts like "MCP: 3 servers enabled" are not.
const KEEP_STATUS = /^(execution-mode|goal|orchestration-mode|account|working-time)$/;
export function usefulStatuses(statuses) {
  return [...(statuses?.entries?.() ?? [])].filter(([key, text]) => KEEP_STATUS.test(key) && String(text ?? "").trim()).map(([, text]) => String(text).replace(/\u001b\[[0-9;]*m/g, "").replace(/\s+/g, " ").trim());
}
