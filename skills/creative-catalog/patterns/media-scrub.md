# Media Scrub Reveal

Scroll- or drag-controlled playback of an image sequence or keyframe-dense video: the user's own motion drives a product assembling, transforming, or rotating frame by frame.

## Intent & Communication

Communicates transformation and precision under the user's control: "watch it change, at your pace." Because the user drives the timeline, the mechanic feels like inspection rather than advertising — powerful for physical products, craftsmanship, and before/after stories, and hollow for anything that isn't genuinely transforming.

## Best Fits

- Physical-product assembly, exploded views, or 360° hero rotations.
- Before/after transformations that *are* the value proposition (renovation, restoration, material change).
- Process reveals where user-paced playback aids understanding more than an autoplaying video would.

## Content & Assets Required

- A professionally produced image sequence (typically 30–120 frames, consistent lighting/registration, aggressively optimized per frame) **or** a video encoded with dense keyframes for smooth seeking.
- A hero-quality static frame (the fallback, poster, and LCP candidate).
- This pattern is asset-gated: without produced sequences it must be rejected, never approximated with mismatched stills.

## Variants

- **Scroll scrub** — pinned canvas/video whose frame maps to scroll progress within the section.
- **Drag scrub** — a slider or direct drag controls the timeline (better on touch, no pinning needed).
- **Chaptered scrub** — scrub progress pauses at labeled states with annotations.
- **360 turntable** — drag rotates the product through a frame ring.

## When Not to Use

- No transformation is central to the message — a scrub of nothing changing is expensive filler.
- Bandwidth-constrained audiences or strict performance budgets; frame sequences are heavy by nature.
- The story needs narration/sound pacing — use a normal video player instead.
- The team cannot produce registration-consistent frames.

## Core UX Guardrails (Navigation / CTA / Forms)

- Scroll scrub is scroll-*linked*: the page still moves normally and the user can pass through at any speed; never lock scroll until playback completes ([NN/g Scrolljacking 101](https://www.nngroup.com/articles/scrolljacking-101/)).
- Keep the pinned scrub region short (≤ ~2 viewport heights) and always exitable.
- Provide a native-flow fallback: no JS → static hero frame plus caption; the page must fully communicate without the scrub.
- CTAs and navigation remain outside the scrub stage and clickable throughout; no forms inside it.

## Mobile & Touch Adaptation

- Prefer the drag-scrub or tap-to-play-video variant on touch; scroll-linked scrubbing fights native scroll momentum.
- Serve a reduced frame set (fewer, smaller frames) or a compressed video by viewport/connection; respect data-saver signals.
- Drag handles and chapter controls ≥ 44px targets.

## Keyboard, DOM & Accessibility

- The scrub is operable by keyboard: a `range` slider (or arrow-key handler with `role="slider"`, proper `aria-valuenow/min/max` and a human-readable value text) advances frames.
- The stage carries a text alternative describing what the sequence shows and its end state; annotations are real DOM text.
- Focus never gets trapped in the pinned region ([WCAG 2.2](https://www.w3.org/TR/WCAG22/) 2.1.2, 2.4.11).

## Reduced-Motion Static Fallback

Under `prefers-reduced-motion: reduce`, show the final (or most informative) static frame with the same annotations as plain content ([MDN prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)). Optionally offer an explicit "play transformation" button — motion becomes opt-in, never ambient.

## Performance Level & Budget

**Level: high — the most bandwidth-expensive pattern here.** Budget explicitly: total sequence weight, lazy/progressive frame fetching, canvas drawing on rAF only while in view, decode-ahead of nearby frames. The static poster frame is the LCP element and must load fast (LCP ≤ 2.5s); scrub assets load after ([web.dev vitals](https://web.dev/articles/vitals)). Scroll mapping via [GSAP ScrollTrigger](https://gsap.com/docs/v3/Plugins/ScrollTrigger/) or CSS scroll-driven timelines feeding a frame index ([Chrome scroll-driven animations](https://developer.chrome.com/docs/css-ui/scroll-driven-animations)). Keep per-scroll work minimal to protect INP ≤ 200ms.

## Implementation Complexity

**High.** Frame pipeline (export, compression, naming), canvas renderer, progressive loading, pin/resize handling, touch strategy, keyboard slider, and dual fallbacks. Choose this only when the transformation story earns the full cost.

## Sources

- https://gsap.com/docs/v3/Plugins/ScrollTrigger/
- https://developer.chrome.com/docs/css-ui/scroll-driven-animations
- https://web.dev/articles/vitals
- https://www.nngroup.com/articles/scrolljacking-101/
- https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion
- https://www.w3.org/TR/WCAG22/
