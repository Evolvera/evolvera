# Design Vocabulary — Canonical Named Terms

One shared vocabulary for every design field. Producers choose terms by exact name; downstream agents implement and audit by the same names. Brand references (`designs/<slug>/DESIGN.md`) supply tokens and taste; this file supplies the named decisions.

## Selection Protocol

1. For each field relevant to the brief, select ONE primary term (+ at most one secondary) from this file by its exact name. Never invent a term or rename one. `None / Conventional default` is valid and often right.
2. Prefer conventions users already know (Jakob's Law, NN/g) unless the brief justifies distinction. Distinctive, signature mechanics go through `website-creative` and `creative-catalog`, not this file.
3. Each selection records: field, term, why it fits (content, user task, brand), the rejected alternative and why, and its guardrail.
4. Output a `## Design Vocabulary Selection` table in the producing artifact (DESIGN_PLAN.md; HOME_DESIGN_OPTIONS.md per option; HOME_PLAN.md as the final fused selection) with exactly these columns:

| Field | Term | Fit | Rejected alternative | Guardrail |
|-------|------|-----|----------------------|-----------|

5. Downstream (planner, builder, polisher, validator) use the same exact term names. Builders implement the term's defined behavior and guardrail; polishers and validators report deviations as "term X specified, Y implemented".
6. Terms marked with `→ creative-catalog` and a slug are mechanic-level: as a dominant mechanic they route through `website-creative`; baseline use stays restrained.

Row format: **Term** | what it is | use when | avoid when | guardrail (a11y / perf / usability).

## 1. Layout & Grid

| Term | What it is | Use when | Avoid when | Guardrail |
|---|---|---|---|---|
| **12-column grid** | Standard 12-col responsive grid with gutters and max-width container | Most marketing/app pages needing predictable alignment | Intentionally irregular editorial compositions | Collapse to 4 cols on mobile; keep gutters consistent |
| **Bento grid** | Modular tiles of varied spans in one grid, each a self-contained feature | Showing 4–8 discrete features/benefits at a glance | Sequential or long-form content; fewer than 4 items | Reading order must follow DOM order; one column on mobile |
| **Split screen** | Two equal halves, usually copy + visual | Two parallel choices or copy-plus-media | Dense text on both sides | Stack on narrow screens; keep one clear primary action |
| **Card grid** | Uniform cards in rows | Scannable collections of comparable items | Items of unequal weight | Equal card heights, consistent aspect ratio, visible focus |
| **Masonry** | Column-packed items of varying height | Image-led galleries and feeds | Content read in strict order or compared | Tab order must match visual order; avoid layout shift on load |
| **Asymmetric/editorial grid** | Deliberate off-balance spans with whitespace tension | Brand-led, magazine-like pages with strong imagery | Task-heavy or data-dense screens | Preserve reading order; reflow predictably to a single column |
| **Full-bleed** | Content or media spanning the viewport edge to edge | Hero media, section dividers, immersive bands | Long text lines | Keep text within a readable measure inside the bleed |
| **Single column** | One centered content column | Articles, forms, mobile-first flows | Wide comparisons or dashboards | Measure 45–75ch for text |
| **Sidebar layout** | Main content plus a persistent secondary column | Docs, dashboards, filters, settings | Short marketing pages | Sidebar collapses to drawer or top block on mobile |
| **Holy Grail** | Header, footer, main with two side columns | Portals and apps with navigation plus contextual aside | Simple pages; mobile-first content | Main content first in DOM; sides collapse below main |

## 2. Hero

| Term | What it is | Use when | Avoid when | Guardrail |
|---|---|---|---|---|
| **Text-only hero** | Headline, subhead, CTA, no media | Strong message, no real visuals available | Visual product or place is the proof | Headline contrast AA; no placeholder imagery |
| **Split hero** | Copy on one side, media on the other | Product with one clear visual and a single CTA | Weak or generic visuals | Stack copy first on mobile; LCP image sized and prioritized |
| **Full-bleed media hero** | Edge-to-edge image behind overlaid copy | Emotional, place- or experience-led brands | Copy-heavy or low-quality imagery | Scrim for AA contrast; LCP image optimized (web.dev) |
| **Product-shot hero** | Real product image/render as the focal point | Physical or software product with a strong visual | No real asset exists | Real assets only; fixed aspect ratio avoids CLS |
| **Video hero** | Muted looping background or featured video | Motion is core to the story | Slow connections; text-led value proposition | No autoplay with sound; pause control; poster image; honor reduced motion |
| **Interactive demo hero** | Live or simulated product interaction in the hero | Product value is understood by trying | Demo needs setup or hides the CTA | Keyboard operable; static fallback; lazy-load heavy code |
| **Centered hero** | Centered headline, subhead, CTA stack | Simple single-message pages | Long copy | One primary CTA; max 2 lines headline on mobile |
| **Hero with proof strip** | Hero followed by logos/metric proof | Trust is the main conversion barrier | No verified proof | Verified proof only; never invented logos or metrics |

## 3. Content Sections

| Term | What it is | Use when | Avoid when | Guardrail |
|---|---|---|---|---|
| **Logo wall / Social proof strip** | Row of verified customer/partner marks | Real recognizable clients exist | No verified logos | Grayscale consistent sizing; alt text; wrap on mobile |
| **Feature grid** | Icon/title/description items in a grid | 3–9 parallel benefits | One dominant feature | Outcome-led titles; max one line of description each |
| **Alternating feature rows (Z-pattern)** | Media/copy rows alternating sides | 3–5 features needing explanation with visuals | Many items; no media | Mobile order stays copy then media; consistent media ratio |
| **Testimonials** | Attributed customer quotes | Real, attributable quotes exist | Anonymous or invented quotes | Name, role, source; never fabricated; avoid auto-rotating |
| **Pricing table** | Plan columns with price, features, CTA | Public, comparable pricing | Custom/quote-only offers | Highlight one plan; show billing period; mobile as stacked cards |
| **Comparison table** | Feature-by-feature matrix | Differentiation vs alternatives or tiers | Few differences | Real `<table>` semantics; sticky header; no color-only cells |
| **FAQ accordion** | Expandable question list | Objection handling, 5–10 real questions | Critical info users must not miss | Button+aria-expanded; answers indexable; keyboard operable |
| **Stats band** | Row of 3–4 key numbers | Verified, meaningful metrics | Unverified numbers | Source and date for each metric |
| **CTA band** | Full-width conversion prompt mid-page | After a persuasion block | Competing with the hero CTA wording | One action, same label as primary CTA |
| **Footer CTA** | Final conversion block above footer | Long pages where users reach the end | Short pages | Repeat the primary action only; contact fallback |
| **How-it-works steps** | Numbered process sequence | Explaining a 3–5 step process | Non-sequential content | Ordered list semantics |

## 4. Navigation

| Term | What it is | Use when | Avoid when | Guardrail |
|---|---|---|---|---|
| **Sticky header** | Header fixed at top while scrolling | Multi-page sites needing constant access | Short single-screen pages; small landscape viewports | Compact height; offset anchors (scroll-padding-top) so focus is not obscured (WCAG 2.2 2.4.11) |
| **Hide-on-scroll header** | Hides on scroll down, reveals on scroll up | Content-heavy pages needing screen space | Pages with frequent nav use | Reappear on focus and keyboard use; no jitter |
| **Mega menu** | Large panel of grouped links | 20+ destinations in clear groups | Fewer than 8 destinations; touch-first | Open on click/Enter, not hover only; Esc closes |
| **Hamburger / Off-canvas drawer** | Collapsed menu in a slide-in panel | Mobile primary nav | Desktop with room for links | Visible label or accessible name; focus trap; Esc closes |
| **Bottom tab bar** | 3–5 persistent destinations at the bottom | App-like mobile with frequent top-level switching | More than 5 destinations | Icon + label; 44px targets (Apple HIG, Material) |
| **Breadcrumbs** | Hierarchical path trail | Deep hierarchies, docs, catalogs | Flat sites | `nav` landmark with aria-label; current page not a link |
| **Anchor nav with Scrollspy** | In-page links highlighting the current section | Long single pages, docs | Short pages | Highlight is not color-only; `aria-current`; native hash behavior |
| **Sidebar nav** | Vertical persistent tree | Docs, dashboards | Marketing pages | Collapsible on mobile; current item marked |
| **Command palette** | Keyboard-invoked search/action launcher | Power-user tools, many actions | General audiences as sole navigation | Never the only path; discoverable shortcut |
| **Pagination** | Numbered pages | Goal-directed browsing, SEO, return to position | Feeds | Link semantics; current page marked |
| **Infinite scroll** | Auto-load on scroll | Feeds without goal-directed lookup | Footers, comparison, goal-directed search | Provide Load more fallback; preserve position |
| **Load more** | Button to append items | Catalogs where control and footer access matter | Short lists | Announce result count; keep focus stable |

## 5. Scroll Behavior

Baseline uses are restrained and never gate content. As a dominant mechanic, a term routes through `website-creative`.

| Term | What it is | Use when | Avoid when | Guardrail |
|---|---|---|---|---|
| **Native scroll (none)** | Plain document scroll, no scroll effects | Default for most content | — | Never override scroll speed or direction |
| **Scroll-triggered** | One-shot animation/state change fired when an element enters the viewport | Reveals, counters, lazy content | Content needed immediately or by crawlers | IntersectionObserver; content present in DOM; no re-trigger loops; reduced-motion shows final state |
| **Scroll-linked** | Property progress bound continuously to scroll position | Progress bars, header shrink, small orientation cues | Large layout shifts | Prefer CSS scroll-driven animations or compositor-only props (web.dev); no scroll-jacking (NN/g) |
| **Parallax** | Layers move at different rates for depth → creative-catalog `parallax-depth` | Subtle depth on 1–2 decorative layers | Text-bearing layers; low-end devices | Off under reduced motion; transform only; no motion sickness triggers |
| **Sticky** | Element pins within its container while scrolling (`position: sticky`) | Section headers, TOC, summaries, side-by-side stories | Tall sticky layers on small viewports | Never cover focus targets; release at container end; mobile fallback |
| **Scroll Snap** | CSS snap points aligning scroll stops (`scroll-snap-type`) | Carousels, card rails, full-screen slides | Long reading content; `mandatory` on tall sections | Prefer `proximity` for pages; keyboard and wheel must pass through |
| **Horizontal Scroll** | Content moves sideways via scroll → creative-catalog `scroll-gallery` | Galleries, timelines, card rails with 8+ items | Primary reading content; text-led sections | Vertical fallback on mobile; keyboard operable; visible affordance; no hijack |
| **Scrollytelling** | Narrative chapters advancing with scroll → creative-catalog `scrollytelling` | Process, case study, or story with 3–6 chapters | Conversion-critical pages | Static fallback of all chapters; progress indication; skippable |
| **Media scrub** | Video/image sequence frame bound to scroll → creative-catalog `media-scrub` | One hero product reveal with prepared assets | Weak connections; no prepared frames | Poster fallback; lazy-load; reduced-motion shows still |
| **Scroll-to-top** | Control returning to the top | Very long pages | Short pages | Button, keyboard reachable, no auto-hijack |

## 6. Motion & Transitions

| Term | What it is | Use when | Avoid when | Guardrail |
|---|---|---|---|---|
| **Fade-in reveal** | Opacity (+ small translate) on entry | Section entry on long pages | Above-the-fold LCP content | Duration ≤400ms; content not hidden without JS |
| **Staggered reveal** | Sequential offsets across siblings | Grids and lists of 3–8 items | Larger sets; repeated every scroll | Total stagger ≤600ms; reduced-motion removes offsets |
| **Shared-element transition** | An element morphs between two states/views | List-to-detail continuity | Unrelated pages | Preserve focus and context; reduced-motion crossfades |
| **View transition** | Browser-level animated page/state change (View Transition API) → creative-catalog `view-transitions` | Same-document or same-origin navigation continuity | Unsupported-browser-critical flows | Progressive enhancement; skippable; no blocking |
| **Micro-interaction** | Small, single-purpose feedback animation → creative-catalog `state-microinteractions` | Confirming an action or state change | Decoration without purpose | ≤300ms; carries meaning; not the only feedback |
| **Ease-out easing** | Fast start, gentle stop | UI entering the screen; default | Playful physics-led brands | Never linear for UI motion; entry uses ease-out, exit ease-in |
| **Spring easing** | Physics-based overshoot/settle | Direct manipulation, playful brands, drag | Formal/utility interfaces | Limited overshoot; reduced-motion falls back to ease-out |
| **Duration tiers** | Fixed timing set: fast 100–150ms, base 200–300ms, slow 400–500ms | Every motion token set | Arbitrary per-element timings | Interactions ≤300ms (Material, NN/g); define tokens once |
| **Reduced-motion alternative** | `prefers-reduced-motion` substitute: instant state or opacity-only | Every non-trivial motion | Never skip | Required for any specified motion term (WCAG 2.3.3) |
| **Loading transition** | Animated handoff from loader to content | Async content swaps | Fast (<300ms) loads | No layout shift; announce completion to AT |

## 7. Feedback, States & Microinteractions

| Term | What it is | Use when | Avoid when | Guardrail |
|---|---|---|---|---|
| **Skeleton screen** | Placeholder shapes mirroring final layout | Content loads > 300ms with known structure | Unknown layout; very short loads | Same dimensions as content (no CLS); `aria-busy` |
| **Spinner** | Indeterminate activity indicator | Short, unknown-duration waits (<10s) | Long waits or known progress | Accessible name; avoid on whole page |
| **Progress bar** | Determinate progress | Uploads, multi-step flows with measurable progress | Unmeasurable tasks | `role=progressbar` with values (NN/g response-time) |
| **Optimistic UI** | Show success immediately, reconcile after | High-success low-risk actions (like, toggle) | Payments, destructive actions | Visible rollback with error message |
| **Toast / Snackbar** | Transient non-blocking message | Confirming a completed background action | Errors needing action; critical info | `role=status`; ≥5s or persistent; no sole feedback; dismissible |
| **Inline validation** | Field-level feedback near the input | Forms with format rules | Validating before the user finishes typing | Validate on blur; text + icon, not color alone; linked via `aria-describedby` |
| **Empty state** | Designed view with no data | Lists, search, first use | — | Explain why and offer the next action |
| **Error state** | Clear failure with recovery | Any failing request/form | Blame language | Plain-language cause + recovery; preserve user input |
| **Success state** | Confirmation of completion | End of flows | — | Next step offered; announced to AT |
| **Hover / Focus / Active states** | Distinct interaction states per control | Every interactive element | Hover as the only affordance | Visible focus (WCAG 2.4.7/2.4.13); hover not required on touch |
| **Disabled state** | Unavailable control | Unmet prerequisites | Hiding why | Explain why; low-contrast exemption ≠ unreadable |
| **Pending/Loading button** | Button locked with in-progress label | Form submits and async actions | — | Prevent double submit; keep width stable |

## 8. Typography

| Term | What it is | Use when | Avoid when | Guardrail |
|---|---|---|---|---|
| **Modular type scale (ratio)** | Sizes derived from one ratio (1.125–1.333) | Every system | Ad-hoc sizes | State ratio and base size; ≥16px body |
| **Fluid type (clamp)** | `clamp()` sizes scaling between viewport bounds | Headings across breakpoints | Fixed UI text in dense apps | Min/max bounds; respects user zoom (WCAG 1.4.4) |
| **Serif/sans pairing** | Serif headings + sans text, or inverse | Editorial or heritage tone | Technical/utility tone | Two families max; check x-height harmony |
| **Display + text pairing** | Expressive display face + neutral text face | Brand-led headlines | Display face for body | Display only ≥24px; legible fallback stack |
| **Single-family system** | One family across weights | Product, utility, minimal | Heritage/editorial | Weight contrast carries hierarchy |
| **Variable font** | One file with continuous axes | Multiple weights/widths; performance | Single weight use | `font-display: swap`; preload critical file; subset |
| **Monospace accent** | Mono for code, data, labels | Technical/developer brands | Long body text | Use sparingly; keep alignment-driven |
| **Measure 45–75ch** | Line length target | Body text | — | Cap at 75ch (NN/g, Bringhurst) |
| **Line-height tiers** | Body 1.5–1.6, headings 1.1–1.25 | Every scale | Uniform line-height | Body ≥1.5 (WCAG 1.4.12 tolerance) |
| **Kinetic type** | Animated typographic expression → creative-catalog `kinetic-type` | Single hero statement | Body copy; long text | Static fallback; keep text selectable and readable |

## 9. Color

| Term | What it is | Use when | Avoid when | Guardrail |
|---|---|---|---|---|
| **60-30-10 rule** | 60% dominant neutral, 30% secondary, 10% accent | Default palette proportions | — | Accent reserved for actions/emphasis |
| **Neutral + single accent** | Gray scale plus one brand hue | Product/SaaS, minimal | Brands needing multiple hues | Accent passes AA on its backgrounds |
| **Monochromatic** | Tints/shades of one hue | Calm, cohesive brands | Needing clear state differentiation | Add semantic colors separately |
| **Analogous** | Neighboring hues | Warm, harmonious feel | Strong contrast needs | One hue leads |
| **Complementary accent** | Opposite-hue accent on a base | Strong CTA emphasis | Many CTAs | Accent ≤10% of surface |
| **Semantic colors** | Success/warning/error/info set | Any feedback | — | Never color-only meaning (WCAG 1.4.1) |
| **Dark mode / Light mode** | Themed token sets | User preference or brand tone | Unverified contrast | Designed per theme (not inverted); `prefers-color-scheme` |
| **Gradient mesh** | Soft multi-point color fields | Atmospheric backgrounds | Under text without scrim | Static; contrast checked on worst region |
| **Duotone** | Two-color image/surface treatment | Unifying inconsistent imagery | Product accuracy matters | Keep subject recognizable |
| **WCAG contrast AA 4.5:1 / 3:1** | Text 4.5:1 (large text and UI components 3:1) | Always | — | Verify each text/background pair (WCAG 1.4.3, 1.4.11) |

## 10. Surface & Visual Style

| Term | What it is | Use when | Avoid when | Guardrail |
|---|---|---|---|---|
| **Flat** | No depth cues, solid fills | Clean modern UIs | Weak affordance contexts | Keep clear interactive affordances |
| **Material elevation** | Shadow/tone levels expressing hierarchy | Layered UI (cards, dialogs) | Dense flat layouts | Max 3–4 elevation levels; consistent mapping |
| **Glassmorphism** | Translucent blurred layers | Overlays on rich backgrounds | Text-heavy panels; low-end devices | Contrast check on worst background; `backdrop-filter` fallback |
| **Neumorphism** | Soft extruded same-color surfaces | Rare decorative controls | Real interfaces | Poor contrast; do not use for core controls |
| **Neo-brutalism** | Hard borders, offset shadows, raw colors | Bold, youthful, anti-corporate | Trust-critical, regulated | Keep spacing and contrast disciplined |
| **Swiss / International Typographic Style** | Grid, sans type, asymmetry, objective clarity | Authority, design-led, information-rich | Playful brands | Strict grid and scale |
| **Skeuomorphism** | Realistic material imitation | Product-true or tactile brands | Generic UI | Performance; assets must be real |
| **Minimalism** | Reduction to essentials, generous whitespace | Premium, focused products | Content needing richness | Do not lose affordance or hierarchy |
| **Editorial** | Magazine-style type, imagery, pacing | Content/story-led brands | Task-dense apps | Maintain scan paths |
| **Dark technical** | Dark surfaces, mono accents, subtle borders | Developer/infrastructure tools | Warm consumer brands | Contrast on borders and secondary text |

## 11. Imagery & Iconography

| Term | What it is | Use when | Avoid when | Guardrail |
|---|---|---|---|---|
| **Photography (documentary)** | Candid real-life images | Authenticity, people, places | Abstract products | Real assets only; no stock pretending to be clients |
| **Photography (studio)** | Controlled product/portrait imagery | Product precision | Authentic-story brands | Consistent lighting and crop |
| **Product render** | 3D/CGI product imagery | Pre-launch or hard-to-photograph products | Claims of real use | Label as render where relevant |
| **Illustration (flat / line / 3D)** | Custom drawn imagery | Abstract concepts, friendly tone | Needing factual proof | One style across the site |
| **Duotone imagery** | Two-color image treatment | Cohesion across mixed photos | Color-critical products | Maintain focal clarity |
| **Cutout** | Subject isolated from background | Product on brand surface | Poor edge quality | Clean edges; consistent shadow |
| **Icon style (outline / filled / duotone)** | One icon family and style | Every icon set | Mixed families | One family; consistent stroke; paired with labels |
| **Aspect-ratio system** | Fixed ratios (16:9, 4:3, 1:1, 3:4) | All media | Arbitrary ratios | Declare `aspect-ratio`; prevents CLS |
| **Art direction per breakpoint** | Different crops per viewport (`picture`) | Hero and key imagery | Simple images | Keep focal point in each crop |
| **Image performance policy** | Modern formats, `srcset`, lazy-load below the fold | All images | Lazy-loading the LCP image | Dimensions set; LCP prioritized (web.dev) |

## 12. Components

| Term | What it is | Use when | Avoid when | Guardrail |
|---|---|---|---|---|
| **Card** | Contained group of related content | Browsable items | Single flowing text | One primary action; whole-card link pattern accessible |
| **Modal / Dialog** | Blocking overlay | Required decisions, short tasks | Information or long forms | Focus trap, Esc, return focus, `aria-modal` |
| **Drawer / Sheet** | Edge-anchored panel | Secondary tasks, filters, mobile menus | Primary content | Focus management; swipe not sole close |
| **Tabs** | Switch between peer views | 2–5 peer panels | Sequential steps; SEO-critical copy | WAI-ARIA tabs; arrow keys; panels in DOM |
| **Accordion** | Expand/collapse sections | Long optional detail | Critical info | Button + `aria-expanded`; multiple open allowed |
| **Carousel (with caution)** | Rotating/swipeable items | Optional browsing of related media | Primary content or key messages (NN/g) | No auto-advance; pause control; keyboard and swipe |
| **Tooltip** | Short non-interactive hint | Clarifying an icon/term | Essential info; touch | Focus-triggered too; dismissible (WCAG 1.4.13) |
| **Popover** | Interactive anchored panel | Contextual controls | Long content | Focus management; Esc |
| **Badge / Chip** | Small status/filter label | Status, tags, filters | Long text | Not color-only; accessible name |
| **Data table** | Tabular data | Comparing structured records | Layout | `th` scope, sortable via buttons, responsive overflow |
| **Stepper** | Progress through steps | Multi-step flows | Single-step | Current step marked; steps navigable when valid |
| **Button hierarchy** | Primary / secondary / tertiary | Every action set | Several primaries per view | One primary per view; ≥44px target |

## 13. Forms & Input

| Term | What it is | Use when | Avoid when | Guardrail |
|---|---|---|---|---|
| **Single-column form** | Fields stacked in one column | Almost all forms (NN/g) | — | Logical order; related fields grouped |
| **Multi-step / Wizard** | Form split into stages | Long or branching forms | Short forms | Progress shown; back preserves data |
| **Top-aligned labels** | Label above field | Default; fastest scanning | — | Persistent visible label; `for`/`id` linked |
| **Floating labels (with caution)** | Label moves into/above field | Space-constrained UIs | Accessibility-critical or long labels | Contrast and truncation risk; placeholder is not a label |
| **Inline validation** | Field-level validation | Format constraints | Premature errors | On blur; clear recovery text; `aria-describedby` |
| **Progressive disclosure** | Reveal fields as needed | Conditional or advanced fields | Required fields hidden | Do not hide required info; manage focus |
| **Smart defaults** | Prefilled likely values | Predictable answers | Sensitive/legal choices | Editable; never preselect consent |
| **Autosave** | Persist drafts automatically | Long forms, editors | Irreversible submits | Visible saved status |
| **Input masks / Typed inputs** | Correct `type`, `inputmode`, `autocomplete` | All forms | Over-constraining | Use `autocomplete` tokens (WCAG 1.3.5) |
| **Required/optional marking** | Mark the exception | All forms | — | Mark optional or required consistently, not color-only |

## 14. Data Visualization

| Term | What it is | Use when | Avoid when | Guardrail |
|---|---|---|---|---|
| **KPI card** | Single prominent metric with context | Dashboards, stats | No baseline | Show unit, period, and delta with source |
| **Sparkline** | Tiny trend line | Trends in tables/cards | Precise reading | Pair with the current value |
| **Bar** | Length-encoded comparison | Category comparison | Time trends with many points | Zero baseline; sorted order |
| **Line** | Trend over continuous time | Time series | Few unordered categories | Direct labels; ≤5 series |
| **Stacked area** | Cumulative composition over time | Part-to-whole over time | Comparing individual series | Limited series; clear order |
| **Donut (with caution)** | Part-to-whole ring | 2–4 segments | Many segments; precise comparison | Prefer bar; label values directly |
| **Table vs chart choice** | Choose table for lookup, chart for pattern | Every dataset | — | State the user task driving the choice |
| **Annotation** | Direct labels/callouts on a chart | Explaining key events | Clutter | Text alternative or data table provided |
| **Colorblind-safe palette** | Palette distinguishable without hue | All multi-series charts | — | Add patterns/labels; contrast 3:1 |

## 15. Responsive Strategy

| Term | What it is | Use when | Avoid when | Guardrail |
|---|---|---|---|---|
| **Mobile-first** | Base styles for small screens, enhance upward | Default | — | Verify 390px and 1440px (this harness) |
| **Content-first breakpoints** | Break where content fails, not at device widths | Default | — | Few breakpoints; test between them |
| **Fluid layout** | Percentage/`fr`/clamp-based sizing | Most layouts | Fixed precision UIs | Max-width cap on large screens |
| **Container queries** | Components respond to container size | Reusable components in varied slots | Simple page-level changes | Provide fallback for unsupported browsers |
| **Reflow / Stacking** | Multi-column collapses to single column | Content grids | — | No horizontal scroll at 320 CSS px (WCAG 1.4.10) |
| **Priority+ navigation** | Visible top links, overflow in "More" | Medium-width nav with many links | Few links | Overflow menu keyboard accessible |
| **Touch targets 44/24px** | Targets ≥44px (HIG) with WCAG 2.2 minimum 24px | All interactive controls | — | Spacing counts toward the minimum |
| **Responsive images (srcset/sizes)** | Resolution switching | All raster media | — | Pair with Aspect-ratio system |
| **Desktop-composed layout** | Intentional wide-screen composition | 1440px+ | Stretched mobile layout | No dead zones; cap line length |

## 16. Accessibility Baseline

| Term | What it is | Use when | Avoid when | Guardrail |
|---|---|---|---|---|
| **Semantic landmarks** | `header`, `nav`, `main`, `footer`, labeled `section` | Always | — | One `main`; labeled repeated landmarks |
| **Visible focus ring** | High-contrast focus indicator | Always | `outline: none` without replacement | ≥3:1 contrast, not obscured (WCAG 2.4.7, 2.4.11) |
| **Skip link** | First-focusable "Skip to content" | Pages with repeated header nav | — | Visible on focus |
| **Keyboard parity** | Every pointer function works by keyboard | Always | — | Logical tab order; no traps (WCAG 2.1.1) |
| **Reduced motion** | Honor `prefers-reduced-motion` | Any motion | — | Substitute, don't just disable meaning (WCAG 2.3.3) |
| **Contrast AA** | 4.5:1 text, 3:1 large text/UI | Always | — | Test every pair, including states |
| **Alt text strategy** | Informative alt, empty alt for decoration | All images | Redundant "image of" | Describe purpose, not appearance |
| **Target size (WCAG 2.2 2.5.8)** | ≥24×24 CSS px minimum targets | Always | — | Aim for 44px |
| **Heading structure** | One `h1`, no skipped levels | Always | Styling-driven headings | Style via CSS, not heading level |
| **Form accessibility** | Programmatic labels, errors, autocomplete | All forms | — | Errors identified in text (WCAG 3.3.1) |

## 17. Content Hierarchy & Scanning

| Term | What it is | Use when | Avoid when | Guardrail |
|---|---|---|---|---|
| **F-pattern** | Scan across top then down left (NN/g) | Text-heavy pages, lists, search results | Visual-led pages | Front-load key words; left-align |
| **Z-pattern** | Scan top-left → top-right → diagonal → bottom | Sparse landing pages with one CTA | Dense content | CTA at the terminus |
| **Inverted pyramid** | Conclusion first, detail after | News, docs, summaries | Narrative storytelling | Key point in first paragraph |
| **Progressive disclosure** | Show essentials, reveal detail on demand | Complex or optional detail | Required info | Disclosure is discoverable and keyboard operable |
| **Visual weight hierarchy** | Size, contrast, position rank P0/P1/P2 | Every page | Everything emphasized | One P0 per viewport |
| **Proximity / Gestalt grouping** | Closeness, similarity, enclosure show relation | Every layout | Borders on everything | Space between groups > within groups |
| **Whitespace rhythm (8-pt spacing scale)** | Spacing from 4/8/16/24/32/48/64 steps | Every system | Arbitrary spacing | Tokens only |
| **Above the fold priority** | Value, audience, action visible first | Every landing page | Overloading | Primary CTA visible at 390×844 and 1440×900 |
| **Chunking** | Break content into labeled groups | Long content | — | Descriptive headings |

## Combination Rules

- One dominant motion mechanic per page; everything else stays baseline (Fade-in reveal, Micro-interaction).
- Sticky + Scroll Snap only with a clear escape (proximity snapping, release at container end).
- Horizontal Scroll needs a vertical fallback on mobile and keyboard operation.
- Parallax, Scroll-linked, Scrollytelling, Media scrub, and Kinetic type are off or static under reduced motion.
- Glassmorphism requires a contrast check on the worst background; avoid under body text.
- Carousel is never used for primary content or key messages.
- Infinite scroll always pairs with Load more or a reachable footer.
- Every motion term must name its Reduced-motion alternative.
- Dark mode/Light mode needs per-theme contrast verification, not inversion.
- Every term in a selection table must be implementable without inventing assets, data, or proof.
