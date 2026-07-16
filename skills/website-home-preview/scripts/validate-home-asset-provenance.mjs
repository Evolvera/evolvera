#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const usage = "Usage: node validate-home-asset-provenance.mjs <index.html>";
const filePath = process.argv[2];

if (!filePath || process.argv.length !== 3) {
  console.error(usage);
  process.exit(2);
}

let html;
try {
  html = readFileSync(filePath, "utf8");
} catch (error) {
  console.error(`Asset provenance validation failed: cannot read ${filePath}: ${error.message}`);
  process.exit(2);
}

function decodeAttributeValue(rawValue) {
  let invalidEntity = null;
  const decoded = rawValue
    .replace(/&#x([0-9a-f]+);?/gi, (entity, hex) => {
      const codePoint = Number.parseInt(hex, 16);
      if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
        invalidEntity = entity;
        return entity;
      }
      return String.fromCodePoint(codePoint);
    })
    .replace(/&#([0-9]+);?/g, (entity, decimal) => {
      const codePoint = Number.parseInt(decimal, 10);
      if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
        invalidEntity = entity;
        return entity;
      }
      return String.fromCodePoint(codePoint);
    })
    .replace(/&(amp|quot|apos|lt|gt);/gi, (_entity, name) => ({
      amp: "&",
      quot: '"',
      apos: "'",
      lt: "<",
      gt: ">",
    })[name.toLowerCase()]);

  const unknownEntity = decoded.match(/&(?:#[xX]?[0-9a-fA-F]+;?|[a-zA-Z][a-zA-Z0-9]+;)/);
  return { decoded, invalidEntity: invalidEntity ?? unknownEntity?.[0] ?? null };
}

function normalizeEncodedColon(text) {
  return text
    .replace(/\\(?:0{0,4}3a)\s?/gi, ":")
    .replace(/\\x3a|\\u0{0,2}3a/gi, ":");
}

function assetLedgerSection(plan) {
  const heading = /^##[ \t]+(?:\d+(?:\.\d+)*[ \t]+)?Asset Provenance Ledger[ \t]*$/im.exec(plan);
  if (!heading) return null;
  const rest = plan.slice(heading.index + heading[0].length);
  const nextHeading = rest.search(/^##[ \t]+/m);
  return nextHeading >= 0 ? rest.slice(0, nextHeading) : rest;
}

const findings = [];
const decodedHtml = normalizeEncodedColon(decodeAttributeValue(html).decoded);
if (/data\s*:\s*image\/svg\+xml/i.test(decodedHtml)) {
  findings.push("data:image/svg+xml is not allowed, including HTML-entity/CSS/JS-escape-obfuscated forms; use a source-backed inline SVG or HTML/CSS instead.");
}

const svgTags = html.match(/<svg\b[^>]*>/gi) ?? [];
const planPath = join(dirname(filePath), "HOME_PLAN.md");
let ledgerSources = new Set();
if (svgTags.length > 0) {
  if (!existsSync(planPath)) {
    findings.push(`HOME_PLAN.md is required beside ${filePath} when inline SVG assets are present.`);
  } else {
    const plan = readFileSync(planPath, "utf8");
    const ledger = assetLedgerSection(plan);
    if (ledger === null) {
      findings.push(`${planPath} has no '## Asset Provenance Ledger' section.`);
    } else {
      const ledgerPattern = /\bdata-asset-source\s*:\s*(?:`([^`]+)`|"([^"]+)"|'([^']+)'|([^\s]+))/gi;
      ledgerSources = new Set(
        [...ledger.matchAll(ledgerPattern)]
          .map((match) => match[1] ?? match[2] ?? match[3] ?? match[4] ?? "")
          .map((source) => decodeAttributeValue(source).decoded.trim())
          .filter(Boolean),
      );
      if (ledgerSources.size === 0) {
        findings.push(`${planPath} contains no machine-readable Asset Provenance Ledger entries. Use '- data-asset-source: \`<exact source>\`'.`);
      }
    }
  }
}

svgTags.forEach((tag, index) => {
  const sourceMatch = tag.match(/\bdata-asset-source\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
  const rawSource = sourceMatch ? (sourceMatch[1] ?? sourceMatch[2] ?? sourceMatch[3] ?? "") : null;
  const label = `inline SVG #${index + 1}`;

  if (rawSource === null) {
    findings.push(`${label}: missing data-asset-source. Use an exact https:// canonical source or provided:<path-or-id>.`);
    return;
  }

  const { decoded: source, invalidEntity } = decodeAttributeValue(rawSource);
  if (invalidEntity) {
    findings.push(`${label}: data-asset-source contains unsupported or invalid HTML character reference "${invalidEntity}".`);
    return;
  }

  if (!source.trim()) {
    findings.push(`${label}: data-asset-source is empty. Use an exact https:// canonical source or provided:<path-or-id>.`);
    return;
  }

  let sourceShapeValid = false;
  if (source.startsWith("provided:")) {
    const providedId = source.slice("provided:".length).trim();
    const syntheticLabels = /^(?:generated|custom|placeholder|inline|ai)(?:[-_:.'"\s]|$)/i;
    if (!providedId || syntheticLabels.test(providedId)) {
      findings.push(`${label}: invalid provided asset identifier "${providedId}". Use the exact user/repository path or identifier, not a synthetic generated/custom/placeholder/inline/AI label.`);
      return;
    }
    sourceShapeValid = true;
  } else {
    try {
      const url = new URL(source);
      sourceShapeValid = /^https:\/\//i.test(source) && url.protocol === "https:";
    } catch {
      sourceShapeValid = false;
    }
  }

  if (!sourceShapeValid) {
    findings.push(`${label}: invalid data-asset-source "${source}". Allowed values are https:// canonical sources or provided:<non-empty path-or-id>.`);
    return;
  }

  if (!ledgerSources.has(source)) {
    findings.push(`${label}: data-asset-source "${source}" is not an exact entry in ${planPath}'s Asset Provenance Ledger.`);
  }
});

if (findings.length > 0) {
  console.error(`FAIL: ${findings.length} asset provenance finding(s) in ${filePath}`);
  findings.forEach((finding) => console.error(`- ${finding}`));
  process.exit(1);
}

console.log(`PASS: ${svgTags.length} inline SVG asset(s) have valid provenance in ${filePath}`);
