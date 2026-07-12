# Scrollytelling Chapters

Pinned or progressively revealed chapters where scroll position advances a narrative: a visual stays on stage while steps, annotations, or states change around it.

## Intent & Communication

Communicates cause and effect: "understand this in order, step by step." It converts scroll — a gesture users already trust — into narrative pacing, making processes, data stories, and transformations legible without asking for clicks.

## Best Fits

- How-it-works and process explanations with 3+ genuinely causal steps.
- Data stories: one chart or diagram that gains annotations/states per chapter.
- Origin/transformation narratives where sequence carries the persuasion.

## Content & Assets Required

- A real narrative arc: each chapter must change what the user understands, not just what they see.
- One strong visual state per chapter (diagram, photo, chart, product state) plus concise chapter copy (1–3 sentences).
- Final copy or near-final draft — scrollytelling built on placeholder copy always gets rebuilt.

## Variants

- **Pinned stage** — visual pins; text chapters scroll past and drive state changes.
- **Progressive reveal** — no pinning; chapters enter via `view()`-timeline animations as they cross the viewport.
- **Sticky sidebar** — text pins while media scrolls (good for data-dense stories).
- **Chapter dots/progress** — persistent indicator showing position within the story.

## When Not to Use

- Content is a flat list (features, services) with no causal order — use normal sections.
- Users primarily scan, compare, or transact; narrative pacing frustrates task-driven visits.
- Fewer than 3 meaningful chapters, or chapters exist only to justify the mechanic.
- The team cannot produce a distinct, worthwhile visual state per chapter.

## Core UX Guardrails (Navigation / CTA / Forms)

- Scroll speed and direction always belong to the user; never animate the scroll position itself or capture wheel events ([NN/g Scrolljacking 101](https://www.nngroup.com/articles/scrolljacking-101/)).
- Keep total pinned distance proportionate (≈0.5–1 viewport height per chapter); users must be able to skim through fast without getting stuck.
- Provide a native-flow fallback: with JS disabled or unsupported, chapters render as ordinary stacked sections in DOM order.
- Header navigation stays reachable during pinned sections; CTAs live in normal flow before/after the story, never inside a pinned frame only.
- No form inputs inside pinned/scroll-driven regions.

## Mobile & Touch Adaptation

- Shorten pin distances or switch to the unpinned progressive-reveal variant; long pins feel broken on touch.
- Chapter text sized for mobile reading; visuals recomposed for portrait, not letterboxed.
- Preserve the progress indicator so users know the section has an end.

## Keyboard, DOM & Accessibility

- DOM order tells the complete story linearly; pinning is presentation only.
- All chapter text exists as real text (crawlable, selectable, screen-reader readable); state changes must not remove content from the accessibility tree mid-story.
- Focusable elements inside chapters must scroll into view and remain unobscured ([WCAG 2.2](https://www.w3.org/TR/WCAG22/) 2.4.11); keyboard scrolling (space/arrows/PageDown) advances chapters exactly like wheel scrolling.

## Reduced-Motion Static Fallback

Under `prefers-reduced-motion: reduce`, disable pinning and scroll-linked state changes; render every chapter as a static section with its visual state fully shown ([MDN prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)). Nothing narratively essential may exist only in motion.

## Performance Level & Budget

**Level: medium.** State changes should be `transform`/`opacity` swaps, not layout mutations. Use CSS scroll-driven animations where they suffice ([Chrome](https://developer.chrome.com/docs/css-ui/scroll-driven-animations); [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_scroll-driven_animations)); use [GSAP ScrollTrigger](https://gsap.com/docs/v3/Plugins/ScrollTrigger/) for pinning/complex sequencing. Keep chapter visuals lazy-loaded past the first; scroll handlers must stay cheap to hold INP ≤ 200ms.

## Implementation Complexity

**High.** Pinning, resize/orientation recalculation, chapter-state choreography, the native-flow fallback, and the reduced-motion design are each real work. Budget iteration time on mobile behavior specifically.

## Sources

- https://gsap.com/docs/v3/Plugins/ScrollTrigger/
- https://developer.chrome.com/docs/css-ui/scroll-driven-animations
- https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_scroll-driven_animations
- https://www.nngroup.com/articles/scrolljacking-101/
- https://www.w3.org/TR/WCAG22/
- https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion
