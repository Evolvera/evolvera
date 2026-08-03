import path from "node:path";
import type { ProjectIoOptions } from "./io.ts";
import { atomicWrite, atomicWriteJson, canonicalPaths } from "./io.ts";
import { CATEGORIES, contentDigest, validateProject } from "./schema.ts";
import type { CanonicalProject, Category } from "./schema.ts";

export const ROOT_SUMMARY_LIMIT = 8_000;
export const CATEGORY_SUMMARY_LIMIT = 4_000;
export const INDEX_LIMIT = 4_000;
export type ProjectProjections = {
  canonicalDigest: string;
  index: Record<string, unknown>;
  summary: string;
  categories: Record<Category, string>;
};

function digestStamp(digest: string): string { return `<!-- projection-digest: ${digest} -->`; }
function clip(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, Math.max(0, limit - 32))}\n[projection truncated]`;
}
function compactBody(value: string): string { return value.replace(/\s+/gu, " ").trim(); }
function indexJson(project: CanonicalProject, digest: string): Record<string, unknown> {
  const all = [...project.chunks].sort((a, b) => a.frontMatter.id.localeCompare(b.frontMatter.id));
  const chunks = all.map((chunk) => ({ id: chunk.frontMatter.id, category: chunk.frontMatter.category, status: chunk.frontMatter.status, confidence: chunk.frontMatter.confidence, title: chunk.frontMatter.title, target: chunk.frontMatter.target, sourceHead: chunk.frontMatter.sourceHead, evidenceIds: [...chunk.frontMatter.evidenceIds].sort(), links: [...chunk.frontMatter.links].sort() }));
  const base = { schemaVersion: 1, kind: "project-index", projectId: project.frontMatter.id, canonicalDigest: digest, chunks } as Record<string, unknown>;
  while (JSON.stringify(base).length > INDEX_LIMIT && (base.chunks as unknown[]).length > 0) {
    (base.chunks as unknown[]).pop();
    base.truncated = true;
  }
  if (JSON.stringify(base).length > INDEX_LIMIT) {
    base.chunks = [];
    base.truncated = true;
  }
  return base;
}
function summaryFor(project: CanonicalProject, category: Category | undefined, digest: string, limit: number): string {
  const chunks = project.chunks.filter((chunk) => category === undefined || chunk.frontMatter.category === category).sort((a, b) => a.frontMatter.id.localeCompare(b.frontMatter.id));
  const title = category === undefined ? "# Project memory summary" : `# ${category} memory summary`;
  const lines = [digestStamp(digest), title, `Project: ${project.frontMatter.name} (${project.frontMatter.id})`, `Source head: ${project.frontMatter.sourceHead}`, "", ...chunks.map((chunk) => {
    const fm = chunk.frontMatter;
    const evidence = fm.evidenceIds.length ? ` evidence=${fm.evidenceIds.join(",")}` : "";
    return `- [${fm.status}] ${fm.title} — ${fm.target} (${fm.confidence})${evidence}\n  ${compactBody(chunk.body)}`;
  })];
  return clip(lines.join("\n"), limit);
}

export function projectProjections(project: CanonicalProject): ProjectProjections {
  const canonical = validateProject(project);
  const canonicalDigest = contentDigest(canonical);
  const categories = Object.fromEntries(CATEGORIES.map((category) => [category, summaryFor(canonical, category, canonicalDigest, CATEGORY_SUMMARY_LIMIT)])) as Record<Category, string>;
  return { canonicalDigest, index: indexJson(canonical, canonicalDigest), summary: summaryFor(canonical, undefined, canonicalDigest, ROOT_SUMMARY_LIMIT), categories };
}

export const buildProjectProjections = projectProjections;

export function writeProjections(root: string, projections: ProjectProjections, options: ProjectIoOptions = {}): void {
  const paths = canonicalPaths(root);
  atomicWriteJson(paths.index, projections.index, options);
  atomicWrite(paths.summary, projections.summary, options);
  for (const [category, summary] of Object.entries(projections.categories)) atomicWrite(path.join(root, "categories", category, "_summary.md"), summary, options);
}
export function readProjectionPaths(root: string): { index: string; summary: string; categories: Record<Category, string> } {
  return { index: canonicalPaths(root).index, summary: canonicalPaths(root).summary, categories: Object.fromEntries(CATEGORIES.map((category) => [category, path.join(root, "categories", category, "_summary.md")])) as Record<Category, string> };
}
