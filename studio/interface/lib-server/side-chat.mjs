// "Dúvidas": a read-only side PI per main conversation. It reads the conversation log and answers questions, nothing more.
// The tool allowlist is the safety boundary (no write/edit/bash/subagent tools); the command filter closes the other door,
// since PI's RPC protocol has commands (`bash`, `switch_session`, extension commands) that ignore the tool allowlist.
import path from "node:path";

export const SIDE_TOOLS = "read,grep,find,ls";
export const SIDE_MAX_SESSIONS = 6;
const SIDE_PROMPT_MAX_CHARS = 8000;
const SIDE_COMMANDS = new Set(["abort", "get_state", "get_entries"]);

const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });

// pt-BR instructions appended to PI's system prompt. `sessionPath` is the main conversation JSONL, `cwd` its project folder.
export function buildSidePrompt({ sessionPath, cwd }) {
  return [
    "Você é o assistente de dúvidas do PI Studio. Responda às perguntas da pessoa sobre o que está acontecendo no trabalho dela.",
    "REGRAS INEGOCIÁVEIS: você é somente leitura. Nunca altere arquivos, nunca execute comandos e nunca envie mensagens a outros agentes.",
    "Suas únicas ferramentas são read, grep, find e ls. Se a pessoa pedir uma mudança, explique que aqui só se respondem dúvidas e que o pedido deve ir para a conversa principal.",
    `A conversa atual está no log JSONL: ${sessionPath}`,
    "Cada linha do log é um objeto JSON e a mais nova é a última: leia primeiro o final do arquivo (read com offset perto do fim, ou grep) antes de responder.",
    `Os logs dos subagentes são os arquivos .jsonl da mesma pasta (${path.dirname(sessionPath)}) cuja primeira linha tem "parentSession" igual a ${sessionPath}.`,
    `A pasta do projeto é ${cwd}.`,
    "Responda de forma concisa, em português do Brasil.",
  ].join("\n");
}

// Extra argv that turns a normal RPC PI into the side PI: ephemeral (nothing saved, so it never shows in the sidebar) and read-only.
export function sideArgs(prompt) {
  return ["--no-session", "--tools", SIDE_TOOLS, "--append-system-prompt", prompt];
}

// The only commands a side session accepts. A question is always sent as a follow-up so several can queue behind the running answer.
export function sideCommand(command) {
  if (command === null || typeof command !== "object" || Array.isArray(command)) throw httpError(400, "Comando inválido");
  if (SIDE_COMMANDS.has(command.type)) return typeof command.id === "string" ? { id: command.id, type: command.type } : { type: command.type };
  if (command.type !== "prompt") throw httpError(403, "Comando não permitido na conversa de dúvidas");
  const message = typeof command.message === "string" ? command.message.trim() : "";
  if (!message || message.length > SIDE_PROMPT_MAX_CHARS) throw httpError(400, "A pergunta está vazia ou é longa demais");
  if (message.startsWith("/")) throw httpError(400, "Comece a pergunta com texto: comandos com / não são aceitos aqui");
  return { ...(typeof command.id === "string" ? { id: command.id } : {}), type: "prompt", message, streamingBehavior: "followUp" };
}

export function sideIdleMs(env = process.env) {
  const testMs = Number(env.PI_STUDIO_SIDE_IDLE_TEST_MS);
  return env.NODE_ENV === "test" && Number.isFinite(testMs) && testMs > 0 ? testMs : 10 * 60_000;
}

// One live side session per main conversation key. `acquire` is synchronous, so concurrent requests for the same conversation
// share one process. Idle ones (no request for `idleMs`, not answering) stop; past `max` the least recently used one stops.
export function createSideRegistry({ idleMs = sideIdleMs(), max = SIDE_MAX_SESSIONS, now = Date.now } = {}) {
  const entries = new Map();

  function remove(session) {
    for (const [key, entry] of entries) if (entry.session === session) entries.delete(key);
  }
  const entryById = (id) => [...entries.values()].find((entry) => entry.session.id === id);

  return {
    acquire(key, make) {
      const live = entries.get(key);
      if (live && !live.session.exited) {
        live.usedAt = now();
        return live.session;
      }
      const session = make();
      entries.set(key, { session, usedAt: now() });
      while (entries.size > max) {
        const oldest = [...entries.entries()].filter(([, entry]) => entry.session !== session).sort((a, b) => a[1].usedAt - b[1].usedAt)[0];
        entries.delete(oldest[0]);
        oldest[1].session.stop();
      }
      return session;
    },
    find: (id) => entryById(id)?.session,
    touch(id) {
      const entry = entryById(id);
      if (entry) entry.usedAt = now();
    },
    remove,
    reap(at = now()) {
      const stopped = [];
      for (const [key, entry] of entries) {
        if (entry.session.streaming || at - entry.usedAt < idleMs) continue;
        entries.delete(key);
        entry.session.stop();
        stopped.push(entry.session.id);
      }
      return stopped;
    },
    pids: () => [...entries.values()].map((entry) => entry.session.proc?.pid).filter(Boolean),
    size: () => entries.size,
    stopAll() {
      for (const entry of entries.values()) entry.session.stop();
      entries.clear();
    },
  };
}
