import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readdirSync } from "node:fs";
import { resolvePiSdkRoot } from "./lib/pi-sdk.mjs";

// STATEFUL RESOURCE PROOF: DISPOSABLE_VERIFIED. Every session file is synthetic and lives under a fresh mkdtemp root removed in finally; no network, real model, or PI session directory is used.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const owned = mkdtempSync(path.join(tmpdir(), "pi-chat-names-"));
const sdkRoot = resolvePiSdkRoot(import.meta.url);
const { createJiti } = createRequire(import.meta.url)(path.join(sdkRoot, "node_modules/jiti/lib/jiti.cjs"));
const jiti = createJiti(import.meta.url, { fsCache: false, alias: { "@earendil-works/pi-coding-agent": path.join(sdkRoot, "dist/index.js") } });
const sdk = await import(pathToFileURL(path.join(sdkRoot, "dist/index.js")).href);
const mod = await jiti.import(path.join(root, "extensions/chat-names.ts"));
const SessionManager = sdk.SessionManager;

// Sanitization strips model formatting and sensitive-looking tokens, enforces the cap, and rejects unusable titles.
assert.equal(mod.sanitizeTitle(' "ROLEscout: Mapear chats\n😀 C:\\private\\secret.txt" '), "Mapear chats");
assert.equal(mod.sanitizeTitle(`Título ${"longo ".repeat(20)}`).length, 60);
assert.equal(mod.sanitizeTitle(" \n😀 C:\\secret.txt "), undefined);
assert.equal(mod.sanitizeTitle("\"\"\""), undefined);

function fixture({ sessionManager = SessionManager.inMemory(owned), complete = async () => "", registry = {} } = {}) {
  const commands = new Map(); const handlers = new Map(); const userMessages = [];
  const pi = {
    registerCommand: (name, value) => commands.set(name, value),
    on: (name, handler) => handlers.set(name, handler),
    setSessionName: (name) => sessionManager.appendSessionInfo(name),
  };
  const ctx = {
    sessionManager, model: { provider: "openai-codex", id: "fallback" }, mode: "tui",
    modelRegistry: { getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "fake" }), find: () => undefined, ...registry },
    ui: { notify: (message) => userMessages.push(message) },
  };
  const extension = mod.registerChatNames(pi, { agentDir: () => owned, complete });
  return { commands, handlers, ctx, sessionManager, userMessages, extension };
}

try {
  // A settled first exchange should produce one sanitized title and persist via PI's session API.
  {
    const sm = SessionManager.create(owned, path.join(owned, "auto"));
    sm.appendMessage({ role: "user", content: "ROLEbuilder: organizar relatórios do projeto", timestamp: Date.now() });
    sm.appendMessage({ role: "assistant", content: [{ type: "text", text: "Vou organizar os relatórios." }], api: "fake", provider: "fake", model: "fake", usage: {}, stopReason: "stop", timestamp: Date.now() });
    let modelUsed;
    const f = fixture({ sessionManager: sm, registry: { find: (provider, id) => { assert.equal(provider, "openai-codex"); assert.equal(id, "gpt-5.3-codex-spark"); return { provider, id }; } }, complete: async (model) => { modelUsed = model; return { content: [{ type: "text", text: '"Organizar relatórios do projeto.\nNovo"' }] }; } });
    await f.handlers.get("agent_settled")({}, f.ctx);
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(sm.getSessionName(), "Organizar relatórios do projeto. Novo");
    assert.equal(modelUsed.id, "gpt-5.3-codex-spark");
    await f.handlers.get("agent_settled")({}, f.ctx);
    assert.equal(sm.getEntries().filter((entry) => entry.type === "session_info").length, 1, "only one title should be generated");
  }

  // Existing user names must remain untouched and a session without a persisted file must not call the model.
  {
    const sm = SessionManager.inMemory(owned);
    sm.appendMessage({ role: "user", content: "hello", timestamp: Date.now() });
    sm.appendSessionInfo("Nome escolhido pelo usuário");
    let calls = 0;
    const f = fixture({ sessionManager: sm, complete: async () => { calls++; return "Outro nome"; } });
    await f.handlers.get("agent_settled")({}, f.ctx);
    assert.equal(sm.getSessionName(), "Nome escolhido pelo usuário");
    assert.equal(calls, 0);
  }

  // An unnamed --no-session context has no writable file and must never start a model call.
  {
    const sm = SessionManager.inMemory(owned);
    sm.appendMessage({ role: "user", content: "Sem arquivo persistido", timestamp: Date.now() });
    let calls = 0;
    const f = fixture({ sessionManager: sm, complete: async () => { calls++; return { content: [{ type: "text", text: "Título" }] }; } });
    await f.handlers.get("agent_settled")({}, f.ctx);
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(calls, 0);
    assert.equal(sm.getSessionName(), undefined);
  }

  // A failed model call leaves an unnamed session untouched so a later attempt can succeed.
  {
    const sm = SessionManager.create(owned, path.join(owned, "failure"));
    sm.appendMessage({ role: "user", content: "Tarefa cuja chamada falha", timestamp: Date.now() });
    const f = fixture({ sessionManager: sm, complete: async () => { throw new Error("fake model failure"); } });
    await f.handlers.get("agent_settled")({}, f.ctx);
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(sm.getSessionName(), undefined);
  }

  // Batch rename is idempotent, respects dry-run/limit and skips recently changed sessions.
  {
    const sessions = path.join(owned, "sessions", "nested");
    const make = (name, recent = false) => {
      const sm = SessionManager.create(owned, sessions);
      sm.appendMessage({ role: "user", content: `Explique ${name}`, timestamp: Date.now() });
      sm.appendMessage({ role: "assistant", content: [{ type: "text", text: "Resposta." }], api: "fake", provider: "fake", model: "fake", usage: {}, stopReason: "stop", timestamp: Date.now() });
      if (name === "preexisting") sm.appendSessionInfo("Já nomeado");
      const file = sm.getSessionFile();
      const modified = (Date.now() - (recent ? 0 : 11 * 60_000)) / 1000;
      utimesSync(file, modified, modified);
      return { file, sm };
    };
    const old = make("antigo"); make("preexisting"); make("ativo", true);
    const corrupt = path.join(sessions, "broken.jsonl");
    writeFileSync(corrupt, '{"type":"session"}\\nnot json\\n');
    const stale = (Date.now() - 11 * 60_000) / 1000;
    utimesSync(corrupt, stale, stale);
    // Legacy (pre-v3) session: SessionManager.open() would migrate and REWRITE the whole file, so the batch must
    // skip it and leave its bytes untouched. Expected: no model call for it, identical bytes, counted as legacy.
    const legacy = path.join(sessions, "legacy.jsonl");
    const legacyBytes = [
      JSON.stringify({ type: "session", id: "legacy-1", timestamp: new Date().toISOString(), cwd: owned }),
      JSON.stringify({ type: "message", timestamp: new Date().toISOString(), message: { role: "user", content: "Explique legado", timestamp: Date.now() } }),
      "",
    ].join("\n");
    writeFileSync(legacy, legacyBytes);
    utimesSync(legacy, stale, stale);
    let calls = 0;
    const f = fixture({ complete: async () => { calls++; return { content: [{ type: "text", text: `Título humano ${calls}` }] }; } });
    await f.commands.get("nomear-chats").handler("--dry-run", f.ctx);
    assert.equal(SessionManager.open(old.file).getSessionName(), undefined, "dry-run must not append session_info");
    await f.commands.get("nomear-chats").handler("--limit 1", f.ctx);
    assert.equal(SessionManager.open(old.file).getSessionName(), "Título humano 2");
    assert.equal(calls, 2);
    await f.commands.get("nomear-chats").handler("", f.ctx);
    assert.equal(SessionManager.open(old.file).getSessionName(), "Título humano 2", "rerun must skip already named chats");
    assert.match(f.userMessages.at(-1), /0 renomeados, 1 pulados \(ativos\), 1 pulados \(formato antigo\), 1 falharam/);
    assert.equal(readFileSync(legacy, "utf8"), legacyBytes, "legacy session bytes must stay untouched");
    assert.equal(calls, 2, "legacy sessions never reach the model");
  }

  // Load test: 300 disposable sessions should rename with at most four concurrent model requests.
  {
    const sessions = path.join(owned, "sessions", "load", "nested");
    for (let i = 0; i < 300; i++) {
      const sm = SessionManager.create(owned, sessions);
      sm.appendMessage({ role: "user", content: `Tarefa sintética ${i}`, timestamp: Date.now() });
      sm.appendMessage({ role: "assistant", content: [{ type: "text", text: "Resposta." }], api: "fake", provider: "fake", model: "fake", usage: {}, stopReason: "stop", timestamp: Date.now() });
      const modified = (Date.now() - 11 * 60_000) / 1000;
      utimesSync(sm.getSessionFile(), modified, modified);
    }
    let active = 0; let maxActive = 0;
    const before = process.memoryUsage().heapUsed; const started = Date.now();
    const f = fixture({ complete: async () => { active++; maxActive = Math.max(maxActive, active); await new Promise((resolve) => setTimeout(resolve, 2)); active--; return { content: [{ type: "text", text: "Tarefa sintética nomeada" }] }; } });
    await f.commands.get("nomear-chats").handler("", f.ctx);
    const elapsed = Date.now() - started; const growth = process.memoryUsage().heapUsed - before;
    const files = [];
    const collect = (dir) => { for (const entry of readdirSync(dir, { withFileTypes: true })) { const file = path.join(dir, entry.name); if (entry.isDirectory()) collect(file); else if (file.endsWith(".jsonl")) files.push(file); } };
    collect(sessions);
    assert.equal(files.length, 300);
    assert(files.every((file) => Boolean(SessionManager.open(file).getSessionName())));
    assert(maxActive <= 4, `concurrency exceeded four (${maxActive})`);
    assert(growth < 100 * 1024 * 1024, `unexpected heap growth: ${growth}`);
    console.log(`load: ${files.length} renamed in ${elapsed}ms; max concurrency ${maxActive}; heap growth ${growth} bytes`);
  }
} finally {
  rmSync(owned, { recursive: true, force: true });
}
