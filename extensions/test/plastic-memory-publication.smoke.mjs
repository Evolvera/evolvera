import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const packageRoot = "/Users/j.henrique/npm-global/lib/node_modules/@earendil-works/pi-coding-agent";
const { createJiti } = await import(pathToFileURL(path.join(packageRoot, "node_modules/jiti/lib/jiti.mjs")).href);
const sandbox = mkdtempSync(path.join(tmpdir(), "plastic-memory-publication-"));
const agentRoot = path.join(sandbox, "agent");
const projectRoot = path.join(sandbox, "project");
mkdirSync(path.join(agentRoot, "extensions"), { recursive: true });
mkdirSync(path.join(agentRoot, "skills", "project-memory", "scripts"), { recursive: true });
mkdirSync(path.join(projectRoot, ".pi"), { recursive: true });
cpSync(path.join(repositoryRoot, "extensions", "plastic-memory"), path.join(agentRoot, "extensions", "plastic-memory"), { recursive: true });
cpSync(path.join(repositoryRoot, "skills", "project-memory", "scripts", "validate-architecture.mjs"), path.join(agentRoot, "skills", "project-memory", "scripts", "validate-architecture.mjs"));
writeFileSync(path.join(agentRoot, "settings.json"), JSON.stringify({ "plastic-memory": { enabled: true } }));

function snapshot(root) {
  const files = [];
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else files.push([path.relative(root, file), readFileSync(file).toString("base64")]);
    }
  }
  visit(root);
  return files;
}
function fakePi() {
  const calls = { commands: new Map() };
  return {
    calls,
    on() {},
    registerTool() {},
    registerCommand(name, options) { calls.commands.set(name, options); },
    appendEntry() {},
  };
}

try {
  process.chdir(projectRoot);
  const jiti = createJiti(import.meta.url, { moduleCache: false });
  const rootModule = await jiti.import(path.join(agentRoot, "extensions", "plastic-memory", "index.ts"));
  const search = await jiti.import(path.join(agentRoot, "extensions", "plastic-memory", "project", "search.ts"));
  const schema = await jiti.import(path.join(agentRoot, "extensions", "plastic-memory", "project", "schema.ts"));
  const pi = fakePi();
  await rootModule.default(pi);
  const ctx = { cwd: projectRoot, ui: { notify() {} } };
  const invoke = (name, args) => pi.calls.commands.get(name).handler(JSON.stringify(args), ctx);

  const freshCandidate = { category: "bugs", title: "Preview only", target: "src/preview.ts", body: "preview body", confidence: "unknown" };
  const validatedUnknown = schema.validatePublicationCandidate(freshCandidate);
  assert.deepEqual(validatedUnknown, freshCandidate);
  assert.notStrictEqual(validatedUnknown, freshCandidate);
  const knownEvidence = { id: "publication-candidate", path: "extensions/test/plastic-memory-publication.smoke.mjs", claim: "The shared candidate validator is exercised." };
  const fullCandidate = {
    category: "architecture", title: "Validated candidate", target: "src/candidate.ts", body: "validated candidate body", confidence: "known",
    sourceHead: "1".repeat(40), status: "active", chunkId: "pm:c:" + "a".repeat(32), supersedes: "pm:c:" + "b".repeat(32),
    links: ["pm:c:" + "c".repeat(32)], evidence: [knownEvidence], expectedDigest: "d".repeat(64), expectedSourceHead: "e".repeat(40),
  };
  const validatedFull = schema.validatePublicationCandidate(fullCandidate);
  assert.deepEqual(validatedFull, fullCandidate);
  assert.notStrictEqual(validatedFull.evidence, fullCandidate.evidence);
  assert.notStrictEqual(validatedFull.evidence[0], fullCandidate.evidence[0]);
  for (const invalid of [
    { ...freshCandidate, category: "unknown-category" }, { ...freshCandidate, confidence: "certain" }, { ...freshCandidate, status: "retired" },
    { ...freshCandidate, chunkId: "not-an-id" }, { ...freshCandidate, supersedes: "not-an-id" }, { ...freshCandidate, links: ["not-an-id"] },
    { ...freshCandidate, expectedDigest: "not-a-digest" }, { ...freshCandidate, expectedSourceHead: "not-a-head" },
    { ...freshCandidate, target: "../outside.ts" }, { ...freshCandidate, body: "token=secret" }, { ...freshCandidate, unsupported: true },
    { ...freshCandidate, confidence: "known", evidence: [{ id: "bad", path: "https://example.invalid", claim: "remote" }] },
    { ...freshCandidate, confidence: "known" },
  ]) assert.throws(() => schema.validatePublicationCandidate(invalid));
  const beforePreview = snapshot(projectRoot);
  const preview = await invoke("memory:propose", freshCandidate);
  assert.equal(preview.status, "preview");
  assert.equal(preview.action, "create");
  assert.equal(preview.projectExists, false);
  assert.equal(preview.target, freshCandidate.target);
  assert.equal(preview.category, freshCandidate.category);
  assert.deepEqual(preview.warnings, []);
  assert.deepEqual(snapshot(projectRoot), beforePreview, "propose must not write files");

  for (const [field, value] of [["category", "unknown-category"], ["confidence", "certain"]]) {
    const invalid = await invoke("memory:propose", { ...freshCandidate, [field]: value });
    assert.equal(invalid.status, "error");
    assert.match(invalid.reason, new RegExp(field));
  }
  const missing = { ...freshCandidate };
  delete missing.body;
  const missingResult = await invoke("memory:propose", missing);
  assert.equal(missingResult.status, "error");
  assert.match(missingResult.reason, /body/);

  const evidence = { id: "publication", path: "extensions/test/plastic-memory-publication.smoke.mjs", claim: "The publication smoke is explicit." };
  const published = await invoke("memory:accept", { category: "bugs", title: "Published fact", target: "src/known.ts", body: "canonical publication body", confidence: "known", evidence: [evidence] });
  assert.equal(published.status, "published");
  const recalled = search.recallExact(path.join(projectRoot, ".pi", "memory"), published.chunkId);
  assert.equal(recalled.status, "found");
  assert.equal(recalled.chunk.body, "canonical publication body");
  const project = (await jiti.import(path.join(agentRoot, "extensions", "plastic-memory", "project", "store.ts"))).loadProject(path.join(projectRoot, ".pi", "memory"));
  assert.equal(project.frontMatter.repository, path.basename(projectRoot), "bootstrap repository must be relative");

  const updatePreview = await invoke("memory:propose", { category: "bugs", title: "Updated fact", target: "src/known.ts", body: "updated body", confidence: "known", chunkId: published.chunkId, evidence: [evidence] });
  assert.equal(updatePreview.action, "update");
  assert.equal(updatePreview.activeChunkId, published.chunkId);
  assert.equal(updatePreview.activeChunkTitle, "Published fact");
  const supersedePreview = await invoke("memory:propose", { category: "bugs", title: "Replacement fact", target: "src/known.ts", body: "replacement body", confidence: "known", supersedes: published.chunkId, evidence: [evidence] });
  assert.equal(supersedePreview.action, "supersede");
  assert.equal(supersedePreview.activeChunkId, published.chunkId);

  for (const [candidate, pattern] of [
    [{ category: "bugs", title: "Unsafe fact", target: "src/unsafe.ts", body: "unsafe", confidence: "known" }, /evidence/],
    [{ category: "bugs", title: "Unsafe target", target: "../outside.ts", body: "unsafe", confidence: "unknown" }, /path|travers/],
    [{ category: "bugs", title: "Malformed evidence", target: "src/malformed.ts", body: "unsafe", confidence: "known", evidence: [{ id: "malformed", path: "https://example.invalid", claim: "remote" }] }, /path|repository/],
  ]) {
    const beforeRejected = snapshot(projectRoot);
    const rejected = await invoke("memory:accept", candidate);
    assert.equal(rejected.status, "error");
    assert.match(rejected.reason, pattern);
    assert.deepEqual(snapshot(projectRoot), beforeRejected, "rejected publication must not write files");
  }

  for (const name of ["memory:migrate", "memory:backfill", "memory:retry"]) {
    const unavailable = await invoke(name, {});
    assert.equal(unavailable.status, "unavailable");
    assert.equal(unavailable.state, "unavailable");
  }
  console.log("PLASTIC_MEMORY_PUBLICATION: PASS (read-only previews, validated publication wiring, canonical recall, store errors, and unavailable workers)");
} finally {
  process.chdir(repositoryRoot);
  rmSync(sandbox, { recursive: true, force: true });
}
