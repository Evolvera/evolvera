# Cursor & Focus Previews

Hover, focus, or tap previews for dense indexes: pointing at a list item summons a floating image, clip, or metadata card, letting a text-first index stay fast while still feeling rich.

## Intent & Communication

Communicates density made light: "we have a lot here — peek before you commit to a click." It preserves the scanning speed of a plain text list (often the most confident, editorial choice) while adding a layer of curiosity and reward. A favorite of portfolio and archive sites because the restraint itself signals taste.

## Best Fits

- Dense text indexes: work/project lists, article archives, people rosters, product line lists.
- Portfolios where a typographic list is the primary navigation and imagery is the payoff.
- Sites that need richness without loading heavy media into the initial view.

## Content & Assets Required

- One lightweight preview asset per index item (optimized image or short muted clip), consistent aspect ratio, lazy-loaded.
- Descriptive link text per item — the list must work as pure text.
- Preview coverage for most items; a list where only 3 of 20 rows preview feels broken.

## Variants

- **Cursor-following image** — preview floats near the pointer with soft easing.
- **Fixed preview panel** — a stable stage (side/behind the list) swaps media per hovered row; calmer, easier on performance and layout.
- **Inline expansion** — the row itself grows to show a thumbnail (works identically for touch/keyboard).
- **Metadata card** — text/stat preview instead of media, for data-heavy indexes.

## When Not to Use

- Fewer than ~6 items — just show the media directly.
- Preview media doesn't exist for most items.
- Touch-first audiences with no planned tap adaptation (hover-only previews exclude them entirely).
- The preview would carry information required to choose — required information belongs in the visible list ([WCAG 2.2](https://www.w3.org/TR/WCAG22/) 1.4.13 implications).

## Core UX Guardrails (Navigation / CTA / Forms)

- List items are real links, fully functional without previews; the preview is additive, never the click target's replacement ([JS SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)).
- Previews never obscure the hovered item, adjacent rows' targets, navigation, or CTAs; they are pointer-transparent (`pointer-events: none`) when floating.
- Content on hover follows WCAG 1.4.13: dismissible (Esc), hoverable if it holds interactive content (avoid — keep previews inert), and persistent until intent changes.
- No forms inside previews.

## Mobile & Touch Adaptation

- Choose deliberately: (a) inline thumbnails always visible, (b) expandable rows (first tap expands with visible affordance, second tap navigates), or (c) no previews — plain fast list. Never leave hover-only behavior as the touch experience.
- If tap-to-preview is used, the affordance must be visible (chevron/plus), and a direct navigation control must remain one obvious tap away.

## Keyboard, DOM & Accessibility

- Focus triggers the same preview hover does; blur/Esc dismisses it. Visible focus indicators throughout ([WCAG 2.2](https://www.w3.org/TR/WCAG22/) 2.4.7).
- Previews are decorative to AT by default (`aria-hidden="true"`); everything needed to choose lives in the link text. If a preview carries real info, expose it as text instead.
- DOM order = list order; the floating layer sits outside the tab order.

## Reduced-Motion Static Fallback

Under `prefers-reduced-motion: reduce`, remove cursor-following easing and scale/parallax flourishes: previews appear/disappear instantly in a fixed position, or fall back to inline thumbnails ([MDN prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)). The list itself is already the static design.

## Performance Level & Budget

**Level: low.** Cursor following animates `transform` only, driven by rAF or CSS transitions ([web.dev animations guide](https://web.dev/articles/animations-guide)). Previews lazy-load on approach (or prefetch on first hover intent); initial page weight stays that of a text list. No effect on LCP; keep hover handlers trivial for INP.

## Implementation Complexity

**Low.** A positioning layer, swap logic, lazy loading, and the touch/keyboard adaptations. The fixed-panel and inline variants are simpler still. Main risk is skipping the touch strategy — that decision is part of selecting this pattern, not an afterthought.

## Sources

- https://www.w3.org/TR/WCAG22/
- https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion
- https://web.dev/articles/animations-guide
- https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics
