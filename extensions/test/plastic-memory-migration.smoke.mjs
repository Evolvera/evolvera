import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const packageRoot = "/Users/j.henrique/npm-global/lib/node_modules/@earendil-works/pi-coding-agent";
const { createJiti } = await import(pathToFileURL(path.join(packageRoot, "node_modules/jiti/lib/jiti.mjs")).href);
const jiti = createJiti(import.meta.url, { moduleCache: false });
const migration = await jiti.import(path.join(repositoryRoot, "extensions/plastic-memory/project/migrate.ts"));
const storeModule = await jiti.import(path.join(repositoryRoot, "extensions/plastic-memory/project/store.ts"));

const files = {
  "setup.md": "Preamble bytes\n## Install\nrun it\n### Nested stays\nunchanged\n## Deploy\nship it\n",
  "bugs.md": "## Known bug\nKeep the workaround.\n",
  "architecture.md": "## Boundary\nThe boundary is durable.\n",
  "env.md": "## Runtime\nUse the temp fixture.\n",
  "api-external.md": "## Vendor API\nNo provider is contacted.\n",
  "decisions.md": "## Store choice\nUse the canonical store.\n",
  "_summary.md": "legacy summary bytes\n",
  "architecture.json": '{"architecture":"stable"}\n',
  "architecture.html": "<html>stable</html>\n",
};

function populateFixture(root) {
  mkdirSync(root, { recursive: true });
  for (const [file, bytes] of Object.entries(files)) writeFileSync(path.join(root, file), bytes);
}
function fixture(prefix = "plastic-memory-migration-") {
  const root = mkdtempSync(path.join(tmpdir(), prefix));
  populateFixture(root);
  return root;
}
function nestedMemoryFixture() {
  const projectRoot = mkdtempSync(path.join(tmpdir(), "plastic-memory-migration-project-"));
  const root = path.join(projectRoot, "project", ".pi", "memory");
  populateFixture(root);
  return { projectRoot, root };
}
function bytes(root, file) { return readFileSync(path.join(root, file)); }
function snapshot(root) {
  return readdirSync(root).sort().map((file) => [file, bytes(root, file)]);
}

const root = fixture();
const beforeReport = snapshot(root);
const report = migration.reportMigration(root);
assert.equal(report.status, "ready");
assert.equal(report.noWrite, true);
assert.equal(report.canPublish, true);
assert.deepEqual(snapshot(root), beforeReport, "report must perform zero writes");
assert.equal(report.chunks.find((chunk) => chunk.sourceKey === "setup.md#preamble").body, "Preamble bytes\n");
assert.ok(report.chunks.some((chunk) => chunk.sourceKey === "setup.md#install" && chunk.body.includes("### Nested stays")));
assert.equal(report.chunks.find((chunk) => chunk.sourcePath === "env.md").category, "environment");
assert.equal(report.chunks.find((chunk) => chunk.sourcePath === "api-external.md").category, "integrations");

const original = Object.fromEntries(Object.keys(files).map((file) => [file, bytes(root, file)]));
const manifest = migration.publishMigration(root, report, { now: () => "2026-08-03T20:00:00.000Z" });
assert.equal(manifest.status, "published");
for (const file of Object.keys(files)) {
  assert.equal(bytes(root, path.join("_legacy-flat", file)).compare(original[file]), 0, `${file} must be archived byte-for-byte`);
}
assert.equal(bytes(root, "architecture.json").compare(original["architecture.json"]), 0);
assert.equal(bytes(root, "architecture.html").compare(original["architecture.html"]), 0);
for (const file of ["setup.md", "bugs.md", "architecture.md", "env.md", "api-external.md", "decisions.md"]) assert.equal(existsSync(path.join(root, file)), false);
assert.equal(bytes(root, "_summary.md").compare(original["_summary.md"]) === 0, false, "canonical summary must not replace the archived legacy summary");
const loaded = new storeModule.ProjectStore(root).load();
assert.ok(loaded);
assert.ok(loaded.chunks.some((chunk) => chunk.frontMatter.category === "integrations"));
const rerun = migration.reportMigration(root);
assert.equal(rerun.status, "published");
assert.equal(rerun.idempotent, true);
assert.deepEqual(rerun.chunks.map((chunk) => [chunk.sourceKey, chunk.body]), report.chunks.map((chunk) => [chunk.sourceKey, chunk.body]));
assert.equal(migration.publishMigration(root).createdAt, manifest.createdAt, "published rerun must be a no-op");
writeFileSync(path.join(root, "setup.md"), "changed after publication\n");
assert.equal(migration.reportMigration(root).status, "conflict");
assert.throws(() => migration.publishMigration(root), /conflict/i);
writeFileSync(path.join(root, "setup.md"), original["setup.md"]);
migration.rollbackMigration(root);
for (const [file, content] of Object.entries(original)) assert.equal(bytes(root, file).compare(content), 0, `${file} must be restored byte-for-byte`);
assert.equal(existsSync(path.join(root, migration.MIGRATION_MANIFEST)), false);
assert.equal(existsSync(path.join(root, "_project.md")), false);
assert.equal(existsSync(path.join(root, "chunks")), false);
assert.equal(existsSync(path.join(root, "categories")), false);
rmSync(root, { recursive: true, force: true });

const changedRoot = fixture("plastic-memory-migration-conflict-");
const changedReport = migration.reportMigration(changedRoot);
writeFileSync(path.join(changedRoot, "setup.md"), "changed\n");
assert.equal(migration.reportMigration(changedRoot).status, "ready", "pre-publication changes are a fresh report");
assert.throws(() => migration.publishMigration(changedRoot, changedReport), /stale|conflict/i);
rmSync(changedRoot, { recursive: true, force: true });

const collisionRoot = fixture("plastic-memory-migration-collision-");
writeFileSync(path.join(collisionRoot, "bugs.md"), "## Same\na\n## Same\nb\n");
const collision = migration.reportMigration(collisionRoot);
assert.equal(collision.status, "conflict");
assert.match(collision.conflicts.join("\n"), /slug collision/);
rmSync(collisionRoot, { recursive: true, force: true });

const faultRoot = fixture("plastic-memory-migration-fault-");
let finalFault = false;
assert.throws(() => migration.publishMigration(faultRoot, undefined, {
  fault: (stage, target) => {
    if (stage === "rename" && target.startsWith(faultRoot) && !target.endsWith(migration.MIGRATION_MANIFEST)) {
      finalFault = true;
      throw new Error("injected final rename fault");
    }
  },
}), /injected final rename fault/);
assert.equal(finalFault, true);
assert.equal(migration.reportMigration(faultRoot).status, "recovery-required");
migration.rollbackMigration(faultRoot);
for (const [file, content] of Object.entries(files)) assert.equal(bytes(faultRoot, file).compare(Buffer.from(content)), 0, `${file} survives fault rollback`);
assert.equal(existsSync(path.join(faultRoot, migration.MIGRATION_MANIFEST)), false);
rmSync(faultRoot, { recursive: true, force: true });

const missingRoot = mkdtempSync(path.join(tmpdir(), "plastic-memory-migration-missing-"));
const missing = migration.reportMigration(missingRoot);
assert.equal(missing.status, "ready");
const missingManifest = migration.publishMigration(missingRoot);
assert.equal(missingManifest.status, "published");
assert.equal(migration.reportMigration(missingRoot).idempotent, true);
migration.rollbackMigration(missingRoot);
rmSync(missingRoot, { recursive: true, force: true });

const nested = nestedMemoryFixture();
const nestedBeforeReport = snapshot(nested.root);
const nestedReport = migration.reportMigration(nested.root);
assert.equal(nestedReport.status, "ready");
assert.equal(nestedReport.noWrite, true);
assert.deepEqual(snapshot(nested.root), nestedBeforeReport, "nested .pi/memory report must perform zero writes");
const nestedOriginal = Object.fromEntries(Object.keys(files).map((file) => [file, bytes(nested.root, file)]));
const nestedManifest = migration.publishMigration(nested.root, nestedReport, { now: () => "2026-08-03T20:01:00.000Z" });
assert.equal(nestedManifest.status, "published");
assert.equal(bytes(nested.root, path.join("_legacy-flat", "setup.md")).compare(nestedOriginal["setup.md"]), 0);
assert.equal(migration.reportMigration(nested.root).idempotent, true);
migration.rollbackMigration(nested.root);
for (const [file, content] of Object.entries(nestedOriginal)) assert.equal(bytes(nested.root, file).compare(content), 0, `nested ${file} must be restored byte-for-byte`);
assert.equal(existsSync(path.join(nested.root, migration.MIGRATION_MANIFEST)), false);
rmSync(nested.projectRoot, { recursive: true, force: true });

console.log("MIGRATION: PASS (report-first, deterministic splits/mappings, byte archive, conflicts, idempotence, fault recovery, rollback, disposable roots)");
