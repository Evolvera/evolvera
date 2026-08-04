# Task 06: Implement non-destructive flat-memory migration

**Agent**: builder  
**Why**: Canonical chunk adoption must not silently lose legacy headings, overwrite originals, or force migration during global cutover.  
**Goal**: A deterministic report-first migrator with explicit publication, byte-preserved archive/manifest, conflicts, idempotence, and rollback.

## Read
- `extensions/plastic-memory/project/schema.ts` — canonical IDs/categories/front matter
- `extensions/plastic-memory/project/store.ts` — validated publication transaction
- `extensions/plastic-memory/project/io.ts` — lock/staging/atomic primitives
- `skills/project-memory/SKILL.md` — legacy level-two heading and flat category conventions
- `skills/project-memory/templates/` — legacy shape evidence only; do not modify
- `skills/project-memory/scripts/validate-architecture.mjs` — architecture preservation oracle

## Change
- `extensions/plastic-memory/project/migrate.ts` — CREATE — detect/report/stage/publish/rollback flat-to-chunk migration
- `extensions/test/plastic-memory-migration.smoke.mjs` — CREATE — temp flat/malformed/collision/rerun/fault fixtures

## Proof
- **Semantic delta and evidence anchors:** legacy memory uses six flat Markdown files with `##` sections; architecture JSON/HTML are separate artifacts. The approved change is deterministic semantic splitting with explicit publication, never model classification.
- **Coverage receipt:** source bytes/headings/preamble → category/source-key/digest report → staged canonical set → archive/manifest/publication → rollback. `AFFECTED`: migrator and fixture. `UNAFFECTED`: runtime commands, arbitrary projects, architecture contents, templates/scripts, and live memory.
- **Closure:** every recognized/unmatched source byte is represented in a chunk or byte archive; manifest/digests own idempotence and rollback. Canonical store remains the only publication engine.
- **Checkpoint:** a unique temp project reports with zero writes, explicitly publishes, preserves originals/architecture, reruns no-op, rejects changed/colliding sources, and survives injected faults with a recoverable state.
- **Acceptance path:** flat fixture → no-write report → explicit publish → canonical chunks/projections + byte archive/manifest → rollback. Content is `PRESERVE`; layout `CHANGE`; silent deletion/automatic migration are not authorized.
- **Counterexample:** heading-only happy paths miss preamble, absent files, and duplicate slugs. Fixtures include each and compare source/archive bytes.

## Acceptance
- [ ] Default/report invocation performs zero writes; publication requires explicit caller authority.
- [ ] Map `setup.md`, `bugs.md`, `architecture.md`, `env.md`, `api-external.md`, and `decisions.md` to approved categories; missing files are valid.
- [ ] Split only deterministic level-two headings; unmatched preamble/content becomes clearly identified import chunks rather than guessed classification.
- [ ] Stable source keys/digests make unchanged reruns no-op and changed/duplicate/slug-colliding sources explicit conflicts.
- [ ] Publish stages a complete valid canonical set, archives every original including `_summary.md` byte-for-byte under `_legacy-flat/`, and writes rollback/source-digest manifest.
- [ ] `architecture.json` and `architecture.html` remain byte-for-byte at root; rollback restores the prior flat layout.
- [ ] Lock/write/rename faults leave either untouched flat state or manifest-backed recovery, never silent loss.

## Constraints
- Never target a path other than the caller-supplied, verified temp current-project root in validation; no current/external project migration.
- No model classification, source rewording, historic filename renaming, deletion without archived bytes, or architecture contract/script/template edit.
- Tests are `DISPOSABLE_VERIFIED`; no provider, network, package, or live installer/session access.

## Validation
- `node extensions/test/plastic-memory-migration.smoke.mjs` — PASS for no-write report, mappings, preamble, idempotence/conflicts, explicit publish, faults, archive, rollback, traversal, and architecture byte preservation
- `node skills/project-memory/scripts/test/architecture-memory.smoke.mjs` — existing architecture contract remains PASS
- `git diff --check -- extensions/plastic-memory/project/migrate.ts extensions/test/plastic-memory-migration.smoke.mjs` — no whitespace errors

## Stop If
- Any source byte cannot be retained in a canonical chunk or rollback archive, or safe migration semantics require inspecting/mutating a real project.

## Checkpoint
- Recovery snapshot: not required; product targets are new and all migration state is temp-owned.
- Commit scope: the two `Change` paths only.
