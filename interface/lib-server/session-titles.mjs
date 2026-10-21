const MAX_PARENT_BYTES = 8 * 1024 * 1024;

export function stripPictographs(text) {
  if (typeof text !== "string") return "";
  return text.replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0E\uFE0F\u200D\u{1F3FB}-\u{1F3FF}]/gu, "").replace(/\s+/g, " ").trim();
}

function text(value) { return typeof value === "string" ? value.trim() : ""; }
function shortLabel(value) {
  const words = text(value).replace(/\s+/g, " ").split(" ").filter(Boolean).slice(0, 7);
  let title = "";
  for (const word of words) {
    const next = title ? `${title} ${word}` : word;
    if (next.length > 80) break;
    title = next;
  }
  return title;
}
function obj(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function contentText(message) {
  const value = message?.message ?? message;
  const content = value?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.filter((part) => part?.type === "text").map((part) => part.text).join("\n");
}
function callsIn(line) {
  try {
    const event = JSON.parse(line);
    const candidates = [event, event?.message].filter(Boolean);
    const calls = [];
    for (const candidate of candidates) {
      if (candidate.type === "toolCall" && candidate.name === "Agent") calls.push({ id: candidate.id, args: obj(candidate.arguments ?? candidate.args) });
      for (const part of candidate.content ?? []) if (part?.type === "toolCall" && part.name === "Agent") calls.push({ id: part.id, args: obj(part.arguments ?? part.args) });
    }
    let result = null;
    for (const candidate of candidates) {
      if (candidate.type === "toolResult" || candidate.role === "toolResult") result = { id: candidate.toolCallId, details: obj(candidate.details) };
    }
    return { calls, result };
  } catch { return { calls: [], result: null }; }
}
function firstPrompt(lines) {
  for (const line of lines) {
    try {
      const event = JSON.parse(line);
      const message = event?.message ?? event;
      if ((message.role === "user" || message.type === "user") && contentText(event)) return contentText(event).split(/\r?\n/, 1)[0].trim().slice(0, 80);
    } catch { /* malformed JSONL rows are ignored */ }
  }
  return "";
}

export function createTitleIndex({ readLines, statFile }) {
  const cache = new Map();
  const inflight = new Map();

  async function parentIndex(parentPath) {
    let stat;
    try { stat = await statFile(parentPath); } catch { return { byAgent: new Map() }; }
    const key = `${stat?.mtimeMs ?? "?"}:${stat?.size ?? "?"}`;
    const existing = cache.get(parentPath);
    if (existing?.key === key) return existing.index;
    if (inflight.has(parentPath)) return inflight.get(parentPath);
    const pending = (async () => {
      const calls = new Map();
      const byAgent = new Map();
      let scanned = 0;
      try {
        for await (const line of readLines(parentPath)) {
          if (typeof line !== "string") continue;
          const bytes = Buffer.byteLength(line) + 1;
          if (scanned + bytes > MAX_PARENT_BYTES) break;
          scanned += bytes;
          if (!line.includes("Agent") && !line.includes("agentId")) continue;
          const parsed = callsIn(line);
          for (const call of parsed.calls) if (call.id) calls.set(call.id, call.args);
          if (parsed.result?.details?.agentId && parsed.result?.id) {
            const args = calls.get(parsed.result.id);
            if (args) byAgent.set(String(parsed.result.details.agentId), { args, details: parsed.result.details });
          }
        }
      } catch { /* disappearing or unreadable parents simply use the title fallback */ }
      const index = { byAgent };
      cache.set(parentPath, { key, index });
      return index;
    })();
    inflight.set(parentPath, pending);
    try { return await pending; } finally { inflight.delete(parentPath); }
  }

  return {
    async subagentTitle(childPath, childHeader, childSessionName) {
      const name = text(childSessionName);
      const split = name.indexOf("#");
      const agentType = split >= 0 ? name.slice(0, split) : name;
      const agentSuffix = split >= 0 ? name.slice(split + 1) : "";
      const parentPath = text(childHeader?.parentSession);
      let args = {};
      let details = {};
      let childLines = [];
      if (parentPath) {
        const index = await parentIndex(parentPath);
        const found = [...index.byAgent].find(([agentId]) => agentSuffix && agentId.startsWith(agentSuffix))?.[1];
        if (found) { args = found.args; details = found.details; }
      }
      let title = shortLabel(stripPictographs(args.description) || stripPictographs(args.name));
      if (!title) {
        try {
          for await (const line of readLines(childPath)) {
            childLines.push(line);
            if (childLines.length >= 100) break;
          }
        } catch { /* the child may have disappeared; retain type fallback */ }
        title = shortLabel(stripPictographs(firstPrompt(childLines)));
      }
      return { title: shortLabel(title || agentType) || "Agente", agentType: text(details.subagentType || args.subagent_type) || agentType };
    },
  };
}
