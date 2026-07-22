# Motion for React (Core)

- `verified_on`: `2026-07-18`
- Status: `verified`
- Fit: conditional React rung for declarative component animation, gesture, layout, or presence mechanics that native CSS/platform primitives cannot express cleanly.
- Mechanics: install core with `npm install motion`; import React APIs with `import { motion } from "motion/react"`.
- Avoid/stop: reject in `HOME_PREVIEW_MODE`; stop when native is sufficient or the client/runtime cost is unjustified. Motion and GSAP never implement the same mechanic.
- Stack/client boundary: keep Server Components by default and place Motion in the smallest owning client component.
- Progressive/static fallback: meaningful React/HTML content renders without motion or runtime completion.
- Reduced motion: replace movement with an intentional static or low-motion composition, preserving state and meaning.
- Performance: prefer `transform`/`opacity`; measure production routes against p75 LCP ≤2.5s, INP ≤200ms, CLS ≤0.1. Vendor claims are not target evidence.
- Package/API claims: the package and import above are verified from official Motion documentation. Other exact package/API claims require fresh official verification.
- Licensing: `UNKNOWN`. Motion core payment requirements: `UNKNOWN`.
- Motion+: paid/proprietary and unavailable without explicit purchase and authorization; it is not Motion core and must not be silently substituted.
- Official sources: [Motion React](https://motion.dev/docs/react), [Motion installation](https://motion.dev/docs/react-installation).
