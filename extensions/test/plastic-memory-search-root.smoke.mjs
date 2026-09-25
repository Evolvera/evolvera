import { loadJiti } from "./lib/pi-sdk.mjs";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { createJiti } = await loadJiti(import.meta.url);
const jiti = createJiti(import.meta.url, { moduleCache: false });
const search = await jiti.import(path.join(repositoryRoot, "extensions/plastic-memory/project/search.ts"));
const slash = String.fromCharCode(92);
const absoluteRoot = process.platform === "win32" ? `C:${slash}x${slash}y` : "/x/y";
const malformedWindowsRoot = `${slash}${slash}?${slash}`;

// A native absolute root must reach the read-only loader without failing validation.
assert.equal(path.isAbsolute(absoluteRoot), true);
assert.doesNotThrow(() => search.searchProject(absoluteRoot));

// Relative, empty, drive-relative, and incomplete Windows device roots are invalid.
for (const invalidRoot of ["rel/x", "", "C:", malformedWindowsRoot]) {
  assert.throws(() => search.searchProject(invalidRoot), /absolute path/);
}

console.log("SEARCH ROOT: PASS (native absolute accepted; relative and malformed roots rejected)");
