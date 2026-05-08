# Deep Research Extraction Guide — Design System Reverse Engineering

> Use este guia para extrair tokens de design de qualquer website e gerar um `DESIGN.md` compatível com o design-catalog.

---

## Fluxo de Extração

```
1. jina_read na home + 3-5 páginas principais
2. Analisar CSS inline, computed styles, e variáveis CSS
3. Mapear cada seção deste guia
4. Gerar DESIGN.md no formato padrão
```

---

## 1. VISUAL THEME & ATMOSPHERE

### O que extrair:
- [ ] **Primeira impressão**: Descreva em 2-3 frases como o site se parece (ex: "gold standard of fintech design — simultaneously technical and luxurious")
- [ ] **Paleta dominante**: Cor de fundo principal, cor de heading, cor de accent
- [ ] **Tipografia distintiva**: Fonte customizada, peso característico, feature OpenType
- [ ] **Sistema de sombras**: Cor predominante das sombras (neutras ou tintadas)
- [ ] **Border-radius típico**: Conservador (2-6px) ou moderno (8-16px+)
- [ ] **Atmosfera geral**: Warm/cold, playful/professional, luxury/accessible, minimal/rich

### Como buscar:
```bash
# Extrair do CSS inline/variáveis CSS
jina_read → buscar patterns como:
- --color-primary, --color-accent, --color-background
- --font-family, --font-weight
- --shadow, --border-radius
- CSS custom properties (var(--name))
```

### Exemplo de output:
```markdown
## 1. Visual Theme & Atmosphere

[Nome do site]'s website feels [descriptive impression -- 2-3 sentences]. The page opens on [background color] with [heading color] headings and [accent color] accents. The overall impression is [emotional descriptor].

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

### O que extrair — organize por CATEGORIA FUNCIONAL:

| Categoria | Extrair | Exemplo |
|-----------|---------|---------|
| **Primary/Brand** | Cor principal da marca, hex | `#533afd` — Stripe Purple |
| **Background** | Cor de fundo da página | `#ffffff` — Pure White |
| **Heading/Text Dark** | Cor de títulos | `#061b31` — Deep Navy |
| **Body Text** | Cor de texto secundário | `#64748b` — Slate |
| **Label Text** | Cor de labels/formulários | `#273951` — Dark Slate |
| **Interactive/CTA** | Cor de botões e links | `#533afd` — Primary Purple |
| **CTA Hover** | Cor hover de CTAs | `#4434d4` — Purple Dark |
| **Border Default** | Cor de bordas | `#e5edf5` — Soft Blue |
| **Border Active** | Cor de borda ativa | `#b9b9f9` — Border Purple |
| **Surface/Card** | Cor de cards | `#ffffff` com borda |
| **Dark Section** | Cor de seções escuras | `#1c1e54` — Brand Dark |
| **Success** | Cor de sucesso | `#15be53` — Green |
| **Error** | Cor de erro | `#ea2261` — Ruby |
| **Warning** | Cor de warning | `#9b6829` — Lemon |
| **Shadow Color** | Cor das sombras | `rgba(50,50,93,0.25)` — Blue-tinted |

### Como buscar:
```bash
# Buscar no CSS:
- background-color, color, border-color
- box-shadow values
- linear-gradient definitions
- rgba/rgb/hsl values dominantes
```

### Paleta mínima (sempre extrair):
```markdown
### Primary
- **[Nome]()** (`#HEX`): [Uso — CTAs, links, highlights]

### Backgrounds & Surfaces
- **[Nome]()** (`#HEX`): [Uso — page background, cards]
- **[Nome]()** (`#HEX`): [Uso — dark sections, footer]

### Text
- **[Nome]()** (`#HEX`): [Uso — headings, primary text]
- **[Nome]()** (`#HEX`): [Uso — body text, descriptions]
- **[Nome]()** (`#HEX`): [Uso — labels, captions]

### Interactive
- **[Nome]()** (`#HEX`): [Uso — buttons, links]
- **[Nome]()** (`#HEX`): [Uso — hover states]

### Borders & Dividers
- **[Nome]()** (`#HEX`): [Uso — default borders]
- **[Nome]()** (`#HEX`): [Uso — active/selected]

### Feedback
- **[Nome]()** (`#HEX`): [Uso — success states]
- **[Nome]()** (`#HEX`): [Uso — error/warning]

### Shadows
- **[Nome]()** (`VALOR`): [Uso — elevation, depth]
```

---

## 3. TYPOGRAPHY RULES

### O que extrair:

#### Fontes
- [ ] **Primary font**: Nome + fallback (ex: `sohne-var`, `SF Pro Display`)
- [ ] **Monospace font**: Para código (ex: `SourceCodePro`, `SFMono-Regular`)
- [ ] **OpenType features**: `ss01`, `tnum`, `liga`, `kern` — qualquer feature distintiva

#### Hierarquia tipográfica — preencha a tabela:

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

#### Como buscar sizes:
```bash
# Padrões típicos:
Display: 48-72px
H1: 36-56px
H2: 28-40px
H3: 20-28px
Body: 14-18px
Caption: 11-13px
Code: 12-14px
```

### Exemplo de output:
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
- [Princípio 1 — ex: "Light weight as signature"]
- [Princípio 2 — ex: "ss01 everywhere"]
- [Princípio 3]
```

---

## 4. COMPONENT STYLINGS

### O que extrair para cada componente:

#### Buttons
```
- Background (default + hover + active)
- Text color
- Padding (vertical + horizontal)
- Border-radius
- Border (se houver)
- Font (size, weight, family)
- Ghost/outlined variant: same ou different?
```

#### Cards & Containers
```
- Background color
- Border (color + width)
- Border-radius
- Shadow (valor completo — todos os layers)
- Padding interno
```

#### Badges / Tags / Pills
```
- Background (default + variants)
- Text color
- Padding
- Border-radius
- Border (se houver)
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
- Background (sticky? com blur?)
- Logo placement
- Link style (size, weight, color)
- CTA button style
- Mobile behavior (hamburger?)
```

### Matriz de componentes a documentar:
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

### Exemplo de output:
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

### O que extrair:

#### Sistema de espaçamento
```
- Base unit: [ex: 4px ou 8px]
- Scale: [listar os valores do scale]
```

#### Grid & Container
```
- Max content width: [ex: ~1080px]
- Column count: [ex: 12 columns, 3-col grid]
- Gutter/gap: [ex: 24px]
```

#### Padrões de seção
```
- Hero: centered / left-aligned / full-bleed?
- Feature sections: grid layout ou stacked?
- Dark sections: usa seções escuras? com que cor?
- Section spacing rhythm: [ex: 64px desktop → 40px mobile]
```

### Exemplo de output:
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
- Section rhythm: [descrever padrão — ex: "white → dark → white"]
```

---

## 6. DEPTH & ELEVATION

### O que extrair — níveis de sombra:

| Level | Valor CSS | Uso |
|-------|-----------|-----|
| Flat | sem shadow | backgrounds |
| Ambient | `0px 3px 6px rgba(...)` | subtle lift |
| Standard | `0px 15px 35px rgba(...)` | cards, panels |
| Elevated | shadow completo | featured cards, dropdowns |
| Deep | shadow mais intenso | modals, floating |

### Também extrair:
- [ ] `box-shadow` de cards hover
- [ ] `box-shadow` de modals/dropdowns
- [ ] `backdrop-filter` se houver (blur)
- [ ] Bordas vs sombras — qual prefere?

### Exemplo de output:
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

### O que inferir das observações:

**Do** (padrões positivos identificados):
- [ ] Usa weight baixo (300) para headlines?
- [ ] Corner radius conservador (2-8px)?
- [ ] Shadows com tints de cor ou neutras?
- [ ] Cores de heading não são preto puro?
- [ ] OpenType features distintas?

**Don't** (padrões que NÃO usa):
- [ ] Não usa weight alto (600-700) em headlines?
- [ ] Não usa pill shapes (border-radius > 12px)?
- [ ] Não usa sombras neutras sem tint?
- [ ] Não usa preto (#000) puro?

### Exemplo de output:
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

### O que extrair:

#### Breakpoints
| Name | Width | Key Changes |
|------|-------|-------------|
| Mobile | <640px | |
| Tablet | 640-1024px | |
| Desktop | 1024-1280px | |
| Large Desktop | >1280px | |

#### Comportamentos típicos por breakpoint:
- [ ] Hero: 56px → ?px on mobile
- [ ] Navigation: horizontal → hamburger
- [ ] Feature grid: 3-col → 2-col → 1-col
- [ ] Section spacing: [desktop] → [mobile]
- [ ] Typography scale compression

### Exemplo de output:
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

### O que extrair — versão compacta:

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

## Checklist de Extração

Antes de finalizar o DESIGN.md, verifique:

- [ ] Homepage lida (jina_read)
- [ ] 3+ páginas internas lidas
- [ ] CSS inline/variáveis extraídas
- [ ] Todas as cores em hex/rgba documentadas
- [ ] Hierarquia tipográfica completa (Display → Caption)
- [ ] Shadow system documentado (todos os níveis)
- [ ] Componentes: Buttons (primary + ghost), Cards, Badges, Inputs, Nav
- [ ] Layout: spacing scale, max-width, grid
- [ ] Responsive breakpoints identificados
- [ ] Do's and Don'ts inferidos
- [ ] Agent Prompt Guide preenchido

---

## Template Rápido (copiar e preencher)

```markdown
# Design System Inspired by [Brand Name]

## 1. Visual Theme & Atmosphere
[2-3 frases de descrição + Key Characteristics]

## 2. Color Palette & Roles
[Todas as categorias de cor]

## 3. Typography Rules
[Fontes + Hierarquia completa]

## 4. Component Stylings
[Buttons, Cards, Badges, Inputs, Nav]

## 5. Layout Principles
[Spacing, Grid, Whitespace]

## 6. Depth & Elevation
[Shadow levels]

## 7. Do's and Don'ts
[Patterns positivos e negativos]

## 8. Responsive Behavior
[Breakpoints + Collapsing]

## 9. Agent Prompt Guide
[Quick reference + Examples]
```
