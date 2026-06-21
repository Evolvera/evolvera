/**
 * Understand Codebase Tool Extension
 *
 * A read-only codebase-understanding tool callable by any agent (including ones
 * without the Agent tool, e.g. plan-briefer). Given a question, it gathers
 * evidence from the repo (ripgrep matches + excerpts) and synthesizes a grounded
 * evidence report with `path:line` citations using the current model. If no model
 * is available, it returns the raw evidence bundle (graceful degradation).
 *
 * Usage (agent tool call):
 *   understand_codebase({ question: "how does auth token refresh work?" })
 *   understand_codebase({ question: "...", paths: "src/auth src/api", maxFiles: 6 })
 */

import { complete, type UserMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const execFileAsync = promisify(execFile);

const MAX_MATCH_LINES = 400;
const WINDOW_PAD = 3;
const MAX_WINDOW_LINES = 100;
const MAX_EVIDENCE_CHARS = 40_000;
const DEFAULT_MAX_FILES = 8;

const STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "what", "where", "when", "which", "how", "does", "do",
  "is", "are", "was", "were", "from", "into", "your", "you", "about", "of", "in", "on", "to", "a", "an",
  "it", "its", "be", "by", "or", "as", "at", "we", "our", "can", "will", "should", "would", "use", "used",
  "code", "codebase", "repo", "repository", "file", "files", "find", "show", "explain", "understand",
]);

const SCOUT_SYSTEM_PROMPT = `You are a read-only codebase scout. You receive a QUESTION and EVIDENCE gathered from the repository (ripgrep matches with file:line and code excerpts). Produce a concise, grounded evidence report.

Sections:
- Answer: directly answer the question from the evidence.
- Key locations: bullet list of \`path:line\` entries, each with a one-line note.
- How it works / data flow: short explanation grounded in the excerpts.
- Gaps / unverified: what the evidence does not show, plus suggested next search terms or files to open.

Rules:
- Cite only file:line that appear in the evidence. Do not invent files, symbols, or behavior the evidence does not support.
- If the evidence is insufficient to answer, say so plainly and suggest the next search instead of guessing.
- Keep it tight. No preamble, no restated question.`;

function normalizeStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

function extractTerms(question: string, explicit: string): string[] {
  const terms = new Set<string>();
  // explicit terms win
  for (const t of explicit.split(/[\s,]+/).filter(Boolean)) terms.add(t);
  // quoted phrases
  for (const m of question.matchAll(/"([^"]{2,})"/g)) terms.add(m[1].trim());
  // identifier-ish tokens (snake_case, camelCase, dotted/pathed, with digits)
  for (const m of question.matchAll(/[A-Za-z_][A-Za-z0-9_./-]{2,}/g)) {
    const tok = m[0];
    const lower = tok.toLowerCase();
    if (/[_./A-Z]/.test(tok) || /\d/.test(tok)) { terms.add(tok); continue; }
    if (!STOPWORDS.has(lower) && lower.length >= 3) terms.add(lower);
  }
  return Array.from(terms).slice(0, 8);
}

async function run(cwd: string, command: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("bash", ["-lc", command], {
      cwd,
      timeout: 30_000,
      maxBuffer: 1024 * 1024 * 8,
    });
    return stdout;
  } catch (error) {
    const err = error as { stdout?: string };
    return err.stdout ?? "";
  }
}

function isIdentifierTerm(t: string): boolean {
  return /[_./]/.test(t) || /[A-Z]/.test(t) || /\d/.test(t);
}

// Read a bounded window around the match lines of one file, marking matched
// lines with '>'. Returns a numbered excerpt so the synthesis sees real context.
async function readWindow(cwd: string, file: string, matchLines: number[]): Promise<string> {
  const nums = matchLines.filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (!nums.length) return "";
  let content: string;
  try {
    content = await readFile(join(cwd, file), "utf8");
  } catch {
    return nums.map((n) => `${n}: (match)`).join("\n") + "\n";
  }
  const lines = content.split("\n");
  const start = Math.max(1, nums[0] - WINDOW_PAD);
  let end = Math.min(lines.length, nums[nums.length - 1] + WINDOW_PAD);
  if (end - start + 1 > MAX_WINDOW_LINES) end = Math.min(lines.length, start + MAX_WINDOW_LINES - 1);
  const matchSet = new Set(nums);
  let out = "";
  for (let i = start; i <= end; i++) {
    out += `${matchSet.has(i) ? ">" : " "}${i}: ${(lines[i - 1] ?? "").slice(0, 200)}\n`;
  }
  return out;
}

async function gatherEvidence(cwd: string, terms: string[], paths: string, maxFiles: number): Promise<{ text: string; fileCount: number; matchCount: number }> {
  const termArgs = terms.map((t) => `-e ${shellQuote(t)}`).join(" ");
  const pathArgs = paths ? paths.split(/[\s,]+/).filter(Boolean).map(shellQuote).join(" ") : ".";
  const rgCmd = `rg --no-heading --line-number --ignore-case ${termArgs} -- ${pathArgs} 2>/dev/null | head -n ${MAX_MATCH_LINES}`;
  const grepCmd = `grep -rInI ${termArgs} ${pathArgs} 2>/dev/null | head -n ${MAX_MATCH_LINES}`;
  const raw = await run(cwd, `if command -v rg >/dev/null 2>&1; then ${rgCmd}; else ${grepCmd}; fi`);

  const byFile = new Map<string, Array<{ line: string; text: string }>>();
  let matchCount = 0;
  for (const row of raw.split("\n")) {
    const m = row.match(/^([^:]+):(\d+):(.*)$/);
    if (!m) continue;
    matchCount++;
    const [, file, line, text] = m;
    if (!byFile.has(file)) byFile.set(file, []);
    byFile.get(file)!.push({ line, text: text.slice(0, 300) });
  }

  // Rank by distinct-term coverage first (a file matching several distinct query
  // terms is more relevant than one matching a single generic term many times),
  // weighting identifier-like terms higher, then by raw match count.
  const lowerTerms = terms.map((t) => ({ lower: t.toLowerCase(), weight: isIdentifierTerm(t) ? 2 : 1 }));
  const score = (hits: Array<{ line: string; text: string }>): number => {
    const blob = hits.map((h) => h.text).join("\n").toLowerCase();
    let coverage = 0;
    for (const { lower, weight } of lowerTerms) {
      if (blob.includes(lower)) coverage += weight;
    }
    return coverage * 1000 + hits.length;
  };
  const ranked = Array.from(byFile.entries())
    .sort((a, b) => score(b[1]) - score(a[1]) || b[1].length - a[1].length)
    .slice(0, maxFiles);

  // Read a windowed excerpt around the matches for each top file IN PARALLEL,
  // so the synthesis sees real surrounding code, not isolated match lines.
  const excerpts = await Promise.all(
    ranked.map(async ([file, hits]) => ({ file, count: hits.length, window: await readWindow(cwd, file, hits.map((h) => Number(h.line))) })),
  );

  let text = "";
  for (const { file, count, window } of excerpts) {
    text += `\n### ${file}  (${count} matches)\n${window}`;
    if (text.length > MAX_EVIDENCE_CHARS) {
      text = text.slice(0, MAX_EVIDENCE_CHARS) + "\n[... evidence truncated ...]\n";
      break;
    }
  }

  return { text: text.trim(), fileCount: ranked.length, matchCount };
}

// Synthesis runs on a fast, cheap scout-tier model regardless of which agent
// called the tool — a one-shot grounded summary does not need a frontier model,
// and it keeps the expensive caller's budget free. Falls back to the caller's
// model only if no scout-tier model is authenticated.
const SYNTH_CANDIDATES: Array<[provider: string, model: string]> = [
  ["kimi-coding", "kimi-for-coding"],
  ["openai-codex", "gpt-5.3-codex-spark"],
];

type ResolverCtx = {
  model?: unknown;
  modelRegistry: {
    find?: (provider: string, model: string) => unknown;
    getApiKeyAndHeaders: (model: unknown) => Promise<{ ok: boolean; apiKey?: string; headers?: Record<string, string> }>;
  };
};

async function resolveModel(ctx: ResolverCtx): Promise<{ model: unknown; apiKey: string; headers?: Record<string, string>; label: string } | null> {
  // Prefer a scout-tier model for synthesis.
  if (ctx.modelRegistry.find) {
    for (const [provider, id] of SYNTH_CANDIDATES) {
      const model = ctx.modelRegistry.find(provider, id);
      if (!model) continue;
      try {
        const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
        if (auth.ok && auth.apiKey) {
          return { model, apiKey: auth.apiKey, headers: auth.headers, label: `${provider}/${id}` };
        }
      } catch {
        /* try next candidate */
      }
    }
  }
  // Fallback: the calling agent's current model.
  const m = ctx.model as { provider?: string; id?: string } | undefined;
  if (!m) return null;
  try {
    const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
    if (auth.ok && auth.apiKey) {
      return { model: ctx.model, apiKey: auth.apiKey, headers: auth.headers, label: `${m.provider ?? "?"}/${m.id ?? "current"} (caller)` };
    }
  } catch {
    /* fall through */
  }
  return null;
}

export default function understandCodebaseExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "understand_codebase",
    label: "Understand Codebase",
    description:
      "Read-only codebase understanding in one call. Gathers repository evidence (ripgrep matches + excerpts) for a question and returns a grounded evidence report with `path:line` citations, synthesized by a fast scout-tier model. " +
      "Use to understand code, structure, or data flow without spawning a subagent. Read-only: it never edits files. Uses model tokens.",
    promptSnippet: "Use understand_codebase to understand part of the repo (returns grounded evidence with path:line citations).",
    parameters: Type.Object({
      question: Type.String({ description: "What you want to understand, as a concrete question." }),
      paths: Type.Optional(Type.String({ description: "Optional space/comma-separated dirs or globs to focus the search (e.g. 'src/auth src/api')." })),
      terms: Type.Optional(Type.String({ description: "Optional explicit search terms/symbols to grep, overriding keyword extraction." })),
      maxFiles: Type.Optional(Type.Number({ description: `Max files to include in evidence (default ${DEFAULT_MAX_FILES}, capped at 20).` })),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const question = normalizeStr(params.question);
      if (!question) {
        return { content: [{ type: "text", text: "understand_codebase needs a 'question'." }], isError: true, details: { error: "no_question" } };
      }
      const explicit = normalizeStr(params.terms);
      const paths = normalizeStr(params.paths);
      const maxFiles = Math.max(1, Math.min(20, Number(params.maxFiles) || DEFAULT_MAX_FILES));
      const terms = extractTerms(question, explicit);

      if (terms.length === 0) {
        return {
          content: [{ type: "text", text: "understand_codebase could not derive search terms from the question. Pass explicit `terms`." }],
          isError: true,
          details: { error: "no_terms" },
        };
      }

      const evidence = await gatherEvidence(ctx.cwd, terms, paths, maxFiles);
      const header = `Scout: ${question}\nTerms: ${terms.join(", ")}\nScanned: ${evidence.fileCount} files / ${evidence.matchCount} matches${paths ? ` in ${paths}` : ""}`;

      if (!evidence.text) {
        return {
          content: [{ type: "text", text: `${header}\n\nNo matches found. Try different terms or a broader path scope.` }],
          details: { fileCount: 0, matchCount: 0, terms },
        };
      }

      const selected = await resolveModel(ctx);
      if (!selected) {
        // Graceful degradation: return raw evidence so the tool still helps.
        return {
          content: [{ type: "text", text: `${header}\n\n(No model available for synthesis; returning raw evidence.)\n\n## Evidence\n${evidence.text}` }],
          details: { synthesized: false, fileCount: evidence.fileCount, matchCount: evidence.matchCount, terms },
        };
      }

      const userMessage: UserMessage = {
        role: "user",
        timestamp: Date.now(),
        content: [{ type: "text", text: `QUESTION:\n${question}\n\nEVIDENCE (ripgrep matches, file:line):\n${evidence.text}` }],
      };

      try {
        const response = (await complete(
          selected.model as never,
          { systemPrompt: SCOUT_SYSTEM_PROMPT, messages: [userMessage] },
          { apiKey: selected.apiKey, headers: selected.headers, signal: ctx.signal, maxTokens: 6000, temperature: 0.2 },
        )) as { content: Array<{ type: string; text?: string }>; stopReason?: string; errorMessage?: string };
        const report = response.content
          .filter((c) => c.type === "text" && typeof c.text === "string")
          .map((c) => c.text as string)
          .join("\n")
          .trim();
        if (report) {
          return {
            content: [{ type: "text", text: `${header}\nSynthesis: ${selected.label}\n\n${report}` }],
            details: { synthesized: true, model: selected.label, fileCount: evidence.fileCount, matchCount: evidence.matchCount, terms },
          };
        }
        const blocks = response.content.map((c) => c.type).join(",") || "none";
        const diag = `stopReason=${response.stopReason ?? "?"}; blocks=[${blocks}]${response.errorMessage ? `; error=${response.errorMessage}` : ""}`;
        return {
          content: [{ type: "text", text: `${header}\nSynthesis: ${selected.label} returned no text (${diag}). Raw evidence below.\n\n## Evidence\n${evidence.text}` }],
          details: { synthesized: false, diag, fileCount: evidence.fileCount, matchCount: evidence.matchCount, terms },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `${header}\n\n(Synthesis failed: ${message}. Returning raw evidence.)\n\n## Evidence\n${evidence.text}` }],
          details: { synthesized: false, error: message, fileCount: evidence.fileCount, matchCount: evidence.matchCount, terms },
        };
      }
    },
  });

  console.log("[understand-codebase] Extension loaded: understand_codebase tool available");
}
