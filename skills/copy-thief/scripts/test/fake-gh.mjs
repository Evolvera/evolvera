#!/usr/bin/env node
// gh simulado para testar ct.mjs sem tocar no GitHub. Estado em $CT_FAKE_STATE (JSON).
// CT_FAKE_DROP_EDIT=1 faz item-edit "funcionar" (exit 0) sem gravar — simula board divergente.
import { readFileSync, writeFileSync } from "node:fs";

const file = process.env.CT_FAKE_STATE;
const S = JSON.parse(readFileSync(file, "utf8"));
const save = () => writeFileSync(file, JSON.stringify(S, null, 1));
const a = process.argv.slice(2);
const flag = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; };
const flags = (k) => a.flatMap((x, i) => (x === k ? [a[i + 1]] : []));
const print = (x) => process.stdout.write(typeof x === "string" ? x + "\n" : JSON.stringify(x));
const die = (m) => { process.stderr.write(m + "\n"); process.exit(1); };
const issue = (n) => S.issues.find((i) => i.number === Number(n)) || die(`issue ${n} not found`);
const fieldName = (id) => S.fields.find((f) => f.id === id).name;
const fv = (it) => ({ nodes: Object.entries(it.values).map(([k, v]) => {
  const f = S.fields.find((x) => x.name === k);
  return f.options ? { name: v, field: { name: k } } : { text: v, field: { name: k } };
}) });
const issueNode = (i) => ({
  id: `I_${i.number}`, number: i.number, title: i.title, state: i.state, url: `https://github.com/${S.repo}/issues/${i.number}`,
  repository: { nameWithOwner: S.repo }, assignees: { nodes: i.assignees.map((login) => ({ login })) },
  labels: { nodes: i.labels.map((name) => ({ name })) },
});

const [c1, c2] = a;
if (c1 === "project" && c2 === "view") print({ id: S.projectId, number: 1 });
else if (c1 === "api" && c2 === "graphql") {
  const q = a[a.indexOf("-f") + 1];
  if (q.includes("fields(first:100)"))
    print({ data: { node: { fields: { nodes: S.fields.map((f) => ({ id: f.id, name: f.name, dataType: f.options ? "SINGLE_SELECT" : "TEXT", ...(f.options ? { options: f.options } : {}) })) } } } });
  else if (q.includes("repository(owner")) {
    const n = Number((a.find((x) => x.startsWith("i=")) || "").slice(2));
    const i = S.issues.find((x) => x.number === n);
    if (!i) print({ data: { repository: { issue: null } } });
    else {
      const it = S.items.find((x) => x.issue === n);
      print({ data: { repository: { issue: { ...issueNode(i), projectItems: { nodes: it ? [{ id: it.id, project: { id: S.projectId }, fieldValues: fv(it) }] : [] } } } } });
    }
  } else if (q.includes("items(first:100")) {
    print({ data: { node: { items: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: S.items.map((it) => ({
      id: it.id, fieldValues: fv(it), content: { __typename: "Issue", ...issueNode(issue(it.issue)) } })) } } } });
  } else die("query desconhecida");
} else if (c1 === "project" && c2 === "item-add") {
  const n = Number(flag("--url").split("/").pop());
  let it = S.items.find((x) => x.issue === n);
  if (!it) { it = { id: `PVTI_${n}`, issue: n, values: {} }; S.items.push(it); save(); }
  print({ id: it.id });
} else if (c1 === "project" && c2 === "item-edit") {
  if (process.env.CT_FAKE_DROP_EDIT) process.exit(0);
  const it = S.items.find((x) => x.id === flag("--id"));
  const f = S.fields.find((x) => x.id === flag("--field-id"));
  it.values[f.name] = f.options ? f.options.find((o) => o.id === flag("--single-select-option-id")).name : flag("--text");
  S.log.push(`edit ${fieldName(f.id)}`); save();
} else if (c1 === "issue" && c2 === "edit") {
  const i = issue(a[2]);
  for (const l of flags("--add-label")) if (!i.labels.includes(l)) i.labels.push(l);
  for (const l of flags("--remove-label")) i.labels = i.labels.filter((x) => x !== l);
  for (const u of flags("--add-assignee")) { const who = u === "@me" ? S.me : u; if (!i.assignees.includes(who)) i.assignees.push(who); }
  for (const u of flags("--remove-assignee")) i.assignees = i.assignees.filter((x) => x !== u);
  S.log.push("issue edit"); save();
} else if (c1 === "api" && c2 === "user") print(S.me);
else if (c1 === "api" && a.includes("--paginate")) {
  const n = Number(a.find((x) => x.includes("/comments")).split("/")[4]);
  print([S.comments.filter((c) => c.issue === n).map((c, k) => ({ body: c.body, html_url: `https://github.com/${S.repo}/issues/${n}#c${k}` }))]);
} else if (c1 === "issue" && c2 === "comment") {
  const body = readFileSync(0, "utf8");
  S.comments.push({ issue: Number(a[2]), body }); S.log.push("comment"); save();
} else if (c1 === "pr" && c2 === "list") print(S.prs);
else if (c1 === "issue" && c2 === "list") print(S.issues.filter((i) => i.state === "OPEN" && i.labels.includes("copy-thief")).map((i) => ({ number: i.number })));
else die(`fake-gh: comando não simulado: ${a.join(" ")}`);
