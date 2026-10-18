import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import net from "node:net";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createUiResponder, updateProcessExitUi } from "../public/lib.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const fakePi = path.join(__dirname, "fake-pi-rpc.mjs");

// A saída deve ficar visível, bloquear prompts e oferecer reinício.
function makeExitUi() {
  return {
    status: { textContent: "", classList: { classes: new Set(["hidden"]), remove(name) { this.classes.delete(name); } } },
    prompt: { disabled: false },
    action: { disabled: false },
    restart: { textContent: "Nova conversa" },
  };
}
const cleanExitUi = makeExitUi();
updateProcessExitUi({ code: 0, signal: null }, cleanExitUi);
assert.equal(cleanExitUi.status.textContent, "PI encerrado (código 0)");
assert.equal(cleanExitUi.status.classList.classes.has("hidden"), false);
assert.equal(cleanExitUi.prompt.disabled, true);
assert.equal(cleanExitUi.action.disabled, true);
assert.equal(cleanExitUi.restart.textContent, "Reiniciar PI");
const failedExitUi = makeExitUi();
updateProcessExitUi({ code: 7, signal: null, message: "Error: segredo interno" }, failedExitUi);
assert.equal(failedExitUi.status.textContent, "PI encerrado (código 7, erro)");
assert.equal(failedExitUi.status.textContent.includes("Error:"), false, "não exibe stack trace");
assert.equal(failedExitUi.status.textContent.includes("segredo interno"), false);
const signalExitUi = makeExitUi();
updateProcessExitUi({ code: null, signal: "SIGTERM" }, signalExitUi);
assert.equal(signalExitUi.status.textContent, "PI encerrado (sinal SIGTERM)");

// A resposta compartilhada deve tornar Esc e cliques rápidos idempotentes.
const uiResponses = [];
const responder = createUiResponder("ui-esc", async (id, payload) => {
  uiResponses.push({ id, ...payload });
});
let prevented = false;
const cancelEvent = { preventDefault: () => { prevented = true; } };
await Promise.all([responder.cancel(cancelEvent), responder.cancel(cancelEvent)]);
assert.equal(prevented, true, "Escape deve impedir o fechamento sem resposta");
assert.deepEqual(uiResponses, [{ id: "ui-esc", cancelled: true }]);
const normalResponses = [];
const normalResponder = createUiResponder("ui-ok", async (id, payload) => {
  normalResponses.push({ id, ...payload });
});
await normalResponder.respond({ value: "seleção" });
await normalResponder.respond({ cancelled: true });
assert.deepEqual(normalResponses, [{ id: "ui-ok", value: "seleção" }]);
let attempts = 0;
const retryResponses = [];
const retryResponder = createUiResponder("ui-retry", async (id, payload) => {
  attempts += 1;
  if (attempts === 1) throw new Error("falha temporária");
  retryResponses.push({ id, ...payload });
});
await assert.rejects(retryResponder.respond({ value: "tentar novamente" }), /falha temporária/);
await retryResponder.respond({ value: "tentar novamente" });
assert.equal(attempts, 2, "falha de envio deve liberar uma nova tentativa");
assert.deepEqual(retryResponses, [{ id: "ui-retry", value: "tentar novamente" }]);
// Esc durante o envio do OK: a 2ª chamada aguarda o MESMO envio e falha junto,
// para o handler dela não fechar o diálogo antes de saber se houve resposta.
let rejectInFlight;
const inFlightResponder = createUiResponder("ui-inflight", () => new Promise((_, reject) => { rejectInFlight = reject; }));
const first = inFlightResponder.respond({ value: "ok" });
const second = inFlightResponder.cancel(cancelEvent);
rejectInFlight(new Error("rede caiu"));
await assert.rejects(first, /rede caiu/);
await assert.rejects(second, /rede caiu/, "chamada concorrente deve falhar junto com o envio em voo");

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for server. Output:\n${output}`)), 6000);
    child.stdout.on("data", (chunk) => {
      output += chunk.toString("utf8");
      const match = output.match(/http:\/\/127\.0\.0\.1:(\d+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(Number(match[1]));
      }
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString("utf8");
    });
    child.on("exit", (code) => reject(new Error(`Server exited early with code ${code}. Output:\n${output}`)));
  });
}

async function post(base, pathname, body, token, headers = {}) {
  const res = await fetch(`${base}${pathname}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: new URL(base).origin, ...(token ? { "x-pi-studio-token": token } : {}), ...headers },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json();
  return { res, data };
}

function getWithHeaders(base, pathname, headers) {
  return new Promise((resolve, reject) => {
    const req = http.get(`${base}${pathname}`, { headers }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
  });
}

function rawRequest(base, headers) {
  const target = new URL(base);
  return new Promise((resolve, reject) => {
    const socket = net.connect(Number(target.port), target.hostname, () => {
      socket.write(`GET /api/health HTTP/1.1\r\n${headers.join("\r\n")}\r\nConnection: close\r\n\r\n`);
    });
    let response = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => { response += chunk; });
    socket.on("end", () => resolve(Number(response.match(/^HTTP\/1\.1 (\d+)/)?.[1])));
    socket.on("error", reject);
  });
}

function rawGetResponse(base, pathname) {
  const target = new URL(base);
  return new Promise((resolve, reject) => {
    const socket = net.connect(Number(target.port), target.hostname, () => {
      socket.write(`GET ${pathname} HTTP/1.1\r\nHost: ${target.host}\r\nConnection: close\r\n\r\n`);
    });
    let response = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => { response += chunk; });
    socket.on("end", () => {
      const separator = response.indexOf("\r\n\r\n");
      resolve({
        status: Number(response.match(/^HTTP\/1\.1 (\d+)/)?.[1]),
        body: response.slice(separator + 4),
      });
    });
    socket.on("error", reject);
  });
}

async function rawGetStatus(base, pathname) {
  return (await rawGetResponse(base, pathname)).status;
}

function collectSse(base, eventsPath, onEvent, cookie) {
  const req = http.get(`${base}${eventsPath}`, { headers: { cookie: `pi-studio-token=${cookie}` } }, (res) => {
    res.setEncoding("utf8");
    let buffer = "";
    res.on("data", (chunk) => {
      buffer += chunk;
      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const eventLine = frame.split("\n").find((line) => line.startsWith("event: "));
        const dataLine = frame.split("\n").find((line) => line.startsWith("data: "));
        if (eventLine && dataLine) {
          onEvent(eventLine.slice(7), JSON.parse(dataLine.slice(6)));
        }
        boundary = buffer.indexOf("\n\n");
      }
    });
  });
  return req;
}

async function waitFor(predicate, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw new Error("Timed out waiting for expected event");
}

const agentDir = await mkdtemp(path.join(os.tmpdir(), "pi-studio-test-agent-"));
const projectDir = await mkdtemp(path.join(os.tmpdir(), "pi-studio-test-project-"));
await writeFile(path.join(projectDir, "package.json"), "{}\n");
// Projeto só conhecido pelo histórico de sessões (fora das raízes); um cwd removido não aparece.
const historyProjectDir = await mkdtemp(path.join(os.tmpdir(), "pi-studio-test-history-"));
const sessionsDir = path.join(agentDir, "sessions", "--history--");
await mkdir(sessionsDir, { recursive: true });
const historyFile = path.join(sessionsDir, "2024-01-01_a.jsonl");
await writeFile(historyFile, [
  JSON.stringify({ type: "session", version: 3, id: "hist-1", timestamp: "2024-01-01T00:00:00.000Z", cwd: historyProjectDir }),
  JSON.stringify({ type: "message", id: "m1", parentId: null, timestamp: "2024-01-01T00:00:01.000Z", message: { role: "user", content: "Sessão antiga" } }),
].join("\n"));
await writeFile(path.join(sessionsDir, "2024-01-02_b.jsonl"), `${JSON.stringify({ type: "session", id: "gone", cwd: path.join(historyProjectDir, "removido") })}\n`);
await writeFile(path.join(sessionsDir, "broken.jsonl"), "{not json");
const child = spawn(process.execPath, [path.join(root, "server.mjs")], {
  cwd: root,
  env: {
    ...process.env,
    PI_WEB_PORT: "0",
    PI_AGENT_DIR: agentDir,
    PI_PROJECT_ROOTS: projectDir,
    PI_WEB_PI_BIN: process.execPath,
    PI_WEB_PI_BIN_ARGS: JSON.stringify([fakePi]),
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let sse;
let siblingDir;
try {
  const port = await waitForServer(child);
  const base = `http://127.0.0.1:${port}`;
  siblingDir = await mkdtemp(path.join(root, "public-sibling-"));
  await writeFile(path.join(siblingDir, "probe.txt"), "outside public");
  const siblingName = path.basename(siblingDir);
  const page = await fetch(base);
  const html = await page.text();
  const token = html.match(/<meta name="pi-studio-token" content="([a-f0-9]+)">/)?.[1];
  const cookie = page.headers.get("set-cookie")?.match(/pi-studio-token=([^;]+)/)?.[1];
  if (!token || !cookie || token !== cookie) throw new Error("frontend did not receive auth token and SSE cookie");

  // Percent-encoding inválido deve virar 400 sem expor detalhes do erro.
  const malformedEncoding = await rawGetResponse(base, "/%E0%A4%A");
  if (malformedEncoding.status !== 400) {
    throw new Error(`malformed encoding returned ${malformedEncoding.status}, expected 400`);
  }
  if (malformedEncoding.body.includes("URIError")) {
    throw new Error("malformed encoding response exposed URIError");
  }

  // Arquivos públicos legítimos mantêm status e content-type; ausentes dão 404.
  const css = await fetch(`${base}/styles.css`);
  if (css.status !== 200 || css.headers.get("content-type") !== "text/css; charset=utf-8") {
    throw new Error(`public CSS returned ${css.status} with ${css.headers.get("content-type")}`);
  }
  const missingAsset = await fetch(`${base}/missing-static-asset`);
  if (missingAsset.status !== 404) throw new Error(`missing static asset returned ${missingAsset.status}, expected 404`);

  // Rejeita caminhos que escapam de public/, inclusive irmã com prefixo comum.
  const plainTraversal = await rawGetStatus(base, `/../${siblingName}/probe.txt`);
  if (plainTraversal !== 403) throw new Error(`plain traversal returned ${plainTraversal}, expected 403`);
  const siblingTraversal = await rawGetStatus(base, `/%2e%2e%2f${siblingName}/probe.txt`);
  if (siblingTraversal !== 403) throw new Error(`prefix sibling traversal returned ${siblingTraversal}, expected 403`);
  const encodedTraversal = await rawGetStatus(base, `/%2e%2e%2f${siblingName}%2fprobe.txt`);
  if (encodedTraversal !== 403) throw new Error(`encoded traversal returned ${encodedTraversal}, expected 403`);
  const backslashTraversal = await rawGetStatus(base, `/%2e%2e%5c${siblingName}%5cprobe.txt`);
  if (process.platform === "win32" && backslashTraversal !== 403) {
    throw new Error(`Windows backslash traversal returned ${backslashTraversal}, expected 403`);
  }
  const doubleEncodedTraversal = await rawGetStatus(base, `/%252e%252e%252f${siblingName}%252fprobe.txt`);
  if (doubleEncodedTraversal !== 404) throw new Error(`double-encoded traversal returned ${doubleEncodedTraversal}, expected 404`);
  const nullBytePath = await rawGetStatus(base, "/%00");
  if (nullBytePath !== 404) throw new Error(`null-byte path returned ${nullBytePath}, expected 404`);
  const longPath = await rawGetStatus(base, `/${"a".repeat(2048)}`);
  if (longPath !== 404) throw new Error(`long missing path returned ${longPath}, expected 404`);

  // Sem token, uma rota de leitura e uma de comando devem ser bloqueadas antes de qualquer efeito.
  const denied = await fetch(`${base}/api/health`);
  if (denied.status !== 401) throw new Error(`missing token returned ${denied.status}, expected 401`);
  const wrong = await post(base, "/api/sessions", { cwd: root }, "wrong-token");
  if (wrong.res.status !== 401) throw new Error(`wrong token returned ${wrong.res.status}, expected 401`);
  // Headers duplicados são ambíguos e não podem contornar a autenticação.
  const duplicateToken = await rawRequest(base, [
    `Host: 127.0.0.1:${port}`,
    `X-PI-Studio-Token: ${token}`,
    `X-PI-Studio-Token: ${token}`,
  ]);
  if (duplicateToken !== 401) throw new Error(`duplicate token headers returned ${duplicateToken}, expected 401`);
  // Uma rajada de pedidos sem token deve ser rejeitada sem iniciar processo ou criar estado.
  const burst = await Promise.all(Array.from({ length: 64 }, () => fetch(`${base}/api/health`)));
  if (burst.some((res) => res.status !== 401)) throw new Error("bulk requests without token were not uniformly rejected");

  // Defesa em profundidade (achado do QA da #7): num DNS rebinding, evil.example
  // aponta para 127.0.0.1. A página que carrega o token não pode ser servida
  // para esse Host, senão o token vaza para a página do atacante.
  const badHostPage = await getWithHeaders(base, "/", { host: `evil.example:${port}` });
  if (badHostPage.status !== 403 || badHostPage.body.includes(token)) {
    throw new Error(`HTML with token served to foreign Host (status ${badHostPage.status})`);
  }

  // Host externo e Origin externo são rejeitados antes do despacho para o PI.
  const badHost = await getWithHeaders(base, "/api/health", { "x-pi-studio-token": token, host: `evil.example:${port}` });
  if (badHost.status !== 403) throw new Error(`foreign Host returned ${badHost.status}, expected 403`);
  const badOrigin = await fetch(`${base}/api/health`, { headers: { "x-pi-studio-token": token, origin: "https://evil.example" } });
  if (badOrigin.status !== 403) throw new Error(`foreign Origin returned ${badOrigin.status}, expected 403`);
  const nullOrigin = await fetch(`${base}/api/health`, { headers: { "x-pi-studio-token": token, origin: "null" } });
  if (nullOrigin.status !== 403) throw new Error(`null Origin returned ${nullOrigin.status}, expected 403`);
  const ownOrigin = await fetch(`${base}/api/health`, { headers: { "x-pi-studio-token": token, origin: new URL(base).origin } });
  if (!ownOrigin.ok) throw new Error(`own Origin returned ${ownOrigin.status}`);

  // Origin ausente e Host aceito com variação de caixa/ponto final preservam clientes CLI.
  const healthRes = await getWithHeaders(base, "/api/health", { "x-pi-studio-token": token, host: `LOCALHOST.:${port}` });
  if (healthRes.status !== 200 || !JSON.parse(healthRes.body).ok) throw new Error("valid token/Host without Origin should pass");
  const ipv6Host = await getWithHeaders(base, "/api/health", { "x-pi-studio-token": token, host: `[::1]:${port}` });
  if (ipv6Host.status !== 200) throw new Error(`IPv6 loopback Host returned ${ipv6Host.status}`);

  const health = await fetch(`${base}/api/health`, { headers: { "x-pi-studio-token": token } }).then((res) => res.json());
  if (!health.ok) throw new Error("health check failed");
  if (health.sessions !== 0) throw new Error("unauthorized requests created a PI session");
  const agents = await fetch(`${base}/api/agents?cwd=${encodeURIComponent(projectDir)}`, { headers: { "x-pi-studio-token": token } }).then((res) => res.json());
  if (!Array.isArray(agents.agents)) throw new Error("agents endpoint did not return an array");

  const bootstrap = await fetch(`${base}/api/bootstrap`, { headers: { "x-pi-studio-token": token } }).then((res) => res.json());
  // Raiz temporária + projeto do histórico (mais recente primeiro); nada de fora.
  assert.deepEqual(bootstrap.projects.map((item) => item.cwd), [historyProjectDir, projectDir], "bootstrap must list only temp roots + temp history projects");
  assert.ok(bootstrap.projects[0].lastUsedAt, "history project carries lastUsedAt");
  const historyList = await fetch(`${base}/api/projects/${bootstrap.projects[0].id}/history`, { headers: { "x-pi-studio-token": token } }).then((res) => res.json());
  assert.equal(historyList.history.length, 1);
  assert.equal(historyList.history[0].title, "Sessão antiga");
  assert.equal(historyList.history[0].path, historyFile);
  if (bootstrap.config.agentDir !== agentDir || bootstrap.config.agentDir === path.join(os.homedir(), ".pi", "agent")) {
    throw new Error("server did not use its temporary agent directory");
  }
  if (bootstrap.config.projectRoots.length !== 1 || bootstrap.config.projectRoots[0] !== projectDir) {
    throw new Error("server did not restrict project roots to the temporary project directory");
  }
  const projectId = bootstrap.projects[1].id;
  const opened = await post(base, `/api/projects/${projectId}/open`, {}, token);
  if (!opened.res.ok || !opened.data.session?.id) throw new Error("project open did not start a session");

  const seen = [];
  sse = collectSse(base, `/api/projects/${projectId}/events`, (event, payload) => seen.push({ event, payload }), cookie);

  const prompt = await post(base, `/api/projects/${projectId}/command`, { id: "smoke-1", type: "prompt", message: "hello" }, token);
  if (prompt.res.status !== 202) throw new Error(`prompt returned ${prompt.res.status}`);
  await waitFor(() => seen.some((item) => item.event === "rpc" && item.payload.type === "message_update"));
  await waitFor(() => seen.some((item) => item.event === "rpc" && item.payload.type === "agent_end"));

  await post(base, `/api/projects/${projectId}/command`, { id: "state-1", type: "get_state" }, token);
  await waitFor(() => seen.some((item) => item.payload?.type === "response" && item.payload.command === "get_state"));
  const uiResponse = await post(base, `/api/projects/${projectId}/ui-response`, { id: "ui-smoke", value: "ok" }, token);
  if (uiResponse.res.status !== 202) throw new Error(`dialog response returned ${uiResponse.res.status}`);
  assert.ok(seen.some((item) => item.event === "replay_done"), "SSE marks the end of the history replay");

  // Eventos de ferramenta chegam pelo SSE na ordem do protocolo.
  await post(base, `/api/projects/${projectId}/command`, { id: "smoke-tools", type: "prompt", message: "tools" }, token);
  await waitFor(() => seen.some((item) => item.payload?.type === "tool_execution_end" && item.payload.toolCallId === "call_edit"));
  const toolTypes = seen.filter((item) => item.payload?.toolCallId === "call_bash" && item.payload.type?.startsWith("tool_execution")).map((item) => item.payload.type);
  assert.deepEqual(toolTypes, ["tool_execution_start", "tool_execution_update", "tool_execution_end"]);
  assert.ok(seen.some((item) => item.payload?.assistantMessageEvent?.type === "thinking_delta"));

  // Diálogo de extensão: pedido -> resposta -> PI recebe o valor escolhido.
  await post(base, `/api/projects/${projectId}/command`, { id: "smoke-ui", type: "prompt", message: "ui" }, token);
  await waitFor(() => seen.some((item) => item.payload?.type === "extension_ui_request" && item.payload.id === "fake-ui-1"));
  const answer = await post(base, `/api/projects/${projectId}/ui-response`, { id: "fake-ui-1", value: "Permitir" }, token);
  assert.equal(answer.res.status, 202);
  await waitFor(() => seen.some((item) => item.payload?.method === "notify" && item.payload.message === "Escolha: Permitir"));
  const missingId = await post(base, `/api/projects/${projectId}/ui-response`, { value: "x" }, token);
  assert.equal(missingId.res.status, 400);

  // Reconectar não reabre o diálogo já respondido.
  const replay = [];
  const replaySse = collectSse(base, `/api/projects/${projectId}/events`, (event, payload) => replay.push({ event, payload }), cookie);
  await waitFor(() => replay.some((item) => item.event === "replay_done"));
  replaySse.destroy();
  assert.equal(replay.some((item) => item.payload?.id === "fake-ui-1" && item.payload.type === "extension_ui_request"), false);
  assert.ok(replay.some((item) => item.payload?.id === "fake-notify"), "other history is still replayed");

  // A fake PI exit must reach SSE, and a new-session command must start it again.
  const cleanExit = await post(base, `/api/projects/${projectId}/command`, { id: "exit-clean", type: "test_exit", code: 0 }, token);
  if (cleanExit.res.status !== 202) throw new Error(`clean exit command returned ${cleanExit.res.status}`);
  await waitFor(() => seen.some((item) => item.event === "process_exit" && item.payload.code === 0));
  const restarted = await post(base, `/api/projects/${projectId}/command`, { id: "restart-after-exit", type: "new_session" }, token);
  if (restarted.res.status !== 202) throw new Error(`restart command returned ${restarted.res.status}`);
  sse.destroy();
  sse = collectSse(base, `/api/projects/${projectId}/events`, (event, payload) => seen.push({ event, payload }), cookie);
  const failedExit = await post(base, `/api/projects/${projectId}/command`, { id: "exit-failure", type: "test_exit", code: 7 }, token);
  if (failedExit.res.status !== 202) throw new Error(`failed exit command returned ${failedExit.res.status}`);
  await waitFor(() => seen.some((item) => item.event === "process_exit" && item.payload.code === 7));

  await post(base, `/api/projects/${projectId}/stop`, {}, token);
  console.log("smoke ok (security cases + fake PI workflow)");
} finally {
  if (sse) sse.destroy();
  child.kill("SIGTERM");
  await new Promise((resolve) => child.once("exit", resolve));
  await rm(agentDir, { recursive: true, force: true });
  await rm(projectDir, { recursive: true, force: true });
  await rm(historyProjectDir, { recursive: true, force: true });
  if (siblingDir) await rm(siblingDir, { recursive: true, force: true });
}
