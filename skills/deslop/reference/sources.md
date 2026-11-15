# Reference sources (curated)

Use these sources when the user asks for inspiration (see `inspiration-search.md`). Search **only here** for the type of screen; open search returns a lot of slop.

> **How to access:** the browsing is done by a **subagent on the cheapest model**, which opens the sources and takes a **screenshot** (it does not download the page). The main agent only decides what to search and analyses the screenshots that come back. The quantity follows the target of each mode (see *Cheap mode × guided mode*).

> Golden rule: every reference becomes **concept** (hierarchy, rhythm, metaphor), never **copy** (palette, font, literal layout). After choosing, filter the example through `ai-aesthetics.md`. Good references come contaminated too.

> **Source by platform:** for a phone app, start with *Flows and apps*. *Web and visual* and *Landing / SaaS* only enter a search for a site or landing page, or when the user asks. *Motion* and *Components* serve both, checking the platform of each example. *Identity and visual systems* serves any platform, but only for identity: never for screen structure.

## Flows and apps (mobile/product)

- **Mobbin** — mobbin.com — real app flows, organised by screen pattern. Latest: mobbin.com/discover/apps/ios/latest (what is shipping now; use the flow, not the single screen).
- **Pageflows** — pageflows.com — onboarding/upsell flows step by step.
- **Refero** — refero.design — interface patterns by category, straight to the point.
- **Appshots** — appshots.design — a library of flows and screens. **Use the site itself as the reference** (how it organises, navigates and presents flows), not the elements/screenshots inside it as pieces to copy.
- **ScreensDesign** — screensdesign.com — full recordings of onboarding → paywall → post-purchase, with estimated revenue. Use it for the **sequence** and to understand what converts; never copy the screen.
- **Appkittie** — appkittie.com — market intelligence (revenue, downloads, ads) with a library of onboardings and paywalls. Use it to decide **what is worth doing** and see the flow that already converts; the visual reference is still the project's identity.

## Motion and microinteraction

- **60fps** — 60fps.design — animation and interaction details from real apps, filterable by gesture (drag, swipe, long press), effect (morph, spring, stagger) and element (bottom sheet, tab bar, toast). Use it for timing, easing and transition ideas, not to copy the whole movement.

## Identity and visual systems

Use in *Arriving raw* and in searches for palette, typography and surface, when the user asks for references.

- **GradientDeck UI** — ui.gradientdeck.com — 1,286 `DESIGN.md` files written from real sites, free and with no login. Each has colours, typography, spacing, components and usage rules.
  - **How to search:** filter `https://ui.gradientdeck.com/library.json` by sector, theme, colours and fonts. Then open 3 to 5 styles at `https://ui.gradientdeck.com/styles/{slug}/design.md`. It is text, so read the file instead of taking a screenshot.
  - **Take:** colour proportion, type hierarchy and surface rule. Before asking, apply each concept to a real piece of the screen, with the project's own colours and fonts. Concept does not mean text only.
  - **Do not:** never save one of these files as the project's `DESIGN.md` or `recipes.md`, nor copy literal colours, fonts or layout. The designs belong to the source sites. Paid fonts only with a licence.
  - **Limit:** they are sites, not apps. Not useful for phone screen structure.

## Web and visual

- **Awwwards** — awwwards.com — sites with strong art direction (careful: it leans to "over-awarded"; filter).
- **Godly** — godly.website — sites with careful, curated aesthetics.
- **Land-book** — land-book.com — varied landing pages.
- **Minimal Gallery** — minimal.gallery — real minimalism (a good counterpoint to slop).
- **Dark Mode Design** — darkmodedesign.com — well-resolved dark screens (useful when the product is dark-first).
- **Kombai Selects** — kombai.com/selects/ — a curation from X, Dribbble and Behance, with interfaces that can be remixed. Useful for web, landing and dashboard; **careful:** Dribbble and Behance lean to the pretty, unreal mockup. Take the idea, not the pixel.

## Landing / SaaS

- **SaaS Landing Page** — saaslandingpage.com — SaaS landings.
- **Layers** — layers.to — isolated components and interactions.

## Components and product patterns

For app screens (dashboard, panel, chat, table), the reference is for **anatomy**, not aesthetics. The guide on how to assemble each piece is in `components.md`.

- **BoardUI** — boardui.com — a React design system (103 components, 19 charts, 400+ tokens) for dashboards and agent interfaces. The best reference for a product app: data table (search → filter → status → actions), metric tiles with comparison, chart cards with a period selector, agent states (composer, progress, sources), upload with validation, calendar, sidebar.
  - **Take:** data hierarchy, table density, explicit states (empty/loading/error), tokens instead of loose values, grouping by section.
  - **Discard:** the default "shadcn/SaaS" look (neutral grey + Inter + equal corners), decorative status pills, gradients in charts, streak/ring widgets when they are not the product.
- **Layers** — layers.to — isolated components; good for checking the state and microinteraction of a single piece.

## How to record a reference

When saving a screenshot, note in the folder's README:

```
[NN]-<name>.png — what it solves well: <1 sentence>. What to take: <1 concrete sentence>.
```

Do not paste the image without a note: a reference with no "what to take" becomes a copy.
