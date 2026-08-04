# Task 11: Align Project Memory policy and user guidance

**Agent**: builder-light  
**Why**: The current skill/system/README still prescribe whole-memory rescans/regeneration, flat-only extension discovery, OM/bare recall, and old compaction behavior.  
**Goal**: Focused policy/docs that exactly describe canonical chunks, four Luna roles, semantic cycles, safe resume/backfill, bounded context, one-owner cutover, and rollback.

## Read
- `extensions/plastic-memory/config.ts` — exact installed defaults/activation guard
- `extensions/plastic-memory/runtime/tools.ts` — implemented names and result states
- `extensions/plastic-memory/runtime/commands.ts` — commands/aliases/authority controls
- `extensions/plastic-memory/session/bootstrap.ts` and `session/backfill.ts` — safe resume/gap/backfill behavior
- `extensions/plastic-memory/project/schema.ts` and `project/migrate.ts` — canonical authority/migration
- `extensions/plastic-memory/runtime/coordinator.ts` — 6/4/apply/emergency behavior
- `skills/project-memory/SKILL.md` — current scan/save/edit/delete/regeneration/search and Flow/architecture clauses
- `SYSTEM.md` and `config/SYSTEM.md` — mirrored `## Project Memory` blocks
- `README.md` — installer sections, surfaces/config tables, daily commands/memory paragraph, update/rollback/structure

## Change
- `skills/project-memory/SKILL.md` — MODIFY — replace whole-rescan/regeneration workflow with targeted chunk/evidence/proposal/migration/search/recovery policy while preserving Flow and architecture validation
- `SYSTEM.md` — MODIFY — update only `## Project Memory` through the next heading
- `config/SYSTEM.md` — MODIFY — mirror the exact same Project Memory block
- `README.md` — MODIFY — focused installer/surface/config/daily-memory/update/rollback/structure guidance for plastic-memory

## Proof
- **Semantic delta and evidence anchors:** the skill mandates three-scout scans and model-written whole `_summary.md`; README names OM, bare recall, flat `extensions/*.ts`, and old worker/threshold behavior. Implemented modules provide deterministic projections and explicit publication.
- **Coverage receipt:** implemented config/tools/commands/bootstrap/project/coordinator → exact policy and user journeys; source/installed system mirrors → one identical block. `AFFECTED`: four docs. `UNAFFECTED`: Flow/GitHub authority, agent routing, security, architecture contract/scripts/templates, runtime/settings/installers, and unrelated README sections.
- **Closure:** every changed user-visible command/default/authority/cutover behavior has one documentation owner; no speculative feature or live quality claim is added.
- **Checkpoint:** exact block comparison and focused stale-reference searches prove users are not instructed to bypass proposal authority, process full history, use bare recall, or assume flat-only extension discovery.
- **Acceptance path:** implemented names/behavior → bounded patch anchors → observable policy commands/rollback guidance. Flow/architecture/security are `PRESERVE`; memory workflow/docs `CHANGE`; model-driven whole regeneration is removed.
- **Counterexample:** deleting every flat reference would erase fallback/migration guidance. Retained flat text must be explicitly labeled legacy compatibility.

## Acceptance
- [ ] Skill states canonical Markdown chunks are human authority, projections are derived, promoter output is proposal-only, acceptance needs current evidence, and routine updates are targeted rather than full rescans/whole-summary rewrites.
- [ ] Skill preserves Flow/GitHub authority, secret/PII rules, architecture JSON authority/validate-before-render/HTML derivation, and targeted curated handoffs.
- [ ] System Project Memory blocks are byte-identical and describe bounded summary + active index + optional architecture index, namespaced targeted recall/search, and explicit publication.
- [ ] README documents four Luna-medium roles, semantic cycles, one-shot/no-loop behavior, 6/4 stride, settled-only apply/host gate, native emergency fallback, safe legacy resume, explicit bounded backfill, and no live quality claim.
- [ ] README replaces active OM/bare-recall/flat-only discovery with namespaced tools/commands, recursive extension directory, one-owner/deferred activation, flat fallback/migration, provider-free checks, and rollback.
- [ ] Unrelated routing/security/platform/Flow text and architecture contracts/scripts/templates are unchanged; no broad formatting/translation rewrite.

## Constraints
- Patch only the skill sections named in `Read`, the exact mirrored Project Memory blocks, and README anchors `O que o instalador faz`, `Superfícies principais`, `Comandos úteis`/memory paragraph, `Atualizar`, `Rollback`, and `Estrutura do repositório`.
- Do not modify architecture reference/scripts/tests/templates or any source/config/installer file.
- Use implemented names/defaults only; no prepare-only mode, multipart promise, dashboard, autonomous publication, live model claim, or instruction to execute cutover/migration during implementation.

## Validation
- `node -e 'const fs=require("fs"); const pick=p=>fs.readFileSync(p,"utf8").match(/## Project Memory[\s\S]*?(?=\n## )/)?.[0]; if(!pick("SYSTEM.md")||pick("SYSTEM.md")!==pick("config/SYSTEM.md")) process.exit(1)'` — mirrored blocks match
- `grep -niE 'pi-observational-memory|recall\(<id>\)|extensions/\*\.ts|leia TODOS os arquivos|sobrescreva .*_summary|exactly three|Qwen' README.md skills/project-memory/SKILL.md SYSTEM.md config/SYSTEM.md` — no active stale claim; any flat/OM match is explicitly compatibility/rollback history
- `node skills/project-memory/scripts/test/architecture-memory.smoke.mjs` — architecture contract remains PASS
- `git diff --check -- skills/project-memory/SKILL.md SYSTEM.md config/SYSTEM.md README.md` — no whitespace errors

## Stop If
- Exact implemented behavior differs from read modules, patch anchors are absent/ambiguous, or preserving Flow/architecture/unrelated documentation would require broad rewrite.

## Checkpoint
- Recovery snapshot: required for the large skill/README and mirrored system files; capture exact pre-edit copies/diffs and named preservation blocks.
- Commit scope: the four `Change` paths only.
