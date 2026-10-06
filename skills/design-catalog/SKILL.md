---
name: design-catalog
description: Catalog of real-world brand design systems (Stripe, Linear, Apple, etc.) for website design reference. Use when designing or polishing websites to match premium brand aesthetics. Includes design tokens, color palettes, typography, shadows, and component patterns. Also owns DESIGN_VOCABULARY.md, the canonical named-term vocabulary every design field must choose from.
---

# Design Catalog

A catalog of real-world brand design references for website design and polish. Each brand includes detailed design tokens, component patterns, color palettes, typography systems, and visual guidelines that can be used as references when designing or refining websites.

## Setup

If designs are not yet downloaded, run the setup script:

```bash
bash ~/.pi/agent/skills/design-catalog/scripts/setup-designs.sh
```

This will download all DESIGN.md files to `~/.pi/agent/skills/design-catalog/designs/`. The script is idempotent — it skips already-downloaded brands.

Expected output: `✨ All design references are ready.`

## Using the Catalog

### Searching for a Brand

1. **Read the index**: `read` the `design-index.json` file to browse all available brands
2. **Match by category**: Filter by `category` field (fintech, saas, ecommerce, etc.)
3. **Match by vibe**: Filter by `vibe` array to find brands matching the desired mood
4. **Match by keywords**: Filter by `keywords` array for semantic matching

### Reading a Design

Once you've identified the best brand(s):
```
read ~/.pi/agent/skills/design-catalog/designs/<slug>/DESIGN.md
```

Example: `read designs/stripe/DESIGN.md`

### Structure of design-index.json

```json
{
  "slug": "stripe",
  "name": "Stripe",
  "category": "fintech",
  "vibe": ["premium", "technical", "trustworthy", "minimal", "elegant"],
  "colors": ["#533AFD", "#061B31", "#ffffff"],
  "typography": ["sohne-var", "SF Pro Display", "SourceCodePro"],
  "use_cases": ["SaaS", "payments", "B2B", "developer tools", "fintech"],
  "design_file": "designs/stripe/DESIGN.md",
  "keywords": ["fintech", "gradient", "purple", "shadow", "elegant", "developer"]
}
```

## Matching Algorithm

Use this algorithm to select the best design reference(s) for a given briefing:

### Step 1: Extract Briefing Features
From the client briefing, identify:
- **Segment**: What industry/sector (fintech, ecommerce, SaaS, etc.)
- **Target audience**: B2B, B2C, developers, consumers, etc.
- **Style keywords**: Minimal, playful, premium, bold, dark, warm, technical
- **Reference sites**: Any brands mentioned by the client
- **Mood**: Professional, playful, luxury, technical, friendly, bold, minimal

### Step 2: Search the Index
Search `design-index.json` for matches using these fields in priority order:
1. **Exact category match** (highest priority)
2. **Use-case overlap** (2+ matching use_cases)
3. **Vibe similarity** (3+ matching vibe adjectives)
4. **Keyword overlap** (3+ matching keywords)

### Step 3: Exact Match (if available)
If the briefing mentions a brand that exists in the catalog, use it as PRIMARY.
Example: "I want something like Stripe" → PRIMARY = Stripe

### Step 4: Ranking
If no exact match, rank candidates by:
1. Category match
2. Number of matching use_cases
3. Number of matching vibe adjectives
4. Number of matching keywords

### Step 5: Hybrid Selection
If the briefing is hybrid (e.g., "fintech but creative"), select:
- **PRIMARY**: Brand matching the primary business function
- **SECONDARY**: Brand matching the aesthetic/creative direction

Example: "A fintech SaaS but with a playful, approachable feel"
- PRIMARY: Stripe (fintech/SaaS) or Coinbase (fintech)
- SECONDARY: Notion (warm/approachable) or Airtable (playful)

Document in the plan: "Primary reference [X] for financial patterns; Secondary reference [Y] for visual warmth."

### Step 6: Justification
Always justify your selection in the DESIGN_PLAN.md:
```
Primary reference: Stripe (fintech, SaaS, developer tools, premium aesthetic)
Secondary reference: Notion (warm minimalism, approachable, B2C-friendly)
Why: Client is a B2B fintech SaaS but wants to feel approachable to small businesses — Stripe's financial confidence + Notion's warmth.
```

## Design Vocabulary

`DESIGN_VOCABULARY.md` is the canonical cross-field vocabulary of named design terms (layout, hero, sections, navigation, scroll behavior, motion, states, typography, color, surface, imagery, components, forms, data visualization, responsive, accessibility, hierarchy). Each term carries a definition, use-when, avoid-when, and guardrail.

**When to read it:** always, before baseline design decisions (designers, planners) and whenever a task or plan names a term you must implement or audit (builders, polishers, validators):

```
read ~/.pi/agent/skills/design-catalog/DESIGN_VOCABULARY.md
```

**Division of roles:** brand references (`designs/<slug>/DESIGN.md`) supply tokens and taste; the vocabulary supplies named decisions. Choose terms by exact name, record them in a `## Design Vocabulary Selection` table (Field | Term | Fit | Rejected alternative | Guardrail), and never invent or rename a term. Mechanic-level terms map to `creative-catalog` slugs and route through `website-creative` when dominant.

## Stack Template

For the implementation stack template (Next.js + Tailwind + shadcn/ui), see:

```
read ~/.pi/agent/skills/design-catalog/templates/nextjs-shadcn/README.md
```

This includes:
- Initialization commands
- Required packages
- Recommended folder structure
- Critical configurations
- Layout and global CSS snippets

## Available Categories

| Category | Brands |
|----------|--------|
| fintech | Stripe, Binance, Coinbase, Kraken, Mastercard, Revolut, Wise |
| saas | Clay, Intercom, Linear.app, Superhuman, Zapier |
| ecommerce | Nike, Shopify, Apple, Starbucks |
| social | Meta, Pinterest, Slack, Spotify |
| productivity | Airtable, Linear.app, Notion, Superhuman, Zapier, Miro |
| developer-tools | ClickHouse, Cohere, Cursor, Expo, Hashicorp, Mintlify, MongoDB, NVIDIA, Ollama, OpenCode.ai, PostHog, Raycast, Replicate, Resend, Sanity, Sentry, Supabase, Vercel, Voltagent, Warp, Cal, Claude, Composio, ElevenLabs, Mistral.ai, Together.ai |
| creative | Figma, Framer, Miro, Runway, Webflow |
| automotive | BMW, BMW M, Bugatti, Ferrari, Lamborghini, Renault, Tesla |
| enterprise | Apple, IBM, SpaceX, Uber, Vodafone |
| media | The Verge, Wired |
| consumer | Airbnb, Meta, PlayStation, Spotify, Starbucks, Tesla |

## Design Vibes

| Vibe | Best Brands |
|------|------------|
| minimal | Apple, Linear.app, Notion, Stripe, Tesla, Cal, Cursor, Vercel |
| premium | Stripe, Apple, Tesla, Bugatti, Ferrari, Superhuman |
| playful | Airtable, Miro, Slack, Figma, Zapier, Lovable |
| dark | Linear.app, Vercel, Figma, Spotify, Stripe, Cursor, Hashicorp |
| technical | Hashicorp, ClickHouse, Stripe, NVIDIA, Vercel |
| warm | Airbnb, Starbucks, Notion, Intercom, The Verge |
| bold | Nike, Apple, Ferrari, Lamborghini, Pinterest, Wired |
| luxury | Apple, Tesla, Bugatti, Ferrari, BMW, Rolex-style brands |
| friendly | Intercom, Airtable, Slack, Zapier, Calendly |

## Website Content Generation

The website construction chain has a **clear separation of concerns** between baseline visual design, optional additive creative direction, and content:

### Responsibility Split

| Responsibility | Agent | Output |
|---------------|-------|--------|
| Baseline visual design (colors, typography, layout, components, UX, trust, responsive behavior, accessibility, baseline motion) | `website-designer` | `DESIGN_PLAN.md` with Creative Opportunity Map |
| Optional additive creative direction (mapped mechanics and guardrails only) | `website-creative` | `CREATIVE_DIRECTION.md` or `HOME_CREATIVE_DIRECTION.md` addendum |
| All website copy (headlines, body, CTAs, microcopy, meta tags, alt text, schema) | `seo-content-writer` | `CONTENT_PLAN.md` |
| Visual website implementation | `builder-design` | Reads both `DESIGN_PLAN.md` + `CONTENT_PLAN.md`; escalate per `/skill:builder` |
| UI/UX polish | `website-polisher` | Reads both plans + code |
| Quality verification | `validator` | Reads all artifacts |

### How It Works

1. **Designer** produces the baseline `DESIGN_PLAN.md`, owns the UX/trust/conversion system and baseline motion, and maps existing expressive and protected zones for any later addendum. Content fields remain placeholders: `[SEO Content Writer — purpose: primary value proposition]`
2. On explicit creative activation only, **website-creative** reads the completed design artifact and emits a mapped additive `CREATIVE_DIRECTION.md` or reports `DESIGN_CONFLICT`; it does not redesign the baseline.
3. **SEO Content Writer** reads `DESIGN_PLAN.md` and the strategy brief, generates all copy in `CONTENT_PLAN.md`, does not independently reinterpret mechanics, and preserves the existing human approval pause before planning/building.
4. **Planner/Builder** reads the baseline design, content, and optional addendum; implementation preserves design authority and re-verifies addendum provenance and fallbacks.
5. **Polisher/Validator** audit the implementation against design/content authority plus any mapped additive mechanics and their fallbacks.

### When to Use Each Agent

| Use Case | Agent(s) |
|----------|----------|
| New website from scratch | Full chain: `website-designer` → optional `website-creative` addendum → `seo-content-writer` → `planner` → `builder-design` → `website-polisher` → `builder-design` → `validator` |
| Design only (no implementation) | `website-designer` only |
| Content only (DESIGN_PLAN.md already exists) | `seo-content-writer` only |
| Implement visual website work from existing plans | `builder-design` by default; escalate per `/skill:builder` |
| Polish existing website | `website-polisher` only |
| Validate implementation | `validator` only |
| Regenerate/revise copy | `seo-content-writer` only (after design is approved) |
