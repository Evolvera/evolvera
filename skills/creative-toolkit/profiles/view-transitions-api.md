# View Transitions API

- `verified_on`: `2026-07-18`
- Status: `verified`
- Fit: simple, progressive same- or cross-document continuity where navigation relationships benefit from visual context.
- Mechanics: native view-transition snapshots and CSS customization; instant navigation remains baseline behavior.
- Avoid/stop: avoid when no continuity need exists; stop if transitions block/delay navigation or unsupported browsers cannot navigate normally.
- Stack/client boundary: native platform feature; feature-detect and add script only at the boundary required by the chosen navigation mode.
- Progressive/static fallback: unsupported browsers receive immediate normal navigation and the same content.
- Reduced motion: disable or substantially simplify transitions without delaying destination content.
- Performance: test real routes for p75 LCP ≤2.5s, INP ≤200ms, CLS ≤0.1; do not treat browser demos as runtime evidence.
- Package/API claims: no package. Exact browser support and API shape must be checked against current official documentation and target browsers.
- Licensing: web platform. Payment: none.
- Official sources: [MDN View Transition API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API), [Chrome View Transitions](https://developer.chrome.com/docs/web-platform/view-transitions/).
