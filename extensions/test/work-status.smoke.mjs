import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePiSdkRoot } from "./lib/pi-sdk.mjs";

// STATEFUL RESOURCE PROOF: DISPOSABLE_VERIFIED. In-memory fakes plus one fresh mkdtemp agentDir
// (history + config), removed at the end. No network, model or PI process.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sdkRoot = resolvePiSdkRoot(import.meta.url);
const { createJiti } = createRequire(import.meta.url)(path.join(sdkRoot, "node_modules/jiti/lib/jiti.cjs"));
const jiti = createJiti(import.meta.url, { fsCache: false, alias: {
  "@earendil-works/pi-coding-agent": path.join(sdkRoot, "dist/index.js"),
  "@earendil-works/pi-tui": path.join(sdkRoot, "node_modules/@earendil-works/pi-tui/dist/index.js"),
} });
const m = await jiti.import(path.join(root, "extensions/work-status.ts"));
const { visibleWidth } = await jiti.import("@earendil-works/pi-tui");

// Collect only the two new regression failures so both fronts are exercised in one run.
const regressionFailures = [];
const regression = (name, check) => {
  try { check(); } catch (error) {
    if (!(error instanceof assert.AssertionError)) throw error;
    console.error(`${name}: ${error.message}`);
    regressionFailures.push(name);
  }
};

// ── funções puras ──
assert.equal(m.formatClock(65), "1m 05s");
assert.equal(m.formatClock(3725), "1h 02m");
assert.equal(m.scrub(String.raw`veja C:\Users\joao\proj\a.ts e https://x.com/a joao@x.com 123456`), "veja [caminho] e [url] [email] [n]");
assert.equal(m.scrub("abre ~/projetos/app/main.py"), "abre ~[caminho]");
const parsed = m.parseClassification('ok {"label":"um dois tres quatro cinco seis","summary":"' + "p ".repeat(30) + '","kind":"weird","seconds":90}');
assert.equal(parsed.label.split(" ").length, 5);
assert.equal(parsed.summary.split(" ").length, 20);
assert.equal(parsed.kind, "other");
assert.equal(m.parseClassification("sem json"), undefined);
assert.deepEqual(parsed.steps, []);
const withSteps = m.parseClassification('{"label":"a","summary":"b","kind":"feature","seconds":100,"steps":[{"label":"ler","seconds":30},{"label":"editar","seconds":70}]}');
assert.deepEqual(withSteps.steps, [{ label: "ler", seconds: 30 }, { label: "editar", seconds: 70 }]);
// etapas escaladas para o total escolhido (histórico); primeira já "doing".
assert.deepEqual(m.scaleSteps(withSteps.steps, 200).map((x) => [x.status, x.remaining]), [["doing", 60], ["todo", 140]]);
assert.deepEqual(m.scaleSteps([], 50), [{ label: "executar tarefa", status: "doing", remaining: 50 }]);
const plan = m.parsePlan('{"steps":[{"label":"ler","status":"done","remainingSeconds":9},{"label":"editar","status":"doing","remainingSeconds":40},{"label":"testar","status":"x","remainingSeconds":20}]}');
assert.deepEqual(plan.map((x) => [x.status, x.remaining]), [["done", 0], ["doing", 40], ["todo", 20]]);
assert.equal(m.planRemaining(plan), 60);
const longSteps = [...Array.from({ length: 12 }, (_, i) => ({ label: `completed step ${i + 1}`, status: "done", remainingSeconds: 0 })), { label: "unfinished final step", status: "doing", remainingSeconds: 75 }];
const longPlan = m.parsePlan(JSON.stringify({ steps: longSteps }));
regression("parser preserves thirteenth unfinished step", () => {
  assert.deepEqual({ count: longPlan.length, remaining: m.planRemaining(longPlan) }, { count: 13, remaining: 75 });
  assert.deepEqual(longPlan.map((step) => step.label), longSteps.map((step) => step.label), "completed-step order and final step preserved");
  assert.equal(longPlan[12].status, "doing");
});
assert.equal(m.parsePlan('{"steps":[{"label":"x","status":"done"}]}'), undefined, "etapa sem segundos invalida o plano");
assert.equal(m.nextCheckDelay(400), 200, "cadência é metade da estimativa inicial");
assert.equal(m.nextCheckDelay(10), 5, "estimativa de 10 s reestima após 5 s");
assert.equal(m.nextCheckDelay(0), 0, "estimativa zerada não inventa um prazo");
assert.equal(m.nextCheckDelay(Number.POSITIVE_INFINITY), 0, "estimativa não finita não agenda replanejamento");
assert.equal(m.progressPct(2209, 1108), 2209 / (2209 + 1108));
assert.equal(Math.round(m.progressPct(2209, 1108) * 1000) / 10, 66.6, "36m49s / (36m49s + 18m28s) = 66.6%");
assert.equal(m.progressPct(2209, null), 0, "progresso desconhecido enquanto estima");
assert.equal(m.progressPct(0, 0), 0, "sem divisão por zero no início com estimativa zerada");
assert.equal(m.progressPct(500, null), 0, "progresso desconhecido não se apresenta como conclusão");
assert.equal(m.project(100, 30), 70);
assert.equal(m.project(100, 200), 0, "plano vencido não preserva piso fictício de 3 s");

const rec = (summary, seconds, kind = "feature") => ({ v: 1, kind, summary, seconds, durationClock: m.MAIN_WORK_DURATION_CLOCK });

// Loader safety: retain only the newest 2,000 valid rows in memory; never rewrite history.
const loaderScratch = mkdtempSync(path.join(tmpdir(), "work-history-loader-"));
try {
  const oversizedHistory = path.join(loaderScratch, "work-history.jsonl");
  const sourceRows = Array.from({ length: 2505 }, (_, i) => JSON.stringify({
    v: 1, kind: "feature", summary: `synthetic task ${i}`, seconds: i + 1, estimate: i + 2, source: "model",
    durationClock: m.MAIN_WORK_DURATION_CLOCK, subagents: { count: 0, types: [`not-read-${i}`] }, tools: 1, prompts: 2, parallelJobs: 0,
    ignoredCanary: `not-read-${i}`,
  }));
  const sourceBytes = `${sourceRows.join("\n")}\n`;
  writeFileSync(oversizedHistory, sourceBytes);
  const loadedRows = m.loadHistory(oversizedHistory);
  assert.equal(loadedRows.length, 2000);
  assert.equal(loadedRows[0].summary, "synthetic task 505");
  assert.equal(loadedRows[0].subagents.count, 0);
  assert.deepEqual(loadedRows[0].subagents.types, [], "history loading never reads or retains child labels");
  assert.equal(readFileSync(oversizedHistory, "utf8"), sourceBytes, "loading history never mutates the file, even above the old truncation threshold");
  const invalidHistory = path.join(loaderScratch, "invalid.jsonl");
  writeFileSync(invalidHistory, [
    JSON.stringify({ v: 1, kind: "feature", summary: "valid", seconds: 30, estimate: null, source: "model" }),
    JSON.stringify({ v: 1, kind: "feature", summary: "negative", seconds: -1, estimate: null, source: "model" }),
    '{"v":1,"kind":"feature","summary":"infinite","seconds":1e400,"estimate":null,"source":"model"}',
    "{malformed",
  ].join("\n"));
  const validHistoryRows = m.loadHistory(invalidHistory);
  assert.deepEqual(validHistoryRows.map((row) => row.summary), ["valid"]);
  assert.equal(validHistoryRows[0].subagents.count, null, "missing counters remain unknown instead of implying no parallel work");
} finally {
  rmSync(loaderScratch, { recursive: true, force: true });
}
const unrelated = [rec("database migration schema", 720), rec("responsive home page design", 900), rec("documentation website publishing", 300)];
const noMatch = m.historyEstimate(unrelated, "feature", "orbital mechanics trajectory simulation");
assert.equal(noMatch, undefined, "three unrelated same-category records must not qualify as similar history");
assert.deepEqual(m.combineEstimate(45, noMatch), { seconds: 45, source: "model" }, "no matching history retains the model estimate");
const hist = [rec("criar extensão comando barra status", 600), rec("criar extensão comando loop agenda", 900), rec("criar extensão comando limpar chat", 300), rec("pergunta rápida", 10, "question")];
const h = m.historyEstimate(hist, "feature", "criar extensão comando barra progresso");
assert.equal(h.n, 3);
assert.ok(h.seconds >= 300 && h.seconds <= 900);
assert.equal(m.historyEstimate([rec("criar extensão comando status", Number.POSITIVE_INFINITY)], "feature", "criar extensão comando status"), undefined, "histórico não aceita duração infinita");
assert.equal(m.historyEstimate(hist, "debug", "x"), undefined);
assert.deepEqual(m.combineEstimate(100, { seconds: 400, n: 3 }), { seconds: 200, source: "blend" }, "large-sample history remains a prior instead of replacing the task-specific model estimate");
assert.deepEqual(m.combineEstimate(100, { seconds: 400, n: 1 }), { seconds: 200, source: "blend" });
assert.deepEqual(m.combineEstimate(100, undefined), { seconds: 100, source: "model" });
const historyPromptRows = [100, 200, 300, 400, 500].map((seconds, i) => rec(`private history summary ${i}`, seconds));
const legacyPrior = { ...rec("legacy prompt canary must not be sent", 9000), durationClock: undefined };
const classifierInput = m.buildClassifierInput("current task", [...historyPromptRows, legacyPrior]);
assert.match(classifierInput, /feature: median 300s \(n=5\)/);
assert.ok(!classifierInput.includes("private history summary") && !classifierInput.includes("legacy prompt canary"), "only compatible numeric category aggregates reach the classifier");
assert.ok(!m.buildClassifierInput("current task", historyPromptRows.slice(0, 4)).includes("category priors"), "small category samples are withheld");
assert.equal(m.historyEstimate([legacyPrior], "feature", "legacy prompt canary"), undefined, "unknown legacy clocks do not train the main-work estimator");
assert.match(m.CLASSIFIER_PROMPT, /main-agent active work/);
assert.match(m.REPLAN_PROMPT, /Mark a step done only when/);

const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");
const line = strip(m.renderLine({ elapsed: 65, remaining: 195, pct: 0.25, label: "Barra de status tarefas", stepsDone: 1, stepsTotal: 4 }, 100));
assert.match(line, /^⏱ 1m 05s \| ~3m 15s  ━+─+ 25%  1\/4  Barra de status tarefas$/);
assert.match(strip(m.renderLine({ elapsed: 400, remaining: 60, pct: 0.87, label: "x", late: true }, 100)), /^⚠ ⏱ 6m 40s \| ~1m 00s .* 87%  x$/, "atrasada: ⚠");
assert.match(strip(m.renderLine({ elapsed: 5, remaining: null, pct: 0, label: "estimando…" }, 100)), /~\? .* \?%/);
assert.match(strip(m.renderLine({ elapsed: 9, remaining: 0, pct: 1, label: "x", done: true, late: true }, 100)), /^⏱ 9s \| ✓ .* 100%/);
assert.ok(strip(m.renderLine({ elapsed: 5, remaining: 55, pct: 0.1, label: "a".repeat(200) }, 60)).length <= 60);

// ── controlador ──
const dir = mkdtempSync(path.join(tmpdir(), "work-status-"));
try {
  const handlers = {}; const commands = {}; const notices = []; let clock = 1_000_000;
  let idle = true; let subs = false; let jobs = 0;
  let widgetFactory; let renders = 0;
  class FooterComponent { render() { return ["pwd", "stats", "⚡ECO MODE"]; } }
  const footer = new FooterComponent();
  const fakeTui = { children: [{}, footer], requestRender: () => { renders++; } };
  const pi = { on: (e, h) => { handlers[e] = h; }, registerCommand: (n, c) => { commands[n] = c; } };
  const ctx = {
    hasUI: true, mode: "tui", model: { provider: "anthropic", id: "opus" }, isIdle: () => idle, hasPendingMessages: () => false,
    modelRegistry: { find: (p, id) => ({ p, id }), getApiKeyAndHeaders: async () => ({ ok: true }) },
    ui: { notify: (t) => notices.push(t), setWidget: (k, f, o) => { assert.equal(o.placement, "belowEditor"); widgetFactory = f; } },
  };
  const calls = [];
  const replanReply = '{"steps":[{"label":"Ler código","status":"done","remainingSeconds":0},{"label":"Implementar barra","status":"doing","remainingSeconds":500}]}';
  let overdueResolve;
  const overdueResponse = new Promise((resolve) => { overdueResolve = resolve; });
  const complete = async (model, req) => {
    calls.push({ model, req });
    if (req.systemPrompt === m.REPLAN_PROMPT) {
      if (calls.length === 3) return { content: [{ type: "text", text: '{"steps":[{"label":"Ler código","status":"done","remainingSeconds":0},{"label":"Implementar barra","status":"doing","remainingSeconds":2000}]}' }] };
      if (calls.length === 4) return { content: [{ type: "text", text: '{"steps":[{"label":"Ler código","status":"done","remainingSeconds":0},{"label":"Implementar barra","status":"doing","remainingSeconds":5}]}' }] };
      if (calls.length === 5) return overdueResponse;
      return { content: [{ type: "text", text: replanReply }] };
    }
    return { content: [{ type: "text", text: '{"label":"Criar barra de status","summary":"Criar extensão com barra de progresso no rodapé","kind":"feature","seconds":400,"steps":[{"label":"Ler código","seconds":100},{"label":"Implementar barra","seconds":300}]}' }] };
  };
  const flush = () => new Promise((r) => setTimeout(r, 10));
  const ctl = m.registerWorkStatus(pi, { now: () => clock, agentDir: dir, complete, autoTick: false, subagentsRunning: () => subs, parallelJobs: () => jobs });

  await handlers.session_start({}, ctx);
  const widget = widgetFactory(fakeTui, { fg: (_c, t) => t });
  assert.deepEqual(widget.render(80), [], "linha vai no rodapé, não no widget");
  const initialFooter = footer.render(80);
  assert.equal(initialFooter.length, 4, "o rodapé nativo preserva a linha local de sessão ociosa");
  assert.match(initialFooter[3], /PI #[a-z0-9_-]+\/p\d+ · ocioso/);

  await handlers.input({ text: "cria uma barra de status em C:/Users/joao/x.ts", source: "interactive" }, ctx);
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(calls[0].model.id, "claude-haiku-5-5");
  await handlers.agent_start({}, ctx); idle = false;
  await handlers.tool_execution_start({ toolName: "Agent", args: { subagent_type: "scout" } }, ctx);
  clock += 100_000; ctl.tick();
  const shown = footer.render(100);
  assert.equal(shown.length, 4);
  assert.match(shown[3], /^⏱ 1m 40s \| ~5m 00s .* 25%  0\/2  .*Criar barra de status$/);
  assert.equal(calls.length, 1, "antes da metade: sem reestimativa");

  // metade da estimativa (200 s de 400): o modelo recebe checklist + atividade e reestima.
  clock += 100_000; ctl.tick(); await flush();
  assert.equal(calls.length, 2);
  assert.equal(calls[1].req.systemPrompt, m.REPLAN_PROMPT);
  const replanInput = calls[1].req.messages[0].content[0].text;
  assert.match(replanInput, /1\. \[doing\] Ler código — 100s remaining/);
  assert.match(replanInput, /Elapsed main-work time: 200s/);
  assert.doesNotMatch(replanInput, /Subagents running now|Parallel worktree jobs|scout/, "child counts/types are not replan duration inputs");
  ctl.tick();
  let v = ctl.currentView();
  assert.equal(v.remaining, 500, "restante = soma das etapas abertas");
  assert.equal(v.stepsDone, 1);
  assert.equal(Math.round(v.pct * 100), 29, "200/(200+500)");
  assert.match(footer.render(100)[3], /1\/2  .*Criar barra de status$/);
  // Cadência pela estimativa original T=400 s, mesmo quando a reestimativa altera o restante.
  clock += 199_000; ctl.tick(); await flush();
  assert.equal(calls.length, 2, "não usa metade do novo restante como cadência");
  const pctBefore = ctl.currentView().pct;
  clock += 1_000; ctl.tick(); await flush();
  assert.equal(calls.length, 3, "segunda reestimativa em T=400 s, exatamente 200 s após a anterior");
  assert.equal(ctl.currentView().remaining, 2000);
  clock += 10_000; ctl.tick(); await flush();
  assert.ok(ctl.currentView().late, "passou da 1ª estimativa (400 s): atrasada");
  assert.match(footer.render(100)[3], /^⚠ ⏱ 6m 50s/);
  assert.ok(ctl.currentView().pct < pctBefore, "a barra recua quando a reestimativa aumenta o restante");
  await commands.status.handler("plan", ctx);
  assert.match(notices.at(-1), /✓ Ler código\n▶ Implementar barra — ~33m 20s/);

  // O plano seguinte vence em 5 s e pode antecipar a cadência fixa de T=400 s.
  clock += 190_000; ctl.tick(); await flush();
  assert.equal(calls.length, 4);
  assert.equal(ctl.currentView().remaining, 5);
  clock += 5_000; ctl.tick(); await flush();
  assert.equal(calls.length, 5, "reestima no vencimento do plano, antes da próxima cadência fixa");
  assert.equal(ctl.currentView().remaining, null, "plano vencido não exibe restante positivo fictício");
  assert.match(footer.render(100)[3], /~\? .* \?%/);
  ctl.tick();
  assert.equal(calls.length, 5, "não inicia replans concorrentes");
  overdueResolve({ content: [{ type: "text", text: "resposta inválida" }] });
  await flush();
  clock += 19_000; ctl.tick(); await flush();
  assert.equal(calls.length, 5, "reestimação com falha respeita o intervalo de retry");
  clock += 1_000; ctl.tick(); await flush();
  assert.equal(calls.length, 6, "retry ocorre após 20 s quando a reestimação falha");
  assert.equal(ctl.currentView().remaining, 500, "retry recupera o plano válido");
  await commands.status.handler("plan", ctx);
  assert.match(notices.at(-1), /✓ Ler código\n▶ Implementar barra — ~8m 20s/);

  // principal terminou, mas subagente e job paralelo do /loop seguem: tarefa continua.
  idle = true; subs = true; jobs = 1;
  await handlers.agent_settled({}, ctx);
  clock += 5000; ctl.tick(); clock += 5000; ctl.tick();
  assert.ok(ctl.getTask(), "subagente/worktree mantém a tarefa viva");
  subs = false; jobs = 0; ctl.tick();
  clock += 1000; ctl.tick(); clock += 2500; ctl.tick();
  assert.equal(ctl.getTask(), null);
  assert.match(footer.render(100)[3], /^⏱ 10m 25s \| ✓ .* 100%/);

  const historyFile = path.join(dir, "work-history.jsonl");
  const saved = JSON.parse(readFileSync(historyFile, "utf8").trim());
  assert.equal(saved.seconds, 625, "child-only parallel time is excluded from the main task history");
  assert.equal(saved.estimate, 400);
  assert.equal(saved.steps, 2);
  assert.equal(saved.replans, 5);
  assert.equal(saved.kind, "feature");
  assert.equal(saved.durationClock, m.MAIN_WORK_DURATION_CLOCK, "new history records identify the main-active duration clock");
  assert.deepEqual(saved.subagents, { count: 1, types: ["scout"] });
  assert.deepEqual(saved.models, ["anthropic/opus"]);
  assert.ok(!JSON.stringify(saved).includes("joao") && !JSON.stringify(saved).includes("cria uma barra"), "sem prompt bruto/caminho");

  // /status alterna visibilidade e persiste.
  await commands.status.handler("", ctx);
  assert.equal(JSON.parse(readFileSync(path.join(dir, "work-status.json"), "utf8")).enabled, false);
  await handlers.input({ text: "outra", source: "interactive" }, ctx);
  assert.equal(footer.render(100).length, 3, "oculta");
  await commands.status.handler("on", ctx);
  await commands.status.handler("history", ctx);
  assert.match(notices.at(-1), /1 tarefa/);

  // sessão filha (subagente, sem TUI) não rastreia.
  const h2 = {}; const pi2 = { on: (e, h) => { h2[e] = h; }, registerCommand: () => {} };
  m.registerWorkStatus(pi2, { agentDir: dir, complete, autoTick: false });
  await h2.session_start({}, { ...ctx, hasUI: false, mode: "print" });
  await h2.input({ text: "x", source: "interactive" }, ctx);
  assert.equal(calls.length, 7);

  // Independent active task: a successful zero-remaining plan must honor nextCheck.
  const zeroHandlers = {}; let zeroClock = 2_000_000; let zeroCalls = 0;
  const zeroComplete = async (_model, req) => {
    zeroCalls++;
    const text = req.systemPrompt === m.REPLAN_PROMPT
      ? '{"steps":[{"label":"still active","status":"done","remainingSeconds":0}]}'
      : '{"label":"Check cooldown","summary":"check cooldown","kind":"question","seconds":40,"steps":[{"label":"still active","seconds":40}]}';
    return { content: [{ type: "text", text }] };
  };
  const zeroCtl = m.registerWorkStatus({ on: (event, handler) => { zeroHandlers[event] = handler; }, registerCommand: () => {} }, {
    now: () => zeroClock, agentDir: dir, complete: zeroComplete, autoTick: false, subagentsRunning: () => false, parallelJobs: () => 0,
  });
  const zeroCtx = { ...ctx, isIdle: () => false };
  await zeroHandlers.session_start({}, zeroCtx);
  await zeroHandlers.input({ text: "check cooldown", source: "interactive" }, zeroCtx); await flush();
  await zeroHandlers.agent_start({}, zeroCtx);
  assert.equal(zeroCalls, 1);
  zeroClock += 20_000; zeroCtl.tick(); await flush();
  assert.equal(zeroCalls, 2, "first replan at scheduled halfway point");
  assert.equal(m.planRemaining(zeroCtl.getTask().steps), 0, "all-done zero-second response applied while the main agent is still busy");
  assert.equal(zeroCtl.currentView().remaining, null, "zero plan while busy is shown as unknown, not 3 s");
  assert.equal(zeroCtl.currentView().pct, 0, "all-done model answer cannot claim 100% while the agent is busy");
  zeroClock += 1_000; zeroCtl.tick(); await flush();
  const callsAtOneSecond = zeroCalls;
  zeroClock += 18_000; zeroCtl.tick(); await flush();
  const callsAtNineteenSeconds = zeroCalls;
  zeroClock += 1_000; zeroCtl.tick(); await flush();
  regression("zero-remaining replan honors cooldown", () => {
    assert.deepEqual({ atOneSecond: callsAtOneSecond, atNineteenSeconds: callsAtNineteenSeconds, atTwentySeconds: zeroCalls },
      { atOneSecond: 2, atNineteenSeconds: 2, atTwentySeconds: 3 });
  });
  // Remaining time and nextCheck share the request snapshot, not response receipt.
  const latencyHandlers = {}; let latencyClock = 3_000_000; const latencyCalls = [];
  let resolveLatency; let resolveFailure;
  const delayedPlan = new Promise((resolve) => { resolveLatency = resolve; });
  const delayedFailure = new Promise((resolve) => { resolveFailure = resolve; });
  const shortPlan = { content: [{ type: "text", text: '{"steps":[{"label":"finish check","status":"doing","remainingSeconds":30}]}' }] };
  const latencyComplete = async (_model, req) => {
    latencyCalls.push(req);
    if (req.systemPrompt === m.REPLAN_PROMPT) {
      if (latencyCalls.length === 2) return delayedPlan;
      if (latencyCalls.length === 3) return delayedFailure;
      return shortPlan;
    }
    return { content: [{ type: "text", text: '{"label":"Check latency","summary":"check latency","kind":"question","seconds":400,"steps":[{"label":"finish check","seconds":400}]}' }] };
  };
  const latencyCtl = m.registerWorkStatus({ on: (event, handler) => { latencyHandlers[event] = handler; }, registerCommand: () => {} }, {
    now: () => latencyClock, agentDir: dir, complete: latencyComplete, autoTick: false, subagentsRunning: () => false, parallelJobs: () => 0,
  });
  const latencyCtx = { ...ctx, isIdle: () => false };
  await latencyHandlers.session_start({}, latencyCtx);
  await latencyHandlers.input({ text: "check latency", source: "interactive" }, latencyCtx); await flush();
  await latencyHandlers.agent_start({}, latencyCtx);
  assert.equal(latencyCtl.currentView().remaining, 400);
  latencyClock += 200_000; latencyCtl.tick(); await flush();
  assert.equal(latencyCalls.length, 2);
  assert.match(latencyCalls[1].messages[0].content[0].text, /Elapsed main-work time: 200s/);
  assert.doesNotMatch(latencyCalls[1].messages[0].content[0].text, /Subagents running now|Parallel worktree jobs/);
  const snapshotAt = latencyClock;
  latencyClock += 10_000; resolveLatency(shortPlan); await flush();
  assert.equal(latencyCtl.currentView().remaining, 20, "30s replan minus 10s request latency leaves 20s");
  assert.equal(latencyCtl.getTask().planAt, snapshotAt);
  assert.equal(latencyCtl.getTask().nextCheck, snapshotAt + 200_000, "nextCheck preserves the original-T cadence from the request snapshot");
  latencyCtl.tick(); await flush();
  assert.equal(latencyCalls.length, 2, "response receipt does not trigger an immediate replan");
  latencyClock += 19_000; latencyCtl.tick(); await flush();
  assert.equal(latencyCalls.length, 2, "no replan before the request-anchored estimate expires");
  latencyClock += 1_000; latencyCtl.tick(); await flush();
  assert.equal(latencyCalls.length, 3, "estimate expiry may trigger before the next fixed cadence");
  latencyClock += 7_000;
  resolveFailure({ content: [{ type: "text", text: "invalid response" }] }); await flush();
  assert.equal(latencyCtl.getTask().nextCheck, latencyClock + 20_000, "failed replan retry anchored to failure receipt");
  latencyClock += 19_000; latencyCtl.tick(); await flush();
  assert.equal(latencyCalls.length, 3, "failure cooldown lasts 20s after receipt even when plan expired");
  latencyClock += 1_000; latencyCtl.tick(); await flush();
  assert.equal(latencyCalls.length, 4, "failure retry occurs 20s after receipt");

  // Cadence is based on original T, not a replan's larger/smaller remaining value.
  for (const estimate of [10, 100]) {
    const cadenceHandlers = {}; let cadenceClock = 4_000_000; let cadenceCalls = 0;
    const cadenceComplete = async (_model, req) => {
      cadenceCalls++;
      const text = req.systemPrompt === m.REPLAN_PROMPT
        ? '{"steps":[{"label":"continue","status":"doing","remainingSeconds":3600}]}'
        : `{"label":"cadence ${estimate}","summary":"cadence regression","kind":"question","seconds":${estimate},"steps":[{"label":"continue","seconds":${estimate}}]}`;
      return { content: [{ type: "text", text }] };
    };
    const cadenceCtl = m.registerWorkStatus({ on: (event, handler) => { cadenceHandlers[event] = handler; }, registerCommand: () => {} }, {
      now: () => cadenceClock, agentDir: path.join(dir, `cadence-${estimate}`), complete: cadenceComplete, autoTick: false, subagentsRunning: () => false, parallelJobs: () => 0,
    });
    const cadenceCtx = { ...ctx, isIdle: () => false };
    await cadenceHandlers.session_start({}, cadenceCtx);
    await cadenceHandlers.input({ text: `cadence ${estimate}`, source: "interactive" }, cadenceCtx); await flush();
    await cadenceHandlers.agent_start({}, cadenceCtx);
    const half = estimate * 500;
    cadenceClock += half - 1; cadenceCtl.tick(); await flush();
    assert.equal(cadenceCalls, 1, `T=${estimate}: no check before half-time`);
    cadenceClock += 1; cadenceCtl.tick(); await flush();
    assert.equal(cadenceCalls, 2, `T=${estimate}: first check at T/2`);
    cadenceClock += half - 1; cadenceCtl.tick(); await flush();
    assert.equal(cadenceCalls, 2, `T=${estimate}: cadence does not change with the 3600 s replan`);
    cadenceClock += 1; cadenceCtl.tick(); await flush();
    assert.equal(cadenceCalls, 3, `T=${estimate}: next check is T/2 after the actual replan start`);
  }

  // Compaction/autoretry is ongoing work even during the quiet gap after agent_settled.
  const compactHandlers = {}; let compactClock = 5_000_000; let compactCalls = 0;
  const compactComplete = async (_model, req) => {
    compactCalls++;
    const text = req.systemPrompt === m.REPLAN_PROMPT
      ? '{"steps":[{"label":"finish","status":"doing","remainingSeconds":30}]}'
      : '{"label":"Compact regression","summary":"compact regression","kind":"feature","seconds":4,"steps":[{"label":"finish","seconds":4}]}';
    return { content: [{ type: "text", text }] };
  };
  const compactCtl = m.registerWorkStatus({ on: (event, handler) => { compactHandlers[event] = handler; }, registerCommand: () => {} }, {
    now: () => compactClock, agentDir: path.join(dir, "compact"), complete: compactComplete, autoTick: false,
  });
  const compactCtx = { ...ctx, isIdle: () => true };
  await compactHandlers.session_start({}, compactCtx);
  await compactHandlers.input({ text: "compact regression", source: "interactive" }, compactCtx); await flush();
  await compactHandlers.agent_start({}, compactCtx);
  await compactHandlers.agent_settled({}, compactCtx);
  await compactHandlers.session_before_compact({}, compactCtx);
  await compactHandlers.session_compact({ willRetry: true }, compactCtx);
  compactClock += 5000; compactCtl.tick();
  assert.equal(compactCalls, 1, "expired ETA does not cause a replan during compaction/autoretry");
  assert.ok(compactCtl.getTask(), "autoretry maintenance prevents the 2 s quiet window from completing the task");
  assert.notEqual(compactCtl.currentView().pct, 1, "maintenance cannot publish false 100% completion");
  assert.equal(existsSync(path.join(dir, "compact", "work-history.jsonl")), false, "no history completion is recorded during autoretry");
  await compactHandlers.agent_start({}, compactCtx);
  compactClock += 1000; compactCtl.tick(); await flush();
  assert.equal(compactCalls, 2, "expired ETA can replan again only after main work resumes");
  assert.ok(compactCtl.getTask(), "resumed agent work remains active");
  await compactHandlers.agent_settled({}, compactCtx);
  compactClock += 1000; compactCtl.tick();
  compactClock += 1000; compactCtl.tick();
  assert.ok(compactCtl.getTask(), "real idle still uses the existing quiet confirmation window");
  compactClock += 1000; compactCtl.tick();
  assert.equal(compactCtl.getTask(), null, "only resumed agent idle may complete after maintenance");
  assert.equal(compactCtl.currentView().done, true);

  // Unknown cancel/error terminal states have no SDK event; stay open rather than inventing completion.
  const stuckHandlers = {}; let stuckClock = 6_000_000;
  const stuckCtl = m.registerWorkStatus({ on: (event, handler) => { stuckHandlers[event] = handler; }, registerCommand: () => {} }, {
    now: () => stuckClock, agentDir: path.join(dir, "compact-unobservable"), complete: compactComplete, autoTick: false,
  });
  await stuckHandlers.session_start({}, compactCtx);
  await stuckHandlers.input({ text: "unobservable compact terminal", source: "interactive" }, compactCtx); await flush();
  await stuckHandlers.agent_start({}, compactCtx);
  await stuckHandlers.agent_settled({}, compactCtx);
  await stuckHandlers.session_before_compact({}, compactCtx);
  await stuckHandlers.session_compact({ willRetry: true }, compactCtx);
  stuckClock += 10_000; stuckCtl.tick();
  assert.ok(stuckCtl.getTask(), "without a documented post-cancel/error event, retain the open task");

  // Two isolated root controllers publish/read allowlisted per-process snapshots in one scratch agentDir.
  const sharedAgentDir = path.join(dir, "shared-agent"); mkdirSync(sharedAgentDir, { recursive: true });
  const livePids = new Set([101001, 101002]); let sharedClock = 7_000_000;
  const fakeRegistry = { find: (_provider, id) => ({ provider: "stub", id }), getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "stub-only" }) };
  const makeProbe = ({ pid, sid, cwd, childLabel }) => {
    const probeHandlers = {}; let busy = true;
    const descriptors = [
      { kind: "subagent", label: childLabel, startedAt: sharedClock, status: "running" },
      { kind: "loop", label: `L${pid} · execução 1`, startedAt: sharedClock, status: "running" },
    ];
    let completeCalls = 0;
    const fakeComplete = async (_model, req) => {
      completeCalls++;
      const text = req.systemPrompt === m.REPLAN_PROMPT
        ? '{"steps":[{"label":"continue","status":"doing","remainingSeconds":60}]}'
        : `{"label":"private ${childLabel} bearer sk-probe-secret-123456789","summary":"synthetic status task","kind":"feature","seconds":90,"steps":[{"label":"continue","seconds":90}]}`;
      return { content: [{ type: "text", text }] };
    };
    const probeCtx = {
      hasUI: true, mode: "tui", cwd, model: { provider: "stub", id: "probe" }, isIdle: () => !busy, hasPendingMessages: () => false,
      modelRegistry: fakeRegistry, sessionManager: { getSessionId: () => sid },
      ui: { setWidget: (_name, factory) => factory({ requestRender() {} }, { fg: (_color, text) => `\u001b[31m${text}\u001b[0m` }), notify() {} },
    };
    const ctl = m.registerWorkStatus({ on: (event, handler) => { probeHandlers[event] = handler; }, registerCommand: () => {} }, {
      now: () => sharedClock, agentDir: sharedAgentDir, processId: pid, isAlive: (candidate) => livePids.has(candidate),
      registry: fakeRegistry, complete: fakeComplete, mainBusy: () => busy, parallelDescriptors: () => descriptors, autoTick: false,
    });
    return { ctl, probeHandlers, probeCtx, descriptors, completeCalls: () => completeCalls, setBusy: (value) => { busy = value; } };
  };
  const probeA = makeProbe({ pid: 101001, sid: "a1234567-1111-4111-8111-123456789abc", cwd: "/private/Projeto-α", childLabel: "scout Bearer sk-probe-secret-123456789" });
  const probeB = makeProbe({ pid: 101002, sid: "b2345678-2222-4222-8222-23456789abcd", cwd: "C:\\private\\Projeto-二", childLabel: "builder" });
  await probeA.probeHandlers.session_start({}, probeA.probeCtx);
  await probeB.probeHandlers.session_start({}, probeB.probeCtx);
  const privatePrompt = "PRIVATE-PROMPT bearer sk-probe-secret-123456789 C:\\private\\secret\\prompt.txt";
  await probeA.probeHandlers.input({ text: privatePrompt, source: "interactive" }, probeA.probeCtx); await flush();
  await probeB.probeHandlers.input({ text: "synthetic parallel activity", source: "interactive" }, probeB.probeCtx); await flush();
  assert.equal(probeA.completeCalls(), 1); assert.equal(probeB.completeCalls(), 1, "registry/completer fakes make zero provider calls");
  const rowsA = probeA.ctl.lines(120); const rowsB = probeB.ctl.lines(120);
  for (const rows of [rowsA, rowsB]) {
    const roots = rows.filter((line) => !line.startsWith("  ↳"));
    assert.equal(roots.length, 2, "each process sees exactly one row per live PI root");
    assert.equal(rows.filter((line) => line.startsWith("  ↳")).length, 4, "subagent and loop rows stay separate from both main ETAs");
    assert.ok(roots.some((line) => line.includes("Projeto-α #a12345")));
    assert.ok(roots.some((line) => line.includes("Projeto-二 #b23456")));
    assert.ok(roots.some((line) => line.includes("/p101001")) && roots.some((line) => line.includes("/p101002")), "short identity disambiguates sessions sharing a UUID prefix");
  }
  assert.match(rowsA[0], /~\d/);
  const snapshotsDir = path.join(sharedAgentDir, "work-status-sessions");
  const snapshotNames = readdirSync(snapshotsDir).filter((name) => name.endsWith(".json"));
  assert.equal(snapshotNames.length, 2, "atomic per-process filenames deduplicate each root session");
  const serializedSnapshots = snapshotNames.map((name) => readFileSync(path.join(snapshotsDir, name), "utf8")).join("\n");
  assert.ok(!serializedSnapshots.includes("PRIVATE-PROMPT") && !serializedSnapshots.includes("sk-probe-secret-123456789") && !serializedSnapshots.includes("/private/secret"), "snapshot contains no raw prompt, token, or full path");
  for (const width of [20, 40, 80, 120]) {
    for (const line of probeA.ctl.lines(width)) assert.ok(visibleWidth(line) <= width, `ANSI/Unicode line fits ${width} columns`);
  }

  const ownName = snapshotNames.find((name) => name.startsWith("101001-"));
  const sample = JSON.parse(readFileSync(path.join(snapshotsDir, ownName), "utf8"));
  const deadNonce = "00000000-0000-4000-8000-000000000003";
  const dead = { ...sample, pid: 101003, nonce: deadNonce, sessionId: "dead0000", cwd: "DeadSnapshot", updatedAt: sharedClock, main: { ...sample.main, label: "DEAD MUST NOT SHOW" } };
  writeFileSync(path.join(snapshotsDir, `101003-${deadNonce}.json`), JSON.stringify(dead));
  const foreignNonce = "00000000-0000-4000-8000-000000000004";
  writeFileSync(path.join(snapshotsDir, `101004-${foreignNonce}.json`), JSON.stringify({ ...dead, pid: 101004, nonce: foreignNonce, host: "other-host", cwd: "FOREIGN MUST NOT SHOW" }));
  writeFileSync(path.join(snapshotsDir, "malformed.json"), "{not json; no transcript}");
  livePids.delete(101003); sharedClock += 1001; probeA.ctl.tick(); probeB.ctl.tick();
  const filtered = probeA.ctl.lines(120).join("\n");
  assert.ok(!filtered.includes("DEAD MUST NOT SHOW") && !filtered.includes("FOREIGN MUST NOT SHOW"), "dead, foreign-host and malformed snapshots are ignored");

  const beforeWait = probeA.ctl.currentView();
  probeA.setBusy(false); probeA.ctl.tick();
  sharedClock += 3000; probeA.ctl.tick(); probeB.ctl.tick();
  const duringWait = probeA.ctl.currentView();
  assert.equal(duringWait.elapsed, beforeWait.elapsed, "parallel-only wall time does not inflate the main elapsed time");
  assert.equal(duringWait.remaining, beforeWait.remaining, "parallel-only wall time does not consume the main ETA");
  const waitingRows = probeA.ctl.lines(120);
  assert.match(waitingRows[0], /aguardando paralelos/);
  assert.ok(!waitingRows[0].includes("~"), "waiting main row shows no misleading running ETA");
  assert.match(waitingRows[1], /4s/, "parallel rows show elapsed time, not an ETA");
  probeA.setBusy(true); probeA.descriptors.splice(0);
  probeA.ctl.tick(); sharedClock += 10_000; probeA.ctl.tick(); probeB.ctl.tick();
  assert.equal(Math.round((probeA.ctl.currentView().elapsed - duringWait.elapsed) * 1000) / 1000, 10, "main clock resumes after parallel work ends");

  await probeA.probeHandlers.session_shutdown({}, probeA.probeCtx);
  livePids.delete(101001); sharedClock += 1001; probeB.ctl.tick();
  assert.equal(probeB.ctl.lines(120).filter((line) => !line.startsWith("  ↳")).length, 1, "shutdown removes only its own snapshot");
  await probeB.probeHandlers.session_shutdown({}, probeB.probeCtx);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
assert.deepEqual(regressionFailures, [], "both runtime regressions must pass");
console.log("work-status smoke OK");
