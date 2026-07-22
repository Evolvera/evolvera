# Native Web Platform

- `verified_on`: `2026-07-18`
- Status: `verified`
- Fit: default first rung for website-creative and the only permitted rung in `HOME_PREVIEW_MODE`.
- Mechanics: CSS transitions/keyframes, scroll-driven enhancement, and Web Animations API where support and need justify it.
- Avoid/stop: do not force native primitives into unmaintainable complex orchestration; stop if unsupported browsers cannot retain a useful static experience.
- Stack/client boundary: framework-independent; prefer CSS and isolate optional browser API code to the smallest client boundary.
- Progressive/static fallback: semantic HTML, visible content, links, forms, and normal navigation work before enhancement.
- Reduced motion: provide a deliberate static composition through `prefers-reduced-motion`.
- Performance: prefer `transform`/`opacity`; verify p75 LCP ≤2.5s, INP ≤200ms, CLS ≤0.1. Trace layout/paint-heavy effects in the target runtime.
- Package/API claims: no package. Browser API support must be feature-detected against target browsers.
- Licensing: web platform. Payment: none.
- Official sources: [MDN CSS](https://developer.mozilla.org/en-US/docs/Web/CSS), [MDN Web Animations API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API).
