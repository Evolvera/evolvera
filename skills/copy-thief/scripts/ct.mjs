#!/usr/bin/env node
// ct.mjs — operações determinísticas do Copy Thief no GitHub Project.
// Toda escrita é seguida de releitura; divergência => exit != 0 com mensagem clara.
// Requer: gh autenticado com escopos `project` e `repo`. Sem dependências npm.
//
//   node ct.mjs board   --owner O --project N --repo O/R [--strict]
//   node ct.mjs set     --owner O --project N --repo O/R --issue N [--add]
//                       [--assignee @me|-] [--add-label L]... [--remove-label L]...
//                       [Campo=Valor ...]          ex.: Status="Em andamento" Prioridade=P1
//   node ct.mjs comment --repo O/R --issue N --marker inicio|pesquisa|avaliacao|retro|bloqueio
//                       --body-file arquivo.md
//
// Exit: 0 ok · 1 uso/entrada inválida · 2 falha do gh após novas tentativas ·
//       3 releitura não confere (board divergente) / divergências em `board --strict`.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const GH = process.env.CT_GH || "gh"; // CT_GH permite testar com um gh simulado
const MARKERS = ["inicio", "pesquisa", "avaliacao", "retro", "bloqueio"];

class CtError extends Error {
  constructor(msg, code) { super(msg); this.code = code; }
}
const fail = (msg, code = 1) => { throw new CtError(msg, code); };
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// ---------- gh ----------
function gh(args, { retries = 3, input } = {}) {
  let last;
  for (let i = 0; i < retries; i++) {
    try {
      const [bin, pre] = GH.endsWith(".mjs") ? [process.execPath, [GH]] : [GH, []];
      return execFileSync(bin, [...pre, ...args], { encoding: "utf8", input, stdio: ["pipe", "pipe", "pipe"], maxBuffer: 64 << 20 });
    } catch (e) {
      last = (e.stderr || e.message || "").toString().trim();
      if (/not found|could not resolve|unknown (flag|command)|invalid|does not have|must have|required/i.test(last)) break; // erro de entrada: não adianta repetir
      if (i < retries - 1) sleep([2000, 5000, 10000][i]);
    }
  }
  fail(`gh ${args.slice(0, 3).join(" ")} falhou: ${last}`, 2);
}
const ghJson = (args, opts) => JSON.parse(gh(args, opts) || "null");
const gql = (query, vars = {}) => {
  const args = ["api", "graphql", "-f", `query=${query}`];
  for (const [k, v] of Object.entries(vars)) args.push(typeof v === "number" ? "-F" : "-f", `${k}=${v}`);
  const r = ghJson(args);
  if (r?.errors?.length) fail(`GraphQL: ${r.errors.map((e) => e.message).join("; ")}`, 2);
  return r.data;
};

// ---------- args ----------
function parseArgs(argv) {
  const o = { _: [], "add-label": [], "remove-label": [], fields: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      if (["add", "strict"].includes(k)) { o[k] = true; continue; }
      const v = argv[++i];
      if (v === undefined) fail(`--${k} precisa de valor`);
      Array.isArray(o[k]) ? o[k].push(v) : (o[k] = v);
    } else if (a.includes("=") && o._.length) {
      const j = a.indexOf("=");
      o.fields[a.slice(0, j).trim()] = a.slice(j + 1).trim();
    } else o._.push(a);
  }
  return o;
}
const need = (o, ...ks) => ks.forEach((k) => o[k] || fail(`faltou --${k}`));
const splitRepo = (r) => { const [owner, name] = r.split("/"); if (!owner || !name) fail(`--repo deve ser owner/nome: ${r}`); return { owner, name }; };
const norm = (s) => (s ?? "").normalize("NFC").trim().toLowerCase();

// ---------- project ----------
function loadProject(owner, number) {
  const p = ghJson(["project", "view", String(number), "--owner", owner, "--format", "json"]);
  const d = gql(`query($p:ID!){node(id:$p){... on ProjectV2{fields(first:100){nodes{
    ... on ProjectV2FieldCommon{id name dataType}
    ... on ProjectV2SingleSelectField{options{id name}}}}}}}`, { p: p.id });
  const fields = {};
  for (const x of d.node.fields.nodes) if (x?.name) fields[norm(x.name)] = { id: x.id, name: x.name, type: x.dataType, options: x.options || null };
  if (!fields.status) fail("Project sem campo Status");
  return { id: p.id, number, owner, fields };
}

const FV = `fieldValues(first:50){nodes{
  ... on ProjectV2ItemFieldSingleSelectValue{name field{... on ProjectV2FieldCommon{name}}}
  ... on ProjectV2ItemFieldTextValue{text field{... on ProjectV2FieldCommon{name}}}}}`;
const valuesOf = (item) => {
  const v = {};
  for (const n of item?.fieldValues?.nodes || []) if (n?.field?.name) v[n.field.name] = n.name ?? n.text ?? null;
  return v;
};

function readIssue(repo, number, project) {
  const { owner, name } = splitRepo(repo);
  const d = gql(`query($o:String!,$n:String!,$i:Int!){repository(owner:$o,name:$n){issue(number:$i){
    id number title state url assignees(first:10){nodes{login}} labels(first:50){nodes{name}}
    projectItems(first:50){nodes{id project{id} ${FV}}}}}}`, { o: owner, n: name, i: Number(number) });
  const iss = d?.repository?.issue || fail(`issue #${number} não encontrada em ${repo}`);
  const item = project ? iss.projectItems.nodes.find((x) => x.project.id === project.id) : null;
  return {
    id: iss.id, number: iss.number, title: iss.title, state: iss.state, url: iss.url,
    assignees: iss.assignees.nodes.map((x) => x.login), labels: iss.labels.nodes.map((x) => x.name),
    itemId: item?.id ?? null, values: valuesOf(item),
  };
}

// ---------- comandos ----------
function cmdSet(o) {
  need(o, "owner", "project", "repo", "issue");
  const project = loadProject(o.owner, o.project);
  let iss = readIssue(o.repo, o.issue, project);

  // 1) valida tudo ANTES de escrever (nenhuma escrita parcial por erro de digitação)
  const plan = [];
  for (const [k, v] of Object.entries(o.fields)) {
    const f = project.fields[norm(k)] || fail(`campo inexistente no Project: "${k}". Existentes: ${Object.values(project.fields).map((x) => x.name).join(", ")}`);
    if (f.options) {
      const opt = f.options.find((x) => norm(x.name) === norm(v)) || fail(`opção inválida para ${f.name}: "${v}". Válidas: ${f.options.map((x) => x.name).join(", ")}`);
      plan.push({ f, value: opt.name, args: ["--single-select-option-id", opt.id] });
    } else if (/TEXT/i.test(f.type)) plan.push({ f, value: v, args: ["--text", v] });
    else fail(`tipo de campo não suportado pelo script: ${f.name} (${f.type})`);
  }

  // 2) item no board
  if (!iss.itemId) {
    if (!o.add) fail(`issue #${iss.number} não está no Project ${o.project}; use --add para incluir`, 3);
    gh(["project", "item-add", String(o.project), "--owner", o.owner, "--url", iss.url, "--format", "json"]);
    iss = readIssue(o.repo, o.issue, project);
    if (!iss.itemId) fail(`item-add não refletiu no Project para #${iss.number}`, 3);
  }

  // 3) escritas
  for (const p of plan)
    gh(["project", "item-edit", "--id", iss.itemId, "--project-id", project.id, "--field-id", p.f.id, ...p.args]);
  const ed = ["issue", "edit", String(iss.number), "--repo", o.repo];
  for (const l of o["add-label"]) ed.push("--add-label", l);
  for (const l of o["remove-label"]) ed.push("--remove-label", l);
  if (o.assignee === "-") iss.assignees.forEach((a) => ed.push("--remove-assignee", a));
  else if (o.assignee) ed.push("--add-assignee", o.assignee);
  if (ed.length > 5) gh(ed);

  // 4) releitura e conferência
  const after = readIssue(o.repo, o.issue, project);
  const bad = [];
  for (const p of plan) if (norm(after.values[p.f.name]) !== norm(p.value)) bad.push(`${p.f.name}: esperado "${p.value}", lido "${after.values[p.f.name] ?? "∅"}"`);
  for (const l of o["add-label"]) if (!after.labels.includes(l)) bad.push(`label ${l} ausente`);
  for (const l of o["remove-label"]) if (after.labels.includes(l)) bad.push(`label ${l} ainda presente`);
  if (o.assignee === "-" && after.assignees.length) bad.push(`assignees ainda presentes: ${after.assignees}`);
  if (o.assignee && o.assignee !== "-") {
    const me = o.assignee === "@me" ? gh(["api", "user", "--jq", ".login"]).trim() : o.assignee;
    if (!after.assignees.includes(me)) bad.push(`assignee ${me} ausente`);
  }
  if (bad.length) fail(`RELEITURA NÃO CONFERE em #${after.number}: ${bad.join(" · ")} — pare o loop e corrija o board`, 3);
  out({ ok: true, issue: after.number, status: after.values.Status ?? null, values: after.values, labels: after.labels, assignees: after.assignees });
}

function cmdComment(o) {
  need(o, "repo", "issue", "marker", "body-file");
  if (!MARKERS.includes(o.marker)) fail(`--marker deve ser um de: ${MARKERS.join(", ")}`);
  const tag = `<!-- ct:${o.marker} -->`;
  let body = readFileSync(o["body-file"], "utf8").replace(/\r\n/g, "\n");
  if (!body.trimStart().startsWith(tag)) body = `${tag}\n${body}`;
  const list = () => ghJson(["api", "--paginate", "--slurp", `repos/${o.repo}/issues/${o.issue}/comments?per_page=100`]).flat();
  const same = (c) => c.body.replace(/\r\n/g, "\n").trim() === body.trim();

  if (list().some(same)) return out({ ok: true, dedup: true, marker: o.marker }); // idempotente
  try { gh(["issue", "comment", String(o.issue), "--repo", o.repo, "--body-file", "-"], { input: body, retries: 1 }); }
  catch (e) { // pode ter sido gravado mesmo com erro de rede: confere antes de repetir
    if (!list().some(same)) gh(["issue", "comment", String(o.issue), "--repo", o.repo, "--body-file", "-"], { input: body, retries: 2 });
  }
  const c = list().filter(same).pop() || fail(`RELEITURA NÃO CONFERE: comentário ct:${o.marker} não encontrado em #${o.issue}`, 3);
  out({ ok: true, marker: o.marker, url: c.html_url });
}

function cmdBoard(o) {
  need(o, "owner", "project", "repo");
  const project = loadProject(o.owner, o.project);
  const items = [];
  let after = null;
  do {
    const d = gql(`query($p:ID!,$a:String){node(id:$p){... on ProjectV2{items(first:100,after:$a){
      pageInfo{hasNextPage endCursor}
      nodes{id ${FV} content{__typename
        ... on Issue{number title state url repository{nameWithOwner} assignees(first:10){nodes{login}} labels(first:50){nodes{name}}}
        ... on PullRequest{number title state url repository{nameWithOwner}}}}}}}}`, after ? { p: project.id, a: after } : { p: project.id });
    const page = d.node.items;
    items.push(...page.nodes);
    after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (after);

  const issues = items.filter((x) => x.content?.__typename === "Issue" && x.content.repository.nameWithOwner.toLowerCase() === o.repo.toLowerCase())
    .map((x) => ({ n: x.content.number, t: x.content.title, state: x.content.state, v: valuesOf(x),
      assignees: x.content.assignees.nodes.map((a) => a.login), labels: x.content.labels.nodes.map((l) => l.name) }));
  const prs = ghJson(["pr", "list", "--repo", o.repo, "--state", "all", "--limit", "200", "--json", "number,headRefName,state,url"]);
  const prOf = (n) => prs.filter((p) => new RegExp(`^ct/${n}-`).test(p.headRefName));
  const onBoard = new Set(issues.map((i) => i.n));
  const labeled = ghJson(["issue", "list", "--repo", o.repo, "--label", "copy-thief", "--state", "open", "--limit", "500", "--json", "number"]);

  const div = [];
  for (const i of issues) {
    const s = i.v.Status ?? "∅", open = prOf(i.n).filter((p) => p.state === "OPEN");
    if (i.state === "CLOSED" && s !== "Concluído") div.push(`#${i.n} fechada mas Status=${s} → Concluído`);
    if (i.state === "OPEN" && s === "Concluído") div.push(`#${i.n} aberta mas Status=Concluído`);
    if (s === "Em andamento" && !i.assignees.length) div.push(`#${i.n} Em andamento sem assignee (órfã) → Pronto ou Bloqueado`);
    if (s === "Em revisão" && !open.length) div.push(`#${i.n} Em revisão sem PR aberto de ct/${i.n}-*`);
    if (open.length && !["Em revisão", "Concluído"].includes(s)) div.push(`#${i.n} tem PR aberto (${open.map((p) => p.url).join(", ")}) mas Status=${s} → Em revisão`);
    if (s === "Bloqueado" && !i.labels.includes("precisa-humano")) div.push(`#${i.n} Bloqueado sem label precisa-humano`);
    if (s === "∅") div.push(`#${i.n} sem Status`);
  }
  for (const { number } of labeled) if (!onBoard.has(number)) div.push(`#${number} tem label copy-thief mas não está no Project → set --add`);

  const count = {};
  for (const i of issues) count[i.v.Status ?? "∅"] = (count[i.v.Status ?? "∅"] || 0) + 1;
  out({ ok: div.length === 0, project: o.project, contagem: count, divergencias: div,
    itens: issues.map((i) => ({ n: i.n, t: i.t, estado: i.state, ...i.v, assignees: i.assignees, labels: i.labels, prs: prOf(i.n).map((p) => `${p.state}:${p.url}`) })) });
  if (o.strict && div.length) process.exitCode = 3;
}

const out = (x) => process.stdout.write(JSON.stringify(x, null, 1) + "\n");

try {
  const o = parseArgs(process.argv.slice(2));
  const cmd = { board: cmdBoard, set: cmdSet, comment: cmdComment }[o._[0]];
  if (!cmd) fail("uso: ct.mjs board|set|comment ... (veja o cabeçalho do arquivo)");
  cmd(o);
} catch (e) {
  process.stderr.write(`ct: ${e.message}\n`);
  process.exit(e instanceof CtError ? e.code : 2);
}
