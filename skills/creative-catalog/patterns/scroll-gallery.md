# Scroll Gallery Rails

Horizontal, diagonal, or stacked media rails whose position is linked to page scroll, turning an abundant visual collection into a cinematic traversal instead of a uniform grid.

## Intent & Communication

Communicates abundance, range, and curation: "we have a deep, consistent body of visual work worth moving through." The rail's continuous motion implies momentum and editorial confidence. It rewards brands whose proof *is* the imagery.

## Best Fits

- Portfolios, studios, and agencies with 8–20 strong, art-directed visuals.
- Product photography or campaign lookbooks with consistent treatment.
- Case-study strips where each card links to a detail page.

## Content & Assets Required

- 8+ media items of consistent quality, crop discipline, and aspect ratio.
- Alt text for every item; captions or titles if items are navigational.
- Explicit dimensions/aspect-ratio boxes so the rail never shifts layout (CLS ≤ 0.1).

## Variants

- **Horizontal rail** — vertical scroll translates a track horizontally inside a tall section (scroll-linked `transform`).
- **Diagonal drift** — two or three rows drift at different speeds/angles for editorial texture.
- **Stacked deck** — cards pin and stack/peel as the user scrolls, one item foregrounded at a time.
- **Marquee accent** — a slow autonomous rail used as texture, not navigation (must pause under reduced motion).

## When Not to Use

- Fewer than 8 strong items — a rail with 4 images reads as padding, not abundance.
- Text- or spec-led content where users compare rather than browse.
- Conversion-critical pages where the rail delays reaching the CTA.
- When the horizontal metaphor forces users to lose their vertical place in the page.

## Core UX Guardrails (Navigation / CTA / Forms)

- Scroll-linked, never scroll-hijacked: wheel/trackpad input maps 1:1 to page progress; no forced easing or captured wheel events ([NN/g Scrolljacking 101](https://www.nngroup.com/articles/scrolljacking-101/)).
- The section must be exitable at any moment by normal scrolling; total pinned distance stays short (≈1–2 viewport heights per rail).
- CTAs and nav remain outside the rail and fully clickable during motion; no form ever lives inside a moving track.
- Items that link somewhere are real anchors in DOM order, crawlable without JS ([JS SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)).

## Mobile & Touch Adaptation

- Replace scroll-linked horizontal motion with a native swipe carousel (`overflow-x` + `scroll-snap`) or a vertical stack. Touch users already have a horizontal gesture; don't remap their vertical scroll.
- Larger items, fewer per view; touch targets ≥ 44px for any per-item controls.

## Keyboard, DOM & Accessibility

- DOM order = reading order = tab order; the visual rail is a presentation of a plain list (`<ul>` of linked figures).
- Every focusable item scrolls into view on focus; visible focus ring per [WCAG 2.2](https://www.w3.org/TR/WCAG22/) (2.4.7, 2.4.11 focus not obscured).
- Announce nothing exotic: it is a list of links/figures to assistive tech.

## Reduced-Motion Static Fallback

Under `prefers-reduced-motion: reduce`, render the same items as a static editorial grid or native-scrolling strip with zero scroll-linked transforms ([MDN prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)). The fallback must be composed deliberately — it is the design many users see.

## Performance Level & Budget

**Level: medium.** Animate only `transform` on the track; never animate `left/top/width` ([web.dev animations guide](https://web.dev/articles/animations-guide)). Prefer CSS scroll-driven animations (`animation-timeline: scroll()/view()`) with a JS/ScrollTrigger fallback where support is missing ([Chrome scroll-driven animations](https://developer.chrome.com/docs/css-ui/scroll-driven-animations); [MDN CSS scroll-driven animations](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_scroll-driven_animations); [GSAP ScrollTrigger](https://gsap.com/docs/v3/Plugins/ScrollTrigger/)). Lazy-load off-rail media; keep LCP element (usually the first rail item or hero above it) ≤ 2.5s.

## Implementation Complexity

**Medium.** CSS-only variant is straightforward; pinned/stacked variants need ScrollTrigger-style tooling and careful resize handling. Main risks: pin jank on resize, mobile remapping, and CLS from unsized media.

## Sources

- https://developer.chrome.com/docs/css-ui/scroll-driven-animations
- https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_scroll-driven_animations
- https://gsap.com/docs/v3/Plugins/ScrollTrigger/
- https://www.nngroup.com/articles/scrolljacking-101/
- https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion
- https://web.dev/articles/animations-guide
- https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics
