# Editorial Collage Grid

Asymmetric, magazine-grade composition: mixed image scales, intentional overlaps, off-grid placement, generous and *uneven* whitespace, and typography woven between media. Curated density instead of uniform cards.

## Intent & Communication

Communicates taste and human curation: "someone with judgment composed this page." Uniform card grids read as database output; a collage reads as an editor's spread. Scale contrast does hierarchy work — the biggest element is a claim about what matters most — so the layout itself becomes an argument.

## Best Fits

- Editorial brands, studios, culture/fashion/architecture sites.
- Mixed-media storytelling sections (photo + display type + graphic marks).
- Differentiating a brand whose competitors all ship the same uniform card grid.

## Content & Assets Required

- 6–12 art-directed images with intentional, varied crops and stable aspect ratios (dimensions declared — overlap plus late-loading images is a CLS factory).
- Strong display typography to interleave with media.
- Content of genuinely varied importance — collage requires a hierarchy opinion; equal-weight content belongs in a grid.

## Variants

- **Overlap composition** — images and type layered with deliberate z-index and offsets.
- **Broken grid** — items placed on a real grid but spanning/offsetting irregularly (most CMS-resilient variant).
- **Scattered board** — pinboard-like arrangement with rotation/offset noise (pairs with the floating-image loader variant in `asset-loader.md`).
- **Scroll-settled collage** — pieces drift subtly into final position via view-timeline as the section enters (accent-level motion only).

## When Not to Use

- Homogeneous, comparison-oriented content: specs, pricing tiers, feature parity tables — users need alignment to compare.
- Weak or inconsistent imagery; collage amplifies asset quality in both directions.
- Heavily CMS-driven sections where editors add arbitrary items — unbounded content breaks authored composition. Use the broken-grid variant with defined slot rules, or decline.
- Dense functional UI (dashboards, listings with filters).

## Core UX Guardrails (Navigation / CTA / Forms)

- Reading path must survive the asymmetry: one P0 entry point, a traceable scan path, and text never overlapped into sub-contrast territory (WCAG 1.4.3).
- Links/CTAs inside the collage keep whole, unambiguous hit areas ≥ target-size minimums ([WCAG 2.2](https://www.w3.org/TR/WCAG22/) 2.5.8); overlapping layers must not shadow another element's click region.
- Navigation and primary CTAs live outside the composition in conventional positions.
- All copy is real HTML text, not text baked into images ([JS SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)).

## Mobile & Touch Adaptation

- Recompose, don't collapse: design a single-column rhythm that keeps scale contrast (full-bleed, then inset, then offset) and alternating alignment. A collage flattened into a uniform stack loses its reason to exist.
- Reduce or remove overlaps at small sizes; verify no horizontal overflow at 320px.

## Keyboard, DOM & Accessibility

- DOM order follows the intended reading order, not visual coordinates; CSS handles placement. Tab order therefore stays logical.
- Decorative fragments are `aria-hidden="true"`; meaningful images carry alt text; interleaved headings keep semantic levels.
- Focus indicators remain visible above overlapping layers (2.4.7, 2.4.11 focus not obscured).

## Reduced-Motion Static Fallback

The collage is inherently static — only the scroll-settled variant animates. Under `prefers-reduced-motion: reduce`, all pieces render directly in final position ([MDN prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)). Since final position *is* the design, the fallback is the design.

## Performance Level & Budget

**Level: low.** This is CSS layout (grid areas, transforms for rotation/offset), not runtime animation. Budget concerns are asset-side: responsive image sizes, lazy loading below the fold, declared aspect ratios for CLS ≤ 0.1, and a fast LCP candidate if the collage is the hero ([web.dev vitals](https://web.dev/articles/vitals)).

## Implementation Complexity

**Medium.** No hard engineering, but high craft cost: every breakpoint is a fresh composition decision, and content-resilience rules (what happens when a title runs long) must be authored. The broken-grid variant is the safest to hand to a CMS.

## Sources

- https://web.dev/articles/vitals
- https://www.w3.org/TR/WCAG22/
- https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics
- https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion
