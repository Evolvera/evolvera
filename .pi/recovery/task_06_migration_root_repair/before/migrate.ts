import { mkdtempSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync, renameSync } from "node:fs";
import path from "node:path";
import { makeChunkId } from "../common/ids.ts";
import { sha256Hex } from "../common/safety.ts";
import { atomicWriteJson, canonicalPaths, readJson, type IoFault } from "./io.ts";
import { ProjectStore } from "./store.ts";
import { makeProject } from "./schema.ts";
import type { Category } from "./schema.ts";

export const MIGRATION_MANIFEST = "_migration-manifest.json";
export const LEGACY_ARCHIVE = "_legacy-flat";
export const MIGRATION_VERSION = 1;

const PROJECT_NAME = "Migrated flat project memory";
const PROJECT_REPOSITORY = "legacy-flat";
const PROVENANCE = { kind: "flat-project-migration", version: MIGRATION_VERSION };
const SOURCES: ReadonlyArray<{ file: string; category: Category }> = [
  { file: "setup.md", category: "setup" },
  { file: "bugs.md", category: "bugs" },
  { file: "architecture.md", category: "architecture" },
  { file: "env.md", category: "environment" },
  { file: "api-external.md", category: "integrations" },
  { file: "decisions.md", category: "decisions" },
];
const ARCHIVE_ONLY = ["_summary.md", "architecture.json", "architecture.html"];
const GENERATED_ROOT_FILES = ["_project.md", "evidence.json", "index.json"];
const GENERATED_ROOT_DIRS = ["chunks", "categories"];

type SourceEntry = {
  path: string;
  category?: Category;
  present: boolean;
  digest?: string;
  bytes?: number;
  archivePath: string;
  archiveOnly: boolean;
};

export type MigrationChunkPlan = {
  sourcePath: string;
  sourceKey: string;
  sourceDigest: string;
  category: Category;
  title: string;
  target: string;
  body: string;
  sectionIndex: number;
  chunkId: string;
};

export type MigrationReport = {
  schemaVersion: 1;
  kind: "flat-project-migration-report";
  root: string;
  status: "ready" | "conflict" | "published" | "recovery-required";
  noWrite: true;
  idempotent: boolean;
  canPublish: boolean;
  projectId: string;
  sources: SourceEntry[];
  chunks: MigrationChunkPlan[];
  conflicts: string[];
  manifestPath?: string;
  manifestStatus?: "publishing" | "published";
};

type MigrationManifest = {
  schemaVersion: 1;
  kind: "flat-project-migration";
  status: "publishing" | "published";
  projectId: string;
  root: string;
  stagePath: string;
  archivePath: string;
  createdAt: string;
  sourceFiles: Array<SourceEntry & { digest?: string }>;
  chunks: Array<Pick<MigrationChunkPlan, "sourcePath" | "sourceKey" | "sourceDigest" | "category" | "title" | "target" | "sectionIndex" | "chunkId">>;
  canonicalFiles: string[];
};

export type MigrationOptions = ProjectIoOptions & { now?: () => string };

function migrationRoot(root: string): string {
  if (typeof root !== "string" || !path.isAbsolute(root)) throw new Error("migration root must be absolute");
  const resolved = path.resolve(root);
  const parts = resolved.split(path.sep).filter(Boolean);
  for (let index = 0; index < parts.length - 1; index += 1) {
    if (parts[index] === ".pi" && parts[index + 1] === "memory") throw new Error("refusing to target live project memory");
  }
  if (!existsSync(resolved) || !lstatSync(resolved).isDirectory()) throw new Error("migration root must be an existing directory");
  return resolved;
}

function regularFile(root: string, relative: string): string | undefined {
  const file = path.join(root, relative);
  if (!existsSync(file)) return undefined;
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`legacy source is not a regular file: ${relative}`);
  return file;
}

function archiveRelative(file: string): string { return `${LEGACY_ARCHIVE}/${file}`; }
function manifestPath(root: string): string { return path.join(root, MIGRATION_MANIFEST); }
function digestBytes(bytes: Uint8Array): string { return sha256Hex(bytes); }
function readBytes(root: string, relative: string): Buffer | undefined {
  const file = regularFile(root, relative);
  return file === undefined ? undefined : readFileSync(file);
}
function safeText(bytes: Buffer, relative: string): string {
  const text = bytes.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(bytes)) throw new Error(`source is not valid UTF-8 and can only be archived: ${relative}`);
  return text;
}

function slug(value: string): string {
  const normalized = value.normalize("NFKD").toLowerCase().replace(/[^\p{Letter}\p{Number}]+/gu, "-").replace(/^-+|-+$/gu, "");
  return normalized || "untitled";
}

function splitLevelTwo(sourcePath: string, category: Category, bytes: Buffer): MigrationChunkPlan[] {
  const text = safeText(bytes, sourcePath);
  const starts: Array<{ index: number; title: string }> = [];
  const heading = /^##[ \t]+([^\r\n]*)(?:\r\n|\n|$)/gmu;
  let match: RegExpExecArray | null;
  while ((match = heading.exec(text)) !== null) {
    const rawTitle = match[1].replace(/[ \t]+#+[ \t]*$/u, "").trim();
    starts.push({ index: match.index, title: rawTitle || "Untitled legacy section" });
  }
  const ranges: Array<{ start: number; end: number; title: string; index: number }> = [];
  if (starts.length === 0) {
    if (text.length > 0) ranges.push({ start: 0, end: text.length, title: `Legacy import: ${sourcePath}`, index: 0 });
  } else {
    if (starts[0].index > 0) ranges.push({ start: 0, end: starts[0].index, title: `Legacy preamble: ${sourcePath}`, index: 0 });
    starts.forEach((item, index) => ranges.push({ start: item.index, end: index + 1 < starts.length ? starts[index + 1].index : text.length, title: item.title, index: index + 1 }));
  }
  const sourceDigest = digestBytes(bytes);
  return ranges.map((range) => {
    const sectionKey = range.index === 0 ? "preamble" : slug(range.title);
    const sourceKey = `${sourcePath}#${sectionKey}`;
    const target = `legacy/${sourcePath}/${sectionKey}.md`;
    const body = text.slice(range.start, range.end);
    return { sourcePath, sourceKey, sourceDigest, category, title: range.title, target, body, sectionIndex: range.index, chunkId: "" };
  });
}

function generatedCanonicalExists(root: string): boolean {
  const paths = canonicalPaths(root);
  return GENERATED_ROOT_FILES.some((file) => existsSync(path.join(root, file))) ||
    GENERATED_ROOT_DIRS.some((directory) => existsSync(path.join(root, directory))) ||
    existsSync(path.join(root, LEGACY_ARCHIVE)) ||
    existsSync(paths.lock);
}

function projectIdentity(): { projectId: string; project: { provenance: unknown; name: string; repository: string } } {
  const project = { provenance: PROVENANCE, name: PROJECT_NAME, repository: PROJECT_REPOSITORY };
  return { projectId: makeProject(project.provenance, project).id, project };
}

function sourceEntries(root: string): { entries: SourceEntry[]; chunks: MigrationChunkPlan[]; conflicts: string[] } {
  const entries: SourceEntry[] = [];
  const chunks: MigrationChunkPlan[] = [];
  const conflicts: string[] = [];
  for (const source of SOURCES) {
    const bytes = readBytes(root, source.file);
    const entry: SourceEntry = { path: source.file, category: source.category, present: bytes !== undefined, archivePath: archiveRelative(source.file), archiveOnly: false };
    if (bytes !== undefined) {
      entry.digest = digestBytes(bytes); entry.bytes = bytes.length;
      try { chunks.push(...splitLevelTwo(source.file, source.category, bytes)); } catch (error: any) { conflicts.push(error?.message ?? String(error)); }
    }
    entries.push(entry);
  }
  for (const file of ARCHIVE_ONLY) {
    const bytes = readBytes(root, file);
    entries.push({ path: file, present: bytes !== undefined, ...(bytes === undefined ? {} : { digest: digestBytes(bytes), bytes: bytes.length }), archivePath: archiveRelative(file), archiveOnly: true });
  }
  const seenTargets = new Map<string, MigrationChunkPlan>();
  for (const chunk of chunks) {
    const prior = seenTargets.get(chunk.target);
    if (prior) conflicts.push(`slug collision: ${chunk.sourceKey} collides with ${prior.sourceKey} at ${chunk.target}`);
    else seenTargets.set(chunk.target, chunk);
  }
  const { projectId } = projectIdentity();
  for (const chunk of chunks) chunk.chunkId = makeChunkId({ projectId, category: chunk.category, target: chunk.target }, { title: chunk.title, body: chunk.body });
  if (chunks.length === 0) {
    const body = "";
    chunks.push({ sourcePath: "(archive)", sourceKey: "migration#archive", sourceDigest: digestBytes(Buffer.from("")), category: "gaps", title: "Legacy flat archive", target: "legacy/import.md", body, sectionIndex: 0, chunkId: makeChunkId({ projectId, category: "gaps", target: "legacy/import.md" }, { title: "Legacy flat archive", body }) });
  }
  return { entries, chunks, conflicts };
}

function readManifest(root: string): MigrationManifest | undefined {
  const file = manifestPath(root);
  if (!existsSync(file)) return undefined;
  const raw = readJson(file);
  if (!raw || typeof raw !== "object" || (raw as any).schemaVersion !== 1 || (raw as any).kind !== "flat-project-migration") throw new Error("migration manifest is malformed");
  const manifest = raw as MigrationManifest;
  if (manifest.status !== "publishing" && manifest.status !== "published") throw new Error("migration manifest status is invalid");
  return manifest;
}

function publishedReport(root: string, manifest: MigrationManifest): MigrationReport {
  const conflicts: string[] = [];
  for (const source of manifest.sourceFiles) {
    if (source.path === "_summary.md") {
      if (source.present) {
        const archived = readBytes(root, source.archivePath);
        if (archived === undefined || digestBytes(archived) !== source.digest) conflicts.push(`archive digest mismatch: ${source.path}`);
      }
      continue;
    }
    const current = readBytes(root, source.path);
    if (source.present) {
      const archived = readBytes(root, source.archivePath);
      if (archived === undefined || digestBytes(archived) !== source.digest) conflicts.push(`archive digest mismatch: ${source.path}`);
      if (current !== undefined && digestBytes(current) !== source.digest) conflicts.push(`changed source after migration: ${source.path}`);
    } else if (current !== undefined) conflicts.push(`source appeared after migration: ${source.path}`);
  }
  if (manifest.status === "publishing") conflicts.push("publication requires explicit recovery");
  const chunks = manifest.chunks.map((chunk) => {
    let body = "";
    const source = manifest.sourceFiles.find((item) => item.path === chunk.sourcePath);
    if (source?.present && !source.archiveOnly) {
      const bytes = readBytes(root, source.archivePath);
      if (bytes !== undefined) body = splitLevelTwo(source.path, source.category!, bytes).find((item) => item.sourceKey === chunk.sourceKey)?.body ?? "";
    }
    return { ...chunk, body } as MigrationChunkPlan;
  });
  return { schemaVersion: 1, kind: "flat-project-migration-report", root, status: manifest.status === "publishing" ? "recovery-required" : conflicts.length ? "conflict" : "published", noWrite: true, idempotent: manifest.status === "published" && conflicts.length === 0, canPublish: false, projectId: manifest.projectId, sources: manifest.sourceFiles, chunks, conflicts, manifestPath: manifestPath(root), manifestStatus: manifest.status };
}

export function reportMigration(inputRoot: string): MigrationReport {
  const root = migrationRoot(inputRoot);
  const manifest = readManifest(root);
  if (manifest) return publishedReport(root, manifest);
  const conflicts: string[] = [];
  if (generatedCanonicalExists(root)) conflicts.push("canonical project artifacts already exist");
  const planned = sourceEntries(root);
  conflicts.push(...planned.conflicts);
  const { projectId } = projectIdentity();
  return { schemaVersion: 1, kind: "flat-project-migration-report", root, status: conflicts.length ? "conflict" : "ready", noWrite: true, idempotent: false, canPublish: conflicts.length === 0, projectId, sources: planned.entries, chunks: planned.chunks, conflicts };
}

function allFiles(root: string, skip: ReadonlySet<string> = new Set()): string[] {
  if (!existsSync(root)) return [];
  const result: string[] = [];
  for (const item of readdirSync(root, { withFileTypes: true })) {
    if (skip.has(item.name)) continue;
    const absolute = path.join(root, item.name);
    if (item.isDirectory()) result.push(...allFiles(absolute));
    else if (item.isFile()) result.push(absolute);
  }
  return result.sort();
}

function relative(root: string, file: string): string { return path.relative(root, file).replaceAll(path.sep, "/"); }
function invokeFault(fault: IoFault | undefined, stage: "mkdir" | "write" | "rename" | "lock", target: string): void { fault?.(stage, target); }
function writeBytes(file: string, bytes: Uint8Array, fault?: IoFault): void {
  invokeFault(fault, "mkdir", path.dirname(file));
  mkdirSync(path.dirname(file), { recursive: true });
  invokeFault(fault, "write", file);
  writeFileSync(file, bytes);
}
function moveFile(from: string, to: string, fault?: IoFault): void {
  invokeFault(fault, "mkdir", path.dirname(to));
  mkdirSync(path.dirname(to), { recursive: true });
  invokeFault(fault, "rename", to);
  renameSync(from, to);
}

function buildManifest(root: string, stagePath: string, report: MigrationReport, now: string): MigrationManifest {
  return {
    schemaVersion: 1, kind: "flat-project-migration", status: "publishing", projectId: report.projectId, root, stagePath,
    archivePath: LEGACY_ARCHIVE, createdAt: now,
    sourceFiles: report.sources.map((source) => ({ ...source })),
    chunks: report.chunks.map(({ body: _body, ...chunk }) => chunk),
    canonicalFiles: [],
  };
}

function stageArchive(stage: string, root: string, report: MigrationReport, fault?: IoFault): void {
  invokeFault(fault, "mkdir", path.join(stage, LEGACY_ARCHIVE));
  mkdirSync(path.join(stage, LEGACY_ARCHIVE), { recursive: true });
  for (const source of report.sources) {
    if (!source.present) continue;
    const bytes = readBytes(root, source.path)!;
    writeBytes(path.join(stage, source.archivePath), bytes, fault);
  }
}

function removeLegacySources(root: string, report: MigrationReport): void {
  for (const source of report.sources) {
    if (!source.present || source.archiveOnly) continue;
    const file = path.join(root, source.path);
    if (existsSync(file)) unlinkSync(file);
  }
  const summary = path.join(root, "_summary.md");
  if (existsSync(summary)) unlinkSync(summary);
}

function moveCanonical(stage: string, root: string, manifest: MigrationManifest, fault?: IoFault): void {
  for (const file of allFiles(stage, new Set([LEGACY_ARCHIVE]))) {
    const rel = relative(stage, file);
    if (rel === MIGRATION_MANIFEST) continue;
    const target = path.join(root, rel);
    moveFile(file, target, fault);
    manifest.canonicalFiles.push(rel);
  }
}

function stageCanonical(stage: string, report: MigrationReport, options: MigrationOptions): void {
  const identity = projectIdentity();
  const store = new ProjectStore(stage, { ...options, now: options.now });
  for (const [index, chunk] of report.chunks.entries()) {
    store.publish({
      ...(index === 0 ? { project: identity.project } : {}),
      candidate: { category: chunk.category, title: chunk.title, target: chunk.target, confidence: "unknown", body: chunk.body, sourceHead: "UNKNOWN" },
    }, { accepted: true, rationale: "explicit flat-memory migration publication" });
  }
}

function finishPublication(root: string, stage: string, manifest: MigrationManifest, report: MigrationReport, options: MigrationOptions): void {
  const archive = path.join(root, LEGACY_ARCHIVE);
  if (!existsSync(archive)) moveFile(path.join(stage, LEGACY_ARCHIVE), archive, options.fault);
  removeLegacySources(root, report);
  moveCanonical(stage, root, manifest, options.fault);
  manifest.canonicalFiles = [...new Set(manifest.canonicalFiles)].sort();
  manifest.status = "published";
  atomicWriteJson(manifestPath(root), manifest, options);
  rmSync(stage, { recursive: true, force: true });
}

export function publishMigration(inputRoot: string, suppliedReport?: MigrationReport, options: MigrationOptions = {}): MigrationManifest {
  const root = migrationRoot(inputRoot);
  const existing = readManifest(root);
  if (existing?.status === "published") {
    const report = publishedReport(root, existing);
    if (report.conflicts.length) throw new Error(`MIGRATION_CONFLICT: ${report.conflicts.join("; ")}`);
    return existing;
  }
  if (existing?.status === "publishing") throw new Error("MIGRATION_RECOVERY_REQUIRED: use recoverMigration or rollbackMigration");
  const report = reportMigration(root);
  if (suppliedReport && (suppliedReport.root !== report.root || suppliedReport.status !== "ready" || JSON.stringify(suppliedReport.chunks.map((chunk) => chunk.sourceDigest)) !== JSON.stringify(report.chunks.map((chunk) => chunk.sourceDigest)))) throw new Error("MIGRATION_CONFLICT: report is stale");
  if (!report.canPublish) throw new Error(`MIGRATION_CONFLICT: ${report.conflicts.join("; ")}`);
  const stage = mkdtempSync(path.join(path.dirname(root), ".flat-memory-migration-"));
  const manifest = buildManifest(root, stage, report, options.now?.() ?? new Date().toISOString());
  try {
    stageArchive(stage, root, report, options.fault);
    stageCanonical(stage, report, options);
    manifest.canonicalFiles = allFiles(stage, new Set([LEGACY_ARCHIVE])).map((file) => relative(stage, file)).filter((file) => file !== MIGRATION_MANIFEST).sort();
    atomicWriteJson(manifestPath(root), manifest, options);
    finishPublication(root, stage, manifest, report, options);
    return manifest;
  } catch (error) {
    if (readManifest(root)?.status !== "publishing") rmSync(stage, { recursive: true, force: true });
    throw error;
  }
}

export function recoverMigration(inputRoot: string, options: MigrationOptions = {}): MigrationManifest {
  const root = migrationRoot(inputRoot);
  const manifest = readManifest(root);
  if (!manifest || manifest.status !== "publishing") throw new Error("no recoverable migration is present");
  const report: MigrationReport = { schemaVersion: 1, kind: "flat-project-migration-report", root, status: "ready", noWrite: true, idempotent: false, canPublish: true, projectId: manifest.projectId, sources: manifest.sourceFiles, chunks: manifest.chunks.map((chunk) => ({ ...chunk, body: "", chunkId: chunk.chunkId })), conflicts: [] };
  const stage = manifest.stagePath;
  if (!existsSync(path.join(root, LEGACY_ARCHIVE)) && existsSync(path.join(stage, LEGACY_ARCHIVE))) moveFile(path.join(stage, LEGACY_ARCHIVE), path.join(root, LEGACY_ARCHIVE), options.fault);
  removeLegacySources(root, report);
  if (existsSync(stage)) moveCanonical(stage, root, manifest, options.fault);
  manifest.canonicalFiles = [...new Set(manifest.canonicalFiles)].sort();
  manifest.status = "published";
  atomicWriteJson(manifestPath(root), manifest, options);
  rmSync(stage, { recursive: true, force: true });
  return manifest;
}

export function rollbackMigration(inputRoot: string, options: MigrationOptions = {}): void {
  const root = migrationRoot(inputRoot);
  const manifest = readManifest(root);
  if (!manifest) throw new Error("no migration manifest is present");
  const stage = manifest.stagePath;
  if (!existsSync(path.join(root, LEGACY_ARCHIVE)) && existsSync(path.join(stage, LEGACY_ARCHIVE))) moveFile(path.join(stage, LEGACY_ARCHIVE), path.join(root, LEGACY_ARCHIVE), options.fault);
  const archive = path.join(root, LEGACY_ARCHIVE);
  for (const file of manifest.canonicalFiles) {
    const target = path.join(root, file);
    if (existsSync(target)) rmSync(target, { force: true, recursive: true });
  }
  for (const directory of GENERATED_ROOT_DIRS) {
    const target = path.join(root, directory);
    if (existsSync(target)) rmSync(target, { recursive: true, force: true });
  }
  for (const source of manifest.sourceFiles) {
    if (!source.present) continue;
    const archived = path.join(root, source.archivePath);
    if (!existsSync(archived)) throw new Error(`rollback archive is missing: ${source.path}`);
    const bytes = readFileSync(archived);
    if (digestBytes(bytes) !== source.digest) throw new Error(`rollback archive digest mismatch: ${source.path}`);
    writeBytes(path.join(root, source.path), bytes, options.fault);
  }
  rmSync(archive, { recursive: true, force: true });
  rmSync(manifestPath(root), { force: true });
  if (existsSync(stage)) rmSync(stage, { recursive: true, force: true });
}

export function migrateFlatProject(root: string, options: MigrationOptions & { publish?: boolean } = {}): MigrationReport | MigrationManifest {
  const report = reportMigration(root);
  return options.publish ? publishMigration(root, report, options) : report;
}

export const migrateProject = migrateFlatProject;
export const inspectMigration = reportMigration;
