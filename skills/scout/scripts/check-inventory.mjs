import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const nonblank = (value) => typeof value === "string" && value.trim().length > 0;

export function validateInventory(expected, receipt) {
  const errors = [];
  const missing = new Set();
  const duplicates = new Set();
  const unexpected = new Set();
  const unresolved = new Set();
  let shapeValid = true;
  const expectedSet = new Set();

  if (!Array.isArray(expected)) {
    errors.push("expected must be an array");
    shapeValid = false;
  } else {
    const seen = new Set();
    for (const id of expected) {
      if (!nonblank(id) || id !== id.trim()) {
        errors.push("expected IDs must be nonblank strings without surrounding whitespace");
        shapeValid = false;
      } else if (seen.has(id)) {
        errors.push(`duplicate expected ID: ${id}`);
        shapeValid = false;
      } else seen.add(id);
    }
    for (const id of seen) { missing.add(id); expectedSet.add(id); }
  }

  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) {
    errors.push("receipt must be an object");
    shapeValid = false;
  } else {
    if (receipt.status !== "COMPLETE" && receipt.status !== "PARTIAL") {
      errors.push("status must be COMPLETE or PARTIAL");
      shapeValid = false;
    }
    if (!Array.isArray(receipt.items)) {
      errors.push("items must be an array");
      shapeValid = false;
    } else {
      const seen = new Set();
      for (const [index, item] of receipt.items.entries()) {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          errors.push("each item must be an object"); shapeValid = false; continue;
        }
        const id = item.id;
        const validId = nonblank(id) && id === id.trim();
        if (!validId) { errors.push("item IDs must be nonblank strings without surrounding whitespace"); shapeValid = false; }
        else {
          if (seen.has(id)) duplicates.add(id);
          seen.add(id);
          if (Array.isArray(expected) && !expectedSet.has(id)) unexpected.add(id);
          else missing.delete(id);
        }
        const label = validId ? id : `item[${index}]`;
        const validClass = nonblank(item.classification);
        if (!validClass) { errors.push(`${label}: classification must be a nonblank string`); shapeValid = false; }
        if (!Array.isArray(item.evidence) || Array.from(item.evidence).some((e) => !nonblank(e))) {
          errors.push(`${label}: evidence must be an array of nonblank strings`); shapeValid = false;
        }
        const validGap = item.gap === null || nonblank(item.gap);
        if (!validGap) { errors.push(`${label}: gap must be null or a nonblank string`); shapeValid = false; }
        const unknown = validClass && item.classification.trim().toUpperCase() === "UNKNOWN";
        if (validId && (unknown || (validGap && item.gap !== null))) unresolved.add(id);
        if (unknown && !nonblank(item.gap)) { errors.push(`${label}: UNKNOWN item requires a gap`); shapeValid = false; }
        if (!unknown && validClass && Array.isArray(item.evidence) && item.evidence.length === 0) {
          errors.push(`${label}: resolved item requires evidence`); shapeValid = false;
        }
      }
    }
    if (receipt.status === "PARTIAL") errors.push("PARTIAL receipt cannot be accepted");
    if (receipt.status === "COMPLETE" && unresolved.size) errors.push("COMPLETE receipt contains unresolved items");
  }
  if (duplicates.size) errors.push(`duplicate reported IDs: ${[...duplicates].join(", ")}`);
  if (unexpected.size) errors.push(`unexpected IDs: ${[...unexpected].join(", ")}`);
  if (missing.size) errors.push(`missing IDs: ${[...missing].join(", ")}`);
  return {
    ok: shapeValid && errors.length === 0 && receipt?.status === "COMPLETE",
    errors,
    missing: [...missing],
    duplicates: [...duplicates],
    unexpected: [...unexpected],
    unresolved: [...unresolved],
  };
}

async function main(args) {
  if (args.length !== 2) return { ok: false, errors: ["usage: check-inventory.mjs <expected.json> <receipt.json>"], missing: [], duplicates: [], unexpected: [], unresolved: [] };
  try {
    const [expectedText, receiptText] = await Promise.all(args.map((file) => readFile(file, "utf8")));
    try { return validateInventory(JSON.parse(expectedText), JSON.parse(receiptText)); }
    catch { return { ok: false, errors: ["invalid JSON"], missing: [], duplicates: [], unexpected: [], unresolved: [] }; }
  } catch {
    return { ok: false, errors: ["unable to read input files"], missing: [], duplicates: [], unexpected: [], unresolved: [] };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await main(process.argv.slice(2));
  console.log(JSON.stringify(result));
  process.exitCode = result.ok ? 0 : 1;
}
