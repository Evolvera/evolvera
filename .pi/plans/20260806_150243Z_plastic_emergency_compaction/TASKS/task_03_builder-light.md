# Task 03: Render transient emergency memories through the existing bounded session index

**Agent**: builder-light  
**Why**: Emergency observations/reflections need actionable IDs in the summary before their records are appended to the host branch.  
**Goal**: The session summary renderer can merge a validated transient overlay while preserving all existing ordering, guidance, scrubbing, and size behavior.

## Read

- `extensions/plastic-memory/session/render-summary.ts` — current folded-ledger index, guidance text, ordering, and bounds.
- `extensions/plastic-memory/session/ledger.ts` — folded observation/reflection ordering and tombstone behavior.
- `extensions/plastic-memory/session/types.ts` — existing observation/reflection shapes.
- `extensions/test/plastic-memory-session.smoke.mjs` — current session summary behavior.
- `extensions/test/plastic-memory-compaction.smoke.mjs` — summary guidance and ID assertions.

## Change

- `extensions/plastic-memory/session/render-summary.ts` — MODIFY — add an optional in-memory overlay of already validated observations/reflections and render it through the same row builders, recency ordering, caps, and scrubbers; no overlay must preserve existing output.
- `extensions/test/plastic-memory-emergency-summary.smoke.mjs` — CREATE — deterministic merge, bounds, scrubbing, deduplication, and no-overlay compatibility coverage.

## Proof

- **Semantic delta and anchors**: `renderSessionSummary` currently gets rows only from `foldLedger`, but emergency semantic records are intentionally not appended until the whole pipeline succeeds. The row formatting and `memory_recall` guidance already satisfy the desired public format.
- **Coverage receipt**: searched session summary imports/call sites and compaction tests for `renderSessionSummary` and the guidance string. **AFFECTED**: `render-summary.ts` and the new overlay smoke. **UNAFFECTED**: `ledger.ts` remains the persisted-state source, `types.ts` already defines the overlay values, `render.ts` already accepts the finished index string, and recall/persistence do not participate in rendering. No duplicate summary template was found.
- **Closure**: transient semantic values → bounded index text is entirely owned here. Persistence, source validation, model calls, cycle state, and recall behavior do not need modification for this local renderer seam.
- **Checkpoint**: after this task alone, every existing call omits the overlay and must render exactly as before; the new overload/helper is independently exercised.
- **Acceptance path**: CHANGE is observed as exact `pm:o:`/`pm:r:` rows from explicit fixture values. PRESERVE is a byte-equality comparison between legacy no-overlay calls and the established output, plus existing session/compaction smokes.
- **Counterexample pass**: a temporary fake ledger record is detectable because the test supplies no entry ID/parent; a separate renderer is detectable because guidance/order/caps must match existing output exactly.

## Acceptance

- [ ] An empty/omitted overlay produces byte-identical output to the existing renderer.
- [ ] Valid transient observations/reflections appear with exact public IDs and the existing `memory_recall` guidance.
- [ ] Existing branch rows and overlay rows are deduplicated by ID and ordered newest-first within their sections.
- [ ] Dropped branch observations remain excluded and the overlay cannot revive an existing tombstone.
- [ ] Section/row/total caps and sensitive-text scrubbing apply to overlay content exactly as to folded content.
- [ ] No ledger entry, cycle, binding, or persisted record is fabricated by the rendering API.

## Constraints

- Reuse existing `reflectionLine`, `observationLine`, `section`, and guidance text rather than copying a second template.
- Accept only typed, already validated semantic values; ordinary validation remains in observer/reflector code.

## NOT TO DO

- Do not append records, read files, change recall/search, alter summary guidance, or introduce a second summary format.
- Do not change IDs, citations, timestamps, relevance, or content beyond existing bounded scrubbing.
- Do not alter schemas, settings, dependencies, or files outside the two-path write set.
- Do not weaken existing cap or sensitive-text assertions.

## Validation

- `node extensions/test/plastic-memory-emergency-summary.smoke.mjs` — overlay merge, dedupe, ordering, bounds, scrubbing, and no-overlay compatibility pass.
- `node extensions/test/plastic-memory-session.smoke.mjs` — existing session fold/index behavior passes.
- `node extensions/test/plastic-memory-compaction.smoke.mjs` — existing compaction summary guidance and IDs pass.

## Stop If

- Rendering an overlay would require persisting a temporary record or changing the public summary format.

## Checkpoint

- Recovery snapshot: required — snapshot `extensions/plastic-memory/session/render-summary.ts` under `.pi/build/recovery/task_03/` before editing; exclude it from the product commit.
- Commit scope: only `extensions/plastic-memory/session/render-summary.ts` and `extensions/test/plastic-memory-emergency-summary.smoke.mjs`.
