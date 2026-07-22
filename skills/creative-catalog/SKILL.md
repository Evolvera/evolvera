---
name: creative-catalog
description: Post-design WHAT-pattern catalog for website-creative (scrollytelling, kinetic type, media scrub, view transitions, WebGL stages, editorial collage, and more). Selection is index-first; creativity never sacrifices usability, accessibility, or Core Web Vitals.
---

# Creative Catalog

A curated catalog of 12 creative interaction patterns for websites. It selects **what** a designed experience should do; `creative-toolkit` separately selects **how** to implement it. Each pattern documents what it communicates, when it fits, the content/assets it demands, its guardrails, and its performance/complexity cost — so creativity serves the content instead of decorating it.

Creativity here means **content-fit art direction**: the mechanic must make the message clearer, the brand more specific, or the task easier. It is never a substitute for hierarchy, navigation, or working forms.

## Activation

Use this skill primarily when the `website-creative` agent has a completed design direction and must select a post-design WHAT pattern for a brief that explicitly justifies a distinctive, immersive, editorial, or interactive experience. A designer or polisher may consult it only for grounded guardrails around an already requested mechanic.

Do **not** activate before design direction exists or for routine marketing sites where standard sections plus restrained motion fully serve the brief. Recommending *no* catalog pattern is a valid, often correct outcome.

## Selective Retrieval (index-first)

Never read all pattern files. Follow this order:

1. `read ~/.pi/agent/skills/creative-catalog/creative-index.json` — the index alone supports shortlisting.
2. Shortlist candidates from the index using the matching algorithm below.
3. Read only the **2–4 candidate** pattern files:
   `read ~/.pi/agent/skills/creative-catalog/patterns/<slug>.md`
4. Choose at most **one dominant mechanic** and up to **two supporting accents** (accents are usually `state-microinteractions`, `cursor-previews`, or `view-transitions`).

Each index entry contains: `slug`, `name`, `category`, `communicates`, `best_for`, `avoid_when`, `asset_profile`, `mobile_strategy`, `performance` (`low|medium|high` cost), `complexity` (`low|medium|high`), `pattern_file`, `source_urls`.

## Matching Algorithm

Score candidates against six brief dimensions. A pattern must fit the first three to be eligible at all; the last three set intensity.

1. **Brief & message** — What must the first screen and the page arc communicate? Match against `communicates`. A transformation story points at `media-scrub`/`scrollytelling`; a voice-led brand points at `kinetic-type`; continuity across pages points at `view-transitions`.
2. **Content density & shape** — Count real content. Rails, collages, and draggable galleries require genuinely abundant media (≥8–10 strong items). Scrollytelling requires a real causal sequence (≥3 meaningful chapters). Sparse content disqualifies abundance patterns — check `avoid_when`.
3. **Assets actually available** — Match `asset_profile` against verified assets only. No image sequence → no media scrub. No 3D model or budget for one → no WebGL stage. Never select a pattern hoping assets will appear; never fabricate assets to justify a pattern.
4. **Business & trust needs** — Conversion-critical, trust-sensitive, or compliance-heavy sites tolerate less interference: prefer `low`-performance-cost accents near CTAs and forms. Brand/portfolio/campaign sites tolerate a stronger dominant mechanic.
5. **User task** — Users who scan, compare, or purchase need speed and orientation (favor `cursor-previews`, `state-microinteractions`, `view-transitions`). Users who explore or are being persuaded can be taken through a narrative (favor `scrollytelling`, `parallax-depth`, `media-scrub`).
6. **Creative intensity** — Read the brief's appetite honestly. Map it to the `performance` + `complexity` ceiling you allow: restrained brief → dominant mechanic must be `low`/`medium` on both; spectacle brief → one `high` mechanic allowed, everything else stays cheap.

Tie-break by: lower performance cost → lower complexity → better mobile strategy → fewer required assets.

## Non-Negotiable UX Guardrails

Every selection, regardless of pattern, must preserve:

- **One dominant mechanic maximum**, plus at most two supporting accents. Stacked spectacle reads as noise, not craft.
- **Progressive enhancement.** Core HTML content, headings, links, images, and copy exist and read correctly before any script or advanced CSS runs. Content must remain crawlable/indexable ([JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)).
- **Normal scroll, navigation, CTAs, and forms.** No scroll hijacking ([NN/g, Scrolljacking 101](https://www.nngroup.com/articles/scrolljacking-101/)). Pinned or horizontal sections need a native-scroll-flow fallback and must never trap the user. CTAs and form fields stay conventional, reachable, and unanimated during input.
- **DOM order matches reading order.** Visual reordering never breaks source order, landmark structure, or link semantics.
- **Keyboard and touch parity.** Everything reachable by pointer is reachable by keyboard and touch, with visible focus ([WCAG 2.2](https://www.w3.org/TR/WCAG22/)).
- **Reduced motion is a real design.** `prefers-reduced-motion` gets a considered static/2D composition, not a broken page ([MDN prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion); [Apple HIG — Motion](https://developer.apple.com/design/human-interface-guidelines/accessibility#Motion)).
- **Core Web Vitals at p75: LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1** ([web.dev vitals](https://web.dev/articles/vitals)). Animate compositor-friendly properties (`transform`, `opacity`) and avoid layout-thrashing effects ([web.dev animations guide](https://web.dev/articles/animations-guide)).
- **Sound is opt-in only.** Never autoplay audio.
- **No fake proof.** Patterns never justify invented logos, screenshots, metrics, or testimonials; missing assets get visible placeholders or the pattern is rejected.

## Pattern Index (overview)

| Slug | Category | Dominant use | Perf | Complexity |
|---|---|---|---|---|
| scroll-gallery | media-navigation | abundant visual collections on rails | medium | medium |
| scrollytelling | narrative | causal stories, process, data | medium | high |
| parallax-depth | depth | layered atmosphere and reveals | medium | medium |
| kinetic-type | typography | type as brand voice | medium | medium |
| media-scrub | media-narrative | transformation/product reveal | high | high |
| view-transitions | continuity | page/shared-element continuity | low | medium |
| webgl-product-stage | 3d | spatial/product understanding | high | high |
| cursor-previews | preview | dense index hover/focus/tap previews | low | low |
| editorial-collage | layout | curated asymmetric density | low | medium |
| draggable-gallery | media-navigation | inertial exploration of large sets | medium | high |
| asset-loader | loading | honest short loaders with real assets | medium | medium |
| state-microinteractions | micro | cheap state-aware polish | low | low |

Inspiration directories (Awwwards, SiteInspire, etc.) may inform art direction, but they are **inspiration, not performance or usability evidence** — never cite them as proof a mechanic works.
