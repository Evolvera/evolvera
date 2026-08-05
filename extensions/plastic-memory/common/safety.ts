import { createHash } from "node:crypto";
import path from "node:path";

const SECRET_PATTERNS = [
  /(?:api[_-]?key|(?:access[_-]?)?token|auth(?:orization)?|password|passwd|secret|private[_-]?key)\s*[:=]\s*[^\s,;]+/giu,
  /bearer\s+[a-z0-9._~+/=-]+/giu,
  /-----BEGIN [A-Z ]+-----[\s\S]*?-----END [A-Z ]+-----/gu,
];
const PII_PATTERNS = [
  /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/gu,
  // Phone-like digit runs only: the boundaries reject any run touching word/hex characters or a
  // hyphen (UUIDs, digests, ids), the lookahead rejects ISO-8601 dates, and the 20-char ceiling
  // (E.164 tops out at 15 digits) rejects long all-digit machine tokens.
  /(?<![\w-])(?!\d{4}-\d{2}-\d{2})(?:\+?\d[\d ()-]{7,18}\d)(?![\w-])/gu,
];

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number") {
    return JSON.stringify(value);
  }
  if (typeof value === "bigint") return JSON.stringify(`${value}n`);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(String(value));
}

export function sha256Hex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function digestParts(...parts: unknown[]): string {
  return sha256Hex(canonicalJson(parts));
}

export function hasSensitiveText(value: string): boolean {
  return [...SECRET_PATTERNS, ...PII_PATTERNS].some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(value);
  });
}

export function scrubSensitiveText(value: string): string {
  let scrubbed = value;
  for (const pattern of SECRET_PATTERNS) scrubbed = scrubbed.replace(pattern, "[REDACTED_SECRET]");
  for (const pattern of PII_PATTERNS) scrubbed = scrubbed.replace(pattern, "[REDACTED_PII]");
  return scrubbed;
}

export function assertNoSensitiveText(value: string, label = "value"): void {
  if (hasSensitiveText(value)) throw new Error(`${label} contains secret or PII material`);
}

export function assertBoundedString(value: unknown, maximum: number, label = "value"): asserts value is string {
  if (typeof value !== "string" || value.length > maximum) throw new Error(`${label} exceeds its safety bound`);
}

export function assertSafeRelativePath(value: unknown, label = "path"): asserts value is string {
  if (typeof value !== "string" || !value || value.includes("\0") || path.isAbsolute(value) || value.includes("\\")) {
    throw new Error(`${label} must be a safe repository-relative path`);
  }
  const segments = value.split("/");
  if (segments.some((segment) => segment === ".." || segment === "" && segments.length > 1)) {
    throw new Error(`${label} must not traverse or use an empty path segment`);
  }
}

export function assertSafeContent(value: unknown, maximum: number, label = "content"): asserts value is string {
  assertBoundedString(value, maximum, label);
  assertNoSensitiveText(value, label);
}
