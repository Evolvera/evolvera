import { digestParts } from "./safety.ts";

export const LEGACY_MEMORY_ID_PATTERN = /^[a-f0-9]{12}$/;
export const SESSION_DIGEST_PATTERN = /^[a-f0-9]{24}$/;
export const RECORD_DIGEST_PATTERN = /^[a-f0-9]{24}$/;
export const CONTENT_DIGEST_PATTERN = /^[a-f0-9]{32}$/;
export const PUBLIC_ID_PATTERN = /^pm:(?:o|r|q):[a-f0-9]{24}:[a-f0-9]{24}$|^pm:(?:p|c):[a-f0-9]{32}$/;
export const INTERNAL_ID_PATTERN = /^pm:(?:cy|at):[a-f0-9]{24}:[a-f0-9]{24}(?::[0-9]+)?$/;

function requireDigest(value: string, pattern: RegExp, label: string): string {
  if (typeof value !== "string" || !pattern.test(value)) throw new Error(`${label} must be lowercase hexadecimal`);
  return value;
}

function digest24(sessionId: unknown, provenance: unknown): string {
  return digestParts({ sessionId, provenance }).slice(0, 24);
}

function digestRecord(sessionId: unknown, provenance: unknown, record: unknown): string {
  return digestParts({ sessionId, provenance, record }).slice(0, 24);
}

function digest32(provenance: unknown, content: unknown): string {
  return digestParts({ provenance, content }).slice(0, 32);
}

export function sessionDigest(sessionId: unknown, provenance: unknown): string {
  return digest24(sessionId, provenance);
}

export function recordDigest(sessionId: unknown, provenance: unknown, record: unknown): string {
  return digestRecord(sessionId, provenance, record);
}

export function makeSessionRecordId(kind: "o" | "r" | "q", session: string, record: string): string {
  requireDigest(session, SESSION_DIGEST_PATTERN, "session digest");
  requireDigest(record, RECORD_DIGEST_PATTERN, "record digest");
  return `pm:${kind}:${session}:${record}`;
}

export function makeObservationId(session: string, record: string): string {
  return makeSessionRecordId("o", session, record);
}

export function makeReflectionId(session: string, record: string): string {
  return makeSessionRecordId("r", session, record);
}

export function makeQueryId(session: string, record: string): string {
  return makeSessionRecordId("q", session, record);
}

export function makeProjectId(provenance: unknown, content: unknown): string {
  return `pm:p:${digest32(provenance, content)}`;
}

export function makeChunkId(provenance: unknown, content: unknown): string {
  return `pm:c:${digest32(provenance, content)}`;
}

export function makeCycleId(session: string, snapshot: string): string {
  requireDigest(session, SESSION_DIGEST_PATTERN, "session digest");
  requireDigest(snapshot, RECORD_DIGEST_PATTERN, "snapshot digest");
  return `pm:cy:${session}:${snapshot}`;
}

export function makeAttemptId(session: string, snapshot: string, attempt = 0): string {
  requireDigest(session, SESSION_DIGEST_PATTERN, "session digest");
  requireDigest(snapshot, RECORD_DIGEST_PATTERN, "snapshot digest");
  if (!Number.isSafeInteger(attempt) || attempt < 0) throw new Error("attempt must be a nonnegative integer");
  return `pm:at:${session}:${snapshot}:${attempt}`;
}

export function parseLegacyMemoryId(value: unknown): string | undefined {
  return typeof value === "string" && LEGACY_MEMORY_ID_PATTERN.test(value) ? value : undefined;
}

export function isPublicId(value: unknown): value is string {
  return typeof value === "string" && PUBLIC_ID_PATTERN.test(value);
}

export function isInternalId(value: unknown): value is string {
  return typeof value === "string" && INTERNAL_ID_PATTERN.test(value);
}

export function parseId(value: unknown): { namespace: "public" | "internal" | "legacy"; kind?: string; value: string } | undefined {
  if (typeof value !== "string") return undefined;
  if (LEGACY_MEMORY_ID_PATTERN.test(value)) return { namespace: "legacy", value };
  if (isPublicId(value)) return { namespace: "public", kind: value.slice(3, 4), value };
  if (isInternalId(value)) return { namespace: "internal", kind: value.slice(3, 5), value };
  return undefined;
}
