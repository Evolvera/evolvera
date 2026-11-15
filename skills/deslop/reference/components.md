# Product components without the AI look

Component anatomy for app screens (dashboard, panel, chat, table), not for landing pages. It complements `sources.md`: the sites are there; here is **how the component is organised** so it does not look like a template.

> Main reference: [BoardUI](https://www.boardui.com), a React design system with 103 components, 19 charts and tokens for dashboards and agent interfaces. What is taken is the **structure, behaviour and states**. The default aesthetic (neutral grey + Inter + equal corners) is the "shadcn look" from `catalog.md`: if the project's identity is different, change the skin and keep the skeleton.

## Rule of use

- Copy **anatomy** (what exists, in what order, with what weight), not pixels.
- Every component comes from `recipes.md`: colour, type, radius, shadow and space from the identity.
- Before creating a component, check whether it already exists on another screen (see *Consistency across screens* in `SKILL.md`).
- State is part of the component: empty, loading, error, success. A component with no state is a mock-up.

---

## Data table

The piece where slop shows most: everything with the same weight, decorative status and a repeated action.

**Anatomy that works**
1. **Header with the total:** "48 clients", not "Total results" alone.
2. **Filters before the table**, in the order the person decides: search → status filter → period. A discreet "clear" when a filter is active.
3. **Identity column** (name + avatar/initial) first; numbers right-aligned with tabular figures.
4. **Status as short text**, with colour only when the state really changes. Never a coloured pill on every row.
5. **Row actions** discreet and at the end; the main action stays in the bar, not repeated on each row.
6. **Explicit pagination** with the current range ("1–20 of 48").

**Discard:** zebra + border + shadow together, an icon in every column, an "active" badge on everything, a filled button per row, a clickable row that does not look clickable.

## Metric tile

**Anatomy that works:** big number (the data leads) → short label below → comparison with period and direction (↑ 14.8% vs. last month) → one sentence of context when it helps to act. One tile = one question.

**Discard:** a giant number with a tiny label and no context; a gradient on the number; three identical tiles just to fill the first fold.

## Chart card

**Anatomy that works:** a title that says what the chart answers → period selector (day/week/month/year) → chart → short legend → a reading of the data ("peak in March"). One card, one question.

**Discard:** a decorative donut/ring, a fill gradient with no meaning, axes with no unit, a tooltip that repeats the label, a "playful widget" (streak, activity ring) when it is not the product.

## Agent interface (chat / AI panel)

**Anatomy that works**
- **Composer** with attachment, model and send in the same place; explicit sending state.
- **Progress by step** with name and state (done / in progress / failed), not a generic spinner.
- **Source consulted** appears next to the answer, not hidden behind an icon.
- **Cost/limit** (tokens, context, plan) in the language of use, not of infrastructure.
- **Stop** always available while the agent works.

**Discard:** "Agent thinking…" with three eternal dots, an iridescent glow around the composer, "online" badges that never change, an emoji in place of a state.

## Form and upload

**Anatomy that works:** label always visible (not placeholder only) → field → short help → error on the field, with the cause and what to do. Upload accepts drag, shows the accepted type/size beforehand and per-file progress afterwards.

**Discard:** validation only on submit, an error in a banner at the top without pointing to the field, a generic cloud icon, "Uploading…" with no progress.

## Navigation / sidebar

**Anatomy that works:** groups with a short title, the active item with contrast (not colour alone), search when there are many items, account/settings at the bottom. A badge only when there is a count that changes.

**Discard:** an icon in a square for every item, an active item with glow, a sidebar with a card inside, a blinking "New".

## Empty, loading and error states

- **Empty:** say what appears there and the action to create the first item. No mascot illustration, no "Oops!".
- **Loading:** a skeleton with the shape of the real content (not a generic bar) and no coloured shimmer.
- **Error:** what failed, why and what to do; preserve what the person typed.
- **Content that depends on animation:** visible by default; the animation only improves, never reveals.

## Quick checks per component

- Does the component answer **one** question?
- Does the main data weigh more than the label?
- Is there an empty/loading/error state?
- Does colour appear only when the data asks for it?
- Does the main action appear once, in the right place?
- Does the component use the tokens in `recipes.md` (colour, type, space, radius)?
