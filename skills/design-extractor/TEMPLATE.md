# Design System Inspired by [Brand Name]

## 1. Visual Theme & Atmosphere

[DESCRIÇÃO: 2-3 frases da primeira impressão visual do site. Ex: "X's website is a [adjective] design that balances [quality1] with [quality2]. The page opens on [background] with [heading color] headings and [accent color] accents."]

[DESCRIÇÃO ADICIONAL: Explique a atmosfera geral — professional/casual, luxury/accessible, warm/cold, minimal/rich. Mencione elementos distintivos como sombras, tipografia custom, elementos decorativos.]

**Key Characteristics:**
- [FONT FAMILY] as primary typeface -- [what makes it distinctive]
- Weight [N] as signature headline weight -- [why it matters]
- [COLOR] as [usage — primary CTA, brand anchor, etc.]
- [ANY DISTINCTIVE SHADOW SYSTEM, BORDER-RADIUS, OR ELEVATION APPROACH]
- [ANY SECONDARY/TERTIARY ACCENT COLORS]
- [MONOSPACE if applicable] for code/technical labels

## 2. Color Palette & Roles

### Primary / Brand
- **[Color Name]** (`#HEX`): [Usage — CTAs, brand anchor, primary interactive]
- **[Heading Color]** (`#HEX`): [Usage — headings, primary text]
- **[Background]** (`#HEX`): [Usage — page background, surfaces]

### Secondary & Tertiary
- **[Secondary]** (`#HEX`): [Usage — secondary accents, links]
- **[Tertiary]** (`#HEX`): [Usage — decorative elements, gradients]

### Backgrounds & Surfaces
- **[Surface White]** (`#FFFFFF`): [Usage]
- **[Light Surface]** (`#F0F0F0`): [Usage — light sections, cards]
- **[Dark Surface]** (`#151515`): [Usage — dark sections, footer]

### Text
- **[Primary Text]** (`#HEX`): [Usage — body text, descriptions]
- **[Secondary Text]** (`#HEX`): [Usage — captions, metadata]
- **[Muted Text]** (`#HEX`): [Usage — placeholders, disabled]

### Interactive / CTA
- **[CTA]** (`#HEX`): [Usage — buttons, primary links]
- **[CTA Hover]** (`#HEX`): [Usage — hover state]
- **[Link]** (`#HEX`): [Usage — inline links]

### Borders & Dividers
- **[Border Default]** (`#HEX`): [Usage — standard borders]
- **[Border Light]** (`#HEX`): [Usage — subtle dividers]
- **[Border Accent]** (`#HEX`): [Usage — active/selected states]

### Feedback States
- **[Success]** (`#HEX`): [Usage — success messages]
- **[Error]** (`#HEX`): [Usage — error states]
- **[Warning]** (`#HEX`): [Usage — warnings]
- **[Info]** (`#HEX`): [Usage — informational]

### Shadows
- **[Shadow Primary]** (`VALOR`): [Usage — elevation, depth]
- **[Shadow Secondary]** (`VALOR`): [Usage — subtle lift]

## 3. Typography Rules

### Font Family
- **Primary**: `[Font Name]`, with fallback: `[Fallback fonts]`
- **Monospace**: `[Font Name]`, with fallback: `[Fallback]`
- **OpenType Features**: [list — ss01, tnum, liga, kern if applicable]

### Hierarchy

| Role | Font | Size | Weight | Line Height | Letter Spacing | Notes |
|------|------|------|--------|-------------|----------------|-------|
| Display Hero | [Font] | [N]px | [N] | [N] | [N]px | [Notes] |
| Display Large | [Font] | [N]px | [N] | [N] | [N]px | [Notes] |
| Section Heading | [Font] | [N]px | [N] | [N] | [N]px | [Notes] |
| Sub-heading Large | [Font] | [N]px | [N] | [N] | [N]px | [Notes] |
| Sub-heading | [Font] | [N]px | [N] | [N] | [N]px | [Notes] |
| Body Large | [Font] | [N]px | [N] | [N] | [N]px | [Notes] |
| Body | [Font] | [N]px | [N] | [N] | [N]px | [Notes] |
| Button | [Font] | [N]px | [N] | [N] | [N]px | [Notes] |
| Link | [Font] | [N]px | [N] | [N] | [N]px | [Notes] |
| Caption | [Font] | [N]px | [N] | [N] | [N]px | [Notes] |
| Code | [Font] | [N]px | [N] | [N] | [N]px | [Notes] |

### Principles
- **[Principle 1 — ex: "Bold headlines as signature"]**
- **[Principle 2 — ex: "Light weight for body text"]**
- **[Principle 3]**

## 4. Component Stylings

### Buttons

**Primary [Name]**
- Background: `#HEX`
- Text: `#HEX`
- Padding: [N]px [N]px
- Border-radius: [N]px
- Font: [size] [font] weight [N]
- Hover: [background/color change]
- Active: [pressed state]
- Use: [when to use]

**Secondary / Ghost**
- Background: [transparent/solid]
- Text: `#HEX`
- Border: [width] solid [color]
- Padding: [N]px [N]px
- Border-radius: [N]px
- Hover: [change]

**[Other variants as needed]**

### Cards & Containers

**Standard Card**
- Background: `#HEX`
- Border: [width] solid [color]
- Border-radius: [N]px
- Shadow: [value]
- Padding: [N]px
- Use: [when to use]

**[Other card variants]**

### Badges / Tags / Pills

**Badge**
- Background: `#HEX`
- Text: `#HEX`
- Padding: [N]px [N]px
- Border-radius: [N]px
- Font: [size] [weight]
- Border: [if applicable]

**[Other badge variants]**

### Inputs & Forms

**Text Input**
- Border: [width] solid [color]
- Border-radius: [N]px
- Focus: [outline/ring style]
- Label: [color], [size] [font]
- Text: [color]
- Placeholder: [color]

**[Select, Checkbox, Radio variants]**

### Navigation

**Desktop Nav**
- Background: [color]
- Position: [fixed/sticky/static]
- Logo: [placement]
- Links: [size] [font] [weight], [color]
- CTA: [style]
- Height: [N]px

**Mobile Nav**
- Trigger: [hamburger/icon]
- Overlay: [full-screen/drawer]
- Animation: [transition]

**Footer**
- Background: `#HEX`
- Text: `#HEX`
- Links: [style]
- Layout: [grid/flex]

## 5. Layout Principles

### Spacing System
- Base unit: [N]px
- Scale: [list values — ex: 4px, 8px, 12px, 16px, 24px, 32px, 48px, 64px]

### Grid & Container
- Max content width: [N]px
- Columns: [N]
- Gutter: [N]px
- Breakpoints: [list]

### Whitespace Philosophy
- **[Dense/Generous/Balanced]** — [explanation]

### Border Radius Scale
| Token | Value | Usage |
|-------|-------|-------|
| Micro | [N]px | [fine elements] |
| Standard | [N]px | [buttons, inputs] |
| Comfortable | [N]px | [cards, containers] |
| Large | [N]px | [featured elements] |
| Pill | [N]px | [pills, avatars] |

## 6. Depth & Elevation

| Level | Treatment | Use |
|-------|-----------|-----|
| Flat | No shadow | Page background |
| Subtle | [shadow value] | [light lift] |
| Standard | [shadow value] | [cards, panels] |
| Elevated | [shadow value] | [dropdowns, featured] |
| Deep | [shadow value] | [modals, overlays] |
| Ring | [outline style] | [focus states] |

**Shadow Philosophy**: [describe the approach — neutral tinted, brand-colored, layered, etc.]

## 7. Do's and Don'ts

### Do
- Use [font] for [usage]
- Use weight [N] for [headlines/body]
- Apply [color] for [CTAs/headings]
- Keep border-radius at [range]
- [Other positive patterns]

### Don't
- Don't use weight [N]+ for [headlines]
- Don't use border-radius [N]+ on [buttons/cards]
- Don't use [color] for [conflicting usage]
- Don't skip [accessibility requirement]
- [Other negative patterns]

## 8. Responsive Behavior

### Breakpoints
| Name | Width | Key Changes |
|------|-------|-------------|
| Mobile | <[N]px | [single column, reduced headings] |
| Tablet | [N]-[N]px | [2-column grids] |
| Desktop | [N]-[N]px | [full layout] |
| Large | >[N]px | [max-width, generous margins] |

### Typography Scaling
- **H1**: [N]px → [N]px mobile
- **H2**: [N]px → [N]px mobile
- **Body**: [N]px → [N]px mobile

### Navigation Collapse
- Desktop: [horizontal/mega-menu]
- Mobile: [hamburger/drawer]

### Grid Collapse
- **[Component]**: [N]-col → [N]-col → 1-col

## 9. Agent Prompt Guide

### Quick Color Reference
- Primary CTA: [#HEX]
- CTA Hover: [#HEX]
- Background: [#HEX]
- Heading text: [#HEX]
- Body text: [#HEX]
- Border: [#HEX]
- Link: [#HEX]
- Dark section: [#HEX]
- Success: [#HEX]
- Error: [#HEX]

### Example Component Prompts

1. "Create a hero section on [bg] background. Headline at [size] [font] weight [N], line-height [N], letter-spacing [N]px, color [HEX]. Subtitle at [size] weight [N], [HEX]. [CTA style] button and [ghost style] button."

2. "Design a card: [bg] background, [border] border, [radius]px radius. Shadow: [shadow]. Title at [size] [font] weight [N], [HEX]. Body at [size] weight [N], [HEX]."

3. "Build a [badge]: [bg] background, [text color] text, [radius]px radius."

4. "Create navigation: [sticky/fixed] header. [Logo placement]. Links at [size] [font] weight [N], [color] text. [CTA style] right-aligned. Mobile: [hamburger] with [overlay type]."

5. "Design a [dark/light] section: [bg] background, [text color] text. [Component styles inside]."

6. "Build an input: [border] border, [radius]px radius. Focus state: [outline style]."

### Iteration Guide
1. Always use [font] as primary typeface
2. Weight [N] is the default for [headlines/body]
3. Shadow formula: [formula if applicable]
4. Heading color is [#HEX], body is [#HEX]
5. Border-radius stays in the [N]-[N]px range
6. Primary CTA is [#HEX]
7. [Other key rules]

---

## Sources
- Main CSS: `[URL if extracted]`
- Website: `[URL]`
- Extracted: [DATE]
