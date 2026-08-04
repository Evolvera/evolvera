---
name: design-catalog
description: Catalog of real-world brand design systems (Stripe, Linear, Apple, etc.) for website design reference. Use when designing or polishing websites to match premium brand aesthetics. Includes design tokens, color palettes, typography, shadows, and component patterns.
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

The website construction chain has a **clear separation of concerns** between visual design and content:

### Responsibility Split

| Responsibility | Agent | Output |
|---------------|-------|--------|
| Visual design (colors, typography, layout, components) | `website-designer` | `DESIGN_PLAN.md` |
| All website copy (headlines, body, CTAs, microcopy, meta tags, alt text, schema) | `seo-content-writer` | `CONTENT_PLAN.md` |
| Visual website implementation | `builder-design` | Reads both `DESIGN_PLAN.md` + `CONTENT_PLAN.md`; escalate per `/skill:builder` |
| UI/UX polish | `website-polisher` | Reads both plans + code |
| Quality verification | `validator` | Reads all artifacts |

### How It Works

1. **Designer** produces `DESIGN_PLAN.md` with content fields marked as placeholders: `[SEO Content Writer — purpose: primary value proposition]`
2. **SEO Content Writer** reads `DESIGN_PLAN.md`, generates all copy in `CONTENT_PLAN.md`, and pauses for human approval
3. **Builder** reads both plans and implements the full website with correct copy
4. **Polisher** audits both design and content for consistency
5. **Validator** verifies implementation matches both plans

### When to Use Each Agent

| Use Case | Agent(s) |
|----------|----------|
| New website from scratch | Full chain: `website-designer` → `seo-content-writer` → `planner` → `builder-design` → `website-polisher` → `builder-design` → `validator` |
| Design only (no implementation) | `website-designer` only |
| Content only (DESIGN_PLAN.md already exists) | `seo-content-writer` only |
| Implement visual website work from existing plans | `builder-design` by default; escalate per `/skill:builder` |
| Polish existing website | `website-polisher` only |
| Validate implementation | `validator` only |
| Regenerate/revise copy | `seo-content-writer` only (after design is approved) |
