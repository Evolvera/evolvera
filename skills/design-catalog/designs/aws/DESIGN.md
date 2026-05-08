# Design System Inspired by Amazon Web Services (AWS)

## 1. Visual Theme & Atmosphere

AWS's website is a massive-scale enterprise cloud platform that balances authority with approachability. The page opens on a white canvas (`#ffffff`) with dark navy headings (`#232f3e`) and a signature orange (`#e47911`) that serves as the primary CTA and brand accent. This is a utilitarian, information-dense design system built for developers and enterprises -- not flashy or decorative, but highly functional and trustworthy. The overall impression is of a professional, established technology company that prioritizes clarity and ease of navigation over aesthetic flair.

The AWS design language, implemented through the "Libra" CSS framework, is characterized by a systematic, utility-class approach (similar to Bootstrap's "lb-" prefixed classes). The primary typeface is Amazon Ember (a custom Amazon font) with Helvetica Neue and Arial as fallbacks. The system is deliberately conservative with typography -- weight 400-500 for body text, weight 200 for light variants. Color plays a functional role: Squid Ink (`#232f3e`) for primary headings and text, Orange (`#e47911`) for brand accent and CTAs, and a full spectrum of muted blues for service categories and interactive elements.

**Key Characteristics:**
- Amazon Ember font family with Helvetica Neue fallback -- a proprietary typeface optimized for readability at all sizes
- Weight 400-500 as the primary text weight -- professional, not bold, not light
- Squid Ink (`#232f3e`) as the dominant heading/text color -- deep navy, not pure black
- AWS Orange (`#e47911`) as the signature brand accent -- warm, Amazon-family orange
- Multi-theme support with "dark" variants (Squid Ink backgrounds with white text)
- Service color coding system with distinct colors for different AWS service categories
- Utility-first CSS architecture (Libra framework) with systematic spacing and radius scales
- Card-based layouts with subtle shadows and consistent padding

## 2. Color Palette & Roles

### Primary Brand
- **AWS Orange** (`#e47911`): Primary brand color, main CTAs, "Sign Up" buttons, featured links
- **Squid Ink** (`#232f3e`): Primary heading color, main body text, navigation
- **Dark Squid Ink** (`#161e2d`): Dark section backgrounds, footer, inverted layouts
- **Pure White** (`#ffffff`): Page background, card surfaces, button text on dark

### Secondary Neutrals
- **Charcoal** (`#333`): Secondary text, body copy
- **Gray 500** (`#5f6b7a`): Tertiary text, captions, metadata, timestamps
- **Gray 400** (`#879196`): Disabled states, placeholders, muted text
- **Gray 300** (`#aab7b8`): Borders, dividers, subtle separators
- **Gray 200** (`#d5dbdb`): Light borders, card dividers
- **Gray 100** (`#eaeded`): Backgrounds, alternating rows, subtle surfaces
- **Off White** (`#f1f3f3`): Light section backgrounds, cards

### Interactive / Link Colors
- **AWS Blue** (`#0972d3`): Primary link color, interactive elements
- **AWS Blue Visited** (`#065299`): Visited link state
- **AWS Blue Hover** (`#033160`): Link hover/active state
- **AWS Blue Light** (`#539fe5`): Sky Blue for decorative highlights

### Service Category Colors (AWS-specific)
- **Computing** (`#ff9900`): EC2, Lambda, etc.
- **Database** (`#3b48cc`): RDS, DynamoDB, etc.
- **Storage** (`#2489d3`): S3, EBS, etc.
- **Networking** (`#c925d1`): VPC, Route 53, etc.
- **Developer Tools** (`#7b7ebd`): CodeCommit, CodeBuild, etc.
- **Machine Learning** (`#01a88d`): SageMaker, AI services
- **Analytics** (`#9897d9`): Redshift, Athena, etc.
- **Security** (`#d6242d`): IAM, KMS, etc.

### Skeleton / Loading States
- **Skeleton Dark** (`#0b1923`): Dark mode skeleton background
- **Skeleton Light** (`#eaeded`): Light mode skeleton background

### Borders & Dividers
- **Border Default** (`#d5dbdb`): Standard borders
- **Border Dark** (`#aab7b8`): Emphasized borders
- **Border Light** (`#eaeded`): Subtle dividers
- **Border Feature** (box-shadow): `0 1px 3px 0 rgba(0,0,0,.3),0 0 0 1px rgba(0,0,0,.04)`

### Feedback Colors
- **Success Green** (`#1e8900`): Success states, positive indicators
- **Success Light** (`#ebfaeb`): Success backgrounds
- **Error Red** (`#c40000`): Error states, destructive actions
- **Error Light** (`#f2dede`): Error backgrounds
- **Warning Orange** (`#e47911`): Warning states (same as brand)
- **Info Blue** (`#007dbc`): Informational states

### Shadow Colors
- **Shadow Dark** (`rgba(0,0,0,.3)`): Primary shadow color
- **Shadow Medium** (`rgba(0,0,0,.15)`): Medium shadow intensity
- **Shadow Light** (`rgba(0,0,0,.1)`): Subtle shadow
- **Shadow Ambient** (`rgba(0,0,0,.04)`): Near-invisible ambient

## 3. Typography Rules

### Font Family
- **Primary**: `AmazonEmber`, with fallback: `Helvetica Neue, Helvetica, Arial, sans-serif`
- **Bold**: `AmazonEmberBold`, with fallback: `Helvetica Neue Bold, Helvetica, Arial, sans-serif`
- **Light**: `AmazonEmberLight`, with fallback: `Helvetica Neue Light, Helvetica, Arial, sans-serif`
- **CJK Variants**: Custom overrides for Chinese (`Microsoft YaHei`), Japanese (`Hiragino Kaku Gothic Pro`), Korean (`Malgun Gothic`), Thai (`Prompt`), Arabic (`AmazonEmberArabic`)
- **Monospace**: System monospace for code: `SFMono-Regular, Consolas, monospace`

### Hierarchy

| Role | Font | Size | Weight | Line Height | Letter Spacing | Notes |
|------|------|------|--------|-------------|----------------|-------|
| Display Hero | AmazonEmber | 42px (large callouts) | 400 | 48px | normal | Service card headlines |
| Section Heading | AmazonEmber | 24px | 500 | 1.1 | normal | Card titles, major headings |
| Sub-heading | AmazonEmber | 18px | 400 | normal | normal | Feature headlines |
| Body Large | AmazonEmber | 15px-16px | 400 | 1.3-1.5 | normal | Primary body text |
| Body | AmazonEmber | 14px | 400 | 1.4-1.5 | normal | Standard text |
| Caption | AmazonEmber | 12px-13px | 400 | 1.4 | normal | Metadata, timestamps |
| Micro | AmazonEmber | 11px | 400 | normal | normal | Fine print, legal |
| Link | AmazonEmber | inherit | 400 | inherit | normal | Underline on hover |
| Button | AmazonEmber | 14px-16px | 500 | normal | normal | All caps possible |

### Principles
- **Weight 400-500 as baseline**: AWS typography is not bold (600+) nor light (200+) for body -- it's a deliberate medium weight for readability
- **Line-height 1.1-1.5**: Tight for headings (1.1), comfortable for body (1.4-1.5)
- **No letter-spacing manipulation**: AWS doesn't use negative tracking like Stripe -- spacing is normal throughout
- **Rem-based sizing**: Uses both `px` and `rem` for responsive scaling (1.5rem = 15px equivalent)
- **Text transforms**: Buttons may use `uppercase`, but body text is sentence case

## 4. Component Stylings

### Buttons

**Primary CTA (Orange)**
- Background: `#e47911`
- Text: `#ffffff`
- Padding: 8px-13px vertical, 13px-22px horizontal (varies by size)
- Radius: 3px-5px (lb-tiny-radius: 3px, lb-small-radius: 5px)
- Font: AmazonEmberBold 14px-16px, weight 500
- Hover: Darker orange (`#c97600` or similar)
- Active: Pressed state with slight darkening

**Secondary CTA (Outline/Ghost)**
- Background: transparent
- Text: `#232f3e` (Squid Ink) or `#0972d3` (AWS Blue)
- Border: 1px solid `#d5dbdb` or colored border
- Radius: 3px-5px
- Hover: Light background fill

**Navigation Button (Dark)**
- Background: `#232f3e` (Squid Ink)
- Text: `#ffffff`
- Padding: 8px 13px
- Radius: 3px
- Font: AmazonEmber 14px weight 500

**Create Account Button**
- Background: `#e47911`
- Text: `#ffffff`
- All caps or title case
- Prominent placement in header

### Cards & Containers

**Proton Card (Standard)**
- Background: `#ffffff`
- Border: none (uses shadow instead)
- Radius: varies (3px-8px depending on context)
- Shadow: `-1px 2px 2px 0 #e0e0e0, 0 1px 2px 0 #d0d0d0` (subtle layered shadow)
- Padding: 10px-20px internal
- Border-top: 4px solid `#444` (colored accent strip on some cards)

**Showcase Card**
- Background: `#ffffff`
- Border: `1px solid #979797`
- Shadow: none
- Radius: none
- Padding: 0

**Feature Image Card**
- Background: covers image
- Border: `2px solid #7c7c7c` (on dark variant)
- Grayscale filter on hover with color restoration on hover

**Card Title**
- Font: AmazonEmberBold, 24px, weight 500
- Color: `#444` or `#232f3e`
- Line-height: 1.1

**Card Category/Label**
- Font: AmazonEmber, 14px
- Color: `#333`

### Badges / Tags / Pills

**Neutral Badge**
- Background: `#f1f3f3` or `#eaeded`
- Text: `#333` or `#5f6b7a`
- Padding: 0px 6px-10px
- Radius: 3px-5px
- Font: AmazonEmber 11px-12px

**Service Category Badge**
- Color-coded by AWS service category (see Color Palette section)
- Uses corresponding category color for text/background

### Inputs & Forms

**Text Input**
- Border: `1px solid #d5dbdb`
- Radius: 3px-5px
- Focus: `outline-color: #0972d3` (AWS Blue), `outline-offset: 2px`
- Label: `#5f6b7a` (Gray 500)
- Text: `#333` or `#232f3e`
- Placeholder: `#879196` (Gray 400)

**Search Field**
- Border: subtle, often with icon
- Background: white
- Placeholder: "Search" text

### Navigation

**Desktop Nav**
- Background: white with subtle shadow on scroll
- Logo: AWS smile logo, left-aligned
- Links: AmazonEmber 14px, `#232f3e` text
- Dropdowns: Popover style with arrow indicators
- CTA: Orange "Sign Up" button right-aligned

**Mobile Nav**
- Hamburger toggle
- Full-screen overlay
- Sticky language selector

**Footer**
- Background: `#232f3e` (Squid Ink) or `#161e2d` (Dark Squid Ink)
- Text: white or `#aab7b8`
- Links: white, hover underline
- Social icons: white SVG icons
- Language selector in footer

### Decorative Elements

**Horizontal Dividers**
- `1px solid #eaeded` or `#d5dbdb`
- Used between card sections

**Skewed Arrows (Side Scroll)**
- `transform: rotate(-50deg) skew(-10deg)` for left arrow
- `transform: rotate(50deg) skew(10deg)` for right arrow
- Border color: `#d5dbdb`

**Focus Ring**
- `outline-color: #0972d3`
- `outline-offset: 2px`
- `outline-style: solid`
- `outline-width: 2px`

## 5. Layout Principles

### Spacing System (Libra CSS)
- Base unit: 5px (micro), 10px (gutter/tiny)
- Scale: 0, 5px, 10px, 15px, 20px, 30px, 60px
- Named classes: lb-micro (5px), lb-tiny (10px), lb-small (15px), lb-mid (30px), lb-large (60px)

### Grid & Container
- Max content width: Uses 12-column responsive grid (lb-col)
- Breakpoints: 481px (small), 769px (mid), 980px (large), 1200px (xlarge)
- Gutter: 10px standard
- Content max-width: ~1200px+ for large screens

### Whitespace Philosophy
- **Functional spacing**: Every margin/padding has a purpose
- **Dense but organized**: Information-rich without feeling cluttered
- **Consistent rhythm**: 10px-15px between related items, 30px-60px between sections
- **Card-based grouping**: Related content lives in bordered/shadowed containers

### Section Patterns
- Hero: Left-aligned or centered content, large headline, CTA buttons
- Feature sections: Grid of cards (3-col, 2-col, or 1-col responsive)
- Dark sections: Inverted colors (dark bg, white text) for emphasis
- Side-scroll: Horizontal scrolling card carousels with nav arrows

### Border Radius Scale
- Micro: 2px (fine elements)
- Tiny: 3px (buttons, inputs, badges)
- Small: 5px (cards, containers)
- Mid: 8px (larger containers)
- Large: 12px (featured elements)
- XLarge: 16px (special containers)
- Round: 1000px (pills, circular elements)

## 6. Depth & Elevation

| Level | Treatment | Use |
|-------|-----------|-----|
| Flat (Level 0) | No shadow | Page background, inline text |
| Subtle (Level 1) | `-1px 2px 2px 0 #e0e0e0, 0 1px 2px 0 #d0d0d0` | Proton cards, standard containers |
| Feature (Level 2) | `0 1px 3px 0 rgba(0,0,0,.3), 0 0 0 1px rgba(0,0,0,.04)` | Featured cards, feature borders |
| Elevated (Level 3) | Darker shadow + border | Dropdowns, popovers |
| Skeleton Dark | `#0b1923` with shimmer animation | Loading states in dark mode |
| Skeleton Light | `#eaeded` with shimmer animation | Loading states in light mode |

**Shadow Philosophy**: AWS prefers subtle, neutral shadows with a slight gray tint. The primary shadow color is `rgba(0,0,0,.3)` -- not blue-tinted like Stripe, but pure neutral. Shadows are typically combined with a 1px border (`rgba(0,0,0,.04)`) for definition.

### Hover States
- Card hover: Subtle shadow intensification
- Button hover: Background color darkening
- Link hover: Underline appears
- Image cards: Grayscale removal (color on hover)

## 7. Do's and Don'ts

### Do
- Use Amazon Ember font family for all text (with appropriate fallbacks)
- Use Squid Ink (`#232f3e`) for headings instead of pure black
- Use AWS Orange (`#e47911`) for primary CTAs and brand moments
- Apply the utility-class spacing system consistently (lb-tiny, lb-small, lb-mid, lb-large)
- Use the border-radius scale: 3px-5px for interactive elements, 8px+ for containers
- Apply subtle layered shadows for cards: `-1px 2px 2px 0 #e0e0e0, 0 1px 2px 0 #d0d0d0`
- Use white backgrounds (`#ffffff`) with gray (`#eaeded`) for alternating sections
- Apply blue (`#0972d3`) for all interactive links

### Don't
- Don't use weight 700+ for body text (AWS uses 400-500)
- Don't use large border-radius (12px+) on buttons or small elements
- Don't use blue-tinted or colored shadows -- keep them neutral gray
- Don't use pure black (`#000000`) for any text
- Don't skip the focus ring outline for accessibility
- Don't use decorative gradients in the main UI (reserved for hero/feature sections)
- Don't use Amazon Ember for CJK languages -- use language-specific font families
- Don't use overly rounded/pill shapes (AWS is conservative with radius)

## 8. Responsive Behavior

### Breakpoints
| Name | Width | Key Changes |
|------|-------|-------------|
| Tiny/Mobile | <481px | Single column, stacked layout, hamburger nav |
| Small/Tablet | 481-768px | 2-column grids, reduced spacing |
| Mid/Desktop | 769-979px | Standard layout, 2-3 column grids |
| Large/Wide | 980-1199px | Full layout, 3-column feature grids |
| XLarge | 1200px+ | Max-width content with generous margins |

### Collapsing Strategy
- Hero: Headlines reduce from 42px to 24px-32px on mobile
- Navigation: Horizontal links + CTAs -> hamburger toggle
- Feature cards: 3-col -> 2-col -> single column stacked
- Side-scroll carousels: Maintain horizontal scroll with arrow nav
- Section spacing: 60px -> 30px -> 15px on mobile
- Typography scale: Headlines compress, body text stays relatively stable
- Card images: Max-width 100% with responsive scaling

### Image Behavior
- Hero images: Full-width or contained with max-width
- Card images: `max-height: none` for showcase cards
- Service icons: SVG or icon fonts, consistent sizing
- Background images: `background-size: cover` with positioned focal points

## 9. Agent Prompt Guide

### Quick Color Reference
- Primary CTA: AWS Orange (`#e47911`)
- CTA Hover: Dark Orange (`#c97600`)
- Background: White (`#ffffff`)
- Heading text: Squid Ink (`#232f3e`)
- Body text: Charcoal (`#333`)
- Secondary text: Gray 500 (`#5f6b7a`)
- Border: Gray 200 (`#d5dbdb`)
- Link: AWS Blue (`#0972d3`)
- Dark section: Squid Ink (`#232f3e`)
- Dark section text: White (`#ffffff`)
- Success: Green (`#1e8900`)
- Error: Red (`#c40000`)

### Example Component Prompts
1. "Create a hero section on white background. Headline at 42px AmazonEmber weight 400, line-height 48px, color #232f3e. Subtitle at 16px AmazonEmber weight 400, line-height 1.5, color #5f6b7a. Orange CTA button (#e47911 bg, white text, 3px radius, 8px 22px padding) and ghost button (transparent bg, 1px solid #d5dbdb border, #232f3e text, 3px radius)."

2. "Design a card: white background, shadow -1px 2px 2px 0 #e0e0e0, 0 1px 2px 0 #d0d0d0. Title at 24px AmazonEmberBold weight 500, line-height 1.1, color #232f3e. Body at 14px AmazonEmber weight 400, #333 color. Add a 4px top border accent in service category color."

3. "Build a badge: #f1f3f3 background, #5f6b7a text, 3px radius, 0px 6px padding, 11px AmazonEmber."

4. "Create navigation: white sticky header. AWS smile logo left-aligned. Links at 14px AmazonEmber weight 400, #232f3e text. Orange 'Sign Up' CTA right-aligned (#e47911 bg, white text, 3px radius, 8px 13px padding). Mobile hamburger with full-screen overlay."

5. "Design a dark section: #232f3e background, white text. Headline 24px AmazonEmberBold weight 500. Body 14px AmazonEmber weight 400, rgba(255,255,255,0.8) color. Cards inside white with subtle shadow."

6. "Build an input: 1px solid #d5dbdb border, 3px radius. Label at 14px AmazonEmber, #5f6b7a color. Text at 14px AmazonEmber, #333 color. Focus state: 2px outline in #0972d3, 2px offset."

### Iteration Guide
1. Always use Amazon Ember as primary font (or system fonts as fallback)
2. Weight 400-500 is the standard -- not bold, not light
3. Shadow formula: `-1px 2px 2px 0 #e0e0e0, 0 1px 2px 0 #d0d0d0` for cards
4. Heading color is `#232f3e` (Squid Ink), body is `#333` or `#5f6b7a`
5. Border-radius stays in the 3px-8px range -- conservative rounding
6. Primary CTA is always AWS Orange (`#e47911`)
7. Links are AWS Blue (`#0972d3`) with darker hover state
8. Dark sections use `#232f3e` background with white text
9. Use the Libra CSS utility classes (lb-tiny, lb-small, lb-mid, lb-large) for spacing

## Additional Notes

### AWS-Specific Design Elements
- **Service Category Colors**: Each AWS service category has a designated color used consistently across the platform
- **AWS Element Icons**: Custom icon set in SVG format, monochrome with currentColor
- **Smile Logo**: The AWS smile logo is the primary brand mark
- **Footer Legal**: Standard Amazon footer with EEOC statement and copyright

### Accessibility
- Focus rings use AWS Blue (`#0972d3`) for visibility
- Color contrast meets WCAG AA standards
- Skeleton loaders for async content
- Skip links for keyboard navigation (`.lb-skip-el`)
