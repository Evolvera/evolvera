#!/usr/bin/env node
import readline from "node:readline";
import { randomUUID } from "node:crypto";
import { parseArgs, createSseParser, matchProject, classifyInput, formatEvent, parseProjectList } from "./cli-lib.mjs";

const color = process.env.NO_COLOR === undefined && process.stdout.isTTY;
const paint = (s, code) => color ? `\x1b[${code}m${s}\x1b[0m` : s;
if (process.platform === "win32") { process.stdin.setEncoding("utf8"); process.stdout.setDefaultEncoding("utf8"); process.stderr.setDefaultEncoding("utf8"); }
let options;
try { options = parseArgs(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exit(2); }
let token;
let project;
let streaming = false;
let closed = false;
let lastInterrupt = 0;
let inputBuffer = "";
let sseController;
let thinkingTimer;
let thinkingSince = 0;
const pending = new Map();
const uiPending = new Map();
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY), prompt: "› " });

async function request(path, method = "GET", body) {
  const response = await fetch(`${options.url}${path}`, { method, headers: { "x-pi-studio-token": token, ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}
async function rpc(type, fields = {}) {
  const id = randomUUID();
  let earlyResponse;
  pending.set(id, (event) => { earlyResponse = event; });
  try { await request(`/api/projects/${encodeURIComponent(project.id)}/command`, "POST", { id, type, ...fields }); }
  catch (error) { pending.delete(id); throw error; }
  if (["prompt", "steer", "follow_up", "bash"].includes(type)) { pending.delete(id); return; }
  return new Promise((resolve, reject) => {
    const complete = (event) => { clearTimeout(timer); event.success ? resolve(event.data) : reject(new Error(event.error || "Comando falhou")); };
    const timer = setTimeout(() => { pending.delete(id); reject(new Error("Tempo esgotado aguardando PI")); }, 10000);
    if (earlyResponse) complete(earlyResponse);
    else pending.set(id, complete);
  });
}
function print(text, dim = false) { if (text !== null && text !== undefined && text !== "") process.stdout.write(`${paint(String(text), dim ? "2" : "0")}\n`); }
function startUi(req) {
  if (!req?.id || uiPending.has(req.id)) return;
  uiPending.set(req.id, req);
  const finish = async (data) => {
    try { await request(`/api/projects/${encodeURIComponent(project.id)}/ui-response`, "POST", { id: req.id, ...data }); }
    catch { print("Resposta já enviada no navegador ou expirada."); }
    uiPending.delete(req.id);
  };
  (async () => {
    print(`${req.title || "O PI precisa da sua resposta"}${req.message ? ` — ${req.message}` : ""}`);
    if (req.method === "select") {
      (req.options || []).forEach((item, i) => print(`${i + 1}) ${item}`));
      const answer = await ask("Escolha (número, vazio cancela): ");
      const index = Number(answer) - 1;
      return answer && req.options?.[index] !== undefined ? finish({ value: req.options[index] }) : finish({ cancelled: true });
    }
    if (req.method === "confirm") return finish({ confirmed: (await ask("Confirmar? (s/n) ")).trim().toLowerCase() === "s" });
    if (req.method === "editor") {
      const lines = [];
      while (true) { const line = await ask(lines.length ? "… " : "Texto (linha vazia conclui): "); if (!line) break; lines.push(line); }
      return finish({ value: lines.join("\n") });
    }
    const value = await ask("Resposta: ");
    return finish({ value });
  })().catch(() => finish({ cancelled: true }));
}
function ask(prompt) { return new Promise((resolve) => rl.question(prompt, resolve)); }
async function onRpc(e) {
  if (e.type === "agent_start") {
    streaming = true; thinkingSince = Date.now(); clearInterval(thinkingTimer); process.stdout.write("Pensando… 0 s");
    thinkingTimer = setInterval(() => { if (streaming) process.stdout.write(`\rPensando… ${Math.floor((Date.now() - thinkingSince) / 1000)} s`); }, 1000);
  }
  if (e.type === "agent_end" || e.type === "agent_settled") { streaming = false; clearInterval(thinkingTimer); thinkingTimer = null; process.stdout.write(color ? "\r\x1b[K" : "\n"); if (!closed) rl.prompt(true); }
  if (e.type === "response" && e.id) {
    pending.get(e.id)?.(e); pending.delete(e.id);
    if (e.command === "extension_ui_response") uiPending.delete(e.id);
  }
  if (e.type === "extension_ui_request" && ["select", "confirm", "input", "editor"].includes(e.method)) startUi(e);
  if (e.type === "extension_ui_response" && e.id) uiPending.delete(e.id);
  if (e.type === "message_start" && e.message?.role === "assistant") process.stdout.write("\n");
  const line = formatEvent("rpc", e);
  if (line !== null && e.type !== "agent_start") {
    if (e.type === "message_update" && e.assistantMessageEvent?.type === "text_delta") process.stdout.write(line);
    else print(line);
  }
}
async function chooseProject() {
  const { projects = [] } = await request("/api/projects");
  let selected = matchProject(projects, options.project);
  if (!selected) selected = matchProject(projects, null, process.cwd());
  if (selected) return selected;
  if (!projects.length) throw new Error("Nenhum projeto encontrado no PI Studio.");
  projects.forEach((p, i) => print(`${i + 1}) ${p.name} — ${p.cwd}`));
  const answer = await ask("Projeto: ");
  selected = parseProjectList(answer, projects);
  if (!selected) throw new Error("Seleção inválida.");
  return selected;
}
async function consumeSse() {
  let delay = 300;
  let connectedAt = 0;
  while (!closed) {
    try {
      sseController = new AbortController();
      const response = await fetch(`${options.url}/api/projects/${encodeURIComponent(project.id)}/events`, { headers: { "x-pi-studio-token": token, cookie: `pi-studio-token=${token}` }, signal: sseController.signal });
      if (!response.ok || !response.body) throw new Error(`SSE indisponível (${response.status})`);
      connectedAt = Date.now();
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let replay = true;
      const parser = createSseParser((name, data) => {
        if (name === "replay_done") { replay = false; return; }
        let payload; try { payload = JSON.parse(data); } catch { return; }
        if (name === "rpc") {
          if (replay && payload.type === "agent_start") streaming = true;
          if (replay && (payload.type === "agent_end" || payload.type === "agent_settled")) streaming = false;
          const line = formatEvent("rpc", payload);
          if (replay) { if (line) print(line, true); }
          else void onRpc(payload);
        } else if (!replay) { const line = formatEvent(name, payload); if (line) print(line); }
      });
      while (!closed) {
        const { value, done } = await reader.read();
        if (done) break;
        parser(decoder.decode(value, { stream: true }));
      }
    } catch { if (!closed) print(`PI Studio não está rodando em ${options.url}`); }
    if (!closed) {
      if (connectedAt && Date.now() - connectedAt >= 30000) delay = 300;
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * 2, 5000);
    }
  }
}
async function sendLine(text) {
  const action = classifyInput(text, streaming);
  if (action.kind === "empty") return;
  if (action.kind === "builtin") {
    if (action.name === "sair") { closed = true; rl.close(); process.stdin.pause(); sseController?.abort(); process.stdout.write("", () => process.exit(0)); }
    if (action.name === "ajuda") { print("/new · /compact [instruções] · /name <título> · /export · /sair · /ajuda · >> texto / /fila texto · !comando"); return; }
    if (action.name === "new") { await rpc("new_session"); print("Nova conversa iniciada."); return; }
    if (action.name === "compact") { await rpc("compact", { ...(action.args ? { customInstructions: action.args } : {}) }); return; }
    if (action.name === "name") { await rpc("set_session_name", { name: action.args }); print("Conversa renomeada."); return; }
    if (action.name === "export") { const result = await rpc("export_html"); print(result?.path || "Exportado."); return; }
  }
  try {
    await request(`/api/projects/${encodeURIComponent(project.id)}/command`, "POST", action.kind === "rpc" ? { id: randomUUID(), type: action.type, ...(action.type === "bash" ? { command: action.command } : { message: action.message }) } : { id: randomUUID(), type: action.type, message: action.message });
  } catch (error) { print(error.message); }
}
rl.on("line", (line) => {
  if (line.endsWith("\\")) { inputBuffer += `${line.slice(0, -1)}\n`; rl.setPrompt("… "); rl.prompt(); return; }
  const text = inputBuffer + line;
  inputBuffer = ""; rl.setPrompt("› ");
  // A failed command (e.g. /export with PI down) is reported, never an unhandled rejection that kills the CLI.
  sendLine(text).catch((error) => print(`Erro: ${error.message}`));
});
rl.on("SIGINT", () => {
  const now = Date.now();
  if (!streaming || now - lastInterrupt < 1500) { closed = true; rl.close(); }
  else { lastInterrupt = now; void rpc("abort").catch(() => {}); print("Interrompendo…"); }
});
rl.on("close", () => { closed = true; sseController?.abort(); process.stdin.pause(); });

try {
  const page = await fetch(options.url);
  if (!page.ok) throw new Error("Servidor indisponível");
  const html = await page.text();
  token = html.match(/<meta name="pi-studio-token" content="([a-f0-9]+)">/)?.[1];
  if (!token) throw new Error("Token do PI Studio não encontrado.");
  project = await chooseProject();
  const opened = await request(`/api/projects/${encodeURIComponent(project.id)}/open`, "POST", {});
  print(`PI Studio · ${opened.project.name} · sessão ${opened.session.sessionId || opened.session.id}`);
  void consumeSse();
  rl.prompt();
} catch (error) { console.error(`Erro: ${error.message}`); rl.close(); process.exitCode = 1; }
