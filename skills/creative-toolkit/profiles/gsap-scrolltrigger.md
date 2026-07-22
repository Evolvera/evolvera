# GSAP with ScrollTrigger

- `verified_on`: `2026-07-18`
- Status: `verified`
- Fit: justified complex sequencing or scroll orchestration after native and simpler Motion core options fail the mechanic.
- Mechanics: GSAP timelines, React integration, and ScrollTrigger coordination as documented by GSAP.
- Avoid/stop: reject in `HOME_PREVIEW_MODE`; reject scroll hijacking and routine reveals. Stop without normal-flow, static, touch/keyboard, and reduced-motion behavior. Motion and GSAP never implement the same mechanic.
- Stack/client boundary: isolate registration, setup, cleanup, and DOM ownership to the smallest owning React client component.
- Progressive/static fallback: semantic content and native scrolling work before initialization; pinned/horizontal compositions become readable normal flow.
- Reduced motion: remove scroll-linked movement and preserve a deliberately composed static flow.
- Performance: prefer `transform`/`opacity`; trace target devices and production assets for p75 LCP ≤2.5s, INP ≤200ms, CLS ≤0.1. Layout/paint-heavy motion requires runtime trace evidence.
- Package/API claims: exact install/import strings are `UNKNOWN` in this profile; consult official documentation before implementation.
- Licensing: `UNKNOWN`. Payment: `UNKNOWN`.
- Official sources: [GSAP docs](https://gsap.com/docs/v3/), [ScrollTrigger](https://gsap.com/docs/v3/Plugins/ScrollTrigger/), [GSAP React](https://gsap.com/resources/React/).
