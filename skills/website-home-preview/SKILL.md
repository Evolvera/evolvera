---
name: website-home-preview
description: Autonomous one-page Home preview workflow with design first, optional post-design creative direction on explicit request, content, planning, static build, polish, screenshots, and validation.
---

# Website Home Preview Skill

Use this skill when the user asks for a website/landing preview, Home Page mockup, or visual direction and wants **one high-quality static `index.html`**, not a full production project.

## Core Idea

The full website pipeline builds a real project. This flow builds only a **premium Home Page preview**.

```txt
Compact Strategy Intake (orchestrator, no approval gate)
  → website-home-designer
  → website-creative (OPTIONAL post-design — only when briefing explicitly requests creative/experimental/immersive/editorial/art-directed/unconventional/interaction-led/personality-led/motion-led direction)
  → seo-content-writer-home (HOME_PREVIEW_MODE)
  → website-home-planner
  → builder-home
  → visual snapshot capture (portrait + landscape)
  → website-polisher-home
  → builder-home applies polish
  → visual snapshot refresh
  → validator-home
  → builder-home fixes only if validator-home blocks
  → visual snapshot refresh
  → validator-home final check
```

No human approval gates between steps. The flow is autonomous from briefing to `index.html` unless the briefing is unusable. If key facts are missing, use labeled assumptions and placeholders rather than interrupting.

## Output Standard

All artifacts live in one predictable directory:

```txt
.pi/previews/<slug>/
├── HOME_CREATIVE_DIRECTION.md  # optional website-creative output
├── HOME_DESIGN_OPTIONS.md
├── HOME_CONTENT_PLAN.md    # seo-content-writer-home output
├── HOME_PLAN.md
├── TASK_builder-home.md
├── index.html
├── screenshots/
│   ├── portrait.png
│   ├── landscape.png
│   └── VISUAL_SNAPSHOT.md
├── HOME_POLISH_PLAN.md     # website-polisher-home output
└── REVIEW.md              # validator-home output if it writes one
```

Final user-visible output:

```txt
.pi/previews/<slug>/index.html
```

## When to Use

Use this flow for:

- “faz uma home preview”
- “quero ver como ficaria o site”
- “gera um index.html bonito”
- “faz uma landing só pra preview”
- “sem projeto completo por enquanto”
- “quero aprovar direção visual/copy antes de construir tudo”

Do **not** use this flow for:

- production-ready Next.js projects;
- multi-page websites;
- real forms/integrations/auth/CMS;
- deploy-ready codebases;
- existing app refactors.

Use `website-pipeline` for full production websites.

## Non-Negotiables

- One Home Page only.
- One final website HTML file only.
- Screenshot files are allowed only as validation artifacts under `.pi/previews/<slug>/screenshots/`.
- No Next.js, React, Tailwind build, shadcn, package manager, or build step.
- No human approval gate (including the optional creative stage).
- The `website-creative` stage is optional and post-design: it runs only on explicit creative/experimental/immersive/editorial/art-directed/unconventional/interaction-led/personality-led/motion-led briefings, after `website-home-designer`; otherwise skip it and the flow is unchanged.
- Do not ask the user to choose a design option; the planner chooses.
- Missing facts become labeled preview placeholders, not blockers.
- Same quality bar as the full website pipeline: premium design, real design references, dedicated conversion copy, responsive layout, accessibility, hover/focus states, and a dedicated `website-polisher-home` pass.
- Do not fake logos, photos, product screenshots, testimonials, client logos, awards, certifications, metrics, prices, guarantees, or legal claims.
- If no brand assets exist, use a temporary text/CSS wordmark plus CSS/semantic-HTML motifs/placeholders and label them as preview placeholders. Never invent SVG markup/path data; inline SVG is allowed only for an exact user/repo-provided asset or an asset actually retrieved from its primary canonical upstream source during this run, with `data-asset-source="https://..."` or `data-asset-source="provided:<path-or-id>"` on every opening `<svg>`. Otherwise use text-only controls or CSS/HTML treatments, never emoji/font glyph substitutes.

## Compact Strategy Intake

Before launching agents, the orchestrator should extract from the user's briefing or infer with labels:

- Business/product in one sentence
- Audience
- Primary CTA
- First 5-second belief
- Visual mood/reference preferences
- Available brand assets: logo, colors, fonts, photos, screenshots, icons, illustrations
- Available proof: testimonials, clients, numbers, credentials, case studies
- Missing assets/proof that must remain placeholders
- Any claims/compliance constraints

Do not ask a long questionnaire for previews. Ask only if there is no usable business/project context.

## Step 1 — Home Designer

Launch `website-home-designer`.

Prompt template:

```txt
Create an autonomous Home Page preview design for this briefing:

[USER BRIEFING]

Requirements:
- Output directory: .pi/previews/<slug>/
- Establish the baseline design first, including the Creative Opportunity Map with existing expressive zones, protected zones, and static-preview-safe base motion language. Do not read a pre-design creative direction; if a later addendum exists, it must map to this artifact.
- Write .pi/previews/<slug>/HOME_DESIGN_OPTIONS.md
- Create exactly 3 high-quality design directions and a recommended direction.
- Use design-catalog references when useful.
- Scope is only one Home Page, not a full site.
- No human approval. Make labeled assumptions if details are missing.
- Design for premium trust: clear first impression, no DIY/template energy, restrained typography/colors, purposeful visuals, clear CTA.
- Design mobile-first, but specify separate portrait/mobile and desktop/landscape composition strategies. Desktop must not be a stretched mobile layout; mobile must not be a cramped desktop layout.
- Asset boundary: use provided assets if available; otherwise specify temporary text/CSS wordmark, CSS/semantic-HTML motifs, and placeholders. Do not invent SVG markup/path data, final logo/images/proof. Inventory every inline SVG candidate with its exact canonical `https://...` source or `provided:<path-or-id>` source and evidence that it was user/repo-provided or retrieved from the primary canonical upstream source during this run; if none qualify, explicitly authorize zero inline SVG assets.
```

Expected output:

```txt
.pi/previews/<slug>/HOME_DESIGN_OPTIONS.md
```

## Step 1.5 — Post-Design Creative Director (Optional)

Run `website-creative` **only** when the user's briefing explicitly requests a creative/experimental/immersive/editorial/art-directed/unconventional/interaction-led/personality-led/motion-led direction. Generic "premium/modern/beautiful" does **not** activate this step. First complete `HOME_DESIGN_OPTIONS.md`; then, with no approval gate, run the optional addendum stage. When skipped, the flow continues exactly as before and no `HOME_CREATIVE_DIRECTION.md` exists.

Prompt template:

```txt
HOME_PREVIEW_MODE
PREVIEW_ROOT: [absolute project path]/.pi/previews/<slug>
USER_BRIEFING: [USER BRIEFING]
DESIGN_ARTIFACT: [absolute <PREVIEW_ROOT>/HOME_DESIGN_OPTIONS.md path]

Read DESIGN_ARTIFACT first. Create a post-design additive creative addendum for a one-page static Home preview. Never ask for approval or clarification in this mode; use labeled assumptions when needed.

Load /skill:creative-catalog and /skill:creative-toolkit and write exactly:
<PREVIEW_ROOT>/HOME_CREATIVE_DIRECTION.md

Select catalog WHAT first, then toolkit HOW/WHEN. Map every proposed intervention to an existing Home page/section/component, exactly one purpose class (orientation | continuity | state feedback | emphasis | narrative), and a user/brand purpose. Preserve the design artifact's hierarchy, tokens, content, layout, accessibility, responsive behavior, asset provenance, normal scroll, and conversion behavior. Report DESIGN_CONFLICT against a named design anchor instead of redesigning.
Home is native-only: use native CSS/HTML/JS or no tool; Motion, GSAP, Three.js, packages, frameworks, and external runtimes are prohibited. Preserve static content, keyboard/touch parity, visible focus, reduced-motion/static fallback, and p75 LCP ≤ 2.5s / INP ≤ 200ms / CLS ≤ 0.1.
You do NOT own: final design options, copy, the plan, or code. No approval gate; make labeled assumptions.
```

Expected output (only when activated):

```txt
.pi/previews/<slug>/HOME_CREATIVE_DIRECTION.md
```

## Step 2 — Home Content Writer

Run the existing `seo-content-writer-home` in Home Preview Mode.

Prompt template:

```txt
HOME_PREVIEW_MODE

Create autonomous Home Page content for this preview.

Read:
- .pi/previews/<slug>/HOME_DESIGN_OPTIONS.md
- User briefing: [USER BRIEFING]

Write:
- .pi/previews/<slug>/HOME_CONTENT_PLAN.md

Rules:
- Use HOME_DESIGN_OPTIONS.md as the sole visual/content-intent source. Do not read HOME_CREATIVE_DIRECTION.md or design effects/interactions; the planner maps that optional post-design addendum after copy is complete.
- Scope is one Home Page preview only.
- No human approval gate; do not ask for approval.
- Fill copy autonomously using source-backed facts, inferred assumptions, and clearly labeled preview placeholders.
- Do not invent metrics, awards, testimonials, client names/logos, certifications, prices, guarantees, legal claims, or product outcomes.
- Include nav labels, section copy, CTA text, microcopy, alt text, FAQ copy when useful, metadata, and schema notes suitable for one static index.html.
- Preserve proof placeholders from HOME_DESIGN_OPTIONS.md instead of turning them into fake facts.
```

Expected output:

```txt
.pi/previews/<slug>/HOME_CONTENT_PLAN.md
```

## Step 3 — Home Planner

Launch `website-home-planner` after design and content artifacts exist.

Prompt template:

```txt
Read .pi/previews/<slug>/HOME_DESIGN_OPTIONS.md and .pi/previews/<slug>/HOME_CONTENT_PLAN.md, then create the autonomous execution plan for a single-file Home Page preview.

Requirements:
- If the optional post-design .pi/previews/<slug>/HOME_CREATIVE_DIRECTION.md exists, read it after HOME_DESIGN_OPTIONS.md and carry only its mapped additive mechanics into HOME_PLAN.md and TASK_builder-home.md. Preserve named design anchors, reduced-motion/static fallback, keyboard/DOM access, mobile/touch behavior, normal scroll, native-only Home constraints, and performance budget; report DESIGN_CONFLICT instead of redesigning.
- Choose or fuse the best design direction without asking the user.
- Use HOME_CONTENT_PLAN.md as the source of truth for copy.
- Write .pi/previews/<slug>/HOME_PLAN.md
- Write .pi/previews/<slug>/TASK_builder-home.md for the dedicated builder-home agent.
- Preserve and operationalize the designer's mobile-first + desktop/landscape strategy.
- Write an Asset Provenance Ledger in HOME_PLAN.md from the designer's canonical asset inventory, using one machine-readable `- data-asset-source: \`<exact source>\`` line per asset, then copy it verbatim into TASK_builder-home.md. Only exact user/repo-provided or primary-canonical-source assets retrieved during this run may be ledger entries. Every allowed `<svg>` must have the ledger's exact `data-asset-source="https://..."` or `data-asset-source="provided:<path-or-id>"`; if no asset qualifies, require zero `<svg>` tags and text/CSS/semantic HTML alternatives.
- Include this validation command in TASK_builder-home.md: `node /Users/j.henrique/.pi/agent/skills/website-home-preview/scripts/validate-home-asset-provenance.mjs .pi/previews/<slug>/index.html`
- The builder output must be exactly .pi/previews/<slug>/index.html
- No full project, no package.json, no framework, no build step.
```

Expected outputs:

```txt
.pi/previews/<slug>/HOME_PLAN.md
.pi/previews/<slug>/TASK_builder-home.md
```

## Step 4 — Builder Home Executes Planner Task

Use only the dedicated `builder-home` agent for the Home Preview build step. Its job is not to redesign the page or choose a new direction; it follows `.pi/previews/<slug>/HOME_PLAN.md` and `.pi/previews/<slug>/TASK_builder-home.md` exactly and produces the single static `index.html`.

Prompt template:

```txt
Implement the task in .pi/previews/<slug>/TASK_builder-home.md.

Hard constraints:
- Create or replace only .pi/previews/<slug>/index.html
- Do not create a project or any extra files.
- Follow HOME_PLAN.md, TASK_builder-home.md, HOME_CONTENT_PLAN.md, and HOME_DESIGN_OPTIONS.md exactly (plus the optional post-design HOME_CREATIVE_DIRECTION.md addendum if present).
- Do not choose a new design direction; implement the planner's selected/fused direction and only the addendum's mapped mechanics in named existing zones.
- Preserve the design artifact's hierarchy, tokens, content, layout, accessibility, normal scroll, keyboard/touch parity, visible focus, reduced-motion/static fallback, and native-only Home boundary; do not resolve a DESIGN_CONFLICT by redesigning.
- Use only inline SVG assets copied into TASK_builder-home.md's Asset Provenance Ledger. Never invent SVG markup/path data; every allowed `<svg>` needs its exact ledger `data-asset-source`. If the ledger authorizes none, emit zero `<svg>` tags and use text/CSS/semantic HTML alternatives, never emoji/font glyph substitutes.
- Run the validation commands listed in TASK_builder-home.md, including `node /Users/j.henrique/.pi/agent/skills/website-home-preview/scripts/validate-home-asset-provenance.mjs .pi/previews/<slug>/index.html`.
```

Expected output:

```txt
.pi/previews/<slug>/index.html
```

## Step 5 — Visual Snapshot Capture

Capture screenshots in both portrait and landscape so agents can evaluate the page visually, not only from code.

Run from the repository root:

```bash
node /Users/j.henrique/.pi/agent/skills/website-home-preview/scripts/capture-home-screenshots.mjs \
  .pi/previews/<slug>/index.html \
  .pi/previews/<slug>/screenshots
```

Expected outputs:

```txt
.pi/previews/<slug>/screenshots/portrait.png     # 390x844 viewport, full page
.pi/previews/<slug>/screenshots/landscape.png    # 1440x900 viewport, full page
.pi/previews/<slug>/screenshots/VISUAL_SNAPSHOT.md
```

If Playwright/Chromium is unavailable, the script tries to install Chromium once through `npx playwright install chromium`. If screenshot capture still fails, keep going only if the user asked for best-effort preview; otherwise stop with a clear browser/sandbox blocker.

## Step 6 — Website Polisher

Run the existing `website-polisher-home` in Home Preview Mode.

Prompt template:

```txt
HOME_PREVIEW_MODE

Audit the static Home preview at .pi/previews/<slug>/index.html.

Read:
- .pi/previews/<slug>/HOME_DESIGN_OPTIONS.md
- .pi/previews/<slug>/HOME_CREATIVE_DIRECTION.md if present
- .pi/previews/<slug>/HOME_CONTENT_PLAN.md
- .pi/previews/<slug>/HOME_PLAN.md
- .pi/previews/<slug>/index.html
- .pi/previews/<slug>/screenshots/VISUAL_SNAPSHOT.md if present
- .pi/previews/<slug>/screenshots/portrait.png if image reading is supported
- .pi/previews/<slug>/screenshots/landscape.png if image reading is supported

Write:
- .pi/previews/<slug>/HOME_POLISH_PLAN.md

Rules:
- READ-ONLY: do not edit index.html.
- Audit only .pi/previews/<slug>/index.html.
- Do not require Next.js, Tailwind config, app/layout, components, or project structure.
- Produce exact old_string/new_string fixes targeting only .pi/previews/<slug>/index.html.
- Focus on premium trust and visual quality: intentional first impression, no DIY/template energy, clear CTA, proof/claim integrity, purposeful assets, hierarchy, spacing, rhythm, typography, colors, shadows, gradients, mobile-first responsive behavior, distinct desktop/landscape composition, image/visual containment, empty-space balance, hover/focus states, accessibility, reduced motion, touch targets, and portrait/landscape screenshot issues.
- Read HOME_CREATIVE_DIRECTION.md directly when present as an optional post-design addendum. Audit each mapped intervention against HOME_DESIGN_OPTIONS.md, HOME_PLAN.md, its single purpose class, provenance, native-only boundary, and fallback; report DESIGN_CONFLICT rather than overriding design authority.
- Never propose fabricated SVG markup/path data. Only propose inline SVG changes authorized by HOME_PLAN.md's Asset Provenance Ledger, preserving the exact `data-asset-source`; otherwise propose text/CSS/semantic HTML fixes, never emoji/font glyph substitutes.
```

Expected output:

```txt
.pi/previews/<slug>/HOME_POLISH_PLAN.md
```

## Step 7 — Builder Home Applies Polish

Run `builder-home` once to apply the polish plan.

Prompt template:

```txt
Apply the polish fixes from .pi/previews/<slug>/HOME_POLISH_PLAN.md.

Hard constraints:
- Modify only .pi/previews/<slug>/index.html
- Create no other files except the validation screenshots under .pi/previews/<slug>/screenshots/ refreshed below.
- Apply only fixes with exact old_string/new_string replacements, or equivalent minimal edits if exact strings drifted.
- Preserve the original HOME_PLAN.md and HOME_CONTENT_PLAN.md intent.
- Re-run the validation commands from .pi/previews/<slug>/TASK_builder-home.md after changes, including `node /Users/j.henrique/.pi/agent/skills/website-home-preview/scripts/validate-home-asset-provenance.mjs .pi/previews/<slug>/index.html`.
- Preserve Asset Provenance Ledger restrictions: do not invent SVG markup/path data; use only its exact source-backed inline SVG assets or text/CSS/semantic HTML alternatives.
- Refresh screenshots after polish using the Visual Snapshot Capture command above.
```

## Step 8 — Validator

Use the existing `validator-home` with static-preview scope.

Prompt template:

```txt
Validate the static Home preview at .pi/previews/<slug>/index.html.

Read:
- .pi/previews/<slug>/HOME_DESIGN_OPTIONS.md
- .pi/previews/<slug>/HOME_CREATIVE_DIRECTION.md if present
- .pi/previews/<slug>/HOME_CONTENT_PLAN.md
- .pi/previews/<slug>/HOME_PLAN.md
- .pi/previews/<slug>/HOME_POLISH_PLAN.md
- .pi/previews/<slug>/index.html
- .pi/previews/<slug>/screenshots/VISUAL_SNAPSHOT.md
- .pi/previews/<slug>/screenshots/portrait.png
- .pi/previews/<slug>/screenshots/landscape.png

Validate:
- exactly one index.html output, no extra project files required;
- semantic HTML structure;
- inline CSS present;
- `node /Users/j.henrique/.pi/agent/skills/website-home-preview/scripts/validate-home-asset-provenance.mjs .pi/previews/<slug>/index.html` passes; every inline SVG is authorized by HOME_PLAN.md's Asset Provenance Ledger with valid, traceable `data-asset-source`, and no `data:image/svg+xml` exists;
- responsive layout rules;
- accessible landmarks/headings/buttons/links;
- visible focus states;
- reduced-motion handling;
- polish plan was applied or explicitly justified;
- no fake unsupported factual claims presented as facts;
- no fake logos/photos/product screenshots/client marks/testimonials/awards/metrics presented as real;
- clear first impression and primary CTA;
- portrait screenshot has no horizontal/lateral scroll, no content wider than the viewport, no clipped/off-canvas cards/logos/visuals, no grids continuing past the right edge, no squeezed tiny mobile card grids, no accidental blank gutters inside image/media frames, unreadable text, broken stacking, hidden primary CTA, broken CTA icons, or inaccessible tap targets;
- landscape screenshot uses space intentionally and does not look sparse, stretched, generic, misaligned, or full of empty/dead space;
- images, mockups, card stacks, decorative motifs, and placeholders stay inside intended containers at both portrait and landscape sizes;
- image/media frames fill, crop, center, or contain deliberately; no asset should sit to one side leaving an accidental white/blank area inside the frame;
- CTA icons are omitted/text-only unless an exact ledger-authorized source-backed inline SVG is used with valid `data-asset-source`; no emoji/tofu/missing/corrupted glyphs;
- mobile and desktop feel intentionally designed for their viewports while sharing the same brand system;
- mobile layouts stack cards/logos/galleries when needed; never preserve a desktop grid if it creates cramped cards or lateral scroll;
- visual/content alignment with HOME_PLAN.md and HOME_CONTENT_PLAN.md;
- when HOME_CREATIVE_DIRECTION.md exists: the mapped additive creative intent (dominant mechanic + accents) is present in named design zones, each intervention has one purpose class, and a usable reduced-motion/static fallback works without changing design authority.

If you write a report, write .pi/previews/<slug>/REVIEW.md.
Return PASS, CONDITIONAL, or REJECT with concrete fixes.
```

## Step 9 — Autonomous Fix Loop

If validator-home returns:

| Verdict | Action |
|---|---|
| PASS | Stop and report the preview path. |
| CONDITIONAL | Run `builder-home` once with validator-home fixes, refresh screenshots, then validate again. |
| REJECT | Run `builder-home` once if fixes are concrete and within `index.html`; refresh screenshots, then validate again. Otherwise stop blocked with reason. |

Maximum fix attempts: **1**. After one failed fix attempt, stop and report the blocker.

## Final Response Format

```txt
Home preview created: .pi/previews/<slug>/index.html
Artifacts:
- HOME_CREATIVE_DIRECTION.md if generated
- HOME_DESIGN_OPTIONS.md
- HOME_CONTENT_PLAN.md
- HOME_PLAN.md
- TASK_builder-home.md
- HOME_POLISH_PLAN.md
- screenshots/portrait.png
- screenshots/landscape.png
- screenshots/VISUAL_SNAPSHOT.md
- REVIEW.md if generated
Validation: PASS/CONDITIONAL/REJECT
Notes: [only important assumptions or blockers]
```
