// Pure, DOM-free helpers for PI Studio. Shared by app.js (browser) and node:test.

// ---------------------------------------------------------------- text utils

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Extension status/widget text is written for a terminal and may carry ANSI SGR/OSC sequences.
const ANSI_PATTERN = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g;

export function stripAnsi(value) {
  return String(value ?? "").replace(ANSI_PATTERN, "");
}

// Extensions re-announce themselves on every PI start/reconnect; show one toast per
// identical message within the window instead of stacking copies.
export function shouldShowToast(seen, key, now, windowMs = 60_000) {
  const last = seen.get(key);
  if (last !== undefined && now - last < windowMs) return false;
  seen.set(key, now);
  return true;
}

// A prompt sent while PI is still applying new_session/switch_session runs in the session
// being replaced and is lost. holder.gate tracks the in-flight switch; prompts await it.
// The gate never rejects and clears itself when its switch settles.
export function setSessionGate(holder, promise) {
  const gate = Promise.resolve(promise).then(() => {}, () => {}).finally(() => {
    if (holder.gate === gate) holder.gate = null;
  });
  holder.gate = gate;
  return gate;
}

export async function waitSessionGate(holder) {
  while (holder.gate) await holder.gate;
}

// Replayed history is display-only, except a response to a request this page still awaits.
export function isAwaitedResponse(payload, pending) {
  return payload?.type === "response" && typeof payload.id === "string" && pending.has(payload.id);
}

// Runs a project/session switch as one gated unit. The gate is claimed synchronously (at
// click time) and chained after any switch already in flight, so a prompt submitted at any
// moment waits for every pending switch. `task` must not call runGated itself (it would wait
// on its own gate); it resolves once PI has applied the switch.
export function runGated(holder, task) {
  const prior = holder.gate;
  const run = (async () => {
    if (prior) await prior;
    return task();
  })();
  setSessionGate(holder, run);
  return run;
}

const SUBAGENT_STATUS_LABELS = { completed: "concluído", error: "falhou", aborted: "interrompido", steered: "redirecionado", stopped: "parado" };

// Chat line for an extension message. pi-subagents' "subagent-notification" carries raw
// <task-notification> XML for the model; the chat shows a one-line summary instead (the
// Subagentes tab has the full result). Fields: NotificationDetails in pi-subagents/src/types.ts.
export function customNoteText(message) {
  const details = message?.details;
  if (message?.customType !== "subagent-notification" || !details?.description) return messageText(message);
  const notes = [details, ...(Array.isArray(details.others) ? details.others : [])].filter((note) => note?.description);
  const describe = (note) => `${note.description} · ${SUBAGENT_STATUS_LABELS[note.status] || note.status || "atualizado"}`;
  if (notes.length === 1) return `Subagente: ${describe(details)}${details.error ? ` — ${details.error}` : ""}`;
  return `Subagentes (${notes.length}): ${notes.map(describe).join("; ")}`;
}

export function countLines(text) {
  if (typeof text !== "string" || text === "") return 0;
  return text.replace(/\n$/, "").split("\n").length;
}

export function plural(count, one, many) {
  return `${count} ${count === 1 ? one : many}`;
}

export function truncate(text, max) {
  const value = String(text ?? "");
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export function basename(filePath) {
  const parts = String(filePath ?? "").split(/[\\/]/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : String(filePath ?? "");
}

export function isLongText(text, maxLines = 10, maxChars = 700) {
  const value = String(text ?? "");
  return value.length > maxChars || value.split("\n").length > maxLines;
}

// ------------------------------------------------------------ formatting

export function formatElapsed(ms) {
  const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  if (total < 60) return `${total} s`;
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes} min ${total % 60} s`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

export function formatTokens(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  if (n < 1000) return String(Math.round(n));
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, "")}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

export function relativeTime(value, now = Date.now()) {
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return "";
  const seconds = Math.max(0, Math.round((now - time) / 1000));
  if (seconds < 60) return "agora";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} d`;
  return new Date(time).toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
}

export function greeting(hour, name) {
  const salutation = hour < 5 ? "Boa noite" : hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  return name ? `${salutation}, ${name}` : salutation;
}

const THINKING_LABELS = {
  off: "Sem raciocínio",
  minimal: "Mínimo",
  low: "Baixo",
  medium: "Médio",
  high: "Alto",
  xhigh: "Muito alto",
  max: "Máximo",
};

export function thinkingLabel(level) {
  return THINKING_LABELS[level] || String(level || "");
}

export function modelLabel(model) {
  if (!model) return "Sem modelo";
  return model.name || model.id || "Modelo";
}

export function normalizeModels(data) {
  if (Array.isArray(data?.models)) {
    return data.models.filter(Boolean).map((model) => ({ ...model, provider: model.provider || "" }));
  }
  if (Array.isArray(data?.providers)) {
    return data.providers.flatMap((provider) =>
      (Array.isArray(provider?.models) ? provider.models : []).map((model) => ({ ...model, provider: model.provider || provider.name || "" })),
    );
  }
  return [];
}

export function contextUsage(stats) {
  const usage = stats?.contextUsage;
  if (!usage) return null;
  const window = Number(usage.contextWindow);
  let percent = typeof usage.percent === "number" ? usage.percent : null;
  if (percent === null && typeof usage.tokens === "number" && window > 0) percent = (usage.tokens / window) * 100;
  if (percent === null) return null;
  return {
    percent: Math.min(100, Math.max(0, Math.round(percent))),
    tokens: typeof usage.tokens === "number" ? usage.tokens : null,
    contextWindow: window > 0 ? window : null,
  };
}

// ---------------------------------------------------------------- markdown

const SAFE_URL = /^(https?:\/\/|mailto:)/i;

export function renderInline(source) {
  const slots = [];
  const hold = (html) => `\u0000${slots.push(html) - 1}\u0000`;
  let text = String(source ?? "").replace(/\u0000/g, "");

  text = text.replace(/(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/g, (_, __, code) => hold(`<code>${escapeHtml(code)}</code>`));
  text = text.replace(/\[([^\]\n]+)\]\(([^()\s]+)(?:\s+"[^"]*")?\)/g, (match, label, url) =>
    SAFE_URL.test(url)
      ? hold(`<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`)
      : hold(escapeHtml(label)),
  );
  text = text.replace(/\bhttps?:\/\/[^\s<>()]+[^\s<>().,;:!?'"]/g, (url) =>
    hold(`<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`),
  );

  let html = escapeHtml(text);
  html = html
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^\w])__(?=\S)([\s\S]*?\S)__(?!\w)/g, "$1<strong>$2</strong>")
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, "<del>$1</del>")
    .replace(/(^|[^*\w])\*(?=[^\s*])([^*\n]*?[^\s*])\*(?!\*)/g, "$1<em>$2</em>")
    .replace(/(^|[^\w])_(?=[^\s_])([^_\n]*?[^\s_])_(?!\w)/g, "$1<em>$2</em>");
  return html.replace(/\u0000(\d+)\u0000/g, (_, index) => slots[Number(index)]);
}

const FENCE = /^\s{0,3}(`{3,}|~{3,})\s*([^\s`]*)/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const LIST_ITEM = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const TABLE_DIVIDER = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

function splitRow(line) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

function startsBlock(line, next) {
  return FENCE.test(line) || HEADING.test(line) || RULE.test(line) || /^\s{0,3}>/.test(line) || LIST_ITEM.test(line) ||
    (line.includes("|") && TABLE_DIVIDER.test(next ?? ""));
}

function renderCode(lang, body) {
  const label = escapeHtml(lang || "texto");
  const cls = lang ? ` class="language-${escapeHtml(lang)}"` : "";
  return `<div class="code-block"><div class="code-head"><span class="code-lang">${label}</span>` +
    `<button type="button" class="code-copy" data-copy aria-label="Copiar código">Copiar</button></div>` +
    `<pre><code${cls}>${escapeHtml(body)}</code></pre></div>`;
}

function renderList(lines, start) {
  const first = lines[start].match(LIST_ITEM);
  const indent = first[1].length;
  const ordered = /\d/.test(first[2]);
  const items = [];
  let index = start;
  while (index < lines.length) {
    const line = lines[index];
    const match = line.match(LIST_ITEM);
    if (match && match[1].length === indent && /\d/.test(match[2]) === ordered) {
      items.push({ text: match[3], children: [] });
      index++;
      continue;
    }
    if (match && match[1].length > indent) {
      const nested = renderList(lines, index);
      items[items.length - 1].children.push(nested.html);
      index = nested.next;
      continue;
    }
    if (!match && line.trim() && /^\s+/.test(line)) {
      items[items.length - 1].text += `\n${line.trim()}`;
      index++;
      continue;
    }
    break;
  }
  const tag = ordered ? "ol" : "ul";
  const startAttr = ordered && Number.parseInt(first[2], 10) !== 1 ? ` start="${Number.parseInt(first[2], 10)}"` : "";
  const body = items.map((item) => {
    const task = item.text.match(/^\[( |x|X)\]\s+(.*)$/s);
    const content = task
      ? `<span class="task ${task[1] === " " ? "" : "done"}" aria-hidden="true"></span>${renderInline(task[2]).replace(/\n/g, "<br>")}`
      : renderInline(item.text).replace(/\n/g, "<br>");
    return `<li>${content}${item.children.join("")}</li>`;
  }).join("");
  return { html: `<${tag}${startAttr}>${body}</${tag}>`, next: index };
}

export function renderMarkdown(source) {
  const lines = String(source ?? "").replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index++;
      continue;
    }
    const fence = line.match(FENCE);
    if (fence) {
      const marker = fence[1];
      const body = [];
      index++;
      while (index < lines.length && !lines[index].trim().startsWith(marker)) body.push(lines[index++]);
      index++;
      out.push(renderCode(fence[2], body.join("\n")));
      continue;
    }
    const heading = line.match(HEADING);
    if (heading) {
      const level = heading[1].length;
      out.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      index++;
      continue;
    }
    if (RULE.test(line)) {
      out.push("<hr>");
      index++;
      continue;
    }
    if (/^\s{0,3}>/.test(line)) {
      const quote = [];
      while (index < lines.length && /^\s{0,3}>/.test(lines[index])) quote.push(lines[index++].replace(/^\s{0,3}>\s?/, ""));
      out.push(`<blockquote>${renderMarkdown(quote.join("\n"))}</blockquote>`);
      continue;
    }
    if (line.includes("|") && TABLE_DIVIDER.test(lines[index + 1] ?? "")) {
      const header = splitRow(line);
      const aligns = splitRow(lines[index + 1]).map((cell) =>
        cell.startsWith(":") && cell.endsWith(":") ? "center" : cell.endsWith(":") ? "right" : cell.startsWith(":") ? "left" : "",
      );
      index += 2;
      const rows = [];
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) rows.push(splitRow(lines[index++]));
      const cell = (tag, value, column) => `<${tag}${aligns[column] ? ` style="text-align:${aligns[column]}"` : ""}>${renderInline(value)}</${tag}>`;
      const head = `<tr>${header.map((value, column) => cell("th", value, column)).join("")}</tr>`;
      const body = rows.map((row) => `<tr>${header.map((_, column) => cell("td", row[column] ?? "", column)).join("")}</tr>`).join("");
      out.push(`<div class="table-wrap"><table><thead>${head}</thead><tbody>${body}</tbody></table></div>`);
      continue;
    }
    if (LIST_ITEM.test(line)) {
      const list = renderList(lines, index);
      out.push(list.html);
      index = list.next;
      continue;
    }
    const paragraph = [line.trim()];
    index++;
    while (index < lines.length && lines[index].trim() && !startsBlock(lines[index], lines[index + 1])) paragraph.push(lines[index++].trim());
    out.push(`<p>${renderInline(paragraph.join("\n")).replace(/\n/g, "<br>")}</p>`);
  }
  return out.join("");
}

// ------------------------------------------------------------------- tools

export function toolKind(name) {
  const value = String(name || "").toLowerCase();
  if (value === "bash") return "command";
  if (value === "edit") return "edit";
  if (value === "write") return "write";
  if (value === "read") return "read";
  if (value === "grep" || value === "find" || value === "ls") return "search";
  return "other";
}

export function toolPath(args) {
  const value = args?.path ?? args?.file_path ?? args?.filePath;
  return typeof value === "string" ? value : "";
}

export function shortArgs(name, args = {}) {
  const kind = toolKind(name);
  if (kind === "command") return truncate(String(args.command ?? "").split("\n")[0], 90);
  if (kind === "search" && args.pattern) return truncate(`${args.pattern}${toolPath(args) ? ` · ${toolPath(args)}` : ""}`, 90);
  if (toolPath(args)) return truncate(toolPath(args), 90);
  const firstString = Object.values(args || {}).find((value) => typeof value === "string" && value.trim());
  return firstString ? truncate(firstString.split("\n")[0], 90) : "";
}

export function toolResultText(result) {
  if (!result) return "";
  if (typeof result === "string") return result;
  if (Array.isArray(result.content)) {
    return result.content.map((part) => (part?.type === "text" ? part.text || "" : part?.type === "image" ? "[imagem]" : "")).filter(Boolean).join("\n");
  }
  return "";
}

export function countDiffLines(diff) {
  let added = 0;
  let removed = 0;
  for (const line of String(diff ?? "").split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) added++;
    else if (line.startsWith("-")) removed++;
  }
  return { added, removed };
}

function editPairs(args = {}) {
  if (Array.isArray(args.edits)) return args.edits.filter(Boolean);
  if (typeof args.oldText === "string" || typeof args.newText === "string") return [{ oldText: args.oldText, newText: args.newText }];
  return [];
}

export function diffStats(tool) {
  const kind = toolKind(tool?.name);
  const diff = tool?.result?.details?.diff;
  if ((kind === "edit" || kind === "write") && typeof diff === "string" && diff) return countDiffLines(diff);
  if (kind === "write") return { added: countLines(tool?.args?.content), removed: 0 };
  if (kind === "edit") {
    return editPairs(tool?.args).reduce(
      (acc, edit) => ({ added: acc.added + countLines(edit.newText), removed: acc.removed + countLines(edit.oldText) }),
      { added: 0, removed: 0 },
    );
  }
  return { added: 0, removed: 0 };
}

export function diffLines(tool) {
  const kind = toolKind(tool?.name);
  const diff = tool?.result?.details?.diff;
  if (typeof diff === "string" && diff) {
    return diff.split("\n").map((text) => ({ type: text.startsWith("+") ? "add" : text.startsWith("-") ? "del" : "ctx", text }));
  }
  if (kind === "write") return String(tool?.args?.content ?? "").replace(/\n$/, "").split("\n").map((text) => ({ type: "add", text: `+ ${text}` }));
  if (kind === "edit") {
    const lines = [];
    editPairs(tool?.args).forEach((edit, position) => {
      if (position) lines.push({ type: "meta", text: "…" });
      for (const text of String(edit.oldText ?? "").split("\n")) lines.push({ type: "del", text: `- ${text}` });
      for (const text of String(edit.newText ?? "").split("\n")) lines.push({ type: "add", text: `+ ${text}` });
    });
    return lines;
  }
  return toolResultText(tool?.result).split("\n").map((text) => ({ type: "ctx", text }));
}

export function isFileChange(tool) {
  const kind = toolKind(tool?.name);
  return (kind === "edit" || kind === "write") && Boolean(toolPath(tool?.args));
}

export function summarizeTools(tools = []) {
  const counts = { command: 0, read: 0, search: 0, other: 0 };
  const edited = new Set();
  const written = new Set();
  for (const tool of tools) {
    const kind = toolKind(tool?.name);
    if (kind === "edit") edited.add(toolPath(tool.args) || tool.id);
    else if (kind === "write") written.add(toolPath(tool.args) || tool.id);
    else counts[kind]++;
  }
  const parts = [];
  if (counts.command) parts.push(`executou ${plural(counts.command, "comando", "comandos")}`);
  if (edited.size) parts.push(`editou ${plural(edited.size, "arquivo", "arquivos")}`);
  if (written.size) parts.push(`criou ${plural(written.size, "arquivo", "arquivos")}`);
  if (counts.read) parts.push(`leu ${plural(counts.read, "arquivo", "arquivos")}`);
  if (counts.search) parts.push(`fez ${plural(counts.search, "busca", "buscas")}`);
  if (counts.other) parts.push(`usou ${plural(counts.other, "ferramenta", "ferramentas")}`);
  if (!parts.length) return "Nenhuma ferramenta";
  const text = parts.join(" · ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function runningTool(tools = []) {
  return tools.find((tool) => tool.status === "running") || null;
}

export function collectOutputs(tools = []) {
  const byPath = new Map();
  for (const tool of tools) {
    if (!isFileChange(tool) || tool.isError) continue;
    const filePath = toolPath(tool.args);
    const stats = diffStats(tool);
    const entry = byPath.get(filePath) || { path: filePath, name: basename(filePath), kind: toolKind(tool.name), added: 0, removed: 0, toolIds: [] };
    entry.added += stats.added;
    entry.removed += stats.removed;
    entry.toolIds.push(tool.id);
    if (toolKind(tool.name) === "edit") entry.kind = entry.kind === "write" ? "write" : "edit";
    byPath.set(filePath, entry);
  }
  return [...byPath.values()];
}

// --------------------------------------------------------------- messages

export function activeBranch(entries = [], leafId) {
  const list = Array.isArray(entries) ? entries.filter(Boolean) : [];
  if (!leafId) return list;
  const byId = new Map(list.map((entry) => [entry.id, entry]));
  if (!byId.has(leafId)) return list;
  const chain = [];
  const seen = new Set();
  let cursor = byId.get(leafId);
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    chain.push(cursor);
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
  }
  return chain.reverse();
}

// Epoch milliseconds from a number or an ISO string; null for anything else.
function toMs(value) {
  const ms = typeof value === "string" ? Date.parse(value) : value;
  return typeof ms === "number" && Number.isFinite(ms) ? ms : null;
}

// An assistant message's own `timestamp` is when it started; its entry's timestamp is when it was written (finished).
export function entriesToMessages(entries, leafId) {
  const out = [];
  for (const entry of activeBranch(entries, leafId)) {
    if (entry.type === "message" && entry.message) {
      const endedAt = entry.message.role === "assistant" ? toMs(entry.timestamp) : null;
      out.push(endedAt === null ? entry.message : { ...entry.message, _endedAt: endedAt });
    }
    else if (entry.type === "custom_message") {
      out.push({ role: "custom", customType: entry.customType, content: entry.content, display: entry.display, details: entry.details, timestamp: entry.timestamp });
    }
    else if (entry.type === "compaction") out.push({ role: "compactionSummary", summary: entry.summary, tokensBefore: entry.tokensBefore });
    else if (entry.type === "branch_summary") out.push({ role: "branchSummary", summary: entry.summary });
  }
  return out;
}

// An entries snapshot can be older than a prompt submitted while PI is starting.
// Keep that optimistic message visible until PI's own entry catches up.
export function reconcileEntries(entries, currentMessages = []) {
  const reconciled = [...entries];
  for (const message of currentMessages) {
    // A shell block the user ran from the composer stays until PI's own bashExecution entry exists.
    if (message?._bash) {
      if (!reconciled.some((entry) => entry.role === "bashExecution" && entry.command === message.command && !(entry.timestamp < message.timestamp - 1000))) reconciled.push(message);
      continue;
    }
    if (!message?._optimistic) continue;
    const text = messageText(message);
    if (reconciled.some((entry) => entry.role === "user" && messageText(entry) === text)) continue;
    reconciled.push(message);
  }
  return reconciled;
}

export function messageText(message) {
  if (!message) return "";
  if (typeof message.content === "string") return message.content;
  if (Array.isArray(message.content)) {
    return message.content.filter((part) => part?.type === "text").map((part) => part.text || "").join("\n");
  }
  return "";
}

export function messageImages(message) {
  if (!Array.isArray(message?.content)) return [];
  return message.content.filter((part) => part?.type === "image" && part.data).map((part) => ({ data: part.data, mimeType: part.mimeType || "image/png" }));
}

export function upsertMessage(list, message) {
  if (!message) return list;
  for (let index = list.length - 1; index >= Math.max(0, list.length - 8); index--) {
    const current = list[index];
    if (current.role === message.role && current.timestamp != null && current.timestamp === message.timestamp) {
      list[index] = message;
      return list;
    }
    if (message.role === "toolResult" && current.role === "toolResult" && current.toolCallId === message.toolCallId) {
      list[index] = message;
      return list;
    }
  }
  if (message.role === "user") {
    const optimistic = list.findIndex((item) => item._optimistic);
    if (optimistic !== -1) {
      list[optimistic] = message;
      return list;
    }
  }
  list.push(message);
  return list;
}

export function applyAssistantDelta(message, event) {
  if (!Array.isArray(message.content)) message.content = [];
  const type = event?.type;
  if (type === "text_delta" || type === "thinking_delta") {
    const partType = type === "text_delta" ? "text" : "thinking";
    const content = message.content;
    let part;
    if (Number.isInteger(event.contentIndex)) {
      part = content[event.contentIndex];
      if (!part) part = content[event.contentIndex] = { type: partType, [partType]: "" };
    }
    if (!part || part.type !== partType) {
      const last = content[content.length - 1];
      part = last?.type === partType ? last : null;
      if (!part) content.push((part = { type: partType, [partType]: "" }));
    }
    part[partType] = (part[partType] || "") + (event.delta || "");
  } else if (type === "toolcall_end" && event.toolCall) {
    if (!message.content.some((part) => part?.type === "toolCall" && part.id === event.toolCall.id)) {
      message.content.push({ type: "toolCall", ...event.toolCall });
    }
  }
  return message;
}

export function buildTimeline(messages = [], runtime = new Map()) {
  const items = [];
  const tools = new Map();
  let group = null;
  let thinking = "";
  const ensureGroup = (seed) => {
    if (!group) {
      group = { kind: "tools", key: `t:${seed}`, tools: [] };
      items.push(group);
    }
    return group;
  };
  const attachThinking = (item) => {
    if (thinking) item.thinking = `${item.thinking ? `${item.thinking}\n\n` : ""}${thinking}`;
    thinking = "";
  };

  // A turn runs from a user message to the next one; its last assistant text carries when the turn ended and how long it took.
  let turnStart = null;
  let turnText = null;
  let turnEnd = null;
  const closeTurn = () => {
    if (turnText && turnEnd !== null) {
      turnText.endedAt = turnEnd;
      if (turnStart !== null && turnEnd - turnStart >= 1000) turnText.tookMs = turnEnd - turnStart;
    }
    turnText = null;
    turnEnd = null;
  };

  messages.forEach((message, mi) => {
    if (!message) return;
    switch (message.role) {
      case "user":
        closeTurn();
        turnStart = toMs(message.timestamp);
        group = null;
        items.push({ kind: "user", key: `u:${mi}`, text: messageText(message), images: messageImages(message), optimistic: Boolean(message._optimistic) });
        break;
      case "assistant": {
        turnEnd = toMs(message._endedAt) ?? toMs(message.timestamp);
        const parts = Array.isArray(message.content) ? message.content : [{ type: "text", text: String(message.content ?? "") }];
        parts.forEach((part, pi) => {
          if (part?.type === "thinking" && part.thinking?.trim()) thinking += `${thinking ? "\n\n" : ""}${part.thinking}`;
          else if (part?.type === "text" && part.text?.trim()) {
            group = null;
            const item = { kind: "assistant", key: `a:${mi}.${pi}`, text: part.text };
            attachThinking(item);
            items.push(item);
            turnText = item;
          } else if (part?.type === "toolCall") {
            const target = ensureGroup(`${mi}:${part.id || pi}`);
            attachThinking(target);
            const tool = { id: part.id || `${mi}.${pi}`, name: part.name, args: part.arguments || {}, status: "pending", result: null, isError: false };
            target.tools.push(tool);
            tools.set(tool.id, tool);
          }
        });
        if (thinking) {
          const item = { kind: "thinking", key: `k:${mi}`, text: "" };
          attachThinking(item);
          item.text = item.thinking;
          items.push(item);
        }
        if (message.stopReason === "error" && message.errorMessage) {
          group = null;
          items.push({ kind: "error", key: `e:${mi}`, text: message.errorMessage });
        } else if (message.stopReason === "aborted") {
          group = null;
          items.push({ kind: "notice", key: `n:${mi}`, text: "Interrompido" });
        }
        break;
      }
      case "toolResult": {
        let tool = tools.get(message.toolCallId);
        if (!tool) {
          tool = { id: message.toolCallId || `r${mi}`, name: message.toolName, args: {}, status: "pending", result: null, isError: false };
          ensureGroup(`${mi}:${tool.id}`).tools.push(tool);
          tools.set(tool.id, tool);
        }
        tool.result = { content: message.content, details: message.details };
        tool.isError = Boolean(message.isError);
        tool.status = tool.isError ? "error" : "done";
        break;
      }
      case "bashExecution": {
        group = null;
        const output = message.output || "";
        const item = { kind: "bash", key: `x:${mi}`, text: message.command, output, state: bashState(message), exitCode: message.exitCode ?? null, truncated: Boolean(message.truncated) };
        item.detail = `${item.state}|${item.exitCode}|${item.truncated}|${output.length}`;
        items.push(item);
        break;
      }
      case "custom":
        if (message.display === false) break;
        group = null;
        items.push({ kind: "note", key: `c:${mi}`, text: customNoteText(message) });
        break;
      case "compactionSummary":
      case "branchSummary":
        group = null;
        items.push({ kind: "divider", key: `d:${mi}`, text: message.role === "branchSummary" ? "Resumo do ramo" : "Contexto compactado", detail: message.summary || "" });
        break;
    }
  });

  closeTurn();

  for (const [id, live] of runtime) {
    let tool = tools.get(id);
    if (!tool) {
      const last = items[items.length - 1];
      group = last?.kind === "tools" ? last : null;
      tool = { id, name: live.name, args: live.args || {}, status: "pending", result: null, isError: false };
      ensureGroup(`live:${id}`).tools.push(tool);
      tools.set(id, tool);
    }
    if (tool.status === "pending" || tool.status === "running") {
      tool.status = live.status;
      tool.result = live.result ?? live.partial ?? tool.result;
      tool.isError = live.status === "error";
    }
  }
  return items;
}

// Live run: the last assistant message is stamped when the run ends, until PI's entries give the written time.
export function stampTurnEnd(messages, now = Date.now()) {
  const last = messages.findLast((message) => message?.role === "assistant");
  if (!last || last._endedAt !== undefined) return false;
  last._endedAt = now;
  return true;
}

// Shows the end of a turn on its last assistant item, except for the turn still being streamed.
export function applyTurnFinish(items, streaming) {
  const lastUser = items.findLastIndex((item) => item.kind === "user");
  items.forEach((item, index) => {
    if (item.kind !== "assistant" || item.endedAt === undefined || (streaming && index > lastUser)) return;
    item.finishAt = item.endedAt;
    if (item.tookMs !== undefined) item.finishTook = item.tookMs;
  });
}

// "terminou há 10 min" (agora under a minute) plus a tooltip with the absolute time and how long the turn took.
export function finishedLabel(endedAt, tookMs, now = Date.now()) {
  const at = toMs(endedAt);
  if (at === null) return null;
  const relative = relativeTime(at, now);
  const text = relative === "agora" ? "terminou agora" : /^\d+ (min|h|d)$/.test(relative) ? `terminou há ${relative}` : `terminou em ${relative}`;
  const title = [`terminou em ${new Date(at).toLocaleString("pt-BR")}`];
  if (Number.isFinite(tookMs) && tookMs >= 1000) title.push(`levou ${formatElapsed(tookMs)}`);
  return { text, title: title.join(" · ") };
}

export function timelineTools(items) {
  return items.filter((item) => item.kind === "tools").flatMap((item) => item.tools);
}

export function timelineSignature(item) {
  if (item.kind === "tools") {
    return `tools|${item.thinking?.length ?? 0}|${item.tools.map((tool) => `${tool.id}:${tool.status}:${toolResultText(tool.result).length}`).join(",")}`;
  }
  return `${item.kind}|${item.optimistic ? 1 : 0}|${item.images?.length ?? 0}|${item.thinking ?? ""}|${item.text ?? ""}|${item.detail ?? ""}`;
}

// ------------------------------------------------------------------- input

export function composerAction(event, isStreaming) {
  if (!event || event.key !== "Enter" || event.isComposing) return null;
  if (event.shiftKey) return "newline";
  if (event.ctrlKey || event.metaKey) return isStreaming ? "follow_up" : "prompt";
  return isStreaming ? "steer" : "prompt";
}

// ------------------------------------------------- composer: / @ ! and keys

// Commands Studio runs itself; they are never sent to the model as text. `args` starting with
// "<" marks a required argument.
export const STUDIO_COMMANDS = [
  { name: "new", args: "", description: "Começar uma nova conversa", source: "studio" },
  { name: "compact", args: "[instruções]", description: "Compactar o contexto da conversa", source: "studio" },
  { name: "name", args: "<título>", description: "Dar um nome a esta conversa", source: "studio" },
  { name: "export", args: "", description: "Exportar a conversa em HTML", source: "studio" },
  { name: "atalhos", args: "", description: "Mostrar os atalhos de teclado", source: "studio" },
];

const SOURCE_LABELS = { studio: "Studio", extension: "extensão", skill: "skill", prompt: "prompt" };

export function sourceLabel(source) {
  return SOURCE_LABELS[source] || "comando";
}

// Studio built-ins first, then PI's get_commands entries (a built-in name wins a collision).
export function mergeCommands(piCommands) {
  const taken = new Set(STUDIO_COMMANDS.map((command) => command.name));
  const extra = (Array.isArray(piCommands) ? piCommands : [])
    .filter((command) => typeof command?.name === "string" && command.name && !taken.has(command.name))
    .map((command) => ({ name: command.name, args: "", description: typeof command.description === "string" ? command.description : "", source: command.source || "extension" }));
  return [...STUDIO_COMMANDS, ...extra];
}

// The slash menu is open while the whole composer is one "/word"; returns the word or null.
export function slashQuery(text) {
  const match = /^\/(\S*)$/.exec(String(text ?? ""));
  return match ? match[1] : null;
}

// Name prefix, then name substring, then description substring; original order within a rank.
export function filterCommands(commands, query) {
  const needle = String(query ?? "").toLowerCase();
  const ranked = [];
  commands.forEach((command, order) => {
    const name = command.name.toLowerCase();
    let rank = 3;
    if (name.startsWith(needle)) rank = 0;
    else if (name.includes(needle)) rank = 1;
    else if (String(command.description ?? "").toLowerCase().includes(needle)) rank = 2;
    if (rank < 3) ranked.push({ command, rank, order });
  });
  return ranked.sort((a, b) => a.rank - b.rank || a.order - b.order).map((entry) => entry.command);
}

export function slashCompletion(command) {
  return `/${command.name} `;
}

// Enter on a suggestion submits (instead of completing) only when the typed word already is that
// command and nothing more is needed: PI commands, and Studio built-ins without a required argument.
export function slashEnterSubmits(command, query) {
  if (command.name !== query) return false;
  return command.source !== "studio" || !command.args.startsWith("<");
}

// "/compact foco no código" -> { name: "compact", args: "foco no código" }; null for anything else.
export function parseBuiltin(text) {
  const match = /^\/(\S+)(?:\s+([\s\S]*))?$/.exec(String(text ?? "").trim());
  const command = match && STUDIO_COMMANDS.find((item) => item.name === match[1].toLowerCase());
  return command ? { name: command.name, args: (match[2] || "").trim() } : null;
}

// `@file` token around the cursor: starts at a word boundary, replaced through the end of the word.
export function mentionToken(text, cursor) {
  const value = String(text ?? "");
  const end = Math.min(Math.max(Number.isInteger(cursor) ? cursor : value.length, 0), value.length);
  const match = /(?:^|\s)@([^\s@]*)$/.exec(value.slice(0, end));
  if (!match) return null;
  const tail = /^\S*/.exec(value.slice(end))[0];
  return { start: end - match[1].length - 1, end: end + tail.length, query: match[1] };
}

// Replaces the token with `@path ` (quoted when the path has spaces); the caret lands after the space.
export function insertMention(text, token, filePath) {
  const value = String(text ?? "");
  const reference = /\s/.test(filePath) ? `@"${filePath}"` : `@${filePath}`;
  const after = value.slice(token.end);
  const gap = after.startsWith(" ") ? "" : " ";
  const head = `${value.slice(0, token.start)}${reference}${gap}`;
  return { text: head + after, cursor: head.length + (gap ? 0 : 1) };
}

// Basename prefix > basename substring > path substring; shorter, then alphabetical, within a rank.
export function rankFiles(files, query, limit = 50) {
  const needle = String(query ?? "").toLowerCase();
  const ranked = [];
  for (const file of files) {
    const lower = file.toLowerCase();
    const name = lower.slice(lower.lastIndexOf("/") + 1);
    let rank = 3;
    if (name.startsWith(needle)) rank = 0;
    else if (name.includes(needle)) rank = 1;
    else if (lower.includes(needle)) rank = 2;
    if (rank < 3) ranked.push({ file, rank });
  }
  ranked.sort((a, b) => a.rank - b.rank || a.file.length - b.file.length || a.file.localeCompare(b.file));
  return ranked.slice(0, limit).map((entry) => entry.file);
}

export function isShellText(text) {
  return /^\s*!/.test(String(text ?? ""));
}

export function shellCommand(text) {
  return String(text ?? "").replace(/^\s*!/, "").trim();
}

// ---- shell (`!`) blocks: bashExecution messages the composer creates and updates live.

const BASH_OUTPUT_MAX = 200_000;

export function bashState(message) {
  if (message._live) return "running";
  if (message.cancelled) return "cancelled";
  return message.exitCode || message.failed ? "error" : "done";
}

const BASH_LABELS = { running: "em execução", done: "concluído", cancelled: "cancelado" };

export function bashLabels(item) {
  const labels = [BASH_LABELS[item.state] || (item.exitCode ? `código ${item.exitCode}` : "falhou")];
  if (item.truncated) labels.push("truncado");
  return labels;
}

// Streaming chunk (bash_execution_update). Keeps the newest BASH_OUTPUT_MAX characters.
export function appendBashOutput(message, delta) {
  const output = `${message.output}${delta ?? ""}`;
  message.output = output.length > BASH_OUTPUT_MAX ? output.slice(output.length - BASH_OUTPUT_MAX) : output;
  return message;
}

// Applies the final `bash` response (or its failure) to the live block.
export function finishBash(message, response) {
  message._live = false;
  if (response?.success) {
    const data = response.data || {};
    if (typeof data.output === "string") message.output = data.output;
    message.exitCode = data.exitCode ?? 0;
    message.cancelled = Boolean(data.cancelled);
    message.truncated = Boolean(data.truncated);
  } else {
    message.failed = true;
    message.output = `${message.output ? `${message.output}\n` : ""}${response?.error || "Falha ao executar o comando."}`;
  }
  return message;
}

// Esc/ArrowDown clear a recalled message; ArrowUp in an empty composer recalls the last one.
export function recallAction(event, { empty, recalled }) {
  if (!event || event.isComposing || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return null;
  if (event.key === "ArrowUp" && empty) return "recall";
  if ((event.key === "ArrowDown" || event.key === "Escape") && recalled) return "clear";
  return null;
}

// Global shortcuts. `typing`: focus is in a text field or a modal is open.
// Alt+T / Alt+W, not Ctrl+T / Ctrl+Shift+W: browsers reserve those (new tab, close window) and never deliver them to the page.
export function shortcutAction(event, { typing = false } = {}) {
  if (!event || event.isComposing) return null;
  const key = String(event.key);
  if (event.altKey) {
    const plainAlt = !event.ctrlKey && !event.metaKey && !event.shiftKey;
    if (!plainAlt) return null;
    if (key.toLowerCase() === "t" || event.code === "KeyT") return "todos";
    return key.toLowerCase() === "w" || event.code === "KeyW" ? "worktrees" : null;
  }
  if (event.ctrlKey || event.metaKey) {
    if (key === "/") return "shortcuts";
    if (key === "`") return "console";
    if (key.toLowerCase() === "k" && !event.shiftKey) return "palette";
    return event.shiftKey && key.toLowerCase() === "o" ? "new" : null;
  }
  if (key === "Escape") return "escape";
  return key === "/" && !event.shiftKey && !typing ? "focus" : null;
}

export const SHORTCUT_GROUPS = [
  {
    title: "Mensagem",
    items: [
      { keys: ["Enter"], label: "Enviar (durante a resposta, direciona o PI)" },
      { keys: ["Ctrl", "Enter"], label: "Enfileirar durante a resposta" },
      { keys: ["Shift", "Enter"], label: "Nova linha" },
      { keys: ["↑"], label: "Campo vazio: recuperar a última mensagem" },
      { keys: ["/"], label: "No início: comandos · fora de um campo: focar a mensagem" },
      { keys: ["@"], label: "Mencionar um arquivo do projeto" },
      { keys: ["!"], label: "No início: executar no shell do projeto" },
      { keys: ["Tab"], label: "Completar a sugestão" },
    ],
  },
  {
    title: "Conversa",
    items: [
      { keys: ["Esc"], label: "Interromper a resposta ou o comando em execução" },
      { keys: ["Ctrl", "Shift", "O"], label: "Nova conversa" },
    ],
  },
  {
    title: "Interface",
    items: [
      { keys: ["Ctrl", "K"], label: "Paleta de comandos e busca nas conversas" },
      { keys: ["Ctrl", "/"], label: "Mostrar ou ocultar esta lista" },
      { keys: ["Ctrl", "`"], label: "Console RPC" },
      { keys: ["Alt", "T"], label: "Mostrar ou ocultar a lista de tarefas" },
      { keys: ["Alt", "W"], label: "Visão geral das worktrees (Orca)" },
    ],
  },
];

// ---------------------------------------- conversation search + palette

// Accent- and case-insensitive form of a text with the same length as its NFC form, so a match
// position in the folded text is a valid position in the original (see searchSnippet).
export function foldText(text) {
  return String(text ?? "").normalize("NFC").replace(/[\s\S]/gu, (ch) => {
    const folded = ch.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    return folded.length === ch.length ? folded : ch;
  });
}

// First match of an already folded query, with up to `radius` characters of context per side.
// "" when the text does not contain it.
export function searchSnippet(text, foldedQuery, radius = 60) {
  const source = String(text ?? "").normalize("NFC");
  const at = foldedQuery ? foldText(source).indexOf(foldedQuery) : -1;
  if (at === -1) return "";
  const start = Math.max(0, at - radius);
  const end = Math.min(source.length, at + foldedQuery.length + radius);
  const body = source.slice(start, end).replace(/\s+/g, " ").trim();
  return `${start > 0 ? "…" : ""}${body}${end < source.length ? "…" : ""}`;
}

// Palette ranking over { label, sub?, keywords? }: label prefix, then a word prefix, then a label
// substring, then sub/keywords; ties keep the given order. An empty query keeps everything.
export function rankPalette(items, query, limit = 30) {
  const needle = foldText(query).trim();
  if (!needle) return items.slice(0, limit);
  const scored = [];
  items.forEach((item) => {
    const label = foldText(item.label);
    const score = label.startsWith(needle) ? 0
      : label.split(/[\s/\\._-]+/).some((word) => word.startsWith(needle)) ? 1
        : label.includes(needle) ? 2
          : foldText([item.sub, item.keywords].filter(Boolean).join(" ")).includes(needle) ? 3 : -1;
    if (score >= 0) scored.push({ item, score });
  });
  return scored.sort((a, b) => a.score - b.score).slice(0, limit).map((entry) => entry.item);
}

// groups: [{ title, items, limit?, raw? }]. `raw` groups (server search hits) are already matched
// and are not re-ranked. Empty sections are dropped.
export function paletteSections(groups, query) {
  return groups
    .map(({ title, items, limit, raw }) => ({ title, items: raw ? items.slice(0, limit) : rankPalette(items, query, limit) }))
    .filter((section) => section.items.length);
}

// ------------------------------------------------------------- settings

export const SETTINGS_KEY = "pi-studio:settings";
export const SETTING_OPTIONS = { fontSize: ["small", "medium", "large"], chatWidth: ["normal", "wide"] };
export const DEFAULT_SETTINGS = { fontSize: "medium", chatWidth: "normal", reduceMotion: false, orcaEnabled: null, orcaChosen: false, orcaFollow: false };

// `orcaEnabled` is null until the user chooses: the integration then follows whether Orca is available.
export function orcaEnabledNow(settings, available) {
  return settings.orcaEnabled ?? available === true;
}

// Stored JSON (or null) -> a complete, validated settings object; unknown or corrupt values fall back.
export function parseSettings(raw) {
  let stored = null;
  try {
    stored = JSON.parse(raw);
  } catch {
    // Corrupt or missing: defaults.
  }
  const settings = { ...DEFAULT_SETTINGS };
  if (!stored || typeof stored !== "object") return settings;
  for (const [key, options] of Object.entries(SETTING_OPTIONS)) {
    if (options.includes(stored[key])) settings[key] = stored[key];
  }
  settings.reduceMotion = stored.reduceMotion === true;
  // Settings saved before the toggle existed carry orcaEnabled:false by default; only a choice made
  // with the toggle (orcaChosen) counts, so the integration still turns on by itself for them.
  settings.orcaChosen = stored.orcaChosen === true && typeof stored.orcaEnabled === "boolean";
  settings.orcaEnabled = settings.orcaChosen ? stored.orcaEnabled : null;
  settings.orcaFollow = stored.orcaFollow === true;
  return settings;
}

// <html> data attributes the stylesheet keys on (public/boot.js applies the same mapping before first paint).
export function settingsAttributes(settings) {
  return { font: settings.fontSize, width: settings.chatWidth, motion: settings.reduceMotion ? "reduce" : "normal" };
}

// ------------------------------------------------- message actions (fork)

const squash = (text) => String(text ?? "").replace(/\s+/g, " ").trim();

// Pairs the thread's user messages with PI's get_fork_messages by order. The first user message whose
// text differs from its fork counterpart (and everything after) gets no id: a wrong id would fork from
// the wrong point, so the action is hidden instead.
export function forkEntryIds(userTexts, forkMessages) {
  const forks = Array.isArray(forkMessages) ? forkMessages : [];
  const ids = [];
  let aligned = true;
  userTexts.forEach((text, index) => {
    const fork = forks[index];
    aligned = aligned && typeof fork?.entryId === "string" && squash(fork.text) === squash(text);
    ids.push(aligned ? fork.entryId : null);
  });
  return ids;
}

// Toolbar buttons of a thread item. `ctx`: { streaming, busy, lastAssistant, retryId }.
// Edit/retry need a verified fork point and no images (a fork returns text only).
export function messageActions(item, ctx = {}) {
  const off = Boolean(ctx.streaming || ctx.busy);
  const plain = !item.images?.length;
  if (item.kind === "user") {
    const actions = [{ id: "copy", label: "Copiar", disabled: false }];
    if (item.entryId && plain && !item.optimistic) actions.push({ id: "edit", label: "Editar", disabled: off });
    return actions;
  }
  const actions = [{ id: "copy", label: "Copiar", disabled: false }];
  if (ctx.lastAssistant && ctx.retryId) actions.push({ id: "retry", label: "Tentar de novo", disabled: off });
  return actions;
}

// ------------------------------------------------------------- task list

const TODO_STATUSES = ["pending", "in_progress", "completed", "deleted"];

// Mirrors @juicesharp/rpiv-todo state/replay.ts isTaskDetails: a full snapshot has tasks[] and a numeric nextId.
export function isTodoDetails(value) {
  return Boolean(value) && typeof value === "object" && Array.isArray(value.tasks) && typeof value.nextId === "number";
}

function cleanTasks(tasks) {
  return tasks
    .filter((task) => task && typeof task === "object" && Number.isFinite(task.id) && typeof task.subject === "string" && TODO_STATUSES.includes(task.status))
    .map((task) => ({ id: task.id, subject: task.subject, status: task.status, activeForm: typeof task.activeForm === "string" ? task.activeForm : "" }));
}

// Snapshot carried by one successful `todo` result (tool_execution_end event or toolResult message), else null.
export function todoSnapshot(result) {
  if (!result || result.toolName !== "todo" || result.isError || !isTodoDetails(result.details)) return null;
  return cleanTasks(result.details.tasks);
}

// Last-write-wins over a message list, like replayFromBranch; null when the session never used `todo`.
export function todoFromMessages(messages) {
  let latest = null;
  for (const message of Array.isArray(messages) ? messages : []) {
    const snapshot = message?.role === "toolResult" ? todoSnapshot(message) : null;
    if (snapshot) latest = snapshot;
  }
  return latest;
}

// Checklist data for the pinned panel: deleted tasks are hidden, `current` is the first in-progress one.
export function todoSummary(tasks) {
  const visible = (Array.isArray(tasks) ? tasks : []).filter((task) => task.status !== "deleted");
  const done = visible.filter((task) => task.status === "completed").length;
  const current = visible.find((task) => task.status === "in_progress");
  return { tasks: visible, done, total: visible.length, current: current ? current.activeForm || current.subject : "" };
}

// ------------------------------------------------- notifications + status

export const NOTIFY_KEY = "pi-studio:notify";

// Stored as "0"/"1"; anything else (unset, corrupt) means the default: on.
export function notifyEnabled(stored) {
  return stored !== "0";
}

// Only when the user cannot see the page, the preference is on and the browser allows it.
export function shouldNotify({ enabled, permission, hidden, focused }) {
  return Boolean(enabled) && permission === "granted" && (Boolean(hidden) || !focused);
}

function firstLine(text) {
  return String(text ?? "").split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "";
}

export function notificationContent(kind, { project = "", text = "", title = "" } = {}) {
  if (kind === "input") return { title: "PI precisa da sua resposta", body: truncate(firstLine(title) || firstLine(text), 140) };
  return { title: `PI terminou em ${project || "o projeto"}`, body: truncate(firstLine(text), 140) };
}

// Sidebar dot: waiting for an answer beats finished-unseen; "running" stays with the existing indicator.
export function attentionState({ waiting, unseen }) {
  if (waiting) return "waiting";
  return unseen ? "unseen" : "";
}

// ------------------------------------------------------- extension dialogs

export function createUiResponder(requestId, sendResponse) {
  // Um envio por vez: chamadas concorrentes aguardam o mesmo envio e falham
  // junto, para nenhum handler fechar o diálogo antes de o PI receber resposta.
  let inFlight = null;
  let responded = false;
  const respond = (payload) => {
    if (responded) return Promise.resolve();
    if (inFlight) return inFlight;
    inFlight = (async () => {
      try {
        await sendResponse(requestId, payload);
        responded = true;
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  };
  return {
    respond,
    cancel(event) {
      event.preventDefault();
      return respond({ cancelled: true });
    },
  };
}

export function updateProcessExitUi(exit, elements) {
  const message = Number.isInteger(exit.code)
    ? exit.code === 0
      ? "PI encerrado (código 0)"
      : `PI encerrado (código ${exit.code}, erro)`
    : exit.signal
      ? `PI encerrado (sinal ${exit.signal})`
      : "PI encerrado";
  elements.status.textContent = message;
  elements.status.classList.remove("hidden");
  elements.prompt.disabled = true;
  elements.action.disabled = true;
  elements.restart.textContent = "Reiniciar PI";
}

export function samePath(a, b) {
  if (!a || !b) return false;
  const norm = (value) => String(value).replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  return norm(a) === norm(b);
}

// --------------------------------------------------------------- inspector

export const INSPECTOR_TABS = ["terminal", "subagents", "context", "files", "worktrees"];

// The Worktrees tab exists only while the Orca integration is on.
export function visibleInspectorTabs(settings) {
  return INSPECTOR_TABS.filter((tab) => tab !== "worktrees" || settings.orcaEnabled === true);
}

export function resolveInspectorTab(saved, settings) {
  return visibleInspectorTabs(settings).includes(saved) ? saved : "terminal";
}

// Roving focus for role="tablist": returns the tab index to activate, or null for other keys.
export function tabKeyTarget(key, index, count) {
  if (!count) return null;
  if (key === "ArrowRight" || key === "ArrowDown") return (index + 1) % count;
  if (key === "ArrowLeft" || key === "ArrowUp") return (index - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

export function clampPanelWidth(width, viewport, { min = 320, maxRatio = 0.6, fallback = 460 } = {}) {
  const max = Math.max(min, Math.floor(viewport * maxRatio));
  const value = Number(width);
  const wanted = Number.isFinite(value) && value > 0 ? value : fallback;
  return Math.round(Math.min(max, Math.max(min, wanted)));
}

export function splitLines(text) {
  const value = String(text ?? "").replace(/\r\n?/g, "\n").replace(/\n$/, "");
  return value ? value.split("\n") : [];
}

// Keeps the DOM light: only the newest `max` lines of a long output are rendered.
export function capTail(lines, max = 400) {
  if (lines.length <= max) return { hidden: 0, lines };
  return { hidden: lines.length - max, lines: lines.slice(lines.length - max) };
}

const termLine = (text, cls = "") => ({ text, cls });

// The call line PI's TUI prints for a tool, with the complete arguments.
export function terminalToolHead(name, args) {
  const a = args && typeof args === "object" ? args : {};
  const kind = toolKind(name);
  const label = String(name || "ferramenta");
  const target = toolPath(a);
  if (kind === "command") {
    const [first = "", ...rest] = splitLines(a.command);
    return [termLine(`$ ${first}`, "cmd"), ...rest.map((text) => termLine(`  ${text}`, "cmd"))];
  }
  if (kind === "read") {
    const start = Number(a.offset) || 1;
    const end = a.limit ? `-${start + Number(a.limit) - 1}` : "";
    return [termLine(`read ${target}${a.offset || a.limit ? `:${start}${end}` : ""}`, "cmd")];
  }
  if (kind === "edit" || kind === "write") return [termLine(`${kind} ${target}`, "cmd")];
  if (kind === "search") return [termLine([label, a.pattern, target, a.glob].filter(Boolean).join(" "), "cmd")];
  const json = Object.keys(a).length ? JSON.stringify(a, null, 2) : "";
  return [termLine(label, "cmd"), ...splitLines(json).map((text) => termLine(text, "args"))];
}

// pi-subagents AgentDetails (src/ui/agent-widget.ts) -> the stats PI prints next to a subagent.
export function subagentStats(details = {}) {
  const parts = [];
  if (details.modelName) parts.push(details.modelName);
  if (Array.isArray(details.tags)) parts.push(...details.tags);
  if (details.turnCount > 0) parts.push(`↻ ${details.turnCount}${details.maxTurns ? `/${details.maxTurns}` : ""}`);
  if (details.toolUses > 0) parts.push(plural(details.toolUses, "ferramenta", "ferramentas"));
  if (details.tokens) parts.push(details.tokens);
  if (details.cost > 0) parts.push(`US$ ${details.cost.toFixed(2)}`);
  return parts;
}

export function terminalToolBody(tool, max = 400) {
  const kind = toolKind(tool.name);
  const details = tool.result?.details;
  let lines;
  if ((kind === "edit" || kind === "write") && !tool.isError) {
    lines = diffLines(tool).map((item) => termLine(item.text, item.type));
  } else if (tool.status === "running" && details?.status === "running") {
    lines = [termLine(subagentStats(details).join(" · "), "dim"), termLine(`└ ${details.activity || "pensando…"}`, "out")];
  } else {
    lines = splitLines(toolResultText(tool.result)).map((text) => termLine(text, tool.isError ? "err" : "out"));
  }
  if (tool.isError && !lines.length) lines.push(termLine("✗ falhou", "err"));
  return capTail(lines, max);
}

function blockSignature(block) {
  let chars = 0;
  for (const item of [...block.head, ...block.lines]) chars += item.text.length;
  return `${block.kind}|${block.status}|${block.hidden}|${block.head.length}|${block.lines.length}|${chars}`;
}

// The same conversation as the chat, flattened in protocol order the way PI's TUI prints it.
// notices: [{ id, at, level, text }] are live-only lines, placed before messages[at].
export function buildTerminal(messages = [], runtime = new Map(), notices = [], max = 400) {
  const blocks = [];
  const tools = new Map();
  const queue = [...notices].sort((a, b) => a.at - b.at);
  let next = 0;
  const flush = (limit) => {
    while (next < queue.length && queue[next].at <= limit) {
      const notice = queue[next++];
      blocks.push({ key: `n:${notice.id}`, kind: "notice", lines: [termLine(notice.text, notice.level)] });
    }
  };
  const addTool = (key, tool) => {
    tools.set(tool.id, tool);
    blocks.push({ key, kind: "tool", tool });
  };
  const newTool = (id, name, args) => ({ id, name, args, status: "pending", result: null, isError: false });

  messages.forEach((message, mi) => {
    flush(mi);
    switch (message?.role) {
      case "user": {
        const text = splitLines(messageText(message));
        const images = messageImages(message).length;
        const lines = (text.length ? text : [""]).map((value, index) => termLine(`${index ? "  " : "> "}${value}`, "user"));
        if (images) lines.push(termLine(`  [${plural(images, "imagem", "imagens")}]`, "dim"));
        blocks.push({ key: `u:${mi}`, kind: "user", lines });
        break;
      }
      case "assistant": {
        const parts = Array.isArray(message.content) ? message.content : [{ type: "text", text: String(message.content ?? "") }];
        parts.forEach((part, pi) => {
          if (part?.type === "thinking" && part.thinking?.trim()) {
            blocks.push({ key: `k:${mi}.${pi}`, kind: "thinking", lines: splitLines(part.thinking).map((text) => termLine(text, "think")) });
          } else if (part?.type === "text" && part.text?.trim()) {
            blocks.push({ key: `a:${mi}.${pi}`, kind: "assistant", lines: splitLines(part.text).map((text) => termLine(text)) });
          } else if (part?.type === "toolCall") {
            addTool(`t:${mi}.${pi}`, newTool(part.id || `${mi}.${pi}`, part.name, part.arguments || {}));
          }
        });
        if (message.stopReason === "error" && message.errorMessage) {
          blocks.push({ key: `e:${mi}`, kind: "notice", lines: [termLine(`✗ ${message.errorMessage}`, "err")] });
        } else if (message.stopReason === "aborted") {
          blocks.push({ key: `e:${mi}`, kind: "notice", lines: [termLine("■ Interrompido", "warn")] });
        }
        break;
      }
      case "toolResult": {
        let tool = tools.get(message.toolCallId);
        if (!tool) addTool(`r:${mi}`, (tool = newTool(message.toolCallId || `r${mi}`, message.toolName, {})));
        tool.result = { content: message.content, details: message.details };
        tool.isError = Boolean(message.isError);
        tool.status = tool.isError ? "error" : "done";
        break;
      }
      case "bashExecution": {
        const outcome = bashState(message);
        const tool = newTool(`b:${mi}`, "bash", { command: message.command });
        Object.assign(tool, { status: outcome === "cancelled" ? "error" : outcome, isError: outcome === "error" || outcome === "cancelled", result: { content: [{ type: "text", text: message.output || "" }] } });
        addTool(`b:${mi}`, tool);
        break;
      }
      case "custom":
        if (message.display === false) break;
        blocks.push({
          key: `c:${mi}`,
          kind: "custom",
          lines: [termLine(`[${message.customType || "extensão"}]`, "dim"), ...splitLines(messageText(message)).map((text) => termLine(text, "out"))],
        });
        break;
      case "compactionSummary":
      case "branchSummary":
        blocks.push({
          key: `d:${mi}`,
          kind: "divider",
          lines: [termLine(message.role === "branchSummary" ? "Resumo do ramo" : "Contexto compactado", "rule"), ...splitLines(message.summary).map((text) => termLine(text, "dim"))],
        });
        break;
    }
  });

  for (const [id, live] of runtime) {
    let tool = tools.get(id);
    if (!tool) addTool(`l:${id}`, (tool = newTool(id, live.name, live.args || {})));
    if (tool.status === "pending" || tool.status === "running") {
      tool.status = live.status;
      tool.result = live.result ?? live.partial ?? tool.result;
      tool.isError = live.status === "error";
    }
  }
  flush(Infinity);

  return blocks.map((block) => {
    const out = block.kind === "tool"
      ? { key: block.key, kind: "tool", status: block.tool.status, head: terminalToolHead(block.tool.name, block.tool.args), ...terminalToolBody(block.tool, max) }
      : { key: block.key, kind: block.kind, status: "", head: [], lines: block.lines, hidden: 0 };
    out.sig = blockSignature(out);
    return out;
  });
}

// Live-only terminal lines for protocol events that never become session entries.
export function eventNotice(event) {
  switch (event?.type) {
    case "compaction_start":
      return { level: "dim", text: `◌ Compactando contexto${event.reason ? ` (${event.reason})` : ""}…` };
    case "compaction_end": {
      if (event.aborted) return { level: "warn", text: "■ Compactação interrompida" };
      if (event.errorMessage) return { level: "err", text: `✗ Falha ao compactar: ${event.errorMessage}` };
      const result = event.result || {};
      const after = typeof result.estimatedTokensAfter === "number" ? ` → ~${formatTokens(result.estimatedTokensAfter)}` : "";
      return { level: "dim", text: `◆ Contexto compactado${typeof result.tokensBefore === "number" ? `: ${formatTokens(result.tokensBefore)}${after} tokens` : ""}` };
    }
    case "auto_retry_start":
      return { level: "warn", text: `↻ Nova tentativa ${event.attempt}/${event.maxAttempts} em ${formatElapsed(event.delayMs)}${event.errorMessage ? ` · ${event.errorMessage}` : ""}` };
    case "auto_retry_end":
      return event.success
        ? { level: "dim", text: `↻ Tentativa ${event.attempt} bem-sucedida` }
        : { level: "err", text: `✗ Falhou após ${event.attempt} tentativas: ${event.finalError || "erro desconhecido"}` };
    case "extension_error":
      return { level: "err", text: `✗ Erro de extensão: ${event.error}` };
    case "extension_ui_request":
      if (event.method !== "notify") return null;
      return { level: event.notifyType === "error" ? "err" : event.notifyType === "warning" ? "warn" : "info", text: `• ${stripAnsi(event.message)}` };
    default:
      return null;
  }
}

// ------------------------------------------------------------- subagents

// Tool names registered by @tintinweb/pi-subagents (src/agent-runner.ts SUBAGENT_TOOL_NAMES).
export const SUBAGENT_TOOLS = { agent: "Agent", result: "get_subagent_result", steer: "steer_subagent" };

export function subagentPhase(status) {
  if (status === "running" || status === "queued" || status === "background") return "running";
  if (status === "completed" || status === "steered") return "done";
  return "error";
}

function stamp(value) {
  const time = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

// Final records the extension appends as `subagents:record` custom entries (src/index.ts).
export function subagentRecords(entries) {
  const records = new Map();
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (entry?.type === "custom" && entry.customType === "subagents:record" && entry.data?.id) records.set(entry.data.id, entry.data);
  }
  return records;
}

function lastLines(text, count) {
  return splitLines(text).filter((value) => value.trim()).slice(-count);
}

// One entry per Agent tool call, merged with live partial results, completion notifications
// (custom message "subagent-notification") and persisted records. Running runs first, newest first.
export function collectSubagents(messages = [], runtime = new Map(), records = new Map(), now = Date.now(), stallMs = STALL_SUBAGENT_MS) {
  const runs = [];
  const byCall = new Map();
  const notes = new Map();
  const noteAt = new Map();
  const extras = [];
  const extraByCall = new Map();

  messages.forEach((message, mi) => {
    if (message?.role === "assistant" && Array.isArray(message.content)) {
      message.content.forEach((part, pi) => {
        if (part?.type !== "toolCall") return;
        const args = part.arguments || {};
        if (part.name === SUBAGENT_TOOLS.agent) {
          const run = { key: `sa:${mi}.${pi}`, args, startedAt: stamp(message.timestamp), progressAt: null, endedAt: null, result: null, isError: false, live: false };
          runs.push(run);
          byCall.set(part.id, run);
        } else if (part.name === SUBAGENT_TOOLS.steer || part.name === SUBAGENT_TOOLS.result) {
          const steer = part.name === SUBAGENT_TOOLS.steer;
          const extra = { ref: String(args.agent_id ?? ""), label: steer ? "Direcionamento" : "Consulta de resultado", text: steer ? String(args.message ?? "") : "" };
          extras.push(extra);
          extraByCall.set(part.id, extra);
        }
      });
    } else if (message?.role === "toolResult") {
      const run = byCall.get(message.toolCallId);
      if (run) {
        run.result = { content: message.content, details: message.details };
        run.isError = Boolean(message.isError);
      }
      const extra = extraByCall.get(message.toolCallId);
      if (extra && !extra.text) extra.text = toolResultText(message);
    } else if (message?.role === "custom" && message.customType === "subagent-notification" && message.details) {
      for (const note of [message.details, ...(Array.isArray(message.details.others) ? message.details.others : [])]) {
        if (!note?.id) continue;
        notes.set(note.id, note);
        noteAt.set(note.id, stamp(message.timestamp));
      }
    }
  });

  for (const [id, live] of runtime) {
    if (live.name !== SUBAGENT_TOOLS.agent) continue;
    let run = byCall.get(id);
    if (!run) {
      run = { key: `sa:live:${id}`, args: live.args || {}, startedAt: null, progressAt: null, endedAt: null, result: null, isError: false, live: false };
      runs.push(run);
      byCall.set(id, run);
    }
    if (live.startedAt) run.startedAt = live.startedAt;
    run.progressAt = live.updatedAt ?? live.startedAt ?? null;
    run.endedAt = live.endedAt ?? null;
    if (run.result) continue;
    run.result = live.result ?? live.partial ?? null;
    run.isError = live.status === "error";
    run.live = live.status === "running";
  }

  const out = runs.map((run, order) => {
    const args = run.args;
    const details = run.result?.details || {};
    const agentId = details.agentId || "";
    const note = notes.get(agentId);
    const record = records.get(agentId);
    const status = run.isError ? "error" : note?.status || record?.status || details.status || (run.result ? "error" : "running");
    const phase = subagentPhase(status);
    const output = toolResultText(run.result);
    const inFlight = run.live || details.status === "running" || details.status === "background" || !run.result;
    const resultText = record?.result || note?.resultPreview || (inFlight ? "" : output);
    const errorText = note?.error || record?.error || details.error || "";
    const startedAt = record?.startedAt ?? run.startedAt;
    const endedAt = phase === "running" ? null : stamp(record?.completedAt) ?? noteAt.get(agentId) ?? run.endedAt;

    let elapsed;
    if (note) elapsed = note.durationMs || 0;
    else if (record?.completedAt && record.startedAt) elapsed = record.completedAt - record.startedAt;
    else if (phase === "running" && startedAt) elapsed = Math.max(0, now - startedAt);
    else elapsed = details.durationMs || 0;

    let tail;
    if (phase === "running") {
      tail = [details.status === "running" ? `└ ${details.activity || "pensando…"}` : details.status === "background" ? `Em segundo plano · ${agentId}` : "Aguardando início…"];
    } else if (phase === "error") {
      tail = errorText ? [errorText] : lastLines(output, 3);
    } else {
      tail = lastLines(resultText, 3);
    }

    const sections = [];
    if (args.prompt) sections.push({ label: "Tarefa", text: String(args.prompt) });
    if (details.status === "background" && output) sections.push({ label: "Início", text: output });
    if (resultText) sections.push({ label: "Resultado", text: resultText });
    if (phase === "error" && errorText) sections.push({ label: "Erro", text: errorText });
    if (note?.outputFile) sections.push({ label: "Transcrição completa", text: note.outputFile });

    const stats = note
      ? { ...details, toolUses: note.toolUses, turnCount: note.turnCount, maxTurns: note.maxTurns, cost: note.totalCost, tokens: note.totalTokens ? `${formatTokens(note.totalTokens)} tokens` : details.tokens }
      : details;
    return {
      key: run.key,
      agentId,
      name: String(args.name || ""),
      title: String(args.name || details.displayName || args.subagent_type || "Agente"),
      type: String(details.subagentType || args.subagent_type || ""),
      description: String(args.description || details.description || note?.description || ""),
      model: String(details.modelName || args.model || ""),
      stats: subagentStats(stats),
      status,
      phase,
      background: details.status === "background",
      elapsed,
      startedAt,
      endedAt,
      stalled: phase === "running" && run.live ? stallLabel(stalledMinutes(run.progressAt, stallMs, now)) : null,
      tail,
      sections,
      order,
    };
  });

  // steer_subagent / get_subagent_result address an agent by id, name or type (src/index.ts resolveAgentRef).
  for (const extra of extras) {
    const ref = extra.ref.toLowerCase();
    const target = ref && out.findLast((run) => [run.agentId, run.name, run.type].some((value) => value && value.toLowerCase() === ref));
    if (target) target.sections.push({ label: extra.label, text: extra.text });
  }

  return out.sort((a, b) => {
    const running = Number(b.phase === "running") - Number(a.phase === "running");
    return running || b.order - a.order;
  });
}

// ---------------------------------------------------------------- context

export function contextBreakdown(stats, session) {
  const num = (value) => (typeof value === "number" && Number.isFinite(value) ? value : null);
  const tokens = stats?.tokens || {};
  const parts = [["Entrada", tokens.input], ["Saída", tokens.output], ["Cache lido", tokens.cacheRead], ["Cache gravado", tokens.cacheWrite]]
    .filter(([, value]) => num(value) !== null)
    .map(([label, value]) => ({ label, value }));
  const sum = parts.reduce((acc, part) => acc + part.value, 0);
  for (const part of parts) part.share = sum ? part.value / sum : 0;
  const counts = [["Mensagens suas", stats?.userMessages], ["Respostas do PI", stats?.assistantMessages], ["Chamadas de ferramenta", stats?.toolCalls], ["Total de mensagens", stats?.totalMessages]]
    .filter(([, value]) => num(value) !== null)
    .map(([label, value]) => ({ label, value }));
  const model = session?.model;
  return {
    usage: contextUsage(stats),
    parts,
    total: num(tokens.total),
    cost: num(stats?.cost),
    counts,
    model: model ? modelLabel(model) : "",
    provider: model?.provider || "",
    thinking: model && model.reasoning !== false && session.thinkingLevel ? thinkingLabel(session.thinkingLevel) : "",
    sessionFile: stats?.sessionFile || session?.sessionFile || "",
  };
}

// ------------------------------------------------------ Orca worktrees

const ORCA_STATUS_LABELS = { working: "trabalhando", active: "ativa", inactive: "inativa", done: "concluída" };
const ORCA_LIST_MAX = 200;
const ORCA_AGENTS_MAX = 20;
const orcaText = (value, max) => truncate(squash(value), max);
const isRecord = (value) => value !== null && typeof value === "object";

export function orcaBranch(ref) {
  return String(ref ?? "").replace(/^refs\/heads\//, "");
}

// Orca links an issue/PR as a bare number or as { number, state }.
function orcaRef(value) {
  const number = isRecord(value) ? value.number : value;
  return Number.isInteger(number) ? { number, state: orcaText(value.state, 20) } : null;
}

function orcaAgent(agent) {
  return {
    state: orcaText(agent.state, 20),
    type: orcaText(agent.agentType, 20),
    title: orcaText(agent.taskTitle || agent.displayName || firstLine(agent.prompt), 80),
    lastMessage: orcaText(agent.lastAssistantMessage, 200),
    interrupted: agent.interrupted === true,
  };
}

function orcaWorktree(worktree) {
  return {
    id: orcaText(worktree.worktreeId, 400),
    name: orcaText(worktree.displayName, 120) || basename(worktree.path),
    repo: orcaText(worktree.repo, 120),
    path: worktree.path,
    branch: orcaBranch(worktree.branch),
    status: orcaText(worktree.status, 20),
    active: worktree.isActive === true,
    unread: worktree.unread === true,
    linkedIssue: orcaRef(worktree.linkedIssue),
    linkedPR: orcaRef(worktree.linkedPR),
    comment: orcaText(worktree.comment, 200),
    terminals: Number.isInteger(worktree.liveTerminalCount) && worktree.liveTerminalCount > 0 ? worktree.liveTerminalCount : 0,
    lastActivityAt: Number.isFinite(worktree.lastActivityAt) ? worktree.lastActivityAt : 0,
    agents: (Array.isArray(worktree.agents) ? worktree.agents : []).filter(isRecord).slice(0, ORCA_AGENTS_MAX).map(orcaAgent),
  };
}

// `orca worktree ps --json` -> the summary PI Studio serves; { ok: false } when the shape is unexpected.
export function normalizeOrca(raw) {
  const list = raw?.result?.worktrees;
  if (raw?.ok !== true || !Array.isArray(list)) return { ok: false };
  const worktrees = list
    .filter((worktree) => isRecord(worktree) && typeof worktree.path === "string" && worktree.path)
    .slice(0, ORCA_LIST_MAX)
    .map(orcaWorktree);
  const active = worktrees.find((worktree) => worktree.active);
  return { ok: true, active: active ? { path: active.path } : null, worktrees };
}

// "2 agentes · trabalhando" plus the most relevant one-line message.
export function agentsSummary(agents) {
  if (!agents.length) return { line: "", message: "" };
  const working = agents.filter((agent) => agent.state === "working").length;
  let state = "em espera";
  if (working) state = working === agents.length ? "trabalhando" : `${working} trabalhando`;
  else if (agents.every((agent) => agent.state === "done")) state = "concluído";
  const message = agents.findLast((agent) => agent.lastMessage)?.lastMessage || agents.find((agent) => agent.state === "working")?.title || "";
  return { line: `${plural(agents.length, "agente", "agentes")} · ${state}`, message };
}

// The Orca-active worktree first, then the ones with a working agent, then the most recently active.
export function sortWorktrees(list) {
  const rank = (worktree) => (worktree.active ? 0 : worktree.status === "working" ? 1 : 2);
  return [...list].sort((a, b) => rank(a) - rank(b) || b.lastActivityAt - a.lastActivityAt);
}

// Everything a Worktrees row shows.
export function worktreeRow(worktree) {
  const { line, message } = agentsSummary(worktree.agents);
  const refs = [];
  if (worktree.linkedIssue) refs.push(`#${worktree.linkedIssue.number}`);
  if (worktree.linkedPR) refs.push(`PR #${worktree.linkedPR.number}${worktree.linkedPR.state ? ` · ${worktree.linkedPR.state}` : ""}`);
  return {
    name: worktree.name,
    sub: worktree.branch || basename(worktree.path),
    statusLabel: ORCA_STATUS_LABELS[worktree.status] || worktree.status || "—",
    running: worktree.status === "working",
    agents: line,
    message,
    meta: [worktree.repo, ...refs].filter(Boolean),
    unread: worktree.unread,
    active: worktree.active,
  };
}

// Follow mode: "switch" opens the Orca-active worktree; "wait" defers while the user is typing or a dialog is open;
// "mark" records that the current project already is that worktree; "none" does nothing. `lastFollowed` keeps a
// manual project choice from being undone by the next poll.
export function followDecision({ enabled, activePath, lastFollowed, currentPath, composerText, dialogOpen }) {
  if (!enabled || !activePath || samePath(activePath, lastFollowed)) return "none";
  if (samePath(activePath, currentPath)) return "mark";
  return composerText || dialogOpen ? "wait" : "switch";
}

// Orca is polled only while something on screen needs it.
export function orcaPollWanted({ enabled, follow, tabVisible, hidden }) {
  return enabled === true && !hidden && (follow === true || tabVisible === true);
}

// Sidebar dot update for a project that is NOT open (the open one is driven by its own event stream).
// `prev`/`next`: entries of /api/projects/status. Returns the attention patch or null.
export function statusAttention(prev, next, isCurrent) {
  if (!next || isCurrent) return null;
  const waiting = next.waitingUi === true;
  const finished = prev?.streaming === true && next.streaming !== true && !waiting && next.exited !== true;
  return finished ? { waiting, unseen: true } : { waiting };
}

// ------------------------------------------- conversation + worktree states

const STATE_LABELS = { pronto: "pronto", fazendo: "fazendo", parado: "parado", erro: "erro", aguardando: "aguardando" };

// Sidebar indicator of a conversation; "nova" (or an unknown state) shows nothing.
export function sessionStateBadge(item) {
  const label = STATE_LABELS[item?.state];
  if (!label) return null;
  return { state: item.state, label, aria: `Estado: ${label}` };
}

export function sessionTooltip(item) {
  const badge = sessionStateBadge(item);
  return [item.title || "Nova conversa", item.isSubagent ? "sub-PI" : "", badge?.label].filter(Boolean).join(" · ");
}

// The open project's history is re-read while a conversation is running or waiting for an answer, and only in a visible page.
export function historyPollWanted(history, hidden) {
  return !hidden && history.some((item) => item.state === "fazendo" || item.state === "aguardando");
}

// Orca agent -> the shared state vocabulary (key styles the dot, label is shown). Unknown states keep their own text.
export function orcaAgentState(agent) {
  if (agent.interrupted) return { key: "parado", label: "parado" };
  const key = { working: "fazendo", done: "pronto", blocked: "aguardando", waiting: "aguardando", error: "erro", failed: "erro", idle: "parado" }[agent.state];
  if (!key) return { key: "", label: agent.state || "—" };
  return { key, label: key === "fazendo" ? "trabalhando" : key };
}

// PI Studio's own PI for a worktree (an entry of /api/projects/status), or null when none runs.
export function studioPiState(status) {
  if (!status) return null;
  if (status.exited) return "parado";
  if (status.waitingUi) return "aguardando";
  return status.streaming ? "fazendo" : "pronto";
}

// Case- and accent-insensitive filter over name, branch and repo.
export function filterWorktrees(list, query) {
  const needle = foldText(query).trim();
  if (!needle) return list;
  return list.filter((worktree) => foldText([worktree.name, worktree.branch, worktree.repo].join(" ")).includes(needle));
}

// Groups by repository; the repository of the best-ranked worktree (see sortWorktrees) comes first.
export function groupWorktrees(list) {
  const groups = new Map();
  for (const worktree of sortWorktrees(list)) {
    const repo = worktree.repo || "Sem repositório";
    if (!groups.has(repo)) groups.set(repo, []);
    groups.get(repo).push(worktree);
  }
  return [...groups].map(([repo, worktrees]) => ({ repo, worktrees }));
}

// Everything a row of the Worktrees overview shows; `status` is the worktree's project status, if it has one.
export function worktreeDetail(worktree, status, now = Date.now(), stallMs = STALL_PI_MS) {
  const row = worktreeRow(worktree);
  const studio = studioPiState(status);
  return {
    name: row.name,
    sub: row.sub,
    statusLabel: row.statusLabel,
    running: row.running,
    active: row.active,
    unread: row.unread,
    issue: worktree.linkedIssue ? `#${worktree.linkedIssue.number}` : "",
    pr: worktree.linkedPR ? `PR #${worktree.linkedPR.number}${worktree.linkedPR.state ? ` · ${worktree.linkedPR.state}` : ""}` : "",
    comment: worktree.comment,
    terminals: worktree.terminals ? plural(worktree.terminals, "terminal", "terminais") : "",
    lastActivity: worktree.lastActivityAt ? relativeTime(worktree.lastActivityAt, now) : "",
    studio: studio ? { key: studio, label: `PI do Studio: ${studio}` } : null,
    stalled: stalledPi(status, now, stallMs),
    agents: worktree.agents.map((agent) => ({ ...orcaAgentState(agent), title: agent.title || agent.type || "agente", message: agent.lastMessage })),
  };
}

// Arrow-key step with wrap-around over `count` items.
export function stepIndex(index, delta, count) {
  return count ? (index + delta + count) % count : 0;
}

// ------------------------------------------------------------ count badges

// Text of a count badge: nothing for 0 (or a non-count), "99+" past two digits.
export function countBadge(count) {
  if (!Number.isInteger(count) || count < 1) return null;
  return count > 99 ? "99+" : String(count);
}

export function runningSubagentCount(runs) {
  return runs.filter((run) => run.phase === "running").length;
}

// Worktrees with an Orca agent working, or with a Studio PI mid-run. `statusOf(worktree)`: its project status entry or null.
export function runningWorktreeCount(worktrees, statusOf) {
  return worktrees.filter((worktree) => worktree.agents.some((agent) => agent.state === "working" && !agent.interrupted) || studioPiState(statusOf(worktree)) === "fazendo").length;
}

// Conversations (sub-PIs included) of a project that are running: the listed ones, or the project's live PI when the list is not loaded.
// A project that is not open has no loaded history: the server's per-project count (`serverCount`) stands in for it.
export function projectRunningCount(history, status, { open = true, serverCount = 0 } = {}) {
  const live = studioPiState(status) === "fazendo" ? 1 : 0;
  if (!open) return Math.max(serverCount, live);
  const listed = (history || []).filter((item) => item.state === "fazendo").length;
  return Math.max(listed, live);
}

// ------------------------------------------------------ visibility: stalled PIs, timing, activity feed

export const STALL_PI_MS = 3 * 60_000;
export const STALL_SUBAGENT_MS = 5 * 60_000;
export const ACTIVITY_LIMIT = 300;
export const UI_DIALOG_METHODS = new Set(["select", "confirm", "input", "editor"]);

// Thresholds are constants; PI_STUDIO_STALL_PI_MS / PI_STUDIO_STALL_SUBAGENT_MS (positive integers) override them for tests.
export function stallThresholds(env = {}) {
  const read = (raw, fallback) => (Number.isInteger(Number(raw)) && Number(raw) > 0 ? Number(raw) : fallback);
  return { piMs: read(env.PI_STUDIO_STALL_PI_MS, STALL_PI_MS), subagentMs: read(env.PI_STUDIO_STALL_SUBAGENT_MS, STALL_SUBAGENT_MS) };
}

// Whole minutes of silence once it is strictly longer than the threshold, else null (also for a missing timestamp).
export function stalledMinutes(lastAt, thresholdMs, now = Date.now()) {
  if (!Number.isFinite(lastAt)) return null;
  const idle = now - lastAt;
  return idle > thresholdMs ? Math.max(1, Math.floor(idle / 60_000)) : null;
}

export function stallLabel(minutes) {
  return minutes === null ? null : `sem atividade há ${minutes} min`;
}

// A live PI that is streaming (and not waiting for the user) without any event for longer than the threshold.
export function stalledPi(status, now = Date.now(), thresholdMs = STALL_PI_MS) {
  if (!status || status.exited || status.waitingUi || !status.streaming) return null;
  return stallLabel(stalledMinutes(status.lastEventAt, thresholdMs, now));
}

// "agora" | "há 5 min" | "há 2 h" | "em 3 de mai." (the relative helper falls back to a date past a week).
export function agoLabel(value, now = Date.now()) {
  const relative = relativeTime(value, now);
  if (relative === "" || relative === "agora") return relative;
  return /^\d+ (min|h|d)$/.test(relative) ? `há ${relative}` : `em ${relative}`;
}

// Card line of a subagent run: "rodando há 2 min 3 s" or "terminou há 4 min · levou 1 min 10 s", plus the stalled marker.
export function subagentTiming(run, now = Date.now()) {
  if (run.phase === "running") return { text: `rodando há ${formatElapsed(run.elapsed)}`, stalled: run.stalled };
  const finished = run.endedAt ? finishedLabel(run.endedAt, null, now).text : "";
  const took = run.elapsed >= 1000 ? `levou ${formatElapsed(run.elapsed)}` : "";
  return { text: [finished, took].filter(Boolean).join(" · "), stalled: null };
}

export function newActivityTracker() {
  return { turnStartedAt: null, calls: new Map(), background: new Map() };
}

const elapsedSince = (entry, now) => (entry.startedAt === null ? null : now - entry.startedAt);

function subagentEnd(entry, ok, durationMs) {
  return {
    kind: "subagent_end",
    text: `Subagente ${entry.title} ${ok ? "terminou" : "falhou"}${durationMs === null ? "" : ` · levou ${formatElapsed(durationMs)}`}`,
    name: entry.title,
    type: entry.type,
    durationMs,
    ok,
  };
}

// Notable events of one PI -> feed items (project fields are added by the server). `tracker` carries the turn start and the
// in-flight Agent calls between events; a background agent ends with a "subagent-notification" message, not with its tool call.
export function activityFromEvent(event, tracker = newActivityTracker(), now = Date.now()) {
  switch (event?.type) {
    case "agent_start":
      tracker.turnStartedAt = now;
      return [];
    case "agent_end": {
      if (event.willRetry) return [];
      const took = tracker.turnStartedAt === null ? null : now - tracker.turnStartedAt;
      tracker.turnStartedAt = null;
      return [{ kind: "turn", text: `Terminou a resposta${took === null ? "" : ` · levou ${formatElapsed(took)}`}`, durationMs: took }];
    }
    case "tool_execution_start": {
      if (event.toolName !== SUBAGENT_TOOLS.agent) return [];
      const args = event.args || {};
      const entry = { startedAt: now, title: String(args.name || args.subagent_type || "Agente"), type: String(args.subagent_type || "") };
      tracker.calls.set(event.toolCallId, entry);
      return [{ kind: "subagent_start", text: `Subagente iniciado: ${entry.title}`, name: entry.title, type: entry.type }];
    }
    case "tool_execution_end": {
      if (event.toolName !== SUBAGENT_TOOLS.agent) return [];
      const entry = tracker.calls.get(event.toolCallId) || { startedAt: null, title: "Agente", type: "" };
      tracker.calls.delete(event.toolCallId);
      const details = event.result?.details || {};
      if (!event.isError && details.status === "background" && details.agentId) {
        tracker.background.set(details.agentId, entry);
        return [];
      }
      return [subagentEnd(entry, !event.isError && subagentPhase(details.status || "completed") !== "error", elapsedSince(entry, now))];
    }
    case "message_end": {
      const message = event.message || {};
      if (message.role === "assistant") {
        return message.stopReason === "error" ? [{ kind: "error", text: `Erro do modelo: ${message.errorMessage || "desconhecido"}` }] : [];
      }
      if (message.role !== "custom" || message.customType !== "subagent-notification" || !message.details) return [];
      const notes = [message.details, ...(Array.isArray(message.details.others) ? message.details.others : [])].filter((note) => note?.id);
      return notes.map((note) => {
        const entry = tracker.background.get(note.id) || { startedAt: null, title: String(note.description || "Agente"), type: "" };
        tracker.background.delete(note.id);
        const took = Number.isFinite(note.durationMs) ? note.durationMs : elapsedSince(entry, now);
        return subagentEnd(entry, subagentPhase(note.status) !== "error", took);
      });
    }
    case "compaction_end":
      if (event.errorMessage) return [{ kind: "error", text: `Falha ao compactar: ${event.errorMessage}` }];
      return event.aborted ? [] : [{ kind: "compaction", text: "Contexto compactado" }];
    case "auto_retry_start":
      return [{ kind: "retry", text: `Nova tentativa ${event.attempt}/${event.maxAttempts}${event.errorMessage ? ` · ${event.errorMessage}` : ""}` }];
    case "auto_retry_end":
      return [event.success
        ? { kind: "retry", text: `Tentativa ${event.attempt} bem-sucedida` }
        : { kind: "error", text: `Falhou após ${event.attempt} tentativas: ${event.finalError || "erro desconhecido"}` }];
    case "extension_error":
      return [{ kind: "error", text: `Erro de extensão: ${event.error}` }];
    case "extension_ui_request":
      if (UI_DIALOG_METHODS.has(event.method) && event.id) return [{ kind: "ui_wait", text: `Aguardando sua resposta: ${truncate(stripAnsi(event.title || event.method), 80)}` }];
      return event.method === "notify" && event.notifyType === "error" ? [{ kind: "error", text: `Aviso de extensão: ${truncate(stripAnsi(event.message), 120)}` }] : [];
    case "extension_ui_response":
      return [{ kind: "ui_answered", text: "Resposta enviada" }];
    case "process_error":
      return [{ kind: "error", text: `Falha ao executar o PI: ${event.message}` }];
    case "process_exit":
      return [{ kind: "exit", text: `PI encerrado (${event.signal ? `sinal ${event.signal}` : `código ${event.code}`})` }];
    default:
      return [];
  }
}

// Errors and auto-retries only: the conversation's "Erros e tentativas" list.
export function problemsFromEvent(event, now = Date.now()) {
  return activityFromEvent(event, undefined, now).filter((item) => item.kind === "error" || item.kind === "retry").map((item) => ({ ...item, at: now }));
}

const ACTIVITY_DOTS = { turn: "pronto", subagent_start: "fazendo", ui_wait: "aguardando", retry: "aguardando", error: "erro", exit: "parado" };

// State-dot key (same vocabulary as conversations) of a feed item; "" = neutral.
export function activityDot(item) {
  if (item.kind === "subagent_end") return item.ok ? "pronto" : "erro";
  return ACTIVITY_DOTS[item.kind] ?? "";
}

export function unseenActivity(items, seenSeq) {
  return items.filter((item) => item.seq > seenSeq).length;
}

// Newest first; the filter matches project name and text, ignoring case and accents.
export function activityRows(items, query, now = Date.now()) {
  const needle = foldText(query).trim();
  return items
    .filter((item) => !needle || foldText(`${item.projectName} ${item.text}`).includes(needle))
    .map((item) => ({ seq: item.seq, projectId: item.projectId, project: item.projectName, text: item.text, ago: agoLabel(item.at, now), dot: activityDot(item) }))
    .reverse();
}

// ----------------------------------------------------------------- usage

const finiteOr = (value, fallback) => (Number.isFinite(value) ? value : fallback);

// Local calendar day ("2025-03-07") of a timestamp (ms, ISO string or Date); null when it is not a date.
export function localDay(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Adds one assistant message's `usage` to the per-day buckets { day: { cost, tokens } }. cost stays null while no message
// of that day reported one, so "no cost data" is told apart from "free".
export function addUsage(days, stampValue, usage) {
  const day = localDay(stampValue);
  if (day === null || !isRecord(usage)) return;
  const bucket = (days[day] ??= { cost: null, tokens: 0 });
  const cost = usage.cost?.total;
  if (Number.isFinite(cost)) bucket.cost = (bucket.cost ?? 0) + cost;
  bucket.tokens += finiteOr(usage.totalTokens, finiteOr(usage.input, 0) + finiteOr(usage.output, 0) + finiteOr(usage.cacheRead, 0) + finiteOr(usage.cacheWrite, 0));
}

// Sum of one day over indexed sessions (`entry.usage`): cost null when no session had cost data.
export function sumUsage(entries, day) {
  let cost = null;
  let tokens = 0;
  let sessions = 0;
  for (const entry of entries) {
    const bucket = entry.usage?.[day];
    if (!bucket) continue;
    sessions++;
    tokens += bucket.tokens;
    if (bucket.cost !== null) cost = (cost ?? 0) + bucket.cost;
  }
  return { cost, tokens, sessions };
}

// Rows of the Contexto "Hoje" block; cost is dropped when the sessions carry none (tokens only).
export function todayUsageRows(usage) {
  if (!usage) return [];
  const rows = [];
  if (usage.cost !== null) rows.push(["Custo hoje", `US$ ${usage.cost.toFixed(2)}`]);
  rows.push(["Tokens hoje", formatTokens(usage.tokens)], ["Sessões hoje", String(usage.sessions)]);
  return rows;
}

// ------------------------------------------------------ following a conversation another PI is writing

// A conversation touched this recently, still running, or run by a working Orca agent is owned elsewhere: the Studio's PI must not switch into it.
export const OWNED_RECENT_MS = 2 * 60_000;
export const WATCH_POLL_MS = 1500;
export const WATCH_ENTRY_MAX = 5000;
const TITLE_MATCH_MIN = 4;

const agentWorking = (agent) => agent.state === "working" && !agent.interrupted;

// Accent- and case-insensitive; one title being the prefix of the other counts (Orca cuts agent titles, PI derives session titles from the first prompt).
export function titleMatches(sessionTitle, agentTitle) {
  const session = squash(foldText(sessionTitle));
  const agent = squash(foldText(agentTitle));
  return Math.min(session.length, agent.length) >= TITLE_MATCH_MIN && (session.startsWith(agent) || agent.startsWith(session));
}

// The conversation a worktree should show: the Studio PI's own when it is busy (kind "live": keep what is open), else the main
// session titled like a (working first) Orca agent, else the most recently active main session. Sub-PIs are never picked.
export function pickConversation({ history = [], agents = [], liveBusy = false }) {
  if (liveBusy) return { kind: "live", item: null };
  const activity = (item) => toMs(item.lastActivity) ?? 0;
  const main = history.filter((item) => !item.isSubagent).sort((a, b) => activity(b) - activity(a));
  const ordered = [...agents].sort((a, b) => Number(agentWorking(b)) - Number(agentWorking(a)));
  for (const agent of ordered) {
    const item = main.find((candidate) => titleMatches(candidate.title, agent.title));
    if (item) return { kind: "agent", item };
  }
  return main.length ? { kind: "latest", item: main[0] } : { kind: "none", item: null };
}

// Is `item` (a history entry: path, title, state, lastActivity) being written by someone other than the Studio's PI?
// `why`: "orca" (a working agent: the one titled like it, or any when `fallback` says the title could not be matched),
// "state" (fazendo/aguardando) or "recent" (modified under OWNED_RECENT_MS ago).
export function conversationOwner({ item, agents = [], fallback = false, studioFile = null, now = Date.now() }) {
  if (!item || samePath(item.path, studioFile)) return { elsewhere: false, why: "" };
  if (agents.some((agent) => agentWorking(agent) && (fallback || titleMatches(item.title, agent.title)))) return { elsewhere: true, why: "orca" };
  if (item.state === "fazendo" || item.state === "aguardando") return { elsewhere: true, why: "state" };
  const touched = toMs(item.lastActivity);
  if (touched !== null && now - touched < OWNED_RECENT_MS) return { elsewhere: true, why: "recent" };
  return { elsewhere: false, why: "" };
}

// Text of the bar above the read-only composer; "Continuar aqui" is enabled only once nobody writes the conversation.
export function watchStatus({ elsewhere, where }) {
  if (!elsewhere) return { text: "Acompanhando — esta conversa parou; já dá para continuar aqui", canContinue: true };
  return { text: `Acompanhando — esta conversa está rodando ${where === "orca" ? "no terminal do Orca" : "em outro PI"}`, canContinue: false };
}

// Appends the entries a watch poll returned (`reset` replaces everything). Entries already known by id are skipped;
// the same array comes back when nothing is new, and only the newest `max` entries are kept.
export function mergeWatchEntries(current, incoming, { reset = false, max = WATCH_ENTRY_MAX } = {}) {
  const base = reset ? [] : current;
  const known = new Set(base.map((entry) => entry.id));
  const fresh = incoming.filter((entry) => !(typeof entry.id === "string" && known.has(entry.id)));
  if (!fresh.length && !reset) return current;
  const merged = base.concat(fresh);
  return merged.length > max ? merged.slice(-max) : merged;
}

// Thread messages of a watched file: the branch ending at its last entry, like get_entries does for the open session.
export function watchMessages(entries) {
  return entriesToMessages(entries, entries.findLast((entry) => typeof entry.id === "string")?.id);
}
