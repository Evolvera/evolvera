// node --test scripts/test/  — testa ct.mjs contra o gh simulado (não toca no GitHub).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const CT = join(here, "..", "ct.mjs");
const FAKE = join(here, "fake-gh.mjs");
const P = ["--owner", "o", "--project", "1", "--repo", "o/r"];

function fresh() {
  const dir = mkdtempSync(join(tmpdir(), "ct-test-"));
  const state = join(dir, "state.json");
  const opt = (names) => names.map((name, k) => ({ id: `${name}-${k}`, name }));
  writeFileSync(state, JSON.stringify({
    repo: "o/r", projectId: "PVT_1", me: "tester", log: [], comments: [],
    fields: [
      { id: "F_S", name: "Status", options: opt(["Backlog", "Pronto", "Em andamento", "Em revisão", "Bloqueado", "Concluído"]) },
      { id: "F_P", name: "Prioridade", options: opt(["P0", "P1", "P2", "P3"]) },
      { id: "F_E", name: "Evidência" },
    ],
    issues: [
      { number: 1, title: "a", state: "OPEN", assignees: [], labels: ["copy-thief"] },
      { number: 2, title: "b", state: "OPEN", assignees: [], labels: ["copy-thief"] },
      { number: 3, title: "c", state: "CLOSED", assignees: [], labels: ["copy-thief"] },
      { number: 4, title: "d", state: "OPEN", assignees: ["tester"], labels: ["copy-thief"] },
    ],
    items: [
      { id: "PVTI_1", issue: 1, values: { Status: "Pronto" } },
      { id: "PVTI_3", issue: 3, values: { Status: "Em revisão" } },
      { id: "PVTI_4", issue: 4, values: { Status: "Pronto" } },
    ],
    prs: [{ number: 9, headRefName: "ct/4-x", state: "OPEN", url: "https://github.com/o/r/pull/9" }],
  }));
  const run = (args, env = {}) => {
    const r = spawnSync(process.execPath, [CT, ...args], { encoding: "utf8", env: { ...process.env, CT_GH: FAKE, CT_FAKE_STATE: state, ...env } });
    return { code: r.status, out: r.stdout, err: r.stderr, json: r.stdout ? JSON.parse(r.stdout) : null };
  };
  return { dir, run, S: () => JSON.parse(readFileSync(state, "utf8")) };
}

test("set grava, atribui e confere por releitura", () => {
  const { run } = fresh();
  const r = run(["set", ...P, "--issue", "1", "--assignee", "@me", "Status=Em andamento", "prioridade=p1", "Evidência=http://x"]);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.json.status, "Em andamento");
  assert.equal(r.json.values.Prioridade, "P1");
  assert.deepEqual(r.json.assignees, ["tester"]);
});

test("opção inválida falha ANTES de qualquer escrita", () => {
  const { run, S } = fresh();
  const r = run(["set", ...P, "--issue", "1", "Status=Em andamento", "Prioridade=P9"]);
  assert.equal(r.code, 1);
  assert.match(r.err, /opção inválida para Prioridade/);
  assert.deepEqual(S().log, []);
});

test("escrita que não reflete no board => exit 3", () => {
  const { run } = fresh();
  const r = run(["set", ...P, "--issue", "1", "Status=Em revisão"], { CT_FAKE_DROP_EDIT: "1" });
  assert.equal(r.code, 3);
  assert.match(r.err, /RELEITURA NÃO CONFERE/);
});

test("issue fora do board exige --add", () => {
  const { run } = fresh();
  assert.equal(run(["set", ...P, "--issue", "2", "Status=Backlog"]).code, 3);
  const r = run(["set", ...P, "--issue", "2", "--add", "Status=Backlog"]);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.json.status, "Backlog");
});

test("bloqueio: label + status conferidos", () => {
  const { run } = fresh();
  const r = run(["set", ...P, "--issue", "4", "--add-label", "precisa-humano", "--assignee", "-", "Status=Bloqueado"]);
  assert.equal(r.code, 0, r.err);
  assert.ok(r.json.labels.includes("precisa-humano"));
  assert.deepEqual(r.json.assignees, []);
});

test("comment prefixa marcador e é idempotente", () => {
  const { run, dir, S } = fresh();
  const f = join(dir, "c.md");
  writeFileSync(f, "### Início\n- Branch: ct/1-a\n");
  const a = run(["comment", "--repo", "o/r", "--issue", "1", "--marker", "inicio", "--body-file", f]);
  assert.equal(a.code, 0, a.err);
  const b = run(["comment", "--repo", "o/r", "--issue", "1", "--marker", "inicio", "--body-file", f]);
  assert.equal(b.json.dedup, true);
  assert.equal(S().comments.length, 1);
  assert.ok(S().comments[0].body.startsWith("<!-- ct:inicio -->"));
});

test("board aponta divergências", () => {
  const { run } = fresh();
  const r = run(["board", ...P, "--strict"]);
  assert.equal(r.code, 3);
  const d = r.json.divergencias.join("\n");
  assert.match(d, /#3 fechada mas Status=Em revisão/);
  assert.match(d, /#4 tem PR aberto .* Status=Pronto/);
  assert.match(d, /#2 tem label copy-thief mas não está no Project/);
  assert.equal(r.json.contagem.Pronto, 2);
});

test("board limpo => ok", () => {
  const { run } = fresh();
  run(["set", ...P, "--issue", "2", "--add", "Status=Backlog"]);
  run(["set", ...P, "--issue", "3", "Status=Concluído"]);
  run(["set", ...P, "--issue", "4", "Status=Em revisão"]);
  const r = run(["board", ...P, "--strict"]);
  assert.equal(r.code, 0, JSON.stringify(r.json?.divergencias));
  assert.equal(r.json.ok, true);
});
