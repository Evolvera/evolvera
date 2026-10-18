import { stripAnsi, customNoteText, eventNotice, shortArgs } from "./public/lib.js";

export function parseArgs(argv = []) {
  const args = [...argv];
  let url = "http://127.0.0.1:4123";
  const projectParts = [];
  while (args.length) {
    const value = args.shift();
    if (value === "--url") {
      if (!args.length) throw new Error("--url requer um endereço");
      url = args.shift();
    } else if (value.startsWith("--url=")) url = value.slice(6);
    else if (value.startsWith("-")) throw new Error(`Opção desconhecida: ${value}`);
    else projectParts.push(value);
  }
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("URL deve usar HTTP ou HTTPS");
  return { url: parsed.origin, project: projectParts.join(" ") || null };
}

export function createSseParser(onEvent) {
  let buffer = "";
  return (chunk, final = false) => {
    buffer += chunk;
    let boundary;
    while ((boundary = buffer.search(/\r?\n\r?\n/)) >= 0) {
      const frame = buffer.slice(0, boundary);
      const separator = buffer.slice(boundary).match(/^\r?\n\r?\n/)[0];
      buffer = buffer.slice(boundary + separator.length);
      let event = "message";
      const data = [];
      for (const line of frame.split(/\r?\n/)) {
        if (line.startsWith("event:")) event = line.slice(6).trimStart();
        else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
      }
      if (data.length) onEvent(event, data.join("\n"));
    }
    if (final && buffer.trim()) {
      const rest = buffer;
      buffer = "";
      for (const line of rest.split(/\r?\n/)) if (line.startsWith("data:")) onEvent("message", line.slice(5).replace(/^ /, ""));
    }
  };
}

const norm = (value) => String(value || "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
export function matchProject(projects, query, cwd = process.cwd()) {
  if (!Array.isArray(projects)) throw new TypeError("projects deve ser uma lista");
  if (query) {
    const q = String(query).toLowerCase();
    const exact = projects.filter((p) => p.name?.toLowerCase() === q || p.id?.toLowerCase() === q);
    if (exact.length === 1) return exact[0];
    const prefix = projects.filter((p) => p.name?.toLowerCase().startsWith(q) || p.id?.toLowerCase().startsWith(q));
    if (prefix.length === 1) return prefix[0];
    if (!prefix.length) throw new Error(`Projeto não encontrado: ${query}`);
    throw new Error(`Nome de projeto ambíguo: ${query}`);
  }
  const current = norm(cwd);
  const candidates = projects.filter((p) => {
    const base = norm(p.cwd);
    return base && (current === base || current.startsWith(`${base}/`));
  }).sort((a, b) => norm(b.cwd).length - norm(a.cwd).length);
  return candidates[0] || null;
}

export function classifyInput(text, streaming = false) {
  const value = String(text).trim();
  if (!value) return { kind: "empty" };
  if (value.startsWith("/fila ")) return { kind: "rpc", type: "follow_up", message: value.slice(6).trim() };
  if (value.startsWith(">>")) return { kind: "rpc", type: "follow_up", message: value.slice(2).trim() };
  if (value.startsWith("!")) return { kind: "rpc", type: "bash", command: value.slice(1).trim() };
  const builtin = /^\/(new|compact|name|export|sair|ajuda)(?:\s+([\s\S]*))?$/i.exec(value);
  if (builtin) return { kind: "builtin", name: builtin[1].toLowerCase(), args: (builtin[2] || "").trim() };
  if (value.startsWith("/")) return { kind: "prompt", type: streaming ? "steer" : "prompt", message: value };
  return { kind: "prompt", type: streaming ? "steer" : "prompt", message: value };
}

// PI sends user content as a string or as [{type:"text"},{type:"image"}...] parts.
function userText(content) {
  if (typeof content === "string") return content;
  const parts = Array.isArray(content) ? content : [];
  const text = parts.filter((part) => part?.type === "text").map((part) => part.text).join(" ").trim();
  const images = parts.filter((part) => part?.type === "image").length;
  return [text, images ? `[${images} ${images > 1 ? "imagens" : "imagem"}]` : ""].filter(Boolean).join(" ") || "[anexo]";
}

export function formatEvent(event, payload) {
  const e = payload || {};
  if (event === "stderr") return e.data ? `! ${stripAnsi(e.data).trim()}` : null;
  if (event !== "rpc") return null;
  switch (e.type) {
    case "message_end": return null;
    case "message_start": {
      const m = e.message || {};
      if (m.role === "user") return `› ${userText(m.content)}`;
      if (m.role === "custom" && m.customType === "subagent-notification") return `• ${customNoteText(m)}`;
      if (m.role === "assistant" && Array.isArray(m.content)) return m.content.filter((x) => x.type === "text").map((x) => x.text).join("") || null;
      return null;
    }
    case "message_update": return e.assistantMessageEvent?.type === "text_delta" ? e.assistantMessageEvent.delta : null;
    case "tool_execution_start": return `• ${e.toolName || "ferramenta"}  ${shortArgs(e.toolName, e.args || {})}  …`;
    case "tool_execution_end": return `• ${e.toolName || "ferramenta"}  ${shortArgs(e.toolName, e.args || {})}  ${e.isError ? "✗" : "✓"}`;
    case "extension_ui_request": {
      if (e.method === "notify") return eventNotice(e)?.text || null;
      return null;
    }
    case "compaction_start": case "compaction_end": case "auto_retry_start": case "auto_retry_end": case "extension_error": return eventNotice(e)?.text || null;
    case "agent_start": return "Pensando…";
    case "agent_end": return "";
    case "turn_end": case "agent_settled": return null;
    case "response": return e.success === false ? `✗ ${e.error || "Falha no comando"}` : null;
    case "bash_execution_update": return e.delta || null;
    default: return null;
  }
}

export function parseProjectList(input, projects) {
  const index = Number(input) - 1;
  return Number.isInteger(index) && index >= 0 ? projects[index] || null : null;
}
