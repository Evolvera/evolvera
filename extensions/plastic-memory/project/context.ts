import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { canonicalPaths } from "./io.ts";
import { projectProjections } from "./projection.ts";
import { ProjectStore } from "./store.ts";
import type { CanonicalProject } from "./schema.ts";
import { validateArchitecture } from "../../../skills/project-memory/scripts/validate-architecture.mjs";

export const ROOT_SUMMARY_LIMIT = 8_000;
export const ACTIVE_INDEX_LIMIT = 4_000;
export const ARCHITECTURE_INDEX_LIMIT = 4_000;
export type ArchitectureStatus = "CURRENT" | "POSSIBLY_STALE" | "HEAD_UNKNOWN" | "INVALID" | "MISSING";
export type ContextMode = "canonical" | "legacy-flat" | "uninitialized";

export type ProjectContext = Readonly<{
  kind: "project-context";
  mode: ContextMode;
  derivedStatus: "CURRENT" | "REBUILT_IN_MEMORY" | "MISSING";
  summary: string;
  rootSummary: string;
  activeIndex: string;
  activeChunkIndex: string;
  architectureIndex?: string;
  architectureStatus: ArchitectureStatus;
  warnings: readonly string[];
  block: string;
  prompt: string;
  compactorInput: Readonly<{ summary: string; activeIndex: string; architectureIndex?: string }>;
}>;

function compact(value: unknown, fallback: string): string {
  const text = typeof value === "string" && value.trim() ? value : fallback;
  return text.replace(/[\u0000-\u001f\u007f]/gu, " ").replace(/\s+/gu, " ").trim();
}
function clip(value: string, limit: number, marker = "\n[context truncated]"): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, Math.max(0, limit - marker.length))}${marker}`;
}
function readText(file: string): string | undefined {
  try { return readFileSync(file, "utf8"); } catch (error: any) { if (error?.code === "ENOENT") return undefined; throw error; }
}
function unique<T>(values: T[]): T[] { return [...new Set(values)]; }
function tagsFor(body: string): string[] {
  const tags = new Set<string>();
  for (const match of body.matchAll(/#([a-z0-9][a-z0-9_-]*)/giu)) {
    tags.add(match[1].toLowerCase());
    if (tags.size >= 20) break;
  }
  return [...tags].sort();
}
function synopsis(body: string, limit: number): string {
  return compact(body, "No synopsis recorded.").slice(0, limit);
}
function canonicalSummary(project: CanonicalProject, derivedStatus: string): string {
  const lines = [
    "# Project memory summary",
    `Project: ${compact(project.frontMatter.name, "unnamed")} (${project.frontMatter.id})`,
    `Source head: ${project.frontMatter.sourceHead}`,
    `Derived data: ${derivedStatus}`,
    "",
    ...[...project.chunks].sort((a, b) => a.frontMatter.id.localeCompare(b.frontMatter.id)).map((chunk) => {
      const fm = chunk.frontMatter;
      const tags = tagsFor(chunk.body);
      return `- [${fm.status}] ${compact(fm.title, "untitled")} — ${fm.target} (${fm.confidence})${tags.length ? ` tags=${tags.join(",")}` : ""}\n  ${synopsis(chunk.body, 240)}`;
    }),
  ];
  return clip(lines.join("\n"), ROOT_SUMMARY_LIMIT);
}
function activeIndex(project: CanonicalProject): string {
  const all = [...project.chunks].filter((chunk) => chunk.frontMatter.status === "active").sort((a, b) => a.frontMatter.id.localeCompare(b.frontMatter.id));
  const entries = all.map((chunk) => {
    const fm = chunk.frontMatter;
    return { id: fm.id, category: fm.category, title: compact(fm.title, "untitled").slice(0, 160), synopsis: synopsis(chunk.body, 180), tags: tagsFor(chunk.body), status: fm.status, confidence: fm.confidence };
  });
  const base = { kind: "active-chunk-index", bounded: true, chunks: [] as typeof entries };
  let truncated = false;
  for (const entry of entries) {
    const candidate = { ...base, chunks: [...base.chunks, entry], ...(truncated ? { truncated: true } : {}) };
    if (JSON.stringify(candidate).length > ACTIVE_INDEX_LIMIT) { truncated = true; break; }
    base.chunks.push(entry);
  }
  const result = { ...base, ...(truncated ? { truncated: true } : {}) };
  return clip(JSON.stringify(result), ACTIVE_INDEX_LIMIT, "\n[active index truncated]");
}
function legacyActiveIndex(): string {
  return JSON.stringify({ kind: "active-chunk-index", bounded: true, state: "LEGACY_FLAT", marker: "LEGACY_FLAT_ACTIVE_INDEX_UNAVAILABLE", guidance: "Use exact project/chunk recall after canonical publication; flat memory is summary-only." });
}
function emptySummary(): string {
  return "# Project memory summary\n[PROJECT_MEMORY_UNINITIALIZED] Memory is uninitialized; do not assume this is a new project. No automatic repository scan is performed.";
}

function gitDirectory(root: string): string | undefined {
  const dotGit = path.join(root, ".git");
  try {
    if (statSync(dotGit).isDirectory()) return dotGit;
    if (!statSync(dotGit).isFile()) return undefined;
  } catch { return undefined; }
  const marker = readText(dotGit)?.trim();
  return marker?.startsWith("gitdir:") ? path.resolve(root, marker.slice("gitdir:".length).trim()) : undefined;
}
function commonGitDirectory(gitDir: string): string | undefined {
  const common = readText(path.join(gitDir, "commondir"))?.trim();
  return common ? path.resolve(gitDir, common) : undefined;
}
function packedRef(gitDir: string, ref: string): string | undefined {
  const packed = readText(path.join(gitDir, "packed-refs"));
  return packed?.split(/\r?\n/u).map((line) => line.match(/^([0-9a-f]{40}) ([^ ]+)$/u)).find((match) => match?.[2] === ref)?.[1];
}
function gitHead(root: string): string | undefined {
  const gitDir = gitDirectory(root);
  if (!gitDir) return undefined;
  const head = readText(path.join(gitDir, "HEAD"))?.trim();
  if (!head) return undefined;
  if (/^[0-9a-f]{40}$/u.test(head)) return head;
  const symbolic = head.match(/^ref: (refs\/[A-Za-z0-9._/-]+)$/u);
  if (!symbolic || symbolic[1].includes("..")) return undefined;
  for (const directory of unique([gitDir, commonGitDirectory(gitDir)].filter((item): item is string => Boolean(item)))) {
    const direct = readText(path.join(directory, symbolic[1]))?.trim();
    if (direct && /^[0-9a-f]{40}$/u.test(direct)) return direct;
    const packed = packedRef(directory, symbolic[1]);
    if (packed) return packed;
  }
  return undefined;
}
function architectureCandidates(root: string, architectureRoot?: string): string[] {
  const candidates = architectureRoot ? [architectureRoot] : [root];
  if (existsSync(path.join(root, "_project.md"))) candidates.push(path.dirname(root));
  return unique(candidates.map((candidate) => path.resolve(candidate)));
}
function architectureSection(root: string, architectureRoot?: string, repositoryRoot?: string): { index?: string; status: ArchitectureStatus; warning?: string } {
  const file = architectureCandidates(root, architectureRoot).map((candidate) => path.join(candidate, "architecture.json")).find((candidate) => existsSync(candidate));
  if (!file) return { status: "MISSING" };
  const source = readText(file);
  if (source === undefined) return { status: "INVALID", warning: "ARCHITECTURE_MEMORY_INVALID: architecture.json could not be read." };
  let document: any;
  try { document = JSON.parse(source); } catch { return { status: "INVALID", warning: "ARCHITECTURE_MEMORY_INVALID: architecture.json is not valid JSON; Markdown memory is preserved." }; }
  const result = validateArchitecture(document);
  if (!result.valid) return { status: "INVALID", warning: "ARCHITECTURE_MEMORY_INVALID: architecture.json failed validation; Markdown memory is preserved." };
  const snapshot = document.snapshot;
  const currentHead = gitHead(repositoryRoot ?? architectureRoot ?? root);
  const status: ArchitectureStatus = currentHead === undefined || snapshot.sourceHead === "UNKNOWN"
    ? "HEAD_UNKNOWN"
    : currentHead === snapshot.sourceHead ? "CURRENT" : "POSSIBLY_STALE";
  const collections = ["actors", "components", "dataObjects", "relationships", "flows", "evidence", "gaps"];
  const counts = collections.map((key) => `${key}=${document[key].length}`).join(" ");
  const roots = document.components.filter((item: any) => item.level === 0 || item.level === 1).map((item: any) => `${compact(item.id, "unknown")} / ${compact(item.name, "unnamed")} / ${compact(item.kind, "unknown")}`);
  const flows = document.flows.map((item: any) => `${compact(item.id, "unknown")} / ${compact(item.name, "unnamed")} / ${compact(item.type, "unknown")}`);
  const gaps = document.gaps.filter((item: any) => item.status === "open").map((item: any) => `${compact(item.id, "unknown")} / ${compact(item.title, "untitled")}`);
  const index = [
    "Architecture index (compact; targeted lookup only)",
    "Source: .pi/memory/architecture.json | Human view: .pi/memory/architecture.html (generated; never authoritative)",
    `Schema: ${snapshot.schemaVersion ?? document.schemaVersion} | Snapshot head: ${snapshot.sourceHead} | Scope: ${compact(snapshot.scope, "unspecified")} | Confidence: ${compact(snapshot.confidence, "unknown")} | Git: ${currentHead ?? "UNKNOWN"} (${status})`,
    `Counts: ${counts}`,
    `L0/L1 components: ${roots.length ? roots.join(", ") : "none recorded"}`,
    `Flows: ${flows.length ? flows.join(", ") : "none recorded"}`,
    `Open gaps: ${gaps.length ? gaps.join(", ") : "none recorded"}`,
    "Before architecture-sensitive decisions, read targeted JSON records and repository evidence; verify affected evidence when status is POSSIBLY_STALE.",
  ].join("\n");
  return { status, index: clip(index, ARCHITECTURE_INDEX_LIMIT, "\n[index truncated]") };
}
function derivedStatus(root: string, project: CanonicalProject): "CURRENT" | "REBUILT_IN_MEMORY" {
  const paths = canonicalPaths(root);
  if (!existsSync(paths.index) || !existsSync(paths.summary)) return "REBUILT_IN_MEMORY";
  try {
    const expected = projectProjections(project);
    return JSON.stringify(JSON.parse(readFileSync(paths.index, "utf8"))) === JSON.stringify(expected.index) && readFileSync(paths.summary, "utf8") === expected.summary ? "CURRENT" : "REBUILT_IN_MEMORY";
  } catch { return "REBUILT_IN_MEMORY"; }
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

export type ContextOptions = { architectureRoot?: string; repositoryRoot?: string };

/** Build one read-only snapshot. It performs no writes and can be passed to both prompt and compactor consumers. */
export function assembleProjectContext(root: string, options: ContextOptions = {}): ProjectContext {
  if (typeof root !== "string" || !path.isAbsolute(root)) throw new Error("project root must be an absolute path");
  for (const [label, value] of [["architecture root", options.architectureRoot], ["repository root", options.repositoryRoot]] as const) {
    if (value !== undefined && (typeof value !== "string" || !path.isAbsolute(value))) throw new Error(`${label} must be an absolute path`);
  }
  let project: CanonicalProject | undefined;
  let loadError: string | undefined;
  try { project = new ProjectStore(root).load(); } catch (error: any) { loadError = error?.message ?? String(error); }
  const architecture = architectureSection(root, options.architectureRoot, options.repositoryRoot);
  let mode: ContextMode;
  let derived: ProjectContext["derivedStatus"];
  let summary: string;
  let active: string;
  const warnings: string[] = [];
  if (project) {
    mode = "canonical";
    derived = derivedStatus(root, project);
    summary = canonicalSummary(project, derived);
    active = activeIndex(project);
    if (derived !== "CURRENT") warnings.push("DERIVED_DATA_REBUILT_IN_MEMORY: canonical Markdown is authoritative; no projection was written.");
  } else if (loadError) {
    mode = "uninitialized";
    derived = "MISSING";
    summary = emptySummary();
    active = JSON.stringify({ kind: "active-chunk-index", bounded: true, state: "UNINITIALIZED", marker: "PROJECT_MEMORY_ACTIVE_INDEX_EMPTY", guidance: "Use explicit publication or exact recall; no automatic repository scan is performed." });
    warnings.push(`CANONICAL_UNAVAILABLE: ${loadError}`);
  } else if (readText(path.join(root, "_summary.md")) !== undefined) {
    mode = "legacy-flat";
    derived = "MISSING";
    summary = clip(readText(path.join(root, "_summary.md"))!, ROOT_SUMMARY_LIMIT, "\n[summary truncated]");
    active = legacyActiveIndex();
    warnings.push("LEGACY_FLAT_READ_ONLY: active chunk index is unavailable until canonical publication.");
  } else {
    mode = "uninitialized";
    derived = "MISSING";
    summary = emptySummary();
    active = JSON.stringify({ kind: "active-chunk-index", bounded: true, state: "UNINITIALIZED", marker: "PROJECT_MEMORY_ACTIVE_INDEX_EMPTY", guidance: "Use explicit publication or exact recall; no automatic repository scan is performed." });
  }
  if (architecture.warning) warnings.push(architecture.warning);
  const sections = [
    "=== PROJECT MEMORY CONTEXT ===",
    "--- ROOT SUMMARY (bounded) ---",
    summary,
    "--- ACTIVE CHUNK INDEX (bounded; targeted recall only) ---",
    active,
    ...(architecture.index ? ["--- ARCHITECTURE INDEX (bounded; JSON authority, HTML non-authority) ---", architecture.index] : []),
    "=== END PROJECT MEMORY CONTEXT ===",
  ];
  const block = sections.join("\n");
  const snapshot = {
    kind: "project-context" as const,
    mode,
    derivedStatus: derived,
    summary,
    rootSummary: summary,
    activeIndex: active,
    activeChunkIndex: active,
    ...(architecture.index ? { architectureIndex: architecture.index } : {}),
    architectureStatus: architecture.status,
    warnings,
    block,
    prompt: block,
    compactorInput: { summary, activeIndex: active, ...(architecture.index ? { architectureIndex: architecture.index } : {}) },
  } as ProjectContext;
  return freeze(snapshot);
}
export const createProjectContext = assembleProjectContext;
export const buildProjectContext = assembleProjectContext;
export const loadProjectContext = assembleProjectContext;
