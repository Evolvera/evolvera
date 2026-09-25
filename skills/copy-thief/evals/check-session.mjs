#!/usr/bin/env node
// Verifica, a partir do JSONL de uma sessão do pi, se o Copy Thief foi seguido:
// leituras obrigatórias por ciclo, releitura após compactação, uso do ct.mjs,
// reconciliação no início/fim e handoffs com recibo de leitura.
//   node check-session.mjs <sessão.jsonl>        exit 0 = tudo PASS · 1 = algum FAIL
import { readFileSync } from "node:fs";

const file = process.argv[2];
if (!file) { console.error("uso: check-session.mjs <sessão.jsonl>"); process.exit(2); }

// ---- linha do tempo de eventos relevantes ----
const ev = [];
const results = new Map(); // toolCallId -> texto do resultado
for (const line of readFileSync(file, "utf8").split("\n")) {
  if (!line.trim()) continue;
  let e; try { e = JSON.parse(line); } catch { continue; }
  if (e.type === "compaction") { ev.push({ k: "compaction" }); continue; }
  const m = e.type === "message" && e.message;
  if (!m) continue;
  if (m.role === "toolResult") results.set(m.toolCallId, (m.content || []).map((c) => c.text || "").join("\n"));
  if (m.role !== "assistant" || !Array.isArray(m.content)) continue;
  for (const c of m.content) {
    if (c.type !== "toolCall") continue;
    const name = (c.name || "").toLowerCase(), a = c.arguments || {};
    if (name === "read") ev.push({ k: "read", path: String(a.path || "").replace(/\\/g, "/"), partial: a.offset != null || a.limit != null });
    else if (name === "bash") {
      const cmd = String(a.command || "");
      for (const x of cmd.matchAll(/(?:ct\.mjs|\$\{?CT\}?)\s+(board|set|comment)\b([^\n;&|]*)/g)) ev.push({ k: "ct", sub: x[1], args: x[2] });
      if (/gh\s+project\s+item-edit|gh\s+issue\s+(comment|edit)\b/.test(cmd)) ev.push({ k: "rawgh", cmd: cmd.slice(0, 120) });
      if (/(cat|head|sed|less)\s+[^\n]*(SKILL\.md|metodo-trabalho\.md)/.test(cmd)) ev.push({ k: "read", path: cmd.match(/\S*(SKILL\.md|metodo-trabalho\.md)/)[0], viaBash: true });
    } else if (name === "agent") ev.push({ k: "agent", type: a.subagent_type, prompt: String(a.prompt || ""), id: c.id });
  }
}

const isSkill = (p) => /copy-thief\/SKILL\.md$/i.test(p);
const isLei = (p) => /copy-thief\/references\/metodo-trabalho\.md$/i.test(p);
const cycleStart = (x) => x.k === "ct" && x.sub === "set" && /Status=["']?Em andamento/i.test(x.args);
const checks = [];
const add = (nome, ok, detalhe = "") => checks.push({ nome, ok, detalhe });

// 1) Recarregar no início de CADA ciclo (SKILL.md + metodo-trabalho.md desde o ciclo anterior)
const starts = ev.map((x, i) => (cycleStart(x) ? i : -1)).filter((i) => i >= 0);
add("Houve ao menos um ciclo (set Status=Em andamento via ct.mjs)", starts.length > 0, `${starts.length} ciclo(s)`);
starts.forEach((s, n) => {
  const from = n ? starts[n - 1] + 1 : 0, win = ev.slice(from, s);
  const okS = win.some((x) => x.k === "read" && isSkill(x.path)), okL = win.some((x) => x.k === "read" && isLei(x.path));
  add(`Ciclo ${n + 1}: releu SKILL.md e metodo-trabalho.md antes de reivindicar`, okS && okL, `SKILL.md=${okS} metodo=${okL}`);
});

// 2) Após cada compactação, SKILL.md relido antes da próxima escrita no GitHub
ev.forEach((x, i) => {
  if (x.k !== "compaction") return;
  const next = ev.slice(i + 1);
  const w = next.findIndex((y) => (y.k === "ct" && y.sub !== "board") || y.k === "rawgh");
  if (w < 0) return add(`Compactação #${i}: sem escrita posterior`, true);
  add(`Compactação #${i}: releu SKILL.md antes da próxima escrita`, next.slice(0, w).some((y) => y.k === "read" && isSkill(y.path)));
});

// 3) Escritas pelo script, não gh cru
const raw = ev.filter((x) => x.k === "rawgh");
add("Nenhuma escrita recorrente com gh cru (item-edit / issue comment / issue edit)", raw.length === 0, raw.map((x) => x.cmd).join(" | "));

// 4) Reconciliação no início e no fim
const writes = ev.map((x, i) => (x.k === "ct" && x.sub !== "board" ? i : -1)).filter((i) => i >= 0);
const boards = ev.map((x, i) => (x.k === "ct" && x.sub === "board" ? i : -1)).filter((i) => i >= 0);
if (writes.length) {
  add("board antes da primeira escrita", boards.some((b) => b < writes[0]));
  add("board depois da última escrita", boards.some((b) => b > writes.at(-1)));
}

// 5) Handoffs: template com leitura obrigatória + recibo `Leituras:` no retorno
for (const a of ev.filter((x) => x.k === "agent" && /builder|validator|qa|scout/i.test(x.type || ""))) {
  const tpl = /Leitura OBRIGATÓRIA|OBRIGATÓRIO/i.test(a.prompt) && /Leituras:/i.test(a.prompt);
  const rec = /Leituras:/i.test(results.get(a.id) || "");
  add(`Handoff ${a.type}: template com leitura obrigatória`, tpl);
  if (results.has(a.id)) add(`Handoff ${a.type}: retorno com recibo Leituras:`, rec);
}

// 6) Leituras completas (não parciais) dos arquivos obrigatórios
const partial = ev.filter((x) => x.k === "read" && x.partial && (isSkill(x.path) || isLei(x.path)));
add("SKILL.md/metodo-trabalho.md lidos por inteiro (sem offset/limit)", partial.length === 0, `${partial.length} leitura(s) parcial(is)`);

for (const c of checks) console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.nome}${c.detalhe ? `  — ${c.detalhe}` : ""}`);
const fails = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - fails}/${checks.length} PASS`);
process.exit(fails ? 1 : 0);
