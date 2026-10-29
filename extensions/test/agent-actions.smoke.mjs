import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePiSdkRoot } from "./lib/pi-sdk.mjs";

// STATEFUL RESOURCE PROOF: DISPOSABLE_VERIFIED. Skills live in a fresh mkdtemp agent dir removed in finally;
// the extension host is an in-memory fake. No network, model, or PI process.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sdkRoot = resolvePiSdkRoot(import.meta.url);
const require = createRequire(import.meta.url);
const { createJiti } = require(path.join(sdkRoot, "node_modules/jiti/lib/jiti.cjs"));
const jiti = createJiti(import.meta.url, { fsCache: false, alias: { "@earendil-works/pi-coding-agent": path.join(sdkRoot, "dist/index.js"), typebox: require.resolve("typebox", { paths: [sdkRoot] }) } });
const m = await jiti.import(path.join(root, "extensions/agent-actions.ts"));

const all = new Set(Object.keys(m.SKILL_TRIGGERS));
assert.deepEqual(m.matchSkills("faça a tela de login com cards e um gráfico de vendas", all), ["veronati", "apexcharts"]);
assert.deepEqual(m.matchSkills("corrija o bug no parser de CSV", all), []);
assert.deepEqual(m.matchSkills("faça tudo até terminar, sem parar", all), ["goal"]);
assert.deepEqual(m.matchSkills("gere o relatório em PDF", new Set(["apexcharts"])), [], "only installed skills are suggested");
assert.equal(m.quote('diga "oi"'), "\"diga 'oi'\"");
assert.deepEqual(m.parseChoice('Resposta: ["veronati", "apexcharts", "inexistente"]', new Set(["veronati", "apexcharts"])), ["veronati", "apexcharts"]);
assert.deepEqual(m.parseChoice('{"skills": ["deep-research"]}', new Set(["deep-research"])), ["deep-research"]);
assert.deepEqual(m.parseChoice("nenhuma", new Set(["x"])), []);
assert.equal(m.quote("a \u201Cb\u201D c"), "\"a 'b' c\"", "curly quotes cannot split /loop arguments");
for (const ok of ["", "10min", "1h 30min", "45s", "2 horas"]) assert.equal(m.validInterval(ok), true, ok);
for (const bad of ['10min" "/goal x', "agora; rm", "x"]) assert.equal(m.validInterval(bad), false, bad);
assert.deepEqual(m.skillDirs("C:/repo", "C:/agent").map((d) => d.replace(/\\/g, "/")), ["C:/agent/skills", "C:/repo/.pi/skills"], "installed skills win name clashes");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-actions-"));
try {
  fs.mkdirSync(path.join(dir, "skills", "veronati", "references"), { recursive: true });
  fs.writeFileSync(path.join(dir, "skills", "veronati", "SKILL.md"), "---\nname: veronati\n---\n# VeroNati\nregras");
  fs.writeFileSync(path.join(dir, "skills", "veronati", "references", "checklist.md"), "x");
  fs.mkdirSync(path.join(dir, "skills", "deep-research"), { recursive: true });
  fs.writeFileSync(path.join(dir, "skills", "deep-research", "SKILL.md"), "---\nname: deep-research\ndescription: Pesquisa profunda na web com cinco perspectivas e um auditor.\n---\n# DR");
  const cat = m.catalog(m.listSkills([path.join(dir, "skills")]));
  assert.equal(cat.get("deep-research"), "Pesquisa profunda na web com cinco perspectivas e um auditor.");
  const tools = new Map(); const handlers = new Map(); const sent = [];
  m.default({ registerTool: (t) => tools.set(t.name, t), on: (n, h) => handlers.set(n, h), sendUserMessage: (c, o) => sent.push({ c, o }) }, dir);

  assert.match(tools.get("skill").description, /- deep-research: Pesquisa profunda/, "the catalog is in the tool description");
  const s = await tools.get("skill").execute("1", { name: "veronati" });
  assert.match(s.content[0].text, /# VeroNati/);
  assert.match(s.content[0].text, /checklist\.md/);
  const missing = await tools.get("skill").execute("2", { name: "nao-existe" });
  assert.equal(missing.isError, true);
  assert.match(missing.content[0].text, /Disponíveis: deep-research, veronati/);

  await tools.get("start_goal").execute("3", { objective: "  Entregar a tela\n de login com testes  " });
  assert.deepEqual(sent.at(-1), { c: "/goal Entregar a tela de login com testes", o: { expandPromptTemplates: true, deliverAs: "followUp" } });
  const long = await tools.get("start_goal").execute("4", { objective: "x".repeat(4_001) });
  assert.equal(long.isError, true);

  const badInterval = await tools.get("schedule_loop").execute("5a", { interval: '10min" "/goal x', prompt: "p" });
  assert.equal(badInterval.isError, true);
  const declined = await tools.get("schedule_loop").execute("5b", { interval: "10min", prompt: "p" }, undefined, undefined, { hasUI: true, ui: { confirm: async () => false } });
  assert.match(declined.content[0].text, /não confirmou/);
  const before = sent.length;
  assert.equal(sent.length, before, "nothing dispatched without confirmation");
  await tools.get("schedule_loop").execute("5", { interval: "10min", prompt: 'revise o "kanban"' });
  assert.equal(sent.at(-1).c, "/loop \"10min\" \"revise o 'kanban'\"");
  await tools.get("stop_loop").execute("6", { id: "all" });
  assert.equal(sent.at(-1).c, "/loop stop all");
  const bad = await tools.get("stop_loop").execute("7", { id: "1; rm -rf" });
  assert.equal(bad.isError, true, "loop ids are plain tokens");

  const primary = { systemPromptOptions: { customPrompt: "# PI Coding Agent\n" }, messageType: "user" };
  const routed = await handlers.get("before_agent_start")({ ...primary, prompt: "monte um dashboard de vendas" });
  assert.equal(routed.message.customType, "skill-router");
  assert.match(routed.message.content, /veronati/);
  assert.equal(await handlers.get("before_agent_start")({ ...primary, prompt: "/goal x" }), undefined, "commands are not routed");
  assert.equal(await handlers.get("before_agent_start")({ ...primary, prompt: "quanto é 2+2" }), undefined);
  assert.equal(await handlers.get("before_agent_start")({ systemPromptOptions: { customPrompt: "You are a scout" }, messageType: "user", prompt: "dashboard" }), undefined, "subagents are not routed");
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log("agent-actions smoke: PASS");
