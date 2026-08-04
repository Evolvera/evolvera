/**
 * Project Memory Extension
 * 
 * Automatically injects the Markdown project memory summary and a compact
 * normalized architecture index into the system prompt at session start.
 * If no memory exists, prompts the model to perform an initial scan.
 * 
 * Memory location: {cwd}/.pi/memory/_summary.md
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";

const MEMORY_DIR = ".pi/memory";
const SUMMARY_FILE = "_summary.md";
const ARCHITECTURE_FILE = "architecture.json";
const MAX_SUMMARY_CHARS = 8000;
const MAX_ARCHITECTURE_CHARS = 4000;
const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HEAD_RE = /^(?:[0-9a-f]{40}|UNKNOWN)$/;

function readText(path: string): string | null {
  try { return readFileSync(path, "utf-8"); } catch { return null; }
}

function findMemorySummary(cwd: string): string | null {
  const summaryPath = resolve(cwd, MEMORY_DIR, SUMMARY_FILE);
  if (!existsSync(summaryPath)) return null;
  const content = readText(summaryPath);
  if (content === null) {
    console.error("[project-memory] Summary could not be read");
    return null;
  }
  return content.length > MAX_SUMMARY_CHARS
    ? content.slice(0, MAX_SUMMARY_CHARS) + "\n\n[... summary truncated ...]"
    : content;
}

function isObject(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isArchitectureShape(value: unknown): value is Record<string, any> {
  if (!isObject(value) || value.schemaVersion !== 1 || !isObject(value.project) || !isObject(value.snapshot)) return false;
  if (typeof value.snapshot.sourceHead !== "string" || !HEAD_RE.test(value.snapshot.sourceHead)) return false;
  if (!["known", "inferred", "unknown"].includes(value.snapshot.confidence)) return false;
  const collections = ["actors", "components", "dataObjects", "relationships", "flows", "evidence", "gaps"];
  return collections.every((key) => Array.isArray(value[key]) && value[key].every((item: unknown) => isObject(item) && typeof item.id === "string" && ID_RE.test(item.id)));
}

function readArchitecture(cwd: string): { status: "missing" | "invalid" | "valid"; document?: Record<string, any> } {
  const path = resolve(cwd, MEMORY_DIR, ARCHITECTURE_FILE);
  if (!existsSync(path)) return { status: "missing" };
  const source = readText(path);
  if (source === null) return { status: "invalid" };
  try {
    const document: unknown = JSON.parse(source);
    return isArchitectureShape(document) ? { status: "valid", document } : { status: "invalid" };
  } catch { return { status: "invalid" }; }
}

function gitDirectory(cwd: string): string | null {
  const dotGit = join(cwd, ".git");
  try {
    if (statSync(dotGit).isDirectory()) return dotGit;
    if (!statSync(dotGit).isFile()) return null;
  } catch { return null; }
  const marker = readText(dotGit)?.trim();
  if (!marker?.startsWith("gitdir:")) return null;
  const target = marker.slice("gitdir:".length).trim();
  return target ? resolve(dirname(dotGit), target) : null;
}

function commonGitDirectory(gitDir: string): string | null {
  const common = readText(join(gitDir, "commondir"))?.trim();
  return common ? resolve(gitDir, common) : null;
}

function readPackedRef(gitDir: string, ref: string): string | null {
  const packed = readText(join(gitDir, "packed-refs"));
  if (!packed) return null;
  for (const line of packed.split(/\r?\n/)) {
    const match = line.match(/^([0-9a-f]{40}) ([^ ]+)$/);
    if (match?.[2] === ref) return match[1];
  }
  return null;
}

function resolveGitHead(cwd: string): string | null {
  const gitDir = gitDirectory(cwd);
  if (!gitDir) return null;
  const commonDir = commonGitDirectory(gitDir);
  const head = readText(join(gitDir, "HEAD"))?.trim();
  if (!head) return null;
  if (/^[0-9a-f]{40}$/.test(head)) return head;
  const symbolic = head.match(/^ref: (refs\/[A-Za-z0-9._/-]+)$/);
  if (!symbolic || symbolic[1].includes("..")) return null;
  for (const directory of [gitDir, commonDir].filter((value): value is string => Boolean(value))) {
    const ref = readText(join(directory, symbolic[1]))?.trim();
    if (ref && /^[0-9a-f]{40}$/.test(ref)) return ref;
    const packed = readPackedRef(directory, symbolic[1]);
    if (packed) return packed;
  }
  return null;
}

function compact(value: unknown, fallback: string): string {
  const text = typeof value === "string" && value.trim() ? value : fallback;
  return text.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
}

function list(values: unknown[], formatter: (value: any) => string): string {
  if (!values.length) return "none recorded";
  return values.map(formatter).join(", ");
}

function architectureIndex(cwd: string, document: Record<string, any>): string {
  const snapshot = document.snapshot;
  const currentHead = resolveGitHead(cwd);
  const status = currentHead === null ? "HEAD_UNKNOWN" : snapshot.sourceHead === "UNKNOWN" ? "HEAD_UNKNOWN" : currentHead === snapshot.sourceHead ? "CURRENT" : "POSSIBLY_STALE";
  const components = document.components as any[];
  const flows = document.flows as any[];
  const gaps = document.gaps as any[];
  const counts = ["actors", "components", "dataObjects", "relationships", "flows", "evidence", "gaps"]
    .map((key) => `${key}=${document[key].length}`).join(" ");
  const roots = components.filter((item) => item.level === 0 || item.level === 1)
    .map((item) => `${compact(item.id, "unknown")} / ${compact(item.name, "unnamed")} / ${compact(item.kind, "unknown")}`);
  const flowList = list(flows, (item) => `${compact(item.id, "unknown")} / ${compact(item.name, "unnamed")} / ${compact(item.type, "unknown")}`);
  const openGaps = gaps.filter((item) => item.status === "open");
  const gapList = list(openGaps, (item) => `${compact(item.id, "unknown")} / ${compact(item.title, "untitled")}`);
  const index = [
    "Architecture index (compact; targeted lookup only)",
    "Source: .pi/memory/architecture.json | Human view: .pi/memory/architecture.html (generated; never authoritative)",
    `Schema: ${snapshot.schemaVersion ?? document.schemaVersion} | Snapshot head: ${snapshot.sourceHead} | Scope: ${compact(snapshot.scope, "unspecified")} | Confidence: ${compact(snapshot.confidence, "unknown")} | Git: ${currentHead ?? "UNKNOWN"} (${status})`,
    `Counts: ${counts}`,
    `L0/L1 components: ${roots.length ? roots.join(", ") : "none recorded"}`,
    `Flows: ${flowList}`,
    `Open gaps: ${gapList}`,
    "Before architecture-sensitive decisions, read targeted JSON records and repository evidence; verify affected evidence when status is POSSIBLY_STALE."
  ].join("\n");
  return index.length > MAX_ARCHITECTURE_CHARS ? index.slice(0, MAX_ARCHITECTURE_CHARS - 30) + "\n[index truncated]" : index;
}

function prependPrompt(ctx: any, block: string): void {
  ctx.systemPrompt = ctx.systemPrompt ? block + "\n\n" + ctx.systemPrompt : block;
}

export default function projectMemoryExtension(pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event, ctx) => {
    const cwd = ctx.cwd || process.cwd();
    const summary = findMemorySummary(cwd);
    const architecture = readArchitecture(cwd);

    if (summary !== null || architecture.status === "valid" || architecture.status === "invalid") {
      const details = [
        summary !== null ? summary : "[PROJECT_MEMORY_SUMMARY_MISSING] Markdown summary is unavailable; do not infer a new project.",
        architecture.status === "valid" ? architectureIndex(cwd, architecture.document!) : architecture.status === "invalid"
          ? "ARCHITECTURE_MEMORY_INVALID: architecture.json is not valid JSON or has an unsupported shape. Keep Markdown memory; validate with node skills/project-memory/scripts/validate-architecture.mjs .pi/memory/architecture.json."
          : "ARCHITECTURE_MEMORY_MISSING: initialize architecture.json and regenerate architecture.html when architecture work is relevant; the repository is not assumed to be new."
      ].join("\n\n");
      prependPrompt(ctx, `\n=== PROJECT MEMORY (auto-loaded from ${MEMORY_DIR}/) ===\n${details}\n=== END PROJECT MEMORY ===\n`);
      console.log("[project-memory] Project memory loaded");
      return;
    }

    const noMemoryBlock = `
=== PROJECT MEMORY ===
Memory is uninitialized; do not assume this is a new project.

EXECUTE THE INITIAL SCAN following the project-memory skill:
1. Create the directory: ${MEMORY_DIR}/
2. Copy all templates from the project-memory skill templates directory, including architecture.json and architecture.html
3. Populate Markdown memory and normalized architecture.json from repository evidence
4. Validate architecture.json, render architecture.html, then write the compact _summary.md Architecture Map section
5. Show the user the scan summary

See skill: ~/.pi/agent/skills/project-memory/
=== END PROJECT MEMORY ===
`;
    prependPrompt(ctx, noMemoryBlock);
    console.log("[project-memory] Memory is uninitialized");
  });

  console.log("[project-memory] Extension loaded");
}
