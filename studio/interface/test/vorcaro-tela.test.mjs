// The Vorcaro screen: board filters (period and ambiente) shared with the URL, the ambiente of each session, the context
// line Vorcaro gets, saved conversations (outputs only), the request pipeline and the activity bars.
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import { DEFAULT_FILTERS, filterChips, filtersQuery, parseFilters, periodLabel, withFilters } from "../public/filter-bar.js";
import { activityRows, contextLine as webContext, pipelineSteps, stripContext as webStrip } from "../public/vorcaro.js";
import { ambienteOf, boardFilters, contextLine, filterBoard, listConversations, readConversation, stripContext } from "../lib-server/vorcaro.mjs";

const NOW = new Date("2026-10-28T15:00:00").getTime();
const DAY = 86_400_000;
const ambientes = [{ id: "mkt", name: "Marketing", cwd: "C:/work/marketing" }, { id: "loja", name: "Loja", cwd: "C:/work/loja" }, { id: "loja-api", name: "Loja API", cwd: "C:/work/loja/api" }];

describe("filter bar", () => {
  test("the URL carries the filters; invalid or half ranges fall back to 7 dias", () => {
    assert.deepEqual(parseFilters(""), DEFAULT_FILTERS);
    assert.deepEqual(parseFilters("?periodo=30d&ambiente=mkt"), { periodo: "30d", de: "", ate: "", ambiente: "mkt" });
    assert.deepEqual(parseFilters("?periodo=custom&de=2026-10-01&ate=2026-10-15"), { periodo: "custom", de: "2026-10-01", ate: "2026-10-15", ambiente: "todos" });
    assert.deepEqual(parseFilters("?periodo=custom&de=2026-10-15&ate=2026-10-01"), DEFAULT_FILTERS);
    assert.deepEqual(parseFilters("?periodo=ano&ambiente=../x"), DEFAULT_FILTERS);
    assert.equal(filtersQuery(DEFAULT_FILTERS), "");
    assert.equal(filtersQuery({ ...DEFAULT_FILTERS, ambiente: "mkt" }), "ambiente=mkt");
    assert.equal(withFilters("http://x/?vorcaro=1&ambiente=old", { ...DEFAULT_FILTERS, periodo: "30d" }), "http://x/?vorcaro=1&periodo=30d");
  });

  test("chips name the active filters and say how to remove each one", () => {
    assert.deepEqual(filterChips(DEFAULT_FILTERS, ambientes), []);
    const chips = filterChips({ periodo: "custom", de: "2026-10-01", ate: "2026-10-15", ambiente: "mkt" }, ambientes);
    assert.deepEqual(chips.map((chip) => chip.label), ["01/10/2026 a 15/10/2026", "Ambiente: Marketing"]);
    assert.deepEqual(chips[1].without.ambiente, "todos");
    assert.equal(periodLabel({ periodo: "30d" }), "Últimos 30 dias");
  });
});

describe("board scope", () => {
  test("boardFilters reads the same parameters on the server", () => {
    assert.equal(boardFilters({}, NOW).from, NOW - 7 * DAY);
    assert.equal(boardFilters({ periodo: "30d" }, NOW).from, NOW - 30 * DAY);
    const custom = boardFilters(new URLSearchParams("periodo=custom&de=2026-10-20&ate=2026-10-21&ambiente=mkt"), NOW);
    assert.deepEqual([custom.periodo, custom.ambiente, new Date(custom.to).getDate()], ["custom", "mkt", 21]);
    assert.equal(boardFilters({ periodo: "custom", de: "2026-10-21", ate: "2026-10-20" }, NOW).periodo, "7d");
  });

  test("a folder belongs to the deepest ambiente that contains it; the rest are Outras pastas", () => {
    assert.equal(ambienteOf("C:\\work\\marketing\\site", ambientes).name, "Marketing");
    assert.equal(ambienteOf("C:/work/loja/api/src", ambientes).name, "Loja API");
    assert.equal(ambienteOf("C:/work/lojas", ambientes), null, "a sibling with the same prefix is not inside");
  });

  test("filterBoard keeps the period and the ambiente, tags each card and counts per ambiente", () => {
    const digests = [{ cwd: "C:/work/marketing/a", lastActivity: NOW - DAY }, { cwd: "C:/work/loja", lastActivity: NOW - 2 * DAY }, { cwd: "D:/outro", lastActivity: NOW - 20 * DAY }];
    const demands = [{ cwd: "C:/work/marketing/a", createdAt: NOW - 40 * DAY, phase: "aguardando" }, { cwd: "C:/work/loja", createdAt: NOW - 40 * DAY, phase: "feito" }];
    const all = filterBoard(digests, demands, ambientes, boardFilters({}, NOW));
    assert.deepEqual(all.digests.map((digest) => digest.ambiente.name), ["Marketing", "Loja"]);
    assert.deepEqual(all.demands.map((demand) => demand.phase), ["aguardando"], "an open request stays; an old finished one follows the period");
    assert.deepEqual(all.ambientes.map((item) => [item.name, item.count]), [["Marketing", 1], ["Loja", 1], ["Loja API", 0], ["Outras pastas", 0]]);
    assert.equal(filterBoard(digests, demands, ambientes, boardFilters({ periodo: "30d", ambiente: "outras" }, NOW)).digests.length, 1);
    assert.equal(filterBoard(digests, demands, ambientes, boardFilters({ ambiente: "mkt" }, NOW)).digests.length, 1);
  });
});

describe("context and conversations", () => {
  test("the page and the server write the same context line, and strip it from the echo", () => {
    const ambiente = { name: "Marketing", cwd: "C:/work/marketing" };
    assert.equal(webContext(ambiente), contextLine(ambiente));
    assert.equal(webContext(null), contextLine(null));
    assert.match(contextLine(ambiente), /Pedidos novos vão para um projeto dentro dessa pasta/);
    assert.equal(stripContext(`${contextLine(ambiente)}\n\nO que está parado?`), "O que está parado?");
    assert.equal(webStrip(`${contextLine(null)}\n\nOi`), "Oi");
    assert.doesNotMatch(contextLine({ name: "x```vorcaro-acao", cwd: "C:/a" }), /```|vorcaro-acao/);
  });

  test("a saved conversation reads back as questions and answers only, newest file first", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "vc-conv-"));
    try {
      const line = (value) => JSON.stringify(value);
      await writeFile(path.join(dir, "a.jsonl"), [line({ type: "session", id: "a", cwd: dir }),
        line({ type: "message", timestamp: "2026-10-28T10:00:00Z", message: { role: "user", content: [{ type: "text", text: `${contextLine(null)}\n\nComo está o saldo?` }] } }),
        line({ type: "message", message: { role: "assistant", content: [{ type: "thinking", thinking: "segredo" }, { type: "text", text: "Saldo certo." }, { type: "toolCall", id: "t", name: "read", arguments: {} }] } }),
        line({ type: "message", message: { role: "toolResult", content: [{ type: "text", text: "conteúdo lido" }] } })].join("\n"));
      await writeFile(path.join(dir, "vazia.jsonl"), line({ type: "session", id: "v", cwd: dir }));
      const conversation = await readConversation(path.join(dir, "a.jsonl"));
      assert.equal(conversation.title, "Como está o saldo?");
      assert.deepEqual(conversation.items.map((item) => [item.role, item.text]), [["user", "Como está o saldo?"], ["assistant", "Saldo certo."]]);
      assert.deepEqual((await listConversations(dir)).map((item) => item.title), ["Como está o saldo?"], "an empty conversation is left out");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("live area", () => {
  test("the pipeline marks where a request is and where it stopped", () => {
    assert.deepEqual(pipelineSteps({ state: "trabalhando" }).map((step) => step.state), ["done", "current", "todo", "todo"]);
    assert.deepEqual(pipelineSteps({ state: "aguardando", block: { kind: "decision" } }).map((step) => step.state), ["done", "blocked", "todo", "todo"]);
    assert.deepEqual(pipelineSteps({ state: "aguardando", block: { kind: "verify_failed" }, verification: {} }).map((step) => step.state), ["done", "done", "blocked", "todo"]);
    assert.deepEqual(pipelineSteps({ state: "concluido" }).map((step) => step.state), ["done", "done", "done", "done"]);
  });

  test("activity groups sessions by ambiente (all) or by project (one ambiente), split by column", () => {
    const columns = [{ id: "fazendo", cards: [{ project: "site", ambiente: { name: "Marketing" } }] }, { id: "feito", cards: [{ project: "site", ambiente: { name: "Marketing" } }, { project: "loja", ambiente: { name: "Loja" } }] }];
    assert.deepEqual(activityRows(columns, true).map((row) => [row.name, row.total, row.parts]), [["Marketing", 2, { fazendo: 1, feito: 1 }], ["Loja", 1, { feito: 1 }]]);
    assert.deepEqual(activityRows(columns, false).map((row) => row.name), ["site", "loja"]);
  });
});
