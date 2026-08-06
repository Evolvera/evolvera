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
  const pi = fakePi();
  await rootModule.default(pi);
  const ctx = { cwd: projectRoot, ui: { notify() {} } };
  const invoke = (name, args) => pi.calls.commands.get(name).handler(JSON.stringify(args), ctx);

  const freshCandidate = { category: "bugs", title: "Preview only", target: "src/preview.ts", body: "preview body", confidence: "unknown" };
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

  const noEvidence = await invoke("memory:accept", { category: "bugs", title: "Unsafe fact", target: "src/unsafe.ts", body: "unsafe", confidence: "known" });
  assert.equal(noEvidence.status, "error");
  assert.match(noEvidence.reason, /evidence/);
  const traversing = await invoke("memory:accept", { category: "bugs", title: "Unsafe target", target: "../outside.ts", body: "unsafe", confidence: "unknown" });
  assert.equal(traversing.status, "error");
  assert.match(traversing.reason, /path|travers/);

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
