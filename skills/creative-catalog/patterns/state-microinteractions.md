# State Microinteractions

The low-cost creative floor: sticky summary/CTA cards, reading progress, view-timeline section reveals, and state-aware UI (loading, saved, success, empty) executed with unusual care. Craft delivered in details rather than spectacle.

## Intent & Communication

Communicates quality and responsiveness: "this product is well made, down to the smallest state." Users read microinteraction quality as product quality. This pattern is the correct recommendation when a brief asks for "more creative" but the content, assets, or budget don't justify a dominant mechanic — restraint plus perfect details outperforms a mediocre spectacle.

## Best Fits

- Sticky summary/CTA cards that follow long content (pricing recap, project facts, article actions).
- Reading/scroll progress indicators on long-form content.
- View-timeline section reveals: content fades/translates in as it enters the viewport.
- State-aware UI everywhere states exist: buttons with loading/success, thoughtful empty states, saved indicators.
- As the supporting-accent layer beneath any dominant mechanic in this catalog.

## Content & Assets Required

- None beyond the existing UI — this is the pattern's superpower. Optionally small inline SVGs for progress/state icons.
- What it does require is *state inventory discipline*: knowing every state each component can be in, and designing all of them.

## Variants

- **Sticky companion card** — `position: sticky` summary/CTA that accompanies long content, with designed enter/settle behavior.
- **Progress indicators** — reading progress via CSS `scroll()` timeline; step progress in flows.
- **View-timeline reveals** — `animation-timeline: view()` entrance animations, once per element, subtle distances (≤ 24px), never hiding content from crawlers (content is visible by default; animation is enhancement).
- **State choreography** — button label morphs to spinner to checkmark; form fields with inline validation states; empty states that guide the next action.

## When Not to Use

- As a substitute for a missing content or design idea — polish on an empty page is still an empty page.
- Reveals that gate above-the-fold or SEO-critical content behind JS/opacity (content must exist and be visible without animation; [JS SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)).
- Everywhere at once: if every element animates on entry, none reads as considered. Accents must stay scarce — pick the few moments that matter.

## Core UX Guardrails (Navigation / CTA / Forms)

- Sticky elements never cover navigation, primary content, or focused elements; they collapse or yield near footers and on short viewports.
- CTAs inside sticky cards are conventional buttons/links; state animations never delay the actual action (the request fires immediately; animation reflects, not gates).
- Form validation states follow standard patterns: inline, textual, associated to fields — decoration never replaces the error message ([WCAG 2.2](https://www.w3.org/TR/WCAG22/) 3.3.1).
- Reveal animations never reorder or reflow content (transform/opacity only — zero CLS contribution).

## Mobile & Touch Adaptation

- Identical behavior by design — this pattern's mechanics are viewport-agnostic.
- Sticky cards respect safe areas, keyboard-avoidance (soft keyboard must not trap the card over inputs), and thumb-reach sizing (targets ≥ 44px).

## Keyboard, DOM & Accessibility

- State changes are announced: `aria-live="polite"` for async results, `aria-busy` during loading; success/error is never color-only (1.4.1).
- Sticky cards appear in a sensible DOM position (usually after the content they summarize) so tab order stays logical; they never obscure focus (2.4.11).
- Progress indicators are decorative (`aria-hidden`) when the document structure already conveys position, or exposed as `progressbar` when they carry unique info.

## Reduced-Motion Static Fallback

Under `prefers-reduced-motion: reduce`: view-timeline reveals render content instantly in place; state changes swap without transition (spinner may remain as it conveys status, but decorative easing goes); sticky behavior itself is position, not motion, and remains ([MDN prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)).

## Performance Level & Budget

**Level: low — the cheapest pattern in the catalog.** CSS scroll-driven animations (`scroll()`/`view()` timelines) run off the main thread where supported ([Chrome scroll-driven animations](https://developer.chrome.com/docs/css-ui/scroll-driven-animations); [MDN CSS scroll-driven animations](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_scroll-driven_animations)); everything animates `transform`/`opacity` ([web.dev animations guide](https://web.dev/articles/animations-guide)). No effect on LCP; trivial handlers keep INP ≤ 200ms; zero CLS by construction.

## Implementation Complexity

**Low.** Mostly modern CSS plus small amounts of state logic. The discipline cost is design-side: inventorying states, choosing the few reveal moments, and tuning distances/durations until they feel inevitable rather than applied.

## Sources

- https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_scroll-driven_animations
- https://developer.chrome.com/docs/css-ui/scroll-driven-animations
- https://web.dev/articles/animations-guide
- https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion
- https://www.w3.org/TR/WCAG22/
- https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics
