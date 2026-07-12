# View & Shared-Element Transitions

Smooth transitions between pages or views — cross-fades, slides, and shared elements (a thumbnail growing into the detail hero) — built on the View Transition API with full-page navigation as the untouched baseline.

## Intent & Communication

Communicates continuity and spatial coherence: "this site is one continuous place, not a stack of disconnected documents." A shared-element morph from index card to detail hero tells the user *where they went* — orientation delivered as polish. It is one of the highest craft-per-cost accents available.

## Best Fits

- Index-to-detail flows: work grids → case studies, product lists → product pages, article lists → articles.
- Multi-page marketing sites wanting app-like cohesion without an SPA rewrite.
- A supporting accent on nearly any site — it composes well with every dominant mechanic.

## Content & Assets Required

- No new assets. Requires consistent shared elements across page pairs: same image asset/crop appearing as thumbnail and hero, matching titles.
- Stable, unique `view-transition-name`s for shared elements.

## Variants

- **Cross-document transitions** — MPA page-to-page fades/slides via CSS `@view-transition` ([Chrome View Transitions](https://developer.chrome.com/docs/web-platform/view-transitions/)).
- **Shared-element morph** — thumbnail/title morphs position+size into its detail counterpart.
- **Directional slides** — forward/back navigation slides opposite ways for hierarchy cues.
- **Same-document transitions** — for filters/tab state changes within a page.

## When Not to Use

- Single-page sites with no navigation to smooth.
- Transitions that would delay content: never block render waiting for assets to make a morph prettier.
- Teams unwilling to treat it as progressive enhancement (Safari/Firefox coverage varies by variant; the site must be complete without it).

## Core UX Guardrails (Navigation / CTA / Forms)

- Instant, standard navigation is the baseline; transitions decorate it. Links stay real `<a>` elements with correct hrefs — crawlable and middle-clickable ([JS SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)).
- Durations short (typically 200–350ms); navigation must never feel slower because it animates.
- Back/forward buttons, deep links, and opening in new tabs behave identically with or without transitions.
- Form submissions and CTAs are never delayed or intercepted for animation purposes.

## Mobile & Touch Adaptation

- Same transitions with equal or shorter durations; verify no jank on mid-range devices.
- Respect swipe-back gestures: skip or simplify the transition when the platform provides its own.

## Keyboard, DOM & Accessibility

- Focus lands where a normal navigation would put it (top of new document/main heading); transitions must not strand focus on a snapshot of the old page.
- Screen-reader announcement of the new page is unaffected — the API animates pixels, not semantics; keep it that way by never restructuring DOM for animation ([WCAG 2.2](https://www.w3.org/TR/WCAG22/)).
- Each `view-transition-name` is unique per page or the transition (not the navigation) fails — test this.

## Reduced-Motion Static Fallback

Under `prefers-reduced-motion: reduce`, disable or reduce transitions to an instant swap or minimal cross-fade via the media query ([MDN prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)). Since the baseline is normal navigation, the fallback is automatically complete.

## Performance Level & Budget

**Level: low.** The API animates compositor snapshots (`transform`/`opacity` conceptually), cheap by design. Guardrails: keep old-page snapshot time negligible, never prefetch so aggressively that it harms bandwidth, and confirm transitions don't mask a slow LCP on the destination page — vitals are measured per page load ([web.dev vitals](https://web.dev/articles/vitals)).

## Implementation Complexity

**Medium.** CSS cross-document fades are nearly free; shared-element morphs need naming discipline, aspect-ratio matching between thumbnail and hero, and per-browser verification. Feature-detect (`@supports`, `document.startViewTransition`) and ship nothing extra to non-supporting browsers.

## Sources

- https://developer.chrome.com/docs/web-platform/view-transitions/
- https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion
- https://web.dev/articles/vitals
- https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics
- https://www.w3.org/TR/WCAG22/
