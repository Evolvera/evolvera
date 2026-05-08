# Design System Inspired by ArcelorMittal Brasil

## 1. Visual Theme & Atmosphere

ArcelorMittal Brasil's website is a bold, industrial-corporate design that balances the weight and strength of steel with modern digital elegance. The page opens on a clean white canvas with the signature ArcelorMittal red-orange (`#FF3700`) as the primary brand anchor. The site conveys solidity, reliability, and Brazilian warmth -- reflecting a global steel giant with local presence. The overall impression is professional and authoritative, with industrial heritage expressed through bold typography and strategic use of color.

The **Gilroy** font family defines the visual identity with its geometric, modern letterforms. At display sizes, headlines run at weight 600 -- notably bold without being aggressive -- creating confident, engineered blocks of text. The signature red-orange accent (`#FF3700`) appears as a 2px border at the header, CTA buttons, and interactive elements, functioning as both brand anchor and call-to-action color. The secondary blue (`#0070C0`) and tertiary purple/magenta (`#942184`) provide accent variety for different content types.

The site uses a distinctive hover gradient on buttons: `linear-gradient(90deg, #840d81, #fe6b45)` -- a purple-to-orange/pink transition that feels premium and unexpected for an industrial brand. Shadows are minimal to nonexistent; the design relies on borders, color blocking, and clean spacing for depth rather than elevation.

**Key Characteristics:**
- **Gilroy** as primary typeface -- geometric, modern, confident
- Weight 600 as the signature headline weight -- bold but refined
- ArcelorMittal Red (`#FF3700`) as primary CTA and brand anchor
- Purple-to-orange gradient on button hover -- a surprising premium touch
- Industrial-grade dark sections (`#151515`, `#2A2A2A`) contrasted with pure white
- Conservative border-radius (0px for buttons, 10px for media, 999px for pills)
- No shadows for elevation -- relies on borders and spacing
- Header with 2px red bottom border -- distinctive navigation identity

## 2. Color Palette & Roles

### Primary / Brand
- **ArcelorMittal Red** (`#FF3700`): Primary brand color, CTA backgrounds, header border, links on hover. The signature red-orange that anchors the entire system.
- **Dark** (`#151515`): `--clr-dark`. Hero backgrounds, dark sections for immersive brand moments.
- **Text Dark** (`#2A2A2A`): Primary body text color. Not pure black -- a warm dark gray.

### Secondary & Tertiary
- **Secondary Blue** (`#0070C0`): `--clr-secondary`. Secondary interactive elements, links, accents.
- **Tertiary Purple** (`#942184`): `--clr-tertiary`. Accent color for gradients and decorative elements.

### Backgrounds & Surfaces
- **Pure White** (`#FFFFFF`): `--clr-light`, `--bg-body`. Page background, card surfaces, button text on dark backgrounds.
- **Light Gray** (`#F0F0F0`): `--clr-light-1`. Light section backgrounds.
- **Warm White** (`#F8F6F2`): `--clr-light-2`. Warm-tinted surface backgrounds.
- **Soft Gray** (`#ECECEC`): `--clr-light-3`. Subtle surface differentiation.
- **Footer Dark** (`#2A2A2A`): `--clr-text` variant. Footer background (used as surface color).
- **Neutral Dark** (`#414141`): `--clr-neutral-dark`. Logo text on light backgrounds.

### Text
- **Body Text** (`#2A2A2A`): `--clr-text`. Primary body text color.
- **White Text** (`#FFFFFF`): For text on dark backgrounds.

### Interactive / CTA
- **Primary Red** (`#FF3700`): Primary CTA backgrounds, borders, link hover states.
- **Button Hover Gradient**: `linear-gradient(90deg, #840d81, #fe6b45)` -- Purple to orange/pink transition on button hover.
- **Link Hover Red** (`#FF3700`): Link hover color with underline animation.

### Borders & Dividers
- **Header Border** (`#FF3700`): 2px solid primary red -- distinctive header separator.
- **Neutral Border** (`#D8D8D8`): `--clr-neutral`. Subtle dividers and borders.
- **Neutral Light Border** (`#E6E9EE`): `--clr-neutral-light`. Light borders for cards, sections.
- **Footer Divider** (`#7A7A7A`): Footer copyright separator.

### Feedback
- **Primary Red** (`#FF3700`): Error/alert color (same as primary -- no separate error color).
- **Success Green** (implied `#15be53` or similar): Not explicitly defined in extracted CSS.

### Gradients
- **Button Hover**: `linear-gradient(90deg, #840d81, #fe6b45)` -- Purple (`#840d81`) to Orange/Pink (`#fe6b45`).
- **Hero Overlay**: `linear-gradient(90deg, rgba(0,0,0,.9) 5%, transparent 75%, transparent 100%)` -- Heavy dark overlay on hero images.
- **Featured Module Overlay**: `linear-gradient(90deg, rgba(0,0,0,.9) 0, transparent 75%, transparent 100%)` -- Similar to hero.

## 3. Typography Rules

### Font Family
- **Primary**: `Gilroy`, with fallback: `Arial, Helvetica, sans-serif`
- **OpenType Features**: Standard Gilroy with no explicit OpenType features in CSS.

### Hierarchy

| Role | Font | Size | Weight | Line Height | Letter Spacing | Notes |
|------|------|------|--------|-------------|----------------|-------|
| Display Hero | Gilroy | 66px (6.6rem) | 600 | ~1.25 (82.5px) | -0.5px | Maximum size, bold headlines |
| Display Large | Gilroy | 50px (5.0rem) | 600 | ~1.25 (62.5px) | -0.5px | Section hero headlines |
| Section Heading | Gilroy | 37px (3.7rem) | 600 | ~1.15 (42.5px) | -0.5px | Feature section titles |
| Sub-heading Large | Gilroy | 28px (2.8rem) | 600 | ~1.25 (35px) | -0.5px | Card headings, large sub-sections |
| Sub-heading | Gilroy | 21px (2.1rem) | 600 | ~1.26 (26.5px) | -0.5px | Smaller section heads, body intro |
| Body Large | Gilroy | 18px (1.8rem) | 400 | ~1.11 (20px) | 0 | Feature descriptions, intro text |
| Body | Gilroy | 16px (1.6rem) | 400 | ~1.25 (20px) | 0 | Standard reading text |
| Label | Gilroy | 14px (1.4rem) | 400-600 | ~1.25 (17.5px) | 0 | Form labels, navigation links |
| Button | Gilroy | 18px (1.8rem) | 400 | -- | 0 | Primary button text |
| Button2 | Gilroy | 16px (1.6rem) | 400 | -- | 0.196px (tracked) | Secondary button with uppercase |

### CSS Variables for Typography
```css
--fw-light: 300;
--fw-normal: 400;
--fw-medium: 500;
--fw-semibold: 600;
--fw-bold: 700;
--fw-extrabold: 800;

--fs-h1: 6.6rem;
--fs-h2: 5rem;
--fs-h3: 3.7rem;
--fs-h4: 2.8rem;
--fs-h5: 2.1rem;
--fs-body: 1.6rem;
--fs-body2: 1.8rem;
--fs-label: 1.4rem;
```

### Principles
- **Bold headlines as signature**: Weight 600 at all heading sizes -- confident, engineered, industrial.
- **Tight letter-spacing on headings**: -0.5px on H1-H5 creates dense, engineered text blocks.
- **Progressive size reduction**: 6.6rem → 5rem → 3.7rem → 2.8rem → 2.1rem for H1-H5.
- **Letter-spacing on tracked elements**: Button2 uses 0.196rem tracking for uppercase labels.
- **Two body sizes**: 1.6rem standard, 1.8rem for emphasis/descriptions.
- **No weight below 400 for body**: Light weight (300) defined but not prominently used.

## 4. Component Stylings

### Buttons

**Primary Button (`.button`)**
- Background: `transparent` (starts transparent, fills on hover)
- Text: `#2A2A2A` (dark text, inverts to white on hover)
- Padding: 26px 70px 26px 30px (vertical-heavy, asymmetric horizontal)
- Border: `1px solid var(--clr-primary)` (1px red border)
- Border-radius: 0px (sharp corners)
- Font: 18px Gilroy weight 400
- Icon: Right-aligned arrow SVG (25x25px), color-filtered to match text
- Hover: Border-image gradient fill, white text, arrow inverts to white
- Gradient hover: `linear-gradient(90deg, #840d81, #fe6b45)` (purple to orange)
- Use: Primary CTAs ("Saiba mais", "Conheça mais")

**Primary Button Left (`.button.-left`)**
- Same as Primary Button but padding: 85px 30px (icon on left, flipped)
- Arrow positioned left with scaleX(-1) transform

**Primary Button Light (`.button.-light`)**
- For use on dark/image backgrounds
- Text: `#FFFFFF`
- Border: `inherit` (white border)
- Arrow already inverted (white)

**Primary Button Dark (`.button.-dark`)**
- For use on light backgrounds
- Arrow filter: `brightness(0) saturate(100%) invert(12%) sepia(9%) saturate(19%) hue-rotate(28deg) brightness(94%) contrast(88%)` (dark arrow)

**Button2 (`.button2`)** -- Pill-style CTA
- Background: `transparent` with gradient border
- Text: 16px Gilroy weight 400, uppercase, `letter-spacing: 0.196rem`
- Padding: 15px 32px
- Border-radius: 999px (pill shape)
- Border: 1.5px gradient border using `radial-gradient` with mask technique
- Gradient: `#ac2a6f 0%, #e5524d 19%, #f93641 46.5%, #ff8f47 95%`
- Icon: Play button SVG (14x14px) on right
- Hover: `background-color: #ffefea`
- Use: Media/video CTAs

**Button Link (`.button-link`)**
- Background: none
- Text: currentColor with underline via `background-image: linear-gradient(currentColor, currentColor)`
- Background-position: 0 100% (underline at bottom)
- Background-size: 100% 2px (2px underline)
- Hover animation: `draw-line` keyframes -- underline draws from left to right
- Light variant: `color: #FFFFFF`

### Cards & Containers

**Standard Card (`.listing-products .item`)**
- Background: transparent (inherits from parent)
- Border: none
- Border-radius: 0px
- Padding: 0
- Image container: `border-radius: var(--media-br)` (10px), `aspect-ratio: 2.01/1`
- Image: 100% width, border-radius inherited
- Title: 21px Gilroy weight 600, line-height 26.5px, `text-wrap: balance`
- Link: 18px Gilroy weight 400, `text-decoration: underline`, 2px thickness

**Featured Module (`.featured-module`)** -- Hero-style card
- Background: `--clr-dark` (`#151515`) or image/video
- Text: `#FFFFFF`
- Border-radius: 0
- Overlay: `linear-gradient(90deg, rgba(0,0,0,.9) 0, transparent 75%, transparent 100%)`
- Container: Flexbox, content aligned to start
- Title: 50px Gilroy weight 600, max-width 630px
- Description: 21px Gilroy weight 400, line-height 1.25, max-width 630px
- Sizes: min-height 600px (default), 500px (-medium), 424px (-small), 300px (-x-small)
- Border-bottom variant: 22px gradient bar at bottom (`#6c027a` to `#ff9d4f`)

**Text 50/50 (`.text-5050`)**
- Background: `--clr-neutral-light` (`#E6E9EE`)
- Padding: 64px vertical (80px on desktop)
- Grid: 2 columns (1fr 1fr) on desktop, stacked on mobile
- Gap: 32px (10% on desktop)
- Image: `border-radius: var(--media-br)` (10px)
- Title: 37px Gilroy weight 600
- Body: 16px (21px desktop)
- Reverse variant: columns swapped

### Badges / Tags / Pills

**Swiper Pagination Bullet (`.swiper-pagination-bullet`)**
- Size: 10px diameter, 37px width (elongated pill)
- Inactive: `--swiper-pagination-bullet-inactive-color` (typically `#646464` or `#C4C4C4`)
- Active: `--swiper-pagination-color` (typically `--clr-primary` = `#FF3700`)
- Border-radius: 50% (circular)
- Contains: Dot (10px circle) + SVG progress ring
- Progress ring: stroke-dasharray 314, stroke-dashoffset animated

**Button2 Badge (`.button2`)**
- Uses pill border-radius (999px)
- Gradient border via radial-gradient mask technique
- Not a traditional badge -- a pill-shaped CTA

### Inputs & Forms

**Search Input (in header)**
- Background: transparent
- Text: `#FFFFFF` on dark, `#2A2A2A` on light
- Font: 16px Gilroy weight 400
- Padding: 0 (handled by container)
- Border: none
- Placeholder: `color: inherit` (inherits from text color)
- Focus: outline none (handled by container)

**Form Label**
- Font: 14px Gilroy
- Margin-bottom: 5px
- Display: block
- Hidden variant: `label:not(.visible) { display: none }`

### Navigation

**Header (`.header`)**
- Background: `rgba(37,37,37,.9)` (semi-transparent dark)
- Border-bottom: `2px solid var(--clr-primary)` (2px red)
- Position: fixed, top 0, z-index 11
- Height: 76px (mobile), 89px (desktop)
- Container: flex, gap 30px, align-items flex-end
- Transition: background 0.3s ease, transform 0.3s ease

**Header Light (`.header.-light`)**
- Background: `#FFFFFF`
- Logo symbol: `--clr-primary` (red)
- Logo text: `#414141` (dark gray)
- Nav links: `#000000`

**Logo**
- SVG-based, 165px max-width
- Color: currentColor (inherits)
- Symbol: primary brand color in header
- Text: white in header, dark on light backgrounds

**Nav Links (`.nav .link`)**
- Font: 14px Gilroy weight 600
- Padding: 6px 10px
- Color: `#FFFFFF` (on dark header)
- Hover: `--clr-primary` (`#FF3700`)
- Transition: color 0.25s ease-in-out

**Secondary Nav (`.header .secondary`)**
- Background: `--clr-primary` (`#FF3700`)
- Color: `#FFFFFF`
- Padding: 6px 29px 6px 76px
- Border-radius: 0 0 0 20px (top-left corner rounded)
- Links hover: `#151515`

**Mobile Nav**
- Full-screen overlay (position fixed)
- Background: `#FFFFFF`
- Transform: translateX(105%) when closed, translateX(0) when open
- Primary links: 37px Gilroy weight 600
- Submenu links: 18px Gilroy weight 400
- Back button: 14px Gilroy, red color with back arrow SVG

**Mega Panel (desktop dropdown)**
- Background: `#FFFFFF`
- Border-top: `2px solid var(--clr-primary)`
- Padding: 33px 0 57px
- Grid: 32% + 3 equal columns
- Animation: fade-in with translateX from left
- Shadow on open: `0 5px 5px 0 rgba(0,0,0,.15)`

### Footer

**Footer (`.footer`)**
- Background: `#2A2A2A`
- Color: `#FFFFFF`
- Padding: 50px 0 26px
- Grid layout: brand + nav columns
- Social icons: 25px gap, centered

**Footer Links (`.footer .nav .link`)**
- Font: 16px Gilroy weight 300 (light)
- Color: `#FFFFFF`

**Footer Copyright**
- Border-top: 1px solid `#7A7A7A`
- Padding-top: 26px
- Flex layout with gap 30px

**Footer Legal Links (`.footer .legal .link`)**
- Font: 14px Gilroy weight 400
- Text-decoration: underline
- Text-decoration-thickness: 1px

## 5. Layout Principles

### Spacing System
- Base unit: ~5px (implied by padding values)
- Common spacing values: 5px, 10px, 15px, 20px, 24px, 30px, 32px, 40px, 50px, 64px, 76px, 80px, 95px
- Container padding: 15px (mobile), 24px (tablet), 15px (desktop)
- Section spacing: 44-66px vertical (varies by section)

### Grid & Container
- Max content width: `--container-mw: 1234px`
- Container padding: `--container-py: 15px` (scales up on tablet/desktop)
- Feature grid (`.listing-products`): 1-col mobile, 2-col tablet (768px+), 4-col desktop (1200px+)
- Text 50/50 grid: Stacked mobile, 2-col (1fr 1fr) desktop with 10% gap
- Footer grid: 25.5% + auto + 10% on large screens

### Whitespace Philosophy
- **Industrial density**: Relatively tight spacing for a corporate-industrial feel
- Section rhythm: `44px → 54px → 64px → 80px` mobile to desktop
- Hero: Full-bleed with dark overlay
- Feature sections: Alternating white/light-gray backgrounds
- Dark sections: Hero, Footer (distinct dark identity)

### Responsive Breakpoints
| Name | Width | Key Changes |
|------|-------|-------------|
| Mobile | <768px | Single column, hamburger nav, reduced headings |
| Tablet | 768-1199px | 2-col grids, 24px container padding |
| Desktop | >=1200px | Full layout, 4-col grids, mega panel nav |
| Large Desktop | >=1400px | Adjusted logo margin |

### Header Behavior
- Mobile (<1200px): Hidden nav, hamburger menu, scroll-to-top behavior
- Desktop (>=1200px): Full horizontal nav, mega panel dropdowns
- Scroll behavior: Hide header on scroll down, show on scroll up
- Light/dark variants based on scroll position and page context

## 6. Depth & Elevation

### Shadow System
ArcelorMittal Brasil **does not use shadows** for elevation. The design relies entirely on:
1. **Borders**: 1px borders for card definition, 2px red border for header
2. **Color blocking**: Dark vs light section contrast
3. **Spacing**: Generous padding creates visual separation
4. **Overlays**: Dark gradient overlays on hero images create depth

### Elevation Levels
| Level | Treatment | Use |
|-------|-----------|-----|
| Flat (Level 0) | No shadow | Page background, all surfaces |
| Ambient | Semi-transparent header background `rgba(37,37,37,.9)` | Header with backdrop blur feel |
| Overlay | Dark gradient `linear-gradient(rgba(0,0,0,.9), transparent)` | Hero images, featured modules |
| Border | 1px solid borders | Card definitions |
| Focus Ring | `filter: drop-shadow(0 0 1px rgba(0,0,0,.2))` | Swiper controls on light backgrounds |

### Hover States (instead of elevation)
- **Buttons**: Gradient fill from right, text color inversion
- **Links**: Underline draw animation (0% → 100% width)
- **Cards**: Not applicable (no hover effect on listing cards in extracted CSS)

## 7. Do's and Don'ts

### Do
- Use Gilroy with weight 600 for all headings (H1-H5)
- Apply the signature red-orange (`#FF3700`) for CTAs and brand moments
- Use -0.5px letter-spacing on headings for tight, engineered feel
- Create dark sections with `#151515` or `#2A2A2A`
- Apply 2px red border at top of header for brand identity
- Use the purple-to-orange gradient (`linear-gradient(90deg, #840d81, #fe6b45)`) for button hover
- Use border-radius: 0 for primary buttons (sharp, industrial)
- Use border-radius: 10px for media/images
- Use border-radius: 999px for pill-style CTAs (Button2)
- Create underline links with `background-image` gradient technique
- Apply dark gradient overlays on hero images

### Don't
- Don't use weight below 600 for headlines (300 is defined but not used for headings)
- Don't use shadows for elevation (the design doesn't use them)
- Don't use pure black (`#000000`) for text -- use `#2A2A2A` or `#151515`
- Don't use large border-radius on primary buttons (keep at 0)
- Don't skip the 2px red border on the header
- Don't use blue or purple as primary CTA colors (those are secondary/tertiary)
- Don't use centered hero text (left-aligned is the standard)
- Don't use serif fonts (Gilroy is the only choice)

## 8. Responsive Behavior

### Breakpoints
| Name | Width | Key Changes |
|------|-------|-------------|
| Mobile | <768px | Single column, hamburger nav, H1 at 37px |
| Tablet | 768-1199px | 2-col product grids, 24px padding |
| Desktop | 1200-1399px | Full nav, mega panel, 4-col grids, H1 at 66px |
| Large Desktop | >=1400px | Logo margin adjustment, container 1284px |

### Typography Scaling
- **H1**: 37px (mobile) → 50px (tablet) → 66px (desktop)
- **H3**: 37px (mobile) → stays 37px (this is the section heading size)
- **Body**: 16px (mobile) → 18-21px (desktop for descriptions)
- **Button**: 18px throughout

### Navigation Collapse
- Desktop: Horizontal nav with mega panel dropdowns
- Mobile: Full-screen overlay with hamburger toggle
- Scroll behavior: Header hides on scroll down, reappears on scroll up
- Search: Hidden input expands from right on mobile

### Grid Collapse
- **Listing Products**: 1-col → 2-col (768px) → 4-col (1200px)
- **Text 50/50**: Stacked → 2-col grid (1200px)
- **Footer Nav**: Stacked → 2-col → inline grid (992px+)

### Spacing Adjustment
- Hero container min-height: 496px → 521px (desktop)
- Featured module min-height: 550px → 600px → 760px (scaling up)
- Section padding: 44px → 55-66px (desktop)
- Button padding maintained across breakpoints (26px 70px 26px 30px)

## 9. Agent Prompt Guide

### Quick Color Reference
- **Primary CTA**: `#FF3700` -- ArcelorMittal Red
- **Secondary**: `#0070C0` -- Blue
- **Tertiary**: `#942184` -- Purple
- **Background**: `#FFFFFF`
- **Dark Section**: `#151515`
- **Footer**: `#2A2A2A`
- **Heading text**: `#2A2A2A`
- **Body text**: `#2A2A2A`
- **Header border**: `#FF3700` (2px)
- **Neutral border**: `#D8D8D8`
- **Button hover gradient**: `linear-gradient(90deg, #840d81, #fe6b45)`
- **Hero overlay**: `linear-gradient(90deg, rgba(0,0,0,.9), transparent)`

### Example Component Prompts

**1. Hero Section**
```
"Create a hero section on dark background (#151515). 
Headline at 66px Gilroy weight 600, line-height 82.5px, letter-spacing -0.5px, color #FFFFFF. 
Description at 21px Gilroy weight 400, line-height 1.25, color #FFFFFF. 
Primary button: transparent background, 1px #FF3700 border, 0px radius, 18px Gilroy weight 400, text #2A2A2A. 
On hover: fill with linear-gradient(90deg, #840d81, #fe6b45), text becomes #FFFFFF. 
Image background with overlay: linear-gradient(90deg, rgba(0,0,0,.9) 5%, transparent 75%)."
```

**2. Product Card**
```
"Create a product card: no background, no border. 
Image container: border-radius 10px, aspect-ratio 2.01/1. 
Title at 21px Gilroy weight 600, line-height 26.5px, color #2A2A2A. 
Link at 18px Gilroy weight 400, text-decoration underline (2px), color inherits. 
Grid: 1-col mobile, 2-col tablet, 4-col desktop."
```

**3. Button Primary**
```
"Create a primary button: transparent background, 1px solid #FF3700 border, 0px border-radius. 
Padding: 26px top/bottom, 70px right, 30px left. 
Text: 18px Gilroy weight 400, color #2A2A2A. 
Arrow icon (25x25px SVG) positioned right with 20px offset, same color as text. 
On hover: border-image with linear-gradient(90deg, #840d81, #fe6b45), text becomes #FFFFFF, arrow filter: invert(1) brightness(2)."
```

**4. Featured Module (Dark Hero Card)**
```
"Create a featured module: dark background (#151515) or full-bleed image with overlay. 
Gradient overlay: linear-gradient(90deg, rgba(0,0,0,.9) 0, transparent 75%). 
Title at 50px Gilroy weight 600, max-width 630px, color #FFFFFF. 
Description at 21px Gilroy weight 400, line-height 1.25, max-width 630px, color #FFFFFF. 
Button: same as primary button but with -light variant (white border, arrow already inverted). 
Min-height: 600px (flexbox, content aligned to start)."
```

**5. Navigation Header**
```
"Create a fixed header: background rgba(37,37,37,.9), 2px bottom border in #FF3700. 
Height: 76px mobile, 89px desktop. 
Logo: SVG, max-width 165px. 
Nav links: 14px Gilroy weight 600, color #FFFFFF, padding 6px 10px. 
On hover: color #FF3700. 
Secondary nav area: background #FF3700, white text, border-radius 0 0 0 20px. 
Mobile: hamburger menu (25x16px), full-screen overlay nav."
```

**6. Footer**
```
"Create a footer: background #2A2A2A, color #FFFFFF, padding 50px 0 26px. 
Logo: SVG, max-width 165px. 
Nav links: 16px Gilroy weight 300. 
Copyright: border-top 1px solid #7A7A7A, padding-top 26px. 
Legal links: 14px Gilroy weight 400, text-decoration underline, 1px thickness."
```

### CSS Variables Reference
```css
:root {
  --clr-primary: #FF3700;
  --clr-secondary: #0070C0;
  --clr-tertiary: #942184;
  --clr-light: #FFF;
  --clr-light-1: #F0F0F0;
  --clr-light-2: #F8F6F2;
  --clr-light-3: #ECECEC;
  --clr-dark: #151515;
  --clr-neutral: #D8D8D8;
  --clr-neutral-dark: #414141;
  --clr-neutral-light: #E6E9EE;
  --clr-text: #2A2A2A;
  --bg-body: #FFF;
  
  --fw-light: 300;
  --fw-normal: 400;
  --fw-medium: 500;
  --fw-semibold: 600;
  --fw-bold: 700;
  --fw-extrabold: 800;
  
  --fs-h1: 6.6rem;
  --fs-h2: 5rem;
  --fs-h3: 3.7rem;
  --fs-h4: 2.8rem;
  --fs-h5: 2.1rem;
  --fs-body: 1.6rem;
  --fs-body2: 1.8rem;
  --fs-label: 1.4rem;
  
  --lh-h1: 82.5px;
  --lh-h2: 62.5px;
  --lh-h3: 42.5px;
  --lh-h4: 35px;
  --lh-h5: 26.5px;
  --lh-body: 20px;
  --lh-body2: 20px;
  --lh-label: 17.5px;
  
  --header-h: 76px;
  --container-mw: 1234px;
  --container-py: 15px;
  --media-br: 10px;
  --pill-br: 999px;
}
```

---

## Sources
- Main CSS: `https://brasil.arcelormittal.com/assets/css/main.min.css`
- Home Page CSS: `https://brasil.arcelormittal.com/assets/css/pages/home.min.css`
- Carousel CSS: `https://brasil.arcelormittal.com/assets/css/components/carousel.min.css`
- Featured Module CSS: `https://brasil.arcelormittal.com/assets/css/components/featured-module.min.css`
- Listing Products CSS: `https://brasil.arcelormittal.com/assets/css/components/listing-products.min.css`
- HTML: `https://brasil.arcelormittal.com/`
