const p = JSON.parse(require("fs").readFileSync(process.argv[2], "utf8"));
const byId = new Map(p.nodes.map((n) => [n.id, n]));
const self = new Map(); const dt = p.timeDeltas; const total = (p.endTime - p.startTime) / 1000;
p.samples.forEach((id, i) => self.set(id, (self.get(id) || 0) + (dt[i] || 0)));
const parent = new Map(); for (const n of p.nodes) for (const c of n.children || []) parent.set(c, n.id);
const agg = new Map(); const inclusive = new Map();
for (const [id, t] of self) {
  const n = byId.get(id); const f = n.callFrame; const key = `${f.functionName || "(anon)"} ${f.url.split("/").slice(-2).join("/")}:${f.lineNumber + 1}`;
  agg.set(key, (agg.get(key) || 0) + t);
  const seen = new Set(); let cur = id;
  while (cur !== undefined) { const cf = byId.get(cur).callFrame; const k = `${cf.functionName || "(anon)"} ${cf.url.split("/").slice(-1)[0]}:${cf.lineNumber + 1}`; if (!seen.has(k)) { seen.add(k); inclusive.set(k, (inclusive.get(k) || 0) + t); } cur = parent.get(cur); }
}
const idle = [...agg].filter(([k]) => /\(idle\)/.test(k)).reduce((s, [, t]) => s + t, 0) / 1000;
console.log("profile ms", Math.round(total), "busy ms", Math.round(total - idle));
console.log("--- self"); [...agg].filter(([k]) => !/\(idle\)|\(program\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 18).forEach(([k, t]) => console.log(Math.round(t / 1000), k));
console.log("--- inclusive (server code)"); [...inclusive].filter(([k]) => /server\.mjs|lib-server|\.mjs/.test(k) && !/prof-run/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 25).forEach(([k, t]) => console.log(Math.round(t / 1000), k));
