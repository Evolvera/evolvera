---
name: website-home-preview
description: Autonomous high-quality website Home preview flow. Use when the user wants a premium one-page Home preview as a single static index.html, not a full production website/project. Reuses seo-content-writer, builder-home, website-polisher, and validator with no human approval gates.
---

# Website Home Preview Skill

Use this skill when the user asks for a website/landing preview, Home Page mockup, or visual direction and wants **one high-quality static `index.html`**, not a full production project.

## Core Idea

The full website pipeline builds a real project. This flow builds only a **premium Home Page preview**.

```txt
Compact Strategy Intake (orchestrator, no approval gate)
  → website-home-designer
  → seo-content-writer (HOME_PREVIEW_MODE)
  → website-home-planner
  → builder-home
  → visual snapshot capture (portrait + landscape)
  → website-polisher
  → builder-home applies polish
  → visual snapshot refresh
  → validator
  → builder-home fixes only if validator blocks
  → visual snapshot refresh
  → validator final check
```

No human approval gates between steps. The flow is autonomous from briefing to `index.html` unless the briefing is unusable. If key facts are missing, use labeled assumptions and placeholders rather than interrupting.

## Output Standard

All artifacts live in one predictable directory:

```txt
.pi/previews/<slug>/
├── HOME_DESIGN_OPTIONS.md
├── HOME_CONTENT_PLAN.md    # seo-content-writer output
├── HOME_PLAN.md
├── TASK_builder-home.md
├── index.html
├── screenshots/
│   ├── portrait.png
│   ├── landscape.png
│   └── VISUAL_SNAPSHOT.md
├── HOME_POLISH_PLAN.md     # website-polisher output
└── REVIEW.md              # validator output if it writes one
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
- No human approval gate.
- Do not ask the user to choose a design option; the planner chooses.
- Missing facts become labeled preview placeholders, not blockers.
- Same quality bar as the full website pipeline: premium design, real design references, dedicated conversion copy, responsive layout, accessibility, hover/focus states, and a dedicated `website-polisher` pass.
- Do not fake logos, photos, product screenshots, testimonials, client logos, awards, certifications, metrics, prices, guarantees, or legal claims.
- If no brand assets exist, use a temporary wordmark plus CSS/inline-SVG motifs/placeholders and label them as preview placeholders.

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
- Write .pi/previews/<slug>/HOME_DESIGN_OPTIONS.md
- Create exactly 3 high-quality design directions and a recommended direction.
- Use design-catalog references when useful.
- Scope is only one Home Page, not a full site.
- No human approval. Make labeled assumptions if details are missing.
- Design for premium trust: clear first impression, no DIY/template energy, restrained typography/colors, purposeful visuals, clear CTA.
- Asset boundary: use provided assets if available; otherwise specify temporary wordmark, CSS/inline-SVG motifs, and placeholders. Do not invent final logo/images/proof.
```

Expected output:

```txt
.pi/previews/<slug>/HOME_DESIGN_OPTIONS.md
```

## Step 2 — Home Content Writer

Run the existing `seo-content-writer` in Home Preview Mode.

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
- Choose or fuse the best design direction without asking the user.
- Use HOME_CONTENT_PLAN.md as the source of truth for copy.
- Write .pi/previews/<slug>/HOME_PLAN.md
- Write .pi/previews/<slug>/TASK_builder-home.md for the dedicated builder-home agent.
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
- Follow HOME_PLAN.md, TASK_builder-home.md, HOME_CONTENT_PLAN.md, and HOME_DESIGN_OPTIONS.md exactly.
- Do not choose a new design direction; implement the planner's selected/fused direction.
- Run the validation commands listed in TASK_builder-home.md.
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

Run the existing `website-polisher` in Home Preview Mode.

Prompt template:

```txt
HOME_PREVIEW_MODE

Audit the static Home preview at .pi/previews/<slug>/index.html.

Read:
- .pi/previews/<slug>/HOME_DESIGN_OPTIONS.md
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
- Focus on premium trust and visual quality: intentional first impression, no DIY/template energy, clear CTA, proof/claim integrity, purposeful assets, hierarchy, spacing, rhythm, typography, colors, shadows, gradients, responsive behavior, hover/focus states, accessibility, reduced motion, touch targets, and portrait/landscape screenshot issues.
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
- Do not create any extra files.
- Apply only fixes with exact old_string/new_string replacements, or equivalent minimal edits if exact strings drifted.
- Preserve the original HOME_PLAN.md and HOME_CONTENT_PLAN.md intent.
- Re-run the validation commands from .pi/previews/<slug>/TASK_builder-home.md after changes.
- Refresh screenshots after polish using the Visual Snapshot Capture command above.
```

## Step 8 — Validator

Use the existing `validator` with static-preview scope.

Prompt template:

```txt
Validate the static Home preview at .pi/previews/<slug>/index.html.

Read:
- .pi/previews/<slug>/HOME_DESIGN_OPTIONS.md
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
- responsive layout rules;
- accessible landmarks/headings/buttons/links;
- visible focus states;
- reduced-motion handling;
- polish plan was applied or explicitly justified;
- no fake unsupported factual claims presented as facts;
- no fake logos/photos/product screenshots/client marks/testimonials/awards/metrics presented as real;
- clear first impression and primary CTA;
- portrait screenshot has no horizontal scroll, clipped content, unreadable text, broken stacking, or inaccessible tap targets;
- landscape screenshot uses space intentionally and does not look sparse, stretched, or misaligned;
- visual/content alignment with HOME_PLAN.md and HOME_CONTENT_PLAN.md.

If you write a report, write .pi/previews/<slug>/REVIEW.md.
Return PASS, CONDITIONAL, or REJECT with concrete fixes.
```

## Step 9 — Autonomous Fix Loop

If validator returns:

| Verdict | Action |
|---|---|
| PASS | Stop and report the preview path. |
| CONDITIONAL | Run `builder-home` once with validator fixes, refresh screenshots, then validate again. |
| REJECT | Run `builder-home` once if fixes are concrete and within `index.html`; refresh screenshots, then validate again. Otherwise stop blocked with reason. |

Maximum fix attempts: **1**. After one failed fix attempt, stop and report the blocker.

## Final Response Format

```txt
Home preview created: .pi/previews/<slug>/index.html
Artifacts:
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
