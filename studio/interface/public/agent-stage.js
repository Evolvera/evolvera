// Palco dos agentes: one node per live agent around the central chat (the Studio's PI, the subagents it delegated to,
// team members and the child sessions a lead opened with team_start), drawn as a tree with the lead on top. A wire
// between two agents lights once when work or a message passes along it; nothing moves in a loop. The pure part
// (stageModel and friends) turns the Studio's data into nodes and wires; createStage owns the DOM.
import { basename, stripEmoji, subagentFamily, thinkingLabel, toolKind, toolPath, truncate } from "./lib.js";
import { isTestCommand } from "./simple-view.js";

export const STATE_LABELS = Object.freeze({
  thinking: "pensando",
  writing: "respondendo",
  coordinating: "coordenando",
  reading: "lendo",
  editing: "editando",
  testing: "testando",
  running: "executando",
  waiting: "aguardando você",
  verified: "pronto e verificado",
  done: "pronto",
  error: "não concluiu",
  idle: "parado",
});

// Status colour of each state: work (accent), wait (amber), ok (green), bad (red), idle (muted).
const TONES = { thinking: "work", writing: "work", coordinating: "work", reading: "work", editing: "work", testing: "work", running: "work", waiting: "wait", verified: "ok", done: "ok", error: "bad", idle: "idle" };
export const toneOf = (state) => TONES[state] ?? "idle";

const money = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Below one cent the number says nothing, so it is left out.
export const formatCost = (value) => (Number(value) >= 0.005 ? `US$ ${money.format(Number(value))}` : "");

const EFFORTS = { minimal: "mínimo", low: "baixo", medium: "médio", high: "alto", xhigh: "máximo" };
export const effortLabel = (level) => (level ? EFFORTS[level] ?? String(thinkingLabel(level)).toLowerCase() : "");

// What a tool call says about its agent: the state and the step to show ("editando" + "pix.ts").
export function toolState(tool) {
  const kind = toolKind(tool?.name);
  const args = tool?.args ?? {};
  if (kind === "read" || kind === "search") return { state: "reading", step: basename(toolPath(args)) || truncate(String(args.pattern ?? ""), 40) || "o código" };
  if (kind === "edit" || kind === "write") return { state: "editing", step: basename(toolPath(args)) || "um arquivo" };
  if (kind === "command") return isTestCommand(args.command) ? { state: "testing", step: truncate(String(args.command), 48) } : { state: "running", step: truncate(String(args.command ?? ""), 48) };
  return { state: "thinking", step: String(tool?.name ?? "") };
}

// pi-subagents' activity line ("read src/x.ts", "bash npm test", "pensando…") read the same way.
export function activityState(text) {
  const line = String(text ?? "").replace(/^└\s*/, "").trim();
  const [verb = "", ...rest] = line.split(/\s+/);
  const arg = rest.join(" ");
  const name = verb.toLowerCase();
  if (/^(read|grep|find|ls|glob|search)$/.test(name)) return { state: "reading", step: basename(arg) || arg };
  if (/^(edit|write|multiedit)$/.test(name)) return { state: "editing", step: basename(arg) || arg };
  if (name === "bash") return isTestCommand(arg) ? { state: "testing", step: truncate(arg, 48) } : { state: "running", step: truncate(arg, 48) };
  return { state: "thinking", step: /^pensando/i.test(line) || /^aguardando/i.test(line) ? "" : truncate(line, 48) };
}

// Did the last tests run after the last edit, and pass? Then a finished agent is "pronto e verificado".
export function verifiedByTests(messages = []) {
  const calls = new Map();
  let lastEdit = -1;
  let lastTest = -1;
  let passed = false;
  messages.forEach((message, index) => {
    if (message?.role === "assistant" && Array.isArray(message.content)) {
      for (const part of message.content) if (part?.type === "toolCall") calls.set(part.id, part);
    } else if (message?.role === "toolResult") {
      const call = calls.get(message.toolCallId);
      const kind = toolKind(call?.name ?? message.toolName);
      if (kind === "edit" || kind === "write") lastEdit = index;
      else if (kind === "command" && isTestCommand(call?.arguments?.command)) {
        lastTest = index;
        passed = !message.isError;
      }
    }
  });
  return lastTest > lastEdit && passed;
}

export function messagesCost(messages = []) {
  let total = 0;
  for (const message of messages) if (message?.role === "assistant") total += Number(message.usage?.cost?.total) || 0;
  return total;
}

function lastAnswer(messages = []) {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message?.role === "user") return "";
    if (message?.role !== "assistant" || !Array.isArray(message.content)) continue;
    const text = message.content.filter((part) => part?.type === "text").map((part) => part.text).join("\n").trim();
    if (text) return text;
  }
  return "";
}

// The Studio's own PI (or the conversation being followed): live phase and tool first, then how it ended.
// main: { title, messages, runtime, streaming, phase, waiting, model, effort, startedAt, goal }
export function mainNode(main = {}, now = Date.now()) {
  const messages = main.messages ?? [];
  let state = "idle";
  let step = "";
  if (main.waiting) {
    state = "waiting";
    step = "uma resposta sua";
  } else if (main.streaming) {
    const tool = [...(main.runtime?.values?.() ?? [])].reverse().find((item) => item?.status === "running" && item.name !== "Agent");
    if (main.phase === "tool" && tool) ({ state, step } = toolState(tool));
    else if (main.phase === "writing") state = "writing";
    else state = "thinking";
  } else if (messages.length) {
    const answer = lastAnswer(messages);
    if (/\?\s*$/.test(answer)) { state = "waiting"; step = "uma resposta sua"; }
    else state = main.goal === "complete" || verifiedByTests(messages) ? "verified" : "done";
  }
  return {
    id: "main",
    parent: null,
    role: "lead",
    glyph: "π",
    name: main.title || "Orquestrador",
    kind: main.kind || "PI",
    model: main.model || "",
    effort: main.effort || "",
    state,
    step,
    elapsed: main.streaming && main.startedAt ? now - main.startedAt : 0,
    cost: messagesCost(messages),
    open: { type: "main" },
  };
}

const FAMILY_NAMES = { scout: "scout", builder: "builder", planner: "planner", research: "pesquisa", "bug-hunt": "caça-bug", qa: "qa", validator: "revisor", general: "agente" };

// One subagent run (collectSubagents/selectedSubagents output).
export function runNode(run, parent = "main") {
  let state = "idle";
  let step = "";
  if (run.indicatorState === "urgent" || run.phase === "waiting") state = "waiting";
  else if (run.phase === "running") ({ state, step } = activityState(run.tail?.[0] ?? ""));
  else if (run.phase === "error") state = "error";
  else if (run.phase === "done") state = "done";
  const family = subagentFamily(run);
  const cost = Number(String(run.stats?.find?.((item) => /^US\$/.test(item)) ?? "").replace(/[^\d.]/g, "")) || 0;
  const name = stripEmoji(run.name || run.title || FAMILY_NAMES[family]).trim() || "agente";
  return {
    id: `run:${run.key}`,
    parent,
    role: family,
    glyph: name.charAt(0).toUpperCase(),
    name: truncate(name, 28),
    kind: name.toLowerCase() === (FAMILY_NAMES[family] ?? "agente") || family === "general" ? "subagente" : `subagente · ${FAMILY_NAMES[family]}`,
    model: run.model || "",
    effort: "",
    state,
    step: step || (state === "idle" || state === "done" ? "" : truncate(run.description || "", 60)),
    task: truncate(run.description || run.title || "", 90),
    elapsed: Number(run.elapsed) || 0,
    cost,
    flowKey: `${run.phase}|${run.endedAt ?? ""}`,
    flowDir: run.phase === "running" ? "down" : "up",
    open: { type: "run", key: run.key },
  };
}

// One team member (GET /api/teams/current). The lead is the open conversation, so its live data comes from mainNode.
export function memberNode(member, now = Date.now()) {
  let state = "idle";
  let step = "";
  if (member.state === "working") {
    ({ state, step } = member.running ? toolState(member.running) : { state: "thinking", step: "" });
  } else if (member.lastOutput) {
    state = /\?\s*$/.test(member.lastOutput) ? "waiting" : "done";
    step = truncate(member.lastOutput, 90);
  }
  return {
    id: `member:${member.name}`,
    parent: member.parent ? `member:${member.parent}` : null,
    role: member.role === "lead" ? "lead" : "member",
    glyph: member.name.charAt(0).toUpperCase(),
    name: member.name,
    kind: member.role === "lead" ? "lead" : "sessão filha",
    model: member.model || "",
    effort: effortLabel(member.effort),
    state,
    step,
    elapsed: state !== "idle" && state !== "done" && member.startedAt ? Math.max(0, now - member.startedAt) : 0,
    cost: Number(member.cost) || 0,
    open: { type: "member", name: member.name },
  };
}

// Everything on the stage. mode: "solo" (one calm node), "crew" (the PI and its subagents) or "team" (team-bus tree).
// input: { main, runs, team, viewing, now }
export function stageModel({ main = {}, runs = [], team = null, viewing = "main", now = Date.now() } = {}) {
  const lead = mainNode({ ...main, team: Boolean(team) }, now);
  const nodes = [lead];
  const wires = [];
  let messages = [];
  if (team?.members?.length > 1) {
    // The open conversation is the team's lead: its node keeps the live data and takes the lead's id for the wires.
    const leadId = team.lead ? `member:${team.lead}` : null;
    if (leadId) lead.kind = `lead · ${team.team}`;
    for (const member of team.members) {
      if (member.role === "lead") continue;
      const node = memberNode(member, now);
      node.parent = !node.parent || node.parent === leadId ? "main" : node.parent;
      nodes.push(node);
    }
    const idOf = (name) => (name === team.lead ? "main" : `member:${name}`);
    messages = (team.messages ?? []).slice(-3).map((item) => ({ ...item, fromId: idOf(item.from), toId: item.to === "all" ? "all" : idOf(item.to) }));
    for (const node of nodes.slice(1)) {
      const name = node.id.slice("member:".length);
      const last = (team.messages ?? []).filter((item) => item.from === name || item.to === name || item.to === "all").at(-1);
      node.flowKey = last ? `${last.at}|${last.from}` : "";
      node.flowDir = last?.from === name ? "up" : "down";
      if (last) node.mail = { text: last.text, from: last.from === name ? "up" : "down", at: last.at };
    }
  }
  for (const run of runs) nodes.push(runNode(run, "main"));
  // A lead that stopped talking while its agents still work is coordinating them, not done.
  if (["done", "verified", "idle"].includes(lead.state) && nodes.some((node) => node !== lead && toneOf(node.state) === "work")) {
    lead.state = "coordinating";
    lead.step = nodes.filter((node) => node !== lead && toneOf(node.state) === "work").map((node) => node.name).join(", ");
  }
  // The lead may run outside the Studio (a terminal or RPC PI): an idle open conversation with no busy members then defers to its fresh heartbeat.
  if (lead.state === "idle" && team?.members?.some((member) => member.role === "lead" && member.state === "working")) {
    lead.state = "thinking";
    lead.step = "trabalhando fora do Studio";
  }
  for (const node of nodes) {
    if (!node.parent) continue;
    wires.push({ id: `${node.parent}>${node.id}`, from: node.parent, to: node.id, tone: toneOf(node.state), flowKey: node.flowKey ?? "", flowDir: node.flowDir ?? "down" });
  }
  for (const node of nodes) {
    node.tone = toneOf(node.state);
    node.label = STATE_LABELS[node.state];
    node.current = node.open?.type === "main" ? viewing === "main" : node.open?.key === viewing || node.open?.name === viewing;
  }
  const working = nodes.filter((node) => node.tone === "work").length;
  const waiting = nodes.filter((node) => node.tone === "wait").length;
  const cost = nodes.reduce((sum, node) => sum + node.cost, 0);
  return {
    mode: team?.members?.length > 1 ? "team" : nodes.length > 1 ? "crew" : "solo",
    nodes,
    wires,
    messages,
    summary: { total: nodes.length, working, waiting, cost, share: cost > 0 ? nodes.filter((node) => node.cost > 0).map((node) => ({ id: node.id, name: node.name, pct: (node.cost / cost) * 100, cost: node.cost })) : [] },
  };
}

// Depth of every node (lead 0), so the stage can lay them out in tiers.
export function tiers(nodes) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const depth = (node, seen = new Set()) => {
    if (!node?.parent || seen.has(node.id) || !byId.has(node.parent)) return 0;
    seen.add(node.id);
    return 1 + depth(byId.get(node.parent), seen);
  };
  const rows = [];
  for (const node of nodes) (rows[Math.min(3, depth(node))] ??= []).push(node);
  return rows.filter(Boolean);
}

// Telemetry under the step (model, effort, cost); the elapsed time sits on the name row.
export function nodeMeta(node) {
  return [node.model, formatCost(node.cost), node.effort].filter(Boolean);
}

// A stopwatch on the node: "8:54", "1h 05" past the hour.
export function clock(ms) {
  const total = Math.floor((Number(ms) || 0) / 1000);
  const minutes = Math.floor(total / 60);
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}`;
  return `${minutes}:${String(total % 60).padStart(2, "0")}`;
}
export const nodeTime = (node) => (node.elapsed >= 1000 ? clock(node.elapsed) : "");

// deps: { root, summary, canvas, mail, toggle, esc, onOpen(node), reduceMotion() -> boolean }
export function createStage(deps) {
  const { root, canvas, esc } = deps;
  const wiresSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  wiresSvg.setAttribute("class", "stage-wires");
  wiresSvg.setAttribute("aria-hidden", "true");
  const tiersBox = document.createElement("div");
  tiersBox.className = "stage-tiers";
  canvas.append(wiresSvg, tiersBox);
  const nodeEls = new Map();
  const flows = new Map();
  let model = null;
  let first = true;
  let drawQueued = false;

  function nodeHtml(node) {
    const meta = nodeMeta(node);
    const time = nodeTime(node);
    return `<span class="ag-rail" aria-hidden="true"></span>
      <span class="ag-top"><span class="ag-glyph" aria-hidden="true">${esc(node.glyph)}</span><span class="ag-id"><strong class="ag-name">${esc(node.name)}</strong><span class="ag-kind">${esc(node.kind)}</span></span></span>
      <span class="ag-line"><span class="ag-state">${esc(node.label)}</span>${time ? `<time class="ag-time">${esc(time)}</time>` : ""}</span>
      <span class="ag-step">${node.step ? esc(node.step) : node.task ? esc(node.task) : ""}</span>
      <span class="ag-meta">${meta.map((item) => `<span>${esc(item)}</span>`).join("") || "<span>&nbsp;</span>"}</span>`;
  }

  function renderSummary() {
    const { summary } = model;
    const parts = [`<span class="st-chip"><b>${summary.total}</b> ${summary.total === 1 ? "agente" : "agentes"}</span>`];
    if (summary.working) parts.push(`<span class="st-chip" data-tone="work"><i aria-hidden="true"></i><b>${summary.working}</b> trabalhando</span>`);
    if (summary.waiting) parts.push(`<span class="st-chip" data-tone="wait"><i aria-hidden="true"></i><b>${summary.waiting}</b> aguardando você</span>`);
    if (summary.cost >= 0.005) {
      const bar = summary.share.map((item) => `<i style="width:${item.pct.toFixed(1)}%" title="${esc(`${item.name}: ${formatCost(item.cost)}`)}"></i>`).join("");
      parts.push(`<span class="st-cost" title="Custo por agente"><span class="st-cost-bar" aria-hidden="true">${bar}</span><b>${esc(formatCost(summary.cost))}</b></span>`);
    }
    deps.summary.innerHTML = parts.join("");
  }

  function renderMail() {
    if (!deps.mail) return;
    const items = model.messages;
    deps.mail.hidden = !items.length;
    const sig = JSON.stringify(items.map((item) => [item.at, item.from, item.to]));
    if (deps.mail.dataset.sig === sig) return;
    const known = new Set((deps.mail.dataset.sig ? JSON.parse(deps.mail.dataset.sig) : []).map((item) => item.join("|")));
    deps.mail.dataset.sig = sig;
    deps.mail.innerHTML = `<li class="mail-head">Mensagens</li>${items.slice().reverse().map((item) => `<li class="mail-item${first || known.has([item.at, item.from, item.to].join("|")) ? "" : " is-new"}"><span class="mail-route"><b>${esc(item.from)}</b><span aria-label="para">›</span><b>${esc(item.toId === "all" ? "todos" : item.to)}</b><time>${esc(new Date(item.at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }))}</time></span><span class="mail-text">${esc(item.text)}</span></li>`).join("")}`;
  }

  function renderNodes() {
    const rows = tiers(model.nodes);
    const seen = new Set();
    rows.forEach((row, depth) => {
      let tier = tiersBox.children[depth];
      if (!tier) {
        tier = document.createElement("div");
        tiersBox.append(tier);
      }
      tier.className = `stage-tier tier-${depth}`;
      row.forEach((node, index) => {
        seen.add(node.id);
        let entry = nodeEls.get(node.id);
        const sig = JSON.stringify([node.name, node.kind, node.label, node.step, node.task, nodeMeta(node), nodeTime(node), node.mail?.text, node.mail?.from]);
        if (!entry) {
          const el = document.createElement("button");
          el.type = "button";
          el.className = "ag-node";
          el.dataset.id = node.id;
          if (!first && !deps.reduceMotion()) el.classList.add("is-new");
          entry = { el, sig: "" };
          nodeEls.set(node.id, entry);
        }
        const { el } = entry;
        if (entry.sig !== sig) {
          const changedState = entry.sig && el.dataset.state !== node.state;
          el.innerHTML = nodeHtml(node);
          entry.sig = sig;
          el.classList.remove("state-changed");
          if (changedState && !deps.reduceMotion()) {
            void el.offsetWidth;
            el.classList.add("state-changed");
          }
        }
        el.dataset.state = node.state;
        el.dataset.tone = node.tone;
        el.dataset.role = node.role;
        el.classList.toggle("is-current", Boolean(node.current));
        el.setAttribute("aria-label", `${node.name}: ${node.label}${node.step ? `, ${node.step}` : ""}. Abrir a conversa.`);
        if (tier.children[index] !== el) tier.insertBefore(el, tier.children[index] || null);
      });
      while (tier.children.length > row.length) tier.lastElementChild.remove();
    });
    while (tiersBox.children.length > rows.length) tiersBox.lastElementChild.remove();
    for (const [id, entry] of nodeEls) if (!seen.has(id)) { entry.el.remove(); nodeEls.delete(id); }
  }

  // Wires go from the bottom of the parent to the top of the child, measured after layout (rows may wrap).
  function drawWires() {
    drawQueued = false;
    if (!model) return;
    const box = canvas.getBoundingClientRect();
    if (!box.width) return;
    wiresSvg.setAttribute("viewBox", `0 0 ${box.width} ${box.height}`);
    wiresSvg.setAttribute("width", box.width);
    wiresSvg.setAttribute("height", box.height);
    const paths = [];
    for (const wire of model.wires) {
      const a = nodeEls.get(wire.from)?.el.getBoundingClientRect();
      const b = nodeEls.get(wire.to)?.el.getBoundingClientRect();
      if (!a || !b) continue;
      const x1 = a.left + a.width / 2 - box.left;
      const y1 = a.bottom - box.top;
      const x2 = b.left + b.width / 2 - box.left;
      const y2 = b.top - box.top;
      const bend = Math.max(12, (y2 - y1) / 2);
      paths.push({ wire, d: `M${x1.toFixed(1)} ${y1.toFixed(1)} C${x1.toFixed(1)} ${(y1 + bend).toFixed(1)} ${x2.toFixed(1)} ${(y2 - bend).toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}` });
    }
    wiresSvg.innerHTML = paths.map(({ wire, d }) => `<path class="wire" data-tone="${wire.tone}" data-wire="${esc(wire.id)}" d="${d}"/><circle class="wire-end" data-tone="${wire.tone}" cx="${d.split(" ").slice(-2)[0]}" cy="${d.split(" ").at(-1)}" r="2.5"/>`).join("");
    // A wire whose flow key changed since the last draw lights once, in the direction the work went.
    for (const { wire, d } of paths) {
      const before = flows.get(wire.id);
      flows.set(wire.id, wire.flowKey);
      if (first || before === undefined || before === wire.flowKey || !wire.flowKey || deps.reduceMotion()) continue;
      const pulse = document.createElementNS("http://www.w3.org/2000/svg", "path");
      pulse.setAttribute("class", "wire-pulse");
      pulse.setAttribute("d", d);
      wiresSvg.append(pulse);
      const length = pulse.getTotalLength();
      const dash = Math.min(46, length / 3);
      pulse.style.strokeDasharray = `${dash} ${length + dash}`;
      const frames = wire.flowDir === "up" ? [{ strokeDashoffset: -length }, { strokeDashoffset: dash }] : [{ strokeDashoffset: dash }, { strokeDashoffset: -length }];
      pulse.animate(frames, { duration: 1100, easing: "cubic-bezier(.32,.72,0,1)" }).finished.then(() => pulse.remove(), () => pulse.remove());
    }
  }

  function queueDraw() {
    if (drawQueued) return;
    drawQueued = true;
    requestAnimationFrame(drawWires);
  }

  new ResizeObserver(queueDraw).observe(canvas);

  canvas.addEventListener("click", (event) => {
    const el = event.target.closest(".ag-node");
    const node = el && model?.nodes.find((item) => item.id === el.dataset.id);
    if (node) deps.onOpen(node);
  });

  return {
    update(next) {
      model = next;
      root.dataset.mode = next.mode;
      renderSummary();
      renderNodes();
      renderMail();
      // The pulses are decided while drawing, so the first draw after an update compares against the last one.
      requestAnimationFrame(() => {
        drawWires();
        first = false;
      });
    },
    redraw: queueDraw,
  };
}
