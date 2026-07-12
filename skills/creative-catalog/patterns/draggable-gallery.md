# Draggable Inertial Gallery

A grabbable media field — horizontal strip, oversized canvas, or looping track — that users fling with momentum. Browsing becomes a tactile act of digging through a collection.

## Intent & Communication

Communicates tactile abundance: "there's more here than fits the screen — get your hands in it." The drag gesture converts passive viewing into exploration, which suits archives and collections where discovery *is* the experience. The physicality implies a brand identity that is material, crafted, or playful.

## Best Fits

- Archives/collections with 15+ genuinely strong items (photography, projects, products, artifacts).
- Exploratory browsing where serendipity beats ordered scanning.
- Brands whose identity is tactile or physical (print, fashion, craft, galleries).

## Content & Assets Required

- 15+ optimized media items with alt text; below that threshold the field feels empty and the mechanic dishonest.
- Consistent visual quality across the entire set — a draggable field surfaces items in uncontrolled order, so every item is potentially first.
- Titles/links per item if the gallery navigates anywhere.

## Variants

- **Horizontal drag strip** — single row, drag/fling with momentum, optional snap points.
- **2D canvas field** — items scattered on an oversized plane, draggable in both axes (highest wow, highest a11y cost).
- **Infinite loop** — track recycles seamlessly; must indicate looping so users know they've seen the set.
- **Native-snap hybrid** — CSS `overflow` + `scroll-snap` with drag affordance styling; cheapest and most robust.

## When Not to Use

- Small collections, or content users must see completely and quickly — hidden off-canvas items get missed.
- Ordered comparison, filtering, or search is the primary task — use a filterable grid.
- The team cannot build the keyboard/AT-equivalent path (this is a hard gate, not a nice-to-have).
- As decoration for 6 images that a grid would serve better.

## Core UX Guardrails (Navigation / CTA / Forms)

- The gallery is a region within a normally scrolling page — never the page's own scroll mechanism, and it must not capture vertical page scrolling ([NN/g Scrolljacking 101](https://www.nngroup.com/articles/scrolljacking-101/)).
- Drag vs. click disambiguation: a small pointer movement threshold so item links still click reliably; links are real anchors.
- Visible affordance (cursor change, edge peek, drag hint) — invisible interactivity is failed interactivity.
- CTAs/forms never live inside the draggable field; a "view all" link offers a conventional grid/index as escape hatch.

## Mobile & Touch Adaptation

- Prefer the native-snap hybrid on touch: native momentum scrolling beats reimplemented physics on most devices. Custom inertia only where it demonstrably feels better.
- Horizontal drag must not fight vertical page scroll: correct `touch-action` so vertical swipes over the gallery scroll the page.
- 2D canvas fields are usually replaced by a strip or grid on small viewports.

## Keyboard, DOM & Accessibility

- Items are focusable in DOM order; focusing an item auto-scrolls it into view — this *is* the keyboard navigation path ([WCAG 2.2](https://www.w3.org/TR/WCAG22/) 2.1.1, 2.4.11).
- Supplement with visible prev/next buttons operable by keyboard and AT.
- DOM order is the collection's logical order regardless of visual scatter; the count is exposed (e.g., "12 of 48") so AT users know the extent.
- Infinite loops must not create infinite tab loops — tab exits the region normally.

## Reduced-Motion Static Fallback

Under `prefers-reduced-motion: reduce`, remove momentum/inertia easing and any idle drift: the gallery becomes a plain scrollable region or paginated grid with instant position changes ([MDN prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)). Autonomous drift (marquee-style idle motion) always pauses.

## Performance Level & Budget

**Level: medium.** Transform-only movement on a rAF loop that idles when the user isn't interacting ([web.dev animations guide](https://web.dev/articles/animations-guide) principles). Lazy-load off-screen items aggressively; 15+ images eagerly loaded will wreck LCP and bandwidth budgets ([web.dev vitals](https://web.dev/articles/vitals)). Virtualize very large sets. GSAP's ecosystem (ScrollTrigger and its companion utilities) is a common tooling base ([GSAP docs](https://gsap.com/docs/v3/Plugins/ScrollTrigger/)).

## Implementation Complexity

**High.** Physics (or native-snap tuning), drag/click disambiguation, touch-action correctness, loop recycling, lazy loading, keyboard path, and the reduced-motion variant. The native-snap hybrid cuts this to medium and is the recommended starting point.

## Sources

- https://gsap.com/docs/v3/Plugins/ScrollTrigger/
- https://www.w3.org/TR/WCAG22/
- https://web.dev/articles/vitals
- https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion
- https://www.nngroup.com/articles/scrolljacking-101/
- https://web.dev/articles/animations-guide
