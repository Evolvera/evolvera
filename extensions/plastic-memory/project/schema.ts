import { makeChunkId, makeProjectId, PUBLIC_ID_PATTERN } from "../common/ids.ts";
import { assertSafeContent, assertSafeRelativePath, canonicalJson, digestParts } from "../common/safety.ts";

export const SCHEMA_VERSION = 1;
export const CATEGORIES = ["setup", "deploy", "bugs", "decisions", "architecture", "integrations", "environment", "gaps"] as const;
export const STATUSES = ["active", "superseded", "gap"] as const;
export const CONFIDENCES = ["known", "inferred", "unknown"] as const;
export type Category = (typeof CATEGORIES)[number];
export type ChunkStatus = (typeof STATUSES)[number];
export type Confidence = (typeof CONFIDENCES)[number];

export type Evidence = {
  id: string;
  path: string;
  claim: string;
  symbol?: string;
  startLine?: number;
  endLine?: number;
  sourceHead?: string;
};

export type PublicationCandidate = {
  category: Category;
  title: string;
  target: string;
  body: string;
  confidence: Confidence;
  sourceHead?: string;
  status?: ChunkStatus;
  chunkId?: string;
  supersedes?: string;
  links?: string[];
  evidence?: Evidence[];
  expectedDigest?: string;
  expectedSourceHead?: string;
};

export type ChunkFrontMatter = {
  schemaVersion: 1;
  kind: "project-chunk";
  id: string;
  projectId: string;
  category: Category;
  status: ChunkStatus;
  confidence: Confidence;
  title: string;
  target: string;
  sourceHead: string;
  evidenceIds: string[];
  links: string[];
  supersedes?: string;
  createdAt: string;
  updatedAt: string;
};

export type ProjectFrontMatter = {
  schemaVersion: 1;
  kind: "project";
  id: string;
  name: string;
  repository: string;
  sourceHead: string;
  createdAt: string;
  updatedAt: string;
};

export type CanonicalChunk = { frontMatter: ChunkFrontMatter; body: string; path?: string };
export type CanonicalProject = { frontMatter: ProjectFrontMatter; body: string; evidence: Evidence[]; chunks: CanonicalChunk[] };

const HEX_HEAD = /^(?:[0-9a-f]{40}|UNKNOWN)$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const ID = /^pm:(?:p|c):[a-f0-9]{32}$/;
const CANONICAL_DIGEST = /^[a-f0-9]{64}$/;
const EVIDENCE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EXACT_PROJECT = ["schemaVersion", "kind", "id", "name", "repository", "sourceHead", "createdAt", "updatedAt"];
const EXACT_CHUNK = ["schemaVersion", "kind", "id", "projectId", "category", "status", "confidence", "title", "target", "sourceHead", "evidenceIds", "links", "createdAt", "updatedAt", "supersedes"];

function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exact(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key)) && keys.every((key) => key in value || (key === "supersedes" && !(key in value)));
}
function oneOf<T extends string>(value: unknown, values: readonly T[], label: string): asserts value is T {
  if (typeof value !== "string" || !values.includes(value as T)) throw new Error(`${label} is invalid`);
}
function safeText(value: unknown, max: number, label: string): asserts value is string { assertSafeContent(value, max, label); }
function assertId(value: unknown, label: string): asserts value is string { if (typeof value !== "string" || !ID.test(value)) throw new Error(`${label} is invalid`); }
function assertDate(value: unknown, label: string): asserts value is string { if (typeof value !== "string" || !ISO.test(value)) throw new Error(`${label} must be an ISO UTC timestamp`); }
function assertDigest(value: unknown, label: string): asserts value is string { if (typeof value !== "string" || !HEX_HEAD.test(value)) throw new Error(`${label} is invalid`); }
function assertCanonicalDigest(value: unknown, label: string): asserts value is string { if (typeof value !== "string" || !CANONICAL_DIGEST.test(value)) throw new Error(`${label} is invalid`); }
function uniqueStrings(value: unknown, label: string): asserts value is string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string") || new Set(value).size !== value.length) throw new Error(`${label} must contain unique strings`);
}

export function validateEvidence(value: unknown): Evidence {
  if (!object(value)) throw new Error("evidence must be an object");
  const evidenceKeys = ["id", "path", "claim", "symbol", "startLine", "endLine", "sourceHead"];
  if (Object.keys(value).some((key) => !evidenceKeys.includes(key))) throw new Error("evidence contains unsupported fields");
  if (typeof value.id !== "string" || !EVIDENCE_ID.test(value.id)) throw new Error("evidence id is invalid");
  assertSafeRelativePath(value.path, "evidence path");
  safeText(value.path, 1_000, "evidence path");
  safeText(value.claim, 2_000, "evidence claim");
  if ("symbol" in value) safeText(value.symbol, 500, "evidence symbol");
  for (const key of ["startLine", "endLine"]) {
    if (key in value && (!Number.isSafeInteger(value[key]) || (value[key] as number) < 1)) throw new Error(`${key} must be a positive integer`);
  }
  if (value.endLine !== undefined && value.startLine !== undefined && (value.endLine as number) < (value.startLine as number)) throw new Error("evidence endLine precedes startLine");
  if ("sourceHead" in value) assertDigest(value.sourceHead, "evidence sourceHead");
  return structuredClone(value) as Evidence;
}

export function validatePublicationCandidate(value: unknown): PublicationCandidate {
  if (!object(value)) throw new Error("publication candidate must be an object");
  const keys = ["category", "title", "target", "body", "confidence", "sourceHead", "status", "chunkId", "supersedes", "links", "evidence", "expectedDigest", "expectedSourceHead"];
  const required = ["category", "title", "target", "body", "confidence"];
  if (Object.keys(value).some((key) => !keys.includes(key))) throw new Error("publication candidate contains unsupported fields");
  if (required.some((key) => !(key in value))) throw new Error("publication candidate is missing a required field");

  const evidence = "evidence" in value
    ? (Array.isArray(value.evidence) ? value.evidence.map(validateEvidence) : (() => { throw new Error("publication candidate evidence must be an array"); })())
    : undefined;
  const candidate = structuredClone(value) as PublicationCandidate;
  if (evidence !== undefined) candidate.evidence = evidence;
  if ("sourceHead" in candidate) assertDigest(candidate.sourceHead, "candidate sourceHead");
  if ("expectedSourceHead" in candidate) assertDigest(candidate.expectedSourceHead, "candidate expectedSourceHead");
  if ("expectedDigest" in candidate) assertCanonicalDigest(candidate.expectedDigest, "candidate expectedDigest");
  makeChunk("pm:p:" + "0".repeat(32), {
    category: candidate.category, status: candidate.status ?? "active", confidence: candidate.confidence, title: candidate.title,
    target: candidate.target, sourceHead: candidate.sourceHead ?? "UNKNOWN", evidenceIds: evidence?.map((item) => item.id) ?? [], links: candidate.links ?? [],
    id: candidate.chunkId, supersedes: candidate.supersedes,
  }, candidate.body);
  return candidate;
}

export function validateProjectFrontMatter(value: unknown): ProjectFrontMatter {
  if (!object(value) || !exact(value, EXACT_PROJECT) || value.schemaVersion !== 1 || value.kind !== "project") throw new Error("project front matter is not canonical");
  assertId(value.id, "project id");
  safeText(value.name, 300, "project name");
  assertSafeRelativePath(value.repository, "project repository");
  safeText(value.repository, 1_000, "project repository");
  assertDigest(value.sourceHead, "project sourceHead");
  assertDate(value.createdAt, "project createdAt"); assertDate(value.updatedAt, "project updatedAt");
  return structuredClone(value) as ProjectFrontMatter;
}

export function validateChunkFrontMatter(value: unknown, evidenceIds?: ReadonlySet<string>): ChunkFrontMatter {
  if (!object(value) || !exact(value, EXACT_CHUNK) || value.schemaVersion !== 1 || value.kind !== "project-chunk") throw new Error("chunk front matter is not canonical");
  assertId(value.id, "chunk id"); assertId(value.projectId, "chunk projectId");
  oneOf(value.category, CATEGORIES, "category"); oneOf(value.status, STATUSES, "status"); oneOf(value.confidence, CONFIDENCES, "confidence");
  safeText(value.title, 300, "chunk title"); assertSafeRelativePath(value.target, "chunk target"); safeText(value.target, 1_000, "chunk target");
  assertDigest(value.sourceHead, "chunk sourceHead"); assertDate(value.createdAt, "chunk createdAt"); assertDate(value.updatedAt, "chunk updatedAt");
  uniqueStrings(value.evidenceIds, "chunk evidenceIds"); uniqueStrings(value.links, "chunk links");
  if (value.evidenceIds.some((id) => !EVIDENCE_ID.test(id))) throw new Error("chunk evidence id is invalid");
  if (value.links.some((id) => !ID.test(id))) throw new Error("chunk link is invalid");
  if (value.supersedes !== undefined) assertId(value.supersedes, "chunk supersedes");
  if (value.confidence !== "unknown" && value.evidenceIds.length === 0) throw new Error("known and inferred chunks require safe evidence");
  if (evidenceIds && value.evidenceIds.some((id) => !evidenceIds.has(id))) throw new Error("chunk references missing evidence");
  return structuredClone(value) as ChunkFrontMatter;
}

export function validateChunk(chunk: unknown, evidenceIds?: ReadonlySet<string>): CanonicalChunk {
  if (!object(chunk) || typeof chunk.body !== "string") throw new Error("chunk must contain frontMatter and editable body");
  const frontMatter = validateChunkFrontMatter(chunk.frontMatter, evidenceIds);
  assertSafeContent(chunk.body, 100_000, "chunk body");
  return { frontMatter, body: chunk.body, ...(chunk.path ? { path: chunk.path } : {}) };
}

export function validateProject(project: unknown): CanonicalProject {
  if (!object(project) || !object(project.frontMatter) || typeof project.body !== "string" || !Array.isArray(project.evidence) || !Array.isArray(project.chunks)) throw new Error("project is incomplete");
  const frontMatter = validateProjectFrontMatter(project.frontMatter);
  assertSafeContent(project.body, 20_000, "project body");
  const evidence = project.evidence.map(validateEvidence);
  const evidenceIds = new Set(evidence.map((item) => item.id));
  if (evidenceIds.size !== evidence.length) throw new Error("duplicate evidence id");
  const chunks = project.chunks.map((chunk) => validateChunk(chunk, evidenceIds));
  const chunkIds = new Set(chunks.map((chunk) => chunk.frontMatter.id));
  if (chunkIds.size !== chunks.length) throw new Error("duplicate chunk id");
  if (chunks.some((chunk) => chunk.frontMatter.projectId !== frontMatter.id)) throw new Error("chunk project mismatch");
  if (chunks.some((chunk) => chunk.frontMatter.links.some((id) => !chunkIds.has(id)))) throw new Error("dangling chunk link");
  if (chunks.some((chunk) => chunk.frontMatter.supersedes !== undefined && (!chunkIds.has(chunk.frontMatter.supersedes) || chunk.frontMatter.supersedes === chunk.frontMatter.id))) throw new Error("dangling chunk supersession");
  const activeTargets = new Set<string>();
  for (const chunk of chunks) if (chunk.frontMatter.status === "active") {
    if (activeTargets.has(chunk.frontMatter.target)) throw new Error("duplicate active target");
    activeTargets.add(chunk.frontMatter.target);
  }
  return structuredClone({ frontMatter, body: project.body, evidence, chunks }) as CanonicalProject;
}

export function parseMarkdown(markdown: string): { frontMatter: Record<string, unknown>; body: string } {
  if (typeof markdown !== "string" || !markdown.startsWith("---json\n")) throw new Error("Markdown must start with strict JSON front matter");
  const end = markdown.indexOf("\n---\n", 8);
  if (end < 0 || markdown.slice(end + 5).startsWith("---")) throw new Error("Markdown front matter delimiter is malformed");
  const raw = markdown.slice(8, end);
  if (!raw || raw.includes("\n")) throw new Error("front matter must be one JSON line");
  let frontMatter: unknown;
  try { frontMatter = JSON.parse(raw); } catch { throw new Error("front matter is not valid JSON"); }
  if (!object(frontMatter)) throw new Error("front matter must be an object");
  const body = markdown.slice(end + 5);
  assertSafeContent(body, 100_000, "Markdown body");
  return { frontMatter, body: body.startsWith("\n") ? body.slice(1) : body };
}

export function serializeMarkdown(frontMatter: ProjectFrontMatter | ChunkFrontMatter, body: string): string {
  if (frontMatter.kind === "project") validateProjectFrontMatter(frontMatter); else validateChunkFrontMatter(frontMatter);
  assertSafeContent(body, 100_000, "Markdown body");
  const clean = Object.fromEntries(Object.entries(frontMatter).filter(([, value]) => value !== undefined));
  return `---json\n${canonicalJson(clean)}\n---\n\n${body}`;
}

export function parseProjectMarkdown(markdown: string): { frontMatter: ProjectFrontMatter; body: string } {
  const parsed = parseMarkdown(markdown); return { frontMatter: validateProjectFrontMatter(parsed.frontMatter), body: parsed.body };
}
export function parseChunkMarkdown(markdown: string, evidenceIds?: ReadonlySet<string>): CanonicalChunk {
  const parsed = parseMarkdown(markdown); return { frontMatter: validateChunkFrontMatter(parsed.frontMatter, evidenceIds), body: parsed.body };
}
export function chunkFilename(chunk: Pick<ChunkFrontMatter, "id" | "category">): string {
  validateChunkFrontMatter({ schemaVersion: 1, kind: "project-chunk", id: chunk.id, projectId: "pm:p:" + "0".repeat(32), category: chunk.category, status: "gap", confidence: "unknown", title: "placeholder", target: "placeholder", sourceHead: "UNKNOWN", evidenceIds: [], links: [], createdAt: "2020-01-01T00:00:00.000Z", updatedAt: "2020-01-01T00:00:00.000Z" });
  return `${chunk.category}/${chunk.id.replaceAll(":", "-")}.md`;
}
export function makeProject(provenance: unknown, input: { name: string; repository: string; sourceHead?: string; body?: string; createdAt?: string }): ProjectFrontMatter {
  const createdAt = input.createdAt ?? new Date().toISOString();
  return validateProjectFrontMatter({ schemaVersion: 1, kind: "project", id: makeProjectId(provenance, { name: input.name, repository: input.repository }), name: input.name, repository: input.repository, sourceHead: input.sourceHead ?? "UNKNOWN", createdAt, updatedAt: createdAt });
}
export function makeChunk(projectId: string, input: Omit<ChunkFrontMatter, "schemaVersion" | "kind" | "id" | "projectId" | "createdAt" | "updatedAt"> & { id?: string; createdAt?: string; updatedAt?: string }, body: string): CanonicalChunk {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const frontMatter = { schemaVersion: 1, kind: "project-chunk", ...input, id: input.id ?? makeChunkId({ projectId, category: input.category, target: input.target }, { title: input.title, body }), projectId, createdAt, updatedAt: input.updatedAt ?? createdAt } as ChunkFrontMatter;
  return validateChunk({ frontMatter, body });
}

export const parseFrontMatter = parseMarkdown;
export const serializeCanonicalMarkdown = serializeMarkdown;
export const validateProjectSchema = validateProject;
export const validateChunkSchema = validateChunk;
export const isProjectId = (value: unknown): value is string => typeof value === "string" && PUBLIC_ID_PATTERN.test(value) && value.startsWith("pm:p:");
export const contentDigest = (project: CanonicalProject): string => digestParts(
  project.frontMatter.id,
  JSON.parse(JSON.stringify(project.evidence)),
  project.chunks.map((chunk) => ({ frontMatter: JSON.parse(JSON.stringify(chunk.frontMatter)), body: chunk.body })),
);
