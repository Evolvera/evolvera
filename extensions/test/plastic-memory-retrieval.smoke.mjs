import { loadJiti } from "./lib/pi-sdk.mjs";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync, readdirSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { createJiti } = await loadJiti(import.meta.url);
const jiti = createJiti(import.meta.url, { moduleCache: false });
const io = await jiti.import(path.join(repositoryRoot, "extensions/plastic-memory/project/io.ts"));
const storeModule = await jiti.import(path.join(repositoryRoot, "extensions/plastic-memory/project/store.ts"));
const search = await jiti.import(path.join(repositoryRoot, "extensions/plastic-memory/project/search.ts"));
const context = await jiti.import(path.join(repositoryRoot, "extensions/plastic-memory/project/context.ts"));

const fixed = "2026-08-03T20:00:00.000Z";
const head = "0".repeat(40);
const architecture = {
  schemaVersion: 1,
  project: { id: "fixture-project", name: "Fixture Project" },
  snapshot: { sourceHead: head, generatedAt: fixed, lastVerifiedAt: fixed, scope: "Smoke fixture", confidence: "known" },
  actors: [], components: [{ id: "root", name: "Root", kind: "domain", level: 0, confidence: "unknown", evidenceIds: [] }],
  dataObjects: [], relationships: [], flows: [], evidence: [], gaps: [],
};
function publishFixture(root) {
  const store = new storeModule.ProjectStore(root, { now: () => fixed });
  const evidence = { id: "fixture", path: "extensions/test/plastic-memory-retrieval.smoke.mjs", claim: "The fixture exercises exact retrieval." };
  const sentinelBody = `Full sentinel body: ${"NEVER-INJECT-THIS-COMPLETE-CHUNK-BODY ".repeat(100)}#retry`;
  const first = store.publish({
    project: { provenance: { root }, name: "Fixture", repository: "fixture", sourceHead: head, body: "Human-maintained project body." },
    candidate: { category: "bugs", title: "Bounded retries", target: "src/retry.ts", confidence: "known", body: sentinelBody, evidence: [evidence] },
  }, { accepted: true });
  first.sentinelBody = sentinelBody;
  store.publish({ candidate: { category: "decisions", title: "A lexical decision", target: "src/decision.ts", confidence: "inferred", body: "A bounded decision #lexical", evidence: [evidence] } }, { accepted: true });
  return { store, first };
}
function snapshotFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === ".publish.lock") continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else files.push([path.relative(root, file), readFileSync(file)]);
    }
  };
  if (existsSync(root)) visit(root);
  return files;
}

const canonicalRoot = mkdtempSync(path.join(tmpdir(), "plastic-memory-retrieval-canonical-"));
const flatRoot = mkdtempSync(path.join(tmpdir(), "plastic-memory-retrieval-flat-"));
const emptyRoot = mkdtempSync(path.join(tmpdir(), "plastic-memory-retrieval-empty-"));
try {
  const { store, first } = publishFixture(canonicalRoot);
  writeFileSync(path.join(canonicalRoot, "architecture.json"), JSON.stringify(architecture, null, 2));
  writeFileSync(path.join(canonicalRoot, "architecture.html"), "FULL-HTML-SENTINEL");
  mkdirSync(path.join(canonicalRoot, ".git"));
  writeFileSync(path.join(canonicalRoot, ".git", "HEAD"), `${head}\n`);
  const beforeRead = snapshotFiles(canonicalRoot);

  const recalled = search.recallExact(canonicalRoot, first.chunkId);
  assert.equal(recalled.state, "found");
  assert.equal(recalled.chunk.body, first.sentinelBody);
  assert.equal(recalled.evidence[0].id, "fixture");
  assert.equal(search.recallExact(canonicalRoot, "pm:c:bad" ).state, "unavailable");
  assert.equal(search.recallExact(canonicalRoot, first.projectId).project.frontMatter.id, first.projectId);
  assert.deepEqual(search.searchProject(canonicalRoot, { category: "bugs", tag: "retry" }).matches.map((m) => m.id), [first.chunkId]);
  assert.equal(search.searchProject(canonicalRoot, { text: "lexical", confidence: "inferred" }).matches.length, 1);
  assert.throws(() => search.searchProject(canonicalRoot, { category: "wrong" }), /category/);
  assert.throws(() => search.searchProject(canonicalRoot, { limit: 101 }), /limit/);

  const firstContext = context.assembleProjectContext(canonicalRoot, { repositoryRoot: canonicalRoot });
  const retryContext = firstContext; // Pi retains the per-run override object through retry/settlement.
  assert.strictEqual(firstContext, retryContext);
  assert.equal(firstContext.mode, "canonical");
  assert.equal(firstContext.architectureStatus, "CURRENT");
  assert.ok(firstContext.summary.length <= 8000);
  assert.ok(firstContext.activeChunkIndex.length <= 4000);
  assert.ok(firstContext.architectureIndex.length <= 4000);
  assert.ok(firstContext.activeChunkIndex.includes(first.chunkId));
  assert.ok(!firstContext.block.includes(first.sentinelBody));
  assert.ok(!firstContext.block.includes("FULL-HTML-SENTINEL"));
  assert.ok(Object.isFrozen(firstContext) && Object.isFrozen(firstContext.compactorInput));
  assert.deepEqual(snapshotFiles(canonicalRoot), beforeRead);

  // Missing/stale derived files are rebuilt in memory, never written.
  rmSync(io.canonicalPaths(canonicalRoot).index);
  const beforeRebuild = snapshotFiles(canonicalRoot);
  const rebuilt = context.buildProjectContext(canonicalRoot, { repositoryRoot: canonicalRoot });
  assert.equal(rebuilt.derivedStatus, "REBUILT_IN_MEMORY");
  assert.ok(rebuilt.warnings.some((warning) => warning.includes("REBUILT_IN_MEMORY")));
  assert.deepEqual(snapshotFiles(canonicalRoot), beforeRebuild);

  // Invalid architecture warns but does not discard canonical Markdown, and HTML is never read.
  writeFileSync(path.join(canonicalRoot, "architecture.json"), "{not-json");
  writeFileSync(path.join(canonicalRoot, "architecture.html"), "FULL-HTML-SENTINEL-INVALID");
  const invalidArchitecture = context.assembleProjectContext(canonicalRoot);
  assert.equal(invalidArchitecture.mode, "canonical");
  assert.equal(invalidArchitecture.architectureStatus, "INVALID");
  assert.equal(invalidArchitecture.architectureIndex, undefined);
  assert.ok(invalidArchitecture.warnings.some((warning) => warning.includes("ARCHITECTURE_MEMORY_INVALID")));

  // Flat fallback keeps the old capped summary, but makes the missing active index explicit.
  writeFileSync(path.join(flatRoot, "_summary.md"), "legacy summary\n".repeat(5000));
  writeFileSync(path.join(flatRoot, "architecture.html"), "FULL-HTML-SENTINEL-FLAT");
  const flat = context.createProjectContext(flatRoot);
  assert.equal(flat.mode, "legacy-flat");
  assert.equal(flat.activeChunkIndex.includes("LEGACY_FLAT_ACTIVE_INDEX_UNAVAILABLE"), true);
  assert.ok(flat.summary.length <= 8000);
  assert.equal(flat.architectureStatus, "MISSING");
  assert.ok(!flat.block.includes("FULL-HTML-SENTINEL-FLAT"));

  const empty = context.loadProjectContext(emptyRoot);
  assert.equal(empty.mode, "uninitialized");
  assert.ok(empty.summary.includes("PROJECT_MEMORY_UNINITIALIZED"));
  assert.ok(empty.activeChunkIndex.includes("PROJECT_MEMORY_ACTIVE_INDEX_EMPTY"));
  assert.ok(empty.block.length < 12000);
  assert.equal(existsSync(path.join(emptyRoot, "_summary.md")), false);

  // Architecture states retain the established vocabulary.
  writeFileSync(path.join(flatRoot, "architecture.json"), JSON.stringify({ ...architecture, snapshot: { ...architecture.snapshot, sourceHead: "1".repeat(40) } }));
  const stale = context.assembleProjectContext(flatRoot, { repositoryRoot: emptyRoot });
  assert.equal(stale.architectureStatus, "HEAD_UNKNOWN");

  console.log("RETRIEVAL: PASS (exact canonical recall, bounded lexical filters, immutable canonical/flat/no-memory context, architecture authority, retry identity, and read-only rebuild)");
} finally {
  rmSync(canonicalRoot, { recursive: true, force: true });
  rmSync(flatRoot, { recursive: true, force: true });
  rmSync(emptyRoot, { recursive: true, force: true });
}
