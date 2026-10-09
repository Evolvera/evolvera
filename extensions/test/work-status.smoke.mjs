import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePiSdkRoot } from "./lib/pi-sdk.mjs";

// STATEFUL RESOURCE PROOF: DISPOSABLE_VERIFIED. In-memory fakes plus one fresh mkdtemp agentDir
// (history + config), removed at the end. No network, model or PI process.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sdkRoot = resolvePiSdkRoot(import.meta.url);
const { createJiti } = createRequire(import.meta.url)(path.join(sdkRoot, "node_modules/jiti/lib/jiti.cjs"));
const jiti = createJiti(import.meta.url, { fsCache: false, alias: { "@earendil-works/pi-coding-agent": path.join(sdkRoot, "dist/index.js") } });
const m = await jiti.import(path.join(root, "extensions/work-status.ts"));

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
assert.equal(m.parsePlan('{"steps":[{"label":"x","status":"done"}]}'), undefined, "etapa sem segundos invalida o plano");
assert.equal(m.nextCheckDelay(400), 200, "reestima na metade do que falta");
assert.equal(m.nextCheckDelay(10), 20, "mínimo de 20 s entre reestimativas");
assert.equal(m.project(100, 30), 70);
assert.equal(m.project(100, 200), 3, "plano estourado: piso de 3 s até a próxima reestimativa");

const rec = (summary, seconds, kind = "feature") => ({ v: 1, kind, summary, seconds });
const hist = [rec("criar extensão comando barra status", 600), rec("criar extensão comando loop agenda", 900), rec("criar extensão comando limpar chat", 300), rec("pergunta rápida", 10, "question")];
const h = m.historyEstimate(hist, "feature", "criar extensão comando barra progresso");
assert.equal(h.n, 3);
assert.ok(h.seconds >= 300 && h.seconds <= 900);
assert.equal(m.historyEstimate(hist, "debug", "x"), undefined);
assert.deepEqual(m.combineEstimate(100, { seconds: 400, n: 3 }), { seconds: 400, source: "history" });
assert.deepEqual(m.combineEstimate(100, { seconds: 400, n: 1 }), { seconds: 200, source: "blend" });
assert.deepEqual(m.combineEstimate(100, undefined), { seconds: 100, source: "model" });

const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");
const line = strip(m.renderLine({ elapsed: 65, remaining: 195, pct: 0.25, label: "Barra de status tarefas", stepsDone: 1, stepsTotal: 4 }, 100));
assert.match(line, /^⏱ 1m 05s \| ~3m 15s  ━+─+ 25%  1\/4  Barra de status tarefas$/);
assert.match(strip(m.renderLine({ elapsed: 400, remaining: 60, pct: 0.87, label: "x", late: true }, 100)), /^⚠ ⏱ 6m 40s \| ~1m 00s .* 87%  x$/, "atrasada: ⚠");
assert.match(strip(m.renderLine({ elapsed: 5, remaining: null, pct: 0, label: "estimando…" }, 100)), /~\? .* 0%/);
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
  const complete = async (model, req) => {
    calls.push({ model, req });
    if (req.systemPrompt === m.REPLAN_PROMPT) return { content: [{ type: "text", text: replanReply }] };
    return { content: [{ type: "text", text: '{"label":"Criar barra de status","summary":"Criar extensão com barra de progresso no rodapé","kind":"feature","seconds":400,"steps":[{"label":"Ler código","seconds":100},{"label":"Implementar barra","seconds":300}]}' }] };
  };
  const flush = () => new Promise((r) => setTimeout(r, 10));
  const ctl = m.registerWorkStatus(pi, { now: () => clock, agentDir: dir, complete, autoTick: false, subagentsRunning: () => subs, parallelJobs: () => jobs });

  await handlers.session_start({}, ctx);
  const widget = widgetFactory(fakeTui, { fg: (_c, t) => t });
  assert.deepEqual(widget.render(80), [], "linha vai no rodapé, não no widget");
  assert.deepEqual(footer.render(80), ["pwd", "stats", "⚡ECO MODE"], "sem tarefa: rodapé intacto");

  await handlers.input({ text: "cria uma barra de status em C:/Users/joao/x.ts", source: "interactive" }, ctx);
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(calls[0].model.id, "claude-haiku-5-5");
  await handlers.agent_start({}, ctx); idle = false;
  await handlers.tool_execution_start({ toolName: "Agent", args: { subagent_type: "scout" } }, ctx);
  clock += 100_000; ctl.tick();
  const shown = footer.render(100);
  assert.equal(shown.length, 4);
  assert.match(shown[3], /^⏱ 1m 40s \| ~5m 00s .* 25%  0\/2  Criar barra de status$/);
  assert.equal(calls.length, 1, "antes da metade: sem reestimativa");

  // metade da estimativa (200 s de 400): o modelo recebe checklist + atividade e reestima.
  clock += 100_000; ctl.tick(); await flush();
  assert.equal(calls.length, 2);
  assert.equal(calls[1].req.systemPrompt, m.REPLAN_PROMPT);
  const replanInput = calls[1].req.messages[0].content[0].text;
  assert.match(replanInput, /1\. \[doing\] Ler código — 100s left/);
  assert.match(replanInput, /tool Agent: .*scout/);
  assert.match(replanInput, /Elapsed so far: 200s/);
  ctl.tick();
  let v = ctl.currentView();
  assert.equal(v.remaining, 500, "restante = soma das etapas abertas");
  assert.equal(v.stepsDone, 1);
  assert.equal(Math.round(v.pct * 100), 29, "200/(200+500)");
  assert.match(footer.render(100)[3], /1\/2  Criar barra de status$/);
  // próxima revisão só depois de metade dos 500 s.
  clock += 240_000; ctl.tick(); await flush();
  assert.equal(calls.length, 2);
  v = ctl.currentView();
  assert.ok(v.late, "passou da 1ª estimativa (400 s): atrasada");
  assert.match(footer.render(100)[3], /^⚠ ⏱ 7m 20s/);
  const pctBefore = v.pct;
  clock += 10_000; ctl.tick(); await flush();
  assert.equal(calls.length, 3, "metade do restante passou: reestima de novo");
  assert.ok(ctl.currentView().pct >= pctBefore, "barra nunca recua");
  await commands.status.handler("plan", ctx);
  assert.match(notices.at(-1), /✓ Ler código\n▶ Implementar barra — ~8m 20s/);

  // principal terminou, mas subagente e job paralelo do /loop seguem: tarefa continua.
  await handlers.agent_settled({}, ctx); idle = true; subs = true; jobs = 1;
  clock += 5000; ctl.tick(); clock += 5000; ctl.tick();
  assert.ok(ctl.getTask(), "subagente/worktree mantém a tarefa viva");
  subs = false; jobs = 0;
  clock += 1000; ctl.tick(); clock += 2500; ctl.tick();
  assert.equal(ctl.getTask(), null);
  assert.match(footer.render(100)[3], /^⏱ 7m 41s \| ✓ .* 100%  2\/2  Criar barra de status/);

  const historyFile = path.join(dir, "work-history.jsonl");
  const saved = JSON.parse(readFileSync(historyFile, "utf8").trim());
  assert.equal(saved.seconds, 461);
  assert.equal(saved.estimate, 400);
  assert.equal(saved.steps, 2);
  assert.equal(saved.replans, 2);
  assert.equal(saved.kind, "feature");
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
  assert.equal(calls.length, 4);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log("work-status smoke OK");
