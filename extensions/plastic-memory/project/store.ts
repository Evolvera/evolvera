import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { makeChunk, makeProject } from "./schema.ts";
import type { CanonicalChunk, CanonicalProject, ProjectFrontMatter, PublicationCandidate } from "./schema.ts";
import { chunkFilename, contentDigest, parseChunkMarkdown, parseProjectMarkdown, serializeMarkdown, validateEvidence, validateProject, validatePublicationCandidate } from "./schema.ts";
export type { PublicationCandidate } from "./schema.ts";
import { atomicWrite, atomicWriteJson, canonicalPaths, readJson, readUtf8, withLock } from "./io.ts";
import type { ProjectIoOptions } from "./io.ts";
import { projectProjections, writeProjections } from "./projection.ts";

export type Acceptance = { accepted: true; rationale?: string };
export type ProjectPublicationInput = {
  project?: { provenance: unknown; name: string; repository: string; sourceHead?: string; body?: string };
  candidate: PublicationCandidate;
};
export type PublicationResult = {
  status: "published";
  projectId: string;
  chunkId: string;
  canonicalDigest: string;
  derived: "fresh" | "stale";
  repairable: boolean;
  error?: string;
  repair: () => { derived: "fresh"; canonicalDigest: string };
};

function chunkPath(root: string, chunk: CanonicalChunk): string { return path.join(canonicalPaths(root).chunks, chunkFilename(chunk.frontMatter)); }
function restoreCanonicalFiles(snapshots: Map<string, Buffer | undefined>): void {
  for (const [file, bytes] of snapshots) {
    if (bytes === undefined) rmSync(file, { force: true });
    else { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, bytes); }
  }
}
function canonicalChunkFiles(root: string): string[] {
  const directory = canonicalPaths(root).chunks;
  if (!existsSync(directory)) return [];
  const files: string[] = [];
  for (const category of readdirSync(directory, { withFileTypes: true })) {
    if (!category.isDirectory()) throw new Error("unexpected entry in canonical chunks");
    if (!(["setup", "deploy", "bugs", "decisions", "architecture", "integrations", "environment", "gaps"] as string[]).includes(category.name)) throw new Error("unknown canonical chunk category");
    for (const file of readdirSync(path.join(directory, category.name), { withFileTypes: true })) {
      if (!file.isFile() || !file.name.endsWith(".md")) throw new Error("unexpected canonical chunk entry");
      files.push(path.join(directory, category.name, file.name));
    }
  }
  return files.sort();
}

export class ProjectStore {
  readonly root: string;
  readonly io: ProjectIoOptions;
  readonly now: () => string;
  constructor(root: string, options: ProjectIoOptions & { now?: () => string } = {}) { this.root = path.resolve(root); this.io = options; this.now = options.now ?? (() => new Date().toISOString()); }

  load(): CanonicalProject | undefined {
    const paths = canonicalPaths(this.root);
    const projectMarkdown = readUtf8(paths.project);
    if (projectMarkdown === undefined) return undefined;
    const projectParsed = parseProjectMarkdown(projectMarkdown);
    const rawEvidence = readJson(paths.evidence) ?? [];
    if (!Array.isArray(rawEvidence)) throw new Error("evidence store must be an array");
    const evidence = rawEvidence.map(validateEvidence);
    const evidenceIds = new Set(evidence.map((item) => item.id));
    const chunks = canonicalChunkFiles(this.root).map((file) => {
      const chunk = parseChunkMarkdown(readUtf8(file)!, evidenceIds);
      const expected = path.join(paths.chunks, chunkFilename(chunk.frontMatter));
      if (path.resolve(expected) !== path.resolve(file)) throw new Error("chunk filename is not canonical");
      return { ...chunk, path: path.relative(this.root, file).replaceAll(path.sep, "/") };
    });
    return validateProject({ frontMatter: projectParsed.frontMatter, body: projectParsed.body, evidence, chunks });
  }

  private writeProject(frontMatter: ProjectFrontMatter, body: string): void { atomicWrite(canonicalPaths(this.root).project, serializeMarkdown(frontMatter, body), this.io); }
  private writeEvidence(evidence: Evidence[]): void { atomicWriteJson(canonicalPaths(this.root).evidence, evidence, this.io); }
  private writeChunk(chunk: CanonicalChunk): void { atomicWrite(chunkPath(this.root, chunk), serializeMarkdown(chunk.frontMatter, chunk.body), this.io); }

  repair(): { derived: "fresh"; canonicalDigest: string } {
    return withLock(this.root, () => {
      const state = this.load(); if (!state) throw new Error("cannot repair an uninitialized project");
      const result = projectProjections(state); writeProjections(this.root, result, this.io);
      return { derived: "fresh" as const, canonicalDigest: result.canonicalDigest };
    }, this.io);
  }

  publish(input: ProjectPublicationInput, acceptance: Acceptance): PublicationResult {
    if (!acceptance || acceptance.accepted !== true) throw new Error("explicit acceptance is required for publication");
    const candidate = validatePublicationCandidate(input.candidate);
    return withLock(this.root, () => this.publishLocked({ ...input, candidate }), this.io);
  }

  private publishLocked(input: ProjectPublicationInput): PublicationResult {
    let state = this.load();
    let uninitialized = false;
    const candidate = input.candidate;
    if (!state) {
      uninitialized = true;
      if (!input.project) throw new Error("first publication requires project identity");
      const frontMatter = {
        schemaVersion: 1 as const, kind: "project" as const, id: `pm:p:${"0".repeat(32)}`,
        name: input.project.name, repository: input.project.repository, sourceHead: input.project.sourceHead ?? candidate.sourceHead ?? "UNKNOWN",
        createdAt: this.now(), updatedAt: this.now(),
      };
      const projectFrontMatter = makeProject(input.project.provenance, frontMatter);
      state = { frontMatter: projectFrontMatter, body: input.project.body ?? "", evidence: [], chunks: [] };
      validateProject(state);
    }
    if (candidate.expectedDigest && candidate.expectedDigest !== contentDigest(state)) throw new Error("STALE_CONFLICT: canonical digest changed");
    if (candidate.expectedSourceHead && candidate.expectedSourceHead !== state.frontMatter.sourceHead) throw new Error("STALE_CONFLICT: source head changed");

    const nextProjectFrontMatter = candidate.sourceHead && candidate.sourceHead !== state.frontMatter.sourceHead
      ? { ...state.frontMatter, sourceHead: candidate.sourceHead, updatedAt: this.now() }
      : state.frontMatter;
    const incomingEvidence = (candidate.evidence ?? []).map(validateEvidence);
    const evidence = [...state.evidence];
    const byId = new Map(evidence.map((item) => [item.id, item]));
    for (const item of incomingEvidence) {
      const prior = byId.get(item.id);
      if (prior && JSON.stringify(prior) !== JSON.stringify(item)) throw new Error("evidence id conflicts");
      if (!prior) { byId.set(item.id, item); evidence.push(item); }
    }
    const active = state.chunks.find((chunk) => chunk.frontMatter.status === "active" && chunk.frontMatter.target === candidate.target);
    if (active && candidate.chunkId !== active.frontMatter.id && candidate.supersedes !== active.frontMatter.id) throw new Error("duplicate active target");
    if (candidate.supersedes && (!state.chunks.some((chunk) => chunk.frontMatter.id === candidate.supersedes) || (active && candidate.supersedes !== active.frontMatter.id))) throw new Error("supersession conflict");

    const existing = candidate.supersedes
      ? (candidate.chunkId ? state.chunks.find((chunk) => chunk.frontMatter.id === candidate.chunkId) : undefined)
      : (candidate.chunkId ? state.chunks.find((chunk) => chunk.frontMatter.id === candidate.chunkId) : active);
    if (candidate.chunkId && !existing && candidate.supersedes === undefined) throw new Error("chunk update target does not exist");
    const createdAt = existing?.frontMatter.createdAt ?? this.now();
    const supersededChunk = candidate.supersedes ? state.chunks.find((item) => item.frontMatter.id === candidate.supersedes) : undefined;
    const supersededUpdatedAt = supersededChunk ? this.now() : undefined;
    const chunk = makeChunk(state.frontMatter.id, {
      id: existing?.frontMatter.id ?? candidate.chunkId,
      category: candidate.category, status: candidate.status ?? "active", confidence: candidate.confidence, title: candidate.title,
      target: candidate.target, sourceHead: candidate.sourceHead ?? state.frontMatter.sourceHead, evidenceIds: [...(candidate.evidence ?? []).map((item) => item.id)],
      links: candidate.links ?? [], supersedes: candidate.supersedes, createdAt, updatedAt: this.now(),
    }, candidate.body);
    // An update retains prior evidence references unless explicitly replaced; new claims cannot lose safety evidence.
    chunk.frontMatter.evidenceIds = [...new Set([...(existing?.frontMatter.evidenceIds ?? []), ...chunk.frontMatter.evidenceIds])];
    const canonicalChunks = [
      ...state.chunks.filter((item) => item !== existing && item.frontMatter.id !== candidate.supersedes),
      chunk,
      ...(supersededChunk ? [{ ...supersededChunk, frontMatter: { ...supersededChunk.frontMatter, status: "superseded" as const, updatedAt: supersededUpdatedAt! } }] : []),
    ];
    validateProject({ frontMatter: nextProjectFrontMatter, body: state.body, evidence, chunks: canonicalChunks });
    const paths = canonicalPaths(this.root);
    const files = new Set([paths.project, paths.evidence, chunkPath(this.root, chunk)]);
    if (supersededChunk) files.add(chunkPath(this.root, supersededChunk));
    const snapshots = new Map([...files].map((file) => [file, existsSync(file) ? readFileSync(file) : undefined]));
    try {
      if (uninitialized) {
        this.writeProject(nextProjectFrontMatter, state.body);
        this.writeEvidence(evidence);
      } else if (JSON.stringify(evidence) !== JSON.stringify(state.evidence)) this.writeEvidence(evidence);
      if (supersededChunk) this.writeChunk({ ...supersededChunk, frontMatter: { ...supersededChunk.frontMatter, status: "superseded", updatedAt: supersededUpdatedAt! } });
      this.writeChunk(chunk);
      if (!uninitialized && nextProjectFrontMatter !== state.frontMatter) this.writeProject(nextProjectFrontMatter, state.body);
    } catch (error: any) {
      try { restoreCanonicalFiles(snapshots); } catch (rollbackError: any) { throw new Error(`CANONICAL_WRITE_FAILED_ROLLBACK: ${rollbackError?.message ?? rollbackError}`); }
      throw new Error(`CANONICAL_WRITE_FAILED: ${error?.message ?? error}`);
    }
    const next: CanonicalProject = { frontMatter: nextProjectFrontMatter, body: state.body, evidence, chunks: canonicalChunks };
    const digest = contentDigest(validateProject(next));
    let derived: "fresh" | "stale" = "fresh"; let error: string | undefined;
    try { writeProjections(this.root, projectProjections(validateProject(next)), this.io); } catch (caught: any) { derived = "stale"; error = caught?.message ?? String(caught); }
    return { status: "published", projectId: next.frontMatter.id, chunkId: chunk.frontMatter.id, canonicalDigest: digest, derived, repairable: derived === "stale", error, repair: () => this.repair() };
  }
}

export const publishAcceptedCandidate = publishProject;
export function createProjectStore(root: string, options: ProjectIoOptions & { now?: () => string } = {}): ProjectStore { return new ProjectStore(root, options); }
export function loadProject(root: string): CanonicalProject | undefined { return new ProjectStore(root).load(); }
export function publishProject(root: string, input: ProjectPublicationInput, acceptance: Acceptance, options: ProjectIoOptions & { now?: () => string } = {}): PublicationResult { return new ProjectStore(root, options).publish(input, acceptance); }
