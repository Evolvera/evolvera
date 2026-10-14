import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { validateInventory } from "../check-inventory.mjs";

const item = (id, classification = "MATCH", evidence = ["source#1"], gap = null) => ({ id, classification, evidence, gap });
const complete = (ids) => ({ status: "COMPLETE", items: ids.map((id) => item(id)) });
const valid = validateInventory(["a", "b"], complete(["a", "b"]));
assert.equal(valid.ok, true);
assert.equal(validateInventory([], { status: "COMPLETE", items: [] }).ok, true);
assert.deepEqual(validateInventory(["a", "b"], complete(["a"])).missing, ["b"]);
assert.deepEqual(validateInventory(["a"], { status: "COMPLETE", items: [item("a"), item("a")] }).duplicates, ["a"]);
assert.equal(validateInventory(["a"], { status: "COMPLETE", items: [item("a"), item("a", "OTHER")] }).ok, false);
assert.deepEqual(validateInventory(["a"], complete(["b"])).unexpected, ["b"]);
assert.equal(validateInventory(["a", "a"], complete(["a"])).ok, false);
assert.equal(validateInventory([" a"], complete([" a"])).ok, false);
// Match the ID universe so malformed fields, not an unrelated unexpected ID,
// must cause rejection.
const malformedItems = [
  { id: "x" }, item("x", " "), item("x", 7),
  item("x", "A", [""]), item("x", "A", [7]),
  item("x", "A", "citation"), item("x", "A", []),
  item("x", "A", Array(1)),
  item("x", "A", ["e"], " "), item("x", "A", ["e"], 0),
  { id: "x", classification: "A", evidence: ["e"] },
];
for (const bad of malformedItems) {
  const result = validateInventory(["x"], { status: "COMPLETE", items: [bad] });
  assert.equal(result.ok, false);
  assert.deepEqual(result.unexpected, []);
  assert.ok(result.errors.some((message) => message.startsWith("x:")));
}
const invalidCases = [
  [null, complete([])], [[7], complete([])], [[""], complete([])],
  [[], null], [[], []], [[], { status: "DONE", items: [] }],
  [[], { status: "COMPLETE", items: null }],
  [["x"], { status: "COMPLETE", items: [null] }],
  [["x"], { status: "COMPLETE", items: [item("x", "UNKNOWN")] }],
  [["x"], { status: "COMPLETE", items: [item("x", "UNKNOWN", [], "gap")] }],
  [["x"], { status: "COMPLETE", items: [item("x", " UNKNOWN ")] }],
  [["x"], { status: "COMPLETE", items: [item("x", "A", ["e"], "gap")] }],
  [["x"], { status: "PARTIAL", items: [item("x")] }],
];
for (const [expected, receipt] of invalidCases) assert.equal(validateInventory(expected, receipt).ok, false);
assert.equal(validateInventory(["x"], { status: "COMPLETE", items: [item("x", "uNkNoWn", ["e"], "unresolved")] }).unresolved.includes("x"), true);
assert.equal(validateInventory(["./x"], complete(["x"])).ok, false);
const expectedInput = ["x"], receiptInput = complete(["x"]), before = JSON.stringify([expectedInput, receiptInput]);
validateInventory(expectedInput, receiptInput);
assert.equal(JSON.stringify([expectedInput, receiptInput]), before);

// STATEFUL RESOURCE PROOF: CLI fixture writes/teardown are confined to this
// uniquely created synthetic temp root. Checker imports no product code and
// reads only explicit JSON inputs; no hooks, network, credentials or fallback.
const checkerUrl = new URL("../check-inventory.mjs", import.meta.url);
const tempRoot = await mkdtemp(join(tmpdir(), "inventory-receipt-"));
try {
  const expectedPath = join(tempRoot, "expected.json"), receiptPath = join(tempRoot, "receipt.json");
  const invoke = (...args) => spawnSync(process.execPath, [fileURLToPath(checkerUrl), ...args], { encoding: "utf8", cwd: tempRoot, timeout: 5000 });
  const imported = spawnSync(process.execPath, ["--input-type=module", "-e", `import ${JSON.stringify(checkerUrl.href)}`], { encoding: "utf8", cwd: tempRoot, timeout: 5000 });
  assert.equal(imported.status, 0);
  assert.equal(imported.stdout, "");
  assert.equal(imported.stderr, "");
  await writeFile(expectedPath, JSON.stringify(["x"])); await writeFile(receiptPath, JSON.stringify(complete(["x"])));
  let run = invoke(expectedPath, receiptPath); assert.equal(run.status, 0); assert.equal(JSON.parse(run.stdout).ok, true);
  await writeFile(receiptPath, JSON.stringify(complete([])));
  run = invoke(expectedPath, receiptPath); assert.equal(run.status, 1); assert.deepEqual(JSON.parse(run.stdout).missing, ["x"]);
  await writeFile(receiptPath, "{");
  run = invoke(expectedPath, receiptPath); assert.equal(run.status, 1); assert.match(JSON.parse(run.stdout).errors[0], /JSON/);
  run = invoke(join(tempRoot, "absent.json"), receiptPath); assert.equal(run.status, 1); assert.equal(JSON.parse(run.stdout).ok, false);
  run = invoke(); assert.equal(run.status, 1); assert.equal(JSON.parse(run.stdout).ok, false);
} finally {
  await rm(tempRoot, { recursive: true, force: true });
  await assert.rejects(readFile(tempRoot));
}

console.log("inventory receipt smoke: PASS");
