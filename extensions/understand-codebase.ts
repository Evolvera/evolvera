/**
 * Understand Codebase Tool Extension
 *
 * A read-only codebase-understanding tool callable by any agent. It runs a small
 * investigation loop on a fast model (Codex Spark by default):
 *   1. PLAN   — the model proposes structured searches (terms + optional paths).
 *   2. SEARCH — the harness builds and runs ripgrep for each (plus a deterministic
 *               baseline), ranking files by match count. The model never writes
 *               shell; the harness owns command construction (read-only by design).
 *   3. PICK   — the model picks the most important files/ranges to read; if it
 *               picks none, the harness auto-reads the top-ranked files.
 *   4. READ   — the harness reads those files in parallel (bounded).
 *   5. SYNTH  — the model writes a structured answer with `path:line` citations.
 *
 * Every model step degrades gracefully: unparseable output falls back to the
 * deterministic baseline search / top-ranked reads, so the tool never breaks.
 *
 * Usage:
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

const MAX_SEARCHES = 6;
const MAX_CMD_OUTPUT_CHARS = 4000;
const MAX_SEARCH_CHARS = 16_000;
const MAX_READ_FILES = 6;
const AUTO_READ_FILES = 3;
const MAX_READ_LINES = 160;
const MAX_FILE_CHARS = 24_000;
const MAX_TERMS = 8;

const PLAN_SYSTEM = `You plan a READ-ONLY investigation to answer a QUESTION about a code repository.

Output ONLY a JSON object: {"searches": [{"terms": ["..."], "paths": ["dir"]}]}.
- Each search is a set of literal terms/identifiers grepped case-insensitively (matched as OR).
- Use 2-4 searches with the most discriminative symbols from the question: function names, constants, type names, config keys, error strings.
- "paths" is optional: directories to scope a search; omit to use the caller's scope or whole repo.
- Do NOT write shell commands. Only terms and paths. No regex tricks needed; plain identifiers work best.`;

const PICK_SYSTEM = `Given a QUESTION and SEARCH RESULTS from a repository, choose the few files most worth reading in full to answer.

Output ONLY a JSON object: {"files": [{"path": "rel/path", "start": 40, "end": 120}]}.
- At most 6 files. Use relative paths exactly as they appear in the search results.
- start/end are optional 1-based line ranges; omit to read the head of the file.
- If the search results already fully answer the question, output {"files": []}.`;

const SYNTH_SYSTEM = `You are a read-only codebase scout. You receive a QUESTION and EVIDENCE (search results + file excerpts with file:line). Produce a concise, grounded report.

Sections:
- Answer: directly answer the question from the evidence. State concrete values (numbers, names) when the evidence shows them.
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

const STOPWORDS = new Set(
  "the and for with that this what where when which how does do is are was were from into your you about of in on to a an it its be by or as at we our can will should would use used code codebase repo repository file files find show explain understand".split(" "),
);

function questionTerms(question: string): string[] {
  const terms = new Set<string>();
  for (const m of question.matchAll(/"([^"]{2,})"/g)) terms.add(m[1].trim());
  for (const m of question.matchAll(/[A-Za-z_][A-Za-z0-9_./-]{2,}/g)) {
    const tok = m[0];
    const lower = tok.toLowerCase();
    if (/[_./A-Z]/.test(tok) || /\d/.test(tok)) terms.add(tok);
    else if (!STOPWORDS.has(lower) && lower.length >= 3) terms.add(lower);
  }
  return Array.from(terms).slice(0, MAX_TERMS);
}

// The harness builds the command (read-only ripgrep), so the model never writes shell.
function buildSearch(terms: string[], paths: string[] | undefined, scope: string): { display: string; run: string } | null {
  const t = terms.map(normalizeStr).filter(Boolean).slice(0, MAX_TERMS);
  if (!t.length) return null;
  const termArgs = t.map((x) => `-e ${shellQuote(x)}`).join(" ");
  const pathList = paths && paths.length ? paths : scope ? scope.split(/[\s,]+/).filter(Boolean) : ["."];
  const pathArgs = pathList.map((p) => shellQuote(normalizeStr(p))).join(" ");
  const rg = `rg --no-heading --line-number --ignore-case ${termArgs} -- ${pathArgs}`;
  const grep = `grep -rInI ${termArgs} ${pathArgs}`;
  return { display: `rg ${t.join(" | ")}`, run: `if command -v rg >/dev/null 2>&1; then ${rg} 2>/dev/null | head -n 120; else ${grep} 2>/dev/null | head -n 120; fi` };
}

async function runSearches(cwd: string, searches: Array<{ terms?: unknown; paths?: unknown }>, scope: string): Promise<{ text: string; ranked: string[]; ran: number }> {
  const byFile = new Map<string, number>();
  let text = "";
  let ran = 0;
  for (const s of searches.slice(0, MAX_SEARCHES)) {
    const terms = Array.isArray(s.terms) ? (s.terms as unknown[]).map(normalizeStr).filter(Boolean) : [];
    const paths = Array.isArray(s.paths) ? (s.paths as unknown[]).map(normalizeStr).filter(Boolean) : undefined;
    const cmd = buildSearch(terms, paths, scope);
    if (!cmd) continue;
    ran++;
    const out = (await run(cwd, cmd.run)).slice(0, MAX_CMD_OUTPUT_CHARS);
    text += `\n$ ${cmd.display}\n${out.trim() || "(no output)"}\n`;
    for (const row of out.split("\n")) {
      const m = row.match(/^([^:]+):(\d+):/);
      if (m) byFile.set(m[1], (byFile.get(m[1]) ?? 0) + 1);
    }
    if (text.length > MAX_SEARCH_CHARS) {
      text = text.slice(0, MAX_SEARCH_CHARS) + "\n[... search truncated ...]\n";
      break;
    }
  }
  const ranked = [...byFile.entries()].sort((a, b) => b[1] - a[1]).map(([f]) => f);
  return { text: text.trim(), ranked, ran };
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
// model — prefer a fast scout-tier model regardless of caller
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
  // reasoning: "off" keeps these bounded utility calls fast and prevents reasoning
  // from eating the token budget. No `temperature`: the Codex responses API rejects it.
  const resp = (await complete(
    sel.model as never,
    { systemPrompt: system, messages: [userMessage] },
    { apiKey: sel.apiKey, headers: sel.headers, signal, maxTokens, reasoning: "off" },
  )) as { content: Array<{ type: string; text?: string }>; stopReason?: string; errorMessage?: string };
  const blocks = resp.content.map((c) => c.type).join(",") || "none";
  const diag = `stop=${resp.stopReason ?? "?"} blocks=[${blocks}]${resp.errorMessage ? ` err=${resp.errorMessage}` : ""}`;
  return { text: textOf(resp), diag };
}

// ---------------------------------------------------------------------------
// tool
// ---------------------------------------------------------------------------

export default function understandCodebaseExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "understand_codebase",
    label: "Understand Codebase",
    description:
      "Read-only codebase understanding. Runs a small investigation loop on a fast model: it plans targeted searches, the harness greps and ranks files, the model picks key files, the harness reads them, then the model writes a structured answer with `path:line` citations. " +
      "Use to understand code, structure, or data flow in one call without spawning a subagent. The model only drives read-only search/read; it never runs arbitrary shell. Uses model tokens (fast/cheap tier).",
    promptSnippet: "Use understand_codebase to understand part of the repo (returns a grounded answer with path:line citations).",
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
      const baseline = { terms: questionTerms(question), paths: paths ? paths.split(/[\s,]+/).filter(Boolean) : undefined };
      const sel = await resolveModel(ctx);

      // No model: deterministic baseline search only.
      if (!sel) {
        const ev = await runSearches(ctx.cwd, [baseline], paths);
        const body = ev.text ? `## Evidence (no model available)\n${ev.text}` : "No model available and no matches found.";
        return { content: [{ type: "text", text: `Understand: ${question}\n\n${body}` }], details: { synthesized: false } };
      }

      // PHASE 1 — plan structured searches (always include the deterministic baseline).
      const searches: Array<{ terms?: unknown; paths?: unknown }> = [baseline];
      try {
        const { text: planRaw } = await callModel(sel, ctx.signal, PLAN_SYSTEM, `QUESTION:\n${question}${scope}`, 1000);
        const plan = parseJsonObject(planRaw);
        if (plan && Array.isArray(plan.searches)) searches.push(...(plan.searches as Array<{ terms?: unknown; paths?: unknown }>));
      } catch {
        /* baseline only */
      }

      // PHASE 2 — execute searches, rank files.
      const search = await runSearches(ctx.cwd, searches, paths);
      if (!search.text) {
        return { content: [{ type: "text", text: `Understand: ${question}\n\nNo evidence found. Try different wording or a path scope.` }], details: { ran: search.ran } };
      }

      // PHASE 3 — pick files (model), with auto-pick of top-ranked files as fallback.
      let picks: Array<{ path: string; start?: number; end?: number }> = [];
      try {
        const { text: pickRaw } = await callModel(sel, ctx.signal, PICK_SYSTEM, `QUESTION:\n${question}\n\nSEARCH RESULTS:\n${search.text}`, 1000);
        const pick = parseJsonObject(pickRaw);
        const files = pick && Array.isArray(pick.files) ? (pick.files as Array<Record<string, unknown>>) : [];
        picks = files
          .map((f) => ({ path: normalizeStr(f.path), start: typeof f.start === "number" ? f.start : undefined, end: typeof f.end === "number" ? f.end : undefined }))
          .filter((f) => f.path);
      } catch {
        /* fall through to auto-pick */
      }
      if (!picks.length) picks = search.ranked.slice(0, AUTO_READ_FILES).map((p) => ({ path: p }));

      // PHASE 4 — read picked files in parallel (bounded).
      let fileText = "";
      let filesRead = 0;
      const reads = await Promise.all(picks.slice(0, MAX_READ_FILES).map((f) => readRange(ctx.cwd, f.path, f.start, f.end)));
      for (const r of reads) {
        if (!r) continue;
        filesRead++;
        fileText += r;
        if (fileText.length > MAX_FILE_CHARS) {
          fileText = fileText.slice(0, MAX_FILE_CHARS) + "\n[... file excerpts truncated ...]\n";
          break;
        }
      }

      // PHASE 5 — synthesize.
      const evidence = `SEARCH RESULTS:\n${search.text}${fileText ? `\n\nFILE EXCERPTS:\n${fileText}` : ""}`;
      const header = `Understand: ${question}\nModel: ${sel.label} | searches: ${search.ran} | files read: ${filesRead}`;
      try {
        const { text: report, diag } = await callModel(sel, ctx.signal, SYNTH_SYSTEM, `QUESTION:\n${question}\n\nEVIDENCE:\n${evidence}`, 3000);
        if (report) {
          return { content: [{ type: "text", text: `${header}\n\n${report}` }], details: { synthesized: true, model: sel.label, searches: search.ran, filesRead } };
        }
        return { content: [{ type: "text", text: `${header}\n\n(Synthesis returned no text [${diag}]; raw evidence below.)\n\n## Evidence\n${evidence}` }], details: { synthesized: false, diag } };
      } catch (error) {
        return { content: [{ type: "text", text: `${header}\n\n(Synthesis failed: ${error instanceof Error ? error.message : String(error)}.)\n\n## Evidence\n${evidence}` }], details: { synthesized: false } };
      }
    },
  });

  console.log("[understand-codebase] Extension loaded: understand_codebase tool available");
}
