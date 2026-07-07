---
name: website-pipeline
description: Website project orchestration pipeline. Use when the user asks to build, design, or modify a website. Defines strategy intake, premium website quality gates, and the correct agent order: designer, content writer, planner, builder, polisher, validator.
---

# Website Pipeline — Premium Website Workflow

For website projects, the pipeline has a **different order** from the generic `scout → planner → builder` flow. Strategy and content come before implementation planning.

## Pipeline

```txt
Strategy Intake (orchestrator)
  → website-designer
  → seo-content-writer
  → planner
  → builder
  → website-polisher
  → validator
```

| Step | Owner | Produces | Notes |
|------|-------|----------|-------|
| 0 | **Orchestrator** | `.pi/plans/WEBSITE_BRIEF.md` | Ask only the missing strategy/asset questions that materially affect the website. |
| 1 | **website-designer** | `.pi/plans/DESIGN_PLAN.md` | Visual spec, trust hierarchy, design tokens, UX hierarchy, animations, asset placeholders. |
| 2 | **seo-content-writer** | `.pi/plans/CONTENT_PLAN.md` | Copy, proof framing, meta tags, schema markup. Reads DESIGN_PLAN.md + WEBSITE_BRIEF.md. |
| 3 | **planner** | `PLAN_FULL.md` + `SCHEDULE.md` + `TASKS/` | Reads WEBSITE_BRIEF + DESIGN_PLAN + CONTENT_PLAN. Then get user approval. |
| 4 | **builder / builder-heavy-design / builder-heavy** | Code implementation | Follows SCHEDULE.md and builder routing rules. |
| 5 | **website-polisher** | `.pi/plans/POLISH_PLAN.md` | Premium trust audit + visual refinements + states + a11y. |
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

1. **Planner MUST receive WEBSITE_BRIEF.md when it exists, plus BOTH `DESIGN_PLAN.md` and `CONTENT_PLAN.md`** before generating tasks.
2. **Do NOT run planner before content is ready** — seo-content-writer must finish first.
3. **website-polisher runs AFTER builder**, not before — it refines what's already built.
4. **designer does NOT write final copy** — placeholders only, marked as `[SEO Content Writer — purpose: ...]`.
5. **designer does NOT invent final brand assets** — it may specify placement, requirements, temporary wordmarks, CSS/inline-SVG motifs, and placeholders.
6. **content writer must label proof/claims** as source-backed, inferred, or placeholder-needed.
7. **builder must not turn placeholders into fake facts**.
8. **polisher must audit premium trust**, not only colors/spacing.

## Builder Routing for Website Implementation

Use the Builder Skill routing rules when planner/orchestrator assigns implementation agents:

- `builder` is the default for website UI implementation. It is already very strong for React/components, layout, CSS/Tailwind, responsive behavior, accessibility states, design-system application, and normal polish-plan execution.
- `builder-heavy-design` is the escalation tier for exceptional website design quality: premium visual craft, advanced motion, CSS/SVG/Canvas/3D-feeling visuals, immersive hero sections, distinctive art direction, and visual rescue when the standard builder output is functional but still not premium.
- `builder-heavy` is **not** the design-quality tier. Use it for backend/logic/math/correctness/integration complexity: shared-file hazards, migrations, auth/payment/security-adjacent flows, subtle state/data correctness, complex tests, and preservation-critical work.
- `builder-highspeed` is only for tiny exact mechanical website edits, such as one known class/token/text swap.

For website plans, every task should explain why its selected builder fits the risk: normal UI quality, ultimate visual quality, correctness/integration, or mechanical speed.

## Launch Prompt Additions

### For `website-designer`

Include this in the prompt whenever possible:

```txt
Read .pi/plans/WEBSITE_BRIEF.md if it exists.
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
Flag anything that creates DIY/template energy, weak trust, unclear CTA, unsupported claims, inaccessible interactions, or fragile client editability.
Produce exact old_string/new_string fixes when code-level fixes are possible; otherwise note the issue as a strategy/content/asset blocker.
```

## When to Skip Steps

| Situation | Action |
|-----------|--------|
| User already has a complete brief | Skip intake, write or reuse WEBSITE_BRIEF.md from provided context. |
| User wants quick autonomous preview | Use `/skill:website-home-preview` instead of full pipeline. |
| User already has DESIGN_PLAN.md | Skip designer, start with seo-content-writer. |
| User already has both plans | Skip designer + writer, go straight to planner. |
| Small tweak (1 page, <5 components) | Skip planner, use direct builder. |
| No design changes, only copy update | Skip designer, update CONTENT_PLAN.md directly. |

## Required Skills Per Step

| Step | Skills to Load |
|------|---------------|
| Strategy Intake | This skill; no agent required. |
| website-designer | `/skill:design-catalog` for brand references. |
| seo-content-writer | Reads WEBSITE_BRIEF.md and DESIGN_PLAN.md. |
| planner | `/skill:website-stack` for tech conventions. |
| builder / builder-heavy-design / builder-heavy | `/skill:website-stack` for file structure/components; `/skill:builder` for routing. |
| website-polisher | `/skill:design-catalog` for design system consistency. |
| validator | No skill needed. |
