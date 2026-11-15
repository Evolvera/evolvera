# AI aesthetics checklist

The visual checklist of what gives a screen the "AI look". For each item: **the signal**, the **signature CSS**, the **fix** and **when it is legitimate**. The visual version (slop → fix pairs) is in `gallery.html`; the full catalogue, with more signals in categories, is in `catalog.md`.

Go through this list **on every screen**, the one that exists and the one you just built.

---

## 1. Gradient on everything

- **Signal:** backgrounds, buttons, text and even borders in gradient, each with a different one.
- **Signature CSS:** `background: linear-gradient(...)` spread over several elements; `background-clip: text` with a gradient.
- **Fix:** solid colour as the base; **one** gradient at most, and only where it tells something (a state transition, real depth).
- **Legitimate when:** the gradient encodes a change in data (a level going from "ok" to "attention") or is tonal, within one colour, to give volume (see *Finish* in `craft.md`).

## 2. Glow on everything (not glow itself)

- **Signal:** soft glow spread over buttons, cards, avatars and text: an aura with no light source, across the screen.
- **Signature CSS:** `box-shadow: 0 0 24px rgba(<colour>, .4)` on several elements; `filter: drop-shadow(0 0 8px ...)`.
- **Fix:** glow at **one point** (the light that matters), with a clear light source; elsewhere a thin outline or a short realistic shadow. The problem is "on everything", not the glow.
- **Legitimate when:** the element really emits light (LED, sun, alert) or the glow is the focal point of a thematic effect (a star, a comet). One well-placed glow passes; three is slop.

## 3. Frosted glass (glassmorphism) with no function

- **Signal:** `backdrop-filter: blur()` on cards, modals and bars, for no reason other than looking "modern".
- **Signature CSS:** `background: rgba(255,255,255,.1); backdrop-filter: blur(20px)` over a flat background, with a white border and glow.
- **Fix:** glass only when there is content behind and the layer has a function (floating nav, sheet, modal, HUD). If the background is flat, use solid. Real glass = blur + saturation + edge light + transparency that lets the background show; recipe and limits in `glass.md`.
- **Legitimate when:** real content scrolls behind, the layer separates planes and text stays legible on the worst background. Decorative glass over a gradient is slop; glass with refraction and visible content is craft.

## 4. Same shadow and radius on everything

- **Signal:** every card with the same radius (16 px) and the same long shadow, a "mass-produced" look.
- **Signature CSS:** a single `border-radius` and `box-shadow` value copied to every component.
- **Fix:** radii on a scale (inner = outer minus the spacing between them); shadow only on what floats above another surface.
- **Legitimate when:** it is a family of components that really share the same surface.

## 5. Icons in a tinted square

- **Signal:** every icon inside a small rounded square with a coloured background: a "chip" that groups nothing.
- **Signature CSS:** `.icon { width:40px; height:40px; border-radius:10px; background:<colour>; }`.
- **Fix:** a bare icon in the text colour; a container only when the icon is the identity of an item (avatar, logo).
- **Legitimate when:** the square is the "face" of the item (a brand logo, an avatar).

## 6. Pills with no meaning

- **Signal:** coloured chips/pills that label obvious things or do nothing ("group", "new", "online").
- **Signature CSS:** `border-radius: 999px` with a coloured background on labels that are not a state.
- **Fix:** a pill only when it carries a real state (a status, an active filter); otherwise plain text.
- **Legitimate when:** the pill is a clickable state (selected filter) or a data badge (a category).

## 7. Everything centred

- **Signal:** titles, paragraphs and buttons centred "by default", with no alignment decision.
- **Signature CSS:** `text-align: center` on everything, including lists and long paragraphs.
- **Fix:** left-align for reading; centre only the hero or a short empty state.
- **Legitimate when:** it is an empty state, a one-line hero title, a dialog.

## 8. Decorated charts

- **Signal:** a pie/donut/line chart with gradient, shadow and legend for data that fits in a sentence or a number.
- **Signature CSS:** SVG with gradients + `drop-shadow` + a "count up" animation.
- **Fix:** if the data is a sentence, write the sentence. If it is a number, show the number. A chart only when there is a comparison or evolution to show.
- **Legitimate when:** there is more than one series to compare and the shape reveals the relation.

## 9. Fade-up on everything / looping shimmer

- **Signal:** every section enters with fade + slide on scroll; a glow pulsing on a placeholder; a gradient shimmer that never stops.
- **Signature CSS:** a fade-up `animation` on every block; shimmer `@keyframes` with infinite `background-position`.
- **Fix:** movement with a cause (see `motion.md`). No opening animation; shimmer only during real loading.
- **Legitimate when:** the shimmer represents real loading; the fade marks a state change.

## 10. Blurred colour blobs

- **Signal:** blurred coloured stains in the background to "fill" the screen.
- **Signature CSS:** `filter: blur(80px)` on coloured circles positioned behind the content.
- **Fix:** a flat background (the project's canvas colour). If atmosphere is needed, use subtle texture, not a blob.
- **Legitimate when:** the blob is a real light/ambience that the product can reproduce.

## 11. Mirrored layout (the same everywhere)

- **Signal:** sections with the same card structure repeated ("3 cards + button", "hero + 3 columns"), with no change of rhythm.
- **Signature CSS:** the same grid copied section after section.
- **Fix:** vary the rhythm (one wide section, one with two columns, one list); the repetition is the slop.
- **Legitimate when:** it is a list/grid of truly homogeneous data.

## 12. Confetti / decoration with no cause

- **Signal:** confetti, particles, parallax and decorative sparkles that respond to nothing.
- **Fix:** remove. Decoration enters only if it responds to an action or state (celebrating a real goal).
- **Legitimate when:** there is a real event to celebrate.

---

## How to use the checklist

1. Go item by item on the screen (old or new), skipping what is under *Checklist exceptions* in the project's `taste.md`.
2. For each signal found, point to **where** it appears.
3. Fix or justify (some are legitimate in context).
4. Check again in the **second check**: the new design picks up slop too.
