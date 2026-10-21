import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePiSdkRoot } from "./lib/pi-sdk.mjs";

// STATEFUL RESOURCE PROOF: DISPOSABLE_VERIFIED. In-memory fakes plus one fresh mkdtemp root
// holding a throwaway git repo and its worktrees, removed at the end. No network, model or PI process.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sdkRoot = resolvePiSdkRoot(import.meta.url);
const { createJiti } = createRequire(import.meta.url)(path.join(sdkRoot, "node_modules/jiti/lib/jiti.cjs"));
const jiti = createJiti(import.meta.url, { fsCache: false, alias: { "@earendil-works/pi-coding-agent": path.join(sdkRoot, "dist/index.js") } });
const m = await jiti.import(path.join(root, "extensions/loop.ts"));

// ── parser de tempo ──
assert.equal(m.parseDuration("1h"), 3600);
assert.equal(m.parseDuration("10 min"), 600);
assert.equal(m.parseDuration("3 segundos"), 3);
assert.equal(m.parseDuration("1 hora 10 min e 48 segundos"), 4248);
assert.equal(m.parseDuration("1h10m48s"), 4248);
assert.equal(m.parseDuration("1 hora, 10 minutos e 48 segundos"), 4248);
assert.equal(m.parseDuration("01:10:48"), 4248);
assert.equal(m.parseDuration("1.5h"), 5400);
assert.equal(m.parseDuration("10"), undefined);
assert.equal(m.parseDuration("verifique"), undefined);
assert.equal(m.formatDuration(4248), "1h 10min 48s");

assert.deepEqual(m.splitArgs('"1h 10min 48s" "rode os testes"'), { timeText: "1h 10min 48s", prompt: "rode os testes" });
assert.deepEqual(m.splitArgs("10 min verifique o deploy"), { timeText: "10 min", prompt: "verifique o deploy" });
assert.deepEqual(m.splitArgs("execute isso 10 vezes de 10 em 10 min"), { timeText: "", prompt: "execute isso 10 vezes de 10 em 10 min" });

const body = m.baselineSchedule("", "execute isso 10 vezes de 10 em 10 min");
assert.equal(body.intervalSec, 600);
assert.equal(body.maxRuns, 10);
assert.equal(m.validateSchedule({ intervalSeconds: 0, task: "x" }), undefined);
assert.equal(m.validateSchedule({ intervalSeconds: 60, task: "" }), undefined);

// ── controlador ──
function fixture({ modelReply, cwd = process.cwd(), runAgent, autoTick = false, hasUI = false } = {}) {
  const commands = {}; const handlers = {}; const userMsgs = []; const results = []; const entries = []; const notices = []; const noticeEvents = []; const statuses = [];
  let clock = 1_000_000; let idle = true;
  const pi = {
    registerCommand: (n, c) => { commands[n] = c; }, on: (e, h) => { handlers[e] = h; },
    sendUserMessage: (text, opts) => userMsgs.push({ text, opts }),
    sendMessage: (msg) => results.push(msg), appendEntry: (type, data) => entries.push({ type: "custom", customType: type, data }),
  };
  const ctx = {
    cwd, hasUI, model: { provider: "fake", id: "m" }, isIdle: () => idle,
    modelRegistry: { getApiKeyAndHeaders: async () => ({ ok: true }) },
    sessionManager: { getEntries: () => entries }, ui: {
      notify: (t, type = "info") => { notices.push(t); noticeEvents.push({ text: t, type }); },
      setStatus: (key, text) => statuses.push({ key, text }),
    },
  };
  const complete = async (_model, req) => {
    const text = req.messages[0].content[0].text;
    const reply = typeof modelReply === "function" ? modelReply(text) : modelReply;
    return { content: [{ type: "text", text: reply === undefined ? "no json" : JSON.stringify(reply) }] };
  };
  const ctl = m.registerLoop(pi, { now: () => clock, complete, autoTick, runAgent, worktreeRoot: cwd === process.cwd() ? undefined : path.join(cwd, "..", "wt") });
  return { commands, handlers, userMsgs, results, entries, notices, noticeEvents, statuses, ctx, ctl,
    advance: async (ms) => { clock += ms; ctl.tick(); await new Promise((r) => setTimeout(r, 20)); },
    advanceClock: (ms) => { clock += ms; },
    setIdle: (v) => { idle = v; } };
}

// Status de contagem regressiva atualiza em cada tick de 1 segundo enquanto o loop permanece ativo.
{
  const originalSetInterval = globalThis.setInterval;
  let tickerCallback;
  globalThis.setInterval = (callback, delay) => {
    assert.equal(delay, 1000);
    tickerCallback = callback;
    return 1;
  };
  try {
    const f = fixture({ modelReply: undefined, autoTick: true, hasUI: true });
    await f.commands.loop.handler('"3 segundos" "diga oi"', f.ctx);
    assert.equal(f.ctl.loops.get("L1").status, "active");
    const textAtStart = f.statuses.at(-1)?.text;
    assert.match(textAtStart, /próximo em 3s(?: · \d+ rodando)?$/);
    assert.equal(typeof tickerCallback, "function", "o ticker de 1 segundo foi registrado");

    for (let second = 1; second <= 2; second++) {
      f.advanceClock(1000);
      tickerCallback();
      const current = f.statuses.at(-1)?.text;
      assert.equal(f.ctl.loops.get("L1").status, "active");
      assert.match(current, new RegExp(`próximo em ${3 - second}s(?: · \\d+ rodando)?$`));
      assert.notEqual(current, textAtStart, `status deve mudar após ${second}s`);
    }
  } finally {
    globalThis.setInterval = originalSetInterval;
  }
}

// 1) modelo indisponível → parser local; roda já e depois no intervalo; respeita maxRuns.
{
  const f = fixture({ modelReply: undefined });
  await f.commands.loop.handler('"3 segundos" "diga oi 2 vezes"', f.ctx);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(f.userMsgs.length, 1);
  assert.match(f.userMsgs[0].text, /^\[\/loop L1 · execução 1\/2\] diga oi 2 vezes$/);
  await f.handlers.agent_settled({}, f.ctx);
  await f.advance(2000);
  assert.equal(f.userMsgs.length, 1, "não dispara antes do intervalo");
  await f.advance(1000);
  assert.equal(f.userMsgs.length, 2);
  await f.handlers.agent_settled({}, f.ctx);
  await f.advance(3000);
  assert.equal(f.userMsgs.length, 2, "para após maxRuns");
  assert.equal(f.ctl.loops.get("L1").status, "done");
}

// 2) avisos de disparo ignorado são limitados por loop, com relógio falso e janela exata.
{
  const f = fixture({ cwd: tmpdir(), modelReply: { intervalSeconds: 1, maxRuns: null, totalDurationSeconds: null, runNow: true, dependsOnPrevious: true, task: "rode os testes" } });
  await f.commands.loop.handler('"1s" "rode os testes"', f.ctx);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(f.userMsgs.at(-1).text, "[/loop L1 · execução 1] rode os testes");
  f.setIdle(false);
  const first = f.ctl.loops.get("L1");
  const skipNotices = () => f.notices.filter((text) => text.includes("disparo ignorado"));

  await f.advance(1000); // primeira dependência bloqueada: aviso imediato
  assert.equal(first.skipped, 1);
  assert.equal(skipNotices().length, 1);
  await f.advance(1000); // 1 segundo depois
  assert.equal(first.skipped, 2);
  assert.equal(skipNotices().length, 1);
  await f.advance(1000); // 2 segundos depois
  assert.equal(first.skipped, 3);
  assert.equal(skipNotices().length, 1);
  await f.advance(56_000); // 58 segundos desde o primeiro aviso
  assert(first.skipped > 3, "disparos perdidos continuam contados");
  assert.equal(skipNotices().length, 1, "antes do limite continua suprimido");
  await f.advance(1000); // 59 segundos desde o primeiro aviso
  assert.equal(skipNotices().length, 1, "59 segundos após o primeiro aviso continua suprimido");

  first.schedule.dependsOnPrevious = false; // muda para o outro motivo, mesma instância de Loop
  await f.advance(1000); // 60 segundos desde o aviso inicial
  await new Promise((r) => setTimeout(r, 100)); // aguarda apenas a consulta Git local no diretório temporário
  assert(first.skipped > 3, "cada disparo bloqueado continua contado");
  assert.equal(skipNotices().length, 2, "o segundo aviso fica elegível aos 60 segundos, inclusive ao mudar o motivo");
  await f.advance(59_000); // janela seguinte, 59 segundos após o aviso
  assert.equal(skipNotices().length, 2, "a janela seguinte também suprime antes do limite");
  first.schedule.dependsOnPrevious = true;
  await f.advance(1000);
  assert.equal(skipNotices().length, 3, "a próxima janela reabre exatamente no limite");

  // Um loop diferente recebe seu primeiro aviso imediatamente, sem herdar a janela de L1.
  await f.commands.loop.handler('"1s" "outro trabalho"', f.ctx);
  await new Promise((r) => setTimeout(r, 100)); // aguarda a consulta Git local no diretório temporário
  const second = f.ctl.loops.get("L2");
  assert.equal(second.skipped, 1);
  assert.equal(f.notices.filter((text) => text.includes("/loop L2:") && text.includes("disparo ignorado")).length, 1);

  // Comandos informativos e avisos não relacionados ao throttler continuam imediatos; stop funciona.
  const beforeStop = f.noticeEvents.length;
  await f.commands.loop.handler("stop L1", f.ctx);
  assert.equal(first.status, "stopped");
  assert.equal(f.noticeEvents.length, beforeStop + 1);
  assert.equal(f.noticeEvents.at(-1).type, "info");
  await f.commands.loop.handler("stop L999", f.ctx);
  assert.equal(f.noticeEvents.at(-1).type, "warning");

  const invalid = fixture({ modelReply: undefined });
  await invalid.commands.loop.handler('"invalid" "tarefa"', invalid.ctx);
  assert.equal(invalid.noticeEvents.at(-1).type, "error");

  const completed = fixture({ modelReply: { intervalSeconds: 1, maxRuns: 1, totalDurationSeconds: null, runNow: true, dependsOnPrevious: true, task: "sucesso" } });
  await completed.commands.loop.handler('"1s" "sucesso"', completed.ctx);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(completed.ctl.loops.get("L1").status, "done");
  assert(completed.noticeEvents.some(({ text, type }) => type === "info" && text.includes("concluído")), "conclusão informativa não é suprimida");

  // persistência e restauração
  assert.equal(f.entries.at(-1).customType, "loop-state");
}

// Descriptor is metadata-only: label/status/timing, never the loop prompt.
{
  const f = fixture({ modelReply: undefined });
  const abort = new AbortController();
  f.ctl.jobs.set("L2-3", { loopId: "L2", runNumber: 3, abort, startedAt: 1234 });
  assert.deepEqual(f.ctl.parallelDescriptors(), [{ id: "L2-3", label: "L2 · execução 3", startedAt: 1234, status: "running" }]);
  abort.abort();
  assert.equal(f.ctl.parallelDescriptors()[0].status, "canceling");
  f.ctl.jobs.clear();
}

// 3) loop independente enquanto outro roda → worktree paralela; commits mesclados; nunca em main.
if (process.env.PI_WORK_STATUS_OFFLINE_ONLY !== "1") {
{
  const base = mkdtempSync(path.join(tmpdir(), "pi-loop-smoke-"));
  try {
    const repo = path.join(base, "repo");
    const g = (...a) => execFileSync("git", a, { cwd: repo, stdio: "pipe" }).toString().trim();
    execFileSync("git", ["init", "-q", "-b", "feature", repo]);
    g("config", "user.email", "t@t"); g("config", "user.name", "t");
    writeFileSync(path.join(repo, "a.txt"), "a\n"); g("add", "-A"); g("commit", "-qm", "init");

    const runAgent = async ({ cwd, prompt }) => {
      assert.match(prompt, /worktree isolada/);
      writeFileSync(path.join(cwd, "b.txt"), "feito\n");
      return { code: 0, stdout: "criei b.txt", stderr: "" };
    };
    const f = fixture({ cwd: repo, runAgent, modelReply: (text) => text.includes("TASK A")
      ? { dependent: false }
      : { intervalSeconds: 60, maxRuns: null, totalDurationSeconds: null, runNow: true, dependsOnPrevious: true, task: text.includes("verifique") ? "verifique" : "crie b.txt" } });
    await f.commands.loop.handler('"1 min" "verifique"', f.ctx);       // L1 vai para a sessão principal
    f.setIdle(false);
    await f.commands.loop.handler('"1 min" "crie b.txt"', f.ctx);      // L2 roda em paralelo
    for (let i = 0; i < 100 && f.results.length === 0; i++) await new Promise((r) => setTimeout(r, 50));
    assert.equal(f.results.length, 1, f.notices.join("\n"));
    assert.match(f.results[0].content, /criei b\.txt/);
    assert.match(f.results[0].content, /mesclados em `feature`/);
    assert.equal(readFileSync(path.join(repo, "b.txt"), "utf8").trim(), "feito"); // autocrlf no Windows
    assert.equal(g("worktree", "list").split("\n").length, 1, "worktree removida");
    assert.equal(g("branch", "--list", "loop/*"), "", "branch temporária apagada");

    // Mesmo fluxo com o checkout principal em main: commits ficam na branch loop/.
    g("checkout", "-qb", "main");
    const f2 = fixture({ cwd: repo, runAgent: async ({ cwd }) => { writeFileSync(path.join(cwd, "c.txt"), "c\n"); return { code: 0, stdout: "ok", stderr: "" }; },
      modelReply: (text) => text.includes("TASK A") ? { dependent: false } : { intervalSeconds: 60, runNow: true, dependsOnPrevious: true, task: "t" } });
    await f2.commands.loop.handler('"1 min" "x"', f2.ctx);
    await f2.commands.loop.handler('"1 min" "y"', f2.ctx);
    for (let i = 0; i < 100 && f2.results.length === 0; i++) await new Promise((r) => setTimeout(r, 50));
    assert.match(f2.results[0].content, /ficaram na branch `loop\//);
    assert.equal(existsSync(path.join(repo, "c.txt")), false, "main não foi alterada");
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}
}

console.log("loop smoke OK");
