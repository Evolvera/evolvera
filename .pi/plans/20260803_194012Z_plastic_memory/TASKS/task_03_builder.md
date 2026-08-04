# Task 03: Implement canonical project schemas, publication, and projections

**Agent**: builder  
**Why**: Explicitly accepted durable memory needs one strict domain contract and atomic human-authoritative transaction before retrieval, migration, or promotion can depend on it.  
**Goal**: A canonical Markdown schema/store with stable identity/supersession and deterministic disposable indexes/summaries.

## Read
- `extensions/plastic-memory/common/ids.ts` — project/chunk/proposal identity
- `extensions/plastic-memory/common/safety.ts` — path/Git/secret/bounds invariants
- `extensions/project-memory.ts` — current root-summary and architecture behavior to preserve downstream
- `/private/tmp/plastic-memory-evidence/pi-smart-compact/dist/index.js` — atomic-write/lock mechanism evidence only
- `skills/project-memory/references/architecture-contract.md` — architecture authority boundary; read only

## Change
- `extensions/plastic-memory/project/schema.ts` — CREATE — strict `_project.md`, category chunk/front-matter/evidence, and derived-index guards
- `extensions/plastic-memory/project/io.ts` — CREATE — path-safe root resolution, lock, temp-write/rename, digest, and cleanup primitives
- `extensions/plastic-memory/project/store.ts` — CREATE — canonical load/validate/create/update/supersede and explicit publication transaction
- `extensions/plastic-memory/project/projection.ts` — CREATE — deterministic `index.json`, root summary, and category summaries from canonical chunks
- `extensions/test/plastic-memory-project.smoke.mjs` — CREATE — temp-root schema/publication/fault/recovery fixtures

## Proof
- **Semantic delta and evidence anchors:** current flat Markdown is human authority; the approved change is strict category chunks with deterministic derived artifacts and explicit publication. Smart Compact evidences bounded temp-write/rename/lock patterns.
- **Coverage receipt:** project/chunk/evidence guards → canonical front matter/body → complete set validation → one chunk transaction → index/category/root projections; failure → prior canonical state or explicit derived-stale outcome. `AFFECTED`: five change paths. `UNAFFECTED`: architecture JSON/HTML, project context hook, migration, session ledger, workers, and real `.pi/memory/`.
- **Closure:** durable project schema and every representation derived from canonical chunks are owned together, including source digest/freshness. Search/context consume them read-only; no other task may redefine project authority.
- **Checkpoint:** a unique temp project rejects malformed schema, creates stable project identity, publishes/updates/supersedes a chunk, reloads canonical truth, and regenerates byte-identical projections; injected failures never make generated data authoritative.
- **Acceptance path:** explicit accepted candidate → guarded canonical Markdown → reloaded valid set → observable index/summaries. Human Markdown authority is `PRESERVE`; chunk layout/projections `CHANGE`; autonomous writes are not introduced.
- **Counterexample:** writing `index.json` before the chunk can advertise nonexistent truth after a rename fault. Fault injection asserts canonical-first authority and repair from chunks alone.

## Acceptance
- [ ] Strict guards reject malformed delimiters/JSON, IDs, categories/status/confidence, traversal, duplicate/dangling links, and known/inferred evidence without safe repository-relative paths.
- [ ] First explicit publication creates one stable `pm:p:` identity; later path/head changes do not replace it.
- [ ] One accepted candidate creates/updates exactly one path-safe category chunk with strict JSON front matter and editable Markdown body.
- [ ] Duplicate active targets, project mismatch, secrets/PII, stale conflicts, and unsupported known/inferred claims fail closed.
- [ ] `index.json`, root `_summary.md` (8,000 chars), and category summaries (4,000 chars) are deterministic digest-stamped projections of canonical chunks only.
- [ ] Derived-write failure is explicit and repairable without rewriting chunk bodies or rolling generated data into truth.
- [ ] Optional `architecture.json` and `architecture.html` remain byte-identical and outside the canonical chunk transaction.

## Constraints
- Categories are exactly `setup`, `deploy`, `bugs`, `decisions`, `architecture`, `integrations`, `environment`, `gaps`; status is `active | superseded | gap`; confidence is `known | inferred | unknown`.
- Use Node built-ins only; no database, vectors, embeddings, graph requirement, candidate side store, or dependency.
- Publication receives an explicit acceptance decision and concise evidence-backed content; it never infers user authority or stores transcript dumps.
- Tests are `DISPOSABLE_VERIFIED` under a unique root and must not fall back to current project memory. Do not modify architecture contracts/scripts/tests/templates.

## Validation
- `node extensions/test/plastic-memory-project.smoke.mjs` — PASS for schema, lock/conflict, stable publication/supersession, fault recovery, projections, evidence, traversal, and secret rejection
- `git diff --check -- extensions/plastic-memory/project extensions/test/plastic-memory-project.smoke.mjs` — no whitespace errors

## Stop If
- Canonical success cannot be distinguished from derived failure, or safe schema/lock/atomic-write behavior requires a new dependency or access to a real project.

## Checkpoint
- Recovery snapshot: not required; product files are new and persistent fixtures are temp-owned.
- Commit scope: the five `Change` paths only.
