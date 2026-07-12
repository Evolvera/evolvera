# WebGL Product Stage

A real-time 3D stage — typically Three.js — where users orbit, zoom, or configure a product. Reserved for cases where *spatial understanding itself* is the message; 3D as decoration is the most expensive way to say nothing.

## Intent & Communication

Communicates spatial truth and technical sophistication: "inspect it from every angle; we have nothing to hide." Interactive 3D shifts the user from viewer to inspector, which builds confidence for products whose form, mechanism, or configuration drives the decision.

## Best Fits

- Physical products where geometry/configuration matters to purchase (hardware, furniture, vehicles, devices).
- Configurators: material, color, and option changes rendered live.
- Spatial subjects: architecture, installations, venues.

## Content & Assets Required

- A production-quality, optimized 3D model (glTF/GLB, Draco/meshopt-compressed, sane polycount, baked or compact PBR textures).
- Lighting/environment setup (HDRI or studio rig) matching the brand's visual grade.
- A high-quality 2D render of the model — poster, fallback, and LCP image.
- This pattern is hard asset-gated: no real model → reject or mark BLOCKED; never substitute a generic placeholder mesh presented as the product.

## Variants

- **Orbit stage** — user-controlled orbit/zoom within constrained camera limits.
- **Scroll-choreographed camera** — scroll moves the camera through authored keyframes (combine with scrollytelling guardrails).
- **Configurator** — UI controls (real DOM buttons/selects) swap materials/options.
- **Ambient hero** — slow autonomous rotation as a hero backdrop; must pause under reduced motion and on tab blur.

## When Not to Use

- A photo or video communicates the product equally well — then 3D is pure cost.
- No model exists and none can be commissioned.
- Strict lightweight budgets, or long-term maintainers without 3D experience.
- Story-led pages where 3D would compete with the narrative rather than carry it.

## Core UX Guardrails (Navigation / CTA / Forms)

- The stage is an island: page scroll, navigation, CTAs, and forms are ordinary DOM outside the canvas. Configurator controls are real accessible DOM elements, never canvas-painted buttons.
- Canvas capture of scroll/gestures only after explicit engagement (tap/click to activate) so page scrolling over the stage never traps the user.
- All product facts (name, specs, price, CTA) exist as HTML text — the canvas is invisible to crawlers ([JS SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)).

## Mobile & Touch Adaptation

- Reduced geometry/texture budgets, capped `devicePixelRatio` (≤ 2), antialiasing tuned down; tap-to-activate before the WebGL context loads.
- One-finger orbit only after activation; two-finger page scroll passes through. Pinch conventions match platform expectations.
- Static render served to low-power devices and on WebGL context failure.

## Keyboard, DOM & Accessibility

- Keyboard parity: arrow keys orbit, +/- zoom, documented via visible hint; configurator options are focusable inputs with labels ([WCAG 2.2](https://www.w3.org/TR/WCAG22/)).
- The stage has an accessible name and a text description of the product's appearance; state changes (selected material/color) are announced via the controlling DOM inputs.
- Canvas is one tab stop, never a focus trap (2.1.2).

## Reduced-Motion Static Fallback

Under `prefers-reduced-motion: reduce`, disable autonomous rotation and camera choreography; show the static render or an inert stage that moves only on direct user input ([MDN prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion); [Apple HIG — Motion](https://developer.apple.com/design/human-interface-guidelines/accessibility#Motion)). User-initiated orbiting may remain — motion the user directly drives is acceptable; ambient motion is not.

## Performance Level & Budget

**Level: high.** Explicit budgets: model+textures target (typically ≤ 2–4MB compressed), lazy-load the engine and model after first paint, render on demand (no rAF loop while idle/off-screen), dispose contexts when hidden. The LCP element must be the 2D poster, not the canvas — never let LCP wait on WebGL init ([web.dev vitals](https://web.dev/articles/vitals)); keep main-thread work chunked to protect INP ≤ 200ms ([web.dev animations guide](https://web.dev/articles/animations-guide)). Three.js is the assumed engine ([threejs.org](https://threejs.org/)); do not add it unless the project authorizes the dependency.

## Implementation Complexity

**High — the highest in this catalog.** Asset pipeline, loaders, lighting, interaction, activation gating, keyboard layer, fallback renders, and performance tuning across devices. Only select when spatial understanding is demonstrably the message.

## Sources

- https://threejs.org/
- https://web.dev/articles/vitals
- https://web.dev/articles/animations-guide
- https://www.w3.org/TR/WCAG22/
- https://developer.apple.com/design/human-interface-guidelines/accessibility#Motion
- https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion
- https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics
