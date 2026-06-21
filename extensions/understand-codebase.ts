/**
 * Understand Codebase Tool Extension
 *
 * A read-only codebase-understanding tool callable by any agent. It runs a small
 * LLM-driven investigation loop on a fast model (Codex Spark by default):
 *   1. PLAN   — the model proposes read-only search commands (rg/grep/find/ls/wc).
 *   2. SEARCH — the harness executes those commands (sandboxed, read-only).
 *   3. PICK   — the model picks the most important files/ranges to read.
 *   4. READ   — the harness reads those files in parallel (bounded).
 *   5. SYNTH  — the model writes a structured answer with `path:line` citations.
 *
 * Every LLM step degrades gracefully: if the model is unavailable or returns
 * unparseable output, the tool falls back to deterministic ripgrep evidence so
 * it never breaks. The model only ever drives read-only search/read — the harness
 * validates and executes; the model never runs arbitrary shell.
 *
 * Usage (agent tool call):
 *   understand_codebase({ question: "how does auth token refresh work?" })
 *   understand_codebase({ question: "...", paths: "src/auth src/api" })
 */

import { complete, type UserMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { isAbsolute, join, normalize } from "node:path";

const execFileAsync = promisify(execFile);

// Bounds.
const MAX_COMMANDS = 8;
const MAX_CMD_OUTPUT_CHARS = 4000;
const MAX_SEARCH_CHARS = 16_000;
const MAX_READ_FILES = 6;
const MAX_READ_LINES = 160;
const MAX_FILE_CHARS = 24_000;
const FALLBACK_MATCH_LINES = 400;

// Read-only command sandbox: only these binaries may run, no shell metacharacters.
const ALLOWED_BINS = new Set(["rg", "grep", "egrep", "fgrep", "find", "ls", "wc", "head", "tail"]);

const PLAN_SYSTEM = `You plan a READ-ONLY investigation of a code repository to answer a QUESTION.

Output ONLY a JSON object: {"commands": ["rg ...", "find ..."]}.
Rules:
- Allowed binaries only: rg, grep, find, ls, wc (you may pipe to head/tail).
- Read-only: no file writes, no redirection (>), no ;, &, backticks, or $( ).
- Prefer ripgrep with -n and --ignore-case and concrete symbols/terms from the question.
- Propose 2-6 targeted commands that locate the code needed to answer.
- If paths are provided, scope searches to them.`;

const PICK_SYSTEM = `Given a QUESTION and SEARCH RESULTS from a repository, choose the few files most worth reading in full to answer.

Output ONLY a JSON object: {"files": [{"path": "rel/path", "start": 40, "end": 120}]}.
Rules:
- At most 6 files. Use relative paths exactly as they appear in the search results.
- start/end are optional 1-based line ranges; omit them to read the head of the file.
- If the search results already fully answer the question, output {"files": []}.`;

const SYNTH_SYSTEM = `You are a read-only codebase scout. You receive a QUESTION and EVIDENCE (search results + file excerpts with file:line). Produce a concise, grounded report.

Sections:
- Answer: directly answer the question from the evidence.
- Key locations: bullet list of \`path:line\` entries, each with a one-line note.
- How it works / data flow: short explanation grounded in the excerpts.
- Gaps / unverified: what the evidence does not show, plus the next search to run.

Rules: cite only file:line present in the evidence; never invent files, symbols, or behavior; if evidence is insufficient, say so and suggest the next step. Keep it tight, no preamble.`;

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function normalizeStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

async function run(cwd: string, command: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("bash", ["-lc", command], { cwd, timeout: 30_000, maxBuffer: 1024 * 1024 * 8 });
    return stdout;
  } catch (error) {
    return (error as { stdout?: string }).stdout ?? "";
  }
}

function isSafeSearchCommand(cmd: string): boolean {
  const c = cmd.trim();
  if (!c || c.length > 400) return false;
  if (/[;&><`]|\$\(|\$\{|\n|\r/.test(c)) return false;
  const segments = c.split("|").map((s) => s.trim()).filter(Boolean);
  if (!segments.length) return false;
  for (const seg of segments) {
    const bin = seg.split(/\s+/)[0];
    if (!ALLOWED_BINS.has(bin)) return false;
  }
  return true;
}

async function runSearchCommands(cwd: string, commands: string[]): Promise<{ text: string; ran: number; skipped: number }> {
  let text = "";
  let ran = 0;
  let skipped = 0;
  for (const raw of commands.slice(0, MAX_COMMANDS)) {
    const cmd = normalizeStr(raw);
    if (!isSafeSearchCommand(cmd)) {
      skipped++;
      continue;
    }
    const out = (await run(cwd, `${cmd} 2>/dev/null | head -n 120`)).slice(0, MAX_CMD_OUTPUT_CHARS);
    ran++;
    text += `\n$ ${cmd}\n${out.trim() || "(no output)"}\n`;
    if (text.length > MAX_SEARCH_CHARS) {
      text = text.slice(0, MAX_SEARCH_CHARS) + "\n[... search output truncated ...]\n";
      break;
    }
  }
  return { text: text.trim(), ran, skipped };
}

function safeRelPath(cwd: string, path: string): string | null {
  const p = normalizeStr(path);
  if (!p || isAbsolute(p) || p.includes("..")) return null;
  const full = normalize(join(cwd, p));
  return full.startsWith(normalize(cwd)) ? p : null;
}

async function readRange(cwd: string, path: string, start?: number, end?: number): Promise<string> {
  const rel = safeRelPath(cwd, path);
  if (!rel) return "";
  let content: string;
  try {
    content = await readFile(join(cwd, rel), "utf8");
  } catch {
    return "";
  }
  const lines = content.split("\n");
  let s = Number.isFinite(start) && (start as number) > 0 ? (start as number) : 1;
  let e = Number.isFinite(end) && (end as number) >= s ? (end as number) : s + MAX_READ_LINES - 1;
  if (e - s + 1 > MAX_READ_LINES) e = s + MAX_READ_LINES - 1;
  e = Math.min(e, lines.length);
  s = Math.max(1, s);
  let out = `\n### ${rel}  (lines ${s}-${e})\n`;
  for (let i = s; i <= e; i++) out += `${i}: ${(lines[i - 1] ?? "").slice(0, 200)}\n`;
  return out;
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function textOf(resp: { content: Array<{ type: string; text?: string }> }): string {
  return resp.content
    .filter((c) => c.type === "text" && typeof c.text === "string")
    .map((c) => c.text as string)
    .join("\n")
    .trim();
}

// ---------------------------------------------------------------------------
// model resolution — prefer a fast scout-tier model regardless of caller
// ---------------------------------------------------------------------------

const MODEL_CANDIDATES: Array<[provider: string, model: string]> = [
  ["openai-codex", "gpt-5.3-codex-spark"],
  ["kimi-coding", "kimi-for-coding"],
];

type ResolverCtx = {
  model?: unknown;
  modelRegistry: {
    find?: (provider: string, model: string) => unknown;
    getApiKeyAndHeaders: (model: unknown) => Promise<{ ok: boolean; apiKey?: string; headers?: Record<string, string> }>;
  };
};

type Resolved = { model: unknown; apiKey: string; headers?: Record<string, string>; label: string };

async function resolveModel(ctx: ResolverCtx): Promise<Resolved | null> {
  if (ctx.modelRegistry.find) {
    for (const [provider, id] of MODEL_CANDIDATES) {
      const model = ctx.modelRegistry.find(provider, id);
      if (!model) continue;
      try {
        const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
        if (auth.ok && auth.apiKey) return { model, apiKey: auth.apiKey, headers: auth.headers, label: `${provider}/${id}` };
      } catch {
        /* try next */
      }
    }
  }
  const m = ctx.model as { provider?: string; id?: string } | undefined;
  if (!m) return null;
  try {
    const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
    if (auth.ok && auth.apiKey) return { model: ctx.model, apiKey: auth.apiKey, headers: auth.headers, label: `${m.provider ?? "?"}/${m.id ?? "current"} (caller)` };
  } catch {
    /* fall through */
  }
  return null;
}

async function callModel(sel: Resolved, signal: AbortSignal | undefined, system: string, user: string, maxTokens: number): Promise<{ text: string; diag: string }> {
  const userMessage: UserMessage = { role: "user", timestamp: Date.now(), content: [{ type: "text", text: user }] };
  // reasoning: "off" — these are bounded utility calls; without it, reasoning
  // models (e.g. Codex Spark, which only supports off/xhigh) spend the whole
  // token budget thinking and emit no text.
  const resp = (await complete(
    sel.model as never,
    { systemPrompt: system, messages: [userMessage] },
    { apiKey: sel.apiKey, headers: sel.headers, signal, maxTokens, temperature: 0.2, reasoning: "off" },
  )) as { content: Array<{ type: string; text?: string }>; stopReason?: string; errorMessage?: string };
  const blocks = resp.content.map((c) => c.type).join(",") || "none";
  const diag = `stop=${resp.stopReason ?? "?"} blocks=[${blocks}]${resp.errorMessage ? ` err=${resp.errorMessage}` : ""}`;
  return { text: textOf(resp), diag };
}

// ---------------------------------------------------------------------------
// deterministic fallback (no model / planning failed): one ripgrep pass
// ---------------------------------------------------------------------------

const STOPWORDS = new Set(
  "the and for with that this what where when which how does do is are was were from into your you about of in on to a an it its be by or as at we our can will should would use used code codebase repo repository file files find show explain understand".split(" "),
);

function fallbackTerms(question: string): string[] {
  const terms = new Set<string>();
  for (const m of question.matchAll(/"([^"]{2,})"/g)) terms.add(m[1].trim());
  for (const m of question.matchAll(/[A-Za-z_][A-Za-z0-9_./-]{2,}/g)) {
    const tok = m[0];
    const lower = tok.toLowerCase();
    if (/[_./A-Z]/.test(tok) || /\d/.test(tok)) terms.add(tok);
    else if (!STOPWORDS.has(lower) && lower.length >= 3) terms.add(lower);
  }
  return Array.from(terms).slice(0, 8);
}

async function fallbackEvidence(cwd: string, question: string, paths: string): Promise<string> {
  const terms = fallbackTerms(question);
  if (!terms.length) return "";
  const termArgs = terms.map((t) => `-e ${shellQuote(t)}`).join(" ");
  const pathArgs = paths ? paths.split(/[\s,]+/).filter(Boolean).map(shellQuote).join(" ") : ".";
  const raw = await run(cwd, `if command -v rg >/dev/null 2>&1; then rg --no-heading --line-number --ignore-case ${termArgs} -- ${pathArgs} 2>/dev/null | head -n ${FALLBACK_MATCH_LINES}; else grep -rInI ${termArgs} ${pathArgs} 2>/dev/null | head -n ${FALLBACK_MATCH_LINES}; fi`);
  return raw.trim().slice(0, MAX_SEARCH_CHARS);
}

// ---------------------------------------------------------------------------
// tool
// ---------------------------------------------------------------------------

export default function understandCodebaseExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "understand_codebase",
    label: "Understand Codebase",
    description:
      "Read-only codebase understanding. Runs a small investigation loop on a fast model: it plans read-only search commands, the harness executes them, the model picks key files, the harness reads them, then the model writes a structured answer with `path:line` citations. " +
      "Use to understand code, structure, or data flow in one call without spawning a subagent. The model only drives read-only search/read; it never runs arbitrary shell. Uses model tokens (fast/cheap tier).",
    promptSnippet: "Use understand_codebase to understand part of the repo (plans searches, reads key files, returns grounded answer with path:line citations).",
    parameters: Type.Object({
      question: Type.String({ description: "What you want to understand, as a concrete question." }),
      paths: Type.Optional(Type.String({ description: "Optional space/comma-separated dirs or globs to focus the investigation." })),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const question = normalizeStr(params.question);
      if (!question) {
        return { content: [{ type: "text", text: "understand_codebase needs a 'question'." }], isError: true, details: { error: "no_question" } };
      }
      const paths = normalizeStr(params.paths);
      const scope = paths ? `\nScope paths: ${paths}` : "";
      const sel = await resolveModel(ctx);

      // No model: deterministic ripgrep evidence only.
      if (!sel) {
        const ev = await fallbackEvidence(ctx.cwd, question, paths);
        const body = ev ? `## Evidence (no model available)\n${ev}` : "No model available and no matches found.";
        return { content: [{ type: "text", text: `Understand: ${question}\n\n${body}` }], details: { synthesized: false } };
      }

      // PHASE 1 — plan search commands.
      let commands: string[] = [];
      try {
        const { text: planRaw } = await callModel(sel, ctx.signal, PLAN_SYSTEM, `QUESTION:\n${question}${scope}`, 1000);
        const plan = parseJsonObject(planRaw);
        if (plan && Array.isArray(plan.commands)) commands = (plan.commands as unknown[]).map((c) => normalizeStr(c)).filter(Boolean);
      } catch {
        /* fall through to fallback search below */
      }

      // PHASE 2 — execute search (or deterministic fallback if planning gave nothing usable).
      let search = await runSearchCommands(ctx.cwd, commands);
      if (!search.text) {
        const ev = await fallbackEvidence(ctx.cwd, question, paths);
        search = { text: ev, ran: 0, skipped: search.skipped };
      }
      if (!search.text) {
        return { content: [{ type: "text", text: `Understand: ${question}\n\nNo evidence found. Try different wording or a path scope.` }], details: { ran: search.ran } };
      }

      // PHASE 3 — pick files to read.
      let fileText = "";
      let filesRead = 0;
      try {
        const { text: pickRaw } = await callModel(sel, ctx.signal, PICK_SYSTEM, `QUESTION:\n${question}\n\nSEARCH RESULTS:\n${search.text}`, 1000);
        const pick = parseJsonObject(pickRaw);
        const files = pick && Array.isArray(pick.files) ? (pick.files as Array<Record<string, unknown>>) : [];
        // PHASE 4 — read picked files in parallel (bounded).
        const reads = await Promise.all(
          files.slice(0, MAX_READ_FILES).map((f) =>
            readRange(ctx.cwd, normalizeStr(f.path), typeof f.start === "number" ? f.start : undefined, typeof f.end === "number" ? f.end : undefined),
          ),
        );
        for (const r of reads) {
          if (!r) continue;
          filesRead++;
          fileText += r;
          if (fileText.length > MAX_FILE_CHARS) {
            fileText = fileText.slice(0, MAX_FILE_CHARS) + "\n[... file excerpts truncated ...]\n";
            break;
          }
        }
      } catch {
        /* synthesize from search results alone */
      }

      // PHASE 5 — synthesize.
      const evidence = `SEARCH RESULTS:\n${search.text}${fileText ? `\n\nFILE EXCERPTS:\n${fileText}` : ""}`;
      const header = `Understand: ${question}\nModel: ${sel.label} | commands run: ${search.ran}${search.skipped ? ` (skipped ${search.skipped} unsafe)` : ""} | files read: ${filesRead}`;
      try {
        const { text: report, diag } = await callModel(sel, ctx.signal, SYNTH_SYSTEM, `QUESTION:\n${question}\n\nEVIDENCE:\n${evidence}`, 3000);
        if (report) {
          return { content: [{ type: "text", text: `${header}\n\n${report}` }], details: { synthesized: true, model: sel.label, ran: search.ran, filesRead } };
        }
        return { content: [{ type: "text", text: `${header}\n\n(Synthesis returned no text [${diag}]; raw evidence below.)\n\n## Evidence\n${evidence}` }], details: { synthesized: false, diag, ran: search.ran, filesRead } };
      } catch (error) {
        return { content: [{ type: "text", text: `${header}\n\n(Synthesis failed: ${error instanceof Error ? error.message : String(error)}.)\n\n## Evidence\n${evidence}` }], details: { synthesized: false } };
      }
    },
  });

  console.log("[understand-codebase] Extension loaded: understand_codebase tool available");
}
