# Designer-First Creative Interaction Pipeline

**Generated**: 2026-07-22  
**Complexity**: High  
**Estimated tasks**: 2  
**Risk**: Medium

## Outcome

Change the global PI website harness—not any website implementation—so both production and Home Preview establish the complete baseline design first, then optionally run `website-creative` as an additive interaction director. Preserve the compatible artifact names `CREATIVE_DIRECTION.md` and `HOME_CREATIVE_DIRECTION.md`, explicit-only activation, existing downstream website safeguards, and the no-creative journey.

The finished flow is:

- Production: strategy intake → `website-designer` → optional `website-creative` → `seo-content-writer` → planner → builder → polisher → validator.
- Home Preview: compact intake → `website-home-designer` → optional `website-creative` → `seo-content-writer-home` → `website-home-planner` → `builder-home` → existing snapshot/polish/validation loop.

## Scope and Decisions

### In scope

- Add `skills/creative-toolkit/` as an index-first HOW/WHEN selector with five conservative tool profiles and no dependency code.
- Keep `skills/creative-catalog/` as the index-first WHAT selector and make `website-creative` its primary runtime consumer without rewriting its 12 pattern files.
- Correct `skills/website-stack/SKILL.md` from stale `framer-motion` wording to the current `motion` package and `motion/react` import, while making animation dependency use conditional rather than automatic.
- Reorder all authoritative production/Home workflow descriptions and launch prompts.
- Make both designers own hierarchy, tokens, components/states, responsive/accessibility behavior, asset direction, baseline motion, and a Creative Opportunity Map.
- Redefine the existing creative artifacts as additive post-design addenda mapped to existing pages/sections/components and purpose classes.
- Carry the optional addendum to planner/builders/polishers/validators while keeping content writers dependent on the design artifact rather than requiring them to reinterpret mechanics.

### Out of scope

- Implementing animation or adding packages to a website.
- Buying, copying, or assuming Motion+.
- Changing creative artifact filenames.
- Rewriting the 12 `creative-catalog/patterns/*.md` files absent an exact stale-contract finding.
- Installer changes, generic builder/validator rewrites, website source, dependency manifests, or unrelated cleanup.
- Resolving unverified Three.js installation/licensing facts by inference.

### Material decisions and rationale

- **CHANGE — stage order and authority:** design precedes optional creative direction because interaction choices depend on established hierarchy, components/states, responsive rules, accessibility, assets, and baseline motion.
- **CHANGE — creative artifact semantics:** retain filenames for compatibility, but the artifacts become additive intervention addenda. Every intervention must name an existing design anchor and one of `orientation | continuity | state feedback | emphasis | narrative`; decoration-only work is rejected.
- **PRESERVE — activation:** only explicit creative/experimental/immersive/editorial/art-directed/unconventional/interaction-led/personality/motion requests activate the optional stage. Generic premium/modern/beautiful remains insufficient.
- **PRESERVE — skipped journey:** without activation, the revised designer artifact alone is sufficient and all later stages continue as before.
- **PRESERVE — downstream safety:** normal scroll, semantic DOM order, keyboard/touch parity, visible focus, conventional links/forms/CTAs, static content, progressive enhancement, asset provenance, screenshots, fix loops, no-fake-proof rules, and p75 CWV thresholds remain authoritative.
- **PRESERVE — catalog data:** the 12 pattern profiles and `creative-index.json` remain unchanged because focused evidence found no exact stale per-pattern contract.
- **CHANGE — tool choice:** no JavaScript animation runtime is a valid default. Native CSS/platform comes first; Motion core, View Transitions, GSAP/ScrollTrigger, and Three.js are progressively more conditional. One primary JavaScript runtime is the default maximum; Motion and GSAP never implement the same mechanic.
- **PRESERVE UNKNOWN:** licensing/payment fields not verified from official sources and Three.js install/import remain `UNKNOWN`/partial rather than guessed.

## Evidence Baseline

### KNOWN

- `SYSTEM.md` and `config/SYSTEM.md` are synchronized 110-line copies and currently describe creative before designer.
- `skills/website-pipeline/SKILL.md` (321 lines) and `skills/website-home-preview/SKILL.md` (410 lines) currently launch creative before the respective designer and contain the authoritative downstream prompts.
- `agents/website-designer.md` and `agents/website-home-designer.md` currently read and translate the creative artifact; that ownership must be inverted.
- `agents/website-home-planner.md` and both workflow skills already carry the optional creative artifact downstream.
- `agents/website-polisher.md` does not currently list the creative artifact among its direct inputs, although the production workflow caller supplies an extra creative check.
- `agents/builder-home.md`, `agents/website-polisher-home.md`, and `agents/validator-home.md` have no stale pre-designer claim. Their caller-created plans/prompts already supply the optional artifact, so they remain valid without edits.
- `skills/creative-catalog/SKILL.md` is index-first, has 12 indexed patterns, and names `website-creative` as primary consumer, but its activation/description still permits broader before/during-design consumption.
- `skills/website-stack/SKILL.md` contains the stale package/install terminology.
- `install.sh:58-62` discovers top-level skill directories and recursively copies their contents with `cp -r`; no installer edit is required.
- `extensions/pi-tool-expert-helper.ts` exposes `pi_validate_skill` and `pi_env_inspect`; these provide deterministic skill/discovery checks.

### INFERRED

- One foundation checkpoint followed by one synchronized harness checkpoint is the smallest decomposition that keeps every commit valid: an unused new skill is harmless, while partial stage-order edits would create contradictory producer/consumer contracts.
- Generic planner/builders/validator remain valid because the workflow and generated task contracts pass them the complete artifacts; globally specializing those agents would broaden scope.

### UNKNOWN / TO VERIFY

- **External bounded unknown:** Three.js exact install/import and licensing remain `UNKNOWN`; its profile must be marked partially verified with the 2026-07-18 verification date and stop instead of recommending exact dependency/API claims.
- **External bounded unknown:** Motion/GSAP/Three licensing/payment remains `UNKNOWN` unless an official source is successfully retrieved during implementation. Motion+ alone is known paid/proprietary and unauthorized by default.
- Before editing, the builder must recheck that task-owned files remain clean; the handoff reports them clean, but unrelated repository state may have changed since planning.

## Repository-State and Recovery Baseline

- Repository: `/Users/j.henrique/.pi/agent`, branch `main`.
- Handoff reports all target files clean.
- Unrelated dirty/untracked material under `docs/patch-notes`, `.pi/build/recovery/site-tests`, backup JSON files, and `trust.json` is explicitly excluded. Never edit, snapshot, stage, format, or commit it.
- No active checkpoint exists for this plan.
- Task 01 relies on its selective git checkpoint because its only existing-file edits are small bounded skill files.
- Task 02 requires a pre-edit recovery snapshot because it synchronizes two duplicate system files and patches two large, preservation-critical workflow skills.

## Shared/Large-File Hazards

| File | Size | Hazard / preservation markers | Mitigation |
|---|---:|---|---|
| `SYSTEM.md` | 110 lines | Global routing source; must remain synchronized with `config/SYSTEM.md`; preserve all non-website routing/safety text. | Patch only the production/Home website routing sentence; validate with `cmp`; snapshot before edit. |
| `config/SYSTEM.md` | 110 lines | Installed/configured duplicate of `SYSTEM.md`. | Apply the same bounded change in the same task/checkpoint; `cmp -s SYSTEM.md config/SYSTEM.md`. |
| `skills/website-pipeline/SKILL.md` | 321 lines | Authoritative production stage table, launch prompts, skip rules, downstream handoffs, quality rubric. | Patch pipeline/order, creative/designer contracts, skip table, and required-skill rows only; preserve intake, trust, content, routing, asset, and no-fake-proof sections; snapshot. |
| `skills/website-home-preview/SKILL.md` | 410 lines | Authoritative static-preview constraints and snapshot/polish/fix/validation loop. | Patch order and artifact semantics only; preserve one-file/no-package restriction, provenance script, screenshot loop, and one-attempt fix policy; snapshot. |
| `agents/website-designer.md` | 213 lines | Production design artifact schema consumed by writer/planner. | Replace creative intake/translation with a concrete Creative Opportunity Map while preserving all existing design sections and content/asset boundaries. |
| `agents/website-home-designer.md` | 203 lines | Home design-options schema and static constraints. | Remove pre-read semantics and add the map without changing three-option output, provenance, or one-file constraints. |
| `agents/website-home-planner.md` | 236 lines | Generates both Home plan and builder task. | Reword direct creative input as an additive post-design addendum; preserve asset ledger and validation commands. |

Parallel writes are intentionally avoided: the global stage contract, duplicated system files, and shared agent semantics must move atomically after the toolkit foundation exists.

## Scenarios and Failure Behavior

1. **Production, creative activated:** designer emits `DESIGN_PLAN.md` with opportunity/protected zones and baseline motion; creative reads it plus brief/catalog/toolkit, emits mapped additive `CREATIVE_DIRECTION.md`; writer reads design intent; planner and implementation/review stages receive the addendum.
2. **Production, creative skipped:** designer still emits baseline motion/opportunity mapping; no creative artifact is required; writer and all later stages behave as before.
3. **Home Preview, creative activated:** home designer emits `HOME_DESIGN_OPTIONS.md`; creative may select only native CSS/HTML/JS capabilities compatible with one self-contained `index.html`; no package recommendation is allowed.
4. **Design conflict:** if a mechanic requires hierarchy, token, copy, layout, accessibility, or conversion changes, creative downgrades/rejects it or records `DESIGN_CONFLICT`; it never overrides design.
5. **Reduced motion / unsupported runtime:** scroll-linked, parallax, large transform/layout, and autoplay motion are removed or replaced by a composed static/opacity state; content/actions remain present.
6. **Tool evidence unavailable:** record the exact claim as `UNKNOWN`; downstream planner/builder must reverify package/import/version before any dependency mutation.
7. **Decorative-only proposal or repeated slop:** reject it. No global repeated fade-up/stagger, gratuitous parallax/cursor/magnetic/gradient motion, hover-only content, drag-only operation, scroll hijacking, wheel/swipe interception, or motion-gated CTA/forms/navigation/proof.

## Risks and Mitigations

- **Contradictory order across duplicated prompts:** centralize all existing order/authority edits in Task 02 and assert structural order across exact files.
- **Creative agent silently redesigns:** require existing-anchor mapping, purpose class, protected zones, immutable designer ownership, and explicit `DESIGN_CONFLICT` behavior in both the agent and caller prompts.
- **Tool catalog turns into dependency recommendation:** keep profiles declarative, no code/manifests, conservative ladder, exact stop rules, one-runtime rule, and package re-verification gate.
- **Home flow recommends production packages:** enforce `HOME_PREVIEW_MODE` native-only behavior in the workflow, creative agent, toolkit, and structural validation.
- **Motion naming fixed but vendor claims overpromised:** distinguish official capability statements from measured target-runtime evidence; exact bundle/performance remains a builder measurement.
- **Unrelated dirty files enter commits:** use exact owned-file staging and focused status/diff checks at each checkpoint.

## Implementation Order

1. Establish the standalone creative tool-selection skill, tighten catalog consumption, and correct Motion stack guidance. Validate recursive discovery/copy and machine-readable profile closure.
2. Atomically invert production/Home stage order and authority across system copies, workflow skills, and affected agent contracts. Validate both activated and skipped journeys structurally.

## Validation Strategy

These are declarative harness changes with no runtime website journey. Completion therefore uses deterministic structural oracles:

- `pi_validate_skill` on every created/modified skill.
- JSON parsing plus assertions for five unique tool records, mandatory fields, profile existence, statuses, official URLs, UNKNOWN licensing/payment, Motion+ restriction, and Three.js partial status.
- `pi_env_inspect` discovery and a temporary recursive-copy simulation matching `install.sh` behavior.
- Focused assertions for exact stage order, producer/consumer order, unchanged artifact filenames, designer authority and opportunity maps, additive anchor/purpose/conflict contract, explicit activation, Home native-only prohibition, anti-slop/reduced-motion/CWV guards, and current Motion package/import.
- Focused negative grep for stale pre-designer language and stale `framer-motion` install/import wording in approved website/creative sources.
- `cmp` for the paired system files and focused diff/status review proving only approved task-owned files enter each checkpoint.
