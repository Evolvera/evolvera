#!/usr/bin/env node

import { readFileSync } from "node:fs";

if (process.argv.length !== 3) {
  console.error("Usage: node validate-audit-report.mjs <code-audit-report.html>");
  process.exit(2);
}
const reportPath = process.argv[2];
const failures = [];
let html = "";
try { html = readFileSync(reportPath, "utf8"); }
catch (error) { console.error(`FAIL: cannot read ${reportPath}: ${error.message}`); process.exit(2); }
const requireMatch = (condition, message) => { if (!condition) failures.push(message); };
const esc = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const sectionIds = [
  "run-integrity", "executive-summary", "system-objective", "audit-scope", "perspectives",
  "proven-defects", "unverified-candidates", "disproven-candidates", "evidence-ledger",
  "coverage-gaps", "run-manifest", "limitations",
];
requireMatch(/<!doctype html>/i.test(html), "missing HTML doctype");
requireMatch(/<html\b[^>]*\blang=["'][^"']+["']/i.test(html), "missing html lang");
requireMatch(/<meta\b[^>]*charset=["']?utf-8/i.test(html), "missing UTF-8 meta");
requireMatch(/<meta\b[^>]*name=["']viewport["']/i.test(html), "missing viewport meta");
requireMatch(/<meta\b[^>]*name=["']description["']/i.test(html), "missing description meta");
requireMatch(/<title>[^<]+<\/title>/i.test(html), "missing non-empty title");
requireMatch(/<main\b/i.test(html), "missing main landmark");
requireMatch(/<nav\b[^>]*aria-label=/i.test(html), "missing labelled navigation");
let previous = -1;
for (const id of sectionIds) {
  const match = new RegExp(`<section\\b[^>]*\\bid=["']${esc(id)}["']`, "i").exec(html);
  requireMatch(Boolean(match), `missing required section #${id}`);
  if (match) {
    requireMatch(match.index > previous, `section #${id} is out of required order`);
    previous = match.index;
  }
}
requireMatch(!/<script\b(?![^>]*\btype=["']application\/json["'])/i.test(html), "executable script is forbidden");
requireMatch(!/<script\b[^>]*\bsrc\s*=/i.test(html), "external script source is forbidden");
requireMatch(!/<link\b/i.test(html), "linked resources are forbidden");
const cssSurfaces = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((match) => match[1]).concat([...html.matchAll(/\bstyle=["']([^"']*)["']/gi)].map((match) => match[1]));
requireMatch(cssSurfaces.every((css) => !/@import\b|url\s*\(/i.test(css)), "CSS imports and URL resources are forbidden");
requireMatch(!/<(?:img|audio|video|source|iframe|object|embed)\b/i.test(html), "asset-bearing HTML elements are forbidden in a self-contained report");
requireMatch(!/<a\b[^>]*\bhref\s*=\s*["'](?!#)[^"']+["']/i.test(html), "non-fragment links are forbidden");
requireMatch(!/\{\{[^}]+\}\}|\[\[[^\]]+\]\]|__[A-Z][A-Z0-9_]+__|REPLACE_ME|TEMPLATE_PLACEHOLDER/i.test(html), "unresolved template placeholder found");

const jsonScripts = [...html.matchAll(/<script\b[^>]*\btype=["']application\/json["'][^>]*\bid=["']audit-data["'][^>]*>([\s\S]*?)<\/script>/gi)];
requireMatch(jsonScripts.length === 1, "expected exactly one application/json#audit-data block");
let data = null;
if (jsonScripts.length === 1) {
  try { data = JSON.parse(jsonScripts[0][1]); } catch (error) { failures.push(`audit-data is invalid JSON: ${error.message}`); }
}
const nonEmpty = (value) => typeof value === "string" && value.trim().length > 0;
const arrays = ["perspectives", "defects", "unverifiedCandidates", "disprovenCandidates", "evidence", "limitations"];
if (data) {
  requireMatch(nonEmpty(data.schemaVersion), "audit-data.schemaVersion is required");
  requireMatch(data.audit && typeof data.audit === "object", "audit-data.audit is required");
  for (const key of ["runId", "target", "targetHead", "sourceSha256", "objective", "mode", "status", "sourceIntegrity"]) {
    requireMatch(nonEmpty(data.audit?.[key]), `audit.${key} is required`);
  }
  requireMatch(["focused", "deep", "maximum"].includes(data.audit?.mode), "audit.mode must be focused, deep, or maximum");
  requireMatch(/^[a-f0-9]{64}$/i.test(data.audit?.sourceSha256 ?? ""), "audit.sourceSha256 must be a SHA-256 hex digest");
  requireMatch(data.summary && typeof data.summary === "object", "audit-data.summary is required");
  for (const key of ["proven", "unverified", "disproven", "evidence", "perspectives"]) requireMatch(Number.isInteger(data.summary?.[key]) && data.summary[key] >= 0, `summary.${key} must be a non-negative integer`);
  for (const key of arrays) requireMatch(Array.isArray(data[key]), `${key} must be an array`);
  requireMatch(data.limitations?.length > 0, "limitations must not be empty");
  requireMatch(data.perspectives?.every((item) => nonEmpty(item.id) && nonEmpty(item.name) && nonEmpty(item.rationale) && nonEmpty(item.status)), "each perspective needs id, name, rationale, and status");
  requireMatch(data.evidence?.every((item) => /^EVD-[A-Z0-9-]+$/.test(item.id ?? "") && nonEmpty(item.kind) && nonEmpty(item.location) && /^[a-f0-9]{64}$/i.test(item.sha256 ?? "")), "each evidence entry needs EVD-* id, kind, location, and SHA-256 hex digest");
  requireMatch(new Set((data.evidence ?? []).map((item) => item.id)).size === (data.evidence ?? []).length, "EVD-* evidence IDs must be unique");

  const groups = [data.defects ?? [], data.unverifiedCandidates ?? [], data.disprovenCandidates ?? []];
  const expectedClasses = ["PROVEN", "UNVERIFIED", "DISPROVEN"];
  const ids = [];
  const allowedSeverity = new Set(["CRITICAL", "HIGH", "MEDIUM", "LOW"]);
  const allowedConfidence = new Set(["HIGH", "MEDIUM", "LOW"]);
  groups.forEach((group, groupIndex) => group.forEach((finding) => {
    ids.push(finding.id);
    requireMatch(/^AUD-[A-Z0-9-]+$/.test(finding.id ?? ""), `finding has invalid AUD-* id: ${finding.id ?? "<missing>"}`);
    requireMatch(finding.classification === expectedClasses[groupIndex], `${finding.id ?? "finding"} must be ${expectedClasses[groupIndex]}`);
    requireMatch(allowedSeverity.has(finding.severity), `${finding.id ?? "finding"} has invalid severity`);
    requireMatch(allowedConfidence.has(finding.confidence), `${finding.id ?? "finding"} has invalid confidence`);
    for (const key of ["title", "location", "contract", "reachability", "proof", "expected", "observed", "impact", "counterevidence", "smallestFix"]) {
      requireMatch(nonEmpty(finding[key]), `${finding.id ?? "finding"}.${key} is required`);
    }
    requireMatch(Array.isArray(finding.evidenceRefs) && finding.evidenceRefs.length > 0, `${finding.id ?? "finding"}.evidenceRefs is required`);
    for (const ref of finding.evidenceRefs ?? []) requireMatch(data.evidence?.some((item) => item.id === ref), `${finding.id ?? "finding"} references unknown evidence ${ref}`);
    requireMatch(new RegExp(`\\bid=["']${esc(finding.id ?? "")}["']`, "i").test(html), `${finding.id ?? "finding"} does not appear as an HTML id`);
  }));
  requireMatch(new Set(ids).size === ids.length, "AUD-* finding IDs must be unique");
  requireMatch((data.defects ?? []).every((item) => item.classification === "PROVEN"), "only PROVEN findings may appear in defects");

  const counts = {
    proven: data.defects?.length ?? 0,
    unverified: data.unverifiedCandidates?.length ?? 0,
    disproven: data.disprovenCandidates?.length ?? 0,
    evidence: data.evidence?.length ?? 0,
    perspectives: data.perspectives?.length ?? 0,
  };
  for (const [key, value] of Object.entries(counts)) {
    requireMatch(data.summary?.[key] === value, `summary.${key} does not match array length`);
    const attr = new RegExp(`data-count=["']${key}["'][^>]*data-value=["']${value}["']|data-value=["']${value}["'][^>]*data-count=["']${key}["']`, "i");
    requireMatch(attr.test(html), `visible data-count for ${key}=${value} is missing`);
  }
  const integrityFailure = data.audit?.sourceIntegrity === "INTEGRITY_FAILURE";
  if (integrityFailure) {
    requireMatch(!["COMPLETE", "PASS"].includes(data.audit.status), "integrity failure cannot have COMPLETE or PASS status");
    requireMatch(!/data-integrity=["']PASS["']/i.test(html), "integrity failure cannot display PASS integrity");
  }
  if (data.audit?.status === "COMPLETE") requireMatch(data.audit.sourceIntegrity === "PASS", "COMPLETE requires sourceIntegrity PASS");
}

if (failures.length) {
  console.error(`FAIL: ${failures.length} report validation error(s) in ${reportPath}`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`PASS: valid code-audit report ${reportPath}`);
