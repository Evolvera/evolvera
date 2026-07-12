# Parallax Depth Planes

Layered visual planes moving at different scroll rates, plus overlap reveals, masks, and depth-of-field cues that give a flat page a sense of physical space.

## Intent & Communication

Communicates atmosphere and place: "this brand inhabits a world with depth." Slow relative motion between layers reads as cinematic and expensive when restrained — and as a 2013 template when overdone. Depth should frame content, not compete with it.

## Best Fits

- Hero scenes for place-, product-, or mood-led brands (travel, hospitality, hardware, culture).
- Section transitions: a foreground plane or mask that slides to reveal the next chapter.
- Editorial backdrops where a subtle background drift separates content planes.

## Content & Assets Required

- 2–4 separable layers per scene: cutout PNGs/WebPs, SVG shapes, gradient fields, or photos with clear foreground/background separation.
- Layers must be produced as layers — faking separation from a flat photo looks cheap.
- A composed static version of each scene (this becomes the reduced-motion design).

## Variants

- **Rate-offset planes** — background moves slower than foreground on scroll (classic parallax).
- **Overlap reveal** — a section slides over the previous one (`position: sticky` + z-index), creating stacked "curtains."
- **Mask reveal** — clip-path/mask grows with scroll progress to disclose the next scene.
- **Depth-of-field** — blur/scale grading across planes for photographic depth (use sparingly; blur is costly).

## When Not to Use

- Dense informational or utility pages — depth motion behind text harms reading.
- Imagery cannot be honestly separated into planes.
- The audience skews motion-sensitive and there is no budget to design the static composition properly ([Apple HIG — Motion](https://developer.apple.com/design/human-interface-guidelines/accessibility#Motion)).
- More than one dominant depth scene per page — repetition dilutes the effect.

## Core UX Guardrails (Navigation / CTA / Forms)

- Parallax offsets stay small (typically ≤ 10–20% relative displacement); content never moves against scroll direction in a disorienting way.
- Text, CTAs, and forms sit on stable planes — never on a moving layer. Contrast between text plane and moving backdrop must hold at every scroll position (WCAG 1.4.3).
- Navigation remains fixed/predictable; overlap reveals must not trap scroll or hide the header ([NN/g Scrolljacking 101](https://www.nngroup.com/articles/scrolljacking-101/) applies to any scroll-behavior surprise).

## Mobile & Touch Adaptation

- Reduce to 1–2 planes with smaller offsets, or flatten scenes entirely on small viewports — parallax gains little on a 6-inch screen and costs battery.
- Avoid `background-attachment: fixed`-style techniques with poor mobile behavior; use transform-based planes only.

## Keyboard, DOM & Accessibility

- Decorative planes are `aria-hidden="true"` and never receive focus; meaningful imagery keeps alt text and lives in DOM order.
- Overlap reveals must not obscure focused elements ([WCAG 2.2](https://www.w3.org/TR/WCAG22/) 2.4.11).
- Nothing informational exists only inside a moving layer.

## Reduced-Motion Static Fallback

Under `prefers-reduced-motion: reduce`, all planes freeze into the pre-composed static scene; overlap/mask reveals become plain section boundaries ([MDN prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)). Vestibular-trigger motion (large sliding fields, zooms) is exactly what this query exists for — honor it completely.

## Performance Level & Budget

**Level: medium.** Planes animate `transform`/`opacity` only, promoted judiciously (`will-change` on a few layers, not dozens) ([web.dev animations guide](https://web.dev/articles/animations-guide)). Prefer CSS scroll-driven animations for rate offsets ([Chrome](https://developer.chrome.com/docs/css-ui/scroll-driven-animations); [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_scroll-driven_animations)). Avoid animated `filter: blur()` on large surfaces. Layered hero images must not push LCP past 2.5s — the LCP layer loads eagerly, decoration lazily.

## Implementation Complexity

**Medium.** Rate-offset and sticky-overlap variants are modest CSS; mask reveals and depth grading need more tuning. Main risks: text contrast over moving imagery, mobile flattening, and overdraw from too many promoted layers.

## Sources

- https://developer.chrome.com/docs/css-ui/scroll-driven-animations
- https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_scroll-driven_animations
- https://web.dev/articles/animations-guide
- https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion
- https://developer.apple.com/design/human-interface-guidelines/accessibility#Motion
- https://www.w3.org/TR/WCAG22/
- https://www.nngroup.com/articles/scrolljacking-101/
