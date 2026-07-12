# Honest Asset Loader

A short, designed loading moment used **only when genuinely unavoidable heavy loading exists** (WebGL scenes, media-scrub sequences, large galleries). The loader reflects real progress and reuses real site assets — including the floating-image collage variant where gallery images assemble as they arrive.

## Intent & Communication

Communicates anticipation and brand ritual: "even the wait is designed." Done honestly, a loader converts a technical liability into an entrance moment. Done dishonestly — a fake delay on a page that could simply appear — it is the single clearest tell of style over substance. Honesty is the whole pattern.

## Best Fits

- Experiences with a real multi-megabyte payload the first view requires: WebGL product stages, media-scrub frame sets, exhibition/campaign sites.
- **Floating-image collage variant**: the actual gallery images drift in and settle into the opening composition as each finishes loading — preloading becomes the choreography.
- Brand-ritual entrances (wordmark + counter) for campaign sites where the payload justifies it.

## Content & Assets Required

- The real heavy assets being preloaded — the loader's existence is justified by them alone.
- Loader visuals drawn from actual site material: the wordmark, real gallery images, real palette. No invented decoration.
- A determinate progress source (bytes/items loaded) — indeterminate spinners waste the moment and inform no one.

## Variants

- **Counter/wordmark** — percentage or fraction with the brand mark; minimal, editorial.
- **Floating-image collage** — arriving images float/scale into a composed collage that *is* the page's opening state (loader and hero merge).
- **Progress bar as design element** — a rule line that grows and then becomes part of the layout grid.
- **Curtain exit** — loader wipes away as a mask reveal into the first view (exit ≤ ~600ms).

## When Not to Use

- The page could simply load fast — most marketing/content sites. The best loader is none.
- The loader would delay meaningful content beyond budget: if LCP would pass 2.5s because of the loader itself, the pattern is disqualified on that page.
- Nothing real is loading (fake loaders are forbidden — they are fabricated proof of weight).
- Repeat visits: cached/warm visits should skip or radically shorten the loader.

## Core UX Guardrails (Navigation / CTA / Forms)

- Time-boxed: target < 2–3s on the design baseline connection; on slow connections, cap the wait and progressively reveal what's ready rather than holding the page hostage.
- Only the genuinely dependent view is gated. Navigation, header, and textual content render immediately when technically separable; a full-site gate needs the strongest justification.
- No interaction hijacking: users can leave, use browser controls, or (where content permits) skip via a visible control.
- Never gate forms or conversion paths behind a loader.

## Mobile & Touch Adaptation

- Shorter or skipped loader on constrained connections; respect data-saver signals by loading a lighter payload with little or no loader.
- The floating-collage variant simplifies (fewer floaters, smaller offsets) to protect battery and thermal budgets.

## Keyboard, DOM & Accessibility

- Progress is exposed to AT: `role="progressbar"` with `aria-valuenow`, or polite live-region milestones — not a silent visual wait ([WCAG 2.2](https://www.w3.org/TR/WCAG22/) 4.1.3 status messages).
- Focus is managed: on completion, focus lands at the top of the revealed content; the loader never traps focus (2.1.2).
- Underlying document content exists in HTML during the load — crawlers and AT should find the page, not an empty shell.

## Reduced-Motion Static Fallback

Under `prefers-reduced-motion: reduce`, floating/curtain choreography is replaced by a static wordmark + numeric progress and an instant (or simple fade) reveal ([MDN prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)). The floating-image collage settles as an already-composed static collage.

## Performance Level & Budget

**Level: medium** (the loader itself is cheap; the payload it fronts is not). The loader must render near-instantly — inline critical CSS, no waiting on fonts or frameworks to show progress. It must not worsen the vitals it exists to manage: the revealed view's LCP stays ≤ 2.5s where achievable, CLS 0 at reveal (the loader occupies the full stage, then swaps atomically), animation via `transform`/`opacity` only ([web.dev vitals](https://web.dev/articles/vitals); [web.dev animations guide](https://web.dev/articles/animations-guide)).

## Implementation Complexity

**Medium.** Real progress plumbing (asset manifest, byte/item counting), reveal choreography, focus management, warm-visit skip logic, and the reduced-motion path. The floating-collage variant adds composition work shared with `editorial-collage.md`.

## Sources

- https://web.dev/articles/vitals
- https://web.dev/articles/animations-guide
- https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion
- https://www.w3.org/TR/WCAG22/
