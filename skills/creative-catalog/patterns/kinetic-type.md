# Kinetic & Variable Typography

Typography as the primary expressive medium: animated variable-font axes, staggered line/word entrances, scroll-responsive scale, and type-led hero compositions where the words are the visual.

## Intent & Communication

Communicates voice and conviction: "our words carry the brand." Kinetic type suits brands with something to say and the confidence to say it large — studios, publications, campaigns, manifestos. Motion in the letterforms becomes tone of voice: weight shifts read as emphasis, staggered entrances as cadence.

## Best Fits

- Type-led brands with a licensed distinctive display or variable font.
- Manifesto/statement heroes where imagery is scarce or intentionally absent.
- Section headlines used as rhythmic landmarks through a long page.

## Content & Assets Required

- A licensed display or variable font whose axes (wght, wdth, opsz, slnt, or custom) are worth animating ([MDN Variable fonts guide](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_fonts/Variable_fonts_guide)).
- Finalized, strong headline copy — kinetic treatment amplifies weak copy's weakness.
- Font subsetting plan (only used axes/glyph ranges ship).

## Variants

- **Axis animation** — animate `font-variation-settings`/`font-weight` on entrance, hover, or scroll progress.
- **Staggered reveal** — lines/words enter with masked translate+fade in reading order.
- **Scroll-scaled headline** — display type scales/tightens with scroll position as a section landmark.
- **Interactive weight field** — pointer proximity shifts weight/width locally (desktop accent only).

## When Not to Use

- Long-form reading or dense UI copy — body text never animates.
- Only system or generic fonts are available; kinetic treatment of a default face reads as template energy.
- Copy is unapproved or likely to change shape (line breaks are part of the composition).
- Headlines carry critical instructions users must read instantly.

## Core UX Guardrails (Navigation / CTA / Forms)

- Text is real text: selectable, indexable, translatable — never rasterized or canvas-rendered for motion convenience.
- Animation is entrance/emphasis, then settles; type never loops indefinitely behind reading. Nothing flashes (WCAG 2.3.1).
- Nav labels, CTA labels, and form labels do not animate — interactive text must be instantly legible and stable at all times.
- Legibility floor: even mid-animation, contrast and size stay within [WCAG 2.2](https://www.w3.org/TR/WCAG22/) 1.4.3/1.4.4; users who catch a headline mid-transition must still read it.

## Mobile & Touch Adaptation

- Smaller axis ranges and shorter durations; entrance-only animation instead of continuous scroll-linked effects.
- Pointer-proximity variants are removed on touch (no hover); do not substitute a gyroscope effect.
- Verify display sizes reflow without mid-word breaks or overflow at 320px width.

## Keyboard, DOM & Accessibility

- Headings keep semantic tags (`<h1>`–`<h3>`) and full text content in the DOM; per-word/letter `<span>` splitting must keep the accessible name intact (e.g., `aria-label` on the heading) so screen readers hear whole words.
- No focusable element hides inside animated fragments; reading order is unaffected by animation order.

## Reduced-Motion Static Fallback

Under `prefers-reduced-motion: reduce`, type renders instantly at its final weight/size/position ([MDN prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)). The static composition — final axis settings, spacing, hierarchy — must be art-directed as the primary design, because it is what many users and every crawler sees.

## Performance Level & Budget

**Level: medium.** Variable font axis animation can be CPU-costly (it re-rasterizes glyphs); confine it to short moments on few elements, prefer `transform`/`opacity` for entrances ([web.dev animations guide](https://web.dev/articles/animations-guide)). Subset fonts aggressively and preload the display face — web-font delay on a type-led hero is an LCP risk ([web.dev vitals](https://web.dev/articles/vitals)); use `font-display` strategy that avoids invisible text.

## Implementation Complexity

**Medium.** Entrances and axis animation are contained work; the cost is craft — timing, easing, line-break discipline, fallback-font metric matching to avoid CLS, and the accessible-name handling for split text.

## Sources

- https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_fonts/Variable_fonts_guide
- https://www.w3.org/TR/WCAG22/
- https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion
- https://web.dev/articles/animations-guide
- https://web.dev/articles/vitals
