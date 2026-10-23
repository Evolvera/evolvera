# Deep Research Extraction Guide — Design System Reverse Engineering

> Use this guide to extract design tokens from any website and generate a `DESIGN.md` compatible with design-catalog.

---

## Extraction Workflow

```
1. jina_read on the homepage + 3-5 key pages
2. Analyze inline CSS, computed styles, and CSS variables
3. Map each section of this guide
4. Generate DESIGN.md in the standard format
```

---

## 1. VISUAL THEME & ATMOSPHERE

### What to extract:
- [ ] **First impression**: Describe what the site looks like in 2-3 sentences (ex: "gold standard of fintech design — simultaneously technical and luxurious")
- [ ] **Dominant palette**: Main background color, heading color, accent color
- [ ] **Distinctive typography**: Custom font, characteristic weight, OpenType feature
- [ ] **Shadow system**: Dominant shadow color (neutral or tinted)
- [ ] **Typical border radius**: Conservative (2-6px) or modern (8-16px+)
- [ ] **Overall atmosphere**: Warm/cold, playful/professional, luxury/accessible, minimal/rich

### How to search:
```bash
# Extract from inline CSS/CSS variables
jina_read → search for patterns such as:
- --color-primary, --color-accent, --color-background
- --font-family, --font-weight
- --shadow, --border-radius
- CSS custom properties (var(--name))
```

### Example output:
```markdown
## 1. Visual Theme & Atmosphere

[Site name]'s website feels [descriptive impression -- 2-3 sentences]. The page opens on [background color] with [heading color] headings and [accent color] accents. The overall impression is [emotional descriptor].

**Key Characteristics:**
- [Font family] as primary typeface -- [what makes it distinctive]
- Weight [N] as signature headline weight -- [why it matters]
- [Shadow color] shadows -- [what they convey]
- [Border-radius range] border-radius -- [conservative/modern]
- [Accent colors] for decorative elements
- [Monospace font] for code/technical labels
```

---

## 2. COLOR PALETTE & ROLES

### What to extract — organize by FUNCTIONAL CATEGORY:

| Category | Extract | Example |
|-----------|---------|---------|
| **Primary/Brand** | Primary brand color, hex | `#533afd` — Stripe Purple |
| **Background** | Page background color | `#ffffff` — Pure White |
| **Heading/Text Dark** | Heading color | `#061b31` — Deep Navy |
| **Body Text** | Secondary text color | `#64748b` — Slate |
| **Label Text** | Label/form color | `#273951` — Dark Slate |
| **Interactive/CTA** | Button and link color | `#533afd` — Primary Purple |
| **CTA Hover** | CTA hover color | `#4434d4` — Purple Dark |
| **Border Default** | Border color | `#e5edf5` — Soft Blue |
| **Border Active** | Active border color | `#b9b9f9` — Border Purple |
| **Surface/Card** | Card color | `#ffffff` with a border |
| **Dark Section** | Dark section color | `#1c1e54` — Brand Dark |
| **Success** | Success color | `#15be53` — Green |
| **Error** | Error color | `#ea2261` — Ruby |
| **Warning** | Warning color | `#9b6829` — Lemon |
| **Shadow Color** | Shadow color | `rgba(50,50,93,0.25)` — Blue-tinted |

### How to search:
```bash
# Search the CSS:
- background-color, color, border-color
- box-shadow values
- linear-gradient definitions
- dominant rgba/rgb/hsl values
```

### Minimum palette (always extract):
```markdown
### Primary
- **[Name]()** (`#HEX`): [Use — CTAs, links, highlights]

### Backgrounds & Surfaces
- **[Name]()** (`#HEX`): [Use — page background, cards]
- **[Name]()** (`#HEX`): [Use — dark sections, footer]

### Text
- **[Name]()** (`#HEX`): [Use — headings, primary text]
- **[Name]()** (`#HEX`): [Use — body text, descriptions]
- **[Name]()** (`#HEX`): [Use — labels, captions]

### Interactive
- **[Name]()** (`#HEX`): [Use — buttons, links]
- **[Name]()** (`#HEX`): [Use — hover states]

### Borders & Dividers
- **[Name]()** (`#HEX`): [Use — default borders]
- **[Name]()** (`#HEX`): [Use — active/selected]

### Feedback
- **[Name]()** (`#HEX`): [Use — success states]
- **[Name]()** (`#HEX`): [Use — error/warning]

### Shadows
- **[Name]()** (`VALOR`): [Use — elevation, depth]
```

---

## 3. TYPOGRAPHY RULES

### What to extract:

#### Fonts
- [ ] **Primary font**: Name + fallback (ex: `sohne-var`, `SF Pro Display`)
- [ ] **Monospace font**: For code (ex: `SourceCodePro`, `SFMono-Regular`)
- [ ] **OpenType features**: `ss01`, `tnum`, `liga`, `kern` — any distinctive feature

#### Typography hierarchy — fill in the table:

| Role | Font | Size (desktop) | Weight | Line Height | Letter Spacing | Notes |
|------|------|----------------|--------|-------------|----------------|-------|
| Display Hero | | | | | | |
| Display Large | | | | | | |
| Section Heading | | | | | | |
| Sub-heading | | | | | | |
| Body Large | | | | | | |
| Body | | | | | | |
| Button | | | | | | |
| Link | | | | | | |
| Caption | | | | | | |
| Code Body | | | | | | |

#### How to find sizes:
```bash
# Typical patterns:
Display: 48-72px
H1: 36-56px
H2: 28-40px
H3: 20-28px
Body: 14-18px
Caption: 11-13px
Code: 12-14px
```

### Example output:
```markdown
### Font Family
- **Primary**: [Font name], with fallback: [Fallback]
- **Monospace**: [Font name], with fallback: [Fallback]
- **OpenType Features**: [list — ss01, tnum, etc.]

### Hierarchy

| Role | Font | Size | Weight | Line Height | Letter Spacing | Features |
|------|------|------|--------|-------------|----------------|----------|
| Display Hero | sohne-var | 56px | 300 | 1.03 | -1.4px | ss01 |
| Display Large | sohne-var | 48px | 300 | 1.15 | -0.96px | ss01 |
...

### Principles
- [Principle 1 — e.g., "Light weight as signature"]
- [Principle 2 — e.g., "ss01 everywhere"]
- [Principle 3]
```

---

## 4. COMPONENT STYLINGS

### What to extract for each component:

#### Buttons
```
- Background (default + hover + active)
- Text color
- Padding (vertical + horizontal)
- Border-radius
- Border (if any)
- Font (size, weight, family)
- Ghost/outlined variant: same or different?
```

#### Cards & Containers
```
- Background color
- Border (color + width)
- Border-radius
- Shadow (full value — all layers)
- Internal padding
```

#### Badges / Tags / Pills
```
- Background (default + variants)
- Text color
- Padding
- Border-radius
- Border (if any)
- Font (size, weight)
```

#### Inputs & Forms
```
- Border color (default + focus)
- Border-radius
- Focus ring/outline style
- Label color
- Text color
- Placeholder color
```

#### Navigation
```
- Background (sticky? with blur?)
- Logo placement
- Link style (size, weight, color)
- CTA button style
- Mobile behavior (hamburger?)
```

### Component matrix to document:
- [ ] Button Primary
- [ ] Button Ghost/Outlined
- [ ] Button Danger
- [ ] Card Standard
- [ ] Card Elevated
- [ ] Badge/Pill
- [ ] Input Text
- [ ] Input Focus State
- [ ] Select/Dropdown
- [ ] Navigation Desktop
- [ ] Navigation Mobile
- [ ] Footer

### Example output:
```markdown
### Buttons

**Primary [Color]**
- Background: `#HEX`
- Text: `#HEX`
- Padding: [N]px [N]px
- Radius: [N]px
- Font: [size] [font] weight [N], [OpenType]
- Hover: [background color]
- Use: [when to use]

**Ghost / Outlined**
- Background: transparent
- Text: `#HEX`
- Padding: [N]px [N]px
- Radius: [N]px
- Border: [width] solid [color]
- Hover: [background]
- Use: [when to use]
```

---

## 5. LAYOUT PRINCIPLES

### What to extract:

#### Spacing system
```
- Base unit: [e.g., 4px or 8px]
- Scale: [list the scale values]
```

#### Grid & Container
```
- Max content width: [e.g., ~1080px]
- Column count: [ex: 12 columns, 3-col grid]
- Gutter/gap: [e.g., 24px]
```

#### Section patterns
```
- Hero: centered / left-aligned / full-bleed?
- Feature sections: grid layout or stacked?
- Dark sections: are dark sections used? In what color?
- Section spacing rhythm: [ex: 64px desktop → 40px mobile]
```

### Example output:
```markdown
### Spacing System
- Base unit: 8px
- Scale: 4px, 8px, 12px, 16px, 24px, 32px, 48px, 64px, 96px

### Grid & Container
- Max content width: ~1080px
- Feature sections: 2-3 column grids
- Full-width dark sections: [#HEX]

### Whitespace Philosophy
- [Dense data, generous chrome / Generous whitespace / Balanced]
- Section rhythm: [describe the pattern — ex: "white → dark → white"]
```

---

## 6. DEPTH & ELEVATION

### What to extract — shadow levels:

| Level | CSS Value | Use |
|-------|-----------|-----|
| Flat | no shadow | backgrounds |
| Ambient | `0px 3px 6px rgba(...)` | subtle lift |
| Standard | `0px 15px 35px rgba(...)` | cards, panels |
| Elevated | full shadow | featured cards, dropdowns |
| Deep | stronger shadow | modals, floating |

### Also extract:
- [ ] `box-shadow` for cards on hover
- [ ] `box-shadow` for modals/dropdowns
- [ ] `backdrop-filter` if present (blur)
- [ ] Borders vs. shadows — which does it favor?

### Example output:
```markdown
| Level | Treatment | Use |
|-------|-----------|-----|
| Flat (Level 0) | No shadow | Page background |
| Ambient (Level 1) | `rgba(23,23,23,0.06) 0px 3px 6px` | Subtle lift |
| Standard (Level 2) | `rgba(23,23,23,0.08) 0px 15px 35px` | Cards |
| Elevated (Level 3) | `[full shadow]` | Featured cards |
| Deep (Level 4) | `[stronger shadow]` | Modals |
| Ring | `2px solid #COLOR` | Focus states |
```

---

## 7. DO'S AND DON'TS

### What to infer from the observations:

**Do** (positive patterns identified):
- [ ] Does it use a light weight (300) for headlines?
- [ ] Conservative corner radius (2-8px)?
- [ ] Are shadows color-tinted or neutral?
- [ ] Are heading colors not pure black?
- [ ] Distinctive OpenType features?

**Don't** (patterns it does NOT use):
- [ ] Does not use a high weight (600-700) for headlines?
- [ ] Does not use pill shapes (border-radius > 12px)?
- [ ] Does not use untinted neutral shadows?
- [ ] Does not use pure black (#000)?

### Example output:
```markdown
## 7. Do's and Don'ts

### Do
- Use [font] with [feature] on every text element
- Use weight [N] for headlines
- Apply [color-tinted] shadows for elevated elements
- Use [heading color] for headings instead of black
- Keep border-radius between [N]px-[N]px

### Don't
- Don't use weight [N]+ for headlines
- Don't use large border-radius on cards/buttons
- Don't use neutral gray shadows
- Don't skip [OpenType feature]
- Don't use pure black for headings
```

---

## 8. RESPONSIVE BEHAVIOR

### What to extract:

#### Breakpoints
| Name | Width | Key Changes |
|------|-------|-------------|
| Mobile | <640px | |
| Tablet | 640-1024px | |
| Desktop | 1024-1280px | |
| Large Desktop | >1280px | |

#### Typical behavior by breakpoint:
- [ ] Hero: 56px → ?px on mobile
- [ ] Navigation: horizontal → hamburger
- [ ] Feature grid: 3-col → 2-col → 1-col
- [ ] Section spacing: [desktop] → [mobile]
- [ ] Typography scale compression

### Example output:
```markdown
### Breakpoints
| Name | Width | Key Changes |
|------|-------|-------------|
| Mobile | <640px | Single column, reduced headings |
| Tablet | 640-1024px | 2-column grids |
| Desktop | 1024-1280px | Full layout, 3-col grids |
| Large Desktop | >1280px | Centered with margins |

### Collapsing Strategy
- Hero: 56px → 32px on mobile
- Navigation: links + CTA → hamburger toggle
- Feature cards: 3-col → 2-col → single
- Section spacing: 64px → 40px
```

---

## 9. AGENT PROMPT GUIDE (Quick Reference)

### What to extract — compact version:

```markdown
### Quick Color Reference
- Primary CTA: [HEX] — [color name]
- CTA Hover: [HEX]
- Background: [HEX]
- Heading text: [HEX]
- Body text: [HEX]
- Border: [HEX]
- Link: [HEX]
- Dark section: [HEX]
- Success: [HEX]
- Error: [HEX]

### Example Component Prompts
1. "Create a hero section on [bg] background. Headline at [size] [font] weight [N], line-height [N], letter-spacing [N]px, color [HEX]. Subtitle at [size] weight [N], [HEX]. [CTA style] button and [ghost style] button."

2. "Design a card: [bg] background, [border] border, [radius]px radius. Shadow: [shadow]. Title at [size] [font] weight [N], [HEX]. Body at [size] weight [N], [HEX]."

3. "Build a [badge]: [bg] background, [text color] text, [radius]px radius."
```

---

## Extraction Checklist

Before finalizing DESIGN.md, verify:

- [ ] Homepage read (jina_read)
- [ ] 3+ internal pages read
- [ ] inline CSS/CSS variables extracted
- [ ] All colors documented in hex/rgba
- [ ] Complete typography hierarchy (Display → Caption)
- [ ] Shadow system documented (all levels)
- [ ] Components: Buttons (primary + ghost), Cards, Badges, Inputs, Nav
- [ ] Layout: spacing scale, max-width, grid
- [ ] Responsive breakpoints identified
- [ ] Do's and Don'ts inferred
- [ ] Agent Prompt Guide completed

---

## Quick Template (copy and fill in)

```markdown
# Design System Inspired by [Brand Name]

## 1. Visual Theme & Atmosphere
[2-3 sentences of description + Key Characteristics]

## 2. Color Palette & Roles
[All color categories]

## 3. Typography Rules
[Fonts + complete hierarchy]

## 4. Component Stylings
[Buttons, Cards, Badges, Inputs, Nav]

## 5. Layout Principles
[Spacing, Grid, Whitespace]

## 6. Depth & Elevation
[Shadow levels]

## 7. Do's and Don'ts
[Positive and negative patterns]

## 8. Responsive Behavior
[Breakpoints + Collapsing]

## 9. Agent Prompt Guide
[Quick reference + Examples]
```
