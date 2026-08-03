import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assertSafeRelativePath, sha256Hex } from "../common/safety.ts";
import { isProjectId } from "./schema.ts";

export type IoFault = (stage: "mkdir" | "write" | "rename" | "lock", target: string) => void;
export type ProjectIoOptions = { fault?: IoFault; lockRetries?: number; lockRetryMs?: number; staleLockMs?: number };

export function resolveProjectRoot(memoryRoot: string, projectId?: string): string {
  if (typeof memoryRoot !== "string" || !path.isAbsolute(memoryRoot)) throw new Error("memory root must be absolute");
  if (projectId === undefined) return path.resolve(memoryRoot);
  if (!isProjectId(projectId)) throw new Error("project id is invalid for a project path");
  return path.join(path.resolve(memoryRoot), projectId);
}
export function canonicalPaths(root: string): { project: string; evidence: string; chunks: string; index: string; summary: string; lock: string } {
  if (!path.isAbsolute(root)) throw new Error("project root must be absolute");
  return { project: path.join(root, "_project.md"), evidence: path.join(root, "evidence.json"), chunks: path.join(root, "chunks"), index: path.join(root, "index.json"), summary: path.join(root, "_summary.md"), lock: path.join(root, ".publish.lock") };
}
export function digestText(value: string): string { return sha256Hex(value); }
export function readUtf8(file: string): string | undefined { try { return readFileSync(file, "utf8"); } catch (error: any) { if (error?.code === "ENOENT") return undefined; throw error; } }
export function readJson(file: string): unknown | undefined { const text = readUtf8(file); return text === undefined ? undefined : JSON.parse(text); }
export function ensureDirectory(directory: string, fault?: IoFault): void { fault?.("mkdir", directory); mkdirSync(directory, { recursive: true }); }

export function atomicWrite(file: string, data: string, options: ProjectIoOptions = {}): void {
  ensureDirectory(path.dirname(file), options.fault);
  const temporary = `${file}.tmp.${process.pid}.${randomBytes(6).toString("hex")}`;
  try {
    options.fault?.("write", file);
    writeFileSync(temporary, data, { encoding: "utf8", flag: "wx" });
    options.fault?.("rename", file);
    renameSync(temporary, file);
  } catch (error) {
    try { unlinkSync(temporary); } catch {}
    throw error;
  }
}
export function atomicWriteJson(file: string, value: unknown, options: ProjectIoOptions = {}): void { atomicWrite(file, `${JSON.stringify(value, null, 2)}\n`, options); }

export function withLock<T>(root: string, action: () => T, options: ProjectIoOptions = {}): T {
  const lock = canonicalPaths(root).lock;
  ensureDirectory(root, options.fault);
  const retries = options.lockRetries ?? 80;
  const retryMs = options.lockRetryMs ?? 10;
  const staleMs = options.staleLockMs ?? 5_000;
  let acquired = false;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      options.fault?.("lock", lock);
      mkdirSync(lock);
      acquired = true;
      break;
    } catch (error: any) {
      if (error?.code !== "EEXIST") throw error;
      try {
        if (Date.now() - statSync(lock).mtimeMs > staleMs) rmSync(lock, { recursive: true, force: true });
      } catch {}
      const until = Date.now() + retryMs;
      while (Date.now() < until) {}
    }
  }
  if (!acquired) throw new Error("project publication lock is busy");
  try { return action(); } finally { rmSync(lock, { recursive: true, force: true }); }
}

export const atomicWriteFile = atomicWrite;
export const acquireProjectLock = withLock;

export function assertRootRelative(file: string, root: string, label = "path"): void {
  const relative = path.relative(root, file).replaceAll(path.sep, "/");
  assertSafeRelativePath(relative, label);
}
export function cleanupTemporaryFiles(root: string): void {
  if (!existsSync(root)) return;
  // Only remove files with this module's process/random temporary suffix.
  // Canonical files, projections, and locks are never cleanup targets.
}
