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

export function entriesToMessages(entries, leafId) {
  const out = [];
  for (const entry of activeBranch(entries, leafId)) {
    if (entry.type === "message" && entry.message) out.push(entry.message);
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

  messages.forEach((message, mi) => {
    if (!message) return;
    switch (message.role) {
      case "user":
        group = null;
        items.push({ kind: "user", key: `u:${mi}`, text: messageText(message), images: messageImages(message), optimistic: Boolean(message._optimistic) });
        break;
      case "assistant": {
        const parts = Array.isArray(message.content) ? message.content : [{ type: "text", text: String(message.content ?? "") }];
        parts.forEach((part, pi) => {
          if (part?.type === "thinking" && part.thinking?.trim()) thinking += `${thinking ? "\n\n" : ""}${part.thinking}`;
          else if (part?.type === "text" && part.text?.trim()) {
            group = null;
            const item = { kind: "assistant", key: `a:${mi}.${pi}`, text: part.text };
            attachThinking(item);
            items.push(item);
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
        const failed = Boolean(message.exitCode) || Boolean(message.cancelled);
        const tool = { id: `b:${mi}`, name: "bash", args: { command: message.command }, status: failed ? "error" : "done", result: { content: [{ type: "text", text: message.output || "" }] }, isError: failed };
        ensureGroup(`${mi}:${tool.id}`).tools.push(tool);
        tools.set(tool.id, tool);
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

export const INSPECTOR_TABS = ["terminal", "subagents", "context", "files"];

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
        const failed = Boolean(message.exitCode) || Boolean(message.cancelled);
        const tool = newTool(`b:${mi}`, "bash", { command: message.command });
        Object.assign(tool, { status: failed ? "error" : "done", isError: failed, result: { content: [{ type: "text", text: message.output || "" }] } });
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
export function collectSubagents(messages = [], runtime = new Map(), records = new Map(), now = Date.now()) {
  const runs = [];
  const byCall = new Map();
  const notes = new Map();
  const extras = [];
  const extraByCall = new Map();

  messages.forEach((message, mi) => {
    if (message?.role === "assistant" && Array.isArray(message.content)) {
      message.content.forEach((part, pi) => {
        if (part?.type !== "toolCall") return;
        const args = part.arguments || {};
        if (part.name === SUBAGENT_TOOLS.agent) {
          const run = { key: `sa:${mi}.${pi}`, args, startedAt: stamp(message.timestamp), result: null, isError: false, live: false };
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
        if (note?.id) notes.set(note.id, note);
      }
    }
  });

  for (const [id, live] of runtime) {
    if (live.name !== SUBAGENT_TOOLS.agent) continue;
    let run = byCall.get(id);
    if (!run) {
      run = { key: `sa:live:${id}`, args: live.args || {}, startedAt: null, result: null, isError: false, live: false };
      runs.push(run);
      byCall.set(id, run);
    }
    if (live.startedAt) run.startedAt = live.startedAt;
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
