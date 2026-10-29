// Vorcaro v1, the conductor: follows each request Vorcaro sent (a "demand") until it is verified, blocked or waiting on
// the user. Deterministic, no model call: it reads the session digests the board already keeps, runs the verification
// commands the user approved with the request, and may send at most two short continuations within a budget.
// Rules that keep it from fighting other drivers:
// - an active pi-goal belongs to pi-goal and NatiamG's autopilot: the conductor never continues a session whose goal is
//   still active, nor one that is streaming or showing a dialog (that is the user's to answer);
// - a continuation is written by the conductor from the failed checks and the output of the commands it ran itself,
//   never from text the worker wrote;
// - every step lands in an append-only audit log (vorcaro-auditoria.jsonl), shown on the demand's card.
import { spawn } from "node:child_process";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

export const CONDUCTOR_BUDGET = Object.freeze({ maxContinuations: 2, minGapMs: 2 * 60_000, maxWallMs: 60 * 60_000, maxCostUsd: 3 });
export const VERIFY_TIMEOUT_MS = 10 * 60_000;
const OUTPUT_TAIL = 1_600;
const AUDIT_READ_BYTES = 256 * 1024;

// Phases a demand moves through. "feito" only after the conductor's own verification passed.
export const PHASES = Object.freeze(["enviado", "trabalhando", "verificando", "aguardando", "bloqueado", "feito", "cancelado"]);
const FINAL = new Set(["feito", "cancelado"]);
export const isOpenDemand = (demand) => !FINAL.has(demand?.phase ?? "enviado");

// Typed blocks: why a demand stopped, in the words the card shows.
export const BLOCK_LABELS = Object.freeze({
  credential: "falta uma credencial",
  needs_input: "precisa de uma resposta sua",
  decision: "precisa de uma decisão sua",
  capability: "falta uma ferramenta ou acesso",
  transient: "erro passageiro",
  no_progress: "sem progresso",
  budget: "orçamento esgotado",
  verify_failed: "a verificação falhou",
  session_gone: "a sessão foi encerrada",
});

const squash = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const clip = (value, max) => {
  const text = squash(value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

// The kind of block a stopped session's last words point to (pt-BR and English); null when nothing matches.
export function classifyBlock(text) {
  const value = String(text ?? "");
  if (/\b(api[\s_-]?key|token|credencia\w*|senha|password|unauthori[sz]ed|forbidden|\b401\b|\b403\b|login|autentica\w*)/i.test(value)) return "credential";
  if (/\b(timed? ?out|ECONNRESET|ETIMEDOUT|rate.?limit|\b429\b|\b503\b|overloaded|sobrecarregad\w*|tempor[aá]ri\w*)/i.test(value)) return "transient";
  if (/(command not found|not recognized as|não (?:está|foi) instalad\w*|not installed|sem acesso|não tenho acesso|permission denied|EACCES)/i.test(value)) return "capability";
  if (/\?\s*$/.test(value.trim())) return /\b(prefere|qual (?:opção|caminho|dos)|devo|posso seguir|corrijo|ou fica|which (?:option|approach)|should i|do you want)\b/i.test(value) ? "decision" : "needs_input";
  return null;
}

// Verification commands the conductor will run: test, lint, typecheck and build runners only, plain words (no shell
// operators, quotes, variables or redirections), so an approved line can never smuggle a second command.
const SAFE_ARG = /^[\w@:./=+,-]+$/;
const RUNNERS = [
  /^(?:npm|pnpm|yarn|bun)(?: run)? (?:test|lint|typecheck|check|build)(?::[\w-]+)?$/,
  /^npx (?:vitest|jest|playwright test|tsc)$/,
  /^node --test$/,
  /^node scripts\/[\w./-]+\.m?js$/,
  /^(?:pytest|python -m pytest|py -m pytest)$/,
  /^(?:cargo test|go test|dotnet test)$/,
];
export function verifyCommandAllowed(command) {
  const words = squash(command).split(" ").filter(Boolean);
  if (!words.length || words.length > 12 || !words.every((word) => SAFE_ARG.test(word))) return false;
  if (words.some((word) => word.includes(".."))) return false;
  // The runner is matched on its own words; whatever follows must be plain arguments (files, filters, flags).
  for (let size = Math.min(words.length, 4); size >= 1; size--) {
    if (RUNNERS.some((pattern) => pattern.test(words.slice(0, size).join(" ")))) return true;
  }
  return false;
}
export function cleanVerify(list) {
  return (Array.isArray(list) ? list : []).map((item) => squash(item)).filter(verifyCommandAllowed).slice(0, 4);
}

// Runs the approved commands one after the other in the demand's folder. Never throws: a command that cannot start
// counts as failed, with the reason as its output.
export async function runVerification(commands, cwd, { spawnImpl = spawn, timeoutMs = VERIFY_TIMEOUT_MS, now = Date.now } = {}) {
  const results = [];
  for (const command of commands) {
    if (!verifyCommandAllowed(command)) {
      results.push({ command, ok: false, exit: null, output: "Comando fora da lista permitida; não foi executado.", at: now() });
      continue;
    }
    results.push(await new Promise((resolve) => {
      let output = "";
      let settled = false;
      const finish = (ok, exit, extra = "") => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ command, ok, exit, output: clip(`${output}${extra}`.slice(-OUTPUT_TAIL * 2), OUTPUT_TAIL), at: now() });
      };
      let child;
      try {
        // shell: true lets Windows run npm.cmd; the allowlist above already excludes every shell operator.
        child = spawnImpl(command, { cwd, shell: true, windowsHide: true, env: { ...process.env, CI: "1", FORCE_COLOR: "0" } });
      } catch (error) {
        finish(false, null, `Não iniciou: ${error.message}`);
        return;
      }
      const timer = setTimeout(() => {
        try { child.kill(); } catch { /* already gone */ }
        finish(false, null, `\nParado depois de ${Math.round(timeoutMs / 60_000)} min.`);
      }, timeoutMs);
      const take = (chunk) => { output = `${output}${chunk}`.slice(-OUTPUT_TAIL * 4); };
      child.stdout?.on("data", take);
      child.stderr?.on("data", take);
      child.on("error", (error) => finish(false, null, `Não iniciou: ${error.message}`));
      child.on("close", (code) => finish(code === 0, code));
    }));
  }
  return results;
}

// The next step for one demand, from its own record, the digest of the session it went to and that session's live
// state. Pure: { phase, block, action: "verify" | "continue" | null, reason }.
// digest: scanDigest() output (goalState, endedWith, lastOutput, openItems, cost, lastActivity) or null.
export function nextStep(demand, digest, live = null, { now = Date.now(), budget = CONDUCTOR_BUDGET } = {}) {
  const phase = demand.phase ?? "enviado";
  if (FINAL.has(phase)) return { phase, block: demand.block ?? null, action: null };
  if (!digest) return { phase: phase === "enviado" ? "enviado" : phase, block: null, action: null };
  if (live?.waitingUi) return { phase: "aguardando", block: { kind: "needs_input", question: "A sessão abriu uma pergunta na tela." }, action: null };
  const goal = digest.goalState?.status;
  if (live?.streaming || goal === "active") return { phase: "trabalhando", block: null, action: null };
  if (phase === "verificando") return { phase, block: null, action: null };

  const spent = Math.max(0, (Number(digest.cost) || 0) - (Number(demand.costAtStart) || 0));
  const outOfBudget = spent > budget.maxCostUsd || now - demand.createdAt > budget.maxWallMs;
  const verification = demand.verification ?? null;
  const verifiedSince = verification && verification.at >= digest.lastActivity;

  if (goal === "blocked" || (digest.endedWith === "stop" && /\?\s*$/.test(digest.lastOutput ?? "") && goal !== "complete")) {
    const kind = classifyBlock(digest.lastOutput) ?? (goal === "blocked" ? "needs_input" : "needs_input");
    const hard = kind === "credential" || kind === "capability";
    return { phase: hard ? "bloqueado" : "aguardando", block: { kind, question: clip(digest.lastOutput, 240) }, action: null };
  }
  // Finished (goal complete, or the turn ended with nothing open): verify once per new activity.
  const finished = goal === "complete" || (digest.endedWith === "stop" && !digest.openItems?.length);
  if (finished && !verifiedSince) {
    if (!demand.verify?.length) return { phase: "aguardando", block: { kind: "verify_failed", question: "Sem comando de verificação aprovado: confira o resultado e marque como feito." }, action: null };
    return { phase: "verificando", block: null, action: "verify" };
  }
  if (verifiedSince && verification.ok) return { phase: "feito", block: null, action: null };

  // Stopped without passing: a short continuation within the budget, never twice in a row without a new check.
  const failed = verifiedSince && !verification.ok;
  const stalled = !finished && (digest.endedWith === "error" || digest.endedWith === "aborted" || digest.endedWith === "stop");
  if (!failed && !stalled) return { phase: "trabalhando", block: null, action: null };
  // The last continuation has not reached the session yet: wait for it instead of sending another.
  if (demand.lastContinuationAt && demand.lastContinuationAt > digest.lastActivity) return { phase: "trabalhando", block: null, action: null };
  const used = Number(demand.continuations) || 0;
  if (used >= budget.maxContinuations) return { phase: "aguardando", block: { kind: failed ? "verify_failed" : "no_progress", question: `Parei depois de ${used} continuações. Quer mais duas rodadas?` }, action: null };
  if (outOfBudget) return { phase: "aguardando", block: { kind: "budget", question: `Orçamento do pedido esgotado (US$ ${spent.toFixed(2)} ou mais de ${Math.round(budget.maxWallMs / 60_000)} min).` }, action: null };
  if (demand.lastContinuationAt && now - demand.lastContinuationAt < budget.minGapMs) return { phase: "trabalhando", block: null, action: null };
  if (stalled && classifyBlock(digest.lastOutput) === "credential") return { phase: "bloqueado", block: { kind: "credential", question: clip(digest.lastOutput, 240) }, action: null };
  // A continuation needs the Studio's PI for that conversation; a closed one waits for the user to reopen it.
  if (live?.gone) return { phase: "aguardando", block: { kind: "session_gone", question: "Abra a conversa de novo para o Vorcaro continuar." }, action: null };
  return { phase: "trabalhando", block: null, action: "continue", reason: failed ? "verify_failed" : "stalled" };
}

// The session a demand went to: the one it was sent to when known, else the newest session of its folder written after it.
export function digestFor(demand, digests) {
  const key = (value) => path.resolve(String(value)).replaceAll("\\", "/").toLowerCase();
  if (demand.sessionFile) {
    const exact = digests.find((digest) => key(digest.path) === key(demand.sessionFile));
    if (exact) return exact;
  }
  return digests.filter((digest) => key(digest.cwd) === key(demand.cwd) && digest.lastActivity >= demand.createdAt).sort((a, b) => b.lastActivity - a.lastActivity)[0] ?? null;
}

// The continuation the conductor sends: the objective again as /goal (pi-goal re-arms), the checks that failed with
// the tail of their own output, and the attempt number. Nothing in it comes from the worker's text.
export function continuationMessage(demand, attempt) {
  const lines = [`/goal ${demand.objetivo}`, "", `Continuação ${attempt} de ${CONDUCTOR_BUDGET.maxContinuations}, enviada pelo Vorcaro no PI Studio.`];
  const failed = (demand.verification?.results ?? []).filter((result) => !result.ok);
  if (failed.length) {
    lines.push("", "O Vorcaro rodou a verificação e falhou:");
    for (const result of failed) lines.push(`- \`${result.command}\` (saída ${result.exit ?? "sem código"}): ${clip(result.output, 400).replace(/`{3,}/g, "'''")}`);
  } else {
    lines.push("", "A sessão parou antes de concluir o objetivo.");
  }
  if (demand.checklist?.length) lines.push("", "Aceite:", ...demand.checklist.map((item) => `- [ ] ${item}`));
  lines.push("", "Corrija o que falta, rode a verificação de novo e só conclua o objetivo com ela passando.");
  return lines.join("\n");
}

// Append-only audit log, one JSON object per line.
export function createAudit(file, { now = Date.now } = {}) {
  return {
    async record(demandId, type, data = {}, actor = "vorcaro") {
      await mkdir(path.dirname(file), { recursive: true });
      await appendFile(file, `${JSON.stringify({ at: now(), demandId, type, actor, data })}\n`, "utf8");
    },
    // The last events per demand (newest last), read from the tail of the file.
    async byDemand(limit = 8) {
      let text = "";
      try { text = await readFile(file, "utf8"); } catch { return new Map(); }
      if (text.length > AUDIT_READ_BYTES) text = text.slice(text.indexOf("\n", text.length - AUDIT_READ_BYTES) + 1);
      const map = new Map();
      for (const line of text.split("\n")) {
        let event;
        try { event = JSON.parse(line); } catch { continue; }
        if (!event?.demandId) continue;
        const list = map.get(event.demandId) ?? [];
        list.push(event);
        if (list.length > limit) list.shift();
        map.set(event.demandId, list);
      }
      return map;
    },
  };
}

export const AUDIT_LABELS = Object.freeze({
  dispatched: "pedido enviado",
  verify_started: "verificação iniciada",
  verify_result: "verificação",
  continuation_sent: "continuação enviada",
  blocked: "parado",
  done: "concluído e verificado",
  phase: "mudou de estado",
});
