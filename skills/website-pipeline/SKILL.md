---
name: website-pipeline
description: "Production website workflow with strategy intake, designer, optional post-design creative direction on explicit request, content, planner, builder, polish, and validation."
---

# Website Pipeline — Premium Website Workflow

For website projects, the pipeline has a **different order** from the generic `scout → planner → builder` flow. Strategy and content come before implementation planning.

## Pipeline

```txt
Strategy Intake (orchestrator)
  → website-designer
  → [website-creative, optional — explicit creative activation only]
  → seo-content-writer
  → planner
  → builder-design (default UI tier)
  → website-polisher
  → validator
```

| Step | Owner | Produces | Notes |
|------|-------|----------|-------|
| 0 | **Orchestrator** | `.pi/plans/WEBSITE_BRIEF.md` | Ask only the missing strategy/asset questions that materially affect the website. |
| 1 | **website-designer** | `.pi/plans/DESIGN_PLAN.md` | Baseline visual/UX system, trust and conversion hierarchy, tokens, responsive/accessibility rules, asset direction, and Creative Opportunity Map. |
| 1.5 | **website-creative** (optional) | `.pi/plans/CREATIVE_DIRECTION.md` | Only after the designer, on explicit creative activation; emits a mapped additive addendum or `DESIGN_CONFLICT`, never a redesign. |
| 2 | **seo-content-writer** | `.pi/plans/CONTENT_PLAN.md` | Copy, proof framing, meta tags, schema markup. Reads DESIGN_PLAN.md + WEBSITE_BRIEF.md; mechanics remain mediated by design intent. |
| 3 | **planner** | `PLAN_FULL.md` + `SCHEDULE.md` + `TASKS/` | Reads WEBSITE_BRIEF + DESIGN_PLAN + CONTENT_PLAN. Then get user approval. |
| 4 | **builder-design / builder / builder-heavy-design / builder-heavy** | Code implementation | `builder-design` is the default UI tier; reads design/content plus any mapped additive addendum, follows SCHEDULE.md and builder routing rules, and preserves design authority. |
| 5 | **website-polisher** | `.pi/plans/POLISH_PLAN.md` | Premium trust audit + visual refinements + states + a11y; directly audits any optional additive addendum without overriding design/content. |
| 6 | **validator** | Quality gate | Compilation, types, accessibility, no unsupported claims, responsive behavior. |

## Step 0 — Strategy Intake for the Orchestrator

The orchestrator should talk to the user before launching `website-designer` when the briefing is incomplete. This is not a long questionnaire by default: ask the **smallest set of questions** needed to avoid a generic/cheap website.

### Ask These Questions When Missing

Group questions and ask them conversationally. If the user wants speed/autonomy, proceed with labeled assumptions and placeholders.

#### A. Business, Offer, and Positioning
- What does the business/product do in one sentence?
- Who is the ideal customer?
- What problem are they trying to solve when they land on the site?
- What is the premium/trust positioning: luxury, technical authority, calm professionalism, bold category leader, friendly expert, etc.?
- What should visitors believe within the first 5 seconds?

#### B. Conversion Goal and User Journey
- What is the primary CTA? Examples: book a call, buy, start trial, request quote, join waitlist, contact WhatsApp.
- Is there a secondary CTA? Examples: view work, see pricing, read case study.
- What pages are needed? Home only, Services, About, Case Studies, Pricing, Contact, Blog, etc.
- What objections must the site answer before someone converts?

#### C. Trust Proof and Claims
- What proof can be shown? Clients, testimonials, case studies, screenshots, numbers, credentials, certifications, awards, press, guarantees, process, founder story.
- Which claims are verified and safe to publish?
- Which proof is missing and should remain as placeholder?
- Are there legal/compliance constraints around claims, pricing, guarantees, health/finance outcomes, or testimonials?

#### D. Brand Assets and Visual Inputs
- Do you have a logo file, brand guide, colors, fonts, photos, product screenshots, icons, illustrations, video, or references?
- Are there websites/brands you like or dislike? Why?
- Should the site use provided assets only, placeholders, or simple system-generated visuals like CSS shapes/gradients/inline SVG diagrams?

**Important:** AI website agents do not create final logo files, professional photography, or real custom brand illustrations. They can:
- place provided logo/assets;
- specify where assets are needed;
- use a temporary wordmark if no logo exists;
- create simple CSS/inline-SVG diagrams, abstract motifs, and placeholders;
- write clear asset requirements for a human/designer.

They must not present invented logos, fake photography, fake awards, fake testimonials, or fake client marks as real.

#### E. Content Ownership and Client Autonomy
- Who will edit the site after launch?
- What content must be easy to update without a developer? Services, team, testimonials, prices, blog, FAQs, portfolio, locations?
- Is a CMS/admin needed now, or is static content enough?
- What handover/support expectations exist?

#### F. Technical and Operational Constraints
- Existing repo/stack or new project?
- Deployment target?
- Required integrations? Booking, forms, payments, CRM, analytics, newsletter, CMS.
- Language/localization requirements?
- SEO/local SEO requirements?
- Performance/accessibility requirements beyond standard best practice?

### WEBSITE_BRIEF.md Output

When intake is useful, write `.pi/plans/WEBSITE_BRIEF.md` before launching the designer:

```md
# Website Brief: [Project Name]

## 1. Business Snapshot
- Business/product:
- Audience:
- Problem/need:
- Positioning:
- First 5-second belief:

## 2. Conversion Strategy
- Primary CTA:
- Secondary CTA:
- Desired user journey:
- Key objections:

## 3. Trust and Proof Inventory
### Source-backed proof
- ...

### Placeholder-needed proof
- ...

### Claims to avoid until verified
- ...

## 4. Brand and Asset Inventory
### Provided assets
- Logo:
- Colors/fonts:
- Imagery/screenshots:
- References:

### Missing assets / placeholder strategy
- Temporary wordmark:
- CSS/inline-SVG motifs:
- Human asset needs:

## 5. Sitemap and Content Scope
- Pages:
- Sections:
- Editable content needs:

## 6. Technical Constraints
- Stack/repo:
- Integrations:
- CMS/editing:
- Analytics/observability:
- Deployment:

## 7. Assumptions and Open Questions
- Assumptions:
- Open questions:
```

## Optional Post-Design Creative Addendum (`website-creative`)

Activate ONLY when the user **explicitly** asks for a creative, experimental, immersive, editorial, art-directed, unconventional, interaction-led, personality-led, or motion-led site. Do **not** infer creative mode from generic words like "premium", "modern", or "beautiful". Do not add an approval gate and do not re-ask the user. If the request qualifies, run `website-designer` first, then launch `website-creative` with the completed `.pi/plans/DESIGN_PLAN.md`.

Launch prompt for `website-creative`:

```txt
MODE: full
PLAN_ROOT: [absolute full-site plan root]
STRATEGY_BRIEF: [absolute WEBSITE_BRIEF.md path]
DESIGN_ARTIFACT: [absolute <PLAN_ROOT>/DESIGN_PLAN.md path]

Read DESIGN_ARTIFACT first. Load /skill:creative-catalog and /skill:creative-toolkit.
Write exactly:
<PLAN_ROOT>/CREATIVE_DIRECTION.md

Select catalog WHAT first, then toolkit HOW/WHEN. Emit only a mapped additive interaction addendum for existing page/section/component zones, or report `DESIGN_CONFLICT` against a named design anchor. Preserve design/content authority, asset provenance, normal scroll, semantic DOM, keyboard/touch parity, visible focus, responsive behavior, reduced-motion/static fallback, and p75 LCP ≤ 2.5s / INP ≤ 200ms / CLS ≤ 0.1.
```

**What `DESIGN_PLAN.md` owns:** UX, trust/conversion hierarchy, design tokens, layout, content intent, responsive behavior, accessibility, asset direction, and designer-owned baseline motion plus the Creative Opportunity Map.

**What `CREATIVE_DIRECTION.md` owns:** only an optional additive mapped mechanic, its one purpose class per intervention, asset/tool provenance, storyboard, and implementation/review guardrails. It never rewrites design/content authority. A conflicting mechanic is downgraded/rejected or reported as `DESIGN_CONFLICT`.

When creative mode is not activated, the pipeline behaves exactly as before — no `CREATIVE_DIRECTION.md` is produced or expected.

## Premium Website Quality Rubric

Use this checklist throughout design, polish, and validation. Premium means **clearer, calmer, more intentional** — not louder.

### 1. Foundation: Intentional First Impression
- Clear purpose above the fold: what it is, who it is for, why it matters.
- No DIY/template energy: spacing, type, imagery, and hierarchy feel deliberate.
- Immediate trust signals: confident tone, visible proof, visual clarity.

### 2. Assets and Graphics: Purposeful Depth
- Prefer provided assets. If missing, use intentional placeholders or simple CSS/inline-SVG visuals.
- Graphics must guide attention or explain information; no decoration just because.
- No stock/generic icon spam.
- No fake logos, fake client marks, fake awards, fake photography, or invented screenshots.

### 3. Brand Strategy: Professional Foundations
- Logo/wordmark usage is clean and restrained.
- Color palette is cohesive and limited.
- Typography is sophisticated and readable.
- Visual tone matches the business category and buyer psychology.

### 4. Subtle Motion and Interaction
- Motion supports orientation and hierarchy.
- Buttons/links/forms have hover, focus, active, disabled, loading, success, and error states where applicable.
- Respect `prefers-reduced-motion`.
- No distracting gimmicks.

### 5. Strategic Structure, Sitemap, and CTAs
- Pages make sense together.
- Each page has one clear job.
- CTAs are visible, specific, and easy to take.
- No decision paralysis.
- SEO structure works for humans and algorithms.

### 6. Client Autonomy and Longevity
- Identify what the owner must edit.
- Avoid fragile/black-box content when basic edits should be easy.
- Plan for adding pages, updating services, and refreshing proof/content.

### 7. Handover and Post-Launch Care
- Include handover notes when the site has editable content/admin/CMS.
- Clarify what the client can edit vs what requires help.
- Include optional maintenance/support assumptions if relevant.

### 8. Technical Trust Signals
- Fast load, no layout shift, responsive on real breakpoints.
- Accessibility: contrast, headings, labels, focus states, keyboard navigation, touch targets ≥44px.
- Analytics/conversion events for primary CTAs when implementation scope includes them.
- No unsupported factual claims.

## CRITICAL Rules

1. **Planner MUST receive WEBSITE_BRIEF.md when it exists, plus BOTH `DESIGN_PLAN.md` and `CONTENT_PLAN.md`** before generating tasks. When the optional post-design `CREATIVE_DIRECTION.md` exists, the planner receives it as a mapped additive addendum and must not let it override the design artifact.
2. **Do NOT run planner before content is ready** — seo-content-writer must finish first.
3. **website-polisher runs AFTER the selected builder tier**, not before — it refines what's already built.
4. **designer does NOT write final copy** — placeholders only, marked as `[SEO Content Writer — purpose: ...]`.
5. **designer does NOT invent final brand assets** — it may specify placement, requirements, temporary wordmarks, CSS/inline-SVG motifs, and placeholders.
6. **content writer must label proof/claims** as source-backed, inferred, or placeholder-needed.
7. **builder must not turn placeholders into fake facts**.
8. **polisher must audit premium trust**, not only colors/spacing.
9. **website-creative runs only on an explicit creative/experimental/immersive/editorial/art-directed/unconventional/interaction-led/personality-led/motion-led request** — never inferred from generic premium/modern/beautiful wording, never gated behind an extra approval, never asked twice.
10. **When `CREATIVE_DIRECTION.md` exists**: planner, builder, polisher, and validator check its mapped additive mechanics, one-purpose-class interventions, provenance, and fallbacks against `DESIGN_PLAN.md`; none may override design/content authority. The SEO writer continues through `DESIGN_PLAN.md` and does not independently reinterpret mechanics.

## Builder Routing for Website Implementation

Use the Builder Skill routing rules when planner/orchestrator assigns implementation agents:

- `builder-design` is the default child tier for website UI implementation: React/components, layout, CSS/Tailwind, responsive behavior, accessibility states, design-system application, and normal polish-plan execution.
- `builder-heavy-design` is the parent escalation tier for exceptional website design quality: premium visual craft, advanced motion, CSS/SVG/Canvas/3D-feeling visuals, immersive hero sections, distinctive art direction, and visual rescue when `builder-design` is functional but not premium enough.
- `builder` handles normal-risk non-design implementation around the website (tooling, tests, integrations) when visual judgment is not primary.
- `builder-heavy` is **not** the design-quality tier. Use it for backend/logic/math/correctness/integration complexity: shared-file hazards, migrations, auth/payment/security-adjacent flows, subtle state/data correctness, complex tests, and preservation-critical work.
- `builder-design` also handles routine design-system website edits (existing patterns, concrete specs); `builder-light` only for tiny exact mechanical swaps.

For website plans, every task should explain why its selected builder fits the risk: normal UI quality, ultimate visual quality, correctness/integration, or mechanical speed.

## Launch Prompt Additions

### For `website-designer`

Include this in the prompt whenever possible:

```txt
Read .pi/plans/WEBSITE_BRIEF.md if it exists.
Design the baseline system first: UX/trust/conversion hierarchy, tokens, layout, responsive behavior,
accessibility, asset direction, baseline motion, and a Creative Opportunity Map. Do not read or
translate a pre-designer creative direction.
Design for premium trust using the Website Pipeline rubric:
- intentional first impression;
- purposeful assets/graphics;
- restrained brand system;
- subtle motion;
- clear CTA/user journey;
- client autonomy/editability notes;
- no fake logos, fake images, fake client marks, fake testimonials, or unsupported claims.

Assets boundary:
- Use provided assets if available.
- If no logo exists, specify a temporary wordmark and logo placement; do not invent a final logo.
- If no photography/illustration exists, specify placeholders or implementable CSS/inline-SVG visual motifs.
- Mark human asset needs explicitly.
```

### For `seo-content-writer`

Include:

```txt
Read .pi/plans/WEBSITE_BRIEF.md if it exists.
Use the Trust and Proof Inventory.
Do not invent metrics, awards, testimonials, certifications, prices, guarantees, client names, or legal claims.
Label every claim as Source-backed / Inferred / Placeholder needed.
```

### For `website-polisher`

Include:

```txt
In addition to visual polish, run the Premium Website Quality Rubric.
Read .pi/plans/CREATIVE_DIRECTION.md when present as an optional post-design additive addendum.
Verify each mapped intervention against DESIGN_PLAN.md, its purpose class, provenance, and
reduced-motion/mobile/static fallbacks; report DESIGN_CONFLICT instead of overriding the design.
Flag anything that creates DIY/template energy, weak trust, unclear CTA, unsupported claims, inaccessible interactions, or fragile client editability.
Produce exact old_string/new_string fixes when code-level fixes are possible; otherwise note the issue as a strategy/content/asset blocker.
```

## When to Skip Steps

| Situation | Action |
|-----------|--------|
| User already has a complete brief | Skip intake, write or reuse WEBSITE_BRIEF.md from provided context. |
| User wants quick autonomous preview | Use `/skill:website-home-preview` instead of full pipeline. |
| User already has DESIGN_PLAN.md | Skip designer; if creative activation is explicit, run the optional post-design website-creative stage, then start with seo-content-writer. |
| User did not explicitly ask for a creative/experimental/immersive/editorial/art-directed/unconventional/interaction-led/personality-led/motion-led site | Skip website-creative; run the standard pipeline. |
| User already has CREATIVE_DIRECTION.md | Skip website-creative and pass the addendum to planner/builder/polisher/validator; do not send it back as designer intake. |
| User already has both plans | Skip designer + writer. If creative activation is explicit and no CREATIVE_DIRECTION.md exists, run website-creative against DESIGN_PLAN.md before planner; otherwise go straight to planner. |
| Small visual tweak (1 page, <5 components) | Skip planner, use direct builder-design. |
| No design changes, only copy update | Skip designer, update CONTENT_PLAN.md directly. |

## Required Skills Per Step

| Step | Skills to Load |
|------|---------------|
| Strategy Intake | This skill; no agent required. |
| website-creative (optional post-design) | `/skill:creative-catalog` then `/skill:creative-toolkit`; official toolkit URLs only via `jina_read` for shortlisted tools. State the chosen mechanic with its `~/.pi/agent/skills/design-catalog/DESIGN_VOCABULARY.md` term name. |
| website-designer | `/skill:design-catalog` for brand references; owns baseline motion and the Creative Opportunity Map. Reads `~/.pi/agent/skills/design-catalog/DESIGN_VOCABULARY.md` before baseline decisions and records a `## Design Vocabulary Selection` table in DESIGN_PLAN.md. |
| seo-content-writer | Reads WEBSITE_BRIEF.md and DESIGN_PLAN.md. |
| planner | `/skill:website-stack` for tech conventions. Carry the DESIGN_PLAN.md Design Vocabulary Selection terms (exact names, see `~/.pi/agent/skills/design-catalog/DESIGN_VOCABULARY.md`) into builder tasks. |
| builder-design / builder / builder-heavy-design / builder-heavy | `/skill:website-stack` for file structure/components; `/skill:builder` for routing. Design builders implement the named terms per `~/.pi/agent/skills/design-catalog/DESIGN_VOCABULARY.md`. |
| website-polisher | `/skill:design-catalog` for design system consistency; audits against the selected terms in `~/.pi/agent/skills/design-catalog/DESIGN_VOCABULARY.md` ("term X specified, Y implemented"). |
| validator | No skill needed. |
