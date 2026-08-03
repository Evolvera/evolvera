import { existsSync, readFileSync } from "node:fs";
import { canonicalPaths } from "./io.ts";
import { ProjectStore } from "./store.ts";
import { projectProjections } from "./projection.ts";
import type { CanonicalChunk, CanonicalProject, Category, ChunkStatus, Confidence } from "./schema.ts";
import { CATEGORIES, CONFIDENCES, STATUSES } from "./schema.ts";

export type RecallState = "found" | "partial" | "stale" | "unavailable";
export type RecallOptions = { currentHead?: string };

type RecallBase = { id: string; state: RecallState; status: RecallState; reason?: string; derived?: "current" | "stale" | "missing" };
export type ProjectRecall = RecallBase & {
  kind: "project";
  project?: CanonicalProject;
  evidence?: CanonicalProject["evidence"];
};
export type ChunkRecall = RecallBase & {
  kind: "chunk";
  projectId?: string;
  chunk?: CanonicalChunk;
  evidence?: CanonicalProject["evidence"];
};
export type RecallResult = ProjectRecall | ChunkRecall;

export type SearchFilters = {
  text?: string;
  tag?: string;
  tags?: string[];
  category?: Category;
  status?: ChunkStatus;
  confidence?: Confidence;
  limit?: number;
};
export type SearchMatch = {
  id: string;
  projectId: string;
  category: Category;
  title: string;
  target: string;
  status: ChunkStatus;
  confidence: Confidence;
  tags: string[];
  snippet: string;
  score: number;
};
export type SearchResult = { state: "found" | "unavailable"; status: "found" | "unavailable"; matches: SearchMatch[]; reason?: string };

const ID = /^pm:(p|c):[a-f0-9]{32}$/;
const HEAD = /^(?:[0-9a-f]{40}|UNKNOWN)$/;
const MAX_QUERY = 500;
const MAX_TAG = 80;
const MAX_RESULTS = 100;

function unavailable(id: string, kind: "project" | "chunk", reason: string): RecallResult {
  return { id, kind, state: "unavailable", status: "unavailable", reason } as RecallResult;
}
function load(root: string): { project?: CanonicalProject; error?: string } {
  if (typeof root !== "string" || !root.startsWith("/")) throw new Error("project root must be an absolute path");
  try { return { project: new ProjectStore(root).load() }; } catch (error: any) { return { error: error?.message ?? String(error) }; }
}
function derivedState(root: string, project: CanonicalProject): "current" | "stale" | "missing" {
  const paths = canonicalPaths(root);
  if (!existsSync(paths.index) || !existsSync(paths.summary)) return "missing";
  try {
    const expected = projectProjections(project);
    const index = JSON.parse(readFileSync(paths.index, "utf8"));
    const summary = readFileSync(paths.summary, "utf8");
    return JSON.stringify(index) === JSON.stringify(expected.index) && summary === expected.summary ? "current" : "stale";
  } catch { return "stale"; }
}
function exactProject(root: string, id: string, options: RecallOptions = {}): ProjectRecall {
  const loaded = load(root);
  if (loaded.error) return unavailable(id, "project", `CANONICAL_UNAVAILABLE: ${loaded.error}`) as ProjectRecall;
  if (!loaded.project) return unavailable(id, "project", "CANONICAL_UNAVAILABLE: project is uninitialized") as ProjectRecall;
  if (loaded.project.frontMatter.id !== id) return unavailable(id, "project", "CANONICAL_UNAVAILABLE: project id is not present") as ProjectRecall;
  const derived = derivedState(root, loaded.project);
  const sourceHead = loaded.project.frontMatter.sourceHead;
  const staleHead = options.currentHead !== undefined && HEAD.test(options.currentHead) && sourceHead !== "UNKNOWN" && options.currentHead !== sourceHead;
  const state: RecallState = staleHead || derived !== "current" ? "stale" : "found";
  const reason = staleHead ? "CANONICAL_STALE: source head differs" : derived !== "current" ? `DERIVED_${derived.toUpperCase()}: canonical Markdown was recalled directly` : undefined;
  return { id, kind: "project", state, status: state, derived, ...(reason ? { reason } : {}), project: loaded.project, evidence: loaded.project.evidence };
}
function exactChunk(root: string, id: string, options: RecallOptions = {}): ChunkRecall {
  const loaded = load(root);
  if (loaded.error) return unavailable(id, "chunk", `CANONICAL_UNAVAILABLE: ${loaded.error}`) as ChunkRecall;
  if (!loaded.project) return unavailable(id, "chunk", "CANONICAL_UNAVAILABLE: project is uninitialized") as ChunkRecall;
  const chunk = loaded.project.chunks.find((item) => item.frontMatter.id === id);
  if (!chunk) return unavailable(id, "chunk", "CANONICAL_UNAVAILABLE: chunk id is not present") as ChunkRecall;
  const derived = derivedState(root, loaded.project);
  const sourceHead = chunk.frontMatter.sourceHead;
  const staleHead = options.currentHead !== undefined && HEAD.test(options.currentHead) && sourceHead !== "UNKNOWN" && options.currentHead !== sourceHead;
  const state: RecallState = staleHead || derived !== "current" ? "stale" : "found";
  const reason = staleHead ? "CANONICAL_STALE: source head differs" : derived !== "current" ? `DERIVED_${derived.toUpperCase()}: canonical Markdown was recalled directly` : undefined;
  const evidence = loaded.project.evidence.filter((item) => chunk.frontMatter.evidenceIds.includes(item.id));
  return { id, kind: "chunk", projectId: loaded.project.frontMatter.id, state, status: state, derived, ...(reason ? { reason } : {}), chunk, evidence };
}

/** Exact recall reads canonical Markdown through ProjectStore; generated JSON is never a data source. */
export function recallExact(root: string, id: string, options: RecallOptions = {}): RecallResult {
  const kind = typeof id === "string" && id.startsWith("pm:p:") ? "project" : "chunk";
  if (typeof id !== "string" || !ID.test(id)) return unavailable(typeof id === "string" ? id : "", kind, "MALFORMED_ID: expected pm:p: or pm:c: id");
  return id.startsWith("pm:p:") ? exactProject(root, id, options) : exactChunk(root, id, options);
}
export const recall = recallExact;
export const recallProject = (root: string, id: string, options?: RecallOptions): ProjectRecall => {
  const result = recallExact(root, id, options);
  return result.kind === "project" ? result : unavailable(id, "project", "MALFORMED_ID: expected a project id") as ProjectRecall;
};
export const recallChunk = (root: string, id: string, options?: RecallOptions): ChunkRecall => {
  const result = recallExact(root, id, options);
  return result.kind === "chunk" ? result : unavailable(id, "chunk", "MALFORMED_ID: expected a chunk id") as ChunkRecall;
};

function tagsFor(chunk: CanonicalChunk): string[] {
  const tags = new Set<string>();
  for (const match of chunk.body.matchAll(/#([a-z0-9][a-z0-9_-]*)/giu)) {
    tags.add(match[1].toLowerCase());
    if (tags.size >= 20) break;
  }
  return [...tags].sort();
}
function compact(value: string, limit: number): string {
  const text = value.replace(/[\u0000-\u001f\u007f]/gu, " ").replace(/\s+/gu, " ").trim();
  return text.length <= limit ? text : `${text.slice(0, Math.max(0, limit - 16))} [truncated]`;
}
function validateFilters(filters: SearchFilters = {}): Required<Pick<SearchFilters, "limit">> & SearchFilters {
  if (filters === null || typeof filters !== "object" || Array.isArray(filters)) throw new Error("search filters must be an object");
  for (const key of Object.keys(filters)) if (!["text", "tag", "tags", "category", "status", "confidence", "limit"].includes(key)) throw new Error(`unsupported search filter: ${key}`);
  if (filters.text !== undefined && (typeof filters.text !== "string" || filters.text.length > MAX_QUERY)) throw new Error("search text is invalid or exceeds its bound");
  if (filters.tag !== undefined && (typeof filters.tag !== "string" || !filters.tag.trim() || filters.tag.length > MAX_TAG)) throw new Error("search tag is invalid");
  if (filters.tags !== undefined && (!Array.isArray(filters.tags) || filters.tags.length > 20 || filters.tags.some((tag) => typeof tag !== "string" || !tag.trim() || tag.length > MAX_TAG))) throw new Error("search tags are invalid");
  if (filters.category !== undefined && !CATEGORIES.includes(filters.category)) throw new Error("search category is invalid");
  if (filters.status !== undefined && !STATUSES.includes(filters.status)) throw new Error("search status is invalid");
  if (filters.confidence !== undefined && !CONFIDENCES.includes(filters.confidence)) throw new Error("search confidence is invalid");
  const limit = filters.limit ?? 20;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_RESULTS) throw new Error("search limit is invalid");
  return { ...filters, limit };
}
function queryTokens(value: string | undefined): string[] { return value?.toLowerCase().trim().split(/\s+/u).filter(Boolean) ?? []; }

/** Deterministic bounded lexical search. Results contain metadata/snippets, never full chunk bodies. */
export function searchProject(root: string, rawFilters: SearchFilters = {}): SearchResult {
  const filters = validateFilters(rawFilters);
  const loaded = load(root);
  if (loaded.error) return { state: "unavailable", status: "unavailable", matches: [], reason: `CANONICAL_UNAVAILABLE: ${loaded.error}` };
  if (!loaded.project) return { state: "unavailable", status: "unavailable", matches: [], reason: "CANONICAL_UNAVAILABLE: project is uninitialized" };
  const wantedTags = [...new Set([...(filters.tag ? [filters.tag] : []), ...(filters.tags ?? [])].map((tag) => tag.toLowerCase()))];
  const tokens = queryTokens(filters.text);
  const matches = loaded.project.chunks.map((chunk): SearchMatch | undefined => {
    const fm = chunk.frontMatter;
    const tags = tagsFor(chunk);
    if (filters.category && fm.category !== filters.category) return undefined;
    if (filters.status && fm.status !== filters.status) return undefined;
    if (filters.confidence && fm.confidence !== filters.confidence) return undefined;
    if (wantedTags.some((tag) => !tags.includes(tag))) return undefined;
    const haystack = [fm.id, fm.category, fm.title, fm.target, fm.status, fm.confidence, ...tags, chunk.body].join(" ").toLowerCase();
    if (tokens.some((token) => !haystack.includes(token))) return undefined;
    const score = tokens.reduce((total, token) => total + (haystack.split(token).length - 1), 0) + wantedTags.length;
    return { id: fm.id, projectId: fm.projectId, category: fm.category, title: fm.title, target: fm.target, status: fm.status, confidence: fm.confidence, tags, snippet: compact(chunk.body, 240), score };
  }).filter((match): match is SearchMatch => match !== undefined).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, filters.limit);
  return { state: "found", status: "found", matches };
}
export const search = searchProject;
export const lexicalSearch = searchProject;
