---
name: creative-toolkit
description: Index-first HOW/WHEN selector for creative website implementation tools. Used only by website-creative after a creative pattern has been chosen; applies a native-first ladder, runtime limits, and verification gates.
---

# Creative Toolkit

This skill selects **how** to implement an already justified creative website mechanic. `creative-catalog` selects **what** the experience should do. The only runtime consumer is `website-creative`.

## Activation

Use only after website design and catalog selection establish a content-fit mechanic. Do not activate for routine websites, non-website agents, or speculative polish. “No tool” is valid.

`HOME_PREVIEW_MODE` is a hard native-only boundary: use only native CSS, HTML, and JavaScript. Reject Motion, GSAP, Three.js, packages, frameworks, and every external runtime.

## Selective retrieval

1. Read `tool-index.json` first; it is the complete shortlisting surface.
2. Match the selected mechanic, stack, fallback, accessibility, and performance needs.
3. Shortlist at most **1–2 profiles**, then read only those `profiles/<slug>.md` files.
4. Record the chosen tool (or no tool), rejected alternative, client boundary, fallback, and measurement gate before implementation.

Do not load every profile. This skill contains policy only—no dependencies or implementation source code.

## Native-first ladder

Escalate only when the previous rung cannot express the mechanic:

1. Native CSS/web platform; no tool is also valid.
2. Conditional Motion core for React.
3. Simple, progressively enhanced View Transitions for navigation continuity.
4. GSAP with ScrollTrigger only for justified complex sequencing or scroll orchestration.
5. Three.js/WebGL only when spatial understanding is essential.

At most one primary JavaScript animation runtime is allowed. Two runtimes require documented, disjoint capabilities; Motion and GSAP must never implement the same mechanic. Motion+ is paid/proprietary and unavailable unless purchase and use are explicitly authorized.

## Safety and verification gates

- Preserve static, semantic content and normal scrolling, navigation, CTAs, and forms without enhancement.
- Preserve DOM/reading order, keyboard and touch parity, visible focus, and a deliberately composed reduced-motion state.
- Target p75 LCP ≤ 2.5s, INP ≤ 200ms, and CLS ≤ 0.1. Prefer `transform` and `opacity`; layout- or paint-heavy motion requires target-runtime trace evidence.
- Vendor examples and bundle claims are not target-runtime measurements. Test supported browsers/devices with production assets and representative routes.
- Reject scroll hijacking, input animation, autoplay audio, fabricated assets, and effects that obscure content.
- Verify package/API claims against the profile’s official sources. Keep inaccessible or unverified install, import, licensing, or payment claims `UNKNOWN`; never infer them.
- Stop when required assets, fallback, authorization, browser support, or performance evidence are absent. De-escalate to a lower rung or no tool.
