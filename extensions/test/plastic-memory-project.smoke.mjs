import { loadJiti } from "./lib/pi-sdk.mjs";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { createJiti } = await loadJiti(import.meta.url);
const jiti = createJiti(import.meta.url, { moduleCache: false });
const schema = await jiti.import(path.join(repositoryRoot, "extensions/plastic-memory/project/schema.ts"));
const io = await jiti.import(path.join(repositoryRoot, "extensions/plastic-memory/project/io.ts"));
const storeModule = await jiti.import(path.join(repositoryRoot, "extensions/plastic-memory/project/store.ts"));
const projection = await jiti.import(path.join(repositoryRoot, "extensions/plastic-memory/project/projection.ts"));

const root = mkdtempSync(path.join(tmpdir(), "plastic-memory-project-"));
const architectureJson = path.join(root, "architecture.json");
const architectureHtml = path.join(root, "architecture.html");
writeFileSync(architectureJson, '{"byte":"stable"}\n');
writeFileSync(architectureHtml, "<html>stable</html>\n");
const beforeArchitecture = [readFileSync(architectureJson), readFileSync(architectureHtml)];
const fixedTimes = ["2026-08-03T20:00:00.000Z", "2026-08-03T20:00:01.000Z", "2026-08-03T20:00:02.000Z", "2026-08-03T20:00:03.000Z", "2026-08-03T20:00:04.000Z", "2026-08-03T20:00:05.000Z"];
let timeIndex = 0;
const now = () => fixedTimes[Math.min(timeIndex++, fixedTimes.length - 1)];
const store = new storeModule.ProjectStore(root, { now });
const evidence = { id: "store-module", path: "extensions/plastic-memory/project/store.ts", claim: "The project store publishes accepted canonical chunks." };
const first = store.publish({
  project: { provenance: { repository: "demo", initialPath: "demo" }, name: "demo", repository: "demo", sourceHead: "0".repeat(40), body: "Human-maintained project memory." },
  candidate: { category: "bugs", title: "Retry is bounded", target: "extensions/plastic-memory/project/store.ts", confidence: "known", body: "Keep retries bounded and observable.", evidence: [evidence] },
}, { accepted: true, rationale: "accepted candidate" });
assert.equal(first.status, "published");
assert.equal(first.derived, "fresh");
assert.match(first.projectId, /^pm:p:[a-f0-9]{32}$/);
assert.match(first.chunkId, /^pm:c:[a-f0-9]{32}$/);
assert.equal(store.load().frontMatter.id, first.projectId);
assert.equal(readFileSync(architectureJson).compare(beforeArchitecture[0]), 0);
assert.equal(readFileSync(architectureHtml).compare(beforeArchitecture[1]), 0);

const projectId = first.projectId;
const originalChunk = first.chunkId;
const second = store.publish({ candidate: {
  category: "bugs", title: "Retry remains bounded", target: "extensions/plastic-memory/project/store.ts", confidence: "known", body: "Editable body changed without changing project identity.", sourceHead: "1".repeat(40), chunkId: originalChunk, evidence: [evidence], expectedDigest: first.canonicalDigest,
} }, { accepted: true });
assert.equal(second.projectId, projectId);
assert.equal(second.chunkId, originalChunk);
assert.equal(store.load().frontMatter.id, projectId);
assert.equal(store.load().chunks.length, 1);

assert.throws(() => store.publish({ candidate: { category: "bugs", title: "stale", target: "extensions/plastic-memory/project/store.ts", confidence: "known", body: "x", chunkId: originalChunk, evidence: [evidence], expectedDigest: first.canonicalDigest } }, { accepted: true }), /STALE_CONFLICT/);
assert.throws(() => store.publish({ candidate: { category: "bugs", title: "duplicate", target: "extensions/plastic-memory/project/store.ts", confidence: "known", body: "x", evidence: [evidence] } }, { accepted: true }), /duplicate active target/);
const superseded = store.publish({ candidate: { category: "bugs", title: "Replacement", target: "extensions/plastic-memory/project/store.ts", confidence: "known", body: "The replacement is accepted.", supersedes: originalChunk, evidence: [evidence] } }, { accepted: true });
assert.notEqual(superseded.chunkId, originalChunk);
assert.deepEqual(store.load().chunks.map((chunk) => chunk.frontMatter.status).sort(), ["active", "superseded"]);
assert.throws(() => schema.validateProject({ frontMatter: store.load().frontMatter, body: "", evidence: [evidence], chunks: [{ frontMatter: { ...store.load().chunks[1].frontMatter, links: ["pm:c:" + "f".repeat(32)] }, body: "replacement" }, store.load().chunks[0]] }), /dangling/);
assert.throws(() => store.publish({ candidate: { category: "bugs", title: "not accepted", target: "other.md", confidence: "unknown", body: "x" } }, { accepted: false }), /explicit acceptance/);
assert.throws(() => store.publish({ candidate: { category: "bugs", title: "bad", target: "../outside.md", confidence: "unknown", body: "x" } }, { accepted: true }), /path|traverse/);
assert.throws(() => store.publish({ candidate: { category: "bugs", title: "bad", target: "other.md", confidence: "known", body: "x" } }, { accepted: true }), /evidence/);
assert.throws(() => schema.parseChunkMarkdown("---\n{}\n---\nbody"), /strict JSON/);
assert.throws(() => schema.validateEvidence({ id: "bad", path: "https://example.invalid", claim: "remote" }), /path|repository/);
assert.throws(() => schema.validateEvidence({ id: "bad", path: "a.md", claim: "token=secret" }), /secret/);
assert.throws(() => schema.validateChunkFrontMatter({ schemaVersion: 1, kind: "project-chunk", id: "pm:c:" + "a".repeat(32), projectId: projectId, category: "not-a-category", status: "active", confidence: "unknown", title: "x", target: "x.md", sourceHead: "UNKNOWN", evidenceIds: [], links: [], createdAt: fixedTimes[0], updatedAt: fixedTimes[0] }), /category/);

const paths = io.canonicalPaths(root);
assert.ok(existsSync(paths.index));
const indexBytes = readFileSync(paths.index, "utf8");
const summary = readFileSync(paths.summary, "utf8");
assert.ok(indexBytes.length <= 4000);
assert.ok(summary.length <= 8000);
assert.match(indexBytes, new RegExp(first.projectId));
assert.match(summary, /projection-digest/);
const firstProjection = { index: indexBytes, summary, category: readFileSync(path.join(root, "categories/bugs/_summary.md"), "utf8") };
const canonicalBeforeFault = store.load();
const activeBeforeFault = canonicalBeforeFault.chunks.find((chunk) => chunk.frontMatter.status === "active");
const canonicalFaultStore = new storeModule.ProjectStore(root, { fault: (stage, target) => { if (stage === "rename" && target.endsWith(".md")) throw new Error("injected canonical rename fault"); } });
assert.throws(() => canonicalFaultStore.publish({ candidate: { category: activeBeforeFault.frontMatter.category, title: activeBeforeFault.frontMatter.title, target: activeBeforeFault.frontMatter.target, confidence: activeBeforeFault.frontMatter.confidence, body: "must roll back", chunkId: activeBeforeFault.frontMatter.id, evidence: [evidence] } }, { accepted: true }), /CANONICAL_WRITE_FAILED/);
assert.equal(canonicalFaultStore.load().chunks.find((chunk) => chunk.frontMatter.id === activeBeforeFault.frontMatter.id).body, activeBeforeFault.body);
const loaded = store.load();
const rebuilt = projection.projectProjections(loaded);
assert.equal(JSON.stringify(rebuilt.index, null, 2) + "\n", indexBytes);
assert.equal(rebuilt.summary, summary);
assert.equal(rebuilt.categories.bugs, firstProjection.category.replace(/projection-digest: [a-f0-9]+/u, `projection-digest: ${rebuilt.canonicalDigest}`));

const faultRoot = mkdtempSync(path.join(tmpdir(), "plastic-memory-project-fault-"));
let faulted = false;
const faultStore = new storeModule.ProjectStore(faultRoot, { now, fault: (stage, target) => { if (!faulted && stage === "rename" && target.endsWith("index.json")) { faulted = true; throw new Error("injected derived rename fault"); } } });
const faultResult = faultStore.publish({ project: { provenance: { repository: "fault" }, name: "fault", repository: "fault" }, candidate: { category: "gaps", title: "Repairable", target: "gaps.md", confidence: "unknown", body: "Derived output can be repaired." } }, { accepted: true });
assert.equal(faultResult.derived, "stale");
assert.equal(faultResult.repairable, true);
assert.equal(faultStore.load().chunks.length, 1);
assert.equal(faultResult.repair().derived, "fresh");
assert.match(readFileSync(path.join(faultRoot, "index.json"), "utf8"), /canonicalDigest/);

rmSync(faultRoot, { recursive: true, force: true });
rmSync(root, { recursive: true, force: true });
console.log("PROJECT: PASS (strict schema, explicit publication, stable identity, supersession/conflict guards, deterministic projections, disposable fault recovery)");
