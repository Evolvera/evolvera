# Task 10: Wire one full runtime and bridge the legacy project hook

**Agent**: builder  
**Why**: The auto-discovered root and existing project hook must agree on disabled, OM-blocked, and full modes so no checkpoint has zero or duplicate context/compaction owners.  
**Goal**: One guarded composition root for session/project/surfaces and one thin context-only compatibility bridge, while current OM-configured repository state remains inert.

## Read
- `extensions/plastic-memory/index.ts` — inert root to wire
- `extensions/plastic-memory/config.ts` — enabled/effective package-collision predicates
- `extensions/plastic-memory/runtime/coordinator.ts` — completed direct-register session/context owner
- `extensions/plastic-memory/runtime/tools.ts` — namespaced tools
- `extensions/plastic-memory/runtime/commands.ts` — commands/aliases/authority actions
- `extensions/plastic-memory/project/context.ts` — shared every-run context assembler
- `extensions/project-memory.ts` — current live hook and exact behavior being bridged
- `config/settings.json` and `settings.json` — current OM collision evidence only; do not modify
- `/Users/j.henrique/npm-global/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md` — auto-discovery and duplicate registration behavior

## Change
- `extensions/plastic-memory/index.ts` — MODIFY — wire full runtime only when explicitly enabled and no effective OM package; otherwise register nothing
- `extensions/project-memory.ts` — MODIFY — replace standalone implementation with a thin config-aware context-only delegate used only when plastic is not full owner
- `extensions/test/plastic-memory-cutover.smoke.mjs` — CREATE — both auto-discovered entries, all ownership modes, every-run context, complete project/session journey

## Proof
- **Semantic delta and evidence anchors:** current `project-memory.ts` owns one `before_agent_start`; current settings still load OM. The directly registerable coordinator is valid while the root remains inert. Full wiring before bridge agreement can create duplicate context; bridge-first can create zero context.
- **Coverage receipt:** effective settings/package lists → full/inert predicate; full root → one coordinator/context/tools/commands; disabled or OM-blocked root → project filename bridge → same project context assembler. `AFFECTED`: root, bridge, cutover fixture. `UNAFFECTED`: coordinator semantics, canonical/project files, active/root settings, OM package files, installers, and live reload.
- **Closure:** every auto-discovered registration in all three modes is owned here; old project summary/Git/architecture implementation is removed rather than duplicated. Flat fallback is already proven in the shared assembler.
- **Checkpoint:** loading both files through Pi jiti in temp agent roots yields exact handler/tool/command inventories and complete provider-free session/project/context journeys. Current repository mode remains plastic-inert because no settings are changed.
- **Acceptance path:** settings mode + two auto-discovered files → owner inventory → real before-start/session hooks and observable context/retrieval/publication. Flat project context is `PRESERVE`; implementation ownership `CHANGE`; standalone duplicate logic is `REMOVE`.
- **Counterexample:** treating `enabled:true` alone as full ownership makes enabled-plus-OM suppress the bridge while root correctly blocks, yielding zero project context. The all-mode fixture requires collision-aware agreement.

## Acceptance
- [ ] Absent/invalid/disabled plastic config: root registers nothing; bridge registers exactly one context-only handler using `project/context.ts`.
- [ ] Enabled plus OM in effective global or project packages: root registers no plastic session/full runtime; bridge still registers exactly one project-context handler and does not cancel/alter OM behavior.
- [ ] Enabled without OM: root registers exactly one coordinator/`session_before_compact`/guarded `context`, one project `before_agent_start`, approved tools/commands/aliases, and the bridge registers nothing.
- [ ] Bridge contains no copied summary/Git/architecture logic and never registers workers, tools, commands, `context`, or compaction; it delegates only `before_agent_start` context assembly.
- [ ] Canonical, flat-only, and no-memory prompts each contain bounded summary + active-index marker + optional architecture index on startup, ordinary prompt, and post-compaction/emergency retry; full chunk sentinel appears only through recall.
- [ ] Fake proposal → explicit acceptance → canonical chunk/projections → search/recall → fresh-prompt context succeeds; 100k/no-loop, ~7m safe resume, 6/4, internal cancel, and native emergency integration remain PASS.
- [ ] Current source/root settings are read-only evidence; no `/reload`, provider, package operation, real migration, or current memory/session mutation occurs.

## Patch Anchors
- In `extensions/plastic-memory/index.ts`, replace only the inert default-export body/import surface; keep fail-closed importability and do not add top-level registrations.
- In `extensions/project-memory.ts`, snapshot the complete ~186-line file, then replace its standalone helper/default-export implementation with the bounded delegation shim. Preservation is proved by shared-context canonical/flat/no-memory/architecture fixtures, not by retaining duplicate helpers.
- Stop before mutation if effective global/project package detection is not available synchronously at registration time or if either file has unexpected overlapping edits.

## Constraints
- Do not modify coordinator behavior, settings/installers/docs, architecture files, project/session data, or run `/reload`.
- Preserve unrelated code and avoid repository-wide formatting. No global mutable owner flag that depends on extension load order; both files must derive the same mode from effective config/package evidence.
- All checks are `NO_STATEFUL_RESOURCES` or `DISPOSABLE_VERIFIED` with temp agent/project roots and fake models.

## Validation
- `node extensions/test/plastic-memory-cutover.smoke.mjs` — PASS for disabled/OM-blocked/full inventories, one owner, full/flat/no-memory every-run context, retrieval/publication, safe resume, 6/4, and emergency behavior
- `node extensions/test/plastic-memory-integration.smoke.mjs` — direct coordinator host lifecycle remains PASS after root wiring
- `node extensions/test/plastic-memory-retrieval.smoke.mjs` — shared context parity remains PASS
- `node extensions/test/plastic-memory-bootstrap.smoke.mjs` — Node+jiti root load remains PASS
- `git diff --check -- extensions/plastic-memory/index.ts extensions/project-memory.ts extensions/test/plastic-memory-cutover.smoke.mjs` — no whitespace errors

## Stop If
- The two entrypoints cannot deterministically agree from the same effective settings, any mode has zero/multiple project handlers or multiple compaction owners, or replacing the current project hook loses flat/architecture/every-run behavior.

## Checkpoint
- Recovery snapshot: required for checkpointed auto-discovered `index.ts` and live ~186-line `extensions/project-memory.ts`; capture exact pre-edit content/diff and ownership markers.
- Commit scope: the three `Change` paths only.
